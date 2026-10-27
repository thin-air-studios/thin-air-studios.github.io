// Local-language airport pages: /<lang>/airports/<icao>/ for about 300 of the busiest mapped airports in countries whose main
// language is a store language. Each page has the English airport page's facts (the same map, runways, routes and nearby
// links, from airportdata.mjs) and every visible word from site-src/i18n/airports-<code>.json. Numbers, dates, plurals and
// country names follow the language (Intl and the dictionary), so no English word is left in the sentences.
// Links: the English airport page lists its local version (hreflang, with x-default English); the local page lists the English
// page; the localized home lists its airports (localHomeBlock). The game itself is in English, and each page says so.
// Selection (per language, in this order): the busiest by ACI rank, then size class (large, medium, small), then the longest
// runway, then ICAO. A country cap (perCountry) spreads the list where one country is large. Nothing reads the clock.
// The plan is built once per build and cached on ctx.data, so the English pages, the local pages and the homes agree.
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, esc } from './html.mjs';
import { playLink } from './play.mjs';
import { layout } from './layout.mjs';
import { buildAirportData } from './airportdata.mjs';
import { airportPath } from './slug.mjs';

/** The languages and how many airports each gets. Country codes are ISO 3166 alpha-2; the list order is the build order. */
export const LOCAL_PLAN = [
  { lang: 'es', countries: ['ES'], quota: 25 },
  { lang: 'es-419', countries: ['MX', 'AR', 'CO', 'PE', 'CL', 'VE', 'EC', 'BO', 'PY', 'UY', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'CU', 'DO', 'PR'], quota: 50, perCountry: 8 },
  { lang: 'pt-br', countries: ['BR'], quota: 30 },
  { lang: 'de', countries: ['DE', 'AT'], quota: 30 },
  { lang: 'fr', countries: ['FR'], quota: 30 },
  { lang: 'it', countries: ['IT'], quota: 25 },
  { lang: 'ja', countries: ['JP'], quota: 30 },
  { lang: 'ko', countries: ['KR'], quota: 10 },
  { lang: 'zh-tw', countries: ['TW', 'HK', 'MO'], quota: 15 },
  { lang: 'tr', countries: ['TR'], quota: 20 },
  { lang: 'id', countries: ['ID'], quota: 25 },
  { lang: 'pl', countries: ['PL'], quota: 15 },
];

/** The Intl locale for each language (number grouping, decimal marks and region names). */
const INTL = { es: 'es-ES', 'es-419': 'es-419', 'pt-br': 'pt-BR', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', 'zh-tw': 'zh-TW', tr: 'tr-TR', id: 'id-ID', pl: 'pl-PL' };

/** Region names where the CLDR name is long for a page title or sentence. */
const COUNTRY_NAME = { 'zh-tw': { HK: '香港', MO: '澳門' } };

const KINDS = ['L', 'M', 'S'];
const KIND_RANK = { L: 0, M: 1, S: 2 };
const plans = new WeakMap();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The dictionary for one language: site-src/i18n/airports-<code>.json (flat keys). */
function dictFor(ctx, code) {
  return readJson(path.join(ctx.root, 'site-src', 'i18n', `airports-${code}.json`));
}

function langEntry(config, code) {
  const entry = config.languages.find((l) => l.code === code);
  if (!entry) throw new Error(`localairports: no language ${code} in config.json`);
  return entry;
}

/** /es/airports/lemd/ for LEMD in Spanish. */
export function localPath(config, code, icao) {
  return `${langEntry(config, code).path}airports/${String(icao).toLowerCase()}/`;
}

function hreflangOf(config, code) {
  return langEntry(config, code).hreflang;
}

/** Busiest first (ACI rank), then size class, then the longest runway, then ICAO. */
function bySize(a, b) {
  const ra = a.busiest ? a.busiest.rank : 999, rb = b.busiest ? b.busiest.rank : 999;
  if (ra !== rb) return ra - rb;
  const ka = KIND_RANK[a.kind] ?? 3, kb = KIND_RANK[b.kind] ?? 3;
  if (ka !== kb) return ka - kb;
  if (a.longestRunwayFt !== b.longestRunwayFt) return b.longestRunwayFt - a.longestRunwayFt;
  return a.icao < b.icao ? -1 : a.icao > b.icao ? 1 : 0;
}

/**
 * The plan for this build: byIcao (icao -> { lang, model }), byLang (lang -> models, in order), A (the airport models), and the
 * dictionaries read so far. Built once per ctx.data.
 */
function plan(ctx) {
  if (plans.has(ctx.data)) return plans.get(ctx.data);
  const rules = readJson(path.join(ctx.root, 'site-src', 'airports', 'rules.json'));
  const A = buildAirportData(ctx, rules);
  const byIcao = new Map();
  const byLang = new Map();
  for (const step of LOCAL_PLAN) {
    const countries = new Set(step.countries);
    const per = new Map();
    const picks = [];
    for (const m of A.list.filter((x) => countries.has(x.countryCode) && x.index).sort(bySize)) {
      if (picks.length >= step.quota) break;
      const n = per.get(m.countryCode) || 0;
      if (n >= (step.perCountry || Infinity)) continue;
      per.set(m.countryCode, n + 1);
      picks.push(m);
    }
    for (const m of picks) byIcao.set(m.icao, { lang: step.lang, model: m });
    byLang.set(step.lang, picks);
  }
  const value = { A, byIcao, byLang, dicts: new Map() };
  plans.set(ctx.data, value);
  return value;
}

/** Alternates for the English airport page: itself, its local version and x-default English (only for airports with a local page). */
export function englishAlternates(ctx, m) {
  const pick = plan(ctx).byIcao.get(m.icao);
  if (!pick) return [];
  const { config } = ctx;
  const en = `${config.domain}${m.path}`;
  return [
    { hreflang: 'en', href: en },
    { hreflang: hreflangOf(config, pick.lang), href: `${config.domain}${localPath(config, pick.lang, m.icao)}` },
    { hreflang: 'x-default', href: en },
  ];
}

/** Alternates for a local page: English, itself and x-default English. */
function localAlternates(ctx, lang, m) {
  const { config } = ctx;
  const en = `${config.domain}${m.path}`;
  return [
    { hreflang: 'en', href: en },
    { hreflang: hreflangOf(config, lang), href: `${config.domain}${localPath(config, lang, m.icao)}` },
    { hreflang: 'x-default', href: en },
  ];
}

/** The text lookup for one dictionary: {name} placeholders, and a missing key is a build error. */
function makeT(dict, code) {
  return function t(key, vars = {}) {
    const text = dict[key];
    if (text === undefined) throw new Error(`airports ${code}: no text for "${key}"`);
    return text.replace(/\{(\w+)\}/g, (_, name) => {
      if (vars[name] === undefined) throw new Error(`airports ${code}: "${key}" needs {${name}}`);
      return String(vars[name]);
    });
  };
}

/** The per-language helpers: text, numbers, dates, countries and counted nouns. */
function localeFor(ctx, code) {
  const { dicts } = plan(ctx);
  if (!dicts.has(code)) dicts.set(code, dictFor(ctx, code));
  const dict = dicts.get(code);
  const locale = INTL[code];
  const num = new Intl.NumberFormat(locale);
  const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const L = {
    code,
    dict,
    t: makeT(dict, code),
    num: (n) => num.format(Math.round(Number(n) || 0)),
    dec: (n) => dec.format(Math.round(Number(n) * 10) / 10),
    // A passenger count in millions. Japanese and Korean count in units of 10,000 (万, 만), so 91.7 million reads 9,170万 / 9,170만.
    pax: (millions) => (code === 'ja' || code === 'ko'
      ? num.format(Math.round(Number(millions) * 100))
      : dec.format(Math.round(Number(millions) * 10) / 10)),
    country(cc, fallback) {
      const own = COUNTRY_NAME[code] && COUNTRY_NAME[code][cc];
      if (own) return own;
      try {
        return names.of(cc) || fallback;
      } catch {
        return fallback;
      }
    },
    date(iso) {
      const [y, m, d] = String(iso).split('-').map(Number);
      return L.t('date.format', { d, m: dict[`month.${m}`], n: m, y });
    },
  };
  return L;
}

/** Polish: 2 to 4 (but not 12 to 14) take the "few" form. Other languages have one form for the plural. */
function isFew(n) {
  const m10 = n % 10, m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14);
}

/** A counted noun: "3 pistas", "1 pista", "12 rutas" (the order and spacing come from count.format). */
function countOf(L, noun, n) {
  const d = L.dict;
  const exact = n === 1 ? d[`noun.${noun}.one`] : undefined;
  const few = L.code === 'pl' && isFew(n) ? d[`noun.${noun}.few`] : undefined;
  const word = exact ?? few ?? d[`noun.${noun}`];
  if (word === undefined) throw new Error(`airports ${L.code}: no noun "${noun}"`);
  return L.t('count.format', { n: L.num(n), noun: word });
}

/** "a, b and c" in the language's list style. */
function listOf(L, items) {
  if (items.length <= 1) return items.join('');
  const sep = L.dict['list.sep'];
  const sp = sep === '、' ? '' : ' '; // Japanese and Chinese set the conjunction without spaces
  return `${items.slice(0, -1).join(sep)}${sp}${L.dict['list.and']}${sp}${items[items.length - 1]}`;
}

function endsOf(r) {
  return `${r.le}/${r.he}`;
}

/** Cut at a word boundary to at most n characters, as written in the HTML (no word is broken). */
function cutWords(text, n) {
  let s = text;
  while (esc(s).length > n && s.includes(' ')) s = s.slice(0, s.lastIndexOf(' ')).replace(/[ ,;:]+$/, '');
  return s;
}

/** The meta description: 50 to 160 characters (the first of three wordings that fits), with the name, runways and longest runway. */
function descriptionOf(L, m) {
  const t = L.t;
  const base = { name: m.name, place: m.place, code: m.icao };
  const candidates = m.runwayCount
    ? [t('airport.desc', { ...base, runways: countOf(L, 'runway', m.runwayCount), longest: L.num(m.longestRunwayFt) }), t('airport.descShort', base), t('airport.descMin', base)]
    : [t('airport.descNoRunways', base), t('airport.descShort', base), t('airport.descMin', base)];
  const fits = (s) => esc(s).length >= 50 && esc(s).length <= 160;
  return candidates.find(fits) || cutWords(candidates[candidates.length - 1], 160);
}

/** The page title: at most 70 characters, with the name and code when they fit. */
function titleOf(L, m) {
  const t = L.t;
  const code = m.iata || m.icao;
  const candidates = [t('airport.title', { name: m.name, code }), t('airport.titleName', { name: m.name, code }), t('airport.titleCode', { code })];
  return candidates.find((s) => esc(s).length <= 70) || candidates[candidates.length - 1];
}

/** The paragraph under "About <code>", sentence by sentence, as the English page builds it from the same facts. */
function paragraphOf(L, m) {
  const t = L.t;
  const out = [];
  const base = { name: m.name, code: m.icao, iata: m.iata, size: m.size, place: m.place };
  out.push(m.iata ? t('para.open.iata', base) : t('para.open.noIata', base));
  if (m.busiest) out.push(t('para.rank', { rank: m.busiest.rank, pax: L.pax(m.busiest.passengersM) }));

  const rw = m.runways;
  if (rw.length === 0) out.push(t('para.run.none'));
  else if (rw.length === 1) {
    const r = rw[0];
    const surface = t(`surface.one.${r.surface}`);
    out.push(r.widthFt > 0
      ? t('para.run.one', { ends: endsOf(r), len: L.num(r.lengthFt), width: L.num(r.widthFt), surface })
      : t('para.run.oneNoWidth', { ends: endsOf(r), len: L.num(r.lengthFt), surface }));
  } else {
    const longest = rw[0];
    if (rw.length === 2) out.push(t('para.run.two', { a: endsOf(rw[0]), b: endsOf(rw[1]), ends: endsOf(longest), len: L.num(longest.lengthFt) }));
    else if (rw.length <= 4) out.push(t('para.run.few', { count: countOf(L, 'runway', rw.length), list: listOf(L, rw.map(endsOf)), ends: endsOf(longest), len: L.num(longest.lengthFt) }));
    else out.push(t('para.run.many', { count: countOf(L, 'runway', rw.length), short: L.num(rw[rw.length - 1].lengthFt), len: L.num(longest.lengthFt), ends: endsOf(longest) }));
    if (rw.length >= 2) {
      const n = { hard: 0, soft: 0, unknown: 0 };
      for (const r of rw) n[r.surface] += 1;
      if (n.hard === rw.length) out.push(t('para.surface.allHard'));
      else {
        const parts = [];
        if (n.hard) parts.push(countOf(L, 'hard', n.hard));
        if (n.soft) parts.push(countOf(L, 'soft', n.soft));
        if (n.unknown) parts.push(countOf(L, 'unknown', n.unknown));
        out.push(t('para.surface.mix', { parts: listOf(L, parts) }));
      }
    }
  }

  const c = m.map.counts;
  const items = [];
  if (c.gates) items.push(countOf(L, 'gate', c.gates));
  if (c.taxiways) items.push(countOf(L, 'taxi', c.taxiways));
  if (c.aprons) items.push(countOf(L, 'apron', c.aprons));
  if (c.terminals) items.push(countOf(L, 'terminal', c.terminals));
  out.push(items.length ? t('para.map', { items: listOf(L, items) }) : t('para.map.none'));

  const date = L.date(m.routes.snapshot);
  if (m.routes.total === 0) out.push(t('para.routes.none', { date, code: m.icao }));
  else {
    if (m.routes.airlineCount === 1) {
      const a = m.routes.airlines[0];
      out.push(t('para.routes.one', { date, airline: a.name || a.code, routes: countOf(L, 'route', m.routes.total), code: m.icao }));
    } else {
      out.push(t('para.routes.many', { date, airlines: countOf(L, 'airline', m.routes.airlineCount), routes: countOf(L, 'route', m.routes.total), code: m.icao }));
    }
    const names = m.routes.links.slice(0, 3).map((l) => `${(l.city || l.name).split(',')[0]} (${l.iata || l.icao})`);
    if (names.length === 1) out.push(t('para.links.one', { a: names[0] }));
    else if (names.length === 2) out.push(t('para.links.two', { a: names[0], b: names[1] }));
    else if (names.length >= 3) out.push(t('para.links.many', { a: names[0], b: names[1], c: names[2] }));
  }
  return out.join(' ');
}

/** The airport's facts in this language: the place and size words are localized; the data (names, codes) is as the source has it. */
function localModel(ctx, L, m) {
  const row = ctx.data.airports.get(m.icao);
  const country = L.country(m.countryCode, m.country);
  const city = row ? row.city : '';
  const kindOk = KINDS.includes(m.kind);
  return {
    ...m,
    country,
    place: city ? `${city}, ${country}` : country,
    size: kindOk ? L.dict[`size.${m.kind}`] : '',
    sizeLabel: kindOk ? L.dict[`sizeCap.${m.kind}`] : '',
  };
}

function crumbNav(crumbs, label) {
  return html`<nav class="crumbs" aria-label="${label}"><ol>${crumbs.map(([text, href], i) => (i === crumbs.length - 1 ? html`<li aria-current="page">${text}</li>` : html`<li><a href="${href}">${text}</a></li>`))}</ol></nav>`;
}

/** Adds the airport stylesheet to the layout's document (the same file the English page uses). */
function withAssets(page) {
  return raw(page.value.replace('</head>', '<link rel="stylesheet" href="/assets/site/airports.css">\n</head>'));
}

/** One local airport page, as an output of the build. */
function localAirportPage(ctx, lang, m) {
  const { config } = ctx;
  const { A } = plan(ctx);
  const L = localeFor(ctx, lang);
  const t = L.t;
  const loc = localModel(ctx, L, m);
  const here = localPath(config, lang, m.icao);
  const canonical = `${config.domain}${here}`;
  const key = `airport-${m.icao.toLowerCase()}-${lang}`;
  const short = m.iata || m.icao;
  const home = langEntry(config, lang).path;
  const countryHub = A.countriesByCode.get(m.countryCode).path;
  const crumbs = [[t('crumb.home'), home], [t('crumb.airports'), '/airports/'], [loc.country, countryHub], [m.name, here]];
  const playTop = playLink(key, 'hero');
  const playEnd = playLink(key, 'footer-cta');
  const demoHref = `${config.demoPath}?a=${m.icao}`;
  const pickHref = (icao) => {
    const p = plan(ctx).byIcao.get(icao);
    return p && p.lang === lang ? localPath(config, lang, icao) : airportPath(icao);
  };

  const facts = [
    [t('airport.factsLocation'), loc.place],
    [t('airport.factsIcao'), m.icao],
    [t('airport.factsIata'), m.iata || t('airport.factsIataNone')],
  ];
  if (m.elevationFt !== null) facts.push([t('airport.factsElevation'), t('airport.factsElevationValue', { elev: L.num(m.elevationFt) })]);
  if (m.runwayCount) facts.push([t('airport.factsLongest'), t('airport.factsLongestValue', { len: L.num(m.longestRunwayFt), ends: m.longestEnds })]);
  facts.push([t('airport.factsRunways'), L.num(m.runwayCount)]);
  facts.push([t('airport.factsSize'), loc.sizeLabel]);
  if (m.busiest) facts.push([t('airport.factsRank'), t('airport.factsRankValue', { pax: L.pax(m.busiest.passengersM), rank: m.busiest.rank })]);
  facts.push([t('airport.factsPosition'), `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`]);

  const mapFigure = m.map.svg
    ? html`<figure class="airport-map-wrap">${raw(m.map.svg)}<figcaption>${t('airport.mapCaption', { date: m.map.at ? L.date(m.map.at) : '' })}</figcaption></figure>`
    : html`<p class="note">${t('airport.mapNone')}</p>`;

  const runwayRows = m.runways.map((r) => html`<tr><th scope="row">${r.le} / ${r.he}</th><td data-label="${t('airport.th.length')}">${L.num(r.lengthFt)} ft</td><td data-label="${t('airport.th.width')}">${r.widthFt ? `${L.num(r.widthFt)} ft` : t('surface.unknown')}</td><td data-label="${t('airport.th.surface')}">${t(`surface.${r.surface}`)}</td><td data-label="${t('airport.th.lights')}">${r.lit ? t('lights.lit') : t('lights.unlit')}</td></tr>`);
  const runwaysBlock = m.runways.length
    ? html`<div class="table-wrap"><table><caption>${t('airport.runwaysCaption')}</caption><thead><tr><th scope="col">${t('airport.th.runway')}</th><th scope="col">${t('airport.th.length')}</th><th scope="col">${t('airport.th.width')}</th><th scope="col">${t('airport.th.surface')}</th><th scope="col">${t('airport.th.lights')}</th></tr></thead><tbody>${runwayRows}</tbody></table></div>
      <p class="sources">${t('airport.runwaysNote')}</p>`
    : html`<p class="note">${t('airport.runwaysNone')}</p>`;

  const routes = m.routes;
  const namedAirlines = routes.airlines.filter((a) => a.name);
  const codeOnly = routes.airlines.filter((a) => !a.name).map((a) => a.code);
  const codesText = codeOnly.length > 8 ? t('list.more', { codes: codeOnly.slice(0, 8).join(', '), n: L.num(codeOnly.length - 8) }) : codeOnly.join(', ');
  const airlineItems = namedAirlines.map((a) => html`<li><span>${a.name}${html` <small>${a.code}</small>`}</span><span>${countOf(L, 'route', a.routes)}</span></li>`);
  const linkItems = routes.links.map((l) => {
    const label = `${l.name} (${l.iata || l.icao})`;
    const cc = ctx.data.airports.get(l.icao)?.country;
    const where = [l.city, cc ? L.country(cc, l.country) : l.country].filter(Boolean).join(', ');
    const main = l.mapped ? html`<a href="${pickHref(l.icao)}">${label}</a>` : html`<span>${label}</span>`;
    return html`<li><span>${main}${where ? html` <small>${where}</small>` : ''}</span><span>${countOf(L, 'route', l.routes)}</span></li>`;
  });
  const routesBlock = routes.total
    ? html`<div class="split">
        <div><h3>${t('airport.airlinesTitle')}</h3><ul class="rows">${airlineItems}</ul>${codeOnly.length ? html`<p class="sources">${t('airport.airlinesOther', { codes: codesText })}</p>` : ''}</div>
        <div><h3>${t('airport.linksTitle')}</h3><ul class="rows">${linkItems}</ul></div>
      </div>`
    : html`<p class="note">${t('airport.routesNone', { date: L.date(routes.snapshot) })}</p>`;

  const nearby = m.nearby.map((n) => html`<li><a class="chip" href="${pickHref(n.icao)}">${n.name} (${n.iata || n.icao})</a> <small>${t('airport.distance', { km: L.num(n.km), miles: L.num(n.miles) })}</small></li>`);

  const body = html`
  <article class="airport-page">
    <div class="wrap">
      ${crumbNav(crumbs, t('crumb.label'))}
      <header class="airport-head">
        <p class="eyebrow">${t('airport.eyebrow')}</p>
        <h1>${m.name} (${short})</h1>
        <p class="lead">${loc.place} · ICAO ${m.icao}${m.iata ? ` · IATA ${m.iata}` : ''}</p>
        <div class="btn-row">
          <a class="btn" href="${demoHref}" data-event="demo_start" data-ev-airport="${m.icao}">${t('airport.playDemo', { code: short })}</a>
          <a class="btn btn--ghost" href="${playTop}" data-event="play_store_click" data-ev-page="${key}" data-ev-position="hero" data-ev-airport="${m.icao}">${t('airport.playStore')}</a>
        </div>
        <p class="free-note">${t('airport.demoNote')}</p>
        <p class="free-note">${t('airport.gameEnglish')}</p>
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
      <p>${paragraphOf(L, loc)}</p>
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
      ${routes.total ? html`<p class="note">${t('airport.routesNote', { date: L.date(routes.snapshot) })}</p>` : ''}
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
  <div class="wrap"><p class="sources">${t('airport.sources', { date: L.date(routes.snapshot) })}</p></div>`;

  const description = descriptionOf(L, loc);
  const airportLd = {
    '@context': 'https://schema.org',
    '@type': 'Airport',
    name: m.name,
    icaoCode: m.icao,
    ...(m.iata ? { iataCode: m.iata } : {}),
    url: canonical,
    description,
    geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lon },
    address: { '@type': 'PostalAddress', ...(m.city ? { addressLocality: m.city } : {}), addressCountry: m.countryCode },
  };
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${config.domain}${href}` })),
  };
  const alternates = localAlternates(ctx, lang, m);
  const page = layout(ctx, {
    lang,
    path: here,
    title: titleOf(L, loc),
    description,
    section: 'airports',
    playKey: key,
    bodyClass: 'page-airport',
    imageAlt: ctx.t(lang, 'home.ogAlt'),
    alternates,
    jsonLd: [airportLd, crumbLd],
    body,
  });
  return { path: here, html: withAssets(page), lastmod: m.map.at || config.contentDate, section: 'airports', alternates };
}

/** Every local airport page, in plan order. */
export function localAirportPages(ctx) {
  const out = [];
  for (const step of LOCAL_PLAN) {
    for (const m of plan(ctx).byLang.get(step.lang)) out.push(localAirportPage(ctx, step.lang, m));
  }
  return out;
}

/**
 * The airport list on a localized home (between the airport pick and the final band): the local airports with their pages.
 * Returns '' when the language has none.
 */
export function localHomeBlock(ctx, code) {
  const picks = plan(ctx).byLang.get(code) || [];
  if (!picks.length) return '';
  const L = localeFor(ctx, code);
  const { config } = ctx;
  return html`<section class="section" aria-labelledby="local-airports-title">
  <div class="wrap">
    <h2 id="local-airports-title">${L.t('home.localTitle')}</h2>
    <p>${L.t('home.localBody')}</p>
    <ul class="chips">${picks.map((m) => html`<li><a class="chip" href="${localPath(config, code, m.icao)}">${m.city || m.name} <small>${m.iata || m.icao}</small></a></li>`)}</ul>
  </div>
</section>`;
}

