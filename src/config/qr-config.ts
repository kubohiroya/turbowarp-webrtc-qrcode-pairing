import type {QrErrorCorrectionLevel} from '../qr/envelope.js';

interface QrConfigGlobal {
  readonly __TWQP_QR_CONFIG__?: {
    readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  };
}

const configuredLevel = (globalThis as QrConfigGlobal).__TWQP_QR_CONFIG__?.errorCorrectionLevel;

/**
 * Startup-fixed QR settings. M is the software-validated default; higher levels
 * survive worse optical conditions but carry fewer characters per symbol, which
 * raises the part count the operator has to carry.
 */
export const qrConfig = Object.freeze({
  errorCorrectionLevel: isLevel(configuredLevel) ? configuredLevel : ('M' as const)
});

function isLevel(value: unknown): value is QrErrorCorrectionLevel {
  return value === 'L' || value === 'M' || value === 'Q' || value === 'H';
}
