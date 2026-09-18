/**
 * Transport limits with their units and boundary conditions.
 *
 * Every length here counts characters. Payloads are restricted to printable
 * ASCII, so one character is one UTF-16 code unit and one byte; character
 * counts and byte counts agree.
 */

/**
 * Largest carried message. Boundary: 1 <= messageLength <= MAX_MESSAGE_LENGTH;
 * zero is rejected.
 *
 * The effective ceiling is lower than this value, because MAX_PART_COUNT parts
 * of (QR capacity at the version cap - envelope header) characters run out
 * first. At the version 40 ceiling:
 *
 *   L: 2953 - 362 = 2591 chars/part -> 165,824 for 64 parts (this value binds)
 *   M: 2331 - 362 = 1969 chars/part -> 126,016 for 64 parts (part count binds)
 *   Q: 1663 - 362 = 1301 chars/part ->  83,264 for 64 parts (part count binds)
 *   H: 1273 - 362 =  911 chars/part ->  58,304 for 64 parts (part count binds)
 *
 * At the default cap, version 20, level M carries 666 - 362 = 304 chars/part,
 * 19,456 for 64 parts: still more than ten times a pairing code.
 *
 * Exceeding either ceiling fails while splitting, with `message-too-large` or
 * `too-many-parts`.
 */
export const MAX_MESSAGE_LENGTH = 128 * 1024;

/**
 * Largest QR version a part may use unless the integrator says otherwise.
 * Boundary: 1 <= maxVersion <= 40.
 *
 * A part used to fill a version 40 symbol, which made a pairing offer a single
 * version 31-32 code: 145 modules, too fine for a camera to read off a
 * projection unless it filled most of the frame, and not at all from an angle.
 * Capping the version splits the same offer into about four version 20 codes,
 * which read under roughly twice as many optical conditions, at the price of
 * more parts to show. The measurement is in turbowarp-realtime-motion-capture-app
 * `docs/qr-pairing.md`.
 */
export const DEFAULT_MAX_QR_VERSION = 20;

/** Boundary: 1 <= partCount <= MAX_PART_COUNT and 0 <= partIndex < partCount. */
export const MAX_PART_COUNT = 64;

/**
 * Payload characters per part. Always larger than the capacity a QR symbol can
 * actually carry, so this is a guard against hostile input rather than the
 * value that drives splitting.
 */
export const MAX_CHUNK_LENGTH = 4096;

/** Largest accepted QR text. Covers the envelope header plus its payload. */
export const MAX_PART_TEXT_LENGTH = 8192;

/** Longest accepted session, peer, and message identifier. */
export const MAX_IDENTIFIER_LENGTH = 128;

/** Base64url SHA-256 digests without padding are always this long. */
export const MESSAGE_HASH_LENGTH = 43;
