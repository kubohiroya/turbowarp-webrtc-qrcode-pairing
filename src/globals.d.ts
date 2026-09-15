interface TurboWarpExtension {
  getInfo(): Record<string, unknown>;
}

interface TurboWarpRenderer {
  createSVGSkin?(svg: string): number;
  destroySkin?(skinId: number): void;
  updateDrawableSkinId?(drawableId: number, skinId: number): void;
  _allDrawables?: Array<{_skin?: {_id?: number}} | undefined>;
}

interface TurboWarpTarget {
  drawableID?: number | null;
  isStage?: boolean;
  isOriginal?: boolean;
}

interface TurboWarpBlockUtility {
  target?: TurboWarpTarget;
}

interface TurboWarpRuntime {
  renderer?: TurboWarpRenderer;
  targets?: TurboWarpTarget[];
  requestRedraw?(): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  [key: string]: unknown;
}

interface ScratchTranslate {
  (text: string): string;
  (message: {default: string; description?: string}, placeholders?: Record<string, string | number>): string;
}

interface ScratchApi {
  extensions: {
    unsandboxed: boolean;
    register(extension: TurboWarpExtension): void;
  };
  BlockType: Record<'COMMAND' | 'REPORTER' | 'BOOLEAN' | 'HAT', string>;
  ArgumentType: Record<'STRING' | 'NUMBER' | 'BOOLEAN', string>;
  Cast: {
    toString(value: unknown): string;
    toNumber(value: unknown): number;
    toBoolean(value: unknown): boolean;
  };
  vm?: {runtime?: TurboWarpRuntime};
  translate: ScratchTranslate;
}

declare const Scratch: ScratchApi;
