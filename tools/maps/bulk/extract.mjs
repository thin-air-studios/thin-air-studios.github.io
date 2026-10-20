// The bulk builder: makes the airport maps of one OpenStreetMap extract (a .osm.pbf file, e.g. Geofabrik's us/colorado) in
// one pass, instead of asking the public Overpass servers one airport at a time. The robot (tools/maps/fetch.mjs) and this
// builder make the same maps: the same boxes, the same query shapes, the game's own builders, and the same compact form.
//   the layout       = overpassQuery() (game/airport.js): the aerodrome and its relations; the runways, taxiways, taxilanes,
//                      aprons, terminals, hangars and helipads (ways); gates, parking positions and holding positions (nodes);
//                      and every building inside the aerodrome area (the buildings with any node inside it)
//   the surroundings = surroundQuery() (game/scenery.js): coastline, water and riverbanks in the surroundings box, and the
//                      peaks within about 120 km of the airport
// Overpass's "out geom" shapes are rebuilt from the extract: ways and nodes with their coordinates, and relations whose
// members carry their own geometry and the roles from the relation itself (read with osmium: the member list is in the
// relation's OPL line). Ways are clipped to the query's box the way "out geom(bbox)" clips them. The game's buildLayout and
// compactSurroundings then write the compact form, and store.mjs writeMap keeps it (osm/<ICAO>.json.gz, and the plain
// osm/<ICAO>.json for the busiest, the queue's first PLAIN_RANK).
// Two differences from the robot, both deliberate. The peaks are the 250 highest in the 120 km box (Overpass gives the
// first 400 by id, and the game then keeps the 250 highest of those). Member ways are kept only when they lie within 120 km
// of an airport, so a relation that reaches farther than that is cut at that edge.
//
// usage: node tools/maps/bulk/extract.mjs --pbf=<file.osm.pbf> --plan=<plan.json> --id=<extract id>
//          [--out=<dir for the maps, default osm/>] [--work=<scratch dir>] [--report=<file.json>]
//          [--only=ICAO,ICAO] [--overwrite] [--keep]
// Needs osmium-tool (apt install osmium-tool). The plan is written by tools/maps/bulk/plan.mjs; it names the airports of
// the extract (the ones with no map yet), with their queue rank. Existing maps are skipped unless --overwrite.
import { spawnSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { overpassQuery, fetchRadius, buildLayout } from '../game/airport.js';
import { surroundQuery, surroundHalfSize, compactSurroundings } from '../game/scenery.js';
import { haversine } from '../game/geo.js';
import { compactOsm, expandCompact, mapExists, writeMap } from '../store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '..', '..', '..');

const LAYOUT_WAY = new Set(['runway', 'taxiway', 'taxilane', 'apron', 'helipad', 'terminal', 'hangar']);
const LAYOUT_NODE = new Set(['helipad', 'gate', 'parking_position', 'holding_position']);
const LAYOUT_REL = new Set(['aerodrome', 'apron', 'terminal']);
const SKIP_WATER = new Set(['pond', 'wastewater', 'basin', 'pool', 'swimming_pool', 'fountain', 'reflecting_pool', 'drain', 'ditch', 'stream', 'lock', 'moat', 'tank', 'fish_pass']);
const ORDER = { node: 0, way: 1, relation: 2 };
const NEAR_M = 30000; // the largest surroundings box the game asks for (surroundHalfSize is capped at 30 km)
const FAR_M = 120000; // the peaks box: surroundQuery's far box
const PEAKS_KEPT = 250; // the game keeps the 250 highest (compactSurroundings)
const CELL = 0.5; // degrees: the grid that finds the airports near a feature
const MAX_CELLS = 4000;

// osmium's expressions: what the builder needs from the extract (the aeroway objects, buildings, coast, water, riverbanks, peaks)
const FILTER = ['nwr/aeroway', 'w/building', 'w/natural=coastline', 'nwr/natural=water', 'n/natural=peak', 'w/waterway=riverbank'].join('\n') + '\n';
const RELATIONS = 'r/aeroway\nr/natural=water\n';
const AERODROMES = 'nwr/aeroway=aerodrome\n';
const BB = /\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/g;

const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const die = (s) => { console.error(s); process.exit(2); };

// ---- arguments
const opt = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (!m) die(`not an option: ${a}`);
  opt[m[1]] = m[2] === undefined ? true : m[2];
}
if (!opt.pbf || !opt.plan || !opt.id) die('usage: node tools/maps/bulk/extract.mjs --pbf=<file.osm.pbf> --plan=<plan.json> --id=<extract id> [--out=<dir>] [--work=<dir>] [--report=<file>] [--only=ICAO,...] [--overwrite] [--keep]');
const OUT = resolve(opt.out || join(SITE, 'osm'));
const WORK = resolve(opt.work || join(tmpdir(), `maps-bulk-${opt.id.replace(/[^\w-]/g, '_')}`));
const ONLY = opt.only ? new Set(opt.only.split(',')) : null;

// ---- the geometry helpers (clipping and lengths: the same as the query's "out geom(bbox)" and the builder's filters)
const ring = (coords) => coords.map((c) => ({ lat: c[1], lon: c[0] }));
function boxOf(pts) {
  let s = 90, n = -90, w = 180, e = -180;
  for (const p of pts) {
    if (!p) continue;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lon < w) w = p.lon;
    if (p.lon > e) e = p.lon;
  }
  return { s, w, n, e };
}
const boxHit = (a, b) => a.s <= b.n && b.s <= a.n && a.w <= b.e && b.w <= a.e;
const boxHasPt = (b, lat, lon) => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e;
const boxUnion = (a, b) => ({ s: Math.min(a.s, b.s), w: Math.min(a.w, b.w), n: Math.max(a.n, b.n), e: Math.max(a.e, b.e) });
const EMPTY = { s: 90, w: 180, n: -90, e: -180 };

function clipLine(pts, s, w, n, e) {
  const out = [];
  let open = false;
  const lerp = (p, q, t) => ({ lat: p.lat + (q.lat - p.lat) * t, lon: p.lon + (q.lon - p.lon) * t });
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    let t0 = 0, t1 = 1; // Liang-Barsky
    const dx = q.lon - p.lon, dy = q.lat - p.lat;
    const tests = [[-dx, p.lon - w], [dx, e - p.lon], [-dy, p.lat - s], [dy, n - p.lat]];
    let ok = true;
    for (const [pp, qq] of tests) {
      if (pp === 0) { if (qq < 0) { ok = false; break; } continue; }
      const r = qq / pp;
      if (pp < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { if (open) { out.push(null); open = false; } continue; }
    const a = t0 === 0 ? p : lerp(p, q, t0), b = t1 === 1 ? q : lerp(p, q, t1);
    if (!open) { if (out.length && out[out.length - 1] !== null) out.push(null); out.push({ lat: a.lat, lon: a.lon }); }
    else if (out[out.length - 1].lat !== a.lat || out[out.length - 1].lon !== a.lon) { out.push(null); out.push({ lat: a.lat, lon: a.lon }); }
    out.push({ lat: b.lat, lon: b.lon });
    open = true;
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
const lengthM = (pts) => { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += haversine(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon); return L; };
const hasPiece = (g) => g.filter(Boolean).length > 1;

// point in polygon with holes (GeoJSON rings: [lon, lat]); polys: [[outer, hole, ...], ...]
function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inPolys = (polys, x, y) => polys.some(([outer, ...holes]) => inRing(outer, x, y) && !holes.some((h) => inRing(h, x, y)));

// the query's box: the first or the last (lat/lon) box written in a query
function bboxOfQuery(q, which) {
  const all = [...q.matchAll(BB)];
  const m = which === 'first' ? all[0] : all[all.length - 1];
  return { s: +m[1], w: +m[2], n: +m[3], e: +m[4] };
}

// ---- osmium
function osmium(args, what) {
  const r = spawnSync('osmium', [...args, '--no-progress'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`osmium ${what} failed (${r.status}): ${(r.stderr || '').slice(-600)}`);
}

// ---- the plan's entry for this extract, and the airports to build
const plan = JSON.parse(readFileSync(resolve(opt.plan), 'utf8'));
const entry = (plan.extracts || []).find((x) => x.id === opt.id);
if (!entry) die(`no extract ${opt.id} in ${opt.plan}`);
const rows = JSON.parse(readFileSync(join(SITE, 'tools', 'maps', 'airports.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
const report = { id: opt.id, pbf: opt.pbf, built: [], skipped: [], failed: [], seconds: {} };
const t0 = Date.now();

// The airports: their boxes (the same queries as the robot's), and where their layout and surroundings are gathered.
const AP = [];
for (const { icao, rank } of entry.airports) {
  if (ONLY && !ONLY.has(icao)) continue;
  if (!opt.overwrite && mapExists(OUT, icao)) { report.skipped.push([icao, 'has a map']); continue; }
  const row = rows[icao];
  if (!row) { report.failed.push([icao, 'not in airports.json']); continue; }
  const [code, iata, name, city, country, lat, lon, elevFt, kind] = row.a;
  const info = { icao: code, iata, name, city, country, lat, lon, elev: elevFt, kind };
  const elevM = (elevFt || 0) * 0.3048;
  const layout = bboxOfQuery(overpassQuery(lat, lon, fetchRadius(info, row.rw)), 'first');
  const near = bboxOfQuery(surroundQuery(lat, lon, NEAR_M, elevM), 'first');
  const far = bboxOfQuery(surroundQuery(lat, lon, FAR_M, elevM), 'last');
  AP.push({
    icao, rank, info, rw: row.rw, lat, lon, elevFt, elevM, minEle: Math.round(elevM + 900),
    layout, near, far, layoutEls: new Map(), sur: [], peaks: [], areas: [], areaBox: EMPTY, areaPolys: [],
  });
}
if (!AP.length) { log(`${opt.id}: no airports to build`); finish(); }
log(`${opt.id}: ${AP.length} airports, ${entry.airports.length - AP.length} skipped`);

// The grid: each airport is listed in every cell its far box touches (the far box holds all the others).
const grid = new Map();
const cellsOf = (b) => {
  const out = [];
  for (let x = Math.floor(b.w / CELL); x <= Math.floor(b.e / CELL); x++) for (let y = Math.floor(b.s / CELL); y <= Math.floor(b.n / CELL); y++) out.push(`${x},${y}`);
  return out;
};
AP.forEach((a, i) => { for (const k of cellsOf(a.far)) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
function nearAirports(b) { // the airports whose far box may touch this box
  const cells = cellsOf(b);
  if (cells.length > MAX_CELLS) return AP.map((_, i) => i);
  const hit = new Set();
  for (const k of cells) for (const i of grid.get(k) || []) hit.add(i);
  return hit;
}

// ---- the relations' member lists (osmium's OPL: the roles are the relation's own)
async function readRelations(path) {
  const rels = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  const unesc = (s) => s.replace(/%([0-9a-fA-F]{2})%/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  for await (const line of rl) {
    if (line[0] !== 'r') continue;
    const tags = {};
    const members = [];
    for (const t of line.split(' ')) {
      if (t[0] === 'T' && t.length > 1) {
        for (const kv of t.slice(1).split(',')) { const i = kv.indexOf('='); if (i > 0) tags[unesc(kv.slice(0, i))] = unesc(kv.slice(i + 1)); }
      } else if (t[0] === 'M' && t.length > 1) {
        for (const mem of t.slice(1).split(',')) {
          if (mem[0] !== 'w') continue; // ways only: the outlines (nodes and relations are not in these shapes)
          const at = mem.indexOf('@');
          members.push({ id: +(at < 0 ? mem.slice(1) : mem.slice(1, at)), role: at < 0 ? '' : unesc(mem.slice(at + 1)) });
        }
      }
    }
    if (!(LAYOUT_REL.has(tags.aeroway) || tags.natural === 'water')) continue;
    rels.push({ id: +line.slice(1, line.indexOf(' ')), tags, members });
  }
  return rels;
}

// the features of an extract, as osmium writes them: one GeoJSON feature per line, after a record separator
async function* features(file) {
  const child = spawn('osmium', ['export', '-n', '-f', 'geojsonseq', '-u', 'type_id', '--no-progress', '-o', '-', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    const m = /^\x1e?\{"type":"Feature","id":"([nwa])(\d+)"/.exec(line);
    if (!m) continue;
    yield { kind: m[1], id: +m[2], line };
  }
  const code = await new Promise((res) => child.on('close', res));
  if (code !== 0) throw new Error(`osmium export failed (${code}): ${err.slice(-600)}`);
}
const parseFeature = (line) => JSON.parse(line.charCodeAt(0) === 30 ? line.slice(1) : line);

// ---- the run
async function main() {
  mkdirSync(WORK, { recursive: true });
  const P = (n) => join(WORK, n);
  writeFileSync(P('filter.txt'), FILTER);
  writeFileSync(P('relations.txt'), RELATIONS);
  writeFileSync(P('aerodromes.txt'), AERODROMES);
  let s = Date.now();
  osmium(['tags-filter', '--overwrite', '-e', P('filter.txt'), '-o', P('filtered.osm.pbf'), opt.pbf], 'tags-filter');
  report.seconds.filter = (Date.now() - s) / 1000;

  // 1. the relations and their member lists (OPL: small)
  s = Date.now();
  osmium(['tags-filter', '--overwrite', '-R', '-e', P('relations.txt'), '-o', P('relations.osm.pbf'), P('filtered.osm.pbf')], 'relations');
  osmium(['cat', '--overwrite', '-f', 'opl', '-o', P('relations.opl'), P('relations.osm.pbf')], 'cat opl');
  const rels = await readRelations(P('relations.opl'));
  const memberIds = new Set(rels.flatMap((r) => r.members.map((m) => m.id)));
  log(`${opt.id}: ${rels.length} relations (aerodrome, apron, terminal, water), ${memberIds.size} member ways`);

  // 2. the aerodrome areas (the buildings inside them are the layout's buildings). Small: its own extract.
  s = Date.now();
  osmium(['tags-filter', '--overwrite', '-e', P('aerodromes.txt'), '-o', P('aerodromes.osm.pbf'), P('filtered.osm.pbf')], 'aerodromes');
  osmium(['export', '-n', '-f', 'geojsonseq', '-u', 'type_id', '--overwrite', '-o', P('aerodromes.geojsonseq'), P('aerodromes.osm.pbf')], 'export aerodromes');
  const areas = [];
  const aeroRl = createInterface({ input: createReadStream(P('aerodromes.geojsonseq')), crlfDelay: Infinity });
  for await (const line of aeroRl) {
    const m = /^\x1e?\{"type":"Feature","id":"([wa])(\d+)"/.exec(line);
    if (!m) continue;
    const f = parseFeature(line);
    const g = f.geometry;
    let polys;
    if (m[1] === 'w' && f.properties && f.properties.aeroway === 'aerodrome' && g.type === 'LineString') polys = [[g.coordinates]];
    else if (m[1] === 'a' && (+m[2]) % 2 === 1) polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    else continue;
    const b = boxOf(polys.flat(2).map((c) => ({ lat: c[1], lon: c[0] }))); // a loop, not a spread: a long outline has many points
    areas.push({ polys, box: b });
  }
  for (const ar of areas) {
    for (const i of nearAirports(ar.box)) {
      const a = AP[i];
      if (!boxHit(a.layout, ar.box)) continue;
      a.areaPolys.push(...ar.polys);
      a.areaBox = boxUnion(a.areaBox, ar.box);
    }
  }
  report.seconds.aerodromes = (Date.now() - s) / 1000;
  log(`${opt.id}: ${areas.length} aerodrome areas, ${AP.filter((a) => a.areaPolys.length).length} airports with one`);

  // 3. the extract's features, once: the layout, the surroundings, the peaks, and the member ways of the relations
  s = Date.now();
  const memberGeom = new Map();
  let seen = 0;
  for await (const { kind, id, line } of features(P('filtered.osm.pbf'))) {
    if (kind === 'a') continue; // areas are handled above, and the relations are handled after the loop
    if (kind === 'n' && line.endsWith('"properties":{}}')) continue; // untagged nodes: the ways have their own geometry
    if (kind === 'w' && line.endsWith('"properties":{}}') && !memberIds.has(id)) continue;
    seen++;
    const f = parseFeature(line);
    const tags = f.properties || {};
    const g = f.geometry;
    if (kind === 'n') {
      const lat = g.coordinates[1], lon = g.coordinates[0];
      const pt = { s: lat, n: lat, w: lon, e: lon };
      if (tags.natural === 'peak' && tags.ele != null) {
        const e = parseFloat(String(tags.ele).replace(',', '.'));
        if (Number.isFinite(e)) {
          for (const i of nearAirports(pt)) {
            const a = AP[i];
            if (e > a.minEle && boxHasPt(a.far, lat, lon)) a.peaks.push({ e, el: { type: 'node', id, lat, lon, tags } });
          }
        }
      }
      if (LAYOUT_NODE.has(tags.aeroway)) {
        for (const i of nearAirports(pt)) if (boxHasPt(AP[i].layout, lat, lon)) AP[i].layoutEls.set(`node${id}`, { type: 'node', id, lat, lon, tags });
      }
      continue;
    }
    // ways (a closed way that is an area still has its line here)
    const geom = ring(g.type === 'Polygon' ? g.coordinates[0] : g.coordinates);
    const bb = boxOf(geom);
    if (memberIds.has(id) && !memberGeom.has(id)) {
      for (const i of nearAirports(bb)) if (boxHit(AP[i].far, bb)) { memberGeom.set(id, geom); break; }
    }
    if (!Object.keys(tags).length) continue;
    const aer = tags.aeroway;
    if ((aer && (LAYOUT_WAY.has(aer) || aer === 'aerodrome')) || tags.building === 'terminal') {
      for (const i of nearAirports(bb)) if (boxHit(AP[i].layout, bb)) AP[i].layoutEls.set(`way${id}`, { type: 'way', id, tags, geometry: geom });
    }
    if (tags.building && !LAYOUT_WAY.has(aer)) {
      for (const i of nearAirports(bb)) {
        const a = AP[i];
        if (a.areaPolys.length && boxHit(a.areaBox, bb) && geom.some((p) => inPolys(a.areaPolys, p.lon, p.lat))) a.layoutEls.set(`way${id}`, { type: 'way', id, tags, geometry: geom });
      }
    }
    const isWater = tags.natural === 'water' && !SKIP_WATER.has(tags.water);
    if (tags.natural === 'coastline' || isWater || tags.waterway === 'riverbank') {
      for (const i of nearAirports(bb)) if (boxHit(AP[i].near, bb)) AP[i].sur.push({ type: 'way', id, tags, geometry: geom });
    }
  }
  report.seconds.features = (Date.now() - s) / 1000;
  log(`${opt.id}: ${seen} features read, ${memberGeom.size} member ways kept`);

  // 4. relations: the layout's (aerodrome, apron, terminal) and the water relations, with their members' geometry
  for (const r of rels) {
    const members = r.members.filter((m) => memberGeom.has(m.id)).map((m) => ({ type: 'way', role: m.role, geometry: memberGeom.get(m.id) }));
    if (!members.length) continue;
    const rb = members.reduce((b, m) => boxUnion(b, boxOf(m.geometry)), EMPTY);
    const el = { type: 'relation', id: r.id, tags: r.tags, members };
    for (const i of nearAirports(rb)) {
      const a = AP[i];
      if (LAYOUT_REL.has(r.tags.aeroway) && boxHit(a.layout, rb)) a.layoutEls.set(`relation${r.id}`, el);
      // the query's water relations leave out the same small water as its ways (SKIP_WATER: moats, ponds, basins ...)
      if (r.tags.natural === 'water' && !SKIP_WATER.has(r.tags.water) && boxHit(a.near, rb)) a.sur.push(el);
    }
  }

  // 5. each airport: the game's builders on what was gathered, and the map files
  s = Date.now();
  for (const a of AP) {
    const t = Date.now();
    try {
      const built = buildOne(a);
      if (built.skip) { report.failed.push([a.icao, built.skip]); continue; }
      const bytes = writeMap(OUT, a.icao, built.text, a.rank);
      report.built.push({ icao: a.icao, rank: a.rank, bytes, ms: Date.now() - t, ...built.stats });
      log(`+ ${a.icao} ${(bytes / 1024).toFixed(0)} KB, ${built.stats.runways} runways, ${built.stats.coast} coast, ${built.stats.water} water, ${built.stats.peaks} peaks`);
    } catch (e) {
      report.failed.push([a.icao, `build: ${e.message}`]);
      log(`- ${a.icao}: ${e.message}`);
    }
  }
  report.seconds.build = (Date.now() - s) / 1000;
}

// The airport's map text: buildLayout on the layout as the robot makes it (the compact round trip), then the surroundings.
function buildOne(a) {
  const els = [...a.layoutEls.values()].sort((x, y) => ORDER[x.type] - ORDER[y.type] || x.id - y.id);
  if (!els.some((e) => e.tags && e.tags.aeroway === 'runway')) return { skip: 'no runways in the extract' };
  const compactLayout = compactOsm({ elements: els });
  const L = buildLayout(a.info, a.rw, expandCompact(compactLayout));
  const halfM = surroundHalfSize(L);
  const bb = bboxOfQuery(surroundQuery(a.lat, a.lon, halfM, a.elevM), 'first');
  const sur = [];
  for (const el of a.sur) {
    if (el.type === 'way') {
      const t = el.tags;
      if (t.natural !== 'coastline' && !(t.natural === 'water' || t.waterway === 'riverbank')) continue;
      if (t.natural !== 'coastline' && lengthM(el.geometry) <= 600) continue; // the query's (if: length() > 600)
      const g = clipLine(el.geometry, bb.s, bb.w, bb.n, bb.e);
      if (!hasPiece(g)) continue;
      sur.push({ ...el, geometry: g });
    } else {
      if (el.members.reduce((sum, m) => sum + lengthM(m.geometry), 0) <= 600) continue;
      const members = el.members.map((m) => ({ ...m, geometry: clipLine(m.geometry, bb.s, bb.w, bb.n, bb.e) })).filter((m) => hasPiece(m.geometry));
      if (members.length) sur.push({ ...el, members });
    }
  }
  const peaks = a.peaks.filter((p) => p.e > a.minEle).sort((x, y) => y.e - x.e).slice(0, PEAKS_KEPT).map((p) => p.el);
  const s = compactSurroundings({ elements: [...sur, ...peaks] }, a.lat, a.lon);
  const out = compactLayout;
  out.s = s;
  const count = (f) => L[f].length;
  return {
    text: JSON.stringify(out),
    stats: {
      layoutElements: els.length, runways: count('runways'), taxiways: count('taxiways'), aprons: count('aprons'),
      terminals: count('terminals'), hangars: count('hangars'), buildings: count('buildings'), gates: count('gates'),
      coast: s.coast.length, water: s.water.length, peaks: s.peaks.length, halfM,
    },
  };
}

function finish() {
  report.seconds.total = (Date.now() - t0) / 1000;
  const built = report.built.length;
  log(`${opt.id}: built ${built}, skipped ${report.skipped.length}, failed ${report.failed.length}, in ${report.seconds.total.toFixed(0)} s`);
  if (opt.report) writeFileSync(resolve(opt.report), JSON.stringify(report, null, 1) + '\n');
  if (!opt.keep && WORK.startsWith(tmpdir())) rmSync(WORK, { recursive: true, force: true });
  process.exit(0);
}

await main();
finish();
