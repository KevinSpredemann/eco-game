import { propSolids } from './scenery';
import type { MonsterKind, MundoRegionId } from './types';

export const PORTAL_R = 52;
export const INTERACT_R = 130;

export interface RegionDef {
  id: MundoRegionId;
  name: string;
  w: number;
  h: number;
  /** hub: jogador não leva dano */
  safe: boolean;
  spawn: { x: number; y: number };
  arrival: { x: number; y: number };
  portal: { x: number; y: number; to: MundoRegionId; label: string };
  shop?: { x: number; y: number };
  bank?: { x: number; y: number };
  blocks: { x: number; y: number; w: number; h: number }[];
  trees: { x: number; y: number; r: number }[];
  spawns: { kind: MonsterKind; x: number; y: number }[];
}

export const REGIONS: Record<MundoRegionId, RegionDef> = {
  vila: {
    id: 'vila',
    name: 'Vila',
    w: 2200,
    h: 1500,
    safe: true,
    spawn: { x: 420, y: 640 },
    arrival: { x: 1480, y: 640 },
    portal: { x: 1680, y: 640, to: 'floresta', label: 'Floresta' },
    shop: { x: 560, y: 760 },
    bank: { x: 900, y: 760 },
    blocks: [
      { x: 470, y: 340, w: 180, h: 120 },
      { x: 760, y: 330, w: 160, h: 110 },
      { x: 1040, y: 400, w: 140, h: 100 },
    ],
    trees: [
      { x: 280, y: 280, r: 26 },
      { x: 360, y: 920, r: 22 },
      { x: 1200, y: 860, r: 24 },
    ],
    spawns: [],
  },
  floresta: {
    id: 'floresta',
    name: 'Floresta',
    w: 3200,
    h: 2300,
    safe: false,
    spawn: { x: 280, y: 1000 },
    arrival: { x: 300, y: 1000 },
    portal: { x: 150, y: 1000, to: 'vila', label: 'Vila' },
    blocks: [
      { x: 980, y: 860, w: 90, h: 70 },
      { x: 1500, y: 1200, w: 110, h: 80 },
    ],
    trees: [
      { x: 520, y: 420, r: 28 },
      { x: 640, y: 1500, r: 24 },
      { x: 1280, y: 360, r: 30 },
      { x: 1700, y: 1680, r: 26 },
      { x: 2100, y: 480, r: 28 },
      { x: 2460, y: 1500, r: 24 },
    ],
    spawns: [
      { kind: 'chaser', x: 720, y: 780 },
      { kind: 'chaser', x: 980, y: 1280 },
      { kind: 'chaser', x: 1460, y: 640 },
      { kind: 'ranged', x: 1180, y: 1500 },
      { kind: 'ranged', x: 1680, y: 900 },
      { kind: 'caller', x: 860, y: 1560 },
      { kind: 'caller', x: 1880, y: 1460 },
      { kind: 'boss', x: 2300, y: 1100 },
    ],
  },
};

export function blocked(region: RegionDef, x: number, y: number, rad = 16): boolean {
  if (x < rad || y < rad || x > region.w - rad || y > region.h - rad) return true;
  for (const b of region.blocks) {
    if (x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad) return true;
  }
  for (const t of region.trees) {
    if (Math.hypot(x - t.x, y - t.y) < t.r * 0.55 + rad * 0.35) return true;
  }
  for (const b of propSolids(region.id)) {
    if (x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad) return true;
  }
  return false;
}
