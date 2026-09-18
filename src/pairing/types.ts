import type {PairingErrorCode} from '../errors.js';
import type {PairingAssembler, PairingCodes} from '../qr/courier.js';

export type PairingRole = 'hub' | 'camera';

/**
 * Observable session state.
 *
 * `offer-received` and `answer-received` mean the QR transport finished and the
 * code passed its integrity checks. `connected` means WebRTC reported an
 * established connection. The two are always distinct states, because a
 * successfully carried code does not imply a reachable network path.
 */
export type PairingPhase =
  // Shared.
  | 'disabled'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'cancelled'
  | 'expired'
  | 'failed'
  // Hub.
  | 'creating-offer'
  | 'offer-ready'
  | 'awaiting-answer'
  | 'answer-received'
  // Camera.
  | 'awaiting-offer'
  | 'receiving'
  | 'offer-received'
  | 'creating-answer'
  | 'answer-ready';

const terminalPhases = new Set<PairingPhase>(['connected', 'cancelled', 'expired', 'failed']);

export function isTerminalPhase(phase: PairingPhase): boolean {
  return terminalPhases.has(phase);
}

/**
 * What the latest pairing QR code a session read turned out to be.
 *
 * - `accepted`: a code of the sequence being collected that had not arrived yet.
 * - `duplicate`: a code that had already arrived. Harmless; a camera reads the
 *   code in front of it many times a second.
 * - `foreign`: a code this exchange cannot use — another sequence while one is
 *   being collected, or a sequence that turned out to be another exchange's,
 *   another pair of peers', the other direction's, or damaged. It is ignored;
 *   a sequence found unusable is dropped, so the right one can be collected.
 *
 * QR codes that are not Structured Append codes or pairing messages are not
 * reported: a camera aimed at a projection also sees posters and signs.
 */
export type PairingReadResult = '' | 'accepted' | 'duplicate' | 'foreign';

export interface PairingProgress {
  readonly phase: PairingPhase;
  readonly role: PairingRole;
  readonly sessionKey: string;
  /** The envelope `sessionId` of the current exchange. A retry allocates a new one. */
  readonly exchangeId: string;
  readonly localPeerId: string;
  readonly remotePeerId: string;
  readonly outgoingPartCount: number;
  /** One-based, or zero when no part has been selected yet. */
  readonly outgoingCurrentPart: number;
  readonly receivedParts: number;
  /** Zero until the first incoming part declares the count. */
  readonly requiredParts: number;
  /** One-based indices that have not arrived yet. */
  readonly missingParts: readonly number[];
  readonly connectionState: string;
  readonly errorCode: PairingErrorCode | '';
  readonly errorMessage: string;
  readonly remainingSeconds: number;
  /** Pairing QR codes read so far, of any result. Rises by one per read. */
  readonly readCount: number;
  readonly lastRead: PairingReadResult;
  /**
   * For `accepted` and `duplicate`, the code as "2 / 4"; for `foreign`, why it
   * was ignored, as an error code such as `message-mismatch` (another
   * sequence), `stale-exchange` or `peer-mismatch`.
   */
  readonly lastReadDetail: string;
}

export interface PairingSessionState {
  readonly sessionKey: string;
  readonly role: PairingRole;
  /** What the application asked this device to be called. Empty means "adopt the offer's value". */
  readonly expectedLocalPeerId: string;
  localPeerId: string;
  remotePeerId: string;
  phase: PairingPhase;
  /** Bumped by cancel, retry, expiry, and disposal so stale async results can be dropped. */
  epoch: number;
  exchangeId: string;
  outgoingMessageId: string;
  incomingMessageId: string;
  outgoing: PairingCodes | undefined;
  outgoingSvgs: readonly string[];
  /** Zero-based index into `outgoingSvgs`, or -1 when nothing is selected. */
  outgoingCurrentIndex: number;
  assembler: PairingAssembler;
  /** True once the reassembled code has been handed to WebRTC. Prevents a second delivery. */
  delivered: boolean;
  /** True once a WebRTC peer exists for `remotePeerId`, so its state is worth polling. */
  peerCreated: boolean;
  timeoutMilliseconds: number;
  startedAtMonotonic: number;
  errorCode: PairingErrorCode | '';
  errorMessage: string;
  tickTimer: ReturnType<typeof setTimeout> | undefined;
  /** Sprites this session swapped a skin on, so only its own displays are restored. */
  displayTargets: Set<TurboWarpTarget>;
  /** Aborts an in-flight camera scan when the session ends. */
  scanAbort: AbortController | undefined;
  waiters: {resolve: () => void; reject: (error: unknown) => void}[];
  readCount: number;
  lastRead: PairingReadResult;
  lastReadDetail: string;
}
