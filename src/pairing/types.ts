import type {PairingErrorCode} from '../errors.js';
import type {QrParts} from '../qr/courier.js';
import type {PartAssembler} from '../qr/courier.js';

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
  outgoing: QrParts | undefined;
  outgoingSvgs: readonly string[];
  /** Zero-based index into `outgoingSvgs`, or -1 when nothing is selected. */
  outgoingCurrentIndex: number;
  assembler: PartAssembler;
  /** True once the reassembled code has been handed to WebRTC. Prevents a second delivery. */
  delivered: boolean;
  /** True once a WebRTC peer exists for `remotePeerId`, so its state is worth polling. */
  peerCreated: boolean;
  timeoutMilliseconds: number;
  startedAtMonotonic: number;
  errorCode: PairingErrorCode | '';
  errorMessage: string;
  tickTimer: ReturnType<typeof setTimeout> | undefined;
  waiters: {resolve: () => void; reject: (error: unknown) => void}[];
}
