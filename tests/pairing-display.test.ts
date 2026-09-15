import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PairingController} from '../src/pairing/controller.js';
import {TemporarySpriteSkinManager} from '../src/ports/display.js';
import {createClock, FakeWebRtc, type ClockHarness} from './pairing-harness.js';

let harness: ClockHarness;

beforeEach(() => {
  vi.useFakeTimers();
  harness = createClock();
});

afterEach(() => {
  vi.useRealTimers();
});

interface FakeRendererState {
  runtime: TurboWarpRuntime;
  skins: Map<number, string>;
  drawableSkins: Map<number, number>;
  destroyed: number[];
  target: TurboWarpTarget;
}

function createRenderer(originalSkinId = 7, drawableId = 3): FakeRendererState {
  const skins = new Map<number, string>();
  const drawableSkins = new Map<number, number>([[drawableId, originalSkinId]]);
  const destroyed: number[] = [];
  let nextSkinId = 100;
  const target: TurboWarpTarget = {drawableID: drawableId, isStage: false, isOriginal: true};
  const renderer: TurboWarpRenderer = {
    createSVGSkin: (svg: string) => {
      const id = nextSkinId++;
      skins.set(id, svg);
      return id;
    },
    destroySkin: (id: number) => {
      destroyed.push(id);
      skins.delete(id);
    },
    updateDrawableSkinId: (drawable: number, skinId: number) => {
      drawableSkins.set(drawable, skinId);
    },
    _allDrawables: []
  };
  renderer._allDrawables = [];
  renderer._allDrawables[drawableId] = {_skin: {_id: originalSkinId}};
  return {
    runtime: {renderer, targets: [target], requestRedraw: () => undefined},
    skins,
    drawableSkins,
    destroyed,
    target
  };
}

function createHub(runtime: TurboWarpRuntime, rtc: FakeWebRtc): PairingController {
  return new PairingController({
    enabled: true,
    webrtc: rtc,
    runtime,
    display: new TemporarySpriteSkinManager(runtime),
    clock: harness.clock,
    now: () => 1000
  });
}

describe('pairing QR display', () => {
  it('swaps the sprite skin and restores the original when the display ends', async () => {
    const renderer = createRenderer();
    const hub = createHub(renderer.runtime, new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    hub.showPart('s', 1, renderer.target);
    const temporary = renderer.drawableSkins.get(3);
    expect(temporary).not.toBe(7);
    expect(renderer.skins.get(temporary ?? -1)).toContain('<svg');

    hub.endDisplay('s');
    expect(renderer.drawableSkins.get(3)).toBe(7);
    expect(renderer.destroyed).toContain(temporary);

    hub.dispose();
  });

  it('keeps the original skin across part changes and destroys each temporary skin', async () => {
    const renderer = createRenderer();
    const rtc = new FakeWebRtc('hub', 6000);
    const hub = createHub(renderer.runtime, rtc);
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    hub.showPart('s', 1, renderer.target);
    const first = renderer.drawableSkins.get(3);
    hub.showNextPart('s', renderer.target);
    const second = renderer.drawableSkins.get(3);

    expect(second).not.toBe(first);
    expect(renderer.destroyed).toContain(first);

    hub.endDisplay('s');
    expect(renderer.drawableSkins.get(3)).toBe(7);

    hub.dispose();
  }, 20_000);

  it('restores the sprite when the exchange is cancelled or expires', async () => {
    const renderer = createRenderer();
    const hub = createHub(renderer.runtime, new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.showPart('s', 1, renderer.target);

    hub.cancelPairing('s');
    expect(renderer.drawableSkins.get(3)).toBe(7);

    hub.dispose();
  });

  it('restores the sprite on project run stop', async () => {
    const renderer = createRenderer();
    const hub = createHub(renderer.runtime, new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.showPart('s', 1, renderer.target);

    hub.stopTransient();
    expect(renderer.drawableSkins.get(3)).toBe(7);

    hub.dispose();
  });

  it('drops the display when the sprite is removed without touching the missing drawable', async () => {
    const renderer = createRenderer();
    const hub = createHub(renderer.runtime, new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});
    hub.showPart('s', 1, renderer.target);
    const temporary = renderer.drawableSkins.get(3);

    renderer.runtime.targets = [];
    hub.handleTargetRemoved(renderer.target);

    // The sprite is gone, so its drawable keeps the temporary id, but the skin
    // is destroyed and the session no longer claims the target.
    expect(renderer.destroyed).toContain(temporary);
    hub.endDisplay('s');
    expect(renderer.destroyed.filter((id) => id === temporary)).toHaveLength(1);

    hub.dispose();
  });

  it('refuses the stage, clones, and a missing renderer', async () => {
    const renderer = createRenderer();
    const hub = createHub(renderer.runtime, new FakeWebRtc('hub'));
    await hub.startOfferPairing({sessionKey: 's', localPeerId: 'studio', remotePeerId: 'cam-A'});

    expect(() => hub.showPart('s', 1, {drawableID: 3, isStage: true})).toThrowError(
      expect.objectContaining({code: 'invalid-argument'})
    );
    expect(() =>
      hub.showPart('s', 1, {drawableID: 3, isStage: false, isOriginal: false})
    ).toThrowError(expect.objectContaining({code: 'invalid-argument'}));
    expect(() => hub.showPart('s', 1, undefined)).toThrowError(
      expect.objectContaining({code: 'invalid-argument'})
    );

    const bare: TurboWarpRuntime = {};
    const without = new PairingController({
      enabled: true,
      webrtc: new FakeWebRtc('hub'),
      runtime: bare,
      display: new TemporarySpriteSkinManager(bare),
      clock: harness.clock,
      now: () => 1000
    });
    await without.startOfferPairing({
      sessionKey: 's',
      localPeerId: 'studio',
      remotePeerId: 'cam-A'
    });
    expect(() => without.showPart('s', 1, renderer.target)).toThrowError(
      expect.objectContaining({code: 'renderer-unavailable'})
    );
    // The SVG reporter path still works without a renderer.
    expect(without.partSvg('s', 1)).toContain('<svg');

    hub.dispose();
    without.dispose();
  });
});
