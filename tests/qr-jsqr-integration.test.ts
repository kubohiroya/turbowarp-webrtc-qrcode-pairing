import {afterEach, describe, expect, it, vi} from 'vitest';
import type {StructuredAppendSymbol} from '@kubohiroya/qrcode-structured-append';
import {createPairingCodes, PairingAssembler} from '../src/qr/courier.js';
import type {QrDecodePort} from '../src/ports/qr-scan.js';

afterEach(() => vi.unstubAllGlobals());

/**
 * Checks the decoding path this extension actually relies on: the published
 * turbowarp-jsqr extension's `readFrame`, which is what `CameraQrScanner` calls,
 * reading rendered codes. A change in that extension's published API, or in
 * how it reports Structured Append positions, shows up here.
 */
describe('turbowarp-jsqr integration', () => {
  it('reads every code of an offer through the published readFrame API and joins them', async () => {
    const codes = await createPairingCodes('C'.repeat(1250), {
      senderPeerId: 'studio',
      targetPeerId: 'cam-A',
      kind: 'offer',
      sessionId: 'jsqr-integration',
      createdAt: 1000,
      maxVersion: 15
    });
    expect(codes.symbols.length).toBeGreaterThan(1);

    let decoder: QrDecodePort | undefined;
    const runtime: Record<string, unknown> = {};
    let image: {data: Uint8ClampedArray; width: number} = {data: new Uint8ClampedArray(), width: 0};
    vi.stubGlobal('Scratch', {
      extensions: {
        unsandboxed: true,
        register(extension: QrDecodePort) {
          decoder = extension;
        }
      },
      vm: {runtime},
      BlockType: {COMMAND: 'command', REPORTER: 'reporter'},
      ArgumentType: {STRING: 'string'},
      Cast: {toString: String},
      translate: (value: string | {default: string}) =>
        typeof value === 'string' ? value : value.default
    });
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => undefined,
          getImageData: () => ({data: image.data, width: image.width, height: image.width})
        })
      })
    });

    await import('@kubohiroya/turbowarp-jsqr/jsqr.js');
    expect(decoder?.capabilityVersion).toBeGreaterThanOrEqual(2);

    const assembler = new PairingAssembler();
    for (const symbol of [...codes.symbols].reverse()) {
      image = rasterize(symbol);
      const read = await decoder?.readFrame({element: {}, width: image.width, height: image.width});
      expect(read?.structuredAppend).toEqual({
        index: symbol.index,
        count: symbol.count,
        parity: symbol.parity
      });
      assembler.add({...read!.structuredAppend!, bytes: read!.bytes});
    }
    expect((await assembler.assemble()).payload).toBe('C'.repeat(1250));
  }, 30_000);
});

function rasterize(symbol: StructuredAppendSymbol): {data: Uint8ClampedArray; width: number} {
  const quiet = 4;
  const scale = 4;
  const width = (symbol.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  for (let row = 0; row < symbol.size; row += 1) {
    for (let column = 0; column < symbol.size; column += 1) {
      if (!symbol.isDark(column, row)) continue;
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
