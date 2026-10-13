export interface AudioEnv {
  wind: number; // 0..1
  rain: number; // 0..1
  night: number; // 0..1
  sea: number; // 0..1
  speed: number; // 0..1
  inMenu: boolean;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  [38, 57, 61, 64, 66], // Dmaj9
  [35, 54, 57, 62, 64], // Bm11
  [43, 59, 62, 66, 69], // Gmaj9
  [33, 52, 59, 61, 64], // A6/9
];
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private seaGain!: GainNode;
  vols = { master: 0.8, music: 0.6, sfx: 0.8 };
  private chordT = 0;
  private chordIdx = 0;
  private noteT = 2;
  private cricketT = 0;
  private birdT = 3;
  private lastNote = 4;
  private env: AudioEnv = { wind: 0, rain: 0, night: 0, sea: 0, speed: 0, inMenu: true };

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);

    // reverb impulse
    const len = ctx.sampleRate * 3;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb);
    const rg = ctx.createGain();
    rg.gain.value = 0.7;
    this.reverb.connect(rg).connect(this.musicBus);

    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // ambient loops
    const loop = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      s.start();
      return s;
    };
    const w = loop();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    w.connect(this.windFilter).connect(this.windGain).connect(this.ambBus);

    const r = loop();
    const rf = ctx.createBiquadFilter();
    rf.type = "highpass";
    rf.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    r.connect(rf).connect(this.rainGain).connect(this.ambBus);

    const sNoise = loop();
    const sf = ctx.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.value = 600;
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = 0;
    sNoise.connect(sf).connect(this.seaGain).connect(this.ambBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(sf.frequency);
    lfo.start();

    this.applyVolumes();
    this.ambBus.gain.value = 1;
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vols = { master, music, sfx };
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vols.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(Math.max(this.vols.sfx, 0.0001), t, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === "running") void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume(); }

  // ---------- primitives ----------
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, opts: { slide?: number; attack?: number; bus?: GainNode; delay?: number; send?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(opts.bus ?? this.sfxBus);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, gain: number, opts: { q?: number; slide?: number; attack?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + dur + 0.05);
  }

  // ---------- sfx ----------
  step(surface: "grass" | "sand" | "snow" | "rock" | "water", sprint: boolean) {
    const v = (sprint ? 0.2 : 0.14) * (0.8 + Math.random() * 0.4);
    switch (surface) {
      case "grass": this.noise(0.09, "lowpass", 900 + Math.random() * 300, v); break;
      case "sand": this.noise(0.12, "bandpass", 1600, v * 0.8, { q: 0.5 }); break;
      case "snow": this.noise(0.14, "highpass", 2500, v * 0.5); this.noise(0.08, "lowpass", 500, v * 0.5); break;
      case "rock": this.noise(0.05, "bandpass", 2200, v * 0.8, { q: 2 }); break;
      case "water": this.noise(0.18, "bandpass", 1200, v * 0.9, { q: 0.8 }); break;
    }
  }
  jump() { this.noise(0.12, "bandpass", 700, 0.12, { slide: 1800 }); this.tone(300, 0.15, "sine", 0.05, { slide: 520 }); }
  land(power: number) { this.noise(0.18, "lowpass", 500, 0.12 + power * 0.25); }
  splash() { this.noise(0.45, "bandpass", 1100, 0.3, { q: 0.7, slide: 400 }); }
  glideOpen() { this.noise(0.5, "bandpass", 400, 0.18, { slide: 1500, attack: 0.12 }); this.tone(660, 0.4, "sine", 0.04, { slide: 990, send: 0.5 }); }
  pickup(n: number) {
    const base = [74, 76, 78, 81, 83][n % 5];
    [0, 4, 7, 12].forEach((iv, i) => this.tone(mtof(base + iv), 0.45, "sine", 0.1, { delay: i * 0.055, send: 0.8 }));
    this.tone(mtof(base + 24), 0.6, "triangle", 0.03, { delay: 0.2, send: 1 });
  }
  beacon() {
    const root = 50;
    [0, 7, 12, 16, 19, 24].forEach((iv, i) => {
      this.tone(mtof(root + iv), 3.6, "sine", 0.12, { attack: 0.5 + i * 0.2, delay: i * 0.18, send: 1 });
      this.tone(mtof(root + iv + 12), 3, "triangle", 0.03, { attack: 0.6, delay: i * 0.18, send: 1 });
    });
    this.noise(2.5, "bandpass", 300, 0.2, { slide: 3000, attack: 1.2 });
  }
  stone() {
    [0, 7].forEach((iv, i) => this.tone(mtof(72 + iv), 2.4, "sine", 0.09, { delay: i * 0.12, send: 1.2 }));
    this.tone(mtof(84), 2.8, "triangle", 0.025, { delay: 0.2, send: 1.2 });
  }
  click() { this.tone(900, 0.06, "square", 0.025); }
  hover() { this.tone(1300, 0.04, "sine", 0.02); }
  thunder() { this.noise(2.6, "lowpass", 220, 0.5, { attack: 0.15, slide: 60 }); }
  whoosh() { this.noise(1.2, "bandpass", 300, 0.15, { slide: 2000, attack: 0.5 }); }
  spire() {
    [0, 7, 12, 19, 24, 28].forEach((iv, i) => this.tone(mtof(38 + iv), 8, "sine", 0.13, { attack: 2 + i * 0.3, delay: i * 0.4, send: 1.4 }));
    [12, 19, 24, 31, 36].forEach((iv, i) => this.tone(mtof(50 + iv), 6, "triangle", 0.04, { attack: 1.5, delay: 1 + i * 0.5, send: 1.4 }));
  }

  // ---------- music + ambience ----------
  update(dt: number, env: AudioEnv) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.env = env;
    const t = ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.025 + env.wind * 0.22 + env.rain * 0.05, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(350 + env.wind * 900 + env.speed * 600, t, 0.3);
    this.rainGain.gain.setTargetAtTime(env.rain * 0.14, t, 0.6);
    this.seaGain.gain.setTargetAtTime(env.sea * 0.2, t, 0.6);

    // pad chords
    this.chordT -= dt;
    if (this.chordT <= 0) {
      this.chordT = 12 + Math.random() * 2;
      this.chordIdx = (this.chordIdx + 1) % CHORDS.length;
      const ch = CHORDS[this.chordIdx];
      const dim = 1 - env.rain * 0.3;
      ch.forEach((n, i) => {
        const lvl = (i === 0 ? 0.08 : 0.035) * dim;
        const nn = env.night > 0.5 && i > 0 ? n - 12 : n;
        this.padVoice(mtof(nn), 15, lvl);
      });
    }

    // pluck melody
    this.noteT -= dt;
    if (this.noteT <= 0) {
      const night = env.night;
      this.noteT = (env.inMenu ? 2.2 : 3.2) + Math.random() * 3.5 + night * 2 + env.rain * 2;
      let idx = this.lastNote + Math.floor(Math.random() * 5) - 2;
      idx = Math.max(0, Math.min(PENTA.length - 1, idx));
      this.lastNote = idx;
      const m = PENTA[idx] - (night > 0.5 ? 12 : 0);
      this.pluck(mtof(m), 0.09);
      if (Math.random() < 0.3) this.pluck(mtof(m + 7), 0.045, 0.25);
    }

    // crickets at night
    if (env.night > 0.3) {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricketT = 0.5 + Math.random() * 0.8;
        const f = 4200 + Math.random() * 500;
        for (let i = 0; i < 3; i++) this.tone(f, 0.04, "sine", 0.012 * env.night * (1 - env.rain), { delay: i * 0.07, bus: this.ambBus });
      }
    } else if (env.rain < 0.3) {
      // birds by day
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 2.5 + Math.random() * 6;
        const f = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.tone(f * (1 + (i % 2) * 0.2), 0.11, "sine", 0.02, { slide: f * (1.15 + Math.random() * 0.3), delay: i * 0.13, bus: this.ambBus });
        }
      }
    }
  }

  private padVoice(freq: number, dur: number, gain: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 4.5);
    g.gain.setValueAtTime(gain, t0 + dur - 5);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    f.connect(g);
    g.connect(this.musicBus);
    const s = ctx.createGain();
    s.gain.value = 0.9;
    g.connect(s).connect(this.reverbSend);
    [-6, 6].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t0);
      o.stop(t0 + dur + 0.1);
    });
  }

  private pluck(freq: number, gain: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3500, t0);
    f.frequency.exponentialRampToValueAtTime(500, t0 + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    o.connect(f).connect(g);
    g.connect(this.musicBus);
    // echo
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    g.connect(d);
    d.connect(fb).connect(d);
    const dg = ctx.createGain();
    dg.gain.value = 0.55;
    d.connect(dg).connect(this.musicBus);
    dg.connect(this.reverbSend);
    g.connect(this.reverbSend);
    o.start(t0);
    o.stop(t0 + 2.4);
    // tidy the feedback loop later
    window.setTimeout(() => { try { d.disconnect(); fb.disconnect(); } catch { /* ignore */ } }, 6000);
  }

  get envState() { return this.env; }
}
