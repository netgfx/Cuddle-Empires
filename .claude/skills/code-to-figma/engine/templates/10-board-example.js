// Example library board: one component set per UI element, variants = CSS classes / states.
// Everything binds to tokens (fill/stroke/radius/pad via variables, text/effect styles by name).
/*LIB*/
const B = await board('Controls', 'Buttons from src/components/Button.tsx — Style × State.');
const g = await group(B, 'Button', '.btn — hover lifts 1px, disabled opacity .45.');
const cs = [], labels = [];
for (const style of ['Primary', 'Secondary']) {
  for (const state of ['Default', 'Hover', 'Disabled']) {
    const c = CMP('H', { name: `Style=${style}, State=${state}`, gap: 8, pad: [8, 16], r: 999, fill: style === 'Primary' ? 'accent/brand' : 'surface/solid', main: 'CENTER' });
    if (state === 'Disabled') c.opacity = 0.45;
    const t = await T('Save', 'Body/Default', style === 'Primary' ? 'text/on-accent' : 'text/primary', { name: 'Label' });
    c.appendChild(t); cs.push(c); labels.push(t);
  }
}
const set = variantSet(cs, 'Button', g, { w: 600 });
const k = set.addComponentProperty('Label', 'TEXT', 'Save'); // bind only text that varies (fixed glyphs stay unbound)
labels.forEach((t) => { t.componentPropertyReferences = { characters: k }; });
await snap(B, 0.5);
return { board: B.id, set: set.id };
