// Shared pieces for the brand pages: the home page and its localized copies, the press kit, the events and the 404 page.
// Markup helpers, a small Markdown renderer (headings, paragraphs, bullets, links, bold), the renderer for the store listing's
// text (a headline, short headings and "•" bullets), the airport pick list, the trailer facade and the language switch.
// Every function is a pure function of its inputs. Nothing here writes a file; the page modules do.
import { html, raw, esc } from './html.mjs';
import { sectionLive } from './layout.mjs';
import { airportPath } from './slug.mjs';

export const TRAILER_ID = 'MQPF7geuSas';
export const TRAILER_URL = `https://www.youtube.com/watch?v=${TRAILER_ID}`;

// Links in our own copy may point only to our site, to mail, or to the page itself (no script URLs).
const SAFE_HREF = /^(https:\/\/|\/|mailto:|#)/;

/** 29164 -> "29,164"; with floor(n / step) * step and a plus sign: roundDown(29164, 1000) -> "29,000+". */
export function groupNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function roundDown(n, step) {
  return `${groupNumber(Math.floor(n / step) * step)}+`;
}

function inline(text) {
  let s = esc(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const target = url.replace(/&amp;/g, '&');
    if (!SAFE_HREF.test(target)) return label;
    return `<a href="${esc(target)}">${label}</a>`;
  });
  return s;
}

/**
 * A small Markdown subset for our own copy (site-src/events, site-src/press): "## " and "### " headings, paragraphs (lines
 * up to a blank line are one paragraph), "- " bullets, **bold** and [label](url). Everything else is escaped text.
 */
export function markdown(source) {
  const out = [];
  let para = [];
  let items = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (items) out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
    items = null;
  };
  for (const line of source.replace(/\r/g, '').split('\n').map((l) => l.trim())) {
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const tag = heading[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      continue;
    }
    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flushPara();
      (items ||= []).push(bullet[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return raw(out.join('\n'));
}

/**
 * The store listing's full description, in any of the 13 languages. Its first line is the headline (the caller shows it as
 * the h1); the rest is paragraphs, short heading lines (a line of 60 characters or less that is followed by bullets) and bullets
 * that begin with "•". A paragraph that names OpenStreetMap is the credit line, set small.
 */
export function storeBody(full) {
  const lines = full.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const first = lines.findIndex(Boolean);
  const body = lines.slice(first + 1);
  const out = [];
  let para = [];
  let items = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (items) out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
    items = null;
  };
  body.forEach((line, k) => {
    if (!line) {
      flushPara();
      flushList();
      return;
    }
    if (line.startsWith('•')) {
      flushPara();
      (items ||= []).push(line.replace(/^•\s*/, ''));
      return;
    }
    flushList();
    if (/OpenStreetMap/.test(line)) {
      flushPara();
      out.push(`<p class="credit">${inline(line)}</p>`);
      return;
    }
    const next = body.slice(k + 1).find(Boolean);
    if (line.length <= 60 && next && next.startsWith('•')) {
      flushPara();
      out.push(`<h2>${inline(line)}</h2>`);
      return;
    }
    para.push(line);
  });
  flushPara();
  flushList();
  return raw(out.join('\n'));
}

/** The first line of a store full description (the headline), escaped for use as text. */
export function storeHeadline(full) {
  return full.replace(/\r/g, '').split('\n').map((l) => l.trim()).find(Boolean) || '';
}

const SHOT_BASE = '/assets/site/img/shot-';

/** A game picture from the store art: WebP at 640 and 1280 wide (site-src/assets/img). Captions are optional. */
export function shot(name, alt, caption = '', { sizes = '(min-width: 900px) 560px, 92vw', eager = false } = {}) {
  const base = `${SHOT_BASE}${name}`;
  return html`<figure class="figure">
  <img src="${base}-1280.webp" srcset="${base}-640.webp 640w, ${base}-1280.webp 1280w" sizes="${sizes}" width="1280" height="720" alt="${alt}"${eager ? raw(' fetchpriority="high"') : raw(' loading="lazy"')} decoding="async">${caption ? html`
  <figcaption>${caption}</figcaption>` : ''}
</figure>`;
}

/** The hero's phone frame: one game picture, landscape, inside a bezel. The picture is the game's own screenshot. */
export function phone(name, alt) {
  const base = `${SHOT_BASE}${name}`;
  return html`<figure class="phone">
  <div class="phone-screen"><img src="${base}-1280.webp" srcset="${base}-640.webp 640w, ${base}-1280.webp 1280w" sizes="(min-width: 900px) 520px, 88vw" width="1280" height="720" alt="${alt}" fetchpriority="high" decoding="async"></div>
</figure>`;
}

/**
 * The trailer, as a facade: a poster that links to the video on YouTube. Without JavaScript the link opens YouTube; with it,
 * home.js swaps the poster for the youtube-nocookie player only when the reader presses play, so nothing loads before that.
 */
export function trailer(label, title) {
  return html`<div class="trailer" data-trailer="${TRAILER_ID}" data-title="${title}">
  <a class="trailer-poster" href="${TRAILER_URL}" data-trailer-link aria-label="${label}">
    <img src="/assets/site/brand/trailer-poster-1280.webp" srcset="/assets/site/brand/trailer-poster-640.webp 640w, /assets/site/brand/trailer-poster-1280.webp 1280w" sizes="(min-width: 900px) 720px, 92vw" width="1280" height="720" alt="" loading="lazy" decoding="async">
    <span class="trailer-play" aria-hidden="true"></span>
  </a>
  <p><a class="trailer-label" href="${TRAILER_URL}" data-trailer-link>${label}</a></p>
</div>`;
}

/** The language switch: a chip for each live home, marked with hreflang and its own language. */
export function langSwitch(ctx, current, label) {
  const live = ctx.config.languages.filter((l) => l.live !== false);
  const here = live.find((l) => l.code === current) || live[0];
  return html`<details class="langs">
  <summary><span>${label}:</span> <b>${here.name}</b></summary>
  <nav class="langs-list" aria-label="${label}">${live.map((l) => html`<a href="${l.path}" hreflang="${l.hreflang}" lang="${l.htmlLang}" data-event="language_change" data-ev-from="${current}" data-ev-to="${l.code}"${l.code === current ? raw(' aria-current="true"') : ''}>${l.name}</a>`)}</nav>
</details>`;
}

/** Where the pick search sends a reader: the airport page when the airports section is live, otherwise the demo at that airport. */
export function pickTemplate(ctx) {
  return sectionLive(ctx.config, 'airports') ? '/airports/{lower}/' : `${ctx.config.demoPath}?a={icao}`;
}

export function pickHref(ctx, icao) {
  return pickTemplate(ctx).replace('{lower}', icao.toLowerCase()).replace('{icao}', icao);
}

/** The busiest airports as the game lists them (ACI World 2025), with their names. */
export function busiestAirports(ctx, count) {
  return ctx.data.busiestRows.slice(0, count).map((row) => ctx.data.airports.get(row.icao)).filter(Boolean);
}

/** The pick search: a labelled field, a live list of results (the script fills it) and the busiest airports as links. */
export function pickBlock(ctx, lang) {
  const { t } = ctx;
  const L = (key) => t(lang, key);
  const busiest = busiestAirports(ctx, 12);
  return html`<div class="pick">
  <form class="search pick-form" role="search" action="${sectionLive(ctx.config, 'airports') ? '/airports/' : ctx.config.demoPath}" method="get" data-pick data-pick-template="${pickTemplate(ctx)}" data-no-results="${L('home.pickNone')}">
    <label for="pick-input">${L('home.pickLabel')}</label>
    <input id="pick-input" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="${L('home.pickPlaceholder')}" aria-controls="pick-results" aria-describedby="pick-status">
    <p id="pick-status" class="pick-status" role="status" aria-live="polite"></p>
    <ul class="results" id="pick-results"></ul>
  </form>
  <div class="pick-busiest">
    <h3>${L('home.pickBusiest')}</h3>
    <ul class="chips">${busiest.map((a) => html`<li><a class="chip" href="${pickHref(ctx, a.icao)}"><b>${a.icao}</b>&nbsp;${a.city || a.name}</a></li>`)}</ul>
    <p class="pick-all"><a href="${sectionLive(ctx.config, 'airports') ? '/airports/' : ctx.config.demoPath}">${L('home.pickAll')}</a></p>
  </div>
</div>`;
}
