// Touch-first input: floating joystick on the left, camera drag on the right, three action buttons.
// Keyboard/mouse fallback for desktop.
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
        this.touchMode = true;
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

  down(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    if (e.pointerType === 'mouse') {
      this.mouseDown = true; this.camLast = [e.clientX, e.clientY];
      return;
    }
    this.touchMode = true;
    document.body.classList.add('touch');
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

  // snapshot for this frame; clears one-shot presses
  frame() {
    const k = this.keys;
    let kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const kl = Math.hypot(kx, ky);
    if (kl > 1) { kx /= kl; ky /= kl; }
    // Q/R rotate the camera from the keyboard
    const kr = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyR') ? 1 : 0);
    if (kr) { this.camDX += kr * -6; this.lastCamInput = performance.now() / 1000; }
    const out = {
      mx: this.tmx || kx, my: this.tmy || ky,
      jump: this.held.jump, hat: this.held.hat, crouch: this.held.crouch,
      jumpPressed: this.pressed.jump, hatPressed: this.pressed.hat, crouchPressed: this.pressed.crouch,
      talkPressed: this.pressed.talk, pausePressed: this.pressed.pause, mapPressed: this.pressed.map,
      camDX: this.camDX, camDY: this.camDY, zoom: this.zoom,
    };
    for (const a in this.pressed) this.pressed[a] = false;
    this.camDX = this.camDY = 0; this.zoom = 0;
    if (!this.enabled) { out.mx = out.my = 0; out.jumpPressed = out.hatPressed = out.crouchPressed = false; }
    return out;
  }

  release() {
    this.stickId = this.camId = null; this.tmx = this.tmy = 0;
    this.stick.classList.remove('active');
    for (const k in this.held) this.held[k] = false;
  }
}
