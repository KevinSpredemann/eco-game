// Validação do progresso para um futuro salvamento no servidor.
// O solo grava no aparelho. Co-op e PvP por zona usam o mesmo formato.
import { CHARACTERS } from '../characters';
import { freshSave, RARITY_POWER } from './rules';
import type { MundoGear, MundoRegionId, MundoSave, MundoSession, MundoSlot, MundoTomb, Rarity, SessionMode, StatId } from './types';

export type MundoBlobResult = { ok: true; save: MundoSave } | { ok: false; error: string };

const SLOTS: MundoSlot[] = ['weapon', 'armor', 'relic'];
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const REGIONS: MundoRegionId[] = ['vila', 'floresta'];
const MODES: SessionMode[] = ['solo', 'coop', 'shared'];
const STATS: StatId[] = ['hp', 'dmg', 'speed', 'cd'];
const NAMES: Record<MundoSlot, Record<Rarity, string>> = {
  weapon: { common: 'Lâmina simples', rare: 'Lâmina rara', epic: 'Lâmina épica', legendary: 'Lâmina lendária' },
  armor: { common: 'Couro', rare: 'Malha', epic: 'Placas', legendary: 'Égide' },
  relic: { common: 'Pingente', rare: 'Amuleto', epic: 'Relíquia', legendary: 'Coração Eco' },
};

function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

function gear(v: unknown): MundoGear | null | undefined {
  if (v == null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const g = v as Record<string, unknown>;
  const slot = SLOTS.find((s) => s === g.slot);
  const rarity = RARITIES.find((s) => s === g.rarity);
  if (!slot || !rarity) return undefined;
  const id = typeof g.id === 'string' && g.id.length > 0 && g.id.length < 80 ? g.id : `${slot}-${rarity}`;
  return { id, slot, rarity, name: NAMES[slot][rarity], power: RARITY_POWER[rarity] };
}

function tomb(v: unknown): MundoTomb | null | undefined {
  if (v == null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const t = v as Record<string, unknown>;
  const region = REGIONS.find((r) => r === t.region);
  const x = num(t.x, 0, 10000);
  const y = num(t.y, 0, 10000);
  const until = num(t.until, 0, 1e15);
  if (!region || x == null || y == null || until == null || !Array.isArray(t.items) || t.items.length > 24) return undefined;
  const items: MundoGear[] = [];
  for (const it of t.items) {
    const g = gear(it);
    if (!g) return undefined;
    items.push(g);
  }
  return { x, y, region, items, until };
}

/** Aceita o JSON do progresso. Recusa modo desconhecido, grupo grande demais e números inválidos. */
export function acceptMundoBlob(body: unknown): MundoBlobResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Progresso inválido.' };
  const b = body as Record<string, unknown>;
  if (b.v !== 1) return { ok: false, error: 'Versão do mundo desconhecida.' };
  if (typeof b.charId !== 'string' || !CHARACTERS.some((c) => c.id === b.charId)) return { ok: false, error: 'Personagem inválido.' };
  const xp = num(b.xp, 0, 1e7);
  const level = num(b.level, 1, 30);
  const points = num(b.points, 0, 40);
  const coins = num(b.coins, 0, 1e9);
  const bank = num(b.bank, 0, 1e9);
  const materials = num(b.materials, 0, 1e9);
  if (xp == null || level == null || points == null || coins == null || bank == null || materials == null) return { ok: false, error: 'Números inválidos.' };
  if (!b.stats || typeof b.stats !== 'object') return { ok: false, error: 'Atributos inválidos.' };
  const stats = { hp: 0, dmg: 0, speed: 0, cd: 0 };
  for (const k of STATS) {
    const n = num((b.stats as Record<string, unknown>)[k], 0, 40);
    if (n == null) return { ok: false, error: 'Atributos inválidos.' };
    stats[k] = n;
  }
  const weapon = gear(b.weapon);
  const armor = gear(b.armor);
  const relic = gear(b.relic);
  if (weapon === undefined || armor === undefined || relic === undefined) return { ok: false, error: 'Equipamento inválido.' };
  if (!Array.isArray(b.bag) || b.bag.length > 16) return { ok: false, error: 'Bolsa inválida.' };
  const bag: MundoGear[] = [];
  for (const it of b.bag) {
    const g = gear(it);
    if (!g) return { ok: false, error: 'Item inválido.' };
    bag.push(g);
  }
  const stone = tomb(b.tomb);
  if (stone === undefined) return { ok: false, error: 'Tumba inválida.' };
  if (!Array.isArray(b.party) || b.party.length > 2) return { ok: false, error: 'Grupo inválido. O co-op cabe em duas pessoas.' };
  const party: string[] = [];
  for (const id of b.party) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 40) return { ok: false, error: 'Grupo inválido.' };
    party.push(id);
  }
  if (!b.session || typeof b.session !== 'object') return { ok: false, error: 'Sessão inválida.' };
  const s = b.session as Record<string, unknown>;
  const mode = MODES.find((m) => m === s.mode);
  if (!mode) return { ok: false, error: 'Modo de sessão inválido.' };
  if (!Array.isArray(s.pvpZones) || s.pvpZones.length > 8) return { ok: false, error: 'Zonas de PvP inválidas.' };
  const pvpZones: string[] = [];
  for (const z of s.pvpZones) {
    if (typeof z !== 'string' || z.length < 1 || z.length > 32) return { ok: false, error: 'Zonas de PvP inválidas.' };
    pvpZones.push(z);
  }
  const session: MundoSession = { mode, pvpZones };
  const save: MundoSave = { v: 1, charId: b.charId, xp, level, points, stats, coins, bank, materials, weapon, armor, relic, bag, tomb: stone, party, session };
  return { ok: true, save };
}

export const MUNDO_KEY = 'eco.mundo.v1';

export function parseMundo(raw: string | null, charId: string): MundoSave {
  if (!raw) return freshSave(charId);
  try {
    const got = acceptMundoBlob(JSON.parse(raw));
    return got.ok ? got.save : freshSave(charId);
  } catch {
    return freshSave(charId);
  }
}
