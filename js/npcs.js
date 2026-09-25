// Ambient people: strollers and joggers on the boardwalk, fishermen, folks on benches, kids at the
// playground, a vendor at every kiosk and musicians on the tarima. All can be talked to; many give
// hints for masks you haven't found yet.
import * as THREE from 'three';
import { S } from './data.js';
import { tr } from './i18n.js';
import * as M from './models.js';
import { rng } from './geo.js';

const L = (x, y) => [x * S, -y * S];

// what each kiosk sells, and how to brag about it (no hot coco frío!)
export const FOOD_LINES = {
  'Bacalaítos': { es: '¡Bacalaítos crujientes, recién salidos del caldero!', en: 'Crispy bacalaítos, fresh out of the fryer!' },
  'Empanadillas': { es: 'Empanadillas de carne, pollo y queso. ¡Calientitas!', en: 'Beef, chicken and cheese empanadillas. Nice and hot!' },
  'Alcapurrias': { es: 'Alcapurrias de jueyes, como las de abuela.', en: 'Crab alcapurrias, just like grandma makes them.' },
  'Piraguas': { es: 'Piraguas bien frías: frambuesa, coco, tamarindo… ¿cuál quieres?', en: 'Ice-cold piraguas: raspberry, coconut, tamarind… which one?' },
  'Coco Frío': { es: '¡Coco frío, bien fríito! Te lo abro con el machete.', en: 'Coco frío, ice cold! I open it for you with the machete.' },
  'Pinchos': { es: 'Pinchos de pollo a la parrilla con su pan. ¡Huele rico!', en: 'Grilled chicken pinchos with bread. Smells great!' },
  'Sorullitos': { es: 'Sorullitos de maíz con mayoketchup. ¡Calientitos!', en: 'Corn sorullitos with mayoketchup. Nice and hot!' },
  'Mofongo': { es: 'Mofongo relleno de mariscos, el mejor de Ponce.', en: 'Seafood-stuffed mofongo, the best in Ponce.' },
  'Tostones': { es: 'Tostones bien crujientes con mojito de ajo.', en: 'Extra-crispy tostones with garlic mojito.' },
  'Pastelillos': { es: 'Pastelillos de guayaba y queso, ¡recién hechos!', en: 'Guava and cheese pastelillos, freshly made!' },
  'Limber': { es: 'Limber de coco bien congelado para el calor.', en: 'Frozen coconut limber for the heat.' },
  'Arañitas': { es: 'Arañitas de plátano, crujientes y doraditas.', en: 'Plantain arañitas, crispy and golden.' },
  'Mariscos': { es: 'Ensalada de pulpo y carrucho, fresquecita.', en: 'Octopus and conch salad, nice and fresh.' },
  'Chillo Frito': { es: 'Chillo frito entero con tostones. ¡Del mar a tu plato!', en: 'Whole fried snapper with tostones. Sea to plate!' },
  'Jugos': { es: 'Jugos naturales bien fríos: parcha, acerola, china.', en: 'Ice-cold fresh juices: passion fruit, acerola, orange.' },
};
const CHATTER = [
  { es: '¡Qué calor! Suerte que aquí en La Guancha siempre hay brisa.', en: "So hot! Lucky there's always a breeze here at La Guancha." },
  { es: 'Los domingos esto se llena de familias. ¡Y de música en la tarima!', en: 'On Sundays this fills up with families. And music on the stage!' },
  { es: 'Ponce es la Perla del Sur, ¿sabías?', en: 'Ponce is the Pearl of the South, did you know?' },
  { es: 'Los vejigantes de Ponce son de papel maché; los de Loíza, de coco.', en: "Ponce's vejigante masks are papier-mâché; Loíza's are made from coconuts." },
  { es: 'Cuidado con los pelícanos, que se roban el pescado de los pescadores.', en: 'Watch out for the pelicans, they steal the fishermen’s catch.' },
  { es: 'Desde la torre se ven los atardeceres más bonitos de Ponce.', en: 'The prettiest sunsets in Ponce are seen from the tower.' },
  { es: 'El faro de Caja de Muertos es de 1887. Me encantaría verlo de cerca algún día.', en: "The Caja de Muertos lighthouse dates to 1887. I'd love to see it up close someday." },
  { es: '¿Tú eres el jíbaro que anda buscando máscaras? ¡Wepa!', en: 'Are you the jíbaro looking for masks? Wepa!' },
  { es: 'Mira cuántos sábalos hay debajo del tablado. ¡Son enormes!', en: 'Look how many tarpon there are under the boardwalk. They’re huge!' },
  { es: 'Yo vengo a caminar aquí todas las mañanas, antes de que caliente el sol.', en: 'I walk here every morning, before the sun gets hot.' },
  { es: '¡Brincando así vas a llegar a la luna, mijo!', en: 'Jumping like that you’ll reach the moon, kid!' },
  { es: 'Si te cansas, siéntate en un banco y mira los botes.', en: 'If you get tired, sit on a bench and watch the boats.' },
];

// hints for masks that aren't found yet
const HINTS = {
  torre: { es: 'Arriba en la torre hay algo que brilla.', en: 'Something shines at the top of the tower.' },
  techo: { es: 'Encima del techo de la torre… dicen que se llega desde la baranda.', en: 'Above the tower roof… they say you can get there from the railing.' },
  islote: { es: 'El islote de mangle en la bahía esconde algo.', en: 'The mangrove islet in the bay hides something.' },
  sabalos: { es: 'Nada debajo del tablado, donde están los sábalos.', en: 'Swim under the boardwalk where the tarpon are.' },
  club: { es: 'En el techo del Club Náutico vi algo de colores.', en: 'I saw something colorful on the yacht club roof.' },
  playa: { es: 'Camina hasta el final de la playa, pasando la caseta del salvavidas.', en: 'Walk to the far end of the beach, past the lifeguard tower.' },
  arrecife: { es: 'En el arrecife hay una roca que sobresale del agua.', en: 'There’s a rock sticking out of the water on the reef.' },
  kiosko: { es: 'Súbete al techo del kiosko más grande.', en: 'Climb onto the roof of the biggest kiosk.' },
  fuente: { es: 'La fuente de la rotonda se puede escalar.', en: 'You can climb the roundabout fountain.' },
  yate: { es: 'El yate más alto de la bahía tiene algo arriba.', en: 'The tallest yacht in the bay has something up top.' },
  almacen: { es: 'Los contenedores al lado del almacén del puerto son como una escalera.', en: 'The containers next to the port warehouse work like stairs.' },
  boya: { es: 'Nada hasta la boya roja del canal.', en: 'Swim out to the red buoy in the channel.' },
  salvavidas: { es: 'Desde la caseta del salvavidas, un salto mortal llega bien alto.', en: 'From the lifeguard tower, a backflip goes really high.' },
  cajas: { es: 'Hay unas cajas cerca del estacionamiento del sur. ¡Rómpelas con un golpe al suelo!', en: 'There are crates near the south parking lot. Break them with a ground pound!' },
  brillo_playa: { es: 'Algo brilla en la arena de la playa. Dale un golpe al suelo.', en: 'Something sparkles in the beach sand. Try a ground pound.' },
  brillo_peninsula: { es: 'En la península, cerca del rompeolas, algo brilla.', en: 'On the peninsula near the breakwater, something sparkles.' },
  brillo_parque: { es: 'En el Parque de los Niños hay un brillo en el suelo.', en: 'There’s a sparkle on the ground in the kids’ park.' },
  cofre: { es: 'En lo más hondo de la bahía hay un cofre. Sigue las burbujas.', en: 'There’s a chest at the bottom of the bay. Follow the bubbles.' },
  pelicano: { es: 'El pelícano del muelle viejo quiere jugar contigo.', en: 'The pelican on the old pier wants to play.' },
  gatito: { es: 'La nena del parque perdió su gatita.', en: 'The girl in the park lost her kitten.' },
  carrera: { es: 'Tito siempre reta a la gente a correr hasta la torre.', en: 'Tito always challenges people to race to the tower.' },
  aros: { es: 'En la arena hay un aro verde. Pásale por el medio.', en: 'There’s a green ring on the sand. Go through it.' },
  cocos: { es: 'Tírale la pava a los cocos de las palmas cerca de la rotonda del sur.', en: 'Throw your hat at the coconuts in the palms by the south roundabout.' },
  pedazos_parque: { es: 'Hay pedazos de máscara regados por el parque.', en: 'There are mask pieces scattered around the park.' },
  pedazos_bahia: { es: 'Vi pedazos de máscara encima de los botes.', en: 'I saw mask pieces on top of the boats.' },
  tienda: { es: 'Doña Carmen vende una máscara por 100 chavos.', en: 'Doña Carmen sells a mask for 100 chavos.' },
  conchas: { es: 'Si recoges todas las conchas rosadas, pasa algo especial.', en: 'If you collect every pink shell, something special happens.' },
};

export function buildCrowd(g, along, fromNorth, total) {
  const { phys, world, data } = g;
  const H = data.terrainH;
  const info = world.info;
  const R = rng(1234);
  const deckY = info.deckY;
  const crowd = [];

  const say = n => async (g) => {
    const lines = [{ es: `¡Hola, ${g.playerName}!`, en: `Hi, ${g.playerName}!` }];
    if (n.lines) lines.push(...n.lines);
    else {
      lines.push(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
      const left = g.masks.filter(m => !m.got && HINTS[m.id]);
      if (left.length && Math.random() < 0.75) lines.push(HINTS[left[Math.floor(Math.random() * left.length)].id]);
    }
    await g.ui.say(n.name, lines);
  };
  const NAMES = ['Doña Lula', 'Don Cheo', 'Mayra', 'Wilfredo', 'Nilda', 'Papo', 'Yamilet', 'Chago', 'Iris', 'Junior', 'Maritza', 'Toño', 'Luz', 'Pedro', 'Carmencita', 'Héctor', 'Zoraida', 'Kiko'];
  const KIDS = ['Yadiel', 'Sofía', 'Jayden', 'Valeria', 'Ángel', 'Camila'];
  const person = (name, look, x, z, face, opts = {}) => {
    const n = g.npc(look, name, x, z, face, null, { ...opts, custom: true });
    n.talk = say(n);
    crowd.push(n);
    return n;
  };
  const walkAnim = (n, sp, dt) => {
    n.phase += dt * (3 + sp * 3);
    const s = Math.sin(n.phase), k = Math.min(1, sp / 2);
    n.m.legs[0].rotation.x = s * 0.8 * k; n.m.legs[1].rotation.x = -s * 0.8 * k;
    n.m.arms[0].rotation.x = -s * 0.6 * k; n.m.arms[1].rotation.x = s * 0.6 * k;
    n.m.body.position.y = 0.52 + Math.abs(Math.cos(n.phase)) * 0.04 * k;
  };
  const faceTo = (n, yaw, dt, rate = 6) => {
    let d = yaw - n.m.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    n.m.root.rotation.y += d * Math.min(1, dt * rate);
  };
  const nearPlayer = n => Math.hypot(g.player.pos.x - n.x, g.player.pos.z - n.z) < 2.2;

  // ---- strollers and joggers on the boardwalk
  for (let i = 0; i < 14; i++) {
    const jog = i < 3;
    const n = person(NAMES[i % NAMES.length], M.randomLook(R, jog ? { hat: 'cap' } : {}), 0, 0, 0);
    n.f = 0.05 + R() * 0.9; n.dir = R() < 0.5 ? 1 : -1; n.lane = 0.72 + (R() - 0.5) * 2.6;
    n.speed = jog ? 3.4 : 1.0 + R() * 0.6;
    if (jog) n.name = { es: 'Corredora', en: 'Jogger' };
    n.update = (dt) => {
      let sp = n.speed;
      if (nearPlayer(n)) sp = 0;
      n.f += n.dir * sp * dt / total;
      if (n.f > 0.98 || n.f < 0.02) { n.dir *= -1; n.f = Math.max(0.02, Math.min(0.98, n.f)); }
      const p = along(n.f, n.lane);
      n.x = p.x; n.z = p.z; n.y = deckY;
      n.m.root.position.set(n.x, n.y, n.z);
      const yaw = sp ? Math.atan2(p.ux * n.dir, p.uz * n.dir) : Math.atan2(g.player.pos.x - n.x, g.player.pos.z - n.z);
      faceTo(n, yaw, dt);
      walkAnim(n, sp, dt);
    };
  }

  // ---- fishermen at the railing, rods over the water
  for (const f of [0.15, 0.4, 0.62, 0.85]) {
    const p = along(fromNorth(f), 0.72 + 1.75);
    const n = person(R() < 0.5 ? 'Don Cheo' : 'Papo', M.randomLook(R, { hat: R() < 0.5 ? 'pava' : 'cap', dress: false }), p.x, p.z, Math.atan2(p.nx, p.nz));
    // rod held in both hands (arms reach forward), angled up over the railing, line down to a bobber
    n.m.arms[0].rotation.x = n.m.arms[1].rotation.x = -1.1;
    const rod = new THREE.Group();
    rod.position.set(0, 0.2, 0.3); // at the hands
    rod.rotation.x = 0.9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
    pole.position.y = 1.3;
    rod.add(pole);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), new THREE.MeshLambertMaterial({ color: 0x777c84 }));
    reel.position.set(0, 0.35, 0.05); reel.rotation.z = Math.PI / 2;
    rod.add(reel);
    n.m.body.add(rod);
    // the line hangs from the tip to the water (the body sits 0.52 above the feet)
    const tipY = 0.52 + 0.2 + 2.6 * Math.cos(0.9), tipZ = 0.3 + 2.6 * Math.sin(0.9);
    const drop = tipY + n.y - 0.05;
    const lineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, drop, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    lineMesh.position.set(0, tipY - drop / 2, tipZ);
    n.m.root.add(lineMesh);
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8452f }));
    bobber.position.set(0, tipY - drop, tipZ);
    n.m.root.add(bobber);
    n.lines = [
      { es: 'Shhh… que se espantan los peces. Aquí pican los sábalos y los róbalos.', en: 'Shhh… you’ll scare the fish. Tarpon and snook bite here.' },
      { es: 'Ayer saqué un sábalo así de grande. ¡Pero lo solté!', en: 'Yesterday I hooked a tarpon this big. But I let it go!' },
    ];
    n.update = (dt, now) => {
      rod.rotation.z = Math.sin(now * 0.8 + f * 9) * 0.05;
      bobber.position.y = tipY - drop + Math.sin(now * 2.2 + f * 5) * 0.03;
    };
  }

  // ---- people sitting on benches (find bench colliders)
  const benches = phys.cols.filter(c => c.tag === 'bench');
  benches.filter((_, i) => i % 3 === 0).slice(0, 6).forEach((c, i) => {
    const cx = (c.minx + c.maxx) / 2, cz = (c.minz + c.maxz) / 2;
    const [a, b] = c.pts;
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
    // face away from the backrest: toward the water (lower ground)
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const face = H(cx + fx * 5, cz + fz * 5) < H(cx - fx * 5, cz - fz * 5) ? yaw : yaw + Math.PI;
    const n = person(NAMES[(i + 5) % NAMES.length], M.randomLook(R), cx, cz, face, { y: c.y1 - 0.5 });
    n.m.legs[0].rotation.x = n.m.legs[1].rotation.x = -1.5;
    n.m.body.position.y = 0.5;
    n.update = (dt, now) => { n.m.headPivot.rotation.y = Math.sin(now * 0.3 + i) * 0.4; };
  });

  // ---- kids running between the playground pieces, and a parent watching
  const pg = info.playground || [];
  if (pg.length) {
    for (let i = 0; i < 5; i++) {
      const [sx, sz] = pg[i % pg.length];
      const n = person(KIDS[i], M.randomLook(R, { scale: 0.72, hat: 'none' }), sx + 3, sz, 0);
      n.target = pg[(i + 1) % pg.length]; n.wait = R() * 2;
      n.lines = [[
        { es: '¡Vamos a la chorrera! ¡Tú no me alcanzas!', en: 'Let’s go to the slide! You can’t catch me!' },
        { es: 'Mi mamá dice que no me tire del columpio. Pero es bien divertido.', en: 'My mom says not to jump off the swing. But it’s really fun.' },
        { es: '¿Tú puedes hacer un salto mortal? ¡Yo sí!', en: 'Can you do a backflip? I can!' },
      ][i % 3]];
      n.update = (dt) => {
        if (nearPlayer(n)) { walkAnim(n, 0, dt); faceTo(n, Math.atan2(g.player.pos.x - n.x, g.player.pos.z - n.z), dt); return; }
        if (n.wait > 0) { n.wait -= dt; walkAnim(n, 0, dt); return; }
        const [tx, tz] = n.target;
        const dx = tx + 2.5 - n.x, dz = tz + 1 - n.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { n.target = pg[Math.floor(R() * pg.length)]; n.wait = 1 + R() * 3; return; }
        const sp = 2.6;
        n.x += dx / d * sp * dt; n.z += dz / d * sp * dt;
        n.y = phys.groundAt(n.x, n.z, n.y + 0.5).h;
        n.m.root.position.set(n.x, n.y, n.z);
        faceTo(n, Math.atan2(dx, dz), dt, 10);
        walkAnim(n, sp, dt);
      };
    }
  }

  // ---- park strollers wandering along the paths
  const [pcx, pcz] = L(95, 50);
  for (let i = 0; i < 5; i++) {
    const a = R() * 6.28;
    const n = person(NAMES[(i + 9) % NAMES.length], M.randomLook(R), pcx + Math.cos(a) * 15, pcz + Math.sin(a) * 15, 0);
    n.ang = a; n.rad = 10 + R() * 14; n.spd = (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.03);
    n.update = (dt) => {
      if (nearPlayer(n)) { walkAnim(n, 0, dt); faceTo(n, Math.atan2(g.player.pos.x - n.x, g.player.pos.z - n.z), dt); return; }
      n.ang += n.spd * dt;
      const nx = pcx + Math.cos(n.ang) * n.rad, nz = pcz + Math.sin(n.ang) * n.rad;
      const dx = nx - n.x, dz = nz - n.z;
      n.x = nx; n.z = nz;
      n.y = phys.groundAt(n.x, n.z, (n.y || H(n.x, n.z)) + 0.5).h;
      n.m.root.position.set(n.x, n.y, n.z);
      faceTo(n, Math.atan2(dx, dz), dt);
      walkAnim(n, 1.2, dt);
    };
  }

  // ---- a vendor at each kiosk (Doña Carmen runs the shop kiosk)
  for (const k of info.kiosks) {
    if (!k.front || k.shop) continue;
    const f = k.front, l = Math.hypot(f.nx, f.nz) || 1;
    const x = f.x + f.nx / l * 0.9, z = f.z + f.nz / l * 0.9;
    const n = person(NAMES[Math.floor(R() * NAMES.length)], { ...M.randomLook(R), apron: true }, x, z, Math.atan2(f.nx, f.nz));
    n.lines = [{ es: `¡Bienvenido a ${k.title}, el Kiosko #${k.num}!`, en: `Welcome to ${k.title}, Kiosko #${k.num}!` },
      FOOD_LINES[k.food] || { es: '¡Pasa y prueba, que está bueno!', en: 'Come try it, it’s good!' },
      { es: '¿Tú no eres el de las máscaras? ¡Suerte, mijo!', en: 'Aren’t you the mask hunter? Good luck, kid!' }];
    n.update = (dt, now) => { n.m.arms[1].rotation.x = -0.4 + Math.sin(now * 2 + x) * 0.3; };
  }

  // ---- musicians on the tarima
  const st = info.stage;
  if (st) {
    const inst = [[0x8a5a2a, 'cuatro'], [0xd8a050, 'güiro'], [0xc8a060, 'pandero']];
    inst.forEach(([col, what], i) => {
      const u = (i - 1) * 1.6;
      const x = st.x + u * Math.cos(st.yaw), z = st.z - u * Math.sin(st.yaw);
      const n = person(['Chago', 'Nilda', 'Toño'][i], M.randomLook(R, { hat: i === 1 ? 'pava' : 'none' }), x, z, st.yaw + Math.PI / 2, { y: st.deck });
      const obj = what === 'pandero'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 14), new THREE.MeshLambertMaterial({ color: col }))
        : new THREE.Mesh(new THREE.BoxGeometry(what === 'cuatro' ? 0.6 : 0.4, 0.12, 0.2), new THREE.MeshLambertMaterial({ color: col }));
      obj.position.set(0, 0.15, 0.3);
      if (what === 'pandero') obj.rotation.x = Math.PI / 2;
      n.m.body.add(obj);
      n.lines = [
        { es: `¡Wepa! Estamos tocando plena. Yo toco el ${what}.`, en: `Wepa! We’re playing plena. I play the ${what}.` },
        { es: 'La plena nació en Ponce, en el barrio San Antón. ¡Aquí se goza!', en: 'Plena was born in Ponce, in the San Antón neighborhood. Enjoy!' },
      ];
      n.update = (dt, now) => {
        const b = Math.sin(now * 5.6 + i);
        n.m.body.position.y = 0.52 + Math.abs(b) * 0.05;
        n.m.arms[1].rotation.x = -1.0 + b * 0.35;
        n.m.arms[0].rotation.x = -0.8;
        n.m.headPivot.rotation.z = b * 0.1;
      };
    });
  }

  g.animals.push({
    update(dt, now) {
      const cam = g.cam.cam.position;
      for (const n of crowd) {
        const vis = Math.hypot(n.x - cam.x, n.z - cam.z) < 75;
        n.m.root.visible = vis;
        if (vis || n.speed) n.update?.(dt, now);
      }
    },
  });
  return crowd;
}
