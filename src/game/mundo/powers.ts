// Poderes do ECO Mundo. Q continua sendo a habilidade do personagem.
// E, R, F, C e V gastam energia e têm recarga própria.

export type PowerId = 'shot' | 'dash' | 'shield' | 'blast' | 'trap';

export interface PowerDef {
  id: PowerId;
  name: string;
  key: string;
  cost: number;
  cd: number;
  windup: number;
  hint: string;
}

export const POWERS: PowerDef[] = [
  { id: 'shot', name: 'Tiro', key: 'E', cost: 14, cd: 0.9, windup: 0.08, hint: 'Disparo de energia. Some no primeiro acerto.' },
  { id: 'dash', name: 'Investida', key: 'R', cost: 18, cd: 2.4, windup: 0.05, hint: 'Avança e fere uma vez no caminho.' },
  { id: 'shield', name: 'Escudo', key: 'F', cost: 16, cd: 6, windup: 0, hint: 'Reduz o dano recebido por um instante.' },
  { id: 'blast', name: 'Pulso', key: 'C', cost: 26, cd: 5, windup: 0.28, hint: 'Onda em área quando o aviso termina.' },
  { id: 'trap', name: 'Armadilha', key: 'V', cost: 12, cd: 4, windup: 0, hint: 'Marca o chão e fere quem pisar, uma vez.' },
];

export const ENERGY_MAX = 100;
export const ENERGY_REGEN = 12;
export const DODGE_COST = 8;
export const DODGE_CD = 1.2;

export function powerById(id: PowerId): PowerDef {
  const found = POWERS.find((p) => p.id === id);
  if (!found) return POWERS[0];
  return found;
}

export function canCast(energy: number, cd: number, cost: number): 'ok' | 'cd' | 'energy' {
  if (cd > 0) return 'cd';
  if (energy < cost) return 'energy';
  return 'ok';
}
