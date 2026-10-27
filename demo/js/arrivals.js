// Is a real aircraft coming to land at THIS airport soon? Only those are shown as real flights (with
// their callsign). The rule reads the report and the last poll: a steady descent toward the field,
// from a plausible height and speed, that is not heading for a nearby airport. The thresholds are
// starting values, kept here and tuned only on a live capture (DECISIONS.md, entry 155).
import { haversine, bearing, angleDiff, destination } from './geo.js?v=7227d0de';

export const ARRIVAL = {
  fieldMinKm: 4, maxKm: 40,
  // the descent is bounded both ways: above the field by at most ~5 degrees, and below it by ~1 degree (a floor, so a
  // flight far out at or under the field's height, on some other approach, is not taken for this one)
  glideSlope: 0.0875, glideBaseM: 500, belowFieldM: -250, floorSlope: 0.02, floorBaseM: -50,
  // the track must point at the field: 45 degrees at any range (was 90 inside 10 km, which let a flight 81 degrees off
  // the bearing through at 8 km on the live capture, turned away a few minutes later; the widest track of a flight that
  // came in there was 30 degrees)
  headingFarDeg: 45, headingNearDeg: 45, nearKm: 10,
  // and the line of the track must pass within this of the field: a track 40 degrees off the bearing at 35 km misses by
  // 22 km, which is an overflight or a flight to another airport (live capture: AAL2062 to Dallas, SKW3856 to Seattle).
  // Real approaches came in within about 5.5 km; the cut sits in the gap after them (BAW85U and BAW439M, both route-
  // confirmed for Heathrow, miss by 13 to 19 km and are set aside: a late turn-in is a possible but unseen case)
  maxMissKm: 6,
  maxClimbMs: 1.0,
  levelAboveKm: 10, minSinkMs: -0.5,
  minSpeedMs: { light: 25, other: 50 },
  maxEtaS: 600,
  // a nearby field is the destination when the track points at it more directly than at this one: at least
  // otherMarginDeg closer to the track, within otherTrackDeg, and no further from the aircraft than otherAirportFrac times
  // this field's distance (the old gate was 0.8, which let a flight to LaGuardia through at JFK: its track was 0.5 degrees
  // off LaGuardia and 42 degrees off JFK; a flat 60 km band refused a flight 5.7 km from JFK, aimed at a field 55 km away)
  otherAirportFrac: 3, otherTrackDeg: 30, otherMarginDeg: 10,
  staleS: 150, receiptS: 90,
  closeM: 500, turnDeg: 20, historyS: 200, // history: two polls at most this far apart (under 60 credits, 180 s)
  // a flag stands only while the rule also passed on the last report itself, at this many polls in a row. Between polls
  // the position is dead-reckoned, and a flight that failed at its last poll (too far, aimed at another field, turning)
  // could pass on the dead-reckoned position: 4 of the 59 flags on a 20-minute live capture at DFW and ATL were like that
  // (AJI326 to Addison, DAL2179 and ENY3490 turning away, LXJ307 going around). 1 removes all four and misses no landing;
  // 2 removes no more and misses 4 more landings
  confirmRuns: 1,
  nearbyKm: 300, nearbyRunwayFt: 3000,
  // a real plane in the area (area.js): within this of the field, not yet confirmed. Rivals are judged inside maxKm only
  areaKm: 80,
};

// a flight anyone can name: an airline's code and flight number (BAW85U, AAL2516), or a US registration (N5319K). A bare
// number (50202754, live capture) is an aircraft that identifies itself to nobody, so it is not shown as a real flight
export const FLIGHT_ID = /^(?:[A-Z]{3}\d|N\d)/;

/**
 * Where a report says the aircraft is at nowSec: dead reckoning from its last report, capped at 150 s. The one copy
 * of this: the feed (opensky.js) and the arrival rule both use it.
 */
export function estimatePosition(f, nowSec) {
  const dt = Math.max(0, Math.min(150, nowSec - (f.timePosition ?? nowSec)));
  if (!f.velocity || f.track == null || f.onGround) return [f.lat, f.lon];
  return destination(f.lat, f.lon, f.track, f.velocity * dt);
}

/**
 * The airport a flight is heading for instead of this field, or null. A rival is one the track is aimed at more directly
 * than this field (N155QS, Northolt; BAW60, Biggin Hill). On the same line, the nearer field is reached first, so it
 * counts as well. A field beside this approach, which the track is not aimed at, does not divert it (DAL393 past Hawthorne
 * at LAX). The same test arrivalCheck makes, so the two agree.
 */
export function rivalOf(f, field, nowSec, nearby = []) {
  if (f.track == null) return null;
  const [lat, lon] = estimatePosition(f, nowSec);
  const dist = haversine(lat, lon, field.lat, field.lon);
  const off = angleDiff(f.track, bearing(lat, lon, field.lat, field.lon));
  for (const b of nearby) {
    const dB = haversine(lat, lon, b.lat, b.lon);
    if (dB > ARRIVAL.otherAirportFrac * dist) continue;
    const offB = angleDiff(f.track, bearing(lat, lon, b.lat, b.lon));
    if (offB >= ARRIVAL.otherTrackDeg) continue;
    if (offB + ARRIVAL.otherMarginDeg <= off) return b;
    if (offB <= off && dB < dist) return b;
  }
  return null;
}

/**
 * @param f        a flight from the feed: lat, lon, timePosition, altitude (m), track, velocity (m/s),
 *                 verticalRate, cls, callsign, onGround, and history ({ closing, turn }) from the last poll
 * @param field    { lat, lon, elevM } of the airport
 * @param nowSec   server time to judge it at (the position is dead-reckoned to here)
 * @param nearby   other airports a flight could be heading for: { lat, lon }
 * @param recorded a recorded snapshot (demo): no poll history, and an old report is fine
 * @param held     true (the default) for the flag the player sees: the rule must also have passed at the last
 *                 ARRIVAL.confirmRuns polls (f.runs, set by opensky.js). false judges the report itself, for the poll
 * @returns { arriving, why, eta } where why is the first rule that failed ('arriving' when none did, 'unconfirmed' when
 *          every rule passes but the polls have not yet agreed)
 */
export function arrivalCheck(f, field, nowSec, nearby = [], { recorded = false, held = true } = {}) {
  const no = (why) => ({ arriving: false, why, eta: null });
  if (f.onGround) return no('ground');
  if (!FLIGHT_ID.test(f.callsign || '')) return no('no-callsign');
  if (f.altitude == null || f.track == null || f.velocity == null) return no('no-data');
  if (f.cls === 'heli') return no('helicopter'); // a helicopter's destination can't be known
  if (!recorded) {
    if (nowSec - (f.timePosition ?? nowSec) > ARRIVAL.staleS) return no('frozen');
    if (!f.history) return no('new'); // needs two polls
    if (!f.history.closing) return no('not-closing');
    if (f.history.turn > ARRIVAL.turnDeg) return no('turning');
  }
  const [lat, lon] = estimatePosition(f, nowSec);
  const dist = haversine(lat, lon, field.lat, field.lon);
  if (dist < ARRIVAL.fieldMinKm * 1000) return no('too-close');
  if (dist > ARRIVAL.maxKm * 1000) return no('too-far');
  const h = f.altitude - field.elevM;
  if (h < ARRIVAL.belowFieldM) return no('below-field');
  if (h < ARRIVAL.floorSlope * dist + ARRIVAL.floorBaseM) return no('below-glide');
  if (h > ARRIVAL.glideSlope * dist + ARRIVAL.glideBaseM) return no('above-glide');
  const toField = bearing(lat, lon, field.lat, field.lon);
  const off = angleDiff(f.track, toField);
  const limit = dist >= ARRIVAL.nearKm * 1000 ? ARRIVAL.headingFarDeg : ARRIVAL.headingNearDeg;
  if (off > limit) return no('heading');
  if (dist * Math.sin((off * Math.PI) / 180) > ARRIVAL.maxMissKm * 1000) return no('miss');
  const vr = f.verticalRate;
  if (vr != null && vr > ARRIVAL.maxClimbMs) return no('climbing');
  if (dist > ARRIVAL.levelAboveKm * 1000 && vr != null && vr > ARRIVAL.minSinkMs) return no('level');
  const minV = f.cls === 'light' ? ARRIVAL.minSpeedMs.light : ARRIVAL.minSpeedMs.other;
  if (f.velocity < minV) return no('slow');
  const eta = dist / f.velocity;
  if (eta > ARRIVAL.maxEtaS) return no('too-long-to-field');
  if (rivalOf(f, field, nowSec, nearby)) return no('other-airport');
  if (held && !recorded && (f.runs ?? 0) < ARRIVAL.confirmRuns) return no('unconfirmed');
  return { arriving: true, why: 'arriving', eta };
}
