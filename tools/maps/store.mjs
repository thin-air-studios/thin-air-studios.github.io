// The airport maps the site keeps (osm/) and the compact form they are in. Shared by the map robot (fetch.mjs) and the
// bulk builder (bulk/extract.mjs), so both write the same files.
//   osm/<ICAO>.json.gz  every map. The 3.0 game reads this form first.
//   osm/<ICAO>.json     the plain form, only for the busiest airports: the queue's first PLAIN_RANK entries. The 2.7 to 2.9
//                       games read only this form, and it is the bigger of the two (about 4 times the gzip size).
// The compact form is the game's own (game/js/airportdata.js compactOsm and expandCompact); keep the two in step.
// Run with "gzip" to add the .json.gz form to every plain map that lacks one:  node tools/maps/store.mjs gzip [osm dir]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
// the queue's first PLAIN_RANK airports (busiest first) also keep the plain file: about 250 to 300 MB of plain maps,
// on top of about 300 MB of gzip maps for the whole queue, inside GitHub Pages' 1 GB site limit
export const PLAIN_RANK = 1200;
const KEEP_TAGS = ['aeroway', 'ref', 'surface', 'width', 'runway', 'building', 'area'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const flat = (geom) => geom.filter(Boolean).flatMap((g) => [r6(g.lat), r6(g.lon)]);

/** The robot's queue: ICAO codes in priority order, one per line; a line that is not a 4-character code is skipped. */
export function loadQueue(path) {
  return readFileSync(path, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{4}$/.test(s));
}

/** Overpass-shaped elements to the compact form (what the game's airportdata.js compactOsm makes). */
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

/** The compact form back to Overpass shape (the game's expandCompact). */
export function expandCompact(c) {
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

/** True when the airport has a map in either form. */
export function mapExists(osmDir, icao) {
  return existsSync(join(osmDir, `${icao}.json`)) || existsSync(join(osmDir, `${icao}.json.gz`));
}

/**
 * Writes the airport's map: the gzip form always, the plain form when the airport's queue rank is below PLAIN_RANK.
 * Returns the bytes written.
 */
export function writeMap(osmDir, icao, text, rank) {
  const gz = gzipSync(Buffer.from(text), { level: 9 });
  writeFileSync(join(osmDir, `${icao}.json.gz`), gz);
  let bytes = gz.length;
  if (rank < PLAIN_RANK) {
    writeFileSync(join(osmDir, `${icao}.json`), text);
    bytes += Buffer.byteLength(text);
  }
  return bytes;
}

/** Adds the gzip form to every plain map that lacks one (maps made before the .json.gz form). Returns the count. */
export function gzipMissing(osmDir) {
  let n = 0;
  for (const name of readdirSync(osmDir)) {
    if (!name.endsWith('.json')) continue;
    const gz = join(osmDir, `${name}.gz`);
    if (existsSync(gz)) continue;
    writeFileSync(gz, gzipSync(readFileSync(join(osmDir, name)), { level: 9 }));
    n++;
  }
  return n;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'gzip') {
    console.error('usage: node tools/maps/store.mjs gzip');
    process.exit(2);
  }
  const n = gzipMissing(resolve(process.argv[3] || join(here, '..', '..', 'osm')));
  console.log(`gzip: ${n} maps given a .json.gz form`);
}
