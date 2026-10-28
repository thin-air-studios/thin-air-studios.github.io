// Tests for the website generator and its output. Run: node --test tools/site/site.test.mjs
// The first test builds the site in place (the build is deterministic); the rest read the result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionaries, makeT } from './lib/i18n.mjs';
import { pages as challengePages } from './pages/challenge.mjs';
import { pages as headerPages } from './pages/headers.mjs';
import { pages as flightPages } from './pages/flights.mjs';
import worker, { originPath, isChallengePath } from '../edge/worker.js';

const TOOL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL, '..', '..');
const SRC = path.join(ROOT, 'site-src');
const FILE_BUDGET = 18000;
const DOMAIN = 'https://playshortfinal.com';
const config = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, '.generated.json'), 'utf8')).files;
const NOINDEX_ALLOWED = new Set(['404.html']);
// Thin airport and country pages are noindex on purpose (airports.mjs, rules.json): every page under airports/ may be noindex.
// The challenge board page (c/, 3.4) is noindex by design: one template for every /c/<id>/ address.
const NOINDEX_PREFIX_ALLOWED = ['airports/', 'c/'];
const ASSET_PREFIX_OK = /^assets\/site\//;

// The owner name is spelled in pieces so that this file never contains it whole.
const PERSONAL = new RegExp("\\b" + "to" + "dd\\b|" + "wise" + "man", "i");
// The forbidden words are spelled in pieces so that this file never contains them whole.
const AI_NAMES = new RegExp('\\b(' + ['cl' + 'aude', 'anth' + 'ropic', 'open' + 'ai', 'chat' + 'gpt', 'g' + 'pt', 'gem' + 'ini', 'll' + 'ama', 'mis' + 'tral', 'cop' + 'ilot', 'assist' + 'ant'].join('|') + ')\\b|\\bAI\\b', 'i');
const MACHINE_PATH = /(^|[\s"'(=,`])\/(tmp|home|root|Users|var|mnt|private)\//m;
const TEXT_EXT = /\.(html|xml|txt|css|js|json|md|mjs|svg)$/;

// Airport names, cities and codes are data, not our wording: a place or code that spells a forbidden word (a place name, an airport
// code or a country code) is not a breach. Those exact words are removed before the name checks run.
const DATA_WORDS = (() => {
  const words = new Set();
  const rows = JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'airports.json'), 'utf8'));
  for (const r of rows) for (const w of [r[0], r[1], r[2], r[3], r[4]]) if (w && (PERSONAL.test(w) || AI_NAMES.test(w))) words.add(w);
  return [...words].sort((a, b) => b.length - a.length);
})();
const DATA_WORDS_RE = DATA_WORDS.length ? new RegExp(`\\b(?:${DATA_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g') : null;
const withoutDataWords = (doc) => (DATA_WORDS_RE ? doc.replace(DATA_WORDS_RE, ' ') : doc);

function walkAll(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function text(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Source files we write: site-src (text only, no data copies or fonts), tools/site and the docs. */
function ownSourceFiles() {
  const fromSrc = walkAll(SRC).map((f) => `site-src/${f}`).filter((f) => TEXT_EXT.test(f) && !f.startsWith('site-src/data/') && !f.startsWith('site-src/assets/fonts/'));
  const fromTool = walkAll(TOOL).map((f) => `tools/site/${f}`).filter((f) => TEXT_EXT.test(f) && f !== "tools/site/site.test.mjs"); // the rules themselves are not scanned
  return [...fromSrc, ...fromTool];
}

const ownText = () => manifest.filter((f) => TEXT_EXT.test(f));
const ownHtml = () => manifest.filter((f) => f.endsWith('.html'));

test('the build runs, and a second run changes nothing', () => {
  const first = spawnSync(process.execPath, [path.join(TOOL, 'build.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const check = spawnSync(process.execPath, [path.join(TOOL, 'build.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('every file in the manifest exists and is one we make', () => {
  for (const rel of manifest) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    assert.ok(rel === '404.html' || rel === 'index.html' || rel === 'robots.txt' || rel === '_headers' || rel === '_redirects' || rel.startsWith('sitemap') || rel.startsWith('assets/site/') || rel.endsWith('/index.html'), `unexpected owned path ${rel}`);
  }
  assert.ok(manifest.every((f) => ASSET_PREFIX_OK.test(f) || !f.startsWith('assets/')), 'assets are only under assets/site/');
});

test('no personal name in anything we write', () => {
  for (const rel of [...ownText(), ...ownSourceFiles()]) {
    assert.ok(!PERSONAL.test(withoutDataWords(text(rel))), `personal name in ${rel}`);
    assert.ok(!PERSONAL.test(rel), `personal name in a file name: ${rel}`);
  }
});

test('no AI, assistant or model names in anything we write', () => {
  for (const rel of [...ownText(), ...ownSourceFiles()]) {
    const found = withoutDataWords(text(rel)).match(AI_NAMES);
    assert.equal(found, null, `AI or model name "${found && found[0]}" in ${rel}`);
  }
});

test('no absolute machine paths in anything we write', () => {
  for (const rel of [...ownText(), ...ownSourceFiles()]) {
    assert.ok(!MACHINE_PATH.test(text(rel)), `machine path in ${rel}`);
  }
});

test('the total tracked file count stays under the Cloudflare limit', () => {
  const count = walkAll(ROOT).length;
  assert.ok(count < FILE_BUDGET, `${count} files, budget ${FILE_BUDGET}`);
});

test('every page has a title, a description and a canonical on the domain', () => {
  for (const rel of ownHtml()) {
    const doc = text(rel);
    if (/<meta name="robots" content="noindex/.test(doc)) {
      assert.ok(NOINDEX_ALLOWED.has(rel) || NOINDEX_PREFIX_ALLOWED.some((p) => rel.startsWith(p)), `${rel} is noindex but not on the allowed list`);
      continue;
    }
    const title = doc.match(/<title>([^<]*)<\/title>/);
    assert.ok(title && title[1].trim().length > 0, `no title in ${rel}`);
    assert.ok(title[1].length <= 70, `title too long in ${rel} (${title[1].length})`);
    const desc = doc.match(/<meta name="description" content="([^"]*)"/);
    assert.ok(desc && desc[1].length >= 50 && desc[1].length <= 170, `description length in ${rel}`);
    const canon = doc.match(/<link rel="canonical" href="([^"]*)"/);
    assert.ok(canon && canon[1].startsWith(`${DOMAIN}/`), `canonical missing or off-domain in ${rel}`);
    const expected = rel === 'index.html' ? `${DOMAIN}/` : `${DOMAIN}/${rel.replace(/index\.html$/, '')}`;
    assert.equal(canon[1], expected, `canonical does not match the file in ${rel}`);
  }
});

test('JSON-LD blocks parse and carry a schema.org context', () => {
  for (const rel of ownHtml()) {
    const blocks = [...text(rel).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const [, body] of blocks) {
      const obj = JSON.parse(body);
      assert.equal(obj['@context'], 'https://schema.org', `context in ${rel}`);
    }
  }
});

test('internal links and images resolve to files', () => {
  for (const rel of ownHtml()) {
    for (const [, target] of text(rel).matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
      const clean = target.split(/[?#]/)[0];
      if (clean === '/' || clean === '') continue;
      const onDisk = path.join(ROOT, clean);
      const ok = fs.existsSync(onDisk) || (clean.endsWith('/') && fs.existsSync(path.join(onDisk, 'index.html')));
      assert.ok(ok, `${rel} links to ${target}, which does not exist`);
    }
  }
});

test('every Play link uses the referrer format for the page', () => {
  const pattern = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.thinaircapital\.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D[a-z0-9-]+(%26utm_content%3D[a-z0-9-]+)?$/;
  for (const rel of ownHtml()) {
    for (const [, href] of text(rel).matchAll(/href="(https:\/\/play\.google\.com[^"]*)"/g)) {
      const unescaped = href.replace(/&amp;/g, '&');
      assert.ok(pattern.test(unescaped), `bad Play link in ${rel}: ${href}`);
    }
  }
});

test('every page with alternates lists itself and x-default', () => {
  for (const rel of ownHtml()) {
    const doc = text(rel);
    const alts = [...doc.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)];
    if (!alts.length) continue;
    const canon = doc.match(/<link rel="canonical" href="([^"]*)"/);
    assert.ok(alts.some(([, , href]) => href === canon[1]), `${rel} alternates do not include its own URL`);
    assert.ok(alts.some(([, lang]) => lang === 'x-default'), `${rel} alternates have no x-default`);
  }
});

test('the robots file keeps the Perplexity block and names the sitemap', () => {
  const robots = text('robots.txt');
  assert.match(robots, /User-agent: PerplexityBot\nUser-agent: Perplexity-User\nDisallow: \/\n/);
  assert.match(robots, /^Sitemap: https:\/\/playshortfinal\.com\/sitemap\.xml$/m);
});

test('the sitemap index lists section sitemaps that exist, and every URL is a real page', () => {
  const index = text('sitemap.xml');
  for (const [, loc] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const rel = loc.replace(DOMAIN + '/', '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `sitemap index lists missing ${rel}`);
    for (const [, url] of text(rel).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const local = url.replace(DOMAIN, '');
      const file = local.endsWith('/') ? `${local.slice(1)}index.html` : local.slice(1);
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${rel} lists ${url}, which has no page`);
    }
  }
});

test('colour pairs meet WCAG AA in light and dark', () => {
  const css = text('site-src/assets/site.css');
  const block = (selector) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `no block ${selector}`);
    const open = css.indexOf('{', start);
    return css.slice(open + 1, css.indexOf('}', open));
  };
  const read = (body) => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  const light = read(block(':root {'));
  const dark = read(block(':root[data-theme="dark"]'));
  const resolve = (tokens, value) => {
    let v = value;
    for (let i = 0; i < 5 && /var\(--/.test(v); i++) v = v.replace(/var\(--([a-z0-9-]+)\)/g, (_, k) => tokens[k] || `var(--${k})`);
    return v;
  };
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [['text', 'bg', 4.5], ['text-soft', 'bg', 4.5], ['accent', 'bg', 4.5], ['text', 'surface', 4.5], ['text-soft', 'surface', 4.5], ['accent', 'surface', 4.5], ['link', 'bg', 4.5], ['cta-ink', 'cta', 4.5], ['hero-text', 'hero-bg', 4.5], ['focus', 'bg', 3]];
  for (const [label, tokens] of [['light', light], ['dark', dark]]) {
    const all = { ...light, ...tokens };
    for (const [fg, bg, min] of pairs) {
      const a = resolve(all, all[fg]);
      const b = resolve(all, all[bg]);
      if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) continue;
      assert.ok(ratio(a, b) >= min, `${label}: ${fg} ${a} on ${bg} ${b} is ${ratio(a, b).toFixed(2)}, need ${min}`);
    }
  }
});

test('the stylesheet braces balance and no token is left undefined', () => {
  const css = text('site-src/assets/site.css');
  assert.equal(css.split('{').length, css.split('}').length, 'unbalanced braces');
  assert.ok(!/var\(--undefined/.test(css));
});

test('config flags exist for the events and features the copy depends on', () => {
  for (const key of ['weekend', 'thanksgiving', 'santa']) assert.equal(typeof config.events[key].live, 'boolean');
  for (const key of ['challengeLinks', 'challengeBoards', 'airportBoards', 'liveFlights']) assert.equal(typeof config.features[key], 'boolean');
  assert.equal(config.domain, DOMAIN);
  assert.equal(config.email, 'thinaircapital@gmail.com');
});

test('legacy pages we did not build are scanned too (reported, not failed)', (t) => {
  const legacy = ['privacy/index.html', 'terms/index.html', 'play/index.html', 'delete/index.html', 'demo/index.html', 'demo/js/config.js'];
  for (const rel of legacy) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const doc = text(rel);
    if (PERSONAL.test(doc)) t.diagnostic(`legacy name found in ${rel} (built by another repository; fix there)`);
    // the terms' prohibited use ("use it to train AI") is the generic word, not a product we name: that phrase is set aside here
    if (AI_NAMES.test(doc.replace(/\btrain AI\b/g, ' '))) t.diagnostic(`AI or model name found in ${rel} (built by another repository; fix there)`);
  }
  assert.ok(true);
});

// ---------- the challenge board page, the Worker's rule and the live-flights panel (3.4) ----------

const PLAY_SHAPE = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.thinaircapital\.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D[a-z0-9-]+(%26utm_content%3D[a-z0-9-]+)?$/;
const dicts = loadDictionaries(SRC, config.languages);
const withFlags = (flags) => ({ root: ROOT, config: { ...config, features: { ...config.features, ...flags } }, t: makeT(dicts, new Set()), data: {}, previous: [] });
const challengeFiles = ['/assets/site/challenge/board-core.mjs', '/assets/site/challenge/board.mjs', '/assets/site/challenge/board.css'];

test('the challenge board page is written only when its flag is on, with its three files', async () => {
  assert.deepEqual(await challengePages(withFlags({ challengeBoards: false })), []);
  const on = await challengePages(withFlags({ challengeBoards: true }));
  assert.deepEqual(on.map((o) => o.path), ['/c/', ...challengeFiles]);
  assert.equal(on[0].noindex, true);
});

test('the board page is noindex with no canonical, and its own markup sends no events and calls no sfTrack', async () => {
  const [page] = await challengePages(withFlags({ challengeBoards: true }));
  const doc = page.html.value;
  assert.match(doc, /<meta name="robots" content="noindex, follow">/);
  assert.ok(!/<link rel="canonical"/.test(doc), 'a noindex page has no canonical');
  const own = doc.slice(doc.indexOf('data-challenge'), doc.indexOf('</main>'));
  assert.ok(own.length > 500, 'the page content was found');
  assert.ok(!own.includes('data-event'), 'no data-event on the board content (site-wide header and footer only)');
  assert.ok(!own.includes('sfTrack'));
  for (const f of ['board-core.mjs', 'board.mjs']) assert.ok(!fs.readFileSync(path.join(SRC, 'challenge', f), 'utf8').includes('sfTrack'), f);
  // og:url would name the template's path (/c/), not the board the visitor shared: a link preview would point at the template.
  assert.ok(!/property="og:url"/.test(doc), 'no og:url on the board page');
});

test('the board page makes one request, the board address for the id in its own path, and no airport index', () => {
  const core = fs.readFileSync(path.join(SRC, 'challenge', 'board-core.mjs'), 'utf8');
  const script = fs.readFileSync(path.join(SRC, 'challenge', 'board.mjs'), 'utf8');
  assert.ok(core.includes('`${base}/v1/board?board=challenge&id=${id}`'));
  assert.ok(script.includes('idFromPath(location.pathname)') && script.includes('boardUrl(id)'));
  assert.equal([...script.matchAll(/fetch\(/g)].length, 1, 'the board is the only request: the airport index (1.7 MB) is not fetched for a name');
  assert.ok(!script.includes('airports-index'), 'no airport index on the board page');
});

test('every word in the board copy is read by the page (no dead keys for translators), and the rank word is read out inside the rank', () => {
  const copy = JSON.parse(fs.readFileSync(path.join(SRC, 'challenge', 'copy.json'), 'utf8'));
  const used = [path.join(SRC, 'challenge', 'board.mjs'), path.join(TOOL, 'pages', 'challenge.mjs')].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const key of Object.keys(copy).filter((k) => k !== '_about')) {
    assert.match(used, new RegExp(`copy\\.${key}\\b`), `copy key "${key}" is never read`);
  }
  const script = fs.readFileSync(path.join(SRC, 'challenge', 'board.mjs'), 'utf8');
  assert.ok(!script.includes('aria-label'), 'no aria-label on the rank span: ARIA does not allow naming a generic element');
  assert.ok(script.includes("'sr-only'"), 'the rank word is read out through sr-only text');
});

test('every Play link on the board page has the referrer shape and the page campaign', async () => {
  const [page] = await challengePages(withFlags({ challengeBoards: true }));
  const hrefs = [...page.html.value.matchAll(/href="(https:\/\/play\.google\.com[^"]*)"/g)].map(([, h]) => h.replace(/&amp;/g, '&'));
  assert.ok(hrefs.length >= 3, `Play links on the board: ${hrefs.length}`);
  for (const h of hrefs) assert.match(h, PLAY_SHAPE);
  assert.ok(hrefs.every((h) => h.includes('utm_campaign%3Dchallenge')));
});

test('the Worker\'s rule: every challenge address reads the one template; any other path is left as it is', () => {
  assert.equal(originPath('/c/k7m2q4xvbn3s/'), '/c/');
  assert.equal(originPath('/c/k7m2q4xvbn3s'), '/c/');
  assert.equal(originPath('/c/k7m2q4xvbn31/'), '/c/', 'the Worker takes any twelve characters; the page checks the id');
  assert.equal(originPath('/c/k7m2q4xvbn3/'), '/c/k7m2q4xvbn3/', 'eleven characters are not a challenge');
  assert.equal(originPath('/c/short/'), '/c/short/');
  assert.equal(originPath('/airports/kdfw/'), '/airports/kdfw/');
  assert.equal(isChallengePath('/c/k7m2q4xvbn3s/'), true);
  assert.equal(isChallengePath('/c/k7m2q4xvbn3s/x'), false);
});

test('the Worker answers a challenge address with the template, keeps the address, and never hands over the origin\'s 404 for the id', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  try {
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      if (String(url) === 'https://thin-air-studios.github.io/c/') return new Response('<!doctype html><title>board</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-served-by': 'origin' } });
      return new Response('origin 404', { status: 404 });
    };
    const res = await worker.fetch(new Request('https://playshortfinal.com/c/k7m2q4xvbn3s/?a=KDFW&s=412'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.equal(res.headers.get('x-served-by'), null, 'origin headers that are not ours are dropped');
    assert.ok(res.headers.get('strict-transport-security'), 'security headers are added');
    assert.deepEqual(asked, ['https://thin-air-studios.github.io/c/'], 'the origin is asked for the template, without the id or the query');
    assert.match(await res.text(), /board/);

    asked.length = 0;
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      return String(url).endsWith('/404.html') ? new Response('site 404', { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('origin 404', { status: 404 });
    };
    const missing = await worker.fetch(new Request('https://playshortfinal.com/c/k7m2q4xvbn3s/'));
    assert.equal(missing.status, 404);
    assert.deepEqual(asked, ['https://thin-air-studios.github.io/c/', 'https://thin-air-studios.github.io/404.html']);
    assert.equal(await missing.text(), 'site 404', 'the site\'s own 404 page, not the origin\'s');

    asked.length = 0;
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      return new Response('ok', { status: 200 });
    };
    await worker.fetch(new Request('https://playshortfinal.com/airports/kdfw/?x=1'));
    assert.deepEqual(asked, ['https://thin-air-studios.github.io/airports/kdfw/?x=1']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the Content-Security-Policy lists the API only on the pages that read it, and only when their flag is on', async () => {
  const board = { meta: { kind: 'html', path: '/c/', noindex: true }, bytes: '<html></html>' };
  const airport = { meta: { kind: 'html', path: '/airports/kdfw/', noindex: false }, bytes: '<html></html>' };
  const headersFor = async (flags) => {
    const [h] = await headerPages({ root: ROOT, config: { ...config, features: { ...config.features, ...flags } }, previous: [board, airport] });
    return h.content;
  };
  const cspOf = (text, pattern) => {
    const lines = text.split('\n');
    const i = lines.indexOf(pattern);
    assert.ok(i >= 0, `no block for ${pattern}`);
    return lines[i + 1];
  };
  const off = await headersFor({ challengeBoards: false, liveFlights: false, airportBoards: false });
  assert.ok(!cspOf(off, '/airports/*').includes('api.playshortfinal.com'), 'airport pages: no API with the flags off');
  const flightsOn = await headersFor({ challengeBoards: false, liveFlights: true, airportBoards: false });
  assert.ok(cspOf(flightsOn, '/airports/*').includes('https://api.playshortfinal.com'), 'airport pages: the API with the live-flights panel');
  const boardOn = await headersFor({ challengeBoards: true, liveFlights: false, airportBoards: false });
  assert.ok(cspOf(boardOn, '/c/*').includes('https://api.playshortfinal.com'), 'the board page reads the API');
  assert.ok(!cspOf(boardOn, '/airports/*').includes('api.playshortfinal.com'), 'the board flag does not widen the airport pages');
});

test('the live-flights files are written only when its flag is on; the loader asks for nothing, the panel asks for the list once and sends no events', async () => {
  assert.deepEqual(await flightPages(withFlags({ liveFlights: false })), []);
  const on = await flightPages(withFlags({ liveFlights: true }));
  assert.deepEqual(on.map((o) => o.path), ['/assets/site/flights/flights.mjs', '/assets/site/flights/flights-panel.mjs', '/assets/site/flights/flights-core.mjs', '/assets/site/flights/flights.css']);
  const loader = fs.readFileSync(path.join(SRC, 'flights', 'flights.mjs'), 'utf8');
  const panel = fs.readFileSync(path.join(SRC, 'flights', 'flights-panel.mjs'), 'utf8');
  for (const script of [loader, panel]) assert.ok(!script.includes('sfTrack'), 'no analytics calls');
  assert.equal([...loader.matchAll(/fetch\(/g)].length, 0, 'the loader asks for nothing: it only waits for the panel and loads the rest');
  assert.ok(loader.includes('IntersectionObserver') && loader.includes("import(new URL('./flights-panel.mjs', import.meta.url)"), 'the loader loads the panel when it nears the screen');
  assert.equal([...panel.matchAll(/fetch\(/g)].length, 1, 'one request: the airport list');
  assert.ok(panel.includes('visibilityState'), 'the refresh looks at the tab before it asks');
});

test('the airport pages carry no panel stylesheet in their head: the loader adds it when the panel nears the screen', () => {
  for (const rel of ['pages/airports.mjs', 'lib/localairports.mjs']) {
    assert.ok(!fs.readFileSync(path.join(TOOL, rel), 'utf8').includes('flightsHeadLink'), `${rel} still links the panel stylesheet in the head`);
  }
});

test('the built files match the flags: the board page and the flights files exist only when their flag is on', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'c', 'index.html')), config.features.challengeBoards === true);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'site', 'flights', 'flights.mjs')), config.features.liveFlights === true);
  for (const rel of ['sitemap-airports.xml', 'sitemap-home.xml', 'sitemap-guides.xml', 'sitemap-events.xml', 'sitemap-press.xml', 'sitemap-about.xml', 'sitemaps/pages.xml']) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) assert.ok(!/playshortfinal\.com\/c\//.test(fs.readFileSync(file, 'utf8')), `${rel} lists the board page`);
  }
});
