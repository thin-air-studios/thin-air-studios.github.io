// Bossa nova, an original track written for the lab (no known tune). A light two-feel at 124 BPM on straight eighths.
// Layers: 0 the bed (a bass on beat 1 and the "and" of 2, and the guitar comping); 1 adds a shaker on every eighth;
// 2 adds a breezy flute-like melody (a sine with a little vibrato); 3 adds a lighter shaker on the sixteenths and the
// flute's octave, quietly. The loop is 16 bars: A (bars 1 to 8) and B (bars 9 to 16). Every other pass (cycle 1, 3, ...)
// the phrase ends of bars 4, 8, 12 and 16 turn, and bars 4 and 12 anticipate the next chord, so the loop returns changed.
import { mtof } from './pitch.js?v=86c2b44d';

// --- the score (C major; the game moves every pitch by f.transpose) ------------------------------------------------
// Per bar: the chord (for the reader), the bass on step 0 (beat 1) and step 3 (the "and" of 2), the comping voicing
// (four notes, rootless, so the bass carries the root), and an optional approach note for step 7 into the next chord.
const BARS = [
  { chord: 'Cmaj9', bass: [36, 43], keys: [64, 67, 71, 74] },
  { chord: 'E7/B', bass: [35, 40], keys: [68, 71, 74, 78] },
  { chord: 'Am9', bass: [33, 40], keys: [67, 71, 72, 76] },
  { chord: 'G13', bass: [43, 38], keys: [65, 69, 71, 76] },
  { chord: 'Fmaj9', bass: [41, 36], keys: [67, 69, 72, 76] },
  { chord: 'Em9', bass: [40, 35], keys: [67, 71, 74, 78] },
  { chord: 'A7b9', bass: [33, 40], keys: [64, 67, 70, 73] },
  { chord: 'Dm9', bass: [38, 33], keys: [65, 69, 72, 76], approach: 33 },
  { chord: 'Bbmaj9', bass: [34, 41], keys: [65, 69, 72, 74] },
  { chord: 'Am7', bass: [33, 40], keys: [64, 67, 72, 76] },
  { chord: 'D7', bass: [38, 33], keys: [66, 69, 72, 76] },
  { chord: 'Gm7', bass: [43, 38], keys: [65, 70, 74, 77] },
  { chord: 'C9', bass: [36, 43], keys: [67, 70, 74, 76] },
  { chord: 'Fmaj9', bass: [41, 36], keys: [67, 69, 72, 76] },
  { chord: 'Dm9', bass: [38, 33], keys: [65, 69, 72, 76] },
  { chord: 'G13', bass: [43, 38], keys: [65, 69, 71, 76], approach: 35 },
];

// The flute's line: [step, midi, length in steps] per bar. Bars 1 to 8 are A, 9 to 16 are B.
const MELODY = [
  [[2, 76, 3], [5, 74, 1], [6, 72, 2]], // 1: E5 D5 C5
  [[1, 80, 2], [4, 78, 2], [6, 76, 2]], // 2: G#5 F#5 E5
  [[0, 81, 3], [4, 79, 2], [6, 76, 2]], // 3: A5 G5 E5
  [[0, 79, 2], [2, 77, 2], [4, 76, 4]], // 4: G5 F5 E5
  [[0, 77, 2], [2, 81, 2], [4, 79, 4]], // 5: F5 A5 G5
  [[0, 79, 2], [2, 78, 2], [4, 76, 4]], // 6: G5 F#5 E5
  [[0, 79, 3], [4, 73, 2], [6, 74, 2]], // 7: G5 C#5 D5 (leads to D minor)
  [[0, 77, 2], [2, 76, 2], [4, 74, 4]], // 8: F5 E5 D5 (a half cadence into B)
  [[0, 82, 3], [4, 81, 2], [6, 79, 2]], // 9: Bb5 A5 G5
  [[0, 76, 2], [2, 79, 2], [4, 81, 4]], // 10: E5 G5 A5
  [[0, 78, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]], // 11: F#5 A5 C6 A5
  [[0, 79, 2], [2, 82, 2], [4, 77, 4]], // 12: G5 Bb5 F5
  [[0, 76, 2], [2, 79, 2], [4, 82, 2], [6, 79, 2]], // 13: E5 G5 Bb5 G5
  [[0, 84, 3], [4, 81, 2], [6, 77, 2]], // 14: C6 A5 F5
  [[0, 81, 2], [2, 77, 2], [4, 74, 4]], // 15: A5 F5 D5
  [[0, 83, 2], [2, 81, 2], [4, 79, 4]], // 16: B5 A5 G5 (leads home to C)
];

// The turns: on odd passes, these phrase ends replace the melody's last two-bar figure (bars 4, 8, 12 and 16).
const TURN = {
  3: [[0, 79, 2], [2, 77, 2], [4, 79, 2], [6, 76, 2]], // G5 F5 G5 E5
  7: [[0, 77, 2], [2, 76, 2], [4, 77, 2], [6, 74, 2]], // F5 E5 F5 D5
  11: [[0, 79, 2], [2, 82, 2], [4, 84, 2], [6, 82, 2]], // G5 Bb5 C6 Bb5
  15: [[0, 83, 2], [2, 84, 2], [4, 83, 2], [6, 79, 2]], // B5 C6 B5 G5
};

/** One guitar chord: four plucked triangles, slightly detuned, through a soft low-pass. */
function strum(out, keys, t, STEP, tr, gain) {
  for (const k of keys) {
    out.push({
      kind: 'tone',
      freq: mtof(k + tr),
      t,
      dur: STEP * 1.7,
      o: { type: 'triangle', gain, attack: 0.005, detune: 4, filter: 2600 },
    });
  }
}

/** The eighth step's events for Bossa nova: `lvl` is the layer 0..3, `f` the flavour, `cycle` the loop's repeats. */
function events(step, lvl, f, cycle) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const chord = BARS[bar];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const tr = f.transpose || 0;
  const t = s % 2 === 1 ? STEP * (f.swing || 0) : 0; // straight eighths (swing 0)
  const tone = (freq, t0, dur, o) => out.push({ kind: 'tone', freq, t: t0, dur, o });
  const noise = (t0, dur, o) => out.push({ kind: 'noise', t: t0, dur, o });
  const turned = cycle % 2 === 1;

  // layer 0: the bass on beat 1 and on the "and" of 2 (soft triangles), and an approach note where the bar has one
  if (s === 0) tone(mtof(chord.bass[0] + tr), t, STEP * 2.8, { type: 'triangle', gain: 0.5, attack: 0.012 });
  if (s === 3) tone(mtof(chord.bass[1] + tr), t, STEP * 3.2, { type: 'triangle', gain: 0.36, attack: 0.012 });
  if (s === 7 && chord.approach) tone(mtof(chord.approach + tr), t, STEP * 0.9, { type: 'triangle', gain: 0.3, attack: 0.01 });

  // layer 0: the guitar comping. The first bar of each pair strums on 3 and 6; the second on 2, 5 and the "and" of 4,
  // which leads into the next pair (the syncopation, and no gap before the next bar's bass).
  const hits = bar % 2 === 0 ? [3, 6] : [2, 5, 7];
  if (hits.includes(s)) {
    // on odd passes, bars 4 and 12 turn their last strum into the next chord (an anticipation)
    const anticipate = turned && s === 7 && (bar === 3 || bar === 11);
    strum(out, anticipate ? BARS[bar + 1].keys : chord.keys, t, STEP, tr, 0.12);
  }

  // layer 1: a shaker on every eighth, a little louder on the offbeats
  if (lvl >= 1) noise(t, 0.05, { filter: 'highpass', freq: 6000, Q: 0.7, gain: s % 2 ? 0.07 : 0.04, attack: 0.003 });

  // layers 2 and 3: the breezy flute, a sine with a little vibrato (layer 3 adds its octave, quietly)
  if (lvl >= 2) {
    const line = (turned && TURN[bar]) || MELODY[bar];
    for (const [st, m, len] of line) {
      if (st !== s) continue;
      const dur = STEP * len * 0.92;
      const flute = { type: 'sine', attack: 0.05, vibrato: { rate: 5.2, cents: 12 } };
      tone(mtof(m + tr), t, dur, { ...flute, gain: 0.14 });
      if (lvl >= 3) tone(mtof(m + 12 + tr), t, dur, { ...flute, gain: 0.025 });
    }
  }

  // layer 3: a lighter shaker on the sixteenths, the half step after each eighth
  if (lvl >= 3) noise(STEP * 0.5, 0.03, { filter: 'highpass', freq: 7000, Q: 0.7, gain: 0.025, attack: 0.003 });

  return out;
}

export default {
  key: 'bossa',
  name: 'Bossa nova',
  blurb: 'Sunny, relaxed bossa nova: guitar, bass, shaker and a flute.',
  flavour: { bpm: 124, swing: 0, transpose: 0 }, // straight eighths, in the key of C
  latch: 'bar', // a change of traffic layer waits for the next bar line
  loopBars: 16,
  trim: [0.1, -0.1, -0.8, -0.5], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
