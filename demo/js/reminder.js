// The reminders (Settings; DECISIONS 362 and 392). Pure: no DOM, no bridge, no clock of its own. The shell arms two inexact alarms
// (DailyReminder.kt): 9 am for the daily challenge, 7 pm for the streak saver and the Sunday recap. It posts at most one notice a
// day, and this file holds the rule it follows, so the tests can pin it, and the Settings words and the one-time card's rule.
//
// The time: the daily challenge is ready from local midnight, so its reminder comes at 9 am, the phone's own time. Days are local
// day numbers (airportdb.js localDay); the daily number is that less DAILY_EPOCH, as the shell computes them.
import { DAILY_EPOCH } from './airportdb.js?v=86c2b44d';
import { weekendOf } from './weekend.js?v=86c2b44d';
import { streakState, RUN_GAP } from './streak.js?v=86c2b44d';

export const REMINDER_HOUR = 9;
export const EVENING_HOUR = 19; // the streak saver and the Sunday recap
export const QUIET_FROM = 21; // no notice from 9 pm to 8 am on the phone's clock, whatever the alarm's time
export const QUIET_TO = 8;
export const RECAP_WEEKDAY = 6; // Sunday, when Monday is 0 (weekday)
export const OFFER_MAX = 2; // the one-time card is shown at most twice in all
export const OFFER_GAP = 7; // days between the two showings

/**
 * The rule the shell applies when the alarm fires: one notification, and only when the reminder is on, the phone allows notifications, the
 * player has not played today's daily (playedDaily is the daily number of the last daily played), and no reminder went out today (shownDay).
 */
export function reminderDue({ on = false, allowed = false, playedDaily = 0, todayDaily, shownDay = 0 } = {}) {
  return !!on && !!allowed && playedDaily !== todayDaily && shownDay !== todayDaily;
}

/** Monday 0 to Sunday 6 for a local day number (1 January 1970 was a Thursday). */
export function weekday(day) {
  return (((day + 3) % 7) + 7) % 7;
}

/** The Monday that starts the week of a local day number: the recap's week runs Monday to Sunday. */
export function weekStart(day) {
  return day - weekday(day);
}

/** Whether a phone hour (0 to 23) is in quiet hours, when no notice goes out. */
export function quietHour(hour) {
  return hour >= QUIET_FROM || hour < QUIET_TO;
}

/**
 * Whether the play streak ends at midnight tonight: it is alive, and today is its last day (streakState 'Last day!'). Missing today
 * then ends it. A streak that is played today, or has one day or two to spare, does not end tonight.
 */
export function streakEndsTonight(streak, today) {
  if (!streak || streak.last === null || streak.last === undefined) return false;
  const st = streakState({ last: streak.last, count: streak.count || 0 }, today);
  return st.status === 'risk' && st.gap === RUN_GAP;
}

/** The week's record for the recap (save.weekRecap): the Monday it is for, the planes landed, the best game's count and its airport. */
export function emptyWeekRecap() {
  return { start: 0, landed: 0, best: 0, at: '' };
}

/** The week's record checked: whole numbers and a short city. Anything damaged reads as no week, so nothing is recapped by accident. */
export function sanitizeWeekRecap(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return emptyWeekRecap();
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return { start: int(w.start), landed: int(w.landed), best: int(w.best), at: typeof w.at === 'string' ? w.at.slice(0, 40) : '' };
}

/**
 * The week's record after one landing on local day `today`. gameLanded is the planes this game has landed so far, with this one (sim.landed),
 * and at is the airport's city. A landing in a new week starts the week from nothing. The best game is the most planes one game has landed
 * this week, and its airport is the one it was played at.
 */
export function weekAfterLanding(week, today, { gameLanded = 1, at = '' } = {}) {
  const start = weekStart(today);
  const w = sanitizeWeekRecap(week);
  const cur = w.start === start ? w : { ...emptyWeekRecap(), start };
  const better = gameLanded > cur.best;
  return {
    start,
    landed: cur.landed + 1,
    best: better ? gameLanded : cur.best,
    at: better ? String(at).slice(0, 40) : cur.at,
  };
}

/**
 * The notice an alarm may post, or '' for none (DECISIONS 392). slot: 'morning' (9 am, the daily challenge) or 'evening' (7 pm: the streak
 * saver, or the Sunday recap). on: the reminders switched on AND allowed by the phone (a kind the phone does not allow is off here).
 * hour: the phone's hour now. today: the local day. playedDaily: the daily number last played. shownDay: the daily number of the last notice
 * of any kind. streak: { last, count } (save.streak). week: the week's record (save.weekRecap).
 * The rules, in order:
 * - nothing in quiet hours, and at most one notice a day in all (shownDay);
 * - the streak saver first: it is due at 7 pm when the streak ends tonight and no plane has been landed today;
 * - the daily challenge at 9 am, when today's daily is not played, unless the streak saver is due tonight (that day's one notice);
 * - the Sunday recap at 7 pm, when the player landed a plane this week and not yet today, and the streak saver is not due.
 * A recap is not sent on a Sunday the player has already played, and not on a Sunday the daily took at 9 am (one notice a day).
 */
export function noticeDue({ slot = 'morning', hour = 12, on = {}, today, playedDaily = 0, shownDay = 0, streak = null, week = null } = {}) {
  if (quietHour(hour)) return '';
  const todayDaily = today - DAILY_EPOCH;
  if (shownDay === todayDaily) return '';
  const ends = !!on.streak && streakEndsTonight(streak, today);
  if (slot === 'evening') {
    if (ends) return 'streak';
    const w = sanitizeWeekRecap(week);
    const playedToday = !!streak && streak.last === today;
    if (on.recap && weekday(today) === RECAP_WEEKDAY && !playedToday && w.start === weekStart(today) && w.landed > 0) return 'recap';
    return '';
  }
  if (on.daily && playedDaily !== todayDaily && !ends) return 'daily';
  return '';
}

/** The one-time card's record (save.reminderOffer): how many times it was shown, and the local day of the last showing. */
export function emptyOffer() {
  return { shown: 0, last: 0 };
}

/** The offer record checked: a count from 0 to OFFER_MAX and a day, or the empty record. */
export function sanitizeOffer(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return emptyOffer();
  const shown = Number.isInteger(o.shown) && o.shown >= 0 ? Math.min(OFFER_MAX, o.shown) : 0;
  const last = Number.isInteger(o.last) && o.last >= 0 ? o.last : 0;
  return { shown, last };
}

/**
 * Whether the one-time card is shown now (DECISIONS 392). It is for a player who has the reminders off, on Android: a player of 13 and up
 * who agreed (canPlay). It is due after the second distinct day played (secondDay: review.js's second day) or after the first daily challenge is finished
 * (dailyDone), whichever comes first. Never on the first launch's day (firstDay: save.pro.first), and at most OFFER_MAX times, the second
 * no sooner than OFFER_GAP days after the first. The caller shows it only over the home screen, never during a game.
 */
export function offerDue({ offer, today, firstDay = 0, secondDay = false, dailyDone = false, anyOn = false, native = false, canPlay = false } = {}) {
  if (!native || !canPlay || anyOn) return false;
  if (!(secondDay || dailyDone)) return false;
  if (!(firstDay > 0 && today > firstDay)) return false;
  const o = sanitizeOffer(offer);
  if (o.shown >= OFFER_MAX) return false;
  return o.shown === 0 || today - o.last >= OFFER_GAP;
}

/** The record after the card is shown on local day `today`. */
export function offerShown(offer, today) {
  const o = sanitizeOffer(offer);
  return { shown: o.shown + 1, last: today };
}

/**
 * The Settings line under a switch, in plain words: the same states for each reminder (reminderNote is the daily one's, kept as it was).
 * native: the Android app is running (the switch works only there). allowed: the phone lets Short Final post notifications. denied: the
 * player just said no to the phone's question.
 */
function switchNote({ off, on }, { native = true, on: isOn = false, allowed = true, denied = false } = {}) {
  if (!native) return 'Only in the Android app.';
  if (denied) return 'No problem. The reminder stays off. You can turn on notifications for Short Final in the phone’s settings, then try again.';
  if (!isOn) return off;
  if (!allowed) return 'On, but notifications are off for Short Final, so none will show. Turn them on in the phone’s settings.';
  return on;
}

/** The Streak saver's line under its switch. */
export function streakNote(state = {}) {
  return switchNote({
    off: 'Off. A nudge at 7 pm, only when your streak ends that night.',
    on: 'On: a nudge at 7 pm, only when your streak ends that night.',
  }, state);
}

/** The Weekly recap's line under its switch. */
export function recapNote(state = {}) {
  return switchNote({
    off: 'Off. A recap on Sunday at 7 pm, if you landed a plane that week and not yet that day.',
    on: 'On: a recap on Sunday at 7 pm, if you landed a plane that week and not yet that day.',
  }, state);
}

/**
 * The Settings line under the daily challenge switch, in plain words. native: the Android app is running (the switch works only there).
 * allowed: the phone lets Short Final post notifications. denied: the player just said no to the phone's question.
 */
export function reminderNote({ native = true, on = false, allowed = true, denied = false } = {}) {
  if (!native) return 'Only in the Android app.';
  if (denied) return 'No problem. The reminder stays off. You can turn on notifications for Short Final in the phone’s settings, then try again.';
  if (!on) return `Off. Turn it on for one reminder a day at ${REMINDER_HOUR} am, your time.`;
  if (!allowed) return 'On, but notifications are off for Short Final, so none will show. Turn them on in the phone’s settings.';
  return `On: one reminder a day at ${REMINDER_HOUR} am, your time, unless you have played today’s challenge.`;
}

/** The 9 am notice's words on a plain day (reminder.js dailyNoticeText; the shell has the same words in strings.xml). */
export const DAILY_NOTICE = 'Today’s daily challenge is ready. The same planes for everyone today.';

/**
 * Whether the 9 am notice names the weekend event (3.3): today is in the weekend `w` the shell was given, and that weekend is not flown
 * yet (flown: the last weekend flown). A stale `w`, or no title, names nothing, so the notice is the daily's own words. ReminderRule.kt
 * namesWeekend is the phone's copy of this rule.
 */
export function namesWeekend({ today, w = 0, title = '', flown = 0 } = {}) {
  return !!title && w > 0 && weekendOf(today) === w && flown !== w;
}

/** The 9 am notice's words: the same sentence, and on a weekend morning the weekend's sentence in its place. One notice, one sentence more. */
export function dailyNoticeText(args = {}) {
  return namesWeekend(args) ? `Today’s daily challenge is ready. ${args.title} is on this weekend too.` : DAILY_NOTICE;
}
