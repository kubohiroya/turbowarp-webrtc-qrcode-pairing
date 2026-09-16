# Integration guide

[日本語](integration-guide.ja.md)

How to pair two machines with this extension from a TurboWarp project. For the block-by-block
reference, see [Block reference](../README.md#block-reference).

## 1. Before you start

Load these extensions **before** this one, and run all of them unsandboxed:

| Extension | Why |
|---|---|
| `turbowarp-webrtc` | Creates and accepts the offer and the answer, and owns the connection |
| `turbowarp-jsqr` | Decodes QR codes from camera frames |
| `turbowarp-camera-source` | Acquires the camera and exposes frames |

`turbowarp-webrtc` must publish runtime capability **v3**, which version 0.4.0 and later do. Version
0.3.0 and earlier publish v2, which has `createOffer` and `getOffer` but not `acceptOffer`,
`getAnswer`, `acceptAnswer` or `connectionState`, so a round trip cannot complete. A version that is
too old reports `webrtc-capability-missing`.

Turn the pairing blocks on at startup, before the extension loads:

```js
globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};
```

While the flag is off, no pairing blocks appear and `pairing phase of [SESSION]` reports `disabled`.

The flag is read once while the bundle evaluates, so setting it afterwards has no effect. To get a
single file that already has it set, run the repository's helper:

```bash
pnpm run build:flagged      # optionally: pnpm run build:flagged Q
```

It writes `local/webrtc-qrcode-pairing.flagged.js` and prints a `file://` URL to load as a custom
extension. The optional argument fixes the error correction level. The file is local to the working
copy and is not published; loading `dist/webrtc-qrcode-pairing.js` instead is how you check the
blocks really are off by default.

## 2. Roles and names

One machine is the **hub**: it creates the offer, projects it, and reads the answer back. The other
is the **camera machine**: it reads the offer and shows the answer.

Each machine picks its own names. They do **not** have to match:

- The hub calls itself `studio` and the camera machine `cam-A`.
- The camera machine learns both names from the offer. It registers the connection under `studio`
  and answers as `cam-A`.

So the hub's `remote peer` is the camera machine's `local peer`, and vice versa. The names only need
to be meaningful to the person reading the screen.

Pass an empty `LOCAL_PEER` on the camera machine to accept whatever name the offer assigns. Pass a
name to require it: an offer addressed to a different machine is then rejected with `peer-mismatch`,
which catches an operator scanning the wrong projection.

## 3. The hub script

```
when green flag clicked
  start offer pairing [pairing-1] as [studio] to [cam-A]
  set pairing timeout of [pairing-1] to (600) seconds
  show pairing QR part (1) of [pairing-1] on this sprite
```

The timeout is set after the session exists: every block but the two `start`
blocks needs an open session and reports `no-session` otherwise. The deadline is
measured from the moment the session started, so setting it right afterwards
loses nothing.

`start offer pairing` returns once the offer exists and its QR parts are prepared; the phase becomes
`offer-ready`. Creating the offer waits for ICE gathering to finish, so it can take a moment.

Then project the parts and let the camera machine read them. When the operator brings the answer
back:

```
scan pairing QR for [pairing-1] from camera [default]
wait until pairing [pairing-1] is connected
end pairing QR display of [pairing-1]
```

`scan pairing QR` returns when every part of the answer has arrived and passed its checks. At that
point the phase is `answer-received`, then `connecting`. `wait until ... is connected` returns when
WebRTC reports the connection, and fails if the session is cancelled, times out, or fails.

## 4. The camera machine script

```
when green flag clicked
  start answer pairing [pairing-1] as []
  set pairing timeout of [pairing-1] to (600) seconds
  scan pairing QR for [pairing-1] from camera [default]
  show pairing QR part (1) of [pairing-1] on this sprite
  wait until pairing [pairing-1] is connected
  end pairing QR display of [pairing-1]
```

After the offer is complete the extension accepts it and prepares the answer on its own, so the
phase moves `receiving` → `offer-received` → `creating-answer` → `answer-ready` without another
block.

## 5. Showing parts so they can be photographed

A long connection code needs several QR codes. Show them one at a time and let the operator advance
them, rather than cycling automatically: a person photographing a projection needs to see each part
stay still.

```
show pairing QR part (1) of [pairing-1] on this sprite
say (join (join (current pairing QR part of [pairing-1]) " / ") (pairing QR part count of [pairing-1]))

when [space v] key pressed
  show next pairing QR part of [pairing-1] on this sprite
```

Practical points:

- Show the part number and the total ("2 / 3") so the operator knows what is left to photograph.
- The sprite keeps its original costume: `end pairing QR display` puts it back, and so do cancelling,
  a timeout, the stop button, and removing the sprite.
- Keep the sprite large and square on the projection, and leave the white margin around the code
  intact — it is part of the symbol.
- Higher error correction survives worse optics but fits fewer characters per code, which means more
  parts to carry. `M` is the default; set `Q` or `H` at startup if reading is unreliable:
  `globalThis.__TWQP_QR_CONFIG__ = {errorCorrectionLevel: 'Q'};`
- To draw the code yourself instead of using a sprite skin, read
  `pairing QR part [INDEX] of [SESSION] as data URI` or `... as SVG`. This path works even without a
  renderer.

## 6. Reading parts

`scan pairing QR for [SESSION] from camera [CAMERA_ID]` holds one camera lease for the whole session
and keeps looking until every part has arrived. Reading the same part repeatedly is normal and
costs nothing. Codes belonging to something else — a poster, another session, the previous attempt —
are skipped silently.

Show progress while it runs:

```
say (join (join (received parts of [pairing-1]) " / ") (required parts of [pairing-1]))
say (join "still needed: " (missing parts of [pairing-1]))
```

`required parts` is 0 until the first part arrives, because the part count travels inside the parts.

If your project obtains QR text some other way, feed it in directly with
`receive pairing QR text [TEXT] for [SESSION]`. That is the primary entry point; camera scanning is
built on top of it.

## 7. Watching progress

`pairing phase of [SESSION]` reports where the exchange is:

| Phase | Meaning |
|---|---|
| `disabled` | The feature flag is off |
| `idle` | No session with that name |
| `creating-offer` | Hub: waiting for WebRTC to produce the offer |
| `offer-ready` | Hub: offer QR parts are ready to project |
| `awaiting-answer` | Hub: some answer parts have arrived |
| `answer-received` | Hub: the answer passed its checks |
| `awaiting-offer` | Camera: waiting for the first offer part |
| `receiving` | Camera: some offer parts have arrived |
| `offer-received` | Camera: the offer passed its checks |
| `creating-answer` | Camera: waiting for WebRTC to produce the answer |
| `answer-ready` | Camera: answer QR parts are ready to show |
| `connecting` | The code reached WebRTC; the connection is not up yet |
| `connected` | WebRTC reports an established connection |
| `cancelled` / `expired` / `failed` | The exchange ended |

**Carrying the code successfully is not the same as connecting.** `answer-received` and
`offer-received` mean the optical transport worked. `connected` means the network path worked. A
code can arrive perfectly and the connection still fail, because reachability depends on the network,
not on the QR codes.

## 8. Two or more camera machines

Pair them one at a time, each with its own session name and its own remote peer name:

```
start offer pairing [pairing-A] as [studio] to [cam-A]
...
start offer pairing [pairing-B] as [studio] to [cam-B]
```

An answer from `cam-B` offered to session `pairing-A` is rejected: each answer carries the session
and the offer it replies to, so the connections cannot be swapped. `pairing sessions` lists the open
session names.

## 9. Timeouts, cancelling, retrying

- `set pairing timeout of [SESSION] to [SECONDS] seconds` — 1 to 3600, default 600. The deadline is
  measured on this machine's own clock, so the two machines do not need synchronized time.
  `remaining seconds of [SESSION]` counts down.
- `cancel pairing [SESSION]` — restores the display, releases the camera and the receive buffer, and
  closes the peer connection **if it never connected**. An established connection stays up.
- `retry pairing [SESSION]` — cancels and starts a fresh exchange. The new exchange has a new id, so
  a QR code photographed from the previous attempt is refused rather than applied.

Pressing the stop button releases displays and cameras and cancels exchanges in progress. It does
not disconnect an established connection.

## 10. When something goes wrong

`pairing error code of [SESSION]` gives a stable code; `pairing error message of [SESSION]` gives a
sentence for the operator. Neither ever contains the connection code itself.

| Code | What happened | What to do |
|---|---|---|
| `feature-disabled` | The startup flag is off | Set `__TWQP_FEATURE_FLAGS__` before loading |
| `webrtc-capability-missing` | `turbowarp-webrtc` is absent or older than v3 | Load it first; it must publish capability v3 |
| `qr-decoder-missing` / `camera-unavailable` | `turbowarp-jsqr` or `turbowarp-camera-source` is absent, or the camera failed | Load them first; check camera permission |
| `renderer-unavailable` | The sprite cannot take a temporary skin | Use a normal sprite, not the stage or a clone; or display the SVG yourself |
| `unsupported-protocol` | The code is not `twqr/1` | An old `twmp-qr/1` code or another product's QR |
| `hash-mismatch` / `length-mismatch` | Parts assembled but the message is damaged | Re-read all parts; raise error correction |
| `conflicting-part` | The same part number arrived with different content | Two different exchanges are being mixed; restart |
| `missing-parts` | Not every part has been read | `missing parts of [SESSION]` says which |
| `peer-mismatch` | The code names different machines | The wrong projection was scanned |
| `reply-mismatch` / `stale-exchange` | The code answers a different offer or a previous attempt | Photograph the current codes again |
| `already-accepted` | This exchange already handed its code to WebRTC | Nothing to do |
| `timeout` | The deadline passed | `retry pairing` |
| `webrtc-rejected` | WebRTC refused the code or the connection failed | A network problem, not a transport problem |
| `session-exists` / `session-limit` / `no-session` | Session name already open, too many open, or not open | Cancel a session, or check the name |

## 11. What this extension does not do

- **It is not authentication.** The hash detects damage. Anyone who can photograph the codes can
  recompute it, and anyone who can see the projection can read the connection information. Manage
  the visibility of the projection as an operational matter.
- **It does not guarantee reachability.** ICE, STUN and TURN belong to `turbowarp-webrtc`.
- **It does not carry video.** Camera data travels over WebRTC after the connection is established.
- **It does not lay out your screen.** Operator instructions, projection layout, and what happens
  after the connection are the application's job.

## 12. Recording a hardware test

Optical conditions cannot be checked in CI. Record each run and do not treat an untested condition
as verified:

```
Date:
Hub machine: <model / OS / browser and version>
Camera machine: <model / OS / browser and version>
Carrier: <smartphone model / OS / camera app>
ICE mode: lan | stun
Network: same LAN / different segments / other
Offer: parts =   / QR version =   / error correction =   / projector (size, distance, ambient light)
Answer: parts =   / QR version =   / error correction =   / screen brightness
Reading: camera machine took   s / hub took   s / re-photographs =
Result: connected = yes|no / connection state =   / test message exchanged = yes|no
Error: code =   / circumstances =
Notes:
```
