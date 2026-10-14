// Desenho vetorial do ECO Mundo. Fachada, vegetação e adereços. Sem retângulo pelado como prédio.
import type { Prop, PropKind } from '../game/mundo/scenery';

export function drawProp(ctx: CanvasRenderingContext2D, p: Prop, t: number) {
  if (p.kind === 'tree') drawTree(ctx, p.x, p.y, p.r ?? 28, t);
  else if (p.kind === 'bush') drawBush(ctx, p.x, p.y, p.r ?? 16, t);
  else if (p.kind === 'rock') drawRock(ctx, p.x, p.y, p.r ?? 16);
  else if (p.kind === 'lamp') drawLamp(ctx, p.x, p.y, t);
  else if (p.kind === 'bench') drawBench(ctx, p.x, p.y);
  else if (p.kind === 'crate') drawCrate(ctx, p.x, p.y);
  else if (p.kind === 'barrel') drawBarrel(ctx, p.x, p.y);
  else if (p.kind === 'log') drawLog(ctx, p.x, p.y);
  else if (p.kind === 'flower') drawFlower(ctx, p.x, p.y, p.variant ?? 0, t);
  else if (p.kind === 'mushroom') drawMushroom(ctx, p.x, p.y, p.variant ?? 0);
  else if (p.kind === 'ruin') drawRuin(ctx, p.x, p.y, p.w ?? 140, p.h ?? 80);
  else drawBuilding(ctx, p.x, p.y, p.w ?? 140, p.h ?? 100, p.kind, t);
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: PropKind, t: number) {
  const left = x - w / 2;
  const top = y - h;
  shadow(ctx, x, y + 6, w * 0.46, 10);
  const wall = kind === 'bank' ? '#243044' : kind === 'forge' ? '#3a2418' : kind === 'shop' ? '#2a2140' : '#2c2438';
  const roof = kind === 'bank' ? '#3ea8ff' : kind === 'forge' ? '#ff8a3c' : kind === 'shop' ? '#ffd23e' : '#c084fc';
  ctx.fillStyle = wall;
  ctx.fillRect(left, top + 18, w, h - 18);
  ctx.beginPath();
  ctx.moveTo(left - 8, top + 22);
  ctx.lineTo(x, top - 8);
  ctx.lineTo(left + w + 8, top + 22);
  ctx.closePath();
  ctx.fillStyle = '#1a1028';
  ctx.fill();
  ctx.strokeStyle = roof;
  ctx.lineWidth = 3;
  ctx.stroke();
  const glow = 0.45 + Math.sin(t * 2 + x) * 0.15;
  ctx.fillStyle = `rgba(62,232,255,${glow})`;
  ctx.fillRect(left + 16, top + 36, 18, 14);
  ctx.fillRect(left + w - 34, top + 36, 18, 14);
  ctx.fillStyle = '#120c18';
  ctx.fillRect(x - 12, y - 36, 24, 36);
  ctx.fillStyle = roof;
  ctx.fillRect(x - 14, y - 38, 28, 6);
  ctx.font = '700 13px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = roof;
  const label = kind === 'shop' ? 'LOJA' : kind === 'bank' ? 'BANCO' : kind === 'forge' ? 'FORJA' : 'CASA';
  ctx.fillText(label, x, top + 14);
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  const sway = Math.sin(t + x) * 2;
  shadow(ctx, x, y + 4, r * 0.7, 8);
  ctx.fillStyle = '#4a3424';
  ctx.fillRect(x - 5, y - r * 0.9, 10, r * 0.9);
  ctx.fillStyle = '#163222';
  ctx.beginPath();
  ctx.arc(x - r * 0.25 + sway, y - r * 1.05, r * 0.62, 0, Math.PI * 2);
  ctx.arc(x + r * 0.28 + sway, y - r * 0.95, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f6a3a';
  ctx.beginPath();
  ctx.arc(x + sway, y - r * 1.15, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(93,255,138,0.18)';
  ctx.beginPath();
  ctx.arc(x + sway * 0.5, y - r * 1.2, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  const s = Math.sin(t * 1.4 + y) * 1.5;
  shadow(ctx, x, y + 3, r, 5);
  ctx.fillStyle = '#1c4a28';
  ctx.beginPath();
  ctx.arc(x - r * 0.4, y - r * 0.3 + s, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x + r * 0.35, y - r * 0.2, r * 0.5, 0, Math.PI * 2);
  ctx.arc(x, y - r * 0.55 + s, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  shadow(ctx, x, y + 3, r, 5);
  ctx.fillStyle = '#3a4250';
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.4, y - r * 0.8);
  ctx.lineTo(x + r * 0.5, y - r * 0.55);
  ctx.lineTo(x + r, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a7384';
  ctx.fillRect(x - r * 0.2, y - r * 0.45, r * 0.35, 3);
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  shadow(ctx, x, y + 2, 10, 4);
  ctx.strokeStyle = '#241c30';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 36);
  ctx.stroke();
  const a = 0.55 + Math.sin(t * 3 + x) * 0.2;
  ctx.fillStyle = `rgba(255,210,120,${a})`;
  ctx.beginPath();
  ctx.arc(x, y - 40, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,210,120,0.12)';
  ctx.beginPath();
  ctx.arc(x, y - 40, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y + 2, 22, 4);
  ctx.fillStyle = '#6a4a32';
  ctx.fillRect(x - 18, y - 10, 36, 5);
  ctx.fillRect(x - 16, y - 6, 3, 8);
  ctx.fillRect(x + 13, y - 6, 3, 8);
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y + 2, 12, 4);
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(x - 10, y - 16, 20, 16);
  ctx.strokeStyle = '#3a2414';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 10, y - 16, 20, 16);
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 8);
  ctx.lineTo(x + 10, y - 8);
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y + 2, 11, 4);
  ctx.fillStyle = '#5a3824';
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8a060';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 10, 4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLog(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y + 3, 24, 5);
  ctx.fillStyle = '#6a4a2c';
  ctx.beginPath();
  ctx.ellipse(x, y - 6, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c4a06a';
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 6, 5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number, t: number) {
  const colors = ['#ff7ad9', '#7af0ff', '#ffe08a'];
  const s = Math.sin(t * 2 + x) * 1.2;
  ctx.strokeStyle = '#2f6a38';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s, y - 12);
  ctx.stroke();
  ctx.fillStyle = colors[variant % colors.length];
  ctx.beginPath();
  ctx.arc(x + s, y - 14, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  ctx.fillStyle = '#efe6d4';
  ctx.fillRect(x - 2, y - 10, 4, 10);
  ctx.fillStyle = variant % 2 ? '#3ee8ff' : '#c084fc';
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 8, 5, 0, Math.PI, 0);
  ctx.fill();
}

function drawRuin(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadow(ctx, x, y + 4, w * 0.4, 8);
  ctx.fillStyle = '#3a3e48';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2 + 10, y - h);
  ctx.lineTo(x - 10, y - h * 0.72);
  ctx.lineTo(x + 8, y - h * 0.9);
  ctx.lineTo(x + w / 2 - 6, y - h * 0.4);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(192,132,252,0.35)';
  ctx.fillRect(x - 8, y - h * 0.55, 10, 8);
}

export function drawNpcMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number) {
  shadow(ctx, x, y + 2, 12, 4);
  const bob = Math.sin(t * 2) * 1.5;
  ctx.fillStyle = '#1a1428';
  ctx.fillRect(x - 8, y - 28 + bob, 16, 22);
  ctx.fillStyle = color;
  ctx.fillRect(x - 6, y - 36 + bob, 12, 10);
  ctx.fillStyle = '#e8fff4';
  ctx.fillRect(x - 3, y - 33 + bob, 2, 2);
  ctx.fillRect(x + 1, y - 33 + bob, 2, 2);
}

export function drawStream(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90, 200, 255, 0.35)';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1280, 360);
  ctx.quadraticCurveTo(1500, 520, 1680, 700);
  ctx.stroke();
  ctx.strokeStyle = `rgba(210, 245, 255, ${0.25 + Math.sin(t) * 0.08})`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  // ponte de madeira sobre o trecho
  ctx.fillStyle = '#6a4a32';
  ctx.fillRect(1560, 560, 70, 14);
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(1564, 556, 6, 22);
  ctx.fillRect(1620, 556, 6, 22);
}
