// La Guancha level design: masks, challenges, NPCs, coins, conchas, flags and animals.
// Positions come from the real map (local meters -> L()) or from structures the world builder found.
import * as THREE from 'three';
import { S } from './data.js';
import { t, tr } from './i18n.js';
import * as M from './models.js';
import { Batch, P, rng } from './geo.js';
import { buildProps } from './props.js';
import { buildCrowd, FOOD_LINES } from './npcs.js';
import { buildMothQuest } from './moth-quest.js';

const L = (x, y) => [x * S, -y * S];
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function defineLevel(g) {
  const { phys, world, data, scene } = g;
  const info = world.info;
  const H = data.terrainH;
  const R = rng(42);
  const top = (x, z) => phys.topMost(x, z);
  const props = new Batch(80);
  const tw = info.tower;
  const deckY = info.deckY;

  // ---------------------------------------------------------------- boardwalk helpers
  const tab = info.tablado[0];
  const segs = [];
  let total = 0;
  for (let i = 0; i < tab.length - 1; i++) {
    const [ax, az] = tab[i], [bx, bz] = tab[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let nx = -(bz - az) / len, nz = (bx - ax) / len;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (H(mx + nx * 6, mz + nz * 6) > H(mx - nx * 6, mz - nz * 6)) { nx = -nx; nz = -nz; }
    segs.push({ ax, az, bx, bz, len, s0: total, nx, nz, ux: (bx - ax) / len, uz: (bz - az) / len });
    total += len;
  }
  // point along the boardwalk: f in [0,1], off = distance toward the water (+) or land (-)
  const along = (f, off = 0.72) => {
    const s = f * total;
    const sg = segs.find(q => s <= q.s0 + q.len) || segs[segs.length - 1];
    const k = (s - sg.s0) / sg.len;
    return { x: sg.ax + (sg.bx - sg.ax) * k + sg.nx * off, z: sg.az + (sg.bz - sg.az) * k + sg.nz * off, ...sg };
  };
  // which end is north (smaller z)?
  const northF = tab[0][1] < tab[tab.length - 1][1] ? 0 : 1;
  const fromNorth = f => (northF === 0 ? f : 1 - f);
  // a spot on open ground beside the boardwalk (not on a kiosk or planter)
  const landSpot = f => {
    for (const off of [-3, -3.6, -2.6, -4.4, -5.2, -6.5, -2.2]) {
      const p = along(f, off);
      if (top(p.x, p.z) - H(p.x, p.z) < 0.3 && !phys.near(p.x, p.z, 1).some(c => c.solid && c.tag !== 'deck')) return p;
    }
    return along(f, -3);
  };

  // wooden swim stairs from the water up over the railing
  for (const f of [0.22, 0.5, 0.78]) {
    const n = 7;
    for (let k = 0; k < n; k++) {
      const off = 0.72 + 2.1 + 0.3 + (n - 1 - k) * 0.5;
      const p = along(fromNorth(f), off);
      const y = -0.35 + (k + 1) * ((deckY + 0.55 + 0.35) / n);
      const yaw = Math.atan2(-p.uz, p.ux);
      props.add(P.box(), 0x8a6a4a, p.x, y - 0.08, p.z, 1.3, 0.16, 0.5, yaw);
      props.add(P.box(), 0x5a4636, p.x + p.ux * 0.6, (y - 1.2) / 2, p.z + p.uz * 0.6, 0.12, y + 1.2, 0.12);
      props.add(P.box(), 0x5a4636, p.x - p.ux * 0.6, (y - 1.2) / 2, p.z - p.uz * 0.6, 0.12, y + 1.2, 0.12);
      phys.addBox(p.x, p.z, 0.65, 0.25, yaw, y - 0.3, y, { tag: 'step' });
    }
  }

  // ================================================================= FLAGS
  const ent = landSpot(fromNorth(0.02));
  const entFace = Math.atan2(along(fromNorth(0.1)).x - ent.x, along(fromNorth(0.1)).z - ent.z);
  g.flag('entrada', ent.x, ent.z, entFace);
  const midK = landSpot(fromNorth(0.5));
  g.flag('kioskos', midK.x, midK.z, entFace);
  const [tfx, tfz] = [tw.x + 6.5, tw.z - 4];
  g.flag('torre', tfx, tfz, Math.PI);
  const [pkx, pkz] = L(70, 20);
  g.flag('parque', pkx, pkz, 0);
  const [bfx, bfz] = L(300, -95);
  g.flag('playa', bfx, bfz, -Math.PI / 2);
  const [cfx, cfz] = L(-452, -238);
  g.flag('club', cfx, cfz, 0);

  // ================================================================= MASKS (always visible)
  g.mask('torre', { es: 'La cima de la torre', en: 'Top of the lookout tower' }, tw.x, tw.topY + 1.1, tw.z);
  g.mask('techo', { es: 'Encima del techo de la torre', en: 'Above the tower roof' }, tw.x, tw.roofTop + 1.3, tw.z);

  const [ix, iz] = L(-318, -178);
  g.mask('islote', { es: 'El islote de mangle', en: 'The mangrove islet' }, ix, Math.max(top(ix, iz), 0) + 1.2, iz);

  // under the deck, over water deep enough to swim
  let under = null;
  for (const f of [0.45, 0.4, 0.5, 0.35, 0.55, 0.3, 0.6]) {
    const p = along(fromNorth(f), 0.72 + 1.6);
    if (H(p.x, p.z) < -1.2) { under = p; break; }
  }
  under = under || along(fromNorth(0.45), 0.72 + 1.6);
  g.mask('sabalos', { es: 'Bajo el tablado con los sábalos', en: 'Under the boardwalk with the tarpon' }, under.x, -0.25, under.z);

  const [clx, clz] = L(-486, -198);
  g.mask('club', { es: 'El techo del Club Náutico', en: 'The yacht club rooftop' }, clx, top(clx, clz) + 1.3, clz);

  const [bex, bez] = L(405, -58);
  g.mask('playa', { es: 'Al final de la playa', en: 'The far end of the beach' }, bex, Math.max(top(bex, bez), 0) + 1.3, bez);

  // a rock sticking out of the reef
  const [rkx, rkz] = L(40, -300);
  const rockTop = 1.0;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = i === 0 ? 0 : 1.3;
    const s = 2 + R() * 1.2;
    props.add(P.dodeca(), 0x7f786c, rkx + Math.cos(a) * r, rockTop - s * 0.4 - (i ? 0.3 : 0), rkz + Math.sin(a) * r, s, s * 0.9, s, R() * 6, R(), R(), 0.2);
  }
  props.add(P.cone(7), 0x6f685e, rkx, (rockTop + H(rkx, rkz)) / 2 - 0.5, rkz, 5, rockTop - H(rkx, rkz), 5);
  phys.add(circlePts(rkx, rkz, 2.0, 8), H(rkx, rkz) - 1, rockTop, { tag: 'rock' });
  g.mask('arrecife', { es: 'La roca del arrecife', en: 'The reef rock' }, rkx, rockTop + 1.3, rkz);

  const bigK = info.kiosks.slice().sort((a, b) => b.hx * b.hz - a.hx * a.hz)[0];
  g.mask('kiosko', { es: 'Sobre el kiosko más grande', en: 'On top of the biggest kiosk' }, bigK.x, bigK.top + 1.2, bigK.z);

  const fb = info.fountainBig;
  if (fb) g.mask('fuente', { es: 'La fuente de la rotonda', en: 'The roundabout fountain' }, fb.x, fb.top + 1.3, fb.z);

  const yacht = info.boats.filter(b => !b.sail).sort((a, b) => b.top - a.top || b.L - a.L)[0];
  g.mask('yate', { es: 'El yate más alto', en: 'The tallest yacht' }, yacht.x, yacht.top + 1.2, yacht.z);

  // port warehouse with a stair of shipping containers
  const wb = data.world.buildings.slice().sort((a, b) => b.r[2] * b.r[3] - a.r[2] * a.r[3])[0];
  const [wcx, wcz] = L(wb.r[0], wb.r[1]);
  const roofY = top(wcx, wcz);
  let edgeZ = wcz;
  while (top(wcx, edgeZ) > roofY - 0.5 && edgeZ < wcz + 200) edgeZ += 0.5; // walk south to the wall
  const contCols = [0xc0392b, 0x1f5fa8, 0x2e9e5b, 0xe0a030, 0x7a3b8a];
  const ground = H(wcx, edgeZ + 3);
  [[1.4, 3], [3.9, 2], [6.4, 1]].forEach(([d, n], i) => {
    for (let k = 0; k < n; k++) {
      const y0 = ground + k * 1.5;
      props.add(P.box(), contCols[(i + k) % 5], wcx + 2, y0 + 0.75, edgeZ + d, 6, 1.5, 2.4, 0, 0, 0, 0.05);
      for (let r = -2; r <= 2; r++) props.add(P.box(), 0x333333, wcx + 2 + r * 1.2, y0 + 0.75, edgeZ + d, 0.06, 1.4, 2.45);
    }
    phys.addBox(wcx + 2, edgeZ + d, 3, 1.2, 0, ground - 0.5, ground + n * 1.5, { tag: 'container' });
  });
  g.mask('almacen', { es: 'El techo del almacén del puerto', en: 'The port warehouse roof' }, wcx + 2, roofY + 1.3, edgeZ - 6);
  g.flag('almacen', wcx - 6, edgeZ + 6, Math.PI);

  // channel buoy far out in the harbor
  const [byx, byz] = L(-615, 40);
  const buoy = M.buoyMesh();
  buoy.position.set(byx, 0, byz);
  g.root.add(buoy);
  phys.add(circlePts(byx, byz, 1.0, 10), -3, 0.8, { tag: 'buoy' });
  g.mask('boya', { es: 'La boya del canal', en: 'The channel buoy' }, byx, 3.2, byz);
  g.animals.push({ update: (dt, now) => { buoy.position.y = Math.sin(now * 1.3) * 0.12; buoy.rotation.z = Math.sin(now * 0.9) * 0.05; } });

  // lifeguard tower on the beach: backflip from the platform
  const [lgx, lgz] = L(330, -92);
  const lgG = H(lgx, lgz);
  const lg = M.lifeguardTower(props, lgx, lgG, lgz, 0.35);
  phys.addBox(lgx, lgz, 1.1, 1.1, 0.35, lgG + lg.h - 0.2, lgG + lg.h, { tag: 'platform' });
  for (const [sx, sz, st] of lg.steps) phys.addBox(sx, sz, 0.3, 0.6, 0.35, st - 0.25, st, { tag: 'step' });
  g.mask('salvavidas', { es: 'Salto mortal desde la caseta', en: 'Backflip from the lifeguard tower' }, lgx, lgG + lg.h + 4.3, lgz);

  // ================================================================= MASKS (hidden until earned)
  const hidden = (id, es, en) => g.mask(id, { es, en }, 0, -50, 0, true);
  hidden('tienda', 'Máscara de la tienda de Doña Carmen', "A mask from Doña Carmen's shop");
  hidden('carrera', 'Carrera con Tito', 'Race with Tito');
  hidden('aros', 'Los aros de la playa', 'The beach rings');
  hidden('cocos', 'Tumba los cocos', 'Knock down the coconuts');
  hidden('gatito', 'Mishu, la gatita perdida', 'Mishu the lost kitten');
  hidden('pelicano', 'Persigue al pelícano', 'Chase the pelican');
  hidden('cajas', 'Dentro de una caja', 'Inside a crate');
  hidden('brillo_playa', 'Algo brilla en la arena', 'Something sparkles in the sand');
  hidden('brillo_peninsula', 'Un brillo en la península', 'A sparkle on the peninsula');
  hidden('brillo_parque', 'Un brillo en el Parque de los Niños', "A sparkle in the kids' park");
  hidden('cofre', 'El cofre del fondo de la bahía', 'Treasure chest on the bay floor');
  hidden('pedazos_parque', 'Pedazos en el parque', 'Pieces in the park');
  hidden('pedazos_bahia', 'Pedazos sobre los botes', 'Pieces on the boats');
  hidden('conchas', 'Todas las conchas', 'Every conch shell');

  // ---------------------------------------------------------------- ground-pound spots
  const spotAt = (lx, ly, reward) => { const [x, z] = L(lx, ly); return g.spot(x, z, reward); };
  spotAt(230, -150, { mask: 'brillo_playa' });
  spotAt(-300, -285, { mask: 'brillo_peninsula' });
  spotAt(128, 92, { mask: 'brillo_parque' });
  spotAt(-40, 20, { coins: 8 });
  spotAt(-420, -262, { coins: 8 });
  spotAt(20, -190, { coins: 6 });
  spotAt(-210, 190, { coins: 8 });

  // ---------------------------------------------------------------- crates
  const [crx, crz] = L(40, -100);
  const cg = H(crx, crz);
  const cr = [];
  for (const [u, v] of [[0, 0], [1.15, 0], [0, 1.15], [1.15, 1.15]]) cr.push(g.crate(crx + u, cg, crz + v, { coins: 3 }));
  g.crate(crx + 0.55, cg + 1.1, crz + 0.55, { mask: 'cajas' });
  g.crate(crx + 4, cg, crz - 2, { coins: 5 });
  g.crate(crx - 3, cg, crz + 3, { coins: 5 });

  // ---------------------------------------------------------------- shop (Doña Carmen)
  const ks = info.kiosks.slice().sort((a, b) => a.z - b.z);
  const shopK = ks[Math.floor(ks.length / 2)];
  shopK.shop = true;
  const sf = shopK.front;
  const sfl = Math.hypot(sf.nx, sf.nz) || 1;
  const carmen = g.npc('carmen', 'Doña Carmen', sf.x + sf.nx / sfl * 0.9, sf.z + sf.nz / sfl * 0.9, Math.atan2(sf.nx, sf.nz), async (g) => {
    const lines = [
      { es: `¡Bienvenido a mi kiosko, ${g.playerName}!`, en: `Welcome to my kiosk, ${g.playerName}!` },
      FOOD_LINES[shopK.food] || { es: `Hoy tengo ${shopK.food.toLowerCase()}.`, en: `Today I have ${shopK.food}.` },
      { es: '¿Qué te llevas, mijo?', en: 'What will it be, dear?' },
    ];
    const opts = [];
    if (!g.shop.mask) opts.push({ label: { es: `${t('shopMask')} · 100 chavos`, en: `${t('shopMask')} · 100 chavos` }, value: 'mask', primary: true });
    if (!g.shop.shirt) opts.push({ label: { es: `${t('shopShirt')} · 40 chavos`, en: `${t('shopShirt')} · 40 chavos` }, value: 'shirt' });
    else opts.push({ label: g.player.look === 'ponce' ? t('shopShirtOff') : t('shopShirt'), value: 'wear' });
    opts.push({ label: t('bye'), value: 'bye' });
    const v = await g.ui.say('Doña Carmen', lines, opts);
    if (v === 'mask') {
      if (g.wallet < 100) return g.ui.say('Doña Carmen', [{ es: `${t('cantAfford')} Te faltan ${100 - g.wallet}. ¡Hay chavos por todo el tablado!`, en: `${t('cantAfford')} You need ${100 - g.wallet} more. There are chavos all over the boardwalk!` }]);
      g.wallet -= 100; g.shop.mask = true; g.counters(); g.sfx.play('buy');
      const P = g.player.pos;
      g.reveal('tienda', P.x, P.y + 1.8, P.z);
    } else if (v === 'shirt') {
      if (g.wallet < 40) return g.ui.say('Doña Carmen', [t('cantAfford')]);
      g.wallet -= 40; g.shop.shirt = true; g.counters(); g.sfx.play('buy');
      g.player.setLook('ponce');
      g.save();
      await g.ui.say('Doña Carmen', [{ es: '¡Rojo y negro, los colores de Ponce! ¡Te queda brutal!', en: "Red and black, Ponce's colors! Looks great on you!" }]);
    } else if (v === 'wear') {
      g.player.setLook(g.player.look === 'ponce' ? 'default' : 'ponce');
      g.save();
    }
  });

  carmen.quest = g => (!g.shop.mask && g.wallet >= 100 ? 'shop' : null);

  // ---------------------------------------------------------------- guide at the entrance
  const tomas = g.npc('guia', 'Don Tomás', ent.x + Math.cos(entFace) * 2.2, ent.z - Math.sin(entFace) * 2.2, entFace + Math.PI, async (g) => {
    const got = g.masks.filter(m => m.got).length;
    g.q.tomas = true;
    g.save();
    await g.ui.say('Don Tomás', [
      { es: `¡Saludos, ${g.playerName}! Bienvenido al Paseo Tablado La Guancha, en Ponce.`, en: `Greetings, ${g.playerName}! Welcome to the La Guancha boardwalk in Ponce.` },
      { es: `Por todo el área hay ${g.masks.length} máscaras de vejigante escondidas. Llevas ${got}.`, en: `There are ${g.masks.length} vejigante masks hidden around here. You have ${got}.` },
      { es: 'Salta tres veces seguidas corriendo para el triple salto. ¡Y tírale la pava a las cosas!', en: 'Jump three times in a row while running for a triple jump. And throw your pava at things!' },
      { es: 'Toca las banderas de Puerto Rico. Desde el mapa puedes viajar a cualquiera que hayas tocado.', en: 'Touch the Puerto Rico flags. From the map you can travel to any flag you have touched.' },
      { es: 'Habla con la gente: siempre saben algo. ¡Wepa!', en: 'Talk to people: they always know something. Wepa!' },
    ]);
  });

  tomas.quest = g => (g.q.tomas ? null : 'available');

  // ---------------------------------------------------------------- race with Tito
  const titoP = landSpot(fromNorth(0.07));
  const race = g.challenge({
    active: false,
    objective() { return this.active ? { x: tw.x, y: tw.topY, z: tw.z, label: { es: 'Cima de la torre', en: 'Top of the tower' } } : null; },
    update() {
      if (!this.active) return;
      const P = g.player.pos;
      if (dist2(P.x, P.z, tw.x, tw.z) < 2.7 && P.y > tw.topY - 0.3) {
        this.active = false; g.stopTimer(); g.q.race = true;
        g.reveal('carrera', P.x, P.y + 1.8, P.z);
      }
    },
  });
  const tito = g.npc('tito', 'Tito', titoP.x, titoP.z, entFace, async (g) => {
    if (g.q.race) return g.ui.say('Tito', [{ es: '¡Tú eres más rápido que un coquí con prisa! Revancha otro día.', en: "You're faster than a coquí in a hurry! Rematch another day." }]);
    if (race.active) return g.ui.say('Tito', [{ es: '¡Corre! ¡A la cima de la torre!', en: 'Run! To the top of the tower!' }]);
    const v = await g.ui.say('Tito', [
      { es: `¡Oye, ${g.playerName}! Yo corro por este tablado todas las mañanas.`, en: `Hey, ${g.playerName}! I run this boardwalk every morning.` },
      { es: '¿Una carrera hasta la cima de la torre, al otro lado? Tienes 55 segundos.', en: 'Race you to the top of the tower at the other end? You get 55 seconds.' },
    ], [{ label: { es: '¡Dale!', en: "Let's go!" }, value: 'y', primary: true }, { label: { es: 'Ahora no', en: 'Not now' }, value: 'n' }]);
    if (v === 'y') {
      race.active = true;
      g.startTimer(55, () => { race.active = false; });
      g.ui.banner('¡Fuego!', tr({ es: 'A la cima de la torre', en: 'To the top of the tower' }), 1.5);
    }
  });

  tito.quest = g => (g.q.race ? null : race.active ? 'active' : 'available');

  // ---------------------------------------------------------------- beach rings
  const ringPath = [[95, -186], [130, -176], [165, -164], [200, -150], [235, -137], [270, -124], [305, -110], [340, -96], [375, -80]];
  const ringPts = ringPath.map(([lx, ly], i) => {
    const [x, z] = L(lx, ly);
    return [x, Math.max(H(x, z), 0) + (i % 3 === 2 ? 3.2 : 1.4), z];
  });
  const startRing = M.ringMesh(0x2e9e5b);
  const [srx, srz] = L(70, -192);
  const srY = Math.max(H(srx, srz), 0) + 1.4;
  startRing.position.set(srx, srY, srz);
  g.root.add(startRing);
  const rings = ringPts.map(([x, y, z], i) => {
    const m = M.ringMesh();
    const nx = ringPts[Math.min(i + 1, ringPts.length - 1)], pv = ringPts[Math.max(i - 1, 0)];
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(nx[0] - pv[0], nx[2] - pv[2]);
    m.visible = false;
    g.root.add(m);
    return m;
  });
  startRing.rotation.y = rings[0].rotation.y;
  g.challenge({
    active: false,
    onLoad() { if (g.q.rings) startRing.visible = false; },
    objective() {
      if (!this.active) return null;
      const P = g.player.pos;
      let best = null;
      for (const r of rings) if (!r.userData.hit && (!best || r.position.distanceTo(P) < best.position.distanceTo(P))) best = r;
      return best && { x: best.position.x, y: best.position.y - 1.6, z: best.position.z, label: { es: 'Aros', en: 'Rings' } };
    },
    update() {
      const P = g.player.pos, cy = P.y + 0.55;
      if (g.q.rings) return;
      if (!this.active) {
        if (dist2(P.x, P.z, srx, srz) < 1.6 && Math.abs(cy - srY) < 1.6) {
          this.active = true; this.left = rings.length;
          rings.forEach(r => { r.visible = true; r.userData.hit = false; });
          startRing.visible = false;
          g.sfx.play('ring');
          g.startTimer(24, () => { this.active = false; rings.forEach(r => (r.visible = false)); startRing.visible = true; g.ui.prog(''); });
        }
        return;
      }
      for (const r of rings) {
        if (r.userData.hit) continue;
        if (r.position.distanceTo(new THREE.Vector3(P.x, cy, P.z)) < 1.5) {
          r.userData.hit = true; r.visible = false; this.left--;
          g.sfx.play('ring');
          g.fx.emit(r.position.x, r.position.y, r.position.z, 14, { color: 0xffe08a, speed: 3, up: 1, life: 0.5, grav: 0 });
        }
      }
      g.ui.prog(`${t('rings')}: ${rings.length - this.left}/${rings.length}`);
      if (this.left === 0) {
        this.active = false; g.q.rings = true; g.stopTimer(); g.ui.prog('');
        const last = rings[rings.length - 1].position;
        g.reveal('aros', last.x, last.y, last.z);
      }
    },
    animate(dt, now) { startRing.rotation.z = Math.sin(now * 2) * 0.1; for (const r of rings) if (r.visible) r.rotation.z = now; },
  });

  // ---------------------------------------------------------------- coconuts (hit with the hat)
  const [srnx, srnz] = L(-5, -150);
  const crowns = info.palmCrowns.slice().sort((a, b) => dist2(a[0], a[2], srnx, srnz) - dist2(b[0], b[2], srnx, srnz));
  const pick = [];
  for (const c of crowns) { if (pick.every(p => dist2(p[0], p[2], c[0], c[2]) > 6)) pick.push(c); if (pick.length === 3) break; }
  const cocoMat = new THREE.MeshLambertMaterial({ color: 0x7a4a1a, emissive: 0x3a1a00 });
  const cocos = pick.map(([x, y, z]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), cocoMat);
    m.position.set(x, y - 0.35, z);
    m.castShadow = true;
    g.root.add(m);
    return { m, x, y: y - 0.35, z, down: false, vy: 0 };
  });
  g.challenge({
    onLoad() { if (g.q.cocos) cocos.forEach(c => { c.down = true; c.m.visible = false; }); },
    objective() {
      if (g.q.cocos || !cocos.some(c => c.down)) return null;
      const c = cocos.find(c => !c.down);
      return c && { x: c.x, y: c.y - 0.5, z: c.z, label: { es: 'Cocos', en: 'Coconuts' } };
    },
    update(dt) {
      if (g.q.cocos || !cocos.length) return;
      const h = g.player.hat;
      for (const c of cocos) {
        if (c.down || h.state === 'on') continue;
        if (h.pos.distanceTo(c.m.position) < 1.2) {
          c.down = true; c.vy = 0;
          g.sfx.play('hit');
          g.fx.emit(c.x, c.y, c.z, 12, { color: 0x9adf6a, speed: 3, up: 2, life: 0.5 });
          g.ui.toast(`🥥 ${cocos.filter(c => c.down).length}/${cocos.length}`, 1.5);
        }
      }
      if (cocos.every(c => c.down)) {
        g.q.cocos = true;
        const cx = cocos.reduce((a, c) => a + c.x, 0) / cocos.length, cz = cocos.reduce((a, c) => a + c.z, 0) / cocos.length;
        g.reveal('cocos', cx, top(cx, cz) + 1.5, cz);
      }
    },
    animate(dt) {
      for (const c of cocos) {
        if (!c.down || !c.m.visible) continue;
        c.vy -= 20 * dt; c.m.position.y += c.vy * dt;
        const gh = H(c.x, c.z) + 0.4;
        if (c.m.position.y < gh) { c.m.position.y = gh; c.vy = Math.abs(c.vy) * 0.3; if (c.vy < 0.5) c.vy = 0; }
      }
    },
  });

  // ---------------------------------------------------------------- lost kitten
  const [ktx, ktz] = L(-118, 128);
  const kitten = M.kittenMesh();
  kitten.position.set(ktx, top(ktx, ktz), ktz);
  g.root.add(kitten);
  const [gbx, gbz] = L(80, 40);
  const kit = { state: 'lost', meowT: 0 };
  const gabi = g.npc('gabi', 'Gabi', gbx, gbz, 0, async (g) => {
    if (kit.state === 'home') return g.ui.say('Gabi', [{ es: '¡Mishu y yo te queremos mucho! ¡Gracias!', en: 'Mishu and I love you! Thank you!' }]);
    if (kit.state === 'follow' && dist2(kitten.position.x, kitten.position.z, gabi.x, gabi.z) < 5) {
      kit.state = 'home';
      g.q.kitten = true;
      delete g.q.kittenFollowing;
      kitten.position.set(gabi.x + 0.8, gabi.y, gabi.z + 0.3);
      g.sfx.play('meow');
      await g.ui.say('Gabi', [{ es: `¡¡Mishu!! ¡La encontraste, ${g.playerName}! ¡Muchas gracias! Toma, esto es para ti.`, en: `Mishu!! You found her, ${g.playerName}! Thank you so much! Here, this is for you.` }]);
      const P = g.player.pos;
      g.reveal('gatito', P.x, P.y + 1.8, P.z);
      return;
    }
    g.q.kittenAsked = true;
    g.save();
    await g.ui.say('Gabi', [
      { es: 'Buaa… Perdí a mi gatita Mishu. Es anaranjada y muy traviesa.', en: 'Waah… I lost my kitten Mishu. She is orange and very naughty.' },
      { es: 'Creo que se escondió entre los carros del estacionamiento grande, cerca del tablado.', en: 'I think she hid between the cars in the big parking lot near the boardwalk.' },
    ]);
  });
  g.challenge({
    onLoad() {
      if (g.q.kitten) { kit.state = 'home'; kitten.position.set(gabi.x + 0.8, gabi.y, gabi.z + 0.3); }
      else if (g.q.kittenFollowing) kit.state = 'follow';
    },
    objective() {
      if (kit.state === 'follow') return { x: gabi.x, y: gabi.y, z: gabi.z, label: { es: 'Lleva a Mishu donde Gabi', en: 'Take Mishu to Gabi' } };
      if (kit.state === 'lost' && g.q.kittenAsked) return { x: kitten.position.x, y: kitten.position.y, z: kitten.position.z, label: { es: 'Busca a Mishu', en: 'Find Mishu' } };
      return null;
    },
    update(dt) {
      const P = g.player.pos;
      if (kit.state === 'lost' && dist2(P.x, P.z, kitten.position.x, kitten.position.z) < 1.4) {
        kit.state = 'follow'; g.q.kittenFollowing = true; g.save(); g.sfx.play('meow');
        g.ui.toast(tr({ es: '¡Mishu te sigue! Llévala donde Gabi en el parque.', en: 'Mishu follows you! Take her to Gabi in the park.' }), 3);
      }
      if (kit.state === 'follow') {
        const fx = P.x - Math.sin(g.player.face) * 1.3, fz = P.z - Math.cos(g.player.face) * 1.3;
        const dx = fx - kitten.position.x, dz = fz - kitten.position.z, d = Math.hypot(dx, dz);
        if (d > 25) kitten.position.set(fx, P.y, fz);
        else if (d > 0.3 && H(fx, fz) > -0.3) {
          const sp = Math.min(d * 4, 10) * dt;
          kitten.position.x += dx / d * sp; kitten.position.z += dz / d * sp;
          kitten.rotation.y = Math.atan2(dx, dz);
        }
        kitten.position.y = phys.groundAt(kitten.position.x, kitten.position.z, Math.max(P.y, kitten.position.y) + 0.5).h;
        if ((kit.meowT -= dt) < 0) { kit.meowT = 6 + Math.random() * 6; if (Math.random() < 0.5) g.sfx.play('meow'); }
      }
    },
    animate(dt, now) { kitten.userData.tail.rotation.z = Math.sin(now * 4) * 0.4; },
  });

  // ---------------------------------------------------------------- pelican chase on the old pier
  const ruin = info.pilings.filter(p => p.length === 3);
  const [rsx, rsz] = L(-410, 210);
  ruin.sort((a, b) => dist2(a[0], a[1], rsx, rsz) - dist2(b[0], b[1], rsx, rsz));
  const perches = [];
  for (let i = 3; i < ruin.length && perches.length < 5; i += Math.max(3, Math.floor(ruin.length / 5))) perches.push(ruin[i]);
  const pel = M.pelicanMesh();
  const pelState = { i: 0, fly: 0, from: null };
  if (perches.length) {
    pel.position.set(perches[0][0], perches[0][2], perches[0][1]);
    g.root.add(pel);
  }
  gabi.quest = g => (kit.state === 'home' ? null : kit.state === 'follow' || g.q.kittenAsked ? 'active' : 'available');
  g.challenge({
    objective() {
      if (g.q.pelican || pelState.i === 0 || pelState.fly > 0) return null;
      return { x: pel.position.x, y: pel.position.y, z: pel.position.z, label: { es: 'Pelícano', en: 'Pelican' } };
    },
    onLoad() { if (g.q.pelican) { pel.visible = false; } },
    update(dt) {
      if (g.q.pelican || !perches.length) return;
      const P = g.player.pos;
      if (pelState.fly > 0) return;
      if (pel.position.distanceTo(new THREE.Vector3(P.x, P.y + 0.5, P.z)) < 2.4) {
        g.sfx.play('pelican');
        if (pelState.i >= perches.length - 1) {
          g.q.pelican = true;
          const p = perches[pelState.i];
          g.reveal('pelicano', p[0], p[2] + 1.6, p[1]);
          pelState.from = pel.position.clone(); pelState.to = new THREE.Vector3(p[0] + 60, 25, p[1] - 60); pelState.fly = 3; pelState.leave = true;
          return;
        }
        pelState.from = pel.position.clone();
        pelState.i++;
        const p = perches[pelState.i];
        pelState.to = new THREE.Vector3(p[0], p[2], p[1]);
        pelState.fly = 1.4;
      }
    },
    animate(dt, now) {
      if (!pel.parent) return;
      const w = pel.userData.wings;
      if (pelState.fly > 0) {
        const T = pelState.leave ? 3 : 1.4;
        pelState.fly -= dt;
        const k = 1 - Math.max(0, pelState.fly) / T;
        pel.position.lerpVectors(pelState.from, pelState.to, k);
        pel.position.y += Math.sin(k * Math.PI) * 3;
        pel.rotation.y = Math.atan2(pelState.to.x - pelState.from.x, pelState.to.z - pelState.from.z);
        w[0].rotation.z = Math.sin(now * 14) * 0.7; w[1].rotation.z = -w[0].rotation.z;
        if (pelState.fly <= 0 && pelState.leave) pel.visible = false;
      } else {
        w[0].rotation.z = 0.1; w[1].rotation.z = -0.1;
        pel.rotation.y += Math.sin(now * 0.5) * 0.002;
      }
    },
  });

  // ---------------------------------------------------------------- treasure chest on the basin floor
  const [chx, chz] = L(-285, 5);
  const chY = H(chx, chz);
  const chest = M.chestMesh();
  chest.position.set(chx, chY, chz);
  g.root.add(chest);
  let bubT = 0;
  g.challenge({
    onLoad() { if (g.q.chest) chest.userData.lid.rotation.x = -1.8; },
    update() {
      if (g.q.chest) return;
      const P = g.player.pos;
      if (dist2(P.x, P.z, chx, chz) < 1.8 && P.y < chY + 2) {
        g.q.chest = true;
        chest.userData.lid.rotation.x = -1.8;
        g.sfx.play('appear');
        g.reveal('cofre', chx, chY + 1.6, chz);
      }
    },
    animate(dt) {
      if (g.q.chest) return;
      if ((bubT -= dt) < 0) { bubT = 0.25; g.fx.emit(chx + (Math.random() - 0.5), chY + 1, chz + (Math.random() - 0.5), 1, { color: 0xbff4ff, speed: 0.2, up: 2, life: 3.2, grav: -0.4 }); }
    },
  });
  for (let i = 0; i < 6; i++) g.coin(chx, -0.6 - i * ((-chY - 1.5) / 6), chz + 1.5);

  // ---------------------------------------------------------------- mask shards
  const shardSet = (id, pts, onDone) => {
    const key = 'sh_' + id;
    const meshes = pts.map(([x, y, z]) => { const m = M.shardMesh(); m.position.set(x, y, z); g.root.add(m); return m; });
    g.challenge({
      onLoad() { (g.q[key] || []).forEach(i => (meshes[i].visible = false)); },
      objective() {
        const got = g.q[key] || [];
        if (!got.length || got.length === meshes.length) return null;
        const P = g.player.pos;
        const m = meshes.filter(m => m.visible).sort((a, b) => a.position.distanceTo(P) - b.position.distanceTo(P))[0];
        return m && { x: m.position.x, y: m.position.y - 1.2, z: m.position.z, label: { es: 'Pedazos', en: 'Pieces' } };
      },
      update() {
        const P = g.player.pos;
        const got = g.q[key] || (g.q[key] = []);
        if (got.length === meshes.length) return;
        meshes.forEach((m, i) => {
          if (!m.visible) return;
          if (m.position.distanceTo(new THREE.Vector3(P.x, P.y + 0.55, P.z)) < 1.3) {
            m.visible = false; got.push(i);
            g.sfx.play('shard');
            g.fx.emit(m.position.x, m.position.y, m.position.z, 16, { color: 0xff7070, speed: 3, up: 2, life: 0.6 });
            g.ui.toast(`${t('shards')}: ${got.length}/${meshes.length}`, 2);
            if (got.length === meshes.length) onDone();
            g.save();
          }
        });
      },
      animate(dt, now) { meshes.forEach((m, i) => { m.rotation.set(now * 2 + i, now * 3, 0); m.position.y += Math.sin(now * 3 + i) * 0.004; }); },
    });
  };
  // park shards
  const [pcx, pcz] = L(95, 50);
  const fp = info.fountainPark;
  const parkPts = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4;
    const x = pcx + Math.cos(a) * 17, z = pcz + Math.sin(a) * 17;
    parkPts.push([x, top(x, z) + 1.0, z]);
  }
  const parkTree = info.trees.filter(tr2 => tr2[2] === 'tree' && dist2(tr2[0], tr2[1], pcx, pcz) < 30).sort((a, b) => b[3] - a[3])[0];
  if (parkTree) parkPts.push([parkTree[0], parkTree[3] + 0.8, parkTree[1]]);
  else parkPts.push([pcx + 5, top(pcx + 5, pcz) + 3.2, pcz]);
  shardSet('park', parkPts, () => {
    const y = fp ? fp.top + 1.5 : top(pcx, pcz) + 1.5;
    g.reveal('pedazos_parque', fp ? fp.x : pcx, y, fp ? fp.z : pcz);
  });
  // basin shards on moored boats
  const [bcx, bcz] = L(-300, 0);
  const moored = info.boats.filter(b => H(b.x, b.z) < -2).sort((a, b) => dist2(a.x, a.z, bcx, bcz) - dist2(b.x, b.z, bcx, bcz));
  const boatPts = [];
  for (const b of moored) { if (boatPts.every(p => dist2(p[0], p[2], b.x, b.z) > 10)) boatPts.push([b.x, b.top + 1.0, b.z]); if (boatPts.length === 5) break; }
  const longest = info.piers.slice().sort((a, b) => dist2(b[0], b[1], b[2], b[3]) - dist2(a[0], a[1], a[2], a[3]))[0];
  shardSet('bay', boatPts, () => {
    const [ax, az, bx2, bz2, y] = longest;
    const end = H(ax, az) < H(bx2, bz2) ? [ax, az] : [bx2, bz2];
    g.reveal('pedazos_bahia', end[0], y + 1.5, end[1]);
  });

  // all conchas
  g.onAllConchas = () => { const P = g.player.pos; g.reveal('conchas', P.x, P.y + 2, P.z); };

  // ---------------------------------------------------------------- other NPCs with hints
  const pepeP = along(fromNorth(0.3), 0.72 + 1.4);
  g.npc('pepe', 'Don Pepe', pepeP.x, pepeP.z, Math.atan2(pepeP.nx, pepeP.nz), async (g) => {
    const hints = [
      ['sabalos', { es: 'Debajo de este mismo tablado nadan los sábalos. ¡Tírate al agua y mira debajo!', en: 'The tarpon swim right under this boardwalk. Jump in and look underneath!' }],
      ['cofre', { es: 'Dicen que hay un cofre en el fondo de la bahía. Nadando, aguanta ⤓ para bucear. Sigue las burbujas.', en: "They say there's a chest on the bay floor. While swimming, hold ⤓ to dive. Follow the bubbles." }],
      ['boya', { es: 'Allá lejos, en el canal, hay una boya roja. Es una nadada larga.', en: "Way out in the channel there's a red buoy. It's a long swim." }],
      ['pelicano', { es: 'El pelícano del muelle viejo es juguetón. Síguelo por los pilotes.', en: 'The pelican on the old pier is playful. Follow it along the pilings.' }],
      ['islote', { es: 'Ese islote de mangle en medio de la bahía… nadie va para allá.', en: 'That mangrove islet in the middle of the bay… nobody goes there.' }],
    ];
    const h = hints.find(([id]) => !g.maskById(id).got);
    await g.ui.say('Don Pepe', [
      { es: 'Aquí pescando, como todos los días. ¿Sabías que los sábalos pueden pesar más de cien libras?', en: 'Fishing here, like every day. Did you know tarpon can weigh over a hundred pounds?' },
      h ? h[1] : { es: '¡Ya no me quedan secretos que contarte!', en: "I have no secrets left to tell you!" },
    ]);
  });

  const yari = g.npc('lifeguard', 'Yari', lgx + 2.5, lgz + 1.5, -0.5, async (g) => g.ui.say('Yari', [
    { es: `¡Hola, ${g.playerName}! Soy la salvavidas. Desde mi caseta se ve todo el arrecife.`, en: `Hi, ${g.playerName}! I'm the lifeguard. You can see the whole reef from my tower.` },
    { es: 'Un truco: agáchate (⤓) y salta sin moverte para dar un salto mortal bien alto.', en: 'A trick: crouch (⤓) and jump while standing still for a really high backflip.' },
    { es: 'Y si pasas por el aro verde de la arena, empieza la carrera de aros. ¡Rápido!', en: 'And if you go through the green ring on the sand, the ring race starts. Hurry!' },
  ]));

  g.npc('tourist', 'Mike', tw.x + 5, tw.z + 3, Math.PI, async (g) => g.ui.say('Mike', [
    { es: 'Hello! Digo… ¡hola! Vine en crucero a ver Ponce, la Perla del Sur.', en: 'Hello! I came on a cruise to see Ponce, the Pearl of the South.' },
    { es: 'Desde la torre se ve la Isla de Cardona con su faro, y más lejos Caja de Muertos.', en: 'From the tower you can see Cardona Island and its lighthouse, and farther out Caja de Muertos.' },
    { es: 'Dicen que hay algo encima del techo de la torre… ¿se podrá llegar tirando la pava y rebotando en ella?', en: 'They say there is something above the tower roof… could you get there by throwing your hat and bouncing on it?' },
  ]));

  // ================================================================= COINS
  // boardwalk: clusters every ~25 units
  for (let f = 0.04; f < 0.97; f += 25 / total) {
    const a = along(f, 0.4), b = along(Math.min(f + 7 / total, 1), 0.4);
    g.coinLine(a.x, deckY + 0.6, a.z, b.x, deckY + 0.6, b.z, 5);
  }
  // tower stairs
  for (let i = 2; i < 44; i += 3) {
    const a = tw.startA + (i / 22) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
    g.coin(tw.x + c / m * tw.rc, tw.base + (i + 1) * 0.25 + 0.7, tw.z + s / m * tw.rc);
  }
  if (fb) g.coinRing(fb.x, fb.g + 1.1, fb.z, 5.5, 12);
  if (fp) g.coinRing(fp.x, fp.g + 1.1, fp.z, 4.4, 10);
  // park paths
  const parkPoly = (data.world.park[0] || []).map(([x, y]) => L(x, y));
  let parkCoins = 0;
  for (const fw of data.world.footways) {
    const pts = fw.map(([x, y]) => L(x, y));
    for (let i = 0; i < pts.length - 1 && parkCoins < 40; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (!inPoly((ax + bx) / 2, (az + bz) / 2, parkPoly) || len < 4) continue;
      const n = Math.min(5, Math.floor(len / 3));
      for (let k = 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / (n + 1), z = az + (bz - az) * k / (n + 1);
        g.coin(x, top(x, z) + 0.7, z); parkCoins++;
      }
    }
  }
  // piers
  let pc = 0;
  for (const [ax, az, bx, bz, y] of info.piers) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 8 || R() < 0.45 || pc > 60) continue;
    const n = Math.floor(len / 2.6);
    for (let k = 1; k < n; k++) { g.coin(ax + (bx - ax) * k / n, y + 0.65, az + (bz - az) * k / n); pc++; }
  }
  // old pier pilings
  for (const p of ruin) if (R() < 0.6) g.coin(p[0], p[2] + 0.8, p[1]);
  // kiosk rooftops
  for (const k of info.kiosks) {
    const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
    const ax2 = k.hx > k.hz ? [c, -s] : [s, c];
    const ext = Math.max(0, Math.abs(k.hx - k.hz)) * 0.8;
    g.coinLine(k.x - ax2[0] * ext, k.top + 0.6, k.z - ax2[1] * ext, k.x + ax2[0] * ext, k.top + 0.6, k.z + ax2[1] * ext, 3);
  }
  // beach arc
  for (let i = 0; i < 18; i++) {
    const [x, z] = L(110 + i * 16, -178 + i * 6.2);
    g.coin(x, Math.max(H(x, z), 0) + 0.8 + Math.sin(i / 17 * Math.PI) * 1.6, z);
  }
  // parking lot lines
  for (const lot of data.world.parking.slice(0, 4)) {
    const pts = lot.map(([x, y]) => L(x, y));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    for (let k = -3; k <= 3; k++) { const x = cx + k * 2, z = cz; g.coin(x, top(x, z) + 0.7, z); }
  }
  // tree-top trail near the south roundabout (one-way canopies)
  const canopyTrail = info.trees.filter(q => q[2] === 'tree' && dist2(q[0], q[1], srnx, srnz) < 20).slice(0, 5);
  for (const q of canopyTrail) g.coin(q[0], q[3] + 0.7, q[1]);

  // ================================================================= CONCHAS (50)
  const shells = [];
  const addShell = (x, y, z) => { if (shells.every(s => dist2(s[0], s[2], x, z) > 3)) shells.push([x, y, z]); };
  info.boats.filter((b, i) => i % 9 === 4).slice(0, 8).forEach(b => addShell(b.x, b.top + 0.8, b.z));
  info.lampTops.filter((l, i) => i % 7 === 3).slice(0, 3).forEach(l => addShell(l[0], l[1] + 0.8, l[2]));
  info.piers.filter(p => Math.hypot(p[2] - p[0], p[3] - p[1]) > 10).slice(0, 7).forEach(([ax, az, bx, bz, y]) => addShell(bx, y + 0.8, bz));
  for (const [lx, ly] of [[150, -175], [260, -125], [360, -85], [-60, -230], [-200, -300], [0, -270]]) { const [x, z] = L(lx, ly); addShell(x, Math.max(top(x, z), -0.3) + 0.8, z); }
  for (const [lx, ly] of [[-250, 60], [-340, -60], [-200, -120], [-380, 40], [-150, -150]]) { const [x, z] = L(lx, ly); addShell(x, H(x, z) + 0.8, z); }
  info.trees.filter((q, i) => q[2] === 'tree' && i % 97 === 5).slice(0, 5).forEach(q => addShell(q[0], q[3] + 0.8, q[1]));
  for (const bw of data.world.breakwaters.slice(0, 4)) { const [x, z] = L(bw[0][0], bw[0][1]); addShell(x, Math.max(H(x, z), 0) + 1.6, z); }
  phys.cols.filter(c => c.tag === 'car' && c.y1 - c.y0 < 0.5).filter((c, i) => i % 23 === 7).slice(0, 4).forEach(c => addShell((c.minx + c.maxx) / 2, c.y1 + 0.7, (c.minz + c.maxz) / 2));
  info.trees.filter(q => q[2] === 'mangrove').filter((q, i) => i % 40 === 3).slice(0, 3).forEach(q => addShell(q[0], q[3] + 0.8, q[1]));
  for (const [lx, ly] of [[60, 80], [140, 20], [110, 110], [40, 30]]) { const [x, z] = L(lx, ly); addShell(x, top(x, z) + 0.8, z); }
  addShell(tw.x + tw.rc + 1.3, tw.base + 6, tw.z);
  addShell(bigK.x, bigK.top + 2.8, bigK.z);
  // fill up to 50 along the peninsula shoreline
  for (let i = 0; shells.length < 50 && i < 80; i++) {
    const [x, z] = L(-580 + i * 9, -300 + Math.sin(i) * 8);
    if (H(x, z) > 0.3) addShell(x, top(x, z) + 0.8, z);
  }
  shells.slice(0, 50).forEach(s => g.concha(...s));

  // ================================================================= BEACH UMBRELLAS (bouncy)
  for (const [lx, ly, col] of [[180, -150, 0xe3342f], [215, -140, 0x2a64c8], [250, -128, 0xf7c948], [285, -115, 0x2e9e5b], [395, -62, 0xf27ba0]]) {
    const [x, z] = L(lx, ly);
    const gy = Math.max(H(x, z), 0);
    const tp = M.umbrellaTop(props, x, gy, z, col);
    phys.add(circlePts(x, z, 1.4, 8), tp - 0.25, tp, { tag: 'umbrella', solid: false, bounce: 16 });
  }

  // ================================================================= ANIMALS
  // tarpon circling under the boardwalk
  const fishN = 9;
  const fish = new THREE.InstancedMesh(M.fishGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), fishN);
  scene.add(fish);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fe = new THREE.Euler(), fv = new THREE.Vector3(), fs = new THREE.Vector3(1.6, 1.6, 1.6);
  g.animals.push({
    update(dt, now) {
      for (let i = 0; i < fishN; i++) {
        const a = now * 0.35 + i / fishN * Math.PI * 2, r = 3 + (i % 3);
        const x = under.x + Math.cos(a) * r, z = under.z + Math.sin(a) * r * 0.6;
        fe.set(0, -a, Math.sin(now * 3 + i) * 0.1);
        fq.setFromEuler(fe);
        fm.compose(fv.set(x, -1.4 - (i % 3) * 0.6, z), fq, fs);
        fish.setMatrixAt(i, fm);
      }
      fish.instanceMatrix.needsUpdate = true;
    },
  });
  // pelicans gliding over the bay
  const flyers = [0, 1, 2].map(i => { const p = M.pelicanMesh(); p.scale.setScalar(1.2); g.root.add(p); return p; });
  g.animals.push({
    update(dt, now) {
      flyers.forEach((p, i) => {
        const a = now * (0.12 + i * 0.03) + i * 2.1, r = 40 + i * 15;
        p.position.set(bcx + Math.cos(a) * r, 14 + i * 3 + Math.sin(now + i) * 0.8, bcz + Math.sin(a) * r);
        p.rotation.set(0, -a, 0.25);
        const w = p.userData.wings, f = Math.sin(now * 3 + i) > 0.6 ? Math.sin(now * 10) * 0.5 : 0.1;
        w[0].rotation.z = f; w[1].rotation.z = -f;
      });
    },
  });
  // iguanas sunbathing on the breakwater rocks
  for (const bw of data.world.breakwaters.slice(0, 3)) {
    const p = bw[Math.floor(bw.length / 2)];
    const [x, z] = L(p[0], p[1]);
    const ig = M.iguanaMesh();
    ig.position.set(x, Math.max(H(x, z), 0) + 0.6, z);
    ig.rotation.y = R() * 6;
    g.root.add(ig);
    const ph = R() * 5;
    g.animals.push({ update(dt, now) { ig.userData.head.position.y = 0.16 + Math.max(0, Math.sin(now * 2 + ph)) * 0.06; } });
  }

  yari.quest = g => (g.q.rings || g.q.yari ? null : 'available');
  const yariTalk = yari.talk;
  yari.talk = async g => { g.q.yari = true; g.save(); await yariTalk(g); };

  // A clear starting marker in the park leads through five spooky, talkable clues.
  const mothPark = { x: pkx + 4, z: pkz + 4 };
  const mothKiosk = landSpot(fromNorth(0.38));
  const mothMangrove = landSpot(fromNorth(0.78));
  const mothTower = { x: tfx + 4, z: tfz - 3 };
  const mothBeach = { x: bfx + 5, z: bfz + 4 };
  buildMothQuest(g, { top, park: mothPark, kiosks: mothKiosk, tower: mothTower,
    beach: mothBeach, mangrove: mothMangrove });

  buildProps(g, props);
  buildCrowd(g, along, fromNorth, total);

  const pm = props.build(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(pm);
}

function circlePts(x, z, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  return out;
}

function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
