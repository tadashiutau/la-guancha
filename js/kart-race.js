// El Gran Premio de La Guancha: a Mario Kart–style race. Cheo closes the Paseo (the end bollards
// sink into the street) and five karts race three laps: up the Paseo past Héctor Lavoe, east on
// the road along the tower, down the long road to the lion fountain, half a lap around it, south
// past the park, all the way around the south roundabout and back onto the Paseo.
// Controls (prompts along the bottom edge): stick or W/S or A/B gas and brake · ⤒/Space/RB drift in
// a turn, let go for a turbo · 🎩/E/X use your item · hold ⤓/Shift/LB to quit (or the pause menu). Items from the boxes: ☕ cafecito (turbo), 🥥 coco (drop it behind you),
// 🎩 pava (thrown straight ahead), 🩴 chancla (finds the kart in front of you).
// Winning gives a mask; rematches are free. main.js calls drive() instead of player.update while
// racing (game.vehicle), the AI and everything else runs in update().
import * as THREE from 'three';
import { tr } from './i18n.js';
import { paseoFrame } from './paseo.js';
import { personMesh } from './models.js';
import { Batch } from './geo.js';

const Q = (es, en) => ({ es, en });
const LAPS = 3;
const TOP = 18;                // top speed on the road (units/s)
const KR = 0.7;                // kart collision radius
const ITEM = { cafe: '☕', coco: '🥥', pava: '🎩', chancla: '🩴' };

const RACERS = [
  { name: 'Marina', color: 0xe34552, skill: 1.0, look: { skin: 0xa77753, hair: 0x25202a, style: 'coleta', shirt: 0xe34552, bottom: 0x253d65, top: 'camiseta', hat: 'cap', hatColor: 0x253d65 } },
  { name: 'Tito', color: 0x2e9e5b, skill: 0.97, look: 'tito' },
  { name: 'Yari', color: 0xff8a3d, skill: 0.95, look: 'lifeguard' },
  { name: 'Mike', color: 0x7fd3e8, skill: 0.91, look: 'tourist' },
];

// ---------------------------------------------------------------- meshes
const matCache = new Map();
const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: c, ...o }));
  return matCache.get(k);
};
function add(parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true;
  parent.add(o);
  return o;
}
function kartMesh(color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = mat(color), dark = mat(0x222428), metal = mat(0xb8bcc2), trim = mat(new THREE.Color(color).multiplyScalar(0.7).getHex());
  add(body, new THREE.BoxGeometry(1.0, 0.2, 1.5), paint, 0, 0.3, 0);
  add(body, new THREE.BoxGeometry(0.78, 0.16, 0.5), paint, 0, 0.33, 0.9, 0.22);
  add(body, new THREE.CylinderGeometry(0.08, 0.08, 1.12, 8), dark, 0, 0.24, 1.14, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.2, 0.24, 0.95), trim, 0.55 * s, 0.33, 0.05);
  add(body, new THREE.BoxGeometry(0.56, 0.12, 0.5), dark, 0, 0.44, -0.35);
  add(body, new THREE.BoxGeometry(0.56, 0.46, 0.1), dark, 0, 0.66, -0.62, -0.15);
  add(body, new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), dark, 0, 0.56, 0.36, -0.95);
  add(body, new THREE.TorusGeometry(0.15, 0.03, 6, 14), dark, 0, 0.71, 0.24, -1.0);
  add(body, new THREE.BoxGeometry(0.5, 0.26, 0.32), metal, 0, 0.46, -0.82);
  add(body, new THREE.BoxGeometry(1.05, 0.05, 0.28), paint, 0, 0.86, -0.88); // little wing
  for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.05, 0.3, 0.2), dark, 0.45 * s, 0.72, -0.88);
  const flames = [];
  for (const s of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), metal, 0.16 * s, 0.5, -1.05, Math.PI / 2);
    const f = add(body, new THREE.ConeGeometry(0.09, 0.45, 8), mat(0xffa33a, { emissive: 0xff6a00, emissiveIntensity: 0.9 }), 0.16 * s, 0.5, -1.4, -Math.PI / 2);
    f.visible = false; flames.push(f);
  }
  const wheels = [];
  for (const [x, z] of [[-0.56, 0.58], [0.56, 0.58], [-0.56, -0.55], [0.56, -0.55]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.21, z);
    add(w, new THREE.CylinderGeometry(0.21, 0.21, 0.22, 12), dark, 0, 0, 0, 0, 0, Math.PI / 2);
    add(w, new THREE.CylinderGeometry(0.1, 0.1, 0.23, 8), mat(0xf2f2f2), 0, 0, 0, 0, 0, Math.PI / 2);
    body.add(w); wheels.push(w);
  }
  // bake: the body parts into one vertex-colored mesh, each wheel into one (they spin)
  const merge = (group, keep) => {
    const b = new Batch(1e7);
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert();
    for (const o of [...group.children]) {
      if (!o.isMesh || keep.includes(o)) continue;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      b.addMatrix(geo, o.material.color, inv.clone().multiply(o.matrixWorld));
      group.remove(o);
    }
    const m = b.build(bakedMat).children[0];
    m.matrixAutoUpdate = true; m.castShadow = true; m.receiveShadow = false;
    group.add(m);
  };
  merge(body, flames);
  wheels.forEach(w => merge(w, []));
  return { root, body, wheels, flames };
}
const bakedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function emojiTexture(ch, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 128, 128); }
  x.font = '84px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function boxTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 128, 128);
  ['#ff5a5a', '#ffb13b', '#f7e04a', '#4ad07a', '#4aa8ff', '#b36bff'].forEach((col, i) => gr.addColorStop(i / 5, col));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(8, 8, 112, 112);
  x.fillStyle = '#fff'; x.strokeStyle = '#333'; x.lineWidth = 6;
  x.font = 'bold 96px Trebuchet MS, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.strokeText('?', 64, 70); x.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function checkerTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
  x.fillStyle = '#d8262f'; x.fillRect(40, 16, 432, 64);
  x.fillStyle = '#fff'; x.font = 'bold 40px Trebuchet MS, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ff8a1e'; x.fillRect(0, 0, 64, 128);
  x.fillStyle = '#ffe36a';
  for (let k = 0; k < 3; k++) { x.beginPath(); const y = 100 - k * 38; x.moveTo(6, y); x.lineTo(32, y - 26); x.lineTo(58, y); x.lineTo(58, y + 12); x.lineTo(32, y - 14); x.lineTo(6, y + 12); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the race
export function buildKartRace(g) {
  const F = paseoFrame(g.data);
  if (!F) return;
  const { phys, data } = g;
  const H = data.terrainH;
  const P = g.player;
  const gateCols = new Set((g.paseoGates || []).flatMap(gt => gt.cols));

  // ---- the track: waypoints along the streets, smoothed and resampled every unit
  const way = [];
  for (let t = 6; t < F.len - 3; t += 10) way.push(F.at(t, 0));
  way.push(F.at(F.len - 1, 0));
  way.push([-124, -119], [-99, -128], [-79, -142], [-56, -109], [-33, -76],
    [-10, -43], [-14, -37], [-14, -34], [-11, -27], [-5, -24], [-2, -23], [5, -26],
    [29, 8], [53, 42], [38, 56], [23, 71], [5, 84], [6, 89], [4, 95], [-2, 98], [-5, 98], [-10, 95], [-13, 89], [-11, 83]);
  const nW = way.length, dense = [];
  for (let i = 0; i < nW; i++) {
    const p0 = way[(i - 1 + nW) % nW], p1 = way[i], p2 = way[(i + 1) % nW], p3 = way[(i + 2) % nW];
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.4));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const T = [];
  let acc = 0;
  for (let i = 0; i < dense.length; i++) {
    const [ax, az] = dense[i], [bx, bz] = dense[(i + 1) % dense.length];
    const l = Math.hypot(bx - ax, bz - az);
    while (acc <= l) { const k = acc / l; T.push({ x: ax + (bx - ax) * k, z: az + (bz - az) * k }); acc += 1; }
    acc -= l;
  }
  const N = T.length;
  for (let i = 0; i < N; i++) {
    const a = T[(i - 1 + N) % N], b = T[(i + 1) % N];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(T[i], { ux: dx / l, uz: dz / l, nx: dz / l, nz: -dx / l, gy: H(T[i].x, T[i].z) });
  }
  const at = (i, o = 0) => { const s = T[((i % N) + N) % N]; return { x: s.x + s.nx * o, z: s.z + s.nz * o, s }; };
  // room around each point across the track, so the AI can pick a lane clear of planters and trees
  const OFFS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
  const clearAt = (x, z, gy) => {
    let d = 4;
    for (const c of phys.near(x, z, 4)) {
      if (!c.solid || c.tag === 'deck' || gateCols.has(c) || c.y1 < gy + 0.3 || c.y0 > gy + 1.4) continue;
      const q = phys.sdist(c, x, z);
      d = Math.min(d, q.inside ? 0 : q.d);
    }
    return d;
  };
  for (const s of T) s.room = OFFS.map(o => clearAt(s.x + s.nx * o, s.z + s.nz * o, s.gy));
  const laneAt = (i, want) => {
    const s = T[((i % N) + N) % N];
    let best = 0, bestD = 1e9, most = 6, mostR = -1;
    s.room.forEach((r, j) => {
      if (r > mostR) { mostR = r; most = j; }
      if (r >= 1.05 && Math.abs(OFFS[j] - want) < bestD) { bestD = Math.abs(OFFS[j] - want); best = OFFS[j]; }
    });
    return bestD < 1e9 ? best : OFFS[most];
  };
  const nearest = (x, z, hint) => {
    let best = hint, bd = 1e9;
    const scan = hint == null ? N : 40;
    for (let k = -scan; k <= scan; k++) {
      const i = hint == null ? k + N : hint + k;
      const s = T[((i % N) + N) % N];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = ((i % N) + N) % N; }
    }
    return best;
  };

  // start line on the Paseo, the grid behind it
  const START_T = 58; // metres up the Paseo: room for the grid between the bollards and the line
  const S0 = nearest(...F.at(START_T, 0));
  const rel = i => (i - S0 + N) % N; // distance past the start line

  // ---- the start arch (always up), and the pads, ramps and item boxes (only while racing)
  const arch = new THREE.Group(), decor = new THREE.Group();
  g.root.add(arch, decor);
  const archT = START_T, [ax0, az0] = F.at(archT, -6.6), [ax1, az1] = F.at(archT, 6.6);
  const ay = Math.min(H(ax0, az0), H(ax1, az1));
  for (const [x, z] of [[ax0, az0], [ax1, az1]]) {
    add(arch, new THREE.BoxGeometry(0.3, 4.2, 0.3), mat(0xf2f2f2), x, H(x, z) + 2.1, z);
    phys.addBox(x, z, 0.18, 0.18, 0, H(x, z), H(x, z) + 4.2, { tag: 'post' });
  }
  const banner = add(arch, new THREE.PlaneGeometry(Math.hypot(ax1 - ax0, az1 - az0), 0.95), new THREE.MeshLambertMaterial({ map: checkerTexture('GRAN PREMIO · LA GUANCHA'), side: THREE.DoubleSide }), (ax0 + ax1) / 2, ay + 3.7, (az0 + az1) / 2);
  banner.rotation.y = Math.atan2(az1 - az0, -(ax1 - ax0));
  const lights = [-0.9, 0, 0.9].map(k => {
    const m = add(arch, new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshLambertMaterial({ color: 0x333333, emissive: 0x000000 }), (ax0 + ax1) / 2 + (ax1 - ax0) / Math.hypot(ax1 - ax0, az1 - az0) * k, ay + 3.05, (az0 + az1) / 2 + (az1 - az0) / Math.hypot(ax1 - ax0, az1 - az0) * k);
    return m;
  });
  const setLights = (n, green) => lights.forEach((l, i) => {
    const on = green || i < n, c = green ? 0x2ee06a : 0xff3030;
    l.material.color.setHex(on ? c : 0x333333); l.material.emissive.setHex(on ? c : 0); l.material.emissiveIntensity = on ? 0.9 : 0;
  });
  // the start/finish line painted across the Paseo
  {
    const s = T[S0], len = 7.4;
    const line = add(arch, new THREE.PlaneGeometry(len, 0.6), new THREE.MeshBasicMaterial({ map: checkerTexture(''), polygonOffset: true, polygonOffsetFactor: -2 }), s.x, s.gy + 0.03, s.z, -Math.PI / 2);
    line.material.map.repeat.set(1, 0.2);
    line.rotation.z = Math.atan2(s.nz, s.nx) * -1;
    line.receiveShadow = true; line.castShadow = false;
  }
  const pads = [], ramps = [], boxes = [], cocos = [], shots = [];
  const arrowTex = arrowTexture();
  const pad = i => {
    const s = T[i];
    const m = add(decor, new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshLambertMaterial({ map: arrowTex, polygonOffset: true, polygonOffsetFactor: -2 }), s.x, s.gy + 0.04, s.z, -Math.PI / 2);
    m.rotation.z = Math.atan2(s.ux, s.uz) + Math.PI;
    m.castShadow = false;
    pads.push({ i, x: s.x, z: s.z });
  };
  const ramp = i => {
    const s = T[i];
    const wedge = new THREE.Group();
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 0), new THREE.Vector2(2.4, 0.55)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false });
    geo.translate(-1.2, 0, -1.6);
    const w = new THREE.Mesh(geo, mat(0xb07a45)); w.rotation.y = -Math.PI / 2; w.castShadow = true; w.receiveShadow = true;
    wedge.add(w);
    for (const k of [-1.3, 1.3]) add(wedge, new THREE.BoxGeometry(0.12, 0.6, 2.5), mat(0xf7c948), k * 1.25, 0.2, 0);
    wedge.position.set(s.x, s.gy, s.z);
    wedge.rotation.y = Math.atan2(s.ux, s.uz);
    decor.add(wedge);
    ramps.push({ i, x: s.x, z: s.z });
  };
  const boxTex = boxTexture();
  const boxRow = i => {
    for (const o of [-2.2, -0.75, 0.75, 2.2]) {
      const j = OFFS.indexOf(Math.round(o * 2) / 2);
      if (j >= 0 && T[i].room[j] < 0.8) continue;
      const p = at(i, o);
      const m = add(decor, new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ map: boxTex, transparent: true, opacity: 0.9, emissive: 0x333333 }), p.x, p.s.gy + 0.8, p.z);
      boxes.push({ m, x: p.x, z: p.z, y: p.s.gy + 0.8, down: 0 });
    }
  };
  // pads on the Paseo and the long roads; item boxes three times a lap; two ramps
  const pick = (x, z) => nearest(x, z);
  pad((S0 + 70) % N); pad((S0 + 150) % N); pad(pick(-110, -124)); pad(pick(-45, -93)); pad(pick(42, 53));
  boxRow((S0 + 110) % N); boxRow(pick(-66, -125)); boxRow(pick(18, -8));
  ramp(pick(-40, -86)); ramp(pick(38, 21));
  // make the circuit easy to read: red and white curbs along both edges, a faint tint on the lane,
  // and yellow chevron boards on the outside of the sharp turns
  {
    const HALF = 3.5, CURB = 0.38;
    const pos = [], col = [], lane = [];
    const red = new THREE.Color(0xd8262f), white = new THREE.Color(0xf6f3ea);
    const pt = (i, o) => { const s = T[(i + N) % N], x = s.x + s.nx * o, z = s.z + s.nz * o; return [x, H(x, z) + 0.13, z]; }; // over the Paseo paving and road meshes
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < N; i++) {
      const c = Math.floor(i / 2) % 2 ? red : white;
      for (const side of [-1, 1]) {
        const o0 = side * HALF, o1 = side * (HALF + CURB);
        quad(pos, pt(i, o0), pt(i + 1, o0), pt(i + 1, o1), pt(i, o1));
        for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      }
      quad(lane, pt(i, -HALF), pt(i + 1, -HALF), pt(i + 1, HALF), pt(i, HALF));
    }
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const curbs = new THREE.Mesh(curbGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(lane, 3));
    const tint = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    curbs.renderOrder = 2; tint.renderOrder = 1;
    decor.add(curbs, tint);
    // chevron boards where the road bends hard, on the outside of the turn
    const chev = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 48;
      const x = c.getContext('2d'); x.fillStyle = '#f7c948'; x.fillRect(0, 0, 128, 48); x.fillStyle = '#111';
      for (let k = 0; k < 3; k++) { const x0 = 18 + k * 36; x.beginPath(); x.moveTo(x0, 6); x.lineTo(x0 + 18, 24); x.lineTo(x0, 42); x.lineTo(x0 + 10, 42); x.lineTo(x0 + 28, 24); x.lineTo(x0 + 10, 6); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    let last = -99;
    for (let i = 0; i < N; i++) {
      const a = T[i], b = T[(i + 12) % N];
      const cross = a.ux * b.uz - a.uz * b.ux, bend = Math.acos(Math.max(-1, Math.min(1, a.ux * b.ux + a.uz * b.uz)));
      if (bend < 0.75 || i - last < 14) continue;
      last = i;
      const m = T[(i + 6) % N], out = cross > 0 ? 1 : -1; // outside of the turn
      const side = out * (HALF + 1.4);
      const x = m.x + m.nx * side, z = m.z + m.nz * side;
      if (phys.near(x, z, 0.6).some(c => c.solid && phys.sdist(c, x, z).d < 0.4)) continue;
      const gy = H(x, z);
      const board = new THREE.Group();
      add(board, new THREE.BoxGeometry(0.08, 1.0, 0.08), mat(0x555555), -0.55, 0.5, 0);
      add(board, new THREE.BoxGeometry(0.08, 1.0, 0.08), mat(0x555555), 0.55, 0.5, 0);
      const face = add(board, new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshLambertMaterial({ map: chev, side: THREE.DoubleSide }), 0, 1.15, 0);
      face.scale.x = cross > 0 ? 1 : -1; // the arrows point the way the road turns (cross > 0: a right turn)
      board.position.set(x, gy, z);
      board.rotation.y = Math.atan2(-m.ux, -m.uz);
      decor.add(board);
    }
  }
  decor.visible = false;

  // ---- the karts, parked on the grid when there's no race
  // grid slots: two by two behind the line, each nudged onto clear pavement (palm rings stand on the Paseo)
  const grid = k => {
    const row = Math.floor(k / 2), i = (S0 - 4 - row * 5 + N) % N;
    const want = (k % 2 ? 1.6 : -1.6) + (row % 2 ? 0.3 : -0.3);
    const room = T[i].room;
    let o = want, bd = 1e9;
    OFFS.forEach((v, j) => { if (room[j] >= 1.3 && Math.abs(v - want) < bd && Math.sign(v || want) === Math.sign(want)) { bd = Math.abs(v - want); o = v; } });
    return { i, o };
  };
  const karts = [];
  const makeKart = (r, idx) => {
    const km = kartMesh(r.color);
    g.root.add(km.root);
    const k = { ...r, km, idx: 0, x: 0, y: 0, z: 0, yaw: 0, vy: 0, speed: 0, air: false, spin: 0, boost: 0, item: null, itemT: 0,
      lap: 0, half: true, done: false, time: 0, lane: 0, want: (idx - 1.5) * 0.9, drift: 0, charge: 0, bump: 0, stuck: 0, wrong: 0, player: !!r.player };
    if (!r.player) {
      const d = personMesh(r.look);
      d.root.position.set(0, 0.0, -0.3);
      d.legs.forEach(l => { l.rotation.x = -1.45; }); d.arms.forEach(a => { a.rotation.x = -1.05; a.rotation.z = 0; });
      km.body.add(d.root);
      k.driver = d;
    }
    karts.push(k);
    return k;
  };
  RACERS.forEach((r, i) => makeKart(r, i));
  const me = makeKart({ name: Q('Tú', 'You'), color: 0xf4c543, skill: 1, player: true }, 2);
  // grid: Marina, Tito, you, Yari, Mike (order is the live standings)
  const gridOrder = [karts[0], karts[1], me, karts[2], karts[3]];
  const order = [...gridOrder];
  const park = () => gridOrder.forEach((k, n) => {
    const { i, o } = grid(n), p = at(i, o);
    Object.assign(k, { x: p.x, z: p.z, y: p.s.gy, yaw: Math.atan2(p.s.ux, p.s.uz), idx: i, speed: 0, vy: 0, air: false, spin: 0, boost: 0,
      item: null, lap: 0, half: true, done: false, time: 0, drift: 0, charge: 0, bump: 0, stuck: 0, wrong: 0 });
    place(k);
    order[n] = k;
  });
  function place(k) {
    k.km.root.position.set(k.x, k.y, k.z);
    k.km.root.rotation.y = k.yaw;
  }

  // ---- the organizer, with the checkered flag
  let cx = 0, cz = 0;
  for (const [t, o] of [[START_T - 12, -5.6], [START_T - 8, -5.6], [START_T - 12, 5.6], [START_T - 16, -5.2], [START_T - 6, 5.4], [START_T - 18, -4.6]]) {
    [cx, cz] = F.at(t, o);
    if (!phys.near(cx, cz, 1).some(c => c.solid && phys.sdist(c, cx, cz).d < 0.9)) break;
  }
  const cheo = g.npc({ skin: 0x8d5a3b, hair: 0x1f1a16, style: 'rapado', face: 'chiva', shirt: 0x111111, bottom: 0x2a3a5a, top: 'polo', hat: 'capback', hatColor: 0xd8262f, glasses: 'sol', extra: 'cadena' },
    'Cheo', cx, cz, Math.atan2(...(() => { const s = T[S0]; return [s.x - cx, s.z - cz]; })()), () => talkCheo());
  const flag = new THREE.Group();
  add(flag, new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), mat(0x333333), 0, 0.4, 0);
  const cloth = add(flag, new THREE.PlaneGeometry(0.45, 0.32), new THREE.MeshLambertMaterial({ map: checkerTexture(''), side: THREE.DoubleSide }), 0.23, 0.64, 0);
  cloth.material.map.repeat.set(0.15, 1);
  flag.position.set(0, -0.36, 0.05);
  cheo.m.arms[1].add(flag);

  // ---- HUD
  const hud = document.createElement('div');
  hud.id = 'kartHud'; hud.hidden = true;
  hud.innerHTML = '<div class="kpos"></div><div class="klap"></div><div class="ktime"></div><div class="kitem"></div><ol class="kboard"></ol><div class="kwrong" hidden></div>';
  document.body.append(hud);
  const css = document.createElement('style');
  css.textContent = `#kartHud{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));top:calc(186px + env(safe-area-inset-top,0px));z-index:5;pointer-events:none;color:#fff;font-weight:900;text-shadow:0 2px 0 #0008,0 0 6px #0008}
  #kartHud .kpos{font-size:44px;line-height:1}#kartHud .klap,#kartHud .ktime{font-size:16px}
  #kartHud .kitem{margin-top:6px;width:58px;height:58px;border-radius:14px;background:#fffd;border:3px solid #2d6a4c;display:grid;place-items:center;font-size:34px;text-shadow:none}
  #kartHud .kboard{margin:8px 0 0;padding:6px 10px 6px 26px;background:#0006;border-radius:10px;font-size:13px}
  #kartHud .kboard .me{color:#ffe36a}
  #kartHud .kwrong{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);font-size:34px;color:#ffe36a}`;
  document.head.append(css);
  const $h = s => hud.querySelector(s);
  const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const ord = n => (tr(Q(`${n}º`, ['1st', '2nd', '3rd'][n - 1] || `${n}th`)));

  // ---- race state
  const race = g.challenge({
    riding: false, phase: 'idle', t: 0, quitT: 0,
    objective() { return null; },
    start() {
      this.riding = true; g.vehicle = this; this.phase = 'count'; this.t = 0; this.quitT = 0; this.rocket = 0; this.lastN = -1; this.ending = false;
      park();
      const p = g.player;
      p.events.length = 0;
      if (p.hat.state !== 'on') { p.hat.state = 'on'; p.hatMesh.position.set(0, 0, 0); p.hatMesh.rotation.set(0, 0, 0); p.m.hatSlot.add(p.hatMesh); }
      p.state = 'kart'; p.blob.visible = false; p.vel.set(0, 0, 0);
      decor.visible = true;
      boxes.forEach(b => { b.down = 0; b.m.visible = true; });
      cocos.splice(0).forEach(c => g.root.remove(c.m));
      shots.splice(0).forEach(s => g.root.remove(s.m));
      // the street is closed: riders off, bollards down
      for (const rd of g.paseoRiders || []) { rd.rig.visible = false; rd.n.hidden = true; }
      this.camDist = g.cam.dist; g.cam.chase = true;
      this.drive(0, {});
      g.cam.snap(p);
      setLights(0);
      hud.hidden = false;
      const mm = document.getElementById('minimap')?.getBoundingClientRect();
      hud.style.top = mm && mm.bottom > 0 ? `${Math.round(mm.bottom + 8)}px` : ''; // just under the minimap
      g.ui.prompts([
        { act: 'gas', label: Q('Acelerar', 'Gas') }, { act: 'brake', label: Q('Frenar', 'Brake') }, { act: 'steer', label: Q('Girar', 'Steer') },
        { act: 'drift', label: Q('Derrapar', 'Drift') }, { act: 'item', label: Q('Objeto', 'Item') }, { act: 'quit', label: Q('Salir (mantén)', 'Quit (hold)') },
      ]);
      g.sfx.engine(0);
    },
    leave(result) {
      this.riding = false; g.vehicle = null; this.phase = 'idle';
      g.cam.chase = false; g.cam.dist = this.camDist || 8;
      g.sfx.engine(null);
      hud.hidden = true;
      g.ui.prompts(null);
      decor.visible = false;
      setLights(0);
      for (const rd of g.paseoRiders || []) { rd.rig.visible = true; rd.n.hidden = false; }
      park();
      const p = g.player;
      p.blob.visible = true;
      p.teleport(cheo.x + Math.sin(cheo.face) * 1.8, cheo.y + 0.3, cheo.z + Math.cos(cheo.face) * 1.8, cheo.face + Math.PI);
      g.cam.snap(p);
      g.ui.prog('');
      if (result === 'quit') g.ui.toast(tr(Q('Vuelve cuando quieras para otra carrera.', 'Come back any time for another race.')), 3);
    },
    // the player's kart, called by main.js each physics substep
    drive(dt, inp) {
      if (!this.riding) return;
      const k = me;
      // controller: A gas, B brake, RB/RT drift, X/Y item, hold LB/LT to quit.
      // touch and keyboard: stick or W/S, ⤒ or Space to drift, 🎩 or E, hold ⤓ or Shift to quit
      const pad = inp.pad;
      const gas = Math.max(0, inp.my || 0, pad?.a ? 1 : 0), brake = Math.max(0, -(inp.my || 0), pad?.b ? 1 : 0);
      if (pad ? pad.l : inp.crouch) { this.quitT += dt; if (this.quitT > 1.1) { this.leave('quit'); return; } } else this.quitT = 0;
      const racing = this.phase === 'race' && !k.done;
      if (this.phase === 'count' && gas > 0.5 && this.t > 2.2 && !this.rocket) this.rocket = this.t; // rocket start timing
      const ctl = racing ? { steer: inp.mx || 0, gas, brake, hop: pad ? pad.r : !!inp.jump, hopPressed: pad ? pad.rHit : !!inp.jumpPressed }
        : k.done ? { steer: 0, gas: 0.5, brake: 0 } : { steer: 0, gas: 0, brake: 0 };
      if (this.autopilot && racing) { if (dt > 0) aiKart(k, dt); } // test laps (?debug)
      else if (dt > 0) stepKart(k, ctl, dt);
      if (racing && (pad ? pad.itemHit : inp.hatPressed) && k.item) useItem(k);
      // the player model rides in the seat
      const m = P.m;
      const sx = Math.sin(k.yaw), sz = Math.cos(k.yaw);
      P.pos.set(k.x - sx * 0.3, k.y + 0.02 + k.km.body.position.y, k.z - sz * 0.3);
      P.face = k.yaw;
      P.vel.set(sx * k.speed, 0, sz * k.speed);
      m.root.position.copy(P.pos); m.root.rotation.set(0, P.face + k.km.body.rotation.y, 0); m.root.scale.set(1, 1, 1);
      m.body.position.y = 0.5; m.body.rotation.set(0, 0, -(ctl.steer || 0) * 0.12);
      m.legs.forEach(l => { l.rotation.set(-1.45, 0, 0); });
      m.arms.forEach((a, i) => { a.rotation.set(-1.05, 0, (i ? -1 : 1) * 0.12 + (ctl.steer || 0) * 0.15); });
      m.headPivot.rotation.set(0, -(ctl.steer || 0) * 0.3, 0);
      for (const e of m.eyes || []) e.scale.y = 1;
      if (dt > 0) g.sfx.engine(Math.min(1.4, Math.abs(k.speed) / TOP + (k.boost > 0 ? 0.3 : 0)));
    },
    update(dt) {
      if (this.phase === 'idle') return;
      this.t += dt;
      if (this.phase === 'count') {
        const n = Math.floor(this.t / 0.9);
        if (n !== this.lastN && n <= 3) {
          this.lastN = n;
          if (n < 3) { setLights(n + 1); g.ui.banner(String(3 - n), '', 0.8); g.sfx.play('beep'); }
          else {
            setLights(3, true); g.ui.banner(tr(Q('¡Fuego!', 'Go!')), '', 1.2); g.sfx.play('go');
            this.phase = 'race'; this.t = 0;
            // pressing the gas right at "1" gives a rocket start; too early and you stall
            if (this.rocket > 2.3 && this.rocket < 2.75) { me.boost = 1.2; g.sfx.play('boost'); g.ui.toast(tr(Q('¡Arranque turbo!', 'Rocket start!')), 1.5); }
            else if (this.rocket && this.rocket <= 2.3) { me.spin = 0.6; g.ui.toast(tr(Q('¡Se ahogó el motor!', 'Engine stalled!')), 1.5); }
            karts.forEach(k => { if (!k.player && Math.random() < 0.5) k.boost = 0.6 + Math.random() * 0.5; });
          }
        }
      }
      if (this.phase === 'race') {
        for (const k of karts) if (!k.player) aiKart(k, dt);
        for (const k of karts) if (!k.done) k.time += dt;
        kartVsKart();
        updateBoxes(dt); updateShots(dt); updateCocos(dt);
        standings();
        this.hud(dt);
        if (me.done && !this.ending) { this.ending = true; setTimeout(() => this.finish(), 2600); }
      } else {
        for (const k of karts) if (!k.player) { k.speed = 0; place(k); }
      }
      for (const k of karts) animateKart(k, dt);
    },
    hud(dt) {
      const pos = order.indexOf(me) + 1;
      $h('.kpos').textContent = ord(pos);
      $h('.klap').textContent = tr(Q(`Vuelta ${Math.min(LAPS, Math.max(1, me.lap))}/${LAPS}`, `Lap ${Math.min(LAPS, Math.max(1, me.lap))}/${LAPS}`));
      $h('.ktime').textContent = fmt(me.time);
      $h('.kitem').textContent = me.item ? ITEM[me.item] : '';
      $h('.kboard').innerHTML = order.map(k => `<li class="${k.player ? 'me' : ''}">${tr(typeof k.name === 'string' ? Q(k.name, k.name) : k.name)}</li>`).join('');
      $h('.kwrong').hidden = !(me.wrong > 1.2);
      $h('.kwrong').textContent = tr(Q('¡Al revés!', 'Wrong way!'));
    },
    async finish() {
      const pos = order.indexOf(me) + 1;
      const t = Math.round(me.time * 10) / 10;
      const prize = [30, 15, 10, 5, 5][pos - 1];
      g.wallet += prize; g.counters?.();
      const best = g.q.kartBest;
      if (pos === 1 && (!best || t < best)) g.q.kartBest = t;
      if (!g.q.kartPlace || pos < g.q.kartPlace) g.q.kartPlace = pos;
      const first = pos === 1 && !g.q.karts;
      if (pos === 1) g.q.karts = true;
      g.save();
      this.leave('done');
      g.ui.banner(tr(Q(`¡${ord(pos)} lugar!`, `${ord(pos)} place!`)), fmt(me.time), 3);
      await g.ui.say('Cheo', [
        pos === 1 ? Q(`¡Campeón del Gran Premio! ${fmt(me.time)}. ¡Qué manera de guiar!`, `Grand Prix champion! ${fmt(me.time)}. What driving!`)
          : pos <= 3 ? Q(`¡${ord(pos)} lugar! Al podio. Un poquito más y le ganas a ${order[0].name}.`, `${ord(pos)} place! On the podium. A bit more and you'll beat ${order[0].name}.`)
            : Q(`${ord(pos)} lugar. Derrapa en las curvas y usa las cajas; la revancha es gratis.`, `${ord(pos)} place. Drift in the turns and use the item boxes; rematches are free.`),
        Q(`Toma ${prize} chavos por correr.`, `Here are ${prize} chavos for racing.`),
      ]);
      if (first) g.reveal('karts', cheo.x, cheo.y + 2, cheo.z);
    },
  });
  g.kartRace = race;
  race.debug = { karts, me, T, N, order, aiKart: (k, dt) => aiKart(k, dt), score: k => score(k) };

  // ---- physics for every kart (the player's through drive(), the AI's through aiKart())
  const tmpP = new THREE.Vector3(), tmpV = new THREE.Vector3();
  function stepKart(k, c, dt) {
    const offroad = Math.abs(lateral(k)) > 3.7;
    k.boost = Math.max(0, k.boost - dt);
    k.bump = Math.max(0, k.bump - dt);
    let steer = c.steer || 0;
    if (k.spin > 0) { k.spin -= dt; steer = 0; k.speed *= 1 - Math.min(1, dt * 2.5); }
    const top = TOP * (k.topK || 1) * (offroad && !(k.boost > 0) ? 0.55 : 1) * (k.boost > 0 ? 1.35 : 1);
    const want = k.spin > 0 ? 0 : c.gas > 0 ? top * c.gas : c.brake > 0 ? -6 * c.brake : 0;
    k.speed += (want - k.speed) * Math.min(1, dt * (want > k.speed ? (k.boost > 0 ? 3 : 1.25) : c.brake ? 3 : 1.6));
    if (k.boost > 0 && k.speed < TOP * 1.2) k.speed = Math.min(TOP * 1.35, k.speed + 40 * dt);
    // drifting: hop into a turn and hold ⤒, let go for a mini-turbo
    if (c.hopPressed && !k.air) {
      k.hop = 0.18;
      if (Math.abs(steer) > 0.25 && k.speed > 7) { k.drift = Math.sign(steer); k.charge = 0; }
    }
    if (k.drift && (!c.hop || k.speed < 5 || k.spin > 0)) {
      if (k.charge > 1.5) { k.boost = Math.max(k.boost, 1.1); g.sfx.play('boost'); }
      else if (k.charge > 0.75) { k.boost = Math.max(k.boost, 0.6); g.sfx.play('boost'); }
      k.drift = 0; k.charge = 0;
    }
    const grip = Math.min(1, Math.abs(k.speed) / 6) * (1 - 0.3 * Math.min(1, Math.abs(k.speed) / TOP));
    let turn;
    if (k.drift) {
      const into = Math.max(0, Math.min(1, (steer * k.drift + 1) / 2));
      turn = k.drift * (0.45 + 0.75 * into) * 2.3;
      k.charge += dt * (0.6 + into);
      if (k.player && Math.random() < 0.6) {
        const col = k.charge > 1.5 ? 0xff9a2e : k.charge > 0.75 ? 0x4ab8ff : 0xffffff;
        for (const s of [-1, 1]) g.fx.emit(k.x - Math.sin(k.yaw) * 0.6 + Math.cos(k.yaw) * 0.55 * s, k.y + 0.15, k.z - Math.cos(k.yaw) * 0.6 - Math.sin(k.yaw) * 0.55 * s, 1, { color: col, speed: 1.5, up: 1, life: 0.25, grav: 4 });
      }
    } else turn = steer * 2.4 * grip;
    k.yaw -= turn * dt * Math.sign(k.speed || 1);
    // move, then push out of anything solid (bollards that are down don't count)
    tmpP.set(k.x + Math.sin(k.yaw) * k.speed * dt, k.y, k.z + Math.cos(k.yaw) * k.speed * dt);
    tmpV.set(Math.sin(k.yaw) * k.speed, 0, Math.cos(k.yaw) * k.speed);
    const w = phys.resolve(tmpP, KR, 1.0, tmpV).wall;
    if (w) {
      const head = -(Math.sin(k.yaw) * w.nx + Math.cos(k.yaw) * w.nz);
      if (head > 0.6 && Math.abs(k.speed) > 6 && !k.bump) { k.speed *= 0.35; k.bump = 0.35; if (k.player || near(k)) g.sfx.play('land'); }
      else k.speed *= 1 - Math.min(0.5, dt * 3 * Math.max(0, head));
    }
    k.x = tmpP.x; k.z = tmpP.z;
    // ground and ramps
    const gy = phys.groundAt(k.x, k.z, k.y + 0.1).h;
    if (!k.air) {
      for (const r of ramps) {
        const dx = k.x - r.x, dz = k.z - r.z, s = T[r.i];
        const along = dx * s.ux + dz * s.uz, side = dx * s.nx + dz * s.nz;
        if (Math.abs(side) < 1.6 && along > 0.2 && along < 1.3 && k.speed > 8) { k.air = true; k.vy = 6.5 + k.speed * 0.12; k.y = gy + 0.5; g.sfx.play('bigjump'); if (k.player) k.boost = Math.max(k.boost, 0.5); }
      }
    }
    if (k.air || gy < k.y - 0.25) {
      k.air = true;
      k.vy -= 26 * dt;
      k.y += k.vy * dt;
      if (k.y <= gy) { k.y = gy; k.air = false; k.vy = 0; if (k.player) g.sfx.play('land'); }
    } else k.y += (gy - k.y) * Math.min(1, dt * 20);
    // boost pads
    for (const p of pads) if (Math.hypot(k.x - p.x, k.z - p.z) < 1.3 && !k.air) { if (k.boost < 0.3 && k.player) g.sfx.play('boost'); k.boost = Math.max(k.boost, 1.0); }
    // fell in the water, or stuck against something: a pelican puts you back on the track
    const wet = H(k.x, k.z) < -0.5 && k.y < 0.3;
    k.stuck = c.gas > 0.3 && Math.abs(k.speed) < 1.2 && k.spin <= 0 ? k.stuck + dt : 0;
    if (wet || k.stuck > (k.player ? 4 : 2.2)) respawn(k, wet);
    progress(k);
  }
  function respawn(k, wet) {
    const p = at(k.idx, k.player ? 0 : k.lane);
    Object.assign(k, { x: p.x, z: p.z, y: p.s.gy, yaw: Math.atan2(p.s.ux, p.s.uz), speed: 0, vy: 0, air: false, stuck: 0, drift: 0 });
    if (k.player) { g.sfx.play('pelican'); g.ui.toast(tr(wet ? Q('¡Un pelícano te sacó del agua!', 'A pelican fished you out of the water!') : Q('¡Un pelícano te devolvió a la pista!', 'A pelican put you back on the track!')), 2.2); }
  }
  const lateral = k => { const s = T[k.idx]; return (k.x - s.x) * s.nx + (k.z - s.z) * s.nz; };
  function progress(k) {
    const prev = k.idx;
    k.idx = nearest(k.x, k.z, prev);
    const a = rel(prev), b = rel(k.idx);
    if (b > N * 0.4 && b < N * 0.6) k.half = true;
    if (a > N * 0.8 && b < N * 0.2 && k.half) {
      k.lap++; k.half = false;
      if (k.lap > LAPS && !k.done) {
        k.done = true;
        if (k.player) { g.ui.banner(tr(Q('¡Meta!', 'Finish!')), fmt(k.time), 2.4); g.sfx.play('checkpoint'); }
      } else if (k.player && k.lap === LAPS) { g.ui.banner(tr(Q('¡Última vuelta!', 'Final lap!')), '', 1.6); g.sfx.play('ring'); }
      else if (k.player && k.lap > 1) g.sfx.play('ring');
    }
    // going the wrong way?
    const s = T[k.idx];
    k.wrong = Math.sin(k.yaw) * s.ux + Math.cos(k.yaw) * s.uz < -0.3 && Math.abs(k.speed) > 3 ? k.wrong + 1 / 60 : 0;
  }
  // race progress: finished karts first (by time), then laps and distance (lap 0 = still behind the line)
  const score = k => { const r = rel(k.idx); return (k.done ? 1e7 - k.time * 100 : 0) + k.lap * N + (k.lap === 0 && r > N / 2 ? r - N : r); };
  function standings() {
    order.sort((a, b) => score(b) - score(a));
  }

  // ---- AI drivers: follow the track in their lane, slow for the tight corners, use items
  function aiKart(k, dt) {
    if (k.done) { stepKart(k, { steer: 0, gas: 0.35, brake: 0 }, dt); return; }
    // rubber band a little so the race stays close
    const lead = score(k) - score(me);
    k.topK = k.skill * (lead > 40 ? 0.9 : lead > 15 ? 0.96 : lead < -60 ? 1.1 : lead < -20 ? 1.05 : 1);
    const look = Math.round(5 + Math.abs(k.speed) * 0.45);
    k.lane += (laneAt(k.idx + look, k.want) - k.lane) * Math.min(1, dt * 1.6);
    const tgt = at(k.idx + look, k.lane);
    let d = Math.atan2(tgt.x - k.x, tgt.z - k.z) - k.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const steer = Math.max(-1, Math.min(1, -d * 2.4));
    // how sharp is the road ahead?
    const a = T[(k.idx + 4) % N], b = T[(k.idx + 18) % N];
    const bend = Math.acos(Math.max(-1, Math.min(1, a.ux * b.ux + a.uz * b.uz)));
    const gas = bend > 1.0 ? 0.62 : bend > 0.55 ? 0.8 : 1;
    stepKart(k, { steer, gas, brake: 0 }, dt);
    // items
    if (k.item) {
      k.itemT -= dt;
      if (k.itemT < 0) {
        const i = order.indexOf(k), ahead = order[i - 1], behind = order[i + 1];
        const gap = o => o ? Math.abs(score(o) - score(k)) : 1e9;
        if (k.item === 'cafe' && bend < 0.4) useItem(k);
        else if (k.item === 'coco' && gap(behind) < 14) useItem(k);
        else if ((k.item === 'pava' || k.item === 'chancla') && gap(ahead) < 22) useItem(k);
        else if (k.itemT < -6) useItem(k);
      }
    }
    if (Math.random() < dt * 0.3) k.want = (Math.random() - 0.5) * 2.6;
  }
  function kartVsKart() {
    for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > KR * 2 || d < 1e-4 || Math.abs(a.y - b.y) > 0.8) continue;
      const push = (KR * 2 - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const sa = a.speed, sb = b.speed;
      a.speed = sa * 0.9 + sb * 0.05; b.speed = sb * 0.9 + sa * 0.05;
    }
  }

  // ---- item boxes, the coconuts on the road and the flying pavas and chanclas
  const texCache = {};
  const itemSprite = (kind, size = 0.9) => {
    texCache[kind] ||= emojiTexture(ITEM[kind]);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCache[kind] }));
    s.scale.setScalar(size);
    return s;
  };
  function roll(k) {
    const r = order.indexOf(k) / (order.length - 1); // 0 first ... 1 last
    const x = Math.random();
    if (r < 0.2) return x < 0.5 ? 'coco' : x < 0.9 ? 'pava' : 'cafe';
    if (r > 0.7) return x < 0.45 ? 'cafe' : x < 0.85 ? 'chancla' : 'pava';
    return x < 0.3 ? 'cafe' : x < 0.6 ? 'pava' : x < 0.8 ? 'coco' : 'chancla';
  }
  function updateBoxes(dt) {
    for (const b of boxes) {
      if (b.down > 0) { b.down -= dt; b.m.visible = b.down <= 0; continue; }
      b.m.rotation.y += dt * 1.5; b.m.rotation.x += dt * 0.7;
      for (const k of karts) {
        if (Math.hypot(k.x - b.x, k.z - b.z) < 1.1) {
          b.down = 3; b.m.visible = false;
          g.fx.emit(b.x, b.y, b.z, 14, { color: 0xffffff, speed: 3, up: 2, life: 0.4 });
          if (!k.item) {
            k.item = roll(k); k.itemT = 1 + Math.random() * 3;
            if (k.player) g.sfx.play('itembox');
          }
          break;
        }
      }
    }
  }
  function useItem(k) {
    const it = k.item;
    k.item = null;
    const sx = Math.sin(k.yaw), sz = Math.cos(k.yaw);
    if (it === 'cafe') { k.boost = Math.max(k.boost, 1.6); if (k.player || near(k)) g.sfx.play('boost'); return; }
    if (it === 'coco') {
      const m = itemSprite('coco', 0.8);
      const c = { m, x: k.x - sx * 1.4, z: k.z - sz * 1.4, y: k.y + 0.4, life: 40 };
      m.position.set(c.x, c.y, c.z); g.root.add(m); cocos.push(c);
      return;
    }
    // pava goes straight; the chancla finds the kart ahead of you
    const i = order.indexOf(k);
    const target = it === 'chancla' ? order[i - 1] : null;
    const m = itemSprite(it, 0.8);
    const s = { m, kind: it, owner: k, x: k.x + sx * 1.2, z: k.z + sz * 1.2, y: k.y + 0.5, vx: sx * 30, vz: sz * 30, life: it === 'chancla' ? 5 : 2.6, target, idx: k.idx };
    m.position.set(s.x, s.y, s.z); g.root.add(m); shots.push(s);
    if (k.player || near(k)) g.sfx.play('throw');
  }
  const near = k => Math.hypot(k.x - me.x, k.z - me.z) < 25;
  const hit = (k, what) => {
    if (k.spin > 0) return;
    k.spin = 1.1; k.drift = 0;
    g.fx.emit(k.x, k.y + 0.6, k.z, 16, { color: 0xffe08a, speed: 3, up: 2, life: 0.5 });
    if (k.player) { g.sfx.play('spin'); g.ui.toast(tr(what), 1.4); }
    else if (near(k)) g.sfx.play('hit');
  };
  function updateCocos(dt) {
    for (let i = cocos.length - 1; i >= 0; i--) {
      const c = cocos[i];
      c.life -= dt;
      const k = karts.find(k => Math.hypot(k.x - c.x, k.z - c.z) < 0.9 && !k.air);
      if (k || c.life < 0) {
        if (k) hit(k, Q('¡Un coco en la carretera!', 'A coconut on the road!'));
        g.root.remove(c.m); cocos.splice(i, 1);
      }
    }
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      if (s.target && !s.target.done) {
        // follow the track toward the target, then home in
        const tk = s.target, dd = Math.hypot(tk.x - s.x, tk.z - s.z);
        let tx, tz;
        if (dd < 12) { tx = tk.x; tz = tk.z; } else { s.idx = nearest(s.x, s.z, s.idx); const p = at(s.idx + 8); tx = p.x; tz = p.z; }
        const l = Math.hypot(tx - s.x, tz - s.z) || 1;
        s.vx += ((tx - s.x) / l * 32 - s.vx) * Math.min(1, dt * 5);
        s.vz += ((tz - s.z) / l * 32 - s.vz) * Math.min(1, dt * 5);
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      s.y += ((phys.groundAt(s.x, s.z, s.y).h + 0.5) - s.y) * Math.min(1, dt * 10);
      s.m.position.set(s.x, s.y, s.z);
      s.m.material.rotation += dt * 12;
      tmpP.set(s.x, s.y - 0.4, s.z); tmpV.set(0, 0, 0);
      const wall = phys.resolve(tmpP, 0.3, 0.6, tmpV).wall;
      const k = karts.find(k => k !== s.owner && Math.hypot(k.x - s.x, k.z - s.z) < 1.0);
      if (k || wall || s.life < 0) {
        if (k) hit(k, s.kind === 'chancla' ? Q('¡Chancletazo!', 'Hit by a flying chancla!') : Q('¡Te dieron con una pava!', 'Hit by a flying pava!'));
        g.root.remove(s.m); shots.splice(i, 1);
      }
    }
  }

  // ---- looks
  function animateKart(k, dt) {
    const km = k.km;
    place(k);
    k.hop = Math.max(0, (k.hop || 0) - dt);
    km.body.position.y = (k.hop > 0 ? Math.sin((0.18 - k.hop) / 0.18 * Math.PI) * 0.25 : 0) + (k.bump > 0 ? Math.sin(k.bump * 30) * 0.03 : 0);
    const slide = k.drift ? -k.drift * 0.35 : 0;
    km.body.rotation.y = k.spin > 0 ? (1.1 - k.spin) * Math.PI * 3.6 : km.body.rotation.y + (slide - km.body.rotation.y) * Math.min(1, dt * 8);
    km.body.rotation.x = k.air ? -Math.max(-0.3, Math.min(0.3, k.vy * 0.04)) : 0;
    for (const w of km.wheels) w.rotation.x += k.speed * dt / 0.21;
    km.flames.forEach(f => { f.visible = k.boost > 0; f.scale.setScalar(0.8 + Math.random() * 0.5); });
    if (k.driver) k.driver.headPivot.rotation.y = -(k.lane - (k.prevLane ?? k.lane)) * 3;
    k.prevLane = k.lane;
  }
  // the end bollards sink into the street while racing and come back up afterwards
  const gateTick = dt => {
    for (const gt of g.paseoGates || []) {
      const want = race.riding ? -1 : 0;
      gt.mesh.position.y += (want - gt.mesh.position.y) * Math.min(1, dt * 3);
      const up = gt.mesh.position.y > -0.3;
      for (const c of gt.cols) c.alive = up;
    }
  };
  g.animals.push({ update(dt, now) {
    gateTick(dt);
    // Cheo waves the flag while a race is on
    if (race.riding) cheo.m.arms[1].rotation.set(-2.6 + Math.sin(now * 9) * 0.4, 0, -0.3);
    else cheo.m.arms[1].rotation.set(-0.3, 0, -0.1);
    if (!race.riding) for (const k of karts) { k.km.body.position.y = Math.sin(now * 20 + k.x) * 0.004; }
  } });
  park();

  // ---- talking to Cheo
  async function talkCheo() {
    if (race.riding) return;
    const won = !!g.q.karts;
    const lines = won ? [
      Q(`¡El campeón volvió! Tu mejor tiempo: ${g.q.kartBest ? fmt(g.q.kartBest) : '—'}.`, `The champ is back! Your best time: ${g.q.kartBest ? fmt(g.q.kartBest) : '—'}.`),
      Q('¿Otra carrera? Los karts están calientitos.', 'Another race? The karts are nice and warm.'),
    ] : [
      Q(`¡Wepa, ${g.playerName}! Soy Cheo. Hoy cerramos el Paseo para el Gran Premio de La Guancha.`, `Wepa, ${g.playerName}! I'm Cheo. Today we closed the Paseo for the La Guancha Grand Prix.`),
      Q('Tres vueltas: el Paseo, la fuente del león y la rotonda del sur. Gana y te llevas una máscara.', 'Three laps: the Paseo, the lion fountain and the south roundabout. Win and the mask is yours.'),
      Q('Derrapa en las curvas y suelta para un turbo. Las cajas te dan cafecito, cocos, pavas... ¡y la chancla! Los botones salen abajo en la pantalla.', 'Drift through the turns and let go for a turbo. The boxes give you coffee, coconuts, pavas... and the chancla! The buttons are shown at the bottom of the screen.'),
      Q('Acelera justo cuando se prenda la tercera luz y sales con turbo.', 'Hit the gas right as the third light comes on for a rocket start.'),
    ];
    const v = await g.ui.say('Cheo', lines, [
      { label: Q(won ? 'Otra carrera' : '¡A correr!', won ? 'Race again' : "Let's race!"), value: 'go', primary: true },
      { label: Q('Ahora no', 'Not now'), value: 'no' },
    ]);
    if (v === 'go') race.start();
  }
  cheo.quest = () => (g.q.karts ? null : race.riding ? 'active' : 'available');
  g.quest({ id: 'karts', name: Q('Gran Premio de La Guancha', 'La Guancha Grand Prix'), giver: 'Cheo', challenge: race,
    desc: Q('Tres vueltas en kart contra Marina, Tito, Yari y Mike. Llega primero para ganar una máscara.',
      'Three kart laps against Marina, Tito, Yari and Mike. Finish first to win a mask.'),
    progress: () => (race.riding ? `${Math.min(LAPS, Math.max(1, me.lap))}/${LAPS}` : g.q.kartPlace ? tr(Q(`Mejor: ${ord(g.q.kartPlace)}`, `Best: ${ord(g.q.kartPlace)}`)) : ''),
    status: () => (g.q.karts ? 'done' : race.riding ? 'active' : 'available'),
    where: () => ({ x: cheo.x, y: cheo.y, z: cheo.z, label: Q('Habla con Cheo', 'Talk to Cheo') }),
  });
}
