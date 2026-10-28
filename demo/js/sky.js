// Sky: what the real weather looks like from above. Cloud shadows drifting across the airport with
// the wind (density from the METAR's cloud cover) and falling rain, drizzle or snow. Purely visual:
// nothing here touches the simulation, so it needs no rewind state.
import { makeRng, TAU } from './util.js?v=2f66fd5f';
import { WORLD_H } from './config.js?v=2f66fd5f';

let blob = null;
/** Soft round shadow sprite, drawn once and stretched. */
function shadowSprite() {
  if (blob || typeof document === 'undefined') return blob;
  blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  const g = blob.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,30,40,1)');
  grad.addColorStop(0.55, 'rgba(20,30,40,0.6)');
  grad.addColorStop(1, 'rgba(20,30,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return blob;
}

export class Sky {
  /**
   * @param weather  Weather (for wind drift and storms)
   * @param cloud    0..1 cloud cover (null: pick one from the seed)
   * @param precip   'rain' | 'drizzle' | 'snow' | null
   */
  constructor({ weather, W, H = WORLD_H, seed = 1, cloud = null, precip = null, intensity = 1 }) {
    const r = makeRng(seed ^ 0x51c7);
    this.weather = weather;
    this.W = W;
    this.H = H;
    this.cloud = cloud != null ? cloud : r() < 0.35 ? 0 : r() * 0.6;
    this.precip = precip;
    this.intensity = intensity;
    // cloud puffs: clusters of overlapping soft shadows
    this.clouds = [];
    const n = Math.round(4 + this.cloud * 10);
    for (let i = 0; i < n && this.cloud > 0.05; i++) {
      const cx = r() * (W + 600) - 300, cy = r() * (H + 600) - 300, size = 90 + r() * 140;
      const parts = [];
      for (let k = 0; k < 4 + Math.floor(r() * 4); k++) parts.push({ dx: (r() - 0.5) * size, dy: (r() - 0.5) * size * 0.6, rx: size * (0.35 + r() * 0.35), ry: size * (0.25 + r() * 0.25) });
      this.clouds.push({ x: cx, y: cy, parts });
    }
    // precipitation particles (world space)
    this.drops = [];
    const count = precip ? Math.round((precip === 'snow' ? 140 : precip === 'drizzle' ? 90 : 170) * intensity) : 0;
    for (let i = 0; i < count; i++) this.drops.push({ x: r() * W, y: r() * H, life: r(), speed: 0.7 + r() * 0.6, ph: r() * TAU });
    this.rng = r;
    this.t = 0;
  }

  step(dt) {
    this.t += dt;
    const [vx, vy] = this.weather ? this.weather.airVel(0.11) : [0, 0];
    // clouds drift with the wind at their own (slower than the ground wind feels) pace, wrapping
    const span = this.W + 600, spanY = this.H + 600;
    for (const c of this.clouds) {
      c.x += vx * 0.7 * dt;
      c.y += vy * 0.7 * dt;
      if (c.x < -300) c.x += span; else if (c.x > this.W + 300) c.x -= span;
      if (c.y < -300) c.y += spanY; else if (c.y > this.H + 300) c.y -= spanY;
    }
    if (!this.drops.length) return;
    const snow = this.precip === 'snow';
    for (const d of this.drops) {
      d.life -= dt * (snow ? 0.25 : 2.6) * d.speed;
      if (snow) {
        d.x += (vx * 2.2 + Math.sin(this.t * 1.3 + d.ph) * 4) * dt;
        d.y += (vy * 2.2 + 3) * dt;
      }
      if (d.life <= 0) {
        d.life = 1;
        d.x = this.rng() * this.W;
        d.y = this.rng() * this.H;
      }
    }
  }

  /** One small, low-resolution picture per cloud (it's a soft blur anyway): one draw per cloud per frame. */
  cloudImage(c) {
    if (c.img !== undefined) return c.img;
    const img = shadowSprite();
    if (!img) return (c.img = null);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of c.parts) {
      x0 = Math.min(x0, p.dx - p.rx); x1 = Math.max(x1, p.dx + p.rx);
      y0 = Math.min(y0, p.dy - p.ry); y1 = Math.max(y1, p.dy + p.ry);
    }
    const k = 0.25; // pixels per world unit
    const cv = document.createElement('canvas');
    cv.width = Math.max(4, Math.ceil((x1 - x0) * k));
    cv.height = Math.max(4, Math.ceil((y1 - y0) * k));
    const g = cv.getContext('2d');
    for (const p of c.parts) g.drawImage(img, (p.dx - p.rx - x0) * k, (p.dy - p.ry - y0) * k, p.rx * 2 * k, p.ry * 2 * k);
    c.img = { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
    return c.img;
  }

  /** Under the aircraft, over the ground: cloud shadows. */
  drawShadows(ctx) {
    if (!this.clouds.length) return;
    ctx.save();
    ctx.globalAlpha = 0.05 + this.cloud * 0.06;
    for (const c of this.clouds) {
      const im = this.cloudImage(c);
      if (im) ctx.drawImage(im.cv, c.x + im.x0, c.y + im.y0, im.w, im.h);
    }
    ctx.restore();
  }

  /** Above everything in the world: rain streaks or snowflakes. */
  drawPrecip(ctx) {
    if (!this.drops.length) return;
    const [vx, vy] = this.weather ? this.weather.airVel(0.11) : [0, 0];
    ctx.save();
    if (this.precip === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of this.drops) {
        ctx.globalAlpha = Math.min(1, d.life * 4) * 0.8;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.1 + d.speed * 0.8, 0, TAU);
        ctx.fill();
      }
    } else {
      // seen from above, rain is a fleeting slanted dash plus a tiny splash where it lands
      const len = this.precip === 'drizzle' ? 3 : 7;
      const sx = vx * 6 + 1.2, sy = vy * 6 + 3.5;
      const k = len / Math.hypot(sx, sy);
      ctx.strokeStyle = 'rgba(220,235,255,0.55)';
      ctx.lineWidth = this.precip === 'drizzle' ? 0.6 : 0.8;
      ctx.beginPath();
      for (const d of this.drops) {
        if (d.life < 0.25) continue;
        const f = 1 - d.life;
        const x = d.x + sx * k * f * 2, y = d.y + sy * k * f * 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + sx * k, y + sy * k);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,235,255,0.35)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const d of this.drops) {
        if (d.life >= 0.25) continue;
        const rr = (0.25 - d.life) * 10;
        ctx.moveTo(d.x + rr, d.y);
        ctx.arc(d.x, d.y, rr, 0, TAU);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
