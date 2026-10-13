// The four procedural music loops and their instrument kits.
// Notation is documented in score.ts. Lines are one entry per bar; chord symbols
// cycle over bars. All loops are 8 bars long.
import { hat, kick, roll, shaker, snare, voice, type Harmonic, type Kit } from './synth';
import type { PlayableTrackId } from './types';

export interface TrackDef {
  bpm: number; // quarter-note tempo
  beats: number; // quarter notes per bar (4 = 4/4, 3 = 3/4, 2 = 2/4)
  chords: string[]; // chord symbol per bar, cycled
  chordBase: number; // midi note that chord root pitch classes sit above
  bassBase: number; // midi note that bass root pitch classes sit above
  lead: string[]; // lead line per bar
  bass: string[]; // bass line per bar
  drums?: string[]; // one char per 16th step: k kick, s snare, h hat, x shaker, r roll
  chordOn: number[]; // step offsets within a bar where the chord is struck
  chordLen: number; // chord length in 16th steps
  level: number; // per-track loudness trim so all loops sit at a similar level
  kit: Kit;
}

const PLUCK: readonly Harmonic[] = [
  [1, 1, 'sine'],
  [1, 0.3, 'triangle'],
  [2, 0.06, 'sine'],
];
const GLOCK: readonly Harmonic[] = [
  [1, 1, 'sine'],
  [3, 0.22, 'sine'],
  [4.2, 0.05, 'sine'],
];
const BELL: readonly Harmonic[] = [
  [1, 1, 'sine'],
  [2.76, 0.22, 'sine'],
  [5.4, 0.06, 'sine'],
];
const PAD: readonly Harmonic[] = [
  [1, 1, 'triangle'],
  [2, 0.12, 'sine'],
];

// Meadow: cheerful pastoral, kalimba lead, soft pad, shaker.
const meadowKit: Kit = {
  lead: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.2 * v,
      harmonics: PLUCK,
      attack: 0.004,
      decay: 0.16,
      sustain: 0,
      release: 0.1,
    }),
  bass: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.2 * v,
      harmonics: [
        [1, 1, 'sine'],
        [2, 0.12, 'triangle'],
      ],
      attack: 0.01,
      decay: 0.3,
      sustain: 0.4,
      release: 0.12,
    }),
  chord: (ctx, out, t, fs, dur, v) => {
    for (const f of fs) {
      voice(ctx, out, {
        t,
        freq: f,
        dur,
        peak: 0.04 * v,
        harmonics: PAD,
        filter: { type: 'lowpass', freq: 1400, q: 0.5 },
        attack: 0.3,
        decay: 0.7,
        sustain: 0.7,
        release: 0.3,
      });
    }
  },
  drum: (ctx, out, t, ch, v) => {
    if (ch === 'k') kick(ctx, out, t, 0.8 * v);
    else if (ch === 'x') shaker(ctx, out, t, 0.6 * v);
  },
};

// March: toy-soldier 2/4, glockenspiel lead, tuba bass, brass "pah" chords, snare rolls.
const marchKit: Kit = {
  lead: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.2 * v,
      harmonics: GLOCK,
      attack: 0.002,
      decay: 0.45,
      sustain: 0,
      release: 0.15,
    }),
  bass: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.16 * v,
      harmonics: [[1, 1, 'square']],
      filter: { type: 'lowpass', freq: 360, q: 1 },
      attack: 0.02,
      decay: 0.25,
      sustain: 0.75,
      release: 0.08,
    }),
  chord: (ctx, out, t, fs, dur, v) => {
    for (const f of fs) {
      voice(ctx, out, {
        t,
        freq: f,
        dur,
        peak: 0.07 * v,
        harmonics: [
          [1, 1, 'triangle'],
          [2, 0.3, 'triangle'],
        ],
        filter: { type: 'lowpass', freq: 1500, q: 0.7 },
        attack: 0.015,
        decay: 0.2,
        sustain: 0.5,
        release: 0.08,
      });
    }
  },
  drum: (ctx, out, t, ch, v, stepSec) => {
    if (ch === 'k') kick(ctx, out, t, 0.9 * v);
    else if (ch === 'h') hat(ctx, out, t, v);
    else if (ch === 's') snare(ctx, out, t, 0.9 * v);
    else if (ch === 'r') roll(ctx, out, t, 0.8 * v, stepSec);
  },
};

// Lullaby: calm 3/4 music box, long bell tones, soft bass and pad, no drums.
const lullabyKit: Kit = {
  lead: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.18 * v,
      harmonics: BELL,
      attack: 0.002,
      decay: 0.9,
      sustain: 0,
      release: 0.5,
    }),
  bass: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.12 * v,
      attack: 0.05,
      decay: 0.8,
      sustain: 0.5,
      release: 0.4,
    }),
  chord: (ctx, out, t, fs, dur, v) => {
    for (const f of fs) {
      voice(ctx, out, {
        t,
        freq: f,
        dur,
        peak: 0.03 * v,
        harmonics: PAD,
        filter: { type: 'lowpass', freq: 1200, q: 0.5 },
        attack: 0.4,
        decay: 0.9,
        sustain: 0.6,
        release: 0.4,
      });
    }
  },
};

// Adventure: 128 bpm heroic, chiptune arpeggio lead, saw bass with filter pluck, stabs, drums.
const adventureKit: Kit = {
  lead: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.1 * v,
      harmonics: [[1, 1, 'square']],
      filter: { type: 'lowpass', freq: 3600, q: 0.6 },
      attack: 0.003,
      decay: 0.2,
      sustain: 0.35,
      release: 0.05,
    }),
  bass: (ctx, out, t, f, dur, v) =>
    voice(ctx, out, {
      t,
      freq: f,
      dur,
      peak: 0.15 * v,
      harmonics: [[1, 1, 'sawtooth']],
      filter: { type: 'lowpass', freq: 1100, freqEnd: 240, q: 3 },
      attack: 0.004,
      decay: 0.15,
      sustain: 0.3,
      release: 0.05,
    }),
  chord: (ctx, out, t, fs, dur, v) => {
    for (const f of fs) {
      voice(ctx, out, {
        t,
        freq: f,
        dur,
        peak: 0.05 * v,
        harmonics: [[1, 1, 'sawtooth']],
        filter: { type: 'lowpass', freq: 1800, freqEnd: 700, q: 1 },
        attack: 0.004,
        decay: 0.12,
        sustain: 0.2,
        release: 0.05,
      });
    }
  },
  drum: (ctx, out, t, ch, v, stepSec) => {
    if (ch === 'k') kick(ctx, out, t, v);
    else if (ch === 'h') hat(ctx, out, t, 0.7 * v);
    else if (ch === 's') snare(ctx, out, t, 0.8 * v);
    else if (ch === 'r') roll(ctx, out, t, 0.8 * v, stepSec);
  },
};

export const TRACKS: Record<PlayableTrackId, TrackDef> = {
  meadow: {
    bpm: 100,
    beats: 4,
    chords: ['C', 'Am', 'F', 'G', 'Em', 'Am', 'F', 'G'],
    chordBase: 60,
    bassBase: 36,
    lead: [
      'E5:2 G5:2 C6:4 G5:2 E5:2 D5:2 C5:2',
      'A5:2 C6:2 E6:4 D6:2 C6:2 A5:2 G5:2',
      'F5:2 A5:2 C6:4 A5:2 F5:2 E5:2 F5:2',
      'G5:2 B5:2 D6:4 B5:2 G5:2 F5:2 D5:2',
      'E6:2 D6:2 B5:2 G5:2 B5:2 E5:2 G5:2 B5:2',
      'A5:4 C6:2 E6:2 C6:4 A5:2 .:2',
      'F5:2 A5:2 C6:2 A5:2 F5:2 C5:2 F5:2 A5:2',
      'G5:2 D5:2 B4:2 D5:2 G5:2 B5:2 D6:4',
    ],
    bass: [
      'R:4 R:4 5:4 R:4',
      'R:4 5:4 R:4 5:4',
      'R:4 R:4 5:4 R:4',
      'R:4 5:4 R:4 5:4',
      'R:4 R:4 5:4 R:4',
      'R:4 5:4 R:4 5:4',
      'R:4 R:4 5:4 R:4',
      'R:4 5:4 R:4 3:4',
    ],
    drums: [
      'k.x.x.x.k.x.x.x.',
      'k.x.x.x.k.x.x.x.',
      'k.x.x.x.k.k.x.x.',
      'k.x.x.x.k.x.x.x.',
      'k.x.x.x.k.x.x.x.',
      'k.x.x.x.k.x.x.x.',
      'k.x.x.x.k.k.x.x.',
      'k.x.x.x.k.x.x.x.',
    ],
    chordOn: [0],
    chordLen: 16,
    level: 0.7,
    kit: meadowKit,
  },
  march: {
    bpm: 112,
    beats: 2,
    chords: ['G', 'D', 'C', 'G', 'Em', 'C', 'D', 'G'],
    chordBase: 48,
    bassBase: 36,
    lead: [
      'D5:2 G5:2 B5:2 G5:2',
      'A5:2 F#5:2 D5:4',
      'G5:1 A5:1 C6:2 E6:2 C6:2',
      'D6:2 B5:2 G5:2 B5:2',
      'E5:2 G5:2 B5:2 E6:2',
      'C6:2 G5:2 E5:2 C5:2',
      'F#5:2 A5:2 D6:4',
      'G5:2 D5:2 B4:2 G4:2',
    ],
    bass: ['R:4 5:4', 'R:4 5:4', 'R:2 R:2 5:4', 'R:4 5:4', 'R:4 5:4', 'R:2 R:2 5:4', 'R:4 5:4', 'R:4 8:4'],
    drums: ['k.h.s.h.', 'k.h.s.h.', 'k.h.s.r.', 'k.h.s.h.', 'k.h.s.h.', 'k.h.s.r.', 'k.h.s.h.', 'k.h.s.rr'],
    chordOn: [4],
    chordLen: 4,
    level: 0.6,
    kit: marchKit,
  },
  lullaby: {
    bpm: 70,
    beats: 3,
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'C', 'F'],
    chordBase: 60,
    bassBase: 36,
    lead: [
      'A5:4 C6:4 F6:4',
      'D6:4 F5:4 A5:4',
      'Bb5:4 D6:4 F6:4',
      'G5:6 E5:3 C5:3',
      'A5:4 F5:4 C6:4',
      'D6:6 A5:3 F5:3',
      'E6:4 C6:4 G5:4',
      'F5:6 A5:3 C6:3',
    ],
    bass: ['R:12', 'R:6 5:6', 'R:12', 'R:6 5:6', 'R:12', 'R:6 5:6', 'R:12', 'R:12'],
    chordOn: [0],
    chordLen: 12,
    level: 1.2,
    kit: lullabyKit,
  },
  adventure: {
    bpm: 128,
    beats: 4,
    chords: ['Am', 'F', 'C', 'G', 'A', 'D', 'E', 'A'],
    chordBase: 48,
    bassBase: 36,
    lead: [
      'A5:2 E5:2 C5:2 E5:2 A5:2 E5:2 C5:2 E5:2',
      'F5:2 C5:2 A4:2 C5:2 F5:2 C5:2 A4:2 C5:2',
      'G5:2 E5:2 C5:2 E5:2 G5:2 E5:2 C6:2 G5:2',
      'G5:1 B5:1 D6:1 G6:1 F6:2 E6:2 D6:2 B5:2 G5:2 E5:2',
      'A5:2 C#6:2 E6:2 A6:2 E6:2 C#6:2 A5:2 E5:2',
      'D6:2 A5:2 F#5:2 A5:2 D6:2 F#6:2 A6:2 F#6:2',
      'E6:2 B5:2 G#5:2 B5:2 E6:2 G#6:2 B6:2 G#6:2',
      'A6:4 E6:2 C#6:2 A5:4 E5:4',
    ],
    bass: [
      'R:2 R:2 R:2 R:2 R:2 R:2 8:2 R:2',
      'R:2 R:2 R:2 R:2 3:2 3:2 5:2 3:2',
      'R:2 R:2 5:2 5:2 R:2 R:2 8:2 8:2',
      'R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2',
      'R:2 R:2 R:2 R:2 8:2 8:2 R:2 R:2',
      'R:2 R:2 5:2 5:2 R:2 R:2 5:2 R:2',
      'R:2 R:2 R:2 R:2 R:2 R:2 8:2 R:2',
      'R:4 R:4 5:4 8:4',
    ],
    drums: [
      'k.h.k.h.k.h.k.h.',
      'k.h.k.h.k.h.k.h.',
      'k.h.sh.hk.h.sh.h',
      'k.h.k.h.k.h.k.h.',
      'k.h.k.h.k.h.k.h.',
      'k.h.k.h.k.h.k.h.',
      'k.h.sh.hk.h.sh.h',
      'k.h.k.h.srrsrrrr',
    ],
    chordOn: [0, 8],
    chordLen: 6,
    level: 0.6,
    kit: adventureKit,
  },
};
