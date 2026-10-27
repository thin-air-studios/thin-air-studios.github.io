// Lo-fi chill: an original lo-fi hip-hop loop, written for the lab from scratch (no known tune).
// Home key F major, 80 BPM, a lazy swing of 0.16. A 16-bar loop, 48 s at this tempo:
//   A (bars 1 to 8) ends on C9, a half cadence that asks a question;
//   B (bars 9 to 16) answers it in a darker colour (minor iv, a borrowed bVII) and comes home, C9 to F9.
// Layers (latch 'bar', so each change lands on a bar line):
//   0 the bed: Rhodes-like chords (a long hold on beat 1, a stab late in the bar), a round bass on the roots, a soft kick
//     on beat 1, and a little vinyl crackle that every layer has;
//   1 adds the brushed snare on beats 2 and 4, a kick on the "and" of 3 (beat 3 in B), the ticky off-beat hats, the bass
//     fifth (octave in B), and a ghost-note fill at the end of A and B;
//   2 adds the sparse melody (a triangle, filtered soft) and the bass walk into each next root;
//   3 adds a soft octave under the melody, the ghost snare on the last eighth, and hats on every eighth.
// Variation: on odd repeats (cycle 1, 3, ...) the stab keeps its place but takes the plain voicing, not the turned one;
// the A and B phrase ends turn to a different chord tone; and the crackle falls on a new step. The crackle is hashed from
// the loop count, so it is never the same twice. The levels are in one table, LEVEL, above the chords.
import { mtof } from './pitch.js?v=7227d0de';

// --- the score (F major) ---------------------------------------------------------------------------------------------
// Each chord: the bass note (MIDI, the root) and the keys (MIDI) as a rootless voicing (the bass says what the chord is).
const CHORDS = {
  F9: { bass: 41, keys: [57, 60, 64, 67] }, // A C E G: Fmaj9
  Em7: { bass: 40, keys: [55, 59, 62, 64] }, // G B D E: Em7
  Dm9: { bass: 38, keys: [53, 57, 60, 64] }, // F A C E: Dm9
  G9: { bass: 43, keys: [59, 62, 65, 69] }, // B D F A: G9
  Am9: { bass: 45, keys: [60, 64, 67, 71] }, // C E G B: Am9
  Bbmaj9: { bass: 46, keys: [62, 65, 69, 72] }, // D F A C: Bbmaj9
  C9: { bass: 36, keys: [64, 67, 70, 74] }, // E G Bb D: C9
  Gm9: { bass: 43, keys: [58, 62, 65, 69] }, // Bb D F A: Gm9
  Ebmaj9: { bass: 39, keys: [55, 58, 62, 65] }, // G Bb D F: Ebmaj9
};

// The levels, one place to tune them (the peak of each note, before the master chain). Measured in render.mjs.
const LEVEL = {
  chord: 0.08, // each Rhodes key
  bass: 0.45, // the root
  bassMove: 0.3, // the fifth or octave, and the walk into the next root
  kick: 0.36, // beat 1
  kickTwo: 0.26, // the second kick
  snare: 0.115, // the brushed snare on 2 and 4
  fill: 0.045, // the ghost fill at the end of A and B
  ghost: 0.045, // the ghost snare on the last eighth (layer 3)
  hatOff: 0.045, // the hats on the off-beats
  hatOn: 0.07, // the hats on the beats (layer 3)
  crackle: 0.013, // the vinyl tick
  melody: 0.1, // the melody
  melodyOct: 0.05, // the soft octave under it (layer 3)
};

// The chord for each bar of the 16-bar loop.
const PLAN = [
  'F9', 'Em7', 'Dm9', 'G9', 'Am9', 'Dm9', 'Bbmaj9', 'C9', // A
  'Am9', 'Dm9', 'Gm9', 'C9', 'F9', 'Ebmaj9', 'Dm9', 'C9', // B
];

// The melody: per bar, [step, midi, length in eighths]. Mostly chord tones on the beats, passing notes between them.
const MELODY = [
  [[0, 72, 3], [3, 69, 2], [6, 67, 2]], // 1  F9: C5 A4 G4
  [[0, 71, 2], [2, 74, 2], [5, 72, 1], [6, 64, 2]], // 2  Em7: B4 D5 C5 E4
  [[0, 74, 2], [2, 72, 2], [4, 69, 2], [6, 67, 2]], // 3  Dm9: D5 C5 A4 G4
  [[0, 71, 3], [3, 65, 2], [6, 64, 2]], // 4  G9: B4 F4 E4
  [[0, 69, 4], [4, 72, 2], [6, 71, 2]], // 5  Am9: A4 C5 B4
  [[0, 65, 2], [2, 64, 2], [4, 62, 4]], // 6  Dm9: F4 E4 D4
  [[0, 74, 3], [3, 70, 2], [6, 67, 2]], // 7  Bbmaj9: D5 Bb4 G4
  [[0, 72, 2], [2, 70, 2], [4, 67, 4]], // 8  C9: C5 Bb4 G4 (a half cadence: it waits)
  [[0, 69, 2], [2, 72, 2], [4, 76, 2], [6, 74, 2]], // 9  Am9: A4 C5 E5 D5 (B opens higher)
  [[0, 74, 2], [2, 77, 2], [4, 76, 2], [6, 72, 2]], // 10 Dm9: D5 F5 E5 C5
  [[0, 70, 3], [3, 69, 2], [5, 67, 3]], // 11 Gm9: Bb4 A4 G4 (the darker colour)
  [[0, 72, 2], [2, 76, 2], [4, 74, 4]], // 12 C9: C5 E5 D5
  [[0, 77, 4], [4, 76, 2], [6, 72, 2]], // 13 F9: F5 E5 C5 (home)
  [[0, 67, 2], [2, 70, 2], [4, 74, 2], [6, 75, 2]], // 14 Ebmaj9: G4 Bb4 D5 Eb5
  [[0, 74, 2], [2, 72, 2], [4, 69, 2], [6, 65, 2]], // 15 Dm9: D5 C5 A4 F4
  [[0, 67, 4], [4, 70, 2], [6, 72, 2]], // 16 C9: G4 Bb4 C5 (back to bar 1)
];
// On odd repeats, the phrase ends (bars 8 and 16) turn to another chord tone: step -> the note that replaces it.
const MELODY_ODD = { 7: { 4: [4, 64, 4] }, 15: { 6: [6, 69, 2] } }; // bar 8: G4 -> E4; bar 16: C5 -> A4

/** The melody for a bar on this repeat. */
function melodyAt(bar, cycle) {
  const alt = cycle % 2 === 1 ? MELODY_ODD[bar] : null;
  if (!alt) return MELODY[bar];
  return MELODY[bar].map((n) => (alt[n[0]] ? alt[n[0]] : n));
}

/** The eighth step's events for Lo-fi chill: `lvl` is the layer 0..3, `f` the flavour, `cycle` the loop's repeat. */
function events(step, lvl, f, cycle) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const inB = bar >= 8; // the second half of the loop
  const odd = cycle % 2 === 1;
  const chord = CHORDS[PLAN[bar]];
  const next = CHORDS[PLAN[(bar + 1) % 16]];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const tt = s % 2 === 1 ? STEP * (f.swing ?? 0.16) : 0; // the swing: an odd eighth falls late
  const lazy = tt + 0.012; // laid back: the snare and the melody sit a little behind the grid
  const tr = f.transpose || 0;
  const m2f = (m) => mtof(m + tr);
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });
  const noise = (t, dur, o) => out.push({ kind: 'noise', t, dur, o });

  // --- the chords (every layer): a hold from beat 1 that rings into the stab, then a stab on the "and" of 3. The stab
  // is a turned voicing (its lowest note up an octave) on even repeats and the plain voicing on odd repeats. The hold
  // and the stab are long enough that the bed never falls silent between them (a Rhodes dies out well before its end).
  const rhodes = (m, t, dur, g) =>
    tone(m2f(m), t, dur, { type: 'triangle', gain: g, attack: 0.012, filter: 2600, filterTo: 1300 });
  if (s === 0) for (const m of chord.keys) rhodes(m, 0, STEP * 7, LEVEL.chord);
  if (s === 5) {
    const [a, b, c, d] = chord.keys;
    const stab = odd ? [a, b, c, d] : [b, c, d, a + 12];
    for (const m of stab) rhodes(m, tt, STEP * 4, LEVEL.chord);
  }

  // --- the bass (every layer has the root; the rest comes in by layer): round, a triangle with its top filtered off
  const bass = (m, t, dur, g) => tone(m2f(m), t, dur, { type: 'triangle', gain: g, attack: 0.012, filter: 600 });
  if (s === 0) bass(chord.bass, 0, STEP * 3, LEVEL.bass);
  if (s === 5 && lvl >= 1) bass(chord.bass + (inB ? 12 : 7), tt, STEP * 2, LEVEL.bassMove); // the fifth in A, the octave in B
  if (s === 7 && lvl >= 2) {
    const approach = next.bass > chord.bass ? next.bass - 1 : next.bass + 1; // a half step into the next root
    bass(approach, tt, STEP, LEVEL.bassMove);
  }

  // --- the kick: a soft sine that drops from 110 Hz to 42 Hz. Beat 1 always; a second kick from layer 1.
  const kick = (t, g) => tone(110, t, 0.22, { type: 'sine', gain: g, attack: 0.002, glide: 42, glideTime: 0.13 });
  if (s === 0) kick(0, LEVEL.kick);
  if (lvl >= 1 && s === (inB ? 4 : 5)) kick(tt, LEVEL.kickTwo);

  // --- the brushed snare: a soft band of noise on beats 2 and 4 (layer 1 and up). A ghost note fills the last bar of
  // A and of B, and a ghost on the last eighth joins at layer 3.
  if (lvl >= 1 && (s === 2 || s === 6)) noise(lazy, 0.18, { freq: 2000, Q: 0.9, gain: LEVEL.snare, attack: 0.02 });
  if (lvl >= 1 && (bar === 7 || bar === 15) && (s === 5 || s === 7)) {
    noise(lazy, 0.1, { freq: 2000, Q: 0.9, gain: LEVEL.fill, attack: 0.015 });
  }
  if (lvl >= 3 && s === 7) noise(lazy, 0.1, { freq: 2000, Q: 0.9, gain: LEVEL.ghost, attack: 0.015 });

  // --- the hats: ticky, high and short. The off-beat eighths from layer 1; every eighth from layer 3.
  if (lvl >= 1 && (s % 2 === 1 || lvl >= 3)) {
    noise(tt, 0.035, { filter: 'highpass', freq: 8500, Q: 0.7, gain: s % 2 === 1 ? LEVEL.hatOff : LEVEL.hatOn });
  }

  // --- the vinyl crackle (every layer): one tick a bar, on a step hashed from the bar and the repeat, so it moves
  const n = cycle * 16 + bar + 1;
  const crackleStep = (Math.imul(n, 0x9e3779b1) >>> 29) & 7;
  if (s === crackleStep) noise(tt, 0.02, { filter: 'highpass', freq: 3000, Q: 0.7, gain: LEVEL.crackle });

  // --- the melody (layers 2 and 3): sparse and relaxed; from layer 3, a soft sine an octave under it
  if (lvl >= 2) {
    for (const [st, m, len] of melodyAt(bar, cycle)) {
      if (st !== s) continue;
      tone(m2f(m), lazy, STEP * len * 0.95, { type: 'triangle', gain: LEVEL.melody, attack: 0.03, filter: 2400, filterTo: 1500 });
      if (lvl >= 3) tone(m2f(m - 12), lazy, STEP * len * 0.9, { type: 'sine', gain: LEVEL.melodyOct, attack: 0.04 });
    }
  }
  return out;
}

export default {
  key: 'lofi',
  name: 'Lo-fi chill',
  blurb: 'A lazy, warm lo-fi beat with soft piano chords and a light tune.',
  flavour: { bpm: 80, swing: 0.16, transpose: 0 },
  latch: 'bar', // a change of traffic layer waits for the next bar line
  loopBars: 16,
  trim: [1.2, 0, -0.6, -0.4], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
