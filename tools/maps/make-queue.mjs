// Makes the map robot's inputs from the game's data (holding-pattern, game/data and game/js):
//   tools/maps/queue.txt      the ICAO codes to fetch, one per line, in priority order
//   tools/maps/airports.json  what the robot needs for each of them (the airport row and its OurAirports runways)
//   tools/maps/game/*.js      copies of the game's geometry modules the robot runs (same query, same compact form)
// Run it when the game's data or geometry changes:  node tools/maps/make-queue.mjs /path/to/holding-pattern/game
//
// The queue is the airports with a hard-surface runway of at least 1,500 m (4,921 ft), or the game's BUSIEST list. Order:
// BUSIEST first (the game's own order), then the airports with an IATA code, then the rest; inside the last two groups,
// the longest hard runway first, then the ICAO code.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const game = process.argv[2];
if (!game || !existsSync(join(game, 'data', 'airports.json'))) {
  console.error('usage: node tools/maps/make-queue.mjs <path to holding-pattern/game>');
  process.exit(2);
}
const MIN_HARD_FT = 4921; // 1,500 m
const GAME_MODULES = ['airport.js', 'config.js', 'geo.js', 'scenery.js', 'util.js'];

const rows = JSON.parse(readFileSync(join(game, 'data', 'airports.json'), 'utf8'));
const oa = {};
const rwDir = join(game, 'data', 'rw');
for (const f of readdirSync(rwDir).filter((f) => f.endsWith('.json'))) Object.assign(oa, JSON.parse(readFileSync(join(rwDir, f), 'utf8')));
const { BUSIEST } = await import(pathToFileURL(join(game, 'js', 'airportdb.js')).href);

// one row per ICAO code (the first), as the game reads them
const byIcao = new Map();
for (const r of rows) if (!byIcao.has(r[0])) byIcao.set(r[0], r);

// the longest runway with a hard surface (OurAirports surface code H), in feet; 0 when there is none
const longestHard = (icao) => Math.max(0, ...(oa[icao] || []).filter((r) => r[4] === 'H').map((r) => r[2]));

const busiest = BUSIEST.map((b) => b[0]).filter((c) => byIcao.has(c));
const chosen = [...byIcao.values()].filter((r) => longestHard(r[0]) >= MIN_HARD_FT || busiest.includes(r[0]));

const group = (r) => (busiest.includes(r[0]) ? 0 : r[1] ? 1 : 2);
chosen.sort((a, b) => {
  if (group(a) !== group(b)) return group(a) - group(b);
  if (group(a) === 0) return busiest.indexOf(a[0]) - busiest.indexOf(b[0]);
  return longestHard(b[0]) - longestHard(a[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
});

writeFileSync(join(here, 'queue.txt'), chosen.map((r) => r[0]).join('\n') + '\n');
const data = {};
for (const r of chosen) data[r[0]] = { a: r, rw: oa[r[0]] || [] };
writeFileSync(join(here, 'airports.json'), JSON.stringify(data));

mkdirSync(join(here, 'game'), { recursive: true });
// copies of the game's geometry modules; config.js without the online boards' address (the robot never needs it, and the site is public)
for (const m of GAME_MODULES) {
  let text = readFileSync(join(game, 'js', m), 'utf8');
  if (m === 'config.js') text = text.replace(/\n\/\/ The online boards \(server\/\)\.[\s\S]*?export const BOARDS = [^\n]*\n/, '\n');
  writeFileSync(join(here, 'game', m), text);
}

const hard = chosen.filter((r) => longestHard(r[0]) >= MIN_HARD_FT).length;
console.log(`queue: ${chosen.length} airports (${hard} with a hard runway of 1,500 m or more, ${busiest.length} BUSIEST, ${chosen.filter((r) => group(r) === 1).length} with an IATA code)`);
