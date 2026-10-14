// Poderes que aparecem pela arena. Encostou, pegou.

export type PowerId =
  | 'escudo'
  | 'ima'
  | 'gelo'
  | 'turbo'
  | 'dobro'
  | 'apagar'
  | 'metralhadora'
  | 'escopeta'
  | 'laser'
  | 'bomba'
  | 'mina'
  | 'cura'
  | 'foguete'
  | 'congelante'
  | 'invisivel'
  | 'vampiro';

export interface PowerDef {
  id: PowerId;
  name: string;
  short: string;
  desc: string;
  color: string;
  weight: number;
  /** em quais modos aparece */
  modes: ('nucleo' | 'combate')[];
}

export const POWERS: PowerDef[] = [
  { id: 'escudo', name: 'Escudo', short: 'Escudo', desc: 'Bloqueia o próximo golpe (no combate: absorve 50 de dano).', color: '#5dff8a', weight: 3, modes: ['nucleo', 'combate'] },
  { id: 'ima', name: 'Ímã', short: 'Ímã', desc: 'Puxa as energias por perto (6 s).', color: '#3ee8ff', weight: 3, modes: ['nucleo'] },
  { id: 'gelo', name: 'Gelo nos Ecos', short: 'Gelo', desc: 'Todos os Ecos ficam congelados e inofensivos (4 s).', color: '#b8e6ff', weight: 2, modes: ['nucleo', 'combate'] },
  { id: 'turbo', name: 'Turbo', short: 'Turbo', desc: 'Corre muito mais rápido (4 s).', color: '#ffd23e', weight: 3, modes: ['nucleo', 'combate'] },
  { id: 'dobro', name: 'Energia em dobro', short: 'x2', desc: 'Sua próxima entrega no núcleo vale o dobro.', color: '#ff7a59', weight: 2, modes: ['nucleo'] },
  { id: 'apagar', name: 'Apagar Eco', short: 'Apagar', desc: 'Apaga para sempre o Eco mais perto de você.', color: '#ff4fc3', weight: 2, modes: ['nucleo', 'combate'] },
  { id: 'metralhadora', name: 'Metralhadora', short: 'Metralha', desc: 'Tiros rápidos por 7 s.', color: '#ffb347', weight: 4, modes: ['combate'] },
  { id: 'escopeta', name: 'Escopeta', short: 'Escopeta', desc: 'Rajada de 6 balas, forte de perto (8 s).', color: '#ff7a59', weight: 3, modes: ['combate'] },
  { id: 'laser', name: 'Laser', short: 'Laser', desc: '4 tiros que atravessam tudo e causam muito dano.', color: '#ff3bd4', weight: 2, modes: ['combate'] },
  { id: 'bomba', name: 'Bombas', short: 'Bomba x3', desc: 'Toque em ITEM para jogar. Explodem em área.', color: '#ff5a3c', weight: 4, modes: ['combate'] },
  { id: 'mina', name: 'Minas', short: 'Mina x2', desc: 'Toque em ITEM para plantar. Explodem quando um rival pisa.', color: '#c8ff3c', weight: 2, modes: ['combate'] },
  { id: 'cura', name: 'Cura', short: '+40 vida', desc: 'Recupera 40 de vida.', color: '#5dffb8', weight: 3, modes: ['combate'] },
  { id: 'foguete', name: 'Lança-foguetes', short: 'Foguete', desc: '3 foguetes que explodem em área.', color: '#ff9a3c', weight: 2, modes: ['combate'] },
  { id: 'congelante', name: 'Raio Congelante', short: 'Congela', desc: 'Tiros que deixam o rival lento (8 s).', color: '#7ff0ff', weight: 2, modes: ['combate'] },
  { id: 'invisivel', name: 'Invisível', short: 'Invisível', desc: 'Ninguém te vê por 5 s (os bots perdem você).', color: '#d8d0ff', weight: 2, modes: ['nucleo', 'combate'] },
  { id: 'vampiro', name: 'Vampiro', short: 'Vampiro', desc: 'Seus acertos te curam por 8 s.', color: '#ff3b6b', weight: 2, modes: ['combate'] },
];

export function getPower(id: PowerId): PowerDef {
  return POWERS.find((p) => p.id === id)!;
}

export function randomPower(rand = Math.random): PowerId {
  const pool = POWERS.filter((p) => p.id !== 'ima');
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.id;
  }
  return 'turbo';
}
