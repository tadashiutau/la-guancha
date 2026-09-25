// HUD, dialogs, menus, mini-map and the big map.
import { t, tr, getLang } from './i18n.js';
import { SLOT_COUNT, slotInfo, isMarkedBad } from './saves.js';

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
    // quest tracker: tap the ⭐ label to pick which quest to follow
    $('qtop').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this.openMenu('quests'); });
    window.addEventListener('keydown', e => { if (e.code === 'KeyT' && e.target.tagName !== 'INPUT') this.game?.nextQuest(); });
    $('bResume').onclick = () => this.pause(false);
    this.tab = 'map';
    for (const b of document.querySelectorAll('#mtabs button')) b.onclick = () => this.showTab(b.dataset.tab);
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
      const info = slotInfo(slot);
      const bad = info.status === 'bad' || (info.status === 'ok' && isMarkedBad(slot));
      const save = bad ? null : info.save;
      const card = document.createElement('div'); card.className = bad ? 'save-slot bad' : 'save-slot';
      const title = document.createElement('strong');
      title.textContent = `${t('slot')} ${slot} · ${bad ? t('badSlot') : save ? (save.name || t('unnamedSlot')) : t('emptySlot')}`;
      card.append(title);
      if (bad) {
        // an old or damaged save: explain, and only offer to delete it
        const why = document.createElement('p'); why.textContent = t('badSlotHelp');
        card.append(why);
        const row = document.createElement('div'); row.className = 'row';
        const del = document.createElement('button'); del.className = 'pill pink'; del.type = 'button';
        del.textContent = t('deleteSlot');
        del.onclick = () => this.confirmAction(`${t('deleteSaveConfirm')} ${slot}?`, () => { this.onDeleteSlot(slot); this.renderSlots(); });
        row.append(del); card.append(row); box.append(card);
        continue;
      }
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

  // the game menu (tabs: map, quests, stats, options) doubles as the pause screen
  pause(on) {
    if (on) this.openMenu(this.tab); else this.closeMenu();
  }
  openMenu(tab = this.tab) {
    this.onPause(true);
    $('menu').classList.add('show');
    this.toggleQuestList(false);
    this.showTab(tab);
  }
  closeMenu() {
    $('menu').classList.remove('show');
    this.onPause(false);
  }
  showTab(tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll('#mtabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const sec of document.querySelectorAll('.mtab')) sec.classList.toggle('show', sec.id === `tab-${tab}`);
    if (tab === 'map') this.drawBigMap();
    if (tab === 'quests') this.renderQuests();
    if (tab === 'stats') this.renderStats();
    this.sfx.play('talk');
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
    top.textContent = '⭐ ' + label + (q.n > 1 ? `  ⇄ ${q.at}/${q.n}` : '');
    top.classList.toggle('many', q.n > 1);
    if (q.on) {
      // on screen: a pin over the goal, pointing down at it
      el.style.display = 'block';
      el.classList.add('pin');
      el.style.transform = `translate(${q.sx * innerWidth / 2}px, ${-q.sy * innerHeight / 2}px)`;
      el.firstElementChild.style.transform = 'rotate(90deg)';
      el.lastElementChild.textContent = q.dist + ' m';
      return;
    }
    el.classList.remove('pin');
    const w = innerWidth / 2 - 50, h = innerHeight / 2 - 70;
    const c = Math.cos(q.ang), s = Math.sin(q.ang);
    const k = Math.min(w / Math.abs(c || 1e-6), h / Math.abs(s || 1e-6));
    el.style.display = 'block';
    el.style.transform = `translate(${c * k}px, ${-s * k}px)`;
    el.firstElementChild.style.transform = `rotate(${-q.ang}rad)`;
    el.lastElementChild.textContent = q.dist + ' m';
  }

  toggleQuestList(open = !$('qlist').classList.contains('show')) {
    const box = $('qlist');
    const choices = this.game?.questChoices() || [];
    if (!open || choices.length < 2) { box.classList.remove('show'); return; }
    box.replaceChildren();
    const title = document.createElement('div'); title.className = 'qh'; title.textContent = t('quests');
    box.append(title);
    for (const c of choices) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = c.tracked ? 'on' : '';
      b.textContent = `${c.tracked ? '⭐' : '☆'} ${tr(c.label)} · ${c.dist} m`;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this.game.trackQuest(c.i); box.classList.remove('show'); });
      box.append(b);
    }
    box.classList.add('show');
    clearTimeout(this.qlistT);
    this.qlistT = setTimeout(() => box.classList.remove('show'), 8000);
  }

  // a labelled progress bar under the quest label (petting Moth, feeding her the Churu)
  meter(label, frac = 0) {
    const el = $('meter');
    if (label == null) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.firstElementChild.textContent = label;
    el.lastElementChild.firstElementChild.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
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

  // ---------------------------------------------------------------- big map (menu → Mapa)
  openMap() { this.openMenu('map'); }
  closeMap() { this.closeMenu(); }

  drawBigMap() {
    const g = $('bigmap').getContext('2d');
    g.drawImage(this.mapImg, 0, 0, 1200, 840);
    const game = this.game;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of game.masks) {
      if (!m.got) continue;
      const [x, y] = this.toMap(m.x, m.z);
      g.font = '24px serif';
      g.fillText('🎭', x, y);
    }
    // flags (tap to travel)
    this.hits = [];
    for (const f of game.flags) {
      const [x, y] = this.toMap(f.x, f.z);
      g.fillStyle = f.on ? '#e3342f' : 'rgba(80,80,80,.6)';
      g.fillRect(x, y - 30, 22, 14);
      g.fillStyle = f.on ? '#fff' : 'rgba(255,255,255,.6)';
      g.fillRect(x - 3, y - 30, 4, 34);
      if (f.on) {
        g.fillStyle = '#1e5bb8';
        g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 9, y - 23); g.lineTo(x, y - 16); g.fill();
        this.hits.push({ x, y: y - 16, flag: f });
      }
    }
    // quests: a bubble for each one still to do (tap to follow it). The one you follow and the
    // ones in progress get their names first; a name that would overlap another is left off.
    const tracked = this.trackedQuestId();
    const rank = q => (q.d.id === tracked ? 0 : q.status === 'active' ? 1 : 2);
    const items = game.questLog().filter(q => q.status !== 'done')
      .map(q => ({ q, o: this.questSpot(q) })).filter(it => it.o)
      .sort((a, b) => rank(b.q) - rank(a.q)); // draw the important ones last (on top)
    for (const { q, o } of items) {
      const [x, y] = this.toMap(o.x, o.z);
      const on = q.d.id === tracked;
      g.lineWidth = 4; g.strokeStyle = '#1b2330';
      g.fillStyle = on ? '#ffd23f' : q.status === 'active' ? '#7fd3e8' : '#ffffff';
      g.beginPath();
      if (on) { for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
      else g.arc(x, y, 15, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#1b2330'; g.font = 'bold 20px Trebuchet MS, sans-serif';
      if (!on) g.fillText(q.status === 'active' ? '?' : '!', x, y + 1);
      this.hits.push({ x, y, quest: q.d.id });
    }
    const taken = [];
    g.font = 'bold 17px Trebuchet MS, sans-serif';
    for (const { q, o } of items.slice().reverse()) {
      const [x, y] = this.toMap(o.x, o.z);
      const text = tr(q.d.name), w = g.measureText(text).width + 8, h = 20;
      for (const dy of [30, -30, 48]) {
        const r = { x0: x - w / 2, x1: x + w / 2, y0: y + dy - h / 2, y1: y + dy + h / 2 };
        if (taken.some(t2 => r.x0 < t2.x1 && r.x1 > t2.x0 && r.y0 < t2.y1 && r.y1 > t2.y0)) continue;
        taken.push(r);
        g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.92)'; g.fillStyle = '#1b2330';
        g.strokeText(text, x, y + dy); g.fillText(text, x, y + dy);
        break;
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
  }

  // where a quest's marker goes: its live objective while it runs, else where it starts
  questSpot(q) {
    const c = q.d.challenge;
    if (q.status === 'active' && c) { const o = c.objective?.(); if (o) return o; }
    return q.d.where?.();
  }
  trackedQuestId() {
    const game = this.game;
    if (game.trackIdx === 'pin') return game.pin?.id;
    const c = game.challenges[game.trackIdx];
    return c && game.questDefs.find(d => d.challenge === c)?.id;
  }

  mapClick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 1200, y = (e.clientY - r.top) / r.height * 840;
    let best = null, bd = 60;
    for (const h of this.hits || []) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    if (best.quest) { this.game.trackQuestId(best.quest); this.drawBigMap(); return; }
    const f = best.flag;
    this.closeMenu();
    this.onWarp(f.x, f.y + 0.5, f.z, f.face || 0);
    this.sfx.play('checkpoint');
  }

  // ---------------------------------------------------------------- quest log (menu → Misiones)
  renderQuests() {
    const box = $('questLog');
    box.replaceChildren();
    const log = this.game.questLog();
    const tracked = this.trackedQuestId();
    const P = this.game.player.pos;
    const groups = [['active', t('qActive')], ['available', t('qAvailable')], ['done', t('qDone')]];
    for (const [st, title] of groups) {
      const list = log.filter(q => q.status === st);
      if (!list.length) continue;
      const h = document.createElement('div'); h.className = 'qsec'; h.textContent = `${title} · ${list.length}`;
      box.append(h);
      for (const q of list) {
        const card = document.createElement('div');
        card.className = `qcard ${st}${q.d.id === tracked ? ' tracked' : ''}`;
        const name = document.createElement('b'); name.textContent = (q.d.id === tracked ? '⭐ ' : '') + tr(q.d.name);
        const desc = document.createElement('div'); desc.className = 'qd'; desc.textContent = tr(q.d.desc);
        const meta = document.createElement('div'); meta.className = 'qm';
        const spot = st !== 'done' && this.questSpot(q);
        const bits = [];
        if (q.d.giver) bits.push(q.d.giver);
        if (q.progress) bits.push(q.progress);
        if (spot) bits.push(`${Math.round(Math.hypot(spot.x - P.x, spot.z - P.z) / 0.6)} m`);
        if (st === 'done') bits.push('✅');
        meta.textContent = bits.join(' · ');
        card.append(name, desc, meta);
        if (st !== 'done') {
          const b = document.createElement('button'); b.type = 'button';
          b.className = `pill ${q.d.id === tracked ? '' : 'primary'}`;
          b.textContent = q.d.id === tracked ? t('qTracking') : t('qTrack');
          b.onclick = () => { this.game.trackQuestId(q.d.id); this.renderQuests(); };
          card.append(b);
        }
        box.append(card);
      }
    }
  }

  // ---------------------------------------------------------------- collection (menu → Colección)
  renderStats() {
    const st = this.game.stats();
    const box = $('statTiles');
    box.replaceChildren();
    const tile = (icon, label, value, frac) => {
      const d = document.createElement('div'); d.className = 'stile';
      const v = document.createElement('div'); v.className = 'sv'; v.textContent = `${icon} ${value}`;
      const l = document.createElement('div'); l.className = 'sl'; l.textContent = label;
      d.append(v, l);
      if (frac != null) { const b = document.createElement('div'); b.className = 'sb'; const i = document.createElement('i'); i.style.width = `${Math.round(frac * 100)}%`; b.append(i); d.append(b); }
      box.append(d);
    };
    const pair = ([a, b]) => [`${a}/${b}`, b ? a / b : 0];
    tile('🎭', t('stMasks'), ...pair(st.masks));
    tile('⭐', t('stQuests'), ...pair(st.quests));
    tile('🐚', t('stShells'), ...pair(st.conchas));
    tile('🪙', t('stCoins'), ...pair(st.coins));
    tile('💰', t('stWallet'), st.wallet);
    tile('🇵🇷', t('stFlags'), ...pair(st.flags));
    tile('📦', t('stCrates'), ...pair(st.crates));
    const m = Math.floor(st.time / 60);
    tile('⏱️', t('stTime'), `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
    const list = $('maskList');
    list.replaceChildren();
    this.game.masks.forEach((mk, i) => {
      const d = document.createElement('div');
      d.className = mk.got ? 'got' : '';
      d.textContent = `${i + 1}. ${mk.got ? tr(mk.name) : t('unknown')}`;
      list.append(d);
    });
  }
}
