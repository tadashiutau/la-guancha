import * as THREE from 'three';
import { loadData } from './data.js';
import { Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { t, getLang, setLang } from './i18n.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xcfe6f2), UNDER = new THREE.Color(0x0f6f8f);
scene.fog = new THREE.Fog(FOG, 120, 1400);
scene.background = FOG;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xa89070, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
const SC = 45;
Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 200 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const sfx = new Sfx();
try { sfx.setMuted(localStorage.getItem('guancha.muted') === '1'); } catch (e) { /* ignore */ }
const input = new Input(document.body);
const ui = new UI(sfx);
ui.applyLang();

let data, phys, world, player, cam, game;
let state = 'loading';

async function boot() {
  const T0 = performance.now(), lap = n => (window.__boot = (window.__boot || []).concat(`${n} ${(performance.now() | 0)}ms`));
  data = await loadData(p => ui.progress(p));
  lap('data');
  ui.progress(0.5);
  await new Promise(r => setTimeout(r, 30));
  phys = new Physics();
  world = buildWorld(scene, data, phys, { mobile });
  lap('world');
  ui.progress(0.8);
  await new Promise(r => setTimeout(r, 30));
  player = new Player(scene, phys, sfx);
  const b = data.bounds;
  player.bounds = { x0: b.x0 + 6, x1: b.x1 - 6, z0: b.z0 + 6, z1: b.z1 - 6 };
  cam = new FollowCam(camera, phys);
  game = new Game({ scene, phys, world, player, sfx, ui, data, cam, input });
  lap('game');
  ui.attach(game, data);
  game.load();
  game.spawn();
  cam.snap(player);
  ui.progress(1);
  ui.ready(game.hasSave());
  lap('ready');
  if (DEBUG) window.G = { game, player, phys, world, scene, camera, THREE, cam };
  // render one frame behind the title so the world is visible
  renderer.render(scene, camera);
}

ui.onPlay = () => {
  sfx.start();
  state = 'play';
  ui.hideTitle();
  game.startPlaying();
};
ui.onReset = () => { game.reset(); };
ui.onPause = on => { state = on ? 'pause' : 'play'; input.release(); };
ui.onWarp = (x, y, z, face) => { player.teleport(x, y, z, face); cam.snap(player); };
ui.onLang = () => { setLang(getLang() === 'es' ? 'en' : 'es'); ui.applyLang(); game?.onLang(); };

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0;
function frame() {
  requestAnimationFrame(frame);
  if (!game) return;
  let dt = Math.min(clock.getDelta(), 1 / 20);
  const now = performance.now() / 1000;
  const inp = input.frame();
  if (state === 'play') {
    if (inp.pausePressed) { ui.pause(true); return; }
    if (inp.mapPressed) { ui.openMap(); return; }
    // physics in small steps for stable collisions
    const steps = Math.ceil(dt / (1 / 90));
    const h = dt / steps;
    game.preUpdate(dt, inp);
    const pinp = { ...inp }; // one-shot presses go to the first physics substep only
    for (let i = 0; i < steps; i++) {
      player.update(h, game.blockInput ? { mx: 0, my: 0 } : pinp, cam.yaw);
      game.onPlayerEvents(player.events);
      if (i === 0) { pinp.jumpPressed = pinp.hatPressed = pinp.crouchPressed = false; }
    }
    game.update(dt, inp, now);
    cam.update(dt, player, inp, input.lastCamInput, now);
  } else if (state === 'pause') {
    if (inp.pausePressed) ui.pause(false);
  } else {
    // title: slow orbit around the boardwalk
    cam.yaw += dt * 0.08;
    cam.update(dt, player, { camDX: 0, camDY: 0 }, 0, 0);
    game.animateOnly(dt, now);
  }
  // light and shadow follow the player
  const P = player.pos;
  sun.position.set(P.x + SUN_DIR.x * 80, P.y + SUN_DIR.y * 80, P.z + SUN_DIR.z * 80);
  sun.target.position.set(P.x, P.y, P.z);
  world.water.uniforms.uTime.value = now;
  // underwater look
  const under = camera.position.y < 0 && data.terrainH(camera.position.x, camera.position.z) < camera.position.y;
  scene.fog.color.copy(under ? UNDER : FOG);
  scene.fog.near = under ? 1 : 120;
  scene.fog.far = under ? 45 : 1400;
  world.water.uniforms.uFog.value.copy(scene.fog.color);
  world.water.uniforms.uFogNear.value = scene.fog.near;
  world.water.uniforms.uFogFar.value = scene.fog.far;
  renderer.render(scene, camera);
  ui.frame(dt, player, cam);
  if (DEBUG) {
    fpsN++; fpsT += dt;
    if (fpsT > 1) { ui.debug(`${Math.round(fpsN / fpsT)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000) | 0}k tris · ${player.state} · ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)} (${(P.x / 0.6).toFixed(0)},${(-P.z / 0.6).toFixed(0)})`); fpsN = fpsT = 0; }
  }
}

boot().then(() => frame()).catch(e => { console.error(e); ui.error(e); });

// keep iOS from zooming on double-tap
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
