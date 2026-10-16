// code-to-figma — stage 5: read-only verification of the library + screens pages, and a PNG export of every
// screen (→ runner-out/snaps/99-verify/, then `cli.mjs validate` diffs them against the code renders).
/*LIB*/
const report = { pages: {}, problems: [] };
const lib = await page('library');
const scr = await page('screens');

async function audit(root) {
  const r = { nodes: 0, types: {}, components: 0, componentSets: 0, instances: 0, brokenInstances: 0, texts: 0, textsWithoutStyle: 0, fonts: {}, unboundSolidFills: 0, unboundStrokes: 0, imageFills: 0, variableBindings: 0 };
  for (const n of root.findAll(() => true)) {
    r.nodes++; r.types[n.type] = (r.types[n.type] || 0) + 1;
    if (n.type === 'COMPONENT') r.components++;
    if (n.type === 'COMPONENT_SET') r.componentSets++;
    if (n.type === 'INSTANCE') { r.instances++; if (!(await n.getMainComponentAsync())) r.brokenInstances++; }
    if (n.type === 'TEXT') {
      r.texts++;
      if (!n.textStyleId || typeof n.textStyleId !== 'string') r.textsWithoutStyle++;
      for (const seg of n.getStyledTextSegments(['fontName'])) r.fonts[seg.fontName.family] = (r.fonts[seg.fontName.family] || 0) + 1;
    }
    if ('fills' in n && Array.isArray(n.fills)) for (const p of n.fills) {
      if (p.type === 'IMAGE') r.imageFills++;
      else if (p.type === 'SOLID' && !p.boundVariables?.color && n.type !== 'TEXT' && p.visible !== false) r.unboundSolidFills++;
    }
    if ('strokes' in n && Array.isArray(n.strokes)) for (const p of n.strokes) if (p.type === 'SOLID' && !p.boundVariables?.color) r.unboundStrokes++;
    r.variableBindings += Object.keys(n.boundVariables || {}).length;
  }
  return r;
}
report.pages.library = await audit(lib);
report.pages.screens = await audit(scr);
for (const [k, r] of Object.entries(report.pages)) {
  const other = Object.keys(r.fonts).filter((f) => f !== FONT);
  if (other.length) report.problems.push(`${k}: fonts other than ${FONT}: ${other.join(', ')}`);
  if (r.brokenInstances) report.problems.push(`${k}: ${r.brokenInstances} instances lost their main component`);
}
report.inventory = lib.children.filter((b) => b.name.startsWith('Board · ')).map((b) => ({
  board: b.name.replace('Board · ', ''),
  components: b.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] }).filter((c) => !(c.type === 'COMPONENT' && c.parent?.type === 'COMPONENT_SET'))
    .map((c) => (c.type === 'COMPONENT_SET' ? `${c.name} (${c.children.length})` : c.name)),
}));
const frames = scr.findAllWithCriteria({ types: ['FRAME'] }).filter((f) => f.parent?.type === 'SECTION');
report.screens = frames.map((f) => `${f.parent.name} / ${f.name} (${f.width}×${f.height})`);
for (const f of frames) await snap(f, 1);
return report;
