import { WEB_DEMO } from './flavor.js?v=7227d0de';
// The first-launch gate (requirements 23 and 24, screens 9): the age question (the year, then the month when the year alone
// cannot tell whether the player is 13 yet), then Agree for a player 13 or older, or the friendly screen for a player under 13,
// which has no way into the game, no links out and no request. profile.js decides which one a launch shows; this file draws
// them and records the answers. The age answer is kept in save.profile on this phone and goes nowhere (tests/profile.test.mjs
// checks that).
import { gateState, answerAge, agree, canPlayGames, needsMonth, clockNow } from './profile.js?v=7227d0de';
import { writeSave } from './storage.js?v=7227d0de';
import { playGames, exitApp } from './platform.js?v=7227d0de';
import { signInOffer } from './playgames.js?v=7227d0de';
import { register, openScreen, closeScreen } from './screenstack.js?v=7227d0de';
import { todayKey } from './util.js?v=7227d0de';
import { openLegal } from './legal.js?v=7227d0de';

/** The gate screen each state shows. The home screen has none. */
export const GATE_SCREEN = { age: 'gate-age', month: 'gate-month', under13: 'gate-under13', agree: 'gate-agree' };

/** The gate screens: while one is up, the home screen is not the one showing. */
export const GATE_SCREENS = ['gate-age', 'gate-month', 'gate-under13', 'gate-agree'];

/** True when no gate screen is up (isShown(id) says whether one is). The home screen's check waits for this. */
export function gatesClear(isShown) {
  return !GATE_SCREENS.some((id) => isShown(id));
}

const FIRST_PICK = 1925; // the picker's oldest year: no default, and no hint of an age limit (requirement 23)

/** The years the picker offers, this year first. */
export function yearChoices(nowYear) {
  const out = [];
  for (let y = nowYear; y >= FIRST_PICK; y--) out.push(y);
  return out;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The months the picker offers, January first: { value: 1 to 12, name }. */
export function monthChoices() {
  return MONTHS.map((name, i) => ({ value: i + 1, name }));
}

/** The line above the Agree text for a player whose agreed terms are out of date (a changed LEGAL_VERSION). */
export function agreeNotice(save) {
  return save && save.profile && save.profile.agreed ? 'Our terms have changed. Please read them once more.' : '';
}

const $ = (id) => document.getElementById(id);
const shown = (id) => () => $(id).classList.contains('show');
let ctx = null; // { getSave }: the save as main.js holds it now (Reset replaces the object)
let onHomeFn = () => {}; // main.js: the home screen shows again (the live feed check runs)
let askedYear = null; // the year answered on the first question while its month is asked (null otherwise)

function fillYears() {
  const sel = $('gate-year');
  const options = yearChoices(clockNow().year).map((y) => `<option value="${y}">${y}</option>`);
  sel.innerHTML = '<option value="" disabled selected>Choose a year</option>' + options.join('');
  sel.value = '';
  $('btn-gate-next').disabled = true;
}

function fillMonths() {
  const sel = $('gate-month-pick');
  const options = monthChoices().map((m) => `<option value="${m.value}">${m.name}</option>`);
  sel.innerHTML = '<option value="" disabled selected>Choose a month</option>' + options.join('');
  sel.value = '';
  $('btn-gate-month-next').disabled = true;
}

function showGate(id) {
  if (id === 'gate-age') fillYears();
  if (id === 'gate-month') fillMonths();
  if (id === 'gate-agree') {
    const note = agreeNotice(ctx.getSave());
    $('gate-changed').textContent = note;
    $('gate-changed').hidden = !note;
  }
  $(id).classList.add('show');
  openScreen(id);
}

/** Takes a gate screen down without running its Back action (exit): hidden first, so closeScreen does not run it. */
function leave(id) {
  $(id).classList.remove('show');
  closeScreen(id);
}

/** The first question. A year that turns 13 this year goes on to its month; any other year is the whole answer. */
function answerYearNow() {
  const year = Number($('gate-year').value);
  if (needsMonth(year, clockNow())) {
    askedYear = year;
    leave('gate-age');
    showGate('gate-month');
    return;
  }
  record({ year, month: null });
}

/** The month question: with the year from the first question, or the year already on file when a launch asks for it. */
function answerMonthNow() {
  const save = ctx.getSave();
  const year = askedYear !== null ? askedYear : save.profile ? save.profile.birthYear : null;
  record({ year, month: Number($('gate-month-pick').value) });
}

/** Records the answer (profile.js answerAge) and shows what it leads to. Nothing is recorded for an answer that is not valid. */
function record(age) {
  const save = ctx.getSave();
  const now = clockNow();
  const state = answerAge(save, age, now, todayKey());
  if (!state) return;
  writeSave(save);
  askedYear = null;
  playGames.setAllowed(canPlayGames(save, now)); // false until Agree: Play Games never starts before it
  leave('gate-age');
  leave('gate-month');
  if (state === 'under13') showGate('gate-under13');
  else showGate('gate-agree');
}

function agreeNow() {
  const save = ctx.getSave();
  if (!agree(save, todayKey())) return;
  writeSave(save);
  playGames.setAllowed(canPlayGames(save, clockNow())); // 13 and older who agreed: the shell starts Play Games
  leave('gate-agree');
  goHome();
}

/**
 * Play Games' answer to the automatic check (main.js HP_pgs): the one sign-in offer. It is due while Play Games is allowed and no offer
 * has been made on this phone (the shell keeps that), so it goes with the first Agree, and with the first launch of an install that
 * already has Play Games allowed. Signed out asks Google's account box once, by itself (true here); the shell records the offer as
 * settled then, so it is never asked again, whatever the player chose. A failed check settles nothing (playgames.js signInOffer).
 */
export function takeSignInOffer(state, allowed) {
  const next = signInOffer(!!allowed && !playGames.offerDone(), state);
  if (next.settle) playGames.settleOffer();
  return next.ask;
}

/** A gate closed: when no gate screen is left up, the home screen shows, so onHome runs (main.js: the feed check, the boards). */
function goHome() {
  if (gatesClear((id) => $(id).classList.contains('show'))) onHomeFn();
}

/**
 * Wires the gate's buttons and its Back actions once. getSave gives the current save; press is the button tick; onHome runs
 * when the gate closes into the home screen (after Agree), never on an answer.
 */
export function initGate({ getSave, press = () => {}, onHome = () => {} }) {
  ctx = { getSave };
  onHomeFn = onHome;
  // Back on the age question, on the month question of a launch and on Agree leaves the app and keeps the gate up: if the shell
  // does not close, the home screen must not show through with nothing agreed. The under-13 screen leaves the app too.
  register('gate-age', () => {
    exitApp();
    openScreen('gate-age');
  }, shown('gate-age'));
  register('gate-month', () => {
    // Back on the month of a year just answered goes back to the year; a launch that already has the year leaves the app
    if (askedYear !== null) {
      askedYear = null;
      leave('gate-month');
      showGate('gate-age');
      return;
    }
    exitApp();
    openScreen('gate-month');
  }, shown('gate-month'));
  register('gate-under13', () => {
    exitApp();
    openScreen('gate-under13');
  }, shown('gate-under13'));
  register('gate-agree', () => {
    exitApp();
    openScreen('gate-agree');
  }, shown('gate-agree'));
  $('gate-year').addEventListener('change', () => {
    $('btn-gate-next').disabled = !$('gate-year').value;
  });
  $('gate-month-pick').addEventListener('change', () => {
    $('btn-gate-month-next').disabled = !$('gate-month-pick').value;
  });
  const tap = (id, fn) => {
    const el = $(id);
    el.addEventListener('pointerdown', () => press());
    el.addEventListener('click', fn);
  };
  tap('btn-gate-next', answerYearNow);
  tap('btn-gate-month-next', answerMonthNow);
  tap('btn-gate-under13', exitApp);
  tap('btn-gate-agree', agreeNow);
  tap('btn-gate-notnow', exitApp);
  tap('btn-gate-terms', () => openLegal('terms'));
  tap('btn-gate-privacy', () => openLegal('privacy'));
}

/**
 * Shows the gate screen the saved profile calls for, over the home screen, unless a gate screen is up already (a question
 * being answered stays as it is). Returns the gate state (profile.js gateState): 'age', 'month', 'under13', 'agree' or 'home'.
 * Called at boot, on resume and after Reset.
 */
export function checkGate(save) {
  if (WEB_DEMO) return 'home'; // the browser demo has no age gate (DECISIONS 446)
  const state = gateState(save, clockNow());
  const id = GATE_SCREEN[state];
  if (id && gatesClear((g) => $(g).classList.contains('show'))) showGate(id);
  return state;
}
