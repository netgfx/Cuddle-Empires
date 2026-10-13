import { ADJACENT, CONTINENTS, TERRITORIES } from '../game/mapData';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { ArmyStack, PanelBox, PlayerChip } from './common';
import { playerById } from './util';

export function TerritoryInfo() {
  const view = useGame((s) => s.view);
  const open = useUI((s) => s.panels.territory);
  const selected = useUI((s) => s.selected);
  const hovered = useUI((s) => s.hovered);
  const id = selected ?? hovered;
  if (!view || !open) return null;
  const ui = useUI.getState();
  if (!id) {
    return (
      <PanelBox title="🗺️ Territory" onClose={() => ui.setPanel('territory', false)} testid="territory-panel" className="territory-panel">
        <p className="muted">Hover or click a territory on the map to see its details.</p>
      </PanelBox>
    );
  }
  const def = TERRITORIES[id];
  const cont = CONTINENTS[def.continent];
  const t = view.territories[id];
  const owner = playerById(view, t.owner);
  const owned = cont.territories.filter((x) => view.territories[x].owner === t.owner).length;
  return (
    <PanelBox title={def.name} onClose={() => ui.setPanel('territory', false)} testid="territory-panel" className="territory-panel">
      <div className="ti-cont" style={{ ['--cc' as string]: cont.color }}>
        <span className="cont-chip" style={{ background: cont.color }} />
        {cont.name} <span className="muted">· bonus +{cont.bonus}</span>
        {owner && <span className="muted small"> · {owner.name} holds {owned}/{cont.territories.length}</span>}
      </div>
      <div className="ti-row"><span className="muted">Owner</span>{owner ? <PlayerChip player={owner} small /> : <span className="muted">Unclaimed</span>}</div>
      <div className="ti-row" data-testid="territory-armies"><span className="muted">Armies</span><b className="ti-big">{t.armies}</b><ArmyStack n={t.armies} /></div>
      <div className="ti-neigh-title muted">Neighbours</div>
      <div className="ti-neigh">
        {ADJACENT[id].map((n) => {
          const o = playerById(view, view.territories[n].owner);
          return (
            <button key={n} className="neigh-btn" onClick={() => ui.select(n)} data-testid={`neighbour-${n}`}
              onMouseEnter={() => ui.setHovered(n)} onMouseLeave={() => ui.setHovered(null)}>
              <span className="chip-dot" style={{ background: o?.color ?? '#ddd' }} />
              {TERRITORIES[n].name} <span className="muted">{view.territories[n].armies}</span>
            </button>
          );
        })}
      </div>
      <button className="btn ghost sm" onClick={() => ui.focus({ kind: 'territory', id })} data-testid="territory-focus">🎯 Focus</button>
    </PanelBox>
  );
}
