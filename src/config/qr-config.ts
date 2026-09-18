import type {QrErrorCorrectionLevel} from '../qr/envelope.js';
import {DEFAULT_MAX_QR_VERSION} from '../qr/limits.js';

interface QrConfigGlobal {
  readonly __TWQP_QR_CONFIG__?: {
    readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
    readonly maxVersion?: number;
  };
}

const configured = (globalThis as QrConfigGlobal).__TWQP_QR_CONFIG__;

/**
 * Startup-fixed QR settings. M is the software-validated default; higher levels
 * survive worse optical conditions but carry fewer characters per symbol, which
 * raises the part count the operator has to carry. The version cap trades the
 * other way: a lower cap makes each code coarser and easier for a camera to
 * read, in more parts. A value that is not a level, or not a version from 1 to
 * 40, falls back to the default rather than failing the extension at load.
 */
export const qrConfig = Object.freeze({
  errorCorrectionLevel: isLevel(configured?.errorCorrectionLevel)
    ? configured.errorCorrectionLevel
    : ('M' as const),
  maxVersion: isVersion(configured?.maxVersion) ? configured.maxVersion : DEFAULT_MAX_QR_VERSION
});

function isLevel(value: unknown): value is QrErrorCorrectionLevel {
  return value === 'L' || value === 'M' || value === 'Q' || value === 'H';
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 40;
}
