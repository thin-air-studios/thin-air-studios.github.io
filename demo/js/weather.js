// Weather as an enemy: crosswind drift, drifting storm cells, wind shifts that flip the active
// runways, and fog that hides distant aircraft behind radar blips. Seeded from the real METAR when
// available, otherwise generated; difficulty scales severity. All state is plain data (rewind).
import { makeRng, dist, TAU, clamp } from './util.js?v=2f66fd5f';
import { reducedMotion, flashGate } from './motion.js?v=2f66fd5f';
import { bearingToCanvas } from './geo.js?v=2f66fd5f';
import { CLASSES, LANE_S } from './config.js?v=2f66fd5f';
import { chooseActiveEnds } from './metar.js?v=2f66fd5f';
import { setActiveEnd } from './airport.js?v=2f66fd5f';
import { FONT } from './fx.js?v=2f66fd5f';

// crosswind drift (units/s per knot) by size class: strongest on light aircraft
const DRIFT = { light: 0.3, regional: 0.2, heli: 0.2, narrowbody: 0.12, heavy: 0.075 };
const AIR_PER_KT = 0.11; // how fast storms/fog/wakes drift (units/s per knot)
const SHIFT_WARNING = 20;
const SWEEP = 2.5; // radar sweep period (s)
// A new storm cell is drawn but harms nothing for HARM_AFTER seconds (a player sees it before it can cost a plane), then its
// harmful core grows from nothing to full size over HARM_GROW seconds.
const HARM_AFTER = 5;
const HARM_GROW = 10;
const FORM_MARGIN = 10; // units of clear air a new cell keeps from planes, approaches, arrival lanes and the edge
const ENTRY_MARGIN = 8; // units an arrival's entry keeps beyond a cell's outer edge
const APPROACH = 170; // units of approach path out from a runway threshold (the autopilot's first leg, sim.js)

/** Air movement in world units/s for a wind (dir: degrees it blows FROM; kt). Shared with the wake look-ahead (ghost.js). */
export function airVelOf(dir, kt, k = AIR_PER_KT) {
  const ang = bearingToCanvas(dir + 180);
  return [Math.cos(ang) * kt * k, Math.sin(ang) * kt * k];
}

/** Distance from (px, py) to the segment a-b. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1) : 0;
  return dist(px, py, ax + vx * t, ay + vy * t);
}

export class Weather {
  constructor({ sim, seed = 1, severity = 0.7, seedWx = null }) {
    this.sim = sim;
    this.rng = makeRng(seed ^ 0xa5a5);
    this.severity = severity;
    this.source = seedWx ? (seedWx.source || 'metar') : 'generated'; // a friend's challenge says 'link' (challenge.js); nothing reads it on screen
    const r = this.rng;
    if (seedWx && seedWx.windDir != null) {
      this.windDir = seedWx.windDir;
      this.windKt = seedWx.windKt;
      this.gustKt = seedWx.gustKt || 0;
    } else {
      this.windDir = (Math.round(r() * 36) * 10) || 360;
      this.windKt = seedWx ? Math.max(2, seedWx.windKt || 0) : Math.round(4 + r() * 10 * severity);
      this.gustKt = !seedWx && r() < 0.3 * severity ? this.windKt + Math.round(5 + r() * 8) : 0;
    }
    this.storms = [];
    this.fog = [];
    this.shift = null;
    this.banner = '';
    this.sweepT = 0;
    this.sweepAng = 0;
    this.t = 0;
    this.nextShift = 70 + r() * 70 / Math.max(0.3, severity);
    this.nextStorm = seedWx && seedWx.storms ? 0 : 35 + r() * 50 / Math.max(0.3, severity);
    this.metarStorms = !!(seedWx && seedWx.storms); // the real METAR has storms: one more allowed (setSeverity)
    this.maxStorms = Math.round(1 + severity * 2.2) + (this.metarStorms ? 1 : 0);
    this.nextFog = seedWx && seedWx.fog ? 0 : (severity > 0.5 ? 60 + r() * 120 : Infinity);
    this.fogTarget = seedWx ? seedWx.fog : 0;
    if (seedWx && seedWx.storms) for (let i = 0; i < 2; i++) this.spawnStorm(true);
    if (this.fogTarget > 0) this.spawnFog(this.fogTarget, true);
    sim.wind = { dir: this.windDir, kt: this.windKt };
    sim.drift = (a, dt) => this.drift(a, dt);
    sim.extras = sim.extras || [];
    sim.extras.push(this);
  }

  /** The level's weather severity, changed mid-game (midgame.js applyLevel): storms allowed and the crosswind follow it. */
  setSeverity(sev) {
    this.severity = sev;
    this.maxStorms = Math.round(1 + sev * 2.2) + (this.metarStorms ? 1 : 0);
  }

  /**
   * Beginner's calm skies (no storms, fog or wind shifts), or the schedules back from them when the level leaves Beginner: a
   * schedule that is Infinity starts from now, as the constructor starts it. The draws are the weather's own RNG, so a replay
   * gets the same schedule.
   */
  setCalm(on) {
    if (on) {
      this.nextStorm = Infinity;
      this.nextShift = Infinity;
      this.nextFog = Infinity;
      return;
    }
    const r = this.rng, sev = Math.max(0.3, this.severity);
    if (this.nextShift === Infinity) this.nextShift = this.t + 70 + r() * 70 / sev;
    if (this.nextStorm === Infinity) this.nextStorm = this.t + 35 + r() * 50 / sev;
    if (this.nextFog === Infinity && this.severity > 0.5) this.nextFog = this.t + 60 + r() * 120;
  }

  /** Air movement in world units/s (wind blows FROM windDir). */
  airVel(k = AIR_PER_KT) {
    return airVelOf(this.windDir, this.windKt, k);
  }

  gustNow() {
    if (!this.gustKt) return this.windKt;
    const g = 0.5 + 0.5 * Math.sin(this.t * 0.9) * Math.sin(this.t * 0.37 + 1);
    return this.windKt + (this.gustKt - this.windKt) * g;
  }

  /** Crosswind: push airborne aircraft downwind, most of all light ones. */
  drift(a, dt) {
    if (a.ground || a.state !== 'fly') return;
    if (a.emergency && a.emergency.type === 'engine') return; // its glide ring already budgets the distance
    const kt = this.gustNow() * (0.55 + this.severity * 0.45);
    const ang = bearingToCanvas(this.windDir + 180);
    const k = DRIFT[a.cls] || 0.15;
    a.x += Math.cos(ang) * kt * k * dt;
    a.y += Math.sin(ang) * kt * k * dt;
  }

  // ------------------------------------------------------------ storms

  /**
   * A new storm cell, if there is clear air for one; false when there is not (step tries again soon). It forms where it harms
   * nothing: no plane under it or near enough to be under it as it grows, no approach path to a runway end, no arrival's lane,
   * and clear of the field's edge, where arrivals come in. It tries a few spots and takes the first clear one. The initial cells
   * (the METAR's, at the game's start) take the clearest of the spots when none is clear: there is no sky yet to keep out of.
   */
  spawnStorm(initial = false) {
    const r = this.rng, sim = this.sim;
    const [vx, vy] = this.airVel(0.08);
    const sp = Math.hypot(vx, vy) || 1;
    const rMax = (38 + r() * 40) * (0.8 + this.severity * 0.3);
    const Rc = rMax * 1.15 + FORM_MARGIN; // the cell's outer edge at full size, with its margin
    let best = null;
    for (let k = 0; k < 16; k++) {
      let x, y;
      if (initial) {
        x = sim.W * (0.15 + r() * 0.7);
        y = sim.H * (0.15 + r() * 0.7);
      } else {
        // enter from the upwind side so the cell drifts across the field, and keep it inside the field
        const ux = clamp(0.5 - (vx / sp) * 0.42 + (r() - 0.5) * 0.5, 0, 1);
        const uy = clamp(0.5 - (vy / sp) * 0.42 + (r() - 0.5) * 0.5, 0, 1);
        x = Rc + ux * (sim.W - 2 * Rc);
        y = Rc + uy * (sim.H - 2 * Rc);
      }
      const c = this.formClearance(x, y, Rc);
      if (!best || c > best.c) best = { x, y, c };
      if (c >= 0) break;
    }
    if (best.c < 0 && !initial) return false;
    const harmonics = Array.from({ length: 5 }, () => [r() * TAU, 0.06 + r() * 0.1, 1 + Math.floor(r() * 4)]);
    this.storms.push({
      x: best.x, y: best.y, vx: vx + (r() - 0.5) * 1.5, vy: vy + (r() - 0.5) * 1.5,
      r: 18, rMax, age: 0, life: 70 + r() * 70, harmonics,
    });
    return true;
  }

  /**
   * How much clear air a cell of outer radius Rc at (x, y) would have: the least gap (units) to a plane, an approach path to a
   * runway end (both ends, as the wind may flip them), an arrival's lane, or the edge. Negative: it would be on one of them.
   */
  formClearance(x, y, Rc) {
    const sim = this.sim;
    let m = Math.min(x, sim.W - x, y, sim.H - y) - Rc;
    for (const a of sim.aircraft) {
      if (a.state === 'done' || a.state === 'crashed') continue;
      m = Math.min(m, dist(x, y, a.x, a.y) - Rc - CLASSES[a.cls].radius);
    }
    for (const w of sim.warnings) {
      const L = CLASSES[w.cls].speed * LANE_S;
      m = Math.min(m, segDist(x, y, w.x, w.y, w.x + Math.cos(w.heading) * L, w.y + Math.sin(w.heading) * L) - Rc);
    }
    for (const z of sim.zones) {
      if (z.kind !== 'runway' || !z.ends) continue;
      const [a, b] = z.ends;
      m = Math.min(m, segDist(x, y, a.x, a.y, b.x, b.y) - Rc - z.width / 2);
      for (const [e, o] of [[a, b], [b, a]]) {
        const d = Math.hypot(o.x - e.x, o.y - e.y) || 1;
        const ux = (o.x - e.x) / d, uy = (o.y - e.y) / d;
        // the approach: out from the threshold, against the way it is landed
        m = Math.min(m, segDist(x, y, e.x - ux * APPROACH, e.y - uy * APPROACH, e.x, e.y) - Rc - z.width / 2);
      }
    }
    return m;
  }

  stormRadius(s) {
    const k = s.age / s.life;
    const grow = clamp(s.age / 18, 0, 1), decay = clamp((s.life - s.age) / 20, 0, 1);
    return s.r + (s.rMax - s.r) * Math.min(grow, decay) * (k < 1 ? 1 : 0);
  }

  /** 0 for a new cell's first seconds (HARM_AFTER), then 0 to 1 as its harmful core grows (HARM_GROW). */
  harmScale(s) {
    return clamp((s.age - HARM_AFTER) / HARM_GROW, 0, 1);
  }

  /** One cell's level at (x, y): 0 outside, 1 = green, 2 = yellow, 3 = red core (the cores grow in with harmScale). */
  cellLevel(s, x, y) {
    const R = this.stormRadius(s);
    const d = dist(x, y, s.x, s.y);
    if (d > R * 1.15) return 0;
    const f = this.shape(s, Math.atan2(y - s.y, x - s.x));
    const hs = this.harmScale(s);
    if (d < R * 0.38 * f * hs) return 3;
    if (d < R * 0.68 * f * hs) return 2;
    if (d < R * f) return 1;
    return 0;
  }

  /** 0 outside, 1 = green, 2 = yellow, 3 = red core. */
  stormLevelAt(x, y) {
    let lvl = 0;
    for (const s of this.storms) lvl = Math.max(lvl, this.cellLevel(s, x, y));
    return lvl;
  }

  /**
   * An arrival entering here on its heading would fly into a storm cell within its first LANE_S seconds (the cells drift and grow as
   * they do): sim.js holds it back (queueArrival skips the lane, updateSpawns waits or takes a clear entry). Each moment of the lane
   * is checked against the cell as it will be then (its radius at its age then), level 1 and up.
   */
  entryHazard(ex, ey, heading, cls) {
    if (!this.storms.length) return false;
    const speed = CLASSES[cls].speed;
    const vx = Math.cos(heading) * speed, vy = Math.sin(heading) * speed;
    for (let t = 0; t <= LANE_S; t += 0.5) {
      for (const s of this.storms) {
        // the cell's outer edge then (stormRadius * 1.15, where cellLevel stops) and a little more: the plane moves in the step it appears
        const R = this.stormRadius({ ...s, age: s.age + t });
        if (dist(ex + vx * t, ey + vy * t, s.x + s.vx * t, s.y + s.vy * t) < R * 1.15 + ENTRY_MARGIN) return true;
      }
    }
    return false;
  }

  shape(s, ang) {
    let f = 1;
    for (const [ph, amp, n] of s.harmonics) f += amp * Math.sin(n * ang + ph + this.t * 0.15 * n);
    return f;
  }

  // ---------------------------------------------------------------- fog

  spawnFog(density, initial = false) {
    const r = this.rng, sim = this.sim;
    const n = Math.round(3 + density * 4);
    const [vx, vy] = this.airVel(0.06);
    const sp = Math.hypot(vx, vy) || 1;
    for (let i = 0; i < n; i++) {
      const x = initial ? sim.W * r() : sim.W / 2 - (vx / sp) * sim.W * 0.7 + (r() - 0.5) * sim.W * 0.6;
      const y = initial ? sim.H * r() : sim.H / 2 - (vy / sp) * sim.H * 0.7 + (r() - 0.5) * sim.H * 0.6;
      this.fog.push({ x, y, r: 110 + r() * 110, vx: vx + (r() - 0.5), vy: vy + (r() - 0.5), age: initial ? 8 : 0, life: initial ? 150 + r() * 120 : 70 + r() * 60, a: 0 });
    }
  }

  fogAt(x, y) {
    let v = 0;
    for (const f of this.fog) {
      const d = dist(x, y, f.x, f.y);
      if (d < f.r) v = Math.max(v, f.a * (1 - (d / f.r) ** 2));
    }
    return v;
  }

  // -------------------------------------------------------- wind shifts

  /** Which runway ends will close if the wind swings to `dir`? */
  closingFor(dir) {
    const ends = chooseActiveEnds(this.sim.zones, dir, Math.max(8, this.windKt));
    return this.sim.zones.filter((z, i) => z.kind === 'runway' && ends[i] != null && ends[i] !== z.active);
  }

  startShift() {
    const r = this.rng;
    // usually a reversal, sometimes a quarter turn that only flips some of the runways
    const swing = r() < 0.4 ? 60 + r() * 60 : 150 + r() * 60;
    const newDir = ((this.windDir + (r() < 0.5 ? swing : 360 - swing)) % 360) || 360;
    const closing = this.closingFor(newDir);
    if (!closing.length) {
      this.windDir = newDir;
      return;
    }
    // item 12: a runway an emergency can still land on keeps its ends: the shift is tried again shortly
    if (closing.some((z) => this.sim.neededByEmergency(z))) {
      this.nextShift = 5;
      return;
    }
    for (const z of closing) z.closing = true;
    const main = closing.reduce((a, b) => (b.lengthM > a.lengthM ? b : a));
    this.shift = { t: SHIFT_WARNING, newDir, ident: main.activeIdent, ids: closing.map((z) => z.id) };
    this.sim.events.push({ kind: 'windWarning', ident: main.activeIdent });
  }

  applyShift() {
    const sim = this.sim;
    this.windDir = this.shift.newDir;
    // the new wind is its own: it can blow lighter than the old one, not only ever stronger
    this.windKt = 8 + Math.round(this.rng() * 8 * this.severity);
    const ends = chooseActiveEnds(sim.zones, this.windDir, this.windKt);
    for (const id of this.shift.ids) {
      const z = sim.zones[id];
      z.closing = !!(sim.ops && sim.ops.warning(z)); // a runway inspection may still be counting down on it
      if (ends[id] != null && ends[id] !== z.active) {
        setActiveEnd(z, ends[id]);
        sim.unlockZone(z);
      }
    }
    if (sim.departures) {
      sim.departures.placeExits();
      sim.departures.rerouteFor(this.shift.ids);
    }
    sim.wind = { dir: this.windDir, kt: this.windKt };
    sim.events.push({ kind: 'windShift', dir: this.windDir });
    this.shift = null;
  }

  // --------------------------------------------------------------- step

  step(dt) {
    const sim = this.sim;
    this.t += dt;
    if (sim.over || sim.demo) return;
    // wind shifts
    if (this.shift) {
      this.shift.t -= dt;
      const s = Math.max(0, Math.ceil(this.shift.t));
      // item 12: a runway an emergency still needs keeps its ends until the emergency is down or lost (the shift waits)
      const held = this.shift.t <= 0 && this.shift.ids.some((id) => sim.neededByEmergency(sim.zones[id]));
      this.banner = held
        ? `Wind shifting — Runway ${this.shift.ident} waits for the emergency to land`
        : `Wind shifting — Runway ${this.shift.ident} closing in 0:${String(s).padStart(2, '0')}`;
      if (this.shift.t <= 0 && !held) this.applyShift();
    } else {
      this.banner = '';
      if (this.severity >= 0.3) {
        this.nextShift -= dt;
        if (this.nextShift <= 0) {
          this.nextShift = (90 + this.rng() * 90) / Math.max(0.4, this.severity);
          this.startShift();
        }
      }
    }
    // storms
    this.nextStorm -= dt;
    if (this.nextStorm <= 0) {
      this.nextStorm = (40 + this.rng() * 60) / Math.max(0.3, this.severity);
      // no clear air for a cell right now: the next try comes soon, not a whole gap later
      if (this.storms.length < this.maxStorms && this.severity > 0.2 && !this.spawnStorm()) this.nextStorm = 8;
    }
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.age > s.life) this.storms.splice(i, 1);
    }
    // fog banks
    this.nextFog -= dt;
    if (this.nextFog <= 0) {
      this.nextFog = (120 + this.rng() * 120) / Math.max(0.3, this.severity);
      if (!this.fog.length) this.spawnFog(0.6 + 0.4 * this.rng());
    }
    for (let i = this.fog.length - 1; i >= 0; i--) {
      const f = this.fog[i];
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const fadeIn = clamp(f.age / 8, 0, 1), fadeOut = clamp((f.life - f.age) / 10, 0, 1);
      f.a = Math.min(fadeIn, fadeOut) * 0.95;
      const gone = f.x < -f.r - 60 || f.y < -f.r - 60 || f.x > sim.W + f.r + 60 || f.y > sim.H + f.r + 60;
      if (f.age > f.life || (gone && f.age > 20)) this.fog.splice(i, 1);
    }
    // radar sweep
    this.sweepAng = (this.sweepAng + (dt / SWEEP) * TAU) % TAU;
    this.sweepT += dt;
    const sweep = this.sweepT >= SWEEP;
    if (sweep) this.sweepT = 0;
    // aircraft vs weather
    const cx = sim.W / 2, cy = sim.H / 2;
    for (const a of sim.aircraft) {
      if (a.state !== 'fly' || a.ground) {
        a.blip = null;
        continue;
      }
      if (!a.entered) continue; // weather can't touch arrivals still off-screen
      // fog: far from the field you only see radar returns
      if (this.fog.length && this.fogAt(a.x, a.y) > 0.45 && dist(a.x, a.y, cx, cy) > 150) {
        if (!a.blip || sweep) a.blip = { x: a.x, y: a.y };
      } else a.blip = null;
      // storms
      if (!this.storms.length) {
        a.stormT = Math.max(0, (a.stormT || 0) - dt);
        continue;
      }
      const lvl = this.stormLevelAt(a.x, a.y);
      if (lvl >= 2) {
        a.stormT = (a.stormT || 0) + dt * (lvl === 3 ? 1.6 : 1);
        if (lvl === 3 && !a.stormHit) {
          a.stormHit = true;
          this.knock(a, 'storm');
        }
        // a real flight is knocked by a storm but never lost to one (it is still a real flight in the sky)
        if (a.stormT > 4 && !a.live) sim.lose(a, 'storm');
      } else {
        a.stormT = Math.max(0, (a.stormT || 0) - dt * 0.6);
        if (lvl === 0) a.stormHit = false;
      }
    }
  }

  /** Turbulence: knock an aircraft off its path with a jolt. */
  knock(a, why) {
    a.path.length = 0;
    a.pathIdx = 0;
    a.target = null;
    a.exit = null;
    a.loop = null;
    a.hold = null;
    if (a.stack) a.stackLeft = { fix: a.stack.fix, t: this.sim.time };
    a.stack = null; // knocked out of the hold
    a.drawing = false;
    a.heading += (this.rng() < 0.5 ? -1 : 1) * (0.6 + this.rng() * 0.6);
    a.knockT = this.sim.time;
    this.sim.events.push({ kind: 'knocked', aircraft: a, why });
  }

  // -------------------------------------------------------------- rewind

  snapshot() {
    return {
      windDir: this.windDir, windKt: this.windKt, gustKt: this.gustKt, t: this.t,
      storms: this.storms.map((s) => ({ ...s, harmonics: s.harmonics.map((h) => [...h]) })),
      fog: this.fog.map((f) => ({ ...f })), shift: this.shift ? { ...this.shift, ids: [...this.shift.ids] } : null,
      nextShift: this.nextShift, nextStorm: this.nextStorm, nextFog: this.nextFog, rng: this.rng.getState(),
    };
  }

  restore(s) {
    Object.assign(this, { windDir: s.windDir, windKt: s.windKt, gustKt: s.gustKt, t: s.t, storms: s.storms, fog: s.fog, shift: s.shift, nextShift: s.nextShift, nextStorm: s.nextStorm, nextFog: s.nextFog });
    this.rng.setState(s.rng);
    this.sim.wind = { dir: this.windDir, kt: this.windKt };
    // zone closing flags come back with the sim's own snapshot (runway inspections set them too)
  }

  // -------------------------------------------------------------- drawing

  /** Radar-style storm cells (under the aircraft). */
  drawStorms(ctx) {
    for (const s of this.storms) {
      const R = this.stormRadius(s), hs = this.harmScale(s);
      // the yellow and red cores grow in with the harm (a young cell is only its green edge)
      for (const [k, col] of [[1, 'rgba(70,190,90,0.30)'], [0.68 * hs, 'rgba(240,210,60,0.38)'], [0.38 * hs, 'rgba(230,60,45,0.48)']]) {
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const ang = (i / 28) * TAU;
          const rr = R * k * this.shape(s, ang);
          const x = s.x + Math.cos(ang) * rr, y = s.y + Math.sin(ang) * rr;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      }
      this.drawLightning(ctx, s, R);
    }
  }

  /**
   * Lightning in a storm's core: a flash and a jagged bolt every few seconds. Visual only (its own
   * Math.random, not the sim RNG, and not rewound); `lastFlash` lets the game play the thunder.
   */
  drawLightning(ctx, s, R) {
    const now = performance.now() / 1000;
    if (s.nextFlash == null) s.nextFlash = now + 2 + Math.random() * 6;
    if (now > s.nextFlash) {
      s.flashAt = now;
      // the flash is capped at three a second (photosensitivity); a flash that is refused keeps its bolt
      s.flashOk = flashGate(now * 1000, this.flashLog || (this.flashLog = []));
      s.nextFlash = now + 3 + Math.random() * 7;
      s.bolt = [];
      let x = (Math.random() - 0.5) * R * 0.5, y = (Math.random() - 0.5) * R * 0.5;
      for (let i = 0; i < 7; i++) {
        s.bolt.push([x, y]);
        x += (Math.random() - 0.5) * R * 0.22;
        y += (Math.random() - 0.5) * R * 0.22;
      }
      this.lastFlash = { at: now, dist: Math.random() };
    }
    const age = now - (s.flashAt || -9);
    if (age > 0.35) return;
    const k = age < 0.06 ? 1 : age < 0.12 ? 0.3 : age < 0.18 ? 0.8 : Math.max(0, 1 - (age - 0.18) / 0.17);
    ctx.save();
    // the core's flash: capped (flashGate) and dropped under reduced motion, the thunder stays
    if (s.flashOk && !reducedMotion()) {
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#f4f6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, R * 0.75, 0, TAU);
      ctx.fill();
    }
    // the bolt flickers over two frames, dark between them
    if (age >= 0.07 && age < 0.11) {
      ctx.restore();
      return;
    }
    ctx.globalAlpha = 0.9 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.bolt.forEach(([bx, by], i) => (i ? ctx.lineTo(s.x + bx, s.y + by) : ctx.moveTo(s.x + bx, s.y + by)));
    ctx.stroke();
    ctx.restore();
  }

  /** Fog banks and radar sweep (over everything), plus blips for hidden aircraft. */
  drawFog(ctx, t) {
    if (!this.fog.length) return;
    for (const f of this.fog) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(232,236,238,${0.88 * f.a})`);
      g.addColorStop(0.65, `rgba(225,230,233,${0.62 * f.a})`);
      g.addColorStop(1, 'rgba(225,230,233,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    }
    const sim = this.sim;
    const cx = sim.W / 2, cy = sim.H / 2;
    // radar sweep line
    ctx.save();
    ctx.strokeStyle = 'rgba(80,220,120,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(this.sweepAng) * sim.W, cy + Math.sin(this.sweepAng) * sim.W);
    ctx.stroke();
    ctx.restore();
    for (const a of sim.aircraft) {
      if (!a.blip) continue;
      const age = clamp(this.sweepT / SWEEP, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(60,230,110,${0.95 - age * 0.5})`;
      ctx.strokeStyle = 'rgba(20,60,30,0.8)';
      ctx.lineWidth = 1;
      ctx.fillRect(a.blip.x - 3.5, a.blip.y - 3.5, 7, 7);
      ctx.strokeRect(a.blip.x - 3.5, a.blip.y - 3.5, 7, 7);
      ctx.strokeStyle = `rgba(60,230,110,${0.6 * (1 - age)})`;
      ctx.beginPath();
      ctx.arc(a.blip.x, a.blip.y, 6 + age * 14, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Aircraft inside a storm flash a warning ring. */
  drawStormWarnings(ctx, t) {
    for (const a of this.sim.aircraft) {
      if (a.state !== 'fly' || !(a.stormT > 0.3)) continue;
      const k = clamp(a.stormT / 4, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(255,200,60,${0.5 + 0.5 * Math.sin(t * 18)})`;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, CLASSES[a.cls].size + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Beside the main runway, near the middle, but never on top of another runway. */
  windsockSpot() {
    const rws = this.sim.world.runways;
    const z = rws.reduce((a, b) => (b && (!a || b.lengthM > a.lengthM) ? b : a), null);
    if (!z) return null;
    const onRunway = (x, y) => rws.some((r) => {
      const dx = x - r.cx, dy = y - r.cy;
      const c = Math.cos(r.angle), s = Math.sin(r.angle);
      return Math.abs(dx * c + dy * s) < r.length / 2 + 8 && Math.abs(-dx * s + dy * c) < r.width / 2 + 8;
    });
    for (const along of [0, -0.2, 0.2, -0.35, 0.35]) {
      for (const side of [1, -1]) {
        for (const off of [16, 26]) {
          const x = z.cx + Math.cos(z.angle) * z.length * along - Math.sin(z.angle) * (z.width / 2 + off) * side;
          const y = z.cy + Math.sin(z.angle) * z.length * along + Math.cos(z.angle) * (z.width / 2 + off) * side;
          if (!onRunway(x, y)) return [x, y];
        }
      }
    }
    return [z.cx - Math.sin(z.angle) * (z.width / 2 + 16), z.cy + Math.cos(z.angle) * (z.width / 2 + 16)];
  }

  /** Animated windsock beside the main runway. */
  drawWindsock(ctx, t) {
    if (!this.sockAt) this.sockAt = this.windsockSpot();
    if (!this.sockAt) return;
    const [x, y] = this.sockAt;
    const kt = this.gustNow();
    const stiff = clamp(kt / 15, 0.15, 1);
    const ang = bearingToCanvas(this.windDir + 180);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.rotate(ang + Math.sin(t * 1.3) * 0.25 * (1.1 - stiff));
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#f4f1e6' : '#ee7a2a';
      const w = 4.5 - i * 0.6;
      const droop = (1 - stiff) * i * 1.4;
      ctx.fillRect(2 + i * 4 * (0.6 + stiff * 0.4), -w / 2 + droop + Math.sin(t * 6 + i) * 0.5, 4, w);
    }
    ctx.restore();
  }

  /** HUD wind arrow (screen space, bottom-left), `u` the HUD scale. Returns the right edge of the block in CSS px. */
  drawHud(ctx, r, u) {
    const ins = r.insets;
    // its disc sits on the HUD's margin (render.js HUD_EDGE): the left edge at the score's, the bottom as it always was
    const x = r.hudMetrics().m + 20 * u + ins.l, y = r.cssH - 34 * u - ins.b;
    const R = 20 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(15,25,30,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,235,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,250,235,0.75)';
    ctx.font = `700 ${Math.max(8, 7 * u)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', x, y - R + 6 * u);
    const ang = bearingToCanvas(this.windDir + 180);
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffe39a';
    ctx.beginPath();
    ctx.moveTo(R * 0.7, 0);
    ctx.lineTo(-R * 0.2, -R * 0.32);
    ctx.lineTo(-R * 0.05, 0);
    ctx.lineTo(-R * 0.2, R * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-R * 0.65, -1.2 * u, R * 0.6, 2.4 * u);
    ctx.restore();
    const kt = Math.round(this.gustNow());
    const label = `${String(Math.round(this.windDir)).padStart(3, '0')}° ${kt} kt${this.gustKt ? ` G${this.gustKt}` : ''}`;
    const lx = x + R + 6 * u;
    ctx.font = `700 ${Math.max(10.5, 10 * u)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,30,35,0.6)';
    ctx.strokeText(label, lx, y);
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(label, lx, y);
    // measured as if the wind were two digits and every digit a 0, so the edge holds still while the gusts tick
    const steady = label.replace(/\d+(?= kt)/, (n) => n.padStart(2, '0')).replace(/\d/g, '0');
    // the wind alone: the source is not a word the player needs (requirements item 5)
    const w = Math.max(ctx.measureText(label).width, ctx.measureText(steady).width);
    return lx + w;
  }
}
