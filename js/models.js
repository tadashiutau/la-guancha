// Models for collectibles, characters and animals.
import * as THREE from 'three';
import { Batch, P } from './geo.js';
import { buildFigure } from './figure.js';
import { islandGeometry } from './model-assets.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true });

function single(fn) {
  const b = new Batch(1e7);
  fn(b);
  const g = b.build(vmat, { cast: false });
  return g.children[0].geometry;
}

// ---- coin: a plain gold chavo standing up (a raised rim and a slot, no pattern)
export function coinGeometry() {
  return single(b => {
    b.add(P.cyl(16), 0xe8b530, 0, 0, 0, 0.74, 0.1, 0.74, 0, Math.PI / 2);
    b.add(P.cyl(16), 0xf7d35a, 0, 0, 0, 0.58, 0.13, 0.58, 0, Math.PI / 2);
    b.add(P.box(), 0xc7921b, 0, 0, 0, 0.12, 0.34, 0.15);
  });
}

// ---- concha: pink conch shell
export function conchaGeometry() {
  const generated = islandGeometry('conch', 2.0, true);
  if (generated) return generated;
  return single(b => {
    b.add(P.cone(7), 0xf7a8c4, 0, 0.1, 0, 0.5, 0.75, 0.5, 0, 0, Math.PI * 0.6);
    b.add(P.sphere(8, 6), 0xffd1dc, -0.12, -0.05, 0, 0.45, 0.4, 0.38);
    b.add(P.cone(6), 0xe0799d, 0.28, 0.25, 0.12, 0.12, 0.2, 0.12, 0, 0.3, -0.5);
    b.add(P.cone(6), 0xe0799d, 0.2, 0.32, -0.12, 0.12, 0.2, 0.12, 0, -0.3, -0.4);
  });
}

// ---- vejigante mask (Ponce style: red face, many horns, polka dots)
const HORN_COLS = [0xf7c948, 0x2e9e5b, 0x2f6fd0, 0xf7c948, 0x2e9e5b, 0x2f6fd0, 0xf7c948];
const RAINBOW = [0xe3342f, 0xff8a3d, 0xf7c948, 0x2e9e5b, 0x2f6fd0, 0x8a5ac8, 0xff6fae];
// variant: a number picks one of four classic color schemes; 'rainbow' is the Bird Club's mask
export function maskMesh(variant = 0) {
  const rainbow = variant === 'rainbow';
  const base = rainbow ? 0xff6fae : [0xe3342f, 0x2f6fd0, 0xf7c948, 0x2e9e5b][variant % 4];
  const dotAt = i => (rainbow ? RAINBOW[i % RAINBOW.length] : [0xf7c948, 0xffffff, 0xe3342f, 0xf7c948][variant % 4]);
  const g = single(b => {
    b.add(P.sphere(14, 10), base, 0, 0, 0, 1.0, 1.05, 0.55);
    for (let i = 0; i < 7; i++) {
      const a = -0.95 + i * (1.9 / 6);
      const x = Math.sin(a) * 0.45, y = Math.cos(a) * 0.45;
      b.add(P.cone(6), rainbow ? RAINBOW[i] : HORN_COLS[i], x * 1.25, y * 1.25 + 0.05, -0.02, 0.2, 0.55 + (i % 2) * 0.15, 0.2, 0, 0, -a);
    }
    for (const s of [-1, 1]) {
      b.add(P.sphere(8, 6), 0x111111, 0.2 * s, 0.1, 0.24, 0.2, 0.15, 0.1);
      b.add(P.sphere(8, 6), 0xffffff, 0.2 * s, 0.1, 0.22, 0.28, 0.22, 0.08);
    }
    b.add(P.box(), 0x111111, 0, -0.22, 0.24, 0.42, 0.14, 0.08);
    for (let i = -2; i <= 2; i++) b.add(P.cone(4), 0xffffff, i * 0.075, -0.18, 0.28, 0.05, 0.1, 0.05, 0, 0, Math.PI);
    b.add(P.cone(6), base, 0, -0.03, 0.28, 0.13, 0.2, 0.13, 0, -Math.PI / 2 + 0.3);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      b.add(P.sphere(6, 4), dotAt(i), Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.17, 0.08, 0.08, 0.04);
    }
  });
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x331100 }));
  m.castShadow = true;
  return m;
}

export function beamMesh(color = 0xffe38a) {
  const g = new THREE.CylinderGeometry(0.5, 0.9, 40, 12, 1, true);
  g.translate(0, 20, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.renderOrder = 4;
  return m;
}

export function shardMesh() {
  const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0xff5a5a, emissive: 0x662200, flatShading: true }));
  return m;
}

// ---- people
// People are built by figure.js (the same builder as the player): each rig part is one baked
// vertex-colored mesh, so a crowd stays cheap to draw. Rig: root > body(hips) > headPivot / arms / legs.
const LOOKS = {
  carmen: { skin: 0x7a4a30, hair: 0x2a2a2a, style: 'mono', shirt: 0xf5c542, bottom: 0x3b6fb6, dress: true, top: 'camiseta', hat: 'band', hatColor: 0xe3342f, apron: true, extra: 'arete' },
  tito: { skin: 0xc08a60, hair: 0x3a2a1a, style: 'rizos', shirt: 0x2e9e5b, bottom: 0x222222, top: 'esqueleto', hat: 'none', extra: 'reloj' },
  gabi: { skin: 0xe0b08a, hair: 0x6a3a1a, style: 'coleta', shirt: 0xf27ba0, bottom: 0xffffff, dress: true, top: 'camiseta', hat: 'none', scale: 0.75, eyes: 0x5a7a3a },
  pepe: { skin: 0xa06848, hair: 0xdddddd, style: 'calvo', shirt: 0x3b6fb6, bottom: 0xc9b48a, top: 'hawaiana', hat: 'cap', hatColor: 0xf0f0e0, face: 'bigotazo', shoes: 'chancletas' },
  lifeguard: { skin: 0x8a5a3a, hair: 0x111111, style: 'coleta', shirt: 0xe3342f, bottom: 0xe3342f, top: 'esqueleto', hat: 'cap', hatColor: 0xf7c948, glasses: 'sol', shoes: 'chancletas' },
  tourist: { skin: 0xf0c8a8, hair: 0xd8b060, style: 'corto', shirt: 0x7fd3e8, bottom: 0xf0e0b0, top: 'hawaiana', hat: 'cap', hatColor: 0xf7f7f7, glasses: 'sol', build: 'gordito', eyes: 0x3a6a9a },
  guia: { skin: 0x9c6a48, hair: 0x1f1a16, style: 'corto', shirt: 0xffffff, bottom: 0x2d6a4c, top: 'guayabera', hat: 'pava', face: 'bigote', legs: 'largos', shoes: 'zapatos' },
};
const SKINS = [0x5a3a26, 0x7a4a30, 0x8d5a3b, 0x9c6a48, 0xb07a55, 0xc08a60, 0xd8a47c, 0xe8bf98, 0xf0c8a8];
const HAIRS = [0x111111, 0x1f1a16, 0x3a2a1a, 0x6a3a1a, 0x8a5a2a, 0xc8a060, 0xdddddd];
const SHIRTS = [0xffffff, 0xe3342f, 0x2f6fd0, 0xf7c948, 0x2e9e5b, 0xf27ba0, 0x7fd3e8, 0xff8a3d, 0x8a5ac8, 0x222222, 0xf5f0e0];
const BOTTOMS = [0x2a3a5a, 0xc9b48a, 0x222222, 0xffffff, 0x3b6fb6, 0x7a5a3a, 0xe3342f];
const EYES = [0x4a2e1c, 0x2a1a10, 0x2a1a10, 0x7a5a2a, 0x5a7a3a, 0x3a6a9a];

export function randomLook(R, opts = {}) {
  const pick = a => a[Math.floor(R() * a.length)];
  const dress = opts.dress ?? R() < 0.35;
  const kid = opts.scale < 0.8;
  const hair = pick(HAIRS);
  const old = hair === 0xdddddd;
  return {
    skin: pick(SKINS), hair, eyes: pick(EYES), shirt: pick(SHIRTS), bottom: pick(BOTTOMS), dress,
    style: dress ? pick(['largo', 'coleta', 'mono', 'rizos', 'trenzas', 'ondas', 'afro'])
      : old ? pick(['calvo', 'corto', 'rapado']) : pick(['corto', 'corto', 'rapado', 'copete', 'rizos', 'ondas', 'afro', 'calvo', 'dreads']),
    top: pick(dress ? ['camiseta', 'camiseta', 'esqueleto'] : ['camiseta', 'camiseta', 'guayabera', 'polo', 'hawaiana', 'esqueleto']),
    face: !dress && !kid && R() < 0.4 ? pick(['bigote', 'bigote', 'barbita', 'chiva', 'barba']) : 'nada',
    glasses: R() < 0.12 ? 'sol' : R() < 0.1 ? 'lentes' : 'nada',
    build: kid ? 'normal' : pick(['flaco', 'normal', 'normal', 'normal', 'fornido', 'gordito']),
    shoes: pick(['tenis', 'tenis', 'chancletas', 'zapatos']),
    hat: opts.hat ?? (R() < 0.18 ? 'pava' : R() < 0.35 ? 'cap' : 'none'), hatColor: pick(SHIRTS),
    scale: opts.scale ?? (0.92 + R() * 0.14),
  };
}

export function personMesh(kind, scale = 1) {
  const look = typeof kind === 'string' ? (LOOKS[kind] || LOOKS.guia) : kind;
  const f = buildFigure(look);
  f.root.scale.setScalar(scale * (look.scale || 1));
  return f;
}

export function pelicanMesh() {
  const g = new THREE.Group();
  const brown = lam(0x7a6a58), white = lam(0xf2efe6), beak = lam(0xe0a030);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), brown);
  body.scale.set(0.8, 0.8, 1.3); body.position.y = 0.5; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), white);
  neck.position.set(0, 0.85, 0.3); neck.rotation.x = 0.4; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), white);
  head.position.set(0, 1.08, 0.42); g.add(head);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 5), beak);
  bk.rotation.x = Math.PI / 2 + 0.5; bk.position.set(0, 0.93, 0.75); g.add(bk);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0.25 * s, 0.6, 0);
    const wm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.45), brown);
    wm.position.x = 0.55 * s; w.add(wm);
    g.add(w); wings.push(w);
  }
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), beak);
    l.position.set(0.12 * s, 0.15, 0); g.add(l);
  }
  g.userData.wings = wings;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function fishGeometry() {
  return single(b => {
    b.add(P.sphere(8, 6), 0xc8d4dc, 0, 0, 0, 0.35, 0.3, 1.2);
    b.add(P.cone(4), 0x9aa8b4, 0, 0, -0.7, 0.35, 0.4, 0.08, 0, -Math.PI / 2);
    b.add(P.box(), 0x8a98a4, 0, 0.18, 0.1, 0.03, 0.2, 0.3);
  });
}

// ---- small reef fish (pale, so each school's instance color tints it)
export function reefFishGeometry() {
  return single(b => {
    b.add(P.sphere(6, 5), 0xffffff, 0, 0, 0, 0.14, 0.26, 0.42);
    b.add(P.cone(4), 0xd8d8d8, 0, 0, -0.26, 0.2, 0.18, 0.05, 0, -Math.PI / 2);
    b.add(P.box(), 0xcfcfcf, 0, 0.12, 0.02, 0.02, 0.1, 0.16);
    for (const s of [-1, 1]) b.add(P.sphere(4, 3), 0x111111, s * 0.06, 0.04, 0.13, 0.04, 0.04, 0.04);
  });
}

export function kittenMesh() {
  const g = new THREE.Group();
  const fur = lam(0xf0a040), stripe = lam(0xc07020), white = lam(0xffffff);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur);
  body.scale.set(0.8, 0.8, 1.3); body.position.y = 0.22; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), fur);
  head.position.set(0, 0.38, 0.22); g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), stripe);
    ear.position.set(0.08 * s, 0.52, 0.2); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), lam(0x111111));
    eye.position.set(0.05 * s, 0.4, 0.36); g.add(eye);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), white);
  muzzle.position.set(0, 0.35, 0.35); g.add(muzzle);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35, 5), stripe);
  tail.position.set(0, 0.35, -0.3); tail.rotation.x = -0.6; g.add(tail);
  g.userData.tail = tail;
  for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 5), fur);
    l.position.set(x, 0.07, z); g.add(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Moth's round silhouette, green eyes, and cardboard-box obsession are based on
// the supplied reference photos. Keep this lightweight for browser rendering.
export function mothMesh() {
  const generated = islandGeometry('moth', 0.6);
  if (generated) {
    generated.computeBoundingBox();
    generated.translate(0, -generated.boundingBox.min.y, 0);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(generated, lam(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    g.add(mesh);
    // The source texture's bright eyes vanish when its dense fur mesh is reduced.
    // Small geometry eyes keep Moth's recognizable expression at game scale.
    const iris = lam(0xb4d879, { emissive: 0x294917 });
    const pupil = lam(0x0b1115);
    const glint = lam(0xffffff, { emissive: 0x555555 });
    // Seat the eyes on the actual face: cast a ray at the head to find its surface, then
    // turn each eye to follow the face's slope so it sits in the fur instead of floating.
    const ray = new THREE.Raycaster();
    const Zf = new THREE.Vector3(0, 0, 1);
    for (const s of [-1, 1]) {
      const x = s * 0.078, y = 0.9;
      ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh)[0];
      const at = hit ? hit.point : new THREE.Vector3(x, y, 0.35);
      const n = hit ? hit.face.normal.clone() : Zf.clone();
      if (n.z < 0) n.negate();
      n.lerp(Zf, 0.5).normalize(); // halfway to straight ahead, so both eyes still look forward
      const eyeGroup = new THREE.Group();
      eyeGroup.position.copy(at);
      eyeGroup.quaternion.setFromUnitVectors(Zf, n);
      g.add(eyeGroup);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), iris);
      eye.scale.set(0.9, 0.95, 0.4);
      eyeGroup.add(eye);
      const slit = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), pupil);
      slit.scale.set(0.55, 1.2, 0.35);
      slit.position.z = 0.012;
      eyeGroup.add(slit);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), glint);
      shine.position.set(-s * 0.014, 0.017, 0.018);
      eyeGroup.add(shine);
    }
    g.scale.setScalar(0.75);
    g.userData.tail = new THREE.Object3D(); // the baked mesh has its own tail
    return g;
  }
  const g = new THREE.Group();
  const fur = lam(0x17161b), lightFur = lam(0x26242a);
  const eye = lam(0xb6d777, { emissive: 0x3b5622 });
  const pupil = lam(0x101216), shine = lam(0xffffff);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), fur);
  body.scale.set(1.12, 0.86, 1.18); body.position.set(0, 0.51, -0.08); g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), lightFur);
  chest.scale.set(1, 1.22, 0.63); chest.position.set(0, 0.56, 0.33); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 12), fur);
  head.scale.set(1.16, 0.95, 0.94); head.position.set(0, 0.88, 0.39); g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 4), fur);
    ear.position.set(s * 0.3, 1.2, 0.35); ear.rotation.z = -s * 0.17; ear.rotation.y = Math.PI / 4; g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.19, 4), lam(0x59434b));
    inner.position.set(s * 0.3, 1.2, 0.46); inner.rotation.z = -s * 0.17; inner.rotation.y = Math.PI / 4; g.add(inner);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), eye);
    iris.scale.z = 0.45; iris.position.set(s * 0.19, 0.94, 0.722); g.add(iris);
    const slit = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), pupil);
    slit.scale.set(0.7, 1.5, 0.55); slit.position.set(s * 0.19, 0.94, 0.77); g.add(slit);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), shine);
    glint.position.set(s * 0.19 - 0.03, 0.99, 0.79); g.add(glint);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fur);
    paw.scale.set(0.9, 0.65, 1.25); paw.position.set(s * 0.32, 0.11, 0.48); g.add(paw);
    for (const k of [-1, 0, 1]) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.27, 3), lam(0xaaa7aa));
      whisker.rotation.z = Math.PI / 2 + k * 0.22;
      whisker.position.set(s * 0.43, 0.76 + k * 0.035, 0.7); g.add(whisker);
    }
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), lam(0x45383e));
  nose.scale.set(1, 0.65, 0.45); nose.position.set(0, 0.77, 0.76); g.add(nose);
  const tail = new THREE.Group(); tail.position.set(0.38, 0.44, -0.53); g.add(tail);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.006, 8, 6), fur);
    p.position.set(i * 0.095, i * 0.12, -i * 0.07); tail.add(p);
  }
  g.userData.tail = tail;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function iguanaMesh() {
  const g = new THREE.Group();
  const green = lam(0x5a9a3a);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), green);
  body.scale.set(0.9, 0.6, 2.4); body.position.y = 0.1; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), green);
  head.position.set(0, 0.16, 0.42); g.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9, 5), lam(0x4a7a30));
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.08, -0.75); g.add(tail);
  g.userData.head = head;
  return g;
}

// ---- props
export function crateMesh() {
  const generated = islandGeometry('crate', [1.2, 1.8, 1.55], true);
  if (generated) {
    const mesh = new THREE.Mesh(generated, lam(0xffffff, { vertexColors: true }));
    mesh.castShadow = true;
    return mesh;
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), lam(0xb07a3a));
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.14, 1.14), lam(0x7a4e1e));
  m.add(edge);
  const e2 = edge.clone(); e2.position.y = 0.48; m.add(e2);
  const e3 = edge.clone(); e3.position.y = -0.48; m.add(e3);
  const x = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 1.15), lam(0x7a4e1e));
  x.rotation.x = Math.PI / 4; m.add(x);
  m.castShadow = true;
  return m;
}

export function chestMesh() {
  const g = new THREE.Group();
  const wood = lam(0x8a4a1e), gold = lam(0xf7c948, { emissive: 0x332200 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood);
  base.position.y = 0.35; g.add(base);
  const lid = new THREE.Group();
  lid.position.set(0, 0.7, -0.4);
  const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10, 1, false, 0, Math.PI), wood);
  lm.rotation.z = Math.PI / 2; lm.position.z = 0.4; lid.add(lm);
  g.add(lid);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.85), gold);
  band.position.y = 0.6; g.add(band);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.1), gold);
  lock.position.set(0, 0.62, 0.42); g.add(lock);
  g.userData.lid = lid;
  return g;
}

export function ringMesh(color = 0xf7c948) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.13, 8, 24), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  return m;
}

export function flagMesh() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), lam(0xeeeeee));
  pole.position.y = 1.6; g.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lam(0xf7c948));
  ball.position.y = 3.25; g.add(ball);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 8), lam(0x8c8577));
  base.position.y = 0.12; g.add(base);
  // Puerto Rico flag on a canvas
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#fff' : '#e3342f'; x.fillRect(0, i * 64 / 5, 96, 64 / 5 + 1); }
  x.fillStyle = '#2a64c8'; x.beginPath(); x.moveTo(0, 0); x.lineTo(50, 32); x.lineTo(0, 64); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 10, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(17 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8, 6, 1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  cloth.position.set(0.62, 0.5, 0); g.add(cloth);
  // an untouched flag stays furled at the foot of the pole (in its colors, not gray)
  g.userData = { cloth, tex, colored: cloth.material };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buoyMesh() {
  const g = new THREE.Group();
  const red = lam(0xe3342f), white = lam(0xffffff);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 12), red); b.position.y = 0.2; g.add(b);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.3, 12), white); w.position.y = 0.5; g.add(w);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 2.2, 6), red); t.position.y = 1.9; g.add(t);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), lam(0x80ff80, { emissive: 0x40ff40 })); l.position.y = 3.1; g.add(l);
  return g;
}

export function lifeguardTower(batch, x, g, z, yaw) {
  // open platform (no roof) so a backflip can reach above it; steps on one side
  const h = 2.2, c = Math.cos(yaw), s = Math.sin(yaw);
  const T = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [px, pz] = T(u * 0.9, v * 0.9);
    batch.add(P.box(), 0xf2f2f2, px, g + h / 2, pz, 0.18, h, 0.18);
    batch.add(P.box(), 0xf2f2f2, px, g + h + 0.45, pz, 0.1, 0.9, 0.1);
  }
  batch.add(P.box(), 0xe3342f, x, g + h - 0.1, z, 2.2, 0.2, 2.2, yaw);
  for (const v of [-1, 1]) { const [px, pz] = T(0, v * 0.95); batch.add(P.box(), 0xffffff, px, g + h + 0.8, pz, 2.0, 0.1, 0.1, yaw); }
  const steps = [];
  for (let i = 0; i < 4; i++) {
    const [px, pz] = T(1.7 + (3 - i) * 0.6, 0);
    const top = g + (i + 1) * (h / 4);
    batch.add(P.box(), 0xd8c8a0, px, top - 0.1, pz, 0.6, 0.2, 1.2, yaw);
    batch.add(P.box(), 0xbbbbbb, px, (g + top) / 2, pz, 0.08, top - g, 0.08);
    steps.push([px, pz, top]);
  }
  return { h, steps };
}

export function umbrellaTop(batch, x, g, z, col) {
  batch.add(P.cyl(6), 0xdddddd, x, g + 1.2, z, 0.1, 2.4, 0.1);
  batch.add(P.cone(8), col, x, g + 2.55, z, 3.0, 0.7, 3.0);
  batch.add(P.cone(8), 0xffffff, x, g + 2.93, z, 0.3, 0.15, 0.3);
  return g + 2.6;
}

// sparkle texture shared by particle systems
let sparkTex = null;
export function sparkTexture() {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,180,.8)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}
