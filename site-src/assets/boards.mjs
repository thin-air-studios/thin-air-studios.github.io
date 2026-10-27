/* Short Final: the top-controllers panel on an airport page (served at /assets/site/boards.mjs). Optional: without it the page has no
   panel (the panel's markup is hidden until this script shows it). Loads on the page only when the panel nears the screen; then one
   request per level for this week, cached in memory for the page's life. A failed request keeps the panel hidden; nothing is shown
   as an error. Names and rows are set as text (textContent), never as markup. Pure parts: boards-core.mjs. */
import { API_BASE, LEVELS, createBoardCache, defaultLevel, localDayIn, panelFor } from './boards-core.mjs';

const TIMEOUT_MS = 8000;

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // A plain GET with no headers and no credentials: no preflight request, and nothing from the visitor's account is sent.
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function zoneOf(lat, lon) {
  const { default: tzlookup } = await import('./vendor/tz-lookup.mjs');
  try {
    return tzlookup(lat, lon) || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function start(root) {
  const icao = root.getAttribute('data-icao') || '';
  const lat = Number(root.getAttribute('data-lat'));
  const lon = Number(root.getAttribute('data-lon'));
  const list = root.querySelector('[data-list]');
  const caption = root.querySelector('.board-caption');
  const buttons = Array.from(root.querySelectorAll('[data-level]'));
  const emptyAll = root.querySelector('[data-empty="all"]');
  const emptyLevel = root.querySelector('[data-empty="level"]');
  const emptyFailed = root.querySelector('[data-empty="failed"]');
  const cache = createBoardCache({ getJson, base: API_BASE });
  const labelOf = (level) => (buttons.find((b) => b.getAttribute('data-level') === level) || {}).textContent || level;
  let results = null;
  let selected = 'normal';
  let started = false;

  function render() {
    const view = panelFor(results, selected);
    root.hidden = !view.show;
    if (!view.show) return;
    for (const b of buttons) b.setAttribute('aria-pressed', b.getAttribute('data-level') === selected ? 'true' : 'false');

    list.textContent = '';
    for (const row of view.rows) {
      const li = element('li', 'board-row');
      li.append(element('span', 'board-rank', row.rank), element('span', 'board-name', row.name), element('span', 'board-score', row.score));
      list.append(li);
    }
    list.hidden = view.rows.length === 0;

    const n = view.total;
    caption.hidden = view.rows.length === 0 || n < 1;
    if (!caption.hidden) {
      const template = n === 1 ? caption.getAttribute('data-one') : caption.getAttribute('data-many');
      caption.textContent = template.replace('{n}', String(n)).replace('{level}', labelOf(selected));
    }

    emptyAll.hidden = view.empty !== 'all';
    emptyLevel.hidden = view.empty !== 'level';
    if (!emptyLevel.hidden) emptyLevel.textContent = emptyLevel.getAttribute('data-template').replace('{level}', labelOf(selected));
    emptyFailed.hidden = view.empty !== 'failed';
  }

  async function load() {
    if (started) return;
    started = true;
    try {
      const zone = await zoneOf(lat, lon);
      const localDay = localDayIn(zone, Date.now());
      results = await cache.all(icao, localDay);
      selected = defaultLevel(results);
      render();
    } catch (_) {
      // fail quietly: the panel stays hidden
    }
  }

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const level = b.getAttribute('data-level');
      if (!LEVELS.includes(level) || !results) return;
      selected = level;
      render();
    });
  }

  // The panel is hidden until it has data, and a hidden element never intersects, so the watch is on the empty sentinel that
  // the page puts just before the panel (boardpanel.mjs). The margin starts the load about one phone screen early, so the panel
  // mounts below the reader's view and nothing on screen moves when it fills in.
  const sentinel = document.querySelector('[data-boards-sentinel]') || root;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '1200px 0px' },
    );
    observer.observe(sentinel);
  } else {
    load();
  }
}

const panel = document.querySelector('[data-boards]');
if (panel && typeof window.fetch === 'function') start(panel);
