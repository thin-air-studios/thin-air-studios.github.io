// The 404 page: a radar with a plane on its sweep, the game's own words ("Go around!") and the ways back. It is not indexed.
// The sweep is the site's radar animation, which stops under prefers-reduced-motion (site.css).
import { html, raw } from '../lib/html.mjs';
import { sectionLive } from '../lib/layout.mjs';

export const order = 20;

const RADAR = raw(`<svg viewBox="0 0 400 400" focusable="false" role="presentation">
  <g fill="none" stroke="#8ff0cf" stroke-opacity=".38" stroke-width="1.5">
    <circle cx="200" cy="200" r="60"/><circle cx="200" cy="200" r="120"/><circle cx="200" cy="200" r="180"/>
    <path d="M200 10v380M10 200h380" stroke-opacity=".18"/>
  </g>
  <g class="radar-sweep"><path d="M200 200 L200 20 A180 180 0 0 1 327 73 Z" fill="#8ff0cf" fill-opacity=".18"/><line x1="200" y1="200" x2="200" y2="20" stroke="#8ff0cf" stroke-width="2" stroke-opacity=".75"/>
    <path d="M200 6 l-7 16 h14 z" fill="#ef8a2f" stroke="#fff6e3" stroke-width="1.5"/>
  </g>
  <path d="M96 286 C140 250 170 230 196 214" fill="none" stroke="#ef8a2f" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14"/>
  <circle cx="200" cy="200" r="7" fill="#fff6e3"/>
</svg>`);

export async function pages(ctx) {
  const { t, lib, config } = ctx;
  const L = (key) => t('en', key);
  const body = html`
  <section class="section section--hero notfound">
    <div class="wrap notfound-grid">
      <div>
        <p class="eyebrow">404 · ${L('error.lost')}</p>
        <h1>${L('error.title')}</h1>
        <p class="lead">${L('error.body')}</p>
        <div class="btn-row">
          <a class="btn" href="/">${L('error.home')}</a>
          <a class="btn btn--ghost" href="${config.demoPath}">${L('error.demo')}</a>
          ${sectionLive(config, 'airports') ? html`<a class="btn btn--ghost" href="/airports/">${L('error.airports')}</a>` : ''}
          ${sectionLive(config, 'guides') ? html`<a class="btn btn--ghost" href="/guides/">${L('error.guides')}</a>` : ''}
          ${sectionLive(config, 'events') ? html`<a class="btn btn--ghost" href="/events/">${L('nav.events')}</a>` : ''}
          ${sectionLive(config, 'press') ? html`<a class="btn btn--ghost" href="/press/">${L('nav.press')}</a>` : ''}
        </div>
        <p class="fine">${L('notfound.fineprint')}</p>
      </div>
      <figure class="radar-404" aria-hidden="true">${RADAR}</figure>
    </div>
  </section>`;
  const page = lib.layout(ctx, {
    lang: 'en',
    path: '/404.html',
    title: 'Page not found | Short Final',
    description: 'That page is not here. Go back to the Short Final home page, search the airports, or read the guides.',
    noindex: true,
    body,
    section: '',
    playKey: 'notfound',
  });
  return [{ path: '/404.html', html: page, noindex: true }];
}
