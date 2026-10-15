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
  marked?: number;
  field?: number;
  fieldEl?: Element | '';
  stun?: number;
  /** alvo controlado agora ou há pouco (janela dos combos de controle) */
  ctrl?: number;
  /** disparo de plasma recente. A onda do kit consome uma vez. */
  plasma?: number;
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
  /** segurar cresce dano, alcance e raio. Soltar usa a carga real. Ausente = golpe cheio. */
  charge?: boolean;
  /** só atravessa parede se estiver marcado. O padrão para na parede. */
  pass?: boolean;
  /** área instantânea ignora parede se for false. O padrão respeita a linha de visão. */
  los?: boolean;
  /** o projétil vira na direção do inimigo. Some se ele cair. */
  home?: boolean;
  /** dash, blink, decoy, zone e wall saem no lugar do projétil ou da área. */
  act?: 'dash' | 'blink' | 'decoy' | 'zone' | 'wall';
  /** zone de cura. O campo dmg é o quanto cura por pulso. */
  zone?: 'heal';
  /** distância do piscar, em unidades do mapa. */
  step?: number;
  /** depois do acerto, abre um bosque que cura quem não é inimigo. */
  grove?: 'heal';
  /** o piscar deixa uma ilusão no ponto de saída. */
  ghost?: boolean;
  /** área puxa o alvo esses pixels na direção de quem usou. */
  yank?: number;
  /** marca de sinergia. Não enraíza neste golpe. */
  mark?: boolean;
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
/**
 * Vida de referência do duelo. As faixas são percentuais dessa vida:
 * golpe leve 5–12%, forte ou área 10–18%, ultimate 20–30%.
 */
export const REF_HP = 150;
export type DamageBand = 'basic' | 'strong' | 'ult' | 'touch';

export function damageBand(kind: Exclude<DamageBand, 'touch'>): { min: number; max: number } {
  if (kind === 'ult') return { min: Math.round(REF_HP * 0.2), max: Math.round(REF_HP * 0.3) };
  if (kind === 'strong') return { min: Math.round(REF_HP * 0.1), max: Math.round(REF_HP * 0.18) };
  return { min: Math.round(REF_HP * 0.05), max: Math.round(REF_HP * 0.12) };
}

/** Papel do golpe no kit. O espaço 2 (R) é a ultimate. Mobilidade e cura ficam no valor escrito. */
export function powerBand(pw: PowerDef, slot?: number): DamageBand {
  if (slot === 2) return 'ult';
  if (pw.act === 'dash' || pw.act === 'blink' || pw.act === 'decoy' || pw.act === 'wall' || pw.zone === 'heal') return 'touch';
  if (pw.speed <= 0) return 'strong';
  return 'basic';
}

/** Dano que o combate aplica e que o texto mostra. Fora do kit (extra) fica o valor escrito. */
export function resolvedDamage(pw: PowerDef, slot?: number): number {
  if (slot === undefined || slot < 0 || slot > 3) return pw.dmg;
  const kind = powerBand(pw, slot);
  if (kind === 'touch') return pw.dmg;
  const band = damageBand(kind);
  return Math.min(band.max, Math.max(band.min, pw.dmg));
}

export function describePower(pw: PowerDef, key: string, cost: number, slot?: number): string {
  const dmg = resolvedDamage(pw, slot);
  const act = pw.act ?? (pw.speed <= 0 ? 'aoe' : 'shot');
  const kind =
    act === 'dash'
      ? `arrancada de até ${pw.range}, para na parede, até ${dmg} se encostar`
      : act === 'blink'
        ? `pisca até ${pw.step ?? pw.range} e para na parede${pw.ghost ? ', deixa uma ilusão no ponto de saída' : ''}, até ${dmg} se cair em cima`
        : act === 'wall'
          ? `muralha de 3,2 s que bloqueia tiro e movimento, e deixa lento no raio ${pw.radius}`
          : act === 'decoy'
          ? `ilusão que segura um tiro e estoura ${dmg}`
          : act === 'zone' && pw.zone === 'heal'
            ? `bosque, raio ${pw.radius}, cura ${dmg} por pulso`
            : pw.speed <= 0
              ? `área, raio ${pw.radius}`
              : `projétil, velocidade ${pw.speed}, primeiro inimigo${pw.home ? ', teleguiado' : ''}`;
  const wall = pw.pass ? 'atravessa paredes' : 'para na parede';
  const prep = pw.charge || pw.windup ? `, segura para carregar${pw.windup ? ` (até ${pw.windup}s)` : ''}` : '';
  const marked = pw.mark ? ', marca o alvo em vez de enraizar' : '';
  const hit = act === 'zone' && pw.zone === 'heal' ? `cura ${dmg}` : `dano ${dmg}`;
  const yank = pw.yank ? `, puxa ${pw.yank}` : '';
  const price = slot === 2 ? 'carga da ultimate' : `energia ${cost}`;
  return `${key} ${pw.name}: ${hit}, alcance ${pw.range}, recarga ${pw.cd}s, ${price}, ${CATEGORY_PT[powerCategory(pw)]}, ${kind}, ${wall}${prep}${yank}${marked}.`;
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
  id: 'shatter' | 'steam' | 'cinder' | 'storm' | 'arc' | 'thermal' | 'chill' | 'freeze' | 'vortex';
  name: string;
  bonus: number;
  clearFrozen?: boolean;
  aoe?: number;
  /** congela: segura o alvo parado por estes segundos */
  hold?: number;
  /** puxa os inimigos deste raio para o alvo */
  pull?: number;
  /** espalha a queimadura para quem está neste raio */
  spreadBurn?: number;
}

export const BURN_TIME = 3;
/**
 * Onde a suprema cai fica uma marca do elemento. Raio e duração no chão.
 * Fogo: zona que queima (pouco dano por tique). Água: onda que empurra e molha.
 * Terra: pilares que prendem. Ar: vórtice que puxa e no fim arremessa.
 */
export const ULT_LAND: Record<Element, { r: number; t: number; name: string; desc: string }> = {
  fire: { r: 92, t: 2.6, name: 'Colapso Solar', desc: 'Explode e deixa o chão em chamas por 2,6 s.' },
  ice: { r: 130, t: 1.0, name: 'Maré Abissal', desc: 'Uma onda empurra para fora e deixa molhado.' },
  nature: { r: 110, t: 1.4, name: 'Ruptura Titânica', desc: 'Pilares sobem do chão e prendem quem está na área.' },
  wind: { r: 140, t: 1.3, name: 'Tempestade do Vazio', desc: 'Um vórtice puxa para o centro e no fim arremessa.' },
  lightning: { r: 100, t: 0.8, name: 'Tempestade Elétrica', desc: 'Raios caem em volta e deixam tonto.' },
  shadow: { r: 80, t: 0.7, name: 'Eclipse', desc: 'A sombra explode no ponto do impacto.' },
  plasma: { r: 90, t: 0.8, name: 'Colapso de Plasma', desc: 'O plasma explode no ponto do impacto.' },
};
/** Ultimate: preparo mínimo (o rival vê o aviso no chão e pode reagir) */
export const ULT_WINDUP = 0.45;
/** dano de cada tique da zona de fogo da suprema (a cada 0,5 s) */
export const ULT_FIRE_TICK = 2;

/** Congelamento: tempo parado dentro do gelo. */
export const FREEZE_HOLD = 0.9;
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

/** Poder extra do espaço Z. O texto da ficha manda; o efeito usa o que o combate já sabe fazer. */
export interface StudioDef extends PowerDef {
  id: string;
  cost: number;
  /** partidas jogadas para liberar. 0 entra na conta nova. */
  unlockMatches: number;
  art: string;
}

export const STUDIO: StudioDef[] = [
  { id: 'plasma', name: PLASMA.name, element: 'plasma', cd: PLASMA.cd, dmg: PLASMA.dmg, range: PLASMA.range, speed: PLASMA.speed, radius: PLASMA.radius, cost: PLASMA.cost, unlockMatches: 1, art: '', category: 'attack' },
  { id: 'arpejo', name: 'Arpejo', element: 'wind', cd: 4.2, dmg: 8, range: 150, speed: 0, radius: 24, cost: 18, unlockMatches: 0, art: 'art/studio/powers/arpejo.webp', category: 'mobility', act: 'blink', step: 150 },
  { id: 'glissando', name: 'Glissando', element: 'wind', cd: 4, dmg: 6, range: 120, speed: 0, radius: 22, cost: 16, unlockMatches: 0, art: 'art/studio/powers/glissando.webp', category: 'mobility', act: 'blink', step: 120 },
  { id: 'fermata', name: 'Fermata', element: 'ice', cd: 5.5, dmg: 8, range: 140, speed: 0, radius: 70, cost: 22, unlockMatches: 0, art: 'art/studio/powers/fermata.webp', category: 'control' },
  { id: 'staccato', name: 'Staccato', element: 'lightning', cd: 3.2, dmg: 6, range: 220, speed: 900, radius: 12, cost: 16, unlockMatches: 1, art: 'art/studio/powers/staccato.webp', category: 'attack' },
  { id: 'crescendo', name: 'Crescendo', element: 'fire', cd: 4.8, dmg: 10, range: 150, speed: 0, radius: 22, cost: 20, unlockMatches: 2, art: 'art/studio/powers/crescendo.webp', category: 'attack', act: 'dash' },
  { id: 'ostinato', name: 'Ostinato', element: 'wind', cd: 5, dmg: 8, range: 150, speed: 0, radius: 88, cost: 20, unlockMatches: 3, art: 'art/studio/powers/ostinato.webp', category: 'control' },
  { id: 'prisma', name: 'Prisma de Eco', element: 'wind', cd: 6, dmg: 6, range: 70, speed: 0, radius: 18, cost: 18, unlockMatches: 4, art: 'art/studio/powers/prisma.webp', category: 'defense', act: 'decoy' },
  { id: 'reverso', name: 'Reverso Harmônico', element: 'ice', cd: 5.2, dmg: 8, range: 150, speed: 0, radius: 78, cost: 22, unlockMatches: 5, art: 'art/studio/powers/reverso.webp', category: 'control', yank: 70 },
];

export function studioOf(id: string | null | undefined): StudioDef | null {
  if (!id) return null;
  return STUDIO.find((s) => s.id === id) ?? null;
}

/**
 * Ataque básico do X1 e do 2x2. Não é arma, não marca elemento e não gasta a marca de plasma.
 * Curto, dano modesto, recarga e energia próprias.
 */
export const BASIC = {
  name: 'Ataque básico',
  /** 6% da vida (faixa leve 5–12%) */
  dmg: 9,
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

/** Geada era gelo; agora o elemento é Água: o golpe em linha vira jato, o de área vira onda. */
function waterName(name: string, i: number): string {
  if (name !== 'Geada' && name !== 'Gelo Sombrio') return name;
  if (name === 'Gelo Sombrio') return 'Água Sombria';
  return BASE[i].speed <= 0 ? 'Onda' : "Jato d'Água";
}

function kit(els: [Element, Element, Element, Element], names: [string, string, string, string], passive: PassiveId, passiveName: string, passiveDesc: string): Kit {
  return {
    powers: BASE.map((b, i) => ({ ...b, name: waterName(names[i], i), element: els[i] })) as Kit['powers'],
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
  zoe: kit(['ice', 'wind', 'fire', 'lightning'], ['Geada', 'Rajada', 'Labareda', 'Faísca'], 'hunter', 'Caça ao lento', 'Golpeia mais forte quem está molhado.'),
  maya: kit(['fire', 'wind', 'ice', 'lightning'], ['Labareda', 'Sopro Quente', 'Geada', 'Faísca'], 'pyro', 'Maga do fogo', 'Causa dano extra em quem já está queimando.'),
  zed: kit(['lightning', 'ice', 'wind', 'fire'], ['Sobrecarga', 'Geada', 'Rajada', 'Brasa'], 'stun', 'Sobrecarga', 'O raio deixa tonto por mais tempo.'),
  nyx: kit(['ice', 'lightning', 'wind', 'fire'], ['Gelo Sombrio', 'Corte Relâmpago', 'Rajada', 'Fagulha'], 'speed', 'Passo do combo', 'Cada combo deixa ela mais rápida.'),
  rex: kit(['fire', 'lightning', 'wind', 'ice'], ['Fornalha', 'Faísca', 'Rajada', 'Geada'], 'tick', 'Fornalha', 'A queimadura dele dói mais.'),
  iris: kit(['ice', 'wind', 'lightning', 'fire'], ['Geada', 'Brisa', 'Faísca', 'Brasa'], 'heal', 'Alívio', 'Cada combo cura um pouco.'),
  tara: kit(['wind', 'lightning', 'fire', 'ice'], ['Rajada', 'Faísca', 'Labareda', 'Geada'], 'stunhunt', 'Quebra-guarda', 'Golpeia mais forte quem está tonto.'),
  kai: kit(['ice', 'lightning', 'fire', 'wind'], ['Geada', 'Estilhaço', 'Labareda', 'Rajada'], 'shatter', 'Água profunda', 'Eletrocutar causa mais dano.'),
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
      { name: 'Semente', element: 'nature', cd: 3.6, dmg: 8, range: 240, speed: 520, radius: 14, category: 'attack', home: true, mark: true },
      { name: 'Raízes', element: 'nature', cd: 5.2, dmg: 6, range: 140, speed: 0, radius: 78, category: 'control' },
      { name: 'Broto', element: 'nature', cd: 7.5, dmg: 12, range: 180, speed: 0, radius: 64, category: 'attack', grove: 'heal', charge: true },
      { name: 'Bosque', element: 'nature', cd: 6, dmg: 6, range: 160, speed: 0, radius: 72, category: 'support', act: 'zone', zone: 'heal' },
    ],
    passive: 'nature',
    passiveName: 'Seiva',
    passiveDesc: 'Raiz segura no lugar. O bosque cura aos poucos.',
  },
  vexa: {
    powers: [
      { name: 'Corte', element: 'shadow', cd: 3.2, dmg: 9, range: 220, speed: 740, radius: 14, category: 'attack', mark: true },
      { name: 'Passo Sombrio', element: 'shadow', cd: 4.2, dmg: 6, range: 100, speed: 0, radius: 28, category: 'mobility', act: 'blink', step: BLINK_STEP },
      { name: 'Emboscada', element: 'shadow', cd: 7, dmg: 12, range: 200, speed: 700, radius: 14, category: 'attack' },
      { name: 'Ilusão', element: 'shadow', cd: 6, dmg: 6, range: 70, speed: 0, radius: 18, category: 'defense', act: 'decoy' },
    ],
    passive: 'shadow',
    passiveName: 'Tocaia',
    passiveDesc: 'O piscar prepara a emboscada. A ilusão segura um tiro.',
  },
  clave: {
    powers: [
      { name: 'Assinatura da Clave', element: 'ice', cd: 5.2, dmg: 6, range: 78, speed: 0, radius: 64, category: 'defense', act: 'wall' },
      { name: 'Brisa', element: 'wind', cd: 4.4, dmg: 8, range: 150, speed: 0, radius: 82, category: 'control' },
      { name: 'Estalo', element: 'lightning', cd: 6.4, dmg: 14, range: 300, speed: 620, radius: 16, category: 'attack' },
      { name: 'Brasa', element: 'fire', cd: 3.3, dmg: 8, range: 230, speed: 700, radius: 14, category: 'attack' },
    ],
    passive: 'wall',
    passiveName: 'Compasso firme',
    passiveDesc: 'A muralha segura tiro e movimento e deixa lento quem está perto.',
  },
  fuga: {
    powers: [
      { name: 'Entrada da Fuga', element: 'wind', cd: 4.6, dmg: 8, range: 140, speed: 0, radius: 28, category: 'mobility', act: 'blink', step: 140, ghost: true },
      { name: 'Centelha', element: 'fire', cd: 3.5, dmg: 9, range: 250, speed: 720, radius: 14, category: 'attack' },
      { name: 'Corte', element: 'lightning', cd: 6.6, dmg: 15, range: 300, speed: 640, radius: 16, category: 'attack' },
      { name: 'Orvalho', element: 'ice', cd: 4.8, dmg: 8, range: 150, speed: 0, radius: 80, category: 'control' },
    ],
    passive: 'speed',
    passiveName: 'Entrada',
    passiveDesc: 'O piscar para na parede e deixa uma ilusão no ponto de saída.',
  },
  lyra: {
    powers: [
      { name: 'Corda Harmônica', element: 'ice', cd: 3.4, dmg: 8, range: 270, speed: 680, radius: 14, category: 'control' },
      { name: 'Sopro', element: 'wind', cd: 4.7, dmg: 8, range: 150, speed: 0, radius: 84, category: 'control' },
      { name: 'Labareda', element: 'fire', cd: 6.2, dmg: 14, range: 290, speed: 640, radius: 16, category: 'attack' },
      { name: 'Faísca', element: 'lightning', cd: 3.6, dmg: 9, range: 240, speed: 760, radius: 14, category: 'attack' },
    ],
    passive: 'hunter',
    passiveName: 'Cordas',
    passiveDesc: 'A água da corda deixa lento. O tiro para na parede.',
  },
  metra: {
    powers: [
      { name: 'Pulso do Metrônomo', element: 'lightning', cd: 4.5, dmg: 10, range: 150, speed: 0, radius: 82, category: 'attack' },
      { name: 'Brasa', element: 'fire', cd: 3.4, dmg: 8, range: 240, speed: 700, radius: 14, category: 'attack' },
      { name: "Jato d'Água", element: 'ice', cd: 6.5, dmg: 13, range: 280, speed: 620, radius: 16, category: 'attack' },
      { name: 'Rajada', element: 'wind', cd: 4.2, dmg: 8, range: 140, speed: 0, radius: 78, category: 'control' },
    ],
    passive: 'stun',
    passiveName: 'Batida',
    passiveDesc: 'O pulso de raio deixa tonto quem está no círculo.',
  },
  resona: {
    powers: [
      { name: 'Pulsar Sônico', element: 'wind', cd: 4.6, dmg: 9, range: 160, speed: 0, radius: 90, category: 'control' },
      { name: "Jato d'Água", element: 'ice', cd: 3.5, dmg: 8, range: 250, speed: 700, radius: 14, category: 'attack' },
      { name: 'Descarga', element: 'lightning', cd: 6.8, dmg: 15, range: 310, speed: 600, radius: 18, category: 'attack' },
      { name: 'Brasa', element: 'fire', cd: 3.2, dmg: 8, range: 220, speed: 740, radius: 14, category: 'attack' },
    ],
    passive: 'knock',
    passiveName: 'Anel',
    passiveDesc: 'O vento empurra quem está no anel.',
  },
  rufo: {
    powers: [
      { name: 'Rufar', element: 'fire', cd: 4.2, dmg: 12, range: 160, speed: 0, radius: 22, category: 'attack', act: 'dash' },
      { name: "Jato d'Água", element: 'ice', cd: 3.6, dmg: 8, range: 240, speed: 680, radius: 14, category: 'attack' },
      { name: 'Estalo', element: 'lightning', cd: 6.4, dmg: 14, range: 280, speed: 640, radius: 16, category: 'attack' },
      { name: 'Rajada', element: 'wind', cd: 4.5, dmg: 8, range: 140, speed: 0, radius: 80, category: 'control' },
    ],
    passive: 'pyro',
    passiveName: 'Batida',
    passiveDesc: 'A arrancada acerta quem encosta e para na parede.',
  },
  solfa: {
    powers: [
      { name: 'Escada de Notas', element: 'ice', cd: 5, dmg: 8, range: 150, speed: 0, radius: 76, category: 'control' },
      { name: 'Nota', element: 'wind', cd: 3.4, dmg: 8, range: 250, speed: 720, radius: 14, category: 'attack' },
      { name: 'Labareda', element: 'fire', cd: 6.3, dmg: 14, range: 290, speed: 640, radius: 16, category: 'attack' },
      { name: 'Faísca', element: 'lightning', cd: 4.4, dmg: 9, range: 140, speed: 0, radius: 78, category: 'attack' },
    ],
    passive: 'heal',
    passiveName: 'Escala',
    passiveDesc: 'A água no chão deixa lento quem está no círculo.',
  },
  vibra: {
    powers: [
      { name: 'Campo Vibrato', element: 'wind', cd: 4.4, dmg: 9, range: 150, speed: 0, radius: 86, category: 'control' },
      { name: "Jato d'Água", element: 'ice', cd: 3.5, dmg: 7, range: 240, speed: 700, radius: 14, category: 'attack' },
      { name: 'Estalo', element: 'lightning', cd: 6.6, dmg: 14, range: 300, speed: 620, radius: 16, category: 'attack' },
      { name: 'Brasa', element: 'fire', cd: 3.3, dmg: 8, range: 220, speed: 740, radius: 14, category: 'attack' },
    ],
    passive: 'knock',
    passiveName: 'Oscilação',
    passiveDesc: 'O vento empurra quem está no círculo.',
  },
  sibilo: {
    powers: [
      { name: 'Sussurro Falso', element: 'wind', cd: 6, dmg: 6, range: 70, speed: 0, radius: 18, category: 'defense', act: 'decoy' },
      { name: 'Brasa', element: 'fire', cd: 3.4, dmg: 9, range: 240, speed: 720, radius: 14, category: 'attack' },
      { name: 'Estalo', element: 'lightning', cd: 6.5, dmg: 13, range: 280, speed: 640, radius: 16, category: 'attack' },
      { name: 'Orvalho', element: 'ice', cd: 4.8, dmg: 8, range: 140, speed: 0, radius: 76, category: 'control' },
    ],
    passive: 'refund',
    passiveName: 'Falso',
    passiveDesc: 'A ilusão segura um tiro e estoura.',
  },
  sibilo2: {
    powers: [
      { name: 'Sussurro Falso', element: 'lightning', cd: 5.2, dmg: 8, range: 110, speed: 0, radius: 26, category: 'mobility', act: 'blink', step: 110 },
      { name: 'Nota', element: 'wind', cd: 3.6, dmg: 8, range: 230, speed: 700, radius: 14, category: 'attack' },
      { name: 'Labareda', element: 'fire', cd: 6.4, dmg: 14, range: 280, speed: 640, radius: 16, category: 'attack' },
      { name: 'Onda', element: 'ice', cd: 4.6, dmg: 7, range: 140, speed: 0, radius: 74, category: 'control' },
    ],
    passive: 'shatter',
    passiveName: 'Sumiço',
    passiveDesc: 'O piscar para na parede. Quem está no ponto leva o golpe.',
  },
};

export function kitOf(id: string): Kit {
  return KITS[id] ?? KITS.kael;
}

/**
 * Quatro elementos principais: Fogo, Água, Terra e Ar. O id interno continua o antigo
 * (ice = Água, nature = Terra, wind = Ar) para não quebrar save, rede e testes.
 * Raio, Sombra e Plasma são poderes especiais, fora dos quatro.
 */
export const MAIN_ELEMENTS: readonly Element[] = ['fire', 'ice', 'nature', 'wind'];

/**
 * Elemento que pinta a tela e a luz do personagem.
 * O Q define, se for Fogo, Água, Terra ou Ar. Plasma, Sombra e Raio entram quando o kit não tem nenhum dos quatro.
 */
export function mainElementOf(charId: string): Element {
  const powers = kitOf(charId).powers;
  const lead = powers[0]?.element;
  if (lead && (MAIN_ELEMENTS as readonly Element[]).includes(lead)) return lead;
  const count = new Map<Element, number>();
  for (const pw of powers) count.set(pw.element, (count.get(pw.element) ?? 0) + 1);
  let best: Element | null = null;
  let n = 0;
  for (const el of MAIN_ELEMENTS) {
    const c = count.get(el) ?? 0;
    if (c > n) {
      n = c;
      best = el;
    }
  }
  if (best) return best;
  return lead ?? 'wind';
}

export const ELEMENT_NAME: Record<Element, string> = {
  fire: 'Fogo',
  ice: 'Água',
  lightning: 'Raio',
  wind: 'Ar',
  nature: 'Terra',
  shadow: 'Sombra',
  plasma: 'Plasma',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a59',
  ice: '#4fb8ff',
  lightning: '#ffe14a',
  wind: '#7dffe0',
  nature: '#c99a52',
  shadow: '#8a7cff',
  plasma: PLASMA_COLOR,
};

export const ELEMENT_FX: Record<Element, string> = {
  fire: 'queima por alguns segundos',
  ice: 'deixa molhado e lento',
  lightning: 'deixa tonto',
  wind: 'empurra para trás',
  nature: 'prende no chão por um instante',
  shadow: 'o corte marca o alvo; o piscar prepara o próximo golpe',
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
  if (aura.frozen > 0 && next === 'lightning') return { id: 'shatter', name: 'Eletrocutar', bonus: 16, clearFrozen: true };
  if (aura.frozen > 0 && next === 'fire') return { id: 'steam', name: 'Vapor', bonus: 14, clearFrozen: true, aoe: 72 };
  // Água + Água: o alvo molhado congela de verdade (fica parado e sem conjurar)
  if (aura.frozen > 0 && next === 'ice') return { id: 'freeze', name: 'Congelamento', bonus: 8, clearFrozen: true, hold: FREEZE_HOLD };
  // Água + Ar: redemoinho que puxa quem está perto para o alvo
  if (aura.frozen > 0 && next === 'wind') return { id: 'vortex', name: 'Vórtice', bonus: 9, clearFrozen: true, aoe: 96, pull: 96 };
  // Fogo + Ar: o fogo vira um redemoinho e pega em quem está perto
  if (aura.burn > 0 && next === 'wind') return { id: 'cinder', name: 'Inferno Espiral', bonus: 10, aoe: 80, spreadBurn: 80 };
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
  return charId === 'zed' ? 0.8 : 0.55;
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
    // Água molhou: Ar faz o Vórtice, Água de novo congela
    const wind = slotOf(kitDef, cds, 'wind', dist);
    if (wind !== null) return wind;
    const water = slotOf(kitDef, cds, 'ice', dist);
    if (water !== null) return water;
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

/** Q E R F: Q, E e F são os poderes, R é a ultimate. Z fica fora desta lista (é o extra). */
export const SLOT_LABEL = ['Q', 'E', 'R', 'F'] as const;

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
export function denyPowerCast(slot: string, cd: readonly number[], energy: number = ENERGY_MAX, ultCharge = 100): string | null {
  const i = powerSlotIndex(slot);
  if (i === null) return null;
  if ((cd[i] ?? 0) > 0) return 'Habilidade em recarga';
  if (i === 2) return ultCharge < 100 ? 'Ultimate em carga' : null;
  if (energy < SLOT_COST[i]) return 'Energia insuficiente';
  return null;
}

/** Z ainda não entrou nesta partida (bloqueada ou o servidor tirou do equipamento). */
export function denyPlasma(on: boolean, cd: number, energy: number, cost: number = PLASMA.cost): string | null {
  if (!on) return 'Habilidade ainda não desbloqueada';
  if (cd > 0) return 'Habilidade em recarga';
  if (energy < cost) return 'Energia insuficiente';
  return null;
}
