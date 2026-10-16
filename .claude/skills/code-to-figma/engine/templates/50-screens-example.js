// Example screens: library instances placed like the CSS (at() = absolute positioning with constraints).
// Screen names should match config.validate.pairs so `validate` can compare them with the code renders.
/*LIB*/
/*SCREENS*/
section('Home', 0);
for (const vp of ['desktop', 'tablet', 'mobile']) {
  const { width, height } = CONFIG.viewports[vp];
  const f = await screen('Home', `Home · ${vp}`, width, height);
  at(f, use('Button', 'Style=Primary, State=Default', { Label: 'Get started' }), { cx: true, cy: true });
}
fitSections();
await snap(sections.Home.node, 0.2);
return { screens: Object.keys(sections) };
