// Day/night: real sun position at the airport (or forced day/night), dusk tint, darkness, and
// night lighting — runway edge + threshold lights, sequenced approach strobes, terminal glow.
import { sunElevation, nightFactor, polygonCentroid, polygonArea } from './geo.js?v=86c2b44d';
import { TAU } from './util.js?v=86c2b44d';

export class Lighting {
  // night: a fixed level (0 to 1) held for every frame, whatever the clock says (a video of a game keeps the light it ended with);
  // null follows the clock as the game does. now: the clock of the first reading (the game passes none; a test passes its own
  // instant, since the reading is cached for 30 s and a test must not depend on the wall clock)
  constructor({ world, mode = 'real', night = null, now = Date.now() }) {
    this.world = world;
    this.mode = mode;
    this.fixed = Number.isFinite(night) ? night : null;
    this.n = 0;
    this.nextCheck = 0;
    this.buildLights();
    this.update(now);
  }

  update(nowMs) {
    if (this.fixed != null) return (this.n = this.fixed);
    if (nowMs < this.nextCheck) return this.n;
    this.nextCheck = nowMs + 30000;
    const info = this.world.L.info;
    if (this.mode === 'day') this.n = 0;
    else if (this.mode === 'night') this.n = 1;
    else this.n = nightFactor(sunElevation(info.lat, info.lon, new Date(nowMs)));
    this.elev = sunElevation(info.lat, info.lon, new Date(nowMs));
    return this.n;
  }

  buildLights() {
    const w = this.world;
    // each runway's edge lights apart, so a closed runway's can go dark (bakeLayer)
    this.edgeOf = new Map();
    for (const z of w.runways) {
      const list = [];
      this.edgeOf.set(z.id, list);
      if (z.surface === 'S' && !z.lighted) continue;
      const ux = (z.ends[1].x - z.ends[0].x) / z.length, uy = (z.ends[1].y - z.ends[0].y) / z.length;
      const px = -uy * (z.width / 2 + 2.5), py = ux * (z.width / 2 + 2.5);
      for (let s = 0; s <= z.length + 0.1; s += 14) {
        for (const k of [-1, 1]) list.push([z.ends[0].x + ux * s + px * k, z.ends[0].y + uy * s + py * k]);
      }
    }
    // taxiway centreline lights (green), spaced along the real taxiway lines
    this.taxi = [];
    for (const tw of w.L.taxiways) {
      let carry = 0;
      for (let i = 1; i < tw.pts.length && this.taxi.length < 3000; i++) {
        const [x0, y0] = w.toWorld(...tw.pts[i - 1]), [x1, y1] = w.toWorld(...tw.pts[i]);
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = carry; d < len; d += 8) this.taxi.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]);
        carry = (carry - len) % 8;
        if (carry < 0) carry += 8;
      }
    }
    this.terminals = [];
    for (const t of w.L.terminals) {
      if (t.length < 3) continue;
      const [cx, cy] = polygonCentroid(t);
      const [x, y] = w.toWorld(cx, cy);
      const r = Math.min(60, Math.max(10, Math.sqrt(polygonArea(t)) / w.mpu));
      this.terminals.push([x, y, r]);
    }
    this.terminals = this.terminals.slice(0, 40);
    // the airport's rotating beacon, beside the biggest terminal (or mid-field)
    const big = this.terminals.reduce((a, b) => (b[2] > (a ? a[2] : 0) ? b : a), null);
    if (big) this.beacon = [big[0] + big[2] * 0.7, big[1] - big[2] * 0.7];
    else if (w.runways.length) this.beacon = [w.runways[0].cx + w.runways[0].width * 2.5, w.runways[0].cy];
    // one pre-rendered glow sprite for all point lights
    const g = (this.glow = typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (g) {
      g.width = g.height = 32;
      const c = g.getContext('2d');
      const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 32, 32);
      // the beacon's green half
      const gg = (this.greenGlow = document.createElement('canvas'));
      gg.width = gg.height = 32;
      const c2 = gg.getContext('2d');
      const g2 = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
      g2.addColorStop(0, 'rgba(190,255,200,1)');
      g2.addColorStop(0.25, 'rgba(40,255,110,0.7)');
      g2.addColorStop(1, 'rgba(40,255,110,0)');
      c2.fillStyle = g2;
      c2.fillRect(0, 0, 32, 32);
      // the red of a closed runway's X lights (closures.js)
      const rg = (this.redGlow = document.createElement('canvas'));
      rg.width = rg.height = 32;
      const c3 = rg.getContext('2d');
      const g3 = c3.createRadialGradient(16, 16, 0, 16, 16, 16);
      g3.addColorStop(0, 'rgba(255,205,190,1)');
      g3.addColorStop(0.25, 'rgba(255,60,48,0.6)');
      g3.addColorStop(1, 'rgba(255,40,30,0)');
      c3.fillStyle = g3;
      c3.fillRect(0, 0, 32, 32);
    }
  }

  /** Dusk tint and darkness over the ground (drawn before aircraft). */
  drawSky(ctx) {
    const n = this.n;
    if (n < 0.02) return;
    const w = this.world;
    // warm at dusk, deep blue at night
    const dusk = Math.max(0, 1 - Math.abs(n - 0.35) / 0.35);
    ctx.save();
    ctx.fillStyle = `rgba(14,22,52,${0.62 * n})`;
    ctx.fillRect(-200, -200, w.W + 400, w.H + 400);
    if (dusk > 0.02) {
      ctx.fillStyle = `rgba(255,130,60,${0.16 * dusk})`;
      ctx.fillRect(-200, -200, w.W + 400, w.H + 400);
    }
    ctx.restore();
  }

  /** Static lights (edges, thresholds, terminal glow) baked into one layer; rebuilt on change. */
  bakeLayer(pxPerUnit) {
    const w = this.world;
    const M = 40;
    const spanW = w.W + M * 2, spanH = w.H + M * 2;
    const res = Math.min(Math.max(0.5, Math.round(pxPerUnit * 4) / 4), 4096 / spanW, 4096 / spanH);
    const sig = `${res}|${w.runways.map((z) => z.active + (z.closed ? 'c' : '')).join('')}`;
    if (this.layer && this.layerSig === sig) return this.layer;
    const c = this.layer || (this.layer = document.createElement('canvas'));
    c.width = Math.ceil(spanW * res);
    c.height = Math.ceil(spanH * res);
    const g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, M * res, M * res);
    g.clearRect(-M, -M, spanW, spanH);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of this.terminals) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
      grad.addColorStop(0, 'rgba(255,190,110,0.32)');
      grad.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = grad;
      g.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    }
    g.fillStyle = 'rgba(70,255,130,0.55)';
    g.beginPath();
    for (const [x, y] of this.taxi) {
      g.moveTo(x + 0.85, y);
      g.arc(x, y, 0.85, 0, TAU);
    }
    g.fill();
    for (const z of w.runways) {
      // a closed runway is dark: no edge lights, no threshold tints (its X marks are closures.js, lit in red)
      if (z.closed) continue;
      for (const [x, y] of this.edgeOf.get(z.id) || []) g.drawImage(this.glow, x - 3, y - 3, 6, 6);
      const a = z.ends[z.active], b = z.ends[1 - z.active];
      const px = -z.diry, py = z.dirx;
      for (let k = -z.width / 2; k <= z.width / 2 + 0.1; k += 4) {
        this.tint(g, a.x + px * k, a.y + py * k, '#5dff8a', 7);
        this.tint(g, b.x + px * k, b.y + py * k, '#ff5040', 7);
      }
    }
    this.layerSig = sig;
    this.layerM = M;
    return c;
  }

  /** Runway and terminal lights (additive): one cached layer plus live approach strobes. */
  drawLights(ctx, t, pxPerUnit = 2) {
    const n = this.n;
    if (n < 0.08 || !this.glow) return;
    const w = this.world;
    const layer = this.bakeLayer(pxPerUnit);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, n * 1.2);
    const M = this.layerM;
    ctx.drawImage(layer, -M, -M, w.W + M * 2, w.H + M * 2);
    for (const z of w.runways) {
      if (z.closed) continue; // no approach strobes on a closed runway
      const a = z.ends[z.active];
      const phase = (t * 2.2 + z.id * 0.3) % 1.3;
      for (let i = 0; i < 6; i++) {
        const s = -14 - (5 - i) * 12;
        const on = Math.abs(phase - i / 6) < 0.07;
        const x = a.x + z.dirx * s, y = a.y + z.diry * s;
        ctx.drawImage(this.glow, x - (on ? 9 : 3), y - (on ? 9 : 3), on ? 18 : 6, on ? 18 : 6);
      }
    }
    if (this.beacon) {
      // civil airport beacon: alternating white and green flashes, one rotation every 4 s
      const ph = (t / 4) % 1;
      const flash = (c) => Math.max(0, 1 - Math.abs(ph - c) / 0.05);
      const wf = flash(0.25), gf = flash(0.75);
      const [bx, by] = this.beacon;
      if (wf > 0) {
        ctx.globalAlpha = Math.min(1, n * 1.2) * wf;
        this.tint(ctx, bx, by, '#ffffff', 34);
      }
      if (gf > 0) {
        ctx.globalAlpha = Math.min(1, n * 1.2) * gf;
        ctx.drawImage(this.greenGlow, bx - 17, by - 17, 34, 34);
      }
    }
    ctx.restore();
  }

  tint(ctx, x, y, color, size) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.22, 0, TAU);
    ctx.fill();
    ctx.drawImage(this.glow, x - size / 2, y - size / 2, size, size);
  }
}
