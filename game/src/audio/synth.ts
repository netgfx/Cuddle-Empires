// Synth primitives: enveloped oscillator voices, filtered-noise hits and drums.
// Every node is one-shot: sources stop after their release and all nodes are
// disconnected in onended so the graph does not accumulate garbage.

export type Ctx = BaseAudioContext;

/** [frequency ratio, gain, optional waveform override] */
export type Harmonic = readonly [ratio: number, gain: number, wave?: OscillatorType];

export interface VoiceOpts {
  t: number; // start time (ctx clock)
  freq: number; // Hz
  dur: number; // hold time before release begins (s)
  peak: number; // linear peak gain
  harmonics?: readonly Harmonic[];
  wave?: OscillatorType; // default waveform for harmonics without one
  attack?: number; // s, linear ramp to peak
  decay?: number; // s, time constant from peak toward sustain
  sustain?: number; // 0..1, fraction of peak held during the hold
  release?: number; // s, time constant after dur
  fEnd?: number; // Hz, exponential pitch glide target over dur
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
  vibrato?: { rate: number; cents: number };
}

export type NoteFn = (ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, vel: number) => void;
export type ChordFn = (ctx: Ctx, out: AudioNode, t: number, freqs: readonly number[], dur: number, vel: number) => void;
export type DrumFn = (ctx: Ctx, out: AudioNode, t: number, ch: string, vel: number, stepSec: number) => void;

export interface Kit {
  lead: NoteFn;
  bass: NoteFn;
  chord: ChordFn;
  drum?: DrumFn;
}

export const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const SINE: readonly Harmonic[] = [[1, 1]];
const MIN_TC = 0.002;

export function voice(ctx: Ctx, out: AudioNode, o: VoiceOpts): void {
  const t = o.t;
  const att = Math.max(o.attack ?? 0.005, 0.001);
  const dur = Math.max(o.dur, att + 0.01);
  const dec = Math.max(o.decay ?? 0.2, MIN_TC);
  const sus = o.sustain ?? 0;
  const rel = Math.max(o.release ?? 0.08, MIN_TC);
  const end = t + dur + rel * 6;

  const nodes: AudioNode[] = [];

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.peak, t + att);
  env.gain.setTargetAtTime(o.peak * sus, t + att, dec);
  env.gain.setTargetAtTime(0, t + dur, rel);
  env.connect(out);
  nodes.push(env);

  let input: AudioNode = env;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.Q.value = o.filter.q ?? 0.7;
    f.frequency.setValueAtTime(o.filter.freq, t);
    if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, t + dur);
    f.connect(env);
    nodes.push(f);
    input = f;
  }

  const oscs: OscillatorNode[] = [];
  for (const [ratio, gain, wave] of o.harmonics ?? SINE) {
    const osc = ctx.createOscillator();
    osc.type = wave ?? o.wave ?? 'sine';
    osc.frequency.setValueAtTime(o.freq * ratio, t);
    if (o.fEnd) osc.frequency.exponentialRampToValueAtTime(o.fEnd * ratio, t + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(input);
    nodes.push(osc, g);
    oscs.push(osc);
  }

  const all: AudioScheduledSourceNode[] = [...oscs];
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.vibrato.cents;
    lfo.connect(lg);
    for (const osc of oscs) lg.connect(osc.detune);
    nodes.push(lfo, lg);
    all.push(lfo);
  }

  const cleanup = () => {
    for (const n of nodes) n.disconnect();
  };
  for (const s of all) {
    s.start(t);
    s.stop(end);
    s.onended = cleanup;
  }
}

let noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One shared 1.5 s white-noise buffer per context. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Short filtered-noise burst with an exponential decay. */
export function hitNoise(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  dur: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.01);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

export function kick(ctx: Ctx, out: AudioNode, t: number, v: number): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(155, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.34);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

export function snare(ctx: Ctx, out: AudioNode, t: number, v: number): void {
  hitNoise(ctx, out, t, 0.14, 'bandpass', 1900, 0.8, 0.5 * v);
  voice(ctx, out, {
    t,
    freq: 185,
    fEnd: 150,
    dur: 0.06,
    peak: 0.25 * v,
    wave: 'triangle',
    attack: 0.001,
    decay: 0.03,
    sustain: 0,
    release: 0.02,
  });
}

export function hat(ctx: Ctx, out: AudioNode, t: number, v: number): void {
  hitNoise(ctx, out, t, 0.05, 'highpass', 7500, 0.7, 0.22 * v);
}

export function shaker(ctx: Ctx, out: AudioNode, t: number, v: number): void {
  hitNoise(ctx, out, t, 0.045, 'bandpass', 5200, 1.1, 0.2 * v);
}

/** Snare roll filling one 16th step with four quick hits, swelling in level. */
export function roll(ctx: Ctx, out: AudioNode, t: number, v: number, stepSec: number): void {
  for (let i = 0; i < 4; i++) {
    hitNoise(ctx, out, t + (i * stepSec) / 4, 0.05, 'bandpass', 2100, 0.8, (0.14 + 0.05 * i) * v);
  }
}
