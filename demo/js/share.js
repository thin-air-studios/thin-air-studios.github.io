import { WEB_DEMO, assetUrl } from './flavor.js?v=86c2b44d';
import { DEMO_SOURCE } from './demo.js?v=86c2b44d';
// Sharing a result: the caption, the spoiler-free daily line (Wordle style) and the result card image.
// Nothing personal goes out: no callsigns, no location, no ids. Just the airport, the score and the shape
// of the game.
import { FONT } from './fx.js?v=86c2b44d';
import { shareLinkFor } from './links.js?v=86c2b44d';

/**
 * The game minute by minute (game.timeline: {landed, trouble, crash} per minute of sim time) as one
 * row of squares: 'good' (landings, no trouble), 'busy' (close calls, go-arounds, emergencies),
 * 'quiet' (nothing landed), 'crash'. Long games are folded two or three minutes to a square.
 */
export function timelineRow(timeline, max = 12) {
  const mins = timeline.length;
  if (!mins) return [];
  const per = Math.max(1, Math.ceil(mins / max));
  const out = [];
  for (let i = 0; i < mins; i += per) {
    const group = timeline.slice(i, i + per).filter(Boolean);
    const sum = (k) => group.reduce((n, m) => n + (m[k] || 0), 0);
    out.push(sum('crash') ? 'crash' : sum('trouble') ? 'busy' : sum('landed') ? 'good' : 'quiet');
  }
  return out;
}

/**
 * Columns for the one-tap app buttons: as many as fit (`fit`), then evened out so no row is left short. Nine apps with
 * room for four make three rows of three, not 4 + 4 + 1.
 */
export function evenColumns(count, fit) {
  if (count < 1) return 1;
  const rows = Math.ceil(count / Math.max(1, fit));
  return Math.ceil(count / rows);
}

const SQUARE = { good: '🟩', busy: '🟨', quiet: '⬜', crash: '🟥' };

/**
 * The words that go with any share: the caption (also the image's alt text) and a title. Every caption names the game on Google
 * Play; destination: the app it goes to ('' for the share sheet), which the Play link carries as its install referrer (links.js).
 */
export function shareTexts(r, destination = 'share') {
  const pts = `${r.score.toLocaleString('en-US')} point${r.score === 1 ? '' : 's'}`;
  const where = r.iata ? `${r.city || r.name} (${r.iata})` : r.name;
  const landed = `${r.landed} landed${r.pax ? `, ${r.pax.toLocaleString('en-US')} passengers home safe` : ''}`;
  const tail = `\n${shareLinkFor(r, WEB_DEMO ? DEMO_SOURCE : destination).line}`; // the demo's links say so (DECISIONS 446)
  if (r.daily) {
    const row = timelineRow(r.timeline).map((s) => SQUARE[s]).join('');
    const tries = r.tries > 1 ? ` (best of ${r.tries})` : '';
    const text = `Short Final · Daily #${r.daily} · ${r.iata || r.icao}\n${pts} ${r.starText}${tries}\n${row ? row + '\n' : ''}${landed}.\nSame traffic for everyone today. Can you beat it?${tail}`;
    return { title: `Short Final · Daily #${r.daily}: ${pts}`, text };
  }
  if (r.weekend) {
    // the weekend event (weekend.js): the title is the theme's ("Storm weekend"); the same airport and weather, not the same planes
    const text = `${r.weekend} at ${r.iata || r.icao}: score ${r.score.toLocaleString('en-US')}\n${landed}.\nThe same airport and weather for everyone this weekend. Can you beat it?${tail}`;
    return { title: `Short Final · ${r.weekend}: ${pts}`, text };
  }
  // the real planes that landed: the same count as the end card's planes line (endLines), one word for it. A recording has none.
  const n = r.demo ? 0 : r.live || 0;
  const real = n > 0 ? `, ${n} real plane${n === 1 ? '' : 's'}` : '';
  const text = `${pts} at ${where} in Short Final ${r.starText}\n${landed}${real}. ✈${tail}`;
  return { title: `Short Final: ${pts} at ${r.iata || r.icao}`, text };
}

/**
 * A video's caption: the picture's words and the game's Google Play line for the destination (links.js shareLinkFor: the Play
 * link, or the words alone where a link can't be clicked). shareTexts carries that line itself.
 */
export function videoCaption(r, destination = '') {
  return shareTexts(r, destination).text;
}

let logo = null;
function loadLogo() {
  if (!logo) {
    logo = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = assetUrl('img/logo.svg');
    });
  }
  return logo;
}

const C = {
  bg0: '#1d4651', bg1: '#0e2328', cream: '#fff6e3', muted: 'rgba(255,246,227,0.62)', faint: 'rgba(255,246,227,0.08)',
  orange: '#f28c38', gold: '#f2c14e', red: '#e5533d', yellow: '#f2c14e', tarmac: '#33454c', chip: 'rgba(255,255,255,0.08)',
  good: '#5fb34d', busy: '#f2c14e', quiet: 'rgba(255,246,227,0.22)', crash: '#e5533d',
};

const font = (w, px) => `${w} ${px}px ${FONT}`;

/** Shrink a line of text until it fits the width. */
function fitText(g, text, weight, px, maxW) {
  let size = px;
  g.font = font(weight, size);
  while (size > 12 && g.measureText(text).width > maxW) {
    size -= 2;
    g.font = font(weight, size);
  }
  return size;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The airport's runways, coloured like the game's, fitted into a box: the place at a glance. */
function drawRunways(g, world, bx, by, bw, bh) {
  const rws = (world && world.runways) || [];
  if (!rws.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const z of rws) for (const e of z.ends) {
    x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y);
    x1 = Math.max(x1, e.x); y1 = Math.max(y1, e.y);
  }
  const s = Math.min(bw / Math.max(1, x1 - x0), bh / Math.max(1, y1 - y0));
  const ox = bx + (bw - (x1 - x0) * s) / 2, oy = by + (bh - (y1 - y0) * s) / 2;
  const P = (e) => [ox + (e.x - x0) * s, oy + (e.y - y0) * s];
  g.lineCap = 'round';
  for (const z of rws) {
    const [ax, ay] = P(z.ends[0]), [cx, cy] = P(z.ends[1]);
    const w = Math.max(16, Math.min(34, z.width * s));
    const col = z.family === 'yellow' ? C.yellow : C.red;
    g.strokeStyle = col;
    g.lineWidth = w + 8;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
    g.strokeStyle = C.tarmac;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
    if (z.family === 'both') {
      g.strokeStyle = C.yellow;
      g.lineWidth = 3;
      g.setLineDash([18, 18]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    g.setLineDash([14, 12]);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke();
    g.setLineDash([]);
  }
}

/** Faint radar rings: the card's backdrop. */
function drawRings(g, cx, cy, max) {
  g.strokeStyle = C.faint;
  g.lineWidth = 3;
  for (let r = 160; r <= max; r += 150) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
}

/**
 * The result card: 'feed' 1080x1350 (4:5, chats and feeds) or 'story' 1080x1920 (9:16, Stories and
 * Status). Everything important sits in the middle so square crops keep it.
 */
export async function renderCard(r, format = 'feed') {
  const W = 1080, H = format === 'story' ? 1920 : 1350;
  const story = format === 'story';
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  try {
    await document.fonts.load(font(700, 64));
    await document.fonts.load(font(600, 32));
  } catch (_) { /* system font then */ }
  const img = await loadLogo();

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bg0);
  bg.addColorStop(1, C.bg1);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const pad = 72;
  let y = story ? 150 : 72;
  // brand
  if (img) g.drawImage(img, pad, y, 112, 112);
  g.fillStyle = C.cream;
  g.textBaseline = 'alphabetic';
  g.font = font(700, 62);
  g.fillText('Short Final', pad + 136, y + 62);
  // the trademark mark, small and raised after the wordmark (requirement 29)
  const mark = g.measureText('Short Final').width;
  g.font = font(700, 26);
  g.fillText('™', pad + 136 + mark + 4, y + 30);
  g.fillStyle = C.orange;
  g.font = font(600, 32);
  g.fillText('Real traffic. Any airport.', pad + 138, y + 104);
  if (r.daily) {
    const label = `DAILY #${r.daily}`;
    g.font = font(700, 34);
    const lw = g.measureText(label).width + 48;
    g.fillStyle = C.orange;
    roundRect(g, W - pad - lw, y + 26, lw, 64, 32);
    g.fill();
    g.fillStyle = '#1b2b30';
    g.fillText(label, W - pad - lw + 24, y + 70);
  }
  y += story ? 230 : 170;

  // airport: the code big, the runways beside or under it
  const siteH = story ? 520 : 330;
  drawRings(g, W / 2, y + siteH / 2, story ? 900 : 700);
  g.fillStyle = C.cream;
  const code = r.iata || r.icao;
  if (story) {
    g.textAlign = 'center';
    g.font = font(700, 200);
    g.fillText(code, W / 2, y + 170);
    fitText(g, r.name, 600, 40, W - pad * 2);
    g.fillStyle = C.muted;
    g.fillText(r.name, W / 2, y + 235);
    g.textAlign = 'left';
    drawRunways(g, r.world, pad + 60, y + 290, W - pad * 2 - 120, siteH - 250);
    y += siteH + 90;
  } else {
    g.font = font(700, 190);
    g.fillText(code, pad, y + 170);
    const cw = Math.max(g.measureText(code).width, 300);
    g.fillStyle = C.muted;
    fitText(g, r.city || r.name, 600, 38, cw + 40);
    g.fillText(r.city || r.name, pad + 4, y + 230);
    drawRunways(g, r.world, pad + cw + 70, y + 10, W - pad * 2 - cw - 70, siteH - 30);
    y += siteH + 40;
  }

  // the score and its stars
  g.textAlign = 'center';
  g.fillStyle = C.cream;
  g.font = font(700, story ? 250 : 220);
  g.fillText(r.score.toLocaleString('en-US'), W / 2, y + (story ? 210 : 185));
  g.font = font(600, 36);
  g.fillStyle = C.muted;
  g.fillText(r.score === 1 ? 'POINT' : 'POINTS', W / 2, y + (story ? 270 : 240));
  y += story ? 300 : 265;
  g.font = font(700, 84);
  const starW = 96;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i < r.stars ? C.gold : 'rgba(255,246,227,0.18)';
    g.fillText('★', W / 2 + (i - 1) * starW, y + 76);
  }
  y += story ? 150 : 120;
  g.textAlign = 'left';

  // the daily's minute-by-minute squares
  const row = r.daily ? timelineRow(r.timeline) : [];
  if (row.length) {
    const size = Math.min(64, Math.floor((W - pad * 2 - (row.length - 1) * 14) / row.length));
    const total = row.length * size + (row.length - 1) * 14;
    let x = (W - total) / 2;
    for (const s of row) {
      g.fillStyle = C[s];
      roundRect(g, x, y, size, size, 12);
      g.fill();
      x += size + 14;
    }
    y += size + (story ? 70 : 44);
  }

  // stats as chips, two to a row
  const chips = [
    `${r.landed} landed`,
    r.pax ? `${r.pax.toLocaleString('en-US')} passengers` : null,
    !r.demo && (r.live || 0) > 0 ? `${r.live} real plane${r.live === 1 ? '' : 's'}` : null,
    r.departed ? `${r.departed} departed` : null,
    r.streak >= 3 ? `best streak ${r.streak}` : null,
    r.daily && r.tries > 1 ? `best of ${r.tries} tries` : null,
  ].filter(Boolean).slice(0, row.length && !story ? 2 : 4); // a daily card spends one row on its squares
  const cw = (W - pad * 2 - 24) / 2, ch = 92;
  const chipsEnd = y + Math.ceil(chips.length / 2) * (ch + 20) - 20;
  chips.forEach((t, i) => {
    const x = pad + (i % 2) * (cw + 24), cy = y + Math.floor(i / 2) * (ch + 20);
    g.fillStyle = C.chip;
    roundRect(g, x, cy, cw, ch, 26);
    g.fill();
    g.fillStyle = C.cream;
    fitText(g, t, 600, 38, cw - 48);
    g.fillText(t, x + 28, cy + 59);
  });

  // footer, and where to get the game: the store line under it (an image carries no link: the caption has it)
  g.fillStyle = C.muted;
  g.textAlign = 'center';
  g.font = font(600, 30);
  const foot = r.daily ? 'Same traffic for everyone today. Can you beat it?' : `${r.rank} · ${r.difficulty}`;
  fitText(g, foot, 600, 30, W - pad * 2);
  const footY = footerY(H, chipsEnd, story);
  g.fillText(foot, W / 2, footY);
  g.fillStyle = C.orange;
  g.font = font(700, 30);
  g.fillText('Free on Google Play', W / 2, footY + STORE_LINE);
  g.textAlign = 'left';
  return c;
}

/** The store line sits this far under the footer's baseline on the card. */
const STORE_LINE = 46;

/**
 * The card's footer baseline: clear of the last chips, near the bottom, and with room under it for the store line (STORE_LINE
 * lower).
 */
export function footerY(H, chipsEnd, story) {
  return Math.min(H - 40 - STORE_LINE, Math.max(chipsEnd + 72, H - (story ? 140 : 64) - STORE_LINE));
}

/** A canvas as base64 PNG (no data: prefix), the form the Android bridge takes. */
export function pngBase64(canvas) {
  return canvas.toDataURL('image/png').split(',')[1];
}
