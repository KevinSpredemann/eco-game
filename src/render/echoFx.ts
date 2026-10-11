// Desenhos dos Ecos: rotas resumidas, ícones das ações gravadas e avisos.
// Tudo vem das gravações reais (EchoDigest) — nenhum movimento ou ação é inventado.
import { DIGEST_STEP_MS, EchoDigest, MARK_KINDS, digestAt } from '../systems/echo/digest';

type Ctx = CanvasRenderingContext2D;

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** traça a rota entre t0 e t1 (ms), sem atravessar saltos (portal/renascer) */
export function traceRoute(g: Ctx, d: EchoDigest, t0: number, t1: number) {
  const n = d.path.length / 2;
  const i0 = Math.max(0, Math.floor(t0 / DIGEST_STEP_MS));
  const i1 = Math.min(n - 1, Math.ceil(t1 / DIGEST_STEP_MS));
  g.beginPath();
  let px = 0;
  let py = 0;
  for (let i = i0; i <= i1; i++) {
    const x = d.path[i * 2];
    const y = d.path[i * 2 + 1];
    if (i === i0 || Math.hypot(x - px, y - py) > 120) g.moveTo(x, y);
    else g.lineTo(x, y);
    px = x;
    py = y;
  }
}

/** ícone pequeno de uma ação gravada (tiro, bomba, mina, impulso, habilidade, entrega, dano) */
export function drawMarkIcon(g: Ctx, kind: number, x: number, y: number, ang: number, color: string, s = 1) {
  const k = MARK_KINDS[kind];
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (k) {
    case 'shoot':
      g.strokeStyle = color;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4);
      g.lineTo(Math.cos(ang) * 15, Math.sin(ang) * 15);
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, 2.6, 0, Math.PI * 2);
      g.fill();
      break;
    case 'bomb':
      g.fillStyle = '#1b1233';
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 6.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(4, -5);
      g.lineTo(8, -9);
      g.stroke();
      break;
    case 'mine':
      g.fillStyle = '#1b1233';
      g.strokeStyle = '#ff5a3c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(7, 0);
      g.lineTo(0, 7);
      g.lineTo(-7, 0);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case 'dash':
      g.strokeStyle = color;
      g.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(-5 + i * 5, -5);
        g.lineTo(0 + i * 5, 0);
        g.lineTo(-5 + i * 5, 5);
        g.stroke();
      }
      break;
    case 'ability':
      g.fillStyle = color;
      g.strokeStyle = '#1b1233';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 3 : 7.5;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case 'deliver':
      g.fillStyle = '#5dff8a';
      g.strokeStyle = '#1b1233';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5.5, 0);
      g.lineTo(0, 7);
      g.lineTo(-5.5, 0);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    default:
      // levou dano
      g.strokeStyle = '#ff5a5a';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(-5, -5);
      g.lineTo(5, 5);
      g.moveTo(5, -5);
      g.lineTo(-5, 5);
      g.stroke();
  }
  g.restore();
}

/** quanto da rota aparece na preparação: a abertura da rodada (o resto aparece andando) */
export const PREVIEW_MS = 6000;

/**
 * prévia de um Eco na preparação: os primeiros segundos da rota (seta no fim) e, da rodada toda,
 * só as bombas e minas (luta) ou entregas (Núcleo) — o que muda a jogada, sem poluir a arena
 */
export function drawRoutePreview(g: Ctx, d: EchoDigest, time: number, alpha: number, combat: boolean) {
  const until = Math.min(PREVIEW_MS, d.endT);
  g.strokeStyle = hexA(d.color, 0.55 * alpha);
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.setLineDash([6, 7]);
  g.lineDashOffset = -time * 30;
  traceRoute(g, d, 0, until);
  g.stroke();
  g.setLineDash([]);
  g.lineDashOffset = 0;
  // seta onde a abertura termina
  const a = digestAt(d, Math.max(0, until - DIGEST_STEP_MS));
  const b = digestAt(d, until);
  if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.fillStyle = hexA(d.color, 0.8 * alpha);
    g.beginPath();
    g.moveTo(b.x + Math.cos(ang) * 8, b.y + Math.sin(ang) * 8);
    g.lineTo(b.x + Math.cos(ang + 2.5) * 7, b.y + Math.sin(ang + 2.5) * 7);
    g.lineTo(b.x + Math.cos(ang - 2.5) * 7, b.y + Math.sin(ang - 2.5) * 7);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = alpha;
  for (const m of d.marks) {
    const kind = MARK_KINDS[m[1]];
    if (combat) {
      if (kind === 'shoot' ? m[0] > until : kind !== 'bomb' && kind !== 'mine') continue;
    } else if (kind !== 'deliver') continue;
    drawMarkIcon(g, m[1], m[2], m[3] - 18, m[4], d.color, kind === 'shoot' ? 0.8 : 1);
  }
  g.globalAlpha = 1;
}

/** rota dos próximos instantes (o caminho que o Eco vai fazer), sumindo com a distância */
export function drawRouteAhead(g: Ctx, d: EchoDigest, t: number, aheadMs: number, color: string, alpha: number) {
  const steps = Math.ceil(aheadMs / DIGEST_STEP_MS);
  let prev = digestAt(d, t);
  if (!prev) return;
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 1; i <= steps; i++) {
    const tt = t + i * DIGEST_STEP_MS;
    if (tt > d.endT) break;
    const p = digestAt(d, tt);
    if (!p) break;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 120) break;
    g.strokeStyle = hexA(color, alpha * (1 - i / (steps + 1)));
    g.beginPath();
    g.moveTo(prev.x, prev.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    prev = p;
  }
  // ponto onde ele estará
  g.fillStyle = hexA(color, alpha * 0.5);
  g.beginPath();
  g.arc(prev.x, prev.y, 3.5, 0, Math.PI * 2);
  g.fill();
}
