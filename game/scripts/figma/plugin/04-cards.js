// use_figma script — stage 3d: Cards board (card face/back, hand card states, deck pile, hand bar, fanned hand).
// Source: src/ui/CardHand.tsx + ".cards" rules in ui.css. Depends on 02/03 ids.
/*LIB*/
const sets = await components({ unit: 'Unit icon', badge: 'Badge', buttonSmall: 'Button Small', playerChip: 'Player chip' }); // by name — no node ids
const variantOf = (k, name) => sets[k].children.find((c) => c.name === name);
const propKey = (set, name) => Object.keys(set.componentPropertyDefinitions).find((k) => k.startsWith(name + '#'));
const ids = {};
const B = await board('Cards', 'Territory cards (src/ui/CardHand.tsx). Band + art colour = continent (cont/<Id>/*), unit art = Unit icon. Hand cards fan with rotate((i − mid) × min(9°, 44°/n)) around 50% 120%, x = i × min(78, 420/n), y = |i − mid|² × 2.2.');

/** CSS-style transform: translate(x, y) rotate(deg) about pivot (px, py), on top of base (bx, by). */
function place(node, { x = 0, y = 0, deg = 0, px = 0, py = 0, bx = 0, by = 0 }) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  node.relativeTransform = [[c, -s, bx + x + px - (c * px - s * py)], [s, c, by + y + py - (s * px + c * py)]];
}

// ---------------------------------------------------------------- Card face
let faceSet;
{
  const g = await group(B, 'Card face', '.card-face — 110×154. Band: continent name (bound to cont/<Id>/name). Art: radial white → cont tint. Name 12/600, unit label 10 uppercase. Wild: pastel gradient + rainbow band + the three animals.');
  const cs = [], terr = [];
  for (const [unit, label, territory] of [['Dog', 'Dog', 'Western Europe'], ['Pony', 'Pony', 'Southern Europe'], ['Panda', 'Panda', 'Greenland'], ['Wild', 'Wild', 'Any unit']]) {
    const wild = unit === 'Wild';
    const c = CMP('V', { name: `Unit=${unit}`, cross: 'CENTER', r: 14, clip: true, w: 110, h: 154, fill: 'surface/paper' });
    if (wild) await paintStyle(c, 'Gradient/Wild card');
    stroke(c, 'surface/tag', 1, 'INSIDE'); await fx(c, 'Shadow/Card');
    const band = AL('H', { name: 'Band', main: 'CENTER', pad: [5, 0] });
    if (wild) await paintStyle(band, 'Gradient/Wild band'); else fill(band, 'cont/Asia/base');
    const bt = await T('Asia', 'Micro/Band 10', 'text/on-accent', { name: 'Continent' });
    bt.setBoundVariable('characters', vr(wild ? 'cont/Wild/name' : 'cont/Asia/name'));
    bt.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 1 }, radius: 1, spread: 0, visible: true, blendMode: 'NORMAL' }];
    add(band, bt); c.appendChild(band); grow(band);
    const wrap = AL('V', { name: 'Art wrap', pad: [6, 7, 2, 7] }); c.appendChild(wrap); grow(wrap); wrap.layoutGrow = 1;
    const art = AL('H', { name: 'Art', main: 'CENTER', cross: wild ? 'MAX' : 'CENTER', r: 10 });
    art.fills = [gradient('RADIAL', [[0, 'surface/white'], [1, wild ? 'cont/Wild/tint-18' : 'cont/Asia/tint-18']], [[1, 0, 0], [0, 1, -0.1]])];
    wrap.appendChild(art); grow(art, true, true);
    if (wild) { art.paddingBottom = 18; for (const [a, s] of [['Dog', 30], ['Pony', 34], ['Panda', 30]]) { const i = variantOf('unit', `Animal=${a}`).createInstance(); i.resize(s, s); art.appendChild(i); } }
    else { const i = variantOf('unit', `Animal=${unit}`).createInstance(); i.resize(58, 58); art.appendChild(i); }
    const nm = AL('H', { name: 'Name', main: 'CENTER', cross: 'CENTER', pad: [0, 6], h: 28 }); c.appendChild(nm); grow(nm);
    const nt = await T(territory, 'Caption/12 strong', 'text/primary', { name: 'Territory', align: 'CENTER' }); nt.lineHeight = { unit: 'PERCENT', value: 115 };
    nm.appendChild(nt);
    const ut = await T(label, 'Micro/Unit 10', 'text/secondary', { name: 'Unit' });
    const uw = AL('H', { name: 'Unit label', main: 'CENTER', pad: [0, 0, 6, 0] }); add(uw, ut); c.appendChild(uw); grow(uw);
    cs.push(c); terr.push(nt);
  }
  faceSet = variantSet(cs, 'Card face', g, { w: 600, gap: 24, pad: 28 });
  const k = faceSet.addComponentProperty('Territory', 'TEXT', 'Western Europe');
  terr.forEach((t, i) => { if (i < 3) t.componentPropertyReferences = { characters: k }; });
  ids.cardFace = faceSet.id;
}

// ---------------------------------------------------------------- Card back + deck pile
let back;
{
  const g = await group(B, 'Card back & deck', '.card-back — repeating 45° pink stripes, 5px white inset frame, 🐾. Deck pile: three stacked backs (rotated 0° / 3° / 6°) and the remaining-card counter.');
  back = CMP('H', { name: 'Card back', main: 'CENTER', cross: 'CENTER', r: 14, clip: true, w: 110, h: 154, description: 'Hidden card (hotseat privacy) and the FX flip back face.' });
  back.fills = [stripes('card/stripe-a', 'card/stripe-b', 20 / 1.414, 190)];
  stroke(back, 'surface/white', 5, 'INSIDE'); await fx(back, 'Shadow/Card');
  add(back, await E('🐾', 40, 'Paw'));
  g.appendChild(back); ids.cardBack = back.id;

  const deck = figma.createComponent(); deck.name = 'Deck pile'; deck.resize(84, 114); deck.fills = []; deck.clipsContent = false;
  deck.description = '.deck-pile — bottom-right, 76×106; count = cards left in the draw pile. id="ui-deck" is the start point of the draw animation.';
  for (const [i, deg, off] of [[3, 6, 6], [2, 3, 3], [1, 0, 0]]) {
    const card = AL('H', { name: `Deck card ${i}`, main: 'CENTER', cross: 'CENTER', r: 12, clip: true, w: 76, h: 106 });
    card.fills = [stripes('card/stripe-a', 'card/stripe-b', 16 / 1.414, 130)];
    stroke(card, 'surface/white', 4, 'INSIDE'); await fx(card, 'Shadow/Card');
    if (i === 1) add(card, await E('🐾', 28, 'Paw'));
    deck.appendChild(card); place(card, { x: off, y: off, deg, px: 38, py: 53, bx: 8, by: 8 });
  }
  const count = AL('H', { name: 'Count', main: 'CENTER', cross: 'CENTER', r: 999, fill: 'surface/white', pad: [0, 6] });
  count.resize(26, 26); count.primaryAxisSizingMode = 'AUTO'; await fx(count, 'Shadow/Deck count');
  const ct = await T('41', 'Number/Deck 13', 'text/primary', { name: 'Count' }); add(count, ct); deck.appendChild(count); count.x = 0; count.y = 0; count.minWidth = 26;
  textProp(deck, 'Count', '41', ct);
  g.appendChild(deck); ids.deck = deck.id;
}

// ---------------------------------------------------------------- Hand card states
let handSet;
{
  const g = await group(B, 'Hand card', '.hand-card — a card in the fan. Hover lifts 22px, Picked lifts 34px + pink ring, Suggested = sun ring + glow pulse (1.6s), Hidden = privacy back (hotseat).');
  const cs = [];
  for (const [state, lift, effect] of [['Default', 0, null], ['Hover', 22, null], ['Picked', 34, 'Shadow/Card picked'], ['Suggested', 0, 'Shadow/Card suggested'], ['Hidden', 0, null]]) {
    const c = figma.createComponent(); c.name = `State=${state}`; c.resize(110, 188); c.fills = []; c.clipsContent = false;
    const card = state === 'Hidden' ? back.createInstance() : faceSet.defaultVariant.createInstance();
    c.appendChild(card); card.x = 0; card.y = 188 - 4 - 154 - lift;
    if (effect) await fx(card, effect);
    cs.push(c);
  }
  handSet = variantSet(cs, 'Hand card', g, { w: 760, gap: 28, pad: 28, cross: 'MAX' });
  ids.handCard = handSet.id;
}

// ---------------------------------------------------------------- Hand tab + hand bar + empty
let tab, barSet;
{
  const g = await group(B, 'Hand bar', '.hand-bar — bottom-left dock: hand tab (player tint + count badge), "Next set worth N", privacy toggle (2+ local humans), ✨ Suggest set, Trade for N armies. Closed shows only the tab.');
  tab = CMP('H', { name: 'Hand tab', gap: 6, pad: [7, 14], r: 999, fill: 'team/Crimson/tint-18', description: '.hand-tab — toggles the cards panel; id="ui-hand-anchor" is where drawn cards fly to.' });
  const tl = await T("🃏 Lena's cards", 'Body/Small strong 14', 'text/primary', { name: 'Label' });
  const badge = sets.badge.defaultVariant.createInstance(); badge.setProperties({ [propKey(sets.badge, 'Count')]: '5' });
  add(tab, tl, badge); textProp(tab, 'Label', "🃏 Lena's cards", tl);
  badge.isExposedInstance = true;
  g.appendChild(tab); ids.handTab = tab.id;

  const btnSmall = (style, label) => { const i = variantOf('buttonSmall', `Style=${style}, State=Default`).createInstance(); i.setProperties({ [propKey(sets.buttonSmall, 'Label')]: label }); return i; };
  const bars = [];
  for (const state of ['Closed', 'Open', 'Open + privacy', 'Disabled trade']) {
    const c = CMP('H', { name: `State=${state}`, gap: 8, pad: 6, r: 999, fill: 'surface/panel', wrap: true, wrapGap: 8 }); // .hand-bar flex-wrap
    await fx(c, 'Shadow/Panel');
    c.appendChild(tab.createInstance());
    if (state !== 'Closed') {
      const ns = await T('Next set worth 4', 'Label/13 regular', 'text/secondary', { name: 'Next set' });
      ns.setRangeFontSize(15, 16, 15); ns.setRangeFontName(15, 16, { family: 'Fredoka', style: 'SemiBold' });
      ns.setRangeFills(15, 16, [solid('text/accent')]);
      const nsw = AL('H', { name: 'Next set wrap', pad: [0, 4] }); add(nsw, ns); c.appendChild(nsw);
      if (state === 'Open + privacy') c.appendChild(btnSmall('Ghost', '🙈 Hide cards'));
      c.appendChild(btnSmall('Ghost', '✨ Suggest set'));
      const trade = variantOf('buttonSmall', `Style=Primary, State=${state === 'Disabled trade' ? 'Disabled' : 'Default'}`).createInstance();
      trade.setProperties({ [propKey(sets.buttonSmall, 'Label')]: 'Trade for 4 armies' }); c.appendChild(trade);
    }
    bars.push(c);
  }
  barSet = variantSet(bars, 'Hand bar', g, { w: 760, cross: 'MIN' });
  ids.handBar = barSet.id;

  const empty = CMP('H', { name: 'Hand empty', pad: 20, r: 20, fill: 'surface/panel', w: 260, description: '.hand-empty — shown in the fan when the hand has no cards.' });
  add(empty, await T('No cards yet — conquer a territory this turn to earn one!', 'Body/Small 14', 'text/secondary', { name: 'Text', w: 220 }));
  g.appendChild(empty); ids.handEmpty = empty.id;
}

// ---------------------------------------------------------------- Card hand (fan) — dock states
{
  const g = await group(B, 'Card hand', 'CardHand dock (bottom-left): Closed (tab only), Open (fan above the bar), Must trade (centred modal over a scrim — cannot be dismissed, suggested set pre-picked).');
  const HAND = [['Western Europe', 'Dog', 'Europe'], ['Southern Europe', 'Pony', 'Europe'], ['Greenland', 'Panda', 'NorthAmerica'], ['Any unit', 'Wild', 'Wild'], ['Peru', 'Pony', 'SouthAmerica']];
  const kT = propKey(faceSet, 'Territory');
  async function fan(states) {
    const n = HAND.length, mid = (n - 1) / 2, spread = Math.min(9, 44 / n), gap = Math.min(78, 420 / n);
    const f = figma.createFrame(); f.name = 'Hand fan'; f.fills = []; f.clipsContent = false; f.resize(Math.max(160, gap * (n - 1) + 140), 188);
    HAND.forEach(([territory, unit, cont], i) => {
      const hc = handSet.children.find((v) => v.name === `State=${states[i] ?? 'Default'}`).createInstance();
      const face = hc.findOne((x) => x.type === 'INSTANCE');
      if (face && face.mainComponent?.parent?.id === faceSet.id) {
        face.swapComponent(faceSet.children.find((v) => v.name === `Unit=${unit}`));
        if (unit !== 'Wild') { face.setProperties({ [kT]: territory }); retint(face, 'Asia', cont, 'cont'); }
      }
      f.appendChild(hc);
      place(hc, { x: i * gap, y: Math.abs(i - mid) ** 2 * 2.2, deg: (i - mid) * spread, px: 55, py: 154 * 1.2 + 30 });
    });
    return f;
  }
  const docks = [];
  for (const state of ['Closed', 'Open', 'Must trade', 'Must trade (narrow)']) {
    const c = CMP('V', { name: `State=${state}`, gap: 6, cross: state.startsWith('Must trade') ? 'CENTER' : 'MIN' });
    if (state.startsWith('Must trade')) {
      fill(c, 'surface/solid'); pad(c, 18, 22, 34, 22); radius(c, 28); await fx(c, 'Shadow/Modal');
      const head = AL('V', { name: 'Must trade head', cross: 'CENTER', gap: 4 });
      add(head, await T('🃏 Time to trade!', 'Heading/Must trade 24', 'text/primary'), await T('You hold 5 cards — trade a set before you continue.', 'Body/Default 15', 'text/secondary'));
      c.appendChild(head);
      const bar = barSet.children.find((v) => v.name === 'State=Open').createInstance(); c.appendChild(bar);
      if (state.endsWith('(narrow)')) bar.resize(468, bar.height); // dock is left: 50% → 50vw − 44px at 1024px, the bar wraps
      const f = await fan(['Picked', 'Picked', 'Picked']); c.appendChild(f); f.layoutPositioning = 'AUTO';
      c.itemSpacing = 6;
    } else {
      if (state === 'Open') { const f = await fan(['Default', 'Default', 'Suggested', 'Suggested', 'Suggested']); c.appendChild(f); }
      c.appendChild(barSet.children.find((v) => v.name === (state === 'Open' ? 'State=Open' : 'State=Closed')).createInstance());
    }
    docks.push(c);
  }
  // fan sits 34px in from the dock edge (.hand-fan margin-left: 34px)
  for (const d of docks) { const f = d.findOne((x) => x.name === 'Hand fan'); if (f && d.name === 'State=Open') { const w = AL('H', { name: 'Fan offset', pad: [0, 0, 0, 34] }); d.insertChild(0, w); w.appendChild(f); } }
  ids.cardHand = variantSet(docks, 'Card hand', g, { w: 1400, gap: 40, pad: 40, cross: 'MAX' }).id;
}

await snap(B, 0.5);
return { ids, made: made.length, board: B.id };
