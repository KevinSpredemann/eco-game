import { ArenaDef, BORDER, WORLD_H, WORLD_W, beamAngle, bridgeState, laserX, pistonState } from '../game/arenas';
import { getCharacter } from '../game/characters';
import * as C from '../game/constants';
import type { EchoView, Game, GameEvent, Player } from '../game/sim';
import { sampleRecording } from '../systems/echo/recorder';
import { SpriteCache, WALK_FRAMES, drawCharacter, drawSymbol, facingOf, rr } from './sprites';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'ring' | 'text' | 'glow';
  text?: string;
};

const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
const SPRITE_SCALE = 1.08;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  private base: HTMLCanvasElement | null = null;
  private sky: HTMLCanvasElement | null = null;
  private arena: ArenaDef | null = null;
  private sprites = new SpriteCache();
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private echoWasActive = new Map<string, boolean>();
  reducedEffects = false;
  showTrails = true;
  private cssW = 0;
  private cssH = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, padTop = 0, padBottom = 0) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const availH = h - padTop - padBottom;
    this.scale = Math.min(w / WORLD_W, availH / WORLD_H);
    this.ox = (w - WORLD_W * this.scale) / 2;
    this.oy = padTop + (availH - WORLD_H * this.scale) / 2;
    this.sprites.setScale(this.scale * this.dpr * SPRITE_SCALE);
    if (this.arena) this.buildBase(this.arena);
  }

  setArena(a: ArenaDef) {
    this.arena = a;
    this.particles = [];
    this.echoWasActive.clear();
    this.buildBase(a);
  }

  /** converte coordenadas de tela (css px) para o mundo */
  toWorld(x: number, y: number) {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }

  // ======================================================== camada estática
  private buildBase(a: ArenaDef) {
    const px = this.scale * this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(WORLD_W * px);
    cv.height = Math.ceil(WORLD_H * px);
    const g = cv.getContext('2d')!;
    g.scale(px, px);
    const P = a.palette;
    const rand = seeded(a.id.length * 977 + a.id.charCodeAt(0));

    // fundo fora do piso
    if (a.id === 'cidade') {
      const sky = g.createLinearGradient(0, 0, 0, WORLD_H);
      sky.addColorStop(0, '#7fb6ff');
      sky.addColorStop(0.6, '#b3a6ff');
      sky.addColorStop(1, '#ffc6a8');
      g.fillStyle = sky;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let i = 0; i < 26; i++) {
        const x = rand() * WORLD_W;
        const y = rand() * WORLD_H;
        const r = 30 + rand() * 60;
        g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.35})`;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + k * r * 0.6, y + Math.sin(k) * 8, r * (0.6 + rand() * 0.4), 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (a.id === 'espaco') {
      g.fillStyle = P.bg;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (const [x, y, r, c] of [
        [300, 200, 380, 'rgba(160,60,255,0.22)'],
        [1000, 520, 420, 'rgba(255,60,200,0.16)'],
        [700, 100, 260, 'rgba(60,140,255,0.18)'],
      ] as const) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, c);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, WORLD_W, WORLD_H);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
        const s = rand() < 0.1 ? 2.2 : 1.1;
        g.fillRect(rand() * WORLD_W, rand() * WORLD_H, s, s);
      }
    } else {
      g.fillStyle = P.bg;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // piso
    const floorRects = a.islands ?? [{ x: BORDER, y: BORDER, w: WORLD_W - BORDER * 2, h: WORLD_H - BORDER * 2 }];
    for (const fr of floorRects) {
      if (a.islands) {
        // parte de baixo da ilha flutuante
        g.fillStyle = '#5a3d2a';
        g.beginPath();
        g.moveTo(fr.x + 6, fr.y + fr.h);
        g.lineTo(fr.x + fr.w * 0.25, fr.y + fr.h + 40);
        g.lineTo(fr.x + fr.w * 0.5, fr.y + fr.h + 64);
        g.lineTo(fr.x + fr.w * 0.78, fr.y + fr.h + 36);
        g.lineTo(fr.x + fr.w - 6, fr.y + fr.h);
        g.closePath();
        g.fill();
        g.fillStyle = '#3d281b';
        g.fillRect(fr.x, fr.y + fr.h - 4, fr.w, 16);
      }
      g.save();
      g.beginPath();
      rr(g, fr.x, fr.y, fr.w, fr.h, a.islands ? 18 : 0);
      g.clip();
      if (a.id === 'espaco') g.globalAlpha = 0.88;
      const T = a.id === 'templo' ? 60 : a.id === 'fabrica' ? 48 : 40;
      for (let y = fr.y; y < fr.y + fr.h; y += T)
        for (let x = fr.x; x < fr.x + fr.w; x += T) {
          g.fillStyle = (Math.floor(x / T) + Math.floor(y / T)) % 2 ? P.floorA : P.floorB;
          g.fillRect(x, y, T, T);
        }
      g.globalAlpha = 1;
      g.strokeStyle = P.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = fr.x; x <= fr.x + fr.w; x += T) {
        g.moveTo(x, fr.y);
        g.lineTo(x, fr.y + fr.h);
      }
      for (let y = fr.y; y <= fr.y + fr.h; y += T) {
        g.moveTo(fr.x, y);
        g.lineTo(fr.x + fr.w, y);
      }
      g.stroke();
      this.decorate(g, a, fr, rand);
      g.restore();
      if (a.islands) {
        g.strokeStyle = '#7ee0a0';
        g.lineWidth = 4;
        g.beginPath();
        rr(g, fr.x, fr.y, fr.w, fr.h, 18);
        g.stroke();
      }
    }

    // marcas das zonas de perigo (o jogador sabe onde podem surgir)
    for (const z of a.zones) {
      g.save();
      g.setLineDash([6, 8]);
      g.strokeStyle = hexA(P.hazard, 0.32);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = hexA(P.hazard, 0.05);
      g.fill();
      g.fillStyle = hexA(P.hazard, 0.35);
      g.font = `700 16px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('⚡', z.x, z.y);
      g.restore();
    }

    // locais possíveis do núcleo
    for (const c of a.cores) {
      g.strokeStyle = hexA(P.accent, 0.14);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, C.CORE_R - 8, 0, Math.PI * 2);
      g.stroke();
    }

    // esteiras (estrutura)
    for (const cv2 of a.conveyors ?? []) {
      g.fillStyle = '#1b1411';
      g.fillRect(cv2.x, cv2.y, cv2.w, cv2.h);
      g.strokeStyle = '#5a4436';
      g.lineWidth = 4;
      g.strokeRect(cv2.x, cv2.y, cv2.w, cv2.h);
    }
    // carcaça dos pistões
    for (const p of a.pistons ?? []) {
      g.fillStyle = '#2b201a';
      g.fillRect(p.x - 6, p.y - 26, p.w + 12, 26);
      stripes(g, p.x - 6, p.y - 26, p.w + 12, 8, '#ffb000', '#1a1208');
      g.strokeStyle = hexA(P.hazard, 0.3);
      g.setLineDash([5, 6]);
      g.strokeRect(p.x, p.y, p.w, p.h);
      g.setLineDash([]);
    }

    // borda externa
    if (!a.islands) {
      g.fillStyle = P.wall;
      g.fillRect(0, 0, WORLD_W, BORDER);
      g.fillRect(0, WORLD_H - BORDER, WORLD_W, BORDER);
      g.fillRect(0, 0, BORDER, WORLD_H);
      g.fillRect(WORLD_W - BORDER, 0, BORDER, WORLD_H);
      g.fillStyle = P.wallTop;
      g.fillRect(0, 0, WORLD_W, BORDER - 8);
      g.strokeStyle = P.wallEdge;
      g.lineWidth = 2;
      g.globalAlpha = 0.8;
      g.strokeRect(BORDER, BORDER, WORLD_W - BORDER * 2, WORLD_H - BORDER * 2);
      g.globalAlpha = 1;
    }

    // paredes 2.5D
    for (const w of a.walls) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(w.x + 4, w.y + 8, w.w, w.h);
      g.fillStyle = P.wall;
      g.fillRect(w.x, w.y + 10, w.w, w.h - 10 > 0 ? w.h - 10 : w.h);
      g.fillStyle = P.wallTop;
      g.fillRect(w.x, w.y, w.w, Math.max(10, w.h - 12));
      g.strokeStyle = P.wallEdge;
      g.lineWidth = 2;
      g.globalAlpha = 0.85;
      g.strokeRect(w.x + 1, w.y + 1, w.w - 2, Math.max(10, w.h - 12) - 2);
      g.globalAlpha = 1;
      if (a.id === 'fabrica') stripes(g, w.x, w.y + Math.max(10, w.h - 12), w.w, 6, '#ffb000', '#1a1208');
    }

    // pilares / árvores / colunas / asteroides
    for (const c of a.pillars) this.drawPillar(g, a, c.x, c.y, c.r, rand);

    this.base = cv;
  }

  private decorate(g: CanvasRenderingContext2D, a: ArenaDef, fr: { x: number; y: number; w: number; h: number }, rand: () => number) {
    const P = a.palette;
    switch (a.id) {
      case 'lab': {
        g.strokeStyle = hexA(P.accent, 0.12);
        g.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const y = fr.y + 40 + rand() * (fr.h - 80);
          const x = fr.x + rand() * fr.w;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 60 + rand() * 120, y);
          g.lineTo(x + 80 + rand() * 120, y + 30);
          g.stroke();
        }
        const gr = g.createRadialGradient(640, 360, 10, 640, 360, 300);
        gr.addColorStop(0, hexA(P.accent, 0.1));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(fr.x, fr.y, fr.w, fr.h);
        break;
      }
      case 'templo': {
        g.strokeStyle = 'rgba(255,200,120,0.12)';
        g.lineWidth = 5;
        for (const r of [90, 150, 320]) {
          g.beginPath();
          g.ellipse(640, 360, r * 1.15, r, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          const x = fr.x + rand() * fr.w;
          const y = fr.y + rand() * fr.h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + rand() * 20 - 10, y + rand() * 20);
          g.lineTo(x + rand() * 30 - 15, y + rand() * 30);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,140,60,0.35)';
        for (let i = 0; i < 30; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, rand() < 0.5 ? fr.y + rand() * 30 : fr.y + fr.h - rand() * 30, 4 + rand() * 6, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'fabrica': {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 12; i++) {
          g.beginPath();
          g.ellipse(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 20 + rand() * 40, 10 + rand() * 20, rand() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.06)';
        for (let y = fr.y + 6; y < fr.y + fr.h; y += 48)
          for (let x = fr.x + 6; x < fr.x + fr.w; x += 48) {
            g.fillRect(x, y, 2, 2);
            g.fillRect(x + 36, y, 2, 2);
            g.fillRect(x, y + 36, 2, 2);
            g.fillRect(x + 36, y + 36, 2, 2);
          }
        break;
      }
      case 'floresta': {
        for (let i = 0; i < 160; i++) {
          const c = ['#59ffd0', '#7a6bff', '#ff5df0', '#9dff5c'][Math.floor(rand() * 4)];
          g.fillStyle = hexA(c, 0.15 + rand() * 0.25);
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 1 + rand() * 2.5, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(90,255,200,0.12)';
        g.lineWidth = 2;
        for (let i = 0; i < 60; i++) {
          const x = fr.x + rand() * fr.w;
          const y = fr.y + rand() * fr.h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 3, y - 8);
          g.moveTo(x, y);
          g.lineTo(x + 3, y - 9);
          g.stroke();
        }
        break;
      }
      case 'espaco': {
        g.strokeStyle = 'rgba(200,120,255,0.18)';
        g.lineWidth = 2;
        for (const r of [120, 200, 260]) {
          g.beginPath();
          g.arc(640, 360, r, 0, Math.PI * 2);
          g.stroke();
        }
        break;
      }
      case 'cidade': {
        g.fillStyle = 'rgba(120,220,140,0.18)';
        for (let i = 0; i < 40; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 6 + rand() * 10, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
    }
  }

  private drawPillar(g: CanvasRenderingContext2D, a: ArenaDef, x: number, y: number, r: number, rand: () => number) {
    const P = a.palette;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x + 4, y + 6, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    switch (a.id) {
      case 'floresta': {
        g.fillStyle = '#2a1d3a';
        g.fillRect(x - 5, y - 4, 10, 14);
        const cols = ['#164a5a', '#1f6b70', '#2f8f7f'];
        for (let i = 3; i >= 1; i--) {
          g.fillStyle = cols[i - 1];
          g.beginPath();
          g.arc(x + (rand() - 0.5) * 6, y - 8 - i * 3, r * (0.55 + i * 0.15), 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(120,255,230,0.6)';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(x + (rand() - 0.5) * r * 1.4, y - 14 + (rand() - 0.5) * r, 1.5 + rand() * 2, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'espaco': {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
        gr.addColorStop(0, '#6b5a8f');
        gr.addColorStop(1, '#2a2140');
        g.fillStyle = gr;
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const rr2 = r * (0.85 + rand() * 0.2);
          g.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2);
        }
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.arc(x + r * 0.2, y + r * 0.1, r * 0.25, 0, Math.PI * 2);
        g.fill();
        break;
      }
      default: {
        const top = a.id === 'templo' ? '#8a6c46' : a.id === 'cidade' ? '#d9c7ff' : P.wallTop;
        const side = a.id === 'templo' ? '#5c4429' : a.id === 'cidade' ? '#7b6bb8' : P.wall;
        g.fillStyle = side;
        g.fillRect(x - r, y - 14, r * 2, 14);
        g.beginPath();
        g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI);
        g.fill();
        g.fillStyle = top;
        g.beginPath();
        g.ellipse(x, y - 14, r, r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = P.wallEdge;
        g.globalAlpha = 0.7;
        g.lineWidth = 2;
        g.stroke();
        g.globalAlpha = 1;
        if (a.id === 'cidade') {
          g.fillStyle = '#ffd27a';
          g.beginPath();
          g.arc(x, y - 18, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // ======================================================== eventos → efeitos
  handleEvents(events: GameEvent[], game: Game) {
    const pc = (id: string) => game.players.find((p) => p.id === id);
    for (const e of events) {
      switch (e.type) {
        case 'pickup':
          this.burst(e.x, e.y, e.golden ? '#ffd23e' : '#5dff8a', e.golden ? 22 : 10, 160);
          if (e.lucky) this.text(e.x, e.y - 20, 'SORTE! ×2', '#ff7a59');
          break;
        case 'deliver': {
          const p = pc(e.pid);
          this.burst(e.x, e.y, p?.color ?? '#5dff8a', 26, 260);
          this.ring(e.x, e.y, p?.color ?? '#5dff8a', 90);
          this.text(e.x, e.y - 50, `+${e.points}`, p?.color ?? '#fff', 30);
          break;
        }
        case 'hit': {
          this.burst(e.x, e.y, '#ff5a5a', 16, 220);
          if (e.pid === 'p0') {
            this.shake = 10;
            this.flash = 0.35;
            this.flashColor = '#ff2a4a';
          }
          const label = e.by === 'own' ? 'SEU ECO!' : e.by === 'echo' ? 'ECO!' : e.by === 'fall' ? 'QUEDA!' : '';
          this.text(e.x, e.y - 40, label ? `-1 ♥ ${label}` : '-1 ♥', '#ff6b6b', 20);
          break;
        }
        case 'eliminated':
          this.burst(e.x, e.y, '#ffffff', 30, 280);
          this.ring(e.x, e.y, '#ff5a5a', 120);
          break;
        case 'dash':
          this.burst(e.x, e.y, '#9ad8ff', 6, 90);
          break;
        case 'ability': {
          const p = pc(e.pid);
          const col = p?.color ?? '#fff';
          if (e.ability === 'explosao') {
            this.ring(e.x, e.y, col, 165);
            this.ring(e.x, e.y, '#ffffff', 120);
            this.shake = Math.max(this.shake, 6);
          } else this.ring(e.x, e.y, col, 60);
          break;
        }
        case 'portal':
          this.ring(e.x, e.y, '#c77dff', 50);
          this.burst(e.x, e.y, '#c77dff', 10, 140);
          break;
        case 'disrupt':
          this.burst(e.x, e.y, '#ffffff', 14, 200);
          this.ring(e.x, e.y, '#b0f0ff', 50);
          break;
        case 'hazardOn':
          this.ring(e.x, e.y, '#ff8a1e', 80);
          break;
        case 'piston':
          this.shake = Math.max(this.shake, 3);
          break;
        case 'coreMove':
          this.ring(e.x, e.y, '#5dff8a', 120);
          break;
        case 'goldenSpawn':
          this.ring(e.x, e.y, '#ffd23e', 80);
          break;
        case 'objective': {
          const p = pc(e.pid);
          if (p) this.text(p.x, p.y - 70, e.text, '#ffd23e', 18);
          break;
        }
      }
    }
  }

  private burst(x: number, y: number, color: string, n: number, sp: number) {
    if (this.reducedEffects) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3, kind: 'spark' });
    }
  }
  private ring(x: number, y: number, color: string, r: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.55, color, size: r, kind: 'ring' });
  }
  private text(x: number, y: number, text: string, color: string, size = 22) {
    const texts = this.particles.filter((p) => p.kind === 'text');
    if (texts.length > 10) texts[0].life = texts[0].max;
    this.particles.push({ x, y, vx: 0, vy: -50, life: 0, max: 1.3, color, size, kind: 'text', text });
  }

  // ======================================================== quadro
  render(game: Game, dt: number, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && !this.reducedEffects) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
    }
    this.shake = Math.max(0, this.shake - dt * 40);
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.ox + sx) * this.dpr, (this.oy + sy) * this.dpr);
    if (this.base) ctx.drawImage(this.base, 0, 0, WORLD_W, WORLD_H);

    const t = game.worldT;
    this.drawDynamic(game, time);

    if (game.phase === 'rewind') {
      this.drawRewind(game);
    } else {
      this.drawFragments(game, time);
      this.drawEchoes(game, time);
      this.drawClones(game, time);
      const ps = game.players.filter((p) => p.playing && p.alive).sort((p1, p2) => p1.y - p2.y);
      for (const p of ps) this.drawPlayer(game, p, time);
      this.drawBushes(a, time);
      this.drawHazardsTop(game, t, time);
    }
    this.drawParticles(dt);

    if (game.phase === 'prep') this.drawPrepHints(game, time);

    if (this.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 1.6);
    }
  }

  private drawDynamic(game: Game, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    const t = game.worldT;
    const P = a.palette;

    // pontes
    for (const b of a.bridges ?? []) {
      const s = bridgeState(b, t);
      if (s === 'off') {
        ctx.strokeStyle = 'rgba(140,220,255,0.25)';
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
        ctx.setLineDash([]);
        continue;
      }
      const blink = s === 'warn' ? (Math.sin(time * 22) > 0 ? 0.35 : 0.9) : 0.9;
      ctx.globalAlpha = blink;
      const gr = b.vertical ? ctx.createLinearGradient(b.x, 0, b.x + b.w, 0) : ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, 'rgba(120,220,255,0.55)');
      gr.addColorStop(0.5, 'rgba(200,250,255,0.85)');
      gr.addColorStop(1, 'rgba(120,220,255,0.55)');
      ctx.fillStyle = gr;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = s === 'warn' ? '#ff8a1e' : '#e8fbff';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
    }

    // esteiras animadas
    for (const cv of a.conveyors ?? []) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cv.x, cv.y, cv.w, cv.h);
      ctx.clip();
      const off = ((t * cv.vx) % 40 + 40) % 40;
      ctx.strokeStyle = 'rgba(255,170,80,0.35)';
      ctx.lineWidth = 4;
      for (let x = cv.x - 40 + off; x < cv.x + cv.w + 40; x += 40) {
        const dir = Math.sign(cv.vx);
        ctx.beginPath();
        ctx.moveTo(x - 8 * dir, cv.y + 12);
        ctx.lineTo(x + 6 * dir, cv.y + cv.h / 2);
        ctx.lineTo(x - 8 * dir, cv.y + cv.h - 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    // portais
    for (const pair of a.portals ?? []) {
      for (const p of pair) {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = hexA('#c77dff', 0.8 - i * 0.22);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 24 - i * 6, time * (2 + i) + i, time * (2 + i) + i + Math.PI * 1.4);
          ctx.stroke();
        }
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
        gr.addColorStop(0, 'rgba(199,125,255,0.6)');
        gr.addColorStop(1, 'rgba(199,125,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(199,125,255,0.08)';
      ctx.setLineDash([3, 12]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pair[0].x, pair[0].y);
      ctx.lineTo(pair[1].x, pair[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // poço gravitacional
    for (const w of a.wells ?? []) {
      const gr = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.range);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.15, 'rgba(40,0,60,0.9)');
      gr.addColorStop(0.4, 'rgba(160,60,255,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.range, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const r = w.range * (((1 - ((time * 0.35 + i / 5) % 1)) * 0.85) + 0.1);
        ctx.strokeStyle = `rgba(255,93,240,${0.35 * (r / w.range)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, time + i, time + i + Math.PI * 1.2);
        ctx.stroke();
      }
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff5df0';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // núcleo
    this.drawCore(game, time);

    // zonas elétricas (aviso/ativas)
    for (let i = 0; i < a.zones.length; i++) {
      const s = game.zoneState(i);
      if (s === 'off') continue;
      const z = a.zones[i];
      if (s === 'warn') {
        const blink = 0.35 + 0.35 * Math.sin(time * 18);
        ctx.fillStyle = hexA(P.hazard, 0.12 + blink * 0.25);
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.hazard;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -time * 40;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.font = `700 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', z.x, z.y);
      } else {
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        gr.addColorStop(0, hexA('#ffe08a', 0.75));
        gr.addColorStop(0.6, hexA(P.hazard, 0.55));
        gr.addColorStop(1, hexA(P.hazard, 0.2));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff6c8';
        ctx.lineWidth = 2;
        for (let j = 0; j < 5; j++) {
          const a0 = Math.random() * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          let px = z.x;
          let py = z.y;
          for (let s2 = 1; s2 <= 4; s2++) {
            px = z.x + Math.cos(a0 + (Math.random() - 0.5) * 0.8) * (z.r * s2) / 4;
            py = z.y + Math.sin(a0 + (Math.random() - 0.5) * 0.8) * (z.r * s2) / 4;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    }

    // pistões
    for (const p of a.pistons ?? []) {
      const s = pistonState(p, t);
      if (s.phase === 'warn') {
        ctx.fillStyle = hexA(P.hazard, 0.15 + 0.2 * (Math.sin(time * 20) > 0 ? 1 : 0));
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      const h = Math.max(0, s.ext) * p.h;
      ctx.fillStyle = '#6d5a4c';
      ctx.fillRect(p.x + p.w / 2 - 8, p.y - 6, 16, h + 6);
      ctx.fillStyle = '#8f7766';
      ctx.fillRect(p.x, p.y + h - 22, p.w, 22);
      stripes(ctx, p.x, p.y + h - 8, p.w, 8, '#ffb000', '#1a1208');
    }
  }

  private drawHazardsTop(game: Game, t: number, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    for (const b of a.beams ?? []) {
      const ang = beamAngle(b, t);
      const ex = b.x + Math.cos(ang) * b.len;
      const ey = b.y + Math.sin(ang) * b.len;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,90,30,0.35)';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#fff2c8';
      ctx.lineWidth = 3;
      ctx.stroke();
      // rastro de giro
      ctx.strokeStyle = 'rgba(255,140,60,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.len, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#4a2a10';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7a1e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const l of a.lasers ?? []) {
      const x = laserX(l, t);
      ctx.fillStyle = 'rgba(255,74,110,0.18)';
      ctx.fillRect(x - 14, l.y0, 28, l.y1 - l.y0);
      ctx.strokeStyle = '#ff4a6e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, l.y0);
      ctx.lineTo(x, l.y1);
      ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const y of [l.y0, l.y1]) {
        ctx.fillStyle = '#3a2d73';
        rr(ctx, x - 12, y - 7, 24, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#ff4a6e';
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  private drawCore(game: Game, time: number) {
    const ctx = this.ctx;
    const c = game.core;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const gr = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, C.CORE_R);
    gr.addColorStop(0, 'rgba(180,255,200,0.9)');
    gr.addColorStop(0.35, 'rgba(93,255,138,0.45)');
    gr.addColorStop(1, 'rgba(93,255,138,0.04)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, C.CORE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5dff8a';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 8]);
    ctx.lineDashOffset = time * 30;
    ctx.beginPath();
    ctx.arc(c.x, c.y, C.CORE_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // cristal
    ctx.save();
    ctx.translate(c.x, c.y - 6 - pulse * 4);
    ctx.rotate(time * 0.8);
    ctx.fillStyle = '#c8ffd8';
    ctx.strokeStyle = '#1fbf5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (game.coreNext) {
      const n = game.coreNext;
      ctx.strokeStyle = Math.sin(time * 14) > 0 ? '#5dff8a' : 'rgba(93,255,138,0.3)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(n.x, n.y, C.CORE_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, n.x, n.y - C.CORE_R - 12, 'NÚCLEO VAI MUDAR', '#5dff8a', 14);
    }
    if (game.goldenSpot && !game.fragments.some((f) => f.golden) && !game.goldenDone) {
      const s = game.goldenSpot;
      ctx.strokeStyle = Math.sin(time * 12) > 0 ? '#ffd23e' : 'rgba(255,210,62,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, s.x, s.y - 34, 'DOURADO', '#ffd23e', 13);
    }
  }

  private drawFragments(game: Game, time: number) {
    const ctx = this.ctx;
    for (const f of game.fragments) {
      const bob = Math.sin(time * 4 + f.id) * 3;
      const col = f.golden ? '#ffd23e' : '#5dff8a';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 8, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const gr = ctx.createRadialGradient(f.x, f.y + bob, 0, f.x, f.y + bob, f.golden ? 26 : 18);
      gr.addColorStop(0, hexA(col, 0.55));
      gr.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(f.x, f.y + bob, f.golden ? 26 : 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(f.x, f.y + bob - 2);
      const s = f.golden ? 1.4 : 1;
      ctx.scale(s, s);
      ctx.fillStyle = f.golden ? '#fff1b0' : '#c8ffd8';
      ctx.strokeStyle = f.golden ? '#c78a00' : '#1fbf5a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, -2);
      ctx.lineTo(0, 9);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEchoes(game: Game, time: number) {
    const ctx = this.ctx;
    const prep = game.phase === 'prep';
    for (const e of game.echoViews) {
      const was = this.echoWasActive.get(e.key);
      if (was && !e.active && game.phase === 'play') this.burst(e.x, e.y, e.rec.color, 12, 120);
      this.echoWasActive.set(e.key, e.active);
      if (!e.active) continue;
      const ch = getCharacter(e.rec.characterId);
      const baseAlpha = [0.85, 0.62, 0.42][Math.min(2, e.age)] ?? 0.4;
      let alpha = baseAlpha;
      if (e.disrupted) alpha *= 0.25 + 0.2 * Math.sin(time * 40);
      if (e.expiring && game.phase === 'play' && game.timeLeft() < 6) alpha *= 0.55 + 0.45 * Math.sin(time * 14);
      if (prep) alpha *= 0.8 + 0.2 * Math.sin(time * 5);

      // rastro
      if (this.showTrails && e.trail.length > 2) {
        ctx.strokeStyle = hexA(e.rec.color, 0.25 * baseAlpha);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        e.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      // anel no chão
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.rec.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(e.expiring ? [4, 4] : []);
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 2, C.ECHO_R + 2, (C.ECHO_R + 2) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // pulso antes de ação
      if (e.pulse > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 18, 14 + e.pulse * 22, 0, Math.PI * 2);
        ctx.globalAlpha = alpha * (1 - e.pulse);
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
      const { facing, flip } = facingOf(e.dir);
      const frame = Math.floor(((time * 11) / (Math.PI * 2)) * WALK_FRAMES) % WALK_FRAMES;
      const img = this.sprites.get(ch, facing, frame, e.moving, e.disrupted ? '#d8e6ff' : e.rec.color);
      ctx.globalCompositeOperation = 'lighter';
      this.sprites.draw(ctx, img, e.x, e.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, alpha + 0.15);
      // símbolo + geração
      drawSymbol(ctx, ch.id, e.x - 10, e.y - 62, 7, e.rec.color);
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = e.rec.color;
      ctx.fillText(`R${e.rec.round}`, e.x - 1, e.y - 62);
      ctx.globalAlpha = 1;
    }
  }

  private drawClones(game: Game, time: number) {
    const ctx = this.ctx;
    for (const c of game.clones) {
      const owner = game.players.find((p) => p.id === c.owner);
      if (!owner) continue;
      const { facing, flip } = facingOf(c.dir);
      const frame = Math.floor(time * 14) % WALK_FRAMES;
      const img = this.sprites.get(owner.char, facing, frame, true, '#7dffef');
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 30);
      this.sprites.draw(ctx, img, c.x, c.y + 4, flip, SPRITE_SCALE * 0.85);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(game: Game, p: Player, time: number) {
    const ctx = this.ctx;
    const human = p.id === 'p0';
    let alpha = 1;
    if (p.hidden && p.phaseT <= 0) alpha = human ? 0.55 : 0.14;
    if (p.phaseT > 0) alpha = 0.3 + 0.15 * Math.sin(time * 30);
    if (p.invulnT > 0 && Math.sin(time * 30) > 0.3) alpha *= 0.45;

    // sombra + anel de cor
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = human ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, C.PLAYER_R + 3, (C.PLAYER_R + 3) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // turbo: imagens residuais
    if ((p.turboT > 0 || p.dashT > 0) && !this.reducedEffects) {
      ctx.strokeStyle = hexA(p.color, 0.5);
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        const bx = p.x - Math.cos(p.dir) * i * 12;
        const by = p.y - Math.sin(p.dir) * i * 12;
        ctx.beginPath();
        ctx.moveTo(bx - Math.sin(p.dir) * 8, by - 20 + Math.cos(p.dir) * 8);
        ctx.lineTo(bx - Math.cos(p.dir) * 14, by - 20 - Math.sin(p.dir) * 14);
        ctx.stroke();
      }
    }

    const { facing, flip } = facingOf(p.dir);
    const frame = Math.floor((p.walkPhase / (Math.PI * 2)) * WALK_FRAMES) % WALK_FRAMES;
    const img = this.sprites.get(p.char, facing, frame, p.moving, null);
    this.sprites.draw(ctx, img, p.x, p.y + 4, flip, SPRITE_SCALE);
    if (p.hitFlash > 0) {
      ctx.globalAlpha = p.hitFlash * 2;
      ctx.globalCompositeOperation = 'lighter';
      const red = this.sprites.get(p.char, facing, frame, p.moving, '#ff3a3a');
      this.sprites.draw(ctx, red, p.x, p.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }

    // escudo
    if (p.shieldT > 0) {
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(93,255,138,0.12)';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 20, 30 + Math.sin(time * 10) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // energia carregada
    for (let i = 0; i < p.carry; i++) {
      const a = time * 3 + (i / Math.max(1, p.carry)) * Math.PI * 2;
      const ex = p.x + Math.cos(a) * 18;
      const ey = p.y - 52 + Math.sin(a) * 5;
      ctx.fillStyle = '#5dff8a';
      ctx.strokeStyle = '#0d5a26';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 6);
      ctx.lineTo(ex + 4.5, ey);
      ctx.lineTo(ex, ey + 6);
      ctx.lineTo(ex - 4.5, ey);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // marcador do jogador
    if (human) {
      const y = p.y - 66 + Math.sin(time * 5) * 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.x - 7, y - 8);
      ctx.lineTo(p.x + 7, y - 8);
      ctx.lineTo(p.x, y);
      ctx.closePath();
      ctx.fill();
    } else if (alpha > 0.3) {
      drawSymbol(ctx, p.char.id, p.x, p.y - 64, 6, p.color);
    }
    ctx.globalAlpha = 1;
  }

  private drawBushes(a: ArenaDef, time: number) {
    const ctx = this.ctx;
    for (const b of a.bushes ?? []) {
      ctx.save();
      ctx.globalAlpha = 0.86;
      const lobes = 7;
      for (let i = 0; i < lobes; i++) {
        const ang = (i / lobes) * Math.PI * 2 + 0.3;
        const sway = Math.sin(time * 1.5 + i + b.x) * 2;
        ctx.fillStyle = i % 2 ? '#1f6b5a' : '#24806a';
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(ang) * b.r * 0.5 + sway, b.y + Math.sin(ang) * b.r * 0.45, b.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2fa585';
      ctx.beginPath();
      ctx.arc(b.x, b.y - 4, b.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(160,255,220,0.8)';
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.7 + b.x;
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(ang) * b.r * 0.6, b.y + Math.sin(ang) * b.r * 0.5, 1.6 + Math.sin(time * 3 + i) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawRewind(game: Game) {
    const ctx = this.ctx;
    const k = Math.min(1, game.phaseT / C.REWIND_TIME);
    const eased = 1 - Math.pow(1 - k, 2);
    const tms = game.roundDur * 1000 * (1 - eased);
    for (const rec of game.lastRecordings) {
      const ch = getCharacter(rec.characterId);
      // rastro completo até o instante atual (rebobinando)
      ctx.strokeStyle = hexA(rec.color, 0.35);
      ctx.lineWidth = 3;
      ctx.beginPath();
      let started = false;
      for (const f of rec.frames) {
        if (f.t > tms) break;
        if (!started || f.jump) {
          ctx.moveTo(f.x, f.y);
          started = true;
        } else ctx.lineTo(f.x, f.y);
      }
      ctx.stroke();
      const s = sampleRecording(rec, tms);
      const { facing, flip } = facingOf(s.direction + Math.PI);
      const img = this.sprites.get(ch, facing, Math.floor(tms / 60) % WALK_FRAMES, true, rec.color);
      ctx.globalAlpha = 0.9;
      ctx.globalCompositeOperation = 'lighter';
      this.sprites.draw(ctx, img, s.x, s.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // efeito VHS
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = 'rgba(60,200,255,0.08)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = (game.phaseT * 400) % 6; y < H; y += 6 * this.dpr) ctx.fillRect(0, y, W, 2 * this.dpr);
    const k2 = this.scale * this.dpr;
    ctx.setTransform(k2, 0, 0, k2, this.ox * this.dpr, this.oy * this.dpr);
  }

  private drawPrepHints(game: Game, time: number) {
    const ctx = this.ctx;
    label(ctx, game.core.x, game.core.y - C.CORE_R - 14, 'NÚCLEO', '#5dff8a', 16);
    const p = game.human;
    if (p.playing) {
      const r = 34 + Math.sin(time * 6) * 4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 18, r, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, p.x, p.y - 80, 'VOCÊ', '#ffffff', 15);
    }
  }

  private drawParticles(dt: number) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) continue;
      if (p.kind === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.2 + k * 0.8), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'text') {
        p.y += p.vy * dt;
        p.vy *= 0.95;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        label(ctx, p.x, p.y, p.text!, p.color, p.size);
      }
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  /** Mini-pré-visualização de um personagem (seleção). */
  drawPortrait(cv: HTMLCanvasElement, charId: string, time: number) {
    const g = cv.getContext('2d')!;
    const ch = getCharacter(charId);
    const s = cv.height / 60;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, cv.width / 2, cv.height - 4 * s);
    drawCharacter(g, ch, 'down', time * 8, true);
  }
}


function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, size: number) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 4);
  ctx.strokeStyle = 'rgba(5,4,16,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function stripes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = b;
  g.fillRect(x, y, w, h);
  g.fillStyle = a;
  for (let i = -h; i < w + h; i += 12) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + 6, y + h);
    g.lineTo(x + i + 6 + h, y);
    g.lineTo(x + i + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

export function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type { EchoView };
