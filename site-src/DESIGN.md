# Short Final website: design, plan and build

Status: foundation (27 Oct 2026). Game version described: 3.3 (see `config.json`, `game.latestVersion`).
Domain: https://playshortfinal.com (GitHub Pages serves the same files at thin-air-studios.github.io until the domain is connected).

The site exists to turn search traffic into Google Play installs. Every page has one job: explain the game in the words people search for, then send them to the Play listing (or to the free browser demo) with a campaign code that Play Console reports.

## 1. Measures

| Measure | Where it comes from | Read it |
| --- | --- | --- |
| Installs by page | Play Console, acquisition by referrer `utm_campaign` (the page key, see section 5) | Weekly |
| Play clicks by page and position | GA4 event `play_store_click` (ANALYTICS.md) | Weekly |
| Search clicks and impressions by page type | Search Console (airport pages, guides, home) | Weekly |
| Demo starts | GA4 event `demo_start` | Weekly |
| Consent rate | Banner choice (only when GA4 is set) | Monthly |

Non-goals: no account, no ads, no cookies before consent, no framework, no tracking pixels from ad networks, no reviews or ratings that are not from Google Play.

## 2. Information architecture and URLs

| Page type | URL | Count (launch) | Source | Notes |
| --- | --- | --- | --- | --- |
| Home | `/` | 1 | `pages/home.mjs` | English |
| Localized homes | `/es/`, `/es-419/`, `/pt-br/`, `/de/`, `/fr/`, `/it/`, `/ja/`, `/ko/`, `/zh-tw/`, `/tr/`, `/id/`, `/pl/` | 0 now, 12 later | config `languages[].live` | Same template, own dictionary |
| Airports hub | `/airports/` | 1 | `pages/airports.mjs` | Client-side search over `/assets/site/airports-index.json` (all 29,164 rows, 1.66 MB raw, about 474 KB gzipped, loaded on first focus; the board page does not load it) |
| Country hubs | `/airports/<country-slug>/` | up to 230 | one per country with a mapped airport | Collision with an ICAO code gets `-country` (Niue: `/airports/niue-country/`) |
| Airport pages | `/airports/<icao-lower>/` | 6,238 (6,239 maps, SD24 excluded) | one per airport with an OSM map | Grows as the map robot adds maps |
| Guides | `/guides/`, `/guides/<slug>/` | 1 hub + 12 | `pages/guides.mjs` | English at launch |
| Events | `/events/`, `/events/weekend/`, `/events/thanksgiving-rush/`, `/events/santa/` | 4 | `pages/events.mjs` | Holiday copy follows config flags |
| Features | `/features/` | 1 (optional) | | Anchors per feature |
| Press | `/press/` | 1 | | Fact sheet, logos, screenshots, trailer link |
| About | `/about/` | 1 | | Studio, contact, data credits |
| Kept as they are | `/demo/`, `/play/`, `/privacy/`, `/terms/`, `/delete/`, `/osm/`, `/routes/`, `/shots/`, `/assets/site.css`, `/.well-known/`, `/tools/maps/` | | built elsewhere | Never edited here |
| Root icon files | `/assets/logo.svg` (the plane alone; the legal and play pages link it), `/assets/app-icon.png` (the touch icon, same as `/assets/site/img/apple-touch-icon.png`) | | copied by hand | Copies of `site-src/assets/img/logo.svg` and `apple-touch-icon.png`. Replace both together with the site icon |
| Generated | `/404.html`, `/robots.txt`, `/sitemap.xml`, `/sitemap-<section>.xml`, `/assets/site/**` | | `pages/notfound.mjs`, `robots.mjs`, `sitemap.mjs`, `site-src/assets/` | |

Navigation: the header shows Airports, Guides, Events, Press, About and a "Get the game" button. The footer has Play, Explore, About and a language list. A section's links appear only when `config.sections.<key>` is true, so no link points at a page that is not built.

Clean URLs end in `/`. The host serves `index.html` for them. `/404.html` is the helpful 404 (noindex).

## 3. Visual direction

Name for the look: "approach at night". Deep teal night (the game's own `--teal-dark`), a phosphor radar sweep, the plane orange of the logo, and the game's gold buttons with the same pressed-down edge. Fredoka throughout, as in the game. Dark is the hero band in both modes, so the first screen always reads as the game's sky.

### 3.1 Palette (tokens in `site-src/assets/site.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #fff6e3 | #0b2026 | page |
| `--surface` | #fffaf0 | #16323a | cards, tables |
| `--text` | #1d2b30 | #fff6e3 | body |
| `--text-soft` | #4b5c62 | #b8cacd | secondary |
| `--accent` | #a8520f | #ffab5c | labels, small accents |
| `--link` | #17606a | #ffc27f | links |
| `--hero-bg` / `--hero-text` | #16323a / #fff6e3 | #0f2a31 / #fff6e3 | hero and final band |
| `--cta` / `--cta-ink` / `--cta-edge` | #f2c14e / #1d2b30 / #c9922a | same, edge #b57c1f | buttons |
| `--focus` | #1f6f78 | #8ff0cf | focus ring |
| raw orange | #ef8a2f (logo), phosphor #8ff0cf (radar), red #e5533d (runways, decoration only) | | never for text |

Contrast (WCAG AA, checked by `site.test.mjs`): text 13.6:1 on cream, accent 5.0:1, link 6.7:1, ink on gold 8.7:1; dark text 15.7:1, accent 9.0:1, focus 12.4:1. Decorative colours are not used for text.

### 3.2 Type and space

- Display and UI: Fredoka 500, 600, 700 (self-hosted, Latin subset from the game; CJK falls back to the system's own fonts, no CJK font is shipped).
- H1 `clamp(2.1rem, 1.35rem + 3.6vw, 3.9rem)`, H2 `clamp(1.6rem, 1.2rem + 1.6vw, 2.4rem)`, body 17px / 1.6, minimum 16px. Prose column 68ch.
- Gutter `clamp(16px, 4vw, 40px)`; content width 1180px; section padding `clamp(40px, 6vw, 88px)`.
- Radius 22px cards, 12px small items, pill buttons (min 44px tap height, 52px for the main button).

### 3.3 Breakpoints and devices

Support 320px up. Layouts change at 420px (header button), 640px (two-column grids), 900px (split hero, 2 columns), 980px (inline navigation), 1280px (wide grids). Tests to run before publishing: 320, 360, 390 (phones, portrait), 768 and 1024 (tablets, portrait and landscape), 1280 and 1920 (laptop and wide desktop), each in light and dark, plus a foldable width (around 580 px). No horizontal scroll at any width (checked in a browser run; the build's 320px check is in the builder checklist).

### 3.4 Components

Header with menu (`details`, no script), footer, skip link, `.btn` (primary gold, ghost outline, small), `.btn-row`, hero with eyebrow and radar, `.stat-strip` (facts), `.card` and `.grid` (features, guides), `.figure` (game pictures), `.facts` (definition list for airport facts), `.table-wrap` (runways, routes), `.crumbs` (breadcrumbs), `.prose` (guides and about), `.search` with `.results` (airports hub), `.note` (warnings and caveats), `.badge-free`, `.consent` (only when GA4 is set).

### 3.5 Motion and the hero

- The hero's radar (static SVG, built into the page) turns on a 6-second CSS sweep. It stops under `prefers-reduced-motion` (CSS rule in `site.css`).
- Optional next step (builder task): a small canvas of approach paths and planes behind the hero text. Rules: requestAnimationFrame, DPR capped at 2, at most 12 planes, paused when off screen or the tab is hidden, a single static frame under reduced motion, and the static SVG stays as the no-JS fallback.
- No animation keeps information from a reader (no auto-carousels, no moving text).

### 3.6 Pictures

- Game pictures: the four existing pictures in `/shots/` (JPG, 1280x720), with the alt text and captions in `en.json`. Builders may convert to WebP with ImageMagick (installed in the build environment) and keep the JPG fallback.
- Store art copied into `site-src/assets/img/` (icon, feature graphic) for the press page.
- The app icon: `site-src/assets/img/icon.svg` is the disc icon as-is (header, favicon, press, the organization logo). `apple-touch-icon.png` is the same art full-bleed, without the rim rings, for the iOS mask. `logo.svg` is the plane alone (press page, legal pages). The rasters (`app-icon-512.png`, the press icon, the feature graphic and `default.jpg`, which embed the icon) are rendered from the SVG in a browser and the tile is composited; the four share images re-render with `tools/site/art/og.html`.
- Share images (Open Graph and Twitter): `/assets/site/og/default.jpg` (1200x630, the feature graphic on night teal) for every page, except the four pages below, which get their own 1200x630 image made from the same art (ImageMagick): home, press, events hub, guides hub.
- No per-airport images. Airport maps are inline SVG generated at build time (section 6.3).

## 4. Build system and page contract

Command: `node tools/site/build.mjs` writes everything this tool owns into the repository root. `node tools/site/build.mjs --check` writes nothing and exits 1 if the root differs from a fresh build. Tests: `node --test tools/site/site.test.mjs`. Node 22, no dependencies.

Files:

| Path | What it is |
| --- | --- |
| `site-src/config.json` | Domain, email, dates, analytics IDs, flags (`events`, `features`, `sections`, `languages[].live`), protected folders, adopted files |
| `site-src/data/` | `airports.json` (29,164 rows), `rw/` (runway shards), `busiest.json`, `countries.json`. Copied from the game repository by hand (sources in `tools/site/lib/data.mjs`) |
| `site-src/i18n/<code>.json` | Flat dotted keys; missing keys fall back to English and are counted in the build log |
| `site-src/assets/` | `site.css`, `site.js`, `fonts/`, `img/`, `og/`. Copied to `/assets/site/` |
| `tools/site/build.mjs` | The generator: loads modules, checks ownership, writes, removes stale files |
| `tools/site/pages/*.mjs` | One module per page family. Each exports `pages(ctx)` and optionally `order` |
| `tools/site/lib/` | `html.mjs` (escaping), `layout.mjs` (the page shell), `play.mjs` (Play links), `slug.mjs`, `i18n.mjs`, `data.mjs`, `files.mjs` |
| `site-src/.generated.json` | The list of files this tool owns. Only these can be removed by a build |

### 4.1 Module contract

```js
// tools/site/pages/guides.mjs
export const order = 40;                       // optional; lower runs first (default 50)
export async function pages(ctx) {
  const { config, data, t, lib } = ctx;        // lib: html, raw, esc, playLink, layout, slugify, airportPath, countryPath, jsonLdScript, sectionLive ...
  return [
    { path: '/guides/', html: lib.layout(ctx, { ... }), lastmod: '2026-10-27', section: 'guides', alternates: [] },
    { path: '/guides/how-to-play/', html: lib.layout(ctx, { ... }), lastmod: '2026-10-27', section: 'guides' },
    { path: '/robots.txt', content: '...' },   // any non-HTML output
  ];
}
```

- `ctx.previous` holds the outputs of earlier modules (the sitemap reads them, so it runs last with `order = 900`).
- Paths end in `/` (become `index.html`) or `.html`. Only `a-z 0-9 . _ - /` are allowed in output paths.
- Page metadata used by the sitemap: `lastmod`, `section`, `noindex`, `alternates`.
- `html` values are `html` tagged templates (every value is escaped unless wrapped in `raw()`). A plain string passed as `html` is written as it is. A plain string used as a `body` is escaped.
- Two guards: no two modules may write the same path; nothing may be written under a protected folder (`osm/`, `routes/`, `demo/`, `play/`, `privacy/`, `terms/`, `delete/`, `.well-known/`, `shots/`, `tools/maps/`, `.github/`, `store/`, `game/`, `app/`, `server/`, `legal/`, `tests/`, `site-src/`, `tools/site/`). An existing file that the build does not own is never overwritten unless `config.adopt` names it.

### 4.2 `layout(ctx, options)`

Options: `lang`, `path` (required), `title`, `description`, `section` (nav item to mark current), `playKey` (page key for Play links), `image` (site path, default the shared image), `imageAlt`, `ogType` (`website` or `article`), `jsonLd` (array of objects), `alternates` (hreflang set, with `x-default`), `noindex`, `bodyClass`, `body` (markup for `<main>`).

The shell adds: doctype, `lang`, viewport, `<title>`, description, canonical (on the domain, unless noindex), hreflang alternates, Open Graph and Twitter tags, the Search Console verification tag (kept from the old home page), icon, font preload, `site.css`, the analytics snippets (only when configured), JSON-LD, skip link, header, footer, consent banner (only when GA4 is set), and `site.js` (deferred).

### 4.3 How to add a page (builders)

1. Write `tools/site/pages/<family>.mjs` with `pages(ctx)` as above. Do not edit `build.mjs`.
2. Put user-facing words in `site-src/i18n/en.json` (keys), not in the module, so the other languages can follow.
3. If the section goes live, set `config.sections.<key>` to true. For a language, set `languages[].live` to true only when its homes exist.
4. Run `node tools/site/build.mjs` and `node --test tools/site/site.test.mjs`. Commit the generated files together with the source.

### 4.4 Content for non-developers

Guide and event text lives in JSON or Markdown under `site-src/content/` (builder task: a small Markdown subset renderer with headings, paragraphs, lists, links and emphasis, no dependencies), so the owner can edit words without touching code.

## 5. Play links and campaigns

Every Play link is built by `lib/play.mjs`:

```
https://play.google.com/store/apps/details?id=com.thinaircapital.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D<page>
```

- `<page>` is the page key: lowercase letters, digits and hyphens. Examples: `home`, `home-es-419`, `airport-kden`, `guide-how-to-play`, `press`, `events-weekend`. Keys are unique per page, so Play Console reports installs per page.
- An optional second key adds `%26utm_content%3D<position>` (`hero`, `header`, `menu`, `footer`, `footer-cta`).
- Test: every Play link in every page must match this exact shape.

## 6. SEO

### 6.1 Titles and descriptions (formulas, 70 characters or fewer for titles; 50 to 160 for descriptions)

| Page type | Title | Description pattern |
| --- | --- | --- |
| Home | Short Final ATC: Live Flights, the air traffic control game | "Short Final ATC is a free air traffic control game for Android with real live flights. Land the real planes at more than 29,000 airports, or try the browser demo." |
| Localized home | Translated equivalent of the home title, same claims | Translated equivalent |
| Airports hub | Airport maps and runways \| Short Final | Search more than 29,000 airports by code, name or city, with runways and maps where we have them. |
| Country hub | Airports in {Country} with maps \| Short Final | {n} airports in {Country} with OpenStreetMap layouts, runways and lengths. Play any of them in Short Final. |
| Airport | {Name} ({ICAO}) map and runways \| Short Final | Map of {Name} in {City}, {Country}: {n} runways, longest {L} ft, and the taxiways and gates from OpenStreetMap. |
| Guide | {Guide title} \| Short Final guide | The guide's first sentence, shortened. |
| Events | {Event}: {status} \| Short Final | What the event is, when it runs, and how to play it. |
| Press | Press kit: facts, logos and screenshots \| Short Final | Fact sheet, logos, screenshots and the trailer for Short Final by Thin Air Studios. |
| About | About Thin Air Studios \| Short Final | Who makes Short Final, how to contact us, and the data it uses. |
| 404 | Page not found \| Short Final | Noindex. |

Titles never repeat the page key or keywords twice. Descriptions say what the page shows, in plain words.

### 6.2 Canonical, hreflang, indexing

- Every indexable page has a canonical on https://playshortfinal.com with its own path (trailing slash).
- hreflang only where a translated page exists. Home alternates list every live language with `x-default` at `/`. Guides and airport pages are English only and carry no alternates.
- noindex only on the 404 page and on any thin page a builder deliberately marks (none planned at launch). Test: the list of noindex pages is fixed in `site.test.mjs`.
- No cloaking: the page HTML is the content users see. No keyword lists, no hidden text.

### 6.3 Structured data

| Page | JSON-LD |
| --- | --- |
| Home | Organization (Thin Air Studios, legalName, logo, contact), WebSite, MobileApplication (Android, GameApplication, offers price 0 USD, installUrl and downloadUrl = Play listing) |
| Airport | Airport (name, iataCode when present, icaoCode, geo, address with addressCountry), BreadcrumbList |
| Country hub | CollectionPage with ItemList of airport pages, BreadcrumbList |
| Guide | Article (headline, description, datePublished, dateModified, author and publisher Organization, mainEntityOfPage), BreadcrumbList |
| Press, About, Events, Hubs | WebPage (name, description, url), BreadcrumbList |
| Any page with a visible FAQ | FAQPage, only with the same questions visible on the page |

Never: AggregateRating, review or rating markup, download counts, or any number that is not on the page.

### 6.4 Sitemaps

- `/sitemap.xml` is an index; one sitemap per section (`home`, `airports`, `guides`, `events`, `press`, `about`), built from the pages the other modules made (non-noindex HTML).
- `lastmod` comes from each page's `lastmod`: airport pages use the map's capture date (`at` in the map file), guides their `dateModified`, others `config.contentDate`.
- Home sitemap carries the hreflang alternates for each language.
- robots.txt: everything allowed; PerplexityBot and Perplexity-User disallowed (kept from the old file); the sitemap named.

### 6.5 Airport pages (content plan)

Each page has: the name and codes; the facts (IATA, ICAO, elevation in feet, longest runway, number of runways, size class, and passengers with rank if the airport is in the game's top 50 list, ACI World 2025); the map (inline SVG); the runway table (idents, lengths, width, surface as hard, soft or unknown, lighting); published route data where the route files have the airport (count of airlines, most common destinations, with the snapshot date and the note that this is published standing data, not live schedules); nearby airports that have pages; a Play button ("Play {ICAO} in Short Final", campaign `airport-<icao>`) and the demo link (`/demo/?a=<ICAO>`); credits (map: OpenStreetMap contributors, ODbL, with the capture date; airports and runways: OurAirports, public domain).

No headings for runways are shown (see section 8.3). No claim about how busy or good an airport is beyond the ACI ranking the game uses.

Thin-content risk: airport pages are data pages. Each is unique (its own map and facts), but a page with almost no data (no city, no IATA, one runway, no routes) may be made noindex later if Search Console shows it as thin. Decision for later, after a month of data.

## 7. Guides (launch set, English)

Each guide's facts come from the game's README and store text (the source is named for each). No guide claims anything the game does not do today.

| Slug | Title (working) | Sources |
| --- | --- | --- |
| how-to-play | How to play Short Final | README "How to play" |
| drawing-paths | Drawing paths and landing | README, "How to play" |
| which-runway | Which runway each plane uses | README, "Which runway?" |
| holding-stacks | Holding patterns and holding stacks | README, "Holding stacks" |
| wake-turbulence | Wake turbulence, explained | README, "Wake turbulence" |
| emergencies | Engine failures and low fuel | README, "Emergencies" |
| runway-closures | Runway inspections and closures | README, "Runway inspections" |
| real-flights | Real flights, live data and "landing here" | README, "The live feed"; DECISIONS 55 |
| weather | Real weather in the game | README, "Real weather" under Settings |
| daily-challenge | The daily challenge and your streak | README, "The home screen" |
| weekend-events | Weekend events | `game/js/weekend.js`; DECISIONS 430 to 434 |
| share-and-video | Sharing results and making a video | README, Share and Video |

Guide pages carry `data-guide="<slug>"` on the article (site.js sends `guide_read_75`), Article JSON-LD and a "Play this" button with campaign `guide-<slug>`.

## 8. Facts, data and reliability

### 8.1 Airport rows (`site-src/data/airports.json`, copied from the game)

- Row layout confirmed against `game/js/airportdb.js`: `[icao, iata, name, city, country, lat, lon, elevationFt, kind, longestRunwayFt]`. `kind` is `L`, `M` or `S` (OurAirports large, medium, small). Elevation is in feet (Denver: 5,431 ft in the data; the published figure is 5,434 ft, so a difference of a few feet is normal).
- 29,164 rows, 29,112 unique codes. 52 codes are used by more than one row. SD24 is one of them and has a map, so it gets no airport page. Search lists every row, so a duplicated code can show two results.
- 159 of the mapped airports have no city. The page uses the name only.
- IATA is present for 4,669 of the 6,239 mapped airports; an empty IATA means the source has none.
- Country codes: 239 ISO codes. English names are in `countries.json` (generated once so builds do not depend on the ICU version of the build machine).
- The game says "more than 29,000 airports" and the data has 29,164 rows, so "more than 29,000" is true. The site computes its number from the data and rounds down.

### 8.2 Maps (`osm/`, read only)

- 6,239 airports have a map: 6,239 compact `.json.gz` files, and 1,216 plain `.json` files (the game asks for the `.gz` first). `ZYYJ` has both.
- Each map has `v`, `at` (capture date, 8 to 25 Oct 2026; most on 20 Oct), `e` (elements: nodes `n`, ways `w`, relations `r` with flat coordinate lists) and `s` (surroundings: `coast` lines, `water` polygons, `peaks` points, version 2).
- Element counts on the busiest airports include gates, terminals, taxiways, aprons and runways (for example, Denver has 177 gates, 393 taxiway elements, 6 runway elements, 6 terminal elements, 24 aprons).
- The map robot adds maps to `main`. This build reads `osm/` as it is at build time; the number of airport pages follows the maps.

### 8.3 Runways (`site-src/data/rw/`, copied from the game)

- Shards by the first character of the ICAO code. All 6,239 mapped airports have runway rows.
- Tuple: `[le_ident, he_ident, lengthFt, widthFt, surface, lighted, le_lat, le_lon, he_lat, he_lon, le_heading]`. Surface codes: `H` hard, `S` soft, `?` unknown (the game's own rule; `W` water runways are not in the data).
- The heading value is OurAirports' own figure and disagrees with the runway ident in some cases (Denver's 07/25 shows 90 degrees). Publish the idents, never the headings.
- The longest runway in the data matches `longestRunwayFt` for every airport except SD24.

### 8.4 Busiest list (`site-src/data/busiest.json`)

- 50 airports, ACI World 2025 results, as the game lists them (`game/js/airportdb.js`, BUSIEST). Rank 1 is Atlanta (KATL, 106.3 million passengers), rank 50 is São Paulo (SBGR, 47.2 million). The source name is written into the file.

### 8.5 Routes (`routes/`, read only)

- 1,507 airlines in 1,564 files, plus 7 split files and `manifest.json`. 620,391 routes; 34,704 are multi-leg (more than two stops).
- Snapshot 14 Oct 2026, from the Virtual Radar Server standing data (CC0). Standing data is published schedules, not live flights. The airport page must say so.
- 3,058 of the 6,239 mapped airports appear in the route data. 740 stop codes are not among the 6,240 airports of the old demo list; they are in the full 29,164-row list.

### 8.6 Game facts used on the site (checked against the repository today)

| Fact | Status |
| --- | --- |
| Real flights from OpenSky, no account | Yes (README, live feed) |
| Real weather from aviationweather.gov sets wind and runway | Yes (README, Settings) |
| Daily challenge is always free; first 3 days unlimited; then 3 free games a day; Pro $2.99 one-time | Yes (README, Short Final Pro; store listing). The price is set by Google Play |
| 24 achievements, 7 leaderboards, Play Games sign-in | Yes, from 2.7 (README) |
| Friend challenge links | In the code from 3.2 (DECISIONS 413 to 415). Not in the Play listing text yet |
| Weekend events: four twists, rotating weekly; first weekend 31 Oct 2026 | In the code from 3.3 (`weekend.js`, DECISIONS 430). Not in the Play listing text yet |
| Home-screen widget | In the code from 3.3 (`DailyWidget.kt`) |
| Video for TikTok, YouTube Shorts, Instagram Reels, 20 seconds | Yes (README, Video) |
| Seven original music tracks | Yes (README, store listing) |
| Google Play listing live | Yes for 3.0 and 3.1 per the repository's notes. 3.2 and 3.3 are not confirmed on Play. Set `game.playVersion` when the owner confirms |
| Thanksgiving Rush, Santa, challenge boards | Planned for 3.4 (not in the code). Shown only as "coming" while `events.*.live` and `features.challengeBoards` are false |

Where a claim depends on a version that is not yet on Play, the copy says "from version 3.3" (or the version) rather than implying the Play listing has it.

## 9. Localization

- 13 homes: English plus 12 (es-ES at `/es/`, es-419 at `/es-419/`, pt-BR at `/pt-br/`, de-DE, fr-FR, it-IT, ja-JP, ko-KR, zh-TW, tr-TR, id-ID, pl-PL). Codes in `config.languages`.
- Translated home copy starts from the store listing translations (`store/listing/translations.csv` in the game repository; short and full descriptions per language). Claims must match the English page exactly. A translator sees missing keys in the build log.
- A language's home is switched on by `live: true` only after its page exists. Its hreflang, footer link and sitemap entry appear with it.
- Guides and airport pages are English at launch. Translating the top guides is a later step, driven by store installs per country.
- CJK text uses the system fonts listed in the stylesheet (no CJK font shipped).

## 10. Analytics (full detail in `site-src/ANALYTICS.md`)

- Cloudflare Web Analytics: the beacon is added only when `analytics.cfBeacon` holds a token. It is cookieless.
- Google Analytics 4: loads only when `analytics.ga4` holds a `G-` ID. Consent Mode v2: all storage denied until the visitor accepts; a banner (Accept / Decline) remembers the choice in localStorage; a stored Accept is applied before the first page view.
- Events: `play_store_click`, `demo_start`, `language_change`, `outbound_click`, `guide_read_75`, `press_download`.
- Privacy policy text for the website analytics: `site-src/PRIVACY-ADDITION.md`, for the lead to apply in the game repository.

## 11. Performance and accessibility budgets

| Item | Budget | Now |
| --- | --- | --- |
| Home HTML | 25 KB | 16 KB |
| Airport page HTML (with inline map) | 30 KB | to measure after the map builder |
| `site.css` | 20 KB | 16 KB |
| `site.js` | 6 KB | 4 KB |
| Fonts | 3 files, about 16 KB each, 600 preloaded | as stated |
| Third-party scripts | none unless configured (GA4 about 70 KB; Cloudflare beacon about 3 KB) | none |
| Mobile Lighthouse | performance, SEO, accessibility, best practices 95 or more | to measure |
| LCP (home, mobile) | under 2.0 s (hero text, no hero picture) | to measure |
| CLS | 0 | by design (sized images, no late-loading banners above the fold) |

Accessibility: WCAG 2.2 AA. Skip link, one `h1` per page, landmarks, visible focus (3px ring), 44px tap targets, alt text on pictures, labelled search and form fields, `lang` on every page, reduced motion respected, colour contrast from tokens (tested). The consent banner is a labelled region, keyboard reachable, and does not block the page.

## 12. Growth plan

### 12.1 Launch (week 0 to 1): owner steps

1. Cloudflare Pages: connect the repository (branch with the built files), set the build output to the repository root, add playshortfinal.com, and redirect www to the apex.
2. Google Analytics 4: create the property and a web stream for playshortfinal.com; send the `G-` ID (set `analytics.ga4`).
3. Cloudflare Web Analytics: create a site; send the token (set `analytics.cfBeacon`).
4. Search Console: verify (the verification tag is already on every page), submit `https://playshortfinal.com/sitemap.xml`, and check the index and coverage reports after a week.
5. Bing Webmaster Tools: import from Search Console.
6. Play Console: set the store listing's Website to https://playshortfinal.com, and check the listing's links use the referrer format.
7. Privacy policy: apply `site-src/PRIVACY-ADDITION.md` in the game repository and rebuild the legal pages.
8. Tell us which version is live on Play (`game.playVersion`).

### 12.2 Search (weeks 1 to 8)

- Airport pages: the largest long-tail group. Queries are the airport's own name, its code and "runway length" or "map" questions. Watch Search Console impressions by page type; fix titles where many pages get impressions and no clicks.
- Guides: the 12 guides answer the questions people ask before installing (how to play, real flights, what the holds mean). Each links to the Play page and to the demo.
- Country hubs: capture "airports in {country}" searches and link down to the airport pages.
- Localized homes, in order of store installs per country (owner's data from Play Console): start with the languages that the listing already sells in.

### 12.3 Links and communities (weeks 2 to 12)

- Creator outreach: the outreach kit (separate workstream) links to the press page and the trailer.
- Aviation and flight-sim communities: post real content (a map of an airport, a guide), with the site as the source, following each community's rules. No link schemes, no paid links, no fake reviews.
- Event launches: a post for each weekend event and each holiday event, linking to its event page.
- Open-source credit: the airport map credit links to OpenStreetMap's copyright page (the required attribution), and the data credits list the sources.
- Store-side: the trailer's description and the Play listing link to the site.

### 12.4 Measure and iterate (weekly, from week 1)

- Weekly review (one page, 15 minutes): Search Console clicks and impressions by page type and top queries; GA4 `play_store_click` by page and position; `demo_start`; Play Console installs by campaign (`utm_campaign`); consent rate.
- Monthly: decide the thin-page rule, translation priorities, and the next guides, from the data.
- Experiments after month one: hero headline and first button wording (two variants, the same claims), measured by `play_store_click` per visit.

### 12.5 Seasons and events

- Holiday pages (`/events/thanksgiving-rush/`, `/events/santa/`) exist from the launch build with "coming" copy. When the owner sets `events.<name>.live` to true, the same build shows "live now" copy with the date from config. Nothing is announced until the flag is true.
- Weekend page: explains the rotation from the game's own rule. A later step can list the next weekends' twists, computed from the same rule at build time.

## 13. Owner-facing notes

- The owner is not technical. Every step that needs an account (Cloudflare, Google Analytics, Search Console, Play Console) is listed in 12.1 with what to send back.
- The site never shows the owner's name. Contact is the email in `config.json`, and the public identity is Thin Air Studios.

## 14. Checks before each publish

1. `node tools/site/build.mjs` then `node tools/site/build.mjs --check` (no differences).
2. `node --test tools/site/site.test.mjs` (all pass; warnings for legacy pages are reported, not failed).
3. Browser check at 320, 360, 390, 768, 1024, 1280 and 1920 widths, light and dark: no horizontal scroll, no console errors, the consent banner shows only with GA4 set.
4. Read the copy against the facts table in 8.6 (any new claim needs a source).
5. Search Console: the sitemap has no errors; a new page appears in the next sitemap.

## 15. Known issues outside this repository, and open decisions

- `demo/js/config.js` (built by the game repository's `tools/build-demo.mjs`) contains a worker address that includes the owner's name. It must change in the game repository, and the demo rebuilt. The site's tests report it.
- `privacy/index.html` (built from the game's legal text) names one model provider as a service provider for the name check. The rules for this repository forbid such names in its pages. This is a legal disclosure question for the lead: the text is built elsewhere and is not edited here. The test reports it.
- `terms/index.html` is reported by the same test for the same reason; check it in the same pass.
- The browser demo at `/demo/` still shows the old art: the plane mark in its menu (`demo/img/logo.svg`, fill #06262C, linked from `demo/index.html`) and the old app icon in the top band of its video (`demo/img/icon.svg`, sky #2E9AA2, loaded by `demo/js/videorender.js`). `demo/` is built elsewhere and is not edited here, so the new icon does not reach it. Owner decision: copy the two SVGs from `site-src/assets/img/` in the game repository's demo build, or accept these as known residuals.
- The Cloudflare Pages deployment uploads the whole repository root, so `site-src/` (about 5 MB, mostly data) and `tools/site/` are published as static files too. They count toward the 20,000 file limit (about 40 files). Acceptable, or the lead can add a mirrored output folder later.
- No GitHub Action is added here (the maps workflows must not change). A workflow that runs `node tools/site/build.mjs --check` and the tests on pull requests is recommended and is a separate decision.
- Commit attribution: the session's attribution rule and the workflow's text name different model versions for the co-author line. The commit follows the session rule.
- The weekend event and the friend challenge links are in the code, not yet in the Play listing text. The copy says so.
- **Content-Security-Policy (3.4): written, not sent.** `tools/site/pages/headers.mjs` writes a `_headers` policy whose `connect-src` lists `api.playshortfinal.com` on the airport and board pages. Nothing sends it: GitHub Pages does not read `_headers`, and the edge Worker (`tools/edge/worker.js`) copies the origin's headers and adds no policy. Open owner decision: enforce it (the Worker sends a policy per page, with the script hashes from the built pages, checked in a browser first), or drop the policy. Until then no page or note says the policy is enforced.
- **Board Play button is not counted (3.4, D12).** The board page's own Play buttons send no `play_store_click`; the site-wide header and footer do (`page` = `challenge`). Open owner decision: keep D12 as built (the test forbids `data-event` on the board's content), or count the board's button too.
- Total file count: 9,220 tracked now; about 6,240 airport pages and about 300 other pages and assets add to about 15,800 (limit 18,000). If the map robot finishes (about 6,500 maps), the count stays under the limit.
