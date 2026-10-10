export const WORLD_W = 1280;
export const WORLD_H = 720;
export const BORDER = 30;

export type Rect = { x: number; y: number; w: number; h: number };
export type Circle = { x: number; y: number; r: number };
export type Pt = { x: number; y: number };

export interface Bridge extends Rect {
  /** período do ciclo (s); 0 = permanente */
  period: number;
  phase: number;
  vertical?: boolean;
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
  islands?: Rect[];
  bridges?: Bridge[];
  conveyors?: Conveyor[];
  pistons?: Piston[];
  beams?: Beam[];
  lasers?: Laser[];
  bushes?: Circle[];
  wells?: Well[];
  /** 1 = normal; menor = mais escorregadio */
  grip: number;
  music: { root: number; scale: number[]; bpm: number };
}

const MINOR = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 7, 9];
const PHRYG = [0, 1, 5, 7, 8];

export const ARENAS: ArenaDef[] = [
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
    ],
    pillars: [
      { x: 500, y: 300, r: 22 },
      { x: 780, y: 300, r: 22 },
      { x: 500, y: 420, r: 22 },
      { x: 780, y: 420, r: 22 },
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
      { x: 90, y: 360 },
      { x: 1190, y: 360 },
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
];

export function getArena(id: string): ArenaDef {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
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
