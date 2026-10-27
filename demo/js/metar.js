// METAR (aviationweather.gov Data API, JSON format) parsing and wind -> active runway.

export const METAR_URL = (icao) => `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`;

/** Parse a raw METAR string. Returns null for empty input. */
export function parseMetar(raw) {
  if (!raw) return null;
  const toks = raw.trim().split(/\s+/);
  const out = { raw, station: null, windDir: null, windSpeed: 0, gust: null, variable: false, visibilitySm: null, phenomena: [], ceilingFt: null, tempC: null, cover: 0, precipIntensity: 1 };
  let i = 0;
  if (toks[i] === 'METAR' || toks[i] === 'SPECI') i++;
  out.station = toks[i++] || null;
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'RMK') break;
    let m;
    if ((m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(t))) {
      const k = m[4] === 'MPS' ? 1.94384 : m[4] === 'KMH' ? 0.539957 : 1;
      out.windDir = m[1] === 'VRB' ? null : parseInt(m[1], 10);
      out.variable = m[1] === 'VRB';
      out.windSpeed = Math.round(parseInt(m[2], 10) * k);
      out.gust = m[3] ? Math.round(parseInt(m[3], 10) * k) : null;
    } else if ((m = /^(?:(\d+)\s?)?(?:(\d)\/(\d))?SM$/.exec(t)) || (m = /^(\d+)\/(\d)SM$/.exec(t))) {
      // US statute miles (handles "10SM", "1/2SM"; "1 1/2SM" handled below)
      if (/^\d+\/\d+SM$/.test(t)) {
        const [a, b] = t.replace('SM', '').split('/').map(Number);
        out.visibilitySm = a / b;
      } else out.visibilitySm = parseFloat(t);
      if (/^\d+$/.test(toks[i - 1] || '') && /\/\d+SM$/.test(t) && out.visibilitySm < 1) out.visibilitySm += parseInt(toks[i - 1], 10);
    } else if (t === 'CAVOK') {
      out.visibilitySm = 10;
    } else if (/^\d{4}$/.test(t) && out.visibilitySm == null && i <= 4) {
      out.visibilitySm = parseInt(t, 10) / 1609.34; // metres (rest of the world)
    } else if ((m = /^(FEW|SCT|BKN|OVC|VV)(\d{3})/.exec(t))) {
      // cloud cover in octas (the most covered layer wins); BKN/OVC/VV also set the ceiling
      out.cover = Math.max(out.cover, { FEW: 2, SCT: 4, BKN: 6, OVC: 8, VV: 8 }[m[1]]);
      if (m[1] !== 'FEW' && m[1] !== 'SCT') {
        const ft = parseInt(m[2], 10) * 100;
        if (out.ceilingFt == null || ft < out.ceilingFt) out.ceilingFt = ft;
      }
    } else if ((m = /^(M?\d{2})\/(M?\d{2})?$/.exec(t))) {
      out.tempC = parseInt(m[1].replace('M', '-'), 10);
    } else if (/^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*$/.test(t) && /[A-Z]{2}/.test(t) && !/^(NOSIG|AUTO|COR|CLR|SKC|NSC|FEW|SCT)/.test(t)) {
      if (t.includes('TS')) out.phenomena.push('TS');
      if (/(RA|SN|DZ)/.test(t)) out.precipIntensity = t[0] === '+' ? 1.6 : t[0] === '-' ? 0.6 : 1;
      for (const p of ['FG', 'BR', 'RA', 'SN', 'DZ', 'HZ', 'GR', 'SQ']) if (t.includes(p)) out.phenomena.push(p);
    }
  }
  out.phenomena = [...new Set(out.phenomena)];
  if (out.windSpeed === 0 && out.windDir === 0) out.windDir = null; // calm
  return out;
}

/** aviationweather.gov JSON -> parsed report (raw text is the source of truth). */
export function parseMetarJson(json) {
  const o = Array.isArray(json) ? json[0] : json;
  if (!o || !o.rawOb) return null;
  const p = parseMetar(o.rawOb);
  if (p.windDir == null && typeof o.wdir === 'number' && o.wspd) p.windDir = o.wdir;
  if (!p.windSpeed && typeof o.wspd === 'number') p.windSpeed = o.wspd;
  if (p.visibilitySm == null && o.visib != null) p.visibilitySm = parseFloat(String(o.visib).replace('+', ''));
  if (o.wxString) for (const w of ['TS', 'FG', 'BR', 'RA', 'SN']) if (o.wxString.includes(w) && !p.phenomena.includes(w)) p.phenomena.push(w);
  p.name = o.name || '';
  p.obsTime = o.obsTime || null;
  return p;
}

/** Game-weather seed from a report: wind, fog, storms. */
export function weatherFromMetar(m) {
  if (!m) return null;
  return {
    windDir: m.windDir, // degrees true the wind blows FROM, or null when calm/variable
    windKt: m.windSpeed || 0,
    gustKt: m.gust || 0,
    fog: m.phenomena.includes('FG') || (m.visibilitySm != null && m.visibilitySm < 3) ? 1 : m.phenomena.includes('BR') ? 0.5 : 0,
    storms: m.phenomena.includes('TS') ? 1 : 0,
    rain: m.phenomena.includes('RA') || m.phenomena.includes('SN') ? 1 : 0,
    // what the player sees: cloud shadows (0..1) and falling rain, drizzle or snow
    cloud: Math.min(1, (m.cover || 0) / 8),
    precip: m.phenomena.includes('SN') ? 'snow' : m.phenomena.includes('RA') || m.phenomena.includes('TS') ? 'rain' : m.phenomena.includes('DZ') ? 'drizzle' : null,
    precipIntensity: m.precipIntensity || 1,
    source: 'metar',
  };
}

/**
 * The report in plain words for the pause card (requirements item 5: no raw code, no source label): the wind, then the weather
 * that matters or the sky. "Wind 9 knots, clear", "Calm, a few clouds", "Wind 22 knots, gusts 30, thunderstorms". Null for no report.
 */
export function plainWeather(m) {
  if (!m) return null;
  const wind = m.windSpeed > 0 ? `Wind ${m.windSpeed} knots${m.gust ? `, gusts ${m.gust}` : ''}` : 'Calm';
  const ph = m.phenomena || [];
  const sky = ph.includes('TS') ? 'thunderstorms' : ph.includes('SN') ? 'snow' : ph.includes('RA') ? 'rain' : ph.includes('DZ') ? 'drizzle'
    : ph.includes('FG') ? 'fog' : ph.includes('BR') ? 'mist'
      : !m.cover ? 'clear' : m.cover <= 2 ? 'a few clouds' : m.cover <= 4 ? 'some clouds' : m.cover <= 6 ? 'cloudy' : 'overcast';
  return `${wind}, ${sky}`;
}

/** Headwind component (kt) for landing on heading `hdg` (deg true). */
export function headwind(hdg, windDir, windKt) {
  if (windDir == null) return 0;
  return windKt * Math.cos(((windDir - hdg) * Math.PI) / 180);
}

export function crosswind(hdg, windDir, windKt) {
  if (windDir == null) return 0;
  return windKt * Math.sin(((windDir - hdg) * Math.PI) / 180);
}

/**
 * For each runway zone pick the end to land on: the one with the most headwind. In calm air keep
 * whatever is active (or end 0). A one-way runway (airport.js ONE_WAY) always lands on its landing end.
 * Returns the zone list's chosen end indices.
 */
export function chooseActiveEnds(zones, windDir, windKt) {
  return zones.map((z) => {
    if (z.kind !== 'runway') return null;
    if (z.oneWay) return z.oneWay.land;
    if (windDir == null || windKt < 3) return z.active || 0;
    const h0 = headwind(z.ends[0].hdg, windDir, windKt), h1 = headwind(z.ends[1].hdg, windDir, windKt);
    return h1 > h0 ? 1 : 0;
  });
}
