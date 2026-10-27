// Bullet mode's one 5-second rewind, moved out of bullet.js (bullet.js:48-72) so the server's replay runner keeps the
// same history (T3). Pure: no DOM and no clock. The buffer is fed by sim steps, every EVERY seconds of sim time.

export const KEEP = 5.5;        // seconds of history kept
export const EVERY = 0.25;      // snapshot interval (sim seconds)
export const BACK = 5;          // a rewind goes back this far
export const MIN_HISTORY = 4.5; // a rewind needs at least this much history

export class RewindBuffer {
  constructor() {
    this.buffer = []; // { t, step, snap }: sim time, the step index, and sim.snapshot()
    this.now = 0; // the sim time at the last record() call
    this.lastT = 0; // the sim time of the last snapshot
    this.used = false; // the one rewind is spent
  }

  /** Takes a snapshot of sim at stepIndex when EVERY seconds of sim time have passed since the last one. */
  record(sim, stepIndex) {
    this.now = sim.time;
    if (this.used) return;
    if (sim.time - this.lastT < EVERY - 1e-9) return;
    this.lastT = sim.time;
    this.buffer.push({ t: sim.time, step: stepIndex, snap: sim.snapshot() });
    while (this.buffer.length && sim.time - this.buffer[0].t > KEEP) this.buffer.shift();
  }

  /** True when the one rewind is unused and the buffer holds MIN_HISTORY seconds. */
  canRewind() {
    return !this.used && this.buffer.length > 0 && this.now - this.buffer[0].t >= MIN_HISTORY;
  }

  /** Restores sim to the snapshot about BACK seconds back. Returns the step index it restored to, or null. */
  rewind(sim) {
    if (!this.canRewind()) return null;
    const target = sim.time - BACK;
    let pick = this.buffer[0];
    for (const b of this.buffer) if (b.t <= target) pick = b;
    sim.restore(pick.snap);
    this.used = true;
    this.buffer.length = 0;
    return pick.step;
  }
}
