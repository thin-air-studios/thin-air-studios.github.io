// Sorting the real sky for the traffic director (director.js) and the Live feed card: every flight the feed holds is
// put in one bucket, and the planes in the area (near the field, not yet confirmed, not known to be going elsewhere)
// are ranked by how likely they look to come in. The rules are arrivals.js's; this only sorts their answers. Pure.
import { haversine, bearing, angleDiff } from './geo.js?v=86c2b44d';
import { ARRIVAL, FLIGHT_ID, arrivalCheck, estimatePosition, rivalOf } from './arrivals.js?v=86c2b44d';

/** The buckets an in-area plane can be in (before the away and climb rules, which judge() applies). */
const AREA_BUCKETS = new Set(['seen-once', 'close', 'far', 'passing']);

/**
 * Judge one flight from the feed at nowSec, for one field. Returns { bucket, inArea, areaKey, off, rival }:
 *  - bucket: the first rule that places it (see the table in DECISIONS.md, entry 156)
 *  - inArea: a real plane near the field, not confirmed, not climbing and not flying away (the director's pool)
 *  - areaKey: the sort key of the pool, lower first (geometry, height, sink, distance, angle off the field)
 *  - off: the track's angle off the bearing to the field, in degrees
 *  - rival: the nearby airport the flight is heading for, when it is
 * No randomness: the same flight at the same time is judged the same way.
 * @param nearby  other airports (airportdb.nearbyFields), each { lat, lon, icao, iata, name, city }
 */
export function judge(f, field, nowSec, nearby = [], { recorded = false } = {}) {
  const none = { bucket: 'other', inArea: false, areaKey: null, off: null, rival: null };
  // 1. on the ground: never an arrival, never in the area
  if (f.onGround) return { ...none, bucket: 'ground' };
  // 2. confirmed: the rule has passed on the last two polls (or on the recording)
  const held = arrivalCheck(f, field, nowSec, nearby, { recorded, held: true });
  if (held.arriving) return { ...none, bucket: 'confirmed' };
  const [lat, lon] = estimatePosition(f, nowSec);
  const dist = haversine(lat, lon, field.lat, field.lon);
  const stale = !recorded && nowSec - (f.timePosition ?? nowSec) > ARRIVAL.staleS;
  const data = FLIGHT_ID.test(f.callsign || '') && f.altitude != null && f.track != null && f.velocity != null && f.cls !== 'heli' && !stale;
  // 4. no flight number, a helicopter, no fresh position: placed as 'other' (before 'nearby', so a bare number is not one)
  if (!data) return { ...none, bucket: 'other' };
  // 3. nearby: the track is aimed at another airport, within the approach distance
  const rival = rivalOf(f, field, nowSec, nearby);
  if (dist <= ARRIVAL.maxKm * 1000 && rival) {
    return { bucket: 'nearby', inArea: false, areaKey: null, off: angleDiff(f.track, bearing(lat, lon, field.lat, field.lon)), rival };
  }
  const toField = bearing(lat, lon, field.lat, field.lon);
  const off = angleDiff(f.track, toField);
  // 5. climbing at any distance: out of this field, not in
  if (f.verticalRate != null && f.verticalRate > ARRIVAL.maxClimbMs) return { bucket: 'passing', inArea: false, areaKey: null, off, rival: null };
  // 6. the rule on the report itself (a first poll has no history, so it is judged on the report alone)
  let w = arrivalCheck(f, field, nowSec, nearby, { recorded, held: false });
  if (w.why === 'new') w = arrivalCheck(f, field, nowSec, nearby, { recorded: true, held: false });
  const bucket = bucketOf(w);
  const inArea = AREA_BUCKETS.has(bucket) && (f.verticalRate == null || f.verticalRate <= ARRIVAL.maxClimbMs)
    && dist <= ARRIVAL.areaKm * 1000 && off <= 90;
  const geomPass = arrivalCheck(f, field, nowSec, nearby, { recorded: true, held: false }).arriving;
  const h = f.altitude - field.elevM;
  const descending = f.verticalRate != null && f.verticalRate < ARRIVAL.minSinkMs;
  const areaKey = [geomPass ? 0 : 1, h, descending ? 0 : 1, dist, off];
  return { bucket, inArea, areaKey, off, rival: null };
}

/** The bucket for the rule's answer when it did not confirm (a first poll, or a last report that failed). */
function bucketOf(w) {
  if (w.arriving) return 'seen-once';
  if (w.why === 'too-close') return 'close';
  if (['too-far', 'above-glide', 'level', 'too-long-to-field'].includes(w.why)) return 'far';
  if (['below-field', 'below-glide', 'heading', 'miss', 'slow', 'not-closing', 'turning'].includes(w.why)) return 'passing';
  return 'other';
}

/** Which kind of plane a real flight in the game is: simulated (no flight number), confirmed, or in the area. */
export function kindOf(a) {
  if (!a.live) return 'simulated';
  if (a.confirmed) return 'confirmed';
  return 'area';
}

/**
 * The name the breakdown uses for an airport a plane is heading to: its name without the city ("Dallas Love Field" in
 * Dallas is "Love Field"). Over 20 characters, or no name, the IATA code (then the ICAO code). '' when there is nothing.
 */
export function nameForRival(a) {
  let n = (a.name || '').trim();
  if (a.city && n.toLowerCase().startsWith(`${a.city.toLowerCase()} `)) n = n.slice(a.city.length + 1).trim();
  if (!n || n.length > 20) return a.iata || a.icao || '';
  return n;
}

/** The order of the in-area pool: lower keys first, element by element (missing keys sort last). */
export function compareKeys(a, b) {
  const ka = a || [], kb = b || [];
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i], y = kb[i];
    if (x === y) continue;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return x < y ? -1 : 1;
  }
  return 0;
}
