// All sounds are synthesized with WebAudio: no asset files needed (music can also come from music/tema.mp3).
import { Music } from './music.js';

// iOS mutes Web Audio when the ring/silent switch is on silent. Playing a (silent) HTML audio
// element and asking for the "playback" audio session makes the game audible like a video would be.
function unlockIOS() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  try {
    const sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    a.loop = true; a.setAttribute('playsinline', '');
    a.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

// vowel formants (Hz) for the NPC babble
const FORMANTS = { a: [800, 1250], e: [480, 1900], i: [320, 2350], o: [520, 900], u: [360, 780] };
// voices that should sound like their character
const VOICE_PITCH = { 'Moth': 620, 'Gabi': 440, 'Tito': 300, 'Doña Carmen': 250, 'Yari': 330, 'Don Tomás': 150, 'Don Pepe': 135 };

export class Sfx {
  constructor() {
    this.ctx = null; this.muted = false; this.coinStreak = 0; this.lastCoin = 0;
    try { this.musicOn = localStorage.getItem('guancha.music') !== '0'; } catch (e) { this.musicOn = true; }
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    unlockIOS();
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.startAmbience();
    this.music = new Music(this.ctx, this.master);
    this.music.setOn(this.musicOn);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
    // some browsers start suspended until another gesture
    const kick = () => this.ctx.state !== 'running' && this.ctx.resume();
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  setMusic(on) {
    this.musicOn = on;
    try { localStorage.setItem('guancha.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
    this.music?.setOn(on);
  }

  underwater(on) {
    if (this.isUnder === on) return;
    this.isUnder = on;
    this.music?.underwater(on);
  }

  tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // a kart engine hum: engine(0..1.4) sets the revs, engine(null) switches it off
  engine(rev) {
    const c = this.ctx;
    if (!c) return;
    if (rev == null) {
      if (this.eng) { const e = this.eng; e.g.gain.setTargetAtTime(0, c.currentTime, 0.1); setTimeout(() => { e.o.stop(); e.o2.stop(); }, 500); this.eng = null; }
      return;
    }
    if (!this.eng) {
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.eng = { o, o2, f, g };
    }
    const t = c.currentTime, e = this.eng;
    e.o.frequency.setTargetAtTime(55 + rev * 95, t, 0.06);
    e.o2.frequency.setTargetAtTime(27 + rev * 48, t, 0.06);
    e.f.frequency.setTargetAtTime(500 + rev * 900, t, 0.08);
    e.g.gain.setTargetAtTime(0.028 + rev * 0.02, t, 0.08);
  }

  noise(dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, slide = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  }

  // Animal Crossing–style babble: every letter is a tiny sung syllable. A buzzy source goes
  // through two band-pass "formant" filters shaped like the letter's vowel, at a pitch that
  // belongs to the speaker (old men low, kids and Moth high).
  voice(who, ch) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const c = this.ctx, now = c.currentTime;
    if (now - (this.lastVoiceAt ?? -1) < 0.055) return;
    this.lastVoiceAt = now;
    const name = String(who || '');
    if (name === 'Placa' || name === 'Plaque') return; // signs don't talk
    let seed = 0;
    for (const letter of name) seed = (seed * 31 + letter.codePointAt(0)) | 0;
    const base = VOICE_PITCH[name] ?? 210 + (Math.abs(seed) % 9) * 28;
    const low = ch.toLowerCase().normalize('NFD')[0];
    const vowel = FORMANTS[low] || FORMANTS['aeiou'[(low.codePointAt(0) + Math.abs(seed)) % 5]];
    const pitch = base * Math.pow(2, ((low.codePointAt(0) * 7) % 9 - 4) / 24);
    const dur = 0.075;
    const o = c.createOscillator();
    o.type = name === 'Moth' ? 'triangle' : 'sawtooth';
    o.frequency.setValueAtTime(pitch, now);
    o.frequency.exponentialRampToValueAtTime(pitch * (name === 'Moth' ? 1.25 : 0.92), now + dur);
    const out = c.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.3, now + 0.008);
    out.gain.exponentialRampToValueAtTime(0.001, now + dur);
    for (const [f, q, g] of [[vowel[0], 6, 1], [vowel[1], 9, 0.55]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = c.createGain(); gg.gain.value = g;
      o.connect(bp); bp.connect(gg); gg.connect(out);
    }
    out.connect(this.master);
    o.start(now); o.stop(now + dur + 0.02);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'coin': {
        const now = performance.now();
        this.coinStreak = now - this.lastCoin < 400 ? Math.min(this.coinStreak + 1, 8) : 0;
        this.lastCoin = now;
        const b = 988 * Math.pow(2, this.coinStreak / 24);
        this.tone(b, 0.07, { vol: 0.09 }); this.tone(b * 1.335, 0.3, { vol: 0.09, delay: 0.06 });
        break;
      }
      case 'concha': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.05 })); break;
      case 'jump': this.tone(300, 0.16, { type: 'square', vol: 0.05, slide: 2.2 }); break;
      case 'bigjump': this.tone(260, 0.35, { type: 'square', vol: 0.06, slide: 3.2 }); break;
      case 'longjump': this.noise(0.3, { vol: 0.12, freq: 800, slide: 2 }); this.tone(220, 0.25, { vol: 0.04, slide: 1.8 }); break;
      case 'walljump': this.tone(420, 0.12, { vol: 0.06, slide: 1.8 }); this.noise(0.08, { vol: 0.1, freq: 2000 }); break;
      case 'land': this.noise(0.06, { vol: 0.06, freq: 400, type: 'lowpass' }); break;
      case 'poundstart': this.tone(600, 0.25, { type: 'sawtooth', vol: 0.05, slide: 0.4 }); break;
      case 'pound': this.noise(0.35, { vol: 0.4, freq: 180, type: 'lowpass' }); this.tone(90, 0.3, { type: 'sine', vol: 0.3, slide: 0.5 }); break;
      case 'dive': this.noise(0.25, { vol: 0.12, freq: 1500, slide: 0.5 }); break;
      case 'hat': this.noise(0.3, { vol: 0.1, freq: 3000, q: 4, slide: 0.5 }); break;
      case 'hatjump': this.tone(500, 0.2, { type: 'triangle', vol: 0.12, slide: 2 }); break;
      case 'bounce': this.tone(200, 0.3, { type: 'sine', vol: 0.25, slide: 3 }); break;
      case 'splash': this.noise(0.5, { vol: 0.25, freq: 900, slide: 0.3 }); break;
      case 'stroke': this.noise(0.2, { vol: 0.08, freq: 700 }); break;
      case 'mantle': this.noise(0.08, { vol: 0.08, freq: 600 }); break;
      case 'break': this.noise(0.3, { vol: 0.35, freq: 500 }); this.noise(0.2, { vol: 0.2, freq: 1800, delay: 0.05 }); break;
      case 'hit': this.tone(1200, 0.12, { type: 'triangle', vol: 0.12 }); this.tone(1600, 0.2, { type: 'triangle', vol: 0.1, delay: 0.06 }); break;
      case 'talk': this.tone(520 + Math.random() * 200, 0.05, { type: 'triangle', vol: 0.05 }); break;
      case 'shard': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.06 })); break;
      case 'ring': this.tone(1320, 0.15, { type: 'sine', vol: 0.12 }); this.tone(1760, 0.2, { type: 'sine', vol: 0.1, delay: 0.05 }); break;
      case 'appear': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: i * 0.07 })); break;
      case 'fail': [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.06, delay: i * 0.15 })); break;
      case 'checkpoint': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: 'square', vol: 0.06, delay: i * 0.08 })); break;
      case 'buy': [880, 1320].forEach((f, i) => this.tone(f, 0.15, { type: 'square', vol: 0.06, delay: i * 0.08 })); break;
      case 'mask': this.music?.duck(3.5); this.fanfare(); break;
      case 'pelican': this.noise(0.25, { vol: 0.12, freq: 900, q: 6 }); this.tone(300, 0.2, { type: 'sawtooth', vol: 0.03, slide: 0.7 }); break;
      case 'meow': this.tone(700, 0.35, { type: 'triangle', vol: 0.08, slide: 1.4 }); this.tone(900, 0.3, { type: 'triangle', vol: 0.06, slide: 0.6, delay: 0.25 }); break;
      case 'tick': this.tone(1500, 0.04, { type: 'square', vol: 0.04 }); break;
      case 'coqui': this.coqui(); break;
      case 'step': this.noise(0.05, { vol: 0.05, freq: 900, type: 'lowpass' }); break;
      case 'stepwood': this.tone(170 + Math.random() * 40, 0.06, { type: 'triangle', vol: 0.07, slide: 0.7 }); this.noise(0.03, { vol: 0.04, freq: 2500 }); break;
      case 'gull': this.gull(); break;
      // the woods: a wolf whistle, a phone buzzing in a pocket, a bush rustling
      case 'whistle': this.tone(1400, 0.22, { type: 'sine', vol: 0.09, slide: 1.9, attack: 0.02 }); this.tone(2400, 0.45, { type: 'sine', vol: 0.09, slide: 0.45, delay: 0.3, attack: 0.02 }); break;
      case 'buzz': for (let i = 0; i < 2; i++) this.tone(140, 0.18, { type: 'square', vol: 0.05, delay: i * 0.3 }); break;
      // karts
      case 'boost': this.noise(0.5, { vol: 0.16, freq: 600, slide: 4 }); this.tone(220, 0.4, { type: 'sawtooth', vol: 0.04, slide: 2.5 }); break;
      case 'itembox': [988, 1319, 1568, 1976].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.04 })); break;
      case 'spin': this.tone(700, 0.6, { type: 'square', vol: 0.05, slide: 0.3 }); this.noise(0.3, { vol: 0.12, freq: 1500 }); break;
      case 'throw': this.noise(0.25, { vol: 0.1, freq: 2500, slide: 0.4 }); break;
      case 'beep': this.tone(660, 0.25, { type: 'square', vol: 0.07 }); break;
      case 'go': this.tone(1320, 0.5, { type: 'square', vol: 0.08 }); break;
      case 'rustle': for (let i = 0; i < 3; i++) this.noise(0.12, { vol: 0.07, freq: 2600, delay: i * 0.1 }); break;
    }
  }

  fanfare() {
    // a little plena-ish flourish
    const seq = [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33], [988, 0.55], [1047, 0.66], [1319, 0.8]];
    for (const [f, d] of seq) { this.tone(f, 0.28, { type: 'square', vol: 0.07, delay: d }); this.tone(f / 2, 0.28, { type: 'triangle', vol: 0.08, delay: d }); }
    for (let i = 0; i < 8; i++) this.noise(0.05, { vol: 0.08, freq: 6000, delay: i * 0.11, type: 'highpass' }); // güiro-ish
  }

  gull() {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const d = i * 0.28, f = 1300 + Math.random() * 300;
      this.tone(f, 0.22, { type: 'sawtooth', vol: 0.018, slide: 0.72, delay: d, attack: 0.03 });
      this.tone(f * 1.5, 0.2, { type: 'sine', vol: 0.02, slide: 0.7, delay: d, attack: 0.03 });
    }
  }

  coqui() {
    this.tone(1150, 0.12, { type: 'sine', vol: 0.06 });
    this.tone(1950, 0.18, { type: 'sine', vol: 0.06, delay: 0.14, slide: 1.08 });
  }

  startAmbience() {
    const c = this.ctx;
    // looping surf: filtered noise with slow swells
    const n = c.sampleRate * 4;
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = last * 6; }
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0.12;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 0.08;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(); lfo.start();
    this.surf = g;
    setInterval(() => { if (Math.random() < 0.35) this.coqui(); }, 7000);
    setInterval(() => { if (Math.random() < 0.4) this.gull(); }, 9000);
  }
}
