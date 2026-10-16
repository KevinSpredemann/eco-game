/** Trava o golpe no inimigo mais perto que ainda cabe no alcance e na linha de visão. */

export interface LockFoe {
  id: string;
  x: number;
  y: number;
}

export type LockResult =
  | { ok: true; id: string; ang: number; dist: number }
  | { ok: false; reason: 'Fora de alcance' | 'Nenhum alvo válido' };

export function lockHostile(o: {
  x: number;
  y: number;
  range: number;
  foes: readonly LockFoe[];
  sight: (x: number, y: number) => boolean;
}): LockResult {
  const reach = Math.max(0, o.range);
  let nearest = Infinity;
  let blocked = false;
  let best: LockFoe | null = null;
  let bd = Infinity;
  for (const f of o.foes) {
    const d = Math.hypot(f.x - o.x, f.y - o.y);
    if (d < nearest) nearest = d;
    if (d > reach + 0.5) continue;
    if (!o.sight(f.x, f.y)) {
      blocked = true;
      continue;
    }
    if (!best || d < bd - 0.01 || (Math.abs(d - bd) <= 0.01 && f.id < best.id)) {
      best = f;
      bd = d;
    }
  }
  if (best) return { ok: true, id: best.id, ang: Math.atan2(best.y - o.y, best.x - o.x), dist: bd };
  if (nearest < Infinity && !blocked) return { ok: false, reason: 'Fora de alcance' };
  return { ok: false, reason: 'Nenhum alvo válido' };
}
