// use_figma script — stage 3f: HUD + Overlays board. Source: src/ui/HUD.tsx, TurnBanner.tsx (banner, curtain,
// popups), Toasts.tsx, GameOver.tsx, CardHand.tsx (FX layer) and the matching ui.css sections.
/*LIB*/
const S = await components({ iconButton: 'Icon button', button: 'Button', buttonBig: 'Button Big', buttonSmall: 'Button Small', segOption: 'Seg option', playerChip: 'Player chip', step: 'Phase step', stepArrow: 'Step arrow', unit: 'Unit icon', dot: 'Chip dot', badge: 'Badge', chipTag: 'Chip tag' }); // by name — no node ids
const vOf = (k, name) => (S[k].type === 'COMPONENT_SET' ? (name ? S[k].children.find((c) => c.name === name) : S[k].defaultVariant) : S[k]);
const I = (k, name) => { const m = vOf(k, name); if (!m) throw new Error(`variant "${name}" not found in ${S[k].name}`); return m.createInstance(); };
const pk = (k, name) => Object.keys(S[k].componentPropertyDefinitions).find((x) => x.startsWith(name + '#'));
const setP = (inst, k, props) => { const o = {}; for (const [n, v] of Object.entries(props)) o[pk(k, n)] = v; inst.setProperties(o); return inst; };
const btn = (k, style, label, state = 'Default') => setP(I(k, `Style=${style}, State=${state}`), k, { Label: label });
const ids = {};
const B = await board('HUD & overlays', 'Top bar, instruction bar, turn banner, hot-seat curtain, popups / toasts, game over and the FX layer. Player colour via team/<Colour>/* (retint instances), continent pills via cont/<Id>/*.');

// ---------------------------------------------------------------- HUD top bar
{
  const g = await group(B, 'HUD top bar', '.hud-top — fixed 12px from the top / sides, 56px pill. Left: turn chip + round (hidden ≤1280). Centre: phase steps (or the setup / game-over step). Right: panel toggles (🏆 🃏 🗺️ 📜 💾 ❓ ⚙️; 💾 only in local games) with badges for cards and save status.');
  const TOGGLES = [['🏆', true, false], ['🃏', false, true], ['🗺️', false, false], ['📜', false, false], ['💾', false, false], ['❓', false, false], ['⚙️', false, false]];
  const STEPS = [['Reinforce', '🐶'], ['Attack', '⚔️'], ['Fortify', '🏰']];
  const cs = [];
  for (const phase of ['Reinforce', 'Attack', 'Fortify', 'Claim', 'Deploy', 'Game over']) {
    const c = CMP('H', { name: `Phase=${phase}`, gap: 12, pad: [0, 8, 0, 10], r: 999, fill: 'surface/panel', w: 1416, h: 56 });
    stroke(c, 'border/glass', 1, 'INSIDE'); await fx(c, 'Elevation/Glass panel');
    const left = AL('H', { name: 'Turn', gap: 10 });
    add(left, setP(I('playerChip', 'Size=HUD'), 'playerChip', { Name: 'Lena' }), await T(phase === 'Claim' || phase === 'Deploy' ? 'Round 1' : phase === 'Game over' ? 'Round 23' : 'Round 4', 'Body/Small 14', 'text/secondary', { name: 'Round' }));
    const steps = AL('H', { name: 'Steps', gap: 4, main: 'CENTER' });
    if (['Reinforce', 'Attack', 'Fortify'].includes(phase)) {
      const cur = STEPS.findIndex(([l]) => l === phase);
      STEPS.forEach(([label, icon], i) => {
        if (i > 0) steps.appendChild(S.stepArrow.createInstance());
        steps.appendChild(setP(I('step', `State=${i === cur ? 'Active' : i < cur ? 'Done' : 'Idle'}`), 'step', { Label: label, Icon: icon }));
      });
    } else if (phase === 'Game over') steps.appendChild(setP(I('step', 'State=Active'), 'step', { Label: 'Game over', Icon: '🏆' }));
    else steps.appendChild(setP(I('step', 'State=Setup active'), 'step', { Label: phase === 'Claim' ? 'Claim territories' : 'Deploy armies', Icon: phase === 'Claim' ? '🚩' : '🐶' }));
    const toggles = AL('H', { name: 'Toggles', gap: 6 });
    for (const [icon, on, badge] of TOGGLES) toggles.appendChild(setP(I('iconButton', `Size=Default, State=${on ? 'On' : 'Default'}`), 'iconButton', { Icon: icon, Badge: badge }));
    add(c, left, steps, toggles); steps.layoutGrow = 1;
    cs.push(c);
  }
  ids.hudTop = variantSet(cs, 'HUD top bar', g, { w: 1460, gap: 16, pad: 22, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Instruction bar + trade hint
{
  const g = await group(B, 'Instruction bar', '.hud-instr — centred under the top bar (top 78): what to do now + contextual controls. Active (your turn) = 2px border in color-mix(player 60%, white). Text comes from instructionFor() in HUD.tsx. ≤1280: max-width 100vw − 32.');
  const place = async (on) => {
    const p = AL('H', { name: 'Place step', gap: 3, pad: 3, r: 999, fill: 'surface/track' });
    for (const n of ['1', '3', '5', 'All']) p.appendChild(setP(I('segOption', `Kind=Place, State=${n === on ? 'On' : 'Off'}`), 'segOption', { Label: n }));
    return p;
  };
  const V8 = [
    ['Reinforce', true, 'Place 7 more armies — click your territories (shift-click: all)', 'place3'],
    ['Deploy', true, 'Place 1 army on one of your territories (12 left in your pool)', 'place1'],
    ['Claim', true, 'Claim an empty territory — click any unclaimed land (42 left)', null],
    ['Attack', true, 'Select one of your territories with 2+ armies to attack from', 'endAttack'],
    ['Attack target', true, 'Attack Venezuela from Peru — choose your dice!', 'endAttack'],
    ['Occupy', true, 'Move at least 3 armies into Venezuela', null],
    ['Fortify', true, 'Fortify (optional): pick a territory with 2+ armies, or end your turn', 'endTurn'],
    ['Fortify selected', true, 'Pick a neighbouring territory of yours to move armies into', 'skip'],
    ['Must trade', true, 'You have too many cards — trade a set first!', null],
    ['Waiting', false, 'Max is thinking…', null],
    ['Game over', false, 'Game over!', null],
  ];
  const cs = [];
  for (const [state, active, text, extra] of V8) {
    const c = CMP('H', { name: `State=${state}`, gap: 10, pad: [7, 8, 7, 18], r: 999, fill: 'surface/panel', main: 'CENTER' });
    if (active) stroke(c, 'team/Crimson/ring-60', 2, 'INSIDE'); else { stroke(c, 'border/line', 2, 'INSIDE'); c.strokes = [{ ...c.strokes[0], opacity: 0 }]; }
    await fx(c, 'Elevation/Glass panel');
    const t = await T(text, 'Body/Default 15', 'text/primary', { name: 'Instruction', align: 'CENTER' });
    const tw = AL('H', { name: 'Text', pad: [3, 0] }); tw.appendChild(t); c.appendChild(tw);
    if (!extra) c.paddingRight = 18;
    if (extra === 'place3') c.appendChild(await place('3'));
    if (extra === 'place1') c.appendChild(await place('1'));
    if (extra === 'endAttack') c.appendChild(btn('button', 'Warm', 'End attack ➜'));
    if (extra === 'endTurn') c.appendChild(btn('button', 'Warm', 'End turn ➜'));
    if (extra === 'skip') c.appendChild(btn('button', 'Warm', 'Skip fortify · End turn'));
    cs.push(c);
  }
  const set = variantSet(cs, 'Instruction bar', g, { w: 1500, gap: 16, pad: 22 });
  ids.instruction = set.id;

  const hint = CMP('H', { name: 'Trade hint', pad: [5, 14], r: 999, fill: 'surface/hint', description: '.hud-sub — reinforce phase, when the hand has a set. Wiggles (2.4s). Opens the cards panel.' });
  await fx(hint, 'Shadow/Hint');
  const ht = await T('🃏 You can trade a set for +4 armies', 'Label/13 strong', 'text/primary', { name: 'Text' }); add(hint, ht); textProp(hint, 'Text', '🃏 You can trade a set for +4 armies', ht);
  g.appendChild(hint); ids.tradeHint = hint.id;
}

// ---------------------------------------------------------------- Turn banner
{
  const g = await group(B, 'Turn banner', '.turn-banner — slides in from the left (480ms outBack, rotate −6° → 0), holds, exits right (380ms inBack). Gradient color-mix(player 70%, white) → player, coloured glow, inner bottom ledge. Sub line: territory armies + continent bonus pills (continent colour, white ring). 36px (28px when height ≤720).');
  const pill = CMP('H', { name: 'Bonus pill', pad: [2, 10], r: 999, fill: 'cont/Australia/base', description: '.tb-cont — continent bonus in the banner sub line.' });
  stroke(pill, 'surface/glass-70', 2, 'OUTSIDE');
  const pt = await T('+2 Australia', 'Body/Button 15', 'text/on-accent', { name: 'Text' }); add(pill, pt); textProp(pill, 'Text', '+2 Australia', pt);
  g.appendChild(pill); ids.bonusPill = pill.id;

  const c = CMP('V', { name: 'Turn banner', cross: 'CENTER', gap: 4, pad: [16, 44, 14, 44], r: 28, description: 'Shown for 1.4s / animation speed at the start of each turn.' });
  c.fills = [gradient('LINEAR', [[0, 'team/Crimson/banner-top'], [1, 'team/Crimson/base']])];
  c.effects = [boundShadow('team/Crimson/glow-40', 0, 16, 40), { type: 'INNER_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: -4 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const main = await T("Lena's turn — +8 armies", 'Display/Banner 36', 'text/on-accent', { name: 'Title' });
  main.setBoundVariable('fontSize', vr('layout/desktop/banner-font'));
  main.setRangeFontName(12, main.characters.length, { family: 'Fredoka', style: 'SemiBold' });
  main.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 2 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const sub = AL('H', { name: 'Sub', gap: 8, main: 'CENTER' });
  const p1 = pill.createInstance(); const p2 = pill.createInstance(); p2.setProperties({ [Object.keys(pill.componentPropertyDefinitions)[0]]: '+2 South America' }); retint(p2, 'Australia', 'SouthAmerica', 'cont');
  const st = await T('🗺️ 4 from territories', 'Body/Default 15', 'text/on-accent', { name: 'Territories' });
  add(sub, st, p1, p2); add(c, main, sub);
  textProp(c, 'Title', "Lena's turn — +8 armies", main); textProp(c, 'Territories', '🗺️ 4 from territories', st);
  boolProp(c, 'Bonus 1', true, p1); boolProp(c, 'Bonus 2', true, p2);
  p1.isExposedInstance = true; p2.isExposedInstance = true;
  g.appendChild(c); ids.turnBanner = c.id;
}

// ---------------------------------------------------------------- Curtain
{
  const g = await group(B, 'Hot-seat curtain', '.curtain — full-screen hand-off between local humans so nobody sees the next hand. Radial color-mix(player 55%, white) → color-mix(player 85%, #222). Card pops in, 🙈 bobs. Click anywhere or the button to continue.');
  const card = CMP('V', { name: 'Curtain card', cross: 'CENTER', gap: 6, pad: [32, 56], r: 32, fill: 'surface/solid', description: '.curtain-card' });
  await fx(card, 'Shadow/Hero');
  const h2 = await T('Pass to Lena', 'Display/Curtain 34', 'team/Crimson/base', { name: 'Title' });
  const cb = setP(I('buttonBig', 'Style=Primary, State=Default'), 'buttonBig', { Label: "I'm Lena ✋" });
  const pw = AL('V', { name: 'Hint', pad: [0, 0, 12, 0] }); pw.appendChild(await T('Tap to continue', 'Body/Default 15', 'text/secondary'));
  add(card, await E('🙈', 64, 'Emoji'), h2, pw, cb);
  textProp(card, 'Title', 'Pass to Lena', h2);
  g.appendChild(card); ids.curtainCard = card.id;

  const cur = figma.createComponent(); cur.name = 'Curtain'; cur.resize(1440, 900);
  // radial-gradient(circle at 50% 40%, …) farthest-corner = 900px on 1440×900 → gradient space scale 0.5/900
  cur.fills = [gradient('RADIAL', [[0, 'team/Crimson/curtain-in'], [1, 'team/Crimson/curtain-out']], [[0.8, 0, 0.1], [0, 0.5, 0.3]])];
  cur.description = 'Full-viewport hand-off curtain (z 90). Retint team/<Colour>/curtain-* for the next player.';
  const ci = card.createInstance(); cur.appendChild(ci); ci.x = (1440 - ci.width) / 2; ci.y = Math.round((900 - ci.height) / 2);
  ci.constraints = { horizontal: 'CENTER', vertical: 'CENTER' };
  g.appendChild(cur); ids.curtain = cur.id;
}

// ---------------------------------------------------------------- Popup + toast + FX
{
  const g = await group(B, 'Popups, toasts & FX', '.popup — event callouts (knock-outs, saves, loads) with a 3px player-colour ring, stacked top-centre (top 140). .toast — errors (red, auto-dismiss 3s, click to close, top 190). FX layer: "+N armies!" pop (40px white, 2px player stroke, hard drop) with ✨⭐💖 sparks after a card trade.');
  const popup = CMP('H', { name: 'Popup', pad: [10, 22], r: 999, fill: 'surface/solid' });
  stroke(popup, 'team/Azure/base', 3, 'OUTSIDE'); await fx(popup, 'Shadow/Panel');
  const pt = await T('💥 Max was knocked out by Lena! (+3 cards)', 'Body/Strong 16', 'text/primary', { name: 'Text' }); add(popup, pt); textProp(popup, 'Text', '💥 Max was knocked out by Lena! (+3 cards)', pt);
  g.appendChild(popup); ids.popup = popup.id;

  const toast = CMP('H', { name: 'Toast', pad: [10, 22], r: 999, fill: 'surface/error' });
  stroke(toast, 'border/error', 2, 'OUTSIDE'); await fx(toast, 'Shadow/Panel');
  const tt = await T('🙊 You can only attack a neighbouring territory', 'Body/Strong 16', 'text/error', { name: 'Text' }); add(toast, tt); textProp(toast, 'Text', '🙊 You can only attack a neighbouring territory', tt);
  g.appendChild(toast); ids.toast = toast.id;

  const pop = CMP('H', { name: 'FX pop', main: 'CENTER', w: 220, description: '.fx-pop — "+N armies!" after a trade: scale 0 → 1.25 → 1, then drifts up and fades.' });
  const ft = await T('+4 armies!', 'Display/FX pop 40', 'text/on-accent', { name: 'Text', align: 'CENTER' });
  stroke(ft, 'team/Crimson/base', 2, 'OUTSIDE');
  ft.effects = [boundShadow('team/Crimson/base', 0, 4, 0), { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 8 }, radius: 20, spread: 0, visible: true, blendMode: 'NORMAL' }];
  add(pop, ft); textProp(pop, 'Text', '+4 armies!', ft);
  g.appendChild(pop); ids.fxPop = pop.id;

  const burst = figma.createComponent(); burst.name = 'Sparkle burst'; burst.resize(360, 260); burst.fills = [];
  burst.description = '.fx-spark × 16 (✨ ⭐ 💖, 26px) flying out from the centre (900ms outExpo).';
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) { const s = await E(['✨', '⭐', '💖'][i % 3], 26, `Spark ${i + 1}`); burst.appendChild(s); s.x = 167 + (rnd() - 0.5) * 330; s.y = 117 + (rnd() - 0.5) * 230; s.opacity = 0.35 + rnd() * 0.65; s.rotation = (rnd() - 0.5) * 60; }
  g.appendChild(burst); ids.sparkles = burst.id;
}

// ---------------------------------------------------------------- Game over
{
  const g = await group(B, 'Game over', '.gameover — scrim + blur over the board, confetti rain (90 pieces), card with a 6px winner-colour ring: hopping animals, "🏆 <winner> wins!", round, stats table (winner row highlighted), New game ✨.');
  const W = [82, 79, 61, 70, 44, 43, 41];
  const HEAD = ['Player', 'Conquered', 'Attacks', 'Defeated', 'Lost', 'Sets', 'KOs'];
  const ROWS = [['Lena', 'Crimson', [2, 3, 8, 3, 1, 2], true], ['Max', 'Azure', [1, 1, 1, 6, 0, 0], false], ['Biscuit', 'Lime', [0, 1, 2, 2, 0, 0], false]];
  const table = AL('V', { name: 'Stats table' });
  const hr = AL('H', { name: 'Head' });
  for (const [i, h] of HEAD.entries()) { const cell = AL('H', { name: h, pad: [4, 10], main: 'CENTER', w: W[i] }); cell.appendChild(await T(h, 'Caption/12 strong', 'text/secondary')); hr.appendChild(cell); }
  table.appendChild(hr);
  for (const [name, team, vals, win] of ROWS) {
    const r = AL('H', { name: `Row ${name}` });
    if (win) fill(r, 'surface/win');
    stroke(r, 'border/line', 1, 'INSIDE', [3, 3]); r.strokeTopWeight = 1; r.strokeBottomWeight = 0; r.strokeLeftWeight = 0; r.strokeRightWeight = 0;
    const first = AL('H', { name: 'Player', gap: 6, pad: [6, 10], w: W[0] });
    const d = S.dot.defaultVariant.createInstance(); if (team !== 'Crimson') retint(d, 'Crimson', team);
    add(first, d, await T(name, 'Body/Small strong 14', 'text/primary')); r.appendChild(first);
    for (const [i, v] of vals.entries()) { const cell = AL('H', { name: HEAD[i + 1], pad: [6, 10], main: 'CENTER', w: W[i + 1] }); cell.appendChild(await T(String(v), 'Body/Help 14', 'text/primary')); r.appendChild(cell); }
    table.appendChild(r);
  }
  const card = CMP('V', { name: 'Game over card', cross: 'CENTER', pad: [24, 34, 28, 34], r: 32, fill: 'surface/solid', description: '.gameover-card — ring = winner colour.' });
  stroke(card, 'team/Crimson/base', 6, 'OUTSIDE'); await fx(card, 'Shadow/Game over');
  const animals = AL('H', { name: 'Animals', gap: 8, cross: 'MAX' });
  for (const [a, s] of [['Dog', 56], ['Panda', 80], ['Pony', 56]]) { const i = I('unit', `Animal=${a}`); i.resize(s, s); animals.appendChild(i); }
  const h1 = await T('🏆 Lena wins!', 'Display/Title 40', 'team/Crimson/base', { name: 'Winner' });
  const h1w = AL('V', { name: 'Title', pad: [6, 0, 2, 0] }); h1w.appendChild(h1);
  const sub = await T('The whole world is cuddled. Round 23.', 'Body/Default 15', 'text/secondary', { name: 'Subtitle' });
  const tw = AL('V', { name: 'Table wrap', pad: [16, 0, 20, 0] }); tw.appendChild(table);
  add(card, animals, h1w, sub, tw, setP(I('buttonBig', 'Style=Primary, State=Default'), 'buttonBig', { Label: 'New game ✨' }));
  textProp(card, 'Winner', '🏆 Lena wins!', h1); textProp(card, 'Subtitle', 'The whole world is cuddled. Round 23.', sub);
  g.appendChild(card); ids.gameOverCard = card.id;

  const conf = figma.createComponent(); conf.name = 'Confetti'; conf.resize(1440, 900); conf.fills = []; conf.clipsContent = true;
  conf.description = '.confetti — 90 pieces, 6–14 × 10–20px, palette = team colours + #ff8fc7 #7ee0d6, falling 2.4–4.6s with spin.';
  const PAL = ['team/Crimson/base', 'team/Azure/base', 'team/Lime/base', 'team/Sunflower/base', 'team/Violet/base', 'wild/pink', 'wild/aqua'];
  let seed = 42; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) { const r = figma.createRectangle(); r.name = `Piece ${i + 1}`; r.resize(6 + rnd() * 8, 10 + rnd() * 10); r.cornerRadius = 3; fill(r, PAL[i % PAL.length]); conf.appendChild(r); r.x = rnd() * 1430; r.y = rnd() * 890; r.rotation = rnd() * 360; }
  g.appendChild(conf); ids.confetti = conf.id;

  const scrim = figma.createComponent(); scrim.name = 'Modal scrim'; scrim.resize(1440, 900); fill(scrim, 'surface/scrim'); await fx(scrim, 'Elevation/Backdrop');
  scrim.description = '.modal-backdrop / .gameover backdrop — rgba(60,50,110,.35) + blur(3–4px). Fades in .3s.';
  g.appendChild(scrim); ids.scrim = scrim.id;
}

await snap(B, 0.35);
return { ids, made: made.length, board: B.id };
