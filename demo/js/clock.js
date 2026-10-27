import { WEB_DEMO } from './flavor.js?v=7227d0de';
// The Pro day's clock (2.8; DECISIONS 331): the trusted time from the replies' Date headers, kept with the phone's elapsed real time
// (trusttime.js). net.js calls noteDate for every reply that carries a Date header. The anchor is kept in localStorage, so a restart
// of the app keeps it (a per-phone convenience: without it the clock starts from the phone's time again, which is the offline rule).
// makeClock takes its readers, so the tests drive the time; the page uses the default clock below.
import { capNow, dateMs, nextAnchor } from './trusttime.js?v=7227d0de';

export const CLOCK_KEY = 'holdingpattern.clock.v1';

/** Reads the anchor a previous launch kept (null when there is none, or it cannot be read). */
function loadAnchor(store) {
  try {
    const raw = store && store.getItem(CLOCK_KEY);
    const a = raw ? JSON.parse(raw) : null;
    return a && Number.isFinite(a.t) && Number.isFinite(a.e) && typeof a.b === 'string' ? a : null;
  } catch (_) {
    return null;
  }
}

/**
 * A clock. elapsed(): the phone's elapsed real ms (the shell's SystemClock.elapsedRealtime, or performance.now() in a browser).
 * bootId(): the boot's id ('' when unknown). store: localStorage-like ({ getItem, setItem }) or null. localMs(): the phone's time in ms.
 */
export function makeClock({ elapsed = () => 0, bootId = () => '', store = null, localMs = () => Date.now() } = {}) {
  let anchor = loadAnchor(store);
  const now = () => ({ e: elapsed(), b: bootId() });
  return {
    /** The anchor now, for the tests and the page's diagnostics (a copy). */
    anchor: () => (anchor ? { ...anchor } : null),
    /** A reply's Date header: the anchor moves on when the reading is later than it implies. Returns whether it moved. */
    noteDate(header) {
      const t = dateMs(header);
      if (t === null) return false;
      const next = nextAnchor(anchor, t, now());
      if (next === anchor) return false;
      anchor = next;
      try {
        if (store) store.setItem(CLOCK_KEY, JSON.stringify(anchor));
      } catch (_) { /* a full or blocked store: the anchor lives on for this launch */ }
      return true;
    },
    /** The Pro day's time: the phone's time, never later than trusted time. */
    proDate() {
      return new Date(capNow(localMs(), anchor, now()));
    },
  };
}

/** The page's clock: the shell's elapsed time and boot id when there is a shell, else the page's own monotonic clock. */
function defaultClock() {
  if (typeof window === 'undefined') return makeClock({ store: null });
  const shell = window.HPAndroid;
  const elapsed = () => {
    try {
      if (shell && typeof shell.elapsedRealtime === 'function') {
        const v = Number(shell.elapsedRealtime());
        if (Number.isFinite(v)) return v;
      }
    } catch (_) { /* the page's clock below */ }
    return typeof performance !== 'undefined' ? performance.now() : 0;
  };
  const bootId = () => {
    try {
      return shell && typeof shell.bootId === 'function' ? String(shell.bootId() || '') : '';
    } catch (_) {
      return '';
    }
  };
  let store = null;
  try {
    store = WEB_DEMO ? null : window.localStorage; // the demo keeps no clock anchor (DECISIONS 446)
  } catch (_) {
    store = null;
  }
  return makeClock({ elapsed, bootId, store });
}

const clock = defaultClock();

/** A reply's Date header (net.js). */
export const noteDate = (header) => clock.noteDate(header);
/** The Pro day's time (a Date): the phone's clock, never past trusted time. Use it wherever the Pro rules read today. */
export const proDate = () => clock.proDate();
