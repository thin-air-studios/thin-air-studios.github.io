// Trusted time for the Short Final Pro day (2.8; DECISIONS 331). The phone's clock can be moved forward to start a new day's three
// free games. The game reads the time from the HTTP Date header of the replies it already gets (net.js: the Worker, the live feed,
// the weather), and keeps it with the phone's elapsed real time (SystemClock.elapsedRealtime: it counts through sleep and resets
// at a reboot). The Pro day is never later than trusted time plus the real time that has passed since the reading.
//
// An anchor is { t, e, b }: t is the trusted time in ms (the Date header, whole seconds, so never later than the true time), e the
// phone's elapsed ms when the reply came, and b the boot id ('' when the shell cannot say). Pure: the clock is passed in (clock.js
// reads it from the shell). Every trusted time here is a lower bound on the true time, so the Pro day can lag the phone's clock
// after a reboot, and never runs ahead of it.

/** The time in ms of an HTTP Date header, or null when there is none or it is not a date. */
export function dateMs(header) {
  if (typeof header !== 'string' || !header) return null;
  const t = Date.parse(header);
  return Number.isFinite(t) && t > 0 ? t : null;
}

const validAnchor = (a) => !!a && typeof a === 'object' && Number.isFinite(a.t) && Number.isFinite(a.e) && typeof a.b === 'string';

/**
 * Whether the phone rebooted since the anchor: the boot id changed, or the elapsed time went back (the id is unknown). A reboot
 * resets the elapsed time, so the time since the anchor is not known; the elapsed time since the reboot is the least it can be.
 */
export function rebootedSince(anchor, now) {
  if (anchor.b && now.b && anchor.b !== now.b) return true;
  return now.e < anchor.e;
}

/**
 * Trusted time now, in ms: a lower bound on the true time. null without an anchor. now: { e, b } (the phone's elapsed ms and boot id).
 */
export function trustedNow(anchor, now) {
  if (!validAnchor(anchor) || !now || !Number.isFinite(now.e)) return null;
  return rebootedSince(anchor, now) ? anchor.t + now.e : anchor.t + (now.e - anchor.e);
}

/**
 * The anchor to keep after a Date header of time t is read at now. A reading replaces the anchor only when it is later than what
 * the anchor implies now, so an old answer (a cached reply, a stale Date) never lowers the trusted time.
 */
export function nextAnchor(anchor, t, now) {
  const implied = validAnchor(anchor) ? trustedNow(anchor, now) : null;
  if (implied !== null && t <= implied) return anchor;
  return { t, e: now.e, b: now.b || '' };
}

/**
 * The Pro day's clock in ms: the phone's time, but never later than trusted time. With no anchor (offline before any reply, the
 * first launch) it is the phone's time, as before 2.8. Backwards is not capped: a clock set back keeps the day it reached (pro.js).
 */
export function capNow(localMs, anchor, now) {
  const trusted = trustedNow(anchor, now);
  return trusted === null ? localMs : Math.min(localMs, trusted);
}
