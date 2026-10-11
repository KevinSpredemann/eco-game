import { gearPrice } from './balance';
// Moedas, preços e itens de personalização. Usado pelo jogo e pelo servidor.

export const START_COINS = 150;

/** Personagens que todo mundo já tem. */
export const STARTER_CHARS = ['kael', 'luna', 'bruno'];

export const CHAR_PRICES: Record<string, number> = {
  kael: 0,
  luna: 0,
  bruno: 0,
  zoe: 300,
  maya: 300,
  zed: 400,
  nyx: 600,
  rex: 800,
  iris: 800,
  tara: 500,
  kai: 500,
  leo: 700,
  mei: 900,
  duda: 600,
  bento: 700,
};

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
  { id: 'noturno', name: 'Noturno', price: 150, suit: '#22222c', suitDark: '#0e0e14', glow: '#e8e8ff' },
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
  owned: string[]; // ids: "char:zoe", "skin:ouro", "trail:fogo"
  equipped: { char: string; skin: string; trail: string };
  /** nível da habilidade de cada personagem (ausente = 1) */
  abilityLv?: Record<string, number>;
}

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
  return {
    username,
    coins: START_COINS,
    xp: 0,
    wins: 0,
    matches: 0,
    owned: [...STARTER_CHARS.map((c) => 'char:' + c), 'skin:padrao', 'trail:nenhum'],
    equipped: { char: 'kael', skin: 'padrao', trail: 'nenhum' },
    abilityLv: {},
  };
}

export function itemPrice(item: string): number | null {
  const [kind, id] = item.split(':');
  if (kind === 'char') return id in CHAR_PRICES ? CHAR_PRICES[id] : null;
  if (kind === 'skin') return SKINS.find((s) => s.id === id)?.price ?? null;
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

export function equip(p: Profile, slot: 'char' | 'skin' | 'trail', id: string): string | null {
  if (!owns(p, `${slot}:${id}`)) return 'Compre esse item primeiro.';
  p.equipped[slot] = id;
  return null;
}

export type MatchMode = 'nucleo' | 'duelo' | 'combate' | 'bandeira' | 'rei' | 'ondas' | 'royale' | 'chefe' | 'treino';

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
  if (r.mode === 'treino') return 10;
  let c = 10;
  if (r.mode === 'nucleo' || r.mode === 'rei' || r.mode === 'bandeira') c += Math.min(40, Math.floor(r.score / 3));
  else if (r.mode === 'ondas') c += Math.min(50, r.kills * 2 + r.score);
  // Caça ao Chefe: pontos vêm de dano, geradores, curas e vitória (não só de quem mata)
  else if (r.mode === 'chefe') c += Math.min(50, Math.round(r.score * 1.2));
  else c += Math.min(40, r.kills * 6);
  if (r.placement === 1 && r.players > 1) c += r.mode === 'duelo' ? 30 : 25;
  else if (r.placement === 2 && r.players > 2) c += 10;
  if (r.online) c = Math.round(c * 1.5);
  return Math.min(120, c);
}

export function levelOf(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 50));
}
