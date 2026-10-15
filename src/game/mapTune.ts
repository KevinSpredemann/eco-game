import { distToSegment, inRect, type ArenaDef, type Rect } from './arenas';
import type { EchoRecording } from '../shared/types';

/** Relógio dos truques do Estúdio. Só depende da arena e de worldT: cliente e servidor coincidem. */

export type TunePhase = 'idle' | 'warn' | 'on';

export interface TuneClock {
  id: string;
  phase: TunePhase;
  /** qual anel, gongo, cabine, faixa… */
  index: number;
  /** id estável deste disparo, para aplicar o efeito uma vez */
  pulse: string;
  hint: string;
}

const HINT: Record<string, string> = {
  anfiteatro: 'Anel dourado: mais grip. Fora dele, o passo abafa. O magenta avisa.',
  biblioteca: 'A página vira: saia do livro. A fita vermelha avisa.',
  camara: 'Cabine coral vai fechar: o som não entra nem sai.',
  caverna: 'Gongo magenta avisa o pulso. Atrás do pilar, o anel corta.',
  jardim: 'Diapasão rosa avisa. No pulso, você anda mais rápido.',
  vinil: 'O disco gira. A agulha empurra na volta. O LED vermelho avisa.',
  recife: 'O sino avisa a maré. No banco alagado, você anda mais devagar.',
  metronomo: 'O pêndulo empurra. A marca de ouro dá um passo mais firme.',
};

export function tuneHint(id: string): string {
  return HINT[id] ?? '';
}

const CX = 640;
const CY = 360;

function wrap(t: number, period: number) {
  const n = Math.floor(t / period);
  const into = t - n * period;
  return { n, into };
}

function clockOf(id: string, t: number): TuneClock {
  const hint = HINT[id] ?? '';
  if (id === 'anfiteatro') {
    const { n, into } = wrap(Math.max(0, t), 7);
    const index = n % 3;
    const phase: TunePhase = into < 1.5 ? 'warn' : into < 3 ? 'on' : 'idle';
    return { id, phase, index, pulse: `anel-${n}`, hint };
  }
  if (id === 'biblioteca') {
    const { n, into } = wrap(Math.max(0, t), 10);
    const phase: TunePhase = into < 1.5 ? 'warn' : into < 2.7 ? 'on' : 'idle';
    return { id, phase, index: n % 2, pulse: `pagina-${n}`, hint };
  }
  if (id === 'camara') {
    const { n, into } = wrap(Math.max(0, t), 10);
    const phase: TunePhase = into < 1.5 ? 'warn' : into < 5.5 ? 'on' : 'idle';
    return { id, phase, index: n % 4, pulse: `cabine-${n}`, hint };
  }
  if (id === 'caverna') {
    const { n, into } = wrap(Math.max(0, t), 9);
    const phase: TunePhase = into < 1.5 ? 'warn' : into < 2.4 ? 'on' : 'idle';
    return { id, phase, index: n % 4, pulse: `gongo-${n}`, hint };
  }
  if (id === 'jardim') {
    const { n, into } = wrap(Math.max(0, t), 8);
    const phase: TunePhase = into < 1.5 ? 'warn' : into < 2.3 ? 'on' : 'idle';
    return { id, phase, index: n % 6, pulse: `diapasao-${n}`, hint };
  }
  if (id === 'vinil') {
    const period = 14.7;
    const { n, into } = wrap(Math.max(0, t), period);
    const phase: TunePhase = into >= 12 && into < 13.5 ? 'warn' : into >= 13.5 ? 'on' : 'idle';
    return { id, phase, index: n + 1, pulse: `agulha-${n}`, hint };
  }
  if (id === 'recife') {
    const { n, into } = wrap(Math.max(0, t), 12);
    const phase: TunePhase = (into >= 4.5 && into < 6) || into >= 10.5 ? 'warn' : into >= 6 ? 'on' : 'idle';
    return { id, phase, index: into >= 6 ? 1 : 0, pulse: `mare-${n}-${into >= 6 ? 'alta' : 'baixa'}`, hint };
  }
  if (id === 'metronomo') {
    const n = Math.floor(Math.max(0, t));
    return { id, phase: 'on', index: n % 5, pulse: `batida-${n}`, hint };
  }
  return { id, phase: 'idle', index: 0, pulse: '', hint };
}

export function tuneClock(arena: ArenaDef, t: number): TuneClock {
  return clockOf(arena.id, t);
}

const RINGS = [140, 220, 300];
const RING_W = 24;
const NEUTRAL = 76;

const GONGS = [
  { x: 400, y: 180 },
  { x: 880, y: 180 },
  { x: 400, y: 500 },
  { x: 880, y: 500 },
];
const FORKS = [
  { x: 200, y: 360 },
  { x: 1080, y: 360 },
  { x: 640, y: 130 },
  { x: 640, y: 590 },
  { x: 400, y: 220 },
  { x: 880, y: 500 },
];
const BOOTHS: Rect[] = [
  { x: 60, y: 60, w: 200, h: 120 },
  { x: 1020, y: 60, w: 200, h: 120 },
  { x: 60, y: 540, w: 200, h: 120 },
  { x: 1020, y: 540, w: 200, h: 120 },
];
const BOOK: Rect = { x: 500, y: 300, w: 280, h: 120 };
const PAGE_WALL: Rect = { x: 632, y: 300, w: 16, h: 120 };
const DISC = { x: CX, y: CY, r: 215, label: 70 };
const ARM = { x: 880, y: 150, len: 300 };
const PEND = { x: CX, y: 200, len: 260, amp: (55 * Math.PI) / 180 };

function los(arena: ArenaDef, x0: number, y0: number, x1: number, y1: number) {
  for (const c of arena.pillars) if (distToSegment(c.x, c.y, x0, y0, x1, y1) < c.r - 2) return false;
  for (const w of arena.walls) if (crossesRect(x0, y0, x1, y1, w) || (inside(x0, y0, w) && inside(x1, y1, w))) return false;
  return true;
}

function inside(x: number, y: number, r: Rect) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function crossesRect(x0: number, y0: number, x1: number, y1: number, r: Rect) {
  const a = inside(x0, y0, r);
  const b = inside(x1, y1, r);
  if (a && b) return false;
  if (a !== b) return true;
  const edges: [number, number, number, number][] = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  return edges.some(([ax, ay, bx, by]) => segsCross(x0, y0, x1, y1, ax, ay, bx, by));
}

function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-6) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

function ringAt(index: number) {
  return RINGS[index % RINGS.length];
}

function gongRadius(t: number) {
  const { into } = wrap(Math.max(0, t), 9);
  if (into < 1.5 || into >= 2.4) return 0;
  return 28 + ((into - 1.5) / 0.9) * 180;
}

function forkRadius(t: number) {
  const { into } = wrap(Math.max(0, t), 8);
  if (into < 1.5 || into >= 2.3) return 0;
  return 24 + ((into - 1.5) / 0.8) * 160;
}

export function tideFlooded(t: number) {
  const { into } = wrap(Math.max(0, t), 12);
  return into >= 6;
}

function onBank(arena: ArenaDef, x: number, y: number) {
  return (arena.bridges ?? []).some((b) => b.tide && inRect(x, y, b));
}

function pendTip(t: number) {
  const th = Math.sin(Math.PI * t) * PEND.amp;
  return { x: PEND.x + Math.sin(th) * PEND.len, y: PEND.y + Math.cos(th) * PEND.len, th };
}

function beatMark(i: number) {
  const k = (i - 2) / 2;
  return { x: CX + k * 150, y: 500 + Math.abs(k) * 18 };
}

function discAng(t: number) {
  return (Math.PI * 2 * t) / 24;
}

function armTip(t: number) {
  const { into } = wrap(Math.max(0, t), 14.7);
  let u = 0;
  if (into < 12) u = into / 12;
  else if (into < 13.5) u = 1;
  else u = 1 - (into - 13.5) / 1.2;
  const outer = { x: DISC.x + 200, y: DISC.y - 70 };
  const inner = { x: DISC.x + 76, y: DISC.y - 26 };
  return { x: outer.x + (inner.x - outer.x) * u, y: outer.y + (inner.y - outer.y) * u, u };
}

export interface TuneMove {
  speed: number;
  grip: number;
  vx: number;
  vy: number;
}

export function tuneMove(arena: ArenaDef, x: number, y: number, t: number): TuneMove {
  const out: TuneMove = { speed: 1, grip: 1, vx: 0, vy: 0 };
  const c = clockOf(arena.id, t);
  if (arena.id === 'anfiteatro' && c.phase === 'on') {
    const d = Math.hypot(x - CX, y - CY);
    if (d >= NEUTRAL && los(arena, CX, CY, x, y)) {
      const on = Math.abs(d - ringAt(c.index)) <= RING_W;
      if (on) {
        out.speed = 1.08;
        out.grip = 1.25;
      } else {
        out.speed = 0.92;
        out.grip = 0.85;
      }
    }
  } else if (arena.id === 'vinil') {
    const d = Math.hypot(x - DISC.x, y - DISC.y);
    // horário na tela (y para baixo). O selo, no eixo, quase não desloca.
    if (d < DISC.r && d > DISC.label) {
      const w = (Math.PI * 2) / 24;
      out.vx = -w * (y - DISC.y);
      out.vy = w * (x - DISC.x);
    }
  } else if (arena.id === 'recife' && tideFlooded(t) && onBank(arena, x, y)) {
    out.speed = 0.65;
  } else if (arena.id === 'metronomo') {
    const m = beatMark(c.index);
    if (Math.hypot(x - m.x, y - m.y) < 26) {
      out.speed = 1.1;
      out.grip = 1.3;
    }
  }
  return out;
}

/** Lentidão ou pressa que dura 1,5 s depois que a frente da onda encosta. Uma vez por pulso. */
export function tuneTouch(arena: ArenaDef, x: number, y: number, t: number): { pulse: string; speed: number } | null {
  const c = clockOf(arena.id, t);
  if (c.phase !== 'on') return null;
  if (arena.id === 'caverna') {
    const g = GONGS[c.index];
    const rad = gongRadius(t);
    if (rad > 0 && Math.abs(Math.hypot(x - g.x, y - g.y) - rad) < 26 && los(arena, g.x, g.y, x, y)) return { pulse: c.pulse, speed: 0.85 };
  }
  if (arena.id === 'jardim') {
    const f = FORKS[c.index];
    const rad = forkRadius(t);
    const d = Math.hypot(x - f.x, y - f.y);
    if (rad > 0 && d > 80 && Math.abs(d - rad) < 26 && los(arena, f.x, f.y, x, y)) return { pulse: c.pulse, speed: 1.12 };
  }
  return null;
}

export function tunePush(arena: ArenaDef, x: number, y: number, t: number): { pulse: string; x: number; y: number; vx: number; vy: number } | null {
  const c = clockOf(arena.id, t);
  if (arena.id === 'biblioteca' && c.phase === 'on' && inside(x, y, BOOK)) {
    const left = x < CX;
    return { pulse: c.pulse, x: left ? BOOK.x - 22 : BOOK.x + BOOK.w + 22, y, vx: left ? -220 : 220, vy: 0 };
  }
  if (arena.id === 'vinil' && c.phase === 'on') {
    const tip = armTip(t);
    if (Math.hypot(x - tip.x, y - tip.y) < 36) {
      const d = Math.hypot(x - DISC.x, y - DISC.y) || 1;
      return { pulse: c.pulse, x, y, vx: ((x - DISC.x) / d) * 420, vy: ((y - DISC.y) / d) * 420 };
    }
  }
  if (arena.id === 'metronomo') {
    const tip = pendTip(t);
    const armX = PEND.x + (tip.x - PEND.x) * 0.42;
    const armY = PEND.y + (tip.y - PEND.y) * 0.42;
    if (distToSegment(x, y, armX, armY, tip.x, tip.y) < 22) {
      const dir = Math.cos(Math.PI * t) >= 0 ? 1 : -1;
      return { pulse: `pendulo-${Math.floor(t * 2)}`, x, y, vx: dir * 460, vy: -40 };
    }
  }
  return null;
}

export function tuneBlocks(arena: ArenaDef, x0: number, y0: number, x1: number, y1: number, t: number) {
  const c = clockOf(arena.id, t);
  if (c.phase !== 'on') return false;
  if (arena.id === 'biblioteca' && crossesRect(x0, y0, x1, y1, PAGE_WALL)) return true;
  if (arena.id === 'camara') return crossesRect(x0, y0, x1, y1, BOOTHS[c.index]);
  return false;
}

export function tuneHides(arena: ArenaDef, x: number, y: number, t: number) {
  const c = clockOf(arena.id, t);
  return arena.id === 'camara' && c.phase === 'on' && inside(x, y, BOOTHS[c.index]);
}

/** A agulha, o pêndulo e a lombada empurram o corpo para fora. Não bloqueiam tiro, salvo a página e a cabine. */
export function tuneBody(arena: ArenaDef, x: number, y: number, r: number, t: number) {
  let nx = x;
  let ny = y;
  const c = clockOf(arena.id, t);
  if (arena.id === 'biblioteca' && c.phase === 'on') {
    const w = PAGE_WALL;
    if (nx > w.x - r && nx < w.x + w.w + r && ny > w.y - r && ny < w.y + w.h + r) nx = nx < CX ? w.x - r - 1 : w.x + w.w + r + 1;
  }
  if (arena.id === 'vinil' && c.phase === 'idle') {
    const tip = armTip(t);
    const d = Math.hypot(nx - tip.x, ny - tip.y);
    if (d < r + 14 && d > 0.1) {
      nx = tip.x + ((nx - tip.x) / d) * (r + 14);
      ny = tip.y + ((ny - tip.y) / d) * (r + 14);
    }
  }
  return { x: nx, y: ny };
}

export function tuneSteer(arena: ArenaDef, x: number, y: number, t: number): { avoid: boolean; seek: { x: number; y: number } | null } {
  const c = clockOf(arena.id, t);
  let avoid = false;
  let seek: { x: number; y: number } | null = null;
  if (arena.id === 'biblioteca' && c.phase !== 'idle' && inside(x, y, { x: BOOK.x - 20, y: BOOK.y - 20, w: BOOK.w + 40, h: BOOK.h + 40 })) avoid = true;
  if (arena.id === 'caverna' && c.phase === 'on') {
    const g = GONGS[c.index];
    const rad = gongRadius(t);
    if (Math.abs(Math.hypot(x - g.x, y - g.y) - rad) < 48) avoid = true;
  }
  if (arena.id === 'vinil' && (c.phase === 'warn' || c.phase === 'on')) {
    const tip = armTip(t);
    if (Math.hypot(x - tip.x, y - tip.y) < 70) avoid = true;
  }
  if (arena.id === 'metronomo') {
    const tip = pendTip(t);
    if (distToSegment(x, y, PEND.x, PEND.y, tip.x, tip.y) < 36) avoid = true;
    const m = beatMark(c.index);
    if (Math.hypot(x - m.x, y - m.y) < 220) seek = m;
  }
  if (arena.id === 'recife' && tideFlooded(t) && onBank(arena, x, y)) avoid = true;
  if (arena.id === 'anfiteatro' && c.phase !== 'idle') {
    const R = ringAt(c.index);
    const d = Math.hypot(x - CX, y - CY) || 1;
    seek = { x: CX + ((x - CX) / d) * R, y: CY + ((y - CY) / d) * R };
  }
  if (arena.id === 'jardim' && c.phase === 'warn') seek = FORKS[c.index];
  if (arena.id === 'camara' && c.phase === 'warn') seek = { x: BOOTHS[c.index].x + 40, y: BOOTHS[c.index].y + 40 };
  return { avoid, seek };
}

export function spinEcho(x: number, y: number, spinOrigin: number | undefined, sampleT: number, worldT: number) {
  if (spinOrigin === undefined) return { x, y };
  const d = Math.hypot(x - DISC.x, y - DISC.y);
  if (d > DISC.r || d < DISC.label) return { x, y };
  const ang = discAng(worldT - (spinOrigin + sampleT / 1000));
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const dx = x - DISC.x;
  const dy = y - DISC.y;
  return { x: DISC.x + dx * cos - dy * sin, y: DISC.y + dx * sin + dy * cos };
}

/** Espelha o resto da rota na lombada. Uma vez por virada. */
export function mirrorRest(rec: EchoRecording & { pagePulse?: string }, tms: number, pulse: string) {
  if (rec.pagePulse === pulse) return false;
  const s = rec.frames.find((f) => f.t >= tms) ?? rec.frames[rec.frames.length - 1];
  if (!s || !inside(s.x, s.y, BOOK)) return false;
  for (const f of rec.frames) if (f.t >= tms) f.x = CX * 2 - f.x;
  rec.pagePulse = pulse;
  return true;
}

export function tuneGlow(arena: ArenaDef, x: number, y: number, t: number) {
  const c = clockOf(arena.id, t);
  if (arena.id === 'anfiteatro' && c.phase === 'on') {
    const d = Math.hypot(x - CX, y - CY);
    return d >= NEUTRAL && Math.abs(d - ringAt(c.index)) <= RING_W && los(arena, CX, CY, x, y);
  }
  if (arena.id === 'caverna') {
    const { n, into } = wrap(Math.max(0, t), 9);
    if (into < 1.5 || into > 3.9) return false;
    const g = GONGS[n % 4];
    return Math.hypot(x - g.x, y - g.y) < 210 && los(arena, g.x, g.y, x, y);
  }
  if (arena.id === 'jardim') {
    const { n, into } = wrap(Math.max(0, t), 8);
    if (into < 1.5 || into > 3.8) return false;
    const f = FORKS[n % 6];
    const d = Math.hypot(x - f.x, y - f.y);
    return d > 80 && d < 190 && los(arena, f.x, f.y, x, y);
  }
  return false;
}

export interface TuneShape {
  kind: 'ring' | 'rect' | 'seg' | 'dot';
  layer: 'floor' | 'air';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  w?: number;
  h?: number;
  color: string;
  alpha: number;
  dash?: boolean;
  line?: number;
}

export function tuneShapes(arena: ArenaDef, t: number, reduced: boolean): TuneShape[] {
  const c = clockOf(arena.id, t);
  const out: TuneShape[] = [];
  if (arena.id === 'anfiteatro') {
    const R = ringAt(c.index);
    const warn = c.phase === 'warn';
    out.push({ kind: 'ring', layer: 'floor', x: CX, y: CY, r: R, color: warn ? '#ff4fc3' : '#ffd27a', alpha: c.phase === 'idle' ? 0.12 : warn ? 0.55 : 0.85, dash: warn });
    if (!reduced && c.phase === 'on') out.push({ kind: 'dot', layer: 'floor', x: CX, y: CY - R, r: 6, color: '#fff6c8', alpha: 0.5 });
  } else if (arena.id === 'biblioteca') {
    out.push({ kind: 'rect', layer: 'floor', x: BOOK.x, y: BOOK.y, w: BOOK.w, h: BOOK.h, color: c.phase === 'warn' ? '#ff4a4a' : '#e8c898', alpha: c.phase === 'idle' ? 0.16 : c.phase === 'warn' ? 0.75 : 0.4, dash: c.phase === 'warn' });
    if (c.phase === 'on') out.push({ kind: 'rect', layer: 'air', x: PAGE_WALL.x, y: PAGE_WALL.y, w: PAGE_WALL.w, h: PAGE_WALL.h, color: '#f4e2c0', alpha: 0.9 });
    if (c.phase === 'warn') {
      const dir = c.index === 0 ? 1 : -1;
      out.push({ kind: 'seg', layer: 'floor', x: CX - dir * 40, y: CY, x2: CX + dir * 70, y2: CY, color: '#ffd27a', alpha: 0.9 });
    }
  } else if (arena.id === 'camara') {
    const b = BOOTHS[c.index];
    out.push({ kind: 'rect', layer: 'floor', x: b.x, y: b.y, w: b.w, h: b.h, color: c.phase === 'on' ? '#8fd0ff' : '#ff7a88', alpha: c.phase === 'idle' ? 0.22 : c.phase === 'warn' ? 0.95 : 0.8, dash: c.phase === 'warn', line: 6 });
  } else if (arena.id === 'caverna') {
    const g = GONGS[c.index];
    out.push({ kind: 'dot', layer: 'floor', x: g.x, y: g.y, r: c.phase === 'warn' ? 16 : 10, color: c.phase === 'warn' ? '#ff4fc3' : '#3ee0c8', alpha: c.phase === 'idle' ? 0.35 : 0.9 });
    const rad = gongRadius(t);
    if (rad > 0) out.push({ kind: 'ring', layer: 'floor', x: g.x, y: g.y, r: rad, color: '#3ee0c8', alpha: 0.8 });
  } else if (arena.id === 'jardim') {
    const f = FORKS[c.index];
    out.push({ kind: 'dot', layer: 'floor', x: f.x, y: f.y, r: c.phase === 'warn' ? 14 : 8, color: c.phase === 'warn' ? '#ff4fc3' : '#b8f060', alpha: c.phase === 'idle' ? 0.3 : 0.9 });
    const rad = forkRadius(t);
    if (rad > 0) out.push({ kind: 'ring', layer: 'floor', x: f.x, y: f.y, r: rad, color: '#b8f060', alpha: 0.75 });
  } else if (arena.id === 'vinil') {
    out.push({ kind: 'ring', layer: 'floor', x: DISC.x, y: DISC.y, r: DISC.r, color: '#ff8a3c', alpha: 0.35 });
    const tip = armTip(t);
    out.push({ kind: 'seg', layer: 'air', x: ARM.x, y: ARM.y, x2: tip.x, y2: tip.y, color: c.phase === 'warn' ? '#ff3b3b' : '#f0d2a0', alpha: 0.95 });
    out.push({ kind: 'dot', layer: 'air', x: tip.x, y: tip.y, r: 8, color: c.phase === 'on' ? '#ff3b3b' : '#ffd23e', alpha: 1 });
  } else if (arena.id === 'recife') {
    const flood = tideFlooded(t);
    for (const b of arena.bridges ?? []) {
      if (!b.tide) continue;
      out.push({ kind: 'rect', layer: 'floor', x: b.x, y: b.y, w: b.w, h: b.h, color: flood ? '#1a6ea8' : '#e6c98a', alpha: c.phase === 'warn' ? 0.7 : flood ? 0.45 : 0.2, dash: c.phase === 'warn' });
    }
    if (c.phase === 'warn') out.push({ kind: 'dot', layer: 'air', x: CX, y: CY, r: 18, color: '#ffd23e', alpha: 0.85 });
  } else if (arena.id === 'metronomo') {
    const tip = pendTip(t);
    out.push({ kind: 'seg', layer: 'air', x: PEND.x, y: PEND.y, x2: tip.x, y2: tip.y, color: '#e6c27a', alpha: 0.95 });
    for (let i = 0; i < 5; i++) {
      const m = beatMark(i);
      out.push({ kind: 'dot', layer: 'floor', x: m.x, y: m.y, r: i === c.index ? 12 : 6, color: i === c.index ? '#ffd27a' : '#9ec0ff', alpha: i === c.index ? 0.95 : 0.35 });
    }
  }
  // pontos fracos são enfeite. O aviso (ponto forte) e o que está no ar continuam.
  if (reduced) return out.filter((s) => !(s.kind === 'dot' && s.layer === 'floor' && s.alpha < 0.8));
  return out;
}

export function tuneEchoDrag(arena: ArenaDef, x: number, y: number, t: number) {
  return arena.id === 'recife' && tideFlooded(t) && onBank(arena, x, y);
}

export function tuneNeedle(arena: ArenaDef, x: number, y: number, t: number) {
  if (arena.id !== 'vinil') return false;
  const { into } = wrap(Math.max(0, t), 14.7);
  if (into >= 13.5) return false;
  const tip = armTip(t);
  return Math.hypot(x - tip.x, y - tip.y) < 22;
}

export function tunePendulumHits(x: number, y: number, t: number) {
  const tip = pendTip(t);
  const armX = PEND.x + (tip.x - PEND.x) * 0.42;
  const armY = PEND.y + (tip.y - PEND.y) * 0.42;
  return distToSegment(x, y, armX, armY, tip.x, tip.y) < 20;
}

export const TUNE_IDS = ['anfiteatro', 'biblioteca', 'camara', 'caverna', 'jardim', 'vinil', 'recife', 'metronomo'] as const;
