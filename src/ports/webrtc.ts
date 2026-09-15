import {QrPairingError} from '../errors.js';

export const WEBRTC_CAPABILITY_KEY = 'kubohiroyaWebRtcCapability';

/**
 * Required runtime capability version.
 *
 * v2 publishes only `createOffer` and `getOffer`, which is enough to show an
 * offer but not to complete a round trip. v3 adds the answer side and the
 * connection state. See kubohiroya/turbowarp-webrtc#18.
 */
export const REQUIRED_WEBRTC_CAPABILITY_VERSION = 3;

export interface WebRtcPairingPort {
  readonly version: number;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
  /** Accepts an offer and returns the answer code. */
  acceptOffer(peer: string, code: string): Promise<string>;
  getAnswer(peer: string): string;
  acceptAnswer(peer: string, code: string): Promise<void>;
  connectionState(peer: string): string;
  closePeer(peer: string): void;
}

const requiredMethods = [
  'requireVersion',
  'createOffer',
  'getOffer',
  'acceptOffer',
  'getAnswer',
  'acceptAnswer',
  'connectionState',
  'closePeer'
] as const;

export function requireWebRtcPairingPort(runtime: TurboWarpRuntime): WebRtcPairingPort {
  const candidate = runtime[WEBRTC_CAPABILITY_KEY];
  if (typeof candidate !== 'object' || candidate === null) {
    throw new QrPairingError('webrtc-capability-missing', 'TurboWarp WebRTC is not loaded.');
  }
  const record = candidate as Record<string, unknown>;
  for (const method of requiredMethods) {
    if (typeof record[method] !== 'function') {
      throw new QrPairingError(
        'webrtc-capability-missing',
        `TurboWarp WebRTC runtime capability v${REQUIRED_WEBRTC_CAPABILITY_VERSION} is required.`
      );
    }
  }
  try {
    (record.requireVersion as (version: number) => unknown)(REQUIRED_WEBRTC_CAPABILITY_VERSION);
  } catch (error) {
    throw new QrPairingError(
      'webrtc-capability-missing',
      `TurboWarp WebRTC runtime capability v${REQUIRED_WEBRTC_CAPABILITY_VERSION} is required.`,
      {cause: error}
    );
  }
  return candidate as unknown as WebRtcPairingPort;
}
