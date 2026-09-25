// Debug free camera (only with ?debug). Press V to fly around without moving the player; V or Esc returns.
// WASD / arrows move, Space up, Shift or C down, hold Alt for speed, drag the mouse (or Q/R) to look.
// From the console: G.fly(x, y, z, lookX, lookY, lookZ) jumps the free camera to a spot.
import * as THREE from 'three';

export class FreeCam {
  constructor(camera) {
    this.camera = camera;
    this.on = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.fast = false;
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyV' && !e.repeat) this.toggle();
      if (e.code === 'AltLeft' || e.code === 'AltRight') { this.fast = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (e.code === 'AltLeft' || e.code === 'AltRight') this.fast = false; });
  }

  toggle(on = !this.on) {
    this.on = on;
    if (on) {
      // start from wherever the follow camera is looking
      this.pos.copy(this.camera.position);
      const d = this.camera.getWorldDirection(new THREE.Vector3());
      this.yaw = Math.atan2(d.x, d.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    }
    return on;
  }

  // jump to a spot, optionally looking at a target
  fly(x, y, z, lx, ly, lz) {
    this.toggle(true);
    this.pos.set(x, y, z);
    if (lx !== undefined) {
      const dx = lx - x, dy = ly - y, dz = lz - z;
      this.yaw = Math.atan2(dx, dz);
      this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    this.apply();
  }

  update(dt, inp, keys) {
    this.yaw -= inp.camDX * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - inp.camDY * 0.004, -1.5, 1.5);
    const cp = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC') ? 1 : 0);
    const v = (this.fast ? 60 : 12) * dt;
    this.pos.addScaledVector(fwd, inp.my * v).addScaledVector(right, inp.mx * v);
    this.pos.y += up * v;
    this.apply();
  }

  apply() {
    const cp = Math.cos(this.pitch);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.x + Math.sin(this.yaw) * cp, this.pos.y + Math.sin(this.pitch), this.pos.z + Math.cos(this.yaw) * cp);
  }
}
