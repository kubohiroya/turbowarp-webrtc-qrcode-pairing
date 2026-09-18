import {describe, expect, it} from 'vitest';
import {createPairingCodes, PairingAssembler, readPairingMessage} from '../src/qr/courier.js';
import {MAX_MESSAGE_LENGTH, MAX_PART_COUNT} from '../src/qr/limits.js';
import {formatMessage, parseHeader, parseMessage, QR_PROTOCOL} from '../src/qr/message.js';

/** About the length of a real pairing offer. */
const OFFER_LENGTH = 1250;

const offerOptions = {
  senderPeerId: 'studio',
  targetPeerId: 'cam-A',
  kind: 'offer' as const,
  sessionId: 'session-1',
  createdAt: 1000
};

function reads(codes: Awaited<ReturnType<typeof createPairingCodes>>) {
  return codes.symbols.map(({index, count, parity, bytes}) => ({index, count, parity, bytes}));
}

describe('pairing codes', () => {
  it('carries a pairing code in one Structured Append sequence and back unchanged', async () => {
    const payload = 'abc_DEF-123'.repeat(20);
    const codes = await createPairingCodes(payload, offerOptions);
    expect(codes.text.startsWith(`${QR_PROTOCOL}\n`)).toBe(true);
    expect(codes.svgs).toHaveLength(codes.symbols.length);
    expect(codes.svgs[0]).toContain('<svg');
    expect(codes.messageId).toMatch(/^session-1\.[A-Za-z0-9_-]{12}$/u);

    const assembler = new PairingAssembler();
    for (const read of reads(codes)) assembler.add(read);
    const message = await assembler.assemble();
    expect(message.payload).toBe(payload);
    expect(message.header).toMatchObject({
      sessionId: 'session-1',
      senderPeerId: 'studio',
      targetPeerId: 'cam-A',
      kind: 'offer',
      replyTo: '',
      createdAt: 1000,
      messageLength: payload.length
    });
  });

  it('splits an offer-sized code into a few coarse codes at the offer cap', async () => {
    const codes = await createPairingCodes('A'.repeat(OFFER_LENGTH), {...offerOptions, maxVersion: 15});
    expect(codes.symbols.length).toBeGreaterThanOrEqual(3);
    expect(codes.symbols.length).toBeLessThanOrEqual(5);
    for (const symbol of codes.symbols) expect(symbol.version).toBeLessThanOrEqual(15);

    const answer = await createPairingCodes('A'.repeat(OFFER_LENGTH), {
      ...offerOptions,
      kind: 'answer',
      replyTo: codes.messageId,
      maxVersion: 20
    });
    expect(answer.symbols.length).toBeLessThan(codes.symbols.length);
    for (const symbol of answer.symbols) expect(symbol.version).toBeLessThanOrEqual(20);
  });

  it('puts the whole header in the first code', async () => {
    const codes = await createPairingCodes('A'.repeat(OFFER_LENGTH), offerOptions);
    const first = codes.symbols[0];
    expect(first).toBeDefined();
    let prefix = '';
    for (const byte of first?.bytes ?? []) prefix += String.fromCharCode(byte);
    expect(parseHeader(prefix)).toMatchObject({sessionId: 'session-1', kind: 'offer'});
  });

  it('collects the codes in any order and reports repeats and other sequences', async () => {
    const codes = await createPairingCodes('B'.repeat(OFFER_LENGTH), offerOptions);
    const other = await createPairingCodes('C'.repeat(OFFER_LENGTH), {
      ...offerOptions,
      sessionId: 'session-2'
    });
    const all = reads(codes);
    const last = all.length - 1;
    const assembler = new PairingAssembler();

    expect(assembler.add(all[last] ?? all[0]!)).toMatchObject({result: 'accepted', received: 1});
    expect(assembler.requiredCount()).toBe(all.length);
    expect(assembler.missingParts()).toEqual(Array.from({length: last}, (_unused, index) => index));
    expect(assembler.add(all[last]!)).toMatchObject({result: 'duplicate', received: 1});
    expect(assembler.add(reads(other)[0]!)).toMatchObject({result: 'foreign', received: 1});

    for (const read of all.slice(0, last).reverse()) assembler.add(read);
    expect(assembler.isComplete()).toBe(true);
    expect((await assembler.assemble()).payload).toBe('B'.repeat(OFFER_LENGTH));

    assembler.clear();
    expect(assembler.receivedCount()).toBe(0);
    expect(assembler.requiredCount()).toBe(0);
  });

  it('refuses a position that arrives twice with different content', async () => {
    const codes = await createPairingCodes('D'.repeat(OFFER_LENGTH), offerOptions);
    const [first] = reads(codes);
    const assembler = new PairingAssembler();
    assembler.add(first!);
    const bytes = first!.bytes.slice();
    bytes[bytes.length - 1] = 0x21;
    expect(() => assembler.add({...first!, bytes})).toThrowError(
      expect.objectContaining({code: 'conflicting-part'})
    );
  });

  it('refuses a message that fails its hash or its length', async () => {
    const codes = await createPairingCodes('E'.repeat(64), offerOptions);
    const damaged = codes.text.replace(/E$/u, 'F');
    await expect(readPairingMessage(damaged)).rejects.toMatchObject({code: 'hash-mismatch'});
    await expect(readPairingMessage(`${codes.text}E`)).rejects.toMatchObject({
      code: 'length-mismatch'
    });
    expect((await readPairingMessage(codes.text)).payload).toBe('E'.repeat(64));
  });

  it('carries the answer back with the offer session and reply-to message ID', async () => {
    const offer = await createPairingCodes('offer-code', offerOptions);
    const answer = await createPairingCodes('answer-code', {
      senderPeerId: 'cam-A',
      targetPeerId: 'studio',
      kind: 'answer',
      sessionId: offer.sessionId,
      replyTo: offer.messageId,
      createdAt: 2000
    });
    expect(parseMessage(answer.text).header).toMatchObject({
      sessionId: 'session-1',
      replyTo: offer.messageId,
      kind: 'answer'
    });
  });

  it('rejects an answer without reply-to and an offer that sets it', async () => {
    await expect(
      createPairingCodes('x', {...offerOptions, kind: 'answer'})
    ).rejects.toMatchObject({code: 'invalid-argument'});
    await expect(
      createPairingCodes('x', {...offerOptions, replyTo: 'session-0.abc'})
    ).rejects.toMatchObject({code: 'invalid-argument'});
  });

  it('refuses a version cap that is not a QR version', async () => {
    for (const maxVersion of [0, 41, 12.5]) {
      await expect(
        createPairingCodes('x', {...offerOptions, maxVersion})
      ).rejects.toMatchObject({code: 'invalid-argument'});
    }
  });

  it('refuses codes that would need more than the Structured Append limit', async () => {
    expect(MAX_PART_COUNT).toBe(16);
    await expect(
      createPairingCodes('G'.repeat(8000), {...offerOptions, maxVersion: 10})
    ).rejects.toMatchObject({code: 'too-many-parts'});
    await expect(
      createPairingCodes('G'.repeat(MAX_MESSAGE_LENGTH + 1), {...offerOptions, maxVersion: 40})
    ).rejects.toMatchObject({code: 'message-too-large'});
    await expect(createPairingCodes('', offerOptions)).rejects.toMatchObject({
      code: 'invalid-argument'
    });
    await expect(createPairingCodes('カメラ', offerOptions)).rejects.toMatchObject({
      code: 'invalid-argument'
    });
  });
});

describe('pairing message text', () => {
  const header = {
    sessionId: 's',
    senderPeerId: 'a',
    targetPeerId: 'b',
    kind: 'offer' as const,
    messageId: 's.abcdefabcdef',
    replyTo: '',
    createdAt: 1,
    messageLength: 3,
    messageHash: 'A'.repeat(43)
  };

  it('reads the header as soon as its line has ended', () => {
    const text = formatMessage({header, payload: 'xyz'});
    const headerEnd = text.indexOf('\n', QR_PROTOCOL.length + 1);
    expect(parseHeader(text.slice(0, 3))).toBeUndefined();
    expect(parseHeader(text.slice(0, headerEnd))).toBeUndefined();
    expect(parseHeader(text.slice(0, headerEnd + 1))).toEqual(header);
  });

  it('rejects text that is not a pairing message, including the twqr/1 format', () => {
    expect(() => parseHeader('https://example.com/')).toThrowError(
      expect.objectContaining({code: 'unsupported-protocol'})
    );
    expect(() => parseHeader('{"protocol":"twqr/1"}')).toThrowError(
      expect.objectContaining({code: 'unsupported-protocol'})
    );
    expect(() => parseHeader(`${QR_PROTOCOL}\nnot json\n`)).toThrowError(
      expect.objectContaining({code: 'invalid-json'})
    );
    expect(() => parseHeader(`${QR_PROTOCOL}\n{"kind":"offer"}\n`)).toThrowError(
      expect.objectContaining({code: 'invalid-envelope'})
    );
    expect(() => parseMessage(`${QR_PROTOCOL}\n${JSON.stringify(header)}`)).toThrowError(
      expect.objectContaining({code: 'invalid-envelope'})
    );
  });
});
