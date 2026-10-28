// Which live-flights source a live game asks, and the server's switches for it (3.4). adsb.lol is the main source. OpenSky is a
// fallback that only the server can turn on (GET /v1/health, feeds.opensky, from the wrangler var FEED_OPENSKY, off by default:
// OpenSky's terms need a written licence for a for-profit live product, and there is none yet). The phone asks OpenSky only
// when the server says so AND adsb.lol failed for that request. The switches are read once a day and kept on the phone, as
// boards.js keeps BOARDS_LIVE, so a switch is flipped on the server without a new release. Old app versions (before 3.4) keep
// calling OpenSky themselves; this module is not theirs.
import { BOARDS } from './config.js?v=2f66fd5f';
import { http as netHttp } from './net.js?v=2f66fd5f';
import { OpenSkyClient } from './opensky.js?v=2f66fd5f';
import { AdsbLolClient } from './adsblol.js?v=2f66fd5f';

export const FLAGS_KEY = 'holdingpattern.feedFlags.v1';
export const DEFAULT_FLAGS = Object.freeze({ adsblol: true, opensky: false }); // what the server ships, before it has been read
const DAY_MS = 86400000;
const FALLBACK_ADSB_TIMEOUT_MS = 10000; // the adsb.lol wait when OpenSky is the fallback (the live poll allows 25 s by default)

let known = readKnown(); // { adsblol, opensky, at }: the server's last answer and when it was read, or null
let reading = null;

function readKnown() {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(FLAGS_KEY));
    return v && typeof v.adsblol === 'boolean' && typeof v.opensky === 'boolean' && Number.isFinite(v.at) ? v : null;
  } catch (_) {
    return null; // no store, or a private window: the defaults stand until the next read
  }
}

function writeKnown(v) {
  try {
    globalThis.localStorage.setItem(FLAGS_KEY, JSON.stringify(v));
  } catch (_) { /* kept for this launch only */ }
}

/** The switches as the phone holds them now: the server's last answer, else the defaults. Synchronous. */
export function feedFlags() {
  return known ? { adsblol: known.adsblol, opensky: known.opensky } : { ...DEFAULT_FLAGS };
}

/**
 * Reads the server's switches when none is held or the one held is more than a day old. Resolves feedFlags(). A failed read
 * keeps what is held, and the next call tries again. The answer must carry both feeds; a field the server does not send is off.
 */
export function refreshFeedFlags({ base = BOARDS.base, send = netHttp, now = Date.now(), force = false } = {}) {
  // a read dated after `now` (the clock was ahead, then corrected) is not fresh: the switches are read again
  const age = known ? now - known.at : NaN;
  if (!force && known && age >= 0 && age < DAY_MS) return Promise.resolve(feedFlags());
  if (!reading) reading = readFlags(base, send, now).finally(() => { reading = null; });
  return reading;
}

async function readFlags(base, send, now) {
  try {
    const r = await send('GET', `${base}/v1/health`, { headers: {}, timeoutMs: 8000 });
    if (r && r.status === 200) {
      const j = JSON.parse(r.text);
      if (j && j.feeds && typeof j.feeds === 'object') {
        known = { adsblol: j.feeds.adsblol === true, opensky: j.feeds.opensky === true, at: now };
        writeKnown(known);
      }
    }
  } catch (_) { /* no answer: the switches held stand */ }
  return feedFlags();
}

/** No answer from a source that is switched off or could not be reached: the same as a failed request with no status. */
const NO_FEED = Object.freeze({ ok: false, status: 0 });

/**
 * The live feed's client: adsb.lol first; OpenSky only when `flags().opensky` is on and adsb.lol did not answer this request.
 * It has the methods LiveFeed calls (fetchStates, authenticated). The answer is the one of the source that was asked last, so
 * a 429 from adsb.lol with OpenSky off is the answer the feed shows (its words are the daily or rate ones, feedstate.js).
 */
export class FeedChain {
  constructor({ adsb, opensky, flags = feedFlags }) {
    this.adsb = adsb;
    this.opensky = opensky;
    this.flags = flags;
  }

  /** No sign-in for the live feed: the OpenSky client fields are hidden (index.html), so the fallback is always anonymous. */
  get authenticated() {
    return false;
  }

  async fetchStates(bbox, nowMs = Date.now(), opts = {}) {
    const on = this.flags();
    let r = NO_FEED;
    if (on.adsblol) {
      // with the fallback on, a slow adsb.lol answer is cut short, so OpenSky is still asked within the feed's own wait
      const adsbOpts = on.opensky ? { ...opts, timeoutMs: Math.min(opts.timeoutMs ?? Infinity, FALLBACK_ADSB_TIMEOUT_MS) } : opts;
      r = await this.adsb.fetchStates(bbox, nowMs, adsbOpts).catch(() => NO_FEED);
    }
    if (r.ok || !on.opensky) return r;
    return this.opensky.fetchStates(bbox, nowMs, opts).catch(() => NO_FEED);
  }
}

/** The client for one live game or one feed check (main.js): adsb.lol, and OpenSky when the switches allow it. */
export function feedClient({ http }) {
  return new FeedChain({ adsb: new AdsbLolClient({ http }), opensky: new OpenSkyClient({ http }) });
}
