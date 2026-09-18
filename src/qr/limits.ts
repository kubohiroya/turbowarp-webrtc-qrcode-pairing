/**
 * Transport limits. Every value is a boundary checked when a message is made or
 * read, so a damaged or hostile code fails with a named error instead of
 * exhausting memory.
 */

/**
 * Most QR codes one message may take. It is the Structured Append limit: the
 * symbol header has four bits for the position and four for the count.
 */
export const MAX_PART_COUNT = 16;

/**
 * Largest carried pairing code. Boundary: 1 <= length <= MAX_MESSAGE_LENGTH.
 *
 * The version cap binds long before this: sixteen codes of version 15 at level
 * M carry about 6,500 bytes, and of version 20 about 10,600, against a pairing
 * code of about 1,250 characters. A longer code fails while splitting with
 * `too-many-parts`.
 */
export const MAX_MESSAGE_LENGTH = 32 * 1024;

/** Room for the header line in front of the pairing code. */
export const MAX_HEADER_LENGTH = 2048;

export const MAX_IDENTIFIER_LENGTH = 128;

/** SHA-256 as unpadded base64url. */
export const MESSAGE_HASH_LENGTH = 43;

/**
 * Largest QR version an offer uses unless the integrator says otherwise.
 * Boundary: 1 <= version <= 40.
 *
 * The hub shows the offer codes one after another in a loop and the camera
 * reads them as they come, so small, coarse codes cost nothing but a few more
 * frames: at version 15 a pairing offer is about four codes, which a camera
 * read under every condition measured in turbowarp-realtime-motion-capture-app
 * `docs/qr-pairing.md`.
 */
export const DEFAULT_OFFER_MAX_VERSION = 15;

/**
 * Largest QR version an answer uses unless the integrator says otherwise.
 *
 * The answer is shown on the camera device and turned by hand, so fewer codes
 * matter more there: at version 20 an answer is about two codes.
 */
export const DEFAULT_ANSWER_MAX_VERSION = 20;
