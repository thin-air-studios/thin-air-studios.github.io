// One airport's map as a small inline SVG, drawn from its OpenStreetMap layout (osm/<ICAO>.json.gz, read only).
// Kept: runways, taxiways (and taxi lanes), aprons, terminal outlines and gates. Everything else (buildings, the surroundings)
// is left out. Points are projected to a flat north-up plane around the runway ends, simplified (Douglas-Peucker, about one
// pixel), rounded to whole units and written as relative path commands, so a large airport stays a few kilobytes.
import { esc } from './html.mjs';

const VIEW_W = 1000; // the natural width in units; the height follows the airport's shape, kept within MIN_H..MAX_H
const MIN_H = 520;
const MAX_H = 1000;
const TOL = 1.1; // simplification tolerance, in units
const PAD = 1.28; // the frame is the runway extent plus about 14% on each side
const MIN_SPAN = 0.01; // degrees (about 1 km): one short runway still gets a sensible frame

const TAXI = new Set(['taxiway', 'taxilane']);

/** The frame that maps latitude and longitude to units. Longitude is scaled by cos(latitude) so distances agree. */
export function makeFrame(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  for (const p of points) {
    const x = p.lon * kx;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (p.lat < minY) minY = p.lat;
    if (p.lat > maxY) maxY = p.lat;
  }
  const spanX = Math.max(maxX - minX, MIN_SPAN);
  const spanY = Math.max(maxY - minY, MIN_SPAN);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const totX = spanX * PAD, totY = spanY * PAD;
  let s = VIEW_W / totX;
  if (totY * s > MAX_H) s = MAX_H / totY;
  if (totY * s < MIN_H) s = MIN_H / totY;
  const width = Math.round(totX * s), height = Math.round(totY * s);
  const left = cx - totX / 2, top = cy + totY / 2;
  const xy = (lat, lon) => [(lon * kx - left) * s, (top - lat) * s];
  return { width, height, xy };
}

/** Douglas-Peucker on [x, y] pairs. Keeps the first and last point. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0 && bestD > tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Numbers joined the shortest way: a minus sign separates numbers, so only positive ones need a space. */
function nums(list) {
  let s = '';
  for (let i = 0; i < list.length; i++) {
    if (i && list[i] >= 0) s += ' ';
    s += list[i];
  }
  return s;
}

/** One subpath from integer points: absolute start, then relative steps. */
function subpath(pts, close) {
  if (pts.length < 2) return '';
  const [sx, sy] = pts[0];
  const steps = [];
  let px = sx, py = sy;
  for (let i = 1; i < pts.length; i++) {
    steps.push(pts[i][0] - px, pts[i][1] - py);
    px = pts[i][0];
    py = pts[i][1];
  }
  return `M${sx} ${sy}l${nums(steps)}${close ? 'z' : ''}`;
}

/** Projects, culls, simplifies and rounds a list of lines or rings. Lines outside the frame are dropped. */
function prepare(lines, frame, close) {
  const out = [];
  const margin = 40;
  for (const line of lines) {
    if (line.length < 2) continue;
    const xy = line.map((p) => frame.xy(p.lat, p.lon));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of xy) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < -margin || y1 < -margin || x0 > frame.width + margin || y0 > frame.height + margin) continue;
    const simple = simplify(xy, TOL).map(([x, y]) => [Math.round(x), Math.round(y)]);
    const dedup = simple.filter((p, i) => i === 0 || p[0] !== simple[i - 1][0] || p[1] !== simple[i - 1][1]);
    if (dedup.length < 2) continue;
    out.push(subpath(dedup, close));
  }
  return out.join('');
}

/** Flat point lists from the compact element form: [lat, lon, lat, lon ...]. */
function flatPoints(flat) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ lat: flat[i], lon: flat[i + 1] });
  return pts;
}

/**
 * The map of one airport. runways: the airport's runway rows as { le, he, leLat, leLon, heLat, heLon } (for the frame and the
 * ident labels). map: the parsed osm file ({ e: [[type, id, tags, data]] }). Returns { svg, counts, title } or { svg: '' } when the
 * layout has nothing to draw.
 */
export function airportMap({ map, runways, label }) {
  const counts = { runways: 0, taxiways: 0, aprons: 0, terminals: 0, gates: 0 };
  const runwayLines = [], taxiLines = [], apronRings = [], terminalRings = [], gatePoints = [];
  for (const [type, , tags, data] of map.e || []) {
    if (type === 'n') {
      if (tags.aeroway === 'gate') {
        counts.gates++;
        gatePoints.push([{ lat: data[0], lon: data[1] }]);
      }
    } else if (type === 'w') {
      const aw = tags.aeroway;
      if (aw === 'runway') { counts.runways++; runwayLines.push(flatPoints(data)); }
      else if (TAXI.has(aw)) { counts.taxiways++; taxiLines.push(flatPoints(data)); }
      else if (aw === 'apron') { counts.aprons++; apronRings.push(flatPoints(data)); }
      else if (aw === 'terminal' || tags.building === 'terminal') { counts.terminals++; terminalRings.push(flatPoints(data)); }
    } else if (type === 'r') {
      const aw = tags.aeroway;
      const rings = (data || []).map(([, flat]) => flatPoints(flat));
      if (aw === 'apron') { counts.aprons++; apronRings.push(...rings); }
      else if (aw === 'terminal') { counts.terminals++; terminalRings.push(...rings); }
    }
  }
  // the frame: the runway ends from the runway table, else the runway lines, else whatever is drawn
  let anchor = [];
  for (const r of runways) {
    if (Number.isFinite(r.leLat) && Number.isFinite(r.leLon)) anchor.push({ lat: r.leLat, lon: r.leLon });
    if (Number.isFinite(r.heLat) && Number.isFinite(r.heLon)) anchor.push({ lat: r.heLat, lon: r.heLon });
  }
  if (!anchor.length) anchor = runwayLines.flat();
  if (!anchor.length) anchor = [...apronRings.flat(), ...terminalRings.flat()];
  if (!anchor.length) return { svg: '', counts, title: '' };
  const frame = makeFrame(anchor);

  const dRun = prepare(runwayLines, frame, false);
  const dTaxi = prepare(taxiLines, frame, false);
  const dApron = prepare(apronRings, frame, true);
  const dTerm = prepare(terminalRings, frame, true);
  const dGate = gatePoints
    .map((line) => {
      const [x, y] = frame.xy(line[0].lat, line[0].lon);
      const rx = Math.round(x), ry = Math.round(y);
      return rx < -40 || ry < -40 || rx > frame.width + 40 || ry > frame.height + 40 ? '' : `M${rx} ${ry}h1`;
    })
    .join('');

  // labels: each runway end carries its ident, placed just beyond the end
  const labels = [];
  for (const r of runways) {
    if (!Number.isFinite(r.leLat) || !Number.isFinite(r.heLat)) continue;
    const a = frame.xy(r.leLat, r.leLon), b = frame.xy(r.heLat, r.heLon);
    const dx = a[0] - b[0], dy = a[1] - b[1];
    const len = Math.hypot(dx, dy) || 1;
    const ends = [[a, r.le, dx / len, dy / len], [b, r.he, -dx / len, -dy / len]];
    for (const [[x, y], ident, ux, uy] of ends) {
      const lx = Math.round(x + ux * 26), ly = Math.round(y + uy * 26);
      if (lx < 4 || ly < 4 || lx > frame.width - 4 || ly > frame.height - 4) continue;
      labels.push(`<text x="${lx}" y="${ly}">${esc(ident)}</text>`);
    }
  }

  const title = label;
  const svg = [
    `<svg class="airport-map" viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-labelledby="airport-map-title" focusable="false">`,
    `<title id="airport-map-title">${esc(title)}</title>`,
    dApron && `<path class="m-apron" d="${dApron}"/>`,
    dTaxi && `<path class="m-taxi" d="${dTaxi}"/>`,
    dTerm && `<path class="m-term" d="${dTerm}"/>`,
    dRun && `<path class="m-run" d="${dRun}"/>`,
    dGate && `<path class="m-gate" d="${dGate}"/>`,
    labels.length && `<g class="m-id">${labels.join('')}</g>`,
    '</svg>',
  ].filter(Boolean).join('');
  return { svg, counts, title, frame: { width: frame.width, height: frame.height } };
}
