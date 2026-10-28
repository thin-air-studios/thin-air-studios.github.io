// Holding stacks: two named fixes out on the edge of the airspace, each with a published racetrack
// hold. Aircraft sent there are stacked 1,000 ft apart (5,000-8,000), so they're separated from each
// other, but not from anyone else crossing the pattern.
import { clamp, dist, mapLabel, cssScale, hudScale, TAU } from './util.js?v=2f66fd5f';
import { WORLD_H } from './config.js?v=2f66fd5f';

export const STACK_LEVELS = 4;
export const FIX_RADIUS = 16;
export const FIX_SLACK = 10; // the lift's slack round a fix's own disc (sim.js endPath)
export const HOLD_DP = 20; // a hold's touch margin, in screen px (dp) at the zoom the finger lifts at
const REF_K = 390 / 540; // CSS px per world unit at fit on the reference phone (844x390, uiscale.js): a lift with no view
const LEG = 64; // straight legs, world units
const TURN = 19; // turn radius

/**
 * The view a lift was made in, for a hold's touch target: k is CSS px per world unit (the zoom, pinch included) and ui the UI
 * scale. The phone records both with the lift (replay.js), so a replay makes the same call; a lift with none uses the reference
 * phone at fit. Clamped to the range a phone can make: k is min(width / 1100, height / 540) times the zoom (dpr cancels), so about
 * 0.58 at 640 x 360 and about 5.6 at the full 4.5x zoom on a 1366 x 670 screen (decision 206). A tablet at full zoom can read above
 * 6; it is then held to 6, a slightly bigger target. The margin is 20 CSS px, so 20 / k world units: at 0.5 it is 40, at the
 * honest 0.58 it is 34, and at the old floor of 0.2 it was 100 (a view no phone makes).
 */
export function holdScale(s) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  return {
    k: s && num(s.k) ? clamp(s.k, 0.5, 6) : REF_K,
    ui: s && num(s.ui) ? clamp(s.ui, 0.9, 2) : 1,
  };
}

/** Where a hold's name is drawn, in world units under its fix (drawFixes), and so where its touch disc sits. */
export const holdNameY = (ui, k) => 4 + (10 * ui) / k;

/** Inside the racetrack outline (even-odd test). */
export function inLoop(loop, x, y) {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Distance in world units from (x, y) to the racetrack outline. */
export function distToLoop(loop, x, y) {
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy;
    const t = L ? clamp(((x - a.x) * vx + (y - a.y) * vy) / L, 0, 1) : 0;
    best = Math.min(best, Math.hypot(a.x + vx * t - x, a.y + vy * t - y));
  }
  return best;
}

/**
 * The hold's touch target, without the fix's own disc (sim.js fixHit adds that): the whole racetrack, the screen margin round its
 * outline, and a disc of the same margin round the name. s is holdScale(view). drawFixes lights the same shapes while a path is drawn.
 */
export function holdHit(f, x, y, s) {
  const m = HOLD_DP / s.k; // the margin in world units at this zoom
  if (inLoop(f.loop, x, y) || distToLoop(f.loop, x, y) <= m) return true;
  return dist(x, y, f.x, f.y + holdNameY(s.ui, s.k)) <= m;
}

/** A pronounceable five-letter fix name, the same for an airport every time ("BOKLA", "TAMIS"). */
export function fixName(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = (n) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return (h >>> 0) % n;
  };
  const C = 'BDFGKLMNPRSTVWZ', V = 'AEIOU';
  const pat = next(2) ? 'CVCCV' : 'CVCVC';
  let out = '';
  for (const p of pat) out += p === 'C' ? C[next(C.length)] : V[next(V.length)];
  // clusters that read badly on the radio
  return out.replace(/([BDGKPT])([BDGKPT])/, '$1R');
}

/**
 * The racetrack: inbound leg ends at the fix heading `ang`, right turns (standard), outbound leg
 * on the far side. Returned as a closed polyline starting at the fix.
 */
export function racetrack(fx, fy, ang, step = 6) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx; // to the right of the inbound course (y is down)
  const pts = [];
  const arc = (cx, cy, from) => {
    const n = Math.ceil((Math.PI * TURN) / step);
    for (let i = 1; i <= n; i++) {
      const th = from + (Math.PI * i) / n;
      pts.push({ x: cx + Math.cos(th) * TURN, y: cy + Math.sin(th) * TURN });
    }
  };
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) / step));
    for (let i = 1; i <= n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
  };
  pts.push({ x: fx, y: fy });
  // turn outbound around a centre to the right of the fix
  arc(fx + nx * TURN, fy + ny * TURN, Math.atan2(-ny, -nx));
  const ox = fx + nx * TURN * 2, oy = fy + ny * TURN * 2;
  line(ox, oy, ox - dx * LEG, oy - dy * LEG);
  arc(fx + nx * TURN - dx * LEG, fy + ny * TURN - dy * LEG, Math.atan2(ny, nx));
  line(fx - dx * LEG, fy - dy * LEG, fx, fy);
  return pts;
}

/**
 * Two fixes, one each side of the airport, placed clear of the runways' approach paths (both ends,
 * since the wind can turn them round). Each inbound course points at the airport.
 */
export function makeFixes(world, seed = '', inHud = () => false) {
  const { W, H } = world;
  const rws = world.runways || [];
  const ax = rws.length ? rws.reduce((s, z) => s + z.cx, 0) / rws.length : W / 2;
  const ay = rws.length ? rws.reduce((s, z) => s + z.cy, 0) / rws.length : H / 2;
  // distance from a point to every runway's extended centreline (out to 420 units each way)
  const clearance = (x, y) => {
    let best = Infinity;
    for (const z of rws) {
      const ux = Math.cos(z.angle), uy = Math.sin(z.angle);
      const s = Math.max(-z.length / 2 - 420, Math.min(z.length / 2 + 420, (x - z.cx) * ux + (y - z.cy) * uy));
      best = Math.min(best, dist(x, y, z.cx + ux * s, z.cy + uy * s));
    }
    return best;
  };
  const out = [];
  for (const side of [0, 1]) {
    let pick = null;
    for (const fx of [0.13, 0.17, 0.21]) {
      const x = side ? W * (1 - fx) : W * fx;
      for (const fy of [0.24, 0.36, 0.5, 0.64, 0.76]) {
        // the holds sit as far from the airport as on a phone, whatever the height. Written so that at 540 it is H * fy to the last bit
        // (H / 2 + (fy - 0.5) * 540 is not: a hold's position would move by a rounding, and a game's outcome with it; DECISIONS 440)
        const y = H * fy - (H - WORLD_H) * (fy - 0.5);
        const ang = Math.atan2(ay - y, ax - x);
        const loop = racetrack(x, y, ang);
        // the whole racetrack clear of the approaches, on screen, and never under the score or the
        // buttons (where a tap would hit the HUD instead)
        const clear = Math.min(...loop.map((q) => clearance(q.x, q.y)));
        const bad = loop.filter((q) => inHud(q.x, q.y - 10) || inHud(q.x, q.y) || q.x < 12 || q.x > W - 12 || q.y < 12 || q.y > H - 12).length;
        // prefer the middle of the side, and the outer edge, when they're clear anyway
        const c = Math.min(clear, 60) - Math.abs(fy - 0.5) * 30 - (fx - 0.13) * 60 - bad * 1000;
        if (!pick || c > pick.c) pick = { x, y, c, ang, loop };
      }
    }
    out.push({ id: side, name: fixName(`${seed}:${side}`), x: pick.x, y: pick.y, ang: pick.ang, loop: pick.loop });
  }
  return out;
}

const HALO = 'rgba(255,247,214,0.1)';

/**
 * The whole target, softly, while a path is drawn (holdHit's shapes): the racetrack's inside, the screen margin round its outline,
 * the name's disc and the fix's own. A plane drawn to a hold with room lights all of it, so the finger can see where it counts.
 */
function holdHalo(ctx, f, k, ui) {
  const m = HOLD_DP / k;
  ctx.fillStyle = HALO;
  ctx.strokeStyle = HALO;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  f.loop.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2 * m; // the margin: m either side of the outline
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(f.x, f.y + holdNameY(ui, k), m, 0, TAU);
  ctx.moveTo(f.x + FIX_RADIUS + FIX_SLACK, f.y);
  ctx.arc(f.x, f.y, FIX_RADIUS + FIX_SLACK, 0, TAU);
  ctx.fill();
}

/**
 * Draw the fixes: a triangle and name, the racetrack faintly, and how full the stack is. While a path is drawn (highlight), a
 * hold with room lights up whole: a soft halo over its touch target, brighter dashes and a bigger triangle.
 */
export function drawFixes(ctx, fixes, aircraft, t, highlight = false) {
  const k = cssScale(ctx), ui = hudScale();
  for (const f of fixes) {
    const n = aircraft.filter((a) => a.stack && a.stack.fix === f.id && a.state === 'fly').length;
    const open = highlight && n < STACK_LEVELS;
    const pulse = 0.5 + 0.35 * Math.sin(t * 7);
    ctx.save();
    if (open) holdHalo(ctx, f, k, ui);
    ctx.strokeStyle = open ? `rgba(255,247,214,${0.75 + 0.2 * pulse})` : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = highlight ? (open ? 2.6 : 2) : 1.2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    f.loop.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // the fix itself: a chart-style triangle, bigger while a path is drawn to it
    ctx.translate(f.x, f.y);
    const g = open ? 1.7 : 1;
    ctx.fillStyle = n >= STACK_LEVELS ? 'rgba(255,120,100,0.85)' : 'rgba(255,247,214,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -5 * g);
    ctx.lineTo(4.6 * g, 3 * g);
    ctx.lineTo(-4.6 * g, 3 * g);
    ctx.closePath();
    ctx.fill();
    // labels sit a fixed number of screen pixels under the triangle, as many more as they've grown
    const px = ui / k;
    mapLabel(ctx, f.name, 0, holdNameY(ui, k), 11, 'rgba(255,255,255,0.92)');
    if (n) mapLabel(ctx, n >= STACK_LEVELS ? 'STACK FULL' : `${n}/${STACK_LEVELS}`, 0, 4 + 23 * px, 10, n >= STACK_LEVELS ? '#ffb4a6' : 'rgba(255,240,200,0.95)');
    ctx.restore();
  }
}

