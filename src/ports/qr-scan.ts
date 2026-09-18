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

/**
 * The turbowarp-jsqr capability version that reads Structured Append headers.
 * Version 1 returned text only, which cannot tell the codes of a sequence apart.
 */
export const REQUIRED_DECODER_CAPABILITY = 2;

/** One decoded QR code, as turbowarp-jsqr's `readFrame` returns it. */
export interface QrRead {
  readonly text: string;
  readonly bytes: Uint8Array;
  /** Where the code sits in a Structured Append sequence, or null for a lone code. */
  readonly structuredAppend: {
    readonly index: number;
    readonly count: number;
    readonly parity: number;
  } | null;
}

/** Decoding stays in turbowarp-jsqr; this extension never touches pixels. */
export interface QrDecodePort {
  readonly capabilityVersion: number;
  readFrame(frame: CameraFrameSource): Promise<QrRead | null>;
}

export interface QrScanPort {
  scanOnce(options: {
    cameraId: string;
    signal: AbortSignal;
    intervalMilliseconds?: number;
  }): Promise<QrRead>;
  release(): Promise<void>;
}

/**
 * Reads QR codes from a camera for the length of a pairing session.
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
  }): Promise<QrRead> {
    if (options.signal.aborted) throw cancelled();
    const decoder = this.decoder();
    const lease = await this.acquire(options.cameraId);
    if (options.signal.aborted) throw cancelled();
    const interval = Math.max(50, options.intervalMilliseconds ?? SCAN_POLL_INTERVAL_MS);

    return new Promise<QrRead>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const cleanup = (): void => {
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        cleanup();
        reject(cancelled());
      };
      const tick = async (): Promise<void> => {
        timer = undefined;
        if (settled) return;
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        let read: QrRead | null;
        try {
          read = await decoder.readFrame(lease.getFrameSource());
        } catch (error) {
          if (settled) return;
          cleanup();
          reject(
            new QrPairingError('camera-unavailable', 'Reading the camera frame failed.', {
              cause: error
            })
          );
          return;
        }
        // Aborted while the frame was decoding: the abort handler already rejected.
        if (settled) return;
        if (read !== null) {
          cleanup();
          resolve(read);
          return;
        }
        timer = setTimeout(() => void tick(), interval);
      };
      options.signal.addEventListener('abort', onAbort, {once: true});
      void tick();
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
    if (!isRecord(candidate) || typeof candidate.readFrame !== 'function') {
      throw new QrPairingError(
        'qr-decoder-missing',
        'Scanning pairing QR codes requires @kubohiroya/turbowarp-jsqr 0.4.0 or later.'
      );
    }
    const version = candidate.capabilityVersion;
    if (typeof version !== 'number' || version < REQUIRED_DECODER_CAPABILITY) {
      throw new QrPairingError(
        'qr-decoder-missing',
        'Scanning pairing QR codes requires @kubohiroya/turbowarp-jsqr 0.4.0 or later, which reads Structured Append codes.'
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
