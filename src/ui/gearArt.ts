// Desenhos vetoriais dos equipamentos (armas, itens, habilidades e ultimates) para a tela de Equipamento.
// Tudo é desenhado em código, num espaço de 120×80, e escalado para o tamanho real do canvas (nítido em qualquer tela).
import { WEAPONS, type WeaponId } from '../game/weapons';
import { dpr } from './portraits';

export type GearKind = 'primary' | 'kit' | 'skill' | 'ult';
type G = CanvasRenderingContext2D;

const INK = '#0c0a18';

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex: string, k: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** peça com contorno, brilho em cima e sombra embaixo (visual "cartoon detalhado") */
function part(g: G, x: number, y: number, w: number, h: number, r: number, col: string) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, shade(col, 0.28));
  gr.addColorStop(0.55, col);
  gr.addColorStop(1, shade(col, -0.35));
  g.fillStyle = gr;
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + r, y + 1.8);
  g.lineTo(x + w - r, y + 1.8);
  g.stroke();
}
function poly(g: G, pts: number[], col: string, stroke = true) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
  if (stroke) {
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
  }
}
function glow(g: G, x: number, y: number, r: number, col: string) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, col);
  gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function circle(g: G, x: number, y: number, r: number, col: string, stroke = true) {
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (stroke) {
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
  }
}
function star(g: G, x: number, y: number, r: number, n: number, col: string, inner = 0.45, rot = -Math.PI / 2) {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(g, pts, col);
}
function grip(g: G, x: number, y: number, col = '#2a2438', w = 12, h = 22, tilt = 0.25) {
  poly(g, [x, y, x + w, y, x + w - Math.tan(tilt) * h + 2, y + h, x - Math.tan(tilt) * h, y + h], col);
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    g.beginPath();
    g.moveTo(x + 1 - Math.tan(tilt) * k * 5, y + k * 5);
    g.lineTo(x + w - 2 - Math.tan(tilt) * k * 5, y + k * 5);
    g.stroke();
  }
}
function trigger(g: G, x: number, y: number) {
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y + 5, 5, 0, Math.PI);
  g.stroke();
}
function scope(g: G, x: number, y: number, w: number, col: string) {
  part(g, x, y, w, 7, 3.5, '#22262e');
  circle(g, x + w, y + 3.5, 4.5, col);
  g.fillStyle = hexA('#ffffff', 0.6);
  g.beginPath();
  g.arc(x + w + 1, y + 2, 1.5, 0, Math.PI * 2);
  g.fill();
  part(g, x + w * 0.35, y + 6, 5, 5, 1, '#22262e');
}

// ------------------------------------------------------------------ armas
type Shape = 'pistol' | 'energy' | 'darts' | 'cannon' | 'sniper' | 'marksman' | 'star' | 'dice' | 'shuriken' | 'rivet' | 'nail' | 'light' | 'fists' | 'crystal' | 'shock' | 'orb' | 'crossbow' | 'shotgun' | 'smg' | 'launcher' | 'rocket' | 'laser';
const SHAPE: Record<WeaponId, Shape> = {
  blaster: 'pistol',
  pulsador: 'energy',
  dardos: 'darts',
  canhao: 'cannon',
  rifle: 'sniper',
  estelar: 'star',
  dados: 'dice',
  shuriken: 'shuriken',
  rebite: 'rivet',
  luz: 'light',
  punhos: 'fists',
  cristal: 'crystal',
  choque: 'shock',
  orbe: 'orb',
  pregos: 'nail',
  besta: 'crossbow',
  fuzil: 'marksman',
  espingarda: 'shotgun',
  submetra: 'smg',
  lancador: 'launcher',
  acido: 'launcher',
  colosso: 'cannon',
  marcador: 'darts',
  metralhadora: 'smg',
  escopeta: 'shotgun',
  laser: 'laser',
  foguete: 'rocket',
  congelante: 'crystal',
};

function drawWeapon(g: G, id: WeaponId) {
  const w = WEAPONS[id];
  const c = w.color;
  const body = w.gun.body;
  const tip = w.gun.tip;
  switch (SHAPE[id]) {
    case 'pistol':
      part(g, 30, 26, 52, 15, 4, body);
      part(g, 80, 29, 14, 8, 2, '#3a3448');
      glow(g, 96, 33, 7, c);
      grip(g, 38, 40, '#1e1a2a');
      trigger(g, 52, 40);
      part(g, 34, 29, 30, 4, 2, shade(c, -0.2));
      break;
    case 'energy':
      part(g, 26, 25, 60, 17, 6, body);
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = c;
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(58 + k * 9, 33.5, 3, 11, 0, 0, Math.PI * 2);
        g.stroke();
      }
      part(g, 84, 29, 12, 9, 3, '#22305a');
      glow(g, 99, 33.5, 9, c);
      grip(g, 34, 41, '#141c3a');
      trigger(g, 48, 41);
      glow(g, 40, 33, 5, c);
      break;
    case 'darts':
      part(g, 30, 30, 56, 10, 4, body);
      part(g, 84, 32, 16, 6, 2, '#2b1830');
      grip(g, 40, 39, '#1e1022', 11, 20);
      // dardo carregado em cima
      g.strokeStyle = '#c8c8d0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(40, 25);
      g.lineTo(92, 25);
      g.stroke();
      poly(g, [92, 21, 102, 25, 92, 29], c);
      poly(g, [40, 25, 34, 20, 34, 30], tip);
      break;
    case 'cannon':
      part(g, 22, 22, 50, 26, 10, body);
      for (let k = 0; k < 3; k++) part(g, 70, 24 + k * 8, 22, 6, 3, '#2a2e2a');
      circle(g, 96, 35, 9, shade(c, -0.3));
      glow(g, 96, 35, 11, c);
      part(g, 30, 16, 26, 7, 3, shade(body, 0.2));
      grip(g, 34, 47, '#141c18', 13, 18);
      break;
    case 'sniper':
    case 'marksman':
    case 'laser': {
      const long = SHAPE[id] !== 'marksman';
      poly(g, [10, 30, 30, 28, 34, 40, 14, 46], shade(body, 0.1));
      part(g, 28, 28, 52, 12, 3, body);
      part(g, 78, 31, long ? 32 : 24, 5, 2, '#22262e');
      scope(g, 40, 18, 26, tip);
      grip(g, 40, 39, '#1e1a14', 10, 18);
      trigger(g, 52, 39);
      if (SHAPE[id] === 'laser') glow(g, 112, 33.5, 8, c);
      else part(g, 58, 39, 10, 10, 2, '#22262e');
      break;
    }
    case 'star':
      part(g, 28, 27, 48, 14, 5, body);
      part(g, 74, 29, 12, 10, 3, shade(body, 0.2));
      star(g, 96, 34, 11, 5, c);
      grip(g, 36, 40, '#24142a');
      trigger(g, 50, 40);
      star(g, 44, 34, 4, 5, tip);
      break;
    case 'dice':
      part(g, 26, 24, 56, 20, 5, body);
      part(g, 80, 29, 12, 10, 2, '#1a1428');
      for (const [x, y, r] of [[96, 26, 0.3], [102, 42, -0.4]] as const) {
        g.save();
        g.translate(x, y);
        g.rotate(r);
        part(g, -7, -7, 14, 14, 3, '#f2f0ff');
        g.fillStyle = INK;
        for (const [px, py] of [[-3, -3], [3, 3], [0, 0]]) {
          g.beginPath();
          g.arc(px, py, 1.4, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
      grip(g, 36, 43, '#151022');
      glow(g, 40, 34, 5, c);
      break;
    case 'shuriken':
      for (const [x, y, r, s] of [[40, 40, 17, 0.2], [72, 30, 14, 0.6], [92, 48, 11, 1]] as const) {
        g.save();
        g.translate(x, y);
        g.rotate(s);
        star(g, 0, 0, r, 4, '#c8ccd8', 0.32, 0);
        circle(g, 0, 0, r * 0.25, c);
        g.restore();
      }
      break;
    case 'rivet':
    case 'nail':
      part(g, 26, 22, 54, 20, 6, body);
      part(g, 78, 28, 18, 8, 2, '#4a4e58');
      part(g, 30, 41, 26, 12, 4, shade(body, -0.2));
      circle(g, SHAPE[id] === 'rivet' ? 36 : 70, 18, 7, tip);
      grip(g, 58, 41, '#2a2e36', 12, 20, 0.1);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = '#d8dce8';
        g.fillRect(100 + k * 6, 31, 5, 2);
      }
      break;
    case 'light':
      g.strokeStyle = shade(body, -0.2);
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(24, 56);
      g.lineTo(80, 26);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.stroke();
      glow(g, 88, 22, 16, c);
      g.strokeStyle = c;
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(88, 22, 13, 5, -0.4, 0, Math.PI * 2);
      g.stroke();
      star(g, 88, 22, 6, 4, '#ffffff', 0.4, 0);
      break;
    case 'fists':
      for (const [x, y, s] of [[30, 26, 1], [66, 30, 0.9]] as const) {
        g.save();
        g.translate(x, y);
        g.scale(s, s);
        part(g, 0, 8, 30, 26, 9, w.gun.body);
        for (let k = 0; k < 4; k++) part(g, 26, 8 + k * 6.5, 10, 6, 3, shade(w.gun.body, 0.25));
        part(g, -6, 14, 10, 16, 4, '#3a2a20');
        glow(g, 18, 20, 6, tip);
        g.restore();
      }
      break;
    case 'crystal':
      part(g, 28, 28, 46, 14, 5, body);
      grip(g, 36, 41, '#18304a');
      poly(g, [74, 35, 86, 24, 100, 30, 106, 35, 100, 40, 86, 46], shade(c, 0.2));
      poly(g, [86, 24, 92, 14, 98, 26], shade(c, 0.45));
      poly(g, [86, 46, 92, 56, 98, 44], shade(c, 0.45));
      glow(g, 96, 35, 6, '#ffffff');
      break;
    case 'shock':
      part(g, 30, 26, 46, 18, 6, body);
      part(g, 74, 28, 8, 14, 2, '#3a3428');
      g.strokeStyle = '#c8c8d0';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(82, 30);
      g.lineTo(92, 30);
      g.moveTo(82, 40);
      g.lineTo(92, 40);
      g.stroke();
      poly(g, [96, 18, 90, 34, 98, 34, 92, 52, 108, 30, 100, 30, 106, 18], c);
      grip(g, 38, 43, '#1a1610');
      break;
    case 'orb':
      g.strokeStyle = '#3a2a6a';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(20, 58);
      g.lineTo(74, 34);
      g.stroke();
      poly(g, [70, 24, 80, 30, 78, 44, 68, 40], body);
      glow(g, 90, 28, 20, c);
      circle(g, 90, 28, 10, shade(c, -0.1));
      g.strokeStyle = hexA('#ffffff', 0.7);
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(90, 28, 17, 6, 0.4, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'crossbow':
      part(g, 22, 31, 72, 8, 3, '#5a4a3a');
      g.strokeStyle = body;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(74, 12);
      g.quadraticCurveTo(88, 35, 74, 58);
      g.stroke();
      g.strokeStyle = '#e8e8f0';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(74, 12);
      g.lineTo(40, 35);
      g.lineTo(74, 58);
      g.stroke();
      g.strokeStyle = '#c8d0e0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(40, 32);
      g.lineTo(104, 32);
      g.stroke();
      poly(g, [104, 28, 112, 32, 104, 36], c);
      grip(g, 36, 38, '#2a2016', 10, 18);
      break;
    case 'shotgun':
      poly(g, [10, 30, 32, 28, 34, 40, 12, 48], '#7a4a2a');
      part(g, 30, 27, 30, 12, 3, body);
      part(g, 58, 27, 50, 5, 2, '#2a2228');
      part(g, 58, 33, 44, 5, 2, '#2a2228');
      part(g, 66, 36, 22, 7, 3, '#8a5a32');
      grip(g, 34, 38, '#5a3a20', 10, 16);
      glow(g, 108, 30, 5, c);
      break;
    case 'smg':
      part(g, 26, 25, 54, 15, 4, body);
      part(g, 78, 29, 18, 6, 2, '#2a2e34');
      part(g, 60, 39, 8, 22, 2, '#3a3e46');
      grip(g, 36, 39, '#1a1c20', 11, 18);
      poly(g, [12, 28, 26, 27, 26, 36, 12, 38], '#3a3e46');
      glow(g, 98, 32, 5, c);
      break;
    case 'launcher':
      part(g, 28, 24, 62, 20, 9, body);
      circle(g, 48, 34, 12, shade(body, -0.2));
      for (let k = 0; k < 6; k++) circle(g, 48 + Math.cos((k / 6) * Math.PI * 2) * 7, 34 + Math.sin((k / 6) * Math.PI * 2) * 7, 2.5, c, false);
      part(g, 88, 26, 16, 16, 5, '#2a3420');
      glow(g, 106, 34, 7, c);
      grip(g, 62, 43, '#1e2618', 11, 18);
      break;
    case 'rocket':
      part(g, 16, 26, 88, 16, 8, body);
      poly(g, [104, 26, 116, 34, 104, 42], tip);
      grip(g, 50, 41, '#1e2618', 11, 18);
      scope(g, 30, 17, 16, c);
      break;
  }
}

// ------------------------------------------------------------------ itens
function drawKit(g: G, id: string) {
  if (id === 'bomba' || id === 'gelo') {
    const ice = id === 'gelo';
    const col = ice ? '#7fd8ff' : '#3a3e30';
    circle(g, 60, 46, 22, col);
    const gr = g.createRadialGradient(52, 38, 2, 60, 46, 22);
    gr.addColorStop(0, hexA('#ffffff', 0.5));
    gr.addColorStop(1, hexA('#ffffff', 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(60, 46, 22, 0, Math.PI * 2);
    g.fill();
    part(g, 52, 18, 16, 9, 3, '#5a5e66');
    g.strokeStyle = '#c8b080';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(66, 20);
    g.quadraticCurveTo(80, 10, 82, 18);
    g.stroke();
    glow(g, 83, 17, 7, ice ? '#bff4ff' : '#ffb347');
    if (ice) star(g, 60, 47, 11, 6, '#e8fbff', 0.35);
    else {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(40, 46 + k * 9);
        g.lineTo(80, 46 + k * 9);
        g.stroke();
      }
    }
    return;
  }
  if (id === 'mina') {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(60, 58, 34, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a3014';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(60, 48, 32, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    part(g, 40, 36, 40, 12, 6, '#4a5420');
    glow(g, 60, 36, 9, '#c8ff3c');
    circle(g, 60, 36, 3.5, '#eaff9a');
    for (const s of [-1, 1]) part(g, 60 + s * 22 - 3, 38, 6, 6, 2, '#7a8440');
    return;
  }
  // kit médico
  part(g, 30, 22, 60, 42, 8, '#f2f4fa');
  part(g, 50, 14, 20, 10, 4, '#c8ccd8');
  poly(g, [55, 28, 65, 28, 65, 38, 75, 38, 75, 48, 65, 48, 65, 58, 55, 58, 55, 48, 45, 48, 45, 38, 55, 38], '#ff4a5a');
  glow(g, 90, 22, 8, '#5dffb8');
}

// ------------------------------------------------------------------ habilidades (E)
function drawSkill(g: G, id: string) {
  switch (id) {
    case 'rolamento': {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = hexA('#3ee8ff', 0.25 + k * 0.25);
        g.lineWidth = 4;
        g.beginPath();
        g.arc(60 - k * 2, 40, 24 - k * 6, -Math.PI * 0.9, Math.PI * 0.6);
        g.stroke();
      }
      poly(g, [80, 50, 92, 44, 86, 58], '#3ee8ff');
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = hexA('#bff4ff', 0.6);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(14 + k * 4, 30 + k * 8);
        g.lineTo(30 + k * 4, 30 + k * 8);
        g.stroke();
      }
      circle(g, 60, 40, 8, '#2552b8');
      break;
    }
    case 'armadilha': {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(60, 60, 36, 8, 0, 0, Math.PI * 2);
      g.fill();
      for (const s of [-1, 1]) {
        g.save();
        g.translate(60, 50);
        g.scale(1, s);
        g.fillStyle = '#5a6070';
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, 30, Math.PI, 0);
        g.lineTo(26, 0);
        g.arc(0, 0, 26, 0, Math.PI, true);
        g.closePath();
        g.fill();
        g.stroke();
        for (let k = 0; k < 7; k++) {
          const a = Math.PI + ((k + 0.5) / 7) * Math.PI;
          poly(g, [Math.cos(a - 0.12) * 26, Math.sin(a - 0.12) * 26, Math.cos(a) * 16, Math.sin(a) * 16, Math.cos(a + 0.12) * 26, Math.sin(a + 0.12) * 26], '#e8ecf6', false);
        }
        g.restore();
      }
      circle(g, 60, 50, 5, '#ff5a3c');
      break;
    }
    case 'barreira': {
      const gr = g.createLinearGradient(30, 0, 90, 0);
      gr.addColorStop(0, hexA('#3ee8ff', 0.25));
      gr.addColorStop(0.5, hexA('#bff8ff', 0.75));
      gr.addColorStop(1, hexA('#3ee8ff', 0.25));
      g.fillStyle = gr;
      g.strokeStyle = '#3ee8ff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(28, 12, 64, 50, 6);
      g.fill();
      g.stroke();
      g.strokeStyle = hexA('#ffffff', 0.6);
      g.lineWidth = 1.2;
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 4; x++) {
          const cx = 36 + x * 16 + (y % 2) * 8;
          const cy = 22 + y * 15;
          g.beginPath();
          for (let k = 0; k < 6; k++) g.lineTo(cx + Math.cos((k / 6) * Math.PI * 2) * 6, cy + Math.sin((k / 6) * Math.PI * 2) * 6);
          g.closePath();
          g.stroke();
        }
      part(g, 24, 60, 72, 8, 3, '#2a3a5a');
      for (const x of [20, 26]) {
        g.fillStyle = '#ff6a4a';
        g.beginPath();
        g.arc(x - 8, 36, 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'marcador': {
      g.strokeStyle = '#ff5a3c';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(76, 40, 20, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(76, 40, 9, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        g.beginPath();
        g.moveTo(76 + Math.cos(a) * 14, 40 + Math.sin(a) * 14);
        g.lineTo(76 + Math.cos(a) * 26, 40 + Math.sin(a) * 26);
        g.stroke();
      }
      g.strokeStyle = '#c8c8d0';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(14, 52);
      g.lineTo(64, 43);
      g.stroke();
      poly(g, [64, 39, 76, 40, 66, 47], '#ffd23e');
      poly(g, [14, 52, 6, 46, 10, 58], '#ff5a3c');
      break;
    }
    case 'estimulo': {
      glow(g, 60, 40, 34, '#5dffb8');
      g.save();
      g.translate(60, 40);
      g.rotate(-0.6);
      part(g, -30, -7, 46, 14, 5, '#e8fff6');
      part(g, -24, -4, 30, 8, 3, '#36f5c0');
      part(g, 16, -2, 16, 4, 1, '#c8ccd8');
      part(g, -38, -10, 8, 20, 2, '#9aa4b8');
      g.restore();
      poly(g, [86, 14, 92, 14, 92, 20, 98, 20, 98, 26, 92, 26, 92, 32, 86, 32, 86, 26, 80, 26, 80, 20, 86, 20], '#ffffff');
      break;
    }
  }
}

// ------------------------------------------------------------------ ultimates (R)
function drawUlt(g: G, id: string) {
  switch (id) {
    case 'meteoro': {
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = hexA(k % 2 ? '#ffd23e' : '#ff6a3a', 0.7 - k * 0.12);
        g.lineWidth = 9 - k * 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(14 + k * 6, 6 + k * 3);
        g.lineTo(58, 36);
        g.stroke();
      }
      glow(g, 66, 44, 26, '#ff8a3d');
      poly(g, [52, 36, 62, 28, 76, 32, 82, 46, 72, 58, 56, 56, 48, 46], '#5a3a2a');
      for (const [x, y] of [[60, 40], [70, 48], [64, 52]]) circle(g, x, y, 3, '#3a2418', false);
      g.strokeStyle = '#ffb347';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.ellipse(68, 66, 30, 7, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    case 'feixe': {
      const gr = g.createLinearGradient(52, 0, 118, 0);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.3, '#ff4fc3');
      gr.addColorStop(0.6, '#3ee8ff');
      gr.addColorStop(1, hexA('#ffd23e', 0.2));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(52, 36);
      g.lineTo(118, 24);
      g.lineTo(118, 52);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(52, 37, 66, 3);
      poly(g, [30, 58, 44, 16, 58, 58], hexA('#e8f4ff', 0.85));
      g.strokeStyle = hexA('#ffffff', 0.7);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(44, 16);
      g.lineTo(44, 58);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(4, 38);
      g.lineTo(36, 38);
      g.stroke();
      break;
    }
    case 'estase': {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = hexA('#c77dff', 0.9 - k * 0.25);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(60, 40, 14 + k * 9, 0, Math.PI * 2);
        g.stroke();
      }
      glow(g, 60, 40, 16, '#c77dff');
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(60, 40);
      g.lineTo(60, 30);
      g.moveTo(60, 40);
      g.lineTo(68, 44);
      g.stroke();
      for (const [x, y] of [[26, 18], [96, 22], [94, 62], [24, 60]]) star(g, x, y, 5, 4, '#e8d0ff', 0.4, 0);
      break;
    }
    case 'sobrecarga': {
      glow(g, 60, 40, 32, '#ffe14a');
      part(g, 40, 18, 40, 48, 8, '#2a2418');
      part(g, 52, 12, 16, 8, 3, '#5a5040');
      part(g, 45, 40, 30, 21, 4, '#5dff8a');
      poly(g, [64, 22, 50, 44, 60, 44, 54, 62, 72, 36, 62, 36, 68, 22], '#ffe14a');
      break;
    }
  }
}

/** desenha um equipamento num canvas (fundo com brilho da cor do item) */
export function drawGear(cv: HTMLCanvasElement, kind: GearKind, id: string, color: string, opts: { locked?: boolean; bg?: boolean } = {}) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d')!;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, w, h);
  if (opts.bg !== false) {
    const halo = g.createRadialGradient(w / 2, h * 0.55, 2, w / 2, h * 0.55, Math.max(w, h) * 0.6);
    halo.addColorStop(0, hexA(color, 0.32));
    halo.addColorStop(1, hexA(color, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
  }
  // armas são compridas: usa só a faixa do meio (y 8–64) para ficarem maiores
  const bh = kind === 'primary' ? 56 : 80;
  const by = kind === 'primary' ? 8 : 0;
  const s = Math.min(w / 120, h / bh) * 0.94;
  g.save();
  g.translate((w - 120 * s) / 2, (h - bh * s) / 2 - by * s);
  g.scale(s, s);
  g.lineJoin = 'round';
  if (kind === 'primary') drawWeapon(g, id as WeaponId);
  else if (kind === 'kit') drawKit(g, id);
  else if (kind === 'skill') drawSkill(g, id);
  else drawUlt(g, id);
  g.restore();
}
