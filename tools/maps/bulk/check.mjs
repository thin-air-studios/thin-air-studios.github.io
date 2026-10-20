// Compares maps the bulk builder made with the maps the site already has (osm/): the same airports, element by element.
// For each airport it prints the element counts, the ids found on one side only, the largest coordinate difference in
// metres for the shared elements (nodes and ways, and each relation member), whether the relation members have the same
// roles in the same order, and the surroundings (coast, water, peaks). Use it to prove a builder against the robot's output.
//
// usage: node tools/maps/bulk/check.mjs <built dir> [ICAO ...]    (compares with osm/ in this site; no ICAO: all in the built dir)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandCompact } from '../store.mjs';
import { haversine } from '../game/geo.js';

const here = dirname(fileURLToPath(import.meta.url));
const OSM = resolve(here, '..', '..', '..', 'osm');
const built = resolve(process.argv[2] || '.');
const load = (dir, icao) => JSON.parse(readFileSync(join(dir, `${icao}.json`), 'utf8'));
const icaos = process.argv.length > 3 ? process.argv.slice(3) : readdirSync(built).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

const dist = (p, q) => haversine(p.lat, p.lon, q.lat, q.lon);
const id = (el) => `${el.type[0]}${el.id}`;
function pathDiff(a, b) { // largest distance between corresponding points, or null if the point counts differ
  if (a.length !== b.length) return null;
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, dist(a[i], b[i]));
  return m;
}
const pts = (els) => els.reduce((s, c) => s + c.length / 2, 0);

const rows = [];
for (const icao of icaos) {
  const ref = join(OSM, `${icao}.json`);
  if (!existsSync(ref)) { rows.push({ icao, note: 'no existing map to compare' }); continue; }
  const A = expandCompact(load(OSM, icao)), B = expandCompact(load(built, icao));
  const ia = new Map(A.elements.map((e) => [id(e), e])), ib = new Map(B.elements.map((e) => [id(e), e]));
  const shared = [...ia.keys()].filter((k) => ib.has(k));
  const onlyA = [...ia.keys()].filter((k) => !ib.has(k)), onlyB = [...ib.keys()].filter((k) => !ia.has(k));
  let worstM = 0, tagDiff = 0, roleDiff = 0, memberMissing = 0, lenDiff = 0;
  for (const k of shared) {
    const a = ia.get(k), b = ib.get(k);
    if (JSON.stringify(a.tags || {}) !== JSON.stringify(b.tags || {})) tagDiff++;
    if (a.type === 'node') { worstM = Math.max(worstM, dist(a, b)); continue; }
    if (a.type === 'way') { const d = pathDiff(a.geometry, b.geometry); if (d === null) lenDiff++; else worstM = Math.max(worstM, d); continue; }
    const ra = a.members.map((m) => m.role).join('|'), rb = b.members.map((m) => m.role).join('|');
    if (ra !== rb) roleDiff++;
    if (a.members.length !== b.members.length) memberMissing++;
    for (let i = 0; i < Math.min(a.members.length, b.members.length); i++) {
      const d = pathDiff(a.members[i].geometry, b.members[i].geometry);
      if (d === null) lenDiff++; else worstM = Math.max(worstM, d);
    }
  }
  const cnt = (els) => ({ n: els.filter((e) => e.type === 'node').length, w: els.filter((e) => e.type === 'way').length, r: els.filter((e) => e.type === 'relation').length });
  const sa = load(OSM, icao).s || {}, sb = load(built, icao).s || {};
  const peakKey = (p) => `${p[0]},${p[1]}`;
  const peaksA = new Set((sa.peaks || []).map(peakKey)), peaksB = new Set((sb.peaks || []).map(peakKey));
  rows.push({
    icao,
    ref: cnt(A.elements), built: cnt(B.elements),
    shared: shared.length, onlyRef: onlyA.length, onlyBuilt: onlyB.length, onlyRefSample: onlyA.slice(0, 4), onlyBuiltSample: onlyB.slice(0, 4),
    worstM: +worstM.toFixed(2), tagDiff, roleDiff, memberCountDiff: memberMissing, lengthDiff: lenDiff,
    coast: [(sa.coast || []).length, (sb.coast || []).length], water: [(sa.water || []).length, (sb.water || []).length],
    waterPts: [pts(sa.water || []), pts(sb.water || [])], coastPts: [pts(sa.coast || []), pts(sb.coast || [])],
    peaks: [peaksA.size, peaksB.size], peaksShared: [...peaksA].filter((p) => peaksB.has(p)).length,
  });
}
for (const r of rows) {
  if (r.note) { console.log(`${r.icao}: ${r.note}`); continue; }
  const c = (x) => `${x.n}n ${x.w}w ${x.r}r`;
  console.log(`${r.icao}: ref ${c(r.ref)} | built ${c(r.built)} | shared ${r.shared}, only ref ${r.onlyRef}, only built ${r.onlyBuilt}`);
  console.log(`   worst coordinate difference ${r.worstM} m; tag differences ${r.tagDiff}; relations with other roles ${r.roleDiff}; member count differences ${r.memberCountDiff}; path-length differences ${r.lengthDiff}`);
  console.log(`   surroundings: coast ${r.coast.join('/')} (points ${r.coastPts.join('/')}), water ${r.water.join('/')} (points ${r.waterPts.join('/')}), peaks ${r.peaks.join('/')} (shared ${r.peaksShared})`);
  if (r.onlyRef) console.log(`   only in ref: ${r.onlyRefSample.join(' ')}`);
  if (r.onlyBuilt) console.log(`   only in built: ${r.onlyBuiltSample.join(' ')}`);
}
