import { WEB_DEMO } from './flavor.js?v=7227d0de';
import { migrateStats } from './stats.js?v=7227d0de';
import { forStorage, hydrateAge } from './profile.js?v=7227d0de';
import { emptyStreak, sanitizeStreak, seedStreak } from './streak.js?v=7227d0de';
import { localDay } from './airportdb.js?v=7227d0de';
import { settingsStore } from './platform.js?v=7227d0de';
import { DEFAULT_TRACK } from './music.js?v=7227d0de';
import { emptyReview, sanitizeReview } from './review.js?v=7227d0de';
import { defaultWorldStats, sanitizeWorldStats } from './worldstats.js?v=7227d0de';
import { emptyWeekRecap, sanitizeWeekRecap, emptyOffer, sanitizeOffer } from './reminder.js?v=7227d0de';
import { sanitizeWeekend } from './weekend.js?v=7227d0de';

// the music tracks the game no longer has (2.3): a save that chose one plays Tower Jazz, once (musicRetired1)
const RETIRED_TRACKS = ['night', 'western'];

// Local save data (kept by the Android WebView across app updates).
const KEY = 'holdingpattern.save.v2';

const DEFAULTS = {
  schema: 3, // the 2.0 save; the one-time changes are flags under migrations, not this number
  settings: {
    sound: true, music: true, haptics: true, symbols: false, radio: false, voice: false,
    difficulty: 'normal', realPlanesOnly: false, departures: true, bullet: true, lighting: 'real', realWeather: true,
    musicTrack: 'jazz', // a track key from music.js TRACKS (Tower Jazz is the default; musicRetired1 moves a retired one)
    dailyReminder: false, // the daily challenge reminder (reminder.js; off until the player turns it on, DECISIONS 362)
    streakSaver: false, // the streak saver, at 7 pm when the streak ends that night (reminder.js; off until turned on, DECISIONS 392)
    weeklyRecap: false, // the Sunday recap, at 7 pm, if the player landed a plane that week (reminder.js; off until turned on, DECISIONS 392)
    worldStats: true, // World stats: each finished game is counted on the server (worldstats.js; on until the player turns it off, DECISIONS 384)
    osClientId: '', osClientSecret: '',
  },
  settingsRev: 0, // the settings' revision (mirrorSettings below): the newer of the save's copy and the phone's copy loads
  // the Things too slow? sheet's run (skysky.js): Keep answers in real-only games in a row, and quiet once it reaches three
  slowSky: { keeps: 0, quiet: false },
  migrations: {}, // one-time changes done: radioOff2, statsFromBest, simOverrideRetired, streak1
  best: {},
  played: 0,
  landed: 0,
  landedLive: 0,
  pax: 0,
  departed: 0,
  bestStreak: 0,
  tutorialDone: false,
  seenTypes: [],
  recent: [],
  visited: [], // every airport played (not demos), for the airport achievements
  ach: {}, // achievement id -> when it was earned
  gameBest: { heavy5: 0, live10: 0, night: 0, wet: 0, storm: 0, dep5: 0 }, // the most in one game, for the achievements
  paxRanked: 0, // lifetime passengers of ranked games (the passengers board)
  stats: { airports: {} }, // per airport and level (stats.js)
  streak: emptyStreak(), // the play streak: days played in a row (streak.js)
  profile: null, // the age answer and Agree (profile.js)
  session: null, // the Play Games sign-in for the server, 13+ only
  outbox: [], // ranked scores waiting to post
  tourSeen: false,
  density: null, // the canvas notch a slow phone stepped down to on one screen: { key, dpr } (density.js)
  pro: null, // Short Final Pro's day count (pro.js advancePro): the first run's day, the last day seen, the free games counted on it
  review: emptyReview(), // the rating request's counts and days (review.js): finished games, the first two days, the day of the last ask
  worldStats: defaultWorldStats(), // the day and week of the last World stats note this phone had counted, and whether one ever was (worldstats.js)
  weekRecap: emptyWeekRecap(), // this week's planes landed, the best game and its airport, for the Sunday recap (reminder.js, DECISIONS 392)
  reminderOffer: emptyOffer(), // the one-time reminder card: how many times shown, and the day of the last one (reminder.js, DECISIONS 392)
  weekend: null, // the weekend event: { w, best, tries } for the weekend w (weekend.js; the game's own record, as the daily's)
};

const fresh = () => JSON.parse(JSON.stringify(DEFAULTS));

const DIFFICULTY_KEYS = ['beginner', 'easy', 'normal', 'hard', 'chaos'];

/**
 * Brings a saved settings object up to this version (after the merge with the defaults, in loadSave). Version 1.32's "Real
 * Only" was a difficulty; it is now the Real planes only switch on Normal. Anything else unknown falls back to Normal.
 * Changes only what it has to: the rest of the settings are kept as they were.
 */
export function migrateSettings(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.difficulty === 'real') {
    s.difficulty = 'normal';
    s.realPlanesOnly = true;
  }
  if (typeof s.realPlanesOnly !== 'boolean') s.realPlanesOnly = false;
  if (!DIFFICULTY_KEYS.includes(s.difficulty)) s.difficulty = 'normal';
  return s;
}

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(extra)) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], extra[k]);
    else out[k] = extra[k];
  }
  return out;
}

/**
 * One-time changes, each recorded under save.migrations so it runs once and a choice made after it sticks.
 * radioOff2: radio chatter and voices go off once (requirement 1). statsFromBest: the per-airport stats start from
 * save.best (stats.js). simOverrideRetired: the 6:00 am simulated-planes override is gone (2.1): its saved time is deleted,
 * and the Real planes only switch stays as the player saved it (a live override does not turn it off). streak1: the play
 * streak starts from the 2.0 save's daily streak and stats (streak.js), once. musicRetired1: Night Shift and Western leave the
 * game (2.3), so a save that chose one plays Tower Jazz, once; a track chosen after that sticks. A new install gets the flags
 * too, so its first choice is never switched off. Returns true when something changed.
 */
export function migrateOnce(save, today = localDay(new Date())) {
  if (!save.migrations || typeof save.migrations !== 'object') save.migrations = {};
  let changed = false;
  if (!save.migrations.radioOff2) {
    save.settings.radio = false;
    save.settings.voice = false;
    save.migrations.radioOff2 = true;
    changed = true;
  }
  if (!save.migrations.statsFromBest) {
    migrateStats(save);
    save.migrations.statsFromBest = true;
    changed = true;
  }
  if (!save.migrations.simOverrideRetired) {
    delete save.settings.simAllowedUntil;
    save.migrations.simOverrideRetired = true;
    changed = true;
  }
  if (!save.migrations.streak1) {
    save.streak = seedStreak(save, today); // the phone's day: the seed needs it for a run that is still alive
    save.migrations.streak1 = true;
    changed = true;
  }
  if (!save.migrations.musicRetired1) {
    if (RETIRED_TRACKS.includes(save.settings.musicTrack)) save.settings.musicTrack = DEFAULT_TRACK;
    save.migrations.musicRetired1 = true;
    changed = true;
  }
  return changed;
}

/** The recent airports as the home list reads them: short codes, no repeats, six at most. Anything else is dropped. */
export function sanitizeRecent(r) {
  if (!Array.isArray(r)) return [];
  const codes = r.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim().toUpperCase());
  return [...new Set(codes)].slice(0, 6);
}

/**
 * The home pick, which a fresh launch restores (2.4 item 3; every pick is saved since 2.5): { icao, daily } or null (cleared, or
 * never picked). Undefined stays undefined: a save from before 2.4 (playbutton.js lastPlayedOf reads its recent list then).
 * Anything damaged is null.
 */
export function sanitizeLastPlayed(v) {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || typeof v.icao !== 'string' || !v.icao.trim()) return null;
  const out = { icao: v.icao.trim().toUpperCase(), daily: Number.isInteger(v.daily) && v.daily > 0 ? v.daily : 0 };
  if (Number.isInteger(v.weekend) && v.weekend > 0) out.weekend = v.weekend; // the weekend event's Saturday (3.3)
  return out;
}

/**
 * Makes a parsed save safe to read. A save can be damaged or edited by hand: a list that is not a list, or entries that are
 * not objects, would throw in the screens. Each list the game iterates is checked here, once, so no reader has to guess.
 */
export function sanitizeSave(save) {
  if (!Array.isArray(save.visited)) save.visited = [];
  else save.visited = save.visited.filter((c) => typeof c === 'string');
  save.recent = sanitizeRecent(save.recent);
  if (save.lastPlayed !== undefined) save.lastPlayed = sanitizeLastPlayed(save.lastPlayed);
  save.outbox = Array.isArray(save.outbox) ? save.outbox.filter((e) => e && typeof e === 'object' && !Array.isArray(e)) : [];
  save.streak = sanitizeStreak(save.streak);
  save.review = sanitizeReview(save.review);
  save.worldStats = sanitizeWorldStats(save.worldStats);
  save.weekRecap = sanitizeWeekRecap(save.weekRecap);
  save.reminderOffer = sanitizeOffer(save.reminderOffer);
  save.weekend = sanitizeWeekend(save.weekend);
  return save;
}

// The settings' copy on the phone (platform.js settingsStore). The save is one localStorage value, and the WebView writes it to
// disk a few seconds after a change: a game closed in that gap lost the change, and the older save loaded at the next launch
// (the music track went back to the one before). So the settings and their one-time flags are also kept on the phone at once,
// with a revision that goes up with each change. At launch the copy with the higher revision is the newer one. The revision
// never goes back (Reset progress keeps it), so an older copy cannot win. In a browser there is no phone copy: the save alone.
let rev = 0; // the highest revision this session has seen or made
let mirrored = null; // the phone's copy as it was last kept (its JSON), or as it was read; null when there is none

// The one-time flags the phone's copy keeps: those that change a setting. The two that rebuild data (streak1, statsFromBest) stay
// in the save only, so a restored older save runs them again (they are derived from the save, which the copy cannot hold).
const SETTING_FLAGS = ['radioOff2', 'simOverrideRetired', 'musicRetired1'];

/** The phone's copy of the settings: the settings and the setting flags, the two things a launch must not lose. */
const settingsCopy = (save) => ({
  settings: save.settings,
  migrations: Object.fromEntries(SETTING_FLAGS.filter((f) => save.migrations && save.migrations[f]).map((f) => [f, true])),
  // the home pick (2.5) goes with the settings, so a pick the WebView did not write before a kill is not lost
  ...(save.lastPlayed !== undefined ? { lastPlayed: save.lastPlayed } : {}),
  // the free games' day count (pro.js, 2.7) goes too: a game counted at its start is on the phone before the WebView flushes,
  // so a force-stop in that gap cannot give a free game back (DECISIONS 292)
  ...(save.pro && typeof save.pro === 'object' ? { pro: save.pro } : {}),
});

/**
 * Keeps the settings on the phone at once, when they differ from the copy it holds (each change takes the next revision).
 * False when the phone did not keep it: writeSave says so, and the caller tells the player.
 */
function mirrorSettings(save) {
  if (!settingsStore.present()) return true;
  const copy = settingsCopy(save);
  const json = JSON.stringify(copy);
  if (json === mirrored) return true;
  rev += 1;
  const kept = settingsStore.write(JSON.stringify({ rev, ...copy }));
  if (kept) mirrored = json;
  return kept;
}

/** The phone's copy as read back: { rev, settings, migrations }, or null when there is none or it is not one. */
function readPhoneCopy() {
  try {
    const c = JSON.parse(settingsStore.read() || 'null');
    if (!c || typeof c !== 'object' || !Number.isInteger(c.rev) || c.rev < 0) return null;
    if (!c.settings || typeof c.settings !== 'object' || Array.isArray(c.settings)) return null;
    const copy = { rev: c.rev, settings: c.settings, migrations: c.migrations && typeof c.migrations === 'object' ? c.migrations : {} };
    if (c.lastPlayed !== undefined) copy.lastPlayed = c.lastPlayed;
    if (c.pro && typeof c.pro === 'object' && !Array.isArray(c.pro)) copy.pro = c.pro; // checked by advancePro (pro.js)
    return copy;
  } catch (_) {
    return null;
  }
}

/** The save as the WebView kept it, or null when there is none or it cannot be read (the phone's copy may still count). */
function parseSave(raw) {
  try {
    const save = raw ? JSON.parse(raw) : null;
    return save && typeof save === 'object' && !Array.isArray(save) ? save : null;
  } catch (_) {
    return null;
  }
}

/**
 * The copy a launch loads: the save's own, unless the phone's copy has a higher revision. A higher one on the phone means the
 * save's last write never reached storage, so the phone's settings, flags and home pick are the ones the player last chose (the flags
 * are the union of both, and a flag is only ever set). fromPhone says which copy it was.
 */
function pickCopy(saved, phone) {
  const savedRev = saved ? Number(saved.settingsRev) || 0 : 0;
  rev = Math.max(rev, savedRev, phone ? phone.rev : 0);
  if (phone && (!saved || phone.rev > savedRev)) {
    const flagsOf = saved && saved.migrations && typeof saved.migrations === 'object' ? saved.migrations : {};
    return {
      copy: {
        ...(saved || {}),
        settings: phone.settings,
        migrations: { ...flagsOf, ...phone.migrations },
        settingsRev: phone.rev,
        ...(phone.lastPlayed !== undefined ? { lastPlayed: phone.lastPlayed } : {}),
        ...(phone.pro !== undefined ? { pro: phone.pro } : {}),
      },
      fromPhone: true,
    };
  }
  return { copy: saved || {}, fromPhone: false };
}

export function loadSave() {
  const phone = readPhoneCopy();
  mirrored = phone ? JSON.stringify(settingsCopy(phone)) : null; // what the phone holds, as this launch found it
  // a save that cannot be read (the storage refuses) loads as none, so the phone's copy below still counts
  let saved = null;
  try {
    saved = parseSave(localStorage.getItem(KEY));
  } catch (_) { /* no save to read */ }
  try {
    if (saved || phone) {
      const { copy, fromPhone } = pickCopy(saved, phone);
      const save = sanitizeSave(merge(fresh(), copy));
      migrateSettings(save.settings);
      // the birth year comes from the phone's own file (profile.js), not from the save
      const hadAge = hydrateAge(save);
      const migrated = migrateOnce(save);
      // written back at once, so a migration does not run again on the next launch, a year an older build left in the save
      // leaves it, and the save and the phone's copy agree (a copy the phone lacks, or has behind, is written now)
      const phoneBehind = settingsStore.present() && JSON.stringify(settingsCopy(save)) !== mirrored;
      if (migrated || hadAge || fromPhone || phoneBehind) writeSave(save);
      return save;
    }
  } catch (_) { /* storage unavailable: play without saving */ }
  // no save to load: the phone's copy still holds the settings, so they load from it (its revision goes on, so no write sends
  // defaults over it); with no copy either this is a new install
  const save = sanitizeSave(merge(fresh(), pickCopy(null, phone).copy));
  migrateSettings(save.settings);
  // the answer on the phone still counts with no save: a player under 13 is not asked the age question again this way
  hydrateAge(save);
  migrateOnce(save);
  return save;
}

/**
 * Writes the save. Returns false when a write failed (the storage is full or unavailable, or the phone did not keep the
 * settings), so the caller can say so; the game still plays on. The settings go to the phone's copy first, at once
 * (mirrorSettings). The queued replays are not in here (outbox.js keeps them in the kv store), so the save stays small.
 * Never the birth year (forStorage): Android's Auto Backup copies this storage, so the year stays on the phone (profile.js).
 */
export function writeSave(save) {
  const { saved, phone } = writeSaveDetail(save);
  return saved && phone;
}

/**
 * The same write, with each result: saved (the save reached the WebView's storage) and phone (the settings reached the phone's
 * copy). A game's end asks about the save alone: a refused phone copy does not mean the game was lost (main.js).
 */
export function writeSaveDetail(save) {
  if (WEB_DEMO) return { saved: true, phone: true }; // the browser demo keeps nothing (DECISIONS 446)
  const phone = mirrorSettings(save);
  save.settingsRev = rev;
  try {
    localStorage.setItem(KEY, JSON.stringify(forStorage(save)));
    return { saved: true, phone };
  } catch (_) {
    return { saved: false, phone };
  }
}

/**
 * Reset progress: everything goes back to the defaults except the one-time flags. Keeping the flags stops a kept
 * radio setting from being switched off again by the migration after a reset. The settings' revision goes on (the phone's
 * copy must never be the newer one after a reset), and the caller keeps the settings as they are.
 */
export function resetSave() {
  if (WEB_DEMO) return fresh(); // nothing is stored in the demo, so there is nothing to reset
  let migrations = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) migrations = JSON.parse(raw).migrations;
  } catch (_) { /* unreadable: start the flags again */ }
  try {
    localStorage.removeItem(KEY);
  } catch (_) { /* ignore */ }
  const save = fresh();
  if (migrations && typeof migrations === 'object') save.migrations = migrations;
  save.settingsRev = rev;
  return save;
}
