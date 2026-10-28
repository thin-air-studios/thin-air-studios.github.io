// Turns raw airport data (OurAirports row + runways, optional OpenStreetMap/Overpass JSON) into a
// layout in metres, then into a game world (units) with landing zones.
import { makeProjection, bearing, headingFromIdent, angleDiff, polygonCentroid, polygonArea, haversine, destination, distToSegment } from './geo.js?v=2f66fd5f';
import { WORLD_H, CLASSES, TUNING } from './config.js?v=2f66fd5f';

const HARD = /^(asphalt|concrete|paved|paving_stones|metal|bitumen|tarmac|concrete:plates|concrete:lanes|chipseal|sett)$/i;
const SOFT = /^(grass|gravel|dirt|ground|earth|sand|unpaved|compacted|fine_gravel|mud|clay|turf|pebblestone|rock|coral|snow|ice)$/i;

export function surfaceClass(osmSurface, oaSurface) {
  if (osmSurface && HARD.test(osmSurface)) return 'H';
  if (osmSurface && SOFT.test(osmSurface)) return 'S';
  if (oaSurface === 'H' || oaSurface === 'S') return oaSurface;
  return '?';
}

/**
 * Runways that take one way only, by ICAO code: planes land on the `land` end and take off from the `takeoff` end, whatever
 * the wind. Lukla's OSM note says so ("rwy 24: takeoff only; rwy 06 landing only"); it is a short sloped strip, so the
 * pilots' procedure is the same. Courchevel (LFLJ) is not here: its restriction is not confirmed by a source yet.
 */
export const ONE_WAY = { VNLK: { land: '06', takeoff: '24' } };

/** Which size classes may land on a runway of this length/surface. */
export function runwayAllows(lengthM, surface) {
  const out = [];
  for (const c of Object.values(CLASSES)) {
    if (c.pads) continue;
    if (lengthM < c.minRunwayM) continue;
    if (c.hardOnly && surface === 'S') continue;
    out.push(c.id);
  }
  return out;
}

/** Overpass QL for everything we draw at an airport. */
export function overpassQuery(lat, lon, radiusM) {
  const [s] = destination(lat, lon, 180, radiusM);
  const [n] = destination(lat, lon, 0, radiusM);
  const [, w] = destination(lat, lon, 270, radiusM);
  const [, e] = destination(lat, lon, 90, radiusM);
  const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  // the airport boundary, and every building inside it (hangars, cargo sheds, the tower ...)
  return `[out:json][timeout:40];` +
    `(way["aeroway"="aerodrome"](${bb});relation["aeroway"="aerodrome"](${bb});)->.ad;.ad map_to_area->.a;(` +
    `.ad;` +
    `way["aeroway"~"^(runway|taxiway|taxilane|apron|helipad|terminal|hangar)$"](${bb});` +
    `relation["aeroway"~"^(apron|terminal)$"](${bb});` +
    `way["building"="terminal"](${bb});` +
    `way["building"](area.a);` +
    `node["aeroway"~"^(helipad|gate|parking_position|holding_position)$"](${bb});` +
    `);out geom;`;
}

/** Radius (m) of the area to fetch around an airport, from its OurAirports runways. */
export function fetchRadius(info, oaRunways) {
  let r = 1500;
  for (const rw of oaRunways || []) {
    for (const [la, lo] of [[rw[6], rw[7]], [rw[8], rw[9]]]) {
      if (la != null && lo != null) r = Math.max(r, haversine(info.lat, info.lon, la, lo) + 900);
    }
    r = Math.max(r, rw[2] * 0.3048 * 0.6 + 900);
  }
  return Math.min(r, 6500);
}

function farthestPair(pts) {
  let best = [pts[0], pts[pts.length - 1]], bd = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d > bd) { bd = d; best = [pts[i], pts[j]]; }
    }
  }
  return best;
}

function splitRef(ref) {
  if (!ref) return null;
  const parts = ref.split(/[/\-–]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return parts.length === 2 ? parts : null;
}

/** Assign end idents: the threshold whose landing bearing best matches the ident number. */
function assignEnds(a, b, idents) {
  const ab = bearing(a.lat, a.lon, b.lat, b.lon); // landing from A heads toward B
  const ba = (ab + 180) % 360;
  if (idents) {
    const h0 = headingFromIdent(idents[0]), h1 = headingFromIdent(idents[1]);
    if (h0 != null && h1 != null && angleDiff(h0, ba) + angleDiff(h1, ab) < angleDiff(h0, ab) + angleDiff(h1, ba)) {
      return [{ ...a, ident: idents[1], hdg: ab }, { ...b, ident: idents[0], hdg: ba }];
    }
    if (h0 != null) return [{ ...a, ident: idents[0], hdg: ab }, { ...b, ident: idents[1], hdg: ba }];
  }
  const fmt = (h) => String(Math.round(h / 10) || 36).padStart(2, '0');
  return [{ ...a, ident: fmt(ab), hdg: ab }, { ...b, ident: fmt(ba), hdg: ba }];
}

function wayPoints(el, proj) {
  return (el.geometry || []).filter(Boolean).map((g) => proj.toXY(g.lat, g.lon));
}

function relationRings(el, proj) {
  return (el.members || []).filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry.map((g) => proj.toXY(g.lat, g.lon)));
}

/** "London Heathrow Terminal 5" -> "Terminal 5": the part a passenger would recognise. */
export function shortTerminalName(name) {
  if (!name) return '';
  // not a passenger terminal: cargo sheds, FBOs, and the bridges and walkways between terminals
  if (/\b(cargo|freight|fedex|ups|dhl|signature|fbo|jet ?center|hangar|maintenance|connector|bridge|walkway|skylink|tunnel|parking|garage)\b|\//i.test(name)) return '';
  const m = /\b((Domestic|International|North|South|East|West|Main|Central|Regional)\s+)?(Terminal|Concourse|Satellite|Pier|Midfield|Gates?|Departures|Arrivals)\b.*$/i.exec(name);
  if (!m && /\b(Airport|Aeropuerto|Aéroport|Aeroporto|Flughafen|Luchthaven)\b/i.test(name)) return 'Terminal'; // named after the airport
  const s = (m ? m[0] : name).trim();
  return s.length > 24 ? s.slice(0, 23) + '…' : s;
}

function nameTerminal(L, name, pts) {
  const label = shortTerminalName(name);
  if (!label || L.terminalNames.some((t) => t.name === label)) return;
  const [x, y] = polygonCentroid(pts);
  L.terminalNames.push({ name: label, x, y });
}

/**
 * @param info      { icao, iata, name, city, country, lat, lon, elev }
 * @param oaRunways OurAirports rows for this airport (see tools/build-airports.py)
 * @param osm       Overpass JSON (or null)
 */
export function buildLayout(info, oaRunways = [], osm = null) {
  const proj = makeProjection(info.lat, info.lon);
  const L = {
    info, proj, source: osm ? 'osm' : 'ourairports',
    runways: [], taxiways: [], aprons: [], terminals: [], terminalNames: [], hangars: [], buildings: [], boundary: [], helipads: [], gates: [], holds: [],
  };
  const oaByIdent = new Map();
  for (const r of oaRunways) {
    oaByIdent.set(r[0].toUpperCase(), r);
    oaByIdent.set(r[1].toUpperCase(), r);
  }
  const used = new Set();
  const els = (osm && osm.elements) || [];
  // --- runways from OSM (merging split segments that share a ref)
  const byRef = new Map();
  for (const el of els) {
    const t = el.tags || {};
    if (el.type !== 'way' || t.aeroway !== 'runway') continue;
    // blast pads and stopways aren't runway. Other runway=* pieces (displaced thresholds) count only
    // with a ref: some mappers tag a whole runway that way (Las Vegas), or put its ICAO code there
    // (Beijing's runway=4F); unnumbered they are just the ends of a runway mapped beside them
    if (t.runway && t.runway !== 'runway' && (!t.ref || /^(blast_?pad|stopway|overrun|apron)$/.test(t.runway))) continue;
    const pts = wayPoints(el, proj);
    if (pts.length < 2) continue;
    const key = t.ref || `#${el.id}`;
    const g = byRef.get(key) || { tags: t, pts: [], area: false };
    g.pts.push(...pts);
    const closed = el.geometry.length > 3 && el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat && el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon;
    if (closed || t.area === 'yes') {
      g.area = true;
      g.areaM2 = (g.areaM2 || 0) + polygonArea(pts);
    }
    byRef.set(key, g);
  }
  for (const [key, g] of byRef) {
    const [p, q] = farthestPair(g.pts);
    const lengthM = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (lengthM < 120) continue;
    const idents = splitRef(g.tags.ref);
    const [la1, lo1] = proj.toLatLon(p[0], p[1]);
    const [la2, lo2] = proj.toLatLon(q[0], q[1]);
    const ends = assignEnds({ lat: la1, lon: lo1, x: p[0], y: p[1] }, { lat: la2, lon: lo2, x: q[0], y: q[1] }, idents);
    const oa = (idents && (oaByIdent.get(idents[0]) || oaByIdent.get(idents[1]))) || null;
    if (oa) used.add(oa);
    let widthM = parseFloat(g.tags.width) || (g.area && g.areaM2 ? g.areaM2 / lengthM : 0) || (oa && oa[3] * 0.3048) || (lengthM > 2000 ? 45 : 30);
    widthM = Math.max(10, Math.min(widthM, 80));
    // a runway mapped as both a centreline and an area shows up twice (its ref either way round)
    const sameRef = (a) => idents && splitRef(a) && splitRef(a).slice().sort().join('/') === idents.slice().sort().join('/');
    if (L.runways.find((r) => r.ref && g.tags.ref && (r.ref === g.tags.ref || sameRef(r.ref)))) continue;
    g.p = p;
    g.q = q;
    g.lengthM = lengthM;
    L.runways.push({
      ref: g.tags.ref || `${ends[0].ident}/${ends[1].ident}`,
      ends, lengthM, widthM,
      surface: surfaceClass(g.tags.surface, oa && oa[4]),
      lighted: oa ? !!oa[5] : true,
      source: 'osm',
      labelled: !!g.tags.ref,
    });
  }
  // drop unlabelled stubs lying along a labelled runway (old markings, overruns ...)
  L.runways = L.runways.filter((r) => {
    if (r.labelled) return true;
    const mx = (r.ends[0].x + r.ends[1].x) / 2, my = (r.ends[0].y + r.ends[1].y) / 2;
    return !L.runways.some((o) => o.labelled && distToSegment(mx, my, o.ends[0].x, o.ends[0].y, o.ends[1].x, o.ends[1].y) < 120);
  });
  // --- fallback / supplement: OurAirports runways not seen in OSM
  if (!L.runways.length) {
    const noCoords = [];
    for (const r of oaRunways) {
      if (used.has(r)) continue;
      const lengthM = r[2] * 0.3048;
      if (r[6] != null && r[8] != null) {
        const [x1, y1] = proj.toXY(r[6], r[7]);
        const [x2, y2] = proj.toXY(r[8], r[9]);
        const ends = assignEnds({ lat: r[6], lon: r[7], x: x1, y: y1 }, { lat: r[8], lon: r[9], x: x2, y: y2 }, [r[0], r[1]]);
        L.runways.push({ ref: `${r[0]}/${r[1]}`, ends, lengthM: Math.hypot(x2 - x1, y2 - y1) || lengthM, widthM: Math.max(10, (r[3] || 75) * 0.3048), surface: r[4], lighted: !!r[5], source: 'ourairports' });
      } else noCoords.push(r);
    }
    // runways with no coordinates: lay them out from their heading, centred on the airport,
    // offsetting parallels so they don't overlap
    const placed = [];
    for (const r of noCoords) {
      const hdg = r[10] != null ? r[10] : headingFromIdent(r[0]) ?? headingFromIdent(r[1]) ?? 0;
      const lengthM = r[2] * 0.3048;
      const parallel = placed.filter((p) => angleDiff(p, hdg) < 20 || angleDiff(p, hdg) > 160).length;
      placed.push(hdg);
      const off = parallel ? (parallel % 2 ? 1 : -1) * Math.ceil(parallel / 2) * 320 : 0;
      const [cLat, cLon] = off ? destination(info.lat, info.lon, hdg + 90, off) : [info.lat, info.lon];
      const [la1, lo1] = destination(cLat, cLon, hdg + 180, lengthM / 2);
      const [la2, lo2] = destination(cLat, cLon, hdg, lengthM / 2);
      const [x1, y1] = proj.toXY(la1, lo1);
      const [x2, y2] = proj.toXY(la2, lo2);
      const ends = assignEnds({ lat: la1, lon: lo1, x: x1, y: y1 }, { lat: la2, lon: lo2, x: x2, y: y2 }, [r[0], r[1]]);
      L.runways.push({ ref: `${r[0]}/${r[1]}`, ends, lengthM, widthM: Math.max(10, (r[3] || 75) * 0.3048), surface: r[4], lighted: !!r[5], source: 'ourairports' });
    }
    if (L.runways.length) L.source = osm ? 'osm+ourairports' : 'ourairports';
  }
  // --- everything else from OSM
  for (const el of els) {
    const t = el.tags || {};
    const aw = t.aeroway;
    if (el.type === 'way') {
      const pts = wayPoints(el, proj);
      if (aw === 'taxiway' || aw === 'taxilane') L.taxiways.push({ pts, lane: aw === 'taxilane', ref: t.ref || '' });
      else if (aw === 'apron' && pts.length > 2) L.aprons.push(pts);
      else if ((aw === 'terminal' || t.building === 'terminal') && pts.length > 2) {
        L.terminals.push(pts);
        nameTerminal(L, t.name, pts);
      }
      else if ((aw === 'hangar' || t.building === 'hangar') && pts.length > 2) L.hangars.push(pts);
      else if (aw === 'aerodrome' && pts.length > 2) L.boundary.push(pts);
      else if (t.building && !aw && pts.length > 2) L.buildings.push(pts);
      else if (aw === 'helipad' && pts.length > 2) {
        const [cx, cy] = polygonCentroid(pts);
        L.helipads.push({ x: cx, y: cy, r: Math.max(12, Math.sqrt(polygonArea(pts) / Math.PI)) });
      }
    } else if (el.type === 'relation') {
      for (const ring of relationRings(el, proj)) {
        if (ring.length < 3) continue;
        if (t.aeroway === 'aerodrome') L.boundary.push(ring);
        else if (t.aeroway === 'apron') L.aprons.push(ring);
        else {
          L.terminals.push(ring);
          nameTerminal(L, t.name, ring);
        }
      }
    } else if (el.type === 'node') {
      const [x, y] = proj.toXY(el.lat, el.lon);
      if (aw === 'helipad') L.helipads.push({ x, y, r: 15 });
      else if (aw === 'gate' || aw === 'parking_position') L.gates.push({ x, y, ref: t.ref || '' });
      else if (aw === 'holding_position') L.holds.push({ x, y });
    }
  }
  // --- bounds of the operational area (runways + aprons + terminals)
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const grow = (x, y) => {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  };
  for (const r of L.runways) for (const e of r.ends) grow(e.x, e.y);
  for (const poly of [...L.aprons, ...L.terminals]) for (const [x, y] of poly) grow(x, y);
  for (const h of L.helipads) grow(h.x, h.y);
  if (!isFinite(minx)) { minx = -600; maxx = 600; miny = -600; maxy = 600; }
  L.bounds = { minx, miny, maxx, maxy };
  return L;
}

/**
 * Fit the layout into a game world of width W (units) and build landing zones.
 * Returns { mpu, W, H, toWorld(x,y), zones, runways (world), ... }.
 */
/** Metres per world unit for a layout in a world W units wide. */
export function worldScale(L, W) {
  const b = L.bounds;
  const bw = Math.max(400, b.maxx - b.minx), bh = Math.max(400, b.maxy - b.miny);
  // the airport takes up to ~58% of the screen; small strips still get room to manoeuvre
  return Math.max(bw / (0.58 * W), bh / (0.58 * WORLD_H), 3200 / WORLD_H);
}

export function buildWorld(L, W, H = WORLD_H) {
  const b = L.bounds;
  const mpu = worldScale(L, W);
  const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
  const toWorld = (x, y) => [W / 2 + (x - cx) / mpu, H / 2 + (y - cy) / mpu];
  const world = { L, W, H, mpu, cx, cy, toWorld, zones: [], runways: [] };
  // runways -> landing zones (one per runway; the active end is chosen by wind later)
  // a one-way runway (ONE_WAY) keeps its landing end whatever the wind: its zone says which end that is
  const oneWay = ONE_WAY[(L.info && L.info.icao) || ''];
  L.runways.forEach((r, i) => {
    const [ax, ay] = toWorld(r.ends[0].x, r.ends[0].y);
    const [bx, by] = toWorld(r.ends[1].x, r.ends[1].y);
    const length = Math.hypot(bx - ax, by - ay);
    const width = Math.max(TUNING.minRunwayDrawWidth, r.widthM / mpu);
    const allow = runwayAllows(r.lengthM, r.surface);
    const z = {
      id: world.zones.length, kind: 'runway', runway: i, ref: r.ref,
      ends: [{ x: ax, y: ay, ident: r.ends[0].ident, hdg: r.ends[0].hdg }, { x: bx, y: by, ident: r.ends[1].ident, hdg: r.ends[1].hdg }],
      length, width, lengthM: r.lengthM, surface: r.surface, lighted: r.lighted, allow,
      active: 0, closing: false,
    };
    if (oneWay) {
      const land = z.ends.findIndex((e) => e.ident === oneWay.land);
      if (land >= 0 && z.ends.some((e) => e.ident === oneWay.takeoff)) z.oneWay = { land };
    }
    setActiveEnd(z, z.oneWay ? z.oneWay.land : 0);
    world.zones.push(z);
    world.runways.push(z);
  });
  assignRunwayFamilies(world);
  // helipads; if the airport has none, mark one near the terminal (or apron, or runway side)
  let pads = L.helipads.map((h) => {
    const [x, y] = toWorld(h.x, h.y);
    return { x, y, r: Math.max(16, Math.min(24, h.r / mpu)) };
  });
  // a cluster of pads (a heliport's several spots) reads as one pad, and at most three on the map
  pads = pads.filter((p, i) => !pads.slice(0, i).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (q.r + p.r) * 2)).slice(0, 3);
  if (!pads.length) {
    const spot = guessPadSpot(L, world);
    pads = [{ x: spot[0], y: spot[1], r: 18, marked: true }];
  }
  for (const p of pads) {
    // keep pads clear of runways (big drawn pads can overlap a runway end)
    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (const z of world.runways) {
        const dx = p.x - z.cx, dy = p.y - z.cy;
        const ux = Math.cos(z.angle), uy = Math.sin(z.angle);
        const along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
        const needA = z.length / 2 + p.r + 6, needC = z.width / 2 + p.r + 6;
        if (Math.abs(along) < needA && Math.abs(across) < needC) {
          const push = (needC - Math.abs(across)) * (across >= 0 ? 1 : -1);
          p.x += -uy * push;
          p.y += ux * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // a one-way field takes light planes only (Lukla, notes-maps.md): its pads are drawn, and no helicopter is brought to
    // them, so none sits on the approach that the strip's take-offs climb along (decision 206)
    world.zones.push({ id: world.zones.length, kind: 'pad', cx: p.x, cy: p.y, r: p.r, marked: !!p.marked, allow: oneWay ? [] : ['heli'] });
  }
  return world;
}

/**
 * Every runway is red (airliners) or yellow (props and small aircraft), never "anything goes":
 * the longer ~60% of the runways that can take a jet go to the jets, at least one runway stays
 * yellow wherever there are two or more, and a lone runway is shared (drawn striped). Each
 * runway then takes its family, within what its real length and surface allow.
 */
export function assignRunwayFamilies(world) {
  const rws = world.runways;
  for (const z of rws) {
    z.physical = z.physical || z.allow.slice();
    z.family = 'yellow';
  }
  const jets = rws.filter((z) => z.physical.includes('narrowbody')).sort((a, b) => b.lengthM - a.lengthM);
  if (rws.length === 1 && jets.length) rws[0].family = 'both';
  else if (jets.length) {
    let red = Math.max(1, Math.round(jets.length * 0.6));
    if (red >= rws.length) red = rws.length - 1;
    for (const z of jets.slice(0, red)) z.family = 'red';
  }
  for (const z of rws) z.allow = z.physical.filter((c) => z.family === 'both' || CLASSES[c].family === z.family);
}

/** Point the zone at one end: landing from ends[e] toward the other end. */
export function setActiveEnd(z, e) {
  z.active = e;
  const a = z.ends[e], b = z.ends[1 - e];
  z.thx = a.x;
  z.thy = a.y;
  z.angle = Math.atan2(b.y - a.y, b.x - a.x);
  z.dirx = Math.cos(z.angle);
  z.diry = Math.sin(z.angle);
  z.cx = (a.x + b.x) / 2;
  z.cy = (a.y + b.y) / 2;
  z.activeIdent = a.ident;
}

/**
 * The landing geometry of one end of a runway (0 or 1): the threshold at ends[e], landing from there toward the other end. For
 * the active end these are the zone's own fields (setActiveEnd); an engine-out plane may land on the other end (sim.js).
 */
export function endGeometry(z, e) {
  const a = z.ends[e], b = z.ends[1 - e];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return { thx: a.x, thy: a.y, dirx: Math.cos(angle), diry: Math.sin(angle), angle, ident: a.ident, end: e };
}

/** The end a plane takes off from at zone z: the active end, or on a one-way runway the end opposite its landing end. */
export function takeoffEnd(z) {
  return z.oneWay ? 1 - z.active : z.active;
}

/** The take-off geometry at zone z (threshold, direction, length, width): the zone itself, or the take-off end of a one-way runway. */
export function takeoffGeometry(z) {
  if (!z.oneWay) return z;
  return { ...endGeometry(z, takeoffEnd(z)), length: z.length, width: z.width };
}

/** The runway name a plane takes off from at zone z (its landing name on a two-way runway). */
export function takeoffIdent(z) {
  return z.ends[takeoffEnd(z)].ident;
}

function guessPadSpot(L, world) {
  const polys = L.terminals.length ? L.terminals : L.aprons;
  if (polys.length) {
    let best = polys[0], ba = 0;
    for (const p of polys) {
      const a = polygonArea(p);
      if (a > ba) { ba = a; best = p; }
    }
    const [x, y] = polygonCentroid(best);
    const [wx, wy] = world.toWorld(x, y);
    // nudge off the building toward open ground (away from the field centre)
    const dx = wx - world.W / 2, dy = wy - world.H / 2, d = Math.hypot(dx, dy) || 1;
    return [wx + (dx / d) * 34, wy + (dy / d) * 34];
  }
  const r = world.runways[0];
  if (r) return [r.cx - Math.sin(r.angle) * 50, r.cy + Math.cos(r.angle) * 50];
  return [world.W / 2 + 60, world.H / 2 + 60];
}

/** Which zones can this class land on? */
export function zonesFor(world, cls) {
  return world.zones.filter((z) => z.allow.includes(cls));
}

/** Classes that have somewhere to land at this airport. */
export function landableClasses(world) {
  const s = new Set();
  for (const z of world.zones) for (const c of z.allow) s.add(c);
  return [...s];
}
