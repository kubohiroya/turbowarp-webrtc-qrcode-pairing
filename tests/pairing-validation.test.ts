import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {formatMessage, parseMessage, type PairingMessageHeader} from '../src/qr/message.js';
import {MAX_ACTIVE_SESSIONS} from '../src/pairing/limits.js';
import {carry, createClock, FakeWebRtc, outgoingReads, readAt, type ClockHarness} from './pairing-harness.js';

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

/** The same message with some header fields changed. Its hash still matches its pairing code. */
function rewrite(text: string, changes: Partial<PairingMessageHeader>): string {
  const message = parseMessage(text);
  return formatMessage({...message, header: {...message.header, ...changes}});
}

describe('pairing validation', () => {
  it('refuses a part whose kind does not match the role', async () => {
    const hubRtc = new FakeWebRtc('hub');
    const cameraRtc = new FakeWebRtc('camera');
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    const offerText = readAt(outgoingReads(hub, 's'), 0);

    // The hub is waiting for an answer, so its own offer must be refused.
    await expect(hub.ingestQrRead('s', offerText)).rejects.toMatchObject({
      code: 'unexpected-kind'
    });

    await carry(camera, 's', outgoingReads(hub, 's'));
    await expect(camera.ingestQrText('s', camera.messageText('s'))).rejects.toMatchObject({
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
    await carry(camera, 's', outgoingReads(hub, 's'));
    const answerText = camera.messageText('s');

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
    await carry(camera, 's', outgoingReads(hub, 's'));
    const answerText = camera.messageText('s');

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
      camera.ingestQrRead('s', readAt(outgoingReads(hub, 's'), 0))
    ).rejects.toMatchObject({code: 'peer-mismatch'});
    expect(cameraRtc.acceptedOffers).toHaveLength(0);

    hub.dispose();
    camera.dispose();
  });

  it('drops a sequence that fails the hash check and collects it again', async () => {
    const hubRtc = new FakeWebRtc('hub', 1100);
    const cameraRtc = new FakeWebRtc('camera', 1100);
    const hub = controller(hubRtc);
    const camera = controller(cameraRtc);

    camera.startAnswerPairing({sessionKey: 's', expectedLocalPeerId: ''});
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    const reads = outgoingReads(hub, 's');
    expect(reads.length).toBeGreaterThan(1);
    // Two characters of the pairing code changed the same way: the Structured
    // Append parity still matches, so only the message's own hash can tell.
    const damaged = reads.map((read, index) => {
      if (index !== reads.length - 1) return read;
      const bytes = read.bytes.slice();
      const end = bytes.length - 1;
      bytes[end] = (bytes[end] ?? 0) ^ 0x03;
      bytes[end - 1] = (bytes[end - 1] ?? 0) ^ 0x03;
      return {...read, bytes};
    });

    await expect(carry(camera, 's', damaged)).rejects.toMatchObject({code: 'hash-mismatch'});
    expect(cameraRtc.acceptedOffers).toHaveLength(0);
    expect(camera.progress('s')).toMatchObject({
      phase: 'receiving',
      errorCode: '',
      lastRead: 'foreign',
      lastReadDetail: 'hash-mismatch',
      receivedParts: 0
    });

    // The hub keeps showing its codes, so the next pass delivers the offer.
    await carry(camera, 's', reads);
    expect(cameraRtc.acceptedOffers).toHaveLength(1);

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
    const offerTexts = outgoingReads(hub, 's');

    await carry(camera, 's', offerTexts);
    await expect(camera.ingestQrRead('s', readAt(offerTexts, 0))).rejects.toMatchObject({
      code: 'already-accepted'
    });
    expect(cameraRtc.acceptedOffers).toHaveLength(1);

    const answerTexts = outgoingReads(camera, 's');
    await carry(hub, 's', answerTexts);
    await expect(hub.ingestQrRead('s', readAt(answerTexts, 0))).rejects.toMatchObject({
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
    const offerText = hub.messageText('s');
    const code = parseMessage(offerText).payload;

    await expect(hub.ingestQrText('s', offerText)).rejects.toSatisfy(
      (error: Error) => !error.message.includes(code)
    );

    hub.dispose();
    camera.dispose();
  });
});
