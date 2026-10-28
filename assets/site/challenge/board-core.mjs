// The challenge board page: the pure parts, shared by the browser (board.mjs, served at /assets/site/challenge/board-core.mjs) and
// the tests (tools/site/challenge.test.mjs). Nothing here touches the DOM.
// The server is server/src/board.js: GET /v1/board?board=challenge&id=<id>. The id is the twelve characters a challenge link carries in
// its path: lower-case RFC 4648 base32 (server/src/replay/challenge.js CHALLENGE_ID). No request is made for any other id.
// The page asks for nothing with a header or a credential, so the request needs no preflight and sends nothing of the visitor's.

export const API_BASE = 'https://api.playshortfinal.com';
export const ID_PATTERN = /^[a-z2-7]{12}$/;
export const TOP = 10;
export const LEVELS = Object.freeze(['beginner', 'easy', 'normal', 'hard', 'chaos']);
/** The game's one-letter level codes in a challenge link's l= part (game/js/links.js CHALLENGE_LEVEL_CODES). */
export const LEVEL_CODES = Object.freeze({ b: 'beginner', e: 'easy', n: 'normal', h: 'hard', c: 'chaos' });
export const APP_ID = 'com.thinaircapital.holdingpattern';
/** The query parts a challenge link carries (game/js/links.js challengeLinkFor). Anything else in an address is not passed on. */
export const PARTS = Object.freeze(['a', 'c', 'l', 's', 'w', 'sc', 'lo', 'v', 'k', 'x', 'n', 'fh', 'sa']);
const ICAO = /^[A-Z0-9][A-Z0-9-]{1,9}$/;

/** The challenge id in a board address (/c/<id>/ or /c/<id>), or null when the path is not one or the id does not match the rule. */
export function idFromPath(pathname) {
  const m = /^\/c\/([^/]+)\/?$/.exec(String(pathname || ''));
  if (!m || !ID_PATTERN.test(m[1])) return null;
  return m[1];
}

/** The board address for one id. Throws for an id the server would refuse, so no request goes out for it. */
export function boardUrl(id, base = API_BASE) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new RangeError('id');
  return `${base}/v1/board?board=challenge&id=${id}`;
}

/** The challenge parts of an address's query, in the order the link has them (PARTS only). */
export function partsOf(search) {
  const from = new URLSearchParams(search || '');
  const out = new URLSearchParams();
  for (const [key, value] of from) if (PARTS.includes(key)) out.append(key, value);
  return out;
}

/** True when the address carries challenge parts: the page was opened from a challenge link. */
export function hasParts(search) {
  return [...partsOf(search)].length > 0;
}

/** The airport code of a challenge link (a=), upper case; '' when there is none or it is not a code. */
export function airportOf(search) {
  const a = (new URLSearchParams(search || '').get('a') || '').trim().toUpperCase();
  return ICAO.test(a) ? a : '';
}

/** The level of a challenge link (l=, the game's one-letter code); '' when there is none or it is not one. */
export function levelOfParts(search) {
  const code = new URLSearchParams(search || '').get('l') || '';
  return Object.prototype.hasOwnProperty.call(LEVEL_CODES, code) ? LEVEL_CODES[code] : '';
}

/**
 * The board answer as the page shows it: { icao, level, total, rows: [{ rank, name, score }] } with at most TOP rows. The airport and
 * the level are the first valid ones in the rows (every row of a challenge board is the same airport and level). Throws for an answer that is not a
 * board, so the page shows its error state.
 */
export function shapeBoard(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.rows)) throw new TypeError('board');
  const rows = json.rows.slice(0, TOP).map((r, i) => ({
    rank: r && Number.isInteger(r.rank) && r.rank > 0 ? r.rank : i + 1,
    name: r && typeof r.name === 'string' ? r.name.trim() : '',
    score: r && Number.isFinite(r.score) ? Math.round(r.score) : 0,
    icao: r && typeof r.icao === 'string' && ICAO.test(r.icao) ? r.icao : '',
    level: r && LEVELS.includes(r.level) ? r.level : '',
  }));
  const total = Number.isInteger(json.total) && json.total >= 0 ? json.total : rows.length;
  const withIcao = rows.find((r) => r.icao) || {};
  const withLevel = rows.find((r) => r.level) || {};
  return { icao: withIcao.icao || '', level: withLevel.level || '', total, rows: rows.map(({ rank, name, score }) => ({ rank, name, score })) };
}

/** A score as the game's board shows it: the whole number, with no separators. */
export function formatScore(score) {
  return Number.isFinite(score) ? String(Math.round(score)) : '';
}

/** True for an Android browser, the only place the game installs (the Play button then opens the app). */
export function isAndroid(userAgent) {
  return /\bAndroid\b/i.test(String(userAgent || ''));
}

/**
 * The Android intent that opens this challenge in the app, with the Play listing as the fallback for a phone without the app. The
 * address's own challenge parts travel with it (the same parts the game reads from the https link); nothing else does.
 */
export function appIntent(id, search, fallbackUrl) {
  if (!ID_PATTERN.test(id || '')) throw new RangeError('id');
  const parts = partsOf(search).toString();
  const path = `/c/${id}/${parts ? `?${parts}` : ''}`;
  return `intent://playshortfinal.com${path}#Intent;scheme=https;package=${APP_ID};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}
