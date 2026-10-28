// Friends' challenges (3.2; DECISIONS 411 to 416, 413, 421; 3.3 DECISIONS 435 to 437). A finished game can be sent to a friend as a
// challenge: the same airport, the same seed, the same level and the same start weather, so the friend's game makes similar simulated
// planes (sim.js, director.js and departures.js are seeded from the seed; weather.js from the weather). In 3.3 the link also carries the
// challenger's screen, its layout's code and its game's version, and a friend's game on those makes the same planes, in the same order,
// when nothing else moved them: no real plane came in, and nothing the link does not carry (DECISIONS 436).
// The challenger's score sits beside the friend's score on the end card. A challenge game is unranked and goes to no board (ranking.js).
// No DOM and no storage here: the rules are tested without the game, and main.js builds the game and the share panel.
import { checkChallenge, challengeBoardUrl, challengeLinkFor, cleanName, linkInCaption } from './links.js?v=2f66fd5f';
import { VERSION } from './version.js?v=2f66fd5f';
import { WORLD_H } from './config.js?v=2f66fd5f';

/** Santa's day (3.4; santa.js): the day number of 24 December 2026. A challenge's setup.santaDay is this, or null. */
export const CHALLENGE_SANTA_DAY = 20811;

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
 * g: { icao, seed, level, score, rules, real, weather, reasons, screen, layout, repeatable, boardId, fixesHidden, santa, challenge, demo,
 * rush }. rules is the game's own rules: 'd' for the daily challenge, 'o' for departures off, '' for the usual (main.js works it out at
 * the start). real is true when real planes were in the game. weather is the start weather the game flew (weatherOfSeed); a game whose
 * weather is not known is not sent. reasons: the game's ranking reasons (ranking.js). screen: the screen its world was made from
 * ({ cssW, cssH }); layout: its layout's code; repeatable (repeatableGame): whether the link may carry the game's version, which is what
 * makes the friend's planes the same. 3.4: boardId is the game's replay identity id (challengeIdOf, awaited by the caller); fixesHidden and
 * santa are the game's own start setup (the link's fh and sa); challenge is the checked challenge the game was played from, or null.
 * The result's id is set only when the game can go on a challenge board (boardableGame): the id names the board's page.
 */
export function challengeFromGame(g) {
  // a weekend event or a Thanksgiving Rush game is not sent: its twist (the weather, the rush's waves and bank) is not in a link, so a
  // friend's game would not have the same planes (weekend.js, rush.js; fixer, 3.4 review)
  if (!g || g.seed == null || g.weather == null || g.weekend || g.rush) return null;
  const reasons = Array.isArray(g.reasons) ? g.reasons : [];
  if (reasons.some((r) => CHALLENGE_BLOCKERS.includes(r))) return null;
  const ch = checkChallenge({
    icao: g.icao, seed: g.seed, level: g.level, score: Math.max(0, Math.round(Number(g.score) || 0)), rules: g.rules || '', real: !!g.real,
    weather: g.weather, screen: g.screen || null, layout: g.layout || null, version: g.repeatable && g.layout ? VERSION : null,
    id: boardableGame(g) ? g.boardId : null, fixesHidden: !!g.fixesHidden, santa: !!g.santa,
  });
  return ch; // ch.id is set only when the game can go on a board (boardableGame), and then names the board's page
}

/**
 * Whether a finished game can go on a challenge board (3.4, C3): it is repeatable, not real planes, not a demo or a Rush game, and its
 * replay identity (boardId) is computed. A game played from a link must also have the link's own board id, so a friend's game that
 * does not match the link is not posted (it plays as a link that is "similar", C2). A game with no link is a finished game sent as a
 * challenge: it needs no link id.
 */
export function boardableGame(g) {
  if (!g || !g.boardId || !g.repeatable || !g.layout || !g.screen || g.real || g.demo || g.rush) return false;
  if (g.challenge && g.challenge.id !== g.boardId) return false;
  return true;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32 of bytes, in lower case, without padding (challengeIdOf keeps its first twelve characters). */
export function base32Lower(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The challenge's identity (3.4, C1): the replay's sim inputs, as a JSON array in a fixed order. Everything that makes the traffic
 * is here (the seed, the airport, the level, the rules and departures, Santa's day, the start weather, the world's size, the HUD, the
 * layout and the holding fixes); the name, the score and the phone's country are not. server/src/replay/challenge.js builds the same
 * array from the same fields, and tests/fixtures/challenge-identity.json pins both.
 */
export function challengeIdentity(r) {
  const s = r.setup || {};
  const wx = s.wxSeed;
  const wind = wx == null ? 'generated' : [wx.windDir ?? null, wx.windKt, wx.gustKt, Number(wx.fog) || 0, wx.storms ? 1 : 0];
  return [
    'sf-challenge', 1, r.app, r.icao, r.seed, r.level, s.rules || '', !!s.departures, s.santaDay === CHALLENGE_SANTA_DAY ? CHALLENGE_SANTA_DAY : null,
    wind, r.W, r.H ?? WORLD_H, r.hud ?? null, r.layout, !!s.fixesHidden,
  ];
}

/** A replay's challenge id: the first twelve characters of the base32 of SHA-256 over the identity's JSON (async: crypto.subtle). */
export async function challengeIdOf(replay) {
  const bytes = new TextEncoder().encode(JSON.stringify(challengeIdentity(replay)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return base32Lower(digest).slice(0, 12);
}

/**
 * The setup a friend's game takes from its link (3.4, D4, D6): the holding fixes from fh, and Santa from sa (20811, or null). Never the
 * save and never the clock, on any date.
 */
export function challengeSetupFromLink(ch) {
  return { fixesHidden: !!(ch && ch.fixesHidden), santaDay: ch && ch.santa ? CHALLENGE_SANTA_DAY : null };
}

/**
 * The copy of a finished game's replay that goes to a challenge board (C3, fixer 3.4 review). The board is 'challenge' and the daily is
 * null. The ranking reasons are emptied: a challenge game carries the 'challenge' reason on the phone, and the server refuses any reason
 * (verify.js). The feed becomes the daily's empty tick at each of the game's own steps: the server takes only that feed for a challenge
 * (the game's live ticks are not in a challenge's traffic, which is simulated). setup.rules is 'd' for a game made from the daily (and kept
 * when the game is a friend's rules-'d' challenge), '' otherwise: the server takes only '' or 'd' for a challenge.
 */
export function challengeReplayCopy(replay) {
  const s = replay.setup || {};
  const rules = replay.board === 'daily' || s.rules === 'd' ? 'd' : '';
  const feed = (Array.isArray(replay.feed) ? replay.feed : []).map((f) => [f[0], 'daily', [], null]);
  return { ...replay, board: 'challenge', daily: null, reasons: [], feed, setup: { ...s, rules } };
}

/** The outbox entry for that copy (outbox.js enqueue): the board, the airport, the level, the game's version and layout, and its id. */
export function challengeQueueEntry(ch, { layout, version }) {
  return { board: 'challenge', icao: ch.icao, level: ch.level, daily: null, version, layout, challengeId: ch.id };
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
  // a board link (3.4) says the board is there to see; the 3.3 caption is unchanged
  const tail = linkInCaption(destination)
    ? `\nPlay ${challengeSamePlanes(ch, ch.layout) ? 'the same' : 'similar'} planes${ch.id ? ' and see the board' : ''}: ${challengeLinkFor(ch)}`
    : '';
  return { title: `Short Final challenge: ${pts} at ${r.iata || r.icao}`, text: `${ask}${tail}` };
}
