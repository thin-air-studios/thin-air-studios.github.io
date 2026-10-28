// adsb.lol live traffic (3.4): the main source of the live flights. The API is open to everyone under ODbL 1.0 (attribution
// required, commercial use allowed; docs at https://www.adsb.lol/docs/open-data/api/). One request asks for the aircraft within a
// radius of an airport: GET /v2/point/{lat}/{lon}/{radius_nm}. The answer is normalised here to the game's plane shape, the same
// shape opensky.js parseStates gives, so a real plane from either source is the same object downstream (arrivals, area, radio,
// the end screen). Units are the game's: metres, metres a second, Unix seconds (OpenSky's), so no other code converts them.
//
// Rate limits on the free API (per IP, read from the response headers 27 Oct 2026): 4 requests a second, 60 a minute, 500 a day.
// The phone sends at most one request a second (deviceGate), and the live feed polls at its own cadence (opensky.js).
import { classifyFlight } from './classify.js?v=2f66fd5f'; // the same size classifier OpenSky's parser uses (opensky.js parseStates)

export const ADSB_BASE = 'https://api.adsb.lol';
export const NM_M = 1852; // a nautical mile in metres
export const MAX_NM = 250; // the API caps the radius at 250 nm (api_v2.py: min(radius, 250))
export const KT_MS = 0.514444; // knots to metres a second
export const FT_M = 0.3048; // feet to metres
export const FTMIN_MS = 0.3048 / 60; // feet a minute to metres a second
export const MS_THRESHOLD = 1e11; // a `now` above this is milliseconds, below it seconds (see serverTime)
export const DAILY_RESET_S = 60; // a 429 whose reset is further away than this is the day's allowance (the minute window resets within 60 s)

// The ADS-B emitter category (the API's `category`, a string such as "A3") as OpenSky's numeric category (classify.js reads
// those). Reserved and surface-obstacle codes map to categories classify.js does not count as aircraft (10 to 20), or to none.
const ADS_B_CATEGORY = {
  A0: 0, A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 8,
  B1: 9, B2: 10, B3: 11, B4: 12, B6: 14, B7: 15,
  C1: 16, C2: 17, C3: 18, C4: 19, C5: 20,
};

/** The radius in whole nautical miles that covers a circle of radiusM metres with the same margin keepFlight uses (1.05 x radius). */
export function radiusNm(radiusM) {
  return Math.min(MAX_NM, Math.max(1, Math.ceil((radiusM * 1.05) / NM_M)));
}

/** The request address for an area: the aircraft within radiusM metres of (lat, lon). */
export function pointUrl(lat, lon, radiusM) {
  return `${ADSB_BASE}/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm(radiusM)}`;
}

/**
 * The server's clock in seconds, from the answer's `now`. The API's own format (ADS-B Exchange v2, which the API says it is
 * compatible with) gives milliseconds; the repo's model examples give seconds, so both are read: a value above MS_THRESHOLD is
 * milliseconds. Without `now` the phone's clock stands in.
 */
export function serverTime(json, nowMs = Date.now()) {
  const n = json && typeof json.now === 'number' ? json.now : NaN;
  if (!Number.isFinite(n) || n <= 0) return nowMs / 1000;
  return n > MS_THRESHOLD ? n / 1000 : n;
}

/**
 * One answer's aircraft, in the game's plane shape (the same keys as opensky.js parseStates, in the same order):
 *  - hex -> icao24 (lower case); flight, trimmed -> callsign ('' when missing, as OpenSky gives it);
 *  - alt_baro (feet) -> baroAlt (metres); "ground" -> onGround, with no baroAlt; alt_geom (feet) -> geoAlt;
 *  - gs (knots) -> velocity (m/s); track (degrees); baro_rate (feet a minute) -> verticalRate (m/s), else geom_rate;
 *  - seen_pos (seconds since the position) -> timePosition = server time - seen_pos (seen when there is no seen_pos), and
 *    seen -> lastContact. The feed's own stale rule (keepFlight, arrivals.js ARRIVAL) then drops an old report, as for OpenSky;
 *  - category ("A3") -> category (number, see ADS_B_CATEGORY); squawk as given; country is null (the API has none).
 * An aircraft with no hex or no position is dropped, as OpenSky's parseStates drops a state with no position.
 * Returns the flights (an array, possibly empty). Pure: the clock is passed in.
 */
export function parseAdsb(json, nowMs = Date.now()) {
  const out = [];
  if (!json || !Array.isArray(json.ac)) return out;
  const time = serverTime(json, nowMs);
  for (const a of json.ac) {
    if (!a || typeof a !== 'object') continue;
    const hex = typeof a.hex === 'string' ? a.hex.trim().toLowerCase() : '';
    if (!hex || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    const onGround = a.alt_baro === 'ground';
    const f = {
      icao24: hex,
      callsign: typeof a.flight === 'string' ? a.flight.trim() : '',
      country: null,
      timePosition: Number.isFinite(a.seen_pos) ? time - a.seen_pos : Number.isFinite(a.seen) ? time - a.seen : time,
      lastContact: Number.isFinite(a.seen) ? time - a.seen : null,
      lon: a.lon,
      lat: a.lat,
      baroAlt: !onGround && Number.isFinite(a.alt_baro) ? a.alt_baro * FT_M : null,
      onGround,
      velocity: Number.isFinite(a.gs) ? a.gs * KT_MS : null,
      track: Number.isFinite(a.track) ? a.track : null,
      verticalRate: Number.isFinite(a.baro_rate) ? a.baro_rate * FTMIN_MS : Number.isFinite(a.geom_rate) ? a.geom_rate * FTMIN_MS : null,
      geoAlt: Number.isFinite(a.alt_geom) ? a.alt_geom * FT_M : null,
      squawk: typeof a.squawk === 'string' ? a.squawk : null,
      category: typeof a.category === 'string' && Object.prototype.hasOwnProperty.call(ADS_B_CATEGORY, a.category) ? ADS_B_CATEGORY[a.category] : null,
    };
    f.altitude = f.baroAlt ?? f.geoAlt;
    f.cls = classifyFlight(f);
    out.push(f);
  }
  return out;
}

/** A header's whole-number value, or null (a Retry-After HTTP date is not one). */
function intHeader(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/**
 * When to try again, from the 429 (or any) answer's headers: Retry-After in seconds, else x-ratelimit-reset in seconds.
 * `daily` says the wait is longer than a minute: the day's allowance (500 a day), not the per-minute or per-second window.
 */
export function limitWait(headers = {}) {
  const h = headers || {};
  const secs = intHeader(h['retry-after']) ?? intHeader(h['x-ratelimit-reset']);
  return { retryAfter: secs, daily: secs != null && secs > DAILY_RESET_S };
}

/**
 * A sequence gate: each call returns when its turn comes, at least gapMs after the one before. One gate per device
 * (deviceGate), so the live feed and the feed check never send two requests within a second.
 */
export function makeGate({ gapMs = 1000, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let next = 0;
  return async function ready() {
    const at = Math.max(now(), next);
    next = at + gapMs;
    const wait = at - now();
    if (wait > 0) await sleep(wait);
  };
}
export const deviceGate = makeGate();

const NO_ANSWER = Object.freeze({ ok: false, status: 0, source: 'adsblol', remaining: null, retryAfter: null, daily: false });

/**
 * The adsb.lol client. fetchStates has the same shape as OpenSkyClient.fetchStates (so LiveFeed reads either), with `area`
 * ({ lat, lon, radiusM }) in its options, which the point request needs. The answer: { ok, status, flights, time, remaining,
 * retryAfter, daily, source }. `remaining` is always null: the headers name the tightest window (a second), not the day,
 * so they do not give the day's count. A 429 has daily set when the wait is more than a minute (limitWait).
 */
export class AdsbLolClient {
  constructor({ http, gate = deviceGate }) {
    this.http = http;
    this.gate = gate;
  }

  get authenticated() {
    return false; // no sign-in: the adsb.lol API is open to everyone
  }

  async fetchStates(bbox, nowMs = Date.now(), { area = null, timeoutMs } = {}) {
    if (!area || !Number.isFinite(area.lat) || !Number.isFinite(area.lon) || !Number.isFinite(area.radiusM)) return NO_ANSWER;
    await this.gate();
    const opts = timeoutMs != null ? { timeoutMs } : {};
    let r;
    try {
      r = await this.http('GET', pointUrl(area.lat, area.lon, area.radiusM), { headers: {}, ...opts });
    } catch (_) {
      return NO_ANSWER;
    }
    if (!r || r.status !== 200) {
      const wait = limitWait(r && r.headers);
      const status = r ? r.status || 0 : 0;
      return { ok: false, status, source: 'adsblol', remaining: null, retryAfter: wait.retryAfter, daily: status === 429 && wait.daily };
    }
    let json;
    try {
      json = JSON.parse(r.text);
    } catch (_) {
      return NO_ANSWER; // a 200 with no JSON (a captive page, say) is no answer from adsb.lol
    }
    if (!json || !Array.isArray(json.ac)) return NO_ANSWER; // a 200 that is an error object, not a list of aircraft
    return {
      ok: true, status: 200, source: 'adsblol', flights: parseAdsb(json, nowMs), time: serverTime(json, nowMs),
      remaining: null, retryAfter: null, daily: false,
    };
  }
}
