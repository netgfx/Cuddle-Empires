// use_figma script — stage 4b: composed screens for modals, panels and transient overlays (desktop 1440×900).
/*LIB*/
/*SCREENS*/
/*INCLUDE:_game.js*/
const made2 = [];
section('Panels & modals', 2800);
section('Overlays', 4200);

// ---------------------------------------------------------------- panels & modals
{
  const f = await screen('Panels & modals', 'Must trade');
  await chrome(f, { phase: 'Reinforce', instruction: 'Must trade', hand: false });
  at(f, use('Modal scrim'), { left: 0, top: 0 });
  at(f, use('Card hand', 'State=Must trade'), { cx: true, cy: true });
  made2.push(f.id);
}
{
  const f = await screen('Panels & modals', 'Settings');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce', hint: true });
  at(f, use('Settings panel', 'State=In game'), { right: 12, top: 76 });
  made2.push(f.id);
}
{
  const f = await screen('Panels & modals', 'Settings · leave confirm');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Settings panel', 'State=Leave confirm'), { right: 12, top: 76 });
  made2.push(f.id);
}
{
  const f = await screen('Panels & modals', 'How to play');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Modal scrim'), { left: 0, top: 0 });
  at(f, use('Help panel', 'Columns=2'), { cx: true, cy: true });
  made2.push(f.id);
}
{
  const f = await screen('Panels & modals', 'Territory · nothing selected');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Territory panel', 'State=Empty'), { right: 12, top: 80 });
  made2.push(f.id);
}
for (const [name, state, setup] of [['Saved games · list', 'State=List'], ['Saved games · empty', 'State=Empty (in game)'], ['Saved games · empty (setup)', 'State=Empty (setup)', true], ['Saved games · load confirm', 'State=Load confirm'], ['Saved games · delete confirm', 'State=Delete confirm'], ['Saved games · online', 'State=Online'], ['Saved games · error', 'State=Error']]) {
  const f = await screen('Panels & modals', name, 1440, 900, { backdrop: setup ? 'board-idle' : undefined });
  if (setup) { at(f, use('Setup backdrop'), { left: 0, top: 0 }); at(f, use('Setup card', 'State=Local · 3 players'), { cx: true, cy: true }); }
  else await chrome(f, { phase: 'Attack', instruction: 'Attack' });
  at(f, use('Modal scrim'), { left: 0, top: 0 });
  at(f, use('Saves panel', state), { cx: true, cy: true });
  made2.push(f.id);
}

// ---------------------------------------------------------------- overlays
{
  const f = await screen('Overlays', 'Turn banner');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  const b = use('Turn banner'); at(f, b, { cx: true, top: Math.round(900 * 0.34) });
  made2.push(f.id);
}
{
  const f = await screen('Overlays', 'Hot-seat curtain');
  at(f, use('Curtain'), { left: 0, top: 0 });
  made2.push(f.id);
}
{
  const f = await screen('Overlays', 'Popups + toast');
  await chrome(f, { phase: 'Attack', instruction: 'Attack' });
  const col = figma.createFrame(); col.name = 'Popups'; col.layoutMode = 'VERTICAL'; col.primaryAxisSizingMode = 'AUTO'; col.counterAxisSizingMode = 'AUTO'; col.counterAxisAlignItems = 'CENTER'; col.itemSpacing = 8; col.fills = []; col.clipsContent = false;
  // knock-out popup uses the eliminated player's colour; "Game saved" uses #3cb88f (accent/success)
  const p1 = use('Popup'); const p2 = use('Popup', null, { Text: '💾 Game saved!' }); p2.strokes = [solid('accent/success')];
  col.appendChild(p1); col.appendChild(p2);
  at(f, col, { cx: true, top: 140 });
  at(f, use('Toast'), { cx: true, top: 190 }); // .toasts sit at top 190, above the popup stack (z 95), exactly like the app
  made2.push(f.id);
}
{
  const f = await screen('Overlays', 'Card trade FX');
  await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
  at(f, use('Sparkle burst'), { cx: true, top: Math.round(900 * 0.42) - 130 });
  at(f, use('FX pop'), { cx: true, top: Math.round(900 * 0.42) - 30 });
  made2.push(f.id);
}
{
  const f = await screen('Overlays', 'Game over');
  await chrome(f, { phase: 'Game over', instruction: 'Game over', hand: false });
  at(f, use('Modal scrim'), { left: 0, top: 0 });
  at(f, use('Confetti'), { left: 0, top: 0 });
  at(f, use('Game over card'), { cx: true, cy: true });
  made2.push(f.id);
}

fitSections();
await snap(sections['Overlays'].node, 0.12);
return { screens: made2.length, ids: made2, sections: Object.fromEntries(Object.entries(sections).map(([k, s]) => [k, s.node.id])) };
