// Share links (2.5): every share names the game on Google Play, and a caption's link is the game's Play page. The install referrer
// carries the app shared to, the word "share" and the airport, so Play Console can show which shares bring installs. No tracking SDK.
// Links shared before 2.5 ("Beat my score", thin-air-studios.github.io/play/?a=<airport>) still open the game at that airport
// through Android App Links (the manifest, MainActivity, HP_openLink); nothing new is made in that form. The one link made on the
// website's address is a friend's challenge (3.2, below): it carries the challenge's parts, and App Links open it in the game too.

import { SITE_BASE } from './config.js?v=2f66fd5f';

/** The game's Google Play page: where every share goes. */
export const STORE_URL = 'https://play.google.com/store/apps/details?id=com.thinaircapital.holdingpattern';

/** The website's play page that the older "Beat my score" links open (read by parseShareLink, never made now). */
export const LINK_BASE = 'https://thin-air-studios.github.io/play/';

/** The hosts whose /play page opens the game at an airport: the old github.io site, and the site's own address (3.4, /play there too). */
const PLAY_HOSTS = Object.freeze(['thin-air-studios.github.io', 'playshortfinal.com']);
/** The website (3.4): a challenge's board page is `<SITE_BASE>/c/<id>/`. SITE_BASE is defined once, in config.js (WP-D). */
export { SITE_BASE };
const SITE_HOST = 'playshortfinal.com';
/** A challenge board's id: twelve characters of lower-case RFC 4648 base32 (challenge.js challengeIdOf). */
export const CHALLENGE_ID_RE = /^[a-z2-7]{12}$/;

/** The board page of a challenge, for its id: where the end card's "See the board" opens. */
export const challengeBoardUrl = (id) => `${SITE_BASE}/c/${id}/`;

/** Destinations whose captions drop links (TikTok, Instagram): the caption names the game in words, with no address. */
const NO_LINK_IN_CAPTION = new Set(['tiktok', 'instagram']);

/** The destination's name as a utm_source: lower-case letters, digits and dashes. '' (the share sheet) is 'share'. */
export function sourceOf(destination) {
  const s = String(destination || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s || 'share';
}

/**
 * The link for a game result (game: { icao }) and the app it is shared to (the app's key, 'tiktok', 'youtube', or '' for the share
 * sheet). url: the Play page with the install referrer `utm_source=<app>&utm_medium=share&utm_campaign=<airport>`, URL-encoded as
 * a whole, so Play passes it on as one referrer. line: the caption's words, "Get Short Final free on Google Play: <url>", or the
 * words alone where captions can't carry a link (TikTok, Instagram). A daily's number is not in the link: the referrer is the airport.
 */
export function shareLinkFor(game, destination = 'share') {
  const source = sourceOf(destination);
  const airport = String(game.icao || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const referrer = `utm_source=${source}&utm_medium=share&utm_campaign=${airport}`;
  const url = `${STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
  const words = 'Get Short Final free on Google Play';
  const line = NO_LINK_IN_CAPTION.has(source) ? words : `${words}: ${url}`;
  return { url, line };
}

/**
 * What the game takes from a link someone opened (MainActivity passes it to HP_openLink): { icao, daily } for an https address
 * on a PLAY_HOSTS host, at /play, with an airport code, else null. A daily number that is not a whole number is dropped, the airport kept. Anything
 * else is ignored: another site's address, a path that is not /play/, a missing or badly formed code. (Links from 2.4 and before.)
 */
export function parseShareLink(href) {
  let u;
  try {
    u = new URL(String(href));
  } catch (_) {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  // the website's challenge page (3.4): playshortfinal.com/c/<id>/ carries the same parts, and its path names the board (id)
  const onSite = u.hostname === SITE_HOST && /^\/c\/[a-z2-7]{12}\/?$/.test(u.pathname);
  const onPlay = PLAY_HOSTS.includes(u.hostname) && (u.pathname === '/play' || u.pathname === '/play/');
  if (!onSite && !onPlay) return null;
  const icao = (u.searchParams.get('a') || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,9}$/.test(icao)) return null; // the database has a few idents with a dash (BR-2182)
  const d = u.searchParams.get('d');
  const daily = d != null && /^\d{1,6}$/.test(d) ? Number(d) : 0;
  const link = { icao, daily: daily > 0 ? daily : 0 };
  if (onSite) link.id = u.pathname.split('/')[2];
  return link;
}

/**
 * The home list's pick for a link: { info, daily } where info is the airport (db.getAirport, so an IATA code works too) and daily
 * is the day's number only when the link's day is today's and its airport is today's airport (the daily row); else 0. null when
 * the game ignores the link or does not know the airport. Nothing is started: the caller sets the pick.
 */
export async function pickFromLink(href, { getAirport, todaysDaily }) {
  const link = parseShareLink(href);
  if (!link) return null;
  const info = await getAirport(link.icao);
  if (!info) return null;
  const today = todaysDaily();
  const daily = link.daily && link.daily === today.n && info.icao === today.airport[0] ? link.daily : 0;
  return { info, daily };
}

// ------------------------------------------------------------ friends' challenges (3.2; DECISIONS 411, 413; 3.3 DECISIONS 435)
// A challenge link is the website's play page (LINK_BASE) with the challenge's parts. App Links open it in the game, which sets up the
// friend's game from them (challenge.js); a phone without the game is sent to Google Play by the page (store/site/play).
// 3.3 adds three parts, sc (the challenger's screen), lo (the layout's code) and v (the game's version), so the friend's game can make
// the same planes on its own screen. A link without them is a 3.2 link and plays as one.

/** The level's letter in a challenge link (l=): b, e, n, h or c for the five levels. */
export const CHALLENGE_LEVEL_CODES = Object.freeze({ beginner: 'b', easy: 'e', normal: 'n', hard: 'h', chaos: 'c' });
const LEVEL_OF_CODE = new Map(Object.entries(CHALLENGE_LEVEL_CODES).map(([level, code]) => [code, level]));

/** The rules a challenge's traffic follows: '' the usual one (departures on), 'd' the daily challenge's rules, 'o' departures off. */
export const CHALLENGE_RULES = Object.freeze(['', 'd', 'o']);

const MAX_SCORE = 9999999;
const MAX_NAME = 12;
const MAX_KT = 200;
/** The screen a challenge was made on (sc=<cssW>x<cssH>, CSS px): three or four digits a side, so 100 to 9999 (checkScreen). */
const SCREEN_RE = /^(\d{3,4})x(\d{3,4})$/;
/** The layout's code (lo=): the first eight hex digits of the layout's hash, as a replay names its layout (outbox.js hashText). */
const LAYOUT_RE = /^[0-9a-f]{8}$/;
/** The game's version (v=), as version.js writes it: 3.3, 3.2.1. At most eight characters. */
const VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
/** The fog a link's weather carries, by its code (0 none, 1 mist, 2 fog): weatherFromMetar's values 0, 0.5 and 1. */
const FOG_OF_CODE = Object.freeze([0, 0.5, 1]);
/**
 * The weather part (w=, DECISIONS 413 f): "1" for the generated weather, or "1.<dir>.<kt>.<gust>.<fog>.<storms>" for the challenger's
 * report at its start, where dir is 0 to 360 or x (calm or variable), kt and gust are knots, fog is 0, 1 or 2 and storms 0 or 1.
 */
const WEATHER_RE = /^1(?:\.(x|\d{1,3})\.(\d{1,3})\.(\d{1,3})\.([012])\.([01]))?$/;

/** A seed as a link writes it: lower-case base-36 digits (a 32-bit seed is at most seven of them). */
export const seedCode = (seed) => (seed >>> 0).toString(36);

/**
 * The screen a challenge carries, checked (DECISIONS 435): { cssW, cssH } in CSS px, each a whole number from 100 to 9999; null when
 * there is none (a 3.2 link); undefined when it is not valid.
 */
function checkScreen(s) {
  if (s == null) return null;
  if (typeof s !== 'object') return undefined;
  const cssW = Number(s.cssW), cssH = Number(s.cssH);
  const ok = (n) => Number.isInteger(n) && n >= 100 && n <= 9999;
  return ok(cssW) && ok(cssH) ? { cssW, cssH } : undefined;
}

/** The layout code a challenge carries, checked: eight lower-case hex digits, null when there is none, undefined when not valid. */
function checkLayout(l) {
  if (l == null) return null;
  return typeof l === 'string' && LAYOUT_RE.test(l) ? l : undefined;
}

/** The game version a challenge carries, checked: null when there is none, undefined when not valid (VERSION_RE, eight characters). */
function checkVersion(v) {
  if (v == null) return null;
  return typeof v === 'string' && v.length <= 8 && VERSION_RE.test(v) ? v : undefined;
}

/**
 * The name a challenge may carry: letters, digits, spaces, apostrophes and dashes, one space between words, at most 12 characters.
 * '' when nothing is left. Anything else (symbols, links, emoji) is dropped on the phone.
 */
export function cleanName(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, MAX_NAME).join('').trim();
}

/**
 * A challenge's weather, checked (DECISIONS 413 f): 'generated' (the challenger's game flew the generated weather), the report's fields
 * { windDir, windKt, gustKt, fog, storms } (windDir 0 to 360, or null for calm or variable wind; whole knots up to 200; fog 0, 0.5 or
 * 1; storms 0 or 1), or null when there is none (an old link). undefined when the weather is not valid.
 */
function checkWeather(w) {
  if (w == null) return null;
  if (w === 'generated') return 'generated';
  if (typeof w !== 'object') return undefined;
  const windDir = w.windDir == null ? null : Number(w.windDir);
  const windKt = Number(w.windKt), gustKt = Number(w.gustKt);
  if (windDir !== null && (!Number.isInteger(windDir) || windDir < 0 || windDir > 360)) return undefined;
  if (!Number.isInteger(windKt) || windKt < 0 || windKt > MAX_KT) return undefined;
  if (!Number.isInteger(gustKt) || gustKt < 0 || gustKt > MAX_KT) return undefined;
  if (!FOG_OF_CODE.includes(w.fog)) return undefined; // the values as they are: 0, 0.5 or 1
  if (w.storms !== 0 && w.storms !== 1) return undefined;
  return { windDir, windKt, gustKt, fog: w.fog, storms: w.storms };
}

/** The weather part as a value (parseChallengeLink): 'generated', the report's fields, or undefined when the part is not valid. */
function parseWeatherPart(code) {
  const m = WEATHER_RE.exec(code);
  if (!m) return undefined;
  if (m[1] === undefined) return 'generated';
  return { windDir: m[1] === 'x' ? null : Number(m[1]), windKt: Number(m[2]), gustKt: Number(m[3]), fog: FOG_OF_CODE[Number(m[4])], storms: Number(m[5]) };
}

/** The screen part (sc=) as a value: { cssW, cssH } for "<cssW>x<cssH>", or null when it is not that form (checkScreen does the range). */
function parseScreenPart(code) {
  const m = SCREEN_RE.exec(code);
  return m ? { cssW: Number(m[1]), cssH: Number(m[2]) } : null;
}

/** The weather part of a link (w=) for a checked weather: "1", or "1.<dir>.<kt>.<gust>.<fog>.<storms>" (see WEATHER_RE). */
function weatherPartOf(w) {
  if (w === 'generated') return '1';
  return `1.${w.windDir == null ? 'x' : w.windDir}.${w.windKt}.${w.gustKt}.${FOG_OF_CODE.indexOf(w.fog)}.${w.storms}`;
}

/**
 * A challenge as the game keeps it, checked: { icao, seed, level, score, rules, real, name, weather, screen, layout, version } or null
 * when a part is not valid. The seed is a 32-bit whole number, the level one of the five, the score a whole number from 0 to 9,999,999,
 * the rules one of CHALLENGE_RULES, real a yes or no, and the name cleaned. weather is what checkWeather gives: null for an old link
 * (no w= part, so the friend's planes are only similar, DECISIONS 413), 'generated', or the challenger's report. screen, layout and
 * version are the 3.3 parts (DECISIONS 435): the challenger's screen ({ cssW, cssH }), its layout's code, and its game's version, each
 * null for a 3.2 link. Used for a link (parseChallengeLink) and for the pick the save keeps (challenge.js, playbutton.js).
 */
export function checkChallenge(ch) {
  if (!ch || typeof ch !== 'object') return null;
  // the board's id (the path of a board link, challenge.js): null for a link with no board
  const id = ch.id == null || ch.id === '' ? null : ch.id;
  if (id !== null && (typeof id !== 'string' || !CHALLENGE_ID_RE.test(id))) return null;
  const icao = String(ch.icao || '').toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,9}$/.test(icao)) return null;
  const seed = Number(ch.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  if (!Object.hasOwn(CHALLENGE_LEVEL_CODES, ch.level)) return null;
  const score = Number(ch.score);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  if (!CHALLENGE_RULES.includes(ch.rules || '')) return null;
  const weather = checkWeather(ch.weather);
  if (weather === undefined) return null;
  const screen = checkScreen(ch.screen);
  const layout = checkLayout(ch.layout);
  const version = checkVersion(ch.version);
  if (screen === undefined || layout === undefined || version === undefined) return null;
  const out = { icao, seed, level: ch.level, score, rules: ch.rules || '', real: !!ch.real, name: cleanName(ch.name), weather, screen, layout, version };
  // the 3.4 parts (a board's id, the holding fixes, Santa) are kept only when they are set: a 3.3 challenge keeps its shape
  if (id !== null) out.id = id;
  if (ch.fixesHidden) out.fixesHidden = true;
  if (ch.santa) out.santa = true;
  return out;
}

/**
 * The challenge link for a checked challenge: the play page, the airport (a), the seed (c), the level's letter (l), the challenger's score
 * (s), the weather (w, DECISIONS 413 f: the start weather the challenger's game flew, so the friend's game flies the same; none for an old
 * challenge), the screen (sc, DECISIONS 435: the friend's world and HUD are the challenger's), the layout's code (lo), the game's version
 * (v, only when the friend's game can make the same planes), the rules (k, only when not the usual one), real planes (x=1, only when the
 * challenger's game had some) and the name (n, only when one was typed). The caption and the Text panel show it; nothing else about the
 * game goes in it.
 */
export function challengeLinkFor(ch) {
  const c = checkChallenge(ch);
  if (!c) return LINK_BASE;
  const parts = [`a=${c.icao}`, `c=${seedCode(c.seed)}`, `l=${CHALLENGE_LEVEL_CODES[c.level]}`, `s=${c.score}`];
  if (c.weather !== null) parts.push(`w=${weatherPartOf(c.weather)}`);
  if (c.screen) parts.push(`sc=${c.screen.cssW}x${c.screen.cssH}`);
  if (c.layout) parts.push(`lo=${c.layout}`);
  if (c.version) parts.push(`v=${c.version}`);
  if (c.rules) parts.push(`k=${c.rules}`);
  if (c.real) parts.push('x=1');
  if (c.name) parts.push(`n=${encodeURIComponent(c.name)}`);
  // 3.4: fh=1 when the challenger's game had its holding fixes hidden at the start, sa=1 when it flew Santa (absent: 0 and no Santa)
  if (c.fixesHidden) parts.push('fh=1');
  if (c.santa) parts.push('sa=1');
  // a board link (3.4) is the board page's address; any other challenge keeps the play page of 3.2 and 3.3
  const base = c.id ? challengeBoardUrl(c.id) : LINK_BASE;
  return `${base}?${parts.join('&')}`;
}

/**
 * What the game takes from a challenge link: the checked challenge (checkChallenge), or null. A link with no challenge parts is an
 * old link or a plain airport link (parseShareLink takes those). A challenge link with a part that is not valid, the weather included,
 * is ignored as a challenge: the airport still picks, as with any old link, and nothing is set up from the bad part.
 */
export function parseChallengeLink(href) {
  const base = parseShareLink(href);
  if (!base) return null;
  const q = new URL(String(href)).searchParams;
  const c = q.get('c');
  const l = q.get('l');
  const s = q.get('s');
  if (c == null && l == null && s == null) return null;
  if (!/^[0-9a-z]{1,7}$/i.test(c || '')) return null;
  const level = LEVEL_OF_CODE.get(l || '');
  if (!level || !/^\d{1,7}$/.test(s || '')) return null;
  const w = q.get('w');
  const weather = w == null ? null : parseWeatherPart(w);
  if (weather === undefined) return null;
  // the 3.3 parts: a part that is there and not valid makes the challenge null (its airport still picks)
  const sc = q.get('sc');
  const screen = sc == null ? null : parseScreenPart(sc);
  if (sc != null && !screen) return null;
  const x = q.get('x');
  // 3.4: fh and sa are 1 or 0 (absent is 0); any other value makes the challenge null, as a bad 3.3 part does
  const flag = (k) => {
    const v = q.get(k);
    return v == null || v === '0' ? false : v === '1' ? true : undefined;
  };
  const fixesHidden = flag('fh');
  const santa = flag('sa');
  if (fixesHidden === undefined || santa === undefined) return null;
  return checkChallenge({
    icao: base.icao, seed: parseInt(c.toLowerCase(), 36), level, score: Number(s), rules: q.get('k') || '',
    real: x === '1', name: q.get('n') || '', weather, screen, layout: q.get('lo'), version: q.get('v'),
    id: base.id ?? null, fixesHidden, santa,
  });
}

/** Whether a caption can carry a link for this destination (TikTok and Instagram cannot: the words go alone). */
export const linkInCaption = (destination) => !NO_LINK_IN_CAPTION.has(sourceOf(destination));
