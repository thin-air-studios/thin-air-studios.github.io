// Publishes new airport maps to main. The map robot (.github/workflows/maps.yml) and the bulk builder (maps-bulk.yml) both
// publish with this, so a clash between them loses no map. Each try starts from main as it is now: a file main already has
// is kept as main has it (a map is never replaced), and only the files main lacks are added. A try that loses the push
// race starts again from the newer main, so a map the other side added first is kept, and the rest still go in.
//
// usage: node tools/maps/publish.mjs --stage=<dir> [--message="Airport maps: {n} new from OpenStreetMap"]
//   Run in a checkout of main (the working directory); the workflow sets the git user. The stage holds the new files at their
//   paths in the repository: osm/<ICAO>.json and osm/<ICAO>.json.gz (a file main has already is kept), and
//   tools/maps/failures.json (always copied: the robot's own list). Then the .json.gz form is made where it is missing
//   (store.mjs), the site must stay under SITE_LIMIT_MB (900; GitHub Pages allows 1 GB), and one commit goes to main.
//   {n} in the message is the number of files committed. Five tries; the wait before each try grows. Exits 0 when the
//   maps are on main or none were new, 1 when no try pushed (or the site is over its size limit), with nothing left pushed.
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, statSync, copyFileSync, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipMissing } from './store.mjs';

const opt = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (!m) { console.error(`not an option: ${a}`); process.exit(2); }
  opt[m[1]] = m[2] === undefined ? true : m[2];
}
if (!opt.stage) { console.error('usage: node tools/maps/publish.mjs --stage=<dir> [--message=...]'); process.exit(2); }
const STAGE = resolve(opt.stage);
const MESSAGE = opt.message || 'Airport maps: {n} new from OpenStreetMap';
const TRIES = 5;
const LIMIT = (process.env.SITE_LIMIT_MB ? +process.env.SITE_LIMIT_MB : 900) * 1e6;
const FAILURES = join('tools', 'maps', 'failures.json');
const log = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// the bytes in the site (without .git)
function siteBytes(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? siteBytes(p) : st.size;
  }
  return total;
}

// one try: main as it is now, plus the stage's files that main lacks. Returns 'pushed', 'nothing', 'limit' or 'retry'.
function attempt() {
  const f = git(['fetch', '--quiet', 'origin', 'main']);
  if (!f.ok) { log(`fetch failed: ${f.err}`); return 'retry'; }
  const r = git(['reset', '--quiet', '--hard', 'FETCH_HEAD']);
  if (!r.ok) { log(`reset failed: ${r.err}`); return 'retry'; }
  git(['clean', '-fdq', '--', 'osm']);

  let added = 0, kept = 0;
  const from = join(STAGE, 'osm');
  if (existsSync(from)) {
    for (const name of readdirSync(from)) {
      try {
        copyFileSync(join(from, name), join('osm', name), constants.COPYFILE_EXCL);
        added++;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        kept++;
      }
    }
  }
  const failures = join(STAGE, FAILURES);
  if (existsSync(failures)) copyFileSync(failures, FAILURES);
  const gz = gzipMissing(resolve('osm'));
  log(`from the stage: ${added} files added, ${kept} kept as main has them; ${gz} .json.gz forms made`);

  const bytes = siteBytes('.');
  log(`the site is ${(bytes / 1e6).toFixed(1)} MB; the limit is ${LIMIT / 1e6} MB`);
  if (bytes > LIMIT) return 'limit';

  const paths = ['osm', ...(existsSync(failures) ? [FAILURES] : [])];
  if (!git(['add', '--', ...paths]).ok) return 'retry';
  const staged = git(['diff', '--cached', '--name-only']).out.split('\n').filter(Boolean);
  if (!staged.length) return 'nothing';
  const message = MESSAGE.replace('{n}', String(staged.length));
  const c = git(['commit', '--quiet', '-m', message]);
  if (!c.ok) { log(`commit failed: ${c.err}`); return 'retry'; }
  const p = git(['push', 'origin', 'HEAD:main']);
  if (!p.ok) { log(`push refused: ${p.err.split('\n').slice(-1)[0]}`); return 'retry'; }
  log(`pushed "${message}"`);
  return 'pushed';
}

for (let i = 1; i <= TRIES; i++) {
  const r = attempt();
  if (r === 'pushed') process.exit(0);
  if (r === 'nothing') { log('no new maps to push'); process.exit(0); }
  if (r === 'limit') { log('the site is over its size limit: nothing pushed'); process.exit(1); }
  if (i < TRIES) {
    log(`try ${i} of ${TRIES} did not push; starting again from main`);
    await sleep(i * 10000);
  }
}
log(`no try of ${TRIES} pushed; nothing is left on main from this run`);
process.exit(1);
