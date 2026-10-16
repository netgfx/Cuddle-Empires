// In-place patch from validation pass 2: responsive constraints the screens did not model yet. Idempotent.
//  A. .hand-bar has flex-wrap; inside the must-trade dock (left: 50%) a 1024px viewport leaves 512 − 44px → the bar wraps.
//  B. Mobile setup: .setup-backdrop centres the card (grid place-items: center).
//  C. Mobile saves is an in-game state (HUD behind the modal); ≤560px the save button grows (.save-btn { flex: 1 }).
//  D. Help modal: max-height calc(100vh − 60px) with a scrolling body → 708px on a 768px viewport.
/*LIB*/
/*SCREENS*/
/*INCLUDE:_game.js*/
const done = [];
const frameNamed = (name) => SCREENS_PAGE.findOne((n) => n.type === 'FRAME' && n.name === name);

// A. hand bar wraps like the CSS; narrow must-trade variant (bar fixed to the 468px the dock gets at 1024px)
{
  for (const v of COMP['Hand bar'].children) { v.layoutWrap = 'WRAP'; v.counterAxisSpacing = 8; }
  const hand = COMP['Card hand'];
  let narrow = hand.children.find((c) => c.name === 'State=Must trade (narrow)');
  if (!narrow) {
    narrow = hand.children.find((c) => c.name === 'State=Must trade').clone();
    hand.appendChild(narrow); narrow.name = 'State=Must trade (narrow)';
    narrow.description = 'Must-trade dock on ≤1100px: the dock is positioned left: 50%, so its shrink-to-fit width is 50vw − 44px and the hand bar wraps.';
  }
  const bar = (await instancesOf(narrow, 'Hand bar'))[0];
  if (bar) { bar.resize(468, bar.height); }
  const f = frameNamed('Tablet · must trade');
  if (f) for (const i of await instancesOf(f, 'Card hand')) { i.swapComponent(narrow); i.x = Math.round((f.width - i.width) / 2); i.y = Math.round((f.height - i.height) / 2); }
  done.push(`A: hand bar wraps; Card hand ▸ Must trade (narrow)${bar ? ` bar ${Math.round(bar.width)}×${Math.round(bar.height)}` : ' (bar not found)'}`);
}

// B. mobile setup card centred
{
  const f = frameNamed('Mobile · setup');
  if (f) for (const i of await instancesOf(f, 'Setup card')) { i.y = Math.round((f.height - i.height) / 2); i.constraints = { horizontal: 'CENTER', vertical: 'CENTER' }; }
  done.push('B: mobile setup centred');
}

// C. mobile saves: in-game chrome behind the scrim + growing save button
{
  const f = frameNamed('Mobile · saved games');
  if (f && !(await instancesOf(f, 'HUD top bar')).length) {
    for (const i of await instancesOf(f, 'Setup backdrop')) i.remove();
    const bg = f.children.find((c) => c.name.startsWith('Scene backdrop') || c.name.startsWith('3D scene'));
    const h = backdropHash('board-game', f.width, f.height);
    if (bg && h) { bg.locked = false; bg.fills = [{ type: 'IMAGE', imageHash: h, scaleMode: 'FILL' }]; bg.locked = true; }
    const before = new Set(f.children.map((n) => n.id));
    await chrome(f, { phase: 'Reinforce', instruction: 'Reinforce' });
    const added = f.children.filter((n) => !before.has(n.id));
    added.forEach((n, k) => f.insertChild(1 + k, n)); // under the scrim + modal
  }
  const mobile = COMP['Saves panel'].children.find((c) => c.name === 'State=Mobile');
  let grew = 'n/a';
  for (const bar of await instancesOf(mobile, 'Save bar')) {
    const btn = (await instancesOf(bar, 'Save button'))[0];
    try { if (btn) { btn.layoutGrow = 1; grew = 'ok'; } } catch (e) { grew = `not overridable (${e.message})`; }
  }
  done.push(`C: mobile saves in game; save button grow ${grew}`);
}

// D. help modal height cap with clipped (scrolling) body on the tablet screen
{
  const f = frameNamed('Tablet · how to play');
  if (f) for (const i of await instancesOf(f, 'Help panel')) {
    i.clipsContent = true; i.resize(i.width, f.height - 60); i.cornerRadius = 20;
    i.x = Math.round((f.width - i.width) / 2); i.y = 30;
  }
  done.push('D: tablet help capped at 100vh − 60');
}
return { done };
