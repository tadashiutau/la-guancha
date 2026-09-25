// Street furniture, the kids' playground, pergolas, the open-air stage and flowering bushes.
// Everything looks for open ground first so it never lands on a road, a tree or a building.
import * as THREE from 'three';
import { S } from './data.js';
import { P, rng } from './geo.js';

const L = (x, y) => [x * S, -y * S];

export function buildProps(g, props) {
  const { phys, world, data } = g;
  const H = data.terrainH;
  const info = world.info;
  const R = rng(99);
  const top = (x, z) => phys.topMost(x, z);
  const roads = data.world.roads.map(r => ({ w: r.w * S / 2 + 1, p: r.p.map(([x, y]) => L(x, y)) }));
  const nearRoad = (x, z, pad = 0) => roads.some(r => {
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      if (Math.hypot(x - ax - ex * t, z - az - ez * t) < r.w + pad) return true;
    }
    return false;
  });
  const clear = (x, z, rad) => {
    if (H(x, z) < 0.3 || Math.abs(top(x, z) - H(x, z)) > 0.15) return false;
    for (const c of phys.near(x, z, rad)) {
      if (c.tag === 'canopy' || c.tag === 'palmtop') {
        if (Math.hypot((c.minx + c.maxx) / 2 - x, (c.minz + c.maxz) / 2 - z) < rad * 0.6) return false;
        continue;
      }
      return false;
    }
    return !nearRoad(x, z, rad * 0.5);
  };
  const used = [];
  const freeSpot = (cx, cz, rad, maxR = 40) => {
    for (let r = 0; r <= maxR; r += 1)
      for (let k = 0; k < Math.max(1, r * 3); k++) {
        const a = k / Math.max(1, r * 3) * Math.PI * 2 + r;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (used.some(([ux, uz, ur]) => Math.hypot(ux - x, uz - z) < ur + rad)) continue;
        if (clear(x, z, rad)) { used.push([x, z, rad]); return [x, z]; }
      }
    return null;
  };
  const box = (col, x, y, z, sx, sy, sz, yaw = 0, rx = 0, rz = 0) => props.add(P.box(), col, x, y, z, sx, sy, sz, yaw, rx, rz);
  const solid = (x, z, hx, hz, yaw, y0, y1, tag = 'prop') => phys.addBox(x, z, hx, hz, yaw, y0, y1, { tag });
  const rot = (x, z, yaw, u, v) => [x + u * Math.cos(yaw) + v * Math.sin(yaw), z - u * Math.sin(yaw) + v * Math.cos(yaw)];
  const animated = [];

  // ---------------------------------------------------------------- playground
  const [pcx, pcz] = L(95, 50);
  const fp = info.fountainPark;
  const center = fp ? [fp.x, fp.z] : [pcx, pcz];
  const pg = { r: 0xe3342f, y: 0xf7c948, b: 0x2f6fd0, g: 0x2e9e5b, m: 0xd8d8d8 };
  const spots = [];

  // swing set
  let s = freeSpot(center[0] - 14, center[1] + 6, 3.4);
  if (s) {
    const [x, z] = s, y = H(x, z), yaw = 0.4;
    for (const u of [-2.1, 2.1]) for (const v of [-0.7, 0.7]) {
      const [px, pz] = rot(x, z, yaw, u, v * 1.4);
      box(pg.b, (px + rot(x, z, yaw, u, 0)[0]) / 2, y + 1.3, (pz + rot(x, z, yaw, u, 0)[1]) / 2, 0.14, 2.7, 0.14, yaw, v > 0 ? 0.26 : -0.26);
    }
    box(pg.y, x, y + 2.6, z, 4.6, 0.16, 0.16, yaw);
    solid(x, z, 2.3, 0.1, yaw, y + 2.5, y + 2.7, 'bar');
    for (const u of [-2.1, 2.1]) { const [px, pz] = rot(x, z, yaw, u, 0); solid(px, pz, 0.12, 0.9, yaw, y, y + 2.6, 'post'); }
    for (const u of [-0.8, 0.8]) {
      const [px, pz] = rot(x, z, yaw, u, 0);
      const pivot = new THREE.Group();
      pivot.position.set(px, y + 2.55, pz);
      pivot.rotation.y = yaw;
      const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      for (const w of [-0.25, 0.25]) {
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.9, 0.03), mat);
        ch.position.set(w, -0.95, 0); pivot.add(ch);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: pg.r }));
      seat.position.y = -1.9; seat.castShadow = true; pivot.add(seat);
      g.root.add(pivot);
      const ph = R() * 6;
      animated.push((dt, now) => { pivot.rotation.z = 0; pivot.rotation.x = Math.sin(now * 1.8 + ph) * 0.45; });
    }
    spots.push([x, z]);
  }

  // slide: ladder up to a platform, chute down the other side
  s = freeSpot(center[0] + 14, center[1] - 8, 3.4);
  if (s) {
    const [x, z] = s, y = H(x, z), yaw = -0.6, ph = 2.0;
    const [plx, plz] = rot(x, z, yaw, -0.6, 0);
    box(pg.y, plx, y + ph, plz, 1.2, 0.15, 1.2, yaw);
    solid(plx, plz, 0.6, 0.6, yaw, y + ph - 0.3, y + ph, 'slide');
    for (const [u, v] of [[-0.55, -0.55], [-0.55, 0.55], [0.55, -0.55], [0.55, 0.55]]) {
      const [px, pz] = rot(plx, plz, yaw, u, v);
      box(pg.b, px, y + ph / 2 + 0.3, pz, 0.12, ph + 0.6, 0.12, yaw);
    }
    const [brx, brz] = rot(plx, plz, yaw, 0, 0.62);
    box(pg.r, brx, y + ph + 0.35, brz, 1.2, 0.5, 0.06, yaw);
    // ladder (walkable steps)
    for (let i = 0; i < 5; i++) {
      const [sx2, sz2] = rot(plx, plz, yaw, -0.9 - (4 - i) * 0.35, 0);
      const sy = y + (i + 1) * (ph / 5);
      box(pg.m, sx2, sy - 0.03, sz2, 0.3, 0.06, 0.9, yaw);
      solid(sx2, sz2, 0.18, 0.45, yaw, sy - 0.2, sy, 'step');
    }
    // chute
    const len = 3.4, ang = Math.atan2(ph - 0.3, len);
    const [cx2, cz2] = rot(plx, plz, yaw, 0.6 + len / 2, 0);
    box(pg.r, cx2, y + (ph + 0.3) / 2, cz2, len / Math.cos(ang), 0.08, 0.9, yaw, 0, -ang);
    for (const v of [-0.47, 0.47]) { const [ex, ez] = rot(cx2, cz2, yaw, 0, v); box(pg.y, ex, y + (ph + 0.3) / 2 + 0.15, ez, len / Math.cos(ang), 0.2, 0.06, yaw, 0, -ang); }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8, [sx2, sz2] = rot(plx, plz, yaw, 0.6 + t * len, 0), sy = y + ph - (ph - 0.3) * t;
      solid(sx2, sz2, len / 16 + 0.02, 0.42, yaw, sy - 0.25, sy, 'chute');
    }
    spots.push([x, z]);
  }

  // seesaw
  s = freeSpot(center[0] - 6, center[1] - 16, 2.6);
  if (s) {
    const [x, z] = s, y = H(x, z), yaw = 1.1;
    box(pg.b, x, y + 0.3, z, 0.4, 0.6, 0.5, yaw);
    const pivot = new THREE.Group();
    pivot.position.set(x, y + 0.6, z); pivot.rotation.y = yaw;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.35), new THREE.MeshLambertMaterial({ color: pg.y }));
    plank.castShadow = true; pivot.add(plank);
    for (const u of [-1.6, 1.6]) {
      const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.3), new THREE.MeshLambertMaterial({ color: pg.r }));
      hnd.position.set(u * 0.85, 0.2, 0); pivot.add(hnd);
    }
    g.root.add(pivot);
    animated.push((dt, now) => { pivot.rotation.z = Math.sin(now * 1.2) * 0.22; });
    solid(x, z, 0.3, 0.3, yaw, y, y + 0.6);
    spots.push([x, z]);
  }

  // merry-go-round (you can hop on)
  s = freeSpot(center[0] + 4, center[1] + 17, 2.2);
  if (s) {
    const [x, z] = s, y = H(x, z);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 16), new THREE.MeshLambertMaterial({ color: pg.r }));
    disc.position.y = 0.3; disc.castShadow = true; grp.add(disc);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2, col = [pg.y, pg.b, pg.g, pg.y][i];
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), new THREE.MeshLambertMaterial({ color: col }));
      bar.position.set(Math.cos(a) * 1.1, 0.8, Math.sin(a) * 1.1); grp.add(bar);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), new THREE.MeshLambertMaterial({ color: pg.m }));
    hub.position.y = 0.9; grp.add(hub);
    g.root.add(grp);
    animated.push((dt) => { grp.rotation.y += dt * 0.8; });
    phys.add(circle(x, z, 1.5, 12), y, y + 0.42, { tag: 'merry' });
    spots.push([x, z]);
  }

  // monkey bars: two ladders and a row of bars you can also walk across the top of
  s = freeSpot(center[0] + 16, center[1] + 10, 3.2);
  if (s) {
    const [x, z] = s, y = H(x, z), yaw = 0.2, hgt = 2.2;
    for (const u of [-2, 2]) for (const v of [-0.45, 0.45]) {
      const [px, pz] = rot(x, z, yaw, u, v);
      box(pg.g, px, y + hgt / 2, pz, 0.1, hgt, 0.1, yaw);
    }
    for (const v of [-0.45, 0.45]) { const [px, pz] = rot(x, z, yaw, 0, v); box(pg.g, px, y + hgt, pz, 4.1, 0.1, 0.1, yaw); }
    for (let i = -8; i <= 8; i++) { const [px, pz] = rot(x, z, yaw, i * 0.24, 0); box(pg.y, px, y + hgt, pz, 0.06, 0.06, 0.95, yaw); }
    solid(x, z, 2.05, 0.5, yaw, y + hgt - 0.1, y + hgt + 0.05, 'bars');
    for (const u of [-2.4, 2.4]) {
      for (let i = 0; i < 5; i++) {
        const [px, pz] = rot(x, z, yaw, u + Math.sign(u) * (4 - i) * 0.3, 0), sy = y + (i + 1) * hgt / 5;
        box(pg.m, px, sy - 0.03, pz, 0.28, 0.06, 0.9, yaw);
        solid(px, pz, 0.15, 0.45, yaw, sy - 0.2, sy, 'step');
      }
    }
    spots.push([x, z]);
  }

  // play castle: stacked platforms with a pointy roof
  s = freeSpot(center[0] - 15, center[1] - 10, 3);
  if (s) {
    const [x, z] = s, y = H(x, z);
    const levels = [[1.2, 2.4, pg.b], [2.4, 1.6, pg.r]];
    for (const [hh, w, col] of levels) {
      box(col, x, y + hh - 0.08, z, w, 0.16, w);
      solid(x, z, w / 2, w / 2, 0, y + hh - 0.25, y + hh, 'castle');
      for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(pg.m, x + u * (w / 2 - 0.08), y + hh / 2, z + v * (w / 2 - 0.08), 0.12, hh, 0.12);
    }
    props.add(P.cone(4), pg.y, x, y + 3.2, z, 2.2, 1.3, 2.2, Math.PI / 4);
    // steps up to the first level
    for (let i = 0; i < 3; i++) { const sy = y + (i + 1) * 0.4; box(pg.y, x + 1.6 + (2 - i) * 0.35, sy - 0.05, z, 0.35, 0.1, 1); solid(x + 1.6 + (2 - i) * 0.35, z, 0.18, 0.5, 0, sy - 0.2, sy, 'step'); }
    spots.push([x, z]);
  }
  info.playground = spots;

  // ---------------------------------------------------------------- boardwalk benches and bins
  const tab = info.tablado[0];
  for (let i = 0; i < tab.length - 1; i++) {
    const [ax, az] = tab[i], [bx, bz] = tab[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    let nx = -uz, nz = ux;
    if (H((ax + bx) / 2 + nx * 6, (az + bz) / 2 + nz * 6) > H((ax + bx) / 2 - nx * 6, (az + bz) / 2 - nz * 6)) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(-uz, ux), dy = info.deckY;
    for (let t = 6; t < len - 4; t += 11) {
      // bench near the railing, facing the water
      const x = ax + ux * t + nx * 2.2, z = az + uz * t + nz * 2.2;
      box(0x2d6a4c, x, dy + 0.42, z, 1.6, 0.08, 0.45, yaw);
      box(0x2d6a4c, x - nx * 0.22, dy + 0.72, z - nz * 0.22, 1.6, 0.4, 0.06, yaw);
      for (const u of [-0.7, 0.7]) box(0x1f4a36, x + ux * u, dy + 0.2, z + uz * u, 0.08, 0.42, 0.45, yaw);
      solid(x, z, 0.8, 0.25, yaw, dy, dy + 0.46, 'bench');
      // green trash bin every other bench
      if (Math.round(t / 11) % 2 === 0) {
        const bx2 = x + ux * 1.6, bz2 = z + uz * 1.6;
        props.add(P.cyl(10), 0x2d6a4c, bx2, dy + 0.4, bz2, 0.5, 0.8, 0.5);
        props.add(P.cyl(10), 0x1f4a36, bx2, dy + 0.83, bz2, 0.55, 0.08, 0.55);
        solid(bx2, bz2, 0.25, 0.25, 0, dy, dy + 0.85, 'bin');
      }
    }
  }

  // ---------------------------------------------------------------- pergolas with picnic tables by the kiosks
  const ks = info.kiosks.slice().sort((a, b) => a.z - b.z);
  for (const k of ks.filter((_, i) => i % 3 === 1)) {
    const f = k.front;
    const back = [k.x - (f.x - k.x) * 1.0, k.z - (f.z - k.z) * 1.0];
    const sp = freeSpot(back[0], back[1], 2.8, 10);
    if (!sp) continue;
    const [x, z] = sp, y = H(x, z), yaw = k.yaw;
    for (const [u, v] of [[-1.8, -1.3], [-1.8, 1.3], [1.8, -1.3], [1.8, 1.3]]) {
      const [px, pz] = rot(x, z, yaw, u, v);
      box(0x2d6a4c, px, y + 1.25, pz, 0.14, 2.5, 0.14, yaw);
      solid(px, pz, 0.08, 0.08, yaw, y, y + 2.5, 'post');
    }
    for (let i = -5; i <= 5; i++) { const [px, pz] = rot(x, z, yaw, i * 0.36, 0); box(0x2d6a4c, px, y + 2.52, pz, 0.08, 0.1, 3.0, yaw); }
    for (const v of [-1.3, 1.3]) { const [px, pz] = rot(x, z, yaw, 0, v); box(0x1f4a36, px, y + 2.45, pz, 3.9, 0.14, 0.14, yaw); }
    solid(x, z, 1.9, 1.4, yaw, y + 2.4, y + 2.6, 'pergola');
    box(0xa8744a, x, y + 0.72, z, 2.2, 0.08, 0.9, yaw);
    for (const v of [-0.8, 0.8]) { const [px, pz] = rot(x, z, yaw, 0, v); box(0x8a5a3c, px, y + 0.42, pz, 2.2, 0.07, 0.35, yaw); }
    box(0x5a4636, x, y + 0.36, z, 0.12, 0.72, 0.12, yaw);
    solid(x, z, 1.1, 0.45, yaw, y, y + 0.76, 'table');
  }

  // ---------------------------------------------------------------- kiosk fronts: awning, serving counter, menu board
  // plain green metal awnings like the real kiosks (two shades so the ribs show)
  const AWN = [[0x3a9a86, 0x33897a]];
  ks.forEach((k, i) => {
    const f = k.front;
    if (!f) return;
    const nl = Math.hypot(f.nx, f.nz) || 1, nx = f.nx / nl, nz = f.nz / nl;
    const tx = -nz, tz = nx;
    // how wide is this side of the kiosk?
    const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
    const ox = nx * c - nz * s;
    const w = (Math.abs(ox) > 0.7 ? k.hz : k.hx) * 2;
    const yawT = Math.atan2(-tz, tx);
    const y0 = top(f.x + nx * 0.9, f.z + nz * 0.9); // where the vendor stands
    // striped awning sloping out over the counter
    const [ca, cb] = AWN[i % AWN.length];
    const stripes = 7;
    for (let j = 0; j < stripes; j++) {
      const u = (j + 0.5) / stripes - 0.5;
      box(j % 2 ? cb : ca, f.x + nx * 0.55 + tx * u * w * 0.9, k.eave - 0.95, f.z + nz * 0.55 + tz * u * w * 0.9, w * 0.9 / stripes + 0.01, 0.05, 1.15, yawT, -0.5);
    }
    // a solid serving counter in front of the vendor (the boardwalk in front stays clear for walkers)
    const qx = f.x + nx * 1.45, qz = f.z + nz * 1.45, qh = 1.05;
    box(0xcdb672, qx, y0 + qh / 2 - 0.1, qz, w * 0.7, qh + 0.2, 0.45, yawT);
    box(0x8a5a3c, qx, y0 + qh + 0.03, qz, w * 0.7 + 0.1, 0.07, 0.55, yawT);
    solid(qx, qz, w * 0.35, 0.23, yawT, y0 - 0.2, y0 + qh, 'counter');
    // a little menu chalkboard at the corner
    const mx = f.x + nx * 1.4 + tx * (w * 0.35 + 0.45), mz = f.z + nz * 1.4 + tz * (w * 0.35 + 0.45);
    box(0x1f3a2e, mx, top(mx, mz) + 0.5, mz, 0.6, 0.95, 0.07, yawT, 0.18);
    box(0x8a5a3c, mx, top(mx, mz) + 0.99, mz, 0.66, 0.06, 0.1, yawT, 0.18);
  });

  // ---------------------------------------------------------------- tarima (open-air stage)
  const north = tab[0][1] < tab[tab.length - 1][1] ? tab[0] : tab[tab.length - 1];
  const st = freeSpot(north[0] + 14, north[1] + 8, 4.2, 30);
  if (st) {
    const [x, z] = st, y = H(x, z), yaw = Math.atan2(north[0] - x, north[1] - z) + Math.PI / 2;
    const deck = y + 1.0;
    box(0x6a4a3a, x, y + 0.5, z, 6, 1.0, 4, yaw);
    solid(x, z, 3, 2, yaw, y - 0.3, deck, 'stage');
    for (let i = 0; i < 3; i++) { const [px, pz] = rot(x, z, yaw, 0, 2.3 + (2 - i) * 0.35); const sy = y + (i + 1) * 0.33; box(0x8a6a4a, px, sy - 0.05, pz, 2, 0.1, 0.35, yaw); solid(px, pz, 1, 0.18, yaw, sy - 0.2, sy, 'step'); }
    for (const [u, v] of [[-2.8, -1.8], [2.8, -1.8], [-2.8, 1.8], [2.8, 1.8]]) { const [px, pz] = rot(x, z, yaw, u, v); box(0x2d6a4c, px, deck + 1.4, pz, 0.18, 2.8, 0.18, yaw); solid(px, pz, 0.1, 0.1, yaw, deck, deck + 2.8, 'post'); }
    box(0x2d6a4c, x, deck + 2.9, z, 6.4, 0.2, 4.4, yaw);
    phys.addBox(x, z, 3.2, 2.2, yaw, deck + 2.8, deck + 3.0, { tag: 'roof' });
    // banner and speakers
    const [bx2, bz2] = rot(x, z, yaw, 0, -2.1);
    box(0xe3342f, bx2, deck + 2.55, bz2, 5.4, 0.5, 0.06, yaw);
    for (const u of [-2.4, 2.4]) { const [px, pz] = rot(x, z, yaw, u, 1.2); box(0x222222, px, deck + 0.6, pz, 0.7, 1.2, 0.6, yaw); }
    info.stage = { x, z, deck, yaw };
  }

  // ---------------------------------------------------------------- flowering bushes along park paths and roundabouts
  const flowers = [0xe3342f, 0xf27ba0, 0xf7c948, 0xff8a3d, 0xc2459a];
  const park = (data.world.park[0] || []).map(([x, y]) => L(x, y));
  let placed = 0;
  for (const fw of data.world.footways) {
    const pts = fw.map(([x, y]) => L(x, y));
    for (let i = 0; i < pts.length - 1 && placed < 220; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 1.5; t < len; t += 3.5 + R() * 3) {
        const side = R() < 0.5 ? -1 : 1;
        const x = ax + (bx - ax) * t / len - (bz - az) / len * 1.9 * side, z = az + (bz - az) * t / len + (bx - ax) / len * 1.9 * side;
        if (park.length && !inPoly(x, z, park) && R() < 0.7) continue;
        if (!clear(x, z, 0.8)) continue;
        const gy = H(x, z), sz = 0.6 + R() * 0.5;
        props.add(P.ico(0), 0x3f8f4a, x, gy + sz * 0.45, z, sz * 1.3, sz, sz * 1.3, R() * 6, 0, 0, 0.2);
        const fc = flowers[Math.floor(R() * flowers.length)];
        for (let k = 0; k < 5; k++) {
          const a = R() * 6.28, rr = sz * 0.5;
          props.add(P.ico(0), fc, x + Math.cos(a) * rr, gy + sz * (0.6 + R() * 0.35), z + Math.sin(a) * rr, 0.22, 0.22, 0.22, R() * 6);
        }
        placed++;
      }
    }
  }

  g.animals.push({ update: (dt, now) => { for (const f of animated) f(dt, now); } });
}

function circle(x, z, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  return out;
}

function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
