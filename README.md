# TurboWarp-WebRTC-QRCode-Pairing

[日本語](README.ja.md)

A TurboWarp extension for exchanging WebRTC connection information through QR codes, including a smartphone carrying an image between machines. Initialized from `turbowarp-extension-template` 0.4.0.

## What it does

**Current status: initial scaffold. QR pairing is not implemented yet.** The only executable block is the template's `hello [NAME]` reporter, retained to verify extension loading and the build pipeline. Version 0.1.0 is local package metadata; it does not imply an npm release.

Planned responsibilities:

- encode both WebRTC Offer and Answer in QR envelopes;
- split large messages into multiple QR codes and display individual parts;
- assemble decoded parts and validate the session, message identity, length and hash;
- expose pairing progress, connection status, errors, cancellation and retry;
- orchestrate WebRTC capabilities without duplicating their connection implementation.

## Intended workflow

1. The integration machine creates an Offer and displays its QR codes through a projector.
2. A camera machine scans them, accepts the Offer and displays Answer QR codes.
3. An operator photographs the Answer with a smartphone and carries the images to the integration machine.
4. The integration machine scans those images, accepts the Answer and confirms the connection.

The smartphone carries signaling information optically. Camera data is sent over WebRTC after connection establishment. Applications provide operator instructions and presentation choices.

## Package boundaries

| Package | Responsibility |
|---|---|
| `turbowarp-webrtc` | Offer/Answer creation and acceptance, ICE and WebRTC connections |
| `turbowarp-webrtc-qrcode-pairing` | QR transport protocol, multipart display/assembly and pairing orchestration |
| `turbowarp-jsqr` | Decode QR codes from camera frames |
| `turbowarp-camera-source` | Camera acquisition and frame access |
| `turbowarp-time-space-sync` | Optical time correspondence and camera placement calibration |
| `turbowarp-time-space-sync-app` | Combined connection and calibration workflow |
| proposed `turbowarp-webrtc-qrcode-pairing-app` | Standalone pairing example and connection verification |

These are intended runtime relationships, not dependencies already installed in this scaffold. Pairing remains usable independently of time/space calibration and motion capture.

## Extraction plan

Start from `turbowarp-realtime-motion-capture/src/qr-courier.ts`, `src/qr-svg.ts` and the Offer QR generation/display methods in `src/extension.ts`. The courier format already supports Offer and Answer, but the extension's display methods currently cover Offer. Complete the Answer path and the round-trip state machine here. Preserve a compatibility path in motion capture during migration; removal belongs to a separate change.

## Requirements and safety

- Node.js >=22.18.0 and pnpm 11.11.0.
- The current sample runs sandboxed and does not access cameras or WebRTC.
- Real pairing will require a review of runtime capabilities and unsandboxed configuration when implemented.

## Development

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

`pnpm run check` runs type checking, lint, template tests, generated README validation, bundle reproducibility, repository policy checks and an npm package dry run. There is no separate format script in the upstream template.

Build output: `dist/webrtc-qrcode-pairing.js` and `dist/extension-manifest.json`. Load the JavaScript file as a custom TurboWarp extension to try the sample reporter. The manifest records the current block contract; it does not advertise planned pairing blocks.

Package name and version for future consumers (not a claim of publication): `@kubohiroya/turbowarp-webrtc-qrcode-pairing@0.1.0`.

## Block reference

<!-- BEGIN GENERATED BLOCKS -->

### `hello [NAME]`

Returns a localized greeting for the supplied name.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `hello` |
| `NAME` | String, default: `world` |

<!-- END GENERATED BLOCKS -->

## Task management

Track implementation in this repository's GitHub Issues. The local [initialization issue draft](docs/initialization-issue.ja.md) records this scaffold's scope and acceptance criteria; it has not been posted. Future extraction work should explicitly record dependencies on the source repository and runtime capabilities.

## License

SPDX-License-Identifier: MPL-2.0
