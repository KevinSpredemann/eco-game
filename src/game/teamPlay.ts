import type { Element } from './elements';

/** Janela em que o segundo aliado fecha o combo de equipe. Não soma dano. */
export const TEAM_WINDOW = 2;

const PAIRS: Record<string, string> = {
  'lightning+wind': 'Tempestade elétrica',
  'fire+ice': 'Congelamento e estouro',
  'nature+wind': 'Puxão em área',
  'ice+nature': 'Barreira e suprema',
};

/** Nome do indicador. A ordem dos elementos não muda o nome. */
export function teamComboName(a: Element, b: Element): string | null {
  return PAIRS[[a, b].sort().join('+')] ?? null;
}

export function allyOf(viewer: { id: string; team: number }, other: { id: string; team: number }): boolean {
  return other.id !== viewer.id && viewer.team >= 0 && viewer.team === other.team;
}
