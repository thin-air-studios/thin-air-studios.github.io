// The video's encoders (video.js): WebCodecs H.264 with AAC where the phone's browser can encode them, else the app's own MediaCodec
// through the bridge (Kotlin: VideoEncoder.kt). Frames go in as they are drawn, the MP4 comes out as one file (mp4-muxer, vendored
// under js/vendor, MIT), and the file goes to a share sheet or to Movies. planEncoder is the choice, pure, so the tests read it
// with stub encoders; the sinks are the two ways out. No picture here: the frames are videorender.js's.
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs?v=86c2b44d';

export const VIDEO_BITRATE = 6_000_000; // about 6 Mbps: a 20 s clip lands at 10 to 15 MB
export const AUDIO_RATE = 48000, AUDIO_CHANNELS = 2, AUDIO_BITRATE = 128_000;
// the H.264 profiles a 1080 x 1920 frame at 30 fps fits (level 4.0 and up), best first
export const H264 = Object.freeze([
  { codec: 'avc1.640028', mux: 'avc' },
  { codec: 'avc1.64002a', mux: 'avc' },
  { codec: 'avc1.42002a', mux: 'avc' },
]);
export const AAC = Object.freeze({ codec: 'mp4a.40.2', mux: 'aac' });

/**
 * Which encoder a video uses, in the brief's order: WebCodecs H.264 (the first candidate the phone's encoder accepts), else the
 * app's MediaCodec through the bridge, else nothing (the picture card is shared instead). AAC audio rides along where the encoder
 * takes it; without it the clip is silent, and its captions carry the calls (the owner watches with the sound off).
 * supported is the candidates' list that passed isConfigSupported, in order.
 */
export function planEncoder({ webcodecs = false, supported = [], audioOk = false, native = false }) {
  if (webcodecs && supported.length) return { kind: 'webcodecs', video: supported[0], audio: !!audioOk };
  if (native) return { kind: 'native', video: H264[0], audio: true };
  return { kind: null, video: null, audio: false };
}

/**
 * Asks the browser which of the candidates it can encode at this size (VideoEncoder.isConfigSupported), and whether it can make AAC
 * (AudioEncoder). A browser without WebCodecs answers nothing. window.__HP.videoCodecs overrides the candidates (the test harness's
 * VP9 and Opus, in headless Chromium, which has no H.264 or AAC encoder); it is never set on a phone.
 */
export async function probeEncoders(width, height, fps, candidates = (typeof window !== 'undefined' && window.__HP && window.__HP.videoCodecs) || H264, aac = AAC) {
  const out = { supported: [], audioOk: false };
  if (typeof VideoEncoder === 'undefined') return out;
  for (const c of candidates) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c.codec, width, height, bitrate: VIDEO_BITRATE, framerate: fps, avc: { format: 'avc' } });
      if (s && s.supported) out.supported.push(c);
    } catch (_) { /* this codec is not known here */ }
  }
  if (typeof AudioEncoder !== 'undefined') {
    const audio = (window.__HP && window.__HP.videoAudio) || aac;
    try {
      const s = await AudioEncoder.isConfigSupported({ codec: audio.codec, sampleRate: AUDIO_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE });
      out.audioOk = !!(s && s.supported);
      out.audio = audio;
    } catch (_) { /* no audio encoder */ }
  }
  return out;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The WebCodecs sink: frames (canvases) and audio (channels) go into the encoders as they come, the muxer writes the MP4 in memory
 * (moov first, so it streams and shares well). finish() flushes both and gives the bytes.
 */
export class WebCodecsSink {
  constructor({ width, height, fps, codec, audio = null, sampleRate = AUDIO_RATE }) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.frames = 0;
    this.target = new ArrayBufferTarget();
    this.muxer = new Muxer({
      target: this.target,
      video: { codec: codec.mux, width, height, frameRate: fps },
      audio: audio ? { codec: audio.mux, numberOfChannels: AUDIO_CHANNELS, sampleRate } : undefined,
      fastStart: 'in-memory',
    });
    this.error = null;
    this.video = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => { this.error = e; },
    });
    this.video.configure({ codec: codec.codec, width, height, bitrate: VIDEO_BITRATE, framerate: fps, avc: { format: 'avc' } });
    this.audio = null;
    if (audio) {
      this.audio = new AudioEncoder({
        output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
        error: (e) => { this.error = e; },
      });
      this.audio.configure({ codec: audio.codec, sampleRate, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE });
    }
  }

  /** One frame (a canvas) at frame f: a key frame every second, the encoder's queue kept short. */
  async frame(canvas, f) {
    if (this.error) throw this.error;
    while (this.video.encodeQueueSize > 6) await delay(4);
    const us = Math.round((f * 1e6) / this.fps);
    const vf = new VideoFrame(canvas, { timestamp: us, duration: Math.round(1e6 / this.fps) });
    this.video.encode(vf, { keyFrame: f % this.fps === 0 });
    vf.close();
    this.frames++;
  }

  /** The clip's sound: the two channels at the rate, in blocks of 1024 samples. */
  async audioBlock(left, right, sampleRate = AUDIO_RATE) {
    if (!this.audio) return;
    for (let at = 0; at < left.length; at += 1024) {
      const n = Math.min(1024, left.length - at);
      const data = new Float32Array(n * 2);
      data.set(left.subarray(at, at + n), 0);
      data.set(right.subarray(at, at + n), n);
      while (this.audio.encodeQueueSize > 12) await delay(4);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: AUDIO_CHANNELS, timestamp: Math.round((at * 1e6) / sampleRate), data });
      this.audio.encode(ad);
      ad.close();
    }
  }

  /** Flushes the encoders and finishes the file. Resolves to the MP4 bytes. */
  async finish() {
    await this.video.flush();
    if (this.audio) await this.audio.flush();
    if (this.error) throw this.error;
    this.video.close();
    if (this.audio) this.audio.close();
    this.muxer.finalize();
    return new Uint8Array(this.target.buffer);
  }

  cancel() {
    try { this.video.close(); } catch (_) { /* already closed */ }
    try { if (this.audio) this.audio.close(); } catch (_) { /* already closed */ }
  }
}

// the app's answers to a bridge call that takes time (GameBridge.kt: HP_videoDone(id, how)), by job id
const waiting = new Map();
if (typeof window !== 'undefined') {
  window.HP_videoDone = (id, how) => {
    const done = waiting.get(id);
    if (done) {
      waiting.delete(id);
      done(how);
    }
  };
}

/**
 * The app's MediaCodec sink (VideoEncoder.kt through GameBridge): JPEG frames and PCM sound go over the bridge, the phone encodes
 * H.264 and AAC and muxes the MP4 to the app's cache. The frames are slower than WebCodecs (each is a JPEG and a call), so a clip
 * takes longer here. Every call answers true or false, and a false ends the clip.
 */
export class NativeSink {
  constructor(bridge, id, { width, height, fps }) {
    this.bridge = bridge;
    this.id = id;
    this.fps = fps;
    this.frames = 0;
    if (!bridge.videoStart(id, width, height, fps, AUDIO_RATE, AUDIO_CHANNELS)) throw new Error('video: the phone could not start its encoder');
  }

  async frame(canvas, f) {
    const jpeg = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    if (!this.bridge.videoFrame(this.id, f, jpeg)) throw new Error('video: a frame did not encode');
    this.frames++;
    await delay(0);
  }

  async audioBlock(left, right) {
    // interleaved 16-bit PCM, a second at a time, as base64
    const block = 48000;
    for (let at = 0; at < left.length; at += block) {
      const n = Math.min(block, left.length - at);
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) {
        pcm[i * 2] = clip16(left[at + i]);
        pcm[i * 2 + 1] = clip16(right[at + i]);
      }
      if (!this.bridge.videoAudio(this.id, base64Bytes(new Uint8Array(pcm.buffer)))) throw new Error('video: the sound did not encode');
    }
  }

  async finish() {
    if (!this.bridge.videoFinish(this.id)) throw new Error('video: the phone could not finish the file');
    return null; // the file is in the app's cache: deliverNative shares or saves it
  }

  cancel() {
    try { this.bridge.videoCancel(this.id); } catch (_) { /* the phone's encoder is gone already */ }
  }
}

const clip16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

/** Bytes as base64, in pieces (a long string is built in parts, not one character at a time). */
export function base64Bytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Opens the encoder the plan picks: WebCodecs, else the app's MediaCodec (bridge given), else null. Returns { sink, kind } or null.
 */
export async function openSink({ bridge = null, id, width, height, fps, audioOk = true }) {
  const probe = await probeEncoders(width, height, fps);
  const plan = planEncoder({ webcodecs: typeof VideoEncoder !== 'undefined', supported: probe.supported, audioOk: probe.audioOk, native: !!bridge });
  if (plan.kind === 'webcodecs') {
    const audio = plan.audio && audioOk ? probe.audio || AAC : null;
    return { kind: 'webcodecs', sink: new WebCodecsSink({ width, height, fps, codec: plan.video, audio }), audio: !!audio };
  }
  if (plan.kind === 'native') return { kind: 'native', sink: new NativeSink(bridge, id, { width, height, fps }), audio: true };
  return null;
}

/**
 * The app keeps the finished file in its cache: the WebCodecs bytes go over in pieces once (stageBytes); the native encoder's file is
 * already there. Returns false if the app refused a piece.
 */
export function stageBytes(bridge, id, bytes) {
  const CHUNK = 1 << 20;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    if (!bridge.videoPart(id, base64Bytes(bytes.subarray(at, at + CHUNK)))) return false;
  }
  return true;
}

/**
 * Sends the finished file on: to the app's share sheet (with the caption, aimed at one app or the sheet), or to Movies. In the app
 * the file is the one staged in the cache, and the answer ('shared' | 'saved' | 'cancelled' | 'failed') comes back by id. In a browser
 * the bytes go through the Web Share API with the file, else a download.
 */
export async function deliver({ bridge = null, id, bytes = null, mode = 'share', text = '', title = '', target = '' }) {
  if (bridge && bridge.videoEnd) {
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      bridge.videoEnd(id, mode, text, title, target);
    });
  }
  if (!bytes) return 'failed';
  const file = new File([bytes], 'short-final.mp4', { type: 'video/mp4' });
  if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'short-final.mp4';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
