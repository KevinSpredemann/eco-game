import type { CharacterDef } from '../game/characters';

export type Facing = 'down' | 'up' | 'side';

// Desenho dos personagens em vista 3/4, estilo chibi, com sombreamento e brilho.
// Origem = entre os pés. Altura ≈ 62 unidades.

const OUT = '#140c26';

function hexRgb(hex: string): [number, number, number] {
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

/** linha luminosa: halo largo + núcleo claro */
function glowLine(ctx: CanvasRenderingContext2D, color: string, pts: [number, number][], w = 1.8) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, 0.35);
  ctx.lineWidth = w * 3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = shade(color, 0.35);
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

interface Look {
  hair: string;
  jacket: string;
  jacketDark: string;
  pants: string;
  shoe: string;
  glove: string;
  eye: string;
}

function lookOf(c: CharacterDef): Look {
  const base: Look = { hair: c.hair, jacket: c.suit, jacketDark: c.suitDark, pants: '#1c1a2e', shoe: '#f1f1f6', glove: '#22202e', eye: '#3a2614' };
  switch (c.id) {
    case 'kael':
      return { ...base, pants: '#1a2240', eye: '#2a5a8a' };
    case 'luna':
      return { ...base, jacket: '#2b1830', jacketDark: '#160a1a', pants: '#21142a', eye: '#2f7a5a', shoe: '#2a2030' };
    case 'bruno':
      return { ...base, pants: '#23262a', eye: '#2a1a0e', glove: '#1a1a1a' };
    case 'zoe':
      return { ...base, pants: '#232028', eye: '#4a2a14', shoe: '#2c2420' };
    case 'maya':
      return { ...base, jacket: '#f0e6f0', jacketDark: '#b9a6bd', pants: '#2a1a2a', eye: '#2a6a4a' };
    case 'zed':
      return { ...base, jacket: '#251c3a', jacketDark: '#120c22', pants: '#2a1e44', shoe: '#1c1a24' };
  }
  return base;
}

export function drawCharacter(ctx: CanvasRenderingContext2D, c: CharacterDef, facing: Facing, phase: number, moving: boolean) {
  const L = lookOf(c);
  const sw = moving ? Math.sin(phase) : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * 2 : 0;
  const back = facing === 'up';
  const side = facing === 'side';
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---------------------------------------------------------------- pernas
  const legs: { x: number; lift: number; fwd: number }[] = side
    ? [
        { x: -2, lift: Math.max(0, -sw) * 3, fwd: -sw * 6 },
        { x: 2, lift: Math.max(0, sw) * 3, fwd: sw * 6 },
      ]
    : [
        { x: -5.5, lift: Math.max(0, sw) * 3.5, fwd: 0 },
        { x: 5.5, lift: Math.max(0, -sw) * 3.5, fwd: 0 },
      ];
  for (const lg of legs) {
    const x = lg.x + lg.fwd;
    const y = -15 - lg.lift;
    ctx.fillStyle = vgrad(ctx, y, y + 11, shade(L.pants, 0.12), L.pants);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    rrect(ctx, x - 4, y, 8, 11, 3);
    ctx.fill();
    ctx.stroke();
    // tênis
    const sy = y + 8.5;
    ctx.fillStyle = vgrad(ctx, sy, sy + 6.5, '#ffffff', shade(L.shoe, -0.15));
    rrect(ctx, x - 5.5 + (side ? 1.5 : 0), sy, side ? 11 : 11, 6.5, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.fillRect(x - 4.5 + (side ? 1.5 : 0), sy + 4.3, 9, 1.6);
  }

  ctx.translate(0, -bob);

  // ---------------------------------------------------------------- mochila (atrás)
  if (c.backpack && !back) {
    ctx.fillStyle = vgrad(ctx, -40, -18, shade(c.backpack, 0.15), shade(c.backpack, -0.2));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    if (side) rrect(ctx, -17, -38, 10, 20, 4);
    else rrect(ctx, -15, -38, 30, 19, 6);
    ctx.fill();
    ctx.stroke();
  }

  // ---------------------------------------------------------------- braço de trás (lateral)
  const armSwing = side ? sw * 7 : sw * 3.5;
  if (side) drawArm(ctx, c, L, -1, -34, -armSwing, true);

  // ---------------------------------------------------------------- tronco
  ctx.fillStyle = vgrad(ctx, -38, -14, shade(L.jacket, 0.18), L.jacketDark);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (side) {
    ctx.moveTo(-8, -37);
    ctx.quadraticCurveTo(0, -40, 8, -37);
    ctx.lineTo(9, -15);
    ctx.quadraticCurveTo(0, -12.5, -9, -15);
  } else {
    ctx.moveTo(-11, -37);
    ctx.quadraticCurveTo(0, -40.5, 11, -37);
    ctx.lineTo(13, -15);
    ctx.quadraticCurveTo(0, -12, -13, -15);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // reflexo
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(side ? 3 : -4, -31, side ? 3 : 4, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // detalhes da roupa
  if (!back) {
    if (!side) {
      ctx.strokeStyle = shade(L.jacketDark, -0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -37);
      ctx.lineTo(0, -16);
      ctx.stroke();
      glowLine(ctx, c.color, [
        [-8, -35],
        [-9.5, -18],
      ]);
      glowLine(ctx, c.color, [
        [8, -35],
        [9.5, -18],
      ]);
    } else {
      glowLine(ctx, c.color, [
        [3, -35],
        [4, -18],
      ]);
    }
    // emblema
    if (!side) {
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(-5, -29, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    glowLine(ctx, c.color, [
      [-9, -26],
      [9, -26],
    ]);
  }
  // cinto
  ctx.fillStyle = '#121018';
  ctx.fillRect(side ? -9 : -12.5, -18, side ? 18 : 25, 3.2);
  ctx.fillStyle = shade(c.color, 0.2);
  ctx.fillRect(side ? 2 : -2, -17.6, 4, 2.4);

  // mochila vista de costas
  if (c.backpack && back) {
    ctx.fillStyle = vgrad(ctx, -38, -18, shade(c.backpack, 0.15), shade(c.backpack, -0.2));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    rrect(ctx, -10, -37, 20, 19, 5);
    ctx.fill();
    ctx.stroke();
    glowLine(ctx, c.color, [
      [-5, -31],
      [5, -31],
    ], 1.4);
  }

  // ---------------------------------------------------------------- braços da frente
  if (side) drawArm(ctx, c, L, 1, -34, armSwing, false);
  else {
    drawArm(ctx, c, L, -13, -34, armSwing, false);
    drawArm(ctx, c, L, 13, -34, -armSwing, false);
  }

  // ---------------------------------------------------------------- cabeça
  drawHead(ctx, c, L, facing, -50);
  ctx.restore();
}

function drawArm(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, sx: number, sy: number, swing: number, behind: boolean) {
  const hx = sx + (sx === 0 ? 0 : Math.sign(sx) * 2) + swing * 0.5;
  const hy = sy + 15 - Math.abs(swing) * 0.15;
  ctx.save();
  if (behind) ctx.globalAlpha = 0.9;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = behind ? L.jacketDark : L.jacket;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.15);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 1, sy + 1);
  ctx.lineTo(hx - 1, hy - 3);
  ctx.stroke();
  // luva / mão
  ctx.fillStyle = c.id === 'luna' || c.id === 'maya' ? c.skin : L.glove;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(hx, hy + 1, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, c: CharacterDef, L: Look, facing: Facing, hy: number) {
  const back = facing === 'up';
  const side = facing === 'side';
  const R = 14;
  const fx = side ? 2.5 : 0; // rosto um pouco à frente na lateral

  // ---- camadas de trás
  if (c.id === 'luna') {
    // rabo de cavalo
    ctx.fillStyle = vgrad(ctx, hy - 14, hy + 16, shade(L.hair, 0.15), shade(L.hair, -0.25));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side) {
      ctx.moveTo(-8, hy - 10);
      ctx.quadraticCurveTo(-26, hy - 8, -22, hy + 12);
      ctx.quadraticCurveTo(-16, hy + 2, -10, hy + 2);
    } else {
      ctx.moveTo(6, hy - 14);
      ctx.quadraticCurveTo(26, hy - 16, 22, hy + 10);
      ctx.quadraticCurveTo(18, hy + 0, 10, hy - 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (c.id === 'zoe' || c.id === 'maya') {
    // cabelo longo atrás
    ctx.fillStyle = vgrad(ctx, hy - 10, hy + 18, shade(L.hair, 0.1), shade(L.hair, -0.3));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    rrect(ctx, -R - 1 + (side ? -3 : 0), hy - 4, side ? 18 : 2 * R + 2, 20, 8);
    ctx.fill();
    ctx.stroke();
  }
  if (c.id === 'zed') {
    // capuz
    ctx.fillStyle = vgrad(ctx, hy - 18, hy + 14, shade(L.jacket, 0.2), L.jacketDark);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-R - 3, hy + 12);
    ctx.quadraticCurveTo(-R - 5, hy - R - 6, 0, hy - R - 5);
    ctx.quadraticCurveTo(R + 5, hy - R - 6, R + 3, hy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---- rosto
  if (c.id === 'zed' && !back) {
    // interior escuro do capuz + visor
    ctx.fillStyle = '#07040f';
    ctx.beginPath();
    ctx.ellipse(fx, hy + 1, R - 2.5, R - 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 8;
    const vg = ctx.createLinearGradient(-10, 0, 10, 0);
    vg.addColorStop(0, '#5b2bd6');
    vg.addColorStop(0.5, '#d9b8ff');
    vg.addColorStop(1, '#7a3cff');
    ctx.fillStyle = vg;
    rrect(ctx, side ? fx - 2 : -10, hy - 3, side ? 12 : 20, 7, 3.5);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(side ? fx + 1 : -6, hy - 1.8, 4, 1.4);
    return;
  }
  if (c.id === 'zed' && back) {
    glowLine(ctx, c.color, [
      [-6, hy - 6],
      [0, hy - 10],
      [6, hy - 6],
    ], 1.4);
    return;
  }

  const skin = ctx.createRadialGradient(fx - 4, hy - 5, 2, fx, hy, R + 2);
  skin.addColorStop(0, shade(c.skin, 0.25));
  skin.addColorStop(1, shade(c.skin, -0.12));
  ctx.fillStyle = back ? vgrad(ctx, hy - R, hy + R, shade(L.hair, 0.15), shade(L.hair, -0.2)) : skin;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(fx * 0.4, hy, R, R - 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!back) {
    // orelha (lateral)
    if (side) {
      ctx.fillStyle = shade(c.skin, -0.05);
      ctx.beginPath();
      ctx.ellipse(-4, hy + 1, 2.6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // olhos
    const eyes = side ? [fx + 6] : [-5, 5];
    for (const ex of eyes) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ex, hy + 1.5, side ? 2.6 : 3.2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = L.eye;
      ctx.beginPath();
      ctx.ellipse(ex + (side ? 0.8 : 0.3), hy + 2.2, 2.1, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c0814';
      ctx.beginPath();
      ctx.arc(ex + (side ? 1 : 0.4), hy + 2.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 0.6, hy + 0.8, 0.9, 0, Math.PI * 2);
      ctx.fill();
      // sobrancelha determinada
      ctx.strokeStyle = shade(L.hair, -0.3);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ex - 2.8, hy - 4.2);
      ctx.lineTo(ex + 2.6, hy - 3);
      ctx.stroke();
    }
    // bochechas
    ctx.fillStyle = 'rgba(255,110,130,0.25)';
    for (const ex of side ? [fx + 4] : [-8, 8]) {
      ctx.beginPath();
      ctx.ellipse(ex, hy + 7, 2.6, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // boca
    if (c.id !== 'kael') {
      ctx.strokeStyle = shade(c.skin, -0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(side ? fx + 6 : 0.5, hy + 7.5, 2, 0.2, Math.PI - 0.6);
      ctx.stroke();
    }
  }

  // ---- cabelo e acessórios por personagem
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  const hairFill = vgrad(ctx, hy - R - 6, hy + 4, shade(L.hair, 0.2), shade(L.hair, -0.15));
  switch (c.id) {
    case 'kael': {
      spikyHair(ctx, hairFill, hy, R, side, back, 7);
      if (!back) {
        // máscara
        ctx.fillStyle = vgrad(ctx, hy + 3, hy + 12, '#24407a', '#142650');
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.8;
        if (side) rrect(ctx, fx - 1, hy + 4, 15, 9, 4);
        else rrect(ctx, -11, hy + 4, 22, 9.5, 4.5);
        ctx.fill();
        ctx.stroke();
        glowLine(ctx, c.color, side ? [[fx + 3, hy + 9], [fx + 12, hy + 9]] : [[-7, hy + 9], [7, hy + 9]], 1.2);
      }
      break;
    }
    case 'luna': {
      bangs(ctx, hairFill, hy, R, side, back);
      // fone
      ctx.strokeStyle = '#141018';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(fx * 0.4, hy - 1, R + 1.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      for (const ex of side ? [-3] : [-R - 0.5, R + 0.5]) {
        ctx.fillStyle = '#1c1424';
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(ex, hy + 1, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(ex, hy + 1, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'bruno': {
      shortHair(ctx, hairFill, hy, R, side, back);
      cap(ctx, '#232328', '#3a3a42', c.color, hy, R, side, back);
      break;
    }
    case 'zoe': {
      bangs(ctx, hairFill, hy, R, side, back);
      if (!back) glasses(ctx, '#ffb020', hy + 1.5, side, fx);
      else goggleStrap(ctx, hy - 6);
      break;
    }
    case 'maya': {
      bangs(ctx, hairFill, hy, R, side, back);
      cap(ctx, '#f2f0f6', '#ffffff', '#ff5fa0', hy, R, side, back);
      if (!back) {
        // óculos de aviador sobre o boné
        for (const ex of side ? [fx + 3] : [-5.5, 5.5]) {
          ctx.fillStyle = '#ff9ec8';
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(ex, hy - 12, 4.6, 3.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(ex - 1.6, hy - 13, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
}

function spikyHair(ctx: CanvasRenderingContext2D, fill: CanvasGradient, hy: number, R: number, side: boolean, back: boolean, n: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (back) {
    ctx.ellipse(0, hy - 1, R + 1, R, 0, 0, Math.PI * 2);
  } else {
    const left = side ? -R - 1 : -R - 2;
    const right = side ? R + 4 : R + 2;
    ctx.moveTo(left, hy + 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = left + (right - left) * t;
      const arc = Math.sin(t * Math.PI);
      const y = hy - R * 0.6 - arc * (R * 0.55) - (i % 2 ? 6 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(right, hy - 2);
    // franja
    ctx.lineTo(side ? R : 8, hy - 5);
    ctx.lineTo(side ? R - 4 : 4, hy - 2.5);
    ctx.lineTo(side ? R - 7 : 0, hy - 6);
    ctx.lineTo(side ? 0 : -4, hy - 3);
    ctx.lineTo(side ? -4 : -8, hy - 6);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-2, hy - 7, 6, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();
}

function bangs(ctx: CanvasRenderingContext2D, fill: CanvasGradient, hy: number, R: number, side: boolean, back: boolean) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (back) {
    ctx.ellipse(0, hy - 1, R + 1.5, R + 0.5, 0, 0, Math.PI * 2);
  } else if (side) {
    ctx.moveTo(-R - 1, hy + 6);
    ctx.quadraticCurveTo(-R - 2, hy - R - 4, 4, hy - R - 2);
    ctx.quadraticCurveTo(R + 5, hy - R + 1, R + 3, hy - 1);
    ctx.lineTo(R - 2, hy - 5);
    ctx.lineTo(8, hy - 2);
    ctx.lineTo(4, hy - 6);
    ctx.lineTo(-2, hy + 2);
    ctx.closePath();
  } else {
    ctx.moveTo(-R - 2, hy + 6);
    ctx.quadraticCurveTo(-R - 3, hy - R - 5, 0, hy - R - 3);
    ctx.quadraticCurveTo(R + 3, hy - R - 5, R + 2, hy + 6);
    ctx.lineTo(R - 2, hy - 2);
    ctx.lineTo(9, hy - 5);
    ctx.lineTo(5, hy - 1.5);
    ctx.lineTo(1, hy - 6);
    ctx.lineTo(-4, hy - 2);
    ctx.lineTo(-8, hy - 5.5);
    ctx.lineTo(-R + 2, hy - 1);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(-3, hy - 6, 7, Math.PI * 1.15, Math.PI * 1.55);
  ctx.stroke();
}

function shortHair(ctx: CanvasRenderingContext2D, fill: CanvasGradient, hy: number, R: number, side: boolean, back: boolean) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (back) ctx.ellipse(0, hy - 1, R + 0.5, R - 0.5, 0, 0, Math.PI * 2);
  else ctx.ellipse(side ? -2 : 0, hy - 5, R + 0.5, R * 0.62, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function cap(ctx: CanvasRenderingContext2D, col: string, top: string, accent: string, hy: number, R: number, side: boolean, back: boolean) {
  ctx.fillStyle = vgrad(ctx, hy - R - 4, hy - 3, top, col);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, hy - 5, R + 1, R * 0.78, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!back) {
    ctx.fillStyle = shade(col.startsWith('#') ? col : '#333333', -0.15);
    ctx.beginPath();
    if (side) ctx.ellipse(R - 1, hy - 5, 9, 2.8, 0.05, 0, Math.PI * 2);
    else ctx.ellipse(0, hy - 4.5, R + 3, 4, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(side ? 0 : 0, hy - 11, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(-3, hy - 6, 6, 2);
  }
}

function glasses(ctx: CanvasRenderingContext2D, frame: string, y: number, side: boolean, fx: number) {
  ctx.strokeStyle = frame;
  ctx.lineWidth = 2;
  for (const ex of side ? [fx + 6] : [-5, 5]) {
    ctx.fillStyle = 'rgba(255,200,80,0.25)';
    ctx.beginPath();
    ctx.ellipse(ex, y, 4.4, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (!side) {
    ctx.beginPath();
    ctx.moveTo(-0.6, y);
    ctx.lineTo(0.6, y);
    ctx.stroke();
  }
}

function goggleStrap(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-13, y);
  ctx.lineTo(13, y);
  ctx.stroke();
}
