// The land around the airport, stylised but true to place: the real coastline and lakes (from
// OpenStreetMap) with boats on them, mountains drawn where the real ranges are (Denver's Rockies to
// the west), tumbleweeds rolling across desert airports. Static parts are painted once into the
// background; boats and tumbleweeds are visual only (no simulation state, never rewound).
import { makeProjection } from './geo.js?v=86c2b44d';
import { worldScale } from './airport.js?v=86c2b44d';
import { WORLD_H, UPRIGHT_H_MAX, UPRIGHT_W } from './config.js?v=86c2b44d';
import { makeRng, TAU } from './util.js?v=86c2b44d';

// ------------------------------------------------------------------ data

/** Format of the compact surroundings: data in another version is ignored and fetched again. */
export const SUR_VERSION = 2;

// small or artificial water we leave out: it's clutter at airport scale
const SKIP_WATER = 'pond|wastewater|basin|pool|swimming_pool|fountain|reflecting_pool|drain|ditch|stream|lock|moat|tank|fish_pass';

/**
 * Overpass QL for the surroundings: coastline and large water in a box (shorelines of 600 m and
 * more: ponds are clutter at airport scale and slow the query), high peaks within about 120 km.
 */
export function surroundQuery(lat, lon, halfM, elevM) {
  const box = (m, dp) => {
    const dLat = m / 111320, dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
    return `${(lat - dLat).toFixed(dp)},${(lon - dLon).toFixed(dp)},${(lat + dLat).toFixed(dp)},${(lon + dLon).toFixed(dp)}`;
  };
  const bb = box(halfM, 4), far = box(120000, 3);
  const minEle = Math.round((elevM || 0) + 900);
  const big = '(if: length() > 600)';
  return `[out:json][timeout:90];(` +
    `way["natural"="coastline"](${bb});` +
    `way["natural"="water"]["water"!~"^(${SKIP_WATER})$"]${big}(${bb});` +
    `relation["natural"="water"]["water"!~"^(${SKIP_WATER})$"]${big}(${bb});` +
    `way["waterway"="riverbank"]${big}(${bb});` +
    `);out geom(${bb});` +
    `node["natural"="peak"]["ele"](${far})(if: number(t["ele"]) > ${minEle});out 400;`;
}

/**
 * How far around the airport to look (m): the whole map plus its painted margin, on any phone shape
 * (the world is 600 units tall and 700-1400 wide). A coastline that stopped short on screen would
 * leave the sea undecided.
 */
export function surroundHalfSize(L) {
  let half = 9000;
  for (const W of [700, 1000, 1400]) half = Math.max(half, (W / 2 + 110) * worldScale(L, W), (WORLD_H / 2 + 110) * worldScale(L, W));
  // an upright airspace (DECISIONS 440) is taller than any landscape one: its tallest world, at the landscape scale, is covered too
  half = Math.max(half, (UPRIGHT_H_MAX / 2 + 110) * worldScale(L, UPRIGHT_W));
  return Math.min(30000, Math.round(half));
}

/** Douglas-Peucker on [x, y] points. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (pts.length > 3 && fx === lx && fy === ly) {
    // a closed ring (an island, a lake): split it at the point farthest from the start
    let far = 1, fd = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i][0] - fx, pts[i][1] - fy);
      if (d > fd) [far, fd] = [i, d];
    }
    return simplify(pts.slice(0, far + 1), tol).concat(simplify(pts.slice(far), tol).slice(1));
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let worst = -1, wd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > wd) [worst, wd] = [i, d];
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Join way pieces end to end into longer chains (lakes and rivers come in parts).
 * directed: only join end to start (a coastline's direction says which side the sea is).
 */
export function joinChains(chains, eps = 1, directed = false) {
  const out = chains.map((c) => c.slice()).filter((c) => c.length > 1);
  const same = (p, q) => Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = 0; j < out.length && !merged; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        if (same(a[a.length - 1], b[0])) out[i] = a.concat(b.slice(1));
        else if (!directed && same(a[a.length - 1], b[b.length - 1])) out[i] = a.concat(b.slice(0, -1).reverse());
        else continue;
        out.splice(j, 1);
        merged = true;
      }
    }
  }
  return out;
}

const closed = (c) => c.length > 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
const area = (pts) => {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(s / 2);
};

/**
 * Overpass answer -> compact, simplified surroundings, in lat/lon (6 decimals):
 * { v, at, coast: [flat], water: [flat], peaks: [[lat, lon, ele]] }. Coastline pieces keep their
 * direction (land on the left), which is how the sea side is found.
 */
export function compactSurroundings(osm, lat0, lon0, tolM = 25) {
  const proj = makeProjection(lat0, lon0);
  const toXY = (g) => proj.toXY(g.lat, g.lon);
  // a clipped geometry has nulls where it leaves the box: split there
  const pieces = (geom) => {
    const out = [];
    let cur = [];
    for (const g of geom || []) {
      if (!g) {
        if (cur.length > 1) out.push(cur);
        cur = [];
      } else cur.push(toXY(g));
    }
    if (cur.length > 1) out.push(cur);
    return out;
  };
  const coast = [], water = [], peaks = [];
  for (const el of osm.elements || []) {
    const t = el.tags || {};
    if (el.type === 'node' && t.natural === 'peak') {
      const ele = parseFloat(String(t.ele).replace(',', '.'));
      if (Number.isFinite(ele)) peaks.push([+el.lat.toFixed(4), +el.lon.toFixed(4), Math.round(ele)]);
    } else if (el.type === 'way' && t.natural === 'coastline') coast.push(...pieces(el.geometry));
    else if (el.type === 'way') water.push(...pieces(el.geometry));
    else if (el.type === 'relation') {
      const outer = (el.members || []).filter((m) => m.role !== 'inner').flatMap((m) => pieces(m.geometry));
      water.push(...joinChains(outer));
    }
  }
  const back = (pts) => pts.flatMap(([x, y]) => {
    const [la, lo] = proj.toLatLon(x, y);
    return [Math.round(la * 1e6) / 1e6, Math.round(lo * 1e6) / 1e6];
  });
  peaks.sort((a, b) => b[2] - a[2]);
  return {
    v: SUR_VERSION,
    at: new Date().toISOString().slice(0, 10),
    // islets too small to see are dropped (a closed ring of under about 3 hectares)
    coast: joinChains(coast, 1, true).map((c) => simplify(c, tolM)).filter((c) => c.length > 1 && !(closed(c) && area(c) < 30000)).map(back),
    // lakes and rivers big enough to matter (about 3 hectares and up)
    water: water.map((c) => simplify(c, tolM)).filter((c) => c.length > 2 && area(c) > 30000).map(back),
    peaks: peaks.slice(0, 250),
  };
}

// ------------------------------------------------------------ in the world

/** Surroundings (lat/lon) -> world units for this airport's world. */
export function surroundingsInWorld(sur, world) {
  const proj = world.L.proj;
  const toW = (flat) => {
    const out = [];
    for (let i = 0; i < flat.length; i += 2) {
      const [x, y] = proj.toXY(flat[i], flat[i + 1]);
      out.push(world.toWorld(x, y));
    }
    return out;
  };
  return {
    coast: (sur.coast || []).map(toW),
    water: (sur.water || []).map(toW),
    peaks: (sur.peaks || []).map(([la, lo, ele]) => {
      const [x, y] = proj.toXY(la, lo);
      const [wx, wy] = world.toWorld(x, y);
      return { x: wx, y: wy, ele };
    }),
  };
}

/**
 * Where the water is, on a grid of `cell` world units covering b ({x0, y0, x1, y1}):
 * lakes and rivers filled as polygons, the sea flood-filled from the water side of every coastline.
 * Returns { cell, x0, y0, nx, ny, data } with data[i] = 1 for water.
 */
export function waterMask(ws, b, cell = 3) {
  const nx = Math.ceil((b.x1 - b.x0) / cell), ny = Math.ceil((b.y1 - b.y0) / cell);
  const data = new Uint8Array(nx * ny);
  const gx = (x) => (x - b.x0) / cell, gy = (y) => (y - b.y0) / cell;
  // lakes and rivers: scanline polygon fill
  for (const poly of ws.water) fillPoly(data, nx, ny, poly.map(([x, y]) => [gx(x), gy(y)]));
  if (ws.coast.length) {
    // the coastline as walls splits the map into regions; each region then votes on whether it's
    // sea, from points just either side of every coastline segment (OSM keeps the land on the left).
    // A vote rather than a flood from the sea side: a narrow inlet can't let the sea onto the land.
    const wall = new Uint8Array(nx * ny);
    const probes = [];
    for (const line of ws.coast) {
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = [gx(line[i - 1][0]), gy(line[i - 1][1])], [bx, by] = [gx(line[i][0]), gy(line[i][1])];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
        for (let s = 0; s <= steps; s++) {
          const x = Math.floor(ax + ((bx - ax) * s) / steps), y = Math.floor(ay + ((by - ay) * s) / steps);
          if (x >= 0 && y >= 0 && x < nx && y < ny) wall[y * nx + x] = 1;
        }
        const L = Math.hypot(bx - ax, by - ay);
        if (!L) continue;
        const rx = -(by - ay) / L, ry = (bx - ax) / L; // to the right, with y pointing down
        for (const k of [0.25, 0.5, 0.75]) {
          const mx = ax + (bx - ax) * k, my = ay + (by - ay) * k;
          probes.push([mx + rx * 0.9, my + ry * 0.9, 1], [mx - rx * 0.9, my - ry * 0.9, -1]);
        }
      }
    }
    // label the regions between the walls
    const region = new Int32Array(nx * ny).fill(-1);
    let regions = 0;
    const stack = [];
    for (let i0 = 0; i0 < region.length; i0++) {
      if (wall[i0] || region[i0] >= 0) continue;
      region[i0] = regions;
      stack.push(i0);
      while (stack.length) {
        const i = stack.pop();
        const x = i % nx;
        if (x > 0 && !wall[i - 1] && region[i - 1] < 0) (region[i - 1] = regions), stack.push(i - 1);
        if (x < nx - 1 && !wall[i + 1] && region[i + 1] < 0) (region[i + 1] = regions), stack.push(i + 1);
        if (i >= nx && !wall[i - nx] && region[i - nx] < 0) (region[i - nx] = regions), stack.push(i - nx);
        if (i + nx < region.length && !wall[i + nx] && region[i + nx] < 0) (region[i + nx] = regions), stack.push(i + nx);
      }
      regions++;
    }
    const vote = new Float64Array(regions);
    for (const [px, py, v] of probes) {
      const x = Math.floor(px), y = Math.floor(py);
      if (x >= 0 && y >= 0 && x < nx && y < ny && region[y * nx + x] >= 0) vote[region[y * nx + x]] += v;
    }
    const sea = new Uint8Array(nx * ny);
    let n = 0, open = 0;
    for (let i = 0; i < sea.length; i++) {
      if (region[i] < 0) continue;
      open++;
      if (vote[region[i]] > 0) {
        sea[i] = 1;
        n++;
      }
    }
    // a gap in the coastline joins land and sea into one region: then trust only the lakes
    if (n < open * 0.97) for (let i = 0; i < sea.length; i++) if (sea[i] || (wall[i] && neighbourSea(sea, i, nx, ny))) data[i] = 1;
  }
  return { cell, x0: b.x0, y0: b.y0, nx, ny, data };
}

function neighbourSea(sea, i, nx, ny) {
  const x = i % nx, y = (i - x) / nx;
  return (x > 0 && sea[i - 1]) || (x < nx - 1 && sea[i + 1]) || (y > 0 && sea[i - nx]) || (y < ny - 1 && sea[i + nx]);
}

function fillPoly(data, nx, ny, pts) {
  if (pts.length < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(ny - 1, Math.ceil(y1)); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(nx - 1, Math.floor(xs[k + 1] - 0.5)); x++) data[y * nx + x] = 1;
    }
  }
}

export const isWater = (m, x, y) => {
  if (!m) return false;
  const gx = Math.floor((x - m.x0) / m.cell), gy = Math.floor((y - m.y0) / m.cell);
  return gx >= 0 && gy >= 0 && gx < m.nx && gy < m.ny && m.data[gy * m.nx + gx] === 1;
};

// ---------------------------------------------------------------- paint

/** Box blur of a grid (radius r cells), as floats 0..1. */
function blurGrid(src, nx, ny, r) {
  const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
  const n = 2 * r + 1;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * nx + Math.min(nx - 1, Math.max(0, x + k))];
      tmp[y * nx + x] = s / n;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(ny - 1, Math.max(0, y + k)) * nx + x];
      out[y * nx + x] = s / n;
    }
  }
  return out;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The mask as water with smooth shores: the grid is softened and sampled finer than its cells, so
 * the coast reads as a curve, not steps. Shallow water along the shore, deeper blue further out.
 */
export function paintWater(ctx, m, theme) {
  if (!m || !m.data.some((v) => v)) return;
  // built once per map: the background is repainted at every new zoom level
  if (!m.image || m.imageTheme !== theme) {
    m.image = waterImage(m, theme);
    m.imageTheme = theme;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(m.image, m.x0, m.y0, m.nx * m.cell, m.ny * m.cell);
  ctx.restore();
}

function waterImage(m, theme) {
  const { nx, ny } = m;
  const shape = blurGrid(m.data, nx, ny, 1), depth = blurGrid(m.data, nx, ny, 3);
  const k = 3; // image pixels per cell
  const W = nx * k, H = ny * k;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  const sh = hex(theme === 'arid' ? '#9fd6d6' : '#8fd0e2'), dp = hex(theme === 'tundra' ? '#5c8ea8' : '#4a9cc4');
  // cells with no water near them are skipped without sampling
  const wet = new Uint8Array(nx * ny);
  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      const i = y * nx + x;
      wet[i] = shape[i] >= 0.4 || shape[i + 1] >= 0.4 || shape[i + nx] >= 0.4 || shape[i + nx + 1] >= 0.4 ? 1 : 0;
    }
  }
  // bilinear sampling between cell centres, with the column lookups worked out once
  const colX = new Int32Array(W), colT = new Float32Array(W);
  for (let px = 0; px < W; px++) {
    const fx = (px + 0.5) / k - 0.5, x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    colX[px] = x0;
    colT[px] = Math.min(1, Math.max(0, fx - x0));
  }
  for (let py = 0; py < H; py++) {
    const fy = (py + 0.5) / k - 0.5, y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const ty = Math.min(1, Math.max(0, fy - y0)), base = y0 * nx;
    for (let px = 0; px < W; px++) {
      const i = base + colX[px];
      if (!wet[i]) continue;
      const tx = colT[px];
      const a = (shape[i] * (1 - tx) + shape[i + 1] * tx) * (1 - ty) + (shape[i + nx] * (1 - tx) + shape[i + nx + 1] * tx) * ty;
      if (a < 0.4) continue;
      const dv = (depth[i] * (1 - tx) + depth[i + 1] * tx) * (1 - ty) + (depth[i + nx] * (1 - tx) + depth[i + nx + 1] * tx) * ty;
      const deep = smooth(0.55, 0.98, dv);
      const o = (py * W + px) * 4;
      d[o] = sh[0] + (dp[0] - sh[0]) * deep;
      d[o + 1] = sh[1] + (dp[1] - sh[1]) * deep;
      d[o + 2] = sh[2] + (dp[2] - sh[2]) * deep;
      d[o + 3] = 255 * smooth(0.4, 0.6, a);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Mountains where the real ones are: peaks on the screen at their place, and the ranges beyond it
 * gathered at the edge of the map in their true direction, sized by how far they rise above the field.
 * Seen from above: faceted pyramids lit from the north-west, snow on the high ones.
 * b: the airspace on screen ({x0, y0, x1, y1}); avoid(x, y): keep off the airfield and the water.
 */
export function paintMountains(ctx, peaks, elevM, b, avoid, seed = 1, mpu = 10) {
  if (!peaks || !peaks.length) return;
  const rng = makeRng(seed);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const inside = (p) => p.x > b.x0 + 20 && p.x < b.x1 - 20 && p.y > b.y0 + 20 && p.y < b.y1 - 20;
  const marks = [];
  // the ranges beyond the map count by how high they'd look from the field (rise over distance):
  // Denver's Rockies or Seattle's Rainier do, a lone hill 100 km off doesn't
  const sector = new Map();
  for (const p of peaks) {
    const rel = p.ele - elevM;
    if (rel < 700) continue;
    if (inside(p)) {
      marks.push({ x: p.x, y: p.y, size: Math.min(46, 12 + rel / 70), ele: p.ele, rel });
      continue;
    }
    const look = rel / (Math.hypot(p.x - cx, p.y - cy) * mpu);
    if (look < 0.02) continue;
    const k = Math.round(Math.atan2(p.y - cy, p.x - cx) / (TAU / 30));
    const s = sector.get(k);
    if (!s || look > s.look) sector.set(k, { ang: Math.atan2(p.y - cy, p.x - cx), look, rel, ele: p.ele });
  }
  for (const s of sector.values()) {
    // where the bearing leaves the map, just inside its edge: a cluster of three to six summits
    const dx = Math.cos(s.ang), dy = Math.sin(s.ang);
    const tx = dx ? ((dx > 0 ? b.x1 : b.x0) - cx) / dx : Infinity, ty = dy ? ((dy > 0 ? b.y1 : b.y0) - cy) / dy : Infinity;
    const t = Math.min(tx, ty) - 18;
    const n = 3 + Math.min(4, Math.floor((s.look - 0.02) / 0.005));
    const size = Math.min(50, 28 + (s.look - 0.02) * 1400);
    for (let i = 0; i < n; i++) {
      const along = (rng() - 0.5) * 130, back = rng() * 40;
      marks.push({ x: cx + dx * (t - back) - dy * along, y: cy + dy * (t - back) + dx * along, size: size * (0.6 + rng() * 0.4), ele: s.ele, rel: s.rel });
    }
  }
  marks.sort((p, q) => p.y - q.y);
  for (const m of marks) {
    if (avoid(m.x, m.y)) continue;
    drawPeak(ctx, m.x, m.y, m.size, m.ele > 3000 || m.rel > 1800, rng);
  }
}

function drawPeak(ctx, x, y, r, snow, rng) {
  // a faceted summit from above: 5-7 ridges out from the top, sunlit faces to the north-west
  const n = 5 + Math.floor(rng() * 3);
  const rot = rng() * TAU;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * TAU) / n + (rng() - 0.5) * 0.4;
    const rr = r * (0.75 + rng() * 0.45);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85, a]);
  }
  const tip = [x + (rng() - 0.5) * r * 0.2, y + (rng() - 0.5) * r * 0.2];
  ctx.save();
  ctx.fillStyle = 'rgba(30,30,25,0.18)';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + 4, py + 6) : ctx.moveTo(px + 4, py + 6)));
  ctx.fill();
  for (let i = 0; i < n; i++) {
    const [ax, ay, aa] = pts[i], [bx, by, ba] = pts[(i + 1) % n];
    const mid = (aa + ba) / 2 + (ba < aa ? Math.PI : 0);
    const light = 0.5 + 0.5 * Math.cos(mid - (-Math.PI * 0.75)); // lit from the north-west
    const shade = Math.round(95 + light * 85);
    ctx.fillStyle = `rgb(${shade + 12},${shade + 4},${shade - 12})`;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
    if (snow) {
      ctx.fillStyle = `rgba(250,252,255,${0.55 + light * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] + (ax - tip[0]) * 0.42, tip[1] + (ay - tip[1]) * 0.42);
      ctx.lineTo(tip[0] + (bx - tip[0]) * 0.42, tip[1] + (by - tip[1]) * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------- live layer

function hull(ctx, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(4 + ox, oy);
  ctx.quadraticCurveTo(2 + ox, -1.7 + oy, -3.5 + ox, -1.4 + oy);
  ctx.lineTo(-3.5 + ox, 1.4 + oy);
  ctx.quadraticCurveTo(2 + ox, 1.7 + oy, 4 + ox, oy);
  ctx.fill();
}

/** A small cargo ship: dark hull, a deck of containers, the bridge at the stern. */
function drawShip(ctx, colour) {
  ctx.fillStyle = 'rgba(20,40,60,0.3)';
  ctx.fillRect(-6.5, -1.4, 13.5, 3.4);
  ctx.fillStyle = '#34495a';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(5, -1.8);
  ctx.lineTo(-7, -1.8);
  ctx.lineTo(-7, 1.8);
  ctx.lineTo(5, 1.8);
  ctx.closePath();
  ctx.fill();
  const cols = [colour, '#e8e2d4', '#c96a3b', '#5a7fa6'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.fillRect(-3.4 + i * 2.1, -1.3, 1.8, 2.6);
  }
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(-6.4, -1.3, 2, 2.6);
}

// Boats keep to open water. A boat's centre keeps a margin from the shore (more for ships); it routes to a
// target in its own patch of water, so no target lies across land; it steers off the shore by looking ahead.
// A boat that stops making progress fades out and comes back in open water (see update).
const BOAT_EDGE = 30; // boats route this far inside the screen's edge (a ship's length and more)
const BOAT_CELL = 6; // routing grid: one node per 6 world units
const BOAT_CLEAR = { small: 20, ship: 30 }; // how far a route keeps from the shore, by kind of boat
const BOAT_MIN_PATCH = 40; // a patch of water this small (in nodes) is a pond: no boats
const BOAT_STALL_S = 3; // less than a unit of progress in this long: stuck (a ship turning slowly still creeps on)
const BOAT_FADE_S = 0.6;
const BOAT_TURN = { sail: 1.1, motor: 1.5, ship: 0.45 }; // turning rate, rad/s
const BOAT_NEI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const BOAT_STEER = [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, 2.8, -2.8];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Distance (world units) from each water cell to the nearest land cell: a two-pass chamfer. */
function shoreDistance(mask) {
  const { nx, ny, data } = mask;
  const d = new Float32Array(nx * ny), D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = data[i] ? 1e4 : 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - nx] + 1);
        if (x > 0) v = Math.min(v, d[i - nx - 1] + D);
        if (x < nx - 1) v = Math.min(v, d[i - nx + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = ny - 1; y >= 0; y--) {
    for (let x = nx - 1; x >= 0; x--) {
      const i = y * nx + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < nx - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < ny - 1) {
        v = Math.min(v, d[i + nx] + 1);
        if (x < nx - 1) v = Math.min(v, d[i + nx + 1] + D);
        if (x > 0) v = Math.min(v, d[i + nx - 1] + D);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] *= mask.cell;
  return d;
}

/**
 * How far the nearest land is from (x, y), in world units: 0 on land and off the mapped area. Blended between the
 * cell centres, so it changes smoothly as a boat moves (a cell-by-cell value would leave a boat with no step to take).
 */
function shoreAt(mask, x, y) {
  const d = mask.shore || (mask.shore = shoreDistance(mask));
  const fx = (x - mask.x0) / mask.cell - 0.5, fy = (y - mask.y0) / mask.cell - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const top = shoreCell(mask, d, ix, iy) * (1 - tx) + shoreCell(mask, d, ix + 1, iy) * tx;
  const bottom = shoreCell(mask, d, ix, iy + 1) * (1 - tx) + shoreCell(mask, d, ix + 1, iy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}
function shoreCell(mask, d, i, j) {
  return i >= 0 && j >= 0 && i < mask.nx && j < mask.ny ? d[j * mask.nx + i] : 0;
}

/** The nodes a boat can step to from node c: water neighbours, but no cutting the corner of land. */
function boatNeighbours(nav, c) {
  const { nx, ny, ok } = nav, i = c % nx, j = (c - i) / nx, out = [];
  for (const [di, dj] of BOAT_NEI) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= nx || b >= ny || !ok[b * nx + a]) continue;
    if (di && dj && (!ok[j * nx + a] || !ok[b * nx + i])) continue;
    out.push(b * nx + a);
  }
  return out;
}

/**
 * The water one kind of boat may use: the nodes of a coarse grid over the screen that sit at least `clear` from the
 * shore, joined into patches. Patches too small for boats are dropped. cells lists the usable nodes.
 */
function boatNav(mask, W, H, clear) {
  const nx = Math.floor((W - 2 * BOAT_EDGE) / BOAT_CELL) + 1, ny = Math.floor((H - 2 * BOAT_EDGE) / BOAT_CELL) + 1;
  const nav = { nx, ny, W, H, x0: BOAT_EDGE, y0: BOAT_EDGE, ok: new Uint8Array(nx * ny), patch: new Int32Array(nx * ny).fill(-1), cells: [] };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) nav.ok[j * nx + i] = shoreAt(mask, nav.x0 + i * BOAT_CELL, nav.y0 + j * BOAT_CELL) >= clear ? 1 : 0;
  }
  const sizes = [], stack = [];
  for (let s = 0; s < nav.ok.length; s++) {
    if (!nav.ok[s] || nav.patch[s] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    nav.patch[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop();
      n++;
      for (const k of boatNeighbours(nav, c)) if (nav.patch[k] < 0) (nav.patch[k] = id), stack.push(k);
    }
    sizes.push(n);
  }
  for (let c = 0; c < nav.ok.length; c++) if (nav.ok[c] && sizes[nav.patch[c]] < BOAT_MIN_PATCH) nav.ok[c] = 0;
  for (let c = 0; c < nav.ok.length; c++) if (nav.ok[c]) nav.cells.push(c);
  return nav;
}

/** Moves a boat to a spot in open water anywhere on the screen, and clears its route. */
function placeBoat(b) {
  const nav = b.nav, c = nav.cells[Math.floor(Math.random() * nav.cells.length)];
  b.x = nav.x0 + (c % nav.nx) * BOAT_CELL + (Math.random() - 0.5) * 3;
  b.y = nav.y0 + Math.floor(c / nav.nx) * BOAT_CELL + (Math.random() - 0.5) * 3;
  b.patch = nav.patch[c];
  b.route = null;
  b.wp = 0;
  b.routeT = 0;
  b.ax = b.x;
  b.ay = b.y;
  b.idle = 0;
  b.h = Math.random() * TAU;
}

/** The usable node of the boat's own patch nearest to (x, y), or -1 when there is none close by. */
function nearestNode(nav, x, y, patch) {
  const i0 = Math.round((x - nav.x0) / BOAT_CELL), j0 = Math.round((y - nav.y0) / BOAT_CELL);
  let best = -1, bd = Infinity;
  for (let dj = -16; dj <= 16; dj++) {
    for (let di = -16; di <= 16; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= nav.nx || j >= nav.ny) continue;
      const c = j * nav.nx + i;
      if (nav.ok[c] && nav.patch[c] === patch && di * di + dj * dj < bd) (bd = di * di + dj * dj), (best = c);
    }
  }
  return best;
}

/** Is the straight run from a to b at least `clear` from the shore all the way? */
function clearLine(mask, a, b, clear) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
  for (let s = 1; s < n; s++) {
    const t = s / n;
    if (shoreAt(mask, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) < clear) return false;
  }
  return true;
}

/** A route with the bends it does not need taken out: each leg runs straight while it stays clear of the shore. */
function smoothRoute(mask, pts, clear) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; ) {
    let k = pts.length - 1;
    while (k > i + 1 && !clearLine(mask, pts[i], pts[k], clear)) k--;
    out.push(pts[k]);
    i = k;
  }
  return out;
}

/**
 * A new route for the boat: a target at least 8 steps away in its own patch of water, reached along usable nodes
 * (a breadth-first search), so it can never lie across land. False when the boat has no usable node near it.
 */
function planRoute(mask, b) {
  const nav = b.nav, n = nav.ok.length;
  const src = nearestNode(nav, b.x, b.y, b.patch);
  if (src < 0) return false;
  const depth = new Int32Array(n).fill(-1), prev = new Int32Array(n).fill(-1), queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = src;
  depth[src] = 0;
  while (head < tail) {
    const c = queue[head++];
    for (const k of boatNeighbours(nav, c)) {
      if (depth[k] >= 0) continue;
      depth[k] = depth[c] + 1;
      prev[k] = c;
      queue[tail++] = k;
    }
  }
  const far = depth[queue[tail - 1]];
  if (far < 1) return false;
  const minD = Math.min(8, far), goals = [];
  for (let k = 0; k < tail; k++) if (depth[queue[k]] >= minD) goals.push(queue[k]);
  // a target ahead of her where there is one (turning back on herself near the shore is what runs a boat aground), and
  // half the time one clear of the screen's edges, so boats spread over the water rather than gather at the edges
  const xy = (c) => [nav.x0 + (c % nav.nx) * BOAT_CELL, nav.y0 + Math.floor(c / nav.nx) * BOAT_CELL];
  const ahead = (c) => {
    const [x, y] = xy(c);
    return Math.abs(wrapAngle(Math.atan2(y - b.y, x - b.x) - b.h)) < 1.2;
  };
  const inner = (c) => {
    const [x, y] = xy(c);
    return x >= 60 && x <= nav.W - 60 && y >= 60 && y <= nav.H - 60;
  };
  const wantInner = Math.random() < 0.5;
  let pool = goals.filter((c) => ahead(c) && (!wantInner || inner(c)));
  if (!pool.length) pool = goals.filter(ahead);
  if (!pool.length) pool = goals;
  const goal = pool[Math.floor(Math.random() * pool.length)];
  const pts = [];
  for (let c = goal; c >= 0; c = prev[c]) pts.push({ x: nav.x0 + (c % nav.nx) * BOAT_CELL, y: nav.y0 + Math.floor(c / nav.nx) * BOAT_CELL });
  pts.reverse();
  b.route = smoothRoute(mask, pts, b.clear);
  b.wp = 0;
  b.routeT = 0;
  return true;
}

/** The waypoint the boat is heading for, planning a new route when the old one is done (or too old). */
function nextWaypoint(mask, b) {
  for (let plans = 0; plans < 2; plans++) {
    if (!b.route || b.wp >= b.route.length || b.routeT > 60) {
      if (!planRoute(mask, b)) return null;
    }
    for (; b.wp < b.route.length; b.wp++) {
      const w = b.route[b.wp];
      if (Math.hypot(w.x - b.x, w.y - b.y) >= 8) return w;
    }
  }
  return null;
}

/** How far (x, y) is inside the screen's edge, in world units (negative beyond it). The sea runs on past the screen. */
function edgeRoom(sc, x, y) {
  return Math.min(x, sc.W - x, y, sc.H - y);
}

/** The direction with the most room around the boat (water, and clear of the screen's edges): where to go when she is blocked. */
function roomiest(sc, b) {
  let best = b.h, bv = -1;
  for (let k = 0; k < 16; k++) {
    const c = (k * TAU) / 16, x = b.x + Math.cos(c) * 8, y = b.y + Math.sin(c) * 8;
    const v = Math.min(shoreAt(sc.mask, x, y), edgeRoom(sc, x, y) + 12);
    if (v > bv) (best = c), (bv = v);
  }
  return best;
}

/**
 * One step of a boat's course: towards its next waypoint, turned away from the shore ahead, and back toward the middle
 * of the screen when it drifts to the edge. Never closer to the shore than it is now, and never off the screen. A boat
 * keeps way on while it turns; it only stops when it cannot make progress.
 */
function steerBoat(sc, b, dt) {
  const speed = b.v * 3; // world units a second
  if (shoreAt(sc.mask, b.x, b.y) < 2) {
    b.fade = -1; // on land (never by its own steering): fade out and move to open water
    return;
  }
  if (Math.hypot(b.x - b.ax, b.y - b.ay) > 1) {
    b.ax = b.x;
    b.ay = b.y;
    b.idle = 0;
  } else if ((b.idle += dt) > BOAT_STALL_S) {
    b.fade = -1; // stuck: fade out, then move (see update)
    return;
  }
  b.routeT += dt;
  const w = nextWaypoint(sc.mask, b);
  if (!w) {
    b.fade = -1;
    return;
  }
  const want = Math.atan2(w.y - b.y, w.x - b.x);
  const here = shoreAt(sc.mask, b.x, b.y);
  // the course nearest the wanted one that stays clear ahead. She looks along her own heading too, since she keeps
  // moving along it while she turns: if that runs at the shore, she turns away from it.
  const look = b.fp + speed * 0.6;
  // clear means the margin, or no less water than she has here (so a boat already close in can run along the shore)
  const need = Math.min(b.fp + 4, here - 0.5);
  const clearAhead = (c) => {
    const x = b.x + Math.cos(c) * look, y = b.y + Math.sin(c) * look;
    return shoreAt(sc.mask, x, y) >= need && edgeRoom(sc, x, y) >= 0;
  };
  const clearCourse = (c) => {
    for (const off of BOAT_STEER) if (clearAhead(c + off)) return c + off;
    return null;
  };
  let course, pace = 1;
  if (here < b.fp + 2) {
    // too close to the shore already: back off first, slowly
    course = roomiest(sc, b);
    pace = 0.5;
  } else if (edgeRoom(sc, b.x, b.y) < 22) {
    // drifting to the edge of the screen: back toward its middle
    course = Math.atan2(sc.H / 2 - b.y, sc.W / 2 - b.x);
    pace = 0.6;
  } else {
    course = clearCourse(want);
    if (course === null || !clearAhead(b.h)) {
      const alt = clearCourse(b.h);
      if (alt !== null) {
        course = alt;
        pace = 0.5;
      } else {
        course = roomiest(sc, b);
        pace = 0.35;
      }
    }
  }
  const e = wrapAngle(course - b.h), turn = BOAT_TURN[b.kind] * dt;
  b.h += Math.max(-turn, Math.min(turn, e));
  const step = speed * pace * Math.max(0.3, 1 - Math.abs(e) / 1.8) * dt;
  // she moves along her heading, or, if that runs into the shore while she turns, along the course she has chosen
  for (const dir of [b.h, course]) {
    const nx = b.x + Math.cos(dir) * step, ny = b.y + Math.sin(dir) * step;
    if (edgeRoom(sc, nx, ny) >= 0 && shoreAt(sc.mask, nx, ny) >= Math.min(b.fp, here)) {
      b.x = nx;
      b.y = ny;
      break;
    }
  }
}

/** Boats on the water, tumbleweeds across the desert: drawn under the traffic, never simulated. */
export class Scenery {
  constructor({ mask = null, theme = 'green', W, H, avoid = () => false, wind = () => [1, 0] }) {
    this.mask = mask;
    this.W = W;
    this.H = H;
    this.wind = wind;
    this.boats = [];
    this.weeds = [];
    // the usable water inside the screen: one grid for small boats, a wider margin for ships
    const navs = mask ? { small: boatNav(mask, W, H, BOAT_CLEAR.small), ship: boatNav(mask, W, H, BOAT_CLEAR.ship) } : null;
    const area = (nav) => (nav ? nav.cells.length * BOAT_CELL * BOAT_CELL : 0);
    // one boat per ~6,000 square units of open water, up to a dozen; on big water, a ship or two
    const nBoats = Math.min(12, Math.floor(area(navs && navs.small) / 6000));
    let ships = area(navs && navs.ship) > 60000 ? 1 + (area(navs && navs.ship) > 200000 ? 1 : 0) : 0;
    for (let i = 0; i < nBoats; i++) {
      const kind = ships > 0 ? 'ship' : Math.random() < 0.55 ? 'sail' : 'motor';
      if (kind === 'ship') ships--;
      const v = kind === 'ship' ? 1.4 + Math.random() * 0.6 : kind === 'sail' ? 2.5 + Math.random() * 2 : 5 + Math.random() * 4;
      const size = kind === 'ship' ? 2.2 + Math.random() * 0.6 : kind === 'sail' ? 1.8 : 1.5 + Math.random() * 0.6;
      const colour = ['#d8473f', '#2f5d8a', '#f2b33d', '#2e8a6e'][Math.floor(Math.random() * 4)];
      const b = {
        kind, sail: kind === 'sail', v, size, colour,
        nav: kind === 'ship' ? navs.ship : navs.small,
        clear: kind === 'ship' ? BOAT_CLEAR.ship : BOAT_CLEAR.small,
        // the half-length of the hull plus a little: the clearance the boat's centre keeps from the shore
        fp: (kind === 'ship' ? 7 : 4) * size + 2,
        route: null, wp: 0, routeT: 0, ax: 0, ay: 0, idle: 0,
        alpha: 0, fade: 1, // fades in
      };
      placeBoat(b);
      this.boats.push(b);
    }
    if (theme === 'arid') {
      for (let i = 0, tries = 0; i < 7 && tries < 200; tries++) {
        const x = Math.random() * W, y = Math.random() * H;
        if (avoid(x, y) || isWater(mask, x, y)) continue;
        this.weeds.push({ x, y, r: 5 + Math.random() * 3, spin: 0, hop: Math.random() * TAU, v: 0.6 + Math.random() * 0.8 });
        i++;
      }
    }
    this.avoid = avoid;
  }

  update(dt) {
    for (const b of this.boats) {
      if (b.fade) {
        // a stuck boat fades out, is moved to open water while it cannot be seen, then fades back in
        b.alpha = Math.min(1, Math.max(0, b.alpha + (b.fade * dt) / BOAT_FADE_S));
        if (b.fade < 0 && b.alpha === 0) {
          placeBoat(b);
          b.fade = 1;
        } else if (b.fade > 0 && b.alpha === 1) b.fade = 0;
      } else steerBoat(this, b, dt);
    }
    const [wx, wy] = this.wind();
    for (const w of this.weeds) {
      w.hop += dt * 5;
      w.spin += dt * w.v * 4;
      w.x += wx * w.v * 9 * dt;
      w.y += wy * w.v * 9 * dt + Math.sin(w.hop) * 0.6 * dt;
      // off the map, or onto the airfield: blow in again from the upwind edge
      if (w.x < -10 || w.x > this.W + 10 || w.y < -10 || w.y > this.H + 10 || this.avoid(w.x, w.y)) {
        for (let k = 0; k < 20; k++) {
          const t = Math.random();
          w.x = wx > 0 ? -6 : wx < 0 ? this.W + 6 : t * this.W;
          w.y = Math.abs(wx) < 0.3 ? (wy > 0 ? -6 : this.H + 6) : t * this.H;
          if (Math.abs(wx) >= 0.3) w.y = t * this.H;
          else w.x = t * this.W;
          if (!this.avoid(w.x, w.y)) break;
        }
      }
    }
  }

  /** After dark, over the darkness: red and green sidelights, a white light at the masthead or stern. */
  drawLights(ctx, t, night) {
    if (!this.boats.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dot = (x, y, col, r) => {
      ctx.fillStyle = `rgba(${col},0.25)`;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},1)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    for (const b of this.boats) {
      const c = Math.cos(b.h), s = Math.sin(b.h), k = b.size;
      const at = (lx, ly) => [b.x + (lx * c - ly * s) * k, b.y + (lx * s + ly * c) * k];
      ctx.globalAlpha = night * b.alpha * (0.85 + 0.15 * Math.sin(t * 3 + b.x));
      dot(...at(2, -1.3), '255,70,60', 0.7); // port
      dot(...at(2, 1.3), '70,255,130', 0.7); // starboard
      dot(...at(b.kind === 'ship' ? -5.5 : b.sail ? 0.5 : -3, 0), '255,250,225', 0.8);
    }
    ctx.restore();
  }

  draw(ctx, t) {
    for (const b of this.boats) {
      if (b.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.h);
      ctx.scale(b.size, b.size);
      // the wake: a V that spreads behind, longer the faster she goes
      const wl = 2 + b.v * 0.7;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-3, -1);
      ctx.lineTo(-3 - wl, -1 - wl * 0.32);
      ctx.moveTo(-3, 1);
      ctx.lineTo(-3 - wl, 1 + wl * 0.32);
      ctx.stroke();
      if (b.kind === 'ship') drawShip(ctx, b.colour);
      else {
        // hull, pointed at the bow
        ctx.fillStyle = 'rgba(20,40,60,0.25)';
        hull(ctx, 0.5, 0.6);
        ctx.fillStyle = '#ffffff';
        hull(ctx, 0, 0);
        if (b.kind === 'sail') {
          // mainsail filled with a little wind, and a jib
          const puff = 2.6 + Math.sin(t * 2 + b.x) * 0.25;
          ctx.fillStyle = '#fbfbf6';
          ctx.strokeStyle = 'rgba(40,60,70,0.45)';
          ctx.lineWidth = 0.35;
          ctx.beginPath();
          ctx.moveTo(1, 0);
          ctx.quadraticCurveTo(-1, puff, -3.2, 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = b.colour;
          ctx.beginPath();
          ctx.moveTo(3.6, 0);
          ctx.quadraticCurveTo(2.6, puff * 0.6, 1.2, 0.2);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = b.colour;
          ctx.fillRect(-1.6, -1, 2.4, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(0.2, -0.7, 0.5, 1.4);
        }
      }
      ctx.restore();
    }
    for (const w of this.weeds) {
      const lift = Math.abs(Math.sin(w.hop)) * w.r * 0.5;
      // its shadow on the ground, then the ball of dry twigs bouncing along above it
      ctx.fillStyle = 'rgba(60,40,20,0.18)';
      ctx.beginPath();
      ctx.ellipse(w.x + 1, w.y + w.r * 0.7, w.r * 0.9, w.r * 0.35, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(w.x, w.y - lift);
      ctx.rotate(w.spin);
      ctx.fillStyle = 'rgba(165,128,78,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,78,42,0.9)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k * TAU) / 7;
        ctx.moveTo(Math.cos(a) * w.r, Math.sin(a) * w.r);
        ctx.lineTo(Math.cos(a + 2.5) * w.r * 0.85, Math.sin(a + 2.5) * w.r * 0.85);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,104,60,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, TAU);
      ctx.arc(0.6, -0.4, w.r * 0.55, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}

