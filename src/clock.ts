/**
 * Monotonic time source.
 *
 * Deadlines are measured as elapsed time on the device that owns the session.
 * The two devices in a pairing are not time-synchronized, so nothing may depend
 * on their wall clocks agreeing, and a wall clock that is corrected mid-session
 * must not move a deadline.
 */
export interface MonotonicClock {
  nowMilliseconds(): number;
}

export const systemMonotonicClock: MonotonicClock = {
  nowMilliseconds: () =>
    typeof performance === 'object' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
};
