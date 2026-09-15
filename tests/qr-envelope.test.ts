import {describe, expect, it} from 'vitest';
import type {PairingErrorCode} from '../src/errors.js';
import {
  envelopeIdentity,
  parseEnvelope,
  QR_PROTOCOL,
  serializeEnvelope,
  type QrEnvelopeV1
} from '../src/qr/envelope.js';
import {MAX_CHUNK_LENGTH, MAX_MESSAGE_LENGTH, MAX_PART_TEXT_LENGTH} from '../src/qr/limits.js';

const validOffer: QrEnvelopeV1 = {
  protocol: QR_PROTOCOL,
  sessionId: '9f1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
  senderPeerId: 'hub',
  targetPeerId: 'camera-1',
  kind: 'offer',
  messageId: '9f1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d.AbCdEfGhIjKl',
  replyTo: '',
  createdAt: 1_757_900_000_000,
  partIndex: 0,
  partCount: 2,
  messageLength: 16,
  messageHash: 'A'.repeat(43),
  payload: 'eyJ0eXBlIjoib2Zm'
};

/** Legacy format from turbowarp-realtime-motion-capture, kept only as a rejection fixture. */
const legacyPart = {
  protocol: 'twmp-qr/1',
  sessionId: 'session-1',
  peerId: 'camera-1',
  kind: 'offer',
  messageId: 'session-1.AbCdEfGhIjKl',
  createdAt: 1,
  partIndex: 0,
  partCount: 1,
  messageLength: 16,
  messageHash: 'A'.repeat(43),
  payload: 'eyJ0eXBlIjoib2Zm'
};

describe('QR envelope', () => {
  it('round-trips a valid offer and answer', () => {
    expect(parseEnvelope(serializeEnvelope(validOffer))).toEqual(validOffer);

    const answer: QrEnvelopeV1 = {
      ...validOffer,
      kind: 'answer',
      senderPeerId: 'camera-1',
      targetPeerId: 'hub',
      replyTo: validOffer.messageId
    };
    expect(parseEnvelope(serializeEnvelope(answer))).toEqual(answer);
  });

  it('treats part index and payload as the only fields allowed to differ', () => {
    const sibling: QrEnvelopeV1 = {...validOffer, partIndex: 1, payload: 'ZXIifQ'};
    expect(envelopeIdentity(sibling)).toBe(envelopeIdentity(validOffer));
    expect(envelopeIdentity({...validOffer, senderPeerId: 'other'})).not.toBe(
      envelopeIdentity(validOffer)
    );
    expect(envelopeIdentity({...validOffer, createdAt: 0})).not.toBe(
      envelopeIdentity(validOffer)
    );
  });

  it.each<[string, unknown, PairingErrorCode]>([
    ['text that is not JSON', 'not json', 'invalid-json'],
    ['a JSON array', [], 'invalid-envelope'],
    ['a JSON string', '"offer"', 'invalid-envelope'],
    ['the legacy twmp-qr/1 format', legacyPart, 'unsupported-protocol'],
    ['a future protocol version', {...validOffer, protocol: 'twqr/2'}, 'unsupported-protocol'],
    ['an empty session ID', {...validOffer, sessionId: ''}, 'invalid-envelope'],
    ['an over-long peer ID', {...validOffer, senderPeerId: 'p'.repeat(129)}, 'invalid-envelope'],
    ['a non-ASCII peer ID', {...validOffer, targetPeerId: 'カメラ'}, 'invalid-envelope'],
    ['an unknown message kind', {...validOffer, kind: 'candidate'}, 'invalid-envelope'],
    ['an offer that sets reply-to', {...validOffer, replyTo: 'x'}, 'invalid-envelope'],
    [
      'an answer without reply-to',
      {...validOffer, kind: 'answer', replyTo: ''},
      'invalid-envelope'
    ],
    ['a negative timestamp', {...validOffer, createdAt: -1}, 'invalid-envelope'],
    ['a fractional timestamp', {...validOffer, createdAt: 1.5}, 'invalid-envelope'],
    ['a zero part count', {...validOffer, partCount: 0}, 'invalid-envelope'],
    ['a part count above the limit', {...validOffer, partCount: 65}, 'invalid-envelope'],
    ['a part index equal to the count', {...validOffer, partIndex: 2}, 'index-out-of-range'],
    ['a negative part index', {...validOffer, partIndex: -1}, 'index-out-of-range'],
    ['a zero message length', {...validOffer, messageLength: 0}, 'invalid-envelope'],
    [
      'a message length above the limit',
      {...validOffer, messageLength: MAX_MESSAGE_LENGTH + 1},
      'message-too-large'
    ],
    ['a short hash', {...validOffer, messageHash: 'A'.repeat(42)}, 'invalid-envelope'],
    ['a hash with invalid characters', {...validOffer, messageHash: `+${'A'.repeat(42)}`}, 'invalid-envelope'],
    [
      'an over-long payload',
      {...validOffer, payload: 'A'.repeat(MAX_CHUNK_LENGTH + 1)},
      'invalid-envelope'
    ],
    ['a non-ASCII payload', {...validOffer, payload: 'コード'}, 'invalid-envelope']
  ])('rejects %s', (_label, value, code) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    expect(() => parseEnvelope(text)).toThrowError(expect.objectContaining({code}));
  });

  it('rejects QR text that exceeds the accepted size before parsing it', () => {
    expect(() => parseEnvelope('A'.repeat(MAX_PART_TEXT_LENGTH + 1))).toThrowError(
      expect.objectContaining({code: 'part-too-large'})
    );
  });

  it('keeps pairing payloads out of error messages', () => {
    const secret = 'SDPMARKER0123456789';
    try {
      parseEnvelope(JSON.stringify({...validOffer, partIndex: 9, payload: secret}));
      expect.unreachable('parseEnvelope must reject the part index');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
