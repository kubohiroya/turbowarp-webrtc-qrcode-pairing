# 移設計画（turbowarp-realtime-motion-capture からの選別）

対応要求: requirements.md §7 / Issue #1「既存コードの抽出範囲」

抽出元: `/Users/hiroya/Dev/turbowarp-realtime-motion-capture`（`@kubohiroya/turbowarp-realtime-motion-capture`）。
抽出元の削除は本Issueの完了条件ではない（NFR-5）。ここでは**コピー元と改変内容**だけを決める。

## 0. 移設の区分

| 区分 | 意味 |
|---|---|
| **A: ほぼそのまま** | import路とエラー文言のみ調整。ロジックは変更しない |
| **B: 一般化して移設** | motion-capture固有の型・命名・前提を外す。ロジックの骨格は維持 |
| **C: 分解して再設計** | 概念は流用するが、往復・多重session・取消のために書き直す |
| **D: 新規** | 移設元に存在しない |
| **E: 移設しない** | motion-capture固有の関心事 |

## 1. 実装ファイル

| 移設元 | 行数 | 移設先 | 区分 | 具体的な作業 |
|---|---|---|---|---|
| `src/qr-svg.ts` | 39 | `src/qr/svg.ts` | A | `import type {QrErrorCorrectionLevel} from "./qr-courier.js"` → `"./envelope.js"`。それ以外は同一 |
| `src/sprite-skin.ts` | 112 | `src/ports/display.ts` | A | クラス名は`TemporarySpriteSkinManager`のまま。エラー文言の`Offer QR`→`Pairing QR`。`DisplayPort`をimplementsする宣言を追加 |
| `src/qr-courier.ts` の定数群 | （冒頭6行） | `src/qr/limits.ts` | B | `MAX_MESSAGE_LENGTH` / `MAX_PART_COUNT` / `MAX_CHUNK_LENGTH`をそのまま移し、`MAX_PART_TEXT_LENGTH` / `MAX_ACTIVE_SESSIONS` / 期限定数を追加。単位と境界条件をコメントで明記（FR-2.7） |
| `src/qr-courier.ts` の`QrCourierPartV1` / `validatePart` / `serializeQrCourierPart` / `parseQrCourierPart` / `partIdentity` / `requireIdentifier` / `requireTimestamp` / `requirePairingCode` | ~140 | `src/qr/envelope.ts` | B | ①`protocol`を`twqr/1`へ ②`peerId`→`senderPeerId`＋`targetPeerId` ③`replyTo`追加（offerは空文字、answerは非空を要求） ④`QrCourierKind`→`QrMessageKind` ⑤エラーを`QrPairingError(code, message)`へ置換 ⑥`Offer pairing code is empty.`のようなOffer前提の文言を種別非依存に ⑦`createdAt`が期限判定に使われないことをコメントで明記 ⑧payloadの印字可能ASCII検査をparse時にも行う |
| `src/qr-courier.ts` の`sha256Base64Url` | ~8 | `src/qr/hash.ts` | A | envelopeとcourierの双方が使うため単独モジュールへ |
| — | — | `src/errors.ts` | D | `PairingErrorCode`と`QrPairingError`。`qr/`と`pairing/`の双方が参照するので、依存を持たない葉モジュールとして`src/`直下に置く |
| `src/qr-courier.ts` の`createQrCourierParts` / `maximumPayloadLength` | ~75 | `src/qr/courier.ts` | B | 二分探索とpart数収束ループはそのまま。`options`を`CreatePartsOptions`（sender/target/replyTo/sessionId）へ。戻り値に`sessionId`／`messageId`を追加 |
| `src/qr-courier.ts` の`QrCourierAssembler` | ~45 | `src/qr/courier.ts`（`PartAssembler`） | B | ①入力を`string`から`QrEnvelopeV1`へ（parseは呼び出し側＝controllerが行い、session照合をparse直後に挟めるようにする） ②`missingParts()` / `receivedCount()` / `requiredCount()` / `isComplete()` / `clear()`を追加（FR-2.3） ③エラーを`QrPairingError`へ |
| `src/webrtc-capability.ts` | 38 | `src/ports/webrtc.ts` | B | `WebRtcOfferCapabilityV2`→`WebRtcPairingPort`。要求versionを3へ。`acceptOffer` / `getAnswer` / `acceptAnswer` / `connectionState` / `closePeer`の存在検査を追加。エラーコード`webrtc-capability-missing` |
| `src/extension.ts` L200-310（`prepareOfferQr` / `showOfferQrPart` / `offerQrPartCount` / `offerQrCurrentPart` / `showNextOfferQrPart` / `createAndShowOfferQr` / `endOfferQrDisplay` / `offerQrState` / `offerQrError`） | ~110 | `src/pairing/controller.ts` ＋ `src/pairing/session.ts` | C | 流用する概念: `operation`カウンタによる古い非同期結果の破棄（→`epoch`）、`state`／`lastError`の保持（→`phase`／`errorCode`）、part表示と巡回、`endOfferQrDisplay`での一括解放。書き直す理由: 単一session固定・Offer専用・camera側なし・期限なし・受信なしのため |
| `src/extension.ts` のruntimeリスナ設定（L172-177, `runStopListener`／`stopListener`／`disposeListener`／`targetRemovedListener`） | ~25 | `src/extension.ts` | B | motion-capture固有の`pose`／`calibration`／`fusion`停止を除去し、本拡張の`stopTransient()`／`dispose()`へ束ねる |
| `src/extension.ts` の`toScratchBlock`／`blockEnabled`／`requireEnabled` | ~40 | `src/extension.ts` | B | 既存scaffoldの`toScratchBlock`とほぼ同型。`feature`フィールドによるフィルタを`qrCodePairing`単独で復元 |
| `config/feature-flags.ts` | 27 | `src/config/feature-flags.ts` | B | フラグを`qrCodePairing`1件へ。グローバル名`__TWMP_FEATURE_FLAGS__`→`__TWQP_FEATURE_FLAGS__`。Issueの指定どおり`src/`配下へ置く |
| `config/qr-config.ts` | 19 | `src/config/qr-config.ts` | A | グローバル名`__TWMP_QR_CONFIG__`→`__TWQP_QR_CONFIG__` |
| `src/globals.d.ts` の`TurboWarpRenderer` / `TurboWarpTarget` / `TurboWarpBlockUtility` / `TurboWarpRuntime` / `Scratch.vm` | ~30 | `src/globals.d.ts`（既存へ追記） | A | scaffoldの`globals.d.ts`にはrenderer／target／runtimeの宣言が無いので追加。`declare module "@kubohiroya/turbowarp-jsqr/jsqr.js"`も必要 |
| — | — | `src/qr/courier.ts`のAnswer側分割呼出し | D | `kind='answer'`＋`replyTo`＋`sessionId`継承。移設元に相当物なし |
| — | — | `src/ports/qr-scan.ts` | D | camera-sourceのlease保持＋jsqr`scanFrame`ポーリング。移設元は読取り側を持たない |
| — | — | `src/pairing/types.ts` | D | phase／errorCode／portの定義 |
| — | — | `src/clock.ts`（`MonotonicClock`） | D | 単調時計。移設元は`Date.now()`のみ |
| `src/pose/**`, `src/fusion/**`, `src/calibration/**`, `src/avatar/**`, `src/frame-sync/**`, `src/markers/**`, `src/protocol/**` | 約8,900 | — | E | motion-capture固有。本拡張のスコープ外 |
| `src/extension-manifest.ts`, `src/config.ts`, `src/index.ts` | — | — | E | scaffold側に同等物が既にある |

移設対象の実コード合計はおよそ **620行**（うちAが約190行、Bが約320行、Cが約110行）。

## 2. テスト

| 移設元 | 行数 | 移設先 | 区分 | 作業 |
|---|---|---|---|---|
| `tests/qr-courier.test.ts` | 116 | `tests/qr-courier.test.ts` | B | 4件のitを維持。`peerId`→`senderPeerId`/`targetPeerId`、protocol名、`QrCourierAssembler`→`PartAssembler`（入力がenvelope）に合わせて更新。「順不同・重複・混在identity・欠落part・範囲外index・過大入力」の観点はそのまま使える（DoD 3/4に直結） |
| `tests/turbowarp-jsqr-integration.test.ts` | 80 | `tests/qr-jsqr-integration.test.ts` | A | `createQrCourierParts`→`createParts`の呼び替えのみ。**`feat/pairing/optical-workflow`へ延期**: このテストは`@kubohiroya/turbowarp-jsqr`拡張の`scanFrame`経路を検証するもので、走査ポートを実装するPRで一緒に入れるほうが依存の追加が1回で済む。生成QRの実デコード検証自体は`qr-courier.test.ts`が`jsqr`パッケージ直接利用で担保する |
| `tests/extension.test.ts` L85-130, L485-693（offer QRブロック関連） | ~250 | `tests/pairing-hub.test.ts` ほか | C | 流用する観点: フラグOFFでブロックが出ない／`disabled`を返す、peer名のtrim、単一part／複数part、次part巡回、表示終了で復元、webrtc未ロード時のエラー、進行中の二重起動拒否、スプライト削除時の復元。往復・camera側・取消・期限・複数peerは新規 |
| — | — | `tests/pairing-camera.test.ts` | D | Offer受理→Answer生成→表示 |
| — | — | `tests/pairing-roundtrip.test.ts` | D | hub↔cameraを同一プロセス内で結線した往復（DoD 1/3/6） |
| — | — | `tests/pairing-lifecycle.test.ts` | D | 取消・期限・再試行・古い非同期応答・古いQR（DoD 5） |
| — | — | `tests/extension-manifest.test.ts` | B | 既存を新opcode一覧に合わせて更新 |

## 3. 依存パッケージの移設

`package.json`へ追加する。

```jsonc
"dependencies": {
  "qrcode": "1.5.4"                       // 移設元と同一版に固定
},
"peerDependencies": {                      // すべて optional
  "@kubohiroya/turbowarp-webrtc": ">=0.4.0",     // capability v3 を含む版（後述）
  "@kubohiroya/turbowarp-jsqr": "0.3.0",
  "@kubohiroya/turbowarp-camera-source": "0.5.0"
},
"devDependencies": {
  "@types/qrcode": "1.5.6",
  "jsqr": "^1.4.0"                        // テストでの実デコード検証用
}
```

`pnpm-workspace.yaml`の`minimumReleaseAgeExclude`に上記の`@kubohiroya/*`を追記する（移設元と同じ運用）。

**注意点**:

- 本リポジトリは`vitest ^5.0.0`、移設元は`vitest ^4.1.10`。移設テストがvitest 5で動くことを最初のPRで確認する
  （`vi.stubGlobal`／`vi.unstubAllGlobals`は5系でも同APIだが、タイマ系APIの差異は要確認）。
- 本リポジトリは`@kubohiroya/vite-plugin-turbowarp-extension` 0.3.0、移設元は0.4.0。
  `qrcode`をバンドルできることは`refactor/pairing/qr-courier`で確認済み（`src/qr/courier.ts`を入口に
  vite単体ビルドすると、外部importなし・node組込みなしの単一チャンク約88 KBになる）。
  `src/extension.ts`が`qr/`を参照するのは`feat/pairing/optical-workflow`以降なので、
  `pnpm run check:dist`での最終確認はそのPRで行う。
- 移設元はprettierを使うが本リポジトリは使わない。移設したコードは本リポジトリのeslint設定に合わせる
  （移設元はダブルクォート、本リポジトリのscaffoldはシングルクォート。`eslint.config.mjs`の実際の規則に従う）。

## 4. 前提となる他リポジトリの変更（ブロッカー）

### 4.1 `turbowarp-webrtc`: runtime capability v3

現状のv3不在が**FR-1の実装を直接ブロックする**。

- 現状（`src/runtime-capability.ts`）: `version` / `requireVersion` / `createOffer` / `getOffer` /
  `setLatestDataEnabled` / `configureLatestDataChannel` / `sendLatestData` / `latestDataStats`。
- 追加が必要: `acceptOffer(peer, code)` / `getAnswer(peer)` / `acceptAnswer(peer, code)` /
  `connectionState(peer)` / `closePeer(peer)`。いずれも`PeerSessionPort`（`src/manual-peer-session.ts:36-59`）に
  既に実装済みで、capabilityへ委譲を追加するだけで足りる。
- 併せて`runtimeCapabilityVersion`を3にし、`requireVersion`が1/2/3を受理するようにする。
- これは`turbowarp-webrtc`側の別Issue／PRとして起票し、本Issue #1からリンクする。

**この作業が完了するまで**、本リポジトリでは`WebRtcPairingPort`をinterfaceとして定義し、
テストではフェイクを注入して往復ロジックを完成させられる。実機検証だけがブロックされる。

### 4.2 `turbowarp-jsqr` / `turbowarp-camera-source`

変更不要。`ext_kubohiroyajsqr.scanFrame`と`ext_kubohiroyacamerasource.acquireCamera`をそのまま使う。
ただし両者とも`runtime.ext_*`という非versioned な公開面なので、本拡張側で存在検査とエラーコード化を行う。
将来的にversioned capabilityへ移行する提案は、それぞれのリポジトリの別Issueとする。

## 5. PR分割（Issue #1の表を本設計で具体化）

| # | ブランチ | 内容 | 依存 | 検証 |
|---|---|---|---|---|
| 0 | `turbowarp-webrtc` 側 `feat/runtime-capability/v3` | capability v3の追加 | なし | 当該リポジトリのcheck |
| 1 | `feat/pairing/contracts` | 本設計文書一式、`src/pairing/types.ts`、`src/config/feature-flags.ts`、`src/config/qr-config.ts`、`globals.d.ts`の拡張 | なし | typecheck / lint |
| 2 | `refactor/pairing/qr-courier` | `src/qr/**`（limits・envelope・courier・svg）と移設テスト、依存パッケージ追加 | #1 | `pnpm run check`、jsQR実デコード、部分・重複・欠落 |
| 3 | `feat/pairing/offer-answer` | `src/ports/webrtc.ts`、`src/clock.ts`、`src/pairing/{limits,types,controller}.ts`、往復・取消・期限・複数peerのテスト | #1,#2（実機は#0） | フェイクWebRTCでの往復テスト |
| 4 | `feat/pairing/optical-workflow` | `src/ports/display.ts`、`src/ports/qr-scan.ts`、ブロック定義とextension.ts、実機検証 | #3、#0、jsqr／camera-source | 実機での投影→読取り→搬送→接続 |
| 5 | `docs/pairing/integration` | README（日英）、docs/index.html、利用ガイド、移行・切戻し手順 | #4 | `pnpm run docs:check`、DoD一覧の確認 |

#2と#0は並行可能。#3は#0未完でもフェイク注入で進められるが、#4の実機検証は#0の完了を待つ。

## 6. 移設時に必ず落とすもの（一般化チェックリスト）

- [ ] `twmp` / `multiview` / `motion capture` を含む識別子・文字列・グローバル名が残っていない
- [ ] `Offer`固有の文言（`Offer pairing code`, `Offer QR must be displayed…`）が種別非依存になっている
- [ ] `pose` / `calibration` / `fusion` / `avatar` / `frame-sync` / `markers` への参照が無い
- [ ] `qr/`配下がDOM・Scratch・runtimeに依存していない（importが`qrcode`と自モジュールのみ）
- [ ] エラーが素のErrorではなく`QrPairingError`でコード付き
- [ ] SDP・pairing code・payloadが例外メッセージへ混入していない
