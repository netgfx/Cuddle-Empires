// DOM overlay above the 3D canvas. Root ignores the pointer; panels opt back in.
import { useEffect } from 'react';
import { useGame } from '../state/gameStore';
import { useUI, type PanelId } from '../state/uiStore';
import { bindAudioPrefs, unlockAudio } from './audioBridge';
import { BotDriver } from './BotDriver';
import { CardFx, CardHand, DeckPile } from './CardHand';
import { AttackPanel, FortifyDialog, OccupyDialog } from './Dialogs';
import { GameOver } from './GameOver';
import { HUD } from './HUD';
import { HelpPanel, LogPanel, SettingsPanel } from './Panels';
import { quickSave, SavesPanel } from './SavesPanel';
import { Scoreboard } from './Scoreboard';
import { SetupScreen } from './SetupScreen';
import { TerritoryInfo } from './TerritoryInfo';
import { Toasts } from './Toasts';
import { Curtain, Popups, TurnBanner, TurnDirector } from './TurnBanner';
import './ui.css';

/** Panels closed by Esc, topmost first. */
const ESC_ORDER: PanelId[] = ['saves', 'help', 'settings', 'log', 'territory'];

const isSaveKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's';

export function UIRoot() {
  const hasView = useGame((s) => !!s.view);

  useEffect(() => bindAudioPrefs(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSaveKey(e)) {
        if (!useGame.getState().game) return;
        e.preventDefault(); // never the browser's "save page" dialog mid-game
        if (!e.repeat && !useUI.getState().panels.saves) void quickSave(); // the open modal saves with its own name field
        return;
      }
      if (e.key !== 'Escape') return;
      const ui = useUI.getState();
      const top = ESC_ORDER.find((p) => ui.panels[p]);
      if (top) ui.setPanel(top, false);
      ui.clearSelection();
    };
    const onFirst = () => unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onFirst); };
  }, []);

  return (
    <div className="ui-root" data-testid="ui-root">
      <TurnDirector />
      <CardFx />
      {!hasView ? (
        <SetupScreen />
      ) : (
        <>
          <BotDriver />
          <HUD />
          <Scoreboard />
          <div className="right-col">
            <TerritoryInfo />
            <LogPanel />
          </div>
          <div className="center-col">
            <AttackPanel />
            <OccupyDialog />
            <FortifyDialog />
          </div>
          <CardHand />
          <DeckPile />
          <TurnBanner />
          <Popups />
          <SettingsPanel />
          <HelpPanel />
          <GameOver />
        </>
      )}
      <SavesPanel />
      <Curtain />
      <Toasts />
    </div>
  );
}
