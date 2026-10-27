// The Live feed card's words behind Details (the last update, the planes near the airport by group) and its copyable
// report. The card's status is feedstate.js feedStatus; the real planes in the game are inGameLines here. Pure (no DOM), so
// the tests read what the player reads.

/** Seconds since the last good update, in words: "just now", "12 s ago", "3 min ago". */
export function agoWords(s) {
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

/** Seconds until the next try, in words: "48 s", "3 min". */
export function nextWords(s) {
  const n = Math.max(0, Math.round(s));
  return n < 60 ? `${n} s` : `${Math.ceil(n / 60)} min`;
}

/** The feed's state in a word, for the report. */
export function feedWords(v) {
  return { working: 'on', connecting: 'connecting', paused: 'paused', interrupted: 'interrupted', offline: 'offline', daily: 'daily allowance', demo: 'recorded earlier' }[v.state] || v.state;
}

/** The real planes near the airport, the total on the heading (the HUD's count word: "real planes"). */
export function nearHeading(code, total) {
  return `Real planes near ${code}: ${total}`;
}

/** The buckets' counts, summed: the total on the heading (the rows add up to it). */
export function breakdownTotal(c) {
  return ['confirmed', 'seenOnce', 'far', 'passing', 'nearby', 'ground', 'close', 'other'].reduce((n, k) => n + (c[k] || 0), 0);
}

/**
 * The rows behind Details (counts from area.js judge over the feed), in this order. Only the groups that have planes show: a
 * row with none is left out, so the card fits a phone in landscape (the total still adds up, and an empty group needs no line).
 * `rival` is the name of the airport planes are heading to ('' for none). `recorded`: a practice game (its recorded traffic)
 * does not check again, so its seen-once row says so instead of a countdown.
 */
export function breakdownRows(c, { nextS = 0, rival = '', recorded = false } = {}) {
  const to = rival ? `${rival} or other airports` : 'other airports';
  const planes = (n) => (n === 1 ? '1 plane' : `${n} planes`);
  const rows = [
    ['confirmed', (n) => `${n} on approach here`], // the feed confirms these as landing here (the HUD's "landing here" counts all real planes)
    ['seenOnce', (n) => (recorded ? `${planes(n)} seen once` : `${planes(n)} seen once, checking again in ${nextWords(nextS)}`)],
    ['far', (n) => `${n} still far out`],
    ['passing', (n) => `${n} climbing out, passing by or flying away`],
    ['nearby', (n) => `${n} heading to ${to}`],
    ['ground', (n) => `${n} on the ground`],
    ['close', (n) => `${n} very close in`],
    ['other', (n) => `${n} with no flight number, no position or a helicopter`],
  ];
  const out = [];
  for (const [key, text] of rows) {
    const n = c[key] || 0;
    if (!n) continue;
    out.push({ key, n, text: text(n) });
  }
  return out;
}

/**
 * The real planes in the game, by flight number (the card's list): up to `most`, then "and N more". No status words: every
 * real plane looks the same (requirements item 1). An empty list reads "None" (the status line above says the rest).
 */
export function inGameLines(real, { most = 8 } = {}) {
  if (!real.length) return ['None'];
  const lines = real.slice(0, most).map((p) => p.label || p.callsign);
  if (real.length > most) lines.push(`and ${real.length - most} more`);
  return lines;
}

/**
 * The text of "Copy feed report": the version, the time, the airport, the feed and the planes, one line per flight with a
 * class (up to 40). No icao24 (the hex address), no save data, no location beyond the airport's code. See DECISIONS.md 156.
 * @param d.planes  [{ callsign, bucket, why, dist (m), altitude (m), velocity (m/s), off (deg) }]
 * @param d.demo    a practice game's recorded traffic: it never updates and uses no credits, so the report says so
 */
export function reportText(d) {
  const total = breakdownTotal(d.counts);
  const lines = [
    `Short Final ${d.version} · ${d.demo ? 'recorded earlier' : 'live feed'} report`,
    d.time,
    `Airport: ${d.iata || '-'} (${d.icao}) · ${d.level} · Real planes only ${d.realOnly ? 'on' : 'off'}`,
    `Feed: ${d.feedWords}${d.feedReason ? ` · ${d.feedReason}` : ''}${d.httpStatus ? ` · HTTP ${d.httpStatus}` : ''} · last update ${d.agoS == null ? 'none' : `${d.agoS} s ago`}`,
    d.demo ? 'No updates: these planes were recorded earlier.' : `Next update in ${d.nextS} s. Daily allowance left: ${d.remaining == null ? 'unknown' : d.remaining}`,
    nearHeading(d.iata || d.icao, total),
    ...d.rows.map((r) => `${r.text}`),
    `In the game: ${d.inGame.confirmed} on approach here, ${d.inGame.area} in the area, ${d.inGame.simulated} simulated. Quiet sky: ${d.starved ? 'yes' : 'no'}`,
  ];
  for (const p of (d.planes || []).slice(0, 40)) {
    const km = p.dist == null ? '-' : (p.dist / 1000).toFixed(1);
    const ft = p.altitude == null ? '-' : Math.round(p.altitude * 3.281);
    const kt = p.velocity == null ? '-' : Math.round(p.velocity * 1.944);
    const off = p.off == null ? '-' : Math.round(p.off);
    lines.push(`${p.callsign || '(no flight number)'} · ${p.bucket} · ${p.why || '-'} · ${km} km · ${ft} ft · ${kt} kt · track off ${off} deg`);
  }
  return lines.join('\n');
}
