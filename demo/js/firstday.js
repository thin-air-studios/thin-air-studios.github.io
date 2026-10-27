// The trial's first day across a reinstall (2.8; DECISIONS 332). A reinstall gives a new save, so the phone's own first day would
// restart the three free days. The Android shell gives a device hash (an HMAC-SHA256 of the Android ID with an app constant, never
// the ID itself: MainActivity/DeviceHash.kt); the phone sends it with its first day to POST /v1/first-day, and the server keeps the
// earliest first day it has for that hash. The trial uses the earlier of the phone's first day and the server's.
//
// Nothing here blocks play: the answer comes back in the background, and a failed request is asked again later. It is asked only
// once the age question is answered (main.js homeOpened), and never by the sideload build (its hash is '').
import { validPro } from './pro.js?v=7227d0de';

export const FIRST_DAY_RETRY_MS = 10 * 60 * 1000;

/** The trial's first day: the earlier of the phone's and the server's (the server's is null when it has not answered). */
export function earlierFirst(phoneFirst, serverFirst) {
  if (!Number.isInteger(serverFirst)) return phoneFirst;
  if (!Number.isInteger(phoneFirst)) return serverFirst;
  return Math.min(phoneFirst, serverFirst);
}

/**
 * The save's pro block with the server's first day applied (pro.js: first, last and n as they were, first only ever earlier).
 * A block that is not valid, or a server day that is not a whole number, returns the block as it was.
 */
export function applyFirstDay(pro, serverFirst) {
  if (!validPro(pro) || !Number.isInteger(serverFirst)) return pro;
  const first = earlierFirst(pro.first, serverFirst);
  return first === pro.first ? pro : { ...pro, first };
}

/**
 * One ask: resolves { status: 'skipped' } with no device hash (the browser, the sideload build), { status: 'done', first } with the
 * server's first day, or { status: 'retry' } when the answer did not come (offline, rate limited, the Worker's cap, a server error).
 * api: boards.js makeApi() (firstDay(hash, day) -> { status, json }). first: the phone's first day.
 */
export async function askFirstDay({ api, hash, first }) {
  if (!hash) return { status: 'skipped' };
  if (!Number.isInteger(first)) return { status: 'retry' };
  let r;
  try {
    r = await api.firstDay(hash, first);
  } catch (_) {
    return { status: 'retry' };
  }
  if (r && r.status === 200 && r.json && Number.isInteger(r.json.first)) return { status: 'done', first: r.json.first };
  return { status: 'retry' };
}
