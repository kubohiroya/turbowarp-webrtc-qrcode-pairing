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
 * The effective ceiling is lower than this value for most error correction
 * levels, because MAX_PART_COUNT parts of (QR version 40 capacity - envelope
 * header) characters run out first:
 *
 *   L: 2953 - 362 = 2591 chars/part -> 165,824 for 64 parts (this value binds)
 *   M: 2331 - 362 = 1969 chars/part -> 126,016 for 64 parts (part count binds)
 *   Q: 1663 - 362 = 1301 chars/part ->  83,264 for 64 parts (part count binds)
 *   H: 1273 - 362 =  911 chars/part ->  58,304 for 64 parts (part count binds)
 *
 * Exceeding either ceiling fails while splitting, with `message-too-large` or
 * `too-many-parts`.
 */
export const MAX_MESSAGE_LENGTH = 128 * 1024;

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
