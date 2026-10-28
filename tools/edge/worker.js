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

function siteNotFound() {
  return fetch(ORIGIN + '/404.html').then((r) => new Response(r.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY } }));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
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
