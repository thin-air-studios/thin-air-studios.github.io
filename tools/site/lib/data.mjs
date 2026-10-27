// The data every page reads, loaded once per build. Sources (copied into site-src/data by hand, from the game repository):
//   airports.json  game/data/airports.json   OurAirports rows: [icao, iata, name, city, country, lat, lon, elevationFt, kind, longestRunwayFt]
//   rw/<shard>.json  game/data/rw             runways by ICAO, sharded by the first character of the code
//   busiest.json   game/js/airportdb.js BUSIEST   ACI World 2025 passengers, the game's top 50
//   countries.json (generated once from the airport rows; see the file)
// Maps are read from the repository's osm/ folder (made by the map robot); this build only reads it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const SIZE_LABEL = { L: 'Large', M: 'Medium', S: 'Small' };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function toAirport(row) {
  return {
    icao: row[0],
    iata: row[1] || '',
    name: row[2] || '',
    city: row[3] || '',
    country: row[4] || '',
    lat: row[5],
    lon: row[6],
    elevationFt: row[7],
    kind: row[8],
    sizeLabel: SIZE_LABEL[row[8]] || '',
    longestRunwayFt: row[9] || 0,
  };
}

/** The map files the robot made: osm/<ICAO>.json.gz or osm/<ICAO>.json. Returns Map icao -> true. */
export function listMaps(root) {
  const dir = path.join(root, 'osm');
  const maps = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = /^([A-Z0-9]{3,4})\.json(\.gz)?$/.exec(f);
    if (m) maps.set(m[1], true);
  }
  return maps;
}

/** One airport's map as the robot saved it (the compact form: {v, at, e, s}). null when there is none. */
export function readMap(root, icao) {
  const gz = path.join(root, 'osm', `${icao}.json.gz`);
  const plain = path.join(root, 'osm', `${icao}.json`);
  if (fs.existsSync(gz)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
  if (fs.existsSync(plain)) return readJson(plain);
  return null;
}

export function loadData(root, src) {
  const rows = readJson(path.join(src, 'data', 'airports.json'));
  const counts = new Map();
  for (const r of rows) counts.set(r[0], (counts.get(r[0]) || 0) + 1);
  const byIcao = new Map();
  for (const r of rows) {
    if (!byIcao.has(r[0])) byIcao.set(r[0], toAirport(r));
  }
  // An ICAO code used by more than one row is ambiguous: no airport page is made for it (the search still lists every row).
  const ambiguous = new Set([...counts].filter(([, n]) => n > 1).map(([code]) => code));
  const maps = listMaps(root);
  const mapped = [...byIcao.values()]
    .filter((a) => maps.has(a.icao) && !ambiguous.has(a.icao))
    .sort((a, b) => a.icao.localeCompare(b.icao));
  const busiestFile = readJson(path.join(src, 'data', 'busiest.json'));
  const busiest = new Map(busiestFile.rows.map((r) => [r.icao, r]));
  const countryNames = readJson(path.join(src, 'data', 'countries.json')).names;
  const shardCache = new Map();

  return {
    rows,
    airports: byIcao,
    rowCount: rows.length,
    ambiguous: [...ambiguous].sort(),
    mapped,
    mappedSet: new Set(mapped.map((a) => a.icao)),
    maps,
    busiest,
    busiestRows: busiestFile.rows,
    busiestSource: busiestFile.source,
    countryNames,
    countryName: (code) => countryNames[code] || code,
    isIcao: (code) => byIcao.has(code) && !ambiguous.has(code),
    /** The runways of one airport: [le, he, lengthFt, widthFt, surface H/S/?, lighted, le_lat, le_lon, he_lat, he_lon, ldgHdgDegT]. */
    runways(icao) {
      const key = /^[A-Z0-9]/.test(icao[0]) ? icao[0] : '_';
      if (!shardCache.has(key)) {
        const file = path.join(src, 'data', 'rw', `${key}.json`);
        shardCache.set(key, fs.existsSync(file) ? readJson(file) : {});
      }
      return shardCache.get(key)[icao] || [];
    },
  };
}
