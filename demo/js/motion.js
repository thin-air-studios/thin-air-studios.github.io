// Motion helpers: pure maths (tested in node), the reduced-motion check and the flash cap. The drawing that uses them is
// in render.js and fx.js; nothing here touches the sim.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// the query is made once per window (it stays live: .matches follows the system setting), as the frame asks often
let query = null, queryWindow = null;

/** The system's "reduce motion" setting (Android's remove-animations maps to this query, verified on device: O17). */
export function reducedMotion() {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    if (queryWindow !== window) {
      query = window.matchMedia('(prefers-reduced-motion: reduce)');
      queryWindow = window;
    }
    return !!query.matches;
  } catch (_) {
    return false;
  }
}

/** A spring that goes 0 to 1 and overshoots to 1.08 near t = 0.6, then settles (easeOutBack, tuned to 8%). */
export function springOut(t) {
  const x = clamp01(t) - 1;
  return 1 + 2.5 * x * x * x + 1.5 * x * x;
}

/** Ease-out from `from` to `to` over t in 0..1, as whole numbers. Never passes `to`, so a count-up cannot overshoot. */
export function countUp(from, to, t) {
  const e = 1 - Math.pow(1 - clamp01(t), 3);
  return Math.round(from + (to - from) * e);
}

/** A 0..1 sine at `hz` cycles per second (1 at the top of each cycle). */
export function pulse(timeS, hz) {
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * hz * timeS);
}

/** Smooth step: 0 at 0, 1 at 1, with no kink at either end. */
export function smooth(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * A flash is allowed only when fewer than three have happened in the last second (photosensitivity). `log` holds the
 * times of the flashes allowed so far, and is trimmed here. Returns true when this one may flash.
 */
export function flashGate(nowMs, log) {
  while (log.length && nowMs - log[0] >= 1000) log.shift();
  if (log.length >= 3) return false;
  log.push(nowMs);
  return true;
}

/**
 * The speed lines at the screen's two edges: ten streaks per edge, drawn for the half second after the fast-forward
 * switch goes on. `k` runs 0 to 1 over that half second; the streaks run inward from the edge and fade. Deterministic
 * (a fixed pattern, no random numbers), so a frame is the same every time it is drawn.
 */
export function speedStreaks(cssW, cssH, k, u = 1) {
  const out = [];
  const life = clamp01(k);
  if (life >= 1) return out;
  const alpha = 0.55 * (1 - life);
  for (let edge = 0; edge < 2; edge++) {
    for (let i = 0; i < 10; i++) {
      // a fixed spread of heights and lengths: a hash of the index, not a random draw
      const h = Math.sin((i + 1) * 12.9898 + edge * 78.233) * 43758.5453;
      const f = h - Math.floor(h);
      const y = (0.06 + 0.88 * ((i + 0.5) / 10 + (f - 0.5) * 0.05)) * cssH;
      const len = (34 + 46 * f) * u * (1 - 0.4 * life);
      const inset = (4 + 10 * f) * u + life * 10 * u;
      const x0 = edge === 0 ? inset : cssW - inset;
      const x1 = edge === 0 ? inset + len : cssW - inset - len;
      out.push({ x0, y0: y, x1, y1: y, alpha });
    }
  }
  return out;
}

/**
 * Approach a value at a steady rate: `value` moves toward `target` by at most dt / time, so a change takes `time` seconds
 * from full to full. Used for the fast-forward's sweep speed (slows to a stop in about half a second).
 */
export function approach(value, target, dt, time) {
  const step = Math.max(0, dt) / time;
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

// the DOM buttons that ripple on a press (style.css, the U4 block), and how long the ripple runs (400 ms and a little over)
export const RIPPLE_SEL = '.btn, .pill, .icon-btn, .corner-btn';
const RIPPLE_MS = 420;

/**
 * A press on a button starts its orange ripple. `:active` alone would stop it on release, so a quick tap showed a sliver of it;
 * the press also sets `rip` on the button for the ripple's time, and the CSS runs the ripple while the class is there. The
 * class is set on the button itself (a corner button's disc is styled through its `.corner-btn` parent).
 */
export function bindRipples(root) {
  if (!root || !root.addEventListener) return;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
    if (!el) return;
    el.classList.remove('rip');
    void el.offsetWidth; // restart the ripple when the same button is pressed again within its time
    el.classList.add('rip');
    clearTimeout(el.ripTimer);
    el.ripTimer = setTimeout(() => el.classList.remove('rip'), RIPPLE_MS);
  }, { passive: true });
}
