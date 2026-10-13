// Dev test page for the audio engine. Served by Vite at /src/audio/dev/audio.html.
import { audio } from '../index';
import { measure, renderSfxOffline, renderTrackOffline } from '../offline';
import { PLAYABLE_TRACK_IDS, SFX_NAMES, type MusicTrackId, type PlayableTrackId, type SfxName } from '../types';

interface RenderReport {
  seconds: number;
  peak: number;
  rms: number;
}

declare global {
  interface Window {
    __audio: typeof audio;
    __renderTrack: (id: PlayableTrackId, seconds: number) => Promise<RenderReport>;
    __renderSfx: (name: SfxName) => Promise<RenderReport>;
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const logEl = el<HTMLPreElement>('log');
function log(line: string): void {
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${line}\n${logEl.textContent ?? ''}`;
}

function button(parent: HTMLElement, label: string, onClick: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  b.addEventListener('click', () => {
    audio.unlock();
    onClick();
  });
  parent.appendChild(b);
}

const musicEl = el<HTMLDivElement>('music');
for (const id of ['off', ...PLAYABLE_TRACK_IDS] as MusicTrackId[]) {
  button(musicEl, id, () => {
    audio.setTrack(id);
    log(`setTrack(${id})`);
  });
}

const sfxEl = el<HTMLDivElement>('sfx');
for (const name of SFX_NAMES) {
  button(sfxEl, name, () => {
    audio.sfx(name);
    log(`sfx(${name})`);
  });
}

const renderEl = el<HTMLDivElement>('render');
for (const id of PLAYABLE_TRACK_IDS) {
  button(renderEl, `render ${id} 16s`, () => {
    void renderTrackOffline(id, 16).then((buf) => {
      const m = measure(buf);
      log(`render ${id}: peak=${m.peak.toFixed(3)} rms=${m.rms.toFixed(3)} clipped=${m.peak >= 0.95}`);
    });
  });
}

el<HTMLButtonElement>('unlock').addEventListener('click', () => {
  audio.unlock();
  log('unlock()');
});

const musicVol = el<HTMLInputElement>('musicVol');
musicVol.addEventListener('input', () => audio.setMusicVolume(Number(musicVol.value)));
const sfxVol = el<HTMLInputElement>('sfxVol');
sfxVol.addEventListener('input', () => audio.setSfxVolume(Number(sfxVol.value)));
audio.setMusicVolume(Number(musicVol.value));
audio.setSfxVolume(Number(sfxVol.value));

const statusEl = el<HTMLSpanElement>('status');
setInterval(() => {
  const s = window.__audioState?.();
  if (s) statusEl.textContent = `context: ${s.state} | wanted: ${s.track} | playing: ${s.playing} | t=${s.time.toFixed(2)}`;
}, 250);

window.__audio = audio;
window.__renderTrack = async (id, seconds) => measure(await renderTrackOffline(id, seconds));
window.__renderSfx = async (name) => measure(await renderSfxOffline(name));
