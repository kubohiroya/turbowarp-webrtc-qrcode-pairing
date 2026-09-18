# Integration guide

[日本語](integration-guide.ja.md)

How to pair two machines with this extension from a TurboWarp project. For the block-by-block
reference, see [Block reference](../README.md#block-reference).

## 1. Before you start

Load these extensions **before** this one, and run all of them unsandboxed:

| Extension | Why |
|---|---|
| `turbowarp-webrtc` | Creates and accepts the offer and the answer, and owns the connection |
| `turbowarp-jsqr` 0.4.0 or later | Decodes QR codes from camera frames, including their Structured Append positions |
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
  broadcast [read answer v]
  repeat until <not <(pairing phase of [pairing-1]) = [offer-ready]>>
    show next pairing QR part of [pairing-1] on this sprite
    wait (0.8) seconds
  end
  end pairing QR display of [pairing-1]

when I receive [read answer v]
  scan pairing QR for [pairing-1] from camera [default]
  wait until pairing [pairing-1] is connected
```

The timeout is set after the session exists: every block but the two `start`
blocks needs an open session and reports `no-session` otherwise. The deadline is
measured from the moment the session started, so setting it right afterwards
loses nothing.

`start offer pairing` returns once the offer exists and its QR codes are prepared; the phase becomes
`offer-ready`. Creating the offer waits for ICE gathering to finish, so it can take a moment.

The loop then cycles the offer codes on the projection, one per turn of the loop, and the camera
machine reads them in whatever order it catches them. Meanwhile the hub's own camera waits for the
answer the operator brings back. The first answer code it reads moves the phase to
`awaiting-answer`, which ends the loop and takes the offer off the projection.

`scan pairing QR` returns when every code of the answer has arrived and passed its checks. At that
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

## 5. Showing the codes

A connection code is carried as one Structured Append sequence of a few QR codes. The two
directions show it differently:

- **The offer is cycled.** The camera machine keeps scanning, so the hub steps through the codes by
  itself, as in the hub script above. About 0.5 to 1 second per code gives a camera several frames
  of each; a missed code simply comes round again.
- **The answer waits for the operator.** A person photographing the camera machine's screen needs
  each code to stay still, so advance on a key or a click:

```
show pairing QR part (1) of [pairing-1] on this sprite
say (join (join (current pairing QR part of [pairing-1]) " / ") (pairing QR part count of [pairing-1]))

when [space v] key pressed
  show next pairing QR part of [pairing-1] on this sprite
```

Practical points:

- Show the code number and the total ("2 / 3") so the operator knows what is left to photograph.
- The sprite keeps its original costume: `end pairing QR display` puts it back, and so do cancelling,
  a timeout, the stop button, and removing the sprite.
- Keep the sprite large and square on the projection, and leave the white margin around the code
  intact — it is part of the symbol.
- A camera reads a projected code far more reliably when its modules are coarse: a single version
  29-32 offer had to fill most of a 720p frame and failed when seen from an angle. Offer codes are
  at most QR version 15 by default, about four codes that read under every measured condition;
  answer codes are at most version 20, about two codes. Change the caps at startup with
  `globalThis.__TWQP_QR_CONFIG__ = {offerMaxVersion: 15, answerMaxVersion: 20};` (1 to 40 each).
- Higher error correction survives worse optics but fits fewer characters per code, which means more
  codes. `M` is the default; set `errorCorrectionLevel: 'Q'` or `'H'` in the same object if reading is
  unreliable. A message may take at most 16 codes, the Structured Append limit; beyond that,
  `start offer pairing` fails with `too-many-parts`.
- To draw the code yourself instead of using a sprite skin, read
  `pairing QR part [INDEX] of [SESSION] as data URI` or `... as SVG`. This path works even without a
  renderer.

## 6. Reading the codes

`scan pairing QR for [SESSION] from camera [CAMERA_ID]` holds one camera lease for the whole session
and keeps looking until every code of the sequence has arrived. Codes are taken in any order.
Reading the same code repeatedly is normal and costs nothing. A code of another sequence is reported
and ignored without ending the exchange. QR codes that are not pairing codes at all, such as a
poster, are skipped without a word.

The first code read decides which sequence the session collects. The header comes first in the
message, so once the leading codes are read the session knows whose message it is — the first code
alone at the default settings, the first few when codes are small or the error correction is high:

- if it belongs to another exchange, another pair of peers or the other direction, the sequence is
  dropped and reported as `foreign` with the reason;
- while the header of the sequence being collected has not been read yet, codes of another sequence
  are collected on the side, and a sequence whose header shows it belongs to this exchange takes its
  place. A stray code of an old projection therefore cannot block the right one;
- when every code has arrived, the message is checked against its hash. A damaged sequence is
  dropped, reported as `foreign` with `hash-mismatch`, and collected again from the codes still being
  cycled.

Every pairing code read is reported, so the application can tell the operator what just happened:

| `last pairing QR read of [SESSION]` | Meaning                                  | `last pairing QR read detail of [SESSION]`         |
| ----------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `accepted`                          | a code that had not arrived yet          | the code, `2 / 4`                                   |
| `duplicate`                         | a code already read; nothing changes     | the code, `2 / 4`                                   |
| `foreign`                           | a code this exchange ignores             | why: `message-mismatch` (another sequence), `stale-exchange`, `peer-mismatch`, `reply-mismatch`, `unexpected-kind`, `hash-mismatch`, `conflicting-part` |

`pairing QR reads of [SESSION]` rises by one per read, so a script notices a new result by comparing
it with the value it saw last. A camera reads the code in front of it many times a second: show the
result as a status line that is replaced, not as a message per read.

Show progress while it runs:

```
say (join (join (received parts of [pairing-1]) " / ") (required parts of [pairing-1]))
say (join "still needed: " (missing parts of [pairing-1]))
```

`required parts` is 0 until the first code arrives, because the count travels inside the codes.

If your project obtains the whole message some other way — pasted, or read from one QR code — feed it
in with `receive pairing message [TEXT] for [SESSION]`.

## 7. Watching progress

`pairing phase of [SESSION]` reports where the exchange is:

| Phase | Meaning |
|---|---|
| `disabled` | The feature flag is off |
| `idle` | No session with that name |
| `creating-offer` | Hub: waiting for WebRTC to produce the offer |
| `offer-ready` | Hub: offer QR parts are ready to project |
| `awaiting-answer` | Hub: some answer codes have arrived |
| `answer-received` | Hub: the answer passed its checks |
| `awaiting-offer` | Camera: waiting for the first offer code |
| `receiving` | Camera: some offer codes have arrived |
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
| `qr-decoder-missing` / `camera-unavailable` | `turbowarp-jsqr` 0.4.0 or later or `turbowarp-camera-source` is absent, or the camera failed | Load them first; check camera permission |
| `renderer-unavailable` | The sprite cannot take a temporary skin | Use a normal sprite, not the stage or a clone; or display the SVG yourself |
| `unsupported-protocol` | The message is not `twqr/2` | A `twqr/1` or `twmp-qr/1` code from an older version, or another product's QR |
| `hash-mismatch` / `length-mismatch` | The codes joined, but the message is damaged | Scanning drops the sequence and reads it again; raise error correction if it keeps happening |
| `conflicting-part` | The same code number arrived with different content | Scanning drops the sequence and reads it again |
| `too-many-parts` | The message needs more than 16 codes at the version cap | Raise the version cap or lower error correction |
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
Offer: codes =   / QR version =   / error correction =   / projector (size, distance, ambient light)
Answer: codes =   / QR version =   / error correction =   / screen brightness
Reading: camera machine took   s / hub took   s / re-photographs =
Result: connected = yes|no / connection state =   / test message exchanged = yes|no
Error: code =   / circumstances =
Notes:
```
