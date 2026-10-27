// Stats for every airport at every level (save.stats). A finished game adds to the cell of the easiest level it was
// played at, ranked or not. Demos and daily games make no cell: the daily keeps its own record (save.daily).
import { easiestOf, LEVEL_ORDER } from './ranking.js?v=86c2b44d';
import { BUSIEST } from './airportdb.js?v=86c2b44d';
import { DEMO_AIRPORTS } from './modes.js?v=86c2b44d';

/** The offline "Play now" airports: the one list (modes.js), read by the demo recording, the migration and Play now. */
export { DEMO_AIRPORTS };

const num = (v) => (Number.isFinite(v) ? v : 0);
/** A plain object: what an airport entry or a level cell must be. A damaged save can hold anything else (a number, a list). */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const emptyCell = () => ({ games: 0, best: 0, bestRanked: 0, landed: 0, real: 0, departed: 0, pax: 0, streak: 0, time: 0, last: 0 });

/** The airport's entry in save.stats, made when missing. */
function airportOf(save, icao) {
  if (!save.stats || typeof save.stats !== 'object') save.stats = { airports: {} };
  if (!save.stats.airports || typeof save.stats.airports !== 'object') save.stats.airports = {};
  const airports = save.stats.airports;
  if (!isObj(airports[icao])) airports[icao] = { last: 0, levels: {} };
  if (!isObj(airports[icao].levels)) airports[icao].levels = {};
  return airports[icao];
}

/**
 * Adds a finished game. g = { icao, levels, ranked, score, landed, real, departed, pax, streak, timeS, at, demo, daily, weekend }.
 * Stars and the airport's personal best stay in save.best (gameOver sets them), so this does not touch save.best.
 * A weekend game is counted in the airport's games and its flying totals, and no best: its score is the weekend's own (save.weekend).
 * Returns false when nothing was recorded.
 */
export function recordGame(save, g) {
  if (!g || g.demo || g.daily) return false;
  const level = easiestOf(g.levels);
  if (!level) return false;
  const ap = airportOf(save, g.icao);
  const cell = isObj(ap.levels[level]) ? ap.levels[level] : (ap.levels[level] = emptyCell());
  cell.games += 1;
  if (!g.weekend) {
    cell.best = Math.max(cell.best, num(g.score));
    if (g.ranked) cell.bestRanked = Math.max(cell.bestRanked, num(g.score));
  }
  cell.landed += num(g.landed);
  cell.real += num(g.real);
  cell.departed += num(g.departed);
  cell.pax += num(g.pax);
  cell.streak = Math.max(cell.streak, num(g.streak));
  cell.time += Math.round(num(g.timeS));
  cell.last = Math.max(cell.last, num(g.at));
  ap.last = Math.max(ap.last, num(g.at));
  return true;
}

/**
 * One-time migration (storage.js runs it once, under save.migrations.statsFromBest). Each airport in save.best gets an
 * "earlier" bucket with its best only: the games and levels of 1.x were not recorded. Demo-only airports are skipped.
 * Safe to run again: an airport that already has an earlier bucket is left alone.
 */
export function migrateStats(save, demos = DEMO_AIRPORTS) {
  const best = save.best && typeof save.best === 'object' ? save.best : {};
  const visited = new Set(Array.isArray(save.visited) ? save.visited : []);
  let changed = false;
  for (const icao of Object.keys(best)) {
    if (demos.includes(icao) && !visited.has(icao)) continue;
    const have = save.stats && save.stats.airports && save.stats.airports[icao];
    if (have && have.levels && have.levels.earlier) continue;
    const ap = airportOf(save, icao);
    ap.levels.earlier = { games: null, best: num(best[icao]), bestRanked: null, last: 0 };
    changed = true;
  }
  return changed;
}

/** One airport's cells in level order, then the earlier bucket last. Each has its level key. */
export function cellsFor(save, icao) {
  const levels = (save.stats && save.stats.airports && save.stats.airports[icao] && save.stats.airports[icao].levels) || {};
  const out = LEVEL_ORDER.filter((l) => isObj(levels[l])).map((l) => ({ level: l, ...levels[l] }));
  if (isObj(levels.earlier)) out.push({ level: 'earlier', ...levels.earlier });
  return out;
}

/** One airport's cell at one level (the level's own cell, never the earlier bucket), or null. */
export function cellOf(save, icao, level) {
  const levels = (save.stats && save.stats.airports && save.stats.airports[icao] && save.stats.airports[icao].levels) || {};
  return level !== 'earlier' && isObj(levels[level]) ? levels[level] : null;
}

/**
 * The level the player has played most at an airport (its games at each level, ties to the easier one), or null when
 * there is no level game there. Leaderboards opens on it, so "your best and rank" are for the level played most.
 */
export function topLevel(save, icao) {
  let top = null;
  for (const c of cellsFor(save, icao)) {
    if (c.level === 'earlier') continue;
    if (!top || c.games > top.games) top = c;
  }
  return top ? top.level : null;
}

/**
 * The airport and level the player plays most: the airport with the most games (ties to the one played last, as
 * airportRows orders them), then its top level (topLevel). Null when no level game is recorded.
 */
export function mostPlayed(save) {
  let best = null;
  for (const r of airportRows(save)) {
    if (r.games === null) continue;
    if (!best || r.games > best.games) best = { icao: r.icao, games: r.games };
  }
  return best ? { icao: best.icao, level: topLevel(save, best.icao) } : null;
}

const cap = (level) => level.charAt(0).toUpperCase() + level.slice(1);

/**
 * The end-screen stats line. level is the game's stats bucket (easiestOf). code is the name the screens show (DFW for
 * KDFW); it defaults to the ICAO code.
 *   "DFW on Normal: best 42 · 7 games"  (one game: "1 game")
 *   "DFW: earlier games (level not recorded) · best 31"
 * Empty when the airport has no stats.
 */
export function endLine(save, icao, level, code = icao) {
  const levels = (save.stats && save.stats.airports && save.stats.airports[icao] && save.stats.airports[icao].levels) || {};
  const cell = level !== 'earlier' && isObj(levels[level]) ? levels[level] : null;
  if (cell) {
    const games = cell.games === 1 ? '1 game' : `${cell.games} games`;
    return `${code} on ${cap(level)}: best ${cell.best} · ${games}`;
  }
  if (isObj(levels.earlier)) return `${code}: earlier games (level not recorded) · best ${levels.earlier.best}`;
  return '';
}

/**
 * "Your airports" rows: every airport with stats, newest played first, airports with only earlier games last.
 * games is the total of the real level cells, or null when there are none. best is save.best (the stars' source).
 */
export function airportRows(save) {
  const airports = (save.stats && save.stats.airports) || {};
  const rows = [];
  for (const icao of Object.keys(airports)) {
    const cells = cellsFor(save, icao);
    if (!cells.length) continue;
    const real = cells.filter((c) => c.level !== 'earlier');
    rows.push({
      icao,
      last: num(airports[icao].last),
      games: real.length ? real.reduce((n, c) => n + c.games, 0) : null,
      earlier: cells.some((c) => c.level === 'earlier'),
      best: num((save.best || {})[icao]),
      cells,
    });
  }
  return rows.sort((a, b) => (a.games === null) - (b.games === null) || b.last - a.last || (a.icao < b.icao ? -1 : a.icao > b.icao ? 1 : 0));
}

/** How many of the world's 50 busiest airports the player has played (demo-only airports do not count). */
export function visitedBusiest(save) {
  const demos = new Set(DEMO_AIRPORTS);
  const visited = Array.isArray(save.visited) ? save.visited : [];
  const seen = new Set([...visited, ...Object.keys(save.best || {}).filter((c) => !demos.has(c))]);
  return BUSIEST.filter(([c]) => seen.has(c)).length;
}

/** "0 min" under a minute, "45 min", "1 h 20 min", "2 h". */
export function fmtDuration(seconds) {
  const mins = Math.floor(Math.max(0, num(seconds)) / 60);
  if (mins < 1) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
