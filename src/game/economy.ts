import { STANDARD_PRIMARIES, gearPrice, sanitizeLoadout, type Loadout } from './balance';
import { STUDIO } from './elements';
// Moedas, preços e itens de personalização. Usado pelo jogo e pelo servidor.

export const START_COINS = 150;

/**
 * Os 28 personagens, de graça para conta nova, conta antiga e convidado.
 * Cliente e servidor leem esta mesma lista. Não devolve moeda.
 */
export const STARTER_CHARS = [
  'kael', 'luna', 'bruno', 'zoe', 'maya', 'zed', 'nyx', 'rex', 'iris', 'tara',
  'kai', 'leo', 'mei', 'duda', 'bento', 'vortex', 'nara', 'vexa',
  'clave', 'fuga', 'lyra', 'metra', 'resona', 'rufo', 'solfa', 'vibra', 'sibilo', 'sibilo2',
];

export const CHAR_PRICES: Record<string, number> = Object.fromEntries(STARTER_CHARS.map((id) => [id, 0]));

/** Soma os iniciais que faltam. Não mexe em moedas, xp nem no que já foi comprado. */
function grantKey(p: Profile, key: string): boolean {
  if (p.owned.includes(key)) return false;
  p.owned.push(key);
  return true;
}

export function grantStarters(p: Profile): boolean {
  let changed = false;
  for (const id of STARTER_CHARS) if (grantKey(p, 'char:' + id)) changed = true;
  for (const s of SKINS) if (s.price === 0 && grantKey(p, 'skin:' + s.id)) changed = true;
  for (const a of ACCESSORIES) if (a.price === 0 && grantKey(p, 'acc:' + a.id)) changed = true;
  if (grantKey(p, 'trail:nenhum')) changed = true;
  return changed;
}

export interface Skin {
  id: string;
  name: string;
  price: number;
  /** cores que substituem as do personagem; ausente = cores originais */
  suit?: string;
  suitDark?: string;
  glow?: string;
}

export const SKINS: Skin[] = [
  { id: 'padrao', name: 'Padrão', price: 0 },
  { id: 'noturno', name: 'Noturno', price: 0, suit: '#22222c', suitDark: '#0e0e14', glow: '#e8e8ff' },
  { id: 'gelo', name: 'Gelo', price: 200, suit: '#cfeeff', suitDark: '#7fb2d6', glow: '#7ff0ff' },
  { id: 'neon', name: 'Neon', price: 250, suit: '#1a0d33', suitDark: '#0b0618', glow: '#39ff88' },
  { id: 'lava', name: 'Lava', price: 300, suit: '#4a1208', suitDark: '#220604', glow: '#ff7a1e' },
  { id: 'camuflado', name: 'Camuflado', price: 200, suit: '#4a5a2a', suitDark: '#252e14', glow: '#c8e06a' },
  { id: 'chiclete', name: 'Chiclete', price: 200, suit: '#ff8ac8', suitDark: '#b0407a', glow: '#ffffff' },
  { id: 'oceano', name: 'Oceano', price: 250, suit: '#1a6a9a', suitDark: '#0a2a4a', glow: '#5af0ff' },
  { id: 'carbono', name: 'Carbono', price: 300, suit: '#2e3036', suitDark: '#121316', glow: '#ff3b3b' },
  { id: 'sol', name: 'Sol', price: 350, suit: '#ff9a1e', suitDark: '#b04a00', glow: '#fff36a' },
  { id: 'galaxia', name: 'Galáxia', price: 500, suit: '#2a1a5a', suitDark: '#0e0828', glow: '#ff7af0' },
  { id: 'ouro', name: 'Ouro', price: 600, suit: '#e0b022', suitDark: '#8a6206', glow: '#fff3a0' },
  { id: 'diamante', name: 'Diamante', price: 900, suit: '#d8f4ff', suitDark: '#6ab0d8', glow: '#ffffff' },
];

export interface Trail {
  id: string;
  name: string;
  price: number;
  colors: string[];
}

export type AccessoryKind = 'none' | 'cap' | 'goggles' | 'halo' | 'cape' | 'wings';

export interface Accessory {
  id: string;
  name: string;
  price: number;
  kind: AccessoryKind;
  color: string;
}

/** Acessórios. Os de preço 0 já vêm liberados; o resto fica trancado até comprar. */
export const ACCESSORIES: Accessory[] = [
  { id: 'nenhum', name: 'Nenhum', price: 0, kind: 'none', color: '#9aa3c7' },
  { id: 'bone', name: 'Boné', price: 0, kind: 'cap', color: '#3ee8ff' },
  { id: 'oculos', name: 'Óculos', price: 0, kind: 'goggles', color: '#e8ecff' },
  { id: 'halo', name: 'Halo', price: 250, kind: 'halo', color: '#ffe14a' },
  { id: 'capa', name: 'Capa', price: 400, kind: 'cape', color: '#ff4fc3' },
  { id: 'asas', name: 'Asas', price: 700, kind: 'wings', color: '#9fe8ff' },
];

export function accessoryById(id: string | undefined): Accessory {
  return ACCESSORIES.find((a) => a.id === id) ?? ACCESSORIES[0];
}

export const TRAILS: Trail[] = [
  { id: 'nenhum', name: 'Nenhum', price: 0, colors: [] },
  { id: 'faiscas', name: 'Faíscas', price: 150, colors: ['#fff6a0', '#ffd23e'] },
  { id: 'estrelas', name: 'Estrelas', price: 200, colors: ['#ffffff', '#b8e6ff'] },
  { id: 'fogo', name: 'Fogo', price: 250, colors: ['#ffb347', '#ff5a1e', '#ff2a2a'] },
  { id: 'bolhas', name: 'Bolhas', price: 150, colors: ['#bff4ff', '#7fd8ff'] },
  { id: 'neve', name: 'Neve', price: 200, colors: ['#ffffff', '#dff4ff'] },
  { id: 'coracoes', name: 'Corações', price: 250, colors: ['#ff4f8a', '#ff9ac0'] },
  { id: 'raios', name: 'Raios', price: 300, colors: ['#ffe14a', '#ffffff'] },
  { id: 'arcoiris', name: 'Arco-íris', price: 400, colors: ['#ff4fc3', '#ffd23e', '#5dff8a', '#3ee8ff', '#a678ff'] },
];

export interface Profile {
  username: string;
  coins: number;
  xp: number;
  wins: number;
  matches: number;
  owned: string[]; // ids: "char:zoe", "skin:ouro", "trail:fogo", "acc:capa"
  equipped: { char: string; skin: string; trail: string; acc: string; weapon: string };
  /** nível da habilidade de cada personagem (ausente = 1) */
  abilityLv?: Record<string, number>;
  /** poderes extras liberados por partida jogada (não se compra) */
  powerUnlocks?: string[];
}

/** Rajada de Plasma entra depois da primeira partida. Moedas não liberam. */
export const PLASMA_UNLOCK_MATCHES = 1;

/** preço para subir do nível n para n+1 (índice = nível atual) */
export const UPGRADE_COST = [0, 200, 350, 500, 700];
export const MAX_LV = 5;
export function abilityLevel(p: Profile, charId: string): number {
  return Math.max(1, Math.min(MAX_LV, p.abilityLv?.[charId] ?? 1));
}
export function upgradePrice(p: Profile, charId: string): number | null {
  const lv = abilityLevel(p, charId);
  return lv >= MAX_LV ? null : UPGRADE_COST[lv];
}

export function newProfile(username = 'Convidado'): Profile {
  const p: Profile = {
    username,
    coins: START_COINS,
    xp: 0,
    wins: 0,
    matches: 0,
    owned: [
      ...STARTER_CHARS.map((c) => 'char:' + c),
      ...SKINS.filter((s) => s.price === 0).map((s) => 'skin:' + s.id),
      ...ACCESSORIES.filter((a) => a.price === 0).map((a) => 'acc:' + a.id),
      'trail:nenhum',
    ],
    equipped: { char: 'kael', skin: 'padrao', trail: 'nenhum', acc: 'nenhum', weapon: 'assinatura' },
    abilityLv: {},
    powerUnlocks: [],
  };
  syncPowerUnlocks(p);
  return p;
}

/** Grava no perfil o poder extra que a partida já liberou. Tira o que foi colocado na mão, sem compra. */
export function syncPowerUnlocks(p: Profile): boolean {
  let changed = false;
  if (!Array.isArray(p.powerUnlocks)) {
    p.powerUnlocks = [];
    changed = true;
  }
  const matches = p.matches ?? 0;
  for (const s of STUDIO) {
    const key = 'power:' + s.id;
    const earned = matches >= s.unlockMatches;
    if (earned && !p.powerUnlocks.includes(s.id)) {
      p.powerUnlocks.push(s.id);
      changed = true;
    }
    if (!earned && p.powerUnlocks.includes(s.id)) {
      p.powerUnlocks = p.powerUnlocks.filter((id) => id !== s.id);
      changed = true;
    }
    const has = p.powerUnlocks.includes(s.id);
    if (has && !p.owned.includes(key)) {
      p.owned.push(key);
      changed = true;
    }
    if (!has && p.owned.includes(key)) {
      p.owned = p.owned.filter((id) => id !== key);
      changed = true;
    }
  }
  return changed;
}

export function itemPrice(item: string): number | null {
  const [kind, id] = item.split(':');
  if (kind === 'char') return id in CHAR_PRICES ? CHAR_PRICES[id] : null;
  if (kind === 'skin') return SKINS.find((s) => s.id === id)?.price ?? null;
  if (kind === 'acc') return ACCESSORIES.find((a) => a.id === id)?.price ?? null;
  if (kind === 'trail') return TRAILS.find((t) => t.id === id)?.price ?? null;
  // equipamentos (armas, itens, habilidades, ultimates): opções diferentes, não mais fortes
  if (kind === 'gear') return gearPrice(id);
  return null;
}

export function owns(p: Profile, item: string): boolean {
  return p.owned.includes(item) || itemPrice(item) === 0;
}

/** Compra um item. Retorna o erro em texto, ou null se deu certo (o perfil é alterado). */
export function buy(p: Profile, item: string): string | null {
  const [kind, id] = item.split(':');
  if (kind === 'up') {
    // subir o nível da habilidade de um personagem que você tem
    if (!(id in CHAR_PRICES)) return 'Personagem não existe.';
    if (!owns(p, 'char:' + id)) return 'Libere o personagem primeiro.';
    const cost = upgradePrice(p, id);
    if (cost === null) return 'Habilidade já está no nível máximo.';
    if (p.coins < cost) return `Faltam ${cost - p.coins} moedas.`;
    p.coins -= cost;
    p.abilityLv = { ...(p.abilityLv ?? {}), [id]: abilityLevel(p, id) + 1 };
    return null;
  }
  const price = itemPrice(item);
  if (price === null) return 'Item não existe.';
  if (owns(p, item)) return 'Você já tem esse item.';
  if (p.coins < price) return `Faltam ${price - p.coins} moedas.`;
  p.coins -= price;
  p.owned.push(item);
  return null;
}

export type EquipSlot = 'char' | 'skin' | 'trail' | 'acc' | 'weapon';

export type ItemView = 'equipped' | 'owned' | 'buy' | 'short' | 'locked' | 'soon';

/** O mesmo estado em todo lugar: início, loja, personalizar e bolsa. */
export function itemView(opts: { owned: boolean; equipped: boolean; price: number; coins: number; soon?: boolean; locked?: boolean; lockReason?: string }): { view: ItemView; label: string; missing: number } {
  if (opts.soon) return { view: 'soon', label: 'EM BREVE', missing: 0 };
  if (opts.locked) return { view: 'locked', label: opts.lockReason ? `BLOQUEADO · ${opts.lockReason}` : 'BLOQUEADO', missing: 0 };
  if (opts.equipped) return { view: 'equipped', label: 'EQUIPADO', missing: 0 };
  if (opts.owned || opts.price <= 0) return { view: 'owned', label: 'ADQUIRIDO', missing: 0 };
  const missing = Math.max(0, opts.price - opts.coins);
  if (missing > 0) return { view: 'short', label: `MOEDAS INSUFICIENTES · faltam ${missing}`, missing };
  return { view: 'buy', label: 'COMPRAR', missing: 0 };
}

export function coinText(n: number): string {
  return `🪙 ${Math.max(0, Math.floor(n))}`;
}

/** Aviso de compra recusada. O saldo não muda. */
export function missingCoinsText(missing: number): string {
  const n = Math.max(0, Math.ceil(missing));
  return `Você precisa de mais ${n} moedas para adquirir este item.`;
}

/** Arma favorita: a do personagem, ou uma arma padrão que você já pode usar. */
export function canEquipWeapon(p: Profile, id: string | undefined): boolean {
  if (!id) return false;
  if (id === 'assinatura') return true;
  if (!(STANDARD_PRIMARIES as readonly string[]).includes(id)) return false;
  const price = gearPrice(id);
  return price === 0 || owns(p, 'gear:' + id);
}

export function equip(p: Profile, slot: EquipSlot, id: string): string | null {
  if (slot === 'weapon') {
    if (!canEquipWeapon(p, id)) return 'Compre essa arma primeiro.';
    p.equipped.weapon = id;
    return null;
  }
  if (!owns(p, `${slot}:${id}`)) return 'Compre esse item primeiro.';
  p.equipped[slot] = id;
  return null;
}

/** Completa perfis antigos (sem acessório ou arma favorita) sem mexer em moedas nem compras. */
export function normalizeProfile(p: Profile): boolean {
  let changed = false;
  if (!Array.isArray(p.owned)) {
    p.owned = [];
    changed = true;
  }
  if (!p.equipped) {
    p.equipped = { char: 'kael', skin: 'padrao', trail: 'nenhum', acc: 'nenhum', weapon: 'assinatura' };
    changed = true;
  }
  if (!p.equipped.acc) {
    p.equipped.acc = 'nenhum';
    changed = true;
  }
  if (!p.equipped.weapon) {
    p.equipped.weapon = 'assinatura';
    changed = true;
  }
  if (grantStarters(p)) changed = true;
  if (!owns(p, 'char:' + p.equipped.char)) {
    p.equipped.char = 'kael';
    changed = true;
  }
  if (!owns(p, 'skin:' + p.equipped.skin)) {
    p.equipped.skin = 'padrao';
    changed = true;
  }
  if (!owns(p, 'trail:' + p.equipped.trail)) {
    p.equipped.trail = 'nenhum';
    changed = true;
  }
  if (!owns(p, 'acc:' + p.equipped.acc)) {
    p.equipped.acc = 'nenhum';
    changed = true;
  }
  if (!canEquipWeapon(p, p.equipped.weapon)) {
    p.equipped.weapon = 'assinatura';
    changed = true;
  }
  if (syncPowerUnlocks(p)) changed = true;
  return changed;
}

/** O que entra na partida: o servidor e a tela usam a mesma conferência. */
export function acceptedLoadout(p: Profile, raw: Partial<Loadout> | null | undefined): Loadout {
  normalizeProfile(p);
  return sanitizeLoadout(raw, (k) => owns(p, k));
}

export type MatchMode = 'duelo' | 'dupla';

export interface MatchResult {
  mode: MatchMode;
  placement: number; // 1 = venceu
  players: number;
  score: number;
  kills: number;
  online: boolean;
}

/** Moedas ganhas numa partida (limitado para não haver abuso). */
export function matchReward(r: MatchResult): number {
  let c = 10 + Math.min(40, r.kills * 6);
  if (r.placement === 1 && r.players > 1) c += r.mode === 'duelo' ? 30 : 25;
  else if (r.placement === 2 && r.players > 2) c += 10;
  if (r.online) c = Math.round(c * 1.5);
  return Math.min(120, c);
}

export function levelOf(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 50));
}
