// The playshortfinal.com edge (Cloudflare Worker "playshortfinal-site"): serves this repository's GitHub Pages copy at
// https://playshortfinal.com, so every push to main shows on the domain with no deploy step, while installed apps keep
// reading maps and routes from thin-air-studios.github.io unchanged. www and any other host redirect to the bare domain;
// GitHub's own redirects (a folder without its slash) are rewritten to the domain; security headers are added; the repository's
// working files (site-src/, tools/, .github/, Markdown notes) answer 404. Deployed
// through the Cloudflare API (custom domains playshortfinal.com and www.playshortfinal.com), not by CI.
//
// Challenge boards (3.4): every /c/<id>/ address shows the one board page (c/index.html). The visitor's address stays in the bar and
// the page reads the id from it. The origin is asked for the template only, never for the address itself, so GitHub's own 404 for an
// unknown id cannot be the answer; if the template is not there, the site's own 404 page is.
//
// Real visitors (Todd, November 3, 2026): POST /api/p is the page beacon from site.js. It counts real people privately, with no
// cookie and nothing stored about the visitor: `people` (pages read) and `visitors` (each browser once a Colorado day, a one-way
// hash of day + address + browser + a random salt, kept two days). Robots, test browsers and Claude's network are skipped. The
// numbers live in the D1 database "playshortfinal-visits" (binding VISITS) and are shown only in Owl Test Prep's Admin › Today,
// which reads the same database. Nothing on this site shows them, and without the binding the beacon is accepted and ignored.
const ORIGIN = 'https://thin-air-studios.github.io';
const HOST = 'playshortfinal.com';
const TEMPLATE = '/c/';
const CHALLENGE_PAGE = /^\/c\/[A-Za-z0-9_-]{12}\/?$/;
const SECURITY = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};
const DROP = ['x-github-request-id', 'x-served-by', 'x-cache', 'x-cache-hits', 'x-timer', 'x-fastly-request-id', 'via', 'x-proxy-cache'];
const ASSET = /\.(?:css|js|mjs|woff2?|png|webp|avif|jpe?g|svg|ico|json|gz|zip|xml|txt|webmanifest)$/i;

/** The path the origin is asked for: the board template for every challenge address, and the path itself for any other. */
export function originPath(pathname) {
  return CHALLENGE_PAGE.test(pathname) ? TEMPLATE : pathname;
}

/** True for a challenge board address (/c/ and twelve id characters, with or without the last slash). */
export function isChallengePath(pathname) {
  return CHALLENGE_PAGE.test(pathname);
}

const BOT = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|headless|playwright|puppeteer|lighthouse|selenium|phantom|python|curl|wget|httpclient|java\/|go-http|node-fetch|axios|okhttp/i;

/** True for a request from Claude's own network (160.79.104.0/21), so checks and screenshots are never counted. */
export function isClaudeNet(ip) {
  const m = /^160\.79\.(\d+)\./.exec(ip || '');
  return !!m && Number(m[1]) >= 104 && Number(m[1]) <= 111;
}

/** True when a beacon may be counted: a same-site browser that is not a robot, a test browser or Claude's network. */
export function countable(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua) || !/Mozilla\//.test(ua)) return false;
  if (isClaudeNet(request.headers.get('cf-connecting-ip'))) return false;
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (origin && origin !== `https://${HOST}`) return false;
  if (site && site !== 'same-origin') return false;
  return !!(origin || site);
}

/** The Colorado date, YYYY-MM-DD. */
export function coloradoDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

let tablesReady = false;
async function ensureTables(db) {
  if (tablesReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS visit_days (day TEXT PRIMARY KEY, people INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS visit_seen (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h))'),
    db.prepare('CREATE TABLE IF NOT EXISTS visit_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
  ]);
  tablesReady = true;
}

async function hashHex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Counts one beacon: one more page read today, and one more visitor the first time this browser is seen today. */
export async function countVisit(db, request, now = new Date()) {
  await ensureTables(db);
  const day = coloradoDay(now);
  let salt = (await db.prepare("SELECT v FROM visit_meta WHERE k = 'salt'").first())?.v;
  if (!salt) {
    salt = crypto.randomUUID();
    await db.prepare("INSERT OR IGNORE INTO visit_meta (k, v) VALUES ('salt', ?)").bind(salt).run();
    salt = (await db.prepare("SELECT v FROM visit_meta WHERE k = 'salt'").first())?.v || salt;
  }
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const h = await hashHex(`${day}|${ip}|${ua}|${salt}`);
  const seen = await db.prepare('INSERT OR IGNORE INTO visit_seen (day, h) VALUES (?, ?)').bind(day, h).run();
  const isNew = (seen?.meta?.changes || 0) > 0;
  await db
    .prepare('INSERT INTO visit_days (day, people, visitors) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET people = people + 1, visitors = visitors + excluded.visitors')
    .bind(day, isNew ? 1 : 0)
    .run();
  if (isNew && Math.random() < 0.05) {
    const old = coloradoDay(new Date(now.getTime() - 2 * 86400000));
    await db.prepare('DELETE FROM visit_seen WHERE day < ?').bind(old).run();
  }
  return { day, isNew };
}

function siteNotFound() {
  return fetch(ORIGIN + '/404.html').then((r) => new Response(r.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY } }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/p' && url.hostname === HOST) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      if (env && env.VISITS && countable(request)) {
        const work = countVisit(env.VISITS, request).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(work);
        else await work;
      }
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', ...SECURITY } });
    }
    if (url.hostname !== HOST || url.protocol !== 'https:') {
      url.hostname = HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // the repository's working files (site source, notes, build tools, workflows) are not pages: they stay off the domain
    if (/^\/(?:site-src|tools|\.github)(?:\/|$)/.test(url.pathname) || /\.md$/i.test(url.pathname)) {
      return siteNotFound();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const challenge = isChallengePath(url.pathname);
    // the board template takes its id and its query from the visitor's address in the browser, so the origin gets neither
    const target = ORIGIN + originPath(url.pathname) + (challenge ? '' : url.search);
    const res = await fetch(target, {
      method: request.method,
      redirect: 'manual',
      cf: { cacheEverything: true, cacheTtl: ASSET.test(url.pathname) ? 3600 : 300 },
    });
    if (challenge && !res.ok) return siteNotFound();
    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc) headers.set('location', loc.replace(/^https?:\/\/thin-air-studios\.github\.io/i, `https://${HOST}`));
    for (const h of DROP) headers.delete(h);
    for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);
    if (challenge) headers.set('x-robots-tag', 'noindex');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
