// The clip's pictures (video.js): the game's replay run again in the game's own step order (simdriver.js), drawn by the game's own
// renderer (render.js) into a full-width map band of a 1080 x 1920 frame, with the frame's words above and below it (the brand, the
// airport and the live score, the radio caption, the closing line). The band shows the whole airspace (the best moment, the time-lapse)
// or the planes that crashed, followed by the camera (videocam.js, the Last 20 s). Browser only: canvas, Image and the fonts. What the
// words say is videoclip.js. Nothing is recorded here: the replay is the one the game kept (replay.js), so the video shows the game as
// it was.
import { SIM_HZ, WORLD_H, ZONE_COLORS, CLASSES } from './config.js?v=2f66fd5f';
import { buildWorld } from './airport.js?v=2f66fd5f';
import { makeGame, stepWorld, applyInput, STEP } from './simdriver.js?v=2f66fd5f';
import { REPLAY_FORMAT, REPLAY_VERSION, rowFromTuple } from './replay.js?v=2f66fd5f';
import { Renderer } from './render.js?v=2f66fd5f';
import { FX, FONT } from './fx.js?v=2f66fd5f';
import { isSleigh } from './santa.js?v=2f66fd5f';
import { Scenery, waterMask, surroundingsInWorld } from './scenery.js?v=2f66fd5f';
import { Lighting } from './lighting.js?v=2f66fd5f';
import { Sky } from './sky.js?v=2f66fd5f';
import { groundTheme, nearField } from './airportpaint.js?v=2f66fd5f';
import { bearingToCanvas } from './geo.js?v=2f66fd5f';
import { assetUrl } from './flavor.js?v=2f66fd5f';
import { hudScale, setHudScale } from './util.js?v=2f66fd5f';
import {
  VIDEO_FPS, VIDEO_W, VIDEO_H, bandHeightFor, CLIP_S, clipView, frameLayout, captionHeight, CAPTION_LINE, CAPTION_MAX_LINES, frameCount, simTimeAt,
  arrivalNoteOf, callsFor, checkInCalls, captionRadio, Captions, windWords, momentOf, topBand, bottomBlock, inChunks, slotWords,
} from './videoclip.js?v=2f66fd5f';
import { FollowCamera, Track, TRACK_STEP, LOOK_S } from './videocam.js?v=2f66fd5f';

// The in-map labels of a clip (the callsigns, the arrival notes, the closure pills) are drawn at this HUD scale. The game's own is 1
// (about 1.04 on the reference phone). The band is 1080 px wide and a phone shows it at about 410 CSS px, so the game's labels on a
// phone are 2.6 times their size in the frame: at 2.8, a label (9.75 px x 2.8, about 27 px) reads at the game's own size on a phone.
export const LABEL_SCALE = 2.8;
const NO_INSETS = { l: 0, r: 0, t: 0, b: 0 }; // the band is the whole canvas: no HUD cutout
const KEY_HOLD_S = 4; // the key to the red dots stays up this long after the last real plane on the picture (it does not blink)

/**
 * Runs draw() with the map's labels at the clip's scale. The renderer's own labels read renderer.hud, but the fix names, the stack counts
 * and the departures' names are drawn by util.js mapLabel, which reads the module's HUD scale (main.js sets it for the live game). That
 * scale is the clip's for the frame, and the game's own is back after, even when draw throws.
 */
export function atLabelScale(draw) {
  const ui = hudScale();
  setHudScale(LABEL_SCALE);
  try {
    return draw();
  } finally {
    setHudScale(ui);
  }
}

const C = {
  bg0: '#1d4651', bg1: '#0e2328', cream: '#fff6e3', muted: 'rgba(255,246,227,0.66)', orange: '#f28c38', gold: '#f2c14e',
  red: '#ff4636', chip: 'rgba(14,35,40,0.86)',
};
const font = (w, px) => `${w} ${px}px ${FONT}`;

/** Shrinks a line's font until it fits maxW, and leaves that font on the context. Returns the size used. */
function fitFont(g, text, weight, px, maxW, min = 22) {
  let size = px;
  g.font = font(weight, size);
  while (size > min && g.measureText(text).width > maxW) {
    size -= 2;
    g.font = font(weight, size);
  }
  return size;
}

/** The text cut to fit maxW with an ellipsis, at the font the context holds (the last resort after fitFont). */
function clipText(g, text, maxW) {
  const s = String(text);
  if (g.measureText(s).width <= maxW) return s;
  let cut = s;
  while (cut.length > 1 && g.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** The text broken into lines no wider than maxW at its spaces (the context keeps its font). */
export function wrapLines(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * The scene for one clip of one replay: the game rebuilt from the replay, the renderer's map band (whole airspace, or the follow camera
 * on the crash planes), the captions and the labels. replay is the game's own (replay.js, rec.build at game end); layout is the airport's
 * (game.airport.layout). o: { sur (the airport's real surroundings, or null), lighting ('real' | 'day' | 'night', the Settings mode),
 * facility (the radio's name for the airport), notes (the arrival notes the game made), night (the level the game ended with, or null
 * for the clock), follow ({ ids, track, crashAt } from scanReplayAsync, or null: the Last 20 s follows the planes that crashed) }.
 */
export class ClipScene {
  constructor(replay, layout, { sur = null, lighting: mode = 'real', facility = '', notes = null, night = null, follow = null } = {}) {
    if (!replay || replay.f !== REPLAY_FORMAT || replay.v !== REPLAY_VERSION) throw new Error('video: unknown replay');
    this.replay = replay;
    this.facility = facility;
    // the replay's own world: an upright game's H is taller than the landscape one (a replay with no H is 540; replay.js)
    const world = buildWorld(layout, replay.W, replay.H ?? WORLD_H);
    this.world = world;
    if (sur) {
      // main.js applySurroundings: the sea and lakes, the mountains and the boats, dressed as the live game dresses its world
      world.sur = surroundingsInWorld(sur, world);
      world.waterMask = waterMask(world.sur, { x0: -80, y0: -80, x1: world.W + 80, y1: world.H + 80 }, 3);
    }
    this.inputsAt = new Map();
    for (const input of replay.inputs || []) {
      if (!this.inputsAt.has(input[0])) this.inputsAt.set(input[0], []);
      this.inputsAt.get(input[0]).push(input);
    }
    const feedAt = new Map();
    for (const [step, state, rows, callsigns] of replay.feed || []) feedAt.set(step, { state, rows: rows.map(rowFromTuple), callsigns });
    const g = makeGame(world, {
      seed: replay.seed, daily: replay.board === 'daily', setup: replay.setup, hud: replay.hud,
      settings: { departures: !!replay.setup.departures }, rec: null, rewindOn: true,
    });
    g.feed = (step) => feedAt.get(step) || null;
    this.g = g;
    const sim = g.sim;
    this.sim = sim;
    const wx = replay.setup.wxSeed || null;
    this.sky = new Sky({ weather: g.weather, W: world.W, H: world.H, seed: replay.seed, cloud: wx ? wx.cloud : null, precip: wx ? wx.precip : null, intensity: wx ? wx.precipIntensity : 1 });
    const windTo = () => {
      const w = g.weather;
      if (!w) return [0.7, 0.3];
      const a = bearingToCanvas((w.windDir || 0) + 180);
      return [Math.cos(a), Math.sin(a)];
    };
    this.scenery = new Scenery({ mask: world.waterMask, theme: groundTheme(world.L.info).name, W: world.W, H: world.H, avoid: (x, y) => nearField(world, x, y, 30), wind: windTo });
    // night: the level the game ended with (main.js), held for the whole clip; null follows the clock
    this.lighting = new Lighting({ world, mode, night });
    this.fx = new FX();
    this.notes = notes; // the arrival notes the game made, by aircraft id (main.js arrivals)
    this.radio = captionRadio(facility); // the game's calls as captions, with its own check-in throttle
    this.captions = new Captions();
    this.moments = [];
    this.scanning = false;
    this.track = null; // the scan's planes by step (videocam.js Track), when the scan keeps them
    this.crashed = false; // the sim holds a crash now (a rewind can take it back)
    this.crashAt = null; // the step clock (sec) the sim last began to hold a crash: the camera's push-in ends there
    this.ended = false; // the inputs made at the replay's final step are applied once, when the whole replay has run (see advance)
    this.levels = [];
    this.realAt = null; // the clip second a real plane was last on the picture (the key's hold, KEY_HOLD_S)
    // the game object the renderer reads (render.js draw): the game in play with the HUD off, and the scene's pieces
    this.vg = {
      sim, world, weather: g.weather, hazards: g.hazards, ops: g.ops, departures: g.departures, director: g.director, scenery: this.scenery,
      lighting: this.lighting, sky: this.sky, fx: this.fx, clock: 0, camera: { zoom: 1, fx: 0, fy: 0 }, night: 0, state: 'play',
      showHud: false, fast: false, displayScore: 0, scorePop: 0, best: 0, hint: null, vignette: 0, desat: 0, title: '', mix: '',
      banner: '', mixDot: null, crashT: -1, rewindSpent: false, rewindAvailable: false, symbols: false, timeScale: 1,
      underlay: (ctx, t) => {
        this.scenery.draw(ctx, t);
        if (g.weather) g.weather.drawWindsock(ctx, t);
        if (g.departures) g.departures.draw(ctx, t);
        if (g.ops) g.ops.draw(ctx, t);
        this.sky.drawShadows(ctx);
      },
      overlayBelowAircraft: (ctx, t) => {
        if (g.weather) g.weather.drawStorms(ctx);
        if (g.hazards) {
          g.hazards.drawWakes(ctx);
          g.hazards.drawCrews(ctx, t);
        }
      },
      overlayAboveAircraft: (ctx, t) => {
        if (g.weather) {
          g.weather.drawStormWarnings(ctx, t);
          g.weather.drawFog(ctx, t);
        }
        if (g.hazards) g.hazards.drawEmergencies(ctx, t);
        this.sky.drawPrecip(ctx);
      },
    };
    // the picture: the renderer draws into its own canvas (never the game's), the band's size at 1 device px to a CSS px, so the frame's
    // pixels are the map's; the band is the same height in every clip, and the labels are drawn at the clip's size
    this.bandH = bandHeightFor(replay);
    this.canvas = document.createElement('canvas');
    this.renderer = new Renderer(this.canvas);
    this.renderer.layout(VIDEO_W, this.bandH, 1, NO_INSETS);
    this.renderer.hud = LABEL_SCALE;
    this.renderer.setWorld(world);
    this.renderer.view = clipView(world.W, world.H);
    // the follow camera of a crash clip (videocam.js): the planes that crashed, found by the replay's pass (scanReplayAsync)
    this.camera = follow ? new FollowCamera({ W: world.W, H: world.H, bandH: this.bandH, ids: follow.ids, track: follow.track, crashT: follow.crashAt }) : null;
  }

  /** What the radio's phrases read: the sim, the radio and the wind now. */
  env() {
    return { sim: this.sim, radio: this.radio, wind: windWords(this.g.weather) };
  }

  /** The steps a plan's clip covers: [from, to). A time-lapse covers the whole game. */
  bounds(plan) {
    if (plan.lapse) return { from: 0, to: this.replay.steps };
    return { from: Math.round(plan.start * SIM_HZ), to: Math.min(this.replay.steps, Math.round(plan.end * SIM_HZ)) };
  }

  /** The clip's own clock (video seconds) at step i: the clip runs in real time; a time-lapse spreads the whole game over its play. */
  videoSecond(plan, i) {
    return plan.lapse ? ((i + 1) / this.replay.steps) * plan.play : (i + 1) / SIM_HZ - plan.start;
  }

  /** The scan's track: the planes' positions at the step the game is at, once per sample step (videocam.js Track). */
  sample() {
    const t = this.track, i = this.g.steps;
    if (!t || i % TRACK_STEP || i < t.from || i === t.lastStep) return;
    t.lastStep = i;
    t.add(this.sim.aircraft.map((a) => {
      const p = a.blip || a; // where the picture draws the plane (a fog blip, when there is one)
      return { id: a.id, x: p.x, y: p.y, rw: runwayEnds(this.sim, a) };
    }));
  }

  /**
   * Steps the game up to step `until`, in the game's own order: the inputs of a step, then stepWorld (and the sky, as main.js steps it).
   * With a plan, the events of the clip are captioned and drawn. A scan keeps the moments of the game, and its track.
   */
  advance(until, plan = null) {
    const { sim, g } = this;
    const b = plan ? this.bounds(plan) : null;
    while (g.steps < until) {
      const i = g.steps;
      this.sample();
      for (const input of this.inputsAt.get(i) || []) applyInput(g, input);
      stepWorld(g, STEP);
      this.sky.step(STEP);
      if (!!sim.crash !== this.crashed) {
        this.crashed = !!sim.crash;
        if (this.crashed) this.crashAt = g.steps / SIM_HZ;
      }
      const events = sim.drainEvents();
      const inClip = !!plan && i >= b.from && i < b.to;
      // a plane's check-in, once, as it comes in (main.js radioCheckIns; the radio's own throttle decides which are said)
      for (const a of sim.aircraft) {
        if (a.radioIn || !a.entered || a.state !== 'fly' || a.ground || a.departure) continue;
        a.radioIn = true;
        if (inClip && a.age < 6) this.captions.add(this.videoSecond(plan, i), checkInCalls(a, sim.time, this.env()));
      }
      for (const ev of events) {
        if (this.scanning) {
          const m = momentOf(ev, (i + 1) / SIM_HZ);
          if (m) this.moments.push(m);
        }
        if (inClip) this.event(plan, i, ev);
      }
    }
    this.sample();
    // the inputs made after the replay's last step are applied once the whole replay has run, as simdriver.runReplay applies them
    // (the game's outcome, and so its final score, includes them); a clip that ends on the last step shows that score
    if (!this.ended && g.steps >= this.replay.steps) {
      this.ended = true;
      for (const input of this.inputsAt.get(this.replay.steps) || []) applyInput(g, input);
    }
  }

  /** One event in the clip: its captions (the game's own calls) and the picture's effects (the game's rings, popups and arrival note). */
  event(plan, i, ev) {
    const a = ev.aircraft;
    this.captions.add(this.videoSecond(plan, i), callsFor(ev, this.env()));
    // Santa's landing gets its own caption under the tower's call (santa.js): the airport is the replay's
    if (ev.kind === 'touchdown' && isSleigh(a)) this.captions.add(this.videoSecond(plan, i), [{ who: 'Santa', msg: `Santa landed at ${this.replay.icao}`, prio: 3 }]);
    if (ev.kind === 'crash') {
      // the crash's explosion where the planes met, in their own colours (main.js handleEvents); the frame holds the shake at zero
      this.fx.explosion(ev.x, ev.y, [...ev.who.map((p) => ZONE_COLORS[CLASSES[p.cls].color].main), '#f6f1e4', '#3a3a3a']);
    } else if (ev.kind === 'land' && a && ev.gain) {
      this.fx.text(a.x, a.y - 18, `+${ev.gain}`, '#c9f2a8', 20, 1.1, { arc: true });
    } else if (ev.kind === 'nearMiss') {
      const mx = (ev.a.x + ev.b.x) / 2, my = (ev.a.y + ev.b.y) / 2;
      this.fx.ring(mx, my, '255,255,255', 70, 0.5, 3);
      this.fx.ring(mx, my, '255,120,100', 52, 0.5, 2);
    } else if (ev.kind === 'touchdown' && isSleigh(a)) {
      this.fx.santaLanding(a.x, a.y);
    } else if (ev.kind === 'touchdown' && a) {
      this.fx.ring(a.x, a.y, '255,246,200', 40, 0.5, 3);
      this.fx.glow(a.x, a.y, 40, '255,236,170', 0.5);
      // the note the game showed at this touchdown ("Arrived from <city>"), beside the plane for the same few seconds; a time-lapse
      // runs too fast for a note to be read, so it has none
      const note = arrivalNoteOf(this.notes, a);
      if (note && !plan.lapse) this.renderer.noteArrival(a, note, this.sim.time);
    }
  }

  /**
   * The picture of frame f of the plan (0 based). The game is stepped up to the frame's time, the picture is drawn into this.canvas, and
   * the frame's words are returned: the caption on screen, the live score, the music layer for the frame (the traffic, as main.js sets
   * it), and whether a real plane is on the picture (the key to the red dots).
   */
  frame(plan, f) {
    const frames = frameCount(plan);
    // a frame shows the game at the END of its interval, so the last frame is the clip's end (the game's last step for a clip that
    // ends there: its final score, which the video quotes); the first frame's start is the clip's start (warm-up, video.js)
    const end = f + 1 >= frames ? plan.end : simTimeAt(plan, f + 1);
    this.advance(Math.min(this.replay.steps, Math.round(end * SIM_HZ)), plan);
    const sim = this.sim, vg = this.vg, r = this.renderer;
    const sec = (f + 1) / VIDEO_FPS;
    // the Last 20 s follows the planes that crashed (videocam.js); the other clips hold the whole airspace, as the renderer's view is set
    if (this.camera && plan.key === 'last') {
      r.view = this.camera.step(this.g.steps / SIM_HZ, 1 / VIDEO_FPS);
      r.renderBackground(); // repaints the ground only when the zoom has moved enough for it (render.js)
    }
    if (this.realOnScreen()) this.realAt = sec;
    const real = this.realAt != null && sec - this.realAt <= KEY_HOLD_S;
    vg.clock = sec;
    vg.night = this.lighting.update(Date.now());
    this.scenery.update(1 / VIDEO_FPS);
    this.fx.update(1 / VIDEO_FPS, 1 / VIDEO_FPS);
    // the picture is held still: a crash's shake (fx.explosion) is not drawn in a clip
    this.fx.shake = 0;
    // the stage prompts ("Tap to taxi") are for a player's finger: hidden while the frame is drawn, and put back after (the
    // departure logic reads them, so the sim keeps them)
    const prompts = [];
    for (const a of sim.aircraft) {
      if (a.departure && a.departure.prompt) {
        prompts.push([a.departure, a.departure.prompt]);
        a.departure.prompt = '';
      }
    }
    atLabelScale(() => r.draw(vg));
    for (const [d, p] of prompts) d.prompt = p;
    const flying = sim.aircraft.reduce((n, a) => n + (a.state === 'fly' ? 1 : 0), 0);
    const level = flying < 4 ? 1 : flying < 9 ? 2 : 3; // main.js sets the music layer from the planes flying the same way
    this.levels[f] = level;
    // the card's words when no call is on (videoclip.js slotWords): what a crash clip follows, or what the clip shows
    const slot = slotWords(plan, { crash: this.replay.end.crash, followed: this.camera && plan.key === 'last' ? this.camera.ids.length : 0 });
    return { sec, caption: this.captions.at(sec), score: sim.score, level, real, slot };
  }

  /** A real plane is on the picture now: a live plane flying and drawn inside the band, as render.js draws its red dot. */
  realOnScreen() {
    const r = this.renderer;
    return this.sim.aircraft.some((a) => {
      if (!a.live || a.state !== 'fly' || a.alpha < 0.3) return false;
      const pos = a.blip || a;
      const [x, y] = r.toScreen(pos.x, pos.y);
      return x >= -60 && y >= -20 && x <= r.cssW + 20 && y <= r.cssH + 20;
    });
  }

  /** The music layer at clip second t (renderTrackOffline's levelAt): the layer of the frame at that time. */
  levelAt(plan, t) {
    const frames = frameCount(plan);
    const f = Math.min(frames - 1, Math.max(0, Math.floor(t * VIDEO_FPS)));
    return this.levels[f] || 1;
  }
}

/** The two ends of the runway a plane lands on, as [x, y] pairs (the follow camera's box), or null when it has none. */
function runwayEnds(sim, a) {
  if (a.target == null) return null;
  const z = sim.zone(a.target);
  return z && z.kind === 'runway' ? z.ends.map((e) => [e.x, e.y]) : null;
}

/**
 * The replay run once with no picture, in pieces (inChunks) with the page free between them, so a long game does not hold it for the
 * whole run and the progress moves. It serves the best moment (the moments, sim seconds) and the Last 20 s (pair): the planes that
 * crashed are the replay's own (sim.crash.who, found in this one pass), with their positions over the clip's last seconds (videocam.js
 * Track), and crashAt, the step clock (sec) at which the sim began to hold the crash (the push-in's end: a rewind moves the sim's own time
 * back, not the steps). pair is null when the game has no crash or the pass was cancelled. Resolves { moments, total, done, pair:
 * { ids, track, crashAt } | null }; done is false when cancelled (then the rest is not whole and the caller stops).
 */
export async function scanReplayAsync(replay, layout, opts = {}, { chunk = 20 * SIM_HZ, pause, progress, cancelled } = {}) {
  const scene = new ClipScene(replay, layout, opts);
  scene.scanning = true;
  // the track starts a look-ahead before the last CLIP_S seconds, on a sample step
  const from = Math.max(0, Math.floor(((replay.steps / SIM_HZ - CLIP_S - LOOK_S) * SIM_HZ) / TRACK_STEP)) * TRACK_STEP;
  scene.track = new Track(from);
  const done = await inChunks(replay.steps, { chunk, step: (until) => scene.advance(until), pause, progress, cancelled });
  const crash = scene.sim.crash;
  const pair = done && crash && crash.who.length ? { ids: crash.who.map((a) => a.id), track: scene.track, crashAt: scene.crashAt } : null;
  return { moments: scene.moments, total: replay.steps / SIM_HZ, done, pair };
}

/** The app's icon for the top band (img/icon.svg), or null where it can't load. Loaded once. */
let iconLoad = null;
export function loadIcon() {
  if (!iconLoad) {
    iconLoad = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = assetUrl('img/icon.svg');
    });
  }
  return iconLoad;
}

/**
 * The whole frame (1080 x 1920) on the canvas `out`. The backdrop is the band's own picture, scaled to cover the frame, blurred and
 * darkened. The map band (clip, bandH tall) sits where videoclip.js frameLayout puts it, and the words sit above and below it: the
 * top block (the app's icon, SHORT FINAL, the tagline, where to get the game, the tag; the airport, its name and the live score), the
 * radio caption (or the clip's words, slot, when no call is on) on a dark card under the band, and the closing line with the key to the red dots (drawn only while real = true: a real
 * plane is on the picture). parts: { clip (the band's canvas), bandH, words (topBand), block (bottomBlock), caption (a cue or null), slot,
 * icon (an Image or null), real }. Returns { band: {y0, y1}, boxes }: the box of each word and card in video px, which the tests check.
 */
export function drawFrame(out, { clip, bandH, words, block, caption, slot = null, icon: img, real = false }) {
  const g = out.getContext('2d');
  const W = VIDEO_W, H = VIDEO_H;
  const L = frameLayout(bandH);
  const boxes = [];
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  // one line of words, shrunk to fit maxW (and cut with an ellipsis at its smallest size); its box is kept for the layout checks
  const line = (name, str, { x, base, weight, px, maxW, min = 22, align = 'left', color }) => {
    g.fillStyle = color;
    const size = fitFont(g, str, weight, px, maxW, min);
    const s = clipText(g, str, maxW);
    const w = g.measureText(s).width;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    g.fillText(s, x0, base);
    boxes.push({ name, x0, x1: x0 + w, y0: base - size * 0.9, y1: base + size * 0.25 });
    return w;
  };

  // the backdrop: the band's own picture scaled to cover the frame, blurred and darkened, so the words read on a soft copy of the scene
  const bgGrad = g.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, C.bg0);
  bgGrad.addColorStop(1, C.bg1);
  g.fillStyle = bgGrad;
  g.fillRect(0, 0, W, H);
  const k = H / bandH;
  g.filter = 'blur(26px)';
  g.drawImage(clip, (W - W * k) / 2, 0, W * k, H);
  g.filter = 'none';
  g.fillStyle = 'rgba(14,35,40,0.55)';
  g.fillRect(0, 0, W, H);

  // the map band: the phone's screen as the player saw it, full width, with a shade above and below and a hairline at each edge
  g.drawImage(clip, 0, L.bandY, W, bandH);
  const above = g.createLinearGradient(0, L.bandY - 30, 0, L.bandY);
  above.addColorStop(0, 'rgba(14,35,40,0)');
  above.addColorStop(1, 'rgba(14,35,40,0.6)');
  g.fillStyle = above;
  g.fillRect(0, L.bandY - 30, W, 30);
  g.fillStyle = 'rgba(255,246,227,0.28)';
  g.fillRect(0, L.bandY - 2, W, 2);
  g.fillRect(0, L.bandEnd, W, 2);

  // the top block: the app's icon, the lockup beside it (SHORT FINAL, the tagline, where to get the game), the tag on the right
  const TX = 248;
  let tagW = 0;
  if (words.tag) {
    g.font = font(700, 32);
    tagW = g.measureText(words.tag).width + 44;
  }
  if (img) g.drawImage(img, 56, L.brandY, 160, 160);
  line('wordmark', words.wordmark, { x: TX, base: L.brandY + 84, weight: 700, px: 100, maxW: W - 56 - TX - (tagW ? tagW + 28 : 0), min: 48, color: C.cream });
  line('tagline', words.tagline, { x: TX, base: L.brandY + 146, weight: 600, px: 48, maxW: W - 56 - TX, min: 26, color: C.orange });
  line('where', words.where, {
    x: TX, base: L.brandY + 194, weight: 700, px: 44, maxW: W - 56 - TX, min: 26, color: words.where.startsWith('Free') ? C.gold : C.muted,
  });
  if (tagW) {
    const x = W - 56 - tagW, y = L.brandY + 16;
    g.fillStyle = C.orange;
    roundRect(g, x, y, tagW, 56, 28);
    g.fill();
    g.font = font(700, 32);
    g.fillStyle = '#1b2b30';
    g.fillText(words.tag, x + 22, y + 38);
    boxes.push({ name: 'tag', x0: x, x1: W - 56, y0: y, y1: y + 56 });
  }

  // the airport and the live score: the code and the city on the left, the score and its word on the right, on one row above the band
  line('code', block.code, { x: 56, base: L.airportY, weight: 700, px: 132, maxW: 520, min: 60, color: C.cream });
  line('city', block.name, { x: 60, base: L.airportY + 58, weight: 600, px: 40, maxW: 520, min: 24, color: C.muted });
  line('score', block.score, { x: W - 56, base: L.airportY, weight: 700, px: 190, maxW: 520, min: 90, align: 'right', color: C.cream });
  line('points', block.points, { x: W - 56, base: L.airportY + 58, weight: 700, px: 40, maxW: 400, min: 24, align: 'right', color: C.orange });

  // the card under the band: the radio call (its speaker in orange, the call in cream), or with no call on, the clip's own words in the same
  // card, so the band under the map is never empty; the card is three lines tall either way (three lines at most for a call)
  const cue = caption || slot;
  if (cue) {
    g.font = font(600, 42);
    let lines = wrapLines(g, cue.msg, 840);
    if (lines.length > CAPTION_MAX_LINES) {
      lines = lines.slice(0, CAPTION_MAX_LINES);
      g.font = font(600, 42);
      lines[CAPTION_MAX_LINES - 1] = clipText(g, `${lines[CAPTION_MAX_LINES - 1]}…`, 840);
    }
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    const boxW = Math.min(W - 80, widest + 72);
    const boxH = captionHeight(CAPTION_MAX_LINES);
    const bx = (W - boxW) / 2, by = L.captionY;
    const dy = (boxH - captionHeight(lines.length)) / 2; // a shorter call sits in the middle of the card
    g.fillStyle = C.chip;
    roundRect(g, bx, by, boxW, boxH, 30);
    g.fill();
    boxes.push({ name: 'caption card', x0: bx, x1: bx + boxW, y0: by, y1: by + boxH });
    line('caption speaker', String(cue.who).toUpperCase(), { x: bx + 36, base: by + 56 + dy, weight: 700, px: 30, maxW: boxW - 72, min: 18, color: C.orange });
    lines.forEach((l, j) => line(`caption line ${j + 1}`, l, {
      x: bx + 36, base: by + 104 + dy + j * CAPTION_LINE, weight: 600, px: 42, maxW: boxW - 72, min: 30, color: C.cream,
    }));
  }

  // the closing line: one line if it fits, else two at a smaller size (it quotes the game's final score)
  let hook = [block.hook], size = 58;
  for (size of [58, 50, 44]) {
    g.font = font(600, size);
    hook = wrapLines(g, block.hook, W - 112);
    if (hook.length <= 2) break;
  }
  hook.forEach((l, j) => line(`closing ${j + 1}`, l, {
    x: W / 2, base: L.hookY + size * 0.8 + j * (size + 10), weight: 600, px: size, maxW: W - 112, min: size, align: 'center', color: C.cream,
  }));
  // the key to the real planes: a red dot, as the game draws each real plane (its label is the flight's name). Only while one is on
  // the picture: a clip with none has no dots to point at, and the same line then says where the game is (the foot of the frame is
  // never an empty strip, and the words do not move between clips)
  if (real) {
    const key = 'Red dots are real flights';
    g.font = font(600, 40);
    const kx = (W - g.measureText(key).width) / 2;
    g.fillStyle = C.red;
    g.beginPath();
    g.arc(kx - 26, L.keyY - 11, 10, 0, Math.PI * 2);
    g.fill();
    boxes.push({ name: 'key dot', x0: kx - 36, x1: kx - 16, y0: L.keyY - 21, y1: L.keyY - 1 });
    line('key', key, { x: kx, base: L.keyY, weight: 600, px: 40, maxW: W - 112, min: 26, color: C.muted });
  } else {
    line('foot', words.where, { x: W / 2, base: L.keyY, weight: 700, px: 40, maxW: W - 112, min: 26, align: 'center', color: C.gold });
  }
  return { band: { y0: L.bandY, y1: L.bandEnd }, boxes };
}

/** The frame's words for a clip: the top band and the bottom block, from the game's result (videoclip.js). */
export function frameWords(r, clip) {
  return { words: topBand(r, clip), block: bottomBlock(r) };
}
