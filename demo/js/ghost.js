// The heartbeat's look-ahead (gameplay 3.4): a hidden copy of the sim, stepped 3 s ahead with every aircraft following its
// current instructions (drawn paths, approaches, holds, ground traffic). It reports the first collision it finds, or on Hard
// and Chaos a busy runway at touchdown, or a lethal wake encounter (WakeLookahead, the wakes hazards.js would lay and find).
// The real sim is never touched: the ghost has its own zones, its own RNG state and its own copy of the departures' ground
// stepper, and it is restored from a light copy at each run.
import { Sim } from './sim.js?v=7227d0de';
import { Departures } from './departures.js?v=7227d0de';
import { makeRng } from './util.js?v=7227d0de';
import { setActiveEnd } from './airport.js?v=7227d0de';
import { CLASSES } from './config.js?v=7227d0de';
import { airVelOf } from './weather.js?v=7227d0de';
import { WAKE_EVERY, FRESH, wakeHitAt, wakeLethal, highUpAt, laneThroughLethalWake } from './hazards.js?v=7227d0de';

export const HORIZON = 3; // s of look-ahead
export const GHOST_STEP = 1 / 120; // the ghost's fixed step (the sim's own)

const copyVal = (v) => (Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v);

/**
 * A plain copy of one aircraft: its fields, with arrays and small objects copied one level down. Cheaper than structuredClone
 * (sim.snapshot is 1.4 ms at 34 aircraft); enough, because the ghost only assigns to fields and to these one-level copies.
 */
function lightAircraft(a) {
  const b = {};
  for (const k of Object.keys(a)) b[k] = copyVal(a[k]);
  return b;
}

/** The state the ghost needs, copied from the real sim. Fresh each run, so the ghost may own it. */
export function lightSnapshot(real) {
  return {
    time: real.time,
    nextId: real.nextId,
    rng: real.rng.getState(),
    aircraft: real.aircraft.map(lightAircraft),
    warnings: real.warnings.map(lightAircraft),
    zones: real.zones.map((z) => ({ active: z.active, closing: !!z.closing, closed: !!z.closed })),
    wind: { ...(real.wind || { dir: null, kt: 0 }) },
  };
}

/** Puts the ghost into the snapshot's state. Zone copies are the ghost's own, so only they are set up here. */
export function ghostRestore(g, snap) {
  g.time = snap.time;
  g.nextId = snap.nextId;
  g.rng.setState(snap.rng);
  g.aircraft = snap.aircraft;
  g.warnings = snap.warnings;
  g.wind = snap.wind;
  g.zones.forEach((z, i) => {
    const zs = snap.zones[i];
    if (z.kind === 'runway' && z.active !== zs.active) setActiveEnd(z, zs.active);
    z.closing = zs.closing;
    z.closed = zs.closed;
  });
  g.over = false;
  g.crash = null;
  g.pairs.clear();
  g.events = [];
}

/**
 * The wakes of the look-ahead, run the way hazards.js runs them (stepWakes): the fresh wakes now, the wakes the sky's heavies lay
 * in the horizon, and the first lethal encounter, which ends the run with a 'wake' crash. Its clocks start where the real
 * hazards' are, so the same wake is found at the same moment. Wind drift on the planes is not modelled (as for collisions).
 */
class WakeLookahead {
  constructor(g, wakes, air, diff, emitT, checkT) {
    Object.assign(this, { g, wakes, air, diff, emitT, checkT });
  }

  /** The ghost's spawns hold back an arrival whose lane runs through one of these wakes, as the real sim does (sim.entryHazard). */
  entryHazard(ex, ey, heading, cls, live) {
    return laneThroughLethalWake(this.wakes, this.g.aircraft, this.air, this.diff, ex, ey, heading, cls, live);
  }

  step(dt) {
    const g = this.g, [vx, vy] = this.air;
    for (let i = this.wakes.length - 1; i >= 0; i--) {
      const w = this.wakes[i];
      w.age += dt;
      w.x += vx * dt;
      w.y += vy * dt;
      if (w.age >= w.life) this.wakes.splice(i, 1);
    }
    this.emitT += dt;
    if (this.emitT >= WAKE_EVERY) {
      this.emitT = 0;
      for (const a of g.aircraft) {
        const life = CLASSES[a.cls].wakeEmit;
        if (!life || a.state !== 'fly' || a.ground || highUpAt(a, g.time)) continue;
        const back = CLASSES[a.cls].size * 0.9;
        this.wakes.push({ x: a.x - Math.cos(a.heading) * back, y: a.y - Math.sin(a.heading) * back, age: 0, life, owner: a.id });
      }
    }
    this.checkT += dt;
    if (this.checkT < 1 / 30) return;
    this.checkT = 0;
    for (const a of g.aircraft) {
      if (a.state !== 'fly' || a.ground || !a.entered || !CLASSES[a.cls].wakeKill || highUpAt(a, g.time)) continue;
      const hit = wakeHitAt(a, this.wakes);
      if (!hit) continue;
      const owner = g.aircraft.find((o) => o.id === hit.owner);
      if (!wakeLethal(a, owner, this.diff)) continue;
      g.endGame('wake', a.x, a.y, owner ? [a, owner] : [a]);
      return;
    }
  }
}

export class GhostRunner {
  /**
   * @param real  the real Sim (read only: the ghost copies from it)
   * @param o.busyRunwayLoses the level's rule: on Hard and Chaos a runway occupied at touchdown is a crash in the ghost too
   * @param o.hazards the real game's Hazards (its wakes and clocks, and the level from its director); without it no wake is looked ahead
   */
  constructor(real, { busyRunwayLoses = true, horizon = HORIZON, step = GHOST_STEP, hazards = null } = {}) {
    this.real = real;
    this.horizon = horizon;
    this.step = step;
    this.hazards = hazards;
    this.busyRunwayLoses = !!busyRunwayLoses;
    // the ghost's zones are copies (setActiveEnd moves them), and its runway list points at those copies
    const zones = structuredClone(real.world.zones);
    const runways = real.world.runways.map((r) => {
      const i = real.world.zones.indexOf(r);
      return i >= 0 ? zones[i] : null;
    }).filter(Boolean);
    const world = { ...real.world, zones, runways };
    this.ghost = new Sim({ world, seed: real.seed, hudRects: real.hudRects, daily: real.daily, rules: { busyRunwayLoses: this.busyRunwayLoses } });
    // fixes and stands are fixed for the airport and read only in a run
    this.ghost.fixes = real.fixes;
    this.ghost.fixesHidden = real.fixesHidden;
    this.stepper = null;
    this.stepperFor = null;
  }

  /**
   * The ground stepper: Departures' own step, turnaround and taxi-in code on the ghost, without spawns (update is a no-op).
   * It is rebuilt when the real Departures object is replaced (a Departures made mid-game).
   */
  syncStepper() {
    const real = this.real, d = real.departures;
    this.ghost.departures = null;
    if (!d) {
      this.stepper = null;
      this.stepperFor = null;
      return;
    }
    if (this.stepperFor !== d) {
      const s = Object.create(Departures.prototype);
      const runways = d.world.runways.map((r) => this.ghost.zones[real.world.zones.indexOf(r)]).filter(Boolean);
      Object.assign(s, {
        sim: this.ghost, world: { ...d.world, zones: this.ghost.zones, runways }, graph: d.graph, stands: d.stands, exits: d.exits,
        interval: d.interval, rng: makeRng(0), firstAfter: d.firstAfter || 0, departed: 0,
        // read live from the real director: the ghost never changes the real one
        director: { get realOnly() { return !!(real.director && real.director.realOnly); }, callsignFor() {} },
      });
      s.update = () => {};
      this.stepper = s;
      this.stepperFor = d;
    }
    const s = this.stepper;
    s.rng.setState(d.rng.getState());
    s.allowSpawns = d.allowSpawns;
    s.firstAfter = d.firstAfter || 0;
    this.ghost.departures = s;
  }

  /** Restores the ghost from a snapshot (and the ground stepper from the real Departures' current state). */
  restore(snap) {
    ghostRestore(this.ghost, snap);
    this.syncStepper();
  }

  /**
   * The wake look-ahead for this run, or null: only on Hard and Chaos (where a wake is lethal, hazards.js wakeLethal), and only with
   * a light plane flying in the sky to be caught by one. Its wakes are the fresh ones now (a wake only ages, so one not fresh now
   * never is again in the horizon), copied, so the real game's are not touched.
   */
  wakeLookahead(snap) {
    const h = this.hazards;
    if (!h) return null;
    const diff = h.director ? h.director.diff : 'normal';
    if (diff !== 'hard' && diff !== 'chaos') return null;
    if (!this.real.aircraft.some((a) => a.state === 'fly' && a.entered && !a.live && CLASSES[a.cls].wakeKill)) return null;
    const wakes = h.wakes.filter((w) => w.age < w.life * FRESH).map((w) => ({ ...w }));
    const { dir, kt } = snap.wind;
    const air = dir != null && kt ? airVelOf(dir, kt) : [0, 0];
    return new WakeLookahead(this.ghost, wakes, air, diff, h.emitT, h.checkT);
  }

  /**
   * The first collision (or, on Hard and Chaos, the first busy runway at touchdown or lethal wake) within the horizon, with every
   * aircraft on its current instructions. Returns { t, reason, a, b, zone } with a and b the real aircraft and t the seconds from
   * now, or null. Spawns inside the horizon and weather hazards other than wakes are not modelled (gameplay R6), nor wind drift.
   */
  predict() {
    const real = this.real, g = this.ghost;
    if (real.over || real.demo) return null;
    // the cheap skip: a collision needs an aircraft flying in and a second one moving (in the air, on the ground or on a runway)
    let flying = 0, moving = 0;
    for (const a of real.aircraft) {
      if (a.state === 'fly') flying++;
      if (a.state === 'fly' || a.state === 'landing' || a.state === 'lineup' || a.state === 'takeoff') moving++;
    }
    if (flying < 1 || moving < 2) return null;
    const snap = lightSnapshot(real);
    this.restore(snap);
    const wake = this.wakeLookahead(snap);
    // the ghost's spawns hold the arrivals the real sim holds, from the same wakes (sim.entryHazard reads extras)
    g.extras = wake ? [wake] : null;
    const n = Math.round(this.horizon / this.step);
    for (let i = 0; i < n && !g.over; i++) {
      if (wake) wake.step(this.step);
      if (g.over) break;
      g.step(this.step);
    }
    if (!g.over || !g.crash) return null;
    const byId = new Map(real.aircraft.map((a) => [a.id, a]));
    const who = g.crash.who.map((a) => byId.get(a.id)).filter(Boolean);
    const a = who[0] || null, b = who[1] || null;
    return {
      t: g.crash.time - snap.time,
      reason: g.crash.reason,
      a,
      b,
      zone: a && a.target != null ? real.zones[a.target] || null : null,
    };
  }
}
