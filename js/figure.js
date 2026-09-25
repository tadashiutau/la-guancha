// One figure builder for the player and every NPC: chibi proportions, a face with some life (eyes
// with an iris and a glint, brows, a smile), clothes with a little detail, smooth shading. Each rig
// part is baked into a single vertex-colored mesh so a crowd stays cheap to draw. The rig is what
// the animations expect: root > inner (height) > body (hips) > headPivot / arms / legs; the player
// also gets its eyes as separate pieces so it can blink.
//
// look: { skin, hair, eyes, style, face, glasses, build, height, top, shirt, bottom (or shorts),
//         legs, shoes, extra }  plus NPC-only: dress, apron, hat, hatColor, stache, hairy,
//         hanky (back-pocket bandana color), towel, scale
import * as THREE from 'three';
import { Batch } from './geo.js';

const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

// smooth-shaded primitives (the world's P.* are flat-shaded on purpose; people look better round)
const cache = new Map();
function sm(name, make) {
  let g = cache.get(name);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    cache.set(name, g);
  }
  return g;
}
const RAW = {
  ball: (w, h) => sm(`b${w}_${h}`, () => new THREE.SphereGeometry(0.5, w, h)),
  // top cap of a sphere, t = fraction of the half-turn from the pole
  cap: (t, w, h) => sm(`c${t}_${w}_${h}`, () => new THREE.SphereGeometry(0.5, w, h, 0, Math.PI * 2, 0, Math.PI * t)),
  band: (t0, t1, w) => sm(`bd${t0}_${t1}_${w}`, () => new THREE.SphereGeometry(0.5, w, 5, 0, Math.PI * 2, Math.PI * t0, Math.PI * (t1 - t0))),
  tube: (top, n) => sm(`t${top}_${n}`, () => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, n)),
  pill: (k, n, cs) => sm(`p${k}_${n}_${cs}`, () => new THREE.CapsuleGeometry(0.5, k, cs, n)), // radius 0.5, straight part k
  ring: (tube, arc, n, rs) => sm(`r${tube}_${arc}_${n}_${rs}`, () => new THREE.TorusGeometry(0.5, tube, rs, n, Math.PI * 2 * arc)),
  box: () => sm('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cone: n => sm(`cn${n}`, () => new THREE.ConeGeometry(0.5, 1, n)),
  lathe: (name, pts, n) => sm(name + n, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n)),
};
// full detail for the player (seen up close); NPCs get the same shapes with fewer segments
const k = (v, f, lo) => Math.max(lo, Math.round(v * f));
const HI = {
  ball: (w = 14, h = 10) => RAW.ball(w, h), cap: (t, w = 18) => RAW.cap(t, w, 9), band: (t0, t1, w = 18) => RAW.band(t0, t1, w),
  tube: (top = 1, n = 12) => RAW.tube(top, n), pill: (kk, n = 10) => RAW.pill(kk, n, 4), ring: (tube, arc = 1, n = 16) => RAW.ring(tube, arc, n, 6),
  box: RAW.box, cone: (n = 8) => RAW.cone(n), lathe: (name, pts) => RAW.lathe(name, pts, 16),
};
const LO = {
  ball: (w = 14, h = 10) => RAW.ball(k(w, 0.55, 5), k(h, 0.55, 3)), cap: t => RAW.cap(t, 10, 5), band: (t0, t1) => RAW.band(t0, t1, 10),
  tube: (top = 1, n = 12) => RAW.tube(top, k(n, 0.55, 5)), pill: kk => RAW.pill(kk, 5, 2), ring: (tube, arc = 1, n = 16) => RAW.ring(tube, arc, k(n, 0.5, 5), 3),
  box: RAW.box, cone: (n = 8) => RAW.cone(k(n, 0.7, 4)), lathe: (name, pts) => RAW.lathe(name, pts, 9), // 9 = tube(16) here, so the waistband lines up
};
let G = HI;

const C = c => new THREE.Color(c);
const shade = (c, k) => C(c).multiplyScalar(k).getHex();
const mix = (a, b, t) => C(a).lerp(C(b), t).getHex();

// the options the character creator offers (NPCs draw from these too)
export const STYLES = ['corto', 'rapado', 'copete', 'rizos', 'afro', 'ondas', 'largo', 'coleta', 'mono', 'trenzas', 'dreads', 'cresta', 'calvo'];
export const FACES = ['nada', 'bigote', 'bigotazo', 'chiva', 'candado', 'barbita', 'barba'];
export const TOPS = ['guayabera', 'camiseta', 'polo', 'hawaiana', 'esqueleto', 'sincamisa'];

const BUILD = { // torso width, depth, shoulder spread, arm and leg thickness
  flaco: [0.88, 0.84, 0.93, 0.88, 0.92],
  normal: [1, 0.9, 1, 1, 1],
  fornido: [1.14, 0.96, 1.12, 1.28, 1.1],
  gordito: [1.12, 1.02, 1.06, 1.12, 1.08],
};
const HEIGHT = { bajito: 0.92, normal: 1, alto: 1.08 };

// torso profile (radius, height) turned around the spine
const TORSO = [[0.001, 0], [0.2, 0], [0.214, 0.06], [0.222, 0.2], [0.219, 0.31], [0.203, 0.375], [0.158, 0.425], [0.085, 0.452], [0.001, 0.458]];
const rAt = y => {
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
    if (y <= y1) return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0);
  }
  return 0.001;
};

// mono: tint everything one color (the bronze statue)
const bakeRaw = (fn, mono) => {
  const b = new Batch(1e7);
  if (mono) { const add = b.add.bind(b); b.add = (g, c, ...r) => add(g, mix(mono, c, 0.12), ...r); }
  fn(b);
  const gr = b.build(mat, { cast: true, receive: false });
  const m = gr.children[0] || new THREE.Mesh();
  m.matrixAutoUpdate = true;
  return m;
};

export function normalizeLook(look) {
  const L = { ...look };
  L.bottom ??= L.shorts ?? 0x2a3a5a;
  L.eyes ??= 0x4a2e1c;
  L.style ??= L.dress ? 'largo' : 'corto';
  L.face ??= L.stache ? 'bigote' : 'nada';
  L.top ??= L.dress ? 'camiseta' : 'guayabera';
  L.build = BUILD[L.build] ? L.build : 'normal';
  L.height = HEIGHT[L.height] ? L.height : 'normal';
  L.legs ??= 'cortos';
  L.shoes ??= 'tenis';
  return L;
}

// hat slot height over the head pivot (big hair lifts the pava)
export const hatLift = style => ({ afro: 0.1, copete: 0.05, rizos: 0.03, mono: 0.02, cresta: 0.06 }[style] || 0);

export function buildFigure(look, { blink = false } = {}) {
  const L = normalizeLook(look);
  G = blink ? HI : LO;
  const bake = fn => bakeRaw(fn, L.mono);
  const [w, d, sp, armK, legK] = BUILD[L.build];
  const skin = L.skin, hair = L.hair, shirt = L.shirt, bottom = L.bottom;
  const skinDark = shade(skin, 0.86);
  const bare = L.top === 'sincamisa';
  const sleeveless = bare || L.top === 'esqueleto';
  const body0 = bare ? skin : shirt;
  const trim = shade(shirt, 0.82), light = mix(shirt, 0xffffff, 0.45);
  // z of the torso surface at (x, y), so details sit on the cloth
  const zAt = (x, y, out = 0.004) => {
    const r = rAt(y) * w;
    return d * rAt(y) * Math.sqrt(Math.max(0, 1 - (x / r) ** 2)) + out;
  };

  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(HEIGHT[L.height]);
  root.add(inner);
  const body = new THREE.Group();
  body.position.y = 0.52;
  inner.add(body);

  // ---------------------------------------------------------------- torso
  const torso = bake(b => {
    b.add(G.lathe('torso', TORSO), body0, 0, 0, 0, w, 1, d);
    if (L.build === 'gordito') b.add(G.ball(), body0, 0, 0.13, 0.05 * d, 0.4 * w, 0.34, 0.36);
    // waistband and shorts top
    b.add(G.tube(1, 16), bottom, 0, 0.035, 0, 0.43 * w, 0.085, 0.43 * d);
    b.add(G.tube(1, 16), shade(bottom, 0.8), 0, 0.075, 0, 0.432 * w, 0.012, 0.432 * d);
    // neck
    b.add(G.tube(1, 10), skin, 0, 0.47, 0, 0.15, 0.1, 0.14);
    if (L.dress) b.add(G.tube(0.6, 16), bottom, 0, -0.08, 0, 0.72 * w, 0.42, 0.7 * d);
    if (L.apron) b.add(G.box(), 0xffffff, 0, 0.1, zAt(0, 0.1), 0.34 * w, 0.42, 0.025);
    const front = (x, y, sx, sy, col, sz = 0.012) => b.add(G.box(), col, x, y, zAt(x, y, sz / 2), sx, sy, sz, 0);
    const pleat = x => front(x, 0.22, 0.016, 0.3, light);
    if (L.top === 'guayabera') {
      front(0, 0.22, 0.03, 0.36, light);
      pleat(-0.13 * w); pleat(-0.085 * w); pleat(0.085 * w); pleat(0.13 * w);
      front(-0.11 * w, 0.1, 0.075, 0.06, trim, 0.014); front(0.11 * w, 0.1, 0.075, 0.06, trim, 0.014); // pockets
      for (const s of [-1, 1]) b.add(G.box(), light, 0.045 * s, 0.43, 0.1 * d, 0.07, 0.02, 0.06, 0.5 * s, -0.5); // collar
    } else if (L.top === 'camiseta') {
      b.add(G.ring(0.14, 1, 18), trim, 0, 0.445, 0.005, 0.2, 0.2, 0.19, 0, Math.PI / 2 - 0.25);
    } else if (L.top === 'polo') {
      for (const s of [-1, 1]) b.add(G.box(), light, 0.055 * s, 0.438, 0.08 * d, 0.1, 0.022, 0.08, 0.35 * s, -0.35);
      front(0, 0.37, 0.028, 0.1, trim);
      for (const y of [0.35, 0.39]) front(0, y, 0.014, 0.014, 0xf6f2e8, 0.02);
    } else if (L.top === 'hawaiana') {
      const FLOWERS = [0xffffff, 0xf7e36a, 0xff9ec4, 0x9fe3ff];
      let s = 7;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0, n = blink ? 26 : 14; i < n; i++) {
        const a = (r() - 0.5) * 2 * Math.PI, y = 0.07 + r() * 0.31;
        const rr = rAt(y);
        b.add(G.tube(1, 8), FLOWERS[i % 4], Math.sin(a) * rr * w * 1.01, y, Math.cos(a) * rr * d * 1.01, 0.055, 0.008, 0.055, a, Math.PI / 2);
      }
      b.add(G.box(), skin, 0, 0.41, zAt(0, 0.41, -0.004), 0.07, 0.07, 0.02, 0, 0, Math.PI / 4); // open collar
      for (const s of [-1, 1]) b.add(G.box(), light, 0.05 * s, 0.425, 0.1 * d, 0.075, 0.018, 0.07, 0.6 * s, -0.4);
    } else if (L.top === 'esqueleto') {
      b.add(G.ball(), skin, 0, 0.4, 0.07 * d, 0.2 * w, 0.1, 0.13); // neckline
      for (const s of [-1, 1]) b.add(G.ball(), skin, 0.16 * w * s, 0.385, 0, 0.13, 0.12, 0.2); // bare shoulders
    } else if (bare) {
      for (const s of [-1, 1]) {
        b.add(G.ball(8, 6), shade(skin, 0.8), 0.095 * w * s, 0.29, zAt(0.095 * w, 0.29, -0.004), 0.022, 0.022, 0.01);
        b.add(G.box(), shade(skin, 0.93), 0.07 * w * s, 0.26, zAt(0.07 * w, 0.26, -0.003), 0.11, 0.008, 0.01, 0, 0, 0.18 * s); // pec line
      }
      b.add(G.ball(8, 6), shade(skin, 0.7), 0, 0.13, zAt(0, 0.13, -0.002), 0.022, 0.03, 0.012);
      if (L.hairy) {
        const fur = mix(skin, hair, 0.55);
        b.add(G.ball(), fur, 0, 0.3, zAt(0, 0.3, -0.018), 0.2 * w, 0.14, 0.05);
        b.add(G.pill(2, 6), fur, 0, 0.17, zAt(0, 0.17, -0.004), 0.018, 0.1, 0.01);
      }
    }
    if (L.extra === 'cadena') {
      b.add(G.ring(0.08, 1, 20), 0xf2c14e, 0, 0.445, 0.025, 0.3 * w, 0.3, 0.3 * d, 0, Math.PI / 2 - 0.45);
      b.add(G.ball(8, 6), 0xf2c14e, 0, 0.385, zAt(0, 0.385, 0.012), 0.03, 0.04, 0.02);
    }
    if (L.hanky) { // a bandana hanging from the back pocket
      b.add(G.box(), L.hanky, 0.09 * w, -0.03, -zAt(0.09 * w, 0.03, 0.006), 0.065, 0.13, 0.014, 0, 0.08);
      b.add(G.box(), L.hanky, 0.09 * w, -0.1, -zAt(0.09 * w, 0.03, 0.006), 0.045, 0.045, 0.012, 0, 0.08, Math.PI / 4);
    }
    if (L.towel) { // a towel over the left shoulder
      b.add(G.box(), L.towel, -0.18 * w, 0.33, 0, 0.09, 0.32, 0.3 * d + 0.12, 0, 0, 0.35);
      b.add(G.box(), shade(L.towel, 0.8), -0.18 * w, 0.33, 0, 0.092, 0.03, 0.3 * d + 0.122, 0, 0, 0.35);
    }
  });
  body.add(torso);

  // ---------------------------------------------------------------- head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.44;
  body.add(headPivot);
  const hy = 0.18; // head center
  const eyeX = 0.083, eyeY = 0.205, eyeZ = 0.195;
  const eyeParts = (b, ox = 0, oy = 0, oz = 0) => {
    b.add(G.ball(12, 10), 0xffffff, ox, oy, oz, 0.092, 0.112, 0.06);
    b.add(G.ball(10, 8), L.eyes, ox, oy - 0.004, oz + 0.022, 0.058, 0.066, 0.03);
    if (blink) b.add(G.ball(8, 6), 0x141414, ox, oy - 0.004, oz + 0.03, 0.03, 0.034, 0.02); // pupil (NPCs: iris only)
    b.add(G.ball(6, 4), 0xffffff, ox + 0.012, oy + 0.014, oz + 0.037, 0.016, 0.016, 0.01);
  };
  const head = bake(b => {
    b.add(G.ball(20, 16), skin, 0, hy, 0, 0.47, 0.46, 0.47);
    for (const s of [-1, 1]) b.add(G.ball(10, 8), skin, 0.232 * s, 0.17, 0, 0.06, 0.1, 0.085); // ears
    b.add(G.ball(10, 8), skinDark, 0, 0.148, 0.226, 0.085, 0.08, 0.075); // nose
    b.add(G.ring(0.2, 0.5, 12), 0x6b2a24, 0, 0.09, 0.212, 0.07, 0.06, 0.05, 0, -0.25, Math.PI); // smile
    if (!blink) for (const s of [-1, 1]) eyeParts(b, eyeX * s, eyeY, eyeZ);
    for (const s of [-1, 1]) b.add(G.pill(2.4, 6), hair, 0.085 * s, 0.286, 0.198, 0.032, 0.022, 0.024, 0, -0.2, Math.PI / 2 - 0.13 * s); // brows
    if (L.extra === 'arete') b.add(G.ball(8, 6), 0xf2c14e, -0.24, 0.105, 0.015, 0.036, 0.036, 0.036);
    hairParts(b, L, hy);
    faceHair(b, L, hy);
    glasses(b, L);
    npcHat(b, L);
  });
  headPivot.add(head);
  const eyes = [];
  if (blink) {
    for (const s of [-1, 1]) {
      const e = bake(b => eyeParts(b));
      e.position.set(eyeX * s, eyeY, eyeZ);
      headPivot.add(e);
      eyes.push(e);
    }
  }
  const hatSlot = new THREE.Group();
  hatSlot.position.set(0, 0.36 + hatLift(L.style), 0);
  headPivot.add(hatSlot);

  // ---------------------------------------------------------------- arms and legs
  const arms = [], legs = [];
  const sleeve = sleeveless ? skin : shirt;
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(0.25 * sp * s, 0.37, 0);
    a.add(bake(b => {
      const k = armK;
      b.add(G.ball(10, 8), sleeve, 0, -0.005, 0, 0.155 * k, 0.15 * k, 0.155 * k);
      if (sleeveless) b.add(G.pill(1.4, 8), skin, 0, -0.1, 0, 0.12 * k, 0.12, 0.12 * k);
      else b.add(G.tube(1.06, 12), sleeve, 0, -0.08, 0, 0.16 * k, 0.17, 0.16 * k);
      b.add(G.pill(1.6, 8), skin, 0, -0.245, 0, 0.105 * k, 0.1, 0.105 * k);
      b.add(G.ball(10, 8), skin, 0, -0.365, 0.004, 0.125, 0.14, 0.11); // hand
      if (L.top === 'hawaiana' || L.top === 'guayabera') b.add(G.tube(1, 12), trim, 0, -0.16, 0, 0.162 * k, 0.012, 0.162 * k);
      if (L.extra === 'reloj' && s < 0) {
        b.add(G.tube(1, 10), 0x2a2a2a, 0, -0.31, 0, 0.115, 0.03, 0.115);
        b.add(G.tube(1, 10), 0xd8d8d8, -0.055, -0.31, 0, 0.012, 0.04, 0.04, 0, 0, Math.PI / 2);
      }
    }));
    body.add(a); arms.push(a);

    const l = new THREE.Group();
    l.position.set(0.1 * w * s, 0, 0);
    l.add(bake(b => {
      const k = legK;
      if (!L.dress) {
        if (L.legs === 'largos') b.add(G.tube(0.82, 12), bottom, 0, -0.19, 0, 0.2 * k, 0.4, 0.2 * k);
        else {
          b.add(G.tube(0.92, 12), bottom, 0, -0.08, 0, 0.21 * k, 0.2, 0.21 * k);
          b.add(G.tube(1, 12), shade(bottom, 0.85), 0, -0.175, 0, 0.196 * k, 0.014, 0.196 * k);
        }
      }
      if (L.legs !== 'largos' || L.dress) b.add(G.pill(2, 8), skin, 0, -0.3, 0, 0.11 * k, 0.12, 0.11 * k);
      shoes(b, L, s);
    }));
    body.add(l); legs.push(l);
  }
  return { root, inner, body, headPivot, hatSlot, arms, legs, torso, head, eyes, brows: [], look: L };
}

function shoes(b, L, s) {
  if (L.shoes === 'chancletas') {
    b.add(G.ball(10, 8), L.skin, 0, -0.455, 0.045, 0.11, 0.07, 0.21);
    b.add(G.box(), 0x2f6fd0, 0, -0.49, 0.045, 0.125, 0.026, 0.25);
    b.add(G.box(), 0x2f6fd0, 0, -0.45, 0.085, 0.118, 0.02, 0.024, 0, 0, 0);
  } else if (L.shoes === 'zapatos') {
    b.add(G.ball(12, 8), 0x4a2a1a, 0, -0.445, 0.045, 0.14, 0.1, 0.25);
    b.add(G.box(), 0x2a1a10, 0, -0.488, 0.045, 0.145, 0.028, 0.26);
  } else { // tenis
    const accent = L.top === 'sincamisa' ? L.bottom : L.shirt;
    b.add(G.ball(12, 8), 0xf4f2ee, 0, -0.44, 0.045, 0.145, 0.11, 0.26);
    b.add(G.box(), 0xdad6ce, 0, -0.487, 0.045, 0.15, 0.03, 0.27);
    b.add(G.box(), accent, 0.073 * s, -0.445, 0.035, 0.008, 0.035, 0.12);
    b.add(G.box(), 0xffffff, 0, -0.398, 0.085, 0.06, 0.012, 0.07, 0, -0.35);
  }
}

// ---------------------------------------------------------------- hair
function hairParts(b, L, hy) {
  const hair = L.hair, st = L.style;
  // the cap tilts back so the hairline sits above the brows and covers the crown
  const capOn = (r, t, col = hair, tilt = 0.45) => b.add(G.cap(t), col, 0, hy + 0.005, -0.012, r * 2, r * 2, r * 2, 0, -tilt);
  const burns = col => { for (const s of [-1, 1]) b.add(G.box(), col, 0.222 * s, hy - 0.03, 0.06, 0.03, 0.09, 0.05); };
  if (st === 'calvo') {
    b.add(G.ring(0.2, 0.5, 14), hair, 0, hy + 0.01, -0.04, 0.42, 0.42, 0.42, Math.PI, Math.PI / 2);
    return;
  }
  if (st === 'rapado') { capOn(0.238, 0.44, mix(hair, L.skin, 0.35)); burns(mix(hair, L.skin, 0.35)); return; }
  if (st === 'cresta') {
    capOn(0.237, 0.44, mix(hair, L.skin, 0.55));
    for (let i = 0; i < 6; i++) {
      const a = -0.55 + i * 0.36; // along the crown, front to back
      b.add(G.cone(6), hair, 0, hy + Math.cos(a) * 0.25, Math.sin(-a) * 0.25 + 0.0, 0.07, 0.17 - Math.abs(i - 2) * 0.012, 0.13, 0, -a);
    }
    return;
  }
  capOn(0.247, st === 'largo' || st === 'ondas' ? 0.5 : 0.46);
  if (st === 'corto') {
    b.add(G.ball(), hair, 0.03, hy + 0.17, 0.12, 0.3, 0.09, 0.15, 0.25, -0.55);
    burns(hair);
  } else if (st === 'copete') {
    b.add(G.ball(), hair, 0, hy + 0.2, 0.09, 0.3, 0.18, 0.3, 0, -0.4);
    b.add(G.ball(), hair, 0, hy + 0.24, 0.01, 0.26, 0.14, 0.3);
    burns(hair);
  } else if (st === 'rizos') {
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, rr = i % 2 ? 0.17 : 0.2, y = hy + (i % 2 ? 0.2 : 0.15);
      b.add(G.ball(8, 6), hair, Math.cos(a) * rr, y, Math.sin(a) * rr - 0.03, 0.13, 0.13, 0.13);
    }
    b.add(G.ball(8, 6), hair, 0, hy + 0.25, -0.02, 0.16, 0.12, 0.16);
  } else if (st === 'afro') {
    b.add(G.ball(16, 12), hair, 0, hy + 0.12, -0.075, 0.64, 0.56, 0.6);
  } else if (st === 'ondas') {
    for (let i = 0; i < 4; i++) b.add(G.ball(), hair, -0.12 + i * 0.08, hy + 0.2 - (i % 2) * 0.02, 0.1 - i * 0.012, 0.13, 0.08, 0.12, 0, -0.5);
    for (const s of [-1, 1]) b.add(G.ball(), hair, 0.2 * s, hy - 0.02, -0.03, 0.1, 0.24, 0.2);
  } else if (st === 'largo') {
    b.add(G.ball(14, 10), hair, 0, hy - 0.07, -0.095, 0.48, 0.56, 0.3);
    for (const s of [-1, 1]) b.add(G.ball(), hair, 0.2 * s, hy - 0.08, -0.01, 0.12, 0.36, 0.22);
    b.add(G.ball(), hair, 0.04, hy + 0.16, 0.13, 0.3, 0.08, 0.14, 0.3, -0.6);
  } else if (st === 'coleta') {
    b.add(G.ball(8, 6), shade(hair, 0.7), 0, hy + 0.12, -0.22, 0.1, 0.1, 0.1);
    b.add(G.ball(12, 8), hair, 0, hy + 0.0, -0.27, 0.13, 0.32, 0.13, 0, 0.35);
  } else if (st === 'mono') {
    b.add(G.ball(12, 10), hair, 0, hy + 0.22, -0.13, 0.22, 0.2, 0.22);
  } else if (st === 'trenzas') {
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) b.add(G.ball(8, 6), hair, 0.16 * s, hy - 0.04 - k * 0.07, -0.1 - k * 0.015, 0.09 - k * 0.006, 0.09, 0.09 - k * 0.006);
  } else if (st === 'dreads') {
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (0.35 + i / 15 * 1.3); // around the sides and back
      const x = Math.cos(a) * 0.22, z = -Math.abs(Math.sin(a)) * 0.2 - 0.02;
      b.add(G.pill(5, 6), hair, x, hy - 0.05 - (i % 3) * 0.02, z, 0.05, 0.05, 0.05, 0, Math.sin(a) * 0.12, -Math.cos(a) * 0.15);
    }
  }
}

function faceHair(b, L, hy) {
  const f = L.face, hair = L.hair;
  if (f === 'nada') return;
  const stubble = mix(L.skin, hair, 0.55);
  const jaw = col => b.add(G.band(0.55, 0.92), col, 0, hy, 0.012, 0.5, 0.49, 0.49);
  const stache = (sx = 0.16, col = hair) => b.add(G.ball(), col, 0, 0.108, 0.219, sx, 0.045, 0.05);
  if (f === 'barbita') { jaw(stubble); stache(0.15, stubble); return; }
  stache(f === 'bigotazo' ? 0.2 : 0.16);
  if (f === 'bigotazo') for (const s of [-1, 1]) b.add(G.ball(8, 6), hair, 0.105 * s, 0.122, 0.2, 0.05, 0.05, 0.04);
  if (f === 'chiva' || f === 'candado') b.add(G.ball(), hair, 0, 0.022, 0.158, 0.085, 0.085, 0.06);
  if (f === 'candado') for (const s of [-1, 1]) b.add(G.pill(2, 6), hair, 0.06 * s, 0.06, 0.19, 0.024, 0.026, 0.024, 0, -0.3, 0.3 * s);
  if (f === 'barba') jaw(hair);
}

function glasses(b, L) {
  if (!L.glasses || L.glasses === 'nada') return;
  const frame = 0x262626;
  if (L.glasses === 'sol') {
    for (const s of [-1, 1]) b.add(G.ball(12, 8), 0x141414, 0.083 * s, 0.207, 0.228, 0.12, 0.085, 0.03);
  } else {
    for (const s of [-1, 1]) b.add(G.ring(0.09, 1, 16), frame, 0.083 * s, 0.207, 0.232, 0.11, 0.11, 0.11);
  }
  b.add(G.box(), frame, 0, 0.215, 0.238, 0.05, 0.012, 0.012);
  for (const s of [-1, 1]) b.add(G.box(), frame, 0.19 * s, 0.212, 0.115, 0.012, 0.014, 0.25, -0.39 * s); // arms back to the ears
}

function npcHat(b, L) {
  const hy = 0.18, hl = hatLift(L.style);
  if (L.hat === 'pava') {
    b.add(G.tube(1, 16), 0xe9cf86, 0, 0.36 + hl, 0, 0.8, 0.04, 0.8);
    b.add(G.tube(0.8, 12), 0xe9cf86, 0, 0.46 + hl, 0, 0.38, 0.2, 0.38);
    b.add(G.tube(1, 12), 0x9b3b2a, 0, 0.4 + hl, 0, 0.4, 0.05, 0.4);
  } else if (L.hat === 'cap' || L.hat === 'capback') {
    const back = L.hat === 'capback' ? -1 : 1;
    const y0 = hy + 0.03 + hl * 0.5;
    b.add(G.cap(0.46), L.hatColor, 0, y0, -0.01, 0.52, 0.5, 0.52, 0, -0.32 * back);
    b.add(G.box(), shade(L.hatColor, 0.85), 0, y0 + 0.1, 0.21 * back, 0.28, 0.018, 0.19, 0, 0.18 * back);
    b.add(G.ball(6, 4), shade(L.hatColor, 0.8), 0, y0 + 0.255, -0.08 * back, 0.04, 0.03, 0.04);
  } else if (L.hat === 'band') {
    b.add(G.ball(12, 8), L.hatColor, 0, hy + 0.08, -0.01, 0.5, 0.3, 0.5);
  }
}
