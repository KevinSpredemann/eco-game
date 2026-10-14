import type { Difficulty } from '../game/sim';
import { DEFAULT_LOADOUT, type Loadout } from '../game/balance';
import { DEFAULT_KEYS, WASD_KEYS, WASD_NOTEBOOK, presetKeys, type CastChoice, type ControlStyle, type KeyBinds, type MoveScheme } from './input';

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
  /** clássico ou notebook (WASD + mouse). O remap fica por cima do estilo. */
  control: ControlStyle;
  /** 100 = padrão. Só o notebook usa, para o trackpad não pular a mira. */
  aimSens: number;
  /** auto: clássico segura a tecla, notebook solta na hora. */
  castMode: CastChoice;
  /** estes espaços sempre abrem a mira manual */
  manualAim: string[];
  /** aiming: círculo só enquanto mira. always: mostra o alcance do Q. */
  rangeIndicator: 'aiming' | 'always';
  /** both: Esc e botão direito. esc: só Esc. */
  cancelAim: 'both' | 'esc';
  /** arrows libera o W para o poder. wasd restaura o andar antigo. esdf anda com E S D F. */
  moveScheme: MoveScheme;
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
  control: 'classic',
  aimSens: 100,
  castMode: 'auto',
  manualAim: [],
  rangeIndicator: 'aiming',
  cancelAim: 'both',
  moveScheme: 'arrows',
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
      const mode = v.castMode === 'instant' || v.castMode === 'manual' || v.castMode === 'release' || v.castMode === 'auto' ? v.castMode : DEFAULTS.castMode;
      const scheme: MoveScheme = v.moveScheme === 'wasd' || v.moveScheme === 'esdf' ? v.moveScheme : 'arrows';
      let keys: KeyBinds = { ...DEFAULT_KEYS, ...(v.keys ?? {}) };
      if (v.moveScheme == null && (sameKeys(v.keys, WASD_KEYS) || sameKeys(v.keys, WASD_NOTEBOOK))) {
        keys = presetKeys(sameKeys(v.keys, WASD_NOTEBOOK) ? 'notebook' : 'classic', 'arrows');
      }
      return {
        ...DEFAULTS,
        ...v,
        castMode: mode,
        manualAim: Array.isArray(v.manualAim) ? v.manualAim.filter((s: unknown) => typeof s === 'string') : [],
        rangeIndicator: v.rangeIndicator === 'always' ? 'always' : 'aiming',
        cancelAim: v.cancelAim === 'esc' ? 'esc' : 'both',
        moveScheme: scheme,
        keys,
        loadout: { ...DEFAULT_LOADOUT, ...(v.loadout ?? {}) },
      };
    }
  } catch {
    /* armazenamento indisponível: usa padrões */
  }
  return { ...DEFAULTS, keys: { ...DEFAULT_KEYS }, loadout: { ...DEFAULT_LOADOUT } };
}

function sameKeys(a: Partial<KeyBinds> | undefined, b: KeyBinds) {
  if (!a) return false;
  return (Object.keys(b) as (keyof KeyBinds)[]).every((k) => a[k] === b[k]);
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
