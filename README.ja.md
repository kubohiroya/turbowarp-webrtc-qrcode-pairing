# TurboWarp-WebRTC-QRCode-Pairing

[English](README.md)

QRコードを使ってWebRTCの接続情報を交換するTurboWarp拡張です。`turbowarp-extension-template` 0.4.0を雛形として初期化しています。

## 現在の状態

**初期構成のみです。QRペアリング機能は未実装です。** テンプレートの`hello [NAME]`レポータを、拡張の読込みとビルドの確認用に残しています。`0.1.0`はローカルのパッケージ情報であり、npmへの公開済みバージョンを示すものではありません。

## 作る予定の機能

- WebRTCのOfferとAnswerをQR搬送用の形式に符号化する。
- 大きな接続情報を複数のQRに分割し、順番に表示する。
- 読み取ったQRを再構成し、セッション、メッセージ識別子、長さ、ハッシュを検証する。
- 接続までの進捗、接続状態、エラーを提供し、取消と再試行に対応する。
- WebRTCの接続機能を呼び出し、ペアリングの一連の処理を進める。

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

この表は今後の連携方針です。初期版にはこれらの実行時依存をまだ導入していません。接続用QRの搬送は、時刻・空間校正やモーションキャプチャから独立して利用できるようにします。

ペアリング済みの接続をアプリ間で引き継ぐことはできません。別のSB3を開くとそのbundleが評価されてWebRTC拡張のインスタンスが作り直され、既存の`RTCPeerConnection`はblockから到達できなくなります。保存したSDPからの復元もできません。したがって本番では消費側アプリが本拡張を埋め込んで自分のフローの中でペアリングし、`turbowarp-webrtc-qrcode-pairing-app`は本番フローの一段階ではなく検証用として位置づけます。

## 既存コードからの移設方針

`turbowarp-realtime-motion-capture`の`src/qr-courier.ts`、`src/qr-svg.ts`、`src/extension.ts`のOffer QR生成・表示処理を出発点とします。搬送形式はOfferとAnswerの両方に対応していますが、現在の拡張の表示処理はOffer側です。Answer側と往復の状態管理を本パッケージで整備します。

移設中はmotion-capture側の互換経路を維持し、既存コードの削除は別の変更として扱います。

## 開発と確認

Node.js >=22.18.0、pnpm 11.11.0を利用します。

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

`check`は型検査、lint、テンプレートのテスト、READMEブロック参照の生成検証、ビルド再現性、リポジトリ方針、npm梱包のdry-runを確認します。雛形には独立したformatコマンドはありません。

生成物は`dist/webrtc-qrcode-pairing.js`と`dist/extension-manifest.json`です。JavaScriptをTurboWarpのカスタム拡張として読み込むと、サンプルの挨拶ブロックを利用できます。現在はsandboxedで動作し、カメラやWebRTCにはアクセスしません。実際のペアリング実装時に、必要な能力とunsandboxed設定を検討します。

英語READMEのブロック参照は`src/block-definitions.json`から生成します。現在のブロックは`hello [NAME]`のみで、指定した名前への挨拶を返します。

## タスク管理

実装タスクはこのリポジトリのGitHub Issuesで管理します。[初期化Issue草案](docs/initialization-issue.ja.md)に今回の作業範囲と受け入れ基準を記録しています。草案は未投稿です。

## ライセンス

SPDX-License-Identifier: MPL-2.0
