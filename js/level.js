// La Guancha level design: masks, challenges, NPCs, coins, conchas, flags and animals.
// Positions come from the real map (local meters -> L()) or from structures the world builder found.
import * as THREE from 'three';
import { S } from './data.js';
import { t, tr } from './i18n.js';
import * as M from './models.js';
import { Batch, P, rng } from './geo.js';
import { buildProps } from './props.js';
import { buildCrowd, FOOD_LINES } from './npcs.js';
import { buildPaseoLife } from './paseo.js';
import { buildMothQuest } from './moth-quest.js';
import { buildAvesQuest } from './aves-quest.js';
import { buildJetskiQuest } from './jetski-quest.js';
import { buildWoodsCrowd } from './woods-crowd.js';
import { buildKartRace } from './kart-race.js';

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
  if (fb) g.mask('fuente', { es: 'El León de la rotonda', en: 'The roundabout lion' }, fb.x, fb.top + 1.3, fb.z);

  // ---------------------------------------------------------------- Policía Municipal, Precinto La Guancha
  // (a real station on Calle B): sign on its longest street-facing wall, a patrol car and an officer
  {
    const [rx, ry] = [115.3, -84.7];
    const pb = data.world.buildings.slice().sort((a, b) => dist2(a.r[0], a.r[1], rx, ry) - dist2(b.r[0], b.r[1], rx, ry))[0];
    if (pb && dist2(pb.r[0], pb.r[1], rx, ry) < 8) {
      const pts = pb.p.map(([x, y]) => L(x, y));
      const ccx = pts.reduce((a, p) => a + p[0], 0) / pts.length, ccz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const fb2 = info.fountainBig || { x: ccx, z: ccz - 10 };
      let best = null;
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
        let nx = dz / len, nz = -dx / len;
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        if ((mx - ccx) * nx + (mz - ccz) * nz < 0) { nx = -nx; nz = -nz; }
        const toward = (fb2.x - mx) * nx + (fb2.z - mz) * nz > 0 ? 1 : 0;
        const score = len * (1 + toward);
        if (!best || score > best.score) best = { score, mx, mz, nx, nz, len };
      });
      const base = pb.b * S, wallH = Math.max(pb.h * S, 2.2);
      const yawW = Math.atan2(best.nx, best.nz);
      // sign
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const cg = c.getContext('2d');
      cg.fillStyle = '#1d3b7a'; cg.fillRect(0, 0, 512, 128);
      cg.fillStyle = '#ffffff'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      cg.font = 'bold 50px Trebuchet MS, sans-serif'; cg.fillText('POLICÍA MUNICIPAL', 256, 48);
      cg.font = 'bold 28px Trebuchet MS, sans-serif'; cg.fillText('Precinto La Guancha · Ponce', 256, 100);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.2, best.len * 0.8), Math.min(4.2, best.len * 0.8) / 4), new THREE.MeshBasicMaterial({ map: tex }));
      sign.position.set(best.mx + best.nx * 0.08, base + wallH * 0.72, best.mz + best.nz * 0.08);
      sign.rotation.y = yawW;
      scene.add(sign);
      // blue band along that wall
      props.add(P.box(), 0x2f5fb8, best.mx + best.nx * 0.05, base + 0.45, best.mz + best.nz * 0.05, best.len, 0.5, 0.06, yawW + Math.PI / 2);
      // patrol car parked out front
      const px = best.mx + best.nx * 4.2, pz = best.mz + best.nz * 4.2, gy = H(px, pz), cyaw = yawW + Math.PI / 2;
      const cc = Math.cos(cyaw), ss = Math.sin(cyaw);
      props.add(P.box(), 0xf4f4f4, px, gy + 0.42, pz, 2.6, 0.5, 1.15, cyaw);
      props.add(P.box(), 0x2f5fb8, px, gy + 0.47, pz, 2.62, 0.14, 1.17, cyaw);
      props.add(P.box(), 0xf4f4f4, px - cc * 0.15, gy + 0.85, pz + ss * 0.15, 1.43, 0.42, 1.06, cyaw);
      props.add(P.box(), 0x26323c, px - cc * 0.15, gy + 0.86, pz + ss * 0.15, 1.48, 0.3, 1.08, cyaw);
      props.add(P.box(), 0xe3342f, px - cc * 0.15 + ss * 0.22, gy + 1.12, pz + ss * 0.15 + cc * 0.22, 0.25, 0.12, 0.3, cyaw);
      props.add(P.box(), 0x2f6fd0, px - cc * 0.15 - ss * 0.22, gy + 1.12, pz + ss * 0.15 - cc * 0.22, 0.25, 0.12, 0.3, cyaw);
      for (const [u, v] of [[0.8, 0.5], [0.8, -0.5], [-0.8, 0.5], [-0.8, -0.5]]) props.add(P.cyl(8), 0x1a1a1a, px + u * cc + v * ss, gy + 0.22, pz - u * ss + v * cc, 0.45, 0.2, 0.45, cyaw, Math.PI / 2);
      phys.addBox(px, pz, 1.3, 0.58, cyaw, gy, gy + 1.06, { tag: 'car' });
      // the officer on duty
      const ox = best.mx + best.nx * 2 + Math.cos(yawW) * 1.5, oz = best.mz + best.nz * 2 - Math.sin(yawW) * 1.5;
      g.npc({ skin: 0x9c6a48, hair: 0x1f1a16, shirt: 0x2a3f78, bottom: 0x1e2a44, hat: 'cap', hatColor: 0x1e2a44, stache: true }, 'Agente Colón', ox, oz, yawW, async (g) => g.ui.say('Agente Colón', [
        { es: `¡Buenas, ${g.playerName}! Precinto La Guancha, a la orden.`, en: `Good day, ${g.playerName}! La Guancha precinct, at your service.` },
        { es: 'Por favor, no le des comida frita a los pelícanos. Después no hay quien los aguante.', en: "Please don't feed fried food to the pelicans. They get unbearable." },
        { es: 'Y si vas pal\' bosquecito detrás de la playa... dicen que allí se "observan pájaros". Yo no pregunto.', en: 'And if you head to the little woods behind the beach... they say people go "birdwatching" there. I don\'t ask.' },
      ]));
    }
  }

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
  hidden('jetski', 'La carrera de Marina', "Marina's jet ski race");
  hidden('karts', 'El Gran Premio de La Guancha', 'The La Guancha Grand Prix');
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
    opts.push({ label: t('shopWardrobe'), value: 'wardrobe', primary: g.shop.mask });
    opts.push({ label: t('bye'), value: 'bye' });
    const v = await g.ui.say('Doña Carmen', lines, opts);
    if (v === 'mask') {
      if (g.wallet < 100) return g.ui.say('Doña Carmen', [{ es: `${t('cantAfford')} Te faltan ${100 - g.wallet}. ¡Hay chavos por todo el tablado!`, en: `${t('cantAfford')} You need ${100 - g.wallet} more. There are chavos all over the boardwalk!` }]);
      g.wallet -= 100; g.shop.mask = true; g.counters(); g.sfx.play('buy');
      const P = g.player.pos;
      g.reveal('tienda', P.x, P.y + 1.8, P.z);
    } else if (v === 'wardrobe') await wardrobe(g);
  });

  // Doña Carmen's wardrobe: outfits and the golden pava, bought once with chavos and worn any time
  const OUTFITS = [
    { id: 'default', price: 0, name: { es: 'Guayabera blanca', en: 'White guayabera' } },
    { id: 'ponce', price: 40, name: { es: 'Camisa de Ponce (roja y negra)', en: 'Ponce shirt (red & black)' },
      line: { es: '¡Rojo y negro, los colores de Ponce! ¡Te queda brutal!', en: "Red and black, Ponce's colors! Looks great on you!" } },
    { id: 'pescador', price: 30, name: { es: 'Camisa de pescador', en: 'Fisherman shirt' },
      line: { es: '¡Ahora sí pareces de los que pescan en el muelle!', en: 'Now you look like one of the pier fishermen!' } },
    { id: 'playa', price: 30, name: { es: 'Ropa de playa', en: 'Beach clothes' },
      line: { es: '¡Listo pa’ la playa! No te olvides del bloqueador.', en: 'Ready for the beach! Don’t forget the sunscreen.' } },
    { id: 'bandera', price: 60, name: { es: 'Camiseta boricua', en: 'Boricua tee' },
      line: { es: '¡Azul como el triángulo de la bandera! ¡Wepa!', en: 'Blue like the flag’s triangle! Wepa!' } },
    { id: 'vejigante', price: 80, name: { es: 'Traje de vejigante', en: 'Vejigante outfit' },
      line: { es: '¡Amarillo y rojo, como los vejigantes del carnaval de Ponce!', en: 'Yellow and red, like the vejigantes at the Ponce carnival!' } },
  ];
  const GOLD_HAT = 120;
  async function wardrobe(g) {
    const own = g.shop.outfits ??= {};
    const opts = OUTFITS.map(o => {
      const has = o.price === 0 || own[o.id];
      const wearing = g.player.look === o.id;
      return { label: wearing ? { es: `✓ ${o.name.es}`, en: `✓ ${o.name.en}` } : has ? o.name : { es: `${o.name.es} · ${o.price} chavos`, en: `${o.name.en} · ${o.price} chavos` },
        value: o.id, disabled: wearing };
    });
    const gold = g.player.hatStyle === 'gold';
    opts.push({ label: g.shop.goldHat ? (gold ? { es: 'Pava de paja', en: 'Straw pava' } : { es: 'Pava dorada', en: 'Golden pava' })
      : { es: `Pava dorada · ${GOLD_HAT} chavos`, en: `Golden pava · ${GOLD_HAT} chavos` }, value: 'hat', primary: !g.shop.goldHat });
    opts.push({ label: t('bye'), value: 'bye' });
    const v = await g.ui.say('Doña Carmen', [{ es: `¿Qué te quieres probar? Tienes ${g.wallet} chavos.`, en: `What do you want to try on? You have ${g.wallet} chavos.` }], opts);
    if (v === 'hat') {
      if (!g.shop.goldHat) {
        if (g.wallet < GOLD_HAT) return g.ui.say('Doña Carmen', [{ es: `${t('cantAfford')} Te faltan ${GOLD_HAT - g.wallet}.`, en: `${t('cantAfford')} You need ${GOLD_HAT - g.wallet} more.` }]);
        g.wallet -= GOLD_HAT; g.shop.goldHat = true; g.counters(); g.sfx.play('buy');
        g.player.setHat('gold'); g.save();
        return g.ui.say('Doña Carmen', [{ es: '¡Una pava de oro! Brilla más que el sol de Ponce.', en: 'A golden pava! It shines brighter than the Ponce sun.' }]);
      }
      g.player.setHat(gold ? 'straw' : 'gold'); g.save();
      return;
    }
    const o = OUTFITS.find(q => q.id === v);
    if (!o) return;
    if (o.price && !own[o.id]) {
      if (g.wallet < o.price) return g.ui.say('Doña Carmen', [{ es: `${t('cantAfford')} Te faltan ${o.price - g.wallet}.`, en: `${t('cantAfford')} You need ${o.price - g.wallet} more.` }]);
      g.wallet -= o.price; own[o.id] = true; g.counters(); g.sfx.play('buy');
      g.player.setLook(o.id); g.save();
      if (o.line) await g.ui.say('Doña Carmen', [o.line]);
      return;
    }
    g.player.setLook(o.id); g.save();
  }

  // "$" over Doña Carmen whenever you can afford something new
  carmen.quest = g => {
    if (!g.shop.mask) return g.wallet >= 100 ? 'shop' : null;
    const own = g.shop.outfits || {};
    const next = [...OUTFITS.filter(o => o.price && !own[o.id]).map(o => o.price), ...(g.shop.goldHat ? [] : [GOLD_HAT])];
    return next.length && g.wallet >= Math.min(...next) ? 'shop' : null;
  };

  // ---------------------------------------------------------------- guide at the entrance
  const tomas = g.npc('guia', 'Don Tomás', ent.x + Math.cos(entFace) * 2.2, ent.z - Math.sin(entFace) * 2.2, entFace + Math.PI, async (g) => {
    const got = g.masks.filter(m => m.got).length;
    if (g.q.tomas) return g.ui.say('Don Tomás', [
      { es: `Ya llevas ${got} de ${g.masks.length} máscaras. La Guancha todavía guarda sorpresas.`, en: `You have ${got} of ${g.masks.length} masks. La Guancha still has surprises.` },
      { es: 'Si una misión te enreda, abre el mapa y tócala para seguir la próxima pista. Y habla con Marina si quieres salir al mar.', en: 'If a quest stumps you, open the map and tap it to follow the next clue. And talk to Marina if you want to head out to sea.' },
    ]);
    g.q.tomas = true;
    g.save();
    await g.ui.say('Don Tomás', [
      { es: `¡Saludos, ${g.playerName}! Bienvenido al Paseo Tablado La Guancha, en Ponce.`, en: `Greetings, ${g.playerName}! Welcome to the La Guancha boardwalk in Ponce.` },
      { es: `Por todo el área hay ${g.masks.length} máscaras de vejigante escondidas. Llevas ${got}.`, en: `There are ${g.masks.length} vejigante masks hidden around here. You have ${got}.` },
      { es: 'Salta tres veces seguidas corriendo para el triple salto. ¡Y tírale la pava a las cosas!', en: 'Jump three times in a row while running for a triple jump. And throw your pava at things!' },
      { es: 'Toca las banderas de Puerto Rico. Desde el mapa puedes viajar a cualquiera que hayas tocado.', en: 'Touch the Puerto Rico flags. From the map you can travel to any flag you have touched.' },
      { es: 'Habla con la gente: siempre saben algo. Tito te reta a correr por tierra y Marina por mar. ¡Wepa!', en: 'Talk to people: they always know something. Tito races on land and Marina on the water. Wepa!' },
    ]);
  });

  tomas.quest = g => (g.q.tomas ? null : 'available');

  // ---------------------------------------------------------------- race with Tito
  const titoP = landSpot(fromNorth(0.07));
  const raceMarks = [0.28, 0.52, 0.76].map(f => {
    const p = along(fromNorth(f), 0.72);
    const ring = M.ringMesh(0xffa44a);
    ring.position.set(p.x, deckY + 1.35, p.z);
    ring.rotation.y = Math.atan2(p.ux, p.uz);
    ring.scale.setScalar(0.75); ring.visible = false;
    g.root.add(ring);
    return ring;
  });
  const race = g.challenge({
    active: false, next: 0, elapsed: 0,
    objective() {
      if (!this.active) return null;
      const p = raceMarks[this.next]?.position;
      return p ? { x: p.x, y: deckY, z: p.z, label: { es: `Aro ${this.next + 1}/3`, en: `Ring ${this.next + 1}/3` } }
        : { x: tw.x, y: tw.topY, z: tw.z, label: { es: 'Cima de la torre', en: 'Top of the tower' } };
    },
    update(dt) {
      if (!this.active) return;
      this.elapsed += dt;
      const P = g.player.pos;
      const mark = raceMarks[this.next];
      if (mark && dist2(P.x, P.z, mark.position.x, mark.position.z) < 2.3 && Math.abs(P.y - deckY) < 2.5) {
        mark.visible = false; this.next++; g.sfx.play('ring');
        g.fx.emit(mark.position.x, mark.position.y, mark.position.z, 12, { color: 0xffa44a, speed: 2, up: 1, life: 0.5, grav: 0 });
      }
      g.ui.prog(this.next < raceMarks.length ? `🏃 ${this.next}/3` : tr({ es: '🏃 ¡A la torre!', en: '🏃 To the tower!' }));
      if (this.next === raceMarks.length && dist2(P.x, P.z, tw.x, tw.z) < 2.7 && P.y > tw.topY - 0.3) {
        this.active = false; g.stopTimer(); g.ui.prog('');
        const best = g.q.raceBest;
        if (!best || this.elapsed < best) g.q.raceBest = Math.round(this.elapsed * 10) / 10;
        if (!g.q.race) { g.q.race = true; g.reveal('carrera', P.x, P.y + 1.8, P.z); }
        else g.ui.banner(tr({ es: '¡Llegaste!', en: 'You made it!' }), `${this.elapsed.toFixed(1)} s`, 2.5);
        g.save();
      }
    },
    animate(dt, now) { for (const mark of raceMarks) if (mark.visible) mark.rotation.z = Math.sin(now * 2) * 0.1; },
  });
  const tito = g.npc('tito', 'Tito', titoP.x, titoP.z, entFace, async (g) => {
    if (race.active) return g.ui.say('Tito', [race.next < raceMarks.length
      ? { es: `¡Corre! Vas por el aro ${race.next + 1} de 3, y después a la cima de la torre.`, en: `Run! You're on ring ${race.next + 1} of 3, then the top of the tower.` }
      : { es: '¡Ya pasaste los aros! ¡A la cima de la torre!', en: 'You got all the rings! To the top of the tower!' }]);
    const v = await g.ui.say('Tito', g.q.race ? [
      { es: `¡Tú eres más rápido que un coquí con prisa! Tu mejor tiempo: ${g.q.raceBest ?? '—'} segundos. ¿Revancha?`, en: `You're faster than a coquí in a hurry! Your best time: ${g.q.raceBest ?? '—'} seconds. Rematch?` },
    ] : [
      { es: `¡Oye, ${g.playerName}! Yo corro por este tablado todas las mañanas.`, en: `Hey, ${g.playerName}! I run this boardwalk every morning.` },
      { es: 'Pasa por mis tres aros anaranjados en el tablado y después sube a la cima de la torre. ¡Sin atajos!', en: 'Run through my three orange rings on the boardwalk, then climb to the top of the tower. No shortcuts!' },
      { es: 'El reloj marca 55 segundos, pero si se acaba puedes terminar igual. ¿Le damos?', en: 'The clock says 55 seconds, but you can still finish if it runs out. Ready?' },
    ], [{ label: { es: '¡Dale!', en: "Let's go!" }, value: 'y', primary: true }, { label: { es: 'Ahora no', en: 'Not now' }, value: 'n' }]);
    if (v === 'y') {
      race.active = true; race.next = 0; race.elapsed = 0;
      raceMarks.forEach(m => (m.visible = true));
      g.startTimer(55);
      g.ui.banner('¡Fuego!', tr({ es: 'Tres aros y la torre', en: 'Three rings and the tower' }), 1.5);
    }
  });

  tito.quest = g => (g.q.race ? null : race.active ? 'active' : 'available');

  buildJetskiQuest(g, along, fromNorth, deckY);

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
  const ringsC = g.challenge({
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
          g.startTimer(24);
        }
        return;
      }
      for (const r of rings) {
        if (r.userData.hit) continue;
        if (r.position.distanceTo(new THREE.Vector3(P.x, cy, P.z)) < 1.5) {
          r.userData.hit = true; r.visible = false; this.left--;
          g.sfx.play('ring');
          if ((rings.length - this.left) % 3 === 0) g.popCoin(r.position.x, r.position.y, r.position.z);
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
  g.aimables.push(() => cocos.filter(c => !c.down).map(c => c.m.position));
  const cocosC = g.challenge({
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
          g.popCoin(c.x, H(c.x, c.z) + 1.5, c.z);
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
    if (kit.state === 'home') return g.ui.say('Gabi', [
      { es: 'Mishu duerme aquí conmigo otra vez. Ahora miro la puerta antes de abrir una lata de atún.', en: 'Mishu sleeps beside me again. Now I check the door before opening a can of tuna.' },
      { es: `¡Mishu y yo te queremos mucho, ${g.playerName}!`, en: `Mishu and I love you, ${g.playerName}!` },
    ]);
    if (kit.state === 'follow' && dist2(kitten.position.x, kitten.position.z, gabi.x, gabi.z) < 5) {
      kit.state = 'home';
      g.q.kitten = true;
      delete g.q.kittenFollowing;
      kitten.position.set(gabi.x + 0.8, gabi.y, gabi.z + 0.3);
      g.sfx.play('meow');
      await g.ui.say('Gabi', [
        { es: `¡¡Mishu!! ¡La encontraste, ${g.playerName}! Ya iba a hacerle un cartel de "se busca".`, en: `Mishu!! You found her, ${g.playerName}! I was about to make a missing-cat poster.` },
        { es: '¡Muchas gracias! Toma, esto es para ti.', en: 'Thank you so much! Here, this is for you.' },
      ]);
      const P = g.player.pos;
      g.reveal('gatito', P.x, P.y + 1.8, P.z);
      return;
    }
    if (kit.state === 'follow') return g.ui.say('Gabi', [{ es: '¡Oigo un maullido! Acércate un poquito más con Mishu para que la pueda ver.', en: 'I hear a meow! Bring Mishu a little closer so I can see her.' }]);
    g.q.kittenAsked = true;
    g.save();
    await g.ui.say('Gabi', [
      { es: 'Buaa… Perdí a mi gatita Mishu. Salió corriendo cuando abrí una lata de atún. Es anaranjada y muy traviesa.', en: 'Waah… I lost my kitten Mishu. She ran off when I opened a can of tuna. She is orange and very naughty.' },
      { es: 'Creo que se escondió entre los carros del estacionamiento grande, cerca del tablado. Si la encuentras, camina de vuelta y te sigue.', en: 'I think she hid between the cars in the big parking lot near the boardwalk. If you find her, walk back and she will follow you.' },
    ]);
  });
  const kittenC = g.challenge({
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
  const pelicanC = g.challenge({
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
        g.ui.toast(tr({ es: `¡Brincó al pilote ${pelState.i + 1}/${perches.length}!`, en: `It hopped to piling ${pelState.i + 1}/${perches.length}!` }), 2);
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
    return g.challenge({
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
            g.ui.toast(got.length === meshes.length ? tr({ es: '¡Máscara completa!', en: 'Mask complete!' })
              : got.length === 1 ? tr({ es: `${t('shards')}: 1/${meshes.length}. Los demás brillan cerca.`, en: `${t('shards')}: 1/${meshes.length}. The others glint nearby.` })
                : `${t('shards')}: ${got.length}/${meshes.length}`, 2);
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
  const shardsParkC = shardSet('park', parkPts, () => {
    const y = fp ? fp.top + 1.5 : top(pcx, pcz) + 1.5;
    g.reveal('pedazos_parque', fp ? fp.x : pcx, y, fp ? fp.z : pcz);
  });
  // basin shards on moored boats
  const [bcx, bcz] = L(-300, 0);
  const moored = info.boats.filter(b => H(b.x, b.z) < -2).sort((a, b) => dist2(a.x, a.z, bcx, bcz) - dist2(b.x, b.z, bcx, bcz));
  const boatPts = [];
  for (const b of moored) { if (boatPts.every(p => dist2(p[0], p[2], b.x, b.z) > 10)) boatPts.push([b.x, b.top + 1.0, b.z]); if (boatPts.length === 5) break; }
  const longest = info.piers.slice().sort((a, b) => dist2(b[0], b[1], b[2], b[3]) - dist2(a[0], a[1], a[2], a[3]))[0];
  const shardsBayC = shardSet('bay', boatPts, () => {
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
      { es: 'Si te tiras al agua, agarra bien la pava. La última vez la corriente casi se lleva la mía.', en: 'If you jump in, hold on to your pava. Last time the current nearly took mine.' },
    ]);
  });

  const yari = g.npc('lifeguard', 'Yari', lgx + 2.5, lgz + 1.5, -0.5, async (g) => g.ui.say('Yari', [
    { es: `¡Hola, ${g.playerName}! Soy la salvavidas. Desde mi caseta se ve todo el arrecife.`, en: `Hi, ${g.playerName}! I'm the lifeguard. You can see the whole reef from my tower.` },
    { es: 'Un truco: agáchate (⤓) y salta sin moverte para dar un salto mortal bien alto.', en: 'A trick: crouch (⤓) and jump while standing still for a really high backflip.' },
    { es: 'Y si pasas por el aro verde de la arena, empieza la carrera de aros. El reloj solo marca tu ritmo, no te elimina.', en: "And if you go through the green ring on the sand, the ring race starts. The clock only keeps your pace; it won't knock you out." },
  ]));

  g.npc('tourist', 'Mike', tw.x + 5, tw.z + 3, Math.PI, async (g) => g.ui.say('Mike', [
    { es: 'Hello! Digo… ¡hola! Vine en crucero a ver Ponce, la Perla del Sur.', en: 'Hello! I came on a cruise to see Ponce, the Pearl of the South.' },
    { es: 'Desde la torre se ve la Isla de Cardona con su faro, y más lejos Caja de Muertos.', en: 'From the tower you can see Cardona Island and its lighthouse, and farther out Caja de Muertos.' },
    { es: 'Dicen que hay algo encima del techo de la torre… ¿se podrá llegar tirando la pava y rebotando en ella?', en: 'They say there is something above the tower roof… could you get there by throwing your hat and bouncing on it?' },
    { es: 'Le mandé una foto a mi familia y ahora todos quieren venir. Les dije que trajeran zapatos cómodos.', en: 'I sent my family a photo and now they all want to come. I told them to bring comfortable shoes.' },
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
  // car-roof hops: a chavo over each roof in a cluster of parked cars in the two big lots
  const carRoofs = phys.cols.filter(c => c.tag === 'car' && c.y1 - c.y0 < 0.6);
  for (const lot of data.world.parking.slice(0, 2)) {
    const pts = lot.map(([x, y]) => L(x, y));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const mid = c => [(c.minx + c.maxx) / 2, (c.minz + c.maxz) / 2];
    const first = carRoofs.slice().sort((a, b) => dist2(...mid(a), cx, cz) - dist2(...mid(b), cx, cz))[0];
    if (!first) continue;
    const [fx, fz] = mid(first);
    for (const c of carRoofs.filter(c => dist2(...mid(c), fx, fz) < 14).slice(0, 8)) { const [x, z] = mid(c); g.coin(x, c.y1 + 0.7, z); }
  }
  // walk the park wall: chavos along two stretches of its top
  const walls = phys.cols.filter(c => c.tag === 'wall');
  for (const start of [Math.floor(walls.length * 0.2), Math.floor(walls.length * 0.65)]) {
    for (const c of walls.slice(start, start + 10)) g.coin((c.minx + c.maxx) / 2, c.y1 + 0.6, (c.minz + c.maxz) / 2);
  }
  // a ring on the brick plaza at the boardwalk's north end
  {
    const n = along(fromNorth(0), -6);
    g.coinRing(n.x, top(n.x, n.z) + 0.7, n.z, 3, 10);
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
  // four shells on car roofs, spread across the parked cars (always four, however many cars there are)
  const roofs = phys.cols.filter(c => c.tag === 'car' && c.y1 - c.y0 < 0.5);
  for (let i = 0; i < 4 && roofs.length; i++) {
    const c = roofs[Math.floor((i + 0.5) / 4 * roofs.length)];
    addShell((c.minx + c.maxx) / 2, c.y1 + 0.7, (c.minz + c.maxz) / 2);
  }
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
  // schools of little reef fish around the bay and the reef; they scatter when you swim close
  {
    const COLORS = [0x3a7bff, 0xffd23f, 0x3ad6b8, 0xff8a3d, 0xc8d8e8, 0xff6fa8];
    const schools = [];
    const Rf = rng(77);
    const bnd = data.bounds;
    for (let tries = 0; tries < 4000 && schools.length < 20; tries++) {
      const x = bnd.x0 + Rf() * (bnd.x1 - bnd.x0), z = bnd.z0 + Rf() * (bnd.z1 - bnd.z0);
      const depth = -H(x, z);
      if (depth < 1.2 || depth > 7) continue;
      if (schools.some(q => dist2(q.x, q.z, x, z) < 25)) continue;
      schools.push({ x, z, depth, color: COLORS[schools.length % COLORS.length], n: 8 + Math.floor(Rf() * 6), ph: Rf() * 10, r: 1.8 + Rf() * 2 });
    }
    const total = schools.reduce((a, q) => a + q.n, 0);
    const reef = new THREE.InstancedMesh(M.reefFishGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x111111 }), total);
    reef.frustumCulled = false;
    const col = new THREE.Color();
    let k = 0;
    for (const q of schools) for (let i = 0; i < q.n; i++) reef.setColorAt(k++, col.setHex(q.color).offsetHSL((Rf() - 0.5) * 0.04, 0, (Rf() - 0.5) * 0.1));
    scene.add(reef);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(1.3, 1.3, 1.3);
    g.animals.push({
      update(dt, now) {
        const P = g.player.pos;
        let k = 0;
        for (const q of schools) {
          // the school drifts in a slow loop around its home
          const cx = q.x + Math.sin(now * 0.07 + q.ph) * 4, cz = q.z + Math.cos(now * 0.05 + q.ph) * 4;
          const cy = -Math.min(q.depth - 0.5, 1 + q.depth * 0.4);
          const scare = Math.max(0, 1 - dist2(P.x, P.z, cx, cz) / 5) * (P.y < 0.5 ? 1 : 0.3);
          for (let i = 0; i < q.n; i++) {
            const a = now * (0.7 + (i % 3) * 0.1) + i / q.n * Math.PI * 2 + q.ph;
            const r = q.r * (1 + scare * 1.6) + (i % 4) * 0.3;
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.7;
            e4.set(0, -a, Math.sin(now * 8 + i) * 0.15);
            q4.setFromEuler(e4);
            m4.compose(v4.set(x, cy + Math.sin(now * 1.3 + i) * 0.25 + (i % 3 - 1) * 0.3, z), q4, s4);
            reef.setMatrixAt(k++, m4);
          }
        }
        reef.instanceMatrix.needsUpdate = true;
      },
    });
  }

  // tame pelicans perched on the boardwalk railing (people feed them there); they turn to look at
  // you and flap when you walk right up
  {
    const perched = [0.12, 0.3, 0.47, 0.63, 0.8, 0.93].map((f, i) => {
      const p = along(fromNorth(f), 0.72 + 2.1 - 0.08);
      const bird = M.pelicanMesh();
      bird.scale.setScalar(1.15);
      bird.position.set(p.x, deckY + 0.66, p.z);
      bird.rotation.y = Math.atan2(p.nx, p.nz) + (i % 2 ? 0.6 : -0.6);
      g.root.add(bird);
      return { bird, base: bird.rotation.y, flap: 0, ph: i * 1.7 };
    });
    g.animals.push({
      update(dt, now) {
        const P = g.player.pos;
        for (const q of perched) {
          const d = dist2(P.x, P.z, q.bird.position.x, q.bird.position.z);
          if (d > 60) continue;
          const want = d < 6 ? Math.atan2(P.x - q.bird.position.x, P.z - q.bird.position.z) : q.base + Math.sin(now * 0.3 + q.ph) * 0.4;
          let r = want - q.bird.rotation.y;
          r = Math.atan2(Math.sin(r), Math.cos(r));
          q.bird.rotation.y += r * Math.min(1, dt * 3);
          if (d < 2.2 && q.flap <= 0) { q.flap = 1.2; g.sfx.play('pelican'); }
          q.flap -= dt;
          const w = q.bird.userData.wings, f = q.flap > 0 ? Math.sin(now * 14) * 0.9 : 0.05;
          w[0].rotation.z = f; w[1].rotation.z = -f;
        }
      },
    });
  }

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

  // Moth (moth-quest.js): her box goes on open grass near the park flag, with nothing overhead
  // (canopy, roof), off paths and roads, and clear of coins, people and flags
  const lanes = [...data.world.footways.map(w => ({ p: w.map(([x, y]) => L(x, y)), w: 1.8 })),
    ...data.world.roads.map(r => ({ p: r.p.map(([x, y]) => L(x, y)), w: r.w * S / 2 + 1.5 }))];
  const onLane = (x, z) => lanes.some(({ p, w }) => p.some((q, i) => {
    if (i === 0) return false;
    const [ax, az] = p[i - 1], ex = q[0] - ax, ez = q[1] - az, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    return Math.hypot(x - ax - ex * t, z - az - ez * t) < w;
  }));
  const mothOpen = (x, z) => {
    const cols = phys.near(x, z, 1.2).filter(c => c.maxx > x - 0.9 && c.minx < x + 0.9 && c.maxz > z - 0.9 && c.minz < z + 0.9);
    if (cols.length || H(x, z) < 0.3 || onLane(x, z)) return false;
    return !g.coins.some(c => dist2(c.x, c.z, x, z) < 2) && !g.npcs.some(n => dist2(n.x, n.z, x, z) < 2.5)
      && !g.flags.some(f => dist2(f.x, f.z, x, z) < 3);
  };
  const mothSpot = (cx, cz) => {
    for (let r = 0; r < 40; r += 0.5) for (let k = 0, n = Math.max(1, Math.round(r * 5)); k < n; k++) {
      const an = k / n * Math.PI * 2 + r;
      const x = cx + Math.cos(an) * r, z = cz + Math.sin(an) * r;
      if (mothOpen(x, z)) return { x, z };
    }
    return { x: cx, z: cz };
  };
  const mothPark = mothSpot(pkx + 4, pkz + 4);
  buildMothQuest(g, { top, H, park: mothPark, carmen, carmenFace: Math.atan2(sf.nx, sf.nz), along, total, deckY });
  const aves = buildAvesQuest(g, { top, H, onLane, dist2, center: L(380, 140) }); // the woods between the road and the beach
  buildWoodsCrowd(g, { top, H, dist2, center: L(380, 140), aves, roads: data.world.roads.map(r => r.p.map(([x, y]) => L(x, y))) });

  // ---------------------------------------------------------------- quest log entries (menu → Misiones)
  const Q = (es, en) => ({ es, en });
  const at = (n, label) => () => ({ x: n.x, y: n.y, z: n.z, label });
  const maskDone = id => !!g.maskById(id)?.got;
  g.quest({ id: 'tomas', name: Q('Bienvenida a La Guancha', 'Welcome to La Guancha'), giver: 'Don Tomás',
    desc: Q('Habla con Don Tomás, el guía de la entrada. Él te explica todo.', 'Talk to Don Tomás, the guide at the entrance. He explains everything.'),
    status: () => (g.q.tomas ? 'done' : 'available'), where: at(tomas, Q('Habla con Don Tomás', 'Talk to Don Tomás')) });
  g.quest({ id: 'race', name: Q('Carrera con Tito', 'Race with Tito'), giver: 'Tito', challenge: race,
    desc: Q('Pasa por los tres aros anaranjados del tablado y sube a la cima de la torre. ¡Sin prisa si se acaba el tiempo!', 'Run through the three orange rings on the boardwalk, then climb to the top of the tower. No rush if time runs out!'),
    progress: () => (race.active ? `${race.next}/3` : ''),
    status: () => (g.q.race ? 'done' : race.active ? 'active' : 'available'), where: at(tito, Q('Habla con Tito', 'Talk to Tito')) });
  g.quest({ id: 'rings', name: Q('Los aros de la playa', 'The beach rings'), giver: 'Yari', challenge: ringsC,
    desc: Q('Pasa por el aro verde en la arena y sigue la línea de aros. Cada tercer aro suelta un chavo.', 'Go through the green ring on the sand and follow the line of rings. Every third ring drops a chavo.'),
    progress: () => (ringsC.active ? `${rings.length - ringsC.left}/${rings.length}` : ''),
    status: () => (g.q.rings ? 'done' : ringsC.active ? 'active' : 'available'),
    where: () => ({ x: startRing.position.x, y: startRing.position.y - 1.6, z: startRing.position.z, label: Q('Aro verde de la playa', 'Green ring on the beach') }) });
  g.quest({ id: 'cocos', name: Q('Tumba los cocos', 'Knock down the coconuts'), challenge: cocosC,
    desc: Q('Tírale la pava a los cocos de las tres palmas cerca de la rotonda del sur. Cada coco suelta un chavo.', 'Throw your pava at the coconuts in the three palms by the south roundabout. Each one drops a chavo.'),
    progress: () => `${cocos.filter(c => c.down).length}/${cocos.length}`,
    status: () => (g.q.cocos ? 'done' : cocos.some(c => c.down) ? 'active' : 'available'),
    where: () => ({ x: cocos[0].x, y: cocos[0].y - 4, z: cocos[0].z, label: Q('Palmas con cocos', 'Palms with coconuts') }) });
  g.quest({ id: 'kitten', name: Q('La gatita de Gabi', "Gabi's kitten"), giver: 'Gabi', challenge: kittenC,
    desc: Q('Gabi perdió a Mishu. Búscala entre los carros del estacionamiento grande y camina de vuelta al parque para que te siga.', 'Gabi lost Mishu. Look among the cars in the big parking lot, then walk back to the park so she follows you.'),
    status: () => (g.q.kitten ? 'done' : g.q.kittenAsked || g.q.kittenFollowing ? 'active' : 'available'), where: at(gabi, Q('Habla con Gabi', 'Talk to Gabi')) });
  if (perches.length) g.quest({ id: 'pelican', name: Q('El pelícano del muelle viejo', 'The old pier pelican'), challenge: pelicanC,
    desc: Q('Acércate al pelícano y síguelo de pilote en pilote.', 'Walk up to the pelican and follow it from piling to piling.'),
    status: () => (g.q.pelican ? 'done' : pelState.i > 0 ? 'active' : 'available'),
    where: () => ({ x: perches[0][0], y: perches[0][2], z: perches[0][1], label: Q('Pelícano del muelle viejo', 'Old pier pelican') }) });
  g.quest({ id: 'chest', name: Q('El cofre hundido', 'The sunken chest'),
    desc: Q('Hay un cofre en el fondo de la bahía. Sigue las burbujas y aguanta ⤓ para bucear.', 'There is a chest on the bottom of the bay. Follow the bubbles and hold ⤓ to dive.'),
    status: () => (g.q.chest ? 'done' : 'available'), where: () => ({ x: chx, y: chY, z: chz, label: Q('Cofre hundido', 'Sunken chest') }) });
  const shardQ = (id, key, n, name, desc, c, pts) => g.quest({ id, name, desc, challenge: c,
    progress: () => `${(g.q[key] || []).length}/${n}`,
    status: () => ((g.q[key] || []).length >= n ? 'done' : (g.q[key] || []).length ? 'active' : 'available'),
    where: () => ({ x: pts[0][0], y: pts[0][1] - 1, z: pts[0][2], label: name }) });
  shardQ('shards_park', 'sh_park', parkPts.length, Q('Pedazos del parque', 'Pieces in the park'),
    Q('Junta los pedazos rojos de máscara por el parque. Mira arriba también: uno está en la copa de un árbol.', 'Collect the red mask pieces around the park. Look up too: one is in a treetop.'), shardsParkC, parkPts);
  if (boatPts.length) shardQ('shards_bay', 'sh_bay', boatPts.length, Q('Pedazos de la bahía', 'Pieces in the bay'),
    Q('Hay pedazos de máscara encima de los botes anclados. Brinca de bote en bote; la máscara aparece en el muelle.', 'There are mask pieces on top of the moored boats. Hop from boat to boat; the mask appears on the pier.'), shardsBayC, boatPts);
  g.quest({ id: 'shop', name: Q('La tienda de Doña Carmen', "Doña Carmen's shop"), giver: 'Doña Carmen',
    desc: Q('Junta 100 chavos y cómprale su máscara especial.', 'Save up 100 chavos and buy her special mask.'),
    progress: () => (g.shop.mask ? '' : `${Math.min(g.wallet, 100)}/100 chavos`),
    status: () => (g.shop.mask ? 'done' : 'available'), where: at(carmen, Q('Kiosko de Doña Carmen', "Doña Carmen's kiosk")) });
  g.quest({ id: 'conchas', name: Q('Todas las conchas', 'Every conch shell'),
    desc: Q('Hay 50 conchas por toda La Guancha. En el mapa ves cuántas quedan por zona.', 'There are 50 conch shells all over La Guancha. The map shows how many are left in each area.'),
    progress: () => `${g.conchaTotal - g.conchas.filter(c => c.alive).length}/${g.conchaTotal}`,
    status: () => (maskDone('conchas') || !g.conchas.some(c => c.alive) ? 'done' : g.conchas.some(c => !c.alive) ? 'active' : 'available'),
    where: () => { const P = g.player.pos; const c = g.conchas.filter(c => c.alive).sort((a, b) => dist2(a.x, a.z, P.x, P.z) - dist2(b.x, b.z, P.x, P.z))[0] || g.conchas[0];
      return { x: c.x, y: c.y, z: c.z, label: Q('Concha más cercana', 'Nearest conch') }; } });

  buildProps(g, props);
  buildCrowd(g, along, fromNorth, total);
  buildPaseoLife(g);
  buildKartRace(g); // after the paseo life: it closes the street (riders, bollards) while racing
  // no chavo stays buried in something solid: lift it on top
  for (const c of g.coins) {
    const hit = phys.near(c.x, c.z, 0.3).filter(k => k.solid && c.y > k.y0 && c.y - 0.3 < k.y1 && phys.sdist(k, c.x, c.z).inside);
    if (hit.length) c.y = Math.max(...hit.map(k => k.y1)) + 0.7;
  }

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
