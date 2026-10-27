// Short Final Pro in the page (2.7; DECISIONS 280): the purchase state the Android shell reports (Google Play Billing: GameBridge
// proState, proBuy, proRestore, and window.HP_pro(json) when it changes), the upgrade sheet, and the Settings Pro row. The rules
// and the words are pro.js. In a browser there is no shell: the game is free with the limit, and Pro is bought in the app.
import { settingsProWords, restoreWords, upgradeWords, sheetNote } from './pro.js?v=86c2b44d';

const shell = typeof window !== 'undefined' ? window.HPAndroid : undefined;
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const WAIT_MS = 1500; // a game start waits this long at most for Google Play's first answer (a phone that has not bought Pro)

let info = { always: false, pro: false, pending: false, price: '', status: shell ? 'checking' : 'web', message: '' };
let restoreNote = ''; // the line under the Restore button: the asked check's answer
let restoring = false; // the player asked for Restore purchase; the next answer is its answer
let ui = { show: () => {}, close: () => {}, toast: () => {}, onChange: () => {} };
let settle = () => {};
const settled = new Promise((resolve) => { settle = resolve; });

/** The shell's state as a plain object (missing or broken fields read as their defaults). */
export function parseState(json) {
  let v = {};
  try { v = JSON.parse(String(json || '{}')) || {}; } catch (_) { v = {}; }
  return {
    always: !!v.always,
    pro: !!v.pro,
    pending: !!v.pending,
    price: typeof v.price === 'string' ? v.price : '',
    status: typeof v.status === 'string' ? v.status : 'checking',
    message: typeof v.message === 'string' ? v.message : '',
  };
}

/** Pro is unlocked: bought (cached on the phone, so it works offline) or the test build. */
export const isPro = () => !!(info.always || info.pro);

/** The current state (a copy), for the tests and the page. */
export const proInfo = () => ({ ...info });

/**
 * Takes the shell's state (window.HP_pro, and the boot read). A purchase that completes closes the sheet and says so once. The
 * Play button and Settings catch up through onChange.
 */
export function applyState(json) {
  const was = isPro();
  info = parseState(json);
  if (info.status !== 'checking') settle(); // the first real answer ends a game start's wait
  if (restoring) {
    restoring = false;
    restoreNote = restoreWords(info);
  }
  if (!was && isPro()) {
    ui.close('pro-sheet');
    if (!info.always) ui.toast('Pro is unlocked. Thank you!', 2600);
  }
  renderSettings();
  ui.onChange(info);
}

/**
 * A game start that is not Pro waits for Google Play's first answer, at most WAIT_MS, so a Pro phone that restores its purchase is
 * not asked to buy. Resolves at once when the answer is in, when there is no shell, or when Pro is already known.
 */
export function proSettled(ms = WAIT_MS) {
  if (!shell || isPro() || info.status !== 'checking') return Promise.resolve();
  return Promise.race([settled, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/** The upgrade sheet: what Pro gives, the price from Google Play (never typed in), Buy, and Not now. reason: 'gate' or 'end'. */
export function openProSheet(reason = 'gate') {
  if (isPro()) return false;
  const w = upgradeWords({ price: info.price, reason });
  $('pro-title').textContent = w.title;
  $('pro-lead').textContent = w.lead;
  $('pro-used').textContent = w.used;
  $('pro-keep').textContent = w.keep;
  $('pro-daily').textContent = w.daily;
  const sw = settingsProWords(info);
  const buy = $('btn-sheet-buy');
  buy.textContent = w.buy;
  buy.hidden = !sw.buy;
  $('btn-pro-later').textContent = w.later;
  const msg = $('pro-msg');
  // the reason Buy is not shown, or the shell's note for a problem (pro.js sheetNote: a ready Buy has no old message under it)
  if (msg) {
    msg.textContent = sheetNote(info);
    msg.hidden = !msg.textContent;
  }
  ui.show('pro-sheet');
  return true;
}

/** Closes the sheet (Not now, Back, or a purchase that completes). */
export function closeProSheet() {
  ui.close('pro-sheet');
}

/** Buy: the Google Play purchase sheet opens over the game. The answer comes back through window.HP_pro. */
export function buyPro() {
  if (!shell || !shell.proBuy || isPro()) return;
  try {
    shell.proBuy();
  } catch (_) {
    info = { ...info, status: 'error', message: 'Google Play didn’t open the purchase. Try again in a moment.' };
    renderSettings();
  }
}

/** Restore purchase: asks Google Play which Pro purchase this account has. The answer shows under the button. */
export function restorePro() {
  if (!shell || !shell.proRestore) return;
  restoring = true;
  restoreNote = 'Checking Google Play…';
  renderSettings();
  try {
    shell.proRestore();
  } catch (_) {
    restoring = false;
    restoreNote = 'Google Play didn’t answer. Try again in a moment.';
    renderSettings();
  }
}

/** The Settings Pro row: its status, Buy (hidden when there is nothing to buy) and Restore purchase (hidden without the shell). */
export function renderSettings() {
  const w = settingsProWords(info);
  const status = $('pro-status');
  if (status) status.textContent = w.status;
  const buy = $('btn-pro-buy');
  if (buy) {
    buy.textContent = w.buyLabel;
    buy.hidden = !w.buy;
  }
  const restore = $('btn-pro-restore');
  if (restore) restore.hidden = info.status === 'web' || info.always;
  const note = $('pro-restore-note');
  if (note) {
    note.textContent = restoreNote;
    note.hidden = !restoreNote;
  }
}

/** Boot: the page's callback, the cached state (Pro works offline at once), and the screens' hooks (main.js). */
export function initPro({ show, close, toast, onChange } = {}) {
  ui = {
    show: show || (() => {}),
    close: close || (() => {}),
    toast: toast || (() => {}),
    onChange: onChange || (() => {}),
  };
  if (typeof window !== 'undefined') window.HP_pro = (json) => applyState(json);
  if (shell && shell.proState) {
    try {
      applyState(shell.proState());
    } catch (_) {
      applyState('{"status":"error"}');
    }
  } else if (shell) {
    // a shell without the Pro bridge answers at once with a plain line (no wait at a game start)
    applyState('{"status":"unavailable","message":"Pro isn’t available on this phone right now."}');
  } else {
    renderSettings();
    settle();
  }
}
