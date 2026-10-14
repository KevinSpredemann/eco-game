// Cartões da tela de modos. A tela inicial não lista modos.

export interface ModeCard {
  id: string;
  name: string;
  category: string;
  desc: string;
  players: string;
  where: string;
  available: boolean;
  /** por que não dá para entrar, quando indisponível */
  reason?: string;
  /** times, quando o modo tem */
  teams?: string;
}

export const PLAY_MODES: ModeCard[] = [
  {
    id: 'x1-online',
    name: 'X1 Online',
    category: 'Duelo',
    desc: 'Sala ou busca. Só poderes, no Q, W, E e R. Os combos valem.',
    players: '2',
    where: 'Online',
    available: true,
  },
  {
    id: 'x1-offline',
    name: 'X1 Offline',
    category: 'Duelo',
    desc: 'Contra um bot, sem servidor. Mesmas regras do X1. A dificuldade fica na escolha do mapa.',
    players: '1 + bot',
    where: 'Offline',
    available: true,
  },
  {
    id: 'dupla',
    name: '2x2',
    category: 'Times',
    desc: 'Dois contra dois, só com poderes. Offline: você, um aliado bot e dois rivais. Online: sala com gente e bots.',
    players: '4',
    where: 'Online e offline',
    available: true,
    teams: 'Azul × Vermelho',
  },
  {
    id: 'mundo',
    name: 'ECO Mundo',
    category: 'Exploração',
    desc: 'Vila e floresta, solo. O co-op fica para depois, no mesmo progresso.',
    players: '1',
    where: 'Offline',
    available: true,
  },
];

/** Planejados de verdade, mas ainda sem mapa jogável. O botão não entra em lugar nenhum. */
export const LATER_MODES: ModeCard[] = [
  {
    id: 'ruinas',
    name: 'Ruínas ECO',
    category: 'Exploração',
    desc: 'Região ainda não construída.',
    players: '—',
    where: 'Indisponível',
    available: false,
    reason: 'Indisponível',
  },
  {
    id: 'pantano',
    name: 'Pântano',
    category: 'Exploração',
    desc: 'Região ainda não construída.',
    players: '—',
    where: 'Indisponível',
    available: false,
    reason: 'Indisponível',
  },
  {
    id: 'deserto',
    name: 'Deserto de sucata',
    category: 'Exploração',
    desc: 'Região ainda não construída.',
    players: '—',
    where: 'Indisponível',
    available: false,
    reason: 'Indisponível',
  },
];

export function modeById(id: string): ModeCard | undefined {
  return [...PLAY_MODES, ...LATER_MODES].find((m) => m.id === id);
}
