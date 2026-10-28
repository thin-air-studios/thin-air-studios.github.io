// Tests for the airport pages, the hubs, the sitemaps and the host files. Run: node --test tools/site/airports.test.mjs
// These read the built tree (run node tools/site/build.mjs first; the first test checks that it is current).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL, '..', '..');
const DOMAIN = 'https://playshortfinal.com';
const PAGE_BUDGET = 60 * 1024;
const FILE_BUDGET = 18000;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = JSON.parse(read('site-src/.generated.json')).files;
const data = JSON.parse(read('site-src/data/airports.json'));
const demoRows = JSON.parse(read('demo/data/airports.json'));
const countBy = new Map();
for (const r of data) countBy.set(r[0], (countBy.get(r[0]) || 0) + 1);
const mapCodes = [...new Set(fs.readdirSync(path.join(ROOT, 'osm'))
  .map((f) => f.replace(/\.json(\.gz)?$/, ''))
  .filter((c) => /^[A-Z0-9]{3,4}$/.test(c)))];
const demoCodes = new Set(demoRows.map((r) => r[0]));
const expectedPages = mapCodes.filter((c) => demoCodes.has(c) && countBy.get(c) === 1).sort();

const airportFiles = manifest.filter((f) => /^airports\/[a-z0-9-]+\/index\.html$/.test(f));
const airportPageFiles = airportFiles.filter((f) => /class="page-airport"/.test(read(f)));
const countryFiles = airportFiles.filter((f) => /class="page-country"/.test(read(f)));
const isNoindex = (doc) => /<meta name="robots" content="noindex/.test(doc);
const urlOf = (rel) => (rel === 'index.html' ? `${DOMAIN}/` : `${DOMAIN}/${rel.replace(/index\.html$/, '')}`);

/** A small well-formedness check for XML and SVG: tags balance, attributes are quoted, and no bare ampersand. */
function wellFormed(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const stack = [];
  let pos = 0;
  for (const m of body.matchAll(/<[^>]*>/g)) {
    const text = body.slice(pos, m.index);
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(text)) return `bare ampersand near "${text.slice(0, 40)}"`;
    pos = m.index + m[0].length;
    const tag = m[0];
    if (tag.startsWith('</')) {
      const name = tag.slice(2, -1).trim();
      if (stack.pop() !== name) return `unexpected close tag ${tag}`;
    } else if (!tag.endsWith('/>')) {
      const name = /^<([^\s>]+)/.exec(tag)[1];
      stack.push(name);
    }
    const attrs = tag.replace(/^<[^\s>]+/, '');
    if (/=[^"'\s>/]/.test(attrs.replace(/="[^"]*"|='[^']*'/g, ''))) return `unquoted attribute in ${tag.slice(0, 60)}`;
  }
  return stack.length ? `unclosed ${stack.join(',')}` : '';
}

test('the generated files are current (build --check passes)', () => {
  const check = spawnSync(process.execPath, [path.join(TOOL, 'build.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('one page per airport with a map and a row in the game list (SD24 is excluded: two airports share its code)', () => {
  assert.equal(airportPageFiles.length, expectedPages.length, `pages ${airportPageFiles.length}, expected ${expectedPages.length}`);
  const made = new Set(airportPageFiles.map((f) => f.split('/')[1].toUpperCase()));
  assert.deepEqual([...made].sort(), expectedPages);
  assert.ok(!made.has('SD24'), 'SD24 has two rows and gets no page');
});

test('every airport page is under 60 KB, and the map is inline SVG under 30 KB', () => {
  for (const f of airportPageFiles) {
    const bytes = fs.statSync(path.join(ROOT, f)).size;
    assert.ok(bytes < PAGE_BUDGET, `${f} is ${bytes} bytes`);
    const svg = /<svg[\s\S]*?<\/svg>/.exec(read(f));
    if (svg) assert.ok(Buffer.byteLength(svg[0]) < 30 * 1024, `${f} map is ${Buffer.byteLength(svg[0])} bytes`);
  }
});

test('every map SVG is well formed, its paths use only path commands, and its viewBox is set', () => {
  for (const f of airportPageFiles) {
    const doc = read(f);
    const svg = /<svg[\s\S]*?<\/svg>/.exec(doc);
    if (!svg) continue;
    assert.equal(wellFormed(svg[0]), '', `${f} SVG`);
    assert.match(svg[0], /viewBox="0 0 \d+ \d+"/, `${f} viewBox`);
    for (const [, d] of svg[0].matchAll(/ d="([^"]*)"/g)) {
      assert.match(d, /^[MmLlHhVvZzCcSs0-9 .,-]+$/, `${f} path data`);
    }
  }
});

test('the airport pages carry valid JSON-LD: Airport and BreadcrumbList, with the fields the page shows', () => {
  for (const f of airportPageFiles) {
    const blocks = [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, b]) => JSON.parse(b));
    const airport = blocks.find((b) => b['@type'] === 'Airport');
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(airport, `${f} has no Airport`);
    assert.ok(crumbs, `${f} has no BreadcrumbList`);
    assert.equal(airport['@context'], 'https://schema.org', f);
    assert.ok(airport.name && airport.icaoCode && airport.url && airport.geo, `${f} Airport fields`);
    assert.equal(crumbs.itemListElement.length, 4, `${f} breadcrumb depth`);
    crumbs.itemListElement.forEach((item, i) => {
      assert.equal(item.position, i + 1, f);
      assert.match(item.item, new RegExp(`^${DOMAIN}/`), f);
    });
  }
});

test('canonical URLs match the page path on the domain, and noindex pages have no canonical', () => {
  for (const f of [...airportPageFiles, ...countryFiles, 'airports/index.html']) {
    const doc = read(f);
    const canon = /<link rel="canonical" href="([^"]*)"/.exec(doc);
    if (isNoindex(doc)) {
      assert.equal(canon, null, `${f} is noindex but has a canonical`);
      continue;
    }
    assert.ok(canon, `${f} has no canonical`);
    assert.equal(canon[1], urlOf(f), `${f} canonical`);
  }
});

test('thin airport pages are noindex and still linked from other pages', () => {
  const thin = airportPageFiles.filter((f) => isNoindex(read(f)));
  assert.ok(thin.length > 0 && thin.length < 50, `thin airport pages: ${thin.length}`);
  const linked = new Set();
  for (const f of airportPageFiles) {
    for (const [, href] of read(f).matchAll(/href="\/airports\/([a-z0-9-]+)\/"/g)) linked.add(href);
  }
  for (const f of thin) assert.ok(linked.has(f.split('/')[1]), `${f} has no link from any airport page`);
});

test('no broken links on the airport pages: nearby, route and country links all resolve', () => {
  for (const f of [...airportPageFiles, ...countryFiles, 'airports/index.html']) {
    for (const [, target] of read(f).matchAll(/href="(\/[^"#?]*)/g)) {
      if (target === '/' || target.startsWith('/assets/')) continue;
      const file = target.endsWith('/') ? path.join(ROOT, target.slice(1), 'index.html') : path.join(ROOT, target.slice(1));
      assert.ok(fs.existsSync(file), `${f} links to ${target}, which does not exist`);
    }
  }
});

test('nearby links: 5 to 8 per airport page, each to another airport page, by distance', () => {
  for (const f of airportPageFiles) {
    const chips = [...read(f).matchAll(/<a class="chip" href="\/airports\/([a-z0-9-]+)\/"/g)].map(([, c]) => c);
    assert.ok(chips.length >= 5 && chips.length <= 8, `${f} has ${chips.length} nearby links`);
    assert.ok(!chips.includes(f.split('/')[1]), `${f} links to itself`);
  }
});

test('every Play link on an airport page carries its own campaign and a known position', () => {
  for (const f of airportPageFiles) {
    const code = f.split('/')[1];
    for (const [, href] of read(f).matchAll(/href="(https:\/\/play\.google\.com[^"]*)"/g)) {
      // the top-controllers panel (features.airportBoards) has its own campaign, board-<code> (ANALYTICS.md); every other link airport-<code>
      const key = href.endsWith('utm_content%3Dboard') ? `board-${code}` : `airport-${code}`;
      assert.ok(href.includes(`utm_campaign%3D${key}%26`) || href.endsWith(`utm_campaign%3D${key}`), `${f} campaign in ${href}`);
      assert.match(href, /utm_content%3D(hero|footer-cta|header|menu|footer|board|flights)$/, `${f} position`);
    }
  }
});

test('sitemaps: the index and every sitemap are well formed; together they list every indexable page exactly once', () => {
  const index = read('sitemap.xml');
  assert.equal(wellFormed(index), '', 'sitemap.xml');
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc.replace(DOMAIN + '/', ''));
  assert.ok(sitemaps.length >= 2, 'the index lists sitemaps');
  const listed = [];
  for (const rel of sitemaps) {
    assert.match(rel, /^sitemaps\/[a-z0-9-]+\.xml$/, `sitemap name ${rel}`);
    const xml = read(rel);
    assert.equal(wellFormed(xml), '', `${rel} is not well formed`);
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => body);
    assert.ok(urls.length <= 45000, `${rel} has ${urls.length} URLs`);
    for (const body of urls) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(body)[1];
      assert.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.exec(body)?.[0] || '', /\d{4}-\d{2}-\d{2}/, `${rel} lastmod for ${loc}`);
      listed.push(loc);
    }
  }
  const indexable = manifest.filter((f) => f.endsWith('.html') && f !== '404.html' && !isNoindex(read(f))).map(urlOf).sort();
  assert.equal(new Set(listed).size, listed.length, 'a URL is listed twice');
  assert.deepEqual([...new Set(listed)].sort(), indexable, 'sitemaps list exactly the indexable pages');
});

test('airport page lastmod comes from the map capture date, not from the build day', () => {
  const sample = read('sitemaps/airports-1.xml');
  const kden = /<loc>https:\/\/playshortfinal\.com\/airports\/kden\/<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/.exec(sample);
  assert.ok(kden, 'KDEN is in the airport sitemap');
  const at = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'osm', 'KDEN.json.gz'))).toString()).at;
  assert.equal(kden[1], at);
});

test('the search index lists every airport row once, with a page flag that matches the pages', () => {
  const index = JSON.parse(read('assets/site/airports-index.json'));
  assert.equal(index.rows.length, data.length);
  const flagged = index.rows.filter((r) => r[5] === 1).map((r) => r[0]);
  assert.deepEqual([...new Set(flagged)].sort(), expectedPages);
  assert.equal(flagged.length, expectedPages.length, 'each page code is flagged once');
  for (const r of index.rows.slice(0, 50)) assert.equal(r.length, 6, 'row shape');
});

test('the airports hub and country pages list only real airport pages, and every country with maps has a page', () => {
  const hub = read('airports/index.html');
  assert.match(hub, /id="airport-search"/);
  assert.match(hub, /src="\/assets\/site\/airports-search\.js"/);
  assert.ok(countryFiles.length >= 200, `country pages ${countryFiles.length}`);
  for (const f of countryFiles) assert.ok(read(f).includes('page-country'), f);
});

test('the site stays under the Cloudflare file limit', () => {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };
  const count = walk(ROOT).length;
  assert.ok(count < FILE_BUDGET, `${count} files, budget ${FILE_BUDGET}`);
});

test('_headers: security headers everywhere, CSP only on the website pages, and no CSP over the game and legal folders', () => {
  const lines = read('_headers').split('\n');
  const blocks = new Map();
  let current = null;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      current = line.trim();
      blocks.set(current, []);
    } else if (current) {
      blocks.get(current).push(line.trim());
    }
  }
  const all = blocks.get('/*');
  assert.ok(all && all.some((h) => h.startsWith('Strict-Transport-Security:')), 'HSTS on /*');
  assert.ok(all.some((h) => h === 'X-Content-Type-Options: nosniff'), 'nosniff on /*');
  assert.ok(all.some((h) => h.startsWith('Referrer-Policy:')), 'Referrer-Policy on /*');
  assert.ok(!all.some((h) => h.startsWith('Content-Security-Policy')), 'the CSP is not on /* (the game is not under it)');
  const protectedPrefixes = ['/demo/', '/osm/', '/routes/', '/play/', '/privacy/', '/terms/', '/delete/', '/shots/', '/.well-known/', '/tools/'];
  for (const pattern of blocks.keys()) {
    if (!pattern.includes('*') && !pattern.endsWith('.html') && pattern !== '/') continue;
    for (const p of protectedPrefixes) assert.ok(!pattern.startsWith(p), `${pattern} would cover ${p}`);
  }
  const csp = blocks.get('/airports/*').find((h) => h.startsWith('Content-Security-Policy:'));
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  for (const line of lines) assert.ok(line.length <= 2000, 'line limit');
  assert.ok(blocks.get('/assets/site/*').some((h) => h.startsWith('Cache-Control:')), 'asset cache rule');
  assert.ok(blocks.get('/assets/site/fonts/*').some((h) => h.includes('max-age=31536000')), 'fonts cache a year');
});

test('_redirects keeps the old sitemap name pointing at the new one', () => {
  assert.match(read('_redirects'), /^\/sitemap-home\.xml \/sitemaps\/pages\.xml 301$/m);
  assert.ok(!fs.existsSync(path.join(ROOT, 'sitemap-home.xml')), 'the old sitemap file is gone');
});

test('the site workflow rebuilds on a schedule and by hand, and commits only generated pages', () => {
  const wf = read('.github/workflows/site.yml');
  assert.match(wf, /schedule:/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /node-version: 22/);
  assert.match(wf, /node tools\/site\/build\.mjs/);
  assert.match(wf, /node --test tools\/site\//);
  assert.match(wf, /Website: rebuild pages/);
  assert.match(wf, /git add -A -- \. ':\(exclude\)osm'/, 'the map folder is excluded from staging');
  assert.doesNotMatch(wf, /gh workflow run/, 'the map workflows are not started here');
});
