// The guides: ten long articles written in Markdown (site-src/guides/<slug>.md, each with a front matter block) and the hub at
// /guides/. This module carries the small Markdown subset the articles use: ## and ### headings, paragraphs, bullet and numbered
// lists, blockquotes (shown as notes), pipe tables, links, bold, italics and code. Nothing is installed.
//
// Markers an article places on its own line, which this module expands (each article has exactly one {{demo}} and one {{play}}):
//   {{demo}}            the "Try it yourself" box: the browser demo at the airport named in the front matter
//   {{play}}            the Google Play box, with the campaign guide-<slug>
//   {{busiest-50}}      the game's list of the 50 busiest airports (site-src/data/busiest.json, names from airports.json)
//   {{codes:10}}        the ten busiest airports with their ICAO and IATA codes
//   {{event:thanksgiving}}  one sentence on the holiday event, from config.events (planned for 3.4 until its flag is set)
//
// Front matter keys: slug, title, metaTitle (optional), description, summary, eyebrow, published, updated (YYYY-MM-DD),
// order (number), demo (an ICAO code that has a map), related (slugs, comma separated, optional).
// Words the pages need (buttons, labels) are in site-src/guides/strings.json, so they can be moved to i18n later.
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, esc, jsonLdScript } from '../lib/html.mjs';
import { layout, absoluteUrl } from '../lib/layout.mjs';
import { playLink } from '../lib/play.mjs';
import { slugify, airportPath } from '../lib/slug.mjs';

export const order = 40;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICAO = /^[A-Z0-9]{4}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS_PER_MINUTE = 220;
const WORDS_MIN = 1000;
const WORDS_MAX = 1800;

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Fills {name} placeholders in a string from strings.json. */
function fill(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
}

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

/** Splits "---\nkey: value\n---" from the Markdown. Values are plain text; the first colon separates key and value. */
export function parseFrontMatter(source, file) {
  const text = source.replace(/\r/g, '');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) throw new Error(`guides: ${file} has no front matter block`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`guides: ${file} has a bad front matter line: ${line}`);
    meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

// ----- inline and block Markdown -----

/** Inline Markdown on one line of text. Text is escaped first, so only the markup written here becomes HTML. */
function inline(text, links) {
  let s = esc(text);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]\n]+)\]\(((?:https:\/\/|\/)[^)\s]*)\)/g, (_, label, href) => {
    if (links) links.push(href);
    return `<a href="${href}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

const plain = (text) => text.replace(/`|\*\*|\[|\]\([^)]*\)/g, '').replace(/\*/g, '');

/**
 * Turns the article body into blocks: { kind: 'html', html, words } | { kind: 'marker', name } | { kind: 'heading', level, id, text }.
 * Heading ids are unique within the article. links collects every link target (for the checks).
 */
export function renderMarkdown(source, file, links = []) {
  const blocks = [];
  const ids = new Set();
  let para = [];
  let list = null;
  let quote = null;
  let table = null;
  let words = 0;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    words += countWords(text);
    blocks.push({ kind: 'html', html: `<p>${inline(text, links)}</p>` });
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    const items = list.items.map((t) => {
      words += countWords(t);
      return `<li>${inline(t, links)}</li>`;
    });
    blocks.push({ kind: 'html', html: `<${tag}>${items.join('')}</${tag}>` });
    list = null;
  };
  const flushQuote = () => {
    if (!quote) return;
    const text = quote.join(' ');
    words += countWords(text);
    blocks.push({ kind: 'html', html: `<blockquote class="note"><p>${inline(text, links)}</p></blockquote>` });
    quote = null;
  };
  const flushTable = () => {
    if (!table) return;
    const cell = (tag, c, label) => {
      words += countWords(c);
      const attr = label ? ` data-label="${label.replace(/[*`]/g, '').replace(/"/g, '&quot;')}"` : '';
      return `<${tag}${attr}>${inline(c, links)}</${tag}>`;
    };
    const head = table.head.map((c) => cell('th scope="col"', c)).join('');
    const body = table.body.map((row) => `<tr>${row.map((c, i) => cell('td', c, table.head[i])).join('')}</tr>`).join('');
    blocks.push({ kind: 'html', html: `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` });
    table = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
    flushTable();
  };

  for (const raw of source.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushAll();
      continue;
    }
    const marker = /^\{\{([a-z0-9:-]+)\}\}$/.exec(line);
    if (marker) {
      flushAll();
      blocks.push({ kind: 'marker', name: marker[1] });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushAll();
      if (heading[1].length === 1) throw new Error(`guides: ${file} uses a single # heading; the title comes from the front matter, sections use ##`);
      if (heading[1].length === 3) {
        // ### is a sub-heading: a heading block at level 3
        words += countWords(heading[2]);
        blocks.push({ kind: 'heading', level: 3, id: uniqueId(heading[2], ids), text: plain(heading[2]), html: inline(heading[2], links) });
        continue;
      }
      words += countWords(heading[2]);
      blocks.push({ kind: 'heading', level: 2, id: uniqueId(heading[2], ids), text: plain(heading[2]), html: inline(heading[2], links) });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushPara();
      flushQuote();
      flushTable();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushPara();
      flushQuote();
      flushTable();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      // consecutive "> " lines are one blockquote
      if (quote) {
        quote.push(quoted[1]);
        continue;
      }
      flushAll();
      quote = [quoted[1]];
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      flushPara();
      flushList();
      flushQuote();
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // the separator row under the header
      if (!table) table = { head: cells, body: [] };
      else table.body.push(cells);
      continue;
    }
    flushList();
    flushQuote();
    flushTable();
    para.push(line);
  }
  flushAll();
  return { blocks, words };
}

function uniqueId(text, ids) {
  const base = slugify(plain(text)) || 'section';
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  ids.add(id);
  return id;
}

// ----- generated pieces -----

function demoBox(ctx, S, airport, name) {
  const href = `${ctx.config.demoPath}?a=${airport}`;
  return html`<aside class="card guide-cta" aria-labelledby="demo-${airport.toLowerCase()}">
  <h2 id="demo-${airport.toLowerCase()}">${S['demo.heading']}</h2>
  <p>${fill(S['demo.body'], { airport: name })}</p>
  <p><a class="btn btn--ghost" href="${href}" data-event="demo_start" data-ev-airport="${airport}">${fill(S['demo.button'], { code: airport })}</a></p>
</aside>`;
}

function playBox(ctx, S, slug) {
  const key = `guide-${slug}`;
  return html`<aside class="card guide-cta" aria-labelledby="play-${slug}">
  <h2 id="play-${slug}">${S['play.heading']}</h2>
  <p>${S['play.body']}</p>
  <p><a class="btn" href="${playLink(key, 'guide-cta')}" data-event="play_store_click" data-ev-page="${key}" data-ev-position="guide-cta">${S['play.button']}</a></p>
</aside>`;
}

/** The game's BUSIEST list: rank, airport name and city, ICAO and IATA codes, passengers in millions. */
function busiestTable(ctx, S, count) {
  const rows = [...ctx.data.busiest.values()].sort((a, b) => a.rank - b.rank).slice(0, count);
  const body = rows.map((r) => {
    const a = ctx.data.airports.get(r.icao);
    const name = a ? a.name : r.icao;
    const codes = a && a.iata ? `${r.icao} / ${a.iata}` : r.icao;
    const place = a && a.city ? `${name}, ${a.city}` : name;
    return html`<tr><td data-label="${S['busiest.col.rank']}">${r.rank}</td><td data-label="${S['busiest.col.airport']}"><a href="${airportPath(r.icao)}">${place}</a></td><td data-label="${S['busiest.col.codes']}">${codes}</td><td data-label="${S['busiest.col.passengers']}">${r.passengersM.toFixed(1)}</td></tr>`;
  });
  return html`<div class="table-wrap"><table>
<caption>${S['busiest.caption']}</caption>
<thead><tr><th scope="col">${S['busiest.col.rank']}</th><th scope="col">${S['busiest.col.airport']}</th><th scope="col">${S['busiest.col.codes']}</th><th scope="col">${S['busiest.col.passengers']}</th></tr></thead>
<tbody>${body}</tbody>
</table></div>`;
}

/** The ten busiest airports with codes only, for the codes guide. */
function codesTable(ctx, S, count) {
  const rows = [...ctx.data.busiest.values()].sort((a, b) => a.rank - b.rank).slice(0, count);
  const body = rows.map((r) => {
    const a = ctx.data.airports.get(r.icao);
    return html`<tr><td data-label="${S['busiest.col.rank']}">${r.rank}</td><td data-label="${S['busiest.col.airport']}"><a href="${airportPath(r.icao)}">${a ? a.name : r.icao}</a></td><td data-label="ICAO">${r.icao}</td><td data-label="IATA">${a && a.iata ? a.iata : 'none listed'}</td></tr>`;
  });
  return html`<div class="table-wrap"><table>
<thead><tr><th scope="col">${S['busiest.col.rank']}</th><th scope="col">${S['busiest.col.airport']}</th><th scope="col">ICAO</th><th scope="col">IATA</th></tr></thead>
<tbody>${body}</tbody>
</table></div>`;
}

function markerHtml(ctx, S, g, name) {
  if (name === 'demo') return demoBox(ctx, S, g.meta.demo, ctx.data.airports.get(g.meta.demo)?.name || g.meta.demo);
  if (name === 'play') return playBox(ctx, S, g.meta.slug);
  if (name === 'busiest-50') return busiestTable(ctx, S, 50);
  const codes = /^codes:(\d+)$/.exec(name);
  if (codes) return codesTable(ctx, S, Number(codes[1]));
  const event = /^event:(thanksgiving)$/.exec(name);
  if (event) {
    const live = ctx.config.events[event[1]]?.live === true;
    return html`<p class="note">${live ? S['event.live'] : S['event.coming']}</p>`;
  }
  throw new Error(`guides: unknown marker {{${name}}} in ${g.file}`);
}

// ----- loading and checks -----

function loadGuides(ctx) {
  const dir = path.join(ctx.root, 'site-src', 'guides');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const guides = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const { meta, body } = parseFrontMatter(source, file);
    const slug = file.replace(/\.md$/, '');
    const where = `site-src/guides/${file}`;
    for (const key of ['slug', 'title', 'description', 'summary', 'eyebrow', 'published', 'updated', 'order', 'demo']) {
      if (!meta[key]) throw new Error(`guides: ${where} is missing "${key}" in its front matter`);
    }
    if (meta.slug !== slug || !SLUG.test(slug)) throw new Error(`guides: ${where}: slug must match the file name (lowercase words joined by hyphens)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.published) || !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`guides: ${where}: dates must be YYYY-MM-DD`);
    if (!/^\d+$/.test(meta.order)) throw new Error(`guides: ${where}: order must be a number`);
    if (meta.description.length < 50 || meta.description.length > 160) throw new Error(`guides: ${where}: description must be 50 to 160 characters (is ${meta.description.length})`);
    const metaTitle = meta.metaTitle || `${meta.title} | Short Final guide`;
    if (metaTitle.length > 70) throw new Error(`guides: ${where}: the page title is ${metaTitle.length} characters; keep it to 70`);
    if (!ICAO.test(meta.demo) || !ctx.data.mappedSet.has(meta.demo)) throw new Error(`guides: ${where}: demo airport ${meta.demo} must be an airport with a map`);
    const related = meta.related ? meta.related.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const links = [];
    const { blocks, words } = renderMarkdown(body, where, links);
    const markers = blocks.filter((b) => b.kind === 'marker').map((b) => b.name);
    for (const need of ['demo', 'play']) {
      const count = markers.filter((m) => m === need).length;
      if (count !== 1) throw new Error(`guides: ${where} needs exactly one {{${need}}} marker (has ${count})`);
    }
    if (words < WORDS_MIN || words > WORDS_MAX) throw new Error(`guides: ${where} has ${words} words; the range is ${WORDS_MIN} to ${WORDS_MAX}`);
    const headings = blocks.filter((b) => b.kind === 'heading');
    const sources = headingSection(blocks, 'Sources');
    if (!sources) throw new Error(`guides: ${where} needs a "## Sources" section at the end`);
    const sourceLinks = sources.filter((b) => b.kind === 'html').map((b) => b.html).join('').match(/<a href="https:\/\/[^"]+"/g) || [];
    if (sourceLinks.length < 2) throw new Error(`guides: ${where}: the Sources section needs at least two links to public sources`);
    if (!links.some((h) => h === '/')) throw new Error(`guides: ${where} should link to the home page (/)`);
    if (!links.some((h) => h.startsWith('/airports/'))) throw new Error(`guides: ${where} should link to at least one airport page`);
    for (const href of links) {
      const m = /^\/airports\/([a-z0-9]{3,4})\/$/.exec(href);
      if (m && !ctx.data.mappedSet.has(m[1].toUpperCase())) throw new Error(`guides: ${where} links to ${href}, which is not an airport with a map`);
    }
    guides.push({ file, where, slug, meta: { ...meta, metaTitle }, related, blocks, words, headings, links, markers });
  }
  const known = new Set(guides.map((g) => g.slug));
  for (const g of guides) {
    for (const r of g.related) if (!known.has(r)) throw new Error(`guides: ${g.where} lists related guide "${r}", which does not exist`);
  }
  return guides.sort((a, b) => Number(a.meta.order) - Number(b.meta.order) || (a.slug < b.slug ? -1 : 1));
}

/** The blocks under the "## <name>" heading, up to the next ## heading. */
function headingSection(blocks, name) {
  const start = blocks.findIndex((b) => b.kind === 'heading' && b.level === 2 && b.text.trim().toLowerCase() === name.toLowerCase());
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < blocks.length; i++) {
    if (blocks[i].kind === 'heading' && blocks[i].level === 2) break;
    out.push(blocks[i]);
  }
  return out;
}

// ----- pages -----

function articleJsonLd(ctx, g, url) {
  const config = ctx.config;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.meta.title,
    description: g.meta.description,
    url,
    mainEntityOfPage: url,
    datePublished: g.meta.published,
    dateModified: g.meta.updated,
    inLanguage: 'en',
    wordCount: g.words,
    image: absoluteUrl(config, config.defaultImage),
    author: { '@type': 'Organization', name: config.publisher, url: `${config.domain}/` },
    publisher: {
      '@type': 'Organization',
      name: config.publisher,
      url: `${config.domain}/`,
      logo: { '@type': 'ImageObject', url: absoluteUrl(config, '/assets/site/img/app-icon-512.png') },
    },
  };
}

function breadcrumbs(config, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${config.domain}${href}` })),
  };
}

function articlePage(ctx, S, g) {
  const { config, t } = ctx;
  const lang = 'en';
  const L = (key) => t(lang, key);
  const slug = g.slug;
  const path = `/guides/${slug}/`;
  const url = `${config.domain}${path}`;

  // The body: blocks in order, markers replaced. Headings are h2/h3 with ids for the contents list.
  const parts = g.blocks.map((b) => {
    if (b.kind === 'html') return b.html;
    if (b.kind === 'heading') return `<h${b.level} id="${b.id}">${b.html}</h${b.level}>`;
    return toHtml(markerHtml(ctx, S, g, b.name));
  });
  // The "Sources" section is the last one, so the Play box sits before it (the {{play}} marker is placed by the author).
  const toc = g.headings.filter((h) => h.level === 2 && h.text.toLowerCase() !== 'sources');
  const tocHtml = toc.length >= 3
    ? `<nav class="card guide-toc" aria-label="${esc(S['toc.label'])}"><p><strong>${esc(S['toc.label'])}</strong></p><ol>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>`
    : '';
  const related = g.related.map((r) => guideRef(r)).filter(Boolean);
  const minutes = Math.max(3, Math.round(g.words / WORDS_PER_MINUTE));
  const byline = fill(S['article.byline'], { publisher: config.publisher, published: longDate(g.meta.published), minutes });
  const updated = g.meta.updated !== g.meta.published ? ` · ${fill(S['article.updated'], { updated: longDate(g.meta.updated) })}` : '';

  const body = html`<div class="wrap">
  <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li><a href="/guides/">${S['hub.crumb']}</a></li><li aria-current="page">${g.meta.title}</li></ol></nav>
  <header class="page-head">
    <p class="eyebrow">${g.meta.eyebrow}</p>
    <h1>${g.meta.title}</h1>
    <p>${g.meta.summary}</p>
    <p class="guide-meta">${byline}${raw(updated)}</p>
  </header>
  <article class="prose guide" data-guide="${slug}">
    ${raw(tocHtml)}
    ${raw(parts.join('\n'))}
    <section class="guide-more" aria-labelledby="more-title">
      <h2 id="more-title">${S['related.heading']}</h2>
      <ul>${related.map(([href, title, summary]) => html`<li><a href="${href}">${title}</a>: ${summary}</li>`)}
        <li><a href="/guides/">${S['hub.listLabel']}</a></li></ul>
    </section>
  </article>
</div>`;

  const jsonLd = [articleJsonLd(ctx, g, url), breadcrumbs(config, [['Home', '/'], [S['hub.crumb'], '/guides/'], [g.meta.title, path]])];
  return layout(ctx, {
    lang,
    path,
    title: g.meta.metaTitle,
    description: g.meta.description,
    section: 'guides',
    playKey: `guide-${slug}`,
    ogType: 'article',
    jsonLd,
    body,
  });

  function guideRef(r) {
    const other = ctx.guides.find((x) => x.slug === r);
    return other ? [`/guides/${other.slug}/`, other.meta.title, other.meta.summary] : null;
  }
}

/** A raw html string from an html`` result or a string. */
function toHtml(v) {
  return typeof v === 'string' ? v : v.value;
}

function hubPage(ctx, S, guides) {
  const { config, t } = ctx;
  const L = (key) => t('en', key);
  const cards = guides.map((g) => {
    const minutes = Math.max(3, Math.round(g.words / WORDS_PER_MINUTE));
    return html`<article class="card guide-card">
      <p class="eyebrow">${g.meta.eyebrow}</p>
      <h2><a href="/guides/${g.slug}/">${g.meta.title}</a></h2>
      <p>${g.meta.summary}</p>
      <p class="guide-meta">${fill(S['hub.minutes'], { minutes })}</p>
      <p><a class="btn btn--ghost btn--sm" href="/guides/${g.slug}/">${S['hub.more']}<span class="sr-only">: ${g.meta.title}</span></a></p>
    </article>`;
  });
  const body = html`<div class="wrap">
  <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li aria-current="page">${S['hub.crumb']}</li></ol></nav>
  <header class="page-head">
    <h1>${S['hub.h1']}</h1>
    <p>${S['hub.lead']}</p>
  </header>
  <section class="section--tight" aria-label="${S['hub.listLabel']}">
    <div class="grid">${cards}</div>
    <p>${S['hub.classroomLead']} <a href="/classroom/">${S['hub.classroomLink']}</a></p>
  </section>
</div>`;
  const url = `${config.domain}/guides/`;
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: S['hub.h1'], description: S['hub.description'], url, inLanguage: 'en', dateModified: config.contentDate, isPartOf: { '@type': 'WebSite', name: config.siteName, url: `${config.domain}/` } },
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${config.domain}/guides/${g.slug}/`, name: g.meta.title })) },
    breadcrumbs(config, [['Home', '/'], [S['hub.crumb'], '/guides/']]),
  ];
  return layout(ctx, {
    lang: 'en',
    path: '/guides/',
    title: S['hub.title'],
    description: S['hub.description'],
    section: 'guides',
    playKey: 'guides-hub',
    image: '/assets/site/brand/og-guides.jpg',
    imageAlt: ctx.t('en', 'guides.ogAlt'),
    jsonLd,
    body,
  });
}

export async function pages(ctx) {
  const strings = JSON.parse(fs.readFileSync(path.join(ctx.root, 'site-src', 'guides', 'strings.json'), 'utf8'));
  const S = strings;
  const guides = loadGuides(ctx);
  ctx.guides = guides;
  const out = [];
  for (const g of guides) {
    out.push({
      path: `/guides/${g.slug}/`,
      html: articlePage(ctx, S, g),
      lastmod: g.meta.updated,
      section: 'guides',
    });
  }
  out.push({
    path: '/guides/',
    html: hubPage(ctx, S, guides),
    lastmod: ctx.config.contentDate,
    section: 'guides',
  });
  return out;
}
