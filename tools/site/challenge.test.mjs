// Tests for the challenge board page's pure browser helpers (site-src/challenge/board-core.mjs). The page itself and the Worker's
// routing are in site.test.mjs. Run: node --test tools/site/challenge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_BASE,
  APP_ID,
  LEVELS,
  appIntent,
  airportOf,
  boardUrl,
  formatScore,
  hasParts,
  idFromPath,
  isAndroid,
  levelOfParts,
  partsOf,
  shapeBoard,
} from '../../site-src/challenge/board-core.mjs';
import { playLink } from './lib/play.mjs';

const ID = 'k7m2q4xvbn3s';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PLAY_SHAPE = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.thinaircapital\.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D[a-z0-9-]+(%26utm_content%3D[a-z0-9-]+)?$/;

const row = (i, name = `Player ${i}`) => ({ rowId: `r${i}`, rank: i, name, score: 500 - i, icao: 'KDFW', level: 'hard', when: 0 });

test('the id comes from the address: twelve base32 characters, with or without the last slash', () => {
  assert.equal(idFromPath(`/c/${ID}/`), ID);
  assert.equal(idFromPath(`/c/${ID}`), ID);
  assert.equal(idFromPath('/c/abcdefghij23/'), 'abcdefghij23');
});

test('an address that is not a board, or whose id the server would refuse, gives no id (so no request)', () => {
  assert.equal(idFromPath('/c/K7M2Q4XVBN3S/'), null, 'upper case');
  assert.equal(idFromPath('/c/k7m2q4xvbn31/'), null, 'the digit 1 is not base32 here');
  assert.equal(idFromPath('/c/k7m2q4xvbn3/'), null, 'eleven characters');
  assert.equal(idFromPath('/c/k7m2q4xvbn3s/extra'), null, 'a longer path');
  assert.equal(idFromPath('/c/'), null);
  assert.equal(idFromPath('/airports/kdfw/'), null);
  assert.equal(idFromPath(undefined), null);
});

test('the board address names the challenge board and the id, on the API host', () => {
  assert.equal(API_BASE, 'https://api.playshortfinal.com');
  assert.equal(boardUrl(ID), `${API_BASE}/v1/board?board=challenge&id=${ID}`);
  assert.throws(() => boardUrl('bad'), RangeError);
  assert.throws(() => boardUrl(undefined), RangeError);
});

test('only the challenge parts of an address are passed on, in the order the link has them', () => {
  const parts = partsOf('?a=KDFW&c=2m7qk4&evil=<img>&l=h&s=412&fh=1&sa=0&zz=9');
  assert.equal(parts.toString(), 'a=KDFW&c=2m7qk4&l=h&s=412&fh=1&sa=0');
  assert.equal(hasParts('?evil=1'), false);
  assert.equal(hasParts('?s=412'), true);
  assert.equal(hasParts(''), false);
});

test('the airport and the level of a link are read only when they are valid', () => {
  assert.equal(airportOf('?a=kdfw'), 'KDFW');
  assert.equal(airportOf('?a=<x>'), '');
  assert.equal(airportOf(''), '');
  assert.equal(levelOfParts('?l=h'), 'hard');
  assert.equal(levelOfParts('?l=n'), 'normal');
  assert.equal(levelOfParts('?l=z'), '');
  assert.equal(levelOfParts('?l=constructor'), '', 'not an inherited key');
});

test('a board answer is shown as ten rows at most, with the airport and level from its rows', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
  const board = shapeBoard({ board: 'x', period: 'all', rows, you: null, total: 14 });
  assert.equal(board.rows.length, 10);
  assert.equal(board.total, 14);
  assert.equal(board.icao, 'KDFW');
  assert.equal(board.level, 'hard');
  assert.deepEqual(Object.keys(board.rows[0]).sort(), ['name', 'rank', 'score']);
});

test('an empty board is an empty list with no airport or level', () => {
  const board = shapeBoard({ board: 'x', period: 'all', rows: [], you: null, total: 0 });
  assert.deepEqual(board.rows, []);
  assert.equal(board.total, 0);
  assert.equal(board.icao, '');
  assert.equal(board.level, '');
});

test('a name is trimmed; a score is a whole number; a code or level that is not valid is left out', () => {
  const board = shapeBoard({ rows: [{ rank: 1, name: '  Ada  ', score: 412.4, icao: 'kdfw<', level: 'hard' }] });
  assert.equal(board.rows[0].name, 'Ada');
  assert.equal(board.rows[0].score, 412);
  assert.equal(board.icao, '', 'a code with markup is not used');
  assert.equal(board.level, 'hard');
  assert.equal(board.total, 1, 'the total falls back to the row count');
  const other = shapeBoard({ rows: [{ rank: 1, name: 'A', score: 1, icao: 'KDFW', level: 'expert' }] });
  assert.equal(other.level, '', 'a level outside the five is not used');
  assert.ok(LEVELS.includes('hard'));
});

test('an answer that is not a board throws, so the page shows its error state', () => {
  assert.throws(() => shapeBoard(null), TypeError);
  assert.throws(() => shapeBoard({ rows: 'x' }), TypeError);
  assert.throws(() => shapeBoard('<html>'), TypeError);
});

test('a score is the whole number with no separators, as the game board shows it', () => {
  assert.equal(formatScore(412), '412');
  assert.equal(formatScore(412.6), '413');
  assert.equal(formatScore(NaN), '');
  assert.equal(formatScore('412'), '');
});

test('only an Android browser gets the app intent', () => {
  assert.equal(isAndroid(ANDROID_UA), true);
  assert.equal(isAndroid(DESKTOP_UA), false);
  assert.equal(isAndroid(undefined), false);
});

test('the Android intent opens the app on this challenge with its parts, and falls back to the Play listing', () => {
  const fallback = playLink('challenge', 'challenge-cta');
  const intent = appIntent(ID, '?a=KDFW&c=2m7qk4&l=h&s=412&evil=<x>&fh=1', fallback);
  assert.ok(intent.startsWith(`intent://playshortfinal.com/c/${ID}/?a=KDFW&c=2m7qk4&l=h&s=412&fh=1#Intent;scheme=https;`), intent);
  assert.ok(intent.includes(`;package=${APP_ID};`));
  assert.ok(intent.includes(`S.browser_fallback_url=${encodeURIComponent(fallback)};end`));
  assert.ok(!intent.includes('evil'), 'a part that is not a challenge part does not travel');
  assert.match(decodeURIComponent(intent.split('S.browser_fallback_url=')[1].replace(/;end$/, '')), PLAY_SHAPE);
  assert.throws(() => appIntent('bad', '', fallback), RangeError);
});

test('the board page\'s Play link has the site\'s referrer shape for its own page key', () => {
  assert.match(playLink('challenge', 'challenge-cta'), PLAY_SHAPE);
  assert.match(playLink('challenge'), PLAY_SHAPE);
});
