// Santa on Christmas Eve (3.4; design-3.4.md section 3, decision D4). On 24 December, by the phone's clock, one make-believe sleigh
// with reindeer joins the arrivals of every level game and challenge game started that day: a light aircraft, one arrival at
// SANTA_AT_S of game time, with a heads-up SANTA_SOON_S before it. The sleigh is in the sim, so the server re-run plays it too.
//
// The rule is the setup's, not the clock's. sleighFlies(setup) reads only setup.santaDay, which the phone sets once, when a game
// starts on the day (main.js, from santaOn). A replay carries the same setup, so a replay plays the sleigh on any date, and a
// friend's challenge game takes its value from the link (sa=1), never from its own clock. This module reads no clock: santaOn takes
// a local day number that the caller has already read. It is in the sim's closure (director.js imports it), so bundle-sims.mjs
// audits it for clock reads, and tests/santa.test.mjs holds it to that.
//
// The server holds a copy of the constants and the window (server/src/replay/santa.js), pinned to this file by
// server/test/santa.test.mjs. A change here must follow there.

/** 24 December, as a local day number (days since 1970 on the phone's clock; airportdb.js localDay). Christmas Eve 2026. */
export const SANTA_DAY = 20811;

/** The sleigh's callsign. It is not a flight number and is said as "Santa One" (radio.js spokenCallsign). */
export const SANTA_CALLSIGN = 'SANTA 1';

/** The sleigh comes in at this game time (s), and the heads-up is given SANTA_SOON_S before it (the 'santaSoon' event). */
export const SANTA_AT_S = 60;
export const SANTA_SOON_S = 5;

/**
 * Santa level games are ranked on the level boards only when this is true. It is set from the B-balance run (tools/santa-balance.mjs,
 * DECISIONS 459 (g)): if the median score differs by more than 15% or the crash rate by more than 5 points from
 * plain Normal games, it is false and Santa level games are unranked. The server's copy is server/src/replay/santa.js.
 */
export const SANTA_LEVEL_RANKED = true;

/** The window on the level boards, in UTC day numbers: 23 Dec 00:00 UTC (inclusive) to 26 Dec 00:00 UTC (exclusive). */
export const SANTA_WINDOW_FROM = 20810;
export const SANTA_WINDOW_TO = 20813;

const DAY_MS = 86400000;

/** The reason a level game with Santa is not ranked when its end time is outside the window (ranking.js). */
export const SANTA_WINDOW_REASON = 'santaWindow';

/**
 * Whether the setup flies the sleigh: setup.santaDay is SANTA_DAY. Pure, and the only Santa rule the sim reads. A replay has the same
 * setup as the game it records, so the sleigh flies in the replay exactly when it flew in the game.
 */
export function sleighFlies(setup) {
  return !!setup && setup.santaDay === SANTA_DAY;
}

/** Whether a local day (a day number the caller read from its clock) is Christmas Eve. */
export function santaOn(localDay) {
  return localDay === SANTA_DAY;
}

/** Whether a game's end time (ms since 1970, as the phone sends it) is inside the level window: 23 Dec to 26 Dec, UTC. */
export function santaWindowOk(endedAtMs) {
  return Number.isFinite(endedAtMs) && endedAtMs >= SANTA_WINDOW_FROM * DAY_MS && endedAtMs < SANTA_WINDOW_TO * DAY_MS;
}

/** Whether an aircraft (or a warning) is the sleigh. A real flight never is, whatever its callsign. */
export function isSleigh(a) {
  return !!a && !a.live && a.callsign === SANTA_CALLSIGN;
}
