// One model per airport that has a page: the facts every airport page, hub and country hub reads. Built once per build from
//   site-src/data (airport rows, runways, the ACI busiest list, country names), site-src/airports (airline names and rules),
//   osm/ (the map: read only) and routes/ (the published route snapshot: read only).
// Nothing here reads the clock, so the same inputs always give the same pages.
import fs from 'node:fs';
import path from 'node:path';
import { readMap } from './data.mjs';
import { airportMap } from './airportmap.mjs';
import { airportPath, countryPath, slugify } from './slug.mjs';

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A city as the page shows it: "Paris (Roissy-en-France, Val-d'Oise)" is "Paris". */
export function cityName(raw) {
  return String(raw || '').replace(/\s*\(.*$/, '').split(',')[0].trim();
}

/** Runway rows to records: surface H/S/? becomes hard/soft/unknown; lighted is 1 when lit. */
export function runwayRecords(rows) {
  return rows
    .map((r) => ({
      le: String(r[0] || ''),
      he: String(r[1] || ''),
      lengthFt: Number(r[2]) || 0,
      widthFt: Number(r[3]) || 0,
      surface: r[4] === 'H' ? 'hard' : r[4] === 'S' ? 'soft' : 'unknown',
      lit: r[5] === 1,
      leLat: Number(r[6]),
      leLon: Number(r[7]),
      heLat: Number(r[8]),
      heLon: Number(r[9]),
    }))
    .sort((a, b) => b.lengthFt - a.lengthFt || (a.le < b.le ? -1 : 1));
}

/**
 * The route snapshot as counts: per airport, the routes that touch it, the airlines that fly them, and the airports it is linked
 * to (a route counts once per pair of airports it links). Returns { snapshot, byAirport: Map icao -> entry }.
 */
export function readRouteIndex(root) {
  const dir = path.join(root, 'routes');
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const byAirport = new Map();
  const entry = (code) => {
    let e = byAirport.get(code);
    if (!e) {
      e = { routes: 0, airlines: new Map(), links: new Map() };
      byAirport.set(code, e);
    }
    return e;
  };
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue;
    const doc = readJson(path.join(dir, file));
    const airline = String(doc.airline || '');
    for (const stops of Object.values(doc.routes || {})) {
      const seq = String(stops).split('-').filter(Boolean);
      const touched = new Set(seq);
      for (const code of touched) {
        const e = entry(code);
        e.routes++;
        e.airlines.set(airline, (e.airlines.get(airline) || 0) + 1);
      }
      const pairs = new Set();
      for (let i = 0; i + 1 < seq.length; i++) {
        if (seq[i] !== seq[i + 1]) pairs.add(seq[i] < seq[i + 1] ? `${seq[i]}|${seq[i + 1]}` : `${seq[i + 1]}|${seq[i]}`);
      }
      for (const p of pairs) {
        const [a, b] = p.split('|');
        for (const [x, y] of [[a, b], [b, a]]) {
          const e = entry(x);
          e.links.set(y, (e.links.get(y) || 0) + 1);
        }
      }
    }
  }
  return { snapshot: manifest.snapshot, byAirport };
}

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest `k` mapped airports to each model (by a flat approximation for ranking, exact distances for display). */
function nearestPages(models, k) {
  const out = new Map();
  for (const a of models) {
    const cosA = Math.cos(a.lat * RAD);
    const best = [];
    for (const b of models) {
      if (b === a) continue;
      const dx = (b.lon - a.lon) * RAD * cosA, dy = (b.lat - a.lat) * RAD;
      const d2 = dx * dx + dy * dy;
      if (best.length < k || d2 < best[best.length - 1].d2) {
        best.push({ b, d2 });
        best.sort((x, y) => x.d2 - y.d2 || (x.b.icao < y.b.icao ? -1 : 1));
        if (best.length > k) best.pop();
      }
    }
    out.set(a.icao, best.map(({ b }) => ({ icao: b.icao, km: distanceKm(a, b) })));
  }
  return out;
}

function monthDate(iso) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = String(iso).split('-');
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

/**
 * Builds the models. Returns:
 *   list (sorted by ICAO), byIcao, countries (Map ISO -> { code, name, slug, path, models }), busiest (ranked rows with models),
 *   routeSnapshot (text date), airlineName(code), stats.
 */
export function buildAirportData(ctx, rules) {
  const { root, data } = ctx;
  const src = path.join(root, 'site-src');
  const airlineNames = readJson(path.join(src, 'airports', 'airlines.json')).names;
  const routes = readRouteIndex(root);
  const rankOf = new Map(data.busiestRows.map((r) => [r.icao, r]));
  const sizeWord = { L: 'large', M: 'medium', S: 'small' };
  const cityOf = (icao) => data.airports.get(icao) || null;

  const models = [];
  for (const a of data.mapped) {
    const rw = runwayRecords(data.runways(a.icao));
    const map = readMap(root, a.icao);
    const runwayEnds = rw.map((r) => ({ le: r.le, he: r.he, leLat: r.leLat, leLon: r.leLon, heLat: r.heLat, heLon: r.heLon }));
    const country = data.countryName(a.country);
    const place = a.city ? `${a.city}, ${country}` : country;
    const drawn = airportMap({ map, runways: runwayEnds, label: `${a.name} (${a.icao})` });
    const longest = rw[0] || null;
    const busiest = rankOf.get(a.icao) || null;
    const rt = routes.byAirport.get(a.icao);
    const airlines = rt ? [...rt.airlines].map(([code, routesN]) => ({ code, name: airlineNames[code] || '', routes: routesN })) : [];
    airlines.sort((x, y) => y.routes - x.routes || (x.code < y.code ? -1 : 1));
    const links = rt ? [...rt.links].map(([icao, n]) => ({ icao, routes: n })) : [];
    links.sort((x, y) => y.routes - x.routes || (x.icao < y.icao ? -1 : 1));
    const linkRows = links.slice(0, rules.routeTop).map((l) => {
      const other = cityOf(l.icao);
      return {
        icao: l.icao,
        iata: other?.iata || '',
        name: other?.name || l.icao,
        city: cityName(other?.city),
        country: other ? data.countryName(other.country) : '',
        routes: l.routes,
        mapped: data.mappedSet.has(l.icao),
      };
    });
    const model = {
      icao: a.icao,
      iata: a.iata,
      name: displayName(a),
      city: cityName(a.city),
      countryCode: a.country,
      country,
      place,
      lat: a.lat,
      lon: a.lon,
      elevationFt: Number.isFinite(a.elevationFt) ? a.elevationFt : null,
      kind: a.kind,
      size: sizeWord[a.kind] || '',
      sizeLabel: a.sizeLabel,
      runways: rw,
      runwayCount: rw.length,
      longestRunwayFt: longest ? longest.lengthFt : a.longestRunwayFt || 0,
      longestEnds: longest ? `${longest.le}/${longest.he}` : '',
      busiest: busiest ? { rank: busiest.rank, passengersM: busiest.passengersM } : null,
      map: {
        svg: drawn.svg,
        counts: drawn.counts,
        at: map && map.at ? String(map.at) : '',
        atText: map && map.at ? monthDate(map.at) : '',
      },
      routes: {
        total: rt ? rt.routes : 0,
        airlineCount: airlines.length,
        airlines: airlines.slice(0, rules.routeTop),
        linkCount: links.length,
        links: linkRows,
        snapshot: routes.snapshot,
        snapshotText: monthDate(routes.snapshot),
      },
      nearby: [],
    };
    model.facts = thinFacts(model);
    models.push(model);
  }
  models.sort((x, y) => (x.icao < y.icao ? -1 : x.icao > y.icao ? 1 : 0));
  const byIcao = new Map(models.map((m) => [m.icao, m]));

  // nearest pages, for the links on each airport page
  const near = nearestPages(models, rules.nearby);
  for (const m of models) {
    m.nearby = near.get(m.icao).map(({ icao, km }) => {
      const o = byIcao.get(icao);
      return { icao, name: o.name, iata: o.iata, city: o.city, km: Math.round(km), miles: Math.round(km * 0.621371) };
    });
    m.path = airportPath(m.icao);
    m.index = m.facts >= rules.thinBelow;
  }

  // countries: every country with a mapped airport. Country slugs that equal an airport code get "-country".
  const countries = new Map();
  for (const m of models) {
    if (!countries.has(m.countryCode)) countries.set(m.countryCode, []);
    countries.get(m.countryCode).push(m);
  }
  const countryList = [...countries].map(([code, list]) => {
    const name = data.countryName(code);
    const slugPath = countryPath(name, data.isIcao);
    const slug = slugPath.replace(/^\/airports\//, '').replace(/\/$/, '');
    list.sort(sizeThenName);
    const total = data.rows.filter((r) => r[4] === code).length;
    return {
      code,
      name,
      slug,
      path: slugPath,
      models: list,
      total,
      index: list.length >= rules.countryMinIndexed,
      lastmod: list.map((m) => m.map.at).filter(Boolean).sort().pop() || '',
    };
  });
  countryList.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const countriesByCode = new Map(countryList.map((c) => [c.code, c]));

  const busiestRanked = data.busiestRows.map((r) => ({ rank: r.rank, icao: r.icao, passengersM: r.passengersM, model: byIcao.get(r.icao) || null, row: data.airports.get(r.icao) || null }));

  return {
    list: models,
    byIcao,
    countries: countryList,
    countriesByCode,
    busiest: busiestRanked,
    busiestSource: data.busiestSource,
    routeSnapshot: routes.snapshot,
    routeSnapshotText: monthDate(routes.snapshot),
    airlineName: (code) => airlineNames[code] || '',
    monthDate,
    stats: {
      mapped: models.length,
      indexable: models.filter((m) => m.index).length,
      thin: models.filter((m) => !m.index).length,
      countries: countryList.length,
      countriesIndexable: countryList.filter((c) => c.index).length,
    },
  };
}

/** The substantive facts an airport page can show beyond its name and code. Thin pages (below rules.thinBelow) are noindex. */
function thinFacts(m) {
  const detail = m.map.counts.taxiways + m.map.counts.aprons + m.map.counts.terminals + m.map.counts.gates > 0;
  return (m.city ? 1 : 0) + (m.iata ? 1 : 0) + (m.routes.total > 0 ? 1 : 0) + (m.busiest ? 1 : 0) + (m.runwayCount >= 2 ? 1 : 0) + (detail ? 1 : 0);
}

export function sizeThenName(a, b) {
  const order = { L: 0, M: 1, S: 2 };
  const ka = order[a.kind] ?? 3, kb = order[b.kind] ?? 3;
  if (ka !== kb) return ka - kb;
  if (a.longestRunwayFt !== b.longestRunwayFt) return b.longestRunwayFt - a.longestRunwayFt;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export { slugify, countryPath, airportPath };

/** The name shown on pages. Two data fixes: one name carries a three-letter code in brackets that is not an IATA code (ICAO-only
 * airfields), and one display name is written without its hyphen. */
function displayName(a) {
  if (a.icao === 'KATL') return 'Hartsfield-Jackson Atlanta International Airport';
  if (!a.iata && /\([A-Z]{3}\)/.test(a.name)) return a.name.replace(/\s*\([A-Z]{3}\)/, '');
  return a.name;
}
