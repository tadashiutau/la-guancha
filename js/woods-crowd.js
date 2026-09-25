// The little woods behind the beach are, in real life, a well-known cruising spot (the Bird Club
// quest in aves-quest.js is the other half of the joke). A few men drift in from the road and back
// out again, a few more "just hang out" among the trees, and every one of them is extremely casual
// about it: long looks, slow nods, a phone that keeps buzzing, keys that were lost hours ago.
// All men, some shirtless. Walk up and they check both ways before they answer.
import * as THREE from 'three';

const line = (es, en) => ({ es, en });
const SKINS = [0x5a3a26, 0x7a4a30, 0x8d5a3b, 0x9c6a48, 0xb07a55, 0xc08a60, 0xe8bf98];
const HANKY = [0x2f6fd0, 0xe3342f, 0x2e9e5b, 0xf7c948, 0x8a5ac8, 0x9fd3e8];

// everyone's lines; {name} is filled in when they talk
const TYPES = {
  phone: {
    pose: 'phone', emote: '📱', sfx: 'buzz', lines: [
      [line('*Bzzz* ...Perdona. El teléfono dice que hay alguien a 12 metros. ...Ah. Eres tú.', "*Bzzz* ...Sorry. My phone says someone's 40 feet away. ...Oh. It's you."),
        line('¿Tú eres el de la foto sin cara? ...¿No? Bueno. Igual.', 'Are you the faceless profile pic? ...No? Well. Anyway.')],
      [line('*Bzzz* ...Otro mensaje que dice "¿qué buscas?". Qué pregunta.', '*Bzzz* ...Another message saying "looking for?". What a question.')],
    ] },
  keys: {
    pose: 'shoe', emote: '👀', lines: [
      [line('Estoy buscando mis llaves. Desde las tres de la tarde.', 'I’m looking for my keys. Since three in the afternoon.'),
        line('Si las encuentras, no me avises. O sea, sí. O sea... tú sabes.', "If you find them, don't tell me. I mean, do. I mean... you know.")],
      [line('Me estoy amarrando el tenis. Es la décima vez. Es un nudo difícil.', "I'm tying my shoe. Tenth time. It's a tricky knot.")],
    ] },
  discreto: {
    pose: 'lean', emote: '😏', sfx: 'whistle', lines: [
      [line('Soy discreto. Bien discreto. Ni me mires.', "I'm discreet. Very discreet. Don't even look at me."),
        line('*te mira fijo*', '*stares at you*')],
      [line('¿Te gusta mi pañuelo? El color quiere decir algo. No te voy a decir qué.', 'Like my bandana? The color means something. Not telling you what.')],
    ] },
  esposa: {
    pose: 'pace', emote: '🤫', lines: [
      [line('Mi esposa cree que estoy en el gimnasio. Técnicamente estoy haciendo ejercicio.', "My wife thinks I'm at the gym. Technically, I'm working out."),
        line('Si ves al Agente Colón, silba dos veces.', 'If you see Officer Colón, whistle twice.')],
      [line('Yo vine por la brisa. La brisa de aquí es... distinta.', 'I came for the breeze. The breeze here is... different.')],
    ] },
  trote: {
    pose: 'stretch', emote: '😅', lines: [
      [line('Vine a trotar. ...Trote suave. Bien suave. Casi parado.', 'I came out for a jog. ...A slow jog. Very slow. Basically standing.'),
        line('Estoy calentando. Llevo una hora calentando.', "I'm warming up. I've been warming up for an hour.")],
    ] },
  naturalista: {
    pose: 'newspaper', emote: '👀', lines: [
      [line('Yo leo el periódico aquí. Por la sombra. ...Sí, está al revés.', 'I read the paper here. For the shade. ...Yes, it’s upside down.'),
        line('Aquí se viene por la naturaleza. Hay unos troncos... impresionantes.', 'People come here for the nature. Some really... impressive trunks.')],
      [line('Wilfredo dice que vengo a ver aves. Yo nunca he visto un ave aquí.', 'Wilfredo says I come to watch birds. I have never seen a bird here.')],
    ] },
  toalla: {
    pose: 'nod', emote: '😉', lines: [
      [line('Vengo de la playa. Bueno, voy pa’ la playa. Bueno, estoy aquí.', "I'm coming from the beach. Well, going to the beach. Well, I'm here.")],
      [line('*te hace un gestito con la cabeza*', '*gives you a little nod*'), line('...', '...'), line('*otro gestito, más lento*', '*another nod, slower*')],
    ] },
  arbol: {
    pose: 'lean', emote: '😏', lines: [
      [line('Este árbol es mío desde las cuatro. Hay otros árboles. Pero este es mío.', 'This tree has been mine since four. There are other trees. This one is mine.')],
      [line('¿Tienes hora? ...No, en serio, ¿tienes hora? Me están esperando. O yo estoy esperando. No sé.', "Got the time? ...No, really, do you? Someone's waiting for me. Or I'm waiting. Not sure.")],
    ] },
  // the ones walking in and out
  salgo: {
    walk: true, emote: '😳', lines: [
      [line('¡Ay, qué susto! Salía de... hacer cardio.', 'Oh, you scared me! I was just... doing cardio.'),
        line('¿Tengo hojas en el pelo? ...No contestes.', 'Do I have leaves in my hair? ...Don’t answer.')],
      [line('Nada que ver aquí. Sigue, sigue. Yo también sigo.', 'Nothing to see here. Keep walking. So am I.')],
    ] },
  entro: {
    walk: true, emote: '😏', lines: [
      [line('Voy a dar una vueltita por el sendero. Solo. ...A menos que...', 'Just taking a little walk down the trail. Alone. ...Unless...')],
      [line('¿Has visto un perro? Grande, bien... grande. Yo no tengo perro, pero por si acaso.', "Seen a dog? Big, really... big. I don't have a dog, but just in case.")],
    ] },
};
// what everyone says once the Club's Pride flag is up (aves quest done)
const AFTER_FLAG = [
  line('Desde que Wilfredo subió la bandera, esto está más animado.', 'Since Wilfredo raised the flag, it’s gotten livelier around here.'),
  line('¿Viste la bandera del Club? Ahora hasta tenemos directorio.', 'Seen the Club flag? We even have a directory now.'),
];

function emoteTexture(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fffdf6'; x.strokeStyle = '#2d3b35'; x.lineWidth = 6;
  x.beginPath(); x.arc(64, 58, 48, 0, Math.PI * 2); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(52, 100); x.lineTo(64, 124); x.lineTo(76, 100); x.fill();
  x.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 64, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function propMesh(kind) {
  const g = new THREE.Group();
  const m = (geo, col, x, y, z) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col })); o.position.set(x, y, z); g.add(o); return o; };
  if (kind === 'phone') {
    m(new THREE.BoxGeometry(0.07, 0.13, 0.015), 0x1a1a1a, 0, 0, 0);
    const s = m(new THREE.PlaneGeometry(0.058, 0.11), 0x9fe3ff, 0, 0, 0.009);
    s.material = new THREE.MeshBasicMaterial({ color: 0x9fe3ff });
  } else if (kind === 'newspaper') {
    const p = m(new THREE.PlaneGeometry(0.46, 0.32), 0xf2efe6, 0, 0, 0);
    p.material.side = THREE.DoubleSide;
    for (let i = 0; i < 5; i++) m(new THREE.PlaneGeometry(0.18, 0.02), 0x555555, i < 2 ? -0.1 : 0.1, 0.1 - (i % 3) * 0.07, 0.002);
    m(new THREE.PlaneGeometry(0.4, 0.05), 0x222222, 0, 0.12, -0.002).rotation.y = Math.PI;
  }
  return g;
}

export function buildWoodsCrowd(g, { top, H, dist2, center, aves, roads }) {
  const { phys, data } = g;
  const R = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const pick = a => a[Math.floor(R() * a.length)];
  const [cx, cz] = center;
  const busy = [aves?.club, ...(aves?.bushes || [])].filter(Boolean);
  const free = (x, z, r = 0.9) => H(x, z) > 0.3 && busy.every(q => dist2(q.x, q.z, x, z) > 7)
    && !phys.near(x, z, r + 0.5).some(c => c.solid && c.maxx > x - r && c.minx < x + r && c.maxz > z - r && c.minz < z + r); // crowns are walk-through
  const clearLine = (a, b) => {
    const n = Math.ceil(dist2(a.x, a.z, b.x, b.z) / 0.8);
    for (let i = 1; i < n; i++) if (!free(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, 0.45)) return false;
    return true;
  };
  // wooded, walkable spots
  const spots = [];
  for (let z = cz - 60; z < cz + 60; z += 2.5) for (let x = cx - 60; x < cx + 60; x += 2.5) {
    if (dist2(x, z, cx, cz) < 58 && data.canopyH(x, z) > 3 && free(x, z)) spots.push({ x, z });
  }
  if (spots.length < 12) return;
  const taken = [];
  const takeSpot = (ok = () => true) => {
    const s = spots.filter(p => taken.every(q => dist2(q.x, q.z, p.x, p.z) > 9) && ok(p));
    const p = s.length ? s[Math.floor(R() * s.length)] : null;
    if (p) taken.push(p);
    return p;
  };

  const emotes = new Map();
  const emote = (n, ch) => {
    if (!emotes.has(ch)) emotes.set(ch, emoteTexture(ch));
    if (!n.bubble) {
      n.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      n.bubble.renderOrder = 10;
      n.bubble.scale.setScalar(0.8);
      g.root.add(n.bubble);
    }
    n.bubble.material.map = emotes.get(ch); n.bubble.material.needsUpdate = true;
    n.bubble.visible = true; n.bubbleT = 2.4;
  };

  const lookFor = (i, t) => {
    const shirtless = t.pose !== 'newspaper' && (i % 2 === 0 || t.pose === 'stretch' || t.pose === 'nod');
    return {
      skin: pick(SKINS), hair: pick([0x111111, 0x1f1a16, 0x3a2a1a, 0x6a3a1a]), eyes: pick([0x2a1a10, 0x4a2e1c, 0x5a7a3a]),
      style: pick(['rapado', 'rapado', 'corto', 'copete', 'calvo', 'rizos']),
      face: pick(['barbita', 'barbita', 'bigote', 'chiva', 'candado', 'barba']),
      build: pick(['fornido', 'fornido', 'normal', 'normal', 'gordito', 'flaco']),
      top: shirtless ? 'sincamisa' : pick(['esqueleto', 'esqueleto', 'camiseta', 'polo']),
      shirt: pick([0x222222, 0xffffff, 0xe3342f, 0x2f6fd0, 0x8a5ac8, 0xf7c948]),
      bottom: pick([0x2a3a5a, 0x1d1d1d, 0x4a6fa5, 0x6a6a6a, 0xe3342f]),
      legs: t.pose === 'stretch' ? 'largos' : 'cortos', // jogging in jeans
      shoes: pick(['tenis', 'tenis', 'chancletas']),
      glasses: R() < 0.35 ? 'sol' : 'nada',
      hat: R() < 0.4 ? 'capback' : 'none', hatColor: pick([0x1d1d1d, 0xffffff, 0x2f6fd0, 0xe3342f]),
      hairy: shirtless && R() < 0.5, hanky: R() < 0.55 ? pick(HANKY) : null,
      towel: t.pose === 'nod' ? 0xf4f2ec : null,
      extra: pick(['nada', 'cadena', 'cadena', 'reloj', 'arete']),
    };
  };
  const NAMES = ['Kevin', 'Ricky', 'Jonathan', 'Wiso', 'Edwin', 'Yeriel', 'Tony', 'Luisito', 'Omar', 'Christian', 'Ángel'];
  const crowd = [];
  const makeGuy = (type, i, x, z, face) => {
    const t = TYPES[type];
    const n = g.npc(lookFor(i, t), NAMES[i % NAMES.length], x, z, face, null, { custom: true });
    Object.assign(n, { type, t, base: face, act: null, actT: 0, said: 0, look: 0 });
    n.talk = () => talk(n);
    if (t.pose === 'phone' || t.pose === 'newspaper') {
      n.prop = propMesh(t.pose);
      if (t.pose === 'phone') { n.prop.position.set(0, -0.4, 0.06); n.m.arms[1].add(n.prop); }
      else { n.prop.position.set(0, 0.62, 0.42); n.m.body.add(n.prop); }
    }
    crowd.push(n);
    return n;
  };

  // ---------------------------------------------------------------- the ones hanging out in the woods
  const trunks = phys.cols.filter(c => c.tag === 'trunk' && dist2((c.minx + c.maxx) / 2, (c.minz + c.maxz) / 2, cx, cz) < 55);
  const stayers = ['phone', 'keys', 'discreto', 'esposa', 'trote', 'naturalista', 'toalla', 'arbol'];
  stayers.forEach((type, i) => {
    const t = TYPES[type];
    let p = null, face = R() * Math.PI * 2;
    if (t.pose === 'lean') { // back against a tree trunk
      for (const c of trunks.sort(() => R() - 0.5)) {
        const tx = (c.minx + c.maxx) / 2, tz = (c.minz + c.maxz) / 2, tr0 = (c.maxx - c.minx) / 2;
        const a = R() * Math.PI * 2;
        const q = { x: tx + Math.cos(a) * (tr0 + 0.38), z: tz + Math.sin(a) * (tr0 + 0.38) };
        if (H(q.x, q.z) > 0.3 && busy.every(b => dist2(b.x, b.z, q.x, q.z) > 7) && taken.every(o => dist2(o.x, o.z, q.x, q.z) > 9)) {
          p = q; face = Math.atan2(q.x - tx, q.z - tz); taken.push(q); break;
        }
      }
    }
    p ||= takeSpot();
    if (!p) return;
    const n = makeGuy(type, i, p.x, p.z, face);
    n.home = { x: p.x, z: p.z };
  });

  // ---------------------------------------------------------------- the ones walking in and out
  // road points near the woods, each paired with a spot inside that has a clear walk in
  const edge = [];
  for (const r of roads) for (let i = 1; i < r.length; i++) {
    const [ax, az] = r[i - 1], [bx, bz] = r[i], n = Math.ceil(dist2(ax, az, bx, bz) / 3);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, d = dist2(x, z, cx, cz);
      if (d > 30 && d < 75) edge.push({ x, z });
    }
  }
  const walkers = ['salgo', 'entro', 'salgo', 'entro'];
  walkers.forEach((type, i) => {
    for (let tries = 0; tries < 40; tries++) {
      const road = pick(edge.length ? edge : [{ x: cx - 60, z: cz }]);
      // step from the road toward the woods until it's walkable ground
      const dx = cx - road.x, dz = cz - road.z, dl = Math.hypot(dx, dz);
      let start = null;
      for (let s = 3; s < 30 && !start; s += 1.5) { const q = { x: road.x + dx / dl * s, z: road.z + dz / dl * s }; if (free(q.x, q.z, 0.6)) start = q; }
      if (!start) continue;
      const deep = takeSpot(p => dist2(p.x, p.z, start.x, start.z) > 14 && dist2(p.x, p.z, start.x, start.z) < 40 && clearLine(start, p));
      if (!deep) continue;
      const n = makeGuy(type, stayers.length + i, start.x, start.z, 0);
      n.route = { a: start, b: deep };
      n.state = type === 'salgo' ? 'bush' : 'in'; n.stateT = R() * 6;
      if (n.state === 'bush') { place(n, deep.x, deep.z); n.m.root.visible = false; n.hidden = true; }
      // his bush, where he disappears for a while
      const bush = new THREE.Group();
      const leaf = [0x3d7f37, 0x4f9140, 0x2f7436];
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ color: leaf[k % 3], flatShading: true }));
        const a = k / 4 * Math.PI * 2 + i;
        m.position.set(Math.cos(a) * 0.55 * (k ? 1 : 0), 0.62 + (k ? 0 : 0.4), Math.sin(a) * 0.55 * (k ? 1 : 0));
        m.scale.set(1.25, 0.95, 1.25); m.castShadow = true;
        bush.add(m);
      }
      const bx = deep.x + 1.6, bz = deep.z + 0.8;
      bush.position.set(bx, top(bx, bz), bz);
      g.root.add(bush);
      n.bush = bush;
      break;
    }
  });
  if (!crowd.length) return;

  function place(n, x, z) {
    n.x = x; n.z = z;
    n.y = phys.groundAt(x, z, H(x, z) + 0.6).h;
    n.m.root.position.set(x, n.y, z);
  }

  // ---------------------------------------------------------------- talking
  async function talk(n) {
    // check both ways before saying anything
    n.act = 'check'; n.actT = 0;
    emote(n, n.t.emote);
    g.sfx.play(n.t.sfx || 'talk');
    await new Promise(r => setTimeout(r, 900));
    const set = n.t.lines[n.said % n.t.lines.length];
    n.said++;
    const lines = [...set];
    if ((g.q.aves || 0) >= 3 && n.said % 2 === 0) lines.push(pick(AFTER_FLAG));
    n.act = n.t.pose === 'nod' || n.type === 'discreto' ? 'nod' : 'tug';
    n.actT = 0;
    await g.ui.say(n.name, lines);
    n.act = null;
    // the walkers hurry off once you've caught them
    if (n.route) { n.state = n.type === 'salgo' ? 'out' : 'in'; n.hurry = 6; }
  }

  // ---------------------------------------------------------------- every frame
  const P = g.player.pos;
  const walk = (n, sp, dt) => {
    n.phase += dt * (3 + sp * 3);
    const s = Math.sin(n.phase), k = Math.min(1, sp / 2);
    n.m.legs[0].rotation.x = s * 0.8 * k; n.m.legs[1].rotation.x = -s * 0.8 * k;
    n.m.arms[0].rotation.x = -s * 0.5 * k; n.m.arms[1].rotation.x = s * 0.5 * k;
    n.m.body.position.y = 0.52 + Math.abs(Math.cos(n.phase)) * 0.04 * k;
  };
  const turnTo = (n, a, dt, rate = 5) => {
    let d = a - n.m.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    n.m.root.rotation.y += d * Math.min(1, dt * rate);
  };
  const rest = n => {
    const m = n.m;
    m.body.position.y = 0.52; m.body.rotation.set(0, 0, 0); m.headPivot.rotation.set(0, 0, 0);
    m.arms.forEach(a => a.rotation.set(0, 0, 0)); m.legs.forEach(l => l.rotation.set(0, 0, 0));
    m.arms[0].rotation.z = 0.12; m.arms[1].rotation.z = -0.12;
  };

  g.animals.push({
    update(dt, now) {
      for (const n of crowd) {
        if (n.bubble) {
          n.bubbleT -= dt;
          n.bubble.visible = n.bubbleT > 0 && !n.hidden;
          n.bubble.position.set(n.x, n.y + 2.05 + Math.sin(now * 4) * 0.03, n.z);
        }
        if (n.hidden && n.state !== 'bush') continue;
        const m = n.m;
        const dp = dist2(P.x, P.z, n.x, n.z);
        const talking = g.talking && dp < 4;
        const toPlayer = Math.atan2(P.x - n.x, P.z - n.z);

        // ---- walkers: road → deep in the woods → behind the bush → back out → road
        if (n.route && !talking && !n.act) {
          const { a, b } = n.route;
          n.stateT -= dt;
          const go = (to, sp) => {
            const dx = to.x - n.x, dz = to.z - n.z, d = Math.hypot(dx, dz);
            if (d < 0.3) return true;
            const st = Math.min(d, sp * dt);
            place(n, n.x + dx / d * st, n.z + dz / d * st);
            turnTo(n, Math.atan2(dx, dz), dt);
            walk(n, sp, dt);
            return false;
          };
          const sp = n.hurry > 0 ? 2.6 : 1.05;
          if (n.hurry > 0) n.hurry -= dt;
          rest(n);
          if (n.state === 'in') {
            if (go(b, sp)) { n.state = 'linger'; n.stateT = 4 + R() * 4; }
            else if (Math.sin(now * 0.7 + n.x) > 0.93) m.headPivot.rotation.y = Math.sin(now * 3) * 1.1; // over the shoulder
          } else if (n.state === 'linger') {
            m.headPivot.rotation.y = Math.sin(now * 0.9 + n.z) * 0.9;
            if (n.stateT < 0) { n.state = 'bush'; n.stateT = 7 + R() * 8; m.root.visible = false; n.hidden = true; g.sfx.play('rustle'); }
          } else if (n.state === 'bush') {
            // the bush does all the talking
            if (n.bush) n.bush.rotation.z = Math.sin(now * 14) * 0.05 * (Math.sin(now * 0.8 + n.x) > 0 ? 1 : 0.2);
            if (n.stateT < 0) {
              n.state = 'tug'; n.stateT = 1.6; m.root.visible = true; n.hidden = false; if (n.bush) n.bush.rotation.z = 0;
              place(n, n.bush ? n.bush.position.x - 1.1 : b.x, n.bush ? n.bush.position.z : b.z);
              if (dp < 25) g.sfx.play('rustle');
            }
          } else if (n.state === 'tug') { // straighten up after the bush
            m.arms[0].rotation.set(-0.4, 0, 0.55); m.arms[1].rotation.set(-0.4, 0, -0.55);
            m.body.position.y = 0.52 + Math.abs(Math.sin(now * 10)) * 0.02;
            m.headPivot.rotation.y = Math.sin(now * 5) * 0.8;
            if (n.stateT < 0) n.state = 'out';
          } else if (n.state === 'out') {
            if (go(a, sp)) { n.state = 'road'; n.stateT = 5 + R() * 10; }
            else if (Math.sin(now * 0.6 + n.z) > 0.9) m.headPivot.rotation.y = Math.sin(now * 3) * 1.2;
          } else if (n.state === 'road') { // at the road: check the phone, then go back in
            m.arms[1].rotation.set(-1.2, 0, -0.3); m.headPivot.rotation.x = 0.3;
            if (n.stateT < 0) { m.headPivot.rotation.x = 0; n.state = 'in'; }
          }
          continue;
        }

        // ---- reactions when you talk to them
        rest(n);
        if (n.act) {
          n.actT += dt;
          turnTo(n, toPlayer, dt, 8);
          if (n.act === 'check') { // left, right, then you
            const k = n.actT;
            m.headPivot.rotation.y = k < 0.3 ? -1 * (k / 0.3) : k < 0.7 ? -1 + (k - 0.3) / 0.4 * 2 : 1 - Math.min(1, (k - 0.7) / 0.2);
            m.body.position.y = 0.52 + (k < 0.15 ? k / 0.15 * 0.06 : 0);
          } else if (n.act === 'nod') {
            m.headPivot.rotation.x = Math.max(0, Math.sin(n.actT * 3)) * 0.35;
            m.arms[0].rotation.set(0.2, 0, 0.25); m.arms[1].rotation.set(0.2, 0, -0.25);
          } else if (n.act === 'tug') { // hands to the waistband, a little tug
            m.arms[0].rotation.set(-0.35, 0, 0.5); m.arms[1].rotation.set(-0.35, 0, -0.5);
            m.body.position.y = 0.52 + Math.max(0, Math.sin(n.actT * 7)) * 0.025;
            m.headPivot.rotation.y = Math.sin(n.actT * 1.3) * 0.3;
          }
          continue;
        }
        if (talking) { turnTo(n, toPlayer, dt, 6); continue; }

        // ---- idle poses; everyone keeps an eye on you when you're close
        const watch = dp < 10 ? Math.max(-1.2, Math.min(1.2, Math.atan2(Math.sin(toPlayer - m.root.rotation.y), Math.cos(toPlayer - m.root.rotation.y)))) : 0;
        n.look += (watch - n.look) * Math.min(1, dt * 3);
        const pose = n.t.pose;
        if (pose === 'lean') {
          turnTo(n, n.base, dt, 2);
          m.body.rotation.x = -0.12;
          m.legs[1].rotation.x = 0.55; // a foot up against the trunk
          m.arms[0].rotation.set(-0.95, 0, 0.75); m.arms[1].rotation.set(-0.95, 0, -0.75); // arms crossed
          m.headPivot.rotation.y = n.look;
          if (dp < 7) m.headPivot.rotation.x = Math.max(0, Math.sin(now * 1.3)) * 0.18; // the slow nod
        } else if (pose === 'shoe') { // tying a shoe forever; stands up now and then to look around
          const up = Math.sin(now * 0.35 + n.x) > 0.55;
          turnTo(n, dp < 10 ? toPlayer : n.base, dt, 1.5);
          if (up) m.headPivot.rotation.y = Math.sin(now * 1.7) * 0.9;
          else {
            m.body.position.y = 0.28; m.body.rotation.x = 0.75;
            m.legs[0].rotation.x = -1.3; m.legs[1].rotation.x = 0.5;
            m.arms[0].rotation.x = m.arms[1].rotation.x = -0.9 + Math.sin(now * 6) * 0.15;
            m.headPivot.rotation.x = -0.5; m.headPivot.rotation.y = n.look * 0.6;
          }
        } else if (pose === 'phone') {
          turnTo(n, n.base, dt, 2);
          m.arms[1].rotation.set(-1.3, 0, -0.35);
          const glance = dp < 10 && Math.sin(now * 0.8 + n.z) > 0.2;
          m.headPivot.rotation.x = glance ? 0 : 0.4;
          m.headPivot.rotation.y = glance ? n.look : -0.2;
          if (dp < 12 && Math.floor(now / 7 + n.x) !== n.buzzK) { n.buzzK = Math.floor(now / 7 + n.x); if (dp < 8) g.sfx.play('buzz'); }
        } else if (pose === 'pace') { // back and forth, back and forth
          const k = Math.sin(now * 0.45 + n.x);
          const ox = Math.cos(n.base) * 2.5 * k, oz = -Math.sin(n.base) * 2.5 * k;
          const px0 = n.x;
          place(n, n.home.x + ox, n.home.z + oz);
          turnTo(n, Math.cos(now * 0.45 + n.x) > 0 ? n.base + Math.PI / 2 : n.base - Math.PI / 2, dt, 4);
          if (Math.abs(n.x - px0) > 1e-4) walk(n, 1, dt);
          m.headPivot.rotation.y = n.look * 0.8;
        } else if (pose === 'stretch') { // "warming up"
          turnTo(n, dp < 10 ? toPlayer : n.base, dt, 1.5);
          const k = Math.sin(now * 1.1 + n.x);
          m.arms[0].rotation.set(0, 0, 2.6 + k * 0.3); m.arms[1].rotation.set(0, 0, -2.6 + k * 0.3);
          m.body.rotation.z = k * 0.25;
        } else if (pose === 'newspaper') { // hides behind the paper, peeks over it when you're close
          turnTo(n, n.base, dt, 2);
          const peek = dp < 9 ? 1 : 0;
          n.peek = (n.peek || 0) + (peek - (n.peek || 0)) * Math.min(1, dt * 2);
          m.arms[0].rotation.set(-1.45, 0, 0.35); m.arms[1].rotation.set(-1.45, 0, -0.35);
          n.prop.position.y = 0.62 - n.peek * 0.12;
          m.headPivot.rotation.y = n.look * n.peek;
        } else if (pose === 'nod') { // towel on the shoulder, hands in the pockets, nodding at you
          turnTo(n, dp < 10 ? toPlayer : n.base, dt, 1.5);
          m.arms[0].rotation.set(0.25, 0, 0.18); m.arms[1].rotation.set(0.25, 0, -0.18);
          if (dp < 8) m.headPivot.rotation.x = Math.max(0, Math.sin(now * 1.6)) * 0.3;
          m.headPivot.rotation.y = n.look * 0.5;
        }
      }
    },
  });
}
