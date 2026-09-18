# QR搬送WebRTCペアリング 設計文書

出典: [Issue #1](https://github.com/kubohiroya/turbowarp-webrtc-qrcode-pairing/issues/1)

> [!NOTE]
> 本文書群は0.1.0の設計記録です。0.2.0で搬送形式を`twqr/1`（QRごとのJSON envelope）から
> `twqr/2`（1つのメッセージを連結QRコード＝Structured Append、ISO/IEC 18004で運ぶ）に置き換えた。
> 現行の形式と読取りの規則はリポジトリの[README](../../../README.ja.md#搬送形式)と
> [利用ガイド](../../integration-guide.ja.md#6-qrの読取り)を正とする。

| 文書 | 内容 |
|---|---|
| [requirements.md](requirements.md) | Issue #1の要求仕様の整理（FR/NFR/DoD）と、設計時に判明した制約 |
| [architecture.md](architecture.md) | モジュール構成、外部依存の契約、peer対応、期限、ライフサイクル、フラグ |
| [dataflow.md](dataflow.md) | 往復シーケンス、ロール別状態遷移、part受理の判定フロー |
| [interfaces.ts](interfaces.ts) | 型契約（搬送形式 `twqr/1`、port、状態、エラーコード、上限定数） |
| [block-api.md](block-api.md) | 公開ブロック契約（26 opcode）とmanifest反映、形式互換性 |
| [extraction-plan.md](extraction-plan.md) | `turbowarp-realtime-motion-capture`からの移設選別表とPR分割 |
| [test-plan.md](test-plan.md) | DoDとテストの対応、重点ケース、実機記録テンプレート |

本文書群は`kairo-design`の構成に準拠しつつ、TurboWarp拡張という対象に合わせて
`database-schema.sql`を省略し、`api-endpoints.md`を`block-api.md`（ブロック契約）に置き換えている。
