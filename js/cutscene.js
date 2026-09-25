// Moth's ending cutscene: she spins, launches into the sky, and the camera follows her up
// through the clouds and into space to the Moon, where she finds a present and brings it back
// down to the player. Afterwards everything goes back to normal (Moth on her box, blue sky).
// The main loop calls update() instead of moving the player and camera while it plays.
import * as THREE from 'three';

const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));
const $ = id => document.getElementById(id);

// A faceted moon with a few craters, drawn without fog so it stays crisp from far away.
function moonMesh(R) {
  const g = new THREE.Group();
  const rock = new THREE.MeshLambertMaterial({ color: 0xa9a6b8, emissive: 0x24222e, flatShading: true, fog: false });
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 3), rock));
  const crater = new THREE.MeshLambertMaterial({ color: 0x7d7a8e, emissive: 0x1a1824, flatShading: true, fog: false });
  const up = new THREE.Vector3(0, 1, 0);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    // keep the landing spot on top clear
    const d = new THREE.Vector3(r() - 0.5, r() * 0.8 - 0.35, r() - 0.5).normalize();
    const size = R * (0.08 + r() * 0.14);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 0.8, size * 0.25, 9), crater);
    c.position.copy(d).multiplyScalar(R * 0.99);
    c.quaternion.setFromUnitVectors(up, d);
    g.add(c);
  }
  return g;
}

function starField() {
  const n = 900, pos = new Float32Array(n * 3);
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(r() - 0.5, r() * 0.9 - 0.1, r() - 0.5).normalize().multiplyScalar(3200);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true,
    opacity: 0, depthWrite: false, fog: false });
  return new THREE.Points(geo, mat);
}

// a wrapped present (she loves boxes, so of course the gift is a box)
function giftMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xe8452f, emissive: 0x3a0c06 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x4a3200 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), red); b.position.y = 0.25; g.add(b);
  for (const r of [0, Math.PI / 2]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.52, 0.12), gold);
    band.position.y = 0.25; band.rotation.y = r; g.add(band);
  }
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), gold);
    loop.position.set(s * 0.1, 0.58, 0); loop.rotation.y = Math.PI / 2; loop.rotation.x = s * 0.5; g.add(loop);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// opts.home: where Moth goes once it's over (default: where she started)
// opts.landAt: where she lands with the gift on the way back (default: next to the player)
export function mothToTheMoon(g, mothRoot, moth, opts = {}) {
  const { scene, sfx, world } = g;
  const camera = g.cam.cam;
  const sky = world.sky.uniforms;
  // the clouds are a batched group sharing one material
  const cloudMat = world.sky.clouds.children[0]?.material || { opacity: 0.92 };
  const skyTop = sky.uTop.value.clone(), skyBot = sky.uBot.value.clone();
  const spaceTop = new THREE.Color(0x03040c), spaceBot = new THREE.Color(0x161c3a);
  const start = mothRoot.position.clone(), homeRot = mothRoot.rotation.y;
  const home = (opts.home || start).clone();
  const pl = g.player.pos.clone();
  const landAt = (opts.landAt || pl.clone().add(new THREE.Vector3(1.6, 0, 0))).clone();

  // up: straight up past the clouds, then arc over and land on top of the moon
  const R = 45;
  const moonC = start.clone().add(new THREE.Vector3(90, 860, -140));
  const land = moonC.clone().add(new THREE.Vector3(0, R + 0.1, 0));
  const p1 = start.clone().add(new THREE.Vector3(0, 1050, 0));
  const bez = (t, out, a, b, c) => out.set(0, 0, 0)
    .addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(c, t * t);
  const up = (t, out) => bez(t, out, start, p1, land);
  // down: hop off the moon, then drop straight onto the spot beside the player
  const p1d = new THREE.Vector3(landAt.x, land.y + 90, landAt.z);
  const down = (t, out) => bez(t, out, land, p1d, landAt);

  // a camera spot near the ground with a clear line of sight (never inside a kiosk wall)
  const clearView = (target, dist, height, prefer) => {
    for (let i = 0; i < 16; i++) {
      const a = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 8;
      const c = new THREE.Vector3(target.x + Math.sin(a) * dist, target.y + height, target.z + Math.cos(a) * dist);
      if (g.phys.raycast(target.x, target.y + 0.6, target.z, c.x, c.y, c.z) === 1) return c;
    }
    return target.clone().add(new THREE.Vector3(0.01, height + dist, 0.01));
  };

  const moon = moonMesh(R);
  moon.position.copy(moonC);
  const stars = starField();
  const gift = giftMesh();
  gift.visible = false;
  scene.add(moon, stars, gift);
  document.body.classList.add('cine');

  // final shot: the player and Moth side by side with the gift between them
  const side = new THREE.Vector3(landAt.x - pl.x, 0, landAt.z - pl.z).normalize();
  if (!Number.isFinite(side.x)) side.set(1, 0, 0);
  const mid = pl.clone().add(landAt).multiplyScalar(0.5);
  const finalCam = clearView(mid, 4.4, 2.1, Math.atan2(side.z, -side.x));
  const finalLook = mid.clone().add(new THREE.Vector3(0, 0.6, 0));

  const T_SPIN = 1.8, T_UP = 5.6, T_MOON = 2.6, T_DOWN = 4.2, T_HOLD = 2.4;
  const A = T_SPIN, B = A + T_UP, C = B + T_MOON, D = C + T_DOWN, T_END = D + T_HOLD;
  const pos = new THREE.Vector3(), prev = new THREE.Vector3(), camLaunch = new THREE.Vector3(), camWant = new THREE.Vector3(), look = new THREE.Vector3();
  const camFrom = camera.position.clone();
  const spinCam = clearView(start, 3.9, 1.3, Math.atan2(camFrom.x - start.x, camFrom.z - start.z));
  const lookNow = start.clone().add(new THREE.Vector3(0, 0.8, 0));
  let t = 0, spin = 0, skipped = false, resolve;
  const cue = new Set();
  const once = (k, fn) => { if (!cue.has(k)) { cue.add(k); fn(); } };
  sfx.play('meow');

  const cine = {
    done: new Promise(r => (resolve = r)),
    skip() { if (t > 0.8 && t < T_END) { skipped = true; t = T_END; } },
    update(dt, now) {
      t += dt;
      // --- Moth
      let spinRate = 0;
      if (t < A) {
        const k = t / A;
        spinRate = 2 + k * k * 30;
        pos.copy(start);
        pos.y += Math.abs(Math.sin(t * 9)) * 0.25 * k; // excited little hops
      } else if (t < B) {
        const k = (t - A) / T_UP;
        spinRate = 32 * (1 - smooth(clamp01((k - 0.75) / 0.25))) + 1;
        up(smooth(k), pos);
        once('whoosh', () => { sfx.tone(180, 1.6, { type: 'sawtooth', vol: 0.05, slide: 9, attack: 0.3 }); sfx.tone(360, 1.2, { type: 'triangle', vol: 0.06, slide: 5 }); });
        if (Math.random() < dt * 40) g.fx.emit(pos.x, pos.y + 0.3, pos.z, 1, { color: Math.random() < 0.5 ? 0xa8eab7 : 0xffe38a, speed: 0.6, up: -1, life: 0.9, grav: 0 });
      } else if (t < C) {
        const k = (t - B) / T_MOON;
        pos.copy(land);
        once('landed', () => {
          sfx.play('meow');
          sfx.tone(880, 0.25, { type: 'triangle', vol: 0.08 }); sfx.tone(1320, 0.4, { type: 'triangle', vol: 0.06, delay: 0.12 });
          g.fx.emit(land.x, land.y + 0.8, land.z, 30, { color: 0xffe38a, speed: 2, up: 2, life: 1.2, grav: 0 });
        });
        // a present pops out of the moon dust... and she grabs it
        if (k > 0.25 && k < 0.6) {
          once('gift', () => { gift.visible = true; sfx.play('appear'); g.fx.emit(land.x + 0.9, land.y + 0.3, land.z, 20, { color: 0xffffff, speed: 2, up: 3, life: 0.8 }); });
          gift.position.set(land.x + 0.9, land.y + Math.min(0.6, (k - 0.25) * 4) - 0.3, land.z);
        } else if (k >= 0.6) {
          once('grab', () => { mothRoot.add(gift); gift.position.set(0, 0.45, 0.55); gift.scale.setScalar(0.8); sfx.play('mask'); });
          pos.y += Math.abs(Math.sin((k - 0.6) * 12)) * 0.4;
        }
      } else if (t < D) {
        const k = (t - C) / T_DOWN;
        spinRate = 14 * (1 - smooth(clamp01((k - 0.8) / 0.2)));
        down(Math.pow(k, 1.6), pos);
        once('fall', () => sfx.tone(1400, 2.2, { type: 'triangle', vol: 0.05, slide: 0.12, attack: 0.2 }));
        if (Math.random() < dt * 40) g.fx.emit(pos.x, pos.y + 0.3, pos.z, 1, { color: 0xffe38a, speed: 0.6, up: 1, life: 0.9, grav: 0 });
      } else {
        pos.copy(landAt);
        once('thud', () => {
          sfx.play('pound'); sfx.play('meow');
          g.cam.shake = 0.35;
          g.fx.emit(landAt.x, landAt.y + 0.2, landAt.z, 26, { color: 0xe8dcc0, speed: 4, up: 2, life: 0.7 });
          // she sets the present down in front of you
          scene.attach(gift);
          gift.scale.setScalar(1.1);
          gift.position.set((landAt.x + pl.x) / 2, landAt.y, (landAt.z + pl.z) / 2);
          gift.rotation.set(0, 0.4, 0);
        });
        pos.y += Math.abs(Math.sin((t - D) * 7)) * 0.3 * Math.max(0, 1 - (t - D) / 1.2);
      }
      spin += spinRate * dt;
      mothRoot.position.copy(pos);
      if (spinRate) mothRoot.rotation.y = spin;
      else {
        // settle facing the camera on the moon, facing you once she's back
        const want = t >= D ? Math.atan2(pl.x - landAt.x, pl.z - landAt.z) : 0;
        let r = (mothRoot.rotation.y - want) % (Math.PI * 2);
        if (r > Math.PI) r -= Math.PI * 2; if (r < -Math.PI) r += Math.PI * 2;
        mothRoot.rotation.y = want + r * Math.max(0, 1 - dt * 5);
      }
      moth.userData.tail.rotation.z = Math.sin(now * 8) * 0.4;

      // --- camera
      if (t < A) {
        camera.position.lerpVectors(camFrom, spinCam, smooth(clamp01(t / 0.8)));
        camLaunch.copy(camera.position);
        look.copy(start).add(new THREE.Vector3(0, 0.6, 0));
      } else if (t < B || (t >= C && t < D)) {
        // she's fast, so the camera rides along rigidly behind her flight (a lagging camera would lose her)
        const goingUp = t < B;
        const k = goingUp ? (t - A) / T_UP : (t - C) / T_DOWN;
        if (goingUp) up(Math.max(0, smooth(k) - 0.02), prev); else down(Math.max(0, Math.pow(k, 1.6) - 0.02), prev);
        const back = prev.sub(pos).normalize();
        if (!Number.isFinite(back.x) || back.lengthSq() === 0) back.set(0, goingUp ? -1 : 1, 0);
        const dist = goingUp ? 4 + k * 2.5 : 6;
        camWant.copy(pos).addScaledVector(back, dist).add(new THREE.Vector3(0.9, 0.5, 1.4));
        if (goingUp) camera.position.lerpVectors(camLaunch, camWant, smooth(clamp01((t - A) / 0.6)));
        else camera.position.lerpVectors(camera.position, camWant, smooth(clamp01((t - C) / 0.5)));
        look.copy(pos);
        // coming home: ease into the final two-shot
        if (!goingUp && k > 0.82) {
          const w = smooth((k - 0.82) / 0.18);
          camera.position.lerp(finalCam, w);
          look.lerp(finalLook, w);
        }
        lookNow.lerp(look, goingUp ? smooth(clamp01((t - A) / 0.4)) : 1);
      } else if (t < C) {
        // slow orbit around Moth on the moon, with La Guancha far below
        const k = (t - B) / T_MOON;
        const a = 0.9 + k * 0.8;
        camWant.copy(land).add(new THREE.Vector3(Math.cos(a) * 3.4, 1.3 + k * 0.9, Math.sin(a) * 3.4));
        camera.position.lerp(camWant, Math.min(1, dt * 3));
        look.copy(land).add(new THREE.Vector3(0, 0.45, 0));
        lookNow.lerp(look, Math.min(1, dt * 5));
      } else {
        camera.position.lerp(finalCam, Math.min(1, dt * 4));
        lookNow.lerp(finalLook, Math.min(1, dt * 4));
      }
      camera.lookAt(lookNow);

      // --- sky turns to space with height
      const h = clamp01((camera.position.y - start.y - 120) / 500);
      sky.uTop.value.copy(skyTop).lerp(spaceTop, h);
      sky.uBot.value.copy(skyBot).lerp(spaceBot, h);
      stars.material.opacity = h;
      cloudMat.opacity = 0.92 * (1 - h * 0.6);

      if (t >= T_END) this.finish();
    },
    finish() {
      if (this.finished) return;
      this.finished = true;
      const fade = $('fade');
      fade.classList.add('on');
      setTimeout(() => {
        // back to normal: Moth home, blue sky
        gift.removeFromParent();
        scene.remove(moon, stars);
        moon.traverse(o => o.geometry?.dispose());
        stars.geometry.dispose();
        sky.uTop.value.copy(skyTop); sky.uBot.value.copy(skyBot);
        cloudMat.opacity = 0.92;
        mothRoot.position.copy(home);
        mothRoot.rotation.y = homeRot;
        document.body.classList.remove('cine');
        g.cinematic = null;
        g.cam.snap(g.player);
        fade.classList.remove('on');
        resolve({ skipped, landAt });
      }, skipped ? 150 : 450);
    },
  };
  g.cinematic = cine;
  return cine.done;
}
