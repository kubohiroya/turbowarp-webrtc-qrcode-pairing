# アーキテクチャ

[English](architecture.md)

使い方: [利用ガイド](integration-guide.ja.md) · [移行と切戻し](migration.ja.md)。
設計の記録: [docs/design/qr-pairing](design/qr-pairing/README.md)。

## 実行時の構造

```text
extension.ts        ブロックのファサード。引数のCastと委譲、runtimeリスナの保持
  pairing/          sessionの状態機械。phase、epoch、期限、資源解放
    qr/             純粋な搬送処理。envelope、分割、再構成、検証、SVG生成
    ports/          アダプタ。WebRTC能力、カメラ走査、スプライトのskin
  errors.ts         搬送層とドメイン層が共有するエラーコード
```

`qr/`は`qrcode`と`errors.ts`以外に依存しません。DOM、Scratch、WebRTCへの依存が無いため、
搬送処理はruntimeなしで、かつフィーチャーフラグと独立して検証できます。`pairing/`は外部へ
portのinterface経由でのみ到達します。`turbowarp-webrtc`のcapability v3が未公開の間も、
フェイクを注入して往復をテストできるのはこのためです。

併用拡張は読込み時ではなく呼び出し時に解決します。不在の場合は、読込みの失敗ではなく、それを
必要としたブロックのエラーコードとして現れます。

## ビルド出力

このプロジェクトは実行時の動作と互換性メタデータを分離し、リポジトリに保存された同じソース定義から両方を生成します。

```text
src/index.ts + src/extension.ts
  -> vite-plugin-turbowarp-extension
  -> dist/<extension>.js

src/config.ts + src/block-definitions.json
  -> extension-api-manifest Viteプラグイン
  -> dist/extension-manifest.json
```

manifestプラグインはViteのビルド後フェーズで実行されます。これにより、JavaScriptプラグインの単一出力検証を維持しながら、TurboWarpバンドルの完成後にだけmanifestを追加します。

## 拡張機能API manifest v1

`schemas/extension-manifest.schema.json`が規範となるJSON Schemaです。`formatVersion`は`1`で、互換性のないmanifest形式を導入するときに変更する必要があります。

v1契約は次の情報を含みます。

- TurboWarp拡張機能のID
- 各ブロックのopcodeとブロック種類
- 各引数のID、引数種類、任意のメニュー参照
- 各メニューのIDとReporterブロックを受け付けるかどうか

ブロック、引数、メニューは、シリアライズ前に識別子で並べ替えられます。テキスト、説明、既定値、静的メニュー項目は、保存済みプロジェクトのAPI参照を識別しないため、意図的に除外しています。そのため互換性チェッカーは、API変更とドキュメントまたはローカライズの変更を区別できます。

## 差分の検出

`dist/`はリリース成果物としてコミットされます。`npm run check:dist`は両方のファイルを再ビルドし、`dist/`配下に変更、削除、未追跡ファイルがある場合に失敗します。これにより、ローカル検証とCIの両方でmanifestとバンドルの差分を検出できます。
