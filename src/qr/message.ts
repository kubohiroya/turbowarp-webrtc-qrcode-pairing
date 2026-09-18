import {QrPairingError} from '../errors.js';
import {
  MAX_HEADER_LENGTH,
  MAX_IDENTIFIER_LENGTH,
  MAX_MESSAGE_LENGTH,
  MESSAGE_HASH_LENGTH
} from './limits.js';

/**
 * Transport format identifier.
 *
 * `twqr/1` put a JSON envelope into every QR code. `twqr/2` puts one message
 * into a Structured Append sequence (ISO/IEC 18004), so the split is the
 * standard's, and a reader that knows the standard knows which code is which.
 * The two are not compatible, and `twqr/1` is rejected with
 * `unsupported-protocol`.
 */
export const QR_PROTOCOL = 'twqr/2';

export type QrMessageKind = 'offer' | 'answer';
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Who a message is from, who it is for, and what it answers.
 *
 * The Structured Append parity only groups codes, and eight bits of it collide
 * one time in 256, so the message carries its own exchange identity and hash.
 */
export interface PairingMessageHeader {
  /** Identifies one offer/answer round trip. A retry always allocates a new one. */
  readonly sessionId: string;
  /** What the sender calls itself. The receiver uses it as its local WebRTC peer key. */
  readonly senderPeerId: string;
  /** What the sender calls the receiver. The receiver adopts or verifies it. */
  readonly targetPeerId: string;
  readonly kind: QrMessageKind;
  /** `<sessionId>.<first 12 characters of messageHash>`. */
  readonly messageId: string;
  /** For answers, the message ID of the offer being answered. Empty for offers. */
  readonly replyTo: string;
  /**
   * The sending device's own wall clock in milliseconds. Diagnostic only:
   * deadlines are measured locally with a monotonic clock, because the two
   * devices are not time-synchronized.
   */
  readonly createdAt: number;
  readonly messageLength: number;
  /** SHA-256 of the pairing code, as unpadded base64url. */
  readonly messageHash: string;
}

export interface PairingMessage {
  readonly header: PairingMessageHeader;
  /** The pairing code. */
  readonly payload: string;
}

/** Printable ASCII. Pairing codes are base64url, so this never rejects a valid payload. */
const printableAscii = /^[ -~]+$/u;
const base64Url = /^[A-Za-z0-9_-]+$/u;
const headerKeys = [
  'sessionId',
  'senderPeerId',
  'targetPeerId',
  'kind',
  'messageId',
  'replyTo',
  'createdAt',
  'messageLength',
  'messageHash'
] as const;

/**
 * The text a message is carried as: the protocol, the header as JSON, and the
 * pairing code, one per line. The header comes first so that the first QR code
 * of a sequence tells a reader whether the sequence is for it.
 */
export function formatMessage(message: PairingMessage): string {
  validateHeader(message.header);
  requirePayload(message.payload, 'invalid-argument');
  const header: Record<string, unknown> = {};
  for (const key of headerKeys) header[key] = message.header[key];
  return `${QR_PROTOCOL}\n${JSON.stringify(header)}\n${message.payload}`;
}

/** Reads a whole message. The hash is checked separately, because it is asynchronous. */
export function parseMessage(text: string): PairingMessage {
  if (typeof text !== 'string') {
    throw new QrPairingError('invalid-envelope', 'Pairing message must be text.');
  }
  if (text.length > MAX_HEADER_LENGTH + MAX_MESSAGE_LENGTH) {
    throw new QrPairingError('message-too-large', 'Pairing message is too long.');
  }
  const header = parseHeader(text);
  if (!header) {
    throw new QrPairingError('invalid-envelope', 'Pairing message has no pairing code.');
  }
  const payload = text.slice(text.indexOf('\n', QR_PROTOCOL.length + 1) + 1);
  requirePayload(payload, 'invalid-envelope');
  if (payload.length !== header.messageLength) {
    throw new QrPairingError('length-mismatch', 'Pairing code has the wrong length.');
  }
  return {header, payload};
}

/**
 * Reads the header from the start of a message, such as the first code of a
 * sequence. Returns undefined while the header line has not ended yet; throws
 * as soon as the text cannot be a pairing message.
 */
export function parseHeader(prefix: string): PairingMessageHeader | undefined {
  const protocolEnd = prefix.indexOf('\n');
  const protocol = protocolEnd < 0 ? prefix : prefix.slice(0, protocolEnd);
  if (protocolEnd < 0 ? !QR_PROTOCOL.startsWith(protocol) : protocol !== QR_PROTOCOL) {
    throw new QrPairingError('unsupported-protocol', `Pairing message protocol must be ${QR_PROTOCOL}.`);
  }
  if (protocolEnd < 0) return undefined;
  const headerEnd = prefix.indexOf('\n', protocolEnd + 1);
  if (headerEnd < 0) {
    if (prefix.length - protocolEnd > MAX_HEADER_LENGTH) {
      throw new QrPairingError('invalid-envelope', 'Pairing message header is too long.');
    }
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(prefix.slice(protocolEnd + 1, headerEnd));
  } catch (error) {
    throw new QrPairingError('invalid-json', 'Pairing message header is not valid JSON.', {
      cause: error
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new QrPairingError('invalid-envelope', 'Pairing message header must be an object.');
  }
  const header = parsed as PairingMessageHeader;
  validateHeader(header);
  return header;
}

export function validateHeader(header: PairingMessageHeader): void {
  requireIdentifier(header.sessionId, 'session ID');
  requireIdentifier(header.senderPeerId, 'sender peer ID');
  requireIdentifier(header.targetPeerId, 'target peer ID');
  requireIdentifier(header.messageId, 'message ID');
  if (header.kind !== 'offer' && header.kind !== 'answer') {
    throw new QrPairingError('invalid-envelope', 'Pairing message kind must be offer or answer.');
  }
  if (header.kind === 'answer') {
    requireIdentifier(header.replyTo, 'reply-to message ID');
  } else if (header.replyTo !== '') {
    throw new QrPairingError('invalid-envelope', 'An offer must not set reply-to.');
  }
  if (!Number.isSafeInteger(header.createdAt) || header.createdAt < 0) {
    throw new QrPairingError('invalid-envelope', 'Pairing message timestamp is invalid.');
  }
  if (!Number.isInteger(header.messageLength) || header.messageLength < 1) {
    throw new QrPairingError('invalid-envelope', 'Pairing code length must be a positive integer.');
  }
  if (header.messageLength > MAX_MESSAGE_LENGTH) {
    throw new QrPairingError(
      'message-too-large',
      `Pairing code must be at most ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  if (
    typeof header.messageHash !== 'string' ||
    header.messageHash.length !== MESSAGE_HASH_LENGTH ||
    !base64Url.test(header.messageHash)
  ) {
    throw new QrPairingError('invalid-envelope', 'Pairing message hash is malformed.');
  }
}

export function requireIdentifier(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    !printableAscii.test(value)
  ) {
    throw new QrPairingError('invalid-envelope', `Invalid ${label}.`);
  }
  return value;
}

function requirePayload(value: string, code: 'invalid-argument' | 'invalid-envelope'): void {
  if (typeof value !== 'string' || value.length < 1) {
    throw new QrPairingError(code, 'Pairing code is empty.');
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new QrPairingError(
      'message-too-large',
      `Pairing code must be at most ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  if (!printableAscii.test(value)) {
    throw new QrPairingError(code, 'Pairing code must be printable ASCII.');
  }
}
