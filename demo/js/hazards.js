// Wake turbulence and (always simulated) emergencies.
import { CLASSES, LANE_S, SIM_HZ } from './config.js?v=86c2b44d';
import { dist, makeRng, TAU, clamp, wrapAngle } from './util.js?v=86c2b44d';
import { endGeometry } from './airport.js?v=86c2b44d';

export const WAKE_EVERY = 0.2;     // s between wake points
const WAKE_RADIUS = 9;      // units: how close counts as "in the wake"
export const FRESH = 0.6;   // a wake is dangerous for the first 60% of its life
const KNOCK_COOLDOWN = 2.5;
export const STACK_FUEL = 80;      // s of holding (in total) before an aircraft is short of fuel
const TURN = 9;            // rad/s: how fast every aircraft turns (sim.fly), so a turn of d radians flies v * d / TURN units
const APPROACH = 24;       // units out on the landing line where a flyable path lines up (sim.zoneHit's reach)
const ENGINE_SPEED = 0.85; // an engine-out plane flies at this share of its speed (its speedMul)
const DRAIN = 2.5;         // glide lost each second on top of the distance flown (stepEmergencies)
const REACTION = 10;       // s a player may take before an engine-out plane is flown to a runway: it turns for its end meanwhile (applyEngine)
const GLIDE_SPARE = 4;     // s of glide more than the flight needs (a line-up drawn a little wide still lands)
export const RING_SHARE = 0.8; // the engine-out ring is drawn at this share of the glide left (ringfit: every end inside it is reachable)
export const AIM_STOP = 30; // units: a plane turning for its runway end stops turning once its aim point is this close (sim.fly)
const NEAR_TIE = 1.05;     // ends within this share of the shortest are a near tie: the active end wins it (autoPlan)
const LIT_SHARE = 0.95;    // a runway end is lit only if a direct path to it leaves this share of the glide (reachableEnds)
export const FUEL_MIN = 50; // s: a low-fuel plane is never given less
const FUEL_REACT = 20;     // s a player may take before turning a low-fuel plane: its fuel holds the flight of those seconds (item 11)
const FUEL_SPARE = 20;     // s on top of 1.5 times the flight to its end (item 11)
const HOLD_BURN = 1.6;     // a plane that holds (circles, stacks or loops) burns fuel this much faster (stepEmergencies)
const SIM_STEP = 1 / SIM_HZ; // the step the sim runs at: a reaction is stepped at it (reactionAt)
const PILE_RETRY = 4;      // s before a due emergency is tried again while the last one is still in the air (item 15)

/**
 * An engine-out or low-fuel plane: it may land on either end of any runway it may use (item 6, item 12), and it may not circle or hold
 * (item 7). One rule for the sim (sim.js landEnds, toggleHold, fixHit) and the halo (render.js).
 */
export function eitherEnd(a) {
  return !!a.emergency && (a.emergency.type === 'engine' || a.emergency.type === 'fuel');
}

/** The note on a tap, or a path, that would hold an engine-out or low-fuel plane (sim.js toggleHold, endPath). */
export function holdRefusal(a) {
  return `${a.emergency.type === 'engine' ? 'Engine out' : 'Low on fuel'}: it can't start a circle or a hold. Draw it to a runway.`;
}

/** An engine-out or low-fuel emergency stops fast-forward, so the player gets real seconds for it (main.js). */
export function stopsFastForward(type) {
  return type === 'engine' || type === 'fuel';
}

/**
 * Fast-forward goes off when such an emergency is declared (main.js handleEvents): the player may turn it on again. Returns whether it
 * was on and went off, so the call can say so.
 */
export function stopFastForward(game, type) {
  const was = !!game.fast && stopsFastForward(type);
  if (was) game.fast = false;
  return was;
}

/**
 * Is an engine-out or low-fuel plane locked on another end (zone zi, or its other end) from the one it was named for or turned for?
 * The tower then says the runway changed. A helicopter's pad has no end: never a change.
 */
export function endChanged(a, zi) {
  const aim = a.emergency && a.emergency.aim;
  return !!aim && aim.end != null && eitherEnd(a) && (aim.zone !== zi || aim.end !== a.landEnd);
}

/**
 * The flyable length (units) from (x, y) heading h, flown at speed v, to a threshold g (endGeometry, or {pad, thx, thy} for a
 * helicopter's pad): a turn onto the landing line, then straight in, lined up APPROACH units out. A turn of d radians flies
 * v * d / TURN units of arc. Shared by the fuel and the glide sizing (item 11, item 12).
 */
export function flyableLength(x, y, h, v, g) {
  if (g.pad) {
    const bearing = Math.atan2(g.thy - y, g.thx - x);
    return Math.hypot(g.thx - x, g.thy - y) + (v * Math.abs(wrapAngle(bearing - h))) / TURN;
  }
  const ax = g.thx - g.dirx * APPROACH, ay = g.thy - g.diry * APPROACH;
  const bearing = Math.atan2(ay - y, ax - x);
  const turns = Math.abs(wrapAngle(bearing - h)) + Math.abs(wrapAngle(g.angle - bearing));
  return Math.hypot(ax - x, ay - y) + APPROACH + (v * turns) / TURN;
}

/** The fresh wake (another aircraft's, still dangerous) an aircraft is in, or null. Shared with the wake look-ahead (ghost.js). */
export function wakeHitAt(a, wakes) {
  return wakes.find((w) => w.owner !== a.id && w.age < w.life * FRESH && Math.abs(w.x - a.x) < WAKE_RADIUS && Math.abs(w.y - a.y) < WAKE_RADIUS && dist(w.x, w.y, a.x, a.y) < WAKE_RADIUS) || null;
}

/**
 * Lethal on this level: only a light plane is lost to a wake (the class with wakeKill), never a real flight; on Chaos any wake
 * does it, on Hard only a heavy's. The owner may be gone (undefined).
 */
export function wakeLethal(a, owner, diff) {
  return !!CLASSES[a.cls].wakeKill && !a.live && (diff === 'chaos' || (diff === 'hard' && !!owner && owner.cls === 'heavy'));
}

/** In a holding stack, or still climbing or descending out of one: above the approach's wake. */
export function highUpAt(a, time) {
  return !!(a.stack || (a.stackLeft && time - a.stackLeft.t < 6));
}

/**
 * Does an arrival's lane (its first LANE_S seconds from (ex, ey) on its heading) run through a fresh wake that kills its class on
 * this level? The one rule for the real game (Hazards.entryHazard) and the look-ahead's copy of the sky (ghost.js). wakes drift with
 * `air` (the wind's [vx, vy]); aircraft are whose wakes these are (a heavy's, on Hard).
 */
export function laneThroughLethalWake(wakes, aircraft, air, diff, ex, ey, heading, cls, live) {
  const def = CLASSES[cls];
  if (!def || !def.wakeKill || live || !wakes.length) return false;
  if (diff !== 'hard' && diff !== 'chaos') return false;
  const heavy = diff === 'hard' ? new Set(aircraft.filter((o) => o.cls === 'heavy').map((o) => o.id)) : null;
  const [wvx, wvy] = air;
  const vx = Math.cos(heading) * def.speed, vy = Math.sin(heading) * def.speed;
  for (const w of wakes) {
    if (heavy && !heavy.has(w.owner)) continue;
    for (let t = 0; t <= LANE_S; t += 0.5) {
      if (w.age + t >= w.life * FRESH) break;
      if (dist(ex + vx * t, ey + vy * t, w.x + wvx * t, w.y + wvy * t) < WAKE_RADIUS + 2) return true;
    }
  }
  return false;
}

export class Hazards {
  constructor({ sim, weather, director, seed = 1 }) {
    this.sim = sim;
    this.weather = weather;
    this.director = director;
    this.rng = makeRng(seed ^ 0xbeef);
    this.wakes = []; // { x, y, age, life, owner }
    this.emitT = 0;
    this.checkT = 0;
    // real planes only: none at all (the director's rate is 0 there), until the switch goes off (stepEmergencies)
    this.nextEmergency = director && director.realOnly ? Infinity : this.firstEmergency();
    this.crews = []; // fire crews out on the field (visual only: not in snapshots)
    sim.extras = sim.extras || [];
    sim.extras.push(this);
  }

  step(dt) {
    const sim = this.sim;
    if (sim.over || sim.demo) return;
    this.stepWakes(dt);
    this.stepEmergencies(dt);
    this.stepCrews(dt);
  }

  /** The countdown to the first emergency: about 1-2 min on Easy, 15-30 s on Hard (Infinity where there are none). */
  firstEmergency() {
    const perMin = this.director && this.director.cfg ? this.director.cfg.emergenciesPerMin : 0.3;
    return perMin > 0 ? (25 + this.rng() * 25) * Math.min(3, Math.max(0.6, 0.3 / Math.max(0.05, perMin))) : Infinity;
  }

  // ---------------------------------------------------------------- wake

  stepWakes(dt) {
    const sim = this.sim;
    const [vx, vy] = this.weather ? this.weather.airVel() : [0, 0];
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
      for (const a of sim.aircraft) {
        const life = CLASSES[a.cls].wakeEmit;
        if (!life || a.state !== 'fly' || a.ground || this.highUp(a)) continue; // the stack is well above the approach
        // the wake trails from just behind the tail
        const back = CLASSES[a.cls].size * 0.9;
        this.wakes.push({ x: a.x - Math.cos(a.heading) * back, y: a.y - Math.sin(a.heading) * back, age: 0, life, owner: a.id });
      }
    }
    this.checkT += dt;
    if (this.checkT < 1 / 30) return;
    this.checkT = 0;
    for (const a of sim.aircraft) {
      if (a.state !== 'fly' || a.ground || !a.entered || this.highUp(a)) continue;
      const def = CLASSES[a.cls];
      if (!def.wakeKill && !def.wakeKnock) continue;
      const hit = wakeHitAt(a, this.wakes);
      if (!hit) continue;
      // lethal only on the hard settings (on Hard, only a heavy's wake), and never to a real flight: a real aircraft
      // is knocked, not removed; otherwise a hard knock
      const diff = this.director ? this.director.diff : 'normal';
      const owner = sim.aircraft.find((o) => o.id === hit.owner);
      if (wakeLethal(a, owner, diff)) {
        a.tumble = 0;
        sim.lose(a, 'wake');
        return;
      }
      if (sim.time - (a.wakeKnockAt ?? -99) > KNOCK_COOLDOWN) {
        a.wakeKnockAt = sim.time;
        if (this.weather) this.weather.knock(a, 'wake');
      }
    }
  }

  /** In a holding stack, or still climbing or descending out of one: above the approach's wake. */
  highUp(a) {
    return highUpAt(a, this.sim.time);
  }

  /**
   * An arrival entering here on its heading would fly through a fresh lethal wake within its first LANE_S seconds (the same rule
   * as stepWakes, looked ahead along the lane, the wakes drifting with the air). Only on Hard and Chaos, and only for a class a
   * wake kills. sim.js holds such an arrival back (queueArrival, updateSpawns).
   */
  entryHazard(ex, ey, heading, cls, live) {
    const diff = this.director ? this.director.diff : 'normal';
    return laneThroughLethalWake(this.wakes, this.sim.aircraft, this.weather ? this.weather.airVel() : [0, 0], diff, ex, ey, heading, cls, live);
  }

  // ---------------------------------------------------------- emergencies

  stepEmergencies(dt) {
    const sim = this.sim;
    const rate = this.director ? this.director.emergencyRate() : 0.005;
    // the switch went off in a game that began with real planes only: the countdown was never set, so set it now
    if (!Number.isFinite(this.nextEmergency) && rate > 0) this.nextEmergency = this.firstEmergency();
    // a first game: no emergencies until the player has landed a few
    if (sim.landed < (this.firstAfter || 0)) this.nextEmergency = Math.max(this.nextEmergency, 12);
    this.nextEmergency -= dt;
    if (this.nextEmergency <= 0) {
      if (!this.canDeclare()) {
        this.nextEmergency = PILE_RETRY; // item 15: the last one is still in the air, so this one waits
      } else {
        this.nextEmergency = (-Math.log(1 - this.rng() * 0.999) / Math.max(1e-4, rate)) * (0.6 + this.rng() * 0.4);
        this.nextEmergency = Math.max(20, this.nextEmergency);
        if (!this.declare()) this.nextEmergency = 6; // nobody to have it right now: try again shortly
      }
    }
    // holding fuel is an emergency only on the settings that have emergencies at all, and never for a real flight
    const fuelEmergencies = this.director && this.director.cfg ? this.director.cfg.emergenciesPerMin > 0 : true;
    for (const a of sim.aircraft) {
      // holding burns fuel: after long enough in a stack, it declares its fuel and must come in
      if (a.stack && a.state === 'fly') {
        a.stackT = (a.stackT || 0) + dt;
        if (a.stackT > STACK_FUEL && !a.emergency && !a.live && fuelEmergencies && this.canDeclare()) {
          const f = this.fuelPlan(a);
          a.emergency = { type: 'fuel', fuel: f.fuel, full: f.fuel, tag: 'FUEL', fromHold: true, aim: f.aim };
          sim.events.push({ kind: 'emergency', aircraft: a, type: 'fuel' });
        }
      }
      const e = a.emergency;
      if (!e || a.state !== 'fly') continue;
      if (e.type === 'engine') {
        // a plane turning for a runway end that has closed (or is closing) is turned for the one it can reach now
        if (a.auto) this.reaim(a);
        e.glide -= CLASSES[a.cls].speed * (a.speedMul || 1) * dt + DRAIN * dt;
        if (e.glide <= 0) return sim.lose(a, 'glide');
      } else if (e.type === 'fuel') {
        e.fuel -= dt * (a.hold || a.loop ? HOLD_BURN : 1);
        e.tag = `FUEL ${Math.floor(Math.max(0, e.fuel) / 60)}:${String(Math.floor(Math.max(0, e.fuel) % 60)).padStart(2, '0')}`;
        if (e.fuel <= 0) return sim.lose(a, 'fuel');
      }
    }
  }

  /**
   * Where a plane is after `secs` s of a player's reaction, flown on a copy by the sim's own steps (sim.fly, at its step): straight on,
   * turned back at an edge as the sim turns it, round the hold or loop it is in, turning toward `aim` (an engine-out plane's turn), and
   * drifting with the crosswind when `drift` (the sim drifts no plane with an engine out: weather.drift). A plane drawing a path is
   * flown straight, its path being the player's and not yet made. `speed` is the speed flown at (default: its own). The sim is not
   * touched: no landing, no events.
   */
  reactionAt(a, secs, { speed = null, aim = null, drift = false } = {}) {
    const drawing = !!a.drawing;
    const p = {
      cls: a.cls, x: a.x, y: a.y, heading: a.heading, visHeading: a.heading, entered: true, state: 'fly', ground: false,
      speedMul: speed == null ? a.speedMul || 1 : speed / CLASSES[a.cls].speed,
      emergency: { type: drift ? 'fuel' : 'engine' },
      path: drawing ? [] : a.path.slice(), pathIdx: drawing ? 0 : a.pathIdx, pathBase: 0, drawing: false,
      target: null, exit: null, hold: drawing ? null : a.hold, loop: drawing ? null : a.loop,
      auto: aim ? { x: aim.x, y: aim.y } : null,
    };
    for (let i = Math.round(secs / SIM_STEP); i > 0; i--) this.sim.fly(p, SIM_STEP);
    return p;
  }

  /**
   * The ends an emergency plane may land on (sim.landEnds): both ends of each runway it may use, and a helicopter's pad. A closing
   * runway is not sized for (nor aimed, crewed or named) while an open one can take the plane. When every usable runway is closing, the
   * closing ones are the ends it gets: ops (safeToClose) and a wind shift (weather.js) hold a runway open while an emergency plane needs
   * it, so it is still one it can land on (decision 254).
   */
  emergencyEnds(a) {
    const usable = [];
    this.sim.zones.forEach((z, zi) => {
      if (this.sim.usable(a, z)) usable.push({ z, zi });
    });
    const open = usable.filter(({ z }) => !z.closing);
    const out = [];
    for (const { z, zi } of open.length ? open : usable) {
      if (z.kind === 'pad') out.push({ zi, e: null, g: { pad: true, thx: z.cx, thy: z.cy } });
      else for (const e of [0, 1]) out.push({ zi, e, g: endGeometry(z, e) });
    }
    return out;
  }

  /** The end a plane is nearest to by flyable length from its state p at speed v: { len, en }, or null if it can land nowhere. */
  nearestEnd(p, v, ends) {
    let best = null;
    for (const en of ends) {
      const len = flyableLength(p.x, p.y, p.heading, v, en.g);
      if (!best || len < best.len) best = { len, en };
    }
    return best;
  }

  /** The flight a locked plane has left on its path (its landing is drawn already, so no reaction is needed), in units. */
  pathLeft(a) {
    let rem = 0, px = a.x, py = a.y;
    for (let i = a.pathIdx; i < a.path.length; i++) {
      rem += dist(px, py, a.path[i].x, a.path[i].y);
      px = a.path[i].x;
      py = a.path[i].y;
    }
    return rem;
  }

  /**
   * C (items 1 and 2): the runway end an engine-out plane turns for. For each end it may use (emergencyEnds: never a closed runway, and a
   * closing one only when no open one can take it), the plane turns at the sim's rate toward that end's aim point for REACTION s, then
   * flies straight; the shortest such flight wins. Of the
   * ends within NEAR_TIE of the shortest, the active one wins, else the shortest. Returns { len, zi, e, aim } or null.
   */
  autoPlan(a) {
    const v = CLASSES[a.cls].speed * ENGINE_SPEED;
    const cands = [];
    for (const en of this.emergencyEnds(a)) {
      if (en.e == null) continue; // a helicopter's pad is no runway end to turn for
      const z = this.sim.zones[en.zi];
      const aim = { x: en.g.thx - en.g.dirx * APPROACH, y: en.g.thy - en.g.diry * APPROACH };
      const p = this.reactionAt(a, REACTION, { speed: v, aim });
      cands.push({ len: flyableLength(p.x, p.y, p.heading, v, en.g), zi: en.zi, e: en.e, aim, active: en.e === z.active });
    }
    if (!cands.length) return null;
    const min = Math.min(...cands.map((c) => c.len));
    const near = cands.filter((c) => c.len <= min * NEAR_TIE);
    return near.find((c) => c.active) || near.reduce((b, c) => (c.len < b.len ? c : b));
  }

  /**
   * Item 12, the glide (units) an engine-out plane gets. The glide drains by the distance flown plus DRAIN a second, so it holds the
   * REACTION seconds the plane flies before the player turns it (the turn for its end, when it has the plan), the flight from there to its
   * end, and GLIDE_SPARE seconds more. A locked landing needs only its path left and the spare; a plane drawing, or with no plan, is flown
   * straight for the reaction (reactionAt).
   */
  glideFor(a, plan = null) {
    const v = CLASSES[a.cls].speed * ENGINE_SPEED;
    if (plan) return (REACTION + GLIDE_SPARE) * (v + DRAIN) + plan.len * (1 + DRAIN / v);
    if (a.target != null && !a.drawing) return GLIDE_SPARE * (v + DRAIN) + this.pathLeft(a) * (1 + DRAIN / v);
    const best = this.nearestEnd(this.reactionAt(a, REACTION, { speed: v }), v, this.emergencyEnds(a));
    return best ? (REACTION + GLIDE_SPARE) * (v + DRAIN) + best.len * (1 + DRAIN / v) : 160; // nowhere to land: the old minimum
  }

  /**
   * Engine out (item 1): the pilot's first act. A plane not drawing and not locked drops its hold, stack, loop and free path, and turns
   * for the runway end it can reach first (autoPlan). A plane being drawn is not interrupted; a landing already locked is kept. The
   * glide (glideFor) and the aim (the end the radio and the crews name) are set here.
   */
  applyEngine(a) {
    const sim = this.sim;
    let plan = null;
    if (!a.drawing && a.target == null) {
      if (a.stack) a.stackLeft = { fix: a.stack.fix, t: sim.time };
      a.hold = null;
      a.loop = null;
      a.stack = null;
      a.path.length = 0;
      a.pathIdx = 0;
      plan = this.autoPlan(a);
      a.auto = plan ? { x: plan.aim.x, y: plan.aim.y } : null;
    }
    const z = a.target != null ? sim.zones[a.target] : null;
    let aim = null;
    if (plan) aim = { zone: plan.zi, end: plan.e };
    else if (z && z.kind === 'runway') aim = { zone: z.id, end: a.landEnd ?? z.active };
    a.emergency = { type: 'engine', glide: this.glideFor(a, plan), tag: 'ENGINE OUT', aim };
    a.speedMul = ENGINE_SPEED;
  }

  /**
   * An engine-out plane turning for a runway end that has closed, or is closing while an open end can take it, turns for the end it can
   * reach now (autoPlan). The aim is kept while it is one of emergencyEnds.
   */
  reaim(a) {
    const e = a.emergency;
    const aim = e.aim;
    if (aim && aim.end != null && this.emergencyEnds(a).some((en) => en.zi === aim.zone && en.e === aim.end)) return;
    const plan = this.autoPlan(a);
    a.auto = plan ? { x: plan.aim.x, y: plan.aim.y } : null;
    e.aim = plan ? { zone: plan.zi, end: plan.e } : null;
  }

  /**
   * Items 6, 7 and 11: the fuel (s) a low-fuel plane gets, and the end it is named for. The fuel holds the flight from where the plane
   * will be after the FUEL_REACT seconds a player may take (reactionAt: drifted by the crosswind, round the hold or loop it is in, and
   * burning x HOLD_BURN while it holds), to the shortest of both ends of any runway (or a pad), x1.5, plus FUEL_REACT and FUEL_SPARE;
   * never under FUEL_MIN. The end it is named for is the one nearest where it is now. A locked landing needs only its path left.
   */
  fuelPlan(a) {
    const v = CLASSES[a.cls].speed * (a.speedMul || 1);
    const ends = this.emergencyEnds(a);
    const burn = a.hold || a.loop ? HOLD_BURN : 1;
    let len;
    if (a.target != null && !a.drawing) len = this.pathLeft(a);
    else {
      const best = this.nearestEnd(this.reactionAt(a, FUEL_REACT, { speed: v, drift: true }), v, ends);
      len = best ? best.len : Infinity;
    }
    const fuel = Number.isFinite(len) ? Math.max(FUEL_MIN, FUEL_REACT * burn + (1.5 * len) / v + FUEL_SPARE) : FUEL_MIN;
    const near = this.nearestEnd(a, v, ends);
    return { fuel, aim: near ? { zone: near.en.zi, end: near.en.e } : null };
  }

  /**
   * The runway ends an engine-out plane can still reach by a direct path from where it is: the flight from here costs the glide at
   * 1 + DRAIN / v a unit, so a flight of len costs len * (1 + DRAIN / v), and the end is lit only if that is within LIT_SHARE of the
   * glide. The ends it may use (emergencyEnds: open ones, or the closing ones when no open one is usable), never a pad.
   */
  reachableEnds(a) {
    const v = CLASSES[a.cls].speed * (a.speedMul || 1);
    const glide = a.emergency.glide;
    return this.emergencyEnds(a).filter((en) => !en.g.pad && flyableLength(a.x, a.y, a.heading, v, en.g) * (1 + DRAIN / v) <= LIT_SHARE * glide);
  }

  /**
   * Turn an arriving aircraft into an emergency. An engine-out plane turns for its runway end (applyEngine); a low-fuel plane is given
   * its fuel and named for its nearest end (fuelPlan).
   */
  declare(forceType = null) {
    const sim = this.sim;
    // real planes only: nothing the game makes up has an emergency (and a real flight never does, below)
    if (this.director && this.director.realOnly) return null;
    // simulated flights only: a real flight never has an emergency the game makes up. A plane being drawn waits for the finger to lift
    // (decision 261): its glide or fuel is sized for the path it then has, not for a far end the path has yet to reach.
    const cands = sim.aircraft.filter((a) => a.state === 'fly' && a.entered && !a.departure && !a.emergency && !a.live && !a.drawing && sim.onScreen(a));
    if (!cands.length) return null;
    const a = cands[Math.floor(this.rng() * cands.length)];
    // hydraulics only matter where there's a choice of runway lengths
    const lengths = sim.zones.filter((z) => z.kind === 'runway' && z.allow.includes(a.cls) && !z.closed && !z.closing).map((z) => z.length);
    const choice = lengths.length >= 2 && Math.min(...lengths) < Math.max(...lengths) * 0.9;
    const easy = this.director && this.director.diff === 'easy';
    const type = forceType || this.rng.weighted([['engine', a.cls === 'heli' ? 0 : easy ? 0.12 : 0.35], ['fuel', 0.4], ['medevac', 0.25], ['hydraulic', a.cls === 'heli' || !choice ? 0 : 0.22]]);
    if (type === 'hydraulic') {
      // no flaps, weak brakes: it needs the longest runway there is
      const longest = Math.max(...lengths, 0);
      a.emergency = { type, tag: 'HYDRAULICS', minLen: longest * 0.97 };
      const z = a.target != null ? sim.zone(a.target) : null;
      if (z && !sim.usable(a, z)) {
        // the runway it was cleared to is too short now
        a.target = null;
        sim.events.push({ kind: 'unlock', aircraft: a, zone: z });
      }
    } else if (type === 'engine') {
      this.applyEngine(a);
    } else if (type === 'fuel') {
      const f = this.fuelPlan(a);
      a.emergency = { type, fuel: f.fuel, full: f.fuel, tag: 'FUEL', aim: f.aim };
    } else {
      a.emergency = { type, tag: 'MEDEVAC', since: sim.time, waited: false };
    }
    sim.events.push({ kind: 'emergency', aircraft: a, type });
    return a;
  }

  /**
   * Item 12: may a new emergency begin now? Beginner, Easy and Normal: none while an engine-out or low-fuel plane is still in the
   * air. Hard and Chaos: at most two unresolved at once. A plane that has landed (or was lost) no longer counts.
   */
  canDeclare() {
    const open = this.sim.aircraft.filter((a) => a.state === 'fly' && a.emergency);
    const diff = this.director ? this.director.diff : 'normal';
    if (diff === 'hard' || diff === 'chaos') return open.length < 2;
    return !open.some((a) => a.emergency.type === 'engine' || a.emergency.type === 'fuel');
  }

  /** The name of the runway end a plane is turning for, or lands on, at zone z (for the radio and the crews). */
  endIdent(a, z) {
    if (!z) return null;
    if (z.kind !== 'runway') return z.activeIdent;
    const aim = a.emergency && a.emergency.aim;
    if (a.target == null && aim && aim.zone === z.id && aim.end != null) return endGeometry(z, aim.end).ident;
    const g = this.sim.landGeometry(a, z);
    return g === z ? z.activeIdent : g.ident;
  }

  // ------------------------------------------------------------- fire crews

  /**
   * The runway the crash tenders wait beside: the one it's cleared to, else the one an engine-out or low-fuel plane is turning for (its
   * aim, which the radio names too), else the nearest it can use.
   */
  standbyRunway(a) {
    const sim = this.sim;
    const t = a.target != null ? sim.zone(a.target) : null;
    if (t && t.kind === 'runway') return t;
    const aim = a.emergency && a.emergency.aim ? sim.zones[a.emergency.aim.zone] : null;
    const ends = this.emergencyEnds(a);
    if (aim && aim.kind === 'runway' && ends.some((en) => en.zi === a.emergency.aim.zone)) return aim;
    let best = null, bd = Infinity;
    for (const en of ends) {
      const z = sim.zones[en.zi];
      if (z.kind !== 'runway') continue;
      const d = dist(a.x, a.y, z.cx, z.cy);
      if (d < bd) [best, bd] = [z, d];
    }
    return best;
  }

  /** Station beside the runway (towards the middle of the map) and three standby spots along it. */
  crewSpots(z) {
    const ax = Math.cos(z.angle), ay = Math.sin(z.angle);
    let px = -ay, py = ax;
    if ((this.sim.W / 2 - z.cx) * px + (this.sim.H / 2 - z.cy) * py < 0) [px, py] = [-px, -py];
    const off = z.width / 2 + 22;
    const spots = [-0.22, 0, 0.22].map((k) => ({ x: z.cx + ax * k * z.length + px * off, y: z.cy + ay * k * z.length + py * off }));
    return { station: { x: z.cx + px * (off + 70), y: z.cy + py * (off + 70) }, spots };
  }

  stepCrews(dt) {
    const sim = this.sim;
    for (const a of sim.aircraft) {
      const e = a.emergency;
      if (!e || (e.type !== 'engine' && e.type !== 'hydraulic') || a.state !== 'fly' || this.crews.some((c) => c.id === a.id)) continue;
      const z = this.standbyRunway(a);
      if (!z) continue;
      const { station, spots } = this.crewSpots(z);
      this.crews.push({ id: a.id, z, station, home: false, linger: null, trucks: spots.map((p, i) => ({ x: station.x - i * 4, y: station.y, heading: 0, tx: p.x, ty: p.y })) });
    }
    for (let i = this.crews.length - 1; i >= 0; i--) {
      const c = this.crews[i];
      const a = sim.aircraft.find((o) => o.id === c.id);
      const coming = a && a.emergency && a.state === 'fly';
      if (coming && a.target != null) {
        // it's been cleared somewhere else: follow it
        const z = sim.zone(a.target);
        if (z && z.kind === 'runway' && z !== c.z) {
          c.z = z;
          const { spots } = this.crewSpots(z);
          c.trucks.forEach((tr, k) => Object.assign(tr, { tx: spots[k].x, ty: spots[k].y }));
        }
      }
      if (!coming && !c.home) {
        // landed: stay with it down the rollout, then head back
        if (c.linger == null) c.linger = a && (a.state === 'landing' || a.ground) ? 12 : 1.5;
        c.linger -= dt;
        if (c.linger <= 0) {
          c.home = true;
          c.trucks.forEach((tr) => Object.assign(tr, { tx: c.station.x, ty: c.station.y }));
        }
      }
      let moving = false;
      for (const tr of c.trucks) {
        const dx = tr.tx - tr.x, dy = tr.ty - tr.y, d = Math.hypot(dx, dy);
        if (d < 0.5) continue;
        moving = true;
        const step = Math.min(d, 34 * dt);
        tr.heading = Math.atan2(dy, dx);
        tr.x += (dx / d) * step;
        tr.y += (dy / d) * step;
      }
      if (c.home && !moving) this.crews.splice(i, 1);
    }
  }

  /** Red crash tenders with their light bars going. */
  drawCrews(ctx, t) {
    for (const c of this.crews) {
      for (const [k, tr] of c.trucks.entries()) {
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.rotate(tr.heading);
        // drawn a little larger than life so they read at airport scale
        ctx.scale(1.6, 1.6);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(-3.1, -1.2, 7, 3);
        ctx.fillStyle = '#d8392f';
        ctx.fillRect(-3.5, -1.5, 7, 3);
        ctx.fillStyle = '#f3efe6';
        ctx.fillRect(-2.6, -0.45, 3.6, 0.9);
        const on = Math.sin(t * 16 + k * 2.1) > 0;
        ctx.fillStyle = on ? '#ff4b3e' : '#ffffff';
        ctx.fillRect(1.6, -1.5, 1, 1.4);
        ctx.fillStyle = on ? '#ffffff' : '#4b8dff';
        ctx.fillRect(1.6, 0.1, 1, 1.4);
        if (on) {
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#ff6a50';
          ctx.beginPath();
          ctx.arc(2, 0, 4.5, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ------------------------------------------------------------- drawing

  drawWakes(ctx) {
    if (!this.wakes.length) return;
    // group by owner into ribbons
    const byOwner = new Map();
    for (const w of this.wakes) {
      if (!byOwner.has(w.owner)) byOwner.set(w.owner, []);
      byOwner.get(w.owner).push(w);
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (const pts of byOwner.values()) {
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        if (dist(p.x, p.y, q.x, q.y) > 30) continue;
        const k = q.age / q.life;
        const fresh = q.age < q.life * FRESH;
        ctx.strokeStyle = fresh ? `rgba(235,245,255,${0.38 * (1 - k)})` : `rgba(235,245,255,${0.16 * (1 - k)})`;
        ctx.lineWidth = 4 + k * 9;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawEmergencies(ctx, t) {
    for (const a of this.sim.aircraft) {
      const e = a.emergency;
      if (!e || a.state !== 'fly') continue;
      ctx.save();
      if (e.type === 'engine') {
        // the glide ring, at RING_SHARE of the glide left: the reach is nearer 0.9 of the glide, so an end inside the ring is
        // reachable (all but a few in a hundred, measured), and the ring shrinks as the glide drains
        const r = clamp(RING_SHARE * e.glide, 0, 900);
        ctx.strokeStyle = 'rgba(255,90,70,0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -t * 20;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,70,0.05)';
        ctx.fill();
        this.drawReachable(ctx, a, t);
      } else if (e.type === 'fuel') {
        // the arc is the fuel left out of what it was given (a flight's own time, not a fixed minute)
        const k = clamp(e.fuel / (e.full || 60), 0, 1);
        ctx.strokeStyle = `rgba(255,190,60,${0.55 + 0.45 * Math.sin(t * (k < 0.3 ? 14 : 6))})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(a.x, a.y, CLASSES[a.cls].size + 8, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      } else if (e.type === 'hydraulic') {
        // a slow amber pulse: it can only go to the longest runway
        ctx.strokeStyle = `rgba(255,170,60,${0.5 + 0.35 * Math.sin(t * 4)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(a.x, a.y, CLASSES[a.cls].size + 7, 0, TAU);
        ctx.stroke();
      } else {
        // medevac: a red cross badge
        const s = 5;
        ctx.translate(a.x + CLASSES[a.cls].size * 0.9, a.y - CLASSES[a.cls].size * 0.9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e5333d';
        ctx.fillRect(-s * 0.35, -s, s * 0.7, s * 2);
        ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
      }
      ctx.restore();
    }
  }

  /**
   * The runway ends an engine-out plane can still reach (reachableEnds), lit: a glowing green bar across each threshold, and its name
   * just short of it on the approach. Only those ends, so a lit end is one the plane can reach. Drawn over the ring, until the plane
   * is locked on an end: then the choice is made, and only the ring stays.
   */
  drawReachable(ctx, a, t) {
    if (a.target != null) return;
    const ends = this.reachableEnds(a);
    if (!ends.length) return;
    const pulse = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    for (const en of ends) {
      const z = this.sim.zones[en.zi];
      const g = en.g;
      const hw = z.width / 2 + 6;
      // the bar across the threshold: perpendicular to the runway, either side of its centreline
      const ax = g.thx - g.diry * hw, ay = g.thy + g.dirx * hw;
      const bx = g.thx + g.diry * hw, by = g.thy - g.dirx * hw;
      ctx.save();
      ctx.shadowColor = 'rgba(169,227,154,0.95)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(169,227,154,${pulse})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // the name, on the approach side of the threshold, upright
      const lx = g.thx - g.dirx * 16, ly = g.thy - g.diry * 16;
      ctx.shadowBlur = 0;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(12,28,14,0.85)';
      ctx.strokeText(g.ident, lx, ly);
      ctx.fillStyle = `rgba(214,246,196,${pulse})`;
      ctx.fillText(g.ident, lx, ly);
      ctx.restore();
    }
  }

  snapshot() {
    return { wakes: this.wakes.map((w) => ({ ...w })), nextEmergency: this.nextEmergency, emitT: this.emitT, rng: this.rng.getState() };
  }

  restore(s) {
    this.wakes = s.wakes;
    this.nextEmergency = s.nextEmergency;
    this.emitT = s.emitT;
    this.crews = [];// re-dispatched from the station for whatever emergencies the rewind kept
    this.rng.setState(s.rng);
  }
}

