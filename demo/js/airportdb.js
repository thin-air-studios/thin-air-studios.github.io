import { assetUrl } from './flavor.js?v=2f66fd5f';
// Offline airport database (trimmed OurAirports, public domain): search + runway lookup.
import { haversine } from './geo.js?v=2f66fd5f';
import { ARRIVAL } from './arrivals.js?v=2f66fd5f';

let loader = async (path) => {
  const r = await fetch(assetUrl(path));
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
/** Tests swap in a file-system loader. */
export function setLoader(fn) {
  loader = fn;
}

let airports = null;
let byIdent = null;
const shards = new Map();

/**
 * The city as the game says it: the bundled list's city without its bracketed part ("Paris (Roissy-en-France, Val-d'Oise)" is
 * "Paris", "Chengdu (Jianyang)" is "Chengdu"). The Play line, the home rows and the arrival note all use it.
 */
export const cityName = (city) => String(city || '').replace(/\s*\(.*$/, '').trim();

export const FEATURED = ['KDFW', 'KMAF', 'EGLL', 'KATL'];


/** Today's famous airport (changes at local midnight). */
/** Days since 1970 in local time: the daily airport and the daily challenge change at local midnight. */
export function localDay(now = new Date()) {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

/** Today's airport, one of the 50 busiest in turn: [code, passengers (millions), rank]. */
export function todaysAirport(now = new Date()) {
  const i = localDay(now) % BUSIEST.length;
  return [...BUSIEST[i], i + 1];
}

/** The local day the daily challenge's numbering starts from: Daily #1 was 8 Oct 2026. The streak's seed uses it too (streak.js). */
export const DAILY_EPOCH = 20733;

/** The daily challenge's number ("Daily #1" was 8 Oct 2026). */
export const dailyNumber = (now = new Date()) => localDay(now) - DAILY_EPOCH;

/**
 * Today's airport ([code, passengers, rank]) and the daily number, read from one clock reading. Every screen reads the daily
 * airport and number through this, so a local-midnight rollover cannot pair one day's airport with the next day's number.
 */
export function todaysDaily(now = new Date()) {
  return { airport: todaysAirport(now), n: dailyNumber(now) };
}

/** The world's 50 busiest airports by passengers (ACI World, 2025 results), millions. */
export const BUSIEST = [
  ['KATL', 106.3], ['OMDB', 95.2], ['RJTT', 91.7], ['KDFW', 85.7], ['ZSPD', 85.0],
  ['KORD', 84.9], ['EGLL', 84.5], ['LTFM', 84.4], ['ZGGG', 83.6], ['KDEN', 82.4],
  ['VIDP', 78.1], ['RKSI', 74.1], ['KLAX', 73.7], ['LFPG', 72.0], ['ZBAA', 70.7],
  ['WSSS', 70.0], ['EHAM', 68.8], ['LEMD', 68.1], ['ZGSZ', 66.5], ['WMKK', 63.4],
  ['EDDF', 63.2], ['VTBS', 62.9], ['KJFK', 62.6], ['VHHH', 61.0], ['KMCO', 57.7],
  ['LEBL', 57.5], ['ZUTF', 56.7], ['VABB', 55.5], ['KMIA', 55.3], ['KLAS', 55.0],
  ['WIII', 55.0], ['KSFO', 54.5], ['OTHH', 54.3], ['ZBAD', 53.6], ['KCLT', 53.6],
  ['OEJN', 53.4], ['KSEA', 52.7], ['RPLL', 52.0], ['KPHX', 51.6], ['LIRF', 50.9],
  ['ZSHC', 50.5], ['ZSSS', 50.2], ['ZUCK', 50.1], ['ZPPP', 49.7], ['ZLXY', 48.5],
  ['LTFJ', 48.4], ['KIAH', 48.1], ['RCTP', 47.8], ['CYYZ', 47.3], ['SBGR', 47.2],
];

/**
 * The busyness Play now draws from, by skill level: the BUSIEST ranks (1 is the busiest). Beginner and Easy get the quieter
 * big airports, Hard and Chaos the hubs (requirements 2.2 item G).
 */
export const PLAY_BANDS = { beginner: [31, 50], easy: [21, 40], normal: [11, 30], hard: [1, 20], chaos: [1, 10] };

/**
 * A random airport's code for Play now, in the level's band. Never `last` (the airport played last) when another airport is in
 * the band. rand is Math.random unless a test passes its own.
 */
export function playNowCode(diff, last = '', rand = Math.random) {
  const [lo, hi] = PLAY_BANDS[diff] || PLAY_BANDS.normal;
  const codes = BUSIEST.slice(lo - 1, hi).map((a) => a[0]);
  const others = codes.filter((c) => c !== last);
  const pool = others.length ? others : codes;
  return pool[Math.floor(rand() * pool.length)];
}

function toInfo(a) {
  return {
    icao: a[0], iata: a[1], name: a[2], city: a[3], country: a[4],
    lat: a[5], lon: a[6], elev: a[7], kind: a[8], maxRunwayFt: a[9],
  };
}

let loading = null;
export async function loadAirports() {
  if (airports) return airports;
  if (!loading) loading = loader('data/airports.json');
  const rows = await loading;
  if (airports) return airports;
  airports = rows;
  byIdent = new Map();
  for (const a of rows) {
    if (!byIdent.has(a[0])) byIdent.set(a[0], a);
    if (a[1] && !byIdent.has('IATA:' + a[1])) byIdent.set('IATA:' + a[1], a);
  }
  return rows;
}

export async function getAirport(code) {
  await loadAirports();
  const c = code.trim().toUpperCase();
  const a = byIdent.get(c) || byIdent.get('IATA:' + c);
  return a ? toInfo(a) : null;
}

/** getAirport without the wait: null until the list has loaded (routes.js reads it when a plane lands). */
export function airportNow(code) {
  if (!byIdent) return null;
  const c = String(code || '').trim().toUpperCase();
  const a = byIdent.get(c) || byIdent.get('IATA:' + c);
  return a ? toInfo(a) : null;
}

/**
 * The large and medium airports as infos, for the search's "Near you" shortcut (searchkeys.js nearYou). [] until the list has loaded.
 * Built once, from the same rows as the search.
 */
let largeList = null;
export function largeFields() {
  if (!airports) return [];
  if (!largeList) largeList = airports.filter((a) => a[8] === 'L' || a[8] === 'M').map(toInfo);
  return largeList;
}

/**
 * The airports near `info` that a real flight could be heading for instead of this one (arrivals.js):
 * large and medium fields, and small ones with a runway of 3,000 ft or more, within nearbyKm.
 * Synchronous: [] until the database has loaded.
 */
export function nearbyFields(info) {
  if (!airports || !info) return [];
  const out = [];
  for (const a of airports) {
    if (a[0] === info.icao) continue;
    if (!(a[8] === 'L' || a[8] === 'M' || (a[8] === 'S' && (a[9] || 0) >= ARRIVAL.nearbyRunwayFt))) continue;
    if (Math.abs(a[5] - info.lat) > 3) continue; // quick reject: 3 degrees of latitude is about 330 km
    if (haversine(info.lat, info.lon, a[5], a[6]) <= ARRIVAL.nearbyKm * 1000) out.push({ lat: a[5], lon: a[6], icao: a[0], iata: a[1] || '', name: a[2] || '', city: a[3] || '' });
  }
  return out;
}

export async function getRunways(icao) {
  const key = /^[A-Z0-9]/.test(icao[0]) ? icao[0] : '_';
  if (!shards.has(key)) shards.set(key, await loader(`data/rw/${key}.json`));
  return shards.get(key)[icao] || [];
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Ranked search by ICAO, IATA, name or city. */
export async function search(query, limit = 30) {
  await loadAirports();
  const q = fold(query.trim());
  if (!q) return [];
  const kindBoost = { L: 0, M: 1, S: 2 };
  const scored = [];
  for (const a of airports) {
    let s = 99;
    const icao = a[0], iata = a[1];
    if (icao === q || iata === q) s = 0;
    else if (q.length >= 2 && (icao.startsWith(q) || (iata && iata.startsWith(q)))) s = 2;
    else if (q.length >= 3) {
      const name = fold(a[2]), city = fold(a[3]);
      if (city === q) s = 3;
      else if (city.startsWith(q) || name.startsWith(q)) s = 4;
      else if (name.includes(' ' + q) || city.includes(' ' + q)) s = 5;
      else if (name.includes(q) || city.includes(q)) s = 6;
    }
    if (s < 99) scored.push([s * 2 + kindBoost[a[8]] * 3, a]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, limit).map((x) => toInfo(x[1]));
}
