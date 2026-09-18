# TurboWarp-WebRTC-QRCode-Pairing

[English](README.md)

QRコードを使ってWebRTCの接続情報を交換するTurboWarp拡張です。`turbowarp-extension-template` 0.4.0を雛形として初期化しています。

**利用ガイド:** [English](https://kubohiroya.github.io/turbowarp-webrtc-qrcode-pairing/) / [日本語](docs/integration-guide.ja.md)

## できること

- WebRTCのOfferとAnswerをQR搬送用の形式に符号化し、大きい場合は複数のQRに分割します。
- スプライト上に1つずつ表示します。投影された各partを担当者が静止画で撮影できます。
- 読み取ったpartを順不同で受け付け、同じpartの重複読取りを許容し、未取得のpartを報告します。
- 長さとハッシュを検証してからWebRTCへ渡し、検証済みの接続情報を一度だけ引き渡します。
- Answerがどの Offer への応答かを追跡し、2台のカメラ側端末の接続情報が入れ替わらないようにします。
- 搬送の進捗と接続状態を別々の状態として報告します。エラー、取消、再試行、期限にも対応します。

`0.2.0`では、1枚のQRを既定でversion 20までに抑え、読んだペアリング用のQRをすべて報告します。npmに公開済みなのは`0.1.0`です。

> [!NOTE]
> ペアリング用ブロックは起動時固定のフィーチャーフラグの内側にあり、既定は無効です。
> [フィーチャーフラグと切戻し](#フィーチャーフラグと切戻し)を参照してください。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [利用ガイド](docs/integration-guide.ja.md) ([English](docs/integration-guide.md)) | 準備、両端末のブロック手順、partの表示と読取り、カメラ側複数台、エラーコード、実機記録 |
| [移行と切戻し](docs/migration.ja.md) ([English](docs/migration.md)) | `turbowarp-realtime-motion-capture`からの移行、manual pairingへの切戻し、回帰確認 |
| [アーキテクチャ](docs/architecture.ja.md) ([English](docs/architecture.md)) | 実行時の構造、ビルド出力、拡張機能API manifest |
| [設計文書](docs/design/qr-pairing/README.md) | 要求仕様、データフロー、型契約、ブロック契約、移設計画、検証計画 |

## 想定する操作

1. 統合側端末でOfferのQRコードをプロジェクタに表示する。
2. カメラ側端末で読み取り、Offerを受理してAnswerのQRコードを表示する。
3. 担当者がスマートフォンでAnswerを撮影し、統合側端末まで画像を運ぶ。
4. 統合側端末のカメラで画像を読み取り、Answerを受理して接続成立を確認する。

複数QRの場合は必要な各部分を搬送します。スマートフォンは接続情報を光学的に運び、接続成立後のカメラデータはWebRTC経由で送ります。担当者への案内や投影画面の構成は利用アプリが担当します。

## パッケージ間の責務

| パッケージ | 責務 |
|---|---|
| `turbowarp-webrtc` | Offer／Answerの生成・受理、ICE、WebRTC接続 |
| 本パッケージ | QR搬送形式、分割表示・再構成、ペアリングの進行 |
| `turbowarp-jsqr` | カメラ画像からのQR読取り |
| `turbowarp-camera-source` | カメラ取得とフレームへのアクセス |
| `turbowarp-time-space-sync` | 光学的な時刻対応の推定、カメラ配置の校正 |
| `turbowarp-time-space-sync-app` | time-space-sync拡張の検証用アプリ |
| `turbowarp-camera-calibration-app` | レンズ校正。内部校正プロファイルをファイルとして作る |
| `turbowarp-webrtc-qrcode-pairing-app` | ペアリング単独の操作例と接続確認 |
| `turbowarp-realtime-motion-capture-app`、`turbowarp-photogrammetry-app` | 本番の会場運用。本拡張を直接埋め込む |

接続用QRの搬送は、時刻・空間校正やモーションキャプチャから独立して利用できます。`turbowarp-webrtc`、`turbowarp-jsqr`、`turbowarp-camera-source`は実行時に併用する拡張で、いずれも本拡張が起動時に存在を確認します。

ペアリング済みの接続をアプリ間で引き継ぐことはできません。別のSB3を開くとそのbundleが評価されてWebRTC拡張のインスタンスが作り直され、既存の`RTCPeerConnection`はblockから到達できなくなります。保存したSDPからの復元もできません。したがって本番では消費側アプリが本拡張を埋め込んで自分のフローの中でペアリングし、`turbowarp-webrtc-qrcode-pairing-app`は本番フローの一段階ではなく検証用として位置づけます。

## 搬送形式

QR partは`twqr/1`のenvelopeを使います。protocol、session、送信側と受信側のpeer名、メッセージ種別、message ID、reply-to、part indexとcount、メッセージ長、SHA-256ハッシュ、payloadを含みます。

ハッシュは光学搬送での破損を検出するためのもので、認証ではありません。QRを撮影できる人は誰でも同じ値を計算できます。投影された接続情報は、その投影を見られる全員に見えているものとして扱ってください。

`turbowarp-realtime-motion-capture`の`twmp-qr/1`が出発点ですが、両者は相互運用しません。`twmp-qr/1`はpeer名を1つしか持たずreply-toもないため、本拡張が必要とするpeerの対応付けとAnswerの追跡を表現できません。`twmp-qr/1`のQRは互換モードで受理せず`unsupported-protocol`として拒否します。曖昧な受理は誤った端末同士の接続につながりうるためです。

上限は、64 part、1 partあたりpayload 4096文字、1メッセージ131072文字です。payloadを印字可能ASCIIに限定しているため、文字数とバイト数は一致します。誤り訂正レベルMではpart数が先に上限となり、およそ126000文字が実効上限です。

## フィーチャーフラグと切戻し

ペアリング用ブロックは`qrCodePairing`フラグの内側にあります。起動時に一度だけ読み取り、既定は無効です。

```js
globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};
```

拡張の読込み前に設定してください。無効の間は`getInfo`がブロックを返さず、`pairing phase`は`disabled`を返します。

切り戻すときはフラグの設定をやめ、`turbowarp-webrtc`のブロック（`create offer code`、`accept offer code`、`answer code`、`accept answer code`）で直接ペアリングします。フラグの無効化は経路の選択であり、成立済みの接続を切断することはありません。

誤り訂正レベルと、1枚のQRが使えるversionの上限も、同じ方法で起動時に固定できます。

```js
globalThis.__TWQP_QR_CONFIG__ = {errorCorrectionLevel: 'Q', maxVersion: 20};
```

`maxVersion`（1〜40、既定20）は、1枚のQRをどこまで細かくしてよいかの上限です。約1,100文字のWebRTC Offerは、これまで1枚のversion 31〜32のQRになり、投影をカメラで読むには画面の大半を占める必要がありました。既定の上限では、version 20のQR約4枚になります。40にすると、以前と同じ1枚のQRに戻ります。

## 開発と確認

Node.js >=22.18.0、pnpm 11.11.0を利用します。

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

`check`は型検査、lint、テンプレートのテスト、READMEブロック参照の生成検証、ビルド再現性、リポジトリ方針、npm梱包のdry-runを確認します。雛形には独立したformatコマンドはありません。

生成物は`dist/webrtc-qrcode-pairing.js`と`dist/extension-manifest.json`です。JavaScriptをTurboWarpのカスタム拡張として読み込みます。manifestは宣言済みの全ブロックを常に記録します。フィーチャーフラグが実行時に隠すブロックも含みます。manifestはビルド時の契約であり、実行時の状態ではありません。

英語READMEのブロック参照は`src/block-definitions.json`から生成します。

## 必要な環境と注意

- Node.js >=22.18.0、pnpm 11.11.0。
- 併用する拡張: 接続は`turbowarp-webrtc`、QRのデコードは`turbowarp-jsqr`、カメラフレームは`turbowarp-camera-source`。本拡張より先に読み込んでください。
- `turbowarp-webrtc`はruntime capability v3（`acceptOffer`、`getAnswer`、`acceptAnswer`、`connectionState`、`hasPeer`、`closePeer`）を公開している必要があります。0.4.0以降が該当します。0.3.0以前はv2までで、Offerは作れても受理できないため往復を完結できません。
- QRで接続情報を運べたことは、接続が到達可能であることを意味しません。ネットワーク条件、ICE、STUN／TURNは`turbowarp-webrtc`の責務です。

> [!IMPORTANT]
> 本拡張はsandboxedでは動作しません。併用拡張へ`Scratch.vm.runtime`経由で到達し、
> rendererでスプライトのskinを差し替えるためです。unsandboxedの拡張コードは
> 信頼できる配布元からのみ読み込んでください。

## タスク管理

実装タスクはこのリポジトリのGitHub Issuesで管理します。設計文書は[docs/design/qr-pairing](docs/design/qr-pairing/README.md)にあります。要求仕様、アーキテクチャ、データフロー、型契約、ブロック契約、移設計画、検証計画を収めています。

## ライセンス

SPDX-License-Identifier: MPL-2.0
