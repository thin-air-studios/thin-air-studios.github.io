// The canvas density governor (2.2, item 3). A phone that cannot keep up at its own screen density steps the game canvas
// down one notch at a time, and remembers the notch for its later games on the same screen. This module is pure (no DOM):
// main.js feeds it each real frame interval during play and acts on the answer. It changes only the canvas's pixel count
// (render.js setDensity), never the simulation, so a replay is the same at any density.

/** The notches the canvas steps down through, below the device's own ratio (render.js canvasDpr): 2, then 1.5, then 1. */
export const DENSITY_NOTCHES = [2, 1.5, 1];
/** A frame longer than this is slower than about 50 frames a second: the step-down threshold, in ms. */
export const SLOW_FRAME_MS = 20;
/** The rolling average must stay above SLOW_FRAME_MS for this long, in seconds, before the canvas steps down. */
export const SLOW_FOR_S = 2;
/** A gap longer than this is a pause in the game (a tab switch, a dialog, a stalled tab), not a slow frame: it is not counted. */
export const STALL_MS = 250;
/** A frame counts as at most this long, so one hitch cannot carry the average on its own. */
export const CAP_MS = 100;
/** The rolling average's time constant, in seconds: about half a second of frames. */
export const TAU_S = 0.5;

/** The next notch lower than ratio, or null when ratio is already the lowest. */
export function nextDensity(ratio) {
  const lower = DENSITY_NOTCHES.filter((n) => n < ratio - 1e-9);
  return lower.length ? lower[0] : null;
}

/** The screen's key for the saved density: the CSS size. A different size (a rotation, a fold) starts again. */
export function densityKey(cssW, cssH) {
  return `${Math.round(cssW)}x${Math.round(cssH)}`;
}

/**
 * The ratio the canvas starts at: the saved notch when it is for this screen and lower than the device's own ratio, else
 * the device's own ratio. saved is the save's density record ({ key, dpr }) or anything else a damaged save holds.
 */
export function startDensity(saved, key, deviceRatio) {
  const ok = saved && typeof saved === 'object' && saved.key === key && DENSITY_NOTCHES.includes(saved.dpr);
  return ok && saved.dpr < deviceRatio - 1e-9 ? saved.dpr : deviceRatio;
}

/**
 * The governor. sample(ms) takes one real frame interval (from requestAnimationFrame) during play and answers true on the
 * frame where the canvas should step down: the rolling average has been above SLOW_FRAME_MS for SLOW_FOR_S seconds. It
 * answers true once and starts again from nothing. It never steps up.
 */
export class DensityGovernor {
  constructor() {
    this.reset();
  }

  /** Starts the measure again: a new game, a pause, or a new screen size. */
  reset() {
    this.avg = 0;
    this.have = false;
    this.over = 0;
  }

  sample(ms) {
    if (!(ms >= 0) || ms > STALL_MS) return false; // not a frame: a stall, or a clock that went back
    const dt = Math.min(ms, CAP_MS);
    if (!this.have) {
      this.avg = dt;
      this.have = true;
    } else {
      this.avg += (dt - this.avg) * (1 - Math.exp(-(dt / 1000) / TAU_S));
    }
    this.over = this.avg > SLOW_FRAME_MS ? this.over + dt / 1000 : 0;
    if (this.over >= SLOW_FOR_S) {
      this.reset();
      return true;
    }
    return false;
  }
}
