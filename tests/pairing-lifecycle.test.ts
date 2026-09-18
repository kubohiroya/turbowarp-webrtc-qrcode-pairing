import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {carry, createClock, FakeWebRtc, outgoingReads, readAt, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

function createHub(rtc: FakeWebRtc): PairingController {
  return new PairingController({
    enabled: true,
    webrtc: rtc,
    clock: harness.clock,
    now: () => 1000,
    runtime: {}
  });
}

function createCamera(rtc: FakeWebRtc): PairingController {
  return new PairingController({
    enabled: true,
    webrtc: rtc,
    clock: harness.clock,
    now: () => 2000,
    runtime: {}
  });
}

describe('pairing lifecycle', () => {
  it('drops an offer that resolves after the session was cancelled', async () => {
    const rtc = new FakeWebRtc('hub');
    const hub = createHub(rtc);

    rtc.hold();
    const starting = hub.startOfferPairing({
      sessionKey: 's',
      localPeerId: 'studio',
      remotePeerId: 'cam-A'
    });
    hub.cancelPairing('s');
    rtc.release();
    await starting;

    expect(hub.progress('s').phase).toBe('cancelled');
    expect(hub.progress('s').outgoingPartCount).toBe(0);
    hub.dispose();
  });

  it('starts a new exchange on retry and refuses the previous answer', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = createHub(hubRtc);
    const camera = createCamera(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingReads(hub, 's'));
    const staleAnswer = outgoingReads(camera, 's');
    const firstExchange = hub.progress('s').exchangeId;

    await hub.retryPairing('s');
    const secondExchange = hub.progress('s').exchangeId;

    expect(hub.progress('s').phase).toBe('offer-ready');
    expect(secondExchange).not.toBe(firstExchange);
    expect(hubRtc.createOfferCalls).toBe(2);
    await expect(hub.ingestQrRead('s', readAt(staleAnswer, 0))).rejects.toMatchObject({
      code: 'stale-exchange'
    });
    expect(hubRtc.acceptedAnswers).toHaveLength(0);

    hub.dispose();
    camera.dispose();
  });

  it('expires on the monotonic clock without consulting the wall clock', async () => {
    const rtc = new FakeWebRtc('hub');
    // A wall clock that jumps backwards must not affect the deadline.
    const hub = new PairingController({
      enabled: true,
      webrtc: rtc,
      clock: harness.clock,
      now: () => 1_000_000,
      runtime: {}
    });

    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.setTimeoutSeconds('s', 2);
    expect(hub.progress('s').remainingSeconds).toBe(2);

    await harness.advance(1000);
    expect(hub.progress('s').phase).toBe('offer-ready');

    await harness.advance(1500);
    expect(hub.progress('s').phase).toBe('expired');
    expect(hub.progress('s').errorCode).toBe('timeout');
    expect(hub.progress('s').remainingSeconds).toBe(0);
    // An exchange that never connected releases its peer connection.
    expect(rtc.closed).toEqual(['cam-A']);

    hub.dispose();
  });

  it('rejects a timeout outside the supported range', async () => {
    const hub = createHub(new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    expect(() => hub.setTimeoutSeconds('s', 0)).toThrowError(
      expect.objectContaining({code: 'invalid-argument'})
    );
    expect(() => hub.setTimeoutSeconds('s', 3601)).toThrowError(
      expect.objectContaining({code: 'invalid-argument'})
    );

    hub.dispose();
  });

  it('reports a failed connection and releases the peer', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = createHub(hubRtc);
    const camera = createCamera(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingReads(hub, 's'));
    await carry(hub, 's', outgoingReads(camera, 's'));

    // Attach the assertion before the rejection happens, so the rejection is
    // never momentarily unhandled.
    const waiting = expect(hub.waitUntilConnected('s')).rejects.toMatchObject({
      code: 'webrtc-rejected'
    });
    hubRtc.fail('cam-A');
    await harness.advance(300);

    await waiting;
    expect(hub.progress('s').phase).toBe('failed');

    hub.dispose();
    camera.dispose();
  });

  it('resolves waiters on connection and leaves the connection alone afterwards', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = createHub(hubRtc);
    const camera = createCamera(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingReads(hub, 's'));
    await carry(hub, 's', outgoingReads(camera, 's'));

    const waiting = hub.waitUntilConnected('s');
    hubRtc.connect('cam-A');
    await harness.advance(300);
    await expect(waiting).resolves.toBeUndefined();

    // Project run stop releases displays and buffers but keeps the connection.
    hub.stopTransient();
    expect(hub.progress('s').phase).toBe('connected');
    expect(hubRtc.closed).toEqual([]);

    // The deadline no longer applies once the exchange is finished.
    await harness.advance(700_000);
    expect(hub.progress('s').phase).toBe('connected');

    hub.dispose();
    camera.dispose();
  });

  it('forgets the QR codes, which carry the pairing codes, once the exchange connects', async () => {
    const hubRtc = new FakeWebRtc('hub', 1100);
    const cameraRtc = new FakeWebRtc('camera', 1100);
    const hub = createHub(hubRtc);
    const camera = createCamera(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingReads(hub, 's'));
    await carry(hub, 's', outgoingReads(camera, 's'));
    expect(hub.progress('s').outgoingPartCount).toBeGreaterThan(1);

    hubRtc.connect('cam-A');
    cameraRtc.connect('studio');
    await harness.advance(300);

    for (const side of [hub, camera]) {
      expect(side.progress('s')).toMatchObject({
        phase: 'connected',
        outgoingPartCount: 0,
        outgoingCurrentPart: 0,
        receivedParts: 0,
        requiredParts: 0
      });
      expect(side.outgoingSymbols('s')).toEqual([]);
      expect(side.messageText('s')).toBe('');
      expect(side.partSvg('s', 1)).toBe('');
    }
    expect(hubRtc.closed).toEqual([]);

    hub.dispose();
    camera.dispose();
  });

  it('forgets the QR codes when the exchange is cancelled', async () => {
    const hub = createHub(new FakeWebRtc('hub', 1100));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.cancelPairing('s');
    expect(hub.progress('s').outgoingPartCount).toBe(0);
    expect(hub.messageText('s')).toBe('');
    hub.dispose();
  });

  it('cancels exchanges in progress on project run stop but keeps the session list', async () => {
    const rtc = new FakeWebRtc('hub');
    const hub = createHub(rtc);
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    hub.stopTransient();

    expect(hub.progress('s').phase).toBe('cancelled');
    expect(rtc.closed).toEqual(['cam-A']);
    expect(hub.sessionKeys()).toEqual(['s']);

    hub.dispose();
    expect(hub.sessionKeys()).toEqual([]);
  });

  it('stops ticking once a session reaches a terminal phase', async () => {
    const rtc = new FakeWebRtc('hub');
    const hub = createHub(rtc);
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.cancelPairing('s');

    await harness.advance(5000);
    expect(vi.getTimerCount()).toBe(0);

    hub.dispose();
  });
});
