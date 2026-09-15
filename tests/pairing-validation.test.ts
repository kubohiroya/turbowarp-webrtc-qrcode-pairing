import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {parseEnvelope, serializeEnvelope, type QrEnvelopeV1} from '../src/qr/envelope.js';
import {MAX_ACTIVE_SESSIONS} from '../src/pairing/limits.js';
import {carry, createClock, FakeWebRtc, outgoingTexts, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

function controller(rtc: FakeWebRtc, enabled = true): PairingController {
  return new PairingController({
    enabled,
    webrtc: rtc,
    clock: harness.clock,
    now: () => 1000,
    runtime: {}
  });
}

function rewrite(text: string, changes: Partial<QrEnvelopeV1>): string {
  return serializeEnvelope({...parseEnvelope(text), ...changes} as QrEnvelopeV1);
}

describe('pairing validation', () => {
  it('refuses a part whose kind does not match the role', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const offerText = outgoingTexts(hub, 's')[0] ?? '';

    // The hub is waiting for an answer, so its own offer must be refused.
    await expect(hub.ingestQrText('s', offerText)).rejects.toMatchObject({
      code: 'unexpected-kind'
    });

    await carry(camera, 's', outgoingTexts(hub, 's'));
    const answerText = outgoingTexts(camera, 's')[0] ?? '';
    await expect(camera.ingestQrText('s', answerText)).rejects.toMatchObject({
      code: 'unexpected-kind'
    });

    hub.dispose();
    camera.dispose();
  });

  it('refuses an answer that replies to a different offer', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingTexts(hub, 's'));
    const answerText = outgoingTexts(camera, 's')[0] ?? '';

    await expect(
      hub.ingestQrText('s', rewrite(answerText, {replyTo: 'some-other-message'}))
    ).rejects.toMatchObject({code: 'reply-mismatch'});
    expect(hubRtc.acceptedAnswers).toHaveLength(0);

    hub.dispose();
    camera.dispose();
  });

  it('refuses an answer that names a different pair of peers', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await carry(camera, 's', outgoingTexts(hub, 's'));
    const answerText = outgoingTexts(camera, 's')[0] ?? '';

    await expect(
      hub.ingestQrText('s', rewrite(answerText, {senderPeerId: 'cam-B'}))
    ).rejects.toMatchObject({code: 'peer-mismatch'});
    await expect(
      hub.ingestQrText('s', rewrite(answerText, {targetPeerId: 'other-studio'}))
    ).rejects.toMatchObject({code: 'peer-mismatch'});
    expect(hubRtc.acceptedAnswers).toHaveLength(0);

    hub.dispose();
    camera.dispose();
  });

  it('refuses an offer addressed to a different device when the name is pinned', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: 'cam-B'});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    await expect(
      camera.ingestQrText('s', outgoingTexts(hub, 's')[0] ?? '')
    ).rejects.toMatchObject({code: 'peer-mismatch'});
    expect(cameraRtc.acceptedOffers).toHaveLength(0);

    hub.dispose();
    camera.dispose();
  });

  it('never delivers a code whose parts fail the hash check', async () => {
    const hubRtc = new FakeWebRtc('hub', 6000);
    const cameraRtc = new FakeWebRtc('camera', 6000);
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    const texts = outgoingTexts(hub, 's');
    expect(texts.length).toBeGreaterThan(1);
    const damaged = texts.map((text, index) => {
      if (index !== 0) return text;
      const envelope = parseEnvelope(text);
      return serializeEnvelope({...envelope, payload: `B${envelope.payload.slice(1)}`});
    });

    await expect(carry(camera, 's', damaged)).rejects.toMatchObject({code: 'hash-mismatch'});
    expect(cameraRtc.acceptedOffers).toHaveLength(0);
    expect(camera.progress('s').phase).toBe('failed');
    expect(camera.progress('s').errorCode).toBe('hash-mismatch');

    hub.dispose();
    camera.dispose();
  }, 20_000);

  it('accepts a verified code exactly once', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const offerTexts = outgoingTexts(hub, 's');

    await carry(camera, 's', offerTexts);
    await expect(camera.ingestQrText('s', offerTexts[0] ?? '')).rejects.toMatchObject({
      code: 'already-accepted'
    });
    expect(cameraRtc.acceptedOffers).toHaveLength(1);

    const answerTexts = outgoingTexts(camera, 's');
    await carry(hub, 's', answerTexts);
    await expect(hub.ingestQrText('s', answerTexts[0] ?? '')).rejects.toMatchObject({
      code: 'already-accepted'
    });
    expect(hubRtc.acceptedAnswers).toHaveLength(1);

    hub.dispose();
    camera.dispose();
  });

  it('enforces the session name, uniqueness, and count limits', async () => {
    const hub = controller(new FakeWebRtc('hub'));

    await expect(
      hub.startOfferPairing({sessionKey: '  ', localPeerId: 'studio', remotePeerId: 'cam-A'})
    ).rejects.toMatchObject({code: 'invalid-argument'});

    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    await expect(
      hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-B'})
    ).rejects.toMatchObject({code: 'session-exists'});

    for (let index = 1; index < MAX_ACTIVE_SESSIONS; index += 1) {
      await hub.startOfferPairing({
        sessionKey: `s${index}`,
        localPeerId: 'studio',
        remotePeerId: `cam-${index}`
      });
    }
    await expect(
      hub.startOfferPairing({sessionKey: 'overflow', localPeerId: 'studio', remotePeerId: 'cam-x'})
    ).rejects.toMatchObject({code: 'session-limit'});

    await expect(hub.ingestQrText('missing', 'text')).rejects.toMatchObject({
      code: 'no-session'
    });

    hub.dispose();
  }, 20_000);

  it('reports peer names that the transport cannot carry', async () => {
    const hub = controller(new FakeWebRtc('hub'));

    await expect(
      hub.startOfferPairing({sessionKey: 's', localPeerId: '  ', remotePeerId: 'cam-A'})
    ).rejects.toMatchObject({code: 'invalid-envelope'});
    await expect(
      hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'カメラ'})
    ).rejects.toMatchObject({code: 'invalid-envelope'});

    hub.dispose();
  });

  it('refuses every entry point while the feature flag is off', async () => {
    const hub = controller(new FakeWebRtc('hub'), false);

    await expect(
      hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'})
    ).rejects.toMatchObject({code: 'feature-disabled'});
    expect(() =>
      hub.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''})
    ).toThrowError(expect.objectContaining({code: 'feature-disabled'}));
    await expect(hub.ingestQrText('s', 'text')).rejects.toMatchObject({
      code: 'feature-disabled'
    });
    expect(hub.progress('s').phase).toBe('disabled');
  });

  it('keeps pairing codes out of reported error messages', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const offerText = outgoingTexts(hub, 's')[0] ?? '';
    const code = parseEnvelope(offerText).payload;

    await expect(hub.ingestQrText('s', offerText)).rejects.toSatisfy(
      (error: Error) => !error.message.includes(code)
    );

    hub.dispose();
    camera.dispose();
  });
});
