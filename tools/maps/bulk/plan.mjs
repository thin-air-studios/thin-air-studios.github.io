// The region plan for the bulk builder (tools/maps/bulk/extract.mjs): which OpenStreetMap extract each queued airport's map
// is built from. The workflow (.github/workflows/maps-bulk.yml) runs this first and reads the plan it writes.
//
// For each queued airport with no map yet, the plan takes the smallest extract whose polygon holds the airport's boxes: the
// layout box (the one the robot and the builder query), the surroundings box, and the 120 km peaks box if one extract holds
// that too. The surroundings box is the builder's own size: its half size is the one surroundHalfSize gives for the
// airport's database runways (the same runways the phone draws when it has no map), plus TOL_M, since the OSM layout can
// reach a little past the runways. On the Colorado maps this estimate is within 2.2 km of the builder's real size for all 43
// airports. Polygons come from Geofabrik's index (index-v1.json: one feature per extract, with its .osm.pbf URL). "Smallest"
// is the extract's bounding box, a rough measure; an extract over MAX_BYTES is passed over. Coverage is tested on a GRID x
// GRID grid of points in each box (holes respected), so a sliver of a box that leaves the polygon between grid points can
// be missed. An airport whose only extract holds its layout and surroundings but not the peaks box is planned with
// peaksPartial set: its peaks may lack a few summits.
// Sizes come from the openstreetmap.fr mirror's directory listings (read at depth 2 only, one request every 0.5 s) or, for an
// extract the listings do not show, from a HEAD request to Geofabrik. The mirror is also the download fallback. Each extract
// carries its checksum files (Geofabrik's .md5 next to the .osm.pbf, and the mirror's); the workflow checks the download.
//
// usage: node tools/maps/bulk/plan.mjs [--index=<index-v1.json file>] [--regions=<id,id>|all] [--out=<plan.json>]
//          [--no-mirror] [--osm=<dir of the maps already made>]
// --regions limits the plan to some extracts (their ids, as the index names them: "us/colorado", "germany").
// An id the index does not name is an error. Writes the plan and prints the totals. With GITHUB_OUTPUT set, writes the job matrix
// as "matrix=..." (the first MAX_JOBS extracts, since a run takes at most that many jobs), and the rest as "rest=<ids>": the
// workflow starts a run for those (maps-bulk.yml).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpassQuery, fetchRadius, buildLayout } from '../game/airport.js';
import { surroundQuery, surroundHalfSize } from '../game/scenery.js';
import { loadQueue, mapExists } from '../store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '..', '..', '..');
const UA = 'ShortFinal (Android game by Thin Air Studios; maps for thin-air-studios.github.io)';
const INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const GEOFABRIK = 'https://download.geofabrik.de/';
const MIRROR = 'https://download.openstreetmap.fr/extracts/';
const MAX_BYTES = 8e9; // a runner has about 14 GB of disk after its cleanup: the extract, its filtered copy and the maps
const MAX_JOBS = 250; // a run's matrix takes this many extracts (GitHub allows 256 jobs in a run); the rest go to the next run
const BB = /\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/g;
const FAR_M = 120000; // the peaks box: surroundQuery's far box
const HALF_CAP_M = 30000; // the largest surroundings half size (surroundHalfSize)
const TOL_M = 2500; // added to the estimated half size: the OSM layout can reach past the database runways
const GRID = 9; // points per side of the grid that tests a box

const opt = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (!m) { console.error(`not an option: ${a}`); process.exit(2); }
  opt[m[1]] = m[2] === undefined ? true : m[2];
}
const log = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, ms = 180000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

// the size of a file from its HTTP headers, or null
async function headBytes(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: ctl.signal });
    const n = Number(r.headers.get('content-length'));
    return r.ok && n > 0 ? n : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- the index: each extract's id, pbf URL and polygon
const indexText = opt.index ? readFileSync(resolve(opt.index), 'utf8') : await getText(INDEX_URL);
const index = JSON.parse(indexText);
const extracts = [];
for (const f of index.features || []) {
  const url = f.properties && f.properties.urls && f.properties.urls.pbf;
  if (!url) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const box = { s: 90, w: 180, n: -90, e: -180 }; // a loop, not a spread: a country outline can have 100,000 points
  for (const c of polys.flat(2)) { box.s = Math.min(box.s, c[1]); box.n = Math.max(box.n, c[1]); box.w = Math.min(box.w, c[0]); box.e = Math.max(box.e, c[0]); }
  extracts.push({ id: f.properties.id, url, polys, box, area: (box.n - box.s) * (box.e - box.w) });
}
extracts.sort((a, b) => a.area - b.area);
log(`index: ${extracts.length} extracts with a pbf URL`);

// --regions: every id must be one the index names (a mistyped id would plan nothing and pass silently)
const requested = opt.regions && opt.regions !== 'all' ? opt.regions.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (requested) {
  const known = new Set(extracts.map((e) => e.id));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length) { console.error(`no extract named ${unknown.join(', ')} in the index (ids as Geofabrik's index names them: us/colorado, germany)`); process.exit(2); }
}

// ---- the mirror's copies and sizes: "north-america/us-west/colorado-latest.osm.pbf" is "north-america/us/colorado"
const normKey = (p) => p.replace(/-latest\.osm\.pbf$/, '').replace(/^root\//, '').replace(/\/us-(west|south|midwest|northeast)\//, '/us/');
const keyOf = (e) => normKey(e.url.replace(GEOFABRIK, ''));
const mirror = new Map(); // key -> { path, bytes }
const SIZE = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
async function crawl(dir, depth) {
  let html;
  try { html = await getText(MIRROR + dir); } catch (e) { return; }
  for (const m of html.matchAll(/<a href="([^"?][^"]*)">[^<]*<\/a><\/td><td align="right">[^<]*<\/td><td align="right">\s*([^<\s]+)\s*<\/td>/g)) {
    const [, href, size] = m;
    if (href.endsWith('/')) {
      if (depth < 2) { await sleep(500); await crawl(dir + href, depth + 1); }
    } else if (href.endsWith('-latest.osm.pbf')) {
      const u = /^([\d.]+)([KMG])$/.exec(size);
      mirror.set(normKey(dir + href), { path: dir + href, bytes: u ? Math.round(+u[1] * SIZE[u[2]]) : null });
    }
  }
}
if (!opt['no-mirror']) {
  await crawl('', 0); // the root is depth 0: its directories are read to depth 2
  log(`mirror: ${mirror.size} extracts listed`);
}

// the size of an extract: the mirror's listing, else Geofabrik's HEAD (three failures and Geofabrik is not asked again)
const sizes = new Map(); // extract id -> bytes or null
let headFails = 0;
async function bytesOf(e) {
  if (!sizes.has(e.id)) {
    const m = mirror.get(keyOf(e));
    let bytes = m && m.bytes ? m.bytes : null;
    if (bytes == null && headFails < 3) {
      bytes = await headBytes(e.url);
      if (bytes == null) headFails++;
    }
    sizes.set(e.id, bytes);
  }
  return sizes.get(e.id);
}

// ---- the airports: their boxes, as the robot and the builder query them
const queue = loadQueue(join(SITE, 'tools', 'maps', 'queue.txt'));
const rows = JSON.parse(readFileSync(join(SITE, 'tools', 'maps', 'airports.json'), 'utf8'));
const osmDir = resolve(opt.osm || join(SITE, 'osm'));
// the query's first box (the layout's or the near one) and its last (the far one); the same boxes the builder uses
const boxesOf = (q) => {
  const m = [...q.matchAll(BB)];
  const box = (x) => ({ s: +x[1], w: +x[2], n: +x[3], e: +x[4] });
  return { first: box(m[0]), last: box(m[m.length - 1]) };
};
const jobs = [];
queue.forEach((icao, rank) => {
  if (mapExists(osmDir, icao)) return;
  const row = rows[icao];
  if (!row) { jobs.push({ icao, rank, boxes: null, reason: 'not in airports.json' }); return; }
  const [code, iata, name, city, country, lat, lon, elevFt, kind] = row.a;
  const info = { icao: code, iata, name, city, country, lat, lon, elev: elevFt, kind };
  const elevM = (elevFt || 0) * 0.3048;
  const half = Math.min(HALF_CAP_M, surroundHalfSize(buildLayout(info, row.rw, null)) + TOL_M);
  const layout = boxesOf(overpassQuery(lat, lon, fetchRadius(info, row.rw))).first;
  const near = boxesOf(surroundQuery(lat, lon, half, elevM)).first;
  const far = boxesOf(surroundQuery(lat, lon, FAR_M, elevM)).last;
  jobs.push({ icao, rank, boxes: { layout, near, far } });
});
const todo = jobs.length;
log(`queue ${queue.length}, without a map ${todo}`);

// ---- does the polygon hold the box (a grid of points, holes respected)
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPolys = (polys, x, y) => polys.some(([o, ...h]) => inRing(o, x, y) && !h.some((r) => inRing(r, x, y)));
function holds(ext, b) {
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const lat = b.s + ((b.n - b.s) * i) / (GRID - 1), lon = b.w + ((b.e - b.w) * j) / (GRID - 1);
    if (!inPolys(ext.polys, lon, lat)) return false;
  }
  return true;
}
const boxIn = (outer, b) => outer.box.s <= b.s && outer.box.n >= b.n && outer.box.w <= b.w && outer.box.e >= b.e;

// the first candidate (smallest first) whose polygon holds the box and whose size is known and under the limit. why: the reason if none is
async function choose(cands, box, what) {
  let overSize = 0;
  for (const e of cands) {
    if (!holds(e, box)) continue;
    const bytes = await bytesOf(e);
    if (bytes == null || bytes > MAX_BYTES) { overSize++; continue; } // an extract of unknown size is not risked on a runner's disk
    return { ext: e };
  }
  return { why: overSize ? `every extract holding ${what} is over the size limit or of unknown size` : `no extract's polygon holds ${what}` };
}

const used = new Map(); // extract id -> { ext, airports: [] , peaksPartial: [] }
const uncovered = [];
for (const j of jobs) {
  if (!j.boxes) { uncovered.push({ icao: j.icao, rank: j.rank, reason: j.reason }); continue; }
  // the extracts whose bounding boxes hold the layout and the surroundings (a cheap test before the polygons)
  const cover = extracts.filter((e) => boxIn(e, j.boxes.layout) && boxIn(e, j.boxes.near));
  let got = await choose(cover.filter((e) => boxIn(e, j.boxes.far)), j.boxes.far, 'its layout, surroundings and peaks');
  let peaksPartial = false;
  if (!got.ext) {
    got = await choose(cover, j.boxes.near, 'its layout and surroundings');
    peaksPartial = !!got.ext;
  }
  if (!got.ext) {
    const reason = !cover.length ? "no extract's bounding box holds its layout and surroundings" : got.why;
    uncovered.push({ icao: j.icao, rank: j.rank, reason });
    continue;
  }
  if (!used.has(got.ext.id)) used.set(got.ext.id, { ext: got.ext, airports: [], peaksPartial: [] });
  const u = used.get(got.ext.id);
  u.airports.push({ icao: j.icao, rank: j.rank });
  if (peaksPartial) u.peaksPartial.push(j.icao);
}

// ---- the plan, and the totals
const plan = { made: new Date().toISOString(), index: opt.index ? 'file' : INDEX_URL, maxBytes: MAX_BYTES, surroundTolM: TOL_M, extracts: [], uncovered };
let outside = 0; // airports whose extract is not one of --regions
for (const [id, u] of used) {
  if (requested && !requested.includes(id)) { outside += u.airports.length; continue; }
  const m = mirror.get(keyOf(u.ext));
  const bytes = sizes.get(u.ext.id) ?? (m ? m.bytes : null);
  plan.extracts.push({
    id, url: u.ext.url, md5: u.ext.url + '.md5', bytes,
    mirror: m ? MIRROR + m.path : null,
    mirrorMd5: m ? MIRROR + m.path.replace(/-latest\.osm\.pbf$/, '.osm.pbf') + '.md5' : null,
    airports: u.airports, peaksPartial: u.peaksPartial,
  });
}
plan.extracts.sort((a, b) => b.airports.length - a.airports.length || a.id.localeCompare(b.id));
const kept = plan.extracts.reduce((s, e) => s + e.airports.length, 0);
const total = plan.extracts.reduce((s, e) => s + (e.bytes || 0), 0);
const unknown = plan.extracts.filter((e) => e.bytes == null).length;
plan.totals = { queue: queue.length, withoutMap: todo, planned: kept, uncovered: uncovered.length, extracts: plan.extracts.length, downloadBytes: total, extractsWithoutSize: unknown, peaksPartial: plan.extracts.reduce((s, e) => s + e.peaksPartial.length, 0) };
if (requested) { plan.totals.note = 'limited to --regions'; plan.totals.inOtherExtracts = outside; }

for (const e of plan.extracts.slice(0, 40)) log(`${e.airports.length.toString().padStart(5)} airports  ${(e.bytes ? (e.bytes / 1e6).toFixed(0) + ' MB' : '? MB').padStart(9)}  ${e.id}${e.peaksPartial.length ? `  (${e.peaksPartial.length} peaks partial)` : ''}`);
if (plan.extracts.length > 40) log(`... and ${plan.extracts.length - 40} more extracts`);
log(`planned ${kept} airports from ${plan.extracts.length} extracts, ${(total / 1e9).toFixed(2)} GB to download (${unknown} extracts without a size)${requested ? `; ${outside} airports are in other extracts` : ''}`);
const why = {};
for (const u of uncovered) why[u.reason] = (why[u.reason] || 0) + 1;
log(`uncovered ${uncovered.length}: ${uncovered.slice(0, 30).map((u) => u.icao).join(' ')}${uncovered.length > 30 ? ' ...' : ''}`);
for (const [r, n] of Object.entries(why)) log(`  ${n} airports: ${r}`);
const out = resolve(opt.out || 'plan.json');
writeFileSync(out, JSON.stringify(plan, null, 1) + '\n');
log(`wrote ${out}`);
if (plan.extracts.length > MAX_JOBS) log(`this run takes the first ${MAX_JOBS} of ${plan.extracts.length} extracts; the rest (${plan.extracts.length - MAX_JOBS}) are for the next run`);
if (process.env.GITHUB_OUTPUT) {
  const matrix = { include: plan.extracts.slice(0, MAX_JOBS).map((e) => ({ id: e.id })) };
  const rest = plan.extracts.slice(MAX_JOBS).map((e) => e.id).join(',');
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\nextracts=${plan.extracts.length}\nrest=${rest}\n`);
}
