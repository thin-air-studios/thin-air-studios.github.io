// Runway closures on the map: the marks a closing or closed runway shows, the pill that names it, and the words that name both
// ends. Drawing only: nothing here is read by the sim, ops or weather. A closing runway gets an amber strip that breathes, amber
// X marks at both ends and in the middle, and a "17C / 35C closing 0:07" pill. A closed one gets a red hatched strip, big yellow
// X marks (lit in red at night) and a "17C / 35C closed" pill with a thin pointer up to the banner. When it reopens its X fades
// out over REOPEN_S. The marks are drawn after the night tint, so they never dim; the pills go over the map and under the HUD.
// A wind shift that turns a runway round ('turning') gets the amber strip alone: no X and no pill, since every runway the wind
// turns would otherwise carry one at once; the banner already says the wind is shifting.
import { FONT } from './fx.js?v=7227d0de';
import { TAU, clamp } from './util.js?v=7227d0de';

const REOPEN_S = 1.4; // the X fades out over this long on reopening
const AMBER = '#ffb02e';
const YELLOW = '#ffd23f';
const RED = '#ff6b5a';
const GREEN = '#9be58a';
const PILL_H = 21; // CSS px at the HUD's scale
const RINGS = 6, SPOKES = 16; // where a pill may go: rings round its threshold, spokes round each ring

/** "17C / 35C": both ends of a runway, the lower number first, as the charts name it (the data's end order varies). */
export function runwayPair(z) {
  const [a, b] = [z.ends[0].ident, z.ends[1].ident].sort((p, q) => parseInt(p, 10) - parseInt(q, 10));
  return `${a} / ${b}`;
}

/**
 * The banner's words with the runway they name given both ends: "Runway 17C closed" reads "Runway 17C / 35C closed". The sim
 * (ops.js) and the weather (weather.js) name only the active end, and their text is left as it is; main.js passes it through here.
 */
export function bothEnds(text, sim) {
  const m = text && sim ? /Runway (\w+)/.exec(text) : null;
  const z = m && sim.zones.find((o) => o.kind === 'runway' && o.activeIdent === m[1]);
  return z ? text.replace(m[0], `Runway ${runwayPair(z)}`) : text;
}

/** A pill's words: both ends, and what the runway is doing, with its countdown while there is one. */
export function pillText(m) {
  const pair = runwayPair(m.z);
  if (m.kind === 'closed') return `${pair} closed`;
  if (m.kind === 'open') return `${pair} open`;
  return m.secs > 0 ? `${pair} closing 0:${String(m.secs).padStart(2, '0')}` : `${pair} closing`;
}

const pillFont = (u) => `700 ${Math.max(12, 12.5 * u)}px ${FONT}`;
const edgeOf = (kind) => (kind === 'closed' ? RED : kind === 'open' ? GREEN : AMBER);
const hit = (a, b, gap) => a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;

/** The marks frame to frame, and where each closing or closed runway's pill sits. */
export class ClosureMarks {
  constructor(sim) {
    this.sim = sim;
    this.closedAt = new Map(); // zone id -> the clock time it was last seen closed (for the fade on reopening)
    this.spots = new Map(); // zone id -> the pill's place relative to its threshold, last frame (it holds still)
    this.list = []; // this frame's marks: { z, kind: 'closing' | 'turning' | 'closed' | 'open', a (opacity), secs (countdown, 0 for none) }
    this.pills = []; // this frame's pills, as layoutPills placed them (for the tests)
  }

  /** This frame's marks, from the sim's own flags. weather: a wind shift's countdown, when one closes the runway (weather.js). */
  update(sim, t, weather = null) {
    if (sim !== this.sim) {
      this.sim = sim;
      this.closedAt = new Map();
      this.spots = new Map();
    }
    const list = [];
    for (const z of sim.zones) {
      if (z.kind !== 'runway') continue;
      if (z.closed) {
        this.closedAt.set(z.id, t);
        list.push({ z, kind: 'closed', a: 1, secs: 0 });
      } else if (z.closing) {
        // an inspection's warning, or a wind shift's countdown: both count down to the closure
        const c = sim.ops && sim.ops.warning(z) ? sim.ops.cur : null;
        const shift = !c && weather && weather.shift && weather.shift.ids.includes(z.id) ? weather.shift : null;
        const left = c ? c.t : shift ? shift.t : 0;
        list.push({ z, kind: shift ? 'turning' : 'closing', a: 1, secs: Math.max(0, Math.ceil(left)) });
      } else if (this.closedAt.has(z.id)) {
        const k = (t - this.closedAt.get(z.id)) / REOPEN_S;
        if (k < 1) list.push({ z, kind: 'open', a: 1 - k, secs: 0 });
        else this.closedAt.delete(z.id);
      }
    }
    this.list = list;
    return list;
  }

  /**
   * Places each pill beside its runway's active threshold, on the outward side first, at the nearest spot that covers no `hard`
   * box (the HUD, the radio ticker, the banner, the pills already placed) and as few `soft` ones as there are (callsigns, notes,
   * planes, the threshold itself). A pill that was clear last frame keeps its place relative to the threshold, so it holds still
   * while the planes move. T: the world transform (device px). bounds: { x0, y0, x1, y1 } in CSS px. A pill with no clear spot at
   * all is left off rather than put over the HUD. Returns [{ m, box, text, edge, alpha }], boxes in CSS px.
   */
  layoutPills(ctx, T, { dpr = 1, u = 1, bounds, hard = [], soft = [] }) {
    const pills = [];
    const spots = new Map();
    const gap = 4 * u;
    const taken = hard.slice(); // the HUD and the banner, then each pill as it is placed
    const toCss = (X, Y) => ({ x: (T.a * X + T.c * Y + T.e) / dpr, y: (T.b * X + T.d * Y + T.f) / dpr });
    const dirCss = (X, Y) => {
      const v = { x: (T.a * X + T.c * Y) / dpr, y: (T.b * X + T.d * Y) / dpr }, n = Math.hypot(v.x, v.y) || 1;
      return { x: v.x / n, y: v.y / n };
    };
    ctx.save();
    ctx.font = pillFont(u);
    for (const m of this.list) {
      if (m.kind === 'turning') continue; // a wind shift's runways: the banner speaks for them
      const z = m.z;
      const text = pillText(m);
      const w = ctx.measureText(text).width + 20 * u, h = PILL_H * u;
      const at = toCss(z.thx, z.thy);
      // a runway off the screen has no pill to show
      if (at.x < bounds.x0 - 40 * u || at.x > bounds.x1 + 40 * u || at.y < bounds.y0 - 40 * u || at.y > bounds.y1 + 40 * u) continue;
      const out = dirCss(z.thx - z.cx, z.thy - z.cy);
      const threshold = { x: at.x - 6 * u, y: at.y - 6 * u, w: 12 * u, h: 12 * u };
      const clampBox = (b) => ({ ...b, x: clamp(b.x, bounds.x0, Math.max(bounds.x0, bounds.x1 - w)), y: clamp(b.y, bounds.y0, Math.max(bounds.y0, bounds.y1 - h)) });
      const cands = [];
      const was = this.spots.get(z.id);
      if (was) cands.push({ box: clampBox({ x: at.x + was.dx, y: at.y + was.dy, w, h }), cost: -Infinity });
      for (let r = 0; r < RINGS; r++) {
        for (let k = 0; k < SPOKES; k++) {
          const ang = (k / SPOKES) * TAU, dx = Math.cos(ang), dy = Math.sin(ang);
          // the box's reach in this direction, so its near edge sits on the ring
          const reach = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2, R = (12 + r * 16) * u + reach;
          cands.push({ box: clampBox({ x: at.x + dx * R - w / 2, y: at.y + dy * R - h / 2, w, h }), cost: Math.acos(clamp(dx * out.x + dy * out.y, -1, 1)) + r * 0.45 });
        }
      }
      let best = null;
      for (const c of cands) {
        if (taken.some((b) => hit(c.box, b, gap))) continue;
        const clashes = soft.reduce((n, b) => n + (hit(c.box, b, gap) ? 1 : 0), 0) + (hit(c.box, threshold, 0) ? 1 : 0);
        if (!best || clashes < best.n || (clashes === best.n && c.cost < best.cost)) best = { box: c.box, cost: c.cost, n: clashes };
      }
      if (!best) continue;
      taken.push(best.box);
      spots.set(z.id, { dx: best.box.x - at.x, dy: best.box.y - at.y });
      pills.push({ m, box: best.box, text, edge: edgeOf(m.kind), alpha: m.kind === 'open' ? m.a : 1 });
    }
    ctx.restore();
    this.spots = spots;
    this.pills = pills;
    return pills;
  }
}

/** The strip and its X marks, in world units, drawn after the night tint so they read in the dark. css: world units per CSS px. */
export function drawClosureMarks(ctx, marks, t, { css = 1, night = 0, glow = null, reduced = false } = {}) {
  for (const m of marks) drawMark(ctx, m, t, css, night, glow, reduced);
}

function cross(ctx, x, h) {
  ctx.beginPath();
  ctx.moveTo(x - h, -h);
  ctx.lineTo(x + h, h);
  ctx.moveTo(x + h, -h);
  ctx.lineTo(x - h, h);
  ctx.stroke();
}

function drawMark(ctx, m, t, css, night, glow, reduced) {
  const { z, kind, a } = m;
  const L = z.length, Wd = z.width, pad = 2.5 * css, h = 4.6 * css;
  const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7); // reduced motion: the amber holds still
  const shut = kind === 'closed' || kind === 'open';
  const xs = [-L / 2 + 9 * css, 0, L / 2 - 9 * css]; // both ends and the middle
  const x0 = -L / 2 - pad, y0 = -Wd / 2 - pad, w = L + 2 * pad, hh = Wd + 2 * pad;
  ctx.save();
  ctx.translate(z.cx, z.cy);
  ctx.rotate(z.angle);
  ctx.lineCap = 'round';
  if (shut) {
    // the strip reads as shut: a red tint with fine hatching
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(176,24,30,0.55)';
    ctx.fillRect(x0, y0, w, hh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, hh);
    ctx.clip();
    // all the hatch lines in one path: one stroke, not one a line
    ctx.strokeStyle = 'rgba(255,236,170,0.5)';
    ctx.lineWidth = 1.1 * css;
    ctx.beginPath();
    for (let x = x0 - hh; x < x0 + w; x += 3.4 * css) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x + hh, y0 + hh);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // closing: an amber strip that breathes
    ctx.globalAlpha = (0.3 + 0.35 * pulse) * a;
    ctx.fillStyle = 'rgba(255,176,46,0.5)';
    ctx.fillRect(x0, y0, w, hh);
    ctx.globalAlpha = (0.6 + 0.4 * pulse) * a;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5 * css;
    ctx.strokeRect(x0, y0, w, hh);
  }
  for (const x of kind === 'turning' ? [] : xs) {
    if (shut) {
      // a dark keyline so the yellow reads on grass and on asphalt
      const painted = a * (1 - 0.7 * night); // at night the X is mostly its red lights
      ctx.globalAlpha = 0.6 * painted;
      ctx.strokeStyle = '#1b1f22';
      ctx.lineWidth = 4 * css;
      cross(ctx, x, h);
      ctx.globalAlpha = painted;
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 2.2 * css;
      cross(ctx, x, h);
    } else {
      ctx.globalAlpha = (0.55 + 0.45 * pulse) * a;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2.2 * css;
      cross(ctx, x, h);
    }
  }
  if (kind === 'closed' && night > 0.05 && glow) {
    // at night the X is lit: red lights along both arms of each X
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, night * 1.2) * a;
    const r = 4.2 * css;
    for (const x of xs) {
      for (const p of [-1, -0.5, 0, 0.5, 1]) {
        for (const sg of [-1, 1]) {
          const px = x + p * h, py = sg * p * h;
          ctx.drawImage(glow, px - r, py - r, 2 * r, 2 * r);
        }
      }
    }
  }
  ctx.restore();
}

/**
 * The pills, in CSS px on the screen, over the map and under the HUD. A thin dashed pointer runs from a closing or closed one
 * up to the banner (`banner`: its box in CSS px, from last frame).
 */
export function drawClosurePills(ctx, pills, { dpr = 1, u = 1, banner = null } = {}) {
  if (!pills.length) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = pillFont(u);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of pills) {
    const b = p.box;
    ctx.globalAlpha = p.alpha;
    if (banner && p.m.kind !== 'open') {
      const above = banner.y + banner.h < b.y + b.h / 2;
      ctx.setLineDash([3 * u, 3 * u]);
      ctx.strokeStyle = p.edge;
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w / 2, above ? b.y : b.y + b.h);
      ctx.lineTo(banner.x + banner.w / 2, above ? banner.y + banner.h : banner.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(22,28,32,0.9)';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fill();
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    ctx.fillStyle = p.edge === AMBER ? '#ffe39a' : '#fff3cf';
    ctx.fillText(p.text, b.x + b.w / 2, b.y + b.h / 2);
  }
  ctx.restore();
}
