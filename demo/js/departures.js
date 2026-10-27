// Departures: aircraft wait at gates; tap to taxi (along the OSM taxiway network when it connects),
// tap again to take off, then draw them out through a departure gate on the edge of the screen.
import { CLASSES, SPRITE_SCALE, TUNING } from './config.js?v=7227d0de';
import { dist, clamp, turnToward, makeRng, TAU, mapLabel, cssScale, hudScale } from './util.js?v=7227d0de';
import { polygonCentroid, bearingToCanvas } from './geo.js?v=7227d0de';
import { fixName } from './stacks.js?v=7227d0de';
import { takeoffEnd, takeoffGeometry } from './airport.js?v=7227d0de';

const GROUND_SPEED = 13; // units/s while taxiing
const PUSHBACK = 2.4; // seconds the tug takes to push an aircraft off the stand

/** Signed smallest angle from a to b. */
const angleBetween = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const EXIT_R = 36;

/** Undirected graph of taxiway vertices (in world units), merging shared OSM nodes. */
export function buildTaxiGraph(world) {
  const nodes = [];
  const index = new Map();
  const adj = [];
  const key = (x, y) => `${Math.round(x * 20)},${Math.round(y * 20)}`; // ~5 cm in metres -> merge shared nodes
  const nodeFor = (mx, my) => {
    const k = key(mx, my);
    if (index.has(k)) return index.get(k);
    const [x, y] = world.toWorld(mx, my);
    nodes.push({ x, y });
    adj.push([]);
    index.set(k, nodes.length - 1);
    return nodes.length - 1;
  };
  for (const tw of world.L.taxiways) {
    let prev = -1;
    for (const [mx, my] of tw.pts) {
      const n = nodeFor(mx, my);
      if (prev >= 0 && prev !== n) {
        const d = dist(nodes[prev].x, nodes[prev].y, nodes[n].x, nodes[n].y);
        adj[prev].push([n, d, tw.ref]);
        adj[n].push([prev, d, tw.ref]);
      }
      prev = n;
    }
  }
  return { nodes, adj };
}

/** Names of the taxiways along a node path, in order ("A", "K", "K2" ...), for the radio. */
export function taxiwayNames(g, path) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const e = g.adj[path[i - 1]].find(([n]) => n === path[i]);
    const ref = e && e[2];
    if (ref && /^[A-Z]{1,2}\d{0,2}$/i.test(ref) && out[out.length - 1] !== ref) out.push(ref.toUpperCase());
  }
  return out;
}

function nearestNode(g, x, y, maxD = 60) {
  let best = -1, bd = maxD;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = dist(g.nodes[i].x, g.nodes[i].y, x, y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Dijkstra (binary heap) from node a to node b; returns node index list or null. */
export function shortestPath(g, a, b) {
  const n = g.nodes.length;
  const distTo = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = [[0, a]];
  distTo[a] = 0;
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (u === b) break;
    if (d > distTo[u]) continue;
    for (const [v, w] of g.adj[u]) {
      const nd = d + w;
      if (nd < distTo[v]) {
        distTo[v] = nd;
        prev[v] = u;
        push([nd, v]);
      }
    }
  }
  if (!isFinite(distTo[b])) return null;
  const out = [];
  for (let u = b; u !== -1; u = prev[u]) out.push(u);
  return out.reverse();
}

/** Resample a polyline to even spacing. */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = dist(a.x, a.y, b.x, b.y);
    let t = step - carry;
    while (t <= d) {
      out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d });
      t += step;
    }
    carry = d - (t - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Inside a runway's rectangle, with a little margin (where a taxiing aircraft must not stop). */
function onRunway(z, x, y) {
  const dx = x - z.cx, dy = y - z.cy, c = Math.cos(z.angle), sn = Math.sin(z.angle);
  return Math.abs(dx * c + dy * sn) < z.length / 2 + 4 && Math.abs(-dx * sn + dy * c) < z.width / 2 + 3;
}

export class Departures {
  constructor({ sim, world, director, rate = 1, seed = 1 }) {
    this.sim = sim;
    this.world = world;
    this.director = director;
    this.allowSpawns = true; // simulated departures on (main.js newGame: the Departures setting, off on Beginner and real planes only)
    this.rng = makeRng(seed ^ 0xd0d0);
    this.graph = buildTaxiGraph(world);
    this.stands = this.findStands();
    this.interval = 34 / rate;
    this.timer = 14;
    this.exits = [];
    this.departed = 0;
    sim.departures = this;
    this.placeExits();
    sim.extras = sim.extras || [];
    sim.extras.push(this);
  }

  findStands() {
    const w = this.world, L = w.L;
    let pts = L.gates.map((g) => w.toWorld(g.x, g.y));
    if (!pts.length) pts = L.aprons.map((ap) => w.toWorld(...polygonCentroid(ap)));
    if (!pts.length && L.terminals.length) pts = L.terminals.map((t) => w.toWorld(...polygonCentroid(t)));
    if (!pts.length) {
      const z = w.runways[0];
      if (z) pts = [[z.cx - Math.sin(z.angle) * (z.width + 34), z.cy + Math.cos(z.angle) * (z.width + 34)]];
    }
    // thin out crowded gates so stands don't overlap
    const out = [];
    for (const [x, y] of pts) if (x > 20 && y > 20 && x < w.W - 20 && y < w.H - 20 && !out.some((p) => dist(p.x, p.y, x, y) < 40)) out.push({ x, y });
    return out;
  }

  /** Two departure gates on the screen edge: straight out from the main runway, and off to one side. */
  placeExits() {
    const sim = this.sim, W = this.world.W, H = this.world.H;
    const z = this.world.runways.reduce((a, b) => (b.lengthM > (a ? a.lengthM : 0) ? b : a), null);
    const brg = z ? ((z.ends[takeoffEnd(z)].hdg) % 360) : 90;
    // nudge the gate along the edge, nearest first, until it's clear; a narrow airspace (4:3 tablets, foldables)
    // has less edge per degree, so it may look further round
    const nudges = [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60];
    if (W < 900) nudges.push(70, -70, 80, -80, 90, -90);
    // each gate is a departure fix with a name, the same at this airport every game
    const icao = (this.world.L && this.world.L.info && this.world.L.info.icao) || '';
    this.exits.length = 0;
    for (const off of [0, 115]) {
      let best = null;
      for (const nudge of nudges) {
        const [x0, y0, ang] = sim.edgePoint(brg + off + nudge, -18);
        const x = clamp(x0, 24, W - 24), y = clamp(y0, 24, H - 24);
        // clear of the score, the buttons and the wind compass
        const hud = sim.inHudCorner(x, y, EXIT_R);
        // and of the holding stacks' racetracks, so departures don't fly out through a hold
        const onHold = (sim.fixes || []).some((f) => f.loop.some((q) => dist(q.x, q.y, x, y) < EXIT_R + 14));
        // and best not under the airport title (top middle) or the radio ticker (bottom middle)
        const soft = sim.inHudSoft(x, y, EXIT_R);
        // when nothing is clear, the least bad: out from under the HUD first, then off the holds, then the nearest
        const cost = hud * 100 + onHold * 10 + soft * 5 + Math.abs(nudge) * 0.01;
        if (!best || cost < best.cost) best = { x, y, ang, cost };
        if (cost < 5) break; // clear: nothing further round beats the nearest clear spot
      }
      this.exits.push({ kind: 'exit', x: best.x, y: best.y, r: EXIT_R, ang: best.ang, name: fixName(`${icao}:sid${this.exits.length}`) });
    }
  }

  /** Stands nobody is parked at or taxiing to. */
  freeStands() {
    return this.stands.filter((s, i) => !this.sim.aircraft.some((a) =>
      (a.ground && dist(a.x, a.y, s.x, s.y) < 38) || (a.inbound && a.inbound.stand === i)));
  }

  /**
   * A first game holds the simulated departures back until a few landings. It holds nothing where no simulated departure can
   * come in (Real planes only, or the setting off): a real arrival there taxis to its gate from its first landing.
   */
  holdsFirstGame() {
    return this.allowSpawns && !(this.director && this.director.realOnly) && this.sim.landed < (this.firstAfter || 0);
  }

  /**
   * At touchdown: pick the gate an arrival will taxi to after its rollout (nearest free stand).
   * Returns false when the ground is full, so the arrival simply rolls out and is gone.
   */
  reserveStand(a) {
    if (this.sim.over || this.sim.demo || a.cls === 'heli' || this.groundCount() >= 6) return false;
    if (this.holdsFirstGame()) return false; // a first game: no turnarounds into departures yet
    let best = -1, bd = Infinity;
    for (const s of this.freeStands()) {
      const d = dist(a.x, a.y, s.x, s.y);
      if (d < bd) { bd = d; best = this.stands.indexOf(s); }
    }
    if (best < 0) return false;
    a.inbound = { stand: best };
    return true;
  }

  /** End of the rollout: turn off the runway and taxi to the reserved stand on the real taxiways. */
  taxiIn(a) {
    const stand = a.inbound && this.stands[a.inbound.stand];
    if (!stand) return false;
    a.ground = true;
    a.state = 'taxi';
    a.target = null; // the runway is free again
    a.alpha = 1;
    a.departure = { stage: 'taxiIn', prompt: '' };
    a.path = this.routeTo(a, stand);
    a.pathIdx = 0;
    return true;
  }

  routeTo(a, p) {
    const g = this.graph;
    let pts = null;
    if (g.nodes.length) {
      const s = nearestNode(g, a.x, a.y, 90), e = nearestNode(g, p.x, p.y, 120);
      if (s >= 0 && e >= 0) {
        const path = shortestPath(g, s, e);
        if (path && path.length > 1) pts = [{ x: a.x, y: a.y }, ...path.map((i) => g.nodes[i]), { x: p.x, y: p.y }];
      }
    }
    return resample(pts || [{ x: a.x, y: a.y }, { x: p.x, y: p.y }], 4);
  }

  /**
   * Ground traffic gives way: 0 (stop) when another aircraft on the ground is just ahead,
   * else 1. Head-on pairs let the lower id go first. A proper queue (behind someone holding
   * short of our runway, or waiting for a runway) waits as long as it takes; anything else
   * squeezes past after 4 s rather than gridlock.
   */
  giveWay(a, dt) {
    this.lastDt = dt;
    const fx = Math.cos(a.heading), fy = Math.sin(a.heading);
    let blocker = null;
    for (const o of this.sim.aircraft) {
      // moving traffic, and the queue at the hold-short line; parked aircraft are off the taxiway
      if (o === a || !o.ground || o.alpha < 0.5 || !o.departure || !/^(taxi|taxiIn|pushback|holding)$/.test(o.departure.stage)) continue;
      const dx = o.x - a.x, dy = o.y - a.y;
      const ahead = dx * fx + dy * fy, side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 2 && ahead < 16 && side < 7) {
        blocker = o;
        break;
      }
    }
    if (!blocker && this.runwayAhead(a)) {
      // hold short: an active runway just ahead with traffic about to use it
      a.waitFor = -1;
      a.waitT = 0;
      a.holdT = (a.holdT || 0) + dt;
      return 0;
    }
    if (!(a.holdT > 15)) a.holdT = 0; // a long wait keeps its tighter gap until it's across
    if (!blocker) {
      a.waitT = 0;
      a.waitFor = null;
      return 1;
    }
    a.waitFor = blocker.id;
    a.waitT = (a.waitT || 0) + dt;
    if (blocker.waitFor === a.id && a.id < blocker.id) return 1; // head-on: lower id goes first
    // squeeze past rather than gridlock, and never sit on a runway, queue or not
    if (a.waitT > 4 && (!this.inQueue(a, blocker) || this.world.runways.some((z) => onRunway(z, a.x, a.y)))) return 1;
    return 0;
  }

  /** Is the line ahead of us a real queue: it ends at someone holding short of our runway, or waiting for one? */
  inQueue(a, blocker) {
    const byId = new Map(this.sim.aircraft.map((o) => [o.id, o]));
    const seen = new Set([a.id]);
    for (let o = blocker; o && !seen.has(o.id); o = byId.get(o.waitFor)) {
      seen.add(o.id);
      if (o.waitFor === -1) return true;
      if (o.departure && o.departure.stage === 'holding') return o.departure.runway === (a.departure && a.departure.runway);
      if (o.waitFor == null) return o.departure && /^(taxi|taxiIn|pushback)$/.test(o.departure.stage); // still moving: it'll clear
    }
    return false; // a loop: somebody has to go
  }

  /**
   * Hold short of a runway on the route (one we're not already on) when someone is about to use it,
   * or when the queue on the far side leaves no room to get clear of it.
   */
  runwayAhead(a) {
    const rws = this.world.runways;
    // never stop on a runway surface: keep going until clear of it (and the patience timers start over)
    if (rws.some((z) => onRunway(z, a.x, a.y))) {
      a.roomT = 0;
      a.holdT = 0;
      return false;
    }
    // look along the route, not the nose: at a corner the nose can point at a runway the route never touches
    const p = a.path || [];
    const i0 = a.pathIdx || 0;
    const probe = p.slice(i0, i0 + 4);
    if (!probe.length) return false;
    for (const z of rws) {
      const cross = probe.find((q) => onRunway(z, q.x, q.y));
      if (!cross) continue;
      // how far down the runway (in the direction of use) we'd cross it
      const along = (x, y) => (x - z.thx) * z.dirx + (y - z.thy) * z.diry;
      const sc = along(cross.x, cross.y);
      for (const o of this.sim.aircraft) {
        if (o === a || o.target !== z.id) continue;
        // a landing or departing aircraft that has already rolled past the crossing is no factor
        if ((o.state === 'landing' || o.state === 'takeoff') && along(o.x, o.y) > sc + 12) continue;
        if (o.state === 'landing' || o.state === 'lineup' || o.state === 'takeoff') return true;
        // under ~7 s out; after a long wait the crossing takes a tighter gap, as a real controller would
        if (o.state === 'fly' && !o.exit && (o.path.length - o.pathIdx) * TUNING.pathMinSpacing < CLASSES[o.cls].speed * ((a.holdT || 0) > 15 ? 3.5 : 7)) return true;
      }
      // where the route leaves this runway: is there a stopped aircraft right there?
      let j = i0;
      while (j < p.length && j < i0 + 60 && !onRunway(z, p[j].x, p[j].y)) j++;
      while (j < p.length && j < i0 + 60 && onRunway(z, p[j].x, p[j].y)) j++;
      const beyond = p.slice(j, j + 4);
      if (!beyond.length || (a.roomT || 0) > 6) continue; // waited long enough: go, and squeeze past over there
      const byId = new Map(this.sim.aircraft.map((o) => [o.id, o]));
      const waitsOnUs = (o) => {
        for (let k = 0, x = o; x && k < 12; k++, x = byId.get(x.waitFor)) if (x.waitFor === a.id) return true;
        return false;
      };
      for (const o of this.sim.aircraft) {
        if (o === a || !o.ground || !o.departure) continue;
        const stopped = o.departure.stage === 'holding' || (o.departure.stage !== 'parked' && o.departure.stage !== 'turnaround' && o.waitFor != null);
        if (stopped && !waitsOnUs(o) && beyond.some((q) => Math.hypot(q.x - o.x, q.y - o.y) < 14)) {
          a.roomT = (a.roomT || 0) + this.lastDt;
          return true;
        }
      }
    }
    if (!probe.some((q) => rws.some((z) => onRunway(z, q.x, q.y)))) {
      // no runway on the route ahead any more
      a.roomT = 0;
      a.holdT = 0;
    }
    return false;
  }

  /** The climb-out: down the runway from the threshold and 160 units beyond its far end. */
  climbOut(z) {
    const t = takeoffGeometry(z); // a one-way runway's climb-out is from its take-off end
    return { x0: t.thx, y0: t.thy, x1: t.thx + t.dirx * (t.length + 160), y1: t.thy + t.diry * (t.length + 160) };
  }

  /** Is an airborne aircraft on, or about to fly across, this departure's climb-out (next ~6 s)? */
  climbOutTraffic(a, z) {
    const c = this.climbOut(z);
    const vx = c.x1 - c.x0, vy = c.y1 - c.y0, L2 = vx * vx + vy * vy;
    const near = (x, y) => {
      const k = Math.max(0, Math.min(1, ((x - c.x0) * vx + (y - c.y0) * vy) / L2));
      return Math.hypot(x - (c.x0 + vx * k), y - (c.y0 + vy * k)) < 30;
    };
    for (const o of this.sim.aircraft) {
      if (o === a) continue;
      if (o.state === 'landing' && o.target === z.id) return true; // still rolling out on it
      if (o.state !== 'fly' || o.ground || o.stack || !o.entered) continue;
      const sp = CLASSES[o.cls].speed * (o.speedMul || 1);
      if (o.target != null && o.target >= 0 && !o.departure) {
        if (o.target === z.id && this.landingSoon(o, z)) return true;
        // a locked arrival (to this runway, or to a helipad): its remaining route may still cross the climb-out. A one-way
        // strip's landing approach flies the centreline the take-offs climb along, the other way (Lukla: 06 and 24).
        for (let i = Math.max(0, o.pathIdx); i < o.path.length; i++) if (near(o.path[i].x, o.path[i].y)) return true;
        continue;
      }
      for (let s = 0; s <= 6; s += 1) if (near(o.x + Math.cos(o.heading) * sp * s, o.y + Math.sin(o.heading) * sp * s)) return true;
    }
    return false;
  }

  /** Cleared to land on this very runway and there before a departure could be gone (~10 s)? */
  landingSoon(o, z) {
    if (o.target !== z.id || o.departure) return false;
    if (o.state === 'landing') return true;
    if (o.state !== 'fly') return false;
    return ((o.path.length - o.pathIdx) * TUNING.pathMinSpacing) / (CLASSES[o.cls].speed * (o.speedMul || 1)) < 10;
  }

  /**
   * Turnaround done. Every flight that goes again is a new flight: unlabelled, with no flight number and no
   * mark that it was real (flightId cleared), so it departs like any simulated one and counts and scores as one.
   * A real arrival on Real planes only is done instead: it leaves the sky at its gate (Real planes only has no departures).
   */
  turnaround(a) {
    // the draw the old flight-number renumbering made (never for light or heli, whose callsigns have no airline
    // prefix): kept, so the daily challenge's random sequence is the same as before
    if (a.cls !== 'light' && a.cls !== 'heli') this.rng();
    // real planes only, or no simulated departures allowed (the setting is off: the object was built for the switch):
    // a real arrival leaves at its gate
    if (!this.allowSpawns || (this.director && this.director.realOnly)) {
      a.state = 'done';
      a.label = '';
      a.confirmed = false;
      a.upgraded = false;
      return;
    }
    a.label = '';
    a.callsign = '';
    a.live = false;
    a.confirmed = false; // a new flight is not a confirmed arrival (area.js kindOf)
    a.upgraded = false;
    a.flightId = null;
    a.inbound = null;
    // a new flight: whatever happened on the way in (emergencies, storm damage) is over
    a.emergency = null;
    a.speedMul = 1;
    a.stormT = 0;
    a.stormHit = false;
    a.real = null;
    a.tail = undefined;
    a.state = 'parked';
    a.departure = { stage: 'parked', prompt: 'Tap to taxi', since: this.sim.time };
    this.sim.events.push({ kind: 'depReady', aircraft: a });
  }

  groundCount() {
    return this.sim.aircraft.filter((a) => a.ground).length;
  }

  /** The rate changes mid-game (midgame.js applyLevel): the next spawn follows it. The scheduled one keeps its time. */
  setRate(rate) {
    this.interval = 34 / rate;
  }

  /**
   * Departures switched off mid-game (midgame.js): the parked and holding departures wait for a tap, so they have not been
   * released. They leave silently: no score, no event. A departure already tapped (pushback, taxi, lineup, takeoff) finishes
   * and scores as before, and an arrival in its turnaround leaves at its gate (turnaround, allowSpawns off).
   * Returns how many left.
   */
  windDown() {
    let n = 0;
    for (const a of this.sim.aircraft) {
      const d = a.departure;
      if (!a.ground || !d || (d.stage !== 'parked' && d.stage !== 'holding')) continue;
      a.state = 'done';
      n++;
    }
    return n;
  }

  update(dt) {
    const sim = this.sim;
    if (sim.over || sim.demo) return;
    // a first game teaches landing first: departures start after a few landings
    if (sim.landed < (this.firstAfter || 0)) return;
    this.timer -= dt;
    if (this.timer <= 0 && this.groundCount() < 3 && this.stands.length) {
      this.timer = this.interval * (0.75 + this.rng() * 0.5);
      this.spawn();
    }
  }

  departureClasses() {
    const ok = new Set();
    for (const z of this.world.runways) for (const c of z.allow) ok.add(c);
    return ['light', 'regional', 'narrowbody', 'heavy'].filter((c) => ok.has(c));
  }

  spawn() {
    // real planes only has no departures: its real arrivals leave when they are done (turnaround), and the switch off
    // leaves the setting as it was (allowSpawns, set in main.js newGame from modes.js)
    if (!this.allowSpawns || (this.director && this.director.realOnly)) return null;
    const classes = this.departureClasses();
    if (!classes.length) return null;
    const free = this.freeStands();
    if (!free.length) return null;
    const stand = free[Math.floor(this.rng() * free.length)];
    const cls = this.rng.weighted(classes.map((c) => [c, { light: 1.5, regional: 2, narrowbody: 3, heavy: 1.2 }[c]]));
    // a simulated departure has no callsign: the draw is kept (the daily challenge is seeded), the name is dropped
    if (this.director) this.director.callsignFor(cls);
    // face the nearest taxiway, or the field centre
    const n = nearestNode(this.graph, stand.x, stand.y, 120);
    const fx = n >= 0 ? this.graph.nodes[n].x : this.world.W / 2, fy = n >= 0 ? this.graph.nodes[n].y : this.world.H / 2;
    const heading = Math.atan2(stand.y - fy, stand.x - fx); // parked nose-in, tail to the taxiway
    const a = this.sim.makeAircraft({ cls, callsign: '', x: stand.x, y: stand.y, heading, state: 'parked', entered: true, live: false, flightId: null });
    a.ground = true;
    a.scale = 0.62;
    a.departure = { stage: 'parked', prompt: 'Tap to taxi', since: this.sim.time };
    this.sim.aircraft.push(a);
    this.sim.events.push({ kind: 'depReady', aircraft: a });
    return a;
  }

  /** Best runway for this aircraft right now: allowed, open, nearest hold-short point. */
  pickRunway(a) {
    let best = null, bd = Infinity;
    for (const z of this.world.runways) {
      if (!z.allow.includes(a.cls) || z.closed || z.closing) continue;
      const h = this.holdPoint(z);
      const d = dist(a.x, a.y, h.x, h.y);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  holdPoint(z) {
    const t = takeoffGeometry(z); // the hold short is at the take-off end
    const side = t.width / 2 + 13;
    return { x: t.thx - t.diry * side + t.dirx * 6, y: t.thy + t.dirx * side + t.diry * 6 };
  }

  route(a, z) {
    const hold = this.holdPoint(z);
    const g = this.graph;
    let pts = null;
    if (g.nodes.length) {
      const s = nearestNode(g, a.x, a.y, 90), e = nearestNode(g, hold.x, hold.y, 90);
      if (s >= 0 && e >= 0) {
        const path = shortestPath(g, s, e);
        if (path && path.length > 1) {
          pts = [{ x: a.x, y: a.y }, ...path.map((i) => g.nodes[i]), hold];
          a.taxiVia = taxiwayNames(g, path);
        }
      }
    }
    if (!pts) pts = [{ x: a.x, y: a.y }, hold]; // no usable network: go direct
    return resample(pts, 4);
  }

  /** Taps on ground traffic. Returns true if the tap was used. */
  /** The ground aircraft a tap at (x, y) is for, and how far away it is: { a, d } or null. */
  tapTarget(x, y, reach = 30) {
    let best = null, bd = reach;
    for (const a of this.sim.aircraft) {
      if (!a.ground || !a.departure || !/^(parked|holding|turnaround)$/.test(a.departure.stage)) continue;
      const d = dist(a.x, a.y, x, y);
      if (d < bd) { bd = d; best = a; }
    }
    return best ? { a: best, d: bd } : null;
  }

  tap(x, y, reach = 30) {
    const hit = this.tapTarget(x, y, reach);
    if (!hit) return false;
    const best = hit.a;
    const d = best.departure;
    if (d.stage === 'turnaround') {
      // still boarding: take the tap (no stray zoom) and say when
      this.sim.events.push({ kind: 'notYet', aircraft: best, text: 'Boarding — ready soon' });
      return true;
    }
    if (d.stage === 'parked') {
      const z = this.pickRunway(best);
      if (!z) {
        this.sim.events.push({ kind: 'notYet', aircraft: best, text: 'Wait — the runways are changing' });
        return true;
      }
      d.runway = z.id;
      // the route names the taxiways for the clearance; it's re-planned after pushback
      const p = this.route(best, z);
      const q = p[Math.min(p.length - 1, 6)] || { x: best.x, y: best.y };
      // pushback: a tug walks it back off the stand, swinging the nose round to face the route
      d.stage = 'pushback';
      d.t = 0;
      d.swing = clamp(angleBetween(best.heading, Math.atan2(q.y - best.y, q.x - best.x)), -Math.PI / 2, Math.PI / 2);
      d.back = best.heading; // pushed straight back along the stand line while the nose swings
      d.prompt = '';
      best.state = 'taxi';
      this.sim.events.push({ kind: 'taxi', aircraft: best });
    } else if (d.stage === 'holding') {
      const z = this.sim.zone(d.runway);
      if (z.closed || z.closing) {
        // the end is about to close: another open runway if there is one, else wait for the shift
        const nz = this.pickRunway(best);
        if (nz && nz !== z) {
          d.runway = nz.id;
          best.path = this.route(best, nz);
          best.pathIdx = 0;
          d.stage = 'taxi';
          best.state = 'taxi';
          d.prompt = '';
        }
        return true;
      }
      // the tower never clears a takeoff in front of an arrival about to land on the same runway
      if (this.sim.aircraft.some((o) => this.landingSoon(o, z))) {
        this.sim.events.push({ kind: 'notYet', aircraft: best, text: 'Wait — traffic landing on this runway' });
        return true;
      }
      d.stage = 'lineup';
      d.prompt = '';
      d.t = 0;
      const t = takeoffGeometry(z);
      d.rw = { thx: t.thx, thy: t.thy, dirx: t.dirx, diry: t.diry, angle: t.angle, length: t.length };
      best.state = 'lineup';
      best.target = z.id; // occupies the runway from now until airborne
      this.sim.events.push({ kind: 'cleared', aircraft: best });
    }
    return true;
  }

  /** Called by the sim for ground aircraft each step. */
  step(a, dt) {
    const d = a.departure;
    if (d.stage === 'taxiIn') {
      a.scale += (0.62 - a.scale) * Math.min(1, dt * 2);
      const p = a.path;
      // vacate briskly, then settle to taxi speed
      let move = GROUND_SPEED * (a.pathIdx < 6 ? 1.6 : 1.15) * dt * this.giveWay(a, dt);
      while (move > 0 && a.pathIdx < p.length) {
        const q = p[a.pathIdx];
        const dd = dist(a.x, a.y, q.x, q.y);
        if (dd <= move) {
          a.x = q.x;
          a.y = q.y;
          move -= dd;
          a.pathIdx++;
        } else {
          a.heading = Math.atan2(q.y - a.y, q.x - a.x);
          a.x += Math.cos(a.heading) * move;
          a.y += Math.sin(a.heading) * move;
          move = 0;
        }
      }
      a.visHeading = turnToward(a.visHeading, a.heading, 5 * dt);
      if (a.pathIdx >= p.length) {
        d.stage = 'turnaround';
        d.t = 22 + this.rng() * 20; // unload, refuel, board
        a.state = 'parked';
        a.path = [];
        a.pathIdx = 0;
      }
      return;
    }
    if (d.stage === 'turnaround') {
      a.scale += (0.62 - a.scale) * Math.min(1, dt * 2);
      d.t -= dt;
      if (d.t <= 0) this.turnaround(a);
      return;
    }
    if (d.stage === 'parked') {
      // nowhere to send it while the runways change ends: say so rather than ignore the tap
      if (d.prompt === 'Tap to taxi' || d.prompt === 'Wait — runway change') d.prompt = this.pickRunway(a) ? 'Tap to taxi' : 'Wait — runway change';
      return;
    }
    if (d.stage === 'pushback') {
      d.t += dt;
      const k = Math.min(1, d.t / PUSHBACK);
      // backwards at walking pace, tail swinging so the nose ends up pointing along the route
      const v = 6 * Math.sin(Math.PI * k);
      const back = d.back != null ? d.back : a.heading;
      a.x -= Math.cos(back) * v * dt;
      a.y -= Math.sin(back) * v * dt;
      a.heading += (d.swing * dt) / PUSHBACK;
      a.visHeading = a.heading;
      if (k >= 1) {
        const z = this.sim.zone(d.runway);
        a.path = this.route(a, z);
        a.pathIdx = 0;
        d.stage = 'taxi';
      }
      return;
    }
    if (d.stage === 'taxi') {
      const p = a.path;
      let move = GROUND_SPEED * dt * this.giveWay(a, dt);
      while (move > 0 && a.pathIdx < p.length) {
        const q = p[a.pathIdx];
        const dd = dist(a.x, a.y, q.x, q.y);
        if (dd <= move) {
          a.x = q.x;
          a.y = q.y;
          move -= dd;
          a.pathIdx++;
        } else {
          a.heading = Math.atan2(q.y - a.y, q.x - a.x);
          a.x += Math.cos(a.heading) * move;
          a.y += Math.sin(a.heading) * move;
          move = 0;
        }
      }
      a.visHeading = turnToward(a.visHeading, a.heading, 6 * dt);
      if (a.pathIdx >= p.length) {
        const z = this.sim.zone(d.runway);
        d.stage = 'holding';
        a.state = 'holding';
        a.path = [];
        a.pathIdx = 0;
        d.prompt = 'Tap for takeoff';
        a.heading = z.angle;
        this.sim.events.push({ kind: 'holdShort', aircraft: a });
      }
    } else if (d.stage === 'holding') {
      const z = this.sim.zone(d.runway);
      a.visHeading = turnToward(a.visHeading, z.angle, 3 * dt);
      // anything about to cross the climb-out? (a tap still works: the call is the player's)
      d.traffic = !z.closing && !z.closed && this.climbOutTraffic(a, z);
      d.prompt = z.closing || z.closed ? 'Runway closing — wait or tap to re-route' : d.traffic ? 'Traffic on the climb-out — wait' : 'Tap for takeoff';
    } else if (d.stage === 'lineup') {
      const z = d.rw || this.sim.zone(d.runway);
      d.t += dt;
      const f = Math.min(1, d.t / 1.6);
      a.x += (z.thx + z.dirx * 4 - a.x) * Math.min(1, dt * 4);
      a.y += (z.thy + z.diry * 4 - a.y) * Math.min(1, dt * 4);
      a.heading = z.angle;
      a.visHeading = turnToward(a.visHeading, z.angle, 4 * dt);
      if (f >= 1) {
        d.stage = 'takeoff';
        a.state = 'takeoff';
        d.t = 0;
        d.s = 4;
        this.sim.events.push({ kind: 'takeoffRoll', aircraft: a });
      }
    } else if (d.stage === 'takeoff') {
      const z = d.rw || this.sim.zone(d.runway);
      const def = CLASSES[a.cls];
      d.t += dt;
      const v = Math.min(def.speed, 6 + d.t * def.speed * 0.55);
      d.s += v * dt;
      a.x = z.thx + z.dirx * d.s;
      a.y = z.thy + z.diry * d.s;
      a.heading = a.visHeading = z.angle;
      const liftAt = z.length * 0.6;
      a.scale = 0.62 + 0.38 * Math.max(0, Math.min(1, (d.s - liftAt * 0.7) / (liftAt * 0.5)));
      if (d.s >= liftAt) {
        // airborne: the player now draws it to a departure gate
        a.ground = false;
        a.state = 'fly';
        a.target = null;
        a.entered = true;
        a.scale = 1;
        d.stage = 'airborne';
        d.prompt = '';
        d.exitPrompt = `Drag me to ${this.exits.map((e) => e.name).join(' or ')}`; // shown until it has an exit
        this.sim.events.push({ kind: 'airborne', aircraft: a });
      }
    }
  }

  /** After a wind shift: anything taxiing to / holding at a flipped runway taxis to the new end. */
  rerouteFor(zoneIds) {
    for (const a of this.sim.aircraft) {
      const d = a.departure;
      if (!a.ground || !d || !zoneIds.includes(d.runway)) continue;
      if (d.stage === 'pushback') {
        // still on the tug: just pick the runway again; the route is planned when pushback ends
        d.runway = (this.pickRunway(a) || this.sim.zone(d.runway)).id;
        continue;
      }
      if (!(d.stage === 'taxi' || d.stage === 'holding')) continue;
      const z = this.pickRunway(a) || this.sim.zone(d.runway);
      d.runway = z.id;
      a.path = this.route(a, z);
      a.pathIdx = 0;
      d.stage = 'taxi';
      a.state = 'taxi';
      d.prompt = '';
    }
  }

  snapshot() {
    return { timer: this.timer, departed: this.departed, exits: this.exits.map((e) => ({ ...e })), rng: this.rng.getState ? this.rng.getState() : null };
  }

  restore(s) {
    this.timer = s.timer;
    this.departed = s.departed;
    this.exits = s.exits;
    if (s.rng != null && this.rng.setState) this.rng.setState(s.rng);
  }

  exitHit(x, y, slack = 0) {
    for (const e of this.exits) if (dist(x, y, e.x, e.y) < e.r + slack) return e;
    return null;
  }

  /** Little ground vehicles: baggage train and fuel truck in a turnaround, a tug for pushback. */
  drawVehicles(ctx, a, d, t) {
    const k = a.scale * SPRITE_SCALE * Math.min(1, CLASSES[a.cls].size / 27); // sprite units -> world, hugging small aircraft
    const box = (x, y, w, h, color, ang = 0) => {
      ctx.save();
      ctx.translate(x * k, y * k);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-w / 2 + 0.6, -h / 2 + 0.8, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    };
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.visHeading);
    if (d.stage === 'turnaround') {
      // baggage tug and two carts shuttling at the side, fuel truck under the far wing
      // (positions in sprite units, clear of the wings so they show)
      const s = Math.sin(t * 0.7 + a.id) * 2.5;
      box(10 + s, 10, 4.2, 2.6, '#f2c14e'); // baggage tug
      box(15.5 + s, 10, 4.4, 2.8, '#c9ced2'); // carts
      box(21 + s, 10, 4.4, 2.8, '#c9ced2');
      box(-6, -28, 9, 3.6, '#f6f1e4'); // fuel truck past the wingtip
      box(-11, -28, 2, 3.6, '#2b4458');
      box(17, -9, 6, 3.2, '#e5533d', 0.25); // catering at the front door
    } else if (d.stage === 'parked' || d.stage === 'pushback') {
      box(CLASSES[a.cls].size * 0.95, 0, 5.5, 3, '#f2c14e'); // tug at the nose
    }
    ctx.restore();
  }

  /** The gates appear with the first departures, or at once where no simulated departure can come in (holdsFirstGame). */
  gatesShown() {
    return !this.holdsFirstGame() || this.sim.aircraft.some((a) => a.departure);
  }

  draw(ctx, t) {
    // departure gates on the edge, pulsing while a departure in the air still needs one
    const waiting = this.sim.aircraft.some((a) => a.departure && a.state === 'fly' && !a.exit && !a.ground);
    for (const e of this.gatesShown() ? this.exits : []) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (waiting) {
        const k = (t * 1.2) % 1;
        ctx.strokeStyle = `rgba(160,215,255,${0.7 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 4 + k * 16, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,120,170,0.18)';
      ctx.strokeStyle = 'rgba(160,215,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -t * 10;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.rotate(e.ang);
      ctx.fillStyle = 'rgba(190,230,255,0.95)';
      for (let i = 0; i < 2; i++) {
        const s = -6 + i * 10 + ((t * 12) % 10);
        ctx.beginPath();
        ctx.moveTo(s + 6, 0);
        ctx.lineTo(s - 2, -7);
        ctx.lineTo(s - 6, -7);
        ctx.lineTo(s + 2, 0);
        ctx.lineTo(s - 6, 7);
        ctx.lineTo(s - 2, 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (e.name) {
        // the name on the inside of the gate, towards the airport, a fixed number of screen pixels clear of it
        const d = e.r + (9 * hudScale()) / cssScale(ctx);
        mapLabel(ctx, e.name, e.x - Math.cos(e.ang) * d, e.y - Math.sin(e.ang) * d, 11, 'rgba(200,235,255,0.95)');
      }
    }
    // taxi routes + hold-short bars
    for (const a of this.sim.aircraft) {
      if (!a.ground) continue;
      const d = a.departure;
      this.drawVehicles(ctx, a, d, t);
      if (d.stage === 'taxi' && a.path.length > a.pathIdx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(150,210,255,0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let i = a.pathIdx; i < a.path.length; i++) ctx.lineTo(a.path[i].x, a.path[i].y);
        ctx.stroke();
        ctx.restore();
      }
      if (d.stage === 'holding') {
        // where it will go: the climb-out, red while traffic is about to cross it
        const c = this.climbOut(this.sim.zone(d.runway));
        ctx.save();
        ctx.strokeStyle = d.traffic ? 'rgba(255,110,90,0.85)' : 'rgba(170,220,255,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -t * 18;
        ctx.beginPath();
        ctx.moveTo(c.x0, c.y0);
        ctx.lineTo(c.x1, c.y1);
        ctx.stroke();
        ctx.restore();
      }
      if (d.stage === 'parked' || d.stage === 'holding') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + a.id);
        ctx.save();
        ctx.strokeStyle = `rgba(255,227,154,${0.45 + 0.45 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 15 + pulse * 3, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
