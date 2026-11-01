// Tests for the site-script minifier (tools/site/lib/minify.mjs). The tests that need esbuild run only when it is installed (npm ci);
// the rest pin both paths of the build (with and without esbuild) by passing esbuild in directly.
// Run: node --test tools/site/minify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { bannerFor, isOwnScript, madeFrom, minifyScripts, MODES, sourceTag } from './lib/minify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'site-src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

let esbuildModule = null;
try {
  esbuildModule = await import('esbuild');
} catch {
  esbuildModule = null;
}
const withEsbuild = { skip: esbuildModule ? false : 'esbuild is not installed (npm ci)' };

test('the minifier takes the own scripts only: the site scripts yes, the vendored libraries, styles and data no', () => {
  for (const rel of [
    'assets/site/site.js',
    'assets/site/airports-search.js',
    'assets/site/brand/home.js',
    'assets/site/boards.mjs',
    'assets/site/boards-core.mjs',
    'assets/site/flights/flights.mjs',
    'assets/site/flights/flights-panel.mjs',
    'assets/site/challenge/board-core.mjs',
  ]) {
    assert.equal(isOwnScript(rel), true, rel);
  }
  for (const rel of ['assets/site/vendor/tz-lookup.mjs', 'assets/site/flights/flights.css', 'assets/site/airports-index.json', 'assets/site/site.css', 'site.js', 'index.html']) {
    assert.equal(isOwnScript(rel), false, rel);
  }
  assert.deepEqual(MODES, ['auto', 'require', 'off']);
});

test('the banner names the source: the same source has the same tag, a changed source has another', () => {
  const tag = sourceTag('var a = 1;\n');
  assert.equal(tag, sourceTag('var a = 1;\n'));
  assert.notEqual(tag, sourceTag('var a = 2;\n'));
  assert.match(tag, /^[0-9a-f]{12}$/);
  const banner = bannerFor(tag);
  assert.ok(banner.startsWith('/*! (c) Thin Air Studios.'), 'the legal line starts with the copyright');
  assert.ok(!banner.includes('\n'), 'the banner is one line');
  assert.equal(madeFrom(`${banner}\nvar a=1;\n`, tag), true);
  assert.equal(madeFrom(`${banner}\nvar a=1;\n`, sourceTag('var a = 2;\n')), false, 'a changed source is not current');
  assert.equal(madeFrom('var a = 1;\n', tag), false, 'a readable file is not a minified one');
});

test('SITE_MINIFY=off writes the readable sources, and an unknown mode is an error', async () => {
  const outputs = [{ rel: 'assets/site/site.js', bytes: 'var answer = 42;\n', meta: { kind: 'asset' } }];
  const summary = await minifyScripts(outputs, { mode: 'off', esbuild: null });
  assert.equal(outputs[0].bytes, 'var answer = 42;\n');
  assert.equal(summary.readable, 1);
  assert.match(summary.skipped, /SITE_MINIFY=off/);
  await assert.rejects(minifyScripts(outputs, { mode: 'sometimes', esbuild: null }), /SITE_MINIFY must be one of/);
});

test('without esbuild: a minified file whose source is unchanged is kept as it is; a changed source is written readable', async () => {
  const source = read('assets/site.js');
  const tag = sourceTag(source);
  const committed = `${bannerFor(tag)}\n(function(){})();\n`;
  const outputs = [
    { rel: 'assets/site/site.js', bytes: source, meta: { kind: 'asset' } },
    { rel: 'assets/site/airports-search.js', bytes: 'var x = 1;\n', meta: { kind: 'file' } },
  ];
  const onDisk = (rel) => (rel === 'assets/site/site.js' ? committed : '/*! (c) Thin Air Studios. Short Final website script (source 000000000000). */\nold;\n');
  const summary = await minifyScripts(outputs, { mode: 'auto', esbuild: null, onDisk });
  assert.equal(outputs[0].bytes, committed, 'the committed minified file is kept');
  assert.equal(outputs[1].bytes, 'var x = 1;\n', 'a script whose source changed is written readable, not the stale minified file');
  assert.equal(summary.kept, 1);
  assert.equal(summary.readable, 1);
  assert.equal(summary.minified, 0);
  assert.match(summary.skipped, /esbuild is not installed/);
});

test('without esbuild and with nothing committed, every script is written readable', async () => {
  const outputs = [{ rel: 'assets/site/boards.mjs', bytes: 'export const x = 1;\n', meta: { kind: 'asset' } }];
  const summary = await minifyScripts(outputs, { mode: 'auto', esbuild: null, onDisk: () => null });
  assert.equal(outputs[0].bytes, 'export const x = 1;\n');
  assert.equal(summary.readable, 1);
});

test('SITE_MINIFY=require stops the build when esbuild is not installed', async () => {
  const outputs = [{ rel: 'assets/site/site.js', bytes: 'var a = 1;\n', meta: { kind: 'asset' } }];
  await assert.rejects(minifyScripts(outputs, { mode: 'require', esbuild: null }), /SITE_MINIFY=require, but esbuild is not installed/);
});

test('the readable files of other kinds are never touched, even when esbuild is there', async () => {
  const outputs = [
    { rel: 'assets/site/site.css', bytes: 'body{margin:0}', meta: { kind: 'asset' } },
    { rel: 'assets/site/vendor/tz-lookup.mjs', bytes: 'export const x = 1;', meta: { kind: 'asset' } },
  ];
  const summary = await minifyScripts(outputs, { mode: 'auto', esbuild: null, onDisk: () => null });
  assert.equal(summary.minified + summary.kept + summary.readable, 0);
  assert.equal(outputs[0].bytes, 'body{margin:0}');
  assert.equal(outputs[1].bytes, 'export const x = 1;');
});

test('a classic script is minified: one banner line, no comments, the same strings and the same global hook', withEsbuild, async () => {
  const source = read('assets/site.js');
  const outputs = [{ rel: 'assets/site/site.js', bytes: source, meta: { kind: 'asset' } }];
  const summary = await minifyScripts(outputs, { mode: 'auto', esbuild: esbuildModule });
  const code = outputs[0].bytes;
  assert.equal(summary.minified, 1);
  assert.ok(code.startsWith(`${bannerFor(sourceTag(source))}\n`), 'the legal banner, naming the source, is the first line');
  assert.equal(code.trimEnd().split('\n').length, 2, 'the banner is one line and the script is one line');
  assert.equal(code.indexOf('/*'), 0, 'the banner is the only comment');
  assert.equal(code.indexOf('/*', 1), -1, 'no other comment is left');
  for (const kept of ['sf-consent', 'data-ga', 'sfTrack', 'guide_read_75', 'outbound_click', 'googletagmanager.com/gtag/js?id=', 'use strict']) {
    assert.ok(code.includes(kept), `keeps ${kept}`);
  }
  assert.ok(code.length < source.length / 2, 'the script is less than half its readable size');
});

test('a module keeps its imports, exports and import.meta: the loader still reads its own address', withEsbuild, async () => {
  const outputs = [
    { rel: 'assets/site/flights/flights.mjs', bytes: read('flights/flights.mjs'), meta: { kind: 'file' } },
    { rel: 'assets/site/flights/flights-panel.mjs', bytes: read('flights/flights-panel.mjs'), meta: { kind: 'file' } },
  ];
  await minifyScripts(outputs, { mode: 'auto', esbuild: esbuildModule });
  const [loader, panel] = outputs.map((o) => o.bytes);
  assert.ok(loader.includes('new URL("./flights.css",import.meta.url)'), 'import.meta.url is kept, not replaced by a stand-in object');
  assert.ok(loader.includes('import(new URL("./flights-panel.mjs",import.meta.url).href)'));
  assert.ok(!/\b[a-zA-Z_$]\.url\b/.test(loader.replace(/import\.meta\.url/g, '')), 'no stand-in for import.meta');
  assert.ok(panel.includes('from"./flights-core.mjs"'), 'the panel still imports the core by its file name');
});

test('the pure helpers of each module export the same names, and the same answers, after minification', withEsbuild, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-minify-test-'));
  try {
    for (const rel of ['flights/flights-core.mjs', 'assets/boards-core.mjs', 'challenge/board-core.mjs']) {
      const outputs = [{ rel: `assets/site/${rel}`, bytes: read(rel), meta: { kind: 'file' } }];
      await minifyScripts(outputs, { mode: 'auto', esbuild: esbuildModule });
      const minFile = path.join(dir, `min-${path.basename(rel)}`);
      fs.writeFileSync(minFile, outputs[0].bytes);
      const readable = await import(pathToFileURL(path.join(SRC, rel)).href);
      const minified = await import(pathToFileURL(minFile).href);
      assert.deepEqual(Object.keys(minified).sort(), Object.keys(readable).sort(), `${rel}: export names`);
      for (const key of Object.keys(readable)) {
        assert.equal(typeof minified[key], typeof readable[key], `${rel}: ${key} type`);
      }
    }
    const core = await import(pathToFileURL(path.join(dir, 'min-flights-core.mjs')).href);
    const readable = await import(pathToFileURL(path.join(SRC, 'flights', 'flights-core.mjs')).href);
    assert.equal(core.formatCount(12345, 'en'), readable.formatCount(12345, 'en'));
    assert.equal(core.nearUrl('KDEN'), readable.nearUrl('KDEN'));
    assert.equal(core.nextRefreshDelay({ visible: true, gone: false }), readable.nextRefreshDelay({ visible: true, gone: false }));
    assert.deepEqual(core.fill('{a} of {b}', { a: 1, b: 2 }), readable.fill('{a} of {b}', { a: 1, b: 2 }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the minified output is deterministic: the same source gives the same bytes', withEsbuild, async () => {
  const make = async () => {
    const outputs = [{ rel: 'assets/site/brand/home.js', bytes: read('assets/brand/home.js'), meta: { kind: 'asset' } }];
    await minifyScripts(outputs, { mode: 'auto', esbuild: esbuildModule });
    return outputs[0].bytes;
  };
  assert.equal(await make(), await make());
});
