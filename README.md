# TurboWarp-WebRTC-QRCode-Pairing

[日本語](README.ja.md)

A TurboWarp extension for exchanging WebRTC connection information through QR codes, including a smartphone carrying an image between machines. Initialized from `turbowarp-extension-template` 0.4.0.

**User guide:** [English](https://kubohiroya.github.io/turbowarp-webrtc-qrcode-pairing/)

## What it does

- Encodes a WebRTC Offer or Answer as a Structured Append sequence (ISO/IEC 18004), the QR standard's own way of splitting one message across up to 16 codes.
- Displays one code at a time on a sprite, so the integration machine can cycle the Offer codes in a loop.
- Reads the codes in any order, tolerates repeated readings, reports codes of other sequences and ignores them, and reports which codes are still missing.
- Verifies length and hash before a code reaches WebRTC, and hands each verified code over exactly once.
- Tracks which offer an answer replies to, so two camera machines never receive each other's connection.
- Reports transport progress and connection state as separate states, plus errors, cancellation, retry and deadlines.

Version 0.2.0 carries messages as Structured Append sequences, caps Offer codes at QR version 15 and Answer codes at 20, and reports every pairing code read. It needs `turbowarp-jsqr` 0.4.0 or later. 0.1.0 is the version published on npm.

> [!NOTE]
> The pairing blocks are behind a startup feature flag that is off by default. See
> [Feature flag and rollback](#feature-flag-and-rollback).

## Documentation

| Document | Contents |
|---|---|
| [Integration guide](docs/integration-guide.md) ([日本語](docs/integration-guide.ja.md)) | Setup, block sequences for both machines, showing and scanning parts, several camera machines, error codes, hardware test record |
| [Migration and rollback](docs/migration.md) ([日本語](docs/migration.ja.md)) | Coming from `turbowarp-realtime-motion-capture`, returning to manual pairing, regression checks |
| [Architecture](docs/architecture.md) ([日本語](docs/architecture.ja.md)) | Runtime structure, build outputs, extension API manifest |
| [Design records](docs/design/qr-pairing/README.md) | Requirements, data flow, type contracts, block contract, extraction plan, verification plan |

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
| `turbowarp-webrtc-qrcode-pairing` | Pairing message format, display and collection of its codes, and pairing orchestration |
| `qrcode-structured-append` | Creating and joining Structured Append sequences; a library, not an extension |
| `turbowarp-jsqr` | Decode QR codes from camera frames, including Structured Append positions |
| `turbowarp-camera-source` | Camera acquisition and frame access |
| `turbowarp-time-space-sync` | Optical time correspondence and camera placement calibration |
| `turbowarp-time-space-sync-app` | Verification app for the time-space-sync extension |
| `turbowarp-camera-calibration-app` | Lens calibration; produces intrinsic profiles as files |
| `turbowarp-webrtc-qrcode-pairing-app` | Standalone pairing example and connection verification |
| `turbowarp-realtime-motion-capture-app`, `turbowarp-photogrammetry-app` | Production venue workflow; embed this extension directly |

Pairing is usable independently of time/space calibration and motion capture. `turbowarp-webrtc`, `turbowarp-jsqr` and `turbowarp-camera-source` are companion extensions this one checks for at runtime.

A pairing session cannot be handed from one app to another. Opening a different SB3 re-evaluates its bundle, so the WebRTC extension instance is rebuilt and the existing `RTCPeerConnection` becomes unreachable from blocks; a saved SDP cannot restore it either. Consumer apps therefore embed this extension and pair inside their own flow, and `turbowarp-webrtc-qrcode-pairing-app` exists for verification rather than as a stage of the production workflow.

## Transport format

A pairing message is text in the `twqr/2` format: the protocol, a JSON header, and the pairing code, one per line. The header names the session, the sender and target peers, the message kind, the message id, what it replies to, the code's length and its SHA-256 hash.

The message is carried as one Structured Append sequence, made by [`@kubohiroya/qrcode-structured-append`](https://github.com/kubohiroya/qrcode-structured-append). Each code holds its position, the count and the sequence's parity in the standard header, so a reader knows which code it has without any wrapper of this extension's. The header line comes first, so the first code of a sequence already tells a reader whose message it is.

Reading goes by sequence. The first code read decides the sequence being collected; codes of any other sequence are reported as `foreign` and ignored. Until the first code of that sequence has been read, a first code that belongs to this exchange replaces it, so a stray code of an old projection cannot block the right one. A sequence that turns out to be another exchange's, or damaged, is dropped and collected again from the codes still being shown.

The parity only groups codes and collides one time in 256, so the hash in the header is what detects optical damage and mixed sequences. It is not authentication: anyone who can photograph the codes can recompute it. Treat a projected pairing code as visible to everyone who can see the projection.

`twqr/1`, which put a JSON envelope into every code, and `twmp-qr/1` from `turbowarp-realtime-motion-capture` do not interoperate with this format and are rejected with `unsupported-protocol`.

Limits: at most 16 codes per message, the Structured Append limit, and 32768 characters per pairing code. A pairing offer of about 1,250 characters is about four version 15 codes; the version cap binds long before the character limit.

## Feature flag and rollback

The pairing blocks are behind `qrCodePairing`, read once at startup and off by default:

```js
globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};
```

Set it before the extension loads. While the flag is off, `getInfo` publishes no blocks and `pairing phase` reports `disabled`.

To roll back, stop setting the flag and pair with the `turbowarp-webrtc` blocks directly: `create offer code`, `accept offer code`, `answer code` and `accept answer code`. Turning the flag off selects the other route; it never disconnects an established connection.

Error correction level and the largest QR version each direction uses can be fixed at startup the same way:

```js
globalThis.__TWQP_QR_CONFIG__ = {errorCorrectionLevel: 'M', offerMaxVersion: 15, answerMaxVersion: 20};
```

The caps (1 to 40) decide how fine each code gets. A single version 29-32 code for a whole offer is read off a projection only when it fills most of the frame. Offer codes default to version 15, about four codes that the integration machine cycles automatically and a camera read under every measured condition; Answer codes default to version 20, about two codes an operator turns by hand.

## Requirements and safety

- Node.js >=22.18.0 and pnpm 11.11.0.
- Companion extensions: `turbowarp-webrtc` for the connection, `turbowarp-jsqr` 0.4.0 or later for decoding and `turbowarp-camera-source` for camera frames. Load them before this one. Earlier `turbowarp-jsqr` versions return text only and are refused with `qr-decoder-missing`.
- `turbowarp-webrtc` must publish runtime capability v3, which adds `acceptOffer`, `getAnswer`, `acceptAnswer`, `connectionState`, `hasPeer` and `closePeer`. Version 0.4.0 publishes it; 0.3.0 and earlier publish v2, which can produce an offer but not accept one, so a round trip cannot complete.
- Carrying a code by QR does not make a connection reachable. Network conditions, ICE and STUN/TURN belong to `turbowarp-webrtc`.

> [!IMPORTANT]
> This extension must run without the sandbox because it reaches the companion extensions through
> `Scratch.vm.runtime` and swaps sprite skins through the renderer. Load unsandboxed
> extension code only from a source you trust.

## Development

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run dev
```

`pnpm run check` runs type checking, lint, template tests, generated README validation, bundle reproducibility, repository policy checks and an npm package dry run. There is no separate format script in the upstream template.

Build output: `dist/webrtc-qrcode-pairing.js` and `dist/extension-manifest.json`. Load the JavaScript file as a custom TurboWarp extension. The manifest always records every declared block, including blocks the feature flag hides at runtime: it is the build-time contract, not the runtime state.

Package name and version: `@kubohiroya/turbowarp-webrtc-qrcode-pairing@0.2.0` (0.1.0 is the latest published on npm).

## Block reference

<!-- BEGIN GENERATED BLOCKS -->

### `start offer pairing [SESSION] as [LOCAL_PEER] to [REMOTE_PEER]`

Creates a WebRTC offer for the integration machine and prepares it as a Structured Append sequence of QR codes.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `startOfferPairing` |
| `SESSION` | String, default: `pairing-1` |
| `LOCAL_PEER` | String, default: `hub` |
| `REMOTE_PEER` | String, default: `camera-1` |

### `start answer pairing [SESSION] as [LOCAL_PEER]`

Waits for an offer on the camera machine. Leave the name empty to adopt the name the offer assigns.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `startAnswerPairing` |
| `SESSION` | String, default: `pairing-1` |
| `LOCAL_PEER` | String, default: `` |

### `receive pairing message [TEXT] for [SESSION]`

Accepts a whole pairing message as text, such as one pasted or carried some other way. Camera scanning reads the QR codes of a sequence itself.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `ingestPairingQrText` |
| `TEXT` | String, default: `` |
| `SESSION` | String, default: `pairing-1` |

### `scan pairing QR for [SESSION] from camera [CAMERA_ID]`

Reads QR codes from the named camera, in any order, until the exchange has every code of the sequence. Codes of other sequences are reported and ignored.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `scanPairingQrFromCamera` |
| `SESSION` | String, default: `pairing-1` |
| `CAMERA_ID` | String, default: `default` |

### `received parts of [SESSION]`

Returns how many distinct codes of the incoming sequence have been read.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingReceivedParts` |
| `SESSION` | String, default: `pairing-1` |

### `required parts of [SESSION]`

Returns how many codes the incoming sequence has, or zero before the first code arrives.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingRequiredParts` |
| `SESSION` | String, default: `pairing-1` |

### `missing parts of [SESSION]`

Returns the one-based code numbers that have not been read yet, separated by commas.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingMissingParts` |
| `SESSION` | String, default: `pairing-1` |

### `pairing QR reads of [SESSION]`

Returns how many pairing QR codes this session has read, of any result. It rises by one per read, so a change means there is a new result to show.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingReadCount` |
| `SESSION` | String, default: `pairing-1` |

### `last pairing QR read of [SESSION]`

Returns what the latest pairing QR code was: accepted (a new code of the sequence), duplicate (a code already read), foreign (a code this exchange cannot use, which is ignored), or an empty string before the first read. QR codes that are not pairing codes are not reported.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingLastRead` |
| `SESSION` | String, default: `pairing-1` |

### `last pairing QR read detail of [SESSION]`

Returns the code as "2 / 4" for accepted and duplicate reads, or why a foreign code was ignored as an error code such as message-mismatch (another sequence), stale-exchange or peer-mismatch.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingLastReadDetail` |
| `SESSION` | String, default: `pairing-1` |

### `show pairing QR part [INDEX] of [SESSION] on this sprite`

Shows the selected one-based code of the sequence using a temporary sprite skin.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `showPairingQrPart` |
| `INDEX` | Number, default: `1` |
| `SESSION` | String, default: `pairing-1` |

### `show next pairing QR part of [SESSION] on this sprite`

Shows the next code and wraps from the last back to the first, so a loop with a short wait cycles the whole sequence.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `showNextPairingQrPart` |
| `SESSION` | String, default: `pairing-1` |

### `pairing QR part count of [SESSION]`

Returns how many codes are prepared for display, or zero when none are.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingQrPartCount` |
| `SESSION` | String, default: `pairing-1` |

### `current pairing QR part of [SESSION]`

Returns the one-based code selected for display, or zero when none is selected.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingQrCurrentPart` |
| `SESSION` | String, default: `pairing-1` |

### `pairing QR part [INDEX] of [SESSION] as SVG`

Returns the code as SVG markup so a project can display it its own way.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingQrPartSvg` |
| `INDEX` | Number, default: `1` |
| `SESSION` | String, default: `pairing-1` |

### `pairing QR part [INDEX] of [SESSION] as data URI`

Returns the code as a base64 SVG data URI for costumes and HTML images.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingQrPartDataUri` |
| `INDEX` | Number, default: `1` |
| `SESSION` | String, default: `pairing-1` |

### `end pairing QR display of [SESSION]`

Restores the sprites this session changed. The session itself stays open.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `endPairingQrDisplay` |
| `SESSION` | String, default: `pairing-1` |

### `pairing phase of [SESSION]`

Returns the session phase, such as offer-ready, receiving, answer-ready, connecting, or connected.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingPhase` |
| `SESSION` | String, default: `pairing-1` |

### `pairing connection state of [SESSION]`

Returns the WebRTC connection state reported for this session's peer.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingConnectionState` |
| `SESSION` | String, default: `pairing-1` |

### `pairing [SESSION] connected?`

Reports whether WebRTC has established the connection for this session.

| Property | Value |
|---|---|
| Type | Boolean |
| Opcode | `isPairingConnected` |
| `SESSION` | String, default: `pairing-1` |

### `wait until pairing [SESSION] is connected`

Waits for the connection, or fails when the session is cancelled, times out, or fails.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `waitUntilPairingConnected` |
| `SESSION` | String, default: `pairing-1` |

### `pairing error code of [SESSION]`

Returns the latest error code, such as hash-mismatch or peer-mismatch, or an empty string.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingError` |
| `SESSION` | String, default: `pairing-1` |

### `pairing error message of [SESSION]`

Returns the latest error message. Pairing codes and QR payloads are never included.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingErrorMessage` |
| `SESSION` | String, default: `pairing-1` |

### `local peer of [SESSION]`

Returns the name this machine uses for itself in this exchange.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingLocalPeer` |
| `SESSION` | String, default: `pairing-1` |

### `remote peer of [SESSION]`

Returns the name this machine uses for the other machine, which is also its WebRTC peer name.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingRemotePeer` |
| `SESSION` | String, default: `pairing-1` |

### `exchange id of [SESSION]`

Returns the identifier of the current offer and answer exchange. A retry allocates a new one.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingExchangeId` |
| `SESSION` | String, default: `pairing-1` |

### `remaining seconds of [SESSION]`

Returns the seconds left before the exchange times out.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingRemainingSeconds` |
| `SESSION` | String, default: `pairing-1` |

### `pairing sessions`

Returns the open session names, separated by commas.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `pairingSessions` |

### `cancel pairing [SESSION]`

Cancels the exchange and releases displays, buffers, and unconnected peers. Established connections stay up.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `cancelPairing` |
| `SESSION` | String, default: `pairing-1` |

### `retry pairing [SESSION]`

Starts a new exchange for the same session. QR codes from the previous exchange stop being accepted.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `retryPairing` |
| `SESSION` | String, default: `pairing-1` |

### `set pairing timeout of [SESSION] to [SECONDS] seconds`

Sets how long the exchange waits, measured on this machine's own clock.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `setPairingTimeout` |
| `SESSION` | String, default: `pairing-1` |
| `SECONDS` | Number, default: `600` |

<!-- END GENERATED BLOCKS -->

## Task management

Track implementation in this repository's GitHub Issues. Design documents live in [docs/design/qr-pairing](docs/design/qr-pairing/README.md): requirements, architecture, data flow, type contracts, the block contract, the extraction plan and the verification plan.

## License

SPDX-License-Identifier: MPL-2.0
