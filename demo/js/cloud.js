import { WEB_DEMO } from './flavor.js?v=7227d0de';
// Cloud save (DECISIONS 363): the save's progress is kept in the player's Play Games Saved Games, and merged with the copies on the
// player's other phones (cloudsave.js). It runs for a 13-and-up player who agreed, and only while signed in to Play Games. It fails
// silently: a save that does not go through keeps the game going, and the Settings line says when the last one did.
//
// One sync: open the copy, merge it with this phone's progress, write the merged copy back. Syncs never overlap; a sync asked for
// meanwhile runs once more after. Remote progress goes into the save only at home (never during a game: the game holds the save's
// maps), and a background save writes without applying. Reset progress records a flag first: nothing is merged until the copy is
// gone, so an old copy cannot bring the reset progress back.
import { applyCloud, cloudIsCurrent, cloudNote, cloudPayload, cloudText, mergeCloud, parseCloud } from './cloudsave.js?v=7227d0de';
import { localDay, todaysDaily } from './airportdb.js?v=7227d0de';
import { proDate } from './clock.js?v=7227d0de';
import { cloudStore, playGames } from './platform.js?v=7227d0de';

export const CLOUD_KEY = 'holdingpattern.cloud.v1';
// the save is sent this long after the last game ends, so a run of games makes one sync
const SAVE_DELAY_MS = 4000;

let deps = null; // { getSave(), writeSave(s), canSync(), inGame(), changed() }, from main.js
let timer = null;
let running = null; // the sync in progress (a promise)
let queued = null; // a sync asked for while one ran: { apply } for the run after it
let saved = 0; // when the last save went through (ms), 0 for none
let resetPending = false; // Reset progress: the copy is deleted before anything is merged

/** Reads what a launch kept (a per-phone convenience: the Settings line and the reset flag). */
export function initCloud(d) {
  deps = d;
  try {
    const raw = localStorage.getItem(CLOUD_KEY);
    const c = raw ? JSON.parse(raw) : null;
    if (c && Number.isFinite(c.saved)) saved = c.saved;
    resetPending = !!(c && c.resetPending);
  } catch (_) { /* no store: the line says not saved yet, and a reset is not remembered across a restart */ }
}

function remember() {
  try {
    localStorage.setItem(CLOUD_KEY, JSON.stringify({ saved, resetPending }));
  } catch (_) { /* a full or blocked store: kept for this launch only */ }
}

/** The Settings line's facts: the shell, Play Games, the sign-in and the last save that went through. */
export function cloudState() {
  return { native: cloudStore.native(), enabled: playGames.enabled(), status: playGames.status(), lastSaved: saved };
}

/** The Settings line for cloud save (cloudsave.js cloudNote). */
export function cloudLine(now = Date.now()) {
  return cloudNote({ ...cloudState(), now });
}

async function doSync(apply) {
  if (!deps || !deps.canSync()) return false;
  const trusted = proDate();
  const ctx = { now: trusted.getTime(), today: localDay(trusted), daily: todaysDaily(trusted).n };
  if (resetPending) {
    if ((await cloudStore.remove()).s !== 'saved') return false;
    resetPending = false;
    remember();
  }
  const opened = await cloudStore.open();
  let remote = null;
  // an answer without its copy's text is a failed read, never an empty copy: the copy is then not written over (the shell
  // answers 'error' for a read it could not make, and '' only for a copy that is new and empty)
  if (opened.s === 'conflict' && typeof opened.a === 'string' && typeof opened.b === 'string') {
    // two phones wrote at once: both copies and this phone's progress are one
    remote = [parseCloud(opened.a, ctx), parseCloud(opened.b, ctx)].reduce((x, y) => mergeCloud(x, y));
    const text = cloudText(mergeCloud(cloudPayload(deps.getSave(), ctx), remote));
    if (!text || (await cloudStore.resolve(text)).s !== 'saved') return false;
  } else if (opened.s === 'ok' && typeof opened.json === 'string') {
    if (!cloudIsCurrent(opened.json)) {
      cloudStore.discard(); // a newer copy: this version never writes over it
      return false;
    }
    remote = parseCloud(opened.json, ctx);
    const text = cloudText(mergeCloud(cloudPayload(deps.getSave(), ctx), remote));
    if (!text) {
      cloudStore.discard();
      return false;
    }
    if ((await cloudStore.commit(text)).s !== 'saved') return false;
  } else {
    return false;
  }
  saved = Date.now();
  remember();
  // the other phones' progress comes into the save at home, merged with this phone's progress as it is now
  if (apply && remote && !deps.inGame()) {
    const fresh = mergeCloud(cloudPayload(deps.getSave(), ctx), remote);
    deps.writeSave(applyCloud(deps.getSave(), fresh));
  }
  if (deps.changed) deps.changed();
  return true;
}

/**
 * One sync, now. apply: bring the other phones' progress into the save (only when no game is on). Resolves true when the copy
 * was saved. Never throws: a failure is false, and the game goes on.
 */
export function syncCloud({ apply = true } = {}) {
  if (WEB_DEMO) return Promise.resolve(false); // the browser demo has no cloud copy (DECISIONS 446)
  if (running) {
    queued = { apply: !!((queued && queued.apply) || apply) };
    return running;
  }
  running = doSync(apply)
    .catch(() => false)
    .finally(() => {
      running = null;
      if (queued) {
        const next = queued;
        queued = null;
        syncCloud(next);
      }
    });
  return running;
}

/** After a game ends (and after a settings change): one save, a few seconds later. */
export function scheduleCloudSave() {
  if (!deps) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncCloud({ apply: true });
  }, SAVE_DELAY_MS);
}

/** The app goes to the background: a save now, without bringing remote progress into a game in progress. */
export function flushCloudSave() {
  clearTimeout(timer);
  timer = null;
  return syncCloud({ apply: false });
}

/** Reset progress: the copy in Play Games is deleted (now, or at the next sync when it cannot be reached). */
export function resetCloud() {
  resetPending = true;
  remember();
  return syncCloud({ apply: true });
}
