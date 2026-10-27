// Size class for a real flight: OpenSky emitter category first, then callsign heuristics.
import { parseAirlineCallsign } from './airlines.js?v=7227d0de';
import { hashString } from './util.js?v=7227d0de';

// ADS-B emitter categories (OpenSky "category" field)
const BY_CATEGORY = {
  2: 'light', 3: 'regional', 4: 'narrowbody', 5: 'narrowbody', 6: 'heavy', 7: 'narrowbody',
  8: 'heli', 9: 'light', 12: 'light',
};
const NOT_AIRCRAFT = new Set([10, 11, 13, 14, 15, 16, 17, 18, 19, 20]);

// Civil registrations used as callsigns by private flights (no airline prefix).
const REGISTRATION = /^(N[1-9][0-9A-Z]{0,4}|C[FGI][A-Z]{3}|G[A-Z]{4}|D[A-Z]{4}|F[A-Z]{4}|VH[A-Z]{3}|ZK[A-Z]{3}|EI[A-Z]{3}|OO[A-Z]{3}|PH[A-Z]{3}|HB[A-Z]{3}|OE[A-Z]{3}|SE[A-Z]{3}|LN[A-Z]{3}|OY[A-Z]{3}|I[A-Z]{4}|EC[A-Z]{3}|XA[A-Z]{3}|PR[A-Z]{3}|PT[A-Z]{3}|JA\d{4}|HL\d{4}|B\d{4,5}|VT[A-Z]{3})$/;
const HELI_WORDS = /(HELI|LIFE|MEDIC|CARE|STAR|ANGEL|AIRMED|MERCY|CHOP|TROOP|COAST)/;

/**
 * @param f  parsed flight: { callsign, category, velocity (m/s), altitude (m) }
 * @returns  'light' | 'regional' | 'narrowbody' | 'heavy' | 'heli' | null (not an aircraft)
 */
export function classifyFlight(f) {
  if (f.category != null && NOT_AIRCRAFT.has(f.category)) return null;
  if (f.category != null && BY_CATEGORY[f.category]) return BY_CATEGORY[f.category];
  const cs = (f.callsign || '').trim().toUpperCase();
  const slow = f.velocity != null && f.velocity < 62;
  if (cs && HELI_WORDS.test(cs) && (f.velocity == null || f.velocity < 80)) return 'heli';
  const airline = parseAirlineCallsign(cs);
  if (airline && airline.kind) {
    const h = (hashString(cs) % 1000) / 1000;
    switch (airline.kind) {
      case 'R': return 'regional';
      case 'B': return 'regional';
      case 'X': return 'narrowbody';
      case 'C': return h < 0.7 ? 'heavy' : 'narrowbody';
      case 'L': return h < 0.55 ? 'heavy' : 'narrowbody';
      default: return h < 0.12 ? 'heavy' : 'narrowbody';
    }
  }
  if (!cs || REGISTRATION.test(cs)) return 'light';
  if (airline) return slow ? 'regional' : 'narrowbody'; // unknown airline-style prefix
  return slow ? 'light' : 'narrowbody';
}
