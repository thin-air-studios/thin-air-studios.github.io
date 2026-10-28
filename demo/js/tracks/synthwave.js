// Synthwave: an original track, written from scratch for the music lab (no known tune is quoted).
// The feel is a night highway under runway lights: a pulsing octave bass, a gated snare, a four-on-the-floor kick at the top,
// lush detuned saw pads that open slowly, and a soaring lead at layers 2 and 3.
// Key A minor, 104 BPM, straight (swing 0). The loop is 16 bars: A (bars 1 to 8) and B (bars 9 to 16). The loop ends on E,
// the dominant, and leads home to A minor.
//
// Layers (latch 'bar': a change of traffic takes effect at the next bar line):
//   0  the pads, and a soft sine on each beat (the calm bed)
//   1  + the driving eighth-note bass (a saw whose filter closes on every note), a gated snare on beats 2 and 4, closed hats
//        on the off-beats
//   2  + a four-on-the-floor kick, + the soaring lead (a saw through a low-pass, with a little vibrato on the long notes)
//   3  + the lead doubled an octave down, + an open-hat shimmer on beats 2 and 4, + the pads open a little further
import { mtof } from './pitch.js?v=2f66fd5f';

// --- the score ---------------------------------------------------------------------------------------------------------

// One chord per bar of the 16-bar loop: its name, its bass root (MIDI) and its pad voicing (three MIDI notes).
const CHORDS = [
  { n: 'Am', root: 45, pad: [57, 60, 64] }, // A: i, i, VI, VI, III, III, VII, V
  { n: 'Am', root: 45, pad: [57, 60, 64] },
  { n: 'F', root: 41, pad: [53, 57, 60] },
  { n: 'F', root: 41, pad: [53, 57, 60] },
  { n: 'C', root: 36, pad: [55, 60, 64] },
  { n: 'C', root: 36, pad: [55, 60, 64] },
  { n: 'G', root: 43, pad: [59, 62, 67] },
  { n: 'E', root: 40, pad: [56, 59, 64] }, // the dominant: a question the loop answers in bar 1
  { n: 'Dm', root: 38, pad: [62, 65, 69] }, // B: a lift, one chord a bar, the pads a fourth higher
  { n: 'Bb', root: 46, pad: [62, 65, 70] },
  { n: 'C', root: 36, pad: [60, 64, 67] },
  { n: 'F', root: 41, pad: [60, 65, 69] },
  { n: 'G', root: 43, pad: [62, 67, 71] },
  { n: 'Am', root: 45, pad: [60, 64, 69] },
  { n: 'C', root: 36, pad: [60, 64, 67] },
  { n: 'E', root: 40, pad: [59, 64, 68] }, // leads home to bar 1
];

// The bass: an offset in semitones from the chord's root, one per eighth note of a bar. Every offset is a chord tone (0 root,
// 7 fifth, 12 octave), so the figure stays on the chord whatever it is. Odd times round, the last eighths change.
const PUMP = {
  A: [0, 12, 0, 12, 0, 12, 7, 12],
  Aalt: [0, 12, 0, 12, 0, 12, 7, 19],
  B: [0, 12, 7, 12, 0, 12, 7, 12],
  Balt: [0, 12, 7, 12, 0, 12, 12, 19],
};

// The lead: [step, midi, length in eighths] per bar. Bars 1 to 8 (A) climb to a long E5, then a bright F5, the A5 and the
// question of G#5. Bars 9 to 16 (B) lift higher and peak on C6, B5 and back down through E5 to B4 and home.
const LEAD = [
  [[0, 69, 2], [2, 72, 2], [4, 76, 4]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 71, 2]],
  [[0, 69, 2], [2, 72, 2], [4, 77, 4]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 4]],
  [[0, 67, 2], [2, 72, 2], [4, 76, 2], [6, 79, 2]],
  [[0, 81, 4], [4, 79, 2], [6, 76, 2]],
  [[0, 74, 2], [2, 71, 2], [4, 67, 2], [6, 71, 2]],
  [[0, 71, 2], [2, 76, 2], [4, 80, 4]],
  [[0, 74, 2], [2, 77, 2], [4, 81, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 74, 2], [6, 77, 2]],
  [[0, 76, 2], [2, 79, 2], [4, 84, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 77, 2], [6, 76, 2]],
  [[0, 74, 2], [2, 79, 2], [4, 83, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2]],
  [[0, 76, 2], [2, 79, 2], [4, 84, 2], [6, 83, 2]],
  [[0, 83, 2], [2, 80, 2], [4, 76, 2], [6, 71, 2]],
];
// The other time round (cycle 1, 3, ...): three bars of the B section sing a different line over the same chords.
const LEAD_ALT = {
  10: [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2]], // C5 E5 G5 C6: a rising arpeggio
  12: [[0, 79, 2], [2, 83, 2], [4, 86, 4]], // G5 B5 D6: higher still
  14: [[0, 79, 4], [4, 76, 2], [6, 72, 2]], // G5, then down to E5 and C5
};
// The bars whose long lead note rings through the echo (the chime at the top of a phrase).
const ECHO_BARS = [2, 5, 10, 12];

// A chord's pad notes start at the first bar of its run (two bars for some A chords, one bar for most of B). A pad note rings
// for four times its run, so each new chord swells in over the last one, and the filter opens over the whole run.
const RUN_START = [];
const RUN_BARS = [];
for (let b = 0; b < 16; b++) {
  RUN_START[b] = CHORDS[b].n !== CHORDS[(b + 15) % 16].n;
  let n = 1;
  while (n < 16 && CHORDS[(b + n) % 16].n === CHORDS[b].n) n++;
  RUN_BARS[b] = n;
}

/** The eighth step's events for Synthwave: `lvl` is the layer 0..3, `f` the flavour { bpm, transpose, swing }. */
function events(step, lvl, f, cycle) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const chord = CHORDS[bar];
  const eighth = 60 / f.bpm / 2; // one eighth note, in seconds
  const barLen = 8 * eighth;
  const swing = s % 2 === 1 ? eighth * (f.swing || 0) : 0; // straight at 0; kept so a swung flavour still works
  const tr = f.transpose || 0;
  const alt = cycle % 2 === 1; // every other time round: a different bass figure and, in B, a different lead line
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });
  const noise = (t, dur, o) => out.push({ kind: 'noise', t, dur, o });

  // layer 0: the pads. Each chord run starts with a swell: three notes, each two saws detuned seven cents either side, through a low-pass
  // that opens over the whole run. Layer 3 opens them a little further.
  if (s === 0 && RUN_START[bar]) {
    const ring = 4 * RUN_BARS[bar] * barLen + 0.4;
    const top = lvl >= 3 ? 2600 : 2000;
    for (const m of chord.pad) {
      for (const det of [-7, 7]) {
        tone(mtof(m + tr), swing, ring, { type: 'sawtooth', gain: 0.038, attack: 0.5, detune: det, filter: 800, filterTo: top });
      }
    }
  }
  // layer 0: a soft sine on each beat, at the chord's root
  if (s % 2 === 0) tone(mtof(chord.root + tr), swing, eighth * 5, { type: 'sine', gain: 0.19, attack: 0.012 });

  // layer 1: the driving bass (a saw, its filter closing on every eighth) and the gated snare on beats 2 and 4, with the
  // hats on the off-beats
  if (lvl >= 1) {
    const set = bar < 8 ? (alt ? PUMP.Aalt : PUMP.A) : (alt ? PUMP.Balt : PUMP.B);
    tone(mtof(chord.root + set[s] + tr), swing, eighth * 0.85, { type: 'sawtooth', gain: 0.11, attack: 0.004, filter: 1100, filterTo: 380 });
    if (s === 2 || s === 6) noise(swing, 0.22, { freq: 1800, Q: 0.9, gain: 0.1, attack: 0.002 });
    if (s % 2 === 1) noise(swing, 0.03, { filter: 'highpass', freq: 8000, Q: 0.5, gain: 0.03 });
  }

  // layer 2: a four-on-the-floor kick (a sine that drops in pitch), and the soaring lead
  if (lvl >= 2) {
    if (s % 2 === 0) tone(130, swing, 0.18, { type: 'sine', gain: 0.2, attack: 0.002, glide: 42, glideTime: 0.06 });
    const line = (alt && LEAD_ALT[bar]) || LEAD[bar];
    for (const [st, m, len] of line) {
      if (st !== s) continue;
      const o = { type: 'sawtooth', gain: 0.036, attack: 0.03, filter: 2600 };
      if (len >= 4) o.vibrato = { rate: 5, cents: 8 };
      if (len >= 4 && ECHO_BARS.includes(bar)) o.echo = true;
      tone(mtof(m + tr), swing, eighth * len * 0.92, o);
      // layer 3: the same note an octave down, softer, for body
      if (lvl >= 3) tone(mtof(m - 12 + tr), swing, eighth * len * 0.92, { type: 'triangle', gain: 0.05, attack: 0.03 });
    }
  }

  // layer 3: an open-hat shimmer on beats 2 and 4
  if (lvl >= 3 && (s === 2 || s === 6)) noise(swing, 0.14, { filter: 'highpass', freq: 9000, Q: 0.6, gain: 0.02 });

  return out;
}

export default {
  key: 'synthwave',
  name: 'Synthwave',
  blurb: 'Night drive: a pulsing bass, soft pads and a soaring synth lead.',
  flavour: { bpm: 104, swing: 0, transpose: 0 }, // straight: synthwave is not swung
  latch: 'bar', // a change of traffic waits for the next bar line
  loopBars: 16,
  trim: [-0.1, -0.9, -1.3, -1.1], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
