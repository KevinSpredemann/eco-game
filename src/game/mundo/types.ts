// ECO Mundo: progresso de um personagem. Solo agora.
// O formato já cabe num futuro co-op de 2 (party) e num mundo compartilhado
// em que PvP só existe nas regiões listadas em session.pvpZones.

export type MundoRegionId = 'vila' | 'floresta';
export type MundoSlot = 'weapon' | 'armor' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type MonsterKind = 'chaser' | 'ranged' | 'caller' | 'boss';
export type SessionMode = 'solo' | 'coop' | 'shared';
export type StatId = 'hp' | 'dmg' | 'speed' | 'cd';

export interface MundoGear {
  id: string;
  slot: MundoSlot;
  rarity: Rarity;
  name: string;
  /** 1 comum, 2 raro, 3 épico, 5 lendário */
  power: number;
}

export interface MundoStats {
  hp: number;
  dmg: number;
  speed: number;
  cd: number;
}

export interface MundoTomb {
  x: number;
  y: number;
  region: MundoRegionId;
  items: MundoGear[];
  /** epoch ms: some 10 minutos depois da morte */
  until: number;
}

export interface MundoSession {
  mode: SessionMode;
  /** regiões onde dois jogadores podem se ferir, no modo shared */
  pvpZones: string[];
}

export interface MundoSave {
  v: 1;
  charId: string;
  xp: number;
  level: number;
  points: number;
  stats: MundoStats;
  /** moedas na bolsa (caem em parte na morte) */
  coins: number;
  /** moedas no banco (seguem salvas) */
  bank: number;
  materials: number;
  weapon: MundoGear | null;
  armor: MundoGear | null;
  relic: MundoGear | null;
  bag: MundoGear[];
  tomb: MundoTomb | null;
  /** ids do grupo. Vazio no solo. No máximo você e mais um, para o co-op. */
  party: string[];
  session: MundoSession;
}

export interface MundoInput {
  mx: number;
  my: number;
  aim: number;
  fire: boolean;
  ability: boolean;
}
