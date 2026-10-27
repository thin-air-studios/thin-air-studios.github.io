// Cinematic calm: an original ambient track, written from scratch for the music lab (no known tune is quoted).
// The feel is an airport at dawn: the sky lightening over the apron, wide and slow, never in a hurry.
// Key D major, 66 BPM (four beats to a bar), a gentle swing of 0.12. The loop is 16 bars: A (bars 1 to 8) and B (bars 9 to
// 16). A asks a question and stops on a suspended A (bar 8); B answers it higher and brighter, and bar 16 (the dominant)
// leads home to D in bar 1.
//
// Level: the lab levels every track to Tower Jazz's RMS at each traffic layer (the `trim` below). This track is quieter at its
// source, so its trim is the largest of the set (about 10 to 16 dB) and brings it to the same level as the others.
//
// Layers (latch 'bar': a change of traffic takes effect at the next bar line, so nothing enters mid-bar):
//   0  the bed: three soft triangles on each chord (a 1.8 s swell that rings into the next bar, the two outer voices
//      detuned a few cents for a chorus), a sine on the root under them, and a bell chime on beat 3 of every other bar
//      (the echo carries it)
//   1  + a gentle pulse: a sine on the root on beats 1 and 3, and a quieter sine an octave up on beats 2 and 4
//   2  + soft bell plucks on every off-beat: the chord's tones, the middle one an octave up
//   3  + the melody: a quiet triangle line in the upper register, the hopeful part; the pads open a little as each note
//      runs (the low-pass rises across the note)
// Variation: the melody takes one of two other lines on alternate passes (cycle 1 and 3), the chime moves to the other
// bars on the odd passes, and the plucks run their figure the other way round on odd passes.
import { mtof } from './pitch.js?v=7227d0de';

// --- the score (D major) -----------------------------------------------------------------------------------------------
// One chord per bar: its name (for reading), the bass root for the drone and the pulse (MIDI), and the pad voicing
// (three MIDI notes). The voicings move by a step or two from bar to bar, so the pad glides under the changes.
const SCORE = [
  { name: 'D', root: 50, pad: [57, 62, 66] }, // 1
  { name: 'Bm7', root: 59, pad: [59, 62, 66] }, // 2
  { name: 'G', root: 55, pad: [59, 62, 67] }, // 3
  { name: 'A', root: 57, pad: [61, 64, 69] }, // 4: the dominant, the question
  { name: 'Em7', root: 52, pad: [59, 62, 67] }, // 5
  { name: 'F#m7', root: 54, pad: [61, 64, 69] }, // 6
  { name: 'G', root: 55, pad: [59, 62, 67] }, // 7
  { name: 'Asus', root: 57, pad: [57, 62, 64] }, // 8: A suspended, left open
  { name: 'G', root: 55, pad: [62, 67, 71] }, // 9: B opens higher
  { name: 'Em7', root: 52, pad: [64, 67, 71] }, // 10
  { name: 'Bm7', root: 59, pad: [62, 66, 69] }, // 11
  { name: 'D/F#', root: 54, pad: [62, 66, 69] }, // 12
  { name: 'G', root: 55, pad: [62, 67, 71] }, // 13
  { name: 'F#m7', root: 54, pad: [61, 64, 69] }, // 14
  { name: 'Bm7', root: 59, pad: [62, 66, 69] }, // 15
  { name: 'A', root: 57, pad: [61, 64, 69] }, // 16: the dominant, home in bar 1
];

// The melody: per bar, [step, midi, length in eighths]. Chord tones on the strong beats, passing notes between them.
const LINE = [
  [[0, 74, 4], [4, 78, 2], [6, 76, 2]], // 1  D: D5 F#5 E5
  [[0, 71, 2], [2, 74, 2], [4, 78, 4]], // 2  Bm7: B4 D5 F#5
  [[0, 79, 4], [4, 78, 2], [6, 74, 2]], // 3  G: G5 F#5 D5
  [[0, 73, 4], [4, 76, 4]], // 4  A: C#5 E5, the question left open
  [[0, 71, 2], [2, 74, 2], [4, 79, 4]], // 5  Em7: B4 D5 G5
  [[0, 81, 4], [4, 76, 2], [6, 73, 2]], // 6  F#m7: A5 E5 C#5
  [[0, 79, 2], [2, 78, 2], [4, 74, 2], [6, 71, 2]], // 7  G: G5 F#5 D5 B4, falling
  [[0, 74, 4], [4, 76, 4]], // 8  Asus: D5 E5
  [[0, 81, 3], [3, 79, 1], [4, 78, 4]], // 9  G: A5 G5 F#5, the lift
  [[0, 79, 2], [2, 74, 2], [4, 71, 4]], // 10 Em7: G5 D5 B4
  [[0, 78, 2], [2, 81, 2], [4, 83, 4]], // 11 Bm7: F#5 A5 B5, rising
  [[0, 81, 2], [2, 78, 2], [4, 74, 4]], // 12 D/F#: A5 F#5 D5
  [[0, 83, 2], [2, 79, 2], [4, 78, 2], [6, 74, 2]], // 13 G: B5 G5 F#5 D5
  [[0, 81, 2], [2, 76, 2], [4, 73, 4]], // 14 F#m7: A5 E5 C#5
  [[0, 74, 2], [2, 78, 2], [4, 81, 2], [6, 83, 2]], // 15 Bm7: D5 F#5 A5 B5
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 73, 2]], // 16 A: A5 G5 E5 C#5, home to D
];
// The two other lines the melody takes on alternate passes. A bar that is not listed keeps LINE.
const ALT1 = {
  1: [[0, 78, 2], [2, 74, 2], [4, 71, 4]], // bar 2: F#5 D5 B4
  5: [[0, 76, 2], [2, 81, 2], [4, 78, 4]], // bar 6: E5 A5 F#5
  9: [[0, 83, 2], [2, 79, 2], [4, 74, 4]], // bar 10: B5 G5 D5
  13: [[0, 73, 2], [2, 76, 2], [4, 81, 4]], // bar 14: C#5 E5 A5
};
const ALT2 = {
  2: [[0, 71, 2], [2, 74, 2], [4, 79, 4]], // bar 3: B4 D5 G5
  6: [[0, 83, 2], [2, 81, 2], [4, 79, 2], [6, 78, 2]], // bar 7: B5 A5 G5 F#5
  10: [[0, 74, 2], [2, 78, 2], [4, 81, 4]], // bar 11: D5 F#5 A5
  14: [[0, 83, 2], [2, 78, 2], [4, 74, 4]], // bar 15: B5 F#5 D5
};

/** A soft bell: a sine that dies away, with a faint inharmonic partial (2.76 times the pitch) for the strike. */
function bell(out, freq, t, dur, gain, echo) {
  out.push({ kind: 'tone', freq, t, dur, o: { type: 'sine', gain, attack: 0.004, echo } });
  out.push({ kind: 'tone', freq: freq * 2.76, t, dur: dur * 0.35, o: { type: 'sine', gain: gain * 0.18, attack: 0.003 } });
}

/** The eighth step's events for Cinematic calm: `layer` is 0..3, `f` the flavour { bpm, swing, transpose }, `cycle` the pass. */
function events(step, layer, f, cycle) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const chord = SCORE[bar];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const tr = f.transpose || 0;
  const tt = s % 2 === 1 ? STEP * (f.swing ?? 0.12) : 0; // the swing: an odd eighth starts late
  const pad = chord.pad.map((m) => m + tr);
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });

  // layer 0: the pad. Three triangles on the chord swell in over 1.8 s and ring on into the next bar (the outer two detuned
  // a few cents, for a chorus), with a sine on the root under them. A new chord swells in over the last one.
  if (s === 0) {
    const open = layer >= 3 ? { filter: 1200, filterTo: 2200 } : { filter: 1200 };
    const detune = [0, 6, -6];
    pad.forEach((m, i) => tone(mtof(m), 0, STEP * 18, { type: 'triangle', gain: 0.0107, attack: 1.8, detune: detune[i], ...open }));
    tone(mtof(chord.root + tr), 0, STEP * 18, { type: 'sine', gain: 0.029, attack: 1.4 });
  }

  // layer 0: a bell chime on beat 3 of every other bar. The odd passes move the chime to the other bars.
  const chimeBars = cycle % 2 === 1 ? [3, 7, 11, 15] : [1, 5, 9, 13];
  if (s === 4 && chimeBars.includes(bar)) bell(out, mtof(pad[2] + 12), 0, STEP * 9, 0.0145, true);

  // layer 1: the gentle pulse. A soft sine on the root on beats 1 and 3, and a quieter one an octave up on beats 2 and 4.
  if (layer >= 1) {
    if (s === 0 || s === 4) tone(mtof(chord.root + tr), 0, STEP * 2.5, { type: 'sine', gain: 0.0525, attack: 0.03 });
    if (s === 2 || s === 6) tone(mtof(chord.root + 12 + tr), 0, STEP * 2, { type: 'sine', gain: 0.0225, attack: 0.03 });
  }

  // layer 2: soft bell plucks on every off-beat, on the chord's tones (the middle one an octave up). The figure runs the
  // other way round on the odd passes. Their level is the game's arpeggio level (0.05).
  if (layer >= 2 && s % 2 === 1) {
    const notes = [pad[0], pad[1], pad[2], pad[1] + 12];
    const order = cycle % 2 === 1 ? [2, 1, 3, 0] : [0, 2, 1, 3];
    bell(out, mtof(notes[order[(s - 1) / 2]]), tt, STEP * 3.5, 0.05, false);
  }

  // layer 3: the melody, a quiet triangle in the upper register: the hopeful line. Its alternates come on cycles 1 and 3.
  if (layer >= 3) {
    const alt = cycle % 4 === 1 ? ALT1 : cycle % 4 === 3 ? ALT2 : null;
    const line = (alt && alt[bar]) || LINE[bar];
    for (const [st, m, len] of line) {
      if (st !== s) continue;
      tone(mtof(m + tr), tt, STEP * len * 0.95, { type: 'triangle', gain: 0.05, attack: 0.08 });
    }
  }
  return out;
}

export default {
  key: 'ambient',
  name: 'Cinematic calm',
  blurb: 'Slow hopeful pads, soft bells, and a light pulse as traffic grows.',
  flavour: { bpm: 66, swing: 0.12, transpose: 0 }, // a calm 66 beats a minute, four to a bar
  latch: 'bar', // a change of traffic waits for the next bar line
  loopBars: 16,
  trim: [15.8, 12.9, 10.1, 9.7], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
