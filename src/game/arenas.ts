import { STUDIO_ARENAS } from './studioArenas';

/** Área jogável entre 2× e 3× o mapa de 1280×720. 1,58 linear ≈ 2,5× de área. Colisão, limites, spawns e nav usam este fator. */
export const ARENA_SCALE = 1.58;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const WORLD_W = Math.round(VIEW_W * ARENA_SCALE);
export const WORLD_H = Math.round(VIEW_H * ARENA_SCALE);
export const BORDER = Math.round(30 * ARENA_SCALE);

export type Rect = { x: number; y: number; w: number; h: number };
export type Circle = { x: number; y: number; r: number };
export type Pt = { x: number; y: number };

export interface Bridge extends Rect {
  /** período do ciclo (s); 0 = permanente */
  period: number;
  phase: number;
  vertical?: boolean;
  /** banco de areia do Recife: alaga no ciclo da maré, sem abrir um buraco */
  tide?: boolean;
}
export interface Conveyor extends Rect {
  vx: number;
  vy: number;
}
export interface Piston extends Rect {
  period: number;
  phase: number;
}
export interface Beam {
  x: number;
  y: number;
  len: number;
  speed: number;
  start: number;
}
export interface Laser {
  /** varre no eixo x, entre y0 e y1 */
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  speed: number;
  phase: number;
}
export interface Well {
  x: number;
  y: number;
  r: number;
  pull: number;
  range: number;
}

/** trem que cruza a pista de tempos em tempos */
export interface Train {
  y: number;
  h: number;
  period: number;
  phase: number;
  dir: 1 | -1;
  len: number;
}
/** rajadas de vento que empurram todo mundo */
export interface Wind {
  period: number;
  dur: number;
  force: number;
}
/** redemoinho que anda pela arena */
export interface Tornado {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  speed: number;
  phase: number;
  r: number;
}

export interface ArenaPalette {
  bg: string;
  floorA: string;
  floorB: string;
  grid: string;
  wall: string;
  wallTop: string;
  wallEdge: string;
  accent: string;
  hazard: string;
}

export interface ArenaDef {
  id: string;
  name: string;
  desc: string;
  gimmick: string;
  art: string;
  palette: ArenaPalette;
  walls: Rect[];
  pillars: Circle[];
  spawns: Pt[];
  cores: Pt[];
  zones: Circle[];
  portals?: [Pt, Pt][];
  /** alavanca de um uso. Enquanto fechada, `door` bloqueia. */
  levers?: { id: string; x: number; y: number; door: Rect }[];
  islands?: Rect[];
  bridges?: Bridge[];
  conveyors?: Conveyor[];
  pistons?: Piston[];
  beams?: Beam[];
  lasers?: Laser[];
  bushes?: Circle[];
  wells?: Well[];
  /** poças de lava (sempre perigosas) */
  lava?: Circle[];
  /** gelo escorregadio */
  ice?: Rect[];
  /** areia movediça (lenta e puxa para o centro) */
  sand?: Circle[];
  trains?: Train[];
  wind?: Wind;
  tornados?: Tornado[];
  /** como as zonas de perigo aparecem */
  zoneStyle?: 'eletrico' | 'meteoro' | 'avalanche' | 'tempestade';
  /** 1 = normal; menor = mais escorregadio */
  grip: number;
  music: { root: number; scale: number[]; bpm: number };
  /** distância original entre os dois nascimentos do X1, antes da escala */
  duelSep?: number;
}

const MINOR = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 7, 9];
const PHRYG = [0, 1, 5, 7, 8];

const ALL_ARENAS: ArenaDef[] = [
  {
    id: 'lab',
    name: 'Laboratório Sombrio',
    desc: 'Corredores, portais e plataformas de energia.',
    gimmick: 'Portais ligam cantos opostos.',
    art: 'art/arena_lab.webp',
    palette: {
      bg: '#050b14',
      floorA: '#0b1a26',
      floorB: '#0e2130',
      grid: 'rgba(60,255,200,0.07)',
      wall: '#13293a',
      wallTop: '#1d4257',
      wallEdge: '#3cffc8',
      accent: '#3cffc8',
      hazard: '#ff8a1e',
    },
    walls: [
      { x: 250, y: 160, w: 200, h: 36 },
      { x: 830, y: 160, w: 200, h: 36 },
      { x: 250, y: 524, w: 200, h: 36 },
      { x: 830, y: 524, w: 200, h: 36 },
      { x: 170, y: 290, w: 36, h: 140 },
      { x: 1074, y: 290, w: 36, h: 140 },
      { x: 600, y: 30, w: 80, h: 70 },
      { x: 600, y: 620, w: 80, h: 70 },
      // cobertura baixa no flanco esquerdo. O corredor central (depois da escala, y ≈ 360) continua livre.
      { x: 48, y: 340, w: 86, h: 20 },
    ],
    pillars: [
      { x: 500, y: 300, r: 22 },
      { x: 780, y: 300, r: 22 },
      { x: 500, y: 420, r: 22 },
      { x: 780, y: 420, r: 22 },
    ],
    levers: [
      // canto norte, fora do corredor y=360 e longe dos portais
      { id: 'lab-norte', x: 400, y: 110, door: { x: 380, y: 130, w: 50, h: 18 } },
    ],
    portals: [
      [
        { x: 95, y: 95 },
        { x: 1185, y: 625 },
      ],
      [
        { x: 1185, y: 95 },
        { x: 95, y: 625 },
      ],
    ],
    spawns: [
      { x: 90, y: 220 },
      { x: 1190, y: 220 },
      { x: 640, y: 150 },
      { x: 640, y: 570 },
      { x: 350, y: 90 },
      { x: 930, y: 630 },
      { x: 350, y: 630 },
      { x: 930, y: 90 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 350, y: 360 },
      { x: 930, y: 360 },
      { x: 640, y: 250 },
      { x: 640, y: 470 },
    ],
    zones: [
      { x: 350, y: 260, r: 70 },
      { x: 930, y: 260, r: 70 },
      { x: 350, y: 460, r: 70 },
      { x: 930, y: 460, r: 70 },
      { x: 640, y: 160, r: 64 },
      { x: 640, y: 560, r: 64 },
      { x: 120, y: 200, r: 60 },
      { x: 1160, y: 520, r: 60 },
    ],
    grip: 1,
    music: { root: 45, scale: MINOR, bpm: 118 },
  },
  {
    id: 'cidade',
    name: 'Cidade Flutuante',
    desc: 'Ilhas suspensas e pontes de energia que somem.',
    gimmick: 'Pontes piscam antes de desligar. Cair custa 1 vida.',
    art: 'art/arena_cidade.webp',
    palette: {
      bg: '#6aa8ff',
      floorA: '#2c4a7a',
      floorB: '#355a8f',
      grid: 'rgba(255,255,255,0.06)',
      wall: '#3a2f6b',
      wallTop: '#5b4a9e',
      wallEdge: '#ffd27a',
      accent: '#8fd8ff',
      hazard: '#ff8a1e',
    },
    walls: [],
    pillars: [
      { x: 170, y: 120, r: 20 },
      { x: 1110, y: 120, r: 20 },
      { x: 170, y: 600, r: 20 },
      { x: 1110, y: 600, r: 20 },
    ],
    islands: [
      { x: 50, y: 50, w: 350, h: 250 },
      { x: 880, y: 50, w: 350, h: 250 },
      { x: 50, y: 420, w: 350, h: 250 },
      { x: 880, y: 420, w: 350, h: 250 },
      { x: 500, y: 210, w: 280, h: 300 },
    ],
    bridges: [
      { x: 398, y: 236, w: 104, h: 56, period: 0, phase: 0 },
      { x: 778, y: 236, w: 104, h: 56, period: 0, phase: 0 },
      { x: 398, y: 428, w: 104, h: 56, period: 0, phase: 0 },
      { x: 778, y: 428, w: 104, h: 56, period: 0, phase: 0 },
      { x: 398, y: 90, w: 484, h: 52, period: 11, phase: 0 },
      { x: 398, y: 578, w: 484, h: 52, period: 11, phase: 5.5 },
      { x: 190, y: 298, w: 64, h: 124, period: 9, phase: 2, vertical: true },
      { x: 1026, y: 298, w: 64, h: 124, period: 9, phase: 6.5, vertical: true },
    ],
    spawns: [
      { x: 120, y: 200 },
      { x: 1160, y: 520 },
      { x: 1160, y: 200 },
      { x: 120, y: 520 },
      { x: 300, y: 120 },
      { x: 980, y: 600 },
      { x: 980, y: 120 },
      { x: 300, y: 600 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 250, y: 175 },
      { x: 1030, y: 545 },
      { x: 1030, y: 175 },
      { x: 250, y: 545 },
    ],
    zones: [
      { x: 300, y: 220, r: 60 },
      { x: 980, y: 500, r: 60 },
      { x: 980, y: 220, r: 60 },
      { x: 300, y: 500, r: 60 },
      { x: 640, y: 270, r: 55 },
      { x: 640, y: 450, r: 55 },
    ],
    grip: 1,
    music: { root: 50, scale: DORIAN, bpm: 112 },
  },
  {
    id: 'templo',
    name: 'Templo Antigo',
    desc: 'Rotas circulares, colunas e feixes de fogo giratórios.',
    gimmick: 'Dois feixes de fogo giram sem parar. Leia o ritmo.',
    art: 'art/arena_templo.webp',
    palette: {
      bg: '#120904',
      floorA: '#3a2412',
      floorB: '#45301a',
      grid: 'rgba(255,190,90,0.07)',
      wall: '#4a3420',
      wallTop: '#6d5232',
      wallEdge: '#ffb347',
      accent: '#ffcf6b',
      hazard: '#ff5a1e',
    },
    walls: [
      { x: 30, y: 30, w: 150, h: 110 },
      { x: 1100, y: 30, w: 150, h: 110 },
      { x: 30, y: 580, w: 150, h: 110 },
      { x: 1100, y: 580, w: 150, h: 110 },
      { x: 590, y: 30, w: 100, h: 46 },
      { x: 590, y: 644, w: 100, h: 46 },
    ],
    pillars: Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return { x: 640 + Math.cos(a) * 240, y: 360 + Math.sin(a) * 200, r: 28 };
    }),
    beams: [
      { x: 330, y: 360, len: 170, speed: 1.05, start: 0 },
      { x: 950, y: 360, len: 170, speed: -1.05, start: Math.PI },
    ],
    spawns: [
      { x: 640, y: 120 },
      { x: 640, y: 600 },
      { x: 230, y: 180 },
      { x: 1050, y: 540 },
      { x: 1050, y: 180 },
      { x: 230, y: 540 },
      { x: 80, y: 360 },
      { x: 1200, y: 360 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 640, y: 150 },
      { x: 640, y: 575 },
      { x: 120, y: 360 },
      { x: 1160, y: 360 },
    ],
    zones: [
      { x: 470, y: 180, r: 60 },
      { x: 810, y: 540, r: 60 },
      { x: 810, y: 180, r: 60 },
      { x: 470, y: 540, r: 60 },
      { x: 640, y: 360, r: 70 },
      { x: 220, y: 620, r: 55 },
      { x: 1060, y: 100, r: 55 },
    ],
    grip: 1,
    music: { root: 43, scale: PHRYG, bpm: 108 },
  },
  {
    id: 'fabrica',
    name: 'Fábrica Abandonada',
    desc: 'Esteiras, pistões e máquinas enferrujadas.',
    gimmick: 'Esteiras empurram você. Pistões avisam antes de bater.',
    art: 'art/arena_fabrica.webp',
    palette: {
      bg: '#0d0806',
      floorA: '#2a1d16',
      floorB: '#33241b',
      grid: 'rgba(255,140,60,0.07)',
      wall: '#3b2c24',
      wallTop: '#5a4436',
      wallEdge: '#ff9a3c',
      accent: '#ffb35c',
      hazard: '#ff4a1e',
    },
    walls: [
      { x: 500, y: 270, w: 40, h: 180 },
      { x: 740, y: 270, w: 40, h: 180 },
      { x: 120, y: 300, w: 120, h: 50 },
      { x: 1040, y: 370, w: 120, h: 50 },
      { x: 30, y: 30, w: 90, h: 80 },
      { x: 1160, y: 610, w: 90, h: 80 },
    ],
    pillars: [],
    conveyors: [
      { x: 150, y: 150, w: 980, h: 64, vx: 150, vy: 0 },
      { x: 150, y: 506, w: 980, h: 64, vx: -150, vy: 0 },
    ],
    pistons: [
      { x: 330, y: 250, w: 80, h: 220, period: 4, phase: 0 },
      { x: 870, y: 250, w: 80, h: 220, period: 4, phase: 2 },
    ],
    spawns: [
      { x: 80, y: 420 },
      { x: 1200, y: 300 },
      { x: 640, y: 90 },
      { x: 640, y: 630 },
      { x: 300, y: 630 },
      { x: 980, y: 90 },
      { x: 300, y: 90 },
      { x: 980, y: 630 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 200, y: 430 },
      { x: 1080, y: 290 },
      { x: 640, y: 90 },
      { x: 640, y: 630 },
    ],
    zones: [
      { x: 640, y: 100, r: 56 },
      { x: 640, y: 620, r: 56 },
      { x: 200, y: 90, r: 56 },
      { x: 1080, y: 630, r: 56 },
      { x: 1080, y: 90, r: 56 },
      { x: 200, y: 630, r: 56 },
    ],
    grip: 1,
    music: { root: 41, scale: MINOR, bpm: 124 },
  },
  {
    id: 'floresta',
    name: 'Floresta Neon',
    desc: 'Vegetação luminosa, trilhas estreitas e camuflagem.',
    gimmick: 'Dentro dos arbustos você fica escondido (e um pouco mais lento).',
    art: 'art/arena_floresta.webp',
    palette: {
      bg: '#04060f',
      floorA: '#0b1622',
      floorB: '#0f1d2b',
      grid: 'rgba(120,120,255,0.05)',
      wall: '#16213a',
      wallTop: '#22325a',
      wallEdge: '#7a6bff',
      accent: '#59ffd0',
      hazard: '#ff7a2e',
    },
    walls: [],
    pillars: [
      { x: 220, y: 150, r: 34 },
      { x: 330, y: 300, r: 30 },
      { x: 180, y: 470, r: 36 },
      { x: 360, y: 590, r: 30 },
      { x: 470, y: 160, r: 28 },
      { x: 540, y: 470, r: 34 },
      { x: 740, y: 250, r: 34 },
      { x: 810, y: 560, r: 30 },
      { x: 930, y: 140, r: 32 },
      { x: 950, y: 420, r: 36 },
      { x: 1100, y: 270, r: 30 },
      { x: 1090, y: 590, r: 34 },
      { x: 640, y: 640, r: 26 },
      { x: 640, y: 80, r: 26 },
    ],
    bushes: [
      { x: 330, y: 160, r: 58 },
      { x: 950, y: 560, r: 58 },
      { x: 120, y: 330, r: 52 },
      { x: 1160, y: 420, r: 52 },
      { x: 640, y: 360, r: 46 },
      { x: 760, y: 400, r: 48 },
      { x: 500, y: 320, r: 48 },
      { x: 820, y: 110, r: 50 },
      { x: 460, y: 620, r: 50 },
    ],
    spawns: [
      { x: 80, y: 80 },
      { x: 1200, y: 640 },
      { x: 1200, y: 80 },
      { x: 80, y: 640 },
      { x: 640, y: 180 },
      { x: 640, y: 540 },
      { x: 400, y: 420 },
      { x: 880, y: 300 },
    ],
    cores: [
      { x: 640, y: 260 },
      { x: 250, y: 600 },
      { x: 1030, y: 120 },
      { x: 640, y: 470 },
      { x: 1180, y: 340 },
    ],
    zones: [
      { x: 420, y: 470, r: 60 },
      { x: 860, y: 260, r: 60 },
      { x: 250, y: 260, r: 55 },
      { x: 1030, y: 480, r: 55 },
      { x: 640, y: 360, r: 60 },
      { x: 120, y: 600, r: 55 },
    ],
    grip: 1,
    music: { root: 47, scale: DORIAN, bpm: 110 },
  },
  {
    id: 'espaco',
    name: 'Espaço Sideral',
    desc: 'Gravidade baixa, um buraco negro e lasers de varredura.',
    gimmick: 'Tudo escorrega. O buraco negro puxa — e engole.',
    art: 'art/arena_espaco.webp',
    palette: {
      bg: '#03020a',
      floorA: '#0c0a24',
      floorB: '#120e30',
      grid: 'rgba(200,120,255,0.07)',
      wall: '#251c4d',
      wallTop: '#3a2d73',
      wallEdge: '#c77dff',
      accent: '#ff5df0',
      hazard: '#ff4a6e',
    },
    walls: [],
    pillars: [
      { x: 330, y: 360, r: 34 },
      { x: 950, y: 360, r: 34 },
      { x: 640, y: 120, r: 28 },
      { x: 640, y: 600, r: 28 },
    ],
    wells: [{ x: 640, y: 360, r: 30, pull: 330, range: 230 }],
    lasers: [
      { y0: 30, y1: 330, x0: 60, x1: 1220, speed: 130, phase: 0 },
      { y0: 390, y1: 690, x0: 60, x1: 1220, speed: 130, phase: 0.5 },
    ],
    spawns: [
      { x: 120, y: 120 },
      { x: 1160, y: 600 },
      { x: 1160, y: 120 },
      { x: 120, y: 600 },
      { x: 400, y: 200 },
      { x: 880, y: 520 },
      { x: 880, y: 200 },
      { x: 400, y: 520 },
    ],
    cores: [
      { x: 230, y: 210 },
      { x: 1050, y: 510 },
      { x: 1050, y: 210 },
      { x: 230, y: 510 },
      { x: 640, y: 230 },
    ],
    zones: [
      { x: 480, y: 160, r: 58 },
      { x: 800, y: 560, r: 58 },
      { x: 800, y: 160, r: 58 },
      { x: 480, y: 560, r: 58 },
      { x: 120, y: 360, r: 55 },
      { x: 1160, y: 360, r: 55 },
    ],
    grip: 0.28,
    music: { root: 48, scale: PHRYG, bpm: 116 },
  },
  {
    id: 'vulcao',
    name: 'Vulcão Ardente',
    desc: 'Rios de lava, rochas quentes e chuva de meteoros.',
    gimmick: 'Lava queima sempre. Os círculos avisam onde o meteoro vai cair.',
    art: '',
    palette: {
      bg: '#0a0302',
      floorA: '#2a1410',
      floorB: '#331a14',
      grid: 'rgba(255,120,40,0.06)',
      wall: '#2a1a16',
      wallTop: '#4a2e24',
      wallEdge: '#ff6a2a',
      accent: '#ffb35c',
      hazard: '#ff4a1e',
    },
    walls: [
      { x: 440, y: 96, w: 44, h: 150 },
      { x: 796, y: 474, w: 44, h: 150 },
      { x: 150, y: 384, w: 130, h: 40 },
      { x: 1000, y: 296, w: 130, h: 40 },
    ],
    pillars: [
      { x: 540, y: 540, r: 26 },
      { x: 740, y: 180, r: 26 },
      { x: 220, y: 120, r: 22 },
      { x: 1060, y: 600, r: 22 },
    ],
    lava: [
      { x: 640, y: 360, r: 66 },
      { x: 320, y: 230, r: 48 },
      { x: 960, y: 490, r: 48 },
      { x: 330, y: 590, r: 38 },
      { x: 950, y: 130, r: 38 },
    ],
    spawns: [
      { x: 90, y: 300 },
      { x: 1190, y: 420 },
      { x: 640, y: 90 },
      { x: 640, y: 630 },
      { x: 90, y: 640 },
      { x: 1190, y: 80 },
      { x: 420, y: 400 },
      { x: 860, y: 320 },
    ],
    cores: [
      { x: 640, y: 200 },
      { x: 640, y: 530 },
      { x: 170, y: 520 },
      { x: 1110, y: 200 },
      { x: 450, y: 380 },
    ],
    zones: [
      { x: 520, y: 260, r: 58 },
      { x: 760, y: 460, r: 58 },
      { x: 200, y: 250, r: 55 },
      { x: 1080, y: 470, r: 55 },
      { x: 820, y: 280, r: 52 },
      { x: 460, y: 470, r: 52 },
      { x: 640, y: 640, r: 50 },
    ],
    zoneStyle: 'meteoro',
    grip: 1,
    music: { root: 40, scale: PHRYG, bpm: 128 },
  },
  {
    id: 'gelo',
    name: 'Montanha Gelada',
    desc: 'Lago congelado, pinheiros e rajadas de vento.',
    gimmick: 'No gelo você escorrega. As setas avisam a rajada de vento.',
    art: '',
    palette: {
      bg: '#0c1626',
      floorA: '#dfe9f4',
      floorB: '#d2deeb',
      grid: 'rgba(80,120,170,0.08)',
      wall: '#7f9cbc',
      wallTop: '#b8d4ee',
      wallEdge: '#ffffff',
      accent: '#5ac8ff',
      hazard: '#ff6a3c',
    },
    walls: [
      { x: 470, y: 110, w: 70, h: 44 },
      { x: 740, y: 566, w: 70, h: 44 },
      { x: 40, y: 330, w: 90, h: 60 },
      { x: 1150, y: 330, w: 90, h: 60 },
    ],
    pillars: [
      { x: 210, y: 150, r: 26 },
      { x: 1070, y: 570, r: 26 },
      { x: 210, y: 570, r: 24 },
      { x: 1070, y: 150, r: 24 },
      { x: 640, y: 100, r: 22 },
      { x: 640, y: 620, r: 22 },
    ],
    ice: [
      { x: 340, y: 230, w: 600, h: 260 },
      { x: 90, y: 440, w: 160, h: 90 },
      { x: 1030, y: 190, w: 160, h: 90 },
    ],
    wind: { period: 11, dur: 2.6, force: 210 },
    spawns: [
      { x: 90, y: 200 },
      { x: 1190, y: 520 },
      { x: 640, y: 170 },
      { x: 640, y: 560 },
      { x: 90, y: 640 },
      { x: 1190, y: 80 },
      { x: 320, y: 90 },
      { x: 960, y: 630 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 260, y: 360 },
      { x: 1020, y: 360 },
      { x: 400, y: 600 },
      { x: 880, y: 120 },
    ],
    zones: [
      { x: 470, y: 300, r: 58 },
      { x: 810, y: 420, r: 58 },
      { x: 300, y: 600, r: 55 },
      { x: 980, y: 120, r: 55 },
      { x: 800, y: 200, r: 52 },
      { x: 480, y: 520, r: 52 },
    ],
    zoneStyle: 'avalanche',
    grip: 1,
    music: { root: 52, scale: DORIAN, bpm: 104 },
  },
  {
    id: 'metro',
    name: 'Metrô Neon',
    desc: 'Plataformas, colunas e trens que passam sem frear.',
    gimmick: 'Luz vermelha nos trilhos = trem chegando. Saia da linha!',
    art: '',
    palette: {
      bg: '#06040e',
      floorA: '#1a1830',
      floorB: '#201d3a',
      grid: 'rgba(255,80,200,0.06)',
      wall: '#2a2448',
      wallTop: '#3e3670',
      wallEdge: '#ff4fd8',
      accent: '#4af0ff',
      hazard: '#ff3b5c',
    },
    walls: [
      { x: 200, y: 300, w: 36, h: 120 },
      { x: 1044, y: 300, w: 36, h: 120 },
      { x: 520, y: 620, w: 90, h: 40 },
      { x: 670, y: 60, w: 90, h: 40 },
    ],
    pillars: [
      { x: 400, y: 360, r: 20 },
      { x: 640, y: 300, r: 20 },
      { x: 640, y: 420, r: 20 },
      { x: 880, y: 360, r: 20 },
    ],
    trains: [
      { y: 148, h: 72, period: 9, phase: 0, dir: 1, len: 560 },
      { y: 500, h: 72, period: 9, phase: 4.5, dir: -1, len: 560 },
    ],
    spawns: [
      { x: 90, y: 360 },
      { x: 1190, y: 360 },
      { x: 640, y: 80 },
      { x: 640, y: 640 },
      { x: 90, y: 640 },
      { x: 1190, y: 80 },
      { x: 300, y: 360 },
      { x: 980, y: 360 },
    ],
    cores: [
      { x: 640, y: 360 },
      { x: 160, y: 620 },
      { x: 1120, y: 90 },
      { x: 400, y: 640 },
      { x: 880, y: 80 },
    ],
    zones: [
      { x: 520, y: 360, r: 56 },
      { x: 760, y: 360, r: 56 },
      { x: 300, y: 650, r: 50 },
      { x: 980, y: 650, r: 50 },
      { x: 300, y: 80, r: 50 },
      { x: 980, y: 80, r: 50 },
    ],
    grip: 1,
    music: { root: 46, scale: MINOR, bpm: 132 },
  },
  {
    id: 'deserto',
    name: 'Ruínas do Deserto',
    desc: 'Templos em ruínas, areia movediça e um tornado.',
    gimmick: 'A areia movediça prende. O tornado arremessa quem encostar.',
    art: '',
    palette: {
      bg: '#1a0f06',
      floorA: '#d9b072',
      floorB: '#cfa566',
      grid: 'rgba(120,70,20,0.08)',
      wall: '#9a6a3a',
      wallTop: '#c8955a',
      wallEdge: '#ffe0a0',
      accent: '#ffcf6b',
      hazard: '#ff5a1e',
    },
    walls: [
      { x: 250, y: 430, w: 150, h: 34 },
      { x: 880, y: 256, w: 150, h: 34 },
      { x: 560, y: 40, w: 160, h: 40 },
      { x: 560, y: 640, w: 160, h: 40 },
    ],
    pillars: [
      { x: 160, y: 160, r: 24 },
      { x: 1120, y: 560, r: 24 },
      { x: 1120, y: 160, r: 24 },
      { x: 160, y: 560, r: 24 },
    ],
    sand: [
      { x: 420, y: 230, r: 62 },
      { x: 860, y: 490, r: 62 },
      { x: 640, y: 360, r: 46 },
    ],
    tornados: [{ cx: 640, cy: 360, rx: 400, ry: 220, speed: 0.32, phase: 0, r: 44 }],
    spawns: [
      { x: 90, y: 360 },
      { x: 1190, y: 360 },
      { x: 640, y: 130 },
      { x: 640, y: 590 },
      { x: 300, y: 90 },
      { x: 980, y: 630 },
      { x: 300, y: 630 },
      { x: 980, y: 90 },
    ],
    cores: [
      { x: 640, y: 240 },
      { x: 250, y: 300 },
      { x: 1030, y: 420 },
      { x: 1030, y: 160 },
      { x: 250, y: 580 },
    ],
    zones: [
      { x: 480, y: 450, r: 56 },
      { x: 800, y: 270, r: 56 },
      { x: 200, y: 450, r: 52 },
      { x: 1080, y: 270, r: 52 },
      { x: 640, y: 520, r: 52 },
    ],
    zoneStyle: 'tempestade',
    grip: 1,
    music: { root: 44, scale: PHRYG, bpm: 112 },
  },
  ...STUDIO_ARENAS,
];

/** Mapas de ilhas ligadas por pontes estreitas ("tubos"): saíram da escolha de mapa. */
export const RETIRED_ARENAS: ReadonlySet<string> = new Set(['cidade', 'recife']);

const PLAYABLE_RAW = ALL_ARENAS.filter((a) => !RETIRED_ARENAS.has(a.id));
const scaledCache = new Map<string, ArenaDef>();

function scaleArena(raw: ArenaDef): ArenaDef {
  const a = structuredClone(raw);
  const s0 = raw.spawns[0];
  const s1 = raw.spawns[1];
  a.duelSep = s0 && s1 ? Math.hypot(s1.x - s0.x, s1.y - s0.y) : 0;
  const S = ARENA_SCALE;
  const pt = (p: Pt) => {
    p.x *= S;
    p.y *= S;
  };
  const rect = (r: Rect) => {
    r.x *= S;
    r.y *= S;
    r.w *= S;
    r.h *= S;
  };
  const circ = (c: Circle) => {
    c.x *= S;
    c.y *= S;
    c.r *= S;
  };
  for (const w of a.walls) rect(w);
  for (const c of a.pillars) circ(c);
  for (const p of a.spawns) pt(p);
  for (const p of a.cores) pt(p);
  for (const z of a.zones) circ(z);
  for (const pair of a.portals ?? []) {
    pt(pair[0]);
    pt(pair[1]);
  }
  for (const lever of a.levers ?? []) {
    pt(lever);
    rect(lever.door);
  }
  for (const i of a.islands ?? []) rect(i);
  for (const b of a.bridges ?? []) rect(b);
  for (const c of a.conveyors ?? []) {
    rect(c);
    c.vx *= S;
    c.vy *= S;
  }
  for (const p of a.pistons ?? []) rect(p);
  for (const b of a.beams ?? []) {
    b.x *= S;
    b.y *= S;
    b.len *= S;
  }
  for (const l of a.lasers ?? []) {
    l.x0 *= S;
    l.x1 *= S;
    l.y0 *= S;
    l.y1 *= S;
    l.speed *= S;
  }
  for (const b of a.bushes ?? []) circ(b);
  for (const w of a.wells ?? []) {
    w.x *= S;
    w.y *= S;
    w.r *= S;
    w.range *= S;
  }
  for (const l of a.lava ?? []) circ(l);
  for (const i of a.ice ?? []) rect(i);
  for (const s of a.sand ?? []) circ(s);
  for (const t of a.trains ?? []) {
    t.y *= S;
    t.h *= S;
    t.len *= S;
  }
  for (const td of a.tornados ?? []) {
    td.cx *= S;
    td.cy *= S;
    td.rx *= S;
    td.ry *= S;
    td.r *= S;
  }
  for (const p of a.spawns) {
    const free = freeSpawn(a, p.x, p.y);
    p.x = free.x;
    p.y = free.y;
  }
  return a;
}

function freeSpawn(a: ArenaDef, x: number, y: number): Pt {
  if (!spawnBlocked(a, x, y, 14)) return { x, y };
  for (let r = 10; r <= 180; r += 10) {
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const nx = x + Math.cos(ang) * r;
      const ny = y + Math.sin(ang) * r;
      if (!spawnBlocked(a, nx, ny, 14)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

/** Mapas que dá para escolher e sortear (offline, sala e servidor). */
export function getArena(id: string): ArenaDef {
  const raw = ALL_ARENAS.find((a) => a.id === id) ?? PLAYABLE_RAW[0];
  let hit = scaledCache.get(raw.id);
  if (!hit) {
    hit = scaleArena(raw);
    scaledCache.set(raw.id, hit);
  }
  return hit;
}

export const ARENAS: ArenaDef[] = PLAYABLE_RAW.map((a) => getArena(a.id));

function spawnBlocked(a: ArenaDef, x: number, y: number, r = 16): boolean {
  if (x < BORDER + r || y < BORDER + r || x > WORLD_W - BORDER - r || y > WORLD_H - BORDER - r) return true;
  for (const w of a.walls) if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return true;
  for (const c of a.pillars) if (Math.hypot(x - c.x, y - c.y) < c.r + r) return true;
  for (const l of a.lava ?? []) if (Math.hypot(x - l.x, y - l.y) < l.r + r) return true;
  for (const w of a.wells ?? []) if (Math.hypot(x - w.x, y - w.y) < w.r + r) return true;
  if (a.islands) {
    const onIsle = a.islands.some((i) => x >= i.x + r && x <= i.x + i.w - r && y >= i.y + r && y <= i.y + i.h - r);
    const onBridge = (a.bridges ?? []).some((b) => !b.period && x >= b.x + 4 && x <= b.x + b.w - 4 && y >= b.y + 4 && y <= b.y + b.h - 4);
    if (!onIsle && !onBridge) return true;
  }
  return false;
}

/** Os dois nascimentos do X1: a separação de antes da escala, afastados só o bastante para sair de parede e lava. */
export function duelPoints(a: ArenaDef): [Pt, Pt] {
  const s0 = a.spawns[0];
  const s1 = a.spawns[1] ?? s0;
  if (!s0 || !s1) return [s0, s1];
  const dx = s1.x - s0.x;
  const dy = s1.y - s0.y;
  const full = Math.hypot(dx, dy) || 1;
  const ux = dx / full;
  const uy = dy / full;
  const mx = (s0.x + s1.x) / 2;
  const my = (s0.y + s1.y) / 2;
  let gap = Math.min(a.duelSep ?? full, full);
  while (gap < full - 1) {
    const p0 = { x: mx - ux * (gap / 2), y: my - uy * (gap / 2) };
    const p1 = { x: mx + ux * (gap / 2), y: my + uy * (gap / 2) };
    if (!spawnBlocked(a, p0.x, p0.y) && !spawnBlocked(a, p1.x, p1.y)) return [p0, p1];
    gap += 12;
  }
  return [{ x: s0.x, y: s0.y }, { x: s1.x, y: s1.y }];
}

/** Centro da câmera que segue o jogador sem mostrar fora do mundo. visW/visH são o recorte em unidades de mundo. */
export function cameraFocus(x: number, y: number, visW: number, visH: number): Pt {
  const cx = visW >= WORLD_W ? WORLD_W / 2 : Math.min(WORLD_W - visW / 2, Math.max(visW / 2, x));
  const cy = visH >= WORLD_H ? WORLD_H / 2 : Math.min(WORLD_H - visH / 2, Math.max(visH / 2, y));
  return { x: cx, y: cy };
}

/** id salvo de um mapa que saiu vira o primeiro mapa da lista */
export function playableArena(id: string): string {
  return ARENAS.some((a) => a.id === id) ? id : ARENAS[0].id;
}

// ---- geometria dinâmica (pura, usada pela simulação, IA e render) ----

export function bridgeState(b: Bridge, t: number): 'on' | 'warn' | 'off' {
  if (!b.period) return 'on';
  const c = (((t + b.phase) % b.period) + b.period) % b.period;
  const onFor = b.period * 0.62;
  if (c < onFor - 2) return 'on';
  if (c < onFor) return 'warn';
  return 'off';
}

/** estado do pistão: 0..1 de extensão e se está avisando */
export function pistonState(p: Piston, t: number): { phase: 'idle' | 'warn' | 'slam'; ext: number } {
  const c = (((t + p.phase) % p.period) + p.period) % p.period;
  const warnAt = p.period - 1.4;
  const slamAt = p.period - 0.55;
  if (c < warnAt) return { phase: 'idle', ext: 0 };
  if (c < slamAt) return { phase: 'warn', ext: 0.08 * Math.sin(c * 40) };
  const k = (c - slamAt) / 0.55;
  return { phase: 'slam', ext: k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 };
}

export function beamAngle(b: Beam, t: number): number {
  return b.start + b.speed * t;
}

export function laserX(l: Laser, t: number): number {
  const span = l.x1 - l.x0;
  const period = (span * 2) / l.speed;
  const c = ((t / period + l.phase) % 1 + 1) % 1;
  const k = c < 0.5 ? c * 2 : 2 - c * 2;
  return l.x0 + span * k;
}

export function inRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Terreno sólido para pisar (só relevante em arenas com ilhas). */
export function isGround(a: ArenaDef, x: number, y: number, t: number, safeBridgesOnly = false): boolean {
  if (!a.islands) return true;
  for (const i of a.islands) if (inRect(x, y, i)) return true;
  for (const b of a.bridges ?? []) {
    const s = bridgeState(b, t);
    if (s === 'off') continue;
    if (safeBridgesOnly && s === 'warn') continue;
    if (inRect(x, y, b)) return true;
  }
  return false;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let k = ((px - ax) * dx + (py - ay) * dy) / l2;
  k = Math.max(0, Math.min(1, k));
  const cx = ax + dx * k;
  const cy = ay + dy * k;
  return Math.hypot(px - cx, py - cy);
}

/** trem: 'warn' (luz vermelha) e 'pass' (passando). x0..x1 = parte ocupada pelo trem. */
export const TRAIN_PASS = 1.1;
export const TRAIN_WARN = 1.8;
export function trainState(tr: Train, t: number): { phase: 'idle' | 'warn' | 'pass'; x0: number; x1: number } {
  const c = (((t + tr.phase) % tr.period) + tr.period) % tr.period;
  const passAt = tr.period - TRAIN_PASS;
  if (c < passAt - TRAIN_WARN) return { phase: 'idle', x0: 0, x1: 0 };
  if (c < passAt) return { phase: 'warn', x0: 0, x1: 0 };
  const k = (c - passAt) / TRAIN_PASS;
  const travel = WORLD_W + tr.len;
  const head = tr.dir > 0 ? -tr.len + travel * k + tr.len : WORLD_W + tr.len - travel * k - tr.len;
  return tr.dir > 0 ? { phase: 'pass', x0: head - tr.len, x1: head } : { phase: 'pass', x0: head, x1: head + tr.len };
}

/** vento: 'warn' antes da rajada, 'blow' durante. dir alterna a cada rajada. */
export function windState(w: Wind, t: number): { phase: 'idle' | 'warn' | 'blow'; dir: 1 | -1 } {
  const n = Math.floor(t / w.period);
  const c = t - n * w.period;
  const dir: 1 | -1 = n % 2 ? -1 : 1;
  const blowAt = w.period - w.dur;
  if (c < blowAt - 1.6) return { phase: 'idle', dir };
  if (c < blowAt) return { phase: 'warn', dir };
  return { phase: 'blow', dir };
}

export function tornadoPos(td: Tornado, t: number): Pt {
  const a = td.phase + t * td.speed;
  return { x: td.cx + Math.cos(a) * td.rx, y: td.cy + Math.sin(a * 2) * td.ry * 0.6 + Math.sin(a) * td.ry * 0.4 };
}
