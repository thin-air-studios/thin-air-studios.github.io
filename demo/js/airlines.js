// ICAO airline designators -> short display name + fleet hint (hand-compiled facts).
// Kinds: M mainline (mostly narrowbody, some heavies), L long-haul (many heavies),
// X low-cost narrowbody, R regional, C cargo (mostly heavy), B business jets (small).
export const AIRLINES = {
  // United States
  AAL: ['American', 'M'], DAL: ['Delta', 'M'], UAL: ['United', 'M'], SWA: ['Southwest', 'X'],
  JBU: ['JetBlue', 'X'], ASA: ['Alaska', 'X'], NKS: ['Spirit', 'X'], FFT: ['Frontier', 'X'],
  AAY: ['Allegiant', 'X'], SCX: ['Sun Country', 'X'], HAL: ['Hawaiian', 'M'], MXY: ['Breeze', 'X'],
  VXP: ['Avelo', 'X'], SKW: ['SkyWest', 'R'], ENY: ['Envoy', 'R'], RPA: ['Republic', 'R'],
  EDV: ['Endeavor', 'R'], ASH: ['Mesa', 'R'], PDT: ['Piedmont', 'R'], JIA: ['PSA', 'R'],
  QXE: ['Horizon', 'R'], GJS: ['GoJet', 'R'], CPZ: ['Compass', 'R'], AWI: ['Air Wisconsin', 'R'],
  UCA: ['CommutAir', 'R'], SIL: ['Silver', 'R'], CXP: ['Contour', 'R'], BTQ: ['Boutique', 'R'],
  KAP: ['Cape Air', 'R'], ERA: ['Ravn', 'R'], PEN: ['PenAir', 'R'], WSN: ['Wings', 'R'],
  ACT: ['Air Charter', 'B'], EJA: ['NetJets', 'B'], LXJ: ['Flexjet', 'B'], XOJ: ['XOJET', 'B'],
  JRE: ['JetReady', 'B'], TWY: ['Solairus', 'B'], VJT: ['VistaJet', 'B'], JTL: ['Jet Linx', 'B'],
  FDX: ['FedEx', 'C'], UPS: ['UPS', 'C'], GTI: ['Atlas', 'C'], ABX: ['ABX Air', 'C'],
  ATN: ['Air Transport Intl', 'C'], CKS: ['Kalitta', 'C'], PAC: ['Polar', 'C'], SOO: ['Southern Air', 'C'],
  AJT: ['Amerijet', 'C'], WGN: ['Western Global', 'C'], NCR: ['National', 'C'], FTA: ['Frontier Alaska', 'R'],
  CFS: ['Empire', 'R'], MTN: ['Mountain Air Cargo', 'R'], SWQ: ['Swift Air', 'M'], OAE: ['Omni', 'L'],
  RCH: ['Reach', 'C'], CNV: ['Navy', 'M'], DOJ: ['Justice', 'M'],
  // Canada & Latin America
  ACA: ['Air Canada', 'M'], JZA: ['Jazz', 'R'], WJA: ['WestJet', 'X'], WEN: ['WestJet Encore', 'R'],
  POE: ['Porter', 'R'], TSC: ['Air Transat', 'L'], FLE: ['Flair', 'X'], ROU: ['Rouge', 'X'],
  AMX: ['Aeromexico', 'M'], SLI: ['Aeromexico Connect', 'R'], VOI: ['Volaris', 'X'], VIV: ['VivaAerobus', 'X'],
  CMP: ['Copa', 'M'], AVA: ['Avianca', 'M'], LAN: ['LATAM', 'M'], TAM: ['LATAM Brasil', 'M'],
  GLO: ['Gol', 'X'], AZU: ['Azul', 'X'], ARG: ['Aerolineas', 'M'], SKU: ['Sky', 'X'], JAT: ['JetSMART', 'X'],
  // Europe
  BAW: ['British', 'L'], SHT: ['Shuttle', 'M'], VIR: ['Virgin', 'L'], EZY: ['easyJet', 'X'],
  EJU: ['easyJet Europe', 'X'], EZS: ['easyJet Swiss', 'X'], RYR: ['Ryanair', 'X'], RUK: ['Ryanair UK', 'X'],
  WZZ: ['Wizz', 'X'], WUK: ['Wizz UK', 'X'], TOM: ['TUI', 'M'], EXS: ['Jet2', 'X'], LOG: ['Loganair', 'R'],
  BEE: ['Flybe', 'R'], AUR: ['Aurigny', 'R'], EIN: ['Aer Lingus', 'M'], EAI: ['Emerald', 'R'],
  AFR: ['Air France', 'L'], HOP: ['HOP!', 'R'], TVF: ['Transavia', 'X'], KLM: ['KLM', 'L'], KLC: ['KLM Cityhopper', 'R'],
  DLH: ['Lufthansa', 'L'], CLH: ['CityLine', 'R'], EWG: ['Eurowings', 'X'], CFG: ['Condor', 'M'],
  SWR: ['Swiss', 'L'], AUA: ['Austrian', 'M'], BEL: ['Brussels', 'M'], SAS: ['SAS', 'M'],
  NAX: ['Norwegian', 'X'], NOZ: ['Norwegian', 'X'], FIN: ['Finnair', 'L'], ICE: ['Icelandair', 'M'],
  IBE: ['Iberia', 'L'], IBS: ['Iberia Express', 'X'], VLG: ['Vueling', 'X'], AEA: ['Air Europa', 'M'],
  ITY: ['ITA', 'M'], TAP: ['TAP', 'M'], LOT: ['LOT', 'M'], CSA: ['Czech', 'M'], AEE: ['Aegean', 'M'],
  THY: ['Turkish', 'L'], PGT: ['Pegasus', 'X'], SXS: ['SunExpress', 'X'], ELY: ['El Al', 'L'],
  BTI: ['airBaltic', 'M'], CTN: ['Croatia', 'M'], ROT: ['Tarom', 'M'], AFL: ['Aeroflot', 'L'],
  BCS: ['DHL', 'C'], DHK: ['DHL', 'C'], CLX: ['Cargolux', 'C'], GEC: ['Lufthansa Cargo', 'C'], BOX: ['AeroLogic', 'C'],
  TAY: ['ASL', 'C'], NPT: ['West Atlantic', 'C'],
  // Middle East & Africa
  UAE: ['Emirates', 'L'], QTR: ['Qatar', 'L'], ETD: ['Etihad', 'L'], SVA: ['Saudia', 'L'], GFA: ['Gulf Air', 'M'],
  OMA: ['Oman Air', 'M'], KAC: ['Kuwait', 'L'], RJA: ['Royal Jordanian', 'M'], MEA: ['Middle East', 'M'],
  FDB: ['flydubai', 'X'], ABY: ['Air Arabia', 'X'], MSR: ['EgyptAir', 'M'], ETH: ['Ethiopian', 'L'],
  KQA: ['Kenya', 'M'], SAA: ['South African', 'L'], RAM: ['Royal Air Maroc', 'M'], DAH: ['Air Algerie', 'M'],
  // Asia-Pacific
  SIA: ['Singapore', 'L'], CPA: ['Cathay', 'L'], HKE: ['HK Express', 'X'], JAL: ['JAL', 'L'], ANA: ['ANA', 'L'],
  KAL: ['Korean', 'L'], AAR: ['Asiana', 'L'], CCA: ['Air China', 'L'], CES: ['China Eastern', 'M'],
  CSN: ['China Southern', 'M'], CHH: ['Hainan', 'M'], EVA: ['EVA', 'L'], CAL: ['China Airlines', 'L'],
  THA: ['Thai', 'L'], MAS: ['Malaysia', 'L'], AXM: ['AirAsia', 'X'], GIA: ['Garuda', 'M'], PAL: ['Philippine', 'M'],
  CEB: ['Cebu', 'X'], VNA: ['Vietnam', 'M'], AIC: ['Air India', 'L'], IGO: ['IndiGo', 'X'], AKJ: ['Akasa', 'X'],
  QFA: ['Qantas', 'L'], QLK: ['QantasLink', 'R'], JST: ['Jetstar', 'X'], VOZ: ['Virgin Australia', 'M'],
  RXA: ['Rex', 'R'], ANZ: ['Air New Zealand', 'M'], FJI: ['Fiji', 'M'],
};

const NAME_CACHE = new Map();

/** "AAL1234" -> { code:'AAL', name:'American', number:'1234', kind:'M' } or null. */
export function parseAirlineCallsign(callsign) {
  const cs = (callsign || '').trim().toUpperCase();
  const m = /^([A-Z]{3})(\d[0-9A-Z]{0,4})$/.exec(cs);
  if (!m) return null;
  const a = AIRLINES[m[1]];
  return { code: m[1], number: m[2], name: a ? a[0] : null, kind: a ? a[1] : null };
}

/** Friendly label for a callsign: "American 1234", "N123AB", "BAW12" (unknown prefix kept). */
export function displayName(callsign) {
  const cs = (callsign || '').trim().toUpperCase();
  if (!cs) return '';
  if (NAME_CACHE.has(cs)) return NAME_CACHE.get(cs);
  const p = parseAirlineCallsign(cs);
  const out = p && p.name ? `${p.name} ${p.number}` : cs;
  NAME_CACHE.set(cs, out);
  return out;
}

// Tail-fin colour of each airline's livery, as seen from above (the fin is a thin stripe at the
// tail). Approximate brand colours; aircraft bodies keep their class colour for gameplay.
export const TAIL = {
  AAL: '#b6222e', DAL: '#c8102e', UAL: '#1b4da1', SWA: '#304cb2', JBU: '#0033a0', ASA: '#01426a',
  NKS: '#f5d300', FFT: '#00754a', HAL: '#6a2c91', SKW: '#20416f', ENY: '#b6222e', RPA: '#20416f',
  EDV: '#c8102e', FDX: '#4d148c', UPS: '#5c3d1e', BAW: '#c8102e', VIR: '#da0530', EZY: '#ff6600',
  RYR: '#073590', LOG: '#1f3c78', DLH: '#05164d', AFR: '#002157', KLM: '#00a1de', UAE: '#d71921',
  QTR: '#5c0632', ETD: '#b58c3c', THY: '#c70a0c', ANA: '#13448f', JAL: '#cc0000', CPA: '#006564',
  SIA: '#1d4886', QFA: '#e40000', ACA: '#1a1a1a', AMX: '#0b2343', LAN: '#1b0088', TAM: '#1b0088',
  IBE: '#d7192d', ITY: '#0047bb', SAS: '#000f6c', FIN: '#0b1560', CES: '#1a3a8f', CSN: '#0d74bc',
  CCA: '#c8102e', CHH: '#d6001c', KAL: '#00a5e5', AAR: '#5b6770', AIC: '#c8102e', IGO: '#001b94',
  MAS: '#1c2d6b', AXM: '#e01b22', JST: '#ff5f00', VOZ: '#c4122f', WJA: '#00a5b5', AVA: '#e30613',
  CMP: '#0e2a5b', AUA: '#d81e05', SWR: '#d52b1e', EIN: '#006e4d', TAP: '#d71920', LOT: '#11397e',
  WZZ: '#c6007e', VLG: '#ffcc00', EXS: '#c8102e', TOM: '#1d64c5', SHT: '#c8102e', ELY: '#0d3ea2',
  SVA: '#0e6b3a', ETH: '#078930', KQA: '#c8102e', MSR: '#0d2b5e', RAM: '#c8102e', PAL: '#0033a0',
  CEB: '#f9b81b', THA: '#5c2d91', EVA: '#00704a', CAL: '#e8a5c2', GIA: '#00a2b0',
};

/** Tail colour for a callsign like "AAL1544", or null for unknown airlines and registrations. */
export function tailColor(callsign) {
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  return (m && TAIL[m[1]]) || null;
}
