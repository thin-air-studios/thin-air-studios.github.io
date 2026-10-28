// The challenge board page (3.4): one template, c/index.html, that every /c/<id>/ address shows. The Worker serves this template for
// those addresses (tools/edge/worker.js), and the page reads its id from the address in the browser (site-src/challenge/board.mjs).
// Built only when features.challengeBoards is true; with the flag off nothing here is written.
// Rules of the page: noindex and not in the sitemap; robots.txt unchanged; one request, to the board (board-core.mjs); no event calls
// of its own (site-wide analytics only); English only. Its words are site-src/challenge/copy.json.
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, toHtml } from '../lib/html.mjs';
import { playLink } from '../lib/play.mjs';
import { layout } from '../lib/layout.mjs';

export const PAGE_PATH = '/c/';
export const PAGE_KEY = 'challenge';
export const PLAY_POSITION = 'challenge-cta';
const ASSET_DIR = '/assets/site/challenge/';
const FILES = ['board-core.mjs', 'board.mjs', 'board.css'];

export function challengeEnabled(config) {
  return config?.features?.challengeBoards === true;
}

function source(root, rel) {
  return fs.readFileSync(path.join(root, 'site-src', 'challenge', rel), 'utf8');
}

/** The words the script reads, as a JSON block the browser never runs ("<" escaped so no value can close the tag). */
function copyBlock(copy) {
  const { _about: _ignored, ...words } = copy;
  return raw(`<script type="application/json" id="board-copy">${JSON.stringify(words).replace(/</g, '\\u003c')}</script>`);
}

function body(copy, play) {
  return html`<div data-challenge data-play="${play}">
  <section class="section section--hero cb-hero" aria-labelledby="board-title">
    <div class="wrap">
      <p class="eyebrow">${copy.eyebrow}</p>
      <h1 id="board-title">${copy.titleDefault}</h1>
      <p class="lead" data-lead="plain">${copy.leadNoLink}</p>
      <p class="lead" data-lead="link" hidden>${copy.leadLink}</p>
      <div class="cb-chips"><span class="cb-chip" data-level hidden></span></div>
      <div class="btn-row cb-cta"><a class="btn" href="${play}" data-cta>${copy.getGame}</a></div>
      <p class="cb-note">${copy.playNote}</p>
    </div>
  </section>
  <section class="section cb-section" aria-labelledby="scores-title">
    <div class="wrap">
      <div class="cb-card">
        <div class="cb-head">
          <h2 id="scores-title">${copy.scoresTitle}</h2>
          <p class="cb-count" data-total></p>
        </div>
        <div aria-live="polite">
          <div data-state="loading" hidden>
            <p class="sr-only">${copy.loading}</p>
            <ol class="cb-skeleton" aria-hidden="true"><li></li><li></li><li></li><li></li><li></li></ol>
          </div>
          <div data-state="filled" hidden>
            <ol class="cb-list" data-list aria-labelledby="scores-title"></ol>
          </div>
          <div data-state="empty" class="cb-empty" hidden>
            <p>${copy.empty}</p>
            <div class="btn-row"><a class="btn btn--ghost" href="${play}">${copy.getGame}</a></div>
          </div>
          <div data-state="error" hidden>
            <p class="note cb-error">${copy.error}</p>
            <button class="btn btn--sm cb-retry" type="button" data-retry>${copy.retry}</button>
          </div>
          <div data-state="invalid" hidden>
            <p class="note">${copy.invalid}</p>
          </div>
        </div>
        <noscript><p class="note">${copy.noscript}</p></noscript>
        <p class="cb-sources">${copy.names}</p>
      </div>
      <nav class="cb-links" aria-label="Short Final">
        <a href="/">${copy.back}</a>
        <a href="${play}">${copy.getGame}</a>
      </nav>
    </div>
  </section>
  ${copyBlock(copy)}
  <script type="module" src="${ASSET_DIR}board.mjs"></script>
</div>`;
}

/** The page's document: the site's shell (noindex), with the board's stylesheet added to the head. */
function pageDocument(ctx, copy) {
  const play = playLink(PAGE_KEY, PLAY_POSITION);
  const page = layout(ctx, {
    lang: 'en',
    path: PAGE_PATH,
    title: copy.title,
    description: copy.description,
    playKey: PAGE_KEY,
    bodyClass: 'page-challenge',
    noindex: true,
    // No og:url: the address this template is shown at is /c/, not the board's, and a link preview would point at the template.
    ogUrl: false,
    body: body(copy, play),
  });
  return raw(page.value.replace('</head>', `<link rel="stylesheet" href="${ASSET_DIR}board.css">\n</head>`));
}

export async function pages(ctx) {
  const { root, config } = ctx;
  if (!challengeEnabled(config)) return [];
  const copy = JSON.parse(source(root, 'copy.json'));
  const out = [{ path: PAGE_PATH, html: pageDocument(ctx, copy), section: 'challenge', noindex: true }];
  for (const file of FILES) out.push({ path: `${ASSET_DIR}${file}`, content: source(root, file) });
  return out;
}

/** The page's markup as a string, for tests that read it. */
export function challengeHtml(ctx) {
  const copy = JSON.parse(source(ctx.root, 'copy.json'));
  return toHtml(pageDocument(ctx, copy));
}
