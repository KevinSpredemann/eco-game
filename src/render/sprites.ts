import type { CharacterDef } from '../game/characters';

import { drawCharacter as drawChar, type Facing } from './chars';
export type { Facing };
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
const SPRITE_W = 76;
const SPRITE_H = 86;
const ORIGIN_X = 38;
const ORIGIN_Y = 78;
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

  get(c: CharacterDef, facing: Facing, frame: number, moving: boolean, ghost: string | null): HTMLCanvasElement {
    const key = `${c.id}|${facing}|${moving ? frame : 'i'}|${ghost ?? ''}`;
    let cv = this.cache.get(key);
    if (cv) return cv;
    const base = this.render(c, facing, frame, moving);
    cv = ghost ? this.ghostify(base, ghost) : base;
    this.cache.set(key, cv);
    return cv;
  }

  private render(c: CharacterDef, facing: Facing, frame: number, moving: boolean) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(SPRITE_W * this.px);
    cv.height = Math.ceil(SPRITE_H * this.px);
    const ctx = cv.getContext('2d')!;
    ctx.scale(this.px, this.px);
    ctx.translate(ORIGIN_X, ORIGIN_Y);
    drawCharacter(ctx, c, facing, (frame / WALK_FRAMES) * Math.PI * 2, moving);
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
