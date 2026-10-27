// The build flavour (DECISIONS 445). The sources are 'app', the Android game. tools/build-demo.mjs writes 'web-demo' and a BUILD
// stamp into the demo's copy of this file, and into nothing else. No host name or address is tested anywhere.
export const FLAVOR = 'web-demo';
export const WEB_DEMO = FLAVOR === 'web-demo';
// the demo copy's content stamp (cache-busting: GitHub Pages keeps a copy for ten minutes); '' in the app
export const BUILD = '86c2b44d';

/** A static file's address. The demo's files carry the stamp, so a deploy is never mixed with an old copy; the app's are unchanged. */
export function assetUrl(path) {
  return BUILD ? `${path}?v=${BUILD}` : path;
}
