// The sitemaps. /sitemap.xml is an index of:
//   /sitemaps/pages.xml        the home pages, events, press, about and every other page that is not below
//   /sitemaps/airports-<n>.xml airport pages, country pages and the airports hub (at most 45,000 URLs each)
//   /sitemaps/guides.xml       every page under /guides/ that the build made (read from the built outputs, not from the module)
// Only HTML pages that are not noindex are listed. lastmod comes from each page's lastmod (airport pages: the map's capture
// date), falling back to config.contentDate. Runs last (order 900) so it sees every other module's output.
import { esc } from '../lib/html.mjs';

export const order = 900;

const LIMIT = 45000;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function urlEntry(config, o) {
  const lastmod = DATE.test(o.meta.lastmod || '') ? o.meta.lastmod : config.contentDate;
  const alts = (o.meta.alternates || []).map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}"/>`);
  return [`  <url>`, `    <loc>${esc(`${config.domain}${o.meta.path}`)}</loc>`, `    <lastmod>${esc(lastmod)}</lastmod>`, ...alts, `  </url>`].join('\n');
}

function urlset(config, items) {
  return `${XML_HEAD}\n<urlset ${NS}>\n${items.map((o) => urlEntry(config, o)).join('\n')}\n</urlset>\n`;
}

export async function pages(ctx) {
  const { config } = ctx;
  const listed = ctx.previous.filter((o) => o.meta.kind === 'html' && !o.meta.noindex);
  const byPath = (a, b) => (a.meta.path < b.meta.path ? -1 : a.meta.path > b.meta.path ? 1 : 0);
  const pagesList = listed.filter((o) => !o.meta.path.startsWith('/airports/') && !o.meta.path.startsWith('/guides/')).sort(byPath);
  const airports = listed.filter((o) => o.meta.path.startsWith('/airports/')).sort(byPath);
  const guides = listed.filter((o) => o.meta.path.startsWith('/guides/')).sort(byPath);

  const files = [];
  const index = [];
  const latest = (items) => items.map((o) => (DATE.test(o.meta.lastmod || '') ? o.meta.lastmod : config.contentDate)).sort().pop() || config.contentDate;
  const add = (name, items) => {
    files.push({ path: `/sitemaps/${name}.xml`, content: urlset(config, items) });
    index.push(`  <sitemap>\n    <loc>${esc(`${config.domain}/sitemaps/${name}.xml`)}</loc>\n    <lastmod>${esc(latest(items))}</lastmod>\n  </sitemap>`);
  };
  if (pagesList.length) add('pages', pagesList);
  for (let i = 0, n = 1; i < airports.length; i += LIMIT, n++) add(`airports-${n}`, airports.slice(i, i + LIMIT));
  if (guides.length) add('guides', guides);

  files.push({
    path: '/sitemap.xml',
    content: `${XML_HEAD}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.join('\n')}\n</sitemapindex>\n`,
  });
  return files;
}
