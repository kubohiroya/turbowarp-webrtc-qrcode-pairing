export interface QrPairingFeatureFlags {
  readonly qrCodePairing: boolean;
}

interface FeatureFlagGlobal {
  readonly __TWQP_FEATURE_FLAGS__?: Partial<QrPairingFeatureFlags>;
}

const overrides = (globalThis as FeatureFlagGlobal).__TWQP_FEATURE_FLAGS__;

/**
 * Startup-fixed flags, read once and frozen. The QR pairing path stays opt-in
 * until it is verified on hardware; turning it off is a route switch back to
 * manual offer/answer exchange, not a disconnect of established connections.
 */
export const featureFlags: QrPairingFeatureFlags = Object.freeze({
  qrCodePairing: overrides?.qrCodePairing === true
});
