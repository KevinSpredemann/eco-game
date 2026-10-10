import type { CharacterDef } from '../game/characters';

export type Facing = 'down' | 'up' | 'side';

/** Desenho procedural (vetorial) dos personagens em vista 3/4. Origem = pés. Altura ≈ 52 unidades. */
export function drawCharacter(ctx: CanvasRenderingContext2D, c: CharacterDef, facing: Facing, phase: number, moving: boolean) {
  const sw = moving ? Math.sin(phase) : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * 1.6 : 0;
  const back = facing === 'up';
  const side = facing === 'side';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = 'rgba(8,6,20,0.9)';

  // pernas
  const legY = -12;
  const legs = side ? [[-3, sw * 5], [3, -sw * 5]] : [[-6, 0], [6, 0]];
  legs.forEach(([lx, off], i) => {
    const lift = side ? 0 : (i === 0 ? sw : -sw) * 3;
    ctx.fillStyle = c.suitDark;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    rr(ctx, lx - 4 + off, legY - lift, 8, 11, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2f2f7';
    rr(ctx, lx - 5 + off * 1.1, legY + 8 - lift, 10, 5, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.fillRect(lx - 4 + off * 1.1, legY + 11 - lift, 8, 1.5);
  });

  ctx.translate(0, -bob);

  // mochila (atrás)
  if (c.backpack && !back) {
    ctx.fillStyle = c.backpack;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    rr(ctx, side ? -15 : -13, -34, side ? 9 : 26, 18, 5);
    ctx.fill();
    ctx.stroke();
  }

  // braços
  const armSwing = side ? sw * 6 : sw * 3;
  const arms = side ? [[0, armSwing]] : [[-14, armSwing], [14, -armSwing]];
  for (const [ax, s] of arms) {
    ctx.fillStyle = c.suit;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    rr(ctx, ax - 4 + s * 0.3, -30 + Math.abs(s) * 0.2, 8, 14, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(ax + s * 0.4, -15, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // tronco
  ctx.fillStyle = c.suit;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  rr(ctx, side ? -9 : -11, -33, side ? 18 : 22, 21, 6);
  ctx.fill();
  ctx.stroke();
  // detalhes luminosos
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (!back) {
    ctx.moveTo(side ? 2 : -7, -30);
    ctx.lineTo(side ? 2 : -7, -15);
    if (!side) {
      ctx.moveTo(7, -30);
      ctx.lineTo(7, -15);
    }
  } else {
    ctx.moveTo(-8, -22);
    ctx.lineTo(8, -22);
  }
  ctx.stroke();
  ctx.fillStyle = c.suitDark;
  ctx.fillRect(side ? -9 : -11, -15, side ? 18 : 22, 3);

  // mochila (vista de costas)
  if (c.backpack && back) {
    ctx.fillStyle = c.backpack;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    rr(ctx, -10, -32, 20, 17, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.fillRect(-6, -27, 12, 2);
  }

  // cabeça
  const hy = -44;
  drawHead(ctx, c, facing, hy, outline);
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, c: CharacterDef, facing: Facing, hy: number, outline: string) {
  const back = facing === 'up';
  const side = facing === 'side';
  const R = 12.5;

  // cabelo de trás (rabo de cavalo)
  if (c.headwear === 'ponytail' || c.headwear === 'capgoggles') {
    ctx.fillStyle = c.hair;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side) ctx.ellipse(-12, hy - 2, 9, 6, -0.5, 0, Math.PI * 2);
    else {
      ctx.ellipse(-12, hy + 2, 6, 9, 0.4, 0, Math.PI * 2);
      ctx.moveTo(18, hy + 2);
      ctx.ellipse(12, hy + 2, 6, 9, -0.4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  // capuz atrás
  if (c.headwear === 'hood') {
    ctx.fillStyle = c.suit;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, hy, R + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // rosto
  ctx.fillStyle = back ? c.hair : c.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, hy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (c.headwear === 'hood') {
    // interior escuro + visor luminoso
    ctx.fillStyle = '#0d0818';
    ctx.beginPath();
    ctx.arc(side ? 3 : 0, hy + 1, R - 2, 0, Math.PI * 2);
    ctx.fill();
    if (!back) {
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.color;
      rr(ctx, side ? 0 : -8, hy - 2, side ? 10 : 16, 5, 2.5);
      ctx.fill();
    } else {
      ctx.fillStyle = c.suit;
      ctx.beginPath();
      ctx.arc(0, hy, R + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, hy, R - 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    return;
  }

  // cabelo/franja
  ctx.fillStyle = c.hair;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (back) {
    ctx.arc(0, hy, R, 0, Math.PI * 2);
  } else if (side) {
    ctx.moveTo(-R, hy + 2);
    ctx.quadraticCurveTo(-R, hy - R - 3, 4, hy - R - 1);
    ctx.quadraticCurveTo(R + 3, hy - R + 2, R + 1, hy - 3);
    ctx.lineTo(4, hy - 5);
    ctx.lineTo(0, hy - 2);
    ctx.lineTo(-4, hy + 4);
    ctx.closePath();
  } else {
    ctx.moveTo(-R - 1, hy + 3);
    ctx.quadraticCurveTo(-R - 2, hy - R - 4, 0, hy - R - 2);
    ctx.quadraticCurveTo(R + 2, hy - R - 4, R + 1, hy + 3);
    ctx.lineTo(7, hy - 4);
    ctx.lineTo(3, hy - 1);
    ctx.lineTo(-1, hy - 5);
    ctx.lineTo(-6, hy - 2);
    ctx.lineTo(-9, hy - 4);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // olhos
  if (!back) {
    const eyes = side ? [5] : [-4.5, 4.5];
    for (const ex of eyes) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, hy + 1, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1430';
      ctx.beginPath();
      ctx.arc(ex + (side ? 0.8 : 0), hy + 1.6, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // acessórios
  switch (c.headwear) {
    case 'mask':
      if (!back) {
        ctx.fillStyle = '#1d3a6b';
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (side) rr(ctx, 0, hy + 4, 12, 7, 3);
        else rr(ctx, -9, hy + 4, 18, 7.5, 3.5);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'ponytail':
      // fone
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, hy, R + 1, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = c.color;
      for (const ex of side ? [-2] : [-R, R]) {
        ctx.beginPath();
        ctx.arc(ex, hy + 1, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'cap':
    case 'capgoggles': {
      const capCol = c.headwear === 'cap' ? '#2a2a2e' : '#d8d8e0';
      ctx.fillStyle = capCol;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, hy - 3, R + 0.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!back) {
        ctx.beginPath();
        if (side) ctx.ellipse(10, hy - 3, 8, 2.6, 0, 0, Math.PI * 2);
        else ctx.ellipse(0, hy - 3, 13, 3.4, 0, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(side ? -2 : 0, hy - 9, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (c.headwear === 'capgoggles') drawGoggles(ctx, hy - 11, side, c.color, outline);
      break;
    }
    case 'goggles':
      drawGoggles(ctx, hy - 7, side, c.color, outline);
      break;
  }
}

function drawGoggles(ctx: CanvasRenderingContext2D, y: number, side: boolean, col: string, outline: string) {
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-12, y + 1);
  ctx.lineTo(12, y + 1);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  for (const ex of side ? [5] : [-5, 5]) {
    ctx.beginPath();
    ctx.ellipse(ex, y, 4.6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(ex - 1.5, y - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
  }
}

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
const SPRITE_W = 64;
const SPRITE_H = 72;
const ORIGIN_X = 32;
const ORIGIN_Y = 64;
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
