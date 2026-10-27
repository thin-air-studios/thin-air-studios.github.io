// Real planes only, made simple: the one check that offers simulated planes back ("Things too slow?"), and the run of Keep
// answers. Pure: no DOM, no clock. main.js passes the game time and the count of real planes in the air, so the rules are
// tested with a fake clock (tests/skysky.test.mjs). The words for the HUD and the cards are feedstate.js (mixLine, bannerLine,
// feedStatus). Not in the sim's bundle (server/sims): the simulation never reads it.

/** The first 45 seconds of a game: no sheet (the real sky is still filling). */
export const WARMUP_S = 45;
/** The sky is dead (no real plane in the air) for this long (game time) inside the last WINDOW_S before the sheet opens. */
export const HOLD_S = 20;
export const WINDOW_S = 30;
/** Keep answered in this many real-only games in a row stops the sheet until the switch is turned off and on. */
export const KEEPS_TO_QUIET = 3;

/** The sheet's words (main.js fills the screen from these). */
export const SLOW_SHEET = {
  kicker: 'Tower',
  title: 'Things too slow?',
  body: 'Real planes are slow to arrive for this level. Add simulated planes to fill the gaps?',
  note: 'This turns off Real planes only, here and in later games.',
  add: 'Add simulated planes',
  keep: 'Keep real planes only',
};

/** The switch's line flashes for four seconds after it is changed in play (the pause card's and the Live feed card's). */
export const RPO_FLASH_MS = 4000;
export const rpoFlash = (on) => (on ? 'Simulated planes have left the sky.' : 'Simulated planes are back in the sky.');

/** The sheet's state for one game: the samples of the sky, and whether the sheet has asked in this game (once per game). */
export function newSlowSky() {
  return { h: [], asked: false };
}

/** Drops the samples (the feed is not working, so the sky is not judged). The hold starts again from the feed's return. */
export function resetSlowSky(st) {
  st.h = [];
}

/**
 * One sample of the sky: whether any real plane is in the air at game time t (about four a second in play). The sky is short
 * when there is none (a dead sky): a quiet sky with a plane or two still flying is not one. A rewind takes game time back, so
 * the samples after it go; the rewound sim makes them again as it plays on.
 * @param inAir  the real planes in the air now (sim.arrivalsInAir)
 */
export function noteSlowSky(st, t, inAir) {
  while (st.h.length && st.h[st.h.length - 1].t >= t) st.h.pop();
  st.h.push({ t, short: inAir < 1 });
  const from = t - WINDOW_S - 1;
  while (st.h.length > 1 && st.h[0].t < from) st.h.shift();
}

/** Seconds of game time in the last WINDOW_S that the sky was dead (each sample's step counts when the sky was dead). */
export function shortSeconds(st, now) {
  const from = now - WINDOW_S;
  let s = 0;
  for (let i = 1; i < st.h.length; i++) {
    if (!st.h[i].short) continue;
    const a = Math.max(from, st.h[i - 1].t), b = Math.min(now, st.h[i].t);
    if (b > a) s += b - a;
  }
  return s;
}

/**
 * Whether the sheet opens now: a real-only level game (not the daily, the demo or a recording), the feed working, at least
 * WARMUP_S of game time, and no real plane in the air for HOLD_S of the last WINDOW_S. Once per game (st.asked is set by the
 * caller when it opens), and never while `quiet` (three Keeps in a row, until the switch is turned off and on).
 */
export function slowSkyDue(st, { t, realOnly, levelGame, feedWorking, quiet = false }) {
  if (st.asked || quiet || !realOnly || !levelGame || !feedWorking) return false;
  if (t < WARMUP_S) return false;
  return shortSeconds(st, t) >= HOLD_S;
}

/** The Keep run on the save: { keeps, quiet }. A Keep adds one; the third in a row makes it quiet. */
export const KEEP_RUN_START = Object.freeze({ keeps: 0, quiet: false });
export function afterKeep(run) {
  const keeps = (run.keeps || 0) + 1;
  return { keeps, quiet: !!run.quiet || keeps >= KEEPS_TO_QUIET };
}
/** A real-only game that ended without a Keep answer breaks the run (quiet, once set, stays until the switch changes). */
export function breakRun(run) {
  return { keeps: 0, quiet: !!run.quiet };
}
