// The Thanksgiving Rush (3.4): five days of holiday traffic, 25 to 29 November 2026. Each day has one busy US airport and one board.
// The planes come in big waves (the rush bank below), so each game is busier than a normal one. It is free, like the daily, and it
// works offline. Pure: no DOM, no storage, no clock of its own, and no import from the sim. The server holds a copy of these rules
// (server/src/replay/rush.js), and test/contract.test.mjs checks the two agree, so a change here fails the server tests until that
// file follows.
//
// Days are local day numbers (airportdb.js localDay: whole days since 1970 on the phone's clock).

/** The first and last days of the Rush: Wednesday 25 November 2026 and Sunday 29 November 2026. */
export const RUSH_FIRST_DAY = 20782;
export const RUSH_LAST_DAY = 20786;

/** One airport a day, in day order: 25 Nov ATL, 26 Nov ORD, 27 Nov DFW, 28 Nov DEN, 29 Nov LAX. */
export const RUSH_AIRPORTS = Object.freeze(['KATL', 'KORD', 'KDFW', 'KDEN', 'KLAX']);

/** The salt of the Rush's seed. The daily uses 7919 and the weekend 16015, so the Rush's planes are neither. */
export const RUSH_SALT = 26017;

/** The Rush's name on the cards, the home row and the notice. */
export const RUSH_TITLE = 'Thanksgiving Rush';

/** The Saturday of the Rush's weekend (28 November): the weekend event is not offered that weekend in 3.4 (weekend.js weekendOf). */
export const RUSH_WEEKEND = RUSH_FIRST_DAY + 3;

// The rush hour bank (the director.js RUSH shape, as WEEKEND_RUSH). The waves are bigger and come earlier than Normal's. Provisional:
// the A-balance run (tools/rush-balance.mjs, 10 Nov) confirms it or tunes amp, push and gap.
export const THANKSGIVING_RUSH = Object.freeze({ amp: 0.35, from: 60, origin: 60, push: 40, gap: 0.6, noBurst: false });

/** The day number a local day is, when it is one of the Rush's five days; otherwise null. */
export function rushOf(day) {
  return Number.isInteger(day) && day >= RUSH_FIRST_DAY && day <= RUSH_LAST_DAY ? day : null;
}

/** The Rush's airport for a day (the same for everyone on that day), or null outside the five days. */
export function rushAirport(day) {
  const d = rushOf(day);
  return d === null ? null : RUSH_AIRPORTS[d - RUSH_FIRST_DAY];
}

/** The seed of a day's traffic: the daily's formula with the Rush's salt. */
export function rushSeed(day) {
  return Math.imul(day + RUSH_SALT, 2654435761) >>> 1;
}

/**
 * The setup a Rush game is played with (simdriver.js makeGame, replay.js setup). Everything in it is pinned: the server refuses a replay
 * whose setup is not this one (server/src/replay/rush.js sameRushSetup). The Beginner game has no waves (rush: null, as the director
 * already has for Beginner) and is unranked (ranking.js rushSettings). The phone adds its airport's country, which the server leaves out.
 */
export function rushSetup(diff = 'normal') {
  return {
    theme: 'thanksgiving',
    rush: diff === 'beginner' ? null : { ...THANKSGIVING_RUSH },
    wxSeed: null,
    diff, realOnly: false, departures: true, firstGame: false, fixesHidden: false,
  };
}

/** The home row's small line for a day: "ATL · holiday waves" (short: "ATL · waves"). */
export function rushLine(icao, { short = false } = {}) {
  return `${icao} · ${short ? 'waves' : 'holiday waves'}`;
}

/** The title the loading card and the HUD show: "Thanksgiving Rush: ATL". */
export function rushTitleFor(icao) {
  return `${RUSH_TITLE}: ${icao}`;
}

/** The day numbers of the Rush the phone has flown (save.rushDays): whole days inside the five, in order, without repeats. */
export function sanitizeRushDays(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d) => rushOf(d) !== null))].sort((a, b) => a - b);
}

/**
 * The Rush record a save keeps (save.rush: { day, best, tries }), read from storage: whole numbers, and a day in the Rush. Anything
 * damaged reads as no record, so the event does not show a best that was never flown (weekend.js sanitizeWeekend).
 */
export function sanitizeRush(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  if (rushOf(v.day) === null) return null;
  return { day: v.day, best: count(v.best), tries: count(v.tries) };
}
