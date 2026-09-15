# 検証計画（DoD → テスト対応）

対応要求: requirements.md §8

## 1. テストの層

| 層 | 対象 | 依存の扱い |
|---|---|---|
| 単体（純粋） | `src/qr/**` | 依存なし。フィーチャーフラグと独立に動く（NFR-4） |
| 単体（ドメイン） | `src/pairing/**` | `WebRtcPairingPort` / `QrScanPort` / `DisplayPort` / `MonotonicClock`をフェイク注入 |
| 連携（プロセス内） | hub controller ↔ camera controller | 2つのcontrollerをQRテキスト受け渡しで結線。WebRTCは`RTCPeerConnection`のフェイク、またはNode環境では純粋なコード交換フェイク |
| 実デコード | `qr/svg.ts` → jsQR | 生成SVG／モジュール行列をラスタライズし`jsqr`で復号（移設元の手法を流用） |
| 実機 | 全工程 | 手順書に従い記録する（自動化しない） |

## 2. DoD対応表

| DoD | 検証方法 | テストファイル |
|---|---|---|
| 1. 全工程で接続成立 | プロセス内往復（自動）＋実機（手動） | `tests/pairing-roundtrip.test.ts` / 実機記録 |
| 2. 接続後のメッセージ送受信 | 実機で`turbowarp-webrtc`の`send event`／`next received message`を確認 | 実機記録 |
| 3. 単一QRと複数QRの往復、順不同・重複・不足 | 短いコード（1part）と6000文字相当（複数part）で往復。partを逆順投入、同一part再投入、1つ欠落 | `tests/qr-courier.test.ts` / `tests/pairing-roundtrip.test.ts` |
| 4. 不正QR・別session・別peer・矛盾part・hash不一致・上限超過 | 各エラーコードごとにケースを用意し、いずれも`delivered`が立たないことを確認 | `tests/qr-courier.test.ts` / `tests/pairing-validation.test.ts` |
| 5. 取消・期限・再試行・古い非同期応答・古いQR | フェイク時計を進めて期限、遅延resolveするフェイクWebRTCでepoch検証、retry後に旧QRを投入 | `tests/pairing-lifecycle.test.ts` |
| 6. 2台以上のcameraの混線なし | hub 1つに対しcamera A/Bを順に接続。Bの回答をAのsession keyへ投入して拒否されることを確認 | `tests/pairing-multi-peer.test.ts` |
| 7. 表示復元と資源解放、共有カメラを妨げない | フェイクrendererで`updateDrawableSkinId`の復元呼び出しと`destroySkin`を確認。leaseの`release`回数と、アプリ側leaseが残る場合にカメラが停止しないことを確認 | `tests/pairing-display.test.ts` |
| 8. 進捗・受信完了・接続成立・エラーの参照 | 各phaseで`progress()`の全フィールドを検証。`offer-received`と`connected`が別状態であることを明示的にassert | `tests/pairing-progress.test.ts` |
| 9. 既定OFFとmanual pairingへの切戻し | フラグ未設定で`getInfo()`にペアリングブロックが無いこと、直接呼出しが`feature-disabled`、`pairingPhase`が`disabled`を返すこと。切戻し手順はREADMEに記載 | `tests/extension.test.ts` |
| 10. `pnpm run check` | CIとローカル | — |
| 11. ドキュメント更新 | `pnpm run docs:check`＋レビュー | — |
| 12. 実機記録 | 下記テンプレートで記録 | — |

## 3. 重点ケース（受け入れテストの具体）

### 3.1 形式・検証（FR-2.5）

各ケースは「エラーコードが期待どおり」かつ「WebRTCへ引き渡されない」の両方をassertする。

| ケース | 入力 | 期待コード |
|---|---|---|
| JSONでない | `"not json"` | `invalid-json` |
| 旧protocol | `twmp-qr/1`のenvelope | `unsupported-protocol` |
| 未知version | `twqr/2` | `unsupported-protocol` |
| partIndex >= partCount | `{partIndex:3,partCount:3}` | `index-out-of-range` |
| partCount > 64 | `{partCount:65}` | `invalid-envelope` |
| messageLength = 0 | | `invalid-envelope` |
| messageLength > 131072 | | `message-too-large` |
| payload > 4096 | | `invalid-envelope` |
| QRテキスト > 8192 | | `part-too-large` |
| hashが43文字でない | | `invalid-envelope` |
| 別sessionIdのpartを混ぜる | | `message-mismatch` |
| 同indexで異なるpayload | | `conflicting-part` |
| hashだけ書き換える | 全part揃った状態 | `hash-mismatch` |
| messageLengthだけ書き換える | 全part揃った状態 | `length-mismatch` |
| 1part欠落で`assemble` | | `missing-parts` |
| 分割で65part必要な長さ | | `too-many-parts` |

### 3.2 交換の同一性（FR-1.4 / FR-4.5）

| ケース | 期待 |
|---|---|
| Answerの`replyTo`が別Offerのmessage ID | `reply-mismatch`、`acceptAnswer`未呼出 |
| Answerの`senderPeerId`がsessionの`remotePeerId`と不一致 | `peer-mismatch` |
| `retryPairing`後に旧exchangeのAnswerを投入 | `stale-exchange`、`acceptAnswer`未呼出 |
| 存在しないsessionキーへ投入 | `unknown-session` |
| cameraでkind=`answer`のQRを読む | `unexpected-kind` |
| 完成済みsessionへ同じ全partを再投入 | `already-accepted`、`acceptAnswer`は1回だけ |

### 3.3 peer対応の非対称性（FR-1.3）

hubが`localPeerId="studio"`, `remotePeerId="cam-A"`、cameraが`expectedLocalPeerId=""`のとき:

- camera側のWebRTC呼出しは`acceptOffer("studio", …)`であること
- hub側のWebRTC呼出しは`createOffer("cam-A", …)`／`acceptAnswer("cam-A", …)`であること
- 両端で同じ文字列を設定していないのに接続が成立すること
- cameraが`expectedLocalPeerId="cam-B"`を指定した場合は`peer-mismatch`で拒否されること

### 3.4 ライフサイクル（FR-4.4 / FR-4.8）

| ケース | 期待 |
|---|---|
| `createOffer`が遅延resolveする間に`cancelPairing` | 遅延結果が捨てられ、phaseは`cancelled`のまま |
| `acceptOffer`遅延中に期限到来 | phaseは`expired`、遅延結果でphaseが動かない |
| 期限到来（未接続） | 表示復元・lease解放・タイマ停止・`closePeer`呼出し |
| 期限到来（接続済み） | `closePeer`を呼ばない |
| `PROJECT_RUN_STOP` | 表示復元とlease解放。成立済み接続は維持 |
| `RUNTIME_DISPOSED` | 全session破棄とリスナ解除 |
| `targetWasRemoved` | 当該スプライトの表示のみ終了、sessionは継続 |
| session数が9個目 | `session-limit` |

### 3.5 期限が壁時計に依存しないこと（FR-4.6）

フェイク`MonotonicClock`だけを進め、`Date.now()`は動かさない（あるいは逆方向へ飛ばす）状態で
期限が正しく判定されることをassertする。`createdAt`を未来・過去に改竄したenvelopeを投入しても
期限判定に影響しないことも確認する。

### 3.6 プライバシー（FR-4.9）

- `console`の全メソッドをスパイし、正常系・異常系いずれでも呼ばれないことを確認する。
- 全エラーの`message`について、pairing code本文・payload断片を含まないことを検証する
  （テスト用に識別可能なマーカー文字列をpairing codeへ埋め、それが例外メッセージへ現れないこと）。

## 4. 実機検証の記録テンプレート（DoD 12）

各試行につき以下を記録し、Issue #1のコメントへ貼る。未実施の条件を成功として扱わない。

```
日時:
役割/端末: hub = <機種/OS/ブラウザ/版>  camera = <機種/OS/ブラウザ/版>
搬送機: <スマートフォン機種/OS/カメラアプリ>
ICEモード: lan | stun
ネットワーク: 同一LAN / 別セグメント / その他
Offer: part数 =   / QR version =   / ECC =   / 表示面 = プロジェクタ(投影サイズ, 距離, 照度)
Answer: part数 =   / QR version =   / ECC =   / 表示面 = 端末画面(輝度)
読取り: cameraの読取り所要 =   秒 / hubの読取り所要 =   秒 / 再撮影回数 =
結果: 接続成立 = yes|no  / connectionState =  / 疎通確認(送受信) = yes|no
エラー: code =  / 状況 =
備考:
```

## 5. 自動化しない／できないもの

- プロジェクタ投影の実読取り、スマートフォンでの撮影・搬送。
- 実ネットワークでのICE成否（NFR-2）。
- 端末カメラの露出・フォーカス条件によるデコード成功率。

これらは実機記録でのみ担保し、CIの通過をもって「実機で動く」とは主張しない。
