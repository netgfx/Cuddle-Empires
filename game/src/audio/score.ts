// Pure score compiler: turns the per-bar text notation in tracks.ts into a flat
// list of events per 16th-note step. No Web Audio access here, so it can be
// exercised from plain Node.
//
// Lead/bass line notation: whitespace-separated tokens, each `NAME[:steps]`
//   NAME  = note name with octave (C4 = midi 60, F#5, Bb3) for explicit pitch,
//           `.` for a rest, or a chord degree (bass only): R root, 3, 5, 7, 8 (octave).
//   steps = length in 16th steps (default 1). Tokens must sum to steps per bar.
import { mtof, type Kit } from './synth';
import type { TrackDef } from './tracks';

export type Ev =
  | { k: 'lead'; f: number; len: number; vel: number }
  | { k: 'bass'; f: number; len: number; vel: number }
  | { k: 'chord'; fs: readonly number[]; len: number; vel: number }
  | { k: 'drum'; ch: string; vel: number };

export interface Compiled {
  steps: number; // loop length in 16th steps
  stepSec: number; // seconds per 16th step
  events: Ev[][]; // events[step]
  kit: Kit;
  level: number; // track loudness trim
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
const CHORD_RE = /^([A-G])(#|b)?(maj7|m7|dim|m|7)?$/;
const QUALITY: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
};
const DEGREES = new Set(['R', '3', '5', '7', '8']);

export function noteMidi(name: string): number {
  const m = NOTE_RE.exec(name);
  if (!m) throw new Error(`audio score: bad note "${name}"`);
  const pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
}

export interface Chord {
  pc: number;
  ivs: readonly number[];
}

export function parseChord(sym: string): Chord {
  const m = CHORD_RE.exec(sym);
  if (!m) throw new Error(`audio score: bad chord "${sym}"`);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { pc, ivs: QUALITY[m[3] ?? ''] };
}

interface Tok {
  len: number;
  midi?: number;
  deg?: string;
}

function parseLine(line: string, steps: number): Tok[] {
  const toks: Tok[] = [];
  let sum = 0;
  for (const raw of line.trim().split(/\s+/)) {
    const [head, lenStr] = raw.split(':');
    const len = lenStr === undefined ? 1 : Number(lenStr);
    if (!Number.isInteger(len) || len < 1) throw new Error(`audio score: bad length in "${raw}"`);
    const tok: Tok = { len };
    if (head === '.') {
      // rest
    } else if (DEGREES.has(head)) {
      tok.deg = head;
    } else {
      tok.midi = noteMidi(head);
    }
    toks.push(tok);
    sum += len;
  }
  if (sum !== steps) throw new Error(`audio score: "${line}" spans ${sum} steps, expected ${steps}`);
  return toks;
}

function degreeOffset(ch: Chord, deg: string): number {
  switch (deg) {
    case 'R':
      return ch.ivs[0];
    case '3':
      return ch.ivs[1];
    case '5':
      return ch.ivs[2];
    case '7':
      return ch.ivs.length > 3 ? ch.ivs[3] : 10;
    case '8':
      return 12;
    default:
      throw new Error(`audio score: bad degree "${deg}"`);
  }
}

export function compile(def: TrackDef): Compiled {
  const spb = def.beats * 4; // 16th steps per bar
  const bars = def.lead.length;
  if (bars < 1) throw new Error('audio score: track has no bars');
  if (def.bass.length !== bars) throw new Error(`audio score: ${def.bass.length} bass bars vs ${bars} lead bars`);
  if (def.drums && def.drums.length !== bars) throw new Error('audio score: drum bars mismatch');
  for (const off of def.chordOn) if (off < 0 || off >= spb) throw new Error(`audio score: chordOn ${off} out of bar`);

  const steps = spb * bars;
  const events: Ev[][] = Array.from({ length: steps }, () => []);

  for (let bar = 0; bar < bars; bar++) {
    const base = bar * spb;
    const ch = parseChord(def.chords[bar % def.chords.length]);

    let pos = 0;
    for (const tok of parseLine(def.lead[bar], spb)) {
      if (tok.midi !== undefined) {
        events[base + pos].push({ k: 'lead', f: mtof(tok.midi), len: tok.len, vel: pos % 4 === 0 ? 1 : 0.8 });
      }
      pos += tok.len;
    }

    pos = 0;
    for (const tok of parseLine(def.bass[bar], spb)) {
      const midi = tok.midi ?? (tok.deg !== undefined ? def.bassBase + ch.pc + degreeOffset(ch, tok.deg) : undefined);
      if (midi !== undefined) {
        events[base + pos].push({ k: 'bass', f: mtof(midi), len: tok.len, vel: pos % 4 === 0 ? 1 : 0.85 });
      }
      pos += tok.len;
    }

    if (def.drums) {
      const row = def.drums[bar];
      if (row.length !== spb) throw new Error(`audio score: drum row "${row}" is not ${spb} steps`);
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '.') events[base + i].push({ k: 'drum', ch: row[i], vel: 1 });
      }
    }

    const fs = ch.ivs.map((iv) => mtof(def.chordBase + ch.pc + iv));
    for (const off of def.chordOn) {
      events[base + off].push({ k: 'chord', fs, len: def.chordLen, vel: 1 });
    }
  }

  return { steps, stepSec: 60 / def.bpm / 4, events, kit: def.kit, level: def.level };
}
