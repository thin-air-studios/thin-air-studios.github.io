// All sound is synthesised at runtime with Web Audio: no audio files at all. The music's notes live in the tracks
// (music.js TRACKS, one module each in tracks/); this file plays them.
import { DEFAULT_TRACK, trackByKey, flavourOf } from './music.js?v=7227d0de';
import { mtof } from './tracks/pitch.js?v=7227d0de';

const XFADE = 0.5; // seconds: a Settings track change fades the old track out while the new one fades in
const LAND_SCALE = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.intensity = 0; // 0..3 music layers
    this.musicPlaying = false;
    this.lastPlayed = {};
    this.pendingTrack = null; // a Settings choice (a track key): the scheduler applies it at its next step, which opens a bar
    this.bus = null; // the track's own gain into the music bus (a crossfade swaps it); null without Web Audio
    this.barLevel = 0; // the layers of a track that latches them (latch 'bar'), taken at each bar line
    this.stepDur = 60 / 96 / 2; // an eighth note at the current tempo
    this.step = 0; // the step about to be scheduled, 0 .. loopSteps-1
    this.cycle = 0; // the loop's repeats since the track began (a track's events may vary by repeat)
    this.applyTrack(DEFAULT_TRACK);
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.wire(ctx);
    this.startScheduler();
  }

  /** The audio graph (the compressor, the music and sound buses, the echo and the noise): the live game's, and a clip's offline. */
  wire(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.42 : 0;
    this.music.connect(this.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.music);
    // a soft echo for bells and chimes
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.echo.connect(lp);
    lp.connect(fb);
    fb.connect(this.echo);
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0.35;
    lp.connect(this.echoOut);
    this.echoOut.connect(this.sfx);
    // noise buffer
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** The tempo, transpose and swing the track's events are written for (music.js flavourOf). */
  setFlavour(f = {}) {
    this.stepDur = 60 / (f.bpm || 96) / 2;
    this.transpose = f.transpose || 0;
    this.swing = f.swing ?? 0.18;
    this.flavour = { bpm: f.bpm || 96, transpose: this.transpose, swing: this.swing };
  }

  /**
   * Makes a track the one that plays: its events, flavour, loop length and level per traffic layer, and a new loop (repeat 0).
   * An unknown key plays Tower Jazz.
   */
  applyTrack(key) {
    const score = trackByKey(key);
    this.track = score.key;
    this.score = score;
    this.setFlavour(flavourOf(score));
    this.loopSteps = (score.loopBars || 8) * 8;
    this.cycle = 0;
    // the track's level at each traffic layer, dB to gain; a track with no trim (Tower Jazz) plays at 1
    this.trim = [0, 1, 2, 3].map((n) => Math.pow(10, ((score.trim && score.trim[n]) || 0) / 20));
  }

  /** A new game: the track it starts with (the Settings choice), now. A Settings change while playing is setTrack. */
  startTrack(track = this.track) {
    this.pendingTrack = null;
    this.applyTrack(track);
    // a new game opens its track on the first bar: the step of the last track may be past this loop's end
    this.step = 0;
    this.barLevel = this.intensity;
  }

  /**
   * The Settings track. It switches at once: the step is set back to a bar line, so the next scheduled eighth opens a
   * bar of the new track (within the scheduler's 0.15 s lookahead plus one eighth). The step is not reset when the
   * choice is already the track or already waiting, so a Haptics toggle (applySettings calls this too) keeps the bar.
   */
  setTrack(name) {
    const track = trackByKey(name).key;
    if (track === this.track) {
      this.pendingTrack = null;
      return;
    }
    if (track === this.pendingTrack) return;
    this.pendingTrack = track;
    this.step = 0;
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.42 : 0, this.ctx.currentTime, 0.15);
  }

  suspend() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  // ---------------------------------------------------------- primitives

  tone(freq, t0, dur, o = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t0 + (o.glideTime || dur));
    if (o.detune) osc.detune.value = o.detune;
    // a whistle's wobble: a slow LFO into the pitch (cents). Off unless a note asks for it, so every other call is the same
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      depth.gain.value = o.vibrato.cents;
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.02);
    }
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    osc.connect(g);
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      // the night pad's bright-up over its bar: the low-pass opens to filterTo across the note
      if (o.filterTo) f.frequency.linearRampToValueAtTime(o.filterTo, t0 + dur);
      g.connect(f);
      node = f;
    }
    node.connect(o.dest || this.sfx);
    if (o.echo) node.connect(this.echo);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noiseHit(t0, dur, o = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
    f.Q.value = o.Q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  /** Rate-limit a named sound so overlapping events don't stack into noise. */
  gate(name, minGap) {
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed[name] || -9) < minGap) return false;
    this.lastPlayed[name] = now;
    return true;
  }

  // ------------------------------------------------------------- effects

  play(name, arg) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'select':
        this.tone(1320, t, 0.05, { type: 'triangle', gain: 0.09 });
        this.tone(1980, t, 0.035, { gain: 0.04 });
        break;
      case 'lock':
        this.tone(784, t, 0.09, { type: 'triangle', gain: 0.16 });
        this.tone(1175, t + 0.06, 0.16, { type: 'triangle', gain: 0.16, echo: true });
        break;
      case 'land': {
        const c = Math.min((arg || 1) - 1, LAND_SCALE.length - 3);
        const n1 = LAND_SCALE[c], n2 = LAND_SCALE[c + 2];
        for (const [m, dt] of [[n1, 0], [n2, 0.085]]) {
          this.tone(mtof(m), t + dt, 0.75, { gain: 0.17, echo: true });
          this.tone(mtof(m) * 2, t + dt, 0.3, { gain: 0.05, type: 'triangle' });
          this.tone(mtof(m) * 3.01, t + dt, 0.18, { gain: 0.025 });
        }
        break;
      }
      case 'takeoff': {
        // engines spooling up for the roll: jets roar (rising band of noise), props buzz
        if (!this.gate('takeoff', 0.8)) break;
        if (arg === 'light' || arg === 'heli') {
          this.tone(92, t, 2.2, { type: 'sawtooth', gain: 0.035, attack: 0.9, glide: 128, filter: 900 });
          this.tone(184, t, 2.2, { type: 'square', gain: 0.012, attack: 0.9, glide: 256, filter: 1200 });
        } else {
          const big = arg === 'heavy' ? 1.25 : 1;
          this.noiseHit(t, 2.8 * big, { freq: 260, sweep: 1500, Q: 0.8, gain: 0.075 * big, attack: 1.3 });
          this.noiseHit(t, 2.6 * big, { filter: 'lowpass', freq: 220, Q: 0.5, gain: 0.06 * big, attack: 1.1 });
          this.tone(1900, t + 0.2, 2.0, { gain: 0.006, attack: 1.0, glide: 2600 });
        }
        break;
      }
      case 'thunder':
        // distant thunder: a low rumble that swells and rolls away (arg 0..1 = distance)
        if (!this.gate('thunder', 1.5)) break;
        this.noiseHit(t + 0.4 + (arg || 0) * 1.2, 2.4, { filter: 'lowpass', freq: 160, Q: 0.6, gain: 0.12 - (arg || 0) * 0.05, attack: 0.25 });
        this.noiseHit(t + 0.5 + (arg || 0) * 1.2, 1.2, { freq: 420, sweep: 120, Q: 0.8, gain: 0.03, attack: 0.08 });
        break;
      case 'reverse':
        // reverse thrust just after a jet touches down
        if (!this.gate('reverse', 0.5)) break;
        this.noiseHit(t + 0.15, 1.3, { freq: 420, sweep: 260, Q: 0.7, gain: 0.05, attack: 0.35 });
        break;
      case 'radio':
        // push-to-talk squelch: a short band-limited hiss with a click on the front
        if (!this.gate('radio', 0.25)) break;
        this.noiseHit(t, 0.09, { freq: 2400, Q: 0.7, gain: 0.045 });
        this.tone(1650, t, 0.025, { type: 'square', gain: 0.018 });
        break;
      case 'touchdown':
        this.noiseHit(t, 0.16, { freq: 1700, Q: 1.4, gain: 0.08 });
        this.tone(95, t, 0.18, { gain: 0.16, glide: 60 });
        break;
      case 'warn':
        if (!this.gate('warn', 0.25)) return;
        this.tone(660, t, 0.12, { type: 'triangle', gain: 0.07 });
        this.tone(880, t + 0.1, 0.16, { type: 'triangle', gain: 0.07 });
        break;
      case 'prox':
        if (!this.gate('prox', 0.55)) return;
        for (const dt of [0, 0.13]) this.tone(1046, t + dt, 0.085, { type: 'square', gain: 0.07, filter: 2600 });
        break;
      case 'nearMiss':
        this.noiseHit(t, 0.45, { freq: 350, sweep: 3200, Q: 2.5, gain: 0.22, attack: 0.08 });
        break;
      case 'crash':
        this.noiseHit(t, 1.6, { filter: 'lowpass', freq: 4000, sweep: 120, Q: 0.7, gain: 0.85, attack: 0.002 });
        this.tone(80, t, 1.0, { gain: 0.8, glide: 32, type: 'sine' });
        for (let i = 0; i < 6; i++) this.noiseHit(t + 0.15 + i * 0.13 + Math.random() * 0.08, 0.08, { freq: 2500 + Math.random() * 2000, Q: 3, gain: 0.12 });
        break;
      case 'hold':
        this.tone(740, t, 0.1, { type: 'triangle', gain: 0.12, glide: 990 });
        this.tone(990, t + 0.09, 0.14, { type: 'triangle', gain: 0.1, glide: 740, echo: true });
        break;
      case 'emergency':
        for (let i = 0; i < 3; i++) {
          this.tone(740, t + i * 0.36, 0.17, { type: 'square', gain: 0.06, filter: 2200 });
          this.tone(560, t + i * 0.36 + 0.18, 0.17, { type: 'square', gain: 0.06, filter: 2200 });
        }
        break;
      case 'heartbeat':
        this.tone(62, t, 0.16, { gain: 0.5, glide: 44 });
        this.tone(58, t + 0.17, 0.2, { gain: 0.38, glide: 40 });
        break;
      case 'rewind':
        this.tone(1200, t, 0.5, { type: 'triangle', gain: 0.12, glide: 300 });
        this.noiseHit(t, 0.5, { freq: 3000, sweep: 400, Q: 2, gain: 0.12 });
        break;
      case 'click':
        this.tone(880, t, 0.04, { type: 'triangle', gain: 0.1 });
        break;
      case 'toggle':
        this.tone(arg ? 990 : 660, t, 0.06, { type: 'triangle', gain: 0.11 });
        break;
      case 'gameover':
        [67, 64, 60, 55].forEach((m, i) => this.tone(mtof(m), t + 0.35 + i * 0.2, 0.6, { type: 'triangle', gain: 0.12, echo: true }));
        break;
      case 'fanfare':
        [72, 76, 79, 84, 88].forEach((m, i) => this.tone(mtof(m), t + i * 0.09, 0.5, { type: 'triangle', gain: 0.13, echo: true }));
        break;
      case 'ff':
        this.tone(arg ? 600 : 900, t, 0.09, { type: 'triangle', gain: 0.1, glide: arg ? 1100 : 500 });
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------- music

  startScheduler() {
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicPlaying = true;
    setInterval(() => this.schedule(), 30);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05; // resync after a pause
    while (this.nextTime < ctx.currentTime + 0.15) {
      // a bar line: a Settings track starts here, and a track that latches its layers (latch 'bar') takes them for the bar
      if (this.step % 8 === 0) this.barLine();
      if (this.musicOn) this.playStep(this.step, this.nextTime, this.score.latch === 'bar' ? this.barLevel : this.intensity);
      this.step = (this.step + 1) % this.loopSteps;
      if (this.step === 0) this.cycle++; // the loop repeats: a track may vary its repeats (events' cycle argument)
      this.nextTime += this.stepDur;
    }
  }

  barLine() {
    if (this.pendingTrack) {
      this.applyTrack(this.pendingTrack);
      this.pendingTrack = null;
      this.step = 0;
      this.crossfade();
    }
    this.barLevel = this.intensity;
  }

  /** The new track fades in on its own bus while the old bus fades out over XFADE; the old bus goes after the fade. */
  crossfade() {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const t = ctx.currentTime;
    const old = this.bus;
    const next = ctx.createGain();
    next.gain.setValueAtTime(0, t);
    next.gain.linearRampToValueAtTime(1, t + XFADE);
    next.connect(this.music);
    this.bus = next;
    if (old) {
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + XFADE);
      setTimeout(() => old.disconnect(), (XFADE + 0.5) * 1000);
    }
  }

  /**
   * One eighth step of the current track: its events for the step and layer, played into the track's bus. The track's trim
   * for the layer is added to each note's gain (a track with no trim plays exactly as written: no gain is set).
   */
  playStep(step, t, level = this.intensity) {
    const dest = this.bus || this.music;
    const trim = this.trim[level];
    for (const ev of this.score.events(step, level, this.flavour, this.cycle)) {
      const o = { ...ev.o, dest };
      if (trim !== 1) o.gain = (o.gain ?? 0.2) * trim;
      if (ev.kind === 'tone') this.tone(ev.freq, t + ev.t, ev.dur, o);
      else this.noiseHit(t + ev.t, ev.dur, o);
    }
  }
}

/**
 * A clip's music, rendered offline (video.js): the track's own events, through the same graph and in the same steps schedule()
 * plays them, into an OfflineAudioContext. levelAt(t) is the music layer (0..3) at clip second t (the traffic then). A separate
 * engine, so the live game's context and track are not touched. Returns the two channels as Float32Arrays at sampleRate.
 */
export async function renderTrackOffline({ key = DEFAULT_TRACK, seconds, sampleRate = 48000, levelAt }) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OC) return null;
  const ctx = new OC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const eng = new AudioEngine();
  eng.ctx = ctx;
  eng.wire(ctx);
  eng.startTrack(key); // the track's first bar: step 0, its flavour and loop
  for (let t = 0; t < seconds; ) {
    const level = levelAt(t);
    if (eng.step % 8 === 0) eng.barLevel = level; // a bar line latches the layer for the bar (barLine, without a Settings change)
    eng.playStep(eng.step, t, eng.score.latch === 'bar' ? eng.barLevel : level);
    eng.step = (eng.step + 1) % eng.loopSteps;
    if (eng.step === 0) eng.cycle++;
    t += eng.stepDur;
  }
  const out = await ctx.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}
