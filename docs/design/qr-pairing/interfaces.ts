/**
 * QR搬送WebRTCペアリング 型契約（設計文書）
 *
 * 対応要求: requirements.md / Issue #1
 * 本ファイルは設計の規範であり、ビルド対象ではない（tsconfig の include は src/tests/scripts）。
 * 実装時は各セクションを src/ 配下の該当モジュールへ分割する（architecture.md 参照）。
 */

/* ============================================================================
 * src/qr/limits.ts  — 上限・単位・境界条件（FR-2.7）
 * ==========================================================================*/

/**
 * メッセージ（pairing code）の最大長。
 * 単位: 文字数。payload は印字可能ASCII `[\x20-\x7E]` に限定されるため、
 * 1文字 = 1 UTF-16 code unit = 1 バイトであり、文字数とバイト数は一致する。
 * 境界: 1 <= messageLength <= MAX_MESSAGE_LENGTH。0 は不正。
 *
 * 注意（実効上限）: 実際に搬送できる長さは MAX_PART_COUNT × chunk長 で頭打ちになる。
 * chunk長 = (QR v40 の該当ECCレベルのバイト容量) - (envelopeヘッダ長 <= 362)。
 *   L: 2953 - 362 = 2591 → 64part で 165,824 → MAX_MESSAGE_LENGTH が binding
 *   M: 2331 - 362 = 1969 → 64part で 126,016 → part数が binding
 *   Q: 1663 - 362 = 1301 → 64part で  83,264 → part数が binding
 *   H: 1273 - 362 =  911 → 64part で  58,304 → part数が binding
 * 上限超過は分割時に `message-too-large` もしくは `too-many-parts` で失敗する。
 */
export const MAX_MESSAGE_LENGTH = 128 * 1024; // 131072

/** 1メッセージあたりの最大part数。境界: 1 <= partCount <= 64、0 <= partIndex < partCount。*/
export const MAX_PART_COUNT = 64;

/** 1partのpayload最大長（文字数）。QR容量による実効上限より常に大きい安全弁。*/
export const MAX_CHUNK_LENGTH = 4096;

/** 受理するQRテキストの最大長（文字数）。envelopeヘッダ + payload の上限。*/
export const MAX_PART_TEXT_LENGTH = 8192;

/** 同時に保持できるsession数（受信状態の保持上限、FR-2.7）。*/
export const MAX_ACTIVE_SESSIONS = 8;

/** 期限の既定値と範囲（秒、FR-4.6）。*/
export const DEFAULT_TIMEOUT_SECONDS = 600;
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 3600;

/** connectionState のポーリング間隔（ミリ秒）。*/
export const CONNECTION_POLL_INTERVAL_MS = 250;

/** カメラ走査のポーリング間隔（ミリ秒）。jsqr の既定と揃える。*/
export const SCAN_POLL_INTERVAL_MS = 150;

/* ============================================================================
 * src/qr/envelope.ts  — 搬送形式 twqr/1（FR-2.1, FR-2.8）
 * ==========================================================================*/

/**
 * protocol識別子。
 * 移設元 `twmp-qr/1` に peer対応情報（senderPeerId/targetPeerId）と replyTo を追加した
 * 非互換形式のため、新しい名前空間とversionを与える。
 * `twmp-qr/1` は本拡張では受理しない（`unsupported-protocol`）。相互運用しない理由と
 * motion-capture側の移行方針は block-api.md「形式互換性」を参照。
 */
export const QR_PROTOCOL = 'twqr/1' as const;

export type QrMessageKind = 'offer' | 'answer';
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrEnvelopeV1 {
  /** 固定値 'twqr/1'。*/
  readonly protocol: typeof QR_PROTOCOL;
  /** 1回のOffer→Answer往復を識別する。hubがOffer生成時にUUIDで採番し、Answerが反映する。*/
  readonly sessionId: string;
  /** 送信側が自分を呼ぶ名前。受信側はこれを自分のWebRTC peerキーに使う。*/
  readonly senderPeerId: string;
  /** 送信側が受信側を呼ぶ名前。受信側は自分の自称としてこれを採用（または照合）する。*/
  readonly targetPeerId: string;
  readonly kind: QrMessageKind;
  /** `<sessionId>.<messageHashの先頭12文字>`。内容が変われば必ず変わる。*/
  readonly messageId: string;
  /** kind='answer' のとき、応答対象のOfferの messageId。kind='offer' のときは空文字。*/
  readonly replyTo: string;
  /** 送信端末のローカル壁時計（ミリ秒）。診断・表示用。期限判定には使わない（FR-4.6）。*/
  readonly createdAt: number;
  /** 0 <= partIndex < partCount。*/
  readonly partIndex: number;
  /** 1 <= partCount <= MAX_PART_COUNT。*/
  readonly partCount: number;
  /** 1 <= messageLength <= MAX_MESSAGE_LENGTH（文字数）。*/
  readonly messageLength: number;
  /** メッセージ全体の SHA-256、base64url無パディング（43文字）。破損検出用で認証ではない（FR-2.6）。*/
  readonly messageHash: string;
  /** メッセージの一部。印字可能ASCII、長さ <= MAX_CHUNK_LENGTH。*/
  readonly payload: string;
}

/** JSONへ直列化する。検証を通らないenvelopeは直列化しない。*/
export declare function serializeEnvelope(envelope: QrEnvelopeV1): string;

/** QRテキストをparseし全フィールドを検証する。失敗時は QrPairingError を投げる。*/
export declare function parseEnvelope(text: string): QrEnvelopeV1;

/**
 * 同一メッセージの part であることを判定するための同一性キー。
 * payload と partIndex を除く全フィールドを連結する。
 */
export declare function envelopeIdentity(envelope: QrEnvelopeV1): string;

/* ============================================================================
 * src/qr/courier.ts  — 分割と再構成（FR-2.2, FR-2.3, FR-2.4）
 * ==========================================================================*/

export interface CreatePartsOptions {
  readonly senderPeerId: string;
  readonly targetPeerId: string;
  readonly kind: QrMessageKind;
  /** kind='answer' のとき必須。Offerの messageId。*/
  readonly replyTo?: string;
  /** 省略時は crypto.randomUUID()。Answerでは必ずOfferの sessionId を渡す。*/
  readonly sessionId?: string;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  /** 省略時は Date.now()。テストのため注入可能。*/
  readonly createdAt?: number;
}

export interface QrParts {
  readonly parts: readonly QrEnvelopeV1[];
  /** parts と同順の QRテキスト。*/
  readonly texts: readonly string[];
  readonly sessionId: string;
  readonly messageId: string;
}

/**
 * メッセージをQR容量に合わせて分割する。
 * chunk長は「ヘッダ込みでQR v40に収まる最大payload長」を二分探索で決め、
 * part数が確定するまで反復する（移設元の手順を維持）。
 */
export declare function createParts(
  message: string,
  options: CreatePartsOptions
): Promise<QrParts>;

export interface PartAcceptResult {
  readonly received: number;
  readonly total: number;
  /** 同一indexの同一payloadを再受理した場合 true。エラーではない。*/
  readonly duplicate: boolean;
}

/** 再構成器。1つの PartAssembler は1メッセージ分の part しか受け付けない。*/
export declare class PartAssembler {
  add(envelope: QrEnvelopeV1): PartAcceptResult;
  /** 未取得の partIndex を昇順で返す（FR-2.3）。*/
  missingParts(): readonly number[];
  receivedCount(): number;
  /** 最初のpartを受けるまでは 0。*/
  requiredCount(): number;
  isComplete(): boolean;
  /** 長さとhashを検証して結合結果を返す。未完成・不一致は QrPairingError。*/
  assemble(): Promise<string>;
  /** 受信状態を破棄する。*/
  clear(): void;
}

/* ============================================================================
 * src/qr/svg.ts  — 表示用のQR画像生成（FR-3.1）
 * ==========================================================================*/

export declare function createQrSvg(
  text: string,
  errorCorrectionLevel?: QrErrorCorrectionLevel
): string;

/** 診断用。実機検証記録の「QR表示条件」に使う。*/
export declare function qrVersion(
  text: string,
  errorCorrectionLevel?: QrErrorCorrectionLevel
): number;

/* ============================================================================
 * src/pairing/types.ts  — ロール・状態・エラー（FR-4.1, FR-4.2）
 * ==========================================================================*/

export type PairingRole = 'hub' | 'camera';

/**
 * 公開する状態名。hub と camera で到達する集合が異なる（dataflow.md 参照）。
 * 'offer-received' / 'answer-received' が「QR読取り完了」、
 * 'connected' が「WebRTC接続成立」であり、両者は必ず区別される（FR-4.2）。
 */
export type PairingPhase =
  | 'disabled'          // フィーチャーフラグOFF
  | 'idle'              // sessionが存在しない
  | 'creating-offer'    // hub: createOffer 実行中
  | 'offer-ready'       // hub: Offer QR 準備完了・表示可能
  | 'awaiting-answer'   // hub: Answer part を部分受信中
  | 'answer-received'   // hub: Answer 検証完了（未引渡し／引渡し直後）
  | 'awaiting-offer'    // camera: Offer part 未受信
  | 'receiving'         // camera: Offer part を部分受信中
  | 'offer-received'    // camera: Offer 検証完了
  | 'creating-answer'   // camera: acceptOffer 実行中
  | 'answer-ready'      // camera: Answer QR 準備完了・表示可能
  | 'connecting'        // WebRTCへ引渡し済み、接続待ち
  | 'connected'         // 接続成立
  | 'cancelled'
  | 'expired'
  | 'failed';

export type PairingErrorCode =
  // フラグ・依存
  | 'feature-disabled'
  | 'webrtc-capability-missing'
  | 'qr-decoder-missing'
  | 'camera-unavailable'
  | 'renderer-unavailable'
  // 形式・検証（FR-2.5）
  | 'invalid-json'
  | 'unsupported-protocol'
  | 'invalid-envelope'
  | 'part-too-large'
  | 'index-out-of-range'
  | 'message-too-large'
  | 'too-many-parts'
  | 'message-mismatch'
  | 'conflicting-part'
  | 'missing-parts'
  | 'length-mismatch'
  | 'hash-mismatch'
  // 交換の同一性（FR-1.4, FR-4.5）
  | 'unknown-session'
  | 'stale-exchange'
  | 'unexpected-kind'
  | 'peer-mismatch'
  | 'reply-mismatch'
  | 'already-accepted'
  // ライフサイクル
  | 'session-limit'
  | 'session-exists'
  | 'no-session'
  | 'invalid-argument'
  | 'timeout'
  | 'cancelled'
  | 'webrtc-rejected';

/**
 * 公開エラー。message は必ずサニタイズ済みで、SDP・ICE・pairing code・payload を含まない（FR-4.9）。
 */
export declare class QrPairingError extends Error {
  readonly code: PairingErrorCode;
  constructor(code: PairingErrorCode, message: string, options?: { cause?: unknown });
}

export interface PairingProgress {
  readonly phase: PairingPhase;
  readonly role: PairingRole;
  readonly sessionKey: string;
  readonly exchangeId: string;      // = envelope の sessionId
  readonly localPeerId: string;
  readonly remotePeerId: string;
  /** 表示中QRの総part数。未準備なら0。*/
  readonly outgoingPartCount: number;
  /** 1始まり。未表示なら0。*/
  readonly outgoingCurrentPart: number;
  readonly receivedParts: number;
  /** 最初のpartを受けるまでは0。*/
  readonly requiredParts: number;
  readonly missingParts: readonly number[];
  readonly connectionState: string;
  readonly errorCode: PairingErrorCode | '';
  readonly errorMessage: string;
  /** 残り秒数。期限なし・終了済みは0。*/
  readonly remainingSeconds: number;
}

/* ============================================================================
 * src/ports/*.ts  — 外部依存の抽象（architecture.md §4）
 * ==========================================================================*/

/**
 * turbowarp-webrtc runtime capability v3。
 * v2 は createOffer/getOffer しか公開していないため、本拡張は v3 を必須とする。
 * 取得: runtime['kubohiroyaWebRtcCapability'] → requireVersion(3)
 */
export const WEBRTC_CAPABILITY_KEY = 'kubohiroyaWebRtcCapability';
export const REQUIRED_WEBRTC_CAPABILITY_VERSION = 3;

export interface WebRtcPairingPort {
  readonly version: number;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
  /** Offerを受理しAnswerコードを返す。*/
  acceptOffer(peer: string, code: string): Promise<string>;
  getAnswer(peer: string): string;
  acceptAnswer(peer: string, code: string): Promise<void>;
  /** RTCPeerConnectionState 相当の文字列。未知のpeerは 'new' 以外の既定値を返してよい。*/
  connectionState(peer: string): string;
  closePeer(peer: string): void;
}

export declare function requireWebRtcPairingPort(
  runtime: TurboWarpRuntime
): WebRtcPairingPort;

/** turbowarp-jsqr のデコード能力。画像処理は本拡張で実装しない（FR-3.3）。*/
export interface QrDecodePort {
  scanFrame(frame: CameraFrameSource): string | null;
}

/** turbowarp-camera-source のlease規則を尊重する最小面（FR-3.4）。*/
export interface CameraFrameSource {
  readonly element: HTMLVideoElement | HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
}

export interface CameraLease {
  getFrameSource(): CameraFrameSource;
  release(): Promise<void>;
}

export interface CameraSourcePort {
  acquireCamera(options: { owner: string; cameraId: string }): Promise<CameraLease>;
}

/** session中に1つのleaseを保持し、jsqrのscanFrameでポーリングする走査器。*/
export interface QrScanPort {
  /**
   * 1件のQRテキストを取得する。abort されたら AbortError を投げる。
   * 同じテキストを連続で返さないための抑制は行わない（重複はassemblerが吸収する）。
   */
  scanOnce(options: {
    cameraId: string;
    signal: AbortSignal;
    intervalMilliseconds?: number;
  }): Promise<string>;
  /** session終了時に呼ぶ。保持中のleaseを解放する。*/
  release(): Promise<void>;
}

/** 一時skinの退避・復元（FR-3.5）。移設元 TemporarySpriteSkinManager と同一契約。*/
export interface DisplayPort {
  validateTarget(target: TurboWarpTarget | undefined): TurboWarpTarget;
  show(target: TurboWarpTarget | undefined, svg: string): void;
  releaseTarget(target: TurboWarpTarget): void;
  releaseAll(): void;
  isDisplaying(target: TurboWarpTarget): boolean;
}

/** 単調時計。壁時計に依存しない期限判定に使う（FR-4.6）。*/
export interface MonotonicClock {
  nowMilliseconds(): number;
}

/* ============================================================================
 * src/pairing/session.ts  — 1 exchange の状態
 * ==========================================================================*/

export interface PairingSessionOptions {
  readonly sessionKey: string;
  readonly role: PairingRole;
  readonly localPeerId: string;
  /** hub では必須。camera では空でよく、Offer受理時に確定する。*/
  readonly remotePeerId: string;
  readonly timeoutSeconds: number;
  readonly errorCorrectionLevel: QrErrorCorrectionLevel;
}

export interface PairingSessionState {
  readonly options: PairingSessionOptions;
  phase: PairingPhase;
  /** 世代番号。cancel / retry / expire / dispose で加算される（FR-4.4）。*/
  epoch: number;
  exchangeId: string;
  /** 自分が送出したメッセージのID。hubならOffer、cameraならAnswer。*/
  outgoingMessageId: string;
  /** 受理した相手メッセージのID。*/
  incomingMessageId: string;
  outgoing: QrParts | undefined;
  outgoingSvgs: readonly string[];
  outgoingCurrentIndex: number;
  assembler: PartAssembler | undefined;
  /** WebRTCへ引き渡し済みか。二重引渡しを防ぐ（FR-1.2）。*/
  delivered: boolean;
  startedAtMonotonic: number;
  errorCode: PairingErrorCode | '';
  errorMessage: string;
}

/* ============================================================================
 * src/pairing/controller.ts  — 公開API（extension.ts はこれを薄く包む）
 * ==========================================================================*/

export interface PairingControllerOptions {
  readonly runtime: TurboWarpRuntime;
  readonly enabled?: boolean;
  readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  readonly webrtc?: WebRtcPairingPort;
  readonly scan?: QrScanPort;
  readonly display?: DisplayPort;
  readonly clock?: MonotonicClock;
}

export declare class PairingController {
  constructor(options: PairingControllerOptions);

  // --- 開始・終了（FR-4.3） ---
  startOfferPairing(input: {
    sessionKey: string;
    localPeerId: string;
    remotePeerId: string;
  }): Promise<void>;
  startAnswerPairing(input: {
    sessionKey: string;
    /** 空なら Offer の targetPeerId を採用。非空なら一致検証する。*/
    expectedLocalPeerId: string;
  }): void;
  cancelPairing(sessionKey: string): void;
  retryPairing(sessionKey: string): Promise<void>;
  setTimeoutSeconds(sessionKey: string, seconds: number): void;

  // --- 受信（FR-2, FR-3.3） ---
  /** デコード済み文字列の正規入口。完了時は内部でWebRTCへ1回だけ引き渡す。*/
  ingestQrText(sessionKey: string, text: string): Promise<void>;
  /** カメラ走査。全part受信・取消・期限のいずれかまでブロックする。*/
  scanFromCamera(sessionKey: string, cameraId: string): Promise<void>;

  // --- 表示（FR-3.1） ---
  showPart(sessionKey: string, oneBasedIndex: number, target: TurboWarpTarget | undefined): void;
  showNextPart(sessionKey: string, target: TurboWarpTarget | undefined): void;
  partSvg(sessionKey: string, oneBasedIndex: number): string;
  endDisplay(sessionKey: string): void;

  // --- 観測（FR-4.1, FR-4.2） ---
  progress(sessionKey: string): PairingProgress;
  sessionKeys(): readonly string[];
  isConnected(sessionKey: string): boolean;
  /** 接続成立・失敗・取消・期限まで待つ。*/
  waitUntilConnected(sessionKey: string): Promise<void>;

  // --- ライフサイクル（FR-4.8） ---
  /** PROJECT_RUN_STOP 相当。表示とleaseを解放し、進行中sessionを取り消す。*/
  stopTransient(): void;
  /** RUNTIME_DISPOSED 相当。全解放とリスナ解除。*/
  dispose(): void;
}

/* ============================================================================
 * src/config/feature-flags.ts（NFR-3）
 * ==========================================================================*/

export interface QrPairingFeatureFlags {
  readonly qrCodePairing: boolean;
}

interface FeatureFlagGlobal {
  readonly __TWQP_FEATURE_FLAGS__?: Partial<QrPairingFeatureFlags>;
}

/** 起動時に一度だけ評価し freeze する。既定 OFF。*/
export declare const featureFlags: QrPairingFeatureFlags;

/* ============================================================================
 * src/config/qr-config.ts
 * ==========================================================================*/

interface QrConfigGlobal {
  readonly __TWQP_QR_CONFIG__?: {
    readonly errorCorrectionLevel?: QrErrorCorrectionLevel;
  };
}

/** 起動時固定。既定 'M'。*/
export declare const qrConfig: { readonly errorCorrectionLevel: QrErrorCorrectionLevel };
