#!/usr/bin/env node
// The Short Final website generator (node 22, no dependencies).
//
//   node tools/site/build.mjs            write every page and asset this tool owns into the repository root
//   node tools/site/build.mjs --check    write nothing; exit 1 when the root differs from a fresh build (for CI)
//
// Inputs: site-src/config.json, site-src/data/, site-src/i18n/, site-src/assets/ (copied to /assets/site/), and the map
// folder osm/ (read only). Page modules: every tools/site/pages/*.mjs exports
//   export const order = 50;                       optional; lower runs first (default 50)
//   export async function pages(ctx) { return [...] }
// where each returned page is { path: '/airports/kden/', html } (an HTML page; path ends in / or .html), or
// { path: '/robots.txt', content } (any other text or binary file), plus optional meta used by the sitemap:
// lastmod ('YYYY-MM-DD'), section ('home', 'airports', ...), noindex (true), alternates ([{hreflang, href}]).
// Modules never edit build.mjs: a new module file is picked up on the next run.
//
// Ownership: the build keeps site-src/.generated.json, a list of every file it wrote. It deletes only files on that list that
// it no longer makes. It never overwrites a file it does not own unless config.adopt names it, and never writes under a
// protectedPrefixes folder (the map robot's, the game's, and the existing pages built elsewhere).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { html, raw, toHtml, esc, jsonLdScript } from './lib/html.mjs';
import { playLink, PLAY_LISTING } from './lib/play.mjs';
import { slugify, airportPath, countryPath } from './lib/slug.mjs';
import { loadDictionaries, makeT } from './lib/i18n.mjs';
import { layout, absoluteUrl, sectionLive } from './lib/layout.mjs';
import { loadData, readMap, toAirport, SIZE_LABEL } from './lib/data.mjs';
import { walk, readBytes } from './lib/files.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOL_DIR, '..', '..');
const MANIFEST_NAME = '.generated.json';
const SAFE_REL = /^[a-z0-9._/-]+$/;
const SAFE_ASSET_REL = /^[A-Za-z0-9._/-]+$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validateConfig(config) {
  const problems = [];
  if (!/^https:\/\/[a-z0-9.-]+$/.test(config.domain || '')) problems.push('domain must be https://host with no trailing slash');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email || '')) problems.push('email is missing or not an address');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.contentDate || '')) problems.push('contentDate must be YYYY-MM-DD');
  if (!/^(G-[A-Z0-9]+)?$/.test(config.analytics?.ga4 ?? 'x')) problems.push('analytics.ga4 must be empty or a G- measurement id');
  if (!/^([a-f0-9]{32})?$/.test(config.analytics?.cfBeacon ?? 'x')) problems.push('analytics.cfBeacon must be empty or a 32-character token');
  for (const key of ['weekend', 'thanksgiving', 'santa']) {
    if (typeof config.events?.[key]?.live !== 'boolean') problems.push(`events.${key}.live must be true or false`);
  }
  for (const key of ['challengeLinks', 'challengeBoards', 'airportBoards']) {
    if (typeof config.features?.[key] !== 'boolean') problems.push(`features.${key} must be true or false`);
  }
  const langs = config.languages || [];
  if (!langs.length || langs[0].code !== 'en' || langs[0].path !== '/') problems.push('languages[0] must be English at /');
  const paths = new Set();
  for (const l of langs) {
    if (!/^[a-z0-9-]+$/.test(l.code) || !/^\/([a-z0-9-]+\/)?$/.test(l.path) || paths.has(l.path)) problems.push(`language ${l.code} has a bad or repeated path`);
    paths.add(l.path);
    if (l.live !== undefined && typeof l.live !== "boolean") problems.push(`language ${l.code} live must be true or false`);
    if (!l.htmlLang || !l.hreflang || !l.name) problems.push(`language ${l.code} needs htmlLang, hreflang and name`);
  }
  if (!Array.isArray(config.adopt)) problems.push('adopt must be a list');
  if (problems.length) throw new Error(`config.json: ${problems.join('; ')}`);
  return config;
}

async function loadModules() {
  const dir = path.join(TOOL_DIR, 'pages');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort() : [];
  const mods = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    if (typeof mod.pages !== 'function') throw new Error(`pages/${f} must export pages(ctx)`);
    mods.push({ name: f, order: typeof mod.order === 'number' ? mod.order : 50, pages: mod.pages });
  }
  return mods.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1));
}

/** Turns a module's page object into an output: { rel, bytes (string or Buffer), meta }. */
function normalize(page, moduleName) {
  let rel;
  if (page.path !== undefined) {
    if (!page.path.startsWith('/') || page.path.includes('..')) throw new Error(`${moduleName}: bad path ${page.path}`);
    const trimmed = page.path.slice(1);
    rel = trimmed === '' || trimmed.endsWith('/') ? `${trimmed}index.html` : trimmed;
  } else {
    throw new Error(`${moduleName}: a page needs a path`);
  }
  if (!SAFE_REL.test(rel)) throw new Error(`${moduleName}: path "${page.path}" has characters outside a-z, 0-9, . _ - /`);
  let bytes;
  if (page.html !== undefined) {
    if (!rel.endsWith('.html')) throw new Error(`${moduleName}: an html page must end in .html or /`);
    bytes = typeof page.html === 'string' ? page.html : page.html.value;
    if (typeof bytes !== 'string') throw new Error(`${moduleName}: html must be html\`\` output or a string`);
  } else if (page.content !== undefined) {
    bytes = page.content;
  } else {
    throw new Error(`${moduleName}: ${page.path} has neither html nor content`);
  }
  const meta = {
    kind: page.html !== undefined ? 'html' : 'file',
    path: page.path,
    lastmod: page.lastmod || null,
    section: page.section || 'pages',
    noindex: Boolean(page.noindex),
    alternates: page.alternates || [],
  };
  return { rel, bytes: typeof bytes === 'string' ? `${bytes.replace(/\n*$/, '\n')}` : bytes, meta, module: moduleName };
}

/** Builds every output in memory. Pure except for reading the repository. */
export async function generate(root = ROOT) {
  const src = path.join(root, 'site-src');
  const config = validateConfig(readJson(path.join(src, 'config.json')));
  const data = loadData(root, src);
  const dicts = loadDictionaries(src, config.languages);
  const missing = new Set();
  const t = makeT(dicts, missing);
  const ctx = {
    root,
    config,
    data,
    t,
    previous: [],
    lib: { html, raw, toHtml, esc, jsonLdScript, playLink, PLAY_LISTING, slugify, airportPath, countryPath, layout, absoluteUrl, sectionLive, readMap, toAirport, SIZE_LABEL },
  };
  const outputs = [];
  const modules = await loadModules();
  for (const mod of modules) {
    ctx.previous = outputs.slice();
    const pages = await mod.pages(ctx);
    for (const page of pages) outputs.push(normalize(page, mod.name));
  }
  for (const rel of walk(path.join(src, 'assets'))) {
    if (!SAFE_ASSET_REL.test(rel)) throw new Error(`asset ${rel} has characters outside A-Za-z0-9 . _ - /`);
    outputs.push({ rel: `assets/site/${rel}`, bytes: readBytes(path.join(src, 'assets', rel)), meta: { kind: 'asset' }, module: 'assets' });
  }
  const seen = new Set();
  for (const o of outputs) {
    if (seen.has(o.rel)) throw new Error(`two modules make ${o.rel}`);
    seen.add(o.rel);
  }
  return { root, config, outputs, missing: [...missing].sort(), modules: modules.map((m) => m.name) };
}

function checkProtected(config, rel) {
  for (const prefix of config.protectedPrefixes || []) {
    if (rel === prefix.replace(/\/$/, '') || rel.startsWith(prefix)) throw new Error(`refusing to write ${rel}: it is under the protected folder ${prefix}`);
  }
}

function manifestPath(root) {
  return path.join(root, 'site-src', MANIFEST_NAME);
}

function readManifest(root) {
  const file = manifestPath(root);
  return fs.existsSync(file) ? readJson(file).files : [];
}

function sameBytes(file, bytes) {
  const current = readBytes(file);
  if (!current) return false;
  const want = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
  return current.equals(want);
}

function removeEmptyParents(root, file) {
  let dir = path.dirname(file);
  while (dir !== root && dir.startsWith(root)) {
    if (fs.readdirSync(dir).length) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const check = argv.includes('--check');
  const built = await generate(root);
  const { config, outputs } = built;
  const previous = new Set(readManifest(root));
  const adopt = new Set(config.adopt);
  const wanted = new Set(outputs.map((o) => o.rel));
  const problems = [];
  for (const o of outputs) {
    checkProtected(config, o.rel);
    const onDisk = fs.existsSync(path.join(root, o.rel));
    if (onDisk && !previous.has(o.rel) && !adopt.has(o.rel)) problems.push(`${o.rel} exists and is not ours (add it to config.adopt if it should be replaced)`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const stale = [...previous].filter((rel) => !wanted.has(rel));
  const changed = outputs.filter((o) => !sameBytes(path.join(root, o.rel), o.bytes)).map((o) => o.rel);
  const manifest = `${JSON.stringify({ tool: 'tools/site/build.mjs', files: [...wanted].sort() }, null, 2)}\n`;
  const manifestChanged = !sameBytes(manifestPath(root), manifest);
  const staleOnDisk = stale.filter((rel) => fs.existsSync(path.join(root, rel)));
  if (check) {
    const diffs = [...changed, ...staleOnDisk.map((rel) => `(remove) ${rel}`)];
    if (manifestChanged) diffs.push('(manifest) site-src/.generated.json');
    if (diffs.length) {
      console.error(`site is out of date: ${diffs.length} difference(s); run node tools/site/build.mjs`);
      for (const d of diffs.slice(0, 40)) console.error(`  ${d}`);
      return 1;
    }
    console.log(`site is up to date: ${outputs.length} files`);
    return 0;
  }
  for (const o of outputs) {
    if (!changed.includes(o.rel)) continue;
    const file = path.join(root, o.rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, o.bytes);
  }
  for (const rel of staleOnDisk) {
    fs.unlinkSync(path.join(root, rel));
    removeEmptyParents(root, path.join(root, rel));
  }
  if (manifestChanged) fs.writeFileSync(manifestPath(root), manifest);
  const htmlCount = outputs.filter((o) => o.meta.kind === 'html').length;
  console.log(`built ${outputs.length} files (${htmlCount} pages, ${outputs.length - htmlCount} other), wrote ${changed.length}, removed ${staleOnDisk.length}`);
  if (built.missing.length) console.log(`translations missing (English shown): ${built.missing.length}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
