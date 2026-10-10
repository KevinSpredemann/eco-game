export type AbilityId = 'turbo' | 'fase' | 'escudo' | 'teleporte' | 'explosao' | 'clone';
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
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'kael',
    name: 'Kael',
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
    name: 'Luna',
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
      desc: 'Some por 2 s: atravessa Ecos e perigos sem dano.',
      cooldown: 9,
      duration: 2,
    },
    art: 'art/char_luna.webp',
  },
  {
    id: 'bruno',
    name: 'Bruno',
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
      desc: 'Bloqueia 1 golpe por 3 s e desfaz Ecos que encostar.',
      cooldown: 10,
      duration: 3,
    },
    art: 'art/char_bruno.webp',
  },
  {
    id: 'zoe',
    name: 'Zoe',
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
      desc: 'Teleporta 190 unidades na direção em que você anda.',
      cooldown: 6,
      duration: 0,
    },
    art: 'art/char_zoe.webp',
  },
  {
    id: 'maya',
    name: 'Maya',
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
    name: 'Zed',
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
      desc: 'Holograma que coleta energia para você por 3,5 s.',
      cooldown: 10,
      duration: 3.5,
    },
    art: 'art/char_zed.webp',
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
