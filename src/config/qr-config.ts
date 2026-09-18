import {DEFAULT_ANSWER_MAX_VERSION, DEFAULT_OFFER_MAX_VERSION} from '../qr/limits.js';
import type {QrErrorCorrectionLevel} from '../qr/message.js';

interface QrConfigGlobal {
  readonly __TWQP_QR_CONFIG__?: {
    readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
    readonly offerMaxVersion?: number;
    readonly answerMaxVersion?: number;
  };
}

const configured = (globalThis as QrConfigGlobal).__TWQP_QR_CONFIG__;

/**
 * Startup-fixed QR settings. M is the software-validated default; higher levels
 * survive worse optical conditions but carry fewer characters per code, which
 * raises the number of codes. The version caps trade the other way: a lower
 * cap makes each code coarser and easier for a camera to read, in more codes.
 * The offer and the answer have their own caps, because the offer is cycled
 * automatically and the answer is turned by hand. A value that is not a level,
 * or not a version from 1 to 40, falls back to the default rather than failing
 * the extension at load.
 */
export const qrConfig = Object.freeze({
  errorCorrectionLevel: isLevel(configured?.errorCorrectionLevel)
    ? configured.errorCorrectionLevel
    : ('M' as const),
  offerMaxVersion: isVersion(configured?.offerMaxVersion)
    ? configured.offerMaxVersion
    : DEFAULT_OFFER_MAX_VERSION,
  answerMaxVersion: isVersion(configured?.answerMaxVersion)
    ? configured.answerMaxVersion
    : DEFAULT_ANSWER_MAX_VERSION
});

function isLevel(value: unknown): value is QrErrorCorrectionLevel {
  return value === 'L' || value === 'M' || value === 'Q' || value === 'H';
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 40;
}
