// Uma reação por golpe. A simulação, o bot e a tela leem este módulo.
import {
  BURN_TIME,
  ELEMENT_FX,
  FROZEN_TIME,
  MARK_TIME,
  ROOT_AOE_BONUS,
  ROOT_TIME,
  SLOT_LABEL,
  STUDIO,
  comboOf,
  kitOf,
  powerCategory,
  resolvedDamage,
  studioOf,
  tuneCombo,
  type Aura,
  type Element,
  type Kit,
  type PowerCategory,
  type PowerDef,
} from './elements';

/**
 * Janela do segundo golpe. Começa no acerto, não no lançamento.
 * 1,5 s é o topo da faixa pedida (0,8–1,5): um tiro lento (~0,4 s a 140 px)
 * ainda cabe depois que a pessoa aperta a segunda tecla. 3,2 s parecia dois golpes soltos.
 * Queimadura e molhado duram mais; só o combo lê este relógio.
 */
export const COMBO_WINDOW = 1.5;
/** Marca de Ruptura fica um pouco além da janela comum, e acaba sozinha. */
export const RUPTURE_TIME = 2.4;
/** Marca e campo fecham no mesmo relógio do combo. */
export const MARK_WINDOW = COMBO_WINDOW;
export const FIELD_WINDOW = COMBO_WINDOW;
/** Raiz do combo, mais longa que a raiz comum. */
export const ROOT_FIRM_TIME = 2.2;
export const ROOT_FIRM_BONUS = 10;
export const FIELD_BONUS = 12;
export const ULT_CONTROL_BONUS = 14;
/** Fogo num alvo preso: explosão local, uma vez. */
export const COMBUST_BONUS = 10;
export const COMBUST_AOE = 64;
/** Terra + Ar: as rochas da raiz viram estilhaços lançados em volta. */
export const SHARDS_BONUS = 10;
export const SHARDS_AOE = 90;
/** Golpe ofensivo logo depois de um controle, uma vez na janela. */
export const EXECUTE_BONUS = 8;
/** Plasma: o disparo marca, a onda do kit estoura a cadeia uma vez. */
export const CASCADE_BONUS = 10;
export const CASCADE_AOE = 72;
/** Sombra: o corte marca, o próximo golpe (que não é a suprema) fecha a tocaia. */
export const TOCAIA_BONUS = 10;
/** A mesma raiz não fecha o bônus de área de novo. */
export const REACT_LOCK = 1.6;
/**
 * Folga depois do atordoamento/raiz em que o alvo ainda conta como "controlado" para os combos
 * de controle. O tonto dura ~0,55 s: sem folga, o segundo golpe (que ainda viaja) chegava tarde.
 */
export const CONTROL_GRACE = 1.2;

const ELEMENTAL = new Set(['shatter', 'steam', 'cinder', 'storm', 'arc', 'thermal', 'chill', 'freeze', 'vortex']);

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
  /** lentidão sem congelar. Ausente vale zero. */
  slow?: number;
  /** Marca de Ruptura ainda no alvo. */
  rupture?: number;
  /** id do golpe do catálogo, quando o acerto veio de um. */
  trick?: string;
  /** zona de fogo perto do alvo (a rajada de ar fecha o Inferno mesmo sem queimadura no corpo). */
  nearFire?: boolean;
  /** alvo controlado agora ou há pouco (atordoado/preso + folga). Ausente: só o estado atual. */
  ctrl?: number;
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
  clearPlasma?: boolean;
  rootAdd?: number;
  /** gasta a janela de controle (não fecha outro combo de controle com o mesmo atordoamento) */
  clearCtrl?: boolean;
  reactLock?: number;
  aoe?: number;
  /** congela: segura o alvo parado (s) */
  hold?: number;
  /** puxa os inimigos deste raio para o alvo */
  pull?: number;
  /** espalha a queimadura para quem está neste raio */
  spreadBurn?: number;
  /** consome a Marca de Ruptura */
  clearRupture?: boolean;
  /** zona que limita o passo, em pixels */
  zone?: number;
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
  const ctrl = Math.max(q.ctrl ?? 0, root, q.stun);
  const elemental = tuneCombo(q.charId, comboOf(q.aura, q.element));
  if (q.slot === 2 && ctrl > 0 && !elemental) {
    return {
      id: 'ult-control',
      name: 'Suprema no controle',
      bonus: ULT_CONTROL_BONUS,
      clearRoot: true,
      clearCtrl: true,
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
  if (q.marked > 0 && q.element === 'shadow' && !q.roots && !q.appliesMark && q.slot !== 2 && q.reactCd <= 0) {
    return {
      id: 'ambush',
      name: 'Tocaia',
      bonus: TOCAIA_BONUS,
      clearMarked: true,
      reactLock: REACT_LOCK,
      vfx: 'burst',
    };
  }
  const fresh = (q.aura.combo ?? 1) > 0;
  // Fogo + Ar numa zona de fogo, sem queimadura no corpo: o mesmo Inferno, uma vez.
  if (fresh && q.element === 'wind' && q.nearFire && (q.aura.burn ?? 0) <= 0 && q.reactCd <= 0) {
    return { id: 'cinder', name: 'Inferno Espiral', bonus: 10, aoe: 80, spreadBurn: 80, reactLock: REACT_LOCK, vfx: 'element' };
  }
  if (elemental && fresh) {
    const rupture = elemental.id === 'chill';
    return {
      id: elemental.id,
      name: rupture ? 'Ruptura' : elemental.name,
      bonus: elemental.bonus,
      clearFrozen: elemental.clearFrozen,
      clearBurn: elemental.id === 'cinder' || elemental.id === 'thermal',
      clearGust: elemental.id === 'storm',
      clearShock: elemental.id === 'arc',
      aoe: elemental.aoe,
      hold: elemental.hold,
      pull: elemental.pull,
      spreadBurn: elemental.spreadBurn,
      reactLock: rupture ? REACT_LOCK : undefined,
      vfx: 'element',
    };
  }
  // Água + Terra: a fissura (ou o alvo molhado) solta espinhos de gelo
  if (q.element === 'ice' && root > 0 && q.reactCd <= 0) {
    return { id: 'frostline', name: 'Espinhos Glaciais', bonus: 10, aoe: 68, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  if (fresh && q.element === 'nature' && q.aura.frozen > 0 && q.reactCd <= 0 && !q.appliesMark) {
    return { id: 'frostline', name: 'Espinhos Glaciais', bonus: 10, aoe: 68, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // Raio + Plasma: o disparo carregado explode uma vez no acerto
  if (fresh && q.element === 'plasma' && q.projectile && (q.aura.shock ?? 0) > 0 && q.reactCd <= 0) {
    return { id: 'charged', name: 'Raio Carregado', bonus: 12, aoe: 72, clearShock: true, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // O campo da área aceita o projétil antes da ruptura do alvo só lento.
  if (q.field > 0 && q.projectile && fieldAccepts(q.fieldEl, q.element)) {
    return {
      id: 'field-shot',
      name: 'Descarga',
      bonus: FIELD_BONUS,
      clearField: true,
      vfx: 'burst',
    };
  }
  if (q.element === 'plasma' && (q.slow ?? 0) > 0 && q.reactCd <= 0) {
    return { id: 'chill', name: 'Ruptura', bonus: 8, reactLock: REACT_LOCK, vfx: 'element' };
  }
  if ((q.aura.plasma ?? 0) > 0 && q.element === 'plasma' && q.aoe && q.slot !== 2 && q.reactCd <= 0) {
    return { id: 'cascade', name: 'Cadeia de Plasma', bonus: CASCADE_BONUS, aoe: CASCADE_AOE, clearPlasma: true, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // Terra + Fogo: a fissura da raiz solta calor e explode no lugar
  if (q.element === 'fire' && root > 0 && q.reactCd <= 0) {
    return { id: 'combustao', name: 'Fissura Magmática', bonus: COMBUST_BONUS, aoe: COMBUST_AOE, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // Terra + Ar: o vento arranca as rochas e lança os fragmentos em volta
  if (q.element === 'wind' && root > 0 && q.reactCd <= 0) {
    return { id: 'shards', name: 'Tempestade de Fragmentos', bonus: SHARDS_BONUS, aoe: SHARDS_AOE, clearRoot: true, reactLock: REACT_LOCK, vfx: 'burst' };
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
  if (ctrl > 0 && q.slot !== 2 && q.reactCd <= 0 && isOffense(q)) {
    return { id: 'execute', name: 'Execução combinada', bonus: EXECUTE_BONUS, clearCtrl: true, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // Marca de Ruptura: só se nenhum combo mais específico fechou neste golpe.
  if ((q.rupture ?? 0) > 0 && q.trick !== 'rupture' && isOffense(q) && q.reactCd <= 0) {
    return { id: 'rupture-mark', name: 'Ruptura Marcada', bonus: 12, aoe: 48, clearRupture: true, reactLock: REACT_LOCK, vfx: 'burst' };
  }
  // Lento (gelo ou raiz que já soltou) + água, sem molhado aberto: zona curta, sem prender para sempre.
  if (q.element === 'ice' && (q.slow ?? 0) > 0 && root <= 0 && (q.aura.frozen ?? 0) <= 0 && q.reactCd <= 0) {
    return { id: 'abyss', name: 'Prisão Abissal', bonus: 6, zone: 78, reactLock: REACT_LOCK, vfx: 'root' };
  }
  return null;
}

/** Controle já aplicado, e este golpe é ofensivo. Natureza que prende não conta. */
function isOffense(q: HitQuery) {
  if (q.element === 'nature' || q.roots) return false;
  return q.element === 'fire' || q.element === 'lightning' || q.element === 'plasma' || q.element === 'ice' || q.element === 'wind' || q.element === 'shadow';
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
    ctrl: foe.ctrl ?? 0,
    reactCd: distReady ? 0 : 1,
    slow: 0,
    rupture: foe.rupture ?? 0,
    trick: pw.trick,
  };
}

/** quanto falta da janela que arma este combo (e o total), para a barra da tela */
export function comboWindow(id: string, foe: Aura): { left: number; total: number } {
  const pick = (left: number, total: number) => ({ left: Math.max(0, left), total });
  if (id === 'shatter' || id === 'steam' || id === 'chill' || id === 'freeze' || id === 'vortex') return pick(foe.combo ?? foe.frozen, COMBO_WINDOW);
  if (id === 'cinder' || id === 'thermal') return pick(foe.combo ?? foe.burn, COMBO_WINDOW);
  if (id === 'storm') return pick(foe.combo ?? foe.gust, COMBO_WINDOW);
  if (id === 'arc' || id === 'charged') return pick(foe.combo ?? foe.shock, COMBO_WINDOW);
  if (id === 'mark-root' || id === 'ambush') return pick(foe.marked ?? 0, MARK_WINDOW);
  if (id === 'cascade') return pick(foe.plasma ?? 0, COMBO_WINDOW);
  if (id === 'field-shot') return pick(foe.field ?? 0, FIELD_WINDOW);
  if (id === 'combustao' || id === 'root-aoe' || id === 'shards' || id === 'frostline') return pick(foe.root ?? foe.combo ?? 0, id === 'frostline' ? COMBO_WINDOW : ROOT_TIME);
  if (id === 'ult-control' || id === 'execute') return pick(Math.max(foe.ctrl ?? 0, foe.stun ?? 0, foe.root ?? 0), CONTROL_GRACE + 0.8);
  if (id === 'rupture-mark') return pick(foe.rupture ?? 0, RUPTURE_TIME);
  if (id === 'abyss') return pick(foe.combo ?? 0, COMBO_WINDOW);
  return pick(0, 1);
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
export function comboReady(charId: string, cds: readonly number[], foes: readonly Aura[], labels: readonly string[] = SLOT_LABEL): { slot: number; key: string; name: string; id: string; left: number; total: number } | null {
  const kit = kitOf(charId);
  for (const foe of foes) {
    for (let i = 0; i < 4; i++) {
      if ((cds[i] ?? 0) > 0) continue;
      const hit = resolveReaction(queryOf(charId, kit.powers[i], i, foe));
      if (hit) return { slot: i, key: labels[i] ?? SLOT_LABEL[i], name: hit.name, id: hit.id, ...comboWindow(hit.id, foe) };
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
  if (pw.trick === 'lance') return 'Lança rápida que queima';
  if (pw.trick === 'volcano') return 'O dano cai só nos pulsos';
  if (pw.trick === 'ash') return 'Cone de cinza, visão local';
  if (pw.trick === 'tide') return 'Lâmina que molha e empurra';
  if (pw.trick === 'glacial') return 'Cristais com tempo de sair';
  if (pw.trick === 'mirror') return 'Barreira que racha';
  if (pw.trick === 'fist') return 'Onda de pedra no chão';
  if (pw.trick === 'roots') return 'Raízes que prendem e quebram';
  if (pw.trick === 'guardian') return 'Muralha que segura o tiro';
  if (pw.trick === 'gale') return 'Corte e lâmina de vento';
  if (pw.trick === 'step') return 'Avanço curto, sem intangível';
  if (pw.trick === 'updraft') return 'Puxa ao centro e dispersa';
  if (pw.trick === 'stormchain') return 'Raio que salta e enfraquece';
  if (pw.trick === 'rupture') return 'Marca o alvo. Sozinha dói pouco';
  if (pw.trick === 'collapse') return 'Só com o que está equipado';
  if (pw.mark) return 'Marca o alvo';
  if (pw.act === 'dash' || pw.act === 'blink') return 'Desloca você';
  if (pw.act === 'decoy') return 'Segura um tiro';
  if (pw.act === 'wall') return 'Bloqueia o caminho';
  if (pw.zone === 'heal' || pw.act === 'zone') return 'Cura quem está junto';
  if (pw.grove === 'heal') return 'Dano e um bosque de cura';
  if (pw.element === 'nature' && pw.speed <= 0) return 'Prende no chão';
  if (pw.element === 'ice') return 'Molha e deixa lento';
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

const CATEGORY_FACE: Record<PowerCategory, string> = {
  attack: 'Dano',
  control: 'Controle',
  mobility: 'Mobilidade',
  defense: 'Defesa',
  support: 'Suporte',
};

export function categoryLabel(pw: PowerDef): string {
  return CATEGORY_FACE[powerCategory(pw)];
}

export interface Fact {
  label: string;
  value: string;
}

/** Só o que o golpe realmente usa. Zero e "no acerto" ficam de fora. */
export function relevantFacts(pw: PowerDef, slot: number, cost: number): Fact[] {
  const sheet = powerSheet(pw, slot, cost);
  const heal = pw.zone === 'heal' || pw.act === 'zone';
  const mobile = pw.act === 'dash' || pw.act === 'blink';
  const facts: Fact[] = [];
  if (heal) {
    if (sheet.damage > 0) facts.push({ label: 'Cura', value: String(sheet.damage) });
  } else if (sheet.damage > 0) {
    facts.push({ label: 'Dano', value: String(sheet.damage) });
  }
  if (pw.grove === 'heal') facts.push({ label: 'Cura', value: 'bosque' });
  if (mobile) {
    const dist = pw.step ?? pw.range;
    if (dist > 0) facts.push({ label: 'Distância', value: String(dist) });
  } else if (sheet.range > 0) {
    facts.push({ label: 'Alcance', value: String(sheet.range) });
  }
  const area = !mobile && (pw.speed <= 0 || pw.act === 'wall' || pw.act === 'zone') && sheet.area > 0;
  if (area) facts.push({ label: 'Área', value: String(sheet.area) });
  if (sheet.energy !== '0') facts.push({ label: 'Energia', value: sheet.energy });
  if (sheet.cooldown > 0) facts.push({ label: 'Recarga', value: `${sheet.cooldown}s` });
  if (sheet.duration && sheet.duration !== 'no acerto') facts.push({ label: 'Duração', value: sheet.duration });
  return facts;
}

export function useLine(pw: PowerDef): string {
  if (pw.trick === 'ash' || pw.trick === 'stormchain') return 'Sem alvo válido, não gasta.';
  if (pw.trick === 'volcano' || pw.trick === 'glacial' || pw.trick === 'fist') return 'O aviso sai na hora. O dano só cai se o alvo ficar.';
  if (pw.trick === 'step') return 'Avança de verdade. Não fica intangível.';
  if (pw.trick === 'rupture') return 'O projétil marca e para na parede. Não deixa tonto.';
  if (pw.charge || pw.windup) return 'Segure para mirar e solte.';
  if (pw.act === 'dash' || pw.act === 'blink') return 'Aponte a direção. O deslocamento para na parede.';
  if (pw.speed <= 0) return 'Aponte o centro. Sem alvo na área, não gasta.';
  if (pw.home) return 'O projétil busca o alvo e para na parede.';
  return 'O projétil segue a mira e para na parede.';
}

export function aimLine(pw: PowerDef): string {
  if (pw.act === 'dash' || pw.act === 'blink' || pw.speed > 0) return 'Direção.';
  return 'Ponto.';
}

export function targetLine(pw: PowerDef): string {
  if (pw.trick === 'rupture') return 'A marca fica acima do alvo por poucos segundos. O acerto seguinte compatível consome.';
  if (pw.trick === 'ash') return 'A cinza baixa a visão só na área. O HUD continua visível.';
  if (pw.trick === 'lance') return 'Queima no acerto e para na parede.';
  if (pw.trick === 'collapse') return 'Só junta elementos das habilidades que estão equipadas.';
  if (pw.trick === 'mirror' || pw.trick === 'guardian') return 'A barreira racha e cai. Não atravessa a parede do mapa.';
  if (pw.zone === 'heal' || pw.act === 'zone') return 'Cura quem está no bosque.';
  if (pw.grove === 'heal') return 'Dano no impacto e um bosque de cura.';
  if (pw.act === 'decoy') return 'Segura um tiro e estoura.';
  if (pw.act === 'wall') return 'Bloqueia tiro e movimento.';
  if (pw.act === 'dash' || pw.act === 'blink') return 'Quem está no ponto leva o golpe.';
  if (pw.mark) return 'Marca o alvo. Não enraíza.';
  if ((pw.yank ?? 0) > 0) return 'Puxa o alvo.';
  const fx = ELEMENT_FX[pw.element];
  return fx.charAt(0).toUpperCase() + fx.slice(1) + '.';
}

export type SynergyState = 'active' | 'possible' | 'locked' | 'none';

export interface SynergyRow {
  id: string;
  name: string;
  effect: string;
  benefit: string;
  need: string;
  order: string;
  state: SynergyState;
  /** Índices do kit. -1 é o Z equipado. */
  slots: number[];
  ends: [string, string];
  powers: [PowerDef, PowerDef];
}

const RANK: Record<SynergyState, number> = { none: 0, locked: 1, possible: 2, active: 3 };

const MARK_GHOST: PowerDef = { name: 'Marca', element: 'nature', cd: 1, dmg: 1, range: 80, speed: 400, radius: 8, mark: true };
const ROOT_GHOST: PowerDef = { name: 'Raiz', element: 'nature', cd: 1, dmg: 1, range: 80, speed: 0, radius: 40 };
const FIELD_GHOST: PowerDef = { name: 'Área', element: 'ice', cd: 1, dmg: 1, range: 80, speed: 0, radius: 40 };
const SHOT_GHOST: PowerDef = { name: 'Projétil', element: 'nature', cd: 1, dmg: 1, range: 80, speed: 400, radius: 8 };

function delivers(pw: PowerDef): boolean {
  return pw.act !== 'decoy' && pw.act !== 'zone';
}

/** O que o golpe deixa num alvo limpo, do mesmo jeito que o combate grava. */
function auraAfter(pw: PowerDef, slot = -1): Aura {
  const aura: Aura = { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '', stun: 0, plasma: 0, combo: 0 };
  if (!delivers(pw)) return aura;
  const aoe = pw.act === 'wall' || (pw.speed <= 0 && pw.act !== 'dash' && pw.act !== 'blink');
  if (pw.element === 'fire') aura.burn = 1;
  else if (pw.element === 'ice') aura.frozen = 1;
  else if (pw.element === 'lightning') {
    aura.shock = 1;
    aura.stun = 1;
  }
  else if (pw.element === 'wind') aura.gust = 1;
  else if (pw.element === 'nature' && !pw.mark) aura.root = 1;
  if (pw.trick === 'rupture') {
    aura.shock = 0;
    aura.stun = 0;
    aura.rupture = 1;
    aura.combo = COMBO_WINDOW;
    return aura;
  }
  if (pw.mark) aura.marked = 1;
  if (aoe && !pw.mark) {
    aura.field = 1;
    aura.fieldEl = pw.element;
  }
  // Só o disparo do kit (Q/E/F). A Rajada do Z usa a outra marca (Explosão de Plasma).
  if (pw.element === 'plasma' && pw.speed > 0 && !pw.act && slot >= 0 && slot !== 2) aura.plasma = 1;
  if (aura.burn || aura.frozen || aura.gust || aura.shock || aura.root || aura.marked || aura.field || aura.plasma || aura.stun) aura.combo = COMBO_WINDOW;
  return aura;
}

function reactionBetween(charId: string, first: PowerDef, firstSlot: number, second: PowerDef, secondSlot: number): Reaction | null {
  if (!delivers(first) || !delivers(second)) return null;
  return resolveReaction(queryOf(charId, second, secondSlot, auraAfter(first, firstSlot)));
}

function needOf(hit: Reaction): string {
  if (hit.id === 'root-aoe') return 'alvo preso';
  if (hit.id === 'chill' || hit.id === 'shatter' || hit.id === 'steam' || hit.id === 'freeze' || hit.id === 'vortex') return 'alvo molhado';
  if (hit.id === 'frostline') return 'fissura ou alvo molhado';
  if (hit.id === 'charged') return 'alvo no raio';
  if (hit.id === 'shards') return 'alvo preso na terra';
  if (hit.id === 'cinder') return 'alvo queimando ou zona de fogo';
  if (hit.id === 'thermal') return 'alvo queimando';
  if (hit.id === 'storm') return 'alvo no vento';
  if (hit.id === 'arc') return 'alvo no raio';
  if (hit.id === 'field-shot') return `campo de ${FIELD_WINDOW}s no alvo`;
  if (hit.id === 'mark-root' || hit.id === 'ambush') return `marca de ${MARK_WINDOW}s no mesmo alvo`;
  if (hit.id === 'cascade') return 'disparo de plasma ainda no alvo';
  if (hit.id === 'ult-control') return 'alvo preso ou tonto';
  if (hit.id === 'combustao') return 'alvo preso na terra';
  if (hit.id === 'execute') return 'alvo preso ou tonto';
  if (hit.id === 'rupture-mark') return 'Marca de Ruptura no mesmo alvo';
  if (hit.id === 'abyss') return 'alvo lento, sem estar molhado';
  return 'condição do golpe anterior';
}

/** O que o combo faz, em poucas palavras, com os números do combate. */
export function effectOf(hit: Reaction): string {
  const tail = `soma ${hit.bonus}`;
  if (hit.id === 'freeze') return `Execução Glacial: congela ${String(hit.hold ?? 0).replace('.', ',')}s e ${tail}`;
  if (hit.id === 'rupture-mark') return `consome a marca e ${tail}`;
  if (hit.id === 'abyss') return `zona que segura o passo e ${tail}`;
  if (hit.id === 'combustao') return `Fissura Magmática no alvo preso, ${tail}`;
  if (hit.id === 'vortex') return `puxa quem está perto e ${tail}`;
  if (hit.id === 'cinder') return `o fogo gira e pega em volta, ${tail}`;
  if (hit.id === 'shards') return `estilhaços em volta, ${tail}`;
  if (hit.id === 'cascade') return `a onda fecha a cadeia e ${tail}`;
  if (hit.id === 'ambush') return `sai da marca e ${tail}`;
  if (hit.id === 'steam') return `vapor em volta, ${tail}`;
  if (hit.id === 'shatter') return `descarga na água, ${tail}`;
  if (hit.id === 'frostline') return `espinhos de gelo na fissura, ${tail}`;
  if (hit.id === 'charged') return `o raio carregado explode, ${tail}`;
  return tail;
}

function iconsFor(card: SynergyCard, powers: readonly PowerDef[]): [PowerDef, PowerDef] {
  if (card.slots.length === 2) return [powers[card.slots[0]], powers[card.slots[1]]];
  if (card.id === 'field-shot') return [FIELD_GHOST, SHOT_GHOST];
  if (card.id === 'ult-control') return [ROOT_GHOST, powers[2]];
  return [MARK_GHOST, ROOT_GHOST];
}

/**
 * Sinergias que resolveReaction e as três cartas oficiais realmente fecham.
 * O Z entra no estado; a tela não compara elemento por conta própria.
 */
/**
 * Combo que o painel mostra parado: duas teclas diferentes, de preferência Q e depois E.
 * O mesmo golpe duas vezes (Congelamento no Q) não cabe na janela, porque a recarga é maior.
 */
export function pickComboRecipe<T extends { slots: number[] }>(rows: readonly T[]): T | null {
  const playable = rows.filter((row) => row.slots.length === 2 && row.slots[0] !== row.slots[1]);
  const score = (row: T) => {
    const [a, b] = row.slots;
    if (a === 0 && b === 1) return 0;
    if (a === 0 && b === 3) return 1;
    if (a === 1 && b === 3) return 2;
    if (a === 1 && b === 0) return 3;
    if (a === 3 && b === 0) return 4;
    if (a === 2 || b === 2) return 8;
    return 5;
  };
  return playable.slice().sort((a, b) => score(a) - score(b))[0] ?? null;
}

export function listSynergies(charId: string, secondary: string | null): SynergyRow[] {
  const powers = kitOf(charId).powers;
  const extra = studioOf(secondary);
  const rows: SynergyRow[] = [];
  const official = new Set<string>();

  for (const card of kitSynergies(charId)) {
    official.add(card.id);
    const pair = iconsFor(card, powers);
    rows.push({
      id: card.id,
      name: card.name,
      effect: card.result,
      benefit: card.result,
      need: card.need,
      order: card.order,
      state: card.inKit ? 'active' : 'locked',
      slots: card.slots.slice(),
      ends: [pair[0].name, pair[1].name],
      powers: pair,
    });
  }

  const consider = (hit: Reaction | null, a: PowerDef, b: PowerDef, sa: number, sb: number, equipped: boolean) => {
    if (!hit) return;
    const state: SynergyState = equipped ? 'active' : 'possible';
    const found = rows.find((row) => row.id === hit.id);
    if (!found) {
      rows.push({
        id: hit.id,
        name: hit.name,
        effect: effectOf(hit),
        benefit: effectOf(hit),
        need: needOf(hit),
        order: `${a.name}, depois ${b.name}`,
        state,
        slots: [sa, sb],
        ends: [a.name, b.name],
        powers: [a, b],
      });
      return;
    }
    if (RANK[state] <= RANK[found.state]) return;
    found.state = state;
    found.slots = [sa, sb];
    found.ends = [a.name, b.name];
    found.powers = [a, b];
    if (!official.has(hit.id)) {
      found.order = `${a.name}, depois ${b.name}`;
      found.effect = effectOf(hit);
      found.benefit = effectOf(hit);
      found.need = needOf(hit);
    }
  };

  // A carta oficial só fica "ativa" se o combate REALMENTE resolve esse combo com aqueles poderes.
  // (Antes a tela prometia "Descarga" em kits onde o jogo resolvia Estilhaçar no lugar.)
  for (const row of rows) {
    if (!official.has(row.id) || row.state !== 'active' || row.slots.length !== 2) continue;
    const [a0, b0] = row.slots;
    if (a0 >= 0 && b0 >= 0 && reactionBetween(charId, powers[a0], a0, powers[b0], b0)?.id === row.id) continue;
    let fixed = false;
    for (let i = 0; i < powers.length && !fixed; i++)
      for (let j = 0; j < powers.length && !fixed; j++) {
        if (i === j || reactionBetween(charId, powers[i], i, powers[j], j)?.id !== row.id) continue;
        row.slots = [i, j];
        row.ends = [powers[i].name, powers[j].name];
        row.powers = [powers[i], powers[j]];
        row.order = `${powers[i].name}, depois ${powers[j].name}`;
        fixed = true;
      }
    if (!fixed) {
      const real = a0 >= 0 && b0 >= 0 ? reactionBetween(charId, powers[a0], a0, powers[b0], b0) : null;
      row.state = 'locked';
      row.slots = [];
      if (real) row.need = `${row.need} · com estes poderes sai ${real.name}`;
    }
  }

  for (let i = 0; i < powers.length; i++) {
    for (let j = 0; j < powers.length; j++) {
      const hit = reactionBetween(charId, powers[i], i, powers[j], j);
      // o mesmo poder duas vezes só conta para o Congelamento (Água molha, Água de novo congela)
      if (i === j && hit?.id !== 'freeze') continue;
      consider(hit, powers[i], powers[j], i, j, true);
    }
  }
  if (extra) {
    for (let i = 0; i < powers.length; i++) {
      consider(reactionBetween(charId, powers[i], i, extra, -1), powers[i], extra, i, -1, true);
      consider(reactionBetween(charId, extra, -1, powers[i], i), extra, powers[i], -1, i, true);
    }
    if (extra.trick === 'collapse') {
      rows.push({
        id: 'colapso',
        name: 'Colapso Elemental',
        effect: 'explosão dos elementos que você equipou',
        benefit: 'explosão dos elementos que você equipou',
        need: 'dois acertos de elementos diferentes, ainda na janela de 1,5 s',
        order: 'dois golpes de elementos diferentes, depois Colapso Elemental',
        state: 'active',
        slots: [-1, 0],
        ends: [extra.name, powers[0].name],
        powers: [extra, powers[0]],
      });
    }
    if (extra.trick === 'glacial') {
      const water = powers.find((pw) => pw.element === 'ice') ?? powers[0];
      rows.push({
        id: 'abyss',
        name: 'Prisão Abissal',
        effect: 'zona que segura o passo e soma 6',
        benefit: 'zona que segura o passo e soma 6',
        need: 'alvo lento pela Prisão Glacial, sem estar molhado',
        order: `${extra.name}, depois ${water.name}`,
        state: 'active',
        slots: [-1, powers.indexOf(water)],
        ends: [extra.name, water.name],
        powers: [extra, water],
      });
    }
    if (extra.trick === 'volcano' || extra.trick === 'lance') {
      rows.push({
        id: 'magma-wall',
        name: 'Ruptura Magmática',
        effect: 'explosão curta na estrutura, uma vez',
        benefit: 'explosão curta na estrutura, uma vez',
        need: 'fogo acerta muralha ou raiz ainda de pé',
        order: 'muralha ou raízes, depois o fogo',
        state: 'active',
        slots: [-1, 0],
        ends: [extra.name, powers[0].name],
        powers: [extra, powers[0]],
      });
    }
    if (extra.trick === 'gale' || extra.trick === 'updraft') {
      rows.push({
        id: 'shards-wall',
        name: 'Tempestade de Fragmentos',
        effect: 'fragmentos na direção do vento, uma vez',
        benefit: 'fragmentos na direção do vento, uma vez',
        need: 'vento na direção de rochas ou muralha',
        order: 'rochas ou muralha, depois o vento',
        state: 'active',
        slots: [-1, 0],
        ends: [extra.name, powers[0].name],
        powers: [extra, powers[0]],
      });
    }
  }

  if (!rows.some((row) => row.id === 'chill')) {
    const ice = powers.findIndex((pw) => auraAfter(pw).frozen);
    const plasma = STUDIO.find((row) => row.id === 'plasma');
    if (ice >= 0 && plasma) {
      const hit = reactionBetween(charId, powers[ice], ice, plasma, -1);
      if (hit) {
        rows.push({
          id: hit.id,
          name: hit.name,
          effect: `soma ${hit.bonus}`,
          benefit: `soma ${hit.bonus}`,
          need: needOf(hit),
          order: `${powers[ice].name}, depois ${plasma.name}`,
          state: 'possible',
          slots: [ice],
          ends: [powers[ice].name, plasma.name],
          powers: [powers[ice], plasma],
        });
      }
    }
  }
  return rows;
}

export interface SwapDelta {
  removed: string;
  added: string;
  key: string;
  gained: string[];
  lost: string[];
  limit: string;
}

/** O que muda no Z. Não grava o equipamento. */
export function swapDelta(charId: string, prev: string | null, next: string | null): SwapDelta {
  const before = listSynergies(charId, prev);
  const after = listSynergies(charId, next);
  const ids = new Set([...before.map((row) => row.id), ...after.map((row) => row.id)]);
  const gained: string[] = [];
  const lost: string[] = [];
  for (const id of ids) {
    const was = before.find((row) => row.id === id);
    const now = after.find((row) => row.id === id);
    const name = now?.name ?? was?.name ?? id;
    const from = was ? RANK[was.state] : 0;
    const to = now ? RANK[now.state] : 0;
    if (to > from && now && (now.state === 'active' || now.state === 'possible')) gained.push(name);
    if (from > to && was && was.state === 'active') lost.push(name);
  }
  return {
    removed: prev ? (studioOf(prev)?.name ?? prev) : 'vazio',
    added: next ? (studioOf(next)?.name ?? next) : 'vazio',
    key: 'Z',
    gained,
    lost,
    limit: 'Q, E, F e R não trocam. Só o Z aceita um extra.',
  };
}
