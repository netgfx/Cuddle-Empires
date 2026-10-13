// Offline rendering for level checks and WAV export. Not used by the live app.
import { createGraph, MUSIC_LEVEL, SFX_LEVEL } from './graph';
import { scheduleStep } from './music';
import { compile } from './score';
import { SFX } from './sfx';
import { TRACKS } from './tracks';
import type { PlayableTrackId, SfxName } from './types';

export interface Level {
  seconds: number;
  peak: number;
  rms: number;
}

export function measure(buf: AudioBuffer): Level {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
    n += d.length;
  }
  return { seconds: buf.duration, peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}

/** Renders a track loop at full mix level (no crossfade, no volume slider). */
export async function renderTrackOffline(id: PlayableTrackId, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
  const graph = createGraph(ctx, MUSIC_LEVEL, SFX_LEVEL);
  graph.master.connect(ctx.destination);
  const c = compile(TRACKS[id]);
  const out = ctx.createGain();
  out.gain.value = c.level;
  out.connect(graph.musicBus);
  const t0 = 0.05;
  for (let s = 0; t0 + s * c.stepSec < seconds; s++) {
    scheduleStep(ctx, out, c, s, t0 + s * c.stepSec);
  }
  return ctx.startRendering();
}

/** Renders one SFX at full mix level. */
export async function renderSfxOffline(name: SfxName, seconds = 2.5, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
  const graph = createGraph(ctx, MUSIC_LEVEL, SFX_LEVEL);
  SFX[name](ctx, graph.sfxBus, 0.01);
  return ctx.startRendering();
}
