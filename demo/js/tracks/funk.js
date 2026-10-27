// Funky groove: an original track, written from scratch for the music lab. No known tune is quoted.
//
// The feel: 106 BPM with a light swing (0.08), in D minor. A slap bass and a kick carry the groove, and a
// soft pad sits under it (layer 0). Layer 1 adds the 16th-feel hats, the snare and the chicken-scratch guitar. Layer 2 adds
// horn stabs, and layer 3 adds a melodic hook played in the horn voice over the stabs.
//
// The loop is 16 bars. A (bars 1 to 8) runs Dm7, Dm7, Bbmaj7, C7, Dm7, Gm7, C7, A7 and leads into B. B (bars 9 to 16) lifts
// through F and C major (Fmaj7, Em7, Dm7, G7, Cmaj7, Am7, Bbmaj7, A7), and the last A7 leads home to the D. Each repeat varies a little (`cycle`):
// on odd passes the bass pops an octave on bars 4, 8, 12 and 16, and the hook has a different ending in bars 8 and 16.
// The layers latch on the bar line (latch 'bar'), so each part enters on beat 1.
import { mtof } from './pitch.js?v=7227d0de';

// --- the score ---------------------------------------------------------------------------------------------------------

// One chord per bar, 16 bars. `root` is the bass note (MIDI), `pad` a low three-note voicing for layer 0, and `horn` a
// three-note shell (third, fifth, seventh: the root is left to the bass) for the stabs.
const CHORDS = [
  { root: 50, pad: [57, 62, 65], horn: [65, 69, 72] }, // 1  Dm7
  { root: 50, pad: [57, 62, 65], horn: [65, 69, 72] }, // 2  Dm7
  { root: 46, pad: [58, 65, 69], horn: [62, 65, 69] }, // 3  Bbmaj7
  { root: 48, pad: [52, 58, 64], horn: [64, 67, 70] }, // 4  C7
  { root: 50, pad: [57, 62, 65], horn: [65, 69, 72] }, // 5  Dm7
  { root: 43, pad: [55, 58, 65], horn: [70, 74, 77] }, // 6  Gm7
  { root: 48, pad: [52, 58, 64], horn: [64, 67, 70] }, // 7  C7
  { root: 45, pad: [57, 61, 67], horn: [61, 64, 67] }, // 8  A7
  { root: 41, pad: [53, 57, 64], horn: [69, 72, 76] }, // 9  Fmaj7
  { root: 40, pad: [55, 59, 62], horn: [67, 71, 74] }, // 10 Em7
  { root: 50, pad: [57, 62, 65], horn: [65, 69, 72] }, // 11 Dm7
  { root: 43, pad: [55, 59, 65], horn: [71, 74, 77] }, // 12 G7
  { root: 48, pad: [55, 59, 64], horn: [64, 67, 71] }, // 13 Cmaj7
  { root: 45, pad: [57, 60, 67], horn: [67, 72, 76] }, // 14 Am7
  { root: 46, pad: [58, 65, 69], horn: [62, 65, 69] }, // 15 Bbmaj7
  { root: 45, pad: [57, 61, 67], horn: [61, 64, 67] }, // 16 A7 (leads home to bar 1)
];

// The hook: [step, midi, length in eighths] per bar. Bars 1 to 8 (A) sit in the middle of the horn's range; bars 9 to 16
// (B) lift to C6. Every note is a chord tone on a strong step, and the passing notes are off the beat.
const HOOK = [
  [[0, 74, 2], [2, 77, 1], [3, 76, 1], [4, 74, 2], [6, 72, 2]], // 1
  [[1, 69, 1], [2, 72, 2], [4, 74, 2], [6, 77, 2]], // 2
  [[0, 74, 2], [2, 77, 2], [4, 74, 2], [6, 70, 2]], // 3
  [[0, 76, 2], [2, 72, 1], [3, 67, 2], [5, 70, 1], [6, 72, 2]], // 4
  [[0, 74, 2], [2, 69, 1], [3, 72, 1], [4, 77, 4]], // 5
  [[0, 67, 3], [3, 70, 2], [5, 74, 3]], // 6
  [[0, 76, 1], [1, 72, 1], [2, 69, 2], [4, 67, 2], [6, 64, 2]], // 7
  [[0, 73, 2], [2, 76, 1], [3, 74, 1], [4, 69, 4]], // 8
  [[0, 77, 2], [2, 81, 2], [4, 77, 1], [5, 76, 1], [6, 72, 2]], // 9
  [[0, 76, 1], [1, 79, 1], [2, 83, 2], [4, 79, 2], [6, 76, 2]], // 10
  [[0, 74, 2], [2, 77, 1], [3, 81, 1], [4, 77, 2], [6, 74, 2]], // 11
  [[0, 79, 2], [2, 83, 2], [4, 77, 2], [6, 74, 2]], // 12
  [[0, 84, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2]], // 13
  [[0, 81, 2], [2, 84, 1], [3, 81, 1], [4, 79, 2], [6, 76, 2]], // 14
  [[0, 77, 2], [2, 74, 2], [4, 70, 2], [6, 69, 2]], // 15
  [[0, 76, 2], [2, 73, 2], [4, 69, 2], [6, 73, 1], [7, 74, 1]], // 16 (C#5 to D5: home)
];
// The odd-pass endings of the two section ends (bars 8 and 16), in the same form as HOOK.
const HOOK_ALT = {
  7: [[0, 76, 2], [2, 73, 2], [4, 76, 2], [6, 69, 2]],
  15: [[0, 76, 2], [2, 73, 2], [4, 69, 2], [6, 74, 2]],
};

// The slap bass: [step, semitones above the chord's root, length in eighths]. Section A plays on steps 0, 3, 5 and 6; B
// moves its figure earlier. Step 7 is a pickup into the next bar's root on bars 2, 4, ... 16, and a dead note on the root on
// the other bars, so the bass never leaves a gap.
const BASS_A = [[0, 0, 2], [3, 12, 1], [5, 7, 1], [6, 0, 1]];
const BASS_B = [[0, 0, 1], [2, 12, 1], [3, 7, 1], [6, 0, 2]];

// --- the events ---------------------------------------------------------------------------------------------------------

/** The eighth step's events for Funky groove: `lvl` is the layer 0..3, `f` the flavour, `cycle` the loop's repeats. */
function events(step, lvl, f, cycle) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const sectionB = bar >= 8;
  const C = CHORDS[bar];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const sw = s % 2 === 1 ? STEP * (f.swing ?? 0.08) : 0; // the swing: odd eighths land late
  const tr = f.transpose || 0;
  const odd = cycle % 2 === 1; // the odd passes vary the loop
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });
  const noise = (t, dur, o) => out.push({ kind: 'noise', t, dur, o });
  const hz = (m) => mtof(m + tr);

  // layer 0: the kick on beats 1 and 3, a slap bass line, and a soft pad chord on beat 1 of each bar
  if (s === 0 || s === 4) tone(92, sw, STEP * 0.9, { type: 'sine', gain: 0.4, attack: 0.002, glide: 42, glideTime: 0.12 });

  const figure = sectionB ? BASS_B : BASS_A;
  for (const [st, up, len] of figure) {
    if (st !== s) continue;
    const pop = odd && up === 0 && bar % 4 === 3 && s === 6; // the odd passes pop bars 4, 8, 12 and 16 an octave
    const semis = pop ? 12 : up;
    const pitch = C.root + semis;
    const g = semis === 12 ? 0.38 : 0.43;
    tone(hz(pitch), sw, STEP * (len === 2 ? 1.8 : 0.8), {
      type: 'sawtooth', gain: g, attack: 0.003, filter: semis === 12 ? 1800 : 1100, filterTo: 260,
    });
  }
  if (s === 7) {
    // the pickup walks a semitone into the next bar's root (bar 16 walks home to bar 1). On bars 1, 3, ... 15 a quiet
    // dead note on the root keeps the bass going into the next bar, so layer 0 has no gap
    if (bar % 2 === 1) {
      const next = CHORDS[(bar + 1) % 16];
      tone(hz(next.root - 1), sw, STEP * 0.8, { type: 'sawtooth', gain: 0.315, attack: 0.003, filter: 1100, filterTo: 260 });
    } else {
      tone(hz(C.root), sw, STEP * 0.5, { type: 'sawtooth', gain: 0.17, attack: 0.003, filter: 900, filterTo: 220 });
    }
  }

  if (s === 0) {
    for (const p of C.pad) tone(hz(p), 0, STEP * 7.6, { type: 'triangle', gain: 0.044, attack: 0.2, filter: 1400 });
  }

  // layer 1: the 16th-feel hats (an eighth on every step, the offbeats louder, and a ghost 16th after each offbeat), the
  // snare on beats 2 and 4, and the chicken-scratch guitar: muted dyads on the 'and' of 2 and of 4
  if (lvl >= 1) {
    noise(sw, 0.035, { filter: 'highpass', freq: 7000, Q: 0.5, gain: s % 2 ? 0.09 : 0.06 });
    if (s % 2 === 1) noise(sw + STEP * 0.5, 0.03, { filter: 'highpass', freq: 7000, Q: 0.5, gain: 0.03 });
    if (s === 2 || s === 6) noise(sw, 0.14, { freq: 1900, Q: 1.1, gain: 0.44, attack: 0.003 });
    if (s === 3 || s === 7) {
      for (const m of [C.horn[0], C.horn[2]]) {
        tone(hz(m), sw, STEP * 0.35, { type: 'sawtooth', gain: 0.063, attack: 0.003, filter: 2600, filterTo: 800 });
      }
    }
  }

  // layer 2: the horn stabs (three voices, a sawtooth that closes its low-pass across the stab), on steps 3 and 6 in A and
  // steps 2 and 6 in B
  if (lvl >= 2) {
    const stabs = sectionB ? [2, 6] : [3, 6];
    if (stabs.includes(s)) {
      for (const m of C.horn) {
        tone(hz(m), sw, STEP * 0.6, { type: 'sawtooth', gain: 0.088, attack: 0.012, filter: 2000, filterTo: 900 });
      }
    }
  }

  // layer 3: the melodic hook, in the horn voice (a sawtooth through a low-pass), over the stabs
  if (lvl >= 3) {
    const table = odd && HOOK_ALT[bar] ? HOOK_ALT[bar] : HOOK[bar];
    for (const [st, m, len] of table) {
      if (st !== s) continue;
      tone(hz(m), sw, STEP * len * 0.9, { type: 'sawtooth', gain: 0.125, attack: 0.015, filter: 2600, filterTo: 1400 });
    }
  }

  return out;
}

export default {
  key: 'funk',
  name: 'Funky groove',
  blurb: 'Upbeat funk: slap bass and horn stabs, a hook as traffic builds.',
  flavour: { bpm: 106, swing: 0.08, transpose: 0 }, // a light bounce; the game's flavour may move the key and tempo a little
  latch: 'bar', // a change of traffic waits for the next bar line, so an entry lands on beat 1
  loopBars: 16,
  trim: [1.1, 0.8, 0.7, 0.6], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
