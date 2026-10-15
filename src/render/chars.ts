import type { CharacterDef } from '../game/characters';

export type Facing = 'down' | 'up' | 'side';
/** expressões do rosto (mudam durante o jogo) */
export type Expr = 'neutral' | 'happy' | 'angry' | 'hurt' | 'scared' | 'blink';

// Personagens em vista 3/4, estilo cartoon detalhado: luz vinda do alto à esquerda,
// sombreamento em degradê, contorno escuro, roupas com costuras, bolsos e dobras.
// Origem = entre os pés. Altura ≈ 72 unidades.

// contorno mais fino e menos preto (visual menos "desenho chapado")
const OUT = '#1b1233';
const LINE_K = 0.72;

/** afina todas as linhas desenhadas pelo personagem sem mexer em cada parte */
function thinLines(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  return new Proxy(ctx, {
    set(t, p, v) {
      (t as any)[p] = p === 'lineWidth' ? v * LINE_K : v;
      return true;
    },
    get(t, p) {
      const v = (t as any)[p];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
const G = (c: CharacterDef) => c.glow ?? c.color;

function hexRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g)!.map(Number);
    return [m[0], m[1], m[2]];
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** clareia (amt>0) ou escurece (amt<0) */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex);
  const t = amt > 0 ? 255 : 0;
  const k = Math.abs(amt);
  return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}
/** luz lateral: claro à esquerda, escuro à direita */
function hgrad(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: string) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.22));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.32));
  return g;
}
function glowLine(ctx: CanvasRenderingContext2D, color: string, pts: [number, number][], w = 1.6) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, 0.35);
  ctx.lineWidth = w * 3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = shade(color, 0.4);
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}
/** membro em forma de cápsula afunilada (braço, perna) */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, fill: string | CanvasGradient, line = 1.8) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
  ctx.arc(x1, y1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
  ctx.arc(x0, y0, w0, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = line;
  ctx.stroke();
}

// ================================================================== visual de cada personagem
type HairStyle = 'spiky' | 'ponytail' | 'short' | 'long' | 'buns' | 'puffs' | 'mohawk' | 'curly' | 'swept' | 'none';
type Top = 'jacket' | 'hoodie' | 'parka' | 'kimono' | 'overalls' | 'labcoat' | 'ninja' | 'robot';
type Head = 'none' | 'cap' | 'capgoggles' | 'headphones' | 'hood' | 'robot' | 'headband' | 'goggles' | 'flower' | 'hoodUp';
type Face = 'none' | 'mask' | 'ninja' | 'glasses' | 'roundGlasses' | 'scarf' | 'visor';

interface Look {
  hair: string;
  hairStyle: HairStyle;
  top: Top;
  jacket: string;
  jacketDark: string;
  shirt: string;
  pants: string;
  shoe: string;
  sole: string;
  glove: string | null;
  eye: string;
  lashes: boolean;
  head: Head;
  face: Face;
  extras: string[];
  build: number;
}

function lookOf(c: CharacterDef): Look {
  const base: Look = {
    hair: c.hair,
    hairStyle: 'short',
    top: 'jacket',
    jacket: c.suit,
    jacketDark: c.suitDark,
    shirt: '#e9e6f2',
    pants: '#1c1a2e',
    shoe: '#f1f1f6',
    sole: '#ffffff',
    glove: '#22202e',
    eye: '#3a2614',
    lashes: false,
    head: 'none',
    face: 'none',
    extras: [],
    build: 1,
  };
  const L = ((): Look => {
    switch (c.id) {
      case 'kael':
        return { ...base, hairStyle: 'spiky', pants: '#1a2240', eye: '#2a6ab0', face: 'mask', shirt: '#0e1a3a' };
      case 'luna':
        return { ...base, hairStyle: 'ponytail', jacket: '#2b1830', jacketDark: '#160a1a', pants: '#21142a', eye: '#2f9a6a', shoe: '#2a2030', glove: null, head: 'headphones', lashes: true, shirt: '#ff7ad0' };
      case 'bruno':
        return { ...base, hairStyle: 'short', pants: '#23262a', eye: '#3a2412', glove: '#1a1a1a', head: 'cap', extras: ['backpack'], shirt: '#d9f5df' };
      case 'zoe':
        return { ...base, hairStyle: 'long', pants: '#232028', eye: '#6a3a14', shoe: '#2c2420', face: 'glasses', lashes: true, glove: null, extras: ['belt'] };
      case 'maya':
        return { ...base, hairStyle: 'long', jacket: '#f0e6f0', jacketDark: '#b9a6bd', pants: '#2a1a2a', eye: '#2a8a5a', head: 'capgoggles', lashes: true, glove: null, extras: ['backpack', 'freckles'] };
      case 'zed':
        return { ...base, hairStyle: 'none', top: 'hoodie', jacket: '#251c3a', jacketDark: '#120c22', pants: '#2a1e44', shoe: '#1c1a24', head: 'hoodUp', face: 'visor', extras: ['backpack'] };
      case 'nyx':
        return { ...base, hairStyle: 'spiky', top: 'ninja', pants: '#141622', shoe: '#22242e', glove: '#141622', eye: '#d02040', head: 'headband', face: 'ninja', lashes: true };
      case 'rex':
        return { ...base, hairStyle: 'none', top: 'robot', pants: '#4a5262', shoe: '#8a94a8', sole: '#5a647a', glove: '#8a94a8', eye: '#5aa0ff', head: 'robot', extras: ['backpack'] };
      case 'iris':
        return { ...base, hairStyle: 'long', top: 'labcoat', pants: '#5a8a7c', eye: '#3a8a7a', shoe: '#ffffff', glove: null, head: 'flower', lashes: true, shirt: '#36f5c0' };
      case 'tara':
        return { ...base, hairStyle: 'puffs', top: 'hoodie', pants: '#3a2a22', eye: '#3a1a0a', shoe: '#ffffff', glove: null, extras: ['earring', 'bandaid'], build: 1.16, shirt: '#ffd0a0' };
      case 'kai':
        return { ...base, hairStyle: 'swept', top: 'parka', pants: '#2a3a5a', eye: '#4ab0e0', glove: '#e8f4ff', head: 'goggles', shoe: '#dfefff', shirt: '#ffffff' };
      case 'leo':
        return { ...base, hairStyle: 'mohawk', pants: '#2a2418', eye: '#a06a10', glove: null, extras: ['earring', 'bolt'], shirt: '#2a2418' };
      case 'mei':
        return { ...base, hairStyle: 'buns', top: 'kimono', pants: '#1e1840', eye: '#2a1a3a', glove: null, lashes: true, shoe: '#2a2048', shirt: '#ff7a9a' };
      case 'duda':
        return { ...base, hairStyle: 'curly', top: 'overalls', pants: '#3a7a14', eye: '#5a3a1a', glove: '#ff8a2a', face: 'roundGlasses', lashes: true, extras: ['backpack', 'tools', 'freckles'], shirt: '#fff6e8', shoe: '#6a4a2a' };
      case 'bento':
        return { ...base, hairStyle: 'none', top: 'hoodie', pants: '#22242c', eye: '#8a9ab0', glove: null, head: 'hood', face: 'scarf', shoe: '#3a3e48', shirt: '#3a3e48' };
      case 'clave':
        return { ...base, hair: '#140c18', hairStyle: 'buns', jacket: '#e23a62', jacketDark: '#8a2040', shirt: '#ffd27a', pants: '#2a1020', shoe: '#3a1828', glove: '#2a1420', eye: '#e0a040', lashes: true, head: 'headphones', extras: ['earring'] };
      case 'fuga':
        return { ...base, hair: '#f4f7ff', hairStyle: 'spiky', jacket: '#1a3f9a', jacketDark: '#0c2260', shirt: '#cfe6ff', pants: '#101830', shoe: '#16307a', glove: '#d7ecff', eye: '#7ec8ff', head: 'cap', extras: ['earring'] };
      case 'lyra':
        return { ...base, hair: '#3a28a8', hairStyle: 'long', top: 'overalls', jacket: '#14a090', jacketDark: '#0a5048', shirt: '#241868', pants: '#123038', shoe: '#103038', glove: null, eye: '#204060', lashes: true };
      case 'metra':
        return { ...base, hair: '#e6ebf4', hairStyle: 'short', top: 'hoodie', jacket: '#4a5568', jacketDark: '#242a36', shirt: '#ffd0e4', pants: '#1c2430', shoe: '#3ad4e8', sole: '#e8fbff', glove: '#ff7ab8', eye: '#203040', head: 'cap', extras: ['earring'] };
      case 'vortex':
        return { ...base, hair: '#1a1028', hairStyle: 'spiky', top: 'labcoat', jacket: '#7a4ad0', jacketDark: '#2a1848', shirt: '#1a1028', pants: '#140c22', shoe: '#2a1848', sole: '#c86bff', glove: '#c86bff', eye: '#c86bff', head: 'goggles', extras: ['bolt'] };
      case 'nara':
        return { ...base, hair: '#1a3a22', hairStyle: 'ponytail', top: 'overalls', jacket: '#2f8a4a', jacketDark: '#143820', shirt: '#d9ffe4', pants: '#143820', shoe: '#1a3a22', sole: '#c8f0d0', glove: null, eye: '#1a5a30', lashes: true, head: 'flower', extras: ['freckles'] };
      case 'vexa':
        return { ...base, hair: '#0e0c14', hairStyle: 'long', top: 'ninja', jacket: '#3a3458', jacketDark: '#161222', shirt: '#0e0c14', pants: '#100e18', shoe: '#161222', sole: '#2a2440', glove: '#2a2440', eye: '#c8b6ff', lashes: true, head: 'hood', face: 'mask' };
      case 'resona':
        return { ...base, hair: '#3ad4e0', hairStyle: 'short', jacket: '#12a0a8', jacketDark: '#0a4850', shirt: '#ff4fc3', pants: '#1a2038', shoe: '#102830', glove: '#102028', eye: '#1a2848', lashes: true, extras: ['earring'] };
      case 'rufo':
        return { ...base, hair: '#3a2418', hairStyle: 'short', jacket: '#6a7a32', jacketDark: '#323c16', shirt: '#f0e0c0', pants: '#2a2418', shoe: '#d01818', glove: '#e02828', eye: '#3a2010', head: 'headband', extras: ['bandaid', 'backpack'], build: 1.12 };
      case 'solfa':
        return { ...base, hair: '#c4622a', hairStyle: 'curly', jacket: '#e87848', jacketDark: '#8a3818', shirt: '#ffd0a0', pants: '#6a3018', shoe: '#f2e6d8', glove: '#ffd27a', eye: '#5a3018', lashes: true, head: 'flower', extras: ['freckles'] };
      case 'vibra':
        return { ...base, hair: '#241448', hairStyle: 'puffs', top: 'hoodie', jacket: '#5a28a8', jacketDark: '#2a1058', shirt: '#ff4fc3', pants: '#1a1030', shoe: '#4a2080', glove: '#ff4fc3', eye: '#c6ff4a', lashes: true, head: 'headband' };
      case 'sibilo':
        return { ...base, hair: '#145028', hairStyle: 'none', top: 'hoodie', jacket: '#2fae4a', jacketDark: '#17602a', shirt: '#102818', pants: '#102818', shoe: '#0c2014', glove: '#145028', eye: '#b6ff4a', head: 'hoodUp', face: 'scarf' };
      case 'sibilo2':
        return { ...base, hair: '#0e2414', hairStyle: 'none', top: 'hoodie', jacket: '#145028', jacketDark: '#0a2814', shirt: '#081810', pants: '#0c2014', shoe: '#081810', glove: '#0e2414', eye: '#d8ff6a', head: 'hoodUp' };
    }
    return base;
  })();
  if (c.skinId) {
    L.jacket = c.suit;
    L.jacketDark = c.suitDark;
  }
  return L;
}

/** O que muda a silhueta. O raio de colisão não entra aqui. */
export function lookSignature(c: CharacterDef): string {
  const L = lookOf(c);
  return [L.hairStyle, L.head, L.top, L.face, L.hair, L.jacket, L.extras.join('+'), String(L.build)].join('|');
}

/**
 * Chave da arte procedural. Não inclui o id: dois personagens no mesmo molde
 * (cabelo, chapéu, roupa, rosto, extras e porte) geram a mesma chave.
 */
export function spriteKey(c: CharacterDef): string {
  const L = lookOf(c);
  return [L.hairStyle, L.head, L.top, L.face, L.extras.join('+'), String(L.build)].join('|');
}

// ================================================================== corpo
/** 'cast' = braço da frente estendido lançando o poder (vista lateral) */
export type Pose = 'normal' | 'cast';

export function drawCharacter(ctx0: CanvasRenderingContext2D, c: CharacterDef, facing: Facing, phase: number, moving: boolean, expr: Expr = 'neutral', pose: Pose = 'normal') {
  const ctx = thinLines(ctx0);
  const L = lookOf(c);
  const sw = moving ? Math.sin(phase) : 0;
  // parado: respiração (o tronco sobe e desce, os braços balançam de leve)
  const breath = moving ? 0 : (Math.sin(phase) * 0.5 + 0.5) * 1.3;
  const bob = moving ? Math.abs(Math.cos(phase)) * 2.2 : breath;
  const back = facing === 'up';
  const side = facing === 'side';
  const B = L.build;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---------------------------------------------------------------- pernas e tênis
  const hipY = -18;
  const legs = side
    ? [
        { x: -2, lift: Math.max(0, -sw) * 3.2, fwd: -sw * 6.5, far: true },
        { x: 2, lift: Math.max(0, sw) * 3.2, fwd: sw * 6.5, far: false },
      ]
    : [
        { x: -5 * B, lift: Math.max(0, sw) * 3.6, fwd: 0, far: false },
        { x: 5 * B, lift: Math.max(0, -sw) * 3.6, fwd: 0, far: false },
      ];
  for (const lg of legs) {
    const fx = lg.x + lg.fwd;
    const footY = -5 - lg.lift;
    const pantsCol = lg.far ? shade(L.pants, -0.25) : L.pants;
    limb(ctx, lg.x * 0.9, hipY + 2, fx, footY, 4.3 * B, 3.7 * B, hgrad(ctx, fx - 5, fx + 5, pantsCol), 1.9);
    // joelho
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.ellipse((lg.x * 0.9 + fx) / 2 - 1, (hipY + footY) / 2, 1.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // barra da calça
    ctx.strokeStyle = shade(pantsCol, -0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(fx - 3.6 * B, footY - 1.5);
    ctx.lineTo(fx + 3.6 * B, footY - 1.5);
    ctx.stroke();
    // tênis
    const toe = side ? 3 : 0;
    const sx = fx - 5.6 + toe * 0.4;
    const sy = footY - 1;
    const sw2 = side ? 12.5 : 11.2;
    ctx.fillStyle = vgrad(ctx, sy, sy + 6.5, shade(L.shoe, 0.25), shade(L.shoe, -0.18));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.9;
    rrect(ctx, sx, sy, sw2, 6.8, 3.2);
    ctx.fill();
    ctx.stroke();
    // solado
    ctx.fillStyle = L.sole;
    ctx.fillRect(sx + 1, sy + 4.6, sw2 - 2, 1.6);
    ctx.fillStyle = c.color;
    ctx.fillRect(sx + 1.5, sy + 3.3, sw2 - 3, 1.1);
    // cadarço
    ctx.strokeStyle = shade(L.shoe, -0.4);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(sx + sw2 * 0.35, sy + 1.4);
    ctx.lineTo(sx + sw2 * 0.6, sy + 2.4);
    ctx.moveTo(sx + sw2 * 0.6, sy + 1.4);
    ctx.lineTo(sx + sw2 * 0.35, sy + 2.4);
    ctx.stroke();
  }

  ctx.translate(0, -bob);

  // ---------------------------------------------------------------- atrás do corpo
  const hy = -55; // centro da cabeça
  if (!back) drawBackLayer(ctx, c, L, facing, hy, phase, moving);
  if (L.extras.includes('backpack') && !back) {
    ctx.fillStyle = vgrad(ctx, -44, -20, shade(c.backpack ?? '#5b6b3a', 0.18), shade(c.backpack ?? '#5b6b3a', -0.25));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.9;
    if (side) rrect(ctx, -18, -43, 11, 22, 4);
    else rrect(ctx, -15 * B, -43, 30 * B, 20, 6);
    ctx.fill();
    ctx.stroke();
  }

  // ---------------------------------------------------------------- braço de trás (lateral)
  const armSwing = moving ? (side ? sw * 8 : sw * 3.8) : Math.sin(phase + 0.6) * 0.9;
  if (side) drawArm(ctx, c, L, -1, -40, -armSwing, true, side);

  // ---------------------------------------------------------------- tronco
  drawTorso(ctx, c, L, facing);

  // ---------------------------------------------------------------- braços da frente
  if (side && pose === 'cast') armAt(ctx, c, L, 1.5, -40, 9.5, -38.5, 18, -38.5, false, true, 1);
  else if (side) drawArm(ctx, c, L, 1.5, -40, armSwing, false, side);
  else {
    drawArm(ctx, c, L, -12.5 * B, -40, armSwing, false, side);
    drawArm(ctx, c, L, 12.5 * B, -40, -armSwing, false, side);
  }

  drawStudioBody(ctx, c, facing);
  // ---------------------------------------------------------------- cabeça
  ctx.translate(0, moving ? Math.sin(phase * 2) * 0.5 : 0);
  drawHead(ctx, c, L, facing, hy, expr, phase, moving);
  drawStudioHead(ctx, c, facing);
  ctx.restore();
}

/** Capa, tambor e alto-falantes: detalhes que o lookOf não desenha sozinho. */
function drawStudioBody(ctx: CanvasRenderingContext2D, c: CharacterDef, facing: Facing) {
  const side = facing === 'side';
  const back = facing === 'up';
  if (c.id === 'sibilo2') {
    ctx.fillStyle = '#0e3a18';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side) {
      ctx.moveTo(-4, -40);
      ctx.lineTo(9, -36);
      ctx.lineTo(18, 8);
      ctx.lineTo(-12, 6);
    } else {
      ctx.moveTo(-14, -42);
      ctx.lineTo(14, -42);
      ctx.lineTo(24, 8);
      ctx.lineTo(-24, 8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9dff5c';
    const n = side ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const x = (side ? -8 : -18) + i * (side ? 8 : 9);
      ctx.beginPath();
      ctx.moveTo(x, 7);
      ctx.lineTo(x + 3.2, 1.5);
      ctx.lineTo(x + 6.4, 7);
      ctx.closePath();
      ctx.fill();
    }
    if (!back) {
      ctx.fillStyle = '#145028';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      for (const s of side ? [1] : [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 8, -40);
        ctx.lineTo(s * 18, -34);
        ctx.lineTo(s * 9, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  if (c.id === 'resona' && !back) {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    for (const x of side ? [3] : [-5.5, 5.5]) {
      ctx.fillStyle = '#102028';
      ctx.beginPath();
      ctx.arc(x, -32, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3ee8ff';
      ctx.beginPath();
      ctx.arc(x, -32, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawStudioHead(ctx: CanvasRenderingContext2D, c: CharacterDef, facing: Facing) {
  if (c.id === 'rufo' && facing !== 'up') {
    ctx.strokeStyle = '#f3e2c4';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, -46);
    ctx.lineTo(8, -64);
    ctx.moveTo(16, -46);
    ctx.lineTo(-6, -64);
    ctx.stroke();
  }
  if (c.id !== 'sibilo2') return;
  const side = facing === 'side';
  const back = facing === 'up';
  ctx.fillStyle = '#2fae4a';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (side) {
    ctx.moveTo(-8, -62);
    ctx.lineTo(6, -58);
    ctx.lineTo(-14, -80);
  } else {
    ctx.moveTo(-11, -64);
    ctx.lineTo(11, -64);
    ctx.lineTo(0, -82);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9dff5c';
  ctx.beginPath();
  if (back) {
    ctx.moveTo(0, -48);
    ctx.lineTo(12, -22);
    ctx.lineTo(-12, -22);
  } else if (!side) {
    ctx.moveTo(0, -40);
    ctx.lineTo(6, -30);
    ctx.lineTo(-6, -30);
  } else {
    ctx.moveTo(2, -40);
    ctx.lineTo(8, -30);
    ctx.lineTo(-1, -30);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawTorso(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing) {
  const back = facing === 'up';
  const side = facing === 'side';
  const B = L.build;
  const top = -43;
  const bot = -16;
  const half = side ? 8.5 : 11.5 * B;
  const hemHalf = side ? 9 : 13 * B;
  const robot = L.top === 'robot';

  // pescoço
  ctx.fillStyle = robot ? '#5a647a' : shade(c.skin, -0.2);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  rrect(ctx, (side ? 1 : 0) - 3.5, top - 4, 7, 6, 2);
  ctx.fill();
  ctx.stroke();

  // corpo da roupa
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-half, top + 2);
    ctx.quadraticCurveTo(0, top - 2.5, half, top + 2);
    ctx.quadraticCurveTo(half + 2, (top + bot) / 2, hemHalf, bot);
    ctx.quadraticCurveTo(0, bot + 2.8, -hemHalf, bot);
    ctx.quadraticCurveTo(-half - 2, (top + bot) / 2, -half, top + 2);
    ctx.closePath();
  };
  const main = L.top === 'overalls' ? L.shirt : L.jacket;
  ctx.fillStyle = hgrad(ctx, -hemHalf, hemHalf, main);
  body();
  ctx.fill();
  // sombra da cabeça no peito
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = 'rgba(10,6,24,0.28)';
  ctx.beginPath();
  ctx.ellipse(side ? 2 : 0, top - 1, side ? 9 : 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // luz de contorno
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-half + 1.5, top + 4);
  ctx.quadraticCurveTo(-half - 0.5, (top + bot) / 2, -hemHalf + 2, bot - 2);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.1;
  body();
  ctx.stroke();

  if (back) {
    // costas: costura, capuz caído ou detalhes
    if (L.top === 'hoodie' || L.top === 'parka') {
      ctx.fillStyle = shade(L.jacket, -0.12);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, top + 5, 9 * B, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (L.extras.includes('backpack') || c.backpack) {
      const bp = c.backpack ?? '#5b6b3a';
      ctx.fillStyle = vgrad(ctx, -42, -20, shade(bp, 0.18), shade(bp, -0.25));
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.9;
      rrect(ctx, -10, -42, 20, 21, 5);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = shade(bp, -0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, -35);
      ctx.lineTo(7, -35);
      ctx.stroke();
      glowLine(ctx, G(c), [[-4, -29], [4, -29]], 1.2);
    } else glowLine(ctx, G(c), [[-9, -30], [9, -30]]);
    belt(ctx, c, L, side, back);
    return;
  }

  switch (L.top) {
    case 'jacket': {
      if (!side) {
        // gola e camiseta por baixo
        ctx.fillStyle = L.shirt;
        ctx.beginPath();
        ctx.moveTo(-4, top);
        ctx.lineTo(0, top + 7);
        ctx.lineTo(4, top);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = shade(L.jacket, 0.12);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 4, top);
          ctx.lineTo(s * 8.5, top + 1);
          ctx.lineTo(s * 2.5, top + 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        // zíper
        ctx.strokeStyle = shade(L.jacketDark, -0.35);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, top + 7);
        ctx.lineTo(0, bot + 1);
        ctx.stroke();
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(-0.9, top + 9, 1.8, 2.6);
        // bolsos
        ctx.strokeStyle = shade(L.jacketDark, -0.25);
        ctx.lineWidth = 1.1;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 3, bot - 7);
          ctx.lineTo(s * 9, bot - 9);
          ctx.stroke();
        }
        glowLine(ctx, G(c), [[-8.5 * L.build, top + 4], [-10 * L.build, bot - 2]]);
        glowLine(ctx, G(c), [[8.5 * L.build, top + 4], [10 * L.build, bot - 2]]);
        if (L.extras.includes('bolt')) bolt(ctx, -5.5, top + 13, 5, G(c));
        else {
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(-5.5, top + 12, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        glowLine(ctx, G(c), [[3, top + 4], [4, bot - 2]]);
        ctx.strokeStyle = shade(L.jacketDark, -0.25);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(5, top + 1);
        ctx.lineTo(7.5, top + 6);
        ctx.stroke();
        if (L.extras.includes('bolt')) bolt(ctx, -1, top + 13, 4.5, G(c));
      }
      break;
    }
    case 'hoodie':
    case 'parka': {
      // capuz caído / gola de pelo
      if (L.head !== 'hoodUp' && L.head !== 'hood') {
        const fur = L.top === 'parka';
        ctx.fillStyle = fur ? '#f4f8ff' : shade(L.jacket, -0.12);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(side ? 1 : 0, top + 1.5, side ? 8 : 11 * L.build, fur ? 4.6 : 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (fur) {
          ctx.strokeStyle = 'rgba(150,180,210,0.7)';
          ctx.lineWidth = 0.9;
          for (let i = -4; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 2.3, top - 1);
            ctx.lineTo(i * 2.3 + 0.8, top + 3);
            ctx.stroke();
          }
        }
      }
      if (!side) {
        // cordões e bolso canguru
        ctx.strokeStyle = '#f2f2f6';
        ctx.lineWidth = 1.1;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 2.6, top + 4);
          ctx.lineTo(s * 3, top + 11);
          ctx.stroke();
        }
        ctx.fillStyle = shade(L.jacket, -0.16);
        ctx.strokeStyle = shade(L.jacketDark, -0.3);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-7 * L.build, bot - 9);
        ctx.lineTo(7 * L.build, bot - 9);
        ctx.lineTo(9 * L.build, bot - 2);
        ctx.lineTo(-9 * L.build, bot - 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (L.top === 'parka') {
          ctx.strokeStyle = shade(L.jacketDark, -0.2);
          ctx.beginPath();
          ctx.moveTo(0, top + 5);
          ctx.lineTo(0, bot - 9);
          ctx.stroke();
          glowLine(ctx, G(c), [[-9, top + 9], [-9.5, bot - 4]], 1.3);
          glowLine(ctx, G(c), [[9, top + 9], [9.5, bot - 4]], 1.3);
        } else glowLine(ctx, G(c), [[-6 * L.build, top + 13], [6 * L.build, top + 13]], 1.3);
      } else {
        ctx.fillStyle = shade(L.jacket, -0.16);
        ctx.strokeStyle = shade(L.jacketDark, -0.3);
        ctx.lineWidth = 1.2;
        rrect(ctx, 0, bot - 9, 8, 7, 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'kimono': {
      // gola cruzada e faixa na cintura
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = L.shirt;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(1, top);
        ctx.lineTo(7, top + 10);
        ctx.lineTo(4, top + 10);
        ctx.lineTo(-1, top + 1);
      } else {
        ctx.moveTo(-6, top + 0.5);
        ctx.lineTo(3, top + 13);
        ctx.lineTo(6, top + 11);
        ctx.lineTo(-2.5, top);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!side) {
        ctx.beginPath();
        ctx.moveTo(6, top + 0.5);
        ctx.lineTo(0.5, top + 8);
        ctx.stroke();
      }
      // faixa (obi)
      ctx.fillStyle = vgrad(ctx, bot - 10, bot - 4, shade(L.shirt, 0.1), shade(L.shirt, -0.25));
      rrect(ctx, -hemHalf + 1, bot - 10, hemHalf * 2 - 2, 6.5, 2);
      ctx.fill();
      ctx.stroke();
      if (!side) {
        ctx.fillStyle = G(c);
        ctx.beginPath();
        ctx.arc(4, bot - 6.8, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // estampa de estrelas
      ctx.fillStyle = rgba(G(c), 0.7);
      for (const [x, y] of side ? [[-4, top + 8]] : [[-7, top + 7], [7, top + 15], [-4, top + 18]]) star(ctx, x, y, 1.6);
      break;
    }
    case 'overalls': {
      // macacão por cima da camiseta
      ctx.fillStyle = hgrad(ctx, -hemHalf, hemHalf, L.jacket);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      const bx = side ? 6.5 : 8;
      ctx.moveTo(-bx, top + 8);
      ctx.lineTo(bx, top + 8);
      ctx.lineTo(hemHalf - 0.5, bot);
      ctx.quadraticCurveTo(0, bot + 2.5, -hemHalf + 0.5, bot);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // alças e botões
      ctx.strokeStyle = shade(L.jacketDark, 0);
      ctx.lineWidth = 2.6;
      for (const s of side ? [1] : [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (bx - 1.5), top + 9);
        ctx.lineTo(s * 7.5, top + 1);
        ctx.stroke();
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.arc(s * (bx - 1.6), top + 9.5, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // bolso do peito
      if (!side) {
        ctx.strokeStyle = shade(L.jacketDark, -0.2);
        ctx.lineWidth = 1.1;
        rrect(ctx, -4, top + 11, 8, 5.5, 1.5);
        ctx.stroke();
        ctx.strokeStyle = '#c8c8d0';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(2.5, top + 10);
        ctx.lineTo(2.5, top + 13.5);
        ctx.stroke();
      }
      break;
    }
    case 'labcoat': {
      // jaleco aberto com camiseta colorida
      if (!side) {
        ctx.fillStyle = hgrad(ctx, -5, 5, L.shirt);
        ctx.beginPath();
        ctx.moveTo(-4.5, top + 1);
        ctx.lineTo(4.5, top + 1);
        ctx.lineTo(3.5, bot + 0.5);
        ctx.lineTo(-3.5, bot + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1.6, top + 10, 3.2, 1);
        ctx.fillRect(-0.5, top + 8.9, 1, 3.2);
        // lapelas
        ctx.fillStyle = shade(L.jacket, -0.04);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 4.5, top + 1);
          ctx.lineTo(s * 9, top + 2);
          ctx.lineTo(s * 4.5, top + 12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.strokeStyle = shade(L.jacketDark, -0.1);
        ctx.lineWidth = 1.1;
        rrect(ctx, 6, bot - 9, 5, 5, 1);
        ctx.stroke();
        ctx.fillStyle = '#4a7ae0';
        ctx.fillRect(7, bot - 11, 1.2, 4);
      }
      glowLine(ctx, G(c), side ? [[-2, top + 6], [-2, bot - 3]] : [[-10, bot - 5], [-6, bot - 5]], 1.2);
      break;
    }
    case 'ninja': {
      // faixa diagonal e cinto de pano
      ctx.strokeStyle = shade(L.jacketDark, -0.3);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(-6, top + 2);
        ctx.lineTo(6, bot - 4);
      } else {
        ctx.moveTo(-9, top + 3);
        ctx.lineTo(9, bot - 6);
      }
      ctx.stroke();
      glowLine(ctx, G(c), side ? [[-6, top + 2], [6, bot - 4]] : [[-9, top + 3], [9, bot - 6]], 1.1);
      break;
    }
    case 'robot': {
      // placas metálicas e núcleo luminoso
      ctx.strokeStyle = 'rgba(20,20,40,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-half + 1, top + 10);
      ctx.lineTo(half - 1, top + 10);
      ctx.stroke();
      ctx.fillStyle = '#2a3242';
      ctx.beginPath();
      ctx.arc(side ? 2 : 0, top + 16, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#5aa0ff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#9fd0ff';
      ctx.beginPath();
      ctx.arc(side ? 2 : 0, top + 16, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3a4252';
      for (const [x, y] of side ? [[-5, top + 5]] : [[-8, top + 5], [8, top + 5]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  if (L.extras.includes('tools') && !side) {
    // cinto de ferramentas
    ctx.fillStyle = '#6a4a2a';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.3;
    rrect(ctx, 5, bot - 5, 6, 5, 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c8c8d0';
    ctx.fillRect(6.5, bot - 8, 1.3, 4);
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(8.6, bot - 7.5, 1.5, 3.5);
  }
  if (L.extras.includes('backpack') && !side) {
    // alças da mochila
    ctx.strokeStyle = shade(c.backpack ?? '#5b6b3a', -0.3);
    ctx.lineWidth = 2.4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 7.5 * L.build, top + 1);
      ctx.quadraticCurveTo(s * 9 * L.build, top + 10, s * 8 * L.build, top + 17);
      ctx.stroke();
    }
  }
  belt(ctx, c, L, side, back);
}

function belt(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, side: boolean, back: boolean) {
  if (L.top === 'kimono' || L.top === 'labcoat' || L.top === 'overalls' || L.top === 'hoodie' || L.top === 'parka') return;
  const w = side ? 18 : 25 * L.build;
  ctx.fillStyle = '#121018';
  ctx.fillRect(-w / 2, -21, w, 3.2);
  if (!back) {
    ctx.fillStyle = shade(c.color, 0.25);
    ctx.fillRect(side ? 2 : -2.2, -20.6, 4.4, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(side ? 2.6 : -1.6, -20.2, 1, 1);
  }
}

function bolt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 10, s / 10);
  ctx.fillStyle = col;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, -10);
  ctx.lineTo(-6, 1);
  ctx.lineTo(0, 1);
  ctx.lineTo(-2, 10);
  ctx.lineTo(6, -2);
  ctx.lineTo(0, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawArm(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, sx: number, sy: number, swing: number, behind: boolean, side: boolean) {
  const dirX = sx === 0 ? 0 : Math.sign(sx);
  const ex = sx + dirX * 2.2 + swing * 0.35; // cotovelo
  const ey = sy + 9;
  const hx = sx + dirX * 2 + swing * 0.7;
  const hy = sy + 17 - Math.abs(swing) * 0.15;
  armAt(ctx, c, L, sx, sy, ex, ey, hx, hy, behind, side, dirX);
}

/** braço por pontos: ombro → cotovelo → mão */
function armAt(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, behind: boolean, side: boolean, dirX: number) {
  const B = L.build;
  ctx.save();
  const col = behind ? shade(L.jacket, -0.28) : L.jacket;
  const robot = L.top === 'robot';
  const sleeve = hgrad(ctx, Math.min(sx, hx) - 4, Math.max(sx, hx) + 4, col);
  // braço superior e antebraço
  const ha = Math.atan2(hy - ey, hx - ex);
  const wx = hx - Math.cos(ha) * 2;
  const wy = hy - Math.sin(ha) * 2;
  limb(ctx, sx, sy, ex, ey, 3.9 * B, 3.5 * B, sleeve, 1.8);
  limb(ctx, ex, ey, wx, wy, 3.5 * B, 3.1 * B, sleeve, 1.8);
  if (robot) {
    ctx.fillStyle = '#3a4252';
    ctx.beginPath();
    ctx.arc(ex, ey, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // punho
  if (!robot && L.top !== 'ninja') {
    ctx.strokeStyle = L.top === 'parka' ? '#f4f8ff' : shade(col, -0.3);
    ctx.lineWidth = L.top === 'parka' ? 2.6 : 1.6;
    ctx.beginPath();
    const a = ha;
    const cx = wx - Math.cos(a) * 1.4;
    const cy = wy - Math.sin(a) * 1.4;
    ctx.moveTo(cx - Math.sin(a) * 3.3, cy + Math.cos(a) * 3.3);
    ctx.lineTo(cx + Math.sin(a) * 3.3, cy - Math.cos(a) * 3.3);
    ctx.stroke();
  }
  // mão (luva ou pele) com polegar
  const hand = L.glove ?? c.skin;
  ctx.fillStyle = vgrad(ctx, hy - 4, hy + 4, shade(hand, 0.18), shade(hand, -0.15));
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(hx, hy + 0.5, 3.6 * B, 4 * B, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!side) {
    ctx.beginPath();
    ctx.ellipse(hx - dirX * 2.6, hy - 0.5, 1.5, 2.1, dirX * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ================================================================== cabeça
/** cabelo/capuz que fica atrás da cabeça */
function drawBackLayer(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number, phase: number, moving: boolean) {
  const side = facing === 'side';
  const R = 13.5;
  const hairG = vgrad(ctx, hy - 14, hy + 20, shade(L.hair, 0.12), shade(L.hair, -0.32));
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  const sway = moving ? Math.sin(phase) * 3 : 0;
  if (L.hairStyle === 'ponytail') {
    ctx.fillStyle = hairG;
    ctx.beginPath();
    if (side) {
      ctx.moveTo(-8, hy - 10);
      ctx.quadraticCurveTo(-27, hy - 8 + sway, -23 + sway, hy + 13);
      ctx.quadraticCurveTo(-16, hy + 3, -10, hy + 2);
    } else {
      ctx.moveTo(6, hy - 14);
      ctx.quadraticCurveTo(27 + sway, hy - 16, 23 + sway, hy + 11);
      ctx.quadraticCurveTo(18, hy + 1, 10, hy - 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (side) ctx.moveTo(-14, hy - 8), ctx.quadraticCurveTo(-22, hy - 4, -21, hy + 6);
    else ctx.moveTo(13, hy - 13), ctx.quadraticCurveTo(22, hy - 10, 21, hy + 2);
    ctx.stroke();
  }
  if (L.hairStyle === 'long') {
    ctx.fillStyle = hairG;
    ctx.beginPath();
    if (side) {
      ctx.moveTo(-R - 2, hy - 6);
      ctx.quadraticCurveTo(-R - 6, hy + 10, -R + 1 + sway * 0.5, hy + 22);
      ctx.lineTo(4, hy + 18);
      ctx.lineTo(4, hy - 4);
    } else {
      ctx.moveTo(-R - 1.5, hy - 4);
      ctx.quadraticCurveTo(-R - 4, hy + 12, -R + 1 + sway * 0.4, hy + 22);
      ctx.lineTo(R - 1 + sway * 0.4, hy + 22);
      ctx.quadraticCurveTo(R + 4, hy + 12, R + 1.5, hy - 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(shade(L.hair, -0.5), 0.5);
    ctx.lineWidth = 1;
    for (const x of side ? [-R + 2, -6] : [-R + 3, -6, 6, R - 3]) {
      ctx.beginPath();
      ctx.moveTo(x, hy + 6);
      ctx.lineTo(x + 0.5, hy + 19);
      ctx.stroke();
    }
  }
  if (c.id === 'sibilo2' && (L.head === 'hoodUp' || L.head === 'hood')) {
    ctx.fillStyle = vgrad(ctx, hy - 28, hy + 14, '#3ad25a', '#0a2814');
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-R - 2, hy + 12);
    ctx.lineTo(side ? -4 : 0, hy - R - 18);
    ctx.lineTo(R + 2, hy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (L.head === 'hoodUp' || L.head === 'hood') {
    // capuz levantado (parte de trás)
    ctx.fillStyle = vgrad(ctx, hy - 20, hy + 14, shade(L.jacket, 0.18), L.jacketDark);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-R - 3.5, hy + 13);
    ctx.quadraticCurveTo(-R - 6, hy - R - 7, side ? -2 : 0, hy - R - 6);
    ctx.quadraticCurveTo(R + 6, hy - R - 7, R + 3.5, hy + 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawHead(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number, expr: Expr, phase: number, moving: boolean) {
  const back = facing === 'up';
  const side = facing === 'side';
  const R = 13.5;
  const fx = side ? 2.5 : 0;

  if (L.head === 'robot') {
    drawRobotHead(ctx, c, L, facing, hy, expr);
    return;
  }
  if (L.face === 'visor' && !back) {
    // interior escuro do capuz + visor
    ctx.fillStyle = '#07040f';
    ctx.beginPath();
    ctx.ellipse(fx, hy + 1, R - 2.2, R - 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = G(c);
    ctx.shadowBlur = 8;
    const vg = ctx.createLinearGradient(-10, 0, 10, 0);
    vg.addColorStop(0, shade(G(c), -0.35));
    vg.addColorStop(0.5, shade(G(c), 0.65));
    vg.addColorStop(1, G(c));
    ctx.fillStyle = vg;
    // o visor muda de forma com a expressão
    const vh = expr === 'angry' ? 4.5 : expr === 'scared' ? 8.5 : expr === 'happy' ? 6 : expr === 'blink' ? 2 : 7;
    rrect(ctx, side ? fx - 2 : -10, hy - vh / 2 + 0.5, side ? 12 : 20, vh, Math.min(3.5, vh / 2));
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(side ? fx + 1 : -6, hy - 1.5, 4, 1.2);
    if (expr === 'happy') {
      ctx.strokeStyle = '#07040f';
      ctx.lineWidth = 1.4;
      for (const ex of side ? [fx + 5] : [-5, 5]) {
        ctx.beginPath();
        ctx.arc(ex, hy + 2.5, 2.4, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }
    drawHoodFront(ctx, L, hy, side);
    return;
  }
  if (L.face === 'visor' && back) {
    drawBackLayer(ctx, c, L, facing, hy, phase, moving);
    glowLine(ctx, G(c), [[-6, hy - 6], [0, hy - 10], [6, hy - 6]], 1.4);
    return;
  }

  // ---- cabeça (forma com queixo um pouco mais estreito)
  const skinG = ctx.createRadialGradient(fx - 4, hy - 5, 2, fx, hy + 2, R + 3);
  skinG.addColorStop(0, shade(c.skin, 0.28));
  skinG.addColorStop(0.7, c.skin);
  skinG.addColorStop(1, shade(c.skin, -0.18));
  ctx.fillStyle = back ? vgrad(ctx, hy - R, hy + R, shade(L.hair, 0.15), shade(L.hair, -0.25)) : skinG;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.3;
  headShape(ctx, fx * 0.4, hy, R, side);
  ctx.fill();
  ctx.stroke();

  if (!back) {
    // orelhas
    const ears = side ? [-3.5] : [-R + 0.5, R - 0.5];
    for (const ex of ears) {
      ctx.fillStyle = shade(c.skin, -0.06);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(ex, hy + 2, 2.6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(c.skin, -0.25);
      ctx.beginPath();
      ctx.ellipse(ex, hy + 2, 1.1, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (L.extras.includes('earring')) {
        ctx.fillStyle = '#ffd23e';
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(ex, hy + 6.2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    drawFace(ctx, c, L, side, fx, hy, expr);
  }

  // ---- cabelo e acessórios
  drawHair(ctx, c, L, facing, hy, R);
  if (back) drawBackLayer(ctx, c, L, facing, hy, phase, moving);
  drawHeadwear(ctx, c, L, facing, hy, R, fx, expr);
  if (L.head === 'hood' && !back) drawHoodFront(ctx, L, hy, side);
}

function headShape(ctx: CanvasRenderingContext2D, cx: number, hy: number, R: number, side: boolean) {
  ctx.beginPath();
  if (side) {
    ctx.moveTo(cx - R, hy);
    ctx.bezierCurveTo(cx - R, hy - R * 1.35, cx + R + 1, hy - R * 1.3, cx + R + 0.5, hy - 1);
    ctx.bezierCurveTo(cx + R + 1.5, hy + 5, cx + R - 2, hy + R, cx + 2, hy + R - 0.5);
    ctx.bezierCurveTo(cx - 6, hy + R, cx - R, hy + 8, cx - R, hy);
  } else {
    ctx.moveTo(cx - R, hy);
    ctx.bezierCurveTo(cx - R, hy - R * 1.36, cx + R, hy - R * 1.36, cx + R, hy);
    ctx.bezierCurveTo(cx + R, hy + 8, cx + 6, hy + R + 0.5, cx, hy + R + 0.5);
    ctx.bezierCurveTo(cx - 6, hy + R + 0.5, cx - R, hy + 8, cx - R, hy);
  }
  ctx.closePath();
}

/** olhos, sobrancelhas, nariz e boca — tudo muda com a expressão */
function drawFace(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, side: boolean, fx: number, hy: number, expr: Expr) {
  const eyes = side ? [fx + 6.3] : [-5.2, 5.2];
  const ey = hy + 2;
  const brow = shade(L.hair === '#f2f6ff' || L.hair === '#eef0ff' ? '#8a90b0' : L.hair, -0.35);
  const masked = L.face === 'mask' || L.face === 'ninja' || L.face === 'scarf';
  for (let i = 0; i < eyes.length; i++) {
    const ex = eyes[i];
    const inner = side ? -1 : i === 0 ? 1 : -1; // direção ao centro do rosto
    const rx = side ? 2.6 : 3.2;
    let ry = 4;
    if (expr === 'scared') ry = 4.6;
    // olho fechado
    const shut = expr === 'blink' || (expr === 'hurt' && i === (side ? 0 : 1));
    if (shut) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (expr === 'hurt') {
        ctx.moveTo(ex - rx, ey - 1.5);
        ctx.lineTo(ex + rx * inner * 0.2, ey + 0.5);
        ctx.lineTo(ex + rx, ey - 1.5 + (inner > 0 ? 3 : 0));
      } else {
        ctx.arc(ex, ey - 0.5, rx, 0.15 * Math.PI, 0.85 * Math.PI);
      }
      ctx.stroke();
    } else if (expr === 'happy') {
      // olhos sorrindo (meia-lua)
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(ex, ey - 1.8, ex - rx, ey);
      ctx.fill();
      ctx.fillStyle = L.eye;
      ctx.beginPath();
      ctx.ellipse(ex + (side ? 0.8 : 0.2), ey - 0.6, 2.1, 2.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 0.7, ey - 2.2, 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // olho aberto com íris em degradê
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      const ir = expr === 'scared' ? 1.7 : 2.25;
      const look = side ? 0.9 : 0.25;
      const ig = ctx.createLinearGradient(0, ey - 3, 0, ey + 3);
      ig.addColorStop(0, shade(L.eye, -0.45));
      ig.addColorStop(1, shade(L.eye, 0.3));
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(ex + look, ey + 0.6, ir, ir * 1.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c0814';
      ctx.beginPath();
      ctx.arc(ex + look + 0.1, ey + 0.8, expr === 'scared' ? 0.7 : 1.1, 0, Math.PI * 2);
      ctx.fill();
      // pálpebra de cima (raiva / dor)
      if (expr === 'angry' || expr === 'hurt') {
        ctx.fillStyle = shade(c.skin, -0.05);
        ctx.beginPath();
        if (expr === 'angry') {
          ctx.moveTo(ex - rx - 1, ey - ry - 1);
          ctx.lineTo(ex + rx + 1, ey - ry - 1);
          ctx.lineTo(ex + rx * inner + 0.5 * inner, ey - (inner > 0 ? 0.5 : 2.5) + (side ? -1 : 0));
          ctx.lineTo(ex - rx * inner, ey - (inner > 0 ? 2.5 : 0.5));
        } else {
          ctx.rect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, ry * 0.9);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      // brilhos
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 0.7 + (side ? 0.6 : 0), ey - 1.2, 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 1.1 + (side ? 0.6 : 0), ey + 1.9, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // cílios
    if (L.lashes && !shut) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.1;
      const ox = side ? 1 : -inner;
      ctx.beginPath();
      ctx.moveTo(ex + ox * rx * 0.85, ey - ry * 0.65);
      ctx.lineTo(ex + ox * (rx + 1.6), ey - ry - 0.4);
      ctx.stroke();
    }
    // sobrancelhas
    ctx.strokeStyle = brow;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const bx0 = ex - 2.8;
    const bx1 = ex + 2.8;
    const by = ey - ry - 2;
    const innerX = side ? bx0 : inner > 0 ? bx1 : bx0;
    const outerX = innerX === bx0 ? bx1 : bx0;
    switch (expr) {
      case 'angry':
        ctx.moveTo(outerX, by - 1.3);
        ctx.lineTo(innerX, by + 1.6);
        break;
      case 'scared':
      case 'hurt':
        ctx.moveTo(outerX, by + 0.6);
        ctx.quadraticCurveTo((bx0 + bx1) / 2, by - 1.2, innerX, by - 2);
        break;
      case 'happy':
        ctx.moveTo(bx0, by);
        ctx.quadraticCurveTo(ex, by - 2.2, bx1, by);
        break;
      default:
        ctx.moveTo(outerX, by - 0.8);
        ctx.lineTo(innerX, by + 0.4);
    }
    ctx.stroke();
  }

  if (masked) return;

  // bochechas, sardas e curativo
  ctx.fillStyle = expr === 'happy' ? 'rgba(255,90,120,0.38)' : 'rgba(255,110,130,0.22)';
  for (const ex of side ? [fx + 4.5] : [-8.2, 8.2]) {
    ctx.beginPath();
    ctx.ellipse(ex, hy + 7.4, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (L.extras.includes('freckles')) {
    ctx.fillStyle = shade(c.skin, -0.35);
    for (const [x, y] of side ? [[fx + 4, hy + 6], [fx + 6, hy + 6.8]] : [[-9, hy + 6], [-7.5, hy + 6.8], [-8.6, hy + 7.8], [9, hy + 6], [7.5, hy + 6.8], [8.6, hy + 7.8]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (L.extras.includes('bandaid')) {
    ctx.save();
    ctx.translate(side ? fx + 3 : 8, hy + 5.5);
    ctx.rotate(-0.4);
    ctx.fillStyle = '#ffd8b0';
    ctx.strokeStyle = shade('#ffd8b0', -0.4);
    ctx.lineWidth = 0.8;
    rrect(ctx, -3, -1.3, 6, 2.6, 1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // nariz
  ctx.strokeStyle = shade(c.skin, -0.3);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (side) {
    ctx.moveTo(fx + R_NOSE, hy + 3);
    ctx.quadraticCurveTo(fx + R_NOSE + 2.2, hy + 5.2, fx + R_NOSE - 0.5, hy + 5.8);
  } else {
    ctx.moveTo(0.4, hy + 4.6);
    ctx.quadraticCurveTo(1.4, hy + 5.6, 0, hy + 6);
  }
  ctx.stroke();

  // boca
  const mx = side ? fx + 6.2 : 0.4;
  const my = hy + 9.2;
  const lip = shade(c.skin, -0.5);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.3;
  switch (expr) {
    case 'happy': {
      ctx.fillStyle = '#5a1020';
      ctx.beginPath();
      if (side) {
        ctx.moveTo(mx - 2.6, my - 1);
        ctx.quadraticCurveTo(mx, my + 3.8, mx + 2, my - 1.2);
      } else {
        ctx.moveTo(mx - 3.4, my - 1);
        ctx.quadraticCurveTo(mx, my + 4.6, mx + 3.4, my - 1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - (side ? 2 : 2.6), my - 0.9, side ? 3.6 : 5.2, 1.2);
      ctx.fillStyle = '#ff7a8a';
      ctx.beginPath();
      ctx.ellipse(mx + 0.2, my + 1.8, 1.6, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'angry': {
      ctx.fillStyle = '#ffffff';
      rrect(ctx, mx - (side ? 2 : 3.2), my - 0.6, side ? 4 : 6.4, 2.6, 1);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,12,38,0.5)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(mx - (side ? 2 : 3.2), my + 0.7);
      ctx.lineTo(mx + (side ? 2 : 3.2), my + 0.7);
      for (const k of side ? [0] : [-1.6, 0, 1.6]) {
        ctx.moveTo(mx + k, my - 0.6);
        ctx.lineTo(mx + k, my + 2);
      }
      ctx.stroke();
      break;
    }
    case 'scared': {
      ctx.fillStyle = '#3a0c18';
      ctx.beginPath();
      ctx.ellipse(mx, my + 0.6, side ? 1.4 : 1.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // gota de suor
      ctx.fillStyle = '#9fe0ff';
      ctx.strokeStyle = '#2a6a9a';
      ctx.lineWidth = 0.9;
      const sx = side ? fx - 6 : 11;
      ctx.beginPath();
      ctx.moveTo(sx, hy - 7);
      ctx.quadraticCurveTo(sx + 2.4, hy - 2.5, sx, hy - 1.8);
      ctx.quadraticCurveTo(sx - 2.4, hy - 2.5, sx, hy - 7);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'hurt': {
      ctx.strokeStyle = lip;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const w = side ? 2.4 : 3.4;
      ctx.moveTo(mx - w, my + 0.8);
      ctx.quadraticCurveTo(mx - w / 2, my - 0.8, mx, my + 0.8);
      ctx.quadraticCurveTo(mx + w / 2, my + 2.2, mx + w, my + 0.4);
      ctx.stroke();
      break;
    }
    default: {
      ctx.strokeStyle = lip;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      if (side) ctx.arc(mx - 0.5, my - 1.4, 2, 0.35, Math.PI - 0.9);
      else ctx.arc(mx, my - 1.8, 2.4, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
  }
}
const R_NOSE = 11.6;

function drawHair(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number, R: number) {
  const back = facing === 'up';
  const side = facing === 'side';
  const fill = vgrad(ctx, hy - R - 8, hy + 4, shade(L.hair, 0.22), shade(L.hair, -0.18));
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.fillStyle = fill;
  switch (L.hairStyle) {
    case 'none':
      return;
    case 'spiky': {
      const n = c.id === 'nyx' ? 6 : 7;
      ctx.beginPath();
      if (back) ctx.ellipse(0, hy - 1, R + 1, R, 0, 0, Math.PI * 2);
      else {
        const left = side ? -R - 1 : -R - 2;
        const right = side ? R + 4 : R + 2;
        ctx.moveTo(left, hy + 2);
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = left + (right - left) * t;
          const arc = Math.sin(t * Math.PI);
          const y = hy - R * 0.62 - arc * (R * 0.58) - (i % 2 ? 6.5 : 0);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(right, hy - 2);
        ctx.lineTo(side ? R : 8.5, hy - 5.5);
        ctx.lineTo(side ? R - 4 : 4, hy - 2.8);
        ctx.lineTo(side ? R - 7 : 0, hy - 6.5);
        ctx.lineTo(side ? 0 : -4, hy - 3.2);
        ctx.lineTo(side ? -4 : -8.5, hy - 6.5);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      hairShine(ctx, hy, R, back);
      if (!back) strands(ctx, L.hair, side ? [[-2, hy - 12, 2, hy - 6], [5, hy - 13, 7, hy - 7]] : [[-6, hy - 13, -4, hy - 7], [3, hy - 14, 4, hy - 8]]);
      return;
    }
    case 'ponytail':
    case 'long':
    case 'buns':
    case 'puffs':
    case 'curly':
      bangs(ctx, fill, hy, R, side, back, L.hairStyle === 'curly');
      if (L.hairStyle === 'buns') {
        for (const bx of side ? [-6] : [-10, 10]) {
          ctx.fillStyle = fill;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(bx, hy - R - 2, 5.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(bx, hy - R - 2, 3.4, Math.PI * 1.1, Math.PI * 1.6);
          ctx.stroke();
          // grampo com estrela
          ctx.strokeStyle = '#ffd23e';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(bx - 5, hy - R - 6);
          ctx.lineTo(bx + 6, hy - R + 1);
          ctx.stroke();
          ctx.fillStyle = G(c);
          star(ctx, bx + 6, hy - R + 1, 2.2);
        }
      }
      if (L.hairStyle === 'puffs') {
        for (const bx of side ? [-7] : [-11.5, 11.5]) {
          ctx.fillStyle = fill;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2;
            const r = 6.6 + (k % 2) * 0.9;
            ctx.lineTo(bx + Math.cos(a) * r, hy - R + 0 + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = c.color;
          ctx.fillRect(bx - 3, hy - R + 5.6, 6, 2);
        }
      }
      return;
    case 'short':
      ctx.beginPath();
      if (back) ctx.ellipse(0, hy - 1, R + 0.5, R - 0.5, 0, 0, Math.PI * 2);
      else ctx.ellipse(side ? -2 : 0, hy - 5, R + 0.8, R * 0.66, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    case 'mohawk': {
      // laterais raspadas + crista inclinada para trás (como uma chama)
      ctx.fillStyle = rgba(shade(L.hair, -0.35), 0.5);
      ctx.beginPath();
      if (back) ctx.ellipse(0, hy - 1, R, R - 0.5, 0, 0, Math.PI * 2);
      else ctx.ellipse(side ? -1 : 0, hy - 4, R, R * 0.72, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(R - 1, hy - 7);
        ctx.quadraticCurveTo(R + 6, hy - R - 6, 2, hy - R - 9);
        ctx.lineTo(-3, hy - R - 4);
        ctx.lineTo(-9, hy - R - 6);
        ctx.lineTo(-10, hy - R + 1);
        ctx.lineTo(-R - 3, hy - R + 1);
        ctx.quadraticCurveTo(-R, hy - 6, -R + 3, hy - 6);
        ctx.quadraticCurveTo(0, hy - R + 2, R - 1, hy - 7);
      } else if (back) {
        ctx.moveTo(-4, hy + 4);
        ctx.quadraticCurveTo(-6, hy - R - 4, 0, hy - R - 6);
        ctx.quadraticCurveTo(6, hy - R - 4, 4, hy + 4);
      } else {
        ctx.moveTo(-5.5, hy - R + 3);
        ctx.quadraticCurveTo(-7, hy - R - 9, 1, hy - R - 11);
        ctx.quadraticCurveTo(8, hy - R - 9, 5.5, hy - R + 3);
        ctx.quadraticCurveTo(0, hy - R + 1, -5.5, hy - R + 3);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // mecha branca em forma de raio
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(5, hy - R - 6);
        ctx.lineTo(1, hy - R - 3);
        ctx.lineTo(3, hy - R - 1);
        ctx.lineTo(-1, hy - R + 2);
      } else {
        ctx.moveTo(1, hy - R - 9);
        ctx.lineTo(-1.5, hy - R - 5);
        ctx.lineTo(1.5, hy - R - 3);
        ctx.lineTo(-0.5, hy - R + 1);
      }
      ctx.stroke();
      return;
    }
    case 'swept': {
      ctx.beginPath();
      if (back) ctx.ellipse(0, hy - 1, R + 1, R, 0, 0, Math.PI * 2);
      else if (side) {
        ctx.moveTo(-R - 1, hy + 3);
        ctx.quadraticCurveTo(-R - 3, hy - R - 6, 2, hy - R - 5);
        ctx.quadraticCurveTo(R + 8, hy - R - 4, R + 7, hy - 6);
        ctx.lineTo(R - 1, hy - 4);
        ctx.lineTo(4, hy - 7);
        ctx.lineTo(-3, hy - 2);
      } else {
        ctx.moveTo(-R - 1.5, hy + 3);
        ctx.quadraticCurveTo(-R - 3, hy - R - 6, 2, hy - R - 6);
        ctx.quadraticCurveTo(R + 6, hy - R - 5, R + 4, hy - 7);
        ctx.lineTo(R + 1, hy - 1);
        ctx.lineTo(7, hy - 6);
        ctx.lineTo(-1, hy - 4.5);
        ctx.lineTo(-7, hy - 6.5);
        ctx.lineTo(-R + 1, hy - 1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      hairShine(ctx, hy, R, back);
      if (!back) strands(ctx, L.hair, side ? [[-6, hy - 12, 4, hy - 15], [-2, hy - 8, 8, hy - 11]] : [[-8, hy - 10, 2, hy - 16], [-2, hy - 9, 8, hy - 13]]);
      return;
    }
  }
}

function hairShine(ctx: CanvasRenderingContext2D, hy: number, R: number, back: boolean) {
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-2, hy - (back ? 2 : 7), R * 0.5, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();
}
function strands(ctx: CanvasRenderingContext2D, hair: string, lines: number[][]) {
  ctx.strokeStyle = rgba(shade(hair, -0.5), 0.55);
  ctx.lineWidth = 0.9;
  for (const [x0, y0, x1, y1] of lines) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

function bangs(ctx: CanvasRenderingContext2D, fill: CanvasGradient, hy: number, R: number, side: boolean, back: boolean, curly: boolean) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (back) {
    ctx.ellipse(0, hy - 1, R + 1.5, R + 0.5, 0, 0, Math.PI * 2);
  } else if (curly) {
    // cachos: contorno ondulado
    const pts = side ? 9 : 12;
    for (let k = 0; k <= pts; k++) {
      const a = Math.PI + (k / pts) * Math.PI;
      const r = R + 3 + (k % 2) * 2.2;
      ctx.lineTo((side ? -1 : 0) + Math.cos(a) * r, hy - 2 + Math.sin(a) * r * 0.95);
    }
    ctx.lineTo(R + 2, hy + 5);
    ctx.lineTo(R - 3, hy - 3);
    for (let k = 0; k < 5; k++) {
      const x = R - 3 - (k + 1) * ((2 * R - 6) / 5);
      ctx.quadraticCurveTo(x + 2.5, hy - 7, x, hy - 3);
    }
    ctx.lineTo(-R - 2, hy + 5);
  } else if (side) {
    ctx.moveTo(-R - 1, hy + 6);
    ctx.quadraticCurveTo(-R - 2, hy - R - 5, 4, hy - R - 3);
    ctx.quadraticCurveTo(R + 5, hy - R + 1, R + 3, hy - 1);
    ctx.lineTo(R - 2, hy - 5);
    ctx.lineTo(8, hy - 2);
    ctx.lineTo(4, hy - 6);
    ctx.lineTo(-2, hy + 2);
  } else {
    ctx.moveTo(-R - 2, hy + 6);
    ctx.quadraticCurveTo(-R - 3, hy - R - 6, 0, hy - R - 4);
    ctx.quadraticCurveTo(R + 3, hy - R - 6, R + 2, hy + 6);
    ctx.lineTo(R - 2, hy - 2);
    ctx.lineTo(9, hy - 5.5);
    ctx.lineTo(5, hy - 1.5);
    ctx.lineTo(1, hy - 6.5);
    ctx.lineTo(-4, hy - 2);
    ctx.lineTo(-8, hy - 6);
    ctx.lineTo(-R + 2, hy - 1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  hairShine(ctx, hy, R, back);
}

function drawHeadwear(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number, R: number, fx: number, expr: Expr) {
  const back = facing === 'up';
  const side = facing === 'side';
  switch (L.head) {
    case 'cap':
      cap(ctx, '#232328', '#3a3a42', c.color, hy, R, side, back);
      break;
    case 'capgoggles':
      cap(ctx, '#f2f0f6', '#ffffff', '#ff5fa0', hy, R, side, back);
      if (!back) {
        for (const ex of side ? [fx + 3] : [-5.5, 5.5]) {
          ctx.fillStyle = vgrad(ctx, hy - 16, hy - 9, '#ffd0e4', '#ff7ab0');
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(ex, hy - 12.5, 4.6, 3.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath();
          ctx.arc(ex - 1.6, hy - 13.5, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'headphones': {
      ctx.strokeStyle = '#141018';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(fx * 0.4, hy - 1, R + 1.6, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      for (const ex of side ? [-3] : [-R - 0.5, R + 0.5]) {
        ctx.fillStyle = vgrad(ctx, hy - 4, hy + 6, '#2c2238', '#120c18');
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(ex, hy + 1, 4, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.shadowColor = G(c);
        ctx.shadowBlur = 5;
        ctx.fillStyle = G(c);
        ctx.beginPath();
        ctx.arc(ex, hy + 1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'headband': {
      ctx.fillStyle = c.id === 'rufo' ? '#ffd27a' : c.id === 'vibra' ? '#ff4fc3' : G(c);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      rrect(ctx, -R - 1, hy - 9, 2 * R + 2, 4.6, 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      if (side) {
        ctx.moveTo(-R, hy - 7);
        ctx.quadraticCurveTo(-R - 10, hy - 9, -R - 14, hy - 3);
        ctx.quadraticCurveTo(-R - 8, hy - 4, -R, hy - 5);
      } else if (back) {
        ctx.moveTo(-2, hy - 6);
        ctx.quadraticCurveTo(-6, hy + 7, -10, hy + 13);
        ctx.moveTo(2, hy - 6);
        ctx.quadraticCurveTo(6, hy + 7, 9, hy + 14);
      }
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'goggles': {
      // óculos de neve na testa
      const y = hy - 9.5;
      ctx.strokeStyle = '#2a2430';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-R - 0.5, y + 1);
      ctx.lineTo(R + 0.5, y + 1);
      ctx.stroke();
      if (!back) {
        for (const ex of side ? [fx + 5] : [-5, 5]) {
          const lg = ctx.createLinearGradient(ex - 4, y - 3, ex + 4, y + 3);
          lg.addColorStop(0, c.id === 'kai' ? '#bff4ff' : '#ffd36a');
          lg.addColorStop(1, c.id === 'kai' ? '#3a8ad0' : '#d07a10');
          ctx.fillStyle = lg;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(ex, y, 4.4, 3.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(ex - 2.6, y - 1.8, 2, 1);
        }
      }
      break;
    }
    case 'flower': {
      if (!back || side) {
        const fx2 = side ? -6 : -9;
        const fy = hy - 10;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(20,12,38,0.5)';
        ctx.lineWidth = 0.7;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(fx2 + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.4, 1.8, a, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = G(c);
        ctx.beginPath();
        ctx.arc(fx2, fy, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  if (back) return;
  switch (L.face) {
    case 'mask': {
      ctx.fillStyle = vgrad(ctx, hy + 3, hy + 13, '#24407a', '#142650');
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.8;
      if (side) rrect(ctx, fx - 1, hy + 4.5, 15, 9, 4);
      else rrect(ctx, -11, hy + 4.5, 22, 9.5, 4.5);
      ctx.fill();
      ctx.stroke();
      // a luz da máscara reage à expressão
      const mouth: [number, number][] =
        expr === 'happy'
          ? side
            ? [[fx + 3, hy + 8.5], [fx + 8, hy + 10.5], [fx + 12, hy + 8.5]]
            : [[-7, hy + 8.5], [0, hy + 11], [7, hy + 8.5]]
          : expr === 'angry'
            ? side
              ? [[fx + 3, hy + 10], [fx + 8, hy + 8.5], [fx + 12, hy + 10]]
              : [[-7, hy + 10.5], [0, hy + 8.5], [7, hy + 10.5]]
            : side
              ? [[fx + 3, hy + 9.5], [fx + 12, hy + 9.5]]
              : [[-7, hy + 9.5], [7, hy + 9.5]];
      glowLine(ctx, G(c), mouth, 1.2);
      break;
    }
    case 'ninja':
      ctx.fillStyle = vgrad(ctx, hy + 3, hy + 13, '#2a2e40', '#12141e');
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.8;
      if (side) rrect(ctx, fx - 2, hy + 4.5, 16, 9, 4);
      else rrect(ctx, -12, hy + 4.5, 24, 10, 5);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(side ? fx : -9, hy + 7);
      ctx.lineTo(side ? fx + 10 : 9, hy + 7);
      ctx.stroke();
      break;
    case 'scarf':
      ctx.fillStyle = c.id === 'sibilo'
        ? vgrad(ctx, hy + 3, hy + 15, '#145028', '#0a2014')
        : vgrad(ctx, hy + 3, hy + 15, '#6a7284', '#3a404c');
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.8;
      if (side) rrect(ctx, fx - 3, hy + 4.5, 17, 11, 5);
      else rrect(ctx, -12.5, hy + 4.5, 25, 11, 5.5);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,12,38,0.35)';
      ctx.lineWidth = 1;
      for (const y of [hy + 8, hy + 11.5]) {
        ctx.beginPath();
        ctx.moveTo(side ? fx - 2 : -11, y);
        ctx.lineTo(side ? fx + 12 : 11, y);
        ctx.stroke();
      }
      break;
    case 'glasses':
      ctx.strokeStyle = '#ffb020';
      ctx.lineWidth = 1.9;
      for (const ex of side ? [fx + 6.3] : [-5.2, 5.2]) {
        ctx.fillStyle = 'rgba(255,200,80,0.22)';
        ctx.beginPath();
        ctx.ellipse(ex, hy + 2, 4.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (!side) {
        ctx.beginPath();
        ctx.moveTo(-0.7, hy + 1.5);
        ctx.lineTo(0.7, hy + 1.5);
        ctx.stroke();
      }
      break;
    case 'roundGlasses':
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 1.5;
      for (const ex of side ? [fx + 6.3] : [-5.4, 5.4]) {
        ctx.fillStyle = 'rgba(200,240,255,0.22)';
        ctx.beginPath();
        ctx.arc(ex, hy + 2, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(ex, hy + 2, 3.4, Math.PI * 1.1, Math.PI * 1.4);
        ctx.stroke();
        ctx.strokeStyle = '#3a2a1a';
      }
      if (!side) {
        ctx.beginPath();
        ctx.moveTo(-0.7, hy + 1.2);
        ctx.quadraticCurveTo(0, hy, 0.7, hy + 1.2);
        ctx.stroke();
      }
      break;
  }
}

/** borda do capuz em volta do rosto */
function drawHoodFront(ctx: CanvasRenderingContext2D, L: Look, hy: number, side: boolean) {
  const R = 13.5;
  ctx.strokeStyle = vgrad(ctx, hy - R, hy + R, shade(L.jacket, 0.25), L.jacketDark);
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (side) ctx.arc(2, hy + 1, R + 0.5, Math.PI * 1.05, Math.PI * 0.35, false);
  else ctx.ellipse(0, hy + 1, R + 0.8, R + 1.4, 0, Math.PI * 0.82, Math.PI * 0.18);
  ctx.stroke();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (side) ctx.arc(2, hy + 1, R - 1.5, Math.PI * 1.05, Math.PI * 0.35, false);
  else ctx.ellipse(0, hy + 1, R - 1.2, R - 0.6, 0, Math.PI * 0.82, Math.PI * 0.18);
  ctx.stroke();
}

function drawRobotHead(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number, expr: Expr) {
  const back = facing === 'up';
  const side = facing === 'side';
  const R = 14;
  const fx = side ? 2.5 : 0;
  const mg = ctx.createLinearGradient(-R, hy - R, R, hy + R);
  mg.addColorStop(0, '#f0f4fb');
  mg.addColorStop(0.5, '#9aa6bc');
  mg.addColorStop(1, '#4a5468');
  ctx.fillStyle = mg;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.3;
  rrect(ctx, -R, hy - R + 1, 2 * R, 2 * R - 2, 7);
  ctx.fill();
  ctx.stroke();
  // reflexo especular
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  rrect(ctx, -R + 3, hy - R + 3, 9, 3, 1.5);
  ctx.fill();
  // antena
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(side ? -4 : 4, hy - R + 1);
  ctx.lineTo(side ? -6 : 6, hy - R - 7);
  ctx.stroke();
  ctx.fillStyle = expr === 'angry' || expr === 'hurt' ? '#ff3b3b' : expr === 'happy' ? '#5dff8a' : '#ffb03b';
  ctx.beginPath();
  ctx.arc(side ? -6 : 6, hy - R - 8, 2.6, 0, Math.PI * 2);
  ctx.fill();
  if (!back) {
    ctx.save();
    ctx.shadowColor = '#5aa0ff';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#0c1630';
    rrect(ctx, side ? fx - 1 : -10.5, hy - 5, side ? 13 : 21, 9, 3.5);
    ctx.fill();
    // olhos de LED que mudam com a expressão
    ctx.fillStyle = expr === 'angry' ? '#ff5a5a' : '#9fd0ff';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.6;
    for (const ex of side ? [fx + 6] : [-5, 5]) {
      ctx.beginPath();
      if (expr === 'happy') ctx.arc(ex, hy + 0.5, 2.4, Math.PI * 1.1, Math.PI * 1.9), ctx.stroke();
      else if (expr === 'blink') ctx.fillRect(ex - 2.4, hy - 0.4, 4.8, 1.2);
      else if (expr === 'hurt') {
        ctx.moveTo(ex - 2, hy - 2);
        ctx.lineTo(ex + 2, hy + 2);
        ctx.moveTo(ex + 2, hy - 2);
        ctx.lineTo(ex - 2, hy + 2);
        ctx.stroke();
      } else if (expr === 'angry') {
        ctx.moveTo(ex - 2.5, hy - 1.5 + (ex < 0 ? -1 : 1));
        ctx.lineTo(ex + 2.5, hy - 1.5 + (ex < 0 ? 1 : -1));
        ctx.lineTo(ex, hy + 2);
        ctx.closePath();
        ctx.fill();
      } else {
        const r = expr === 'scared' ? 3 : 2.2;
        ctx.arc(ex, hy - 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // grade da boca
    ctx.fillStyle = '#3a4252';
    for (let i = -1; i <= 1; i++) ctx.fillRect((side ? fx + 3 : 0) + i * 3 - 0.8, hy + 6, 1.6, expr === 'scared' ? 5 : 3.5);
  } else {
    ctx.fillStyle = '#3a4252';
    ctx.fillRect(-6, hy - 2, 12, 2);
    ctx.fillRect(-6, hy + 3, 12, 2);
  }
  ctx.fillStyle = '#3a4252';
  for (const ex of side ? [-R + 3] : [-R + 3, R - 3]) {
    ctx.beginPath();
    ctx.arc(ex, hy + 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  void L;
}

function cap(ctx: CanvasRenderingContext2D, col: string, top: string, accent: string, hy: number, R: number, side: boolean, back: boolean) {
  ctx.fillStyle = vgrad(ctx, hy - R - 5, hy - 3, top, col);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, hy - 5, R + 1.2, R * 0.82, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // costuras
  ctx.strokeStyle = 'rgba(20,12,38,0.25)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, hy - 5 - R * 0.8);
  ctx.lineTo(0, hy - 5);
  ctx.moveTo(-7, hy - 5 - R * 0.6);
  ctx.quadraticCurveTo(-5, hy - 8, -6, hy - 5);
  ctx.moveTo(7, hy - 5 - R * 0.6);
  ctx.quadraticCurveTo(5, hy - 8, 6, hy - 5);
  ctx.stroke();
  if (!back) {
    ctx.fillStyle = shade(col.startsWith('#') ? col : '#333333', -0.18);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side) ctx.ellipse(R - 1, hy - 5, 9.5, 2.8, 0.05, 0, Math.PI * 2);
    else ctx.ellipse(0, hy - 4.6, R + 3, 4.2, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, hy - 11.5, 2.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(-3, hy - 6, 6, 2);
  }
}
