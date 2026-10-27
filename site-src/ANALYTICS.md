# Website analytics

Two measurement tools, both optional and both off until their IDs are set in `site-src/config.json`:

| Tool | Setting | What it does |
| --- | --- | --- |
| Cloudflare Web Analytics | `analytics.cfBeacon` (32-character token) | Counts page views. Cookieless. The beacon script is added to every page only when the token is set. |
| Google Analytics 4 | `analytics.ga4` (`G-` measurement ID) | Page views, the events below and Google's own enhanced measurement. Loads only when the ID is set, and only with consent (below). |

## Consent (Google Analytics only)

- Consent Mode v2 defaults are set first, and Google's script is added only after Accept: `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` are all `denied`.
- When the ID is set, a banner appears once, at the bottom of the page, with **Accept** and **Decline**. Its text: "We measure visits with Google Analytics only if you say yes…".
- The choice is stored in the browser's local storage under the key `sf-consent` (`granted` or `denied`). Storage can be blocked or cleared; then the banner returns, and the page works the same.
- Accept sends `consent update` with `analytics_storage: granted` and then adds Google's script. A stored Accept adds the script at once on later visits. Decline, or no choice yet, means no request to Google at all.
- With no GA4 ID, there is no banner and no Google script.

## Events

Names are lowercase snake_case (GA4 limits: 40 characters, values up to 100). Parameters come from data attributes on the element: `data-ev-<name>` becomes parameter `<name>` (hyphens become underscores).

| Event | Fired when | Parameters | Markup |
| --- | --- | --- | --- |
| `play_store_click` | A Google Play link is clicked | `page` (page key), `position` (`hero`, `header`, `menu`, `footer`, `footer-cta`, or the airport and guide positions) | `<a data-event="play_store_click" data-ev-page="airport-kden" data-ev-position="card">` |
| `demo_start` | The browser demo link is clicked | `airport` (ICAO, when the link names one), `page` if given | `<a data-event="demo_start" data-ev-airport="KDEN">` |
| `language_change` | A language link in the footer is clicked | `from` (current language code), `to` (target code) | Set by the layout on every language link |
| `outbound_click` | Any link to another host is clicked (set by `site.js`) | `url_host` (host only, no path) | Automatic |
| `guide_read_75` | A reader reaches 75% of a guide's article (once per page) | `guide` (slug) | `<article data-guide="how-to-play">`; set by `site.js` |
| `press_download` | A press file is downloaded | `file` (short name: `press-kit-zip`, `icon-512`, `feature-graphic`, `logo-svg`) | `<a href="/assets/site/brand/press/icon-512.png" download data-event="press_download" data-ev-file="icon-512">` |

Rules for markup: put `data-event` on the link or button itself. Values are plain words (no names, no addresses, no email). Airport codes are public (ICAO codes) and may be sent.

### Calling the helper from a script

Any script on any page can send an event with the global helper that `site.js` defines:

```js
window.sfTrack('play_store_click', { page: 'airport-kden', position: 'card' });
```

- The first argument is an event name from the table above (or a new name agreed here first). The second is an object of plain values; it may be left out.
- It does nothing when GA4 is not set, and nothing is sent until the visitor accepts. It never throws, so a page does not break when analytics is off.
- A script should call it only after the page has loaded, and only from a user's action (a click or a submit), never on page load.
- The home page's own script (`/assets/site/brand/home.js`) does not call it: the trailer and the airport search are links and buttons with `data-event` attributes where needed.

### Where the brand pages send events

| Page | Events and positions |
| --- | --- |
| Home and the 12 localized homes | `play_store_click` with `page` = `home` or `home-<code>`, and `position` = `hero`, `header`, `menu`, `footer-cta` or `footer`; `demo_start` (no airport); `language_change` (the language list in the hero and the footer) |
| Press kit (`/press/`) | `play_store_click` (`position` = `press-cta`); `press_download` with `file` = `press-kit-zip`, `icon-512`, `feature-graphic` or `logo-svg` |
| Events (`/events/`, `/events/weekend/`, `/events/<holiday>/`) | `play_store_click` with `page` = `events-hub`, `events-weekend`, `events-thanksgiving-rush` or `events-santa`, and `position` = `event`; `demo_start` |
| 404 page | `play_store_click` (`page` = `notfound`) from the header and footer only |


GA4 key events (mark these as conversions in the GA4 admin): `play_store_click`, `demo_start`.

## UTM rules (Play Console attribution)

Every Play link is built by `tools/site/lib/play.mjs` in exactly this form:

```
https://play.google.com/store/apps/details?id=com.thinaircapital.holdingpattern&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D<page>[%26utm_content%3D<position>]
```

- `utm_source` is always `site`, and `utm_medium` is always `web`.
- `utm_campaign` is the page key: the page's own short name, lowercase, letters, digits and hyphens only, unique for each page. Examples: `home`, `home-es-419`, `airport-kden`, `guide-how-to-play`, `press`, `events-weekend`, `about`.
- `utm_content` is the position on the page: `hero`, `header`, `menu`, `footer`, `footer-cta`, and on the brand pages also `press-cta` and `event`.
- The keys in use for the brand pages: `home`, `home-es`, `home-es-419`, `home-pt-br`, `home-de`, `home-fr`, `home-it`, `home-ja`, `home-ko`, `home-zh-tw`, `home-tr`, `home-id`, `home-pl`, `press`, `events-hub`, `events-weekend`, `events-thanksgiving-rush`, `events-santa`, `notfound`.
- A new page key is chosen when a page is added; keys are never reused for another page.
- The game's browser demo uses its own source, `web-demo`, for its links to Google Play (set in the game repository). Do not change that here.
- Play Console reports installs by these values under acquisition; GA4 reports `play_store_click` by the same `page` value, so the two can be compared.

## Setup checklist (owner)

1. Create a GA4 property and a web data stream for `https://playshortfinal.com`. Send the `G-` measurement ID; set `analytics.ga4`.
2. Mark `play_store_click` and `demo_start` as key events.
3. Create a Cloudflare Web Analytics site for `playshortfinal.com`. Send the token; set `analytics.cfBeacon`.
4. Rebuild (`node tools/site/build.mjs`) and check: with GA4 set, the banner shows once; Accept and Decline both hide it; a Play click appears in GA4 DebugView.
5. Apply `site-src/PRIVACY-ADDITION.md` to the privacy policy in the game repository.

## What is not collected

No names, no email addresses, no account IDs, no free-text fields, no search text from the airports hub (the search runs in the browser and sends nothing). Search Console and Bing Webmaster Tools report search queries to their owners, which is their normal function.

## Parameters on play_store_click

- `page`: the page key in the Play link's campaign: `home`, `press`, `events`, `airport-<icao>` (airport pages), `country-<slug>` (country hubs), `guide-<slug>` (guides), or another section key.
- `airport`: the ICAO code, upper case, on airport pages only (hero and footer buttons).
- `position`: where the button sits: `hero`, `header`, `menu`, `footer` or `footer-cta`.

The Play link's `utm_campaign` is the same `page` value, so Play Console can split installs per page.
