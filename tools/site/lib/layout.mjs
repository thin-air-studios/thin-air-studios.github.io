// The page shell every page uses: head (title, description, canonical, hreflang, Open Graph, Twitter, JSON-LD, analytics),
// the header and footer, the consent banner (only when Google Analytics is configured), and the main landmark.
import { html, raw, toHtml, jsonLdScript } from './html.mjs';
import { playLink } from './play.mjs';

const ABSOLUTE = /^https?:\/\//;

/** A section's links show only when its pages are built (config.sections). Home is always live. */
export function sectionLive(config, key) {
  return key === 'home' || config.sections?.[key] === true;
}

function languageFor(config, code) {
  return config.languages.find((l) => l.code === code) || config.languages[0];
}

/** The absolute URL of a site path (or a URL that is already absolute). */
export function absoluteUrl(config, pathOrUrl) {
  return ABSOLUTE.test(pathOrUrl) ? pathOrUrl : `${config.domain}${pathOrUrl}`;
}

function gaHead(id) {
  // Consent Mode v2: every storage type is denied until the visitor accepts. This inline bootstrap only queues commands. The
  // Google script itself is added by site.js after Accept (or on a later visit where Accept was stored), so a visitor who has not
  // accepted makes no request to Google.
  return raw(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());gtag('config','${id}');</script>`);
}

function header(ctx, lang, section, playKey) {
  const { config, t } = ctx;
  const L = (key, vars) => t(lang, key, vars);
  const links = [
    ['airports', '/airports/', 'nav.airports'],
    ['guides', '/guides/', 'nav.guides'],
    ['events', '/events/', 'nav.events'],
    ['press', '/press/', 'nav.press'],
    ['about', '/about/', 'nav.about'],
  ];
  const play = playLink(playKey, 'header');
  return html`<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="${languageFor(config, lang).path}"><img src="/assets/site/img/icon.svg" width="40" height="40" alt=""><span class="brand-word">Short Final</span></a>
    <details class="menu">
      <summary>${L('nav.menu')}</summary>
      <nav class="nav-links" aria-label="${L('nav.main')}">
        <a class="nav-cta" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="menu">${L('cta.getGame')}</a>
        ${links.filter(([key]) => sectionLive(config, key)).map(([key, href, label]) => html`<a href="${href}"${section === key ? raw(' aria-current="page"') : ''}>${L(label)}</a>`)}
      </nav>
    </details>
    <a class="btn btn--sm header-cta" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="header">${L('cta.getGame')}</a>
  </div>
</header>`;
}

function footer(ctx, lang, playKey) {
  const { config, t } = ctx;
  const L = (key, vars) => t(lang, key, vars);
  const play = playLink(playKey, 'footer');
  const year = new Date(`${config.contentDate}T00:00:00Z`).getUTCFullYear();
  return html`<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h2>${L('footer.play')}</h2>
        <ul>
          <li><a href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="footer">${L('cta.getGame')}</a></li>
          <li><a href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a></li>
          <li><a href="${config.trailerUrl}">${L('footer.trailer')}</a></li>
        </ul>
      </div>
      <div>
        <h2>${L('footer.explore')}</h2>
        <ul>
          ${[['airports', '/airports/', 'nav.airports'], ['guides', '/guides/', 'nav.guides'], ['events', '/events/', 'nav.events'], ['press', '/press/', 'nav.press']].filter(([key]) => sectionLive(config, key)).map(([, href, label]) => html`<li><a href="${href}">${L(label)}</a></li>`)}
        </ul>
      </div>
      <div>
        <h2>${L('footer.about')}</h2>
        <ul>
          ${sectionLive(config, 'about') ? html`<li><a href="/about/">${L('nav.about')}</a></li>` : ''}
          <li><a href="mailto:${config.email}">${L('footer.contact')}</a></li>
          <li><a href="/privacy/">${L('footer.privacy')}</a></li>
          <li><a href="/terms/">${L('footer.terms')}</a></li>
        </ul>
      </div>
      <div>
        <h2>${L('footer.languages')}</h2>
        <nav class="lang-list" aria-label="${L('footer.languages')}">
          ${config.languages.filter((l) => l.live !== false).map((l) => html`<a href="${l.path}" lang="${l.htmlLang}" data-event="language_change" data-ev-from="${lang}" data-ev-to="${l.code}"${l.code === lang ? raw(' aria-current="true"') : ''}>${l.name}</a>`)}
        </nav>
      </div>
    </div>
    <div class="footer-legal">
      <p>${L('footer.rights', { year, legalName: config.legalName, tradeName: config.tradeName })}</p>
      <p>${L('footer.notGame')}</p>
      <p>${L('footer.madeIn')}</p>
    </div>
  </div>
</footer>`;
}

function consent(ctx, lang) {
  const L = (key) => ctx.t(lang, key);
  return html`<section class="consent" id="consent" aria-labelledby="consent-title" hidden>
  <p id="consent-title"><strong>${L('consent.title')}</strong></p>
  <p>${L('consent.body')}</p>
  <div class="btn-row">
    <button class="btn btn--sm" type="button" data-consent="granted">${L('consent.accept')}</button>
    <button class="btn btn--sm btn--ghost" type="button" data-consent="denied">${L('consent.decline')}</button>
  </div>
</section>`;
}

/**
 * The whole document. Options:
 * lang (default en), path (the page's site path, ending in / or .html), title, description, section (for the nav's current
 * item), playKey (the page key for Play links, lowercase), image (site path or URL; default the shared image), imageAlt,
 * ogType ('website' or 'article'), jsonLd (array of objects), alternates ([{hreflang, href}], include x-default when the page
 * has translations), noindex (true for a deliberately thin page), bodyClass, body (html`` or raw() markup for <main>).
 */
export function layout(ctx, o) {
  const { config, t } = ctx;
  const lang = o.lang || 'en';
  const def = languageFor(config, lang);
  const ga = Boolean(config.analytics.ga4);
  const cf = Boolean(config.analytics.cfBeacon);
  const canonical = `${config.domain}${o.path}`;
  const image = absoluteUrl(config, o.image || config.defaultImage);
  const ogLocale = def.htmlLang.replace('-', '_');
  const playKey = o.playKey || 'site';
  const alternates = (o.alternates || []).map((a) => html`<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`);
  const ld = (o.jsonLd || []).map((obj) => jsonLdScript(obj));
  const verification = config.googleSiteVerification
    ? html`<meta name="google-site-verification" content="${config.googleSiteVerification}">`
    : '';
  const doc = html`<!doctype html>
<html lang="${def.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
${o.noindex ? raw('<meta name="robots" content="noindex, follow">') : raw(`<link rel="canonical" href="${toHtml(canonical)}">`)}
${alternates}
<meta name="theme-color" content="#16323a">
<meta property="og:site_name" content="${config.siteName}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:locale" content="${ogLocale}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="${o.imageAlt || 'Short Final: real flights at any airport'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${o.title}">
<meta name="twitter:description" content="${o.description}">
<meta name="twitter:image" content="${image}">
${verification}
<link rel="icon" href="/assets/site/img/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/app-icon.png">
<link rel="preload" href="/assets/site/fonts/fredoka-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site/site.css">
${ga ? gaHead(config.analytics.ga4) : ''}
${cf ? raw(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${config.analytics.cfBeacon}"}'></script>`) : ''}
${ld}
</head>
<body${o.bodyClass ? raw(` class="${toHtml(o.bodyClass)}"`) : ''}${ga ? raw(` data-ga="${toHtml(config.analytics.ga4)}"`) : ''}>
<a class="skip-link" href="#main">${t(lang, 'skip')}</a>
${header(ctx, lang, o.section, playKey)}
<main id="main">
${o.body}
</main>
${footer(ctx, lang, playKey)}
${ga ? consent(ctx, lang) : ''}
<script src="/assets/site/site.js" defer></script>
</body>
</html>
`;
  return doc;
}
