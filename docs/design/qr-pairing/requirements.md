# 要求仕様の把握（Issue #1）

出典: [Issue #1](https://github.com/kubohiroya/turbowarp-webrtc-qrcode-pairing/issues/1)。
本書はIssue本文を設計入力として再構成したもので、新しい要求の追加はしない。

信頼性の凡例: 🟢 Issue本文に明記 / 🟡 Issue本文＋既存実装からの妥当な導出 / 🔴 Issue本文にない設計上の追加判断。

## 1. 目的とスコープ

🟢 QRコードの光学的搬送でWebRTCのOffer／AnswerをやりとりするTurboWarp拡張。時刻同期・空間校正・モーションキャプチャに依存せず、複数アプリから再利用できる「接続準備」機能に限定する。

🟢 スコープ外: 光学的な時刻対応推定、レンズ校正、カメラ配置校正、姿勢推定、映像転送の独自実装。シグナリングサーバ。ICE／STUN／TURNの設計そのもの。

🟢 現状: テンプレート0.4.0由来の初期構成のみ。実行可能なのは`hello [NAME]`のみで、ペアリング実装は存在しない。

## 2. 役割と用語

| 用語 | 定義 | 由来 |
|---|---|---|
| 統合側端末 (hub) | Offerを生成・投影し、Answerを読み取る側 | 🟢 |
| カメラ側端末 (camera) | Offerを読み取り、Answerを表示する側 | 🟢 |
| 搬送担当者 | Answer QRをスマートフォンで撮影して統合側へ運ぶ人 | 🟢 |
| exchange（交換） | 1回のOffer→Answer往復。取消・再試行で新しいexchangeになる | 🟡 |
| part | 1枚のQRに収まる分割片 | 🟢 |
| courier envelope | partに載せる搬送用メタデータ＋payload | 🟢 |

## 3. 標準操作（正常系）

🟢 Issue「利用場面と標準操作」の7手順。

1. hubが対象cameraとのペアリングを開始しOfferを生成する。
2. hubがプロジェクタでOffer QRを表示する。
3. cameraがカメラでQRを読み取り、全partを取得してOfferを受理する。
4. cameraがAnswerを生成し、そのQRを画面に表示する。
5. 担当者がスマートフォンでAnswer QRを（複数partならすべて）撮影し、hubまで運ぶ。
6. 担当者がスマートフォン画面をhubのカメラにかざす。hubは全partを再構成しAnswerを受理する。
7. WebRTC接続の成立を確認し、結果を利用アプリへ提供する。

🟢 制約: スマートフォンに専用アプリ・ネットワークを要求しない（撮影画像の表示だけで搬送できる）。操作案内・端末配置・投影レイアウトは利用アプリの責務。

## 4. 責務分担

| 対象 | 責務 | 
|---|---|
| 本拡張 | QR搬送形式、QR生成・分割・表示、再構成・検証、Offer／Answer交換の進行と結果提供 |
| `turbowarp-webrtc` | Offer／Answer生成・受理、ICE、接続状態、接続とデータ通信 |
| `turbowarp-jsqr` | カメラフレームからのQRデコード |
| `turbowarp-camera-source` | カメラの取得・選択とフレームへのアクセス |
| 利用アプリ | 役割選択、操作案内、投影・表示レイアウト、接続後の処理 |

🟢 すべてIssue本文の表のとおり。

## 5. 機能要求（FR）

### FR-1 Offer／Answerの対称な搬送

| ID | 要求 | 受け入れ観点 |
|---|---|---|
| FR-1.1 | hub側のOffer生成・表示・Answer受理と、camera側のOffer受理・Answer生成・表示を両方実装する 🟢 | 両ロールのブロックが存在する |
| FR-1.2 | 再構成した接続情報は、正しい役割・対象のWebRTC能力に一度だけ渡す 🟢 | 二重受理が起きない |
| FR-1.3 | 送信側peer識別子と受信側ローカルpeer識別子の対応を定義し、両端で同じ識別子設定を暗黙に要求しない 🟢 | 非対称な命名で接続できる |
| FR-1.4 | AnswerがどのOffer交換への応答かを追跡し、別ペアリングへ誤適用しない 🟢 | 別exchangeのAnswerを拒否する |

### FR-2 QR搬送形式と再構成

| ID | 要求 |
|---|---|
| FR-2.1 | protocol version, session ID, peer対応情報, Offer／Answer種別, message ID, part index／count, message length, hash, payload を扱う 🟢 |
| FR-2.2 | QR容量と誤り訂正レベルに応じて分割し、単一QR／複数QRの両方に対応する 🟢 |
| FR-2.3 | partの順不同・重複読取りに対応し、取得済み数・必要数・未取得partを取得できる 🟢 |
| FR-2.4 | 全partが揃い、長さとhashを検証した後にのみWebRTCへ渡す 🟢 |
| FR-2.5 | 不正形式／非対応version／範囲外index／過大入力／異なるsession・messageの混在／矛盾した重複part／hash不一致を検出する 🟢 |
| FR-2.6 | hashは破損検出用であり本人性認証と区別する（文書化） 🟢 |
| FR-2.7 | message length・part数・受信状態保持に上限を設ける。既存上限（128 Ki、64 part、chunk 4096）を出発点に、単位と境界条件を明記する 🟢 |
| FR-2.8 | `twmp-qr/1`を移設の出発点とする。互換性を壊すならversionを変更し、旧形式の扱いと移行方法を明記する 🟢 |

### FR-3 表示と読取りの連携

| ID | 要求 |
|---|---|
| FR-3.1 | QR画像・part数・現在partを取得し、指定partの表示／次partへの切替／表示終了ができる 🟢 |
| FR-3.2 | 静止画撮影でも各partを確実に取得できるよう、手動切替とpart識別情報を提供する 🟢 |
| FR-3.3 | 読取り処理を独自に重複実装せず、jsqrのデコード文字列を受け取る入口を設ける 🟢 |
| FR-3.4 | camera-sourceの所有・lease規則を尊重し、同じカメラを後続の撮影用途へ引き継げるようにする 🟢 |
| FR-3.5 | skinを変更した場合、表示終了・取消・プロジェクト停止時に元へ復帰する。アプリ側の画像表示経路を妨げない 🟢 |

### FR-4 状態・エラー・ライフサイクル

| ID | 要求 |
|---|---|
| FR-4.1 | 生成中／表示・受信待ち／部分受信／接続中／接続成立／取消／失敗をアプリが区別できる。最終的な状態名と遷移は実装前に定義する 🟢 |
| FR-4.2 | QR読取り完了とWebRTC接続成立を別の状態として提供する 🟢 |
| FR-4.3 | session単位の開始・取消・再試行・状態／進捗／エラー参照を公開する。opcodeと引数は実装時に確定しmanifestへ反映する 🟢 |
| FR-4.4 | 取消・再試行後に到着した古い非同期結果を新しいsessionへ反映しない 🟢 |
| FR-4.5 | 再試行時は新しい交換を識別でき、遅れて読み取った古いQRが接続に使われない 🟢 |
| FR-4.6 | 待ち時間の上限を設定可能とする。期限判定は未同期端末の壁時計一致を前提にしない 🟢 |
| FR-4.7 | 複数camera端末との接続を対象peer／sessionごとに区別する。初期フローは1台ずつでよく、同時ペアリング画面は必須としない 🟢 |
| FR-4.8 | 停止・破棄時に所有する表示・購読・タイマ・受信バッファを解放する。共有カメラや成立済み接続の切断は所有関係と明示操作に従う 🟢 |
| FR-4.9 | 生のSDP・ICE情報・QR payloadを通常ログへ自動出力しない。エラー分類と進捗は診断に利用できる 🟢 |

## 6. 非機能要求（NFR）

| ID | 要求 | 由来 |
|---|---|---|
| NFR-1 | 人手の搬送（数分オーダー）に耐える。Offer／Answer生成時のICE収集完了条件と接続情報の有効性を既存実装に照らして確認する | 🟢 |
| NFR-2 | QR搬送だけで接続可能性が保証されるとは扱わない（ネットワーク条件は`turbowarp-webrtc`の責務） | 🟢 |
| NFR-3 | 新経路は`src/config/feature-flags.ts`の`qrCodePairing`（仮称）を起動時に読み取り、既定OFFで段階導入する | 🟢 |
| NFR-4 | courier等の純粋処理の単体検証はフラグと独立に実行できる | 🟢 |
| NFR-5 | motion-capture側の既存QR／manual pairing経路を削除せず維持する | 🟢 |
| NFR-6 | 利用アプリが新経路を無効化し従来のmanual Offer／Answer交換へ戻す手順を記載する。フラグOFFは経路選択の切戻しであり、成立済み接続の自動切断ではない | 🟢 |
| NFR-7 | `pnpm run check`（型検査・lint・テスト・README生成検証・ビルド再現性・repo検査・pack dry-run）が通る | 🟢 |
| NFR-8 | README（日英）、公開契約・manifest、操作手順、形式互換性、制約、回帰・切戻し手順を更新する | 🟢 |

## 7. 移設の出発点

🟢 `turbowarp-realtime-motion-capture`から次を抽出の出発点とする。

- `src/qr-courier.ts`: envelope生成、分割、parse、再構成、整合性検証
- `src/qr-svg.ts`: QRのSVG生成
- `src/extension.ts`: Offer QR準備・表示・part切替・表示終了と関連する状態管理

🟢 現在のcourier形式はOffer／Answerに対応するが、高水準の表示処理はOffer側のみ。コピーで完了とせず、Answer側と往復状態管理を補完する。抽出元のテストを移設し、追加部分の受け入れテストを整備する。汎用QR搬送コードからmotion-capture固有の型・命名・runtime依存を切り離す。

詳細な選別表は [extraction-plan.md](extraction-plan.md) を参照。

## 8. 受け入れ基準（DoD）

🟢 Issueのチェックリストをそのまま採用する。テストへの写像は [test-plan.md](test-plan.md) を参照。

1. 投影Offer → camera読取り → Answer撮影・スマートフォン搬送 → hub読取りの全工程で接続が成立する。
2. 接続成立後、既存WebRTC能力によるテストメッセージ送受信を確認する。
3. 単一QRと複数QRで往復できる。順不同・重複・不足partを検証する。
4. 不正QR、別session／別peer対応、矛盾part、hash不一致、上限超過が誤った接続情報の受理につながらない。
5. 取消・期限切れ・再試行・古い非同期応答・古いQRを検証する。
6. 2台以上のcameraを順に接続し、Answerと対象peerの対応が混線しない。
7. 表示の復元と所有資源の解放を確認し、共有カメラの利用を妨げない。
8. 進捗、QR受信完了、WebRTC接続成立、エラーをアプリから参照できる。
9. 起動時固定・既定OFFの新経路とmanual pairingへの切戻しを確認する。
10. `pnpm run check`が通る。
11. README（日英）ほかドキュメントを更新する。
12. 実機検証では端末・ブラウザ・QR表示条件・ネットワーク条件・part数・結果を記録する。未検証条件を成功済みと扱わない。

## 9. 設計時に判明した制約（Issue本文にない事実）

| # | 事実 | 影響 | 確認元 |
|---|---|---|---|
| C-1 | `turbowarp-webrtc`のruntime capability v2は`createOffer`／`getOffer`しか公開していない。`acceptOffer`／`getAnswer`／`acceptAnswer`／`connectionState`はブロック専用で、他拡張から呼べない | FR-1.1がv2のままでは実装不能。capability v3の追加が前提作業になる | `turbowarp-webrtc/src/runtime-capability.ts:19-24`、`src/manual-peer-session.ts:36-59` |
| C-2 | `createOffer`／`acceptOffer`はどちらも`waitForIceGathering`で収集完了まで待つ（trickle ICEではない） | 搬送に数分かかってもコード自体は不変で完結している。NFR-1の確認は「収集完了待ちである」ことをもって満たす | `turbowarp-webrtc/src/manual-peer-session.ts:109-149, 484-498` |
| C-3 | pairing codeは`base64url(JSON)`で印字可能ASCIIのみ。courierの`[\x20-\x7E]`制約と適合する | 形式変換は不要 | `turbowarp-webrtc/src/protocol.ts:26-42` |
| C-4 | `jsqr`の`waitForQrText`は呼び出しごとにcamera leaseを取得・解放する。partごとに呼ぶとlease取得・解放が繰り返される | session中は自前で1つのleaseを保持し、デコードは`scanFrame`を再利用する | `turbowarp-jsqr/src/extension.ts:95-155` |
| C-5 | 誤り訂正M・QR v40での1part容量は2331バイト。envelope v2のヘッダ最大長は362文字なので、payloadは最大1969文字／part、64partで126,016文字 | `MAX_MESSAGE_LENGTH = 128 Ki (131,072)`はM以下では到達しない。実効上限はpart数×chunk長 | 本設計での実測（`interfaces.ts`の定数コメント参照） |
| C-6 | motion-captureはvitest 4系、本リポジトリはvitest 5系 | 移設テストの実行確認が必要 | 両`package.json` |
