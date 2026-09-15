# 公開契約（ブロックAPI）と形式互換性

対応要求: FR-4.3（opcodeと引数を確定しmanifestへ反映）/ FR-2.8（形式互換性）

`kairo-design`標準の`api-endpoints.md`に相当する。本拡張の公開面はRESTではなくTurboWarpブロックなので、
opcodeとその引数をAPI契約として定義する。

## 0. 契約の生成経路

`src/block-definitions.json` と `src/config.ts` から `dist/extension-manifest.json`（`formatVersion: 1`）が生成される。
manifestはopcode・blockType・引数ID・引数型・menu参照のみを含み、テキストや説明は含まない
（[docs/architecture.md](../../architecture.md)）。本設計の変更はmanifestの中身を全面的に差し替えるが、
`formatVersion`は1のまま（manifest形式自体は変えない）。

`hello`ブロックは削除する。初期scaffold専用の動作確認ブロックであり、保存済みプロジェクトからの参照はない。

## 1. 共通引数

| 引数ID | 型 | 既定値 | 意味 |
|---|---|---|---|
| `SESSION` | STRING | `pairing-1` | アプリが決めるsessionキー。同時に`MAX_ACTIVE_SESSIONS`(8)まで |
| `LOCAL_PEER` | STRING | `hub` / 空 | 自分の呼称 |
| `REMOTE_PEER` | STRING | `camera-1` | 相手の呼称 |
| `INDEX` | NUMBER | `1` | 1始まりのpart番号 |
| `TEXT` | STRING | 空 | デコード済みQR文字列 |
| `CAMERA_ID` | STRING | `default` | camera-sourceのカメラID |
| `SECONDS` | NUMBER | `600` | 期限（1〜3600） |

## 2. hub（統合側）ブロック

| opcode | 種類 | テキスト | 効果・戻り値 |
|---|---|---|---|
| `startOfferPairing` | COMMAND | `start offer pairing [SESSION] as [LOCAL_PEER] to [REMOTE_PEER]` | `createOffer`→分割→`offer-ready`。既存の同名sessionがあれば`session-exists` |
| `acceptAnswerFromQr` | — | （明示ブロックなし） | 全part検証完了時に`ingestPairingQrText`／`scanPairingQrFromCamera`の内部で自動的に1回だけ`acceptAnswer`を呼ぶ（FR-1.2） |

## 3. camera（カメラ側）ブロック

| opcode | 種類 | テキスト | 効果・戻り値 |
|---|---|---|---|
| `startAnswerPairing` | COMMAND | `start answer pairing [SESSION] as [LOCAL_PEER]` | `awaiting-offer`へ。`LOCAL_PEER`が空ならOfferの`targetPeerId`を採用、非空なら照合し不一致で`peer-mismatch` |

Offer全part受信後の`acceptOffer`とAnswer分割は内部で自動実行し、`answer-ready`へ遷移する。

## 4. 受信（両ロール共通）

| opcode | 種類 | テキスト | 備考 |
|---|---|---|---|
| `ingestPairingQrText` | COMMAND | `receive pairing QR text [TEXT] for [SESSION]` | 正規入口。重複partは成功扱い。不正partは対応するエラーコードで失敗 |
| `scanPairingQrFromCamera` | COMMAND | `scan pairing QR for [SESSION] from camera [CAMERA_ID]` | 全part受信・取消・期限までブロックする。session中1つのleaseを保持 |
| `pairingReceivedParts` | REPORTER | `received parts of [SESSION]` | 取得済み数 |
| `pairingRequiredParts` | REPORTER | `required parts of [SESSION]` | 必要数。最初のpart受信前は0 |
| `pairingMissingParts` | REPORTER | `missing parts of [SESSION]` | 未取得の1始まり番号をカンマ区切りで返す |

## 5. 表示（両ロール共通）

| opcode | 種類 | テキスト | 備考 |
|---|---|---|---|
| `showPairingQrPart` | COMMAND | `show pairing QR part [INDEX] of [SESSION] on this sprite` | 一時skinへ差し替え。範囲外は`invalid-argument` |
| `showNextPairingQrPart` | COMMAND | `show next pairing QR part of [SESSION] on this sprite` | 最終partから先頭へ巡回 |
| `pairingQrPartCount` | REPORTER | `pairing QR part count of [SESSION]` | 未準備は0 |
| `pairingQrCurrentPart` | REPORTER | `current pairing QR part of [SESSION]` | 1始まり。未表示は0 |
| `pairingQrPartSvg` | REPORTER | `pairing QR part [INDEX] of [SESSION] as SVG` | アプリ独自表示用（FR-3.5） |
| `pairingQrPartDataUri` | REPORTER | `pairing QR part [INDEX] of [SESSION] as data URI` | コスチューム差替え等に使える形 |
| `endPairingQrDisplay` | COMMAND | `end pairing QR display of [SESSION]` | 元skinへ復元。sessionは維持する |

## 6. 進行・状態・診断

| opcode | 種類 | テキスト | 戻り値 |
|---|---|---|---|
| `pairingPhase` | REPORTER | `pairing phase of [SESSION]` | `PairingPhase`の文字列。未知のsessionは`idle`、フラグOFFは`disabled` |
| `pairingConnectionState` | REPORTER | `pairing connection state of [SESSION]` | `turbowarp-webrtc`の接続状態そのまま |
| `isPairingConnected` | BOOLEAN | `pairing [SESSION] connected?` | `phase === 'connected'` |
| `waitUntilPairingConnected` | COMMAND | `wait until pairing [SESSION] is connected` | 接続成立・失敗・取消・期限まで待つ |
| `pairingError` | REPORTER | `pairing error code of [SESSION]` | `PairingErrorCode`または空 |
| `pairingErrorMessage` | REPORTER | `pairing error message of [SESSION]` | サニタイズ済み文言（SDP・payloadを含まない） |
| `pairingLocalPeer` | REPORTER | `local peer of [SESSION]` | 自称 |
| `pairingRemotePeer` | REPORTER | `remote peer of [SESSION]` | 相手の呼称 |
| `pairingExchangeId` | REPORTER | `exchange id of [SESSION]` | 現在のexchangeId（診断・実機記録用） |
| `pairingRemainingSeconds` | REPORTER | `remaining seconds of [SESSION]` | 期限までの残り |
| `pairingSessions` | REPORTER | `pairing sessions` | 有効なsessionキーをカンマ区切り |

## 7. 制御

| opcode | 種類 | テキスト | 備考 |
|---|---|---|---|
| `cancelPairing` | COMMAND | `cancel pairing [SESSION]` | epoch++、資源解放、`cancelled`へ。成立済み接続は切らない |
| `retryPairing` | COMMAND | `retry pairing [SESSION]` | 取消後に新しい`exchangeId`で同ロールの交換を再開 |
| `setPairingTimeout` | COMMAND | `set pairing timeout of [SESSION] to [SECONDS] seconds` | 1〜3600。範囲外は`invalid-argument` |

合計 26 opcode（COMMAND 12 / REPORTER 13 / BOOLEAN 1）。

## 8. エラーの返し方

- COMMANDは失敗時に例外を投げる（TurboWarpはスクリプトを停止する）。同時に`pairingError`／`pairingErrorMessage`へ記録する。
- REPORTERは例外を投げず、既定値（空文字・0）を返す。状態はphaseとエラーコードで観測する。
- 重複partの受理、未接続時の`connectionState`照会などの正常系はエラーにしない。

## 9. 形式互換性（FR-2.8）

| 形式 | 発行元 | 本拡張の扱い |
|---|---|---|
| `twqr/1` | 本拡張 | 受理する |
| `twmp-qr/1` | `turbowarp-realtime-motion-capture`（Offerのみ） | 受理しない。`unsupported-protocol`で明示的に失敗する |

**非互換にした理由**: `twmp-qr/1`は`peerId`が1つだけで「送信側の自称」と「受信側への呼称」を区別できず、
`replyTo`も持たないため、FR-1.3（両端で同じ識別子を要求しない）とFR-1.4（Answerの応答先追跡）を満たせない。
これらは必須フィールドの追加にあたるので、後方互換の拡張ではなくversion変更とした。

**移行方法**:

1. 本拡張は`twqr/1`のみを発行・受理する。旧形式の読取り互換モードは設けない
   （ambiguousな受理より、明示的な`unsupported-protocol`のほうが誤接続を防ぐ）。
2. `turbowarp-realtime-motion-capture`は当面`twmp-qr/1`のまま維持する（NFR-5）。
   両者を同一会場で使うと相互に読めないが、`unsupported-protocol`として検出されるので誤接続にはならない。
3. motion-capture側を本拡張へ委譲する変更は、当該リポジトリの別Issue／PRとして記録する（Issue #1の方針どおり）。
4. 将来`twqr/2`が必要になった場合も、受理側は`protocol`完全一致で判定し、未知versionは常に拒否する。

## 10. manifest反映時の注意

- ブロック・引数・menuは識別子でソートされて出力されるので、`block-definitions.json`の記述順は契約に影響しない。
- menuは使わない（`SESSION`等はすべて自由入力のSTRING）。動的menuを将来入れる場合はmanifestに`menu`参照が現れるため、契約変更として扱う。
- フィーチャーフラグOFF時は`getInfo()`がペアリングブロックを返さないが、**manifestは常に全ブロックを出力する**
  （manifestはビルド時の静的契約であり、実行時のフラグ状態ではない）。この点はREADMEに明記する。
