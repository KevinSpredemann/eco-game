import type { Element } from './elements';

/** Janela em que o segundo aliado fecha o combo de equipe. */
export const TEAM_WINDOW = 2;

const PAIRS: Record<string, string> = {
  'lightning+wind': 'Tempestade elétrica',
  'fire+ice': 'Congelamento e estouro',
  'nature+wind': 'Puxão em área',
  'ice+nature': 'Barreira e suprema',
};

export interface TeamBonus {
  name: string;
  dmg: number;
  radius: number;
  cap: number;
  stun?: number;
  slow?: number;
  burn?: number;
  root?: number;
  yank?: number;
}

/** Nome do indicador. A ordem dos elementos não muda o nome. */
export function teamComboName(a: Element, b: Element): string | null {
  return PAIRS[[a, b].sort().join('+')] ?? null;
}

/** Efeito confirmado no servidor. O dano extra não passa de `dmg` e o teto é `cap`. */
export function teamComboEffect(a: Element, b: Element): TeamBonus | null {
  const name = teamComboName(a, b);
  if (!name) return null;
  const key = [a, b].sort().join('+');
  if (key === 'lightning+wind') return { name, dmg: 6, radius: 80, cap: 3, stun: 0.35 };
  if (key === 'fire+ice') return { name, dmg: 6, radius: 70, cap: 3, slow: 1.1, burn: 1.2 };
  if (key === 'nature+wind') return { name, dmg: 0, radius: 90, cap: 3, yank: 80 };
  if (key === 'ice+nature') return { name, dmg: 0, radius: 76, cap: 3, slow: 1.2, root: 0.45 };
  return null;
}

export function allyOf(viewer: { id: string; team: number }, other: { id: string; team: number }): boolean {
  return other.id !== viewer.id && viewer.team >= 0 && viewer.team === other.team;
}
