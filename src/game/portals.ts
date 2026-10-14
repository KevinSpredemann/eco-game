// Saída de portal compartilhada pela simulação e pelo cliente online.
// Encostar no portal só transporta: não muda vida e não deixa o jogador dentro de parede, zona ou outro portal.
import { ArenaDef, Pt, isGround } from './arenas';
import * as C from './constants';

export const PORTAL_RADIUS = 24;

export function portalPairAt(portals: [Pt, Pt][] | undefined, x: number, y: number, radius = PORTAL_RADIUS): { from: Pt; to: Pt } | null {
  if (!portals) return null;
  for (const [a, b] of portals) {
    if (Math.hypot(x - a.x, y - a.y) < radius) return { from: a, to: b };
    if (Math.hypot(x - b.x, y - b.y) < radius) return { from: b, to: a };
  }
  return null;
}

export function portalExitCandidates(to: Pt, dir: number): Pt[] {
  const out: Pt[] = [];
  for (const dist of [52, 40, 68, 84]) out.push({ x: to.x + Math.cos(dir) * dist, y: to.y + Math.sin(dir) * dist });
  for (let i = 0; i < 8; i++) {
    const a = dir + (i / 8) * Math.PI * 2;
    out.push({ x: to.x + Math.cos(a) * 56, y: to.y + Math.sin(a) * 56 });
  }
  return out;
}

/** ponto livre para sair: fora de parede, portal, zona ligada, lava e poço */
export function portalSpotOk(arena: ArenaDef, x: number, y: number, t: number, zoneOn: (i: number) => boolean, free: (x: number, y: number) => boolean): boolean {
  if (!free(x, y)) return false;
  if (arena.islands && !isGround(arena, x, y, t)) return false;
  if (portalPairAt(arena.portals, x, y, 36)) return false;
  for (let i = 0; i < arena.zones.length; i++) {
    if (!zoneOn(i)) continue;
    const z = arena.zones[i];
    if (Math.hypot(x - z.x, y - z.y) < z.r + C.PLAYER_R * 0.4) return false;
  }
  for (const l of arena.lava ?? []) if (Math.hypot(x - l.x, y - l.y) < l.r + C.PLAYER_R) return false;
  for (const w of arena.wells ?? []) if (Math.hypot(x - w.x, y - w.y) < w.r + C.PLAYER_R) return false;
  return true;
}

export function choosePortalExit(arena: ArenaDef, to: Pt, dir: number, t: number, zoneOn: (i: number) => boolean, free: (x: number, y: number) => boolean): Pt {
  for (const c of portalExitCandidates(to, dir)) {
    if (portalSpotOk(arena, c.x, c.y, t, zoneOn, free)) return c;
  }
  return { x: to.x + Math.cos(dir) * 52, y: to.y + Math.sin(dir) * 52 };
}
