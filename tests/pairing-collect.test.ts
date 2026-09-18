import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {parseHeader} from '../src/qr/message.js';
import type {QrRead} from '../src/ports/qr-scan.js';
import {
  carry,
  createClock,
  FakeWebRtc,
  outgoingReads,
  readAt,
  type ClockHarness
} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

function controller(
  rtc: FakeWebRtc,
  options: {errorCorrectionLevel?: 'M' | 'H'} = {}
): PairingController {
  return new PairingController({
    enabled: true,
    webrtc: rtc,
    clock: harness.clock,
    now: () => 1000,
    runtime: {},
    ...options
  });
}

/** An offer at level H and version 15: small codes, so the header runs past the first one. */
async function smallCodeOffer(remotePeerId: string, sessionKey = 's') {
  const hub = controller(new FakeWebRtc(`hub-${sessionKey}-${remotePeerId}`, 1100), {
    errorCorrectionLevel: 'H'
  });
  await hub.startOfferPairing({sessionKey, localPeerId: 'studio', remotePeerId});
  return {hub, reads: outgoingReads(hub, sessionKey)};
}

function report(pairing: PairingController, session = 's') {
  const {readCount, lastRead, lastReadDetail, receivedParts, requiredParts, phase} =
    pairing.progress(session);
  return {readCount, lastRead, lastReadDetail, receivedParts, requiredParts, phase};
}

/** The same code with two bytes changed alike: its parity still matches, its content does not. */
function tampered(read: QrRead): QrRead {
  const bytes = read.bytes.slice();
  const end = bytes.length - 1;
  bytes[end] = (bytes[end] ?? 0) ^ 0x03;
  bytes[end - 1] = (bytes[end - 1] ?? 0) ^ 0x03;
  return {...read, bytes};
}

describe('collecting a sequence', () => {
  it('reads the header across the first codes when it does not fit in one', async () => {
    const {hub, reads} = await smallCodeOffer('cam-A');
    expect(parseHeader(readAt(reads, 0).text)).toBeUndefined();
    const old = await smallCodeOffer('cam-A', 'old');
    expect(readAt(old.reads, 1).structuredAppend?.parity).not.toBe(
      readAt(reads, 1).structuredAppend?.parity
    );
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    // A stray code of an old projection first: its header never shows, so it cannot hold on.
    await camera.ingestQrRead('s', readAt(old.reads, 1));
    for (const read of reads) await camera.ingestQrRead('s', read).catch(() => undefined);
    // The codes read while the stray one was held come round again.
    await carry(camera, 's', reads).catch(() => undefined);

    expect(report(camera)).toMatchObject({phase: 'answer-ready', receivedParts: reads.length});
    expect(camera.progress('s').exchangeId).toBe(hub.progress('s').exchangeId);
    hub.dispose();
    old.hub.dispose();
    camera.dispose();
  });

  it('drops a sequence for another device as soon as the codes carrying its header are in', async () => {
    const {hub, reads} = await smallCodeOffer('cam-B');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: 'cam-A'});

    await camera.ingestQrRead('s', readAt(reads, 0));
    expect(report(camera)).toMatchObject({lastRead: 'accepted', receivedParts: 1});
    await expect(camera.ingestQrRead('s', readAt(reads, 1))).rejects.toMatchObject({
      code: 'peer-mismatch'
    });
    expect(report(camera)).toMatchObject({
      readCount: 2,
      lastRead: 'foreign',
      lastReadDetail: 'peer-mismatch',
      receivedParts: 0
    });
    hub.dispose();
    camera.dispose();
  });

  it('keeps what it has when a code is not a valid Structured Append read', async () => {
    const {hub, reads} = await smallCodeOffer('cam-A');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await camera.ingestQrRead('s', readAt(reads, 0));

    const first = readAt(reads, 0);
    const broken: QrRead = {
      ...first,
      structuredAppend: {index: 20, count: 4, parity: first.structuredAppend?.parity ?? 0}
    };
    await expect(camera.ingestQrRead('s', broken)).rejects.toMatchObject({
      code: 'invalid-envelope'
    });
    expect(report(camera)).toMatchObject({readCount: 1, lastRead: 'accepted', receivedParts: 1});
    hub.dispose();
    camera.dispose();
  });

  it('hands the code over once when two reads complete the message at the same time', async () => {
    const hub = controller(new FakeWebRtc('hub', 1100));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const reads = outgoingReads(hub, 's');
    const cameraRtc = new FakeWebRtc('camera');
    const camera = controller(cameraRtc);
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await carry(camera, 's', reads.slice(0, -1));

    const last = readAt(reads, reads.length - 1);
    const results = await Promise.allSettled([
      camera.ingestQrRead('s', last),
      camera.ingestQrRead('s', last),
      camera.ingestQrText('s', hub.messageText('s'))
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect(cameraRtc.acceptedOffers).toHaveLength(1);
    expect(report(camera)).toMatchObject({lastRead: 'duplicate', phase: 'answer-ready'});
    hub.dispose();
    camera.dispose();
  });

  it('counts the last code once when the message fails its check', async () => {
    const hub = controller(new FakeWebRtc('hub', 1100));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const reads = outgoingReads(hub, 's');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    const damaged = reads.map((read, index) => (index === reads.length - 1 ? tampered(read) : read));
    await expect(carry(camera, 's', damaged)).rejects.toMatchObject({code: 'hash-mismatch'});
    expect(report(camera)).toMatchObject({
      readCount: reads.length,
      lastRead: 'foreign',
      lastReadDetail: 'hash-mismatch'
    });
    hub.dispose();
    camera.dispose();
  });

  it('keeps the delivered message when a conflicting code arrives afterwards', async () => {
    const hub = controller(new FakeWebRtc('hub', 1100));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const reads = outgoingReads(hub, 's');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await carry(camera, 's', reads);

    await expect(camera.ingestQrRead('s', tampered(readAt(reads, 0)))).rejects.toMatchObject({
      code: 'already-accepted'
    });
    expect(report(camera)).toMatchObject({
      lastRead: 'foreign',
      receivedParts: reads.length,
      requiredParts: reads.length
    });
    await expect(camera.ingestQrRead('s', readAt(reads, 1))).rejects.toMatchObject({
      code: 'already-accepted'
    });
    expect(report(camera)).toMatchObject({lastRead: 'duplicate', receivedParts: reads.length});
    hub.dispose();
    camera.dispose();
  });
});
