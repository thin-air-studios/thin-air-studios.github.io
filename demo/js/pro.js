// Short Final Pro (2.7; DECISIONS 280): the rules for the free games, the Play button's free-games line, the upgrade sheet's
// words, the Settings Pro row and the About line. Pure: no DOM, no bridge, no clock of its own. The caller passes today as the
// local day number (airportdb.js localDay), so the tests drive the days. The purchase state comes from the Android shell
// (propay.js); the save keeps only the day counts (save.pro).
//
// The rules the owner set:
// - the first 3 days (the trial, local days 1-3 counted from the first run) are unlimited at every airport;
// - from day 4 the daily challenge is free and never counts (its replays too, and it keeps the streak); every other game,
//   at any airport, the busiest ones included, is one of 3 free games a day (a game counts when it starts; a restart or
//   Fly again is a new game; a game that cannot load does not count);
// - Pro is unlimited everywhere, and nothing else is locked;
// - the count is by local day, and the day never moves back: a clock set backwards keeps the day it had reached and its count.

export const PRO_PRODUCT = 'short_final_pro'; // the Google Play product id (the owner creates it in Play Console)
export const TRIAL_DAYS = 3;
export const FREE_GAMES = 3;

const whole = (v) => Number.isInteger(v);

/** A save's pro block, checked: { first, last, n } with whole numbers, first <= last and n >= 0. Anything else is null. */
export function validPro(p) {
  return !!p && typeof p === 'object' && whole(p.first) && whole(p.last) && whole(p.n) && p.first <= p.last && p.n >= 0;
}

/**
 * The state on today's local day. first: the day of the first run (the trial starts there). last: the highest day the game has
 * seen. n: the free games counted on last. A new day (today after last) starts the count at 0. A day before last (the clock set
 * back) keeps last and its count, so no game is given back. A missing or broken block starts today as the first day, unless the
 * save is an existing player's (existing: they played before this build): the trial is for new players only (DECISIONS 291), so
 * their first day is the trial's last day, and day 4 (the limit) is today.
 */
export function advancePro(p, today, { existing = false } = {}) {
  if (!validPro(p)) {
    const first = existing ? today - TRIAL_DAYS : today;
    return { first, last: today, n: 0 };
  }
  if (today > p.last) return { first: p.first, last: today, n: 0 };
  return { first: p.first, last: p.last, n: p.n };
}

/** The trial's day: 1 on the first local day, 2 on the next, and so on. */
export const dayNumber = (state) => state.last - state.first + 1;

/** Inside the first 3 days: unlimited at every airport. Nothing about the trial is shown (the owner's rule). */
export const inTrial = (state) => dayNumber(state) <= TRIAL_DAYS;

/** The free games left today (from day 4 on). */
export const freeLeft = (state) => Math.max(0, FREE_GAMES - state.n);

/**
 * The rule for a game about to start. daily: the daily challenge (free; it never counts). isPro: Pro bought, or the test build.
 * Returns { state, limited, left, allowed }: state is the advanced block (store it on the save); limited is whether the limit
 * applies to this game (day 4 on, not Pro, not the daily); left is the free games left today; allowed is whether the game may start.
 */
export function gameRule({ pro, today, daily = false, isPro = false } = {}) {
  const state = advancePro(pro, today);
  const limited = !isPro && !daily && !inTrial(state);
  const left = freeLeft(state);
  return { state, limited, left, allowed: !limited || left > 0 };
}

/**
 * The block after a game starts. Every game counts except the daily challenge (the count is the day's, so a game in the trial
 * never reaches day 4's count). Call it once the game has loaded and begun.
 */
export function countGame(state, { daily = false } = {}) {
  if (daily) return { ...state };
  return { ...state, n: state.n + 1 };
}

/**
 * The Play button's free-games line (its own line in the pill). Shown only from day 4 and never to Pro: "2 free games left
 * today", "No free games left today", or, on the daily row, "Daily is always free". Empty when nothing is said.
 */
export function playLeftWords({ pro, today, daily = false, weekend = false, isPro = false } = {}) {
  const state = advancePro(pro, today);
  if (isPro || inTrial(state)) return '';
  if (daily) return 'Daily is always free';
  if (weekend) return 'Weekend event is always free';
  const left = freeLeft(state);
  if (left === 0) return 'No free games left today';
  return `${left} free game${left === 1 ? '' : 's'} left today`;
}

/**
 * Whether the end card offers Pro (without blocking it): from the third free game's end card on, from day 4, not for Pro and not
 * for the daily challenge. The sheet itself opens only when the player asks, or when a game is next asked for.
 */
export function endOfferDue({ pro, today, daily = false, isPro = false } = {}) {
  const state = advancePro(pro, today);
  return !isPro && !daily && !inTrial(state) && state.n >= FREE_GAMES;
}

/** The upgrade sheet's words. price: the Google Play price text ('' until the shell has it: the button then says just Buy). */
export function upgradeWords({ price = '', reason = 'gate' } = {}) {
  const buy = price ? `Buy for ${price}` : 'Buy';
  const used = reason === 'end'
    ? 'You’ve used today’s 3 free games. Pro gives unlimited games at every airport.'
    : 'You’ve used today’s 3 free games. They come back at midnight, or go unlimited now.';
  return {
    title: 'Short Final Pro',
    lead: 'Unlimited games at every airport, whenever you like. One payment in Google Play, no subscription.',
    used,
    keep: 'Everything else stays free: every difficulty, Real planes only, music, video sharing and achievements.',
    daily: 'Not now is fine. Today’s challenge is always free, and it keeps your streak.',
    buy,
    later: 'Not now',
  };
}

/** The sentence for the About page (static: the same in every state). */
export const ABOUT_PRO_LINE = 'Short Final Pro is a one-time purchase in Google Play: unlimited games at every airport. Everything else is free, and the daily challenge and the weekend event always are.';

/**
 * The Settings Pro row. info: the shell's state { always, pro, pending, price, status, message } (propay.js), status one of
 * 'web' (no app shell), 'checking', 'ready', 'unavailable', 'error'. Returns the status line, whether Buy shows, and its label.
 * It never says how many days are left.
 */
export function settingsProWords(info = {}) {
  const { always = false, pro = false, pending = false, price = '', status = 'checking', message = '' } = info;
  if (always) return { status: 'Included in this test build. Unlimited games at every airport.', buy: false, buyLabel: '' };
  if (pro) return { status: 'Unlocked. Unlimited games at every airport.', buy: false, buyLabel: '' };
  if (pending) return { status: 'Purchase pending. Pro unlocks when Google Play completes it.', buy: false, buyLabel: '' };
  const buyLabel = price ? `Buy for ${price}` : 'Buy';
  if (status === 'web') return { status: 'Pro is bought in the Short Final app on Google Play.', buy: false, buyLabel: '' };
  if (status === 'unavailable') {
    return { status: message || 'Pro isn’t available on this phone right now.', buy: false, buyLabel: '' };
  }
  if (status === 'error') return { status: message || 'Google Play didn’t answer. Try again in a moment.', buy: true, buyLabel };
  if (status === 'checking') return { status: 'Checking Google Play…', buy: true, buyLabel };
  return { status: 'Unlimited games at every airport. One payment, no subscription.', buy: true, buyLabel };
}

/** The words after Restore purchase: what the shell found. restoring: the player asked and the answer is in. */
export function restoreWords(info = {}) {
  if (info.always) return 'This test build is always Pro.';
  if (info.pro) return 'Pro is unlocked on this phone.';
  if (info.pending) return 'Your purchase is pending in Google Play. Pro unlocks when it completes.';
  if (info.status === 'unavailable' || info.status === 'error') return info.message || 'Google Play didn’t answer. Try again in a moment.';
  return 'No Pro purchase found on this Google Play account.';
}

/**
 * The line under the sheet's Buy. When Buy is not shown, the reason it is not (settingsProWords). When Buy is shown, the shell's
 * note for a problem: a ready product (status 'ready') has none, so an old message never sits under a working Buy (DECISIONS 293).
 */
export function sheetNote(info = {}) {
  const sw = settingsProWords(info);
  if (!sw.buy) return sw.status;
  if (info.status === 'ready') return '';
  return info.message || (info.status === 'error' ? sw.status : '');
}
