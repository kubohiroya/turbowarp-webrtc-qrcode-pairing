/** Session-level limits. QR transport limits live in `src/qr/limits.ts`. */

/** Concurrent sessions, which bounds the retained receive state. */
export const MAX_ACTIVE_SESSIONS = 8;

/** Deadlines in seconds. The default allows for an operator carrying QR images on foot. */
export const DEFAULT_TIMEOUT_SECONDS = 600;
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 3600;

/** How often a session checks its deadline and the WebRTC connection state. */
export const TICK_INTERVAL_MS = 250;
