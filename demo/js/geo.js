// Geographic helpers: local projection, distances, bearings, runway headings, sun position.
// Angles in degrees unless a name says Rad. Local plane: x = east (m), y = SOUTH (m), so it
// maps straight onto canvas coordinates (y grows downward).

export const R_EARTH = 6371008.8;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Equirectangular projection around a reference point; accurate to <0.1% within ~30 km. */
export function makeProjection(lat0, lon0) {
  const kx = Math.cos(lat0 * D2R) * D2R * R_EARTH;
  const ky = D2R * R_EARTH;
  return {
    lat0,
    lon0,
    toXY(lat, lon) {
      return [(lon - lon0) * kx, -(lat - lat0) * ky];
    },
    toLatLon(x, y) {
      return [lat0 - y / ky, lon0 + x / kx];
    },
  };
}

/** Great-circle distance in metres. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2, degrees true (0 = north, clockwise). */
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Destination point travelling `dist` metres on bearing `brg` (deg). */
export function destination(lat, lon, brg, dist) {
  const d = dist / R_EARTH, b = brg * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, ((l2 * R2D + 540) % 360) - 180];
}

/** Compass bearing (deg, 0 = north) -> canvas angle (rad, 0 = +x/east, +y = south). */
export function bearingToCanvas(brg) {
  return (brg - 90) * D2R;
}

export function canvasToBearing(rad) {
  return ((rad * R2D + 90) % 360 + 360) % 360;
}

/** Smallest absolute difference between two bearings (deg). */
export function angleDiff(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** "17L" -> 170 (magnetic, approximate); "H1" or junk -> null. */
export function headingFromIdent(ident) {
  const m = /^(\d{1,2})[LRCW]?$/i.exec((ident || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

/** Bounding box (degrees) around a point covering `radius` metres. */
export function bboxAround(lat, lon, radius) {
  const dLat = (radius / R_EARTH) * R2D;
  const dLon = dLat / Math.max(0.05, Math.cos(lat * D2R));
  return { lamin: lat - dLat, lamax: lat + dLat, lomin: lon - dLon, lomax: lon + dLon };
}

/**
 * Sun elevation (deg) for a place and UTC time, NOAA solar position approximation
 * (good to ~0.5 deg, plenty for lighting).
 */
export function sunElevation(lat, lon, date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R));
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const L0r = L0 * D2R;
  const eqTime = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (((minutes + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  const cosZen = Math.sin(lat * D2R) * Math.sin(decl) + Math.cos(lat * D2R) * Math.cos(decl) * Math.cos(hourAngle * D2R);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZen))) * R2D;
  return 90 - zenith;
}

/** 0 = full day, 1 = full night, smooth through civil twilight (+6 .. -6 deg). */
export function nightFactor(sunElevDeg) {
  const k = (6 - sunElevDeg) / 12;
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

/** Point-in-polygon (ray casting). pts: [[x,y],...] */
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f;
    cx += (pts[j][0] + pts[i][0]) * f;
    cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p[0]; sy += p[1]; }
    return [sx / pts.length, sy / pts.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a) / 2;
}
