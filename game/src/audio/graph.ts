// Master bus: buses -> master -> compressor -> analyser -> destination, with a
// shared convolution reverb fed by small send levels from the music and SFX buses.
import type { Ctx } from './synth';

/** Overall trims so that full-volume tracks and SFX sit well below clipping. */
export const MUSIC_LEVEL = 0.7;
export const SFX_LEVEL = 0.9;

export interface Graph {
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  analyser: AnalyserNode;
}

function impulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export function createGraph(ctx: Ctx, musicGain: number, sfxGain: number): Graph {
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;

  master.connect(comp);
  comp.connect(analyser);
  analyser.connect(ctx.destination);

  const verbIn = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 2.4, 3.2);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.8;
  verbIn.connect(conv);
  conv.connect(verbOut);
  verbOut.connect(master);

  const musicBus = ctx.createGain();
  musicBus.gain.value = musicGain;
  musicBus.connect(master);
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.28;
  musicBus.connect(musicSend);
  musicSend.connect(verbIn);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxGain;
  sfxBus.connect(master);
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.12;
  sfxBus.connect(sfxSend);
  sfxSend.connect(verbIn);

  return { master, musicBus, sfxBus, analyser };
}
