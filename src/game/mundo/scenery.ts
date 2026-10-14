// Cenário do ECO Mundo. Sólidos entram na colisão. O ponto da porta fica livre.
import type { MundoRegionId } from './types';

export type PropKind = 'house' | 'shop' | 'bank' | 'forge' | 'tree' | 'bush' | 'rock' | 'lamp' | 'bench' | 'crate' | 'barrel' | 'log' | 'flower' | 'mushroom' | 'ruin';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  solid?: boolean;
  variant?: number;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  region: MundoRegionId;
  x: number;
  y: number;
  color: string;
  lines: string[];
}

export interface PathRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'dirt' | 'stone' | 'wood';
}

const house = (kind: PropKind, x: number, y: number, w: number, h: number): Prop => ({ kind, x, y, w, h, solid: true });

export const PATHS: Record<MundoRegionId, PathRect[]> = {
  clareira: [{ x: 180, y: 450, w: 700, h: 60, kind: 'dirt' }],
  vila: [
    { x: 280, y: 600, w: 1560, h: 80, kind: 'dirt' },
    { x: 640, y: 400, w: 320, h: 200, kind: 'stone' },
    { x: 520, y: 680, w: 90, h: 100, kind: 'wood' },
    { x: 860, y: 680, w: 90, h: 100, kind: 'stone' },
    { x: 1180, y: 480, w: 70, h: 140, kind: 'dirt' },
    { x: 1680, y: 520, w: 70, h: 80, kind: 'stone' },
  ],
  floresta: [
    { x: 160, y: 960, w: 1100, h: 80, kind: 'dirt' },
    { x: 900, y: 520, w: 70, h: 460, kind: 'dirt' },
    { x: 900, y: 480, w: 700, h: 60, kind: 'dirt' },
    { x: 1680, y: 860, w: 80, h: 280, kind: 'dirt' },
    { x: 2200, y: 1470, w: 620, h: 70, kind: 'dirt' },
  ],
  ruinas: [
    { x: 140, y: 490, w: 980, h: 64, kind: 'stone' },
    { x: 980, y: 420, w: 180, h: 140, kind: 'stone' },
  ],
};

export const PROPS: Record<MundoRegionId, Prop[]> = {
  clareira: [
    { kind: 'tree', x: 900, y: 240, r: 30, solid: true },
    { kind: 'bush', x: 520, y: 420, r: 16 },
    { kind: 'flower', x: 460, y: 560, variant: 0 },
    { kind: 'bench', x: 640, y: 560 },
    { kind: 'rock', x: 1100, y: 700, r: 18, solid: true },
  ],
  ruinas: [
    { kind: 'ruin', x: 740, y: 250, w: 200, h: 70 },
    { kind: 'ruin', x: 1180, y: 760, w: 160, h: 80 },
    { kind: 'rock', x: 480, y: 300, r: 16, solid: true },
    { kind: 'crate', x: 1080, y: 520 },
    { kind: 'mushroom', x: 640, y: 640, variant: 1 },
  ],
  vila: [
    house('shop', 560, 760, 150, 78),
    house('bank', 900, 760, 150, 78),
    house('forge', 1240, 540, 130, 100),
    house('house', 300, 430, 120, 90),
    house('house', 1680, 360, 140, 100),
    { kind: 'tree', x: 180, y: 240, r: 34, solid: true },
    { kind: 'tree', x: 260, y: 980, r: 28, solid: true },
    { kind: 'tree', x: 1500, y: 220, r: 30, solid: true },
    { kind: 'tree', x: 1980, y: 280, r: 32, solid: true },
    { kind: 'tree', x: 2060, y: 900, r: 26, solid: true },
    { kind: 'bush', x: 480, y: 520, r: 16 },
    { kind: 'bush', x: 1080, y: 470, r: 14 },
    { kind: 'bench', x: 720, y: 560 },
    { kind: 'bench', x: 860, y: 560 },
    { kind: 'lamp', x: 460, y: 590, solid: true, r: 8 },
    { kind: 'lamp', x: 760, y: 590, solid: true, r: 8 },
    { kind: 'lamp', x: 1100, y: 590, solid: true, r: 8 },
    { kind: 'lamp', x: 1460, y: 590, solid: true, r: 8 },
    { kind: 'crate', x: 500, y: 820 },
    { kind: 'barrel', x: 640, y: 820 },
    { kind: 'crate', x: 980, y: 820 },
    { kind: 'flower', x: 400, y: 560, variant: 0 },
    { kind: 'flower', x: 1320, y: 560, variant: 1 },
  ],
  floresta: [
    { kind: 'tree', x: 420, y: 280, r: 36, solid: true },
    { kind: 'tree', x: 680, y: 360, r: 30, solid: true },
    { kind: 'tree', x: 1100, y: 280, r: 40, solid: true },
    { kind: 'tree', x: 1500, y: 240, r: 28, solid: true },
    { kind: 'tree', x: 1900, y: 320, r: 34, solid: true },
    { kind: 'tree', x: 2400, y: 260, r: 32, solid: true },
    { kind: 'tree', x: 2800, y: 420, r: 36, solid: true },
    { kind: 'tree', x: 3000, y: 900, r: 30, solid: true },
    { kind: 'tree', x: 2600, y: 1700, r: 34, solid: true },
    { kind: 'tree', x: 1400, y: 1760, r: 28, solid: true },
    { kind: 'tree', x: 700, y: 1700, r: 32, solid: true },
    { kind: 'bush', x: 560, y: 900, r: 18 },
    { kind: 'bush', x: 1280, y: 620, r: 16 },
    { kind: 'bush', x: 2100, y: 700, r: 20 },
    { kind: 'log', x: 1040, y: 700 },
    { kind: 'rock', x: 1320, y: 420, r: 18, solid: true },
    { kind: 'rock', x: 1760, y: 560, r: 22, solid: true },
    { kind: 'mushroom', x: 820, y: 1180, variant: 0 },
    { kind: 'mushroom', x: 860, y: 1220, variant: 1 },
    { kind: 'flower', x: 1000, y: 1100, variant: 2 },
    { kind: 'ruin', x: 2140, y: 1880, w: 160, h: 90, solid: true },
    { kind: 'rock', x: 2060, y: 1960, r: 16, solid: true },
  ],
};

export const NPCS: NpcDef[] = [
  {
    id: 'mercador',
    name: 'Nara',
    role: 'Mercadora',
    region: 'vila',
    x: 620,
    y: 800,
    color: '#ffd23e',
    lines: ['A loja é a porta amarela. Poção, arma, armadura e relíquia saem do balcão.', 'Eu compro material de criatura. O preço está no painel da loja.'],
  },
  {
    id: 'mecanico',
    name: 'Otto',
    role: 'Mecânico',
    region: 'vila',
    x: 1240,
    y: 600,
    color: '#ff8a3c',
    lines: ['A forja guarda peças. Quando você sobe de nível, gasta o ponto no painel de atributos.', 'Vida, dano, velocidade e recarga mudam o combate de verdade. Eu não vendo atributo.'],
  },
  {
    id: 'pesquisadora',
    name: 'Lina',
    role: 'Pesquisadora',
    region: 'vila',
    x: 250,
    y: 700,
    color: '#3ee8ff',
    lines: ['A floresta faz um ruído que não é vento. Eu ainda estou medindo.', 'Quando eu tiver uma tarefa fechada, ela aparece aqui. Por enquanto, só o aviso.'],
  },
  {
    id: 'guardiao',
    name: 'Vigia',
    role: 'Guardião do portal',
    region: 'vila',
    x: 1500,
    y: 560,
    color: '#5dff8a',
    lines: ['O portal na ponta da rua leva à Floresta. Lá as criaturas atacam.', 'Para voltar, use o portal do outro lado. Não há outra saída.'],
  },
  {
    id: 'protetor',
    name: 'Musgo',
    role: 'Protetor da mata',
    region: 'floresta',
    x: 1040,
    y: 640,
    color: '#8dffc4',
    lines: ['Eu fico na trilha. As criaturas só me ignoram. Você, elas enxergam de perto.', 'O guardião grande fica no fundo da mata. Não chegue sem vida sobrando.'],
  },
  {
    id: 'atendente',
    name: 'Nilo',
    role: 'Atendente do banco',
    region: 'vila',
    x: 900,
    y: 820,
    color: '#9ecbff',
    lines: ['O que entra no banco fica. A bolsa é que perde um pedaço quando você cai.', 'Depósito e saque ficam no extrato. O mesmo pedido não cobra duas vezes.'],
  },
  {
    id: 'explorador',
    name: 'Ivo',
    role: 'Explorador',
    region: 'floresta',
    x: 2000,
    y: 1760,
    color: '#c8b6ff',
    lines: ['O portão das Ruínas ECO fica a leste. Ele só abre depois que o Guardião do Portal cair.', 'O baú lá dentro paga uma vez. Não há outro caminho.'],
  },
];

export interface SolidRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo sólido. A porta (os últimos 22 px) fica andável. */
export function propSolids(id: MundoRegionId): SolidRect[] {
  const out: SolidRect[] = [];
  for (const p of PROPS[id]) {
    if (!p.solid) continue;
    if (p.kind === 'tree' || p.kind === 'rock' || p.kind === 'lamp') {
      const r = (p.r ?? 16) * (p.kind === 'tree' ? 0.42 : 0.7);
      out.push({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 });
      continue;
    }
    const w = p.w ?? 80;
    const h = p.h ?? 70;
    const body = Math.max(24, h - 22);
    out.push({ x: p.x - w / 2, y: p.y - h, w, h: body });
  }
  return out;
}

export function npcById(id: string): NpcDef | undefined {
  return NPCS.find((n) => n.id === id);
}
