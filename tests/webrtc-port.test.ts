import {describe, expect, it, vi} from 'vitest';
import {
  requireWebRtcPairingPort,
  REQUIRED_WEBRTC_CAPABILITY_VERSION,
  WEBRTC_CAPABILITY_KEY
} from '../src/ports/webrtc.js';

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 3,
    requireVersion: vi.fn(),
    createOffer: vi.fn(),
    getOffer: vi.fn(),
    acceptOffer: vi.fn(),
    getAnswer: vi.fn(),
    acceptAnswer: vi.fn(),
    connectionState: vi.fn(),
    closePeer: vi.fn(),
    ...overrides
  };
}

describe('WebRTC runtime capability port', () => {
  it('requires version 3 of the capability', () => {
    const requireVersion = vi.fn();
    const runtime: TurboWarpRuntime = {[WEBRTC_CAPABILITY_KEY]: capability({requireVersion})};

    expect(requireWebRtcPairingPort(runtime)).toBe(runtime[WEBRTC_CAPABILITY_KEY]);
    expect(requireVersion).toHaveBeenCalledWith(REQUIRED_WEBRTC_CAPABILITY_VERSION);
  });

  it('reports a missing capability', () => {
    expect(() => requireWebRtcPairingPort({})).toThrowError(
      expect.objectContaining({code: 'webrtc-capability-missing'})
    );
  });

  it('reports a v2 capability that lacks the answer side', () => {
    // v2 published only createOffer and getOffer, so a round trip is impossible.
    const v2 = {
      version: 2,
      requireVersion: vi.fn(),
      createOffer: vi.fn(),
      getOffer: vi.fn(),
      setLatestDataEnabled: vi.fn()
    };

    expect(() => requireWebRtcPairingPort({[WEBRTC_CAPABILITY_KEY]: v2})).toThrowError(
      expect.objectContaining({code: 'webrtc-capability-missing'})
    );
  });

  it('reports a capability that refuses the required version', () => {
    const runtime: TurboWarpRuntime = {
      [WEBRTC_CAPABILITY_KEY]: capability({
        requireVersion: vi.fn(() => {
          throw new Error('Unsupported WebRTC runtime capability version: 3');
        })
      })
    };

    expect(() => requireWebRtcPairingPort(runtime)).toThrowError(
      expect.objectContaining({code: 'webrtc-capability-missing'})
    );
  });
});
