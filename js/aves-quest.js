// El Club de Observación de Aves: the little woods behind the beach (top right of the map) are,
// in real life, a known cruising spot. The joke: the "birdwatchers" have been "observing" in the
// bushes and dropped their things, and now they're too embarrassed to come out. Walk up to the
// rustling bushes, a flustered guy pops out, you get his stuff back, and the Club raises a Pride
// flag and gives you a rainbow vejigante mask. Progress lives in q.aves (0 new, 1 searching,
// 2 found everyone, 3 done) and q.avesFound (which bushes).
import * as THREE from 'three';
import { tr } from './i18n.js';

const line = (es, en) => ({ es, en });

const MEMBERS = [
  { name: 'Junito', look: { skin: 0xc08a60, hair: 0x1f1a16, shirt: 0xff6fae, bottom: 0x2f6fd0, hat: 'none', stache: true },
    item: 'binoculars', itemName: line('los binoculares de Junito', "Junito's binoculars"),
    pop: line('¡AY! ¡Me asustaste! Estaba... observando un zumbador. ¡Mis binoculares! ¡Gracias, mi amor!', "AY! You scared me! I was... watching a hummingbird. My binoculars! Thanks, love!"),
    after: line('¿Tú también vienes a observar aves? Aquí se ven unos ejemplares... ¡increíbles!', 'You come here to birdwatch too? You see some... incredible specimens here!') },
  { name: 'Papo', look: { skin: 0x8d5a3b, hair: 0x111111, shirt: 0x2e9e5b, bottom: 0xf0e0b0, hat: 'cap', hatColor: 0xf7c948 },
    item: 'fannypack', itemName: line('la riñonera de Papo', "Papo's fanny pack"),
    pop: line('¡Aquí no hay nada que ver! ...Bueno, sí: un pitirre precioso. ¿Mi riñonera? ¡Qué alivio!', "Nothing to see here! ...Well, yes: a gorgeous kingbird. My fanny pack? What a relief!"),
    after: line('Yo vengo aquí todos los días. Por la naturaleza. Obviamente.', 'I come here every day. For the nature. Obviously.') },
  { name: 'Kelvin', look: { skin: 0xe8bf98, hair: 0x8a5a2a, shirt: 0xffffff, bottom: 0xe3342f, hat: 'none' },
    item: 'flipflop', itemName: line('la chancleta de Kelvin', "Kelvin's flip-flop"),
    pop: line('¡Wepa! Tú no me viste aquí. ¿Mi chancleta? Llevo una hora caminando cojo.', "Wepa! You didn't see me here. My flip-flop? I've been limping around for an hour."),
    after: line('Si alguien pregunta, estábamos haciendo senderismo.', 'If anyone asks, we were hiking.') },
  { name: 'Toño', look: { skin: 0x5a3a26, hair: 0xdddddd, shirt: 0x8a5ac8, bottom: 0x222222, hat: 'pava', stache: true },
    item: 'bandana', itemName: line('la bandana arcoíris de Toño', "Toño's rainbow bandana"),
    pop: line('¡Ay, perdón! Buscaba mi bandana arcoíris por todo el monte. ¡Eres un ángel!', "Oh, sorry! I was looking all over the bushes for my rainbow bandana. You're an angel!"),
    after: line('Llevo treinta años observando aves aquí. Y ninguna era un ave.', "I've been birdwatching here for thirty years. Not one of them was a bird.") },
];

function itemMesh(kind) {
  const o = new THREE.Group();
  const m = c => new THREE.MeshLambertMaterial({ color: c });
  if (kind === 'binoculars') {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 10), m(0x222222));
      t.rotation.x = Math.PI / 2; t.position.x = s * 0.12; o.add(t);
    }
  } else if (kind === 'fannypack') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.16), m(0x2fbfbf)); o.add(b);
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 4, 16), m(0x222222)); s.rotation.x = Math.PI / 2; o.add(s);
  } else if (kind === 'flipflop') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), m(0xf7c948)); o.add(b);
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 10, Math.PI), m(0xe3342f)); s.position.y = 0.03; o.add(s);
  } else {
    const cols = [0xe3342f, 0xff8a3d, 0xf7c948, 0x2e9e5b, 0x2f6fd0, 0x8a5ac8];
    cols.forEach((c, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.07), m(c)); b.position.set(0, 0.02, (i - 2.5) * 0.07); o.add(b); });
  }
  o.scale.setScalar(1.4);
  return o;
}

function prideTexture() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  ['#e3342f', '#ff8a3d', '#f7c948', '#2e9e5b', '#2f6fd0', '#8a5ac8'].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 64 / 6, 96, 64 / 6 + 1); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildAvesQuest(g, { top, H, onLane, dist2, center }) {
  const { phys, data } = g;
  const stage = () => g.q.aves || 0;
  const found = () => g.q.avesFound || [];

  // ---------------------------------------------------------------- where: the woods by the beach
  // the forest block between the road and the beach (top right of the map); `center` is its middle,
  // and the LiDAR canopy map says which spots around it are actually wooded
  const pts = [];
  const [cx, cz] = center;
  for (let z = cz - 60; z < cz + 60; z += 3) {
    for (let x = cx - 60; x < cx + 60; x += 3) {
      if (dist2(x, z, cx, cz) < 60 && data.canopyH(x, z) > 3 && H(x, z) > 0.3) pts.push([x, z]);
    }
  }
  if (pts.length < 20) return; // no woods found: skip the quest
  const open = (x, z, r = 1) => H(x, z) > 0.3 && !onLane(x, z)
    && !phys.near(x, z, r + 0.5).some(c => (c.solid || c.tag === 'canopy') && c.maxx > x - r && c.minx < x + r && c.maxz > z - r && c.minz < z + r);
  // the Club meets in the sandy clearing closest to the heart of the woods
  let club = null;
  for (let r = 0; r < 60 && !club; r += 1.5) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (data.canopyH(x, z) < 1 && open(x, z, 2.5)) { club = { x, z }; break; }
    }
  }
  if (!club) return;
  // four rustling bushes spread through the woods, each by an open spot so you can walk up to it
  const bushes = [];
  const shuffled = pts.slice().sort((p, q) => ((p[0] * 7 + p[1] * 13) % 11) - ((q[0] * 7 + q[1] * 13) % 11));
  for (const [x, z] of shuffled) {
    if (bushes.length === 4) break;
    if (dist2(x, z, club.x, club.z) < 12 || bushes.some(q => dist2(q.x, q.z, x, z) < 14)) continue;
    if (!open(x, z, 0.9)) continue;
    bushes.push({ x, z, y: H(x, z) });
  }
  if (bushes.length < 4) return;

  // ---------------------------------------------------------------- the bushes (they wiggle)
  const leaf = [0x3d7f37, 0x4f9140, 0x2f7436];
  bushes.forEach((q, i) => {
    const o = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshLambertMaterial({ color: leaf[k % 3], flatShading: true }));
      const a = k / 4 * Math.PI * 2 + i;
      m.position.set(Math.cos(a) * 0.5 * (k ? 1 : 0), 0.6 + (k ? 0 : 0.35), Math.sin(a) * 0.5 * (k ? 1 : 0));
      m.scale.set(1.2, 0.9, 1.2);
      m.castShadow = true;
      o.add(m);
    }
    o.position.set(q.x, q.y, q.z);
    g.root.add(o);
    q.mesh = o; q.member = MEMBERS[i]; q.idx = i;
  });

  // ---------------------------------------------------------------- the Club: Wilfredo and the members
  const clubY = top(club.x, club.z);
  const face = Math.atan2(cx - club.x, cz - club.z) + Math.PI; // his back to the woods
  const wil = g.npc({ skin: 0xa06848, hair: 0x2a2a2a, shirt: 0xf7c948, bottom: 0x2f6fd0, hat: 'pava', stache: true },
    'Wilfredo', club.x, club.z, face, () => talkWil());
  // binoculars around his neck
  const bino = itemMesh('binoculars'); bino.scale.setScalar(0.7); bino.position.set(0, 0.3, 0.25);
  wil.m.body.add(bino);
  wil.quest = () => (stage() === 0 ? 'available' : stage() === 2 ? 'active' : null);

  const people = MEMBERS.map((mb, i) => {
    const n = g.npc(mb.look, mb.name, club.x, club.z, 0, async () => g.ui.say(mb.name, [mb.after]), { custom: true });
    n.m.root.visible = false; n.hidden = true;
    n.slot = { x: club.x + Math.cos(i * 1.6 + 0.8) * 3.2, z: club.z + Math.sin(i * 1.6 + 0.8) * 3.2 };
    return n;
  });
  const place = (n, x, z) => { n.x = x; n.z = z; n.y = top(x, z); n.m.root.position.set(x, n.y, z); };

  // the flagpole goes up at the clearing; the flag rises when the quest is done
  const poleX = club.x - Math.sin(face) * 2.5, poleZ = club.z - Math.cos(face) * 2.5, poleY = top(poleX, poleZ);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(poleX, poleY + 2.5, poleZ); pole.castShadow = true;
  g.root.add(pole);
  phys.addBox(poleX, poleZ, 0.1, 0.1, 0, poleY, poleY + 5, { tag: 'post' });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshLambertMaterial({ map: prideTexture(), side: THREE.DoubleSide }));
  flag.geometry.translate(0.9, -0.6, 0);
  flag.position.set(poleX + 0.07, poleY + 0.8, poleZ);
  flag.visible = false;
  g.root.add(flag);
  let flagT = -1;

  // coin trails from the clearing to each bush, so the woods are worth exploring anyway
  for (const q of bushes) {
    const dx = q.x - club.x, dz = q.z - club.z, d = Math.hypot(dx, dz);
    const n = Math.min(10, Math.floor(d / 3));
    for (let i = 1; i < n; i++) {
      const x = club.x + dx * i / n, z = club.z + dz * i / n;
      if (H(x, z) > 0.3) g.coin(x, top(x, z) + 0.9, z);
    }
  }

  g.mask('arcoiris', line('La máscara arcoíris del Club de Aves', "The Bird Club's rainbow mask"), club.x, clubY + 1.8, club.z, true, 'rainbow');

  // ---------------------------------------------------------------- talking
  async function talkWil() {
    const s = stage();
    if (s === 0) {
      await g.ui.say('Wilfredo', [
        line(`¡Shhh! Bienvenido, ${g.playerName}, al Club de Observación de Aves de La Guancha.`, `Shhh! Welcome, ${g.playerName}, to the La Guancha Birdwatching Club.`),
        line('Aquí observamos... aves. Muchísimas aves. Todo tipo de aves.', 'Here we observe... birds. So many birds. All kinds of birds.'),
        line('El problema: los muchachos andaban "observando" entre los arbustos y se les regaron sus cositas. Ahora les da vergüenza salir.', 'The problem: the boys were "observing" in the bushes and dropped their things. Now they are too embarrassed to come out.'),
        line('Si ves un arbusto que se mueve solo, acércate. No preguntes. Tráemelos a todos y hacemos una fiestecita.', "If you see a bush moving by itself, walk up to it. Don't ask. Bring them all back and we'll have a little party."),
      ]);
      g.q.aves = 1; g.save();
      return;
    }
    if (s === 1) {
      return g.ui.say('Wilfredo', [line(`Faltan ${4 - found().length}. Los arbustos que se mueven... esos.`, `${4 - found().length} to go. The bushes that move... those ones.`)]);
    }
    if (s === 2) {
      await g.ui.say('Wilfredo', [
        line('¡Los encontraste a todos! Y con sus cositas y todo. Eres un excelente observador.', 'You found them all! Things and all. You are an excellent observer.'),
        line('Te nombramos miembro honorario del Club. ¡Suban la bandera, muchachos!', 'We name you an honorary member of the Club. Raise the flag, boys!'),
      ]);
      g.q.aves = 3; g.save();
      flagT = 0; flag.visible = true;
      g.sfx.play('checkpoint');
      g.fx.emit(poleX, poleY + 4, poleZ, 60, { color: 0xff6fae, speed: 5, up: 5, life: 1.6 });
      setTimeout(async () => {
        const P = g.player.pos;
        g.reveal('arcoiris', P.x, P.y + 1.8, P.z);
        await g.ui.say('Wilfredo', [line('Toma: la máscara arcoíris del Club. Llévala con orgullo. 🌈', "Here: the Club's rainbow mask. Wear it with pride. 🌈")]);
      }, 3200);
      return;
    }
    return g.ui.say('Wilfredo', [line('¡Nuestro miembro honorario! Ven cuando quieras a... observar.', 'Our honorary member! Come by anytime to... observe.')]);
  }

  // ---------------------------------------------------------------- per frame
  const tmpV = new THREE.Vector3();
  const flying = [];
  let jitter = 0;
  const avesC = g.challenge({
    onLoad() {
      const s = stage(), f = found();
      bushes.forEach(q => {
        const done = f.includes(q.idx) || s >= 2;
        q.popped = done;
        if (done) { const n = people[q.idx]; n.m.root.visible = true; n.hidden = false; place(n, n.slot.x, n.slot.z); }
      });
      if (s >= 3) { flag.visible = true; flagT = 99; }
    },
    objective() {
      const s = stage();
      if (s === 0) return { x: club.x, y: clubY, z: club.z, label: line('Club de Observación de Aves', 'Birdwatching Club'), idle: true };
      if (s === 1) {
        const P = g.player.pos;
        const left = bushes.filter(q => !q.popped).sort((a, c) => dist2(a.x, a.z, P.x, P.z) - dist2(c.x, c.z, P.x, P.z))[0];
        return left && { x: left.x, y: left.y, z: left.z, label: line(`Arbusto sospechoso (${found().length}/4)`, `Suspicious bush (${found().length}/4)`) };
      }
      if (s === 2) return { x: club.x, y: clubY, z: club.z, label: line('Regresa donde Wilfredo', 'Go back to Wilfredo') };
      return null;
    },
    update(dt) {
      if (stage() !== 1) return;
      const P = g.player.pos;
      for (const q of bushes) {
        if (q.popped || dist2(q.x, q.z, P.x, P.z) > 2.4) continue;
        // out he pops
        q.popped = true;
        const n = people[q.idx];
        n.m.root.visible = true; n.hidden = false;
        place(n, q.x, q.z);
        n.pop = 0.6; n.walk = null;
        g.sfx.play('bounce');
        g.fx.emit(q.x, q.y + 1, q.z, 24, { color: 0x4f9140, speed: 3, up: 3, life: 0.7 });
        const it = itemMesh(q.member.item);
        it.position.set(q.x, q.y + 1.2, q.z);
        g.root.add(it);
        flying.push({ it, t: 0 });
        g.q.avesFound = [...found(), q.idx];
        const all = g.q.avesFound.length >= 4;
        if (all) g.q.aves = 2;
        g.save();
        g.ui.say(q.member.name, [q.member.pop]).then(() => {
          g.ui.toast(`✅ ${tr(q.member.itemName)} (${g.q.avesFound.length}/4)`, 2.5);
          n.walk = n.slot; // off to the clearing, trying to look casual
          if (all) g.ui.toast(tr(line('¡Los encontraste a todos! Regresa donde Wilfredo.', 'You found them all! Go back to Wilfredo.')), 3.5);
        });
      }
    },
    animate(dt, now) {
      jitter += dt;
      // rustling bushes shake every so often
      for (const q of bushes) {
        if (!q.mesh) continue;
        if (q.popped) { q.mesh.rotation.set(0, 0, 0); continue; }
        const shake = Math.sin(now * 1.3 + q.idx * 2) > 0.55 ? Math.sin(now * 30 + q.idx) * 0.08 : 0;
        q.mesh.rotation.set(shake, 0, shake * 0.7);
        if (shake && Math.random() < dt * 4) g.fx.emit(q.x, q.y + 1.2, q.z, 1, { color: 0x6fae4a, speed: 1, up: 1.5, life: 0.6 });
      }
      // items fly to the player
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t += dt;
        const P = g.player.pos;
        tmpV.set(P.x, P.y + 1.2, P.z);
        f.it.position.lerp(tmpV, Math.min(1, dt * 4));
        f.it.position.y += Math.sin(f.t * Math.PI) * 0.1;
        f.it.rotation.y += dt * 8;
        if (f.t > 0.9) { f.it.removeFromParent(); flying.splice(i, 1); g.sfx.play('coin'); }
      }
      // members: startled hop, a casual walk to the clearing, then a little dance once the flag is up
      for (const n of people) {
        if (!n.m.root.visible) continue;
        if (n.pop > 0) { n.pop -= dt; n.m.root.position.y = n.y + Math.sin((0.6 - n.pop) / 0.6 * Math.PI) * 0.8; continue; }
        if (n.walk && !g.ui.dlg) {
          const dx = n.walk.x - n.x, dz = n.walk.z - n.z, d = Math.hypot(dx, dz);
          if (d < 0.2) n.walk = null;
          else {
            const st = Math.min(d, 3 * dt);
            place(n, n.x + dx / d * st, n.z + dz / d * st);
            n.m.root.rotation.y = Math.atan2(dx, dz);
            const sw = Math.sin(now * 9) * 0.5;
            n.m.legs[0].rotation.x = sw; n.m.legs[1].rotation.x = -sw;
          }
          continue;
        }
        n.m.legs[0].rotation.x = n.m.legs[1].rotation.x = 0;
        if (stage() >= 3) {
          n.m.root.position.y = n.y + Math.abs(Math.sin(now * 5 + n.x)) * 0.18;
          n.m.arms[0].rotation.z = 2.4 + Math.sin(now * 5 + n.z) * 0.4;
          n.m.arms[1].rotation.z = -2.4 - Math.sin(now * 5 + n.z) * 0.4;
          n.m.root.rotation.y = Math.atan2(poleX - n.x, poleZ - n.z);
        }
      }
      // the Pride flag goes up and waves
      if (flagT >= 0) {
        flagT += dt;
        flag.position.y = poleY + 0.8 + Math.min(1, flagT / 3) * 3.9;
        flag.rotation.y = Math.sin(now * 2) * 0.25;
      }
    },
  });

  g.quest({ id: 'aves', name: line('Club de Observación de Aves', 'Birdwatching Club'), giver: 'Wilfredo', challenge: avesC,
    desc: line('A los "observadores de aves" del bosquecito se les regaron sus cosas entre los arbustos.', 'The "birdwatchers" in the little woods dropped their things in the bushes.'),
    progress: () => (stage() === 1 ? `${found().length}/4` : ''),
    status: () => (stage() >= 3 ? 'done' : stage() >= 1 ? 'active' : 'available'),
    where: () => ({ x: club.x, y: clubY, z: club.z, label: line('Habla con Wilfredo', 'Talk to Wilfredo') }) });
}
