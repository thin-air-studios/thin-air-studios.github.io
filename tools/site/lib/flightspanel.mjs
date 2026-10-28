// The live-flights panel on an airport page (3.4): "Flying near <city> right now". Built only when features.liveFlights is true. Its
// markup is hidden until the browser script has an answer, so a visitor without scripts, a failed request or an airport the game does
// not know sees no panel at all. The page's one script is the loader (site-src/flights/flights.mjs): it waits for the panel to come near
// the screen, then loads the panel's stylesheet and script (flights-panel.mjs, with flights-core.mjs and flights.css). So an airport page
// the visitor never scrolls down to downloads none of the panel's code. The words come from the page's own text lookup (the English copy,
// or the language's airports dictionary); the script reads the few it needs from a JSON block.
import { html, raw } from './html.mjs';
import { playLink } from './play.mjs';

export const RADIUS_NM = 40; // the server's radius (near.js NEAR_RADIUS_NM)
const PATH = '/assets/site/flights/';
// The words the script shows itself (the rest are in the markup). Their placeholders stay as they are for the script to fill.
const SCRIPT_KEYS = ['landing', 'unknown', 'ground', 'feet', 'knots', 'nm', 'liveData', 'updated', 'updatedNow', 'showing'];
const KEEP = { n: '{n}', when: '{when}', shown: '{shown}' };

export function flightsEnabled(config) {
  return config?.features?.liveFlights === true;
}

/** The words the script reads, as a JSON block the browser does not run ("<" is escaped so no value can close the tag). */
function scriptCopy(t) {
  const words = {};
  for (const key of SCRIPT_KEYS) words[key] = t(`flights.${key}`, KEEP);
  return raw(`<script type="application/json" id="flights-copy">${JSON.stringify(words).replace(/</g, '\\u003c')}</script>`);
}

/**
 * The panel for one airport. t: the page's text lookup (key, vars). where: the city (or the airport's name when it has none), shown in
 * the heading. playKey: the page's campaign key for Play links (airport-kden, or airport-kden-es on a local page). icao: the code.
 * Returns '' when the feature is off.
 */
export function flightsPanel({ config, t, icao, where, playKey }) {
  if (!flightsEnabled(config)) return '';
  const play = playLink(playKey, 'flights');
  const radius = String(RADIUS_NM);
  return html`<div aria-hidden="true" data-flights-sentinel></div>
  <section class="section flights" id="flights" aria-labelledby="flights-title" data-flights data-icao="${icao}" data-radius="${radius}" hidden>
    <div class="wrap">
      <div class="flights-card">
        <header class="flights-head">
          <p class="eyebrow">${t('flights.eyebrow')}</p>
          <h2 id="flights-title">${t('flights.title', { place: where })}</h2>
          <p class="flights-lead">${t('flights.lead')}</p>
        </header>
        <dl class="flights-stats" data-flights-stats>
          <div><dt>${t('flights.statWithin', { radius })}</dt><dd data-flights-within>0</dd></div>
          <div><dt>${t('flights.statAir')}</dt><dd data-flights-air>0</dd></div>
        </dl>
        <p class="flights-updated" data-flights-updated hidden></p>
        <p class="flights-busy" data-flights-busy hidden>${t('flights.busy')}</p>
        <ol class="flights-list" data-flights-list aria-label="${t('flights.title', { place: where })}" hidden></ol>
        <p class="flights-none" data-flights-none hidden>${t('flights.none', { radius })}</p>
        <p class="flights-more" data-flights-more hidden></p>
        <p class="flights-credit" data-flights-credit></p>
        <div class="btn-row flights-cta">
          <a class="btn btn--sm" href="${play}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="flights" data-ev-airport="${icao}">${t('flights.cta')}</a>
        </div>
      </div>
    </div>
    ${scriptCopy(t)}
    <script type="module" src="${PATH}flights.mjs"></script>
  </section>`;
}
