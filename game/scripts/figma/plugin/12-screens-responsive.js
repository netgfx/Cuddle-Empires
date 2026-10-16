// use_figma script — stage 4c: responsive screens. One frame per CSS breakpoint (ui.css "responsive"):
//   Laptop ≤1280 (1280×800): round label hidden, steps 5/10 + 14px, scoreboard 220, right column 260
//   Tablet ≤1100 (1024×768): icon buttons 36, step icons hidden, dialogs min 320, help one column
//   Short h≤720 (1366×680): hand fan 160 (cards scale .85), banner 28px, right column bottom 130
//   Mobile ≤560 (480×860): save rows stack, save bar wraps (saves modal is the only phone layout)
// Breakpoint values come from the Layout collection (layout/<mode>/*) via rebindLayout().
/*LIB*/
/*SCREENS*/
/*INCLUDE:_game.js*/
const made2 = [];
section('Responsive', 5600);

async function inGame(name, w, h, mode, o) {
  const f = await screen('Responsive', name, w, h, { label: `${name} — ${w}×${h}` });
  const { hud, wrap } = await chrome(f, o);
  const round = hud.findOne((n) => n.type === 'TEXT' && n.name === 'Round');
  if (mode !== 'desktop') rebindLayout(hud, mode);
  if (mode === 'laptop' || mode === 'tablet') { if (round) round.visible = false; }
  if (mode === 'tablet') {
    for (const ib of await instancesOf(hud, 'Icon button')) { const m = await ib.getMainComponentAsync(); const v = m.parent.children.find((x) => x.name === m.name.replace('Size=Default', 'Size=Compact')); if (v) ib.swapComponent(v); }
    for (const st of await instancesOf(hud, 'Phase step')) await setNested(st, { 'Show icon': false });
    const tg = hud.findOne((n) => n.name === 'Toggles'); if (tg) tg.itemSpacing = 4;
  }
  const [sb] = await instancesOf(f, 'Scoreboard');
  if (sb && mode !== 'desktop') rebindLayout(sb, mode);
  return { f, hud, wrap };
}

// Laptop
{ const { f } = await inGame('Laptop · reinforce', 1280, 800, 'laptop', { phase: 'Reinforce', instruction: 'Reinforce', hint: true }); made2.push(f.id); }
{
  const { f } = await inGame('Laptop · attack + panels', 1280, 800, 'laptop', { phase: 'Attack', instruction: 'Attack' });
  const col = figma.createFrame(); col.name = 'Right column'; col.layoutMode = 'VERTICAL'; col.primaryAxisSizingMode = 'AUTO'; col.counterAxisSizingMode = 'FIXED'; col.resize(260, 10); col.itemSpacing = 10; col.fills = []; col.clipsContent = false;
  for (const [n, v] of [['Territory panel', 'State=Selected'], ['Log panel', 'State=Entries']]) { const i = use(n, v); col.appendChild(i); i.layoutSizingHorizontal = 'FILL'; }
  at(f, col, { right: 12, top: 80 }); made2.push(f.id);
}
// Tablet
{ const { f } = await inGame('Tablet · reinforce', 1024, 768, 'tablet', { phase: 'Reinforce', instruction: 'Reinforce', hint: true }); made2.push(f.id); }
{
  const { f } = await inGame('Tablet · attack dialog', 1024, 768, 'tablet', { phase: 'Attack', instruction: 'Attack target' });
  const d = use('Dialogs', 'Dialog=Attack, State=Ready'); at(f, d, { cx: true, top: 136 }); made2.push(f.id);
}
{
  const { f } = await inGame('Tablet · must trade', 1024, 768, 'tablet', { phase: 'Reinforce', instruction: 'Must trade', hand: false });
  at(f, use('Modal scrim'), { left: 0, top: 0 }).resize(1024, 768);
  at(f, use('Card hand', 'State=Must trade (narrow)'), { cx: true, cy: true }); made2.push(f.id);
}
{
  const { f } = await inGame('Tablet · how to play', 1024, 768, 'tablet', { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Modal scrim'), { left: 0, top: 0 }).resize(1024, 768);
  const help = use('Help panel', 'Columns=1'); help.clipsContent = true; help.cornerRadius = 20; help.resize(help.width, 768 - 60); // max-height calc(100vh − 60px), body scrolls
  at(f, help, { cx: true, top: 30 }); made2.push(f.id);
}
{
  const f = await screen('Responsive', 'Tablet · setup', 1024, 768, { label: 'Tablet · setup — 1024×768', backdrop: 'board-idle' });
  at(f, use('Setup backdrop'), { left: 0, top: 0 }).resize(1024, 768);
  at(f, use('Setup card', 'State=Local · 3 players'), { cx: true, cy: true }); made2.push(f.id);
}
{
  const { f } = await inGame('Tablet · game over', 1024, 768, 'tablet', { phase: 'Game over', instruction: 'Game over', hand: false });
  at(f, use('Modal scrim'), { left: 0, top: 0 }).resize(1024, 768);
  at(f, use('Confetti'), { left: 0, top: 0 }).resize(1024, 768);
  at(f, use('Game over card'), { cx: true, cy: true }); made2.push(f.id);
}
// Short
{
  const { f } = await inGame('Short · cards open', 1366, 680, 'short', { phase: 'Reinforce', instruction: 'Reinforce', hint: true, hand: 'Open' });
  const [dock] = await instancesOf(f, 'Card hand');
  if (dock) { dock.rescale(0.85); dock.x = 12; dock.y = 680 - 12 - dock.height; }
  made2.push(f.id);
}
{
  const { f } = await inGame('Short · turn banner', 1366, 680, 'short', { phase: 'Reinforce', instruction: 'Reinforce' });
  const b = use('Turn banner'); rebindLayout(b, 'short'); at(f, b, { cx: true, top: Math.round(680 * 0.34) }); made2.push(f.id);
}
// Mobile (saves modal)
{
  const f = await screen('Responsive', 'Mobile · saved games', 480, 860, { label: 'Mobile · saved games — 480×860' }); // in game, like the scenario
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Modal scrim'), { left: 0, top: 0 }).resize(480, 860);
  at(f, use('Saves panel', 'State=Mobile'), { cx: true, cy: true }); made2.push(f.id);
}
{
  const f = await screen('Responsive', 'Mobile · setup', 480, 860, { label: 'Mobile · setup — 480×860', backdrop: 'board-idle' });
  at(f, use('Setup backdrop'), { left: 0, top: 0 }).resize(480, 860);
  const card = use('Setup card', 'State=Local · 3 players'); card.resize(448, card.height); at(f, card, { cx: true, cy: true }); made2.push(f.id);
}

fitSections();
await snap(sections['Responsive'].node, 0.12);
return { screens: made2.length, ids: made2, sections: Object.fromEntries(Object.entries(sections).map(([k, s]) => [k, s.node.id])) };
