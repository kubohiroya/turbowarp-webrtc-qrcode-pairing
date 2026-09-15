import {QrPairingError} from '../errors.js';

export interface DisplayPort {
  validateTarget(target: TurboWarpTarget | undefined): TurboWarpTarget;
  show(target: TurboWarpTarget | undefined, svg: string): TurboWarpTarget;
  releaseTarget(target: TurboWarpTarget): void;
  releaseAll(): void;
  isDisplaying(target: TurboWarpTarget): boolean;
}

interface DisplayRecord {
  target: TurboWarpTarget;
  drawableId: number;
  originalSkinId: number;
  temporarySkinId: number;
}

/**
 * Swaps a sprite's skin for a QR image and puts the original back.
 *
 * The original skin ID is captured on the first swap so that repeated part
 * changes never lose it, and every exit path restores it: ending the display,
 * cancelling, stopping the project, removing the sprite, or disposing the
 * runtime.
 */
export class TemporarySpriteSkinManager implements DisplayPort {
  private readonly displays = new Map<TurboWarpTarget, DisplayRecord>();

  public constructor(private readonly runtime: TurboWarpRuntime) {}

  public validateTarget(target: TurboWarpTarget | undefined): TurboWarpTarget {
    if (!target || target.isStage) {
      throw new QrPairingError(
        'invalid-argument',
        'A pairing QR must be displayed on a sprite target.'
      );
    }
    if (target.isOriginal === false) {
      throw new QrPairingError(
        'invalid-argument',
        'Pairing QR display does not support sprite clones.'
      );
    }
    if (!Number.isInteger(target.drawableID) || Number(target.drawableID) < 0) {
      throw new QrPairingError(
        'renderer-unavailable',
        'The pairing QR sprite target has no valid drawable.'
      );
    }
    return target;
  }

  public show(targetValue: TurboWarpTarget | undefined, svg: string): TurboWarpTarget {
    const target = this.validateTarget(targetValue);
    const renderer = requireRenderer(this.runtime.renderer);
    const drawableId = Number(target.drawableID);
    const current = this.displays.get(target);
    const originalSkinId = current?.originalSkinId ?? currentSkinId(renderer, drawableId);
    const temporarySkinId = renderer.createSVGSkin(svg);
    if (!Number.isInteger(temporarySkinId) || temporarySkinId < 0) {
      throw new QrPairingError(
        'renderer-unavailable',
        'The renderer could not create a temporary QR skin.'
      );
    }
    try {
      renderer.updateDrawableSkinId(drawableId, temporarySkinId);
    } catch (error) {
      renderer.destroySkin(temporarySkinId);
      throw new QrPairingError(
        'renderer-unavailable',
        'The renderer could not display the temporary QR skin.',
        {cause: error}
      );
    }
    this.displays.set(target, {target, drawableId, originalSkinId, temporarySkinId});
    if (current) renderer.destroySkin(current.temporarySkinId);
    this.runtime.requestRedraw?.();
    return target;
  }

  public releaseTarget(target: TurboWarpTarget): void {
    const record = this.displays.get(target);
    if (!record) return;
    this.displays.delete(target);
    const renderer = this.runtime.renderer;
    try {
      if (renderer?.updateDrawableSkinId && this.runtime.targets?.includes(target) !== false) {
        renderer.updateDrawableSkinId(record.drawableId, record.originalSkinId);
      }
    } finally {
      renderer?.destroySkin?.(record.temporarySkinId);
      this.runtime.requestRedraw?.();
    }
  }

  public releaseAll(): void {
    for (const target of [...this.displays.keys()]) this.releaseTarget(target);
  }

  public isDisplaying(target: TurboWarpTarget): boolean {
    return this.displays.has(target);
  }
}

interface RequiredRenderer extends TurboWarpRenderer {
  createSVGSkin(svg: string): number;
  destroySkin(skinId: number): void;
  updateDrawableSkinId(drawableId: number, skinId: number): void;
}

function requireRenderer(renderer: TurboWarpRenderer | undefined): RequiredRenderer {
  if (
    !renderer ||
    typeof renderer.createSVGSkin !== 'function' ||
    typeof renderer.destroySkin !== 'function' ||
    typeof renderer.updateDrawableSkinId !== 'function'
  ) {
    throw new QrPairingError(
      'renderer-unavailable',
      'The TurboWarp renderer does not provide temporary SVG skin APIs.'
    );
  }
  return renderer as RequiredRenderer;
}

function currentSkinId(renderer: RequiredRenderer, drawableId: number): number {
  const skinId = renderer._allDrawables?.[drawableId]?._skin?._id;
  if (!Number.isInteger(skinId) || Number(skinId) < 0) {
    throw new QrPairingError(
      'renderer-unavailable',
      'The renderer could not determine the sprite original skin.'
    );
  }
  return Number(skinId);
}
