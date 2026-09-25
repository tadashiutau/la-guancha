// A small mystery about Moth, the player's affectionate and theatrical cat.
// Each clue is a real talk target with a marker; the current step lives in q.moth.
import * as THREE from 'three';
import { tr } from './i18n.js';
import * as M from './models.js';

const line = (es, en) => ({ es, en });
const label = (es, en) => ({ es, en });

export function buildMothQuest(g, places) {
  const { top, park, kiosks, tower, beach, mangrove } = places;
  const spot = p => ({ x: p.x, z: p.z, y: top(p.x, p.z) });
  const at = [park, kiosks, tower, beach, mangrove, park].map(spot);
  const stage = () => Math.min(6, Math.max(0, Number(g.q.moth) || 0));
  const fur = new THREE.MeshLambertMaterial({ color: 0x17161b });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9be1c4, transparent: true, opacity: 0.8 });
  const cardboard = new THREE.MeshLambertMaterial({ color: 0xa87b4d });
  const gold = new THREE.MeshLambertMaterial({ color: 0xecc86f, emissive: 0x3b2200 });

  function box() {
    const o = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 1.1), cardboard);
    base.position.y = 0.25; o.add(base);
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 1.08), cardboard);
      flap.position.set(s * 0.7, 0.54, 0); flap.rotation.z = s * 0.3; o.add(flap);
    }
    return o;
  }

  function paw() {
    const o = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), glow);
    pad.scale.set(1, 0.13, 0.75); pad.position.set(0, 0.07, 0.08); o.add(pad);
    for (const [x, z] of [[-0.22, -0.18], [-0.07, -0.32], [0.1, -0.32], [0.25, -0.18]]) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow);
      toe.scale.y = 0.22; toe.position.set(x, 0.07, z); o.add(toe);
    }
    return o;
  }

  function bell() {
    const o = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.34, 0.46, 10, 1, true), gold);
    body.position.y = 0.47; o.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 12), gold);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.24; o.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10), gold);
    handle.position.y = 0.75; o.add(handle);
    return o;
  }

  function crownBox() {
    const o = box();
    o.scale.setScalar(0.85);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.3, 6), gold);
    crown.position.set(0, 0.66, 0); o.add(crown);
    return o;
  }

  function eyes() {
    const o = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), fur);
    shadow.scale.set(1.2, 0.8, 0.35); shadow.position.y = 0.46; o.add(shadow);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), glow);
      eye.position.set(s * 0.17, 0.55, 0.3); o.add(eye);
    }
    return o;
  }

  function target(name, pos, model, talk, when) {
    model.position.set(pos.x, pos.y, pos.z);
    g.root.add(model);
    const n = { name, x: pos.x, y: pos.y, z: pos.z, m: { root: model }, talk,
      custom: true, hidden: false, quest: () => when(stage()) ? stage() === 0 ? 'available' : 'active' : null };
    g.npcs.push(n);
    return n;
  }

  const startBox = box();
  startBox.position.set(at[0].x, at[0].y, at[0].z);
  g.root.add(startBox);
  const moth = M.mothMesh();
  moth.position.y = 0.52;
  const mothRoot = new THREE.Group(); mothRoot.add(moth);

  const faces = [
    label('Habla con Moth en el parque', 'Talk to Moth in the park'),
    label('Huellas junto a los kioskos', 'Pawprints by the kiosks'),
    label('Campana al pie de la torre', 'Bell below the tower'),
    label('Caja en la playa', 'Box on the beach'),
    label('Ojos junto a los mangles', 'Eyes by the mangroves'),
    label('Regresa a la caja de Moth', "Return to Moth's box"),
  ];

  const next = (n, sound = 'appear') => {
    g.q.moth = n; g.save(); sync(); g.sfx.play(sound);
    const p = at[Math.min(n, 5)];
    g.fx.emit(p.x, p.y + 0.6, p.z, 24, { color: 0xa8eab7, speed: 2, up: 2, life: 1, grav: 0 });
    if (n < 6) g.ui.toast(tr(faces[n]), 3.5);
  };

  const mothNpc = target('Moth', at[0], mothRoot, async () => {
    if (stage() === 0) {
      await g.ui.say('Moth', [
        line(`Mrrp. Llegaste, ${g.playerName}. La caja estaba hablando de ti.`, `Mrrp. You made it, ${g.playerName}. The box was talking about you.`),
        line('¿Oíste tres golpes dentro? Yo solo di dos. Curioso.', 'Did you hear three knocks inside? I only made two. Curious.'),
        line('Si mi sombra se va sin mí, sigue las huellas que brillan. Y no confíes en las cajas vacías.', 'If my shadow leaves without me, follow the glowing prints. And do not trust empty boxes.'),
        line('...Miau. Eso sonó más dramático de lo que quería.', '...Meow. That sounded more dramatic than I meant.'),
      ]);
      next(1, 'meow');
    } else if (stage() === 5) {
      await g.ui.say('Moth', [
        line('¡BÚ! ... ¿Funcionó? Practiqué ese susto siete siestas.', 'BOO! ... Did it work? I practiced that scare for seven naps.'),
        line('La sombra era mía. Las huellas también. La campana se cayó de mi collar cuando trepé la torre.', 'The shadow was mine. So were the prints. The bell fell from my collar when I climbed the tower.'),
        line('La corona de la playa era para ti. La hice con una caja que encontré. Es un tesoro, obviamente.', 'The beach crown was for you. I made it from a box I found. Obviously, it is treasure.'),
        line(`Te hice buscar por toda La Guancha porque quería enseñarte mi mundo, ${g.playerName}.`, `I sent you all over La Guancha because I wanted to show you my world, ${g.playerName}.`),
        line('Si alguna vez da miedo la oscuridad, busca mis ojos verdes. Siempre voy a estar cerca.', 'If the dark ever feels frightening, look for my green eyes. I will always be close.'),
        line(`Te quiero mucho, ${g.playerName}. Ahora... ¿podemos quedarnos juntos en esta caja?`, `I love you very much, ${g.playerName}. Now... can we sit together in this box?`),
      ]);
      next(6, 'meow');
      const P = g.player.pos;
      g.reveal('moth', P.x, P.y + 1.8, P.z);
      g.ui.banner(tr(label('El misterio de Moth', "Moth's mystery")), tr(label('Moth te quiere mucho ♥', 'Moth loves you ♥')), 4);
    } else {
      await g.ui.say('Moth', [line(`Prrr, ${g.playerName}. Mi lugar favorito es contigo.`, `Prrr, ${g.playerName}. My favorite place is with you.`)]);
    }
  }, s => s === 0 || s === 5);

  const clues = [
    target(label('Huellas', 'Pawprints'), at[1], paw(), async () => {
      await g.ui.say(label('Huellas', 'Pawprints'), [
        line('Cuatro huellas verdes cruzan el tablado. La quinta está en la pared, más alta que tu cabeza.', 'Four green prints cross the boardwalk. The fifth is on the wall, higher than your head.'),
        line('Un papel pegado debajo dice: «La torre sabe cuántas vidas tiene una sombra».', 'A note underneath reads: “The tower knows how many lives a shadow has.”'),
        line('Detrás de ti suena un cascabel. Cuando te viras, no hay nadie.', 'A bell jingles behind you. When you turn, nobody is there.'),
      ]);
      next(2, 'ring');
    }, s => s === 1),
    target(label('Cascabel', 'Bell'), at[2], bell(), async () => {
      await g.ui.say(label('Cascabel', 'Bell'), [
        line('El cascabel vibra aunque no sopla viento. Hay un pelo negro en el nudo.', 'The bell trembles without any wind. A black hair is caught in its knot.'),
        line('Al levantarlo, una sombra redonda pasa sobre los escalones de la torre... en dirección a la playa.', 'When you lift it, a round shadow slips over the tower steps... toward the beach.'),
        line('Dentro del cascabel hay otra nota: «Ningún monstruo cabe en una caja. Creo».', 'Inside the bell is another note: “No monster fits in a box. I think.”'),
      ]);
      next(3, 'meow');
    }, s => s === 2),
    target(label('Caja misteriosa', 'Mysterious box'), at[3], crownBox(), async () => {
      await g.ui.say(label('Caja misteriosa', 'Mysterious box'), [
        line('La caja se mueve sola. Algo suave roza tu mano por dentro. No hay nadie cuando miras.', 'The box moves by itself. Something soft brushes your hand inside. When you look, nobody is there.'),
        line('Solo hay una coronita torcida de cartón y una nota húmeda: «Para mi humano favorito».', 'There is only a crooked little cardboard crown and a damp note: “For my favorite human.”'),
        line('Unos ojos verdes parpadean junto a los mangles. La coronita parece apuntar hacia ellos.', 'Green eyes blink by the mangroves. The little crown seems to point their way.'),
      ]);
      next(4, 'concha');
    }, s => s === 3),
    target(label('Ojos en la sombra', 'Eyes in the shadow'), at[4], eyes(), async () => {
      await g.ui.say(label('Ojos en la sombra', 'Eyes in the shadow'), [
        line('Los ojos esperan entre los mangles. La sombra es grande, redonda... y tiene orejas puntiagudas.', 'The eyes wait among the mangroves. The shadow is big, round... and has pointed ears.'),
        line('Se oye un bufido terrible. Después, un ronroneo muy poco terrible.', 'You hear a terrible hiss. Then a very un-terrible purr.'),
        line(`Una voz pequeñita susurra: «${g.playerName}, vuelve a mi caja del parque. Trae la coronita».`, `A tiny voice whispers: “${g.playerName}, come back to my box in the park. Bring the little crown.”`),
      ]);
      next(5, 'meow');
    }, s => s === 4),
  ];

  g.mask('moth', label('El regalo de Moth', "Moth's gift"), at[5].x, at[5].y + 1.8, at[5].z, true);

  function sync() {
    const s = stage();
    mothNpc.hidden = !(s === 0 || s >= 5);
    mothRoot.visible = !mothNpc.hidden;
    for (let i = 0; i < clues.length; i++) {
      clues[i].hidden = s !== i + 1;
      clues[i].m.root.visible = !clues[i].hidden;
    }
    startBox.visible = true;
  }

  g.challenge({
    onLoad: sync,
    objective() {
      const s = stage();
      return s < 6 ? { ...at[s], label: faces[s] } : null;
    },
    animate(dt, now) {
      moth.userData.tail.rotation.z = Math.sin(now * 3) * 0.25;
      moth.position.y = 0.52 + Math.sin(now * 2) * 0.025;
      const s = stage();
      if (s >= 1 && s <= 4 && Math.random() < dt * 3) {
        const p = at[s];
        g.fx.emit(p.x + (Math.random() - 0.5), p.y + 0.4, p.z + (Math.random() - 0.5), 1,
          { color: 0xb9eeb0, speed: 0.2, up: 0.7, life: 0.7, grav: 0 });
      }
    },
  });
  sync();
}
