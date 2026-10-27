// Cloud save (DECISIONS 363): the progress the player's Play Games Saved Games copy holds, and the rule that merges two copies
// into one so no progress is lost. Pure: no DOM, no bridge and no clock of its own. The caller passes the trusted clock: now (ms),
// today (the local day, airportdb.js localDay) and daily (today's daily number, airportdb.js dailyNumber).
//
// Only a whitelist of the save is copied. The age answer, the Pro day (save.pro), the device's first day, the sign-in session, the
// queue of ranked games, the settings and the one-time flags are never in the copy, so a copy can change none of them. Every value
// the copy brings in is cleaned and capped: a count or a score is a whole number, a time is never past now, a run's last day is at
// most a time zone's step past today (streak.js LARGE_BACK; a run further ahead moves back to today), and a daily is never past
// today's number, so a clock set far ahead cannot win a merge.
//
// The rules: counters, best scores, bests in one game and every cell of the airport stats take the larger; earned achievements
// and visited airports take the union (an achievement keeps its earlier time); the streak follows the most recent day, and a run
// that joins the other phone's run (within the streak's gap) counts both; the daily keeps the later day, and the tutorial and the
// Tour flags stay set once set. The weekend event's record (weekend.js) follows the daily: the later weekend wins, and for the same
// weekend the larger best and tries.
import { LEVEL_ORDER } from './ranking.js?v=86c2b44d';
import { ACHIEVEMENTS } from './achievements.js?v=86c2b44d';
import { LARGE_BACK, RUN_GAP, emptyStreak, sanitizeStreak } from './streak.js?v=86c2b44d';
import { WEEKEND_EPOCH } from './weekend.js?v=86c2b44d';

export const CLOUD_VERSION = 1;
/** The largest copy sent. Play Games keeps a snapshot up to 3 MB; a bigger copy is not sent, and the sync fails silently. */
export const CLOUD_LIMIT = 1000000;

const MAX = 1e12;
const COUNTERS = ['played', 'landed', 'landedLive', 'pax', 'departed', 'bestStreak', 'paxRanked'];
const GAME_BEST = ['heavy5', 'live10', 'night', 'wet', 'storm', 'dep5'];
const CELL = ['games', 'best', 'bestRanked', 'landed', 'real', 'departed', 'pax', 'streak', 'time', 'last'];
const ACH_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
const LEVEL_KEYS = new Set([...LEVEL_ORDER, 'earlier']);
const ICAO = /^[A-Z0-9]{3,4}$/;
// a sanity bound, not a cap a player reaches: the game has 29,164 airports (game/data/airports.json), and a capped list would drop
// airports from the save
const VISITED_MAX = 40000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const maxOf = (a, b) => Math.max(a || 0, b || 0);
/** A count or a score: a whole number from 0 up to MAX. Anything else (text, NaN, a negative number) is 0. */
const count = (v) => (Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), MAX) : 0);
/** A time in ms, never past now. Anything else is 0 (no time). */
const when = (v, now) => (Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), now) : 0);

/** A map of the keys that pass keyOk, each value cleaned; a value that cleans to undefined is left out. */
function mapOf(src, keyOk, clean) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of Object.keys(src)) {
    if (!keyOk(k)) continue;
    const v = clean(src[k]);
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** One airport level cell, cleaned. The earlier bucket keeps its nulls (games and bestRanked were not recorded then). */
function cellOf(c, now) {
  if (!isObj(c)) return null;
  const out = {};
  for (const k of CELL) out[k] = k === 'last' ? when(c.last, now) : c[k] === null ? null : count(c[k]);
  return out;
}

function airportOf(a, now) {
  if (!isObj(a)) return null;
  return { last: when(a.last, now), levels: mapOf(a.levels, (k) => LEVEL_KEYS.has(k), (c) => cellOf(c, now)) };
}

/**
 * The streak, cleaned as the game reads it. A run that ends a time zone's step past today (LARGE_BACK, as streak.js reads it) is
 * kept as it is. A run that ends further past today is a clock error: it moves back to today, keeps its count and counts today
 * as played (recordPlayed).
 */
function streakOf(s, today) {
  const st = sanitizeStreak(s);
  if (st.last === null || st.last - today <= LARGE_BACK) return st;
  const days = st.days.filter((d) => d <= today);
  if (!days.includes(today)) days.push(today);
  return { ...st, last: today, start: Math.min(st.start, today), days };
}

/** Today's daily, cleaned: a number from 1 to today's, with its best and its tries. Anything else is null. */
function dailyOf(d, daily) {
  if (!isObj(d) || !Number.isInteger(d.n) || d.n < 1 || d.n > daily) return null;
  return { n: d.n, best: count(d.best), tries: count(d.tries) };
}

/** The weekend event's record, cleaned: a Saturday from the epoch, no later than tomorrow's local day, with its best and tries. */
function weekendOf(w, today) {
  if (!isObj(w) || !Number.isInteger(w.w) || w.w < WEEKEND_EPOCH || w.w > today + 1) return null;
  return { w: w.w, best: count(w.best), tries: count(w.tries) };
}

/** A copy's progress, cleaned against the trusted clock. A copy that is not an object is null. */
export function cleanCloud(p, ctx) {
  if (!isObj(p)) return null;
  const { now, today, daily } = ctx;
  const out = { v: CLOUD_VERSION };
  for (const k of COUNTERS) out[k] = count(p[k]);
  out.best = mapOf(p.best, (k) => ICAO.test(k), (v) => count(v) || undefined); // a score of 0 is no score
  out.gameBest = mapOf(p.gameBest, (k) => GAME_BEST.includes(k), (v) => count(v) || undefined);
  out.ach = mapOf(p.ach, (k) => ACH_IDS.has(k), (v) => when(v, now) || undefined);
  out.visited = [...new Set(Array.isArray(p.visited) ? p.visited : [])].filter((c) => typeof c === 'string' && ICAO.test(c)).sort().slice(0, VISITED_MAX);
  out.tourSeen = p.tourSeen === true;
  out.tutorialDone = p.tutorialDone === true;
  out.streak = streakOf(p.streak, today);
  out.daily = dailyOf(p.daily, daily);
  out.weekend = weekendOf(p.weekend, today);
  const airports = isObj(p.stats) && isObj(p.stats.airports) ? p.stats.airports : {};
  out.stats = { airports: mapOf(airports, (k) => ICAO.test(k), (a) => airportOf(a, now)) };
  return out;
}

/** The copy a phone writes: the synced progress of its save, cleaned. Nothing else of the save is read. */
export function cloudPayload(save, ctx) {
  const s = isObj(save) ? save : {};
  return cleanCloud({
    played: s.played, landed: s.landed, landedLive: s.landedLive, pax: s.pax, departed: s.departed,
    bestStreak: s.bestStreak, paxRanked: s.paxRanked, best: s.best, gameBest: s.gameBest, ach: s.ach,
    visited: s.visited, tourSeen: s.tourSeen, tutorialDone: s.tutorialDone, streak: s.streak, daily: s.daily, weekend: s.weekend,
    stats: s.stats,
  }, ctx);
}

/** A copy as text for Play Games, or null when it is no copy or it is too big to send. */
export function cloudText(payload) {
  if (!isObj(payload)) return null;
  const text = JSON.stringify(payload);
  return text.length <= CLOUD_LIMIT ? text : null;
}

/**
 * Whether a copy's text was written by this version or an older one. A newer copy is never written over (the sync stops). Text
 * that does not parse is no copy at all, so it is written over.
 */
export function cloudIsCurrent(text) {
  try {
    const p = JSON.parse(text);
    return !isObj(p) || !(Number(p.v) > CLOUD_VERSION);
  } catch (_) {
    return true;
  }
}

/** A copy's text, read and cleaned: null when there is none or it is not a copy. */
export function parseCloud(text, ctx) {
  if (typeof text !== 'string' || !text) return null;
  try {
    return cleanCloud(JSON.parse(text), ctx);
  } catch (_) {
    return null;
  }
}

function mergeMaps(a, b, fn) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = k in a ? fn(a[k], b[k]) : b[k];
  return out;
}

/** One airport level cell from two phones. A null on both sides stays null (the earlier bucket's games). */
function mergeCell(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = {};
  for (const k of CELL) out[k] = k !== 'last' && a[k] === null && b[k] === null ? null : maxOf(a[k], b[k]);
  return out;
}

function mergeAirport(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { last: maxOf(a.last, b.last), levels: mergeMaps(a.levels, b.levels, mergeCell) };
}

/** The days at the end of a sorted day list that make one run: each day no more than RUN_GAP days after the one before it. */
function runLength(days) {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (n > 0 && days[i + 1] - days[i] > RUN_GAP) break;
    n += 1;
  }
  return n;
}

/**
 * The streak from two phones. The run in progress is the one that reached the later day (then the longer count). The other run is
 * the same run when it ends within RUN_GAP days before this one starts, or the two overlap: then the counts add up (the days
 * are different), or the larger one stands where they overlap. A run past the gap is a run of its own, and this one stays.
 * The played days of both are kept.
 */
function mergeStreak(a, b) {
  const best = maxOf(a.best, b.best);
  if (a.last === null && b.last === null) return sanitizeStreak({ ...emptyStreak(), best });
  if (a.last === null || b.last === null) return sanitizeStreak({ ...(a.last === null ? b : a), best });
  const bWins = b.last > a.last || (b.last === a.last && b.count > a.count);
  const win = bWins ? b : a;
  const other = bWins ? a : b;
  const days = [...new Set([...win.days, ...other.days])].sort((x, y) => x - y);
  const joined = win.start - RUN_GAP <= other.last;
  const apart = other.last < win.start;
  const count = joined ? Math.max(runLength(days), apart ? win.count + other.count : Math.max(win.count, other.count)) : win.count;
  return sanitizeStreak({
    ...win,
    count,
    best,
    start: joined ? Math.min(win.start, other.start) : win.start,
    days,
    celebrated: joined ? Math.max(win.celebrated, other.celebrated) : win.celebrated,
  });
}

function mergeDaily(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.n !== b.n) return a.n > b.n ? a : b;
  return { n: a.n, best: maxOf(a.best, b.best), tries: maxOf(a.tries, b.tries) };
}

/** The weekend event's record: the later weekend wins; the same weekend keeps the larger best and tries (as the daily does). */
function mergeWeekend(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.w !== b.w) return a.w > b.w ? a : b;
  return { w: a.w, best: maxOf(a.best, b.best), tries: maxOf(a.tries, b.tries) };
}

/** Earned achievements: the union, each at its earlier time. */
const mergeAch = (a, b) => mergeMaps(a, b, (x, y) => Math.min(x, y));

/**
 * Two cleaned copies as one. Either may be null (no copy on that side): the other is then the result. The result is cleaned
 * already, so it can be written as it is.
 */
export function mergeCloud(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const visited = [...new Set([...a.visited, ...b.visited])].sort().slice(0, VISITED_MAX);
  const out = { v: CLOUD_VERSION };
  for (const k of COUNTERS) out[k] = maxOf(a[k], b[k]);
  out.best = mergeMaps(a.best, b.best, maxOf);
  out.gameBest = mergeMaps(a.gameBest, b.gameBest, maxOf);
  out.ach = mergeAch(a.ach, b.ach);
  out.visited = visited;
  out.tourSeen = a.tourSeen || b.tourSeen;
  out.tutorialDone = a.tutorialDone || b.tutorialDone;
  out.streak = mergeStreak(a.streak, b.streak);
  out.daily = mergeDaily(a.daily, b.daily);
  out.weekend = mergeWeekend(a.weekend, b.weekend);
  out.stats = { airports: mergeMaps(a.stats.airports, b.stats.airports, mergeAirport) };
  return out;
}

/**
 * Brings a merged copy into the save (in place, and returns it). The merged copy already holds the save's own progress, so this
 * only takes what the other phones brought. Called at home, never during a game (the game holds the save's maps).
 */
export function applyCloud(save, p) {
  for (const k of COUNTERS) save[k] = p[k];
  save.best = p.best;
  save.gameBest = p.gameBest;
  save.ach = p.ach;
  save.visited = p.visited;
  save.tourSeen = !!(save.tourSeen || p.tourSeen);
  save.tutorialDone = !!(save.tutorialDone || p.tutorialDone);
  save.streak = p.streak;
  if (p.daily) save.daily = p.daily;
  if (p.weekend) save.weekend = p.weekend;
  save.stats = { ...(save.stats && typeof save.stats === 'object' ? save.stats : {}), airports: p.stats.airports };
  return save;
}

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** How long ago, in words for the Settings line: "just now", "2 min ago", "3 h ago", "1 day ago", "4 days ago". */
export function agoWords(ms) {
  if (!Number.isFinite(ms) || ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * The Settings line for cloud save. native: the Android app runs (cloud save is there only). enabled: Play Games is set up in this
 * build. status: the Play Games sign-in ('checking', 'off' before the first check, 'signed-in', 'signed-out', 'unknown' ...). lastSaved:
 * the time of the last save that went through (ms), 0 for none.
 */
export function cloudNote({ native = true, enabled = true, status = 'signed-out', lastSaved = 0, now = Date.now() } = {}) {
  if (!native) return 'Cloud save is on the Android app, with Play Games.';
  if (!enabled) return 'Cloud save is not on in this build.';
  if (status === 'checking' || status === 'off') return 'Checking Play Games…';
  if (status !== 'signed-in') return 'Sign in to Play Games to save your progress.';
  if (!lastSaved) return 'Cloud save: on (Play Games), not saved yet.';
  const ago = agoWords(now - lastSaved);
  return ago === 'just now' ? 'Cloud save: on (Play Games), last saved just now.' : `Cloud save: on (Play Games), last saved ${ago}.`;
}
