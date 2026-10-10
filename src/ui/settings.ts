import type { Difficulty } from '../game/sim';

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
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* armazenamento indisponível: usa padrões */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
