// Google Play Games on the page (3.0): the words of its buttons, the Settings row, the one sign-in offer and the line for a sign-in
// that failed after a tap. Pure: the caller passes the sign-in state (platform.js playGames.status), so the same rule writes the
// same words in every place it shows (the Leaderboards and Achievements buttons, Settings). The shell does the Play Games calls.
// The states: 'checking' (a check or a sign-in is running), 'off' (no answer yet, while Play Games is on), 'signed-in', 'signed-out',
// and 'unknown' (the call failed: that is not a sign-out, and it does not settle the one offer). 'none' is a page with no Play Games
// (a browser): it is not an answer still to come, so it is never pending and says nothing (3.1).

export const PGS_SIGN_IN = 'Sign in to Google Play Games';
export const PGS_CHECKING = 'Checking Play Games…';
export const PGS_BOARDS = 'Google Play Games boards';
export const PGS_OPEN = 'Open in Google Play Games';
export const PGS_ROW_SIGN_IN = 'Sign in';
export const PGS_FAILED = "Couldn't sign in to Play Games. Try again later.";

/** No answer yet: a check or a sign-in is running ('checking'), or no check has been made yet ('off', while Play Games is on). */
export function isPending(state) {
  return state === 'checking' || state === 'off';
}

/** The Leaderboards button: the boards when signed in, the check's words while it runs, the sign-in otherwise. */
export function boardsLabel(state) {
  if (state === 'signed-in') return PGS_BOARDS;
  return isPending(state) ? PGS_CHECKING : PGS_SIGN_IN;
}

/** The Achievements button: open them in Play Games when signed in, the check's words while it runs, the sign-in otherwise. */
export function achievementsLabel(state) {
  if (state === 'signed-in') return PGS_OPEN;
  return isPending(state) ? PGS_CHECKING : PGS_SIGN_IN;
}

/**
 * The Settings row: its line ('' for none) and whether it offers the Sign in button. Signed in it says so and offers nothing;
 * while the check runs it says 'Checking…' (the cloud line says the full words); signed out, or unknown, it offers the one button.
 */
export function playGamesRow(state) {
  if (state === 'none') return { line: '', signIn: false };
  if (state === 'signed-in') return { line: 'Signed in', signIn: false };
  if (isPending(state)) return { line: 'Checking…', signIn: false };
  return { line: '', signIn: true };
}

/**
 * The one sign-in offer (3.0): due while Play Games is allowed and no offer has been made on this phone (the shell keeps that: it is
 * the first Agree, or the first launch of this install that finds Play Games allowed). Only a definite answer from the automatic check
 * settles it: signed out asks Google's account box once, by itself; signed in needs nothing. Any other answer (checking, off, unknown:
 * the check failed) keeps it due, so a later check can ask. Returns whether to ask now, and whether the shell should record it settled.
 */
export function signInOffer(due, state) {
  if (!due) return { ask: false, settle: false };
  if (state === 'signed-in') return { ask: false, settle: true };
  if (state === 'signed-out') return { ask: true, settle: true };
  return { ask: false, settle: false };
}
