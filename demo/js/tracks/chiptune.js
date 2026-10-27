// Arcade 8-bit: an original chiptune, written from scratch for the music lab (not a known tune).
// Key of C major, 128 BPM, a 16-bar loop: A (bars 1-8, ending on the dominant) and B (bars 9-16, turning home to C).
// Square and triangle waves, and noise for the drums. Layers latch on the bar line (latch 'bar'):
//   0  the arpeggio bed (square, quiet and filtered) and the triangle bass
//   1  adds the drums: an offbeat hat and a kick on beats 1 and 3
//   2  adds the square lead and a snare on beats 2 and 4
//   3  adds a triangle counter-line in bars 5-8 and 13-16, and an echo on the lead
// The repeats vary with `cycle`: on odd passes the arpeggio changes figure, the lead's two turnarounds change, and a
// pickup kick marks each turnaround.
import { mtof } from './pitch.js?v=7227d0de';

// --- the harmony: one chord per bar (bar 1 to bar 16) ------------------------------------------------------------
// A: C G Am F Dm G C G (a half cadence on the G of bar 8). B: Am F Dm G Em Am F G (back to C through the G of bar 16).
const CHORD_OF_BAR = ['C', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'G', 'Am', 'F', 'Dm', 'G', 'Em', 'Am', 'F', 'G'];
// bass: the root (MIDI); arp: the four chord tones for the arpeggio (root, third, fifth, octave), in MIDI
const CHORDS = {
  C: { bass: 36, arp: [60, 64, 67, 72] },
  G: { bass: 43, arp: [55, 59, 62, 67] },
  Am: { bass: 45, arp: [57, 60, 64, 69] },
  F: { bass: 41, arp: [53, 57, 60, 65] },
  Dm: { bass: 38, arp: [62, 65, 69, 74] },
  Em: { bass: 40, arp: [64, 67, 71, 76] },
};
// the arpeggio's order over an eighth-note bar (an index into the chord's four tones)
const ARP_A = [0, 1, 2, 3, 2, 1, 0, 1]; // A section: up and back, root on the beat
const ARP_A2 = [0, 3, 2, 1, 2, 3, 2, 1]; // A section, odd passes: the octave jumps down
const ARP_B = [0, 2, 1, 2, 3, 2, 1, 2]; // B section: fifth and third in turn
const ARP_B2 = [0, 3, 1, 2, 3, 1, 2, 0]; // B section, odd passes

// the lead: [step, MIDI, length in eighths] per bar; the lead is in octave 5 with the hook on bar 1 (C5, a leap to G5)
const LEAD = [
  // A
  [[0, 72, 1], [1, 79, 3], [4, 76, 2], [6, 79, 2]], // 1  C: the hook, a leap up a fifth and back
  [[0, 74, 2], [2, 76, 1], [3, 79, 1], [4, 83, 2], [6, 81, 2]], // 2  G
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2]], // 3  Am: a falling line
  [[0, 77, 2], [2, 81, 2], [4, 84, 4]], // 4  F: up to the top, held
  [[0, 81, 1], [1, 79, 1], [2, 77, 2], [4, 74, 2], [6, 77, 2]], // 5  Dm
  [[0, 79, 2], [2, 83, 2], [4, 84, 2], [6, 83, 2]], // 6  G
  [[0, 84, 2], [2, 81, 1], [3, 79, 1], [4, 76, 2], [6, 79, 2]], // 7  C: down again
  [[0, 71, 2], [2, 74, 2], [4, 79, 2], [6, 83, 2]], // 8  G: up to B, the leading tone into B
  // B
  [[0, 81, 1], [1, 76, 1], [2, 84, 2], [4, 83, 1], [5, 81, 1], [6, 79, 2]], // 9  Am: a question, with a step-wise run
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 77, 2]], // 10 F: down through the scale
  [[0, 74, 3], [3, 77, 1], [4, 81, 2], [6, 79, 2]], // 11 Dm
  [[0, 79, 1], [1, 81, 1], [2, 83, 2], [4, 84, 2], [6, 83, 2]], // 12 G: a climb to the top
  [[0, 76, 2], [2, 79, 1], [3, 83, 1], [4, 84, 2], [6, 79, 2]], // 13 Em
  [[0, 81, 2], [2, 84, 2], [4, 81, 1], [5, 79, 1], [6, 76, 2]], // 14 Am
  [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]], // 15 F
  [[0, 83, 2], [2, 79, 2], [4, 74, 2], [6, 71, 2]], // 16 G: ends on B, the leading tone into bar 1
];
// the lead's two turnarounds, changed on odd passes (the same harmony, a different line)
const LEAD_ALT = {
  7: [[0, 74, 2], [2, 79, 2], [4, 83, 1], [5, 81, 1], [6, 79, 2]], // bar 8: D5 G5 B5 A5 G5, into the B section's A
  15: [[0, 74, 2], [2, 76, 2], [4, 74, 2], [6, 71, 2]], // bar 16: D5 E5 D5 B4, into bar 1's C (clear of the counter-line)
};
// the triangle counter-line (layer 3 only): half notes under the lead, in bars 5-8 and 13-16
const COUNTER = {
  4: [[0, 65, 4], [4, 62, 4]], // 5  Dm: F4 D4
  5: [[0, 67, 4], [4, 71, 4]], // 6  G: G4 B4
  6: [[0, 64, 4], [4, 67, 4]], // 7  C: E4 G4
  7: [[0, 62, 4], [4, 59, 4]], // 8  G: D4 B3
  12: [[0, 67, 4], [4, 64, 4]], // 13 Em: G4 E4
  13: [[0, 69, 4], [4, 64, 4]], // 14 Am: A4 E4
  14: [[0, 65, 4], [4, 69, 4]], // 15 F: F4 A4
  15: [[0, 71, 4], [4, 67, 4]], // 16 G: B4 G4
};

/** The eighth step's events for Arcade 8-bit: `lvl` is the layer 0..3, `f` the flavour, `cycle` the loop's repeats. */
function events(step, lvl, f, cycle = 0) {
  const out = [];
  const bar = Math.floor(step / 8), s = step % 8;
  const B = bar >= 8; // the B section
  const odd = cycle % 2 === 1; // every other pass changes the figure
  const chord = CHORDS[CHORD_OF_BAR[bar]];
  const STEP = 60 / f.bpm / 2; // an eighth note
  const tr = f.transpose || 0;
  const tt = s % 2 === 1 ? STEP * (f.swing ?? 0.08) : 0; // swing: only the odd eighths start late
  const tone = (freq, t, dur, o) => out.push({ kind: 'tone', freq, t, dur, o });
  const noise = (t, dur, o) => out.push({ kind: 'noise', t, dur, o });
  const root = chord.bass + tr;

  // layer 0: the arpeggio bed (square, quiet, filtered) on every eighth, and the triangle bass
  const arp = B ? (odd ? ARP_B2 : ARP_B) : (odd ? ARP_A2 : ARP_A);
  tone(mtof(chord.arp[arp[s]] + tr), tt, STEP * 1.1, { type: 'square', gain: 0.063, attack: 0.004, filter: 1400 });
  if (!B) {
    // A: root, octave, fifth, octave: a bouncing bass
    if (s === 0) tone(mtof(root), tt, STEP * 1.6, { type: 'triangle', gain: 0.63, attack: 0.01 });
    if (s === 2) tone(mtof(root + 12), tt, STEP * 0.8, { type: 'triangle', gain: 0.3, attack: 0.008 });
    if (s === 4) tone(mtof(root + 7), tt, STEP * 1.6, { type: 'triangle', gain: 0.45, attack: 0.01 });
    if (s === 6) tone(mtof(root + 12), tt, STEP * 0.8, { type: 'triangle', gain: 0.3, attack: 0.008 });
  } else {
    // B: root, fifth, octave, fifth: a different figure
    if (s === 0) tone(mtof(root), tt, STEP * 1.6, { type: 'triangle', gain: 0.63, attack: 0.01 });
    if (s === 2) tone(mtof(root + 7), tt, STEP * 0.8, { type: 'triangle', gain: 0.38, attack: 0.008 });
    if (s === 4) tone(mtof(root + 12), tt, STEP * 1.6, { type: 'triangle', gain: 0.43, attack: 0.01 });
    if (s === 6) tone(mtof(root + 7), tt, STEP * 0.8, { type: 'triangle', gain: 0.38, attack: 0.008 });
  }

  // layer 1: the drums: an offbeat hat on every odd eighth, a kick on beats 1 and 3 (a pickup kick at a turnaround on odd passes)
  if (lvl >= 1) {
    if (s % 2 === 1) noise(tt, 0.05, { filter: 'highpass', freq: 7000, Q: 0.5, gain: 0.04 });
    if (s === 0 || s === 4) noise(tt, 0.14, { filter: 'lowpass', freq: 260, sweep: 60, Q: 0.7, gain: 0.3, attack: 0.002 });
    if (odd && s === 7 && (bar === 7 || bar === 15)) {
      noise(tt, 0.12, { filter: 'lowpass', freq: 260, sweep: 60, Q: 0.7, gain: 0.15, attack: 0.002 });
    }
  }

  // layer 2: the square lead (filtered, quiet) and a snare on beats 2 and 4
  if (lvl >= 2) {
    if (s === 2 || s === 6) noise(0, 0.12, { freq: 1900, Q: 0.9, gain: 0.09 });
    const melody = odd && LEAD_ALT[bar] ? LEAD_ALT[bar] : LEAD[bar];
    for (const [st, m, len] of melody) {
      if (st !== s) continue;
      // layer 3 sends the lead to the echo; the notes themselves do not change
      tone(mtof(m + tr), tt, STEP * len * 0.92, { type: 'square', gain: 0.045, attack: 0.008, filter: 2400, echo: lvl >= 3 });
    }
  }

  // layer 3: the triangle counter-line, half notes under the lead
  if (lvl >= 3) {
    for (const [st, m, len] of COUNTER[bar] || []) {
      if (st !== s) continue;
      tone(mtof(m + tr), tt, STEP * len * 0.95, { type: 'triangle', gain: 0.05, attack: 0.02 });
    }
  }
  return out;
}

export default {
  key: 'chiptune',
  name: 'Arcade 8-bit',
  blurb: 'Bright 8-bit arcade tune with a bouncy bass and a catchy lead.',
  flavour: { bpm: 128, swing: 0.08, transpose: 0 },
  latch: 'bar', // a change of traffic layer waits for the next bar line, so a part enters on the bar
  loopBars: 16,
  trim: [0.7, 0.5, 0.3, 0.4], // dB per traffic layer 0..3: the lab's level for this track
  events,
};
