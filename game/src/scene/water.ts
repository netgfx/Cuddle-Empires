// Subtle animated water for the board's Ocean mesh: soft drifting caustics, slow tint swells, a
// faint ripple in the normal for moving glints, and a thin foam line with small waves rolling in
// to every coast. Patched into the GLB's standard material so the baked texture, lighting and
// shadows stay as they are; only the upward-facing top is affected.
import { DataTexture, LinearFilter, type Material, type Mesh, type MeshStandardMaterial, RedFormat, Vector3 } from 'three';
import { BOARD } from './sceneConfig';

/** Distance-to-coast field: covers the board top-down, stores metres / SHORE_MAX as 0..1. */
const SHORE_W = 1024, SHORE_H = 512;
const SHORE_MAX = 0.05;

function farField(): DataTexture {
  const t = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat);
  t.needsUpdate = true;
  return t;
}

export const waterUniforms = { uWaterTime: { value: 0 }, uShore: { value: farField() } };

/** 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3();

/** Rasterises the land meshes top-down and turns them into a distance-to-coast texture for the foam. */
export function setShoreFromLand(land: Mesh[]) {
  const cv = document.createElement('canvas');
  cv.width = SHORE_W; cv.height = SHORE_H;
  const g = cv.getContext('2d');
  if (!g) return;
  const sx = SHORE_W / (2 * BOARD.halfW), sz = SHORE_H / (2 * BOARD.halfD);
  const px = (v: Vector3) => (v.x + BOARD.halfW) * sx, pz = (v: Vector3) => (v.z + BOARD.halfD) * sz;
  g.fillStyle = '#fff';
  for (const m of land) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      _b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      _c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      g.beginPath();
      g.moveTo(px(_a), pz(_a)); g.lineTo(px(_b), pz(_b)); g.lineTo(px(_c), pz(_c));
      g.closePath();
      g.fill();
    }
  }
  const img = g.getImageData(0, 0, SHORE_W, SHORE_H).data;
  const N = SHORE_W * SHORE_H, INF = 1e12;
  const grid = new Float32Array(N);
  for (let i = 0; i < N; i++) grid[i] = img[i * 4] > 127 ? 0 : INF;
  const n = Math.max(SHORE_W, SHORE_H);
  const f = new Float32Array(n), d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  for (let x = 0; x < SHORE_W; x++) {
    for (let y = 0; y < SHORE_H; y++) f[y] = grid[y * SHORE_W + x];
    edt1d(f, SHORE_H, d, v, z);
    for (let y = 0; y < SHORE_H; y++) grid[y * SHORE_W + x] = d[y];
  }
  for (let y = 0; y < SHORE_H; y++) {
    const row = y * SHORE_W;
    for (let x = 0; x < SHORE_W; x++) f[x] = grid[row + x];
    edt1d(f, SHORE_W, d, v, z);
    for (let x = 0; x < SHORE_W; x++) grid[row + x] = d[x];
  }
  const out = new Uint8Array(N);
  const toUnit = 1 / (sx * SHORE_MAX); // px → fraction of SHORE_MAX (sx == sz)
  for (let i = 0; i < N; i++) out[i] = Math.round(Math.min(1, Math.sqrt(grid[i]) * toUnit) * 255);
  const tex = new DataTexture(out, SHORE_W, SHORE_H, RedFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  waterUniforms.uShore.value.dispose();
  waterUniforms.uShore.value = tex;
}

const VERT_HEAD = /* glsl */ `
varying vec2 vWaterXZ;
varying float vWaterUp;
`;

const VERT_BODY = /* glsl */ `
vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
vWaterUp = normal.y;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uWaterTime;
uniform sampler2D uShore;
varying vec2 vWaterXZ;
varying float vWaterUp;

// Tileable water caustic (after Dave Hoskins / joltz0r), uv tiles every 1.0.
float waterCaustic(vec2 uv, float time) {
  const float TAU = 6.28318530718;
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float waterNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Gentle swell height field gradient (world units), for the normal ripple.
vec2 waterSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 34.0 + t * 1.1);
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 47.0 + t * 1.4) * 0.7;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 63.0 + t * 1.7) * 0.45;
  return g;
}
`;

const FRAG_COLOR = /* glsl */ `
float waterMask = smoothstep(0.6, 0.95, vWaterUp);
if (waterMask > 0.0) {
  float wt = uWaterTime;
  // slow broad swells of lighter / deeper tint
  float swell = sin(vWaterXZ.x * 5.0 + wt * 0.35) * sin(vWaterXZ.y * 7.0 - wt * 0.27)
              + 0.5 * sin((vWaterXZ.x + vWaterXZ.y) * 11.0 + wt * 0.5);
  diffuseColor.rgb *= 1.0 + 0.035 * swell * waterMask;
  // soft caustic light lines, two layers drifting against each other
  float c1 = waterCaustic(vWaterXZ * 2.6 + vec2(wt * 0.012, 0.0), wt * 0.22 + 23.0);
  float c2 = waterCaustic(vWaterXZ * 1.7 - vec2(0.0, wt * 0.009), wt * 0.17 + 7.0);
  float caustic = c1 * 0.65 + c2 * 0.35;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 1.0, 0.97), caustic * 0.16 * waterMask);

  // shoreline: distance to the nearest coast (metres), wobbled so the foam is not a perfect outline
  vec2 shoreUv = (vWaterXZ + vec2(${BOARD.halfW.toFixed(3)}, ${BOARD.halfD.toFixed(3)})) / vec2(${(2 * BOARD.halfW).toFixed(3)}, ${(2 * BOARD.halfD).toFixed(3)});
  float wob = waterNoise(vWaterXZ * 70.0 + vec2(wt * 0.15, -wt * 0.1));
  float sd = texture2D(uShore, shoreUv).r * ${SHORE_MAX.toFixed(3)} + (wob - 0.5) * 0.004;
  float shallow = 1.0 - smoothstep(0.0, 0.03, sd);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.06 + 0.025, shallow * 0.6 * waterMask);
  // each stretch of coast gets its own wave timing, so crests never ring a whole island at once
  float wavePh = waterNoise(vWaterXZ * 9.0) * 12.566 + waterNoise(vWaterXZ * 23.0 + 5.3) * 3.0;
  // waves come in drifting sets: only some patches of coast are getting surf at any moment
  float sets = smoothstep(0.3, 0.75, waterNoise(vWaterXZ * 6.5 + vec2(wt * 0.045, -wt * 0.035)));
  // thin foam line hugging the coast, swelling as that stretch's waves arrive
  float wash = 0.5 + 0.5 * sin(wt * 1.3 + wavePh + wob * 2.0);
  float rim = 1.0 - smoothstep(0.0012, 0.0032 + 0.0022 * wash * (0.4 + 0.6 * sets), sd);
  // small wave crests rolling in towards the shore, broken up and fading as they approach
  float crest = smoothstep(0.86, 1.0, sin(sd * 240.0 + wt * 1.5 + wavePh));
  crest *= (1.0 - smoothstep(0.008, 0.022, sd)) * smoothstep(0.002, 0.006, sd) * sets;
  crest *= smoothstep(0.35, 0.75, waterNoise(vWaterXZ * 110.0 + vec2(-wt * 0.2, wt * 0.17)));
  float foam = max(rim * 0.5, crest * 0.28) * waterMask;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam);
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, waterMask);
`;

const FRAG_NORMAL = /* glsl */ `
if (waterMask > 0.0) {
  vec2 ws = waterSlope(vWaterXZ, uWaterTime) * 0.045 * waterMask;
  normal = normalize(normal + (viewMatrix * vec4(-ws.x, 0.0, -ws.y, 0.0)).xyz);
}
`;

/** Clone `base` and turn it into the animated water material. Drive it via `waterUniforms`. */
export function makeWaterMaterial(base: Material): MeshStandardMaterial {
  const mat = (base as MeshStandardMaterial).clone();
  mat.name = 'Water';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterUniforms.uWaterTime;
    shader.uniforms.uShore = waterUniforms.uShore;
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
  };
  mat.customProgramCacheKey = () => 'cuddle-water';
  return mat;
}
