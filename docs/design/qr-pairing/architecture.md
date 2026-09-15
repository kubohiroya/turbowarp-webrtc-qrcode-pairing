# QR搬送WebRTCペアリング アーキテクチャ設計

対応要求: [requirements.md](requirements.md) / 元Issue: #1

## 1. システム概要

本拡張は「接続情報を光学的に運ぶ運び屋」に徹する。SDPの中身を解釈せず、WebRTCの接続確立そのものも行わない。
`turbowarp-webrtc`が生成した不透明な文字列（pairing code）を、QRに載る大きさへ分割し、表示・読取り・再構成・検証して、
正しい相手・正しい交換に対して一度だけ`turbowarp-webrtc`へ返す。

```
[hub端末]                                   [camera端末]
turbowarp-webrtc ──createOffer──▶ offer code
        │                             │
        │                     本拡張: 分割・QR化・表示
        │                             │  (プロジェクタ投影)
        │                             ▼   ~~~ 光学搬送 ~~~
        │                     本拡張: 読取り・再構成・検証 ◀── jsqr + camera-source
        │                             │
        │                     turbowarp-webrtc ──acceptOffer──▶ answer code
        │                             │
        │                     本拡張: 分割・QR化・表示（画面）
        │                             ▼   ~~~ スマートフォン撮影による搬送 ~~~
本拡張: 読取り・再構成・検証 ◀── jsqr + camera-source
        │
turbowarp-webrtc ──acceptAnswer──▶ 接続成立
```

## 2. アーキテクチャパターン

- パターン: **ヘキサゴナル（ports and adapters）＋ロール別ステートマシン**
- 理由:
  - courier（形式・分割・検証）はDOM・Scratch・WebRTCに依存しない純粋関数群にできる。NFR-4（フラグと独立した単体検証）を満たす。
  - WebRTC／QRデコード／カメラ／レンダラは、いずれも他拡張のruntime capabilityという外部依存。portで抽象化すれば、依存が無い環境でもテストでき、依存不足を明示的なエラーとして扱える。
  - 往復・多重session・取消／再試行・期限は状態遷移として定義しないとFR-4を満たせない。

## 3. レイヤとモジュール

```
src/
  index.ts                     登録エントリ（既存）
  config.ts                    拡張ID・名前・アイコン（既存）
  block-definitions.json       ブロック定義（置換）
  extension.ts                 ブロックのファサード。引数のCast・翻訳・委譲のみ
  globals.d.ts                 Scratch/runtime/renderer型（motion-captureから統合）
  errors.ts                    PairingErrorCode と QrPairingError（依存なしの葉モジュール）
  clock.ts                     単調時計（performance.now系）

  config/
    feature-flags.ts           起動時固定フラグ qrCodePairing（既定OFF）
    qr-config.ts               errorCorrectionLevel など起動時固定設定

  qr/                          ── 純粋層（DOM・Scratch非依存） ──
    limits.ts                  上限定数と単位・境界条件
    hash.ts                    SHA-256 base64url（破損検出用）
    envelope.ts                envelope v1 (twqr/1) の型・serialize・parse・検証
    courier.ts                 分割（createParts）と再構成（PartAssembler）
    svg.ts                     QRのSVG生成（表示層が使う純粋関数）

  pairing/                     ── ドメイン層 ──
    limits.ts                  session上限・期限既定値・tick間隔
    types.ts                   PairingRole / PairingPhase / PairingProgress / session状態の形
    controller.ts              session集合の管理、状態遷移、往復手順の進行、資源解放

  ports/                       ── アダプタ層 ──
    webrtc.ts                  runtime capability v3 の取得と適合検査
    qr-scan.ts                 jsqr(scanFrame) + camera-source(lease) の取得と走査ループ
    display.ts                 TemporarySpriteSkinManager（skin退避・復元）
```

依存方向は `extension.ts → pairing/ → qr/` と `pairing/ → ports/`（interfaceのみ）。
`qr/`は`pairing/`・`ports/`を参照しない。エラー型は両層が使うため、依存を持たない葉モジュール
`src/errors.ts`に置き、`qr/`と`pairing/`の双方がそこだけを参照する。

## 4. 外部依存と契約

| 依存 | 取得方法 | 本拡張が使う操作 | 不在時の扱い |
|---|---|---|---|
| `turbowarp-webrtc` | `runtime.kubohiroyaWebRtcCapability`、`requireVersion(3)` | `createOffer` / `getOffer` / `acceptOffer` / `getAnswer` / `acceptAnswer` / `connectionState` / `closePeer` | `webrtc-capability-missing` で失敗。部分機能での縮退はしない |
| `turbowarp-jsqr` | `runtime.ext_kubohiroyajsqr` | `scanFrame(frameSource)` | カメラ走査ブロックのみ`qr-decoder-missing`。テキスト投入経路は動作する |
| `turbowarp-camera-source` | `runtime.ext_kubohiroyacamerasource` | `acquireCamera({owner, cameraId})` → `lease.getFrameSource()` / `lease.release()` | 同上（`camera-unavailable`） |
| TurboWarp renderer | `runtime.renderer` | `createSVGSkin` / `updateDrawableSkinId` / `destroySkin` | スプライト表示ブロックのみ`renderer-unavailable`。SVG取得ブロックは動作する |

> **前提作業（ブロッカー）**: `turbowarp-webrtc`のruntime capabilityは現在v2で、`createOffer`／`getOffer`しか公開していない。
> `acceptOffer`／`getAnswer`／`acceptAnswer`／`connectionState`／`closePeer`は`PeerSessionPort`には存在するがブロック経由でしか呼べない。
> 本拡張のFR-1（対称な搬送）はこれらを必要とするため、**`turbowarp-webrtc`側にcapability v3を追加するPRが先行して必要**。
> 詳細は [extraction-plan.md](extraction-plan.md) の「前提となる他リポジトリの変更」。

## 5. peer識別子の対応（FR-1.3）

`turbowarp-webrtc`のpeer名は各端末ローカルのキーでしかなく、両端で一致している必要はない。
本拡張はこれを利用し、**envelopeに送信側の自称と受信側への呼称の両方を載せる**ことで対応関係を明示する。

| 端末 | 自分の呼称 `localPeerId` | 相手の呼称 `remotePeerId` | WebRTCに渡すpeerキー |
|---|---|---|---|
| hub | `hub`（アプリが指定） | `camera-1`（アプリが指定） | `camera-1` |
| camera | `camera-1`（Offerの`targetPeerId`から受領） | `hub`（Offerの`senderPeerId`） | `hub` |

- Offer envelope: `senderPeerId = "hub"`, `targetPeerId = "camera-1"`
- Answer envelope: `senderPeerId = "camera-1"`, `targetPeerId = "hub"`, `replyTo = <Offerのmessage ID>`
- camera側は`startAnswerPairing`で期待する自称を任意指定できる。空なら`targetPeerId`をそのまま採用し、
  非空で不一致なら`peer-mismatch`で拒否する（誤った投影を読んだ場合の検出）。
- hub側はAnswerの`senderPeerId`／`targetPeerId`が自分のsessionの`remotePeerId`／`localPeerId`と一致することを検証する。

これにより「両端で同じ識別子が設定されていること」を要求せず、かつ2台以上のcameraを順に接続しても
Answerが別peerへ適用されない（DoD 6）。

## 6. 交換の同一性と鮮度（FR-1.4 / FR-4.4 / FR-4.5）

3層で守る。

1. **exchangeId（＝`sessionId`）**: hubがOffer生成時にUUIDで採番。Answerは同じ`sessionId`を反映する。
   再試行では必ず新しい`sessionId`になるので、古いQRは`unknown-session`／`stale-exchange`で弾かれる。
2. **`replyTo`**: Answerが応答するOfferの`messageId`。hubのsessionが保持する`messageId`と一致しなければ拒否。
3. **epoch（世代番号）**: sessionごとの単調増加カウンタ。`await`から復帰した非同期処理は、
   再開時に`session.epoch`が自分の取得時と同じかを確認し、異なれば結果を捨てる（motion-capture `this.operation`の一般化）。
   取消・再試行・期限切れ・破棄はいずれもepochを進める。

`messageId`は既存実装と同じく`<sessionId>.<messageHash先頭12文字>`で、内容が変われば必ず変わる。

## 7. 期限（FR-4.6）

- 期限は**単調時計**（`performance.now()`、無ければ`Date.now()`のフォールバックを明示）で、
  session開始時刻からの経過で判定する。envelopeの`createdAt`は診断・表示用であり期限判定には使わない。
  これにより未同期端末間の壁時計差に依存しない。
- 既定値: 600秒（人手搬送を想定）。`setPairingTimeout`で1〜3600秒に設定可能。
- 期限到来時は`expired`へ遷移し、表示・lease・タイマを解放する。**成立済み接続は切断しない**（NFR-6と同じ方針）。
  未成立のRTCPeerConnectionのみ`closePeer`する。

## 8. 状態と資源のライフサイクル（FR-4.8）

| イベント | 動作 |
|---|---|
| `cancelPairing` | epoch++、表示復元、lease解放、タイマ停止、受信バッファ破棄、未成立ならclosePeer、phase=`cancelled` |
| `retryPairing` | cancel相当の後、新`sessionId`で同じロールの交換を開始 |
| `PROJECT_RUN_STOP` | 表示復元とlease解放（進行中sessionは`cancelled`）。成立済み接続は維持 |
| `PROJECT_STOP_ALL` | 同上。停止ボタンでは成立済み接続を切断しない。FR-4.8の「切断は所有関係と明示操作に従う」に従い、sessionも保持する |
| `PROJECT_LOADED` | 全sessionを破棄し、未成立・成立済みを問わずpeerを閉じる。旧プロジェクトのsessionは新しいプロジェクトから到達できないため。**runtimeリスナは維持する**（拡張インスタンスは読込みをまたいで生き残り、以降の停止やスプライト削除に反応し続ける必要がある） |
| `targetWasRemoved` | そのスプライトへの表示のみ終了 |
| `RUNTIME_DISPOSED` | 全解放＋runtimeリスナ解除 |

共有カメラのleaseは本拡張が取得したものだけを解放する（camera-sourceは参照カウント方式なので、
アプリ側が別途leaseを持っていればカメラは止まらない、FR-3.4）。

## 9. 表示（FR-3.5）

- `TemporarySpriteSkinManager`（motion-captureから移設）でスプライトの元skin IDを退避し、
  表示終了・取消・停止・スプライト削除時に復元、一時skinは破棄する。
- 併せて`pairingQrPartSvg`／`pairingQrPartDataUri`リポーターを提供し、
  アプリが独自にHTML／コスチューム等で表示する経路を塞がない。
- 静止画撮影での確実な取得のため、自動アニメーションは行わず**手動切替**を基本とする（FR-3.2）。
  現在part番号・総part数をリポーターで提供し、アプリが「1/3」などの案内を出せるようにする。

## 10. 読取り（FR-3.3）

- 正規の入口は`ingestPairingQrText(TEXT, SESSION)`。デコード済み文字列を受け取るだけで、画像処理はしない。
- 利便のため`scanPairingQrFromCamera(SESSION, CAMERA_ID)`を提供するが、実装は
  `camera-source`から**session中1つだけ**leaseを取得し、`jsqr.scanFrame(frameSource)`を間隔ポーリングで呼ぶ。
  jsqrの`waitForQrText`はpartごとにlease取得・解放を繰り返すため使わない（[requirements.md](requirements.md) C-4）。
- 走査は`AbortController`で中断可能。取消・期限・全part受信で停止する。
- 同一partの重複読取りは正常系として黙って無視する（カメラは同じQRを何度も読む）。

## 11. フィーチャーフラグとロールバック（NFR-3/5/6）

```ts
// src/config/feature-flags.ts
(globalThis as FeatureFlagGlobal).__TWQP_FEATURE_FLAGS__?.qrCodePairing === true
```

- 起動時に1回だけ読み、以後変化しない（`Object.freeze`）。既定OFF。
- OFF時: `getInfo()`はペアリングブロックを返さない。直接呼ばれた場合は`feature-disabled`で失敗し、
  `pairingPhase`は`disabled`を返す。
- OFF化は経路選択の切戻しであり、成立済み接続を切断しない。
- 切戻し手順: フラグをOFF（または設定しない）にし、アプリは`turbowarp-webrtc`の
  `create offer code` / `accept offer code` / `answer code` / `accept answer code` ブロックによる
  従来のmanual交換に戻す。motion-capture側の既存QR経路は本Issueでは削除しない。
- `qr/`配下の純粋処理はフラグを参照しないので、単体テストはフラグと独立に動く。

## 12. 診断とプライバシー（FR-4.9）

- 既定でSDP・ICE・pairing code・QR payloadを一切ログ出力しない。例外メッセージにも含めない
  （courierのエラーは「長さ」「index」「code」のみを述べる）。
- 診断用に公開するのは、phase、part進捗（received/required/missing）、エラーコード、
  そしてサニタイズ済みエラーメッセージのみ。
- 長さ・hash・peer IDは診断に出してよい情報として扱う（hashは破損検出用であり、本人性の保証ではない、FR-2.6）。

## 13. 想定外として明示すること

- QRを見た第三者は接続情報を取得できる。QR搬送は認証ではない。投影の可視範囲は運用で管理する（FR-2.6の帰結）。
- `twqr/1`と`twmp-qr/1`は非互換。混在は`unsupported-protocol`で検出される（[block-api.md](block-api.md) 参照）。
- 接続の成立可否はネットワーク条件次第であり、QR搬送の成功は接続成功を意味しない（NFR-2）。
