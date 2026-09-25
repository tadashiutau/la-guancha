// The jíbaro explorer: an Odyssey-style character controller with a throwable pava (straw hat).
import * as THREE from 'three';
import { STEP } from './physics.js';
import { buildFigure, STYLES, FACES, TOPS } from './figure.js';

const RUN = 8.2, SWIM = 4.6, GRAV_UP = 27, GRAV_DOWN = 40, TERMINAL = -32;
const WATER_Y = 0, FLOAT_Y = -0.6;

const lam = c => new THREE.MeshLambertMaterial({ color: c });
function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function makeHat(style = 'straw') {
  const g = new THREE.Group();
  const gold = style === 'gold';
  const straw = gold ? new THREE.MeshPhongMaterial({ color: 0xe8b830, specular: 0xfff0b0, shininess: 60 }) : lam(0xe9cf86);
  const band = lam(gold ? 0x2f6fcf : 0x9b3b2a);
  part(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 16), straw, 0, 0, 0, g);
  part(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 12), straw, 0, 0.11, 0, g);
  part(new THREE.CylinderGeometry(0.201, 0.201, 0.05, 12), band, 0, 0.04, 0, g);
  return g;
}

// the player's figure (see figure.js): blinking eyes, the pava sits in hatSlot
export function makeModel(look) {
  return buildFigure(look, { blink: true });
}

// the look you pick in the character creator
export const CHAR_DEFAULT = {
  skin: 0x9c6a48, hair: 0x1f1a16, eyes: 0x4a2e1c, style: 'corto', face: 'bigote', glasses: 'nada',
  build: 'normal', height: 'normal', extra: 'nada',
  top: 'guayabera', shirt: 0xfbfaf4, legs: 'cortos', shorts: 0xc9b48a, shoes: 'tenis',
};
export const CHAR_OPTIONS = {
  skin: [0xf6d3b3, 0xf1c9a5, 0xe0ac84, 0xc68a62, 0xb07a55, 0x9c6a48, 0x7a4e32, 0x5a3622],
  eyes: [0x4a2e1c, 0x2a1a10, 0x7a5a2a, 0x5a7a3a, 0x3a6a9a, 0x6a7a80],
  face: FACES,
  glasses: ['nada', 'lentes', 'sol'],
  style: STYLES,
  hair: [0x1f1a16, 0x3a2418, 0x6a3f22, 0x9a5a2a, 0xc89a50, 0xe8c878, 0x9a3a1a, 0xb8b4ac, 0xece8e0, 0x2f5fbf, 0xd8508a],
  build: ['flaco', 'normal', 'fornido', 'gordito'],
  height: ['bajito', 'normal', 'alto'],
  extra: ['nada', 'cadena', 'arete', 'reloj'],
  top: TOPS,
  shirt: [0xfbfaf4, 0xf2c6d6, 0x9fd3e8, 0xf7e08a, 0xb8e0a8, 0xd12b2b, 0x2f6fcf, 0xf28b3a, 0x7a4ab8, 0x2b2b2b],
  legs: ['cortos', 'largos'],
  shorts: [0xc9b48a, 0x2f3f5f, 0x4a6fa5, 0x6a6a6a, 0x5a7a3a, 0x8a4a2a, 0xf4f2ec, 0x1d1d1d],
  shoes: ['tenis', 'chancletas', 'zapatos'],
};
// outfits from Doña Carmen's wardrobe change only the clothes ('default' = your own)
export const OUTFITS = {
  ponce: { shirt: 0xd12b2b, shorts: 0x1d1d1d, top: 'polo' },
  playa: { shirt: 0x3fb8b0, shorts: 0xf2a93b, top: 'hawaiana' },
  pescador: { shirt: 0xb8a878, shorts: 0x2f3f5f, top: 'guayabera', legs: 'largos' },
  bandera: { shirt: 0x2f6fcf, shorts: 0xf4f2ec, top: 'camiseta' },
  vejigante: { shirt: 0xf7c948, shorts: 0xd8262f, top: 'camiseta', legs: 'largos' },
};

export class Player {
  constructor(scene, phys, sfx) {
    this.scene = scene; this.phys = phys; this.sfx = sfx;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.face = 0;
    this.r = 0.32; this.h = 1.15;
    this.state = 'ground';
    this.t = 0;              // time in state
    this.chain = 0; this.chainT = 0;
    this.coyote = 0; this.jumpBuf = 0; this.cut = false;
    this.flip = 0; this.flipDir = 0; this.flipDur = 0;
    this.poundLand = 0; this.hatJumped = false; this.airHat = false;
    this.wall = null; this.wallT = 0;
    this.squash = 0;
    this.frozen = 0;
    this.groundCol = null;
    this.events = [];        // 'pound', 'land', 'jump', 'splash'
    this.look = 'default';
    this.char = { ...CHAR_DEFAULT };
    this.m = makeModel(this.char);
    scene.add(this.m.root);
    this.hatStyle = 'straw';
    this.hatMesh = makeHat();
    this.m.hatSlot.add(this.hatMesh);
    this.hat = { state: 'on', pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, spin: 0 };
    // blob shadow for depth perception while jumping
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.renderOrder = 3;
    scene.add(sh);
    this.blob = sh;
    this.phase = 0;
  }

  // outfit name ('default' = the clothes picked in the character creator)
  setLook(name) {
    this.look = OUTFITS[name] ? name : 'default';
    this.rebuild();
  }

  setChar(char) {
    this.char = { ...CHAR_DEFAULT, ...char };
    this.rebuild();
  }

  rebuild() {
    const was = this.m.root;
    const hat = this.hatMesh;
    this.m = makeModel({ ...this.char, ...(OUTFITS[this.look] || {}) });
    this.scene.remove(was);
    this.scene.add(this.m.root);
    if (this.hat.state === 'on') { this.m.hatSlot.add(hat); hat.position.set(0, 0, 0); }
    was.traverse(o => { if (o.isMesh && o !== hat && !hat.getObjectById(o.id)) o.geometry.dispose(); });
  }

  // swap the pava (straw or the golden one from the shop), wherever it is right now
  setHat(style) {
    const old = this.hatMesh;
    this.hatMesh = makeHat(style);
    this.hatMesh.position.copy(old.position);
    this.hatMesh.rotation.copy(old.rotation);
    old.parent?.add(this.hatMesh);
    old.parent?.remove(old);
    this.hatStyle = style;
  }

  teleport(x, y, z, face = this.face) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.face = face;
    this.state = 'air'; this.t = 0;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get grounded() { return this.state === 'ground' || this.state === 'slide'; }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + 0.55, this.pos.z); }

  inWater() {
    return this.pos.y < WATER_Y - 0.4 && this.phys.terrainH(this.pos.x, this.pos.z) < -0.75;
  }

  update(dt, inp, camYaw) {
    const P = this.pos, V = this.vel;
    this.events.length = 0;
    this.t += dt;
    if (this.chainT > 0) this.chainT -= dt;
    if (this.poundLand > 0) this.poundLand -= dt;
    if (this.squash > 0) this.squash -= dt;
    this.jumpBuf = inp.jumpPressed ? 0.13 : Math.max(0, this.jumpBuf - dt);

    // wish direction relative to the camera
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let wx = fx * inp.my + Math.cos(camYaw) * inp.mx;
    let wz = fz * inp.my - Math.sin(camYaw) * inp.mx;
    let wl = Math.hypot(wx, wz);
    if (this.frozen > 0) { this.frozen -= dt; wx = wz = wl = 0; inp = { mx: 0, my: 0 }; }
    const mag = Math.min(1, wl);
    if (wl > 1e-3) { wx /= wl; wz /= wl; }

    const st = this.state;
    if (st === 'ground' || st === 'slide') this.updateGround(dt, inp, wx, wz, mag);
    else if (st === 'swim') this.updateSwim(dt, inp, wx, wz, mag);
    else this.updateAir(dt, inp, wx, wz, mag);

    // integrate and collide
    const oldX = P.x, oldZ = P.z;
    P.x += V.x * dt; P.z += V.z * dt;
    P.y += V.y * dt;
    const res = this.phys.resolve(P, this.r, this.h, V);
    this.wall = res.wall;
    // terrain acts as a wall where it rises more than a step
    const th = this.phys.terrainH(P.x, P.z);
    if (th > P.y + STEP && this.state !== 'ground') {
      this.terrainWall(oldX, oldZ);
    } else if (th > P.y + STEP) {
      this.terrainWall(oldX, oldZ);
    }
    this.clampBounds();

    // ground detection
    const g = this.phys.groundAt(P.x, P.z, P.y, 0.22);
    this.groundH = g.h;
    const wasGround = this.grounded;
    if (this.state !== 'swim') {
      if (V.y <= 0 && P.y <= g.h + 0.02 && (wasGround ? P.y > g.h - STEP - 0.1 : true)) {
        const hard = V.y < -12;
        P.y = g.h;
        if (!wasGround) this.land(g.col, hard);
        V.y = 0;
        this.groundCol = g.col;
      } else if (wasGround && P.y - g.h < STEP && V.y <= 0) {
        P.y = g.h; // stick to slopes and steps going down
        this.groundCol = g.col;
      } else if (wasGround) {
        this.state = 'air'; this.t = 0; this.coyote = 0.1; this.chain = 0;
      }
    }

    // mantle up ledges when airborne or swimming against a wall
    if ((this.state === 'air' || this.state === 'swim' || this.state === 'wall') && mag > 0.3 && V.y < 9) this.tryMantle(wx, wz);

    // water entry
    if (this.state !== 'swim' && this.inWater() && this.state !== 'pound' || (this.state === 'pound' && this.inWater() && this.t > 0.6)) {
      if (this.state !== 'swim') {
        this.state = 'swim'; this.t = 0;
        this.events.push('splash');
        V.y *= 0.25; V.x *= 0.5; V.z *= 0.5;
        this.flip = 0;
      }
    }

    this.updateHat(dt, inp);
    this.animate(dt, mag);
  }

  terrainWall(oldX, oldZ) {
    const P = this.pos, V = this.vel;
    const lim = P.y + STEP;
    const H = this.phys.terrainH;
    if (H(P.x, oldZ) <= lim) { P.z = oldZ; V.z = 0; }
    else if (H(oldX, P.z) <= lim) { P.x = oldX; V.x = 0; }
    else { P.x = oldX; P.z = oldZ; V.x = V.z = 0; }
    // expose a wall normal (terrain gradient) for wall jumps and mantles
    const e = 0.5;
    const gx = H(P.x + e, P.z) - H(P.x - e, P.z), gz = H(P.x, P.z + e) - H(P.x, P.z - e);
    const l = Math.hypot(gx, gz) || 1;
    this.wall = { nx: -gx / l, nz: -gz / l, terrain: true };
  }

  clampBounds() {
    const b = this.bounds;
    if (!b) return;
    this.pos.x = Math.max(b.x0, Math.min(b.x1, this.pos.x));
    this.pos.z = Math.max(b.z0, Math.min(b.z1, this.pos.z));
  }

  land(col, hard) {
    const V = this.vel;
    if (col && col.bounce) {
      V.y = col.bounce; this.state = 'air'; this.t = 0; this.cut = true; this.flip = 0;
      this.events.push('bounce');
      return;
    }
    const from = this.state;
    this.state = 'ground'; this.t = 0;
    this.hatJumped = false; this.airHat = false;
    this.flip = 0;
    if (from === 'pound') {
      this.poundLand = 0.3; this.squash = 0.2;
      this.events.push('pound');
      V.x = V.z = 0;
    } else if (from === 'dive') {
      this.state = 'slide'; this.t = 0;
      this.events.push('land');
    } else {
      this.squash = hard ? 0.18 : 0.1;
      this.events.push('land');
      if (this.chain > 0) this.chainT = 0.22;
    }
  }

  faceToward(wx, wz, rate, dt) {
    const target = Math.atan2(wx, wz);
    let d = target - this.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.face += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  updateGround(dt, inp, wx, wz, mag) {
    const V = this.vel;
    const crouch = inp.crouch;
    if (this.state === 'slide') {
      const k = Math.max(0, 1 - dt * 3);
      V.x *= k; V.z *= k;
      if (this.t > 0.45 || this.speed < 1) { this.state = 'ground'; this.t = 0; }
      if (this.jumpBuf > 0) { this.jumpBuf = 0; this.doJump(9.5, 0); }
      return;
    }
    let target = crouch ? 2.2 : RUN;
    const tx = wx * target * mag, tz = wz * target * mag;
    const acc = mag > 0.05 ? 42 : 36;
    const dx = tx - V.x, dz = tz - V.z, dl = Math.hypot(dx, dz);
    const step = Math.min(dl, acc * dt);
    if (dl > 1e-4) { V.x += dx / dl * step; V.z += dz / dl * step; }
    if (mag > 0.05) this.faceToward(wx, wz, 14, dt);

    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      const sp = this.speed;
      const fx = Math.sin(this.face), fz = Math.cos(this.face);
      if (this.poundLand > 0) {
        this.doJump(17.5, 0); this.flip = 1; this.flipDir = 1; this.flipDur = 0.7;
        this.events.push('bigjump');
      } else if (crouch && sp < 3) {
        this.doJump(17, 0);
        V.x = -fx * 2.5; V.z = -fz * 2.5;
        this.flip = 1; this.flipDir = -1; this.flipDur = 0.75;
        this.events.push('bigjump');
      } else if (crouch) {
        this.doJump(8.5, 0);
        const s = Math.max(sp + 5, 14);
        V.x = fx * s; V.z = fz * s;
        this.longJump = true;
        this.events.push('longjump');
      } else {
        this.chain = this.chainT > 0 && sp > 4 ? Math.min(this.chain + 1, 3) : 1;
        if (this.chain === 3 && sp < 6) this.chain = 1;
        this.doJump([11, 13.2, 16.5][this.chain - 1], this.chain);
        if (this.chain === 3) { this.flip = 1; this.flipDir = 1; this.flipDur = 0.8; this.events.push('bigjump'); }
      }
      return;
    }
    if (inp.hatPressed && this.hat.state === 'on') this.throwHat();
  }

  doJump(vy, chain) {
    this.vel.y = vy;
    this.state = 'air'; this.t = 0;
    this.cut = chain === 0; // special jumps have fixed height
    this.longJump = false;
    this.coyote = 0;
    this.events.push('jump');
  }

  updateAir(dt, inp, wx, wz, mag) {
    const V = this.vel;
    const st = this.state;
    if (this.coyote > 0) {
      this.coyote -= dt;
      if (this.jumpBuf > 0) { this.jumpBuf = 0; this.chain = 1; this.doJump(11, 1); return; }
    }
    if (st === 'pound') {
      if (this.t < 0.28) { V.set(0, 0, 0); if (this.t > 0.2 && inp.hatPressed) this.startDive(); return; }
      V.y = -30;
      if (inp.hatPressed) this.startDive();
      return;
    }
    if (st === 'wall') {
      if (!this.wall || this.t > 1.2) { this.state = 'air'; this.t = 0; }
      else {
        V.y = Math.max(V.y - 20 * dt, -3.5);
        this.face = Math.atan2(-this.wall.nx, -this.wall.nz);
        if (this.jumpBuf > 0) {
          this.jumpBuf = 0;
          const n = this.wall;
          this.face = Math.atan2(n.nx, n.nz);
          this.vel.x = n.nx * 8; this.vel.z = n.nz * 8;
          this.doJump(13.5, 0);
          this.wallCooldown = 0.25;
          this.events.push('walljump');
        }
        // pushing away from the wall releases
        if (mag > 0.3 && wx * this.wall.nx + wz * this.wall.nz > 0.5) { this.state = 'air'; this.t = 0; }
        return;
      }
    }
    // gravity with a floatier rise while the button is held
    const rising = V.y > 0;
    let g = rising && inp.jump ? GRAV_UP : GRAV_DOWN;
    if (st === 'dive') g = 30;
    V.y = Math.max(TERMINAL, V.y - g * dt);
    if (!this.cut && rising && !inp.jump && V.y > 3) { V.y *= 0.5; this.cut = true; }

    // air control; never slow a fast jump down, only steer it
    const acc = st === 'dive' ? 4 : this.longJump ? 10 : 22;
    const sp = this.speed, cap = Math.max(RUN, sp);
    V.x += wx * mag * acc * dt; V.z += wz * mag * acc * dt;
    const ns = Math.hypot(V.x, V.z);
    if (ns > cap) { V.x *= cap / ns; V.z *= cap / ns; }
    if (mag > 0.05 && st !== 'dive' && !this.flip) this.faceToward(wx, wz, 7, dt);

    if (this.wallCooldown > 0) this.wallCooldown -= dt;
    if (this.wall && !this.wall.terrain && V.y < 3 && st === 'air' && !(this.wallCooldown > 0) && this.wall.col && this.wall.col.tag !== 'rail'
      && this.wall.col.tag !== 'trunk' && this.wall.col.tag !== 'lamp' && this.wall.col.tag !== 'mast' && this.wall.col.y1 - this.wall.col.y0 > 1.2) {
      const into = -(V.x * this.wall.nx + V.z * this.wall.nz);
      if (into > -0.5 && mag > 0.3) { this.state = 'wall'; this.t = 0; this.flip = 0; V.x = V.z = 0; return; }
    }
    if (inp.crouchPressed && st === 'air') {
      this.state = 'pound'; this.t = 0; this.flip = 0; V.set(0, 0, 0);
      this.events.push('poundstart');
      return;
    }
    if (inp.hatPressed && this.hat.state === 'on' && !this.airHat) {
      this.airHat = true;
      this.throwHat();
      if (V.y < 4) V.y = 4; // Odyssey-style little lift on an air throw
    }
  }

  startDive() {
    const fx = Math.sin(this.face), fz = Math.cos(this.face);
    this.state = 'dive'; this.t = 0;
    this.vel.set(fx * 13.5, 6.5, fz * 13.5);
    this.cut = true;
    this.events.push('dive');
  }

  updateSwim(dt, inp, wx, wz, mag) {
    const P = this.pos, V = this.vel;
    const tx = wx * SWIM * mag, tz = wz * SWIM * mag;
    V.x += (tx - V.x) * Math.min(1, dt * 3);
    V.z += (tz - V.z) * Math.min(1, dt * 3);
    if (mag > 0.05) this.faceToward(wx, wz, 6, dt);
    const nearSurface = P.y > FLOAT_Y - 0.35;
    if (inp.crouch) V.y += (-4.5 - V.y) * Math.min(1, dt * 4);
    else V.y += ((FLOAT_Y - P.y) * 3.5 - V.y) * Math.min(1, dt * 3);
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      if (nearSurface) { this.doJump(12.5, 0); this.events.push('splash'); this.cut = false; this.chain = 0; return; }
      V.y = 6; this.events.push('stroke');
    }
    const floor = this.phys.terrainH(P.x, P.z);
    if (P.y < floor) { P.y = floor; if (V.y < 0) V.y = 0; }
    // wading in shallow water or climbing onto something
    const g = this.phys.groundAt(P.x, P.z, P.y, 0.22);
    if (g.h > FLOAT_Y - 0.1 && P.y <= g.h + 0.05 && !this.inWater()) { P.y = g.h; this.state = 'ground'; this.t = 0; V.y = 0; }
    if (!this.inWater() && P.y > WATER_Y - 0.35) { this.state = 'air'; this.t = 0; }
    if (inp.hatPressed && this.hat.state === 'on') this.throwHat();
  }

  tryMantle(wx, wz) {
    if (!this.wall) return;
    const n = this.wall;
    if (wx * n.nx + wz * n.nz > -0.3) return;
    const P = this.pos;
    const reach = this.state === 'swim' ? 2.3 : 1.35;
    const ax = P.x - n.nx * (this.r + 0.35), az = P.z - n.nz * (this.r + 0.35);
    const g = this.phys.groundAt(ax, az, P.y + reach, 0.1);
    const d = g.h - P.y;
    if (d > STEP * 0.8 && d < reach && g.h > WATER_Y - 0.2) {
      // room to stand?
      if (this.phys.solidAt(ax, g.h + 0.6, az)) return;
      P.x = ax; P.z = az; P.y = g.h;
      this.vel.set(0, 0, 0);
      this.state = 'ground'; this.t = 0; this.flip = 0; this.chain = 0;
      this.squash = 0.12;
      this.events.push('mantle');
    }
  }

  // ------------------------------------------------ hat
  throwHat() {
    const h = this.hat;
    const fx = Math.sin(this.face), fz = Math.cos(this.face);
    h.state = 'out'; h.t = 0;
    h.pos.set(this.pos.x + fx * 0.5, this.pos.y + 0.75, this.pos.z + fz * 0.5);
    h.vel.set(fx * 22, 0, fz * 22);
    h.out = 0.24;
    // aim assist: touch controls are imprecise, so the pava homes in on the best target
    // roughly in front (crates, coconuts, pelicans...), up and down included
    let best = null, bestScore = Infinity;
    for (const tg of this.aimTargets?.() || []) {
      const dx = tg.x - h.pos.x, dy = tg.y - h.pos.y, dz = tg.z - h.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 10 || d < 0.3 || dy < -3 || dy > 8) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.45) continue; // within about 63 degrees of facing
      const score = d * (2 - cos);
      if (score < bestScore) { bestScore = score; best = tg; }
    }
    if (best) {
      const d = new THREE.Vector3(best.x - h.pos.x, best.y - h.pos.y, best.z - h.pos.z);
      const l = d.length();
      h.vel.copy(d.multiplyScalar(22 / l));
      h.out = Math.min(0.5, l / 22 + 0.05);
      this.face = Math.atan2(h.vel.x, h.vel.z);
    }
    this.m.hatSlot.remove(this.hatMesh);
    this.scene.add(this.hatMesh);
    this.throwAnim = 0.25;
    this.events.push('hat');
  }

  updateHat(dt, inp) {
    const h = this.hat;
    if (h.state === 'on') return;
    h.t += dt;
    h.spin += dt * 25;
    if (h.state === 'out') {
      h.pos.addScaledVector(h.vel, dt);
      if (h.t > (h.out || 0.24) || this.phys.solidAt(h.pos.x, h.pos.y, h.pos.z)) { h.state = 'hover'; h.t = 0; }
    } else if (h.state === 'hover') {
      const hold = inp.hat ? 1.1 : 0.5;
      if (h.t > hold) { h.state = 'back'; h.t = 0; }
    } else if (h.state === 'back') {
      const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
      const d = target.sub(h.pos);
      const l = d.length();
      if (l < 0.7) { h.state = 'on'; this.hatMesh.position.set(0, 0, 0); this.hatMesh.rotation.set(0, 0, 0); this.m.hatSlot.add(this.hatMesh); return; }
      h.pos.addScaledVector(d, Math.min(1, (26 + h.t * 30) * dt / l));
    }
    // bounce off the hat (Odyssey's cap jump)
    if ((h.state === 'out' || h.state === 'hover') && !this.grounded && this.state !== 'swim' && !this.hatJumped) {
      const dx = this.pos.x - h.pos.x, dz = this.pos.z - h.pos.z, dy = this.pos.y + 0.2 - h.pos.y;
      if (dx * dx + dz * dz < 0.9 && Math.abs(dy) < 0.7 && this.vel.y <= 3) {
        this.hatJumped = true;
        this.state = 'air'; this.t = 0; this.flip = 0;
        this.vel.y = 13; this.cut = true;
        h.state = 'back'; h.t = 0;
        this.events.push('hatjump');
      }
    }
    this.hatMesh.position.copy(h.pos);
    this.hatMesh.rotation.set(0.15, h.spin, 0);
  }

  // ------------------------------------------------ animation
  animate(dt, mag) {
    const m = this.m, P = this.pos, V = this.vel, st = this.state;
    m.root.position.copy(P);
    m.root.rotation.y = this.face;
    const sp = this.speed;
    const k = Math.min(1, sp / RUN);
    const lastStep = Math.floor(this.phase / Math.PI);
    this.phase += dt * (4 + sp * 1.5);
    if (st === 'ground' && sp > 1.5 && Math.floor(this.phase / Math.PI) !== lastStep) {
      const tag = this.groundCol?.tag;
      this.events.push(tag === 'deck' || tag === 'step' || tag === 'pier' || tag === 'roof' || tag === 'towertop' ? 'stepwood' : 'step');
    }
    const s = Math.sin(this.phase);
    let bodyX = 0, bodyZ = 0, bodyY = 0.52;
    let armX = [0, 0], armZ = [0.1, -0.1], legX = [0, 0];
    if (this.throwAnim > 0) this.throwAnim -= dt;
    if (st === 'ground') {
      legX = [s * 0.9 * k, -s * 0.9 * k];
      armX = [-s * 0.8 * k, s * 0.8 * k];
      bodyX = k * 0.15;
      bodyY += Math.abs(Math.cos(this.phase)) * 0.05 * k;
    } else if (st === 'slide') {
      bodyX = 1.35; bodyY = 0.2; armX = [-2.8, -2.8]; legX = [0.2, 0.2];
    } else if (st === 'air') {
      legX = [0.6, -0.4]; armX = [-2.4, 0.5]; armZ = [0.3, -0.3];
      if (V.y < 0) { legX = [0.2, 0.1]; armX = [-1.2, -1.2]; armZ = [0.9, -0.9]; }
      if (this.longJump) { bodyX = 0.9; armX = [-2.6, -2.6]; legX = [0.9, 0.9]; }
    } else if (st === 'pound') {
      if (this.t < 0.28) bodyX = (this.t / 0.28) * Math.PI * 2;
      legX = [-1.6, -1.6]; armX = [-0.5, -0.5]; armZ = [1.0, -1.0];
    } else if (st === 'dive') {
      bodyX = 1.4; armX = [-3.0, -3.0]; legX = [0.1, 0.1];
    } else if (st === 'wall') {
      armX = [-2.6, -0.4]; armZ = [0.4, -0.8]; legX = [0.5, -0.3];
    } else if (st === 'swim') {
      const sw = Math.sin(this.phase * 0.6);
      bodyX = mag > 0.1 ? 1.2 : 0.3;
      armX = [-1.5 + sw * 1.4, -1.5 - sw * 1.4];
      legX = [sw * 0.6, -sw * 0.6];
      bodyY = 0.35;
    }
    if (this.flip && st === 'air') {
      const t = Math.min(1, this.t / this.flipDur);
      bodyX = this.flipDir * t * Math.PI * 2;
      legX = [-1.2, -1.2]; armX = [-1, -1];
      if (t >= 1) this.flip = 0;
    }
    if (this.throwAnim > 0) { armX[1] = -1.6; armZ[1] = -1.2 + this.throwAnim * 4; }
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      armX = [-3, -3]; armZ = [0.3, -0.3]; legX = [0.3, -0.3];
    }
    // idling: breathe, blink, look around, and after a while fidget (wipe the brow in the heat,
    // stretch, tap a foot, peek at the sky) and finally sit down for a rest
    let headY = 0, headX = 0, legZ = [0, 0];
    const idle = st === 'ground' && sp < 0.3 && mag < 0.1 && !(this.throwAnim > 0) && !(this.celebrate > 0) && this.hat.state === 'on';
    this.idleT = idle ? (this.idleT || 0) + dt : 0;
    const now = performance.now() / 1000;
    if (idle && this.idleT > 0.4) {
      const breathe = Math.sin(now * 2.1);
      bodyY += breathe * 0.008;
      armZ = [0.12 + breathe * 0.03, -0.12 - breathe * 0.03];
      m.torso.scale.set(1 + breathe * 0.02, 1, 1 + breathe * 0.02);
      // glance around now and then
      if (!this.lookT || now > this.lookT) { this.lookT = now + 2 + Math.random() * 3; this.lookTo = (Math.random() - 0.5) * 1.4; }
      this.lookY = (this.lookY || 0) + ((this.lookTo || 0) - (this.lookY || 0)) * Math.min(1, dt * 3);
      headY = this.lookY;
      // a fidget every few seconds once you've stood still a while
      if (this.idleT > 5 && !this.fidget && now > (this.fidgetNext || 0)) {
        this.fidget = ['brow', 'stretch', 'tap', 'sky'][Math.floor(Math.random() * 4)];
        this.fidgetT = 0;
      }
      if (this.fidget) {
        this.fidgetT += dt;
        const T = { brow: 2.2, stretch: 2.4, tap: 2.4, sky: 2.6 }[this.fidget];
        const e = Math.sin(Math.min(1, this.fidgetT / T) * Math.PI); // ease in and out
        if (this.fidget === 'brow') {
          // wipe the forehead: it's hot in Ponce
          armX[1] = -2.5 * e; armZ[1] = -0.2 - 1.1 * e + Math.sin(this.fidgetT * 9) * 0.15 * e;
          headX = -0.1 * e;
        } else if (this.fidget === 'stretch') {
          armX = [-3.0 * e, -3.0 * e]; armZ = [0.35 * e, -0.35 * e];
          bodyY += 0.03 * e; headX = -0.35 * e; bodyZ = Math.sin(this.fidgetT * 3) * 0.08 * e;
        } else if (this.fidget === 'tap') {
          legX[0] = -Math.abs(Math.sin(this.fidgetT * 8)) * 0.35 * e;
          armZ = [0.5 * e, -0.5 * e]; armX = [0.3 * e, 0.3 * e]; // hands on the hips
        } else if (this.fidget === 'sky') {
          headX = -0.55 * e; headY *= 1 - e; armX[1] = -2.2 * e; armZ[1] = -0.5 * e; // shading the eyes
        }
        if (this.fidgetT > T) { this.fidget = null; this.fidgetNext = now + 3 + Math.random() * 4; }
      }
      // a long rest: sit down on the ground
      if (this.idleT > 25) {
        const k2 = Math.min(1, (this.idleT - 25) / 0.6);
        bodyY -= 0.32 * k2;
        legX = [-1.45 * k2, -1.45 * k2]; legZ = [0.18 * k2, -0.18 * k2];
        armX = [0.35 * k2, 0.35 * k2]; armZ = [0.45 * k2, -0.45 * k2];
        bodyX = -0.12 * k2;
        this.fidget = null;
      }
    } else {
      this.fidget = null;
      m.torso.scale.set(1, 1, 1);
    }
    // blink every few seconds (and with every glance)
    if (!this.blinkT || now > this.blinkT) this.blinkT = now + 2.5 + Math.random() * 3;
    const b = this.blinkT - now < 0.12 ? 0.1 : 1;
    for (const e of m.eyes || []) e.scale.y = b;
    m.headPivot.rotation.set(headX, headY, 0);
    m.body.position.y = bodyY;
    m.body.rotation.set(bodyX, 0, bodyZ);
    m.arms.forEach((a, i) => { a.rotation.x = armX[i]; a.rotation.z = armZ[i]; });
    m.legs.forEach((l, i) => { l.rotation.x = legX[i]; l.rotation.z = legZ[i]; });
    const sq = this.squash > 0 ? 1 - this.squash * 1.2 : 1;
    m.root.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    // blob shadow on whatever is below
    const gh = st === 'swim' ? WATER_Y + 0.02 : Math.max(this.groundH ?? P.y, this.phys.terrainH(P.x, P.z));
    const above = P.y - gh;
    this.blob.position.set(P.x, (gh < 0 && st !== 'swim' ? Math.max(gh, WATER_Y) : gh) + 0.03, P.z);
    const sc = Math.max(0.4, 1 - above * 0.06);
    this.blob.scale.set(sc, sc, sc);
    this.blob.material.opacity = 0.32 * sc;
  }
}
