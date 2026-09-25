// Touch-first input: floating joystick on the left, camera drag on the right, three action buttons.
// Keyboard/mouse fallback for desktop, and game controllers (a Bluetooth pad paired to a phone,
// tablet or computer) through the standard Gamepad API, including menu navigation.
export class Input {
  constructor(root) {
    this.mx = 0; this.my = 0;
    this.camDX = 0; this.camDY = 0; this.zoom = 0;
    this.held = { jump: false, hat: false, crouch: false };
    this.pressed = { jump: false, hat: false, crouch: false, talk: false, pause: false, map: false };
    this.keys = new Set();
    this.lastCamInput = -10;
    this.touchMode = false;
    this.enabled = true;

    if (matchMedia('(pointer: coarse)').matches) { this.touchMode = true; document.body.classList.add('touch'); }
    this.device = this.touchMode ? 'touch' : 'keys'; // last used: 'pad', 'touch' or 'keys' (button prompts)
    this.stick = root.querySelector('#stick');
    this.knob = root.querySelector('#knob');
    this.stickId = null; this.stickO = [0, 0];
    this.camId = null; this.camLast = [0, 0];
    this.mouseDown = false;

    const surface = root.querySelector('#touch');
    surface.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));

    for (const b of root.querySelectorAll('[data-btn]')) {
      const name = b.dataset.btn;
      const on = e => {
        e.preventDefault(); e.stopPropagation();
        this.touchMode = true; this.usedTouch();
        if (name in this.held) this.held[name] = true;
        this.pressed[name] = true;
        b.classList.add('on');
        b.setPointerCapture?.(e.pointerId);
      };
      const off = e => { e.preventDefault(); if (name in this.held) this.held[name] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
    }

    const map = { Space: 'jump', KeyJ: 'hat', KeyE: 'hat', ShiftLeft: 'crouch', ShiftRight: 'crouch', KeyK: 'crouch', KeyC: 'crouch', KeyF: 'talk', Enter: 'talk', Escape: 'pause', KeyP: 'pause', KeyM: 'map', Tab: 'map' };
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      this.device = 'keys';
      const a = map[e.code];
      if (a) {
        e.preventDefault();
        if (!e.repeat) { this.pressed[a] = true; if (a in this.held) this.held[a] = true; }
        // F / Enter also advance dialogs like the jump button
        if (a === 'talk' && !e.repeat) this.pressed.jump = this.pressed.jump || false;
      }
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      const a = map[e.code];
      if (a && a in this.held) this.held[a] = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); for (const k in this.held) this.held[k] = false; });
    window.addEventListener('wheel', e => { this.zoom += Math.sign(e.deltaY); }, { passive: true });
  }

  // touching the screen after using a controller brings the touch controls back
  usedTouch() {
    this.device = 'touch';
    if (this.padActive) { this.padActive = false; document.body.classList.remove('pad'); }
  }

  down(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    if (e.pointerType === 'mouse') {
      this.mouseDown = true; this.camLast = [e.clientX, e.clientY];
      return;
    }
    this.touchMode = true;
    document.body.classList.add('touch');
    this.usedTouch();
    if (e.clientX < w * 0.45 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickO = [e.clientX, e.clientY];
      this.stick.style.left = e.clientX + 'px';
      this.stick.style.top = e.clientY + 'px';
      this.stick.classList.add('active');
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else if (this.camId === null) {
      this.camId = e.pointerId;
      this.camLast = [e.clientX, e.clientY];
    }
  }

  move(e) {
    if (e.pointerId === this.stickId) {
      const R = 55;
      let dx = e.clientX - this.stickO[0], dy = e.clientY - this.stickO[1];
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.tmx = dx / R; this.tmy = -dy / R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.camId || (e.pointerType === 'mouse' && this.mouseDown)) {
      this.camDX += e.clientX - this.camLast[0];
      this.camDY += e.clientY - this.camLast[1];
      this.camLast = [e.clientX, e.clientY];
      this.lastCamInput = performance.now() / 1000;
    }
  }

  up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null; this.tmx = this.tmy = 0;
      this.stick.classList.remove('active');
    }
    if (e.pointerId === this.camId) this.camId = null;
    if (e.pointerType === 'mouse') this.mouseDown = false;
  }

  // ---------------------------------------------------------------- game controllers
  // Standard mapping: A jump, B talk, X/Y throw the pava, triggers/LB crouch, RB pava, Start pause,
  // Select map, left stick/D-pad move, right stick camera. While a menu, a screen or dialog
  // choices are open, the stick/D-pad moves a highlight between buttons, A picks and B backs out.
  pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads.find(p => p.mapping === 'standard') || pads[0];
    if (!gp) { this.pad = null; return; }
    const prev = this.padPrev || [];
    const btn = i => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const hit = i => btn(i) && !prev[i];
    this.padPrev = gp.buttons.map((_, i) => btn(i));
    const dz = v => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    let lx = dz(gp.axes[0] || 0), ly = -dz(gp.axes[1] || 0);
    lx += (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
    ly += (btn(12) ? 1 : 0) - (btn(13) ? 1 : 0);
    const l = Math.hypot(lx, ly);
    if (l > 1) { lx /= l; ly /= l; }
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (gp.buttons.some((b, i) => btn(i)) || l > 0 || rx || ry) {
      if (!this.padActive) { this.padActive = true; document.body.classList.add('pad'); }
      this.device = 'pad';
    }
    // which face-button labels to show: Xbox A/B/X/Y, PlayStation ✕○□△ or Nintendo (bottom = B)
    const id = (gp.id || '').toLowerCase();
    this.padKind = /xbox|xinput|045e/.test(id) ? 'xbox'
      : /054c|playstation|dualsense|dualshock|wireless controller/.test(id) ? 'ps'
        : /057e|nintendo|pro controller|joy-con/.test(id) ? 'nintendo' : 'xbox';
    // raw buttons for the kart and jet ski: A gas, B brake, RB/RT drift, X/Y item, LB/LT quit
    this.padBtns = { a: btn(0), b: btn(1), r: btn(5) || btn(7), l: btn(4) || btn(6), rHit: hit(5) || hit(7), itemHit: hit(2) || hit(3) };
    // menus first: if something is open, the pad drives it instead of the game
    if (this.padNav(gp, { lx, ly, hit })) { this.pad = { mx: 0, my: 0 }; return; }
    if (hit(0)) this.pressed.jump = true;
    if (hit(1)) this.pressed.talk = true;
    if (hit(2) || hit(3) || hit(5)) this.pressed.hat = true;
    if (hit(4) || hit(6) || hit(7)) this.pressed.crouch = true;
    if (hit(9)) this.pressed.pause = true;
    if (hit(8)) this.pressed.map = true;
    this.padHeld = { jump: btn(0), hat: btn(2) || btn(3) || btn(5), crouch: btn(4) || btn(6) || btn(7) };
    if (rx || ry) { this.camDX += rx * 16; this.camDY += ry * 10; this.lastCamInput = performance.now() / 1000; }
    this.pad = { mx: lx, my: ly };
  }

  padNav(gp, { lx, ly, hit }) {
    // the topmost thing that wants buttons: dialog choices, then any open screen
    const opts = document.querySelector('#dialog.show #dlgOpts');
    let scope = opts && opts.children.length ? opts : null;
    if (!scope) {
      // the top one: highest z-index, and the later one in the page when they tie
      const screens = [...document.querySelectorAll('.screen.show')].map((el, i) => ({ el, i, z: +getComputedStyle(el).zIndex || 0 }));
      screens.sort((a, b) => b.z - a.z || b.i - a.i);
      scope = screens[0]?.el || null;
    }
    if (!scope) { if (this.navEl) this.setNav(null); return false; }
    const items = [...scope.querySelectorAll('button, input, [data-nav]')].filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!items.length) return true;
    if (!items.includes(this.navEl)) {
      this.setNav(items.find(el => el.classList.contains('primary')) || items[0]);
      const r = this.navEl.getBoundingClientRect(); this.navX = r.left + r.width / 2;
    }
    // one step per push of the stick (repeat while held)
    const now = performance.now();
    const dir = Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5 ? (Math.abs(lx) > Math.abs(ly) ? [Math.sign(lx), 0] : [0, -Math.sign(ly)]) : null;
    if (dir && (!this.navDir || this.navDir[0] !== dir[0] || this.navDir[1] !== dir[1] || now > this.navRepeat)) {
      this.navRepeat = now + (this.navDir ? 180 : 380);
      const next = this.nearest(items, this.navEl, dir);
      if (next) {
        // remember the column: up/down keep it, left/right set it
        if (dir[0] || this.navX == null) { const r = next.getBoundingClientRect(); this.navX = r.left + r.width / 2; }
        this.setNav(next);
      }
    }
    this.navDir = dir;
    if (hit(0)) {
      const el = this.navEl;
      if (el.tagName === 'INPUT') el.focus();
      else if (el.onpointerdown) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      else el.click();
    }
    // B backs out (a screen's [data-back] button, or resume from the pause menu); Start resumes
    if (hit(1)) {
      const back = scope.querySelector('[data-back]');
      if (back && !back.hidden && back.offsetParent !== null) back.click();
      else if (scope.id === 'menu') this.pressed.pause = true;
    }
    if (hit(9) && scope.id === 'menu') this.pressed.pause = true;
    return true;
  }

  setNav(el) {
    if (this.navEl) this.navEl.classList.remove('padfocus');
    this.navEl = el;
    if (el) { el.classList.add('padfocus'); el.scrollIntoView?.({ block: 'nearest' }); }
  }

  // the closest item in a direction (screen space), for moving the highlight
  nearest(items, from, [dx, dy]) {
    const r0 = from.getBoundingClientRect(), cy = r0.top + r0.height / 2;
    const cx = dy && this.navX != null ? this.navX : r0.left + r0.width / 2;
    let best = null, bd = Infinity;
    for (const el of items) {
      if (el === from) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy;
      if (along <= 2) continue;
      const side = Math.abs(x * dy - y * dx);
      const d = along + side * 6;
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  }

  // snapshot for this frame; clears one-shot presses
  frame() {
    this.pollPad();
    const k = this.keys;
    let kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const kl = Math.hypot(kx, ky);
    if (kl > 1) { kx /= kl; ky /= kl; }
    // Q/R rotate the camera from the keyboard
    const kr = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyR') ? 1 : 0);
    if (kr) { this.camDX += kr * -6; this.lastCamInput = performance.now() / 1000; }
    const ph = this.padHeld || {};
    const out = {
      mx: this.tmx || kx || this.pad?.mx || 0, my: this.tmy || ky || this.pad?.my || 0,
      jump: this.held.jump || !!ph.jump, hat: this.held.hat || !!ph.hat, crouch: this.held.crouch || !!ph.crouch,
      jumpPressed: this.pressed.jump, hatPressed: this.pressed.hat, crouchPressed: this.pressed.crouch,
      talkPressed: this.pressed.talk, pausePressed: this.pressed.pause, mapPressed: this.pressed.map,
      camDX: this.camDX, camDY: this.camDY, zoom: this.zoom,
      device: this.device, padKind: this.padKind || 'xbox', pad: this.device === 'pad' ? this.padBtns || null : null,
    };
    for (const a in this.pressed) this.pressed[a] = false;
    this.camDX = this.camDY = 0; this.zoom = 0;
    if (!this.enabled) { out.mx = out.my = 0; out.jumpPressed = out.hatPressed = out.crouchPressed = false; out.pad = null; }
    return out;
  }

  release() {
    this.stickId = this.camId = null; this.tmx = this.tmy = 0;
    this.stick.classList.remove('active');
    for (const k in this.held) this.held[k] = false;
  }
}
