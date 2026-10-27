// World stats (3.1; DECISIONS 384; the second part, 3.2, DECISIONS 400): the counts of every game on the online boards' server, on the
// home screen and in Leaderboards, the note a finished game sends, and a daily challenge's score histogram. Pure rules here: no DOM,
// no clock of its own (the caller passes now), and the calls take the api from the caller (boards.js makeApi). The server's side is
// server/src/worldstats.js.
//
// What a note holds: the game's version, the planes landed, the airport, and three flags: the game is the phone's first of the UTC
// day, of the UTC week, and its first ever. A daily game that ends also holds its daily number and its score (3.2). The phone keeps
// the day and the week it last reported, and the planes it landed that week, in its save (save.worldStats). Nothing that names the
// player or the phone is sent, and the server keeps counts only (the totals, each day's best game, the hours, the daily score
// histograms and the all-time record).
//
// Which games send a note: every game that ends (the game over), and a game left from the pause card's Quit once it has a landing.
// Not the home screen's demo, not a recorded game (its planes were recorded earlier, so they are not today's traffic), not a game
// with no airport code the server takes, not when the switch is off, and not on a phone that is not the Android app (a browser, or
// the sideload build, which has no device hash: the same test the trial's first-day ask uses, firstday.js). Not twice for a game.
// A lost note is a small miscount: nothing is sent again. Only a game that ends sends its daily number and score; a daily game left
// from Quit sends the plain note (its score would be a part-game, and the histogram is of finished games).

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
// The home screen's line shows today's numbers once this many people have played today (a few are the first players; the line
// would be noise before), else the all-time planes landed once there are this many (DECISIONS 384).
export const HOME_PLAYERS_MIN = 25;
export const HOME_LANDED_MIN = 100;
// The counts are read at most this often (the home screen shows on every return to it, and the tab on every opening).
export const FETCH_MS = 5 * 60 * 1000;

// The second part (3.2, DECISIONS 400). A fact on the home line shows only when its number is worth showing: small numbers stay hidden.
export const TICKER_LANDED_MIN = 100; // planes landed today before the line says them
export const TICKER_BUSIEST_MIN = 5; // games at the busiest airport today before the line names it
export const GOAL_SHOW_MIN = 100; // planes landed this week before the line shows the goal
export const TICKER_STEP_MS = 4000; // how long each fact stays on the home line
export const PROJECT_MAX_MS = FETCH_MS; // the day's count moves on from the read at the recent rate for at most this long
export const PERCENT_PLAYS_MIN = 20; // the end card's percentile is said from this many plays of the daily, and not before
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AIRPORT = /^[A-Z0-9]{3,4}$/;
const whole = (x) => Number.isSafeInteger(x) && x >= 0;

export const COPY = Object.freeze({
  preLaunch: 'World stats open at launch.',
  offline: "You're offline. World stats need a connection.",
  error: "World stats aren't answering right now.",
  empty: 'No games yet today.',
  footnote: 'Days and weeks are UTC. Counts start with version 3.1. Counts and daily scores only: no names or IDs.',
  bestNone: 'No planes landed yet today.',
  hours: 'Planes landed in each hour of today (UTC), on your clock.',
  records: 'The most planes landed in one game, all time. Counts only.',
  goal: 'The goal is last week’s planes plus 10%, rounded up to 100, and at least 1,000.',
  map: 'Airports played today. Bigger dots: more planes landed.',
  reward: 'You helped: you landed planes this week, and the goal was reached.',
});

/** A number with thousands separators (en-US, as the rest of the game's numbers). */
export const withCommas = (n) => Number(n || 0).toLocaleString('en-US');

/** The UTC day, as whole days since 1970. */
export const utcDay = (ms) => Math.floor(ms / DAY_MS);
/** The Monday that starts the UTC week of a day, as a day number (day 0 was a Thursday, so with Monday as 0 the weekday is (day + 3) % 7). */
export const utcWeekStart = (day) => day - ((((day + 3) % 7) + 7) % 7);
/** The UTC hour of a time, 0 to 23. */
export const utcHourOf = (ms) => Math.floor((((ms % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS);

/** The save's record of the last note: { day, week, ever, weekLanded }. A missing or damaged record is a phone that has not reported. */
export const defaultWorldStats = () => ({ day: 0, week: 0, ever: false, weekLanded: 0 });
export function sanitizeWorldStats(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return { day: whole(o.day) ? o.day : 0, week: whole(o.week) ? o.week : 0, ever: o.ever === true, weekLanded: whole(o.weekLanded) ? o.weekLanded : 0 };
}

/**
 * The three flags for a note sent now. A week that has not been reported is a day that has not been either (the week is set with
 * the day), so the flags nest the way the server checks them: firstWeek implies firstToday, and firstEver implies firstWeek.
 */
export function flagsFor(ws, now) {
  const day = utcDay(now);
  const week = utcWeekStart(day);
  return { day, week, firstToday: ws.day !== day, firstWeek: ws.week !== week, firstEver: !ws.ever };
}

/**
 * The note for a game: the six keys the server takes, and for a daily game that ends (daily > 0) its daily number and score as well
 * (the server takes both or neither). landed is a whole number (the server clamps it).
 */
export function gameNote({ landed, icao, version, ws, now, daily = 0, score = 0 }) {
  const f = flagsFor(ws, now);
  const note = {
    version,
    landed: Math.max(0, Math.floor(Number(landed) || 0)),
    airport: icao,
    firstToday: f.firstToday,
    firstWeek: f.firstWeek,
    firstEver: f.firstEver,
  };
  if (daily > 0) return { ...note, daily, score: Math.max(0, Math.floor(Number(score) || 0)) };
  return note;
}

/**
 * The save's record after the server counted the note: the day, the week and ever (the phone reports no more first games today), and
 * the planes this phone landed in the week. before is the record as it was when the note was sent; the week's planes carry on only
 * within the same week.
 */
export function afterCounted(now, before = defaultWorldStats(), landed = 0) {
  const day = utcDay(now);
  const week = utcWeekStart(day);
  const carried = before && before.week === week ? before.weekLanded || 0 : 0;
  return { day, week, ever: true, weekLanded: carried + Math.max(0, Math.floor(Number(landed) || 0)) };
}

/** The planes this phone landed in the current UTC week, as its record holds them (0 in a week it has not reported in). */
export const myWeekLanded = (ws, now) => (ws && ws.week === utcWeekStart(utcDay(now)) ? ws.weekLanded || 0 : 0);

/**
 * Whether a note is sent for a game. reason: 'over' (the game ended) or 'quit' (left from the pause card). on: the switch (save.settings
 * worldStats, on by default). native: the Android app (a device hash). live: the boards are open (boards.js boardsLive). recorded:
 * the game is a recorded one. sent: this game has sent its note already.
 */
export function shouldSendGameNote({ reason, landed = 0, on = true, native = false, live = false, recorded = false, sent = false, icao = '' } = {}) {
  if (sent || !on || !native || !live || recorded) return false;
  if (!AIRPORT.test(String(icao || ''))) return false;
  if (reason === 'over') return true;
  if (reason === 'quit') return Number(landed) >= 1;
  return false;
}

/** The Settings line under the switch, in plain words (the house style of reminder.js). */
export function worldStatsNote({ native = true, on = true } = {}) {
  if (!native) return 'Only in the Android app.';
  if (!on) return 'Off. Your games are not counted. You can still see the World stats.';
  return 'On: each finished game adds to the World stats. Only counts and daily scores are kept: no name, no ID.';
}

/** The planes landed, in words: "1 plane landed", "2 planes landed". */
export const landedWord = (n) => (Number(n) === 1 ? '1 plane landed' : `${withCommas(n)} planes landed`);
/** The words after a number the screen shows on its own: "plane landed" for one, "planes landed" for more (the best game's panel). */
export const landedNoun = (n) => (Number(n) === 1 ? 'plane landed' : 'planes landed');

/**
 * The home screen's line before 3.2 (DECISIONS 384): today's players and planes once today has HOME_PLAYERS_MIN players; else the
 * all-time planes landed once they reach HOME_LANDED_MIN; else nothing (''). No stats (null) is nothing. Kept for the tests of the
 * rule; the line now rotates its facts (tickerFacts).
 */
export function homeWorldLine(stats) {
  if (!stats) return '';
  if (stats.today.players >= HOME_PLAYERS_MIN) return `Today: ${withCommas(stats.today.players)} players · ${landedWord(stats.today.landed)}`;
  if (stats.total.landed >= HOME_LANDED_MIN) return `${withCommas(stats.total.landed)} planes landed by all players`;
  return '';
}

/**
 * The planes landed today, moved on from the read at the recent rate (DECISIONS 400): the read's count plus the rate times the time
 * since the read, at most PROJECT_MAX_MS of it. The rate is recentRate. A count that was read is never more than the read says plus
 * this estimate, so the number ticks up between reads and is corrected by the next read.
 */
export function projectedLanded(stats, readAtMs, nowMs) {
  const elapsed = Math.min(Math.max(0, nowMs - readAtMs), PROJECT_MAX_MS);
  return stats.today.landed + Math.floor(recentRate(stats.hours, nowMs) * elapsed);
}

/**
 * The planes landed per millisecond over the recent hour, from the day's hours (DECISIONS 400): the last full hour and this hour so
 * far, over their length. The first minutes of a UTC day have too little to go on (under five minutes gives no rate, so nothing ticks).
 */
export function recentRate(hours, nowMs) {
  if (!Array.isArray(hours) || hours.length !== 24) return 0;
  const h = utcHourOf(nowMs);
  const minutes = ((((nowMs % HOUR_MS) + HOUR_MS) % HOUR_MS) / 60000);
  if (h === 0) return minutes < 5 ? 0 : hours[0] / (minutes * 60000);
  return (hours[h - 1] + hours[h]) / ((60 + minutes) * 60000);
}

/** The percentage of the week's goal, a whole number: 100 once met, and never 100 before it is (99 at most). */
export const goalPct = (goal) => (goal.met ? 100 : Math.min(99, Math.floor((goal.landed * 100) / goal.target)));

/**
 * The facts the home line rotates through (DECISIONS 400): today's planes landed (with the players once there are HOME_PLAYERS_MIN),
 * else the all-time planes; the busiest airport today; the week's goal. Each shows only when its number is worth showing. landed is
 * the day's count as shown (the projection), or null for the projection from the read.
 */
export function tickerFacts(stats, { readAtMs = 0, nowMs = Date.now(), landed = null } = {}) {
  if (!stats) return [];
  const facts = [];
  const today = landed === null ? projectedLanded(stats, readAtMs, nowMs) : landed;
  if (today >= TICKER_LANDED_MIN) {
    facts.push({ key: 'today', text: stats.today.players >= HOME_PLAYERS_MIN ? `Today: ${withCommas(stats.today.players)} players · ${landedWord(today)}` : `${landedWord(today)} today` });
  } else if (stats.total.landed >= HOME_LANDED_MIN) {
    facts.push({ key: 'all', text: `${withCommas(stats.total.landed)} planes landed by all players` });
  }
  const top = stats.airports && stats.airports[0];
  if (top && top.games >= TICKER_BUSIEST_MIN) facts.push({ key: 'busiest', text: `Busiest today: ${top.icao}, ${withCommas(top.games)} games` });
  const goal = stats.goal;
  if (goal && goal.target > 0 && goal.landed >= GOAL_SHOW_MIN) {
    facts.push({ key: 'goal', text: goal.met ? `Weekly goal reached: ${withCommas(goal.landed)} planes` : `Weekly goal: ${goalPct(goal)}% of ${withCommas(goal.target)} planes` });
  }
  return facts;
}

/** The index of the fact to show now: each fact holds TICKER_STEP_MS in turn (-1 when there are none). */
export function tickerPick(count, nowMs) {
  if (!(count > 0)) return -1;
  return Math.floor(Math.max(0, nowMs) / TICKER_STEP_MS) % count;
}

/**
 * The day's 24 hours as bars (DECISIONS 400): utc is the UTC hour (the bars run from the day's first hour), local the player's clock hour
 * for it (tzOffsetMin is Date.getTimezoneOffset(), minutes west of UTC), ratio the height against the busiest hour (0 to 1), and label
 * the clock hour under every sixth bar. Null when the hours are not 24 numbers.
 */
export function hourBars(hours, tzOffsetMin = 0) {
  if (!Array.isArray(hours) || hours.length !== 24) return null;
  const top = Math.max(0, ...hours);
  return hours.map((landed, utc) => {
    const minute = (((utc * 60 - tzOffsetMin) % 1440) + 1440) % 1440;
    const local = Math.floor(minute / 60);
    return { utc, local, landed, ratio: top > 0 ? landed / top : 0, label: local % 6 === 0 ? String(local) : '' };
  });
}

/** A UTC day number as "14 Oct 2026" (the record's day). */
export function dateWords(day) {
  const d = new Date(Number(day) * DAY_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The all-time record for the tab: the big number, its words, and where and when it was flown. null without a record. */
export function recordWords(rec, city = '') {
  if (!rec) return null;
  return { landed: withCommas(rec.landed), noun: landedNoun(rec.landed), where: `at ${rec.icao}${city ? ` · ${city}` : ''}, ${dateWords(rec.day)}` };
}

/** The week's goal for the tab: the percentage, the planes against the target, and the line under the bar. null without a goal. */
export function goalView(goal) {
  if (!goal || !(goal.target > 0)) return null;
  const pct = goalPct(goal);
  return { pct, met: !!goal.met, line: `${withCommas(goal.landed)} of ${withCommas(goal.target)} planes`, text: goal.met ? 'Goal reached this week.' : `${pct}% of this week’s goal.` };
}

/** The reward (DECISIONS 400): a player who landed planes this week, in a week the goal is reached, is thanked on the tab. A line, not a badge. */
export function rewardLine(goal, weekLanded) {
  return goal && goal.met && Number(weekLanded) > 0 ? COPY.reward : '';
}

/**
 * Today's best game as the tab's challenge: the sentence "Today’s best: 169 planes at Heathrow." and the button "Beat it?" (a tap starts a game
 * at that airport). name is the airport's short name (airportShortName), or the code. null when no game has landed a plane today.
 */
export function bestChallenge(best, name = '') {
  if (!best) return null;
  const planes = Number(best.landed) === 1 ? '1 plane' : `${withCommas(best.landed)} planes`;
  return { sentence: `Today’s best: ${planes} at ${name || best.icao}.`, button: 'Beat it?', icao: best.icao };
}

/**
 * An airport's short name for a line: "Heathrow" for "London Heathrow" (the city goes), "Atlanta" for a long name with the city
 * in it, else the name. The name's "International" and "Airport" are dropped.
 */
export function airportShortName(info) {
  if (!info) return '';
  const name = String(info.name || '').replace(/\b(International|Intl|Airport)\b/gi, '').replace(/\s+/g, ' ').trim();
  const city = String(info.city || '').replace(/\s*\(.*$/, '').split(',')[0].trim();
  if (city && name.toLowerCase().startsWith(`${city.toLowerCase()} `)) {
    const rest = name.slice(city.length).trim();
    if (rest) return rest;
  }
  if (city && name.length > 18) return city;
  return name || String(info.icao || '');
}

/**
 * The percentile of a score among a daily's plays (DECISIONS 400): the whole per cent of the plays whose score fell in a lower bucket
 * (a score is in its bucket, so a tie in the same bucket is not beaten). null from fewer than PERCENT_PLAYS_MIN plays, or without a
 * histogram.
 */
export function percentileOf(hist, score) {
  if (!hist || !Array.isArray(hist.counts) || !(hist.plays >= PERCENT_PLAYS_MIN) || !(hist.bucket > 0)) return null;
  const mine = Math.floor(Math.max(0, Number(score) || 0) / hist.bucket);
  let below = 0;
  for (let b = 0; b < Math.min(mine, hist.counts.length); b += 1) below += hist.counts[b];
  return Math.floor((100 * below) / hist.plays);
}

/** The end card's line: "You beat 72% of today’s players", or '' (no line) when there are too few plays, or the player beat none. */
export function percentLine(hist, score) {
  const p = percentileOf(hist, score);
  return p !== null && p >= 1 ? `You beat ${p}% of today’s players` : '';
}

/**
 * The counts as the server sends them, checked: each number a whole number, the airports a list, and the best game a
 * { landed, icao } or null. The 3.2 fields (hours, map, records, goal) are read leniently: a server that does not send them gives
 * none, so the line and the tab still show the 3.1 counts. Anything else is null (nothing is shown for a body that is not the answer).
 */
export function readStats(j) {
  if (!j || typeof j !== 'object') return null;
  const counts = (v) => {
    if (!v || typeof v !== 'object') return null;
    const keys = ['players', 'games', 'landed'];
    if (!keys.every((k) => Number.isSafeInteger(v[k]) && v[k] >= 0)) return null;
    return { players: v.players, games: v.games, landed: v.landed };
  };
  const today = counts(j.today);
  const week = counts(j.week);
  const total = counts(j.total);
  if (!today || !week || !total || !Array.isArray(j.airports)) return null;
  const airports = j.airports
    .filter((a) => a && typeof a.icao === 'string' && AIRPORT.test(a.icao) && Number.isSafeInteger(a.games) && Number.isSafeInteger(a.landed))
    .map((a) => ({ icao: a.icao, games: a.games, landed: a.landed }));
  const best = j.best && Number.isSafeInteger(j.best.landed) && j.best.landed > 0 && typeof j.best.icao === 'string' && AIRPORT.test(j.best.icao)
    ? { landed: j.best.landed, icao: j.best.icao }
    : null;
  const hours = Array.isArray(j.hours) && j.hours.length === 24 && j.hours.every(whole) ? j.hours.slice() : new Array(24).fill(0);
  const map = Array.isArray(j.map)
    ? j.map.filter((a) => a && typeof a.icao === 'string' && AIRPORT.test(a.icao) && whole(a.games) && whole(a.landed)).map((a) => ({ icao: a.icao, games: a.games, landed: a.landed }))
    : [];
  const records = j.records && whole(j.records.landed) && j.records.landed > 0 && typeof j.records.icao === 'string' && AIRPORT.test(j.records.icao) && whole(j.records.day)
    ? { landed: j.records.landed, icao: j.records.icao, day: j.records.day }
    : null;
  const goal = j.goal && whole(j.goal.target) && j.goal.target > 0 && whole(j.goal.landed) && typeof j.goal.met === 'boolean'
    ? { target: j.goal.target, landed: j.goal.landed, met: j.goal.met }
    : null;
  return { today, week, total, airports, best, hours, map, records, goal, at: Number.isFinite(j.at) ? j.at : 0 };
}

/** One daily challenge's histogram as the server sends it, checked: { daily, plays, bucket, counts } or null. */
export function readDaily(j) {
  if (!j || typeof j !== 'object') return null;
  if (!whole(j.daily) || !whole(j.plays) || !(Number.isSafeInteger(j.bucket) && j.bucket > 0) || !Array.isArray(j.counts)) return null;
  if (!j.counts.every(whole)) return null;
  return { daily: j.daily, plays: j.plays, bucket: j.bucket, counts: j.counts };
}

// The last answer read, for the home line and the tab (memory only: nothing is kept on the phone). null after a failed read.
let held = null; // { body, at }
let reading = null;
const dailyHeld = new Map(); // daily number -> { body, at }: a daily's histogram, read at most every FETCH_MS (memory only)

/** The last answer that was read, or null. */
export const heldWorldStats = () => (held ? held.body : null);
/** When the held answer was read (the phone's clock), or 0. */
export const heldWorldAt = () => (held ? held.at : 0);

/** Forgets the held answers (the tests start from nothing). */
export function resetWorldStats() {
  held = null;
  reading = null;
  dailyHeld.clear();
}

/**
 * Reads the counts: at most every FETCH_MS unless force. Resolves { state, body, at }: state is 'ok' (body is the counts), 'offline'
 * (no connection), or 'error' (anything else, or a body that is not the answer). A failed read clears the held answer, so the home
 * line hides; the next read tries again. api: boards.js makeApi() (stats() -> { status, json }).
 */
export async function readWorldStats({ api, now = Date.now(), force = false } = {}) {
  // a held answer from before UTC midnight is yesterday's: it is read again, so 'today' is never yesterday's counts
  if (!force && held && utcDay(held.at) === utcDay(now) && now - held.at < FETCH_MS) return { state: 'ok', body: held.body, at: held.at };
  if (!reading) reading = fetchOnce(api, now).finally(() => { reading = null; });
  return reading;
}

async function fetchOnce(api, now) {
  let r = { status: 0, json: null };
  try {
    r = await api.stats();
  } catch (_) { /* a failed call is an offline answer below */ }
  const body = r && r.status === 200 ? readStats(r.json) : null;
  if (body) {
    held = { body, at: now };
    return { state: 'ok', body, at: now };
  }
  held = null;
  return { state: !r || r.status === 0 ? 'offline' : 'error', body: null, at: 0 };
}

/**
 * A daily challenge's histogram, read at most every FETCH_MS (DECISIONS 400). Resolves the histogram, or null (no connection, an error,
 * or a body that is not the answer). api: boards.js makeApi() (statsDaily(daily) -> { status, json }).
 */
export async function readDailyHistogram({ api, daily, now = Date.now() } = {}) {
  const h = dailyHeld.get(daily);
  if (h && now - h.at < FETCH_MS) return h.body;
  let r = { status: 0, json: null };
  try {
    r = await api.statsDaily(daily);
  } catch (_) { /* a failed call leaves no histogram: no line */ }
  const body = r && r.status === 200 ? readDaily(r.json) : null;
  if (body) dailyHeld.set(daily, { body, at: now });
  else dailyHeld.delete(daily);
  return body;
}

/**
 * Sends a finished game's note. Resolves true when the server counted it (200 counted), and false for anything else: a cap (202), a
 * refusal, or no connection. The caller updates save.worldStats only on true. Fire and forget: nothing waits on it.
 */
export async function sendGameNote(api, body) {
  try {
    const r = await api.statsGame(body);
    return !!r && r.status === 200 && !!r.json && r.json.status === 'counted';
  } catch (_) {
    return false;
  }
}

/** The Leaderboards' World stats tab, as the screen draws it: the three periods, the airports and the best game. */
export function statsView(body) {
  if (!body) return null;
  return {
    periods: [
      { label: 'Today', ...body.today },
      { label: 'This week', ...body.week },
      { label: 'All time', ...body.total },
    ],
    airports: body.airports.map((a) => ({ icao: a.icao, games: a.games, landed: a.landed, text: `${withCommas(a.landed)} landed` })),
    best: body.best ? { landed: body.best.landed, icao: body.best.icao, word: landedNoun(body.best.landed) } : null,
    empty: body.today.games === 0,
  };
}
