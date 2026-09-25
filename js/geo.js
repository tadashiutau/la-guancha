// Low-poly geometry helpers. Everything static is baked into a few vertex-colored meshes,
// split into spatial chunks so the camera can frustum-cull them.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const cache = new Map();
// flat-shaded, non-indexed primitive (position + normal only)
export function prim(name, make) {
  let g = cache.get(name);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.computeVertexNormals();
    cache.set(name, g);
  }
  return g;
}

export const P = {
  box: () => prim('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n = 8) => prim('cyl' + n, () => new THREE.CylinderGeometry(0.5, 0.5, 1, n)),
  cone: (n = 8) => prim('cone' + n, () => new THREE.ConeGeometry(0.5, 1, n)),
  ico: (d = 0) => prim('ico' + d, () => new THREE.IcosahedronGeometry(0.5, d)),
  sphere: (w = 8, h = 6) => prim(`sph${w}_${h}`, () => new THREE.SphereGeometry(0.5, w, h)),
  frustum: (top, n = 8) => prim(`fr${top}_${n}`, () => new THREE.CylinderGeometry(top * 0.5, 0.5, 1, n)),
  dodeca: () => prim('dod', () => new THREE.DodecahedronGeometry(0.5, 0)),
};

export function toColor(c) {
  if (c instanceof THREE.Color) return c;
  if (Array.isArray(c)) return _c.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  return _c.set(c);
}

export class Batch {
  constructor(chunk = 50) {
    this.chunk = chunk;
    this.chunks = new Map();
  }

  bucket(x, z) {
    const k = Math.floor(x / this.chunk) + ',' + Math.floor(z / this.chunk);
    let b = this.chunks.get(k);
    if (!b) this.chunks.set(k, b = { pos: [], nor: [], col: [] });
    return b;
  }

  // add a primitive with transform: position, yaw (ry), scale, optional pitch/roll
  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0, jitter = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addMatrix(geo, color, _m, jitter);
  }

  addMatrix(geo, color, m, jitter = 0) {
    const b = this.bucket(m.elements[12], m.elements[14]);
    _n.getNormalMatrix(m);
    const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
    const col = toColor(color);
    let r = col.r, g = col.g, bl = col.b;
    const e = m.elements, ne = _n.elements;
    for (let i = 0; i < pa.length; i += 3) {
      const x = pa[i], y = pa[i + 1], z = pa[i + 2];
      b.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const nx = na[i], ny = na[i + 1], nz = na[i + 2];
      let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz, oy = ne[1] * nx + ne[4] * ny + ne[7] * nz, oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(ox, oy, oz) || 1;
      b.nor.push(ox / l, oy / l, oz / l);
      if (jitter && i % 9 === 0) {
        const j = 1 + (Math.random() - 0.5) * jitter;
        r = col.r * j; g = col.g * j; bl = col.b * j;
      }
      b.col.push(r, g, bl);
    }
  }

  // raw triangles in world space: tris = flat [x,y,z,...] (3 verts per tri)
  addTris(tris, color) {
    if (!tris.length) return;
    const b = this.bucket(tris[0], tris[2]);
    const col = toColor(color);
    for (let i = 0; i < tris.length; i += 9) {
      const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
      const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
      const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 9; k++) b.pos.push(tris[i + k]);
      for (let k = 0; k < 3; k++) { b.nor.push(nx, ny, nz); b.col.push(col.r, col.g, col.b); }
    }
  }

  build(material, { cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    for (const b of this.chunks.values()) {
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.chunks.clear();
    return group;
  }
}

// ---- polygon helpers (XZ world space)
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

export function ccw(pts) { return polyArea(pts) < 0 ? pts.slice().reverse() : pts; }

// extruded polygon: walls (+ optional top cap) as triangles
export function prismTris(pts, y0, y1, top = true, bottom = false) {
  const t = [];
  const p = pts;
  const n = p.length;
  const cw = polyArea(p) > 0; // orientation in XZ (x right, z down)
  for (let i = 0; i < n; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % n];
    if (cw) t.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    else t.push(ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz);
  }
  if (top || bottom) {
    const v2 = p.map(([x, z]) => new THREE.Vector2(x, z));
    const f = THREE.ShapeUtils.triangulateShape(v2, []);
    for (const [a, b, c] of f) {
      const A = p[a], B = p[b], C = p[c];
      // make top faces point up
      const up = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0;
      if (top) {
        if (up) t.push(A[0], y1, A[1], B[0], y1, B[1], C[0], y1, C[1]);
        else t.push(A[0], y1, A[1], C[0], y1, C[1], B[0], y1, B[1]);
      }
      if (bottom) {
        if (up) t.push(A[0], y0, A[1], C[0], y0, C[1], B[0], y0, B[1]);
        else t.push(A[0], y0, A[1], B[0], y0, B[1], C[0], y0, C[1]);
      }
    }
  }
  return t;
}

// hip roof over a rotated rectangle: center, half sizes, yaw, eave height, slope, max rise, overhang
export function hipRoofTris(cx, cz, hx, hz, yaw, y, slope, cap, over = 0.3) {
  hx += over; hz += over;
  const rise = Math.min(Math.min(hx, hz) * slope, cap);
  const d = rise / slope;
  const ix = hx - d, iz = hz - d;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P2 = (x, z, yy) => [cx + x * c + z * s, yy, cz - x * s + z * c];
  const o = [P2(-hx, -hz, y), P2(hx, -hz, y), P2(hx, hz, y), P2(-hx, hz, y)];
  const i = [P2(-ix, -iz, y + rise), P2(ix, -iz, y + rise), P2(ix, iz, y + rise), P2(-ix, iz, y + rise)];
  const t = [];
  const q = (a, b, cc, dd) => { t.push(...a, ...cc, ...b, ...a, ...dd, ...cc); };
  q(o[0], o[1], i[1], i[0]);
  q(o[1], o[2], i[2], i[1]);
  q(o[2], o[3], i[3], i[2]);
  q(o[3], o[0], i[0], i[3]);
  if (ix > 0.01 && iz > 0.01) q(i[0], i[1], i[2], i[3]);
  // underside of the overhang
  t.push(...o[0], ...o[1], ...o[2], ...o[0], ...o[2], ...o[3]);
  return fixWinding(t, cx, y - 1, cz);
}

// orient triangles to face away from a reference point (cheap and good enough for convex roofs)
function fixWinding(t, rx, ry, rz) {
  for (let k = 0; k < t.length; k += 9) {
    const ax = t[k], ay = t[k + 1], az = t[k + 2];
    const ux = t[k + 3] - ax, uy = t[k + 4] - ay, uz = t[k + 5] - az;
    const vx = t[k + 6] - ax, vy = t[k + 7] - ay, vz = t[k + 8] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (ax + t[k + 3] + t[k + 6]) / 3 - rx, my = (ay + t[k + 4] + t[k + 7]) / 3 - ry, mz = (az + t[k + 5] + t[k + 8]) / 3 - rz;
    if (nx * mx + ny * my + nz * mz < 0) {
      for (let j = 0; j < 3; j++) { const tmp = t[k + 3 + j]; t[k + 3 + j] = t[k + 6 + j]; t[k + 6 + j] = tmp; }
    }
  }
  return t;
}

// seeded random
export function rng(seed = 1) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
