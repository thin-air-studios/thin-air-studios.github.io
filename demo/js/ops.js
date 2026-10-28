// Airport operations: now and then a runway closes for an inspection (bird activity, debris) while
// an airport ops truck drives its length, then reopens. The player re-routes around it.
import { TAU, makeRng } from './util.js?v=2f66fd5f';

const WARN = 10; // s of warning before it closes
const CLOSED = 26; // s closed
const REASONS = ['bird activity', 'debris reported on the runway', 'a runway inspection'];

export class Ops {
  /** rate: inspections per ~3 minutes (0 = never). */
  constructor({ sim, weather = null, seed = 1, rate = 1 }) {
    this.sim = sim;
    this.weather = weather;
    this.rng = makeRng(seed ^ 0x0b5);
    this.rate = rate;
    this.next = rate > 0 ? (100 + this.rng() * 80) / rate : Infinity;
    this.cur = null; // { z, phase: 'warn' | 'closed', t, reason, extra }
    sim.ops = this;
    sim.extras = sim.extras || [];
    sim.extras.push(this);
  }

  /**
   * The rate changes mid-game (midgame.js applyLevel). The scheduled inspection keeps its time. From no inspections (rate 0:
   * Beginner, Easy) the first one is drawn now, with the usual wait.
   */
  setRate(rate) {
    const was = this.rate;
    this.rate = rate;
    if (!(was > 0) && rate > 0 && this.next === Infinity) this.next = (100 + this.rng() * 80) / rate;
  }

  /** Is this runway in an inspection's warning countdown? */
  warning(z) {
    return !!(this.cur && this.cur.phase === 'warn' && this.cur.id === z.id);
  }

  /** Clear our closing mark, unless a wind shift has the runway closing too. */
  unmark(z) {
    z.closing = !!(this.weather && this.weather.shift && this.weather.shift.ids.includes(z.id));
  }

  /** Someone landing on it, or lined up / rolling. */
  busy(z) {
    return this.sim.aircraft.some((o) => o.target === z.id && (o.state === 'landing' || o.state === 'lineup' || o.state === 'takeoff'));
  }

  /** A runway that can close without stranding anyone: every airborne arrival keeps somewhere to land. */
  pick() {
    const sim = this.sim;
    if (this.weather && this.weather.shift) return null; // one runway change at a time
    const runways = sim.zones.filter((z) => z.kind === 'runway' && !z.closed && !z.closing);
    if (runways.length < 2) return null;
    const ok = runways.filter((z) => this.safeToClose(z));
    return ok.length ? ok[Math.floor(this.rng() * ok.length)] : null;
  }

  /** Every class keeps a runway, and every arrival in the air (hydraulics included) somewhere to land. */
  safeToClose(z) {
    const sim = this.sim;
    if (sim.aircraft.some((a) => a.state === 'fly' && a.emergency && a.emergency.type === 'engine')) return false;
    // item 12: a runway an engine-out or low-fuel plane can still land on waits until that plane is down
    if (sim.neededByEmergency(z)) return false;
    const others = sim.zones.filter((o) => o !== z && !o.closed && !o.closing);
    if (!z.allow.every((c) => others.some((o) => o.kind === 'runway' && o.allow.includes(c)))) return false;
    return sim.aircraft.filter((a) => a.state === 'fly' && !a.departure).every((a) => !sim.usable(a, z) || others.some((o) => sim.usable(a, o)));
  }

  step(dt) {
    const sim = this.sim;
    if (sim.over || sim.demo) return;
    const c = this.cur;
    if (!c) {
      this.next -= dt;
      if (this.next > 0) return;
      const z = this.pick();
      if (!z) {
        this.next = 25;
        return;
      }
      z.closing = true;
      this.cur = { id: z.id, phase: 'warn', t: WARN, reason: REASONS[Math.floor(this.rng() * REASONS.length)], extra: 0 };
      sim.events.push({ kind: 'rwyClosing', zone: z, reason: this.cur.reason, secs: WARN });
      return;
    }
    const z = sim.zone(c.id);
    c.t -= dt;
    if (c.phase === 'warn' && c.t <= 0) {
      // let whoever is on it finish first
      if (this.busy(z) && c.extra < 12) {
        c.extra += dt;
        return;
      }
      // someone declared an emergency during the warning and needs this runway: call it off
      if (!this.safeToClose(z)) {
        this.unmark(z);
        this.cur = null;
        this.next = 40;
        sim.events.push({ kind: 'rwyOpen', zone: z, cancelled: true });
        return;
      }
      this.unmark(z);
      z.closed = true;
      sim.unlockZone(z);
      if (sim.departures) sim.departures.rerouteFor([z.id]);
      c.phase = 'closed';
      c.t = CLOSED;
      sim.events.push({ kind: 'rwyClosed', zone: z, reason: c.reason });
    } else if (c.phase === 'closed' && c.t <= 0) {
      z.closed = false;
      this.cur = null;
      this.next = (130 + this.rng() * 110) / Math.max(0.2, this.rate);
      sim.events.push({ kind: 'rwyOpen', zone: z });
    }
  }

  /** The banner while it's happening. */
  banner() {
    const c = this.cur;
    if (!c) return '';
    const z = this.sim.zone(c.id);
    const s = Math.max(0, Math.ceil(c.t));
    return c.phase === 'warn' ? `Runway ${z.activeIdent} closing in 0:${String(s).padStart(2, '0')}: ${c.reason}` : `Runway ${z.activeIdent} closed: ${c.reason} · 0:${String(s).padStart(2, '0')}`;
  }

  /** The ops truck: out along the centreline and back while the runway is closed. */
  draw(ctx, t) {
    const c = this.cur;
    if (!c || c.phase !== 'closed') return;
    const z = this.sim.zone(c.id);
    const k = 1 - c.t / CLOSED; // 0..1 through the closure
    const out = k < 0.5;
    const along = (out ? k * 2 : 2 - k * 2) * 0.86 + 0.07; // stay off the very ends
    const x = z.thx + z.dirx * z.length * along - z.diry * z.width * 0.18;
    const y = z.thy + z.diry * z.length * along + z.dirx * z.width * 0.18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(z.angle + (out ? 0 : Math.PI));
    ctx.scale(1.6, 1.6);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-2.6, -1, 5.6, 2.6);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-3, -1.3, 5.6, 2.6);
    ctx.fillStyle = '#2b4458';
    ctx.fillRect(0.6, -1.1, 1.4, 2.2);
    const on = Math.sin(t * 12) > 0;
    if (on) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath();
      ctx.arc(-0.6, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = on ? '#ffd23f' : '#a8742a';
    ctx.fillRect(-1, -0.5, 1, 1);
    ctx.restore();
  }

  snapshot() {
    return { next: this.next, cur: this.cur ? { ...this.cur } : null, rng: this.rng.getState() };
  }

  restore(s) {
    this.next = s.next;
    this.cur = s.cur ? { ...s.cur } : null;
    this.rng.setState(s.rng);
  }
}
