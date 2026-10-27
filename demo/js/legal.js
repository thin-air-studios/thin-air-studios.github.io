import { WEB_DEMO, assetUrl } from './flavor.js?v=86c2b44d';
import { DEMO_LEGAL_URLS } from './demo.js?v=86c2b44d';
// The in-app legal pages (requirement 25, screens 8.2): one sheet with three tabs, one iframe per tab. Each page is
// generated from legal/*.md by tools/build-legal.mjs, so it reads offline. A link out of a page comes up through
// HP_outbound, which opens the phone's browser or mail app.
import { openExternal } from './platform.js?v=86c2b44d';
import { register, openScreen } from './screenstack.js?v=86c2b44d';

export const LEGAL_PAGES = {
  terms: 'legal/terms.html',
  privacy: 'legal/privacy.html',
  licences: 'legal/licences.html',
};

const $ = (id) => document.getElementById(id);

/** Opens the sheet on one tab. A tab's page loads the first time it is shown. */
export function openLegal(tab = 'terms') {
  // the demo's Terms and policy are the website's pages, in a new tab; its licences are the one copy in the demo (DECISIONS 446)
  if (WEB_DEMO && DEMO_LEGAL_URLS[tab]) {
    window.open(DEMO_LEGAL_URLS[tab], '_blank', 'noopener');
    return;
  }
  const on = LEGAL_PAGES[tab] ? tab : 'terms';
  document.querySelectorAll('[data-legal-tab]').forEach((b) => {
    const picked = b.dataset.legalTab === on;
    b.setAttribute('aria-selected', String(picked));
    b.tabIndex = picked ? 0 : -1;
  });
  document.querySelectorAll('[data-legal-frame]').forEach((f) => {
    const picked = f.dataset.legalFrame === on;
    f.hidden = !picked;
    if (picked && !f.getAttribute('src')) f.src = assetUrl(LEGAL_PAGES[on]);
  });
  $('legal').classList.add('show');
  openScreen('legal');
}

export function initLegal() {
  // the generated pages call this for their outside links (data-ext); the phone opens them
  window.HP_outbound = (url) => openExternal(url);
  register('legal', () => $('legal').classList.remove('show'), () => $('legal').classList.contains('show'));
  document.querySelectorAll('[data-legal-tab]').forEach((b) => {
    b.addEventListener('click', () => openLegal(b.dataset.legalTab));
  });
  // About's three links: the sheet opens on the tab they name (the sheet stacks over About, and Back returns to it)
  document.querySelectorAll('[data-legal]').forEach((b) => {
    b.addEventListener('click', () => openLegal(b.dataset.legal));
  });
}
