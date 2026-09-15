import {QrPairingError} from '../errors.js';

export const QR_DECODER_KEY = 'ext_kubohiroyajsqr';
export const CAMERA_SOURCE_KEY = 'ext_kubohiroyacamerasource';

/** Poll interval matching the jsQR extension's own default. */
export const SCAN_POLL_INTERVAL_MS = 150;

export interface CameraFrameSource {
  readonly element: unknown;
  readonly width: number;
  readonly height: number;
}

export interface CameraLease {
  getFrameSource(): CameraFrameSource;
  release(): Promise<void>;
}

export interface CameraSourcePort {
  acquireCamera(options: {owner: string; cameraId: string}): Promise<CameraLease>;
}

/** Decoding stays in turbowarp-jsqr; this extension never touches pixels. */
export interface QrDecodePort {
  scanFrame(frame: CameraFrameSource): string | null;
}

export interface QrScanPort {
  scanOnce(options: {
    cameraId: string;
    signal: AbortSignal;
    intervalMilliseconds?: number;
  }): Promise<string>;
  release(): Promise<void>;
}

/**
 * Reads QR texts from a camera for the length of a pairing session.
 *
 * The jsQR extension's own `waitForQrText` acquires and releases a camera lease
 * per call, which would restart the camera between every part. This holds one
 * lease for the whole session instead and reuses jsQR only for decoding, so the
 * camera-source lease rules are respected and other holders keep the camera
 * alive after the session ends.
 */
export class CameraQrScanner implements QrScanPort {
  private lease: CameraLease | undefined;
  private leasedCameraId = '';

  public constructor(
    private readonly runtime: TurboWarpRuntime,
    private readonly owner: string
  ) {}

  public async scanOnce(options: {
    cameraId: string;
    signal: AbortSignal;
    intervalMilliseconds?: number;
  }): Promise<string> {
    if (options.signal.aborted) throw cancelled();
    const decoder = this.decoder();
    const lease = await this.acquire(options.cameraId);
    if (options.signal.aborted) throw cancelled();
    const interval = Math.max(50, options.intervalMilliseconds ?? SCAN_POLL_INTERVAL_MS);

    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        options.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        cleanup();
        reject(cancelled());
      };
      const tick = (): void => {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        try {
          const text = decoder.scanFrame(lease.getFrameSource());
          if (text !== null) {
            cleanup();
            resolve(text);
            return;
          }
        } catch (error) {
          cleanup();
          reject(
            new QrPairingError('camera-unavailable', 'Reading the camera frame failed.', {
              cause: error
            })
          );
          return;
        }
        timer = setTimeout(tick, interval);
      };
      options.signal.addEventListener('abort', onAbort, {once: true});
      tick();
    });
  }

  public async release(): Promise<void> {
    const lease = this.lease;
    this.lease = undefined;
    this.leasedCameraId = '';
    await lease?.release();
  }

  private async acquire(cameraId: string): Promise<CameraLease> {
    if (this.lease && this.leasedCameraId === cameraId) return this.lease;
    await this.release();
    const source = this.cameraSource();
    const lease = await source.acquireCamera({owner: this.owner, cameraId});
    this.lease = lease;
    this.leasedCameraId = cameraId;
    return lease;
  }

  private decoder(): QrDecodePort {
    const candidate = this.runtime[QR_DECODER_KEY];
    if (!isRecord(candidate) || typeof candidate.scanFrame !== 'function') {
      throw new QrPairingError(
        'qr-decoder-missing',
        'Scanning pairing QR codes requires @kubohiroya/turbowarp-jsqr.'
      );
    }
    return candidate as unknown as QrDecodePort;
  }

  private cameraSource(): CameraSourcePort {
    const candidate = this.runtime[CAMERA_SOURCE_KEY];
    if (!isRecord(candidate) || typeof candidate.acquireCamera !== 'function') {
      throw new QrPairingError(
        'camera-unavailable',
        'Scanning pairing QR codes requires @kubohiroya/turbowarp-camera-source.'
      );
    }
    return candidate as unknown as CameraSourcePort;
  }
}

function cancelled(): QrPairingError {
  return new QrPairingError('cancelled', 'QR scanning was cancelled.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
