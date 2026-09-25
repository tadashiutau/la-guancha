// Gameplay: collectibles, masks, challenges, NPCs, animals, effects and save data.
import * as THREE from 'three';
import { S } from './data.js';
import { t, tr } from './i18n.js';
import * as M from './models.js';
import { defineLevel } from './level.js';
import { readSave, writeSave } from './saves.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// o.key disambiguates coins that round to the same spot (the nth one there gets '#n')
const posKey = o => o.key || `${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.z)}`;

class Particles {
  constructor(scene, n = 500) {
    this.n = n;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.col = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.g = g;
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.55, map: M.sparkTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false;
    m.renderOrder = 5;
    scene.add(m);
  }

  emit(x, y, z, count, { color = 0xffe08a, speed = 4, up = 3, life = 0.8, grav = 6, spread = 0.3 } = {}) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread; this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread; this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = up * (0.5 + Math.random()); this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.base[i * 3] = c.r; this.base[i * 3 + 1] = c.g; this.base[i * 3 + 2] = c.b;
      this.life[i] = this.max[i] = life * (0.7 + Math.random() * 0.6);
      this.grav[i] = grav;
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.max[i];
      this.col[i * 3] = this.base[i * 3] * f; this.col[i * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.color.needsUpdate = true;
  }
}

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.coins = []; this.conchas = []; this.masks = []; this.npcs = []; this.flags = [];
    this.crates = []; this.spots = []; this.challenges = []; this.targets = []; this.questDefs = []; this.pin = null;
    // things the pava should home in on: each entry returns a list of {x, y, z}
    this.aimables = [() => this.crates.filter(c => !c.broken).map(c => ({ x: c.x, y: c.y + 0.5, z: c.z }))];
    this.player.aimTargets = () => this.aimables.flatMap(f => f());
    this.animals = [];
    this.wallet = 0;
    this.q = {};                    // quest state
    this.revealed = {};
    this.shop = {};
    this.blockInput = false;
    this.talking = false;
    this.cinematic = null; // a running cutscene (see cutscene.js)
    this.timerState = null;
    this.playTime = 0;
    this.slot = 0;
    this.playerName = '';
    this.fx = new Particles(this.scene);
    this.waves = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      w.rotation.x = -Math.PI / 2; w.visible = false;
      this.scene.add(w); this.waves.push(w);
    }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.buildMarkers();

    defineLevel(this);
    this.buildInstances();
    this.conchaTotal = this.conchas.length;
  }

  // ------------------------------------------------------------ level-building API
  W(x, y) { return [x * S, -y * S]; }
  top(X, Z) { return this.phys.topMost(X, Z); }

  coin(x, y, z) {
    const c = { x, y, z, alive: true, id: this.coins.length }, k = posKey(c);
    this.coinKeys ??= new Map();
    const n = this.coinKeys.get(k) || 0;
    this.coinKeys.set(k, n + 1);
    if (n) c.key = k + '#' + n;
    this.coins.push(c);
  }
  coinLine(ax, ay, az, bx, by, bz, n) {
    for (let i = 0; i < n; i++) { const f = n === 1 ? 0 : i / (n - 1); this.coin(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f); }
  }
  coinRing(x, y, z, r, n) {
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.coin(x + Math.cos(a) * r, y, z + Math.sin(a) * r); }
  }
  concha(x, y, z) {
    const nearest = this.flags.reduce((best, flag) => {
      const d = Math.hypot(flag.x - x, flag.z - z);
      return !best || d < best.d ? { id: flag.id, d } : best;
    }, null);
    this.conchas.push({ x, y, z, alive: true, id: this.conchas.length, region: nearest?.id || 'entrada' });
  }

  shellProgress() {
    return this.flags.map(f => {
      const shells = this.conchas.filter(c => c.region === f.id);
      return { id: f.id, got: shells.filter(c => !c.alive).length, total: shells.length };
    }).filter(region => region.total);
  }

  mask(id, name, x, y, z, hidden = false, variant = this.masks.length) {
    const m = { id, name, x, y, z, got: false, active: !hidden, variant };
    const g = new THREE.Group();
    const mesh = M.maskMesh(m.variant);
    mesh.scale.setScalar(0.9);
    mesh.material.transparent = true;
    mesh.renderOrder = 3;
    g.add(mesh);
    const beam = M.beamMesh();
    g.add(beam);
    g.position.set(x, y, z);
    g.visible = !hidden;
    this.root.add(g);
    m.group = g; m.mesh = mesh; m.beam = beam;
    this.masks.push(m);
    return m;
  }
  maskById(id) { return this.masks.find(m => m.id === id); }

  reveal(id, x, y, z, announce = true) {
    const m = this.maskById(id);
    if (!m || m.got) return;
    if (x !== undefined) { m.x = x; m.y = y; m.z = z; m.group.position.set(x, y, z); }
    m.active = true; m.group.visible = true;
    m.appear = 1;
    this.revealed[id] = [m.x, m.y, m.z];
    if (announce) {
      this.sfx.play('appear');
      this.ui.banner(t('newMask'), '', 1.8);
      this.fx.emit(m.x, m.y, m.z, 40, { color: 0xffe08a, speed: 5, up: 4, life: 1 });
    }
    this.save();
  }

  npc(kind, name, x, z, face, talk, opts = {}) {
    const m = M.personMesh(kind, opts.scale || 1);
    const y = opts.y ?? this.top(x, z);
    m.root.position.set(x, y, z);
    m.root.rotation.y = face;
    this.root.add(m.root);
    const n = { kind, name, x, y, z, face, talk, m, phase: Math.random() * 6, ...opts };
    this.npcs.push(n);
    return n;
  }

  flag(id, x, z, face = 0) {
    // on open ground or the boardwalk: never inside a kiosk or up on a pergola, awning or tree
    // crown. If the spot is taken, step outward until it's clear.
    const ph = this.phys;
    const clear = (px, pz) => !ph.near(px, pz, 0.8).some(c => {
      if (!(c.solid || c.tag === 'canopy') || c.tag === 'deck') return false;
      const d = ph.sdist(c, px, pz);
      return d.inside || d.d < 0.6;
    });
    search: for (let r = 0; r < 12; r += 0.5) {
      for (let k = 0, n = Math.max(1, Math.round(r * 6)); k < n; k++) {
        const a = k / n * Math.PI * 2;
        if (clear(x + Math.cos(a) * r, z + Math.sin(a) * r)) { x += Math.cos(a) * r; z += Math.sin(a) * r; break search; }
      }
    }
    const y = ph.groundAt(x, z, ph.terrainH(x, z) + 0.9).h;
    const mesh = M.flagMesh();
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    const f = { id, x, y, z, face, on: false, mesh, rise: 0 };
    this.flags.push(f);
    return f;
  }

  crate(x, y, z, reward = { coins: 3 }) {
    const mesh = M.crateMesh();
    mesh.position.set(x, y + 0.55, z);
    this.root.add(mesh);
    const col = this.phys.addBox(x, z, 0.55, 0.55, 0, y, y + 1.1, { tag: 'crate' });
    const c = { x, y, z, mesh, col, reward, broken: false, idx: this.crates.length };
    col.data = c;
    this.crates.push(c);
    return c;
  }

  spot(x, z, reward) {
    const y = this.top(x, z);
    const s = { x, y, z, reward, used: false, idx: this.spots.length, t: Math.random() * 5 };
    this.spots.push(s);
    return s;
  }

  challenge(c) { this.challenges.push(c); return c; }

  // ------------------------------------------------------------ quest log (the menu's Misiones tab)
  // Each quest registers once: status() is 'hidden' | 'available' | 'active' | 'done', where() is
  // who or where to go to start it, progress() is a short "3/5" and challenge links to its live
  // objective so the log can track it.
  quest(def) { this.questDefs.push(def); return def; }
  questLog() {
    return this.questDefs.map(d => ({ d, status: d.status(), progress: d.progress?.() || '' }))
      .filter(q => q.status !== 'hidden');
  }
  // follow a quest from the log or the map: its live objective if it's running, else its start
  trackQuestId(id) {
    const d = this.questDefs.find(q => q.id === id);
    if (!d) return;
    const st = d.status();
    const ci = d.challenge ? this.challenges.indexOf(d.challenge) : -1;
    if (st === 'active' && ci >= 0 && d.challenge.objective?.()) { this.pin = null; this.trackIdx = ci; }
    else if (st !== 'done') {
      const w = d.where();
      this.pin = { id, x: w.x, y: w.y, z: w.z, label: w.label || d.name };
      this.trackIdx = 'pin';
    }
    this.sfx.play('talk');
  }
  stats() {
    const got = a => a.filter(Boolean).length;
    const log = this.questLog();
    return {
      masks: [got(this.masks.map(m => m.got)), this.masks.length],
      conchas: [this.conchaTotal - this.conchas.filter(c => c.alive).length, this.conchaTotal],
      coins: [this.coins.filter(c => !c.alive).length, this.coins.length],
      wallet: this.wallet,
      flags: [got(this.flags.map(f => f.on)), this.flags.length],
      crates: [got(this.crates.map(c => c.broken)), this.crates.length],
      quests: [log.filter(q => q.status === 'done').length, this.questDefs.length],
      time: this.playTime,
      shells: this.shellProgress(),
    };
  }

  // ------------------------------------------------------------ quest markers
  // "!" over people with a quest to start, "?" while it's running, "$" when the shop has something
  // you can afford; a bouncing marker + screen-edge arrow point at the current objective.
  buildMarkers() {
    const badge = (ch, bg) => {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const x = c.getContext('2d');
      x.fillStyle = bg; x.strokeStyle = '#1b2330'; x.lineWidth = 7;
      x.beginPath(); x.arc(48, 44, 36, 0, Math.PI * 2); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(36, 76); x.lineTo(48, 94); x.lineTo(60, 76); x.fill();
      x.fillStyle = '#1b2330'; x.font = 'bold 58px Trebuchet MS, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(ch, 48, 47);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    this.badgeTex = { available: badge('!', '#f7c948'), active: badge('?', '#7fd3e8'), shop: badge('$', '#8fe388') };
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true }));
    gem.scale.set(0.8, 1.3, 0.8);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 60, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 30;
    gem.renderOrder = halo.renderOrder = 6;
    g.add(gem, halo);
    g.visible = false;
    this.scene.add(g);
    this.qMark = g; this.qGem = gem;
  }

  updateMarkers(dt, now) {
    if (this.cinematic) {
      // cutscenes show no quest badges, beam or arrow
      this.qMark.visible = false;
      for (const n of this.npcs) if (n.badge) n.badge.visible = false;
      this.ui.questArrow(null);
      return;
    }
    for (const n of this.npcs) {
      if (!n.quest) continue;
      const st = n.m.root.visible ? n.quest(this) : null;
      if (!n.badge) {
        n.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badgeTex.available, depthTest: false, transparent: true }));
        n.badge.scale.set(0.7, 0.7, 0.7);
        n.badge.renderOrder = 7;
        this.root.add(n.badge);
      }
      n.badge.visible = !!st;
      if (st) {
        n.badge.material.map = this.badgeTex[st];
        n.badge.position.set(n.x, n.y + 2.0 + Math.sin(now * 3) * 0.08, n.z);
      }
    }
    // Every quest in progress offers an objective; the tracker follows one of them and the
    // player can switch (tap the ⭐ label). A quest that just started gets tracked automatically.
    const objs = [];
    this.challenges.forEach((c, i) => { const o = c.objective?.(); if (o) objs.push({ i, o }); });
    // a quest picked in the log that hasn't started yet: a waypoint to whoever gives it
    if (this.pin) {
      const d = this.questDefs.find(q => q.id === this.pin.id);
      if (!d || d.status() !== 'available') { this.pin = null; if (this.trackIdx === 'pin') this.trackIdx = null; }
      else objs.push({ i: 'pin', o: { x: this.pin.x, y: this.pin.y, z: this.pin.z, label: this.pin.label } });
    }
    if (this.seenQuests) {
      for (const q of objs) {
        if (this.seenQuests.has(q.i) || q.o.idle) continue;
        this.trackIdx = q.i;
        if (objs.length > 1) this.ui.toast(`⭐ ${tr(q.o.label)} · ${t('switchQuest')}`, 3.5);
      }
    }
    this.seenQuests = new Set(objs.map(q => q.i));
    const tracked = objs.find(q => q.i === this.trackIdx) || objs.find(q => !q.o.idle) || objs[0];
    if (tracked) this.trackIdx = tracked.i;
    this.quests = objs;
    const obj = tracked?.o || null;
    this.objective = obj;
    this.qMark.visible = !!obj;
    if (!obj) { this.ui.questArrow(null); return; }
    this.qMark.position.set(obj.x, obj.y + 1.6 + Math.sin(now * 3) * 0.2, obj.z);
    this.qGem.rotation.y = now * 2;
    const cam = this.cam.cam;
    const v = new THREE.Vector3(obj.x, obj.y + 1.6, obj.z).project(cam);
    const behind = v.z > 1;
    const dist = Math.round(Math.hypot(obj.x - this.player.pos.x, obj.z - this.player.pos.z) / S);
    const onScreen = !behind && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.85;
    const n = objs.length, at = objs.indexOf(tracked) + 1;
    if (onScreen) {
      // pin the arrow right above the goal so it never vanishes when you look straight at it
      const pin = new THREE.Vector3(obj.x, obj.y + 2.5, obj.z).project(cam);
      this.ui.questArrow({ on: true, sx: pin.x, sy: pin.y, dist, label: obj.label, n, at });
      return;
    }
    let ax = behind ? -v.x : v.x, ay = behind ? -v.y : v.y;
    if (behind && Math.abs(ay) < 0.2) ay = -0.5;
    const ang = Math.atan2(ay, ax);
    this.ui.questArrow({ on: false, ang, dist, label: obj.label, n, at });
  }

  // quests the tracker can switch between, with distances for the list
  questChoices() {
    const P = this.player.pos;
    return (this.quests || []).map(({ i, o }) => ({ i, label: o.label, tracked: i === this.trackIdx,
      dist: Math.round(Math.hypot(o.x - P.x, o.z - P.z) / S) }));
  }
  trackQuest(i) { this.trackIdx = i; this.sfx.play('talk'); }
  nextQuest() {
    const q = this.quests || [];
    if (q.length < 2) return;
    const k = q.findIndex(x => x.i === this.trackIdx);
    this.trackQuest(q[(k + 1) % q.length].i);
  }

  // ------------------------------------------------------------ instanced collectibles
  buildInstances() {
    const coinMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a00 });
    this.coinMesh = new THREE.InstancedMesh(M.coinGeometry(), coinMat, this.coins.length + 80);
    this.coinMesh.castShadow = true;
    this.coinMesh.frustumCulled = false;
    // drawn after the water so coins under the surface still shine through
    coinMat.transparent = true;
    this.coinMesh.renderOrder = 3;
    this.scene.add(this.coinMesh);
    this.dyn = [];
    const shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x33101a });
    this.conchaMesh = new THREE.InstancedMesh(M.conchaGeometry(), shellMat, Math.max(1, this.conchas.length));
    this.conchaMesh.castShadow = true;
    this.conchaMesh.frustumCulled = false;
    shellMat.transparent = true;
    this.conchaMesh.renderOrder = 3;
    this.scene.add(this.conchaMesh);
  }

  // ------------------------------------------------------------ save / load
  // Saves identify things by id or by rounded position (not list order), so saves keep working
  // when an update adds or moves coins, shells, crates or spots.
  save() {
    if (this.loading || !this.slot) return;
    const keys = a => a.filter(o => !o.alive || o.broken || o.used).map(posKey);
    const s = {
      v: 2, wallet: this.wallet,
      coins: keys(this.coins.filter(c => !c.alive)),
      conchas: keys(this.conchas.filter(c => !c.alive)),
      masks: this.masks.filter(m => m.got).map(m => m.id),
      flags: this.flags.filter(f => f.on).map(f => f.id),
      crates: keys(this.crates.filter(c => c.broken)),
      spots: keys(this.spots.filter(c => c.used)),
      q: this.q, rv: this.revealed, shop: this.shop, look: this.player.look, hat: this.player.hatStyle, time: Math.round(this.playTime),
      last: this.lastFlag, name: this.playerName,
    };
    writeSave(this.slot, s);
  }

  load(slot) {
    this.slot = slot;
    const s = readSave(slot);
    if (!s) { this.refreshAll(); return; }
    this.loading = true;
    this.wallet = s.wallet || 0;
    const mark = (list, saved, fn) => { const set = new Set(saved || []); for (const o of list) if (set.has(posKey(o))) fn(o); };
    if (s.v === 1) {
      // first version stored list positions
      (s.cg || '').split('').forEach((b, i) => { if (b === '1' && this.coins[i]) this.coins[i].alive = false; });
      (s.sh || '').split('').forEach((b, i) => { if (b === '1' && this.conchas[i]) this.conchas[i].alive = false; });
      for (const i of s.crates || []) if (this.crates[i]) this.breakCrate(this.crates[i], true);
      for (const i of s.spots || []) if (this.spots[i]) this.spots[i].used = true;
    } else {
      mark(this.coins, s.coins, c => (c.alive = false));
      mark(this.conchas, s.conchas, c => (c.alive = false));
      mark(this.crates, s.crates, c => this.breakCrate(c, true));
      mark(this.spots, s.spots, c => (c.used = true));
    }
    this.q = s.q || {};
    this.shop = s.shop || {};
    this.playTime = s.time || 0;
    this.playerName = s.name || '';
    this.lastFlag = s.last;
    for (const [id, p] of Object.entries(s.rv || {})) this.reveal(id, ...p, false);
    for (const id of s.masks || []) { const m = this.maskById(id); if (m) { m.got = true; m.group.visible = false; } }
    for (const id of s.flags || []) { const f = this.flags.find(f => f.id === id); if (f) this.lightFlag(f, true); }
    if (s.look && s.look !== 'default') this.player.setLook(s.look);
    if (s.hat === 'gold') this.player.setHat('gold');
    if (this.shop.shirt) (this.shop.outfits ??= {}).ponce = true; // older saves bought the Ponce shirt
    for (const c of this.challenges) c.onLoad?.();
    this.loading = false;
    this.refreshAll();
    this.save(); // upgrade old saves to the current format
  }

  refreshAll() {
    for (const c of this.coins) this.setCoin(c);
    this.conchas.forEach((c, i) => this.conchaMesh.setMatrixAt(i, c.alive ? tmpM.makeTranslation(c.x, c.y, c.z) : ZERO));
    this.conchaMesh.instanceMatrix.needsUpdate = true;
    this.counters();
  }

  setCoin(c) { if (!c.alive) this.coinMesh.setMatrixAt(c.id, ZERO); }

  counters() {
    this.ui.counters(this.wallet, this.conchas.filter(c => !c.alive).length, this.masks.filter(m => m.got).length);
  }

  spawn() {
    const f = this.flags.find(f => f.id === this.lastFlag && f.on) || this.flags[0];
    if (f.on) {
      this.player.teleport(f.x + Math.sin(f.face) * 2, f.y + 0.3, f.z + Math.cos(f.face) * 2, f.face);
    } else {
      // first visit: stand a few steps away looking at the flag, so touching it is the first thing you do
      this.player.teleport(f.x + Math.sin(f.face) * 3.2, f.y + 0.3, f.z + Math.cos(f.face) * 3.2, f.face + Math.PI);
    }
  }

  startPlaying() {
    if (!this.q.intro) {
      this.q.intro = true;
      setTimeout(() => this.ui.banner(t('title'), tr({ es: `¡Encuentra las ${this.masks.length} máscaras de vejigante!`, en: `Find all ${this.masks.length} vejigante masks!` }), 3.5), 400);
    }
  }

  onLang() { this.counters(); }

  // ------------------------------------------------------------ frame
  preUpdate() { this.blockInput = !!this.ui.dlg || this.talking; }

  onPlayerEvents(ev) {
    const P = this.player.pos;
    for (const e of ev) {
      const snd = { step: 'step', stepwood: 'stepwood', jump: 'jump', bigjump: 'bigjump', longjump: 'longjump', walljump: 'walljump', land: 'land', poundstart: 'poundstart', pound: 'pound', dive: 'dive', hat: 'hat', hatjump: 'hatjump', bounce: 'bounce', splash: 'splash', stroke: 'stroke', mantle: 'mantle' }[e];
      if (snd) this.sfx.play(snd);
      if (e === 'pound') {
        this.shock(P.x, P.y + 0.05, P.z);
        this.fx.emit(P.x, P.y + 0.1, P.z, 18, { color: 0xd8c8a8, speed: 6, up: 1.5, life: 0.5, grav: 4 });
        this.cam.shake = 0.25;
        this.onPound();
      } else if (e === 'splash') {
        this.fx.emit(P.x, 0.05, P.z, 22, { color: 0x9fe8ff, speed: 3, up: 5, life: 0.7, grav: 14 });
        this.shock(P.x, 0.03, P.z, 0x9fe8ff);
      } else if (e === 'hatjump' || e === 'walljump') {
        this.fx.emit(P.x, P.y + 0.3, P.z, 10, { color: 0xfff0b0, speed: 3, up: 1, life: 0.4, grav: 0 });
      } else if (e === 'land' && this.player.vel.y === 0) {
        this.fx.emit(P.x, P.y + 0.05, P.z, 5, { color: 0x9a8a70, speed: 2, up: 0.8, life: 0.35, grav: 2 });
      } else if (e === 'bounce') {
        this.fx.emit(P.x, P.y, P.z, 12, { color: 0xffffff, speed: 3, up: 1, life: 0.5, grav: 0 });
      }
    }
  }

  shock(x, y, z, color = 0xffffff) {
    const w = this.waves.find(w => !w.visible) || this.waves[0];
    w.position.set(x, y, z); w.scale.setScalar(0.3); w.visible = true;
    w.material.color.set(color); w.material.opacity = 0.8; w.userData.t = 0;
  }

  onPound() {
    const P = this.player.pos;
    const col = this.player.groundCol;
    if (col && col.tag === 'crate' && col.data) this.breakCrate(col.data);
    for (const s of this.spots) {
      if (s.used) continue;
      if (Math.hypot(s.x - P.x, s.z - P.z) < 1.8 && Math.abs(s.y - P.y) < 1.5) this.useSpot(s);
    }
    for (const c of this.challenges) c.onPound?.(P);
  }

  useSpot(s) {
    s.used = true;
    this.sfx.play('break');
    this.fx.emit(s.x, s.y + 0.3, s.z, 30, { color: 0xffe08a, speed: 4, up: 6, life: 1 });
    this.giveReward(s.reward, s.x, s.y + 1.5, s.z);
    this.save();
  }

  breakCrate(c, silent = false) {
    if (c.broken) return;
    c.broken = true;
    c.mesh.visible = false;
    this.phys.remove(c.col);
    if (silent) return;
    this.sfx.play('break');
    this.fx.emit(c.x, c.y + 0.6, c.z, 20, { color: 0xc08a4a, speed: 5, up: 5, life: 0.8, grav: 14 });
    this.giveReward(c.reward, c.x, c.y + 1.2, c.z);
    this.save();
  }

  giveReward(r, x, y, z) {
    if (!r) return;
    if (r.coins) for (let i = 0; i < r.coins; i++) this.popCoin(x, y, z);
    if (r.mask) this.reveal(r.mask, x, y + 0.6, z);
  }

  popCoin(x, y, z) {
    if (this.dyn.length >= 80) return;
    const a = Math.random() * Math.PI * 2;
    this.dyn.push({ x, y, z, vx: Math.cos(a) * 2.5, vy: 7 + Math.random() * 2, vz: Math.sin(a) * 2.5, t: 0, slot: this.coins.length + this.dyn.length });
  }

  // ---------------------------------------------------------------- talking
  async talkTo(n) {
    this.talking = true;
    this.ui.talkButton(false);
    const P = this.player.pos;
    this.player.face = Math.atan2(n.x - P.x, n.z - P.z);
    this.player.vel.set(0, 0, 0);
    if (!n.fixed) n.m.root.rotation.y = Math.atan2(P.x - n.x, P.z - n.z);
    try { await n.talk(this, n); } finally { this.talking = false; }
  }

  // ---------------------------------------------------------------- timers used by challenges
  startTimer(secs, onFail) {
    this.timerState = { t: secs, onFail, last: Math.ceil(secs) };
  }
  stopTimer() { this.timerState = null; this.ui.timer(null); }

  lightFlag(f, silent) {
    if (f.on) return;
    f.on = true;
    f.mesh.userData.cloth.material = f.mesh.userData.colored;
    if (silent) f.rise = 1;
    if (!silent) {
      this.sfx.play('checkpoint');
      this.ui.toast(t('checkpoint'));
      this.fx.emit(f.x, f.y + 3.2, f.z, 30, { color: 0xffffff, speed: 3, up: 3, life: 0.9 });
      this.fx.emit(f.x, f.y + 3.2, f.z, 20, { color: 0xe3342f, speed: 3, up: 3, life: 0.9 });
      this.lastFlag = f.id;
      this.save();
    }
  }

  collectMask(m) {
    m.got = true;
    m.group.visible = false;
    const p = this.player;
    p.frozen = 2.2; p.celebrate = 2.2; p.vel.x = p.vel.z = 0;
    if (p.state === 'ground') p.vel.y = 6, p.state = 'air';
    this.sfx.play('mask');
    this.ui.banner(t('gotMask'), tr(m.name), 3);
    this.fx.emit(m.x, m.y, m.z, 60, { color: 0xffd060, speed: 6, up: 6, life: 1.2 });
    this.fx.emit(m.x, m.y, m.z, 40, { color: 0xff6a6a, speed: 5, up: 7, life: 1.2 });
    this.counters();
    this.save();
    if (this.masks.every(m => m.got)) setTimeout(() => this.finale(), 3200);
  }

  finale() {
    this.sfx.play('mask');
    this.ui.banner(t('wepa'), t('allMasks'), 6);
    const P = this.player.pos;
    let n = 0;
    const iv = setInterval(() => {
      const x = P.x + (Math.random() - 0.5) * 30, z = P.z + (Math.random() - 0.5) * 30, y = P.y + 12 + Math.random() * 8;
      const cols = [0xe3342f, 0x2a64c8, 0xffffff, 0xf7c948, 0x2e9e5b];
      this.fx.emit(x, y, z, 50, { color: cols[n % cols.length], speed: 8, up: 2, life: 1.4, grav: 3 });
      this.sfx.play('break');
      if (++n > 14) clearInterval(iv);
    }, 380);
  }

  // ---------------------------------------------------------------- main update
  update(dt, inp, now) {
    this.playTime += dt;
    const ui = this.ui, P = this.player.pos;
    if (ui.dlg) {
      if (inp.jumpPressed || inp.talkPressed) ui.advance();
      this.animateOnly(dt, now);
      return;
    }
    const cx = P.x, cy = P.y + 0.55, cz = P.z;
    const hat = this.player.hat, hatOut = hat.state !== 'on';

    // coins (player and thrown hat)
    let changed = false;
    for (const c of this.coins) {
      if (!c.alive) continue;
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
      let got = dx * dx + dz * dz < 1.45 && dy * dy < 1.6; // generous: easy to grab on touch
      if (!got && hatOut) {
        const hx = c.x - hat.pos.x, hy = c.y - hat.pos.y, hz = c.z - hat.pos.z;
        got = hx * hx + hy * hy + hz * hz < 1.0;
      }
      if (got) {
        c.alive = false; this.wallet++; changed = true;
        this.setCoin(c);
        this.sfx.play('coin');
        this.fx.emit(c.x, c.y, c.z, 6, { color: 0xffe08a, speed: 2, up: 2, life: 0.4, grav: 0 });
      }
    }
    // popped coins from crates and spots
    for (let i = this.dyn.length - 1; i >= 0; i--) {
      const d = this.dyn[i];
      d.t += dt;
      d.vy -= 25 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const g = this.phys.groundAt(d.x, d.z, d.y + 0.5).h + 0.45;
      if (d.y < g) { d.y = g; d.vy = Math.abs(d.vy) * 0.45; d.vx *= 0.7; d.vz *= 0.7; }
      const dx = d.x - cx, dy = d.y - cy, dz = d.z - cz;
      if ((d.t > 0.35 && dx * dx + dz * dz < 1.0 && dy * dy < 1.4) || d.t > 12) {
        if (d.t <= 12) { this.wallet++; this.sfx.play('coin'); changed = true; }
        this.dyn.splice(i, 1);
      }
    }
    // conchas
    for (const c of this.conchas) {
      if (!c.alive) continue;
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
      let got = dx * dx + dz * dz < 1.6 && dy * dy < 1.7;
      if (!got && hatOut) { const hx = c.x - hat.pos.x, hy = c.y - hat.pos.y, hz = c.z - hat.pos.z; got = hx * hx + hy * hy + hz * hz < 1.0; }
      if (got) {
        c.alive = false; changed = true;
        this.conchaMesh.setMatrixAt(c.id, ZERO);
        this.conchaMesh.instanceMatrix.needsUpdate = true;
        this.sfx.play('concha');
        this.fx.emit(c.x, c.y, c.z, 14, { color: 0xff9ec4, speed: 3, up: 3, life: 0.6 });
        const left = this.conchas.filter(c => c.alive).length;
        const region = this.shellProgress().find(r => r.id === c.region);
        ui.toast(`${t(`shellRegion_${c.region}`)}: ${region.got}/${region.total} · ${t('conchas')}: ${this.conchaTotal - left}/${this.conchaTotal}`, 2.1);
        this.save();
        if (left === 0) this.onAllConchas?.();
      }
    }
    if (changed) { this.counters(); this.coinSaveT = 1.5; }
    if (this.coinSaveT > 0 && (this.coinSaveT -= dt) <= 0) this.save();

    // masks
    for (const m of this.masks) {
      if (!m.active || m.got) continue;
      if (m.appear > 0) continue;
      const dx = m.x - cx, dy = m.y - cy, dz = m.z - cz;
      if (dx * dx + dz * dz < 1.6 && dy * dy < 1.8) this.collectMask(m);
    }
    // flags
    for (const f of this.flags) {
      if (Math.hypot(f.x - P.x, f.z - P.z) < 1.6 && Math.abs(f.y - P.y) < 2) {
        if (!f.on) this.lightFlag(f);
        else if (this.lastFlag !== f.id) { this.lastFlag = f.id; this.save(); }
      }
    }
    // crates hit by the hat
    if (hatOut) {
      for (const c of this.crates) {
        if (c.broken) continue;
        if (Math.abs(hat.pos.x - c.x) < 0.8 && Math.abs(hat.pos.z - c.z) < 0.8 && hat.pos.y > c.y - 0.2 && hat.pos.y < c.y + 1.4) this.breakCrate(c);
      }
    }
    // NPCs
    let near = null;
    if (this.player.grounded && !this.talking) {
      for (const n of this.npcs) {
        if (n.hidden) continue;
        const d = Math.hypot(n.x - P.x, n.z - P.z);
        if (d < 2.4 && Math.abs(n.y - P.y) < 1.5) { near = n; break; }
      }
    }
    ui.talkButton(near);
    if (near && (inp.talkPressed)) this.talkTo(near);

    for (const c of this.challenges) c.update?.(dt, now);

    if (this.timerState) {
      const ts = this.timerState;
      ts.t -= dt;
      ts.last = Math.ceil(ts.t);
      ui.timer(Math.max(0, ts.t));
      if (ts.t <= 0) {
        // Relaxed on purpose: running out of time never fails a challenge (touch controls are
        // hard to be precise with). The clock just goes away and you finish at your own pace.
        this.timerState = null;
        ui.timer(null);
        ui.toast(t('noRush'), 3);
      }
    }
    this.animateOnly(dt, now);
  }

  // animation that also runs behind the title screen
  animateOnly(dt, now) {
    const spin = now * 2.6;
    tmpQ.setFromEuler(tmpE.set(0, spin, 0));
    tmpS.set(1, 1, 1);
    for (const c of this.coins) {
      if (!c.alive) continue;
      tmpM.compose(tmpV.set(c.x, c.y + Math.sin(now * 2 + c.id) * 0.06, c.z), tmpQ, tmpS);
      this.coinMesh.setMatrixAt(c.id, tmpM);
    }
    for (let i = 0; i < 80; i++) {
      const d = this.dyn[i], slot = this.coins.length + i;
      if (d) { tmpM.compose(tmpV.set(d.x, d.y, d.z), tmpQ, tmpS); this.coinMesh.setMatrixAt(slot, tmpM); }
      else this.coinMesh.setMatrixAt(slot, ZERO);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
    const cq = new THREE.Quaternion().setFromEuler(tmpE.set(0.3, now * 1.5, 0));
    this.conchas.forEach((c, i) => {
      if (!c.alive) return;
      tmpM.compose(tmpV.set(c.x, c.y + Math.sin(now * 1.7 + i) * 0.1, c.z), cq, tmpS);
      this.conchaMesh.setMatrixAt(i, tmpM);
    });
    this.conchaMesh.instanceMatrix.needsUpdate = true;

    for (const m of this.masks) {
      if (!m.group.visible) continue;
      if (m.appear > 0) {
        m.appear = Math.max(0, m.appear - dt * 1.2);
        m.group.scale.setScalar(1 - m.appear);
      }
      m.mesh.rotation.y = now * 1.8;
      m.mesh.position.y = Math.sin(now * 2.2) * 0.15;
      m.beam.material.opacity = 0.16 + Math.sin(now * 3) * 0.05;
    }
    for (const f of this.flags) {
      const cl = f.mesh.userData.cloth;
      // raised flags slide up the pole
      if (f.on && f.rise < 1) f.rise = Math.min(1, f.rise + dt * 1.6);
      const k = 1 - Math.pow(1 - f.rise, 3);
      cl.position.y = 0.5 + k * 2.3;
      // furled (bunched against the pole) until it goes up, then it unfurls as it rises
      const w = 0.28 + 0.72 * k;
      cl.scale.set(w, 1, 1);
      cl.position.x = 0.02 + 0.6 * w;
      const p = cl.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + 0.6;
        p.setZ(i, Math.sin(now * 5 + x * 4) * 0.08 * x);
      }
      p.needsUpdate = true;
    }
    const cam = this.cam.cam.position;
    for (const f of this.flags) f.mesh.visible = Math.hypot(f.x - cam.x, f.z - cam.z) < 90;
    for (const n of this.npcs) {
      if (n.hidden || n.custom) continue;
      n.m.root.visible = Math.hypot(n.x - cam.x, n.z - cam.z) < 70;
      if (!n.m.root.visible) continue;
      n.phase += dt;
      n.m.body.position.y = 0.52 + Math.sin(n.phase * 2) * 0.015;
      n.m.arms[0].rotation.z = 0.1 + Math.sin(n.phase * 1.3) * 0.08;
      n.m.headPivot.rotation.y = Math.sin(n.phase * 0.7) * 0.3;
      const P = this.player.pos;
      if (Math.hypot(n.x - P.x, n.z - P.z) < 6) {
        const want = Math.atan2(P.x - n.x, P.z - n.z);
        let d = want - n.m.root.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        n.m.root.rotation.y += d * Math.min(1, dt * 4);
      }
      n.anim?.(dt, now);
    }
    // underwater coins twinkle so they're easy to spot from the surface
    if ((this.twinkleT = (this.twinkleT || 0) - dt) < 0) {
      this.twinkleT = 0.08;
      const P = this.player.pos;
      for (let tries = 0; tries < 6; tries++) {
        const c = this.coins[(Math.random() * this.coins.length) | 0];
        if (c && c.alive && c.y < 0 && Math.hypot(c.x - P.x, c.z - P.z) < 30) {
          this.fx.emit(c.x, c.y + 0.3, c.z, 1, { color: 0xffe08a, speed: 0.1, up: 0.5, life: 0.6, grav: 0 });
          break;
        }
      }
    }
    for (const s of this.spots) {
      if (s.used) continue;
      s.t += dt;
      const P = this.player.pos;
      if (s.t > 0.25 && Math.hypot(s.x - P.x, s.z - P.z) < 30) {
        s.t = 0;
        this.fx.emit(s.x + (Math.random() - 0.5) * 1.2, s.y + 0.1, s.z + (Math.random() - 0.5) * 1.2, 1, { color: 0xfff2a0, speed: 0.2, up: 0.8, life: 0.9, grav: -0.5 });
      }
    }
    for (const w of this.waves) {
      if (!w.visible) continue;
      w.userData.t += dt;
      const k = w.userData.t / 0.45;
      w.scale.setScalar(0.3 + k * 3.5);
      w.material.opacity = 0.8 * (1 - k);
      if (k >= 1) w.visible = false;
    }
    for (const a of this.animals) a.update(dt, now);
    if (this.cam) this.updateMarkers(dt, now);
    for (const c of this.challenges) c.animate?.(dt, now);
    this.fx.update(dt);
  }
}
