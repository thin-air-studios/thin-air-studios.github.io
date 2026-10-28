// The press kit (/press/, English): the fact sheet, the short and long descriptions (the store text), the features, the logos and
// icon with downloads, eight screenshots with alt text, the trailer, the press kit ZIP, the creators section and the credits.
import fs from 'node:fs';
import path from 'node:path';
import { html } from '../lib/html.mjs';
import { layout } from '../lib/layout.mjs';
import { playLink } from '../lib/play.mjs';
import { markdown, storeBody, storeHeadline, shot, trailer } from '../lib/brand.mjs';
import { homeNumbers, brandScript } from './home.mjs';

export const order = 30;

const SHOTS = [
  ['arrived', 'press.shotArrived'],
  ['atl-storm', 'press.shotAtl'],
  ['closed-night', 'press.shotClosed'],
  ['dfw', 'press.shotDfw'],
  ['holding', 'press.shotHolding'],
  ['home', 'press.shotHome'],
  ['music', 'press.shotMusic'],
  ['video', 'press.shotVideo'],
];

const FACTS = [
  ['press.factGame', 'press.factValueGame'],
  ['press.factDeveloper', 'press.factValueDeveloper'],
  ['press.factGenre', 'press.factValueGenre'],
  ['press.factPlatform', 'press.factValuePlatform'],
  ['press.factPrice', 'press.factValuePrice'],
  ['press.factLaunch', 'press.factValueLaunch'],
  ['press.factPlayers', 'press.factValuePlayers'],
  ['press.factAirports', 'press.factValueAirports'],
  ['press.factLanguage', 'press.factValueLanguage'],
];

export async function pages(ctx) {
  const { config, t, root } = ctx;
  const lang = 'en';
  const L = (key, vars) => t(lang, key, vars);
  const { maps } = homeNumbers(ctx);
  const playKey = 'press';
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const kitBytes = fs.statSync(path.join(root, 'site-src', 'assets', 'brand', 'short-final-press-kit.zip')).size;
  const kitMB = (kitBytes / 1048576).toFixed(1);
  const enShort = read('site-src/home/en/short-description.txt').trim();
  const enFull = read('site-src/home/en/full-description.txt');
  const storeTitle = read('site-src/home/en/title.txt').trim();
  const logoSvg = read('site-src/assets/img/logo.svg');
  const view = (logoSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
  const [logoW, logoH] = view.length === 2 ? view : [400, 120];
  const description = L('press.description');
  const canonicalPath = '/press/';
  const play = playLink(playKey, 'press-cta');
  const kitHref = '/assets/site/brand/short-final-press-kit.zip';
  const mail = `mailto:${config.email}`;

  const factRows = FACTS.map(([label, value]) => html`<div><dt>${L(label)}</dt><dd>${L(value, { maps })}</dd></div>`);

  const body = html`
  <section class="page-head section--tight">
    <div class="wrap">
      <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li aria-current="page">${L('press.h1')}</li></ol></nav>
      <h1>${L('press.h1')}</h1>
      <p class="lead">${L('press.lead')}</p>
      <div class="btn-row">
        <a class="btn" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="press-cta">${L('cta.getOnPlay')}</a>
        <a class="btn btn--ghost" href="${kitHref}" download data-event="press_download" data-ev-file="press-kit-zip">${L('press.kitButton')}</a>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="facts-title">
    <div class="wrap">
      <h2 id="facts-title">${L('press.factsTitle')}</h2>
      <dl class="facts press-facts">
        ${factRows}
        <div><dt>${L('press.factStoreTitle')}</dt><dd>${storeTitle}</dd></div>
        ${config.game.playVersion ? html`<div><dt>${L('press.factVersion')}</dt><dd>${config.game.playVersion}</dd></div>` : ''}
        <div><dt>${L('press.factWebsite')}</dt><dd><a href="${config.domain}/">playshortfinal.com</a></dd></div>
        <div><dt>${L('press.factContact')}</dt><dd><a href="${mail}">${config.email}</a></dd></div>
      </dl>
    </div>
  </section>

  <section class="section section--band" aria-labelledby="desc-title">
    <div class="wrap prose">
      <h2 id="desc-title">${L('press.descTitle')}</h2>
      <h3>${L('press.descShort')}</h3>
      <p class="press-short">${enShort}</p>
      <details class="long-desc">
        <summary>${L('press.descLong')}</summary>
        <p><b>${storeHeadline(enFull)}</b></p>
        ${storeBody(enFull)}
      </details>
    </div>
  </section>

  <section class="section" aria-labelledby="features-title">
    <div class="wrap prose">
      <h2 id="features-title">${L('press.featuresTitle')}</h2>
      ${markdown(read('site-src/press/features.md'))}
    </div>
  </section>

  <section class="section section--band" aria-labelledby="logos-title">
    <div class="wrap">
      <h2 id="logos-title">${L('press.logosTitle')}</h2>
      <p class="prose">${L('press.logosLead')}</p>
      <div class="logo-grid">
        <figure class="logo-card">
          <img src="/assets/site/brand/press/icon-512.webp" width="512" height="512" alt="${L('press.altIcon')}" loading="lazy" decoding="async">
          <figcaption><a href="/assets/site/brand/press/icon-512.png" download data-event="press_download" data-ev-file="icon-512">${L('press.downloadIcon')}</a></figcaption>
        </figure>
        <figure class="logo-card wide">
          <img src="/assets/site/brand/press/feature-1024x500.webp" width="1024" height="500" alt="${L('press.altFeature')}" loading="lazy" decoding="async">
          <figcaption><a href="/assets/site/brand/press/feature-1024x500.png" download data-event="press_download" data-ev-file="feature-graphic">${L('press.downloadFeature')}</a></figcaption>
        </figure>
        <figure class="logo-card on-night">
          <img src="/assets/site/img/logo.svg" width="${logoW}" height="${logoH}" alt="${L('press.altLogo')}" loading="lazy" decoding="async">
          <figcaption><a href="/assets/site/img/logo.svg" download data-event="press_download" data-ev-file="logo-svg">${L('press.downloadLogo')}</a></figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="shots-title">
    <div class="wrap">
      <h2 id="shots-title">${L('press.shotsTitle')}</h2>
      <p class="prose">${L('press.shotsLead')}</p>
      <div class="shots press-shots">
        ${SHOTS.map(([name, key]) => shot(name, L(key)))}
      </div>
    </div>
  </section>

  <section class="section section--band" aria-labelledby="trailer-title">
    <div class="wrap split">
      <div>
        <h2 id="trailer-title">${L('press.trailerTitle')}</h2>
        <p>${L('press.trailerBody')}</p>
      </div>
      ${trailer(L('home.trailerPlay'), L('press.trailerTitle'))}
    </div>
  </section>

  <section class="section" aria-labelledby="kit-title">
    <div class="wrap band">
      <div>
        <h2 id="kit-title">${L('press.kitTitle')}</h2>
        <p>${L('press.kitBody', { size: kitMB })}</p>
      </div>
      <a class="btn" href="${kitHref}" download data-event="press_download" data-ev-file="press-kit-zip">${L('press.kitButton')}</a>
    </div>
  </section>

  <section class="section section--band" aria-labelledby="creators-title">
    <div class="wrap prose">
      <h2 id="creators-title">${L('press.creatorsTitle')}</h2>
      ${markdown(read('site-src/press/creators.md'))}
      <p><a class="btn btn--ghost" href="${mail}">${L('press.contactButton')}</a></p>
    </div>
  </section>

  <section class="section" aria-labelledby="credits-title">
    <div class="wrap prose">
      <h2 id="credits-title">${L('press.creditsTitle')}</h2>
      ${markdown(read('site-src/press/credits.md'))}
    </div>
  </section>
  ${brandScript}`;

  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${config.domain}${canonicalPath}`, url: `${config.domain}${canonicalPath}`, name: L('press.title'), description, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: config.siteName, url: `${config.domain}/` } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: L('crumb.home'), item: `${config.domain}/` },
      { '@type': 'ListItem', position: 2, name: L('press.h1'), item: `${config.domain}${canonicalPath}` },
    ] },
  ];

  const page = layout(ctx, {
    lang,
    path: canonicalPath,
    title: `${L('press.title')} | Short Final`,
    description,
    section: 'press',
    playKey,
    image: '/assets/site/brand/og-press.jpg',
    imageAlt: L('press.ogAlt'),
    jsonLd,
    body,
  });
  return [{ path: canonicalPath, html: page, lastmod: config.contentDate, section: 'press' }];
}

