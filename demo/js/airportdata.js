// Loads everything an airport needs: runways (OurAirports), layout (OpenStreetMap, saved on the device), weather (METAR) and a
// live traffic feed — or recorded fixtures in demo mode. The full map comes from the website or the public servers after the
// game has started on the runways (DECISIONS 372).
import { getRunways } from './airportdb.js?v=2f66fd5f';
import { WEB_DEMO, assetUrl } from './flavor.js?v=2f66fd5f';
import { DEMO_MAP_WAIT_MS } from './demo.js?v=2f66fd5f';
import { buildLayout, overpassQuery, fetchRadius } from './airport.js?v=2f66fd5f';
import { http, USER_AGENT } from './net.js?v=2f66fd5f';
import { METAR_URL, parseMetarJson } from './metar.js?v=2f66fd5f';
import { parseStates } from './opensky.js?v=2f66fd5f';
import { surroundQuery, surroundHalfSize, compactSurroundings, SUR_VERSION } from './scenery.js?v=2f66fd5f';

// Public Overpass servers, in the order the map robot asks them (tools/maps/fetch.mjs): kumi first. overpass.private.coffee is
// kumi's own machine, so it is not a third server. The phone asks these two only, one request at a time.
export const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
export const FIXTURE_AIRPORTS = ['KDFW', 'KMAF', 'EGLL', 'KATL'];
// the game's own copy of the airport maps (osm/ICAO.json on the website, made by the map robot): asked before the servers
export const WEBSITE_MAP_URL = 'https://thin-air-studios.github.io/osm/';
export const WEBSITE_TIMEOUT_MS = 5000;
const CACHE_DAYS = 30;
// the full map is fetched after the start, on the robot's patience (DECISIONS 372): 70 s for a layout, 120 s for the surroundings
export const LAYOUT_PATIENCE_MS = 70000;
export const SURROUND_PATIENCE_MS = 120000;
// after a failure the other server is asked BACKOFF_MS later; after a refusal (429, 406) REFUSED_PAUSE_MS later (the usage policy)
export const BACKOFF_MS = 5000;
export const REFUSED_PAUSE_MS = 30000;
// an airport whose full map did not come is not asked again for this long (the robot's rule)
export const REST_MS = 12 * 3600e3;
// the start waits this long at most for the website's map, the weather and the first live flights, all together (DECISIONS 372)
export const START_WAIT_MS = 2000;
// the rule a saved copy (osm: and sur:) is kept under: 2 from 3.0, which never keeps a partial answer. 2.9's copies have no rule
// and are not used (they may hold a partial answer; savedCopy removes them).
export const SAVE_RULE = 2;

/** The loading card's line for where the airport's map comes from (ui 8.1). */
export function loadingLine(source) {
  if (source === 'cache') return 'Loading the saved map…';
  return 'Loading airport…';
}

/**
 * What one airport's load has learned about the network (the polite rules and the words for a map that did not come).
 * refused: servers that answered 429 or 406, skipped for the rest of the job. busy: a server answered with an error.
 * offline: the phone has no network. mapFailed: no layout came from any source. site: the website's map, if it came.
 */
export function newPolite() {
  return { refused: new Set(), busy: false, offline: false, mapFailed: false, site: null };
}

const onlineNow = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);
// the Android bridge has no network call: a failed request names its reason. "No route" means no network at all. A host that
// does not resolve (UnknownHost) is one failed lookup: the other requests still go out (DECISIONS 372)
const NO_ROUTE = /NoRouteToHost|Network is unreachable/i;

/** A failed request (status 0) on a phone with no network: the browser says it is offline, or the bridge says there is no route. */
export function isOffline(r, online = onlineNow) {
  return r.status === 0 && (!online() || NO_ROUTE.test(r.text || ''));
}

/**
 * The words for a map that did not come, on the loading card and the toast. 'No internet' only when the phone is offline;
 * 'Map server busy' only when a server answered with an error; otherwise the servers did not answer in time.
 */
export function noMapLine(polite) {
  if (polite.offline) return 'No internet';
  if (polite.busy) return 'Map server busy';
  return 'Map server didn’t answer';
}

/** A stored map: the compact form (as the bundled files), or the raw Overpass answer an older version kept. */
function expandStored(data) {
  return data && Array.isArray(data.e) ? expandCompact(data) : data;
}

// ---------------------------------------------------------------- cache (IndexedDB)

let dbp = null;
function idb() {
  if (WEB_DEMO) return Promise.resolve(null); // the demo keeps no map cache (DECISIONS 446)
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('holdingpattern', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
  return dbp;
}

export async function cacheGet(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

/** Resolves true once the value is written; false when the store is unavailable or the write fails (quota etc). */
export async function cacheSet(key, value) {
  const db = await idb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) { /* quota etc: play on without caching */
      resolve(false);
    }
  });
}

/** Removes a key from the store. Resolves true when the removal is done. */
export async function cacheDel(key) {
  const db = await idb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/** The keys in the store that start with prefix (all of them when prefix is empty). */
export async function cacheKeys(prefix = '') {
  const db = await idb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const r = db.transaction('kv').objectStore('kv').getAllKeys();
      r.onsuccess = () => resolve((r.result || []).filter((k) => typeof k === 'string' && k.startsWith(prefix)));
      r.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

const KEEP_TAGS = ['aeroway', 'ref', 'surface', 'width', 'runway', 'building', 'area'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const flat = (geom) => geom.filter(Boolean).flatMap((g) => [r6(g.lat), r6(g.lon)]);

/** Overpass JSON -> compact { v, at, e: [[type, id, tags, data]] } (used by tools/fetch-layouts.mjs). */
export function compactOsm(osm) {
  const e = [];
  for (const el of osm.elements) {
    const tags = {};
    for (const k of KEEP_TAGS) if (el.tags && el.tags[k] != null) tags[k] = el.tags[k];
    // terminal names are labelled when zoomed in; nothing else needs its name
    if (el.tags && el.tags.name && (el.tags.aeroway === 'terminal' || el.tags.building === 'terminal')) tags.name = el.tags.name;
    if (el.type === 'node') e.push(['n', el.id, tags, [r6(el.lat), r6(el.lon)]]);
    else if (el.type === 'way') e.push(['w', el.id, tags, flat(el.geometry || [])]);
    else if (el.type === 'relation') e.push(['r', el.id, tags, (el.members || []).filter((m) => m.geometry).map((m) => [m.role || '', flat(m.geometry)])]);
  }
  return { v: 1, at: new Date().toISOString().slice(0, 10), e };
}

/** Bundled layout (game/data/osm/ICAO.json, made by tools/fetch-layouts.mjs) back to Overpass shape. */
export function expandCompact(c) {
  const pts = (flat) => {
    const g = [];
    for (let i = 0; i < flat.length; i += 2) g.push({ lat: flat[i], lon: flat[i + 1] });
    return g;
  };
  return {
    elements: c.e.map(([t, id, tags, d]) => {
      if (t === 'n') return { type: 'node', id, tags, lat: d[0], lon: d[1] };
      if (t === 'w') return { type: 'way', id, tags, geometry: pts(d) };
      return { type: 'relation', id, tags, members: d.map(([role, flat]) => ({ type: 'way', role, geometry: pts(flat) })) };
    }),
  };
}

async function bundled(icao) {
  if (WEB_DEMO) return null; // the demo's maps are the website's (loadLayoutWeb)
  try {
    const r = await fetch(assetUrl(`data/osm/${icao}.json`));
    return r.ok ? expandCompact(await r.json()) : null;
  } catch (_) {
    return null;
  }
}

async function fixture(name) {
  try {
    const r = await fetch(assetUrl(`fixtures/${name}`));
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------- layout

/** The robot's rule for an answer that ran out of time or memory: a 200 with a remark, and no map (tools/maps/fetch.mjs). */
const PARTIAL_REMARK = /error|timed out|out of memory/i;
const isPartial = (j) => !!(j && j.remark && PARTIAL_REMARK.test(j.remark));
/** A layout answer is the map when it has a runway and is not partial; a surroundings answer when it has elements. */
export const layoutAnswerOk = (j) => !isPartial(j) && Array.isArray(j.elements) && j.elements.some((e) => e.tags && e.tags.aeroway === 'runway');
export const surroundAnswerOk = (j) => !isPartial(j) && Array.isArray(j.elements);

/**
 * The airport's map as the phone has it when the game starts: the bundled file, a saved copy (30 days, under SAVE_RULE), or the
 * website's copy, which is waited for START_WAIT_MS at most. No public server is asked here: when none of these has the map, the
 * game starts on the runways at once and fetchFullMap asks for it after the start (DECISIONS 372). `skip` (the Play now button)
 * ends the wait for the website at once.
 * @returns { layout, osmSource: 'bundled'|'cache'|'website'|'fixture'|'none', polite }
 */
export async function loadLayout(info, { demo = false, onStatus, skip, polite = newPolite(), net = {} } = {}) {
  if (WEB_DEMO) return loadLayoutWeb(info, { skip, polite, net });
  // net: the network and the saved copies, swapped in by the tests (the game uses the real ones)
  const read = net.cacheGet || cacheGet, write = net.cacheSet || cacheSet, del = net.cacheDel || cacheDel;
  const oa = await getRunways(info.icao);
  let osm = null, osmSource = 'none';
  // a saved copy from the website or the servers carries its surroundings (`s`, the compact form): loadSurroundings
  // reads them from polite.site, so a repeat visit asks no server for the area map
  const fromSaved = (data) => {
    if (data && data.s) polite.site = data;
    return expandStored(data);
  };
  if (demo && FIXTURE_AIRPORTS.includes(info.icao)) {
    osm = await fixture(`osm_${info.icao}.json`);
    osmSource = osm ? 'fixture' : 'none';
  }
  if (!osm) {
    // the home-screen airports ship with their real layout (game/data/osm/, tools/fetch-layouts.mjs)
    osm = await bundled(info.icao);
    if (osm) osmSource = 'bundled';
  }
  if (!osm && !demo) {
    const cached = await savedCopy(read, del, `osm:${info.icao}`);
    if (cached) {
      osm = fromSaved(cached.data);
      osmSource = 'cache';
      onStatus && onStatus(loadingLine('cache'));
    } else {
      // the website: a 404 means the robot has not got to this airport yet. It is waited for START_WAIT_MS at most, so a slow or
      // hung website does not hold the start; fetchFullMap asks it again after the start, and the next game has its map.
      const site = await capped(Promise.race([fetchWebsite(info, polite, net), skipWait(skip)]), START_WAIT_MS);
      if (site) {
        polite.site = site;
        osm = expandCompact(site);
        osmSource = 'website';
        write(`osm:${info.icao}`, { at: Date.now(), rule: SAVE_RULE, data: site });
      }
    }
  }
  if (osmSource === 'none') polite.mapFailed = true;
  let layout = buildLayout(info, oa, osm);
  if (!layout.runways.length && osm) layout = buildLayout(info, oa, null);
  return { layout, osmSource, polite };
}

/**
 * The browser demo's map (DECISIONS 446): the website's copy only. Nothing is bundled, saved or asked of a public server, and the
 * start waits for the website up to DEMO_MAP_WAIT_MS (two tries at most: a failure or a server error is tried once more; a 404
 * means the map robot has not got there, and is not tried again). Play on runways now ends the wait.
 */
async function loadLayoutWeb(info, { skip, polite, net }) {
  const oa = await getRunways(info.icao);
  let osm = null, osmSource = 'none';
  const site = await Promise.race([demoWebsiteMap(info, polite, net), skipWait(skip)]);
  if (site) {
    polite.site = site;
    osm = expandCompact(site);
    osmSource = 'website';
  }
  if (osmSource === 'none') polite.mapFailed = true;
  let layout = buildLayout(info, oa, osm);
  if (!layout.runways.length && osm) layout = buildLayout(info, oa, null);
  return { layout, osmSource, polite };
}

/** The website's map for the demo: up to two tries, each waited DEMO_MAP_WAIT_MS at most (see loadLayoutWeb). null when none came. */
async function demoWebsiteMap(info, polite, net) {
  const get = net.http || http, online = net.online || onlineNow;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await capped(websiteTry(info, get, online, polite), DEMO_MAP_WAIT_MS);
    if (r && (r.map || !r.failed || polite.offline)) return r.map;
  }
  return null;
}

/** One try at the website's copy: the compressed file, then the plain one. failed: an error or a server error (not a 404). */
async function websiteTry(info, get, online, polite) {
  let failed = false;
  for (const file of [`${info.icao}.json.gz`, `${info.icao}.json`]) {
    const r = await get('GET', `${WEBSITE_MAP_URL}${file}`, { timeoutMs: DEMO_MAP_WAIT_MS, gzip: file.endsWith('.gz') });
    if (r.status === 200) {
      try {
        const c = JSON.parse(r.text);
        if (c && Array.isArray(c.e)) return { map: c, failed: false };
      } catch (_) { /* not a map: the plain file next */ }
    } else if (r.status === 0 || r.status >= 500) {
      if (isOffline(r, online)) {
        polite.offline = true;
        return { map: null, failed: false };
      }
      failed = true;
    }
  }
  return { map: null, failed };
}

/** Resolves when the player presses Play now (or Cancel) on the loading card; never otherwise. */
const skipWait = (skip) => (skip && skip.promise ? skip.promise.then(() => null) : new Promise(() => {}));

/** The value of p, or null when ms pass first (the timer is cleared once p settles). p never rejects here. */
function capped(p, ms) {
  let timer = 0;
  const limit = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/**
 * A saved copy (osm: or sur:) the phone may use: one kept under SAVE_RULE and not older than CACHE_DAYS. Any other copy is removed
 * when it is read, so a map older than 30 days is not kept (privacy.md) and a 2.9 copy, which may hold a partial answer, is never used.
 */
async function savedCopy(read, del, key) {
  const r = await read(key);
  if (!r) return null;
  if (r.rule === SAVE_RULE && Date.now() - r.at < CACHE_DAYS * 864e5) return r;
  await del(key);
  return null;
}

// ---------------------------------------------------------- the full map, after the start

// the robot's pause before the other server (tools/maps/fetch.mjs): one request at a time, and the servers take turns
const defaultPause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Overpass question, the servers in turn (kumi, then overpass-api.de), one request at a time, on the robot's patience. The
 * first 200 answer that `ok` accepts is the map. After a failure the other server is asked BACKOFF_MS later; after a refusal (429,
 * 406) the refused server is not asked again and the other is asked REFUSED_PAUSE_MS later. onNext runs only when the other
 * server is really about to be asked (the card says "Trying another" then, and not before). Resolves the answer, or null.
 */
export async function askServers(query, ok, patienceMs, { http: get = http, online = onlineNow, polite = newPolite(), onNext = () => {}, pause = defaultPause } = {}) {
  const body = 'data=' + encodeURIComponent(query);
  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    if (polite.offline) return null;
    const url = OVERPASS_MIRRORS[i];
    if (polite.refused.has(url)) continue;
    if (i > 0) onNext(); // "Trying another" is said as the other server is asked, after its pause (below)
    const r = await get('POST', url, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body,
      timeoutMs: patienceMs,
    });
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.text);
        if (ok(j)) return j;
      } catch (_) { /* not JSON: a failure like any other */ }
    }
    if (isOffline(r, online)) {
      polite.offline = true;
      return null;
    }
    let wait = BACKOFF_MS;
    if (r.status === 429 || r.status === 406) {
      polite.refused.add(url);
      polite.busy = true;
      wait = REFUSED_PAUSE_MS;
    } else if (r.status !== 0) {
      polite.busy = true; // answered with an error, or with a partial answer
    }
    if (i + 1 < OVERPASS_MIRRORS.length) await pause(wait);
  }
  return null;
}

/** An airport whose full map did not come is not asked again for REST_MS (the robot's 12 hours). */
async function resting(read, key) {
  const r = await read(key);
  return !!(r && Date.now() - r.at < REST_MS);
}

/**
 * The full map of an airport, fetched after the game has started on the runways (DECISIONS 372). When no map came at the start, the
 * website is asked again (its copy may be there by now), then the layout from the servers; then the surroundings, when no copy is
 * saved. What comes is saved, and the next game here uses it. The game in play keeps the layout it started with: its replay names
 * that layout, so nothing changes under it. `layout` is the layout the game is on (null when no map came). onState gives the area
 * note's word: 'fullmap' (on its way), 'another' (the other server is asked), 'downloading', 'saved' (a map saved here, the last word),
 * 'ready', 'unavailable' (no surroundings), 'nomap' (no layout) or 'offline' (no network when the layout was asked for).
 * @returns { layout, sur } the layout to use from the next game, and the surroundings when they came in this call (or null)
 */
export async function fetchFullMap(info, { layout = null, onState = () => {}, polite = newPolite(), net = {} } = {}) {
  if (WEB_DEMO) return { layout, sur: null }; // the demo's map is the website's, asked at the start only (DECISIONS 446)
  const read = net.cacheGet || cacheGet, write = net.cacheSet || cacheSet, del = net.cacheDel || cacheDel;
  const online = net.online || onlineNow;
  if (!online()) {
    polite.offline = true; // a phone with no network asks nothing
    return { layout, sur: null };
  }
  const get = net.http || http;
  const opts = { http: get, online, polite, onNext: () => onState('another'), pause: net.pause };
  const oa = await getRunways(info.icao);
  let L = layout, saved = false;
  if (!L) {
    const copy = await savedCopy(read, del, `osm:${info.icao}`);
    if (copy) {
      L = buildLayout(info, oa, expandStored(copy.data));
      if (copy.data.s) polite.site = copy.data; // a website copy carries its area: loadSurroundings reads it from here
    } else if (await resting(read, `rest:osm:${info.icao}`)) {
      onState('nomap');
      return { layout: null, sur: null };
    } else {
      onState('fullmap');
      // the website may have its copy by now (asked first, as at the start); the servers only when it has none
      const site = await fetchWebsite(info, polite, { http: get, online });
      let compact = site;
      if (!compact && !polite.offline) {
        const j = await askServers(overpassQuery(info.lat, info.lon, fetchRadius(info, oa)), layoutAnswerOk, LAYOUT_PATIENCE_MS, opts);
        compact = j ? compactOsm(j) : null;
      }
      if (!compact) {
        // a failure with no network is not a rest: the next visit with a connection asks at once
        if (!polite.offline) await write(`rest:osm:${info.icao}`, { at: Date.now() });
        onState(polite.offline ? 'offline' : 'nomap');
        return { layout: null, sur: null };
      }
      await write(`osm:${info.icao}`, { at: Date.now(), rule: SAVE_RULE, data: compact });
      if (site && site.s) polite.site = site;
      L = buildLayout(info, oa, expandCompact(compact));
      saved = true;
    }
  }
  // the note's last word: a map saved here is what the note says (the area's word is for this game only)
  const finish = (sur, word) => {
    onState(saved ? 'saved' : word);
    return { layout: L, sur };
  };
  // the surroundings: a copy the phone has (bundled, the website's, or saved) is used; else the area around the map, once
  const have = await loadSurroundings(info, { polite, deps: net });
  if (have) return finish(have, 'ready');
  if (await resting(read, `rest:sur:${info.icao}`)) return finish(null, 'unavailable');
  onState('downloading');
  const s = await askServers(surroundQuery(info.lat, info.lon, surroundHalfSize(L), (info.elev || 0) * 0.3048), surroundAnswerOk, SURROUND_PATIENCE_MS, opts);
  let data = null;
  try {
    data = s ? compactSurroundings(s, info.lat, info.lon) : null;
  } catch (_) { data = null; /* an answer the compact form cannot take: no area map */ }
  if (!data) {
    if (!polite.offline) await write(`rest:sur:${info.icao}`, { at: Date.now() });
    return finish(null, 'unavailable');
  }
  await write(`sur:${info.icao}`, { at: Date.now(), rule: SAVE_RULE, data });
  return finish(data, 'ready');
}

// one map job at a time on the phone, whichever airport it is for: one request at a time, as the polite rules say
let mapQueue = Promise.resolve();
/** Queues fetchFullMap behind any job still running. The game never waits for it; its promise rejects only on a bug. */
export function queueFullMap(info, opts = {}) {
  const job = mapQueue.then(() => fetchFullMap(info, opts));
  mapQueue = job.catch(() => {});
  return job;
}

/**
 * The airport's map as the website has it (osm/ICAO.json, the compact form the bundled files use), or null. The compressed copy
 * (osm/ICAO.json.gz, about a quarter of the size, DECISIONS 372) is asked first, then the plain file. A 404 means the map robot
 * has not got to this airport yet. Short plain GETs (no headers), and a failed lookup goes on to the servers.
 */
export async function fetchWebsite(info, polite = newPolite(), { http: get = http, online = onlineNow } = {}) {
  for (const file of [`${info.icao}.json.gz`, `${info.icao}.json`]) {
    const r = await get('GET', `${WEBSITE_MAP_URL}${file}`, { timeoutMs: WEBSITE_TIMEOUT_MS, gzip: file.endsWith('.gz') });
    if (r.status === 200) {
      try {
        const c = JSON.parse(r.text);
        if (c && Array.isArray(c.e)) return c;
      } catch (_) { /* not a map: the plain file next */ }
    }
    if (isOffline(r, online)) {
      polite.offline = true;
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------- surroundings

/**
 * Coastline, lakes and the high peaks around an airport (scenery.js), compact and simplified, from what the phone has: the
 * bundled file, the website's copy of the map, or a saved copy. Nothing is downloaded here, so the game is never held up for
 * it; a null means the full map fetches the area after the start (fetchFullMap).
 */
export async function loadSurroundings(info, { demo = false, polite = newPolite(), deps = {} } = {}) {
  const read = deps.cacheGet || cacheGet, fetchFile = deps.fetch || fetch;
  if (!WEB_DEMO) try {
    const r = await fetchFile(assetUrl(`data/osm/${info.icao}.json`));
    if (r.ok) {
      const j = await r.json();
      if (j.s && j.s.v === SUR_VERSION) return j.s;
    }
  } catch (_) { /* not bundled */ }
  // the website's copy of this map carries its surroundings too (it was fetched with the layout)
  if (polite.site && polite.site.s && polite.site.s.v === SUR_VERSION) return polite.site.s;
  if (demo || WEB_DEMO) return null; // the demo keeps no saved copy (DECISIONS 446)
  const cached = await savedCopy(read, deps.cacheDel || cacheDel, `sur:${info.icao}`);
  if (cached && cached.data && cached.data.v === SUR_VERSION) return cached.data; // a saved copy, not older than 30 days
  return null;
}

// ---------------------------------------------------------------- weather

export async function loadMetar(info, { demo = false } = {}) {
  if (WEB_DEMO) return null; // the demo never asks the weather service (DECISIONS 446)
  if (demo) {
    const j = await fixture(`metar_${info.icao}.json`);
    return j ? parseMetarJson(j) : null;
  }
  const r = await http('GET', METAR_URL(info.icao), { headers: { 'User-Agent': USER_AGENT }, timeoutMs: 12000 });
  if (r.status !== 200 || !r.text) return null; // 204 = no report for this station
  try {
    return parseMetarJson(JSON.parse(r.text));
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------- demo traffic

/**
 * Replays a recorded OpenSky snapshot as if it were live (re-timed so the recording is "now"). It goes through the
 * same arrival rules as a live feed, with no poll history: a recording is judged on its own.
 */
export async function demoFeed(info, LiveFeedClass, nearby = []) {
  const json = await fixture(`states_${info.icao}.json`);
  // Reuse LiveFeed's filtering + arrival checks by feeding it one recorded result.
  const feed = new LiveFeedClass({ client: { authenticated: true, fetchStates: async () => ({ ok: false, status: 0 }) }, lat: info.lat, lon: info.lon, elevM: (info.elev || 0) * 0.3048, nearby, recorded: true });
  if (json) {
    const now = Date.now();
    const shift = now / 1000 - json.time;
    const flights = parseStates(json).map((f) => ({ ...f, timePosition: (f.timePosition || json.time) + shift }));
    feed.onResult({ ok: true, flights, remaining: null }, now);
  } else {
    feed.status = 'offline';
    feed.markFirst(); // no recording: the game does not wait for it
  }
  feed.update = () => {};
  feed.demo = true;
  return feed;
}
