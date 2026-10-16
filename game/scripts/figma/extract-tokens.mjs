// Code → Figma pipeline, stage 1: design tokens from the code.
//
//   node scripts/figma/extract-tokens.mjs [--out=figma/tokens.json]
//
// Sources of truth: src/ui/ui.css (custom properties + literals), src/ui/util.ts (TEAM_PALETTE),
// src/game/mapData.ts (CONTINENTS), src/scene/sceneConfig.ts (3D overlay colours).
// Every named literal below is checked against ui.css, so a colour that was changed or removed
// in code is reported as drift instead of silently going stale in Figma. color-mix() values
// (team / continent tints) are pre-computed per mode because Figma has no colour mixing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const out = path.resolve(root, opt.out || 'figma/tokens.json');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('src/ui/ui.css');
const cssNorm = css.toLowerCase().replace(/\s+/g, '').replace(/0\./g, '.');
const drift = [];

// ------------------------------------------------------------ colour helpers
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** CSS color-mix(in srgb, a p%, b) */
const mix = (a, p, b) => toHex(hex(a).map((v, i) => v * p + hex(b)[i] * (1 - p)));
const rgba = (r, g, b, a) => ({ hex: toHex([r, g, b]), a });
const lit = (v) => (typeof v === 'string' ? { hex: v.toLowerCase(), a: 1 } : v);

/** Asserts a literal still appears in ui.css (normalised), records drift otherwise. */
function inCss(name, literal) {
  const needle = literal.toLowerCase().replace(/\s+/g, '').replace(/0\./g, '.');
  if (!cssNorm.includes(needle)) drift.push(`${name}: ${literal} not found in ui.css`);
}

// ------------------------------------------------------------ CSS custom properties
const block = css.match(/\.ui-root\s*\{([\s\S]*?)\}/)[1];
const cssVars = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const v = (name) => { const val = cssVars[name]; if (!val) drift.push(`--${name} missing from .ui-root`); return val; };
const parseRgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim()); return rgba(+r, +g, +b, +a); };

// ------------------------------------------------------------ primitives (named literals)
const P = {
  'base/white': '#ffffff', 'base/ink': v('ink'), 'base/ink-soft': v('ink-soft'), 'base/cream': v('panel-solid'), 'base/paper': '#fffdf8',
  'base/panel-82': parseRgba(v('panel')), 'base/line-16': parseRgba(v('line')),
  'pink/100': '#ffe1ec', 'pink/150': '#ffd0de', 'pink/200': '#ffc6d8', 'pink/300': '#ffb3cb', 'pink/350': '#f0a6c0', 'pink/400': '#ff9fbf',
  'pink/450': '#ff8fb3', 'pink/500': v('pink'), 'pink/600': v('pink-deep'), 'pink/800': '#c93a66',
  'sun/50': '#fff6d6', 'sun/100': '#fff2c6', 'sun/300': '#ffd770', 'sun/400': v('sun'), 'sun/500': '#ffb52e', 'sun/600': '#ffbe0b', 'sun/700': '#d48b0b', 'sun/900': '#5a3a00',
  'mint/50': '#effbf6', 'mint/100': '#d8f5e8', 'mint/300': '#8fe3c8', 'mint/400': v('mint'), 'mint/500': '#3cb88f', 'mint/600': '#2f9e6f', 'mint/700': '#2a9572',
  'sky/100': '#e1efff', 'sky/400': v('sky'), 'sky/600': '#2d6fd6', 'sky/700': '#2d5fa8',
  'red/50': '#fff0f0', 'red/200': '#ffb3b3', 'red/400': '#ff9a8a', 'red/500': '#ec5b4f', 'red/700': '#b8392f', 'red/800': '#a3263a',
  'violet/100': '#f1ecff', 'violet/200': '#d9d5ff', 'violet/250': '#d9d2ee', 'violet/300': '#cfc8ea', 'violet/350': '#c3bdd9', 'violet/500': '#b18cff', 'violet/600': '#6c63d9',
  'wild/rose': '#fff3fb', 'wild/ice': '#e8fbff', 'wild/pink': '#ff8fc7', 'wild/aqua': '#7ee0d6',
  'alpha/white-60': rgba(255, 255, 255, 0.6), 'alpha/white-70': rgba(255, 255, 255, 0.7), 'alpha/white-75': rgba(255, 255, 255, 0.75),
  'alpha/white-80': rgba(255, 255, 255, 0.8), 'alpha/white-85': rgba(255, 255, 255, 0.85), 'alpha/cream-70': rgba(255, 250, 246, 0.7),
  'alpha/lav-08': rgba(120, 110, 160, 0.08), 'alpha/lav-10': rgba(120, 110, 160, 0.1), 'alpha/lav-12': rgba(120, 110, 160, 0.12), 'alpha/lav-15': rgba(120, 110, 160, 0.15),
  'alpha/black-05': rgba(0, 0, 0, 0.05), 'alpha/black-07': rgba(0, 0, 0, 0.07), 'alpha/scrim': rgba(60, 50, 110, 0.35),
};
const literalCheck = { 'pink/100': '#ffe1ec', 'pink/150': '#ffd0de', 'pink/200': '#ffc6d8', 'pink/300': '#ffb3cb', 'pink/350': '#f0a6c0', 'pink/400': '#ff9fbf', 'pink/450': '#ff8fb3', 'pink/800': '#c93a66',
  'sun/50': '#fff6d6', 'sun/100': '#fff2c6', 'sun/300': '#ffd770', 'sun/500': '#ffb52e', 'sun/700': '#d48b0b', 'sun/900': '#5a3a00', 'mint/50': '#effbf6', 'mint/100': '#d8f5e8', 'mint/300': '#8fe3c8',
  'mint/500': '#3cb88f', 'mint/600': '#2f9e6f', 'mint/700': '#2a9572', 'sky/100': '#e1efff', 'sky/600': '#2d6fd6', 'sky/700': '#2d5fa8', 'red/50': '#fff0f0', 'red/200': '#ffb3b3', 'red/400': '#ff9a8a',
  'red/500': '#ec5b4f', 'red/700': '#b8392f', 'red/800': '#a3263a', 'violet/100': '#f1ecff', 'violet/200': '#d9d5ff', 'violet/250': '#d9d2ee', 'violet/300': '#cfc8ea', 'violet/350': '#c3bdd9',
  'violet/500': '#b18cff', 'violet/600': '#6c63d9', 'wild/rose': '#fff3fb', 'wild/ice': '#e8fbff', 'wild/pink': '#ff8fc7', 'wild/aqua': '#7ee0d6', 'base/paper': '#fffdf8',
  'alpha/white-70': 'rgba(255, 255, 255, .7)', 'alpha/white-80': 'rgba(255, 255, 255, .8)', 'alpha/lav-10': 'rgba(120, 110, 160, .1)', 'alpha/lav-08': 'rgba(120, 110, 160, .08)', 'alpha/scrim': 'rgba(60, 50, 110, .35)' };
for (const [k, l] of Object.entries(literalCheck)) inCss(k, l);
const primitives = Object.fromEntries(Object.entries(P).map(([k, val]) => [k, lit(val)]));

// ------------------------------------------------------------ semantic colours (aliases → primitives)
const semantic = {
  'text/primary': 'base/ink', 'text/secondary': 'base/ink-soft', 'text/on-accent': 'base/white', 'text/accent': 'pink/600', 'text/warm': 'sun/900',
  'text/success': 'mint/600', 'text/error': 'red/800', 'text/info': 'sky/700', 'text/bot': 'sky/600', 'text/title-cute': 'violet/600', 'text/muted-arrow': 'violet/350',
  'surface/panel': 'base/panel-82', 'surface/solid': 'base/cream', 'surface/paper': 'base/paper', 'surface/white': 'base/white', 'surface/glass-60': 'alpha/white-60',
  'surface/glass-70': 'alpha/white-70', 'surface/glass-75': 'alpha/white-75', 'surface/glass-80': 'alpha/white-80', 'surface/glass-85': 'alpha/white-85', 'surface/veil': 'alpha/cream-70',
  'surface/track': 'alpha/lav-10', 'surface/track-soft': 'alpha/lav-08', 'surface/track-strong': 'alpha/lav-15', 'surface/tag': 'alpha/black-07', 'surface/icon-sm': 'alpha/black-05',
  'surface/selected': 'pink/100', 'surface/hint': 'sun/100', 'surface/win': 'sun/50', 'surface/note': 'sky/100', 'surface/error': 'red/50', 'surface/fresh': 'mint/50', 'surface/ready': 'mint/100',
  'surface/scrim': 'alpha/scrim', 'border/line': 'base/line-16', 'border/glass': 'alpha/white-70', 'border/focus': 'pink/500', 'border/error': 'red/200', 'border/dashed': 'violet/300',
  'border/die-ledge': 'violet/250', 'accent/pink': 'pink/500', 'accent/pink-deep': 'pink/600', 'accent/mint': 'mint/400', 'accent/sun': 'sun/400', 'accent/sky': 'sky/400', 'accent/success': 'mint/500',
  'accent/gold': 'sun/600', 'button/primary-top': 'pink/450', 'button/primary-bottom': 'pink/600', 'button/primary-ledge': 'pink/800', 'button/warm-top': 'sun/300', 'button/warm-bottom': 'sun/500',
  'button/warm-ledge': 'sun/700', 'button/danger-top': 'red/400', 'button/danger-bottom': 'red/500', 'button/danger-ledge': 'red/700', 'button/success-top': 'mint/300', 'button/success-bottom': 'mint/500',
  'button/success-ledge': 'mint/700', 'step/on-top': 'pink/400', 'card/stripe-a': 'pink/300', 'card/stripe-b': 'pink/200',
};

// ------------------------------------------------------------ team + continent modes (color-mix pre-computed)
const util = read('src/ui/util.ts');
const team = [...util.matchAll(/\{ name: '(\w+)', color: '(#[0-9A-Fa-f]{6})' \}/g)].map((m) => ({ name: m[1], color: m[2] }));
const neutral = util.match(/NEUTRAL_COLOR = '(#[0-9A-Fa-f]{6})'/)[1];
team.push({ name: 'Neutral', color: neutral });
const teamModes = Object.fromEntries(team.map(({ name, color }) => [name, {
  'team/base': lit(color), 'team/tint-15': lit(mix(color, 0.15, '#ffffff')), 'team/tint-16': lit(mix(color, 0.16, '#ffffff')), 'team/tint-18': lit(mix(color, 0.18, '#ffffff')),
  'team/ring-55': { hex: color.toLowerCase(), a: 0.55 }, 'team/ring-60': lit(mix(color, 0.6, '#ffffff')), 'team/banner-top': lit(mix(color, 0.7, '#ffffff')),
  'team/curtain-in': lit(mix(color, 0.55, '#ffffff')), 'team/curtain-out': lit(mix(color, 0.85, '#222222')), 'team/glow-40': { hex: color.toLowerCase(), a: 0.4 },
  'team/name': name,
}]));
const mapData = read('src/game/mapData.ts');
const continents = [...mapData.matchAll(/(\w+): \{ id: '\w+', name: '([^']+)', color: '(#[0-9A-Fa-f]{6})', bonus: (\d+)/g)].map((m) => ({ id: m[1], name: m[2], color: m[3], bonus: +m[4] }));
const contModes = Object.fromEntries([...continents, { id: 'Wild', name: '✨ Wild ✨', color: '#c9a4ff', bonus: 0 }].map((c) => [c.id, {
  'cont/base': lit(c.color), 'cont/tint-18': lit(mix(c.color, 0.18, '#ffffff')), 'cont/name': c.name, 'cont/bonus': c.bonus,
  'cont/abbr': c.name.split(' ').map((w) => w[0]).join(''),
}]));

// ------------------------------------------------------------ 3D overlay colours
const scene = read('src/scene/sceneConfig.ts');
const scene3d = {
  'scene/attack': lit(scene.match(/ATTACK_COLOR = '(#\w+)'/)[1]), 'scene/fortify': lit(scene.match(/FORTIFY_COLOR = '(#\w+)'/)[1]),
  'scene/outline-dark': lit('#1d2433'), 'scene/label-outline': lit('#2a2f3a'), 'scene/badge-outline': lit('#ffffff'), 'scene/burst-gold': lit('#ffd84d'),
};

// ------------------------------------------------------------ dimensions + responsive modes
const radius = { 'radius/xs': 4, 'radius/sm': 6, 'radius/md': 10, 'radius/lg': 12, 'radius/panel-sm': +v('r-sm').replace('px', ''), 'radius/card': 14, 'radius/xl': 18,
  'radius/panel': +v('r').replace('px', ''), 'radius/dialog': 24, 'radius/modal': 28, 'radius/hero': 32, 'radius/pill': 999 };
const space = { 'space/2': 2, 'space/3': 3, 'space/4': 4, 'space/5': 5, 'space/6': 6, 'space/7': 7, 'space/8': 8, 'space/10': 10, 'space/12': 12, 'space/14': 14, 'space/16': 16,
  'space/18': 18, 'space/20': 20, 'space/22': 22, 'space/26': 26, 'space/30': 30 };
// Layout collection: one mode per CSS breakpoint (see @media blocks at the end of ui.css).
const layoutModes = ['Desktop', 'Laptop ≤1280', 'Tablet ≤1100', 'Short h≤720', 'Touch'];
const layout = {
  'layout/icon-btn': [42, 42, 36, 42, 46], 'layout/icon-btn-font': [19, 19, 16, 19, 19], 'layout/hud-toggle-gap': [6, 6, 4, 6, 6],
  'layout/step-pad-x': [14, 10, 10, 14, 14], 'layout/step-pad-y': [6, 5, 5, 6, 6], 'layout/step-font': [15, 14, 14, 15, 15],
  'layout/scoreboard-w': [250, 220, 220, 250, 250], 'layout/right-col-w': [290, 260, 260, 290, 290], 'layout/dialog-min-w': [380, 380, 320, 380, 380],
  'layout/banner-font': [36, 36, 36, 28, 36], 'layout/hand-fan-h': [188, 188, 188, 160, 188], 'layout/btn-pad-x': [18, 18, 18, 18, 20], 'layout/btn-pad-y': [9, 9, 9, 9, 11],
};
for (const [q, why] of [['max-width: 1280px', 'Laptop'], ['max-width: 1100px', 'Tablet'], ['max-height: 720px', 'Short'], ['pointer: coarse', 'Touch'], ['max-width: 560px', 'Mobile saves']]) {
  if (!css.includes(q)) drift.push(`breakpoint ${why} (${q}) no longer in ui.css`);
}

// ------------------------------------------------------------ type + effects
const F = 'Fredoka';
const type = {
  'Display/Title 40': [40, 'Bold'], 'Display/Banner 36': [36, 'Bold'], 'Display/Curtain 34': [34, 'Bold'], 'Display/FX pop 40': [40, 'Bold'],
  'Heading/Must trade 24': [24, 'Bold'], 'Heading/Territory 20': [20, 'SemiBold'], 'Heading/Dialog 19': [19, 'Bold'], 'Heading/Panel 18': [18, 'SemiBold'], 'Heading/Section 16': [16, 'Bold'],
  'Body/Button big 19': [19, 'SemiBold'], 'Body/VS 17': [17, 'Medium'], 'Body/Lead 16': [16, 'Regular'], 'Body/Strong 16': [16, 'SemiBold'], 'Body/Input 16': [16, 'Medium'],
  'Body/Button 15': [15, 'SemiBold'], 'Body/Default 15': [15, 'Medium'], 'Body/Small strong 14': [14, 'SemiBold'], 'Body/Small 14': [14, 'Medium'], 'Body/Help 14': [14, 'Regular'],
  'Label/13 strong': [13, 'SemiBold'], 'Label/13': [13, 'Medium'], 'Label/13 regular': [13, 'Regular'], 'Caption/12 strong': [12, 'SemiBold'], 'Caption/12': [12, 'Regular'],
  'Caption/Badge 12': [12, 'Bold'], 'Caption/11': [11, 'Regular'], 'Micro/Tag 10': [10, 'SemiBold', 'UPPER', 0.05], 'Micro/Band 10': [10, 'SemiBold', 'UPPER', 0.06], 'Micro/Unit 10': [10, 'Regular', 'UPPER', 0.08],
  'Micro/Continent 10': [10, 'Bold'], 'Number/Count 24': [24, 'Bold'], 'Number/Stepper 20': [20, 'Bold'], 'Number/Deck 13': [13, 'Bold'], 'Number/Big 22': [22, 'SemiBold'], 'Number/Loss 30': [30, 'Bold'],
};
const typeStyles = Object.fromEntries(Object.entries(type).map(([k, [size, style, tcase, ls]]) => [k, { family: F, style, size, textCase: tcase ?? 'ORIGINAL', letterSpacingEm: ls ?? 0 }]));
const sh = (x, y, blur, spread, color) => ({ x, y, blur, spread, color: typeof color === 'string' ? lit(color) : color });
const effects = {
  'Shadow/Panel': [sh(0, 10, 30, 0, rgba(70, 60, 130, 0.18)), sh(0, 2, 6, 0, rgba(70, 60, 130, 0.1))],
  'Shadow/Button': [sh(0, 3, 0, 0, rgba(80, 70, 140, 0.18)), sh(0, 4, 12, 0, rgba(80, 70, 140, 0.12))],
  'Shadow/Button pressed': [sh(0, 1, 0, 0, rgba(80, 70, 140, 0.2))],
  'Shadow/Button primary': [sh(0, 3, 0, 0, '#c93a66'), sh(0, 6, 16, 0, rgba(240, 80, 127, 0.35))],
  'Shadow/Button warm': [sh(0, 3, 0, 0, '#d48b0b'), sh(0, 6, 14, 0, rgba(255, 180, 40, 0.3))],
  'Shadow/Button danger': [sh(0, 3, 0, 0, '#b8392f')],
  'Shadow/Button success': [sh(0, 3, 0, 0, '#2a9572'), sh(0, 6, 16, 0, rgba(60, 184, 143, 0.35))],
  'Shadow/Icon button': [sh(0, 3, 0, 0, rgba(80, 70, 140, 0.15)), sh(0, 4, 10, 0, rgba(80, 70, 140, 0.12))],
  'Shadow/Icon button on': [sh(0, 4, 10, 0, rgba(240, 80, 127, 0.25))], // + 3px #ff7aa2 outside stroke on the component (Figma ignores spread on non-clipping frames)
  'Shadow/Round button': [sh(0, 2, 0, 0, rgba(80, 70, 140, 0.2))],
  'Shadow/Soft': [sh(0, 2, 6, 0, rgba(80, 70, 140, 0.08))],
  'Shadow/Seg on': [sh(0, 2, 6, 0, rgba(80, 70, 140, 0.15))],
  'Shadow/Step on': [sh(0, 4, 12, 0, rgba(240, 80, 127, 0.3))],
  'Shadow/Step setup on': [sh(0, 4, 12, 0, rgba(60, 184, 143, 0.3))],
  'Shadow/Card': [sh(0, 6, 16, 0, rgba(60, 50, 110, 0.25))],
  'Shadow/Card picked': [sh(0, 0, 0, 4, '#ff7aa2'), sh(0, 12, 24, 0, rgba(240, 80, 127, 0.35))],
  'Shadow/Card suggested': [sh(0, 0, 0, 3, '#ffc94a'), sh(0, 8, 18, 0, rgba(255, 190, 11, 0.35))],
  'Shadow/Die': [sh(0, 3, 0, 0, '#d9d2ee'), sh(0, 4, 10, 0, rgba(80, 70, 140, 0.15))],
  'Shadow/Die on': [sh(0, 0, 0, 3, '#ff7aa2'), sh(0, 3, 0, 0, '#f0a6c0')],
  'Shadow/Swatch': [sh(0, 0, 0, 3, '#ffffff'), sh(0, 2, 6, 0, rgba(0, 0, 0, 0.2))],
  'Shadow/Swatch on': [sh(0, 0, 0, 6, '#2a2f45'), sh(0, 0, 0, 3, '#ffffff')],
  'Shadow/Hint': [sh(0, 2, 8, 0, rgba(200, 150, 0, 0.2))],
  'Shadow/Modal': [sh(0, 20, 60, 0, rgba(40, 30, 90, 0.35))],
  'Shadow/Setup card': [sh(0, 24, 60, 0, rgba(70, 60, 130, 0.25))],
  'Shadow/Hero': [sh(0, 24, 60, 0, rgba(0, 0, 0, 0.3))],
  'Shadow/Game over': [sh(0, 30, 70, 0, rgba(0, 0, 0, 0.3))],
  'Shadow/Confirm': [sh(0, 20, 50, 0, rgba(40, 30, 90, 0.25))],
  'Shadow/Deck count': [sh(0, 2, 6, 0, rgba(60, 50, 110, 0.25))],
  'Shadow/Neighbour': [sh(0, 1, 3, 0, rgba(80, 70, 140, 0.15))],
  'Shadow/Dice loss': [sh(0, 4, 0, 0, rgba(0, 0, 0, 0.18)), sh(0, 6, 14, 0, rgba(0, 0, 0, 0.25))],
  'Blur/Glass 14': 'blur14', 'Blur/Backdrop 4': 'blur4',
};
// Glass surfaces = drop shadows + backdrop-filter blur in one style (Figma allows one effect style per node).
const glass = (shadow, blur) => [...effects[shadow], { backgroundBlur: blur }];
Object.assign(effects, {
  'Elevation/Glass panel': glass('Shadow/Panel', 14),
  'Elevation/Glass setup': glass('Shadow/Setup card', 16),
  'Elevation/Backdrop': [{ backgroundBlur: 4 }],
});
const gradients = {
  'Gradient/Button primary': ['button/primary-top', 'button/primary-bottom'], 'Gradient/Button warm': ['button/warm-top', 'button/warm-bottom'],
  'Gradient/Button danger': ['button/danger-top', 'button/danger-bottom'], 'Gradient/Button success': ['button/success-top', 'button/success-bottom'],
  'Gradient/Step on': ['step/on-top', 'button/primary-bottom'], 'Gradient/Step setup on': ['button/success-top', 'button/success-bottom'],
  'Gradient/Odds': ['accent/sun', 'accent/mint'], 'Gradient/Wild band': ['wild/pink', 'violet/500', 'wild/aqua'], 'Gradient/Wild card': ['wild/rose', 'violet/100', 'wild/ice'],
};

// code-to-figma tokens schema (engine 00-foundations): palettes = one group per member on single-mode plans
const roles = (modes) => Object.fromEntries(Object.entries(modes).map(([m, vals]) => [m, Object.fromEntries(Object.entries(vals).map(([k, val]) => [k.split('/')[1], val]))]));
const tokens = {
  generatedFrom: ['src/ui/ui.css', 'src/ui/util.ts', 'src/game/mapData.ts', 'src/scene/sceneConfig.ts'],
  font: { family: F, styles: ['Regular', 'Medium', 'SemiBold', 'Bold'], cssVar: '--font' },
  primitives, semantic,
  codeSyntax: { // variables that exist as CSS custom properties in ui.css
    'base/ink': '--ink', 'base/ink-soft': '--ink-soft', 'base/panel-82': '--panel', 'base/cream': '--panel-solid', 'base/line-16': '--line',
    'pink/500': '--pink', 'pink/600': '--pink-deep', 'mint/400': '--mint', 'sun/400': '--sun', 'sky/400': '--sky',
    'text/primary': '--ink', 'text/secondary': '--ink-soft', 'surface/panel': '--panel', 'surface/solid': '--panel-solid', 'border/line': '--line',
    'accent/pink': '--pink', 'accent/pink-deep': '--pink-deep', 'accent/mint': '--mint', 'accent/sun': '--sun', 'accent/sky': '--sky',
  },
  palettes: {
    Team: { prefix: 'team', cssVar: { base: '--pc' }, groups: roles(teamModes) },
    Continent: { prefix: 'cont', cssVar: { base: '--cc' }, groups: roles(contModes) },
  },
  extraColors: scene3d,
  radius, space,
  layout: { modes: ['desktop', 'laptop', 'tablet', 'short', 'touch'], labels: layoutModes, values: Object.fromEntries(Object.entries(layout).map(([k, val]) => [k.replace('layout/', ''), val])) },
  typeStyles, effects, gradients,
  gradientAngles: { 'Gradient/Odds': 90, 'Gradient/Wild band': 90, 'Gradient/Wild card': 160 },
  cssVars,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(tokens, null, 1));
console.log(`tokens → ${path.relative(root, out)}: ${Object.keys(primitives).length} primitives, ${Object.keys(semantic).length} semantic, ${team.length} team modes, ${Object.keys(contModes).length} continent modes, ${Object.keys(typeStyles).length} text styles, ${Object.keys(effects).length} effects`);
console.log(drift.length ? `DRIFT (${drift.length}):\n  ${drift.join('\n  ')}` : 'no drift: every named literal still exists in the code');
