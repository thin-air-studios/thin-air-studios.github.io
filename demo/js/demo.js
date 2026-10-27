// The browser demo's rules and words (DECISIONS 445 to 449). No DOM, no storage, no network: the tests can read them. The demo is
// the game built with WEB_DEMO true (flavor.js); the app never reaches the demo's branches, and these rules are only asked from them.
// The words are in the game's own voice and are the demo's only words on its screens.

import { STORE_URL } from './links.js?v=7227d0de';

// the game-time cap, in the sim's seconds: ten minutes. Paused time is not counted (the sim does not step while paused).
export const DEMO_GAME_S = 600;
// the website's map is waited for this long at the start (the app waits START_WAIT_MS, 2 s, because it can fall back to a server)
export const DEMO_MAP_WAIT_MS = 8000;
// the install referrer's source for every link the demo makes (links.js shareLinkFor)
export const DEMO_SOURCE = 'web-demo';

export const DEMO_WORDS = Object.freeze({
  homeNote: 'Web demo: one free game. No sign-in, no scores.',
  search: 'Search airports',
  playTitle: 'Play',
  playPlace: 'Random busy airport',
  playNote: 'One free game',
  afterTitle: 'Get the app',
  afterPlace: 'More games on Google Play',
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
  secondStart: 'The demo has one game. Get the app for more.',
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
  terms: 'https://thin-air-studios.github.io/terms/',
  privacy: 'https://thin-air-studios.github.io/privacy/',
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
 * The Play pill's three lines in the demo. Before any game: Play, the picked airport's name (or the random word), One free game.
 * After the one game: Get the app, More games on Google Play, Free on Google Play (a tap opens the Play page).
 */
export function demoPlayWords({ played = false, pickName = '' } = {}) {
  if (played) return { title: DEMO_WORDS.afterTitle, place: DEMO_WORDS.afterPlace, note: DEMO_WORDS.afterNote };
  return { title: DEMO_WORDS.playTitle, place: pickName || DEMO_WORDS.playPlace, note: DEMO_WORDS.playNote };
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

// one game per page load: held in memory only (nothing is stored, so a reload starts a new visit; DECISIONS 446)
let gameStarted = false;
/** True once this page load has started its one game. */
export const demoGameStarted = () => gameStarted;
/** Marks the page load's one game as started (called once the game's map has loaded, as the app counts a game). */
export function demoMarkStarted() {
  gameStarted = true;
}
/** Test hook only: the flag is cleared (the page's own tests start a new page instead). */
export function demoResetStarted() {
  gameStarted = false;
}
