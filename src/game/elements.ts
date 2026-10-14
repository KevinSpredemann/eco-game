// Poderes elementais do X1 e do 2x2. Os dois modos usam só estes golpes.
// Cada golpe deixa uma marca curta. O próximo elemento lê a marca ANTES de gravar a sua.

export type Element = 'fire' | 'ice' | 'lightning' | 'wind' | 'nature' | 'shadow' | 'plasma';

export interface Aura {
  burn: number;
  frozen: number;
  gust: number;
  shock: number;
  /** raiz ainda ativa. Ausente vale zero. */
  root?: number;
}

export type PowerCategory = 'attack' | 'defense' | 'mobility' | 'control' | 'support';

export interface PowerDef {
  name: string;
  element: Element;
  cd: number;
  dmg: number;
  range: number;
  /** 0 = explosão instantânea no ponto mirado */
  speed: number;
  radius: number;
  category?: PowerCategory;
  /** segundos de preparo. 0 ou ausente: sai na hora. */
  windup?: number;
  /** só atravessa parede se estiver marcado. O padrão para na parede. */
  pass?: boolean;
  /** área instantânea ignora parede se for false. O padrão respeita a linha de visão. */
  los?: boolean;
  /** o projétil vira na direção do inimigo. Some se ele cair. */
  home?: boolean;
  /** dash, blink, decoy e zone saem no lugar do projétil ou da área. */
  act?: 'dash' | 'blink' | 'decoy' | 'zone';
  /** zone de cura. O campo dmg é o quanto cura por pulso. */
  zone?: 'heal';
  /** distância do piscar, em unidades do mapa. */
  step?: number;
  /** depois do acerto, abre um bosque que cura quem não é inimigo. */
  grove?: 'heal';
}

export const CATEGORY_PT: Record<PowerCategory, string> = {
  attack: 'Ataque',
  defense: 'Defesa',
  mobility: 'Mobilidade',
  control: 'Controle',
  support: 'Suporte',
};

export function powerCategory(pw: PowerDef): PowerCategory {
  return pw.category ?? (pw.speed <= 0 ? 'control' : 'attack');
}

/** Números reais do golpe: dano, alcance e recarga nas unidades do mapa. */
export function describePower(pw: PowerDef, key: string, cost: number): string {
  const act = pw.act ?? (pw.speed <= 0 ? 'aoe' : 'shot');
  const kind =
    act === 'dash'
      ? `arrancada de até ${pw.range}, para na parede, até ${pw.dmg} se encostar`
      : act === 'blink'
        ? `pisca até ${pw.step ?? pw.range} e para na parede, até ${pw.dmg} se cair em cima`
        : act === 'decoy'
          ? `ilusão que segura um tiro e estoura ${pw.dmg}`
          : act === 'zone' && pw.zone === 'heal'
            ? `bosque, raio ${pw.radius}, cura ${pw.dmg} por pulso`
            : pw.speed <= 0
              ? `área, raio ${pw.radius}`
              : `projétil, velocidade ${pw.speed}, primeiro inimigo${pw.home ? ', teleguiado' : ''}`;
  const wall = pw.pass ? 'atravessa paredes' : 'para na parede';
  const prep = pw.windup ? `, preparo ${pw.windup}s` : '';
  const hit = act === 'zone' && pw.zone === 'heal' ? `cura ${pw.dmg}` : `dano ${pw.dmg}`;
  return `${key} ${pw.name}: ${hit}, alcance ${pw.range}, recarga ${pw.cd}s, energia ${cost}, ${CATEGORY_PT[powerCategory(pw)]}, ${kind}, ${wall}${prep}.`;
}

export type PassiveId =
  | 'knock'
  | 'refund'
  | 'wall'
  | 'hunter'
  | 'pyro'
  | 'stun'
  | 'speed'
  | 'tick'
  | 'heal'
  | 'stunhunt'
  | 'shatter'
  | 'chain'
  | 'steam'
  | 'haste'
  | 'gustslow'
  | 'plasma'
  | 'nature'
  | 'shadow';

export interface Kit {
  powers: [PowerDef, PowerDef, PowerDef, PowerDef];
  passive: PassiveId;
  passiveName: string;
  passiveDesc: string;
}

export interface Combo {
  id: 'shatter' | 'steam' | 'cinder' | 'storm' | 'arc' | 'thermal' | 'chill';
  name: string;
  bonus: number;
  clearFrozen?: boolean;
  aoe?: number;
}

export const BURN_TIME = 3;
export const FROZEN_TIME = 2.4;
export const MARK_TIME = 3.2;
export const BURN_TICK = 0.5;
export const WALL_REACH = 46;
export const WALL_STUN = 0.7;
export const WALL_BONUS = 6;

/** energia da partida (X1 e 2x2). Começa cheia e volta sozinha. */
export const ENERGY_MAX = 100;
export const ENERGY_REGEN = 14;
/** custo de Q, E, R e F. O projétil gasta ao sair; a área só gasta se acertar alguém. */
export const SLOT_COST = [18, 24, 30, 16] as const;

/**
 * Rajada de Plasma: um projétil médio, recarga curta, marca de 4 s.
 * O próximo poder do kit no alvo marcado gasta a marca e soma uma explosão limitada.
 * Sozinho, o projétil continua valendo. A marca que acaba não explode.
 */
export const PLASMA = {
  id: 'plasma',
  name: 'Rajada de Plasma',
  cd: 2.8,
  cost: 22,
  dmg: 12,
  range: 260,
  speed: 680,
  radius: 16,
  mark: 4,
  burst: 10,
  /** teto do golpe do kit + a explosão (a marca some mesmo se o teto já estiver cheio) */
  cap: 22,
} as const;
export const PLASMA_COLOR = '#c86bff';

/**
 * Ataque básico do X1 e do 2x2. Não é arma, não marca elemento e não gasta a marca de plasma.
 * Curto, dano modesto, recarga e energia próprias.
 */
export const BASIC = {
  name: 'Ataque básico',
  dmg: 6,
  range: 200,
  speed: 840,
  radius: 12,
  cd: 0.55,
  cost: 8,
} as const;

/** teto dos bônus novos (emboscada, embalo, raiz) num mesmo golpe. Os combos antigos ficam como estão. */
export const EXTRA_CAP = 14;
export const FLOW_TIME = 1.5;
export const FLOW_BONUS = 4;
export const AMBUSH_TIME = 2;
export const AMBUSH_BONUS = 8;
export const ROOT_TIME = 1.3;
export const ROOT_RESIST = 2.4;
export const ROOT_AOE_BONUS = 6;
export const HEAL_ZONE_TIME = 2.4;
export const BLINK_STEP = 100;

const BASE: Omit<PowerDef, 'name' | 'element'>[] = [
  { cd: 3.2, dmg: 10, range: 280, speed: 720, radius: 16 },
  { cd: 4.8, dmg: 9, range: 160, speed: 0, radius: 88 },
  { cd: 6.4, dmg: 14, range: 320, speed: 640, radius: 18 },
  { cd: 3.6, dmg: 8, range: 240, speed: 680, radius: 16 },
];

function kit(els: [Element, Element, Element, Element], names: [string, string, string, string], passive: PassiveId, passiveName: string, passiveDesc: string): Kit {
  return {
    powers: BASE.map((b, i) => ({ ...b, name: names[i], element: els[i] })) as Kit['powers'],
    passive,
    passiveName,
    passiveDesc,
  };
}

/** Q, E, R, F — os quatro elementos, para qualquer um conseguir combo. */
export const KITS: Record<string, Kit> = {
  kael: kit(['wind', 'ice', 'lightning', 'fire'], ['Rajada', 'Orvalho', 'Faísca', 'Brasa'], 'knock', 'Corrente de ar', 'O vento empurra mais forte.'),
  luna: kit(['lightning', 'ice', 'fire', 'wind'], ['Faísca', 'Orvalho', 'Labareda', 'Rajada'], 'refund', 'Improviso', 'Um combo devolve um pouco da recarga.'),
  bruno: kit(['wind', 'fire', 'ice', 'lightning'], ['Rajada', 'Labareda', 'Geada', 'Faísca'], 'wall', 'Leitura do mapa', 'Pancada na parede atordoa por mais tempo.'),
  zoe: kit(['ice', 'wind', 'fire', 'lightning'], ['Geada', 'Rajada', 'Labareda', 'Faísca'], 'hunter', 'Caça ao lento', 'Golpeia mais forte quem está congelado.'),
  maya: kit(['fire', 'wind', 'ice', 'lightning'], ['Labareda', 'Sopro Quente', 'Geada', 'Faísca'], 'pyro', 'Maga do fogo', 'Causa dano extra em quem já está queimando.'),
  zed: kit(['lightning', 'ice', 'wind', 'fire'], ['Sobrecarga', 'Geada', 'Rajada', 'Brasa'], 'stun', 'Sobrecarga', 'O raio deixa tonto por mais tempo.'),
  nyx: kit(['ice', 'lightning', 'wind', 'fire'], ['Gelo Sombrio', 'Corte Relâmpago', 'Rajada', 'Fagulha'], 'speed', 'Passo do combo', 'Cada combo deixa ela mais rápida.'),
  rex: kit(['fire', 'lightning', 'wind', 'ice'], ['Fornalha', 'Faísca', 'Rajada', 'Geada'], 'tick', 'Fornalha', 'A queimadura dele dói mais.'),
  iris: kit(['ice', 'wind', 'lightning', 'fire'], ['Geada', 'Brisa', 'Faísca', 'Brasa'], 'heal', 'Alívio', 'Cada combo cura um pouco.'),
  tara: kit(['wind', 'lightning', 'fire', 'ice'], ['Rajada', 'Faísca', 'Labareda', 'Geada'], 'stunhunt', 'Quebra-guarda', 'Golpeia mais forte quem está tonto.'),
  kai: kit(['ice', 'lightning', 'fire', 'wind'], ['Geada', 'Estilhaço', 'Labareda', 'Rajada'], 'shatter', 'Gelo profundo', 'Estilhaçar causa mais dano.'),
  leo: kit(['lightning', 'wind', 'ice', 'fire'], ['Descarga', 'Vendaval', 'Geada', 'Brasa'], 'chain', 'Condutor', 'Tempestade causa mais dano.'),
  mei: kit(['fire', 'ice', 'wind', 'lightning'], ['Caldeira', 'Geada', 'Vapor', 'Faísca'], 'steam', 'Pressão', 'A explosão de vapor alcança mais longe.'),
  duda: kit(['lightning', 'fire', 'wind', 'ice'], ['Centelha', 'Faísca', 'Rajada', 'Geada'], 'haste', 'Oficina', 'As recargas dos poderes são mais curtas.'),
  bento: kit(['wind', 'fire', 'lightning', 'ice'], ['Rajada', 'Brasa', 'Faísca', 'Orvalho'], 'gustslow', 'Vento frio', 'O vento também deixa lento.'),
  vortex: {
    powers: [
      { name: 'Disparo de Plasma', element: 'plasma', cd: 3.4, dmg: 11, range: 260, speed: 780, radius: 14, category: 'attack' },
      { name: 'Onda de Plasma', element: 'plasma', cd: 5, dmg: 9, range: 140, speed: 0, radius: 80, category: 'control' },
      { name: 'Colapso Vortex', element: 'plasma', cd: 8, dmg: 16, range: 180, speed: 0, radius: 110, category: 'attack', windup: 0.55 },
      { name: 'Impulso Vetorial', element: 'plasma', cd: 4.5, dmg: 6, range: 120, speed: 0, radius: 22, category: 'mobility', act: 'dash' },
    ],
    passive: 'plasma',
    passiveName: 'Núcleo instável',
    passiveDesc: 'O plasma empurra e o colapso precisa de preparo.',
  },
  nara: {
    powers: [
      { name: 'Semente', element: 'nature', cd: 3.6, dmg: 8, range: 240, speed: 520, radius: 14, category: 'attack', home: true },
      { name: 'Raízes', element: 'nature', cd: 5.2, dmg: 6, range: 140, speed: 0, radius: 78, category: 'control' },
      { name: 'Broto', element: 'nature', cd: 7.5, dmg: 12, range: 180, speed: 0, radius: 64, category: 'attack', grove: 'heal' },
      { name: 'Bosque', element: 'nature', cd: 6, dmg: 6, range: 160, speed: 0, radius: 72, category: 'support', act: 'zone', zone: 'heal' },
    ],
    passive: 'nature',
    passiveName: 'Seiva',
    passiveDesc: 'Raiz segura no lugar. O bosque cura aos poucos.',
  },
  vexa: {
    powers: [
      { name: 'Corte', element: 'shadow', cd: 3.2, dmg: 9, range: 220, speed: 740, radius: 14, category: 'attack' },
      { name: 'Passo Sombrio', element: 'shadow', cd: 4.2, dmg: 6, range: 100, speed: 0, radius: 28, category: 'mobility', act: 'blink', step: BLINK_STEP },
      { name: 'Emboscada', element: 'shadow', cd: 7, dmg: 12, range: 200, speed: 700, radius: 14, category: 'attack' },
      { name: 'Ilusão', element: 'shadow', cd: 6, dmg: 6, range: 70, speed: 0, radius: 18, category: 'defense', act: 'decoy' },
    ],
    passive: 'shadow',
    passiveName: 'Tocaia',
    passiveDesc: 'O piscar prepara a emboscada. A ilusão segura um tiro.',
  },
};

export function kitOf(id: string): Kit {
  return KITS[id] ?? KITS.kael;
}

export const ELEMENT_NAME: Record<Element, string> = {
  fire: 'Fogo',
  ice: 'Gelo',
  lightning: 'Raio',
  wind: 'Vento',
  nature: 'Natureza',
  shadow: 'Sombra',
  plasma: 'Plasma',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a59',
  ice: '#9fe8ff',
  lightning: '#ffe14a',
  wind: '#7dffe0',
  nature: '#3dcc6a',
  shadow: '#8a7cff',
  plasma: PLASMA_COLOR,
};

export const ELEMENT_FX: Record<Element, string> = {
  fire: 'queima por alguns segundos',
  ice: 'deixa lento',
  lightning: 'deixa tonto',
  wind: 'empurra para trás',
  nature: 'enraíza por um instante',
  shadow: 'não marca o alvo; o piscar prepara a emboscada',
  plasma: 'empurra com a onda',
};

/** arma só para a cor do projétil; o efeito real vem do elemento */
export const VISUAL_WEAPON: Record<Element, 'estelar' | 'cristal' | 'choque' | 'pulsador'> = {
  fire: 'estelar',
  ice: 'cristal',
  lightning: 'choque',
  wind: 'pulsador',
  nature: 'cristal',
  shadow: 'choque',
  plasma: 'pulsador',
};

export const KNOCK: Record<Element, number> = { wind: 260, fire: 40, ice: 20, lightning: 30, nature: 20, shadow: 10, plasma: 150 };

const EMPTY: Aura = { burn: 0, frozen: 0, gust: 0, shock: 0 };

/** Um combo de sequência por golpe. A pancada na parede é à parte. */
export function comboOf(aura: Aura, next: Element): Combo | null {
  if (aura.frozen > 0 && next === 'lightning') return { id: 'shatter', name: 'Estilhaçar', bonus: 16, clearFrozen: true };
  if (aura.frozen > 0 && next === 'fire') return { id: 'steam', name: 'Vapor', bonus: 14, clearFrozen: true, aoe: 72 };
  if (aura.burn > 0 && next === 'wind') return { id: 'cinder', name: 'Brasas', bonus: 10 };
  if (aura.gust > 0 && next === 'lightning') return { id: 'storm', name: 'Tempestade', bonus: 12 };
  if (aura.shock > 0 && next === 'fire') return { id: 'arc', name: 'Arco-chama', bonus: 10 };
  if (aura.burn > 0 && next === 'ice') return { id: 'thermal', name: 'Choque térmico', bonus: 8 };
  if (aura.frozen > 0 && next === 'plasma') return { id: 'chill', name: 'Plasma lento', bonus: 8 };
  return null;
}

export function tuneCombo(charId: string, combo: Combo | null): Combo | null {
  if (!combo) return null;
  const c = { ...combo };
  if (charId === 'kai' && c.id === 'shatter') c.bonus += 8;
  if (charId === 'leo' && c.id === 'storm') c.bonus += 6;
  if (charId === 'mei' && c.id === 'steam') c.aoe = (c.aoe ?? 0) + 36;
  return c;
}

/** O ponto um pouco à frente do alvo, no sentido do empurrão, está bloqueado? */
export function wallSlam(ax: number, ay: number, tx: number, ty: number, reach: number, blocked: (x: number, y: number) => boolean): boolean {
  const dx = tx - ax;
  const dy = ty - ay;
  const d = Math.hypot(dx, dy) || 1;
  return blocked(tx + (dx / d) * reach, ty + (dy / d) * reach);
}

export function bonusDamage(charId: string, aura: Aura, stunned: boolean): number {
  let n = 0;
  if (charId === 'maya' && aura.burn > 0) n += 6;
  if (charId === 'zoe' && aura.frozen > 0) n += 6;
  if (charId === 'tara' && stunned) n += 6;
  return n;
}

export function speedMul(charId: string, stacks: number): number {
  if (charId !== 'nyx') return 1;
  return 1 + Math.min(4, Math.max(0, stacks)) * 0.08;
}

export function cooldownOf(charId: string, base: number): number {
  return charId === 'duda' ? base * 0.88 : base;
}

export function burnDpsOf(charId: string): number {
  return charId === 'rex' ? 5 : 3.5;
}

export function stunTime(charId: string): number {
  return charId === 'zed' ? 0.62 : 0.42;
}

export function knockMul(charId: string): number {
  return charId === 'kael' ? 1.28 : 1;
}

export function gustSlow(charId: string): number {
  return charId === 'bento' ? 1.1 : 0;
}

export function refundOnCombo(charId: string): number {
  return charId === 'luna' ? 0.9 : 0;
}

export function healOnCombo(charId: string): number {
  return charId === 'iris' ? 6 : 0;
}

export function wallStun(charId: string): number {
  return WALL_STUN + (charId === 'bruno' ? 0.35 : 0);
}

function inRange(p: PowerDef, dist: number): boolean {
  return p.speed <= 0 ? dist < p.radius + 20 : dist < p.range;
}

function slotOf(kitDef: Kit, cds: number[], el: Element, dist: number): number | null {
  for (let i = 0; i < 4; i++) {
    const p = kitDef.powers[i];
    if (p.element === el && cds[i] <= 0 && inRange(p, dist)) return i;
  }
  return null;
}

/**
 * Escolha fixa, sem sorteio: fecha o combo que já está armado.
 * Gelo + raio, gelo + fogo, vento na parede, queimadura + vento, vento + raio, senão prepara o gelo.
 */
export function botPower(kitDef: Kit, cds: number[], mark: Aura, dist: number, nearWall: boolean): number | null {
  const aura = mark ?? EMPTY;
  if (aura.frozen > 0) {
    const lightning = slotOf(kitDef, cds, 'lightning', dist);
    if (lightning !== null) return lightning;
    const fire = slotOf(kitDef, cds, 'fire', dist);
    if (fire !== null) return fire;
    const plasma = slotOf(kitDef, cds, 'plasma', dist);
    if (plasma !== null) return plasma;
  }
  if ((aura.root ?? 0) > 0) {
    for (let i = 0; i < 4; i++) {
      const p = kitDef.powers[i];
      if (cds[i] <= 0 && p.speed <= 0 && p.act !== 'zone' && inRange(p, dist)) return i;
    }
  }
  if (nearWall) {
    const wind = slotOf(kitDef, cds, 'wind', dist);
    if (wind !== null) return wind;
  }
  if (aura.burn > 0) {
    const wind = slotOf(kitDef, cds, 'wind', dist);
    if (wind !== null) return wind;
  }
  if (aura.gust > 0) {
    const lightning = slotOf(kitDef, cds, 'lightning', dist);
    if (lightning !== null) return lightning;
  }
  if (aura.burn <= 0 && aura.frozen <= 0) {
    const ice = slotOf(kitDef, cds, 'ice', dist);
    if (ice !== null) return ice;
  }
  let best: number | null = null;
  let cd = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = kitDef.powers[i];
    if (cds[i] > 0 || !inRange(p, dist)) continue;
    if (p.cd < cd) {
      cd = p.cd;
      best = i;
    }
  }
  return best;
}

/** Q W R E: o R é a ultimate (espaço 3 da lista é o E). */
export const SLOT_LABEL = ['Q', 'W', 'R', 'E'] as const;

/** Q E R F, e o F do notebook (item) cai no mesmo poder. */
export function powerSlotIndex(slot: string): number | null {
  if (slot === 'ability') return 0;
  if (slot === 'skill') return 1;
  if (slot === 'ult') return 2;
  if (slot === 'bonus' || slot === 'item') return 3;
  return null;
}

/**
 * Recusa o uso sem mexer na recarga nem na energia.
 * Projétil (speed > 0): se o golpe sai, gasta os dois mesmo errando o alvo.
 * Área instantânea (speed === 0): sem inimigo no círculo, não gasta nada.
 */
export function denyPowerCast(slot: string, cd: readonly number[], energy: number = ENERGY_MAX): string | null {
  const i = powerSlotIndex(slot);
  if (i === null) return null;
  if ((cd[i] ?? 0) > 0) return 'Habilidade em recarga';
  if (energy < SLOT_COST[i]) return 'Energia insuficiente';
  return null;
}

/** X ainda não entrou nesta partida (bloqueada ou o servidor tirou do equipamento). */
export function denyPlasma(on: boolean, cd: number, energy: number): string | null {
  if (!on) return 'Habilidade ainda não desbloqueada';
  if (cd > 0) return 'Habilidade em recarga';
  if (energy < PLASMA.cost) return 'Energia insuficiente';
  return null;
}

/** Combo que já está armado num rival e cabe num poder pronto. */
export function comboReady(charId: string, cds: readonly number[], foes: readonly Aura[], labels: readonly string[] = SLOT_LABEL): { slot: number; key: string; name: string } | null {
  const kitDef = kitOf(charId);
  for (const aura of foes) {
    for (let i = 0; i < 4; i++) {
      if ((cds[i] ?? 0) > 0) continue;
      const combo = tuneCombo(charId, comboOf(aura, kitDef.powers[i].element));
      if (combo) return { slot: i, key: labels[i] ?? SLOT_LABEL[i], name: combo.name };
    }
  }
  return null;
}
