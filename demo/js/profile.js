// The age answer and the Agree record (save.profile). The answer is the birth year, and the birth month when the year alone
// cannot say whether the player is 13 yet. It stays on this phone and is never sent (requirement 23). Reset progress keeps it;
// only Android's clearing of the app's storage or an uninstall removes it. A player under 13 gets no further than the age
// screen. Every function takes the clock as { year, month } (clockNow), so the tests pass their own days.
//
// The shell keeps the answer in its no-backup folder (platform.js ageStore), so Android's cloud backup never copies it. In
// save.profile it is only in memory: forStorage leaves it out of what is written to the save, and hydrateAge puts it back
// when the save loads.
import { ageStore } from './platform.js?v=7227d0de';

/** The terms version a player agrees to. A change asks Agree once more (requirement 24). */
export const LEGAL_VERSION = '2.0';

const FIRST_YEAR = 1900;

const validYear = (y, nowYear) => Number.isInteger(y) && y >= FIRST_YEAR && y <= nowYear;
const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;

/** Today by the phone's clock: { year, month }, the month 1 to 12. */
export function clockNow() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** The answer as it is kept: { year, month }, the month null when the year alone was enough. Null for an invalid year. */
function cleanAge(age, now) {
  if (!age || typeof age !== 'object' || !validYear(age.year, now.year)) return null;
  return { year: age.year, month: validMonth(age.month) ? age.month : null };
}

/**
 * True when the year alone cannot tell whether the player is 13 yet: they turn 13 in this calendar year, so the month is asked
 * too. Before that year the player is under 13; from the year after it, 13 or older.
 */
export function needsMonth(year, now) {
  return validYear(year, now.year) && now.year - year === 13;
}

/**
 * The player's band, from the answer: 'under13', '13plus', or 'month' (the year turns 13 this year and no month is on file).
 * Null when there is no valid answer. In the birth month itself the day is not asked, so the player counts as under 13 until
 * the next month begins: the reading that never lets a child in early.
 */
export function ageBand(age, now) {
  const a = cleanAge(age, now);
  if (!a) return null;
  const years = now.year - a.year;
  if (years >= 14) return '13plus';
  if (years <= 12) return 'under13';
  if (a.month === null) return 'month';
  return now.month > a.month ? '13plus' : 'under13';
}

/**
 * Puts the answer the phone keeps into save.profile, after the save loads. The phone's answer wins. A year an older build left
 * in the save itself moves to the phone (once). Returns true when the save held an answer key, so the caller writes the save
 * back without it.
 */
export function hydrateAge(save, now = clockNow()) {
  if (!save || typeof save !== 'object') return false;
  const p = save.profile && typeof save.profile === 'object' ? save.profile : null;
  const inSave = !!p && ('birthYear' in p || 'birthMonth' in p);
  let age = cleanAge(ageStore.read(), now);
  if (!age && p) {
    age = cleanAge({ year: p.birthYear, month: p.birthMonth }, now);
    if (age) ageStore.write(age);
  }
  if (p) {
    p.birthYear = age ? age.year : null;
    p.birthMonth = age ? age.month : null;
  } else if (age) {
    save.profile = { birthYear: age.year, birthMonth: age.month, answeredAt: null, agreed: null };
  }
  return inSave;
}

/** The save as it is written to storage: the answer is left out (it stays in the phone's own file). */
export function forStorage(save) {
  const p = save && save.profile;
  if (!p || typeof p !== 'object' || !('birthYear' in p || 'birthMonth' in p)) return save;
  const { birthYear, birthMonth, ...profile } = p; // eslint-disable-line no-unused-vars
  return { ...save, profile };
}

/**
 * What the first-launch flow shows: 'age' (no valid answer yet), 'month' (the year is answered and its month is still to
 * come), 'under13' (the friendly screen, and no way into the game), 'agree' (13 or older, not agreed at the current
 * LEGAL_VERSION), or 'home'.
 */
export function gateState(save, now) {
  const p = save && save.profile;
  if (!p) return 'age';
  const band = ageBand({ year: p.birthYear, month: p.birthMonth }, now);
  if (band === null) return 'age';
  if (band === 'month') return 'month';
  if (band === 'under13') return 'under13';
  return p.agreed && p.agreed.version === LEGAL_VERSION ? 'home' : 'agree';
}

/**
 * Records the age answer: the birth year, and the birth month when needsMonth says the year alone is not enough. Returns the
 * gate state it leads to ('under13' or 'agree'), or null when the answer is not valid, the month is missing, or the answer is
 * complete already (it cannot change). A year-only answer waiting for its month takes the month here, with the same year.
 */
export function answerAge(save, age, now, todayISO) {
  const a = cleanAge(age, now);
  if (!save || !a || (needsMonth(a.year, now) && a.month === null)) return null;
  const p = save.profile || null;
  const had = p ? ageBand({ year: p.birthYear, month: p.birthMonth }, now) : null;
  if (had !== null && had !== 'month') return null;
  if (had === 'month' && p.birthYear !== a.year) return null;
  const keep = had === 'month';
  save.profile = {
    birthYear: a.year,
    birthMonth: a.month,
    answeredAt: keep && p.answeredAt ? p.answeredAt : todayISO,
    agreed: keep && p.agreed ? p.agreed : null,
  };
  ageStore.write(a); // on the phone's own file, never in the backed-up save (forStorage)
  return gateState(save, now);
}

/** Records Agree at the current LEGAL_VERSION with today's date. False when there is no age answer yet. */
export function agree(save, todayISO) {
  if (!save || !save.profile) return false;
  save.profile.agreed = { version: LEGAL_VERSION, at: todayISO };
  return true;
}

/**
 * Reset progress: the Agree record goes, so Agree is asked again. The settings stay (the caller keeps them), and so does the age
 * answer: it is not progress, and a child cannot answer again through Reset. The sign-in session stays too, so the player can
 * still use Remove my scores for what is already on our server (nothing is posted until Agree is given again).
 */
export function clearAgreement(save) {
  if (save.profile) save.profile.agreed = null;
  return save;
}

/** Online play and Play Games need 13 or older and an Agree at the current version. */
export function canPlayGames(save, now) {
  const p = save && save.profile;
  if (!p || !p.agreed || p.agreed.version !== LEGAL_VERSION) return false;
  return ageBand({ year: p.birthYear, month: p.birthMonth }, now) === '13plus';
}
