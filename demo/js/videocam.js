// The follow camera of a crash clip (videorender.js, the Last 20 s): the map's view holds the planes that crashed (the replay's
// sim.crash.who), from the replay itself. Pure: no DOM, no canvas, so the tests read it. The view aims at the planes' box over a short
// look-ahead (a plane that comes in is in the frame before it appears); a critically damped spring follows the aim, with a cap on the
// pan and on the zoom. The view shows past the airspace's edge by EDGE_PAD at most, the ground the game paints there (render.js), so no
// plane of a pair is cut when the pair is far apart, and a plane at the edge or just past it is whole. The zoom never crops a followed
// plane or the ends of the runway it lands on. The box is the one plane of a single loss (engine out, fuel, wake, storm), the two of a
// collision.
import { WORLD_H, SIM_HZ } from './config.js?v=7227d0de';
import { VIDEO_W, BAND_H } from './videoclip.js?v=7227d0de';

// the view may show this far (world units) past the airspace's edge: the ground the game paints there (render.js BG_MARGIN). 0 keeps
// the view inside the airspace; then a plane at the edge sits on the band's edge, and a far-apart pair can be cut
export const EDGE_PAD = 80;
export const TRACK_STEP = 30; // steps between two track samples: a quarter second at SIM_HZ (120)
export const TRACK_DT = TRACK_STEP / SIM_HZ;
export const LOOK_S = 2; // the view frames the planes as they will be up to this long ahead
export const OMEGA = 2.2; // the spring's frequency: critically damped, it settles in about 2 s
export const PAN_MAX = 90; // the pan cap, in world units a second (the pull back to the airspace's edge counts against it)
export const ZOOM_RATE = 0.35; // the zoom cap, in log(zoom) a second
export const ZOOM_MIN = 1.4, ZOOM_MAX = 3; // the zoom range, times the whole airspace's fit (the renderer's)
export const PUSH_S = 8, PUSH_GAIN = 0.3; // before the crash the view pushes in over PUSH_S seconds, by up to PUSH_GAIN, where the planes allow
export const MARGIN_SOFT = 90; // px the planes keep from the band's edges at the comfortable zoom (before a push)
export const MARGIN_HARD = 24; // px the planes keep from the band's edges at the tightest zoom: the zoom never goes past this
const WINDOW = [-3, 20]; // the look-ahead window's samples, in tenths of a second: -0.3 s to LOOK_S

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * The planes' positions every TRACK_STEP steps, from step `from` (a multiple of TRACK_STEP): row j holds the planes of sample k0 + j as
 * a Map of id to { x, y, rw }, where rw is the two ends of the runway the plane lands on (null when it has none). Every plane is kept,
 * because the planes that crashed are only known when the replay has run to its end (videorender.js scanReplayAsync).
 */
export class Track {
  constructor(from) {
    this.from = from;
    this.k0 = from / TRACK_STEP;
    this.rows = [];
    this.lastStep = -1; // the last step sampled (a step is sampled once)
  }

  add(planes) {
    this.rows.push(new Map(planes.map((p) => [p.id, p])));
  }

  /** The two sample rows around sim time t, and the fraction (0..1) of the way from the first to the second. */
  at(t) {
    const u = t / TRACK_DT;
    const fl = Math.floor(u + 1e-9);
    const k = fl - this.k0;
    return { a: this.rows[k] || null, b: this.rows[k + 1] || null, f: clamp(u - fl, 0, 1) };
  }
}

/**
 * The follow camera for one clip. ids: the planes that crashed (their ids); track: the Track of the replay (its rows cover the clip and
 * the look-ahead); crashT: the crash's time on the step clock (the camera's clock: the push-in), or null; W: the world's width. The view
 * is { cx, cy, zoom } in world units and zoom (the renderer's scale is fit x zoom).
 */
export class FollowCamera {
  constructor({ W, H = WORLD_H, bandH = BAND_H, ids, track, crashT = null }) {
    this.W = W;
    this.H = H;
    this.bandH = bandH;
    this.ids = [...ids];
    this.track = track;
    this.crashT = crashT;
    this.fit = Math.min(VIDEO_W / W, this.bandH / H); // px per world unit at zoom 1: the renderer's fit (render.js fit)
    this.zoomWorld = Math.max(VIDEO_W / (W + 2 * EDGE_PAD), this.bandH / (H + 2 * EDGE_PAD)) / this.fit; // the least zoom whose view fits the airspace and its pad
    this.init = false;
    this.x = W / 2;
    this.y = this.H / 2;
    this.lz = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.view = { cx: this.x, cy: this.y, zoom: 1 };
  }

  /** The push-in at sim time now: 0 before PUSH_S seconds to the crash, rising to 1 at the crash and held (the wreck). */
  push(now) {
    if (this.crashT == null) return 0;
    const u = clamp((now - (this.crashT - PUSH_S)) / PUSH_S, 0, 1);
    return now < this.crashT ? u * u * (3 - 2 * u) : 1;
  }

  /**
   * The planes' box over the window [now - 0.3 s, now + LOOK_S], as the edges { x0, x1, y0, y1 } in world units, clamped to the airspace,
   * with the ends of each plane's runway. Null when no followed plane is in the track over the window.
   */
  box(now, ahead = LOOK_S) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (x, y) => {
      const px = clamp(x, -EDGE_PAD, this.W + EDGE_PAD), py = clamp(y, -EDGE_PAD, this.H + EDGE_PAD);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    };
    for (let j = WINDOW[0]; j <= Math.round(ahead * 10); j++) {
      const { a, b, f } = this.track.at(now + j / 10);
      if (!a && !b) continue;
      for (const id of this.ids) {
        const p0 = a && a.get(id), p1 = b && b.get(id);
        if (!p0 && !p1) continue;
        if (p0 && p1) add(p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f);
        else add((p0 || p1).x, (p0 || p1).y);
        const rw = (p0 && p0.rw) || (p1 && p1.rw);
        if (rw) for (const [x, y] of rw) add(x, y);
      }
    }
    return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
  }

  /**
   * The centres from which a box's edge pair [lo, hi] on one axis sits inside the band at px per unit s, with margin m px from each band
   * edge. A margin is kept only where the view has the room for it: a box edge nearer than m px to the limit the view may reach (the
   * airspace's edge, and EDGE_PAD past it) sits on the band's edge. Returns [c0, c1], or null when no centre does. The view stays within
   * the airspace and its pad: its centre lies in [half - pad, L + pad - half].
   */
  range(s, lo, hi, L, size, m) {
    const half = size / (2 * s);
    const below = (size / 2 - ((lo + EDGE_PAD) * s >= m ? m : 0)) / s; // how far the box's low edge may sit below the centre
    const above = (size / 2 - ((L + EDGE_PAD - hi) * s >= m ? m : 0)) / s; // and its high edge above it
    const c0 = Math.max(half - EDGE_PAD, hi - above), c1 = Math.min(L + EDGE_PAD - half, lo + below);
    return c0 <= c1 + 1e-9 ? [c0, c1] : null;
  }

  /** The centre ranges on both axes for a box at zoom z, with margin m px, or null when the box cannot be framed so. */
  frame(z, box, m) {
    const s = this.fit * z;
    const rx = this.range(s, box.x0, box.x1, this.W, VIDEO_W, m);
    const ry = rx && this.range(s, box.y0, box.y1, this.H, this.bandH, m);
    return rx && ry ? { x: rx, y: ry } : null;
  }

  /**
   * The zooms (a grid from zoomWorld to ZOOM_MAX) at which the box is framed with margin m. Not an interval in general (a view that is
   * too wide for the airspace fails at the low end, one too narrow for the box at the high), so the grid is searched, not bisected.
   */
  zoomsFor(box, m) {
    const out = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const z = this.zoomWorld + ((ZOOM_MAX - this.zoomWorld) * i) / n;
      if (this.frame(z, box, m)) out.push(z);
    }
    return out;
  }

  /**
   * The view the camera aims at, at time now (the step clock): { x, y, zoom }. The zoom is the comfortable one (the widest that keeps the
   * box MARGIN_SOFT from the band's edges, pushed in before the crash, and at least ZOOM_MIN), or the nearest one that keeps the box
   * MARGIN_HARD from them, where the airspace has the room: the zoom never crops a followed plane. The centre is the box's, moved only as
   * far as the airspace and that margin need. Before any followed plane is in the track, the aim is the whole airspace.
   */
  target(now) {
    const look = this.box(now);
    if (!look) return { x: this.W / 2, y: this.H / 2, zoom: 1, box: null };
    // the box with the look-ahead; if the planes cannot be framed so, the planes now; if still not, the view is widened to show them all
    for (const box of [look, this.box(now, 0)]) {
      const hard = this.zoomsFor(box, MARGIN_HARD);
      if (!hard.length) continue;
      const soft = this.zoomsFor(box, MARGIN_SOFT);
      const widestSoft = soft.length ? soft[soft.length - 1] : hard[hard.length - 1];
      const want = clamp(widestSoft * (1 + PUSH_GAIN * this.push(now)), ZOOM_MIN, ZOOM_MAX);
      const zoom = hard.reduce((best, z) => (Math.abs(z - want) < Math.abs(best - want) ? z : best));
      const f = this.frame(zoom, box, MARGIN_HARD);
      return { x: clamp((box.x0 + box.x1) / 2, f.x[0], f.x[1]), y: clamp((box.y0 + box.y1) / 2, f.y[0], f.y[1]), zoom, box };
    }
    // the planes cannot be framed at any zoom the airspace allows: the view is the widest (zoomWorld) and as near the planes now as its
    // limits let it be, so it never shows past the airspace's pad; a plane the view cannot hold is cut by the band's edge
    const now0 = this.box(now, 0) || look;
    const lim = this.limits(this.zoomWorld);
    return {
      x: clamp((now0.x0 + now0.x1) / 2, lim.x0, lim.x1),
      y: clamp((now0.y0 + now0.y1) / 2, lim.y0, lim.y1),
      zoom: this.zoomWorld,
      box: now0,
    };
  }

  /** The centre's limits for a zoom: the range that keeps the view inside the airspace and its EDGE_PAD (a view wider or taller: its middle). */
  limits(zoom) {
    const s = this.fit * zoom;
    const hwv = VIDEO_W / (2 * s), hhv = this.bandH / (2 * s);
    const x0 = hwv - EDGE_PAD, x1 = this.W + EDGE_PAD - hwv, y0 = hhv - EDGE_PAD, y1 = this.H + EDGE_PAD - hhv;
    return {
      x0: x0 <= x1 ? x0 : this.W / 2, x1: x0 <= x1 ? x1 : this.W / 2,
      y0: y0 <= y1 ? y0 : this.H / 2, y1: y0 <= y1 ? y1 : this.H / 2,
    };
  }

  /**
   * One camera tick at sim time now (dt seconds since the last): the spring toward the target, four substeps a tick, with the pan speed
   * (the spring's and the pull back inside the airspace together) and the zoom rate capped. Returns the view { cx, cy, zoom }, also kept
   * as this.view.
   */
  step(now, dt) {
    const tg = this.target(now);
    if (!this.init) {
      this.x = tg.x;
      this.y = tg.y;
      this.lz = Math.log(tg.zoom);
      this.init = true;
    }
    const h = dt / 4;
    for (let k = 0; k < 4; k++) {
      this.vx += (OMEGA * OMEGA * (tg.x - this.x) - 2 * OMEGA * this.vx) * h;
      this.vy += (OMEGA * OMEGA * (tg.y - this.y) - 2 * OMEGA * this.vy) * h;
      // the zoom's rate is capped, and so is the speed of the view's corners, which move with it: a half-width of hw moves at hw times
      // the rate, so a corner moves at the half-diagonal times the rate (a pull back at a corner then fits inside the pan cap)
      const rate = Math.min(ZOOM_RATE, (PAN_MAX * 2 * this.fit * Math.exp(this.lz)) / Math.hypot(VIDEO_W, this.bandH));
      this.vz = clamp(this.vz + (OMEGA * OMEGA * (Math.log(tg.zoom) - this.lz) - 2 * OMEGA * this.vz) * h, -rate, rate);
      this.lz += this.vz * h;
      // never wider than the airspace and its pad: below zoomWorld no centre keeps the view inside, so the spring stops there
      if (this.lz < Math.log(this.zoomWorld)) {
        this.lz = Math.log(this.zoomWorld);
        this.vz = Math.max(0, this.vz);
      }
      // the spring's pan is capped first; then a zoom that moved the view's edges past the centre pulls it back inside the airspace and
      // its pad, and the pull keeps its share of the cap: the other axis gives way, so the view never ends a substep outside
      let sp = Math.hypot(this.vx, this.vy);
      if (sp > PAN_MAX) {
        this.vx *= PAN_MAX / sp;
        this.vy *= PAN_MAX / sp;
      }
      const lim = this.limits(Math.exp(this.lz));
      let pullX = true, pullY = true;
      if (this.x + this.vx * h < lim.x0) this.vx = (lim.x0 - this.x) / h;
      else if (this.x + this.vx * h > lim.x1) this.vx = (lim.x1 - this.x) / h;
      else pullX = false;
      if (this.y + this.vy * h < lim.y0) this.vy = (lim.y0 - this.y) / h;
      else if (this.y + this.vy * h > lim.y1) this.vy = (lim.y1 - this.y) / h;
      else pullY = false;
      sp = Math.hypot(this.vx, this.vy);
      if (sp > PAN_MAX) {
        if (pullX !== pullY) {
          const pulled = clamp(pullX ? this.vx : this.vy, -PAN_MAX, PAN_MAX);
          const rest = Math.sqrt(Math.max(0, PAN_MAX * PAN_MAX - pulled * pulled));
          if (pullX) { this.vx = pulled; this.vy = clamp(this.vy, -rest, rest); }
          else { this.vy = pulled; this.vx = clamp(this.vx, -rest, rest); }
        } else {
          this.vx *= PAN_MAX / sp;
          this.vy *= PAN_MAX / sp;
        }
      }
      this.x += this.vx * h;
      this.y += this.vy * h;
    }
    this.view = { cx: this.x, cy: this.y, zoom: Math.exp(this.lz) };
    return this.view;
  }
}
