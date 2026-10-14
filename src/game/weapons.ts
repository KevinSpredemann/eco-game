// Armas e itens dos modos com combate.
// Cada personagem tem a SUA arma principal (infinita). As armas pegas na arena são temporárias.

export type WeaponId =
  // principais (uma por personagem)
  | 'blaster'
  | 'pulsador'
  | 'dardos'
  | 'canhao'
  | 'rifle'
  | 'estelar'
  | 'dados'
  | 'shuriken'
  | 'rebite'
  | 'luz'
  | 'punhos'
  | 'cristal'
  | 'choque'
  | 'orbe'
  | 'pregos'
  | 'besta'
  // padrão (escolha de equipamento)
  | 'fuzil'
  | 'espingarda'
  | 'submetra'
  | 'lancador'
  // especiais (Chefe e dardo marcador)
  | 'colosso'
  | 'marcador'
  | 'acido'
  // pegas na arena
  | 'metralhadora'
  | 'escopeta'
  | 'laser'
  | 'foguete'
  | 'congelante'
  // padrão extras (escolha de equipamento)
  | 'arco'
  | 'plasma'
  | 'agulha';
export type ItemId = 'bomba' | 'mina' | 'gelo' | 'kit' | 'pulso';
/** função da arma (aparece na escolha de equipamento) */
export type WeaponCategory = 'equilibrada' | 'precisao' | 'curto' | 'area' | 'rapida' | 'controle' | 'suporte';
export const CATEGORY_LABEL: Record<WeaponCategory, string> = {
  equilibrada: 'Equilibrada',
  precisao: 'Precisão / longo alcance',
  curto: 'Curto alcance',
  area: 'Controle de área',
  rapida: 'Disparo rápido',
  controle: 'Controle',
  suporte: 'Suporte',
};

export interface WeaponDef {
  id: WeaponId;
  name: string;
  cooldown: number;
  speed: number;
  damage: number;
  life: number;
  pellets: number;
  /** abertura total do leque (rad); tiro único: 0 = perfeitamente reto */
  spread: number;
  pierce: boolean;
  /** duração (s) ou munição; 0 = infinita */
  time: number;
  ammo: number;
  color: string;
  /** alcance ideal (usado pelos bots) */
  range: number;
  /** empurrão no alvo */
  knock?: number;
  /** deixa o alvo lento por N s */
  slow?: number;
  /** atordoa por N s */
  stun?: number;
  /** cura quem atirou (fração do dano) */
  heal?: number;
  /** tamanho do projétil */
  size?: number;
  /** visual do cano */
  gun: { len: number; body: string; tip: string };
  /** função (para a tela de equipamento) */
  cat?: WeaponCategory;
  /** explode ao bater (lança-granadas/foguete) */
  blast?: { r: number; dmg: number };
}

const W = (d: WeaponDef) => d;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  // DPS de referência ~30–40. Mais dano = mais lenta, mais curta ou mais difícil de acertar.
  blaster: W({ id: 'blaster', name: 'Pistola', cat: 'equilibrada', cooldown: 0.34, speed: 700, damage: 11, life: 0.8, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#9ef0ff', range: 300, gun: { len: 14, body: '#2a2438', tip: '#9ef0ff' } }),
  // ---- principais (assinatura de cada personagem)
  pulsador: W({ id: 'pulsador', name: 'Pulsador', cat: 'rapida', cooldown: 0.18, speed: 760, damage: 6, life: 0.62, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#3ee8ff', range: 270, size: 3, gun: { len: 16, body: '#1a2a5a', tip: '#3ee8ff' } }),
  dardos: W({ id: 'dardos', name: 'Dardos Sombrios', cat: 'controle', cooldown: 0.42, speed: 820, damage: 13, life: 0.75, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#ff4fc3', range: 330, slow: 0.5, gun: { len: 15, body: '#2b1830', tip: '#ff4fc3' } }),
  canhao: W({ id: 'canhao', name: 'Canhão de Energia', cat: 'curto', cooldown: 0.65, speed: 620, damage: 8, life: 0.42, pellets: 3, spread: 0.3, pierce: false, time: 0, ammo: 0, color: '#5dff8a', range: 190, knock: 140, size: 4, gun: { len: 18, body: '#1e3a26', tip: '#5dff8a' } }),
  rifle: W({ id: 'rifle', name: 'Rifle de Precisão', cat: 'precisao', cooldown: 0.85, speed: 1350, damage: 28, life: 0.7, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#ffd23e', range: 460, gun: { len: 24, body: '#3a2a12', tip: '#ffd23e' } }),
  estelar: W({ id: 'estelar', name: 'Lança-estrelas', cat: 'equilibrada', cooldown: 0.46, speed: 640, damage: 8, life: 0.7, pellets: 2, spread: 0.16, pierce: false, time: 0, ammo: 0, color: '#ff7a59', range: 280, size: 4, gun: { len: 15, body: '#3a2238', tip: '#ffb0d0' } }),
  dados: W({ id: 'dados', name: 'Disparo de Dados', cat: 'precisao', cooldown: 0.5, speed: 900, damage: 13, life: 0.6, pellets: 1, spread: 0, pierce: true, time: 0, ammo: 0, color: '#a678ff', range: 330, gun: { len: 16, body: '#251c3a', tip: '#a678ff' } }),
  shuriken: W({ id: 'shuriken', name: 'Shurikens', cat: 'curto', cooldown: 0.5, speed: 760, damage: 6, life: 0.5, pellets: 3, spread: 0.22, pierce: false, time: 0, ammo: 0, color: '#ff3b5c', range: 240, size: 4, gun: { len: 8, body: '#141622', tip: '#ff3b5c' } }),
  rebite: W({ id: 'rebite', name: 'Rebitadora', cat: 'rapida', cooldown: 0.15, speed: 700, damage: 5, life: 0.6, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#d6deec', range: 260, gun: { len: 18, body: '#4a5262', tip: '#ffb03b' } }),
  luz: W({ id: 'luz', name: 'Raio de Luz', cat: 'suporte', cooldown: 0.36, speed: 900, damage: 10, life: 0.65, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#36f5c0', range: 310, heal: 0.25, gun: { len: 14, body: '#e8fff6', tip: '#36f5c0' } }),
  punhos: W({ id: 'punhos', name: 'Punhos de Impacto', cat: 'curto', cooldown: 0.45, speed: 520, damage: 19, life: 0.17, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#ff8a3d', range: 90, knock: 300, slow: 0.3, size: 7, gun: { len: 6, body: '#ff8a3d', tip: '#ffd0a0' } }),
  cristal: W({ id: 'cristal', name: 'Cristais de Gelo', cat: 'controle', cooldown: 0.4, speed: 700, damage: 10, life: 0.7, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#9fe8ff', range: 300, slow: 0.7, gun: { len: 15, body: '#2a6a9a', tip: '#e8fbff' } }),
  choque: W({ id: 'choque', name: 'Choque', cat: 'controle', cooldown: 0.32, speed: 950, damage: 8, life: 0.3, pellets: 1, spread: 0, pierce: true, time: 0, ammo: 0, color: '#ffe14a', range: 200, slow: 0.3, gun: { len: 12, body: '#2a2418', tip: '#ffe14a' } }),
  orbe: W({ id: 'orbe', name: 'Orbe Gravitacional', cat: 'area', cooldown: 0.8, speed: 420, damage: 20, life: 1.2, pellets: 1, spread: 0, pierce: true, time: 0, ammo: 0, color: '#8c7cff', range: 340, size: 8, gun: { len: 12, body: '#221a5a', tip: '#c8c0ff' } }),
  pregos: W({ id: 'pregos', name: 'Pregadora', cat: 'rapida', cooldown: 0.15, speed: 760, damage: 5, life: 0.55, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#9dff4a', range: 250, gun: { len: 17, body: '#ff8a2a', tip: '#c8c8d0' } }),
  besta: W({ id: 'besta', name: 'Besta Silenciosa', cat: 'precisao', cooldown: 0.72, speed: 1100, damage: 22, life: 0.7, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#c8d0e0', range: 400, gun: { len: 20, body: '#3a3e48', tip: '#c8d0e0' } }),
  // ---- padrão (qualquer personagem pode escolher)
  fuzil: W({ id: 'fuzil', name: 'Fuzil Marcador', cat: 'precisao', cooldown: 0.95, speed: 1450, damage: 30, life: 0.72, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#fff2a8', range: 480, gun: { len: 25, body: '#2c3040', tip: '#fff2a8' } }),
  espingarda: W({ id: 'espingarda', name: 'Espingarda Tática', cat: 'curto', cooldown: 0.75, speed: 620, damage: 7, life: 0.3, pellets: 5, spread: 0.4, pierce: false, time: 0, ammo: 0, color: '#ffb07a', range: 150, knock: 110, gun: { len: 19, body: '#3a2416', tip: '#ffb07a' } }),
  submetra: W({ id: 'submetra', name: 'Submetralhadora', cat: 'rapida', cooldown: 0.11, speed: 720, damage: 4, life: 0.5, pellets: 1, spread: 0.12, pierce: false, time: 0, ammo: 0, color: '#c8ff9a', range: 220, gun: { len: 15, body: '#24282e', tip: '#c8ff9a' } }),
  lancador: W({ id: 'lancador', name: 'Lança-granadas', cat: 'area', cooldown: 1.1, speed: 460, damage: 5, life: 0.85, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#ffa04a', range: 320, size: 6, blast: { r: 60, dmg: 22 }, gun: { len: 20, body: '#3a4a2a', tip: '#ffa04a' } }),
  // ---- especiais
  colosso: W({ id: 'colosso', name: 'Rajada do Colosso', cat: 'area', cooldown: 0.55, speed: 560, damage: 8, life: 1.1, pellets: 3, spread: 0.26, pierce: false, time: 0, ammo: 0, color: '#ff6a3a', range: 420, size: 6, gun: { len: 22, body: '#2a1010', tip: '#ff6a3a' } }),
  marcador: W({ id: 'marcador', name: 'Dardo Marcador', cat: 'controle', cooldown: 1, speed: 950, damage: 8, life: 0.57, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 1, color: '#ffd23e', range: 540, size: 4, gun: { len: 12, body: '#3a2a12', tip: '#ffd23e' } }),
  acido: W({ id: 'acido', name: 'Ácido', cat: 'controle', cooldown: 1, speed: 300, damage: 14, life: 1.5, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 1, color: '#a6ff3a', range: 400, size: 8, slow: 1, gun: { len: 0, body: '#2a3a10', tip: '#a6ff3a' } }),
  // ---- pegas na arena (temporárias)
  metralhadora: W({ id: 'metralhadora', name: 'Metralhadora', cat: 'rapida', cooldown: 0.1, speed: 760, damage: 6, life: 0.65, pellets: 1, spread: 0.08, pierce: false, time: 7, ammo: 0, color: '#ffb347', range: 240, gun: { len: 20, body: '#2a2438', tip: '#ffb347' } }),
  escopeta: W({ id: 'escopeta', name: 'Escopeta', cat: 'curto', cooldown: 0.75, speed: 600, damage: 8, life: 0.38, pellets: 6, spread: 0.42, pierce: false, time: 8, ammo: 0, color: '#ff7a59', range: 150, knock: 120, gun: { len: 21, body: '#3a2416', tip: '#ff7a59' } }),
  laser: W({ id: 'laser', name: 'Laser', cat: 'precisao', cooldown: 0.8, speed: 1500, damage: 32, life: 0.6, pellets: 1, spread: 0, pierce: true, time: 0, ammo: 4, color: '#ff3bd4', range: 430, gun: { len: 23, body: '#2a1430', tip: '#ff3bd4' } }),
  foguete: W({ id: 'foguete', name: 'Foguete', cat: 'area', cooldown: 0.9, speed: 520, damage: 10, life: 1.2, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 3, color: '#ff9a3c', range: 330, blast: { r: 85, dmg: 42 }, gun: { len: 24, body: '#3a4a2a', tip: '#ff5a3c' } }),
  congelante: W({ id: 'congelante', name: 'Congelante', cat: 'controle', cooldown: 0.16, speed: 680, damage: 6, life: 0.6, pellets: 1, spread: 0.06, pierce: false, time: 8, ammo: 0, color: '#7ff0ff', range: 260, slow: 1.5, gun: { len: 19, body: '#1a3a5a', tip: '#7ff0ff' } }),
  arco: W({ id: 'arco', name: 'Arco Eco', cat: 'precisao', cooldown: 0.92, speed: 1180, damage: 28, life: 0.75, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#e8d7a8', range: 440, gun: { len: 22, body: '#4a3420', tip: '#e8d7a8' } }),
  plasma: W({ id: 'plasma', name: 'Plasma', cat: 'area', cooldown: 0.72, speed: 540, damage: 8, life: 0.7, pellets: 1, spread: 0, pierce: false, time: 0, ammo: 0, color: '#67f0ff', range: 280, size: 7, blast: { r: 46, dmg: 16 }, gun: { len: 16, body: '#143040', tip: '#67f0ff' } }),
  agulha: W({ id: 'agulha', name: 'Agulha', cat: 'rapida', cooldown: 0.14, speed: 980, damage: 4.2, life: 0.45, pellets: 1, spread: 0.04, pierce: false, time: 0, ammo: 0, color: '#d0ffe0', range: 240, gun: { len: 18, body: '#1c3024', tip: '#d0ffe0' } }),
};

/** arma principal de cada personagem */
export const PRIMARY: Record<string, WeaponId> = {
  kael: 'pulsador',
  luna: 'dardos',
  bruno: 'canhao',
  zoe: 'rifle',
  maya: 'estelar',
  zed: 'dados',
  nyx: 'shuriken',
  rex: 'rebite',
  iris: 'luz',
  tara: 'punhos',
  kai: 'cristal',
  leo: 'choque',
  mei: 'orbe',
  duda: 'pregos',
  bento: 'besta',
  vortex: 'plasma',
  nara: 'arco',
  vexa: 'agulha',
};
export function primaryOf(charId: string): WeaponId {
  return PRIMARY[charId] ?? 'blaster';
}
export function isPrimary(w: WeaponId) {
  return WEAPONS[w].time === 0 && WEAPONS[w].ammo === 0;
}
/** arma principal conforme o equipamento escolhido ('assinatura' = a do personagem) */
export function loadoutPrimary(charId: string, choice: string | undefined): WeaponId {
  if (choice && choice !== 'assinatura' && choice in WEAPONS && isPrimary(choice as WeaponId)) return choice as WeaponId;
  return primaryOf(charId);
}
/** dano por segundo aproximado (para comparar na tela de equipamento) */
export function weaponDps(w: WeaponDef) {
  return ((w.damage * w.pellets + (w.blast?.dmg ?? 0)) / w.cooldown);
}

export const ITEMS: Record<ItemId, { name: string; count: number; color: string }> = {
  bomba: { name: 'Bomba', count: 3, color: '#ff5a3c' },
  mina: { name: 'Mina', count: 2, color: '#c8ff3c' },
  gelo: { name: 'Gelo', count: 2, color: '#9fe8ff' },
  kit: { name: 'Kit', count: 1, color: '#5dffb8' },
  pulso: { name: 'Pulso', count: 2, color: '#c9a6ff' },
};
export const ICE_RADIUS = 110;
export const ICE_DAMAGE = 10;
export const KIT_HEAL = 45;
export const PULSE_RADIUS = 88;
export const PULSE_DAMAGE = 24;
export const PULSE_FUSE = 0.45;

export const BOMB_RADIUS = 105;
export const BOMB_DAMAGE = 40;
export const BOMB_FUSE = 0.9;
export const MINE_RADIUS = 90;
export const MINE_DAMAGE = 35;
export const MAX_HP = 150;
/** Ecos repetem os tiros com dano reduzido */
export const ECHO_DAMAGE_MULT = 0.4;
export const ROCKET_RADIUS = 85;
export const ROCKET_DAMAGE = 42;
/** altura da arma/tiros em relação aos pés */
export const GUN_Y = 24;
