# Pair two devices

[Editorで開く](https://turbowarp.org/editor?project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-webrtc-qrcode-pairing%2Fsamples%2Fpair-two-devices.sb3) · [SB3](https://kubohiroya.github.io/turbowarp-webrtc-qrcode-pairing/samples/pair-two-devices.sb3)

## 手順と期待結果

両端末で緑旗。hostでO、guestでA。guestでC→画面のカメラ許可ボタンをクリックしてhostのQRを読む。hostでNを押して全パートを順次見せ、guestはCで続きのパートを読む。guestのanswer QRもNで表示、hostはCで全パートを読む。Sでconnectedを確認。Xでセッション・peer・カメラを停止。再実行は緑旗から。

## 要件

同一LANのカメラ・画面付き実2端末、HTTPS対応ブラウザ、カメラ許可。WebRTC/Camera Source/jsQRの実distをID/SHA256/commit/license付きで同梱。jsQRデコーダのWASMも実distに同梱され、スキャン時のCDN取得は不要。sampleだけQR pairing起動フラグを初期化中にONにし、元のglobal descriptorを復元。本体既定OFFは維持。

## 未検証範囲

実2端末の光学QR読取・カメラ許可・実WASMによるQR読取・接続完了・実ネットワークは未検証。自動検証は未接続初期状態とanswer待機/取消のみに限定。

自動検証は無音（browser `--mute-audio`）で実施し、音声再生・カメラ・外部サービスを自動起動しません。

## 編集と再生成

`pair-two-devices/project.json` とSVGが編集元、`manifest.json` は配信/依存/確認条件です。Node.jsは`.nvmrc`を使用し `node scripts/build-samples.mjs`、`node scripts/build-samples.mjs --check`、`node --test scripts/verify-samples.mjs`、`node scripts/prepare-pages.mjs` で生成・検査します。ZIP日時/エントリー順は固定。SB3のJSは通常の拡張許可画面で非サンドボックス実行を選択します。

## ロールバック

PRをrevertしPagesを再公開します。本体distと既定フラグを変更しません。
