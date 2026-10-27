// The pitch helper the track modules share: a MIDI note number to its frequency (69 is A4, 440 Hz). It sits in its own file
// so that a track can import it without importing music.js, which imports every track.
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
