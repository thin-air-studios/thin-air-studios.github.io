// A clip of the game, end to end (the share panel's Video): the best moment or the planes that crashed (the replay scanned once), the
// frames (videorender.js),
// the game's own music under the clip (audio.js renderTrackOffline, at the clip's traffic layers), the encoder (videoenc.js) and the
// file. Progress runs 0..1; a cancel stops between two frames and leaves nothing behind. Nothing here posts: the file is handed to
// the share sheet or saved by the caller (deliver, videoenc.js), and only then does anything leave the phone.
import { SIM_HZ } from './config.js?v=86c2b44d';
import { clipPlan, frameCount, MIN_GAME_S, VIDEO_W, VIDEO_H, VIDEO_FPS, bottomBlock, inChunks, simTimeAt, reachesEnd } from './videoclip.js?v=86c2b44d';
import { ClipScene, scanReplayAsync, drawFrame, frameWords, loadIcon } from './videorender.js?v=86c2b44d';
import { renderTrackOffline } from './audio.js?v=86c2b44d';
import { openSink } from './videoenc.js?v=86c2b44d';

/** Thrown when the player cancels: the caller goes back to the clip choices. */
export class VideoCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'VideoCancelled';
  }
}

/** A game can be made into a video when it was recorded and is long enough to have a clip in it. */
export function canMakeVideo(replay) {
  return !!replay && replay.steps / SIM_HZ >= MIN_GAME_S;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Makes the clip. replay and layout are the game's (rec.build at game end, and game.airport.layout); result is the end card's result
 * (its score, codes, name and daily); kind is 'best' | 'last' | 'lapse' (videoclip.js CLIPS). sur, lighting and facility
 * are the airport's surroundings, the Settings lighting and the radio's name for the airport; night is the level the game ended with
 * (held for the whole clip, null for the clock); track is the Settings music track, and music is the Settings music switch: off, the
 * clip has no sound (its captions carry the calls).
 * notes are the arrival notes the game made, by aircraft id (main.js arrivals): the clip shows them at each touchdown.
 * bridge and id are the app's bridge and a job id when the phone has the app's encoder (videoenc.js openSink).
 * Resolves { kind, bytes, id, plan, seconds, frames, audio }: bytes is the MP4 (null when the app's encoder wrote the file itself).
 * cancel is { cancelled } (set it to stop). Throws VideoCancelled, or Error('no-encoder') when no encoder can make the file.
 * The scan and the game up to the first frame run in pieces with the page free between them (inChunks): progress moves from 0.
 */
export async function makeVideo({ replay, layout, result, kind = 'best', sur = null, lighting = 'real', facility = '', notes = null, night = null, track, music = true, bridge = null, id = `v${Date.now()}`, onProgress = () => {}, cancel = { cancelled: false } }) {
  const total = replay.steps / SIM_HZ;
  const crashed = !!replay.end.crash;
  let moments = [], follow = null;
  // one pass over the replay with no picture: the best moment's moments, and for the Last 20 s of a crashed game the planes that crashed
  // (the replay's own: videocam.js); the time-lapse and a game with no crash need no pass
  if (kind === 'best' || (kind === 'last' && crashed)) {
    const scan = await scanReplayAsync(replay, layout, { sur, lighting, facility, night }, {
      pause, progress: (p) => onProgress(0.08 * p), cancelled: () => !!cancel.cancelled,
    });
    if (!scan.done) throw new VideoCancelled();
    moments = scan.moments;
    if (kind === 'last') follow = scan.pair;
  }
  onProgress(0.08);
  const plan = clipPlan({ kind, total, moments, crashed });
  const scene = new ClipScene(replay, layout, { sur, lighting, facility, notes, night, follow });
  const frames = frameCount(plan);
  const words = frameWords(result, plan).words;
  const icon = await loadIcon();
  try {
    await document.fonts.load('700 64px "Fredoka"');
    await document.fonts.load('600 32px "Fredoka"');
  } catch (_) { /* the system font then */ }
  // no sound when the Music switch is off: the encoder is opened without an audio track (WebCodecs) or left silent (the app's)
  const opened = await openSink({ bridge, id, width: VIDEO_W, height: VIDEO_H, fps: VIDEO_FPS, audioOk: music });
  if (!opened) throw new Error('no-encoder');
  const { sink } = opened;
  const out = document.createElement('canvas');
  out.width = VIDEO_W;
  out.height = VIDEO_H;
  try {
    // the game up to the first frame, in pieces as the scan runs (the first frame then has little left to run; the steps are the same)
    const first = Math.min(replay.steps, Math.round(simTimeAt(plan, 0) * SIM_HZ));
    const warm = await inChunks(first, { chunk: 20 * SIM_HZ, step: (until) => scene.advance(until, plan), pause, cancelled: () => !!cancel.cancelled });
    if (!warm) throw new VideoCancelled();
    for (let f = 0; f < frames; f++) {
      if (cancel.cancelled) throw new VideoCancelled();
      const info = scene.frame(plan, f);
      const block = bottomBlock(result, Math.round(info.score), !reachesEnd(plan, total));
      drawFrame(out, { clip: scene.canvas, bandH: scene.bandH, words, block, caption: info.caption, slot: info.slot, icon, real: info.real });
      await sink.frame(out, f);
      onProgress(0.1 + (0.78 * (f + 1)) / frames);
      if (f % 3 === 2) await pause(); // the page stays alive: taps, the progress and Cancel still get through
    }
    if (cancel.cancelled) throw new VideoCancelled();
    if (opened.audio && music) {
      const channels = await renderTrackOffline({ key: track, seconds: plan.seconds, levelAt: (t) => scene.levelAt(plan, t) });
      // a Cancel during the sound: the file is never finished (the catch below cancels the encoder and its file)
      if (cancel.cancelled) throw new VideoCancelled();
      if (channels) await sink.audioBlock(channels[0], channels[1]);
    }
    if (cancel.cancelled) throw new VideoCancelled();
    onProgress(0.97);
    const bytes = await sink.finish();
    onProgress(1);
    return { kind: opened.kind, bytes, id, plan, seconds: plan.seconds, frames, audio: opened.audio };
  } catch (e) {
    try { sink.cancel(); } catch (_) { /* already closed */ }
    throw e;
  }
}
