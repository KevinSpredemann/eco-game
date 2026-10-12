import type { Difficulty } from '../game/sim';
import { DEFAULT_LOADOUT, type Loadout } from '../game/balance';
import { DEFAULT_KEYS, type KeyBinds } from './input';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  ctrlAlpha: number;
  ctrlSize: number;
  swap: boolean;
  ownEcho: boolean;
  trails: boolean;
  reduced: boolean;
  char: string;
  arena: string;
  bots: number;
  difficulty: Difficulty;
  tutorialDone: boolean;
  rulesSeen: boolean;
  /** já escolheu entre conta e convidado na primeira abertura */
  welcomeSeen: boolean;
  /** apelido de convidado no online */
  nick: string;
  /** teclas (remapeáveis) */
  keys: KeyBinds;
  /** equipamento escolhido */
  loadout: Loadout;
  /** Caça ao Chefe contra bots: papel preferido */
  chefeRole: 'cacador' | 'chefe' | 'sorteio';
  /** rodízio do Chefe nas partidas contra bots */
  bossTurns: number;
  /** qualidade gráfica */
  quality: 'alta' | 'media' | 'baixa';
}

const KEY = 'eco.settings.v1';

export const DEFAULTS: Settings = {
  master: 80,
  music: 55,
  sfx: 85,
  muted: false,
  ctrlAlpha: 70,
  ctrlSize: 100,
  swap: false,
  ownEcho: true,
  trails: true,
  reduced: false,
  char: 'kael',
  arena: 'lab',
  bots: 3,
  difficulty: 'normal',
  tutorialDone: false,
  rulesSeen: false,
  welcomeSeen: false,
  nick: '',
  keys: { ...DEFAULT_KEYS },
  loadout: { ...DEFAULT_LOADOUT },
  chefeRole: 'sorteio',
  bossTurns: 0,
  // aparelhos modestos começam na qualidade média
  quality: typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4 ? 'media' : 'alta',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { ...DEFAULTS, ...v, keys: { ...DEFAULT_KEYS, ...(v.keys ?? {}) }, loadout: { ...DEFAULT_LOADOUT, ...(v.loadout ?? {}) } };
    }
  } catch {
    /* armazenamento indisponível: usa padrões */
  }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS }, loadout: { ...DEFAULT_LOADOUT } };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
