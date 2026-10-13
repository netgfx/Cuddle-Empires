// Public audio singleton. Usage:
//   import { audio } from '@/audio';   (or '../audio')
//   audio.setTrack('meadow');          // remembered until the context is unlocked
//   audio.sfx('click');                // or window.dispatchEvent(new CustomEvent('risk:sfx', { detail: 'click' }))
//
// The AudioContext is created on the first user gesture (pointerdown / keydown /
// touchend), or on the first audio.unlock() call, whichever comes first.
import { createGraph, MUSIC_LEVEL, SFX_LEVEL, type Graph } from './graph';
import { attachMusic, currentTrack, startTrack } from './music';
import { SFX } from './sfx';
import { isSfxName, TRACK_IDS, type MusicTrackId, type SfxName } from './types';

export type { MusicTrackId, SfxName } from './types';

export interface AudioApi {
  unlock(): void;
  setTrack(id: MusicTrackId): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  sfx(name: SfxName): void;
  readonly track: MusicTrackId;
}

declare global {
  interface Window {
    __audioLevel?: () => number;
    __audioState?: () => { state: string; track: MusicTrackId; playing: MusicTrackId; time: number };
  }
}

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
const DEFAULT_MUSIC_VOLUME = 0.375;
const DEFAULT_SFX_VOLUME = 0.8;

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let wanted: MusicTrackId = 'off';
let musicVolume = DEFAULT_MUSIC_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;
const lastPlayed = new Map<SfxName, number>();

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function onGesture(): void {
  audio.unlock();
}

function bindGestures(on: boolean): void {
  if (typeof window === 'undefined') return;
  for (const ev of GESTURES) {
    if (on) window.addEventListener(ev, onGesture, true);
    else window.removeEventListener(ev, onGesture, true);
  }
}

/** Called once the context is running: stop listening for gestures and start the wanted track. */
function onRunning(): void {
  bindGestures(false);
  startTrack(wanted);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let c: AudioContext;
  try {
    c = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  ctx = c;
  graph = createGraph(c, musicVolume * MUSIC_LEVEL, sfxVolume * SFX_LEVEL);
  attachMusic(c, graph.musicBus);
  c.addEventListener('statechange', () => {
    if (c.state === 'running') onRunning();
  });
  if (import.meta.env.DEV) startDevMeter(graph.analyser);
  return c;
}

function onSfxEvent(e: Event): void {
  const detail: unknown = (e as CustomEvent<unknown>).detail;
  if (isSfxName(detail)) audio.sfx(detail);
}

export const audio: AudioApi = {
  unlock(): void {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'running') {
      onRunning();
    } else {
      c.resume().catch(() => {});
    }
  },

  setTrack(id: MusicTrackId): void {
    if (!TRACK_IDS.includes(id)) return;
    wanted = id;
    if (ctx && ctx.state === 'running') startTrack(id);
  },

  setMusicVolume(v: number): void {
    musicVolume = clamp01(v);
    if (ctx && graph) graph.musicBus.gain.setTargetAtTime(musicVolume * MUSIC_LEVEL, ctx.currentTime, 0.05);
  },

  setSfxVolume(v: number): void {
    sfxVolume = clamp01(v);
    if (ctx && graph) graph.sfxBus.gain.setTargetAtTime(sfxVolume * SFX_LEVEL, ctx.currentTime, 0.05);
  },

  sfx(name: SfxName): void {
    const c = ctx;
    const g = graph;
    if (!c || !g || c.state !== 'running' || !isSfxName(name)) return;
    const now = c.currentTime;
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < 0.03) return; // avoid stacking identical hits
    lastPlayed.set(name, now);
    SFX[name](c, g.sfxBus, now + 0.005);
  },

  get track(): MusicTrackId {
    return wanted;
  },
};

// ---- dev-only meter: peak of the master bus, polled into window.__audioLevel() ----
let meterPeak = 0;
let meterTimer: ReturnType<typeof setInterval> | undefined;

function startDevMeter(analyser: AnalyserNode): void {
  if (meterTimer !== undefined) return;
  const buf = new Float32Array(analyser.fftSize);
  meterTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > meterPeak) meterPeak = a;
    }
  }, 15);
}

function removeListeners(): void {
  bindGestures(false);
  if (typeof window !== 'undefined') window.removeEventListener('risk:sfx', onSfxEvent);
}

if (typeof window !== 'undefined') {
  window.addEventListener('risk:sfx', onSfxEvent);
  bindGestures(true);
  if (import.meta.env.DEV) {
    window.__audioLevel = () => {
      const p = meterPeak;
      meterPeak = 0;
      return p;
    };
    window.__audioState = () => ({
      state: ctx?.state ?? 'none',
      track: wanted,
      playing: currentTrack(),
      time: ctx?.currentTime ?? 0,
    });
  }
}

import.meta.hot?.dispose(() => {
  removeListeners();
  if (meterTimer !== undefined) clearInterval(meterTimer);
  void ctx?.close();
  ctx = null;
  graph = null;
});
