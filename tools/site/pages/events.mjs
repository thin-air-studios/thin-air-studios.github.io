// The events: the hub (/events/), the weekend event (/events/weekend/) and the two holiday events, which are planned for version 3.4
// (/events/thanksgiving-rush/ and /events/santa/). A holiday page shows its "live" copy only when config.events.<name>.live is
// true; until then it says "coming" (rule 6: nothing is announced as in the game before its flag is set). Event structured data
// (schema.org Event with a VirtualLocation) is written only for an event that is live.
import fs from 'node:fs';
import path from 'node:path';
import { html } from '../lib/html.mjs';
import { layout } from '../lib/layout.mjs';
import { playLink } from '../lib/play.mjs';
import { markdown } from '../lib/brand.mjs';
import { brandScript } from './home.mjs';

export const order = 35;

// The holiday dates (ISO, for the structured data and the "dates" line). The event pages show the words in i18n/en.json.
const HOLIDAYS = {
  thanksgiving: { slug: 'thanksgiving-rush', start: '2026-11-25', end: '2026-11-29', nameKey: 'events.thanksgivingName', lineKey: 'events.thanksgivingLine', datesKey: 'events.thanksgivingDates' },
  santa: { slug: 'santa', start: '2026-12-24', end: '2026-12-24', nameKey: null, lineKey: 'events.santaLine', datesKey: 'events.santaDates' },
};

function statusOf(config, key) {
  return config.events[key] && config.events[key].live === true ? 'live' : 'coming';
}

export async function pages(ctx) {
  const { config, t, root } = ctx;
  const lang = 'en';
  const L = (key, vars) => t(lang, key, vars);
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const santaName = config.events.santa.name || 'Santa';
  const thanksName = config.events.thanksgiving.name || L('events.thanksgivingName');
  const out = [];

  // ----- the hub -----
  const weekendStatus = config.events.weekend.live ? L('events.status.from33') : L('events.status.soon');
  const card = (href, name, line, status, cls) => html`<article class="card event-card">
        <p class="status ${cls}">${status}</p>
        <h2>${name}</h2>
        <p>${line}</p>
        <p><a class="btn btn--sm btn--ghost" href="${href}">${L('events.openEvent')}</a></p>
      </article>`;
  const thanksStatus = statusOf(config, 'thanksgiving');
  const santaStatus = statusOf(config, 'santa');
  const hubBody = html`
  <section class="page-head section--tight">
    <div class="wrap">
      <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li aria-current="page">${L('events.hubTitle')}</li></ol></nav>
      <h1>${L('events.hubTitle')}</h1>
      <p class="lead">${L('events.hubLead')}</p>
      <div class="btn-row">
        <a class="btn" href="${playLink('events-hub', 'event')}" data-event="play_store_click" data-ev-page="events-hub" data-ev-position="event">${L('cta.getOnPlay')}</a>
        <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="wrap grid">
      ${card('/events/weekend/', L('events.weekendName'), L('events.weekendLine'), weekendStatus, config.events.weekend.live ? 'status--live' : 'status--coming')}
      ${card(`/events/${HOLIDAYS.thanksgiving.slug}/`, thanksName, L(HOLIDAYS.thanksgiving.lineKey), thanksStatus === 'live' ? L('events.status.live') : L('events.status.coming'), thanksStatus === 'live' ? 'status--live' : 'status--coming')}
      ${card(`/events/${HOLIDAYS.santa.slug}/`, santaName, L(HOLIDAYS.santa.lineKey), santaStatus === 'live' ? L('events.status.live') : L('events.status.coming'), santaStatus === 'live' ? 'status--live' : 'status--coming')}
    </div>
  </section>
  ${brandScript}`;
  out.push({
    path: '/events/',
    html: layout(ctx, {
      lang,
      path: '/events/',
      title: `${L('events.hubTitle')} | Short Final`,
      description: L('events.hubDesc'),
      section: 'events',
      playKey: 'events-hub',
      image: '/assets/site/brand/og-events.jpg',
      imageAlt: L('events.ogAlt'),
      jsonLd: [breadcrumbs(config, [['Home', '/'], [L('events.hubTitle'), '/events/']], L)],
      body: hubBody,
    }),
    lastmod: config.contentDate,
    section: 'events',
  });

  // ----- the weekend -----
  const weekendBody = html`
  <section class="page-head section--tight">
    <div class="wrap">
      <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li><a href="/events/">${L('events.hubTitle')}</a></li><li aria-current="page">${L('events.weekendName')}</li></ol></nav>
      <h1>${L('events.weekendName')}</h1>
      <p class="status ${config.events.weekend.live ? 'status--live' : 'status--coming'}">${weekendStatus}</p>
      <p class="lead">${L('events.weekendLine')}</p>
      <div class="btn-row">
        <a class="btn" href="${playLink('events-weekend', 'event')}" data-event="play_store_click" data-ev-page="events-weekend" data-ev-position="event">${L('events.playThis')}</a>
        <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="wrap prose">
      <p class="note">${L('events.weekendFirst')} ${L('events.weekendDate')}</p>
      ${markdown(read('site-src/events/weekend.md'))}
    </div>
  </section>
  ${brandScript}`;
  out.push({
    path: '/events/weekend/',
    html: layout(ctx, {
      lang,
      path: '/events/weekend/',
      title: `${L('events.weekendName')}: ${weekendStatus} | Short Final`,
      description: L('events.weekendDesc'),
      section: 'events',
      playKey: 'events-weekend',
      image: '/assets/site/brand/og-events.jpg',
      imageAlt: L('events.ogAlt'),
      jsonLd: [breadcrumbs(config, [['Home', '/'], [L('events.hubTitle'), '/events/'], [L('events.weekendName'), '/events/weekend/']], L)],
      body: weekendBody,
    }),
    lastmod: config.contentDate,
    section: 'events',
  });

  // ----- the holiday events -----
  for (const key of ['thanksgiving', 'santa']) {
    const holiday = HOLIDAYS[key];
    const status = statusOf(config, key);
    const name = key === 'thanksgiving' ? thanksName : santaName;
    const statusText = status === 'live' ? L('events.status.live') : L('events.status.coming');
    const line = L(holiday.lineKey);
    const dates = L(holiday.datesKey);
    const bodyFile = `site-src/events/${holiday.slug}.${status === 'live' ? 'live' : 'coming'}.md`;
    const playKey = `events-${holiday.slug}`;
    const canonical = `${config.domain}/events/${holiday.slug}/`;
    const body = html`
  <section class="page-head section--tight">
    <div class="wrap">
      <nav class="crumbs" aria-label="${L('crumb.label')}"><ol><li><a href="/">${L('crumb.home')}</a></li><li><a href="/events/">${L('events.hubTitle')}</a></li><li aria-current="page">${name}</li></ol></nav>
      <h1>${name}</h1>
      <p class="status ${status === 'live' ? 'status--live' : 'status--coming'}">${statusText}</p>
      <p class="lead">${line}</p>
      <p class="event-dates"><b>${L('events.dateLabel')}:</b> ${dates}</p>
      <div class="btn-row">
        <a class="btn" href="${playLink(playKey, 'event')}" data-event="play_store_click" data-ev-page="${playKey}" data-ev-position="event">${L('cta.getOnPlay')}</a>
        <a class="btn btn--ghost" href="${config.demoPath}" data-event="demo_start">${L('cta.demo')}</a>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="wrap prose">
      ${status === 'live' ? '' : html`<p class="note">${L('events.comingNote')}</p>`}
      ${markdown(read(bodyFile))}
    </div>
  </section>
  ${brandScript}`;
    const jsonLd = [breadcrumbs(config, [['Home', '/'], [L('events.hubTitle'), '/events/'], [name, `/events/${holiday.slug}/`]], L)];
    if (status === 'live') {
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name,
        description: `${line} ${dates}.`,
        startDate: holiday.start,
        endDate: holiday.end,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url: canonical },
        isAccessibleForFree: true,
        url: canonical,
        organizer: { '@type': 'Organization', name: config.publisher, url: `${config.domain}/` },
      });
    }
    out.push({
      path: `/events/${holiday.slug}/`,
      html: layout(ctx, {
        lang,
        path: `/events/${holiday.slug}/`,
        title: `${name}: ${statusText} | Short Final`,
        description: `${line} ${dates}.`,
        section: 'events',
        playKey,
        image: '/assets/site/brand/og-events.jpg',
        imageAlt: L('events.ogAlt'),
        jsonLd,
        body,
      }),
      lastmod: config.contentDate,
      section: 'events',
    });
  }
  return out;
}

function breadcrumbs(config, items, L) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${config.domain}${href}` })),
  };
}

