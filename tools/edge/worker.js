// The playshortfinal.com edge (Cloudflare Worker "playshortfinal-site"): serves this repository's GitHub Pages copy at
// https://playshortfinal.com, so every push to main shows on the domain with no deploy step, while installed apps keep
// reading maps and routes from thin-air-studios.github.io unchanged. www and any other host redirect to the bare domain;
// GitHub's own redirects (a folder without its slash) are rewritten to the domain; security headers are added. Deployed
// through the Cloudflare API (custom domains playshortfinal.com and www.playshortfinal.com), not by CI.
const ORIGIN = 'https://thin-air-studios.github.io';
const HOST = 'playshortfinal.com';
const SECURITY = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};
const DROP = ['x-github-request-id', 'x-served-by', 'x-cache', 'x-cache-hits', 'x-timer', 'x-fastly-request-id', 'via', 'x-proxy-cache'];
const ASSET = /\.(?:css|js|mjs|woff2?|png|webp|avif|jpe?g|svg|ico|json|gz|zip|xml|txt|webmanifest)$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== HOST || url.protocol !== 'https:') {
      url.hostname = HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const res = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      redirect: 'manual',
      cf: { cacheEverything: true, cacheTtl: ASSET.test(url.pathname) ? 3600 : 300 },
    });
    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc) headers.set('location', loc.replace(/^https?:\/\/thin-air-studios\.github\.io/i, `https://${HOST}`));
    for (const h of DROP) headers.delete(h);
    for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
