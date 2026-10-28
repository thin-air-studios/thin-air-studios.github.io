/* Short Final: the live-flights panel on an airport page (served at /assets/site/flights/flights-panel.mjs, with flights-core.mjs and
   flights.css). flights.mjs loads it when the panel nears the screen. The panel stays hidden until an answer arrives, so a failed
   request, or a switched-off feature, leaves the page as it was. One request, then one every 60 seconds while the tab is visible; none
   while it is hidden, and a visible tab that was hidden for a minute asks at once. Every string from the answer (callsigns, the credit's
   names) is set as text, never as markup; the credit's links are https only. Pure parts, and the timing decisions: flights-core.mjs.
   The panel sends no analytics events of its own. */
import {
  TIMEOUT_MS,
  fill,
  formatCount,
  nearUrl,
  nextRefreshDelay,
  onVisibleAction,
  rowText,
  shapeNear,
  startAllowed,
  statusOutcome,
  updatedText,
} from './flights-core.mjs';

const TICK_MS = 15000; // the "Updated" line is re-read this often while the tab is visible

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function start(root) {
  const icao = root.getAttribute('data-icao') || '';
  const copy = JSON.parse(document.getElementById('flights-copy').textContent);
  const lang = document.documentElement.lang || 'en';
  const within = root.querySelector('[data-flights-within]');
  const air = root.querySelector('[data-flights-air]');
  const updated = root.querySelector('[data-flights-updated]');
  const stats = root.querySelector('[data-flights-stats]');
  const busy = root.querySelector('[data-flights-busy]');
  const none = root.querySelector('[data-flights-none]');
  const list = root.querySelector('[data-flights-list]');
  const more = root.querySelector('[data-flights-more]');
  const credit = root.querySelector('[data-flights-credit]');
  let view = null;
  let timer = null;
  let inFlight = false;
  let gone = false;
  let lastOk = 0;

  async function fetchNear() {
    const ctl = new AbortController();
    const cut = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      // A plain GET with no headers and no credentials: no preflight, and nothing from the visitor's account is sent.
      const res = await fetch(nearUrl(icao), { signal: ctl.signal, credentials: 'omit' });
      const outcome = statusOutcome(res.status);
      if (outcome === 'gone') return null; // not an airport the game knows: the panel stays hidden for good
      if (outcome === 'fail') throw new Error(`status ${res.status}`);
      return shapeNear(await res.json(), icao);
    } finally {
      clearTimeout(cut);
    }
  }

  function renderUpdated() {
    if (!view || view.at === null) {
      updated.hidden = true;
      return;
    }
    updated.hidden = false;
    updated.textContent = updatedText(view.at, Date.now(), copy, lang);
  }

  function render() {
    stats.hidden = view.at === null;
    within.textContent = formatCount(view.count, lang);
    air.textContent = formatCount(view.airborne, lang);
    busy.hidden = !view.busy;
    list.textContent = '';
    for (const row of view.rows) {
      const t = rowText(row, copy, lang);
      const li = element('li', 'flight');
      const id = element('div', 'flight-id');
      id.append(element('span', 'flight-call', t.callsign));
      if (t.landing) id.append(element('span', 'flight-landing', copy.landing));
      const facts = element('div', 'flight-facts');
      if (t.alt) facts.append(element('span', 'flight-chip', t.alt));
      if (t.speed) facts.append(element('span', 'flight-chip', t.speed));
      li.append(id, facts);
      if (t.distance) li.append(element('span', 'flight-dist', t.distance));
      list.append(li);
    }
    list.hidden = view.rows.length === 0;
    none.hidden = view.count > 0 || view.at === null;
    const shown = view.rows.length;
    more.hidden = !(view.count > shown && shown > 0);
    if (!more.hidden) more.textContent = fill(copy.showing, { shown: formatCount(shown, lang), n: formatCount(view.count, lang) });
    credit.textContent = '';
    const src = view.source;
    credit.append(element('span', '', `${copy.liveData} `));
    const name = element('a', '', src.name);
    name.href = src.link;
    name.rel = 'noopener';
    const licence = element('a', '', src.licence);
    licence.href = src.licenceUrl;
    licence.rel = 'noopener';
    credit.append(name, ' (', licence, ')');
    root.hidden = false;
    renderUpdated();
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    const delay = nextRefreshDelay({ visible: document.visibilityState === 'visible', gone });
    if (delay !== null) timer = setTimeout(refresh, delay);
  }

  async function refresh() {
    if (!startAllowed({ inFlight, gone })) return;
    inFlight = true;
    try {
      const next = await fetchNear();
      if (next === null) {
        gone = true;
        root.hidden = true;
        return;
      }
      view = next;
      lastOk = Date.now();
      render();
    } catch (_) {
      // a failed refresh keeps what is on the screen; a failed first one keeps the panel hidden
    } finally {
      inFlight = false;
      if (!gone) schedule();
    }
  }

  // The "Updated" line counts up while the tab is visible, so it never says "just now" for a minute-old list.
  setInterval(() => {
    if (view && document.visibilityState === 'visible') renderUpdated();
  }, TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (gone) return;
    if (document.visibilityState !== 'visible') {
      clearTimeout(timer);
      timer = null;
      return;
    }
    if (onVisibleAction(lastOk, Date.now()) === 'refresh') refresh();
    else schedule();
  });

  // The panel starts with the page it is on. A tab that is hidden now asks when it is next seen (the handler above).
  if (document.visibilityState === 'visible') refresh();
}

const root = document.querySelector('[data-flights]');
if (root && typeof window.fetch === 'function') start(root);
