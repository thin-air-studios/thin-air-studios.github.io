// The play streak: days in a row on which the player landed a plane (save.streak). Pure logic, no DOM and no clock reads: the
// callers pass today's local day (airportdb.js localDay). Nothing here leaves the phone.
// A day is a whole number on the phone's own calendar, and a game counts for the day of its first landing, at that landing
// (main.js countStreakDay), so the day shows at once and a game left from the pause card counts too. Times of day are never stored.
import { localDay, DAILY_EPOCH } from './airportdb.js?v=7227d0de';

export const MILESTONES = [3, 7, 14, 30, 50, 100];
// Two days in a row may be missed and the run goes on: the next counted game may be up to three days after the last one.
// A third missed day in a row ends the run.
export const SKIP_LIMIT = 2;
export const RUN_GAP = SKIP_LIMIT + 1;
// The day list keeps the last 60 days played: enough for the 14-day strip and for the clock checks below.
export const DAYS_KEPT = 60;
// A clock set back by more than this is a clock error, not a time-zone change: a zone moves the local day by at most two.
export const LARGE_BACK = 2;

const CAP = 100000;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The empty streak: no run and nothing played. storage.js uses it as the default. */
export function emptyStreak() {
  return { last: null, count: 0, best: 0, start: null, days: [], celebrated: 0 };
}

/** The day list kept: the days within DAYS_KEPT of `day`, sorted, with `day` itself in it. */
function keepDays(days, day) {
  const kept = days.filter((d) => d > day - DAYS_KEPT);
  if (!kept.includes(day)) kept.push(day);
  return kept.sort((a, b) => a - b);
}

/**
 * Makes a streak safe to read: storage.js calls it on every load, and a damaged save can hold anything. It never throws;
 * a streak that is not an object becomes the empty one.
 */
export function sanitizeStreak(s) {
  if (!isObj(s)) return emptyStreak();
  const int = (v) => (Number.isInteger(v) ? Math.min(CAP, Math.max(0, v)) : 0);
  const last = Number.isInteger(s.last) && s.last >= 0 ? s.last : null;
  if (last === null) return { ...emptyStreak(), best: int(s.best) };
  const count = Math.max(1, int(s.count));
  const start = Number.isInteger(s.start) && s.start >= 0 && s.start <= last ? s.start : last;
  const days = [...new Set(Array.isArray(s.days) ? s.days : [])]
    .filter((d) => Number.isInteger(d) && d <= last && d > last - DAYS_KEPT)
    .sort((a, b) => a - b);
  return {
    last,
    count,
    best: Math.max(int(s.best), count), // the longest run is never shorter than the run in progress
    start,
    days,
    celebrated: MILESTONES.includes(s.celebrated) ? s.celebrated : 0,
  };
}

/**
 * Counts a game with a landing, on local day `today`. Mutates s and returns the milestone reached, or 0.
 * - The same day again changes nothing: one day, one move.
 * - A gap of one to RUN_GAP days goes on: the count rises by one.
 * - A larger gap starts a new run at a count of one. The days played stay in the list.
 * - A clock set back by up to LARGE_BACK days is a time-zone change, so nothing moves.
 * - A clock set back further is a clock error. The run moves back to the clock's day and keeps its count, so counting
 *   resumes at once. Known limit: if the clock is corrected forward later, a counted game may start a new run.
 * - A clock jump forward of four days or more ends the run, the same as a real four-day gap. Known limit: a jump cannot be
 *   told from a real gap. A jump of one to three days counts the days in between as missed.
 * Time zones: a zone change moves the local day by up to two days. A forward move can take a run to a gap of three, or of
 * two or three for a two-day move, and so end a run that a player kept up the day before. No zone or offset is stored, so
 * this cannot be undone. The 'No landing yesterday' line does not blame anyone for it.
 */
export function recordPlayed(s, today) {
  if (s.last !== null && today <= s.last) {
    if (today === s.last || s.last - today <= LARGE_BACK) return 0;
    s.last = today;
    s.days = keepDays(s.days.filter((d) => d <= today), today);
    s.start = Math.min(s.start === null ? today : s.start, today);
    return 0;
  }
  const gap = s.last === null ? null : today - s.last;
  if (gap !== null && gap <= RUN_GAP) {
    s.count += 1;
  } else {
    s.count = 1;
    s.start = today;
    s.celebrated = 0;
  }
  s.last = today;
  s.best = Math.max(s.best, s.count);
  s.days = keepDays(s.days, today);
  let milestone = 0;
  for (const m of MILESTONES) if (m > s.celebrated && m <= s.count) milestone = m;
  if (milestone) s.celebrated = milestone;
  return milestone;
}

/**
 * The latest local day in the stats (save.stats) on which a game had a landing. Each level's cell keeps the last game of that
 * level and the landings of all its games, so a cell with no landing so far has no counted day. A cell that mixes games
 * with and without a landing can still give its last game's day, one day too late at most (the 2.0 save kept no more).
 */
function lastStatsDay(stats) {
  let latest = null;
  const airports = isObj(stats) && isObj(stats.airports) ? stats.airports : {};
  const note = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const d = localDay(new Date(ms));
    if (latest === null || d > latest) latest = d;
  };
  for (const ap of Object.values(airports)) {
    if (!isObj(ap) || !isObj(ap.levels)) continue;
    for (const cell of Object.values(ap.levels)) if (isObj(cell) && Number.isFinite(cell.landed) && cell.landed > 0) note(cell.last);
  }
  return latest;
}

/**
 * The streak from a 2.0 save, once (storage.js migrateOnce), on local day `today`. The 2.0 save kept only the last day of each
 * airport and level, so this is a lower bound: the 2.0 daily chain (its days are consecutive, and the strip shows them), and at
 * most one later day. A later day that is already past the run's gap is not a run of its own: with no daily chain the save
 * had no streak, and with one, the chain is the run that ended. The daily's best stays as the longest run.
 */
export function seedStreak(save, today) {
  const d = save && save.daily;
  const hasDaily = isObj(d) && Number.isInteger(d.n) && Number.isInteger(d.streak) && d.streak >= 1;
  const last = lastStatsDay(save && save.stats);
  const alive = (day) => today - day <= RUN_GAP;
  const seeded = (lastDay, count, start, days, best = count) => {
    const celebrated = [...MILESTONES].filter((m) => m <= count).pop() || 0; // old counts are not celebrated again
    return sanitizeStreak({ last: lastDay, count, best, start, days, celebrated });
  };
  if (!hasDaily) return last !== null && alive(last) ? seeded(last, 1, last, [last]) : emptyStreak();
  const dailyDay = d.n + DAILY_EPOCH;
  const kept = Math.min(d.streak, DAYS_KEPT);
  const chainStart = dailyDay - d.streak + 1;
  const chain = Array.from({ length: kept }, (_, i) => dailyDay - kept + 1 + i);
  if (last === null || last <= dailyDay) return seeded(dailyDay, d.streak, chainStart, chain);
  if (last - dailyDay <= RUN_GAP) return seeded(last, d.streak + 1, chainStart, [...chain, last]);
  if (alive(last)) return seeded(last, 1, last, [last], d.streak);
  return seeded(dailyDay, d.streak, chainStart, chain);
}

const dayWord = (n) => (n === 1 ? 'day' : 'days');

/**
 * What the streak is on day `today`. Status: none (never played), played (today counted), risk (gap 1 to 3: a day is left to
 * keep it, and `missed` days were skipped) or broken (gap of four or more). The corner, the Streak screen and the Daily tab
 * all read this, so they agree. A broken streak shows 0 and keeps the count it ended at in `ended`.
 */
export function streakState(s, today) {
  if (s.last === null) {
    return { status: 'none', count: 0, gap: null, missed: 0, ended: 0, label: 'New streak', cornerChip: '', ariaLabel: 'New streak. Land a plane today to start one.' };
  }
  // a clock set back further than a time zone (LARGE_BACK) is shown as the next day to play, not as played today: the
  // run is kept, and the next counted game moves it back to the clock (recordPlayed)
  const raw = today - s.last;
  const gap = raw < -LARGE_BACK ? 1 : raw;
  const n = s.count;
  const chipCount = n > 99 ? '99+' : String(n);
  if (gap <= 0) {
    return { status: 'played', count: n, gap, missed: 0, ended: 0, label: 'Streak', cornerChip: chipCount, ariaLabel: `Streak. ${n} ${dayWord(n)}. Played today.` };
  }
  if (gap <= RUN_GAP) {
    const base = { status: 'risk', count: n, gap, missed: gap - 1, ended: 0 };
    if (gap === 1) return { ...base, label: 'Play today', cornerChip: chipCount, ariaLabel: `Play today to keep your streak of ${n} ${dayWord(n)}.` };
    if (gap === 2) return { ...base, label: '2 days left', cornerChip: '??', ariaLabel: `2 days left. No landing yesterday. Streak of ${n} ${dayWord(n)}.` };
    return { ...base, label: 'Last day!', cornerChip: '??', ariaLabel: `Last day! Play today or your streak of ${n} ${dayWord(n)} ends.` };
  }
  return { status: 'broken', count: 0, gap, missed: 0, ended: n, label: 'New streak', cornerChip: '', ariaLabel: 'New streak. Land a plane today to start one.' };
}

/** The one line about the streak (Streak screen, Daily tab, end card), from streakState. */
export function streakLine(st) {
  const n = st.count;
  switch (st.status) {
    case 'none': return 'Land a plane today to start your streak.';
    case 'played': return n === 1 ? 'Day one done. See you tomorrow!' : `${n} days in your streak. See you tomorrow!`;
    case 'risk':
      if (st.gap === 1) return n === 1 ? 'Play today to keep your streak going.' : `Play today to keep your streak of ${n} days going.`;
      if (st.gap === 2) return 'No landing yesterday. Play today to keep your streak.';
      return 'Last day! Play today or your streak ends.';
    default:
      return st.ended === 1
        ? 'Your streak ended at 1 day. Land a plane today to start again.'
        : `Your streak ended at ${st.ended} days. Land a plane today to start again.`;
  }
}

/**
 * The Streak screen's line under the count and its unit: once played, the count is already the big number above it, so the line
 * says only when to come back (streakLine keeps the count for the end card and the Daily tab).
 */
export function streakScreenLine(st) {
  return st.status === 'played' ? 'See you tomorrow!' : streakLine(st);
}

/** The milestone lines for the end card: plain, with the shipped curly apostrophes. */
export const MILESTONE_LINES = {
  3: '3 days in your streak. Nice start!',
  7: '7 days in your streak! You’re a regular.',
  14: '14 days in your streak. Two weeks!',
  30: '30 days in your streak. Brilliant!',
  50: '50 days in your streak. Outstanding!',
  100: '100 days in your streak. Legendary!',
};

/**
 * Whether a milestone plays its fanfare. One fanfare per end card: the promotion's and the new best's fanfares come first,
 * so a milestone that lands on one of those has its line and its haptic, but no sound of its own.
 */
export function celebrateSound({ promoted = false, newBest = false, milestone = 0 } = {}) {
  return milestone > 0 && !promoted && !newBest;
}

/**
 * The strip: the last n days ending on `today`, oldest first. Each glyph is one of:
 * - played: a game with a landing;
 * - hold: a skipped day that kept the streak alive (inside the run, or still inside the gap the streak allows), drawn as a
 *   holding pattern (screens.js);
 * - skipped: a missed day after the run ended, which stays empty;
 * - today: today, not played yet; none: before the run, or today played.
 */
export function cellStates(s, today, n = 14) {
  const playedToday = s.last !== null && s.last >= today;
  // the streak is still on while today is within the allowed gap of its last game (streakState's risk states)
  const alive = s.last !== null && today - s.last <= RUN_GAP;
  const out = [];
  for (let day = today - n + 1; day <= today; day++) {
    let glyph;
    if (s.days.includes(day)) glyph = 'played';
    else if (day === today) glyph = playedToday ? 'none' : 'today';
    else if (s.start !== null && day >= s.start) glyph = day < s.last || alive ? 'hold' : 'skipped';
    else glyph = 'none';
    out.push({ day, glyph });
  }
  return out;
}

/** The next milestone above the count and the days to go; null once every milestone is passed. */
export function nextMilestone(count) {
  const at = MILESTONES.find((m) => m > count);
  return at === undefined ? null : { at, togo: at - count };
}
