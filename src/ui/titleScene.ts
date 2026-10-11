import { CHARACTERS, CharacterDef } from '../game/characters';
import { ORIGIN_X, ORIGIN_Y, SPRITE_H, SPRITE_W, SpriteCache, WALK_FRAMES } from '../render/sprites';
import { dpr, hexA } from './portraits';

// Fundo animado da tela inicial (vetor): céu cósmico, chão neon e um desfile de
// personagens correndo no horizonte com seus Ecos atrás.

interface Runner {
  c: CharacterDef;
  side: -1 | 1;
  row: number;
  phase: number;
}

export class TitleScene {
  private ctx: CanvasRenderingContext2D;
  private sprites = new SpriteCache();
  private runners: Runner[] = [];
  private stars: { x: number; y: number; z: number }[] = [];
  private w = 0;
  private h = 0;
  private k = 1;
  private unit = 1;
  running = false;
  private raf = 0;
  private hero: CharacterDef = CHARACTERS[0];

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
    for (let i = 0; i < 90; i++) this.stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 });
    this.setHero(CHARACTERS[0]);
  }

  setHero(c: CharacterDef) {
    this.hero = c;
    const others = CHARACTERS.filter((x) => x.id !== c.id);
    // desfile: duas faixas no horizonte, indo em sentidos opostos
    this.runners = others.slice(0, 8).map((o, i) => ({ c: o, side: (i % 2 ? 1 : -1) as 1 | -1, row: Math.floor(i / 2) % 2, phase: i * 0.37 }));
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.k = dpr();
    this.cv.width = Math.round(this.w * this.k);
    this.cv.height = Math.round(this.h * this.k);
    // tamanho do personagem: ~42% da altura em paisagem
    this.unit = this.h > this.w ? Math.min(this.h * 0.0016, this.w * 0.004) : Math.min(this.h * 0.0026, this.w * 0.0016);
    this.sprites.setScale(this.unit * this.k);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = (t: number) => {
      if (!this.running) return;
      this.draw(t / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(t: number) {
    const g = this.ctx;
    const { w, h, k } = this;
    g.setTransform(k, 0, 0, k, 0, 0);
    // céu
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a0620');
    sky.addColorStop(0.55, '#1c0c44');
    sky.addColorStop(1, '#2a0f52');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (const [x, y, r, c] of [
      [0.2, 0.3, 0.5, 'rgba(166,120,255,0.22)'],
      [0.82, 0.25, 0.45, 'rgba(62,232,255,0.16)'],
      [0.5, 1.05, 0.6, 'rgba(255,79,195,0.14)'],
    ] as const) {
      const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
      gr.addColorStop(0, c);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    // estrelas
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.x * 40);
      g.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.5 * s.z})`;
      g.fillRect(s.x * w, s.y * h * 0.62, 1.4 * s.z + 0.4, 1.4 * s.z + 0.4);
    }
    // chão neon em perspectiva
    const horizon = h > w ? h * 0.42 : h * 0.62;
    const floor = g.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, 'rgba(20,10,50,0.0)');
    floor.addColorStop(1, 'rgba(20,10,50,0.9)');
    g.fillStyle = floor;
    g.fillRect(0, horizon, w, h - horizon);
    g.strokeStyle = 'rgba(166,120,255,0.35)';
    g.lineWidth = 1;
    const off = (t * 0.6) % 1;
    for (let i = 0; i < 12; i++) {
      const z = (i + off) / 12;
      const y = horizon + (h - horizon) * z * z;
      g.globalAlpha = z;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = -10; i <= 10; i++) {
      g.strokeStyle = 'rgba(62,232,255,0.18)';
      g.beginPath();
      g.moveTo(w / 2 + i * w * 0.02, horizon);
      g.lineTo(w / 2 + i * w * 0.16, h);
      g.stroke();
    }

    // desfile de personagens no horizonte, cada um com seus Ecos atrás
    const u = this.unit;
    const list = [...this.runners].sort((a, b) => a.row - b.row);
    for (const r of list) {
      const sc = r.row ? 0.78 : 1;
      const y = horizon + (h - horizon) * (r.row ? 0.12 : 0.24);
      const speed = (r.row ? 46 : 64) * (w / 1000);
      const span = w + 240;
      const pos = (((t * speed + r.phase * span) % span) + span) % span - 120;
      const x = r.side > 0 ? pos : w - pos;
      const flip = r.side < 0;
      const bob = Math.abs(Math.sin(t * 7 + r.phase * 9)) * 3 * u;
      const frame = Math.floor(((t * 7 + r.phase * 9) / (Math.PI * 2)) * WALK_FRAMES * 2) % WALK_FRAMES;
      g.globalAlpha = r.row ? 0.7 : 0.9;
      for (let e = 3; e >= 1; e--) {
        const ex = x + (flip ? 1 : -1) * e * 26 * u * sc;
        const ghost = this.sprites.get(r.c, 'side', (frame + e * 2) % WALK_FRAMES, true, r.c.color);
        g.globalAlpha = (0.42 / e) * (r.row ? 0.7 : 1);
        g.globalCompositeOperation = 'lighter';
        this.drawSprite(ghost, ex, y - bob * 0.6, flip, sc);
        g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = r.row ? 0.75 : 1;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(x, y, 15 * u * sc, 4.5 * u * sc, 0, 0, Math.PI * 2);
      g.fill();
      const img = this.sprites.get(r.c, 'side', frame, true, null);
      this.drawSprite(img, x, y - bob, flip, sc);
      g.globalAlpha = 1;
    }
    // partículas subindo
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const px = ((i * 137.7) % 1000) / 1000;
      const ph = (t * (0.04 + (i % 5) * 0.01) + i * 0.13) % 1;
      const py = h * (1 - ph);
      g.fillStyle = i % 3 ? 'rgba(62,232,255,0.5)' : 'rgba(255,79,216,0.5)';
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
      g.beginPath();
      g.arc(px * w + Math.sin(t + i) * 10, py, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // escurece o lado do menu para o texto ficar legível
    const portrait = h > w;
    const vg = portrait ? g.createLinearGradient(0, h * 0.45, 0, h) : g.createLinearGradient(0, 0, w * 0.55, 0);
    vg.addColorStop(0, portrait ? 'rgba(8,5,22,0)' : 'rgba(8,5,22,0.7)');
    vg.addColorStop(1, portrait ? 'rgba(8,5,22,0.75)' : 'rgba(8,5,22,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }

  private drawSprite(img: HTMLCanvasElement, x: number, y: number, flip: boolean, sc: number) {
    const g = this.ctx;
    const wpx = img.width / this.k;
    const hpx = img.height / this.k;
    const ox = (ORIGIN_X / SPRITE_W) * wpx * sc;
    const oy = (ORIGIN_Y / SPRITE_H) * hpx * sc;
    g.save();
    g.translate(x, y);
    if (flip) g.scale(-1, 1);
    g.drawImage(img, -ox, -oy, wpx * sc, hpx * sc);
    g.restore();
  }
}
