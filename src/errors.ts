/**
 * Error contract shared by the QR transport layer and the pairing domain.
 *
 * Messages must never contain SDP, ICE details, pairing codes, or QR payload
 * fragments: callers surface them to project authors and diagnostics.
 */
export type PairingErrorCode =
  // Feature flag and external dependencies.
  | 'feature-disabled'
  | 'webrtc-capability-missing'
  | 'qr-decoder-missing'
  | 'camera-unavailable'
  | 'renderer-unavailable'
  // Transport format and integrity.
  | 'invalid-json'
  | 'unsupported-protocol'
  | 'invalid-envelope'
  | 'part-too-large'
  | 'index-out-of-range'
  | 'message-too-large'
  | 'too-many-parts'
  | 'message-mismatch'
  | 'conflicting-part'
  | 'missing-parts'
  | 'length-mismatch'
  | 'hash-mismatch'
  // Exchange identity.
  | 'unknown-session'
  | 'stale-exchange'
  | 'unexpected-kind'
  | 'peer-mismatch'
  | 'reply-mismatch'
  | 'already-accepted'
  // Lifecycle.
  | 'session-limit'
  | 'session-exists'
  | 'no-session'
  | 'invalid-argument'
  | 'timeout'
  | 'cancelled'
  | 'webrtc-rejected';

export class QrPairingError extends Error {
  public readonly code: PairingErrorCode;

  public constructor(code: PairingErrorCode, message: string, options?: {cause?: unknown}) {
    super(message, options);
    this.name = 'QrPairingError';
    this.code = code;
  }
}

/** Narrows an unknown catch binding so callers can preserve the original code. */
export function isPairingError(value: unknown): value is QrPairingError {
  return value instanceof QrPairingError;
}
