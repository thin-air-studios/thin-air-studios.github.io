// Tests for the live-flights panel: the pure browser helpers (site-src/flights/flights-core.mjs), the panel's markup
// (tools/site/lib/flightspanel.mjs), and the words in every language. Run: node --test tools/site/flights.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_BASE,
  REFRESH_MS,
  SHOWN,
  ageOf,
  fill,
  formatCount,
  formatMiles,
  nearUrl,
  nextRefreshDelay,
  onVisibleAction,
  rowText,
  shapeNear,
  sourceOf,
  startAllowed,
  statusOutcome,
  updatedText,
} from '../../site-src/flights/flights-core.mjs';
import { flightsEnabled, flightsPanel, RADIUS_NM } from './lib/flightspanel.mjs';
import { makeCopy } from './lib/airportcopy.mjs';

const TOOL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL, '..', '..');
const SRC = path.join(ROOT, 'site-src');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(SRC, rel), 'utf8'));
const copyEn = readJson('airports/copy.json');
const SOURCE = {
  name: 'adsb.lol',
  licence: 'ODbL 1.0',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  link: 'https://www.adsb.lol',
};
const LANGS = ['de', 'es', 'es-419', 'pt-br', 'fr', 'it', 'ja', 'ko', 'pl', 'tr', 'id', 'zh-tw'];
const NOW = Date.parse('2026-10-28T15:00:00Z');
const PLAY_SHAPE = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.thinaircapital\.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D[a-z0-9-]+(%26utm_content%3D[a-z0-9-]+)?$/;

// The copy the script reads, as the page's own lookup gives it (English, with the placeholders kept).
const scriptCopy = {
  landing: 'Landing',
  unknown: 'Unknown',
  ground: 'On the ground',
  feet: '{n} ft',
  knots: '{n} kt',
  nm: '{n} nm',
  liveData: 'Live data:',
  updated: 'Updated {when}',
  updatedNow: 'Updated just now',
  showing: 'Showing {shown} of {n}, flying aircraft first.',
};

const ac = (over = {}) => ({ callsign: 'AAL2387', alt: 1575, gs: 137, track: 180, nm: 5, approaching: true, ...over });

test('the list is asked for by airport code, on the API host, and nothing else', () => {
  assert.equal(nearUrl('KDFW'), `${API_BASE}/v1/near?icao=KDFW`);
  assert.throws(() => nearUrl('kdfw'), RangeError);
  assert.throws(() => nearUrl('KDFW1'), RangeError);
  assert.throws(() => nearUrl(undefined), RangeError);
});

test('an answer for another airport, or one that is not a list, is refused', () => {
  assert.throws(() => shapeNear({ icao: 'KDEN', aircraft: [] }, 'KDFW'), TypeError);
  assert.throws(() => shapeNear({ icao: 'KDFW', aircraft: 'x' }, 'KDFW'), TypeError);
  assert.throws(() => shapeNear(null, 'KDFW'), TypeError);
});

test('an answer is shown as its counts, its time and at most ten rows, in the order it came', () => {
  const aircraft = Array.from({ length: 13 }, (_, i) => ac({ callsign: `X${i}`, nm: i + 1 }));
  const view = shapeNear({ icao: 'KDFW', busy: false, count: 15, airborne: 11, aircraft, at: '2026-10-28T15:00:00Z', radiusNm: 40, source: SOURCE }, 'KDFW');
  assert.equal(view.count, 15);
  assert.equal(view.airborne, 11);
  assert.equal(view.rows.length, SHOWN);
  assert.equal(view.rows[0].callsign, 'X0');
  assert.equal(view.at, NOW);
  assert.equal(view.busy, false);
});

test('a busy answer with no list has no time, so the panel shows its busy note and no counts', () => {
  const view = shapeNear({ icao: 'KDFW', busy: true, count: 0, airborne: 0, aircraft: [], at: null }, 'KDFW');
  assert.equal(view.busy, true);
  assert.equal(view.at, null);
  assert.deepEqual(view.rows, []);
});

test('a row keeps the altitude (feet or ground), the speed, the distance and the landing flag, and drops what is not a number', () => {
  const view = shapeNear({ icao: 'KDFW', aircraft: [ac({ alt: 'ground', approaching: true }), ac({ callsign: null, alt: 2999.6, gs: null, nm: 'far' })] }, 'KDFW');
  assert.equal(view.rows[0].alt, 'ground');
  assert.equal(view.rows[0].approaching, false, 'a grounded aircraft is never landing');
  assert.equal(view.rows[1].callsign, null);
  assert.equal(view.rows[1].alt, 3000);
  assert.equal(view.rows[1].gs, null);
  assert.equal(view.rows[1].nm, null);
});

test('the credit names its source and licence from the answer; a missing or non-https link is not used', () => {
  assert.deepEqual(sourceOf(SOURCE), SOURCE);
  const fallback = sourceOf(undefined);
  assert.equal(fallback.name, 'adsb.lol', 'the credit still shows when an answer has no source');
  assert.equal(fallback.licence, 'ODbL 1.0');
  const odd = sourceOf({ name: 'adsb.lol', licence: 'ODbL 1.0', licenceUrl: 'http://insecure.example/', link: 'javascript:alert(1)' });
  assert.equal(odd.licenceUrl, SOURCE.licenceUrl);
  assert.equal(odd.link, SOURCE.link);
});

test('a row reads as the page shows it: an unknown callsign, feet with separators, knots, nautical miles, a landing badge', () => {
  const t = rowText(ac(), scriptCopy, 'en');
  assert.deepEqual(t, { callsign: 'AAL2387', alt: '1,575 ft', speed: '137 kt', distance: '5 nm', landing: true });
  const g = rowText({ callsign: null, alt: 'ground', gs: null, nm: 0.2, approaching: false }, scriptCopy, 'en');
  assert.deepEqual(g, { callsign: 'Unknown', alt: 'On the ground', speed: '', distance: '0.2 nm', landing: false });
  assert.equal(rowText(ac({ alt: null }), scriptCopy, 'de').alt, '');
  assert.equal(rowText(ac({ alt: 1575 }), scriptCopy, 'de').alt, '1.575 ft', 'German groups thousands with a point');
});

test('numbers follow the page language, and a distance keeps one decimal at most', () => {
  assert.equal(formatCount(1234567, 'en'), '1,234,567');
  assert.equal(formatCount('x', 'en'), '');
  assert.equal(formatMiles(1.64, 'en'), '1.6');
  assert.equal(formatMiles(5, 'en'), '5');
  assert.equal(fill('{n} ft', { n: '5' }), '5 ft');
  assert.equal(fill('{n} ft {when}', { n: '5' }), '5 ft {when}', 'a placeholder with no value is left for the reader to see');
});

test('the age of a list is in minutes, hours or days; under 45 seconds it is "just now"', () => {
  assert.equal(ageOf(NOW - 10000, NOW), null);
  assert.deepEqual(ageOf(NOW - 120000, NOW), { value: -2, unit: 'minute' });
  assert.deepEqual(ageOf(NOW - 3 * 3600000, NOW), { value: -3, unit: 'hour' });
  assert.deepEqual(ageOf(NOW - 2 * 86400000, NOW), { value: -2, unit: 'day' });
  assert.equal(ageOf(NaN, NOW), null);
});

test('"Updated" reads in the page language: English and German examples', () => {
  assert.equal(updatedText(NOW - 120000, NOW, scriptCopy, 'en'), 'Updated 2 minutes ago');
  assert.equal(updatedText(NOW, NOW, scriptCopy, 'en'), 'Updated just now');
  const de = readJson('i18n/airports-de.json');
  assert.equal(updatedText(NOW - 120000, NOW, { updated: de['flights.updated'], updatedNow: de['flights.updatedNow'] }, 'de'), 'Aktualisiert vor 2 Minuten');
});

test('the refresh is a minute, and the panel shows at most the rows the answer carries', () => {
  assert.equal(REFRESH_MS, 60000);
  assert.equal(SHOWN, 10);
});

test('an answer\'s status decides the panel: 400 and 404 stop it for good, other failures are retried, 2xx is shown', () => {
  assert.equal(statusOutcome(400), 'gone');
  assert.equal(statusOutcome(404), 'gone');
  assert.equal(statusOutcome(200), 'ok');
  assert.equal(statusOutcome(204), 'ok');
  for (const status of [301, 429, 500, 503]) assert.equal(statusOutcome(status), 'fail', `status ${status}`);
});

test('the next refresh is a minute away while the tab is visible and the panel is in use; nothing is due while it is hidden or stopped', () => {
  assert.equal(nextRefreshDelay({ visible: true, gone: false }), REFRESH_MS);
  assert.equal(nextRefreshDelay({ visible: false, gone: false }), null, 'a hidden tab asks for nothing');
  assert.equal(nextRefreshDelay({ visible: true, gone: true }), null, 'a stopped panel asks for nothing');
});

test('a visible tab that was away for a minute refreshes at once; a shorter absence waits out the rest of the minute', () => {
  assert.equal(onVisibleAction(0, NOW), 'refresh', 'no list yet: ask now');
  assert.equal(onVisibleAction(NOW, NOW + REFRESH_MS - 1), 'wait');
  assert.equal(onVisibleAction(NOW, NOW + REFRESH_MS), 'refresh');
});

test('no refresh starts while one is in flight, or once the panel has stopped', () => {
  assert.equal(startAllowed({ inFlight: false, gone: false }), true);
  assert.equal(startAllowed({ inFlight: true, gone: false }), false, 'one request at a time');
  assert.equal(startAllowed({ inFlight: false, gone: true }), false);
});

test('every language has every panel word the English copy has, with the same placeholders', () => {
  const en = Object.keys(copyEn).filter((k) => k.startsWith('flights.'));
  assert.ok(en.length >= 18, `English panel words: ${en.length}`);
  for (const code of LANGS) {
    const dict = readJson(`i18n/airports-${code}.json`);
    for (const key of en) {
      assert.ok(typeof dict[key] === 'string' && dict[key].length, `${code} is missing ${key}`);
      const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      assert.equal(holes(dict[key]), holes(copyEn[key]), `${code} ${key} placeholders`);
    }
  }
});

test('the panel is off with the flag: no markup', () => {
  const t = makeCopy(copyEn);
  assert.equal(flightsEnabled({ features: { liveFlights: false } }), false);
  assert.equal(flightsPanel({ config: { features: { liveFlights: false } }, t, icao: 'KDFW', where: 'Dallas', playKey: 'airport-kdfw' }), '');
});

test('the panel is hidden until it has data, names the place, and carries the Play link with its campaign', () => {
  const config = { features: { liveFlights: true } };
  const out = flightsPanel({ config, t: makeCopy(copyEn), icao: 'KDFW', where: 'Dallas', playKey: 'airport-kdfw' }).value;
  assert.match(out, /<section class="section flights" id="flights" aria-labelledby="flights-title" data-flights data-icao="KDFW" data-radius="40" hidden>/);
  assert.ok(out.includes('Flying near Dallas right now'), 'the heading names the city');
  assert.ok(out.includes('data-flights-sentinel'), 'a sentinel comes before the panel for the early start');
  assert.equal(RADIUS_NM, 40);
  const href = out.match(/href="([^"]*play\.google[^"]*)"/)[1].replace(/&amp;/g, '&');
  assert.match(href, PLAY_SHAPE);
  assert.ok(href.endsWith('%26utm_content%3Dflights'));
  assert.ok(out.includes('data-ev-airport="KDFW"'));
  const block = out.match(/<script type="application\/json" id="flights-copy">([\s\S]*?)<\/script>/)[1];
  const words = JSON.parse(block);
  assert.equal(words.feet, '{n} ft', 'placeholders stay for the script');
  assert.equal(words.updated, 'Updated {when}');
  assert.deepEqual(Object.keys(words).sort(), Object.keys(scriptCopy).sort());
  assert.ok(out.includes('<script type="module" src="/assets/site/flights/flights.mjs">'), 'the one script is the loader');
  assert.ok(!out.includes('flights.css') && !out.includes('<link'), 'the stylesheet comes from the loader, not the markup');
});

test('a local page gets the same panel in its own language, from its dictionary', () => {
  const dict = readJson('i18n/airports-de.json');
  const t = (key, vars = {}) => dict[key].replace(/\{(\w+)\}/g, (_, n) => String(vars[n]));
  const out = flightsPanel({ config: { features: { liveFlights: true } }, t, icao: 'EDDF', where: 'Frankfurt am Main', playKey: 'airport-eddf-de' }).value;
  assert.ok(out.includes('Gerade im Umkreis von Frankfurt am Main unterwegs'));
  assert.ok(out.includes('utm_campaign%3Dairport-eddf-de%26utm_content%3Dflights'));
});

test('the panel markup has no inline script, and only one module script', () => {
  const out = flightsPanel({ config: { features: { liveFlights: true } }, t: makeCopy(copyEn), icao: 'KDFW', where: 'Dallas', playKey: 'airport-kdfw' }).value;
  assert.equal([...out.matchAll(/<script>/g)].length, 0);
  assert.equal([...out.matchAll(/<script type="module"/g)].length, 1);
});
