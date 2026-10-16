// ---- Cuddle Empires screen helper (INCLUDE:_game.js placeholder, after the LIB and SCREENS placeholders) ----
/** Common in-game chrome for a screen (needs the screen helpers): HUD, instruction (+ trade hint), scoreboard, hand dock, deck. */
async function chrome(f, o = {}) {
  const hud = at(f, use('HUD top bar', `Phase=${o.phase || 'Reinforce'}`), { left: 12, right: 12, top: 12 });
  if (o.turn && o.turn !== 'Crimson') retint(hud, 'Crimson', o.turn);
  if (o.turnName) { const [chip] = await instancesOf(hud, 'Player chip'); if (chip) await setNested(chip, { Name: o.turnName, 'Show tag': !!o.turnBot }); }
  const wrap = figma.createFrame(); wrap.name = 'Instruction'; wrap.layoutMode = 'VERTICAL'; wrap.primaryAxisSizingMode = 'AUTO'; wrap.counterAxisSizingMode = 'AUTO'; wrap.counterAxisAlignItems = 'CENTER'; wrap.itemSpacing = 6; wrap.fills = []; wrap.clipsContent = false;
  const ins = use('Instruction bar', `State=${o.instruction || 'Reinforce'}`); wrap.appendChild(ins);
  if (o.turn && o.turn !== 'Crimson') retint(ins, 'Crimson', o.turn);
  if (o.hint) wrap.appendChild(use('Trade hint'));
  at(f, wrap, { cx: true, top: 78 });
  if (o.scoreboard !== false) at(f, use('Scoreboard', `State=${o.scoreboard === 'Closed' ? 'Closed' : 'Open'}`), { left: 12, top: 80 });
  if (o.hand !== false) at(f, use('Card hand', `State=${o.hand || 'Closed'}`), { left: 12, bottom: 12 });
  if (o.deck !== false) at(f, use('Deck pile', null, { Count: o.deckCount || '41' }), { right: 18, bottom: 18 });
  return { hud, wrap };
}
// ---- end game helpers
