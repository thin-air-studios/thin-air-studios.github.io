// Ranked or unranked, decided in one place. No DOM, no storage: gameplay, stats, the boards and the end card all read
// the same game.ranking (ranking.js is the only module that knows the rules).
//
// A game is ranked when it has a board (the level board, the daily one, the weekend event's or the Thanksgiving Rush's) and no reasons. Reasons are permanent: a
// change made during a game never comes back off, and "back to the same level" does not undo it (requirement 19).

export const LEVEL_ORDER = ['beginner', 'easy', 'normal', 'hard', 'chaos'];

/** What each reason means, in words. */
export const REASONS = {
  demo: 'no internet, recorded earlier',
  challenge: 'a friend’s challenge',
  noMap: 'no full map here yet',
  simOverride: 'simulated planes allowed',
  realOnly: 'real planes only',
  levelChanged: 'level changed',
  departuresChanged: 'departures changed',
  departuresOff: 'departures off',
  rushSettings: 'not on the rush’s settings',
  santaWindow: 'outside Santa’s dates',
};

/** Display order of the reasons in the label; also the list of reasons noteRanking accepts. */
export const REASON_ORDER = ['demo', 'challenge', 'noMap', 'simOverride', 'realOnly', 'levelChanged', 'departuresChanged', 'departuresOff', 'santaWindow', 'rushSettings'];

/** The short labels on the loading card and the end card. */
export const REASON_LABELS = {
  demo: 'no internet, recorded earlier',
  challenge: 'a friend’s challenge',
  noMap: 'no full map here yet',
  simOverride: 'simulated planes allowed',
  realOnly: 'real planes only',
  levelChanged: 'level changed',
  departuresChanged: 'departures changed',
  departuresOff: 'departures off',
  rushSettings: 'not on the rush’s settings',
  santaWindow: 'outside Santa’s dates',
};

const RANKED = 'Ranked';
const DAILY = 'Daily challenge · its own board';
const WEEKEND = 'Weekend event · its own board';
const RUSH = 'Thanksgiving Rush · its own board';

/**
 * The ranking of a game, from how it starts. demo: the practice game with recorded traffic (no board). daily: the daily board; the real
 * planes switch is ignored there. weekend: the weekend event's board (3.3), ignored the same way as the daily's. Otherwise the level
 * board. The simulated-planes override keeps the saved switch's reason too: the label leaves realOnly out while the override is on
 * (requirement 5), but the ranking does not change.
 * noMap: the airport's layout is the runways alone (no full map saved yet, DECISIONS 372): its field has no taxiways, gates or
 * terminals, so it is not compared with the full-map games on the same board.
 */
export function startRanking({ demo = false, daily = false, weekend = false, rush = false, challenge = false, diff = 'normal', departures = true, realPlanesOnly = false, simOverride = false, noMap = false } = {}) {
  const rk = { board: null, levels: [diff], reasons: [] };
  if (demo) {
    rk.reasons.push('demo');
    return rk;
  }
  // a friend's challenge (challenge.js) is unranked: no board, and its own reason. Its planes are the challenge's, so no switch counts.
  if (challenge) {
    rk.reasons.push('challenge');
    if (noMap) rk.reasons.push('noMap');
    return rk;
  }
  if (daily) {
    rk.board = 'daily';
    if (noMap) rk.reasons.push('noMap');
    if (!departures) rk.reasons.push('departuresOff');
    return rk;
  }
  // the weekend event: the daily's rules (Normal, all simulated, departures on), on its own board
  if (weekend) {
    rk.board = 'weekend';
    if (noMap) rk.reasons.push('noMap');
    return rk;
  }
  // the Thanksgiving Rush (3.4): its own board, Normal with departures on and all planes simulated, the Rush's bank. Any other setting is
  // unranked (rushSettings), so the Beginner game, the other levels and a real-planes switch are played but not posted. The Rush's
  // planes are the simulated ones, so the real-planes and simulated-planes switches count as settings here.
  if (rush) {
    rk.board = 'rush';
    if (noMap) rk.reasons.push('noMap');
    if (diff !== 'normal' || !departures || realPlanesOnly || simOverride) rk.reasons.push('rushSettings');
    return rk;
  }
  rk.board = 'level';
  if (noMap) rk.reasons.push('noMap');
  if (realPlanesOnly) rk.reasons.push('realOnly');
  if (simOverride) rk.reasons.push('simOverride');
  // Beginner has no departures, so the switch is not a change there
  if (diff !== 'beginner' && !departures) rk.reasons.push('departuresOff');
  return rk;
}

/** Notes a change made during a game. Permanent; a new level is added to rk.levels when it differs from the last one. */
export function noteRanking(rk, reason, diff) {
  if (!REASON_ORDER.includes(reason)) return rk;
  if (!rk.reasons.includes(reason)) rk.reasons.push(reason);
  if (diff && rk.levels[rk.levels.length - 1] !== diff) rk.levels.push(diff);
  return rk;
}

/** The easiest level a game was played at (its stats bucket). Unknown keys are ignored; null when there are none. */
export function easiestOf(levels) {
  let best = null;
  let bestIndex = Infinity;
  for (const l of levels || []) {
    const i = LEVEL_ORDER.indexOf(l);
    if (i >= 0 && i < bestIndex) {
      bestIndex = i;
      best = l;
    }
  }
  return best;
}

/** Ranked: on a board, with no reasons. */
export function isRanked(rk) {
  return !!rk && !!rk.board && rk.reasons.length === 0;
}

/** Only ranked games post anywhere (the online boards and Play Games). */
export function shouldPostScores(rk) {
  return isRanked(rk) && (rk.board === 'level' || rk.board === 'daily' || rk.board === 'weekend' || rk.board === 'rush');
}

/** "Ranked", "Daily challenge · its own board", "Weekend event · its own board", or "Unranked · " with the reasons in display order. */
export function rankingLabel(rk) {
  if (isRanked(rk)) return rk.board === 'daily' ? DAILY : rk.board === 'weekend' ? WEEKEND : rk.board === 'rush' ? RUSH : RANKED;
  // the override replaces the switch in the label: the game is simulated, so "real planes only" is not what it is
  const shown = REASON_ORDER.filter((r) => rk.reasons.includes(r) && !(r === 'realOnly' && rk.reasons.includes('simOverride')));
  if (!shown.length) return 'Unranked';
  return 'Unranked · ' + shown.map((r) => REASON_LABELS[r]).join(' · ');
}
