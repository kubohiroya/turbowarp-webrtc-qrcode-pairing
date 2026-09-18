# TurboWarp-WebRTC-QRCode-Pairing

[English](README.md)

QRコードを使ってWebRTCの接続情報を交換するTurboWarp拡張です。`turbowarp-extension-template` 0.4.0を雛形として初期化しています。

**利用ガイド:** [English](https://kubohiroya.github.io/turbowarp-webrtc-qrcode-pairing/) / [日本語](docs/integration-guide.ja.md)

## できること

- WebRTCのOfferとAnswerを連結QRコード（Structured Append、ISO/IEC 18004）として符号化します。QRの規格自身が定める、1つのメッセージを最大16枚に分ける方式です。
- スプライト上に1枚ずつ表示します。統合側端末はOfferのQRをコマ送りでループ表示できます。
- 読み取ったQRを順不同で受け付け、同じQRの重複読取りを許容し、別の連結QRの読取りは報告して無視し、未取得のQRを報告します。
- 長さとハッシュを検証してからWebRTCへ渡し、検証済みの接続情報を一度だけ引き渡します。
- Answerがどの Offer への応答かを追跡し、2台のカメラ側端末の接続情報が入れ替わらないようにします。
- 搬送の進捗と接続状態を別々の状態として報告します。エラー、取消、再試行、期限にも対応します。

`0.2.0`では、メッセージを連結QRコードで運び、1枚のQRを既定でOfferはversion 15、Answerはversion 20までに抑え、読んだペアリング用のQRをすべて報告します。`turbowarp-jsqr` 0.4.0以降が必要です。npmに公開済みなのは`0.1.0`です。

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

Offerは統合側端末がループ表示し、カメラ側端末は順不同で全部そろうまで読み取ります。Answerも複数枚の場合は各QRを搬送します。スマートフォンは接続情報を光学的に運び、接続成立後のカメラデータはWebRTC経由で送ります。担当者への案内や投影画面の構成は利用アプリが担当します。

## パッケージ間の責務

| パッケージ | 責務 |
|---|---|
| `turbowarp-webrtc` | Offer／Answerの生成・受理、ICE、WebRTC接続 |
| 本パッケージ | ペアリング用メッセージの形式、そのQRの表示と収集、ペアリングの進行 |
| `qrcode-structured-append` | 連結QRコードの作成と結合。拡張ではなくライブラリ |
| `turbowarp-jsqr` | カメラ画像からのQR読取り。連結QRコードの位置も読む |
| `turbowarp-camera-source` | カメラ取得とフレームへのアクセス |
| `turbowarp-time-space-sync` | 光学的な時刻対応の推定、カメラ配置の校正 |
| `turbowarp-time-space-sync-app` | time-space-sync拡張の検証用アプリ |
| `turbowarp-camera-calibration-app` | レンズ校正。内部校正プロファイルをファイルとして作る |
| `turbowarp-webrtc-qrcode-pairing-app` | ペアリング単独の操作例と接続確認 |
| `turbowarp-realtime-motion-capture-app`、`turbowarp-photogrammetry-app` | 本番の会場運用。本拡張を直接埋め込む |

接続用QRの搬送は、時刻・空間校正やモーションキャプチャから独立して利用できます。`turbowarp-webrtc`、`turbowarp-jsqr`、`turbowarp-camera-source`は実行時に併用する拡張で、いずれも本拡張が起動時に存在を確認します。

ペアリング済みの接続をアプリ間で引き継ぐことはできません。別のSB3を開くとそのbundleが評価されてWebRTC拡張のインスタンスが作り直され、既存の`RTCPeerConnection`はblockから到達できなくなります。保存したSDPからの復元もできません。したがって本番では消費側アプリが本拡張を埋め込んで自分のフローの中でペアリングし、`turbowarp-webrtc-qrcode-pairing-app`は本番フローの一段階ではなく検証用として位置づけます。

## 搬送形式

ペアリング用メッセージは`twqr/2`形式のテキストです。protocol、JSONのheader、接続情報を1行ずつ並べます。headerには、session、送信側と受信側のpeer名、メッセージ種別、message ID、reply-to、接続情報の長さとSHA-256ハッシュを含みます。

メッセージは1つの連結QRコードとして運びます。作成には[`@kubohiroya/qrcode-structured-append`](https://github.com/kubohiroya/qrcode-structured-append)を使います。各QRは規格のheaderに自分の位置、枚数、連結QRのparityを持つため、本拡張独自の包みなしに、読み手はどのQRを読んだかが分かります。headerの行が先頭にあるため、連結QRの1枚目だけで誰宛てのメッセージかが分かります。

読取りは連結QR単位です。最初に読んだQRが収集する連結QRを決め、それ以外の連結QRのQRは`foreign`として報告して無視します。ただし収集中の連結QRの1枚目をまだ読んでいない間は、この交換に属する1枚目が読まれれば入れ替えます。古い投影のQRが1枚写り込んでも、正しいOfferの収集を妨げないためです。別の交換のものや破損していたと分かった連結QRは破棄し、表示が続いているQRから集め直します。

parityは連結QRをまとめるだけのもので、256回に1回は一致してしまいます。光学搬送での破損や混在を検出するのはheader内のハッシュです。これは認証ではありません。QRを撮影できる人は誰でも同じ値を計算できます。投影された接続情報は、その投影を見られる全員に見えているものとして扱ってください。

QRごとにJSONのenvelopeを入れていた`twqr/1`と、`turbowarp-realtime-motion-capture`の`twmp-qr/1`は、この形式と相互運用せず、`unsupported-protocol`として拒否します。

上限は、1メッセージ16枚（連結QRコードの規格上の上限）、接続情報32768文字です。約1,250文字のOfferはversion 15のQR約4枚になり、文字数の上限より先にversionの上限が効きます。

## フィーチャーフラグと切戻し

ペアリング用ブロックは`qrCodePairing`フラグの内側にあります。起動時に一度だけ読み取り、既定は無効です。

```js
globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};
```

拡張の読込み前に設定してください。無効の間は`getInfo`がブロックを返さず、`pairing phase`は`disabled`を返します。

切り戻すときはフラグの設定をやめ、`turbowarp-webrtc`のブロック（`create offer code`、`accept offer code`、`answer code`、`accept answer code`）で直接ペアリングします。フラグの無効化は経路の選択であり、成立済みの接続を切断することはありません。

誤り訂正レベルと、方向ごとに1枚のQRが使えるversionの上限も、同じ方法で起動時に固定できます。

```js
globalThis.__TWQP_QR_CONFIG__ = {errorCorrectionLevel: 'M', offerMaxVersion: 15, answerMaxVersion: 20};
```

上限（1〜40）は、1枚のQRをどこまで細かくしてよいかを決めます。Offer全体を1枚にしたversion 29〜32のQRは、投影をカメラで読むには画面の大半を占める必要があります。Offerは既定でversion 15、約4枚で、統合側端末が自動でループ表示し、測定したすべての条件でカメラが読めました。Answerは既定でversion 20、担当者が手で切り替える約2枚です。

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
- 併用する拡張: 接続は`turbowarp-webrtc`、QRのデコードは`turbowarp-jsqr` 0.4.0以降、カメラフレームは`turbowarp-camera-source`。本拡張より先に読み込んでください。それより前の`turbowarp-jsqr`はテキストしか返さないため、`qr-decoder-missing`として拒否します。
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
