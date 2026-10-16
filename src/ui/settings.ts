import type { Difficulty } from '../game/sim';
import { DEFAULT_LOADOUT, type Loadout } from '../game/balance';
import {
  ARROW_LAYOUT,
  ARROW_LAYOUT_NOTEBOOK,
  DEFAULT_KEYS,
  ESDF_KEYS,
  LEGACY_ESDF,
  LEGACY_QWER,
  LEGACY_QWER_NOTEBOOK,
  LEGACY_SHIFT,
  LEGACY_SHIFT_NOTEBOOK,
  NOTEBOOK_KEYS,
  WASD_KEYS,
  presetKeys,
  type CastChoice,
  type ControlStyle,
  type KeyBinds,
  type MoveScheme,
} from './input';

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
  /** final cinematográfico quando um combo elimina. Desligar deixa o kill normal. */
  finisher: boolean;
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
  /** setas miram. WASD continua andando. */
  keyboardAim: boolean;
  /** estes espaços sempre abrem a mira manual */
  manualAim: string[];
  /** aiming: círculo só enquanto mira. always: mostra o alcance do Q. */
  rangeIndicator: 'aiming' | 'always';
  /** both: Esc e botão direito. esc: só Esc. */
  cancelAim: 'both' | 'esc';
  /** wasd é o padrão. arrows libera o W para um poder. esdf anda com E S D F. */
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
  finisher: true,
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
  keyboardAim: false,
  manualAim: [],
  rangeIndicator: 'aiming',
  cancelAim: 'both',
  moveScheme: 'wasd',
  loadout: { ...DEFAULT_LOADOUT },
  chefeRole: 'sorteio',
  bossTurns: 0,
  // aparelhos modestos começam na qualidade média
  quality: typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4 ? 'media' : 'alta',
};

const STOCK: KeyBinds[] = [WASD_KEYS, NOTEBOOK_KEYS, ARROW_LAYOUT, ARROW_LAYOUT_NOTEBOOK, ESDF_KEYS, LEGACY_QWER, LEGACY_QWER_NOTEBOOK, LEGACY_SHIFT, LEGACY_SHIFT_NOTEBOOK, LEGACY_ESDF];

/** Cada tecla gravada bate com o mesmo campo do preset. Uma tecla fora de todo preset é remap manual. */
function definedMatch(keys: Partial<KeyBinds> | null | undefined, preset: KeyBinds) {
  if (!keys) return false;
  const defined = (Object.keys(keys) as (keyof KeyBinds)[]).filter((k) => keys[k] != null);
  return defined.length > 0 && defined.every((k) => keys[k] === preset[k]);
}

/**
 * O padrão voltou a ser WASD, com Q E F, R e Z.
 * Um save que ainda é um preset (QWER das setas, Shift antigo, ESDF de fábrica)
 * entra nesse padrão. Tecla trocada na mão fica como o jogador deixou.
 * Setas e ESDF escolhidos de propósito, já no preset novo, continuam.
 */
export function migrateMoveKeys(raw: { moveScheme?: unknown; control?: unknown; keys?: Partial<KeyBinds> | null }): { moveScheme: MoveScheme; keys: KeyBinds } | null {
  const scheme: MoveScheme = raw.moveScheme === 'arrows' || raw.moveScheme === 'esdf' || raw.moveScheme === 'wasd' ? raw.moveScheme : 'wasd';
  const keys = raw.keys ?? null;
  const notebook = raw.control === 'notebook';
  const next = { moveScheme: 'wasd' as const, keys: presetKeys(notebook ? 'notebook' : 'classic', 'wasd') };
  if (!keys) return scheme === 'wasd' ? null : next;
  if (scheme === 'wasd' && (definedMatch(keys, WASD_KEYS) || definedMatch(keys, NOTEBOOK_KEYS))) return null;
  if (scheme === 'arrows' && (definedMatch(keys, ARROW_LAYOUT) || definedMatch(keys, ARROW_LAYOUT_NOTEBOOK))) return null;
  if (scheme === 'esdf' && (definedMatch(keys, ESDF_KEYS) || definedMatch(keys, LEGACY_ESDF))) return null;
  if (!STOCK.some((p) => definedMatch(keys, p))) return null;
  return next;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      const mode = v.castMode === 'instant' || v.castMode === 'manual' || v.castMode === 'release' || v.castMode === 'auto' ? v.castMode : DEFAULTS.castMode;
      const migrated = migrateMoveKeys(v);
      const scheme: MoveScheme = migrated
        ? migrated.moveScheme
        : v.moveScheme === 'arrows' || v.moveScheme === 'esdf' || v.moveScheme === 'wasd'
          ? v.moveScheme
          : 'wasd';
      let keys: KeyBinds = migrated ? migrated.keys : { ...DEFAULT_KEYS, ...(v.keys ?? {}) };
      const legacyWasd = { ...WASD_KEYS, item: 'Digit1' };
      const itemMoved = definedMatch(keys, legacyWasd);
      if (itemMoved) keys = { ...keys, item: 'KeyX' };
      const next: Settings = {
        ...DEFAULTS,
        ...v,
        castMode: mode,
        keyboardAim: v.keyboardAim === true,
        manualAim: Array.isArray(v.manualAim) ? v.manualAim.filter((s: unknown) => typeof s === 'string') : [],
        rangeIndicator: v.rangeIndicator === 'always' ? 'always' : 'aiming',
        finisher: v.finisher !== false,
        cancelAim: v.cancelAim === 'esc' ? 'esc' : 'both',
        moveScheme: scheme,
        keys,
        loadout: { ...DEFAULT_LOADOUT, ...(v.loadout ?? {}) },
      };
      if (migrated || itemMoved) saveSettings(next);
      return next;
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
