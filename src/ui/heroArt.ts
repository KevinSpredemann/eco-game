// Cena grande do carrossel: o personagem em pose de ação usando o próprio poder,
// com partículas e luz. Tudo desenhado em vetor, na densidade real da tela.
import type { CharacterDef } from '../game/characters';
import { drawCharacter, shade, type Expr } from '../render/chars';
import { dpr, hexA } from './portraits';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'dot' | 'spark' | 'puff' | 'cross' | 'flake' | 'star' };

const EXPR: Record<string, Expr> = { cura: 'happy', explosao: 'happy', clone: 'neutral', fase: 'neutral' };

export class HeroScene {
  private c: CharacterDef | null = null;
  private parts: P[] = [];
  private t = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private raf = 0;
  locked = false;
  lockNote = '';

  /** transparente = sem fundo (para usar sobre outra cena, ex.: tela inicial) */
  constructor(
    private cv: HTMLCanvasElement,
    private transparent = false,
  ) {}

  set(c: CharacterDef, locked: boolean, note = '') {
    if (this.c?.id !== c.id) this.parts = [];
    this.c = c;
    this.locked = locked;
    this.lockNote = note;
    this.t = 0;
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

  private resize() {
    const w = this.cv.clientWidth;
    const h = this.cv.clientHeight;
    const k = dpr();
    if (w !== this.w || h !== this.h || this.cv.width !== Math.round(w * k)) {
      this.w = w;
      this.h = h;
      this.cv.width = Math.round(w * k);
      this.cv.height = Math.round(h * k);
    }
  }

  private frame(dt: number) {
    const c = this.c;
    if (!c) return;
    this.resize();
    const { w, h } = this;
    if (!w || !h) return;
    this.t += dt;
    const t = this.t;
    const g = this.cv.getContext('2d')!;
    const k = dpr();
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, h);

    // ---- fundo: brilho, raios de luz, grade no chão
    const col = c.glow ?? c.color;
    const floorY = h * (this.transparent ? 0.84 : 0.79);
    if (this.transparent) {
      // só um halo e uma plataforma de luz
      const halo = g.createRadialGradient(w * 0.45, h * 0.5, 4, w * 0.45, h * 0.5, Math.max(w, h) * 0.5);
      halo.addColorStop(0, hexA(col, 0.35));
      halo.addColorStop(1, hexA(col, 0));
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = hexA(col, 0.5 - i * 0.14);
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(w * 0.4, floorY, w * (0.2 + i * 0.07) + Math.sin(t * 2 + i) * 3, h * (0.035 + i * 0.012), 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, shade(col, -0.8));
      bg.addColorStop(0.6, '#120c2a');
      bg.addColorStop(1, '#07051a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const halo = g.createRadialGradient(w * 0.5, h * 0.48, 4, w * 0.5, h * 0.48, Math.max(w, h) * 0.65);
      halo.addColorStop(0, hexA(col, 0.5));
      halo.addColorStop(1, hexA(col, 0));
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = w * (0.15 + i * 0.18) + Math.sin(t * 0.4 + i) * 20;
        const gr = g.createLinearGradient(x, 0, x + 40, h);
        gr.addColorStop(0, hexA(col, 0.12));
        gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x - 18, 0);
        g.lineTo(x + 18, 0);
        g.lineTo(x + 90, h);
        g.lineTo(x - 30, h);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.strokeStyle = hexA(col, 0.18);
      g.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const y = floorY + i * i * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        g.beginPath();
        g.moveTo(w / 2 + i * 26, floorY);
        g.lineTo(w / 2 + i * 70, h);
        g.stroke();
      }

    }
    // ---- personagem
    const s = this.transparent ? Math.min((h * 0.56) / 74, (w * 0.5) / 46) : Math.min((h * 0.66) / 74, (w * 0.58) / 46);
    const ox = w * 0.36;
    const bob = Math.sin(t * 2.4) * 1.2;
    const H = { x: ox + 21 * s, y: floorY - 40 * s + bob * s };
    const ab = c.ability.id;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(ox, floorY, 18 * s, 4.5 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = hexA(c.color, 0.7);
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(ox, floorY, 22 * s, 5.5 * s, 0, 0, Math.PI * 2);
    g.stroke();

    this.effectBack(g, ab, c, H, s, ox, floorY);
    const drawHero = (alpha = 1, dx = 0, tint: string | null = null) => {
      g.save();
      g.globalAlpha = alpha;
      g.translate(ox + dx * s, floorY + bob * s);
      g.scale(s, s);
      if (tint) g.filter = `drop-shadow(0 0 ${4}px ${tint}) brightness(1.4) saturate(0.4)`;
      drawCharacter(g, c, 'side', 1.25, true, EXPR[ab] ?? 'angry', 'cast');
      g.restore();
    };
    {
      if (ab === 'clone') drawHero(0.35, 16, '#7dffef');
      if (ab === 'investida' || ab === 'turbo') {
        drawHero(0.18, -22);
        drawHero(0.32, -12);
      }
      if (ab === 'sombra') drawHero(0.25, -18, '#ff3b5c');
    }
    const fading = ab === 'fase' ? 0.55 + 0.25 * Math.sin(t * 5) : ab === 'fumaca' ? 0.85 : 1;
    drawHero(fading);
    this.effectFront(g, ab, c, H, s, ox, floorY, dt);
    this.updateParts(g, dt);

    if (this.locked) {
      // selo de bloqueado (o poder aparece como amostra)
      g.font = `700 ${Math.max(11, h * 0.028)}px "Chakra Petch", sans-serif`;
      const txt = this.lockNote || `${this.c?.name ?? 'Personagem'} · bloqueado`;
      const tw = g.measureText(txt).width + 22;
      g.fillStyle = 'rgba(8,6,22,0.8)';
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(w / 2 - tw / 2, 12, tw, h * 0.028 + 14, 10);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffd23e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, w / 2, 12 + (h * 0.028 + 14) / 2);
    }
  }

  // ================================================================== efeitos
  private emit(p: Partial<P> & { x: number; y: number }) {
    if (this.parts.length > 260) return;
    this.parts.push({ vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 'dot', ...p });
  }

  private effectBack(g: CanvasRenderingContext2D, ab: string, c: CharacterDef, H: { x: number; y: number }, s: number, ox: number, fy: number) {
    const t = this.t;
    switch (ab) {
      case 'gravidade': {
        // buraco negro à frente
        const cx = H.x + 26 * s;
        const cy = H.y - 2 * s;
        const R = 30 * s;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(0.25, 'rgba(40,20,100,0.95)');
        gr.addColorStop(0.6, hexA('#8c7cff', 0.25));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, R * 1.6, 0, Math.PI * 2);
        g.fill();
        for (let i = 0; i < 5; i++) {
          g.strokeStyle = hexA('#c8c0ff', 0.6 - i * 0.08);
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(cx, cy, R * (0.4 + i * 0.25), R * (0.18 + i * 0.1), -0.3, -t * (4 - i * 0.5) + i, -t * (4 - i * 0.5) + i + Math.PI * 1.2);
          g.stroke();
        }
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          const d = R * (1.6 + Math.random());
          this.emit({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.6, vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d, max: 0.6, size: 2, color: Math.random() < 0.5 ? '#c8c0ff' : '#ffffff' });
        }
        break;
      }
      case 'fumaca':
      case 'fase': {
        const smoke = ab === 'fumaca';
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * 0.25;
          const d = (smoke ? 34 : 26) * s * (0.8 + 0.2 * Math.sin(t + i));
          const r = (smoke ? 20 : 15) * s;
          g.fillStyle = smoke ? `rgba(${140 + i * 6},${146 + i * 6},${164 + i * 5},0.5)` : hexA(i % 2 ? '#ff4fc3' : '#7a3cff', 0.18);
          g.beginPath();
          g.arc(ox + Math.cos(a) * d, fy - 32 * s + Math.sin(a) * d * 0.7, r, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'cura': {
        const gr = g.createRadialGradient(ox, fy, 2, ox, fy, 46 * s);
        gr.addColorStop(0, hexA('#5dffb8', 0.5));
        gr.addColorStop(1, hexA('#5dffb8', 0));
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(ox, fy, 46 * s, 12 * s, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'turbo':
        for (let i = 0; i < 9; i++) {
          const y = fy - (8 + i * 7) * s;
          const len = (30 + ((i * 37 + t * 400) % 60)) * s;
          g.strokeStyle = hexA('#9ef0ff', 0.5);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(ox - 14 * s, y);
          g.lineTo(ox - 14 * s - len, y);
          g.stroke();
        }
        break;
    }
  }

  private effectFront(g: CanvasRenderingContext2D, ab: string, c: CharacterDef, H: { x: number; y: number }, s: number, ox: number, fy: number, dt: number) {
    const t = this.t;
    const col = c.glow ?? c.color;
    // brilho na mão
    const hg = g.createRadialGradient(H.x, H.y, 0, H.x, H.y, 14 * s);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)');
    hg.addColorStop(0.3, hexA(col, 0.6));
    hg.addColorStop(1, hexA(col, 0));
    g.fillStyle = hg;
    g.beginPath();
    g.arc(H.x, H.y, 14 * s, 0, Math.PI * 2);
    g.fill();

    switch (ab) {
      case 'escudo': {
        // escudo de energia hexagonal desviando tiros
        const cx = H.x + 14 * s;
        const cy = H.y + 6 * s;
        const rx = 13 * s;
        const ry = 42 * s;
        g.save();
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
        g.ellipse(cx - 4 * s, cy, rx * 0.4, ry, 0, Math.PI / 2, -Math.PI / 2, true);
        g.closePath();
        const sg = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
        sg.addColorStop(0, hexA('#5dff8a', 0.15));
        sg.addColorStop(1, hexA('#5dff8a', 0.5));
        g.fillStyle = sg;
        g.fill();
        g.clip();
        g.strokeStyle = hexA('#c8ffd8', 0.55);
        g.lineWidth = 1.2;
        const hs = 7 * s;
        for (let row = -7; row <= 7; row++)
          for (let k2 = -2; k2 <= 2; k2++) {
            const x = cx + k2 * hs * 1.5;
            const y = cy + row * hs * 0.87 * 2 + (k2 % 2 ? hs * 0.87 : 0);
            g.beginPath();
            for (let i = 0; i < 6; i++) g.lineTo(x + Math.cos((i / 6) * Math.PI * 2) * hs, y + Math.sin((i / 6) * Math.PI * 2) * hs);
            g.closePath();
            g.stroke();
          }
        g.restore();
        g.strokeStyle = '#c8ffd8';
        g.lineWidth = 3;
        g.shadowColor = '#5dff8a';
        g.shadowBlur = 14;
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
        g.stroke();
        g.shadowBlur = 0;
        // tiros chegando e ricocheteando
        const ph = (t * 0.9) % 1;
        const bx = this.w + 20 - ph * (this.w + 20 - cx - rx);
        const by = cy - 10 * s + Math.sin(t * 3) * 14 * s;
        g.strokeStyle = '#ffb347';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + 22, by);
        g.stroke();
        if (ph > 0.94 && Math.random() < 0.8)
          for (let i = 0; i < 6; i++) this.emit({ x: cx + rx, y: by, vx: 80 + Math.random() * 160, vy: (Math.random() - 0.5) * 260, max: 0.5, size: 2.2, color: Math.random() < 0.5 ? '#ffd23e' : '#ffffff', kind: 'spark' });
        break;
      }
      case 'turbo': {
        // raios elétricos em volta do corpo
        g.strokeStyle = '#bff4ff';
        g.lineWidth = 2;
        g.shadowColor = '#3ee8ff';
        g.shadowBlur = 12;
        for (let k2 = 0; k2 < 3; k2++) {
          if (Math.random() < 0.35) continue;
          g.beginPath();
          let x = ox + (Math.random() - 0.5) * 30 * s;
          let y = fy - Math.random() * 70 * s;
          g.moveTo(x, y);
          for (let i = 0; i < 5; i++) {
            x += (Math.random() - 0.5) * 18 * s;
            y += (Math.random() - 0.3) * 12 * s;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        g.shadowBlur = 0;
        if (Math.random() < 0.5) this.emit({ x: ox - 10 * s, y: fy - Math.random() * 60 * s, vx: -260, vy: 0, max: 0.35, size: 2, color: '#9ef0ff', kind: 'spark' });
        break;
      }
      case 'fase':
        if (Math.random() < 0.4) this.emit({ x: ox + (Math.random() - 0.5) * 40 * s, y: fy - Math.random() * 70 * s, vy: -20, max: 1.2, size: 2.5, color: '#ff8ae0', kind: 'star' });
        break;
      case 'teleporte': {
        for (const [px, sc] of [
          [H.x + 6 * s, 1],
          [H.x + 52 * s, 0.75],
        ] as const) {
          for (let i = 0; i < 3; i++) {
            g.strokeStyle = hexA(i ? '#ffd23e' : '#ffffff', 0.85 - i * 0.2);
            g.lineWidth = 3;
            g.beginPath();
            g.ellipse(px, H.y, 6 * s * sc, 22 * s * sc - i * 4 * s, 0, t * (3 + i) + i, t * (3 + i) + i + Math.PI * 1.5);
            g.stroke();
          }
        }
        if (Math.random() < 0.5) this.emit({ x: H.x + 6 * s, y: H.y, vx: 300, vy: (Math.random() - 0.5) * 40, max: 0.4, size: 2, color: '#ffd23e', kind: 'spark' });
        break;
      }
      case 'explosao': {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.8 + i / 3) % 1;
          g.strokeStyle = hexA(i % 2 ? '#ffffff' : '#ff7a59', 0.9 * (1 - ph));
          g.lineWidth = 4 * (1 - ph) + 1;
          g.beginPath();
          g.arc(H.x + 8 * s, H.y, (6 + ph * 50) * s, -1.1, 1.1);
          g.stroke();
        }
        if (Math.random() < 0.3) this.emit({ x: H.x, y: H.y, vx: 60 + Math.random() * 120, vy: (Math.random() - 0.5) * 140, max: 1, size: 3, color: '#ffd23e', kind: 'star' });
        break;
      }
      case 'clone':
        g.save();
        g.globalAlpha = 0.35;
        g.fillStyle = '#7dffef';
        for (let y = fy - 72 * s; y < fy; y += 4) g.fillRect(ox + 4 * s, y + ((t * 40) % 4), 24 * s, 1);
        g.restore();
        break;
      case 'sombra': {
        // estrela ninja girando
        const sx = H.x + ((t * 1.3) % 1) * (this.w - H.x);
        g.save();
        g.translate(sx, H.y);
        g.rotate(t * 18);
        g.fillStyle = '#d8dce8';
        g.strokeStyle = '#141018';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = (i % 2 ? 2.2 : 7) * s;
          g.lineTo(Math.cos((i / 8) * Math.PI * 2) * r, Math.sin((i / 8) * Math.PI * 2) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
        if (Math.random() < 0.5) this.emit({ x: ox + (Math.random() - 0.5) * 30 * s, y: fy - Math.random() * 70 * s, vx: -40, vy: -30, max: 0.9, size: 6, color: 'rgba(20,10,30,0.6)', kind: 'puff' });
        break;
      }
      case 'torreta': {
        const tx = H.x + 24 * s;
        const ty = fy;
        g.fillStyle = '#4a5262';
        g.strokeStyle = '#141820';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(tx - 10 * s, ty - 16 * s, 20 * s, 16 * s, 4 * s);
        g.fill();
        g.stroke();
        g.fillStyle = '#9aa6bc';
        g.beginPath();
        g.roundRect(tx - 2 * s, ty - 22 * s, 20 * s, 6 * s, 2 * s);
        g.fill();
        g.stroke();
        g.fillStyle = c.color;
        g.beginPath();
        g.arc(tx, ty - 19 * s, 3.5 * s, 0, Math.PI * 2);
        g.fill();
        if (Math.random() < 0.18) {
          this.emit({ x: tx + 20 * s, y: ty - 19 * s, vx: 700, vy: 0, max: 0.5, size: 3, color: '#9ef0ff', kind: 'spark' });
          this.emit({ x: tx + 20 * s, y: ty - 19 * s, max: 0.08, size: 10, color: '#ffffff' });
        }
        break;
      }
      case 'cura':
        if (Math.random() < 0.35) this.emit({ x: ox + (Math.random() - 0.5) * 50 * s, y: fy - Math.random() * 20 * s, vy: -40 - Math.random() * 30, max: 1.6, size: 4 * s * 0.3 + 3, color: '#5dffb8', kind: 'cross' });
        break;
      case 'investida': {
        // linhas de impacto e poeira
        g.strokeStyle = hexA('#ffffff', 0.8);
        g.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(H.x + 4 * s, H.y + 8 * s, (16 + i * 8) * s, -0.9, 0.9);
          g.stroke();
        }
        if (Math.random() < 0.7) this.emit({ x: ox - 10 * s + Math.random() * 20 * s, y: fy - 2, vx: -80 - Math.random() * 120, vy: -30 - Math.random() * 60, max: 0.8, size: 5, color: 'rgba(200,160,110,0.55)', kind: 'puff' });
        break;
      }
      case 'muralha': {
        // muro de cristais de gelo
        const wx = H.x + 16 * s;
        const grow = Math.min(1, (t % 4) * 2);
        for (let i = 0; i < 5; i++) {
          const hh = (38 + ((i * 7) % 11) * 2) * s * grow;
          const x = wx + i * 5 * s;
          const gr = g.createLinearGradient(x, fy - hh, x + 8 * s, fy);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.5, '#9fe8ff');
          gr.addColorStop(1, '#3a8ad0');
          g.fillStyle = gr;
          g.strokeStyle = '#1a4a7a';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x, fy);
          g.lineTo(x + 2 * s, fy - hh);
          g.lineTo(x + 6 * s, fy - hh - 6 * s);
          g.lineTo(x + 9 * s, fy - hh + 2 * s);
          g.lineTo(x + 10 * s, fy);
          g.closePath();
          g.fill();
          g.stroke();
        }
        if (Math.random() < 0.4) this.emit({ x: Math.random() * this.w, y: -5, vx: -10, vy: 40 + Math.random() * 30, max: 4, size: 2.2, color: '#ffffff', kind: 'flake' });
        break;
      }
      case 'raio': {
        // corrente elétrica pulando entre alvos
        const pts = [
          [H.x, H.y],
          [H.x + 34 * s, H.y - 18 * s],
          [H.x + 56 * s, H.y + 8 * s],
          [H.x + 82 * s, H.y - 12 * s],
        ];
        if (Math.random() < 0.85)
          for (const [wd, cc] of [
            [8, hexA('#ffe14a', 0.35)],
            [2.5, '#ffffff'],
          ] as const) {
            g.strokeStyle = cc;
            g.lineWidth = wd;
            g.beginPath();
            g.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
              const [x0, y0] = pts[i - 1];
              const [x1, y1] = pts[i];
              for (let k2 = 1; k2 <= 5; k2++) {
                const f = k2 / 5;
                const j = k2 === 5 ? 0 : (Math.random() - 0.5) * 14 * s;
                g.lineTo(x0 + (x1 - x0) * f + j, y0 + (y1 - y0) * f + j);
              }
            }
            g.stroke();
          }
        for (const [x, y] of pts.slice(1)) {
          const gr = g.createRadialGradient(x, y, 0, x, y, 10 * s);
          gr.addColorStop(0, 'rgba(255,255,220,0.9)');
          gr.addColorStop(1, 'rgba(255,225,74,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(x, y, 10 * s, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'gancho': {
        const ph = (t * 0.7) % 1;
        const ext = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        const hx = H.x + ext * 80 * s;
        g.strokeStyle = '#3a2a1a';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(H.x, H.y);
        g.quadraticCurveTo((H.x + hx) / 2, H.y + 6 * s * (1 - ext), hx, H.y);
        g.stroke();
        g.strokeStyle = '#c8a070';
        g.lineWidth = 1.2;
        g.stroke();
        g.strokeStyle = '#d8d8e0';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(hx, H.y);
        g.lineTo(hx + 6 * s, H.y);
        g.moveTo(hx + 6 * s, H.y);
        g.arc(hx + 6 * s, H.y - 4 * s, 4 * s, Math.PI / 2, -Math.PI / 4, true);
        g.moveTo(hx + 6 * s, H.y);
        g.arc(hx + 6 * s, H.y + 4 * s, 4 * s, -Math.PI / 2, Math.PI / 4, false);
        g.stroke();
        break;
      }
      case 'fumaca':
        if (Math.random() < 0.4) this.emit({ x: ox + (Math.random() - 0.5) * 60 * s, y: fy - Math.random() * 50 * s, vx: (Math.random() - 0.5) * 30, vy: -15, max: 1.5, size: 12, color: 'rgba(170,176,192,0.4)', kind: 'puff' });
        break;
    }
    void dt;
  }

  private updateParts(g: CanvasRenderingContext2D, dt: number) {
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') {
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
      const k = p.life / p.max;
      if (k >= 1) continue;
      g.globalAlpha = p.kind === 'flake' ? Math.min(1, (1 - k) * 3) : 1 - k;
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      switch (p.kind) {
        case 'cross':
          g.fillRect(p.x - p.size / 2, p.y - p.size * 1.5, p.size, p.size * 3);
          g.fillRect(p.x - p.size * 1.5, p.y - p.size / 2, p.size * 3, p.size);
          break;
        case 'puff':
          g.beginPath();
          g.arc(p.x, p.y, p.size * (1 + k * 1.5), 0, Math.PI * 2);
          g.fill();
          break;
        case 'star':
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? p.size * 0.45 : p.size;
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            g.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          }
          g.closePath();
          g.fill();
          break;
        case 'spark':
          g.lineWidth = p.size;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          g.stroke();
          break;
        default:
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.fill();
      }
    }
    g.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life < p.max);
  }
}
