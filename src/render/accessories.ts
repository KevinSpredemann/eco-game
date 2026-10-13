// Acessórios desenhados no mesmo espaço do personagem (pés em y = 0, cabeça perto de y = -55).
import type { AccessoryKind } from '../game/economy';

export function accessoryBehind(kind: AccessoryKind): boolean {
  return kind === 'cape' || kind === 'wings';
}

export function drawAccessory(ctx: CanvasRenderingContext2D, kind: AccessoryKind, color: string) {
  if (kind === 'none') return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'cape') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(-11, -42);
    ctx.lineTo(11, -42);
    ctx.quadraticCurveTo(20, -18, 10, 2);
    ctx.quadraticCurveTo(0, 6, -10, 2);
    ctx.quadraticCurveTo(-20, -18, -11, -42);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, -40);
    ctx.quadraticCurveTo(-12, -16, -6, 0);
    ctx.stroke();
  } else if (kind === 'wings') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = '#120c22';
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 18, -34, 16, 8, side * -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(side * 16, -26, 12, 5, side * -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'cap') {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#120c22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -66, 12, 7, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-16, -66, 24, 3.2);
    ctx.strokeRect(-16, -66, 24, 3.2);
  } else if (kind === 'goggles') {
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(180, 230, 255, 0.45)';
    ctx.lineWidth = 1.8;
    for (const x of [-9, 1]) {
      ctx.beginPath();
      ctx.roundRect(x, -59, 8, 6, 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-1, -56);
    ctx.lineTo(1, -56);
    ctx.moveTo(-14, -56);
    ctx.lineTo(-17, -54);
    ctx.moveTo(14, -56);
    ctx.lineTo(17, -54);
    ctx.stroke();
  } else if (kind === 'halo') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(0, -78, 13, 4.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
