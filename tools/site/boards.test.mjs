// Tests for the airport top-controllers panel: the pure browser helpers (site-src/assets/boards-core.mjs), the panel's markup
// (tools/site/lib/boardpanel.mjs) and the feature flag. Run: node --test tools/site/boards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_BASE,
  LEVELS,
  boardUrl,
  createBoardCache,
  defaultLevel,
  formatName,
  formatRank,
  formatScore,
  localDayIn,
  panelFor,
  summarize,
} from '../../site-src/assets/boards-core.mjs';
import { boardPanelHtml, boardsEnabled } from './lib/boardpanel.mjs';

const TOOL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL, '..', '..');
const DAY_MS = 86400000;
const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / DAY_MS;

const row = (rank, name, score) => ({ rowId: rank, rank, name, score, icao: 'KDEN', level: 'normal', when: 0 });
const ctxWith = (features) => ({ root: ROOT, config: { features } });
const DEN = { icao: 'KDEN', iata: 'DEN', lat: 39.8617, lon: -104.6732 };

// ---------- formatting (what the panel shows, as the game's board does) ----------

test('a score is the whole number with no separators, as the game board shows it', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(1234), '1234');
  assert.equal(formatScore(999.6), '1000');
  assert.equal(formatScore(null), '');
  assert.equal(formatScore('x'), '');
});

test('a rank is a positive whole number', () => {
  assert.equal(formatRank(1), '1');
  assert.equal(formatRank(5), '5');
  assert.equal(formatRank(0), '');
  assert.equal(formatRank(1.5), '');
  assert.equal(formatRank(undefined), '');
});

test('a name is trimmed, and a missing name is empty', () => {
  assert.equal(formatName('  Ada  '), 'Ada');
  assert.equal(formatName('Pilot 4821'), 'Pilot 4821');
  assert.equal(formatName(null), '');
});

// ---------- the request ----------

test('the week board address names the airport, the level, the week and the airport-local day, and nothing else', () => {
  const url = boardUrl({ icao: 'KDEN', level: 'normal', localDay: 20500 });
  assert.equal(url, `${API_BASE}/v1/board?board=level&icao=KDEN&level=normal&period=week&localDay=20500`);
  assert.equal(API_BASE, 'https://api.playshortfinal.com');
  assert.equal(url.includes('token'), false);
  assert.equal(url.includes('authorization'), false);
});

test('the address refuses a bad airport code, level or day', () => {
  assert.throws(() => boardUrl({ icao: 'k den!', level: 'normal', localDay: 1 }), RangeError);
  assert.throws(() => boardUrl({ icao: 'KDEN', level: 'expert', localDay: 1 }), RangeError);
  assert.throws(() => boardUrl({ icao: 'KDEN', level: 'normal', localDay: -1 }), RangeError);
  assert.throws(() => boardUrl({ icao: 'KDEN', level: 'normal', localDay: 1.5 }), RangeError);
});

test('the local day is the calendar day in the airport zone, and a Monday is a Monday', () => {
  // 26 Oct 2026 is a Monday. 07:00 UTC is 01:00 on Monday in Denver (MDT, UTC-6).
  const monday = dayOf(2026, 10, 26);
  assert.equal(localDayIn('America/Denver', Date.UTC(2026, 9, 26, 7, 0)), monday);
  // 05:00 UTC is 23:00 on Sunday in Denver: the day is still the Sunday before.
  assert.equal(localDayIn('America/Denver', Date.UTC(2026, 9, 26, 5, 0)), monday - 1);
  // the same instant is a different day in Sydney (UTC+11 in late October)
  assert.equal(localDayIn('Australia/Sydney', Date.UTC(2026, 9, 25, 20, 0)), monday);
});

// ---------- the answer ----------

test('a board with rows is ok, shows the top five, and keeps the total', () => {
  const rows = [row(1, 'Ada', 900), row(2, 'Pilot 0042', 800), row(3, 'Lin', 700), row(4, 'Sam', 600), row(5, 'Kit', 500), row(6, 'Old', 400)];
  const s = summarize({ board: 'x', period: 'week', rows, you: null, total: 9 });
  assert.equal(s.state, 'ok');
  assert.equal(s.total, 9);
  assert.equal(s.rows.length, 5);
  assert.deepEqual(s.rows[0], { rank: '1', name: 'Ada', score: '900' });
  assert.equal(s.rows[4].name, 'Kit');
});

test('a valid board with no rows is empty, and a bad answer is an error', () => {
  assert.equal(summarize({ rows: [], total: 0 }).state, 'empty');
  assert.equal(summarize({ rows: [] }).state, 'empty');
  assert.equal(summarize({ error: 'x' }).state, 'error');
  assert.equal(summarize(null).state, 'error');
  assert.equal(summarize('not json').state, 'error');
});

test('a row without a name, rank or score is left out', () => {
  const s = summarize({ rows: [row(1, '', 900), row(2, 'Lin', 'n/a'), row(3, 'Sam', 600)], total: 3 });
  assert.deepEqual(s.rows.map((r) => r.name), ['Sam']);
});

test('the level the panel opens on is the most played, and Normal when nobody has played or Normal ties', () => {
  const board = (total) => ({ state: total ? 'ok' : 'empty', rows: [], total });
  assert.equal(defaultLevel({ beginner: board(3), easy: board(0), normal: board(0), hard: board(7), chaos: board(2) }), 'hard');
  assert.equal(defaultLevel({ beginner: board(0), easy: board(0), normal: board(0), hard: board(0), chaos: board(0) }), 'normal');
  assert.equal(defaultLevel({ beginner: board(5), easy: board(0), normal: board(5), hard: board(0), chaos: board(0) }), 'normal');
  assert.equal(defaultLevel({}), 'normal');
  assert.deepEqual(LEVELS, ['beginner', 'easy', 'normal', 'hard', 'chaos']);
});

// ---------- the empty state and the quiet failure ----------

const board = (state, total = 0, rows = []) => ({ state, total, rows });
const allEmpty = () => Object.fromEntries(LEVELS.map((l) => [l, board('empty')]));

test('nobody at the airport this week: the panel shows the all-empty state, with no rows and no caption', () => {
  const view = panelFor(allEmpty(), 'normal');
  assert.deepEqual(view, { show: true, rows: [], total: 0, empty: 'all' });
});

test('nobody on this level but somebody on another: the level empty state names the level', () => {
  const results = allEmpty();
  results.hard = board('ok', 2, [{ rank: '1', name: 'Ada', score: '900' }]);
  assert.equal(panelFor(results, 'normal').empty, 'level');
  assert.equal(panelFor(results, 'hard').empty, null);
  assert.equal(panelFor(results, 'hard').rows.length, 1);
});

test('when no level answers, the panel stays hidden (it fails quietly)', () => {
  const results = Object.fromEntries(LEVELS.map((l) => [l, board('error')]));
  assert.equal(panelFor(results, 'normal').show, false);
  assert.equal(panelFor(undefined, 'normal').show, false);
});

test('a failed selected level shows no rows, and says the board could not load', () => {
  const results = allEmpty();
  results.normal = board('error');
  results.hard = board('ok', 1, [{ rank: '1', name: 'Ada', score: '900' }]);
  const view = panelFor(results, 'normal');
  assert.equal(view.show, true);
  assert.equal(view.empty, 'failed');
  assert.equal(view.rows.length, 0);
  assert.equal(panelFor(results, 'hard').empty, null, 'a level that answered still shows its rows');
  assert.equal(panelFor(results, 'hard').rows.length, 1);
});

test('the panel has a failed-level message, and the browser script shows it for that state', () => {
  const out = boardPanelHtml(ctxWith({ airportBoards: true }), DEN);
  assert.ok(out.includes('We could not load this board. Try another level, or try again later.'), 'failed text');
  assert.match(out, /data-empty="failed" hidden>/);
  const script = fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'boards.mjs'), 'utf8');
  assert.match(script, /emptyFailed\.hidden = view\.empty !== 'failed'/);
  assert.equal(out.includes('<link rel="stylesheet"'), false, 'the panel carries no stylesheet link: its styles are in site.css');
});

// ---------- the cache ----------

test('each level is fetched once per page and day; a failed request is asked again next time', async () => {
  const urls = [];
  let fail = true;
  const cache = createBoardCache({
    getJson: async (url) => {
      urls.push(url);
      if (fail && url.includes('level=hard')) throw new Error('network');
      return { rows: [row(1, 'Ada', 900)], total: 1 };
    },
  });
  const first = await cache.all('KDEN', 20500);
  assert.equal(Object.keys(first).length, 5);
  assert.equal(first.hard.state, 'error');
  assert.equal(first.normal.state, 'ok');
  assert.equal(urls.length, 5);

  // a second call for the same airport and day asks nothing new for the levels that worked
  fail = false;
  const second = await cache.all('KDEN', 20500);
  assert.equal(urls.length, 6, 'only the failed level is asked again');
  assert.equal(second.hard.state, 'ok');
  assert.equal(cache.size(), 5);

  // a new day is a new week's address, so it is asked again
  await cache.week('KDEN', 'normal', 20501);
  assert.equal(urls.length, 7);
});

test('a non-JSON answer is an error and is not kept', async () => {
  let calls = 0;
  const cache = createBoardCache({ getJson: async () => { calls++; return 'nope'; } });
  assert.equal((await cache.week('KDEN', 'easy', 20500)).state, 'error');
  assert.equal((await cache.week('KDEN', 'easy', 20500)).state, 'error');
  assert.equal(calls, 2);
  assert.equal(cache.size(), 0);
});

// ---------- the markup ----------

test('the panel follows its flag, and its markup is absent while it is off', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-src', 'config.json'), 'utf8'));
  assert.equal(boardsEnabled(config), config.features.airportBoards === true);
  assert.equal(boardsEnabled({ ...config, features: { ...config.features, airportBoards: false } }), false);
  assert.equal(boardPanelHtml(ctxWith({ airportBoards: false }), DEN), '');
  assert.equal(boardPanelHtml(ctxWith(undefined), DEN), '');
});

test('the panel reads the heading, the empty state and the Play button with its campaign', () => {
  const out = boardPanelHtml(ctxWith({ airportBoards: true }), DEN);
  assert.match(out, /<h2 id="top-controllers-title">Top controllers at DEN this week<\/h2>/);
  assert.ok(out.includes('No one has landed planes at DEN this week. Be the first: get the app'), 'empty state text');
  assert.match(out, /utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3Dboard-kden%26utm_content%3Dboard/);
  assert.match(out, /data-event="play_store_click" data-ev-page="board-kden" data-ev-position="board" data-ev-airport="KDEN"/);
  assert.match(out, /<section class="section board-panel"[^>]* hidden>/, 'hidden until the script finds a board');
  assert.match(out, /<script type="module" src="\/assets\/site\/boards\.mjs"><\/script>/);
  for (const level of LEVELS) assert.ok(out.includes(`data-level="${level}"`), `level button ${level}`);
  assert.match(out, /data-empty="level" data-template="No one has landed planes on \{level\} at DEN this week yet\. Be the first: get the app"/);
});

test('an airport without an IATA code uses its ICAO code in the words, and the campaign stays the airport', () => {
  const out = boardPanelHtml(ctxWith({ airportBoards: true }), { icao: 'EGLL', iata: '', lat: 51.4706, lon: -0.4619 });
  assert.ok(out.includes('Top controllers at EGLL this week'));
  assert.ok(out.includes('utm_campaign%3Dboard-egll'));
});

test('the panel markup has no scores or names in it (the script fills them in as text)', () => {
  const out = boardPanelHtml(ctxWith({ airportBoards: true }), DEN);
  assert.equal(/<li[ >]|board-row|board-score/.test(out), false);
  assert.match(out, /data-list/);
});

test('the browser script sets names as text, never as markup', () => {
  const script = fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'boards.mjs'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'boards-core.mjs'), 'utf8');
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(script + core), false);
  assert.match(script, /textContent/);
});
