// The live feed check on the home screen (2.1): one anonymous OpenSky request when the home screen shows, when the app comes
// back after 10 minutes away, and on a tap of the feed line. These are its rules, pure (no DOM, no network, no clock: every
// function takes nowMs). main.js makes the request and saves the record (runFeedCheck). The check spends one credit of the
// day's free allowance, so the rules keep the game's credits: it never sends while OpenSky asked us to wait, never within a
// minute of the last request it sent, and a tap or a return to the app leaves the last 150 credits of the day to games.
import { sameDay, waitWords } from './feedstate.js?v=2f66fd5f';

export { ON_MS, OLD_MS } from './feedstate.js?v=2f66fd5f';

export const CHECK_GAP_MS = 60e3; // between two requests the check sends
export const AWAY_MS = 600e3; // away this long before a return checks
export const HOME_SPARE = 150; // credits a tap or a return leaves for games today (the home screen may spend them)
export const CHECK_TIMEOUT_MS = 8e3; // the check gives up here, whatever the native request does
export const RADIUS_M = 80e3; // the game's default radius around the airport (opensky.js LiveFeed)
export const DAILY_MIN_WAIT_S = 3600; // a daily pause lasts at least an hour (opensky.js LiveFeed)

/**
 * Whether a check runs now, and if not, why. The first refusal wins, in this order: 'gate' (a gate screen is up, or the game is
 * not on the menu), 'busy' (a check is on its way), 'not-away' (a return that was not away 10 min), 'gap' (a request was sent
 * within the minute; lastSentMs is the request, not the saved record), 'waiting' (OpenSky's rate pause or daily reset time is
 * still ahead), 'daily' (the day's free data is used up until the local day changes), 'offline' (the device says it is offline;
 * a tap always sends, since navigator.onLine is coarse), 'spare' (a tap or a return with fewer than HOME_SPARE credits today).
 * The home screen skips only 'spare'. Returns { run, why }.
 */
export function checkDue({ trigger, nowMs, rec = null, awayMs = 0, inFlight = false, online = true, gateClear = true, lastSentMs = 0 }) {
  const no = (why) => ({ run: false, why });
  if (!gateClear) return no('gate');
  if (inFlight) return no('busy');
  if (trigger === 'resume' && awayMs < AWAY_MS) return no('not-away');
  if (lastSentMs && nowMs - lastSentMs >= 0 && nowMs - lastSentMs < CHECK_GAP_MS) return no('gap');
  if (rec && rec.retryAt != null && rec.retryAt > nowMs) return no('waiting');
  if (rec && rec.state === 'paused' && rec.reason === 'daily' && rec.retryAt == null && sameDay(rec.at, nowMs)) return no('daily');
  if (!online && trigger !== 'tap') return no('offline');
  if (trigger !== 'home' && rec && rec.state === 'working' && Number.isFinite(rec.remaining) && rec.remaining < HOME_SPARE && sameDay(rec.at, nowMs)) return no('spare');
  return { run: true, why: '' };
}

/**
 * The record a check leaves in save.feed: { state, reason, httpStatus, remaining, real, at, retryAt }. `result` is what the
 * check got back: { offline: true } when the device says it is offline, else OpenSky's answer (fetchStates: ok, status,
 * remaining, retryAfter, flights, time) or { ok: false, status: 0 } for no answer. `realCount` is the planes in the area
 * (countInArea), kept as `real` and never shown. `online` tells a failed request with no answer apart (no-internet or network).
 */
export function checkRecord(result, nowMs, realCount = 0, online = true) {
  const base = { state: 'offline', reason: 'no-internet', httpStatus: null, remaining: null, real: 0, at: nowMs, retryAt: null };
  if (result.offline) return base;
  const remaining = Number.isFinite(result.remaining) ? result.remaining : null;
  // the day's credits are spent (as LiveFeed.onResult says), or adsb.lol says its day's allowance is (result.daily, adsblol.js)
  const daily = result.daily === true || (remaining !== null && remaining <= 3);
  if (result.ok) {
    return daily
      ? { ...base, state: 'paused', reason: 'daily', remaining, real: realCount, at: nowMs }
      : { ...base, state: 'working', reason: '', remaining, real: realCount, at: nowMs };
  }
  if (result.status === 429) {
    const retryAfter = Number.isFinite(result.retryAfter) ? result.retryAfter : null;
    if (daily) {
      // a daily 429 says when the allowance is back only when OpenSky sends the wait (X-Rate-Limit-Retry-After-Seconds)
      const retryAt = retryAfter === null ? null : nowMs + Math.max(DAILY_MIN_WAIT_S, retryAfter) * 1000;
      return { ...base, state: 'paused', reason: 'daily', httpStatus: 429, remaining, retryAt, at: nowMs };
    }
    return { ...base, state: 'paused', reason: 'rate', httpStatus: 429, remaining, retryAt: nowMs + Math.max(60, retryAfter || 600) * 1000, at: nowMs };
  }
  if (!result.status) return { ...base, state: 'offline', reason: online ? 'network' : 'no-internet', at: nowMs };
  return { ...base, state: 'offline', reason: 'http', httpStatus: result.status, at: nowMs };
}

/**
 * The words a refused tap shows in a toast (2.4 s), or '' when the refusal needs none (the record re-renders the line itself,
 * or the player is in a game or a gate is up).
 */
export function tapNote(why, rec, nowMs) {
  // the same words as the home line and the HUD (feedstate.js): "No real planes right now", "Real planes back tomorrow"
  if (why === 'gap') {
    return rec && rec.state === 'working' ? 'Checked a moment ago. Try again in a minute.' : 'No real planes right now. Try again in a minute.';
  }
  if (why === 'waiting') {
    if (rec.reason === 'daily') return 'Real planes back tomorrow.';
    return `No real planes right now. Try again in ${waitWords(rec.retryAt - nowMs)}.`;
  }
  if (why === 'daily') return 'Real planes back tomorrow.';
  // a tap under the day's credit reserve is refused without a word: the budget is not the player's to read (requirements item 5)
  return '';
}
