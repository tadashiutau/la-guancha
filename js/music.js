// Background music. Plays music/tema.mp3 if it exists (e.g. a Suno track); otherwise a built-in
// plena/salsa loop synthesized live: cuatro-like plucks (Karplus-Strong), bass, clave, güiro,
// maracas and bongos.
const BPM = 108;
const EIGHTH = 60 / BPM / 2;
const SWING = 0.06; // a little lilt on the off-beats

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = s => (s === '-' ? null : 12 * (+s.slice(-1) + 1) + NOTE[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0));
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const bars = str => str.trim().split('|').map(b => b.trim().split(/\s+/).map(midi));

// melody in C, eight eighth-notes per bar ('-' = rest)
const MEL = {
  A: bars(`E5 - G5 E5 D5 - C5 - | A4 - C5 F5 E5 - C5 - | B4 - D5 G5 F5 - D5 B4 | C5 - E5 - C5 - - - |
           E5 G5 E5 G5 C6 - G5 - | A5 - F5 - C5 - A4 C5 | D5 - B4 D5 F5 - E5 D5 | C5 - - G4 C5 - - -`),
  B: bars(`A4 C5 E5 A5 G5 - E5 - | F5 - A5 - G5 F5 E5 - | E5 - G5 - C6 - G5 - | F5 - D5 - B4 - G4 - |
           A4 - E5 - A5 - G5 E5 | F5 - C5 - F5 A5 G5 F5 | D5 F5 B5 - G5 - F5 D5 | C5 - G4 - C5 - - -`),
};
const CHORDS = {
  A: ['C', 'F', 'G7', 'C', 'C', 'F', 'G7', 'C'],
  B: ['Am', 'F', 'C', 'G7', 'Am', 'F', 'G7', 'C'],
};
const VOICING = { C: [60, 64, 67], F: [60, 65, 69], G7: [59, 62, 65, 67], Am: [57, 60, 64] };
const ROOT = { C: 36, F: 41, G7: 43, Am: 45 };
const FORM = ['A', 'A', 'B', 'A'];

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.gain.connect(this.filter);
    this.filter.connect(out);
    this.level = 1;
    this.on = true;
    this.plucks = new Map();
    this.noiseBuf = this.makeNoise(1);
    this.step = 0;
    this.track = null;
    this.tryTrack();
  }

  async tryTrack() {
    try {
      const r = await fetch('music/tema.mp3', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no track');
      const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.track = buf;
    } catch (e) {
      this.track = null;
    }
    this.begin();
  }

  begin() {
    if (this.track) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.track; s.loop = true;
      s.connect(this.gain);
      s.start();
      this.src = s;
    } else {
      this.next = this.ctx.currentTime + 0.15;
      this.timer = setInterval(() => this.tick(), 30);
    }
    this.apply(1.5);
  }

  setOn(on) { this.on = on; this.apply(0.4); }

  apply(fade = 0.3) {
    const v = this.on ? (this.track ? 0.55 : 0.32) * this.level : 0;
    const g = this.gain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + fade);
  }

  // quieter for a moment (mask fanfare)
  duck(secs = 3) {
    this.level = 0.2; this.apply(0.15);
    clearTimeout(this.duckT);
    this.duckT = setTimeout(() => { this.level = 1; this.apply(1.2); }, secs * 1000);
  }

  underwater(on) {
    const f = this.filter.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(on ? 500 : 18000, t, 0.15);
  }

  // ---------------------------------------------------------------- built-in song
  tick() {
    if (!this.on && this.gain.gain.value < 0.001) { this.next = this.ctx.currentTime + 0.1; return; }
    while (this.next < this.ctx.currentTime + 0.25) {
      const odd = this.step % 2 === 1;
      this.play(this.step, this.next + (odd ? SWING * EIGHTH : 0));
      this.next += EIGHTH;
      this.step++;
    }
  }

  play(step, t) {
    const s = step % 8, bar = Math.floor(step / 8) % 32, sec = FORM[Math.floor(bar / 8)], b = bar % 8;
    const round = Math.floor(step / 256); // each time through the song
    const chord = CHORDS[sec][b];
    const note = MEL[sec][b][s];
    const third = Math.floor(bar / 8) === 3; // last A: melody an octave up with a harmony
    if (note != null && !(Math.floor(bar / 8) === 0 && round === 0 && b < 2 && s < 4)) {
      if (sec === 'B') this.flute(hz(note), t, EIGHTH * 1.8, 0.1);
      else this.pluck(note + (third ? 12 : 0), t, 0.34);
      if (third) this.pluck(note - 3, t, 0.12);
    }
    // cuatro strum on the off-beats
    if (s === 2 || s === 5 || (s === 7 && b % 2 === 1)) VOICING[chord].forEach((m, i) => this.pluck(m, t + i * 0.012, 0.09));
    // tumbao bass: anticipated root and fifth
    const r = ROOT[chord];
    if (s === 0 && b === 0) this.bass(hz(r), t, 0.35);
    if (s === 3) this.bass(hz(r + 7), t, 0.3);
    if (s === 6) this.bass(hz(r), t, 0.34);
    // percussion
    const pair = bar % 2;
    if ((pair === 0 && (s === 0 || s === 3 || s === 6)) || (pair === 1 && (s === 2 || s === 4))) this.clave(t);
    this.guiro(t, s % 2 === 0 ? 0.13 : 0.05, s % 2 === 0 ? 0.07 : 0.05);
    this.maraca(t, s % 2 ? 0.05 : 0.03);
    if (s === 0 || s === 4) this.bongo(t, 260, 0.14);
    if (s === 2 || s === 6) this.bongo(t, 390, 0.1);
    if (s === 7) this.bongo(t, 330, 0.08);
    if (s === 6) this.drum(t, 0.2); // pandero seguidor: the plena accent
    if (s === 0 && (b === 0 || b === 4)) this.drum(t, 0.14);
  }

  pluckBuffer(m) {
    let buf = this.plucks.get(m);
    if (buf) return buf;
    const sr = this.ctx.sampleRate, f = hz(m), n = Math.floor(sr * 1.3);
    buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const P = Math.max(2, Math.round(sr / f));
    const ring = new Float32Array(P);
    let last = 0;
    for (let i = 0; i < P; i++) { last = last * 0.4 + (Math.random() * 2 - 1) * 0.6; ring[i] = last; }
    let k = 0;
    const decay = 0.994 + Math.min(0.005, 40 / f / 100);
    for (let i = 0; i < n; i++) {
      const v = ring[k];
      const nx = (k + 1) % P;
      ring[k] = (v + ring[nx]) * 0.5 * decay;
      d[i] = v;
      k = nx;
    }
    this.plucks.set(m, buf);
    return buf;
  }

  pluck(m, t, vol) {
    const c = this.ctx;
    // doubled courses like a cuatro: two strings, the second a hair sharp
    for (const rate of [1, 1.004]) {
      const s = c.createBufferSource();
      s.buffer = this.pluckBuffer(m);
      s.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = vol * 0.6;
      s.connect(g); g.connect(this.gain);
      s.start(t); s.stop(t + 1.3);
    }
  }

  flute(f, t, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = f; o2.frequency.value = f * 2;
    lfo.frequency.value = 5.5; lg.gain.value = f * 0.006;
    lfo.connect(lg); lg.connect(o.frequency);
    const g2 = c.createGain(); g2.gain.value = 0.15;
    o2.connect(g2); g2.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.gain);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  bass(f, t, vol) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = f; o2.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 2.6);
    o.connect(g); o2.connect(g); g.connect(this.gain);
    o.start(t); o2.start(t); o.stop(t + EIGHTH * 3); o2.stop(t + EIGHTH * 3);
  }

  makeNoise(sec) {
    const sr = this.ctx.sampleRate, b = this.ctx.createBuffer(1, sr * sec, sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  noise(t, dur, vol, type, freq, q = 1, am = 0) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g);
    if (am) {
      // güiro ridges: chop the scrape with a fast square wave
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'square'; o.frequency.value = am;
      og.gain.value = 0.5;
      const out = c.createGain(); out.gain.value = 0.5;
      o.connect(og); og.connect(out.gain);
      g.connect(out); out.connect(this.gain);
      o.start(t); o.stop(t + dur + 0.02);
    } else g.connect(this.gain);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  guiro(t, dur, vol) { this.noise(t, dur, vol, 'bandpass', 4200, 2, 55); }
  maraca(t, vol) { this.noise(t, 0.035, vol, 'highpass', 7000); }

  clave(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 2500;
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.07);
  }

  bongo(t, f, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.13);
  }

  drum(t, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.26);
    this.noise(t, 0.05, vol * 0.3, 'bandpass', 1800, 1);
  }
}
