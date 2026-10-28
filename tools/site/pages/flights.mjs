// The live-flights panel's files (3.4): the loader (flights.mjs, the one script an airport page carries), the panel's script (loaded by the
// loader when the panel nears the screen), its pure parts and its stylesheet. Written only when features.liveFlights is true. The panel
// itself is on each airport page (tools/site/lib/flightspanel.mjs); with the flag off the site carries nothing for it.
import fs from 'node:fs';
import path from 'node:path';
import { flightsEnabled } from '../lib/flightspanel.mjs';

const FILES = ['flights.mjs', 'flights-panel.mjs', 'flights-core.mjs', 'flights.css'];

export async function pages(ctx) {
  const { root, config } = ctx;
  if (!flightsEnabled(config)) return [];
  return FILES.map((file) => ({
    path: `/assets/site/flights/${file}`,
    content: fs.readFileSync(path.join(root, 'site-src', 'flights', file), 'utf8'),
  }));
}
