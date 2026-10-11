// Todos os sons do ECO são sintetizados em tempo real com Web Audio (sem arquivos, sem licenças de terceiros).

type ToneOpts = {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  gain?: number;
  attack?: number;
  when?: number;
  pan?: number;
  filter?: number;
  filterEnd?: number;
  q?: number;
  detune?: number;
  bus?: 'sfx' | 'music';
  curve?: 'exp' | 'lin';
};

type NoiseOpts = {
  dur: number;
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  when?: number;
  pan?: number;
  attack?: number;
  bus?: 'sfx' | 'music';
};

export type MusicTheme = { root: number; scale: number[]; bpm: number };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private comp!: WaveShaperNode;
  private noiseBuf!: AudioBuffer;
  private seqTimer: number | null = null;
  private nextNoteT = 0;
  private step = 0;
  bar = 0;
  theme: MusicTheme = { root: 45, scale: [0, 3, 5, 7, 10], bpm: 118 };
  mode: 'menu' | 'game' | 'off' = 'off';
  intensity = 0;
  vol = { master: 0.8, music: 0.55, sfx: 0.85, muted: false };

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.attach(new AC());
    }
    if (this.ctx!.state === 'suspended') (this.ctx as AudioContext).resume().catch(() => {});
  }

  /** Monta o grafo de áudio em qualquer contexto (tempo real ou offline para exportar .wav). */
  attach(c: BaseAudioContext) {
    {
      this.ctx = c;
      // limitador suave (tanh): linear em volumes normais, evita estouro quando tudo toca junto
      this.comp = c.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.6);
      this.comp.curve = curve;
      this.master = c.createGain();
      this.musicBus = c.createGain();
      this.sfxBus = c.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(c.destination);
      const len = c.sampleRate * 1.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.master.gain.value = this.vol.muted ? 0 : this.vol.master;
      this.musicBus.gain.value = this.vol.music * 0.5;
      this.sfxBus.gain.value = this.vol.sfx;
    }
  }

  suspend() {
    (this.ctx as AudioContext | null)?.suspend?.().catch(() => {});
  }
  resume() {
    (this.ctx as AudioContext | null)?.resume?.().catch(() => {});
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : this.vol.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private out(pan: number | undefined, bus: 'sfx' | 'music' = 'sfx'): AudioNode {
    const c = this.ctx!;
    const target = bus === 'music' ? this.musicBus : this.sfxBus;
    if (pan === undefined || !c.createStereoPanner) return target;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(target);
    return p;
  }

  tone(o: ToneOpts) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = o.when ?? c.currentTime;
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.detune) osc.detune.value = o.detune;
    if (o.freqEnd) {
      if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.freqEnd, t0 + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + o.dur);
    }
    const g = c.createGain();
    const peak = o.gain ?? 0.3;
    const att = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.filter, t0);
      if (o.filterEnd) f.frequency.exponentialRampToValueAtTime(o.filterEnd, t0 + o.dur);
      f.Q.value = o.q ?? 1;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.out(o.pan, o.bus));
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  noise(o: NoiseOpts) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = o.when ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1500, t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(o.pan, o.bus));
    src.start(t0, Math.random());
    src.stop(t0 + o.dur + 0.05);
  }

  // ============================================================ efeitos
  click() {
    this.tone({ type: 'triangle', freq: 1400, freqEnd: 900, dur: 0.06, gain: 0.18 });
  }
  hover() {
    this.tone({ type: 'sine', freq: 2200, dur: 0.03, gain: 0.05 });
  }
  tick(n: number) {
    this.tone({ type: 'square', freq: n <= 1 ? 1320 : 880, dur: 0.12, gain: 0.12, filter: 3000 });
  }
  go() {
    const t = this.now;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.18, gain: 0.12, when: t + i * 0.05, filter: 4000 }));
    this.noise({ dur: 0.4, gain: 0.12, type: 'highpass', freq: 3000, when: t });
  }
  pickup(pan?: number, golden = false) {
    const t = this.now;
    const base = golden ? 1046 : 880;
    this.tone({ type: 'sine', freq: base, freqEnd: base * 1.5, dur: 0.12, gain: 0.2, pan });
    this.tone({ type: 'triangle', freq: base * 2, dur: 0.1, gain: 0.08, when: t + 0.05, pan });
    if (golden) [1318, 1568, 2093].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.3, gain: 0.12, when: t + 0.08 + i * 0.07, pan }));
  }
  lucky(pan?: number) {
    const t = this.now;
    [1568, 2093].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.15, gain: 0.12, when: t + 0.1 + i * 0.06, pan }));
  }
  deliver(count: number, pan?: number) {
    const t = this.now;
    const notes = [0, 4, 7, 12, 16].slice(0, 2 + count);
    notes.forEach((n, i) => {
      this.tone({ type: 'triangle', freq: mtof(72 + n), dur: 0.35, gain: 0.16, when: t + i * 0.06, pan });
      this.tone({ type: 'sine', freq: mtof(60 + n), dur: 0.4, gain: 0.12, when: t + i * 0.06, pan });
    });
    this.noise({ dur: 0.5, gain: 0.08, type: 'highpass', freq: 5000, when: t + 0.05, pan });
  }
  dash(pan?: number) {
    this.noise({ dur: 0.22, gain: 0.25, type: 'bandpass', freq: 600, freqEnd: 3500, q: 2, pan });
    this.tone({ type: 'sine', freq: 200, freqEnd: 500, dur: 0.15, gain: 0.08, pan });
  }
  hit(pan?: number, own = false) {
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.3, gain: 0.25, filter: 1600, pan });
    this.noise({ dur: 0.25, gain: 0.3, type: 'lowpass', freq: 2200, freqEnd: 300, pan });
    if (own) {
      // timbre "invertido" característico do próprio Eco
      const t = this.now;
      this.tone({ type: 'sine', freq: 300, freqEnd: 900, dur: 0.25, gain: 0.12, when: t + 0.08, pan });
    }
  }
  fall(pan?: number) {
    this.tone({ type: 'sine', freq: 800, freqEnd: 120, dur: 0.6, gain: 0.2, pan });
    this.noise({ dur: 0.5, gain: 0.1, type: 'bandpass', freq: 1200, freqEnd: 200, pan });
  }
  eliminated() {
    const t = this.now;
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.22, gain: 0.1, when: t + i * 0.12, filter: 1800 }));
  }
  echoSpawn() {
    const t = this.now;
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: mtof(84 + [0, 7, 12, 19, 24, 31][i]), dur: 0.9, gain: 0.04, when: t + i * 0.05, attack: 0.08 });
    this.noise({ dur: 1.1, gain: 0.05, type: 'bandpass', freq: 6000, freqEnd: 2000, q: 4, attack: 0.3 });
  }
  /** "gravando": dois bipes de fita + clique. */
  recordSave() {
    const t = this.now;
    this.tone({ type: 'square', freq: 1760, dur: 0.06, gain: 0.08, when: t, filter: 5000 });
    this.tone({ type: 'square', freq: 1760, dur: 0.06, gain: 0.08, when: t + 0.12, filter: 5000 });
    this.noise({ dur: 0.04, gain: 0.25, type: 'highpass', freq: 2000, when: t + 0.25 });
  }
  /** efeito invertido curto na transição (rebobinar) */
  rewind() {
    const t = this.now + 0.3;
    this.noise({ dur: 1.7, gain: 0.16, type: 'bandpass', freq: 400, freqEnd: 5000, q: 3, when: t, attack: 1.2 });
    this.tone({ type: 'sawtooth', freq: 90, freqEnd: 900, dur: 1.7, gain: 0.07, filter: 800, filterEnd: 5000, when: t, attack: 1.3 });
    for (let i = 0; i < 14; i++) this.tone({ type: 'square', freq: 2000 - i * 90, dur: 0.03, gain: 0.03, when: t + i * 0.11, filter: 4000 });
  }
  echoExpired() {
    this.noise({ dur: 0.9, gain: 0.1, type: 'bandpass', freq: 3000, freqEnd: 300, q: 6 });
    this.tone({ type: 'sine', freq: 660, freqEnd: 220, dur: 0.9, gain: 0.06 });
  }
  disrupt(pan?: number) {
    const t = this.now;
    for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', freq: 2000 + Math.random() * 3000, dur: 0.12, gain: 0.05, when: t + i * 0.025, pan });
    this.noise({ dur: 0.2, gain: 0.12, type: 'highpass', freq: 4000, pan });
  }
  hazardWarn(pan?: number) {
    const t = this.now;
    for (let i = 0; i < 3; i++) this.tone({ type: 'square', freq: 740, dur: 0.11, gain: 0.07, when: t + i * 0.22, filter: 2500, pan });
  }
  hazardOn(pan?: number) {
    this.noise({ dur: 0.5, gain: 0.18, type: 'bandpass', freq: 3000, q: 0.8, pan });
    this.tone({ type: 'sawtooth', freq: 110, dur: 0.5, gain: 0.08, filter: 900, pan });
  }
  piston(pan?: number) {
    this.tone({ type: 'sine', freq: 120, freqEnd: 40, dur: 0.25, gain: 0.35, pan });
    this.noise({ dur: 0.15, gain: 0.2, type: 'lowpass', freq: 900, pan });
  }
  bridgeWarn(pan?: number) {
    const t = this.now;
    this.tone({ type: 'triangle', freq: 520, dur: 0.1, gain: 0.06, pan, when: t });
    this.tone({ type: 'triangle', freq: 390, dur: 0.14, gain: 0.06, pan, when: t + 0.12 });
  }
  portal(pan?: number) {
    this.tone({ type: 'sine', freq: 300, freqEnd: 1600, dur: 0.25, gain: 0.12, pan });
    this.tone({ type: 'sine', freq: 1600, freqEnd: 400, dur: 0.25, gain: 0.08, pan, when: this.now + 0.12 });
  }
  coreWarn() {
    const t = this.now;
    [0, 0.25, 0.5].forEach((d) => this.tone({ type: 'sine', freq: 988, dur: 0.15, gain: 0.1, when: t + d }));
  }
  coreMove() {
    this.tone({ type: 'triangle', freq: 330, freqEnd: 990, dur: 0.4, gain: 0.14 });
  }
  goldenWarn() {
    const t = this.now;
    [1568, 1976, 2349].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.25, gain: 0.07, when: t + i * 0.09 }));
  }
  objective() {
    const t = this.now;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.14, gain: 0.07, when: t + i * 0.07, filter: 3500 }));
  }
  /** timbre distinto para cada habilidade */
  ability(id: string, pan?: number) {
    const t = this.now;
    switch (id) {
      case 'turbo':
        this.tone({ type: 'sawtooth', freq: 160, freqEnd: 1200, dur: 0.4, gain: 0.12, filter: 900, filterEnd: 6000, pan });
        this.noise({ dur: 0.4, gain: 0.1, type: 'bandpass', freq: 800, freqEnd: 4000, pan });
        break;
      case 'fase':
        for (let i = 0; i < 4; i++) this.tone({ type: 'sine', freq: 600 + i * 220, freqEnd: 300, dur: 0.6, gain: 0.06, when: t + i * 0.04, pan, detune: i * 13 });
        break;
      case 'escudo':
        [523, 1046, 1568, 2637].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.9 - i * 0.15, gain: 0.1 / (i + 1), pan }));
        this.tone({ type: 'triangle', freq: 261, dur: 0.3, gain: 0.12, pan });
        break;
      case 'teleporte':
        this.tone({ type: 'square', freq: 1800, freqEnd: 200, dur: 0.12, gain: 0.08, filter: 5000, pan });
        this.tone({ type: 'square', freq: 200, freqEnd: 1800, dur: 0.12, gain: 0.08, filter: 5000, pan, when: t + 0.1 });
        break;
      case 'explosao':
        this.tone({ type: 'sine', freq: 140, freqEnd: 35, dur: 0.6, gain: 0.45, pan });
        this.noise({ dur: 0.7, gain: 0.35, type: 'lowpass', freq: 3000, freqEnd: 120, pan });
        break;
      case 'sombra':
        this.tone({ type: 'sine', freq: 500, freqEnd: 80, dur: 0.35, gain: 0.14, pan });
        this.noise({ dur: 0.3, gain: 0.12, type: 'bandpass', freq: 3000, freqEnd: 400, q: 4, pan });
        break;
      case 'torreta':
        [0, 0.07, 0.14].forEach((d) => this.tone({ type: 'square', freq: 300, freqEnd: 600, dur: 0.06, gain: 0.07, filter: 2500, pan, when: t + d }));
        this.tone({ type: 'triangle', freq: 880, dur: 0.25, gain: 0.08, pan, when: t + 0.22 });
        break;
      case 'cura':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.4, gain: 0.08, when: t + i * 0.07, pan }));
        break;
      case 'investida':
        this.noise({ dur: 0.45, gain: 0.3, type: 'lowpass', freq: 900, freqEnd: 200, pan });
        this.tone({ type: 'sawtooth', freq: 90, freqEnd: 50, dur: 0.4, gain: 0.25, filter: 600, pan });
        break;
      case 'muralha':
        for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', freq: 1800 + i * 300, freqEnd: 900, dur: 0.18, gain: 0.06, when: t + i * 0.03, pan });
        this.noise({ dur: 0.4, gain: 0.18, type: 'highpass', freq: 3000, pan });
        this.tone({ type: 'sine', freq: 120, freqEnd: 80, dur: 0.3, gain: 0.2, pan });
        break;
      case 'raio':
        this.noise({ dur: 0.35, gain: 0.35, type: 'bandpass', freq: 2500, freqEnd: 6000, q: 1, pan });
        this.tone({ type: 'square', freq: 1600, freqEnd: 120, dur: 0.3, gain: 0.08, filter: 5000, pan });
        this.noise({ dur: 0.2, gain: 0.25, type: 'highpass', freq: 5000, when: t + 0.08, pan });
        break;
      case 'gravidade':
        this.tone({ type: 'sine', freq: 300, freqEnd: 40, dur: 1.4, gain: 0.25, pan });
        this.tone({ type: 'sawtooth', freq: 80, freqEnd: 30, dur: 1.4, gain: 0.08, filter: 300, pan });
        break;
      case 'gancho':
        this.tone({ type: 'square', freq: 900, freqEnd: 300, dur: 0.15, gain: 0.07, filter: 3000, pan });
        this.noise({ dur: 0.12, gain: 0.15, type: 'bandpass', freq: 3500, when: t + 0.12, pan });
        break;
      case 'fumaca':
        this.noise({ dur: 0.9, gain: 0.3, type: 'lowpass', freq: 1800, freqEnd: 300, pan });
        this.tone({ type: 'sine', freq: 200, freqEnd: 90, dur: 0.25, gain: 0.15, pan });
        break;
      case 'clone':
        [0, 7, 12, 19, 24].forEach((n, i) => this.tone({ type: 'square', freq: mtof(76 + n), dur: 0.08, gain: 0.06, when: t + i * 0.045, filter: 4000, pan }));
        break;
    }
  }
  /** tiro de cada arma (eco = timbre abafado) */
  shoot(weapon: string, pan?: number, mine = true) {
    const g = mine ? 1 : 0.55;
    const f = mine ? 1 : 0.6;
    switch (weapon) {
      case 'metralhadora':
        this.tone({ type: 'square', freq: 520 * f, freqEnd: 180, dur: 0.05, gain: 0.05 * g, filter: 2600, pan });
        this.noise({ dur: 0.04, gain: 0.07 * g, type: 'highpass', freq: 2500, pan });
        break;
      case 'escopeta':
        this.noise({ dur: 0.22, gain: 0.3 * g, type: 'lowpass', freq: 4000 * f, freqEnd: 300, pan });
        this.tone({ type: 'sine', freq: 140, freqEnd: 50, dur: 0.18, gain: 0.2 * g, pan });
        break;
      case 'laser':
        this.tone({ type: 'sawtooth', freq: 2200 * f, freqEnd: 300, dur: 0.28, gain: 0.09 * g, filter: 6000, filterEnd: 900, pan });
        this.tone({ type: 'sine', freq: 1200 * f, freqEnd: 2400, dur: 0.2, gain: 0.06 * g, pan });
        break;
      case 'torreta':
        this.tone({ type: 'square', freq: 900, freqEnd: 400, dur: 0.05, gain: 0.04 * g, filter: 3000, pan });
        break;
      case 'foguete':
        this.noise({ dur: 0.5, gain: 0.25 * g, type: 'bandpass', freq: 800, freqEnd: 2500, q: 1.5, pan });
        this.tone({ type: 'sawtooth', freq: 150, freqEnd: 300, dur: 0.4, gain: 0.08 * g, filter: 900, pan });
        break;
      case 'congelante':
        this.tone({ type: 'sine', freq: 2600 * f, freqEnd: 1400, dur: 0.1, gain: 0.05 * g, pan });
        this.noise({ dur: 0.08, gain: 0.05 * g, type: 'highpass', freq: 6000, pan });
        break;
      default:
        this.tone({ type: 'square', freq: 980 * f, freqEnd: 260, dur: 0.08, gain: 0.07 * g, filter: 3500, pan });
        this.noise({ dur: 0.05, gain: 0.05 * g, type: 'bandpass', freq: 3000, pan });
    }
  }
  bombThrow(pan?: number) {
    this.tone({ type: 'sine', freq: 300, freqEnd: 700, dur: 0.2, gain: 0.08, pan });
  }
  explode(pan?: number, big = true) {
    this.tone({ type: 'sine', freq: big ? 120 : 160, freqEnd: 30, dur: 0.7, gain: big ? 0.5 : 0.35, pan });
    this.noise({ dur: 0.8, gain: big ? 0.4 : 0.3, type: 'lowpass', freq: 3500, freqEnd: 100, pan });
  }
  heal(pan?: number) {
    [784, 988, 1318].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.3, gain: 0.06, when: this.now + i * 0.06, pan }));
  }
  kill(mine: boolean) {
    const t = this.now;
    (mine ? [659, 880, 1318] : [440, 330]).forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.18, gain: 0.1, when: t + i * 0.08 }));
  }
  powerSpawn(pan?: number) {
    const t = this.now;
    [1318, 1760].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.2, gain: 0.06, when: t + i * 0.08, pan }));
  }
  /** cada poder tem seu som ao ser pego */
  power(kind: string, pan?: number) {
    const t = this.now;
    switch (kind) {
      case 'escudo':
        [523, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.5, gain: 0.12, when: t + i * 0.05, pan }));
        break;
      case 'ima':
        this.tone({ type: 'sawtooth', freq: 120, freqEnd: 480, dur: 0.45, gain: 0.08, filter: 1200, pan });
        this.tone({ type: 'sine', freq: 880, freqEnd: 1760, dur: 0.3, gain: 0.08, pan, when: t + 0.1 });
        break;
      case 'gelo':
        for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 2400 + i * 260, dur: 0.35, gain: 0.05, when: t + i * 0.04, pan });
        this.noise({ dur: 0.6, gain: 0.08, type: 'highpass', freq: 6000, pan });
        break;
      case 'turbo':
        this.tone({ type: 'sawtooth', freq: 200, freqEnd: 1400, dur: 0.35, gain: 0.1, filter: 3000, pan });
        break;
      case 'dobro':
        [659, 988, 1318, 1976].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.15, gain: 0.07, when: t + i * 0.06, filter: 4000, pan }));
        break;
      case 'invisivel':
        for (let i = 0; i < 4; i++) this.tone({ type: 'sine', freq: 1400 - i * 250, dur: 0.3, gain: 0.05, when: t + i * 0.05, pan, detune: i * 20 });
        break;
      case 'vampiro':
        [220, 207, 196].forEach((f, i) => this.tone({ type: 'sawtooth', freq: f, dur: 0.35, gain: 0.07, filter: 900, when: t + i * 0.12, pan }));
        break;
      case 'metralhadora':
      case 'escopeta':
      case 'laser':
      case 'foguete':
      case 'congelante':
        this.tone({ type: 'square', freq: 200, freqEnd: 800, dur: 0.15, gain: 0.08, filter: 2500, pan });
        this.noise({ dur: 0.1, gain: 0.1, type: 'highpass', freq: 3000, pan, when: t + 0.12 });
        break;
      case 'bomba':
      case 'mina':
        this.tone({ type: 'triangle', freq: 330, dur: 0.12, gain: 0.1, pan });
        this.tone({ type: 'triangle', freq: 220, dur: 0.18, gain: 0.1, pan, when: t + 0.1 });
        break;
      case 'cura':
        this.heal(pan);
        break;
      case 'apagar':
        this.tone({ type: 'sine', freq: 900, freqEnd: 90, dur: 0.6, gain: 0.16, pan });
        this.noise({ dur: 0.5, gain: 0.15, type: 'bandpass', freq: 2500, freqEnd: 200, q: 3, pan });
        break;
    }
  }
  victory() {
    const t = this.now;
    const mel = [0, 4, 7, 12, 7, 12, 16, 19];
    mel.forEach((n, i) => {
      this.tone({ type: 'square', freq: mtof(67 + n), dur: 0.22, gain: 0.08, when: t + i * 0.12, filter: 4000 });
      this.tone({ type: 'triangle', freq: mtof(55 + n), dur: 0.25, gain: 0.1, when: t + i * 0.12 });
    });
    this.noise({ dur: 1.2, gain: 0.08, type: 'highpass', freq: 6000, when: t + 0.9, attack: 0.05 });
  }
  defeat() {
    const t = this.now;
    [7, 5, 3, 0].forEach((n, i) => this.tone({ type: 'triangle', freq: mtof(64 + n), dur: 0.4, gain: 0.12, when: t + i * 0.2 }));
  }

  // ============================================================ música
  playMusic(mode: 'menu' | 'game', theme?: MusicTheme) {
    if (!this.ctx) return;
    if (theme) this.theme = theme;
    if (this.mode === mode && this.seqTimer !== null) return;
    this.mode = mode;
    this.step = 0;
    this.bar = 0;
    this.nextNoteT = this.ctx.currentTime + 0.08;
    if (this.seqTimer === null) this.seqTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.mode = 'off';
    if (this.seqTimer !== null) {
      clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
  }

  private schedule() {
    if (!this.ctx || this.mode === 'off') return;
    if (this.ctx.state !== 'running') return;
    const bpm = this.mode === 'menu' ? 96 : this.theme.bpm + this.intensity * 14;
    const stepDur = 60 / bpm / 4;
    while (this.nextNoteT < this.ctx.currentTime + 0.12) {
      if (this.nextNoteT < this.ctx.currentTime - 0.2) this.nextNoteT = this.ctx.currentTime + 0.02;
      this.playStep(this.step, this.nextNoteT, stepDur);
      this.nextNoteT += stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  playStep(s: number, t: number, sd: number) {
    const th = this.theme;
    const prog = [0, 8, 3, 10];
    const chord = th.root + prog[this.bar % 4] - (prog[this.bar % 4] > 6 ? 12 : 0);
    const m = 'music' as const;
    if (this.mode === 'menu') {
      if (s === 0) {
        [0, 3, 7, 10, 14].forEach((n, i) =>
          this.tone({ type: 'sine', freq: mtof(chord + 12 + n), dur: sd * 16, gain: 0.035, attack: 0.6, when: t, bus: m, detune: (i - 2) * 6 }),
        );
        this.tone({ type: 'triangle', freq: mtof(chord - 12), dur: sd * 14, gain: 0.08, attack: 0.3, when: t, bus: m });
      }
      if (s % 3 === 0) {
        const sc = th.scale;
        const n = sc[(s / 3 + this.bar) % sc.length];
        this.tone({ type: 'triangle', freq: mtof(chord + 24 + n), dur: sd * 2.5, gain: 0.03, when: t, bus: m, filter: 2500 });
      }
      return;
    }
    const I = this.intensity;
    // bumbo
    if (s % 4 === 0 || (I > 0.6 && s === 14)) {
      this.tone({ type: 'sine', freq: 150, freqEnd: 45, dur: 0.22, gain: 0.5, when: t, bus: m });
    }
    // palma/caixa
    if (s === 4 || s === 12) this.noise({ dur: 0.14, gain: 0.16, type: 'bandpass', freq: 1800, q: 0.7, when: t, bus: m });
    // chimbal
    if (s % 4 === 2 || (I > 0.3 && s % 2 === 1)) this.noise({ dur: 0.04, gain: 0.07 + I * 0.03, type: 'highpass', freq: 7000, when: t, bus: m });
    // baixo
    const bassSteps = [0, 3, 6, 8, 11, 14];
    if (bassSteps.includes(s)) {
      const oct = s === 6 || s === 14 ? 12 : 0;
      this.tone({ type: 'sawtooth', freq: mtof(chord - 12 + oct), dur: sd * 1.8, gain: 0.13, when: t, bus: m, filter: 500 + I * 900, q: 4 });
    }
    // arpejo discreto
    if (s % 2 === 0) {
      const tones = [0, 3, 7, 12, 15, 19];
      const n = tones[(s / 2 + this.bar) % tones.length];
      this.tone({ type: 'square', freq: mtof(chord + 12 + n), dur: sd * 1.4, gain: 0.025 + I * 0.02, when: t, bus: m, filter: 1800 + I * 2000 });
    }
    // pad
    if (s === 0) {
      [0, 7, 15].forEach((n) => this.tone({ type: 'sawtooth', freq: mtof(chord + n), dur: sd * 16, gain: 0.018, attack: 0.4, when: t, bus: m, filter: 900 }));
    }
  }
}

export const audio = new AudioEngine();
