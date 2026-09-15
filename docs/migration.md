# Migration and rollback

[日本語](migration.ja.md)

## 1. Coming from turbowarp-realtime-motion-capture

`turbowarp-realtime-motion-capture` carries an offer as QR codes with the `twmp-qr/1` format, behind
its own `qrCourierPairing` flag. Its blocks are `prepare offer QR`, `show offer QR part`,
`show next offer QR part`, `end offer QR display`, `offer QR state` and `offer QR error`.

That path only covers the offer. The camera machine has to accept the offer and return an answer by
some other means, which is what this extension adds.

### Format

`twqr/1` is **not compatible** with `twmp-qr/1` and does not read it. `twmp-qr/1` carries one peer
name and no reply-to, so it cannot express:

- which name the sender uses for itself versus for the receiver, and
- which offer an answer is replying to.

Both are required here: the first so the two machines never need matching identifiers, the second so
an answer cannot be applied to the wrong exchange. Adding required fields is not a backward
compatible change, so the format got a new namespace and version.

A `twmp-qr/1` code presented to this extension is refused with `unsupported-protocol`. There is no
read-compatibility mode: accepting a code that cannot express the peer mapping would mean guessing
it, and a wrong guess pairs the wrong machines. An explicit refusal is safer than an ambiguous
acceptance.

The two can be used in the same venue. They will not read each other's codes, but the failure is
reported rather than silent.

### Block mapping

| motion-capture | here |
|---|---|
| `prepare offer QR for peer [PEER]` | `start offer pairing [SESSION] as [LOCAL_PEER] to [REMOTE_PEER]` |
| `show offer QR part [INDEX] on this sprite` | `show pairing QR part [INDEX] of [SESSION] on this sprite` |
| `show next offer QR part on this sprite` | `show next pairing QR part of [SESSION] on this sprite` |
| `offer QR part count` | `pairing QR part count of [SESSION]` |
| `current offer QR part` | `current pairing QR part of [SESSION]` |
| `end offer QR display` | `end pairing QR display of [SESSION]` |
| `offer QR state` | `pairing phase of [SESSION]` (more states; see the integration guide) |
| `offer QR error` | `pairing error code of [SESSION]` and `pairing error message of [SESSION]` |
| — | everything on the answer side, scanning, cancel, retry, timeout |

Differences to expect when porting a project:

- Every block takes a session name, so one project can pair several machines.
- The peer argument splits into a local name and a remote name.
- `offer QR state` returned `idle`, `generating-offer`, `rendering`, `displayed` or `error`.
  `pairing phase` has a state per step of the round trip, and reports QR completion and connection
  separately.
- The startup flag is `__TWQP_FEATURE_FLAGS__.qrCodePairing`, not
  `__TWMP_FEATURE_FLAGS__.qrCourierPairing`. The error correction setting moves from
  `__TWMP_QR_CONFIG__` to `__TWQP_QR_CONFIG__`.

### What is not part of this migration

This extension does not remove or change anything in `turbowarp-realtime-motion-capture`. Its QR
path and its manual pairing path stay as they are. Retiring the old path there, and adjusting
responsibilities in `turbowarp-time-space-sync`, are separate issues in those repositories.

## 2. Rolling back to manual pairing

The pairing blocks are a route, not a requirement. To stop using them:

1. Stop setting `globalThis.__TWQP_FEATURE_FLAGS__ = {qrCodePairing: true};`.
2. Pair with the `turbowarp-webrtc` blocks directly:
   - hub: `create offer code for peer [PEER]`, then `offer code for peer [PEER]`;
   - camera machine: `accept offer code [CODE] as peer [PEER]`, then `answer code for peer [PEER]`;
   - hub: `accept answer code [CODE] for peer [PEER]`.
   Move the codes by whatever means the venue allows.
3. Leave the extension loaded if you like. With the flag off it publishes no blocks and does
   nothing.

Turning the flag off selects the other route. It never disconnects an established connection, and it
does not close peer connections that already exist.

Because the flag is read once at startup, changing it takes effect on the next load, not while a
project is running. That is deliberate: a route that could change mid-session would make failures
hard to interpret.

## 3. Regression checks after a change

Run `pnpm run check` — type checking, lint, the test suite, README generation, build reproducibility,
the repository policy check, and an npm pack dry run.

Beyond that, a change to the transport or the state machine should be re-verified by hand, because
optical conditions are not testable in CI:

- [ ] A single-part exchange and a multi-part exchange both complete.
- [ ] Parts read out of order, and the same part read repeatedly, still assemble.
- [ ] A missing part is reported by `missing parts of [SESSION]` and never assembles.
- [ ] A damaged part fails with `hash-mismatch` and nothing reaches WebRTC.
- [ ] Two camera machines pair one after another without their answers crossing.
- [ ] Cancel, timeout and retry each release the display and the camera, and a code photographed
      before a retry is refused.
- [ ] The sprite returns to its original costume after ending the display, stopping the project, and
      removing the sprite.
- [ ] Another holder of the same camera keeps it running after the session ends.
- [ ] With the flag off, no pairing blocks appear and manual pairing still works.

Record hardware runs with the template in the [integration guide](integration-guide.md#12-recording-a-hardware-test).

## 4. Changing the transport format later

If a future change needs a different envelope:

- Receivers match `protocol` exactly and refuse anything else, so an unknown version is always
  rejected rather than half-read.
- Adding a required field is a version change, not an extension.
- Document the old format's treatment and the migration path here, as this page does for
  `twmp-qr/1`.
