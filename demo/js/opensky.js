// OpenSky Network live traffic: parsing, OAuth2 client-credentials auth, and a polling feed that
// treats the API's credit limits as a hard budget (anonymous: 400 credits/day, 1 credit per
// bounding-box query under 25 sq deg; authenticated: 4000/day).
import { haversine, bearing, angleDiff, bboxAround } from './geo.js?v=86c2b44d';
import { classifyFlight } from './classify.js?v=86c2b44d';
import { ARRIVAL, arrivalCheck, estimatePosition } from './arrivals.js?v=86c2b44d';
import { judge } from './area.js?v=86c2b44d';
import { pollFactor } from './feedstate.js?v=86c2b44d';

// the dead reckoning is arrivals.js's (one copy); the feed's callers and tests read it from here
export { estimatePosition };

export const STATES_URL = 'https://opensky-network.org/api/states/all';
export const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** State vector array -> object. Field order per the OpenSky REST docs. */
export function parseStates(json) {
  const out = [];
  if (!json || !Array.isArray(json.states)) return out;
  for (const s of json.states) {
    if (!Array.isArray(s) || s[5] == null || s[6] == null) continue;
    const f = {
      icao24: s[0],
      callsign: (s[1] || '').trim(),
      country: s[2],
      timePosition: s[3] ?? s[4] ?? json.time,
      lastContact: s[4],
      lon: s[5],
      lat: s[6],
      baroAlt: s[7],
      onGround: !!s[8],
      velocity: s[9],
      track: s[10],
      verticalRate: s[11],
      geoAlt: s[13],
      squawk: s[14],
      category: s.length > 17 ? s[17] : null,
    };
    f.altitude = f.baroAlt ?? f.geoAlt;
    f.cls = classifyFlight(f);
    out.push(f);
  }
  return out;
}

/**
 * A failed sign-in, as fetchStates reports it. A refused sign-in (a non-200 from the token endpoint, which carries
 * its status) is 'auth', and the player is told to check the sign-in. A network error is no answer at all, as
 * for an anonymous poll, so it is reported as one ('network' or 'no-internet'), not as a sign-in failure.
 */
function tokenFailure(e) {
  return e.status ? { ok: false, status: e.status, authError: true } : { ok: false, status: 0 };
}

export class OpenSkyClient {
  constructor({ http, clientId = '', clientSecret = '' }) {
    this.http = http;
    this.clientId = clientId.trim();
    this.clientSecret = clientSecret.trim();
    this.token = null;
    this.tokenExpires = 0;
  }

  get authenticated() {
    return !!(this.clientId && this.clientSecret);
  }

  async getToken(nowMs) {
    if (!this.authenticated) return null;
    if (this.token && nowMs < this.tokenExpires) return this.token;
    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}`;
    const r = await this.http('POST', TOKEN_URL, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (r.status !== 200) {
      this.token = null;
      const err = new Error(`token ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const j = JSON.parse(r.text);
    this.token = j.access_token;
    this.tokenExpires = nowMs + Math.max(60, (j.expires_in || 1800) - 60) * 1000; // tokens last 30 min
    return this.token;
  }

  /** timeoutMs (optional) is passed to the http call only when given: the live feed check gives up at 8 s (feedcheck.js). */
  async fetchStates(bbox, nowMs = Date.now(), { timeoutMs } = {}) {
    const q = `?lamin=${bbox.lamin.toFixed(4)}&lomin=${bbox.lomin.toFixed(4)}&lamax=${bbox.lamax.toFixed(4)}&lomax=${bbox.lomax.toFixed(4)}&extended=1`;
    const opts = timeoutMs != null ? { timeoutMs } : {};
    const headers = {};
    let tok = null;
    try {
      tok = await this.getToken(nowMs);
    } catch (e) {
      return tokenFailure(e);
    }
    if (tok) headers.Authorization = `Bearer ${tok}`;
    let r = await this.http('GET', STATES_URL + q, { headers, ...opts });
    if (r.status === 401 && tok) {
      this.token = null; // expired: refresh once
      try {
        tok = await this.getToken(nowMs);
        r = await this.http('GET', STATES_URL + q, { headers: { Authorization: `Bearer ${tok}` }, ...opts });
      } catch (e) {
        return tokenFailure(e);
      }
    }
    const remaining = r.headers['x-rate-limit-remaining'] != null ? parseInt(r.headers['x-rate-limit-remaining'], 10) : null;
    const retryAfter = r.headers['x-rate-limit-retry-after-seconds'] != null ? parseInt(r.headers['x-rate-limit-retry-after-seconds'], 10) : null;
    if (r.status !== 200) return { ok: false, status: r.status, remaining, retryAfter };
    let json;
    try {
      json = JSON.parse(r.text);
    } catch (_) {
      // a 200 with no JSON (a sign-in or captive page, say) is no answer from OpenSky: say it was not answered
      return { ok: false, status: 0, remaining };
    }
    return { ok: true, status: 200, flights: parseStates(json), time: json.time, remaining, retryAfter };
  }
}

/**
 * The feed of the daily challenge: its traffic is all simulated (the day's seed), so it has no live flights and nothing to
 * poll. It has the same methods as LiveFeed, which main.js calls (retryNow when the connection comes back).
 */
export function dailyFeed() {
  return { status: 'empty', snapshot: () => [], update() {}, retryNow() {}, firstResult: () => Promise.resolve(), daily: true };
}

/**
 * The three tests a report must pass to count in a feed's radius, shared by LiveFeed.onResult and the live feed check's count
 * (countInArea): it has a class (ground traffic is kept but never a candidate, so it has one too), it is within 1.05 x radiusM
 * of the field (`field` = { lat, lon, radiusM }), and its report is not older than ARRIVAL.receiptS by the server's clock
 * (a recording is replayed as it was, so it is not checked). Returns the distance in metres, or null when a test fails.
 */
export function keepFlight(f, field, serverNow, recorded) {
  if (!f.cls) return null;
  const dist = haversine(field.lat, field.lon, f.lat, f.lon);
  if (dist > field.radiusM * 1.05) return null;
  if (!recorded && serverNow - (f.timePosition ?? serverNow) > ARRIVAL.receiptS) return null;
  return dist;
}

/** How many planes one poll keeps around (lat, lon) within radiusM: the same tests as a live feed (keepFlight). */
export function countInArea(flights, lat, lon, radiusM, serverNow) {
  let n = 0;
  for (const f of flights) if (keepFlight(f, { lat, lon, radiusM }, serverNow, false) !== null) n++;
  return n;
}

/**
 * A polling live-traffic feed for one airport. Call update() every frame; it decides on its own
 * when to spend a credit. Statuses: 'loading' | 'live' | 'empty' | 'paused' | 'offline', and `reason`
 * says why it is paused or offline ('rate' | 'daily' | 'network' | 'no-internet' | 'http' | 'auth').
 */
export class LiveFeed {
  constructor({ client, lat, lon, radiusM = 80000, store = null, elevM = 0, nearby = [], recorded = false }) {
    this.client = client;
    this.lat = lat;
    this.lon = lon;
    this.elevM = elevM; // the field's elevation, for the descent rule (arrivals.js)
    this.nearby = nearby; // other airports a flight could be heading for instead (airportdb.nearbyFields)
    this.recorded = recorded; // a recorded snapshot (demo): no poll history, and an old report is fine
    this.radiusM = radiusM;
    this.bbox = bboxAround(lat, lon, radiusM);
    this.store = store; // optional { get(), set(v) } persisting the daily budget
    this.flights = new Map();
    this.prev = new Map(); // icao24 -> { dist, track, nowMs } from the last successful poll
    this.status = 'loading';
    this.reason = '';
    this.httpStatus = null;
    this.nextPollMs = 0;
    this.failures = 0;
    this.inFlight = false;
    this.lastOkMs = 0;
    this.remaining = null;
    this.message = '';
    this.gotFirst = false; // a first answer (success or failure) has come in
    this.firstWaiters = [];
  }

  /**
   * Resolves at the first answer from the feed (success or failure), or after timeoutMs, whichever is first. The game waits
   * for it on the loading card, so the first plane can be a real one (main.js startAirport).
   */
  firstResult(timeoutMs = 6000) {
    if (this.gotFirst) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.firstWaiters.push(() => { clearTimeout(timer); resolve(); });
    });
  }

  /** Marks the first answer as in, and wakes whoever is waiting for it. */
  markFirst() {
    this.gotFirst = true;
    const waiting = this.firstWaiters;
    this.firstWaiters = [];
    for (const wake of waiting) wake();
  }

  baseInterval() {
    // anonymous 400/day -> one poll a minute (~6.5 h of play a day); signed in: every 15 s. The credits left slow it down
    // (feedstate.js pollFactor, which the home screen's hours use too)
    const s = (this.client.authenticated ? 15 : 60) * pollFactor(this.remaining);
    return s * 1000;
  }

  /** The connection is back: an offline feed tries at once (a rate limit or a daily allowance still holds). */
  retryNow() {
    if (this.status === 'offline' && this.reason !== 'auth' && !this.inFlight) this.nextPollMs = 0;
  }

  update(nowMs) {
    if (this.inFlight || nowMs < this.nextPollMs) return;
    // no connection on this device: say so without asking the network
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.onResult({ ok: false, status: 0, offline: true }, nowMs);
      return;
    }
    this.inFlight = true;
    this.client.fetchStates(this.bbox, nowMs).then((r) => this.onResult(r, Date.now()), () => this.onResult({ ok: false, status: 0 }, Date.now()));
  }

  onResult(r, nowMs) {
    this.inFlight = false;
    if (r.remaining != null) this.remaining = r.remaining;
    this.markFirst();
    if (r.ok) {
      this.failures = 0;
      this.lastOkMs = nowMs;
      this.reason = '';
      this.httpStatus = null;
      const serverNow = r.time != null ? r.time : nowMs / 1000; // server clock at receipt
      const field = { lat: this.lat, lon: this.lon, elevM: this.elevM };
      const seen = new Set();
      const next = new Map();
      for (const f of r.flights) {
        // traffic within the radius only (keepFlight): ground traffic is kept (judged 'ground', never a candidate), and a
        // report more than 90 s old, by the server's clock, is stale
        const dist = keepFlight(f, { lat: this.lat, lon: this.lon, radiusM: this.radiusM }, serverNow, this.recorded);
        if (dist === null) continue;
        f.receivedMs = nowMs;
        f.serverNow = serverNow;
        f.dist = dist; // from the report itself, not dead-reckoned
        const p = this.prev.get(f.icao24);
        f.history = p && !this.recorded && nowMs - p.nowMs <= ARRIVAL.historyS * 1000 && f.track != null && p.track != null
          ? { closing: dist < p.dist - ARRIVAL.closeM, turn: angleDiff(f.track, p.track) }
          : null;
        // the rule at this poll, on the report itself: a flag between polls is dead-reckoned, so it counts only once the
        // rule has passed at this poll and at the poll before (f.runs, in a row; arrivals.js confirmRuns)
        const passed = arrivalCheck(f, field, serverNow, this.nearby, { recorded: this.recorded, held: false }).arriving;
        f.runs = !passed ? 0 : p && f.history ? (p.runs || 0) + 1 : 1;
        this.flights.set(f.icao24, f);
        next.set(f.icao24, { dist, track: f.track, nowMs, runs: f.runs });
        seen.add(f.icao24);
      }
      for (const k of this.flights.keys()) if (!seen.has(k)) this.flights.delete(k);
      this.prev = next;
      this.status = this.flights.size > 0 ? 'live' : 'empty';
      this.message = '';
      this.nextPollMs = nowMs + this.baseInterval();
      if (this.remaining != null && this.remaining <= 3) {
        this.status = 'paused';
        this.reason = 'daily';
        this.message = 'daily limit reached';
        this.nextPollMs = nowMs + 3600e3;
      }
      return;
    }
    this.failures++;
    this.httpStatus = r.status || null;
    if (r.status === 429) {
      // with the day's credits spent, a 429 is the daily allowance (as a successful poll says), not a rate limit to wait out
      const daily = this.remaining != null && this.remaining <= 3;
      this.status = 'paused';
      this.reason = daily ? 'daily' : 'rate';
      this.message = daily ? 'daily limit reached' : 'rate limited';
      this.nextPollMs = nowMs + (daily ? Math.max(3600, r.retryAfter || 0) : Math.max(60, r.retryAfter || 600)) * 1000;
    } else if (r.authError) {
      this.status = 'offline';
      this.reason = 'auth';
      this.message = 'sign-in failed';
      this.nextPollMs = nowMs + 10 * 60e3;
    } else {
      // offline at once; feedstate.js shows 'interrupted' for a while after the last good poll
      this.status = 'offline';
      this.reason = r.offline ? 'no-internet' : r.status ? 'http' : 'network';
      this.message = r.status ? `error ${r.status}` : 'no connection';
      // exponential backoff: 30 s, 60, 120 ... capped at 10 min
      this.nextPollMs = nowMs + Math.min(600, 30 * 2 ** (this.failures - 1)) * 1000;
    }
  }

  /** Current live flights, dead-reckoned to now, each with its arrival check (arrivals.js). */
  snapshot(nowMs = Date.now()) {
    const field = { lat: this.lat, lon: this.lon, elevM: this.elevM };
    const out = [];
    for (const f of this.flights.values()) {
      // dead-reckon from the report time to "server now" plus the time since we received it
      const nowSec = f.serverNow + (nowMs - f.receivedMs) / 1000;
      const [lat, lon] = estimatePosition(f, nowSec);
      const dist = haversine(this.lat, this.lon, lat, lon);
      const { arriving, why, eta } = arrivalCheck(f, field, nowSec, this.nearby, { recorded: this.recorded });
      // the bucket and the area rule (area.js): the director's pool and the feed card's counts
      const { bucket, inArea, areaKey, off, rival } = judge(f, field, nowSec, this.nearby, { recorded: this.recorded });
      out.push({ ...f, lat, lon, dist, bearing: bearing(this.lat, this.lon, lat, lon), flightId: f.icao24, arriving, why, eta, bucket, inArea, areaKey, off, rival });
    }
    return out;
  }
}
