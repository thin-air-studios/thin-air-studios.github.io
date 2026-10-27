// The top-controllers panel on an airport page: this week's top five at the airport, per level, from the online boards.
// Built only when config.features.airportBoards is true (default false: names on the website need the privacy update that ships
// with 3.4). Its styles are in site.css. The markup is hidden until the browser script (site-src/assets/boards.mjs, with boards-core.mjs and the zone lookup)
// finds a board to show, so a visitor without scripts, or with a failed request, sees no panel at all. Words: site-src/boards/copy.json.
import fs from 'node:fs';
import path from 'node:path';
import { html, toHtml } from './html.mjs';
import { playLink } from './play.mjs';

export const LEVEL_KEYS = ['beginner', 'easy', 'normal', 'hard', 'chaos'];

const cache = new Map();

/** The panel's words, read once per build from site-src/boards/copy.json. */
export function boardCopy(root) {
  if (!cache.has(root)) cache.set(root, JSON.parse(fs.readFileSync(path.join(root, 'site-src', 'boards', 'copy.json'), 'utf8')));
  return cache.get(root);
}

/** Replaces {key} placeholders in a copy string. */
export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function boardsEnabled(config) {
  return config?.features?.airportBoards === true;
}

/** The panel for one airport page ('' when the feature is off). m: the airport model (icao, iata, lat, lon). */
export function boardPanel(ctx, m) {
  if (!boardsEnabled(ctx.config)) return '';
  const copy = boardCopy(ctx.root);
  const code = m.iata || m.icao;
  const lower = m.icao.toLowerCase();
  const campaign = `board-${lower}`;
  const play = playLink(campaign, 'board');
  const vars = { code };
  const levelButtons = LEVEL_KEYS.map(
    (key) => html`<button type="button" class="board-level" data-level="${key}" aria-pressed="false">${copy.levels[key]}</button>`,
  );
  return html`
  <div aria-hidden="true" data-boards-sentinel></div>
  <section class="section board-panel" id="top-controllers" aria-labelledby="top-controllers-title" data-boards data-icao="${m.icao}" data-lat="${m.lat}" data-lon="${m.lon}" hidden>
    <div class="wrap">
      <h2 id="top-controllers-title">${fill(copy.heading, vars)}</h2>
      <p class="board-intro">${fill(copy.intro, vars)}</p>
      <div class="board-levels" role="group" aria-label="${copy.levelsLabel}">${levelButtons}</div>
      <p class="board-caption" aria-live="polite" hidden data-one="${copy.captionOne}" data-many="${copy.captionMany}"></p>
      <ol class="board-list" data-list aria-label="${fill(copy.heading, vars)}" hidden></ol>
      <p class="board-empty" data-empty="all" hidden>${fill(copy.emptyAll, vars)}</p>
      <p class="board-empty" data-empty="level" data-template="${fill(copy.emptyLevel, vars)}" hidden></p>
      <p class="board-empty" data-empty="failed" hidden>${copy.failed}</p>
      <div class="board-cta">
        <a class="btn" href="${play}" data-event="play_store_click" data-ev-page="${campaign}" data-ev-position="board" data-ev-airport="${m.icao}">${copy.play}</a>
      </div>
      <p class="sources">${copy.names}</p>
    </div>
    <script type="module" src="/assets/site/boards.mjs"></script>
  </section>`;
}

/** The markup of boardPanel as a string, for tests that read the page text. */
export function boardPanelHtml(ctx, m) {
  return toHtml(boardPanel(ctx, m));
}
