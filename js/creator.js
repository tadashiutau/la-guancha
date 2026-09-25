// Character creator: name plus skin, hair color and style, facial hair and clothes, with a live
// turning 3D preview. Opens for a new game and from the menu's Options tab.
import * as THREE from 'three';
import { makeModel, makeHat, CHAR_DEFAULT, CHAR_OPTIONS } from './player.js';
import { t } from './i18n.js';

const $ = id => document.getElementById(id);
const NAMES = ['Tito', 'Yari', 'Chago', 'Maricarmen', 'Wiso', 'Nilda', 'Papo', 'Luz', 'Junior', 'Zoraida', 'Cheo', 'Iris'];
const hex = c => '#' + c.toString(16).padStart(6, '0');

export class Creator {
  constructor() {
    this.char = { ...CHAR_DEFAULT };
    this.renderer = null;
    this.raf = 0;
  }

  // resolves { name, char } when the player taps the start button
  open({ name = '', char = CHAR_DEFAULT, isNew = true } = {}) {
    this.char = { ...CHAR_DEFAULT, ...char };
    $('nameInput').value = name;
    $('nameError').textContent = '';
    $('bNameGo').textContent = isNew ? t('begin') : t('done');
    $('bCharCancel').hidden = isNew;
    this.buildRows();
    $('nameScreen').classList.add('show');
    this.startPreview();
    return new Promise(res => {
      const go = () => {
        const nm = $('nameInput').value.trim().replace(/\s+/gu, ' ').slice(0, 20);
        if (!nm) { $('nameError').textContent = t('nameRequired'); $('nameInput').focus(); return; }
        this.close();
        res({ name: nm, char: { ...this.char } });
      };
      $('bNameGo').onclick = go;
      $('nameInput').onkeydown = e => { if (e.key === 'Enter') go(); };
      $('bCharRandom').onclick = () => {
        const pick = a => a[Math.floor(Math.random() * a.length)];
        for (const k of Object.keys(CHAR_OPTIONS)) this.char[k] = pick(CHAR_OPTIONS[k]);
        // with a controller there may be no keyboard handy: suggest a name too
        if (!$('nameInput').value.trim()) $('nameInput').value = pick(NAMES);
        this.buildRows(); this.refresh();
      };
      $('bCharCancel').onclick = () => { this.close(); res(null); };
    });
  }

  close() {
    $('nameScreen').classList.remove('show');
    cancelAnimationFrame(this.raf);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }

  buildRows() {
    const box = $('charRows');
    box.replaceChildren();
    const row = (key, label, render) => {
      const r = document.createElement('div'); r.className = 'crow';
      const l = document.createElement('div'); l.className = 'clabel'; l.textContent = t(label);
      const opts = document.createElement('div'); opts.className = 'copts';
      for (const v of CHAR_OPTIONS[key]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'copt' + (this.char[key] === v ? ' on' : '');
        render(b, v);
        b.onclick = () => {
          this.char[key] = v;
          for (const o of opts.children) o.classList.toggle('on', o === b);
          this.refresh();
        };
        opts.append(b);
      }
      r.append(l, opts); box.append(r);
    };
    const swatch = (b, v) => { b.classList.add('swatch'); b.style.background = hex(v); b.setAttribute('aria-label', hex(v)); };
    const word = prefix => (b, v) => { b.textContent = t(prefix + v); };
    row('skin', 'cSkin', swatch);
    row('hair', 'cHair', swatch);
    row('style', 'cStyle', word('hs_'));
    row('face', 'cFace', word('fh_'));
    row('shirt', 'cShirt', swatch);
    row('shorts', 'cShorts', swatch);
  }

  startPreview() {
    const canvas = $('charCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6a8a5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.cam.position.set(0, 0.8, 3.7);
    this.cam.lookAt(0, 0.62, 0);
    this.spin = 0.4;
    // drag to turn the model
    let drag = null;
    canvas.onpointerdown = e => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = e => { if (drag != null) { this.spin += (e.clientX - drag) * 0.012; drag = e.clientX; } };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    this.refresh();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && h && (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
      }
      if (drag == null) this.spin += 0.006;
      if (this.model) {
        const now = performance.now() / 1000;
        this.model.root.rotation.y = this.spin;
        this.model.body.position.y = 0.52 + Math.sin(now * 2.1) * 0.008;
        this.model.arms[0].rotation.z = 0.12; this.model.arms[1].rotation.z = -0.12;
        const blink = (now % 3.2) < 0.12 ? 0.1 : 1;
        for (const e of this.model.eyes) e.scale.y = blink;
      }
      this.renderer.render(this.scene, this.cam);
    };
    loop();
  }

  refresh() {
    if (!this.scene) return;
    if (this.model) this.scene.remove(this.model.root);
    this.model = makeModel(this.char);
    this.model.hatSlot.add(makeHat());
    this.scene.add(this.model.root);
  }
}
