import type { AbilityId } from '../characters';
import type { MonsterKind, MundoGear, MundoRegionId, MundoSave, MundoSlot, MundoTomb, Rarity, StatId } from './types';

export const MAX_LEVEL = 30;
export const BAG_MAX = 16;
export const TOMB_MS = 10 * 60 * 1000;
export const COIN_LOSS = 0.2;
export const POTION_COST = 25;
export const POTION_HEAL = 40;
export const MAT_PRICE = 5;
export const GEAR_COST = 36;
export const STAT_CAP = 40;

export const RARITY_POWER: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 5 };

const GEAR_NAME: Record<MundoSlot, Record<Rarity, string>> = {
  weapon: { common: 'Lâmina simples', rare: 'Lâmina rara', epic: 'Lâmina épica', legendary: 'Lâmina lendária' },
  armor: { common: 'Couro', rare: 'Malha', epic: 'Placas', legendary: 'Égide' },
  relic: { common: 'Pingente', rare: 'Amuleto', epic: 'Relíquia', legendary: 'Coração Eco' },
};

/** pesos somam 100. Chefe puxa para épico e lendário. */
export const RARITY_WEIGHTS: Record<'normal' | 'boss', [Rarity, number][]> = {
  normal: [
    ['common', 70],
    ['rare', 22],
    ['epic', 7],
    ['legendary', 1],
  ],
  boss: [
    ['common', 10],
    ['rare', 35],
    ['epic', 35],
    ['legendary', 20],
  ],
};

const SELL: Record<Rarity, number> = { common: 8, rare: 22, epic: 48, legendary: 110 };

const LOOT: Record<MonsterKind, { coins: [number, number]; mats: number; gear: number; xp: number }> = {
  chaser: { coins: [8, 14], mats: 1, gear: 0.18, xp: 12 },
  ranged: { coins: [10, 16], mats: 1, gear: 0.22, xp: 14 },
  caller: { coins: [12, 18], mats: 2, gear: 0.28, xp: 16 },
  boss: { coins: [40, 70], mats: 6, gear: 1, xp: 80 },
};

export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(1.25, Math.max(0, level - 1)));
}

export function freshSave(charId: string): MundoSave {
  return {
    v: 1,
    charId,
    xp: 0,
    level: 1,
    points: 0,
    stats: { hp: 0, dmg: 0, speed: 0, cd: 0 },
    coins: 0,
    bank: 0,
    materials: 0,
    weapon: null,
    armor: null,
    relic: null,
    bag: [],
    tomb: null,
    party: [],
    session: { mode: 'solo', pvpZones: [] },
    quest: { step: 0 },
  };
}

export function derived(save: MundoSave) {
  const armor = save.armor ? Math.min(0.45, save.armor.power * 0.05) : 0;
  const relic = save.relic ? save.relic.power * 0.03 : 0;
  return {
    maxHp: 100 + save.stats.hp * 15,
    speed: 220 + save.stats.speed * 12,
    dmgMul: 1 + save.stats.dmg * 0.08,
    weaponFlat: save.weapon ? save.weapon.power * 3 : 0,
    cdMul: Math.max(0.55, 1 - save.stats.cd * 0.04 - relic),
    armor,
  };
}

export function addXp(save: MundoSave, amount: number): MundoSave {
  let xp = save.xp + Math.max(0, amount);
  let level = save.level;
  let points = save.points;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    points += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;
  return { ...save, xp, level, points };
}

export function spendPoint(save: MundoSave, stat: StatId): MundoSave | null {
  if (save.points <= 0) return null;
  if (save.stats[stat] >= STAT_CAP) return null;
  return { ...save, points: save.points - 1, stats: { ...save.stats, [stat]: save.stats[stat] + 1 } };
}

export function rollRarity(rand: () => number, boss: boolean): Rarity {
  const rows = boss ? RARITY_WEIGHTS.boss : RARITY_WEIGHTS.normal;
  let roll = rand() * 100;
  for (const [name, w] of rows) {
    roll -= w;
    if (roll < 0) return name;
  }
  return 'legendary';
}

export function makeGear(slot: MundoSlot, rarity: Rarity, n: number): MundoGear {
  return { id: `${slot}-${rarity}-${n}`, slot, rarity, name: GEAR_NAME[slot][rarity], power: RARITY_POWER[rarity] };
}

export interface Loot {
  coins: number;
  materials: number;
  gear: MundoGear | null;
  xp: number;
}

export function rollLoot(rand: () => number, kind: MonsterKind): Loot {
  const t = LOOT[kind];
  const span = t.coins[1] - t.coins[0];
  const coins = t.coins[0] + Math.floor(rand() * (span + 1));
  const boss = kind === 'boss';
  let gear: MundoGear | null = null;
  if (rand() < t.gear) {
    const rarity = rollRarity(rand, boss);
    const slot = (['weapon', 'armor', 'relic'] as const)[Math.min(2, Math.floor(rand() * 3))];
    gear = makeGear(slot, rarity, Math.floor(rand() * 1e9));
  }
  return { coins, materials: t.mats, gear, xp: t.xp };
}

export function xpOf(kind: MonsterKind): number {
  return LOOT[kind].xp;
}

/** 20% das moedas da bolsa somem. Itens da bolsa vão para a tumba. Banco e equipamento ficam. A tumba antiga é trocada. */
export function applyDeath(save: MundoSave, where: { x: number; y: number; region: MundoRegionId }, now: number): { save: MundoSave; lost: number } {
  const lost = Math.floor(save.coins * COIN_LOSS);
  const tomb: MundoTomb = {
    x: where.x,
    y: where.y,
    region: where.region,
    items: save.bag.slice(),
    until: now + TOMB_MS,
  };
  return { lost, save: { ...save, coins: save.coins - lost, bag: [], tomb } };
}

export function expireTomb(save: MundoSave, now: number): MundoSave {
  if (save.tomb && now >= save.tomb.until) return { ...save, tomb: null };
  return save;
}

export function takeTomb(save: MundoSave, now: number): { save: MundoSave; taken: MundoGear[]; error?: string } {
  const tomb = save.tomb;
  if (!tomb) return { save, taken: [], error: 'Não há tumba.' };
  if (now >= tomb.until) return { save: { ...save, tomb: null }, taken: [], error: 'A tumba sumiu.' };
  const room = Math.max(0, BAG_MAX - save.bag.length);
  const taken = tomb.items.slice(0, room);
  const left = tomb.items.slice(taken.length);
  return {
    save: { ...save, bag: save.bag.concat(taken), tomb: left.length ? { ...tomb, items: left } : null },
    taken,
  };
}

export function buyPotion(save: MundoSave): { save: MundoSave } | { error: string } {
  if (save.coins < POTION_COST) return { error: 'Moedas insuficientes.' };
  return { save: { ...save, coins: save.coins - POTION_COST } };
}

export function buyCommonGear(save: MundoSave, slot: MundoSlot, n: number): { save: MundoSave; gear: MundoGear } | { error: string } {
  if (save.coins < GEAR_COST) return { error: 'Moedas insuficientes.' };
  if (save.bag.length >= BAG_MAX) return { error: 'A bolsa está cheia.' };
  const gear = makeGear(slot, 'common', n);
  return { save: { ...save, coins: save.coins - GEAR_COST, bag: save.bag.concat(gear) }, gear };
}

export function sellGearAt(save: MundoSave, index: number): { save: MundoSave; coins: number } | { error: string } {
  const g = save.bag[index];
  if (!g) return { error: 'Item inválido.' };
  const coins = SELL[g.rarity];
  const bag = save.bag.slice();
  bag.splice(index, 1);
  return { save: { ...save, bag, coins: save.coins + coins }, coins };
}

export function sellMaterials(save: MundoSave, n: number): { save: MundoSave; coins: number } | { error: string } {
  const qty = Math.floor(n);
  if (qty <= 0 || qty > save.materials) return { error: 'Materiais insuficientes.' };
  const coins = qty * MAT_PRICE;
  return { save: { ...save, materials: save.materials - qty, coins: save.coins + coins }, coins };
}

export function deposit(save: MundoSave, n: number): { save: MundoSave } | { error: string } {
  const qty = Math.floor(n);
  if (qty <= 0 || qty > save.coins) return { error: 'Moedas insuficientes.' };
  return { save: { ...save, coins: save.coins - qty, bank: save.bank + qty } };
}

export function withdraw(save: MundoSave, n: number): { save: MundoSave } | { error: string } {
  const qty = Math.floor(n);
  if (qty <= 0 || qty > save.bank) return { error: 'O banco não tem isso.' };
  return { save: { ...save, coins: save.coins + qty, bank: save.bank - qty } };
}

export function equipFromBag(save: MundoSave, index: number): MundoSave | null {
  const g = save.bag[index];
  if (!g) return null;
  const prev = save[g.slot];
  const bag = save.bag.slice();
  bag.splice(index, 1);
  if (prev) bag.push(prev);
  return { ...save, bag, [g.slot]: g };
}

export type AbilityEffect = 'dash' | 'heal' | 'shield' | 'aoe';

/** investida avança e fere, cura recupera, escudo reduz, o resto vira uma onda curta */
export function abilityEffect(id: AbilityId): AbilityEffect {
  if (id === 'investida') return 'dash';
  if (id === 'cura') return 'heal';
  if (id === 'escudo') return 'shield';
  return 'aoe';
}

export function sellPrice(rarity: Rarity): number {
  return SELL[rarity];
}

/** futuro: dois jogadores só se ferem no shared e dentro da zona */
export function canDamage(opt: {
  attackerKind: 'player' | MonsterKind;
  targetKind: 'player' | MonsterKind;
  attackerTeam: number;
  targetTeam: number;
  regionSafe: boolean;
  regionId: string;
  session: MundoSave['session'];
}): boolean {
  if (opt.targetKind === 'player' && opt.regionSafe) return false;
  const both = opt.attackerKind === 'player' && opt.targetKind === 'player';
  if (both) return opt.session.mode === 'shared' && opt.session.pvpZones.includes(opt.regionId);
  if (opt.attackerTeam === opt.targetTeam) return false;
  return true;
}

export function bossPhase(t: number): 'slam' | 'fan' | 'charge' {
  const u = ((t % 4) + 4) % 4;
  // 1.3 e 2.2 não são exatos em binário; a margem evita prender o golpe no telegrapho.
  if (u < 1.3 - 1e-6) return 'slam';
  if (u < 2.2 - 1e-6) return 'fan';
  return 'charge';
}
