// Poderes que aparecem pela arena. Encostou, pegou.

export type PowerId = 'escudo' | 'ima' | 'gelo' | 'turbo' | 'dobro' | 'apagar';

export interface PowerDef {
  id: PowerId;
  name: string;
  short: string;
  desc: string;
  color: string;
  weight: number;
}

export const POWERS: PowerDef[] = [
  { id: 'escudo', name: 'Escudo', short: 'Escudo', desc: 'Bloqueia o próximo golpe (8 s).', color: '#5dff8a', weight: 3 },
  { id: 'ima', name: 'Ímã', short: 'Ímã', desc: 'Puxa as energias por perto (6 s).', color: '#3ee8ff', weight: 3 },
  { id: 'gelo', name: 'Gelo nos Ecos', short: 'Gelo', desc: 'Todos os Ecos ficam congelados e inofensivos (4 s).', color: '#b8e6ff', weight: 2 },
  { id: 'turbo', name: 'Turbo', short: 'Turbo', desc: 'Corre muito mais rápido (4 s).', color: '#ffd23e', weight: 3 },
  { id: 'dobro', name: 'Energia em dobro', short: 'x2', desc: 'Sua próxima entrega no núcleo vale o dobro.', color: '#ff7a59', weight: 2 },
  { id: 'apagar', name: 'Apagar Eco', short: 'Apagar', desc: 'Apaga para sempre o Eco mais perto de você.', color: '#ff4fc3', weight: 2 },
];

export function getPower(id: PowerId): PowerDef {
  return POWERS.find((p) => p.id === id)!;
}

export function randomPower(rand = Math.random): PowerId {
  const total = POWERS.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (const p of POWERS) {
    r -= p.weight;
    if (r <= 0) return p.id;
  }
  return 'turbo';
}
