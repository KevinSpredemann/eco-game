import type { CharacterDef } from '../game/characters';

import { drawCharacter as drawChar, type Expr, type Facing, type Pose } from './chars';
export type { Expr, Facing, Pose };
export const drawCharacter = drawChar;

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Símbolo de origem (não depender só de cor). */
export function drawSymbol(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 10, s / 10);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (id) {
    case 'kael': // raio
      ctx.moveTo(2, -10);
      ctx.lineTo(-6, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, 10);
      ctx.lineTo(6, -2);
      ctx.lineTo(0, -2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'luna': // lua
      ctx.arc(0, 0, 8, 0.6, Math.PI * 2 - 0.6);
      ctx.arc(4, 0, 6, Math.PI * 2 - 0.9, 0.9, true);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bruno': // escudo
      ctx.moveTo(0, -9);
      ctx.lineTo(8, -5);
      ctx.lineTo(6, 4);
      ctx.lineTo(0, 9);
      ctx.lineTo(-6, 4);
      ctx.lineTo(-8, -5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'zoe': // mira
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      break;
    case 'maya': // estrela
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 4 : 9.5;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'nyx': // estrela ninja
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 3 : 10;
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'rex': // engrenagem
      ctx.lineWidth = 3;
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
      }
      ctx.stroke();
      break;
    case 'iris': // cruz de cura
      ctx.rect(-3, -9, 6, 18);
      ctx.rect(-9, -3, 18, 6);
      ctx.fill();
      break;
    case 'tara': // punho / chifre de touro
      ctx.moveTo(-9, -6);
      ctx.quadraticCurveTo(-8, 4, 0, 6);
      ctx.quadraticCurveTo(8, 4, 9, -6);
      ctx.quadraticCurveTo(5, 0, 0, 1);
      ctx.quadraticCurveTo(-5, 0, -9, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-3, 4, 6, 5);
      break;
    case 'kai': // floco de neve
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9);
      }
      ctx.stroke();
      break;
    case 'leo': // raio duplo
      ctx.moveTo(0, -10);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, 10);
      ctx.lineTo(7, -3);
      ctx.lineTo(1, -3);
      ctx.lineTo(4, -10);
      ctx.closePath();
      ctx.fill();
      break;
    case 'mei': // espiral
      ctx.lineWidth = 2.4;
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.42;
        const r = 1 + i * 0.22;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      break;
    case 'duda': // gancho
      ctx.lineWidth = 3;
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 3);
      ctx.arc(-4, 3, 4, 0, Math.PI, false);
      ctx.moveTo(0, 3);
      ctx.arc(4, 3, 4, Math.PI, 0, true);
      ctx.stroke();
      break;
    case 'bento': // nuvem de fumaça
      ctx.arc(-4, 2, 5, 0, Math.PI * 2);
      ctx.arc(4, 2, 5, 0, Math.PI * 2);
      ctx.arc(0, -3, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'vortex': // núcleo de plasma
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'nara': // broto
      ctx.lineWidth = 2.4;
      ctx.moveTo(0, 9);
      ctx.lineTo(0, -1);
      ctx.moveTo(0, 1);
      ctx.quadraticCurveTo(-9, -2, -6, -9);
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(9, -3, 6, -10);
      ctx.stroke();
      break;
    case 'vexa': // máscara
      ctx.moveTo(-8, -3);
      ctx.lineTo(0, 8);
      ctx.lineTo(8, -3);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -1);
      ctx.lineTo(4, -1);
      ctx.stroke();
      break;
    case 'metra': // compasso
      ctx.moveTo(0, 8);
      ctx.lineTo(-7, -6);
      ctx.lineTo(7, -6);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(5, -4);
      ctx.stroke();
      break;
    default: // hexágono (zed)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cache de sprites
export const SPRITE_W = 80;
export const SPRITE_H = 94;
export const ORIGIN_X = 40;
export const ORIGIN_Y = 86;
export const WALK_FRAMES = 8;

export class SpriteCache {
  private cache = new Map<string, HTMLCanvasElement>();
  private px = 1;
  setScale(px: number) {
    const q = Math.max(0.5, Math.round(px * 4) / 4);
    if (q !== this.px) {
      this.px = q;
      this.cache.clear();
    }
  }

  /** luz e sombra nos sprites (desligado na qualidade baixa) */
  lighting = true;
  setLighting(on: boolean) {
    if (on !== this.lighting) {
      this.lighting = on;
      this.cache.clear();
    }
  }

  get(c: CharacterDef, facing: Facing, frame: number, moving: boolean, ghost: string | null, expr: Expr = 'neutral', pose: Pose = 'normal'): HTMLCanvasElement {
    if (ghost) expr = 'neutral';
    if (facing !== 'side') pose = 'normal';
    const key = `${c.id}:${c.skinId ?? ''}|${facing}|${moving ? 'm' : 'i'}${frame}|${ghost ?? ''}|${expr}|${pose}`;
    let cv = this.cache.get(key);
    if (cv) return cv;
    if (this.cache.size > 2500) this.cache.clear();
    const base = this.render(c, facing, frame, moving, expr, pose);
    cv = ghost ? this.ghostify(base, ghost) : base;
    this.cache.set(key, cv);
    return cv;
  }

  private render(c: CharacterDef, facing: Facing, frame: number, moving: boolean, expr: Expr, pose: Pose = 'normal') {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(SPRITE_W * this.px);
    cv.height = Math.ceil(SPRITE_H * this.px);
    const ctx = cv.getContext('2d')!;
    ctx.scale(this.px, this.px);
    ctx.translate(ORIGIN_X, ORIGIN_Y);
    drawCharacter(ctx, c, facing, (frame / WALK_FRAMES) * Math.PI * 2, moving, expr, pose);
    if (this.lighting) light(cv, c.glow ?? c.color, this.px);
    return cv;
  }

  private ghostify(base: HTMLCanvasElement, color: string) {
    const w = base.width;
    const h = base.height;
    const sil = document.createElement('canvas');
    sil.width = w;
    sil.height = h;
    const s = sil.getContext('2d')!;
    s.drawImage(base, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = color;
    s.fillRect(0, 0, w, h);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const o = out.getContext('2d')!;
    const k = Math.max(1, this.px * 1.6);
    o.globalAlpha = 0.9;
    for (const [dx, dy] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
      [k * 0.7, k * 0.7],
      [-k * 0.7, k * 0.7],
      [k * 0.7, -k * 0.7],
      [-k * 0.7, -k * 0.7],
    ])
      o.drawImage(sil, dx, dy);
    // interior translúcido com detalhes
    const inner = document.createElement('canvas');
    inner.width = w;
    inner.height = h;
    const i = inner.getContext('2d')!;
    i.drawImage(base, 0, 0);
    i.globalCompositeOperation = 'source-atop';
    i.globalAlpha = 0.72;
    i.fillStyle = color;
    i.fillRect(0, 0, w, h);
    i.globalAlpha = 0.25;
    i.fillStyle = '#ffffff';
    for (let y = 0; y < h; y += Math.max(2, Math.round(this.px * 3))) i.fillRect(0, y, w, Math.max(1, this.px * 0.8));
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'destination-out';
    o.drawImage(sil, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 0.7;
    o.drawImage(inner, 0, 0);
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, flip: boolean, scale = 1) {
    const w = SPRITE_W * scale;
    const h = SPRITE_H * scale;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -ORIGIN_X * scale, -ORIGIN_Y * scale, w, h);
      ctx.restore();
    } else ctx.drawImage(img, x - ORIGIN_X * scale, y - ORIGIN_Y * scale, w, h);
  }
}

export function facingOf(dir: number): { facing: Facing; flip: boolean } {
  const dx = Math.cos(dir);
  const dy = Math.sin(dir);
  if (Math.abs(dx) > Math.abs(dy) * 0.9) return { facing: 'side', flip: dx < 0 };
  return { facing: dy < 0 ? 'up' : 'down', flip: false };
}

/**
 * Iluminação do sprite (feita uma vez, fica no cache):
 * volume (luz do alto à esquerda, sombra embaixo à direita), oclusão perto dos pés
 * e luz de recorte na cor do personagem pelas bordas de cima — dá profundidade sem exagerar no degradê.
 */
function light(cv: HTMLCanvasElement, rim: string, px: number) {
  const w = cv.width;
  const h = cv.height;
  const g = cv.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  // volume
  g.globalCompositeOperation = 'source-atop';
  const vol = g.createLinearGradient(w * 0.15, h * 0.05, w * 0.85, h * 0.95);
  vol.addColorStop(0, 'rgba(255,248,235,0.13)');
  vol.addColorStop(0.45, 'rgba(255,255,255,0)');
  vol.addColorStop(1, 'rgba(10,6,40,0.30)');
  g.fillStyle = vol;
  g.fillRect(0, 0, w, h);
  // oclusão nos pés
  const ao = g.createLinearGradient(0, h * 0.72, 0, h);
  ao.addColorStop(0, 'rgba(8,4,24,0)');
  ao.addColorStop(1, 'rgba(8,4,24,0.28)');
  g.fillStyle = ao;
  g.fillRect(0, h * 0.72, w, h * 0.28);
  // luz de recorte: borda de cima/esquerda na cor do personagem
  const sil = document.createElement('canvas');
  sil.width = w;
  sil.height = h;
  const s = sil.getContext('2d')!;
  s.drawImage(cv, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = rim;
  s.fillRect(0, 0, w, h);
  s.globalCompositeOperation = 'destination-out';
  const d = Math.max(1, px * 1.4);
  s.drawImage(cv, d, d * 1.2);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.55;
  g.drawImage(sil, 0, 0);
  g.restore();
}
