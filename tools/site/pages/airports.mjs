// The airport family: one page per mapped airport (/airports/<icao>/), a page per country with maps (/airports/<country>/), the
// airports hub (/airports/) with the busiest airports and a client-side search, the search index (/assets/site/airports-index.json)
// and the two files the pages load (airports.css and airports-search.js, from site-src/airports/).
// Copy lives in site-src/airports/copy.json; facts come from tools/site/lib/airportdata.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, jsonLdScript } from '../lib/html.mjs';
import { playLink } from '../lib/play.mjs';
import { buildAirportData, sizeThenName } from '../lib/airportdata.mjs';
import { makeCopy, group, oneDecimal, paragraphFor, descriptionFor, titleFor } from '../lib/airportcopy.mjs';
import { airportPath } from '../lib/slug.mjs';
import { boardPanel } from '../lib/boardpanel.mjs';
import { englishAlternates } from '../lib/localairports.mjs';

export const order = 60;

const LIST_CLASS = 'rows';

function readText(root, rel) {
  return fs.readFileSync(path.join(root, 'site-src', 'airports', rel), 'utf8');
}

/** Adds the page's own stylesheet, and its script when it has one, to the layout's document. */
function withAssets(page, { script = false } = {}) {
  let doc = page.value.replace('</head>', '<link rel="stylesheet" href="/assets/site/airports.css">\n</head>');
  if (script) doc = doc.replace('</body>', '<script src="/assets/site/airports-search.js" defer></script>\n</body>');
  return raw(doc);
}

function distanceText(t, km, miles) {
  return t('airport.distance', { km: group(km), miles: group(miles) });
}

function crumbList(ctx, crumbs) {
  const { config } = ctx;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${config.domain}${href}` })),
  };
}

function crumbNav(crumbs) {
  return html`<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map(([label, href], i) => (i === crumbs.length - 1 ? html`<li aria-current="page">${label}</li>` : html`<li><a href="${href}">${label}</a></li>`))}</ol></nav>`;
}

/** One airport page. */
function airportPage(ctx, A, m, t, rules) {
  const { config, lib } = ctx;
  const { layout } = lib;
  const lower = m.icao.toLowerCase();
  const key = `airport-${lower}`;
  const country = A.countriesByCode.get(m.countryCode);
  const crumbs = [[t('crumb.home'), '/'], [t('crumb.airports'), '/airports/'], [m.country, country.path], [m.name, m.path]];
  const short = m.iata || m.icao;
  const canonical = `${config.domain}${m.path}`;
  const playTop = playLink(key, 'hero');
  const playEnd = playLink(key, 'footer-cta');
  const demoHref = `${config.demoPath}?a=${m.icao}`;

  const facts = [
    [t('airport.factsLocation'), m.place],
    [t('airport.factsIcao'), m.icao],
    [t('airport.factsIata'), m.iata || t('airport.factsIataNone')],
  ];
  if (m.elevationFt !== null) facts.push([t('airport.factsElevation'), t('airport.factsElevationValue', { elev: group(m.elevationFt) })]);
  if (m.runwayCount) facts.push([t('airport.factsLongest'), t('airport.factsLongestValue', { len: group(m.longestRunwayFt), ends: m.longestEnds })]);
  facts.push([t('airport.factsRunways'), String(m.runwayCount)]);
  facts.push([t('airport.factsSize'), m.sizeLabel]);
  if (m.busiest) facts.push([t('airport.factsRank'), t('airport.factsRankValue', { pax: oneDecimal(m.busiest.passengersM), rank: m.busiest.rank })]);
  facts.push([t('airport.factsPosition'), `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`]);

  const mapFigure = m.map.svg
    ? html`<figure class="airport-map-wrap">${raw(m.map.svg)}<figcaption>${t('airport.mapCaption', { date: m.map.atText })}</figcaption></figure>`
    : html`<p class="note">${t('airport.mapNone')}</p>`;

  const runwayRows = m.runways.map((r) => html`<tr><th scope="row">${r.le} / ${r.he}</th><td data-label="${t('airport.th.length')}">${group(r.lengthFt)}\u00a0ft</td><td data-label="${t('airport.th.width')}">${r.widthFt ? `${group(r.widthFt)}\u00a0ft` : t('surface.unknown')}</td><td data-label="${t('airport.th.surface')}">${t(`surface.${r.surface}`)}</td><td data-label="${t('airport.th.lights')}">${r.lit ? t('lights.lit') : t('lights.unlit')}</td></tr>`);
  const runwaysBlock = m.runways.length
    ? html`<div class="table-wrap"><table><caption>${t('airport.runwaysCaption')}</caption><thead><tr><th scope="col">${t('airport.th.runway')}</th><th scope="col">${t('airport.th.length')}</th><th scope="col">${t('airport.th.width')}</th><th scope="col">${t('airport.th.surface')}</th><th scope="col">${t('airport.th.lights')}</th></tr></thead><tbody>${runwayRows}</tbody></table></div>
      <p class="sources">${t('airport.runwaysNote')}</p>`
    : html`<p class="note">${t('airport.runwaysNone')}</p>`;

  const routes = m.routes;
  // Carriers with a name are listed; the rest are named by code in one line, so no row reads as a bare code.
  const namedAirlines = routes.airlines.filter((a) => a.name);
  const codeOnly = routes.airlines.filter((a) => !a.name).map((a) => a.code);
  const codesText = codeOnly.length > 8 ? `${codeOnly.slice(0, 8).join(', ')} and ${codeOnly.length - 8} more` : codeOnly.join(', ');
  const airlineItems = namedAirlines.map((a) => html`<li><span>${a.name}${html` <small>${a.code}</small>`}</span><span>${a.routes === 1 ? t('airport.routesCountOne') : t('airport.routesCount', { n: group(a.routes) })}</span></li>`);
  const linkItems = routes.links.map((l) => {
    const label = `${l.name} (${l.iata || l.icao})`;
    const where = [l.city, l.country].filter(Boolean).join(', ');
    const main = l.mapped ? html`<a href="${airportPath(l.icao)}">${label}</a>` : html`<span>${label}</span>`;
    return html`<li><span>${main}${where ? html` <small>${where}</small>` : ''}</span><span>${l.routes === 1 ? t('airport.routesCountOne') : t('airport.routesCount', { n: group(l.routes) })}</span></li>`;
  });
  const routesBlock = routes.total
    ? html`<div class="split">
        <div><h3>${t('airport.airlinesTitle')}</h3><ul class="${LIST_CLASS}">${airlineItems}</ul>${codeOnly.length ? html`<p class="sources">${t('airport.airlinesOther', { codes: codesText })}</p>` : ''}</div>
        <div><h3>${t('airport.linksTitle')}</h3><ul class="${LIST_CLASS}">${linkItems}</ul></div>
      </div>`
    : html`<p class="note">${t('airport.routesNone', { date: routes.snapshotText })}</p>`;

  const nearby = m.nearby.map((n) => html`<li><a class="chip" href="${airportPath(n.icao)}">${n.name} (${n.iata || n.icao})</a> <small>${distanceText(t, n.km, n.miles)}</small></li>`);

  const body = html`
  <article class="airport-page">
    <div class="wrap">
      ${crumbNav(crumbs)}
      <header class="airport-head">
        <p class="eyebrow">${t('airport.eyebrow')}</p>
        <h1>${m.name} (${short})</h1>
        <p class="lead">${m.place} · ICAO ${m.icao}${m.iata ? ` · IATA ${m.iata}` : ''}</p>
        <div class="btn-row">
          <a class="btn" href="${demoHref}" data-event="demo_start" data-ev-airport="${m.icao}">${t('airport.playDemo', { code: short })}</a>
          <a class="btn btn--ghost" href="${playTop}" data-event="play_store_click" data-ev-page="${key}" data-ev-position="hero" data-ev-airport="${m.icao}">${t('airport.playStore')}</a>
        </div>
        <p class="free-note">${t('airport.demoNote')}</p>
      </header>
      <div class="airport-grid">
        ${mapFigure}
        <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      </div>
    </div>
  </article>
  <section class="section" aria-labelledby="about-title">
    <div class="wrap prose">
      <h2 id="about-title">${t('airport.aboutTitle', { code: m.icao })}</h2>
      <p>${paragraphFor(m, t)}</p>
    </div>
  </section>
  <section class="section section--band" aria-labelledby="runways-title">
    <div class="wrap">
      <h2 id="runways-title">${t('airport.runwaysTitle')}</h2>
      ${runwaysBlock}
    </div>
  </section>
  <section class="section" aria-labelledby="routes-title">
    <div class="wrap">
      <h2 id="routes-title">${t('airport.routesTitle')}</h2>
      ${routes.total ? html`<p class="note">${t('airport.routesNote', { date: routes.snapshotText })}</p>` : ''}
      ${routesBlock}
    </div>
  </section>
  <section class="section section--band" aria-labelledby="nearby-title">
    <div class="wrap">
      <h2 id="nearby-title">${t('airport.nearbyTitle')}</h2>
      <p>${t('airport.nearbyNote')}</p>
      <ul class="chips">${nearby}</ul>
    </div>
  </section>
  ${boardPanel(ctx, m)}
  <section class="section section--hero" aria-labelledby="final-title">
    <div class="wrap center">
      <h2 id="final-title">${t('airport.finalTitle', { code: short })}</h2>
      <p class="lead">${t('airport.finalBody')}</p>
      <div class="btn-row is-center">
        <a class="btn" href="${playEnd}" data-event="play_store_click" data-ev-page="${key}" data-ev-position="footer-cta" data-ev-airport="${m.icao}">${t('airport.playStore')}</a>
        <a class="btn btn--ghost" href="${demoHref}" data-event="demo_start" data-ev-airport="${m.icao}">${t('airport.playDemo', { code: short })}</a>
      </div>
    </div>
  </section>
  <div class="wrap"><p class="sources">${t('airport.sources', { date: routes.snapshotText })}</p></div>`;

  const airportLd = {
    '@context': 'https://schema.org',
    '@type': 'Airport',
    name: m.name,
    icaoCode: m.icao,
    ...(m.iata ? { iataCode: m.iata } : {}),
    url: canonical,
    description: descriptionFor(m, t),
    geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lon },
    address: { '@type': 'PostalAddress', ...(m.city ? { addressLocality: m.city } : {}), addressCountry: m.countryCode },
  };
  const alternates = englishAlternates(ctx, m);
  const page = layout(ctx, {
    lang: 'en',
    path: m.path,
    title: titleFor(m, t),
    alternates,
    description: descriptionFor(m, t),
    section: 'airports',
    playKey: key,
    bodyClass: 'page-airport',
    jsonLd: [airportLd, crumbList(ctx, crumbs)],
    noindex: !m.index,
    body,
  });
  return { path: m.path, html: withAssets(page), lastmod: m.map.at || config.contentDate, section: 'airports', noindex: !m.index, alternates };
}

/** One country with maps: its airports by size, then by longest runway. */
function countryPage(ctx, A, c, t, rules) {
  const { config, lib } = ctx;
  const crumbs = [[t('crumb.home'), '/'], [t('crumb.airports'), '/airports/'], [c.name, c.path]];
  const shown = c.models.slice().sort(sizeThenName).slice(0, rules.countryListCap);
  const groups = [['L', t('country.sizeLarge')], ['M', t('country.sizeMedium')], ['S', t('country.sizeSmall')]];
  const sections = groups
    .map(([kind, label]) => {
      const list = shown.filter((m) => m.kind === kind);
      if (!list.length) return '';
      return html`<section class="section" aria-labelledby="size-${kind}">
        <div class="wrap">
          <h2 id="size-${kind}">${t('country.sizeTitle', { size: label })}</h2>
          <ul class="${LIST_CLASS}">${list.map((m) => html`<li><span><a href="${m.path}">${m.name} (${m.iata || m.icao})</a> <small>${m.city || m.country}</small></span><span>${m.runwayCount} ${m.runwayCount === 1 ? 'runway' : 'runways'}, ${group(m.longestRunwayFt)} ft</span></li>`)}</ul>
        </div>
      </section>`;
    });
  const body = html`
  <section class="section">
    <div class="wrap">
      ${crumbNav(crumbs)}
      <header class="page-head">
        <h1>${t('country.h1', { country: c.name })}</h1>
        <p class="lead">${t('country.lead', { n: group(c.models.length), country: c.name, total: group(c.total) })}</p>
      </header>
    </div>
  </section>
  ${sections}
  ${c.models.length > shown.length ? html`<div class="wrap"><p class="note">${t('country.more', { shown: shown.length, n: c.models.length })}</p></div>` : ''}
  <div class="wrap"><p class="sources">${t('airport.sources', { date: A.routeSnapshotText })}</p></div>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('country.h1', { country: c.name }),
    url: `${config.domain}${c.path}`,
    description: t('country.desc', { n: c.models.length, country: c.name }),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: shown.length,
      itemListElement: shown.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.name, url: `${config.domain}${m.path}` })),
    },
  };
  const page = lib.layout(ctx, {
    lang: 'en',
    path: c.path,
    title: [t('country.title', { country: c.name }), t('country.titleShort', { country: c.name })].find((s) => s.length <= 70) || t('country.titleShort', { country: c.name }),
    description: t('country.desc', { n: group(c.models.length), country: c.name }),
    section: 'airports',
    playKey: `country-${c.path.split('/').filter(Boolean).pop()}`,
    bodyClass: 'page-country',
    jsonLd: [ld, crumbList(ctx, crumbs)],
    noindex: !c.index,
    body,
  });
  return { path: c.path, html: withAssets(page), lastmod: c.lastmod || config.contentDate, section: 'airports', noindex: !c.index };
}

/** The airports hub: search, the busiest airports, and the countries. */
function hubPage(ctx, A, t, data) {
  const { config, lib } = ctx;
  const crumbs = [[t('crumb.home'), '/'], [t('crumb.airports'), '/airports/']];
  const busiest = A.busiest.map((b) => {
    const m = b.model;
    const row = b.row;
    const name = row ? row.name : b.icao;
    const where = row ? [row.city, data.countryName(row.country)].filter(Boolean).join(', ') : '';
    const main = m ? html`<a href="${m.path}">${name} (${m.iata || m.icao})</a>` : html`<span>${name} (${b.icao})</span>`;
    return html`<li><span class="rank">${b.rank}</span><span>${main}${where ? html` <small>${where}</small>` : ''}</span><span>${oneDecimal(b.passengersM)} million</span></li>`;
  });
  const countries = A.countries.map((c) => html`<li><a class="chip" href="${c.path}">${c.name} <small>${t('hub.countryCount', { n: c.models.length })}</small></a></li>`);
  const body = html`
  <section class="section">
    <div class="wrap">
      ${crumbNav(crumbs)}
      <header class="page-head">
        <h1>${t('hub.h1')}</h1>
        <p class="lead">${t('hub.lead', { total: group(data.rowCount), mapped: group(A.list.length) })}</p>
      </header>
      <form class="search" id="airport-search" role="search" action="/airports/" method="get">
        <label for="airport-q">${t('hub.searchLabel')}</label>
        <input id="airport-q" name="q" type="search" autocomplete="off" spellcheck="false" inputmode="search" aria-describedby="airport-hint airport-status" data-index="/assets/site/airports-index.json">
        <p id="airport-hint" class="sources">${t('hub.searchHint')} <span class="js-only">${t('hub.noScript')}</span></p>
        <p id="airport-status" role="status" aria-live="polite"></p>
        <ul class="results hits" id="airport-results"></ul>
      </form>
    </div>
  </section>
  <section class="section section--band" aria-labelledby="busiest-title">
    <div class="wrap">
      <h2 id="busiest-title">${t('hub.busiestTitle')}</h2>
      <p>${t('hub.busiestNote')}</p>
      <ol class="${LIST_CLASS} ranked">${busiest}</ol>
    </div>
  </section>
  <section class="section" aria-labelledby="countries-title">
    <div class="wrap">
      <h2 id="countries-title">${t('hub.countriesTitle')}</h2>
      <p>${t('hub.countriesNote')}</p>
      <ul class="chips country-chips">${countries}</ul>
    </div>
  </section>
  <div class="wrap"><p class="sources">${t('airport.sources', { date: A.routeSnapshotText })}</p></div>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('hub.h1'),
    url: `${config.domain}/airports/`,
    description: t('hub.desc', { airports: rounded(data.rowCount) }),
  };
  const page = lib.layout(ctx, {
    lang: 'en',
    path: '/airports/',
    title: t('hub.title'),
    description: t('hub.desc', { airports: rounded(data.rowCount) }),
    section: 'airports',
    bodyClass: 'page-airports-hub',
    jsonLd: [ld, crumbList(ctx, crumbs)],
    body,
  });
  return { path: '/airports/', html: withAssets(page, { script: true }), lastmod: A.list.map((m) => m.map.at).filter(Boolean).sort().pop() || config.contentDate, section: 'airports' };
}

/** "29,000" from 29,164: the number the site says, rounded down to the thousand. */
function rounded(n) {
  return group(Math.floor(n / 1000) * 1000);
}

/** The compact search index: rows of [icao, iata, name, city, country code, has a page (1 or 0)]; country names by code. */
function indexFile(A, data) {
  const used = new Set();
  const rows = data.rows.map((r) => {
    used.add(r[4]);
    return [r[0], r[1] || '', r[2] || '', r[3] || '', r[4] || '', A.byIcao.has(r[0]) && data.isIcao(r[0]) ? 1 : 0];
  });
  const countries = {};
  for (const code of [...used].sort()) countries[code] = data.countryName(code);
  return `${JSON.stringify({ about: 'Airport search index for the airports page. Rows: ICAO, IATA, name, city, country code, has a page (1) or not (0). Names: countries.', countries, rows })}\n`;
}

export async function pages(ctx) {
  const { root, data, config } = ctx;
  const rules = JSON.parse(readText(root, 'rules.json'));
  const t = makeCopy(JSON.parse(readText(root, 'copy.json')));
  const A = buildAirportData(ctx, rules);
  const out = [];
  for (const m of A.list) out.push(airportPage(ctx, A, m, t, rules));
  for (const c of A.countries) out.push(countryPage(ctx, A, c, t, rules));
  out.push(hubPage(ctx, A, t, data));
  out.push({ path: '/assets/site/airports-index.json', content: indexFile(A, data), section: 'airports' });
  out.push({ path: '/assets/site/airports.css', content: readText(root, 'airports.css') });
  out.push({ path: '/assets/site/airports-search.js', content: readText(root, 'search.js') });
  return out;
}
