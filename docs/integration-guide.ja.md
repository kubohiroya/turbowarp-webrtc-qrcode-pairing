# 利用ガイド

[English](integration-guide.md)

TurboWarpのプロジェクトから本拡張で2台の端末をペアリングする手順です。ブロック単位の一覧は
[Block reference](../README.md#block-reference)を参照してください。

## 1. 準備

次の拡張を本拡張より**先に**読み込み、すべてunsandboxedで動かします。

| 拡張 | 役割 |
|---|---|
| `turbowarp-webrtc` | Offer／Answerの生成と受理、接続の保持 |
| `turbowarp-jsqr` 0.4.0以降 | カメラフレームからのQRデコード。連結QRコードの位置も読む |
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
  [Answerを読む v]を送る
  <<(pairing phase of [pairing-1]) = [offer-ready]>ではない>まで繰り返す
    show next pairing QR part of [pairing-1] on this sprite
    (0.8)秒待つ
  end
  end pairing QR display of [pairing-1]

[Answerを読む v]を受け取ったとき
  scan pairing QR for [pairing-1] from camera [default]
  wait until pairing [pairing-1] is connected
```

期限の設定はsessionを開いた後に置きます。2つの`start`ブロック以外はすべて
開いているsessionを必要とし、無い場合は`no-session`になります。期限はsessionを
開いた時点からの経過で測るため、直後に設定しても失うものはありません。

`start offer pairing`はOfferが生成されQRの準備が終わると戻り、phaseは`offer-ready`になります。
Offer生成はICE収集の完了を待つため、少し時間がかかります。

続くループがOfferのQRを1枚ずつコマ送りで投影し、カメラ側は写った順に読み取ります。その間、hub側の
カメラは担当者が運んでくるAnswerを待ちます。Answerの最初の1枚を読むとphaseが`awaiting-answer`に
なり、ループが終わって投影からOfferが消えます。

`scan pairing QR`はAnswerの全QRが揃い検証を通った時点で戻ります。phaseは`answer-received`から
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

## 5. QRの見せ方

接続情報は、数枚のQRからなる1つの連結QRコード（Structured Append）で運びます。向きによって見せ方が
違います。

- **Offerはループ表示します。** カメラ側は読み続けるので、上のhub側スクリプトのようにhubが自分で
  コマ送りします。1枚あたり0.5〜1秒あれば、カメラは各QRを何フレームも捉えられます。読み逃したQRは
  次の周回でまた来ます。
- **Answerは担当者を待ちます。** カメラ側の画面を撮影する人には各QRが静止している必要があるので、
  キーやクリックで送ります。

```
show pairing QR part (1) of [pairing-1] on this sprite
say (join (join (current pairing QR part of [pairing-1]) " / ") (pairing QR part count of [pairing-1]))

[スペース v]キーが押されたとき
  show next pairing QR part of [pairing-1] on this sprite
```

実際の運用での注意:

- 「2 / 3」のようにQRの番号と総数を出すと、担当者が残りを把握できます。
- スプライトは元のコスチュームを保持します。`end pairing QR display`で元に戻り、取消、期限切れ、
  停止ボタン、スプライトの削除でも戻ります。
- スプライトは投影上で大きく正方形に保ち、QRの周囲の白い余白を削らないでください。余白もシンボルの
  一部です。
- 投影をカメラで読むときは、モジュールが粗いほど確実に読めます。Offer全体を1枚にしたversion 29〜32
  のQRは、720pの画面の大半を占める必要があり、斜めからは読めませんでした。OfferのQRは既定で
  version 15まで（約4枚、測定したすべての条件で読めた）、AnswerのQRはversion 20まで（約2枚）です。
  上限は起動時に`globalThis.__TWQP_QR_CONFIG__ = {offerMaxVersion: 15, answerMaxVersion: 20};`
  （それぞれ1〜40）で変えられます。
- 誤り訂正レベルを上げると光学条件に強くなりますが、1枚あたりの文字数が減るため枚数が増えます。
  既定は`M`です。読取りが不安定なら同じオブジェクトで`errorCorrectionLevel: 'Q'`か`'H'`を指定
  してください。1メッセージは連結QRコードの上限の16枚までで、超えると`start offer pairing`が
  `too-many-parts`で失敗します。
- スプライトの一時スキンではなく自分で描く場合は、
  `pairing QR part [INDEX] of [SESSION] as data URI`または`... as SVG`を読みます。この経路は
  rendererが無くても動きます。

## 6. QRの読取り

`scan pairing QR for [SESSION] from camera [CAMERA_ID]`はsessionの間1つのcamera leaseを保持し、
連結QRの全QRが揃うまで読み続けます。QRはどの順で読んでも揃います。同じQRを何度も読むのは正常で、
害はありません。別の連結QRのQRは報告して無視し、交換は終わらせません。ポスターなど、ペアリング用
ではないQRは何も言わずに読み飛ばします。

最初に読んだQRで、どの連結QRを集めるかが決まります。headerはメッセージの先頭にあるので、先頭のQRを
読めば誰宛てのメッセージかが分かります。既定の設定では1枚目だけで、QRが小さいときや誤り訂正が高いときは
先頭の数枚で分かります。

- 別の交換、別の相手、逆向きのものなら、その連結QRを破棄し、理由を付けて`foreign`と報告します。
- 集めている連結QRのheaderをまだ読めていない間は、別の連結QRのQRも脇で集め、そのheaderからこの交換の
  ものと分かれば、そちらに入れ替えます。古い投影のQRが1枚写り込んでも、正しいOfferの収集を妨げません。
- 全QRが揃うと、メッセージをハッシュで検査します。壊れていた連結QRは破棄して`foreign`
  （`hash-mismatch`）と報告し、表示が続いているQRから集め直します。

読んだペアリング用のQRはすべて報告されるので、アプリは今何が起きたかを担当者に伝えられます。

| `last pairing QR read of [SESSION]` | 意味                                   | `last pairing QR read detail of [SESSION]`          |
| ----------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `accepted`                          | まだ届いていなかったQR                 | QR、`2 / 4`                                          |
| `duplicate`                         | 読み取り済みのQR。何も変わらない       | QR、`2 / 4`                                          |
| `foreign`                           | この交換では使わず無視したQR           | 理由：`message-mismatch`（別の連結QR）、`stale-exchange`、`peer-mismatch`、`reply-mismatch`、`unexpected-kind`、`hash-mismatch`、`conflicting-part` |

`pairing QR reads of [SESSION]`は読むたびに1増えるので、スクリプトは前に見た値と比べて新しい結果に
気づけます。カメラは目の前のQRを1秒に何度も読むので、結果は読むたびのメッセージではなく、書き換わる
状態の1行として出してください。

実行中は進捗を表示できます。

```
say (join (join (received parts of [pairing-1]) " / ") (required parts of [pairing-1]))
say (join "未取得: " (missing parts of [pairing-1]))
```

枚数はQRの中に入っているため、`required parts`は最初のQRが届くまで0です。

メッセージ全体を別の方法（貼り付けや1枚のQR）で得ている場合は、
`receive pairing message [TEXT] for [SESSION]`で投入できます。

## 7. 進捗の観測

`pairing phase of [SESSION]`が交換の位置を返します。

| phase | 意味 |
|---|---|
| `disabled` | フィーチャーフラグが無効 |
| `idle` | その名前のsessionが無い |
| `creating-offer` | hub: WebRTCのOffer生成待ち |
| `offer-ready` | hub: Offer QRの投影準備ができた |
| `awaiting-answer` | hub: AnswerのQRを部分受信中 |
| `answer-received` | hub: Answerが検証を通った |
| `awaiting-offer` | camera: 最初のOfferのQRを待っている |
| `receiving` | camera: OfferのQRを部分受信中 |
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
| `qr-decoder-missing` / `camera-unavailable` | `turbowarp-jsqr` 0.4.0以降か`turbowarp-camera-source`が無い、またはカメラ取得に失敗 | 先に読み込む。カメラの許可を確認する |
| `renderer-unavailable` | スプライトに一時skinを設定できない | ステージやクローンではなく通常のスプライトを使う。またはSVGを自分で表示する |
| `unsupported-protocol` | `twqr/2`ではないメッセージ | 旧版の`twqr/1`か`twmp-qr/1`、または別製品のQR |
| `hash-mismatch` / `length-mismatch` | QRは揃ったが内容が壊れている | 走査中は連結QRを破棄して読み直す。続くなら誤り訂正レベルを上げる |
| `conflicting-part` | 同じ番号のQRが別内容で届いた | 走査中は連結QRを破棄して読み直す |
| `too-many-parts` | versionの上限では16枚を超える | versionの上限を上げるか、誤り訂正レベルを下げる |
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
Offer: 枚数 =   / QR version =   / 誤り訂正 =   / プロジェクタ（投影サイズ, 距離, 照度）
Answer: 枚数 =   / QR version =   / 誤り訂正 =   / 画面輝度
読取り: カメラ側   秒 / hub側   秒 / 撮り直し回数 =
結果: 接続成立 = yes|no / connection state =   / テストメッセージ送受信 = yes|no
エラー: code =   / 状況 =
備考:
```
