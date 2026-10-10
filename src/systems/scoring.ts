// Regras de pontuação puras (testáveis e reaproveitáveis por um servidor autoritativo).

export const POINTS = {
  deliverPerFragment: 3,
  survive: 1,
  objective: 1,
} as const;

export function deliveryPoints(fragments: number): number {
  return Math.max(0, Math.floor(fragments)) * POINTS.deliverPerFragment;
}

export type ScoreLine = { id: string; score: number };

/** Ordena do maior para o menor; empate mantém a ordem original. */
export function ranking<T extends ScoreLine>(lines: T[]): T[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.score - a.l.score || a.i - b.i)
    .map((x) => x.l);
}

/** Ids empatados na liderança (2+ significa que precisa de desempate). */
export function leaders(lines: ScoreLine[]): string[] {
  if (lines.length === 0) return [];
  const top = Math.max(...lines.map((l) => l.score));
  return lines.filter((l) => l.score === top).map((l) => l.id);
}

export function needsTiebreak(lines: ScoreLine[]): boolean {
  return leaders(lines).length > 1;
}
