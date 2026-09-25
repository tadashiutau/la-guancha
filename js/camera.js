// Third-person follow camera: drag to orbit, auto-swings behind the player, pulls in when blocked.
import * as THREE from 'three';

export class FollowCam {
  constructor(camera, phys) {
    this.cam = camera; this.phys = phys;
    this.yaw = 0; this.pitch = 0.3; this.dist = 8; this.cur = 8;
    this.target = new THREE.Vector3();
    this.ty = 0;
    this.shake = 0;
  }

  snap(player) {
    this.yaw = player.face + Math.PI;
    this.target.copy(player.pos);
    this.ty = player.pos.y + 1.2;
  }

  update(dt, player, inp, lastCamInput, now) {
    this.yaw -= inp.camDX * 0.006;
    this.pitch = Math.max(-0.35, Math.min(1.25, this.pitch + inp.camDY * 0.004));
    if (inp.zoom) this.dist = Math.max(4, Math.min(16, this.dist + inp.zoom * 0.8));

    const P = player.pos;
    if (this.chase) {
      // racing (kart-race.js): stay tight behind, a little lower, whatever the stick does
      let d = player.face + Math.PI - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 7);
      this.pitch += (0.26 - this.pitch) * Math.min(1, dt * 3);
      this.dist += (6.2 - this.dist) * Math.min(1, dt * 3);
    } else if (now - lastCamInput > 1.5 && player.speed > 2 && player.state !== 'wall') {
      // swing behind the player while running, unless the camera was touched recently
      const want = player.face + Math.PI;
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // only gentle, sideways-dominant correction so running toward the camera stays possible
      const f = Math.abs(d) > 2.6 ? 0 : 0.9;
      this.yaw += d * Math.min(1, dt * f * (player.speed / 8));
    }
    // vertical follow: calm during jumps, catches up on landing or big falls
    const wantY = P.y + 1.2;
    const grounded = player.grounded || player.state === 'swim' || this.chase;
    const rate = grounded ? 5 : (wantY < this.ty - 2 || wantY > this.ty + 4 ? 4 : 0.8);
    this.ty += (wantY - this.ty) * Math.min(1, dt * rate);
    this.target.x += (P.x - this.target.x) * Math.min(1, dt * 12);
    this.target.z += (P.z - this.target.z) * Math.min(1, dt * 12);
    const tx = this.target.x, ty = this.ty, tz = this.target.z;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    const t = this.phys.raycast(tx, ty, tz, tx + dx * this.dist, ty + dy * this.dist, tz + dz * this.dist, 20);
    let want = Math.max(1.2, this.dist * t - 0.3);
    // pull in past tree foliage so the view isn't a wall of leaves
    while (want > 1.6 && this.phys.inFoliage(tx + dx * want, ty + dy * want, tz + dz * want)) want -= 0.5;
    this.cur += (want - this.cur) * Math.min(1, dt * (want < this.cur ? 18 : 3));
    let cx = tx + dx * this.cur, cy = ty + dy * this.cur, cz = tz + dz * this.cur;
    // keep the camera just above the ground
    const gh = this.phys.terrainH(cx, cz) + 0.3;
    if (cy < gh) cy = gh;
    if (this.shake > 0) {
      this.shake -= dt;
      cx += (Math.random() - 0.5) * this.shake; cy += (Math.random() - 0.5) * this.shake;
    }
    this.cam.position.set(cx, cy, cz);
    this.cam.lookAt(tx, ty + 0.2, tz);
  }
}
