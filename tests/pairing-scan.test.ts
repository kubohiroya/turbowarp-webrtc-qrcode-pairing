import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {
  CameraQrScanner,
  CAMERA_SOURCE_KEY,
  QR_DECODER_KEY,
  type QrRead
} from '../src/ports/qr-scan.js';
import {createClock, FakeWebRtc, loneRead, outgoingReads, readAt, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Camera-source stand-in that counts leases, so lease churn is visible. */
function createCameraRuntime(queue: (QrRead | null)[]): {
  runtime: TurboWarpRuntime;
  acquired: string[];
  released: number;
  scanned: number;
} {
  const state = {acquired: [] as string[], released: 0, scanned: 0};
  const runtime: TurboWarpRuntime = {
    [CAMERA_SOURCE_KEY]: {
      acquireCamera: async (options: {owner: string; cameraId: string}) => {
        state.acquired.push(options.cameraId);
        return {
          getFrameSource: () => ({element: {}, width: 640, height: 480}),
          release: async () => {
            state.released += 1;
          }
        };
      }
    },
    [QR_DECODER_KEY]: {
      capabilityVersion: 2,
      readFrame: async () => {
        state.scanned += 1;
        return queue.length > 0 ? (queue.shift() ?? null) : null;
      }
    }
  };
  return {
    runtime,
    get acquired() {
      return state.acquired;
    },
    get released() {
      return state.released;
    },
    get scanned() {
      return state.scanned;
    }
  };
}

describe('camera scanning', () => {
  it('holds one camera lease for the whole exchange', async () => {
    const hubRtc = new FakeWebRtc('hub', 1100);
    const cameraRtc = new FakeWebRtc('camera', 1100);
    const hub = new PairingController({
      enabled: true,
      webrtc: hubRtc,
      runtime: {},
      clock: harness.clock,
      now: () => 1000
    });
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const texts = outgoingReads(hub, 's');
    expect(texts.length).toBeGreaterThan(1);

    // The camera sees nothing, then each part in turn.
    const source = createCameraRuntime([null, ...texts]);
    const camera = new PairingController({
      enabled: true,
      webrtc: cameraRtc,
      runtime: source.runtime,
      scan: new CameraQrScanner(source.runtime, 'test'),
      clock: harness.clock,
      now: () => 2000
    });
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    const scanning = camera.scanFromCamera('s', 'front');
    await harness.advance(200 * (texts.length + 2));
    await scanning;

    expect(camera.progress('s').phase).toBe('answer-ready');
    // One acquire for the session, not one per part.
    expect(source.acquired).toEqual(['front']);
    expect(source.released).toBe(1);

    hub.dispose();
    camera.dispose();
  }, 20_000);

  it('collects a looping offer in whatever order the camera catches it', async () => {
    const hub = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('hub', 1100),
      runtime: {},
      clock: harness.clock,
      now: () => 1000
    });
    const old = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('old', 1100),
      runtime: {},
      clock: harness.clock,
      now: () => 500
    });
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await old.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const reads = outgoingReads(hub, 's');
    expect(reads.length).toBeGreaterThanOrEqual(3);
    const last = reads.length - 1;

    // The camera first catches a stray code of an old projection, then the hub's
    // loop from the middle, with frames missed and codes read twice.
    const source = createCameraRuntime([
      readAt(outgoingReads(old, 's'), 1),
      readAt(reads, last),
      null,
      readAt(reads, last),
      readAt(reads, 0),
      readAt(reads, 1),
      ...reads.slice(2, last),
      // The last code was only seen while the old sequence was held, so the loop brings it round again.
      readAt(reads, last)
    ]);
    const camera = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('camera'),
      runtime: source.runtime,
      scan: new CameraQrScanner(source.runtime, 'test'),
      clock: harness.clock,
      now: () => 2000
    });
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    const scanning = camera.scanFromCamera('s', 'default');
    await harness.advance(200 * (reads.length + 6));
    await scanning;

    expect(camera.progress('s')).toMatchObject({
      phase: 'answer-ready',
      exchangeId: hub.progress('s').exchangeId,
      receivedParts: reads.length,
      requiredParts: reads.length
    });

    hub.dispose();
    old.dispose();
    camera.dispose();
  }, 20_000);

  it('skips codes that belong to something else and keeps scanning', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const otherRtc = new FakeWebRtc('other');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = new PairingController({
      enabled: true,
      webrtc: hubRtc,
      runtime: {},
      clock: harness.clock,
      now: () => 1000
    });
    const other = new PairingController({
      enabled: true,
      webrtc: otherRtc,
      runtime: {},
      clock: harness.clock,
      now: () => 1000
    });
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await other.startOfferPairing({sessionKey: 'o', localPeerId: 'other', remotePeerId: 'cam-Z'});

    const source = createCameraRuntime([
      loneRead('https://example.com/poster'),
      loneRead('{"not":"a pairing message"}'),
      readAt(outgoingReads(other, 'o'), 0),
      readAt(outgoingReads(hub, 's'), 0)
    ]);
    const camera = new PairingController({
      enabled: true,
      webrtc: cameraRtc,
      runtime: source.runtime,
      scan: new CameraQrScanner(source.runtime, 'test'),
      clock: harness.clock,
      now: () => 2000
    });
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: 'cam-A'});

    const scanning = camera.scanFromCamera('s', 'default');
    await harness.advance(2000);
    await scanning;

    expect(camera.progress('s').phase).toBe('answer-ready');
    expect(cameraRtc.acceptedOffers).toHaveLength(1);

    hub.dispose();
    other.dispose();
    camera.dispose();
  });

  it('stops scanning and releases the lease when the session is cancelled', async () => {
    const source = createCameraRuntime([]);
    const camera = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('camera'),
      runtime: source.runtime,
      scan: new CameraQrScanner(source.runtime, 'test'),
      clock: harness.clock,
      now: () => 2000
    });
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    const scanning = camera.scanFromCamera('s', 'default');
    await harness.advance(500);
    camera.cancelPairing('s');
    await scanning;

    expect(camera.progress('s').phase).toBe('cancelled');
    expect(source.released).toBe(1);

    camera.dispose();
  });

  it('refuses a second scan on the same session', async () => {
    const source = createCameraRuntime([]);
    const camera = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('camera'),
      runtime: source.runtime,
      scan: new CameraQrScanner(source.runtime, 'test'),
      clock: harness.clock,
      now: () => 2000
    });
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});

    const scanning = camera.scanFromCamera('s', 'default');
    await harness.advance(200);
    await expect(camera.scanFromCamera('s', 'default')).rejects.toMatchObject({
      code: 'invalid-argument'
    });

    camera.cancelPairing('s');
    await scanning;
    camera.dispose();
  });

  it('reports missing companion extensions instead of decoding frames itself', async () => {
    const bare: TurboWarpRuntime = {};
    const scanner = new CameraQrScanner(bare, 'test');
    const signal = new AbortController().signal;

    await expect(scanner.scanOnce({cameraId: 'default', signal})).rejects.toMatchObject({
      code: 'qr-decoder-missing'
    });

    // turbowarp-jsqr before 0.4.0 returns text only, which cannot tell the codes of a sequence apart.
    const oldDecoder: TurboWarpRuntime = {
      [QR_DECODER_KEY]: {capabilityVersion: 1, scanFrame: () => null, readFrame: async () => null}
    };
    await expect(
      new CameraQrScanner(oldDecoder, 'test').scanOnce({cameraId: 'default', signal})
    ).rejects.toMatchObject({code: 'qr-decoder-missing'});

    const decoderOnly: TurboWarpRuntime = {
      [QR_DECODER_KEY]: {capabilityVersion: 2, readFrame: async () => null}
    };
    await expect(
      new CameraQrScanner(decoderOnly, 'test').scanOnce({cameraId: 'default', signal})
    ).rejects.toMatchObject({code: 'camera-unavailable'});
  });
});
