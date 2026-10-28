// Achievements: long-term goals that send you to new airports, weather and traffic.
// Earned ones live in the save as { id: unix ms }. Pure logic: main.js feeds it events and shows the toasts.

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🛬', name: 'First touchdown', desc: 'Land your first aircraft' },
  { id: 'loop', icon: '🌀', name: 'Holding pattern', desc: 'Send an aircraft to a holding stack (or a loop you drew), then land it' },
  { id: 'heli', icon: '🚁', name: 'Rotor wash', desc: 'Land a helicopter on the pad' },
  { id: 'heavy5', icon: '✈️', name: 'Heavy metal', desc: 'Land 5 heavies in one game' },
  { id: 'mayday', icon: '🆘', name: 'Mayday handled', desc: 'Land an aircraft that declared an emergency' },
  { id: 'goaround', icon: '↩️', name: 'Go around!', desc: 'Hard or Chaos: land an aircraft safely after a busy-runway warning' },
  { id: 'close', icon: '😅', name: 'Close shave', desc: 'Survive a near miss' },
  { id: 'dep5', icon: '🛫', name: 'Wheels up', desc: 'Send off 5 departures in one game' },
  { id: 'live10', icon: '📡', name: 'Real world', desc: 'Land 10 real planes in one game' },
  { id: 'streak10', icon: '🎯', name: 'Smooth operator', desc: '10 clean landings in a row' },
  { id: 'streak25', icon: '🧊', name: 'Unflappable', desc: '25 clean landings in a row' },
  { id: 'night', icon: '🌙', name: 'Night shift', desc: 'Land 15 aircraft after dark in one game' },
  { id: 'wet', icon: '🌧️', name: 'All-weather', desc: 'Land 10 aircraft in rain or snow in one game' },
  { id: 'storm', icon: '⛈️', name: 'Through the storm', desc: 'Land 10 aircraft with a thunderstorm on the scope' },
  { id: 'score50', icon: '⭐', name: 'Three stars', desc: 'Score 50 in one game' },
  { id: 'score100', icon: '💯', name: 'Century', desc: 'Score 100 in one game' },
  { id: 'busy5', icon: '🌍', name: 'Globetrotter', desc: "Play 5 of the world's busiest airports" },
  { id: 'busy20', icon: '🧭', name: 'Frequent flyer', desc: "Play 20 of the world's 50 busiest airports" },
  { id: 'busy50', icon: '🏆', name: 'World tour', desc: "Play all 50 of the world's busiest airports" },
  { id: 'pax10k', icon: '🧳', name: 'Ten thousand souls', desc: 'Bring in 10,000 passengers' },
  { id: 'pax100k', icon: '🏙️', name: 'A small city', desc: 'Bring in 100,000 passengers' },
  { id: 'streak7', icon: '📆', name: 'Regular', desc: 'Reach a streak of 7 days' },
  { id: 'streak30', icon: '🗓️', name: 'On schedule', desc: 'Reach a streak of 30 days' },
  { id: 'streak100', icon: '🔥', name: 'Ever-present', desc: 'Reach a streak of 100 days' },
  // a badge of the game only (3.3, weekend.js): the Play Games list does not carry it, so it has no points and no Play Games id
  { id: 'weekend', icon: '🛩️', name: 'Weekend flyer', desc: 'Land a plane in a weekend event game', local: true },
  // the Thanksgiving Rush's badges (3.4, rush.js): local, as Weekend flyer is (DECISIONS 432(d)); no Play Games id
  { id: 'rushLanded', icon: '🦃', name: 'Holiday traveller', desc: 'Land a plane in the Thanksgiving Rush', local: true },
  { id: 'rush5', icon: '🛬', name: 'Five airports, five days', desc: 'Fly the Thanksgiving Rush on all five days', local: true },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievement = (id) => BY_ID.get(id);

// Play Games points (the kit's import, tools/playgames-catalog.mjs re-exports these): multiples of 5, 5-200 each, 2,000 at
// most in all; harder goals pay more. The badge rings on the Achievements screen use the same points (tierOf).
export const POINTS = {
  first: 10, loop: 20, heli: 20, heavy5: 40, mayday: 40, goaround: 25, close: 20, dep5: 30, live10: 50,
  streak10: 40, streak25: 80, night: 60, wet: 60, storm: 80, score50: 70, score100: 150,
  busy5: 50, busy20: 120, busy50: 200, pax10k: 60, pax100k: 150, streak7: 40, streak30: 80, streak100: 150,
};
export const POINTS_LIMIT = 2000;

/** The badge ring's tier: gold at 120 points and up, orange at 50 to 119, green under 50 (the kit's rings). */
export function tierOf(id) {
  const p = POINTS[id] || 0;
  return p >= 120 ? 'gold' : p >= 50 ? 'orange' : 'green';
}

/** One game's progress. `earned` is the save's map, updated in place. */
export class AchievementTracker {
  constructor(earned) {
    this.earned = earned;
    this.n = { heavy: [], night: [], wet: [], storm: [] }; // sim times of qualifying landings
    this.looped = new Set();
    this.warned = new Set();
  }

  /** Count one more at sim time t, forgetting any counted after t (a rewind took them back). */
  count(key, t) {
    const list = (this.n[key] = this.n[key].filter((x) => x < t));
    list.push(t);
    return list.length;
  }

  has(id) {
    return !!this.earned[id];
  }

  /** Award if not already earned; returns the achievement when newly earned. */
  award(id, out) {
    if (this.earned[id] || !BY_ID.has(id)) return;
    this.earned[id] = Date.now();
    out.push(BY_ID.get(id));
  }

  /**
   * One sim event. env: { night 0..1, precip: bool, storm: bool, sim }.
   * Returns the achievements it earned (usually none).
   */
  event(ev, env) {
    const out = [];
    const a = ev.aircraft;
    switch (ev.kind) {
      case 'loop':
      case 'stack':
        if (a) this.looped.add(a.id);
        break;
      case 'runwayBusy':
        if (a) this.warned.add(a.id);
        break;
      case 'nearMiss':
        this.award('close', out);
        break;
      case 'departed':
        if (env.sim && env.sim.departed >= 5) this.award('dep5', out);
        if (ev.score >= 50) this.award('score50', out);
        if (ev.score >= 100) this.award('score100', out);
        break;
      case 'land': {
        const sim = env.sim;
        this.award('first', out);
        if (a.cls === 'heli') this.award('heli', out);
        const t = sim ? sim.time : 0;
        if (a.cls === 'heavy' && this.count('heavy', t) >= 5) this.award('heavy5', out);
        if (a.emergency) this.award('mayday', out);
        if (this.looped.has(a.id)) this.award('loop', out);
        if (this.warned.has(a.id)) this.award('goaround', out);
        if (sim && sim.landedLive >= 10) this.award('live10', out);
        if (ev.streak >= 10) this.award('streak10', out);
        if (ev.streak >= 25) this.award('streak25', out);
        if (env.night > 0.5 && this.count('night', t) >= 15) this.award('night', out);
        if (env.precip && this.count('wet', t) >= 10) this.award('wet', out);
        if (env.storm && this.count('storm', t) >= 10) this.award('storm', out);
        if (ev.score >= 50) this.award('score50', out);
        if (ev.score >= 100) this.award('score100', out);
        break;
      }
    }
    return out;
  }

  /**
   * Lifetime goals, checked when a game ends. visitedBusiest: how many of the busiest have been played. days: the best
   * play streak (streak.js), so a streak earned in any game stays earned. weekendLanded: a weekend event game landed a plane.
   * rushLanded: a Thanksgiving Rush game landed a plane; rushDays: how many of the Rush's five days the player has flown (save.rushDays).
   */
  lifetime({ pax = 0, visitedBusiest = 0, score = 0, days = 0, weekendLanded = false, rushLanded = false, rushDays = 0 }) {
    const out = [];
    if (weekendLanded) this.award('weekend', out); // a plane landed in a weekend event game (weekend.js)
    if (rushLanded) this.award('rushLanded', out); // a plane landed in the Thanksgiving Rush (rush.js)
    if (rushDays >= 5) this.award('rush5', out);
    if (score >= 50) this.award('score50', out);
    if (score >= 100) this.award('score100', out);
    if (visitedBusiest >= 5) this.award('busy5', out);
    if (visitedBusiest >= 20) this.award('busy20', out);
    if (visitedBusiest >= 50) this.award('busy50', out);
    if (pax >= 10000) this.award('pax10k', out);
    if (pax >= 100000) this.award('pax100k', out);
    if (days >= 7) this.award('streak7', out);
    if (days >= 30) this.award('streak30', out);
    if (days >= 100) this.award('streak100', out);
    return out;
  }
}

/** A controller's career, by lifetime landings: something to climb across every airport. */
export const RANKS = [
  [0, 'Student controller'],
  [20, 'Ground controller'],
  [75, 'Tower controller'],
  [200, 'Approach controller'],
  [500, 'Senior controller'],
  [1200, 'Watch supervisor'],
  [3000, 'Chief of the tower'],
];

/** { name, next: landings needed for the next rank or null, index }. */
export function rankFor(landed = 0) {
  let i = 0;
  while (i + 1 < RANKS.length && landed >= RANKS[i + 1][0]) i++;
  return { index: i, name: RANKS[i][1], next: RANKS[i + 1] ? RANKS[i + 1][0] - landed : null, nextName: RANKS[i + 1] ? RANKS[i + 1][1] : null };
}
