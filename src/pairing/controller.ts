import {systemMonotonicClock, type MonotonicClock} from '../clock.js';
import {featureFlags} from '../config/feature-flags.js';
import {qrConfig} from '../config/qr-config.js';
import {QrPairingError, type PairingErrorCode} from '../errors.js';
import {createParts, PartAssembler, type CreatePartsOptions} from '../qr/courier.js';
import {
  parseEnvelope,
  requireIdentifier,
  type QrEnvelopeV1,
  type QrErrorCorrectionLevel
} from '../qr/envelope.js';
import {createQrSvg} from '../qr/svg.js';
import {
  DEFAULT_TIMEOUT_SECONDS,
  MAX_ACTIVE_SESSIONS,
  MAX_TIMEOUT_SECONDS,
  MIN_TIMEOUT_SECONDS,
  TICK_INTERVAL_MS
} from './limits.js';
import {
  isTerminalPhase,
  type PairingPhase,
  type PairingProgress,
  type PairingReadResult,
  type PairingRole,
  type PairingSessionState
} from './types.js';
import {TemporarySpriteSkinManager, type DisplayPort} from '../ports/display.js';
import {CameraQrScanner, type QrScanPort} from '../ports/qr-scan.js';
import {requireWebRtcPairingPort, type WebRtcPairingPort} from '../ports/webrtc.js';

export interface PairingControllerOptions {
  readonly runtime?: TurboWarpRuntime;
  readonly enabled?: boolean;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  /** Largest QR version a part may use. Defaults to the startup QR config. */
  readonly maxVersion?: number;
  /** Injected in tests. Production resolves the runtime capability lazily. */
  readonly webrtc?: WebRtcPairingPort;
  readonly display?: DisplayPort;
  readonly scan?: QrScanPort;
  readonly clock?: MonotonicClock;
  /** Wall clock used only for the diagnostic `createdAt` field. */
  readonly now?: () => number;
}

/**
 * Errors that only mean "that was not our QR code".
 *
 * A camera pointed at a projection also sees posters, other sessions, and the
 * previous exchange's codes, so scanning skips these and keeps looking. Damage
 * to a code that does belong to this exchange is not in this set: that is
 * reported, because silently retrying would hide a real problem.
 */
const skippableWhileScanning = new Set<PairingErrorCode>([
  'invalid-json',
  'unsupported-protocol',
  'invalid-envelope',
  'part-too-large',
  'index-out-of-range',
  'message-too-large',
  'unexpected-kind',
  'stale-exchange',
  'peer-mismatch',
  'reply-mismatch',
  'message-mismatch'
]);

const idlePhase: PairingPhase = 'idle';

/**
 * Drives one QR-carried offer/answer exchange per session key.
 *
 * The controller owns no display and no camera: it turns pairing codes into QR
 * texts, accepts decoded texts back, and hands verified codes to WebRTC exactly
 * once. Display and scanning adapters build on top of it.
 */
export class PairingController {
  private readonly runtime: TurboWarpRuntime;
  private readonly enabled: boolean;
  private readonly errorCorrectionLevel: QrErrorCorrectionLevel;
  private readonly maxVersion: number;
  private readonly injectedWebRtc: WebRtcPairingPort | undefined;
  private readonly injectedDisplay: DisplayPort | undefined;
  private readonly injectedScan: QrScanPort | undefined;
  private readonly clock: MonotonicClock;
  private readonly now: () => number;
  private readonly sessions = new Map<string, PairingSessionState>();
  private lazyDisplay: DisplayPort | undefined;
  private lazyScan: QrScanPort | undefined;
  private activeScans = 0;

  public constructor(options: PairingControllerOptions = {}) {
    this.runtime = options.runtime ?? Scratch.vm?.runtime ?? {};
    this.enabled = options.enabled ?? featureFlags.qrCodePairing;
    this.errorCorrectionLevel = options.errorCorrectionLevel ?? qrConfig.errorCorrectionLevel;
    this.maxVersion = options.maxVersion ?? qrConfig.maxVersion;
    this.injectedWebRtc = options.webrtc;
    this.injectedDisplay = options.display;
    this.injectedScan = options.scan;
    this.clock = options.clock ?? systemMonotonicClock;
    this.now = options.now ?? (() => Date.now());
  }

  // --- Starting an exchange -------------------------------------------------

  /** Hub side: create an offer and prepare its QR parts. */
  public async startOfferPairing(input: {
    sessionKey: string;
    localPeerId: string;
    remotePeerId: string;
  }): Promise<void> {
    this.requireEnabled();
    const sessionKey = requireSessionKey(input.sessionKey);
    if (this.sessions.has(sessionKey)) {
      throw new QrPairingError('session-exists', `Pairing session ${sessionKey} is already open.`);
    }
    this.requireCapacity();
    const localPeerId = requireIdentifier(input.localPeerId.trim(), 'local peer name');
    const remotePeerId = requireIdentifier(input.remotePeerId.trim(), 'remote peer name');

    const session = this.createSession({
      sessionKey,
      role: 'hub',
      expectedLocalPeerId: localPeerId,
      localPeerId,
      remotePeerId
    });
    this.sessions.set(sessionKey, session);
    await this.runOfferExchange(session);
  }

  /**
   * Camera side: wait for an offer.
   *
   * `expectedLocalPeerId` may be empty, in which case this device adopts the
   * name the offer assigns to it. A non-empty value is verified instead, which
   * catches an operator scanning the wrong projection.
   */
  public startAnswerPairing(input: {sessionKey: string; expectedLocalPeerId: string}): void {
    this.requireEnabled();
    const sessionKey = requireSessionKey(input.sessionKey);
    if (this.sessions.has(sessionKey)) {
      throw new QrPairingError('session-exists', `Pairing session ${sessionKey} is already open.`);
    }
    this.requireCapacity();
    const expectedLocalPeerId = input.expectedLocalPeerId.trim();
    if (expectedLocalPeerId !== '') requireIdentifier(expectedLocalPeerId, 'local peer name');

    const session = this.createSession({
      sessionKey,
      role: 'camera',
      expectedLocalPeerId,
      localPeerId: expectedLocalPeerId,
      remotePeerId: ''
    });
    session.phase = 'awaiting-offer';
    this.sessions.set(sessionKey, session);
    this.scheduleTick(session);
  }

  // --- Receiving -----------------------------------------------------------

  /**
   * Accepts one decoded QR text. When the last part arrives, the reassembled
   * code is verified and handed to WebRTC once.
   */
  public async ingestQrText(sessionKey: string, text: string): Promise<void> {
    this.requireEnabled();
    const session = this.requireSession(sessionKey);
    if (isTerminalPhase(session.phase)) {
      throw new QrPairingError(
        session.phase === 'connected' ? 'already-accepted' : 'stale-exchange',
        `Pairing session ${session.sessionKey} is no longer receiving parts.`
      );
    }
    // A code that is not a pairing code at all throws here and is not reported.
    const envelope = parseEnvelope(text);
    const part = `${envelope.partIndex + 1} / ${envelope.partCount}`;
    try {
      this.verifyEnvelope(session, envelope);
    } catch (error) {
      this.noteRead(session, 'foreign', codeOf(error));
      throw error;
    }
    if (session.delivered) {
      this.noteRead(session, 'duplicate', part);
      throw new QrPairingError(
        'already-accepted',
        'The pairing code for this exchange has already been accepted.'
      );
    }
    if (session.role === 'camera' && session.exchangeId === '') this.adoptOffer(session, envelope);

    let accepted: ReturnType<PartAssembler['add']>;
    try {
      accepted = session.assembler.add(envelope);
    } catch (error) {
      // A part of another split of the message is ignored. A part that contradicts
      // one already held is damage to this exchange, and fails it below.
      if (codeOf(error) === 'message-mismatch') this.noteRead(session, 'foreign', 'message-mismatch');
      throw error;
    }
    this.noteRead(session, accepted.duplicate ? 'duplicate' : 'accepted', part);
    if (!isTerminalPhase(session.phase)) {
      session.phase = session.role === 'hub' ? 'awaiting-answer' : 'receiving';
    }
    if (!session.assembler.isComplete()) return;

    const epoch = session.epoch;
    let message: string;
    try {
      message = await session.assembler.assemble();
    } catch (error) {
      if (!this.isStale(session, epoch)) this.failFrom(session, error);
      throw error;
    }
    if (this.isStale(session, epoch)) return;

    session.incomingMessageId = envelope.messageId;
    session.phase = session.role === 'hub' ? 'answer-received' : 'offer-received';
    session.delivered = true;
    if (session.role === 'hub') {
      await this.acceptAnswer(session, message, epoch);
    } else {
      await this.acceptOfferAndPrepareAnswer(session, message, epoch);
    }
  }

  /** Records what a pairing code turned out to be, for the application to show. */
  private noteRead(
    session: PairingSessionState,
    result: Exclude<PairingReadResult, ''>,
    detail: string
  ): void {
    session.readCount += 1;
    session.lastRead = result;
    session.lastReadDetail = detail;
  }

  // --- Outgoing parts ------------------------------------------------------

  /** Selects the one-based part to display and returns its SVG. */
  public selectPart(sessionKey: string, oneBasedIndex: number): string {
    const session = this.requireSession(sessionKey);
    const total = session.outgoingSvgs.length;
    if (total === 0) {
      throw new QrPairingError('no-session', 'No QR parts have been prepared yet.');
    }
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1 || oneBasedIndex > total) {
      throw new QrPairingError(
        'invalid-argument',
        `QR part index must be between 1 and ${total}.`
      );
    }
    session.outgoingCurrentIndex = oneBasedIndex - 1;
    return session.outgoingSvgs[session.outgoingCurrentIndex] ?? '';
  }

  /** Advances to the next part, wrapping from the last part to the first. */
  public selectNextPart(sessionKey: string): string {
    const session = this.requireSession(sessionKey);
    const total = session.outgoingSvgs.length;
    if (total === 0) {
      throw new QrPairingError('no-session', 'No QR parts have been prepared yet.');
    }
    return this.selectPart(sessionKey, ((session.outgoingCurrentIndex + 1) % total) + 1);
  }

  public partSvg(sessionKey: string, oneBasedIndex: number): string {
    const session = this.requireSession(sessionKey);
    return session.outgoingSvgs[oneBasedIndex - 1] ?? '';
  }

  public partText(sessionKey: string, oneBasedIndex: number): string {
    const session = this.requireSession(sessionKey);
    return session.outgoing?.texts[oneBasedIndex - 1] ?? '';
  }

  // --- Display -------------------------------------------------------------

  /** Shows the one-based part on the supplied sprite, keeping its original skin. */
  public showPart(
    sessionKey: string,
    oneBasedIndex: number,
    target: TurboWarpTarget | undefined
  ): void {
    const session = this.requireSession(sessionKey);
    const svg = this.selectPart(sessionKey, oneBasedIndex);
    session.displayTargets.add(this.display().show(target, svg));
  }

  public showNextPart(sessionKey: string, target: TurboWarpTarget | undefined): void {
    const session = this.requireSession(sessionKey);
    const svg = this.selectNextPart(sessionKey);
    session.displayTargets.add(this.display().show(target, svg));
  }

  /** Restores the sprites this session changed. The session itself stays open. */
  public endDisplay(sessionKey: string): void {
    this.releaseDisplay(this.requireSession(sessionKey));
  }

  /** Called when the runtime removes a sprite, so its skin is not restored onto nothing. */
  public handleTargetRemoved(target: TurboWarpTarget): void {
    for (const session of this.sessions.values()) {
      if (!session.displayTargets.delete(target)) continue;
      this.display().releaseTarget(target);
    }
  }

  // --- Scanning ------------------------------------------------------------

  /**
   * Reads parts from a camera until the exchange has everything it needs.
   *
   * Codes that belong to something else are skipped rather than reported: a
   * camera aimed at a projection also sees whatever else is in frame.
   */
  public async scanFromCamera(sessionKey: string, cameraId: string): Promise<void> {
    this.requireEnabled();
    const session = this.requireSession(sessionKey);
    const camera = cameraId.trim() || 'default';
    if (session.scanAbort) {
      throw new QrPairingError(
        'invalid-argument',
        `Pairing session ${session.sessionKey} is already scanning.`
      );
    }
    const epoch = session.epoch;
    const abort = new AbortController();
    session.scanAbort = abort;
    this.activeScans += 1;
    const scan = this.scanner();
    try {
      while (!this.isStale(session, epoch) && !isTerminalPhase(session.phase)) {
        if (session.delivered) return;
        const text = await scan.scanOnce({cameraId: camera, signal: abort.signal});
        if (this.isStale(session, epoch)) return;
        try {
          await this.ingestQrText(sessionKey, text);
        } catch (error) {
          if (!(error instanceof QrPairingError) || !skippableWhileScanning.has(error.code)) {
            throw error;
          }
        }
      }
    } catch (error) {
      // Cancelling or expiring the session aborts the scan; that is not a failure.
      if (error instanceof QrPairingError && error.code === 'cancelled') return;
      throw error;
    } finally {
      if (session.scanAbort === abort) session.scanAbort = undefined;
      this.activeScans -= 1;
      if (this.activeScans === 0) await scan.release();
    }
  }

  // --- Control -------------------------------------------------------------

  public cancelPairing(sessionKey: string): void {
    const session = this.sessions.get(requireSessionKey(sessionKey));
    if (!session) return;
    this.finish(session, 'cancelled', '', '');
  }

  /** Cancels the current exchange and starts a new one with a fresh exchange ID. */
  public async retryPairing(sessionKey: string): Promise<void> {
    this.requireEnabled();
    const session = this.requireSession(sessionKey);
    this.finish(session, 'cancelled', '', '');
    this.resetSession(session);
    if (session.role === 'hub') {
      await this.runOfferExchange(session);
    } else {
      session.phase = 'awaiting-offer';
      this.scheduleTick(session);
    }
  }

  public setTimeoutSeconds(sessionKey: string, seconds: number): void {
    const session = this.requireSession(sessionKey);
    if (!Number.isFinite(seconds) || seconds < MIN_TIMEOUT_SECONDS || seconds > MAX_TIMEOUT_SECONDS) {
      throw new QrPairingError(
        'invalid-argument',
        `Pairing timeout must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds.`
      );
    }
    session.timeoutMilliseconds = Math.floor(seconds * 1000);
  }

  // --- Observation ---------------------------------------------------------

  public progress(sessionKey: string): PairingProgress {
    const session = this.sessions.get(sessionKey.trim());
    if (!session) {
      return {
        phase: this.enabled ? idlePhase : 'disabled',
        role: 'hub',
        sessionKey: sessionKey.trim(),
        exchangeId: '',
        localPeerId: '',
        remotePeerId: '',
        outgoingPartCount: 0,
        outgoingCurrentPart: 0,
        receivedParts: 0,
        requiredParts: 0,
        missingParts: [],
        connectionState: '',
        errorCode: '',
        errorMessage: '',
        remainingSeconds: 0,
        readCount: 0,
        lastRead: '',
        lastReadDetail: ''
      };
    }
    const elapsed = this.clock.nowMilliseconds() - session.startedAtMonotonic;
    const remaining = Math.max(0, session.timeoutMilliseconds - elapsed);
    return {
      phase: this.enabled ? session.phase : 'disabled',
      role: session.role,
      sessionKey: session.sessionKey,
      exchangeId: session.exchangeId,
      localPeerId: session.localPeerId,
      remotePeerId: session.remotePeerId,
      outgoingPartCount: session.outgoingSvgs.length,
      outgoingCurrentPart: session.outgoingCurrentIndex + 1,
      receivedParts: session.assembler.receivedCount(),
      requiredParts: session.assembler.requiredCount(),
      missingParts: session.assembler.missingParts().map((index) => index + 1),
      connectionState: session.peerCreated ? this.readConnectionState(session) : '',
      errorCode: session.errorCode,
      errorMessage: session.errorMessage,
      remainingSeconds: isTerminalPhase(session.phase) ? 0 : Math.ceil(remaining / 1000),
      readCount: session.readCount,
      lastRead: session.lastRead,
      lastReadDetail: session.lastReadDetail
    };
  }

  public sessionKeys(): readonly string[] {
    return [...this.sessions.keys()];
  }

  public isConnected(sessionKey: string): boolean {
    return this.sessions.get(sessionKey.trim())?.phase === 'connected';
  }

  /** Resolves on connection, rejects on failure, cancellation, or expiry. */
  public waitUntilConnected(sessionKey: string): Promise<void> {
    const session = this.requireSession(sessionKey);
    if (session.phase === 'connected') return Promise.resolve();
    if (isTerminalPhase(session.phase)) return Promise.reject(this.terminalError(session));
    return new Promise<void>((resolve, reject) => {
      session.waiters.push({resolve, reject});
    });
  }

  // --- Lifecycle -----------------------------------------------------------

  /**
   * Project run stop. Cancels exchanges in progress and releases what this
   * controller owns. Established connections stay up: closing them is the
   * application's explicit decision.
   */
  public stopTransient(): void {
    for (const session of [...this.sessions.values()]) {
      if (session.phase === 'connected') {
        this.clearTimer(session);
        session.scanAbort?.abort();
        this.releaseDisplay(session);
        continue;
      }
      this.finish(session, 'cancelled', '', '');
    }
    void this.releaseScanner();
  }

  /** Runtime disposal. Drops every session and its retained state. */
  public dispose(): void {
    for (const session of [...this.sessions.values()]) {
      this.finish(session, 'cancelled', '', '');
    }
    this.sessions.clear();
    this.lazyDisplay?.releaseAll();
    void this.releaseScanner();
  }

  // --- Internals -----------------------------------------------------------

  private async runOfferExchange(session: PairingSessionState): Promise<void> {
    const epoch = session.epoch;
    session.phase = 'creating-offer';
    this.scheduleTick(session);
    try {
      const webrtc = this.webrtc();
      const created = await webrtc.createOffer(session.remotePeerId);
      if (this.isStale(session, epoch)) return;
      session.peerCreated = true;
      const code = created || webrtc.getOffer(session.remotePeerId);
      if (!code) {
        throw new QrPairingError(
          'webrtc-rejected',
          'TurboWarp WebRTC did not return an offer pairing code.'
        );
      }
      const parts = await createParts(code, this.partOptions(session, 'offer'));
      if (this.isStale(session, epoch)) return;
      this.attachOutgoing(session, parts);
      session.phase = 'offer-ready';
    } catch (error) {
      if (!this.isStale(session, epoch)) this.failFrom(session, error);
      throw error;
    }
  }

  private async acceptAnswer(
    session: PairingSessionState,
    message: string,
    epoch: number
  ): Promise<void> {
    try {
      const webrtc = this.webrtc();
      await webrtc.acceptAnswer(session.remotePeerId, message);
      if (this.isStale(session, epoch)) return;
      session.phase = 'connecting';
      this.scheduleTick(session);
    } catch (error) {
      if (!this.isStale(session, epoch)) this.failFrom(session, error);
      throw error;
    }
  }

  private async acceptOfferAndPrepareAnswer(
    session: PairingSessionState,
    message: string,
    epoch: number
  ): Promise<void> {
    session.phase = 'creating-answer';
    try {
      const webrtc = this.webrtc();
      const created = await webrtc.acceptOffer(session.remotePeerId, message);
      if (this.isStale(session, epoch)) return;
      session.peerCreated = true;
      const code = created || webrtc.getAnswer(session.remotePeerId);
      if (!code) {
        throw new QrPairingError(
          'webrtc-rejected',
          'TurboWarp WebRTC did not return an answer pairing code.'
        );
      }
      const parts = await createParts(code, this.partOptions(session, 'answer'));
      if (this.isStale(session, epoch)) return;
      this.attachOutgoing(session, parts);
      session.phase = 'answer-ready';
      this.scheduleTick(session);
    } catch (error) {
      if (!this.isStale(session, epoch)) this.failFrom(session, error);
      throw error;
    }
  }

  private partOptions(
    session: PairingSessionState,
    kind: 'offer' | 'answer'
  ): CreatePartsOptions {
    const common = {
      senderPeerId: session.localPeerId,
      targetPeerId: session.remotePeerId,
      errorCorrectionLevel: this.errorCorrectionLevel,
      maxVersion: this.maxVersion,
      createdAt: this.now()
    };
    return kind === 'offer'
      ? {...common, kind}
      : {...common, kind, sessionId: session.exchangeId, replyTo: session.incomingMessageId};
  }

  private attachOutgoing(
    session: PairingSessionState,
    parts: Awaited<ReturnType<typeof createParts>>
  ): void {
    session.outgoing = parts;
    session.outgoingSvgs = parts.texts.map((text) =>
      createQrSvg(text, this.errorCorrectionLevel)
    );
    session.outgoingCurrentIndex = -1;
    session.exchangeId = parts.sessionId;
    session.outgoingMessageId = parts.messageId;
  }

  /**
   * Checks that a part belongs to this exchange, this role, and this peer pair
   * before any of it reaches the assembler.
   */
  private verifyEnvelope(session: PairingSessionState, envelope: QrEnvelopeV1): void {
    const expectedKind = session.role === 'hub' ? 'answer' : 'offer';
    if (envelope.kind !== expectedKind) {
      throw new QrPairingError(
        'unexpected-kind',
        `This session expects ${expectedKind} parts.`
      );
    }
    if (session.role === 'hub') {
      if (envelope.sessionId !== session.exchangeId) {
        throw new QrPairingError(
          'stale-exchange',
          'QR part belongs to a different pairing exchange.'
        );
      }
      if (envelope.replyTo !== session.outgoingMessageId) {
        throw new QrPairingError('reply-mismatch', 'QR part answers a different offer.');
      }
      if (
        envelope.senderPeerId !== session.remotePeerId ||
        envelope.targetPeerId !== session.localPeerId
      ) {
        throw new QrPairingError('peer-mismatch', 'QR part names a different pair of peers.');
      }
      return;
    }
    if (session.exchangeId !== '' && envelope.sessionId !== session.exchangeId) {
      throw new QrPairingError(
        'stale-exchange',
        'QR part belongs to a different pairing exchange.'
      );
    }
    if (session.expectedLocalPeerId !== '' && envelope.targetPeerId !== session.expectedLocalPeerId) {
      throw new QrPairingError('peer-mismatch', 'QR part is addressed to a different device.');
    }
    if (session.remotePeerId !== '' && envelope.senderPeerId !== session.remotePeerId) {
      throw new QrPairingError('peer-mismatch', 'QR part names a different sender.');
    }
  }

  /**
   * Adopts the peer naming the offer carries. The sender's name for itself
   * becomes this device's WebRTC peer key, so the two ends never need to be
   * configured with the same identifiers.
   */
  private adoptOffer(session: PairingSessionState, envelope: QrEnvelopeV1): void {
    session.exchangeId = envelope.sessionId;
    session.localPeerId = envelope.targetPeerId;
    session.remotePeerId = envelope.senderPeerId;
  }

  private createSession(input: {
    sessionKey: string;
    role: PairingRole;
    expectedLocalPeerId: string;
    localPeerId: string;
    remotePeerId: string;
  }): PairingSessionState {
    return {
      sessionKey: input.sessionKey,
      role: input.role,
      expectedLocalPeerId: input.expectedLocalPeerId,
      localPeerId: input.localPeerId,
      remotePeerId: input.remotePeerId,
      phase: idlePhase,
      epoch: 0,
      exchangeId: '',
      outgoingMessageId: '',
      incomingMessageId: '',
      outgoing: undefined,
      outgoingSvgs: [],
      outgoingCurrentIndex: -1,
      assembler: new PartAssembler(),
      delivered: false,
      peerCreated: false,
      timeoutMilliseconds: DEFAULT_TIMEOUT_SECONDS * 1000,
      startedAtMonotonic: this.clock.nowMilliseconds(),
      errorCode: '',
      errorMessage: '',
      tickTimer: undefined,
      displayTargets: new Set(),
      scanAbort: undefined,
      waiters: [],
      readCount: 0,
      lastRead: '',
      lastReadDetail: ''
    };
  }

  /** Prepares an existing session entry for a new exchange after a retry. */
  private resetSession(session: PairingSessionState): void {
    session.epoch += 1;
    session.phase = idlePhase;
    session.exchangeId = '';
    session.outgoingMessageId = '';
    session.incomingMessageId = '';
    session.outgoing = undefined;
    session.outgoingSvgs = [];
    session.outgoingCurrentIndex = -1;
    session.assembler = new PartAssembler();
    session.delivered = false;
    session.peerCreated = false;
    session.startedAtMonotonic = this.clock.nowMilliseconds();
    session.errorCode = '';
    session.errorMessage = '';
    session.scanAbort = undefined;
    session.readCount = 0;
    session.lastRead = '';
    session.lastReadDetail = '';
    if (session.role === 'camera') {
      session.localPeerId = session.expectedLocalPeerId;
      session.remotePeerId = '';
    }
  }

  private scheduleTick(session: PairingSessionState): void {
    if (session.tickTimer !== undefined) return;
    session.tickTimer = setTimeout(() => {
      session.tickTimer = undefined;
      this.tick(session);
    }, TICK_INTERVAL_MS);
  }

  private tick(session: PairingSessionState): void {
    if (this.sessions.get(session.sessionKey) !== session) return;
    if (isTerminalPhase(session.phase)) return;
    const elapsed = this.clock.nowMilliseconds() - session.startedAtMonotonic;
    if (elapsed >= session.timeoutMilliseconds) {
      this.finish(session, 'expired', 'timeout', 'The pairing exchange timed out.');
      return;
    }
    if (session.peerCreated) {
      const state = this.readConnectionState(session);
      if (state === 'connected') {
        this.finish(session, 'connected', '', '');
        return;
      }
      if (state === 'failed' || state === 'closed') {
        this.finish(
          session,
          'failed',
          'webrtc-rejected',
          'WebRTC reported that the connection could not be established.'
        );
        return;
      }
    }
    this.scheduleTick(session);
  }

  /**
   * Moves a session to a terminal phase and releases what it owns.
   *
   * Everything but an established RTCPeerConnection is released: timers, the
   * receive buffer, and the peer connection when it never connected.
   */
  private finish(
    session: PairingSessionState,
    phase: PairingPhase,
    errorCode: PairingErrorCode | '',
    errorMessage: string
  ): void {
    if (isTerminalPhase(session.phase) && session.phase !== 'connected') return;
    const connected = phase === 'connected';
    session.epoch += 1;
    session.phase = phase;
    session.errorCode = errorCode;
    session.errorMessage = errorMessage;
    this.clearTimer(session);
    session.scanAbort?.abort();
    this.releaseDisplay(session);
    if (!connected) {
      session.assembler.clear();
      if (session.peerCreated) {
        try {
          this.webrtc().closePeer(session.remotePeerId);
        } catch {
          // The capability may be gone during teardown; nothing else to release.
        }
        session.peerCreated = false;
      }
    }
    const waiters = session.waiters.splice(0, session.waiters.length);
    for (const waiter of waiters) {
      if (connected) waiter.resolve();
      else waiter.reject(this.terminalError(session));
    }
  }

  private failFrom(session: PairingSessionState, error: unknown): void {
    const code: PairingErrorCode =
      error instanceof QrPairingError ? error.code : 'webrtc-rejected';
    const message = error instanceof Error ? error.message : 'Pairing failed.';
    this.finish(session, 'failed', code, message);
  }

  private terminalError(session: PairingSessionState): QrPairingError {
    if (session.phase === 'cancelled') {
      return new QrPairingError('cancelled', 'The pairing exchange was cancelled.');
    }
    if (session.phase === 'expired') {
      return new QrPairingError('timeout', 'The pairing exchange timed out.');
    }
    return new QrPairingError(
      session.errorCode === '' ? 'webrtc-rejected' : session.errorCode,
      session.errorMessage || 'The pairing exchange failed.'
    );
  }

  private clearTimer(session: PairingSessionState): void {
    if (session.tickTimer === undefined) return;
    clearTimeout(session.tickTimer);
    session.tickTimer = undefined;
  }

  private readConnectionState(session: PairingSessionState): string {
    try {
      return this.webrtc().connectionState(session.remotePeerId);
    } catch {
      return '';
    }
  }

  private async releaseScanner(): Promise<void> {
    if (this.activeScans > 0) return;
    await this.lazyScan?.release();
  }

  private releaseDisplay(session: PairingSessionState): void {
    if (session.displayTargets.size === 0) return;
    const display = this.display();
    for (const target of [...session.displayTargets]) display.releaseTarget(target);
    session.displayTargets.clear();
  }

  private webrtc(): WebRtcPairingPort {
    return this.injectedWebRtc ?? requireWebRtcPairingPort(this.runtime);
  }

  private display(): DisplayPort {
    this.lazyDisplay ??= this.injectedDisplay ?? new TemporarySpriteSkinManager(this.runtime);
    return this.lazyDisplay;
  }

  private scanner(): QrScanPort {
    this.lazyScan ??=
      this.injectedScan ?? new CameraQrScanner(this.runtime, 'webrtc-qrcode-pairing');
    return this.lazyScan;
  }

  private requireEnabled(): void {
    if (this.enabled) return;
    throw new QrPairingError(
      'feature-disabled',
      'QR code pairing is disabled. Enable it before the project starts.'
    );
  }

  private requireCapacity(): void {
    if (this.sessions.size < MAX_ACTIVE_SESSIONS) return;
    throw new QrPairingError(
      'session-limit',
      `At most ${MAX_ACTIVE_SESSIONS} pairing sessions can be open at once.`
    );
  }

  private requireSession(sessionKey: string): PairingSessionState {
    const session = this.sessions.get(requireSessionKey(sessionKey));
    if (!session) {
      throw new QrPairingError('no-session', `Pairing session ${sessionKey.trim()} is not open.`);
    }
    return session;
  }

  private isStale(session: PairingSessionState, epoch: number): boolean {
    return session.epoch !== epoch || this.sessions.get(session.sessionKey) !== session;
  }
}

function requireSessionKey(value: string): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key === '') {
    throw new QrPairingError('invalid-argument', 'Pairing session name must not be empty.');
  }
  return key;
}

/** The error code a failure carries, for reporting why a code was ignored. */
function codeOf(error: unknown): string {
  return error instanceof QrPairingError ? error.code : 'invalid-envelope';
}
