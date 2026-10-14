// Uma reação por golpe. A simulação, o bot e a tela leem este módulo.
import {
  MARK_TIME,
  ROOT_AOE_BONUS,
  ROOT_TIME,
  SLOT_LABEL,
  comboOf,
  kitOf,
  resolvedDamage,
  tuneCombo,
  type Aura,
  type Element,
  type Kit,
  type PowerDef,
} from './elements';

/** Janela da marca e do campo. O mesmo número do MARK_TIME do elemento. */
export const MARK_WINDOW = MARK_TIME;
export const FIELD_WINDOW = MARK_TIME;
/** Raiz do combo, mais longa que a raiz comum. */
export const ROOT_FIRM_TIME = 2.2;
export const ROOT_FIRM_BONUS = 10;
export const FIELD_BONUS = 12;
export const ULT_CONTROL_BONUS = 14;
/** A mesma raiz não fecha o bônus de área de novo. */
export const REACT_LOCK = 1.6;

const ELEMENTAL = new Set(['shatter', 'steam', 'cinder', 'storm', 'arc', 'thermal', 'chill']);

export interface HitQuery {
  charId: string;
  element: Element;
  aoe: boolean;
  projectile: boolean;
  /** 0 Q, 1 E, 2 R, 3 F. -1 é extra ou arrancada. */
  slot: number;
  appliesMark: boolean;
  roots: boolean;
  aura: Aura;
  marked: number;
  field: number;
  fieldEl: Element | '';
  stun: number;
  reactCd: number;
}

export interface Reaction {
  id: string;
  name: string;
  bonus: number;
  clearFrozen?: boolean;
  clearBurn?: boolean;
  clearGust?: boolean;
  clearShock?: boolean;
  clearRoot?: boolean;
  clearMarked?: boolean;
  clearField?: boolean;
  rootAdd?: number;
  reactLock?: number;
  aoe?: number;
  vfx: 'ult' | 'burst' | 'root' | 'element';
}

export function fieldAccepts(field: Element | '', next: Element): boolean {
  if (!field) return false;
  if (field === next) return true;
  if (field === 'ice' && next === 'lightning') return true;
  if (field === 'fire' && next === 'wind') return true;
  return false;
}

/** No máximo uma reação. Combo elemental antigo ganha do campo, para não trocar o Estilhaçar. */
export function resolveReaction(q: HitQuery): Reaction | null {
  const root = q.aura.root ?? 0;
  const elemental = tuneCombo(q.charId, comboOf(q.aura, q.element));
  if (q.slot === 2 && (root > 0 || q.stun > 0) && !elemental) {
    return {
      id: 'ult-control',
      name: 'Suprema no controle',
      bonus: ULT_CONTROL_BONUS,
      clearRoot: true,
      reactLock: REACT_LOCK,
      vfx: 'ult',
    };
  }
  if (q.marked > 0 && q.roots && !q.appliesMark && q.slot !== 2) {
    return {
      id: 'mark-root',
      name: 'Raiz firme',
      bonus: ROOT_FIRM_BONUS,
      clearMarked: true,
      rootAdd: ROOT_FIRM_TIME,
      reactLock: REACT_LOCK,
      vfx: 'root',
    };
  }
  if (elemental) {
    return {
      id: elemental.id,
      name: elemental.name,
      bonus: elemental.bonus,
      clearFrozen: elemental.clearFrozen,
      clearBurn: elemental.id === 'cinder' || elemental.id === 'thermal',
      clearGust: elemental.id === 'storm',
      clearShock: elemental.id === 'arc',
      aoe: elemental.aoe,
      vfx: 'element',
    };
  }
  if (q.aoe && root > 0 && q.reactCd <= 0) {
    return {
      id: 'root-aoe',
      name: 'Raiz e impacto',
      bonus: ROOT_AOE_BONUS,
      clearRoot: true,
      reactLock: REACT_LOCK,
      vfx: 'root',
    };
  }
  if (q.field > 0 && q.projectile && fieldAccepts(q.fieldEl, q.element)) {
    return {
      id: 'field-shot',
      name: 'Descarga',
      bonus: FIELD_BONUS,
      clearField: true,
      vfx: 'burst',
    };
  }
  return null;
}

export function isElemental(id: string) {
  return ELEMENTAL.has(id);
}

function inReach(pw: PowerDef, dist: number) {
  return pw.speed <= 0 ? dist < pw.radius + 20 : dist < pw.range;
}

function queryOf(charId: string, pw: PowerDef, slot: number, foe: Aura, distReady = true): HitQuery {
  return {
    charId,
    element: pw.element,
    aoe: pw.speed <= 0 && !pw.act,
    projectile: pw.speed > 0,
    slot,
    appliesMark: !!pw.mark,
    roots: pw.element === 'nature',
    aura: foe,
    marked: foe.marked ?? 0,
    field: foe.field ?? 0,
    fieldEl: foe.fieldEl ?? '',
    stun: foe.stun ?? 0,
    reactCd: distReady ? 0 : 1,
  };
}

/** O bot fecha a sinergia oficial que já está armada, com a mesma regra do jogador. */
export function officialSlot(charId: string, kit: Kit, cds: readonly number[], foe: Aura, dist: number): number | null {
  for (let i = 0; i < 4; i++) {
    if ((cds[i] ?? 0) > 0) continue;
    const pw = kit.powers[i];
    if (!inReach(pw, dist)) continue;
    const hit = resolveReaction(queryOf(charId, pw, i, foe));
    if (hit && (hit.id === 'mark-root' || hit.id === 'field-shot' || hit.id === 'ult-control')) return i;
  }
  return null;
}

/** Combo que já está armado num rival e cabe num poder pronto. */
export function comboReady(charId: string, cds: readonly number[], foes: readonly Aura[], labels: readonly string[] = SLOT_LABEL): { slot: number; key: string; name: string } | null {
  const kit = kitOf(charId);
  for (const foe of foes) {
    for (let i = 0; i < 4; i++) {
      if ((cds[i] ?? 0) > 0) continue;
      const hit = resolveReaction(queryOf(charId, kit.powers[i], i, foe));
      if (hit) return { slot: i, key: labels[i] ?? SLOT_LABEL[i], name: hit.name };
    }
  }
  return null;
}

export interface SynergyCard {
  id: string;
  name: string;
  order: string;
  result: string;
  need: string;
  inKit: boolean;
  slots: number[];
}

/** As três sinergias oficiais, e se este personagem consegue fechá-las. */
export function kitSynergies(charId: string): SynergyCard[] {
  const powers = kitOf(charId).powers;
  const mark = powers.findIndex((p) => p.mark);
  const root = powers.findIndex((p, i) => i !== 2 && p.element === 'nature' && !p.mark && p.speed <= 0);
  const field = powers.findIndex((p) => p.speed <= 0 && !p.act && p.zone !== 'heal');
  const shot = powers.findIndex((p) => p.speed > 0 && (field < 0 || fieldAccepts(powers[field].element, p.element)));
  const compatible = field >= 0 && shot >= 0 && fieldAccepts(powers[field].element, powers[shot].element);
  const canRoot = powers.some((p, i) => i !== 2 && p.element === 'nature' && !p.mark && p.speed <= 0);
  const canStun = powers.some((p, i) => i !== 2 && p.element === 'lightning');
  const stunUlt = canStun && !comboOf({ burn: 0, frozen: 0, gust: 0, shock: 1 }, powers[2].element);
  const controlSlot = powers.findIndex((p, i) => i !== 2 && ((p.element === 'nature' && !p.mark && p.speed <= 0) || (stunUlt && p.element === 'lightning')));
  return [
    {
      id: 'mark-root',
      name: 'Raiz firme',
      order: 'Marca, depois a raiz',
      result: `prende ${ROOT_FIRM_TIME}s e soma ${ROOT_FIRM_BONUS}`,
      need: `marca de ${MARK_WINDOW}s no mesmo alvo`,
      inKit: mark >= 0 && root >= 0,
      slots: mark >= 0 && root >= 0 ? [mark, root] : [],
    },
    {
      id: 'field-shot',
      name: 'Descarga',
      order: 'Área, depois o projétil',
      result: `estoura e soma ${FIELD_BONUS}`,
      need: `campo de ${FIELD_WINDOW}s no alvo`,
      inKit: compatible,
      slots: compatible ? [field, shot] : [],
    },
    {
      id: 'ult-control',
      name: 'Suprema no controle',
      order: 'Controle, depois a suprema',
      result: `reação exclusiva e soma ${ULT_CONTROL_BONUS}`,
      need: 'alvo preso ou tonto',
      inKit: canRoot || stunUlt,
      slots: controlSlot >= 0 ? [controlSlot, 2] : [],
    },
  ];
}

export function trainLine(charId: string): string {
  const ready = kitSynergies(charId).filter((s) => s.inKit);
  if (!ready.length) return 'Treino: o boneco fica parado.';
  return `Treino: ${ready.map((s) => `${s.name} (${s.order})`).join(' · ')}`;
}

export function powerRole(pw: PowerDef): string {
  if (pw.mark) return 'Marca o alvo';
  if (pw.act === 'dash' || pw.act === 'blink') return 'Desloca você';
  if (pw.act === 'decoy') return 'Segura um tiro';
  if (pw.act === 'wall') return 'Bloqueia o caminho';
  if (pw.zone === 'heal' || pw.act === 'zone') return 'Cura quem está junto';
  if (pw.grove === 'heal') return 'Dano e um bosque de cura';
  if (pw.element === 'nature' && pw.speed <= 0) return 'Prende no chão';
  if (pw.element === 'ice') return 'Deixa lento';
  if (pw.element === 'lightning') return 'Deixa tonto';
  if (pw.element === 'wind') return 'Empurra';
  if (pw.element === 'fire') return 'Queima';
  if (pw.speed <= 0) return 'Acerta uma área';
  return 'Acerta em linha';
}

/** Números que o combate aplica. A ficha não inventa outro valor. */
export function powerSheet(pw: PowerDef, slot: number, cost: number) {
  const kitSlot = slot >= 0 && slot <= 3 ? slot : undefined;
  let duration = 'no acerto';
  if (pw.mark) duration = `${MARK_WINDOW}s`;
  else if (pw.element === 'nature' && pw.speed <= 0 && !pw.act) duration = `${ROOT_TIME}s`;
  else if (pw.zone === 'heal' || pw.act === 'zone') duration = 'enquanto o bosque dura';
  else if (pw.windup) duration = `${pw.windup}s`;
  else if (pw.charge) duration = 'cresce ao segurar';
  return {
    damage: resolvedDamage(pw, kitSlot),
    range: pw.range,
    area: pw.radius,
    energy: slot === 2 ? 'carga' : String(cost),
    cooldown: pw.cd,
    duration,
    role: powerRole(pw),
    cast: pw.charge || pw.windup ? 'carrega' : pw.speed <= 0 ? 'área' : 'projétil',
  };
}
