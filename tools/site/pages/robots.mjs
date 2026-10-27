// robots.txt: everything may be crawled, the Perplexity crawlers may not, and the sitemap is named.
export const order = 900;

export async function pages(ctx) {
  const { config } = ctx;
  const text = [
    'User-agent: *',
    'Allow: /',
    '',
    "# Perplexity's crawlers: not allowed on any page (October 22, 2026).",
    'User-agent: PerplexityBot',
    'User-agent: Perplexity-User',
    'Disallow: /',
    '',
    `Sitemap: ${config.domain}/sitemap.xml`,
    '',
  ].join('\n');
  return [{ path: '/robots.txt', content: text }];
}
