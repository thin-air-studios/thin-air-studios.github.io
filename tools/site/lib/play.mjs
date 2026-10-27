// The Google Play link for every website page. The referrer names the source ("site"), the medium ("web") and the page, so Play
// Console attributes installs per page (ANALYTICS.md). Format fixed by the owner's rule 7: do not change its shape.
import { raw } from './html.mjs';

const PLAY_BASE = 'https://play.google.com/store/apps/details?id=com.thinaircapital.holdingpattern';
const KEY = /^[a-z0-9-]{1,60}$/;

/**
 * playLink('airport-kden') -> the Play URL with referrer utm_source=site, utm_medium=web, utm_campaign=airport-kden.
 * extra (optional, same key format) adds utm_content, e.g. the position of the button on the page.
 * Returns a plain string (the caller escapes it as an attribute value).
 */
export function playLink(page, extra) {
  if (!KEY.test(page)) throw new Error(`playLink: page key "${page}" must be lowercase letters, digits and hyphens`);
  let referrer = `utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3D${page}`;
  if (extra !== undefined) {
    if (!KEY.test(extra)) throw new Error(`playLink: extra "${extra}" must be lowercase letters, digits and hyphens`);
    referrer += `%26utm_content%3D${extra}`;
  }
  return `${PLAY_BASE}&referrer=${referrer}`;
}

export const PLAY_LISTING = PLAY_BASE;
