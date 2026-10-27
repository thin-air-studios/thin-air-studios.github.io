// Original top-down aircraft, drawn with canvas paths. Heading 0 points along +x.
import { ZONE_COLORS } from './config.js?v=86c2b44d';
import { TAU } from './util.js?v=86c2b44d';

function capsule(ctx, x0, x1, hw) {
  ctx.beginPath();
  ctx.moveTo(x0 + hw, -hw);
  ctx.lineTo(x1 - hw, -hw);
  ctx.arc(x1 - hw, 0, hw, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0 + hw, hw);
  ctx.arc(x0 + hw, 0, hw, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

function poly(ctx, pts, mirror = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (mirror) for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], -pts[i][1]);
  ctx.closePath();
}

// Propellers, seen from above, drawn steady. The old blade was the edge-on view of a turning blade, so its length swung from
// nothing to full about 16 times a second: that was the shimmer on the wings. Now a soft disc stays put and one blade bar of
// a fixed length turns on it, PROP_RATE radians a second: under a quarter turn a frame at 60 Hz or at 120 Hz.
const PROP_RATE = 26;
const NOSE_PROP = { x: 13.2, disc: 7.5, r: 6.9 }; // the single-engine prop, at the nose
const WING_PROP = { x: 9.3, disc: 5, r: 4.4 }; // each of the regional's two, on its nacelle
function propDisc(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(40,40,40,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
/** One blade bar through the hub at angle `ang`: its length is fixed, so it turns without flipping. */
function propBlades(ctx, x, y, r, ang, alpha, lw) {
  const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r;
  ctx.strokeStyle = `rgba(40,40,40,${alpha})`;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
}

const shapes = {
  liner(ctx, c, t, shadow) {
    // wings
    poly(ctx, [[5, 3], [-7, 22], [-12.5, 22], [-6, 3]]);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    if (!shadow) {
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // engines
      ctx.fillStyle = '#d9d4c8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(0, s * 10, 3.6, 1.9, 0, 0, TAU);
        ctx.fill();
      }
    }
    // tailplane
    poly(ctx, [[-14, 2], [-20, 9.5], [-23, 9.5], [-20.5, 2]]);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    if (!shadow) {
      ctx.strokeStyle = c.dark;
      ctx.stroke();
    }
    // fuselage
    capsule(ctx, -23, 23, 3.8);
    ctx.fillStyle = shadow || '#f6f1e4';
    ctx.fill();
    if (shadow) return;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = c.main;
    ctx.fillRect(-21, -1.1, 38, 2.2);
    ctx.fillStyle = '#2b4458';
    ctx.beginPath();
    ctx.ellipse(18.2, 0, 2.2, 2.6, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
  },

  prop(ctx, c, t, shadow) {
    // fuselage
    capsule(ctx, -15, 12, 3.1);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    if (!shadow) {
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // tailplane
    poly(ctx, [[-11, 1], [-13, 6.5], [-16, 6.5], [-15, 1]]);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    // straight high wing (drawn over fuselage)
    ctx.beginPath();
    ctx.moveTo(4.5, -17.5);
    ctx.lineTo(4.5, 17.5);
    ctx.arcTo(-1.5, 17.5, -1.5, 14, 2);
    ctx.lineTo(-1.5, -14);
    ctx.arcTo(-1.5, -17.5, 4.5, -17.5, 2);
    ctx.closePath();
    ctx.fillStyle = shadow || c.light;
    ctx.fill();
    if (shadow) return;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = c.main;
    ctx.fillRect(-1.5, -17.5, 6, 3);
    ctx.fillRect(-1.5, 14.5, 6, 3);
    ctx.fillStyle = '#2b4458';
    ctx.fillRect(5.5, -2, 3, 4);
    // spinning propeller: a steady disc, with the blades turning on it (propBlades)
    propDisc(ctx, NOSE_PROP.x, 0, NOSE_PROP.disc);
    if (t != null) propBlades(ctx, NOSE_PROP.x, 0, NOSE_PROP.r, t * PROP_RATE, 0.75, 1.4);
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.arc(NOSE_PROP.x, 0, 1.5, 0, TAU);
    ctx.fill();
  },

  jet(ctx, c, t, shadow) {
    poly(ctx, [[21, 0], [12, 2.6], [1, 4], [-9, 14.5], [-13.5, 14.5], [-11.5, 4.4], [-15, 7.5], [-18, 7.5], [-17, 2.5]]);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    if (shadow) return;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // spine highlight
    ctx.fillStyle = c.light;
    poly(ctx, [[16, 0], [6, 1.6], [-14, 1.6]]);
    ctx.fill();
    // canopy
    ctx.fillStyle = '#2b4458';
    ctx.beginPath();
    ctx.ellipse(9, 0, 4.4, 1.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(10, -0.6, 1.8, 0.6, 0, 0, TAU);
    ctx.fill();
    // afterburner flicker
    const f = 0.6 + 0.4 * Math.sin(t * 40);
    ctx.fillStyle = `rgba(255,170,60,${0.55 * f})`;
    ctx.beginPath();
    ctx.ellipse(-19.5, 0, 3 + f * 2, 1.7, 0, 0, TAU);
    ctx.fill();
  },

  heli(ctx, c, t, shadow, rotorSpeed = 1) {
    // tail boom
    ctx.fillStyle = shadow || c.dark;
    ctx.fillRect(-18, -1.3, 16, 2.6);
    ctx.fillRect(-20, -4.5, 3, 9);
    if (!shadow) {
      // skids
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -6.5);
      ctx.lineTo(8, -6.5);
      ctx.moveTo(-6, 6.5);
      ctx.lineTo(8, 6.5);
      ctx.stroke();
    }
    // body
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 9.5, 6.5, 0, 0, TAU);
    ctx.fillStyle = shadow || c.main;
    ctx.fill();
    if (!shadow) {
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#2b4458';
      ctx.beginPath();
      ctx.ellipse(6, 0, 4.2, 4.6, 0, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-1, -2.5, 4, 1.6, 0, 0, TAU);
      ctx.fill();
    }
    // rotor
    const R = 18;
    if (!shadow) {
      ctx.fillStyle = `rgba(30,30,30,${0.12 * rotorSpeed})`;
      ctx.beginPath();
      ctx.arc(1, 0, R, 0, TAU);
      ctx.fill();
    }
    if (t == null) return; // cached body: blades are drawn live
    const ang = t * 22 * rotorSpeed;
    ctx.strokeStyle = shadow || 'rgba(35,35,35,0.8)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = ang + (i * TAU) / 3;
      ctx.moveTo(1, 0);
      ctx.lineTo(1 + Math.cos(a) * R, Math.sin(a) * R);
    }
    ctx.stroke();
    if (!shadow) {
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.arc(1, 0, 2, 0, TAU);
      ctx.fill();
    }
  },
};

// Twin turboprop / regional: straight high wing, two nacelles, T-tail.
shapes.regional = function regional(ctx, c, t, shadow) {
  ctx.beginPath();
  ctx.moveTo(4, -20);
  ctx.lineTo(4, 20);
  ctx.lineTo(-2.5, 19);
  ctx.lineTo(-2.5, -19);
  ctx.closePath();
  ctx.fillStyle = shadow || c.main;
  ctx.fill();
  if (!shadow) {
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  poly(ctx, [[-14, 1.5], [-17, 8], [-20, 8], [-19, 1.5]]);
  ctx.fillStyle = shadow || c.main;
  ctx.fill();
  capsule(ctx, -20, 17, 3.3);
  ctx.fillStyle = shadow || '#f6f1e4';
  ctx.fill();
  if (shadow) return;
  ctx.strokeStyle = c.dark;
  ctx.stroke();
  ctx.fillStyle = c.main;
  ctx.fillRect(-18, -1, 32, 2);
  ctx.fillStyle = '#2b4458';
  ctx.beginPath();
  ctx.ellipse(13.5, 0, 2, 2.4, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  for (const sy of [-9, 9]) {
    ctx.fillStyle = '#d9d4c8';
    ctx.beginPath();
    ctx.ellipse(4.5, sy, 4.4, 1.9, 0, 0, TAU);
    ctx.fill();
    propDisc(ctx, WING_PROP.x, sy, WING_PROP.disc);
    if (t != null) propBlades(ctx, WING_PROP.x, sy, WING_PROP.r, t * PROP_RATE + sy * 0.1, 0.7, 1.2);
  }
};

// Widebody: long fuselage, big swept wings, four engines.
shapes.heavy = function heavy(ctx, c, t, shadow) {
  poly(ctx, [[6, 4.5], [-9, 27], [-15.5, 27], [-7, 4.5]]);
  ctx.fillStyle = shadow || c.main;
  ctx.fill();
  if (!shadow) {
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#d9d4c8';
    for (const s of [-1, 1]) {
      for (const [ex, ey] of [[0, 10], [-5.5, 18]]) {
        ctx.beginPath();
        ctx.ellipse(ex, s * ey, 3.8, 2, 0, 0, TAU);
        ctx.fill();
      }
    }
  }
  poly(ctx, [[-19, 2.5], [-25, 11], [-28.5, 11], [-26, 2.5]]);
  ctx.fillStyle = shadow || c.main;
  ctx.fill();
  if (!shadow) {
    ctx.strokeStyle = c.dark;
    ctx.stroke();
  }
  capsule(ctx, -29, 29, 4.8);
  ctx.fillStyle = shadow || '#f6f1e4';
  ctx.fill();
  if (shadow) return;
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = c.main;
  ctx.fillRect(-27, -1.4, 50, 2.8);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(16, 0, 7, 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b4458';
  ctx.beginPath();
  ctx.ellipse(23.5, 0, 2.6, 3.2, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
};

/** Draw a shadow (pass shadowColor) or the aircraft itself, centred on the current transform. */
export function drawAircraftShape(ctx, type, zone, t, shadowColor = null, rotorSpeed = 1) {
  shapes[type](ctx, ZONE_COLORS[zone], t, shadowColor, rotorSpeed);
}

/** Just the moving parts (propellers, rotor), drawn live over a cached body. */
export function drawSpinners(ctx, type, t, shadowColor = null, rotorSpeed = 1) {
  ctx.lineCap = 'round';
  if (type === 'prop') {
    if (shadowColor) return;
    propBlades(ctx, NOSE_PROP.x, 0, NOSE_PROP.r, t * PROP_RATE, 0.75, 1.4);
  } else if (type === 'regional') {
    if (shadowColor) return;
    for (const sy of [-9, 9]) propBlades(ctx, WING_PROP.x, sy, WING_PROP.r, t * PROP_RATE + sy * 0.1, 0.7, 1.2);
  } else if (type === 'heli') {
    const R = 18;
    const ang = t * 22 * rotorSpeed;
    ctx.strokeStyle = shadowColor || 'rgba(35,35,35,0.8)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = ang + (i * TAU) / 3;
      ctx.moveTo(1, 0);
      ctx.lineTo(1 + Math.cos(a) * R, Math.sin(a) * R);
    }
    ctx.stroke();
  }
}

const cache = new Map();
const EXTENT = 34; // sprite units from centre to the farthest wingtip/rotor

/**
 * Bitmap of an aircraft body (no moving parts) at `pxPerUnit` resolution, cached. Drawing these
 * with drawImage is far cheaper than re-filling every path for 30 aircraft each frame.
 */
export function spriteBitmap(type, zone, shadowColor, pxPerUnit) {
  const res = Math.max(0.5, 2 ** (Math.ceil(Math.log2(pxPerUnit) * 3) / 3)); // coarse log buckets: zooming doesn't thrash
  const key = `${type}|${zone}|${shadowColor || ''}|${res}`;
  let c = cache.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  const size = Math.ceil(EXTENT * 2 * res);
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.setTransform(res, 0, 0, res, size / 2, size / 2);
  shapes[type](g, ZONE_COLORS[zone], null, shadowColor, 1);
  c.unit = EXTENT;
  if (cache.size > 60) cache.clear();
  cache.set(key, c);
  return c;
}
