// Replay format, version 1 (frozen). A replay is the game's record of one run: enough for the server to run the same
// sim (simdriver.js) and check the outcome. The format is JSON, then gzip through CompressionStream, and a packed replay
// is at most REPLAY_MAX_PACKED bytes; the server rejects larger. A change to a field's meaning or shape is a new version (v: 2).
// An optional value added at the end of a field within version 1 is not one: a reader without it uses its default. The 'n'
// lift's view [id, k, ui] is such a value (2.4, DECISIONS 199(d)); a lift without one uses the reference phone's view.
//
//   {
//     f: 'sf-replay', v: 1,
//     app: '2.3',                        // app version; maps to a bundled sim version on the server
//     board: 'level' | 'daily' | 'weekend',
//     level, levels: [...], reasons: [], // reasons must be empty for a ranked submission
//     icao, daily: null | dayNumber, tz: 'America/Chicago',
//     weekend: <W>,                      // a weekend event game only (3.3): the weekend's Saturday day number; no other game has the key
//     seed: <uint32>,                    // the daily seed is derived from dayNumber and checked
//     layout: '<sha256 hex>',
//     W: <world width>, H: <world height>, hud: { hard: [...], soft: [...] },   // device-dependent sim inputs (T18)
//              H is WORLD_H (540) for a landscape game. An upright game (3.3, DECISIONS 441) has its own H; a reader without one uses 540.
//     setup: { firstGame, bankFrom, firstAfter, nextShift, nextStorm, fixesHidden, wxSeed, country, diff, realOnly,
//              beginnerWeather },                            // save-dependent setup (T19)
//     airport: { ...the record the world builder reads },
//     steps: <total fixed steps at game end>,
//     end: { score, landed, landedLive, departed, pax, streak, time, crash: null | { t, reason } },
//     inputs: [[step, kind, payload...], ...],
//     feed:   [[step, feedState, rows, callsigns | null], ...],
//     wx:     [[step, metarParsed], ...]
//   }
//
// inputs: each entry's kind is one of INPUT_KINDS. path, circle, loop, hold, dep-tap and rewind are the player's moves
// (a rewind also records the simulated-planes purge it runs on real-only). A path is [op, id, ...]: 'b' (begin) and 'e'
// (extend) carry the finger's point, [id, x, y]; 'n' (lift) carries the view it lifted in, [id, k, ui]: k is CSS px per
// world unit (the zoom, pinch included) and ui the UI scale, which set a hold's touch target (sim.js fixHit, stacks.js holdHit).
// Replays from before 2.4 have no view on a lift: the sim uses the reference phone's. 'c' (carry on, 2.6) is a finger that takes
// a free path's tail and carries the path on: [id, x, y], as 'b' does (sim.js carryPath). A 2.6 op is a new value of an existing
// field, not a new field: replays from before 2.6 never carry one, so their meaning is unchanged and the format stays version 1.
// lvl is a level change, with the new diff.
// dep is departures on or off; rpo is the real-planes switch; ovr is the simulated-planes override on or off; hud is
// the device rectangles changing; wxsev is a weather severity change; fixes is the holding fixes shown (the tip, midgame.js
// revealFixes: the fixes are not drawn before it, so a path cannot end on one). Fast-forward is not recorded: it only changes
// how many steps run per frame.
//
// feed rows are the director's input only, per tick: [icao24, callsign, cls, arriving, eta, inArea, areaKey, bearing,
// altitude, velocity] for arriving or inArea flights, eta to 0.01 s and bearing to 1 degree. callsigns is set once,
// at the first 'working' tick, for noteLive; every other tick has null.
//
// The step order is simdriver.js; this file holds the format, the Recorder that writes it, and the feed projection both the live
// game and a replay feed the director with (so a recorded tick and a live tick are the same numbers).

import { WORLD_H } from './config.js?v=86c2b44d';

export const REPLAY_FORMAT = 'sf-replay';
export const REPLAY_VERSION = 1;
// The server's cap on a packed replay. Replays are stored as D1 blobs (no R2), and a D1 row holds 2,000,000 bytes.
export const REPLAY_MAX_PACKED = 1.5 * 1024 * 1024;
export const REPLAY_BOARDS = Object.freeze(['level', 'daily', 'weekend']);
export const INPUT_KINDS = Object.freeze(['path', 'circle', 'loop', 'hold', 'dep-tap', 'rewind', 'lvl', 'dep', 'rpo', 'ovr', 'hud', 'wxsev', 'fixes']);

// The director's input per tick. Only arriving and in-area flights reach the director (director.js: confirmed, area, and
// upgradeInPlay), and it reads ten fields of each. Eta is kept to 0.01 s and bearing to 1 degree; the live game uses the
// same rounded numbers, so a replay gives the same spawns (feed-projection.test.mjs).
export const FEED_FIELDS = Object.freeze(['icao24', 'callsign', 'cls', 'arriving', 'eta', 'inArea', 'areaKey', 'bearing', 'altitude', 'velocity']);

const round = (v, unit) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v / unit) * unit : v);

/**
 * The director's rows from the feed snapshot (LiveFeed.snapshot): arriving or in-area flights, ten fields, rounded. Missing
 * values are null, never undefined: the director does arithmetic on eta, and null and undefined differ there (null is 0).
 */
export function projectFeed(flights, { exact = false } = {}) {
  // exact: no rounding (the tests use it to show that the filtering alone changes nothing for the director)
  const eta = exact ? (v) => v ?? null : (v) => round(v ?? null, 0.01);
  const bearing = exact ? (v) => v ?? null : (v) => round(v ?? null, 1);
  const rows = [];
  for (const f of flights || []) {
    if (!f.arriving && !f.inArea) continue;
    rows.push({
      icao24: f.icao24, callsign: f.callsign ?? null, cls: f.cls ?? null, arriving: !!f.arriving, eta: eta(f.eta), inArea: !!f.inArea,
      areaKey: f.areaKey ?? null, bearing: bearing(f.bearing), altitude: f.altitude ?? null, velocity: f.velocity ?? null,
    });
  }
  return rows;
}

/** A row as the replay stores it: the ten fields, in FEED_FIELDS order. */
export const rowTuple = (r) => FEED_FIELDS.map((k) => r[k] ?? null);

/** A stored row back to the object the director reads. */
export function rowFromTuple(t) {
  const r = {};
  FEED_FIELDS.forEach((k, i) => {
    r[k] = t[i];
  });
  return r;
}

/**
 * Records one game for the replay (section 6.6). The game's mutators call input(step, kind, ...payload) with the fixed step
 * count they happen at; the director's ticks call feedTick. build(end) gives the replay object; packReplay gzips it.
 */
export class Recorder {
  constructor({ seed, icao, tz, layout, board, daily = null, weekend = null, levels = [], reasons = [], app, W, H = WORLD_H, hud, setup, airport = null }) {
    this.head = {
      f: REPLAY_FORMAT, v: REPLAY_VERSION, app, board, level: levels[levels.length - 1] || null, levels: [...levels], reasons: [...reasons],
      icao, daily, tz, seed: seed >>> 0, layout, W, H, hud: hud ? { hard: hud.hard.map((r) => ({ ...r })), soft: hud.soft.map((r) => ({ ...r })) } : null,
      setup: { ...setup }, airport,
    };
    // the weekend's day is written for a weekend game only, so a daily or a level replay is what it was before 3.3
    if (weekend != null) this.head.weekend = weekend;
    this.inputs = [];
    this.feeds = [];
    this.wxs = [];
  }

  input(step, kind, ...payload) {
    if (!INPUT_KINDS.includes(kind)) throw new Error(`replay: unknown input kind ${kind}`);
    this.inputs.push([step, kind, ...payload]);
  }

  /** A director tick: the feed's state, the projected rows, and (once, at the first working tick) the callsigns for noteLive. */
  feedTick(step, state, rows, callsigns) {
    this.feeds.push([step, state, rows.map(rowTuple), callsigns || null]);
  }

  /** The weather inputs when they change (the METAR-derived object). */
  wx(step, parsed) {
    this.wxs.push([step, parsed]);
  }

  /** The finished replay. end: { score, landed, landedLive, departed, pax, streak, time, crash, steps }. */
  build(end) {
    const { steps, ...outcome } = end;
    // copies: packing is asynchronous, and nothing recorded after the game ends may join this replay
    return { ...this.head, steps, end: outcome, inputs: this.inputs.slice(), feed: this.feeds.slice(), wx: this.wxs.slice() };
  }
}

/** Gzip of the replay's JSON, through CompressionStream (browsers, the Android WebView, and Workers). */
export async function packReplay(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The inverse of packReplay. Throws on bytes that are not gzip JSON. */
export async function unpackReplay(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
