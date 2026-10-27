import { WEB_DEMO } from './flavor.js?v=7227d0de';
// Draws a frame: the real airport, paths, aircraft, effects and the HUD. Owns the camera
// (fit-to-airspace, pinch zoom, pan).
import { WORLD_H, ZONE_COLORS, CLASSES, TUNING, SPRITE_SCALE } from './config.js?v=7227d0de';
import { clamp, TAU, cssScale, collectMapLabels } from './util.js?v=7227d0de';
import { worldShape } from './worldshape.js?v=7227d0de';
import { drawAircraftShape, drawSpinners, spriteBitmap } from './sprites.js?v=7227d0de';
import { FONT } from './fx.js?v=7227d0de';
import { paintAirport, paintActiveEnds, groundTheme } from './airportpaint.js?v=7227d0de';
import { tailColor } from './airlines.js?v=7227d0de';
import { drawFixes } from './stacks.js?v=7227d0de';
import { STACK_FUEL, eitherEnd } from './hazards.js?v=7227d0de';
import { uiScales } from './uiscale.js?v=7227d0de';
import { reducedMotion, pulse as pulseAt, springOut, smooth, flashGate, speedStreaks, approach } from './motion.js?v=7227d0de';
import { ClosureMarks, drawClosureMarks, drawClosurePills } from './closures.js?v=7227d0de';

const BG_MARGIN = 80; // world units of ground painted beyond the airspace edge
const NO_INSETS = { l: 0, r: 0, t: 0, b: 0 }; // a screen without a camera cutout (hudRectsWorld)
// the HUD's margin from the side edges, in units (2.0: from 14, so curved phone edges keep the score, buttons and compass in)
const HUD_EDGE = 23;
const MAX_TEX = 4096;
const NAV_TIPS = { heavy: [-12, 27, 29], liner: [-9, 22, 23], regional: [1, 20, 17], prop: [1.5, 17.5, 13], heli: [-19, 4.5, 10] };

// tail-fin stripe per sprite: [from x, to x, half width] in sprite units
const FIN = { liner: [-23.4, -14.5, 1.15], regional: [-20.2, -13.5, 1.0], heavy: [-29.4, -18.5, 1.4] };

// the motion's timings, in seconds (ui 10): the pause morph, a press, its ripple, the rewind's spin, ring and tape,
// the used-up wipe; the rush banner's beat; how fast a turn banks an aircraft
const MORPH_S = 0.22, PRESS_S = 0.26, RIPPLE_S = 0.4, SPIN_S = 0.5, RING_S = 0.8, TAPE_S = 1.2, WIPE_S = 0.5;
const RUSH_HZ = 1.2, BANK_RATE = 0.4, BANK_STEP = 0.05; // a turn of 0.4 rad a second banks an aircraft fully; the bank rises at most BANK_STEP a 1/60 s, at any frame rate
const JETS = new Set(['narrowbody', 'heavy', 'regional']); // the ones that leave contrails (in the air, arriving)
const ORANGE = '255,138,42';
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

// two CSS px boxes overlap, or come within `gx` of each other along a line
const overlaps = (a, b, gx = 0) => a.x - gx < b.x + b.w && b.x - gx < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Two parts of a label on one line, with the gap between them; either may be empty. */
function joinLabel(a, b) {
  return a && b ? `${a}  ${b}` : a || b;
}

/** What a departure's label asks of the player: its stage prompt, or (in the air, no exit yet) where to go. */
function labelPrompt(a) {
  const d = a.departure;
  if (!d) return '';
  if (d.stage === 'airborne') return a.exit || a.state !== 'fly' ? '' : d.exitPrompt || '';
  return d.prompt || '';
}

// The halo on a hold (stacks.js drawFixes) lights for a plane a lift can put in one: the sim's own rule (sim.js fixHit), so a
// plane that is engine-out or low on fuel (it may not hold, item 7), or on an exit or a departure, never lights a hold it cannot fill.
export function canLiftIntoHold(a) {
  return !!a.drawing && a.state === 'fly' && !a.departure && !a.exit && !eitherEnd(a);
}

// The arrival note (routes.js): "Arrived from <city>" beside a real plane from its touchdown, for ARRIVAL_NOTE_S of game time,
// fading over the last ARRIVAL_NOTE_FADE_S. Game time, so a pause holds it; a new game or a rewind clears it (main.js).
export const ARRIVAL_NOTE_S = 3;
export const ARRIVAL_NOTE_FADE_S = 0.8;

/** The note's opacity with `left` game seconds to go: full until the fade, then a straight fade to nothing. */
export function noteAlpha(left) {
  return clamp(left / ARRIVAL_NOTE_FADE_S, 0, 1);
}

/**
 * Where a note of w x h CSS px goes beside an aircraft at (x, y), with its label offset `off`: above and to the right, as a
 * callsign is; under the plane at the top edge, and left of it at the right edge; then down past any box in `placed` it would
 * cover (the callsigns, the HUD's blocks, the place names). Returns { x, y, w, h } in CSS px.
 */
export function placeNote(x, y, off, w, h, { cssW, cssH, ins, u, placed = [], avoid = [] }) {
  const gap = 4 * u;
  let bx = x + off * 0.55;
  let by = y - off - h;
  if (by < ins.t + 4) by = y + off;
  if (bx + w > cssW - ins.r - 4) bx = x - off * 0.55 - w;
  bx = Math.max(bx, ins.l + 4);
  const box = { x: bx, y: by, w, h };
  const keepOnScreen = () => {
    box.y = Math.min(Math.max(box.y, ins.t + 4), cssH - ins.b - 4 - h);
  };
  keepOnScreen();
  for (let k = 0, b; k < 6 && (b = placed.find((p) => overlaps(box, p, gap))); k++) {
    // the radio ticker is passed upward, over it (a label low on the screen goes above it); anything else, downward as before
    box.y = b.ticker ? b.y - h - gap : b.y + b.h + gap;
    keepOnScreen();
  }
  // 2.8, fix 5: a note never covers a plane (the body of any plane on screen, its own included) or the Live feed line (avoid). Where the
  // default place does, it goes to the first other place beside the plane that is clear of the labels and of those; failing that, one clear
  // of the planes and the feed alone; failing that, the default place
  const clear = (b, boxes) => !boxes.some((p) => overlaps(b, p, gap));
  const fit = (cx, cy) => ({
    x: Math.min(Math.max(cx, ins.l + 4), cssW - ins.r - 4 - w),
    y: Math.min(Math.max(cy, ins.t + 4), cssH - ins.b - 4 - h),
    w,
    h,
  });
  if (!avoid.length || clear(box, avoid)) return box;
  const sides = [
    [x + off * 0.55, y + off],
    [x - off * 0.55 - w, y - off - h],
    [x - off * 0.55 - w, y + off],
    [x - w / 2, y - off - h],
    [x - w / 2, y + off],
    [x + off, y - h / 2],
    [x - off - w, y - h / 2],
  ].map(([cx, cy]) => fit(cx, cy));
  const free = sides.find((b) => clear(b, placed) && clear(b, avoid));
  if (free) return free;
  return sides.find((b) => clear(b, avoid)) || box;
}

/** The lee wing's shade for a bank: 0 under 0.2, full at 0.3, a ramp between, so a turn near the line never blinks it. */
export function leeShade(bank) {
  return clamp((Math.abs(bank) - 0.2) / 0.1, 0, 1);
}

// The game canvas's density: the screen's own, up to 3x (the art is vector: 2x was soft on a 2.6x phone). A screen bigger than
// 1366 by 1024 at 2x stays at 2x, as in 2.1: the frame cost grows with the canvas's pixel count (Chromium: 1366 by 1024 costs
// more at 3x than at 2x), and a phone's canvas, even at 3x, is well under this budget.
export const CANVAS_PIXELS = 5.6e6;
export function canvasDpr(devicePixelRatio, cssW, cssH) {
  // the browser demo caps a mouse or a trackpad at 2x (DECISIONS 446: a weak laptop's GPU); the app and touch keep 3x
  const cap = WEB_DEMO && typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches ? 2 : 3;
  return Math.min(devicePixelRatio || 1, cap, Math.max(2, Math.sqrt(CANVAS_PIXELS / Math.max(1, cssW * cssH))));
}

/**
 * The ground beyond the airspace fades out over the margin (3.1). On a tall screen the margin sits in the letterbox bands, and the
 * painted box's hard edge read as clipped. Each pass keeps what is under its gradient (destination-in), so the four passes
 * multiply and the corners fade too. The airspace is not touched, and draw() fills the canvas with the ground colour first.
 */
export function fadeMargin(g, W, H) {
  const clear = 'rgba(0,0,0,0)', opaque = 'rgba(0,0,0,1)';
  const ramp = (x0, y0, x1, y1, from, to) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, from);
    gr.addColorStop(1, to);
    return gr;
  };
  g.save();
  g.globalCompositeOperation = 'destination-in';
  for (const fill of [
    ramp(0, -BG_MARGIN, 0, 0, clear, opaque), // top
    ramp(0, H, 0, H + BG_MARGIN, opaque, clear), // bottom
    ramp(-BG_MARGIN, 0, 0, 0, clear, opaque), // left
    ramp(W, 0, W + BG_MARGIN, 0, opaque, clear), // right
  ]) {
    g.fillStyle = fill;
    g.fillRect(-BG_MARGIN, -BG_MARGIN, W + 2 * BG_MARGIN, H + 2 * BG_MARGIN);
  }
  g.restore();
}

/**
 * The HUD's fixed measures at UI scale u and the screen's insets, in CSS px (Renderer.hudMetrics). Pure: a friend's challenge
 * reads the same measures for the challenger's screen without a renderer (hudRectsFor).
 */
export function hudMetricsFor(u, ins) {
  const m = HUD_EDGE * u;
  return {
    u, m, left: m + ins.l, top: 10 * u + ins.t,
    // the small all-caps lines stay readable on the smallest phones
    small: Math.max(10.5, 11 * u), mixSize: Math.max(10.5, 10.5 * u),
    br: 19 * u, gap: 12 * u,
    compassEdge: ins.l + m + 46 * u + 4.7 * Math.max(10.5, 10 * u),
  };
}

/**
 * Where the HUD sits over the airspace at fit zoom on a screen of cssW by cssH CSS px, in world units of a W by H world, for the sim
 * to keep departure gates, holding fixes and arrival warnings out from under it (Sim.inHudCorner, inHudSoft). Hard: the score block,
 * the buttons (rewind slot included) and the wind compass, where a gate would hide or a tap would hit the HUD. Soft: the title block
 * and a two-line radio ticker, best avoided. Sized for the worst case ('BEST 999', '99 IN A ROW') from fixed em widths of the HUD font,
 * never measured, and as on a screen without a camera cutout (the HUD moves in by its insets, the zones don't), so a daily challenge
 * comes out the same on every device with this screen size, whichever way up it's held. The letterbox bands of squarer screens shrink
 * the zones on their own. hud is the screen's UI scale (uiscale.js). Renderer.hudRectsWorld is this with the renderer's own screen.
 */
export function hudRectsFor(W, H, cssW, cssH, hud = uiScales(cssW, cssH).hud) {
  const ins = NO_INSETS;
  const { u, m, left, top, small, br, gap, compassEdge } = hudMetricsFor(hud, ins);
  const fit = Math.min(cssW / W, cssH / H); // CSS px per world unit
  const p = 6 * u; // the buttons' hit slop, and a little air around the rest
  // a CSS px box to whole world units, rounded outwards
  const box = (x0, y0, x1, y1) => {
    const wx = (x) => W / 2 + (x - cssW / 2) / fit, wy = (y) => H / 2 + (y - cssH / 2) / fit;
    const x = Math.floor(wx(x0)), y = Math.floor(wy(y0));
    return { x, y, w: Math.ceil(wx(x1)) - x, h: Math.ceil(wy(y1)) - y };
  };
  // the ticker: centred, clear of the wind compass on both sides, 40 em at most, two lines of 13 px plus padding
  // (at the HUD's scale: where the ticker's own is smaller, this is a little more than it takes)
  const tickerHalf = Math.min(cssW / 2 - compassEdge - 12 * u, 260 * u);
  const hard = [
    box(0, 0, left + Math.max(2 + 5.7 * small, 63 * u) + p, top + 66 * u + small / 2 + p), // '99 IN A ROW', or a 4-digit score
    box(cssW - ins.r - m - 6 * br - 2 * gap - p, 0, cssW, top + 2 * br + p),
    box(0, cssH - ins.b - m - 40 * u - p, compassEdge + p, cssH), // the wind compass
  ];
  const soft = [box(cssW / 2 - 150 * u, 0, cssW / 2 + 150 * u, top + 56 * u)];
  if (tickerHalf > 0) soft.push(box(cssW / 2 - tickerHalf, cssH - ins.b - 56 * u, cssW / 2 + tickerHalf, cssH));
  return { hard, soft };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.bg = document.createElement('canvas');
    this.world = null;
    this.W = 960;
    this.H = WORLD_H; // the screen's own world (layout); a drawn world (setWorld) has its own W and H
    this.upright = false; // whether the screen gets an upright airspace (worldshape.js)
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.insets = { l: 0, r: 0, t: 0, b: 0 };
    this.hud = 1; // UI scales (uiscale.js): the in-play chrome and the menus
    this.ui = 1;
    this.buttons = {};
    this.hudGeom = null; // where the HUD sat last frame (hudLayout), or null when it's hidden
    this.closures = null; // the runway closure marks and pills for the game's sim (closures.js), made on the first frame
    this.toastBottom = 0; // set by main.js while a toast is up (CSS px): the centre popups go under it
    this.view = { cx: 480, cy: 270, zoom: 1 };
    this.fitMapBoxes = null; // where the gate and fix names sit at fit zoom, in CSS px (draw, for tickerLane)
    this.arrivalNotes = []; // "Arrived from" notes beside real planes (noteArrival): { a, text, from, until } in game seconds
    this.tailHeld = new Set(); // the planes a finger holds by a tail (main.js): their tail handles light up
    this.bgRes = 0;
    this.bgTimer = 0;
  }

  /** Size the canvas to the screen; returns the world width for this aspect ratio. */
  layout(cssW, cssH, dpr, insets) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    if (insets) this.insets = insets;
    this.fitMapBoxes = null; // the gate and fix names move with the screen: noted again at the next frame at fit zoom
    const cw = Math.round(cssW * dpr), ch = Math.round(cssH * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const shape = worldShape(cssW, cssH);
    this.W = shape.W;
    this.H = shape.H;
    this.upright = shape.upright;
    Object.assign(this, uiScales(cssW, cssH));
    this.tick = this.tickerScale();
    return this.W;
  }

  /** The world shape this screen gets from its last layout: { W, H, upright } (worldshape.js). */
  worldSize() {
    return { W: this.W, H: this.H, upright: this.upright };
  }

  /** The airspace being drawn: the world's { W, H }, or the screen's own shape before a world is set. */
  get airspace() {
    return this.world || this;
  }

  /**
   * The canvas at another density (density.js, the governor): the same CSS size, so the picture stays where it is (the view
   * is in world units and the scale follows the canvas's pixels). Only the canvas and its background cache change; the
   * HUD, the input record and the simulation are not touched.
   */
  setDensity(dpr) {
    if (dpr === this.dpr) return false;
    this.layout(this.cssW, this.cssH, dpr);
    this.scheduleBackground();
    return true;
  }

  /** CSS px of letterbox above and below the airspace at fit zoom: squarer than 1.5:1 (4:3 tablets, foldables). */
  get band() {
    return Math.max(0, (this.cssH - (this.airspace.H * this.fit) / this.dpr) / 2);
  }

  get fit() {
    return Math.min(this.canvas.width / this.airspace.W, this.canvas.height / this.airspace.H);
  }

  get scale() {
    return this.fit * this.view.zoom;
  }

  setWorld(world) {
    this.world = world;
    this.view = { cx: world.W / 2, cy: world.H / 2, zoom: 1 };
    this.theme = groundTheme(world.L.info);
    this.renderBackground(true);
  }

  // ------------------------------------------------------------- camera

  toWorld(clientX, clientY) {
    const s = this.scale;
    return [(clientX * this.dpr - this.canvas.width / 2) / s + this.view.cx, (clientY * this.dpr - this.canvas.height / 2) / s + this.view.cy];
  }

  toScreen(wx, wy) {
    const s = this.scale;
    return [(this.canvas.width / 2 + (wx - this.view.cx) * s) / this.dpr, (this.canvas.height / 2 + (wy - this.view.cy) * s) / this.dpr];
  }

  /** World point to CSS pixels through the transform actually drawn this frame (camera shake and crash zoom included). */
  groundToScreen(wx, wy) {
    const m = this.worldTransform;
    if (!m) return this.toScreen(wx, wy);
    return [(m.a * wx + m.c * wy + m.e) / this.dpr, (m.b * wx + m.d * wy + m.f) / this.dpr];
  }

  zoomAt(factor, clientX, clientY) {
    const [wx, wy] = this.toWorld(clientX, clientY);
    this.view.zoom = clamp(this.view.zoom * factor, 1, 4.5);
    const s = this.scale;
    this.view.cx = wx - (clientX * this.dpr - this.canvas.width / 2) / s;
    this.view.cy = wy - (clientY * this.dpr - this.canvas.height / 2) / s;
    this.clampView();
    this.scheduleBackground();
  }

  panBy(dxCss, dyCss) {
    const s = this.scale;
    this.view.cx -= (dxCss * this.dpr) / s;
    this.view.cy -= (dyCss * this.dpr) / s;
    this.clampView();
  }

  clampView() {
    if (!this.world) return;
    const s = this.scale;
    const hw = this.canvas.width / 2 / s, hh = this.canvas.height / 2 / s;
    const W = this.world.W, H = this.world.H;
    this.view.cx = hw * 2 >= W ? W / 2 : clamp(this.view.cx, hw, W - hw);
    this.view.cy = hh * 2 >= H ? H / 2 : clamp(this.view.cy, hh, H - hh);
  }

  resetView() {
    if (!this.world) return;
    this.view = { cx: this.world.W / 2, cy: this.world.H / 2, zoom: 1 };
    this.scheduleBackground();
  }

  // --------------------------------------------------------- background

  scheduleBackground() {
    clearTimeout(this.bgTimer);
    this.bgTimer = setTimeout(() => this.renderBackground(), 220);
  }

  /** Pre-render the static airport at (about) the current zoom's resolution. */
  renderBackground(force = false) {
    const w = this.world;
    if (!w) return;
    const spanW = w.W + BG_MARGIN * 2, spanH = w.H + BG_MARGIN * 2;
    const res = Math.min(this.scale, MAX_TEX / spanW, MAX_TEX / spanH);
    if (!force && Math.abs(res - this.bgRes) / Math.max(res, 1e-6) < 0.25) return;
    this.bgRes = res;
    this.bg.width = Math.ceil(spanW * res);
    this.bg.height = Math.ceil(spanH * res);
    const g = this.bg.getContext('2d');
    g.setTransform(res, 0, 0, res, BG_MARGIN * res, BG_MARGIN * res);
    paintAirport(g, w, { x0: -BG_MARGIN, y0: -BG_MARGIN, x1: w.W + BG_MARGIN, y1: w.H + BG_MARGIN });
    fadeMargin(g, w.W, w.H);
  }

  // --------------------------------------------------------------- frame

  draw(game) {
    const ctx = this.ctx;
    const { sim, fx } = game;
    const t = game.clock;
    this.clock = t;
    this.animate(game, t);
    const w = this.world;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme ? this.theme.base : '#16323a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!w) return;
    const shake = fx.shake;
    const sx = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    const cam = game.camera;
    const s = this.scale * cam.zoom;
    this.camZoom = cam.zoom;
    const fxp = cam.zoom !== 1 ? cam.fx : this.view.cx, fyp = cam.zoom !== 1 ? cam.fy : this.view.cy;
    const ocx = this.view.cx + (fxp - this.view.cx) * (1 - 1 / cam.zoom);
    const ocy = this.view.cy + (fyp - this.view.cy) * (1 - 1 / cam.zoom);
    ctx.setTransform(s, 0, 0, s, this.canvas.width / 2 - (ocx - sx) * s, this.canvas.height / 2 - (ocy - sy) * s);
    this.worldTransform = ctx.getTransform();
    ctx.drawImage(this.bg, -BG_MARGIN, -BG_MARGIN, w.W + BG_MARGIN * 2, w.H + BG_MARGIN * 2);
    // airspace boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5 / s * this.dpr;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(0, 0, w.W, w.H);
    ctx.setLineDash([]);
    paintActiveEnds(ctx, w, t);
    // the gate and fix names drawn from here, for the callsigns to keep clear of
    const mapBoxes = [];
    collectMapLabels(sim ? mapBoxes : null);
    if (game.underlay) game.underlay(ctx, t);
    if (game.lighting) {
      game.lighting.drawSky(ctx);
      game.lighting.drawLights(ctx, t, this.scale);
      if (game.scenery && game.night > 0.05) game.scenery.drawLights(ctx, t, game.night);
    }
    if (!sim) return this.drawHud(game);

    if (sim.fixes && sim.fixes.length && !sim.fixesHidden) drawFixes(ctx, sim.fixes, sim.aircraft, t, sim.aircraft.some(canLiftIntoHold));
    collectMapLabels(null);
    // and where they sit at fit zoom, for the radio ticker to keep clear of at the bottom edge (tickerLane): noted
    // from a frame drawn there (no pinch or crash zoom, no shake), so the lane holds still while the camera moves
    if (this.view.zoom === 1 && Math.abs(cam.zoom - 1) < 1e-3 && !shake) this.fitMapBoxes = mapBoxes;
    this.drawZoneHints(ctx, sim, t, game.hint && game.hint.aircraft);
    this.drawRunwayWarnings(ctx, sim, t);
    // a closing or closed runway's marks, after the night tint so they never dim (closures.js; drawing only)
    if (!this.closures || this.closures.sim !== sim) this.closures = new ClosureMarks(sim);
    this.closures.update(sim, t, game.weather);
    drawClosureMarks(ctx, this.closures.list, t, { css: this.dpr / s, night: game.night || 0, glow: game.lighting ? game.lighting.redGlow : null, reduced: this.motionState().reduced });
    fx.drawGround(ctx);
    // label boxes this frame, in CSS px: the HUD's blocks first, then the callsigns, the notes and the closure pills. The place
    // names (terminal names, taxiway signs) are the least important labels: drawn last, once those have their room (below)
    const placed = this.hudBoxes();
    ctx.setTransform(this.worldTransform);
    const list = sim.aircraft;
    for (const a of list) {
      if (a.state !== 'fly') continue;
      if (a.loop) this.drawLoop(ctx, a, t);
      // the handle: a free path's tail, and the path a finger is carrying on from its tail (drawing, held: lit, and the end is the finger)
      const held = this.tailHeld.has(a);
      if (a.path.length > a.pathIdx) this.drawPath(ctx, a, t, (held && a.target == null) || sim.tailOf(a) ? { held } : null);
      // a path the plane has flown to, within its tail's window (sim.tailOf): the handle alone, where the path ends (2.8, fix 2)
      else if (sim.tailOf(a)) this.drawTail(ctx, a, sim.tailOf(a), held, this.hudPx);
      if (a.hold) this.drawHold(ctx, a, t);
    }
    for (const a of list) {
      if (a.state === 'landing' || a.ground) this.drawAircraft(ctx, a, t, a.state === 'landing' ? 1 - Math.min(1, a.landT / 0.7) : 0);
      else if (a.state === 'crashed') this.drawWreck(ctx, a);
    }
    const night = game.night || 0;
    // higher in the stack, the further the shadow falls
    for (const a of list) if (a.state === 'fly' && !a.ground && !a.blip) this.drawShadow(ctx, a, t, a.stack ? 1.5 + a.stack.level * 0.45 : 1);
    if (game.overlayBelowAircraft) game.overlayBelowAircraft(ctx, t);
    for (const a of list) if (a.state === 'fly' && !a.ground && !a.blip) this.drawBody(ctx, a, t);
    if (night > 0.05) for (const a of list) if ((a.state === 'fly' && !a.blip) || a.state === 'landing' || a.ground) this.drawNavLights(ctx, a, t, night);
    if (game.symbols) for (const a of list) if (a.state === 'fly' && !a.blip) drawSymbol(ctx, CLASSES[a.cls].color, a.x, a.y, 4.2, a.alpha);
    for (const a of list) {
      if (a.state !== 'fly') continue;
      if (a.prox) this.drawProx(ctx, a, t);
      if (a.drawing) this.drawSelect(ctx, a, t);
    }
    for (const wn of sim.warnings) this.drawWarning(ctx, wn, t);
    if (game.overlayAboveAircraft) game.overlayAboveAircraft(ctx, t);
    fx.drawTop(ctx);
    this.hintBox = null;
    if (game.hint) this.drawHint(ctx, game.hint, t);

    // screen space: labels, overlays, HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.screenOverlay) game.screenOverlay(ctx, this);
    // the callsigns also keep clear of the gate and fix names, the tutorial hint and the centre messages
    placed.push(...mapBoxes);
    if (this.hintBox) placed.push(this.hintBox);
    placed.push(...fx.centreBoxes(ctx, this));
    this.drawLabels(game, list, t, placed);
    this.drawArrivalNotes(sim, placed);
    // the closure pills: beside their runways' thresholds, clear of the HUD, the radio ticker, the banner, the labels and notes
    // above, and of the planes where there is room (closures.js). Their boxes join `placed`, so the popups keep off them
    if (this.closures.list.length) {
      const ins = this.insets, u = this.hud;
      const planes = [];
      for (const a of list) {
        if (a.state !== 'fly' && a.state !== 'landing' && !a.ground) continue;
        const [x, y] = this.toScreen(a.x, a.y);
        planes.push({ x: x - 10 * u, y: y - 10 * u, w: 20 * u, h: 20 * u });
      }
      const hard = placed.filter((b) => b.hud);
      if (game.radioBox) hard.push(game.radioBox);
      if (this.bannerBox) hard.push(this.bannerBox);
      const bounds = { x0: ins.l + 4, y0: ins.t + 4, x1: this.cssW - ins.r - 4, y1: this.cssH - ins.b - 4 };
      const pills = this.closures.layoutPills(ctx, this.worldTransform, { dpr: this.dpr, u, bounds, hard, soft: placed.filter((b) => !b.hud).concat(planes) });
      drawClosurePills(ctx, pills, { dpr: this.dpr, u, banner: this.bannerBox });
      for (const p of pills) placed.push(p.box);
    }
    // the place names and taxiway signs: after the callsigns, notes and pills, so they keep off every one of them, the HUD and
    // each other, and off the aircraft themselves. A name with no room is dropped, not drawn over anything (drawPlaceLabels)
    this.drawPlaceLabels(game, placed, list);
    // popups over the callsigns, not under them, and finding room among them (and the names)
    fx.drawTexts(ctx, this, placed.filter((b) => !b.hud));
    if (fx.flash > 0.02) {
      ctx.fillStyle = `rgba(255,248,230,${fx.flash * 0.55})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (game.vignette > 0.01) this.drawVignette(game.vignette);
    if (game.desat > 0.02) {
      // bullet mode: drain the colour
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${0.85 * game.desat})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (game.postDesat && this.worldTransform) {
      // drawn after the colour drain so warnings stay red
      ctx.setTransform(this.worldTransform);
      game.postDesat(ctx, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.drawTape(ctx, game, t);
    this.speedLines(ctx, t);
    this.drawHud(game);
  }

  /**
   * Taxiway signs (black with yellow letters, like the real ones), from 2.2x zoom. `take(box)` says whether a sign's box has
   * room (drawPlaceLabels), and records it when it has: a sign with no room is not drawn.
   */
  drawTaxiSigns(take = () => true) {
    const w = this.world;
    if (!w || !w.L || this.view.zoom < 2.2) return;
    if (!w.taxiSigns) {
      // one sign per stretch of named taxiway, spaced so the same letter doesn't repeat close by
      w.taxiSigns = [];
      for (const tw of w.L.taxiways) {
        // real taxiway designators ("B", "K5", "WJ"), not stand numbers on the aprons
        if (!tw.ref || !/^[A-Z]{1,2}\d{0,2}$/i.test(tw.ref) || tw.pts.length < 2) continue;
        // the middle of the taxiway, or the nearest point to it that isn't on a runway
        const onRunway = (x, y) => w.runways.some((r) => {
          const dx = x - r.cx, dy = y - r.cy, c = Math.cos(r.angle), sn = Math.sin(r.angle);
          return Math.abs(dx * c + dy * sn) < r.length / 2 + 6 && Math.abs(-dx * sn + dy * c) < r.width / 2 + 7;
        });
        const mid = Math.floor(tw.pts.length / 2);
        let spot = null;
        for (let k = 0; k <= tw.pts.length && !spot; k++) {
          for (const i of [mid + k, mid - k]) {
            if (i < 0 || i >= tw.pts.length) continue;
            const p = w.toWorld(...tw.pts[i]);
            if (!onRunway(p[0], p[1])) {
              spot = p;
              break;
            }
          }
        }
        if (!spot) continue;
        const [x, y] = spot;
        if (w.taxiSigns.some((sg) => sg.ref === tw.ref && Math.hypot(sg.x - x, sg.y - y) < 90)) continue;
        w.taxiSigns.push({ ref: tw.ref.toUpperCase(), x, y });
      }
    }
    const ctx = this.ctx, d = this.dpr;
    // sized by the HUD scale, never below 8.5 px (they were 7 px on the smallest phones)
    const size = Math.max(8.5, 7.5 * this.hud), bh = size * 1.6;
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = Math.min(1, (this.view.zoom - 2.2) / 0.3);
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const sg of w.taxiSigns) {
      const [x, y] = this.groundToScreen(sg.x, sg.y);
      if (x < -20 || y < -10 || x > this.cssW + 20 || y > this.cssH + 10) continue;
      const tw = ctx.measureText(sg.ref).width + size * 0.8;
      const box = { x: x - tw / 2, y: y - bh / 2, w: tw, h: bh };
      if (!take(box)) continue;
      ctx.fillStyle = '#1d1d1b';
      ctx.fillRect(box.x, box.y, tw, bh);
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 1, box.y + 1, tw - 2, bh - 2);
      ctx.fillStyle = '#f7d046';
      ctx.fillText(sg.ref, x, y + 0.5);
    }
    ctx.restore();
  }

  /**
   * Place names: the terminal names (once zoomed in far enough to read the buildings) and the taxiway signs. They are the least
   * important labels on the screen, so each is drawn only where it has room: it keeps clear of every box in `placed` (the HUD's
   * blocks, the callsigns, the notes, the closure pills, the gate and fix names, the tutorial and the centre messages), of the
   * radio ticker and the banner, of the other names and signs, and of every aircraft's sprite. A name with no room is dropped,
   * never drawn over another label or a plane. The names that are drawn add their boxes to `placed`, for the popups after.
   */
  drawPlaceLabels(game, placed = [], list = []) {
    const u = this.hud;
    const keepOff = [...placed];
    if (game.radioBox) keepOff.push(game.radioBox);
    if (this.bannerBox) keepOff.push(this.bannerBox);
    const planes = this.aircraftBoxes(list);
    const take = (box) => {
      if (keepOff.some((b) => overlaps(box, b, 2 * u)) || planes.some((p) => overlaps(box, p))) return false;
      keepOff.push(box);
      placed.push(box);
      return true;
    };
    // the terminal names first: they are the labels a player reads, the taxiway signs fill the room left (they come in at 2.2x)
    this.drawTerminalNames(take);
    this.drawTaxiSigns(take);
  }

  /** The terminal names, from 1.4x zoom: each through `take`, so a name with no room is not drawn (drawPlaceLabels). */
  drawTerminalNames(take) {
    const u = this.hud;
    const w = this.world;
    const names = w && w.L && w.L.terminalNames;
    if (!names || !names.length || this.view.zoom < 1.4) return;
    const ctx = this.ctx, d = this.dpr;
    const a = Math.min(1, (this.view.zoom - 1.4) / 0.35);
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.font = `700 ${9 * u}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.globalAlpha = a * 0.9;
    for (const tn of names) {
      const [wx, wy] = w.toWorld(tn.x, tn.y);
      const [x, y] = this.groundToScreen(wx, wy);
      if (x < -40 || y < -10 || x > this.cssW + 40 || y > this.cssH + 10) continue;
      const text = tn.name.toUpperCase();
      const tw = ctx.measureText(text).width + 4;
      const box = { x: x - tw / 2, y: y - 6 * u, w: tw, h: 12 * u };
      if (!take(box)) continue; // no room: dropped
      ctx.strokeStyle = 'rgba(40,40,36,0.55)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#fff6e3';
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  /** Each aircraft's sprite as a box in CSS px, at the place its label is drawn from (its blip, when it has one). */
  aircraftBoxes(list) {
    const s = this.scale / this.dpr, u = this.hud, out = [];
    for (const a of list) {
      const pos = a.blip ? a.blip : a;
      const [x, y] = this.toScreen(pos.x, pos.y);
      const c = CLASSES[a.cls];
      const r = Math.max(8 * u, (c ? c.size : 20) * SPRITE_SCALE * s * 0.6);
      out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
    }
    return out;
  }

  /**
   * Callsigns (and LIVE dots) in screen space so they stay readable at any zoom, sized by the HUD scale.
   * Above-right of the aircraft; under it at the top edge and to its left at the right edge, so none is cut
   * off. `placed` starts with the HUD's blocks, the place names, the gate and fix names, the tutorial hint and
   * the centre messages: a label that would overlap one of those or another label steps down a line, one that
   * would go under the HUD or a centre message drops below that block instead.
   */
  drawLabels(game, list, t, placed = this.hudBoxes()) {
    const ctx = this.ctx;
    const d = this.dpr;
    const u = this.hud;
    const ins = this.insets;
    const line = 11 * u;
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.font = `600 ${Math.max(9.5, 9.75 * u)}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    const s = this.scale / d;
    this.labelBoxes = []; // where they went, for the radio ticker to see through (main.js)
    for (const a of list) {
      if (!(a.state === 'fly' || a.ground) || a.alpha < 0.3) continue;
      // on the ground, only aircraft waiting for a tap get a label (taxiing traffic stays quiet)
      if (a.ground && !(a.departure && a.departure.prompt)) continue;
      const pos = a.blip ? a.blip : a;
      const [x, y] = this.toScreen(pos.x, pos.y);
      if (x < -60 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      const off = CLASSES[a.cls].size * SPRITE_SCALE * s * 0.62 + 4;
      // a real flight is labelled with its flight number (and the red dot says it is real); a simulated one has no
      // name: only what it needs (an emergency, its holding altitude, a stage prompt)
      let text = a.live ? a.label || a.callsign : '';
      if (a.emergency && a.emergency.tag) text = joinLabel(text, a.emergency.tag);
      if (a.stack) text = joinLabel(text, `${(5 + a.stack.level).toLocaleString('en-US')},000`);
      const prompt = labelPrompt(a);
      if (!text && !prompt) continue; // nothing to say: no label and no box
      const lw = (text ? ctx.measureText(text).width + (a.live ? 8 * u : 0) : ctx.measureText(prompt).width), lh = text && prompt ? line * 2 : line;
      let lx = x + off * 0.55;
      let ly = y - off;
      if (ly - 6 * u < ins.t + 4) ly = y + off;
      if (lx + lw > this.cssW - ins.r - 4) lx = x - off * 0.55 - lw;
      lx = Math.max(lx, ins.l + 4);
      ly = Math.min(ly, this.cssH - ins.b - 4 - lh + 6 * u); // an arrival still below the bottom edge
      const box = { x: lx, y: ly - 6 * u, w: lw, h: lh };
      // the box moves, and the text follows: set to the block's bottom exactly, it clears it (computed back from
      // the text's middle it came out a hair inside, and the steps went on that block, not the next label). Half
      // an em apart along a line, so two labels side by side read as two. Over the wind compass it goes up
      // instead, to just above it, and steps up past other labels from there.
      let step = line;
      for (let k = 0, b; k < 4 && (b = placed.find((p) => overlaps(box, p, 5 * u))); k++) {
        if (b.bottom) {
          box.y = Math.min(box.y, b.y - box.h);
          step = -line;
        } else box.y = b.hud ? Math.max(y + off - 6 * u, b.y + b.h) : box.y + step;
      }
      ly = box.y + 6 * u;
      placed.push(box);
      this.labelBoxes.push(box);
      ctx.lineWidth = 2.5 + u;
      ctx.strokeStyle = 'rgba(20,28,32,0.65)';
      let tx = lx;
      if (a.live) {
        // every real plane has the one look (requirements item 1): a solid red dot that pulses, whether it is confirmed
        // landing here or still in the area. The flight number is its label; simulated planes have neither
        const pulse = 0.65 + 0.35 * Math.sin(t * 4 + a.id);
        ctx.fillStyle = `rgba(255,70,60,${pulse})`;
        ctx.beginPath();
        ctx.arc(lx + 3 * u, ly, 3 * u, 0, TAU);
        ctx.fill();
        tx += 8 * u;
      }
      if (text) {
        ctx.strokeText(text, tx, ly);
        ctx.fillStyle = a.emergency ? '#ffd2c8' : a.departure ? '#d6f0ff' : 'rgba(255,250,240,0.95)';
        ctx.fillText(text, tx, ly);
      }
      if (prompt) {
        ctx.fillStyle = '#ffe39a';
        const py = text ? ly + line : ly; // the prompt takes the line under the name, or the line itself
        ctx.strokeText(prompt, tx, py);
        ctx.fillText(prompt, tx, py);
      }
    }
    ctx.restore();
  }

  /** A real plane's arrival note, from now (routes.js): it touched down at game time `simTime` and stays ARRIVAL_NOTE_S. */
  noteArrival(a, text, simTime) {
    this.arrivalNotes.push({ a, text, from: simTime, until: simTime + ARRIVAL_NOTE_S });
  }

  /** The notes belong to one game: a new game, the menu's backdrop or a rewind clears them (main.js). */
  clearArrivalNotes() {
    this.arrivalNotes = [];
  }

  /**
   * The arrival notes, beside their planes (a note follows its plane along the roll), after the callsigns so they keep clear of
   * them and of the HUD. Display only: it reads the planes and the game time, and writes nothing back into the sim.
   */
  drawArrivalNotes(sim, placed) {
    const now = sim.time;
    this.arrivalNotes = this.arrivalNotes.filter((n) => now < n.until);
    if (!this.arrivalNotes.length) return;
    const ctx = this.ctx;
    const d = this.dpr;
    const u = this.hud;
    const s = this.scale / d;
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const px = Math.max(10.5, 11 * u);
    ctx.font = `600 ${px}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // the bodies of the planes on screen, and the Live feed line: a note keeps off them (placeNote, 2.8 fix 5)
    const avoid = [];
    for (const p of sim.aircraft || []) {
      if (p.state !== 'fly' && p.state !== 'landing' && !p.ground) continue;
      const [px, py] = this.toScreen(p.x, p.y);
      const r = CLASSES[p.cls].size * SPRITE_SCALE * s * 0.6;
      avoid.push({ x: px - r, y: py - r, w: 2 * r, h: 2 * r });
    }
    if (this.feedZone) avoid.push(this.feedZone);
    for (const n of this.arrivalNotes) {
      if (now < n.from) continue;
      const a = n.a;
      const [x, y] = this.toScreen(a.x, a.y);
      if (x < -60 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      const off = CLASSES[a.cls].size * SPRITE_SCALE * s * 0.62 + 4; // as a callsign's, so the note sits where one would
      const pad = 7 * u;
      const w = ctx.measureText(n.text).width + pad * 2;
      const h = px + 8 * u;
      const box = placeNote(x, y, off, w, h, { cssW: this.cssW, cssH: this.cssH, ins: this.insets, u, placed, avoid });
      ctx.globalAlpha = noteAlpha(n.until - now);
      ctx.fillStyle = 'rgba(20,28,32,0.72)';
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, w, h, 7 * u);
      ctx.fill();
      ctx.fillStyle = '#fff3d0';
      ctx.fillText(n.text, box.x + pad, box.y + h / 2);
      placed.push(box); // the next note, and the popups, keep clear of this one
    }
    ctx.restore();
  }

  /** Runways an arrival is about to land on while they're still occupied: flash red. */
  drawRunwayWarnings(ctx, sim, t) {
    if (sim.over) return;
    for (const z of sim.zones) {
      if (!z.busyWarn) continue;
      ctx.save();
      ctx.translate(z.cx, z.cy);
      ctx.rotate(z.angle);
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 14);
      ctx.strokeStyle = '#ff4b3a';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(-z.length / 2 - 4, -z.width / 2 - 4, z.length + 8, z.width + 8);
      ctx.restore();
    }
  }

  drawZoneHints(ctx, sim, t, hinted = null) {
    // while a path is being drawn (or the tutorial points at an aircraft), pulse every landing zone it may use
    const drawing = sim.aircraft.filter((a) => (a.drawing || a === hinted) && a.state === 'fly' && !a.departure);
    if (!drawing.length) return;
    const pulse = 0.45 + 0.35 * Math.sin(t * 7);
    for (const z of sim.zones) {
      if (!drawing.some((a) => sim.usable(a, z))) continue;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#fff7d6';
      ctx.lineWidth = 2.5;
      if (z.kind === 'pad') {
        ctx.beginPath();
        ctx.arc(z.cx, z.cy, z.r + 8, 0, TAU);
        ctx.stroke();
      } else {
        ctx.translate(z.thx, z.thy);
        ctx.rotate(z.angle);
        const w = z.width / 2 + 7;
        ctx.beginPath();
        ctx.moveTo(z.length * 0.45, -w);
        ctx.lineTo(-10, -w);
        ctx.arc(-10, 0, w, -Math.PI / 2, Math.PI / 2, true);
        ctx.lineTo(z.length * 0.45, w);
        ctx.stroke();
        // the approach, as on a chart: extended centreline and localizer "feathers"
        const L = 150;
        ctx.globalAlpha = 0.35 + pulse * 0.5;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -t * 18;
        ctx.beginPath();
        ctx.moveTo(-w - 12, 0);
        ctx.lineTo(-w - 12 - L, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.12 + pulse * 0.16;
        ctx.fillStyle = '#fff7d6';
        ctx.beginPath();
        ctx.moveTo(-w - 12, 0);
        ctx.lineTo(-w - 12 - L, -L * 0.2);
        ctx.lineTo(-w - 12 - L, L * 0.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** One CSS px at the HUD scale, in world units at the current zoom: paths never get thinner than that on screen. */
  get hudPx() {
    return (this.hud * this.dpr) / this.scale;
  }

  /**
   * The tail's handle (2.6, drawTail) replaces the end ring of a free path that is not being drawn; the other paths are as before.
   * tail: { held } for a tail (sim.tailOf), else null.
   */
  drawPath(ctx, a, t, tail = null) {
    const p = a.path;
    const locked = a.target != null;
    const col = ZONE_COLORS[CLASSES[a.cls].color];
    const px = this.hudPx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[a.pathIdx].x, p[a.pathIdx].y);
    for (let i = a.pathIdx + 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    const dash = [Math.max(4.5, 4 * px), Math.max(6.5, 5.5 * px)];
    ctx.setLineDash(dash);
    ctx.lineDashOffset = a.pathIdx * TUNING.pathMinSpacing + (a.pathBase || 0);
    ctx.strokeStyle = 'rgba(20,30,35,0.35)';
    ctx.lineWidth = Math.max(5, 4.6 * px);
    ctx.stroke();
    // a locked path glows: a faint halo three times the line's width, under the line (not under reduced motion)
    if (locked && !this.motionState().reduced) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = col.light;
      ctx.lineWidth = Math.max(8.4, 7.8 * px);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash(dash);
    }
    ctx.strokeStyle = locked ? col.light : a.departure ? '#bfe6ff' : 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(2.8, 2.6 * px);
    ctx.stroke();
    ctx.setLineDash([]);
    const e = p[p.length - 1];
    if (tail) {
      this.drawTail(ctx, a, e, tail.held, px);
    } else if (!locked && !a.loop) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, 1.8 * px);
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(4, 5 * px), 0, TAU);
      ctx.stroke();
    } else if (locked) {
      const k = (t * 1.6) % 1;
      ctx.strokeStyle = col.light;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 5 + k * 12, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A tail's handle (2.6): a white disc with a dark edge at the path's end, which a finger may take. While a finger holds it, the disc
   * is the plane's colour with a halo. The sizes are CSS px at the HUD scale (px), so it is the same size on the screen at any zoom.
   */
  drawTail(ctx, a, e, held, px) {
    const col = ZONE_COLORS[CLASSES[a.cls].color];
    const r = Math.max(4.5, 5 * px);
    ctx.save();
    if (held) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = col.light;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + Math.max(4, 5 * px), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(20,30,35,0.55)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + Math.max(1, 1.2 * px), 0, TAU);
    ctx.fill();
    ctx.fillStyle = held ? col.light : '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawLoop(ctx, a, t) {
    const p = a.loop;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    const px = this.hudPx;
    ctx.setLineDash([Math.max(3, 2.7 * px), Math.max(7, 6 * px)]);
    ctx.lineDashOffset = -t * 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,30,35,0.3)';
    ctx.lineWidth = Math.max(4, 3.7 * px);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,235,0.8)';
    ctx.lineWidth = Math.max(2, 1.85 * px);
    ctx.stroke();
    ctx.restore();
  }

  drawHold(ctx, a, t) {
    const h = a.hold;
    const px = this.hudPx;
    ctx.save();
    ctx.setLineDash([Math.max(3, 2.7 * px), Math.max(6, 5.2 * px)]);
    ctx.lineDashOffset = -t * 12 * h.side;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,30,35,0.3)';
    ctx.lineWidth = Math.max(4, 3.7 * px);
    ctx.beginPath();
    ctx.arc(h.cx, h.cy, h.r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,235,0.85)';
    ctx.lineWidth = Math.max(2, 1.85 * px);
    ctx.stroke();
    ctx.restore();
  }

  rotor(a) {
    if (a.state === 'landing') return Math.max(0.15, 1 - a.landT / CLASSES[a.cls].landTime);
    if (a.ground) return 0.3;
    return 1;
  }

  drawShadow(ctx, a, t, alt) {
    const def = CLASSES[a.cls];
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.translate(a.x + 7 * alt, a.y + 9 * alt);
    ctx.rotate(a.visHeading);
    const sc = a.scale * (0.92 + 0.08 * (1 - alt)) * SPRITE_SCALE;
    ctx.scale(sc, sc);
    this.blitSprite(ctx, def, 'rgba(15,25,20,0.22)');
    drawSpinners(ctx, def.sprite, t + a.id, 'rgba(15,25,20,0.22)', this.rotor(a));
    ctx.restore();
  }

  drawBody(ctx, a, t) {
    const def = CLASSES[a.cls];
    const bank = this.bankOf(a);
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.translate(a.x, a.y);
    ctx.rotate(a.visHeading + (a.tumble || 0));
    let k = a.scale * SPRITE_SCALE;
    if (a.popT !== undefined) {
      const e = this.clock - a.popT;
      if (e < 0.3) k *= 1 + 0.16 * Math.sin((e / 0.3) * Math.PI);
    }
    // banked: the span (the sprite's y) narrows a little, seen from above, and the lee wing takes a shade
    ctx.scale(k, k * (1 - 0.12 * Math.abs(bank)));
    this.blitSprite(ctx, def, null);
    const lee = leeShade(bank);
    if (lee > 0) {
      ctx.save();
      ctx.globalAlpha *= lee;
      ctx.beginPath();
      ctx.rect(-40, bank > 0 ? -40 : 0, 80, 40);
      ctx.clip();
      this.blitSprite(ctx, def, 'rgba(15,25,20,0.28)');
      ctx.restore();
    }
    // the airline's colour on the tail fin (seen from above, a stripe along the tail): real flights only
    if (a.live && a.tail === undefined) a.tail = tailColor(a.callsign);
    const fin = a.live && a.tail && FIN[def.sprite];
    if (fin) {
      ctx.fillStyle = a.tail;
      ctx.fillRect(fin[0], -fin[2], fin[1] - fin[0], fin[2] * 2);
    }
    drawSpinners(ctx, def.sprite, t + a.id, null, this.rotor(a));
    ctx.restore();
  }

  /** Cached bitmap of the aircraft body at the current on-screen resolution. */
  blitSprite(ctx, def, shadow) {
    // resolution follows the view only; per-aircraft scale/pop is applied by ctx.scale
    const px = Math.min(12, this.scale * (this.camZoom || 1) * SPRITE_SCALE);
    const img = spriteBitmap(def.sprite, def.color, shadow, px);
    if (!img) {
      drawAircraftShape(ctx, def.sprite, def.color, null, shadow, 1);
      return;
    }
    ctx.drawImage(img, -img.unit, -img.unit, img.unit * 2, img.unit * 2);
  }

  drawAircraft(ctx, a, t, alt) {
    this.drawShadow(ctx, a, t, alt);
    this.drawBody(ctx, a, t);
  }

  drawWreck(ctx, a) {
    const def = CLASSES[a.cls];
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.visHeading + a.landT * 0.6 * (a.id % 2 ? 1 : -1));
    const sc = Math.max(0.75, 1 - a.landT * 0.15) * SPRITE_SCALE;
    ctx.scale(sc, sc);
    drawAircraftShape(ctx, def.sprite, def.color, 0, 'rgba(45,38,34,0.92)', 0);
    ctx.restore();
  }

  drawNavLights(ctx, a, t, night) {
    const def = CLASSES[a.cls];
    const tips = NAV_TIPS[def.sprite] || NAV_TIPS.liner;
    const k = a.scale * SPRITE_SCALE;
    const c = Math.cos(a.visHeading), s = Math.sin(a.visHeading);
    const at = (lx, ly) => [a.x + (lx * c - ly * s) * k, a.y + (lx * s + ly * c) * k];
    ctx.save();
    ctx.globalAlpha = a.alpha * night;
    ctx.globalCompositeOperation = 'lighter';
    const dot = (x, y, col, r) => {
      ctx.fillStyle = `rgba(${col},0.22)`;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},1)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    const [lx, ly] = at(tips[0], -tips[1]);
    const [rx, ry] = at(tips[0], tips[1]);
    dot(lx, ly, '255,60,50', 1.6);
    dot(rx, ry, '60,255,120', 1.6);
    if ((t * 1.1 + a.id * 0.37) % 1 < 0.08) {
      const [bx, by] = at(0, 0);
      dot(bx, by, '255,255,255', 2.4);
    }
    const onApproach = (a.state === 'fly' && a.target != null && !a.exit && !a.departure) || a.state === 'landing';
    if (onApproach) {
      // landing lights: a beam reaching ahead of the nose on final and through the roll-out
      const [x0, y0] = at(tips[2], 0);
      const [x1, y1] = at(tips[2] + 55, -16);
      const [x2, y2] = at(tips[2] + 55, 16);
      const [xf, yf] = at(tips[2] + 55, 0);
      const g = ctx.createLinearGradient(x0, y0, xf, yf);
      g.addColorStop(0, 'rgba(255,246,220,0.34)');
      g.addColorStop(1, 'rgba(255,246,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
      dot(x0, y0, '255,250,235', 1.4);
    } else if (a.state === 'fly') {
      const [nx, ny] = at(tips[2] + 16, 0);
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, 16 * k);
      g.addColorStop(0, 'rgba(255,240,200,0.2)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(nx - 16 * k, ny - 16 * k, 32 * k, 32 * k);
    }
    ctx.restore();
  }

  drawProx(ctx, a, t) {
    const r = CLASSES[a.cls].radius + TUNING.warnExtra / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 16);
    ctx.save();
    ctx.strokeStyle = `rgba(255,70,50,${0.55 + 0.4 * pulse})`;
    ctx.lineWidth = 2.5 + pulse;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,70,50,${0.1 + 0.08 * pulse})`;
    ctx.fill();
    ctx.restore();
  }

  drawSelect(ctx, a, t) {
    const c = ZONE_COLORS[CLASSES[a.cls].color];
    ctx.save();
    ctx.strokeStyle = c.light;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, CLASSES[a.cls].size + 4 + Math.sin(t * 10) * 1.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawWarning(ctx, w, t) {
    const def = CLASSES[w.cls];
    const c = ZONE_COLORS[def.color];
    const k = 1 - w.timer / w.total;
    const blink = 0.55 + 0.45 * Math.sin(t * 12);
    ctx.save();
    ctx.translate(w.wx, w.wy);
    ctx.fillStyle = 'rgba(20,28,32,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = w.live ? '#ff5a4a' : c.main;
    ctx.globalAlpha = blink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.rotate(w.heading);
    ctx.scale(0.5, 0.5);
    drawAircraftShape(ctx, def.sprite, def.color, t, null);
    ctx.restore();
  }

  /**
   * The tutorial's bubble: in world space but sized in CSS px at the HUD scale (`cssScale` takes out the zoom),
   * so it reads the same on any screen and at any zoom. Under the aircraft, since its label goes above; one
   * line lower when that label flips under it at the top edge; over it only at the bottom edge.
   */
  drawHint(ctx, h, t) {
    const k = cssScale(ctx);
    const px = this.hud / k; // one CSS px at the HUD scale, in world units
    const ins = this.insets;
    ctx.save();
    ctx.font = `700 ${Math.max(13, 14 * this.hud) / k}px ${FONT}`;
    const w = ctx.measureText(h.text).width + 22 * px, bh = 26 * px;
    // the part of the world on screen, inside the insets
    const [x0, y0] = this.toWorld(ins.l, ins.t), [x1, y1] = this.toWorld(this.cssW - ins.r, this.cssH - ins.b);
    const x = clamp(h.x, x0 + w / 2 + 8 * px, x1 - w / 2 - 8 * px);
    const half = (h.aircraft ? CLASSES[h.aircraft.cls].size : 22) * SPRITE_SCALE * 0.62;
    const gap = half + 8 * px + bh / 2;
    // where drawLabels puts this aircraft's label (top-edge flip included)
    const s = this.scale / this.dpr;
    const labelUnder = this.toScreen(h.x, h.y)[1] - (half * s + 4) - 6 * this.hud < ins.t + 4;
    const below = h.y + gap + (labelUnder ? 12 * px : 0);
    let y = below + bh / 2 > y1 - 6 * px ? Math.max(y0 + bh / 2, h.y - gap - 14 * px) : below;
    // clear of the HUD's blocks (an arrival coming in under the title): below the block, a line further down
    // than the aircraft's label, which drops there too. The box, in CSS px, is for the callsigns to keep clear of.
    const box = () => {
      const [sx, sy] = this.toScreen(x, y);
      return { x: sx - (w / 2) * k, y: sy - (bh / 2 + 3 * px) * k, w: w * k, h: (bh + 6 * px) * k };
    };
    for (let i = 0, b; i < 3 && (b = this.hudBoxes().find((q) => overlaps(box(), q))); i++) {
      // over the wind compass: above it, with room for the aircraft's label between
      if (b.bottom) y = this.toWorld(0, b.y - 15 * this.hud)[1] - bh / 2 - 3 * px;
      else y = this.toWorld(0, b.y + b.h + 15 * this.hud)[1] + bh / 2;
    }
    this.hintBox = box();
    y += Math.sin(t * 4) * 2.5 * px;
    ctx.fillStyle = 'rgba(255,250,235,0.96)';
    ctx.strokeStyle = 'rgba(30,40,45,0.5)';
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - bh / 2, w, bh, 13 * px);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#26363d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(h.text, x, y + px);
    ctx.restore();
  }

  drawVignette(k) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)');
    g.addColorStop(1, `rgba(150,10,0,${0.45 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ------------------------------------------------------------------ HUD

  /**
   * The HUD's fixed measures at this screen's scale, in CSS px: margin, top-left corner, text sizes, button
   * radius and gap, and the wind compass's right edge as it usually is (weather.drawHud: its disc on the HUD
   * margin, then '000° 00 kt', 4.7 em). Inside the screen's cutout insets, or `ins`.
   */
  hudMetrics(ins = this.insets) {
    return hudMetricsFor(this.hud, ins);
  }

  /**
   * Where everything in the HUD goes this frame, in CSS px, without drawing it. drawHud draws from it, and
   * main.js turns its edges into CSS variables so the toast, ticker and pop-ups keep clear of it.
   */
  hudLayout(game) {
    const ctx = this.ctx;
    const { u, m, left, top, small, mixSize, br, gap } = this.hudMetrics();
    const ins = this.insets;
    const streak = game.sim ? game.sim.streak : 0;
    const g = { m, left, top, cx: this.cssW / 2, small, mixSize, streak };

    // score block (top left): SCORE, the number, then BEST and the streak when there are any
    const width = (str, size) => {
      ctx.font = `700 ${size}px ${FONT}`;
      return ctx.measureText(str).width;
    };
    let right = Math.max(left + 2 + width('SCORE', small), left + width(String(game.displayScore), 30 * u));
    let bottom = top + 45 * u;
    if (game.best > 0) {
      g.bestY = top + 52 * u;
      right = Math.max(right, left + 2 + width(`BEST ${game.best}`, small));
      bottom = g.bestY + small / 2;
    }
    if (streak >= 2) {
      g.streakY = top + (game.best > 0 ? 66 : 52) * u;
      right = Math.max(right, left + 2 + width(`${streak} IN A ROW`, small));
      bottom = g.streakY + small / 2;
    }
    g.scoreRight = right;
    g.scoreBottom = bottom;

    // buttons (top right): pause, fast-forward, and rewind once it's earned
    g.br = br;
    g.btnY = top + br;
    g.pauseX = this.cssW - m - ins.r - br;
    g.ffX = g.pauseX - br * 2 - gap;
    g.rewindX = game.rewindAvailable ? g.ffX - br * 2 - gap : null;
    g.btnLeft = (g.rewindX ?? g.ffX) - br;
    g.btnBottom = top + br * 2;
    g.compassRight = null; // filled in by hudExtra (the wind compass) when it draws

    // centre: airport + local time, traffic mix (with the feed's dot), feed banner. The mix is centred, so on a narrow phone
    // a long line runs under the fast-forward and pause buttons (live capture, 360 dp: the end was hidden). Then it drops to
    // the row beneath the buttons, and the banner stacks under it. Elsewhere the rows stay where they were
    // the line is written in full when it fits between the score block and the buttons, else in short; if the short
    // one still runs under the buttons, the line drops to the row beneath them (its words are the same)
    const dotW = game.mixDot ? 14 * u : 0; // the coloured dot and its gap
    const clear = (str) => {
      const half = (width(str, mixSize) + dotW) / 2;
      return g.cx - half >= (g.scoreRight ?? left) + 8 * u && g.cx + half <= g.btnLeft - 8 * u;
    };
    g.mixY = top + 25 * u;
    g.mixText = '';
    if (game.mix) {
      if (clear(game.mix.full)) g.mixText = game.mix.full;
      else {
        g.mixText = game.mix.short;
        if (!clear(game.mix.short)) g.mixY = g.btnBottom + 9 * u;
      }
    }
    const mixW = g.mixText ? width(g.mixText, mixSize) + dotW : 0;
    g.bannerY = game.mix ? g.mixY + 18.8 * u : top + 43.8 * u;
    g.centreBottom = game.banner ? g.bannerY + 11.2 * u : game.mix ? g.mixY + 6 * u : game.title ? top + 17 * u : top;
    g.centreHalf = Math.max(
      game.title ? width(game.title, 13 * u) : 0,
      mixW,
      game.banner ? width(game.banner, mixSize) + 22 * u : 0,
    ) / 2;
    return g;
  }

  /**
   * The radio ticker's own scale (its text is 13 px times it): the HUD's, unless the room either side of centre,
   * clear of the wind compass, is too narrow at that size for a 'cleared to land' call on one line (35.5 em with
   * its badge and padding). Then it steps down to fit, as on 4:3 tablets and a foldable's inner screen, though
   * never below the reference phone's 13 px (the smallest phones keep the HUD's, and wrap that call). From the
   * screen alone, so it holds still while the gusts widen the compass.
   */
  tickerScale() {
    const { u, gap, compassEdge } = this.hudMetrics();
    return clamp((this.cssW - 2 * (compassEdge + gap)) / (35.5 * 13), Math.min(u, 1), u);
  }

  /**
   * How far the radio ticker keeps from either side of the screen, in CSS px: it is centred, and as wide as its
   * call up to there (style.css .radio, through main.js). Clear of the wind compass on the left and as far from
   * the right edge, and short of anything at the bottom edge that reaches into its band, `height` px tall (the
   * call showing, two lines at least): the departure gates and the map names (gate and fix names). Whatever is
   * there it keeps half its room: the gates and fixes keep out of the middle (hudRectsWorld). All as they sit at
   * fit zoom, where the camera rests: they're fixed in the world, so the lane holds still while the player
   * pinches and pans, and a call doesn't re-wrap under their fingers. Null while the HUD is hidden.
   */
  tickerLane(gates = [], height = 0) {
    const g = this.hudGeom;
    if (!g || g.compassRight == null) return null;
    const u = this.hud, mid = this.cssW / 2, gap = 6 * u;
    const { W, H } = this.airspace, f = this.fit, k = f / this.dpr; // CSS px per world unit at fit zoom
    const bottom = this.cssH - this.insets.b, top = bottom - 10 * u - Math.max(height, 45.5 * this.tick);
    const room = mid - g.compassRight - 12 * u; // half of it: clear of the compass and its mirror image
    let half = room;
    // a box from x0 to x1 that reaches into the band: the ticker ends short of it, on both sides
    const keep = (x0, x1) => {
      half = Math.min(half, x1 < mid ? mid - x1 - gap : x0 > mid ? x0 - mid - gap : 0);
    };
    for (const e of gates) {
      const x = (this.canvas.width / 2 + (e.x - W / 2) * f) / this.dpr, y = (this.canvas.height / 2 + (e.y - H / 2) * f) / this.dpr;
      const r = e.r * k, dy = Math.max(0, top - y, y - bottom);
      if (dy < r) keep(x - Math.sqrt(r * r - dy * dy), x + Math.sqrt(r * r - dy * dy)); // as wide as it is in the band
    }
    for (const b of this.fitMapBoxes || []) if (b.y < bottom && b.y + b.h > top) keep(b.x, b.x + b.w);
    return { side: mid - Math.max(half, room / 2) };
  }

  /**
   * The HUD's blocks where it sat last frame (score, buttons, title, and the wind compass down at the bottom
   * left), in CSS px, as boxes that labels and place names keep out of. None while the HUD is hidden. The
   * compass's is `bottom`: what it pushes away goes up, over it, not down off the screen.
   */
  hudBoxes() {
    const g = this.hudGeom;
    if (!g) return [];
    const u = this.hud, p = 4 * u;
    const boxes = [
      { x: 0, y: 0, w: g.scoreRight + p, h: g.scoreBottom + p, hud: true },
      { x: g.btnLeft - p, y: 0, w: this.cssW - g.btnLeft + p, h: g.btnBottom + p, hud: true },
    ];
    if (g.centreHalf) boxes.push({ x: g.cx - g.centreHalf - p, y: 0, w: (g.centreHalf + p) * 2, h: g.centreBottom + p, hud: true });
    if (g.compassRight != null) {
      // weather.drawHud: the disc (radius 20u) centred 34u in from the corner, its wind line beside it
      const top = this.cssH - this.insets.b - 54 * u - p;
      boxes.push({ x: 0, y: top, w: g.compassRight + p, h: this.cssH - top, hud: true, bottom: true });
    }
    // the radio ticker at the bottom edge (main.js syncRadioBox, while it shows): labels and notes go up past it, not under it
    if (this.radioBox) boxes.push(this.radioBox);
    return boxes;
  }

  /** The HUD's keep-out boxes on this screen, in a W by H world (hudRectsFor says what they are and why). */
  hudRectsWorld(W, H) {
    return hudRectsFor(W, H, this.cssW, this.cssH, this.hud);
  }

  drawHud(game) {
    const ctx = this.ctx;
    const d = this.dpr;
    const u = this.hud;
    this.buttons = {};
    this.hudGeom = null;
    this.feedZone = null;
    this.bannerBox = null; // where the banner sits this frame, for the closure pills' pointers (the next frame reads it)
    if (!game.showHud) return;
    const g = this.hudLayout(game);
    const { left, top, cx } = g;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const pop = 1 + game.scorePop * 0.35;
    const text = (str, x, y, size, color = '#fffaf0', weight = 700, align = 'left') => {
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.lineWidth = Math.max(2.5, size * 0.16);
      ctx.strokeStyle = 'rgba(20,30,35,0.6)';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    };
    ctx.textBaseline = 'middle';
    text('SCORE', left + 2, top + 8 * u, g.small, 'rgba(255,250,235,0.9)');
    ctx.save();
    ctx.translate(left, top + 30 * u);
    ctx.scale(pop, pop);
    text(String(game.displayScore), 0, 0, 30 * u);
    ctx.restore();
    if (g.bestY) text(`BEST ${game.best}`, left + 2, g.bestY, g.small, 'rgba(255,250,235,0.85)');
    if (g.streakY) text(`${g.streak} IN A ROW`, left + 2, g.streakY, g.small, g.streak >= 5 ? '#ffe39a' : 'rgba(255,250,235,0.85)');

    if (game.title) text(game.title, cx, top + 9 * u, 13 * u, '#fffaf0', 700, 'center');
    // the feed's zone for the Live feed card: the mix line (with 12 px either side and at least 44 px tall), down to the
    // banner when one shows. main.js opens the card on a tap inside it (canvas pointerdown, after the planes)
    if (g.mixText) {
      // the coloured dot (the feed's state) before the mix line; the pair is centred
      ctx.font = `600 ${g.mixSize}px ${FONT}`;
      const dot = game.mixDot ? 14 * u : 0, x0 = cx - (ctx.measureText(g.mixText).width + dot) / 2;
      if (game.mixDot) {
        ctx.beginPath();
        ctx.arc(x0 + 4 * u, g.mixY, 4 * u, 0, TAU);
        ctx.fillStyle = game.mixDot;
        ctx.fill();
      }
      text(g.mixText, x0 + dot, g.mixY, g.mixSize, 'rgba(255,250,235,0.9)', 600, 'left');
      const w = ctx.measureText(g.mixText).width + dot + 24; // the line, 12 px either side
      const top0 = g.mixY - 12 * u, bottom = game.banner ? g.bannerY + 11.2 * u : g.mixY + 12 * u;
      const h = Math.max(44, bottom - top0); // at least 44 px tall, centred on the line when there is no banner
      this.feedZone = { x: cx - w / 2, y: (top0 + bottom) / 2 - h / 2, w, h };
    }
    if (game.banner) {
      // the arrival rush's banner (the heads-up and the push) beats; reduced motion holds it still
      const rush = !this.motionState().reduced && /^Arrival rush/.test(game.banner);
      const beat = rush ? pulseAt(this.clock || 0, RUSH_HZ) : 0;
      ctx.save();
      if (rush) {
        ctx.translate(cx, g.bannerY);
        ctx.scale(1 + 0.04 * beat, 1 + 0.04 * beat);
        ctx.translate(-cx, -g.bannerY);
        ctx.globalAlpha = 0.85 + 0.15 * beat;
      }
      ctx.font = `700 ${g.mixSize}px ${FONT}`;
      const bw = ctx.measureText(game.banner).width + 22 * u;
      ctx.fillStyle = 'rgba(30,40,45,0.72)';
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, g.bannerY - 9.8 * u, bw, 19 * u, 9.5 * u);
      ctx.fill();
      this.bannerBox = { x: cx - bw / 2, y: g.bannerY - 9.8 * u, w: bw, h: 19 * u };
      ctx.fillStyle = '#ffe39a';
      ctx.textAlign = 'center';
      ctx.fillText(game.banner, cx, g.bannerY);
      ctx.restore();
    }

    const { br, btnY: by } = g;
    const hit = br + 6 * u;
    const mo = this.motionState();
    const t = this.clock || 0;
    // seconds since a canvas button was pressed (null when it was not, or not lately)
    const since = (name) => (mo.press[name] != null && t >= mo.press[name] && t - mo.press[name] < RIPPLE_S ? t - mo.press[name] : null);
    this.buttons.pause = { x: g.pauseX, y: by, r: hit };
    this.buttons.ff = { x: g.ffX, y: by, r: hit };
    // the pause button: two bars, which morph into the play triangle while the game is paused (and back on resume)
    this.roundButton(ctx, g.pauseX, by, br, false, (c) => this.morphIcon(c, u, mo.k), { press: since('pause') });
    // fast-forward: the chevrons sweep forward while it is on, the button glows, and they slow to a stop when it goes off
    const glow = game.fast && !mo.reduced ? 14 * u * (0.6 + 0.4 * pulseAt(t, 1.2)) : 0;
    this.roundButton(ctx, g.ffX, by, br, game.fast, (c) => this.ffIcon(c, u, mo), { press: since('ff'), glow });
    if (g.rewindX != null) {
      this.buttons.rewind = { x: g.rewindX, y: by, r: hit };
      // the arrow spins backwards on use; once spent it stays, dimmed, with a grey wipe that runs clockwise
      const spun = mo.rewindAt != null && t >= mo.rewindAt ? t - mo.rewindAt : 9;
      const spent = !!game.rewindSpent;
      const wipe = spent ? (mo.reduced ? 1 : clamp((t - (mo.spentAt ?? t)) / WIPE_S, 0, 1)) : 0;
      this.roundButton(ctx, g.rewindX, by, br, false, (c) => this.rewindIcon(c, u), {
        press: since('rewind'),
        rot: mo.reduced ? 0 : -2 * Math.PI * easeOut(spun / SPIN_S),
        alpha: spent ? 1 - 0.55 * wipe : 1,
        wipe,
      });
      // the clock ring: a sweep runs back round the button for 0.8 s, as the tape rewinds
      if (!mo.reduced && spun < RING_S) {
        const k = clamp(spun / RING_S, 0, 1);
        ctx.save();
        ctx.translate(g.rewindX, by);
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 2.6 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, br + 3.5 * u, -Math.PI / 2, -Math.PI / 2 - 2 * Math.PI * k, true);
        ctx.stroke();
        ctx.restore();
      }
    }
    // the wind compass (bottom left) says where its block ends
    if (game.hudExtra) g.compassRight = game.hudExtra(ctx, this, u) ?? null;
    this.hudGeom = g;
  }

  /** The motion state (start times and values for each effect), made on first use: a renderer built without its constructor works too. */
  motionState() {
    if (!this.mo) {
      this.mo = {
        t: null, dt: 0, reduced: false,
        paused: null, morph: { from: 0, to: 0, at: 0 }, k: 0, // the pause bars and the play triangle (k: 0 bars, 1 triangle)
        ffOn: false, ffAt: -9, ffSpeed: 0, ffPhase: 0, // the fast-forward: when it went on, its sweep speed and phase
        press: {}, // button name -> when it was pressed
        rewindAt: null, tape: null, tapeTrails: null, tapeFlashed: false, // the rewind: its start, the tape look, its flash
        spentAt: null, // when the one rewind was spent
        trails: new Map(), flashes: [], bank: new WeakMap(),
      };
    }
    return this.mo;
  }

  /**
   * The motion that runs every frame, whatever is drawn: the pause morph, the fast-forward sweep and speed lines' start,
   * the aircraft's trails and contrails, and the end of the rewind tape (its one flash). Reduced motion keeps the state
   * changes (so the end states are right) and drops the sweeps.
   */
  animate(game, t) {
    const mo = this.motionState();
    mo.dt = clamp(t - (mo.t ?? t), 0, 0.1);
    mo.t = t;
    mo.simT = game.sim ? game.sim.time || 0 : 0; // the sim's clock: a bank is read against it (bankOf)
    mo.reduced = reducedMotion();
    const paused = game.state === 'paused';
    if (paused !== mo.paused) {
      mo.morph = { from: mo.k, to: paused ? 1 : 0, at: t };
      mo.paused = paused;
    }
    const m = mo.morph;
    mo.k = mo.reduced ? m.to : m.from + (m.to - m.from) * smooth((t - m.at) / MORPH_S);
    const fast = !!game.fast;
    if (fast !== mo.ffOn) {
      mo.ffOn = fast;
      if (fast) mo.ffAt = t;
    }
    mo.ffSpeed = approach(mo.ffSpeed, fast ? 1 : 0, mo.dt, fast ? 0.2 : 0.5);
    if (!mo.reduced) mo.ffPhase = (mo.ffPhase + (mo.dt / 0.6) * mo.ffSpeed) % 1; // a sweep loops every 0.6 s
    if (game.rewindSpent) {
      if (mo.spentAt == null) mo.spentAt = t;
    } else mo.spentAt = null;
    const sim = game.sim;
    if (!mo.reduced && sim && (game.state === 'play' || game.state === 'paused')) {
      for (const a of sim.aircraft) {
        if (a.state !== 'fly' || a.ground || a.blip) continue;
        let tr = mo.trails.get(a.id);
        if (!tr) mo.trails.set(a.id, (tr = { pts: [], at: -9, seen: t }));
        tr.seen = t;
        if (t - tr.at >= 0.1) {
          tr.at = t;
          tr.pts.push({ x: a.x, y: a.y });
          if (tr.pts.length > 24) tr.pts.shift();
        }
        // contrails behind the jets that are still arriving (not the ones taking off)
        if (game.fx && JETS.has(a.cls) && !a.departure && a.alpha >= 0.5) game.fx.contrail(a);
      }
      for (const [id, tr] of mo.trails) if (t - tr.seen > 3) mo.trails.delete(id);
    }
    // the tape's end: one flash, capped at three a second (photosensitivity)
    if (mo.tape != null && t - mo.tape >= TAPE_S) {
      if (!mo.tapeFlashed) {
        mo.tapeFlashed = true;
        if (game.fx && flashGate(t * 1000, mo.flashes)) game.fx.flash = 0.6;
      }
      mo.tape = null;
      mo.tapeTrails = null;
    }
  }

  /** A rewind has just jumped the game back: the ring and the spin start, and the tape look runs for 1.2 s over the jump. */
  startTape(now) {
    const mo = this.motionState();
    mo.rewindAt = now;
    mo.tape = now;
    mo.tapeFlashed = false;
    mo.tapeTrails = new Map([...mo.trails].map(([id, tr]) => [id, tr.pts.slice()]));
  }

  /** A press on a canvas button (pause, fast-forward or rewind): its squash, bounce and ripple start now. */
  press(name, now) {
    this.motionState().press[name] = now;
  }

  /**
   * How much an aircraft is banked, -1 to 1, from how fast its heading turns. The turn is measured over the sim's own time
   * (the heading moves in whole sim steps, 0 to 3 a frame, so a frame's clock would make it jitter), and the bank rises at most
   * BANK_STEP a 1/60 s (BANK_STEP x 60 x the frame's length), so a turn reads as one smooth lean at 60 and 120 frames a second.
   * Render side only: the sim never sees it.
   */
  bankOf(a) {
    const mo = this.motionState();
    const h = a.visHeading || 0;
    let st = mo.bank.get(a);
    if (!st) {
      mo.bank.set(a, (st = { h, s: mo.simT, b: 0 }));
      return 0;
    }
    const ds = mo.simT - st.s; // sim seconds since the last frame; none while paused, and a rewind (back in time) keeps the bank
    if (ds > 1e-9) {
      const dt = Math.max(1 / 120, mo.dt || 1 / 60);
      const turn = Math.atan2(Math.sin(h - st.h), Math.cos(h - st.h));
      const target = clamp(turn / ds / BANK_RATE, -1, 1);
      const rise = BANK_STEP * 60 * dt; // per second, not per frame: the frame clamp binds the same at any frame rate
      st.b += clamp((target - st.b) * (1 - Math.exp(-dt * 6)), -rise, rise);
    }
    st.h = h;
    st.s = mo.simT;
    return mo.reduced ? 0 : st.b;
  }

  /**
   * The tape look over a rewind's jump, for 1.2 s of real time: the aircraft's trails from before the jump fade, scan-line
   * bands slide down the screen, and the colour drains. Off under reduced motion; the jump itself is instant either way.
   */
  drawTape(ctx, game, t) {
    const mo = this.motionState();
    if (mo.tape == null || mo.reduced || !this.worldTransform) return;
    const k = (t - mo.tape) / TAPE_S;
    if (k < 0 || k >= 1) return;
    const env = Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.2); // in quickly, out before the end
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.setTransform(this.worldTransform);
    const sc = this.worldTransform.a || 1;
    ctx.lineWidth = 1.6 * this.dpr / sc;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pts of mo.tapeTrails ? mo.tapeTrails.values() : []) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * env})`;
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 3; i++) {
      const y = ((k * 1.6 + i / 3) % 1) * H;
      ctx.fillStyle = `rgba(255,255,255,${0.12 * env})`;
      ctx.fillRect(0, y, W, H * 0.02);
      ctx.fillStyle = `rgba(0,0,0,${0.12 * env})`;
      ctx.fillRect(0, y + H * 0.02, W, H * 0.01);
    }
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128,128,128,${0.6 * env})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** The speed lines at the screen's edges, for the half second after fast-forward goes on (off under reduced motion). */
  speedLines(ctx, t) {
    const mo = this.motionState();
    if (mo.reduced || !mo.ffOn || t < mo.ffAt || t - mo.ffAt >= 0.5) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6 * this.hud;
    for (const s of speedStreaks(this.cssW, this.cssH, (t - mo.ffAt) / 0.5, this.hud)) {
      ctx.strokeStyle = `rgba(255,250,235,${s.alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The pause button's morph (0 bars to 1 triangle), as drawn this frame. */
  get morphK() {
    return this.motionState().k;
  }

  /** The pause icon: the left and right bars, each a quad, morph into the play triangle's two halves at k (0 bars, 1 triangle). */
  morphIcon(c, u, k) {
    const bars = [
      [[-5, -6.5], [-1.4, -6.5], [-1.4, 6.5], [-5, 6.5]],
      [[1.4, -6.5], [5, -6.5], [5, 6.5], [1.4, 6.5]],
    ];
    // the play triangle (-3.5, -6.5), (6.5, 0), (-3.5, 6.5), split at x = 1 so each half morphs from its bar
    const play = [
      [[-3.5, -6.5], [1, -3.575], [1, 3.575], [-3.5, 6.5]],
      [[1, -3.575], [6.5, 0], [1, 3.575], [1, 3.575]],
    ];
    for (let q = 0; q < 2; q++) {
      c.beginPath();
      bars[q].forEach(([x, y], i) => {
        const [x2, y2] = play[q][i];
        const px = (x + (x2 - x) * k) * u, py = (y + (y2 - y) * k) * u;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.closePath();
      c.fill();
    }
  }

  /** The fast-forward icon: two chevrons; while it sweeps they slide forward and fade in and out, one behind the other. */
  ffIcon(c, u, mo) {
    const chevron = (o, a) => {
      c.save();
      c.globalAlpha *= a;
      c.beginPath();
      c.moveTo((o - 1) * u, -6.5 * u);
      c.lineTo((o + 6) * u, 0);
      c.lineTo((o - 1) * u, 6.5 * u);
      c.closePath();
      c.fill();
      c.restore();
    };
    if (mo.ffSpeed < 0.01) {
      chevron(-5.5, 1);
      chevron(1, 1);
      return;
    }
    for (const j of [0, 1]) {
      const f = (mo.ffPhase + j * 0.5) % 1;
      chevron(-6 + 7 * f, 0.3 + 0.7 * Math.sin(f * Math.PI));
    }
  }

  /** The rewind icon: two chevrons pointing back. */
  rewindIcon(c, u) {
    for (const o of [5.5, -1]) {
      c.beginPath();
      c.moveTo((o + 1) * u, -6.5 * u);
      c.lineTo((o - 6) * u, 0);
      c.lineTo((o + 1) * u, 6.5 * u);
      c.closePath();
      c.fill();
    }
  }

  /**
   * A round canvas button: its disc, its icon, and the motion on it. `st` (all optional): press (seconds since the press, for
   * a squash and bounce over 0.26 s and an orange ripple over 0.4 s), glow (the gold halo's blur, px), rot (the icon's turn,
   * radians), alpha (the button's opacity) and wipe (0 to 1: a grey sweep clockwise over the disc, for the used-up rewind).
   */
  roundButton(ctx, x, y, r, active, icon, st = {}) {
    const mo = this.motionState();
    const press = st.press;
    const pressing = press != null && press < PRESS_S;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = st.alpha ?? 1;
    if (pressing && mo.reduced) ctx.globalAlpha *= 0.75; // reduced motion: a simple dim, no squash
    else if (pressing) {
      const p = springOut(press / PRESS_S);
      ctx.scale(1 - 0.06 * (1 - p), 1 - 0.1 * (1 - p));
    }
    ctx.fillStyle = 'rgba(15,25,30,0.25)';
    ctx.beginPath();
    ctx.arc(1.5, 2.5, r, 0, TAU);
    ctx.fill();
    if (st.glow > 0) {
      ctx.shadowColor = 'rgba(242,193,78,0.9)';
      ctx.shadowBlur = st.glow;
    }
    ctx.fillStyle = active ? '#f2c14e' : 'rgba(255,250,235,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.strokeStyle = 'rgba(30,40,45,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (st.wipe > 0) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * st.wipe);
      ctx.closePath();
      ctx.fillStyle = 'rgba(70,80,85,0.35)';
      ctx.fill();
    }
    if (pressing && !mo.reduced && press < RIPPLE_S) {
      const k = press / RIPPLE_S;
      ctx.strokeStyle = `rgba(${ORANGE},${0.45 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + 1.2 * k), 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = '#26363d';
    if (st.rot) {
      ctx.save();
      ctx.rotate(st.rot);
      icon(ctx);
      ctx.restore();
    } else icon(ctx);
    ctx.restore();
  }
}

/** Shape cue per class colour for colour-blind players. */
export function drawSymbol(ctx, color, x, y, r, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.beginPath();
  if (color === 'red') {
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 1.05, r * 0.75);
    ctx.lineTo(-r * 1.05, r * 0.75);
    ctx.closePath();
  } else if (color === 'orange') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else if (color === 'yellow' || color === 'green') {
    ctx.arc(0, 0, r * (color === 'green' ? 0.6 : 0.9), 0, TAU);
  } else {
    ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
  }
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,28,32,0.85)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
