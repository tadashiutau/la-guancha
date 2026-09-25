// Builds the La Guancha level from real data: terrain, water, boardwalk, kiosks, tower,
// piers, boats, trees, cars and scenery. Registers colliders with the physics world.
import * as THREE from 'three';
import { S } from './data.js';
import { Batch, P, prismTris, hipRoofTris, polyArea, rng, prim } from './geo.js';
import { buildFoliage } from './foliage.js';
import { buildPaseoStreet, paseoFrame, PASEO_W } from './paseo.js';

const C = {
  // colors from photos of the real boardwalk: cream-yellow railings, lavender kiosks with white
  // trim and sea-green roofs, a pale tower with yellow wooden walkways
  deck: 0x9d978a, deck2: 0x7e7064, rail: 0xe6d49a, timber: 0x7a4a32, timber2: 0x6a3f2a, piling: 0x5a4636,
  lamp: 0x2f7f76, lampGlass: 0xfff3c4, planter: 0xb9ae9c, shrub: 0x3f8f4a,
  kioskWalls: [0x9d97d6, 0x8494da, 0xa99ad8, 0x8fa0dc], kioskTrim: 0xf6f4ee, kioskRoof: 0x3a9a86, window: 0x3b4b5a,
  towerWood: 0xdcc684, towerCore: 0xebe8e0, towerRoof: 0x3a9a86,
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
  const foliageTrees = [];
  let planterN = 0;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const info = { kiosks: [], deckY: 1, tablado: [], tower: null, boats: [], trees: [], piers: [], lampTops: [],
    pilings: [], signs: [], palmCrowns: [] };

  carveUnderBoardwalk(data, W.tablado.map(wpts));
  raiseBesideBoardwalk(data, W.tablado.map(wpts), 7 * S);
  buildTerrain(scene, data);
  buildRoutes(scene, data);
  const water = buildWater(scene, data);
  const sky = buildSky(scene);

  // ---------------------------------------------------------------- boardwalk
  const tab = W.tablado.map(wpts);
  info.tablado = tab;
  const deckQuads = [];
  const DW = 7 * S; // deck width
  for (const line of tab) {
    info.deckY = deckHeight(line, H, DW);
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
      // the deck body; its top gets the chevron plank texture (deckTop, below)
      batch.add(P.box(), C.deck2, cx, y - 0.13, cz, len + 0.02, 0.24, DW, yaw);
      deckQuads.push([ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, nx, nz, y]);
      // brown timber railing on the water side: sturdy posts, three rails and a wide flat cap
      const rx = nx * (off + DW / 2 - 0.08), rz = nz * (off + DW / 2 - 0.08);
      const posts = Math.max(1, Math.round(len / (1.6 * S)));
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        batch.add(P.box(), C.timber, ax + dx * t + rx, y + 0.33, az + dz * t + rz, 0.13, 0.66, 0.13, yaw);
      }
      for (const hy of [0.18, 0.36, 0.54]) batch.add(P.box(), C.timber2, mx + rx, y + hy, mz + rz, len + 0.1, 0.09, 0.05, yaw);
      batch.add(P.box(), C.timber, mx + rx, y + 0.69, mz + rz, len + 0.12, 0.05, 0.2, yaw);
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
        info.lampTops.push([px, y + 3.2, pz]);
        phys.addBox(px, pz, 0.25, 0.25, yaw, y, y + 3.0, { tag: 'lamp' });
        // a long low stone planter with shrubs between lamps; every other one grows a coconut palm
        const qx = ax + dx * (t + 0.5 / lamps) + lx * 1.05, qz = az + dz * (t + 0.5 / lamps) + lz * 1.05;
        if (t + 0.5 / lamps < 1) {
          batch.add(P.box(), 0xc9c2b4, qx, y + 0.22, qz, 2.6, 0.44, 1.0, yaw, 0, 0, 0.06);
          batch.add(P.box(), 0x6b5a44, qx, y + 0.45, qz, 2.4, 0.04, 0.8, yaw);
          for (const u of [-0.8, 0.8]) batch.add(P.ico(0), R() < 0.5 ? C.shrub : 0x5aa446, qx + Math.cos(yaw) * u, y + 0.62, qz - Math.sin(yaw) * u, 0.8, 0.5, 0.7, R() * 6, 0, 0, 0.2);
          phys.addBox(qx, qz, 1.3, 0.5, yaw, y, y + 0.44, { tag: 'planter' });
          if ((planterN++ % 2) === 0) palm(qx, y + 0.44, qz, 3.8 + R() * 1.2);
        }
      }
    }
  }

  // ---------------------------------------------------------------- buildings
  for (const b of W.buildings) buildBuilding(b);

  function buildBuilding(b) {
    const pts = wpts(b.p);
    const [rcx, rcy, rhx, rhy, rang, rectness] = b.r;
    const cx = rcx * S, cz = -rcy * S, hx = rhx * S, hz = rhy * S;
    // the floor sits on the ground under the footprint (which may have been built up beside the
    // boardwalk) and the walls reach down to the lowest point so nothing floats or gets buried
    const hs = [...rectPts(cx, cz, hx, hz, rang), ...rectPts(cx, cz, hx * 0.5, hz * 0.5, rang), [cx, cz]].map(([x, z]) => H(x, z)).filter(h => h > -0.5);
    const base = Math.max(b.b * S, hs.length ? Math.max(...hs) : -1e9);
    const foot = Math.min(base - 0.3, hs.length ? Math.min(...hs) - 0.1 : base - 0.3);
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
      // each kiosk gets one of the real color schemes (Street View): salmon stucco with cream trim,
      // maroon boards with a green base, turquoise, butter yellow...
      const sc = KIOSK_SCHEMES[info.kiosks.length % KIOSK_SCHEMES.length];
      batch.addTris(prismTris(rect, foot, eave, false), sc.wall);
      // trim band and dark windows all around, a base band, cream pilasters
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.02, hz + 0.02, rang), eave - 0.18, eave, false), sc.trim);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.03, hz * 0.7, rang), base + 0.75, base + 1.45, false), C.window);
      batch.addTris(prismTris(rectPts(cx, cz, hx * 0.8, hz + 0.03, rang), base + 0.75, base + 1.45, false), C.window);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.05, hz + 0.05, rang), base + 0.72, base + 0.8, false), sc.trim);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.04, hz + 0.04, rang), foot, base + 0.35, false), sc.base);
      const kc = Math.cos(rang), ks = Math.sin(rang);
      const kat = (u, v) => [cx + u * kc + v * ks, cz - u * ks + v * kc];
      for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const [px, pz] = kat(su * (hx + 0.04), sv * (hz + 0.04));
        batch.add(P.box(), sc.trim, px, (base + eave) / 2 - 0.15, pz, 0.2, eave - base + 0.3, 0.2, rang);
      }
      // louvered shutters beside the windows on the long sides
      const long = hx >= hz;
      const lenK = long ? hx : hz, depK = long ? hz : hx;
      for (let u = -lenK + 0.9; u < lenK - 0.5; u += 1.5) for (const sv of [-1, 1]) {
        const [px, pz] = long ? kat(u, sv * (depK + 0.06)) : kat(sv * (depK + 0.06), u);
        batch.add(P.box(), sc.shutter, px, base + 1.1, pz, long ? 0.34 : 0.06, 0.66, long ? 0.06 : 0.34, rang);
      }
      // a green door with a cream frame on the side facing away from the boardwalk
      {
        let best = null;
        for (const [u, v] of [[hx, 0], [-hx, 0], [0, hz], [0, -hz]]) {
          const [px, pz] = kat(u * 1.02, v * 1.02);
          const d = Math.min(...tab.map(l => polyDist(px, pz, l)));
          if (!best || d > best.d) best = { d, u, v };
        }
        const side = best.u ? 'u' : 'v', sg = Math.sign(best.u || best.v);
        const off = (side === 'u' ? hx : hz) + 0.05;
        const [dx, dz] = side === 'u' ? kat(sg * off, 0) : kat(0, sg * off);
        const w = side === 'u' ? [0.08, 1.2] : [1.2, 0.08];
        batch.add(P.box(), sc.trim, dx, base + 0.95, dz, w[0] + (side === 'u' ? 0 : 0.2), 1.9, w[1] + (side === 'u' ? 0.2 : 0), rang);
        batch.add(P.box(), 0x2f6b4a, dx, base + 0.85, dz, w[0] + 0.02, 1.7, w[1] + 0.02, rang);
      }
      const slope = 0.55, cap = 1.4;
      batch.addTris(hipRoofTris(cx, cz, hx, hz, rang, eave, slope, cap, 0.45), C.kioskRoof);
      phys.add(rectPts(cx, cz, hx + 0.45, hz + 0.45, rang), eave - 0.3, eave, { tag: 'roof', roof: slope, cap });
      phys.add(rect, foot, eave - 0.3, { tag: 'kiosk' });
      info.kiosks.push({ x: cx, z: cz, hx, hz, yaw: rang, base, eave, top: eave + Math.min(Math.min(hx, hz) * slope, cap), dTab });
      return;
    }
    if (Math.hypot(rcx + 122.4, rcy + 27.3) < 2) { buildGateway(cx, cz, hx, hz, rang, base, foot); return; }
    const h = Math.max(b.h * S, 2.2);
    const wall = area > 1500 ? 0xe9e4d8 : [0xf3e7c9, 0xe8d7b0, 0xf0d4c0, 0xdfe7ea][Math.floor(R() * 4)];
    const top = base + h;
    if (rectness > 0.8 && area < 900) {
      const rect = rectPts(cx, cz, hx, hz, rang);
      const eave = base + Math.min(h, 4.5 * S * 1.2);
      batch.addTris(prismTris(rect, foot, eave, false), wall);
      batch.addTris(prismTris(rectPts(cx, cz, hx + 0.03, hz + 0.03, rang), base + 0.9, base + 1.6, false), C.window);
      batch.addTris(hipRoofTris(cx, cz, hx, hz, rang, eave, 0.5, 2, 0.35), roofCol);
      phys.add(rectPts(cx, cz, hx + 0.35, hz + 0.35, rang), eave - 0.3, eave, { roof: 0.5, cap: 2, tag: 'roof' });
      phys.add(rect, foot, eave - 0.3, { tag: 'bld' });
    } else {
      batch.addTris(prismTris(pts, foot, top, false), wall);
      batch.addTris(prismTris(pts, top, top + 0.25, true), roofCol);
      if (h > 3) batch.addTris(prismTris(pts, base + 1.0, base + 1.5, false), C.window);
      phys.add(pts, foot, top + 0.25, { tag: 'bld' });
    }
  }

  // The long building behind the middle kiosks: cream walls with green trim and roofs, and the
  // entrance pavilion (raised roof, red-capped lantern, open archway) facing the paseo, as in
  // Street View
  function buildGateway(cx, cz, hx, hz, yaw, base, foot = foot) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
    // which long side faces land (the paseo)?
    const side = H(...at(0, hz + 6)) > H(...at(0, -hz - 6)) ? 1 : -1;
    const eave = base + 3.3;
    const cream = 0xefe4c4, green = 0x2f6b4a, roof = 0x3a8f6e;
    const rect = rectPts(cx, cz, hx, hz, yaw);
    batch.addTris(prismTris(rect, foot, eave, false), cream);
    batch.addTris(prismTris(rectPts(cx, cz, hx + 0.03, hz + 0.03, yaw), foot, base + 0.4, false), 0xcdbf9c);
    batch.addTris(prismTris(rectPts(cx, cz, hx + 0.04, hz + 0.04, yaw), eave - 0.3, eave, false), green);
    batch.addTris(prismTris(rectPts(cx, cz, hx + 0.02, hz * 0.8, yaw), base + 0.9, base + 1.9, false), C.window);
    batch.addTris(hipRoofTris(cx, cz, hx, hz, yaw, eave, 0.45, 2, 0.6), roof);
    phys.add(rectPts(cx, cz, hx + 0.6, hz + 0.6, yaw), eave - 0.3, eave, { roof: 0.45, cap: 2, tag: 'roof' });
    phys.add(rect, foot, eave - 0.3, { tag: 'bld' });
    // green pilasters along the walls
    for (let u = -hx + 1.5; u <= hx - 1.4; u += 3.2)
      for (const v of [-1, 1]) { const [x, z] = at(u, v * (hz + 0.06)); batch.add(P.box(), green, x, (base + eave) / 2, z, 0.35, eave - base, 0.12, yaw); }
    // entrance pavilion: a taller block pushed out toward the paseo
    const gw = 3.6, gd = 2.4, gTop = base + 5.4;
    const [gx, gz] = at(0, side * (hz + gd / 2 - 0.4));
    batch.addTris(prismTris(rectPts(gx, gz, gw, gd / 2, yaw), foot, gTop, false), cream);
    batch.addTris(prismTris(rectPts(gx, gz, gw + 0.04, gd / 2 + 0.04, yaw), gTop - 0.35, gTop, false), green);
    batch.addTris(prismTris(rectPts(gx, gz, gw + 0.04, gd / 2 + 0.04, yaw), eave - 0.3, eave, false), green);
    // the open archway (dark) with a green frame, and a row of little windows above
    const [fx, fz] = at(0, side * (hz + gd - 0.4 + 0.03));
    batch.add(P.box(), 0x2a2a28, fx, base + 1.4, fz, 3.2, 2.8, 0.08, yaw);
    batch.add(P.box(), green, fx, base + 2.9, fz, 3.6, 0.25, 0.12, yaw);
    for (const u of [-1.7, 1.7]) { const [x, z] = at(u, side * (hz + gd - 0.4 + 0.05)); batch.add(P.box(), green, x, base + 1.4, z, 0.3, 2.9, 0.14, yaw); }
    for (let k = -3; k <= 3; k++) { const [x, z] = at(k * 0.9, side * (hz + gd - 0.4 + 0.03)); batch.add(P.box(), 0x3d5a6a, x, gTop - 1.0, z, 0.5, 0.5, 0.06, yaw); }
    batch.addTris(hipRoofTris(gx, gz, gw, gd / 2, yaw, gTop, 0.5, 1.6, 0.5), roof);
    phys.add(rectPts(gx, gz, gw + 0.5, gd / 2 + 0.5, yaw), gTop - 0.3, gTop, { roof: 0.5, cap: 1.6, tag: 'roof' });
    phys.add(rectPts(gx, gz, gw, gd / 2, yaw), foot, gTop - 0.3, { tag: 'bld' });
    // the lantern on top with its red cap
    const lt = gTop + 0.6;
    batch.add(P.box(), cream, gx, lt + 0.4, gz, 1.4, 1.0, 1.4, yaw);
    batch.add(P.box(), green, gx, lt + 0.4, gz, 1.45, 0.25, 1.45, yaw);
    batch.addTris(hipRoofTris(gx, gz, 0.7, 0.7, yaw, lt + 0.9, 0.6, 1, 0.2), 0xb8453a);
    info.gateway = { x: fx, z: fz, yaw, nx: side * s, nz: side * c, base };
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
    // the core is painted as the Puerto Rican flag, hung vertically: the blue triangle at the top
    // and the stripes running down (repainted this way in the 2020s)
    const core = new THREE.Mesh(new THREE.BoxGeometry(3.2, topY - base, 3.2), [0, 1, 2, 3, 4, 5].map(i =>
      i === 2 || i === 3 ? new THREE.MeshLambertMaterial({ color: C.towerCore }) : new THREE.MeshLambertMaterial({ map: flagTexture(3.2 / (topY - base)) })));
    core.position.set(cx, (base + topY) / 2 - 0.2, cz);
    core.castShadow = core.receiveShadow = true;
    scene.add(core);
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
      batch.add(P.box(), i % 2 ? C.towerWood : 0xcdb672, (x + x2) / 2, y - 0.12, (z + z2) / 2, len, 0.24, Rout - Rin, yaw);
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

  // leafy greens, picked per blob so groves aren't one flat color
  const PARK_LEAF = [0x7ba64a, 0x86ad52, 0x6f9c44, 0x92b45a, 0x7fa044];
  const LEAF = [0x3f8a3c, 0x4a9440, 0x5aa446, 0x367a34, 0x66a848, 0x2f7436, 0x78b04c];
  const leaf = () => LEAF[Math.floor(R() * LEAF.length)];

  scene.add(deckTop(deckQuads, DW));

  // ---------------------------------------------------------------- trees (LiDAR)
  const tops = [];
  // no trees inside the fountains (they're built later)
  const fountains = W.poi.filter(p => p.t.amenity === 'fountain').map(p => [p.p[0] * S, -p.p[1] * S]);
  const inFountain = (x, z) => fountains.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 8);
  // the park's trees are fewer and airier than the LiDAR crowns suggest (Street View 2025)
  const parks = W.park.map(wpts);
  const inPark = (x, z) => parks.some(p => inPoly(x, z, p));
  const parkTops = [];
  for (const [x, y, h, rad, kind] of W.trees) {
    const px = x * S, pz = -y * S, g = H(px, pz);
    if (g < 0.1 || inFountain(px, pz)) continue;
    if (phys.near(px, pz, 0.5).some(c => c.tag === 'kiosk' || c.tag === 'bld' || c.tag === 'deck')) continue;
    const hh = Math.min(h, 16) * S;
    let top;
    if (kind !== 'palm' && inPark(px, pz)) {
      if (parkTops.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 5.5)) continue;
      parkTops.push([px, pz]);
      top = parkTree(px, g, pz, hh, Math.min(rad, 5) * S);
    } else if (kind === 'palm') top = palm(px, g, pz, hh);
    else if (kind === 'mangrove') top = mangrove(px, g, pz, Math.min(hh, 4), rad * S);
    else top = broadTree(px, g, pz, hh, Math.min(rad, 5.5) * S);
    tops.push([px, pz, kind, top]);
  }
  info.trees = tops;

  // ---------------------------------------------------------------- woods (LiDAR canopy map)
  // LiDAR peaks give one tree per crown and miss dense stands, so fill the real woods: extra
  // trees on a jittered grid wherever the canopy map says there's forest, bushes at its edges.
  {
    const cell = 3.3;
    const taken = new Map();
    const key = (x, z) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
    for (const [px, pz] of tops) taken.set(key(px, pz), true);
    const near = (x, z) => {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (taken.has(`${Math.floor(x / 3) + i},${Math.floor(z / 3) + j}`)) return true;
      return false;
    };
    // keep roads and footpaths clear
    const roadsW = [...W.roads.map(r => ({ p: wpts(r.p), w: r.w * S / 2 + 1.2 })), ...W.footways.map(p => ({ p: wpts(p), w: 1.9 }))];
    const onRoad = (x, z) => roadsW.some(({ p, w }) => p.some((q, i) => {
      if (!i) return false;
      const [ax, az] = p[i - 1], ex = q[0] - ax, ez = q[1] - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      return Math.hypot(x - ax - ex * t, z - az - ez * t) < w;
    }));
    const wet = (W.wetland || []).map(wpts);
    const b = data.bounds;
    let added = 0, bushes = 0;
    for (let z = b.z0 + 2; z < b.z1 - 2; z += cell) {
      for (let x = b.x0 + 2; x < b.x1 - 2; x += cell) {
        const jx = x + (R() - 0.5) * cell * 0.8, jz = z + (R() - 0.5) * cell * 0.8;
        const ch = data.canopyH(jx, jz);
        if (ch < 2.5) continue;
        const g = H(jx, jz);
        if (g < 0.2 || near(jx, jz) || inFountain(jx, jz)) continue;
        if (phys.near(jx, jz, 1.2).some(c => c.solid || c.tag === 'deck')) continue;
        if (onRoad(jx, jz) || inPark(jx, jz)) continue;
        taken.set(key(jx, jz), true);
        const h = Math.min(ch, 14) * S * (0.85 + R() * 0.3);
        if (wet.some(p => inPoly(jx, jz, p))) mangrove(jx, g, jz, Math.min(h, 4), 1.4 + R() * 0.6);
        else broadTree(jx, g, jz, h, Math.min(3.2, 1.3 + h * 0.18) * (0.8 + R() * 0.4));
        added++;
        // the edge of the woods gets undergrowth
        const edge = [[cell, 0], [-cell, 0], [0, cell], [0, -cell]].some(([dx, dz]) => data.canopyH(jx + dx, jz + dz) < 1);
        if (edge && R() < 0.7) {
          const a = R() * 6.28, bx = jx + Math.cos(a) * 1.8, bz = jz + Math.sin(a) * 1.8;
          if (H(bx, bz) > 0.2 && !onRoad(bx, bz)) { bush(bx, H(bx, bz), bz, 0.9 + R() * 0.7); bushes++; }
        }
      }
    }
    info.forestTrees = added;
    info.bushes = bushes;
  }

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
    const tree = { x: px, y: py - 0.25, z: pz, radius: 2.2, opacity: 1, pieces: [], refs: [] };
    foliageTrees.push(tree);
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
      const a = i / fronds * Math.PI * 2 + R();
      tree.pieces.push({ kind: 'palm', color: i % 2 ? C.palm : C.palm2,
        x: px, y: py, z: pz, sx: 1.6 + R() * 0.5, sy: 1, sz: 1, yaw: a });
    }
    for (let i = 0; i < 3; i++) batch.add(P.sphere(6, 4), C.coconut, px + Math.cos(i * 2.1) * 0.22, py - 0.2, pz + Math.sin(i * 2.1) * 0.22, 0.28, 0.28, 0.28);
    phys.addBox(x, z, 0.18, 0.18, 0, g - 0.5, g + h * 0.6, { tag: 'trunk', ground: false });
    phys.add(circle(px, pz, 1.0, 6), py - 0.2, py + 0.1, { tag: 'palmtop', solid: false });
    info.palmCrowns.push([px, py, pz]);
    return py;
  }

  // a broadleaf tree: the trunk runs up into a rounded crown of overlapping blobs
  // (a center blob, a ring around it and one on top), so the crown sits squarely on the trunk
  function broadTree(x, g, z, h, r, lean = true) {
    const th = h * 0.42;
    // the crown's underside stays above head height so nobody walks through the leaves
    const cy = Math.max(g + th + r * 0.45, g + 2.2 + r * 0.7);
    const tx = lean ? (R() - 0.5) * 0.15 * r : 0, tz = lean ? (R() - 0.5) * 0.15 * r : 0;
    batch.add(P.frustum(0.6, 6), C.trunk, x + tx / 2, (g + cy) / 2, z + tz / 2, 0.42, cy - g, 0.42, 0, tz / (cy - g), -tx / (cy - g));
    for (const a of [R() * 6.28, R() * 6.28 + 2.4]) {
      // two branches reaching into the crown
      batch.add(P.cyl(4), C.trunk, x + Math.cos(a) * r * 0.2, cy - r * 0.2, z + Math.sin(a) * r * 0.2, 0.11, r * 0.5, 0.11,
        0, Math.sin(a) * 0.8, -Math.cos(a) * 0.8);
    }
    const tree = { x: x + tx, y: cy, z: z + tz, radius: r * 1.15, opacity: 1, pieces: [], refs: [] };
    foliageTrees.push(tree);
    const add = (kind, px, py, pz, s, flat = 0.78) => tree.pieces.push({ kind, color: leaf(),
      x: px, y: py, z: pz, sx: s, sy: s * flat, sz: s, yaw: R() * 6 });
    add('broad', x + tx, cy, z + tz, r * 1.7);
    const ring = 4 + (R() < 0.5 ? 1 : 0), a0 = R() * 6.28;
    for (let i = 0; i < ring; i++) {
      const a = a0 + i / ring * Math.PI * 2 + (R() - 0.5) * 0.5;
      add('leaf', x + tx + Math.cos(a) * r * 0.62, cy - r * 0.12 + R() * r * 0.2, z + tz + Math.sin(a) * r * 0.62, r * (1.0 + R() * 0.3));
    }
    add('leaf', x + tx + (R() - 0.5) * r * 0.3, cy + r * 0.5, z + tz + (R() - 0.5) * r * 0.3, r * 1.1);
    phys.addBox(x, z, 0.22, 0.22, 0, g - 0.5, g + th, { tag: 'trunk', ground: false });
    phys.add(circle(x, z, r * 0.8, 7), cy - r * 0.2, cy + r * 0.45, { tag: 'canopy', solid: false });
    return cy + r * 0.45;
  }

  // a park tree: thin trunk forking into a few branches under an airy umbrella of small, light
  // green clumps with sky showing between them
  function parkTree(x, g, z, h, r) {
    r = Math.max(1.6, Math.min(r, 3));
    const fork = g + 1.1 + R() * 0.4;
    const cy = Math.max(g + 2.7, Math.min(g + h * 0.75, g + 3.8));
    const lean = (R() - 0.5) * 0.25, ld = R() * 6.28;
    batch.add(P.frustum(0.7, 6), C.trunk, x, (g + fork) / 2, z, 0.26, fork - g, 0.26, 0, Math.sin(ld) * lean, -Math.cos(ld) * lean);
    const tree = { x, y: cy, z, radius: r * 1.1, opacity: 1, pieces: [], refs: [] };
    foliageTrees.push(tree);
    const n = 4 + (R() < 0.5 ? 1 : 0), a0 = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * Math.PI * 2 + (R() - 0.5) * 0.6, d = r * (0.35 + R() * 0.2);
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, by = cy - 0.1 + (R() - 0.5) * 0.4;
      // branch from the fork out to the clump
      const len = Math.hypot(d, by - fork), tilt = Math.atan2(d, by - fork);
      batch.add(P.cyl(4), C.trunk, (x + bx) / 2, (fork + by) / 2, (z + bz) / 2, 0.12, len, 0.12, 0, Math.sin(a) * tilt, -Math.cos(a) * tilt);
      tree.pieces.push({ kind: 'leaf', color: PARK_LEAF[Math.floor(R() * PARK_LEAF.length)], x: bx, y: by + 0.25, z: bz,
        sx: r * (0.75 + R() * 0.2), sy: r * 0.62, sz: r * (0.75 + R() * 0.2), yaw: R() * 6 });
    }
    tree.pieces.push({ kind: 'leaf', color: PARK_LEAF[Math.floor(R() * PARK_LEAF.length)], x, y: cy + 0.55, z,
      sx: r * 0.95, sy: r * 0.6, sz: r * 0.95, yaw: R() * 6 });
    phys.addBox(x, z, 0.16, 0.16, 0, g - 0.5, fork, { tag: 'trunk', ground: false });
    phys.add(circle(x, z, r * 0.9, 7), cy - 0.1, cy + 0.7, { tag: 'canopy', solid: false });
    return cy + 0.7;
  }

  // mangroves: a knot of arching prop roots under a low, dense, dark crown
  function mangrove(x, g, z, h, r) {
    r = Math.max(1.2, r);
    const cy = Math.max(g + h * 0.62, g + 1.9 + r * 0.55);
    const tree = { x, y: cy, z, radius: r * 1.2, opacity: 1, pieces: [], refs: [] };
    foliageTrees.push(tree);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + R();
      batch.add(P.cyl(4), C.trunk, x + Math.cos(a) * 0.35, g + h * 0.18, z + Math.sin(a) * 0.35, 0.08, h * 0.45, 0.08,
        0, Math.sin(a) * 0.5, -Math.cos(a) * 0.5);
    }
    batch.add(P.cyl(5), C.trunk, x, g + h * 0.35, z, 0.22, h * 0.5, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = R() * 6.28, d = i ? r * 0.5 : 0, s = r * (1.1 + R() * 0.4);
      tree.pieces.push({ kind: 'mangrove', color: R() < 0.5 ? C.mangrove : 0x3a7a3a,
        x: x + Math.cos(a) * d, y: cy + (i ? -0.1 : 0.2), z: z + Math.sin(a) * d, sx: s * 1.3, sy: s * 0.7, sz: s * 1.3, yaw: R() * 6 });
    }
    phys.add(circle(x, z, r * 0.7, 6), cy - 0.2, cy + r * 0.4, { tag: 'canopy', solid: false });
    return cy + r * 0.4;
  }

  // a low leafy bush (undergrowth at the edge of the woods)
  function bush(x, g, z, s) {
    const tree = { x, y: g + s * 0.35, z, radius: s * 0.8, opacity: 1, pieces: [], refs: [] };
    foliageTrees.push(tree);
    for (let i = 0; i < 3; i++) {
      const a = R() * 6.28, d = i ? s * 0.35 : 0;
      tree.pieces.push({ kind: 'bush', color: R() < 0.5 ? 0x3d7f37 : 0x4f9140, x: x + Math.cos(a) * d, y: g + s * 0.3,
        z: z + Math.sin(a) * d, sx: s * (1 - i * 0.15), sy: s * 0.7, sz: s * (1 - i * 0.15), yaw: R() * 6 });
    }
  }

  function circle(x, z, r, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    return out;
  }

  // ---------------------------------------------------------------- the paseo (closed street behind the kiosks)
  buildPaseoStreet({ data, batch, phys, H, info, palm, broadTree, bush });

  // ---------------------------------------------------------------- parked cars
  // Cars park in stall rows along each lot's aisles (the service roads inside the lot), nose
  // or tail to the aisle, with white stall lines painted between spaces. Most spaces are empty,
  // like the real lots on a normal day.
  const carCols = [0xf4f4f2, 0xf4f4f2, 0xc0c0c8, 0xc0c0c8, 0x2b2b2b, 0x6a7078, 0xd23b3b, 0x3d6fb6, 0x2f5f4f, 0xd9ccb0, 0x8a2a4a];
  const lots = W.parking.map(wpts);
  const allRoads = W.roads.map(r => ({ p: wpts(r.p), hw: r.w * S / 2 }));
  const distToRoad = (x, z, skip) => {
    let best = Infinity;
    for (const r of allRoads) {
      if (r === skip) continue;
      for (let i = 1; i < r.p.length; i++) best = Math.min(best, segDist(x, z, ...r.p[i - 1], ...r.p[i]) - r.hw);
    }
    return best;
  };
  for (const aisle of allRoads) {
    if (aisle.hw > 2) continue; // only service roads are aisles
    const lot = lots.find(l => aisle.p.some(([x, z]) => inPoly(x, z, l)));
    if (!lot) continue;
    for (let i = 1; i < aisle.p.length; i++) {
      const [ax, az] = aisle.p[i - 1], [bx, bz] = aisle.p[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
      const stall = 1.65, depth = 3.0, edge = aisle.hw + 0.1;
      for (const side of [-1, 1]) {
        let k = 0;
        for (let d = 1.5; d + 1.5 < len; d += stall) {
          const cx = ax + ux * d + nx * side * (edge + depth / 2), cz = az + uz * d + nz * side * (edge + depth / 2);
          if (!inPoly(cx, cz, lot) || distToRoad(cx, cz, aisle) < 1.7) continue;
          if (phys.near(cx, cz, 1.6).some(c => c.solid && c.tag !== 'deck')) continue;
          const g = H(cx, cz);
          // a raised planter island at the start of each row and every 12th space, some with a
          // shade tree (the real lots have low stone planters and sparse trees)
          if (k++ % 12 === 0) {
            const yawI = Math.atan2(-nz, nx);
            batch.add(P.box(), 0xd2c8b4, cx, g + 0.15, cz, depth - 0.2, 0.3, stall - 0.15, yawI);
            batch.add(P.box(), 0x8a9a52, cx, g + 0.31, cz, depth - 0.45, 0.03, stall - 0.4, yawI);
            phys.addBox(cx, cz, (depth - 0.2) / 2, (stall - 0.15) / 2, yawI, g - 0.2, g + 0.3, { tag: 'planter' });
            if (k % 24 === 1) parkTree(cx, g + 0.3, cz, 6 * S, 2.4 * S);
            else bush(cx, g + 0.3, cz, 0.8);
            continue;
          }
          // stall line on the near side of this space
          const lx = cx - ux * stall / 2, lz = cz - uz * stall / 2;
          batch.add(P.box(), 0xf2f2ee, lx, g + 0.1, lz, depth, 0.02, 0.09, Math.atan2(-nz, nx));
          if (R() > 0.26) continue; // about a quarter of the spaces taken
          const types = ['sedan', 'sedan', 'suv', 'pickup'];
          car(cx, g, cz, Math.atan2(-nz, nx) + (R() < 0.5 ? Math.PI : 0) + (R() - 0.5) * 0.05,
            carCols[Math.floor(R() * carCols.length)], types[Math.floor(R() * types.length)]);
        }
      }
    }
  }

  // A low-poly car in one of three shapes, with glass, lights, wheels and hubcaps.
  function car(x, g, z, yaw, col, type = 'sedan') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    const part = (prim, color, u, v, y, sx, sy, sz, rz = 0) => { const [px, pz] = at(u, v); batch.add(prim, color, px, g + y, pz, sx, sy, sz, yaw, 0, rz); };
    const glass = 0x26323c, L = type === 'suv' ? 2.8 : 2.7, Wd = type === 'suv' ? 1.25 : 1.18;
    const bodyH = type === 'sedan' ? 0.42 : 0.52, base = 0.22;
    part(P.box(), col, 0, 0, base + bodyH / 2, L, bodyH, Wd);                                   // body
    part(P.box(), 0x3a3f44, 0, 0, base + 0.05, L + 0.04, 0.1, Wd + 0.02);                        // bumpers / sills
    const top = base + bodyH;
    if (type === 'pickup') {
      part(P.box(), col, 0.45, 0, top + 0.24, 1.0, 0.48, Wd * 0.94);                            // cab
      part(P.box(), glass, 0.45, 0, top + 0.28, 1.02, 0.3, Wd * 0.96);
      for (const v of [-1, 1]) part(P.box(), col, -0.7, v * (Wd / 2 - 0.04), top + 0.16, 1.2, 0.3, 0.07); // bed walls
      part(P.box(), col, -1.3, 0, top + 0.16, 0.07, 0.3, Wd);                                    // tailgate
      part(P.box(), 0x4a4f54, -0.7, 0, top + 0.02, 1.2, 0.04, Wd - 0.1);                         // bed floor
    } else {
      const cl = type === 'suv' ? 1.75 : 1.35, ch = type === 'suv' ? 0.5 : 0.42, cu = type === 'suv' ? -0.2 : -0.1;
      part(P.box(), col, cu, 0, top + ch / 2, cl, ch, Wd * 0.9);                                 // cabin
      part(P.box(), glass, cu, 0, top + ch * 0.55, cl + 0.02, ch * 0.6, Wd * 0.92);              // side windows
      part(P.box(), glass, cu + cl / 2 + 0.12, 0, top + ch * 0.45, 0.42, 0.05, Wd * 0.86, -0.95);  // windshield
      part(P.box(), glass, cu - cl / 2 - 0.08, 0, top + ch * 0.45, 0.32, 0.05, Wd * 0.86, 0.95);   // rear window
      if (type === 'suv') for (const v of [-0.4, 0.4]) part(P.box(), 0x2a2a2a, cu, v, top + ch + 0.05, cl * 0.9, 0.05, 0.05); // roof rails
    }
    for (const v of [-1, 1]) {
      part(P.box(), 0xfff3c4, L / 2 + 0.005, v * (Wd / 2 - 0.2), base + bodyH * 0.65, 0.04, 0.12, 0.22); // headlights
      part(P.box(), 0xd02a2a, -L / 2 - 0.005, v * (Wd / 2 - 0.18), base + bodyH * 0.65, 0.04, 0.12, 0.2); // taillights
      part(P.box(), col, 0.55, v * (Wd / 2 + 0.06), top + 0.12, 0.08, 0.08, 0.1);                // mirrors
    }
    for (const [u, v] of [[0.85, 1], [0.85, -1], [-0.85, 1], [-0.85, -1]]) {
      const [wx, wz] = at(u, v * (Wd / 2 - 0.02));
      batch.add(P.cyl(10), 0x1a1a1a, wx, g + 0.24, wz, 0.48, 0.22, 0.48, yaw, Math.PI / 2);
      const [hx, hz] = at(u, v * (Wd / 2 + 0.09));
      batch.add(P.cyl(8), 0xb8bcc2, hx, g + 0.24, hz, 0.26, 0.02, 0.26, yaw, Math.PI / 2);
    }
    phys.addBox(x, z, L / 2, Wd / 2, yaw, g, g + top, { tag: 'car' });
    phys.addBox(x, z, L * 0.3, Wd * 0.45, yaw, g + top, g + top + 0.45, { tag: 'car' });
  }

  // ---------------------------------------------------------------- fountains
  for (const poi of W.poi) {
    if (poi.t.amenity !== 'fountain') continue;
    const [x, z] = [poi.p[0] * S, -poi.p[1] * S];
    const g = H(x, z);
    const big = Math.hypot(poi.p[0] + 5, poi.p[1] - 58) < 10; // the roundabout fountain
    if (big) {
      // Fuente del León Ponceño (María Elena Perales), as it looks in 2025 Street View: a wide,
      // shallow blue-painted basin ringed by short concrete bollards; in the middle a rough gray
      // stone drum topped by a flared red-brick ring, and Ponce's lion walking on top, tail up.
      const r = 6.2;
      const ring = circle(x, z, r, 28);
      batch.addTris(prismTris(ring, g, g + 0.35, false), 0xf0ece2);
      batch.add(P.cyl(28), 0x5aa8e0, x, g + 0.12, z, r * 2 - 0.3, 0.1, r * 2 - 0.3);
      phys.add(ring, g, g + 0.35, { tag: 'fountain' });
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2, bx = x + Math.cos(a) * (r + 0.5), bz = z + Math.sin(a) * (r + 0.5);
        batch.add(P.cyl(8), 0xd8d2c4, bx, g + 0.35, bz, 0.4, 0.7, 0.4, 0, 0, 0, 0.05);
        phys.addBox(bx, bz, 0.2, 0.2, 0, g, g + 0.7, { tag: 'bollard' });
      }
      batch.add(P.cyl(14), 0x8d8a82, x, g + 0.7, z, 3.2, 1.4, 3.2, 0, 0, 0, 0.12);
      batch.add(P.frustum(1.25, 16), 0xa3412c, x, g + 1.65, z, 3.3, 0.55, 3.3);
      batch.add(P.cyl(16), 0xb24a32, x, g + 1.97, z, 3.9, 0.12, 3.9);
      const top = g + 2.03;
      phys.add(circle(x, z, 1.9, 14), g, top, { tag: 'pedestal' });
      // the lion, mid-stride
      const yaw = 0.6;
      const lc = Math.cos(yaw), ls = Math.sin(yaw);
      const L2 = (u, v, dy, sx, sy2, sz, prim, col, rx = 0, rz = 0) =>
        batch.add(prim, col, x + v * ls + u * lc, top + dy, z + v * lc - u * ls, sx, sy2, sz, yaw, rx, rz);
      const bronze = 0xc09a4a, mane = 0x9a7534;
      L2(0, 0, 0.95, 0.8, 0.75, 1.8, P.sphere(10, 8), bronze);                               // body
      for (const [u, v, sw] of [[-0.24, 0.6, 0.3], [0.24, 0.55, -0.25], [-0.24, -0.55, -0.25], [0.24, -0.6, 0.3]]) {
        L2(u, v + sw * 0.3, 0.42, 0.24, 0.85, 0.24, P.cyl(6), bronze, sw);                    // striding legs
      }
      L2(0, 0.95, 1.45, 1.15, 1.15, 0.95, P.dodeca(), mane);                                 // mane
      L2(0, 1.22, 1.45, 0.58, 0.56, 0.56, P.sphere(8, 6), bronze);                          // face
      L2(0, 1.48, 1.36, 0.3, 0.22, 0.24, P.box(), bronze);                                  // muzzle
      for (const u of [-0.17, 0.17]) L2(u, 1.46, 1.56, 0.07, 0.07, 0.05, P.sphere(4, 3), 0x3a2a10);
      L2(0, -1.0, 1.35, 0.09, 0.09, 1.0, P.cyl(5), bronze, -0.9);                           // tail up
      L2(0, -1.3, 1.85, 0.24, 0.24, 0.24, P.dodeca(), mane);                                // tail tuft
      phys.addBox(x, z, 0.45, 0.95, yaw, top, top + 1.5, { tag: 'lion' });
      info.fountainBig = { x, z, g, top: top + 2.2 };
      continue;
    }
    const r = 3;
    const ring = circle(x, z, r, 16), inner = circle(x, z, r - 0.4, 16);
    batch.addTris(prismTris(ring, g, g + 0.6, false), 0xe8e0d0);
    batch.addTris(prismTris(ring, g + 0.55, g + 0.6, true), 0xf2ece0);
    batch.add(P.cyl(16), 0x4fb8d8, x, g + 0.35, z, (r - 0.4) * 2, 0.1, (r - 0.4) * 2);
    phys.add(ring, g, g + 0.6, { tag: 'fountain' });
    phys.add(inner, g, g + 0.3, { tag: 'fountainwater', solid: false });
    // tiered centerpiece
    const tiers = 2;
    let y = g;
    for (let i = 0; i < tiers; i++) {
      const pr = 0.5 - i * 0.1, ph = 1.4;
      batch.add(P.cyl(8), 0xe8e0d0, x, y + ph / 2, z, pr, ph, pr);
      y += ph;
      const br = (tiers - i) * 0.7 + 0.2;
      batch.add(P.frustum(1.5, 12), 0xf2ece0, x, y, z, br, 0.3, br);
      phys.add(circle(x, z, br / 2 + 0.2, 10), y - 0.2, y + 0.15, { tag: 'tier' });
      phys.add(circle(x, z, pr / 2 + 0.05, 6), y - ph, y - 0.2, { tag: 'tierpole' });
    }
    batch.add(P.sphere(8, 6), 0xd9b44a, x, y + 0.35, z, 0.5, 0.5, 0.5);
    info.fountainPark = { x, z, g, top: y + 0.15 };
  }

  // ---------------------------------------------------------------- backdrop
  buildBackdrop(batch, data, W, R);

  const statics = batch.build(mat);
  scene.add(statics);
  const fadeFoliage = buildFoliage(scene, foliageTrees, frondGeo());
  info.foliageTrees = foliageTrees;

  // food signs over kiosks facing the boardwalk
  buildSigns(scene, info, tab);

  return { info, water, sky, statics, fadeFoliage };
}

function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// the boardwalk's lamps are tall teal lattice towers (four posts tied with crossbars) with a
// lamp head on two arms, standing on a concrete footing
function lamp(batch, x, y, z, yaw) {
  const H3 = 3.0, w = 0.18;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  batch.add(P.box(), 0xb9b2a4, x, y + 0.14, z, 0.6, 0.28, 0.6, yaw);
  for (const [u, v] of [[-w, -w], [w, -w], [w, w], [-w, w]]) {
    const [px, pz] = at(u, v);
    batch.add(P.box(), C.lamp, px, y + H3 / 2, pz, 0.07, H3, 0.07, yaw);
  }
  for (const hy of [0.7, 1.4, 2.1, 2.8]) batch.add(P.box(), C.lamp, x, y + hy, z, w * 2 + 0.08, 0.06, w * 2 + 0.08, yaw);
  // two arms with lamp heads, and a cap on top
  batch.add(P.box(), C.lamp, x, y + H3 - 0.1, z, 1.3, 0.06, 0.06, yaw);
  for (const sgn of [-1, 1]) {
    const [lx, lz] = at(sgn * 0.62, 0);
    batch.add(P.frustum(1.4, 6), C.lampGlass, lx, y + H3 - 0.28, lz, 0.2, 0.3, 0.2);
    batch.add(P.cone(6), 0x6d7478, lx, y + H3 - 0.05, lz, 0.32, 0.16, 0.32);
  }
  batch.add(P.cone(4), C.lamp, x, y + H3 + 0.15, z, 0.34, 0.3, 0.34, yaw + Math.PI / 4);
}

const KIOSK_SCHEMES = [
  { wall: 0xe89a88, trim: 0xecd9a0, base: 0xcdb27a, shutter: 0x2f6b4a }, // salmon stucco, cream trim
  { wall: 0xa0404a, trim: 0xf0e6cc, base: 0x3f7a5a, shutter: 0x8a3440 }, // maroon boards, green base
  { wall: 0x5fbfc0, trim: 0xf4f2ea, base: 0x9aa3a0, shutter: 0x2f6b8a }, // turquoise
  { wall: 0xe8c872, trim: 0xf4f0e0, base: 0x3f7a5a, shutter: 0xb8453a }, // butter yellow
  { wall: 0x9d97d6, trim: 0xf6f4ee, base: 0xc2b27a, shutter: 0x5f58a8 }, // lavender
  { wall: 0xf0b890, trim: 0xf4ecd8, base: 0xa0404a, shutter: 0x2f6b4a }, // peach, red base
];

// The boardwalk's top: weathered planks laid in a chevron that meets along the middle (as in
// Street View), one merged mesh with a tiling canvas texture.
function deckTop(quads, DW) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const img = g.createImageData(512, 512);
  const W = [[138, 124, 110], [126, 112, 100], [150, 136, 120], [118, 106, 96], [142, 126, 108], [132, 120, 112]];
  const hash = i => { let h = Math.imul(i, 2654435761) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return h % 997; };
  const PW = 16; // plank width in pixels (the tile is one deck-width square)
  for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
    // across the deck (py): each half slants the other way
    const s = py < 256 ? px + py : px + 512 - py;
    const idx = Math.floor(s / PW), along = s % PW;
    const m = ((idx % 32) + 32) % 32;
    // plank ends staggered along each plank
    const run = py < 256 ? px - py : px + py;
    const joint = (((run + hash(m) * 7) % 180) + 180) % 180 < 2;
    const col = W[hash(m) % W.length];
    const grain = Math.sin((run + m * 13) * 0.35) * 4 + (hash(m * 31 + (run >> 3)) % 9) - 4;
    const gap = along < 1 || joint || Math.abs(py - 255.5) < 1.2;
    const o = (py * 512 + px) * 4;
    const k = gap ? 0.55 : 1;
    img.data[o] = (col[0] + grain) * k; img.data[o + 1] = (col[1] + grain) * k; img.data[o + 2] = (col[2] + grain) * k; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const pos = [], uv = [];
  let u0 = 0;
  for (const [ax, az, bx, bz, nx, nz, y] of quads) {
    const len = Math.hypot(bx - ax, bz - az), u1 = u0 + len / DW;
    const h = DW / 2, yy = y + 0.002;
    const A = [ax - nx * h, yy, az - nz * h], B = [ax + nx * h, yy, az + nz * h];
    const Cc = [bx - nx * h, yy, bz - nz * h], D = [bx + nx * h, yy, bz + nz * h];
    pos.push(...A, ...Cc, ...B, ...B, ...Cc, ...D);
    uv.push(u0, 0, u1, 0, u0, 1, u0, 1, u1, 0, u1, 1);
    u0 = u1 % 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

// Puerto Rican flag hung vertically on a face of the given width/height ratio
function flagTexture(aspect) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round(256 / aspect);
  const g = c.getContext('2d'), w = c.width, h = c.height;
  // stripes run the length of the face; the flag is 5 stripes across
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f4f2ec' : '#d8262f'; g.fillRect(i * w / 5, 0, w / 5 + 1, h); }
  // the triangle's base spans the top edge, its point hangs down
  const th = w * 0.866;
  g.fillStyle = '#2f6fcf';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2, th); g.closePath(); g.fill();
  // five-pointed star, upright as painted on the tower
  const sx = w / 2, sy = th * 0.36, R1 = w * 0.13, R2 = R1 * 0.4;
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? R2 : R1;
    g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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
// deck height from the land behind it: sample the ground across the whole deck strip so grass
// never pokes through the planks
function deckHeight(line, H, DW) {
  let top = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let s = 0; s <= len; s += 1.5)
      for (let o = -DW; o <= DW; o += 0.7) top = Math.max(top, H(ax + ux * s - uz * o, az + uz * s + ux * o));
  }
  return Math.max(0.95, Math.min(top + 0.1, 2.2));
}

// The deck sits at one height, so where the land behind it is lower it would float. Build the
// ground up into a gentle embankment that meets the deck's land edge (and wraps around its ends),
// never lowering anything.
function raiseBesideBoardwalk(data, lines, DW) {
  const { gw, gh, heights, step, X0, Z0, terrainH } = data;
  for (const line of lines) {
    const deckY = deckHeight(line, terrainH, DW);
    const want = deckY - 0.1, FLAT = 5, FALL = 7;
    // the land side of each segment, decided up front (before any heights change)
    const segs = [];
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      let nx = -uz, nz = ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (terrainH(mx + nx * 6, mz + nz * 6) > terrainH(mx - nx * 6, mz - nz * 6)) { nx = -nx; nz = -nz; }
      segs.push({ ax, az, ux, uz, nx, nz, len, first: i === 0, last: i === line.length - 2 });
    }
    const raised = new Map();
    for (const sg of segs) {
      const { ax, az, ux, uz, nx, nz, len } = sg;
      const pad = FLAT + FALL + 2;
      const xs = [ax, ax + ux * len], zs = [az, az + uz * len];
      const minI = Math.max(0, Math.floor((Math.min(...xs) - pad - X0) / step)), maxI = Math.min(gw - 1, Math.ceil((Math.max(...xs) + pad - X0) / step));
      const minJ = Math.max(0, Math.floor((Math.min(...zs) - pad - Z0) / step)), maxJ = Math.min(gh - 1, Math.ceil((Math.max(...zs) + pad - Z0) / step));
      for (let j = minJ; j <= maxJ; j++)
        for (let k = minI; k <= maxI; k++) {
          const x = X0 + k * step, z = Z0 + j * step;
          const sAlong = (x - ax) * ux + (z - az) * uz, off = -((x - ax) * nx + (z - az) * nz); // off > 0: land side
          if (off < -0.2) continue; // never on the water side
          // distance from the deck's land edge, including past the deck's ends
          const past = sAlong < 0 ? (sg.first ? -sAlong : Infinity) : sAlong > len ? (sg.last ? sAlong - len : Infinity) : 0;
          if (past === Infinity) continue;
          const d = Math.hypot(Math.max(0, off - 1.4), past);
          if (d > FLAT + FALL) continue;
          const h = d <= FLAT ? want : want - (d - FLAT) / FALL * (want - Math.min(want, heights[j * gw + k]));
          const idx = j * gw + k;
          raised.set(idx, Math.max(raised.get(idx) ?? -Infinity, h));
        }
    }
    for (const [idx, h] of raised) if (heights[idx] < h && heights[idx] > -0.5) heights[idx] = h;
  }
}

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
  const tex = new THREE.CanvasTexture(groundMap(data));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const m = new THREE.Mesh(g, detailMaterial(tex));
  m.receiveShadow = true;
  scene.add(m);

  // land beyond the data (north: the port and city) and the deep seabed around everything
  const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: 0x1b4a66 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -9 * 0.6 - 0.05;
  scene.add(far);
}

// Keep the aerial image between mapped areas, and paint crisp land cover on defined polygons.
function groundMap(data) {
  const f = data.world.frame;
  // keep the photo's full resolution (0.5 m per pixel); polygons are drawn in meters on top
  const c = document.createElement('canvas');
  c.width = data.colorImg.width; c.height = data.colorImg.height;
  const g = c.getContext('2d');
  g.drawImage(data.colorImg, 0, 0);
  g.scale(c.width / (f.x1 - f.x0), c.height / (f.y1 - f.y0));
  const fill = (polys, color) => {
    g.fillStyle = color;
    for (const poly of polys) {
      if (poly.length < 3) continue;
      g.beginPath();
      poly.forEach(([x, y], i) => i ? g.lineTo(x - f.x0, f.y1 - y) : g.moveTo(x - f.x0, f.y1 - y));
      g.closePath(); g.fill();
    }
  };
  // clean game colors, with a little of the photo's detail still showing through
  g.globalAlpha = 0.8;
  fill(data.world.wetland, '#748867');
  // Ponce's dry south coast: the park is dusty tan ground with patches of dry grass (Street View 2025)
  g.globalAlpha = 0.95;
  fill(data.world.park, '#d0b78c');
  {
    g.save();
    g.beginPath();
    for (const poly of data.world.park) poly.forEach(([x, y], i) => i ? g.lineTo(x - f.x0, f.y1 - y) : g.moveTo(x - f.x0, f.y1 - y));
    g.clip();
    let sd = 11;
    const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const xs = data.world.park.flat().map(p => p[0]), ys = data.world.park.flat().map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const n = Math.round((x1 - x0) * (y1 - y0) / 25);
    for (let i = 0; i < n; i++) {
      const x = x0 + rr() * (x1 - x0), y = y0 + rr() * (y1 - y0);
      g.globalAlpha = 0.12 + rr() * 0.22;
      g.fillStyle = ['#9a9a5c', '#a8a46a', '#8f9456', '#b39b6e'][Math.floor(rr() * 4)];
      g.beginPath();
      g.ellipse(x - f.x0, f.y1 - y, 1.5 + rr() * 5, 1 + rr() * 3.5, rr() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 0.8;
  }
  fill(data.world.beach, '#dec797');
  g.globalAlpha = 0.9;
  fill(data.world.parking, '#999997');
  g.globalAlpha = 1;
  // brick-paver plazas (as in Street View): around the observation tower and at the boardwalk's
  // north end. Painted pixel by pixel so they stop at the water's edge.
  {
    const W2 = data.world, px = c.width / (f.x1 - f.x0);
    const tower = W2.buildings.find(b => b.k === 'tower');
    const ends = W2.tablado.flatMap(l => [l[0], l[l.length - 1]]);
    const north = ends.reduce((a, b) => (b[1] > a[1] ? b : a), ends[0]);
    const spots = [];
    if (tower) spots.push([tower.r[0], tower.r[1], 26]);
    if (north) {
      // move the north plaza inland: toward higher ground
      let best = null;
      for (let a = 0; a < 8; a++) {
        const x = north[0] + Math.cos(a * Math.PI / 4) * 14, y = north[1] + Math.sin(a * Math.PI / 4) * 14;
        const h = data.terrainH(x * S, -y * S);
        if (!best || h > best.h) best = { x, y, h };
      }
      spots.push([best.x, best.y, 20]);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const [mx, my, r] of spots) {
      const cx = (mx - f.x0) * px, cy = (f.y1 - my) * px, rp = r * px;
      const x0 = Math.max(0, Math.floor(cx - rp)), y0 = Math.max(0, Math.floor(cy - rp));
      const w = Math.min(c.width - x0, Math.ceil(rp * 2)), h = Math.min(c.height - y0, Math.ceil(rp * 2));
      const img = g.getImageData(x0, y0, w, h), d = img.data;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const dx = x0 + i - cx, dy = y0 + j - cy, rr = Math.hypot(dx, dy) / rp;
        if (rr > 1) continue;
        const wx = (x0 + i) / px + f.x0, wy = f.y1 - (y0 + j) / px;
        if (data.terrainH(wx * S, -wy * S) < 0.25) continue;
        // herringbone-ish brick rows, a warm gray like the real pavers
        const bx = x0 + i, by = y0 + j;
        const v = ((bx >> 1) + (by >> 2) + ((by >> 3) & 1)) % 3 === 0 ? -10 : ((bx + by) % 7 === 0 ? -6 : 0);
        const k = Math.min(1, (1 - rr) * 6); // soft edge
        const o = (j * w + i) * 4;
        d[o] = d[o] * (1 - k) + (184 + v) * k;
        d[o + 1] = d[o + 1] * (1 - k) + (176 + v) * k;
        d[o + 2] = d[o + 2] * (1 - k) + (164 + v) * k;
      }
      g.putImageData(img, x0, y0);
    }
  }
  // shade the forest floor under the real woods (LiDAR canopy map)
  if (data.canopyImg) {
    const m = document.createElement('canvas');
    m.width = data.canopyImg.width; m.height = data.canopyImg.height;
    const mg = m.getContext('2d');
    mg.drawImage(data.canopyImg, 0, 0);
    const px = mg.getImageData(0, 0, m.width, m.height);
    for (let i = 0; i < px.data.length; i += 4) {
      const k = Math.min(1, px.data[i] / 60); // full shade from 6 m tall
      px.data[i] = 34; px.data[i + 1] = 62; px.data[i + 2] = 30; px.data[i + 3] = k * 120;
    }
    mg.putImageData(px, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.filter = 'blur(6px)';
    g.drawImage(m, 0, 0, c.width, c.height);
    g.filter = 'none';
  }
  return c;
}

// Roads and footpaths are terrain-following ribbons with real geometry, so their edges stay sharp.
function buildRoutes(scene, data) {
  const H = data.terrainH;
  // roads that run into the paseo stop at its edge (bollards close them off)
  const F = paseoFrame(data);
  const clip = pts => {
    if (!F) return pts;
    const inside = ([x, z]) => { const p = F.project(x, z); return p.d < F.half + 0.2 && p.t > 3 && p.t < F.len - 3; };
    const out = pts.slice();
    for (const [i, j] of [[0, 1], [out.length - 1, out.length - 2]]) {
      if (out.length < 2 || !inside(out[i]) || inside(out[j])) continue;
      let a = 0, b = 1; // fraction from out[i] toward out[j]
      for (let k = 0; k < 20; k++) {
        const m = (a + b) / 2, q = [out[i][0] + (out[j][0] - out[i][0]) * m, out[i][1] + (out[j][1] - out[i][1]) * m];
        if (inside(q)) a = m; else b = m;
      }
      out[i] = [out[i][0] + (out[j][0] - out[i][0]) * b, out[i][1] + (out[j][1] - out[i][1]) * b];
      (out.cut ??= new Set()).add(i); // square end, no round cap onto the paseo
    }
    return out;
  };
  const roads = data.world.roads.filter(r => !r.paseo).map(r => ({ pts: clip(wpts(r.p)), width: r.w * S }));
  // the paseo starts square at the roundabout's edge rather than spilling across the ring
  const paseo = data.world.roads.filter(r => r.paseo).map(r => {
    const pts = wpts(r.p);
    if (F) { pts[0] = F.at(4, 0); pts.cut = new Set([0]); }
    return { pts, width: PASEO_W * S };
  });
  const paths = data.world.footways.map(p => ({ pts: wpts(p), width: 2.4 * S }));
  const add = (routes, extra, lift, color) => {
    const vertices = [];
    const point = (x, z) => [x, H(x, z) + lift, z];
    const tri = (a, b, c) => vertices.push(...a, ...b, ...c);
    for (const { pts, width } of routes) {
      const half = width / 2 + extra;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const nx = -dz / len * half, nz = dx / len * half;
        const steps = Math.ceil(len / 1.2);
        for (let j = 0; j < steps; j++) {
          const t0 = j / steps, t1 = (j + 1) / steps;
          const x0 = ax + dx * t0, z0 = az + dz * t0;
          const x1 = ax + dx * t1, z1 = az + dz * t1;
          const a = point(x0 - nx, z0 - nz), b = point(x0 + nx, z0 + nz);
          const c = point(x1 - nx, z1 - nz), d = point(x1 + nx, z1 + nz);
          tri(a, b, c); tri(b, d, c);
        }
      }
      // Rounded joins cover the seams between separately sampled road segments.
      for (const [i, [x, z]] of pts.entries()) {
        if (pts.cut?.has(i)) continue;
        const mid = point(x, z);
        for (let j = 0; j < 12; j++) {
          const a = j / 12 * Math.PI * 2, b = (j + 1) / 12 * Math.PI * 2;
          tri(mid, point(x + Math.cos(a) * half, z + Math.sin(a) * half),
            point(x + Math.cos(b) * half, z + Math.sin(b) * half));
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    // polygon offset keeps the ribbons on top of the terrain without lifting them visibly
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  add(paths, 0.28 * S, 0.03, 0xb18e69);
  add(paths, 0, 0.05, 0xd8b895);
  add(roads, 0.65 * S, 0.06, 0xc9c4b6);
  add(roads, 0, 0.09, 0x656c72);
  // the paseo: pale brushed concrete with a darker border band (no asphalt, no lane lines)
  add(paseo, 0.5 * S, 0.07, 0xb3ab9d);
  add(paseo, 0, 0.1, 0xd9d3c6);

  // road markings: dashed white center lines on the regular two-way roads, a double yellow
  // center line and white edge lines on the main road (parking aisles get stall lines instead)
  const lines = { white: [], yellow: [], joint: [] };
  // a solid line follows the road with mitered corners, so it bends without gaps
  const solidLine = (raw, off, w, out, keep = () => true) => {
    // extra points along long straights so the line follows the ground like the road does
    const pts = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const [ax, az] = raw[i - 1], [bx, bz] = raw[i], steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2);
      for (let j = 1; j <= steps; j++) pts.push([ax + (bx - ax) * j / steps, az + (bz - az) * j / steps]);
    }
    const n = pts.length;
    const edge = o => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b2 = pts[Math.min(n - 1, i + 1)];
      let nx = -(b2[1] - a[1]), nz = b2[0] - a[0];
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      // miter: stretch the offset at corners (capped for very sharp turns)
      let k = 1;
      if (i > 0 && i < n - 1) {
        const ux = pts[i][0] - a[0], uz = pts[i][1] - a[1], ul = Math.hypot(ux, uz) || 1;
        const cos = Math.abs((-(uz / ul)) * nx + (ux / ul) * nz);
        k = 1 / Math.max(0.5, cos);
      }
      const x = p[0] + nx * o * k, z = p[1] + nz * o * k;
      return [x, H(x, z) + 0.11, z];
    });
    const L1 = edge(off - w / 2), L2 = edge(off + w / 2);
    for (let i = 0; i < n - 1; i++) {
      if (!keep((L1[i][0] + L1[i + 1][0]) / 2, (L1[i][2] + L1[i + 1][2]) / 2)) continue;
      out.push(...L1[i], ...L2[i], ...L1[i + 1], ...L2[i], ...L2[i + 1], ...L1[i + 1]);
    }
  };
  const stripe = (pts, off, w, dash, gap, out) => {
    if (dash > 1e6) return solidLine(pts, off, w, out);
    let carry = 0; // keeps the dash rhythm going across polyline corners
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      for (let d = -carry; d < len; d += dash + gap) {
        const d0 = Math.max(0, d), d1 = Math.min(len, d + dash);
        if (d1 - d0 < 0.05) continue;
        const p = (t, o) => { const x = ax + ux * t + nx * o, z = az + uz * t + nz * o; return [x, H(x, z) + 0.11, z]; };
        const a = p(d0, off - w / 2), b2 = p(d0, off + w / 2), c = p(d1, off - w / 2), e = p(d1, off + w / 2);
        out.push(...a, ...b2, ...c, ...b2, ...e, ...c);
      }
      carry = (len + carry) % (dash + gap);
    }
  };
  // scored joints across the paseo slabs every 3 m, and two lengthwise ones
  for (const { pts, width } of paseo) {
    for (const o of [-width / 6, width / 6]) solidLine(pts, o, 0.05, lines.joint);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let d = 1.8; d < len; d += 3 * S) stripe([[ax + ux * d - uz * width / 2, az + uz * d + ux * width / 2], [ax + ux * d + uz * width / 2, az + uz * d - ux * width / 2]], 0, 0.05, 1e3, 0, lines.joint);
    }
  }
  const roadPts = data.world.roads.filter(r => !r.paseo).map(r => ({ r, pts: wpts(r.p), hw: r.w * S / 2 }));
  // edge lines stop where another road joins
  const clearOfOthers = self => (x, z) => !roadPts.some(o => o.r !== self && o.pts.some((q, i) => i && segDist(x, z, ...o.pts[i - 1], ...q) < o.hw + 0.4));
  for (const r of data.world.roads) {
    if (r.paseo) continue;
    const pts = clip(wpts(r.p)), hw = r.w * S / 2;
    if (r.w >= 11) {
      for (const o of [-0.1, 0.1]) stripe(pts, o, 0.07, 1e9, 0, lines.yellow);
      for (const o of [-(hw - 0.3), hw - 0.3]) solidLine(pts, o, 0.1, lines.white, clearOfOthers(r));
    } else if (r.w >= 8) stripe(pts, 0, 0.12, 1.3, 1.5, lines.white);
  }
  for (const [key, color] of [['white', 0xf2f2ee], ['yellow', 0xf2c230], ['joint', 0xa9a295]]) {
    if (!lines[key].length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines[key], 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// Tiled procedural detail gives grass, sand and paving definition close to the player.
function detailMaterial(tex) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 128 * 128; i++) {
    const v = Math.max(20, Math.min(235, 70 + r() * 115 + (r() < 0.05 ? (r() < 0.5 ? -45 : 45) : 0)));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) {
    const x = r() * 128, y = r() * 128, length = 2 + r() * 5;
    const v = r() < 0.5 ? 60 : 200;
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - length); g.stroke();
  }
  const d = new THREE.CanvasTexture(c);
  d.wrapS = d.wrapT = THREE.RepeatWrapping;
  d.anisotropy = 16;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: d };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vWp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float broad = texture2D(uDetail, vWp.xz * 0.09).r;
        float fine = texture2D(uDetail, vWp.xz * 0.38).r;
        float grit = texture2D(uDetail, vWp.xz * 1.1).r;
        float seabed = 1.0 - smoothstep(-0.6, 0.15, vWp.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.31, 0.26, 0.18), seabed);
        float fade = 1.0 - smoothstep(20.0, 90.0, length(vWp - cameraPosition));
        float grain = (broad - 0.5) * 0.5 + (fine - 0.5) * 0.3 + (grit - 0.5) * 0.18;
        diffuseColor.rgb *= 1.0 + grain * fade * 0.85;`);
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

// Real kiosks on the Paseo Tablado (from reviews and listings): number, name and specialty.
// The map has fewer kiosk buildings than the real ~21 kiosks, so each building gets the next real
// one in number order. The middle one is Doña Carmen's (the game's shop, a made-up character).
const REAL_KIOSKS = [
  [4, 'La Boya', 'Chillo Frito'], [6, 'La Cava', 'Pastelillos'], [8, 'La Mexicana y Familia', 'Mofongo'],
  [11, 'El Bohío', 'Tostones'], [15, 'El Pilón Borincano', 'Mofongo'], [17, 'Tango', 'Mariscos'],
  [19, 'El Tablado Sports Bar', 'Pinchos'], [20, 'El Chapuzón', 'Alcapurrias'], [21, 'El 21 Familiar', 'Empanadillas'],
  [13, 'Costanera', 'Bacalaítos'],
];

function buildSigns(scene, info, tab) {
  const ks = info.kiosks.slice().sort((a, b) => a.z - b.z);
  const shopIdx = Math.floor(ks.length / 2); // matches the shop kiosk chosen in level.js
  let next = 0;
  ks.forEach((k, i) => {
    let num, title, food, sub;
    if (i === shopIdx) {
      food = 'Piraguas'; num = 16; title = 'Doña Carmen'; sub = `Kiosko #${num} · ${food}`;
    } else if (next < REAL_KIOSKS.length) {
      [num, title, food] = REAL_KIOSKS[next++]; sub = `Kiosko #${num} · ${food}`;
    } else {
      num = 30 + i; food = FOODS[i % FOODS.length]; title = food; sub = `Kiosko #${num}`;
    }
    k.food = food; k.num = num; k.title = title;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#fff6e0'; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#2d6a4c'; g.lineWidth = 12; g.strokeRect(6, 6, 500, 148);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#b33a2a';
    let size = 62;
    do { g.font = `bold ${size}px Georgia, serif`; size -= 2; } while (g.measureText(title).width > 470);
    g.fillText(title, 256, 66);
    g.fillStyle = '#2d6a4c'; g.font = 'bold 30px Trebuchet MS, sans-serif';
    g.fillText(sub, 256, 125);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.81), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    // face the boardwalk: pick the rect side closest to it
    let best = null;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c2 = Math.cos(k.yaw), s2 = Math.sin(k.yaw);
      const ox = ax * (k.hx + 0.5), oz = az * (k.hz + 0.5);
      const x = k.x + ox * c2 + oz * s2, z = k.z - ox * s2 + oz * c2;
      const d = Math.min(...tab.map(l => polyDist(x, z, l)));
      if (!best || d < best.d) best = { d, x, z, nx: x - k.x, nz: z - k.z };
    }
    // the name board sits up on the roof edge, leaving the front clear for the awning and vendor
    const nl = Math.hypot(best.nx, best.nz) || 1;
    m.position.set(best.x + best.nx / nl * 0.1, k.eave + 0.3, best.z + best.nz / nl * 0.1);
    m.lookAt(m.position.x + best.nx, k.eave + 0.3, m.position.z + best.nz);
    k.front = { x: best.x, z: best.z, nx: best.nx, nz: best.nz };
    scene.add(m);
    info.signs.push(m);
  });
}
