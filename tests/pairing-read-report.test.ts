import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {createClock, FakeWebRtc, outgoingReads, readAt, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

function controller(rtc: FakeWebRtc): PairingController {
  return new PairingController({
    enabled: true,
    webrtc: rtc,
    clock: harness.clock,
    now: () => 1000,
    runtime: {}
  });
}

/** The latest read as the application's blocks would see it. */
function report(pairing: PairingController, session: string) {
  const {readCount, lastRead, lastReadDetail, receivedParts, requiredParts, phase} =
    pairing.progress(session);
  return {readCount, lastRead, lastReadDetail, receivedParts, requiredParts, phase};
}

/** A hub offering a code long enough to need several codes at the default version cap. */
async function multiPartOffer(sessionKey = 's', remotePeerId = 'cam-A') {
  const hub = controller(new FakeWebRtc('hub', 1100));
  await hub.startOfferPairing({sessionKey, localPeerId: 'studio', remotePeerId});
  return {hub, reads: outgoingReads(hub, sessionKey)};
}

describe('what each pairing QR read turns out to be', () => {
  it('takes parts in any order, and reports a part read again as a harmless duplicate', async () => {
    const {hub, reads} = await multiPartOffer();
    expect(reads.length).toBeGreaterThanOrEqual(3);
    const total = reads.length;
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    expect(report(camera, 's')).toMatchObject({readCount: 0, lastRead: '', lastReadDetail: ''});

    await camera.ingestQrRead('s', readAt(reads, total - 1));
    expect(report(camera, 's')).toMatchObject({
      readCount: 1,
      lastRead: 'accepted',
      lastReadDetail: `${total} / ${total}`,
      receivedParts: 1
    });

    // The same code again, as a camera held in front of it would read it: noted, nothing changes.
    await camera.ingestQrRead('s', readAt(reads, total - 1));
    expect(report(camera, 's')).toMatchObject({
      readCount: 2,
      lastRead: 'duplicate',
      lastReadDetail: `${total} / ${total}`,
      receivedParts: 1
    });

    for (const read of reads.slice(0, total - 1).reverse()) await camera.ingestQrRead('s', read);
    expect(report(camera, 's')).toMatchObject({
      readCount: total + 1,
      lastRead: 'accepted',
      lastReadDetail: `1 / ${total}`,
      receivedParts: total
    });
    expect(camera.progress('s').phase).not.toBe('receiving');

    hub.dispose();
    camera.dispose();
  });

  it('ignores a code of another sequence and says so, keeping what it has', async () => {
    const first = await multiPartOffer('s', 'cam-A');
    const other = await multiPartOffer('s', 'cam-B');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    await camera.ingestQrRead('s', readAt(first.reads, 0));
    await expect(camera.ingestQrRead('s', readAt(other.reads, 1))).rejects.toMatchObject({
      code: 'message-mismatch'
    });
    expect(report(camera, 's')).toMatchObject({
      readCount: 2,
      lastRead: 'foreign',
      lastReadDetail: 'message-mismatch',
      receivedParts: 1,
      phase: 'receiving'
    });

    // The exchange carries on with its own parts.
    await camera.ingestQrRead('s', readAt(first.reads, 1));
    expect(report(camera, 's')).toMatchObject({lastRead: 'accepted', receivedParts: 2});

    first.hub.dispose();
    other.hub.dispose();
    camera.dispose();
  });

  it('drops a sequence whose first code is addressed to another device', async () => {
    const {hub, reads} = await multiPartOffer('s', 'cam-B');
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: 'cam-A'});

    await camera.ingestQrRead('s', readAt(reads, 1));
    expect(report(camera, 's')).toMatchObject({lastRead: 'accepted', receivedParts: 1});
    await expect(camera.ingestQrRead('s', readAt(reads, 0))).rejects.toMatchObject({
      code: 'peer-mismatch'
    });
    expect(report(camera, 's')).toMatchObject({
      readCount: 2,
      lastRead: 'foreign',
      lastReadDetail: 'peer-mismatch',
      receivedParts: 0,
      requiredParts: 0
    });
    expect(camera.progress('s').errorCode).toBe('');
    hub.dispose();
    camera.dispose();
  });

  it('reports the hub reading its own offer as foreign rather than failing', async () => {
    const {hub, reads} = await multiPartOffer();
    await expect(hub.ingestQrRead('s', readAt(reads, 0))).rejects.toMatchObject({
      code: 'unexpected-kind'
    });
    expect(report(hub, 's')).toMatchObject({
      readCount: 1,
      lastRead: 'foreign',
      lastReadDetail: 'unexpected-kind'
    });
    expect(hub.progress('s').errorCode).toBe('');
    hub.dispose();
  });

  it('does not report a QR code that is not a pairing code at all', async () => {
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await expect(camera.ingestQrText('s', 'https://example.com/poster')).rejects.toBeDefined();
    expect(report(camera, 's')).toMatchObject({readCount: 0, lastRead: ''});
    camera.dispose();
  });

  it('starts the report again when the exchange is retried', async () => {
    const {hub, reads} = await multiPartOffer();
    const camera = controller(new FakeWebRtc('camera'));
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await camera.ingestQrRead('s', readAt(reads, 0));
    expect(report(camera, 's').readCount).toBe(1);

    await camera.retryPairing('s');
    expect(report(camera, 's')).toMatchObject({readCount: 0, lastRead: '', lastReadDetail: ''});
    hub.dispose();
    camera.dispose();
  });
});
