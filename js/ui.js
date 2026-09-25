// HUD, dialogs, menus, mini-map and the big map.
import { t, tr, getLang } from './i18n.js';
import { SLOT_COUNT, readSave } from './saves.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(sfx) {
    this.sfx = sfx;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.onPlay = this.onPause = this.onWarp = this.onLang = this.onToSlots = () => {};
    this.onSelectSlot = this.onCopySlot = this.onMoveSlot = this.onDeleteSlot = this.onName = () => {};
    this.copyFrom = null;
    this.transferMode = null;
    this.dlg = null;
    this.bannerT = 0; this.toastT = 0;
    $('bPlay').onclick = () => this.onPlay();
    $('bLang').onclick = $('bLang2').onclick = () => this.onLang();
    $('bSlotsBack').onclick = () => this.hideSlots();
    $('bToSlots').onclick = () => this.onToSlots();
    $('bNameGo').onclick = () => this.submitName();
    $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.submitName(); });
    $('bYes').onclick = () => { $('confirm').classList.remove('show'); this.confirmed?.(); this.confirmed = null; };
    $('bNo').onclick = () => { $('confirm').classList.remove('show'); this.confirmed = null; };
    $('pauseBtn').addEventListener('pointerdown', e => { e.stopPropagation(); this.pause(true); });
    $('bResume').onclick = () => this.pause(false);
    $('bMap').onclick = () => { this.pause(false, true); this.openMap(); };
    $('bMapClose').onclick = () => this.closeMap();
    $('bSound').onclick = () => {
      this.sfx.setMuted(!this.sfx.muted);
      try { localStorage.setItem('guancha.muted', this.sfx.muted ? '1' : '0'); } catch (e) { /* ignore */ }
      this.applyLang();
    };
    $('bMusic').onclick = () => { this.sfx.setMusic(!this.sfx.musicOn); this.applyLang(); };
    $('dialog').addEventListener('pointerdown', e => { if (e.target.tagName !== 'BUTTON') { e.stopPropagation(); this.advance(); } });
    $('bigmap').addEventListener('pointerdown', e => this.mapClick(e));
    this.mini = $('mini').getContext('2d');
  }

  attach(game, data) {
    this.game = game;
    this.data = data;
    this.mapImg = data.colorImg;
    $('nMasksT').textContent = game.masks.length;
    $('nConchasT').textContent = game.conchaTotal;
  }

  applyLang() {
    document.documentElement.lang = getLang();
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    const touch = matchMedia('(pointer: coarse)').matches;
    const ctrl = touch ? t('controlsTouch') : t('controlsKeys');
    $('ctrlText').textContent = ctrl;
    $('ctrlText2').textContent = ctrl;
    $('bSound').textContent = `${t('sound')}: ${this.sfx.muted ? t('off') : t('on')}`;
    $('bMusic').textContent = `${t('music')}: ${this.sfx.musicOn ? t('on') : t('off')}`;
    $('nameInput').placeholder = t('namePlaceholder');
    $('nameInput').setAttribute('aria-label', t('namePlaceholder'));
    if ($('saveScreen').classList.contains('show')) this.renderSlots();
    document.title = t('title');
  }

  progress(p) { $('loadbar').firstElementChild.style.width = (p * 100) + '%'; }
  ready() {
    $('loadbar').style.display = 'none';
    $('titleBtns').style.display = 'flex';
    $('bPlay').textContent = t('play');
  }
  hideTitle() { $('title').classList.remove('show'); }
  showSlots() { this.copyFrom = this.transferMode = null; $('saveScreen').classList.add('show'); this.renderSlots(); }
  hideSlots() { $('saveScreen').classList.remove('show'); this.copyFrom = this.transferMode = null; }

  renderSlots() {
    const box = $('saveSlots'); box.replaceChildren();
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      const save = readSave(slot);
      const card = document.createElement('div'); card.className = 'save-slot';
      const title = document.createElement('strong'); title.textContent = `${t('slot')} ${slot} · ${save ? (save.name || t('unnamedSlot')) : t('emptySlot')}`;
      card.append(title);
      if (save) {
        const info = document.createElement('p');
        const minutes = Math.floor((save.time || 0) / 60);
        info.textContent = `${(save.masks || []).length}/${this.game?.masks.length || 28} ${t('masksFound')} · ${t('playTime')}: ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
        card.append(info);
      }
      const row = document.createElement('div'); row.className = 'row';
      const button = (label, style, fn) => {
        const b = document.createElement('button'); b.className = `pill ${style}`.trim();
        b.type = 'button'; b.textContent = label; b.onclick = fn; row.append(b);
      };
      if (this.copyFrom == null) {
        button(save ? t('openSlot') : t('emptySlot'), 'primary', () => this.onSelectSlot(slot));
        if (save) {
          button(t('copySlot'), '', () => { this.copyFrom = slot; this.transferMode = 'copy'; this.renderSlots(); });
          button(t('moveSlot'), '', () => { this.copyFrom = slot; this.transferMode = 'move'; this.renderSlots(); });
          button(t('deleteSlot'), 'pink', () => this.confirmAction(`${t('deleteSaveConfirm')} ${slot}?`, () => { this.onDeleteSlot(slot); this.renderSlots(); }));
        }
      } else if (this.copyFrom === slot) {
        button(t('cancelCopy'), '', () => { this.copyFrom = this.transferMode = null; this.renderSlots(); });
      } else {
        const transfer = () => {
          if (this.transferMode === 'move') this.onMoveSlot(this.copyFrom, slot);
          else this.onCopySlot(this.copyFrom, slot);
          this.copyFrom = this.transferMode = null;
          this.renderSlots();
        };
        button(save ? t('replaceSlot') : this.transferMode === 'move' ? t('moveHere') : t('pasteSlot'), save ? 'pink' : 'primary',
          () => save ? this.confirmAction(`${t('replaceSaveConfirm')} ${slot}?`, transfer) : transfer());
      }
      card.append(row); box.append(card);
    }
  }

  confirmAction(message, action) {
    $('confirmText').textContent = message;
    this.confirmed = action;
    $('confirm').classList.add('show');
  }

  promptName() {
    $('nameInput').value = '';
    $('nameError').textContent = '';
    $('nameScreen').classList.add('show');
    $('nameInput').focus();
  }

  submitName() {
    const name = $('nameInput').value.trim().replace(/\s+/gu, ' ').slice(0, 20);
    if (!name) { $('nameError').textContent = t('nameRequired'); return; }
    $('nameScreen').classList.remove('show');
    this.onName(name);
  }
  error(e) {
    $('loadbar').style.display = 'none';
    $('ctrlText').textContent = 'Error: ' + (e && e.message || e);
  }

  pause(on, silent) {
    $('pause').classList.toggle('show', on);
    if (!silent) this.onPause(on);
    else this.onPause(true);
  }

  // ---------------------------------------------------------------- HUD
  counters(coins, conchas, masks) {
    $('nCoins').textContent = coins;
    $('nConchas').textContent = conchas;
    $('nMasks').textContent = masks;
  }

  banner(text, sub = '', secs = 2.6) {
    const b = $('banner');
    b.innerHTML = '';
    b.append(text);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
    b.classList.add('show');
    this.bannerT = secs;
  }

  toast(text, secs = 2.5) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    this.toastT = secs;
  }

  timer(secs) {
    const el = $('timer');
    if (secs == null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = '⏱ ' + secs.toFixed(1);
    el.style.color = secs < 5 ? '#ff8a80' : '#fff';
  }

  prog(text) {
    const el = $('prog');
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }

  // points at the current quest objective from the screen edge
  questArrow(q) {
    const el = $('qarrow'), top = $('qtop');
    this.quest = q;
    if (!q) { el.style.display = 'none'; top.style.display = 'none'; return; }
    const label = (q.label ? tr(q.label) + ' · ' : '') + q.dist + ' m';
    top.style.display = 'block';
    top.textContent = '⭐ ' + label;
    if (q.on) { el.style.display = 'none'; return; }
    const w = innerWidth / 2 - 50, h = innerHeight / 2 - 70;
    const c = Math.cos(q.ang), s = Math.sin(q.ang);
    const k = Math.min(w / Math.abs(c || 1e-6), h / Math.abs(s || 1e-6));
    el.style.display = 'block';
    el.style.transform = `translate(${c * k}px, ${-s * k}px)`;
    el.firstElementChild.style.transform = `rotate(${-q.ang}rad)`;
    el.lastElementChild.textContent = q.dist + ' m';
  }

  talkButton(show) { $('bTalk').classList.toggle('show', !!show); }

  debug(s) {
    let d = $('dbg');
    if (!d) {
      d = document.createElement('div'); d.id = 'dbg';
      Object.assign(d.style, { position: 'fixed', bottom: '4px', left: '4px', font: '12px monospace', background: 'rgba(0,0,0,.5)', padding: '2px 6px', zIndex: 20, pointerEvents: 'none' });
      document.body.append(d);
    }
    d.textContent = s;
  }

  frame(dt, player, cam) {
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').classList.remove('show');
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.remove('show');
    this.drawMini(player, cam);
  }

  // ---------------------------------------------------------------- dialog
  // lines: array of strings or {es,en}; options: [{label, fn}] shown with the last line
  say(who, lines, options = null) {
    return new Promise(res => {
      this.dlg = { who, lines, i: 0, options, res };
      $('dialog').classList.add('show');
      this.showLine();
    });
  }

  showLine() {
    const d = this.dlg;
    clearTimeout(this.typeTimer);
    const txt = tr(d.lines[d.i]);
    const el = $('dlgText');
    el.innerHTML = '';
    el.classList.remove('done');
    if (d.who) { const b = document.createElement('b'); b.textContent = tr(d.who) + ': '; el.append(b); }
    const accessible = document.createElement('span');
    accessible.className = 'sr-only';
    accessible.textContent = txt;
    el.append(accessible);
    const words = document.createElement('span');
    words.className = 'dlg-letters';
    words.setAttribute('aria-hidden', 'true');
    el.append(words);
    d.chars = [];
    for (const part of txt.match(/\S+|\s+/gu) || []) {
      if (/^\s+$/u.test(part)) { words.append(document.createTextNode(part)); continue; }
      const word = document.createElement('span');
      word.className = 'dlg-word';
      for (const ch of Array.from(part)) {
        const letter = document.createElement('span');
        letter.className = 'dlg-char';
        letter.textContent = ch;
        word.append(letter);
        d.chars.push({ letter, ch });
      }
      words.append(word);
    }
    d.at = 0;
    d.typing = !this.reducedMotion.matches && d.chars.length > 0;
    const opts = $('dlgOpts');
    opts.innerHTML = '';
    $('dlgNext').style.display = 'none';
    if (d.typing) this.typeTimer = setTimeout(() => this.typeNext(d), 25);
    else this.finishLine(true);
  }

  typeNext(d) {
    if (this.dlg !== d || !d.typing) return;
    const { letter, ch } = d.chars[d.at++];
    letter.classList.add('shown');
    if (/[\p{L}\p{N}]/u.test(ch)) this.sfx.voice(tr(d.who || ''), ch);
    if (d.at === d.chars.length) { this.finishLine(); return; }
    const delay = /[.!?…]/u.test(ch) ? 170 : /[,;:]/u.test(ch) ? 90 : 34;
    this.typeTimer = setTimeout(() => this.typeNext(d), delay);
  }

  finishLine(revealRemaining = false) {
    const d = this.dlg;
    if (!d) return;
    clearTimeout(this.typeTimer);
    d.typing = false;
    if (revealRemaining) $('dlgText').classList.add('done');
    const opts = $('dlgOpts');
    const last = d.i === d.lines.length - 1;
    if (last && d.options) {
      for (const o of d.options) {
        const b = document.createElement('button');
        b.className = 'pill' + (o.primary ? ' primary' : '');
        b.textContent = tr(o.label);
        b.disabled = !!o.disabled;
        b.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); this.close(o.value ?? o.label); };
        opts.append(b);
      }
      $('dlgNext').style.display = 'none';
    } else $('dlgNext').style.display = '';
  }

  advance() {
    const d = this.dlg;
    if (!d) return;
    if (d.typing) { this.finishLine(true); return; }
    if (d.i < d.lines.length - 1) { d.i++; this.showLine(); return; }
    if (d.options) return; // must pick one
    this.close(null);
  }

  close(v) {
    const d = this.dlg;
    if (!d) return;
    clearTimeout(this.typeTimer);
    this.dlg = null;
    $('dialog').classList.remove('show');
    d.res(v);
  }

  // ---------------------------------------------------------------- mini-map (north up)
  toMap(x, z) {
    const b = this.data.bounds;
    return [(x - b.x0) / (b.x1 - b.x0) * 1200, (z - b.z0) / (b.z1 - b.z0) * 840];
  }

  drawMini(player, cam) {
    if (!this.mapImg) return;
    const g = this.mini, S = 240, zoom = 1.3;
    const [px, py] = this.toMap(player.pos.x, player.pos.z);
    g.fillStyle = '#1b6fa3'; g.fillRect(0, 0, S, S);
    g.save();
    const ms = this.mapImg.width / 1200; // map image pixels per mini-map unit
    g.translate(S / 2, S / 2);
    g.scale(zoom / ms, zoom / ms);
    g.drawImage(this.mapImg, -px * ms, -py * ms);
    g.restore();
    // flags
    for (const f of this.game.flags) {
      if (!f.on) continue;
      const [fx, fy] = this.toMap(f.x, f.z);
      const x = S / 2 + (fx - px) * zoom, y = S / 2 + (fy - py) * zoom;
      if (x < 0 || y < 0 || x > S || y > S) continue;
      g.fillStyle = '#e3342f'; g.fillRect(x - 2, y - 12, 10, 7); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 12, 2, 14);
    }
    // quest objective star
    const ob = this.game.objective;
    if (ob) {
      const [ox, oy] = this.toMap(ob.x, ob.z);
      let x = S / 2 + (ox - px) * zoom, y = S / 2 + (oy - py) * zoom;
      const dx = x - S / 2, dy = y - S / 2, l = Math.hypot(dx, dy), max = S / 2 - 14;
      if (l > max) { x = S / 2 + dx / l * max; y = S / 2 + dy / l * max; }
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#1b2330'; g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    }
    // camera view cone + player arrow
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-cam.yaw + Math.PI);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -70); g.lineTo(40, -70); g.closePath(); g.fill();
    g.restore();
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.PI - player.face);
    g.fillStyle = '#ffd400'; g.strokeStyle = '#1b2330'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -13); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- big map
  openMap() {
    this.onPause(true);
    $('mapScreen').classList.add('show');
    const g = $('bigmap').getContext('2d');
    g.drawImage(this.mapImg, 0, 0, 1200, 840);
    const game = this.game;
    for (const m of game.masks) {
      if (!m.got) continue;
      const [x, y] = this.toMap(m.x, m.z);
      g.font = '26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🎭', x, y);
    }
    this.flagHits = [];
    for (const f of game.flags) {
      const [x, y] = this.toMap(f.x, f.z);
      g.fillStyle = f.on ? '#e3342f' : 'rgba(80,80,80,.6)';
      g.fillRect(x, y - 30, 22, 14);
      g.fillStyle = f.on ? '#fff' : 'rgba(255,255,255,.6)';
      g.fillRect(x - 3, y - 30, 4, 34);
      if (f.on) {
        g.fillStyle = '#1e5bb8';
        g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 9, y - 23); g.lineTo(x, y - 16); g.fill();
        this.flagHits.push({ x, y: y - 16, f });
      }
    }
    const p = game.player.pos;
    const [px, py] = this.toMap(p.x, p.z);
    g.fillStyle = '#ffd400'; g.strokeStyle = '#1b2330'; g.lineWidth = 4;
    g.beginPath(); g.arc(px, py, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    const progress = $('shellProgress');
    progress.replaceChildren();
    for (const region of game.shellProgress()) {
      const item = document.createElement('div');
      item.className = region.got === region.total ? 'done' : '';
      item.textContent = `${t(`shellRegion_${region.id}`)} ${region.got}/${region.total}`;
      progress.append(item);
    }
    const list = $('maskList');
    list.innerHTML = '';
    game.masks.forEach((m, i) => {
      const d = document.createElement('div');
      d.className = m.got ? 'got' : '';
      d.textContent = `${i + 1}. ${m.got ? tr(m.name) : t('unknown')}`;
      list.append(d);
    });
  }

  mapClick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 1200, y = (e.clientY - r.top) / r.height * 840;
    let best = null, bd = 60;
    for (const h of this.flagHits || []) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h.f; }
    }
    if (best) {
      this.closeMap();
      this.onWarp(best.x, best.y + 0.5, best.z, best.face || 0);
      this.sfx.play('checkpoint');
    }
  }

  closeMap() {
    $('mapScreen').classList.remove('show');
    this.onPause(false);
  }
}
