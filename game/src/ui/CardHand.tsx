// Card hand (bottom-left), deck pile (bottom-right), must-trade modal and the
// animejs card effects for the director's `cardDrawn` / `cardsTraded` events.
import { animate, createTimeline, stagger } from 'animejs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTINENTS, TERRITORIES } from '../game/mapData';
import type { Card, GameState } from '../game/types';
import { onEvent } from '../state/director';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { UnitIcon } from './common';
import { handOwnerNow, localHumanCount, useCanAct, useHandOwner, useLocal } from './localStore';
import { ANIMAL_EMOJI, playerById, sel, sfx, UNIT_ANIMAL, wait, type Animal } from './util';

// ------------------------------------------------------------ card face

const UNIT_LABEL: Record<Card['unit'], string> = { infantry: 'Dog', cavalry: 'Pony', artillery: 'Panda', wild: 'Wild' };

function cardColor(card: Card) {
  return card.territory ? CONTINENTS[TERRITORIES[card.territory].continent].color : '#c9a4ff';
}

export function CardFace({ card }: { card: Card }) {
  const animal = UNIT_ANIMAL[card.unit];
  return (
    <div className={`card-face ${card.unit === 'wild' ? 'wild' : ''}`} style={{ ['--cc' as string]: cardColor(card) }}>
      <div className="card-band">{card.territory ? CONTINENTS[TERRITORIES[card.territory].continent].name : '✨ Wild ✨'}</div>
      <div className="card-art">
        {animal === 'wild'
          ? <span className="wild-trio"><UnitIcon animal="dog" size={30} /><UnitIcon animal="pony" size={34} /><UnitIcon animal="panda" size={30} /></span>
          : <UnitIcon animal={animal} size={58} />}
      </div>
      <div className="card-name">{card.territory ? TERRITORIES[card.territory].name : 'Any unit'}</div>
      <div className="card-unit">{UNIT_LABEL[card.unit]}</div>
    </div>
  );
}

/** Same markup as CardFace, as an HTML string, for imperatively animated clones. */
function cardHTML(card: Card) {
  const icon = (a: Animal, size: number) =>
    `<img class="unit-img" src="/assets/icons/${a}.png" width="${size}" height="${size}" alt="${a}" onerror="this.outerHTML='<span class=&quot;unit-emoji&quot; style=&quot;font-size:${size * 0.8}px&quot;>${ANIMAL_EMOJI[a]}</span>'">`;
  const animal = UNIT_ANIMAL[card.unit];
  const art = animal === 'wild' ? `<span class="wild-trio">${icon('dog', 30)}${icon('pony', 34)}${icon('panda', 30)}</span>` : icon(animal, 58);
  const band = card.territory ? CONTINENTS[TERRITORIES[card.territory].continent].name : '✨ Wild ✨';
  const name = card.territory ? TERRITORIES[card.territory].name : 'Any unit';
  return `<div class="card-face ${card.unit === 'wild' ? 'wild' : ''}" style="--cc:${cardColor(card)}"><div class="card-band">${band}</div><div class="card-art">${art}</div><div class="card-name">${name}</div><div class="card-unit">${UNIT_LABEL[card.unit]}</div></div>`;
}

const CARD_BACK = '<div class="card-back"><span>🐾</span></div>';

// ------------------------------------------------------------ hand

export function CardHand() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const canAct = useCanAct();
  const owner = useHandOwner();
  const open = useUI((s) => s.panels.cards);
  const hideCards = useLocal((s) => s.hideCards);
  const [picked, setPicked] = useState<string[]>([]);
  const handRef = useRef<HTMLDivElement>(null);

  const player = view && owner ? playerById(view, owner) : undefined;
  const hand = useMemo(() => player?.cards ?? [], [player]);
  const handKey = hand.join(',');
  useEffect(() => { setPicked((p) => p.filter((id) => hand.includes(id))); }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMyTurn = !!view && !!player && view.players[view.current].id === player.id;
  const playing = useGame((s) => s.playing?.type);
  const mustTrade = !!view && isMyTurn && view.mustTrade && playing !== 'cardsTraded';
  const sets = view && player ? sel.findSets(view, player.id) : [];
  const suggestion = sets[0] ?? null;

  // auto-select a suggested set when the must-trade modal opens
  useEffect(() => {
    if (mustTrade && suggestion && picked.length === 0) setPicked([...suggestion]);
  }, [mustTrade, suggestion?.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view || !player || player.isNeutral) return null;

  const valid = picked.length === 3 && sel.isValidSet(view, picked);
  const tradePhase = view.phase === 'reinforce' || (view.phase === 'attack' && view.mustTrade);
  const canTrade = valid && canAct && !busy && isMyTurn && tradePhase && !hideCards;
  const value = sel.nextSetValue(view);
  const privacy = localHumanCount() > 1;
  const shown = open || mustTrade;

  const toggle = (id: string) => {
    if (hideCards) return;
    sfx('card');
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
    const el = handRef.current?.querySelector(`[data-card-id="${id}"] .card-inner`);
    if (el) animate(el, { scale: [0.92, 1], duration: 450, ease: 'outElastic(1, .5)' });
  };
  const trade = () => {
    if (!canTrade) return;
    sfx('click');
    useGame.getState().dispatch({ type: 'tradeCards', cards: picked as [string, string, string] });
    setPicked([]);
  };

  const n = hand.length;
  const spread = Math.min(9, 44 / Math.max(1, n));
  const gap = Math.min(78, 420 / Math.max(1, n));

  return (
    <>
      {mustTrade && <div className="modal-backdrop must-trade-backdrop" data-testid="must-trade-backdrop" />}
      <div className={`hand-dock ${shown ? 'open' : ''} ${mustTrade ? 'must-trade' : ''}`} data-testid="card-hand">
        {mustTrade && (
          <div className="must-trade-head" data-testid="must-trade">
            <h3>🃏 Time to trade!</h3>
            <p>You hold {n} cards — trade a set before you continue.</p>
          </div>
        )}
        <div className="hand-bar">
          <button id="ui-hand-anchor" className="hand-tab" onClick={() => !mustTrade && useUI.getState().togglePanel('cards')} data-testid="hand-tab"
            style={{ ['--pc' as string]: player.color }}>
            🃏 {player.name}'s cards <span className="badge static" data-testid="hand-count">{n}</span>
          </button>
          {shown && (
            <>
              <span className="next-set" data-testid="next-set">Next set worth <b>{value}</b></span>
              {privacy && (
                <button className="btn ghost sm" onClick={() => useLocal.getState().set({ hideCards: !hideCards })} data-testid="privacy-toggle">
                  {hideCards ? '👀 Show my cards' : '🙈 Hide cards'}
                </button>
              )}
              {suggestion && !hideCards && (
                <button className="btn ghost sm" onClick={() => setPicked([...suggestion])} data-testid="suggest-set">✨ Suggest set</button>
              )}
              <button className="btn primary sm" disabled={!canTrade} onClick={trade} data-testid="trade-btn">
                Trade for {value} armies
              </button>
            </>
          )}
        </div>
        {shown && (
          <div className="hand-fan" ref={handRef} style={{ width: Math.max(160, gap * (n - 1) + 140) }}>
            {n === 0 && <div className="hand-empty">No cards yet — conquer a territory this turn to earn one!</div>}
            {hand.map((id, i) => {
              const card = view.cards[id];
              if (!card) return null;
              const mid = (n - 1) / 2;
              const rot = (i - mid) * spread;
              const y = Math.abs(i - mid) ** 2 * 2.2;
              const isPicked = picked.includes(id);
              const isSuggested = !!suggestion?.includes(id) && picked.length === 0;
              return (
                <button key={id} className={`hand-card ${isPicked ? 'picked' : ''} ${isSuggested ? 'suggested' : ''}`} data-card-id={id}
                  data-testid={`card-${id}`} onClick={() => toggle(id)} aria-pressed={isPicked}
                  style={{ ['--x' as string]: `${i * gap}px`, ['--y' as string]: `${y}px`, ['--rot' as string]: `${rot}deg`, zIndex: i + 1 }}>
                  <div className="card-inner">{hideCards ? <div className="card-back"><span>🐾</span></div> : <CardFace card={card} />}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function DeckPile() {
  const n = useGame((s) => s.view?.deck.length ?? 0);
  const view = useGame((s) => s.view);
  if (!view) return null;
  return (
    <div className="deck-pile" id="ui-deck" data-testid="deck-pile" title={`${n} cards in the deck`}>
      <div className="deck-card d3" /><div className="deck-card d2" /><div className="deck-card d1"><span>🐾</span></div>
      <span className="deck-count">{n}</span>
    </div>
  );
}

// ------------------------------------------------------------ FX

function fxLayer(): HTMLElement {
  let el = document.getElementById('ui-fx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ui-fx';
    el.className = 'fx-layer';
    document.body.appendChild(el);
  }
  return el;
}

function centerOf(el: Element | null, fallback: { x: number; y: number }) {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return fallback;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const CARD_W = 110;
const CARD_H = 154;

function makeFxCard(card: Card | undefined, faceUp: boolean, at: { x: number; y: number }) {
  const el = document.createElement('div');
  el.className = 'fx-card';
  el.style.left = `${at.x - CARD_W / 2}px`;
  el.style.top = `${at.y - CARD_H / 2}px`;
  el.innerHTML = `<div class="fx-flip" style="transform: rotateY(${faceUp ? 0 : 180}deg)"><div class="fx-front">${card ? cardHTML(card) : CARD_BACK}</div><div class="fx-back">${CARD_BACK}</div></div>`;
  fxLayer().appendChild(el);
  return el;
}

async function playCardDrawn(cardId: string, playerId: string, after: GameState, speed: number) {
  const card = after.cards[cardId];
  const visible = handOwnerNow() === playerId && !useLocal.getState().hideCards;
  const from = centerOf(document.getElementById('ui-deck'), { x: innerWidth - 70, y: innerHeight - 90 });
  const target = visible ? document.getElementById('ui-hand-anchor') : document.querySelector(`[data-testid="score-row-${playerId}"]`);
  const to = centerOf(target, { x: 120, y: innerHeight - 60 });
  const el = makeFxCard(card, false, from);
  const flip = el.querySelector('.fx-flip') as HTMLElement;
  const d = (ms: number) => ms / speed;
  sfx('cardDraw');
  const mid = { x: innerWidth / 2 + (from.x - innerWidth / 2) * 0.35, y: innerHeight * 0.45 };
  const tl = createTimeline({ defaults: { ease: 'inOutQuad' } });
  tl.add(el, { x: mid.x - from.x, y: mid.y - from.y, scale: [0.6, 1.25], rotate: [-12, 4], duration: d(520), ease: 'outCubic' });
  if (visible) tl.add(flip, { rotateY: [180, 0], duration: d(380), ease: 'outBack(1.6)' });
  tl.add(el, { x: to.x - from.x, y: to.y - from.y, scale: 0.35, rotate: 0, opacity: [1, 0.2], duration: d(480), ease: 'inBack(1.2)', delay: d(visible ? 280 : 60) });
  await tl.then(() => undefined);
  el.remove();
  if (visible) {
    const tab = document.getElementById('ui-hand-anchor');
    if (tab) animate(tab, { scale: [1.25, 1], duration: d(500), ease: 'outElastic(1, .5)' });
  }
}

async function playCardsTraded(cards: string[], playerId: string, armies: number, after: GameState, speed: number) {
  const d = (ms: number) => ms / speed;
  const visible = handOwnerNow() === playerId && !useLocal.getState().hideCards;
  const fallback = centerOf(document.querySelector(`[data-testid="score-row-${playerId}"]`), { x: 150, y: 200 });
  const center = { x: innerWidth / 2, y: innerHeight * 0.42 };
  const els = cards.map((id, i) => {
    const handEl = visible ? document.querySelector(`[data-card-id="${id}"]`) : null;
    const start = centerOf(handEl, { x: fallback.x + (i - 1) * 30, y: fallback.y });
    if (handEl instanceof HTMLElement) handEl.style.visibility = 'hidden';
    const el = makeFxCard(after.cards[id], true, start);
    return { el, start };
  });
  sfx('trade');
  await Promise.all(els.map(({ el, start }, i) => animate(el, {
    x: center.x - start.x + (i - 1) * 120, y: center.y - start.y, rotate: (i - 1) * 8, scale: [0.8, 1.1],
    duration: d(600), delay: d(i * 90), ease: 'outBack(1.4)',
  }).then(() => undefined)));
  await wait(d(220));
  await Promise.all(els.map(({ el, start }) => animate(el, {
    x: center.x - start.x, y: center.y - start.y, rotate: 0, scale: [1.1, 0.2], opacity: [1, 0], duration: d(420), ease: 'inBack(1.6)',
  }).then(() => undefined)));
  els.forEach(({ el }) => el.remove());

  // sparkle burst + "+N armies"
  const layer = fxLayer();
  const sparks: HTMLElement[] = [];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('div');
    s.className = 'fx-spark';
    s.textContent = i % 3 === 0 ? '✨' : i % 3 === 1 ? '⭐' : '💖';
    s.style.left = `${center.x}px`;
    s.style.top = `${center.y}px`;
    layer.appendChild(s);
    sparks.push(s);
  }
  const pop = document.createElement('div');
  pop.className = 'fx-pop';
  pop.style.left = `${center.x}px`;
  pop.style.top = `${center.y}px`;
  const color = playerById(after, playerId)?.color ?? '#ff7aa2';
  pop.style.setProperty('--pc', color);
  pop.textContent = `+${armies} armies!`;
  layer.appendChild(pop);
  sfx('sparkle');
  const burst = animate(sparks, {
    x: () => (Math.random() - 0.5) * 360, y: () => (Math.random() - 0.5) * 260, scale: [0.4, 1.4], opacity: [1, 0],
    rotate: () => (Math.random() - 0.5) * 360, duration: d(900), delay: stagger(d(15)), ease: 'outExpo',
  }).then(() => undefined);
  const popAnim = createTimeline()
    .add(pop, { scale: [0, 1.25], opacity: [0, 1], duration: d(380), ease: 'outBack(2)' })
    .add(pop, { scale: 1, duration: d(200) })
    .add(pop, { y: -40, opacity: 0, duration: d(380), delay: d(380), ease: 'inQuad' })
    .then(() => undefined);
  await Promise.all([burst, popAnim]);
  sparks.forEach((s) => s.remove());
  pop.remove();
}

/** Registers the card animations with the director. Mount once. */
export function CardFx() {
  useEffect(() => {
    const offs = [
      onEvent('cardDrawn', (ev, ctx) => playCardDrawn(ev.card, ev.player, ctx.after, ctx.speed)),
      onEvent('cardsTraded', (ev, ctx) => playCardsTraded(ev.cards, ev.player, ev.armies, ctx.after, ctx.speed)),
    ];
    return () => { offs.forEach((o) => o()); document.getElementById('ui-fx')?.replaceChildren(); };
  }, []);
  return null;
}
