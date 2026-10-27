// The localized home pages (/es/, /es-419/, /pt-br/, /de/, /fr/, /it/, /ja/, /ko/, /zh-tw/, /tr/, /id/, /pl/). Each is the English
// home's blocks, with the store listing's text in that language (site-src/home/<code>/: title, short and full description) and
// the few UI strings in site-src/i18n/<code>.json. The game is in English; the store text says so on each page, as it does on
// Google Play. A language is built only while its entry in config.languages has live set to true.
import fs from 'node:fs';
import path from 'node:path';
import { html } from '../lib/html.mjs';
import { storeBody, storeHeadline } from '../lib/brand.mjs';
import { homeAlternates, homeJsonLd, heroBlock, statsBlock, picturesBlock, trailerBlock, pickSection, finalBlock, shell, brandScript } from './home.mjs';
import { localHomeBlock } from '../lib/localairports.mjs';

export const order = 11;

function readStore(ctx, code, file) {
  const full = path.join(ctx.root, 'site-src', 'home', code, file);
  return fs.readFileSync(full, 'utf8');
}

/** The localized page for one language: the store copy, the hero and the blocks shared with the English home. */
function localizedPage(ctx, language) {
  const { config, t } = ctx;
  const code = language.code;
  const L = (key, vars) => t(code, key, vars);
  const title = readStore(ctx, code, 'title.txt').trim();
  const short = readStore(ctx, code, 'short-description.txt').trim();
  const full = readStore(ctx, code, 'full-description.txt');
  const playKey = `home-${code}`;
  const description = `${short} ${L('home.descAdd')}`;

  const body = html`
  ${heroBlock(ctx, code, { eyebrow: L('home.eyebrow'), h1: storeHeadline(full), lead: short, freeNote: L('home.freeNote'), playKey, phoneAlt: L('home.shot1Caption') })}
  ${statsBlock(ctx, code)}
  <section class="section">
    <div class="wrap prose store-copy">
      ${storeBody(full)}
    </div>
  </section>
  ${picturesBlock(ctx, code)}
  ${trailerBlock(ctx, code)}
  ${pickSection(ctx, code)}
  ${localHomeBlock(ctx, code)}
  ${finalBlock(ctx, code, playKey)}
  ${brandScript}`;

  const jsonLd = homeJsonLd(ctx, { name: config.siteName, description, inLanguage: language.htmlLang, url: `${config.domain}${language.path}` });
  return shell(ctx, {
    lang: code,
    path: language.path,
    title,
    description,
    section: 'home',
    playKey,
    body,
    jsonLd,
    imageAlt: L('home.ogAlt'),
  });
}

export async function pages(ctx) {
  const { config } = ctx;
  const out = [];
  for (const language of config.languages) {
    if (language.code === 'en' || language.live === false) continue;
    out.push({
      path: language.path,
      html: localizedPage(ctx, language),
      lastmod: config.contentDate,
      section: 'home',
      alternates: homeAlternates(config),
    });
  }
  return out;
}

