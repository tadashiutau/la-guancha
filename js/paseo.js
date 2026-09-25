// Paseo Tablado La Guancha: the street behind the kiosks is closed to cars and works as a wide
// pedestrian promenade (Street View 2016 + the 2024 satellite): pale concrete (drawn by
// world.js buildRoutes), bollards where cars used to come in, raised stone planters with palms
// on the kiosk side, shade trees in tree wells with red benches and tall green lamp posts on the
// parking side, fabric shade canopies over picnic tables, green pergolas at the kiosk entrances,
// and the Héctor Lavoe statue by the entrance pavilion. buildPaseoLife fills it with kids on bikes
// and scooters and people out for a walk.
import * as THREE from 'three';
import { S } from './data.js';
import { P, rng } from './geo.js';
import * as M from './models.js';

export const PASEO_W = 13; // paved width in meters (the old street plus its sidewalks)

// Positions along the paseo in real meters: t from the roundabout (south) toward the north end,
// o sideways, positive toward the kiosks and the sea. Returns game-space [X, Z].
export function paseoFrame(data) {
  const r = data.world.roads.find(q => q.paseo);
  if (!r) return null;
  const segs = [];
  let len = 0;
  for (let i = 0; i < r.p.length - 1; i++) {
    const [ax, ay] = r.p[i], [bx, by] = r.p[i + 1];
    const l = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, ux: (bx - ax) / l, uy: (by - ay) / l, l, t0: len });
    len += l;
  }
  const seg = t => segs.find(s => t <= s.t0 + s.l) || segs[segs.length - 1];
  const real = (t, o) => {
    const s = seg(t), k = t - s.t0;
    // left of the direction of travel is the sea side
    return [s.ax + s.ux * k - s.uy * o, s.ay + s.uy * k + s.ux * o];
  };
  const at = (t, o = 0) => { const [x, y] = real(t, o); return [x * S, -y * S]; };
  // heading (game yaw, as used by Batch boxes) of the paseo at t
  const yawAt = t => { const s = seg(t); return Math.atan2(s.uy, s.ux); };
  // game direction vectors along (+t) and across (+o)
  const dirs = t => { const s = seg(t); return { ux: s.ux * S, uz: -s.uy * S, nx: -s.uy * S, nz: -s.ux * S }; };
  const project = (X, Z) => {
    const x = X / S, y = -Z / S;
    let best = null;
    for (const s of segs) {
      const k = Math.max(0, Math.min(s.l, (x - s.ax) * s.ux + (y - s.ay) * s.uy));
      const px = s.ax + s.ux * k, py = s.ay + s.uy * k;
      const d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { d, t: s.t0 + k, o: -(x - px) * s.uy + (y - py) * s.ux };
    }
    return best;
  };
  return { len, at, yawAt, dirs, project, half: PASEO_W / 2 };
}

// ------------------------------------------------------------------------------------------------
// Street furniture, built with the world (before the foliage, so the planters can grow palms)
export function buildPaseoStreet({ data, batch, phys, H, info, palm, broadTree, bush }) {
  const F = paseoFrame(data);
  if (!F) return;
  const R = rng(515);
  const L = F.len;
  const box = (col, x, y, z, sx, sy, sz, yaw = 0) => batch.add(P.box(), col, x, y, z, sx, sy, sz, yaw);
  const RED = 0xb8432f, IRON = 0x2b2b2b, GREEN = 0x2f7a52, STONE = 0xd8cfbe, CAP = 0xe8e1d2;
  const out = { obstacles: [], benches: [], canopies: [], pergolas: [], len: L };
  info.paseo = out;
  const blocked = (x, z, r) => phys.near(x, z, r).some(c => c.solid && c.tag !== 'deck' && phys.sdist(c, x, z).d < r);
  const trunkNear = (x, z, r) => phys.near(x, z, r).some(c => c.tag === 'trunk' && phys.sdist(c, x, z).d < r);

  // where footpaths cross the paseo toward the kiosks, and where other roads meet it
  const crossings = [];
  for (const fw of data.world.footways) {
    for (let i = 0; i < fw.length - 1; i++) {
      const a = F.project(fw[i][0] * S, -fw[i][1] * S), b = F.project(fw[i + 1][0] * S, -fw[i + 1][1] * S);
      if (Math.abs(a.t - b.t) < 12 && Math.sign(a.o - 4) !== Math.sign(b.o - 4) && Math.abs(a.o) < 30 && Math.abs(b.o) < 30)
        crossings.push((a.t + b.t) / 2);
    }
  }
  const mouths = [];
  for (const r of data.world.roads) {
    if (r.paseo) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const A = F.project(r.p[i][0] * S, -r.p[i][1] * S), B = F.project(r.p[i + 1][0] * S, -r.p[i + 1][1] * S);
      for (const side of [-1, 1]) {
        const edge = side * (F.half + 0.8);
        if ((A.o - edge) * (B.o - edge) > 0 || Math.abs(A.o - B.o) < 0.01) continue;
        const k = (edge - A.o) / (B.o - A.o), t = A.t + (B.t - A.t) * k;
        if (t < 14 || t > L - 30) continue;
        const dt = B.t - A.t, dO = B.o - A.o, dl = Math.hypot(dt, dO);
        mouths.push({ t, o: edge, w: r.w, dt: dt / dl, dO: dO / dl });
      }
    }
  }
  const nearCrossing = (t, d) => crossings.some(c => Math.abs(c - t) < d) || mouths.some(m => Math.abs(m.t - t) < m.w / 2 + d);

  // ---- bollards: across both ends and across every road mouth, so cars stay out
  const bollard = (x, z) => {
    const g = H(x, z);
    batch.add(P.cyl(8), 0xe9e6de, x, g + 0.42, z, 0.26, 0.84, 0.26);
    batch.add(P.cyl(8), 0xd8262f, x, g + 0.7, z, 0.27, 0.1, 0.27);
    batch.add(P.sphere(8, 4), 0xe9e6de, x, g + 0.84, z, 0.26, 0.14, 0.26);
    phys.addBox(x, z, 0.13, 0.13, 0, g - 0.2, g + 0.9, { tag: 'bollard' });
  };
  for (const t of [4.5, L - 30]) for (let o = -F.half + 0.8; o <= F.half - 0.7; o += 1.9) bollard(...F.at(t, o));
  for (const m of mouths) {
    // a row across the road where it meets the paseo
    for (let k = -m.w / 2 + 0.6; k <= m.w / 2 - 0.5; k += 1.9)
      bollard(...F.at(m.t - m.dO * k, m.o + m.dt * k));
  }

  // ---- trees already standing on the paseo (LiDAR) get round stone rings
  for (const [x, z] of info.trees) {
    const p = F.project(x, z);
    if (p.d > F.half + 0.5 || p.t < 2 || p.t > L - 2) continue;
    const g = H(x, z);
    batch.add(P.cyl(14), STONE, x, g + 0.2, z, 1.7, 0.4, 1.7);
    batch.add(P.cyl(14), 0x5f4c38, x, g + 0.41, z, 1.45, 0.03, 1.45);
    phys.add(circle(x, z, 0.85, 10), g - 0.2, g + 0.4, { tag: 'planter' });
    out.obstacles.push({ t: p.t, o: p.o, r: 1.6 });
  }

  // ---- the Héctor Lavoe statue spot and the open plaza in front of the entrance pavilion
  const gw = info.gateway ? F.project(info.gateway.x, info.gateway.z) : null;
  const statueT = gw ? gw.t - 8 : 145;
  out.statue = { t: statueT, o: 8.2 };
  const nearGateway = t => gw && Math.abs(t - gw.t) < 9;

  // ---- kiosk side: long raised stone planters with grass, rocks, flowers and palms; every
  // fourth slot is a shaded seating area instead. Benches in the gaps face the paseo.
  let slot = 0;
  for (let t = 10; t < L - 34; t += 11.5) {
    const tc = t + 4.5;
    if (nearCrossing(tc, 7.5) || nearGateway(tc)) continue;
    const o = 8.9, [x, z] = F.at(tc, o), yaw = F.yawAt(tc), g = H(x, z);
    if (g < 0.3 || blocked(x, z, 1.6)) continue;
    const { ux, uz, nx, nz } = F.dirs(tc);
    if (slot++ % 4 === 3) {
      // shade canopy: four green posts, a peaked fabric top, a picnic table underneath
      const cw = 2.2, top = g + 2.6;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = x + ux * u * cw / S * 0.6 + nx * v * cw / S * 0.6, pz = z + uz * u * cw / S * 0.6 + nz * v * cw / S * 0.6;
        box(GREEN, px, g + 1.3, pz, 0.1, 2.6, 0.1, yaw);
        phys.addBox(px, pz, 0.07, 0.07, 0, g, top, { tag: 'post' });
      }
      batch.add(P.cone(4), slot % 8 === 4 ? 0xf2efe6 : 0x3aa3a0, x, top + 0.45, z, cw * 2.1, 0.9, cw * 2.1, yaw + Math.PI / 4);
      batch.add(P.cone(4), 0x2c7f7c, x, top + 0.02, z, cw * 2.15, 0.06, cw * 2.15, yaw + Math.PI / 4);
      phys.add(rect(x, z, ux, uz, nx, nz, 2.6, 2.6), top - 0.05, top + 0.35, { tag: 'canopy', solid: false });
      picnic(x, g, z, yaw);
      out.canopies.push({ x, z, y: top + 0.9 });
      continue;
    }
    const len = 8.5 * S, dep = 2.3 * S, hgt = 0.55;
    box(STONE, x, g + hgt / 2 - 0.1, z, len, hgt + 0.2, dep, yaw);
    box(CAP, x, g + hgt, z, len + 0.08, 0.08, dep + 0.08, yaw);
    box(0x6f9a4a, x, g + hgt + 0.02, z, len - 0.3, 0.04, dep - 0.3, yaw);
    phys.addBox(x, z, len / 2, dep / 2, yaw, g - 0.2, g + hgt + 0.04, { tag: 'planter' });
    out.obstacles.push({ t: tc, o, r: 1.5 });
    // coral-stone rocks and flowering shrubs
    for (let k = 0; k < 3; k++) {
      const u = (R() - 0.5) * len * 0.8, v = (R() - 0.5) * dep * 0.5;
      const rx = x + ux * u / S + nx * v / S, rz = z + uz * u / S + nz * v / S;
      batch.add(P.dodeca(), 0xe3dccb, rx, g + hgt + 0.12, rz, 0.45 + R() * 0.3, 0.3, 0.4 + R() * 0.2, R() * 6, 0, 0, 0.25);
    }
    for (const u of [-0.32, 0.32]) {
      const bx = x + ux * u * len / S, bz = z + uz * u * len / S;
      if (R() < 0.5) batch.add(P.ico(0), [0xe0457b, 0xf2a93b, 0xd84a3a][Math.floor(R() * 3)], bx, g + hgt + 0.35, bz, 0.9, 0.6, 0.8, R() * 6, 0, 0, 0.2);
      else bush(bx, g + hgt, bz, 0.9 + R() * 0.3);
    }
    if (!trunkNear(x, z, 2.2)) palm(x + ux * (R() - 0.5) * 2, g + hgt, z + uz * (R() - 0.5) * 2, 4.2 + R() * 1.6);
    // a bench in the gap after the planter, facing the paseo
    const bt = tc + 5.75;
    if (!nearCrossing(bt, 3) && !nearGateway(bt)) bench(bt, 6.7, Math.PI);
  }

  // ---- parking side: shade trees in square tree wells, red benches between them, tall lamps
  let k = 0;
  for (let t = 9; t < L - 34; t += 10) {
    k++;
    if (nearCrossing(t, 3)) continue;
    const [x, z] = F.at(t, -8.2), g = H(x, z), yaw = F.yawAt(t);
    if (g < 0.3 || blocked(x, z, 1.2)) continue;
    if (!trunkNear(x, z, 3)) {
      box(STONE, x, g + 0.08, z, 1.9, 0.16, 1.9, yaw);
      box(0x5f4c38, x, g + 0.17, z, 1.6, 0.02, 1.6, yaw);
      broadTree(x, g, z, (6 + R() * 2) * S, (2.4 + R() * 0.6) * S);
    }
    if (k % 2) bench(t + 5, -7.2, 0);
    if (k % 3 === 1) streetLamp(...F.at(t + 5, -9.6));
  }
  // lamps on the kiosk side too
  for (let t = 20; t < L - 34; t += 30) {
    if (nearCrossing(t, 2.5) || nearGateway(t)) continue;
    const [x, z] = F.at(t, 7.1);
    if (!blocked(x, z, 0.8)) streetLamp(x, z);
  }

  // ---- green pergolas over the paths into the kiosk rows
  for (const c of crossings) {
    const [x, z] = F.at(c, 12.2), g = H(x, z), yaw = F.yawAt(c);
    const { ux, uz, nx, nz } = F.dirs(c);
    const pts = [];
    for (const u of [-2.2, 2.2]) for (const v of [-1.6, 1.6]) pts.push([x + ux * u + nx * v, z + uz * u + nz * v]);
    if (pts.some(([px, pz]) => blocked(px, pz, 0.3)) || g < 0.3) continue;
    for (const [px, pz] of pts) {
      box(GREEN, px, g + 1.4, pz, 0.16, 2.8, 0.16, yaw);
      phys.addBox(px, pz, 0.09, 0.09, 0, g, g + 2.8, { tag: 'post' });
    }
    for (const v of [-1.6, 1.6]) box(0x245e40, x + nx * v, g + 2.75, z + nz * v, 4.4 * S + 0.4, 0.16, 0.14, yaw);
    for (let u = -2.5; u <= 2.5; u += 0.5) box(GREEN, x + ux * u, g + 2.88, z + uz * u, 0.09, 0.1, 3.2 * S + 0.5, yaw);
    phys.add(rect(x, z, ux, uz, nx, nz, 2.6, 2.0), g + 2.7, g + 2.95, { tag: 'pergola' });
    out.pergolas.push({ x, z, y: g + 2.95, ux, uz });
  }

  // a red slat bench on black legs (backless, like the real ones), long side along the paseo
  function bench(t, o, turn) {
    const [x, z] = F.at(t, o), g = H(x, z), yaw = F.yawAt(t) + turn;
    if (g < 0.3 || blocked(x, z, 1.0)) return;
    const { ux, uz } = F.dirs(t);
    for (const v of [-0.22, 0, 0.22]) {
      const { nx, nz } = F.dirs(t);
      box(RED, x + nx * v, g + 0.46, z + nz * v, 1.7, 0.05, 0.12, yaw);
    }
    for (const u of [-1.15, 1.15]) box(IRON, x + ux * u, g + 0.22, z + uz * u, 0.08, 0.44, 0.4, yaw);
    phys.addBox(x, z, 0.85, 0.24, yaw, g, g + 0.48, { tag: 'bench' });
    out.benches.push({ t, o, x, z, g });
  }
  function picnic(x, g, z, yaw) {
    box(0xa8744a, x, g + 0.72, z, 2.0, 0.08, 0.9, yaw);
    box(0x5a4636, x, g + 0.36, z, 0.12, 0.72, 0.12, yaw);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const v of [-0.8, 0.8]) box(0x8a5a3c, x + s * v, g + 0.42, z + c * v, 2.0, 0.07, 0.35, yaw);
    phys.addBox(x, z, 1.0, 0.45, yaw, g, g + 0.76, { tag: 'table' });
  }
  // tall green lamp post with two lanterns
  function streetLamp(x, z) {
    const g = H(x, z), h = 4.2;
    batch.add(P.cyl(8), 0x245e40, x, g + 0.25, z, 0.3, 0.5, 0.3);
    batch.add(P.cyl(6), GREEN, x, g + h / 2, z, 0.12, h, 0.12);
    box(GREEN, x, g + h - 0.1, z, 1.2, 0.06, 0.06, 0);
    for (const u of [-0.55, 0.55]) {
      batch.add(P.frustum(1.3, 6), 0xf6f0d0, x + u, g + h - 0.35, z, 0.22, 0.34, 0.22);
      batch.add(P.cone(6), 0x245e40, x + u, g + h - 0.1, z, 0.34, 0.18, 0.34);
    }
    phys.addBox(x, z, 0.12, 0.12, 0, g, g + h, { tag: 'lamp' });
    info.lampTops.push([x, g + h - 0.3, z]);
  }
  function rect(x, z, ux, uz, nx, nz, hu, hv) {
    // corners of a box hu x hv (meters) around x, z
    // ux.. are per-meter game vectors (from F.dirs)
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + ux * a * hu + nx * b * hv, z + uz * a * hu + nz * b * hv]);
  }
  function circle(x, z, r, n) {
    const o = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    return o;
  }
}

// ------------------------------------------------------------------------------------------------
// People on the paseo: the Héctor Lavoe statue (read its plaque), kids riding bikes and scooters
// up and down, and a few folks strolling. Everyone weaves around the planters and stops to chat.
export function buildPaseoLife(g) {
  const { data, world } = g;
  const F = paseoFrame(data);
  const info = world.info.paseo;
  if (!F || !info) return;
  const R = rng(2718);
  const H = data.terrainH;
  const ph = g.phys;

  // ---- Héctor Lavoe, "El Cantante de los Cantantes", born in Ponce: bronze on a stone pedestal
  {
    const { t, o } = info.statue;
    const [x, z] = F.at(t, o), gy = H(x, z);
    const face = Math.atan2(-F.dirs(t).nx, -F.dirs(t).nz); // looking out over the paseo
    const ped = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x8d8a82 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0xd8cfbe }));
    base.position.y = 0.15;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), stone);
    block.position.y = 0.7;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.03), new THREE.MeshLambertMaterial({ color: 0xc09a4a }));
    plaque.position.set(0, 0.75, 0.46);
    ped.add(base, block, plaque);
    ped.position.set(x, gy, z);
    ped.rotation.y = face;
    ped.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    g.root.add(ped);
    ph.add([[x - 0.45, z - 0.45], [x + 0.45, z - 0.45], [x + 0.45, z + 0.45], [x - 0.45, z + 0.45]].map(([px, pz]) => {
      const dx = px - x, dz = pz - z, c = Math.cos(face), s = Math.sin(face);
      return [x + dx * c + dz * s, z - dx * s + dz * c];
    }), gy - 0.2, gy + 1.1, { tag: 'statue' });
    const bronze = { skin: 0x8a6436, hair: 0x5e4426, shirt: 0x7a5530, bottom: 0x6a4a2a, dress: false, hat: 'none', stache: true, scale: 1.08 };
    const n = g.npc(bronze, { es: 'Placa', en: 'Plaque' }, x, z, face, null, { y: gy + 1.1, custom: true, fixed: true });
    // singing: head tipped back, one hand with the microphone up at the mouth, the other out
    n.m.headPivot.rotation.x = -0.2;
    // (arms hang along -y; aim them: the mic hand from the shoulder up to the mouth)
    const aim = (arm, x, y, z) => arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x, y, z).normalize());
    aim(n.m.arms[1], -0.64, 0.5, 0.6);
    aim(n.m.arms[0], -0.55, -0.25, 0.8);
    n.m.legs[0].rotation.x = 0.15; n.m.legs[1].rotation.x = -0.1;
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a22 }));
    mic.position.set(0, -0.42, 0.04);
    n.m.arms[1].add(mic);
    // sunglasses, his trademark
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
    shades.position.set(0, 0.21, 0.23);
    n.m.headPivot.add(shades);
    n.talk = async (game) => game.ui.say({ es: 'Placa', en: 'Plaque' }, [
      { es: 'HÉCTOR LAVOE · "El Cantante de los Cantantes" · Ponce, 1946 – 1993.', en: 'HÉCTOR LAVOE · "The Singer of Singers" · Ponce, 1946 – 1993.' },
      { es: 'Nació en el barrio Machuelo de Ponce y llevó la salsa de Puerto Rico al mundo.', en: 'Born in Ponce’s Machuelo neighborhood, he took Puerto Rico’s salsa to the world.' },
      { es: '"Todo tiene su final, nada dura para siempre…"', en: '"Everything has its end, nothing lasts forever…"' },
    ]);
  }

  // ---- chavos: slaloms down the paseo, a ring around the statue, the canopy and pergola tops
  // (hop up with the hat), and a line up the entrance pavilion's roof
  const top = (x, z) => ph.topMost(x, z);
  for (const t0 of [30, 175, 290]) {
    for (let k = 0; k < 12; k++) {
      const [x, z] = F.at(t0 + k * 2.4, Math.sin(k * 0.7) * 3.2);
      g.coin(x, top(x, z) + 0.7, z);
    }
  }
  {
    const [sx, sz] = F.at(info.statue.t, info.statue.o);
    g.coinRing(sx, H(sx, sz) + 0.7, sz, 1.5, 8);
  }
  for (const c of info.canopies) g.coinRing(c.x, c.y, c.z, 0.6, 4);
  info.pergolas.forEach((p, i) => { if (i % 2 === 0) g.coinLine(p.x - p.ux * 1.8, p.y + 0.6, p.z - p.uz * 1.8, p.x + p.ux * 1.8, p.y + 0.6, p.z + p.uz * 1.8, 3); });
  const gw = world.info.gateway;
  if (gw) for (let k = 0; k < 5; k++) {
    const x = gw.x - gw.nx * k * 0.5, z = gw.z - gw.nz * k * 0.5;
    g.coin(x, top(x, z) + 0.7, z);
  }

  // ---- riders and walkers
  const KID_LINES = [
    { es: '¡Mira, sin manos! …Bueno, con una mano.', en: 'Look, no hands! …Well, one hand.' },
    { es: 'Aquí se puede correr bicicleta porque no pasan carros. ¡Es el mejor sitio!', en: 'You can ride here because there are no cars. Best spot ever!' },
    { es: 'Mi papá me compró el scooter en Navidad. ¡Soy el más rápido del Paseo!', en: 'My dad got me the scooter for Christmas. I’m the fastest on the Paseo!' },
    { es: '¿Tú viste la piragua de Doña Carmen? ¡La de frambuesa es la mejor!', en: 'Did you see Doña Carmen’s piraguas? Raspberry is the best!' },
    { es: 'Te echo una carrera hasta la torre… ¡mentira, que mami no me deja ir tan lejos!', en: 'Race you to the tower… just kidding, mom won’t let me go that far!' },
  ];
  const WALK_LINES = [
    { es: 'Los domingos esto se llena de familias. ¡Y de nenes en bicicleta!', en: 'On Sundays this fills up with families. And kids on bikes!' },
    { es: 'Antes pasaban carros por aquí. Ahora es todo pa’ caminar. ¡Mucho mejor!', en: 'Cars used to drive through here. Now it’s all for walking. Much better!' },
    { es: '¿Viste la estatua de Héctor Lavoe? Ponce no se olvida de su cantante.', en: 'Did you see the Héctor Lavoe statue? Ponce never forgets its singer.' },
  ];
  const KIDS = ['Yandel', 'Mía', 'Dylan', 'Kiara', 'Luisito', 'Adriana'];
  const ADULTS = ['Doña Nereida', 'Don Wiso', 'Brenda', 'Rafa'];
  const riders = [];
  const margin = 12, tMax = F.len - 36;
  const make = (i, kind) => {
    const kid = kind !== 'walk';
    const look = M.randomLook(R, kid ? { scale: 0.72, hat: R() < 0.4 ? 'cap' : 'none' } : {});
    const t = margin + R() * (tMax - margin), o = (R() - 0.5) * 7;
    const [x, z] = F.at(t, o);
    const name = kid ? KIDS[i % KIDS.length] : ADULTS[i % ADULTS.length];
    const n = g.npc(look, name, x, z, 0, null, { custom: true, fixed: true });
    const rig = new THREE.Group();
    g.root.add(rig);
    rig.add(n.m.root);
    n.m.root.position.set(0, 0, 0);
    n.m.root.rotation.y = 0;
    const rd = { n, rig, kind, t, o, oT: o, dir: R() < 0.5 ? 1 : -1, phase: R() * 6, pause: 0, wobble: R() * 6,
      speed: kind === 'bike' ? 3.4 + R() * 0.8 : kind === 'scooter' ? 2.4 + R() * 0.5 : 0.9 + R() * 0.4 };
    if (kind === 'bike') bikeRig(rd, look);
    if (kind === 'scooter') scooterRig(rd);
    n.talk = async (game) => {
      rd.pause = 4;
      await game.ui.say(name, [kid ? KID_LINES[(i + (kind === 'scooter' ? 2 : 0)) % KID_LINES.length] : WALK_LINES[i % WALK_LINES.length]]);
    };
    riders.push(rd);
  };
  for (let i = 0; i < 3; i++) make(i, 'bike');
  for (let i = 0; i < 2; i++) make(i + 3, 'scooter');
  for (let i = 0; i < 4; i++) make(i, 'walk');

  function bikeRig(rd, look) {
    const col = [0xe3342f, 0x2f6fd0, 0x2e9e5b, 0xf7c948, 0xd84ab0][Math.floor(R() * 5)];
    const frameM = new THREE.MeshLambertMaterial({ color: col }), dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const bike = new THREE.Group();
    const wheels = [];
    for (const zz of [-0.34, 0.34]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 14), dark);
      w.position.set(0, 0.2, zz); w.rotation.y = Math.PI / 2;
      bike.add(w); wheels.push(w);
    }
    const bar = (x0, y0, z0, x1, y1, z1, m = frameM, r = 0.025) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 5), m);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      bike.add(mesh);
    };
    bar(0, 0.2, -0.34, 0, 0.42, -0.06); // seat stay
    bar(0, 0.2, -0.34, 0, 0.22, 0.0);   // chain stay
    bar(0, 0.22, 0.0, 0, 0.42, -0.06);  // seat tube
    bar(0, 0.42, -0.06, 0, 0.47, 0.26); // top tube
    bar(0, 0.22, 0.0, 0, 0.47, 0.26);   // down tube
    bar(0, 0.2, 0.34, 0, 0.56, 0.26);   // fork + head
    bar(-0.16, 0.56, 0.24, 0.16, 0.56, 0.24, dark, 0.02); // handlebar
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.16), dark);
    seat.position.set(0, 0.46, -0.08);
    bike.add(seat);
    rd.rig.add(bike);
    rd.wheels = wheels;
    // sit on the seat, hands on the bars
    rd.n.m.root.position.set(0, 0.1, -0.1);
    rd.n.m.arms[0].rotation.x = rd.n.m.arms[1].rotation.x = -1.15;
    rd.n.m.body.rotation.x = 0.25;
    rd.look = look;
  }
  function scooterRig(rd) {
    const col = [0x3fb8b0, 0xe3342f, 0x8a4ad0][Math.floor(R() * 3)];
    const m = new THREE.MeshLambertMaterial({ color: col }), dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const sc = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.55), m);
    deck.position.set(0, 0.08, 0);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5), m);
    stem.position.set(0, 0.4, 0.3); stem.rotation.x = -0.12;
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 5), dark);
    hb.position.set(0, 0.7, 0.34); hb.rotation.z = Math.PI / 2;
    sc.add(deck, stem, hb);
    rd.wheels = [];
    for (const zz of [-0.26, 0.3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), dark);
      w.position.set(0, 0.06, zz); w.rotation.z = Math.PI / 2;
      sc.add(w); rd.wheels.push(w);
    }
    rd.rig.add(sc);
    rd.n.m.root.position.set(0, 0.1, -0.05);
    rd.n.m.arms[0].rotation.x = rd.n.m.arms[1].rotation.x = -1.2;
  }

  // steer around planters, tree rings and other riders
  const obstacles = info.obstacles;
  const walkAnim = (n, sp, phase) => {
    const s = Math.sin(phase), k = Math.min(1, sp / 2);
    n.m.legs[0].rotation.x = s * 0.8 * k; n.m.legs[1].rotation.x = -s * 0.8 * k;
    n.m.arms[0].rotation.x = -s * 0.6 * k; n.m.arms[1].rotation.x = s * 0.6 * k;
  };
  g.animals.push({
    update(dt, now) {
      const cam = g.cam.cam.position, Pp = g.player.pos;
      for (const rd of riders) {
        const { n, rig } = rd;
        const vis = Math.hypot(n.x - cam.x, n.z - cam.z) < 80;
        rig.visible = vis;
        const near = Math.hypot(Pp.x - n.x, Pp.z - n.z) < 2.6;
        if (near) rd.pause = Math.max(rd.pause, 0.6);
        let sp = rd.speed;
        if (rd.pause > 0) { rd.pause -= dt; sp = 0; }
        rd.t += rd.dir * sp * dt / S;
        if (rd.t > tMax || rd.t < margin) { rd.dir *= -1; rd.t = Math.max(margin, Math.min(tMax, rd.t)); }
        // look ahead for something in the way and pick a lane beside it
        const ahead = rd.t + rd.dir * (rd.kind === 'walk' ? 2.5 : 5);
        for (const ob of obstacles) {
          if (Math.abs(ob.t - ahead) < ob.r + 1.5 && Math.abs(ob.o - rd.oT) < ob.r + 1.2)
            rd.oT = Math.max(-F.half + 1, Math.min(F.half - 1, ob.o + (rd.o >= ob.o ? 1 : -1) * (ob.r + 1.4)));
        }
        for (const other of riders) {
          if (other === rd || other.dir === rd.dir) continue;
          if (Math.abs(other.t - ahead) < 3 && Math.abs(other.o - rd.oT) < 1.2) rd.oT = Math.max(-F.half + 1, Math.min(F.half - 1, rd.oT + (rd.o > other.o ? 1.5 : -1.5)));
        }
        if (R() < dt * 0.08) rd.oT = Math.max(-F.half + 1, Math.min(F.half - 1, rd.oT + (R() - 0.5) * 4));
        const dO = Math.max(-2 * dt, Math.min(2 * dt, rd.oT - rd.o));
        rd.o += sp ? dO : 0;
        const [x, z] = F.at(rd.t, rd.o);
        n.x = x; n.z = z;
        n.y = ph.groundAt(x, z, H(x, z) + 0.6).h;
        rig.position.set(x, n.y, z);
        // face the way we're going (a little lean into lane changes), or the player when stopped
        const { ux, uz, nx, nz } = F.dirs(rd.t);
        let want = Math.atan2(ux * rd.dir + nx * dO / Math.max(dt, 1e-3) * 0.15 / S, uz * rd.dir + nz * dO / Math.max(dt, 1e-3) * 0.15 / S);
        if (!sp && near) want = Math.atan2(Pp.x - x, Pp.z - z);
        let d = want - rig.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        rig.rotation.y += d * Math.min(1, dt * 6);
        if (!vis) continue;
        rd.phase += dt * (sp ? (rd.kind === 'walk' ? 3 + sp * 3 : sp * 2.2) : 0);
        if (rd.kind === 'walk') {
          walkAnim(n, sp, rd.phase);
          n.m.body.position.y = 0.52 + Math.abs(Math.cos(rd.phase)) * 0.04 * Math.min(1, sp);
        } else if (rd.kind === 'bike') {
          // pedaling, wheels spinning
          n.m.legs[0].rotation.x = -1.0 + Math.sin(rd.phase) * 0.5;
          n.m.legs[1].rotation.x = -1.0 - Math.sin(rd.phase) * 0.5;
          for (const w of rd.wheels) w.rotation.x += sp * dt / 0.2 * S;
        } else {
          // one foot on the deck, the other kicking now and then
          const kick = Math.max(0, Math.sin(rd.phase * 0.7));
          n.m.legs[0].rotation.x = 0;
          n.m.legs[1].rotation.x = sp ? 0.2 + kick * 0.7 : 0;
          for (const w of rd.wheels) w.rotation.x += sp * dt / 0.06 * S;
        }
      }
    },
  });
}
