// Radio chatter: short, realistic tower/pilot exchanges for what's happening on screen, shown in a
// ticker at the bottom of the screen with a squelch click. Purely flavour: it never blocks play.
import { displayName } from './airlines.js?v=2f66fd5f';
import { CLASSES } from './config.js?v=2f66fd5f';
import { takeoffIdent } from './airport.js?v=2f66fd5f';
import { isSleigh } from './santa.js?v=2f66fd5f';

const PHONETIC = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett',
  K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango',
  U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
};

/** "17C" -> "17 Center", "09L" -> "9 Left" (as said on the radio). */
export function sayRunway(ident) {
  const m = /^0?(\d{1,2})([LCR]?)$/.exec(String(ident || '').trim().toUpperCase());
  if (!m) return String(ident || '');
  return `${m[1]}${m[2] ? ' ' + { L: 'Left', C: 'Center', R: 'Right' }[m[2]] : ''}`;
}

/** Taxiway ref "K2" -> "Kilo 2", "AA" -> "Alpha Alpha". */
export function sayTaxiway(ref) {
  const m = /^([A-Z]+)(\d*)$/.exec(String(ref || '').trim().toUpperCase());
  if (!m) return String(ref || '');
  return [...m[1]].map((c) => PHONETIC[c]).join(' ') + (m[2] ? ' ' + m[2] : '');
}

/** Registrations as controllers shorten them: N123AB -> "November 3 Alpha Bravo", GDKTX -> "Golf Tango X-ray". */
function sayReg(cs) {
  const sayChars = (t) => [...t].map((c) => (/\d/.test(c) ? c : PHONETIC[c] || c)).join(' ');
  if (/^N\d/.test(cs)) return 'November ' + sayChars(cs.slice(-3));
  return sayChars(cs[0]) + ' ' + sayChars(cs.slice(-2));
}

// What a simulated flight is called on the radio: its type, since it has no flight number of its own.
const TYPE_WORD = { narrowbody: 'airliner', regional: 'regional jet', heavy: 'heavy', light: 'light aircraft', heli: 'helicopter' };
export const callTypeWord = (cls) => TYPE_WORD[cls] || 'aircraft';
export const callTypeTag = (cls) => callTypeWord(cls).toUpperCase();

/** How a flight is called mid-sentence: the flight number as said (real), or its type word (simulated). */
export function spokenCallsign(a) {
  if (isSleigh(a)) return 'Santa One'; // santa.js: the sleigh's callsign is said this way
  if (!a.live) return callTypeWord(a.cls);
  const cs = (a.callsign || '').toUpperCase();
  const name = displayName(cs);
  if (name && name !== cs) return name;
  if (/^[A-Z]{3}\d/.test(cs)) return cs; // an airline we don't know: read the callsign as written
  if (/^[A-Z]{1,2}-?[A-Z0-9]{3,5}$/.test(cs) || /^N\d/.test(cs)) return sayReg(cs.replace('-', ''));
  return a.label || cs;
}

/** The same, where the call opens a sentence: a simulated flight's type word is capitalised. */
export function spokenCallsignStart(a) {
  const s = spokenCallsign(a);
  return a.live ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

const pick = (arr, k) => arr[Math.abs(k) % arr.length];

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const digits = (s) => [...String(s)].map((c) => DIGITS[+c] || c).join(' ');

/**
 * The ticker's words as a controller would say them: runways, winds, pressure and flight numbers
 * digit by digit ("two seven Left", "three five zero at one zero", "British eight three one").
 */
export function speechText(msg) {
  return String(msg)
    .replace(/\b(\d{3}) at (\d{1,2})( gusting (\d{1,2}))?/g, (m, d, k, g, gk) => `${digits(d)} at ${digits(k)}${g ? ` gusting ${digits(gk)}` : ''}`)
    .replace(/\b([Rr]unways?|short) ((?:\d{1,2}(?: (?:Left|Right|Center))?(?:, )?)+)/g, (m, w, list) => `${w} ${list.replace(/\d+/g, digits)}`)
    .replace(/\bQNH (\d{4})/g, (m, q) => `Q N H ${digits(q)}`)
    .replace(/\bAltimeter (\d{2})\.(\d{2})/g, (m, a, b) => `Altimeter ${digits(a + b)}`)
    .replace(/\bATIS\b/g, 'A tiss')
    .replace(/(^|[^\d,.])(\d{3,4})(?!\d|[,.]\d| feet)/g, (m, pre, n) => pre + digits(n));
}

/**
 * The ticker's words as shown: a number held on one line with the word it belongs to, a runway's side ("18 Right",
 * never "18" at the end of one line and "Right." alone on the next), its unit ("4 miles", "1,100 feet") and the
 * name of the reading ("Visibility 4", "Few 800", "Altimeter 30.03", "Wind 180"). The same length as the call, so
 * typing it is the same. The voice reads the call itself (speechText matches them by their plain space).
 */
export const tickerText = (msg) =>
  String(msg)
    .replace(/(\d) (Left|Right|Center|miles?|feet|knots?)\b/g, '$1\u00a0$2')
    .replace(/\b(Visibility|Few|Scattered|Broken|Overcast|Altimeter|QNH|[Ww]ind) (\d)/g, '$1\u00a0$2');

/** Tower accents by country, where phones commonly carry an English voice for it. */
const ACCENT = { GB: 'GB', IE: 'GB', AU: 'AU', NZ: 'AU', IN: 'IN', ZA: 'ZA', NG: 'NG', SG: 'GB', HK: 'GB', AE: 'GB', QA: 'GB' };
export const towerAccent = (country) => ACCENT[String(country || '').toUpperCase()] || 'US';

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/**
 * Is anything in the air, an arrival's warning ring or a callsign (`labels`, boxes in CSS px) under the ticker?
 * `rect` is the ticker's box in CSS px, `toScreen` maps world units to the same px and `k` is CSS px per world
 * unit. main.js turns the ticker see-through while it is, so it never hides the traffic coming in at the bottom
 * edge. An arrival just below the screen's `bottom` counts from the edge, as its label does (drawLabels), so the
 * ring handing over to it leaves no gap.
 */
export function trafficUnder(rect, sim, toScreen, k, { bottom = Infinity, labels = [] } = {}) {
  const under = (x, y, r) => {
    const [sx, sy0] = toScreen(x, y);
    const sy = sy0 > bottom && sy0 < bottom + 40 ? bottom : sy0;
    const pad = r * k + 6; // a little early, so it has faded by the time they meet
    return sx + pad > rect.left && sx - pad < rect.right && sy + pad > rect.top && sy - pad < rect.bottom;
  };
  const covers = (b) => b.x < rect.right && b.x + b.w > rect.left && b.y < rect.bottom && b.y + b.h > rect.top;
  return sim.warnings.some((w) => under(w.wx, w.wy, 19)) || sim.aircraft.some((a) => a.state === 'fly' && under(a.x, a.y, CLASSES[a.cls].radius)) || labels.some(covers);
}

/**
 * The distress call an emergency makes, the same on the radio (Radio.emergency) and on the toast at the top (main.js): a mayday for an
 * engine or hydraulic failure, a pan-pan for low fuel and a medevac (decision 256).
 */
export const emergencyCall = (type) => (type === 'engine' || type === 'hydraulic' ? 'MAYDAY' : 'PAN-PAN');

export class Radio {
  /**
   * @param el    ticker element (#radio) with .radio-who and .radio-text children; .radio-text holds a
   *              .typed and a .rest span (the words still to come, laid out but hidden)
   * @param audio Audio instance (for the squelch)
   * @param facility e.g. "Dallas"
   */
  constructor({ el, audio, facility = '', enabled = true, speech = null }) {
    this.el = el;
    this.who = el.querySelector('.radio-who');
    this.text = el.querySelector('.radio-text');
    this.typed = (this.text.querySelector && this.text.querySelector('.typed')) || this.text;
    this.rest = (this.text.querySelector && this.text.querySelector('.rest')) || null;
    this.audio = audio;
    this.facility = facility;
    this.enabled = enabled;
    this.queue = [];
    this.cur = null;
    this.lastCheckIn = -99;
    this.n = 0;
    // spoken radio: off until main.js turns it on (and only when the speech engine is there)
    this.speech = speech;
    this.voice = false;
    this.accent = 'US';
  }

  /** The speech engine finished (or gave up on) a call. */
  onSpoken(id) {
    if (this.cur && this.cur.sid === id) this.cur.speaking = false;
  }

  speakCur(c) {
    if (!this.voice || !this.speech || c.sid) return;
    if (!this.speech.ready()) {
      this.speech.init(); // (re)start a speech engine that's off, failed or lost
      return;
    }
    const sid = `r${++this.n}`;
    c.sid = sid;
    c.speaking = true;
    // the tower in the local accent at a brisk clip; each pilot a voice and pitch of their own
    const h = Math.abs(hash(c.key != null ? c.key : c.who));
    const opts = c.pilot
      ? { country: ['US', 'GB', 'AU', 'IN', 'US'][h % 5], n: h, pitch: 0.82 + (h % 9) * 0.05, rate: 1.08 + (h % 4) * 0.06 }
      : { country: this.accent, n: c.who === 'GND' ? 1 : c.who === 'ATIS' ? 2 : 0, pitch: c.who === 'ATIS' ? 0.92 : 1, rate: c.who === 'ATIS' ? 1.05 : 1.15 };
    this.speech.speak(sid, speechText(c.msg), { ...opts, flush: c.prio >= 3 });
  }

  /** who: 'TWR' | 'GND' | 'APP' | 'DEP' | a pilot callsign. prio: 1 chatter, 2 clearance, 3 urgent. */
  say(who, msg, prio = 2, pilot = false) {
    if (!this.enabled) return;
    // a pilot's tag is its flight number if it is a real flight, else its type; its voice follows its own id
    // (simulated flights of one type must still sound like different pilots)
    let key = null;
    if (pilot && typeof who === 'object') {
      const named = who.live || isSleigh(who); // a real flight, or the sleigh, is tagged by its callsign
      key = named ? who.callsign || '' : `#${who.id}`;
      who = named ? who.callsign || '' : callTypeTag(who.cls);
    }
    const item = { who, msg, prio, pilot, key };
    if (prio >= 3) {
      // urgent calls jump the queue and cut the current one short; only the latest two matter
      this.queue = this.queue.filter((q) => q.prio >= 3).slice(0, 1);
      this.queue.unshift(item);
      if (this.cur && this.cur.prio < 3) {
        this.cur.t = Math.max(this.cur.t, this.cur.dur);
        this.cur.speaking = false;
      }
    } else {
      this.queue.push(item);
      // never fall behind: keep at most three waiting, dropping the least important
      while (this.queue.length > 3) {
        let worst = 0;
        this.queue.forEach((q, i) => q.prio < this.queue[worst].prio && (worst = i));
        this.queue.splice(worst, 1);
      }
    }
  }

  clear() {
    this.lastCheckIn = -99; // sim time restarts with every game
    this.queue = [];
    this.cur = null;
    this.el.classList.remove('show');
    this.el.classList.remove('hold');
    if (this.speech) this.speech.stop();
  }

  /** Called every frame with real (unscaled) seconds. */
  update(dt) {
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift();
      this.cur.t = 0;
      // read time: typed at ~45 chars/s, then held long enough to read
      this.cur.dur = this.cur.msg.length / 45 + Math.max(1.3, this.cur.msg.length / 30);
      this.who.textContent = this.cur.who;
      this.el.classList.toggle('pilot', this.cur.pilot);
      this.el.classList.toggle('urgent', this.cur.prio >= 3);
      this.el.classList.add('show');
      // the whole call is laid out from the first frame and revealed as it's typed, so the box takes its
      // final size at once instead of growing (and rewrapping) a letter at a time
      this.cur.show = tickerText(this.cur.msg);
      this.typed.textContent = '';
      if (this.rest) this.rest.textContent = this.cur.show;
      if (this.audio) this.audio.play('radio');
      this.speakCur(this.cur);
    }
    if (!this.cur) return;
    const c = this.cur;
    c.t += dt * (this.queue.length ? 1.5 : 1);
    // the engine came up while this call was still being typed (the opening ATIS): say it now
    if (this.voice && !c.sid && c.t < 2.5 && this.speech && this.speech.ready()) this.speakCur(c);
    const shown = Math.min(c.msg.length, Math.ceil(c.t * 45));
    if (this.typed.textContent.length !== shown) {
      this.typed.textContent = c.show.slice(0, shown);
      if (this.rest) this.rest.textContent = c.show.slice(shown);
    }
    // a spoken call holds the ticker until it's said (with a backstop if the engine never answers)
    if (c.t > c.dur && (!c.speaking || c.t > c.dur + 6 + c.msg.length / 12)) {
      this.cur = null;
      if (!this.queue.length) this.el.classList.remove('show');
    }
  }

  // ------------------------------------------------------------ phraseology

  checkIn(a, simTime) {
    if (simTime - this.lastCheckIn < 7) return;
    this.lastCheckIn = simTime;
    const cs = spokenCallsign(a);
    // a real flight reports what it's really doing; simulated ones pick something plausible
    const ft = a.real && a.real.altFt;
    if (ft != null && ft < 1800 && a.cls !== 'heli') {
      return this.say(a, pick([`${this.facility} Tower, ${cs}, with you on the visual.`, `${this.facility} Tower, ${cs}, ${ft.toLocaleString('en-US')} feet, field in sight.`], a.id), 1, true);
    }
    const real = ft != null && ft < 18000 ? `${ft.toLocaleString('en-US')} feet` : null;
    const alt = real || (a.cls === 'heli' ? 'one thousand five hundred' : a.cls === 'light' ? 'two thousand five hundred' : pick(['four thousand', 'five thousand', 'three thousand'], a.id));
    const start = spokenCallsignStart(a);
    this.say(a, pick([
      `${this.facility} Approach, ${cs}, with you at ${alt}.`,
      `${this.facility} Approach, good day, ${cs} descending to ${alt}.`,
      `${start}, with you, ${alt}, information ${pick(Object.values(PHONETIC), Math.floor(simTime / 600) + this.facility.length)}.`,
    ], a.id), 1, true);
  }

  /**
   * ahead: aircraft already sequenced to this runway, nearest the threshold first. ident: the runway end the plane lands on (its
   * zone's active end, unless it is locked on the far one). changed: an emergency plane locked on another end from the one it was named for,
   * which the tower calls a runway change.
   */
  cleared(a, z, wind, ahead = [], ident = z.activeIdent, changed = false) {
    const cs = spokenCallsignStart(a);
    if (z.kind === 'pad') return this.say('TWR', `${cs}, landing at your discretion on the pad. Wind ${wind}.`, 2);
    if (z.kind === 'exit') {
      const sid = z.name ? `${z.name} departure` : 'on course';
      return this.say('TWR', pick([`${cs}, cleared ${sid}, contact departure. Good day.`, `${cs}, turn ${z.name ? 'for ' + z.name : 'on course'}, contact departure.`], a.id), 2);
    }
    // an engine-out or low-fuel plane that lands on the other end from the one it was named for (changed): the tower says the runway changed
    const change = changed ? 'runway change, ' : '';
    if (ahead.length) {
      // the tower gives the sequence: "number 2, follow the Delta"; a simulated lead is named by its type
      const lead = ahead[ahead.length - 1];
      let traffic;
      if (!lead.live) traffic = `the ${callTypeWord(lead.cls)}`;
      else {
        const who = displayName(lead.callsign || '');
        traffic = /^[A-Za-z]+ \d/.test(who) ? `the ${who.split(' ')[0]}` : lead.cls === 'heli' ? 'the helicopter' : lead.cls === 'light' ? 'the Cessna' : 'traffic ahead';
      }
      return this.say('TWR', `${cs}, ${change}number ${ahead.length + 1}, follow ${traffic}. Runway ${sayRunway(ident)}, cleared to land.`, 2);
    }
    this.say('TWR', `${cs}, ${change || `wind ${wind}, `}runway ${sayRunway(ident)}, cleared to land.`, 2);
  }

  /** Sent to a holding fix: "hold at BOKLA as published, maintain six thousand". */
  stack(a, fixName, level) {
    const alt = ['five', 'six', 'seven', 'eight'][level] || 'five';
    const cs = spokenCallsignStart(a);
    this.say('APP', pick([`${cs}, hold at ${fixName} as published, maintain ${alt} thousand, expect further clearance in one zero minutes.`, `${cs}, proceed direct ${fixName}, hold as published, ${alt} thousand.`], a.id), 1);
  }

  hold(a) {
    const cs = spokenCallsignStart(a);
    this.say('TWR', pick([`${cs}, hold present position, expect further clearance.`, `${cs}, enter the hold, I'll call your turn.`], a.id), 1);
  }

  touchdown(a, z, k) {
    if (z.kind !== 'runway') return;
    const cs = spokenCallsignStart(a);
    if (isSleigh(a)) return this.say('TWR', pick([`${cs}, welcome to ${this.facility}. Merry Christmas. Reindeer may taxi to the gate.`, `${cs}, nice landing. Contact ground, and mind the reindeer.`], k), 2);
    this.say('TWR', pick([`${cs}, turn off when able, contact ground point niner.`, `${cs}, welcome to ${this.facility}. Exit left when able.`, `${cs}, nice landing, contact ground.`], k), 1);
  }

  nearMiss(a, b) {
    const cs = spokenCallsignStart(a);
    // the second aircraft opens a sentence here too: a simulated one's type word is capitalised
    this.say('TWR', `${cs}, traffic alert! ${b ? spokenCallsignStart(b) + ' close aboard, ' : ''}turn immediately.`, 3);
  }

  /**
   * z: the runway the fire crews are heading for (engine failures and hydraulics); ident: the end the plane is turning for (an engine
   * failure, which its call names) or sized for (a low fuel), which the tower clears it to. Without an ident, an engine failure has no
   * runway to name, and says it needs the nearest.
   */
  emergency(a, type, z = null, ident = z ? z.activeIdent : null) {
    const cs = spokenCallsignStart(a);
    // a plane whose landing is already locked on this runway is on approach to it, not turning for it (2.6 round 4)
    const locked = z != null && a.target != null && a.target === z.id;
    const engine = ident != null ? (locked ? `on approach for runway ${sayRunway(ident)}` : `turning for runway ${sayRunway(ident)}`) : 'gliding, need the nearest runway';
    const msg = {
      engine: `Mayday, mayday, mayday. ${cs}, engine failure, ${engine}.`,
      fuel: `Pan-pan, pan-pan. ${cs}, minimum fuel, request priority.`,
      medevac: `Pan-pan, pan-pan. ${cs}, medevac flight, request priority landing.`,
      hydraulic: `Mayday, mayday, mayday. ${cs}, hydraulic failure, no flaps, requesting the longest runway.`,
    }[type];
    if (!msg) return;
    this.say(a, msg, 3, true);
    if (z && z.kind === 'runway' && (type === 'engine' || type === 'hydraulic')) {
      this.say('TWR', `${cs}, roger the mayday. Runway ${sayRunway(ident)} is yours, emergency services standing by.`, 2);
    } else if (z && z.kind === 'runway' && type === 'fuel') {
      this.say('TWR', `${cs}, roger the pan-pan. Runway ${sayRunway(ident)} is yours, priority landing.`, 2);
    }
  }

  taxi(a, z, refs) {
    const cs = spokenCallsignStart(a);
    const via = refs && refs.length ? ` via ${refs.slice(0, 3).map(sayTaxiway).join(', ')}` : '';
    // departures only (taxi, holding short, takeoff): a one-way runway is named by its take-off end
    this.say('GND', `${cs}, runway ${sayRunway(takeoffIdent(z))}, taxi${via}.`, 2);
  }

  holdShort(a, z) {
    this.say(a, `Tower, ${spokenCallsign(a)}, holding short ${sayRunway(takeoffIdent(z))}, ready.`, 1, true);
  }

  takeoff(a, z, wind) {
    this.say('TWR', `${spokenCallsignStart(a)}, wind ${wind}, runway ${sayRunway(takeoffIdent(z))}, cleared for takeoff.`, 2);
  }

  /**
   * The airport's ATIS, read at the start of a game from the real METAR when there is one. `runways` are the landing runways
   * (both ways); `oneWay` are the runways that take one way only: [{ land, takeoff }] (the idents), named as such.
   */
  atis(metar, wind, runways, letterSeed = 0, oneWay = []) {
    const letter = Object.values(PHONETIC)[Math.abs(letterSeed) % 26];
    const bits = [`${this.facility} information ${letter}.`, `Wind ${wind}.`];
    const raw = (metar && metar.raw) || '';
    if (metar && metar.visibilitySm != null && metar.visibilitySm < 6) bits.push(`Visibility ${Math.round(metar.visibilitySm * 10) / 10} miles.`);
    const cloud = /\b(FEW|SCT|BKN|OVC)(\d{3})/.exec(raw);
    if (cloud) bits.push(`${{ FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast' }[cloud[1]]} ${(parseInt(cloud[2], 10) * 100).toLocaleString('en-US')}.`);
    const q = /\bQ(\d{4})\b/.exec(raw), alt = /\bA(\d{2})(\d{2})\b/.exec(raw);
    if (q) bits.push(`QNH ${q[1]}.`);
    else if (alt) bits.push(`Altimeter ${alt[1]}.${alt[2]}.`);
    if (runways.length) bits.push(`Landing runway${runways.length > 1 ? 's' : ''} ${runways.slice(0, 3).map(sayRunway).join(', ')}.`);
    for (const o of oneWay.slice(0, 2)) bits.push(`Runway ${sayRunway(o.land)} for landings only, runway ${sayRunway(o.takeoff)} for take-offs only.`);
    this.say('ATIS', bits.join(' '), 1);
  }

  goAround(a, z) {
    this.say('TWR', `${spokenCallsignStart(a)}, go around! Runway ${sayRunway(z.activeIdent)} occupied.`, 3);
  }

  windShift(ident) {
    this.say('TWR', `Attention all aircraft, wind shift. Runway ${sayRunway(ident)} closing, expect a runway change.`, 3);
  }

  /** Santa's sleigh, five seconds before it comes in (santa.js SANTA_SOON_S): the approach's heads-up, an urgent call (priority 3) so it
   *  is said before the sleigh enters, as goAround and windShift are. */
  santaSoon() {
    this.say('APP', pick([`All stations, ${this.facility} Approach, Santa One inbound from the north with reindeer. Give him room.`, `${this.facility} Approach, Santa One, sleigh and reindeer on the north approach. All traffic keep wide.`], this.n), 3);
  }

  /** The hub's arrival bank arriving, or the lull after it. */
  bank(phase) {
    if (phase === 'push') this.say('APP', pick([`All stations, ${this.facility} Approach, arrival push inbound, keep it tight.`, `${this.facility} Approach, here comes the bank. Busy few minutes, all stations.`], this.n), 2);
    else this.say('APP', pick(['Arrivals easing off for a few minutes.', 'That\'s the bank. Quieter now.'], this.n), 1);
  }

  runwayClosing(ident, reason, secs) {
    this.say('TWR', `Attention all aircraft, runway ${sayRunway(ident)} closing in ${secs} seconds for ${reason}.`, 3);
  }

  runwayClosed(ident) {
    this.say('TWR', `Runway ${sayRunway(ident)} is closed. Ops vehicle on the runway.`, 2);
  }

  runwayOpen(ident, cancelled = false) {
    if (cancelled) return this.say('TWR', `Inspection cancelled, runway ${sayRunway(ident)} remains open.`, 2);
    this.say('TWR', pick([`Runway ${sayRunway(ident)} is open again, inspection complete.`, `All stations, runway ${sayRunway(ident)} back open.`], ident.length), 2);
  }

  turbulence(a, why) {
    const cs = spokenCallsignStart(a);
    this.say(a, why === 'wake' ? `${cs}, wake turbulence! Rolling hard!` : `${cs}, severe turbulence!`, 2, true);
  }
}
