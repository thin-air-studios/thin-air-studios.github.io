// URL pieces. Everything a path is built from goes through here, so every page path is lowercase ASCII with hyphens.

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** /airports/kden/ for ICAO KDEN. ICAO codes are letters and digits only; anything else is refused. */
export function airportPath(icao) {
  const code = String(icao || '').toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) throw new Error(`airportPath: not an ICAO-style code: ${icao}`);
  return `/airports/${code.toLowerCase()}/`;
}

/**
 * /airports/<country-slug>/. A slug that equals an airport's ICAO code (Niue would be /airports/niue/, the code NIUE) gets a
 * "-country" suffix, so one path never means two pages. isIcao(code) answers whether a 4-letter code exists.
 */
export function countryPath(name, isIcao) {
  let slug = slugify(name);
  if (isIcao && slug.length === 4 && isIcao(slug.toUpperCase())) slug = `${slug}-country`;
  return `/airports/${slug}/`;
}
