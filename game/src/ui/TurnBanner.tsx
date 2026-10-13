// Turn banner + hotseat handoff curtain + elimination popups, driven by the director.
import { animate, createTimeline } from 'animejs';
import { useEffect, useRef } from 'react';
import { CONTINENTS } from '../game/mapData';
import { onEvent } from '../state/director';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { localHumanCount, useLocal } from './localStore';
import { playerById, sel, sfx, wait } from './util';

let bannerKey = 0;

export function TurnDirector() {
  useEffect(() => {
    const offs = [
      onEvent('turnStarted', async (ev, ctx) => {
        const player = playerById(ctx.after, ev.player);
        if (!player) return;
        const local = useLocal.getState();
        const setup = ctx.after.phase === 'setupClaim' || ctx.after.phase === 'setupReinforce';
        if (setup) {
          if (player.kind === 'human') local.set({ lastHuman: player.id });
          return;
        }
        // hotseat handoff curtain — before the banner so nobody sees the next hand
        const transport = useGame.getState().transport;
        const needCurtain = player.kind === 'human' && transport?.mode !== 'online' && localHumanCount() > 1
          && local.lastHuman !== player.id;
        if (needCurtain) await new Promise<void>((resolve) => local.set({ curtain: { player: player.id, resolve } }));
        if (player.kind === 'human') useLocal.getState().set({ lastHuman: player.id, hideCards: false });
        sfx('turn');
        useLocal.getState().set({ banner: { key: ++bannerKey, player: ev.player, turn: ev.turn, reinforcements: ev.reinforcements } });
        await wait(1400 / ctx.speed);
        useLocal.getState().set({ banner: null });
      }),
      onEvent('eliminated', async (ev, ctx) => {
        const p = playerById(ctx.after, ev.player);
        const by = playerById(ctx.after, ev.by);
        sfx('eliminated');
        useLocal.getState().popup(`💥 ${p?.name ?? ev.player} was knocked out by ${by?.name ?? ev.by}!${ev.cardsTaken.length ? ` (+${ev.cardsTaken.length} cards)` : ''}`, p?.color, 2600 / ctx.speed);
        await wait(1200 / ctx.speed);
      }),
      onEvent('gameOver', async (_ev, ctx) => {
        sfx('victory');
        await wait(500 / ctx.speed);
        useLocal.getState().set({ showGameOver: true });
      }),
    ];
    // The initial state of a new game arrives without a turnStarted event: greet the first player here.
    const unsub = useGame.subscribe((st, prev) => {
      if (!st.view || prev.view || !st.transport) return;
      const v = st.view;
      useLocal.getState().set({ lastHuman: null, showGameOver: false, banner: null, curtain: null, hideCards: false });
      if (v.phase !== 'reinforce') return;
      const p = v.players[v.current];
      const greet = () => {
        if (p.kind === 'human') useLocal.getState().set({ lastHuman: p.id });
        useLocal.getState().set({ banner: { key: ++bannerKey, player: p.id, turn: v.turn, reinforcements: sel.reinforcementsFor(v, p.id) } });
        setTimeout(() => useLocal.getState().set({ banner: null }), 1400 / useUI.getState().animSpeed);
      };
      setTimeout(() => {
        if (p.kind === 'human' && st.transport?.mode !== 'online' && localHumanCount() > 1) {
          useLocal.getState().set({ curtain: { player: p.id, resolve: greet } });
        } else greet();
      }, 50);
    });
    return () => { offs.forEach((o) => o()); unsub(); };
  }, []);
  return null;
}

export function TurnBanner() {
  const banner = useLocal((s) => s.banner);
  const view = useGame((s) => s.view);
  const speed = useUI((s) => s.animSpeed);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!banner || !ref.current) return;
    const d = (ms: number) => ms / speed;
    const tl = createTimeline()
      .add(ref.current, { x: ['-120vw', '0vw'], rotate: [-6, 0], duration: d(480), ease: 'outBack(1.3)' })
      .add(ref.current, { x: ['0vw', '120vw'], rotate: [0, 6], duration: d(380), delay: d(480), ease: 'inBack(1.3)' });
    return () => { tl.pause(); };
  }, [banner?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!banner || !view) return null;
  const p = playerById(view, banner.player);
  if (!p) return null;
  const r = banner.reinforcements;
  return (
    <div className="banner-wrap">
      <div className="turn-banner" ref={ref} style={{ ['--pc' as string]: p.color }} data-testid="turn-banner">
        <div className="tb-main">{p.name}'s turn <span className="tb-plus">— +{r.total} armies</span></div>
        <div className="tb-sub">
          🗺️ {r.territories} from territories
          {r.continents.map((c) => (
            <span key={c.continent} className="tb-cont" style={{ background: CONTINENTS[c.continent].color }}>+{c.bonus} {CONTINENTS[c.continent].name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Curtain() {
  const curtain = useLocal((s) => s.curtain);
  const view = useGame((s) => s.view ?? s.game);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (curtain && ref.current) animate(ref.current, { opacity: [0, 1], duration: 300, ease: 'outQuad' });
  }, [curtain]);
  if (!curtain || !view) return null;
  const p = playerById(view, curtain.player);
  const go = () => {
    sfx('click');
    useLocal.getState().set({ curtain: null });
    curtain.resolve();
  };
  return (
    <div className="curtain" ref={ref} onClick={go} data-testid="handoff-curtain" style={{ ['--pc' as string]: p?.color ?? '#888' }}>
      <div className="curtain-card">
        <div className="curtain-emoji">🙈</div>
        <h2>Pass to {p?.name}</h2>
        <p>Tap to continue</p>
        <button className="btn primary big" data-testid="handoff-continue" onClick={(e) => { e.stopPropagation(); go(); }}>I'm {p?.name} ✋</button>
      </div>
    </div>
  );
}

export function Popups() {
  const popups = useLocal((s) => s.popups);
  return (
    <div className="popups">
      {popups.map((p) => (
        <div key={p.key} className="popup pop-in" style={{ ['--pc' as string]: p.color ?? '#ff7aa2' }} data-testid="popup">{p.text}</div>
      ))}
    </div>
  );
}
