// What the live feed is doing, and the words that say so: the line under the airport name (the mix line), the banner, the
// Live feed card's status, the home screen's line and the end screen's planes line. All pure, so the HUD, the menus and the
// tests read the same state and say the same thing. Streamlined for casual players (requirements item 5): the player is
// told how many real planes there are ("real planes", one word for them), and two kinds of trouble get their own words.
// No OpenSky, credits, paused or interrupted words here: those are behind the card's Details (feedcard.js).

const OFFLINE_HOLD_MS = 180e3; // a failed poll shows as 'interrupted' for this long after the last good one

/**
 * The feed's state for the player, as a view: { state, reason, httpStatus, waitMs }.
 * state: 'daily' | 'demo' | 'connecting' | 'working' | 'paused' | 'interrupted' | 'offline'.
 * Only 'working' and 'demo' may bring in new arrivals.
 * @param feed   a LiveFeed (status, reason, httpStatus, nextPollMs, lastOkMs), or null
 */
export function feedState(feed, { nowMs = Date.now(), demo = false, daily = false } = {}) {
  const reason = (feed && feed.reason) || '';
  const httpStatus = (feed && feed.httpStatus) || null;
  const waitMs = feed && feed.nextPollMs != null ? Math.max(0, feed.nextPollMs - nowMs) : 0;
  const view = (state, why = reason) => ({ state, reason: why, httpStatus, waitMs });
  if (daily) return view('daily', '');
  if (demo) return view('demo', '');
  const s = feed ? feed.status : 'loading';
  if (s === 'live' || s === 'empty') return view('working', '');
  if (s === 'paused') return view('paused', reason || 'rate');
  if (s === 'offline') {
    if (feed.lastOkMs && nowMs - feed.lastOkMs < OFFLINE_HOLD_MS) return view('interrupted');
    return view('offline');
  }
  return view('connecting', '');
}

/** Whether a feed state (a view's `state`) lets the director bring in new real arrivals. The director's one rule. */
export const usable = (state) => state === 'working' || state === 'demo';

/** How long until the next try, in words: "about 10 min", or "a minute" under a minute. */
export function waitWords(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return 'a minute';
  return `about ${Math.ceil(s / 60)} min`;
}

/** The recorded game's feed status (no internet: the planes are the ones recorded earlier), the same words on the Live feed card,
 *  the pause card and the loading card (requirements 2.2 item G: plain words, no "practice" or "recorded traffic"). */
export const RECORDED_STATUS = 'No internet: these planes were recorded earlier';

/** Whether the feed has no internet (the device's, not OpenSky's): the one case with its own words in a normal game. */
const noInternet = (v) => v.state === 'offline' && v.reason === 'no-internet';
/** Whether the day's free live data is used up: the other case with its own words. */
const dataUsedUp = (v) => v.state === 'paused' && v.reason === 'daily';

const countWords = (n) => (n === 1 ? '1 real plane' : `${n} real planes`);
const NONE = 'No real planes right now';

/**
 * The line under the airport name, in two lengths: `full`, and `short` for a phone where full runs under the buttons (the
 * HUD picks, render.js hudLayout). One count of real planes, in every mode:
 *  - normal: "3 real planes" / "1 real plane" / "No real planes right now"; no internet and used-up data have their own lines;
 *  - realOnly: "Real planes only · 3 landing here" / "Real planes only · no real planes right now";
 *  - practice: "3 real planes" / "No real planes right now". The title already says "Practice: ATL", so the line does not;
 *  - daily: "Same planes for everyone today". The title already says "Daily #3", so the line does not repeat it.
 *  - weekend: "Weekend event: the same airport and weather for everyone." (weekend.js: the planes are the same only in the weather and the airport)
 * The quiet sky and a feed that cannot be reached read the same ("No real planes right now"): the player is not told how
 * the sky is made. `real` is the real planes in the game (landing here and in the area, one count).
 * @param v     the feed's view (feedState)
 * @param mode  'normal' | 'realOnly' | 'practice' | 'daily' | 'weekend' | 'challenge' (a friend's challenge: challenge.js)
 * @param real  the real planes in the game
 * @param same  a challenge only: its planes are the challenger's; else similar (challenge.js challengeSamePlanes, never in 3.2, DECISIONS 421)
 */
export function mixLine(v, { mode = 'normal', real = 0, same = false, web = null } = {}) {
  const line = (full, short = full) => ({ full, short });
  if (web) return line(web.full, web.short); // the browser demo's words (demo.js), passed in: this module imports nothing
  if (mode === 'daily') return line('Same planes for everyone today');
  if (mode === 'weekend') return line('Weekend event: the same airport and weather for everyone.');
  if (mode === 'challenge') return same ? line('Same planes as your friend’s game', 'Same as your friend’s game') : line('Similar planes to your friend’s game', 'Like your friend’s game');
  if (v.state === 'connecting') return line('Connecting to the live feed…', 'Connecting…');
  if (mode === 'normal' && noInternet(v)) return line('No internet · no real planes');
  if (mode === 'normal' && dataUsedUp(v)) return line('Real planes back tomorrow');
  if (mode === 'realOnly') {
    if (real) return line(`Real planes only · ${real} landing here`, `Real planes · ${real} landing`);
    // no internet and a used-up day have their own banner under this line (bannerLine), so the line names only the mode
    if (noInternet(v) || dataUsedUp(v)) return line('Real planes only');
    return line('Real planes only · no real planes right now', 'Real planes · none right now');
  }
  return line(real ? countWords(real) : NONE);
}

/**
 * The banner under the mix line. Only a real-only game has one, and only for the two cases the player can act on: no internet
 * and the day's free data used up. A tap opens the Live feed card, where the switch is, so both say "tap for options".
 * Every other state (a quiet sky, a rate pause, an interrupted feed) has no banner: the line says what there is.
 */
export function bannerLine(v, { realOnly = false } = {}) {
  if (!realOnly) return '';
  if (noInternet(v)) return 'No internet · no real planes · tap for options';
  if (dataUsedUp(v)) return 'Real planes back tomorrow · tap for options';
  return '';
}

/**
 * The Live feed card's status, and the pause card's feed line: plain words for what the feed is doing, one statement.
 * `almost`: under an hour of live play left today (almostUsedUp), the one time the hours show. The detail (the last update,
 * the next check, the planes by group, the report) is behind the card's Details.
 */
export function feedStatus(v, { almost = false } = {}) {
  if (v.state === 'connecting') return 'Checking the live feed…';
  if (v.state === 'working') return almost ? 'Live feed almost used up today' : 'Live feed: on';
  if (dataUsedUp(v)) return 'Real planes back tomorrow';
  if (noInternet(v)) return 'No internet';
  return NONE;
}

/** A check this recent (in ms) reads "on"; from here to OLD_MS it reads "checked"; past OLD_MS, "last worked" (feedcheck.js). */
export const ON_MS = 600e3;
export const OLD_MS = 7200e3;

/** How long ago a check was, in words: "just now", "3 min", "2 h" (the caller adds "ago"). */
export function agoWords(mins) {
  if (mins < 1) return 'just now';
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h`;
}

/** Whether two times fall on the same local day (the phone's clock). A missing time is on no day. */
export function sameDay(a, b) {
  if (a == null || b == null) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** How many game-minutes one credit lasts, as the game polls: a poll every 3 min under 60 credits, every 1.6 min under 150. */
export function pollFactor(remaining) {
  if (remaining == null || !Number.isFinite(remaining)) return 1;
  if (remaining < 60) return 3;
  if (remaining < 150) return 1.6;
  return 1;
}

/** The minutes of live play the credits left give (the same banding as opensky.js baseInterval). */
export function playMinutes(remaining) {
  return remaining * pollFactor(remaining);
}

/**
 * Nearly used up: under an hour of live play left today. The only time the player hears about the hours: the Live feed card,
 * the home line and Settings say "almost used up today" then, and nothing about hours otherwise.
 */
export function almostUsedUp(remaining) {
  return remaining != null && Number.isFinite(remaining) && remaining >= 4 && playMinutes(remaining) < 60;
}

/**
 * The feed line, from the saved check (save.feed) so every screen says the same thing. The home screen's line is a tap
 * target (settings false: the tap clauses); Settings' line is the same words without them. `checking`: a check is on its
 * way. A check that cannot be refreshed reads "last worked", never "on": "on" is for a check younger than ON_MS.
 */
export function homeFeedLine(rec, nowMs = Date.now(), { checking = false, settings = false } = {}) {
  if (checking) return 'Live feed: checking…';
  if (!rec || !rec.state || rec.at == null || rec.at > nowMs + 60e3) return 'Live feed: not checked yet';
  const age = Math.max(0, nowMs - rec.at);
  const ago = agoWords(Math.floor(age / 60e3));
  const agoSaid = ago === 'just now' ? ago : `${ago} ago`;
  const tap = settings ? '' : ' · tap to check again';
  const tryAgain = settings ? '' : ' · tap to try again';
  // "almost used up today" holds together on one line (no break inside it): a 640 by 360 phone wrapped the word "today" alone
  const almost = almostUsedUp(rec.remaining) && sameDay(rec.at, nowMs) ? ' · almost\u00a0used\u00a0up\u00a0today' : '';
  if (rec.state === 'working') {
    if (age < ON_MS) return `Live feed: on · checked ${agoSaid}${almost}`;
    // the almost-used-up clause takes the line's room: the tap clause goes then (the line stays two lines at 640 by 360)
    return `Live feed: ${age < OLD_MS ? 'checked' : 'last worked'} ${ago} ago${almost ? '' : tap}${almost}`;
  }
  if (rec.state === 'paused' && rec.reason === 'daily') {
    // yesterday's used-up check says nothing about today's allowance: the launch check (or a tap) reads it again
    return sameDay(rec.at, nowMs) ? 'Live feed: real planes back tomorrow' : 'Live feed: not checked yet';
  }
  if (rec.state === 'paused') {
    if (rec.retryAt > nowMs) return `Live feed: ${NONE.toLowerCase()} · try again in ${waitWords(rec.retryAt - nowMs)}`;
    return `Live feed: ${NONE.toLowerCase()}${tryAgain}`;
  }
  if (noInternet(rec)) return `Live feed: no internet${tryAgain}`;
  if (rec.state === 'offline' || rec.state === 'interrupted') return `Live feed: ${NONE.toLowerCase()}${tryAgain}`;
  return 'Live feed: not checked yet';
}

/**
 * What to save from a view, when it changes. retryAt is when an OpenSky rate pause ends (LiveFeed's own wait), else null:
 * the offline backoff is not an OpenSky wait, and saves from 2.0 have no retryAt (read as null).
 */
export function feedRecord(v, { remaining = null, real = 0, at = Date.now() } = {}) {
  const retryAt = v.state === 'paused' && v.reason === 'rate' && v.waitMs > 0 ? at + v.waitMs : null;
  return { state: v.state, reason: v.reason, httpStatus: v.httpStatus, remaining, real, at, retryAt };
}

/**
 * Whether the saved check should be written now: at once when its state or reason changes, or when a real plane comes in
 * or the last one goes ("no real arrivals" is only true while there are none), and at least once a minute otherwise, so
 * "checked ... ago" means the last check. Never more than once in 5 s. `prev` is the saved record, `lastMs` when it was saved.
 */
export function feedSaveDue(prev, v, real, nowMs, lastMs) {
  if (nowMs - lastMs < 5e3) return false;
  const changed = !prev || prev.state !== v.state || prev.reason !== v.reason || (prev.real > 0) !== (real > 0);
  return changed || nowMs - lastMs >= 60e3;
}

/**
 * Up to `most` names, then "and N more". The "and N more" stays on one line (no break before the count, so "more."
 * never wraps alone: 640 x 360, the end card).
 */
export function nameList(names, most = 3) {
  if (names.length > most) return `${names.slice(0, most).join(', ')} and ${names.length - most} more`;
  if (names.length > 1) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return names[0] || '';
}

/**
 * The end screen's lines: the flights, then the points' other parts. `real` is the real planes that landed (by name, up to
 * `most`, in `names`): "12 landed · 3 real planes: AA1544, DL22 and UA9." No split by kind and no simulated count (requirements
 * item 4). `extras` is the common part: departures and bonuses, penalties and the streak. `realBonus` is the one extra point
 * a real landing earns when it is confirmed here (sim.js): the score rules are unchanged, only the words. `challenge` names the
 * challenger's game (challenge.js challengeWho); `challengeSame` says its planes are the same (never in 3.2, DECISIONS 421), else they are similar (413).
 */
export function endLines({ landed = 0, real = 0, names = [], departed = 0, bonus = 0, realBonus = 0, penalty = 0, streak = 0, realOnly = false, daily = false, challenge = '', challengeSame = false, most = 3 } = {}) {
  let flights;
  if (daily) flights = `${landed} landed. The same planes for everyone today.`;
  else if (challenge && landed) flights = challengeSame ? `${landed} landed. The same planes as ${challenge}.` : `${landed} landed. Similar planes to ${challenge}.`;
  else if (!landed) flights = realOnly ? 'No real planes landed this time.' : 'No planes landed this time.';
  else if (!real) flights = `${landed} landed.`;
  else {
    const named = nameList(names, most);
    flights = `${landed} landed · ${real} real ${real === 1 ? 'plane' : 'planes'}${named ? `: ${named}` : ''}.`;
  }
  const parts = [];
  if (departed) parts.push(`${departed} departed`);
  if (realBonus > 0) parts.push(`+${realBonus} real plane bonus`);
  if (bonus > 0) parts.push(`+${bonus} emergency bonus`);
  if (penalty > 0) parts.push(`−${penalty} medevac penalty`);
  if (streak >= 3) parts.push(`best streak ${streak}`);
  return { flights, extras: parts.length ? `${parts.join(' · ')}.` : '' };
}

/** The dot before the mix line: green when working, amber when paused or interrupted, grey when connecting or
 *  offline, blue-grey for the daily challenge and the practice game. Never red (red is a real plane's dot). */
export function dotColour(state) {
  if (state === 'working') return '#7bd88f';
  if (state === 'paused' || state === 'interrupted') return '#f2b84b';
  if (state === 'daily' || state === 'demo') return '#8fa3b8';
  return '#9aa6ad';
}
