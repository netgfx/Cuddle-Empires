// Live music scheduler: "A Tale of Two Clocks" lookahead. A 25 ms timer schedules
// 16th-note steps up to 120 ms ahead on the AudioContext clock. Track changes
// crossfade by fading the outgoing track's output gain while the new track fades in.
import { compile, type Compiled } from './score';
import { TRACKS } from './tracks';
import type { Ctx } from './synth';
import type { MusicTrackId, PlayableTrackId } from './types';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const CROSSFADE_S = 1.5;

/** Schedules one 16th-note step worth of events starting at time t. */
export function scheduleStep(ctx: Ctx, out: AudioNode, c: Compiled, step: number, t: number): void {
  for (const e of c.events[step % c.steps]) {
    const v = e.vel * (0.95 + Math.random() * 0.1);
    switch (e.k) {
      case 'lead':
        c.kit.lead(ctx, out, t, e.f, e.len * c.stepSec, v);
        break;
      case 'bass':
        c.kit.bass(ctx, out, t, e.f, e.len * c.stepSec, v);
        break;
      case 'chord':
        c.kit.chord(ctx, out, t, e.fs, e.len * c.stepSec, v);
        break;
      case 'drum':
        c.kit.drum?.(ctx, out, t, e.ch, v, c.stepSec);
        break;
    }
  }
}

interface Playback {
  c: Compiled;
  out: GainNode;
  step: number;
  next: number; // ctx time of the next step to schedule
  fadingOut: boolean;
  endAt: number; // ctx time after which a faded-out playback is disconnected
}

let liveCtx: AudioContext | null = null;
let liveBus: AudioNode | null = null;
let playing: MusicTrackId = 'off';
let active: Playback[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
const compiledCache = new Map<PlayableTrackId, Compiled>();

function compiled(id: PlayableTrackId): Compiled {
  let c = compiledCache.get(id);
  if (!c) {
    c = compile(TRACKS[id]);
    compiledCache.set(id, c);
  }
  return c;
}

export function attachMusic(ctx: AudioContext, bus: AudioNode): void {
  liveCtx = ctx;
  liveBus = bus;
}

export function currentTrack(): MusicTrackId {
  return playing;
}

function fadeOut(p: Playback, now: number): void {
  const g = p.out.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + CROSSFADE_S);
  p.fadingOut = true;
  p.endAt = now + CROSSFADE_S + 0.2;
}

function tick(): void {
  if (!liveCtx) return;
  const now = liveCtx.currentTime;
  const horizon = now + LOOKAHEAD_S;
  for (const p of active) {
    if (p.fadingOut) continue;
    if (p.next < now - 0.25) p.next = now + 0.05; // resync after a stall or suspend
    while (p.next < horizon) {
      scheduleStep(liveCtx, p.out, p.c, p.step, p.next);
      p.next += p.c.stepSec;
      p.step++;
    }
  }
  active = active.filter((p) => {
    if (p.fadingOut && now > p.endAt) {
      p.out.disconnect();
      return false;
    }
    return true;
  });
  if (active.length === 0 && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

/** Crossfades to the given track. Calling with the current track is a no-op. */
export function startTrack(id: MusicTrackId): void {
  if (!liveCtx || !liveBus || id === playing) return;
  playing = id;
  const now = liveCtx.currentTime;
  for (const p of active) if (!p.fadingOut) fadeOut(p, now);

  if (id !== 'off') {
    const c = compiled(id);
    const out = liveCtx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(c.level, now + CROSSFADE_S);
    out.connect(liveBus);
    active.push({ c, out, step: 0, next: now + 0.06, fadingOut: false, endAt: 0 });
  }

  if (timer === undefined) timer = setInterval(tick, TICK_MS);
  tick();
}
