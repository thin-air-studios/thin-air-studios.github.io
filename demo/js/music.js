// The music tracks: one ordered registry, Tower Jazz first, which Settings, the Tour and the tests read. Each track is a module
// in tracks/ (its key, name, blurb, flavour, latch, loopBars, trim and events(step, layer, flavour, cycle)). Pure (no Web
// Audio): audio.js plays the events. To add a track: import its module below and add it to TRACKS. Its Settings row, its
// blurb and its golden follow from that.
import jazz from './tracks/jazz.js?v=7227d0de';
import lofi from './tracks/lofi.js?v=7227d0de';
import synthwave from './tracks/synthwave.js?v=7227d0de';
import ambient from './tracks/ambient.js?v=7227d0de';
import bossa from './tracks/bossa.js?v=7227d0de';
import chiptune from './tracks/chiptune.js?v=7227d0de';
import funk from './tracks/funk.js?v=7227d0de';

/** The tracks in Settings order (the owner's order): Tower Jazz is first and is the default. */
export const TRACKS = Object.freeze([jazz, lofi, synthwave, ambient, bossa, chiptune, funk]);

/** The track a new install plays, and the one an unknown name (or a retired one) falls back to. */
export const DEFAULT_TRACK = 'jazz';

/** The flavour a track takes where it gives none: the Tower Jazz tempo, straight from the track's own defaults. */
export const DEFAULT_FLAVOUR = { bpm: 96, swing: 0.18, transpose: 0 };

/** The track with this key, or Tower Jazz for an unknown key. */
export function trackByKey(key) {
  return TRACKS.find((t) => t.key === key) || TRACKS.find((t) => t.key === DEFAULT_TRACK);
}

/** A track's flavour: its own tempo, swing and transpose, with the defaults where it gives none. */
export function flavourOf(track) {
  return { ...DEFAULT_FLAVOUR, ...(track.flavour || {}) };
}
