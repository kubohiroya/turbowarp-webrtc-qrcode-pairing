# Architecture

[日本語](architecture.ja.md)

Using the extension: [Integration guide](integration-guide.md) ·
[Migration and rollback](migration.md). Design records: [docs/design/qr-pairing](design/qr-pairing/README.md).

## Runtime structure

```text
extension.ts        block facade: casts arguments, delegates, owns runtime listeners
  pairing/          session state machine: phases, epochs, deadlines, resource release
    qr/             pure transport: message format, Structured Append codes, collection, verification
    ports/          adapters: WebRTC capability, camera scanning, sprite skins
  errors.ts         error codes shared by the transport and the domain
```

`qr/` depends on nothing but `@kubohiroya/qrcode-structured-append` and `errors.ts`: it has no DOM, Scratch, or WebRTC
dependency, so the transport can be tested without a runtime and independently of the feature flag.
`pairing/` reaches the outside world only through the port interfaces, which is what lets the round
trip be tested with a fake WebRTC capability while `turbowarp-webrtc` capability v3 is unpublished.

Companion extensions are resolved at call time, never at load time: a missing one becomes a specific
error code on the block that needed it, rather than a failure to load.

## Build outputs

The project keeps runtime behavior and compatibility metadata separate while generating both from
the same checked-in source definitions.

```text
src/index.ts + src/extension.ts
  -> vite-plugin-turbowarp-extension
  -> dist/<extension>.js

src/config.ts + src/block-definitions.json
  -> extension-api-manifest Vite plugin
  -> dist/extension-manifest.json
```

The manifest plugin runs in Vite's post-build phase. This preserves the JavaScript plugin's
single-output validation and adds the manifest only after the TurboWarp bundle is complete.

## Extension API manifest v1

`schemas/extension-manifest.schema.json` is the normative JSON Schema. `formatVersion` is `1` and
must change when an incompatible manifest shape is introduced.

The v1 contract contains:

- the TurboWarp extension ID;
- each block opcode and block type;
- each argument ID, argument type, and optional menu reference;
- each menu ID and whether it accepts reporter blocks.

Blocks, arguments, and menus are sorted by their identifiers before serialization. Text,
descriptions, default values, and static menu items are intentionally excluded because they do not
identify saved-project API references. A compatibility checker can therefore distinguish API
changes from documentation or localization changes.

## Drift detection

`dist/` is committed as a release artifact. `npm run check:dist` rebuilds both files and fails when
Git reports any modified, deleted, or untracked file below `dist/`. This catches manifest and bundle
drift in local checks and CI.
