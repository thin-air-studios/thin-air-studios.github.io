// The airport top-controllers panel: the pure parts, shared by the browser (boards.mjs, served at /assets/site/boards-core.mjs)
// and the tests (tools/site/boards.test.mjs). Nothing here touches the DOM.
// The Worker's side is server/src/board.js: GET /v1/board?board=level&icao&level&period=week&localDay. It needs no sign-in, so the
// request carries no headers and no credentials. A row's name is a player's name only when the player chose to show it; otherwise
// the Worker sends "Pilot NNNN" (names/callsign.js).

export const API_BASE = 'https://api.playshortfinal.com';
export const LEVELS = Object.freeze(['beginner', 'easy', 'normal', 'hard', 'chaos']);
export const TOP = 5;
const ICAO = /^[A-Z0-9]{3,5}$/;
const DAY_MS = 86400000;
const ERROR = Object.freeze({ state: 'error', rows: Object.freeze([]), total: 0 });

/** The address of one level's week board for one airport (localDay: the airport's local day number, see localDayIn). */
export function boardUrl({ base = API_BASE, icao, level, localDay } = {}) {
  if (!ICAO.test(icao || '')) throw new RangeError('icao');
  if (!LEVELS.includes(level)) throw new RangeError('level');
  if (!Number.isInteger(localDay) || localDay < 0) throw new RangeError('localDay');
  return `${base}/v1/board?board=level&icao=${icao}&level=${level}&period=week&localDay=${localDay}`;
}

/** The local calendar day in zone at instant ms, as a day number (days since 1970). Same rule as the game and server/src/periods.js. */
export function localDayIn(zone, ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS);
}

/** A score as the game's board shows it: the whole number, with no separators. */
export function formatScore(score) {
  if (score === null || score === undefined || score === '') return '';
  const n = Number(score);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
}

/** A rank as the game shows it: "1", "2" ... ('' for anything that is not a rank). */
export function formatRank(rank) {
  const n = Number(rank);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
}

/** A name as the Worker sent it, trimmed. The page sets it as text, never as markup. */
export function formatName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

/**
 * One board response as the panel uses it: state 'ok' (rows), 'empty' (a valid board with no rows) or 'error' (anything else).
 * Only the top TOP rows are kept; a row without a rank, name or score is left out.
 */
export function summarize(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.rows)) return ERROR;
  const rows = json.rows
    .slice(0, TOP)
    .map((r) => ({ rank: formatRank(r && r.rank), name: formatName(r && r.name), score: formatScore(r && r.score) }))
    .filter((r) => r.rank && r.name && r.score !== '');
  const total = Number.isInteger(json.total) && json.total >= 0 ? json.total : 0;
  return { state: rows.length ? 'ok' : 'empty', rows, total };
}

/** The level the panel opens on: the one with the most players this week. Normal when none has any, or when Normal ties for the most. */
export function defaultLevel(results) {
  let best = 'normal';
  let bestTotal = Number(results?.normal?.total) || 0;
  for (const level of LEVELS) {
    const total = Number(results?.[level]?.total) || 0;
    if (total > bestTotal) {
      best = level;
      bestTotal = total;
    }
  }
  return best;
}

/**
 * What the panel shows for the selected level, given every level's summary.
 * show: false when no level answered (the panel stays hidden: failing quietly). empty: null, 'all' (nobody has played at this
 * airport this week), 'level' (nobody has played this level here this week, others have) or 'failed' (the selected level's request
 * failed while others answered: the panel says so, with no rows).
 */
export function panelFor(results, level) {
  const answered = LEVELS.filter((l) => results?.[l] && results[l].state !== 'error');
  if (!answered.length) return { show: false, rows: [], total: 0, empty: null };
  const selected = results[level] || ERROR;
  if (selected.state === 'ok') return { show: true, rows: selected.rows, total: selected.total, empty: null };
  if (selected.state === 'error') return { show: true, rows: [], total: 0, empty: 'failed' };
  const nobodyAnywhere = LEVELS.every((l) => results[l] && results[l].state === 'empty');
  return { show: true, rows: [], total: 0, empty: nobodyAnywhere ? 'all' : 'level' };
}

/**
 * The week's boards for an airport, kept in memory for the page's life. A board is fetched once per level and local day. A
 * failed request is not kept, so the next call asks again. getJson(url) resolves the parsed JSON or rejects.
 */
export function createBoardCache({ getJson, base = API_BASE } = {}) {
  const entries = new Map();

  function week(icao, level, localDay) {
    const url = boardUrl({ base, icao, level, localDay });
    if (!entries.has(url)) {
      const pending = Promise.resolve()
        .then(() => getJson(url))
        .then(summarize)
        .catch(() => ERROR)
        .then((summary) => {
          if (summary.state === 'error') entries.delete(url);
          return summary;
        });
      entries.set(url, pending);
    }
    return entries.get(url);
  }

  /** Every level's summary, keyed by level. */
  function all(icao, localDay) {
    return Promise.all(LEVELS.map((level) => week(icao, level, localDay).then((summary) => [level, summary]))).then(Object.fromEntries);
  }

  return { week, all, size: () => entries.size };
}
