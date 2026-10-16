import type { Element, PowerDef } from './elements';

/** Suprema cinematográfica. Não substitui o kit: só entra se o loadout a escolher no R. */
export interface CinematicUlt {
  id: string;
  name: string;
  element: Element;
  /** personagem em que ela combina. Qualquer um pode equipar. */
  char: string;
  dmg: number;
  range: number;
  radius: number;
  windup: number;
  cd: number;
  /** inimigos que levam dano no impacto */
  cap: number;
  cost: number;
}

export const CINEMATIC: CinematicUlt[] = [
  { id: 'apocalipse-solar', name: 'Apocalipse Solar', element: 'fire', char: 'luna', dmg: 36, range: 280, radius: 108, windup: 1.05, cd: 8, cap: 3, cost: 30 },
  { id: 'tsunami-celestial', name: 'Tsunami Celestial', element: 'ice', char: 'bruno', dmg: 34, range: 300, radius: 124, windup: 1.05, cd: 8, cap: 3, cost: 30 },
  { id: 'julgamento-ceus', name: 'Julgamento dos Céus', element: 'lightning', char: 'kael', dmg: 36, range: 300, radius: 100, windup: 1.05, cd: 8, cap: 3, cost: 30 },
  { id: 'colapso-terra', name: 'Colapso da Terra', element: 'nature', char: 'nara', dmg: 34, range: 260, radius: 110, windup: 1.05, cd: 8, cap: 3, cost: 30 },
  { id: 'ciclone-fim', name: 'Ciclone do Fim', element: 'wind', char: 'zed', dmg: 32, range: 300, radius: 130, windup: 1.05, cd: 8, cap: 3, cost: 30 },
  { id: 'ruptura-dimensional', name: 'Ruptura Dimensional', element: 'plasma', char: 'vortex', dmg: 36, range: 240, radius: 96, windup: 1.05, cd: 8, cap: 3, cost: 30 },
];

export function cinematicOf(id: string | null | undefined): CinematicUlt | null {
  if (!id) return null;
  return CINEMATIC.find((c) => c.id === id) ?? null;
}

/** A suprema combina com este personagem. */
export function fits(charId: string, id: string): boolean {
  const row = cinematicOf(id);
  return !!row && row.char === charId;
}

export function cinematicPower(row: CinematicUlt): PowerDef {
  return {
    name: row.name,
    element: row.element,
    cd: row.cd,
    dmg: row.dmg,
    range: row.range,
    speed: 0,
    radius: row.radius,
    windup: row.windup,
    category: 'attack',
  };
}
