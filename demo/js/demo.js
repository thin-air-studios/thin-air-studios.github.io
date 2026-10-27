// The browser demo's rules and words (DECISIONS 445 to 454). No DOM, no network, and no storage of its own: the tests can read them.
// The demo is the game built with WEB_DEMO true (flavor.js); the app never reaches the demo's branches, and these rules are only asked
// from them. The words are in the game's own voice and are the demo's only words on its screens.

import { STORE_URL } from './links.js?v=86c2b44d';

// the game-time cap, in the sim's seconds: ten minutes. Paused time is not counted (the sim does not step while paused).
export const DEMO_GAME_S = 600;
// the website's map is waited for this long at the start (the app waits START_WAIT_MS, 2 s, because it can fall back to a server)
export const DEMO_MAP_WAIT_MS = 8000;
// the install referrer's source for every link the demo makes (links.js shareLinkFor)
export const DEMO_SOURCE = 'web-demo';
// the free games a day in this browser (DECISIONS 454; the same number as the app's free games, pro.js FREE_GAMES)
export const DEMO_FREE_GAMES = 3;
// the browser storage key of the day's record: one small object, { day, n } (see demoDayCount)
export const DEMO_STORAGE_KEY = 'short-final-demo';
// the key demoStorageWorks writes and removes at once, to see whether the browser's store takes a write (once per page load)
export const DEMO_PROBE_KEY = 'short-final-demo-probe';
// the API host the demo's copy uses for the online boards (tools/build-demo.mjs writes it into the copy's config.js; the app keeps its own)
export const DEMO_API_BASE = 'https://api.playshortfinal.com';

export const DEMO_WORDS = Object.freeze({
  homeNote: 'Web demo: 3 free games a day. No sign-in, no scores.',
  homeNoteOnce: 'Web demo: 1 free game per page load. No sign-in, no scores.', // when the browser keeps no count (blocked or read-only storage)
  search: 'Search airports',
  playTitle: 'Play',
  playPlace: 'Random busy airport',
  playLeft3: '3 free games today',
  playLeft2: '2 free games left today',
  playLeft1: '1 free game left today',
  afterTitle: 'Get the app',
  afterPlace: 'Back tomorrow, or get the app',
  afterNote: 'Free on Google Play',
  feedHome: 'No real planes here: the planes are simulated.',
  loadingTitle: 'Demo',
  loadingStatus: 'Getting the airport ready…',
  loadingRank: 'Demo game · no scores posted',
  mix: 'Simulated planes',
  mixShort: 'Simulated',
  weather: 'Simulated weather',
  feedHead: 'Simulated planes',
  about: 'About these planes',
  feedStatus: 'No real planes in the demo. The app has them.',
  rank: 'Demo game · no scores posted',
  inviteTitle: 'Liked it?',
  invite: 'The app has real planes at every airport, daily challenges and friends’ challenges. It is free on Google Play.',
  inviteButton: 'Get Short Final free on Google Play',
  overDemo: 'Demo over',
  overTime: 'Time’s up for the demo',
  usedUp: 'The day’s free games are used. Back tomorrow, or get the app.', // a Play tap once the day's games are used
  skipMap: 'Playing on the runways.', // the player pressed Play on runways now
  mapFailed: 'The map did not load. Playing on the runways.', // any other failure: a missing, slow or unreachable map
  turnTitle: 'Turn your phone sideways',
  turnText: 'Short Final plays in landscape. Turn your phone to play the demo.',
  turnButton: 'Get it on Google Play',
  unsupportedTitle: 'This browser can’t run the demo.',
  unsupportedButton: 'Get Short Final free on Google Play',
  planes: (n) => (n === 0 ? 'No planes landed. All simulated.' : n === 1 ? '1 plane landed. All simulated.' : `${n} planes landed. All simulated.`),
});

/**
 * A link to the game's Google Play page from the demo, with the install referrer `utm_source=web-demo&utm_medium=<medium>&utm_campaign=
 * <campaign>` (links.js shareLinkFor makes the same shape for a share). The end card's invite passes medium 'share' and the airport.
 */
export function demoStoreUrl({ medium = 'web', campaign = 'home' } = {}) {
  const referrer = `utm_source=${DEMO_SOURCE}&utm_medium=${medium}&utm_campaign=${campaign}`;
  return `${STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}

/** The website's own pages the demo's About sheet opens (Terms and the policy are not copied into the demo, DECISIONS 446). */
export const DEMO_LEGAL_URLS = Object.freeze({
  terms: 'https://playshortfinal.com/terms/',
  privacy: 'https://playshortfinal.com/privacy/',
});

/**
 * The airports the demo offers: the rows (airports.json shape, code in `icao`) whose code has a map on the website, in their order.
 * `mapped` is the set of codes (or an array). The build uses this rule to write the demo's airports file.
 */
export function demoAirportCodes(rows, mapped) {
  const has = mapped instanceof Set ? mapped : new Set(mapped);
  return rows.filter((r) => has.has(r.icao));
}

/** True when the game's clock has reached the cap. */
export function demoTimeUp(simTime, capS = DEMO_GAME_S) {
  return simTime >= capS;
}

/**
 * The Play pill's three lines in the demo. `left` is the free games left today (demoGamesLeft). While any are left: Play, the picked
 * airport's name (or the random word), and "3 free games today", "2 free games left today" or "1 free game left today". With none left:
 * Get the app, Back tomorrow, or get the app, Free on Google Play (a tap opens the Play page).
 */
export function demoPlayWords({ left = DEMO_FREE_GAMES, pickName = '' } = {}) {
  if (left <= 0) return { title: DEMO_WORDS.afterTitle, place: DEMO_WORDS.afterPlace, note: DEMO_WORDS.afterNote };
  const note = left >= DEMO_FREE_GAMES ? DEMO_WORDS.playLeft3 : left === 2 ? DEMO_WORDS.playLeft2 : DEMO_WORDS.playLeft1;
  return { title: DEMO_WORDS.playTitle, place: pickName || DEMO_WORDS.playPlace, note };
}

/**
 * The end card's title in the demo: Demo over when Quit ended the game, Time's up for the demo at the cap, else the game's own title
 * for the reason (overTitles: the app's OVER_TITLES, keyed by the crash reason).
 */
export function demoEndTitle(reason, overTitles = {}) {
  if (reason === 'quit') return DEMO_WORDS.overDemo;
  if (reason === 'time') return DEMO_WORDS.overTime;
  return overTitles[reason] || 'Game over';
}

/** 'ok' when this browser can run the demo, else 'unsupported'. The demo needs DecompressionStream (the map files are gzip). */
export function demoBrowserSupport({ decompression = false } = {}) {
  return decompression ? 'ok' : 'unsupported';
}

// ------------------------------------------------------------------ the free games (DECISIONS 454)
// The count is one record in the browser's storage: { day, n }, the local day (airportdb.js localDay, a whole number) and the games
// counted on it. Nothing else is stored. A game counts once its map has loaded (main.js). The functions take a storage-like object
// (getItem and setItem: the browser's own store, which main.js passes in), or null when the browser has none. A storage that throws (private mode, blocked
// site data, a full quota) is not an error: the count falls back to the page load's own, with the old rule of one game per page load
// (DECISIONS 446). `memory` is that page count: the games counted in this page load while the storage could not hold them.

/** The home screen's demo note: 3 a day when the browser keeps the day's count (`stored`), else one game per page load (homeNoteOnce). */
export function demoHomeNote(stored) {
  return stored ? DEMO_WORDS.homeNote : DEMO_WORDS.homeNoteOnce;
}

/**
 * True when the storage takes a write: a probe value is set and removed. A storage that throws on the write (a full quota, or one the
 * browser keeps read-only) cannot hold the count, so the page treats it as blocked: the one-game rule, the same words as blocked storage.
 * Null (no storage) is not usable either.
 */
export function demoStorageWorks(storage) {
  try {
    storage.setItem(DEMO_PROBE_KEY, '1');
    storage.removeItem(DEMO_PROBE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

const isCount = (v) => Number.isInteger(v) && v >= 0;

/** The day's record from a storage-like object: { stored, day, n }. A missing or broken record reads as a new day with no games. */
export function demoDayCount(storage, day) {
  let raw;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch (_) {
    return { stored: false, day, n: 0 }; // no storage (null) or a storage that throws
  }
  let rec = null;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      if (v && Number.isInteger(v.day) && isCount(v.n)) rec = { day: v.day, n: v.n };
    } catch (_) { /* a broken record is a new day */ }
  }
  if (!rec || day > rec.day) return { stored: true, day, n: 0 }; // a new day starts the count at 0
  return { stored: true, day: rec.day, n: rec.n }; // the same day, or the clock set back: the day it reached keeps its count
}

/**
 * The free games left today: { played, left, stored }. With the storage working, DEMO_FREE_GAMES less the day's count. With it blocked
 * or failing (stored false), or once a count could not be saved in this page load (memory above 0), the page's own rule: one game.
 */
export function demoGamesLeft(storage, day, memory = 0) {
  const d = demoDayCount(storage, day);
  if (!d.stored || memory > 0) return { played: memory, left: Math.max(0, 1 - memory), stored: false };
  return { played: d.n, left: Math.max(0, DEMO_FREE_GAMES - d.n), stored: true };
}

/**
 * Counts one game started on `day` (called once its map has loaded). Returns demoGamesLeft's shape after the game; `stored` says whether
 * the record was saved. A save that fails hands the count to the page: stored false, and no game is left for the rest of the page load.
 */
export function demoCountGame(storage, day, memory = 0) {
  const before = demoGamesLeft(storage, day, memory);
  if (before.stored) {
    const d = demoDayCount(storage, day);
    const next = { day: d.day, n: d.n + 1 };
    try {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      return { played: next.n, left: Math.max(0, DEMO_FREE_GAMES - next.n), stored: true };
    } catch (_) { /* a full or blocked save: the page's own count below */ }
  }
  return { played: before.played + 1, left: 0, stored: false };
}
