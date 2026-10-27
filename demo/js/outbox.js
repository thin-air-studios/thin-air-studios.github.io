// The phone's queue of ranked games waiting to post (save.outbox, requirement 20). A ranked game's replay is queued when it
// ends (main.js queueReplay) and flushed when the player is online, signed in and 13 or older: on boot, on resume, when the
// connection comes back and after each game. Nothing is sent for a player who has not agreed. A score the server has not
// taken yet stays here for up to seven days, then goes (a queued score is only accepted for a week after it was played).
//
// The replays are not in the save. The save is one localStorage value, and queued replays filling its quota would stop every
// save. Each queued game keeps its replay (base64) in the kv store (IndexedDB) under its replayId, and the queue holds the
// game's details only. The queue is capped by count and by the size of its replays. A replay that no queued game names any
// more is swept from the store (sweepReplays).
//
// The layout a replay names is posted once before its first score (PUT /v1/layouts/{hash}), from the canonical text kept
// on this phone (stashLayout). The transport is passed in, so the tests run the same code with fakes.
//
// A score the Worker holds for a spending cap (503 with reason 'cap', requirement 31) is kept past the seven days: the cap
// resets on a UTC day or month, so it can wait longer than a week. Its retryAt is the Worker's Retry-After, and no request is
// sent before it. A 429 (the Worker's rate limit: one layout a second, six scores a minute) waits for its window the same way,
// and onRetry says when the queue should be looked at again.
import { boardsLive, makeApi } from './boards.js?v=86c2b44d';
import { canPlayGames, clockNow } from './profile.js?v=86c2b44d';
import { playGames } from './platform.js?v=86c2b44d';
import { writeSave } from './storage.js?v=86c2b44d';

export const OUTBOX_DAYS = 7;
export const OUTBOX_MAX = 20; // the games in the queue; the oldest go past it
export const OUTBOX_BYTES_MAX = 16 * 1024 * 1024; // the queued replays' total (base64 characters); the oldest go past it
const DAY_MS = 86400000;
const LAYOUT_WINDOW_MS = 1000; // the Worker's layout rate limit: one PUT per player per second
const SCORE_WINDOW_MS = 60000; // and six scores a minute
const REPLAY_PREFIX = 'replay:';

/** The layout's canonical text: JSON with every object's keys sorted, no spaces (server/src/util.js canonicalJson). */
export function canonicalLayout(layout) {
  return JSON.stringify(sortKeys(layout));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/** SHA-256 hex of a text (the layout's hash, the name the replay gives it). */
export async function hashText(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The text, gzipped (CompressionStream: the browser, the Android WebView). */
export async function gzipText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Keeps a layout's canonical text on this phone, under its hash, for the flush. Stored once; a second game here finds it. */
export async function stashLayout(store, hash, text) {
  if (!store || !hash || !text) return false;
  try {
    if (await store.get(`layout:${hash}`)) return true;
    await store.set(`layout:${hash}`, text);
    return true;
  } catch (_) {
    return false;
  }
}

/** The kv key a queued game's replay is kept under. */
export const replayKey = (id) => `${REPLAY_PREFIX}${id}`;

/** A new id for a queued game's replay, unique on this phone. */
export function newReplayId(now) {
  return `${Number(now).toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps a queued game's replay (base64) in the kv store. Resolves true when it is stored, false when it is not. */
export async function stashReplay(store, id, base64) {
  if (!store || !id || !base64) return false;
  try {
    return (await store.set(replayKey(id), base64)) === true;
  } catch (_) {
    return false;
  }
}

/** A queued game's replay (base64), or null when it is no longer on this phone. */
export async function replayOf(store, entry) {
  if (!store || !entry || !entry.replayId) return null;
  try {
    return (await store.get(replayKey(entry.replayId))) || null;
  } catch (_) {
    return null;
  }
}

/**
 * Removes the stored replays that no queued game names: a post took the game, a prune or the cap dropped it, Remove my scores
 * or a Reset emptied the queue. The keys are listed first and the queue is read after, so a game queued meanwhile is kept.
 * Returns how many went.
 */
export async function sweepReplays(save, store) {
  if (!store || typeof store.keys !== 'function' || typeof store.del !== 'function') return 0;
  let keys = [];
  try {
    keys = await store.keys(REPLAY_PREFIX);
  } catch (_) {
    return 0;
  }
  const queue = Array.isArray(save.outbox) ? save.outbox : [];
  const live = new Set(queue.filter((e) => e && e.replayId).map((e) => replayKey(e.replayId)));
  let n = 0;
  for (const k of keys) {
    if (live.has(k)) continue;
    try {
      await store.del(k);
      n++;
    } catch (_) { /* kept: the next sweep tries again */ }
  }
  return n;
}

/** Drops the queued games older than seven days, except those the server holds for a cap. Returns how many went. */
export function pruneOutbox(save, now) {
  if (!Array.isArray(save.outbox)) save.outbox = [];
  const before = save.outbox.length;
  save.outbox = save.outbox.filter((e) => e && typeof e === 'object' && (e.held === 'cap' || now - (Number(e.at) || 0) <= OUTBOX_DAYS * DAY_MS));
  return before - save.outbox.length;
}

/**
 * Marks a game the server held for a spending cap: it waits until the cap resets (the Worker's Retry-After, in seconds)
 * and is not dropped for age. Without a usable Retry-After it simply waits for the next flush.
 */
export function holdForCap(entry, body, now) {
  const wait = Number(body && body.retryAfter);
  entry.held = 'cap';
  entry.retryAt = Number.isFinite(wait) && wait > 0 ? now + wait * 1000 : null;
  return entry;
}

/**
 * A 429, the Worker's rate limit: the game waits until the window passes (the Worker's Retry-After when it gives one, else the
 * end of the current window of windowMs).
 */
export function holdForRate(entry, body, now, windowMs) {
  const wait = Number(body && body.retryAfter);
  entry.retryAt = now + (Number.isFinite(wait) && wait > 0 ? wait * 1000 : windowMs - (now % windowMs));
  return entry;
}

/** The server answered something other than a cap hold: an earlier hold no longer applies (its age counts again). */
export function clearHold(entry) {
  entry.held = null;
  entry.retryAt = null;
  return entry;
}

/** The queued replays' total size, in characters (the kv store holds each one as base64). */
export function queuedBytes(save) {
  return (Array.isArray(save.outbox) ? save.outbox : []).reduce((n, e) => n + ((e && Number(e.size)) || 0), 0);
}

/**
 * Queues a ranked game. entry: { board, icao, level, daily, version, layout (the hash) }; its replay is kept apart, under the
 * entry's replayId, and size is the replay's length. The game's end time is kept as endedAt (the server checks it is recent).
 * The oldest entries go past OUTBOX_MAX, and past OUTBOX_BYTES_MAX (the newest always stays).
 */
export function enqueue(save, entry, now) {
  pruneOutbox(save, now);
  const q = save.outbox;
  q.push({ ...entry, at: now, endedAt: now, state: null });
  trimOutbox(save);
  return q[q.length - 1];
}

/**
 * Drops the oldest games past OUTBOX_MAX and OUTBOX_BYTES_MAX. A game the server holds for a cap is never dropped by trimming:
 * it waits for the cap to reset, so the oldest game that is not held goes instead. The newest game always stays, so when only
 * held games are left to drop, the queue may stand over its limits until they clear.
 */
function trimOutbox(save) {
  const q = save.outbox;
  const over = () => q.length > OUTBOX_MAX || (q.length > 1 && queuedBytes(save) > OUTBOX_BYTES_MAX);
  while (over()) {
    const i = q.findIndex((e, j) => j < q.length - 1 && !(e && e.held === 'cap'));
    if (i < 0) break;
    q.splice(i, 1);
  }
}

/**
 * Queues a ranked game with its replay (base64, in the kv store). The game is in the queue before its replay is stored, marked
 * pending so no flush sends it half-kept. Resolves the entry, or null when the replay could not be stored: the game is then
 * not queued, and the caller says so.
 */
export async function queueGame(save, store, game, replayBase64, now) {
  const id = newReplayId(now);
  const entry = enqueue(save, { ...game, replayId: id, size: replayBase64.length, pending: true }, now);
  const stored = await stashReplay(store, id, replayBase64);
  if (!stored) {
    save.outbox = save.outbox.filter((e) => e !== entry);
    return null;
  }
  entry.pending = false;
  return entry;
}

/** How many games wait, and whether one of them needs an update to post (the end card and the boards say so). */
export function outboxState(save) {
  const q = Array.isArray(save.outbox) ? save.outbox : [];
  return { queued: q.length, update: q.some((e) => e && e.state === 'update') };
}

/**
 * A session for the posts, from save.session, or a new one from Play Games (POST /v1/session). null when the player cannot
 * sign in yet: no web client id (the app's games-ids.xml), no Play Games sign-in, or the server is not set up.
 * serverAuthCode() resolves to the one-time code, or '' when there is none (platform.js playGames.serverAuthCode).
 */
export async function sessionFor(save, { now, api, serverAuthCode, webClientId = '', force = false }) {
  const s = save.session;
  if (!force && s && s.token && s.expiresAt - now > DAY_MS) return s.token;
  if (force) save.session = null;
  if (!webClientId || typeof serverAuthCode !== 'function') return null;
  const code = await serverAuthCode();
  if (!code) return null;
  const r = await api.session(code, webClientId);
  if (r.status !== 200 || !r.json || typeof r.json.token !== 'string') return null;
  const prev = save.session || {};
  save.session = {
    token: r.json.token,
    expiresAt: Number(r.json.expiresAt) || now + 90 * DAY_MS,
    displayName: typeof r.json.displayName === 'string' ? r.json.displayName : null,
    accepted: Number(prev.accepted) || 0,
    showName: typeof prev.showName === 'boolean' ? prev.showName : true,
  };
  return save.session.token;
}

/** Why a flush stopped on an answer, for the caller's state (null when it did not stop). */
function stopFor(status) {
  if (status === 426) return 'update';
  if (status === 401) return 'session';
  if (status === 429) return 'rate';
  return 'later'; // 503 (verification not ready, or not configured), 5xx, or no network (0)
}

let busy = null;
let again = false; // a flush asked for while one ran: the queue is looked at once more when that run ends
let generation = 0; // bumped by cancelOutbox (Reset progress): a post in flight then sends nothing more and writes nothing

/**
 * Posts the queued games, oldest first. deps: { now(), live, cannotPost, stale() -> bool, token(force) -> token|null,
 * layoutText(hash) -> text|null, replayText(entry) -> base64|null, putLayout(token, hash, bytes), score(token, body),
 * onAccepted(entry, json) }. Each entry ends one of four ways: accepted (removed, counted in sent), rejected for good (422,
 * 413, or its layout or replay is gone: dropped), update needed (426: kept with state 'update', and the flush stops), or
 * waiting (503, 429, 401, network, 5xx: kept, and the flush stops). A second call while one runs gets the first one's result,
 * and the queue is looked at once more after it. A game the server holds for a cap (503, reason 'cap') waits until its retryAt,
 * and onHeld(entry) says so. Returns { sent, dropped, kept, stopped, retryAt }.
 */
export function flush(save, deps) {
  if (busy) {
    again = true;
    return busy;
  }
  const p = runAll(save, deps).finally(() => {
    if (busy === p) busy = null;
  });
  busy = p;
  return p;
}

const isStale = (deps) => !!(deps.stale && deps.stale());

async function runAll(save, deps) {
  let out;
  do {
    again = false;
    out = await run(save, deps);
  } while (again && !out.stopped && !isStale(deps));
  return out;
}

/**
 * Reset progress (main.js): the posts in flight are cancelled. None of them sends again or writes the old save back, and the
 * next flush starts clean.
 */
export function cancelOutbox() {
  generation++;
  busy = null;
  again = false;
}

/**
 * Posts what is queued with the real transport: the Worker (boards.js makeApi), Play Games for the sign-in code, and the
 * save written after. Sends nothing before the boards are live (boards.js boardsLive), nor for a player who cannot post yet (one
 * who has not agreed to the terms, profile.js canPlayGames), nor without a web client id (games-ids.xml): the games wait on the phone.
 * onPosted(entry, json) runs for each score the server takes; onHeld(entry) for each one the server holds for a cap; onRetry(at) when the queue
 * should be looked at again at that time (a rate limit's window). webClientId() and serverAuthCode() default to the shell
 * (platform.js).
 */
export function postQueued(save, {
  store, onPosted = null, onUpdate = null, onHeld = null, onRetry = null, api = makeApi(), live = boardsLive(), now = () => Date.now(),
  clock = clockNow, webClientId = () => playGames.webClientId(), serverAuthCode = () => playGames.serverAuthCode(),
} = {}) {
  const gen = generation;
  const stale = () => gen !== generation;
  return flush(save, {
    now,
    live,
    stale,
    cannotPost: !canPlayGames(save, clock()), // nobody posts before the terms are agreed at 13 and up (profile.js)
    token: (force) => sessionFor(save, { now: now(), api, serverAuthCode, webClientId: webClientId(), force }),
    layoutText: (hash) => store.get(`layout:${hash}`),
    replayText: (entry) => replayOf(store, entry),
    putLayout: (token, hash, bytes) => api.putLayout(token, hash, bytes),
    score: (token, body) => api.score(token, body),
    onAccepted: (entry, json) => {
      if (save.session) save.session.accepted = (Number(save.session.accepted) || 0) + 1;
      // a duplicate is a game the server already counted (its first answer was lost): no second end-card line for it
      if (onPosted && !json.duplicate) onPosted(entry, json);
    },
    onUpdate: (entry) => {
      if (onUpdate) onUpdate(entry);
    },
    onHeld: (entry) => {
      if (onHeld) onHeld(entry);
    },
  }).then(async (out) => {
    if (stale()) return out; // a Reset ran meanwhile: this save is no longer the player's
    if (live) writeSave(save);
    if (out.retryAt && onRetry) onRetry(out.retryAt);
    await sweepReplays(save, store);
    return out;
  });
}

/** The earliest time a waiting game can go again (a rate limit's window). A cap's wait is not counted: it can be days. */
function nextRetry(queue, now) {
  let at = 0;
  for (const e of queue) {
    if (e.held === 'cap' || !e.retryAt || e.retryAt <= now) continue;
    if (!at || e.retryAt < at) at = e.retryAt;
  }
  return at || null;
}

async function run(save, deps) {
  const out = { sent: 0, dropped: 0, kept: 0, stopped: null, retryAt: null };
  const now = deps.now();
  pruneOutbox(save, now);
  // a session close to its end is renewed even with nothing queued: Remove my scores and the name switch need it (screens.js)
  const renew = !!(save.session && save.session.token && Number(save.session.expiresAt) - now <= DAY_MS);
  if (!deps.live || deps.cannotPost || (!save.outbox.length && !renew)) {
    out.kept = save.outbox.length;
    return out;
  }
  let token = await deps.token(false);
  if (!token) {
    out.kept = save.outbox.length;
    out.stopped = save.outbox.length ? 'signin' : null;
    return out;
  }
  if (!save.outbox.length) return out; // a renewal only
  const uploaded = new Set();
  const badLayouts = new Set();
  const settled = new Set(); // sent, or dropped for good, by this run: the rest stay in the queue
  let stop = null;
  for (const entry of save.outbox.slice()) {
    if (stop || isStale(deps)) break;
    if (!save.outbox.includes(entry) || entry.pending) continue; // taken out meanwhile (Remove my scores, a prune), or still being kept
    if (entry.retryAt && now < entry.retryAt) {
      // the server said when its limit or cap resets: no request before then (the rest wait behind it)
      stop = 'later';
      break;
    }
    if (badLayouts.has(entry.layout)) {
      settled.add(entry);
      out.dropped++;
      continue;
    }
    const replay = await deps.replayText(entry);
    if (!replay) {
      // the replay is no longer on this phone: it cannot be checked, so it is not sent
      settled.add(entry);
      out.dropped++;
      continue;
    }
    if (!uploaded.has(entry.layout)) {
      const text = await deps.layoutText(entry.layout);
      if (!text) {
        // the layout is gone from this phone: the replay can no longer be checked, so it is not sent
        badLayouts.add(entry.layout);
        settled.add(entry);
        out.dropped++;
        continue;
      }
      const bytes = await gzipText(text);
      // a Reset during the reads above cancels the run; a game Remove my scores took out is not uploaded for
      if (isStale(deps)) break;
      if (!save.outbox.includes(entry)) continue;
      let r = await deps.putLayout(token, entry.layout, bytes);
      if (r.status === 401) {
        token = await deps.token(true);
        if (token && !isStale(deps)) r = await deps.putLayout(token, entry.layout, bytes);
      }
      if (r.status === 200) uploaded.add(entry.layout);
      else if (r.status === 422 || r.status === 413) {
        badLayouts.add(entry.layout);
        settled.add(entry);
        out.dropped++;
        continue;
      } else {
        clearHold(entry);
        if (r.status === 429) holdForRate(entry, r.json, now, LAYOUT_WINDOW_MS);
        stop = token ? stopFor(r.status) : 'signin';
        continue;
      }
    }
    const body = { board: entry.board, version: entry.version, replay, endedAt: entry.endedAt || entry.at };
    // the layout's PUT is awaited: a Reset or a Remove my scores during it means no score is posted for this game
    if (isStale(deps)) break;
    if (!save.outbox.includes(entry)) continue;
    let r = await deps.score(token, body);
    if (r.status === 401) {
      token = await deps.token(true);
      if (token && !isStale(deps) && save.outbox.includes(entry)) r = await deps.score(token, body);
    }
    if (r.status === 200 && r.json && (r.json.status === 'accepted' || r.json.duplicate)) {
      out.sent++;
      settled.add(entry);
      // a duplicate is the same game, already counted by the server (a lost answer): it counts here once, as an accepted one
      if (deps.onAccepted) deps.onAccepted(entry, r.json);
      continue;
    }
    if (r.status === 422 || r.status === 413) {
      settled.add(entry);
      out.dropped++;
      continue;
    }
    if (r.status === 426) {
      entry.state = 'update';
      if (deps.onUpdate) deps.onUpdate(entry);
    }
    if (r.status === 503 && r.json && r.json.reason === 'cap') {
      holdForCap(entry, r.json, now);
      if (deps.onHeld) deps.onHeld(entry);
    } else {
      clearHold(entry);
      if (r.status === 429) holdForRate(entry, r.json, now, SCORE_WINDOW_MS);
    }
    stop = token ? stopFor(r.status) : 'signin';
  }
  // only what this run settled leaves the queue: a game queued while the run waited is still here, and so is a replaced list
  if (!isStale(deps)) save.outbox = save.outbox.filter((e) => !settled.has(e));
  out.kept = save.outbox.length;
  out.stopped = stop;
  out.retryAt = nextRetry(save.outbox, now);
  return out;
}
