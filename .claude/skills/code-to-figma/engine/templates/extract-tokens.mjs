// Project token extractor → figma/tokens.json (schema: references/authoring.md#tokens).
// Read colours, type, radii, spacing, shadows from YOUR sources (CSS custom properties, a theme file,
// Tailwind config…). Check every named literal still exists in the code and print drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const vars = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const lit = (hex, a = 1) => ({ hex: hex.toLowerCase(), a });

const tokens = {
  font: { family: 'Inter', styles: ['Regular', 'Medium', 'Semi Bold', 'Bold'], cssVar: '--font' },
  primitives: { 'base/white': lit('#ffffff'), 'base/ink': lit(vars.ink || '#111827'), 'base/ink-soft': lit('#6b7280'), 'brand/500': lit(vars.brand || '#6366f1') },
  semantic: { 'text/primary': 'base/ink', 'text/secondary': 'base/ink-soft', 'text/accent': 'brand/500', 'text/on-accent': 'base/white', 'surface/solid': 'base/white', 'accent/brand': 'brand/500' },
  codeSyntax: { 'base/ink': '--ink', 'text/primary': '--ink', 'brand/500': '--brand' },
  palettes: {},          // { Team: { prefix: 'team', cssVar: { base: '--pc' }, groups: { Red: { base: lit('#e63946'), name: 'Red' } } } }
  extraColors: {},       // literal colours that need a variable too (canvas / chart colours …)
  radius: { 'radius/sm': 6, 'radius/md': 12, 'radius/pill': 999 },
  space: { 'space/4': 4, 'space/8': 8, 'space/12': 12, 'space/16': 16, 'space/24': 24 },
  layout: null,          // { modes: ['desktop', 'tablet'], values: { 'sidebar-w': [280, 0] } }
  typeStyles: {
    'Display/Title': { style: 'Bold', size: 32 }, 'Heading/Section': { style: 'Semi Bold', size: 20 },
    'Body/Default': { style: 'Regular', size: 15 }, 'Caption/Default': { style: 'Regular', size: 12 },
  },
  effects: { 'Shadow/Card': [{ x: 0, y: 4, blur: 16, spread: 0, color: lit('#000000', 0.12) }], 'Blur/Glass': 'blur12' },
  gradients: {},         // { 'Gradient/Brand': { stops: ['brand/500', 'base/white'], angle: 180 } }
};
const out = path.join(root, 'figma/tokens.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(tokens, null, 1));
console.log(`tokens → ${path.relative(root, out)}`);
