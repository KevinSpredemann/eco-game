export type AbilityId =
  | 'turbo'
  | 'fase'
  | 'escudo'
  | 'teleporte'
  | 'explosao'
  | 'clone'
  | 'sombra'
  | 'torreta'
  | 'cura'
  | 'investida'
  | 'muralha'
  | 'raio'
  | 'gravidade'
  | 'gancho'
  | 'fumaca';
export type Headwear = 'mask' | 'ponytail' | 'cap' | 'goggles' | 'capgoggles' | 'hood';

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  tagline: string;
  /** cor da roupa */
  suit: string;
  suitDark: string;
  /** cor de identificação (contorno, Eco, placar) */
  color: string;
  hair: string;
  skin: string;
  headwear: Headwear;
  backpack?: string;
  ability: { id: AbilityId; name: string; label: string; desc: string; cooldown: number; duration: number };
  passive?: string;
  art: string;
  /** cor das luzes da roupa (skins trocam) */
  glow?: string;
  /** skin aplicada (entra na chave do cache de sprites) */
  skinId?: string;
  /** nível da habilidade (1 a 5) */
  abilityLv?: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'kael',
    name: 'Zephyr',
    title: 'O Equilibrado',
    tagline: 'Sempre tenta comunicar e liderar o grupo.',
    suit: '#2552b8',
    suitDark: '#142a66',
    color: '#3ee8ff',
    hair: '#5a3423',
    skin: '#f0c19c',
    headwear: 'mask',
    ability: {
      id: 'turbo',
      name: 'Velocidade',
      label: 'Turbo',
      desc: 'Corre 60% mais rápido por 2,5 s.',
      cooldown: 8,
      duration: 2.5,
    },
    art: 'art/char_kael.webp',
  },
  {
    id: 'luna',
    name: 'Kalypso',
    title: 'A Imprevisível',
    tagline: 'Vai na frente, se arrisca e adora um desafio.',
    suit: '#2a1630',
    suitDark: '#170b1c',
    color: '#ff4fc3',
    hair: '#ff3fa8',
    skin: '#f6cdb0',
    headwear: 'ponytail',
    ability: {
      id: 'fase',
      name: 'Invisibilidade',
      label: 'Fase',
      desc: 'Some por 1,6 s: atravessa Ecos, tiros e perigos. Atirar encerra o efeito.',
      cooldown: 9,
      duration: 2,
    },
    art: 'art/char_luna.webp',
  },
  {
    id: 'bruno',
    name: 'Bronzar',
    title: 'O Estrategista',
    tagline: 'Pensa no futuro e usa o ambiente a seu favor.',
    suit: '#2f8f4a',
    suitDark: '#17502a',
    color: '#5dff8a',
    hair: '#1d1410',
    skin: '#9a6440',
    headwear: 'cap',
    backpack: '#5b6b3a',
    ability: {
      id: 'escudo',
      name: 'Escudo',
      label: 'Escudo',
      desc: 'Escudo frontal por 2,2 s: devolve tiros que vêm da frente e reduz o resto.',
      cooldown: 10,
      duration: 3,
    },
    art: 'art/char_bruno.webp',
  },
  {
    id: 'zoe',
    name: 'Vesper',
    title: 'A Caçadora',
    tagline: 'Tem visão de jogo e acha os melhores atalhos.',
    suit: '#e8a412',
    suitDark: '#8a5a06',
    color: '#ffd23e',
    hair: '#7a4426',
    skin: '#f2c49e',
    headwear: 'goggles',
    ability: {
      id: 'teleporte',
      name: 'Teleporte',
      label: 'Salto',
      desc: 'Teleporta até 190 na direção mirada e dá um choque na chegada.',
      cooldown: 6,
      duration: 0,
    },
    art: 'art/char_zoe.webp',
  },
  {
    id: 'maya',
    name: 'Nova',
    title: 'A Sortuda',
    tagline: 'Confia na sorte — e a sorte costuma ajudar.',
    suit: '#3a2238',
    suitDark: '#21121f',
    color: '#ff7a59',
    hair: '#ff5fa0',
    skin: '#f8d0b4',
    headwear: 'capgoggles',
    backpack: '#d0662c',
    ability: {
      id: 'explosao',
      name: 'Explosão',
      label: 'Pulso',
      desc: 'Onda que empurra rivais (eles derrubam 1 energia) e desfaz Ecos.',
      cooldown: 10,
      duration: 0,
    },
    passive: 'Sorte: 20% de chance de pegar energia em dobro.',
    art: 'art/char_maya.webp',
  },
  {
    id: 'zed',
    name: 'Vortex',
    title: 'O Técnico',
    tagline: 'Hackeia tudo. Até a própria sombra.',
    suit: '#2b2140',
    suitDark: '#161026',
    color: '#a678ff',
    hair: '#120c1e',
    skin: '#e3b591',
    headwear: 'hood',
    backpack: '#3a2a5c',
    ability: {
      id: 'clone',
      name: 'Clone',
      label: 'Clone',
      desc: 'Holograma que coleta energia por 4 s (no combate vira uma torreta).',
      cooldown: 10,
      duration: 3.5,
    },
    art: 'art/char_zed.webp',
  },
  {
    id: 'nyx',
    name: 'Tenebris',
    title: 'A Sombra',
    tagline: 'Ninguém vê de onde ela vem.',
    suit: '#1d2030',
    suitDark: '#0b0d16',
    color: '#ff3b5c',
    hair: '#eef0ff',
    skin: '#f0c8a8',
    headwear: 'mask',
    ability: {
      id: 'sombra',
      name: 'Passo Sombrio',
      label: 'Sombra',
      desc: 'Salta 150 na direção mirada e some por 1,2 s. Atirar revela você.',
      cooldown: 7,
      duration: 1.5,
    },
    art: '',
  },
  {
    id: 'rex',
    name: 'Kron',
    title: 'O Robô',
    tagline: 'Feito de sucata, programado para vencer.',
    suit: '#6b7488',
    suitDark: '#353b48',
    color: '#d6deec',
    hair: '#9aa4b8',
    skin: '#b8c2d4',
    headwear: 'hood',
    backpack: '#4a5262',
    ability: {
      id: 'torreta',
      name: 'Torreta',
      label: 'Torreta',
      desc: 'Torreta por 5 s (40 de vida, dá para destruir): atira em rivais e afasta Ecos.',
      cooldown: 11,
      duration: 5,
    },
    art: '',
  },
  {
    id: 'iris',
    name: 'Aurora',
    title: 'A Curandeira',
    tagline: 'Enquanto ela estiver de pé, ninguém desiste.',
    suit: '#e8fff6',
    suitDark: '#9fd8c4',
    color: '#36f5c0',
    hair: '#b8a6ff',
    skin: '#f6d6bd',
    headwear: 'ponytail',
    ability: {
      id: 'cura',
      name: 'Cura',
      label: 'Cura',
      desc: 'Recupera 40 de vida e 25 nos aliados perto (no Núcleo: +1 coração).',
      cooldown: 12,
      duration: 0,
    },
    art: '',
  },
  {
    id: 'tara',
    name: 'Valkyra',
    title: 'A Muralha',
    tagline: 'Forte como um trator, gentil como uma avó.',
    suit: '#ff6a2a',
    suitDark: '#8a2a0a',
    color: '#ff8a3d',
    hair: '#24140c',
    skin: '#7a4a2c',
    headwear: 'ponytail',
    ability: {
      id: 'investida',
      name: 'Investida',
      label: 'Investida',
      desc: 'Avança como um touro: derruba e atordoa quem estiver no caminho.',
      cooldown: 8,
      duration: 0.38,
    },
    art: '',
  },
  {
    id: 'kai',
    name: 'Glacius',
    title: 'O Glacial',
    tagline: 'Calmo como o inverno. Ninguém passa.',
    suit: '#7fd8ff',
    suitDark: '#2a6a9a',
    color: '#9fe8ff',
    hair: '#dce8ff',
    skin: '#f3d2b8',
    headwear: 'goggles',
    ability: {
      id: 'muralha',
      name: 'Muralha de Gelo',
      label: 'Muralha',
      desc: 'Ergue um muro de gelo na direção mirada por 4 s: bloqueia tiros e passagem.',
      cooldown: 10,
      duration: 5,
    },
    art: '',
  },
  {
    id: 'leo',
    name: 'Voltz',
    title: 'O Elétrico',
    tagline: 'Fala rápido, pensa rápido, ataca mais rápido ainda.',
    suit: '#ffd21e',
    suitDark: '#9a6a00',
    color: '#ffe14a',
    hair: '#ffa62a',
    skin: '#f0c19c',
    headwear: 'mask',
    ability: {
      id: 'raio',
      name: 'Corrente Elétrica',
      label: 'Raio',
      desc: 'Raio que pula entre até 3 rivais perto. O primeiro fica atordoado por 0,4 s.',
      cooldown: 9,
      duration: 0,
    },
    art: '',
  },
  {
    id: 'mei',
    name: 'Orbis',
    title: 'A Gravitacional',
    tagline: 'Dobra o espaço como quem dobra papel.',
    suit: '#4a3aa8',
    suitDark: '#221a5a',
    color: '#8c7cff',
    hair: '#14101e',
    skin: '#f6d8be',
    headwear: 'ponytail',
    ability: {
      id: 'gravidade',
      name: 'Vórtice',
      label: 'Vórtice',
      desc: 'Abre um buraco negro no ponto mirado por 2,2 s: puxa rivais e explode no fim.',
      cooldown: 11,
      duration: 2.5,
    },
    art: '',
  },
  {
    id: 'duda',
    name: 'Rivet',
    title: 'A Inventora',
    tagline: 'Se não existe, ela constrói.',
    suit: '#8adf3a',
    suitDark: '#3a7a14',
    color: '#9dff4a',
    hair: '#6a3a1e',
    skin: '#e8b48c',
    headwear: 'goggles',
    backpack: '#8a6a3a',
    ability: {
      id: 'gancho',
      name: 'Gancho',
      label: 'Gancho',
      desc: 'Dispara um gancho: puxa você até a parede ou puxa o rival até você.',
      cooldown: 6,
      duration: 0,
    },
    art: '',
  },
  {
    id: 'bento',
    name: 'Nimbus',
    title: 'O Fantasma',
    tagline: 'Você nunca sabe se ele está ali.',
    suit: '#5a6070',
    suitDark: '#2a2e38',
    color: '#c8d0e0',
    hair: '#2a2a30',
    skin: '#d8a888',
    headwear: 'hood',
    ability: {
      id: 'fumaca',
      name: 'Bomba de Fumaça',
      label: 'Fumaça',
      desc: 'Nuvem de fumaça por 4 s: quem está dentro some, rivais ficam lentos.',
      cooldown: 10,
      duration: 5,
    },
    art: '',
  },
  {
    id: 'vortex',
    name: 'Vortex',
    title: 'O Plasma',
    tagline: 'Dispara, empurra e fecha o colapso.',
    suit: '#7a4ad0',
    suitDark: '#2a1848',
    color: '#c86bff',
    hair: '#1a1028',
    skin: '#e8c4a8',
    headwear: 'hood',
    ability: {
      id: 'raio',
      name: 'Descarga',
      label: 'Descarga',
      desc: 'Fora do X1 e do 2x2, um raio curto. Na luta ranqueada o kit de plasma é que vale.',
      cooldown: 9,
      duration: 0,
    },
    art: '',
  },
  {
    id: 'nara',
    name: 'Nara',
    title: 'A Raiz',
    tagline: 'Segura o chão e deixa a seiva trabalhar.',
    suit: '#2f8a4a',
    suitDark: '#143820',
    color: '#3dcc6a',
    hair: '#1a3a22',
    skin: '#e0b898',
    headwear: 'ponytail',
    ability: {
      id: 'cura',
      name: 'Seiva',
      label: 'Seiva',
      desc: 'Fora do X1 e do 2x2, uma cura curta. Na luta ranqueada o bosque é que cura.',
      cooldown: 10,
      duration: 0,
    },
    art: '',
  },
  {
    id: 'vexa',
    name: 'Vexa',
    title: 'A Sombra',
    tagline: 'Some um passo e deixa um duplo no lugar.',
    suit: '#3a3458',
    suitDark: '#161222',
    color: '#8a7cff',
    hair: '#0e0c14',
    skin: '#d8b8a0',
    headwear: 'hood',
    ability: {
      id: 'sombra',
      name: 'Manto',
      label: 'Manto',
      desc: 'Fora do X1 e do 2x2, some por um instante. Na luta ranqueada o piscar e a ilusão é que valem.',
      cooldown: 9,
      duration: 2,
    },
    art: '',
  },

];

import { SKINS } from './economy';
import { ABILITY_BAL, levelMult } from './balance';

// recarga e duração vêm da configuração central de balanceamento
for (const c of CHARACTERS) {
  const b = ABILITY_BAL[c.ability.id];
  c.ability.cooldown = b.cooldown;
  c.ability.duration = b.duration;
}

/** Personagem com a roupa (skin) aplicada. */
export function withSkin(c: CharacterDef, skinId: string | undefined): CharacterDef {
  const sk = SKINS.find((s) => s.id === skinId);
  if (!sk || !sk.suit) return c;
  return { ...c, suit: sk.suit, suitDark: sk.suitDark ?? c.suitDark, glow: sk.glow ?? c.color, skinId: sk.id };
}

/** níveis de habilidade (1 a 5). PvP: só um pouco menos de recarga; cooperativo: mais forte */
export const MAX_ABILITY_LV = 5;
export function abilityMult(lv: number, pve = false) {
  return levelMult(lv, pve);
}
/** personagem com a habilidade no nível dado */
export function withLevel(c: CharacterDef, lv: number | undefined, pve = false): CharacterDef {
  if (!lv || lv <= 1) return c;
  const m = abilityMult(lv, pve);
  return { ...c, abilityLv: lv, ability: { ...c.ability, cooldown: Math.round(c.ability.cooldown * m.cooldown * 10) / 10, duration: Math.round(c.ability.duration * m.duration * 100) / 100 } };
}

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
