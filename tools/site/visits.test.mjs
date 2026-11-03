// Real visitors (Todd, November 3, 2026): the edge's private page-beacon counter in tools/edge/worker.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { countable, isClaudeNet, coloradoDay, countVisit } from '../edge/worker.js';

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function beacon(headers = {}) {
  return new Request('https://playshortfinal.com/api/p', {
    method: 'POST',
    headers: { 'user-agent': UA, origin: 'https://playshortfinal.com', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '203.0.113.9', ...headers },
  });
}

/** A tiny stand-in for D1: just enough SQL for the counter. */
function fakeDb() {
  const days = new Map();
  const seen = new Set();
  const meta = new Map();
  const stmt = (sql) => ({
    args: [],
    bind(...a) { this.args = a; return this; },
    async first() {
      if (/FROM visit_meta/.test(sql)) return meta.has('salt') ? { v: meta.get('salt') } : null;
      return null;
    },
    async run() {
      const a = this.args;
      if (/INSERT OR IGNORE INTO visit_meta/.test(sql)) { if (!meta.has('salt')) meta.set('salt', a[0]); return { meta: { changes: 1 } }; }
      if (/INSERT OR IGNORE INTO visit_seen/.test(sql)) { const k = a[0] + '|' + a[1]; if (seen.has(k)) return { meta: { changes: 0 } }; seen.add(k); return { meta: { changes: 1 } }; }
      if (/INSERT INTO visit_days/.test(sql)) { const d = days.get(a[0]) || { people: 0, visitors: 0 }; d.people += 1; d.visitors += a[1]; days.set(a[0], d); return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    },
  });
  return { days, seen, prepare: stmt, async batch(list) { return list.map(() => ({})); } };
}

test('a same-site browser is counted; robots, test browsers, other sites and Claude are not', () => {
  assert.equal(countable(beacon()), true);
  assert.equal(countable(beacon({ 'user-agent': 'Googlebot/2.1' })), false);
  assert.equal(countable(beacon({ 'user-agent': UA.replace('Chrome', 'HeadlessChrome') })), false);
  assert.equal(countable(beacon({ origin: 'https://example.com', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(countable(beacon({ 'cf-connecting-ip': '160.79.106.20' })), false);
  assert.equal(isClaudeNet('160.79.112.1'), false);
  assert.equal(isClaudeNet('160.79.104.1'), true);
});

test('the day is the Colorado date', () => {
  assert.equal(coloradoDay(new Date('2026-11-04T05:30:00Z')), '2026-11-03');
  assert.equal(coloradoDay(new Date('2026-11-04T08:00:00Z')), '2026-11-04');
});

test('pages read add up; each browser is one visitor a day', async () => {
  const db = fakeDb();
  const now = new Date('2026-11-03T18:00:00Z');
  await countVisit(db, beacon(), now);
  await countVisit(db, beacon(), now);
  await countVisit(db, beacon({ 'cf-connecting-ip': '198.51.100.4' }), now);
  assert.deepEqual(db.days.get('2026-11-03'), { people: 3, visitors: 2 });
  // nothing readable about the visitor is kept: only a short hash
  for (const k of db.seen) assert.match(k, /^2026-11-03\|[0-9a-f]{32}$/);
});

test('the beacon answers 204 and never shows a number; GET is refused', async () => {
  const db = fakeDb();
  const res = await worker.fetch(beacon(), { VISITS: db }, null);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal([...db.days.values()][0].people, 1);
  const get = await worker.fetch(new Request('https://playshortfinal.com/api/p'), { VISITS: db }, null);
  assert.equal(get.status, 405);
  const off = await worker.fetch(beacon(), {}, null);
  assert.equal(off.status, 204);
});

test('site.js sends the beacon only on playshortfinal.com, with no cookie', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../../site-src/assets/site.js', import.meta.url), 'utf8');
  assert.match(src, /location\.hostname !== 'playshortfinal\.com'/);
  assert.match(src, /fetch\('\/api\/p', \{ method: 'POST', keepalive: true, credentials: 'omit' \}\)/);
});
