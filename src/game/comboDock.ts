import { comboReady, listSynergies, pickComboRecipe } from './combos';
import { ENERGY_MAX, SLOT_COST, kitOf } from './elements';
import type { Player } from './sim';

export interface ComboDock {
  phase: 'ready' | 'armed' | 'wait' | 'done';
  key: string;
  name: string;
  frac: number;
  aKey: string;
  bKey: string;
  aEl: string;
  bEl: string;
  need?: string;
}

export interface ComboDone {
  name: string;
  aEl: string;
  bEl: string;
  until: number;
}

type DockGame = {
  human: Player;
  players: Player[];
  hostile: (a: Player, b: Player) => boolean;
};

/** Texto do cais de combo. A frase sai da fase real, não de um rótulo solto. */
export function comboDockTag(cs: Pick<ComboDock, 'phase' | 'key' | 'bKey' | 'need'>): string {
  if (cs.phase === 'done') return 'COMBO EXECUTADO';
  if (cs.need && /energia/i.test(cs.need)) return 'ENERGIA INSUFICIENTE';
  if (cs.phase === 'wait') return 'SEQUÊNCIA INTERROMPIDA';
  if (cs.phase === 'armed') return `PRÓXIMA HABILIDADE: ${cs.key || cs.bKey}`;
  return 'COMBO DISPONÍVEL';
}

/** O mesmo estado que o HUD mostra: loadout, energia, recarga e a aura no rival. */
export function comboDockState(
  g: DockGame,
  o: { labels: string[]; plasmaKey: string; now: number; done: ComboDone | null },
): ComboDock | null {
  const me = g.human;
  if (!me.alive) return null;
  const foes = g.players
    .filter((p) => p.alive && p.id !== me.id && g.hostile(me, p))
    .map((p) => ({
      burn: p.burnT,
      frozen: p.frozenT,
      gust: p.gustT,
      shock: p.shockT,
      root: p.rootT,
      marked: p.markedT,
      field: p.fieldT,
      fieldEl: p.fieldEl,
      stun: p.stunT,
      ctrl: p.ctrlT,
      plasma: p.plasmaPrimeT ?? 0,
      combo: p.comboT ?? 0,
      rupture: p.ruptureT ?? 0,
    }));
  const labels = o.labels;
  const cds = me.powerCd ?? [0, 0, 0, 0];
  const why = (i: number): string => {
    if ((cds[i] ?? 0) > 0) return `recarga ${(cds[i] ?? 0).toFixed(1).replace('.', ',')}s`;
    if (i === 2) return (me.ultCharge ?? 100) < 100 ? 'suprema em carga' : '';
    return (me.energy ?? ENERGY_MAX) < SLOT_COST[i] ? 'sem energia' : '';
  };
  const usable = [0, 1, 2, 3].map((i) => (why(i) ? 9 : 0));
  const rows = listSynergies(me.char.id, me.loadout?.secondary ?? null).filter((row) => row.state === 'active' && row.slots.length === 2);
  const recipe = pickComboRecipe(rows);
  const pairOf = (row: { slots: number[]; powers: { element: string }[]; name: string }) => {
    const a = row.slots[0] ?? 0;
    const b = row.slots[1] ?? 1;
    return {
      aKey: labels[a] ?? '',
      bKey: labels[b] ?? '',
      aEl: row.powers[0]?.element ?? 'fire',
      bEl: row.powers[1]?.element ?? 'lightning',
      name: row.name,
    };
  };
  if (o.done && o.now < o.done.until) {
    return { phase: 'done', key: '', name: o.done.name, frac: 1, aKey: '', bKey: '', aEl: o.done.aEl, bEl: o.done.bEl };
  }
  const marked = foes.find((p) => (p.rupture ?? 0) > 0);
  if (marked) {
    const slot = [0, 1, 3].find((i) => !why(i)) ?? 0;
    const key = labels[slot] ?? 'Q';
    const ready = !why(slot);
    return {
      phase: ready ? 'armed' : 'wait',
      key,
      name: 'Ruptura Marcada',
      frac: Math.min(1, (marked.rupture ?? 0) / 2.4),
      aKey: o.plasmaKey,
      bKey: key,
      aEl: 'lightning',
      bEl: kitOf(me.char.id).powers[slot].element,
      need: ready ? `Marca aplicada ✓ → ${key}: habilidade compatível` : why(slot),
    };
  }
  const hit = comboReady(me.char.id, usable, foes, labels);
  if (hit) {
    const row = rows.find((r) => r.name === hit.name) ?? recipe;
    const base = row ? pairOf(row) : { aKey: '', bKey: labels[hit.slot] ?? hit.key, aEl: 'ice', bEl: 'lightning', name: hit.name };
    return { phase: 'armed', key: labels[hit.slot] ?? hit.key, frac: hit.total ? Math.min(1, hit.left / hit.total) : 0, ...base, bKey: labels[hit.slot] ?? hit.key, name: hit.name };
  }
  const armed = comboReady(me.char.id, [0, 0, 0, 0], foes, labels);
  if (armed) {
    const row = rows.find((r) => r.name === armed.name) ?? recipe;
    const base = row ? pairOf(row) : { aKey: '', bKey: labels[armed.slot] ?? armed.key, aEl: 'ice', bEl: 'lightning', name: armed.name };
    return {
      phase: 'wait',
      key: labels[armed.slot] ?? armed.key,
      frac: armed.total ? Math.min(1, armed.left / armed.total) : 0,
      need: why(armed.slot) || 'não dá para fechar',
      ...base,
      bKey: labels[armed.slot] ?? armed.key,
      name: armed.name,
    };
  }
  const plasma = g.players.find((p) => p.alive && p.id !== me.id && g.hostile(me, p) && p.plasmaT > 0);
  if (plasma && (me.powerCd ?? [0, 0, 0, 0]).some((n) => n <= 0)) {
    return { phase: 'armed', key: '', name: 'Explosão de Plasma', frac: Math.min(1, plasma.plasmaT / 4), aKey: '', bKey: o.plasmaKey, aEl: 'plasma', bEl: 'plasma' };
  }
  if (recipe) {
    const base = pairOf(recipe);
    return { phase: 'ready', key: base.bKey, frac: 0, ...base };
  }
  return null;
}
