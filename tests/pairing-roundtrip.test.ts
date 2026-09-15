import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {carry, createClock, FakeWebRtc, outgoingTexts, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

interface Pair {
  hub: PairingController;
  camera: PairingController;
  hubRtc: FakeWebRtc;
  cameraRtc: FakeWebRtc;
}

function createPair(codeLength: number): Pair {
  const hubRtc = new FakeWebRtc('hub', codeLength);
  const cameraRtc = new FakeWebRtc('camera', codeLength);
  return {
    hubRtc,
    cameraRtc,
    hub: new PairingController({
      enabled: true,
      webrtc: hubRtc,
      clock: harness.clock,
      now: () => 1000,
      runtime: {}
    }),
    camera: new PairingController({
      enabled: true,
      webrtc: cameraRtc,
      clock: harness.clock,
      now: () => 2000,
      runtime: {}
    })
  };
}

describe('offer and answer round trip', () => {
  it('completes a single-part exchange and reports connection separately from transport', async () => {
    const {hub, camera, hubRtc, cameraRtc} = createPair(48);

    camera.startAnswerPairing({sessionKey: 'pairing-1', expectedLocalPeerId: ''});
    await hub.startOfferPairing({
      sessionKey: 'pairing-1',
      localPeerId: 'studio',
      remotePeerId: 'cam-A'
    });

    expect(hub.progress('pairing-1').phase).toBe('offer-ready');
    expect(hub.progress('pairing-1').outgoingPartCount).toBe(1);
    expect(camera.progress('pairing-1').phase).toBe('awaiting-offer');

    await carry(camera, 'pairing-1', outgoingTexts(hub, 'pairing-1'));
    expect(camera.progress('pairing-1').phase).toBe('answer-ready');

    await carry(hub, 'pairing-1', outgoingTexts(camera, 'pairing-1'));
    // The QR transport is finished, but the connection is not established yet.
    expect(hub.progress('pairing-1').phase).toBe('connecting');
    expect(hub.isConnected('pairing-1')).toBe(false);

    hubRtc.connect('cam-A');
    cameraRtc.connect('studio');
    await harness.advance(300);

    expect(hub.progress('pairing-1').phase).toBe('connected');
    expect(camera.progress('pairing-1').phase).toBe('connected');
    expect(hub.isConnected('pairing-1')).toBe(true);

    hub.dispose();
    camera.dispose();
  });

  it('maps peers without requiring both ends to be configured alike', async () => {
    const {hub, camera, hubRtc, cameraRtc} = createPair(48);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingTexts(hub, 's'));
    await carry(hub, 's', outgoingTexts(camera, 's'));

    // The hub knows the camera as cam-A; the camera knows the hub as studio.
    expect(hubRtc.acceptedAnswers.map((call) => call.peer)).toEqual(['cam-A']);
    expect(cameraRtc.acceptedOffers.map((call) => call.peer)).toEqual(['studio']);
    expect(camera.progress('s').localPeerId).toBe('cam-A');
    expect(camera.progress('s').remotePeerId).toBe('studio');

    hub.dispose();
    camera.dispose();
  });

  it('carries a multi-part exchange out of order and with duplicates', async () => {
    const {hub, camera} = createPair(6000);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    const offerTexts = outgoingTexts(hub, 's');
    expect(offerTexts.length).toBeGreaterThan(1);

    await camera.ingestQrText('s', offerTexts[offerTexts.length - 1] ?? '');
    const partial = camera.progress('s');
    expect(partial.phase).toBe('receiving');
    expect(partial.requiredParts).toBe(offerTexts.length);
    expect(partial.receivedParts).toBe(1);
    expect(partial.missingParts).toEqual(
      Array.from({length: offerTexts.length - 1}, (_unused, index) => index + 1)
    );

    // A camera reads the same symbol repeatedly; duplicates are normal.
    await camera.ingestQrText('s', offerTexts[offerTexts.length - 1] ?? '');
    await carry(camera, 's', [...offerTexts].reverse());
    expect(camera.progress('s').phase).toBe('answer-ready');
    expect(camera.progress('s').missingParts).toEqual([]);

    await carry(hub, 's', [...outgoingTexts(camera, 's')].reverse());
    expect(hub.progress('s').phase).toBe('connecting');

    hub.dispose();
    camera.dispose();
  }, 20_000);

  it('keeps two cameras on separate sessions and peers', async () => {
    const hubRtc = new FakeWebRtc('hub', 48);
    const hub = new PairingController({
      enabled: true,
      webrtc: hubRtc,
      clock: harness.clock,
      now: () => 1000,
      runtime: {}
    });
    const cameraA = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('camera-a', 48),
      clock: harness.clock,
      now: () => 2000,
      runtime: {}
    });
    const cameraB = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('camera-b', 48),
      clock: harness.clock,
      now: () => 3000,
      runtime: {}
    });

    cameraA.startAnswerPairing({sessionKey: 'x', expectedLocalPeerId: ''});
    cameraB.startAnswerPairing({sessionKey: 'x', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 'a', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await hub.startOfferPairing({sessionKey: 'b', localPeerId: 'studio', remotePeerId: 'cam-B'});

    await carry(cameraA, 'x', outgoingTexts(hub, 'a'));
    await carry(cameraB, 'x', outgoingTexts(hub, 'b'));

    const answerA = outgoingTexts(cameraA, 'x');
    const answerB = outgoingTexts(cameraB, 'x');

    // Camera B's answer must not be accepted for camera A's exchange.
    await expect(hub.ingestQrText('a', answerB[0] ?? '')).rejects.toMatchObject({
      code: 'stale-exchange'
    });

    await carry(hub, 'a', answerA);
    await carry(hub, 'b', answerB);

    expect(hubRtc.acceptedAnswers.map((call) => call.peer)).toEqual(['cam-A', 'cam-B']);
    expect(hubRtc.acceptedAnswers[0]?.code).not.toBe(hubRtc.acceptedAnswers[1]?.code);

    hub.dispose();
    cameraA.dispose();
    cameraB.dispose();
  });

  it('selects parts for display and wraps at the end', async () => {
    const {hub, camera} = createPair(6000);
    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    const total = hub.progress('s').outgoingPartCount;
    expect(hub.progress('s').outgoingCurrentPart).toBe(0);
    expect(hub.selectPart('s', 1)).toContain('<svg');
    expect(hub.progress('s').outgoingCurrentPart).toBe(1);
    hub.selectPart('s', total);
    hub.selectNextPart('s');
    expect(hub.progress('s').outgoingCurrentPart).toBe(1);
    expect(() => hub.selectPart('s', total + 1)).toThrowError(
      expect.objectContaining({code: 'invalid-argument'})
    );

    hub.dispose();
    camera.dispose();
  }, 20_000);
});
