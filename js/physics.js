// Collision world: a terrain heightfield plus vertical polygon prisms.
// A prism is a polygon in XZ extruded from y0 to y1. With `roof > 0` its top is a hip roof:
// height rises by `roof` per unit of distance from the edge, capped at `cap` above y1.

export const STEP = 0.45;

export class Physics {
  constructor() {
    this.cols = [];
    this.cell = 6;
    this.grid = new Map();
    this.stamp = 0;
    this.terrainH = () => 0;
  }

  key(ix, iz) { return (ix + 5000) * 10007 + (iz + 5000); }

  add(pts, y0, y1, opts = {}) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const c = { pts, y0, y1, roof: opts.roof || 0, cap: opts.cap || 0, solid: opts.solid !== false,
      ground: opts.ground !== false, tag: opts.tag || null, data: opts.data || null, bounce: opts.bounce || 0,
      minx, maxx, minz, maxz, _s: 0, alive: true };
    this.cols.push(c);
    const s = this.cell;
    for (let ix = Math.floor(minx / s); ix <= Math.floor(maxx / s); ix++)
      for (let iz = Math.floor(minz / s); iz <= Math.floor(maxz / s); iz++) {
        const k = this.key(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, a = []);
        a.push(c);
      }
    return c;
  }

  addBox(cx, cz, hx, hz, yaw, y0, y1, opts) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
    return this.add(pts, y0, y1, opts);
  }

  remove(c) { c.alive = false; }

  near(x, z, r) {
    const s = this.cell, out = [];
    const st = ++this.stamp;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++)
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const a = this.grid.get(this.key(ix, iz));
        if (!a) continue;
        for (const c of a) {
          if (c._s === st || !c.alive) continue;
          c._s = st;
          if (x + r < c.minx || x - r > c.maxx || z + r < c.minz || z - r > c.maxz) continue;
          out.push(c);
        }
      }
    return out;
  }

  // distance to the polygon boundary, inside flag, and outward normal at the closest point
  sdist(c, x, z) {
    const p = c.pts, n = p.length;
    let inside = false, best = Infinity, nx = 0, nz = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, zi] = p[i], [xj, zj] = p[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      const ex = xi - xj, ez = zi - zj;
      const l2 = ex * ex + ez * ez || 1e-9;
      let t = ((x - xj) * ex + (z - zj) * ez) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = xj + ex * t, qz = zj + ez * t;
      const dx = x - qx, dz = z - qz, d = dx * dx + dz * dz;
      if (d < best) { best = d; nx = dx; nz = dz; }
    }
    const d = Math.sqrt(best);
    if (d > 1e-6) { nx /= d; nz /= d; } else { nx = 1; nz = 0; }
    if (inside) { nx = -nx; nz = -nz; }
    return { inside, d, nx, nz };
  }

  topAt(c, s) {
    if (!c.roof || !s.inside) return c.y1;
    return c.y1 + Math.min(s.d * c.roof, c.cap);
  }

  // highest walkable surface under (x,z) that is not above y + STEP
  groundAt(x, z, y, r = 0.25) {
    let h = this.terrainH(x, z), col = null;
    for (const c of this.near(x, z, r)) {
      if (!c.ground) continue;
      const s = this.sdist(c, x, z);
      if (!s.inside && s.d > r) continue;
      const top = this.topAt(c, s);
      if (top <= y + STEP && top > h) { h = top; col = c; }
    }
    return { h, col };
  }

  // highest surface at (x,z) regardless of height (for placing things)
  topMost(x, z) {
    let h = this.terrainH(x, z);
    for (const c of this.near(x, z, 0.1)) {
      if (!c.ground) continue;
      const s = this.sdist(c, x, z);
      if (s.inside) h = Math.max(h, this.topAt(c, s));
    }
    return h;
  }

  // push a vertical cylinder out of solid prisms; returns wall info
  resolve(p, r, hgt, vel) {
    let wall = null, ceil = false;
    for (const c of this.near(p.x, p.z, r + 0.5)) {
      if (!c.solid) continue;
      const s = this.sdist(c, p.x, p.z);
      if (!s.inside && s.d >= r) continue;
      const top = this.topAt(c, s);
      if (p.y >= top - STEP) continue;          // standing on it or stepping up
      if (p.y + hgt <= c.y0) continue;          // entirely below it
      if (p.y < c.y0 && s.inside) {             // bumped a ceiling
        if (vel.y > 0) { p.y = c.y0 - hgt; vel.y = 0; ceil = true; }
        continue;
      }
      const push = s.inside ? s.d + r : r - s.d;
      p.x += s.nx * push; p.z += s.nz * push;
      const vn = vel.x * s.nx + vel.z * s.nz;
      if (vn < 0) { vel.x -= vn * s.nx; vel.z -= vn * s.nz; }
      wall = { nx: s.nx, nz: s.nz, top: c.roof ? c.y1 : top, col: c };
    }
    return { wall, ceil };
  }

  // is a point inside solid geometry (used for camera occlusion)
  solidAt(x, y, z) {
    if (y < this.terrainH(x, z) - 0.05) return true;
    for (const c of this.near(x, z, 0)) {
      if (!c.solid || y < c.y0) continue;
      const s = this.sdist(c, x, z);
      if (s.inside && y < this.topAt(c, s)) return true;
    }
    return false;
  }

  // is a point inside tree foliage (canopies are walk-through, but the camera shouldn't sit in them)
  inFoliage(x, y, z) {
    for (const c of this.near(x, z, 1.8)) {
      if (c.tag !== 'canopy' && c.tag !== 'palmtop') continue;
      if (y < c.y0 - 2.2 || y > c.y1 + 1.0) continue;
      const s = this.sdist(c, x, z);
      if (s.inside || s.d < 1.6) return true;
    }
    return false;
  }

  raycast(ax, ay, az, bx, by, bz, steps = 24) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.solidAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return (i - 1) / steps;
    }
    return 1;
  }
}
