// Cena grande do carrossel de mapas: a arena real inclinada em perspectiva,
// flutuando sobre um cenário do tema (céu, lava, neve, estrelas...), com partículas.
import { ArenaDef, WORLD_H, WORLD_W } from '../game/arenas';
import { Renderer } from '../render/renderer';
import { dpr, hexA } from './portraits';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };

interface Theme {
  sky: [string, string, string];
  under: string;
  particle: (w: number, h: number) => P | null;
  far?: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const THEMES: Record<string, Theme> = {
  lab: { sky: ['#03101a', '#06202a', '#020608'], under: '#0b2a33', particle: (w, h) => ({ x: rnd(0, w), y: h + 4, vx: 0, vy: -rnd(20, 50), life: 0, max: 5, size: rnd(1, 2.4), color: '#3cffc8' }) },
  cidade: {
    sky: ['#5f9bff', '#b3a6ff', '#ffc6a8'],
    under: '#5a3d2a',
    particle: (w, h) => (Math.random() < 0.3 ? { x: -60, y: rnd(0, h), vx: rnd(14, 30), vy: 0, life: 0, max: 30, size: rnd(18, 40), color: 'rgba(255,255,255,0.35)' } : null),
    far: (g, w, h, t) => {
      for (let i = 0; i < 4; i++) {
        const x = ((i * 0.31 + t * 0.01) % 1) * w * 1.2 - w * 0.1;
        const y = h * (0.15 + (i % 2) * 0.12);
        g.fillStyle = 'rgba(90,70,150,0.35)';
        g.beginPath();
        g.moveTo(x - 30, y);
        g.lineTo(x + 30, y);
        g.lineTo(x + 8, y + 26);
        g.lineTo(x - 6, y + 22);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(120,220,140,0.35)';
        g.fillRect(x - 30, y - 4, 60, 5);
      }
      // nave ao longe
      const sx = ((t * 0.04) % 1.3) * w - w * 0.15;
      g.fillStyle = 'rgba(40,30,80,0.6)';
      g.beginPath();
      g.ellipse(sx, h * 0.1, 10, 3, 0, 0, Math.PI * 2);
      g.fill();
    },
  },
  templo: { sky: ['#1a0c04', '#3a2210', '#0c0602'], under: '#3a2412', particle: (w, h) => ({ x: rnd(0, w), y: rnd(0, h), vx: rnd(-5, 5), vy: rnd(-8, -2), life: 0, max: 4, size: rnd(1, 2), color: '#ffcf6b' }) },
  fabrica: { sky: ['#140a06', '#2a1610', '#060302'], under: '#2a1d16', particle: (w, h) => ({ x: rnd(0, w), y: rnd(h * 0.3, h), vx: rnd(-60, 60), vy: rnd(-80, -20), life: 0, max: 0.8, size: rnd(1, 2), color: '#ffb35c' }) },
  floresta: { sky: ['#030612', '#0a1a2a', '#020308'], under: '#16213a', particle: (w, h) => ({ x: rnd(0, w), y: rnd(0, h), vx: rnd(-8, 8), vy: rnd(-8, 8), life: 0, max: 3, size: rnd(1.2, 2.6), color: ['#59ffd0', '#7a6bff', '#ff5df0', '#9dff5c'][Math.floor(Math.random() * 4)] }) },
  espaco: {
    sky: ['#05030f', '#140a30', '#020108'],
    under: '#251c4d',
    particle: (w, h) => (Math.random() < 0.15 ? { x: rnd(0, w), y: rnd(0, h * 0.5), vx: rnd(150, 300), vy: rnd(60, 120), life: 0, max: 0.6, size: 1.5, color: '#ffffff' } : null),
    far: (g, w, h, t) => {
      const gr = g.createRadialGradient(w * 0.82, h * 0.2, 2, w * 0.82, h * 0.2, h * 0.22);
      gr.addColorStop(0, '#ffb0f0');
      gr.addColorStop(0.6, '#8a3cc0');
      gr.addColorStop(1, 'rgba(138,60,192,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(w * 0.82, h * 0.2, h * 0.22, 0, Math.PI * 2);
      g.fill();
      void t;
    },
  },
  vulcao: {
    sky: ['#1a0402', '#4a0e04', '#0a0201'],
    under: '#2a1410',
    particle: (w, h) => ({ x: rnd(0, w), y: h + 4, vx: rnd(-20, 20), vy: -rnd(40, 110), life: 0, max: 3, size: rnd(1.2, 3), color: Math.random() < 0.5 ? '#ffb347' : '#ff4a10' }),
    far: (g, w, h, t) => {
      g.fillStyle = '#1a0806';
      g.beginPath();
      g.moveTo(w * 0.55, h * 0.55);
      g.lineTo(w * 0.72, h * 0.12);
      g.lineTo(w * 0.8, h * 0.12);
      g.lineTo(w * 1.05, h * 0.55);
      g.closePath();
      g.fill();
      const glow = 0.6 + 0.3 * Math.sin(t * 2);
      const gr = g.createRadialGradient(w * 0.76, h * 0.12, 1, w * 0.76, h * 0.12, h * 0.2);
      gr.addColorStop(0, `rgba(255,160,40,${glow})`);
      gr.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(w * 0.76, h * 0.12, h * 0.2, 0, Math.PI * 2);
      g.fill();
    },
  },
  gelo: {
    sky: ['#1a3050', '#5a82b0', '#0c1626'],
    under: '#7f9cbc',
    particle: (w) => ({ x: rnd(-20, w), y: -6, vx: rnd(10, 30), vy: rnd(30, 60), life: 0, max: 8, size: rnd(1.2, 3), color: '#ffffff' }),
    far: (g, w, h) => {
      g.fillStyle = 'rgba(220,235,255,0.55)';
      g.beginPath();
      g.moveTo(-10, h * 0.5);
      g.lineTo(w * 0.18, h * 0.16);
      g.lineTo(w * 0.32, h * 0.38);
      g.lineTo(w * 0.5, h * 0.1);
      g.lineTo(w * 0.7, h * 0.36);
      g.lineTo(w * 0.86, h * 0.18);
      g.lineTo(w + 10, h * 0.5);
      g.closePath();
      g.fill();
    },
  },
  metro: {
    sky: ['#0a0418', '#2a0a3a', '#040208'],
    under: '#2a2448',
    particle: (w, h) => ({ x: rnd(0, w * 1.2), y: -10, vx: -40, vy: rnd(380, 520), life: 0, max: 1.2, size: 1, color: Math.random() < 0.5 ? 'rgba(255,79,216,0.6)' : 'rgba(74,240,255,0.6)' }),
    far: (g, w, h, t) => {
      for (let i = 0; i < 9; i++) {
        const x = i * (w / 8);
        const bh = h * (0.18 + ((i * 37) % 23) / 60);
        g.fillStyle = '#120a24';
        g.fillRect(x, h * 0.55 - bh, w / 9, bh);
        g.fillStyle = Math.sin(t * 2 + i) > 0 ? 'rgba(255,79,216,0.7)' : 'rgba(74,240,255,0.7)';
        for (let k = 0; k < 4; k++) g.fillRect(x + 6 + (k % 2) * 14, h * 0.55 - bh + 8 + k * 12, 6, 4);
      }
    },
  },
  deserto: {
    sky: ['#f0a050', '#ffd08a', '#5a3010'],
    under: '#9a6a3a',
    particle: (w, h) => ({ x: -10, y: rnd(h * 0.2, h), vx: rnd(120, 220), vy: rnd(-10, 10), life: 0, max: 4, size: rnd(0.8, 1.8), color: 'rgba(255,230,180,0.7)' }),
    far: (g, w, h) => {
      g.fillStyle = 'rgba(160,90,40,0.55)';
      for (const [x, s] of [
        [0.15, 1],
        [0.78, 0.8],
      ] as const) {
        g.beginPath();
        g.moveTo(w * x - 50 * s, h * 0.52);
        g.lineTo(w * x, h * 0.52 - 70 * s);
        g.lineTo(w * x + 50 * s, h * 0.52);
        g.closePath();
        g.fill();
      }
      const gr = g.createRadialGradient(w * 0.5, h * 0.12, 2, w * 0.5, h * 0.12, h * 0.16);
      gr.addColorStop(0, 'rgba(255,250,220,1)');
      gr.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(w * 0.5, h * 0.12, h * 0.16, 0, Math.PI * 2);
      g.fill();
    },
  },
};

let helper: Renderer | null = null;
const baseCache = new Map<string, HTMLCanvasElement>();
function arenaBase(a: ArenaDef, px: number) {
  const key = `${a.id}:${px.toFixed(2)}`;
  let b = baseCache.get(key);
  if (!b) {
    helper ??= new Renderer(document.createElement('canvas'));
    b = helper.renderArenaBase(a, px);
    if (baseCache.size > 12) baseCache.clear();
    baseCache.set(key, b);
  }
  return b;
}

export class MapScene {
  private a: ArenaDef | null = null;
  private parts: P[] = [];
  private t = 0;
  private raf = 0;
  private last = 0;
  constructor(private cv: HTMLCanvasElement) {}

  set(a: ArenaDef) {
    if (this.a?.id !== a.id) this.parts = [];
    this.a = a;
  }
  start() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number) {
    const a = this.a;
    if (!a) return;
    const w = this.cv.clientWidth;
    const h = this.cv.clientHeight;
    if (!w || !h) return;
    const k = dpr();
    if (this.cv.width !== Math.round(w * k) || this.cv.height !== Math.round(h * k)) {
      this.cv.width = Math.round(w * k);
      this.cv.height = Math.round(h * k);
    }
    this.t += dt;
    const t = this.t;
    const th = THEMES[a.id] ?? THEMES.lab;
    const g = this.cv.getContext('2d')!;
    g.setTransform(k, 0, 0, k, 0, 0);

    // céu / fundo
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.55, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (a.id === 'espaco' || a.id === 'floresta' || a.id === 'lab' || a.id === 'metro') {
      for (let i = 0; i < 80; i++) {
        g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 14})`;
        g.fillRect((i * 97.3) % w, (i * 53.7) % (h * 0.6), 1.3, 1.3);
      }
    }
    th.far?.(g, w, h, t);

    // tabuleiro em perspectiva
    const bob = Math.sin(t * 0.9) * 4;
    const topW = w * 0.8;
    const botW = w * 1.06;
    const top = h * 0.24 + bob;
    const bot = h * 0.84 + bob;
    const thick = h * 0.07;
    const base = arenaBase(a, Math.min(1, (botW * k) / WORLD_W));
    // espessura (lateral da plataforma)
    g.fillStyle = th.under;
    g.beginPath();
    g.moveTo(w / 2 - botW / 2, bot);
    g.lineTo(w / 2 + botW / 2, bot);
    g.lineTo(w / 2 + botW / 2 - 10, bot + thick);
    g.lineTo(w / 2 - botW / 2 + 10, bot + thick);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(w / 2 - botW / 2 + 10, bot + thick * 0.45, botW - 20, thick * 0.55);
    // sombra projetada
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(w / 2, bot + thick + 14, botW * 0.45, 10, 0, 0, Math.PI * 2);
    g.fill();
    // fatias horizontais formando um trapézio
    const N = 90;
    const bw = base.width;
    const bh = base.height;
    for (let i = 0; i < N; i++) {
      const f0 = i / N;
      const f1 = (i + 1) / N;
      // compressão em perspectiva: as linhas de cima ficam mais juntas
      const y0 = top + (bot - top) * (f0 * f0 * 0.35 + f0 * 0.65);
      const y1 = top + (bot - top) * (f1 * f1 * 0.35 + f1 * 0.65);
      const rw = topW + (botW - topW) * f0;
      g.drawImage(base, 0, f0 * bh, bw, bh / N + 1, w / 2 - rw / 2, y0, rw, y1 - y0 + 0.8);
    }
    // luz de cima sobre o tabuleiro (deixa o piso mais legível)
    g.save();
    g.beginPath();
    g.moveTo(w / 2 - topW / 2, top);
    g.lineTo(w / 2 + topW / 2, top);
    g.lineTo(w / 2 + botW / 2, bot);
    g.lineTo(w / 2 - botW / 2, bot);
    g.closePath();
    g.clip();
    g.globalCompositeOperation = 'lighter';
    const lit = g.createRadialGradient(w / 2, top, 10, w / 2, (top + bot) / 2, (bot - top) * 1.1);
    lit.addColorStop(0, hexA(a.palette.accent, 0.28));
    lit.addColorStop(1, hexA(a.palette.accent, 0.04));
    g.fillStyle = lit;
    g.fillRect(0, top, w, bot - top);
    g.restore();
    // brilho no núcleo
    const c0 = a.cores[0];
    const fy = c0.y / WORLD_H;
    const cy = top + (bot - top) * (fy * fy * 0.35 + fy * 0.65);
    const rw = topW + (botW - topW) * fy;
    const cx = w / 2 - rw / 2 + (c0.x / WORLD_W) * rw;
    const pulse = 0.6 + 0.3 * Math.sin(t * 3);
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, h * 0.12);
    gr.addColorStop(0, `rgba(170,255,200,${pulse})`);
    gr.addColorStop(1, 'rgba(93,255,138,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, h * 0.12, 0, Math.PI * 2);
    g.fill();
    // feixe de luz do núcleo
    g.save();
    g.globalCompositeOperation = 'lighter';
    const beam = g.createLinearGradient(0, cy - h * 0.3, 0, cy);
    beam.addColorStop(0, 'rgba(93,255,138,0)');
    beam.addColorStop(1, `rgba(93,255,138,${0.3 * pulse})`);
    g.fillStyle = beam;
    g.fillRect(cx - 6, cy - h * 0.3, 12, h * 0.3);
    g.restore();
    // borda iluminada
    g.strokeStyle = hexA(a.palette.wallEdge, 0.7);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w / 2 - topW / 2, top);
    g.lineTo(w / 2 + topW / 2, top);
    g.lineTo(w / 2 + botW / 2, bot);
    g.lineTo(w / 2 - botW / 2, bot);
    g.closePath();
    g.stroke();

    // partículas do tema
    for (let i = 0; i < 3; i++) {
      const p = th.particle(w, h);
      if (p && this.parts.length < 220) this.parts.push(p);
    }
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = p.life / p.max;
      if (f >= 1) continue;
      g.globalAlpha = Math.min(1, (1 - f) * 2, f * 6);
      g.fillStyle = p.color;
      if (p.size > 10) {
        g.beginPath();
        g.ellipse(p.x, p.y, p.size * 1.8, p.size * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      } else if (p.vy > 300) {
        g.fillRect(p.x, p.y, p.size, 14);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life < p.max);

    // vinheta
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,3,16,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }
}

/** dificuldade de cada mapa (1 a 5) */
export const MAP_DIFFICULTY: Record<string, number> = { lab: 1, floresta: 2, cidade: 3, templo: 3, fabrica: 3, gelo: 3, deserto: 3, espaco: 4, vulcao: 4, metro: 4 };
