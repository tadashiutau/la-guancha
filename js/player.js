// The jíbaro explorer: an Odyssey-style character controller with a throwable pava (straw hat).
import * as THREE from 'three';
import { STEP } from './physics.js';

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

export function makeHat() {
  const g = new THREE.Group();
  const straw = lam(0xe9cf86), band = lam(0x9b3b2a);
  part(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 16), straw, 0, 0, 0, g);
  part(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 12), straw, 0, 0.11, 0, g);
  part(new THREE.CylinderGeometry(0.201, 0.201, 0.05, 12), band, 0, 0.04, 0, g);
  return g;
}

export function makeModel(look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivot at hips for flips and leans
  body.position.y = 0.52;
  root.add(body);
  const skin = lam(look.skin), shirt = lam(look.shirt), shorts = lam(look.shorts), shoe = lam(0x5a3a22), dark = lam(0x1d1d1d);
  const torso = part(new THREE.CylinderGeometry(0.2, 0.23, 0.42, 10), shirt, 0, 0.2, 0, body);
  part(new THREE.BoxGeometry(0.03, 0.36, 0.02), lam(0xffffff), 0, 0.2, 0.225, body); // guayabera placket
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.02, 0.34, 0.01), lam(0xe8e8e0), 0.1 * s, 0.2, 0.215, body);
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.44;
  body.add(headPivot);
  const head = part(new THREE.SphereGeometry(0.23, 14, 10), skin, 0, 0.18, 0, headPivot);
  part(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), lam(look.hair), 0, 0.2, -0.01, headPivot);
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.045, 8, 6), lam(0xffffff), 0.085 * s, 0.21, 0.19, headPivot);
    part(new THREE.SphereGeometry(0.026, 6, 4), dark, 0.085 * s, 0.21, 0.225, headPivot);
    part(new THREE.SphereGeometry(0.05, 6, 4), skin, 0.235 * s, 0.17, 0, headPivot); // ears
  }
  part(new THREE.SphereGeometry(0.05, 8, 6), lam(look.nose), 0, 0.15, 0.23, headPivot);
  part(new THREE.BoxGeometry(0.16, 0.035, 0.04), lam(look.hair), 0, 0.1, 0.215, headPivot); // bigote
  const hatSlot = new THREE.Group();
  hatSlot.position.set(0, 0.36, 0);
  headPivot.add(hatSlot);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(0.25 * s, 0.37, 0);
    body.add(a);
    part(new THREE.CylinderGeometry(0.075, 0.07, 0.16, 8), shirt, 0, -0.07, 0, a);
    part(new THREE.CylinderGeometry(0.055, 0.05, 0.2, 8), skin, 0, -0.24, 0, a);
    part(new THREE.SphereGeometry(0.07, 8, 6), skin, 0, -0.36, 0, a);
    arms.push(a);
    const l = new THREE.Group();
    l.position.set(0.1 * s, 0.0, 0);
    body.add(l);
    part(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 8), shorts, 0, -0.08, 0, l);
    part(new THREE.CylinderGeometry(0.06, 0.055, 0.24, 8), skin, 0, -0.3, 0, l);
    part(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoe, 0, -0.45, 0.04, l);
    legs.push(l);
  }
  return { root, body, headPivot, hatSlot, arms, legs, torso, head };
}

export const LOOKS = {
  default: { skin: 0x9c6a48, nose: 0x8a5a3a, hair: 0x1f1a16, shirt: 0xfbfaf4, shorts: 0xc9b48a },
  ponce: { skin: 0x9c6a48, nose: 0x8a5a3a, hair: 0x1f1a16, shirt: 0xd12b2b, shorts: 0x1d1d1d },
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
    this.m = makeModel(LOOKS.default);
    scene.add(this.m.root);
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

  setLook(name) {
    const was = this.m.root;
    const hat = this.hatMesh;
    this.m = makeModel(LOOKS[name] || LOOKS.default);
    this.scene.remove(was);
    this.scene.add(this.m.root);
    if (this.hat.state === 'on') this.m.hatSlot.add(hat);
    this.look = name;
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
      if (h.t > 0.24 || this.phys.solidAt(h.pos.x, h.pos.y, h.pos.z)) { h.state = 'hover'; h.t = 0; }
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
    this.phase += dt * (4 + sp * 1.5);
    const s = Math.sin(this.phase);
    let bodyX = 0, bodyZ = 0, bodyY = 0.52;
    let armX = [0, 0], armZ = [0.1, -0.1], legX = [0, 0];
    if (this.throwAnim > 0) this.throwAnim -= dt;
    if (st === 'ground') {
      legX = [s * 0.9 * k, -s * 0.9 * k];
      armX = [-s * 0.8 * k, s * 0.8 * k];
      bodyX = k * 0.15;
      bodyY += Math.abs(Math.cos(this.phase)) * 0.05 * k + (k < 0.1 ? Math.sin(performance.now() / 500) * 0.01 : 0);
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
    m.body.position.y = bodyY;
    m.body.rotation.set(bodyX, 0, bodyZ);
    m.arms.forEach((a, i) => { a.rotation.x = armX[i]; a.rotation.z = armZ[i]; });
    m.legs.forEach((l, i) => { l.rotation.x = legX[i]; });
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
