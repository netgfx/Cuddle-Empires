// Short synthesized UI and game sound effects. Each entry schedules itself on the
// given output at time t and returns immediately.
import { hitNoise, mtof, noiseBuffer, voice, type Ctx, type Harmonic } from './synth';
import type { SfxName } from './types';

export type SfxFn = (ctx: Ctx, out: AudioNode, t: number) => void;

const BELL: readonly Harmonic[] = [
  [1, 1, 'sine'],
  [2.76, 0.22, 'sine'],
  [5.4, 0.06, 'sine'],
];
const BRASS: readonly Harmonic[] = [
  [1, 1, 'triangle'],
  [2, 0.3, 'triangle'],
  [3, 0.1, 'sine'],
];

function bubble(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, peak: number): void {
  voice(ctx, out, {
    t,
    freq: f0,
    fEnd: f1,
    dur: 0.08,
    peak,
    wave: 'sine',
    attack: 0.004,
    decay: 0.03,
    sustain: 0,
    release: 0.03,
  });
}

function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, peak: number): void {
  voice(ctx, out, {
    t,
    freq,
    dur,
    peak,
    harmonics: BELL,
    attack: 0.002,
    decay: 0.45,
    sustain: 0,
    release: 0.15,
  });
}

function brass(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, peak: number): void {
  voice(ctx, out, {
    t,
    freq,
    dur,
    peak,
    harmonics: BRASS,
    filter: { type: 'lowpass', freq: 2200, q: 0.7 },
    attack: 0.012,
    decay: 0.2,
    sustain: 0.7,
    release: 0.1,
  });
}

function knock(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number): void {
  voice(ctx, out, {
    t,
    freq,
    fEnd: freq * 0.7,
    dur: 0.05,
    peak,
    harmonics: [
      [1, 1, 'sine'],
      [2.7, 0.35, 'sine'],
    ],
    attack: 0.001,
    decay: 0.02,
    sustain: 0,
    release: 0.02,
  });
  hitNoise(ctx, out, t, 0.012, 'bandpass', 1600, 2.5, peak * 0.6);
}

function sweepNoise(ctx: Ctx, out: AudioNode, t: number, dur: number, f0: number, f1: number, peak: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.1;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
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

export const SFX: Record<SfxName, SfxFn> = {
  // soft tick
  click: (ctx, out, t) =>
    voice(ctx, out, {
      t,
      freq: 1400,
      fEnd: 900,
      dur: 0.02,
      peak: 0.16,
      wave: 'triangle',
      attack: 0.001,
      decay: 0.008,
      sustain: 0,
      release: 0.01,
      filter: { type: 'lowpass', freq: 3500, q: 0.7 },
    }),

  // very quiet blip
  hover: (ctx, out, t) =>
    voice(ctx, out, {
      t,
      freq: 1500,
      fEnd: 1800,
      dur: 0.05,
      peak: 0.035,
      wave: 'sine',
      attack: 0.006,
      decay: 0.03,
      sustain: 0,
      release: 0.02,
    }),

  // bubbly pop: two rising bubbles
  place: (ctx, out, t) => {
    bubble(ctx, out, t, 300, 820, 0.32);
    bubble(ctx, out, t + 0.05, 380, 1100, 0.26);
  },

  // rattling dice: ~0.8 s of noise bursts plus a few clicks
  diceRoll: (ctx, out, t) => {
    for (let i = 0; i < 18; i++) {
      const at = t + (i / 18) * 0.8 + Math.random() * 0.02;
      hitNoise(ctx, out, at, 0.03, 'bandpass', 1800 + Math.random() * 2400, 3.5, 0.16 + Math.random() * 0.16);
    }
    for (let i = 0; i < 6; i++) {
      voice(ctx, out, {
        t: t + Math.random() * 0.8,
        freq: 900 + Math.random() * 700,
        dur: 0.018,
        peak: 0.05,
        wave: 'sine',
        attack: 0.001,
        decay: 0.006,
        sustain: 0,
        release: 0.01,
      });
    }
  },

  // wooden knock, two taps
  diceLand: (ctx, out, t) => {
    knock(ctx, out, t, 620, 0.55);
    knock(ctx, out, t + 0.11, 480, 0.3);
  },

  // rising chirp that ends on a bell
  battleWin: (ctx, out, t) => {
    voice(ctx, out, {
      t,
      freq: 480,
      fEnd: 1500,
      dur: 0.22,
      peak: 0.22,
      wave: 'triangle',
      attack: 0.01,
      decay: 0.08,
      sustain: 0.5,
      release: 0.06,
    });
    bell(ctx, out, t + 0.2, 1500, 0.35, 0.18);
  },

  // descending "womp"
  battleLose: (ctx, out, t) =>
    voice(ctx, out, {
      t,
      freq: 330,
      fEnd: 95,
      dur: 0.45,
      peak: 0.28,
      wave: 'triangle',
      attack: 0.01,
      decay: 0.25,
      sustain: 0.6,
      release: 0.08,
      filter: { type: 'lowpass', freq: 900, q: 1 },
      vibrato: { rate: 7, cents: 35 },
    }),

  // four-note fanfare
  conquer: (ctx, out, t) => {
    const notes: ReadonlyArray<readonly [number, number]> = [
      [72, 0.1],
      [76, 0.1],
      [79, 0.1],
      [84, 0.45],
    ];
    notes.forEach(([m, d], i) => brass(ctx, out, t + i * 0.1, mtof(m), d, 0.2));
  },

  // paper swish
  cardDraw: (ctx, out, t) => sweepNoise(ctx, out, t, 0.3, 700, 3800, 0.35),

  // sparkly arpeggio
  cardTrade: (ctx, out, t) => {
    [84, 88, 91, 96].forEach((m, i) => bell(ctx, out, t + i * 0.055, mtof(m), 0.35, 0.2));
  },

  // two-note chime
  turn: (ctx, out, t) => {
    bell(ctx, out, t, mtof(79), 0.35, 0.28);
    bell(ctx, out, t + 0.13, mtof(84), 0.45, 0.26);
  },

  // sad trombone "wah wah wahhh"
  eliminated: (ctx, out, t) => {
    const notes: ReadonlyArray<readonly [number, number, number]> = [
      [62, 0, 0.28],
      [61, 0.3, 0.28],
      [60, 0.6, 0.8],
    ];
    for (const [m, at, d] of notes) {
      voice(ctx, out, {
        t: t + at,
        freq: mtof(m),
        dur: d,
        peak: 0.2,
        wave: 'sawtooth',
        filter: { type: 'lowpass', freq: 700, freqEnd: 420, q: 2.5 },
        vibrato: { rate: 5, cents: 18 },
        attack: 0.04,
        decay: 0.25,
        sustain: 0.85,
        release: 0.1,
      });
    }
  },

  // ~2 s fanfare: rising arpeggio, then a held major chord
  victory: (ctx, out, t) => {
    const arp: ReadonlyArray<readonly [number, number, number]> = [
      [67, 0, 0.14],
      [72, 0.14, 0.14],
      [76, 0.28, 0.14],
      [79, 0.42, 0.14],
      [84, 0.56, 0.5],
    ];
    for (const [m, at, d] of arp) brass(ctx, out, t + at, mtof(m), d, 0.16);
    for (const m of [72, 76, 79]) brass(ctx, out, t + 1.1, mtof(m), 1.0, 0.1);
    bell(ctx, out, t + 1.1, mtof(84), 1.2, 0.12);
  },

  // soft double buzz (dissonant pair)
  error: (ctx, out, t) => {
    for (const at of [0, 0.2]) {
      for (const f of [185, 175]) {
        voice(ctx, out, {
          t: t + at,
          freq: f,
          dur: 0.16,
          peak: 0.07,
          harmonics: [[1, 1, 'square']],
          filter: { type: 'lowpass', freq: 800, q: 0.8 },
          attack: 0.005,
          decay: 0.05,
          sustain: 0.6,
          release: 0.04,
        });
      }
    }
  },
};
