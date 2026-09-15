import QRCode from 'qrcode';
import type {QrErrorCorrectionLevel} from './envelope.js';

const QUIET_ZONE_MODULES = 4;

export function createQrSvg(
  text: string,
  errorCorrectionLevel: QrErrorCorrectionLevel = 'M'
): string {
  const qr = QRCode.create([{data: new TextEncoder().encode(text), mode: 'byte'}], {
    errorCorrectionLevel
  });
  const size = qr.modules.size;
  const viewSize = size + QUIET_ZONE_MODULES * 2;
  const commands: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.modules.get(row, column)) {
        commands.push(`M${column + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${commands.join('')}" fill="#000"/></svg>`;
}

/** Diagnostic helper. Hardware verification records the symbol version per part. */
export function qrVersion(
  text: string,
  errorCorrectionLevel: QrErrorCorrectionLevel = 'M'
): number {
  return QRCode.create([{data: new TextEncoder().encode(text), mode: 'byte'}], {
    errorCorrectionLevel
  }).version;
}
