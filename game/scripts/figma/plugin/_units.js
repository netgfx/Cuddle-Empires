// ---- Cuddle Empires unit art helper (INCLUDE:_units.js placeholder, after the LIB placeholder) ----
/** Unit icon art (config.assets unit/<animal>) with the .unit-img drop shadow. */
function img(animal, size, name) {
  const r = imageRect(`unit/${animal}`, size); r.name = name || `unit/${animal}`;
  r.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.18 }, offset: { x: 0, y: 2 }, radius: 2, spread: 0, visible: true, blendMode: 'NORMAL' }];
  return r;
}
// ---- end unit helper
