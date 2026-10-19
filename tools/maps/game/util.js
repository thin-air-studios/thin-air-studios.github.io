// Small math + randomness helpers shared by the simulation and renderer.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Rotate angle `a` toward `b` by at most `maxStep` radians. */
export function turnToward(a, b, maxStep) {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Deterministic PRNG (mulberry32). Returns a function producing [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.getState = () => a;
  rng.setState = (v) => {
    a = v >>> 0;
  };
  rng.weighted = (entries) => {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let r = rng() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  };
  return rng;
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Older Android WebViews (Chrome < 99) lack CanvasRenderingContext2D.roundRect.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

// The in-play UI scale (uiscale.js), set by main.js on every layout, for drawing code that only gets a ctx.
let HUD = 1;
export const setHudScale = (s) => {
  HUD = s;
};
export const hudScale = () => HUD;

/**
 * Wrapped text's lines from its client rects (a Range's getClientRects, in px): how many, and the widest one's
 * width. Rects within half a line of each other's top are one line (a glyph from a fallback font, like the ▲,
 * can sit a pixel off the words around it).
 */
export function textLines(rects) {
  const rows = [];
  for (const q of rects) {
    const row = rows.find((r) => Math.abs(r.top - q.top) < q.height / 2);
    if (!row) rows.push({ top: q.top, left: q.left, right: q.right });
    else {
      row.left = Math.min(row.left, q.left);
      row.right = Math.max(row.right, q.right);
    }
  }
  return { count: rows.length, widest: Math.max(0, ...rows.map((r) => r.right - r.left)) };
}

/** CSS pixels per world unit under the canvas's current transform. */
export function cssScale(ctx) {
  const m = ctx.getTransform();
  const dpr = ctx.canvas && ctx.canvas.clientWidth ? ctx.canvas.width / ctx.canvas.clientWidth : 1;
  return Math.max(0.05, Math.hypot(m.a, m.b) / dpr);
}

// while the renderer collects them (collectMapLabels), where the map labels went, in CSS px
let mapBoxes = null;
/** From now on map labels note their boxes in CSS px in `list`, for the callsigns to keep clear of; null stops. */
export const collectMapLabels = (list) => {
  mapBoxes = list;
};

/**
 * A map label drawn in world coordinates at a fixed on-screen size (`cssPx` on the reference phone, times
 * the HUD scale like the rest of the in-play chrome), with a dark halo so it reads on grass, concrete and
 * night alike.
 */
export function mapLabel(ctx, text, x, y, cssPx, fill, weight = 700) {
  const k = cssScale(ctx);
  const s = HUD;
  ctx.save();
  ctx.font = `${weight} ${(cssPx * s) / k}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = (3 * s) / k;
  ctx.strokeStyle = 'rgba(15,25,28,0.6)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  if (mapBoxes) {
    const m = ctx.getTransform();
    const dpr = ctx.canvas && ctx.canvas.clientWidth ? ctx.canvas.width / ctx.canvas.clientWidth : 1;
    const w = ctx.measureText(text).width * k, h = cssPx * s;
    const cx = (m.a * x + m.c * y + m.e) / dpr, cy = (m.b * x + m.d * y + m.f) / dpr;
    mapBoxes.push({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  ctx.restore();
  return k;
}
