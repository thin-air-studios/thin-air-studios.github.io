import { WEB_DEMO } from './flavor.js?v=7227d0de';
// The online boards, on the phone (server/README.md has the Worker's side): the board address, the state a board shows,
// the Play Games board for each tab, the catch-up a Play Games sign-in posts, and the calls to the Worker. Nothing here
// touches the DOM. The calls take their transport from the caller (tests pass fakes); the game passes net.js for GET and
// POST, and fetch for the layout's PUT (net.js only sends GET and POST, with text bodies).
import { BOARDS } from './config.js?v=7227d0de';
import { http as netHttp } from './net.js?v=7227d0de';
import tzlookup from './vendor/tz.js?v=7227d0de';

export const LEVEL_NAMES = Object.freeze({ beginner: 'Beginner', easy: 'Easy', normal: 'Normal', hard: 'Hard', chaos: 'Chaos' });
export const LEVELS = Object.freeze(Object.keys(LEVEL_NAMES));
export const PERIODS = Object.freeze(['today', 'week', 'all']);

const ICAO = /^[A-Z0-9]{3,5}$/;
const DAY_MS = 86400000;

// Whether the online boards are open. config.js BOARDS.live is the build's default (false). The server says whether its boards
// are open (GET /v1/health, boards.live, from the wrangler var BOARDS_LIVE), and the phone reads that answer at most once a day,
// so the boards open without a new build. Viewing needs no sign-in; a post is checked where it is sent (outbox.js).
const LIVE_KEY = 'holdingpattern.boardsLive.v1';
let known = readKnown(); // { live, at }: the server's last answer and when it was read, or null

function readKnown() {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(LIVE_KEY));
    return v && typeof v.live === 'boolean' && Number.isFinite(v.at) ? v : null;
  } catch (_) {
    return null; // no store, or a private window: the answer is asked for again
  }
}

function writeKnown(v) {
  if (WEB_DEMO) return;
  try {
    globalThis.localStorage.setItem(LIVE_KEY, JSON.stringify(v));
  } catch (_) { /* kept for this launch only */ }
}

/** Whether the online boards are open on this phone now: the build's switch, or the server's last answer. Synchronous. */
export function boardsLive() {
  if (WEB_DEMO) return false; // the demo has no boards: nothing is read or posted (DECISIONS 446)
  return BOARDS.live || !!(known && known.live);
}

let reading = null;

/**
 * Reads the server's answer when none is held or the one held is more than a day old. Resolves boardsLive(). A failed read
 * keeps the answer held, and the next call tries again.
 */
export function refreshBoardsLive({ base = BOARDS.base, send = netHttp, now = Date.now(), force = false } = {}) {
  if (WEB_DEMO) return Promise.resolve(false);
  if (BOARDS.live || (!force && known && now - known.at < DAY_MS)) return Promise.resolve(boardsLive());
  if (!reading) reading = readHealth(base, send, now).finally(() => { reading = null; });
  return reading;
}

async function readHealth(base, send, now) {
  try {
    const r = parseResponse(await send('GET', `${base}/v1/health`, { headers: {}, timeoutMs: 8000 }));
    if (r.status === 200 && r.json && r.json.boards && typeof r.json.boards === 'object') {
      known = { live: r.json.boards.live === true, at: now };
      writeKnown(known);
    }
  } catch (_) { /* no answer: the answer held stands */ }
  return boardsLive();
}

/** The Play Games board for each level, the daily challenge and the passengers (games-ids.xml names them). */
export const PLAY_GAMES_BOARDS = Object.freeze({
  beginner: 'leaderboard_best_score_beginner',
  easy: 'leaderboard_best_score_easy',
  normal: 'leaderboard_best_score_normal',
  hard: 'leaderboard_best_score_hard',
  chaos: 'leaderboard_best_score_chaos',
  daily: 'leaderboard_daily_challenge',
  passengers: 'leaderboard_passengers_landed',
});

/** The Play Games board for a level, or the daily one. Null for an unknown level. */
export function playGamesBoardFor(level, daily = false) {
  return daily ? PLAY_GAMES_BOARDS.daily : PLAY_GAMES_BOARDS[level] || null;
}

/** The words on the boards and their sheets, in one place (the tests read them; the screens show them). */
export const COPY = Object.freeze({
  preLaunch: 'World leaderboards open at launch.',
  dailyPreLaunch: 'Daily boards open at launch. Your streak is below.',
  offline: "You're offline. Boards need a connection.",
  error: "The boards aren't answering right now.",
  empty: 'No ranked scores here yet.',
  update: 'Update to post scores.',
  explainer: 'Ranked games only: one level, no changes mid-game. Scores post when online.',
  footnote: "Days and weeks follow the airport's local time. Weeks start Monday.",
  blocked: "This name didn't pass our name check, so you're shown as Pilot 4821. Your score still counts.",
  report: 'Report name',
  reported: 'Thanks. Reports are counted.',
  removeAsk: 'Remove all your scores from the online boards? Your stats on this phone stay.',
  remove: 'Remove my scores',
  removed: 'Your scores are off the online boards.',
  cancel: 'Cancel',
});

/** The airport's time zone, from its position (the zone the clock on the loading card uses). */
export function airportZone(info) {
  try {
    return (info && tzlookup(info.lat, info.lon)) || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

/**
 * The local calendar day in zone tz at instant ms, as a day number (days since 1970). The server counts the same way
 * (server/src/periods.js), so the day a board asks for is the day a score was filed under.
 */
export function localDayIn(tz, ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS);
}

/**
 * The address of one board. It names the board, the airport, the level, the period and the airport-local day, and
 * nothing that identifies the player (requirement 16, screens F17). period is today, week or all; a daily board takes its
 * day number instead.
 */
export function boardUrl({ base = BOARDS.base, board = 'level', icao, level, period = 'week', localDay, day } = {}) {
  if (board === 'daily') {
    if (!Number.isInteger(day) || day < 0) throw new RangeError('day');
    return `${base}/v1/board?board=daily&day=${day}`;
  }
  if (board === 'weekend') {
    if (!Number.isInteger(day) || day < 0) throw new RangeError('day');
    return `${base}/v1/board?board=weekend&day=${day}`;
  }
  if (board !== 'level') throw new RangeError('board');
  if (!ICAO.test(icao || '')) throw new RangeError('icao');
  if (!LEVELS.includes(level)) throw new RangeError('level');
  if (!PERIODS.includes(period)) throw new RangeError('period');
  let q = `board=level&icao=${icao}&level=${level}&period=${period}`;
  if (period !== 'all') {
    if (!Number.isInteger(localDay) || localDay < 0) throw new RangeError('localDay');
    q += `&localDay=${localDay}`;
  }
  return `${base}/v1/board?${q}`;
}

/**
 * The state a board shows, from one response. 'pre-launch' is decided before any request (boards not live): nothing is
 * sent. A failed request (status 0) is 'offline'; any other failure, or a body that is not a board, is 'error'.
 */
export function boardState(res, { live = boardsLive() } = {}) {
  if (!live) return 'pre-launch';
  if (!res || res.status === 0) return 'offline';
  if (res.status !== 200 || !res.json || !Array.isArray(res.json.rows)) return 'error';
  return res.json.rows.length ? 'ok' : 'empty';
}

/** A response as { status, json }: json is null when the body is not JSON. */
export function parseResponse(res) {
  let json = null;
  try {
    json = JSON.parse(res.text);
  } catch (_) { /* not JSON: json stays null */ }
  return { status: res.status, json };
}

/** A name the server replaced with a callsign ("Pilot 4821"): the player's own row says why (COPY.blocked). */
export const isCallsign = (name) => /^Pilot \d{4}$/.test(String(name || ''));

/**
 * One board, for the screens. token goes only with the caller's own rank (13 and up, signed in): a board request
 * otherwise carries no header at all. Resolves { state, rows, you, status }.
 */
export async function fetchBoard(params, { live = boardsLive(), base = BOARDS.base, token = null, send = netHttp, timeoutMs = 8000, online = true } = {}) {
  if (!live) return { state: 'pre-launch', rows: [], you: null, status: null };
  if (!online) return { state: 'offline', rows: [], you: null, status: 0 };
  const url = boardUrl({ ...params, base });
  const res = await send('GET', url, { headers: token ? { authorization: `Bearer ${token}` } : {}, timeoutMs });
  const r = parseResponse(res);
  const state = boardState(r, { live: true });
  const ok = state === 'ok' || state === 'empty';
  return { state, rows: ok ? r.json.rows : [], you: ok && r.json.you ? r.json.you : null, status: r.status };
}

/** PUT for the layout's bytes: fetch, because net.js only sends GET and POST with text bodies (the native shell too). */
async function fetchBytes(method, url, { headers, bytes, timeoutMs }) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  try {
    const r = await fetch(url, { method, headers, body: bytes, signal: ctl ? ctl.signal : undefined });
    return { status: r.status, headers: {}, text: await r.text() };
  } catch (e) {
    return { status: 0, headers: {}, text: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The calls the phone makes to the Worker. Each resolves { status, json }; a network failure is status 0. Paths and
 * bodies are the ones in server/README.md.
 */
export function makeApi({ base = BOARDS.base, send = netHttp, sendBytes = fetchBytes, timeoutMs = 20000 } = {}) {
  const call = async (method, path, { token = null, body = null, bytes = null } = {}) => {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    let res;
    if (bytes) {
      headers['content-type'] = 'application/octet-stream';
      res = await sendBytes(method, base + path, { headers, bytes, timeoutMs });
    } else {
      if (body !== null) headers['content-type'] = 'application/json';
      res = await send(method, base + path, { headers, body: body === null ? '' : JSON.stringify(body), timeoutMs });
    }
    return parseResponse(res);
  };
  return {
    call,
    session: (serverAuthCode, webClientId) => call('POST', '/v1/session', { body: { serverAuthCode, webClientId } }),
    score: (token, body) => call('POST', '/v1/score', { token, body }),
    putLayout: (token, hash, bytes) => call('PUT', `/v1/layouts/${hash}`, { token, bytes }),
    report: (token, rowId) => call('POST', '/v1/report', { token, body: { rowId } }),
    removeMine: (token) => call('POST', '/v1/remove-my-scores', { token, body: {} }),
    prefs: (token, showName) => call('POST', '/v1/prefs', { token, body: { showName: !!showName } }),
    // the trial's first day across a reinstall (firstday.js): the device hash and the phone's first day, no ID (2.8)
    firstDay: (hash, day) => call('POST', '/v1/first-day', { body: { h: hash, d: day } }),
    // World stats (3.1; worldstats.js, DECISIONS 384): the note a finished game sends, and the counts
    statsGame: (body) => call('POST', '/v1/stats/game', { body }),
    stats: () => call('GET', '/v1/stats'),
    // a daily challenge's score histogram (3.2, DECISIONS 400): the end card's percentile
    statsDaily: (daily) => call('GET', `/v1/stats/daily?daily=${encodeURIComponent(String(daily))}`),
  };
}

/**
 * What a Play Games sign-in posts once: each level's best ranked score at any airport (the per-level bests, never the
 * all-games best or the unranked ones), and the lifetime passengers of ranked games (save.paxRanked).
 */
export function catchUpPayload(save) {
  const airports = Object.values((save.stats && save.stats.airports) || {});
  const levels = {};
  for (const l of LEVELS) {
    levels[l] = Math.max(0, ...airports.map((a) => (a.levels && a.levels[l] ? Number(a.levels[l].bestRanked) || 0 : 0)));
  }
  return { levels, passengers: Math.max(0, Number(save.paxRanked) || 0) };
}
