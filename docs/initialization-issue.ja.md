# chore(scaffold): QR搬送によるWebRTCペアリング拡張の初期化

GitHub Issue用の未投稿草案。今回の依頼はローカル初期化であり、外部への投稿は含まない。

## Doing / ToDo / Done

- Doing: なし。
- ToDo: GitHubへのタスク記録と公開操作は別途の指示を受けて行う。
- Done: 専用metadata、ソース、検証環境、README、生成物の整備と全チェック。

## ブランチと依存

- ブランチ: `chore/scaffold/qrcode-pairing-initialization`
- 依存: `turbowarp-extension-template` 0.4.0。QRコード搬送の実装移設は本タスクの後続。
- 将来の依存: webrtcのOffer／Answer能力、jsqrの読取り、camera-sourceのフレーム取得。
- 本タスクは初期構成のみ。実際のペアリングと他リポジトリの修正は含まない。

## 受け入れ基準

- [x] 専用package名・拡張ID・クラス名・リポジトリURLを設定する。
- [x] 日本語／英語READMEに未実装の状態、目的、責務分担、移設元を記載する。
- [x] 型検査、lint、既存テスト、README生成検証、ビルド再現性、repo検査、pack dry-runが通る。
- [x] 生成JavaScriptとmanifestを配置する。

## フラグとロールバック

初期版にはペアリングの実行経路がなく、フィーチャーフラグは不要。移設時は既存経路を維持し、新経路を既定OFFで段階導入する。初期化のロールバックは、この変更で追加したファイルだけを取り除く。既存の`.git`は保持する。

## 運用ログ

- start: 2026-09-15 ローカル初期化に着手。
- blocked: 初回checkのdist検査が未追跡ファイルを不一致と判定。初期リポジトリでも機能する内容比較方式へ調整。README検査もGitの追跡状態に依存しない比較へ変更。
- blocked: README検査の.ts動的importが型検査に非対応。Node子プロセスで生成スクリプトを実行する方式へ修正。
- done: 2026-09-15 pnpm run check成功。型検査、lint、7テスト、README検査、ビルド再現性、repo検査、pack dry-runを確認。
