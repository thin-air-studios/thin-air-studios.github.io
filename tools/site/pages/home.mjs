// The home page (English, at /). The blocks it is made of (hero, stats, pictures, trailer, airport pick, final band) are
// exported for the localized homes (locales.mjs), which add the store text of their language between the hero and the pictures.
import { html, raw } from '../lib/html.mjs';
import { layout, absoluteUrl } from '../lib/layout.mjs';
import { playLink, PLAY_LISTING } from '../lib/play.mjs';
import { shot, phone, trailer, langSwitch, pickBlock, roundDown } from '../lib/brand.mjs';

export const order = 10;

/** The hreflang set for the home pages: every live language, with x-default at /. */
export function homeAlternates(config) {
  const list = config.languages.filter((l) => l.live !== false).map((l) => ({ hreflang: l.hreflang, href: `${config.domain}${l.path}` }));
  list.push({ hreflang: 'x-default', href: `${config.domain}/` });
  return list;
}

/** The home pages' numbers, from the data (rounded down, so they stay true as the maps grow). */
export function homeNumbers(ctx) {
  return { airports: roundDown(ctx.data.rowCount, 1000), maps: roundDown(ctx.data.mapped.length, 100).replace('+', '') };
}

const ICON = {
  plane: '<path d="M3 11.5 21 4l-6.5 17-3-6.5L3 11.5Z"/><path d="m11.5 14.5 4.5-4.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  cloud: '<path d="M7 18h10.5a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 7.2 9.3 4.3 4.3 0 0 0 7 18Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1.5A2.5 2.5 0 0 0 7.5 10M16 6h3v1.5A2.5 2.5 0 0 1 16.5 10M12 13v4M8.5 20h7"/>',
  wind: '<path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17.5h6"/>',
};

export function icon(name) {
  return raw(`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name]}</svg>`);
}

/** The script for the home pages and the press page: the animated hero, the airport search and the trailer facade. */
export const brandScript = raw('<script src="/assets/site/brand/home.js" defer></script>');

export function heroBlock(ctx, lang, { eyebrow, h1, lead, freeNote, playKey, phoneAlt }) {
  const { config, t } = ctx;
  const L = (key) => t(lang, key);
  const play = playLink(playKey, 'hero');
  return html`<section class="section--hero hero" aria-labelledby="hero-title">
  <canvas class="hero-canvas" data-hero aria-hidden="true" width="1280" height="720"></canvas>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${eyebrow}</p>
      <h1 id="hero-title">${h1}</h1>
      <p class="lead">${lead}</p>
      <div class="btn-row">
        <a class="btn" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="hero">${L('cta.getOnPlay')}</a>
        <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
      </div>
      <p class="free-note">${freeNote}</p>
      ${langSwitch(ctx, lang, L('home.langsLabel'))}
    </div>
    ${phone('arrived', phoneAlt)}
  </div>
</section>`;
}

export function statsBlock(ctx, lang) {
  const L = (key) => ctx.t(lang, key);
  const { airports, maps } = homeNumbers(ctx);
  return html`<section class="section--tight">
  <div class="wrap">
    <ul class="stat-strip">
      <li><b>${airports}</b><span>${L('home.statAirports')}</span></li>
      <li><b>${maps}</b><span>${L('home.statMaps')}</span></li>
      <li><b>50</b><span>${L('home.statOffline')}</span></li>
      <li><b>7</b><span>${L('home.statMusic')}</span></li>
    </ul>
  </div>
</section>`;
}

export function picturesBlock(ctx, lang) {
  const L = (key) => ctx.t(lang, key);
  // The English page has a full description of each picture for its alt text; the other languages use their caption.
  const alt = (n) => (lang === 'en' ? L(`home.shot${n}`) : L(`home.shot${n}Caption`));
  return html`<section class="section section--band" aria-labelledby="pictures-title">
  <div class="wrap">
    <h2 id="pictures-title">${L('home.picturesTitle')}</h2>
    <div class="shots">
      ${shot('arrived', alt(1), L('home.shot1Caption'))}
      ${shot('closed-night', alt(2), L('home.shot2Caption'))}
      ${shot('holding', alt(3), L('home.shot3Caption'))}
      ${shot('video', alt(4), L('home.shot4Caption'))}
    </div>
  </div>
</section>`;
}

export function trailerBlock(ctx, lang) {
  const L = (key) => ctx.t(lang, key);
  return html`<section class="section" aria-labelledby="trailer-title">
  <div class="wrap split">
    <div>
      <h2 id="trailer-title">${L('home.trailerTitle')}</h2>
      <p>${L('home.trailerBody')}</p>
    </div>
    ${trailer(L('home.trailerPlay'), L('home.trailerTitle'))}
  </div>
</section>`;
}

export function pickSection(ctx, lang) {
  const L = (key) => ctx.t(lang, key);
  return html`<section class="section section--band" id="pick" aria-labelledby="pick-title">
  <div class="wrap">
    <h2 id="pick-title">${L('home.pickTitle')}</h2>
    <p class="prose">${L('home.pickBody')}</p>
    ${pickBlock(ctx, lang)}
  </div>
</section>`;
}

export function finalBlock(ctx, lang, playKey) {
  const L = (key) => ctx.t(lang, key);
  const play = playLink(playKey, 'footer-cta');
  return html`<section class="section section--hero final" aria-labelledby="final-title">
  <div class="wrap center">
    <h2 id="final-title">${L('home.finalTitle')}</h2>
    <p class="lead">${L('home.finalBody')}</p>
    <div class="btn-row center-row">
      <a class="btn" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="footer-cta">${L('cta.getOnPlay')}</a>
      <a class="btn btn--ghost" href="${ctx.config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
    </div>
  </div>
</section>`;
}

/** The structured data every home page carries: the organization, the website and the app (free, Android). */
export function homeJsonLd(ctx, { name, description, inLanguage, url }) {
  const { config } = ctx;
  const publisher = { '@type': 'Organization', name: config.publisher };
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', name: config.publisher, legalName: config.legalName, url: `${config.domain}/`, logo: absoluteUrl(config, '/assets/site/img/app-icon-512.png'), email: config.email },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: config.siteName, url: `${config.domain}/`, inLanguage, publisher },
    { '@context': 'https://schema.org', '@type': 'MobileApplication', name: config.siteName, operatingSystem: 'Android', applicationCategory: 'GameApplication', description, url, inLanguage, installUrl: PLAY_LISTING, downloadUrl: PLAY_LISTING, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: publisher },
  ];
}

export function shell(ctx, { lang, path, title, description, section, playKey, body, jsonLd, imageAlt }) {
  return layout(ctx, {
    lang,
    path,
    title,
    description,
    section,
    playKey,
    image: '/assets/site/brand/og-home.jpg',
    imageAlt,
    jsonLd,
    alternates: homeAlternates(ctx.config),
    bodyClass: 'page-home',
    body,
  });
}

function featureCards(L) {
  const cards = [
    ['plane', 'feat1'], ['pin', 'feat2'], ['cloud', 'feat3'], ['calendar', 'feat4'], ['trophy', 'feat6'], ['wind', 'feat5'],
  ];
  return cards.map(([name, key]) => html`<article class="card">
          <div class="icon">${icon(name)}</div>
          <h3>${L(`home.${key}Title`)}</h3>
          <p>${L(`home.${key}Body`)}</p>
        </article>`);
}

function howBlock(L) {
  return html`<section class="section" aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title">${L('home.howTitle')}</h2>
    <ol class="steps">
      <li><h3>${L('home.how1Title')}</h3><p>${L('home.how1Body')}</p></li>
      <li><h3>${L('home.how2Title')}</h3><p>${L('home.how2Body')}</p></li>
      <li><h3>${L('home.how3Title')}</h3><p>${L('home.how3Body')}</p></li>
    </ol>
  </div>
</section>`;
}

function aviationBlock(L, maps) {
  return html`<section class="section section--band" aria-labelledby="av-title">
  <div class="wrap split">
    <div>
      <h2 id="av-title">${L('home.avTitle')}</h2>
      <p>${L('home.avLead')}</p>
    </div>
    <ul class="check">
      <li>${L('home.av1')}</li>
      <li>${L('home.av2', { maps })}</li>
      <li>${L('home.av3')}</li>
      <li>${L('home.av4')}</li>
      <li>${L('home.av5')}</li>
    </ul>
  </div>
</section>`;
}

function faqBlock(L, maps) {
  const items = [1, 2, 3, 4, 5, 6].map((n) => ({ q: L(`home.faq${n}Q`), a: L(`home.faq${n}A`, { maps }) }));
  return html`<section class="section" aria-labelledby="faq-title">
  <div class="wrap prose">
    <h2 id="faq-title">${L('home.faqTitle')}</h2>
    <div class="faq">${items.map((item) => html`<details>
        <summary>${item.q}</summary>
        <p>${item.a}</p>
      </details>`)}</div>
  </div>
</section>`;
}

function creatorsBlock(L) {
  return html`<section class="section" aria-labelledby="creators-title">
  <div class="wrap">
    <div class="band">
      <div>
        <h2 id="creators-title">${L('home.creatorsTitle')}</h2>
        <p>${L('home.creatorsBody')}</p>
      </div>
      <a class="btn btn--ghost" href="/press/">${L('home.creatorsLink')}</a>
    </div>
  </div>
</section>`;
}

/** The FAQ's questions and answers as schema.org FAQPage data: the same words the reader sees. */
function faqJsonLd(ctx, lang, maps) {
  const L = (key, vars) => ctx.t(lang, key, vars);
  const entities = [1, 2, 3, 4, 5, 6].map((n) => ({ '@type': 'Question', name: L(`home.faq${n}Q`), acceptedAnswer: { '@type': 'Answer', text: L(`home.faq${n}A`, { maps }) } }));
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities };
}

export async function pages(ctx) {
  const { config, t } = ctx;
  const lang = 'en';
  const L = (key, vars) => t(lang, key, vars);
  const { maps } = homeNumbers(ctx);
  const playKey = 'home';
  const description = L('home.description');

  const body = html`
  ${heroBlock(ctx, lang, { eyebrow: L('home.eyebrow'), h1: L('home.h1'), lead: L('home.lead'), freeNote: L('home.freeNote'), playKey, phoneAlt: L('home.shot1') })}
  ${statsBlock(ctx, lang)}
  <section class="section--tight">
    <div class="wrap">
      <ul class="chips proof">
        ${[1, 2, 3, 4, 5, 6].map((n) => html`<li><span class="chip">${L(`home.proof${n}`)}</span></li>`)}
      </ul>
    </div>
  </section>
  <section class="section" aria-labelledby="features-title">
    <div class="wrap">
      <h2 id="features-title">${L('home.featuresTitle')}</h2>
      <div class="grid grid--features">
        ${featureCards(L)}
      </div>
    </div>
  </section>
  ${howBlock(L)}
  ${picturesBlock(ctx, lang)}
  ${trailerBlock(ctx, lang)}
  ${pickSection(ctx, lang)}
  ${aviationBlock(L, maps)}
  <section class="section" aria-labelledby="pricing-title">
    <div class="wrap prose">
      <h2 id="pricing-title">${L('home.pricingTitle')}</h2>
      <p>${L('home.pricingBody')}</p>
    </div>
  </section>
  ${faqBlock(L, maps)}
  ${creatorsBlock(L)}
  ${finalBlock(ctx, lang, playKey)}
  ${brandScript}`;

  const jsonLd = [...homeJsonLd(ctx, { name: config.siteName, description, inLanguage: 'en', url: `${config.domain}/` }), faqJsonLd(ctx, lang, maps)];
  const page = shell(ctx, { lang, path: '/', title: L('home.title'), description, section: 'home', playKey, body, jsonLd, imageAlt: L('home.ogAlt') });
  return [
    { path: '/', html: page, lastmod: config.contentDate, section: 'home', alternates: homeAlternates(config) },
  ];
}
