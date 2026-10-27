// The classroom page (/classroom/, English) for teachers and aviation clubs: what the game is, why it suits a class or club, how to
// use the free browser demo in a lesson, three lesson ideas tied to the guides, the age and privacy note, and a contact line.
// The prose is site-src/classroom/en.md. It is read by the guides' Markdown renderer, so headings, lists, notes and links work as
// they do in the guides. The page's own labels and buttons are keys in site-src/i18n/en.json. Links to this page are in the footer
// and on the guides hub.
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, esc } from '../lib/html.mjs';
import { layout } from '../lib/layout.mjs';
import { playLink } from '../lib/play.mjs';
import { renderMarkdown } from './guides.mjs';

const PAGE_PATH = '/classroom/';
const PAGE_KEY = 'classroom';

/**
 * Groups the rendered blocks into sections (one per h2) and lesson cards (one per h3). The lesson cards sit in one grid outside
 * the reading column (three across on a laptop, one on a phone), so the page is not one narrow column. Demo links get the
 * demo_start event, as the guides' demo boxes do.
 */
export function sectionsFrom(blocks) {
  const out = [];
  let inSection = false;
  let inProse = false;
  let inStack = false;
  let inCard = false;
  const closeCard = () => {
    if (inCard) {
      out.push('</article>');
      inCard = false;
    }
  };
  const closeSection = () => {
    closeCard();
    if (inStack) {
      out.push('</div>');
      inStack = false;
    }
    if (inProse) {
      out.push('</div>');
      inProse = false;
    }
    if (inSection) {
      out.push('</div></section>');
      inSection = false;
    }
  };
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level === 2) {
      closeSection();
      out.push(`<section class="section" aria-labelledby="${esc(b.id)}"><div class="wrap"><div class="prose"><h2 id="${esc(b.id)}">${b.html}</h2>`);
      inSection = true;
      inProse = true;
    } else if (b.kind === 'heading') {
      closeCard();
      if (!inStack) {
        if (inProse) {
          out.push('</div>');
          inProse = false;
        }
        out.push('<div class="lessons">');
        inStack = true;
      }
      out.push(`<article class="card lesson" aria-labelledby="${esc(b.id)}"><h3 id="${esc(b.id)}">${b.html}</h3>`);
      inCard = true;
    } else if (b.kind === 'html') {
      out.push(b.html);
    } else {
      throw new Error(`classroom: the page text has a marker {{${b.name}}}; the classroom page takes no markers`);
    }
  }
  closeSection();
  return out
    .join('\n')
    .replace(/<a href="\/demo\/(\?a=([A-Z0-9]{4}))?">/g, (_, query, code) => (code
      ? `<a href="/demo/?a=${code}" data-event="demo_start" data-ev-airport="${code}">`
      : '<a href="/demo/" data-event="demo_start">'));
}

export async function pages(ctx) {
  const { config, t, root } = ctx;
  const lang = 'en';
  const L = (key, vars) => t(lang, key, vars);
  const source = fs.readFileSync(path.join(root, 'site-src', 'classroom', 'en.md'), 'utf8');
  const { blocks } = renderMarkdown(source, 'classroom/en.md');
  const prose = raw(sectionsFrom(blocks));

  const title = L('classroom.title');
  const description = L('classroom.description');
  const url = `${config.domain}${PAGE_PATH}`;
  const play = playLink(PAGE_KEY, 'hero');
  const playEnd = playLink(PAGE_KEY, 'classroom-cta');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url,
      inLanguage: 'en',
      dateModified: config.contentDate,
      isPartOf: { '@type': 'WebSite', name: config.siteName, url: `${config.domain}/` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: L('crumb.home'), item: `${config.domain}/` },
        { '@type': 'ListItem', position: 2, name: L('classroom.crumb'), item: url },
      ],
    },
  ];

  const body = html`<div class="wrap">
  <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li aria-current="page">${L('classroom.crumb')}</li></ol></nav>
  <header class="page-head">
    <p class="eyebrow">${L('classroom.eyebrow')}</p>
    <h1>${L('classroom.h1')}</h1>
    <p>${L('classroom.lead')}</p>
    <div class="btn-row">
      <a class="btn" href="${play}" data-event="play_store_click" data-ev-page="${PAGE_KEY}" data-ev-position="hero">${L('cta.getOnPlay')}</a>
      <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
    </div>
  </header>
</div>
${prose}
<section class="section section--band" aria-labelledby="go-title">
  <div class="wrap band">
    <div>
      <h2 id="go-title">${L('classroom.endTitle')}</h2>
      <p>${L('classroom.endBody')}</p>
    </div>
    <div class="btn-row">
      <a class="btn" href="${playEnd}" data-event="play_store_click" data-ev-page="${PAGE_KEY}" data-ev-position="classroom-cta">${L('cta.getOnPlay')}</a>
      <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
    </div>
  </div>
</section>
<section class="section" aria-labelledby="contact-title">
  <div class="wrap"><div class="prose">
    <h2 id="contact-title">${L('classroom.contactTitle')}</h2>
    <p>${L('classroom.contactBody')} <a href="mailto:${config.email}">${config.email}</a>.</p>
  </div></div>
</section>`;

  return [
    {
      path: PAGE_PATH,
      html: layout(ctx, {
        lang,
        path: PAGE_PATH,
        title,
        description,
        section: 'classroom',
        playKey: PAGE_KEY,
        jsonLd,
        body,
      }),
      lastmod: config.contentDate,
      section: 'classroom',
    },
  ];
}
