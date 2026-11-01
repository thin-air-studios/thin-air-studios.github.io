// Minifies the website's own browser scripts: the classic scripts (site.js, airports-search.js, brand/home.js) and the modules
// (boards, challenge and flights files), each on its own. Nothing is bundled and nothing is renamed across files: a module keeps its
// imports and exports, a classic script keeps its one IIFE, and each script's behaviour is the same as its source. What changes is
// how it reads: comments and whitespace go, local names are shortened, and the file gets a one-line legal banner.
//
// The banner names the source the file was made from (a hash of the readable source). That lets a build without esbuild keep a
// minified file that is still current, and write the readable source only where the source changed. The tool is esbuild, a
// development dependency (package.json, npm ci). SITE_MINIFY selects the behaviour:
//   auto     (default) with esbuild: minify every script. Without it: keep each minified file whose source is unchanged, and write the
//            readable source for the rest
//   require  minify every script, and stop the build when esbuild is not installed (the daily rebuild in CI sets this)
//   off      write the readable sources
// Not minified: the vendored libraries under assets/site/vendor/ (third-party code, copied unchanged), the CSS, the JSON and the
// inline scripts on the pages (the gtag snippet and the JSON-LD blocks, whose hashes the headers name).
import crypto from 'node:crypto';

export const MODES = ['auto', 'require', 'off'];

/** The site's own script files: every served .js or .mjs under assets/site/, except the vendored libraries. */
export function isOwnScript(rel) {
  return /^assets\/site\/.+\.m?js$/.test(rel) && !rel.startsWith('assets/site/vendor/');
}

/** A short hash of a readable source: the tag the banner names. */
export function sourceTag(readable) {
  return crypto.createHash('sha256').update(readable, 'utf8').digest('hex').slice(0, 12);
}

/** The one-line legal banner of a minified script, naming its source. */
export function bannerFor(tag) {
  return `/*! (c) Thin Air Studios. Short Final website script (source ${tag}). */`;
}

/** Whether a file (its text) was minified from the source with this tag. */
export function madeFrom(text, tag) {
  return typeof text === 'string' && text.split('\n', 1)[0] === bannerFor(tag);
}

/** esbuild, or null when it is not installed. Any other error (a broken install) is an error. */
async function loadEsbuild() {
  try {
    return await import('esbuild');
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/** The options every site script is minified with. import.meta is kept: the loader's module URL is read from it at run time.
 *  A .mjs file is an ES module (its imports and exports stay as they are); a .js file is a classic script, so nothing is wrapped. */
export function minifyOptions(rel, tag) {
  return {
    loader: 'js',
    minify: true,
    target: 'es2019',
    supported: { 'import-meta': true },
    legalComments: 'none',
    banner: bannerFor(tag),
    format: rel.endsWith('.mjs') ? 'esm' : undefined,
  };
}

/**
 * Sets the bytes of the own scripts among the outputs (each is readable source until this runs). Returns a summary for the build log:
 * { mode, minified, kept, readable, bytesBefore, bytesAfter, skipped } where skipped says why a script was not minified (or null).
 *   onDisk(rel): the text of the file as it is in the repository, or null when it is not there
 *   esbuild:     for tests only: the esbuild module, or null for "not installed" (default: loaded from node_modules)
 */
export async function minifyScripts(outputs, { mode = process.env.SITE_MINIFY || 'auto', onDisk = () => null, esbuild } = {}) {
  if (!MODES.includes(mode)) throw new Error(`SITE_MINIFY must be one of ${MODES.join(', ')} (got "${mode}")`);
  const targets = outputs.filter((o) => isOwnScript(o.rel));
  const summary = { mode, minified: 0, kept: 0, readable: 0, bytesBefore: 0, bytesAfter: 0, skipped: null };
  if (mode === 'off') {
    summary.readable = targets.length;
    return { ...summary, skipped: 'SITE_MINIFY=off' };
  }
  const tool = esbuild === undefined ? await loadEsbuild() : esbuild;
  if (!tool && mode === 'require') throw new Error('SITE_MINIFY=require, but esbuild is not installed (run npm ci in the repository root)');
  for (const o of targets) {
    const readable = typeof o.bytes === 'string' ? o.bytes : Buffer.from(o.bytes).toString('utf8');
    const tag = sourceTag(readable);
    if (tool) {
      const result = await tool.transform(readable, minifyOptions(o.rel, tag));
      if (result.warnings.length) {
        // A warning means esbuild changed the script in a way it does not vouch for: stop rather than ship it.
        throw new Error(`${o.rel}: esbuild warned while minifying: ${result.warnings.map((w) => w.text).join('; ')}`);
      }
      summary.minified += 1;
      summary.bytesBefore += Buffer.byteLength(readable, 'utf8');
      summary.bytesAfter += Buffer.byteLength(result.code, 'utf8');
      o.bytes = result.code;
    } else {
      // No esbuild: the minified file that is in the repository stays while its source is unchanged; anything else is the readable source.
      const committed = onDisk(o.rel);
      if (madeFrom(committed, tag)) {
        summary.kept += 1;
        o.bytes = committed;
      } else {
        summary.readable += 1;
        o.bytes = readable;
      }
    }
  }
  if (!tool) {
    summary.skipped = `esbuild is not installed (run npm ci in the repository root): ${summary.kept} minified script(s) kept as committed, ${summary.readable} written readable`;
  }
  return summary;
}
