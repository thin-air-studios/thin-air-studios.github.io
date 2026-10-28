import { WEB_DEMO } from './flavor.js?v=2f66fd5f';
// Where a real plane came from, for the arrival note (2.4 item 1: "Arrived from Omaha", its most recent origin). The routes are the
// Virtual Radar Server standing data (CC0 1.0), kept by tools/routes-build.mjs as one small file per airline on the game's own
// website. A real plane whose callsign starts with an airline's code gets that airline's file on first need, through net.js like
// the other services; the file is kept in memory, and on the phone for a week (ROUTE_TTL_MS). The leg rule (legInto) picks the leg
// the plane flew into the airport being played, from the feed's report of the plane when it came in (main.js keeps each flight's
// latest report). The note names that leg's origin, the most recent stop before the airport, and the city is the bundled airports
// list's. No note when no leg fits, when the leg starts at this airport or at one with no city, for a callsign that is not an
// airline's (an N-number), for a simulated plane, or in the recorded game (it asks for nothing). Nothing here touches the simulation:
// it reads a plane's callsign and report, and keeps its own answers.
import { http } from './net.js?v=2f66fd5f';
import { cityName, airportNow } from './airportdb.js?v=2f66fd5f';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from './airportdata.js?v=2f66fd5f';
import { haversine, bearing, angleDiff, destination } from './geo.js?v=2f66fd5f';

export const ROUTE_BASE = 'https://thin-air-studios.github.io/routes/'; // the files tools/routes-build.mjs writes
export const ROUTE_TTL_MS = 7 * 24 * 3600 * 1000; // a file on the phone is used for a week, then fetched again
export const ROUTE_TIMEOUT_MS = 8000; // a file is up to about 250 KB
export const ROUTE_RETRY_MS = 10 * 60 * 1000; // a file that did not arrive is asked for again after this
export const LEG_KM = 30; // a route with several legs into the airport: the leg's line passes within this of the plane (about)
export const LEG_HEADING_DEG = 60; // ... and the plane's track is within this of the leg's direction there
export const LEG_SIDE_DEG = 90; // a route with one leg into the airport: the plane is within this of the origin, seen from the airport
const CACHE_PREFIX = 'routes:'; // the phone's copies, one IndexedDB key per file (the store the bundled airports' copies use)
export const CACHE_MAX = 8 * 1024 * 1024; // characters kept on the phone: past it the least recently used files go

// the callsign rule of the standing data (its README, "Normalisation"): the code and the number, the number's leading zeros
// stripped ("AAL0013" is "AAL13"; a number with no digit gets one zero back). tools/routes-build.mjs keys its files the same way.
const CALLSIGN = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(\d[A-Z0-9]*)$/;
const NUMBER = /^(\d{1,4}|\d{1,3}[A-Z]|\d{1,2}[A-Z]{2})$/;
const STOPS = /^[A-Z0-9]{4}(-[A-Z0-9]{4})+$/;

/** A callsign as the route files keep it, or null for a text they cannot hold (a registration, an IATA-coded callsign). */
export function normaliseCallsign(text) {
  const m = CALLSIGN.exec(String(text || '').trim().toUpperCase());
  if (!m) return null;
  let n = m[2].replace(/^0+/, '');
  if (!/\d/.test(n)) n = `0${n}`;
  return NUMBER.test(n) ? `${m[1]}${n}` : null;
}

/** The key a real plane's callsign is looked up under: an airline's flight ("BAW85U"), or null (an N-number, a bare number). */
export function routeKey(callsign) {
  const cs = normaliseCallsign(callsign);
  return cs && /^[A-Z]{3}\d/.test(cs) ? cs : null;
}

/** A real plane's flight id (the feed's icao24, set by the director), the key its spot is kept under; null for a simulated one. */
const flightOf = (a) => (a && a.live && a.flightId) || null;

/** The file for a callsign's airline (the code), and the digit file of a split airline (the first digit of the number). */
const baseFile = (key) => `${key.slice(0, 3)}.json`;
const digitFile = (key) => `${key.slice(0, 3)}-${key[3]}.json`;

/**
 * A route file as the game reads it: { airline, split, routes: Map callsign -> stops[] }, or null when the text is not one. A file
 * with "split": true is a pointer to one file per first digit of the number (routes-build.mjs); its routes are empty.
 */
export function parseAirline(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (_) {
    return null;
  }
  if (!j || typeof j !== 'object' || typeof j.airline !== 'string' || !/^[A-Z]{3}$/.test(j.airline)) return null;
  if (j.split === true) return { airline: j.airline, split: true, routes: new Map() };
  if (!j.routes || typeof j.routes !== 'object') return null;
  const routes = new Map();
  for (const [cs, s] of Object.entries(j.routes)) {
    if (typeof s === 'string' && STOPS.test(s)) routes.set(cs, s.split('-'));
  }
  return { airline: j.airline, split: false, routes };
}

/**
 * Where a point stands against the great-circle leg a-b (points are { lat, lon }): its distance in km from the leg (the ends count:
 * past an end, the distance to that end), and the direction of the leg at the point's foot on it, in degrees towards b. Past an end,
 * the direction is the leg's own at that end.
 */
export function legFix(p, a, b) {
  const R = 6371008.8; // metres, as geo.js
  const dAB = haversine(a.lat, a.lon, b.lat, b.lon) / R;
  const dAP = haversine(a.lat, a.lon, p.lat, p.lon) / R;
  const brgAB = bearing(a.lat, a.lon, b.lat, b.lon);
  if (dAB === 0) return { km: (dAP * R) / 1000, bearing: brgAB };
  const toB = (brgAB * Math.PI) / 180;
  const toP = (bearing(a.lat, a.lon, p.lat, p.lon) * Math.PI) / 180;
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(dAP) * Math.sin(toP - toB))));
  const along = Math.acos(Math.max(-1, Math.min(1, Math.cos(dAP) / Math.max(1e-12, Math.cos(xt)))))
    * (Math.cos(toP - toB) < 0 ? -1 : 1);
  if (along < 0) return { km: (dAP * R) / 1000, bearing: brgAB };
  if (along > dAB) return { km: haversine(b.lat, b.lon, p.lat, p.lon) / 1000, bearing: (bearing(b.lat, b.lon, a.lat, a.lon) + 180) % 360 };
  const [fLat, fLon] = destination(a.lat, a.lon, brgAB, along * R);
  return { km: (Math.abs(xt) * R) / 1000, bearing: bearing(fLat, fLon, b.lat, b.lon) };
}

// a leg whose origin has no city is no leg for the rule: the note would be empty, and the next fitting leg may name its own city
const hasCity = (p) => !!(p && cityOf(p.city));

/**
 * The leg a plane flew into the airport `icao`, from the stops in order: the origin of the leg the plane is on, or '' (no note).
 * The legs are the consecutive pairs (a, b) with b = icao and a not icao, and they are counted as they are (a leg from an airport
 * with no city counts). By their number:
 * - one leg: the plane is on its origin's side of the airport, within LEG_SIDE_DEG of the bearing from the airport to the origin, at
 *   any distance. The track is not used: a plane on a corner-post approach is well off the leg's line and still came from the origin.
 *   An origin with no city gives no note.
 * - several legs: the leg whose great-circle line passes within LEG_KM of the plane, with the plane's track within LEG_HEADING_DEG of
 *   the line's direction where the plane is (a plane on the other heading is leaving). The nearest such leg wins. A leg whose origin
 *   has no city is skipped, so the next leg that fits can name its city. A plane with no track gets no note from several legs.
 * `pos` is { lat, lon, track } as the plane was first seen; `place(code)` is { lat, lon, city } or null.
 */
export function legInto(stops, icao, pos, place) {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return '';
  const B = place(icao);
  if (!B) return '';
  const origins = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    if (stops[i + 1] === icao && stops[i] !== icao) origins.push(stops[i]);
  }
  if (origins.length === 1) {
    const A = place(origins[0]);
    if (!hasCity(A)) return '';
    const fromAirport = bearing(B.lat, B.lon, pos.lat, pos.lon);
    const towardOrigin = bearing(B.lat, B.lon, A.lat, A.lon);
    return angleDiff(fromAirport, towardOrigin) <= LEG_SIDE_DEG ? origins[0] : '';
  }
  if (!Number.isFinite(pos.track)) return '';
  let best = null;
  for (const a of origins) {
    const A = place(a);
    if (!hasCity(A)) continue;
    const fix = legFix(pos, A, B);
    if (fix.km > LEG_KM) continue;
    if (angleDiff(pos.track, fix.bearing) > LEG_HEADING_DEG) continue;
    if (!best || fix.km < best.km) best = { km: fix.km, first: a };
  }
  return best ? best.first : '';
}

/**
 * The city a flight came from: the bundled airports list's city, with any bracketed part dropped ("Paris (Roissy-en-France,
 * Val-d'Oise)" is "Paris"). '' when the list has none: then there is no note, never a guess.
 */
export function cityOf(bundledCity) {
  return cityName(bundledCity);
}

/** A code's place on the bundled list, for the leg rule: { lat, lon, city } or null (null until the list has loaded). */
export function placeOf(code) {
  const a = airportNow(code);
  return a ? { lat: a.lat, lon: a.lon, city: cityOf(a.city) } : null;
}

/**
 * The phone's copy of the route files, one entry per file in the phone's store (IndexedDB, airportdata.js's cache* helpers, not the
 * save's localStorage, so a full route cache never stops the save). An entry is { at (fetched), used (last used), text }. A copy is
 * a week old at most (ROUTE_TTL_MS); past CACHE_MAX characters the least recently used files go, so a quiet airport's files do not
 * push out a busy one's sooner than need be. A private window or a store that refuses gives no copy, and the files are fetched again.
 */
export function makePhoneCache(store = { get: cacheGet, set: cacheSet, del: cacheDel, keys: cacheKeys }) {
  const safe = async (f, dflt) => {
    try {
      return await f();
    } catch (_) {
      return dflt;
    }
  };
  async function prune(now) {
    const keys = await safe(() => store.keys(CACHE_PREFIX), []);
    const files = [];
    for (const k of keys) {
      const v = await safe(() => store.get(k), null);
      if (!v || !Number.isFinite(v.at) || now - v.at >= ROUTE_TTL_MS) {
        await safe(() => store.del(k), false);
      } else files.push([k, v]);
    }
    files.sort((x, y) => (y[1].used ?? y[1].at) - (x[1].used ?? x[1].at));
    let total = 0;
    for (const [k, v] of files) {
      total += String(v.text || '').length;
      if (total > CACHE_MAX) await safe(() => store.del(k), false);
    }
  }
  return {
    /** The copy of a file ({ at, used, text }), or null: none, a week old, or not kept. */
    async get(name, now) {
      const v = await safe(() => store.get(CACHE_PREFIX + name), null);
      return v && typeof v.text === 'string' && Number.isFinite(v.at) && now - v.at < ROUTE_TTL_MS ? v : null;
    },
    /** The copy was used now: it is the most recently used, and the last to go. */
    async use(name, v, now) {
      await safe(() => store.set(CACHE_PREFIX + name, { ...v, used: now }), false);
    },
    /** A file as fetched now, then the least recently used go past the bound. */
    async put(name, text, now) {
      await safe(() => store.set(CACHE_PREFIX + name, { at: now, used: now, text }), false);
      await prune(now);
    },
  };
}

export const phoneCache = makePhoneCache();

/**
 * The route lookup for the session. want(aircraft) asks for the plane's airline file, once, on first need; cityFrom(aircraft, icao)
 * is the city of its leg into `icao` ('' when there is none, and while the file is still on its way). A file that fails is asked
 * again after retryMs. The options are for the tests: `send` is http (net.js), `cache` the phone's copy, `now` the clock.
 */
export function makeRouteLookup({
  send = http,
  cache = phoneCache,
  timeoutMs = ROUTE_TIMEOUT_MS,
  retryMs = ROUTE_RETRY_MS,
  now = () => Date.now(),
} = {}) {
  const loaded = new Map(); // file name -> parsed file, once it has come in
  const inFlight = new Map(); // file name -> the request on its way
  const failedAt = new Map(); // file name -> when it last failed
  const missingFiles = new Set(); // file names the website does not have (a 404): asked once this session, not again
  const pending = new Map(); // route key -> its base file: a split airline's digit files are asked for when the pointer comes in
  const spots = new Map(); // flight id -> { lat, lon, track } where it was first seen (the leg rule's position), from want()

  async function fetchFile(name) {
    const kept = await cache.get(name, now());
    const copy = kept ? parseAirline(kept.text) : null;
    if (copy) {
      await cache.use(name, kept, now());
      return { parsed: copy, text: null, missing: false };
    }
    let r = null;
    try {
      r = await send('GET', ROUTE_BASE + name, { timeoutMs });
    } catch (_) {
      r = null;
    }
    const text = r && r.status === 200 ? r.text : null;
    const parsed = text ? parseAirline(text) : null;
    return { parsed, text: parsed ? text : null, missing: !!r && r.status === 404 };
  }

  function ensure(name) {
    if (loaded.has(name) || inFlight.has(name) || missingFiles.has(name)) return;
    const f = failedAt.get(name);
    if (f != null && now() - f < retryMs) return;
    const job = (async () => {
      try {
        const { parsed, text, missing } = await fetchFile(name);
        if (!parsed) {
          // a file the website does not have stays missing for the session; any other failure is asked again after the retry time
          if (missing) missingFiles.add(name);
          else failedAt.set(name, now());
          return;
        }
        loaded.set(name, parsed);
        failedAt.delete(name);
        if (text != null) await cache.put(name, text, now());
        if (parsed.split) {
          for (const [key, base] of pending) if (base === name) ensure(digitFile(key));
        }
      } finally {
        inFlight.delete(name);
      }
    })();
    inFlight.set(name, job);
  }

  return {
    /**
     * Asks for a real plane's airline file, once. True when the plane is an airline's flight (its file is then asked for). `spot` is
     * where the plane is when it comes in ({ lat, lon, track }, the feed's report), kept for the leg rule at touchdown under the
     * flight's id: a rewind restores the sim's aircraft as copies (sim.js restore), and a copy is the same flight.
     */
    want(a, spot = null) {
      const key = a && a.live ? routeKey(a.callsign) : null;
      if (!key) return false;
      const flight = flightOf(a);
      if (flight) {
        if (spot) spots.set(flight, spot);
        else spots.delete(flight); // no report now: an older spot under the same id (an earlier game) is not used
      }
      pending.set(key, baseFile(key));
      ensure(baseFile(key));
      const base = loaded.get(baseFile(key));
      if (base && base.split) ensure(digitFile(key));
      return true;
    },
    /** The city the plane's leg into `icao` came from, once its file has come in: '' otherwise. */
    cityFrom(a, icao) {
      const key = a && a.live ? routeKey(a.callsign) : null;
      const flight = flightOf(a);
      const pos = key && icao && flight ? spots.get(flight) : null;
      if (!pos) return '';
      const base = loaded.get(baseFile(key));
      const file = base && base.split ? loaded.get(digitFile(key)) : base;
      const stops = file && file.routes.get(key);
      if (!stops) return '';
      const first = legInto(stops, icao, { lat: pos.lat, lon: pos.lon, track: pos.track }, placeOf);
      const p = first ? placeOf(first) : null;
      return p && p.city ? p.city : '';
    },
    /** Files still on their way (the tests read it; the game does not). */
    get waiting() {
      return inFlight.size;
    },
  };
}

/** The game's one lookup, for the session. */
export const routes = makeRouteLookup({ send: http });

/**
 * Called when a plane comes into the game: its airline's file is asked for now, so it is ready at touchdown. `spot` is the feed's
 * report for the plane at that moment (main.js keeps the latest one per flight). Simulated: never.
 */
export function askForRoute(a, spot = null, lookup = routes) {
  if (!WEB_DEMO && a && a.live) lookup.want(a, spot); // the demo has no real planes, so no route is asked for (DECISIONS 446)
}

/** The arrival note for a plane that has touched down at the airport `icao`: "Arrived from <city>", or '' (no note). */
export function arrivalNote(a, icao, lookup = routes) {
  if (WEB_DEMO || !a || !a.live || !icao) return '';
  const city = lookup.cityFrom(a, icao);
  return city ? `Arrived from ${city}` : '';
}
