// The rating request (2.9; DECISIONS 358): when the game asks Google Play's own in-app review. Pure: no DOM, no bridge, no clock of
// its own. The caller passes today as the local day number (airportdb.js localDay), so the tests drive the days. The save keeps only
// the counts and the days (save.review); the question itself is Google's (platform.js requestReview, ReviewPrompt.kt).
//
// Google's rules for the question, which the game keeps: no "do you like the game?" asked first, no routing of unhappy players
// elsewhere, no reward for a review. Google decides whether its box shows and never says, so the game asks once its own rules
// allow it and then says nothing more.
//
// The owner's rules:
// - only after a good game's end card has settled (the caller waits for REVIEW_SETTLE_MS): a 3-star game, a personal best, or a
//   long run of landings (goodGame); never during play, since the card only exists once the game is over;
// - never after a crash (two aircraft touching, or one on a runway: CRASH_REASONS) or a lost game (no landing in it);
// - never on the first day, and only after at least 5 finished games across at least 2 local days;
// - at most once every 30 days by the game's own rule (the day of the last ask, whether or not Google showed the box);
// - never before the age answer (the caller passes gate: gateState(save, now) === 'home');
// - never while the app is in the background (the caller passes visible: !document.hidden): a request started there may never show,
//   and the game would count an ask that the player never saw.

/** The numbers the rules use. */
export const REVIEW = Object.freeze({
  games: 5, // finished games before the first ask
  days: 2, // local days those games fall on (the first day and one more)
  gap: 30, // days between two asks
  stars: 3, // stars for a good game (config.js STAR_GOALS: 50 points)
  streak: 5, // landings in a row for a long run
});

/** The end cards that are crashes: two aircraft touching (sim.js crashPair 'collision') or a runway incursion ('runway'). */
export const CRASH_REASONS = Object.freeze(['collision', 'runway']);

/**
 * How long after the end card is shown the question may come: after the card's count-up (endcard.js COUNT_MS, 900 ms) and its touch
 * hold (650 ms), with a beat to spare, so the card is still and the player has seen the score.
 */
export const REVIEW_SETTLE_MS = 1200;

/** The save's review block when nothing has been counted yet. */
export function emptyReview() {
  return { games: 0, first: null, second: null, asked: null };
}

const day = (v) => (Number.isInteger(v) ? v : null);

/**
 * The save's review block, checked: whole numbers, and two different days at most (first, then the second day). Anything damaged
 * reads as nothing counted, so a broken block never blocks play and never asks by accident.
 */
export function sanitizeReview(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return emptyReview();
  const first = day(r.first);
  let second = day(r.second);
  if (first === null || second === first) second = null;
  return {
    games: Number.isInteger(r.games) && r.games >= 0 ? r.games : 0,
    first,
    second,
    asked: day(r.asked),
  };
}

/**
 * A finished game (not a demo) on today's local day. The first game's day is the first day; the first day that is not that one is
 * the second, and no more days are kept (the rules need two).
 */
export function noteFinishedGame(review, today) {
  const r = sanitizeReview(review);
  const games = r.games + 1;
  if (r.first === null) return { ...r, games, first: today };
  if (r.second === null && today !== r.first) return { ...r, games, second: today };
  return { ...r, games };
}

/** The game asked (today's local day): the 30-day rule starts here, whether or not Google showed the box. */
export function noteAsked(review, today) {
  return { ...sanitizeReview(review), asked: today };
}

/**
 * Whether the end card that just settled is a good game's. reason: the sim's crash reason (null or undefined when none). landed: the
 * landings in the game. stars: the stars the score earned (config.js STAR_GOALS). personalBest: a new best at this airport with a
 * score. landingStreak: the longest run of landings without a close call in the game (sim.bestStreak).
 */
export function goodGame({ reason = '', landed = 0, stars = 0, personalBest = false, landingStreak = 0 } = {}) {
  if (CRASH_REASONS.includes(reason)) return false;
  if (!(landed >= 1)) return false;
  return stars >= REVIEW.stars || !!personalBest || landingStreak >= REVIEW.streak;
}

/**
 * Whether the question may be asked now. good: the end card is a good game's (goodGame). gate: the age answer is in and the terms are
 * agreed (gateState 'home'). visible: the app is on screen (not backgrounded during the settle wait). today: the local day. A clock
 * set back waits for the days to catch up, so it never asks twice.
 */
export function reviewDue({ review, today, good = false, gate = false, visible = true } = {}) {
  const r = sanitizeReview(review);
  if (!gate || !good) return false;
  if (!visible) return false; // backgrounded: the request may never show, so it is not asked (and not counted)
  if (r.games < REVIEW.games) return false;
  if (r.first === null || r.second === null) return false;
  if (!(today > r.first)) return false; // never on the first day
  if (r.asked !== null && today - r.asked < REVIEW.gap) return false;
  return true;
}
