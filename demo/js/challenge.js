// Friends' challenges (3.2; DECISIONS 411 to 416, 413, 421; 3.3 DECISIONS 435 to 437). A finished game can be sent to a friend as a
// challenge: the same airport, the same seed, the same level and the same start weather, so the friend's game makes similar simulated
// planes (sim.js, director.js and departures.js are seeded from the seed; weather.js from the weather). In 3.3 the link also carries the
// challenger's screen, its layout's code and its game's version, and a friend's game on those makes the same planes, in the same order,
// when nothing else moved them: no real plane came in, and nothing the link does not carry (DECISIONS 436).
// The challenger's score sits beside the friend's score on the end card. A challenge game is unranked and goes to no board (ranking.js).
// No DOM and no storage here: the rules are tested without the game, and main.js builds the game and the share panel.
import { checkChallenge, challengeLinkFor, cleanName, linkInCaption } from './links.js?v=86c2b44d';
import { VERSION } from './version.js?v=86c2b44d';

/**
 * The reasons that make a game impossible for a friend to repeat. A game with one of them is not sent as a challenge: a recording,
 * a runways-only layout, the simulated-planes override, real planes only, and a game whose level or departures changed in play.
 */
export const CHALLENGE_BLOCKERS = Object.freeze(['demo', 'noMap', 'simOverride', 'realOnly', 'levelChanged', 'departuresChanged']);

/**
 * Whether a finished game can be repeated by a friend, so that its link may carry the game's version (DECISIONS 435): not the
 * challenger's first ever game (it eases in, so the friend's game would not be the same), the HUD did not move in play (a friend's
 * game keeps the HUD its link gives), and a game that was itself a challenge is repeatable only on the link's layout (a friend whose
 * map differs plays its own). layout is the game's layout code (8 hex digits, or null when it is not known yet).
 */
export function repeatableGame({ firstGame, hudMoved, challenge, layout }) {
  if (firstGame || hudMoved || !layout) return false;
  if (challenge) return !!challenge.layout && challenge.layout === layout;
  return true;
}

/**
 * The challenge a finished game can send, as the link's fields (links.js checkChallenge), or null when it cannot be repeated.
 * g: { icao, seed, level, score, rules, real, weather, reasons, screen, layout, repeatable }. rules is the game's own rules: 'd' for the
 * daily challenge, 'o' for departures off, '' for the usual (main.js works it out at the start). real is true when real planes were in
 * the game. weather is the start weather the game flew (weatherOfSeed); a game whose weather is not known is not sent. reasons: the
 * game's ranking reasons (ranking.js). screen: the screen its world was made from ({ cssW, cssH }); layout: its layout's code; repeatable
 * (repeatableGame): whether the link may carry the game's version, which is what makes the friend's planes the same.
 */
export function challengeFromGame(g) {
  // a weekend event game is not sent: its twist (the weather, the rush) is not in a link (weekend.js)
  if (!g || g.seed == null || g.weather == null || g.weekend) return null;
  const reasons = Array.isArray(g.reasons) ? g.reasons : [];
  if (reasons.some((r) => CHALLENGE_BLOCKERS.includes(r))) return null;
  return checkChallenge({
    icao: g.icao, seed: g.seed, level: g.level, score: Math.max(0, Math.round(Number(g.score) || 0)), rules: g.rules || '', real: !!g.real,
    weather: g.weather, screen: g.screen || null, layout: g.layout || null, version: g.repeatable && g.layout ? VERSION : null,
  });
}

/**
 * The weather a game flew at its start, as the link carries it (DECISIONS 413 f): 'generated' when there was no report (the realWeather
 * switch off, or no report in time), else the fields the sim was given (wxSeed, weather.js). Beginner's rule has already been applied
 * to wx, so its fog (false) reads as 0.
 */
export function weatherOfSeed(wx) {
  if (!wx) return 'generated';
  return { windDir: wx.windDir == null ? null : wx.windDir, windKt: wx.windKt || 0, gustKt: wx.gustKt || 0, fog: wx.fog || 0, storms: wx.storms ? 1 : 0 };
}

/**
 * The weather a friend's game flies (DECISIONS 413 f): the challenge's own, from its link, and never the METAR. null for the generated
 * weather, which an old link (no weather part) flies too. Only the fields the traffic reads are given: the sky (cloud, precipitation)
 * is the generated one, as the look of the weather is not part of the planes. source says where the weather came from ('link'; the
 * weather label is internal, DECISIONS 438).
 */
export function challengeWxSeed(ch) {
  const w = ch && ch.weather;
  if (!w || w === 'generated') return null;
  return { windDir: w.windDir, windKt: w.windKt, gustKt: w.gustKt, fog: w.fog, storms: w.storms, cloud: null, precip: null, precipIntensity: 1, source: 'link' };
}

/**
 * Whether a challenge's planes are the same as the challenger's game's (DECISIONS 435, 437): the link carries the challenger's screen,
 * a layout code and the game's version, the friend's game is on the same version and the same layout (layout8: the friend's own layout
 * code, or null when it is not known), and no real plane came in for the challenger (real planes cannot repeat). Anything else is
 * "similar", as it was in 3.2 (an old link has none of the parts, so it is always similar).
 */
export const challengeSamePlanes = (ch, layout8) => !!ch && !!ch.screen && ch.version === VERSION && !!ch.layout && ch.layout === layout8 && !ch.real;

/** The possessive of a name: "Sam’s", "Chris’". */
const possessive = (n) => `${n}${/s$/i.test(n) ? '’' : '’s'}`;

/** Whose challenge it is, in words: "Sam’s challenge", or "Your friend’s challenge" when no name was added. */
export function challengeWords(name) {
  const n = cleanName(name);
  return n ? `${possessive(n)} challenge` : 'Your friend’s challenge';
}

/** The end card's comparison line: "You: 41 · Sam’s challenge: 38". */
export function challengeScoreLine(score, ch) {
  return `You: ${score} · ${challengeWords(ch.name)}: ${ch.score}`;
}

/** Whose game the planes came from, in the end card's flights line: "Sam’s game", or "your friend’s game" with no name. */
export function challengeWho(name) {
  const n = cleanName(name);
  return n ? `${possessive(n)} game` : 'your friend’s game';
}

/**
 * Whether real planes were in a game, for its challenge's x=1 (DECISIONS 421): one came in (sim.liveSpawned counts every one that
 * found a lane, including one that has since left, DECISIONS 436), or one landed, or one is still in the sky or on its warning, or
 * wrecked (a crash or a lost plane stays in sim.aircraft). The friend is then told real planes cannot repeat.
 */
export function challengeHadReal(sim) {
  return (sim.liveSpawned || 0) > 0 || (sim.landedLive || 0) > 0 || sim.aircraft.some((a) => a.live) || sim.warnings.some((w) => w.live);
}

/** The end card's line about real planes, shown only when the challenger's game had some: they cannot repeat, so these are simulated. */
export function challengeRealLine(ch) {
  return ch && ch.real ? 'Real planes can’t repeat, so these planes are simulated.' : '';
}

/**
 * The words a challenge sends: the title and the caption. The caption gives the score and the place, and the link (challengeLinkFor).
 * A destination that cannot carry a link (TikTok, Instagram: linkInCaption) gets the words alone; the share panel offers no such app
 * for a challenge, so in practice every challenge caption has its link. r: the game's result, with r.challenge (challengeFromGame).
 */
export function challengeTexts(r, destination = 'share') {
  const ch = r.challenge;
  const pts = `${ch.score.toLocaleString('en-US')} point${ch.score === 1 ? '' : 's'}`;
  const where = r.iata ? `${r.city || r.name} (${r.iata})` : r.name;
  const ask = `Can you beat my ${pts} at ${where} in Short Final?`;
  // the words for the link being made: the same when a friend on this game's version and layout would have the same planes
  const tail = linkInCaption(destination) ? `\nPlay ${challengeSamePlanes(ch, ch.layout) ? 'the same' : 'similar'} planes: ${challengeLinkFor(ch)}` : '';
  return { title: `Short Final challenge: ${pts} at ${r.iata || r.icao}`, text: `${ask}${tail}` };
}
