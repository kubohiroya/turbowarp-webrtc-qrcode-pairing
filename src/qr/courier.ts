import QRCode from 'qrcode';
import {QrPairingError} from '../errors.js';
import {
  envelopeIdentity,
  QR_PROTOCOL,
  requireIdentifier,
  serializeEnvelope,
  type QrEnvelopeV1,
  type QrErrorCorrectionLevel,
  type QrMessageKind
} from './envelope.js';
import {sha256Base64Url} from './hash.js';
import {MAX_CHUNK_LENGTH, MAX_MESSAGE_LENGTH, MAX_PART_COUNT} from './limits.js';

const printableAscii = /^[ -~]+$/u;

export interface CreatePartsOptions {
  readonly senderPeerId: string;
  readonly targetPeerId: string;
  readonly kind: QrMessageKind;
  /** Required for answers: the message ID of the offer being answered. */
  readonly replyTo?: string;
  /** Answers must reuse the offer's session ID. Offers default to a fresh UUID. */
  readonly sessionId?: string;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  readonly createdAt?: number;
}

export interface QrParts {
  readonly parts: readonly QrEnvelopeV1[];
  /** QR texts in the same order as `parts`. */
  readonly texts: readonly string[];
  readonly sessionId: string;
  readonly messageId: string;
}

/**
 * Splits a pairing code into parts that each fit one QR symbol.
 *
 * The chunk length depends on the envelope header, which in turn depends on the
 * part count, so the loop repeats until the two agree.
 */
export async function createParts(
  message: string,
  options: CreatePartsOptions
): Promise<QrParts> {
  requireMessage(message);
  const senderPeerId = requireIdentifier(options.senderPeerId, 'sender peer ID');
  const targetPeerId = requireIdentifier(options.targetPeerId, 'target peer ID');
  if (options.kind !== 'offer' && options.kind !== 'answer') {
    throw new QrPairingError('invalid-argument', 'QR message kind must be offer or answer.');
  }
  const replyTo =
    options.kind === 'answer'
      ? requireIdentifier(options.replyTo ?? '', 'reply-to message ID')
      : '';
  if (options.kind === 'offer' && (options.replyTo ?? '') !== '') {
    throw new QrPairingError('invalid-argument', 'An offer must not set reply-to.');
  }
  const sessionId = requireIdentifier(options.sessionId ?? crypto.randomUUID(), 'session ID');
  const createdAt = options.createdAt ?? Date.now();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new QrPairingError('invalid-argument', 'QR creation timestamp is invalid.');
  }
  const errorCorrectionLevel = options.errorCorrectionLevel ?? 'M';
  const messageHash = await sha256Base64Url(message);
  const messageId = `${sessionId}.${messageHash.slice(0, 12)}`;

  let partCount = 1;
  let chunkLength = 0;
  for (;;) {
    chunkLength = maximumPayloadLength(
      {
        protocol: QR_PROTOCOL,
        sessionId,
        senderPeerId,
        targetPeerId,
        kind: options.kind,
        messageId,
        replyTo,
        createdAt,
        partIndex: partCount - 1,
        partCount,
        messageLength: message.length,
        messageHash,
        payload: ''
      },
      errorCorrectionLevel
    );
    if (chunkLength < 1) {
      throw new QrPairingError(
        'invalid-envelope',
        'QR encoder capacity is too small for the part envelope.'
      );
    }
    const required = Math.ceil(message.length / chunkLength);
    if (required > MAX_PART_COUNT) {
      throw new QrPairingError(
        'too-many-parts',
        `Splitting needs ${required} parts, which exceeds the limit of ${MAX_PART_COUNT}.`
      );
    }
    if (required === partCount) break;
    partCount = required;
  }

  const parts = Array.from(
    {length: partCount},
    (_unused, partIndex): QrEnvelopeV1 => ({
      protocol: QR_PROTOCOL,
      sessionId,
      senderPeerId,
      targetPeerId,
      kind: options.kind,
      messageId,
      replyTo,
      createdAt,
      partIndex,
      partCount,
      messageLength: message.length,
      messageHash,
      payload: message.slice(partIndex * chunkLength, (partIndex + 1) * chunkLength)
    })
  );
  const texts = parts.map(serializeEnvelope);
  for (const text of texts) QRCode.create(text, {errorCorrectionLevel});
  return {parts, texts, sessionId, messageId};
}

export interface PartAcceptResult {
  readonly received: number;
  readonly total: number;
  /** True when the same index arrived again with the same payload. Not an error. */
  readonly duplicate: boolean;
}

/** Collects the parts of exactly one message and verifies the result. */
export class PartAssembler {
  private readonly parts = new Map<number, QrEnvelopeV1>();
  private identity: string | undefined;

  public add(envelope: QrEnvelopeV1): PartAcceptResult {
    const identity = envelopeIdentity(envelope);
    if (this.identity !== undefined && this.identity !== identity) {
      throw new QrPairingError(
        'message-mismatch',
        'QR part does not belong to the message being assembled.'
      );
    }
    this.identity = identity;
    const existing = this.parts.get(envelope.partIndex);
    if (existing && existing.payload !== envelope.payload) {
      throw new QrPairingError(
        'conflicting-part',
        `QR part ${envelope.partIndex + 1} arrived twice with different content.`
      );
    }
    this.parts.set(envelope.partIndex, envelope);
    return {
      received: this.parts.size,
      total: envelope.partCount,
      duplicate: existing !== undefined
    };
  }

  public receivedCount(): number {
    return this.parts.size;
  }

  /** Zero until the first part arrives, because the part count is carried by the parts. */
  public requiredCount(): number {
    return this.first()?.partCount ?? 0;
  }

  /** Zero-based indices that have not arrived yet, in ascending order. */
  public missingParts(): readonly number[] {
    const total = this.requiredCount();
    const missing: number[] = [];
    for (let index = 0; index < total; index += 1) {
      if (!this.parts.has(index)) missing.push(index);
    }
    return missing;
  }

  public isComplete(): boolean {
    const total = this.requiredCount();
    return total > 0 && this.parts.size === total;
  }

  /** Joins the parts and verifies length and hash before returning anything. */
  public async assemble(): Promise<string> {
    const first = this.first();
    if (!first) {
      throw new QrPairingError('missing-parts', 'No QR parts have been received.');
    }
    if (this.parts.size !== first.partCount) {
      throw new QrPairingError(
        'missing-parts',
        `QR message is missing ${first.partCount - this.parts.size} of ${first.partCount} parts.`
      );
    }
    const message = Array.from({length: first.partCount}, (_unused, index) => {
      const part = this.parts.get(index);
      if (!part) {
        throw new QrPairingError('missing-parts', `QR message is missing part ${index + 1}.`);
      }
      return part.payload;
    }).join('');
    if (message.length !== first.messageLength) {
      throw new QrPairingError('length-mismatch', 'Reassembled QR message has the wrong length.');
    }
    if ((await sha256Base64Url(message)) !== first.messageHash) {
      throw new QrPairingError('hash-mismatch', 'Reassembled QR message failed its hash check.');
    }
    return message;
  }

  public clear(): void {
    this.parts.clear();
    this.identity = undefined;
  }

  private first(): QrEnvelopeV1 | undefined {
    return this.parts.values().next().value as QrEnvelopeV1 | undefined;
  }
}

/**
 * Largest payload that still lets the whole envelope fit a version 40 symbol at
 * the given error correction level.
 */
function maximumPayloadLength(
  base: QrEnvelopeV1,
  errorCorrectionLevel: QrErrorCorrectionLevel
): number {
  let low = 0;
  let high = MAX_CHUNK_LENGTH;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const text = JSON.stringify({...base, payload: 'A'.repeat(middle)});
    try {
      QRCode.create([{data: new TextEncoder().encode(text), mode: 'byte'}], {
        version: 40,
        errorCorrectionLevel
      });
      low = middle;
    } catch {
      high = middle - 1;
    }
  }
  return low;
}

function requireMessage(value: string): void {
  if (typeof value !== 'string' || value.length < 1) {
    throw new QrPairingError('invalid-argument', 'Pairing code is empty.');
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new QrPairingError(
      'message-too-large',
      `Pairing code must be at most ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  if (!printableAscii.test(value)) {
    throw new QrPairingError('invalid-argument', 'Pairing code must be printable ASCII.');
  }
}
