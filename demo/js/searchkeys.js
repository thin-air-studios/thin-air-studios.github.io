// The in-game keyboard for the airport search (2.8; DECISIONS 330). The search field never opens the phone's keyboard (it is readonly,
// with inputmode none); this module holds what the keys type, when the keyboard is up, and the two shortcuts before typing: Popular
// (the busiest airports, airportdb.js BUSIEST) and Near you (airports around the phone's time zone, from Intl; no location is asked).
// Pure: the page (main.js) draws the keys and the chips and calls these.

/** The keys' rows, top to bottom: digits, then the letters (the QWERTY order). Space, delete and close sit under them (SPECIAL_KEYS). */
export const KEY_ROWS = Object.freeze([
  Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']),
  Object.freeze(['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']),
  Object.freeze(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']),
  Object.freeze(['Z', 'X', 'C', 'V', 'B', 'N', 'M']),
]);

/** The keys that are not characters: their names for the page (and the accessible names). */
export const SPECIAL_KEYS = Object.freeze({
  space: Object.freeze({ key: 'space', label: 'Space' }),
  back: Object.freeze({ key: 'back', label: 'Delete' }),
  close: Object.freeze({ key: 'close', label: 'Close keyboard' }),
});

/** The accessible name of a key: "Letter A", "Digit 7", or the special key's name. */
export function keyName(key) {
  if (/^[A-Z]$/.test(key)) return `Letter ${key}`;
  if (/^[0-9]$/.test(key)) return `Digit ${key}`;
  const s = Object.values(SPECIAL_KEYS).find((k) => k.key === key);
  return s ? s.label : key;
}

const MAX_QUERY = 40;

/**
 * The query after a key is pressed. A letter or digit is added in capitals, a space is added (not twice in a row, nor at the start),
 * back takes off the last character. Anything else is no change.
 */
export function typeKey(value, key) {
  const v = String(value || '');
  if (key === 'back') return v.slice(0, -1);
  if (key === 'space') return v && !v.endsWith(' ') && v.length < MAX_QUERY ? `${v} ` : v;
  if (/^[A-Z0-9]$/.test(key) && v.length < MAX_QUERY) return v + key;
  return v;
}

/**
 * Whether the keyboard is up. Typing keeps it up; once results show for a query, it tucks away (so the results are seen); a tap on
 * the box brings it back; scrolling the results tucks it; Close tucks it. A cleared query (nothing typed) brings it back, since there
 * is nothing to see yet. A query with no results keeps it up, so the player can type on.
 *
 * state: { open }. event: { type: 'tap' | 'key' | 'close' | 'scroll' | 'leave' } or { type: 'results', query, count }.
 */
export function keysAfter(state, event) {
  const open = !!(state && state.open);
  switch (event && event.type) {
    case 'tap':
    case 'key':
      return { open: true };
    case 'close':
    case 'scroll':
    case 'leave':
      return { open: false };
    case 'results': {
      const typed = String(event.query || '').trim();
      if (!typed) return { open: true };
      return { open }; // results while typing leave the keys where they are: a scroll, Close or a chip tucks them
    }
    case 'shortlist': // a shortcut's airports show as chips: they tuck the keys away (none to show: the keys stay as they are)
      return event.count > 0 ? { open: false } : { open };
    default:
      return { open };
  }
}

/**
 * The shortcut's point on the map, from the phone's time zone (an IANA name such as America/Chicago, from Intl) and the phone's UTC
 * offset in hours (the fallback for a zone this table does not name). [lat, lon]. Best effort: the nearest big airports to the point
 * are the "Near you" chips, so a rough point is enough.
 */
const ZONE_POINTS = Object.freeze({
  'America/New_York': [40.7, -74.0], 'America/Detroit': [42.3, -83.0], 'America/Toronto': [43.7, -79.4],
  'America/Chicago': [41.9, -87.6], 'America/Denver': [39.7, -104.9], 'America/Phoenix': [33.4, -112.0],
  'America/Los_Angeles': [34.0, -118.2], 'America/Anchorage': [61.2, -149.9], 'Pacific/Honolulu': [21.3, -157.9],
  'America/Vancouver': [49.3, -123.1], 'America/Edmonton': [53.5, -113.5], 'America/Winnipeg': [49.9, -97.1],
  'America/Halifax': [44.6, -63.6], 'America/St_Johns': [47.6, -52.7], 'America/Mexico_City': [19.4, -99.1],
  'America/Monterrey': [25.7, -100.3], 'America/Cancun': [21.2, -86.9], 'America/Bogota': [4.7, -74.1],
  'America/Lima': [-12.0, -77.0], 'America/Santiago': [-33.4, -70.7], 'America/Sao_Paulo': [-23.5, -46.6],
  'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Caracas': [10.5, -66.9], 'America/Panama': [9.0, -79.5],
  'America/Puerto_Rico': [18.5, -66.1], 'Atlantic/Reykjavik': [64.1, -21.9], 'Europe/London': [51.5, -0.1],
  'Europe/Dublin': [53.3, -6.3], 'Europe/Lisbon': [38.7, -9.1], 'Europe/Madrid': [40.4, -3.7], 'Europe/Paris': [48.9, 2.4],
  'Europe/Brussels': [50.9, 4.4], 'Europe/Amsterdam': [52.3, 4.8], 'Europe/Berlin': [52.5, 13.4], 'Europe/Rome': [41.9, 12.5],
  'Europe/Zurich': [47.4, 8.5], 'Europe/Vienna': [48.2, 16.4], 'Europe/Prague': [50.1, 14.4], 'Europe/Warsaw': [52.2, 21.0],
  'Europe/Stockholm': [59.3, 18.1], 'Europe/Oslo': [59.9, 10.7], 'Europe/Copenhagen': [55.7, 12.6], 'Europe/Helsinki': [60.2, 24.9],
  'Europe/Athens': [37.9, 23.7], 'Europe/Istanbul': [41.0, 28.9], 'Europe/Moscow': [55.8, 37.6], 'Europe/Kyiv': [50.4, 30.5],
  'Europe/Bucharest': [44.4, 26.1], 'Africa/Cairo': [30.0, 31.2], 'Africa/Johannesburg': [-26.2, 28.0], 'Africa/Lagos': [6.5, 3.4],
  'Africa/Nairobi': [-1.3, 36.8], 'Africa/Casablanca': [33.6, -7.6], 'Africa/Addis_Ababa': [9.0, 38.7], 'Asia/Dubai': [25.2, 55.3],
  'Asia/Riyadh': [24.7, 46.7], 'Asia/Tehran': [35.7, 51.4], 'Asia/Karachi': [24.9, 67.0], 'Asia/Kolkata': [28.6, 77.1],
  'Asia/Dhaka': [23.8, 90.4], 'Asia/Bangkok': [13.8, 100.5], 'Asia/Jakarta': [-6.2, 106.8], 'Asia/Singapore': [1.35, 103.8],
  'Asia/Kuala_Lumpur': [3.1, 101.7], 'Asia/Manila': [14.6, 121.0], 'Asia/Shanghai': [31.2, 121.5], 'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Taipei': [25.0, 121.5], 'Asia/Seoul': [37.5, 127.0], 'Asia/Tokyo': [35.7, 139.7], 'Asia/Kathmandu': [27.7, 85.3],
  'Asia/Jerusalem': [31.8, 35.2], 'Asia/Ho_Chi_Minh': [10.8, 106.7], 'Australia/Sydney': [-33.9, 151.2],
  'Australia/Melbourne': [-37.8, 145.0], 'Australia/Brisbane': [-27.5, 153.0], 'Australia/Perth': [-31.9, 115.9],
  'Australia/Adelaide': [-34.9, 138.6], 'Pacific/Auckland': [-36.8, 174.8],
});

// a region's latitude for a zone this table does not name (the longitude comes from the phone's UTC offset)
const REGION_LAT = Object.freeze({ America: 20, Europe: 48, Asia: 30, Africa: 5, Australia: -27, Pacific: -15, Atlantic: 30, Indian: -10 });

export function zonePoint(zone, offsetHours = 0) {
  if (typeof zone === 'string' && Object.hasOwn(ZONE_POINTS, zone)) return ZONE_POINTS[zone];
  const region = typeof zone === 'string' ? zone.split('/')[0] : '';
  const lat = Object.hasOwn(REGION_LAT, region) ? REGION_LAT[region] : 20;
  const lon = Math.max(-180, Math.min(180, (Number(offsetHours) || 0) * 15));
  return [lat, lon];
}

/** The phone's time zone (Intl, no permission) and UTC offset in hours. Either may be '' or 0 when the browser cannot say. */
export function phoneZone(date = new Date()) {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (_) {
    zone = '';
  }
  return { zone, offsetHours: -date.getTimezoneOffset() / 60 };
}

/**
 * A zone that names no place (UTC, GMT, Etc/...) or none at all: there is no "near you" to give, so the shortcut is left out rather
 * than pointing at the middle of the Sahara.
 */
export const placeless = (zone) => !zone || zone === 'UTC' || zone === 'GMT' || zone.startsWith('Etc/');

/** The shortcut "Near you": the airports nearest the phone's time zone's point (nearest first), from the list the caller has. */
export function nearYou(airports, zone, offsetHours, n = 6, haversine) {
  if (placeless(zone)) return [];
  const [lat, lon] = zonePoint(zone, offsetHours);
  return airports
    .map((a) => [haversine(lat, lon, a.lat, a.lon), a])
    .sort((x, y) => x[0] - y[0])
    .slice(0, n)
    .map((x) => x[1]);
}
