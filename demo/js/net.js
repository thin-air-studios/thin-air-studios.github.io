// HTTP for the game. On Android requests go through the native shell (no CORS limits: OpenSky
// and aviationweather.gov don't allow browser origins); in a desktop browser we fall back to fetch.
import { noteDate } from './clock.js?v=2f66fd5f'; // every reply's Date header keeps the Pro day's clock honest (2.8; DECISIONS 331)

const bridge = typeof window !== 'undefined' ? window.HPAndroid : undefined;
const pending = new Map();
let nextId = 1;

if (typeof window !== 'undefined') {
  window.HP_httpDone = (id, status, headersJson, body) => {
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    let headers = {};
    try {
      headers = JSON.parse(headersJson || '{}');
    } catch (_) { /* ignore */ }
    noteDate(headers['date']);
    cb({ status, headers, text: body || '' });
  };
}

/**
 * The text of a gzip body (a .gz file of the website, DECISIONS 372). A body with no gzip magic number is read as text. Null
 * when this browser has no DecompressionStream (the caller then takes the plain file instead). The native shell unzips its
 * own bodies, so this is for the desktop browser only.
 */
async function unzipText(bytes) {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream !== 'function') return null;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/**
 * @param signal optional AbortSignal: when it aborts, the request is dropped at once (status 0, text 'cancelled'). The
 *   native shell cannot cancel a request, so its answer just goes nowhere.
 * @param gzip the body is a gzip file: the text is its unzipped content (the native shell unzips every body it gets)
 * @returns Promise<{ status, headers (lower-case keys), text }>; status 0 = network failure.
 */
export function http(method, url, { headers = {}, body = '', timeoutMs = 25000, signal = null, gzip = false } = {}) {
  if (bridge && bridge.http) {
    return new Promise((resolve) => {
      if (signal && signal.aborted) return resolve({ status: 0, headers: {}, text: 'cancelled' });
      const id = nextId++;
      pending.set(id, resolve);
      if (signal) {
        signal.addEventListener('abort', () => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve({ status: 0, headers: {}, text: 'cancelled' });
          }
        }, { once: true });
      }
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ status: 0, headers: {}, text: 'timeout' });
        }
      }, timeoutMs + 5000);
      bridge.http(id, method, url, JSON.stringify(headers), body || '', timeoutMs);
    });
  }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  if (ctl && signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener('abort', () => ctl.abort(), { once: true });
  }
  return fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: ctl && ctl.signal })
    .then(async (r) => {
      const h = {};
      r.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
      noteDate(h['date']);
      if (!gzip) return { status: r.status, headers: h, text: await r.text() };
      const text = await unzipText(new Uint8Array(await r.arrayBuffer()));
      // a browser that cannot unzip says so as a failure, so the caller takes the plain file
      return text == null ? { status: 0, headers: h, text: 'gzip unsupported' } : { status: r.status, headers: h, text };
    })
    .catch((e) => ({ status: 0, headers: {}, text: String(e) }))
    .finally(() => clearTimeout(timer));
}

export const USER_AGENT = 'ShortFinal (Android game by Thin Air Studios)';
