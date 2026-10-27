// The end card's stats and rank lines (requirements 15, 16 and 19) and the loading card's rank line. The words come from here,
// so the tests check them without the game; fillEndCard puts them on the card. Demos keep no stats, and a daily challenge
// has its own board, so their stats line is empty.
import { endLine } from './stats.js?v=7227d0de';
import { easiestOf, isRanked, rankingLabel, shouldPostScores, startRanking } from './ranking.js?v=7227d0de';
import { gameConfig } from './modes.js?v=7227d0de';
import { LEVEL_NAMES } from './boards.js?v=7227d0de';
import { countUp, springOut, reducedMotion } from './motion.js?v=7227d0de';

/** The stats line under the score: "DFW on Normal: best 42 · 7 games". Empty for a demo, a daily, or no game yet. */
export function statsLine(save, { icao, code, levels, demo = false, daily = false }) {
  if (demo || daily) return '';
  const bucket = easiestOf(levels);
  if (!bucket) return '';
  return endLine(save, icao, bucket, code || icao);
}

/**
 * The rank word for a game, with no reason (requirements item 6): "Ranked" or "Unranked" (a practice game is unranked too). A ranked
 * daily reads "Ranked · its own board" on the loading, pause and end cards: the title already reads "Daily #3" (requirements item 4).
 * The reasons stay in the stats and the replay; the player is told only which it is.
 */
export function rankWord(rk) {
  if (!rk) return '';
  if (!isRanked(rk)) return 'Unranked';
  return rk.board === 'daily' ? 'Ranked · its own board' : rankingLabel(rk);
}

/**
 * The rank line on the end card. Unranked games read "Unranked" (rankWord). A ranked game reads
 * "Ranked" until the online boards are live; then it is "saved, posts when online" while it waits, and the rank once the
 * server has taken it: "Ranked · #3 at DFW on Normal this week" (a daily: "Daily challenge · #3 today"). A score the server
 * holds for a spending cap says it posts later (requirement 31). A replay over the server's size cap says it is too long to save,
 * and one the phone could not keep says it could not be saved to post (the player is told why it will not post). posted is null
 * or { state: 'queued' } or { state: 'later' } or { state: 'long' } or { state: 'unsaved' } or { state: 'ranked', rank, total }.
 * total is the number of scores on the same board this week (the server's count); the line reads "#3 of 41" when it is given.
 */
export function rankLine(ranking, { code = '', live = false, posted = null } = {}) {
  const base = rankWord(ranking);
  if (!ranking || !isRanked(ranking) || !shouldPostScores(ranking) || !live || !posted) return base;
  if (posted.state === 'update') return `${base} · update to post scores`;
  if (posted.state === 'queued') return `${base} · saved, posts when online`;
  if (posted.state === 'later') return `${base} · saved, posts later`;
  if (posted.state === 'long') return `${base} · too long to save`;
  if (posted.state === 'unsaved') return `${base} · couldn't save it to post`;
  if (posted.state === 'ranked' && posted.rank) {
    if (ranking.board === 'daily') return `Ranked · #${posted.rank} today`;
    if (ranking.board === 'weekend') {
      const total = Number(posted.total);
      return `Ranked · ${ordinal(posted.rank)}${Number.isFinite(total) && total >= posted.rank ? ` of ${total}` : ''} this weekend`;
    }
    const level = ranking.levels[ranking.levels.length - 1];
    const total = Number(posted.total);
    const of = Number.isFinite(total) && total >= posted.rank ? ` of ${total}` : '';
    return `Ranked · #${posted.rank}${of} at ${code} on ${LEVEL_NAMES[level] || level} this week`;
  }
  return base;
}

/** A rank as its ordinal word: 1st, 2nd, 3rd, 4th, and 11th to 13th as "th" (the weekend's rank line reads "3rd of 41"). */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/**
 * The loading card's rank line, before the game starts: the same rules newGame applies (startRanking on the same settings).
 * Ranked or Unranked, so the player knows before the first plane (requirement 19; the words only, item 6).
 */
export function loadingRankLine({ demo = false, daily = 0, weekend = false, challenge = false, settings = {}, noMap = false, nowMs = Date.now() } = {}) {
  const s = settings || {};
  const cfg = gameConfig({ daily: !!daily || !!weekend, settings: s, nowMs });
  const rk = startRanking({
    demo: !!demo, daily: !!daily, weekend: !!weekend && !daily, challenge: !!challenge && !demo, diff: cfg.diff, departures: daily || weekend ? true : !!s.departures,
    realPlanesOnly: !!s.realPlanesOnly, simOverride: cfg.simOverride, noMap: !demo && !!noMap,
  });
  return rankWord(rk);
}

/** Puts the end card's two lines on the card. The Leaderboard button shows for every game that is not a demo. */
export function fillEndCard({ cell = '', rank = '', board = false }) {
  const c = document.getElementById('over-cell');
  const r = document.getElementById('over-rank');
  const b = document.getElementById('btn-over-board');
  if (c) {
    c.textContent = cell;
    c.hidden = !cell;
  }
  if (r) {
    r.textContent = rank;
    r.hidden = !rank;
  }
  if (b) b.hidden = !board;
}

/** The end card's count-up (ui 10, item 19): the score, the best and the stat numbers count over this many ms. */
export const COUNT_MS = 900;

/**
 * One frame of the count: the number so far (ease-out, never past `to`) and the scale the score springs in with, from 0.9 to 1.
 * springOut overshoots a little near the middle, so the number settles rather than stops dead. `ms` is the time into the count.
 */
export function countFrame(to, ms) {
  const t = Math.max(0, Math.min(1, ms / COUNT_MS));
  return { value: countUp(0, to, t), scale: 0.9 + 0.1 * springOut(t) };
}

// a newer card cancels a count still running from the last game
let countToken = 0;

/**
 * Counts the end card up as it shows: the score, then the best (only when it reads "Best at X: N"; "New best" has no number)
 * and the per-class counts. main.js has written the final numbers already; this reads them and counts from zero. Reduced
 * motion leaves the finals as they are.
 */
export function countEndCard(score, { reduced = reducedMotion(), frame = (f) => requestAnimationFrame(f), now = () => performance.now() } = {}) {
  const token = ++countToken;
  if (reduced || typeof document === 'undefined') return;
  const scoreEl = document.getElementById('over-score');
  const bestEl = document.getElementById('over-best');
  const best = bestEl && !bestEl.classList.contains('new') ? /^(.*?)(\d+)$/.exec(bestEl.textContent) : null;
  const bestHead = best ? best[1] : '';
  const bestTo = best ? Number(best[2]) : 0;
  // each class's count is the text node after its icon (buildStats in main.js)
  const stats = [...document.querySelectorAll('#over-stats .stat')]
    .map((d) => d.lastChild)
    .filter((n) => n && n.nodeType === 3)
    .map((n) => ({ node: n, to: Number(n.nodeValue) }));
  const paint = (ms) => {
    const s = countFrame(score, ms);
    if (scoreEl) {
      scoreEl.textContent = String(s.value);
      scoreEl.style.transform = ms >= COUNT_MS ? '' : `scale(${s.scale})`;
    }
    if (best) bestEl.textContent = bestHead + countFrame(bestTo, ms).value;
    for (const st of stats) st.node.nodeValue = String(countFrame(st.to, ms).value);
  };
  const start = now();
  const tick = () => {
    if (token !== countToken) return;
    const ms = now() - start;
    paint(ms);
    if (ms < COUNT_MS) frame(tick);
  };
  paint(0);
  frame(tick);
}
