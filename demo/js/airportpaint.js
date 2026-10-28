// Static airport art: clean vector drawing of the real layout, in world units.
import { ZONE_COLORS, CLASSES } from './config.js?v=2f66fd5f';
import { TAU, makeRng, hashString } from './util.js?v=2f66fd5f';
import * as P from './paint.js?v=2f66fd5f';
import { FONT } from './fx.js?v=2f66fd5f';
import { paintWater, paintMountains, isWater } from './scenery.js?v=2f66fd5f';

/** Ground palette picked from the airport's location: green, arid, tundra or snowy. */
export function groundTheme(info) {
  const { lat, lon } = info;
  const arid =
    (lat > 25 && lat < 38 && lon > -118 && lon < -99) || // US southwest, west Texas
    (lat > 12 && lat < 36 && lon > -17 && lon < 60) || // Sahara, Arabia
    (lat > -33 && lat < -18 && lon > 115 && lon < 145); // inland Australia
  if (Math.abs(lat) > 62) return { base: '#c9d3cf', tufts: ['#b9c6c2', '#d8e0dd', '#aebbb5'], name: 'tundra' };
  if (Math.abs(lat) > 54) return { base: '#7f9a6b', tufts: ['#6f8a5d', '#8faa79', '#5f7a50'], name: 'boreal' };
  if (arid) return { base: '#cdb68a', tufts: ['#bfa678', '#d9c49a', '#b39a6c'], name: 'arid' };
  return { base: '#79a85f', tufts: ['#6b9a52', '#86b56c', '#5f8c49'], name: 'green' };
}

/** Is (x, y) on or close to the airfield (runways and their surrounds)? */
export function nearField(world, x, y, margin = 40) {
  return world.runways.some((z) => {
    const dx = x - z.cx, dy = y - z.cy, c = Math.cos(z.angle), s = Math.sin(z.angle);
    return Math.abs(dx * c + dy * s) < z.length / 2 + margin && Math.abs(-dx * s + dy * c) < z.width / 2 + margin;
  });
}

/**
 * Woods and scrub off the airfield, in the local style: broadleaf clumps, pines up north, palms in
 * the tropics, scattered scrub in the desert. Never on the water or near the runways.
 */
function paintVegetation(ctx, world, b, theme) {
  const rng = makeRng(hashString((world.L.info.icao || 'X') + ':veg'));
  const tropical = Math.abs(world.L.info.lat) < 23.5 && theme.name === 'green';
  const clear = (x, y, pad) => !nearField(world, x, y, 90) && ![[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dy]) => isWater(world.waterMask, x + dx, y + dy));
  const W = b.x1 - b.x0, H = b.y1 - b.y0;
  if (theme.name === 'arid') {
    // lone bushes of sage and creosote
    for (let i = 0; i < 90; i++) {
      const x = b.x0 + rng() * W, y = b.y0 + rng() * H;
      if (clear(x, y, 3)) P.tree(ctx, rng, x, y, 1.4 + rng() * 1.3, ['#8a8a52', '#9c9a60', '#a8a46c']);
    }
    return;
  }
  const clusters = { green: 16, boreal: 18, tundra: 7 }[theme.name] || 12;
  for (let c = 0; c < clusters; c++) {
    const cx = b.x0 + rng() * W, cy = b.y0 + rng() * H;
    const n = 5 + Math.floor(rng() * 10), spread = 14 + rng() * 22;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (!clear(x, y, 6)) continue;
      const r = 3.2 + rng() * 2.6;
      if (theme.name === 'boreal' || theme.name === 'tundra') P.pine(ctx, rng, x, y, r * 0.9, '#2c5a40', '#3b7353', theme.name === 'tundra' ? 'rgba(245,250,255,0.85)' : null);
      else if (tropical && rng() < 0.7) P.palm(ctx, rng, x, y, r * 1.1);
      else P.tree(ctx, rng, x, y, r);
    }
  }
}

/** Border colour for a runway = the largest class it accepts (the old colour-matching cue). */
export function runwayColor(z) {
  if (z.family) return z.family === 'yellow' ? 'yellow' : 'red'; // 'both' is red, striped with yellow
  for (const c of ['heavy', 'narrowbody', 'regional', 'light']) if (z.allow.includes(c)) return CLASSES[c].color;
  return 'green';
}

function polyPath(ctx, pts, toW) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [wx, wy] = toW(x, y);
    if (i) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy);
  });
  ctx.closePath();
}

/** Paint the whole static layer. b = world-space bounds to cover (x0,y0,x1,y1). */
export function paintAirport(ctx, world, b, opts = {}) {
  const L = world.L;
  const toW = world.toWorld;
  const mpu = world.mpu;
  const theme = groundTheme(L.info);
  const rng = makeRng(hashString(L.info.icao || 'X'));
  ctx.fillStyle = theme.base;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  P.speckle(ctx, rng, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, theme.tufts, 2200, 0.8, 2.4, 0.42);
  // the real surroundings, once they've loaded: sea, lakes and rivers, and the mountains
  if (world.waterMask) paintWater(ctx, world.waterMask, theme.name);
  if (world.sur) paintMountains(ctx, world.sur.peaks, (L.info.elev || 0) * 0.3048, { x0: 0, y0: 0, x1: world.W, y1: world.H }, (x, y) => nearField(world, x, y) || isWater(world.waterMask, x, y), hashString(L.info.icao || 'X'), world.mpu);
  paintVegetation(ctx, world, b, theme);
  // mown airfield around the runways
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#ffffff';
  for (const z of world.runways) {
    ctx.save();
    ctx.translate(z.cx, z.cy);
    ctx.rotate(z.angle);
    ctx.fillRect(-z.length / 2 - 30, -z.width / 2 - 26, z.length + 60, z.width + 52);
    ctx.restore();
  }
  ctx.restore();
  // the airport's own land: mown grass inside the perimeter fence
  for (const ring of L.boundary || []) {
    polyPath(ctx, ring, toW);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.setLineDash([3, 2.5]);
    ctx.strokeStyle = 'rgba(40,50,40,0.28)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // aprons
  for (const ap of L.aprons) {
    polyPath(ctx, ap, toW);
    ctx.fillStyle = '#b9b6aa';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // taxiways: concrete band + yellow centre line
  const twW = Math.max(3.2, 23 / mpu);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of [0, 1, 2]) {
    for (const tw of L.taxiways) {
      if (tw.pts.length < 2) continue;
      ctx.beginPath();
      tw.pts.forEach(([x, y], i) => {
        const [wx, wy] = toW(x, y);
        if (i) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy);
      });
      const w = tw.lane ? twW * 0.7 : twW;
      if (pass === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = w + 1.6;
      } else if (pass === 1) {
        ctx.strokeStyle = '#a3a197';
        ctx.lineWidth = w;
      } else {
        ctx.strokeStyle = 'rgba(232,197,71,0.85)';
        ctx.lineWidth = Math.max(0.5, w * 0.12);
      }
      ctx.stroke();
    }
  }
  // other airside buildings: cargo sheds, fire station, the tower ...
  for (const h of L.buildings || []) {
    polyPath(ctx, h.map(([x, y]) => [x + 3 * mpu, y + 4 * mpu]), toW);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    polyPath(ctx, h, toW);
    ctx.fillStyle = '#cfc7b6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  // hangars and terminals
  for (const h of L.hangars) {
    polyPath(ctx, h.map(([x, y]) => [x + 5 * mpu, y + 6 * mpu]), toW);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    polyPath(ctx, h, toW);
    ctx.fillStyle = '#a9b3b9';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  for (const t of L.terminals) {
    polyPath(ctx, t.map(([x, y]) => [x + 5 * mpu, y + 7 * mpu]), toW);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    polyPath(ctx, t, toW);
    ctx.fillStyle = '#e4ded0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // gates: tiny stands
  ctx.fillStyle = 'rgba(232,197,71,0.75)';
  for (const g of L.gates) {
    const [x, y] = toW(g.x, g.y);
    ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  }
  for (const z of world.runways) paintRunway(ctx, z, opts);
  for (const z of world.zones) if (z.kind === 'pad') P.helipad(ctx, { ...z, color: 'blue' }, {});
}

/** Runway: coloured capability border, asphalt, edge lines, centre dashes, keys and numbers at both ends. */
export function paintRunway(ctx, z, opts = {}) {
  const col = ZONE_COLORS[runwayColor(z)];
  const L = z.length, Wd = z.width;
  ctx.save();
  ctx.translate(z.cx, z.cy);
  ctx.rotate(Math.atan2(z.ends[1].y - z.ends[0].y, z.ends[1].x - z.ends[0].x));
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  P.roundRect(ctx, -L / 2 - 4 + 2.5, -Wd / 2 - 4 + 3.5, L + 8, Wd + 8, 3);
  ctx.fill();
  ctx.fillStyle = col.main;
  P.roundRect(ctx, -L / 2 - 3, -Wd / 2 - 3, L + 6, Wd + 6, 3);
  ctx.fill();
  if (z.family === 'both') {
    // a shared runway: red and yellow stripes round the edge
    ctx.save();
    P.roundRect(ctx, -L / 2 - 3, -Wd / 2 - 3, L + 6, Wd + 6, 3);
    ctx.clip();
    ctx.fillStyle = ZONE_COLORS.yellow.main;
    for (let x = -L / 2 - 3; x < L / 2 + 3; x += 18) ctx.fillRect(x, -Wd / 2 - 3, 9, Wd + 6);
    ctx.restore();
  }
  const soft = z.surface === 'S';
  ctx.fillStyle = soft ? '#9a8a63' : opts.asphalt || '#4a4f55';
  ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
  if (soft) {
    // grass/gravel: mottled, no paint
    const rng = makeRng(Math.floor(L * 7 + Wd));
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < L * 0.8; i++) {
      ctx.fillStyle = i % 2 ? '#7d6e4c' : '#b3a37a';
      ctx.fillRect(-L / 2 + rng() * L, -Wd / 2 + rng() * Wd, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#f4f1e6';
  // edge lines
  ctx.fillRect(-L / 2 + 2, -Wd / 2 + 0.8, L - 4, 0.7);
  ctx.fillRect(-L / 2 + 2, Wd / 2 - 1.5, L - 4, 0.7);
  // centre dashes
  for (let s = -L / 2 + 26; s < L / 2 - 26; s += 13) ctx.fillRect(s, -0.5, 7, 1);
  // threshold keys at both ends
  const keys = Math.max(3, Math.floor(Wd / 3));
  for (const e of [-1, 1]) {
    for (let i = 0; i < keys; i++) {
      const y = -Wd / 2 + 1.8 + (i * (Wd - 3.6)) / keys;
      const x = e < 0 ? -L / 2 + 2 : L / 2 - 9;
      ctx.fillRect(x, y, 7, (Wd - 3.6) / keys - 1);
    }
  }
  // aiming points and touchdown-zone bars (ICAO pattern), after the numbers, spaced to the runway
  const u = z.lengthM ? L / z.lengthM : 0; // world units per metre
  if (u && z.lengthM >= 1200 && Wd >= 9) {
    const bar = (x0, along, lat, w) => {
      for (const s of [-1, 1]) ctx.fillRect(x0, s * lat - w / 2, along, w);
    };
    const start = 25; // clear of the threshold keys and numbers
    const step = Math.max(7, 150 * u);
    for (const e of [-1, 1]) {
      const at = (d, len) => (e < 0 ? -L / 2 + d : L / 2 - d - len);
      // stripes in pairs: 3, aiming point, 2, 2, 1, 1
      const marks = [[0, 3], [1, 'aim'], [2, 2], [3, 2], [4, 1], [5, 1]];
      for (const [i, n] of marks) {
        const d = start + i * step;
        if (d > L / 2 - 12 || (i + 1) * 300 > z.lengthM) break;
        if (n === 'aim') {
          const len = Math.max(5, 45 * u);
          bar(at(d, len), len, Wd * 0.27, Wd * 0.15);
          continue;
        }
        const len = Math.max(3.5, 22 * u);
        for (let k = 0; k < n; k++) bar(at(d, len), len, Wd * (0.17 + k * 0.08), Math.max(0.55, Wd * 0.045));
      }
    }
  }
  // runway numbers, readable from each approach
  ctx.font = `700 ${Math.max(6, Math.min(10, Wd * 0.62))}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [i, sign] of [[0, -1], [1, 1]]) {
    ctx.save();
    ctx.translate(sign * (L / 2 - 17), 0);
    ctx.rotate(sign < 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillText(z.ends[i].ident, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Live layer: arrows at the active end (red while it closes). The closed and closing marks are closures.js, after the night tint. */
export function paintActiveEnds(ctx, world, t) {
  for (const z of world.runways) {
    const col = ZONE_COLORS[runwayColor(z)];
    ctx.save();
    ctx.translate(z.thx, z.thy);
    ctx.rotate(z.angle);
    const Wd = z.width;
    const blink = z.closing ? (Math.sin(t * 10) > 0 ? 1 : 0.25) : z.closed ? 0.2 : 1;
    ctx.fillStyle = z.closing ? '#ff5a4a' : col.main;
    for (let i = 0; i < 3; i++) {
      if (z.family === 'both' && !z.closing) ctx.fillStyle = i % 2 ? ZONE_COLORS.yellow.main : col.main;
      const s = -12 - i * 11;
      ctx.globalAlpha = (0.95 - i * 0.25) * blink;
      ctx.beginPath();
      ctx.moveTo(s + 7, 0);
      ctx.lineTo(s - 2, -Wd / 2 + 1);
      ctx.lineTo(s - 6, -Wd / 2 + 1);
      ctx.lineTo(s + 3, 0);
      ctx.lineTo(s - 6, Wd / 2 - 1);
      ctx.lineTo(s - 2, Wd / 2 - 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
