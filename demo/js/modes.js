import { WEB_DEMO } from './flavor.js?v=2f66fd5f';
// What a new game is made of, from the settings: the difficulty, the Real planes only switch, the simulated-planes override
// until 6:00 am, and whether the departures are built and allowed. Pure, so the rules (the daily challenge ignores the switch
// and the override, and the departures setting) are tested without the game. main.js newGame reads it.
export const LEVELS = ['beginner', 'easy', 'normal', 'hard', 'chaos'];

/** The next 6:00 am local time after nowMs (06:00 exactly is the next day's). Uses the Date constructor, so DST is right. */
export function nextSixAmLocal(nowMs) {
  const d = new Date(nowMs);
  let t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6).getTime();
  if (t <= nowMs) t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 6).getTime();
  return t;
}

/** Simulated planes are allowed right now (the override, requirement 5). */
export function simOverrideOn(settings, nowMs) {
  const until = settings && settings.simAllowedUntil;
  return !!until && nowMs < until;
}

/** "Play with simulated planes": the override runs until the next 6:00 am. The saved switch is not changed. */
export function startSimOverride(settings, nowMs) {
  return { ...settings, simAllowedUntil: nextSixAmLocal(nowMs) };
}

/** "Back to real only now", and flipping the Real planes only switch: the override ends. */
export function clearSimOverride(settings) {
  return { ...settings, simAllowedUntil: null };
}

/**
 * Whether Play now starts the recorded game (no internet): the device says it is offline now (navigator.onLine false). The
 * saved feed record does not decide it: a no-internet record is the last check's word from when the device was offline, and
 * once the connection is back the 'online' event runs a new check (main.js), so Play now is a real game again at once. online is
 * navigator.onLine.
 */
export function playRecorded({ online = true } = {}) {
  if (WEB_DEMO) return false; // the browser demo plays its own one game, never the recorded one (DECISIONS 446)
  return online === false;
}

/** The recorded airports the demo draws from (the bundled fixtures: real OpenSky traffic and METAR). */
export const DEMO_AIRPORTS = ['KDFW', 'EGLL', 'KATL', 'KMAF'];

/** The airport the recorded game (no internet) starts at: one of DEMO_AIRPORTS, never the one played last when another is there. */
export function recordedPlayCode(last = '', rand = Math.random) {
  const others = DEMO_AIRPORTS.filter((c) => c !== last);
  const pool = others.length ? others : DEMO_AIRPORTS;
  return pool[Math.floor(rand() * pool.length)];
}

/** The word that opens a game's title (the loading card and the HUD): "Daily #n", "Challenge" for a friend's, "Recorded" for the no-internet game, else "Live". */
export function gameTitleWord({ daily = null, demo = false, challenge = false, weekend = null } = {}) {
  if (daily) return `Daily #${daily}`;
  if (weekend) return weekend; // the weekend event's theme title, e.g. "Storm weekend" (weekend.js)
  if (challenge) return 'Challenge';
  return demo ? 'Recorded' : 'Live';
}

/**
 * The rules of a friend's challenge game (challenge.js, links.js): its level, the traffic's rules and the departures. Like the daily,
 * it is all simulated and ignores the Real planes only switch and the override; the departures follow the challenge's rules ('o' is off,
 * else on), and Beginner has none, as on every game. challenge: { level, rules } as checked by links.js.
 */
export function challengeConfig({ level = 'normal', rules = '' } = {}) {
  const diff = LEVELS.includes(level) ? level : 'normal';
  const departures = rules !== 'o';
  return { diff, realOnly: false, simOverride: false, buildDepartures: departures && diff !== 'beginner', allowSpawns: departures && diff !== 'beginner', departures };
}

/**
 * @param daily    the daily challenge: always Normal, all simulated, departures always built and allowed, so the same for
 *                 everyone (requirement 2; the switch and the override do nothing there, O27)
 * @param settings the saved settings (storage.js)
 * @param nowMs    the clock (for the override)
 * @returns { diff, realOnly, simOverride, buildDepartures, allowSpawns }
 *  - realOnly: this game has no simulated flights. The override makes it simulated for this game while the saved switch
 *    stays on; the game is then unranked (ranking.js simOverride).
 *  - buildDepartures: the departures object is made (turnarounds, ground traffic). Real planes only builds it on every
 *    level, Beginner included, so a real arrival taxis to its gate and leaves there.
 *  - allowSpawns: simulated departures may come in. Off on Beginner and on real planes only.
 */
export function gameConfig({ daily = false, settings = {}, nowMs = Date.now() } = {}) {
  const s = settings || {};
  if (daily) return { diff: 'normal', realOnly: false, simOverride: false, buildDepartures: true, allowSpawns: true };
  const diff = LEVELS.includes(s.difficulty) ? s.difficulty : 'normal';
  const simOverride = simOverrideOn(s, nowMs);
  const realOnly = !!s.realPlanesOnly && !simOverride;
  const beginner = diff === 'beginner';
  return {
    diff,
    realOnly,
    simOverride,
    buildDepartures: (!!s.departures || realOnly) && (!beginner || realOnly),
    allowSpawns: !!s.departures && !beginner && !realOnly,
  };
}
