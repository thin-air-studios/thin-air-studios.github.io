// Drawing primitives for the hand-made, slightly retro airfield look.
// Everything is drawn in world units; callers set up the transform.
import { TAU, makeRng } from './util.js?v=7227d0de';
import { ZONE_COLORS } from './config.js?v=7227d0de';

export function fillAll(ctx, color, x0, y0, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, w, h);
}

/** Scatter little tufts/speckles to give flat colour some texture. */
export function speckle(ctx, rng, x0, y0, w, h, colors, count, rMin = 0.8, rMax = 2.2, alpha = 0.5) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const x = x0 + rng() * w, y = y0 + rng() * h, r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function stripes(ctx, x0, y0, w, h, angle, gap, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = gap / 2;
  ctx.translate(x0 + w / 2, y0 + h / 2);
  ctx.rotate(angle);
  const R = Math.hypot(w, h);
  for (let x = -R; x < R; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, -R);
    ctx.lineTo(x, R);
    ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A blobby tree canopy with a soft drop shadow. */
export function tree(ctx, rng, x, y, r, palette = ['#2f6b3a', '#3d8247', '#4f9a52']) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.45, y + r * 0.55, r * 1.05, r * 0.9, 0, 0, TAU);
  ctx.fill();
  const blobs = 4 + Math.floor(rng() * 3);
  ctx.fillStyle = palette[0];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  for (let i = 0; i < blobs; i++) {
    const a = rng() * TAU, d = r * 0.45 * rng();
    ctx.fillStyle = palette[1 + (i % (palette.length - 1))];
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d - r * 0.15, y + Math.sin(a) * d - r * 0.15, r * (0.45 + rng() * 0.25), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Pine tree seen from above: a little star of needles. */
export function pine(ctx, rng, x, y, r, dark = '#244f3b', light = '#33694e', snow = null) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y + r * 0.6, r, r * 0.8, 0, 0, TAU);
  ctx.fill();
  const spikes = 7 + Math.floor(rng() * 3);
  for (let layer = 0; layer < 2; layer++) {
    const rr = layer === 0 ? r : r * 0.6;
    ctx.fillStyle = layer === 0 ? dark : light;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU + layer * 0.3;
      const d = i % 2 === 0 ? rr : rr * 0.6;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.fill();
  }
  if (snow) {
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.35, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Palm tree from above: radiating fronds. */
export function palm(ctx, rng, x, y, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.arc(x + r * 0.5, y + r * 0.6, r * 0.9, 0, TAU);
  ctx.fill();
  const n = 6 + Math.floor(rng() * 3);
  const base = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * TAU + (rng() - 0.5) * 0.3;
    ctx.fillStyle = i % 2 ? '#3f8f45' : '#2f7a3a';
    ctx.beginPath();
    ctx.moveTo(x, y);
    const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    const nx = -Math.sin(a) * r * 0.22, ny = Math.cos(a) * r * 0.22;
    ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.5 + nx, y + Math.sin(a) * r * 0.5 + ny, tx, ty);
    ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.5 - nx, y + Math.sin(a) * r * 0.5 - ny, x, y);
    ctx.fill();
  }
  ctx.fillStyle = '#7a5a30';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Simple building with a pitched roof and shadow. */
export function building(ctx, x, y, w, h, angle, roof, roofDark, shadow = 'rgba(0,0,0,0.25)') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = shadow;
  ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
  ctx.fillStyle = roof;
  ctx.fillRect(-w / 2, -h / 2, w, h / 2);
  ctx.fillStyle = roofDark;
  ctx.fillRect(-w / 2, 0, w, h / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Curved hangar roof (corrugated). */
export function hangar(ctx, x, y, w, h, angle, color = '#b9c2c7') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-w / 2 + 6, -h / 2 + 7, w, h);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#e6ecef');
  g.addColorStop(0.5, color);
  g.addColorStop(1, '#7d878d');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = -w / 2 + 4; i < w / 2; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, -h / 2);
    ctx.lineTo(i, h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function road(ctx, pts, width, color, edge = null) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  };
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = width + 3;
    trace();
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  trace();
  ctx.stroke();
  ctx.restore();
}

export function blob(ctx, rng, cx, cy, rx, ry, color, wobble = 0.18, n = 18) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (rng() - 0.5) * wobble * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p = pts[0], q = pts[1];
  ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  ctx.closePath();
  ctx.fill();
  return pts;
}

/** Runway: asphalt, edge stripes, centre dashes, threshold bars and landing chevrons. */
export function runway(ctx, z, opts = {}) {
  const col = ZONE_COLORS[z.color];
  const L = z.length, Wd = z.width;
  ctx.save();
  ctx.translate(z.cx, z.cy);
  ctx.rotate(z.angle);
  // shoulder + shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, -L / 2 - 6 + 3, -Wd / 2 - 6 + 4, L + 12, Wd + 12, 5);
  ctx.fill();
  ctx.fillStyle = opts.shoulder || '#c9c1a6';
  roundRect(ctx, -L / 2 - 6, -Wd / 2 - 6, L + 12, Wd + 12, 5);
  ctx.fill();
  // coloured border so the runway reads as its colour at a glance
  ctx.fillStyle = col.main;
  roundRect(ctx, -L / 2 - 3, -Wd / 2 - 3, L + 6, Wd + 6, 4);
  ctx.fill();
  ctx.fillStyle = opts.asphalt || '#4a4f55';
  ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
  // subtle texture
  const rng = makeRng(Math.floor(z.length * 131 + z.width * 17 + z.angle * 1000)); // stable even when the zone moves
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < L * 0.6; i++) {
    ctx.fillStyle = i % 2 ? '#2e3236' : '#6a7077';
    ctx.fillRect(-L / 2 + rng() * L, -Wd / 2 + rng() * Wd, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  // tyre marks near touchdown
  ctx.fillStyle = 'rgba(20,20,20,0.25)';
  for (let i = 0; i < 6; i++) {
    const s = -L / 2 + L * 0.12 + rng() * L * 0.25;
    ctx.fillRect(s, -Wd * 0.18 - 1, 10 + rng() * 14, 1.6);
    ctx.fillRect(s + 3, Wd * 0.18 - 1, 10 + rng() * 14, 1.6);
  }
  // centre-line dashes
  ctx.fillStyle = opts.paint || '#f4f1e6';
  const dashStart = -L / 2 + L * 0.2;
  for (let s = dashStart; s < L / 2 - 14; s += 16) ctx.fillRect(s, -1, 9, 2);
  // threshold piano keys at the landing end
  const keys = Math.max(3, Math.floor(Wd / 6));
  for (let i = 0; i < keys; i++) {
    const y = -Wd / 2 + 3 + (i * (Wd - 6)) / keys;
    ctx.fillRect(-L / 2 + 4, y, 12, (Wd - 6) / keys - 2);
  }
  // far end bar
  ctx.fillRect(L / 2 - 5, -Wd / 2 + 2, 2, Wd - 4);
  // landing chevrons before the threshold (shows which end to land on)
  ctx.fillStyle = col.main;
  for (let i = 0; i < 3; i++) {
    const s = -L / 2 - 16 - i * 13;
    ctx.globalAlpha = 0.95 - i * 0.25;
    ctx.beginPath();
    ctx.moveTo(s + 8, 0);
    ctx.lineTo(s - 2, -Wd / 2 + 2);
    ctx.lineTo(s - 7, -Wd / 2 + 2);
    ctx.lineTo(s + 3, 0);
    ctx.lineTo(s - 7, Wd / 2 - 2);
    ctx.lineTo(s - 2, Wd / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Helipad: a coloured ring with a big H. */
export function helipad(ctx, z, opts = {}) {
  const col = ZONE_COLORS[z.color];
  const r = z.r;
  ctx.save();
  ctx.translate(z.cx, z.cy);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(3, 4, r + 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = opts.base || '#c9c1a6';
  ctx.beginPath();
  ctx.arc(0, 0, r + 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.arc(0, 0, r + 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = opts.asphalt || '#4a4f55';
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = opts.paint || '#f4f1e6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, r - 6, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = opts.paint || '#f4f1e6';
  const s = r * 0.42;
  ctx.fillRect(-s, -s, s * 0.42, s * 2);
  ctx.fillRect(s - s * 0.42, -s, s * 0.42, s * 2);
  ctx.fillRect(-s, -s * 0.18, s * 2, s * 0.36);
  ctx.restore();
}
