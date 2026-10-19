// The map robot. Fetches each queued airport's map from OpenStreetMap's public Overpass servers and writes osm/<ICAO>.json
// for this site, in the compact form the game reads (game/js/airportdata.js compactOsm): the layout, and the surroundings
// (coast, water, peaks: game/js/scenery.js) under `s`. The query and the form are the game's own (tools/fetch-layouts.mjs
// in the game repo), so the game reads these files as it reads its bundled ones.
//
// Runs every 3 hours in .github/workflows/maps.yml, or by hand:  node tools/maps/fetch.mjs
// Works through tools/maps/queue.txt in order, skipping airports whose osm/<ICAO>.json exists. An airport that fails
// stays in the queue for a later run, but it is noted in tools/maps/failures.json and skipped for a while (12 hours, then a
// week once it has failed 5 times), so an airport that keeps failing never blocks the airports behind it. The run ends when its
// time is up, when the site is near its size limit, or after several airports in a row fail (the servers are down). Its log
// (failures and counts) is printed.
//
// Politeness (the Overpass usage policy): one request at a time; the servers take turns; after HTTP 429 or 406 the run
// pauses 30 s; after any other failure it backs off 5 s before asking the other server; 1 s between airports.
//
// Environment (all optional, for tests): BUDGET_MIN (minutes this run may spend, default 100), SITE_LIMIT_MB (the site's
// size cap, default 900: GitHub Pages allows 1 GB), OSM_DIR, QUEUE, AIRPORTS, MIRRORS (comma separated URLs).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpassQuery, fetchRadius, buildLayout } from './game/airport.js';
import { surroundQuery, surroundHalfSize, compactSurroundings } from './game/scenery.js';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '..', '..');
const env = process.env;
const OSM_DIR = resolve(env.OSM_DIR || join(SITE, 'osm'));
const QUEUE = env.QUEUE || join(here, 'queue.txt');
const AIRPORTS = env.AIRPORTS || join(here, 'airports.json');
// Three public servers: from GitHub's shared computers the main one often answers 502 and the others are often busy, so a
// third gives each airport a better chance. Still one request at a time.
const MIRRORS = env.MIRRORS ? env.MIRRORS.split(',') : ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'ShortFinal (Android game by Thin Air Studios; maps for thin-air-studios.github.io)';
const BUDGET_MS = (+env.BUDGET_MIN || 100) * 60000;
const SITE_LIMIT = (+env.SITE_LIMIT_MB || 900) * 1e6;
// Client-side limits: the queries themselves time out at 40 s (layout) and 90 s (surroundings), so a server that has not
// answered 30 s after that is queueing us behind others; the next server gets the turn instead.
const LAYOUT_MS = 70000;
const SURROUND_MS = 120000;
const PAUSE_REFUSED_MS = 30000;
const BACKOFF_MS = 5000;
const PAUSE_AIRPORT_MS = 1000;
const MAX_FAILS_IN_A_ROW = 8;
const RETRY_AFTER_MS = 12 * 3600e3; // an airport that failed waits this long before it is asked again
const RETRY_AFTER_MANY_MS = 7 * 24 * 3600e3; // and this long once it has failed MANY_FAILS times
const MANY_FAILS = 5;
const FAILURES = env.FAILURES || join(here, 'failures.json');
const HARD_END_MS = BUDGET_MS + 5 * 60000; // no request starts after this, so the run ends before the workflow's limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0run = Date.now();
const secs = (ms) => (ms / 1000).toFixed(0);
const log = (s) => console.log(`[${secs(Date.now() - t0run)} s] ${s}`);

// ---- the compact form (the game's compactOsm and expandCompact, game/js/airportdata.js)
const KEEP_TAGS = ['aeroway', 'ref', 'surface', 'width', 'runway', 'building', 'area'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const flat = (geom) => geom.filter(Boolean).flatMap((g) => [r6(g.lat), r6(g.lon)]);

function compactOsm(osm) {
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

function expandCompact(c) {
  const pts = (f) => {
    const g = [];
    for (let i = 0; i < f.length; i += 2) g.push({ lat: f[i], lon: f[i + 1] });
    return g;
  };
  return {
    elements: c.e.map(([t, id, tags, d]) => {
      if (t === 'n') return { type: 'node', id, tags, lat: d[0], lon: d[1] };
      if (t === 'w') return { type: 'way', id, tags, geometry: pts(d) };
      return { type: 'relation', id, tags, members: d.map(([role, f]) => ({ type: 'way', role, geometry: pts(f) })) };
    }),
  };
}

// ---- the servers
let turn = 0; // the servers take turns

async function post(url, query, limitMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), limitMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One Overpass request: the servers take turns, one request at a time. check(json) returns why a 200 answer is no good,
 * or '' for a good one. Returns the JSON, or null when no server gave a good answer within limitMs.
 */
async function ask(label, query, check, limitMs) {
  const first = turn++ % MIRRORS.length;
  for (let i = 0; i < MIRRORS.length; i++) {
    if (Date.now() - t0run > HARD_END_MS) return null;
    const url = MIRRORS[(first + i) % MIRRORS.length];
    const host = new URL(url).host;
    const t = Date.now();
    const r = await post(url, query, limitMs);
    const ms = Date.now() - t;
    let why;
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.text);
        // a server that ran out of time or memory still answers 200, with a partial result
        why = (j.remark && /error|timed out|out of memory/i.test(j.remark) && j.remark) || check(j);
        if (!why) return j;
      } catch (_) {
        why = 'not JSON';
      }
    } else {
      why = `HTTP ${r.status}`;
    }
    log(`  ${label}: ${host} ${why}, ${ms} ms`);
    // the usage policy: a refusal (429, 406) is a long pause; any other failure a short back-off before the next server
    if (r.status === 429 || r.status === 406) await sleep(PAUSE_REFUSED_MS);
    else if (i + 1 < MIRRORS.length) await sleep(BACKOFF_MS);
  }
  return null;
}

/** The airport's compact map with its surroundings, or the reason it failed. */
async function fetchAirport(icao, entry) {
  const [code, iata, name, city, country, lat, lon, elevFt, kind] = entry.a;
  const info = { icao: code, iata, name, city, country, lat, lon, elev: elevFt, kind };
  const oa = entry.rw;
  const layout = await ask(`${icao} layout`, overpassQuery(lat, lon, fetchRadius(info, oa)), (j) =>
    Array.isArray(j.elements) && j.elements.some((e) => e.tags && e.tags.aeroway === 'runway') ? '' : 'no runways in the answer', LAYOUT_MS);
  if (!layout) return { why: 'no layout from any server' };
  const out = compactOsm(layout);
  // the surroundings cover the whole map the game draws for this layout (as in tools/fetch-layouts.mjs)
  const L = buildLayout(info, oa, expandCompact(out));
  const sur = await ask(`${icao} surroundings`, surroundQuery(lat, lon, surroundHalfSize(L), (elevFt || 0) * 0.3048), (j) =>
    Array.isArray(j.elements) ? '' : 'no elements in the answer', SURROUND_MS);
  if (!sur) return { why: 'no surroundings from any server' };
  out.s = compactSurroundings(sur, lat, lon);
  return { text: JSON.stringify(out) };
}

// ---- sizes
function dirBytes(dir, skip = []) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip.includes(resolve(p))) continue;
    const st = statSync(p);
    total += st.isDirectory() ? dirBytes(p, skip) : st.size;
  }
  return total;
}

// ---- the run
const queue = readFileSync(QUEUE, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{4}$/.test(s));
const airports = JSON.parse(readFileSync(AIRPORTS, 'utf8'));
mkdirSync(OSM_DIR, { recursive: true });
const siteOther = dirBytes(SITE, [join(SITE, '.git'), OSM_DIR]);
let osmBytes = dirBytes(OSM_DIR);
log(`queue ${queue.length} airports; osm/ ${(osmBytes / 1e6).toFixed(1)} MB; rest of the site ${(siteOther / 1e6).toFixed(1)} MB; budget ${BUDGET_MS / 60000} min`);

// airports that failed before: { ICAO: { n: times failed, at: when last (ms) } }; one that succeeds is removed
const failures = existsSync(FAILURES) ? JSON.parse(readFileSync(FAILURES, 'utf8')) : {};
const resting = (icao, now) => {
  const f = failures[icao];
  return !!f && now - f.at < (f.n >= MANY_FAILS ? RETRY_AFTER_MANY_MS : RETRY_AFTER_MS);
};

const started = Date.now();
let fetched = 0, failed = 0, already = 0, waiting = 0, fails = 0, stop = '';
const failedNow = [];
for (const icao of queue) {
  const file = join(OSM_DIR, `${icao}.json`);
  if (existsSync(file)) { already++; continue; }
  if (resting(icao, Date.now())) { waiting++; continue; }
  if (Date.now() - started > BUDGET_MS) { stop = 'the time budget is used up'; break; }
  if (siteOther + osmBytes > SITE_LIMIT) { stop = 'the site is at its size limit'; break; }
  const entry = airports[icao];
  const t = Date.now();
  const res = entry ? await fetchAirport(icao, entry) : { why: 'not in airports.json' };
  if (res.text) {
    writeFileSync(file, res.text);
    osmBytes += Buffer.byteLength(res.text);
    fetched++;
    fails = 0;
    delete failures[icao];
    log(`+ ${icao} ${(res.text.length / 1024).toFixed(0)} KB, ${secs(Date.now() - t)} s`);
  } else {
    failed++;
    fails++;
    failedNow.push(icao);
    failures[icao] = { n: (failures[icao] ? failures[icao].n : 0) + 1, at: Date.now() };
    log(`- ${icao}: ${res.why}, ${secs(Date.now() - t)} s`);
    if (fails >= MAX_FAILS_IN_A_ROW) { stop = `${MAX_FAILS_IN_A_ROW} airports in a row failed; the servers are unhappy`; break; }
  }
  await sleep(PAUSE_AIRPORT_MS);
}
writeFileSync(FAILURES, JSON.stringify(failures, null, 0) + '\n');
const left = queue.length - already - fetched - failed - waiting;
log(`done: ${fetched} fetched, ${failed} failed (they stay in the queue), ${already} already there, ${waiting} resting after a failure, ${left} not reached`);
log(`osm/ ${((osmBytes) / 1e6).toFixed(1)} MB; site ${((siteOther + osmBytes) / 1e6).toFixed(1)} MB of ${SITE_LIMIT / 1e6} MB; ${stop ? `stopped: ${stop}` : 'every airport in the queue was tried'}`);
if (failedNow.length) log(`failed this run: ${failedNow.slice(0, 40).join(' ')}${failedNow.length > 40 ? ` and ${failedNow.length - 40} more` : ''}`);
log(`run took ${secs(Date.now() - started)} s`);
