// Configuração central de balanceamento do combate.
// Mude números aqui (não espalhados pelo código): vida, controle, escudo, habilidades,
// equipamentos, ultimates e o Chefe do modo Caça ao Chefe.
import type { AbilityId } from './characters';
import { studioOf } from './elements';

export type Role = 'dano' | 'mobilidade' | 'defesa' | 'controle' | 'suporte';
/** como a habilidade é mirada: na hora, numa direção ou num ponto do mapa */
export type AimKind = 'instant' | 'direction' | 'point';

export const ROLE_LABEL: Record<Role, string> = {
  dano: 'Dano',
  mobilidade: 'Mobilidade',
  defesa: 'Defesa',
  controle: 'Controle',
  suporte: 'Suporte',
};
export const ROLE_COLOR: Record<Role, string> = {
  dano: '#ff6a4a',
  mobilidade: '#3ee8ff',
  defesa: '#5dff8a',
  controle: '#c77dff',
  suporte: '#ffd23e',
};

// ------------------------------------------------------------------ regras gerais
export const COMBAT = {
  maxHp: 150,
  /** recuperação lenta: começa depois de X s sem levar dano (para ao levar dano) */
  regen: { delay: 4, perSecond: 5 },
  /** velocidade mínima com lentidões somadas (nunca fica "preso") */
  minSpeed: 0.45,
  /** andando enquanto prepara golpe/ultimate */
  castMove: 0.6,
  /** máximo de tiros de Eco ao mesmo tempo */
  maxEchoBullets: 36,
  /** máximo de projéteis na arena (desempenho) */
  maxBullets: 420,
  /** proteção no começo da rodada e ao renascer (s). Só bloqueia dano enquanto > 0 */
  spawnProtect: 1.2,
  /** depois de um atordoamento, o jogador fica imune a novos por este tempo (evita prender sem reação) */
  ccResist: 1.2,
  /** atordoamento máximo de uma vez (a raiz é outro efeito e tem a própria resistência) */
  maxStun: 1.2,
  /** escudo: só devolve tiros vindos da frente (abertura total em radianos) */
  shieldArc: 2.6,
  /** escudo: dano que passa pelos lados e pelas costas */
  shieldSideDamage: 0.4,
  /** tiro devolvido sai com esta fração do dano (nunca mais forte) */
  reflectMult: 0.8,
  /** vampiro e armas que curam: fração do dano que vira vida */
  vampFrac: 0.25,
  turret: { hp: 40, damage: 6, cooldown: 0.5, range: 420, maxPerOwner: 1 },
  /** carga da ultimate (0–100) */
  ult: { perSecond: 0.25, perDamageDealt: 0.55, perDamageTaken: 0.3, perKill: 12, perAbility: 8 },
  /** esquiva (rolamento): invulnerável só durante o movimento */
  dodgeIframes: 0.22,
  /** marcado: dano extra recebido */
  markMult: 1.2,
};

/** níveis comprados na loja: no PvP só reduzem um pouco a recarga (sem vantagem injusta) */
export function levelMult(lv: number | undefined, pve: boolean) {
  const k = Math.max(1, Math.min(5, Math.floor(lv || 1))) - 1;
  if (pve) return { cooldown: 1 - 0.08 * k, duration: 1 + 0.1 * k, power: 1 + 0.08 * k };
  return { cooldown: 1 - 0.03 * k, duration: 1, power: 1 };
}

// ------------------------------------------------------------------ habilidade do personagem (Q)
export interface AbilityBal {
  role: Role;
  aim: AimKind;
  cooldown: number;
  duration: number;
  /** alcance (direção/ponto) ou raio de efeito */
  range?: number;
  radius?: number;
  damage?: number;
  /** controle aplicado */
  stun?: number;
}
export const ABILITY_BAL: Record<AbilityId, AbilityBal> = {
  turbo: { role: 'mobilidade', aim: 'instant', cooldown: 8, duration: 2.5 },
  fase: { role: 'defesa', aim: 'instant', cooldown: 10, duration: 1.6 },
  escudo: { role: 'defesa', aim: 'instant', cooldown: 10, duration: 2.2 },
  teleporte: { role: 'mobilidade', aim: 'direction', cooldown: 7, duration: 0, range: 190, radius: 70, damage: 16 },
  explosao: { role: 'controle', aim: 'instant', cooldown: 10, duration: 0, radius: 165, damage: 24, stun: 0.25 },
  clone: { role: 'dano', aim: 'instant', cooldown: 12, duration: 4 },
  sombra: { role: 'mobilidade', aim: 'direction', cooldown: 8, duration: 1.2, range: 150, radius: 75, damage: 18 },
  torreta: { role: 'dano', aim: 'instant', cooldown: 12, duration: 5 },
  cura: { role: 'suporte', aim: 'instant', cooldown: 13, duration: 0, radius: 170, damage: 40 },
  investida: { role: 'controle', aim: 'direction', cooldown: 8, duration: 0.38, range: 310, damage: 26, stun: 0.5 },
  muralha: { role: 'defesa', aim: 'direction', cooldown: 11, duration: 4, range: 62 },
  raio: { role: 'controle', aim: 'instant', cooldown: 10, duration: 0, range: 310, damage: 30, stun: 0.4 },
  gravidade: { role: 'controle', aim: 'point', cooldown: 12, duration: 2.2, range: 260, radius: 175, damage: 18 },
  gancho: { role: 'mobilidade', aim: 'direction', cooldown: 7, duration: 0, range: 370, damage: 12, stun: 0.3 },
  fumaca: { role: 'defesa', aim: 'instant', cooldown: 12, duration: 4, radius: 125 },
};

// ------------------------------------------------------------------ habilidade de equipamento (E)
export type SkillId = 'rolamento' | 'armadilha' | 'barreira' | 'marcador' | 'estimulo';
export interface SkillDef {
  id: SkillId;
  name: string;
  role: Role;
  aim: AimKind;
  desc: string;
  cooldown: number;
  range: number;
  radius?: number;
  duration?: number;
  damage?: number;
  /** preço para liberar (0 = já vem liberada) */
  price: number;
  icon: string;
}
export const SKILLS: Record<SkillId, SkillDef> = {
  rolamento: { id: 'rolamento', name: 'Rolamento', role: 'mobilidade', aim: 'direction', desc: 'Esquiva rápida na direção escolhida. Fica intocável só durante o giro.', cooldown: 5, range: 135, price: 0, icon: '⟳' },
  armadilha: { id: 'armadilha', name: 'Armadilha', role: 'controle', aim: 'point', desc: 'Arma uma armadilha visível. Quem pisar fica preso por 0,6 s.', cooldown: 12, range: 300, radius: 34, duration: 14, damage: 12, price: 0, icon: '⌖' },
  barreira: { id: 'barreira', name: 'Barreira', role: 'defesa', aim: 'direction', desc: 'Ergue uma parede curta que bloqueia tiros por 3 s.', cooldown: 12, range: 60, duration: 3, price: 0, icon: '▮' },
  marcador: { id: 'marcador', name: 'Dardo Marcador', role: 'controle', aim: 'direction', desc: 'Dardo reto: o alvo fica visível e leva +20% de dano por 4 s.', cooldown: 10, range: 540, duration: 4, damage: 8, price: 0, icon: '◎' },
  estimulo: { id: 'estimulo', name: 'Estímulo', role: 'suporte', aim: 'instant', desc: 'Cura 25 de vida em você e nos aliados perto e dá um impulso de velocidade.', cooldown: 14, range: 0, radius: 160, damage: 25, price: 0, icon: '✚' },
};

// ------------------------------------------------------------------ ultimate (R)
export type UltId = 'meteoro' | 'feixe' | 'estase' | 'sobrecarga' | 'onda' | 'lanca';
export interface UltDef {
  id: UltId;
  name: string;
  role: Role;
  aim: AimKind;
  desc: string;
  range: number;
  radius?: number;
  width?: number;
  /** tempo de aviso antes do golpe (contrajogada) */
  windup: number;
  damage: number;
  duration?: number;
  price: number;
  icon: string;
}
export const ULTS: Record<UltId, UltDef> = {
  meteoro: { id: 'meteoro', name: 'Meteoro', role: 'dano', aim: 'point', desc: 'Marca uma área: depois de 1 s cai um meteoro (55 de dano). Dá tempo de fugir.', range: 430, radius: 115, windup: 1, damage: 55, price: 0, icon: '☄' },
  feixe: { id: 'feixe', name: 'Feixe Prismático', role: 'dano', aim: 'direction', desc: 'Carrega 0,55 s e dispara um feixe em linha reta que atravessa rivais (50). Paredes bloqueiam.', range: 640, width: 40, windup: 0.55, damage: 50, price: 0, icon: '═' },
  estase: { id: 'estase', name: 'Campo de Estase', role: 'controle', aim: 'point', desc: 'Campo de 3 s: rivais dentro ficam 65% mais lentos, sem impulso e perdem vida.', range: 380, radius: 140, windup: 0.4, damage: 8, duration: 3, price: 0, icon: '◌' },
  sobrecarga: { id: 'sobrecarga', name: 'Sobrecarga', role: 'suporte', aim: 'instant', desc: 'Por 5 s: atira 35% mais rápido, corre 15% mais e ganha 30 de escudo.', range: 0, windup: 0, damage: 0, duration: 5, price: 0, icon: '⚡' },
  onda: { id: 'onda', name: 'Onda de Choque', role: 'dano', aim: 'instant', desc: 'Depois de 0,35 s explode uma onda em volta de você (36 de dano) e empurra quem estiver perto.', range: 0, radius: 168, windup: 0.35, damage: 36, price: 0, icon: '◎' },
  lanca: { id: 'lanca', name: 'Lança de Luz', role: 'dano', aim: 'direction', desc: 'Carrega 0,3 s e crava uma lança de luz em linha reta (42). Paredes bloqueiam.', range: 520, width: 28, windup: 0.3, damage: 42, price: 0, icon: '╱' },
};

// ------------------------------------------------------------------ arma principal e secundária
/** armas padrão que qualquer personagem pode escolher no lugar da arma própria */
export const STANDARD_PRIMARIES = ['blaster', 'fuzil', 'espingarda', 'submetra', 'lancador', 'arco', 'plasma', 'agulha'] as const;
export type StandardPrimary = (typeof STANDARD_PRIMARIES)[number];
export const PRIMARY_PRICE: Record<string, number> = { blaster: 0, fuzil: 0, espingarda: 0, submetra: 0, lancador: 0, arco: 0, plasma: 0, agulha: 0 };

export type KitId = 'bomba' | 'mina' | 'gelo' | 'kit' | 'pulso';
export interface KitDef {
  id: KitId;
  name: string;
  role: Role;
  desc: string;
  count: number;
  price: number;
}
export const KITS: Record<KitId, KitDef> = {
  bomba: { id: 'bomba', name: 'Granadas', role: 'dano', desc: '2 granadas por rodada (40 de dano). Explodem depois de 0,9 s.', count: 2, price: 0 },
  mina: { id: 'mina', name: 'Minas', role: 'controle', desc: '2 minas por rodada (35 de dano). Explodem quando um rival pisa.', count: 2, price: 0 },
  gelo: { id: 'gelo', name: 'Granada de Gelo', role: 'controle', desc: '2 por rodada: pouco dano, deixa todos na área lentos por 2,5 s.', count: 2, price: 0 },
  kit: { id: 'kit', name: 'Kit Médico', role: 'suporte', desc: '1 por rodada: recupera 45 de vida na hora.', count: 1, price: 0 },
  pulso: { id: 'pulso', name: 'Pulso', role: 'controle', desc: '2 por rodada: explosão curta (24) que atordoa rivais por um instante.', count: 2, price: 0 },
};

// ------------------------------------------------------------------ equipamento escolhido
export interface Loadout {
  /** 'assinatura' = a arma própria do personagem */
  primary: string;
  kit: KitId;
  skill: SkillId;
  ult: UltId;
  /** um poder extra. null = espaço vazio. Só um id do estúdio, e só se estiver liberado. */
  secondary?: string | null;
}
export const DEFAULT_LOADOUT: Loadout = { primary: 'assinatura', kit: 'bomba', skill: 'rolamento', ult: 'meteoro', secondary: null };

/** confere um equipamento recebido (online/arquivo) e troca o que for inválido ou não liberado */
export function sanitizeLoadout(l: Partial<Loadout> | undefined | null, owns: (key: string) => boolean = () => true): Loadout {
  const out: Loadout = { ...DEFAULT_LOADOUT };
  if (!l || typeof l !== 'object') return out;
  if (l.primary === 'assinatura' || ((STANDARD_PRIMARIES as readonly string[]).includes(String(l.primary)) && (PRIMARY_PRICE[String(l.primary)] === 0 || owns('gear:' + l.primary)))) out.primary = String(l.primary);
  if (l.kit && l.kit in KITS && (KITS[l.kit].price === 0 || owns('gear:' + l.kit))) out.kit = l.kit;
  if (l.skill && l.skill in SKILLS && (SKILLS[l.skill].price === 0 || owns('gear:' + l.skill))) out.skill = l.skill;
  if (l.ult && l.ult in ULTS && (ULTS[l.ult].price === 0 || owns('gear:' + l.ult))) out.ult = l.ult;
  const extra = studioOf(typeof l.secondary === 'string' ? l.secondary : null);
  out.secondary = extra && owns('power:' + extra.id) ? extra.id : null;
  return out;
}
export function gearPrice(id: string): number | null {
  if (id in PRIMARY_PRICE) return PRIMARY_PRICE[id];
  if (id in KITS) return KITS[id as KitId].price;
  if (id in SKILLS) return SKILLS[id as SkillId].price;
  if (id in ULTS) return ULTS[id as UltId].price;
  return null;
}

// ------------------------------------------------------------------ Caça ao Chefe
export type BossSkill = 'impacto' | 'barragem' | 'chuva' | 'obsidiana' | 'avanco';
export const BOSS = {
  /** vida por caçador (3 caçadores = 3000) */
  hpPerHunter: 1100,
  speedMul: 0.82,
  /** raio do corpo para acertos (o normal é 16) */
  hitR: 44,
  /** altura do centro do corpo (acertos de tiro) */
  hitY: 62,
  scale: 1,
  /** controle reduzido no Chefe */
  stunMult: 0.3,
  slowMult: 0.5,
  knockMult: 0.15,
  /** acerto nas costas (ponto fraco) */
  weakMult: 1.5,
  /** vidas extras do time de caçadores (compartilhadas) */
  livesPerHunter: 1,
  hunterRespawn: 5,
  /** fase 2: geradores que protegem o Chefe */
  pylonHp: 150,
  pylonShield: 0.4,
  /** fase 3: recargas mais curtas */
  rageCooldown: 0.7,
  /** exausto depois da Chuva de Rochas (e de tempos em tempos na fase 3): leva mais dano e não usa golpes */
  exhaustTime: 3.2,
  exhaustMult: 1.5,
  /** fase 3: rachaduras de lava que cruzam a arena */
  fissureDamage: 25,
  fissureEvery: 11,
  /** criaturas: no máximo 2 + 1 por caçador vivas ao mesmo tempo; ondas a cada X s */
  minionWaveEvery: 13,
  /** pontos de recurso: cura/escudo a cada X s */
  resourceEvery: 14,
  /** coberturas destrutíveis */
  coverHp: 140,
  weapon: { damage: 9, pellets: 3, spread: 0.26, cooldown: 0.55, speed: 560, life: 1.1 },
  skills: {
    impacto: { name: 'Impacto', key: 'Q', desc: 'Pisada em área ao redor (aviso de 0,8 s).', cooldown: 7, windup: 0.8, radius: 175, damage: 32, phase: 1 },
    barragem: { name: 'Barragem', key: 'E', desc: 'Espiral de projéteis por 1 s.', cooldown: 9, windup: 0.3, damage: 8, count: 20, phase: 1 },
    chuva: { name: 'Chuva de Rochas', key: 'R', desc: 'Marca o chão perto dos caçadores; as rochas caem em 1,2 s.', cooldown: 16, windup: 1.2, radius: 72, damage: 30, phase: 2 },
    obsidiana: { name: 'Muralha de Obsidiana', key: 'F', desc: 'Ergue 2 paredes no ponto escolhido por 6 s e muda as rotas.', cooldown: 14, windup: 0.5, range: 420, duration: 6, phase: 2 },
    avanco: { name: 'Avanço Pesado', key: 'Shift', desc: 'Prepara 0,45 s e avança, derrubando quem estiver no caminho.', cooldown: 7, windup: 0.45, damage: 24, range: 330, phase: 1 },
  } as Record<BossSkill, { name: string; key: string; desc: string; cooldown: number; windup: number; radius?: number; damage?: number; count?: number; range?: number; duration?: number; phase: number }>,
};

/** equipamento variado (e sempre liberado) para os bots, conforme o personagem */
export function botLoadout(charId: string): Loadout {
  let h = 0;
  for (const ch of charId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const skills: SkillId[] = ['rolamento', 'armadilha', 'barreira', 'marcador', 'estimulo'];
  const ults: UltId[] = ['meteoro', 'feixe', 'estase', 'sobrecarga', 'onda', 'lanca'];
  const kits: KitId[] = ['bomba', 'mina', 'gelo', 'kit', 'pulso'];
  return { primary: 'assinatura', skill: skills[h % skills.length], ult: ults[(h >> 3) % ults.length], kit: kits[(h >> 5) % kits.length] };
}
