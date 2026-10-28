// The home screen's Play button (requirements 6 and 9(1)): its words, from the airport picked on the home list (or none), the
// Ranked or Unranked rule for the settings as they are now, and the one reason a game is unranked. No DOM, so the words are
// tested without the game; main.js syncPlayButton puts them on the button. The rules are ranking.js's (startRanking) and
// modes.js's (gameConfig), read the way endcard.js loadingRankLine reads them.
import { gameConfig } from './modes.js?v=2f66fd5f';
import { cityName } from './airportdb.js?v=2f66fd5f';
import { REASON_ORDER, isRanked, startRanking } from './ranking.js?v=2f66fd5f';
import { themeOf } from './weekend.js?v=2f66fd5f';

/** The words for the reasons a player's own settings can cause on the home screen (ranking.js reasons). */
export const PLAY_REASON_WORDS = {
  demo: 'No internet',
  challenge: 'A friend’s challenge',
  simOverride: 'Simulated planes allowed',
  realOnly: 'Real planes only',
  departuresOff: 'Departures off',
  rushSettings: 'Not on the Rush’s settings',
};

/**
 * The reasons a game gets while it is played: a change made in a game (noteRanking), and noMap, the map the airport has when the game
 * starts (DECISIONS 372). The home screen never has them, so the Play button says Ranked for an airport whose map it cannot see.
 */
export const GAME_ONLY_REASONS = ['levelChanged', 'departuresChanged', 'noMap', 'santaWindow'];

/**
 * The rank word on the Play button: "Ranked", or "Unranked · <reason>" with one reason. When two apply, the first in ranking.js's
 * display order is named: the recorded game's "No internet", then the simulated-planes override, then Real planes only (it greys
 * the Departures switch, so the player can see it), then Departures off. The daily ignores the settings (gameConfig).
 */
export function playRankWord({ demo = false, daily = false, weekend = false, rush = false, challenge = false, settings = {}, nowMs = Date.now() } = {}) {
  const s = settings || {};
  const cfg = gameConfig({ daily: !!daily || !!weekend, settings: s, nowMs });
  const rk = startRanking({
    demo: !!demo, daily: !!daily, weekend: !!weekend, rush: !!rush, challenge: !!challenge, diff: cfg.diff, departures: daily || weekend || rush ? true : !!s.departures,
    realPlanesOnly: !!s.realPlanesOnly, simOverride: cfg.simOverride,
  });
  if (isRanked(rk)) return 'Ranked';
  const reason = REASON_ORDER.find((r) => rk.reasons.includes(r) && PLAY_REASON_WORDS[r]);
  return reason ? `Unranked · ${PLAY_REASON_WORDS[reason]}` : 'Unranked';
}

/** The key a home row is picked by: the airport's ICAO code, or "daily:" and the code for the daily challenge's row, or "weekend:". */
export function pickKey(pick) {
  if (!pick || !pick.info) return '';
  if (pick.challenge) return `challenge:${pick.info.icao}:${pick.challenge.seed}`;
  if (pick.weekend) return `weekend:${pick.info.icao}`;
  if (pick.rush) return `rush:${pick.info.icao}`;
  return pick.daily ? `daily:${pick.info.icao}` : pick.info.icao;
}

/** The city (or the name when the database has no city) that the Play button's line starts with. */
export function placeOf(info) {
  return cityName(info.city) || info.name || info.icao;
}

/**
 * The Play button's words. pick is { info, daily } for the airport picked on the list (daily is the day's number for the daily row,
 * 0 for an airport row), or null for the random airport. demo: the recorded game (no internet). Returns the title ("Play now",
 * "Play LAX" or "Play today’s challenge"), the place (its line is never cut), then the rank: "Ranked" on the place's line when the
 * game is ranked, else nothing there and the reason ("Unranked · Departures off") on a line of its own (2.4 item 3). The accessible
 * name is the title, the place, then the rank words.
 */
export function playButtonWords({ pick = null, demo = false, settings = {}, nowMs = Date.now() } = {}) {
  let title = 'Play now', place = 'Random airport', words;
  if (pick && pick.daily) {
    title = 'Play today’s challenge';
    place = placeOf(pick.info);
    words = playRankWord({ daily: true, settings, nowMs });
  } else if (pick && pick.weekend) {
    // the weekend event (weekend.js): its own board, the daily's rules; the title is the event's, the place its airport
    title = 'Play this weekend’s event';
    place = placeOf(pick.info);
    words = playRankWord({ weekend: true, settings, nowMs });
  } else if (pick && pick.rush) {
    // the Thanksgiving Rush (3.4, rush.js): its own board, Normal's rules with the Rush's settings; the title is the Rush's, the place its airport
    title = 'Play today’s Rush';
    place = placeOf(pick.info);
    words = playRankWord({ rush: true, settings, nowMs });
  } else if (pick && pick.challenge) {
    // a friend's challenge (challenge.js): its airport, and its one reason on the line below (the Unranked words)
    title = 'Play challenge';
    place = placeOf(pick.info);
    words = playRankWord({ challenge: true, settings, nowMs });
  } else if (pick) {
    title = `Play ${pick.info.iata || pick.info.icao}`;
    place = placeOf(pick.info);
    words = playRankWord({ demo, settings, nowMs });
  } else {
    words = playRankWord({ demo, settings, nowMs });
  }
  const ranked = words === 'Ranked';
  return { title, place, rank: ranked ? 'Ranked' : '', unranked: ranked ? '' : words, label: `${title}. ${place} · ${words}` };
}

/**
 * The home pick as the save keeps it (lastPlayed, 2.5): { icao, daily } for the airport picked, daily being the day's number on the
 * daily row (else 0), or null when nothing is picked. main.js savePick writes it at every pick, so a restart brings it back.
 */
export function savedPickOf(pick) {
  if (!pick || !pick.info || !pick.info.icao) return null;
  const saved = { icao: pick.info.icao, daily: pick.daily || 0 };
  if (pick.weekend) saved.weekend = pick.weekend; // a weekend pick keeps its Saturday (3.3); other picks save as they did
  if (pick.rush) saved.rush = pick.rush; // the Thanksgiving Rush keeps its day (3.4)
  // a friend's challenge keeps its own parts, so a restart brings the same planes back (challenge.js)
  // (its screen, layout code and version too, DECISIONS 435: a restart flies the same screen and says the same words)
  if (pick.challenge) saved.challenge = { seed: pick.challenge.seed, level: pick.challenge.level, score: pick.challenge.score, rules: pick.challenge.rules, real: !!pick.challenge.real, name: pick.challenge.name || '', weather: pick.challenge.weather ?? null, screen: pick.challenge.screen ?? null, layout: pick.challenge.layout ?? null, version: pick.challenge.version ?? null };
  return saved;
}

/**
 * The pick a fresh launch starts with (2.4 item 3; the home pick, saved at every pick since 2.5): the save's { icao, daily }, where
 * daily is the day's number for the daily challenge (else 0). lastPlayed null means the player cleared the pick or has never picked
 * or played: Random airport. A save from before 2.4 has no lastPlayed (undefined): its airport played last is the head of the recent
 * list, and it is the daily only when the save's daily record is today's and the airport is today's. today: { code, n } (airportdb.js
 * todaysDaily).
 */
export function lastPlayedOf(save = {}, today = {}) {
  if (save.lastPlayed !== undefined) return save.lastPlayed || null;
  const icao = (save.recent || [])[0];
  if (!icao) return null;
  const daily = save.daily && save.daily.n === today.n && icao === today.code ? today.n : 0;
  return { icao, daily };
}
