import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {describe, expect, it} from 'vitest';
import {QrPairingError} from '../src/errors.js';
import {createParts, PartAssembler} from '../src/qr/courier.js';
import {parseEnvelope} from '../src/qr/envelope.js';
import {MAX_MESSAGE_LENGTH, MAX_PART_COUNT} from '../src/qr/limits.js';
import {createQrSvg, qrVersion} from '../src/qr/svg.js';

const offerOptions = {
  senderPeerId: 'hub',
  targetPeerId: 'camera-1',
  kind: 'offer'
} as const;

describe('QR courier', () => {
  it('round-trips a single part without changing the pairing code', async () => {
    const message = 'eyJ0eXBlIjoib2ZmZXIifQ';
    const result = await createParts(message, {
      ...offerOptions,
      sessionId: 'session-1',
      createdAt: 123
    });

    expect(result.parts).toHaveLength(1);
    expect(result.messageId.startsWith('session-1.')).toBe(true);
    const assembler = new PartAssembler();
    assembler.add(parseEnvelope(result.texts[0] ?? ''));
    expect(assembler.isComplete()).toBe(true);
    await expect(assembler.assemble()).resolves.toBe(message);
  });

  it('decodes generated QR images with jsQR and reassembles shuffled duplicate parts', async () => {
    const message = 'A'.repeat(6000);
    const result = await createParts(message, {
      ...offerOptions,
      sessionId: 'session-2',
      createdAt: 456
    });

    expect(result.parts.length).toBeGreaterThan(1);
    expect(result.parts.length).toBeLessThanOrEqual(MAX_PART_COUNT);
    const decoded = result.texts.map(decodeWithJsQr);
    expect(decoded).toEqual([...result.texts]);

    const assembler = new PartAssembler();
    for (const text of [...decoded].reverse()) assembler.add(parseEnvelope(text));
    expect(assembler.add(parseEnvelope(decoded[0] ?? '')).duplicate).toBe(true);
    expect(assembler.receivedCount()).toBe(result.parts.length);
    expect(assembler.missingParts()).toEqual([]);
    await expect(assembler.assemble()).resolves.toBe(message);
  }, 20_000);

  it('reports progress and the parts still missing while receiving out of order', async () => {
    const result = await createParts('C'.repeat(6000), {
      ...offerOptions,
      sessionId: 'session-3',
      createdAt: 789
    });
    const total = result.parts.length;
    expect(total).toBeGreaterThan(2);

    const assembler = new PartAssembler();
    expect(assembler.requiredCount()).toBe(0);
    expect(assembler.missingParts()).toEqual([]);
    expect(assembler.isComplete()).toBe(false);

    assembler.add(parseEnvelope(result.texts[total - 1] ?? ''));
    expect(assembler.requiredCount()).toBe(total);
    expect(assembler.receivedCount()).toBe(1);
    expect(assembler.missingParts()).toEqual(
      Array.from({length: total - 1}, (_unused, index) => index)
    );
    expect(assembler.isComplete()).toBe(false);
    await expect(assembler.assemble()).rejects.toMatchObject({code: 'missing-parts'});
  }, 20_000);

  it('uses QR version 40 when a part reaches maximum M-level capacity', async () => {
    const result = await createParts('B'.repeat(6000), {
      ...offerOptions,
      sessionId: 'session-4',
      createdAt: 789
    });

    expect(result.texts.some((text) => qrVersion(text, 'M') === 40)).toBe(true);
    expect(createQrSvg(result.texts[0] ?? '')).toContain('<svg');
  }, 20_000);

  it('carries the answer back with the offer session and reply-to message ID', async () => {
    const offer = await createParts('offer-code', {
      ...offerOptions,
      sessionId: 'session-5',
      createdAt: 1
    });
    const answer = await createParts('answer-code', {
      senderPeerId: 'camera-1',
      targetPeerId: 'hub',
      kind: 'answer',
      sessionId: offer.sessionId,
      replyTo: offer.messageId,
      createdAt: 2
    });

    const envelope = parseEnvelope(answer.texts[0] ?? '');
    expect(envelope.kind).toBe('answer');
    expect(envelope.sessionId).toBe(offer.sessionId);
    expect(envelope.replyTo).toBe(offer.messageId);
    expect(envelope.senderPeerId).toBe('camera-1');
    expect(envelope.targetPeerId).toBe('hub');
    expect(envelope.messageId).not.toBe(offer.messageId);
  });

  it('rejects an answer without reply-to and an offer that sets it', async () => {
    await expect(
      createParts('answer-code', {
        senderPeerId: 'camera-1',
        targetPeerId: 'hub',
        kind: 'answer',
        sessionId: 'session-6'
      })
    ).rejects.toMatchObject({code: 'invalid-envelope'});

    await expect(
      createParts('offer-code', {...offerOptions, sessionId: 'session-6', replyTo: 'x'})
    ).rejects.toMatchObject({code: 'invalid-argument'});
  });

  it('rejects parts that belong to a different message', async () => {
    const first = await createParts('A'.repeat(6000), {
      ...offerOptions,
      sessionId: 'one',
      createdAt: 1
    });
    const second = await createParts('B', {...offerOptions, sessionId: 'two', createdAt: 2});

    const assembler = new PartAssembler();
    assembler.add(parseEnvelope(first.texts[0] ?? ''));
    expect(() => assembler.add(parseEnvelope(second.texts[0] ?? ''))).toThrow(QrPairingError);
    try {
      assembler.add(parseEnvelope(second.texts[0] ?? ''));
    } catch (error) {
      expect((error as QrPairingError).code).toBe('message-mismatch');
    }
  }, 20_000);

  it('rejects a repeated index that carries different content', async () => {
    const result = await createParts('D'.repeat(6000), {
      ...offerOptions,
      sessionId: 'session-7',
      createdAt: 3
    });
    const original = parseEnvelope(result.texts[0] ?? '');
    const tampered = {...original, payload: `${original.payload.slice(1)}X`};

    const assembler = new PartAssembler();
    assembler.add(original);
    expect(() => assembler.add(tampered)).toThrow(/different content/u);
  }, 20_000);

  it('detects a corrupted payload through the message hash', async () => {
    const result = await createParts('E'.repeat(6000), {
      ...offerOptions,
      sessionId: 'session-8',
      createdAt: 4
    });
    const assembler = new PartAssembler();
    for (const [index, text] of result.texts.entries()) {
      const envelope = parseEnvelope(text);
      assembler.add(
        index === 0 ? {...envelope, payload: `X${envelope.payload.slice(1)}`} : envelope
      );
    }

    expect(assembler.isComplete()).toBe(true);
    await expect(assembler.assemble()).rejects.toMatchObject({code: 'hash-mismatch'});
  }, 20_000);

  it('detects a tampered message length before hashing', async () => {
    const result = await createParts('short-code', {
      ...offerOptions,
      sessionId: 'session-9',
      createdAt: 5
    });
    const envelope = parseEnvelope(result.texts[0] ?? '');
    const assembler = new PartAssembler();
    assembler.add({...envelope, messageLength: envelope.messageLength + 1});

    await expect(assembler.assemble()).rejects.toMatchObject({code: 'length-mismatch'});
  });

  it('rejects input that exceeds the message and part limits', async () => {
    await expect(
      createParts('A'.repeat(MAX_MESSAGE_LENGTH + 1), offerOptions)
    ).rejects.toMatchObject({code: 'message-too-large'});

    await expect(createParts('', offerOptions)).rejects.toMatchObject({
      code: 'invalid-argument'
    });

    await expect(createParts('コード', offerOptions)).rejects.toMatchObject({
      code: 'invalid-argument'
    });

    await expect(
      createParts('A'.repeat(100 * 1024), {...offerOptions, errorCorrectionLevel: 'H'})
    ).rejects.toMatchObject({code: 'too-many-parts'});
  }, 30_000);

  it('clears the received state on demand', async () => {
    const result = await createParts('F'.repeat(6000), {
      ...offerOptions,
      sessionId: 'session-10',
      createdAt: 6
    });
    const assembler = new PartAssembler();
    assembler.add(parseEnvelope(result.texts[0] ?? ''));
    assembler.clear();

    expect(assembler.receivedCount()).toBe(0);
    expect(assembler.requiredCount()).toBe(0);
    expect(assembler.isComplete()).toBe(false);
  }, 20_000);
});

function decodeWithJsQr(text: string): string {
  const qr = QRCode.create([{data: new TextEncoder().encode(text), mode: 'byte'}], {
    errorCorrectionLevel: 'M'
  });
  const quiet = 4;
  const scale = 4;
  const width = (qr.modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixel = ((row + quiet) * scale + y) * width + (column + quiet) * scale + x;
          data[pixel * 4] = 0;
          data[pixel * 4 + 1] = 0;
          data[pixel * 4 + 2] = 0;
        }
      }
    }
  }
  const decoded = jsQR(data, width, width, {inversionAttempts: 'dontInvert'});
  if (!decoded) throw new Error('jsQR could not decode the generated QR.');
  return decoded.data;
}
