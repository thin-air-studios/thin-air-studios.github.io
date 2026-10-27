// The local-language airport pages (/es/airports/<icao>/, /de/airports/<icao>/, ...): about 300 of the busiest mapped airports in
// countries whose main language is a store language. The plan, the copy and the page template live in
// tools/site/lib/localairports.mjs; the words are in site-src/i18n/airports-<code>.json. Runs after the English airport pages.
import { localAirportPages } from '../lib/localairports.mjs';

export const order = 61;

export async function pages(ctx) {
  return localAirportPages(ctx);
}
