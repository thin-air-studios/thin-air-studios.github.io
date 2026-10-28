// Bridges to the Android shell (haptics, version, exit). Falls back gracefully in a browser.
import { VERSION } from './version.js?v=2f66fd5f';
import { isPending } from './playgames.js?v=2f66fd5f';

const bridge = typeof window !== 'undefined' ? window.HPAndroid : undefined;

export const isAndroid = !!bridge;

let hapticsOn = true;
export function setHaptics(on) {
  hapticsOn = on;
}

const FALLBACK_MS = { tick: 6, click: 12, heavy: 25, double: [12, 50, 12], crash: [80, 40, 140, 60, 200], heartbeat: [18, 110, 26] };

export function haptic(kind) {
  if (!hapticsOn) return;
  try {
    if (bridge) bridge.haptic(kind);
    else if (navigator.vibrate) navigator.vibrate(FALLBACK_MS[kind] || 10);
  } catch (_) { /* ignore */ }
}

export function appVersion() {
  try {
    if (bridge && bridge.versionName) return bridge.versionName();
  } catch (_) { /* ignore */ }
  return VERSION;
}

/** The game's Google Play page, for a browser (the Android app opens the Play Store itself: GameBridge.openStore). */
export const STORE_WEB = 'https://play.google.com/store/apps/details?id=com.thinaircapital.holdingpattern';

/**
 * Google Play's in-app review (2.9; review.js decides when). True when the Android app started the request, false when it did not
 * (a browser, the sideload build, which never asks). Google never says whether its box showed, so nothing is shown here either way.
 */
export function requestReview() {
  try {
    return !!(bridge && bridge.reviewAsk && bridge.reviewAsk());
  } catch (_) {
    return false;
  }
}

/**
 * The Settings row's "Rate Short Final": the game's Google Play page (market://, else the browser, in the app; a new tab in a
 * browser). True when it was started; false when nothing could open it.
 */
export function openStorePage() {
  try {
    if (bridge && bridge.openStore) return !!bridge.openStore();
    if (typeof window !== 'undefined' && window.open) {
      window.open(STORE_WEB, '_blank', 'noopener');
      return true;
    }
  } catch (_) { /* ignore: the caller says it could not open */ }
  return false;
}

/** The browser demo's own pages (its Play links, with the referrer): a new tab. True when one was asked for. */
export function openDemoPage(url) {
  try {
    window.open(url, '_blank', 'noopener');
    return true;
  } catch (_) {
    return false;
  }
}

/** Share a line of text: the Android share sheet, the browser's, or the clipboard. Returns how. */
export async function shareText(text) {
  if (bridge && bridge.share) {
    bridge.share(text);
    return 'shared';
  }
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (_) {
    return 'failed';
  }
}

const base64 = (canvas) => canvas.toDataURL('image/png').split(',')[1];

/** The app's video calls (GameBridge: videoStart, videoEnd ...), or null in a browser or an app without them. */
export function videoBridge() {
  return bridge && bridge.videoEnd ? bridge : null;
}

/**
 * Sharing a result card (a canvas) and its caption: the Android share sheet or one app, the
 * clipboard, Photos. In a browser: the Web Share API with a file, else a download and a copy.
 */
export const sharing = {
  /** One-tap targets this phone has ("whatsapp", "messages", "email" ...). */
  targets() {
    try {
      return bridge && bridge.shareTargets ? JSON.parse(bridge.shareTargets()) : [];
    } catch (_) {
      return [];
    }
  },
  canSave() {
    try {
      return bridge ? !!(bridge.canSaveImage && bridge.canSaveImage()) : true;
    } catch (_) {
      return false;
    }
  },
  async image(canvas, text, title, target = '') {
    if (bridge && bridge.shareImage) {
      bridge.shareImage(base64(canvas), text, title, target);
      return 'shared';
    }
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'short-final.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
    return shareText(text);
  },
  /** Running in the app (the native share sheet and toasts) rather than a browser. */
  native() {
    return !!bridge;
  },
  /** Text only, to one app (or the share sheet). */
  textTo(text, title, target = '') {
    if (bridge && bridge.shareImage) bridge.shareImage('', text, title, target);
    else shareText(text);
  },
  async copy(text) {
    if (bridge && bridge.copyText) {
      bridge.copyText(text);
      return 'copied';
    }
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (_) {
      return 'failed';
    }
  },
  /** Resolves 'saved' or 'failed'. */
  save(canvas) {
    if (bridge && bridge.saveImage) {
      return new Promise((resolve) => {
        window.HP_shareDone = (how) => resolve(how);
        bridge.saveImage(base64(canvas));
      });
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'short-final.png';
    a.click();
    return Promise.resolve('saved');
  },
};

// The server sign-in code is answered by callback (playGames.serverAuthCode). The page stops waiting after this long: the
// shell gives up at 15 s, so an answer that never comes is treated as no code.
const AUTH_CODE_MS = 16000;
const authWaiting = new Map(); // callback id -> the function that settles that wait
let authSeq = 0;

// the screens and Settings that show a Play Games button or line, told each time the state changes (onPlayGamesState)
const pgsListeners = [];
// a Play Games sign-in the player asked for (a tap): its failure is said once (takeTapped). The one offer at the first Agree is not a tap
let pgsTapped = false;

/** Calls fn with the state each time Play Games changes (window.HP_pgs), so a button or a line on screen follows it live. */
export function onPlayGamesState(fn) {
  pgsListeners.push(fn);
}

/** main.js HP_pgs: every listener hears the state, whatever it is. A listener that throws does not stop the others. */
export function playGamesChanged(state) {
  for (const fn of pgsListeners) {
    try {
      fn(state);
    } catch (e) {
      console.error('Play Games listener', e);
    }
  }
}

/**
 * Google Play Games: achievements and leaderboards. Everything is a no-op until the game is set up in
 * Play Console (the app reports pgsEnabled()), and until the age gate allows it: the shell keeps that
 * answer, so it holds across launches. State changes arrive through window.HP_pgs(state).
 */
export const playGames = {
  enabled() {
    try {
      return !!(bridge && bridge.pgsEnabled && bridge.pgsEnabled());
    } catch (_) {
      return false;
    }
  },
  /** The age gate (profile.js) says whether Play Games may run: on at 13+ after Agree, off until then and after Reset. */
  setAllowed(on) {
    try {
      if (bridge && bridge.setPlayGamesAllowed) bridge.setPlayGamesAllowed(!!on);
    } catch (_) { /* ignore */ }
  },
  /** The Google web client id for server sign-in: games-ids.xml in the app. '' until it is set up (posts then wait). */
  webClientId() {
    try {
      return bridge && bridge.pgsWebClientId ? String(bridge.pgsWebClientId() || '') : '';
    } catch (_) {
      return '';
    }
  },
  /**
   * The one-time code the Worker trades for a session (POST /v1/session). The shell asks Play Games in the background and
   * answers through window.HP_serverAuthCode(id, code), so the promise settles when the answer comes and the page never
   * waits on the bridge call. '' when there is no shell, when Play Games is off or the player isn't signed in, and after
   * AUTH_CODE_MS if the answer never arrives.
   */
  serverAuthCode() {
    if (!bridge || !bridge.pgsServerAuthCode) return Promise.resolve('');
    return new Promise((resolve) => {
      const id = `auth${++authSeq}`;
      let timer = null;
      const finish = (code) => {
        clearTimeout(timer);
        authWaiting.delete(id);
        resolve(typeof code === 'string' ? code : '');
      };
      authWaiting.set(id, finish);
      window.HP_serverAuthCode = (answerId, code) => {
        const done = authWaiting.get(answerId);
        if (done) done(code);
      };
      timer = setTimeout(() => finish(''), AUTH_CODE_MS);
      if (timer && typeof timer === 'object' && timer.unref) timer.unref();
      try {
        bridge.pgsServerAuthCode(id);
      } catch (_) {
        finish('');
      }
    });
  },
  /**
   * 'none' when Play Games is not on in this page (a browser, or a build with no project): nothing is checked, so nothing is pending.
   * Otherwise the shell's state: 'off' (no answer yet), 'checking', 'signed-in', 'signed-out' or 'unknown' (the call failed).
   */
  status() {
    try {
      return this.enabled() ? bridge.pgsStatus() : 'none';
    } catch (_) {
      return 'unknown';
    }
  },
  check() {
    if (this.enabled()) bridge.pgsCheck();
  },
  signIn() {
    if (this.enabled()) bridge.pgsSignIn();
  },
  /**
   * The player's own tap on a sign-in button or row: a failure after it is said once (takeTapped, main.js HP_pgs). A tap while a check or
   * a sign-in runs does nothing, so a second box never opens over the first. A tap settles the one offer: the player chose, and the
   * offer is not asked by itself after it.
   */
  signInTapped() {
    if (!this.enabled() || isPending(this.status())) return;
    pgsTapped = true;
    this.settleOffer();
    bridge.pgsSignIn();
  },
  /** True once after a tapped sign-in has its answer, so the page can say that it failed (main.js HP_pgs). */
  takeTapped() {
    const was = pgsTapped;
    pgsTapped = false;
    return was;
  },
  /** The one sign-in offer at the first Agree was made, or was not needed, on this phone (gate.js). With no shell there is none to make. */
  offerDone() {
    try {
      return !bridge || !bridge.pgsOfferDone || !!bridge.pgsOfferDone();
    } catch (_) {
      return true;
    }
  },
  /** Records the one sign-in offer as settled: it is not made again on this phone, whatever the player chose. */
  settleOffer() {
    try {
      if (bridge && bridge.pgsSettleOffer) bridge.pgsSettleOffer();
    } catch (_) { /* ignore */ }
  },
  /** An achievement by its display name: Play Console names its id achievement_<snake case name>. */
  unlock(name) {
    if (!this.enabled()) return;
    const snake = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    bridge.pgsUnlock([`achievement_${snake}`, `achievement_${snake.replace(/_/g, '')}`].join(','));
  },
  submit(board, score) {
    if (this.enabled() && score > 0) bridge.pgsSubmit(board, Math.round(score));
  },
  show(what) {
    if (!this.enabled()) return;
    if (this.status() !== 'signed-in') this.signInTapped();
    else bridge.pgsShow(what);
  },
};

/**
 * The reminders (reminder.js; DECISIONS 362 and 392): the shell posts them. The switches live in the save; the shell keeps what its two
 * alarms need (write). allowed() says whether the phone lets the game post now.
 * ask() opens the phone's permission question (Android 13 and later), and the answer comes back through
 * window.HP_reminderAnswer(allowed) (main.js).
 */
export const dailyReminder = {
  /** Whether the Android shell is running (the reminder works there only). */
  native() {
    return !!(bridge && bridge.reminderWrite);
  },
  allowed() {
    try {
      return !!(bridge && bridge.reminderAllowed && bridge.reminderAllowed());
    } catch (_) {
      return false;
    }
  },
  ask() {
    try {
      if (bridge && bridge.reminderAsk) bridge.reminderAsk();
    } catch (_) { /* ignore */ }
  },
  /**
   * state: { on: { daily, streak, recap } (the switches, as the save has them for a 13-and-up player who agreed), played: the daily number
   * last played (0 for none), streakLast: the local day of the last landing (0 for none), streakCount, weekStart: the Monday of the week
   * for the recap, weekLanded, weekBest, weekAt: the best game's city }. The shell keeps it for its alarms.
   */
  write(state) {
    try {
      if (bridge && bridge.reminderWrite) return bridge.reminderWrite(JSON.stringify(state));
    } catch (_) { /* not kept: the alarms keep what they had */ }
    return false;
  },
};

/**
 * Cloud save (cloud.js; DECISIONS 363): the shell's Play Games snapshot, one call at a time. Each call resolves with the shell's
 * answer { s: 'ok' | 'conflict' | 'saved' | 'error', json?, a?, b? }; a call the shell never answers resolves as 'error' after
 * SNAPSHOT_MS. In a browser there is no shell, so every call is 'error' and nothing is saved.
 */
const SNAPSHOT_MS = 20000;
const snapshotWaiting = new Map(); // call id -> the function that settles it
let snapshotSeq = 0;
if (typeof window !== 'undefined') {
  window.HP_snapshot = (id, text) => {
    const done = snapshotWaiting.get(id);
    if (!done) return;
    let answer = { s: 'error' };
    try {
      answer = JSON.parse(String(text));
    } catch (_) { /* an answer that does not parse is an error */ }
    done(answer);
  };
}
/** One shell call that answers: method(id, ...args), settled by window.HP_snapshot(id, text). */
function snapshotCall(method, id, ...args) {
  if (!bridge || !bridge[method]) return Promise.resolve({ s: 'error' });
  return new Promise((resolve) => {
    const finish = (answer) => {
      clearTimeout(timer);
      snapshotWaiting.delete(id);
      resolve(answer && typeof answer === 'object' ? answer : { s: 'error' });
    };
    snapshotWaiting.set(id, finish);
    const timer = setTimeout(() => finish({ s: 'error' }), SNAPSHOT_MS);
    if (timer && typeof timer === 'object' && timer.unref) timer.unref();
    try {
      bridge[method](id, ...args);
    } catch (_) {
      finish({ s: 'error' });
    }
  });
}
// the call id of the open that holds the snapshot (commit, resolve and discard act on it); the shell keeps one open at a time
let openId = '';
const nextId = (name) => `${name}${++snapshotSeq}`;
export const cloudStore = {
  /** Whether the shell can keep a copy at all (the Android app, with Play Games). */
  native() {
    return !!(bridge && bridge.snapshotOpen);
  },
  /** Opens the copy: { s: 'ok', json } with the copy's text ('' when there is none), or { s: 'conflict', a, b }. */
  open() {
    openId = nextId('open');
    return snapshotCall('snapshotOpen', openId);
  },
  /** Writes the merged copy into the snapshot the open call held, and commits it: { s: 'saved' } or { s: 'error' }. */
  commit(json) {
    return snapshotCall('snapshotCommit', openId, json);
  },
  /** Writes the merged copy into the conflict the open call reported, and resolves it. */
  resolve(json) {
    return snapshotCall('snapshotResolve', openId, json);
  },
  /** Lets go of the snapshot the open call held, without writing it. Nothing is answered. */
  discard() {
    try {
      if (bridge && bridge.snapshotDiscard) bridge.snapshotDiscard(openId);
    } catch (_) { /* ignore */ }
  },
  /** Deletes the copy (Reset progress): { s: 'saved' } when it is gone, { s: 'error' } when not. */
  remove() {
    return snapshotCall('snapshotDelete', nextId('delete'));
  },
};

export function exitApp() {
  try {
    if (bridge) bridge.exitApp();
  } catch (_) { /* ignore */ }
}

// The age answer (profile.js): the birth year, and the month when the year alone was not enough, as "2013" or "2013-10". On
// the phone the shell keeps it in its no-backup folder, which Android's backup and a phone transfer never copy, so it is never
// in the save the backup carries. In a browser (no shell) it sits in sessionStorage under its own key, never in the save, or in
// memory when storage is blocked.
const AGE_KEY = 'holdingpattern.age';
let ageMemory = null;

/** The answer as the phone keeps it: "2013" or "2013-10". */
const encodeAge = (age) => (age.month ? `${age.year}-${String(age.month).padStart(2, '0')}` : String(age.year));
/** The answer read back from its text, or null when the text is not one. */
function decodeAge(text) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  return { year: Number(m[1]), month };
}

export const ageStore = {
  /** The stored answer as { year, month } (month null when the year alone was enough), or null when there is none. */
  read() {
    if (bridge && bridge.getBirthAge) {
      try {
        return decodeAge(bridge.getBirthAge());
      } catch (_) {
        return null;
      }
    }
    try {
      const raw = sessionStorage.getItem(AGE_KEY);
      if (raw !== null) return decodeAge(raw);
    } catch (_) { /* no session storage here: memory below */ }
    return ageMemory;
  },
  /** Keeps the answer on the phone; null forgets it. */
  write(age) {
    const year = Number.isInteger(age && age.year) && age.year >= 1900 && age.year <= 9999 ? age.year : 0;
    const clean = year ? { year, month: Number.isInteger(age.month) && age.month >= 1 && age.month <= 12 ? age.month : null } : null;
    const text = clean ? encodeAge(clean) : '';
    ageMemory = clean;
    if (bridge && bridge.setBirthAge) {
      try {
        bridge.setBirthAge(text);
      } catch (_) { /* not kept: the age is asked again on the next launch */ }
      return;
    }
    try {
      if (text) sessionStorage.setItem(AGE_KEY, text);
      else sessionStorage.removeItem(AGE_KEY);
    } catch (_) { /* memory only */ }
  },
};

// The settings' copy on the phone (storage.js mirrorSettings). The shell keeps it in its own app storage and writes it with
// commit() before it answers, so a change is on the phone when the game goes on: the WebView writes its localStorage a few
// seconds late, and a game closed in that gap lost the change. The page reads the copy back at launch when it is newer than
// the save's (storage.js loadSave). A browser has no shell: nothing is kept, and the save alone holds the settings, as before.
// The shell is looked up at each call, not at load, so a test can stand one in.
const shell = () => (typeof window !== 'undefined' ? window.HPAndroid : undefined);

export const settingsStore = {
  /** Whether the phone keeps a copy at all (the Android shell has the methods). */
  present() {
    const b = shell();
    return !!(b && b.getSettings && b.setSettings);
  },
  /** The copy the phone holds, as its JSON text, or '' when there is none. */
  read() {
    try {
      const b = shell();
      return b && b.getSettings ? String(b.getSettings() || '') : '';
    } catch (_) {
      return '';
    }
  },
  /** Keeps the copy. False when the phone did not keep it (the shell's commit failed, or the call threw). */
  write(json) {
    try {
      const b = shell();
      if (!b || !b.setSettings) return true;
      return b.setSettings(json) !== false;
    } catch (_) {
      return false;
    }
  },
};

/** An outside link (the legal pages): the phone's browser or mail app. The shell takes web and mail links only. */
export function openExternal(url) {
  try {
    if (bridge && bridge.openExternal) bridge.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  } catch (_) { /* ignore */ }
}

/**
 * The device hash for the trial's first day (firstday.js): an HMAC-SHA256 of the Android ID with the app's constant, hex, from the
 * shell (DeviceHash.kt). '' when there is none: a browser, the sideload build (always Pro), or an ID the shell will not use.
 */
export function deviceHash() {
  try {
    const h = bridge && bridge.deviceHash ? String(bridge.deviceHash() || '') : '';
    return /^[0-9a-f]{64}$/.test(h) ? h : '';
  } catch (_) {
    return '';
  }
}

/** Keep the screen on only while a game is in progress. */
export function keepAwake(on) {
  try {
    if (bridge && bridge.keepAwake) bridge.keepAwake(on);
  } catch (_) { /* ignore */ }
}

/**
 * Lock the screen's orientation while a game is on, or let it turn again (3.3; DECISIONS 442). The shell turns a lock into the
 * activity's request: a window that may turn upright keeps its orientation in a game, so the airspace never turns under the player.
 */
export function setRotationLock(on) {
  try {
    if (bridge && bridge.setRotationLock) bridge.setRotationLock(!!on);
  } catch (_) { /* ignore */ }
}

/**
 * Radio voices: the phone's text-to-speech through the bridge, or the browser's speechSynthesis.
 * Every call ends with window.HP_speechDone(id), spoken or not, so the radio never waits forever.
 */
export const speech = {
  lastInit: -1e9,
  /** Start the speech engine, or restart it if it failed or was lost. Cheap to call often. */
  init() {
    const now = Date.now();
    if (now - this.lastInit < 3000) return;
    this.lastInit = now;
    try {
      if (bridge && bridge.speechInit) bridge.speechInit();
      else if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
    } catch (_) { /* no speech: the ticker carries on silently */ }
  },
  /** 'ready' | 'starting' | 'no-english' | 'failed' | 'lost' | 'off' | 'none' (no speech on this device). */
  status() {
    try {
      if (bridge && bridge.speechStatus) return bridge.speechStatus();
      if (bridge) return bridge.speechReady && bridge.speechReady() ? 'ready' : 'starting';
      if (typeof speechSynthesis === 'undefined') return 'none';
      return this.ready() ? 'ready' : 'starting';
    } catch (_) {
      return 'none';
    }
  },
  /** The phone's text-to-speech settings, to install an English voice. */
  openSettings() {
    try {
      if (bridge && bridge.openSpeechSettings) bridge.openSpeechSettings();
    } catch (_) { /* ignore */ }
  },
  ready() {
    try {
      if (bridge && bridge.speechReady) return bridge.speechReady();
      return typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices().some((v) => /^en/i.test(v.lang));
    } catch (_) {
      return false;
    }
  },
  /** country: accent wanted ("GB", "US" ...); n: which voice of those; flush: cut off the current call. */
  speak(id, text, { country = 'US', n = 0, pitch = 1, rate = 1.1, flush = false } = {}) {
    const done = () => window.HP_speechDone && window.HP_speechDone(String(id));
    try {
      if (bridge && bridge.speak) return bridge.speak(String(id), text, country, n | 0, pitch, rate, flush);
      if (typeof speechSynthesis === 'undefined') return done();
      if (flush) speechSynthesis.cancel();
      const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      const mine = all.filter((v) => v.lang.toUpperCase().endsWith('-' + country));
      const pool = mine.length ? mine : all;
      const u = new SpeechSynthesisUtterance(text);
      if (pool.length) u.voice = pool[((n % pool.length) + pool.length) % pool.length];
      u.pitch = pitch;
      u.rate = rate;
      u.volume = 0.9;
      u.onend = u.onerror = done;
      speechSynthesis.speak(u);
    } catch (_) {
      done();
    }
  },
  stop() {
    try {
      if (bridge && bridge.stopSpeaking) bridge.stopSpeaking();
      else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch (_) { /* ignore */ }
  },
};
