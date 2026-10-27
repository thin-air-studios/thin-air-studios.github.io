// Pure game simulation: no DOM, no drawing. Works in game units on a world built from a real
// airport (see airport.js). Deterministic for a seed + input stream; snapshot()/restore() power
// the rewind.
import { STACK_LEVELS, FIX_RADIUS, FIX_SLACK, makeFixes, holdHit, holdScale } from './stacks.js?v=86c2b44d';
import { CLASSES, TUNING, PAX } from './config.js?v=86c2b44d';
import { clamp, dist, dist2, makeRng, turnToward, wrapAngle, damp, easeOutCubic, TAU } from './util.js?v=86c2b44d';
import { bearingToCanvas } from './geo.js?v=86c2b44d';
import { displayName } from './airlines.js?v=86c2b44d';
import { setActiveEnd, endGeometry } from './airport.js?v=86c2b44d';
import { AIM_STOP, eitherEnd, holdRefusal } from './hazards.js?v=86c2b44d';

const T = TUNING;
const STACK_GRACE = 6; // s an aircraft leaving a stack stays separated from its former stack-mates
const PATH_TURN = 9;   // rad/s: the turn every flown path is followed at (fly), and the cap on an engine-out plane's bank-limited turn
const LOOP_TURN = (5 * Math.PI) / 3; // rad: a loop the plane has flown past must turn this far (300 degrees) to be a holding loop (loopAt, 2.8)
const FWD_BACK = 12;   // units a drag must go back from its touch, along the plane's heading, before a fresh path may turn the plane round (fwdStart)
const TURN_TOL = 3;    // units: a path walked back from the finger may come back this far along the landing line before it is a turn (lookBack)
const clone = typeof structuredClone === 'function' ? structuredClone : (o) => JSON.parse(JSON.stringify(o));

export class Sim {
  /**
   * @param o.world     from airport.buildWorld()
   * @param o.seed      RNG seed
   * @param o.demo      attract mode: arrivals fly themselves in, no collisions
   * @param o.hudRects  where the HUD sits on this screen, in world units (Renderer.hudRectsWorld), or none for
   *                    the old fixed corners
   * @param o.daily     the daily challenge: v1.32's cap (every aircraft counts) and one lane round, byte for byte
   * @param o.rules     per-level rules. busyRunwayLoses (the default): landing on an occupied runway is a crash. Beginner,
   *                    Easy and Normal (and the daily) turn it off: both aircraft carry on (gameplay 3.3)
   */
  constructor({ world, seed = 1, demo = false, tutorial = false, hudRects = null, daily = false, rules = null }) {
    this.world = world;
    this.zones = world.zones;
    this.W = world.W;
    this.H = world.H;
    this.demo = demo;
    this.tutorial = tutorial;
    this.daily = !!daily;
    this.rules = { busyRunwayLoses: true, ...(rules || {}) };
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    // the real planes' lanes have their own stream, and the count of the real planes that came in (DECISIONS 436): a real plane that
    // cannot find a lane draws nothing from the sim's own stream, so the simulated planes are the same with or without a live feed
    this.liveRng = makeRng(this.seed ^ 0x1fe5);
    this.liveSpawned = 0;
    this.hudRects = hudRects; // before the fixes, which keep out from under it
    // two holding fixes with published racetracks (fixed for the airport, so not in snapshots)
    this.fixes = demo ? [] : makeFixes({ W: world.W, H: world.H, runways: world.runways }, (world.L && world.L.info && world.L.info.icao) || '', (x, y) => this.inHudCorner(x, y));
    this.aircraft = [];
    this.warnings = [];
    this.events = [];
    this.time = 0;
    this.score = 0;
    this.landed = 0;
    this.landedLive = 0; // every real flight that landed (confirmed or in the area)
    this.landedConfirmed = 0; // the real flights confirmed landing here (a bonus each, sim.startLanding)
    this.confirmedPts = 0; // the points those confirmed arrivals gave (one each)
    this.over = false;
    this.crash = null;
    this.nextId = 1;
    this.lastLandAt = -99;
    this.combo = 0;
    this.pax = 0; // people landed safely this game
    this.bonusPts = 0; // emergency bonuses and medevac penalties actually applied, for the end screen
    this.penaltyPts = 0;
    this.departed = 0; // departures that went out (every one scores a point, sim.depart)
    this.streak = 0; // landings in a row without a close call
    this.bestStreak = 0;
    this.pairs = new Map();
    this.landedByClass = {};
    this.wind = { dir: null, kt: 0 }; // set by weather; dir = degrees true it blows FROM
  }

  // ------------------------------------------------------------ queries

  zone(id) {
    return id == null ? null : this.zones[id];
  }

  arrivalsInAir() {
    let n = this.warnings.length;
    for (const a of this.aircraft) if (a.state === 'fly' && !a.departure) n++;
    return n;
  }

  // ------------------------------------------------------------ spawning

  /** Point on the (expanded) world edge along a compass bearing from the field centre. */
  edgePoint(brg, out = T.spawnOutside) {
    return this.edgeAt(bearingToCanvas(brg), out);
  }

  /** The same, from a canvas angle: [x, y, angle]. */
  edgeAt(ang, out = T.spawnOutside) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const cx = this.W / 2, cy = this.H / 2;
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (this.W + out - cx) / dx);
    if (dx < -1e-6) t = Math.min(t, (-out - cx) / dx);
    if (dy > 1e-6) t = Math.min(t, (this.H + out - cy) / dy);
    if (dy < -1e-6) t = Math.min(t, (-out - cy) / dy);
    return [cx + dx * t, cy + dy * t, ang];
  }

  /**
   * Under the score, the buttons or the wind compass: a point, or a disc of radius r. Without hudRects (tests, the
   * attract demo), the old fixed corners, with a disc tested at its centre, top and sides.
   */
  inHudCorner(x, y, r = 0) {
    if (this.hudRects) return this.hudRects.hard.some((b) => discInBox(x, y, r, b));
    if (r) return this.inHudCorner(x, y) || this.inHudCorner(x, y - r) || this.inHudCorner(x + r, y) || this.inHudCorner(x - r, y);
    return (y < 100 && (x < 150 || x > this.W - 170));
  }

  /** Under the airport title (top middle) or the radio ticker (bottom middle). Without hudRects, the old fixed strips, tested at the centre. */
  inHudSoft(x, y, r = 0) {
    if (this.hudRects) return this.hudRects.soft.some((b) => discInBox(x, y, r, b));
    const W2 = this.W / 2;
    return (y < 80 && Math.abs(x - W2) < 230) || (y > this.H - 75 && Math.abs(x - W2) < 300);
  }

  /**
   * Would an arrival entering at (ex, ey) on its heading fly into a storm cell or through a fresh lethal wake? The extras that
   * report one say so: weather.js and hazards.js in the game, and the wake look-ahead in the ghost (ghost.js, which has no storms).
   */
  entryHazard(ex, ey, heading, cls, live) {
    for (const e of this.extras || []) if (e.entryHazard && e.entryHazard(ex, ey, heading, cls, live)) return true;
    return false;
  }

  /**
   * A warning whose entry is inside a storm or a lethal wake takes the nearest clear entry on its own edge (its angle from the
   * centre, out to about 2.8 radians either way), or returns false and waits.
   */
  clearEntry(w) {
    const base = Math.atan2(w.y - this.H / 2, w.x - this.W / 2);
    for (let k = 1; k <= 40; k++) {
      for (const sgn of [1, -1]) {
        const [ex, ey, ang] = this.edgeAt(base + sgn * k * 0.07);
        const heading = ang + Math.PI;
        if (this.entryHazard(ex, ey, heading, w.cls, w.live)) continue;
        Object.assign(w, { x: ex, y: ey, heading, wx: clamp(ex, 14, this.W - 14), wy: clamp(ey, 14, this.H - 14) });
        return true;
      }
    }
    return false;
  }

  /** How crowded an entry lane is (smaller = worse). */
  laneClearance(ex, ey, heading, cls) {
    const def = CLASSES[cls];
    const vx = Math.cos(heading) * def.speed, vy = Math.sin(heading) * def.speed;
    let minSep = 400;
    for (const a of this.aircraft) {
      if (a.state !== 'fly') continue;
      const ad = CLASSES[a.cls];
      const avx = Math.cos(a.heading) * ad.speed, avy = Math.sin(a.heading) * ad.speed;
      for (let s = 0; s <= 6; s += 0.5) {
        const d = dist(ex + vx * s, ey + vy * s, a.x + avx * s, a.y + avy * s) - def.radius - ad.radius;
        if (d < minSep) minSep = d;
      }
    }
    // aircraft still waiting at the edge: they'll be flying when we are, with a head start
    for (const w of this.warnings) {
      const wd = CLASSES[w.cls];
      const wvx = Math.cos(w.heading) * wd.speed, wvy = Math.sin(w.heading) * wd.speed;
      const lead = Math.max(0, T.spawnWarnTime - w.timer);
      for (let s = 0; s <= 6; s += 0.5) {
        const d = dist(ex + vx * s, ey + vy * s, w.x + wvx * (s + lead), w.y + wvy * (s + lead)) - def.radius - wd.radius;
        if (d < minSep) minSep = d;
      }
    }
    return minSep;
  }

  /**
   * Queue an arrival. spec: { cls, callsign, live, flightId, bearing? }.
   * Live and simulated flights enter the same way, on the clearest of a random set of lanes (2.2). A live flight's bearing
   * stays on the spec and in the replay rows, but no longer places it: where a real plane is on the map was never where it came from.
   * Returns false if the lane is blocked right now (the director retries later).
   */
  queueArrival(spec) {
    if (this.over || !CLASSES[spec.cls]) return false;
    // the cap is on arrivals and warnings (not the departures on the ground, which have their own stands): a busy
    // airport's departures never hold the level back. The daily keeps v1.32's count, every aircraft.
    let arrivals = this.warnings.length;
    for (const a of this.aircraft) if (this.daily || !a.departure) arrivals++;
    if (arrivals >= T.maxAircraft) return false;
    // 14 random lanes; when a busy sky leaves none clear, 14 more (a round only runs when the one before found nothing,
    // so a quiet sky draws what it always drew: the daily challenge is seeded). The daily has one round, as in v1.32.
    let best = null;
    let bestScore = -1;
    const rounds = this.daily ? 1 : 3;
    const r = spec.live ? this.liveRng : this.rng; // a real plane's lanes come from its own stream (DECISIONS 436)
    for (let round = 0; round < rounds && (!best || bestScore < 25); round++) {
      for (let i = 0; i < 14; i++) {
        const [ex, ey, ang] = this.edgePoint(r() * 360);
        const wx = clamp(ex, 14, this.W - 14), wy = clamp(ey, 14, this.H - 14);
        if (this.inHudCorner(wx, wy)) continue;
        const heading = ang + Math.PI + (r() - 0.5) * 0.7;
        const raw = this.laneClearance(ex, ey, heading, spec.cls);
        if (raw < 35) continue; // never a lane that's nearly on a collision course already
        if (this.entryHazard(ex, ey, heading, spec.cls, spec.live)) continue; // nor one through a storm cell or a lethal wake
        const sc = Math.min(170, raw) + r() * 25;
        if (sc > bestScore) {
          bestScore = sc;
          best = { ex, ey, heading };
        }
      }
    }
    if (!best || bestScore < 25) return false;
    const wx = clamp(best.ex, 14, this.W - 14), wy = clamp(best.ey, 14, this.H - 14);
    this.warnings.push({
      cls: spec.cls, callsign: spec.callsign, live: !!spec.live, flightId: spec.flightId || null,
      confirmed: !!spec.confirmed, upgraded: false,
      // the very first arrival comes in quickly: no dead start over an empty map
      x: best.ex, y: best.ey, heading: best.heading, wx, wy, timer: this.time < 4 ? T.spawnWarnTime * 0.4 : T.spawnWarnTime, total: this.time < 4 ? T.spawnWarnTime * 0.4 : T.spawnWarnTime,
      emergency: spec.emergency || null, real: spec.real || null,
    });
    this.events.push({ kind: 'warn', cls: spec.cls, x: wx, y: wy, live: !!spec.live });
    if (spec.live) this.liveSpawned++; // every real plane that came in, including one that later leaves (challenge.js x=1)
    return true;
  }

  makeAircraft(o) {
    return {
      id: this.nextId++, cls: o.cls, callsign: o.callsign || '', label: o.live ? displayName(o.callsign || '') : '',
      live: !!o.live, flightId: o.flightId || null, real: o.real || null,
      confirmed: !!o.confirmed, upgraded: !!o.upgraded, // real flights: confirmed landing here (area.js kindOf)
      x: o.x, y: o.y, heading: o.heading, visHeading: o.heading,
      path: [], pathIdx: 0, pathBase: 0, drawing: false, smooth: null, target: null,
      state: o.state || 'fly', entered: !!o.entered, age: 0, landT: 0, scale: 1, alpha: 1, prox: false,
      landS: 0, landLat: 0, touchedDown: false, hold: null, loop: null, wasHolding: false,
      rawX: 0, rawY: 0, departure: o.departure || null, emergency: o.emergency || null, knock: 0, exit: null, ground: false,
    };
  }

  spawnFromWarning(w) {
    const a = this.makeAircraft({ ...w, x: w.x, y: w.y });
    this.aircraft.push(a);
    this.events.push({ kind: 'spawn', aircraft: a });
    if (this.demo) this.autopilot(a);
    return a;
  }

  updateSpawns(dt) {
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.timer -= dt;
      if (w.timer > 0) continue;
      // never in a storm cell or through a fresh lethal wake: it takes a clear entry on its edge, retried twice a second, or waits
      if (this.entryHazard(w.x, w.y, w.heading, w.cls, w.live)) {
        if (this.time < (w.nextEntry ?? 0)) continue;
        w.nextEntry = this.time + 0.5;
        if (!this.clearEntry(w)) continue;
      }
      const def = CLASSES[w.cls];
      // swept over the next 3 s: would it meet anyone just inside the edge?
      const vx = Math.cos(w.heading) * def.speed, vy = Math.sin(w.heading) * def.speed;
      const blocked = this.aircraft.some((a) => {
        if (a.state !== 'fly') return false;
        const ad = CLASSES[a.cls], avx = Math.cos(a.heading) * ad.speed, avy = Math.sin(a.heading) * ad.speed;
        for (let t = 0; t <= 3; t += 0.5) if (dist(a.x + avx * t, a.y + avy * t, w.x + vx * t, w.y + vy * t) < def.radius + ad.radius + 18) return true;
        return dist(a.x, a.y, w.x + vx * 2, w.y + vy * 2) < def.radius + ad.radius + 40;
      });
      if (blocked && w.timer > -4) continue; // fairness: hold until the lane clears
      this.warnings.splice(i, 1);
      this.spawnFromWarning(w);
    }
  }

  /** Attract mode: fly each arrival to a suitable zone on a smooth curve. */
  autopilot(a) {
    const zs = this.zones.filter((z) => z.allow.includes(a.cls) && !z.closed);
    if (!zs.length) return;
    const z = zs[Math.floor(this.rng() * zs.length)];
    const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
    const p0 = [a.x, a.y], p1 = [a.x + hx * 170, a.y + hy * 170];
    let p2, p3;
    if (z.kind === 'pad') {
      p3 = [z.cx, z.cy];
      p2 = [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2];
    } else {
      p3 = [z.thx, z.thy];
      p2 = [z.thx - z.dirx * 130, z.thy - z.diry * 130];
    }
    const len = dist(p0[0], p0[1], p1[0], p1[1]) + dist(p1[0], p1[1], p2[0], p2[1]) + dist(p2[0], p2[1], p3[0], p3[1]);
    const n = Math.max(8, Math.ceil(len / T.pathMinSpacing));
    a.path.length = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      a.path.push({ x: b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], y: b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1] });
    }
    a.pathIdx = 0;
    a.target = z.id;
  }

  // -------------------------------------------------------------- input

  /** Nearest selectable airborne aircraft to a world point, or null. */
  pick(x, y, extra = 0) {
    let best = null, bestD = Infinity;
    for (const a of this.aircraft) {
      if (a.state !== 'fly') continue;
      if (a.x < -8 || a.x > this.W + 8 || a.y < -8 || a.y > this.H + 8) continue;
      const r = CLASSES[a.cls].touch + extra;
      // in a pile (a busy stack), the one in trouble is the one you meant
      const d0 = dist2(x, y, a.x, a.y), body = CLASSES[a.cls].radius * 1.5;
      const d = d0 * (a.emergency && d0 < body * body ? 0.25 : 1);
      if (dist2(x, y, a.x, a.y) < r * r && d < bestD) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * What a touch on an engine-out or low-fuel plane may change, kept so that a touch which draws no path the plane will fly (a tap, a
   * path too short, a refused path or tail) leaves it as it was (endPath). Null for any other plane, and for a stack's racetrack, which is no drawn loop
   * (2.6, items 3 and 7; the grab fields of 2.6's circle and tail rules are kept too.)
   */
  touchSnapshot(a) {
    // a drawn holding loop is kept the same way (2.6): a rest on it, with no path drawn, leaves it looping. A stack's racetrack is no such
    // loop: a touch on a stacked plane still takes it out of the stack (beginPath)
    if (!eitherEnd(a) && !(a.loop && !a.stack)) return null;
    return {
      path: a.path.slice(), pathIdx: a.pathIdx, pathBase: a.pathBase, target: a.target ?? null, exit: a.exit ?? null,
      hold: a.hold ?? null, loop: a.loop ?? null, stack: a.stack ?? null, stackLeft: a.stackLeft ?? null, auto: a.auto ?? null,
      wasHolding: !!a.wasHolding, waitHeld: !!a.waitHeld, leaveFacing: !!a.leaveFacing, leaveFrom: a.leaveFrom ?? null, grab: a.grab ?? null,
    };
  }

  beginPath(a, x, y) {
    // an engine-out or low-fuel plane keeps its turn, hold, stack, loop and landing until the touch draws a path it will fly (endPath):
    // a tap it refuses (a circle, a hold) or too short to be a path leaves the plane as it was (items 3 and 7)
    a.touch = this.touchSnapshot(a);
    a.auto = null; // an engine-out plane turning for its runway end is taken by the player: the turn stops
    a.path.length = 0;
    a.pathIdx = 0;
    a.pathBase = 0;
    a.target = null;
    a.exit = null;
    a.drawing = true;
    a.drawn = 0; // the path points this touch has drawn (endPath: a touch that drew a path is ended by its lift, even if the plane has flown past them)
    a.tailUntil = null; // the window of a tail is from a lift (endPath), not from a touch that draws nothing
    a.wasHolding = !!(a.hold || a.loop);
    // a plane that was circling waits under the finger until the path has moved (extendPath): it is held still while the finger rests on it,
    // and keeps its circle until the path begins, so a rest that draws nothing leaves the plane circling (2.6). The path leaves from where
    // the plane was held, toward the drag, with no U-turn (fly, faceLast)
    a.waitHeld = !!a.hold;
    a.leaveFacing = !!a.hold; // a path begun from a circle leaves the plane facing the drag's way (fly, faceLast)
    a.leaveFrom = a.leaveFacing ? { x: a.x, y: a.y } : null;
    // a fresh path from a flying plane leaves forward (3 of 2.8): a touch behind the plane (its tail side) and a drag that creeps forward from
    // it is not turned back to, its points behind the plane being skipped until the path gets ahead (fly). A drag that goes back from the touch
    // (FWD_BACK) is a U-turn and turns the plane round as a path does (extendPath)
    a.fwdStart = !a.hold;
    a.fwdFrom = fwdFrom(x, y, a.heading);
    // a touch on the plane's body, off its centre (the nose or the tail side), grabs the plane where it is: the drag moves it from there,
    // so the path starts at the plane and leaves along the drag, not toward the touch behind or ahead of it (extendPath). Farther out
    // (the touch zone's edge, or a ring) the grab is at the finger's place, as a fresh path is
    const off = Math.hypot(a.x - x, a.y - y);
    a.grab = a.hold && off <= 2 * CLASSES[a.cls].radius ? { ox: a.x - x, oy: a.y - y } : null;
    if (!a.waitHeld) a.hold = null;
    a.loop = null;
    // out of the holding stack; stack-mates it overlaps stay separated (by altitude) while it climbs or descends clear
    if (a.stack) a.stackLeft = { fix: a.stack.fix, t: this.time };
    a.stack = null;
    a.entered = true; // under player control: it must bounce off edges like everyone else
    a.smooth = { x: a.x, y: a.y };
    this.extendPath(a, x, y);
  }

  clampPoint(x, y) {
    return [clamp(x, 8, this.W - 8), clamp(y, 8, this.H - 8)];
  }

  /** Feed a raw finger position. Returns the zone if this point locked a landing. */
  extendPath(a, rx, ry) {
    if (!a.drawing || a.target != null || a.state !== 'fly') return null;
    // a grab on the plane's body: the finger's place is moved by the grab offset, so the drag is the path's drag (beginPath)
    if (a.grab) {
      rx += a.grab.ox;
      ry += a.grab.oy;
    }
    [rx, ry] = this.clampPoint(rx, ry);
    a.rawX = rx;
    a.rawY = ry;
    // a drag that goes back from its touch turns the plane round: from then on the points behind it are followed (fly)
    if (a.fwdStart && a.fwdFrom && fwdBack(a.fwdFrom, rx, ry) < -FWD_BACK) a.fwdStart = false;
    const s = a.smooth;
    const k = T.pathInputSmoothing;
    const sx = s.x + (rx - s.x) * k, sy = s.y + (ry - s.y) * k;
    s.x = sx;
    s.y = sy;
    const p = a.path;
    const last = p.length ? p[p.length - 1] : { x: a.x, y: a.y };
    const d = dist(last.x, last.y, sx, sy);
    if (d >= T.pathMinSpacing) {
      const n = Math.floor(d / T.pathMinSpacing);
      for (let i = 1; i <= n; i++) {
        const t = (i * T.pathMinSpacing) / d;
        p.push({ x: last.x + (sx - last.x) * t, y: last.y + (sy - last.y) * t });
      }
      a.drawn = (a.drawn || 0) + n;
      if (a.waitHeld) {
        // the path has a point past the plane: a plane that was circling leaves its circle here and flies on toward it
        a.waitHeld = false;
        a.hold = null;
      }
    }
    const z = this.zoneHit(a, rx, ry);
    if (z) {
      this.lockLanding(a, z);
      return z;
    }
    return null;
  }

  /**
   * The finger lifts. It lands on, in this order: a runway it is actually on; a hold (fixHit: the racetrack, its margin and name);
   * a runway it is just short of (the forgiving finish). scale is the view it lifted at (holdScale), recorded in the replay.
   */
  endPath(a, scale = null) {
    const touch = a.touch;
    a.touch = null;
    let drew = false, refused = false;
    // a touch that drew a path is ended by its lift, even when the plane has already flown past its points (a slow drag, 2.6): the test
    // is what the finger drew, not the points still ahead of the plane, so an overtaken drag does not restore the plane's circle
    if (a.drawing && a.target == null && a.state === 'fly' && (a.drawn || 0) > 3) {
      drew = true;
      const on = this.zoneHit(a, a.rawX, a.rawY, 0);
      const f = on ? null : this.fixHit(a, a.rawX, a.rawY, FIX_SLACK, scale);
      const z = on || (f ? null : this.zoneHit(a, a.rawX, a.rawY, T.landingSlack));
      if (z) this.lockLanding(a, z);
      else if (f) this.enterStack(a, f);
      else if (eitherEnd(a) && (this.fixAt(a.rawX, a.rawY, FIX_SLACK, scale) || this.loopAt(a) >= 0)) {
        // an engine-out or low-fuel plane may not hold: a path to a fix or a loop is refused, and the plane says so
        refused = true;
        this.events.push({ kind: 'noHold', aircraft: a, text: holdRefusal(a), x: a.rawX, y: a.rawY });
      } else if (!this.detectLoop(a)) {
        // ended on a runway that wouldn't take it: say why, rather than fly over in silence
        const why = this.whyNot(a, a.rawX, a.rawY);
        if (why) this.events.push({ kind: 'noLand', aircraft: a, reason: why, x: a.rawX, y: a.rawY, zone: this.whyZone });
      }
    }
    a.drawing = false;
    a.fwdStart = false;
    a.waitHeld = false;
    a.grab = null;
    a.smooth = null;
    // the touch drew no path the plane will fly (a tap, a path too short, or one refused): it is as it was before the touch
    if (touch && a.target == null && a.state === 'fly' && (!drew || refused)) Object.assign(a, touch);
    // a path the finger drew keeps its tail for the window after the lift (tailOf, T.tailWindow), even if the plane is flown to it first
    if (drew && !refused) a.tailUntil = this.time + T.tailWindow;
  }

  /**
   * The tail of a flying plane's drawn path (2.6): its last point, when the path is a free one, not ending at a runway or an exit
   * gate, a hold, a loop or a stack, the plane is not being drawn, and some of the path is still to fly. Null otherwise.
   */
  tailOf(a) {
    if (a.state !== 'fly' || a.drawing || a.target != null || a.exit != null || a.hold != null || a.loop != null || a.stack != null) return null;
    if (!a.path.length) return null;
    // some of the path still to fly, or flown within the window after its lift (T.tailWindow, 2.8 fix 2): the handle stays grabbable for that
    // long, and a plane that has flown past it is taken from its place (carryPath)
    if (a.path.length <= a.pathIdx && !(a.tailUntil > this.time)) return null;
    return a.path[a.path.length - 1];
  }

  /** The tails of the flying planes, for the finger that may take one (fingers.js tailUnder): { a, x, y } each. */
  tails() {
    const out = [];
    for (const a of this.aircraft) {
      const t = this.tailOf(a);
      if (t) out.push({ a, x: t.x, y: t.y });
    }
    return out;
  }

  /** The orbits of the circling planes, for the finger that may take a plane by its ring (fingers.js ringUnder): { a, cx, cy, r }. */
  holds() {
    const out = [];
    for (const a of this.aircraft) {
      if (a.state === 'fly' && a.hold && !a.drawing) out.push({ a, cx: a.hold.cx, cy: a.hold.cy, r: a.hold.r });
    }
    return out;
  }

  /**
   * A finger takes a tail (2.6): the path goes on from its last point, with the same smoothing and spacing as a fresh path
   * (extendPath), and the plane keeps flying the path it has. Passing over a runway locks the landing, as a fresh path does, and
   * the lift ends the path by the same rules (endPath). Returns the zone a runway locked, as extendPath does; a plane with no tail
   * is left as it is.
   */
  carryPath(a, x, y) {
    const tail = this.tailOf(a);
    if (!tail) return null;
    // an engine-out or low-fuel plane's carried path is refused as a fresh one is (endPath): the touch leaves it as it was
    a.touch = this.touchSnapshot(a);
    if (a.pathIdx >= a.path.length) {
      // the plane has flown past its tail, within the window (tailOf): the path goes on from the plane, which leaves forward, and not from
      // the tail behind it (2.8, fix 2 and fix 3). Nothing of the flown path is kept: it is all behind the plane
      a.path.length = 0;
      a.pathIdx = 0;
      a.pathBase = 0;
      a.fwdStart = true;
      a.fwdFrom = fwdFrom(x, y, a.heading);
      a.smooth = { x: a.x, y: a.y };
    } else {
      a.smooth = { x: tail.x, y: tail.y };
    }
    a.tailUntil = null;
    a.drawing = true;
    a.drawn = 0;
    a.wasHolding = false;
    a.entered = true; // under player control: it must bounce off edges like everyone else (beginPath)
    return this.extendPath(a, x, y);
  }

  /** Why a path ending at (x, y) on a runway didn't lock: 'closed' | 'small' | 'short' | 'wrongEnd' | 'align', or null. */
  whyNot(a, x, y) {
    if (a.departure) return null;
    // the runway the finger ended on (the nearest centreline, where runways cross)
    let z = null, best = Infinity;
    for (const r of this.zones) {
      if (r.kind !== 'runway') continue;
      const dx = x - r.cx, dy = y - r.cy, c = Math.cos(r.angle), sn = Math.sin(r.angle);
      const along = dx * c + dy * sn, across = Math.abs(-dx * sn + dy * c);
      if (Math.abs(along) > r.length / 2 + 26 || across > r.width / 2 + 16) continue;
      if (across < best) [z, best] = [r, across];
    }
    this.whyZone = z;
    if (!z) return null;
    if (z.closed) return 'closed';
    if (!z.allow.includes(a.cls)) return a.cls === 'heli' ? 'heli' : 'small';
    if (!this.usable(a, z)) return 'short';
    // heading against the arrows (the last stretch of the path points the wrong way down the runway); an engine-out plane
    // may land either way (landEnds): an engine-out or low-fuel plane
    const p = a.path, n = p.length;
    if (n >= 2 && !eitherEnd(a)) {
      const q0 = p[Math.max(0, n - 5)], q1 = p[n - 1];
      const vx = q1.x - q0.x, vy = q1.y - q0.y, len = Math.hypot(vx, vy) || 1;
      if ((vx * z.dirx + vy * z.diry) / len < -0.5) return 'wrongEnd';
    }
    return 'align';
  }

  /** Aircraft in a fix's stack, by level. */
  stackAt(fix) {
    return this.aircraft.filter((o) => o.stack && o.stack.fix === fix.id && o.state === 'fly');
  }

  /**
   * A path ending at a holding fix with room in its stack (arrivals only; not a dead-stick glider). The fix's own disc (slack
   * added to FIX_RADIUS), then the hold's target at the view it lifted in (stacks.js holdHit: the racetrack, 20 dp round it, and the name).
   */
  fixHit(a, x, y, slack = 0, scale = null) {
    if (a.departure || a.exit || eitherEnd(a)) return null; // an engine-out or low-fuel plane may not hold (item 7)
    return this.fixAt(x, y, slack, scale);
  }

  /** The fix a point is on, with room in its stack, for any aircraft (fixHit's rule without a plane's own refusals), or null. */
  fixAt(x, y, slack = 0, scale = null) {
    if (this.fixesHidden) return null; // not introduced yet (first game)
    const s = holdScale(scale);
    for (const f of this.fixes || []) {
      if (this.stackAt(f).length >= STACK_LEVELS) continue;
      if (dist(x, y, f.x, f.y) < FIX_RADIUS + slack || holdHit(f, x, y, s)) return f;
    }
    return null;
  }

  /** Into the hold: the lowest free level, flying the published racetrack once it gets there. */
  enterStack(a, f) {
    const used = new Set(this.stackAt(f).map((o) => o.stack.level));
    let level = 0;
    while (used.has(level)) level++;
    a.stack = { fix: f.id, level };
    a.loop = f.loop.map((q) => ({ x: q.x, y: q.y }));
    this.events.push({ kind: 'stack', aircraft: a, fix: f, level });
  }

  /**
   * Separated by procedure rather than distance: stacked at different levels, or established on
   * the finals of two parallel runways (drawn closer than wingspans allow, as real ones run side by side).
   */
  separated(a, b) {
    return this.stacked(a, b) || this.parallelFinals(a, b);
  }

  parallelFinals(a, b) {
    if (a.target == null || b.target == null || a.target === b.target) return false;
    const za = this.zones[a.target], zb = this.zones[b.target];
    if (!za || !zb || za.kind !== 'runway' || zb.kind !== 'runway') return false;
    if (Math.cos(za.angle - zb.angle) < 0.98) return false; // parallel, landing the same way
    const onFinal = (o, z) => dist(o.x, o.y, z.thx, z.thy) < 150 && Math.cos(o.heading - z.angle) > 0.85;
    return onFinal(a, za) && onFinal(b, zb);
  }

  /** Same stack, different levels: never a conflict (nor for a few seconds after one leaves it). */
  stacked(a, b) {
    const fix = (o) => (o.stack ? o.stack.fix : o.stackLeft && this.time - o.stackLeft.t < STACK_GRACE ? o.stackLeft.fix : null);
    const fa = fix(a), fb = fix(b);
    return fa != null && fa === fb && !!(a.stack || b.stack || a.stackLeft || b.stackLeft);
  }

  /**
   * A path that ends where it crossed itself becomes a repeating holding loop, if the loop is wide enough to be a drawn one (2.6):
   * a finger that wraps tightly round its own plane closes a small loop by accident, and that stays a path. The first closing point
   * decides: the loop it closes must reach from its centre past the plane's touch zone (CLASSES.touch).
   */
  detectLoop(a) {
    const i = this.loopAt(a);
    if (i < 0) return false;
    const p = a.path;
    a.loop = p.slice(i).map((q) => ({ x: q.x, y: q.y }));
    a.loop.push({ x: p[i].x, y: p[i].y });
    this.events.push({ kind: 'loop', aircraft: a });
    return true;
  }

  /** The index where a path that ends where it crossed itself would start its loop, or -1 (detectLoop; a loop too tight to draw is -1). */
  loopAt(a) {
    const p = a.path;
    const end = p[p.length - 1];
    let run = 0;
    // The closing point is ahead of the plane (a.pathIdx) as a rule, as on origin/main and d0eadfd (DECISIONS 266): a point the plane has
    // flown past does not close a loop, so a path whose carried tail doubles back over its flown path flies on instead of becoming a hold.
    // A slow ring is the exception (2.8, fix 4): drawn so slowly that the plane has flown past its start by the time it closes, it is still a
    // loop when its points turn a full circle (pathTurn), and the plane flies the rest of the path and then holds it. A hairpin or a curve,
    // which turns less, is never one
    for (let i = p.length - 2; i >= 0; i--) {
      run += dist(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y);
      if (run < T.loopMinLength) continue;
      if (dist(p[i].x, p[i].y, end.x, end.y) < T.loopCloseDist) {
        if (i <= a.pathIdx && Math.abs(pathTurn(p, i)) < LOOP_TURN) continue;
        // the first closing point decides (2.6, C3): a loop too tight to be drawn is a path, not a loop, so it is not one here either
        const loop = p.slice(i).map((q) => ({ x: q.x, y: q.y }));
        loop.push({ x: p[i].x, y: p[i].y });
        return wideLoop(loop, CLASSES[a.cls].touch) ? i : -1;
      }
    }
    return -1;
  }

  /** Tap on an airborne aircraft: circle in place. Tapping a holder releases it. */
  toggleHold(a) {
    // an engine-out or low-fuel plane may not circle or hold (item 7): the tap says so, and its path is left as it is
    if (eitherEnd(a)) {
      this.events.push({ kind: 'noHold', aircraft: a, text: holdRefusal(a) });
      return false;
    }
    a.path.length = 0;
    a.pathIdx = 0;
    a.target = null;
    a.waitHeld = false;
    a.grab = null;
    a.leaveFacing = false;
    a.leaveFrom = null;
    if (a.wasHolding) {
      a.hold = null;
      a.loop = null;
      a.stack = null;
      this.events.push({ kind: 'release', aircraft: a });
      return false;
    }
    const r = T.holdRadius;
    const c = this.holdCentre(a, r);
    a.hold = { cx: c.x, cy: c.y, r, side: 1 };
    this.events.push({ kind: 'hold', aircraft: a });
    return true;
  }

  /**
   * Where a tap-circle is centred (2.6): on the plane's left, as before, unless its orbit would run under the HUD's corner buttons;
   * then the other sides in turn, and the first whose whole orbit is clear is used, as a holding stack's racetrack is (stacks.js
   * makeFixes). The centre is kept on the map. If no side is clear, the first is used, as before.
   */
  holdCentre(a, r) {
    // the left, right, ahead and behind of the plane, then the diagonals; each first at the orbit's radius, then at twice and at three times it (a plane
    // in the corner's own button area cannot have its orbit through it clear, so it flies to a circle it is not on, as it flies to any
    // ring). The first candidate whose whole orbit is clear is used; if none is, the one under the fewest buttons' points
    const h = a.heading;
    const dirs = [h + Math.PI / 2, h - Math.PI / 2, h, h + Math.PI, h + Math.PI / 4, h - Math.PI / 4, h + (3 * Math.PI) / 4, h - (3 * Math.PI) / 4];
    let best = null, bestHit = Infinity;
    for (const dist of [r, 2 * r, 3 * r]) {
      for (const ang of dirs) {
        const cx = clamp(a.x + Math.cos(ang) * dist, r + 10, this.W - r - 10), cy = clamp(a.y + Math.sin(ang) * dist, r + 10, this.H - r - 10);
        let hit = 0;
        for (let i = 0; i < 24; i++) {
          const t = (i / 24) * TAU;
          if (this.inHudCorner(cx + Math.cos(t) * r, cy + Math.sin(t) * r)) hit++;
        }
        if (hit === 0) return { x: cx, y: cy };
        if (hit < bestHit) {
          bestHit = hit;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  /** May this aircraft land there? Its class, the zone open, and long enough for a hydraulics failure. */
  usable(a, z) {
    if (!z.allow.includes(a.cls) || z.closed) return false;
    const need = a.emergency && a.emergency.minLen;
    return !need || (z.kind === 'runway' && z.length >= need);
  }

  /**
   * Item 12: an airborne engine-out or low-fuel plane that may land on this runway still needs it, so no inspection closes it
   * and no wind shift re-ends it until that plane is down or lost (ops.js, weather.js).
   */
  neededByEmergency(z) {
    if (z.kind !== 'runway') return false;
    return this.aircraft.some((a) => a.state === 'fly' && a.emergency && (a.emergency.type === 'engine' || a.emergency.type === 'fuel') && this.usable(a, z));
  }

  /**
   * The ends of a runway this plane may land on: the active end, and for an engine-out or low-fuel plane (items 6, 12) the other end too. An
   * emergency may use either end even on a one-way runway (a plane in trouble lands where it can; item 12 promises an end).
   */
  landEnds(a, z) {
    return eitherEnd(a) ? [z.active, 1 - z.active] : [z.active];
  }

  /** The landing geometry of the end a plane is locked on at zone z (zoneHit's end, else the active one). */
  landGeometry(a, z) {
    const e = this.landEnds(a, z).includes(a.landEnd) ? a.landEnd : z.active;
    return e === z.active ? z : endGeometry(z, e);
  }

  /**
   * The point an approach to end g is measured from: the path back from the finger (x, y), within 24 units of it. A plane that turned
   * round to line up (its U-turn at the line-up point, 2.6 for every plane) stops the look-back at the turn: a turn inside the 24 units
   * is where the approach begins, and the leg it came back on is not the approach. Without this, a finger stopped at the threshold put
   * the turn inside the window, and the outbound leg was taken for the approach (the lock failed, at any stroke). Walking back, the turn
   * is the point the path comes down to nearest the approach, TURN_TOL or more below where the finger is; a path that overshoots and
   * comes back toward the finger goes up first, and that is not a turn, so it is not stopped there (it locks on its approach as before).
   */
  lookBack(a, x, y, g) {
    const p = a.path;
    let bx = a.x, by = a.y, turn = null, least = Infinity, start = null;
    for (let i = p.length - 1; i >= a.pathIdx; i--) {
      bx = p[i].x;
      by = p[i].y;
      if (dist(bx, by, x, y) > 24) break;
      // along the landing line (positive past the threshold): walking back from the finger, the path comes down to its least point, then back up
      const along = (bx - g.thx) * g.dirx + (by - g.thy) * g.diry;
      if (start == null) start = along;
      if (along < least) [least, turn] = [along, [bx, by]];
      else if (least < start - TURN_TOL && along > least + TURN_TOL) return turn;
    }
    return [bx, by];
  }

  /** Does the finger at (x,y) put this aircraft on approach to a zone it may use? */
  zoneHit(a, x, y, slack = 0) {
    if (a.departure) {
      const e = this.departures && this.departures.exitHit(x, y, slack);
      return e || null;
    }
    for (const z of this.zones) {
      if (!this.usable(a, z)) continue;
      if (z.kind === 'pad') {
        if (dist(x, y, z.cx, z.cy) < z.r + 8 + slack) return z;
        continue;
      }
      for (const e of this.landEnds(a, z)) {
        const g = e === z.active ? z : endGeometry(z, e);
        const dx = x - g.thx, dy = y - g.thy;
        const along = dx * g.dirx + dy * g.diry;
        const across = -dx * g.diry + dy * g.dirx;
        if (along < -16 - slack || along > z.length * 0.45 || Math.abs(across) > z.width / 2 + 12 + slack * 0.5) continue;
        const [bx, by] = this.lookBack(a, x, y, g);
        const vx = x - bx, vy = y - by;
        const len = Math.hypot(vx, vy);
        if (len < 3) continue;
        // roughly aligned with the runway: forgiving right at the threshold, stricter further down it, so a
        // path that only cuts across the runway isn't taken for a landing
        if ((vx * g.dirx + vy * g.diry) / len > (along < 18 ? 0.22 : 0.55)) {
          a.landEnd = e;
          return z;
        }
      }
    }
    return null;
  }

  lockLanding(a, z) {
    a.auto = null; // a landing locked: the turn for the end is over
    const p = a.path;
    if (z.kind === 'exit') {
      // fly through the gate and off the edge
      const last = p.length ? p[p.length - 1] : { x: a.x, y: a.y };
      const ox = z.x + Math.cos(z.ang) * 60, oy = z.y + Math.sin(z.ang) * 60;
      const n = Math.max(2, Math.floor(dist(last.x, last.y, ox, oy) / T.pathMinSpacing));
      for (let i = 1; i <= n; i++) p.push({ x: last.x + ((ox - last.x) * i) / n, y: last.y + ((oy - last.y) * i) / n });
      a.target = -1;
      a.exit = { x: ox, y: oy };
      a.drawing = false;
      a.loop = null;
      this.events.push({ kind: 'lock', aircraft: a, zone: z });
      return;
    }
    if (z.kind === 'pad') {
      p.push({ x: z.cx, y: z.cy });
    } else {
      const g = this.landGeometry(a, z);
      while (p.length > a.pathIdx + 1) {
        const q = p[p.length - 1];
        const along = (q.x - g.thx) * g.dirx + (q.y - g.thy) * g.diry;
        if (along > -6) p.pop(); else break;
      }
      const last = p.length ? p[p.length - 1] : { x: a.x, y: a.y };
      const d = dist(last.x, last.y, g.thx, g.thy);
      const n = Math.max(1, Math.floor(d / T.pathMinSpacing));
      for (let i = 1; i <= n; i++) p.push({ x: last.x + ((g.thx - last.x) * i) / n, y: last.y + ((g.thy - last.y) * i) / n });
    }
    a.target = z.id;
    a.drawing = false;
    a.loop = null;
    this.events.push({ kind: 'lock', aircraft: a, zone: z });
  }

  /** Cancel landings locked onto a runway end that just closed. */
  unlockZone(z) {
    for (const a of this.aircraft) {
      if (a.state === 'fly' && a.target === z.id) {
        a.target = null;
        this.events.push({ kind: 'unlock', aircraft: a, zone: z });
      }
    }
  }

  // --------------------------------------------------------- simulation

  step(dt) {
    this.time += dt;
    if (!this.over) this.updateSpawns(dt);
    if (this.departures && !this.over) this.departures.update(dt);
    for (const a of this.aircraft) {
      a.age += dt;
      if (a.ground) {
        if (this.departures) this.departures.step(a, dt);
        continue;
      }
      if (a.state === 'fly') this.fly(a, dt);
      else if (a.state === 'landing') this.land(a, dt);
      else if (a.state === 'crashed') a.landT += dt;
    }
    if (!this.over && !this.demo) this.checkConflicts();
    for (const a of this.aircraft) {
      // an arrival knocked away before it ever reached the screen would otherwise wander forever
      if (a.state === 'fly' && !a.entered && (a.age > 20 || a.x < -160 || a.y < -160 || a.x > this.W + 160 || a.y > this.H + 160)) a.state = 'done';
    }
    for (let i = this.aircraft.length - 1; i >= 0; i--) if (this.aircraft[i].state === 'done') this.aircraft.splice(i, 1);
    if (this.time - this.lastLandAt > 7) this.combo = 0;
  }

  fly(a, dt) {
    // a circling plane the finger has just taken stays where it is until the finger moves (beginPath, extendPath)
    if (a.waitHeld && a.drawing) return;
    const def = CLASSES[a.cls];
    const speed = def.speed * (a.speedMul || 1);
    const p = a.path;
    // the next point is the first one not yet passed: within the lookahead, or (a path begun from a circle, 2.6) behind the plane. A slow
    // drag is overtaken by its plane, and the points it has passed behind it are not turned back to (the U-turn toward the circle)
    const fwdX = Math.cos(a.heading), fwdY = Math.sin(a.heading), la2 = T.lookahead * T.lookahead;
    const behind = (q) => (q.x - a.x) * fwdX + (q.y - a.y) * fwdY < 0;
    while (a.pathIdx < p.length && (dist2(a.x, a.y, p[a.pathIdx].x, p[a.pathIdx].y) < la2
      || ((a.leaveFacing || a.fwdStart) && a.target == null && behind(p[a.pathIdx])))) a.pathIdx++;
    // a fresh path that has got ahead of its plane is followed as any path is: its points behind the plane are no longer skipped (3 of 2.8)
    if (a.fwdStart && a.pathIdx < p.length && !behind(p[a.pathIdx])) a.fwdStart = false;
    if (a.pathIdx >= p.length && a.loop && !a.drawing && a.target == null) {
      // keep flying the holding loop
      a.path = a.loop.map((q) => ({ x: q.x, y: q.y }));
      a.pathIdx = 0;
      a.pathBase = 0;
    }
    if (a.pathIdx < a.path.length) {
      const q = a.path[a.pathIdx];
      a.heading = turnToward(a.heading, Math.atan2(q.y - a.y, q.x - a.x), 9 * dt);
    } else if (a.target != null && !a.drawing) {
      if (a.exit) {
        this.depart(a);
        return;
      }
      this.startLanding(a);
      return;
    } else if (a.hold && !a.drawing) {
      const h = a.hold;
      const ang = Math.atan2(a.y - h.cy, a.x - h.cx) + h.side * 0.55;
      const tx = h.cx + Math.cos(ang) * h.r, ty = h.cy + Math.sin(ang) * h.r;
      a.heading = turnToward(a.heading, Math.atan2(ty - a.y, tx - a.x), 7 * dt);
    } else {
      // a path begun from a circle, with no point left ahead (a short drag: every point within the lookahead), faces its last point, so
      // the plane does not skim on along the old circle's tangent (2.6, C2): while the finger draws it, and after the lift it is flown
      // out, the path kept until the plane faces it
      // a flown path is kept for its tail's window after the lift (tailOf, 2.8 fix 2), so its handle can still be taken
      if (a.leaveFacing && a.path.length && this.faceLast(a, dt)) {
        // still turning
      } else if (a.path.length && !a.drawing && !(a.tailUntil > this.time)) {
        a.path.length = 0;
        a.pathIdx = 0;
        a.leaveFacing = false;
        a.leaveFrom = null;
      }
      // an engine-out plane turns for its runway end at the sim's rate until its aim point is close, then flies straight (applyEngine)
      // the turn is bank-limited (TUNING.engineBank over its speed), so it is smooth and not a snap; a flown path turns at the full rate
      if (a.auto && !a.drawing) {
        if (dist(a.x, a.y, a.auto.x, a.auto.y) > AIM_STOP) a.heading = turnToward(a.heading, Math.atan2(a.auto.y - a.y, a.auto.x - a.x), Math.min(PATH_TURN, T.engineBank / speed) * dt);
        else a.auto = null;
      }
      if (a.entered) this.bounce(a, dt);
    }
    if (a.pathIdx > 96) {
      a.pathBase += a.pathIdx * T.pathMinSpacing;
      a.path.splice(0, a.pathIdx);
      a.pathIdx = 0;
    }
    a.x += Math.cos(a.heading) * speed * dt;
    a.y += Math.sin(a.heading) * speed * dt;
    if (this.drift) this.drift(a, dt);
    a.heading = wrapAngle(a.heading);
    a.visHeading = turnToward(a.visHeading, a.heading, 14 * dt);
    if (!a.entered) {
      const m = def.radius;
      if (a.x > m && a.x < this.W - m && a.y > m && a.y < this.H - m) a.entered = true;
    }
  }

  /**
   * A path begun from a circle turns the plane to the way the drag went: from where the finger took the plane (leaveFrom) to the path's
   * last point (2.6, C2). Not from the plane's own place, which has moved on past a short drag's points. It turns unless that way is
   * more than about 150 degrees from its heading (a circle is left at 90 to 120 degrees off the drag, its orbit turning the plane a little inward). True while it still turns.
   */
  faceLast(a, dt) {
    const q = a.path[a.path.length - 1], f = a.leaveFrom;
    const dx = q.x - f.x, dy = q.y - f.y;
    if (Math.hypot(dx, dy) < 0.5) return false;
    const want = Math.atan2(dy, dx);
    const off = Math.abs(wrapAngle(want - a.heading));
    if (off > 2.6 || off < 0.05) return false;
    a.heading = turnToward(a.heading, want, 9 * dt);
    return true;
  }

  bounce(a, dt) {
    const m = T.edgeMargin;
    const c = Math.cos(a.heading), s = Math.sin(a.heading);
    let want = null;
    if ((a.x < m && c < 0) || (a.x > this.W - m && c > 0)) want = Math.atan2(s, -c);
    if ((a.y < m && s < 0) || (a.y > this.H - m && s > 0)) {
      want = Math.atan2(want === null ? -s : -Math.sin(want), want === null ? c : Math.cos(want));
    }
    if (want !== null) a.heading = turnToward(a.heading, want, Math.max(T.edgeTurnRate, CLASSES[a.cls].speed / 13) * dt);
  }

  depart(a) {
    a.state = 'done';
    if (this.over) return;
    // every departure counts and scores, whoever flew in: a real arrival that goes out again is a new, unlabelled flight
    // (departures.js turnaround). The end screen's points are landings, departures and bonuses less penalties, so each
    // departure is counted with its point
    this.score++;
    this.departed = (this.departed || 0) + 1;
    if (this.departures) this.departures.departed++;
    this.events.push({ kind: 'departed', aircraft: a, score: this.score });
  }

  startLanding(a) {
    const z = this.zone(a.target);
    a.state = 'landing';
    a.landT = 0;
    a.path.length = 0;
    a.pathIdx = 0;
    a.loop = null;
    if (z.kind === 'runway') {
      // remember the runway as it was: a wind shift mid-rollout mustn't teleport us
      const g = this.landGeometry(a, z);
      a.rw = { thx: g.thx, thy: g.thy, dirx: g.dirx, diry: g.diry, angle: g.angle };
      const dx = a.x - g.thx, dy = a.y - g.thy;
      a.landS = dx * g.dirx + dy * g.diry;
      a.landLat = -dx * g.diry + dy * g.dirx;
    }
    if (this.over) return;
    let bonus = 0;
    if (a.emergency) {
      bonus = a.emergency.type === 'medevac' ? (a.emergency.waited ? 0 : 3) : 1;
    } else {
      // landing someone else while a medevac is still airborne makes it wait
      for (const m of this.aircraft) {
        // once per medevac: the first landing that makes it wait costs a point, not every one after
        if (m !== a && m.state === 'fly' && m.emergency && m.emergency.type === 'medevac' && !m.emergency.waited) {
          m.emergency.waited = true;
          bonus -= 1;
          this.events.push({ kind: 'medevacWait', aircraft: m });
        }
      }
    }
    // a real flight confirmed landing here scores one more: the points are 1 for the landing, 1 more when confirmed, the
    // emergency or medevac bonus, less a medevac's wait. Every part is counted, so the score is the parts' sum (sim.test)
    const confirmed = a.live && a.confirmed ? 1 : 0;
    const before = this.score;
    this.score = Math.max(0, this.score + 1 + confirmed + bonus);
    if (bonus > 0) this.bonusPts += bonus;
    else if (bonus < 0) this.penaltyPts += before + 1 + confirmed - this.score;
    if (confirmed) this.confirmedPts += 1;
    this.landed++;
    if (a.live) {
      this.landedLive++;
      (this.liveNames = this.liveNames || []).push(a.label || a.callsign);
      if (confirmed) this.landedConfirmed++;
    }
    this.landedByClass[a.cls] = (this.landedByClass[a.cls] || 0) + 1;
    const vary = (((a.id + 1) * 2654435761) >>> 0) % 1000 / 1000; // per-aircraft, without touching the RNG
    this.pax += Math.max(1, Math.round((PAX[a.cls] || 0) * (0.8 + 0.4 * vary)));
    this.combo = this.time - this.lastLandAt < 7 ? this.combo + 1 : 1;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.lastLandAt = this.time;
    this.events.push({ kind: 'land', aircraft: a, zone: z, score: this.score, combo: this.combo, bonus, streak: this.streak, confirmed: !!confirmed, gain: this.score - before });
  }

  /**
   * Is something already using this runway (rolling out, lining up, taking off)? The warning before a busy runway is the
   * heartbeat's ghost run (ghost.js), on Hard and Chaos only; the sim itself only checks at touchdown.
   */
  runwayOccupant(z, except) {
    for (const o of this.aircraft) {
      if (o === except || o.target !== z.id) continue;
      if (o.state === 'landing' && o.touchedDown && o.landT < CLASSES[o.cls].landTime - 0.3) return o;
      if (o.departure && (o.state === 'lineup' || o.state === 'takeoff')) return o;
    }
    return null;
  }

  /**
   * Two aircraft on one runway at touchdown (no crash on this level): the arrival's lateral offset goes to the side of the
   * runway the occupant is not on, so they do not sit on top of each other. The offset is +-7 units, within 40 units along.
   */
  sideStep(a, occ, r) {
    const along = (occ.x - a.x) * r.dirx + (occ.y - a.y) * r.diry;
    if (Math.abs(along) >= 40) return;
    const lat = -(occ.x - r.thx) * r.diry + (occ.y - r.thy) * r.dirx;
    a.landLat = lat > 0 ? -7 : 7;
  }

  land(a, dt) {
    const z = this.zone(a.target);
    const def = CLASSES[a.cls];
    const dur = def.landTime;
    a.landT += dt;
    const k = Math.min(1, a.landT / dur);
    if (z.kind === 'runway') {
      const r = a.rw || z;
      const v = def.speed * (1 - 0.72 * easeOutCubic(k));
      a.landS += v * dt;
      a.landLat *= 1 - damp(6, dt);
      a.x = r.thx + r.dirx * a.landS - r.diry * a.landLat;
      a.y = r.thy + r.diry * a.landS + r.dirx * a.landLat;
      a.heading = turnToward(a.heading, r.angle, 4 * dt);
      a.visHeading = turnToward(a.visHeading, a.heading, 10 * dt);
      if (!a.touchedDown && a.landT > 0.35) {
        a.touchedDown = true;
        const occ = !this.demo && !this.over && this.runwayOccupant(z, a);
        if (occ && this.rules.busyRunwayLoses) {
          this.crashPair(a, occ, 'runway');
          return;
        }
        // not a crash on this level: both carry on, and the arrival lands on the far side of the occupant (sideStep)
        if (occ) this.sideStep(a, occ, r);
        this.events.push({ kind: 'touchdown', aircraft: a, x: a.x, y: a.y });
        if (this.departures) this.departures.reserveStand(a);
      }
    } else {
      const f = damp(3.2, dt);
      a.x += (z.cx - a.x) * f;
      a.y += (z.cy - a.y) * f;
      a.visHeading += dt * 0.6 * (1 - k);
    }
    a.scale = 1 - 0.3 * easeOutCubic(Math.min(1, a.landT / 0.7));
    // arrivals with a gate to go to stay visible and taxi in; the rest fade out on the runway
    a.alpha = a.inbound ? 1 : a.landT > dur - 0.45 ? Math.max(0, (dur - a.landT) / 0.45) : 1;
    if (a.landT >= dur) {
      if (a.inbound && this.departures && this.departures.taxiIn(a)) return;
      a.state = 'done';
    }
  }

  checkConflicts() {
    const list = this.aircraft;
    for (const a of list) a.prox = false;
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state !== 'fly' || !this.onScreen(a)) continue;
      const ra = CLASSES[a.cls].radius;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state !== 'fly' || !this.onScreen(b) || this.separated(a, b)) continue;
        const touch = ra + CLASSES[b.cls].radius;
        const warn = touch + T.warnExtra;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (Math.abs(dx) > warn + 6 || Math.abs(dy) > warn + 6) continue;
        const d = Math.hypot(dx, dy);
        if (d > warn + 6) continue;
        const key = a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id;
        if (d < touch) {
          this.crashPair(a, b, 'collision');
          return;
        }
        if (d < warn) {
          a.prox = b.prox = true;
          seen.add(key);
          const rec = this.pairs.get(key);
          // the pair's positions at its closest approach, so the near-miss shockwave can sit on the pair (main.js)
          if (!rec) {
            this.pairs.set(key, { min: d, touch, ax: a.x, ay: a.y, bx: b.x, by: b.y });
            this.events.push({ kind: 'prox', a, b });
          } else if (d < rec.min) Object.assign(rec, { min: d, ax: a.x, ay: a.y, bx: b.x, by: b.y });
        } else if (this.pairs.has(key)) seen.add(key);
      }
    }
    for (const [key, rec] of this.pairs) {
      if (seen.has(key)) continue;
      this.pairs.delete(key);
      if (rec.min < rec.touch + 9) {
        this.events.push({ kind: 'nearMiss', gap: rec.min - rec.touch, streak: this.streak, a: { x: rec.ax, y: rec.ay }, b: { x: rec.bx, y: rec.by } });
        this.streak = 0;
      }
    }
  }

  /**
   * Bullet-mode look-ahead: pairs of airborne aircraft predicted to touch within `horizon`
   * seconds if they keep their current velocity. Returns [{a, b, t}].
   */
  predictConflicts(horizon = 3) {
    const out = [];
    const list = this.aircraft.filter((a) => a.state === 'fly' && this.onScreen(a));
    for (let i = 0; i < list.length; i++) {
      const a = list[i], da = CLASSES[a.cls];
      const avx = Math.cos(a.heading) * da.speed, avy = Math.sin(a.heading) * da.speed;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j], db = CLASSES[b.cls];
        if (this.separated(a, b)) continue;
        const t = timeToContact(a.x, a.y, avx, avy, b.x, b.y, Math.cos(b.heading) * db.speed, Math.sin(b.heading) * db.speed, da.radius + db.radius);
        if (t != null && t <= horizon) out.push({ a, b, t });
      }
    }
    return out;
  }

  onScreen(a) {
    return a.x > 0 && a.x < this.W && a.y > 0 && a.y < this.H;
  }

  crashPair(a, b, reason = 'collision') {
    a.state = b.state = 'crashed';
    a.landT = b.landT = 0;
    a.drawing = b.drawing = false;
    this.endGame(reason, (a.x + b.x) / 2, (a.y + b.y) / 2, [a, b]);
  }

  /** A single aircraft lost (wake, storm, fuel, glide ...). */
  lose(a, reason) {
    a.state = 'crashed';
    a.landT = 0;
    a.drawing = false;
    this.endGame(reason, a.x, a.y, [a]);
  }

  endGame(reason, x, y, who) {
    if (this.over) return;
    this.over = true;
    this.crash = { x, y, who, reason, time: this.time };
    this.warnings.length = 0;
    this.events.push({ kind: 'crash', x, y, who, reason });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------- rewind

  /** Plain-data copy of everything that changes during play. */
  snapshot() {
    return clone({
      time: this.time, score: this.score, landed: this.landed, landedLive: this.landedLive, landedConfirmed: this.landedConfirmed, confirmedPts: this.confirmedPts, departed: this.departed || 0, liveNames: [...(this.liveNames || [])], bonusPts: this.bonusPts, penaltyPts: this.penaltyPts, pax: this.pax,
      aircraft: this.aircraft, warnings: this.warnings, nextId: this.nextId, rng: this.rng.getState(), liveRng: this.liveRng.getState(), liveSpawned: this.liveSpawned,
      lastLandAt: this.lastLandAt, combo: this.combo, streak: this.streak, bestStreak: this.bestStreak, landedByClass: this.landedByClass,
      zones: this.zones.map((z) => ({ active: z.active, closing: z.closing, closed: z.closed || false })),
      // Departures ride in extras (departures.js snapshot: its timer, count, exits and rng), so ground traffic is restored
      rules: { ...this.rules },
      extras: (this.extras || []).map((e) => e.snapshot()),
    });
  }

  restore(s) {
    const c = clone(s);
    Object.assign(this, {
      time: c.time, score: c.score, landed: c.landed, landedLive: c.landedLive, landedConfirmed: c.landedConfirmed || 0, confirmedPts: c.confirmedPts || 0, departed: c.departed, aircraft: c.aircraft, liveNames: c.liveNames || [],
      warnings: c.warnings, nextId: c.nextId, lastLandAt: c.lastLandAt, combo: c.combo, landedByClass: c.landedByClass,
      streak: c.streak || 0, bestStreak: c.bestStreak || 0, bonusPts: c.bonusPts || 0, penaltyPts: c.penaltyPts || 0, pax: c.pax || 0,
    });
    this.rng.setState(c.rng);
    this.liveRng.setState(c.liveRng);
    this.liveSpawned = c.liveSpawned || 0;
    c.zones.forEach((zs, i) => {
      const z = this.zones[i];
      if (z.kind === 'runway' && z.active !== zs.active) setActiveEnd(z, zs.active);
      z.closing = zs.closing;
      z.closed = zs.closed;
    });
    (this.extras || []).forEach((e, i) => c.extras[i] && e.restore(c.extras[i]));
    for (const a of this.aircraft) {
      a.drawing = false; // fingers from before the rewind are gone
      a.smooth = null;
    }
    this.pairs.clear();
    this.events = [];
    this.over = false;
    this.crash = null;
  }
}

/**
 * Real planes only has just been switched on (or a rewind landed back in one): every simulated plane goes, in the air, on
 * the ground (a simulated departure) or still queued. Silently: no score, no crash, no pop-up. Real planes are never
 * touched, and the ones flying in finish their approach as real planes do.
 */
export function purgeSimulated(sim) {
  sim.warnings = sim.warnings.filter((w) => w.live);
  const gone = sim.aircraft.filter((a) => !a.live);
  sim.aircraft = sim.aircraft.filter((a) => a.live);
  // the conflict pairs are keyed by the two ids (sim.checkConflicts): drop any pair with a removed plane in it
  const ids = new Set(gone.map((a) => a.id));
  for (const k of [...sim.pairs.keys()]) if (ids.has(Math.floor(k / 100000)) || ids.has(k % 100000)) sim.pairs.delete(k);
  return gone.length;
}

/** A fresh path's touch (x, y) and the plane's heading then: the frame its drag is measured in (fwdBack, fwdStart). */
function fwdFrom(x, y, heading) {
  return { x, y, hx: Math.cos(heading), hy: Math.sin(heading) };
}

/** How far (units) the drag at (x, y) has gone along the heading of its touch f: negative going back (fwdStart). */
function fwdBack(f, x, y) {
  return (x - f.x) * f.hx + (y - f.y) * f.hy;
}

/**
 * The net turn (radians) of a path from its point i to its end: the sum of the changes in its direction, signed. A ring drawn round
 * turns a full circle (2 pi); a hairpin turns half of one, and an ordinary curve less (loopAt, 2.8 fix 4).
 */
function pathTurn(p, i) {
  let sum = 0, prev = null;
  for (let k = i; k < p.length - 1; k++) {
    const dx = p[k + 1].x - p[k].x, dy = p[k + 1].y - p[k].y;
    if (dx * dx + dy * dy < 1e-9) continue;
    const h = Math.atan2(dy, dx);
    if (prev != null) sum += wrapAngle(h - prev);
    prev = h;
  }
  return sum;
}

/** Does a loop reach from its centre (the mean of its points) at least r out, in world units (sim.detectLoop)? */
function wideLoop(loop, r) {
  let cx = 0, cy = 0;
  for (const q of loop) {
    cx += q.x;
    cy += q.y;
  }
  cx /= loop.length;
  cy /= loop.length;
  let far = 0;
  for (const q of loop) far = Math.max(far, Math.hypot(q.x - cx, q.y - cy));
  return far >= r;
}

/** Does a disc (a point when r = 0) touch a box { x, y, w, h }? */
function discInBox(x, y, r, b) {
  const dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h);
  return dx * dx + dy * dy <= r * r;
}

/** Earliest time two moving discs touch (relative-motion quadratic), or null. */
export function timeToContact(ax, ay, avx, avy, bx, by, bvx, bvy, r) {
  const px = bx - ax, py = by - ay, vx = bvx - avx, vy = bvy - avy;
  const c = px * px + py * py - r * r;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy;
  if (a < 1e-9) return null;
  const b = 2 * (px * vx + py * vy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : null;
}

export { TAU };
