import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {CameraQrScanner, CAMERA_SOURCE_KEY, QR_DECODER_KEY} from '../src/ports/qr-scan.js';
import {createClock, FakeWebRtc, outgoingTexts, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Camera-source stand-in that counts leases, so lease churn is visible. */
function createCameraRuntime(queue: (string | null)[]): {
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
      scanFrame: () => {
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
    const hubRtc = new FakeWebRtc('hub', 6000);
    const cameraRtc = new FakeWebRtc('camera', 6000);
    const hub = new PairingController({
      enabled: true,
      webrtc: hubRtc,
      runtime: {},
      clock: harness.clock,
      now: () => 1000
    });
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const texts = outgoingTexts(hub, 's');
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
      'https://example.com/poster',
      '{"not":"an envelope"}',
      outgoingTexts(other, 'o')[0] ?? '',
      outgoingTexts(hub, 's')[0] ?? ''
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

    const decoderOnly: TurboWarpRuntime = {[QR_DECODER_KEY]: {scanFrame: () => null}};
    await expect(
      new CameraQrScanner(decoderOnly, 'test').scanOnce({cameraId: 'default', signal})
    ).rejects.toMatchObject({code: 'camera-unavailable'});
  });
});
