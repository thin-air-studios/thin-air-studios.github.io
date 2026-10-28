// The live-flights panel on an airport page: the pure parts, shared by the browser (flights-panel.mjs, served at /assets/site/flights/)
// and the tests (tools/site/flights.test.mjs). Nothing here touches the DOM. The panel's timing decisions (what a status means, when the
// next refresh is due, whether a refresh may start, what coming back to a visible tab does) are here too, so the tests pin them.
// The server is server/src/near.js: GET /v1/near?icao=XXXX. Its answer: { icao, busy, count, airborne, aircraft: [{ callsign, alt
// (feet, 'ground' or null), gs (knots or null), track, nm, approaching }], at, radiusNm, source: { name, licence, licenceUrl, link } }.
// The list is already in order (approaching, other airborne, then on the ground). An answer is never an error for a known airport.

export const API_BASE = 'https://api.playshortfinal.com';
export const REFRESH_MS = 60000; // one refresh a minute while the tab is visible
export const TIMEOUT_MS = 8000;
export const SHOWN = 10; // the panel's rows (the answer carries at most this many)
export const JUST_NOW_S = 45; // under this many seconds the panel says "just now"
const ICAO = /^[A-Z0-9]{4}$/;
// The credit the answer should always carry (ODbL 1.0). Used only when an answer leaves its source out, so the credit still shows.
const SOURCE_FALLBACK = Object.freeze({
  name: 'adsb.lol',
  licence: 'ODbL 1.0',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  link: 'https://www.adsb.lol',
});

/** The address of one airport's list. Throws for a code the server would refuse, so no request goes out for it. */
export function nearUrl(icao, base = API_BASE) {
  if (typeof icao !== 'string' || !ICAO.test(icao)) throw new RangeError('icao');
  return `${base}/v1/near?icao=${icao}`;
}

/** An https link from the answer, or null (a link that is not https is not shown). */
function httpsOr(value) {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value) ? value : null;
}

/** The credit's parts: the source's name, its licence and their links, from the answer (or the fallback when it has none). */
export function sourceOf(source) {
  const s = source && typeof source === 'object' ? source : {};
  const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : fallback);
  return {
    name: text(s.name, SOURCE_FALLBACK.name),
    licence: text(s.licence, SOURCE_FALLBACK.licence),
    licenceUrl: httpsOr(s.licenceUrl) || SOURCE_FALLBACK.licenceUrl,
    link: httpsOr(s.link) || SOURCE_FALLBACK.link,
  };
}

function rowOf(r) {
  const alt = r.alt === 'ground' ? 'ground' : Number.isFinite(r.alt) ? Math.round(r.alt) : null;
  return {
    callsign: typeof r.callsign === 'string' && r.callsign.trim() ? r.callsign.trim() : null,
    alt,
    gs: Number.isFinite(r.gs) ? Math.round(r.gs) : null,
    nm: Number.isFinite(r.nm) && r.nm >= 0 ? Math.round(r.nm * 10) / 10 : null,
    approaching: r.approaching === true && alt !== 'ground',
  };
}

/**
 * The answer as the panel shows it: { busy, count, airborne, at (ms, or null when there is no list), rows (at most SHOWN), source }.
 * Throws for an answer that is not the list for this airport, so the panel stays as it was.
 */
export function shapeNear(json, icao) {
  if (!json || typeof json !== 'object' || json.icao !== icao || !Array.isArray(json.aircraft)) throw new TypeError('near');
  const count = Number.isInteger(json.count) && json.count >= 0 ? json.count : json.aircraft.length;
  const airborne = Number.isInteger(json.airborne) && json.airborne >= 0 ? json.airborne : 0;
  const when = typeof json.at === 'string' ? Date.parse(json.at) : NaN;
  return {
    busy: json.busy === true,
    count,
    airborne,
    at: Number.isFinite(when) ? when : null,
    rows: json.aircraft.filter((r) => r && typeof r === 'object').slice(0, SHOWN).map(rowOf),
    source: sourceOf(json.source),
  };
}

/** Replaces {name} placeholders in a copy string; a placeholder with no value is left as it is. */
export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/** A whole number in the page's language (Intl), or '' for a value that is not a number. */
export function formatCount(n, lang) {
  return Number.isFinite(n) ? new Intl.NumberFormat(lang).format(n) : '';
}

/** One decimal place in the page's language, for distances in nautical miles. */
export function formatMiles(nm, lang) {
  return Number.isFinite(nm) ? new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(nm) : '';
}

/**
 * The text of one row: the callsign (or the unknown word), the altitude (feet, or the ground word, or '' when there is none), the speed
 * (knots, or ''), the distance (nautical miles, or '') and whether the badge shows. The unit words come from the copy, so a language
 * can order them as it likes.
 */
export function rowText(row, copy, lang) {
  return {
    callsign: row.callsign || copy.unknown,
    alt: row.alt === 'ground' ? copy.ground : row.alt === null ? '' : fill(copy.feet, { n: formatCount(row.alt, lang) }),
    speed: row.gs === null ? '' : fill(copy.knots, { n: formatCount(row.gs, lang) }),
    distance: row.nm === null ? '' : fill(copy.nm, { n: formatMiles(row.nm, lang) }),
    landing: row.approaching,
  };
}

/**
 * How long ago the list was read, as the value and unit Intl.RelativeTimeFormat takes (negative: in the past). Within
 * JUST_NOW_S seconds the caller shows its own "just now" text, so this returns null then.
 */
export function ageOf(atMs, nowMs) {
  const seconds = Math.round((nowMs - atMs) / 1000);
  if (!Number.isFinite(seconds) || seconds < JUST_NOW_S) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { value: -minutes, unit: 'minute' };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { value: -hours, unit: 'hour' };
  return { value: -Math.round(hours / 24), unit: 'day' };
}

/** "Updated 3 minutes ago" in the page's language (Intl.RelativeTimeFormat), or the copy's "just now" line. */
export function updatedText(atMs, nowMs, copy, lang) {
  const age = ageOf(atMs, nowMs);
  if (!age) return copy.updatedNow;
  const when = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(age.value, age.unit);
  return fill(copy.updated, { when });
}

/**
 * What the panel does with an answer's status: 'gone' (400 or 404: not an airport the game knows, so the panel stays hidden for good),
 * 'ok' (2xx), or 'fail' (anything else: a failed refresh keeps what is on the screen, and a failed first one keeps the panel hidden).
 */
export function statusOutcome(status) {
  if (status === 400 || status === 404) return 'gone';
  return status >= 200 && status < 300 ? 'ok' : 'fail';
}

/** The delay before the next refresh: a minute while the tab is visible and the panel is still in use; null when none is due. */
export function nextRefreshDelay({ visible, gone }) {
  return visible && !gone ? REFRESH_MS : null;
}

/** When a tab becomes visible again: 'refresh' at once when the list is a minute old (or there is none yet), else 'wait' for the rest. */
export function onVisibleAction(lastOkMs, nowMs) {
  return nowMs - lastOkMs >= REFRESH_MS ? 'refresh' : 'wait';
}

/** A refresh starts only when none is in flight and the panel has not been stopped. */
export function startAllowed({ inFlight, gone }) {
  return !inFlight && !gone;
}
