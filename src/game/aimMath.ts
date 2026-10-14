// Mira e carga. A prévia e o combate usam o mesmo sweepCircle: o ponto de impacto
// nunca fica atrás de uma parede que o projétil não atravessa.
import type { PowerDef } from './elements';
import { sweepCircle, type SweepBounds, type SweepDisc, type SweepRect } from './sweep';

export type CastFamily = 'instant' | 'hold' | 'charged';

/** Buff, escudo e cura em si saem na hora. O resto segura para mirar. Preparo ou charge cresce ao segurar. */
export function castFamily(pw: Pick<PowerDef, 'speed' | 'act' | 'zone' | 'range' | 'windup' | 'charge'>): CastFamily {
  if (pw.charge || (pw.windup ?? 0) > 0) return 'charged';
  if (pw.act === 'decoy') return 'instant';
  if (pw.act === 'zone' && pw.zone === 'heal' && pw.range <= 0) return 'instant';
  if (pw.speed <= 0 && pw.range <= 0 && !pw.act) return 'instant';
  return 'hold';
}

/** 0 = toque, 1 = carga cheia. O mínimo ainda sai, mais fraco. */
export function chargeFactor(ch: number): number {
  const t = Math.max(0, Math.min(1, ch));
  return 0.45 + 0.55 * t;
}
export function chargeReach(ch: number): number {
  const t = Math.max(0, Math.min(1, ch));
  return 0.55 + 0.45 * t;
}
export function chargeRadius(ch: number): number {
  const t = Math.max(0, Math.min(1, ch));
  return 0.7 + 0.3 * t;
}

export interface AimStop {
  dist: number;
  x: number;
  y: number;
  blocked: boolean;
}

/** Onde o traço para. blocked = bateu em parede, pilar ou borda antes do alcance. */
export function aimStop(
  x: number,
  y: number,
  ang: number,
  range: number,
  r: number,
  rects: readonly SweepRect[],
  discs: readonly SweepDisc[],
  bounds: SweepBounds,
): AimStop {
  const reach = Math.max(0, range);
  const x1 = x + Math.cos(ang) * reach;
  const y1 = y + Math.sin(ang) * reach;
  if (reach < 1) return { dist: 0, x, y, blocked: false };
  const t = sweepCircle(x, y, x1, y1, r, rects, discs, bounds);
  if (t === null) return { dist: reach, x: x1, y: y1, blocked: false };
  const dist = Math.max(0, t * reach);
  return { dist, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, blocked: dist < reach - 1 };
}

/** Linha de visão: o meio do trecho está livre. Igual ao que o golpe em área consulta. */
export function losOpen(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rects: readonly SweepRect[],
  discs: readonly SweepDisc[],
  bounds: SweepBounds,
): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 14) return true;
  const inset = 8 / d;
  const ax = x0 + (x1 - x0) * inset;
  const ay = y0 + (y1 - y0) * inset;
  const bx = x1 - (x1 - x0) * inset;
  const by = y1 - (y1 - y0) * inset;
  return sweepCircle(ax, ay, bx, by, 2, rects, discs, bounds) === null;
}
