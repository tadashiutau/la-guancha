// Builds the La Guancha level from real data: terrain, water, boardwalk, kiosks, tower,
// piers, boats, trees, cars and scenery. Registers colliders with the physics world.
import * as THREE from 'three';
import { S } from './data.js';
import { Batch, P, prismTris, hipRoofTris, polyArea, rng, prim } from './geo.js';

const C = {
  deck: 0x9a8570, deck2: 0x8b7762, rail: 0x7b3a26, piling: 0x5a4636,
  lamp: 0x2f7f76, lampGlass: 0xfff3c4, planter: 0xb9ae9c, shrub: 0x3f8f4a,
  kioskWall: 0xf2a48c, kioskTrim: 0xfbe3d2, kioskRoof: 0x2d6a4c, window: 0x3b4b5a,
  towerWood: 0x8a5a3c, towerCore: 0xf1ead8, towerRoof: 0x2d6a4c,
  pier: 0xb8a58a, pierFloat: 0xd8d2c4, hull: 0xf7f7f2, trunk: 0x8a6a4a, palm: 0x4f9a3a, palm2: 0x6fb04a,
  tree: 0x3f8a3c, tree2: 0x5aa446, mangrove: 0x2f6e36, rock: 0x8f887c, coconut: 0x6b4a2a,
};

function wpts(pts) { return pts.map(([x, y]) => [x * S, -y * S]); }

function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-9;
  let t = ((px - ax) * ex + (pz - az) * ez) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}

function polyDist(px, pz, line) {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(px, pz, ...line[i], ...line[i + 1]));
  return d;
}

export function buildWorld(scene, data, phys, { mobile }) {
  const W = data.world;
  const H = data.terrainH;
  phys.terrainH = H;
  const R = rng(7);
  const batch = new Batch(60);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const info = { kiosks: [], deckY: 1, tablado: [], tower: null, boats: [], trees: [], piers: [], lampTops: [],
    pilings: [], signs: [], palmCrowns: [] };

  carveUnderBoardwalk(data, W.tablado.map(wpts));
  buildTerrain(scene, data);
  const water = buildWater(scene, data);
  const sky = buildSky(scene);

  // ---------------------------------------------------------------- boardwalk
  const tab = W.tablado.map(wpts);
  info.tablado = tab;
  const DW = 7 * S; // deck width
  for (const line of tab) {
    // deck height from the land behind it
    // sample the ground across the whole deck strip so grass never pokes through the planks
    let top = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let s = 0; s <= len; s += 1.5)
        for (let o = -DW; o <= DW; o += 0.7) top = Math.max(top, H(ax + ux * s - uz * o, az + uz * s + ux * o));
    }
    info.deckY = Math.max(0.95, Math.min(top + 0.1, 2.2));
    const y = info.deckY;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      // water side = the lower side
      let nx = -uz, nz = ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (H(mx + nx * 6, mz + nz * 6) > H(mx - nx * 6, mz - nz * 6)) { nx = -nx; nz = -nz; }
      const off = 1.2 * S; // centerline sits slightly over the water
      const cx = mx + nx * off, cz = mz + nz * off;
      const yaw = Math.atan2(-uz, ux);
      phys.addBox(cx, cz, len / 2 + 0.3, DW / 2, yaw, y - 0.35, y, { tag: 'deck' });
      // planks
      const n = Math.max(1, Math.round(len / (1.3 * S)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        batch.add(P.box(), k % 2 ? C.deck : C.deck2, ax + dx * t + nx * off, y - 0.12, az + dz * t + nz * off,
          len / n + 0.02, 0.24, DW, yaw, 0, 0, 0.06);
      }
      // railing on the water side, lamps and planters on the land side
      const rx = nx * (off + DW / 2 - 0.08), rz = nz * (off + DW / 2 - 0.08);
      const posts = Math.max(1, Math.round(len / (2.2 * S)));
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        batch.add(P.box(), C.rail, ax + dx * t + rx, y + 0.33, az + dz * t + rz, 0.14, 0.66, 0.14, yaw);
      }
      for (const hy of [0.34, 0.62]) batch.add(P.box(), C.rail, mx + rx, y + hy, mz + rz, len + 0.1, 0.07, 0.1, yaw);
      phys.addBox(mx + rx, mz + rz, len / 2, 0.12, yaw, y, y + 0.66, { tag: 'rail', ground: true });
      // pilings under the deck, visible from the water
      for (let k = 0; k <= Math.round(len / (4 * S)); k++) {
        const t = k / Math.max(1, Math.round(len / (4 * S)));
        const px = ax + dx * t + nx * (off + DW / 2 - 0.2), pz = az + dz * t + nz * (off + DW / 2 - 0.2);
        const bot = Math.min(H(px, pz), -0.5);
        batch.add(P.cyl(6), C.piling, px, (y - 0.3 + bot) / 2, pz, 0.32, y - 0.3 - bot, 0.32);
        info.pilings.push([px, pz]);
      }
      const lx = -nx * (DW / 2 - off - 0.3), lz = -nz * (DW / 2 - off - 0.3);
      const lamps = Math.max(1, Math.round(len / (13 * S)));
      for (let k = 0; k < lamps; k++) {
        const t = (k + 0.5) / lamps;
        const px = ax + dx * t + lx, pz = az + dz * t + lz;
        lamp(batch, px, y, pz, yaw);
        info.lampTops.push([px, y + 2.35, pz]);
        phys.addBox(px, pz, 0.12, 0.12, 0, y, y + 2.2, { tag: 'lamp' });
        // planter with shrubs between lamps
        const qx = ax + dx * (t + 0.5 / lamps) + lx * 1.05, qz = az + dz * (t + 0.5 / lamps) + lz * 1.05;
        if (t + 0.5 / lamps < 1) {
          batch.add(P.box(), C.planter, qx, y + 0.22, qz, 1.1, 0.44, 0.7, yaw, 0, 0, 0.1);
          batch.add(P.ico(0), C.shrub, qx, y + 0.62, qz, 1.1, 0.55, 0.7, R() * 6, 0, 0, 0.2);
          phys.addBox(qx, qz, 0.55, 0.35, yaw, y, y + 0.44, { tag: 'planter' });
        }
      }
    }
  }

  // ---------------------------------------------------------------- buildings
  for (const b of W.buildings) buildBuilding(b);

  function buildBuilding(b) {
    const pts = wpts(b.p);
    const base = b.b * S;
    const [rcx, rcy, rhx, rhy, rang, rectness] = b.r;
    const cx = rcx * S, cz = -rcy * S, hx = rhx * S, hz = rhy * S;
    const area = b.r[2] * b.r[3] * 4;
    const dTab = Math.min(...tab.map(l => polyDist(cx, cz, l)));
    const roofCol = new THREE.Color().setRGB(b.rc[0] / 255, b.rc[1] / 255, b.rc[2] / 255, THREE.SRGBColorSpace);
    if (b.k === 'tower') { buildTower(cx, cz, base); return; }
    if (b.k === 'tank') {
      const r = Math.max(hx, hz), h = b.h * S;
      batch.add(P.cyl(16), 0xeeeeea, cx, base + h / 2, cz, r * 2, h, r * 2);
      batch.add(P.frustum(0.2, 16), 0xd9d9d2, cx, base + h + 0.5, cz, r * 2, 1, r * 2);
      const ring = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      phys.add(ring, base - 1, base + h, { tag: 'tank', roof: 1 / 1.0, cap: 1 });
      return;
    }
    if (b.k === 'roof') {
      const h = 4 * S;
      for (const [x, z] of pts) batch.add(P.box(), 0xdddddd, x, base + h / 2, z, 0.25, h, 0.25);
      batch.addTris(prismTris(pts, base + h, base + h + 0.25, true, true), 0xc9463d);
      phys.add(pts, base + h, base + h + 0.25, { tag: 'roof' });
      return;
    }
    const isKiosk = dTab < 22 * S && area < 800;
    if (isKiosk) {
      const eave = base + 3.1 * S * 1.15;
      const rect = rectPts(cx, cz, hx, hz, rang);
      batch.addTris(prismTris(rect, base - 0.3, eave, false), C.kioskWall);
      // trim band and dark serving windows all around
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.02, hz + 0.02, rang), eave - 0.18, eave, false), C.kioskTrim);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.03, hz * 0.7, rang), base + 0.75, base + 1.45, false), C.window);
      batch.addTris(prismTris(rectPts(cx, cz, hx * 0.8, hz + 0.03, rang), base + 0.75, base + 1.45, false), C.window);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.05, hz + 0.05, rang), base + 0.72, base + 0.8, false), C.kioskTrim);
      const slope = 0.55, cap = 1.4;
      batch.addTris(hipRoofTris(cx, cz, hx, hz, rang, eave, slope, cap, 0.45), C.kioskRoof);
      phys.add(rectPts(cx, cz, hx + 0.45, hz + 0.45, rang), eave - 0.3, eave, { tag: 'roof', roof: slope, cap });
      phys.add(rect, base - 0.3, eave - 0.3, { tag: 'kiosk' });
      info.kiosks.push({ x: cx, z: cz, hx, hz, yaw: rang, base, eave, top: eave + Math.min(Math.min(hx, hz) * slope, cap), dTab });
      return;
    }
    const h = Math.max(b.h * S, 2.2);
    const wall = area > 1500 ? 0xe9e4d8 : [0xf3e7c9, 0xe8d7b0, 0xf0d4c0, 0xdfe7ea][Math.floor(R() * 4)];
    const top = base + h;
    if (rectness > 0.8 && area < 900) {
      const rect = rectPts(cx, cz, hx, hz, rang);
      const eave = base + Math.min(h, 4.5 * S * 1.2);
      batch.addTris(prismTris(rect, base - 0.3, eave, false), wall);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.03, hz + 0.03, rang), base + 0.9, base + 1.6, false), C.window);
      batch.addTris(hipRoofTris(cx, cz, hx, hz, rang, eave, 0.5, 2, 0.35), roofCol);
      phys.add(rectPts(cx, cz, hx + 0.35, hz + 0.35, rang), eave - 0.3, eave, { roof: 0.5, cap: 2, tag: 'roof' });
      phys.add(rect, base - 0.3, eave - 0.3, { tag: 'bld' });
    } else {
      batch.addTris(prismTris(pts, base - 0.3, top, false), wall);
      batch.addTris(prismTris(pts, top, top + 0.25, true), roofCol);
      if (h > 3) batch.addTris(prismTris(pts, base + 1.0, base + 1.5, false), C.window);
      phys.add(pts, base - 0.3, top + 0.25, { tag: 'bld' });
    }
  }

  function rectPts(cx, cz, hx, hz, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
  }

  // ---------------------------------------------------------------- observation tower
  function buildTower(cx, cz, base) {
    base = Math.max(base, 0.95);
    const steps = 44, rise = 0.25, perLoop = 22;
    const Rin = 2.75, Rout = 4.1, rc = (Rin + Rout) / 2, half = 2.6;
    const topY = base + steps * rise;
    // pick the stair start facing the boardwalk
    const tb = tab[0];
    const tx = tb[0][0], tz = tb[0][1];
    const a0 = Math.atan2(tz - cz, tx - cx);
    // core
    batch.add(P.box(), C.towerCore, cx, (base + topY) / 2 - 0.2, cz, 3.2, topY - base, 3.2);
    phys.addBox(cx, cz, 1.6, 1.6, 0, base - 1, topY - 0.35, { tag: 'towercore' });
    // square spiral: map an angle to a point on a square of "radius" r
    const sq = (a, r) => {
      const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
      return [cx + c / m * r, cz + s / m * r];
    };
    for (let i = 0; i < steps; i++) {
      const a = a0 + (i / perLoop) * Math.PI * 2;
      const [x, z] = sq(a, rc);
      const [x2, z2] = sq(a + Math.PI * 2 / perLoop, rc);
      const y = base + (i + 1) * rise;
      const yaw = Math.atan2(-(z2 - z), x2 - x);
      const len = Math.hypot(x2 - x, z2 - z) + 0.25;
      batch.add(P.box(), i % 2 ? C.towerWood : 0x9a6a4a, (x + x2) / 2, y - 0.12, (z + z2) / 2, len, 0.24, Rout - Rin, yaw);
      phys.addBox((x + x2) / 2, (z + z2) / 2, len / 2, (Rout - Rin) / 2, yaw, y - 0.5, y, { tag: 'step' });
      if (i % 2 === 0) {
        const [ox, oz] = sq(a, Rout - 0.05);
        batch.add(P.box(), C.towerWood, ox, y + 0.45, oz, 0.12, 0.9, 0.12);
      }
    }
    // support columns at the stair corners
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cx + sx * (Rout - 0.2), z = cz + sz * (Rout - 0.2);
      batch.add(P.box(), C.towerWood, x, (base + topY) / 2, z, 0.35, topY - base, 0.35);
      phys.addBox(x, z, 0.18, 0.18, 0, base - 1, topY - 0.35 - 5.5, { tag: 'post' });
    }
    // top platform, railing, roof
    batch.add(P.box(), C.towerWood, cx, topY + 0.1, cz, half * 2, 0.3, half * 2);
    phys.addBox(cx, cz, half, half, 0, topY - 0.2, topY + 0.25, { tag: 'towertop' });
    const ry = topY + 0.25;
    for (let k = -4; k <= 4; k++) {
      for (const [sx, sz, along] of [[1, 0, 'z'], [-1, 0, 'z'], [0, 1, 'x'], [0, -1, 'x']]) {
        const x = along === 'z' ? cx + sx * (half - 0.08) : cx + (k / 4) * (half - 0.1);
        const z = along === 'z' ? cz + (k / 4) * (half - 0.1) : cz + sz * (half - 0.08);
        batch.add(P.box(), C.rail, x, ry + 0.4, z, 0.1, 0.8, 0.1);
      }
    }
    // rails on three sides, open on the stair side
    const open = sq(a0 + (steps / perLoop) * Math.PI * 2, rc);
    const sides = [[half, 0, 0.1, half], [-half, 0, 0.1, half], [0, half, half, 0.1], [0, -half, half, 0.1]];
    for (const [ox, oz, hx2, hz2] of sides) {
      const x = cx + ox, z = cz + oz;
      if (Math.hypot(open[0] - x, open[1] - z) < half + 0.4) continue;
      batch.add(P.box(), C.rail, x, ry + 0.8, z, hx2 * 2, 0.08, hz2 * 2);
      phys.addBox(x, z, hx2, hz2, 0, ry, ry + 0.85, { tag: 'rail' });
    }
    // the roof is narrower than the deck so the railing works as a launch point onto it
    const rh = half - 0.6, over = 0.3;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      batch.add(P.box(), C.towerWood, cx + sx * (rh - 0.15), ry + 1.3, cz + sz * (rh - 0.15), 0.2, 2.6, 0.2);
      phys.addBox(cx + sx * (rh - 0.15), cz + sz * (rh - 0.15), 0.1, 0.1, 0, ry, ry + 2.6, { tag: 'post' });
    }
    const eave = ry + 2.6;
    batch.addTris(hipRoofTris(cx, cz, rh, rh, 0, eave, 0.75, 3, over), C.towerRoof);
    phys.add(rectPts(cx, cz, rh + over, rh + over, 0), eave - 0.2, eave, { tag: 'roof', roof: 0.75, cap: 3 });
    batch.add(P.cone(6), 0xd9b44a, cx, eave + (rh + over) * 0.75 + 0.4, cz, 0.25, 0.9, 0.25);
    info.tower = { x: cx, z: cz, base, topY: ry, roofTop: eave + (rh + over) * 0.75, startA: a0, rc };
  }

  // ---------------------------------------------------------------- piers + docked boats
  const PW = 2.4 * S;
  const pierLines = [];
  // OSM often draws docks as loose pieces. Connect each dead end that sits in the water to the
  // nearest shore or dock with a gangway, and drop short pieces that connect to nothing.
  const piers = W.piers.map(p => ({ ...p, pts: wpts(p.p) }));
  const allSegs = [];
  for (const p of piers) if (!p.ruin) for (let i = 0; i < p.pts.length - 1; i++) allSegs.push([...p.pts[i], ...p.pts[i + 1], p]);
  const gangways = [];
  const reach = (x, z, self) => {
    // distance to the nearest other dock, or else to dry land (radial search)
    let best = null;
    for (const [ax, az, bx, bz, o] of allSegs) {
      if (o === self) continue;
      const d = segDist(x, z, ax, az, bx, bz);
      if (d < PW && (!best || d < best.d)) best = { d, joined: true };
    }
    if (best) return best;
    if (H(x, z) > 0.1) return { d: 0, joined: true };
    for (let r = 1; r <= 22; r += 0.75)
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (H(px, pz) > 0.25) return { d: r, x: px, z: pz };
      }
    return null;
  };
  for (const p of piers) {
    if (p.ruin || p.area || p.pts.length < 2) continue;
    let linked = false;
    for (const [x, z] of [p.pts[0], p.pts[p.pts.length - 1]]) {
      const r = reach(x, z, p);
      if (!r) continue;
      if (r.joined) { linked = true; continue; }
      gangways.push([x, z, r.x, r.z, p.float ? 0.3 : 0.55]);
      linked = true;
    }
    let len = 0;
    for (let i = 0; i < p.pts.length - 1; i++) len += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
    if (!linked && len < 12) p.skip = true;
  }
  for (const [ax, az, bx, bz, y] of gangways) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    const top = Math.max(y, H(bx, bz) + 0.05);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (y + top) / 2;
    const tilt = Math.atan2(top - y, len);
    batch.add(P.box(), C.pier, mx, my - 0.1, mz, len + 0.6, 0.2, 1.3, yaw, 0, tilt);
    // walkable as a gentle ramp: a row of thin steps
    const n = Math.max(1, Math.ceil(len / 0.8));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      phys.addBox(ax + dx * t, az + dz * t, len / n / 2 + 0.05, 0.65, yaw, y + (top - y) * t - 0.3, y + (top - y) * t, { tag: 'pier' });
    }
    for (const sd of [-1, 1]) {
      const ox = -dz / len * 0.62 * sd, oz = dx / len * 0.62 * sd;
      batch.add(P.box(), C.rail, mx + ox, my + 0.45, mz + oz, len + 0.4, 0.06, 0.06, yaw, 0, tilt);
    }
  }
  for (const p of piers) {
    if (p.skip) continue;
    const pts = p.pts;
    const y = p.float ? 0.3 : 0.55;
    if (p.area && pts.length > 3) {
      batch.addTris(prismTris(pts, y - 0.3, y, true), p.float ? C.pierFloat : C.pier);
      phys.add(pts, y - 0.3, y, { tag: 'pier' });
      continue;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const yaw = Math.atan2(-dz, dx);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (p.ruin) {
        // just the old pilings: great for hopping
        const n = Math.round(len / 2.2);
        for (let k = 0; k <= n; k++) {
          const t = k / Math.max(n, 1);
          const px = ax + dx * t, pz = az + dz * t, ph = 0.6 + R() * 0.9, bot = Math.min(H(px, pz), -0.5);
          batch.add(P.cyl(7), C.piling, px, (ph + bot) / 2, pz, 0.7, ph - bot, 0.7, 0, 0, 0, 0.1);
          phys.addBox(px, pz, 0.35, 0.35, 0, bot, ph, { tag: 'piling' });
          info.pilings.push([px, pz, ph]);
        }
        continue;
      }
      batch.add(P.box(), p.float ? C.pierFloat : C.pier, mx, y - 0.15, mz, len + 0.1, 0.3, PW, yaw, 0, 0, 0.05);
      phys.addBox(mx, mz, len / 2 + 0.05, PW / 2, yaw, y - 0.3, y, { tag: 'pier' });
      const n = Math.round(len / 3);
      for (let k = 0; k <= n; k++) {
        const t = k / Math.max(n, 1);
        const px = ax + dx * t, pz = az + dz * t, bot = Math.min(H(px, pz), -0.5);
        for (const sd of [-1, 1]) {
          const ox = -dz / len * PW / 2 * sd, oz = dx / len * PW / 2 * sd;
          batch.add(P.cyl(6), C.piling, px + ox, (y + 0.35 + bot) / 2, pz + oz, 0.28, y + 0.35 - bot, 0.28);
        }
      }
      pierLines.push([ax, az, bx, bz, y]);
    }
  }
  info.piers = pierLines;

  // every boat must stay clear of other boats, docks and land
  const boatRects = [];
  const rectCorners = (x, z, hl, hw, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
  };
  const sat = (A, B) => {
    for (const poly of [A, B])
      for (let i = 0; i < 4; i++) {
        const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4];
        const nx = z2 - z1, nz = x1 - x2;
        const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
        if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
      }
    return true;
  };
  const boatFits = (x, z, L, Wd, yaw) => {
    const r = rectCorners(x, z, L / 2 + 0.25, Wd / 2 + 0.25, yaw);
    if (boatRects.some(o => sat(r, o))) return false;
    const inner = rectCorners(x, z, L / 2, Wd / 2, yaw);
    const probe = [...inner, [x, z], ...inner.map(([px, pz], i) => [(px + inner[(i + 1) % 4][0]) / 2, (pz + inner[(i + 1) % 4][1]) / 2])];
    for (const [px, pz] of probe) {
      if (H(px, pz) > -0.7) return false;
      for (const [ax, az, bx, bz] of pierLines) if (segDist(px, pz, ax, az, bx, bz) < PW / 2 + 0.2) return false;
    }
    boatRects.push(r);
    return true;
  };

  // docked boats along the Club Náutico piers (the photo can't separate tightly packed hulls)
  for (const [ax, az, bx, bz, y] of pierLines) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 8) continue;
    const ux = dx / len, uz = dz / len;
    for (const sd of [-1, 1]) {
      for (let t = 3; t < len - 2; t += 3.4 + R() * 1.2) {
        if (R() < 0.3) continue;
        const bl = (8 + R() * 6) * S;
        const nx = -uz * sd, nz = ux * sd;
        const px = ax + ux * t + nx * (PW / 2 + bl / 2 + 0.3), pz = az + uz * t + nz * (PW / 2 + bl / 2 + 0.3);
        const yaw = Math.atan2(-nz, nx);
        if (!boatFits(px, pz, bl, bl * 0.33, yaw)) continue;
        addBoat(px, pz, bl, bl * 0.33, yaw, R() < 0.45);
      }
    }
  }
  for (const [x, y, l, w, yaw] of W.boats) {
    const [px, pz] = [x * S, -y * S];
    const L = Math.max(l, 7) * S, Wd = Math.max(w, 2.4) * S;
    if (!boatFits(px, pz, L, Wd, yaw)) continue;
    addBoat(px, pz, L, Wd, yaw, l > 8.5 && R() < 0.6);
  }

  function addBoat(x, z, L, Wd, yaw, sail) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const T = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    const hull = [[-L / 2, -Wd / 2], [L * 0.15, -Wd / 2], [L / 2, 0], [L * 0.15, Wd / 2], [-L / 2, Wd / 2]].map(([u, v]) => T(u, v));
    const deck = 0.55;
    const stripe = [0x1f5fa8, 0xc0392b, 0x1e8a6e, 0x223344, 0xe0a030][Math.floor(R() * 5)];
    batch.addTris(prismTris(hull, -0.6, deck, true), C.hull);
    batch.addTris(prismTris(hull.map(([hx, hz]) => [x + (hx - x) * 1.02, z + (hz - z) * 1.02]), deck - 0.2, deck - 0.05, false), stripe);
    phys.add(hull, -0.8, deck, { tag: 'boat' });
    const cab = [-L * 0.2, 0, L * 0.22, Wd * 0.32];
    const [cx2, cz2] = T(cab[0], 0);
    const ch = sail ? 0.5 : 0.8;
    batch.add(P.box(), sail ? 0xf2f2ee : 0xeef3f6, cx2, deck + ch / 2, cz2, cab[2] * 2, ch, cab[3] * 2, yaw);
    batch.add(P.box(), 0x2b3a4a, cx2, deck + ch * 0.7, cz2, cab[2] * 2 + 0.05, ch * 0.25, cab[3] * 2 + 0.05, yaw);
    phys.addBox(cx2, cz2, cab[2], cab[3], yaw, deck, deck + ch, { tag: 'cabin' });
    if (sail) {
      const [mx, mz] = T(L * 0.08, 0);
      const mh = L * 1.25;
      batch.add(P.cyl(5), 0xdddddd, mx, deck + mh / 2, mz, 0.12, mh, 0.12);
      const [bx2, bz2] = T(-L * 0.15, 0);
      batch.add(P.box(), 0x1f4f8f, bx2, deck + 1.1, bz2, L * 0.45, 0.22, 0.22, yaw);
      phys.addBox(mx, mz, 0.08, 0.08, 0, deck, deck + mh, { tag: 'mast' });
    } else {
      // flybridge on bigger motor yachts
      if (L > 6.5) {
        const [fx, fz] = T(-L * 0.12, 0);
        batch.add(P.box(), 0xeef3f6, fx, deck + ch + 0.25, fz, cab[2] * 1.3, 0.5, cab[3] * 1.8, yaw);
        phys.addBox(fx, fz, cab[2] * 0.65, cab[3] * 0.9, yaw, deck + ch, deck + ch + 0.5, { tag: 'cabin' });
        info.boats.push({ x: fx, z: fz, top: deck + ch + 0.5, L });
      }
    }
    info.boats.push({ x, z, top: deck, L, sail });
  }

  // ---------------------------------------------------------------- breakwaters (rock piles)
  for (const bw of W.breakwaters) {
    const pts = wpts(bw);
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 1.2) {
        const x = ax + (bx - ax) * t / len + (R() - 0.5), z = az + (bz - az) * t / len + (R() - 0.5);
        const s = 0.8 + R() * 1.1;
        batch.add(P.dodeca(), C.rock, x, Math.max(H(x, z), -0.3) + s * 0.2, z, s, s * 0.7, s, R() * 6, R(), R(), 0.25);
      }
    }
  }

  // ---------------------------------------------------------------- trees (LiDAR)
  const tops = [];
  for (const [x, y, h, rad, kind] of W.trees) {
    const px = x * S, pz = -y * S, g = H(px, pz);
    if (g < 0.1) continue;
    if (phys.near(px, pz, 0.5).some(c => c.tag === 'kiosk' || c.tag === 'bld' || c.tag === 'deck')) continue;
    const hh = Math.min(h, 16) * S;
    let top;
    if (kind === 'palm') top = palm(px, g, pz, hh);
    else if (kind === 'mangrove') top = mangrove(px, g, pz, Math.min(hh, 4), rad * S);
    else top = broadTree(px, g, pz, hh, Math.min(rad, 5.5) * S);
    tops.push([px, pz, kind, top]);
  }
  info.trees = tops;

  function palm(x, g, z, h) {
    const lean = (R() - 0.5) * 0.35, dir = R() * Math.PI * 2;
    const segs = 4;
    let px = x, py = g, pz = z;
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      const ang = lean * (i + 1) / segs * 1.5;
      const nx = px + Math.cos(dir) * Math.sin(ang) * sh, nz = pz + Math.sin(dir) * Math.sin(ang) * sh;
      batch.add(P.frustum(0.85, 6), C.trunk, (px + nx) / 2, py + sh / 2, (pz + nz) / 2, 0.36 - i * 0.04, sh + 0.05, 0.36 - i * 0.04,
        0, Math.sin(dir) * ang, -Math.cos(dir) * ang, 0.1);
      px = nx; pz = nz; py += sh;
    }
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
      const a = i / fronds * Math.PI * 2 + R();
      batch.add(frondGeo(), i % 2 ? C.palm : C.palm2, px, py, pz, 1.6 + R() * 0.5, 1, 1, a, 0, 0, 0.15);
    }
    for (let i = 0; i < 3; i++) batch.add(P.sphere(6, 4), C.coconut, px + Math.cos(i * 2.1) * 0.22, py - 0.2, pz + Math.sin(i * 2.1) * 0.22, 0.28, 0.28, 0.28);
    phys.addBox(x, z, 0.18, 0.18, 0, g - 0.5, g + h * 0.6, { tag: 'trunk', ground: false });
    phys.add(circle(px, pz, 1.0, 6), py - 0.2, py + 0.1, { tag: 'palmtop', solid: false });
    info.palmCrowns.push([px, py, pz]);
    return py;
  }

  function broadTree(x, g, z, h, r) {
    const th = h * 0.45;
    batch.add(P.frustum(0.7, 6), C.trunk, x, g + th / 2, z, 0.45, th, 0.45);
    const blobs = 3;
    for (let i = 0; i < blobs; i++) {
      const a = R() * 6.28, d = r * 0.35;
      const s = r * (0.85 + R() * 0.35);
      batch.add(P.dodeca(), R() < 0.5 ? C.tree : C.tree2, x + Math.cos(a) * d, g + th + s * 0.35 + i * 0.2, z + Math.sin(a) * d, s * 1.2, s * 0.8, s * 1.2, R() * 6, 0, 0, 0.18);
    }
    phys.addBox(x, z, 0.22, 0.22, 0, g - 0.5, g + th, { tag: 'trunk', ground: false });
    phys.add(circle(x, z, r * 0.8, 7), g + th + r * 0.3, g + th + r * 0.75, { tag: 'canopy', solid: false });
    return g + th + r * 0.75;
  }

  function mangrove(x, g, z, h, r) {
    for (let i = 0; i < 3; i++) {
      const a = R() * 6.28, d = r * 0.4, s = Math.max(1.2, r) * (0.9 + R() * 0.5);
      batch.add(P.ico(0), C.mangrove, x + Math.cos(a) * d, g + h * 0.55 + i * 0.15, z + Math.sin(a) * d, s * 1.3, s * 0.8, s * 1.3, R() * 6, 0, 0, 0.2);
    }
    batch.add(P.cyl(5), C.trunk, x, g + h * 0.25, z, 0.25, h * 0.5, 0.25);
    phys.add(circle(x, z, Math.max(1.2, r) * 0.7, 6), g + h * 0.5, g + h * 0.8, { tag: 'canopy', solid: false });
    return g + h * 0.8;
  }

  function circle(x, z, r, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    return out;
  }

  // ---------------------------------------------------------------- parked cars
  const carCols = [0xd23b3b, 0xf0f0f0, 0x2b2b2b, 0x3d6fb6, 0xc0c0c8, 0xe6b422, 0x2f8f6f, 0x8a2a4a];
  for (const lot of W.parking) {
    const pts = wpts(lot);
    const area = Math.abs(polyArea(pts));
    const n = Math.floor(area / 190); // the real lots are mostly empty
    // car rows follow the lot's longest edge
    let best = 0, yaw = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const l = Math.hypot(bx - ax, bz - az);
      if (l > best) { best = l; yaw = Math.atan2(-(bz - az), bx - ax); }
    }
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    let placed = 0;
    for (let k = 0; k < n * 4 && placed < n; k++) {
      const x = minx + R() * (maxx - minx), z = minz + R() * (maxz - minz);
      if (!inPoly(x, z, pts)) continue;
      if (phys.near(x, z, 2.5).some(c => c.tag === 'car' || c.tag === 'trunk')) continue;
      car(x, H(x, z), z, yaw + (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.1, carCols[Math.floor(R() * carCols.length)]);
      placed++;
    }
  }

  function car(x, g, z, yaw, col) {
    const L = 2.6, Wd = 1.15;
    batch.add(P.box(), col, x, g + 0.42, z, L, 0.5, Wd, yaw);
    batch.add(P.box(), col, x - Math.cos(yaw) * 0.15, g + 0.85, z + Math.sin(yaw) * 0.15, L * 0.55, 0.42, Wd * 0.92, yaw);
    batch.add(P.box(), 0x26323c, x - Math.cos(yaw) * 0.15, g + 0.86, z + Math.sin(yaw) * 0.15, L * 0.57, 0.3, Wd * 0.94, yaw);
    for (const [u, v] of [[0.8, 0.5], [0.8, -0.5], [-0.8, 0.5], [-0.8, -0.5]]) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      batch.add(P.cyl(8), 0x1a1a1a, x + u * c + v * s, g + 0.22, z - u * s + v * c, 0.45, 0.2, 0.45, yaw, Math.PI / 2);
    }
    phys.addBox(x, z, L / 2, Wd / 2, yaw, g, g + 0.67, { tag: 'car' });
    phys.addBox(x - Math.cos(yaw) * 0.15, z + Math.sin(yaw) * 0.15, L * 0.27, Wd * 0.45, yaw, g + 0.67, g + 1.06, { tag: 'car' });
  }

  // ---------------------------------------------------------------- fountains
  for (const poi of W.poi) {
    if (poi.t.amenity !== 'fountain') continue;
    const [x, z] = [poi.p[0] * S, -poi.p[1] * S];
    const g = H(x, z);
    const big = Math.hypot(poi.p[0] + 5, poi.p[1] - 58) < 10; // the roundabout fountain
    const r = big ? 4 : 3;
    const ring = circle(x, z, r, 16), inner = circle(x, z, r - 0.4, 16);
    batch.addTris(prismTris(ring, g, g + 0.6, false), 0xe8e0d0);
    batch.addTris(prismTris(ring, g + 0.55, g + 0.6, true), 0xf2ece0);
    batch.add(P.cyl(16), 0x4fb8d8, x, g + 0.35, z, (r - 0.4) * 2, 0.1, (r - 0.4) * 2);
    phys.add(ring, g, g + 0.6, { tag: 'fountain' });
    phys.add(inner, g, g + 0.3, { tag: 'fountainwater', solid: false });
    // tiered centerpiece
    const tiers = big ? 3 : 2;
    let y = g;
    for (let i = 0; i < tiers; i++) {
      const pr = 0.5 - i * 0.1, ph = big ? 2.2 : 1.4;
      batch.add(P.cyl(8), 0xe8e0d0, x, y + ph / 2, z, pr, ph, pr);
      y += ph;
      const br = (tiers - i) * 0.7 + 0.2;
      batch.add(P.frustum(1.5, 12), 0xf2ece0, x, y, z, br, 0.3, br);
      phys.add(circle(x, z, br / 2 + 0.2, 10), y - 0.2, y + 0.15, { tag: 'tier' });
      phys.add(circle(x, z, pr / 2 + 0.05, 6), y - ph, y - 0.2, { tag: 'tierpole' });
    }
    batch.add(P.sphere(8, 6), 0xd9b44a, x, y + 0.35, z, 0.5, 0.5, 0.5);
    info[big ? 'fountainBig' : 'fountainPark'] = { x, z, g, top: y + 0.15 };
  }

  // ---------------------------------------------------------------- backdrop
  buildBackdrop(batch, data, W, R);

  const statics = batch.build(mat);
  scene.add(statics);

  // food signs over kiosks facing the boardwalk
  buildSigns(scene, info, tab);

  return { info, water, sky, statics };
}

function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function lamp(batch, x, y, z, yaw) {
  batch.add(P.box(), 0x8c8577, x, y + 0.12, z, 0.45, 0.24, 0.45);
  batch.add(P.cyl(8), C.lamp, x, y + 1.1, z, 0.14, 2.0, 0.14);
  batch.add(P.cyl(8), C.lamp, x, y + 0.35, z, 0.26, 0.5, 0.26);
  batch.add(P.box(), C.lamp, x, y + 2.05, z, 0.9, 0.06, 0.06, yaw + Math.PI / 2);
  for (const s of [-1, 1]) {
    const lx = x + Math.cos(yaw + Math.PI / 2) * 0.42 * s, lz = z - Math.sin(yaw + Math.PI / 2) * 0.42 * s;
    batch.add(P.frustum(1.4, 6), C.lampGlass, lx, y + 1.92, lz, 0.2, 0.3, 0.2);
    batch.add(P.cone(6), C.lamp, lx, y + 2.14, lz, 0.28, 0.18, 0.28);
  }
  batch.add(P.cone(8), C.lamp, x, y + 2.3, z, 0.18, 0.35, 0.18);
}

function frondGeo() {
  return prim('frond', () => {
    // a drooping leaf along +x
    const g = new THREE.BufferGeometry();
    const pts = [];
    const segs = 5;
    const yAt = t => 0.25 * t - 0.9 * t * t;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const w0 = 0.32 * Math.sin(Math.PI * (t0 * 0.8 + 0.1)), w1 = 0.32 * Math.sin(Math.PI * (t1 * 0.8 + 0.1));
      const a = [t0, yAt(t0), -w0], b = [t1, yAt(t1), -w1], c = [t1, yAt(t1), w1], d = [t0, yAt(t0), w0];
      const m0 = [t0, yAt(t0) + 0.05, 0], m1 = [t1, yAt(t1) + 0.05, 0];
      pts.push(...a, ...b, ...m1, ...a, ...m1, ...m0, ...m0, ...m1, ...c, ...m0, ...c, ...d);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  });
}

// The real tablado stands on pilings over the water, but the DEM shoreline runs right under it.
// Dig the seabed out under the water half of the deck so you can swim beneath it.
function carveUnderBoardwalk(data, lines) {
  const { gw, gh, heights, step, X0, Z0, terrainH } = data;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      let nx = -uz, nz = ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (terrainH(mx + nx * 6, mz + nz * 6) > terrainH(mx - nx * 6, mz - nz * 6)) { nx = -nx; nz = -nz; }
      const minI = Math.max(0, Math.floor((Math.min(ax, bx) - 8 - X0) / step)), maxI = Math.min(gw - 1, Math.ceil((Math.max(ax, bx) + 8 - X0) / step));
      const minJ = Math.max(0, Math.floor((Math.min(az, bz) - 8 - Z0) / step)), maxJ = Math.min(gh - 1, Math.ceil((Math.max(az, bz) + 8 - Z0) / step));
      for (let j = minJ; j <= maxJ; j++)
        for (let k = minI; k <= maxI; k++) {
          const x = X0 + k * step, z = Z0 + j * step;
          const s = (x - ax) * ux + (z - az) * uz, off = (x - ax) * nx + (z - az) * nz;
          if (s < -1 || s > len + 1 || off < 0.9 || off > 7) continue;
          const idx = j * gw + k;
          const want = -1.4 - Math.min(off - 0.9, 3) * 0.5;
          if (heights[idx] > want) heights[idx] = want;
        }
    }
  }
}

// ------------------------------------------------------------------ terrain
function buildTerrain(scene, data) {
  const { gw, gh, heights, step, X0, Z0 } = data;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      pos[k * 3] = X0 + i * step; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = Z0 + j * step;
      uv[k * 2] = i / gw; uv[k * 2 + 1] = 1 - j / gh;
    }
  const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
  let n = 0;
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const tex = new THREE.Texture(data.colorImg);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const m = new THREE.Mesh(g, detailMaterial(tex));
  m.receiveShadow = true;
  scene.add(m);

  // land beyond the data (north: the port and city) and the deep seabed around everything
  const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: 0x1b4a66 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -9 * 0.6 - 0.05;
  scene.add(far);
}

// Ground material: the stylized photo plus a fine tiling detail pattern (world-space) so the
// ground still reads crisp right at the player's feet.
function detailMaterial(tex) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 118 + r() * 20 + (r() < 0.06 ? 16 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const d = new THREE.CanvasTexture(c);
  d.wrapS = d.wrapT = THREE.RepeatWrapping;
  d.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: d };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vWp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dt = texture2D(uDetail, vWp.xz * 0.9).r * 0.6 + texture2D(uDetail, vWp.xz * 0.23).r * 0.4;
        float fade = 1.0 - smoothstep(25.0, 80.0, length(vWp - cameraPosition));
        diffuseColor.rgb *= mix(1.0, dt * 2.0, 0.55 * fade);`);
  };
  return mat;
}

// ------------------------------------------------------------------ water
function buildWater(scene, data) {
  const { gw, gh, heights, step, X0, Z0 } = data;
  const px = new Uint8Array(gw * gh * 4);
  for (let k = 0; k < gw * gh; k++) {
    const d = Math.max(0, Math.min(1, -heights[k] / 6));
    px[k * 4] = d * 255; px[k * 4 + 3] = 255;
  }
  const dt = new THREE.DataTexture(px, gw, gh, THREE.RGBAFormat);
  dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const u = {
    uTime: { value: 0 }, uDepth: { value: dt },
    uBounds: { value: new THREE.Vector4(X0, Z0, X0 + (gw - 1) * step, Z0 + (gh - 1) * step) },
    uFog: { value: new THREE.Color(0xcfe6f2) }, uFogNear: { value: 120 }, uFogFar: { value: 1400 },
    uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vW; varying float vDist;
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz;
        vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uDepth; uniform vec4 uBounds; uniform vec3 uFog; uniform float uFogNear, uFogFar; uniform vec3 uSun;
      varying vec3 vW; varying float vDist;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = (vW.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
        float inside = step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        float d = mix(1., texture2D(uDepth, uv).r, inside);
        vec3 shallow = vec3(0.30,0.78,0.70), mid = vec3(0.05,0.44,0.46), deep = vec3(0.02,0.24,0.30);
        vec3 col = mix(shallow, mid, smoothstep(0.0,0.25,d));
        col = mix(col, deep, smoothstep(0.35,1.0,d));
        // moving ripples
        float r1 = n(vW.xz*0.35 + vec2(uTime*0.35, uTime*0.2));
        float r2 = n(vW.xz*0.9 - vec2(uTime*0.25, uTime*0.4));
        float rip = r1*0.6 + r2*0.4;
        col += (rip-0.5)*0.08;
        // sun glints
        float gl = smoothstep(0.86, 0.97, n(vW.xz*4.5 + uTime*0.8) * n(vW.xz*3.1 - uTime*0.6) * 1.9);
        col += gl * 0.16 * (1. - smoothstep(20., 90., vDist));
        // shore foam
        float foam = (1.-smoothstep(0.0,0.05,d)) * step(0.45, n(vW.xz*1.2 + vec2(0.,uTime*0.8)) + 0.2);
        foam = max(foam, (1.-smoothstep(0.0,0.02,d)));
        col = mix(col, vec3(1.), foam*0.85*inside);
        float a = mix(0.42, 0.9, smoothstep(0.0,0.5,d));
        a = max(a, foam*inside);
        if (!gl_FrontFacing) { col = mix(col, vec3(0.1,0.5,0.6), 0.5); a = 0.6; }
        float f = smoothstep(uFogNear, uFogFar, vDist);
        gl_FragColor = vec4(mix(col, uFog, f), a);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  scene.add(m);
  return { mesh: m, uniforms: u };
}

// ------------------------------------------------------------------ sky
function buildSky(scene) {
  const u = { uTop: { value: new THREE.Color(0x3d8fe0) }, uBot: { value: new THREE.Color(0xd7eef7) },
    uSun: { value: new THREE.Vector3(0.4, 0.55, 0.45).normalize() } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(4500, 24, 12), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uTop,uBot,uSun; varying vec3 vD;
      void main(){ float t = smoothstep(-0.05, 0.5, vD.y); vec3 c = mix(uBot, uTop, t);
        float s = max(dot(vD, uSun),0.); c += vec3(1.,0.9,0.7)*(pow(s,600.)*2. + pow(s,12.)*0.25);
        gl_FragColor = vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  }));
  m.renderOrder = -1;
  scene.add(m);
  // puffy clouds
  const b = new Batch(4000);
  const R = rng(3);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = 700 + R() * 1400;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 120 + R() * 160;
    for (let k = 0; k < 5; k++) {
      const s = 40 + R() * 60;
      b.add(P.ico(1), 0xffffff, x + (R() - 0.5) * 120, y + R() * 20, z + (R() - 0.5) * 60, s * 1.6, s * 0.7, s);
    }
  }
  const clouds = b.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }), { cast: false, receive: false });
  scene.add(clouds);
  return { mesh: m, uniforms: u, clouds };
}

// ------------------------------------------------------------------ distant scenery
function buildBackdrop(batch, data, W, R) {
  const b = data.bounds;
  // flat land to the north and a skyline of Ponce
  const north = [[b.x0 - 3000, b.z0 + 2], [b.x1 + 3000, b.z0 + 2], [b.x1 + 3000, b.z0 - 3000], [b.x0 - 3000, b.z0 - 3000]];
  batch.addTris(prismTris(north, -1, 1.2, true), 0x8fae6a);
  // east shore continues beyond the data
  const east = [[b.x1 - 1, b.z0], [b.x1 + 3000, b.z0], [b.x1 + 3000, b.z0 + 220], [b.x1 - 1, b.z0 + 140]];
  batch.addTris(prismTris(east, -1, 1.0, true), 0x9ab870);
  const cols = [0xf1ead8, 0xe8d7b0, 0xf0c9b8, 0xdfe7ea, 0xf5f0e6, 0xe2c9a0];
  for (let i = 0; i < 520; i++) {
    const x = b.x0 - 300 + R() * (b.x1 - b.x0 + 900), z = b.z0 - 40 - R() * 900;
    if (z > b.z0 - 60 && x < b.x0 + 200) continue;
    const w = 6 + R() * 16, h = 4 + R() * R() * 22, d = 6 + R() * 16;
    batch.add(P.box(), cols[Math.floor(R() * cols.length)], x, h / 2, z, w, h, d, R() * 0.4);
  }
  // port cranes and warehouses (Puerto de las Américas) to the north-west
  for (const [x, z] of [[-470 * 0.6, -560 * 0.6], [-390 * 0.6, -600 * 0.6]]) {
    for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) batch.add(P.box(), 0xd84a2f, x + ox, 14, z + oz, 1, 28, 1);
    batch.add(P.box(), 0xd84a2f, x, 28, z, 12, 2, 10);
    batch.add(P.box(), 0xd84a2f, x - 12, 31, z, 40, 1.4, 2, 0.3);
    batch.add(P.box(), 0x2b3a4a, x, 30.5, z, 4, 3, 4);
  }
  for (let i = 0; i < 6; i++) batch.add(P.box(), 0xdad6cc, -420 + i * 45, 6, -330 - (i % 2) * 40, 36, 12, 24);
  // the Cordillera Central behind the city
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI * 0.95 + (i / 39) * Math.PI * 0.9;
    const d = 2200 + R() * 700;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 400;
    const h = 150 + R() * 260, r = 400 + R() * 400;
    batch.add(P.cone(7), R() < 0.5 ? 0x5f8f6a : 0x6f9b72, x, h / 2 - 5, z, r, h, r * 0.8, R() * 6);
  }
  // islands on the horizon: Cardona (with lighthouse), Isla de Jueyes, Caja de Muertos
  const island = (x, z, rx, rz, h, col, lighthouse, lhScale = 1) => {
    batch.add(P.ico(1), col, x, 0, z, rx * 2, h * 2, rz * 2, R() * 6, 0, 0, 0.15);
    batch.add(P.cyl(10), 0xefe2b8, x, 0.1, z, rx * 2.3, 0.4, rz * 2.3);
    if (lighthouse) {
      batch.add(P.frustum(0.7, 8), 0xf5f5f0, x, h + 5 * lhScale, z, 3 * lhScale, 10 * lhScale, 3 * lhScale);
      batch.add(P.cyl(8), 0x2b2b2b, x, h + 10.5 * lhScale, z, 2.2 * lhScale, 1.5 * lhScale, 2.2 * lhScale);
      batch.add(P.cone(8), 0xc0392b, x, h + 12 * lhScale, z, 2.6 * lhScale, 1.6 * lhScale, 2.6 * lhScale);
    }
  };
  const f = W.far;
  island(f.cardona[0] * 0.6, -f.cardona[1] * 0.6, 40, 30, 5, 0x6f9f5a, true, 1.2);
  island(f.jueyes[0] * 0.6, -f.jueyes[1] * 0.6, 50, 30, 4, 0x3f7f4a, false);
  // Caja de Muertos is 12.6 km away: shrink it onto the fog horizon but keep its apparent size
  const cd = Math.hypot(f.caja[0], f.caja[1]) * 0.6, k = 2600 / cd;
  island(f.caja[0] * 0.6 * k, -f.caja[1] * 0.6 * k, 1500 * 0.6 * k, 600 * 0.6 * k, 70 * 0.6 * k * 1.6, 0x5d8a5a, true, 0.9);
}

// ------------------------------------------------------------------ kiosk signs (canvas text)
const FOODS = ['Bacalaítos', 'Empanadillas', 'Alcapurrias', 'Piraguas', 'Coco Frío', 'Pinchos', 'Sorullitos',
  'Mofongo', 'Tostones', 'Pastelillos', 'Limber', 'Arañitas', 'Mariscos', 'Chillo Frito', 'Jugos'];

function buildSigns(scene, info, tab) {
  const ks = info.kiosks.slice().sort((a, b) => a.z - b.z);
  ks.forEach((k, i) => {
    const name = FOODS[i % FOODS.length];
    k.food = name;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff6e0'; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#2d6a4c'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 56);
    g.fillStyle = '#b33a2a'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    // face the boardwalk: pick the rect side closest to it
    let best = null;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c2 = Math.cos(k.yaw), s2 = Math.sin(k.yaw);
      const ox = ax * (k.hx + 0.5), oz = az * (k.hz + 0.5);
      const x = k.x + ox * c2 + oz * s2, z = k.z - ox * s2 + oz * c2;
      const d = Math.min(...tab.map(l => polyDist(x, z, l)));
      if (!best || d < best.d) best = { d, x, z, nx: x - k.x, nz: z - k.z };
    }
    m.position.set(best.x, k.eave - 0.25, best.z);
    m.lookAt(best.x + best.nx, k.eave - 0.25, best.z + best.nz);
    k.front = { x: best.x, z: best.z, nx: best.nx, nz: best.nz };
    scene.add(m);
    info.signs.push(m);
  });
}
