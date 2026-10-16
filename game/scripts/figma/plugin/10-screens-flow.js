// use_figma script — stage 4a: composed screens (desktop 1440×900) for the setup + turn flow, built only
// from library instances placed like the CSS (src/ui/ui.css positions). Mirrors scripts/figma/scenarios.mjs.
/*LIB*/
/*SCREENS*/
/*INCLUDE:_game.js*/
const made2 = [];
section('Setup', 0);
section('Turn flow', 1400);

// ---------------------------------------------------------------- Setup
for (const [name, variant] of [['Setup · 3 players', 'State=Local · 3 players'], ['Setup · colour picker', 'State=Local · colour picker'], ['Setup · 2 players', 'State=Local · 2 players'], ['Setup · 6 players + load', 'State=Local · 6 players + load']]) {
  const f = await screen('Setup', name, 1440, 900, { backdrop: 'board-idle' });
  at(f, use('Setup backdrop'), { left: 0, top: 0 });
  at(f, use('Setup card', variant), { cx: true, cy: true });
  made2.push(f.id);
}

// ---------------------------------------------------------------- Turn flow
const flow = [
  ['Claim territories', { phase: 'Claim', instruction: 'Claim', hand: 'Closed', deckCount: '44' }],
  ['Reinforce', { phase: 'Reinforce', instruction: 'Reinforce', hint: true }],
  ['Reinforce · cards open', { phase: 'Reinforce', instruction: 'Reinforce', hint: true, hand: 'Open' }],
  ['Attack · pick a source', { phase: 'Attack', instruction: 'Attack', panels: ['Territory panel|State=Selected', 'Log panel|State=Entries'] }],
  ['Attack · choose dice', { phase: 'Attack', instruction: 'Attack target', dialog: 'Dialog=Attack, State=Ready' }],
  ['Attack · risky', { phase: 'Attack', instruction: 'Attack target', dialog: 'Dialog=Attack, State=Risky' }],
  ['Occupy', { phase: 'Attack', instruction: 'Occupy', dialog: 'Dialog=Occupy, State=Ready' }],
  ['Fortify', { phase: 'Fortify', instruction: 'Fortify selected', dialog: 'Dialog=Fortify, State=Ready' }],
  ['Fortify · end turn', { phase: 'Fortify', instruction: 'Fortify' }],
  ['Bot turn', { phase: 'Attack', instruction: 'Waiting', turn: 'Azure', turnName: 'Max', turnBot: true, attackWaiting: true }],
];
for (const [name, o] of flow) {
  const f = await screen('Turn flow', name);
  await chrome(f, o);
  if (o.panels) {
    const col = figma.createFrame(); col.name = 'Right column'; col.layoutMode = 'VERTICAL'; col.primaryAxisSizingMode = 'AUTO'; col.counterAxisSizingMode = 'FIXED'; col.resize(290, 10); col.itemSpacing = 10; col.fills = []; col.clipsContent = false;
    for (const p of o.panels) { const [n, v] = p.split('|'); const i = use(n, v); col.appendChild(i); i.layoutSizingHorizontal = 'FILL'; }
    at(f, col, { right: 12, top: 80 });
  }
  if (o.dialog) at(f, use('Dialogs', o.dialog), { cx: true, top: 132 });
  made2.push(f.id);
}

fitSections();
await snap(sections['Turn flow'].node, 0.12);
return { screens: made2.length, ids: made2, sections: Object.fromEntries(Object.entries(sections).map(([k, s]) => [k, s.node.id])) };
