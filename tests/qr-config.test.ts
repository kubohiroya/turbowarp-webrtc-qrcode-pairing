import {afterEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_MAX_QR_VERSION} from '../src/qr/limits.js';

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
  it('caps parts at version 20 and uses level M unless told otherwise', async () => {
    const config = await loadWith(undefined);
    expect(config).toEqual({errorCorrectionLevel: 'M', maxVersion: DEFAULT_MAX_QR_VERSION});
    expect(DEFAULT_MAX_QR_VERSION).toBe(20);
  });

  it('takes a version cap and a level from the integrator', async () => {
    expect(await loadWith({errorCorrectionLevel: 'Q', maxVersion: 40})).toEqual({
      errorCorrectionLevel: 'Q',
      maxVersion: 40
    });
  });

  it('falls back to the defaults for a value that is not a level or a version', async () => {
    expect(await loadWith({errorCorrectionLevel: 'X', maxVersion: 41})).toEqual({
      errorCorrectionLevel: 'M',
      maxVersion: DEFAULT_MAX_QR_VERSION
    });
    expect((await loadWith({maxVersion: 12.5})).maxVersion).toBe(DEFAULT_MAX_QR_VERSION);
  });
});
