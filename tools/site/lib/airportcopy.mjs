// The words of the airport pages. Sentences are chosen by each airport's facts (which sentences exist, and in what order),
// so no two pages share a paragraph unless their facts are the same. Every fact comes from the site data; nothing is invented.
import { esc } from './html.mjs';

/** A translator-style lookup over site-src/airports/copy.json: {name} placeholders, and a missing key is a build error. */
export function makeCopy(dict) {
  return function t(key, vars = {}) {
    const text = dict[key];
    if (text === undefined) throw new Error(`airports copy: no text for "${key}"`);
    return text.replace(/\{(\w+)\}/g, (_, name) => {
      if (vars[name] === undefined) throw new Error(`airports copy: "${key}" needs {${name}}`);
      return String(vars[name]);
    });
  };
}

/** 12345 becomes "12,345" (no locale data, so the same on every build machine). */
export function group(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One decimal for passenger counts: 85.7. */
export function oneDecimal(n) {
  return (Math.round(Number(n) * 10) / 10).toFixed(1);
}

/** "a, b and c", using the joiner from the copy. */
export function listWords(items, t) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t('list.and')} ${items[items.length - 1]}`;
}

export function endsOf(r) {
  return `${r.le}/${r.he}`;
}

/** Runway ends that have a surface: "2 hard, 1 soft and 1 with no surface listed". */
function surfaceParts(runways, t) {
  const count = { hard: 0, soft: 0, unknown: 0 };
  for (const r of runways) count[r.surface] += 1;
  const parts = [];
  if (count.hard) parts.push(t('para.surface.hard', { n: count.hard }));
  if (count.soft) parts.push(t('para.surface.soft', { n: count.soft }));
  if (count.unknown) parts.push(t('para.surface.unknown', { n: count.unknown }));
  return { count, parts };
}

/**
 * The paragraph under the heading "About <code>". Sentences, in this order, when their facts exist:
 *   opening (IATA or not), ACI rank (only the busiest airports), runways (by count), surfaces (two or more runways),
 *   the map's counts, the route snapshot (airlines, then the most frequent links).
 */
export function paragraphFor(m, t) {
  const out = [];
  const base = { name: m.name, code: m.icao, iata: m.iata, size: m.size, place: m.place };
  out.push(m.iata ? t('para.open.iata', base) : t('para.open.noIata', base));
  if (m.busiest) out.push(t('para.rank', { rank: m.busiest.rank, pax: oneDecimal(m.busiest.passengersM) }));

  const rw = m.runways;
  if (rw.length === 0) out.push(t('para.run.none'));
  else if (rw.length === 1) {
    const r = rw[0];
    const surface = t(`surface.one.${r.surface}`);
    out.push(r.widthFt > 0
      ? t('para.run.one', { ends: endsOf(r), len: group(r.lengthFt), width: group(r.widthFt), surface })
      : t('para.run.oneNoWidth', { ends: endsOf(r), len: group(r.lengthFt), surface }));
  } else {
    const longest = rw[0];
    if (rw.length === 2) out.push(t('para.run.two', { a: endsOf(rw[0]), b: endsOf(rw[1]), ends: endsOf(longest), len: group(longest.lengthFt) }));
    else if (rw.length <= 4) out.push(t('para.run.few', { count: rw.length, list: listWords(rw.map(endsOf), t), ends: endsOf(longest), len: group(longest.lengthFt) }));
    else out.push(t('para.run.many', { count: rw.length, short: group(rw[rw.length - 1].lengthFt), len: group(longest.lengthFt), ends: endsOf(longest) }));
    if (rw.length >= 2) {
      const { count, parts } = surfaceParts(rw, t);
      out.push(count.hard === rw.length ? t('para.surface.allHard') : t('para.surface.mix', { parts: listWords(parts, t) }));
    }
  }

  const c = m.map.counts;
  const items = [];
  if (c.gates) items.push(t('para.item.gates', { n: group(c.gates) }));
  if (c.taxiways) items.push(t('para.item.taxi', { n: group(c.taxiways) }));
  if (c.aprons) items.push(t('para.item.aprons', { n: group(c.aprons) }));
  if (c.terminals) items.push(t('para.item.terminals', { n: group(c.terminals) }));
  out.push(items.length ? t('para.map', { items: listWords(items, t) }) : t('para.map.none'));

  const date = m.routes.snapshotText;
  if (m.routes.total === 0) out.push(t('para.routes.none', { date, code: m.icao }));
  else {
    if (m.routes.airlineCount === 1) {
      const a = m.routes.airlines[0];
      out.push(t('para.routes.one', { date, airline: a.name || a.code, routes: group(m.routes.total), code: m.icao }));
    } else {
      out.push(t('para.routes.many', { date, airlines: group(m.routes.airlineCount), routes: group(m.routes.total), code: m.icao }));
    }
    const names = m.routes.links.slice(0, 3).map((l) => `${(l.city || l.name).split(',')[0]} (${l.iata || l.icao})`);
    if (names.length === 1) out.push(t('para.links.one', { a: names[0] }));
    else if (names.length === 2) out.push(t('para.links.two', { a: names[0], b: names[1] }));
    else if (names.length >= 3) out.push(t('para.links.many', { a: names[0], b: names[1], c: names[2] }));
  }
  return out.join(' ');
}

/** Cut at a word boundary to at most n characters (no word is broken). */
function cutWords(text, n) {
  let s = text;
  while (esc(s).length > n && s.includes(' ')) s = s.slice(0, s.lastIndexOf(' ')).replace(/[ ,;:]+$/, '');
  return s;
}

/** The meta description: 50 to 160 characters (as written in the HTML, so an apostrophe counts as its escape). */
export function descriptionFor(m, t) {
  const place = m.place;
  const candidates = m.runwayCount
    ? [t('airport.desc', { name: m.name, place, runways: m.runwayCount, longest: group(m.longestRunwayFt) }), t('airport.descShort', { name: m.name, code: m.icao, place })]
    : [t('airport.descNoRunways', { name: m.name, place }), t('airport.descShort', { name: m.name, code: m.icao, place })];
  const fits = (s) => esc(s).length >= 50 && esc(s).length <= 160;
  return candidates.find(fits) || cutWords(candidates[candidates.length - 1], 160);
}

/** The page title: at most 70 characters (as written in the HTML), with the name and code when they fit. */
export function titleFor(m, t) {
  const candidates = [
    t('airport.title', { name: m.name, code: m.iata || m.icao }),
    t('airport.titleName', { name: m.name, code: m.iata || m.icao }),
    t('airport.titleCode', { code: m.iata || m.icao }),
  ];
  return candidates.find((s) => esc(s).length <= 70) || candidates[candidates.length - 1];
}

export { esc };
