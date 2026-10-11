// Ilustração de cada modo (vetor): personagens em ação, na densidade da tela.
import { getCharacter } from '../game/characters';
import { drawCharacter, type Expr } from '../render/chars';
import { drawMonster } from '../render/monster';
import { dpr, hexA } from './portraits';

type Fig = { id: string; x: number; flip?: boolean; s?: number; expr?: Expr; ghost?: boolean };

const SCENES: Record<string, { figs: Fig[]; fx: (g: CanvasRenderingContext2D, w: number, h: number, fy: number, u: number) => void }> = {
  combate: {
    figs: [
      { id: 'nyx', x: 0.2, s: 0.78 },
      { id: 'luna', x: 0.82, flip: true, s: 0.78 },
      { id: 'kael', x: 0.46, s: 1 },
    ],
    fx: (g, w, h, fy, u) => {
      shot(g, w * 0.58, fy - 38 * u, w * 0.74, fy - 34 * u, '#3ee8ff');
      shot(g, w * 0.7, fy - 30 * u, w * 0.6, fy - 33 * u, '#ff4fc3');
      boom(g, w * 0.32, fy - 30 * u, 14 * u, '#ffb347');
    },
  },
  duelo: {
    figs: [
      { id: 'bruno', x: 0.28, s: 1 },
      { id: 'tara', x: 0.72, flip: true, s: 1 },
    ],
    fx: (g, w, h, fy, u) => {
      boom(g, w * 0.5, fy - 36 * u, 22 * u, '#ffd23e');
      g.fillStyle = '#ffffff';
      g.font = `700 ${16 * u}px Bungee, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('VS', w * 0.5, fy - 70 * u);
    },
  },
  ondas: {
    figs: [
      { id: 'iris', x: 0.2, s: 0.82, expr: 'happy' },
      { id: 'rex', x: 0.42, s: 1 },
    ],
    fx: (g, w, h, fy, u) => {
      robot(g, w * 0.78, fy - 6 * u, u * 1.1);
      shot(g, w * 0.55, fy - 38 * u, w * 0.7, fy - 40 * u, '#d6deec');
    },
  },
  chefe: {
    figs: [
      { id: 'kael', x: 0.14, s: 0.62 },
      { id: 'iris', x: 0.3, s: 0.62, expr: 'scared' },
    ],
    fx: (g, w, h, fy, u) => {
      // o Chefe: criatura monstruosa
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(w * 0.62, fy, 40 * u, 8 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(w * 0.6, fy);
      g.scale(-0.56 * u, 0.56 * u);
      drawMonster(g, { t: 1.2, walk: 0, moving: false, windup: 0.55, slam: 0, roar: 0.3, hurt: 0, shoot: 0, stun: false, phase: 2, dead: 0, weak: true });
      g.restore();
      // área marcada do golpe do Chefe
      g.strokeStyle = 'rgba(255,59,59,0.85)';
      g.lineWidth = 2.5;
      g.setLineDash([7, 5]);
      g.beginPath();
      g.ellipse(w * 0.3, fy - 2 * u, 26 * u, 8 * u, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      shot(g, w * 0.2, fy - 22 * u, w * 0.56, fy - 46 * u, '#3ee8ff');
    },
  },
  nucleo: {
    figs: [
      { id: 'kael', x: 0.22, s: 0.9, ghost: true },
      { id: 'zoe', x: 0.36, s: 1, expr: 'happy' },
    ],
    fx: (g, w, h, fy, u) => core(g, w * 0.74, fy - 22 * u, 20 * u),
  },
};

export function drawModeArt(cv: HTMLCanvasElement, mode: string, color: string) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d')!;
  g.setTransform(k, 0, 0, k, 0, 0);
  // fundo
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, hexA(color, 0.35));
  bg.addColorStop(1, 'rgba(10,8,30,0)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const halo = g.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w * 0.7);
  halo.addColorStop(0, hexA(color, 0.35));
  halo.addColorStop(1, hexA(color, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  const u0 = Math.min(h / 92, w / 120);
  const fy = Math.min(h * 0.9, h * 0.52 + 46 * u0);
  g.strokeStyle = hexA(color, 0.25);
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = fy + i * i * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let i = -6; i <= 6; i++) {
    g.beginPath();
    g.moveTo(w / 2 + i * w * 0.06, fy);
    g.lineTo(w / 2 + i * w * 0.16, h);
    g.stroke();
  }
  const sc = SCENES[mode];
  if (!sc) return;
  const u = Math.min(h / 92, w / 120);
  for (const f of sc.figs) {
    const s = u * (f.s ?? 1);
    const x = w * f.x;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(x, fy, 15 * s, 4 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(x, fy);
    g.scale(f.flip ? -s : s, s);
    if (f.ghost) {
      g.globalAlpha = 0.4;
      g.filter = `drop-shadow(0 0 4px ${getCharacter(f.id).color}) saturate(0.3) brightness(1.5)`;
    }
    drawCharacter(g, getCharacter(f.id), 'side', f.ghost ? 2.2 : 1.25, true, f.expr ?? 'angry', f.ghost ? 'normal' : 'cast');
    g.restore();
  }
  sc.fx(g, w, h, fy, u);
}

function shot(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string) {
  g.lineCap = 'round';
  g.strokeStyle = hexA(c, 0.4);
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2.5;
  g.stroke();
}
function boom(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.4, c);
  gr.addColorStop(1, hexA(c, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    g.lineTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
    g.stroke();
  }
}
function core(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const gr = g.createRadialGradient(x, y, 2, x, y, r * 2.4);
  gr.addColorStop(0, 'rgba(180,255,200,0.9)');
  gr.addColorStop(1, 'rgba(93,255,138,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r * 2.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c8ffd8';
  g.strokeStyle = '#1fbf5a';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 6; i++) g.lineTo(x + Math.cos((i / 6) * Math.PI * 2) * r, y + Math.sin((i / 6) * Math.PI * 2) * r);
  g.closePath();
  g.fill();
  g.stroke();
}
function robot(g: CanvasRenderingContext2D, x: number, y: number, u: number) {
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.ellipse(0, 6, 22, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a4252';
  g.strokeStyle = '#141826';
  g.lineWidth = 2;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.roundRect(s * 20 - 6, -34, 12, 26, 5);
    g.fill();
    g.stroke();
  }
  const gr = g.createLinearGradient(-22, -50, 22, 0);
  gr.addColorStop(0, '#c8302a');
  gr.addColorStop(1, '#5a1010');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(-18, -48, 36, 44, 9);
  g.fill();
  g.stroke();
  g.fillStyle = '#2a2e3a';
  g.beginPath();
  g.roundRect(-12, -42, 24, 10, 4);
  g.fill();
  g.fillStyle = '#ff5a5a';
  g.shadowColor = '#ff3b3b';
  g.shadowBlur = 8;
  g.fillRect(-9, -39, 18, 4);
  g.shadowBlur = 0;
  g.fillStyle = '#ffd23e';
  for (let k = -1; k <= 1; k++) g.fillRect(k * 7 - 2, -22, 4, 8);
  g.fillStyle = '#2a2e3a';
  for (const s of [-1, 1]) g.fillRect(s * 8 - 5, -4, 10, 8);
  g.restore();
}
