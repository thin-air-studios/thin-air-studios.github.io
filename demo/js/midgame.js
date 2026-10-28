// Changes made during a game: the level, Departures, the Real planes only switch and the simulated-planes override. The pause
// UI and Settings only call the setX functions; each applyX is the sim side that the replay runner (simdriver.js) calls too,
// so a recorded change plays back the same (gameplay 3.5 to 3.7, section 6.6). The applyX functions record their input
// (replay.js Recorder) when the game has one; the replay runner has none.
//
// The game object g (main.js for the live game, simdriver.js for a replay) holds: sim, world, director, weather, hazards,
// ops, departures, realOnly, daily, seed, firstAfter, settings (the saved settings: departures and difficulty), ranking
// (live only), rec (live only), and steps (the fixed steps run so far).
import { Departures } from './departures.js?v=2f66fd5f';
import { purgeSimulated } from './sim.js?v=2f66fd5f';
import { noteRanking } from './ranking.js?v=2f66fd5f';
import { startSimOverride, clearSimOverride } from './modes.js?v=2f66fd5f';

/** The pause picker's levels: a game can step down to these, and up to Normal from Beginner or Easy, never to Hard or Chaos. */
export const PICKER_LEVELS = ['beginner', 'easy', 'normal'];

/** Ops inspections per level (main.js newGame had this map): none on Beginner and Easy. */
export const OPS_RATE = { beginner: 0, easy: 0, normal: 1, hard: 1.4, chaos: 2 };
/** Departures' rate per level (the Departures interval is 34 s / rate). */
export const DEP_RATE = { easy: 0.7, normal: 1, hard: 1.3, chaos: 1.8 };

/** Can the level be changed in this game? The daily has no picker; Hard and Chaos have none either (the source and target). */
export function canPickLevel(g, diff) {
  return !g.daily && PICKER_LEVELS.includes(g.director.diff) && PICKER_LEVELS.includes(diff);
}

/** The Departures switch can change in this game: not in the daily, not on Beginner, not with Real planes only. */
export function canToggleDepartures(g) {
  return !g.daily && g.director.diff !== 'beginner' && !g.realOnly;
}

/**
 * A departures object made in the middle of a game (or at the start): the same rate, seed and first-game hold as a new game
 * (firstAfter from the setup). It pushes itself into sim.extras, so a rewind restores it too.
 */
export function makeDepartures(g, allowSpawns) {
  const rate = DEP_RATE[g.director.diff] || 1;
  const d = new Departures({ sim: g.sim, world: g.world, director: g.director, rate, seed: g.seed });
  d.allowSpawns = allowSpawns;
  if (g.firstAfter) d.firstAfter = g.firstAfter;
  return d;
}

/**
 * Brings the sim's Departures in line with the saved switch and the level: built when they are wanted, spawns allowed when
 * the switch is on and the game is not Beginner or Real planes only, and wound down (silently) when spawns stop. Idempotent.
 * The daily always builds and allows them (O27): it is the same for everyone.
 */
export function syncDepartures(g, settings = g.settings) {
  const lvl = g.director.diff, rw = !!g.realOnly, dep = !!settings.departures;
  const build = g.daily ? true : (dep || rw) && (lvl !== 'beginner' || rw);
  const allow = g.daily ? true : dep && lvl !== 'beginner' && !rw;
  if (build && !g.departures) g.departures = makeDepartures(g, allow);
  if (g.departures) {
    const was = g.departures.allowSpawns;
    g.departures.allowSpawns = allow;
    if (was && !allow) g.departures.windDown();
  }
  return g.departures;
}

/**
 * The level changes (the pause picker, or a replayed input). Sets the director's level, the Ops rate, the weather's severity
 * and calm skies, the Departures rate and the spawn rules. Applies from the next step. Returns false when refused.
 */
export function applyLevel(g, diff) {
  const from = g.director.diff;
  if (from === diff || !canPickLevel(g, diff)) return false;
  if (g.rec) g.rec.input(g.steps, 'lvl', diff);
  g.director.setDifficulty(diff);
  if (g.ops) g.ops.setRate(OPS_RATE[diff] ?? 1);
  if (g.weather) {
    g.weather.setSeverity(g.director.weatherSeverity());
    g.weather.setCalm(diff === 'beginner');
  }
  if (g.departures) g.departures.setRate(DEP_RATE[diff] || 1);
  syncDepartures(g, g.settings);
  return true;
}

/**
 * The pause picker's level change (live only): writes the saved level, notes the ranking reason, then applies the level.
 * Returns false when refused (Hard, Chaos, the daily, or the same level).
 */
export function setLevelMidGame(g, save, diff) {
  if (g.director.diff === diff || !canPickLevel(g, diff)) return false;
  save.settings.difficulty = diff;
  if (g.ranking) noteRanking(g.ranking, 'levelChanged', diff);
  return applyLevel(g, diff);
}

/** The Departures switch as the game applies it (the live game and the replay). */
export function applyDepartures(g, on) {
  const want = !!on;
  if (g.rec) g.rec.input(g.steps, 'dep', want);
  g.settings.departures = want;
  syncDepartures(g, g.settings);
}

/**
 * The pause card's Departures switch (live only): saves the switch, notes the ranking (either direction), then applies it.
 * Returns false when it cannot change here (Beginner, Real planes only, the daily) or it is already that.
 */
export function setDeparturesMidGame(g, save, on) {
  const want = !!on;
  if (!canToggleDepartures(g) || !!save.settings.departures === want) return false;
  save.settings.departures = want;
  if (g.ranking) noteRanking(g.ranking, 'departuresChanged', null);
  applyDepartures(g, want);
  return true;
}

/**
 * The holding fixes are shown from now on (the tip: the sky first got busy after the tutorial, main.js updateHint). Recorded,
 * so the replay shows them from the same step; before it the sim does not take a path onto a fix (sim.fixHit). Returns true
 * when they were hidden and are now shown.
 */
export function revealFixes(g) {
  if (!g.sim.fixesHidden) return false;
  if (g.rec) g.rec.input(g.steps, 'fixes');
  g.sim.fixesHidden = false;
  return true;
}

/**
 * The Real planes only switch as the game applies it (the live game and the replay): the director's real-only state, the
 * departures, and on: the simulated planes go (purgeSimulated), a real flight is never removed.
 */
export function applyRealOnly(g, on) {
  const want = !!on;
  if (g.rec) g.rec.input(g.steps, 'rpo', want);
  g.realOnly = want;
  g.director.setRealOnly(want);
  syncDepartures(g, g.settings);
  if (want) purgeSimulated(g.sim);
}

/**
 * The Real planes only switch (live only): saved, the override ends (flipping the switch clears it), the ranking notes it
 * when it goes on, and the game follows. Not in the daily (all simulated, whatever the setting says).
 */
export function setRealPlanesMidGame(g, save, on) {
  if (g.daily) return false;
  const want = !!on;
  save.settings.realPlanesOnly = want;
  Object.assign(save.settings, clearSimOverride(save.settings));
  if (want && g.ranking) noteRanking(g.ranking, 'realOnly', null);
  applyRealOnly(g, want);
  return true;
}

/**
 * Simulated planes allowed until 06:00 local (on), or back to real only now (off). Saves the override only: the game in
 * progress keeps its own rules, and the change applies from the next game. g is optional, for the replay's record of it.
 */
export function setSimOverride(save, on, nowMs, g = null) {
  if (g && g.rec) g.rec.input(g.steps, 'ovr', !!on);
  Object.assign(save.settings, on ? startSimOverride(save.settings, nowMs) : clearSimOverride(save.settings));
  return save.settings.simAllowedUntil;
}

/**
 * A rewind (the one per game): the sim goes back about 5 s. Then the purge that real-only needs, and the departures the saved
 * switch says (rewinds undo the sim, not the settings: Departures' allowSpawns is not in its snapshot). Returns true if it
 * happened. The live game's bullet checks that the rewind is allowed; the replay only replays a rewind that happened.
 */
export function applyRewind(g) {
  if (!g.rewind || g.rewind.rewind(g.sim) == null) return false;
  if (g.rec) g.rec.input(g.steps, 'rewind');
  if (g.realOnly) purgeSimulated(g.sim);
  syncDepartures(g, g.settings);
  return true;
}
