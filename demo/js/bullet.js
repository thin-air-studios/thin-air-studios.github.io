// Bullet mode: a predicted collision slows time, drains colour, draws a red line between the pair and pulses the phone like
// a heartbeat. The prediction is the ghost run (ghost.js), 4 times a second in real time. On Hard and Chaos a busy runway
// at touchdown, or a light plane about to fly into a lethal wake, is predicted the same way. The one-per-game 5-second rewind
// is rewind.js, kept here as a handle.
import { lerp, damp, TAU } from './util.js?v=2f66fd5f';
import { CLASSES, TUNING } from './config.js?v=2f66fd5f';
import { GhostRunner } from './ghost.js?v=2f66fd5f';
import { RewindBuffer } from './rewind.js?v=2f66fd5f';

const SLOW = 0.25; // time scale while a conflict is predicted
export const CADENCE = 0.25; // s of real time between ghost runs (4 Hz)
export const SLOW_CADENCE = 0.5; // the cadence after runs that cost too much on this phone (2 Hz)
export const BUDGET_MS = 8; // a run longer than this is slow (gameplay 3.4, budget rule)
// The cadence changes with hysteresis, so one slow run (a garbage collection, a busy frame) does not latch it: it drops after
// SLOW_RUNS slow runs in a row, and comes back after FAST_RUNS runs in a row under BUDGET_MS / 2.
export const SLOW_RUNS = 3;
export const FAST_RUNS = 8;
// s the heartbeat stays on after the last positive run (no flicker when the player redraws). It must be longer than
// SLOW_CADENCE, so the heartbeat does not drop out between two runs at 2 Hz.
export const HOLD = 0.6;
const HORIZON = 3; // s of look-ahead, for the lines' fade

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Bullet {
  /**
   * @param o.ghost   the look-ahead (GhostRunner); the default is the sim's own
   * @param o.rewind  the game's rewind buffer (rewind.js), so the game and the bullet share one history
   */
  constructor({ sim, enabled = true, onHeartbeat = null, ghost = null, rewind = null }) {
    this.sim = sim;
    this.enabled = enabled;
    this.onHeartbeat = onHeartbeat;
    this.ghost = ghost || new GhostRunner(sim, { busyRunwayLoses: sim.rules ? sim.rules.busyRunwayLoses : true });
    this.rewindBuf = rewind || new RewindBuffer();
    this.every = CADENCE;
    this.clock = 0; // real seconds until the next ghost run
    this.hit = null; // the last positive run: { t, reason, a, b, zone }
    this.holdLeft = 0; // real seconds the last positive run still counts
    this.warned = new Set(); // aircraft ids whose busy runway has been announced (one event each)
    this.warnedZone = null;
    this.scale = 1;
    this.desat = 0;
    this.pairs = [];
    this.beatT = 0;
    this.steps = 0; // sim steps seen by record(), the step index of each snapshot
    this.overRuns = 0; // slow runs in a row (timeCadence)
    this.underRuns = 0; // fast runs in a row
  }

  /** The rewind history (rewind.js), as the tests and the tape read it. */
  get buffer() {
    return this.rewindBuf.buffer;
  }

  /** Called every frame with real dt; returns the time scale to apply. */
  update(dt) {
    const sim = this.sim;
    if (!this.enabled || sim.over) {
      this.pairs = [];
      this.hit = null;
      this.holdLeft = 0;
      this.setWarnedZone(null);
      this.scale = lerp(this.scale, 1, damp(6, dt));
      this.desat = lerp(this.desat, 0, damp(6, dt));
      return this.scale;
    }
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = this.every;
      const t0 = now();
      const hit = this.ghost.predict();
      this.timeCadence(now() - t0);
      if (hit) {
        this.hit = hit;
        this.holdLeft = HOLD;
        // a busy runway is announced once per arrival (the rising edge), from the ghost run, on Hard and Chaos only
        if (hit.reason === 'runway' && hit.a && !this.warned.has(hit.a.id)) {
          this.warned.add(hit.a.id);
          sim.events.push({ kind: 'runwayBusy', aircraft: hit.a, zone: hit.zone, by: hit.b, predicted: true });
        }
      }
    }
    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) this.hit = null;
    }
    this.pairs = this.hit ? [{ a: this.hit.a, b: this.hit.b, t: this.hit.t }] : [];
    this.setWarnedZone(this.hit && this.hit.reason === 'runway' ? this.hit.zone : null);
    const active = this.pairs.length > 0;
    this.scale = lerp(this.scale, active ? SLOW : 1, damp(active ? 9 : 4, dt));
    this.desat = lerp(this.desat, active ? 1 : 0, damp(6, dt));
    if (active) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 0.85;
        if (this.onHeartbeat) this.onHeartbeat();
      }
    } else this.beatT = 0;
    return this.scale;
  }

  /**
   * The cadence follows the time a ghost run took, with hysteresis: SLOW_RUNS slow runs in a row drop it to SLOW_CADENCE,
   * FAST_RUNS fast runs in a row (under BUDGET_MS / 2) restore CADENCE, and a run in between clears both counts.
   */
  timeCadence(ms) {
    if (ms > BUDGET_MS) {
      this.underRuns = 0;
      if (++this.overRuns >= SLOW_RUNS) this.every = SLOW_CADENCE;
    } else if (ms < BUDGET_MS / 2) {
      this.overRuns = 0;
      if (++this.underRuns >= FAST_RUNS) this.every = CADENCE;
    } else {
      this.overRuns = 0;
      this.underRuns = 0;
    }
  }

  /** The runway a busy-runway prediction is about is drawn red while the prediction holds. */
  setWarnedZone(z) {
    if (this.warnedZone && this.warnedZone !== z) this.warnedZone.busyWarn = false;
    if (z) z.busyWarn = true;
    this.warnedZone = z || null;
  }

  /** Called after each sim step to keep the rolling history (rewind.js, every 0.25 s of sim time). */
  record() {
    if (!this.enabled) return;
    this.steps++;
    this.rewindBuf.record(this.sim, this.steps);
  }

  canRewind() {
    return this.enabled && this.rewindBuf.canRewind();
  }

  /** Jump back ~5 seconds. Returns true if it happened. */
  rewind() {
    if (!this.canRewind()) return false;
    if (this.rewindBuf.rewind(this.sim) == null) return false;
    this.afterRewind();
    return true;
  }

  /** After the sim is put back (midgame.applyRewind): the heartbeat starts again from the restored state. */
  afterRewind() {
    this.pairs = [];
    this.hit = null;
    this.holdLeft = 0;
    this.warned.clear();
    this.setWarnedZone(null);
  }

  drawLines(ctx, t) {
    if (!this.pairs.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const { a, b, t: tt } of this.pairs) {
      if (!a) continue;
      const k = Math.max(0, 1 - tt / HORIZON);
      ctx.strokeStyle = `rgba(255,40,40,${0.55 + 0.4 * k})`;
      ctx.lineWidth = 2 + k * 2;
      if (!b) {
        // one plane only (a lethal wake whose heavy has left the sky): a ring on it, and no line to a partner
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(a.x, a.y, CLASSES[a.cls].radius + TUNING.warnExtra / 2, 0, TAU);
        ctx.stroke();
        continue;
      }
      ctx.setLineDash([8, 5]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
