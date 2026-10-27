// Particles, floating text, camera shake and slow-motion: the "juice".
import { TAU, damp, clamp } from './util.js?v=7227d0de';
import { reducedMotion } from './motion.js?v=7227d0de';

// contrails: at most 300 particles in all, and six puffs a second from any one aircraft (the spacing is 0.2 s)
export const CONTRAIL_MAX = 300;
export const CONTRAIL_PER_SECOND = 6;

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.glows = [];
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.contrails = new Map(); // aircraft id -> the times its recent puffs were made
  }

  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.glows.length = 0;
    this.contrails.clear();
    this.shake = 0;
    this.flash = 0;
  }

  /**
   * A white vapour puff trailing an arrival that is still in the air: the caller passes the aircraft and its visual
   * heading. Capped (CONTRAIL_MAX in all, CONTRAIL_PER_SECOND each); returns true when a puff was made.
   */
  contrail(a) {
    if (this.parts.length >= CONTRAIL_MAX) return false;
    let log = this.contrails.get(a.id);
    if (!log) this.contrails.set(a.id, (log = []));
    while (log.length && this.time - log[0] >= 1) log.shift();
    if (log.length >= CONTRAIL_PER_SECOND) return false;
    if (log.length && this.time - log[log.length - 1] < 0.2) return false;
    log.push(this.time);
    const h = a.visHeading || 0, back = -12 * (a.scale || 1);
    this.parts.push({
      kind: 'vapour', x: a.x + Math.cos(h) * back, y: a.y + Math.sin(h) * back,
      vx: -Math.cos(h) * 1.5, vy: -Math.sin(h) * 1.5, r: 2.4, grow: 4, life: 0, max: 2.5,
      color: '255,255,255', alpha: 0.32, drag: 1.2,
    });
    return true;
  }

  /** A soft light that spreads and fades where a runway is touched (the landing flare), drawn over the ground. */
  glow(x, y, r, color, life = 0.5) {
    this.glows.push({ x, y, r, color, life: 0, max: life });
  }

  addShake(amount) {
    this.shake = Math.min(14, this.shake + amount);
  }

  puff(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (opts.speed ?? 12) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        kind: opts.kind || 'smoke',
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        r: (opts.r ?? 3) * (0.7 + Math.random() * 0.6),
        grow: opts.grow ?? 10,
        life: 0,
        max: (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6),
        color: opts.color || '230,230,225',
        alpha: opts.alpha ?? 0.6,
        drag: opts.drag ?? 2.5,
      });
    }
  }

  ring(x, y, color, maxR = 34, life = 0.6, width = 3) {
    this.rings.push({ x, y, color, maxR, life: 0, max: life, width });
  }

  /**
   * A popup that floats up from a world point and fades: `size` 20 is a '+1' (drawn at 16 px on the reference
   * phone, grown with the HUD scale), 12 to 15 a remark beside an aircraft. With `{ centre: n }` it's a
   * message for the whole screen instead, in slot n (0, 1, 2) under the HUD's title.
   */
  text(x, y, str, color, size = 18, life = 1.1, { centre = null, arc = false, capY = null } = {}) {
    this.texts.push({ x, y, str, color, size, life: 0, max: life, centre, arc, capY });
  }

  explosion(x, y, colors = ['#e5533d', '#f6f1e4']) {
    this.puff(x, y, 26, { speed: 38, r: 9, grow: 24, life: 2.8, color: '62,58,54', alpha: 0.75, drag: 1.3 });
    this.puff(x, y, 34, { kind: 'fire', speed: 85, r: 7, grow: 22, life: 0.9, color: '255,140,40', alpha: 1, drag: 3 });
    this.puff(x, y, 10, { kind: 'fire', speed: 22, r: 11, grow: 30, life: 0.55, color: '255,236,170', alpha: 1, drag: 3 });
    this.puff(x, y, 30, { kind: 'spark', speed: 170, r: 1.7, grow: 0, life: 0.8, color: '255,235,150', alpha: 1, drag: 1.8 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, sp = 50 + Math.random() * 90;
      this.parts.push({
        kind: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 3, grow: 0,
        life: 0, max: 1.2 + Math.random() * 0.6, color: colors[i % colors.length], alpha: 1, drag: 2.2,
        rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 20,
      });
    }
    this.ring(x, y, '255,240,200', 110, 0.6, 6);
    this.flash = 1;
    this.addShake(14);
  }

  /** dt drives particles (may be slowed); realDt drives flash and shake. */
  update(dt, realDt = dt) {
    this.time += dt;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.parts.splice(i, 1);
        continue;
      }
      const d = 1 - damp(p.drag, dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt; // it rises with its age, in screen pixels (drawTexts)
      if (t.life >= t.max) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.max) this.rings.splice(i, 1);
    }
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.life += dt;
      if (g.life >= g.max) this.glows.splice(i, 1);
    }
    for (const [id, log] of this.contrails) if (!log.length || this.time - log[log.length - 1] > 3) this.contrails.delete(id);
    this.shake *= 1 - damp(6, realDt);
    if (this.shake < 0.05) this.shake = 0;
    this.flash *= 1 - damp(7, realDt);
  }

  drawGround(ctx) {
    // smoke, fire and vapour sit under the aircraft
    for (const p of this.parts) {
      if (p.kind !== 'smoke' && p.kind !== 'vapour') continue;
      const k = p.life / p.max;
      ctx.fillStyle = `rgba(${p.color},${p.alpha * (1 - k) * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    // the landing flare: two rings of light, the outer one fainter, both fading as they spread
    for (const g of this.glows) {
      const k = g.life / g.max;
      ctx.fillStyle = `rgba(${g.color},${0.22 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * (0.5 + 0.5 * k), 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${g.color},${0.4 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * (0.25 + 0.25 * k), 0, TAU);
      ctx.fill();
    }
    for (const r of this.rings) {
      const k = r.life / r.max;
      ctx.strokeStyle = `rgba(${r.color},${1 - k})`;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + (r.maxR - 6) * (1 - (1 - k) * (1 - k)), 0, TAU);
      ctx.stroke();
    }
  }

  /** Fire, sparks and debris over the aircraft, in world space (the popups come later: drawTexts). */
  drawTop(ctx) {
    // fireballs glow additively over the wreck
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.kind !== 'fire') continue;
      const k = p.life / p.max;
      ctx.fillStyle = `rgba(${p.color},${p.alpha * (1 - k) * 0.6})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    for (const p of this.parts) {
      if (p.kind !== 'spark') continue;
      const k = p.life / p.max;
      ctx.fillStyle = `rgba(${p.color},${1 - k})`;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.restore();
    for (const p of this.parts) {
      if (p.kind !== 'debris') continue;
      const k = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
      ctx.restore();
    }
  }

  /**
   * A popup's size, and where it goes on its own this frame, in CSS px: kept on screen at its largest (the pop
   * overshoots to 1.15), with `hw` and `hh` its half width and height there. Centre messages sit in their slot
   * under `centreTop`; the others float up from their world point.
   */
  place(ctx, t, r, centreTop) {
    const u = r.hud, ins = r.insets;
    const size = Math.max(12, t.size * 0.8) * u;
    ctx.font = `700 ${size}px ${FONT}`;
    // long ones, and the centre messages (they share the top of the screen with callsigns), on a pill
    const pill = t.str.length > 14 || t.centre != null;
    const w = ctx.measureText(t.str).width + (pill ? 16 * u : 0), h = size + 8 * u;
    let x, y;
    if (t.centre != null) {
      x = r.cssW / 2;
      y = centreTop + (18 + 28 * t.centre) * u;
    } else {
      [x, y] = r.groundToScreen(t.x, t.y);
      if (t.arc) {
        // a '+1' arcs up: 40 px over its life, bowing 12 px to one side (straight up under reduced motion)
        const k = clamp(t.life / t.max, 0, 1);
        y -= k * 40 * u;
        if (!reducedMotion()) x += Math.sin(k * Math.PI) * 12 * u;
      } else y -= t.life * 16 * u;
    }
    const hw = w * 0.575 + 8, hh = h * 0.575 + 4;
    // a capped text (capY) stays above the screen height it is given, its bottom edge at or above it (the radio ticker's top)
    if (t.capY != null) y = Math.min(y, t.capY - hh);
    x = clamp(x, hw + ins.l, r.cssW - hw - ins.r);
    y = clamp(y, hh + ins.t, r.cssH - hh - ins.b);
    return { t, size, pill, w, h, x, y, hw, hh };
  }

  /** Where the centre messages stack: under the HUD's title block, and under the toast while one is up. */
  centreTop(r) {
    return Math.max(r.hudGeom ? r.hudGeom.centreBottom : r.insets.t, r.toastBottom || 0);
  }

  /**
   * The centre messages' boxes at their largest, in CSS px, as HUD blocks for the callsigns to drop below
   * (Renderer.drawLabels): they hold still in their slots, so a label under the title moves once, not with them.
   */
  centreBoxes(ctx, r) {
    if (!this.texts.some((t) => t.centre != null)) return [];
    const top = this.centreTop(r);
    ctx.save();
    const boxes = this.texts.filter((t) => t.centre != null).map((t) => {
      const p = this.place(ctx, t, r, top);
      return { x: p.x - p.hw, y: p.y - p.hh, w: p.hw * 2, h: p.hh * 2, hud: true };
    });
    ctx.restore();
    return boxes;
  }

  /**
   * The popups, in screen space after the callsigns so no label overprints them. Sized in CSS px at the HUD
   * scale (`r.hud`), so they read the same at any zoom and on any screen, and kept on screen. Centre messages
   * stack under the HUD's title block (the callsigns keep clear of them: centreBoxes); the others keep clear of
   * them, of each other and of the boxes in `avoid` (the callsigns and map names, in CSS px), stepping down
   * below each one they'd cover. One that rises into a callsign stays under it.
   */
  drawTexts(ctx, r, avoid = []) {
    if (!this.texts.length) return;
    const u = r.hud, ins = r.insets;
    const centreTop = this.centreTop(r);
    ctx.save();
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const taken = []; // the popups placed so far
    const others = avoid.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, hw: b.w / 2, hh: b.h / 2 }));
    const centreFirst = this.texts.some((t) => t.centre != null) ? [...this.texts].sort((a, b) => (b.centre != null) - (a.centre != null)) : this.texts;
    for (const t of centreFirst) {
      const p = this.place(ctx, t, r, centreTop);
      if (t.centre == null) {
        // each step goes below the one it would cover, so it meets each at most once (unless held at the bottom edge)
        const hit = (q) => Math.abs(q.x - p.x) < q.hw + p.hw && Math.abs(q.y - p.y) < q.hh + p.hh;
        for (let i = 0, o; i < taken.length + others.length && (o = taken.find(hit) || others.find(hit)); i++) {
          p.y = clamp(o.y + o.hh + p.hh + 2 * u, p.hh + ins.t, r.cssH - p.hh - ins.b); // a little apart, and clear of it for sure
        }
        if (t.capY != null) p.y = Math.min(p.y, t.capY - p.hh); // the cap wins over the step down, so a note stays above the ticker
      }
      taken.push(p);
      const k = t.life / t.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.6);
      const { w, h, size } = p;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.translate(p.x, p.y);
      ctx.scale(pop, pop);
      if (p.pill) {
        ctx.fillStyle = 'rgba(20,28,32,0.7)';
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 9 * u);
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(2.5, size * 0.2);
        ctx.strokeStyle = 'rgba(25,30,35,0.75)';
        ctx.strokeText(t.str, 0, 0);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}

export const FONT = '"Fredoka", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
