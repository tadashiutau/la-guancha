// Moth: a black cat who is greedy for pets (she wants THIRTY MINUTES of them) and who would
// trade her own newborn for a Churu. Her quest:
//   0 talk to her in her box at the park
//   1 pet her (tap 💬 over and over); the petting clock says 30:00 is owed... she offers a deal
//   2 grab a Churu at Doña Carmen's kiosk (a pelican swoops in and steals it)
//   3 knock it loose with the pava while the pelican loops over the boardwalk
//   4 it falls in the water: dive for it
//   5 Moth smells it from across La Guancha and sprints over to tackle you
//   6 squeeze the Churu for her (tap 💬)
//   7 done: she flies to the Moon and back with a gift. Afterwards she still pesters for pets.
// Progress lives in q.moth2 (q.moth was an earlier version of this quest).
import * as THREE from 'three';
import { tr } from './i18n.js';
import * as M from './models.js';
import { mothToTheMoon } from './cutscene.js';

const line = (es, en) => ({ es, en });
const pick = a => a[Math.floor(Math.random() * a.length)];

const PET_SECS = 9;          // "seconds of pets" each tap is worth on her clock
const PETS_FOR_DEAL = 12;    // taps before she gives up on the 30 minutes and asks for a Churu
const FEED_STEP = 0.085;     // each tap squeezes this much Churu
const RUN = 15;              // Moth's sprint speed (faster than you)

const PESTER = [
  line('¿A dónde tú vas? Todavía me debes cariños.', 'Where do you think you are going? You still owe me pets.'),
  line('Miau. MIAU. MIAAAU.', 'Meow. MEOW. MEOOOW.'),
  line('Te estoy mirando. Fijo. Sin parpadear.', 'I am staring at you. Unblinking.'),
  line('Esa mano no se va a acariciar sola.', "That hand isn't going to pet me by itself."),
  line('Me voy a acostar encima de tus pies hasta que me acaricies.', "I'll lie on your feet until you pet me."),
];
const MORE = [
  line('¿Por qué paraste? ¡MÁS!', 'Why did you stop? MORE!'),
  line('Aprieta el Churu. Aprieta. APRIETA.', 'Squeeze the Churu. Squeeze. SQUEEZE.'),
  line('Te juro que si no me das el resto...', "I swear, if you don't give me the rest..."),
];
const WHERE = [
  line('¿Y mi Churu? No veo ningún Churu. Veo un humano sin Churu.', "Where's my Churu? I see no Churu. I see a human with no Churu."),
  line('Te espero aquí. Con paciencia. Mentira, apúrate.', "I'll wait here. Patiently. Just kidding, hurry up."),
  line('Un Churu, humano. No es tan difícil.', "One Churu, human. It's not that hard."),
];
const GREET = [
  line('¿Qué quieres? Si no son cariños, no me interesa.', "What do you want? If it isn't pets, I'm not interested."),
  line('Mrrp. Mi humano favorito. Bueno, el único que me da Churus.', 'Mrrp. My favorite human. Well, the only one who gives me Churus.'),
  line('Estoy ocupada. Mirando a la nada. ¿Qué pasó?', "I'm busy. Staring at nothing. What is it?"),
];
const HAPPY = [
  line('Prrr... Eso fueron dos minutos. Me debes veintiocho más.', 'Prrr... That was two minutes. You owe me twenty-eight more.'),
  line('Aceptable. Vuelve pronto. Muy pronto. Ahora.', 'Acceptable. Come back soon. Very soon. Now.'),
  line('Mmm. Ahora sí te quiero un poquito.', 'Mmm. Now I love you a little bit.'),
];

export function buildMothQuest(g, places) {
  const { top, H, park, carmen, along, total, deckY } = places;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ground = (x, z, y = 50) => g.phys.groundAt(x, z, y).h;
  const P = () => g.player.pos;
  const stage = () => g.q.moth2 || 0;

  // ---------------------------------------------------------------- models
  const cardboard = new THREE.MeshLambertMaterial({ color: 0xa87b4d });
  const box = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 1.1), cardboard);
  base.position.y = 0.25; box.add(base);
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 1.08), cardboard);
    flap.position.set(s * 0.7, 0.54, 0); flap.rotation.z = s * 0.3; box.add(flap);
  }
  const home = V(park.x, top(park.x, park.z), park.z);
  box.position.copy(home);
  g.root.add(box);
  g.phys.addBox(home.x, home.z, 0.75, 0.55, 0, home.y - 0.3, home.y + 0.5, { tag: 'prop' });
  const BOX_Y = 0.52;

  const moth = M.mothMesh();
  const mothRoot = new THREE.Group(); mothRoot.add(moth);
  mothRoot.position.copy(home);
  // cool: seconds until she's allowed to hop out and pester you for pets again
  const cat = { base: BOX_Y, mode: 'box', hop: 0, squish: 0, lick: 0, idle: 0, say: 0, cool: 40 };

  function churuMesh() {
    const o = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
    tube.rotation.z = Math.PI / 2; o.add(tube);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 10), new THREE.MeshLambertMaterial({ color: 0xe8452f, emissive: 0x401008 }));
    band.rotation.z = Math.PI / 2; o.add(band);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0xffb347 }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.37; o.add(tip);
    o.scale.setScalar(1.5);
    return o;
  }
  const churu = churuMesh();
  churu.visible = false;
  g.root.add(churu);

  // ---------------------------------------------------------------- the Churu at Carmen's kiosk
  // on the boardwalk just in front of her and a step to the side
  const cfx = Math.sin(places.carmenFace), cfz = Math.cos(places.carmenFace);
  const churuSpot = V(carmen.x + cfx * 1.4 + cfz * 1.2, 0, carmen.z + cfz * 1.4 - cfx * 1.2);
  churuSpot.y = ground(churuSpot.x, churuSpot.z, carmen.y + 1) + 0.8;

  // ---------------------------------------------------------------- the thief pelican
  // it loops over the boardwalk by the kiosk: low over the deck, high over the water
  let f0 = 0, best = Infinity;
  for (let i = 0; i <= 400; i++) {
    const p = along(i / 400, 0);
    const d = Math.hypot(p.x - carmen.x, p.z - carmen.z);
    if (d < best) { best = d; f0 = i / 400; }
  }
  const pel = M.pelicanMesh();
  pel.scale.setScalar(1.3);
  pel.visible = false;
  g.root.add(pel);
  const pelState = { s: 0, mode: 'off', t: 0, from: V(0, 0, 0), to: V(0, 0, 0) };
  const loopAt = (s, out) => {
    const off = 5 + 7 * Math.sin(2 * s);
    const p = along(Math.min(1, Math.max(0, f0 + 16 / total * Math.sin(s))), off);
    out.set(p.x, deckY + 1.7 + 3.2 * Math.max(0, (off - 1) / 11), p.z);
    return out;
  };
  g.aimables.push(() => (pelState.mode === 'loop' ? [{ x: pel.position.x, y: pel.position.y + 0.6, z: pel.position.z }] : []));

  // ---------------------------------------------------------------- talking target
  const n = { name: 'Moth', x: home.x, y: home.y, z: home.z, m: { root: mothRoot }, custom: true, hidden: false,
    talk: () => talk() };
  n.quest = () => {
    const s = stage();
    return s === 0 ? 'available' : s === 1 || s === 6 ? 'active' : null;
  };
  g.root.add(mothRoot);
  g.npcs.push(n);

  // ---------------------------------------------------------------- helpers
  const purr = () => {
    g.sfx.tone(46, 0.4, { type: 'sawtooth', vol: 0.06, slide: 1.15 });
    g.sfx.tone(92, 0.3, { type: 'triangle', vol: 0.03, slide: 1.1 });
  };
  const hearts = (k = 5) => g.fx.emit(mothRoot.position.x, mothRoot.position.y + cat.base + 1, mothRoot.position.z, k,
    { color: 0xff7aa8, speed: 1.4, up: 2.4, life: 0.8, grav: -1 });
  const clock = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  // her pestering pops up as a notice, with her babble voice like any other line
  const toastMoth = l => {
    const text = tr(l);
    g.ui.toast(`🐈‍⬛ Moth: ${text}`, 2.6);
    [...text.replace(/[^\p{L}]/gu, '')].slice(0, 12).forEach((ch, i) => setTimeout(() => g.sfx.voice('Moth', ch), i * 70));
  };
  const setStage = s => { g.q.moth2 = s; g.save(); };

  function petMeter() {
    const secs = (g.q.mothPets || 0) * PET_SECS;
    g.ui.meter(`🐾 ${tr(line('Cariños', 'Pets'))}: ${clock(secs)} / 30:00`, secs / 1800);
  }

  // hop out of the box (toward the player) and start chasing/pestering
  function leaveBox(mode) {
    if (cat.mode === 'box') {
      const a = Math.atan2(P().x - home.x, P().z - home.z);
      mothRoot.position.set(home.x + Math.sin(a) * 1.3, ground(home.x + Math.sin(a) * 1.3, home.z + Math.cos(a) * 1.3, home.y + 1), home.z + Math.cos(a) * 1.3);
      cat.base = 0;
      g.sfx.play('meow');
    }
    cat.mode = mode;
  }
  function backToBox() {
    cat.mode = 'box'; cat.base = BOX_Y;
    mothRoot.position.copy(home);
    mothRoot.rotation.set(0, 0, 0);
  }

  // ---------------------------------------------------------------- petting / feeding (tap 💬)
  function pet() {
    g.q.mothPets = (g.q.mothPets || 0) + 1;
    cat.squish = 1; cat.idle = 0;
    purr(); hearts();
    if (Math.random() < 0.25) g.sfx.play('meow');
    petMeter();
  }

  async function talk() {
    const s = stage();
    if (s === 0) {
      await g.ui.say('Moth', [
        line(`¡Por fin, ${g.playerName}! ¿Tú sabes cuánto tiempo llevo esperando cariños? ¡TRES minutos!`, `Finally, ${g.playerName}! Do you know how long I've been waiting for pets? THREE minutes!`),
        line('Las reglas son fáciles: me acaricias por treinta minutos. Sin parar. Yo te aviso cuando termines.', "The rules are easy: you pet me for thirty minutes. Nonstop. I'll let you know when you're done."),
        line('Toca 💬 para acariciarme. Muchas veces. Rápido.', 'Tap 💬 to pet me. Lots of times. Fast.'),
      ]);
      g.q.mothPets = 0;
      setStage(1);
      petMeter();
      return;
    }
    if (s === 1) {
      pet();
      if (g.q.mothPets >= PETS_FOR_DEAL) {
        g.ui.meter(null);
        await g.ui.say('Moth', [
          line('Prrrr... Mmm. Un minuto con cuarenta y ocho. A este ritmo nos faltan veintiocho minutos.', 'Prrrr... Mmm. One minute forty-eight. At this rate we still have twenty-eight minutes to go.'),
          line('Te propongo un trato: tráeme un Churu y te perdono el resto.', "Here's a deal: bring me a Churu and I'll let you off the rest."),
          line('Una vez cambié a uno de mis bebés recién nacidos por un Churu. El mejor trato de mi vida.', 'I once traded one of my newborns for a Churu. Best deal of my life.'),
          line('Doña Carmen esconde Churus en su kiosko. Ve. VE. ¿Por qué sigues aquí?', 'Doña Carmen hides Churus at her kiosk. Go. GO. Why are you still here?'),
        ]);
        g.q.mothPets = 0;
        setStage(2);
        if (cat.mode !== 'box') cat.mode = 'home';
      }
      return;
    }
    if (s === 6) return feed();
    if (s >= 2 && s <= 5) return g.ui.say('Moth', [pick(WHERE)]);
    // after the quest: once you've chosen to pet her, every tap is a pet
    if (cat.petting) {
      pet();
      if (g.q.mothPets >= 8) {
        g.ui.meter(null);
        g.q.mothPets = 0;
        cat.cool = 150; cat.petting = false;
        await g.ui.say('Moth', [pick(HAPPY)]);
        cat.mode = g.q.mothFollow ? 'follow' : cat.mode === 'box' ? 'box' : 'home';
      }
      return;
    }
    // otherwise she asks what you want; as a reward she can tag along (just for fun)
    const follow = !!g.q.mothFollow;
    const v = await g.ui.say('Moth', [pick(GREET)], [
      { label: line('Acariciarla', 'Pet her'), value: 'pet', primary: true },
      { label: follow ? line('Vuelve a tu caja', 'Go back to your box') : line('Sígueme', 'Follow me'), value: 'follow' },
      { label: line('Nada', 'Nothing'), value: 'no' },
    ]);
    if (v === 'pet') { cat.petting = true; pet(); return; }
    if (v !== 'follow') return;
    g.q.mothFollow = !follow;
    g.save();
    if (!follow) {
      leaveBox('follow');
      await g.ui.say('Moth', [line('Bueno. Te sigo. Pero no porque te quiera. Es por si tienes Churus.', "Fine. I'll follow you. Not because I love you. In case you have Churus.")]);
    } else {
      cat.mode = 'home';
      await g.ui.say('Moth', [line('Me voy a mi caja. Me extrañarás.', "I'm going to my box. You'll miss me.")]);
    }
  }

  async function feed() {
    const fed = (g.q.mothFed || 0) + FEED_STEP;
    g.q.mothFed = fed;
    cat.lick = 1; cat.idle = 0;
    g.sfx.tone(1300 + Math.random() * 300, 0.06, { type: 'triangle', vol: 0.05, slide: 0.6 });
    if (Math.random() < 0.35) purr();
    hearts(3);
    churu.scale.x = 1.5 * Math.max(0.25, 1 - fed);
    g.ui.meter(`🍡 Churu: ${Math.min(100, Math.round(fed * 100))}%`, fed);
    if (fed < 1) return;
    // all gone: she owes you one now
    g.ui.meter(null);
    churu.visible = false;
    hearts(20);
    await g.ui.say('Moth', [
      line('...Slurp. Slurp. ...¿Eso fue todo?', '...Slurp. Slurp. ...Was that all of it?'),
      line(`Está bien, ${g.playerName}. Te ganaste un regalo. Uno GRANDE. De lo más alto que hay.`, `Fine, ${g.playerName}. You've earned a gift. A BIG one. From the highest place there is.`),
      line('No te muevas. Y no te comas mi caja.', "Don't move. And don't eat my box."),
    ]);
    const Pp = P();
    const fx = Math.sin(g.player.face), fz = Math.cos(g.player.face);
    const landAt = V(Pp.x + fx * 1.6, 0, Pp.z + fz * 1.6);
    landAt.y = ground(landAt.x, landAt.z, Pp.y + 1);
    cat.mode = 'cine';
    moth.position.y = 0; cat.base = 0;
    await mothToTheMoon(g, mothRoot, moth, { home: home.clone().setY(home.y), landAt });
    backToBox();
    setStage(7);
    g.q.mothPets = 0;
    g.reveal('moth', landAt.x, landAt.y + 1.4, landAt.z);
    g.ui.banner(tr(line('¡Un regalo de la Luna!', 'A gift from the Moon!')), tr(line('Moth te quiere (un poquito) ♥', 'Moth loves you (a little) ♥')), 4);
  }

  // ---------------------------------------------------------------- movement
  const step = new THREE.Vector3();
  // run toward a point on foot; she won't set a paw in the water. Returns the distance left.
  function runTo(tx, tz, dt, stopAt) {
    const R = mothRoot.position;
    const dx = tx - R.x, dz = tz - R.z, d = Math.hypot(dx, dz);
    mothRoot.rotation.y = Math.atan2(dx, dz);
    if (d <= stopAt) return d;
    const mv = Math.min(d - stopAt, RUN * dt);
    step.set(R.x + dx / d * mv, 0, R.z + dz / d * mv);
    const gy = ground(step.x, step.z, R.y + 0.9);
    if (gy < 0.15) return d; // water ahead: wait at the edge
    R.set(step.x, gy, step.z);
    cat.hop += dt * 14;
    cat.moving = 0.15;
    return d - mv;
  }

  // ---------------------------------------------------------------- per-frame logic
  const tmp = new THREE.Vector3();
  let churuGetT = 0, swoopT = 0, fall = null, carryT = 0;

  function updateCat(dt) {
    const s = stage();
    const Pp = P();
    const dPlayer = Math.hypot(Pp.x - mothRoot.position.x, Pp.z - mothRoot.position.z);
    cat.cool = Math.max(0, cat.cool - dt);
    cat.moving = Math.max(0, (cat.moving || 0) - dt);
    if (cat.mode === 'box') {
      // brat mode: she hops out and follows you around demanding pets
      const dHome = Math.hypot(Pp.x - home.x, Pp.z - home.z);
      if (s === 7 && g.q.mothFollow) leaveBox('follow');
      else if ((s === 1 && dHome > 7) || (s === 7 && dHome < 9 && !cat.cool && (g.q.mothPets || 0) < 8)) {
        leaveBox('pester');
        toastMoth(pick(PESTER));
        if (s === 7) petMeter();
      }
    } else if (cat.mode === 'pester') {
      runTo(Pp.x, Pp.z, dt, 1.6);
      if ((cat.say -= dt) < 0 && dPlayer < 3) { cat.say = 4 + Math.random() * 3; g.sfx.play('meow'); if (Math.random() < 0.5) toastMoth(pick(PESTER)); }
      // she gives up if you run far away, or (after the quest) once she's had her pets
      if (dPlayer > 45 || s === 2) { cat.mode = 'home'; cat.cool = 90; if (s === 7) g.ui.meter(null); }
    } else if (cat.mode === 'follow') {
      // tagging along after the quest; if you warp or swim far away she catches up
      const d = runTo(Pp.x, Pp.z, dt, 2.2);
      if (d > 40 && g.player.grounded && Pp.y > 0.2) {
        const back = g.player.face + Math.PI;
        const x = Pp.x + Math.sin(back) * 2.5, z = Pp.z + Math.cos(back) * 2.5;
        mothRoot.position.set(x, ground(x, z, Pp.y + 1), z);
        g.fx.emit(x, mothRoot.position.y + 0.5, z, 12, { color: 0xa8eab7, speed: 2, up: 2, life: 0.6 });
      }
    } else if (cat.mode === 'home') {
      if (runTo(home.x, home.z, dt, 1.2) <= 1.25) backToBox();
    } else if (cat.mode === 'chase') {
      // stage 5: she smelled the Churu
      if (runTo(Pp.x, Pp.z, dt, 1.3) <= 1.35 && Math.abs(Pp.y - mothRoot.position.y) < 1.6) {
        cat.mode = 'eat';
        setStage(6);
        g.q.mothFed = 0;
        g.cam.shake = 0.3;
        g.sfx.play('meow');
        g.player.vel.set(0, 0, 0);
        hearts(8);
        g.ui.banner(tr(line('¡Moth te tacleó!', 'Moth tackled you!')), tr(line('Toca 💬 para darle el Churu', 'Tap 💬 to give her the Churu')), 3);
        g.ui.meter('🍡 Churu: 0%', 0);
      }
    } else if (cat.mode === 'eat') {
      // keep up if you wander off mid-snack, and complain if you stop squeezing
      runTo(Pp.x, Pp.z, dt, 1.3);
      cat.idle += dt;
      if (cat.idle > 2.2) { cat.idle = 0; g.sfx.play('meow'); toastMoth(pick(MORE)); }
    }
    n.x = mothRoot.position.x; n.z = mothRoot.position.z; n.y = mothRoot.position.y;
    n.hidden = cat.mode === 'chase' || cat.mode === 'cine';
  }

  function updateQuest(dt) {
    const s = stage();
    const Pp = P();
    if (s === 2) {
      churu.visible = true;
      if (churuGetT === 0 && swoopT === 0) {
        churu.position.copy(churuSpot);
        if (Math.hypot(Pp.x - churuSpot.x, Pp.z - churuSpot.z) < 1.5 && Math.abs(Pp.y + 0.8 - churuSpot.y) < 1.8) {
          // hold it up high... and here comes the pelican
          churuGetT = 1.4;
          g.talking = true;
          g.sfx.play('mask');
          g.ui.banner(tr(line('¡Un Churu!', 'A Churu!')), tr(line('Doña Carmen: «Llévatelo, mijo. Esa gata me debe tres.»', "Doña Carmen: \"Take it, dear. That cat owes me three.\"")), 2.2);
        }
      }
      if (churuGetT > 0) {
        churu.position.set(Pp.x, Pp.y + 2.1, Pp.z);
        if ((churuGetT -= dt) <= 0) {
          churuGetT = 0; swoopT = 1.1;
          pelState.from.set(Pp.x - 18, Pp.y + 14, Pp.z + 12);
          pel.visible = true;
          g.sfx.play('pelican');
        }
      } else if (swoopT > 0) {
        swoopT -= dt;
        const k = 1 - Math.max(0, swoopT) / 1.1;
        tmp.set(Pp.x, Pp.y + 1.7, Pp.z);
        pel.position.lerpVectors(pelState.from, tmp, k * k);
        pel.lookAt(tmp.x, pel.position.y, tmp.z);
        churu.position.set(Pp.x, Pp.y + 2.1, Pp.z);
        if (swoopT <= 0) {
          g.talking = false;
          g.cam.shake = 0.2;
          g.sfx.play('pelican');
          g.ui.banner(tr(line('¡¿QUÉ?!', 'WHAT?!')), tr(line('¡Un pelícano se robó el Churu!', 'A pelican stole the Churu!')), 2.5);
          setTimeout(() => g.ui.toast(tr(line('Tírale la pava cuando baje sobre el tablado 🎩', 'Throw your pava when it swoops over the boardwalk 🎩')), 4), 2200);
          pelState.mode = 'loop'; pelState.s = 0;
          setStage(3);
        }
      }
    } else if (s === 3) {
      churu.visible = true;
      pel.visible = true;
      if (pelState.mode === 'off') pelState.mode = 'loop';
      if (pelState.mode === 'loop') {
        pelState.s += dt * 0.85;
        tmp.copy(pel.position);
        loopAt(pelState.s, pel.position);
        pel.lookAt(pel.position.x * 2 - tmp.x, pel.position.y, pel.position.z * 2 - tmp.z); // face along its flight
        churu.position.set(pel.position.x, pel.position.y + 0.9, pel.position.z);
        const h = g.player.hat;
        if (h.state !== 'on' && h.pos.distanceTo(tmp.set(pel.position.x, pel.position.y + 0.6, pel.position.z)) < 2.2) {
          // bonk! it flees over the water and drops the Churu
          g.sfx.play('hit'); g.sfx.play('pelican');
          g.fx.emit(pel.position.x, pel.position.y + 0.8, pel.position.z, 20, { color: 0xffffff, speed: 3, up: 2, life: 0.6 });
          pelState.mode = 'flee'; pelState.t = 0;
          pelState.from.copy(pel.position);
          const p = along(Math.min(1, Math.max(0, f0 + 16 / total * Math.sin(pelState.s))), 13);
          pelState.to.set(p.x, deckY + 4, p.z);
          g.ui.toast(tr(line('¡PUM! ¡Lo soltó!', 'BONK! It let go!')), 2);
        }
      } else if (pelState.mode === 'flee') {
        pelState.t += dt;
        const k = Math.min(1, pelState.t / 1.0);
        pel.position.lerpVectors(pelState.from, pelState.to, k);
        pel.lookAt(pelState.to.x, pel.position.y, pelState.to.z);
        churu.position.set(pel.position.x, pel.position.y + 0.9, pel.position.z);
        if (k >= 1) {
          fall = { x: pel.position.x, y: pel.position.y + 0.6, z: pel.position.z, vy: 2, wet: false };
          pelState.mode = 'away'; pelState.t = 0; pelState.from.copy(pel.position);
          pelState.to.set(pel.position.x + 60, pel.position.y + 30, pel.position.z - 40);
          g.q.mothChuru = null;
          setStage(4);
        }
      }
    } else if (s === 4) {
      churu.visible = true;
      if (!fall) {
        const c = g.q.mothChuru || [churuSpot.x, 0, churuSpot.z];
        fall = { x: c[0], y: c[1], z: c[2], vy: 0, rest: true };
      }
      if (!fall.rest) {
        const floor = Math.max(H(fall.x, fall.z), -12) + 0.15;
        const surf = top(fall.x, fall.z);
        if (fall.y > 0 || surf > 0.1) {
          fall.vy -= 16 * dt; fall.y += fall.vy * dt;
          if (surf > 0.1 && fall.y <= surf + 0.3) { fall.y = surf + 0.3; fall.rest = true; }
          else if (fall.y <= 0 && !fall.wet) {
            fall.wet = true; fall.vy = -1.4;
            g.sfx.play('splash');
            g.fx.emit(fall.x, 0.1, fall.z, 18, { color: 0xdff6ff, speed: 3, up: 4, life: 0.7 });
            g.ui.toast(tr(line('¡Se cayó al agua! Sumérgete y búscalo 🤿', 'It fell in the water! Dive down for it 🤿')), 4);
          }
        } else {
          fall.vy = -1.4; fall.y += fall.vy * dt;
          if (fall.y <= floor) { fall.y = floor; fall.rest = true; }
        }
        if (fall.rest) { g.q.mothChuru = [fall.x, fall.y, fall.z]; g.save(); }
      }
      churu.position.set(fall.x, fall.y + (fall.rest ? Math.sin(performance.now() / 300) * 0.08 : 0), fall.z);
      churu.rotation.y += dt * 2;
      if (Math.hypot(Pp.x - fall.x, Pp.z - fall.z) < 1.7 && Math.abs(Pp.y + 0.5 - fall.y) < 1.9) {
        fall = null;
        g.sfx.play('mask');
        g.ui.toast(tr(line('¡Rescataste el Churu!', 'You rescued the Churu!')), 2);
        carryT = 1.4;
        setStage(5);
      }
    } else if (s === 5 || s === 6) {
      // carried at your side
      churu.visible = true;
      const a = g.player.face + 0.9;
      churu.position.set(Pp.x + Math.sin(a) * 0.5, Pp.y + 0.9, Pp.z + Math.cos(a) * 0.5);
      churu.rotation.set(0, g.player.face, 0.3);
      if (s === 5 && cat.mode !== 'chase') {
        if (carryT > 0) carryT -= dt;
        else {
          leaveBox('chase');
          g.ui.banner('¡¡MIAAAAAU!!', tr(line('Moth olió el Churu desde el parque...', 'Moth smelled the Churu all the way from the park...')), 3);
          g.sfx.play('meow');
        }
      }
      if (s === 6 && cat.mode !== 'eat') cat.mode = 'eat';
    } else {
      churu.visible = false;
    }
    // the pelican flies off for good once it drops the Churu
    if (pelState.mode === 'away') {
      pelState.t += dt;
      pel.position.lerpVectors(pelState.from, pelState.to, Math.min(1, pelState.t / 3));
      if (pelState.t > 3) { pel.visible = false; pelState.mode = 'done'; }
    }
    if (s !== 3 && pelState.mode === 'off') pel.visible = false;
  }

  // ---------------------------------------------------------------- challenge hooks
  const labels = {
    0: line('Habla con Moth en el parque', 'Talk to Moth in the park'),
    1: line('Acaricia a Moth (toca 💬 muchas veces)', 'Pet Moth (tap 💬 lots)'),
    2: line('Busca un Churu en el kiosko de Doña Carmen', "Find a Churu at Doña Carmen's kiosk"),
    3: line('¡Tírale la pava al pelícano!', 'Throw your pava at the pelican!'),
    4: line('Bucea por el Churu', 'Dive for the Churu'),
    5: line('¡Moth viene por su Churu!', 'Moth is coming for her Churu!'),
    6: line('Dale el Churu a Moth (toca 💬)', 'Give Moth the Churu (tap 💬)'),
  };
  g.mask('moth', line('El regalo de Moth', "Moth's gift"), home.x, home.y + 1.8, home.z, true);

  g.challenge({
    onLoad() {
      // the earlier version of this quest: finishing it counts
      if (!g.q.moth2 && g.q.moth >= 6) g.q.moth2 = 7;
      else if (!g.q.moth2 && g.q.moth >= 1) g.q.moth2 = 1;
      const s = stage();
      if (s === 5 || s === 6) { g.q.moth2 = 5; carryT = 0.5; }
      if (s === 1) petMeter();
    },
    objective() {
      const s = stage();
      if (s >= 7) return null;
      if (s === 2) return { x: churuSpot.x, y: churuSpot.y - 0.8, z: churuSpot.z, label: labels[2] };
      if (s === 3) return { x: pel.position.x, y: pel.position.y - 1.2, z: pel.position.z, label: labels[3] };
      if (s === 4) return { x: churu.position.x, y: churu.position.y, z: churu.position.z, label: labels[4] };
      return { x: mothRoot.position.x, y: mothRoot.position.y, z: mothRoot.position.z, label: labels[s], idle: s === 0 };
    },
    update(dt) {
      updateCat(dt);
      updateQuest(dt);
    },
    animate(dt, now) {
      if (cat.mode === 'cine') return;
      cat.squish = Math.max(0, cat.squish - dt * 4);
      cat.lick = Math.max(0, cat.lick - dt * 5);
      const moving = (cat.mode === 'pester' || cat.mode === 'home' || cat.mode === 'chase' || cat.mode === 'follow') && cat.moving > 0;
      const hop = moving ? Math.abs(Math.sin(cat.hop)) * 0.35 : 0;
      moth.position.y = cat.base + hop + (moving ? 0 : Math.sin(now * 2) * 0.02);
      const sq = Math.sin(cat.squish * Math.PI) * cat.squish;
      moth.scale.set(0.75 * (1 + sq * 0.14), 0.75 * (1 - sq * 0.2), 0.75 * (1 + sq * 0.14));
      moth.rotation.x = moving ? 0.22 : cat.mode === 'eat' ? 0.25 + Math.sin(now * 20) * 0.1 * (0.3 + cat.lick) : 0;
      moth.rotation.z = sq * 0.25 * Math.sin(now * 30);
      moth.userData.tail.rotation.z = Math.sin(now * (moving ? 10 : 3)) * 0.3;
      // wings on the thief
      const w = pel.userData.wings;
      if (w && pel.visible) w.forEach((wing, i) => (wing.rotation.z = (i ? -1 : 1) * Math.sin(now * 9) * 0.6));
    },
  });
}
