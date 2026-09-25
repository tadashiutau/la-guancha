import * as THREE from 'three';
import { loadData } from './data.js';
import { Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { loadIslandModels, loadMothModel } from './model-assets.js';
import { UI } from './ui.js';
import { FreeCam } from './freecam.js';
import { t, getLang, setLang } from './i18n.js';
import { migrateSave, copySave, moveSave, deleteSave, markBad } from './saves.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
// resolution scale: starts at the device's cap and adapts to the frame rate (see adaptRes)
const MAX_RES = Math.min(devicePixelRatio, 1.75), MIN_RES = Math.min(devicePixelRatio, 0.85);
let res = mobile ? Math.min(MAX_RES, 1.5) : MAX_RES;
renderer.setPixelRatio(res);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xcfe6f2), UNDER = new THREE.Color(0x0f6f8f);
scene.fog = new THREE.Fog(FOG, 120, 1400);
scene.background = FOG;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x9a8468, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffeccc, 2.75);
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
migrateSave();

let data, phys, world, player, cam, game, freecam;
let state = 'loading';

async function boot() {
  const T0 = performance.now(), lap = n => (window.__boot = (window.__boot || []).concat(`${n} ${(performance.now() | 0)}ms`));
  data = await loadData(p => ui.progress(p));
  lap('data');
  ui.progress(0.5);
  await loadIslandModels();
  await loadMothModel();
  lap('models');
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
  game.spawn();
  cam.snap(player);
  ui.progress(1);
  ui.ready();
  try {
    if (sessionStorage.getItem('guancha.openSlots') === '1') {
      sessionStorage.removeItem('guancha.openSlots');
      ui.showSlots();
    }
  } catch (e) { /* storage unavailable */ }
  lap('ready');
  if (DEBUG) {
    freecam = new FreeCam(camera);
    window.G = { game, player, phys, world, scene, camera, THREE, cam, renderer, freecam };
    G.fly = (...a) => freecam.fly(...a);
    // top-down orthographic snapshot for comparing against satellite imagery
    G.topdown = (x0 = data.bounds.x0, z0 = data.bounds.z0, x1 = data.bounds.x1, z1 = data.bounds.z1, w = 1200) => {
      const h = Math.round(w * (z1 - z0) / (x1 - x0));
      const oc = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 1, 500);
      oc.position.set(0, 200, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
      const prev = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      scene.fog.far = 1e6; scene.fog.near = 1e6;
      renderer.render(scene, oc);
      const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
      renderer.setPixelRatio(prev); resize();
      return url;
    };
  }
  // render one frame behind the title so the world is visible
  renderer.render(scene, camera);
}

const startGame = () => {
  sfx.start();
  state = 'play';
  ui.hideSlots();
  ui.hideTitle();
  game.startPlaying();
};
ui.onPlay = () => ui.showSlots();
ui.onSelectSlot = slot => {
  try { game.load(slot); } catch (e) {
    // the save didn't fit this version: flag it and reopen the save screen, which explains what to do
    console.error(e);
    game.slot = 0;
    markBad(slot);
    try { sessionStorage.setItem('guancha.openSlots', '1'); } catch (err) { /* ignore */ }
    location.reload();
    return;
  }
  game.spawn();
  cam.snap(player);
  ui.hideSlots();
  if (!game.playerName) ui.promptName();
  else startGame();
};
ui.onName = name => { game.playerName = name; game.save(); startGame(); };
ui.onCopySlot = (from, to) => copySave(from, to);
ui.onMoveSlot = (from, to) => moveSave(from, to);
ui.onDeleteSlot = slot => deleteSave(slot);
ui.onToSlots = () => {
  game.save();
  try { sessionStorage.setItem('guancha.openSlots', '1'); } catch (e) { /* ignore */ }
  location.reload();
};
ui.onPause = on => { state = on ? 'pause' : 'play'; input.release(); };
ui.onWarp = (x, y, z, face) => { player.teleport(x, y, z, face); cam.snap(player); };
ui.onLang = () => { setLang(getLang() === 'es' ? 'en' : 'es'); ui.applyLang(); game?.onLang(); };

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let fpsT = performance.now(), fpsN = 0;
// Adaptive resolution: every 2 s of play, drop the render scale when frames run slow and raise it
// again when there's headroom, so phones and tablets stay smooth without a settings menu.
let resT = performance.now(), resN = 0;
function adaptRes() {
  resN++;
  const el = performance.now() - resT;
  if (el < 2000) return;
  const fps = resN * 1000 / el;
  resN = 0; resT = performance.now();
  if (document.hidden || state !== 'play') return;
  let next = res;
  if (fps < 45) next = Math.max(MIN_RES, res - 0.25);
  else if (fps > 58) next = Math.min(MAX_RES, res + 0.125);
  if (next !== res) { res = next; renderer.setPixelRatio(res); resize(); }
}
function frame() {
  requestAnimationFrame(frame);
  if (!game) return;
  adaptRes();
  let dt = Math.min(clock.getDelta(), 1 / 20);
  const now = performance.now() / 1000;
  const inp = input.frame();
  if (game.cinematic) {
    // a cutscene drives the camera; jump or talk skips it
    if (inp.jumpPressed || inp.talkPressed) game.cinematic.skip();
    game.cinematic.update(dt, now);
    game.animateOnly(dt, now);
  } else if (freecam?.on) {
    // debug fly-through: the world keeps animating but the player stays put
    if (inp.pausePressed) freecam.toggle(false);
    freecam.update(dt, inp, input.keys);
    game.animateOnly(dt, now);
  } else if (state === 'play') {
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
    else if (inp.mapPressed) ui.showTab('map');
  } else {
    // title: slow orbit around the boardwalk
    cam.yaw += dt * 0.08;
    cam.update(dt, player, { camDX: 0, camDY: 0 }, 0, 0);
    game.animateOnly(dt, now);
  }
  world.fadeFoliage(camera, player.pos, dt);
  // light and shadow follow the player
  const P = player.pos;
  sun.position.set(P.x + SUN_DIR.x * 80, P.y + SUN_DIR.y * 80, P.z + SUN_DIR.z * 80);
  sun.target.position.set(P.x, P.y, P.z);
  world.water.uniforms.uTime.value = now;
  // underwater look
  const under = camera.position.y < 0 && data.terrainH(camera.position.x, camera.position.z) < camera.position.y;
  sfx.underwater(under);
  scene.fog.color.copy(under ? UNDER : FOG);
  scene.fog.near = under ? 1 : 120;
  scene.fog.far = under ? 45 : 1400;
  world.water.uniforms.uFog.value.copy(scene.fog.color);
  world.water.uniforms.uFogNear.value = scene.fog.near;
  world.water.uniforms.uFogFar.value = scene.fog.far;
  renderer.render(scene, camera);
  ui.frame(dt, player, cam);
  if (DEBUG) {
    fpsN++;
    // wall-clock time: dt is capped at 1/20 s, which would hide frame rates under 20
    const fpsDt = (performance.now() - fpsT) / 1000;
    if (fpsDt > 1) { ui.debug(`${Math.round(fpsN / fpsDt)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000) | 0}k tris · ${freecam.on ? 'freecam ' + camera.position.toArray().map(v => v.toFixed(1)).join(',') : player.state} · ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)} (${(P.x / 0.6).toFixed(0)},${(-P.z / 0.6).toFixed(0)})`); fpsN = 0; fpsT = performance.now(); }
  }
}

boot().then(() => frame()).catch(e => { console.error(e); ui.error(e); });

// keep iOS from zooming on double-tap
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
