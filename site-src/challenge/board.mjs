/* Short Final: the challenge board page (served at /assets/site/challenge/board.mjs, with board-core.mjs and board.css). One request
   per visit, the only one the page makes: the board for the id in the address. The id is checked against the server's rule before
   anything is requested. Every string from the server (the names) is set as text (textContent), never as markup. The page sends no
   events of its own (site-wide analytics only). Pure parts: board-core.mjs. */
import { appIntent, boardUrl, formatScore, hasParts, idFromPath, isAndroid, levelOfParts, airportOf, shapeBoard } from './board-core.mjs';

const TIMEOUT_MS = 8000;

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // A plain GET with no headers and no credentials: no preflight, and nothing from the visitor's account is sent.
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function start(root) {
  const copy = JSON.parse(document.getElementById('board-copy').textContent);
  const playUrl = root.getAttribute('data-play') || '';
  const id = idFromPath(location.pathname);
  const search = location.search;
  const linked = hasParts(search);
  const airportCode = airportOf(search);
  const title = document.querySelector('.cb-hero h1');
  const cta = root.querySelector('[data-cta]');
  const list = root.querySelector('[data-list]');
  const total = root.querySelector('[data-total]');
  const chip = root.querySelector('[data-level]');
  const states = Array.from(root.querySelectorAll('[data-state]'));
  const retry = root.querySelector('[data-retry]');
  const label = (level) => copy.levels[level] || level;

  function show(state) {
    for (const el of states) el.hidden = el.getAttribute('data-state') !== state;
    root.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  }

  // The button: an Android phone with the app is sent into the app on this challenge; any other device, or a phone without the app,
  // gets the Play listing (the fallback of the intent, with the site's own campaign).
  function setCta() {
    if (linked && id && isAndroid(navigator.userAgent)) {
      cta.href = appIntent(id, search, playUrl);
      cta.textContent = copy.playChallenge;
    } else {
      cta.href = playUrl;
      cta.textContent = copy.getGame;
    }
  }

  // The heading is the airport's code, and the tab's title names it too. The code comes from the board's answer (or the address's a=
  // part); the airport's name is not fetched, so the page makes no second request.
  function setTitle(code) {
    title.textContent = code || copy.titleDefault;
    if (code) document.title = copy.titleAirport.replace('{airport}', code);
  }

  function render(board) {
    const code = board.icao || airportCode;
    const level = board.level || levelOfParts(search);
    setTitle(code);
    if (level) {
      chip.textContent = '';
      chip.append(element('span', '', copy.levelLabel + ': '), element('b', '', label(level)));
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    total.textContent = board.total === 1 ? copy.totalOne : copy.totalMany.replace('{n}', String(board.total));
    if (!board.rows.length) {
      show('empty');
      return;
    }
    list.textContent = '';
    board.rows.forEach((row, i) => {
      const li = element('li', i === 0 ? 'cb-row cb-row--first' : 'cb-row');
      // The number is what sighted readers see; the word for it is read out to a screen reader too (a span with no role cannot be labelled).
      const rank = element('span', 'cb-rank');
      rank.append(element('span', 'sr-only', `${copy.scoresRank} `), String(row.rank));
      li.append(rank, element('span', 'cb-name', row.name || 'Pilot'), element('span', 'cb-score', formatScore(row.score)));
      list.append(li);
    });
    show('filled');
  }

  async function load() {
    show('loading');
    try {
      render(shapeBoard(await getJson(boardUrl(id))));
    } catch (_) {
      show('error');
    }
  }

  setCta();
  root.querySelector('[data-lead="link"]').hidden = !linked;
  root.querySelector('[data-lead="plain"]').hidden = linked;
  if (!id) {
    show('invalid');
    return;
  }
  if (retry) retry.addEventListener('click', load);
  load();
}

const root = document.querySelector('[data-challenge]');
if (root && typeof window.fetch === 'function') start(root);
