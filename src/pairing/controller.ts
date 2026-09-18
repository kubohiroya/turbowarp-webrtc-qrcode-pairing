import {systemMonotonicClock, type MonotonicClock} from '../clock.js';
import {featureFlags} from '../config/feature-flags.js';
import {qrConfig} from '../config/qr-config.js';
import {QrPairingError, type PairingErrorCode} from '../errors.js';
import type {AddOutcome, StructuredAppendRead} from '@kubohiroya/qrcode-structured-append';
import {
  createPairingCodes,
  PairingAssembler,
  readPairingMessage,
  type CreateCodesOptions,
  type PairingCodes
} from '../qr/courier.js';
import {
  requireIdentifier,
  type PairingMessage,
  type PairingMessageHeader,
  type QrErrorCorrectionLevel
} from '../qr/message.js';
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
import {CameraQrScanner, type QrRead, type QrScanPort} from '../ports/qr-scan.js';
import {requireWebRtcPairingPort, type WebRtcPairingPort} from '../ports/webrtc.js';

export interface PairingControllerOptions {
  readonly runtime?: TurboWarpRuntime;
  readonly enabled?: boolean;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  /** Largest QR version an offer code may use. Defaults to the startup QR config. */
  readonly offerMaxVersion?: number;
  /** Largest QR version an answer code may use. Defaults to the startup QR config. */
  readonly answerMaxVersion?: number;
  /** Injected in tests. Production resolves the runtime capability lazily. */
  readonly webrtc?: WebRtcPairingPort;
  readonly display?: DisplayPort;
  readonly scan?: QrScanPort;
  readonly clock?: MonotonicClock;
  /** Wall clock used only for the diagnostic `createdAt` field. */
  readonly now?: () => number;
}

/** Errors that mean the text is not a pairing message at all. They are not reported as reads. */
const unreportedCodes = new Set<PairingErrorCode>([
  'invalid-json',
  'unsupported-protocol',
  'invalid-envelope',
  'message-too-large'
]);

/**
 * Errors that only mean "that was not a code this exchange can use".
 *
 * A camera pointed at a projection also sees posters, other sessions, and the
 * previous exchange's codes, so scanning skips these and keeps looking. A
 * sequence that arrives damaged is in this set too: it has been dropped and
 * reported, and the codes are still being shown, so reading on collects it
 * again.
 */
const skippableWhileScanning = new Set<PairingErrorCode>([
  ...unreportedCodes,
  'unexpected-kind',
  'stale-exchange',
  'peer-mismatch',
  'reply-mismatch',
  'message-mismatch',
  'conflicting-part',
  'length-mismatch',
  'hash-mismatch'
]);

const idlePhase: PairingPhase = 'idle';

/**
 * Drives one QR-carried offer/answer exchange per session key.
 *
 * The controller owns no display and no camera: it turns pairing codes into
 * Structured Append QR sequences, accepts decoded codes back in any order, and
 * hands verified pairing codes to WebRTC exactly once. Display and scanning adapters build on top of it.
 */
export class PairingController {
  private readonly runtime: TurboWarpRuntime;
  private readonly enabled: boolean;
  private readonly errorCorrectionLevel: QrErrorCorrectionLevel;
  private readonly offerMaxVersion: number;
  private readonly answerMaxVersion: number;
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
    this.offerMaxVersion = options.offerMaxVersion ?? qrConfig.offerMaxVersion;
    this.answerMaxVersion = options.answerMaxVersion ?? qrConfig.answerMaxVersion;
    this.injectedWebRtc = options.webrtc;
    this.injectedDisplay = options.display;
    this.injectedScan = options.scan;
    this.clock = options.clock ?? systemMonotonicClock;
    this.now = options.now ?? (() => Date.now());
  }

  // --- Starting an exchange -------------------------------------------------

  /** Hub side: create an offer and prepare its pairing messages. */
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
   * Accepts one decoded QR code. The codes of a Structured Append sequence may
   * arrive in any order and any number of times; when the last one arrives,
   * the message is checked and its pairing code handed to WebRTC once.
   *
   * A lone code — one that is not part of a sequence — is read as a whole
   * message, the way `ingestQrText` reads one.
   *
   * Reads of one session are taken one at a time, in the order they came, so
   * two scripts feeding codes at once cannot both complete the message.
   */
  public async ingestQrRead(sessionKey: string, read: QrRead): Promise<void> {
    this.requireEnabled();
    const session = this.requireSession(sessionKey);
    return this.inTurn(session, () => this.takeRead(session, read));
  }

  /**
   * Accepts a whole pairing message as text, the way it would arrive through
   * something other than a camera, or in one QR code.
   */
  public async ingestQrText(sessionKey: string, text: string): Promise<void> {
    this.requireEnabled();
    const session = this.requireSession(sessionKey);
    return this.inTurn(session, () => this.takeText(session, text));
  }

  /** Runs `work` after every read of the session that came before it has finished. */
  private inTurn(session: PairingSessionState, work: () => Promise<void>): Promise<void> {
    const turn = session.readQueue.then(work);
    session.readQueue = turn.catch(() => undefined);
    return turn;
  }

  private async takeRead(session: PairingSessionState, read: QrRead): Promise<void> {
    this.requireOpen(session);
    const position = read.structuredAppend;
    if (position === null) {
      await this.takeText(session, read.text);
      return;
    }
    const symbol = {...position, bytes: read.bytes};
    const part = `${symbol.index + 1} / ${symbol.count}`;

    if (session.delivered) {
      // The code has been handed over; a read can only be a repeat or something else.
      let repeat = false;
      try {
        repeat = session.assembler.add(symbol).result === 'duplicate';
      } catch (error) {
        if (!isReported(error)) throw error;
      }
      this.noteRead(session, repeat ? 'duplicate' : 'foreign', repeat ? part : 'message-mismatch');
      throw alreadyAccepted();
    }

    let outcome = this.addTo(session, session.assembler, symbol);
    if (outcome.result === 'foreign' && !session.assembler.headerVerified) {
      outcome = this.offerToCandidate(session, symbol) ?? outcome;
    }
    if (outcome.result === 'foreign') {
      this.noteRead(session, 'foreign', 'message-mismatch');
      throw new QrPairingError(
        'message-mismatch',
        'QR code belongs to another sequence than the one being collected.'
      );
    }
    const assembler = session.assembler;
    if (outcome.result === 'accepted' && !assembler.headerVerified) {
      try {
        const header = assembler.header();
        if (header) {
          this.verifyHeader(session, header);
          assembler.headerVerified = true;
        }
      } catch (error) {
        assembler.clear();
        if (!isReported(error)) throw error;
        this.noteRead(session, 'foreign', codeOf(error));
        throw error;
      }
    }
    session.phase = session.role === 'hub' ? 'awaiting-answer' : 'receiving';
    if (!assembler.isComplete()) {
      this.noteRead(session, outcome.result, part);
      return;
    }

    // The last code is reported once, as what the whole message turned out to be.
    const epoch = session.epoch;
    let message: PairingMessage;
    try {
      message = await assembler.assemble();
      if (this.isStale(session, epoch)) return;
      this.verifyHeader(session, message.header);
    } catch (error) {
      if (this.isStale(session, epoch)) return;
      assembler.clear();
      this.noteRead(session, 'foreign', codeOf(error));
      throw error;
    }
    assembler.headerVerified = true;
    this.noteRead(session, 'accepted', part);
    await this.deliver(session, message, epoch);
  }

  private async takeText(session: PairingSessionState, text: string): Promise<void> {
    this.requireOpen(session);
    // Text that is not a pairing message at all throws here and is not reported.
    const epoch = session.epoch;
    const message = await readPairingMessage(text);
    if (this.isStale(session, epoch)) return;
    try {
      this.verifyHeader(session, message.header);
    } catch (error) {
      this.noteRead(session, 'foreign', codeOf(error));
      throw error;
    }
    if (session.delivered) {
      this.noteRead(session, 'duplicate', '1 / 1');
      throw alreadyAccepted();
    }
    this.noteRead(session, 'accepted', '1 / 1');
    await this.deliver(session, message, epoch);
  }

  /**
   * Adds a code to a sequence. A position read twice with different content
   * means this sequence is damaged, so it is dropped and collected again from
   * the codes still being shown. Anything else wrong with the code leaves the
   * sequence as it was.
   */
  private addTo(
    session: PairingSessionState,
    assembler: PairingAssembler,
    symbol: StructuredAppendRead
  ): AddOutcome {
    try {
      return assembler.add(symbol);
    } catch (error) {
      if (codeOf(error) !== 'conflicting-part') throw error;
      assembler.clear();
      this.noteRead(session, 'foreign', 'conflicting-part');
      throw error;
    }
  }

  /**
   * Collects a code of another sequence on the side, while the sequence held
   * has not shown whose it is. If the other sequence's header shows it is this
   * exchange's, it takes the place of the one held.
   *
   * A camera that first catches a stray code of an old projection would
   * otherwise wait for the rest of that old sequence forever. Returns the
   * outcome in the sequence that took over, or undefined when nothing changed.
   */
  private offerToCandidate(
    session: PairingSessionState,
    symbol: StructuredAppendRead
  ): AddOutcome | undefined {
    const candidate = session.candidate;
    try {
      let outcome = candidate.add(symbol);
      if (outcome.result === 'foreign') {
        candidate.clear();
        outcome = candidate.add(symbol);
      }
      const header = candidate.header();
      if (!header) return undefined;
      this.verifyHeader(session, header);
      candidate.headerVerified = true;
      session.assembler = candidate;
      session.candidate = new PairingAssembler();
      return outcome;
    } catch {
      candidate.clear();
      return undefined;
    }
  }

  /** Hands a checked pairing code to WebRTC, once per exchange. */
  private async deliver(
    session: PairingSessionState,
    message: PairingMessage,
    epoch: number
  ): Promise<void> {
    if (session.role === 'camera' && session.exchangeId === '') {
      this.adoptOffer(session, message.header);
    }
    session.incomingMessageId = message.header.messageId;
    session.phase = session.role === 'hub' ? 'answer-received' : 'offer-received';
    session.delivered = true;
    if (session.role === 'hub') {
      await this.acceptAnswer(session, message.payload, epoch);
    } else {
      await this.acceptOfferAndPrepareAnswer(session, message.payload, epoch);
    }
  }

  private requireOpen(session: PairingSessionState): void {
    if (isTerminalPhase(session.phase)) {
      throw new QrPairingError(
        session.phase === 'connected' ? 'already-accepted' : 'stale-exchange',
        `Pairing session ${session.sessionKey} is no longer receiving codes.`
      );
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
      throw new QrPairingError('no-session', 'No pairing messages have been prepared yet.');
    }
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1 || oneBasedIndex > total) {
      throw new QrPairingError(
        'invalid-argument',
        `pairing message index must be between 1 and ${total}.`
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
      throw new QrPairingError('no-session', 'No pairing messages have been prepared yet.');
    }
    return this.selectPart(sessionKey, ((session.outgoingCurrentIndex + 1) % total) + 1);
  }

  public partSvg(sessionKey: string, oneBasedIndex: number): string {
    const session = this.requireSession(sessionKey);
    return session.outgoingSvgs[oneBasedIndex - 1] ?? '';
  }

  /** The outgoing Structured Append sequence, in order. Empty until one is prepared. */
  public outgoingSymbols(sessionKey: string): PairingCodes['symbols'] {
    return this.requireSession(sessionKey).outgoing?.symbols ?? [];
  }

  /** The whole outgoing message as text, which `ingestQrText` accepts. */
  public messageText(sessionKey: string): string {
    return this.requireSession(sessionKey).outgoing?.text ?? '';
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
        const read = await scan.scanOnce({cameraId: camera, signal: abort.signal});
        if (this.isStale(session, epoch)) return;
        try {
          await this.ingestQrRead(sessionKey, read);
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
      const parts = await createPairingCodes(code, this.codeOptions(session, 'offer'));
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
      const parts = await createPairingCodes(code, this.codeOptions(session, 'answer'));
      if (this.isStale(session, epoch)) return;
      this.attachOutgoing(session, parts);
      session.phase = 'answer-ready';
      this.scheduleTick(session);
    } catch (error) {
      if (!this.isStale(session, epoch)) this.failFrom(session, error);
      throw error;
    }
  }

  private codeOptions(
    session: PairingSessionState,
    kind: 'offer' | 'answer'
  ): CreateCodesOptions {
    const common = {
      senderPeerId: session.localPeerId,
      targetPeerId: session.remotePeerId,
      errorCorrectionLevel: this.errorCorrectionLevel,
      maxVersion: kind === 'offer' ? this.offerMaxVersion : this.answerMaxVersion,
      createdAt: this.now()
    };
    return kind === 'offer'
      ? {...common, kind}
      : {...common, kind, sessionId: session.exchangeId, replyTo: session.incomingMessageId};
  }

  private attachOutgoing(
    session: PairingSessionState,
    parts: PairingCodes
  ): void {
    session.outgoing = parts;
    session.outgoingSvgs = parts.svgs;
    session.outgoingCurrentIndex = -1;
    session.exchangeId = parts.sessionId;
    session.outgoingMessageId = parts.messageId;
  }

  /**
   * Checks that a message belongs to this exchange, this role, and this peer
   * pair before its pairing code reaches WebRTC.
   */
  private verifyHeader(session: PairingSessionState, header: PairingMessageHeader): void {
    const expectedKind = session.role === 'hub' ? 'answer' : 'offer';
    if (header.kind !== expectedKind) {
      throw new QrPairingError(
        'unexpected-kind',
        `This session expects an ${expectedKind}.`
      );
    }
    if (session.role === 'hub') {
      if (header.sessionId !== session.exchangeId) {
        throw new QrPairingError(
          'stale-exchange',
          'Pairing message belongs to a different pairing exchange.'
        );
      }
      if (header.replyTo !== session.outgoingMessageId) {
        throw new QrPairingError('reply-mismatch', 'Pairing message answers a different offer.');
      }
      if (
        header.senderPeerId !== session.remotePeerId ||
        header.targetPeerId !== session.localPeerId
      ) {
        throw new QrPairingError('peer-mismatch', 'Pairing message names a different pair of peers.');
      }
      return;
    }
    if (session.exchangeId !== '' && header.sessionId !== session.exchangeId) {
      throw new QrPairingError(
        'stale-exchange',
        'Pairing message belongs to a different pairing exchange.'
      );
    }
    if (session.expectedLocalPeerId !== '' && header.targetPeerId !== session.expectedLocalPeerId) {
      throw new QrPairingError('peer-mismatch', 'Pairing message is addressed to a different device.');
    }
    if (session.remotePeerId !== '' && header.senderPeerId !== session.remotePeerId) {
      throw new QrPairingError('peer-mismatch', 'Pairing message names a different sender.');
    }
  }

  /**
   * Adopts the peer naming the offer carries. The sender's name for itself
   * becomes this device's WebRTC peer key, so the two ends never need to be
   * configured with the same identifiers.
   */
  private adoptOffer(session: PairingSessionState, header: PairingMessageHeader): void {
    session.exchangeId = header.sessionId;
    session.localPeerId = header.targetPeerId;
    session.remotePeerId = header.senderPeerId;
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
      assembler: new PairingAssembler(),
      candidate: new PairingAssembler(),
      readQueue: Promise.resolve(),
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
    session.assembler = new PairingAssembler();
    session.candidate = new PairingAssembler();
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
      session.candidate.clear();
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

function alreadyAccepted(): QrPairingError {
  return new QrPairingError(
    'already-accepted',
    'The pairing code for this exchange has already been accepted.'
  );
}

/** Whether a failure is about a pairing code, rather than about text that is not one at all. */
function isReported(error: unknown): boolean {
  return !(error instanceof QrPairingError && unreportedCodes.has(error.code));
}
