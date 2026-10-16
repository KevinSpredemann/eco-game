/** Todos Contra Todos. Só gente de verdade: a sala não completa com bot. */
export const FFA = {
  minPlayers: 4,
  maxPlayers: 8,
  /** eliminações confirmadas para fechar a partida */
  kills: 10,
  /** partida cronometrada, em segundos */
  dur: 5 * 60,
  suddenSec: 45,
  /** uma área acerta no máximo estes inimigos. X1 e 2x2 não usam este teto. */
  aoeCap: 3,
  /** faíscas no Todos Contra Todos. Os tetos gerais (220 e 60) continuam iguais. */
  fxCap: 120,
  desc: 'Entre na arena, domine seus poderes e elimine todos os adversários. Apenas o mais habilidoso será o vencedor.',
};

/** Área no Todos Contra Todos: os mais perto, até o teto. Outros modos devolvem a lista inteira. */
export function capAoe<T extends { x: number; y: number; id: string }>(mode: string, foes: T[], x: number, y: number, cap = FFA.aoeCap): T[] {
  if (mode !== 'todos' || foes.length <= cap) return foes;
  return [...foes].sort((a, b) => {
    const da = (a.x - x) ** 2 + (a.y - y) ** 2;
    const db = (b.x - x) ** 2 + (b.y - y) ** 2;
    return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }).slice(0, cap);
}

/** Spawns mais longe do centro, um por pessoa. Evita dois corpos no mesmo ponto. */
export function spreadSpawns<T extends { x: number; y: number }>(spawns: readonly T[], n: number, cx: number, cy: number): T[] {
  const ranked = spawns
    .map((s, i) => ({ s, i, d: (s.x - cx) ** 2 + (s.y - cy) ** 2 }))
    .sort((a, b) => b.d - a.d || a.i - b.i);
  const take = Math.max(1, Math.min(n, ranked.length));
  return ranked.slice(0, take).map((r) => r.s);
}

/** Próximo jogador vivo na câmera de espectador. */
export function spectateCycle(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  const start = i < 0 ? (dir > 0 ? 0 : ids.length - 1) : i;
  if (i < 0) return ids[start];
  return ids[(start + dir + ids.length) % ids.length];
}

export type FfaCall = 'play' | 'win' | 'sudden' | 'share';

/**
 * Quem lidera as eliminações. Empate no tempo abre a morte súbita.
 * Se a súbita acaba ainda empatada, os líderes dividem a vitória.
 */
export function ffaCall(opts: {
  kills: number[];
  roundT: number;
  dur: number;
  sudden: boolean;
  suddenT: number;
  suddenLimit: number;
  goal?: number;
}): { call: FfaCall; leaders: number[] } {
  const goal = opts.goal ?? FFA.kills;
  const top = opts.kills.length ? Math.max(...opts.kills) : 0;
  const tied = opts.kills.map((k, i) => (k === top ? i : -1)).filter((i) => i >= 0);
  const leaders = top > 0 ? tied : [];
  const sole = leaders.length === 1;
  if (top >= goal && sole) return { call: 'win', leaders };
  if (opts.sudden) {
    if (sole) return { call: 'win', leaders };
    if (opts.suddenT >= opts.suddenLimit) return { call: 'share', leaders: leaders.length ? leaders : opts.kills.map((_, i) => i) };
    return { call: 'play', leaders };
  }
  if (opts.roundT >= opts.dur) {
    if (sole) return { call: 'win', leaders };
    return { call: 'sudden', leaders };
  }
  if (top >= goal) return { call: 'sudden', leaders };
  return { call: 'play', leaders };
}
