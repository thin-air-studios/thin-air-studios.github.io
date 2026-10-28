// The Leaderboards and Achievements screens (requirements 16 and 17), and the sheet they share for the two questions that
// need one (Report name, Remove my scores). The corner buttons, the home stats line and the end card's Leaderboard button
// come here. The logic is in boards.js, achscreen.js and stats.js; this file puts it on the screen. main.js passes in what
// it owns: the save, the screen stack's show, the toast, the press sound, and the start of a game.
import * as db from './airportdb.js?v=2f66fd5f';
import { WEEKEND_EPOCH, weekendAirport, weekendDates, weekendOf, lastWeekendOf, nextWeekendOf, themeOf } from './weekend.js?v=2f66fd5f';
import { register } from './screenstack.js?v=2f66fd5f';
import { haptic, onPlayGamesState, playGames } from './platform.js?v=2f66fd5f';
import { achievementsLabel, boardsLabel } from './playgames.js?v=2f66fd5f';
import { BOARDS, STAR_GOALS } from './config.js?v=2f66fd5f';
import { airportRows, cellOf, cellsFor, mostPlayed, topLevel } from './stats.js?v=2f66fd5f';
import { canPlayGames, clockNow } from './profile.js?v=2f66fd5f';
import { SAVE_FAILED } from './settingsnotes.js?v=2f66fd5f';
import { badgeCount, earnedLabel, groups, orderedBadges, progressFor, rankProgress, totals } from './achscreen.js?v=2f66fd5f';
import { tierOf } from './achievements.js?v=2f66fd5f';
import { cellStates, nextMilestone, streakLine, streakScreenLine, streakState } from './streak.js?v=2f66fd5f';
import {
  COPY, LEVELS, LEVEL_NAMES, airportZone, boardUrl, boardsLive, fetchBoard, isCallsign, localDayIn, makeApi, playGamesBoardFor,
  refreshBoardsLive,
} from './boards.js?v=2f66fd5f';
import { outboxState } from './outbox.js?v=2f66fd5f';
import { COPY as STATS_COPY, airportShortName, bestChallenge, goalView, hourBars, myWeekLanded, readWorldStats, recordWords, rewardLine, statsView, withCommas } from './worldstats.js?v=2f66fd5f';
import { LAND_PATH, mapDots } from './worldmap.js?v=2f66fd5f';

const $ = (id) => document.getElementById(id);
const starsOf = (score) => STAR_GOALS.filter((g) => score >= g).length;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(STAR_GOALS.length - n);
const CACHE_MS = 60 * 1000;
const PLAYABLE = ['beginner', 'easy', 'normal']; // the levels a game can be started at from Your airports (not Hard or Chaos)

let deps = null;
const api = makeApi();
const state = {
  tab: 'world', // world | daily | mine
  info: null, // the World tab's airport (an airportdb record)
  level: null, // the World tab's level, kept while the app runs
  period: 'week', // today | week | all
  seq: 0, // the newest request: an older answer is dropped
  cache: new Map(), // a board's URL -> { at, res }, for a minute
  rankCache: new Map(), // "icao:level" -> the caller's world rank
  expanded: null, // the Your airports row open at the moment
  sheet: null, // the sheet's yes action
  cardsSeq: 0, // the newest airport cards (Your airports, or the World tab before launch): an older render is dropped
};

/** Element factory: a tag, a class and its text. */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const save = () => deps.getSave();
/** 13 or older and agreed: the own rank, posting and the account switches are theirs. */
const agreed = () => canPlayGames(save(), clockNow());
const signedIn = () => {
  const s = save().session;
  return !!(s && s.token && s.expiresAt > Date.now());
};
const ownToken = () => (agreed() && signedIn() ? save().session.token : null);
/** A report needs a signed-in player with at least one accepted ranked score (requirement 21, O23). */
const canReport = () => !!ownToken() && (Number(save().session.accepted) || 0) >= 1;

const airportOf = (icao) => (state.info && state.info.icao === icao ? Promise.resolve(state.info) : db.getAirport(icao));
const cityOf = (info) => (info && (info.city || info.name) ? (info.city || info.name).split(/[(,]/)[0].trim() : '');

// ---------------------------------------------------------------- the sheet (Report name, Remove my scores)

function ask({ title, body, yes, onYes }) {
  $('boards-sheet-title').textContent = title;
  $('boards-sheet-body').textContent = body;
  $('btn-sheet-yes').textContent = yes;
  state.sheet = onYes;
  deps.show('boards-sheet');
}

function closeSheet() {
  state.sheet = null;
  deps.show('boards-sheet', false);
}

// ---------------------------------------------------------------- the boards

/** A board, from the cache when it was asked for in the last minute (memory only: nothing is kept on the phone). */
async function cachedBoard(params, token) {
  const key = boardUrl({ ...params, base: BOARDS.base }) + (token ? '#own' : '');
  const hit = state.cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.res, updated: hit.at };
  const res = await fetchBoard(params, { token, online: navigator.onLine !== false });
  // only an answer is stamped "Updated": a failure or the pre-launch message has no time to show
  if (res.state !== 'ok' && res.state !== 'empty') return { ...res, updated: 0 };
  state.cache.set(key, { at: Date.now(), res });
  return { ...res, updated: Date.now() };
}

function footnote(updated) {
  const stamp = updated ? ` Updated ${new Date(updated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : '';
  return COPY.footnote + stamp;
}

/** The note under a board. A queued game that needs a newer build says so here too (outbox.js). */
function setNote(text, id = 'boards-note') {
  const n = $(id);
  const t = outboxState(save()).update ? [COPY.update, text].filter(Boolean).join(' ') : text;
  n.textContent = t;
  n.hidden = !t;
}

function retryButton(again) {
  const b = el('button', 'btn small boards-retry', 'Try again');
  b.type = 'button';
  b.addEventListener('click', () => {
    deps.press();
    again();
  });
  return b;
}

/** A board's rows, with the caller's own row marked. A name is long-pressed to report it, when the player may. */
function renderRows(list, rows, you) {
  list.textContent = '';
  const reportable = canReport();
  for (const row of rows) {
    const mine = !!you && you.rowId === row.rowId;
    const line = el('div', 'board-row' + (mine ? ' mine' : ''));
    line.append(el('span', 'board-rank', `${row.rank}`));
    const name = el('span', 'board-name', row.name);
    name.dataset.row = String(row.rowId);
    if (reportable && !mine) bindReport(name);
    line.append(name, el('span', 'board-score', String(row.score)));
    list.append(line);
  }
}

function showMessage(list, text, again = null) {
  list.textContent = '';
  list.append(el('p', 'boards-empty', text));
  if (again) list.append(retryButton(again));
}

const PERIOD_WORD = { today: 'today', week: 'this week', all: 'all time' };

/**
 * The World side: the caller's rank on this board when the server gave one, else the best they have here (ranked, all
 * time). Shown with the airport and level it is for, so it reads the same with or without a sign-in.
 */
function renderBest(you) {
  const box = $('boards-you');
  box.textContent = '';
  const info = state.info;
  box.hidden = !info;
  if (!info) return;
  const cell = cellOf(save(), info.icao, state.level);
  const ranked = cell && cell.bestRanked > 0 ? cell.bestRanked : 0;
  const where = `${LEVEL_NAMES[state.level]} at ${cityOf(info) || info.iata || info.icao}`;
  if (you) box.append(el('span', 'board-you-label', 'Your rank'), el('span', 'board-you-rank', `#${you.rank}`), el('span', 'board-you-name', `Score ${you.score} · ${PERIOD_WORD[state.period]}`), el('span', 'board-you-where', where));
  else box.append(el('span', 'board-you-label', 'Your best'), el('span', 'board-you-rank', ranked ? String(ranked) : '–'), el('span', 'board-you-name', ranked ? 'ranked, all time' : 'No ranked game here yet'), el('span', 'board-you-where', where));
}

/** The Daily side: the caller's rank on today's board, when the server gave one. */
function renderDailyYou(you) {
  const box = $('boards-daily-you');
  box.textContent = '';
  box.hidden = !you;
  if (!you) return;
  box.append(el('span', 'board-you-label', 'Your rank today'), el('span', 'board-you-rank', `#${you.rank}`), el('span', 'board-you-name', `Score ${you.score}`));
}

function renderWorldChrome() {
  const info = state.info;
  $('boards-airport-code').textContent = info ? info.iata || info.icao : '';
  $('boards-explainer').textContent = COPY.explainer;
  for (const b of document.querySelectorAll('.boards-period [data-period]')) b.classList.toggle('on', b.dataset.period === state.period);
  for (const b of document.querySelectorAll('.boards-levels [data-level]')) {
    const on = b.dataset.level === state.level;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

async function loadWorld() {
  const seq = ++state.seq;
  renderWorldChrome();
  const list = $('boards-list');
  renderBest(null);
  syncPlayGamesButton();
  if (!state.info) return;
  // before the boards are live nothing is asked for: the launch message, and the own airports under it (no request is made)
  if (!boardsLive()) {
    showMessage(list, COPY.preLaunch);
    setNote(footnote(0));
    await appendAirportCards(list, () => loadWorld());
    return;
  }
  $('boards-world').setAttribute('aria-busy', 'true');
  showMessage(list, 'Loading…');
  const info = state.info;
  const params = { board: 'level', icao: info.icao, level: state.level, period: state.period, localDay: localDayIn(airportZone(info), Date.now()) };
  const res = await cachedBoard(params, ownToken());
  if (seq !== state.seq) return;
  $('boards-world').setAttribute('aria-busy', 'false');
  if (res.state === 'offline') showMessage(list, COPY.offline, () => loadWorld());
  else if (res.state === 'error') showMessage(list, COPY.error, () => loadWorld());
  else if (res.state === 'empty') showMessage(list, COPY.empty);
  else renderRows(list, res.rows, res.you);
  renderBest(ownToken() ? res.you : null); // only asked for with the session (13 and up, agreed): no session, no own row
  // the caller's own name was replaced by a callsign: say why (the score still counts)
  const s = save().session;
  const blocked = !!(res.you && isCallsign(res.you.name) && s && s.displayName && s.showName !== false);
  setNote(blocked ? `${COPY.blocked} ${footnote(res.updated)}` : footnote(res.updated));
}

function openAirportSearch(open) {
  $('boards-search').hidden = !open;
  if (!open) return;
  const input = $('boards-search-input');
  input.value = '';
  $('boards-results').textContent = '';
  setTimeout(() => input.focus(), 50);
}

let searchTimer = 0;
async function runAirportSearch(q) {
  const list = $('boards-results');
  list.textContent = '';
  if (!q.trim()) return;
  const hits = await db.search(q, 12);
  if ($('boards-search-input').value !== q) return; // a newer search has started
  for (const h of hits) {
    const li = el('li');
    const b = el('button', 'boards-hit');
    b.type = 'button';
    b.append(el('b', '', h.iata || h.icao), el('span', '', cityOf(h) ? `${h.name} · ${cityOf(h)}` : h.name));
    b.addEventListener('click', () => {
      deps.press();
      state.info = h;
      openAirportSearch(false);
      loadWorld();
    });
    li.append(b);
    list.append(li);
  }
  if (!hits.length) list.append(el('li', 'boards-empty', 'No airport matches that.'));
}

/**
 * The Play Games board for the open tab: hidden for a player who has not agreed, before the boards' sign-in, and on Your airports. Its label follows
 * the Play Games sign-in itself (platform.js status, playgames.js boardsLabel), since that is what opens the board; signed out it is the sign-in.
 */
function syncPlayGamesButton() {
  const btn = $('btn-boards-pgs');
  const board = state.tab === 'daily' ? (dailyView === 'today' ? playGamesBoardFor('', true) : null) : playGamesBoardFor(state.level, false);
  btn.hidden = !(playGames.enabled() && agreed() && state.tab !== 'mine' && state.tab !== 'stats' && board);
  btn.dataset.board = board || '';
  btn.textContent = boardsLabel(playGames.status());
}

/** The Achievements screen's Play Games button: open them when signed in, the sign-in otherwise (both shown, for an agreed player). */
function syncAchievementsButton() {
  const btn = $('btn-ach-pgs');
  btn.hidden = !(playGames.enabled() && agreed());
  btn.textContent = achievementsLabel(playGames.status());
}

// ---------------------------------------------------------------- the Daily tab

// The Daily challenge tab's segment (3.3, DECISIONS 430): Today's daily challenge, or this weekend's event. The view is kept for the
// session in memory, as the World stats view is.
let dailyView = 'today';
const WEEKEND_PRE_LAUNCH = 'Weekend boards open at launch.';

function showDailyView(view) {
  dailyView = view === 'weekend' ? 'weekend' : 'today';
  for (const b of document.querySelectorAll('[data-daily-view]')) {
    const on = b.dataset.dailyView === dailyView;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('boards-daily-today').hidden = dailyView !== 'today';
  $('boards-daily-weekend').hidden = dailyView !== 'weekend';
  if (dailyView === 'weekend') loadWeekend();
  else loadDaily();
}

/** The you row of the weekend's board (the daily's rule: only when signed in and the board holds the player's best). */
function renderWeekendYou(you) {
  const box = $('boards-weekend-you');
  box.textContent = '';
  box.hidden = !you;
  if (!you) return;
  box.append(el('span', 'board-you-label', 'Your rank this weekend'), el('span', 'board-you-rank', `#${you.rank}`), el('span', 'board-you-name', `Score ${you.score}`));
}

/**
 * The weekend event's board (weekend.js): this weekend's on Saturday and Sunday, the last one on a weekday, with the next one's line.
 * The play button starts this weekend's event on the weekend only.
 */
async function loadWeekend() {
  const seq = ++state.seq;
  const today = dayNow();
  const current = weekendOf(today);
  const W = current !== null ? current : lastWeekendOf(today);
  const head = $('boards-weekend-head');
  const date = $('boards-weekend-date');
  const next = $('boards-weekend-next');
  const play = $('btn-boards-weekend-play');
  const list = $('boards-weekend-list');
  head.textContent = '';
  renderWeekendYou(null);
  syncPlayGamesButton();
  $('btn-boards-pgs').hidden = true; // the weekend's board has no Play Games board (the event is not a leaderboard there)
  play.hidden = current === null;
  next.hidden = current !== null;
  if (W < WEEKEND_EPOCH) {
    head.append(el('b', 'boards-daily-title', 'Weekend event'));
    date.textContent = '';
    showMessage(list, 'The weekend board opens with the first event.');
    setNote('', 'boards-weekend-note');
    return;
  }
  const info = await db.getAirport(weekendAirport(W));
  const place = info ? `${info.iata || info.icao} · ${cityOf(info)}` : weekendAirport(W);
  head.append(el('b', 'boards-daily-title', current !== null ? themeOf(W).title : `Last weekend: ${themeOf(W).title}`), el('span', 'boards-daily-sub', place));
  date.textContent = `${weekendDates(W)}, on your clock`;
  if (current === null) {
    const after = nextWeekendOf(today);
    const nextInfo = await db.getAirport(weekendAirport(after));
    next.textContent = `Next weekend: ${themeOf(after).title} at ${nextInfo ? nextInfo.iata || nextInfo.icao : weekendAirport(after)}`;
  }
  play.onclick = async () => {
    deps.press();
    const now = weekendOf(dayNow());
    if (now === null || !info) return;
    deps.show('boards', false);
    deps.startAirport(info, { weekend: now });
  };
  if (!boardsLive()) {
    showMessage(list, WEEKEND_PRE_LAUNCH);
    setNote('', 'boards-weekend-note');
    return;
  }
  showMessage(list, 'Loading…');
  const res = await cachedBoard({ board: 'weekend', day: W }, ownToken());
  if (seq !== state.seq) return;
  if (res.state === 'offline') showMessage(list, COPY.offline, () => loadWeekend());
  else if (res.state === 'error') showMessage(list, COPY.error, () => loadWeekend());
  else if (res.state === 'empty') showMessage(list, current !== null ? 'No one has flown this weekend’s event yet.' : 'No one flew that weekend’s event.');
  else renderRows(list, res.rows, res.you);
  renderWeekendYou(ownToken() ? res.you : null);
  setNote(footnote(res.updated), 'boards-weekend-note');
}

async function loadDaily() {
  const seq = ++state.seq;
  const today = db.todaysDaily(); // the airport and the number from one reading (airportdb.js)
  const n = today.n;
  const info = await db.getAirport(today.airport[0]);
  const head = $('boards-daily-head');
  head.textContent = '';
  head.append(el('b', 'boards-daily-title', `Daily #${n}`), el('span', 'boards-daily-sub', info ? `${info.iata || info.icao} · ${cityOf(info)}` : today.airport[0]));
  // the play streak (streak.js): every game with a landing counts, not only the daily
  $('boards-daily-streak').textContent = streakLine(streakState(save().streak, dayNow()));
  syncPlayGamesButton();
  const list = $('boards-daily-list');
  renderDailyYou(null);
  if (!boardsLive()) {
    showMessage(list, COPY.dailyPreLaunch);
    setNote('', 'boards-daily-note');
    return;
  }
  showMessage(list, 'Loading…');
  const res = await cachedBoard({ board: 'daily', day: n }, ownToken());
  if (seq !== state.seq) return;
  if (res.state === 'offline') showMessage(list, COPY.offline, () => loadDaily());
  else if (res.state === 'error') showMessage(list, COPY.error, () => loadDaily());
  else if (res.state === 'empty') showMessage(list, COPY.empty);
  else renderRows(list, res.rows, res.you);
  renderDailyYou(ownToken() ? res.you : null);
  setNote(footnote(res.updated), 'boards-daily-note');
}

// ---------------------------------------------------------------- World stats (3.1, worldstats.js, DECISIONS 384; 3.2, DECISIONS 400)

// The tab's views (a segmented control inside the tab, below its one row of tabs): Today, Records and Map. The one open is kept
// for the session (memory only).
const STATS_TABS = ['today', 'records', 'map'];
let statsTab = 'today';
const SVG_NS = 'http://www.w3.org/2000/svg';

function showStatsTab(name) {
  statsTab = STATS_TABS.includes(name) ? name : 'today';
  for (const b of document.querySelectorAll('[data-stats-view]')) {
    const on = b.dataset.statsView === statsTab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  for (const t of STATS_TABS) $(`stats-${t}`).hidden = t !== statsTab;
}

/** The World stats tab: the counts (read at most every few minutes), then the views: Today, Records and Map. */
async function loadStats() {
  const seq = ++state.seq;
  syncPlayGamesButton();
  showStatsTab(statsTab);
  if (!boardsLive()) {
    // before the boards are live nothing is asked for (the same rule as the World tab)
    renderStatsTable(null);
    renderStatsBest(null);
    renderStatsHours(null);
    renderStatsCards(null, null, null);
    renderStatsMap(null);
    showMessage($('stats-airports'), STATS_COPY.preLaunch);
    setNote('', 'stats-note');
    return;
  }
  $('boards-stats').setAttribute('aria-busy', 'true');
  showMessage($('stats-airports'), 'Loading…');
  const res = await readWorldStats({ api });
  if (seq !== state.seq) return;
  $('boards-stats').setAttribute('aria-busy', 'false');
  await renderStats(res);
}

/** The table of the three periods: players, games and planes landed (the dashes before the counts are known). */
function renderStatsTable(view) {
  const box = $('stats-table');
  box.textContent = '';
  const head = el('div', 'stat-line stat-head');
  head.append(el('span', 'stat-cell', ''));
  for (const p of view ? view.periods : [{ label: 'Today' }, { label: 'This week' }, { label: 'All time' }]) head.append(el('span', 'stat-cell stat-col', p.label));
  box.append(head);
  for (const [label, key] of [['Players', 'players'], ['Games', 'games'], ['Planes landed', 'landed']]) {
    const line = el('div', 'stat-line');
    line.append(el('span', 'stat-cell stat-label', label));
    for (let i = 0; i < 3; i += 1) line.append(el('b', 'stat-cell', view ? withCommas(view.periods[i][key]) : '–'));
    box.append(line);
  }
}

/**
 * Today's best game as the challenge (DECISIONS 400): "Today’s best: 169 planes at Heathrow." and the button "Beat it?", whose tap starts a
 * game at that airport. Without a landing today, the words say so.
 */
function renderStatsBest(view, info = null) {
  const box = $('stats-best');
  box.textContent = '';
  box.hidden = !view;
  if (!view) return;
  if (view.best) {
    const c = bestChallenge(view.best, info ? airportShortName(info) : '');
    const btn = el('button', 'btn small stats-beat', c.button);
    btn.type = 'button';
    btn.addEventListener('click', () => beatBest(c.icao));
    box.append(el('span', 'stats-challenge', c.sentence), btn);
  } else {
    box.append(el('span', 'stats-challenge', STATS_COPY.bestNone));
  }
}

/** The challenge's tap: the boards close and a game starts at that airport (as Play today's challenge does). */
async function beatBest(icao) {
  deps.press();
  const info = await db.getAirport(icao);
  deps.show('boards', false);
  if (info) deps.startAirport(info, { demo: false });
}

/** The busiest hour's bars: the 24 hours of the UTC day, each labelled with the player's clock (DECISIONS 400). Hidden with no counts. */
function renderStatsHours(body) {
  const box = $('stats-hours');
  box.textContent = '';
  const bars = body ? hourBars(body.hours, new Date().getTimezoneOffset()) : null;
  box.hidden = !bars;
  if (!bars) return;
  const chart = el('div', 'stats-bars');
  const labels = el('div', 'stats-bar-labels');
  for (const b of bars) {
    const bar = el('i', 'stats-bar');
    bar.style.height = `${Math.round(b.ratio * 100)}%`;
    chart.append(bar);
    labels.append(el('span', 'stats-bar-label', b.label));
  }
  box.append(el('span', 'stats-kicker', 'Planes landed by hour'), chart, labels);
}

/** The Records view's two cards: the all-time most in one game (with its airport and day), and this week's goal (its bar and words). */
function renderStatsCards(body, recordInfo, goal) {
  const rec = $('stats-record');
  const gl = $('stats-goal');
  rec.textContent = '';
  gl.textContent = '';
  rec.hidden = !body;
  gl.hidden = !body;
  if (!body) return;
  const words = recordWords(body.records, recordInfo ? airportShortName(recordInfo) : '');
  rec.append(el('span', 'stats-kicker', 'Most planes in one game'));
  if (words) rec.append(el('span', 'stats-big', words.landed), el('span', 'stats-small', `${words.noun} ${words.where}`));
  else rec.append(el('span', 'stats-small', 'No game has landed a plane yet.'));
  const v = goalView(goal);
  gl.append(el('span', 'stats-kicker', 'This week’s goal'));
  if (v) {
    const bar = el('div', 'stats-bar-track');
    const fill = el('i', 'stats-bar-fill');
    fill.style.width = `${v.pct}%`;
    bar.append(fill);
    gl.append(bar, el('span', 'stats-small', v.line), el('span', 'stats-small', v.text));
  } else {
    gl.append(el('span', 'stats-small', 'No goal this week yet.'));
  }
  const reward = rewardLine(goal, myWeekLanded(save().worldStats, Date.now()));
  $('stats-records-note').textContent = [reward, STATS_COPY.goal].filter(Boolean).join(' ');
}

/**
 * The Map view: the land and a dot per airport played today, at its place (worldmap.js), sized by planes landed. The places come from
 * the airport list (airportdb.js), so a code the list does not hold has no dot.
 */
async function renderStatsMap(body) {
  const svg = $('stats-map-svg');
  svg.textContent = '';
  const note = $('stats-map-note');
  if (!body) {
    note.textContent = '';
    return;
  }
  const land = document.createElementNS(SVG_NS, 'path');
  land.setAttribute('d', LAND_PATH);
  land.setAttribute('class', 'map-land');
  svg.append(land);
  const infos = await Promise.all(body.map.map((a) => db.getAirport(a.icao)));
  const placeOf = (icao) => {
    const i = body.map.findIndex((a) => a.icao === icao);
    const info = i >= 0 ? infos[i] : null;
    return info && Number.isFinite(info.lat) && Number.isFinite(info.lon) ? { lat: info.lat, lon: info.lon } : null;
  };
  for (const d of mapDots(body.map, placeOf)) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(d.x));
    c.setAttribute('cy', String(d.y));
    c.setAttribute('r', String(d.r));
    c.setAttribute('class', 'map-dot');
    const t = document.createElementNS(SVG_NS, 'title');
    t.textContent = `${d.icao}: ${withCommas(d.landed)} ${d.landed === 1 ? 'plane' : 'planes'} landed`;
    c.append(t);
    svg.append(c);
  }
  note.textContent = body.map.length ? STATS_COPY.map : 'No games yet today.';
}

/** The busiest airports today: the code and the city, and the planes landed there. */
async function renderStats(res) {
  const body = res && res.state === 'ok' ? res.body : null;
  const view = statsView(body);
  renderStatsTable(view);
  const list = $('stats-airports');
  renderStatsHours(body);
  if (!view) {
    renderStatsBest(null);
    renderStatsCards(null, null, null);
    renderStatsMap(null);
    const offline = res && res.state === 'offline';
    showMessage(list, offline ? STATS_COPY.offline : STATS_COPY.error, () => loadStats());
    setNote('', 'stats-note');
    return;
  }
  const [cities, bestInfo, recordInfo] = await Promise.all([
    Promise.all(view.airports.map((a) => db.getAirport(a.icao))),
    view.best ? db.getAirport(view.best.icao) : null,
    body.records ? db.getAirport(body.records.icao) : null,
  ]);
  renderStatsBest(view, bestInfo);
  renderStatsCards(body, recordInfo, body.goal);
  if (view.empty) {
    showMessage(list, STATS_COPY.empty);
  } else {
    list.textContent = '';
    view.airports.forEach((a, i) => {
      const line = el('div', 'board-row');
      const info = cities[i];
      // the code, then the city in its own span: a row too narrow for the city drops it (fitBusiestCities), and the code stays whole
      const name = el('span', 'board-name', a.icao);
      if (info && cityOf(info)) name.append(el('span', 'stats-city', ` · ${cityOf(info)}`));
      line.append(el('span', 'board-rank', String(i + 1)), name, el('span', 'board-score', a.text));
      list.append(line);
    });
    fitBusiestCities();
    watchBusiestCities();
  }
  setNote(STATS_COPY.footnote, 'stats-note');
  renderStatsMap(body);
}

/**
 * The busiest list's cities (3.2, DECISIONS 417): a row's city is dropped when the name would be cut at this width, so the airport's
 * code is always whole. Each row is measured with its city, then the city is hidden where it does not fit.
 */
function fitBusiestCities() {
  for (const name of $('stats-airports').querySelectorAll('.board-name')) {
    name.classList.remove('code-only');
    if (name.scrollWidth > name.clientWidth + 0.5) name.classList.add('code-only');
  }
}

/** One watch on the list: a resize (a rotation, a cutout's inset, the card's width) measures the rows again. */
let busiestWatch = null;
function watchBusiestCities() {
  if (busiestWatch || typeof ResizeObserver !== 'function') return;
  busiestWatch = new ResizeObserver(() => fitBusiestCities());
  busiestWatch.observe($('stats-airports'));
}

// ---------------------------------------------------------------- the play streak (streak.js)

const dayNow = () => db.localDay(new Date());
const dayWord = (n) => (n === 1 ? 'day' : 'days');

// the strip's glyphs by name (streak.js cellStates): each square's accessible name
const GLYPH_NAMES = { played: 'Played', hold: 'Skipped, streak still alive', today: 'Today, not played yet', skipped: 'Skipped', none: 'No game' };
// a skipped day that kept the streak alive: the game's holding racetrack (stacks.js racetrack: a loop, dashed) with a small
// plane on its top leg, heading round the loop. The plane is drawn at 0.95 scale, nose to the right (style.css colours it)
const HOLD_ART = '<svg viewBox="0 0 28 16" aria-hidden="true" focusable="false"><rect x="2" y="3.5" width="24" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 1.8"/>'
  + '<path class="hp-plane" transform="translate(14 3.5) scale(.95)" d="M4.8 0L1.2-1L.6-4.2L-1.1-4.2L-.6-1L-3.6-1.2L-4.6-2.8L-5.4-2.8L-4.9 0L-5.4 2.8L-4.6 2.8L-3.6 1.2L-.6 1L-1.1 4.2L.6 4.2L1.2 1Z"/></svg>';

/**
 * The state's classes on an element (style.css): the corner's button and flame, and the Streak screen's hero. Broken and
 * none look the same: nothing is being kept.
 */
function setStateClasses(elem, st) {
  elem.classList.toggle('is-none', st.status === 'none' || st.status === 'broken');
  elem.classList.toggle('is-played', st.status === 'played');
  elem.classList.toggle('is-risk', st.status === 'risk');
  elem.classList.toggle('is-missed', st.status === 'risk' && st.gap >= 2);
}

/**
 * The home corner's Streak button: its label, its chip, its flame and its words, from the save and today. It runs on
 * every home screen, after a game, on the phone's return to the app and once a minute while the home screen is up (main.js),
 * so the state follows local midnight.
 */
export function renderStreakCorner() {
  if (!deps) return;
  const btn = $('btn-streak');
  const st = streakState(save().streak, dayNow());
  btn.querySelector('.lbl').textContent = st.label;
  const chip = btn.querySelector('.streak-chip');
  chip.textContent = st.cornerChip;
  chip.hidden = !st.cornerChip;
  setStateClasses(btn, st);
  btn.setAttribute('aria-label', st.ariaLabel);
}

/** The Streak screen: the count and its unit, the one line, the last 14 days, the next milestone and the two actions. */
export function renderStreak() {
  const s = save().streak;
  const now = new Date();
  const T = db.localDay(now);
  const st = streakState(s, T);
  setStateClasses($('streak-hero'), st);
  $('streak-count').textContent = String(st.count);
  $('streak-unit').textContent = st.status === 'none' || st.status === 'broken' ? 'Start a new streak' : `${dayWord(st.count)} in your streak`;
  $('streak-state').textContent = streakScreenLine(st);
  const strip = $('streak-strip');
  strip.textContent = '';
  for (const c of cellStates(s, T)) {
    // the day of the month, from the phone's own calendar (setDate steps over DST changes)
    const day = new Date(now);
    day.setDate(now.getDate() - (T - c.day));
    const cell = el('div', 'streak-cell');
    const glyph = el('i', `streak-glyph ${c.glyph}`);
    glyph.setAttribute('role', 'img');
    glyph.setAttribute('aria-label', GLYPH_NAMES[c.glyph]);
    // the holding pattern is drawn in SVG (static markup, no player text): the racetrack and its plane, as the game draws them
    if (c.glyph === 'hold') glyph.innerHTML = HOLD_ART;
    cell.append(el('span', 'streak-day', String(day.getDate())), glyph);
    strip.append(cell);
  }
  $('streak-best').textContent = `Longest streak: ${s.best} ${dayWord(s.best)}`;
  const next = nextMilestone(st.count);
  $('streak-next').textContent = next ? `Next: ${next.at} days, ${next.togo} to go` : 'Every milestone so far. Keep going!';
  // the daily is one tap away until it is played today (the airport row and the Daily tab still play it again)
  const daily = db.todaysDaily();
  $('btn-streak-daily').hidden = !!(save().daily && save().daily.n === daily.n);
}

export function openStreak() {
  renderStreak();
  deps.show('streak');
}

// ---------------------------------------------------------------- Your airports

/** The caller's world rank at an airport and level: signed in, 13 and up, and the boards live. "–" otherwise. */
async function worldRankOf(icao, level) {
  if (!boardsLive() || !ownToken()) return '–';
  const key = `${icao}:${level}`;
  if (state.rankCache.has(key)) return state.rankCache.get(key);
  const res = await fetchBoard({ board: 'level', icao, level, period: 'all' }, { token: ownToken(), online: navigator.onLine !== false });
  const rank = res.you ? `#${res.you.rank}` : '–';
  if (res.state === 'ok' || res.state === 'empty') state.rankCache.set(key, rank);
  return rank;
}

/** A game at one level from Your airports: the saved level is the one Settings shows, so it is set, then the game starts. */
async function playAt(icao, level) {
  const s = save();
  s.settings.difficulty = level;
  if (!deps.writeSave(s)) deps.toast(SAVE_FAILED, 3200); // the level is the Settings choice now: a failed save is said (settingsnotes.js)
  deps.show('boards', false);
  const info = await airportOf(icao);
  if (info) deps.startAirport(info, { demo: false });
}

function levelTable(r, info) {
  const wrap = el('div', 'airport-levels');
  const table = el('table', 'as-table');
  const head = el('tr');
  for (const h of ['Level', 'Games', 'Best', 'World']) head.append(el('th', '', h));
  table.append(head);
  const cells = cellsFor(save(), r.icao);
  for (const c of cells) {
    const tr = el('tr');
    const rankCell = el('td', 'as-rank', c.level === 'earlier' ? '–' : '…');
    tr.append(
      el('td', '', c.level === 'earlier' ? 'Earlier' : LEVEL_NAMES[c.level]),
      el('td', '', c.games === null ? '–' : String(c.games)),
      el('td', '', String(c.best)),
      rankCell,
    );
    table.append(tr);
    if (c.level !== 'earlier') worldRankOf(r.icao, c.level).then((rank) => (rankCell.textContent = rank));
  }
  wrap.append(table);
  // the saved level when it can be played from here, else Normal (Hard and Chaos are not started from this list)
  const saved = save().settings.difficulty;
  const want = PLAYABLE.includes(saved) ? saved : 'normal';
  if (info && cells.some((c) => PLAYABLE.includes(c.level))) {
    const play = el('button', 'btn small airport-play', `Play ${info.iata || info.icao} on ${LEVEL_NAMES[want]}`);
    play.type = 'button';
    play.addEventListener('click', () => {
      deps.press();
      playAt(r.icao, want);
    });
    wrap.append(play);
  }
  return wrap;
}

/**
 * The own airports, one card each, added to list (Your airports; the World tab before launch shows them too). A card opens on
 * its levels. onChange re-renders the tab the cards are on, so a card opened there stays on that tab.
 */
async function appendAirportCards(list, onChange) {
  const rows = airportRows(save());
  const seq = ++state.cardsSeq;
  if (!rows.length) list.append(el('p', 'boards-empty', 'Play an airport and it appears here, with its best at each level.'));
  const infos = await Promise.all(rows.map((r) => airportOf(r.icao)));
  if (seq !== state.cardsSeq) return; // the tab was left or re-rendered meanwhile
  rows.forEach((r, i) => {
    const info = infos[i];
    const card = el('div', 'airport-stat' + (state.expanded === r.icao ? ' open' : ''));
    const head = el('button', 'airport-stat-head');
    head.type = 'button';
    // the row: the code, the name, the stars, the best at the airport, and the rank at the level played most there
    const top = topLevel(save(), r.icao);
    const rankWord = el('b', '', top ? '…' : '–');
    const best = el('span', 'as-row-best');
    best.append(el('b', '', String(r.best)), el('small', '', 'best'));
    const rank = el('span', 'as-row-rank');
    rank.append(rankWord, el('small', '', top ? LEVEL_NAMES[top] : ''));
    head.append(
      el('b', 'as-code', (info && (info.iata || info.icao)) || r.icao),
      el('span', 'as-name', info ? info.name : r.icao),
      el('span', 'as-stars', starText(starsOf(r.best))),
      best,
      rank,
    );
    head.addEventListener('click', () => {
      deps.press();
      state.expanded = state.expanded === r.icao ? null : r.icao;
      onChange();
    });
    card.append(head);
    if (state.expanded === r.icao) card.append(levelTable(r, info));
    list.append(card);
    if (top) worldRankOf(r.icao, top).then((rk) => (rankWord.textContent = rk));
  });
}

async function loadMine() {
  const list = $('boards-airports');
  list.textContent = '';
  await appendAirportCards(list, () => loadMine());
  renderAccount();
  syncPlayGamesButton();
}

/** The account rows (13 and up, agreed, signed in only): the name switch, and Remove my scores. */
function renderAccount() {
  const box = $('boards-account');
  const on = !!ownToken();
  box.hidden = !on;
  if (!on) return;
  const sw = $('btn-boards-showname');
  const showName = save().session.showName !== false;
  sw.setAttribute('aria-checked', showName ? 'true' : 'false');
  sw.classList.toggle('on', showName);
}

async function toggleShowName() {
  const token = ownToken();
  if (!token) return;
  const want = save().session.showName === false;
  const res = await api.prefs(token, want);
  if (res.status !== 200) {
    deps.toast(COPY.error, 2400);
    return;
  }
  // Reset progress may have run during the request: the save is read again, and written only for the same sign-in. The save
  // read before the request is never written back (it would bring the reset progress back).
  const s = save();
  if (!s.session || s.session.token !== token) {
    renderAccount();
    return;
  }
  const was = s.session.showName;
  s.session.showName = want;
  // a save that does not keep the switch says so, and the switch goes back to the setting the save holds (settingsnotes.js)
  if (!deps.writeSave(s)) {
    s.session.showName = was;
    deps.toast(SAVE_FAILED, 3200);
  }
  state.cache.clear();
  renderAccount();
}

// ---------------------------------------------------------------- report and remove

/** A long press on a name opens Report name (only for a player who may report; a short tap does nothing). */
function bindReport(node) {
  let timer = 0;
  let sx = 0;
  let sy = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
  };
  node.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = 0;
      haptic('tick');
      openReport(node.dataset.row, node.textContent);
    }, 520);
  });
  node.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
  });
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

function openReport(rowId, name) {
  if (!canReport()) return;
  ask({
    title: COPY.report,
    body: `Report ${name}? When three different players report a name, the boards show a callsign instead. The score stays.`,
    yes: 'Report',
    onYes: async () => {
      const token = ownToken();
      if (!token) return;
      const res = await api.report(token, Number(rowId));
      if (res.status === 200) deps.toast(COPY.reported, 2400);
      else if (res.status === 403) deps.toast('Only players with a ranked score can report a name.', 3200);
      else deps.toast(COPY.error, 2400);
    },
  });
}

function askRemove() {
  ask({
    title: COPY.remove,
    body: COPY.removeAsk,
    yes: COPY.remove,
    onYes: async () => {
      const token = ownToken();
      if (!token) return;
      const res = await api.removeMine(token);
      if (res.status !== 200) {
        deps.toast(COPY.error, 2400);
        return;
      }
      // the games still queued would post again, so they go too; the stats on this phone stay
      const s = save();
      s.outbox = [];
      // the server counts no accepted scores for this player now (retention.js): the Report sheet is not offered for them
      if (s.session) s.session.accepted = 0;
      deps.writeSave(s);
      state.cache.clear();
      state.rankCache.clear();
      deps.toast(COPY.removed, 2600);
      renderAccount();
    },
  });
}

// ---------------------------------------------------------------- the screen

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('[data-boards-tab]')) {
    const on = b.dataset.boardsTab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  $('boards-world').hidden = tab !== 'world';
  $('boards-daily').hidden = tab !== 'daily';
  $('boards-mine').hidden = tab !== 'mine';
  $('boards-stats').hidden = tab !== 'stats';
  for (const m of document.querySelectorAll('#boards .boards-main')) m.scrollTop = 0;
  openAirportSearch(false);
  if (tab === 'world') loadWorld();
  else if (tab === 'daily') showDailyView(dailyView);
  else if (tab === 'stats') loadStats();
  else loadMine();
}

/**
 * Opens Leaderboards on the tab given. With an airport and a level (the end card's button) the World tab starts there;
 * without them it starts at the last airport played, or today's, at the last level chosen.
 */
export async function openBoards({ icao = null, level = null, tab = 'world' } = {}) {
  // the weekend event's view is the Daily challenge tab's second view (showDailyView)
  if (tab === 'weekend') {
    tab = 'daily';
    dailyView = 'weekend';
  }
  // a plain open on the first visit this run starts on the airport and level played most (your best and rank are for them)
  const top = !icao && !level && !state.info ? mostPlayed(save()) : null;
  if (icao || !state.info) {
    const code = icao || (top && top.icao) || (save().recent || [])[0];
    // a code the database does not know (or none yet) falls back to today's airport
    state.info = (code && (await db.getAirport(code))) || (await db.getAirport(db.todaysDaily().airport[0]));
  }
  if (level && LEVELS.includes(level)) state.level = level;
  else if (top) state.level = top.level;
  if (!LEVELS.includes(state.level)) {
    const s = save().settings.difficulty;
    state.level = LEVELS.includes(s) ? s : 'normal';
  }
  deps.show('boards');
  const was = boardsLive();
  setTab(tab);
  // the server's word on whether the boards are open is read at most once a day (boards.js): when it opens them, the tab is shown again
  refreshBoardsLive().then((live) => {
    if (live !== was && $('boards').classList.contains('show')) setTab(state.tab);
  }).catch(() => {});
}

/** The Achievements screen: the rank and its bar, the totals, and every badge with its date or its progress. */
export function renderAchievements() {
  const s = save();
  const r = rankProgress(s.landed);
  $('ach-rank-name').textContent = r.name;
  $('ach-count').textContent = `${badgeCount(s)} of ${orderedBadges(s).length} achievements`; // the word the Tour and the store use
  $('ach-bar-fill').style.width = `${Math.round(r.fraction * 100)}%`;
  $('ach-rank-line').textContent = r.line;
  const t = totals(s);
  const tot = $('ach-totals');
  tot.textContent = '';
  for (const [v, k] of [[t.games, 'Games'], [t.landed, 'Landings'], [t.real, 'Real planes'], [t.passengers, 'Passengers'], [t.bestStreak, 'Best streak']]) {
    const cell = el('div', 'ach-total');
    cell.append(el('b', '', withCommas(v)), el('span', '', k));
    tot.append(cell);
  }
  const grid = $('ach-grid');
  grid.textContent = '';
  for (const a of orderedBadges(s)) {
    const when = (s.ach || {})[a.id];
    const p = progressFor(a, s);
    const cell = el('div', 'ach-badge' + (when ? '' : ' locked'));
    cell.dataset.tier = tierOf(a.id);
    const disc = el('span', 'ach-disc');
    disc.append(el('i', 'ach-glyph', a.icon));
    const text = el('div', 'ach-text');
    text.append(el('b', 'ach-name', a.name));
    if (when) text.append(el('span', 'ach-line ach-when', `Earned ${earnedLabel(when)}`));
    else text.append(el('span', 'ach-line', p.kind === 'count' ? p.text : a.desc));
    if (!when && p.kind === 'count') {
      const bar = el('span', 'ach-bar');
      const fill = el('i');
      fill.style.width = `${Math.round(p.fraction * 100)}%`;
      bar.append(fill);
      text.append(bar);
    }
    cell.append(disc, text);
    grid.append(cell);
  }
  syncAchievementsButton();
}

export function openAchievements() {
  renderAchievements();
  deps.show('achievements');
}

/**
 * Wires the screens once, at boot. d: { getSave(), writeSave(s), show(id, on), toast(text, ms), press(), startAirport(info,
 * opts), playNow() } (playNow is Home's Play now). The screen stack's Back closes each one (screenstack.js).
 */
export function initScreens(d) {
  deps = d;
  register('boards', () => deps.show('boards', false), () => $('boards').classList.contains('show'));
  register('achievements', () => deps.show('achievements', false), () => $('achievements').classList.contains('show'));
  register('streak', () => deps.show('streak', false), () => $('streak').classList.contains('show'));
  register('boards-sheet', closeSheet, () => $('boards-sheet').classList.contains('show'));
  // the two Play Games buttons follow the sign-in state live, on any state change (main.js HP_pgs), not only when their screen opens
  onPlayGamesState(() => {
    syncPlayGamesButton();
    syncAchievementsButton();
  });
  const corner = (id, open) => {
    const b = $(id);
    b.addEventListener('pointerdown', () => deps.press());
    b.addEventListener('click', open);
  };
  corner('btn-streak', () => openStreak());
  corner('btn-boards', () => openBoards());
  corner('btn-achievements', () => openAchievements());
  // the Streak screen's two actions: each closes the screen, then plays (Home's Play now, or the daily as the Daily tab does)
  $('btn-streak-play').addEventListener('click', () => {
    deps.press();
    deps.show('streak', false);
    deps.playNow();
  });
  $('btn-streak-daily').addEventListener('click', async () => {
    deps.press();
    deps.show('streak', false);
    const today = db.todaysDaily();
    const info = await db.getAirport(today.airport[0]);
    if (info) deps.startAirport(info, { daily: today.n });
  });
  $('home-stats').addEventListener('click', () => openAchievements());
  for (const b of document.querySelectorAll('[data-boards-tab]')) {
    b.addEventListener('click', () => {
      deps.press();
      setTab(b.dataset.boardsTab);
    });
  }
  for (const b of document.querySelectorAll('.boards-period [data-period]')) {
    b.addEventListener('click', () => {
      state.period = b.dataset.period;
      loadWorld();
    });
  }
  for (const b of document.querySelectorAll('.boards-levels [data-level]')) {
    b.addEventListener('click', () => {
      state.level = b.dataset.level;
      loadWorld();
    });
  }
  $('boards-airport').addEventListener('click', () => openAirportSearch($('boards-search').hidden));
  $('boards-search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(() => runAirportSearch(q), 120);
  });
  for (const b of document.querySelectorAll('[data-daily-view]')) {
    b.addEventListener('click', () => {
      deps.press();
      showDailyView(b.dataset.dailyView);
    });
  }
  $('btn-boards-daily-play').addEventListener('click', async () => {
    deps.press();
    const today = db.todaysDaily();
    const info = await db.getAirport(today.airport[0]);
    deps.show('boards', false);
    if (info) deps.startAirport(info, { daily: today.n });
  });
  $('btn-boards-showname').addEventListener('click', () => toggleShowName());
  // the World stats tab's views (Today, Records, Map): a tap shows its pane (3.2, DECISIONS 400)
  for (const b of document.querySelectorAll('[data-stats-view]')) b.addEventListener('click', () => { deps.press(); showStatsTab(b.dataset.statsView); });
  $('btn-boards-remove').addEventListener('click', () => askRemove());
  $('btn-boards-pgs').addEventListener('click', () => {
    const board = $('btn-boards-pgs').dataset.board;
    if (board) playGames.show(board);
  });
  $('btn-ach-pgs').addEventListener('click', () => playGames.show('achievements'));
  $('btn-sheet-yes').addEventListener('click', () => {
    const f = state.sheet;
    closeSheet();
    if (f) f();
  });
  $('btn-sheet-no').addEventListener('click', () => closeSheet());
}

/** After a game or a sign-in, the boards fetch again: their answers are not kept past a minute. */
export function refreshBoardsCache() {
  state.cache.clear();
  state.rankCache.clear();
}
