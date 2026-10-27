// The weekend event (3.3; DECISIONS 430 to 434). From Saturday 00:00 to Monday 00:00 on the phone's clock, one airport and one
// twist are the event, the same for everyone whose clock says that weekend. It is free, like the daily, and it has its own board.
// Pure: no DOM, no storage, no clock of its own. The server holds a copy of these rules (server/src/replay/weekend.js), and
// test/contract.test.mjs checks the two agree, so a change here fails the server tests until that file follows.
//
// Days are local day numbers (airportdb.js localDay: whole days since 1970 on the phone's clock). Weekdays are Monday 0 .. Sunday 6.
import { BUSIEST } from './airportdb.js?v=7227d0de';

// The first weekend the rotation counts from: Saturday 31 Oct 2026. A fixed date, not the release date, so the rotation does not move.
export const WEEKEND_EPOCH = 20757;

/** A local day's weekday, Monday 0 .. Sunday 6 (reminder.js weekday, the same rule). */
const weekdayOf = (day) => (((day + 3) % 7) + 7) % 7;

/** The weekend a local day belongs to: its Saturday's day number, on a Saturday or Sunday from the epoch on; otherwise null. */
export function weekendOf(day) {
  const wd = weekdayOf(day);
  const w = wd === 5 ? day : wd === 6 ? day - 1 : null;
  return w !== null && w >= WEEKEND_EPOCH ? w : null;
}

/** The Saturday of the most recent weekend up to a local day (the day itself on a Saturday; on a weekday, the one just past). */
export function lastWeekendOf(day) {
  return day - ((weekdayOf(day) - 5 + 7) % 7);
}

/** The Saturday of the next weekend after a weekday (Monday to Friday). */
export function nextWeekendOf(day) {
  return day + ((5 - weekdayOf(day) + 7) % 7);
}

// The rush hour twist: Normal's banks made bigger and earlier (director.js RUSH). The push starts at 60 s, not 100 s, so the first
// wave comes early enough to see on a short game. The numbers are a starting point for the balance run (DECISIONS 434).
export const WEEKEND_RUSH = Object.freeze({ amp: 0.25, from: 60, origin: 60, push: 45, gap: 0.65, noBurst: false });

// The four themes, in rotation: each one comes once a month. wx is the sim's weather seed for the theme, or null for the generated
// weather. title is the name on the cards; line and short are the home row's small line (with and without the airport's code).
// pause is the line on the pause card.
export const THEMES = Object.freeze([
  { id: 'storm', title: 'Storm weekend', line: 'thunderstorms in every game', short: 'storms', pause: 'Thunderstorm cells come and go all game.' },
  { id: 'fog', title: 'Fog weekend', line: 'fog in every game', short: 'fog', pause: 'Fog banks hide planes behind radar blips.' },
  { id: 'rush', title: 'Rush hour weekend', line: 'arrivals in waves', short: 'waves', pause: 'Arrivals come in big waves.' },
  { id: 'windy', title: 'Windy weekend', line: 'strong gusts in every game', short: 'gusts', pause: 'Strong gusts push the planes about.' },
]);

/** The weekend's theme (the four in turn, a week at a time from the epoch). W is a weekend's Saturday day number. */
export function themeOf(W) {
  const k = Math.floor((W - WEEKEND_EPOCH) / 7);
  return THEMES[((k % THEMES.length) + THEMES.length) % THEMES.length];
}

/**
 * The seed of a weekend's traffic: the daily's formula with another salt, so a weekend's planes are not the daily's. It is also the
 * wind direction (dir) for the three themes that have wind.
 */
export function weekendSeed(W) {
  return Math.imul(W + 16015, 2654435761) >>> 1;
}

/**
 * The weekend's airport: one of the 50 busiest, in its own order (7 places a week, so all 50 come up once in 50 weeks). Offset by 25
 * from the daily's rotation, so it is never the Saturday's or the Sunday's daily airport.
 */
export function weekendAirport(W) {
  return BUSIEST[(W + 25) % BUSIEST.length][0];
}

/**
 * The sim's weather for the weekend's theme (the setup's wxSeed, weather.js). Each carries no sky (cloud, precipitation): the look of
 * the weather is not part of the planes, as challengeWxSeed says. Null for the rush hour theme, which has the generated weather.
 */
export function weekendWx(W) {
  const t = themeOf(W);
  const dir = weekendSeed(W) % 360;
  const sky = { cloud: null, precip: null, precipIntensity: 1 };
  if (t.id === 'storm') return { windDir: dir, windKt: 12, gustKt: 20, storms: true, fog: 0, ...sky };
  if (t.id === 'fog') return { windDir: dir, windKt: 6, gustKt: 0, storms: false, fog: 1, ...sky };
  if (t.id === 'windy') return { windDir: dir, windKt: 20, gustKt: 30, storms: false, fog: 0, ...sky };
  return null;
}

/**
 * The setup a weekend game is played with (simdriver.js makeGame, replay.js setup). Everything in it is pinned: the server refuses a
 * replay whose setup is not this one (server/src/replay/weekend.js weekendSetup). The phone adds its airport's country to it, which
 * the server leaves out of the check (the country only names the airlines and the registrations).
 */
export function weekendSetup(W) {
  const t = themeOf(W);
  return {
    theme: t.id,
    rush: t.id === 'rush' ? WEEKEND_RUSH : null,
    wxSeed: weekendWx(W),
    diff: 'normal', realOnly: false, departures: true, firstGame: false, fixesHidden: false,
  };
}

/** The date range of a weekend on the phone's clock: "31 Oct to 1 Nov". Day numbers are read in UTC, which is their calendar date. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function weekendDates(W) {
  const day = (d) => {
    const t = new Date((d) * 86400000);
    return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  };
  return `${day(W)} to ${day(W + 1)}`;
}

/** The home row's small line for a weekend: "LHR · thunderstorms in every game" (short: "LHR · storms"). */
export function weekendLine(W, icao, { short = false } = {}) {
  const t = themeOf(W);
  return `${icao} · ${short ? t.short : t.line}`;
}

/** The title the loading card and the HUD show: "Storm weekend: LHR", as the daily shows "Daily #3: LHR". */
export function weekendTitle(W, icao) {
  return `${themeOf(W).title}: ${icao}`;
}

/**
 * The weekend record a save keeps (save.weekend: { w, best, tries }), read from storage: whole numbers, and a weekend from the epoch
 * on. Anything damaged reads as no record, so the event does not show a best that was never flown.
 */
export function sanitizeWeekend(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  if (!Number.isInteger(v.w) || v.w < WEEKEND_EPOCH) return null;
  return { w: v.w, best: count(v.best), tries: count(v.tries) };
}
