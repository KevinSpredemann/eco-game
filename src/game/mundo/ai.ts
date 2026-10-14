// Intenção de uma criatura num instante. A simulação aplica o movimento e o dano.
import type { MonsterKind } from './types';

export type AiState = 'idle' | 'patrol' | 'alert' | 'chase' | 'attack' | 'recover' | 'flee' | 'defend' | 'return';

export interface Mind {
  kind: MonsterKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  speed: number;
  alert: number;
  cd: number;
  hp?: number;
  maxHp?: number;
}

export interface Intent {
  state: AiState;
  aim: number;
  vx: number;
  vy: number;
  melee: boolean;
  bolt: boolean;
  call: boolean;
  /** investida curta do lobo; a simulação aplica o deslocamento */
  dash?: boolean;
}

const SEE: Record<MonsterKind, number> = { chaser: 440, ranged: 440, caller: 380, boss: 740, wolf: 400 };
export const LEASH = 560;
export const MAX_ATTACKERS = 2;

export function losClear(x0: number, y0: number, x1: number, y1: number, blocked: (x: number, y: number) => boolean): boolean {
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    if (blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

export function think(m: Mind, player: { x: number; y: number; dead: boolean }, opts: { blocked: (x: number, y: number) => boolean; attackers: number }): Intent {
  const dx = player.x - m.x;
  const dy = player.y - m.y;
  const dist = Math.hypot(dx, dy) || 1;
  const aim = Math.atan2(dy, dx);
  const home = Math.hypot(m.x - m.homeX, m.y - m.homeY);
  const idle: Intent = { state: 'idle', aim, vx: 0, vy: 0, melee: false, bolt: false, call: false };
  if (player.dead) return idle;
  if (home > LEASH) {
    const hx = m.homeX - m.x;
    const hy = m.homeY - m.y;
    const hd = Math.hypot(hx, hy) || 1;
    return { state: 'return', aim: Math.atan2(hy, hx), vx: (hx / hd) * m.speed, vy: (hy / hd) * m.speed, melee: false, bolt: false, call: false };
  }
  const seen = (dist < SEE[m.kind] || m.alert > 0) && losClear(m.x, m.y, player.x, player.y, opts.blocked);
  if (!seen) {
    const wander = Math.sin(m.homeX + m.homeY) > 0 ? 1 : -1;
    return { state: 'patrol', aim, vx: wander * m.speed * 0.25, vy: 0, melee: false, bolt: false, call: false };
  }
  const ux = dx / dist;
  const uy = dy / dist;
  if (m.kind === 'chaser') {
    const sp = m.speed * (m.alert > 0 ? 1.35 : 1);
    const melee = dist < 46 && m.cd <= 0 && opts.attackers < MAX_ATTACKERS;
    return { state: melee ? 'attack' : m.cd > 0 && dist < 46 ? 'recover' : 'chase', aim, vx: ux * sp, vy: uy * sp, melee, bolt: false, call: false };
  }
  if (m.kind === 'ranged') {
    if (dist < 140) return { state: 'flee', aim, vx: -ux * m.speed, vy: -uy * m.speed, melee: false, bolt: false, call: false };
    if (dist > 280) return { state: 'chase', aim, vx: ux * m.speed, vy: uy * m.speed, melee: false, bolt: false, call: false };
    const bolt = m.cd <= 0;
    return { state: bolt ? 'attack' : 'defend', aim, vx: -uy * m.speed * 0.45, vy: ux * m.speed * 0.45, melee: false, bolt, call: false };
  }
  if (m.kind === 'wolf') {
    const ratio = m.maxHp && m.maxHp > 0 ? (m.hp ?? m.maxHp) / m.maxHp : 1;
    if (ratio < 0.3) return { state: 'flee', aim, vx: -ux * m.speed * 1.25, vy: -uy * m.speed * 1.25, melee: false, bolt: false, call: false };
    if (dist > 90 && dist < 240 && m.cd <= 0) {
      return { state: 'attack', aim, vx: ux * m.speed * 2.4, vy: uy * m.speed * 2.4, melee: false, bolt: false, call: false, dash: true };
    }
    return { state: 'chase', aim, vx: -uy * m.speed, vy: ux * m.speed, melee: false, bolt: false, call: false };
  }
  const call = m.cd <= 0;
  if (dist < 160) return { state: 'flee', aim, vx: -ux * m.speed, vy: -uy * m.speed, melee: false, bolt: false, call };
  if (dist > 260) return { state: 'chase', aim, vx: ux * m.speed * 0.55, vy: uy * m.speed * 0.55, melee: false, bolt: false, call };
  return { state: call ? 'alert' : 'defend', aim, vx: 0, vy: 0, melee: false, bolt: false, call };
}
