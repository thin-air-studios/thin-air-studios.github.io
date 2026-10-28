// The video's clip (video.js, the share panel's Video option): which part of a replayed game it shows, the names of the real planes
// on it, the radio calls as captions and the words on the frame. Pure: no DOM, no canvas, no Web Audio, so the tests read it.
// A real plane keeps the name the game gives it (its carrier and flight number, with the red dot): the owner's decision of 2026-10-14
// (the placeholder names the first version used were withdrawn). A simulated plane has no name, as in the game.
import { Radio } from './radio.js?v=2f66fd5f';
import { isSleigh } from './santa.js?v=2f66fd5f';
import { CLASSES, TUNING, WORLD_H } from './config.js?v=2f66fd5f';

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
export const VIDEO_FPS = 30;
/** The seconds of video a clip runs for, and the time-lapse of a whole game (about 20 s, as asked). */
export const CLIP_S = 20;
/** A clip that runs to the game's end and ends in a crash holds on the wreck for this long: the sim stands still, the picture does not. */
export const HOLD_S = 1.5;
/** The map band's height in the frame, the same for every clip (the words sit at the same heights in all of them). */
export const BAND_H = 750;
// an upright replay's map band (3.3; DECISIONS 443): its airspace is taller, so its band is taller, as far as the frame allows: 784 is the
// most that sits between the top words (TOP_END + GAP) and the caption (HOOK_TOP - GAP - a full caption); video-clip.test.mjs pins it
export const UPRIGHT_BAND_H = 784;
/** The map band's height for a replay: the upright band for a replay of an upright game (its H is taller than WORLD_H), else BAND_H. */
export function bandHeightFor(replay) {
  return replay.H > WORLD_H ? UPRIGHT_BAND_H : BAND_H;
}
/** A game shorter than this has nothing to make a video of: the Video option says so instead. */
export const MIN_GAME_S = 6;
/** The three clip choices in the order the share panel shows them; the best moment is the default. */
export const CLIPS = Object.freeze([
  { key: 'last', label: 'Last 20 s' },
  { key: 'best', label: 'Best moment' },
  { key: 'lapse', label: 'Time-lapse' },
]);
export const DEFAULT_CLIP = 'best';

// the radio's own speaking words for a tag (radio.js: 'TWR' | 'APP' | 'GND' | 'DEP' | 'ATIS'), as a caption shows them
const TAG = { TWR: 'Tower', APP: 'Approach', GND: 'Ground', DEP: 'Departure', ATIS: 'ATIS' };
const TYPE_WORD = { narrowbody: 'AIRLINER', regional: 'REGIONAL JET', heavy: 'HEAVY', light: 'LIGHT AIRCRAFT', heli: 'HELICOPTER' };

/**
 * How much a sim event counts toward the best moment (the brief's four: a near-miss save, an emergency landed, a rush handled,
 * a holding stack cleared), as {t, w} at sim time t, or null for an event that is no moment. A near miss is a pair that came
 * close and parted (sim.js: 'nearMiss' is pushed only when they did not touch); a stack cleared is a plane released from a hold.
 */
export function momentOf(ev, t) {
  switch (ev.kind) {
    case 'nearMiss': return { t, w: 4 };
    case 'land':
      if (ev.aircraft && ev.aircraft.emergency) return { t, w: 6 }; // an emergency landed
      return { t, w: ev.streak >= 4 ? 2 : 1 }; // a run of clean landings is a rush handled
    case 'bank': return ev.phase === 'push' ? { t, w: 3 } : null; // the arrival push
    case 'release': return { t, w: 3 }; // a holding stack cleared
    default: return null;
  }
}

const STEP_S = 0.5; // the candidate window starts are this far apart
const CENTRE_S = 13; // a moment sits about this far into the window (near its middle, the lead-in and the after both show)

/**
 * The start (sim seconds) of the window of `span` seconds with the most moment weight in it (moments: {t, w}, any order). Ties
 * go to the window whose strongest moment sits nearest CENTRE_S into it, then to the earlier. A game with no moment at all
 * shows its last `span` seconds.
 */
export function bestStart(moments, total, span = CLIP_S) {
  const last = Math.max(0, total - span);
  if (total <= span || !moments.length) return last;
  const starts = new Set([last]);
  for (let s = 0; s <= last + 1e-9; s += STEP_S) starts.add(Math.round(s * 2) / 2);
  for (const m of moments) starts.add(Math.min(last, Math.max(0, Math.round((m.t - CENTRE_S) * 2) / 2)));
  let best = null;
  for (const s of starts) {
    let w = 0, peak = null;
    for (const m of moments) {
      if (m.t < s || m.t >= s + span) continue;
      w += m.w;
      if (!peak || m.w > peak.w) peak = m;
    }
    if (!w) continue;
    const off = peak ? Math.abs(peak.t - s - CENTRE_S) : Infinity;
    if (!best || w > best.w || (w === best.w && (off < best.off || (off === best.off && s < best.s)))) best = { s, w, off };
  }
  return best ? best.s : last;
}

/**
 * The part of the game a clip shows: { key, start, end, seconds, play, hold, lapse }. start and end are sim seconds; seconds is the
 * video's length (the whole game is `CLIP_S` for the time-lapse, and a game shorter than CLIP_S is shown whole). play is the part of
 * the video that is game time, and hold the wreck's seconds at its end (HOLD_S, when the clip ends a crashed game; else 0): the
 * game's end then sits `hold` seconds before the video's end, and the sim does not step after it. A long game gives the hold up
 * from its own last seconds, so the clip keeps its length; a short game is shown whole, and its hold comes after the game.
 */
export function clipPlan({ kind = DEFAULT_CLIP, total, moments = [], crashed = false }) {
  if (kind === 'lapse') {
    const hold = crashed ? HOLD_S : 0;
    return { key: kind, start: 0, end: total, seconds: CLIP_S, play: CLIP_S - hold, hold, lapse: true };
  }
  const span = Math.min(CLIP_S, total);
  const start0 = kind === 'last' ? Math.max(0, total - span) : bestStart(moments, total, span);
  const end = start0 + span;
  if (!crashed || end < total - 1e-9) return { key: kind, start: start0, end, seconds: span, play: span, hold: 0, lapse: false };
  if (total <= CLIP_S) return { key: kind, start: 0, end, seconds: span + HOLD_S, play: span, hold: HOLD_S, lapse: false };
  return { key: kind, start: end - (span - HOLD_S), end, seconds: span, play: span - HOLD_S, hold: HOLD_S, lapse: false };
}

/** Whether a clip runs to the game's end: its last frame then shows the game's final score, which the closing line quotes. */
export function reachesEnd(plan, total) {
  return plan.end >= total - 1e-9;
}

/** The number of video frames a plan has, at VIDEO_FPS. */
export function frameCount(plan) {
  return Math.max(1, Math.round(plan.seconds * VIDEO_FPS));
}

/**
 * The sim time at the start of frame f of a plan (0-based; frames is frameCount(plan)): the clip runs in real time, the time-lapse
 * spreads the game over its play seconds. Past the game's end (the wreck's hold) the sim stands at the end. A frame shows the game at
 * its END, so videorender.js draws frame f at simTimeAt(plan, f + 1).
 */
export function simTimeAt(plan, f) {
  if (plan.lapse) return Math.min(plan.end, (plan.end * f) / (plan.play * VIDEO_FPS));
  return Math.min(plan.end, plan.start + f / VIDEO_FPS);
}

/**
 * Runs step(until) over [0, total) in pieces of `chunk` units (steps), with `pause` between two pieces, so the page stays alive
 * (taps, the progress, Cancel) through a long game: one call over a whole game holds the page for the whole run. progress gets
 * the fraction done after each piece (0..1). cancelled() is asked before each piece. Resolves true when every piece ran, false
 * when cancelled first. Pure: the caller gives the step, the pause and the clock.
 */
export async function inChunks(total, { chunk, step, pause = async () => {}, progress = () => {}, cancelled = () => false }) {
  for (let at = 0; at < total; ) {
    if (cancelled()) return false;
    const until = Math.min(total, at + chunk);
    step(until);
    at = until;
    progress(at / total);
    if (at < total) await pause();
  }
  return !cancelled();
}

/**
 * The arrival note a real plane's touchdown shows in the clip, "Arrived from <city>": the note the game made when the plane touched
 * down (main.js arrivals, by aircraft id), or '' when there is none.
 */
export function arrivalNoteOf(notes, a) {
  return (notes && a && notes.get(a.id)) || '';
}

/** The runway end a plane lands on at zone z (main.js landEndIdent). */
function landEnd(sim, a, z) {
  if (!z) return null;
  if (z.kind !== 'runway') return z.activeIdent;
  const g = sim.landGeometry(a, z);
  return g === z ? z.activeIdent : g.ident;
}

/** The wind as the tower reads it (main.js windWords): "240 at 12", "240 at 12 gusting 18", or calm. */
export function windWords(w) {
  if (!w || w.windKt < 3) return 'calm';
  const gust = w.gustKt > w.windKt + 4 ? ` gusting ${Math.round(w.gustKt)}` : '';
  return `${String(Math.round(w.windDir / 10) * 10 || 360).padStart(3, '0')} at ${Math.round(w.windKt)}${gust}`;
}

/**
 * A radio that captions instead of speaking: the game's own phrases (radio.js) and its check-in throttle, each call collected in
 * `out` (callsFor and checkInCalls take them from there). One per clip, so the throttle runs as it does in the game.
 */
export function captionRadio(facility = '') {
  const r = Object.create(Radio.prototype);
  Object.assign(r, { facility, n: 0, accent: 'US', lastCheckIn: -99, out: [] });
  r.say = (who, msg, prio = 2) => {
    const speaker = typeof who === 'string' ? who : who.live || isSleigh(who) ? who.callsign : TYPE_WORD[who.cls] || 'AIRCRAFT';
    r.out.push({ who: TAG[speaker] || speaker, msg, prio });
  };
  return r;
}

/** A plane's check-in as the game's radio makes it when it enters (main.js radioCheckIns), as captions. */
export function checkInCalls(a, simTime, env) {
  env.radio.checkIn(a, simTime);
  return env.radio.out.splice(0);
}

/**
 * The radio calls one sim event makes, with the game's own phrases (the same calls main.js handleEvents makes), every real plane
 * named as the game names it. env: { sim, radio (captionRadio), wind } (wind is windWords(weather) now). Returns [{ who, msg, prio }]
 * in the order they are said. Events that make no call return [].
 */
export function callsFor(ev, env) {
  const { sim } = env;
  const r = env.radio;
  const a = ev.aircraft || null;
  switch (ev.kind) {
    case 'lock': {
      const z = ev.zone;
      const real = ev.aircraft;
      const eta = (o) => (o.state === 'landing' ? -1 : ((o.path.length - o.pathIdx) * TUNING.pathMinSpacing) / (CLASSES[o.cls].speed * (o.speedMul || 1)));
      const mine = eta(real);
      const ahead = z.kind === 'runway'
        ? sim.aircraft.filter((o) => o !== real && o.target === z.id && (o.state === 'fly' || o.state === 'landing') && !o.departure && eta(o) < mine)
          .sort((p, q) => eta(p) - eta(q))
        : [];
      r.cleared(a, z, env.wind, ahead, landEnd(sim, real, z));
      break;
    }
    case 'touchdown': {
      const z = ev.aircraft.target != null ? sim.zone(ev.aircraft.target) : null;
      if (z) r.touchdown(a, z, sim.landed);
      break;
    }
    case 'emergency': {
      r.emergency(a, ev.type, null, null);
      break;
    }
    case 'prox':
      if (ev.a && ev.b && ev.a.state === 'fly' && ev.b.state === 'fly' && !ev.a.ground && !ev.b.ground) r.nearMiss(ev.a, ev.b);
      break;
    case 'runwayBusy':
      r.goAround(a, ev.zone);
      break;
    case 'stack':
      r.stack(a, ev.fix.name, ev.level);
      break;
    case 'hold':
      r.hold(a);
      break;
    case 'holdShort':
      if (ev.aircraft.departure) r.holdShort(a, sim.zone(ev.aircraft.departure.runway));
      break;
    case 'taxi':
    case 'cleared': {
      const z = ev.aircraft.departure && sim.zone(ev.aircraft.departure.runway);
      if (!z) break;
      if (ev.kind === 'taxi') r.taxi(a, z, ev.aircraft.taxiVia);
      else r.takeoff(a, z, env.wind);
      break;
    }
    case 'knocked':
      r.turbulence(a, ev.why);
      break;
    case 'rwyClosing':
      r.runwayClosing(ev.zone.activeIdent, ev.reason, ev.secs);
      break;
    case 'rwyClosed':
      r.runwayClosed(ev.zone.activeIdent);
      break;
    case 'rwyOpen':
      r.runwayOpen(ev.zone.activeIdent, ev.cancelled);
      break;
    case 'bank':
      r.bank(ev.phase);
      break;
    case 'santaSoon':
      r.santaSoon();
      break;
    default:
      break;
  }
  return r.out.splice(0);
}

/** A caption's read time, as the ticker reads a call (radio.js update: typed, then held long enough to read), in seconds. */
export function readSeconds(msg) {
  return msg.length / 45 + Math.max(1.3, msg.length / 30);
}

/**
 * The captions on the video's timeline (video seconds). A call starts when its event happens, or when the call before it has been
 * read (never two at once); a call that would wait more than MAX_WAIT_S is dropped, as the ticker drops the least important calls.
 */
const MAX_WAIT_S = 3;
export class Captions {
  constructor() {
    this.cues = [];
    this.free = 0; // the video second the last caption ends
  }

  /** Queues the calls of one event at video second t (their words are the game's own). */
  add(t, calls) {
    for (const c of calls) {
      const t0 = Math.max(t, this.free);
      if (t0 - t > MAX_WAIT_S) continue;
      const t1 = t0 + readSeconds(c.msg);
      this.cues.push({ t0, t1, who: c.who, msg: c.msg });
      this.free = t1;
    }
  }

  /** The caption on screen at video second t, or null. */
  at(t) {
    return this.cues.find((c) => t >= c.t0 && t < c.t1) || null;
  }
}

/** The closing words of a video: the daily template or "47 at DFW. Can you beat it?" (the owner's example). */
export function hookLine(r) {
  if (r.daily) return `Daily #${r.daily}: ${r.score.toLocaleString('en-US')} point${r.score === 1 ? '' : 's'}. Same traffic for everyone. Your turn.`;
  return `${r.score.toLocaleString('en-US')} at ${r.iata || r.icao}. Can you beat it?`;
}

/** The words of the top band: the wordmark, the tagline, the tag (Daily #N or Time-lapse) and where to get the game (its Google Play page). */
export function topBand(r, clip) {
  return {
    wordmark: 'SHORT FINAL',
    tagline: 'Real flights. Any airport.',
    tag: r.daily ? `DAILY #${r.daily}` : r.rush ? `Rush · ${r.iata || r.icao}` : clip.lapse ? 'TIME-LAPSE' : '',
    where: 'Free on Google Play',
  };
}

/**
 * The map's view for a whole-airport clip (the best moment, the time-lapse, and a crash clip with no crash planes to follow): the whole
 * airspace at the fit zoom, as the game shows it when a game starts (renderer.setWorld: centred, zoom 1), held still. In the taller
 * band the airspace sits in the middle with the band's ground above and below it. The crash clip follows its planes instead
 * (videocam.js).
 */
export function clipView(W, H = WORLD_H) {
  return { cx: W / 2, cy: H / 2, zoom: 1 };
}

// the caption card: a speaker's row, then the call, a line each (videorender.js drawFrame)
export const CAPTION_LINE = 52, CAPTION_MAX_LINES = 3;

// what a crash clip follows, in words (the card under the map says it when no radio call is on)
const WHY = { collision: 'two planes that collided', glide: 'plane that lost its engines', fuel: 'plane that ran out of fuel', wake: 'plane caught in wake turbulence', storm: 'plane caught in the storm' };

/**
 * The card under the map when no radio call is on (drawn in the same place and size as a call, so the frame never has an empty band):
 * { who, msg }. A Last 20 s that follows planes says what they are; the other clips say what they show.
 */
export function slotWords(plan, { crash = null, followed = 0 } = {}) {
  if (plan.key === 'lapse') return { who: 'WHOLE GAME', msg: 'The whole game in 20 seconds.' };
  if (plan.key === 'best') return { who: 'WHOLE AIRPORT', msg: 'The best 20 seconds of the game.' };
  if (followed && crash) return { who: 'TRACKING', msg: `Following the ${WHY[crash.reason] || 'planes that crashed'}.` };
  return { who: 'WHOLE AIRPORT', msg: `The last ${Math.round(Math.min(CLIP_S, plan.end))} seconds of the game.` };
}
/** The caption card's height for `lines` lines of its call. */
export function captionHeight(lines) {
  return 100 + lines * CAPTION_LINE + 22;
}

// the frame's words, top down (video px): the top block (the brand, then the airport and the live score) ends at TOP_END; the closing
// line starts at HOOK_TOP and the key sits at KEY_Y; GAP is the space between a part and the map band
export const TOP_END = 540, GAP = 44, HOOK_TOP = 1690, KEY_Y = VIDEO_H - 70;

/**
 * Where the frame's parts sit: the map band is full width and centred when it can be, the words sit above it (the brand, the airport
 * and the live score) and below it (the radio caption under the band, the closing line and the key). No word lands on the band. A band
 * taller than the frame's room (a screen narrower than 2 to 1) moves up just far enough to keep a three-line caption above the closing
 * line. Returns { bandY, bandEnd, brandY, airportY (the baseline of the code and the score), captionY (the card's top), hookY, keyY }.
 */
export function frameLayout(bandH) {
  const centred = Math.round((VIDEO_H - bandH) / 2);
  const bandY = Math.min(Math.max(centred, TOP_END + GAP), HOOK_TOP - GAP - captionHeight(CAPTION_MAX_LINES) - bandH);
  const bandEnd = bandY + bandH;
  return { bandY, bandEnd, brandY: 96, airportY: 470, captionY: bandEnd + GAP, hookY: HOOK_TOP, keyY: KEY_Y };
}

/**
 * The bottom block's words: the airport (its code and name), the live score (`live`: the score on the frame, counting up through
 * the clip; the game's final score when it is not given), and the closing hook, which always quotes the game's final score. soFar: the
 * clip ends before the game does, so the live score is not the final one and its word says so (POINTS SO FAR), beside the hook's
 * final score (the owner's review of 2.4: the two read as one score when the word did not say which).
 */
export function bottomBlock(r, live = r.score, soFar = false) {
  const word = live === 1 ? 'POINT' : 'POINTS';
  return {
    code: r.iata || r.icao,
    name: r.city || r.name || '',
    score: live.toLocaleString('en-US'),
    points: soFar ? `${word} SO FAR` : word,
    hook: hookLine(r),
  };
}
