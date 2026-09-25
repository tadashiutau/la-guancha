// HUD, dialogs, menus, mini-map and the big map.
import { t, tr, getLang } from './i18n.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(sfx) {
    this.sfx = sfx;
    this.onPlay = this.onReset = this.onPause = this.onWarp = this.onLang = () => {};
    this.dlg = null;
    this.bannerT = 0; this.toastT = 0;
    $('bPlay').onclick = () => this.onPlay();
    $('bLang').onclick = $('bLang2').onclick = () => this.onLang();
    $('bReset').onclick = () => $('confirm').classList.add('show');
    $('bYes').onclick = () => { $('confirm').classList.remove('show'); this.onReset(); this.ready(false); };
    $('bNo').onclick = () => $('confirm').classList.remove('show');
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
    document.title = t('title');
  }

  progress(p) { $('loadbar').firstElementChild.style.width = (p * 100) + '%'; }
  ready(hasSave) {
    $('loadbar').style.display = 'none';
    $('titleBtns').style.display = 'flex';
    $('bPlay').textContent = hasSave ? t('continue') : t('play');
    $('bReset').style.display = hasSave ? '' : 'none';
  }
  hideTitle() { $('title').classList.remove('show'); }
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
    const txt = tr(d.lines[d.i]);
    const el = $('dlgText');
    el.innerHTML = '';
    if (d.who) { const b = document.createElement('b'); b.textContent = tr(d.who) + ': '; el.append(b); }
    el.append(txt);
    const opts = $('dlgOpts');
    opts.innerHTML = '';
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
    this.sfx.play('talk');
  }

  advance() {
    const d = this.dlg;
    if (!d) return;
    if (d.i < d.lines.length - 1) { d.i++; this.showLine(); return; }
    if (d.options) return; // must pick one
    this.close(null);
  }

  close(v) {
    const d = this.dlg;
    if (!d) return;
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
    g.translate(S / 2, S / 2);
    g.scale(zoom, zoom);
    g.drawImage(this.mapImg, -px, -py);
    g.restore();
    // flags
    for (const f of this.game.flags) {
      if (!f.on) continue;
      const [fx, fy] = this.toMap(f.x, f.z);
      const x = S / 2 + (fx - px) * zoom, y = S / 2 + (fy - py) * zoom;
      if (x < 0 || y < 0 || x > S || y > S) continue;
      g.fillStyle = '#e3342f'; g.fillRect(x - 2, y - 12, 10, 7); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 12, 2, 14);
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
    g.drawImage(this.mapImg, 0, 0);
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
