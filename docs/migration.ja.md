# 移行と切戻し

[English](migration.md)

## 1. turbowarp-realtime-motion-capture からの移行

`turbowarp-realtime-motion-capture`は`twmp-qr/1`形式でOfferをQR搬送する経路を、独自の
`qrCourierPairing`フラグの内側に持っています。ブロックは`prepare offer QR`、
`show offer QR part`、`show next offer QR part`、`end offer QR display`、`offer QR state`、
`offer QR error`です。

この経路はOffer側だけです。カメラ側がOfferを受理してAnswerを返す部分は別の手段が必要で、そこが
本拡張の追加分です。

### 形式

`twqr/1`は`twmp-qr/1`と**互換ではなく**、読み取りもしません。`twmp-qr/1`はpeer名を1つしか持たず
reply-toも無いため、次を表現できません。

- 送信側が自分を呼ぶ名前と、相手を呼ぶ名前の区別
- Answerがどの Offer への応答か

本拡張では両方が必要です。前者は両端で同じ識別子を設定せずに済ませるため、後者はAnswerが誤った
交換へ適用されないためです。必須フィールドの追加は後方互換にできないため、新しい名前空間と
versionを与えました。

`twmp-qr/1`のQRを本拡張へ渡すと`unsupported-protocol`で拒否されます。読み取り互換モードは
設けていません。peerの対応付けを表現できないQRを受理することは、その対応を推測することであり、
推測を誤れば誤った端末同士が接続されます。曖昧な受理より明示的な拒否のほうが安全です。

同じ会場で両者を併用することはできます。相互にQRを読めませんが、失敗は黙って起きるのではなく
報告されます。

### ブロックの対応

| motion-capture | 本拡張 |
|---|---|
| `prepare offer QR for peer [PEER]` | `start offer pairing [SESSION] as [LOCAL_PEER] to [REMOTE_PEER]` |
| `show offer QR part [INDEX] on this sprite` | `show pairing QR part [INDEX] of [SESSION] on this sprite` |
| `show next offer QR part on this sprite` | `show next pairing QR part of [SESSION] on this sprite` |
| `offer QR part count` | `pairing QR part count of [SESSION]` |
| `current offer QR part` | `current pairing QR part of [SESSION]` |
| `end offer QR display` | `end pairing QR display of [SESSION]` |
| `offer QR state` | `pairing phase of [SESSION]`（状態が増えています。利用ガイド参照） |
| `offer QR error` | `pairing error code of [SESSION]`と`pairing error message of [SESSION]` |
| — | Answer側の一式、読取り、取消、再試行、期限 |

プロジェクトを移すときの差分です。

- すべてのブロックがsession名を取ります。1つのプロジェクトで複数台とペアリングできます。
- peerの引数が、自分の呼称と相手の呼称に分かれます。
- `offer QR state`は`idle`、`generating-offer`、`rendering`、`displayed`、`error`を返していました。
  `pairing phase`は往復の各段階に状態を持ち、QR読取り完了と接続成立を別々に報告します。
- 起動時フラグは`__TWMP_FEATURE_FLAGS__.qrCourierPairing`ではなく
  `__TWQP_FEATURE_FLAGS__.qrCodePairing`です。誤り訂正の設定も`__TWMP_QR_CONFIG__`から
  `__TWQP_QR_CONFIG__`に変わります。

### この移行に含まれないこと

本拡張は`turbowarp-realtime-motion-capture`を変更も削除もしません。同リポジトリのQR経路と
manual pairing経路はそのまま残ります。旧経路の廃止や`turbowarp-time-space-sync`側の責務調整は、
それぞれのリポジトリの別Issueとして扱います。

## 2. manual pairingへの切戻し

ペアリング用ブロックは経路の1つであり、必須ではありません。使うのをやめるには次のようにします。

1. `globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};`の設定をやめる。
2. `turbowarp-webrtc`のブロックで直接ペアリングする。
   - hub: `create offer code for peer [PEER]`、続いて`offer code for peer [PEER]`
   - カメラ側: `accept offer code [CODE] as peer [PEER]`、続いて`answer code for peer [PEER]`
   - hub: `accept answer code [CODE] for peer [PEER]`

   接続情報の運搬方法は会場の事情に合わせて選びます。
3. 拡張自体は読み込んだままで構いません。フラグが無効ならブロックを公開せず、何もしません。

フラグの無効化は経路の選択です。成立済みの接続を切断することはなく、既存のpeer接続を閉じることも
ありません。

フラグは起動時に一度だけ読むため、変更は次回の読込みから有効になります。プロジェクトの実行中に
経路が変わると失敗の解釈が難しくなるため、意図的にそうしています。

## 3. 変更後の回帰確認

`pnpm run check`を実行します。型検査、lint、テスト、README生成検証、ビルド再現性、リポジトリ方針
検査、npm梱包のdry-runが含まれます。

これに加えて、搬送形式や状態機械に手を入れた場合は手動で確認してください。光学条件はCIで
検証できません。

- [ ] 単一partと複数partの交換が、どちらも完了する。
- [ ] 順不同で読んだpartと、同じpartの重複読取りが、正しく再構成される。
- [ ] 不足partが`missing parts of [SESSION]`に現れ、再構成されない。
- [ ] 破損したpartが`hash-mismatch`で失敗し、WebRTCへ何も渡らない。
- [ ] カメラ側2台を順に接続しても、Answerが入れ替わらない。
- [ ] 取消・期限切れ・再試行のいずれでも表示とカメラが解放され、再試行前に撮影したQRが拒否される。
- [ ] 表示終了、プロジェクト停止、スプライト削除のいずれでもスプライトが元のコスチュームに戻る。
- [ ] 同じカメラを他が保持していれば、session終了後もカメラが止まらない。
- [ ] フラグ無効でペアリング用ブロックが現れず、manual pairingが動く。

実機の試行は[利用ガイドの記録テンプレート](integration-guide.ja.md#12-実機検証の記録)で記録します。

## 4. 将来、搬送形式を変えるとき

別のenvelopeが必要になった場合は次の方針です。

- 受信側は`protocol`を完全一致で判定し、それ以外を拒否します。未知のversionは中途半端に読まれず
  必ず拒否されます。
- 必須フィールドの追加はversionの変更であり、拡張ではありません。
- 旧形式の扱いと移行方法を、このページが`twmp-qr/1`について記しているのと同じ形で記載します。
