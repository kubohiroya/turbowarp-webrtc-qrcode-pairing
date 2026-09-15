import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import definitions from '../src/block-definitions.json';
import {WebRtcQrCodePairingExtension} from '../src/extension.js';
import {createClock, FakeWebRtc, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
  vi.stubGlobal('Scratch', {
    BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
    ArgumentType: {STRING: 'string', NUMBER: 'number', BOOLEAN: 'Boolean'},
    Cast: {
      toString: (value: unknown) => String(value ?? ''),
      toNumber: (value: unknown) => Number(value ?? 0),
      toBoolean: (value: unknown) => Boolean(value)
    },
    translate: (message: string | {default: string}) =>
      typeof message === 'string' ? message : message.default
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createExtension(
  enabled = true,
  runtime: TurboWarpRuntime = {}
): {extension: WebRtcQrCodePairingExtension; rtc: FakeWebRtc} {
  const rtc = new FakeWebRtc('hub');
  return {
    rtc,
    extension: new WebRtcQrCodePairingExtension({
      enabled,
      runtime,
      webrtc: rtc,
      clock: harness.clock,
      now: () => 1000
    })
  };
}

describe('WebRtcQrCodePairingExtension', () => {
  it('publishes documentation, an icon, and localizable block text', () => {
    const info = createExtension().extension.getInfo() as {
      name: string;
      docsURI: string;
      blockIconURI: string;
      blocks: {opcode: string; text: string; blockType: string}[];
    };

    expect(info.name).toBe('TurboWarp-WebRTC-QRCode-Pairing');
    expect(info.docsURI).toBe('https://github.com/kubohiroya/turbowarp-webrtc-qrcode-pairing#readme');
    expect(info.blockIconURI).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(info.blocks).toHaveLength(definitions.blocks.length);
    expect(info.blocks.map((block) => block.opcode)).toContain('startOfferPairing');
  });

  it('implements every declared opcode', () => {
    const {extension} = createExtension();
    const instance = extension as unknown as Record<string, unknown>;

    for (const block of definitions.blocks) {
      expect(typeof instance[block.opcode]).toBe('function');
    }
  });

  it('declares one argument placeholder for every declared argument', () => {
    for (const block of definitions.blocks) {
      for (const name of Object.keys(block.arguments)) {
        expect(block.text).toContain(`[${name}]`);
      }
    }
  });

  it('publishes no blocks and reports disabled while the feature flag is off', async () => {
    const {extension} = createExtension(false);
    const info = extension.getInfo() as {blocks: unknown[]};

    expect(info.blocks).toEqual([]);
    expect(extension.pairingPhase({SESSION: 'pairing-1'})).toBe('disabled');
    await expect(
      extension.startOfferPairing({
        SESSION: 'pairing-1',
        LOCAL_PEER: 'hub',
        REMOTE_PEER: 'camera-1'
      })
    ).rejects.toMatchObject({code: 'feature-disabled'});
  });

  it('reports empty values for a session that does not exist', () => {
    const {extension} = createExtension();

    expect(extension.pairingPhase({SESSION: 'missing'})).toBe('idle');
    expect(extension.pairingQrPartCount({SESSION: 'missing'})).toBe(0);
    expect(extension.pairingQrCurrentPart({SESSION: 'missing'})).toBe(0);
    expect(extension.pairingMissingParts({SESSION: 'missing'})).toBe('');
    expect(extension.pairingError({SESSION: 'missing'})).toBe('');
    expect(extension.pairingQrPartSvg({SESSION: 'missing', INDEX: 1})).toBe('');
    expect(extension.pairingQrPartDataUri({SESSION: 'missing', INDEX: 1})).toBe('');
    expect(extension.isPairingConnected({SESSION: 'missing'})).toBe(false);
    expect(extension.pairingSessions()).toBe('');
  });

  it('exposes prepared parts as SVG and as a data URI', async () => {
    const {extension} = createExtension();
    await extension.startOfferPairing({
      SESSION: 'pairing-1',
      LOCAL_PEER: 'hub',
      REMOTE_PEER: 'camera-1'
    });

    expect(extension.pairingPhase({SESSION: 'pairing-1'})).toBe('offer-ready');
    expect(extension.pairingQrPartCount({SESSION: 'pairing-1'})).toBe(1);
    expect(extension.pairingQrPartSvg({SESSION: 'pairing-1', INDEX: 1})).toContain('<svg');
    expect(extension.pairingQrPartDataUri({SESSION: 'pairing-1', INDEX: 1})).toMatch(
      /^data:image\/svg\+xml;base64,/
    );
    expect(extension.pairingLocalPeer({SESSION: 'pairing-1'})).toBe('hub');
    expect(extension.pairingRemotePeer({SESSION: 'pairing-1'})).toBe('camera-1');
    expect(extension.pairingExchangeId({SESSION: 'pairing-1'})).not.toBe('');
    expect(extension.pairingSessions()).toBe('pairing-1');

    extension.dispose();
  });

  it('registers runtime listeners and removes them on disposal', () => {
    const on = vi.fn();
    const off = vi.fn();
    const {extension} = createExtension(true, {on, off});

    expect(on.mock.calls.map((call) => call[0])).toEqual([
      'PROJECT_RUN_STOP',
      'PROJECT_STOP_ALL',
      'PROJECT_LOADED',
      'RUNTIME_DISPOSED',
      'targetWasRemoved'
    ]);

    extension.dispose();
    expect(off.mock.calls.map((call) => call[0])).toEqual(on.mock.calls.map((call) => call[0]));
  });

  it('keeps listening after a project load, and drops the old project\'s sessions', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const runtime: TurboWarpRuntime = {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
      },
      off: (event: string) => {
        listeners.delete(event);
      }
    };
    const {extension} = createExtension(true, runtime);
    await extension.startOfferPairing({
      SESSION: 'pairing-1',
      LOCAL_PEER: 'hub',
      REMOTE_PEER: 'camera-1'
    });

    listeners.get('PROJECT_LOADED')?.();

    // The sessions belong to the project that just went away.
    expect(extension.pairingSessions()).toBe('');
    // The extension instance survives the load, so it must still react to
    // later stops and sprite removals.
    expect([...listeners.keys()]).toEqual([
      'PROJECT_RUN_STOP',
      'PROJECT_STOP_ALL',
      'PROJECT_LOADED',
      'RUNTIME_DISPOSED',
      'targetWasRemoved'
    ]);

    extension.dispose();
    expect([...listeners.keys()]).toEqual([]);
  });

  it('keeps an established connection when the stop button is pressed', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const runtime: TurboWarpRuntime = {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
      }
    };
    const rtc = new FakeWebRtc('hub');
    const extension = new WebRtcQrCodePairingExtension({
      enabled: true,
      runtime,
      webrtc: rtc,
      clock: harness.clock,
      now: () => 1000
    });
    await extension.startOfferPairing({
      SESSION: 'pairing-1',
      LOCAL_PEER: 'hub',
      REMOTE_PEER: 'camera-1'
    });
    rtc.connect('camera-1');
    await harness.advance(300);
    expect(extension.pairingPhase({SESSION: 'pairing-1'})).toBe('connected');

    listeners.get('PROJECT_STOP_ALL')?.();

    // Disconnecting follows ownership and an explicit request, not a stop.
    expect(extension.pairingPhase({SESSION: 'pairing-1'})).toBe('connected');
    expect(rtc.closed).toEqual([]);

    extension.dispose();
  });

  it('cancels an exchange when the project run stops', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const runtime: TurboWarpRuntime = {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
      }
    };
    const {extension} = createExtension(true, runtime);
    await extension.startOfferPairing({
      SESSION: 'pairing-1',
      LOCAL_PEER: 'hub',
      REMOTE_PEER: 'camera-1'
    });

    listeners.get('PROJECT_RUN_STOP')?.();
    expect(extension.pairingPhase({SESSION: 'pairing-1'})).toBe('cancelled');

    extension.dispose();
  });
});
