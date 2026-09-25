// Marina's sea race (idea and first draft by ChatGPT/Codex). She lends you a jet ski and you race
// her through eight rings out on the water, in order. The jet ski has its own small controller
// (main.js calls drive() instead of player.update while riding) so swimming and jumping keep
// their physics; you're dropped back on the boardwalk after each run. Rematches are unlimited.
import * as THREE from 'three';
import { tr } from './i18n.js';
import { ringMesh } from './models.js';

const Q = (es, en) => ({ es, en });
const tint = (ring, hex) => { ring.material.color.setHex(hex); ring.material.emissive.setHex(hex); };
const TOP = 17;          // jet ski top speed (units/s)
const RIVAL = 10.5;      // Marina's speed: beatable with clean lines, not by just holding forward

function skiMesh(color, rider = false) {
  const root = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23364b });
  const white = new THREE.MeshLambertMaterial({ color: 0xf3f4e8 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m;
  };
  add(new THREE.SphereGeometry(0.65, 10, 7), paint, 0, 0.16, 0).scale.set(1, 0.37, 2.1);
  add(new THREE.ConeGeometry(0.58, 1.05, 8), paint, 0, 0.2, 1.1).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.45, 0.18, 0.8), dark, 0, 0.42, -0.25);
  add(new THREE.BoxGeometry(0.85, 0.06, 0.08), white, 0, 0.7, 0.35);
  add(new THREE.BoxGeometry(0.06, 0.24, 0.06), dark, 0, 0.57, 0.35);
  if (rider) {
    add(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshLambertMaterial({ color: 0xa77753 }), 0, 1.14, -0.25);
    add(new THREE.CylinderGeometry(0.17, 0.22, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0xe34552 }), 0, 0.79, -0.25);
    add(new THREE.SphereGeometry(0.22, 9, 6), dark, 0, 1.29, -0.25).scale.y = 0.4;
  }
  return root;
}

export function buildJetskiQuest(g, along, fromNorth, deckY) {
  const H = g.data.terrainH, phys = g.phys;
  const wet = (x, z) => H(x, z) < -0.8;
  // distance to the nearest boat, pier, piling or seawall (anything solid above the water)
  const clearance = (x, z) => {
    if (H(x, z) > -1) return 0;
    let d = 10;
    for (const c of phys.near(x, z, 10)) {
      if (!c.solid || c.y1 < -0.3) continue;
      const q = phys.sdist(c, x, z);
      d = Math.min(d, q.inside ? 0 : q.d);
    }
    return d;
  };
  const lineClear = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (let k = 1; k < n; k++) if (clearance(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n) < 2.5) return false;
    return true;
  };
  // Marina stands on the deck by the water-side railing, her jet ski just below
  const dock = along(fromNorth(0.18), 2.1);
  let start = along(fromNorth(0.18), 12);
  for (let off = 12; clearance(start.x, start.z) < 3 && off < 40; off += 2) start = along(fromNorth(0.18), off);
  // [fraction along the boardwalk, meters out to sea]: a slalom out along the boardwalk, a wide
  // turn in the open bay, and a sweep back that finishes by Marina. Each ring moves to the
  // nearest spot with room around it and a clear straight line from the previous one.
  const plan = [[0.26, 20], [0.42, 28], [0.58, 20], [0.74, 32], [0.72, 62], [0.52, 84], [0.34, 66], [0.22, 36]];
  const points = [];
  let prev = start;
  for (const [f, off] of plan) {
    let best = null;
    for (let r = 0; r <= 24 && !best; r += 2) {
      for (let a = 0; a < 16; a++) {
        const df = r ? Math.cos(a / 16 * Math.PI * 2) * r / 228 : 0, dOff = r ? Math.sin(a / 16 * Math.PI * 2) * r : 0;
        const p = along(fromNorth(Math.min(0.95, Math.max(0.05, f + df))), off + dOff);
        if (clearance(p.x, p.z) >= 5 && lineClear(prev, p)) { best = p; break; }
        if (!r) break;
      }
    }
    best ||= along(fromNorth(f), off);
    points.push(new THREE.Vector3(best.x, 1.35, best.z));
    prev = best;
  }
  const face = Math.atan2(points[0].x - start.x, points[0].z - start.z);
  // Marina starts beside you and follows the same clear lines between the rings
  const rivalPath = [new THREE.Vector3(start.x + Math.cos(face) * 2.5, 0.1, start.z - Math.sin(face) * 2.5),
    ...points.map(p => new THREE.Vector3(p.x, 0.1, p.z))];
  const lengths = rivalPath.slice(1).map((p, i) => p.distanceTo(rivalPath[i]));
  const total = lengths.reduce((a, b) => a + b, 0);

  for (const p of points) g.coin(p.x, 1.1, p.z); // a chavo in each ring, yours to keep win or lose
  const rings = points.map((p, i) => {
    const m = ringMesh(i === 0 ? 0x44e6b6 : 0x58c5fa);
    const from = points[i - 1] || new THREE.Vector3(start.x, 1.35, start.z);
    m.position.copy(p);
    m.rotation.y = Math.atan2(p.x - from.x, p.z - from.z);
    m.scale.setScalar(1.25);
    m.visible = false;
    g.root.add(m);
    return m;
  });
  const ski = skiMesh(0xf4c543);
  ski.position.set(start.x, 0.1, start.z); ski.rotation.y = face;
  g.root.add(ski);
  const rival = skiMesh(0xe34552, true);
  rival.position.copy(rivalPath[0]); rival.rotation.y = face;
  g.root.add(rival);

  const marina = g.npc({ skin: 0xa77753, hair: 0x25202a, shirt: 0xe34552, bottom: 0x253d65, hat: 'cap', hatColor: 0x253d65 },
    'Marina', dock.x, dock.z, Math.atan2(dock.nx, dock.nz), async () => {
      if (race.riding) return;
      const done = !!g.q.jetski;
      const lines = done ? [
        Q(`¡Esa vuelta fue de campeonato, ${g.playerName}! Tu mejor tiempo: ${g.q.jetskiBest ?? '—'} segundos.`, `That was a championship lap, ${g.playerName}! Your best time: ${g.q.jetskiBest ?? '—'} seconds.`),
        Q('¿Otra vuelta para bajar ese tiempo?', 'Another lap to beat that time?'),
      ] : [
        Q(`¡Oye, ${g.playerName}! Soy Marina. ¿Te atreves a correr conmigo en motora acuática?`, `Hey, ${g.playerName}! I'm Marina. Dare to race me on a jet ski?`),
        Q('Pasa por los ocho aros en orden; el verde es el próximo. La palanca acelera y gira, y ⤒ te baja si te quieres rendir.', 'Go through all eight rings in order; the green one is next. The stick speeds up and steers, and ⤒ gets you off if you give up.'),
        Q('Si llegas antes que yo, te ganas una máscara. Si no, la revancha es gratis.', 'Beat me to the last ring and you win a mask. If not, rematches are free.'),
      ];
      const choice = await g.ui.say('Marina', lines, [
        { label: Q(done ? 'Otra vuelta' : '¡A correr!', done ? 'Another lap' : "Let's race!"), value: 'race', primary: true },
        { label: Q('Ahora no', 'Not now'), value: 'later' },
      ]);
      if (choice === 'race') race.start();
    }, { y: deckY });

  const tmpP = new THREE.Vector3(), tmpV = new THREE.Vector3();
  const race = g.challenge({
    riding: false, next: 0, speed: 0, elapsed: 0, rivalDistance: 0, wake: 0,
    objective() {
      if (!this.riding) return null;
      const p = points[this.next];
      return p && { x: p.x, y: 0, z: p.z, label: Q(`Aro ${this.next + 1}/${rings.length}`, `Ring ${this.next + 1}/${rings.length}`) };
    },
    start() {
      this.riding = true; this.next = 0; this.speed = 0; this.elapsed = 0; this.rivalDistance = 0; this.wake = 0;
      const p = g.player;
      p.events.length = 0;
      if (p.hat.state !== 'on') { // a thrown pava comes straight back
        p.hat.state = 'on'; p.hatMesh.position.set(0, 0, 0); p.hatMesh.rotation.set(0, 0, 0); p.m.hatSlot.add(p.hatMesh);
      }
      p.pos.set(start.x, 0.55, start.z); p.vel.set(0, 0, 0); p.face = face; p.state = 'jetski';
      p.blob.visible = false;
      ski.position.set(start.x, 0.1, start.z); ski.rotation.set(0, face, 0);
      rival.position.copy(rivalPath[0]); rival.rotation.set(0, face, 0);
      rings.forEach((r, i) => { r.visible = true; tint(r, i === 0 ? 0x44e6b6 : 0x58c5fa); });
      g.cam.snap(p);
      g.ui.banner(tr(Q('¡Salida!', 'Go!')), tr(Q('Sigue el aro verde', 'Follow the green ring')), 1.7);
      g.sfx.play('ring');
    },
    leave(result) {
      this.riding = false; this.speed = 0;
      rings.forEach(r => (r.visible = false));
      ski.position.set(start.x, 0.1, start.z); ski.rotation.set(0, face, 0);
      rival.position.copy(rivalPath[0]); rival.rotation.set(0, face, 0);
      g.ui.prog('');
      const p = g.player;
      p.blob.visible = true;
      p.teleport(dock.x - dock.nx * 1.2, deckY + 0.3, dock.z - dock.nz * 1.2, Math.atan2(dock.nx, dock.nz));
      g.cam.snap(p);
      if (result === 'win') {
        const t = Math.round(this.elapsed * 10) / 10;
        if (!g.q.jetskiBest || t < g.q.jetskiBest) g.q.jetskiBest = t;
        if (!g.q.jetski) { g.q.jetski = true; g.reveal('jetski', dock.x, deckY + 1.7, dock.z); }
        g.save();
        g.ui.banner(tr(Q('¡Le ganaste a Marina!', 'You beat Marina!')), `${t.toFixed(1)} s`, 3);
      } else if (result === 'lose') {
        g.ui.banner(tr(Q('¡Marina llegó primero!', 'Marina got there first!')), tr(Q('Habla con ella para la revancha', 'Talk to her for a rematch')), 3);
      } else {
        g.ui.toast(tr(Q('Vuelve cuando quieras para otra carrera.', 'Come back any time for another race.')), 3);
      }
    },
    // called by main.js instead of player.update while riding
    drive(dt, inp) {
      if (!this.riding) return;
      if (inp.jumpPressed) { this.leave('quit'); return; }
      const p = g.player;
      const throttle = Math.max(-0.4, Math.min(1, inp.my || 0));
      const target = throttle > 0 ? throttle * TOP : throttle * 6;
      this.speed += (target - this.speed) * Math.min(1, dt * (throttle ? 1.9 : 1.4));
      // the camera sits behind, so stick right turns right (heading angle goes down)
      p.face -= (inp.mx || 0) * dt * (1.2 + Math.abs(this.speed) * 0.06);
      tmpP.set(p.pos.x + Math.sin(p.face) * this.speed * dt, 0.1, p.pos.z + Math.cos(p.face) * this.speed * dt);
      tmpV.set(Math.sin(p.face) * this.speed, 0, Math.cos(p.face) * this.speed);
      // boats, pilings, piers and the seawall push back like walls
      // boats, pilings, piers and the seawall push back; you slide along them instead of sticking
      if (phys.resolve(tmpP, 0.8, 1.1, tmpV).wall) {
        const fwd = tmpV.x * Math.sin(p.face) + tmpV.z * Math.cos(p.face);
        this.speed = Math.sign(fwd) * Math.min(Math.abs(this.speed), Math.hypot(tmpV.x, tmpV.z));
      }
      const b = g.data.bounds;
      if (wet(tmpP.x, tmpP.z) && tmpP.x > b.x0 + 3 && tmpP.x < b.x1 - 3 && tmpP.z > b.z0 + 3 && tmpP.z < b.z1 - 3) {
        p.pos.x = tmpP.x; p.pos.z = tmpP.z;
      } else this.speed *= 0.5;
      p.pos.y = 0.55 + Math.sin(this.elapsed * 8) * 0.03;
      p.vel.set(Math.sin(p.face) * this.speed, 0, Math.cos(p.face) * this.speed);
      const lean = -(inp.mx || 0);
      p.m.root.position.copy(p.pos); p.m.root.rotation.y = p.face;
      p.m.body.position.y = 0.36; p.m.body.rotation.set(0.12, 0, lean * 0.15);
      p.m.headPivot.rotation.set(0, 0, 0);
      p.m.arms.forEach(a => { a.rotation.x = -1.1; a.rotation.z = 0; });
      p.m.legs.forEach(a => { a.rotation.x = -1.3; a.rotation.z = 0; });
      ski.position.set(p.pos.x, 0.1 + Math.sin(this.elapsed * 8) * 0.03, p.pos.z);
      ski.rotation.set(0, p.face, lean * 0.08);
      this.elapsed += dt;
    },
    update(dt) {
      if (!this.riding) return;
      const p = g.player.pos;
      const target = points[this.next];
      if (target && Math.hypot(p.x - target.x, p.z - target.z) < 2.6) {
        rings[this.next].visible = false;
        g.sfx.play('ring');
        g.fx.emit(target.x, target.y, target.z, 18, { color: 0x7af4cc, speed: 3, up: 1.5, life: 0.6, grav: 0 });
        this.next++;
        if (this.next === rings.length) { this.leave(this.rivalDistance < total ? 'win' : 'lose'); return; }
        tint(rings[this.next], 0x44e6b6);
      }
      this.rivalDistance = Math.min(total, this.rivalDistance + dt * RIVAL);
      let d = this.rivalDistance, seg = 0;
      while (seg < lengths.length - 1 && d > lengths[seg]) d -= lengths[seg++];
      const a = rivalPath[seg], b = rivalPath[seg + 1], f = Math.min(1, d / lengths[seg]);
      rival.position.lerpVectors(a, b, f);
      rival.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const lead = this.rivalDistance >= total ? tr(Q(' · ¡Marina llegó!', ' · Marina finished!')) : '';
      g.ui.prog(`🏁 ${this.next}/${rings.length} · ${this.elapsed.toFixed(1)} s${lead}`);
      if ((this.wake -= dt) <= 0 && this.speed > 5) {
        this.wake = 0.15;
        g.fx.emit(p.x - Math.sin(g.player.face) * 1.2, 0.05, p.z - Math.cos(g.player.face) * 1.2, 3,
          { color: 0xc7f5ff, speed: 1.3, up: 0.5, life: 0.5, grav: 0 });
      }
    },
    animate(dt, now) {
      if (!this.riding) { rival.position.y = 0.1 + Math.sin(now * 1.5) * 0.04; ski.position.y = 0.1 + Math.sin(now * 1.5 + 1) * 0.04; return; }
      for (let i = this.next; i < rings.length; i++) rings[i].rotation.z = Math.sin(now * 2 + i) * 0.07;
      rival.rotation.z = Math.sin(now * 8) * 0.03;
    },
  });
  g.jetski = race;
  marina.quest = () => (g.q.jetski ? null : race.riding ? 'active' : 'available');
  g.quest({ id: 'jetski', name: Q('La carrera de Marina', "Marina's jet ski race"), giver: 'Marina', challenge: race,
    desc: Q('Corre contra Marina en motora acuática: pasa por ocho aros en el mar, en orden, y llega antes que ella para ganar una máscara. La revancha es gratis.',
      'Race Marina on a jet ski: pass through eight rings out on the sea, in order, and finish before her to win a mask. Rematches are free.'),
    progress: () => (race.riding ? `${race.next}/${rings.length}` : ''),
    status: () => (g.q.jetski ? 'done' : race.riding ? 'active' : 'available'),
    where: () => ({ x: dock.x, y: deckY, z: dock.z, label: Q('Habla con Marina', 'Talk to Marina') }),
  });
}
