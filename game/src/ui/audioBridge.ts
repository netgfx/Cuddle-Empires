// The only place the UI talks to the audio module. `../audio` is written in
// parallel by the audio agent; it's resolved through import.meta.glob so the build
// works before it exists (glob of a missing file = empty object). Expected API:
//   audio.unlock(), audio.setTrack(id), audio.setMusicVolume(v), audio.setSfxVolume(v), audio.sfx(name)
// Until it lands, SFX are also broadcast as `risk:sfx` window events.
import type { MusicTrackId } from '../state/uiStore';
import { useUI } from '../state/uiStore';

interface AudioApi {
  unlock?: () => void | Promise<void>;
  setTrack?: (id: MusicTrackId) => void;
  setMusicVolume?: (v: number) => void;
  setSfxVolume?: (v: number) => void;
  sfx?: (name: string) => void;
}

const mods = import.meta.glob<{ audio?: AudioApi; default?: AudioApi }>('../audio/index.ts', { eager: true });
const mod = Object.values(mods)[0];
const audio: AudioApi | null = mod?.audio ?? mod?.default ?? null;

let unlocked = false;

function safe(fn: () => unknown) {
  try { void fn(); } catch (e) { console.warn('[audioBridge]', e); }
}

/** UI sound names → audio module SfxName (null = silent). */
const SFX_MAP: Record<string, string | null> = {
  start: 'click', attack: 'click', blitz: 'click', card: 'hover', trade: 'cardTrade', sparkle: null,
  march: 'place', cardDraw: 'cardDraw',
};

export function playSfx(ui: string) {
  const name = ui in SFX_MAP ? SFX_MAP[ui] : ui;
  if (!name) return;
  if (audio?.sfx) safe(() => audio.sfx!(name));
  else window.dispatchEvent(new CustomEvent('risk:sfx', { detail: name }));
}

/** Call on the first user gesture. Applies the persisted prefs. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ui = useUI.getState();
  safe(() => audio?.unlock?.());
  safe(() => audio?.setMusicVolume?.(ui.musicVolume));
  safe(() => audio?.setSfxVolume?.(ui.sfxVolume));
  safe(() => audio?.setTrack?.(ui.music));
}

/** Keeps the audio module in sync with the persisted prefs. Returns an unsubscribe. */
export function bindAudioPrefs(): () => void {
  return useUI.subscribe((s, prev) => {
    if (s.music !== prev.music) safe(() => audio?.setTrack?.(s.music));
    if (s.musicVolume !== prev.musicVolume) safe(() => audio?.setMusicVolume?.(s.musicVolume));
    if (s.sfxVolume !== prev.sfxVolume) safe(() => audio?.setSfxVolume?.(s.sfxVolume));
  });
}
