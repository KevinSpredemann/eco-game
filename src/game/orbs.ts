/** Orbe de energia: o aviso aparece de longe. A coleta usa o mesmo raio dos outros itens. */

export const ORB_PAD = 16;
export const ORB_PROMPT_R = 88;
export const ORB_ENERGY = 36;

export interface EnergyOrb {
  id: number;
  x: number;
  y: number;
}

export function orbPrompt(key: string): string {
  return `Orbe de energia — pressione ${key} para coletar`;
}

export function nearestOrbPrompt(px: number, py: number, orbs: readonly { x: number; y: number }[], key: string): string | null {
  let best = Infinity;
  for (const o of orbs) {
    const d = Math.hypot(o.x - px, o.y - py);
    if (d < best) best = d;
  }
  if (best > ORB_PROMPT_R) return null;
  return orbPrompt(key);
}
