// The Achievements screen's numbers, pure: the controller's rank and its bar, the lifetime totals, each badge's progress
// and the date it was earned. The "in one game" badges read save.gameBest (the most in any one game), not lifetime totals,
// so a badge is never met by adding up several games.
import { ACHIEVEMENTS, RANKS, rankFor } from './achievements.js?v=2f66fd5f';
import { visitedBusiest } from './stats.js?v=2f66fd5f';

const num = (v) => (Number.isFinite(v) ? v : 0);
const groups = (n) => String(Math.floor(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const gb = (save, key) => num((save.gameBest || {})[key]);
const bestScore = (save) => Math.max(0, ...Object.values(save.best || {}).map(num));
const bestDays = (save) => num(save.streak && save.streak.best); // days in a row: the play streak (streak.js), not clean landings

/**
 * The countable badges: how far the player is (value), the goal, and the bar's words. Each text takes n and g already
 * formatted. Badges not listed here are yes-or-no (they say what to do, in their description).
 */
const COUNTS = {
  heavy5: { goal: 5, value: (s) => gb(s, 'heavy5'), text: (n, g) => `best game: ${n} of ${g} heavies` },
  dep5: { goal: 5, value: (s) => gb(s, 'dep5'), text: (n, g) => `best game: ${n} of ${g} departures` },
  live10: { goal: 10, value: (s) => gb(s, 'live10'), text: (n, g) => `best game: ${n} of ${g} real planes` },
  streak10: { goal: 10, value: (s) => num(s.bestStreak), text: (n, g) => `best streak ${n} of ${g}` },
  streak25: { goal: 25, value: (s) => num(s.bestStreak), text: (n, g) => `best streak ${n} of ${g}` },
  night: { goal: 15, value: (s) => gb(s, 'night'), text: (n, g) => `best game: ${n} of ${g} after dark` },
  wet: { goal: 10, value: (s) => gb(s, 'wet'), text: (n, g) => `best game: ${n} of ${g} in rain or snow` },
  storm: { goal: 10, value: (s) => gb(s, 'storm'), text: (n, g) => `best game: ${n} of ${g} with a storm on the scope` },
  score50: { goal: 50, value: bestScore, text: (n, g) => `best score ${n} of ${g}` },
  score100: { goal: 100, value: bestScore, text: (n, g) => `best score ${n} of ${g}` },
  busy5: { goal: 5, value: visitedBusiest, text: (n, g) => `${n} of ${g} busiest airports` },
  busy20: { goal: 20, value: visitedBusiest, text: (n, g) => `${n} of ${g} busiest airports` },
  busy50: { goal: 50, value: visitedBusiest, text: (n, g) => `${n} of ${g} busiest airports` },
  pax10k: { goal: 10000, value: (s) => num(s.pax), text: (n, g) => `${n} of ${g} passengers` },
  pax100k: { goal: 100000, value: (s) => num(s.pax), text: (n, g) => `${n} of ${g} passengers` },
  streak7: { goal: 7, value: bestDays, text: (n, g) => `longest streak ${n} of ${g} days` },
  streak30: { goal: 30, value: bestDays, text: (n, g) => `longest streak ${n} of ${g} days` },
  streak100: { goal: 100, value: bestDays, text: (n, g) => `longest streak ${n} of ${g} days` },
};

/**
 * One badge's progress. { kind: 'count', value, goal, fraction, text } for a countable badge (value is capped at the goal
 * for the bar, the text shows the real number up to the goal); { kind: 'yes' } for the rest.
 */
export function progressFor(a, save) {
  const rule = COUNTS[a.id];
  if (!rule) return { kind: 'yes' };
  const raw = Math.max(0, Math.floor(rule.value(save)));
  const value = Math.min(raw, rule.goal);
  return {
    kind: 'count',
    value,
    goal: rule.goal,
    fraction: value / rule.goal,
    text: rule.text(groups(value), groups(rule.goal)),
  };
}

/** The lifetime numbers at the top of the screen. */
export function totals(save) {
  return {
    games: num(save.played),
    landed: num(save.landed),
    real: num(save.landedLive),
    passengers: num(save.pax),
    bestStreak: num(save.bestStreak),
  };
}

/**
 * The rank bar: the fraction of the way from this rank to the next, and the line under it. At the top rank there is no
 * next one and the bar is full.
 */
export function rankProgress(landed) {
  const r = rankFor(num(landed));
  const top = r.index >= RANKS.length - 1;
  const from = RANKS[r.index][0];
  const to = top ? from : RANKS[r.index + 1][0];
  const fraction = top ? 1 : Math.min(1, Math.max(0, (num(landed) - from) / (to - from)));
  const line = top ? `${r.name}: the top of the tower.` : `${r.next} landings to ${r.nextName}`;
  return { name: r.name, fraction, top, line };
}

/** "10 Oct 2026" (the phone's own calendar day), for an earned badge. Empty for a badge not yet earned. */
export function earnedLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Records the most in one game (save.gameBest keeps the best game for each of the five counts and the departures).
 * counts: { heavy, night, wet, storm, live, departed }, each the game's own number. Returns the updated record.
 */
export function bestInGame(save, counts = {}) {
  if (!save.gameBest || typeof save.gameBest !== 'object') save.gameBest = {};
  const keys = { heavy5: 'heavy', night: 'night', wet: 'wet', storm: 'storm', live10: 'live', dep5: 'departed' };
  for (const [key, from] of Object.entries(keys)) {
    save.gameBest[key] = Math.max(num(save.gameBest[key]), num(counts[from]));
  }
  return save.gameBest;
}

/** Badges that are earned, in the order they were won, then the rest in the catalogue's order. */
export function orderedBadges(save) {
  const earned = save.ach || {};
  return [...ACHIEVEMENTS].sort((p, q) => (earned[p.id] ? 0 : 1) - (earned[q.id] ? 0 : 1) || num(earned[p.id]) - num(earned[q.id]));
}

export const badgeCount = (save) => ACHIEVEMENTS.filter((a) => (save.ach || {})[a.id]).length;
export { groups };
