// use_figma script — stage 3i: 3D UI board — the interface elements drawn inside the WebGL scene (not the
// 3D assets themselves). Sources: scene/Pawns.tsx (count badges, owner rings), scene/Labels.tsx,
// scene/Effects.tsx (floating +N / −N, star burst), scene/AttackArcs.tsx, scene/Board.tsx (tile
// highlight emissive), dice/DiceLayer.tsx (loss labels). World units are converted at 1 m = 1052.6 px,
// the scale at which a count badge is 20 px tall on a 1440×900 overview.
/*LIB*/
const PX = 20 / 0.019; // px per metre
const ids = {};
const B = await board('3D UI', 'In-scene interface (three.js / drei <Text>, <Billboard>, <Html>): army count badges, territory labels, floating +N / −N, dice loss labels, attack / fortify arcs, owner rings and tile highlight states. Sizes are given at the overview zoom; badges scale 0.85–1.9× and labels fade with camera distance.');

function bindVectors(node, fillVar, strokeVar) {
  for (const v of node.findAll((x) => x.type === 'VECTOR' || x.type === 'ELLIPSE' || x.type === 'RECTANGLE')) {
    if (fillVar && v.fills.length) v.fills = [solid(fillVar)];
    if (strokeVar && v.strokes.length) v.strokes = [solid(strokeVar)];
  }
}

// ---------------------------------------------------------------- Army count badge
{
  const g = await group(B, 'Army count badge', 'Pawns.tsx <Badge> — billboarded pill above each territory: player colour, white outline ring (+3.5 mm), count in Fredoka SemiBold white with a 35% dark outline. Pill width grows with digits (22 / 30 / 38 mm). Hover: +15% scale and lift. Rendered on top (depthTest off).');
  const cs = [];
  for (const [digits, wM, label] of [[1, 0.022, '7'], [2, 0.03, '12'], [3, 0.038, '105']]) {
    const w = Math.round(wM * PX * 10) / 10, h = 20;
    const c = CMP('H', { name: `Digits=${digits}`, main: 'CENTER', cross: 'CENTER', r: 999, fill: 'team/Crimson/base' });
    c.resize(w, h); c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
    stroke(c, 'scene/badge-outline', 1.8, 'OUTSIDE');
    const t = await T(label, 'Body/Strong 16', 'text/on-accent', { name: 'Count' }); t.fontSize = Math.round(0.015 * PX * 10) / 10;
    stroke(t, 'scene/outline-dark', 1.2, 'OUTSIDE'); t.strokes = [{ ...t.strokes[0], opacity: 0.35 }];
    add(c, t); cs.push(c);
  }
  const set = variantSet(cs, 'Army count badge', g, { w: 300, gap: 20, pad: 24, bg: 'accent/sky' });
  ids.armyBadge = set.id;
}

// ---------------------------------------------------------------- Territory label
{
  const g = await group(B, 'Territory label', 'Labels.tsx — territory name lying flat on the tile south of the marker (rotated −90° on X, so it reads in perspective in-game), white Fredoka SemiBold 10.5 mm (≈11 px), 1.2 mm dark outline at 80%. Fully visible zoomed in, hidden at the overview; the hovered territory is always readable. Toggle in Settings → Territory labels.');
  const cs = [];
  for (const [state, op] of [['Visible', 1], ['Fading', 0.45], ['Hovered', 1]]) {
    const c = CMP('H', { name: `State=${state}`, main: 'CENTER', pad: [4, 8] });
    const t = await T('Western Europe', 'Caption/12 strong', 'text/on-accent', { name: 'Name', align: 'CENTER' }); t.fontSize = Math.round(0.0105 * PX * 10) / 10;
    stroke(t, 'scene/label-outline', 1.3, 'OUTSIDE'); t.strokes = [{ ...t.strokes[0], opacity: 0.8 }];
    t.opacity = op; if (state === 'Hovered') c.paddingBottom = 7;
    add(c, t); cs.push(c);
  }
  const set = variantSet(cs, 'Territory label', g, { w: 460, gap: 20, pad: 24, bg: 'cont/Europe/base' });
  const k = set.addComponentProperty('Name', 'TEXT', 'Western Europe'); for (const v of set.children) v.findOne((n) => n.type === 'TEXT').componentPropertyReferences = { characters: k };
  ids.territoryLabel = set.id;
}

// ---------------------------------------------------------------- Floating text
{
  const g = await group(B, 'Floating text', 'Effects.tsx <FloatingText> — billboarded 26 mm (≈27 px) number with a white 2.5 mm outline: +N in the player colour when armies are placed, −N in attack red (#ff3b3b) on battle losses. Rises 30 mm with outBack(2), fades 20% in / 45% hold / 35% out, 1 s ÷ speed.');
  const cs = [];
  for (const [kind, text, color] of [['Gain', '+3', 'team/Crimson/base'], ['Loss', '-2', 'scene/attack']]) {
    const c = CMP('H', { name: `Kind=${kind}`, main: 'CENTER', pad: [4, 8] });
    const t = await T(text, 'Display/Title 40', color, { name: 'Text' }); t.fontName = { family: 'Fredoka', style: 'SemiBold' }; t.fontSize = Math.round(0.026 * PX);
    stroke(t, 'scene/badge-outline', 2.6, 'OUTSIDE');
    add(c, t); cs.push(c);
  }
  const set = variantSet(cs, 'Floating text', g, { w: 300, gap: 20, pad: 24, bg: 'accent/sky' });
  const k = set.addComponentProperty('Text', 'TEXT', '+3'); for (const v of set.children) v.findOne((n) => n.type === 'TEXT').componentPropertyReferences = { characters: k };
  ids.floatingText = set.id;
}

// ---------------------------------------------------------------- Dice loss label
{
  const g = await group(B, 'Dice loss label', 'DiceLayer.tsx <LossLabel> — drei <Html> over each dice row after a roll: 30px bold white in the side\'s colour, 3px white border, hard drop + soft shadow, pops in (.35s overshoot). Attacker row at the back, defender at the front.');
  const cs = [];
  for (const [side, team, text] of [['Attacker', 'Crimson', '-1'], ['Defender', 'Azure', '-2']]) {
    const c = CMP('H', { name: `Side=${side}`, main: 'CENTER', pad: [4, 12, 6, 12], r: 999, fill: `team/${team}/base` });
    stroke(c, 'surface/white', 3, 'INSIDE'); await fx(c, 'Shadow/Dice loss');
    const t = await T(text, 'Number/Loss 30', 'text/on-accent', { name: 'Text' }); t.lineHeight = { unit: 'PERCENT', value: 100 };
    t.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 2 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' }];
    add(c, t); cs.push(c);
  }
  const set = variantSet(cs, 'Dice loss label', g, { w: 300, gap: 20, pad: 24 });
  const k = set.addComponentProperty('Text', 'TEXT', '-1'); for (const v of set.children) v.findOne((n) => n.type === 'TEXT').componentPropertyReferences = { characters: k };
  ids.lossLabel = set.id;
}

// ---------------------------------------------------------------- Arcs
{
  const g = await group(B, 'Attack & fortify arcs', 'AttackArcs.tsx — dashed quadratic arc from source to target (height 0.09 + 0.3 × distance) with a cone arrowhead that pulses. Two layers: a dark under-stroke (#1d2433, width + 3.5, 35%) and the colour dash (19 / 10.5 px, scrolling). Attack = attacker colour, Fortify = #5CF59A, Preview (hovering a valid target) = 55% opacity, width 4. Wrapping pairs (Alaska ⇄ Kamchatka) leave and re-enter at the board edge.');
  const cs = [];
  for (const [kind, colorVar, width, opacity] of [['Attack', 'team/Crimson/base', 6, 1], ['Fortify', 'scene/fortify', 6, 1], ['Preview', 'team/Crimson/base', 4, 0.55], ['Battle', 'team/Crimson/base', 6, 0.95]]) {
    const c = figma.createComponent(); c.name = `Kind=${kind}`; c.resize(260, 120); c.fills = [];
    const path = 'M14 104 Q130 -14 236 92';
    const under = svg(260, 120, `<path d="${path}" fill="none" stroke="#1d2433" stroke-width="${width + 3.5}" stroke-linecap="round" stroke-dasharray="19 10.5"/>`);
    under.name = 'Under-stroke'; under.opacity = 0.35 * opacity; bindVectors(under, null, 'scene/outline-dark');
    const line = svg(260, 120, `<path d="${path}" fill="none" stroke="#E63946" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="19 10.5"/>`);
    line.name = 'Dash'; line.opacity = opacity; bindVectors(line, null, colorVar);
    const head = svg(24, 26, '<path d="M12 26 L0 0 L24 0 Z" fill="#E63946"/>'); head.name = 'Arrowhead'; head.opacity = opacity; bindVectors(head, colorVar, null);
    for (const n of [under, line, head]) { n.fills = []; c.appendChild(n); }
    under.x = 0; under.y = 0; line.x = 0; line.y = 0; head.x = 228; head.y = 78; head.rotation = 40;
    cs.push(c);
  }
  ids.arcs = variantSet(cs, 'Arc', g, { w: 1180, gap: 24, pad: 28, bg: 'accent/sky' }).id;
}

// ---------------------------------------------------------------- Owner ring + tile highlights + burst
{
  const g = await group(B, 'Owner ring, tile highlights & burst', 'Pawns.tsx owner ring — torus around the marker disc in the owner colour (emissive 25%), cross-fades from the old owner on conquest with a 35% scale pulse. Board.tsx tile highlight = emissive tint × intensity (pulsing): Selected warm yellow .32–.44, attack target red .5–.7, attack candidates red .18–.40, fortify targets green, actionable cream .06–.16, hover +white .16 and lifts the tile, conquest flash red. Effects.tsx star burst: 22 octahedra in white / gold / player colour.');
  const ring = figma.createComponent(); ring.name = 'Owner ring'; ring.resize(44, 44); ring.fills = [];
  const e = figma.createEllipse(); e.resize(40, 40); e.x = 2; e.y = 2; e.fills = []; stroke(e, 'team/Crimson/base', 4, 'CENTER'); e.name = 'Torus'; ring.appendChild(e);
  ring.description = 'Pawns.tsx OwnerRings (torus r 18.5 mm, tube 1.9 mm).';
  g.appendChild(ring); ids.ownerRing = ring.id;

  const tiles = [];
  const HL = [['Idle', null, 0], ['Actionable', 'surface/hint', 0.5], ['Hover', 'surface/white', 0.35], ['Selected', 'accent/sun', 0.55], ['Attack candidate', 'scene/attack', 0.3], ['Attack target', 'scene/attack', 0.6], ['Fortify target', 'scene/fortify', 0.45], ['Conquest flash', 'scene/attack', 0.85]];
  for (const [state, tint, a] of HL) {
    const c = figma.createComponent(); c.name = `State=${state}`; c.resize(120, 84); c.fills = [];
    const tile = svg(120, 84, '<path d="M14 6 L92 2 L116 30 L104 78 L30 82 L4 46 Z" fill="#368A47" stroke="#2a5d34" stroke-width="2" stroke-linejoin="round"/>');
    tile.name = 'Tile'; bindVectors(tile, 'cont/Asia/base', null); c.appendChild(tile);
    if (tint) { const ov = svg(120, 84, '<path d="M14 6 L92 2 L116 30 L104 78 L30 82 L4 46 Z" fill="#ffffff"/>'); ov.name = 'Emissive'; bindVectors(ov, tint, null); ov.opacity = a; c.appendChild(ov); }
    if (state === 'Hover' || state === 'Selected') tile.y = -3;
    tiles.push(c);
  }
  ids.tileHighlight = variantSet(tiles, 'Tile highlight', g, { w: 1180, gap: 24, pad: 28 }).id;

  const burst = figma.createComponent(); burst.name = 'Star burst'; burst.resize(160, 160); burst.fills = [];
  burst.description = 'Effects.tsx <Burst> — 22 octahedron sparks (white / gold #ffd84d / player colour) shot up and out on conquest, 1 s.';
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const d = svg(10, 10, '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#ffffff"/>'); d.name = `Spark ${i + 1}`;
    bindVectors(d, ['surface/white', 'scene/burst-gold', 'team/Crimson/base'][i % 3], null);
    const ang = (i / 22) * Math.PI * 2; const r = 20 + rnd() * 55; d.x = 75 + Math.cos(ang) * r; d.y = 75 + Math.sin(ang) * r * 0.8 - 10; d.rotation = rnd() * 90;
    burst.appendChild(d);
  }
  g.appendChild(burst); ids.starBurst = burst.id;
}

await snap(B, 0.5);
return { ids, made: made.length, board: B.id };
