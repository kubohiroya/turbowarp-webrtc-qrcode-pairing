import {afterEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_ANSWER_MAX_VERSION, DEFAULT_OFFER_MAX_VERSION} from '../src/qr/limits.js';

type ConfigGlobal = {__TWQP_QR_CONFIG__?: unknown};

async function loadWith(config: unknown) {
  (globalThis as ConfigGlobal).__TWQP_QR_CONFIG__ = config;
  vi.resetModules();
  return (await import('../src/config/qr-config.js')).qrConfig;
}

afterEach(() => {
  delete (globalThis as ConfigGlobal).__TWQP_QR_CONFIG__;
  vi.resetModules();
});

describe('startup QR config', () => {
  it('caps offers at version 15, answers at 20, and uses level M unless told otherwise', async () => {
    expect(await loadWith(undefined)).toEqual({
      errorCorrectionLevel: 'M',
      offerMaxVersion: 15,
      answerMaxVersion: 20
    });
    expect(DEFAULT_OFFER_MAX_VERSION).toBe(15);
    expect(DEFAULT_ANSWER_MAX_VERSION).toBe(20);
  });

  it('takes the version caps and a level from the integrator', async () => {
    expect(
      await loadWith({errorCorrectionLevel: 'Q', offerMaxVersion: 10, answerMaxVersion: 40})
    ).toEqual({errorCorrectionLevel: 'Q', offerMaxVersion: 10, answerMaxVersion: 40});
  });

  it('falls back to the defaults for a value that is not a level or a version', async () => {
    expect(
      await loadWith({errorCorrectionLevel: 'X', offerMaxVersion: 41, answerMaxVersion: 0})
    ).toEqual({
      errorCorrectionLevel: 'M',
      offerMaxVersion: DEFAULT_OFFER_MAX_VERSION,
      answerMaxVersion: DEFAULT_ANSWER_MAX_VERSION
    });
    expect((await loadWith({offerMaxVersion: 12.5})).offerMaxVersion).toBe(
      DEFAULT_OFFER_MAX_VERSION
    );
  });
});
