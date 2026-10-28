// Tower Jazz, the game's first track. Its events are the score that was in audio.js, unchanged: every call it makes is in
// tests/golden/jazz-events.json. Its flavour is the same at every airport (96 BPM, swing 0.18, no transpose).
// Layers: 0 pads-and-comping with the melody, 1 adds the brushed hats, 2 adds the rim, 3 adds the melody's upper voice.
// (The melody is in layers 0 and 3 only: it drops out at 1 and 2. That is how the game plays it; keep it when porting.)
import { mtof } from './pitch.js?v=2f66fd5f';

// --- the score ---------------------------------------------------------------------------------------------------
const CHORDS = {
  F: { bass: 41, keys: [57, 60, 64, 65] },
  Em: { bass: 40, keys: [55, 59, 62, 64] },
  Dm: { bass: 38, keys: [53, 57, 60, 62] },
  G7: { bass: 43, keys: [53, 55, 59, 62] },
  C: { bass: 36, keys: [55, 59, 60, 64] },
};
const BARS = [['F'], ['Em'], ['Dm'], ['G7'], ['F'], ['Em'], ['Dm', 'G7'], ['C']];
// [step, midi, length-in-steps] per bar
const MELODY = [
  [[0, 76, 3], [3, 72, 1], [4, 69, 2], [6, 72, 2]],
  [[0, 74, 3], [3, 71, 1], [4, 67, 2], [6, 71, 2]],
  [[0, 72, 2], [2, 74, 1], [3, 77, 3], [6, 76, 2]],
  [[0, 74, 4], [4, 71, 2]],
  [[0, 81, 2], [2, 79, 1], [3, 76, 3], [6, 72, 2]],
  [[0, 71, 2], [2, 74, 1], [3, 79, 3], [6, 76, 2]],
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 71, 2], [6, 67, 2]],
  [[0, 72, 6]],
];

/** The eighth step's events for Tower Jazz: `lvl` is the layer 0..3, `f` the flavour { bpm, transpose, swing }. */
function events(step, lvl, f) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const chords = BARS[bar];
  const chord = CHORDS[chords.length > 1 && s >= 4 ? chords[1] : chords[0]];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const swing = s % 2 === 1 ? STEP * (f.swing ?? 0.18) : 0;
  const tr = f.transpose || 0;
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });
  const noise = (t, dur, o) => out.push({ kind: 'noise', t, dur, o });
  const tt = swing;
  // bass: root on 1, fifth on 3, approach note on the "and" of 4
  if (s === 0) tone(mtof(chord.bass + tr), tt, STEP * 3.2, { type: 'triangle', gain: 0.5, attack: 0.01 });
  if (s === 4) tone(mtof(chord.bass + 7 + tr), tt, STEP * 2.2, { type: 'triangle', gain: 0.38, attack: 0.01 });
  if (s === 7) tone(mtof(chord.bass + 5 + tr), tt, STEP * 0.9, { type: 'triangle', gain: 0.26, attack: 0.01 });
  // keys: off-beat comping
  if (s === 3 || s === 6 || (s === 0 && bar % 2 === 0)) {
    for (const k of chord.keys) {
      const m = k + tr;
      tone(mtof(m), tt, STEP * 1.6, { gain: 0.07, attack: 0.008 });
      tone(mtof(m), tt, STEP * 1.2, { gain: 0.025, type: 'triangle', detune: 7 });
    }
  }
  // brushed hats
  if (lvl >= 1) noise(tt, 0.05, { filter: 'highpass', freq: 7000, Q: 0.5, gain: s % 2 ? 0.05 : 0.09 });
  if (lvl >= 2 && (s === 2 || s === 6)) noise(tt, 0.12, { freq: 1800, Q: 0.8, gain: 0.12 });
  // melody
  if (lvl === 0 || lvl >= 3) {
    for (const [st, m0, len] of MELODY[bar]) {
      if (st !== s) continue;
      const m = m0 + tr;
      const g = lvl === 0 ? 0.08 : 0.1;
      tone(mtof(m), tt, STEP * len * 0.95, { type: 'triangle', gain: g, attack: 0.012 });
      tone(mtof(m) * 2, tt, STEP * len * 0.5, { gain: g * 0.18 });
    }
  }
  return out;
}

export default {
  key: 'jazz', // the save's key (settings.musicTrack)
  name: 'Tower Jazz',
  blurb: 'Warm, swinging jazz that picks up as traffic builds.',
  flavour: { bpm: 96, swing: 0.18, transpose: 0 }, // KDFW's (the same at every airport)
  latch: 'step', // the layers follow the traffic at every eighth
  loopBars: 8,
  trim: [0, 0, 0, 0], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
