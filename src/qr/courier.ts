import {
  createStructuredAppend,
  StructuredAppendAssembler,
  StructuredAppendError,
  type AddOutcome,
  type StructuredAppendRead,
  type StructuredAppendSymbol
} from '@kubohiroya/qrcode-structured-append';
import {QrPairingError} from '../errors.js';
import {sha256Base64Url} from './hash.js';
import {DEFAULT_OFFER_MAX_VERSION, MAX_PART_COUNT} from './limits.js';
import {
  formatMessage,
  parseHeader,
  parseMessage,
  requireIdentifier,
  type PairingMessage,
  type PairingMessageHeader,
  type QrErrorCorrectionLevel,
  type QrMessageKind
} from './message.js';

export interface CreateCodesOptions {
  readonly senderPeerId: string;
  readonly targetPeerId: string;
  readonly kind: QrMessageKind;
  /** Required for answers: the message ID of the offer being answered. */
  readonly replyTo?: string;
  /** Answers must reuse the offer's session ID. Offers default to a fresh UUID. */
  readonly sessionId?: string;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  /**
   * Largest QR version a code may use, 1 to 40. Smaller versions are coarser
   * codes a camera reads more easily, in more codes. Defaults to
   * `DEFAULT_OFFER_MAX_VERSION`.
   */
  readonly maxVersion?: number;
  readonly createdAt?: number;
}

export interface PairingCodes {
  /** The Structured Append sequence, in order. */
  readonly symbols: readonly StructuredAppendSymbol[];
  /** One SVG per symbol, in the same order. */
  readonly svgs: readonly string[];
  /** The whole message as text, for carrying it some other way. */
  readonly text: string;
  readonly sessionId: string;
  readonly messageId: string;
}

/** Wraps a pairing code in its header and splits it into a Structured Append sequence. */
export async function createPairingCodes(
  payload: string,
  options: CreateCodesOptions
): Promise<PairingCodes> {
  const senderPeerId = requireArgument(options.senderPeerId, 'sender peer ID');
  const targetPeerId = requireArgument(options.targetPeerId, 'target peer ID');
  if (options.kind !== 'offer' && options.kind !== 'answer') {
    throw new QrPairingError('invalid-argument', 'QR message kind must be offer or answer.');
  }
  const replyTo =
    options.kind === 'answer' ? requireArgument(options.replyTo ?? '', 'reply-to message ID') : '';
  if (options.kind === 'offer' && (options.replyTo ?? '') !== '') {
    throw new QrPairingError('invalid-argument', 'An offer must not set reply-to.');
  }
  const sessionId = requireArgument(options.sessionId ?? crypto.randomUUID(), 'session ID');
  const createdAt = options.createdAt ?? Date.now();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new QrPairingError('invalid-argument', 'QR creation timestamp is invalid.');
  }
  const maxVersion = requireVersion(options.maxVersion ?? DEFAULT_OFFER_MAX_VERSION);
  if (typeof payload !== 'string' || payload.length < 1) {
    throw new QrPairingError('invalid-argument', 'Pairing code is empty.');
  }
  const messageHash = await sha256Base64Url(payload);
  const messageId = `${sessionId}.${messageHash.slice(0, 12)}`;
  const text = formatMessage({
    header: {
      sessionId,
      senderPeerId,
      targetPeerId,
      kind: options.kind,
      messageId,
      replyTo,
      createdAt,
      messageLength: payload.length,
      messageHash
    },
    payload
  });
  let symbols: StructuredAppendSymbol[];
  try {
    symbols = createStructuredAppend(text, {
      level: options.errorCorrectionLevel ?? 'M',
      maxVersion
    });
  } catch (error) {
    if (error instanceof StructuredAppendError && error.code === 'too-many-symbols') {
      throw new QrPairingError(
        'too-many-parts',
        `The pairing code needs more than ${MAX_PART_COUNT} QR codes at version ${maxVersion}.`,
        {cause: error}
      );
    }
    throw new QrPairingError('invalid-argument', 'The pairing code cannot be made into QR codes.', {
      cause: error
    });
  }
  return {
    symbols,
    svgs: symbols.map((symbol) => symbol.toSvg()),
    text,
    sessionId,
    messageId
  };
}

/** Reads the whole message the codes carry, and checks it against its hash. */
export async function readPairingMessage(text: string): Promise<PairingMessage> {
  const message = parseMessage(text);
  if ((await sha256Base64Url(message.payload)) !== message.header.messageHash) {
    throw new QrPairingError('hash-mismatch', 'The pairing code failed its hash check.');
  }
  return message;
}

/** The header, if the given first code of a sequence holds all of it. */
export function headerOfFirstCode(read: StructuredAppendRead): PairingMessageHeader | undefined {
  return parseHeader(latin1(read.bytes));
}

/**
 * Collects the codes of one pairing message, in any order.
 *
 * The first code read decides the sequence. Until the first code of that
 * sequence has shown whose message it is, another sequence whose first code
 * does belong to this exchange may take its place: a camera may well see an
 * old projection before the right one.
 */
export class PairingAssembler {
  private readonly inner = new StructuredAppendAssembler();
  /** True once the sequence's first code showed a header this exchange accepts. */
  public headerVerified = false;

  /** Throws `conflicting-part` for a position that arrives twice with different content. */
  public add(read: StructuredAppendRead): AddOutcome {
    try {
      return this.inner.add(read);
    } catch (error) {
      throw translate(error);
    }
  }

  public receivedCount(): number {
    return this.inner.received();
  }

  /** Zero until the first code arrives, because the count is carried by the codes. */
  public requiredCount(): number {
    return this.inner.count();
  }

  /** Zero-based positions that have not arrived yet, in ascending order. */
  public missingParts(): readonly number[] {
    return this.inner.missing();
  }

  public isComplete(): boolean {
    return this.inner.isComplete();
  }

  /** Joins the codes and checks the result before returning anything. */
  public async assemble(): Promise<PairingMessage> {
    let text: string;
    try {
      text = this.inner.text();
    } catch (error) {
      throw translate(error);
    }
    return readPairingMessage(text);
  }

  public clear(): void {
    this.inner.clear();
    this.headerVerified = false;
  }
}

/** A QR version is a whole number from 1 to 40. */
export function requireVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 40) {
    throw new QrPairingError(
      'invalid-argument',
      `QR version cap must be a whole number from 1 to 40, not ${String(value)}.`
    );
  }
  return value;
}

function requireArgument(value: string, label: string): string {
  try {
    return requireIdentifier(value, label);
  } catch (error) {
    throw new QrPairingError('invalid-argument', `Invalid ${label}.`, {cause: error});
  }
}

function translate(error: unknown): unknown {
  if (!(error instanceof StructuredAppendError)) return error;
  switch (error.code) {
    case 'conflicting-symbol':
      return new QrPairingError('conflicting-part', error.message, {cause: error});
    case 'incomplete':
      return new QrPairingError('missing-parts', error.message, {cause: error});
    case 'parity-mismatch':
      return new QrPairingError('hash-mismatch', error.message, {cause: error});
    default:
      return new QrPairingError('invalid-envelope', error.message, {cause: error});
  }
}

/** Pairing messages are ASCII, so each byte of a code is one character. */
function latin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}
