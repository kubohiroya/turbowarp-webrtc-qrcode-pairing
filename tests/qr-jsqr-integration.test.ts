import QRCode from 'qrcode';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createParts} from '../src/qr/courier.js';

afterEach(() => vi.unstubAllGlobals());

/**
 * Checks the decoding path this extension actually relies on.
 *
 * `qr-courier.test.ts` decodes with the jsqr package directly. This goes
 * through the published turbowarp-jsqr extension's `scanFrame`, which is what
 * `CameraQrScanner` calls, so a change in that extension's published API shows
 * up here.
 */
describe('turbowarp-jsqr integration', () => {
  it('decodes every generated part through the published scanFrame API', async () => {
    const result = await createParts('C'.repeat(6000), {
      senderPeerId: 'studio',
      targetPeerId: 'cam-A',
      kind: 'offer',
      sessionId: 'jsqr-integration',
      createdAt: 1000
    });
    expect(result.texts.length).toBeGreaterThan(1);

    let scanner: {scanFrame(frame: unknown): string | null} | undefined;
    const runtime: Record<string, unknown> = {};
    vi.stubGlobal('Scratch', {
      extensions: {
        unsandboxed: true,
        register(extension: typeof scanner) {
          scanner = extension;
        }
      },
      vm: {runtime},
      BlockType: {COMMAND: 'command', REPORTER: 'reporter'},
      ArgumentType: {STRING: 'string'},
      Cast: {toString: String},
      translate: (value: string | {default: string}) =>
        typeof value === 'string' ? value : value.default
    });

    await import('@kubohiroya/turbowarp-jsqr/jsqr.js');
    expect(scanner).toBeDefined();

    for (const text of result.texts) {
      const image = rasterize(text);
      vi.stubGlobal('document', {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => undefined,
            getImageData: () => ({data: image.data})
          })
        })
      });
      expect(
        scanner?.scanFrame({element: {}, width: image.width, height: image.width})
      ).toBe(text);
    }
  }, 30_000);
});

function rasterize(text: string): {data: Uint8ClampedArray; width: number} {
  const qr = QRCode.create([{data: new TextEncoder().encode(text), mode: 'byte'}], {
    errorCorrectionLevel: 'M'
  });
  const quiet = 4;
  const scale = 4;
  const width = (qr.modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixel = ((row + quiet) * scale + y) * width + (column + quiet) * scale + x;
          data[pixel * 4] = 0;
          data[pixel * 4 + 1] = 0;
          data[pixel * 4 + 2] = 0;
        }
      }
    }
  }
  return {data, width};
}
