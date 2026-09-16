# 利用ガイド

[English](integration-guide.md)

TurboWarpのプロジェクトから本拡張で2台の端末をペアリングする手順です。ブロック単位の一覧は
[Block reference](../README.md#block-reference)を参照してください。

## 1. 準備

次の拡張を本拡張より**先に**読み込み、すべてunsandboxedで動かします。

| 拡張 | 役割 |
|---|---|
| `turbowarp-webrtc` | Offer／Answerの生成と受理、接続の保持 |
| `turbowarp-jsqr` | カメラフレームからのQRデコード |
| `turbowarp-camera-source` | カメラの取得とフレームの提供 |

`turbowarp-webrtc`はruntime capability **v3**を公開している必要があります。0.4.0以降が該当します。
0.3.0以前はv2までで、`createOffer`と`getOffer`はありますが`acceptOffer`、`getAnswer`、
`acceptAnswer`、`connectionState`が無いため往復を完結できません。古い版では
`webrtc-capability-missing`になります。

ペアリング用ブロックは、拡張の読込み前に起動時フラグで有効にします。

```js
globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};
```

無効の間はブロックが現れず、`pairing phase of [SESSION]`は`disabled`を返します。

フラグはバンドルの評価時に一度だけ読まれるため、後から設定しても効きません。設定済みの
1ファイルを得るには、リポジトリの補助スクリプトを使います。

```bash
pnpm run build:flagged      # 例: pnpm run build:flagged Q
```

`local/webrtc-qrcode-pairing.flagged.js`を書き出し、カスタム拡張として読み込む`file://`のURLを
表示します。引数で誤り訂正レベルを固定できます。このファイルは作業コピー内のみで公開されません。
既定でブロックが出ないことの確認は、代わりに`dist/webrtc-qrcode-pairing.js`を読み込んで行います。

## 2. 役割と名前

一方が**統合側（hub）**で、Offerを作って投影し、Answerを読み取ります。もう一方が
**カメラ側端末**で、Offerを読み取ってAnswerを表示します。

名前は各端末が自分で決めます。**両端で一致している必要はありません。**

- hubは自分を`studio`、カメラ側を`cam-A`と呼ぶ。
- カメラ側はOfferから両方の名前を受け取り、接続を`studio`というキーで登録し、`cam-A`として応答する。

つまりhubの`remote peer`がカメラ側の`local peer`であり、その逆も同様です。名前は画面を見る人に
とって意味があれば十分です。

カメラ側の`LOCAL_PEER`を空にすると、Offerが割り当てた名前をそのまま採用します。名前を指定すると
それを要求し、別の端末宛のOfferは`peer-mismatch`で拒否されます。担当者が誤った投影を読み取った
場合の検出に使えます。

## 3. hub側のスクリプト

```
緑の旗が押されたとき
  start offer pairing [pairing-1] as [studio] to [cam-A]
  set pairing timeout of [pairing-1] to (600) seconds
  show pairing QR part (1) of [pairing-1] on this sprite
```

期限の設定はsessionを開いた後に置きます。2つの`start`ブロック以外はすべて
開いているsessionを必要とし、無い場合は`no-session`になります。期限はsessionを
開いた時点からの経過で測るため、直後に設定しても失うものはありません。

`start offer pairing`はOfferが生成されQR partの準備が終わると戻り、phaseは`offer-ready`になります。
Offer生成はICE収集の完了を待つため、少し時間がかかります。

partを投影してカメラ側に読み取らせ、担当者がAnswerを運んできたら次を実行します。

```
scan pairing QR for [pairing-1] from camera [default]
wait until pairing [pairing-1] is connected
end pairing QR display of [pairing-1]
```

`scan pairing QR`はAnswerの全partが揃い検証を通った時点で戻ります。phaseは`answer-received`から
`connecting`へ進みます。`wait until ... is connected`はWebRTCが接続を報告すると戻り、取消・期限
切れ・失敗のときは失敗します。

## 4. カメラ側のスクリプト

```
緑の旗が押されたとき
  start answer pairing [pairing-1] as []
  set pairing timeout of [pairing-1] to (600) seconds
  scan pairing QR for [pairing-1] from camera [default]
  show pairing QR part (1) of [pairing-1] on this sprite
  wait until pairing [pairing-1] is connected
  end pairing QR display of [pairing-1]
```

Offerが揃うと拡張が自動でOfferを受理しAnswerを準備するので、phaseは`receiving`→`offer-received`
→`creating-answer`→`answer-ready`とブロックを追加せずに進みます。

## 5. 撮影しやすいpartの見せ方

接続情報が長いとQRは複数枚になります。自動で巡回させず、**1枚ずつ表示して担当者が送る**形にして
ください。投影を撮影する人は、各partが静止している必要があります。

```
show pairing QR part (1) of [pairing-1] on this sprite
say (join (join (current pairing QR part of [pairing-1]) " / ") (pairing QR part count of [pairing-1]))

[スペース] キーが押されたとき
  show next pairing QR part of [pairing-1] on this sprite
```

実務上の注意です。

- 「2 / 3」のようにpart番号と総数を出すと、担当者が残りを把握できます。
- スプライトの元のコスチュームは保持されます。`end pairing QR display`のほか、取消、期限切れ、
  停止ボタン、スプライトの削除でも元に戻ります。
- 投影ではスプライトを大きく正方形に保ち、コード周囲の白い余白を削らないでください。余白も
  シンボルの一部です。
- 誤り訂正レベルを上げると光学条件に強くなりますが、1枚あたりの文字数が減るためpart数が増え、
  運ぶ手間も増えます。既定は`M`です。読取りが不安定なら起動時に`Q`や`H`を指定します。
  `globalThis.__TWQP_QR_CONFIG__ = {errorCorrectionLevel: 'Q'};`
- スプライトのskinではなく自前で描画する場合は、
  `pairing QR part [INDEX] of [SESSION] as data URI`または`... as SVG`を読みます。この経路は
  rendererが無くても動きます。

## 6. partの読取り

`scan pairing QR for [SESSION] from camera [CAMERA_ID]`はsessionの間1つのcamera leaseを保持し、
全partが揃うまで読み続けます。同じpartを何度も読むのは正常で、害はありません。ポスターや別の
session、前回の試行など、自分のものではないQRは黙って読み飛ばします。

実行中は進捗を表示できます。

```
say (join (join (received parts of [pairing-1]) " / ") (required parts of [pairing-1]))
say (join "未取得: " (missing parts of [pairing-1]))
```

part数はpartの中に入っているため、`required parts`は最初のpartが届くまで0です。

QRの文字列を別の方法で得ている場合は、`receive pairing QR text [TEXT] for [SESSION]`で直接
投入できます。こちらが正規の入口で、カメラ走査はその上に作られています。

## 7. 進捗の観測

`pairing phase of [SESSION]`が交換の位置を返します。

| phase | 意味 |
|---|---|
| `disabled` | フィーチャーフラグが無効 |
| `idle` | その名前のsessionが無い |
| `creating-offer` | hub: WebRTCのOffer生成待ち |
| `offer-ready` | hub: Offer QRの投影準備ができた |
| `awaiting-answer` | hub: Answerのpartを部分受信中 |
| `answer-received` | hub: Answerが検証を通った |
| `awaiting-offer` | camera: 最初のOffer partを待っている |
| `receiving` | camera: Offerのpartを部分受信中 |
| `offer-received` | camera: Offerが検証を通った |
| `creating-answer` | camera: WebRTCのAnswer生成待ち |
| `answer-ready` | camera: Answer QRの表示準備ができた |
| `connecting` | 接続情報をWebRTCへ渡した。接続はまだ |
| `connected` | WebRTCが接続成立を報告した |
| `cancelled` / `expired` / `failed` | 交換が終了した |

**運べたことと繋がったことは別です。** `answer-received`と`offer-received`は光学搬送が成功した
ことを意味し、`connected`はネットワーク経路が通ったことを意味します。接続情報が完全に届いても
接続が失敗することはあります。到達性はQRではなくネットワークの条件で決まります。

## 8. カメラ側端末が2台以上のとき

session名と相手の呼称を分けて、1台ずつ順に接続します。

```
start offer pairing [pairing-A] as [studio] to [cam-A]
...
start offer pairing [pairing-B] as [studio] to [cam-B]
```

`cam-B`のAnswerを`pairing-A`へ投入すると拒否されます。各Answerはsessionと応答対象のOfferを
持っているため、接続が入れ替わることはありません。`pairing sessions`で開いているsession名を
確認できます。

## 9. 期限、取消、再試行

- `set pairing timeout of [SESSION] to [SECONDS] seconds` — 1〜3600秒、既定600秒。期限は
  **その端末自身の時計**で測るため、2台の時刻同期は不要です。`remaining seconds of [SESSION]`で
  残りを表示できます。
- `cancel pairing [SESSION]` — 表示を戻し、カメラと受信バッファを解放し、**まだ接続していない**
  場合はpeer接続を閉じます。成立済みの接続はそのままです。
- `retry pairing [SESSION]` — 取消して新しい交換を始めます。新しい交換は別のIDを持つため、前回の
  試行で撮影したQRは適用されずに拒否されます。

停止ボタンは表示とカメラを解放し、進行中の交換を取り消します。成立済みの接続は切断しません。

## 10. うまくいかないとき

`pairing error code of [SESSION]`が安定したコードを、`pairing error message of [SESSION]`が
担当者向けの文を返します。どちらにも接続情報そのものは含まれません。

| コード | 状況 | 対処 |
|---|---|---|
| `feature-disabled` | 起動時フラグが無効 | 読込み前に`__TWQP_FEATURE_FLAGS__`を設定する |
| `webrtc-capability-missing` | `turbowarp-webrtc`が無いかv3未満 | 先に読み込む。capability v3が必要 |
| `qr-decoder-missing` / `camera-unavailable` | `turbowarp-jsqr`か`turbowarp-camera-source`が無い、またはカメラ取得に失敗 | 先に読み込む。カメラの許可を確認する |
| `renderer-unavailable` | スプライトに一時skinを設定できない | ステージやクローンではなく通常のスプライトを使う。またはSVGを自分で表示する |
| `unsupported-protocol` | `twqr/1`ではないQR | 旧`twmp-qr/1`か、別製品のQR |
| `hash-mismatch` / `length-mismatch` | partは揃ったが内容が壊れている | 全partを読み直す。誤り訂正レベルを上げる |
| `conflicting-part` | 同じpart番号が別内容で届いた | 異なる交換が混ざっている。やり直す |
| `missing-parts` | 全partが揃っていない | `missing parts of [SESSION]`で不足を確認する |
| `peer-mismatch` | 別の端末同士を指すQR | 誤った投影を読み取っている |
| `reply-mismatch` / `stale-exchange` | 別のOfferへの応答、または前回の試行のQR | 現在のQRを撮り直す |
| `already-accepted` | この交換はすでにWebRTCへ渡している | 対処不要 |
| `timeout` | 期限が過ぎた | `retry pairing`する |
| `webrtc-rejected` | WebRTCが受理を拒否、または接続が失敗 | 搬送ではなくネットワークの問題 |
| `session-exists` / `session-limit` / `no-session` | 同名が開いている、開きすぎ、開いていない | sessionを閉じるか、名前を確認する |

## 11. 本拡張が担当しないこと

- **認証ではありません。** ハッシュは破損の検出用です。QRを撮影できる人は同じ値を計算でき、
  投影を見られる人は接続情報を読めます。投影の可視範囲は運用で管理してください。
- **到達性は保証しません。** ICE、STUN、TURNは`turbowarp-webrtc`の責務です。
- **映像は運びません。** カメラのデータは接続成立後にWebRTCで送ります。
- **画面構成は行いません。** 担当者への案内、投影レイアウト、接続後の処理は利用アプリの責務です。

## 12. 実機検証の記録

光学条件はCIで確認できません。試行ごとに記録し、未検証の条件を検証済みとして扱わないでください。

```
日時:
hub端末: <機種 / OS / ブラウザと版>
カメラ側端末: <機種 / OS / ブラウザと版>
搬送機: <スマートフォン機種 / OS / カメラアプリ>
ICEモード: lan | stun
ネットワーク: 同一LAN / 別セグメント / その他
Offer: part数 =   / QR version =   / 誤り訂正 =   / プロジェクタ（投影サイズ, 距離, 照度）
Answer: part数 =   / QR version =   / 誤り訂正 =   / 画面輝度
読取り: カメラ側   秒 / hub側   秒 / 撮り直し回数 =
結果: 接続成立 = yes|no / connection state =   / テストメッセージ送受信 = yes|no
エラー: code =   / 状況 =
備考:
```
