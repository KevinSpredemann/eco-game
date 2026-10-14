// Regras do X1. O servidor (ou a partida local) aplica isto; o relógio do aparelho não decide a rodada.
export const DUEL = {
  /** rodada normal, em segundos */
  roundSec: 120,
  /** morte súbita, em segundos (dá para trocar no config da partida) */
  suddenSec: 60,
  /** multiplicador aplicado uma vez ao dano base */
  mult: 2,
  /** quanto tempo o resultado do round fica na tela */
  callSec: 2.4,
  /** rodadas para vencer a partida (melhor de 5) */
  wins: 3,
};

export type DuelReason = 'kill' | 'hp' | 'damage' | 'draw';

/** Desempate estável: mais vida, depois mais dano causado. Igual nos dois = empate. Não usa sorte nem Eco. */
export function duelTiebreak(rows: { id: string; hp: number; dmg: number }[]): { winner: string | null; reason: Exclude<DuelReason, 'kill'> } {
  if (rows.length === 0) return { winner: null, reason: 'draw' };
  if (rows.length === 1) return { winner: rows[0].id, reason: 'hp' };
  const ranked = [...rows].sort((a, b) => b.hp - a.hp || b.dmg - a.dmg);
  const a = ranked[0];
  const b = ranked[1];
  if (a.hp !== b.hp) return { winner: a.id, reason: 'hp' };
  if (a.dmg !== b.dmg) return { winner: a.id, reason: 'damage' };
  return { winner: null, reason: 'draw' };
}

/** Texto do round. Só a frase grande: o placar fica fora deste banner. */
export function roundBanner(myId: string, winner: string | null, _reason: DuelReason | null | undefined, _score: string) {
  const kind: 'win' | 'loss' | 'draw' = !winner ? 'draw' : winner === myId ? 'win' : 'loss';
  const title = kind === 'win' ? 'Você venceu' : kind === 'loss' ? 'Você perdeu' : 'Empate';
  return { kind, title, sub: '' };
}
