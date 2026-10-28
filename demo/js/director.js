// The Traffic Director fills the sky to a difficulty's target, every spawn slot in this order: a confirmed real arrival
// (arrivals.js, soonest first), then the most likely real plane in the area (area.js), then a simulated flight (no
// callsign). The target is met first, always. Real planes only (realOnly) is a switch on any level: no simulated flight
// is ever made, so the sky holds what the real sky can give and says so when it is short (starved). It also scales
// weather and emergencies (none on real planes only).
import { makeRng } from './util.js?v=2f66fd5f';
import { CLASSES } from './config.js?v=2f66fd5f';
import { AIRLINES } from './airlines.js?v=2f66fd5f';
import { classifyFlight } from './classify.js?v=2f66fd5f';
import { usable } from './feedstate.js?v=2f66fd5f';
import { compareKeys } from './area.js?v=2f66fd5f';
import { SANTA_AT_S, SANTA_SOON_S, SANTA_CALLSIGN } from './santa.js?v=2f66fd5f';

export const DIFFICULTIES = {
  // a gentle start: a handful of aircraft, no rushes, storms, emergencies or departures (main.js)
  beginner: { label: 'Beginner', start: 1, max: 4, rampSec: 600, gap: [11, 8], add: true, hold: true, weather: 0.15, emergenciesPerMin: 0 },
  easy:   { label: 'Easy', start: 2, max: 7, rampSec: 420, gap: [7, 4.5], add: true, hold: true, weather: 0.4, emergenciesPerMin: 0.12 },
  normal: { label: 'Normal', start: 3, max: 11, rampSec: 360, gap: [5.5, 3], add: true, hold: true, weather: 0.7, emergenciesPerMin: 0.3 },
  hard:   { label: 'Hard', start: 4, max: 18, rampSec: 270, gap: [4.5, 2.3], add: true, hold: false, weather: 1.0, emergenciesPerMin: 0.5 },
  chaos:  { label: 'Chaos', start: 5, max: 20, rampSec: 240, gap: [3.5, 2.0], add: true, hold: false, weather: 1.4, emergenciesPerMin: 0.9 },
};

/**
 * The home screen's backdrop: the Normal pace, and with Real planes only a director that brings in nothing but real
 * flights (none without a usable feed), so the home screen never shows a made-up aircraft in that mode.
 */
export const backdropOptions = (realOnly) => ({ difficulty: 'normal', realOnly: !!realOnly });

/** Target number of arrivals in the air at game time t. */
export function targetTraffic(diff, t) {
  const d = DIFFICULTIES[diff];
  const k = Math.min(1, t / d.rampSec);
  return Math.round(d.start + (d.max - d.start) * (k * (2 - k))); // ease-out ramp
}

/**
 * The arrival rushes per level (gameplay 3.2). amp: the level's rise in a push; from: the earliest game time a rush can
 * come (a first-ever game waits for 180 s on top of this, main.js); origin: when the first push starts; push: its length
 * (s); gap: the spawn gap's multiplier in a push; noBurst: no catch-up spawns in a push (one plane per gap). Hard and
 * Chaos are the v1.33 banks. Beginner has no rushes.
 */
export const RUSH = {
  easy: { amp: 0.10, from: 240, origin: 100, push: 45, gap: 0.65, noBurst: false },
  normal: { amp: 0.15, from: 180, origin: 180, push: 35, gap: 0.85, noBurst: true },
  hard: { amp: 0.35, from: 100, origin: 100, push: 45, gap: 0.65, noBurst: false },
  chaos: { amp: 0.25, from: 100, origin: 100, push: 45, gap: 0.65, noBurst: false },
};
const BANK_PERIOD = 150; // s from one push to the next
const HEADS_UP = 5; // s of warning before a push (the 'rushSoon' event)
const BANK_RAMP = 10; // s: a bank moves the level over this long, so no step is more than the spawns can follow

/**
 * Hub-style arrival banks: a push (push s long, from origin), a breather, a 30 s lull, every 2.5 minutes. Pure function of
 * game time, so it rewinds for free.
 */
export function bankPhase(t, origin = 100, push = 45) {
  if (t < origin) return 'normal';
  const p = (t - origin) % BANK_PERIOD;
  return p < push ? 'push' : p >= 90 && p < 120 ? 'lull' : 'normal';
}

/**
 * The banks' multiplier on the level at game time t: up over BANK_RAMP s at the start of a push, down over BANK_RAMP s at
 * the start of a lull, and back up over BANK_RAMP s when the lull ends. A step of a third of the level (six planes on Hard,
 * in a second) is more than the spawns can refill, so the level moves instead of jumping. Pure, so it rewinds for free.
 */
export function bankLevel(t, amp, origin = 100, push = 45) {
  if (t < origin) return 1;
  const p = (t - origin) % BANK_PERIOD;
  if (p < push) return 1 + amp * Math.min(1, p / BANK_RAMP);
  if (p < 90) return 1;
  if (p < 120) return 1 - amp * Math.min(1, (p - 90) / BANK_RAMP);
  return 1 - amp * Math.max(0, 1 - (p - 120) / BANK_RAMP);
}

/** The start of the first push at or after t (origin when t is before it). */
export function nextPushAt(t, origin) {
  if (t < origin) return origin;
  return origin + BANK_PERIOD * Math.ceil((t - origin) / BANK_PERIOD);
}

export function spawnGap(diff, t) {
  const d = DIFFICULTIES[diff];
  const k = Math.min(1, t / Math.max(1, d.rampSec));
  return d.gap[0] + (d.gap[1] - d.gap[0]) * k;
}

/**
 * The pace of a field by its runways (decision 206): a one-runway field (Lukla's 503 m strip, where every arrival lands on
 * the same strip) brings half the level and half the spawn rate, on every level and in the daily; two or more runways bring
 * the whole pace, as before.
 */
export function runwayPace(runways) {
  return Math.min(1, Math.max(runways, 1) / 2);
}

/** A one-runway field brings no arrival while this many are already locked to land on its strip (decision 206). */
export const STRIP_QUEUE = 2;

/** Arrivals locked to a runway or a pad that are still flying their route (not yet down): the queue on a strip. */
function lockedQueue(sim) {
  let n = 0;
  for (const o of sim.aircraft) if (o.state === 'fly' && !o.departure && o.target != null && o.target >= 0) n++;
  return n;
}

const DEFAULT_AIRLINES = {
  US: ['AAL', 'DAL', 'UAL', 'SWA', 'SKW', 'ENY', 'RPA', 'ASA', 'JBU', 'FDX'],
  GB: ['BAW', 'EZY', 'RYR', 'VIR', 'LOG', 'EXS', 'TOM', 'SHT'],
  CA: ['ACA', 'WJA', 'JZA', 'POE', 'WEN'],
  MX: ['AMX', 'VOI', 'VIV', 'SLI'],
  AU: ['QFA', 'VOZ', 'JST', 'QLK', 'RXA'],
  DE: ['DLH', 'EWG', 'CLH', 'CFG'], FR: ['AFR', 'HOP', 'TVF', 'EZY'], ES: ['IBE', 'VLG', 'RYR', 'AEA'],
  NL: ['KLM', 'KLC', 'TVF'], IE: ['EIN', 'RYR', 'EAI'], IT: ['ITY', 'RYR', 'EZY'],
  AE: ['UAE', 'FDB', 'ETD'], JP: ['JAL', 'ANA'], CN: ['CCA', 'CES', 'CSN'],
  _: ['DLH', 'AFR', 'KLM', 'UAE', 'QTR', 'THY', 'BAW', 'RYR', 'EZY'],
};
const REG_PREFIX = { US: 'N', GB: 'G', CA: 'CF', DE: 'D', FR: 'F', AU: 'VH', NZ: 'ZK', IE: 'EI', NL: 'PH', CH: 'HB' };

const REAL_MIN_GAP = 3.5; // the shortest gap between two extra real arrivals (s), and the pace of an extra with no next one
const REAL_MAX_GAP = 45; // the longest wait between two extra real arrivals (s): a feed that comes up busy is not sped up forever
const REAL_TRIES = 12; // real candidates tried in one step, best first, before a simulated plane takes the slot (a busy lane skips one)
const STARVED_AFTER = 10; // real planes only: no real arrival for this long (game time) while the level is short
const CATCH_UP = 2; // this many planes under the level: a plane comes in on every step until the level is back (no gap)
const CATCH_UP_FROM = 60; // ...but not in the first minute: the opening keeps the level's own gap (decision 13: no burst at the start)

export class TrafficDirector {
  /**
   * @param daily  the daily challenge: v1.32's pacing, byte for byte (no catch-up spawns). main.js sets it; the daily
   *               golden (tests/golden-trace.mjs) runs the defaults, which agree with it wherever the catch-up does not apply.
   */
  constructor({ difficulty = 'normal', country = 'US', seed = 1, landable = ['light', 'regional', 'narrowbody', 'heavy', 'heli'], airlinePool = null, realOnly = false, daily = false, pace = 1, rush = null, santa = false }) {
    this.diff = DIFFICULTIES[difficulty] ? difficulty : 'normal';
    this.cfg = DIFFICULTIES[this.diff];
    // a rush of the game's own (the weekend event's, weekend.js WEEKEND_RUSH); null keeps the level's RUSH (the other games)
    this.rush = rush || null;
    // Santa (santa.js, 3.4): the sleigh is brought in once, at SANTA_AT_S, when the setup flies it (simdriver.js makeGame)
    this.santa = !!santa;
    this.santaSoonGiven = false; // the heads-up has been given (once)
    this.santaIn = false; // the sleigh has been brought in (once)
    this.country = country;
    this.rng = makeRng(seed ^ 0x51ed);
    // the callsigns of the games that are not the daily draw from their own stream (callsignFor, DECISIONS 436): a callsign is never
    // shown for a simulated plane, so its draws must not move the planes that come after it (a live feed changes how many there are)
    this.crng = makeRng(seed ^ 0xca11);
    this.landable = new Set(landable);
    this.pool = airlinePool || new Map(); // airline code -> count seen live this session
    this.realOnly = !!realOnly; // Real planes only: no simulated flight is ever brought in, on any level
    this.daily = !!daily;
    this.pace = pace; // the field's pace (runwayPace): the level and the spawn gap scale with it, and the strip's queue caps it
    this.starved = false; // real planes only: the real sky cannot fill the level (the card and banner say so)
    this.starvedSince = null; // game time the sky went short, or null
    this.shortSince = null; // game time the sky went two or more planes under the level, or null (judgeStarved)
    this.targetNow = 0; // the level at this step (spawnReal judges the sky again with the plane in it)
    this.spawnedLive = new Set();
    this.lastSpawnAt = -99;
    this.realNextAt = -99; // when the next extra real arrival may come in (paced by the real sky, Hard and Chaos)
    this.rushWarnedFor = null; // the last push start the heads-up was given for (once per push)
    this.stats = { live: 0, added: 0, heldBack: 0 };
  }

  /** The level changes mid-game (midgame.js applyLevel): the target, gap, banks and hold follow at the next step. */
  setDifficulty(diff) {
    if (!DIFFICULTIES[diff]) return;
    this.diff = diff;
    this.cfg = DIFFICULTIES[diff];
  }

  /** The switch: on or off, at any time. Turning it on clears the short-sky state (the caller purges the simulated flights). */
  setRealOnly(on) {
    this.realOnly = !!on;
    this.starved = false;
    this.starvedSince = null;
    this.shortSince = null;
  }

  setStarved(on, t) {
    if (on === this.starved) return;
    this.starved = on;
    this.starvedSince = on ? t : null;
  }

  /**
   * Real planes only: the real sky is short when the level is short and either no real plane has come in for STARVED_AFTER
   * (the feed has nothing it can use), or the sky has been two or more planes under the level for that long (the pace or the
   * lanes are holding them back, with planes waiting or not). Runs every step, before any spawn in that step.
   */
  judgeStarved(ok, inAir, target, t) {
    const deep = ok && inAir <= target - CATCH_UP;
    if (!deep || t < (this.shortSince ?? Infinity)) this.shortSince = deep ? t : null;
    const quiet = t - this.lastSpawnAt >= STARVED_AFTER;
    const long = this.shortSince != null && t - this.shortSince >= STARVED_AFTER;
    this.setStarved(ok && inAir < target && (quiet || long), t);
  }

  /** Record airlines seen in the live feed (for plausible simulated callsigns). */
  noteLive(flights) {
    for (const f of flights) {
      const m = /^([A-Z]{3})\d/.exec(f.callsign || '');
      if (m && AIRLINES[m[1]]) this.pool.set(m[1], (this.pool.get(m[1]) || 0) + 1);
    }
  }

  /**
   * One director step, every 0.25 s of game time. Fills a spawn slot, if one is due, in this order: a confirmed real
   * arrival, then a real plane in the area, then a simulated flight (never on real planes only).
   * @param sim    the Sim (needs time, arrivalsInAir(), queueArrival(spec), events)
   * @param live   live flight snapshot (LiveFeed.snapshot()) or []
   * @param state  the feed's state for the player (feedstate.js). Only 'working' and 'demo' bring in real planes.
   * @returns the spawn spec made, or null
   */
  update(sim, live, state) {
    const t = sim.time;
    const ok = usable(state);
    if (ok) this.upgradeInPlay(sim, live);
    if (!ok) {
      this.stats.heldBack = 0;
      this.setStarved(false, t);
      this.shortSince = null; // the short sky is judged again from the feed's return (judgeStarved)
      if (this.realOnly) return null; // no feed: no new planes at all
    }
    // the sleigh is a simulated plane, so it is not brought in on real planes only (no simulated flight is ever made there)
    if (this.santa && !this.realOnly) {
      const sleigh = this.santaTick(sim, t);
      if (sleigh) return sleigh;
    }
    // a real arrival: confirmed landing here (soonest first), or a real plane in the area (most likely first); not yet spawned
    const pick = (f, want) => want(f) && f.cls && !this.spawnedLive.has(f.icao24) && this.landable.has(f.cls);
    const confirmed = ok ? live.filter((f) => pick(f, (g) => g.arriving)).sort((a, b) => a.eta - b.eta) : [];
    const area = ok ? live.filter((f) => pick(f, (g) => g.inArea)).sort((a, b) => compareKeys(a.areaKey, b.areaKey)) : [];
    const inAir = sim.arrivalsInAir();
    // the level's pace: the target and the gap, with the arrival banks (Real planes only keeps them: the pace is the level's)
    let target = targetTraffic(this.diff, t);
    let gap = spawnGap(this.diff, t) / this.pace;
    const rush = this.rush || RUSH[this.diff] || null;
    const amp = rush ? rush.amp : 0;
    const origin = rush ? rush.origin : 100, push = rush ? rush.push : 45;
    const gate = rush ? Math.max(this.bankFrom || 0, rush.from) : Infinity;
    const banked = amp && t >= gate;
    const phase = banked ? bankPhase(t, origin, push) : 'normal';
    if (phase !== this.phase) {
      if (this.phase !== undefined && phase !== 'normal' && sim.events) sim.events.push({ kind: 'bank', phase });
      this.phase = phase;
    }
    // the heads-up: 5 s before each push that is a rush on this level (once per push; a rewind re-arms it, snapshot)
    if (rush && phase !== 'push' && sim.events) {
      const next = nextPushAt(t, origin);
      if (next - t <= HEADS_UP && next >= gate && this.rushWarnedFor !== next) {
        this.rushWarnedFor = next;
        sim.events.push({ kind: 'rushSoon', at: next, secs: HEADS_UP });
      }
    }
    if (phase === 'push') gap *= rush.gap;
    // the daily keeps v1.32's banks (steps); the live game moves the level over BANK_RAMP s (bankLevel)
    if (banked && !this.daily) target = Math.max(this.cfg.start, Math.round(target * bankLevel(t, amp, origin, push)));
    else if (phase === 'push') target = Math.round(target * (1 + amp));
    else if (phase === 'lull') target = Math.max(this.cfg.start, Math.round(target * (1 - amp)));
    if (this.pace !== 1) target = Math.max(1, Math.round(target * this.pace)); // a one-runway field's level (runwayPace)
    // on Easy, Normal and Beginner, confirmed arrivals beyond the level wait their turn (Hard and Chaos bring them in)
    this.stats.heldBack = this.cfg.hold ? Math.max(0, confirmed.length - Math.max(0, target - inAir)) : 0;
    this.targetNow = target;
    if (this.realOnly) this.judgeStarved(ok, inAir, target, t);
    else this.setStarved(false, t);
    // two or more planes under the level, after the first minute: a plane comes in on every step until it is back (the daily
    // keeps v1.32's pace). One plane per gap cannot follow a bank change (six planes on Hard), so the refill is one plane per
    // step; the bank ramp keeps each change to what the steps can add. A Normal push brings its planes one at a time (noBurst)
    const noRushBurst = phase === 'push' && !!rush.noBurst;
    if (!this.daily && !noRushBurst && t >= CATCH_UP_FROM && inAir <= target - CATCH_UP) gap = 0;
    if (t - this.lastSpawnAt < gap) return null;
    // a one-runway field: no new arrival while STRIP_QUEUE are already locked to land on its one strip (they queue on it)
    if (this.pace < 1 && lockedQueue(sim) >= STRIP_QUEUE) return null;
    if (inAir >= target) {
      // the level is met: on Hard and Chaos, a confirmed arrival still comes in, paced by the real sky
      if (!this.cfg.hold && confirmed.length && t >= this.realNextAt) return this.spawnReal(sim, confirmed[0], true, confirmed[1]);
      return null;
    }
    // the level is short: a confirmed arrival first, then a real plane in the area (a few, in case one's lane is busy)
    for (const f of confirmed.slice(0, REAL_TRIES)) {
      const spec = this.spawnReal(sim, f, false, null);
      if (spec) return spec;
    }
    for (const f of area.slice(0, REAL_TRIES)) {
      const spec = this.spawnReal(sim, f, false, null);
      if (spec) return spec;
    }
    // no real plane came in: on real planes only the sky stays as it is (judgeStarved says so); otherwise a simulated one
    if (this.realOnly) return null;
    if (this.cfg.add) {
      const spec = this.simulated();
      if (spec && sim.queueArrival(spec)) {
        this.lastSpawnAt = t;
        return spec;
      }
    }
    return null;
  }

  /**
   * Santa (3.4, santa.js): the heads-up SANTA_SOON_S before SANTA_AT_S (the 'santaSoon' event, once), then the sleigh itself as one
   * light arrival at SANTA_AT_S. A lane that is blocked for the moment keeps it to the next step, as any arrival waits. It is a
   * simulated plane with its own callsign, so the sim scores it as any light landing.
   */
  santaTick(sim, t) {
    if (this.santaIn) return null;
    if (!this.santaSoonGiven && t >= SANTA_AT_S - SANTA_SOON_S) {
      this.santaSoonGiven = true;
      if (sim.events) sim.events.push({ kind: 'santaSoon', at: SANTA_AT_S, secs: SANTA_SOON_S });
    }
    if (t < SANTA_AT_S) return null;
    const spec = { cls: 'light', callsign: SANTA_CALLSIGN, live: false };
    if (!sim.queueArrival(spec)) return null;
    this.santaIn = true;
    this.lastSpawnAt = t;
    return spec;
  }

  /**
   * A real arrival into the sky: what the aircraft is doing now (for the radio and the end screen). Its bearing rides on the spec
   * for the feed and the replay; the sim places the plane on a random lane like any other (sim.js queueArrival, 2.2).
   * An extra (Hard and Chaos, when the level is met) is paced: the next one comes in as far behind as the real sky has it
   * (their times to the field), 3.5 to 45 s, so a feed that comes up with five on approach doesn't put them all on screen.
   */
  spawnReal(sim, f, extra, next) {
    const t = sim.time;
    const spec = {
      cls: f.cls, callsign: f.callsign, live: true, confirmed: !!f.arriving, flightId: f.icao24, bearing: f.bearing,
      real: { altFt: f.altitude != null ? Math.round((f.altitude * 3.281) / 100) * 100 : null, kt: f.velocity != null ? Math.round(f.velocity * 1.944) : null },
    };
    if (!sim.queueArrival(spec)) return null;
    this.lastSpawnAt = t;
    this.spawnedLive.add(f.icao24);
    // the sky is judged again with this plane in it: a short sky is one that stays short (judgeStarved), so the flag keeps
    // its start time while the sky stays short, and clears at once when it has come back
    if (this.realOnly) this.judgeStarved(true, sim.arrivalsInAir(), this.targetNow, t);
    if (extra) this.realNextAt = t + Math.min(REAL_MAX_GAP, Math.max(REAL_MIN_GAP, next ? next.eta - f.eta : REAL_MIN_GAP));
    return spec;
  }

  /**
   * A plane in the game that the feed now confirms as landing here is confirmed too: one-way, never downgraded (it stays
   * confirmed when its flight leaves the feed, or the feed fails). Emits one 'confirmed' event for it (no note: every real plane has the one look, requirements item 1).
   */
  upgradeInPlay(sim, live) {
    const landing = new Map();
    for (const f of live) if (f.arriving) landing.set(f.icao24, f);
    if (!landing.size) return;
    for (const list of [sim.aircraft, sim.warnings]) {
      for (const a of list) {
        // only a plane still flying in: one that has begun its landing roll has its bonus already (sim.startLanding)
        if (!a.live || a.confirmed || !a.flightId || !landing.has(a.flightId) || (a.state && a.state !== 'fly')) continue;
        a.confirmed = true;
        a.upgraded = true;
        sim.events.push({ kind: 'confirmed', aircraft: a });
      }
    }
  }

  pickClass() {
    const w = { light: 2.2, regional: 2.4, narrowbody: 3, heavy: 1.1, heli: 1 };
    const entries = Object.entries(w).filter(([c]) => this.landable.has(c));
    return entries.length ? this.rng.weighted(entries) : null;
  }

  /**
   * A plausible simulated arrival for this airport. It has no callsign: the callsign is drawn and
   * thrown away, so the random sequence is what it was (the daily challenge is seeded).
   */
  simulated() {
    const cls = this.pickClass();
    if (!cls) return null;
    this.callsignFor(cls);
    return { cls, callsign: '', live: false };
  }

  callsignFor(cls) {
    // the daily keeps the shared stream, as it always had; every other game draws from crng, so its callsigns (never shown, and the
    // only thing a live feed's airlines change) cannot move the planes that follow (DECISIONS 436)
    const r = this.daily ? this.rng : this.crng;
    if (cls === 'light' || cls === 'heli') {
      const p = REG_PREFIX[this.country] || 'N';
      const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
      if (p === 'N') return `N${r.int(1, 9)}${r.int(0, 99)}${L[r.int(0, L.length - 1)]}${L[r.int(0, L.length - 1)]}`;
      let s = p;
      while (s.length < 5) s += L[r.int(0, L.length - 1)];
      return s;
    }
    // prefer airlines actually seen here this session whose fleet fits the class
    const fits = (code) => {
      const kind = AIRLINES[code] && AIRLINES[code][1];
      if (cls === 'regional') return kind === 'R' || kind === 'B';
      if (cls === 'heavy') return kind === 'L' || kind === 'C' || kind === 'M';
      return kind === 'M' || kind === 'X' || kind === 'L';
    };
    let pool = [...this.pool.keys()].filter(fits);
    if (!pool.length) pool = (DEFAULT_AIRLINES[this.country] || DEFAULT_AIRLINES._).filter(fits);
    if (!pool.length) pool = DEFAULT_AIRLINES._.filter(fits);
    if (!pool.length) pool = ['AAL'];
    for (let i = 0; i < 6; i++) {
      const code = r.pick(pool);
      const num = cls === 'regional' ? r.int(3000, 6299) : cls === 'heavy' ? r.int(1, 299) : r.int(100, 2999);
      const cs = `${code}${num}`;
      if (classifyFlight({ callsign: cs }) === cls || i === 5) return cs;
    }
    return 'AAL100';
  }

  snapshot() {
    return { spawnedLive: [...this.spawnedLive], lastSpawnAt: this.lastSpawnAt, realNextAt: this.realNextAt, rng: this.rng.getState(), crng: this.crng.getState(), phase: this.phase, rushWarnedFor: this.rushWarnedFor ?? null, santaSoonGiven: this.santaSoonGiven, santaIn: this.santaIn };
  }

  // the level is not in the snapshot: a rewind does not undo a level change (the player's choice, not the sim's state)
  restore(s) {
    this.spawnedLive = new Set(s.spawnedLive);
    this.lastSpawnAt = s.lastSpawnAt;
    this.realNextAt = s.realNextAt ?? -99;
    this.rng.setState(s.rng);
    this.crng.setState(s.crng);
    this.phase = s.phase;
    this.rushWarnedFor = s.rushWarnedFor ?? null;
    this.santaSoonGiven = !!s.santaSoonGiven;
    this.santaIn = !!s.santaIn;
  }

  /** Emergencies per second at this difficulty (Poisson rate). None on real planes only: nothing the game makes up. */
  emergencyRate() {
    return this.realOnly ? 0 : this.cfg.emergenciesPerMin / 60;
  }

  weatherSeverity() {
    return this.cfg.weather;
  }
}

export { CLASSES };
