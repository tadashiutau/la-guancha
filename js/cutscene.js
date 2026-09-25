// Moth's ending cutscene, just for show: she spins, launches into the sky, and the camera
// follows her up through the clouds and into space until she lands on the Moon. Afterwards
// everything goes back to normal (Moth sits on her box again, the sky is blue).
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

export function mothToTheMoon(g, mothRoot, moth) {
  const { scene, sfx, world } = g;
  const camera = g.cam.cam;
  const sky = world.sky.uniforms;
  // the clouds are a batched group sharing one material
  const cloudMat = world.sky.clouds.children[0]?.material || { opacity: 0.92 };
  const skyTop = sky.uTop.value.clone(), skyBot = sky.uBot.value.clone();
  const spaceTop = new THREE.Color(0x03040c), spaceBot = new THREE.Color(0x161c3a);
  const home = mothRoot.position.clone(), homeRot = mothRoot.rotation.y;
  const start = home.clone();

  // flight: straight up past the clouds, then arc over and land on top of the moon
  const R = 45;
  const moonC = start.clone().add(new THREE.Vector3(90, 860, -140));
  const land = moonC.clone().add(new THREE.Vector3(0, R + 0.1, 0));
  const p1 = start.clone().add(new THREE.Vector3(0, 1050, 0));
  const bez = (t, out) => out.set(0, 0, 0)
    .addScaledVector(start, (1 - t) * (1 - t)).addScaledVector(p1, 2 * t * (1 - t)).addScaledVector(land, t * t);

  const moon = moonMesh(R);
  moon.position.copy(moonC);
  const stars = starField();
  scene.add(moon, stars);
  document.body.classList.add('cine');

  const T_SPIN = 1.8, T_FLY = 6.2, T_MOON = 3.2, T_END = T_SPIN + T_FLY + T_MOON;
  const pos = new THREE.Vector3(), prev = new THREE.Vector3(), camLaunch = new THREE.Vector3(), camWant = new THREE.Vector3(), look = new THREE.Vector3();
  const camFrom = camera.position.clone();
  const lookNow = start.clone().add(new THREE.Vector3(0, 0.8, 0));
  let t = 0, spin = 0, skipped = false, resolve;
  let beeped = 0;
  sfx.play('meow');

  const cine = {
    done: new Promise(r => (resolve = r)),
    skip() { if (t > 0.8 && t < T_END) { skipped = true; t = T_END; } },
    update(dt, now) {
      t += dt;
      // --- Moth
      let spinRate;
      if (t < T_SPIN) {
        const k = t / T_SPIN;
        spinRate = 2 + k * k * 30;
        pos.copy(start);
        pos.y += Math.abs(Math.sin(t * 9)) * 0.25 * k; // excited little hops
      } else if (t < T_SPIN + T_FLY) {
        const k = (t - T_SPIN) / T_FLY;
        spinRate = 32 * (1 - smooth(clamp01((k - 0.75) / 0.25))) + 1;
        bez(smooth(k), pos);
        if (beeped === 0) { beeped = 1; sfx.tone(180, 1.6, { type: 'sawtooth', vol: 0.05, slide: 9, attack: 0.3 }); sfx.tone(360, 1.2, { type: 'triangle', vol: 0.06, slide: 5 }); }
        if (Math.random() < dt * 40) g.fx.emit(pos.x, pos.y + 0.3, pos.z, 1, { color: Math.random() < 0.5 ? 0xa8eab7 : 0xffe38a, speed: 0.6, up: -1, life: 0.9, grav: 0 });
      } else {
        spinRate = 0;
        pos.copy(land);
        if (beeped === 1) {
          beeped = 2; sfx.play('meow');
          sfx.tone(880, 0.25, { type: 'triangle', vol: 0.08 }); sfx.tone(1320, 0.4, { type: 'triangle', vol: 0.06, delay: 0.12 });
          g.fx.emit(land.x, land.y + 0.8, land.z, 30, { color: 0xffe38a, speed: 2, up: 2, life: 1.2, grav: 0 });
        }
      }
      spin += spinRate * dt;
      mothRoot.position.copy(pos);
      // once landed she settles to face the camera's orbit instead of spinning
      if (spinRate) mothRoot.rotation.y = spin;
      else {
        const r = mothRoot.rotation.y % (Math.PI * 2);
        mothRoot.rotation.y = (r > Math.PI ? r - Math.PI * 2 : r) * Math.max(0, 1 - dt * 4);
      }
      moth.userData.tail.rotation.z = Math.sin(now * 8) * 0.4;

      // --- camera
      if (t < T_SPIN) {
        camWant.copy(start).add(new THREE.Vector3(2.4, 1.3, 3.2));
        camera.position.lerpVectors(camFrom, camWant, smooth(clamp01(t / 0.8)));
        camLaunch.copy(camera.position);
        look.copy(start).add(new THREE.Vector3(0, 0.6, 0));
      } else if (t < T_SPIN + T_FLY) {
        // chase from behind along her flight, so the moon stays ahead of the shot
        const k = (t - T_SPIN) / T_FLY;
        bez(Math.max(0, smooth(k) - 0.02), prev);
        const back = prev.sub(pos).normalize();
        if (!Number.isFinite(back.x) || back.lengthSq() === 0) back.set(0, -1, 0);
        // she's fast, so the camera rides along rigidly (a lagging camera would lose her)
        const dist = 4 + k * 2.5;
        camWant.copy(pos).addScaledVector(back, dist).add(new THREE.Vector3(0.9, 0.5, 1.4));
        camera.position.lerpVectors(camLaunch, camWant, smooth(clamp01((t - T_SPIN) / 0.6)));
        look.copy(pos);
        lookNow.lerp(look, smooth(clamp01((t - T_SPIN) / 0.4)));
      } else {
        // slow orbit around Moth sitting on the moon, with La Guancha far below
        const k = (t - T_SPIN - T_FLY) / T_MOON;
        const a = 0.9 + k * 0.8;
        camWant.copy(land).add(new THREE.Vector3(Math.cos(a) * 3.4, 1.3 + k * 0.9, Math.sin(a) * 3.4));
        camera.position.lerp(camWant, Math.min(1, dt * 3));
        look.copy(land).add(new THREE.Vector3(0, 0.45, 0));
      }
      if (t < T_SPIN || t >= T_SPIN + T_FLY) lookNow.lerp(look, Math.min(1, dt * 5));
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
        // back to how the quest left her
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
        resolve(skipped);
      }, skipped ? 150 : 450);
    },
  };
  g.cinematic = cine;
  return cine.done;
}
