import type { Loadout } from './balance';
import { cinematicOf, type CinematicUlt } from './cinematic';
import { studioOf, type StudioDef } from './elements';

export type PickSlot = 'ability' | 'skill' | 'ult' | 'bonus' | 'plasma';

export const PICK_SLOTS: PickSlot[] = ['ability', 'skill', 'ult', 'bonus', 'plasma'];

export function pickId(loadout: Loadout | undefined | null, slot: number): string | null {
  if (!loadout?.picks || slot < 0 || slot > 3) return null;
  const id = loadout.picks[PICK_SLOTS[slot]];
  return id || null;
}

/** Poder escolhido no espaço. Vazio: o kit (ou o Z) continua valendo. */
export function resolvePick(loadout: Loadout | undefined | null, slot: number): { cine: CinematicUlt | null; studio: StudioDef | null } {
  const id = pickId(loadout, slot);
  if (!id) return { cine: null, studio: null };
  if (slot === 2) {
    const cine = cinematicOf(id);
    if (cine) return { cine, studio: null };
  }
  const studio = studioOf(id);
  if (studio) return { cine: null, studio };
  return { cine: null, studio: null };
}
