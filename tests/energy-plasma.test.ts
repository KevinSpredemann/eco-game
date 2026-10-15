import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { encodeSnapshot } from '../src/net/protocol';
import { ENERGY_MAX, PLASMA, SLOT_COST, denyPlasma, denyPowerCast, kitOf, resolvedDamage } from '../src/game/elements';
import { acceptedLoadout, buy, newProfile, normalizeProfile, owns } from '../src/game/economy';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(loadA?: { secondary?: string | null }) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kai',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roundSec: 30,
    suddenSec: 8,
    roster: [
      { id: 'a', char: 'kai', isBot: false, loadout: loadA },
      { id: 'b', char: 'luna', isBot: false },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

describe('energia, recusa e Rajada de Plasma', () => {
  it('energia insuficiente não começa a recarga', () => {
    const g = fight();
    const [a] = g.players;
    a.x = 640;
    a.y = 360;
    a.energy = 5;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[0]).toBe(0);
    expect(a.energy).toBeLessThan(SLOT_COST[0]);
    expect(g.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Energia insuficiente')).toBe(true);
    expect(denyPowerCast('ability', [0, 0, 0, 0], 5)).toBe('Energia insuficiente');
  });

  it('área sem inimigo não gasta recarga nem energia', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 200;
    a.y = 360;
    b.x = 900;
    b.y = 360;
    const energy = a.energy;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 40 }, b: idle });
    expect(a.powerCd[1]).toBe(0);
    expect(a.energy).toBeGreaterThan(energy - 1);
    expect(b.hp).toBe(b.maxHp);
    expect(g.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Nenhum alvo válido')).toBe(true);
  });

  it('projétil que erra gasta recarga e energia', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 900;
    b.y = 360;
    g.step(STEP, { a: { ...idle, ability: true, aim: Math.PI, ca: Math.PI }, b: idle });
    expect(a.powerCd[0]).toBeGreaterThan(0);
    expect(a.energy).toBeLessThan(ENERGY_MAX);
    expect(a.energy).toBeGreaterThan(ENERGY_MAX - SLOT_COST[0] - 1);
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(b.maxHp);
  });

  it('Rajada de Plasma marca por 4s e o próximo poder explode dentro do teto', () => {
    const g = fight({ secondary: 'plasma' });
    const [a, b] = g.players;
    expect(a.plasmaOn).toBe(true);
    a.x = 640;
    a.y = 360;
    b.x = 760;
    b.y = 360;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, plasma: true, aim: 0, ca: 0 }, b: idle });
    expect(a.plasmaCd).toBeCloseTo(PLASMA.cd, 1);
    expect(a.energy).toBeLessThan(ENERGY_MAX);
    for (let i = 0; i < 40 && b.plasmaT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.plasmaT).toBeGreaterThan(3.5);
    expect(b.plasmaT).toBeLessThanOrEqual(4);
    expect(before - b.hp).toBeCloseTo(PLASMA.dmg, 5);
    const marked = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 120 }, b: idle });
    const ev = g.drainEvents();
    const burst = ev.find((e) => e.type === 'combo' && e.name === 'Explosão de Plasma');
    const hit = resolvedDamage(kitOf('kai').powers[1], 1);
    const bonus = Math.min(PLASMA.burst, Math.max(0, PLASMA.cap - hit));
    expect(burst).toMatchObject({ bonus });
    expect(marked - b.hp).toBeCloseTo(hit + bonus, 5);
    expect(before - b.hp).toBeLessThanOrEqual(PLASMA.dmg + PLASMA.cap);
    expect(b.plasmaT).toBe(0);
    const again = b.hp;
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: idle });
    a.powerCd[1] = 0;
    a.energy = ENERGY_MAX;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 120 }, b: idle });
    const follow = g.drainEvents();
    expect(follow.some((e) => e.type === 'combo' && e.name === 'Explosão de Plasma')).toBe(false);
    expect(follow.some((e) => e.type === 'combo' && e.name === 'Execução combinada' && e.bonus === 8)).toBe(true);
    expect(again - b.hp).toBeCloseTo(hit + 8, 5);
  });

  it('marca de plasma que acaba não explode', () => {
    const g = fight({ secondary: 'plasma' });
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 760;
    b.y = 360;
    b.plasmaT = 0.05;
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.plasmaT).toBe(0);
    const hp = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 120 }, b: idle });
    expect(g.drainEvents().some((e) => e.type === 'combo' && e.name === 'Explosão de Plasma')).toBe(false);
    expect(hp - b.hp).toBeCloseTo(resolvedDamage(kitOf('kai').powers[1], 1), 5);
  });

  it('Rajada que erra gasta recarga e não marca', () => {
    const g = fight({ secondary: 'plasma' });
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 900;
    b.y = 360;
    g.step(STEP, { a: { ...idle, plasma: true, aim: Math.PI, ca: Math.PI }, b: idle });
    expect(a.plasmaCd).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.plasmaT).toBe(0);
    expect(b.hp).toBe(b.maxHp);
  });

  it('sem o espaço extra o X avisa que ainda não liberou e não gasta', () => {
    const g = fight();
    const [a] = g.players;
    expect(a.plasmaOn).toBe(false);
    const energy = a.energy;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, plasma: true, aim: 0, ca: 0 }, b: idle });
    expect(a.plasmaCd).toBe(0);
    expect(a.energy).toBeGreaterThan(energy - 1);
    expect(g.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Habilidade ainda não desbloqueada')).toBe(true);
    expect(denyPlasma(false, 0, ENERGY_MAX)).toBe('Habilidade ainda não desbloqueada');
  });

  it('o poder extra libera com partida jogada, não com moedas, e volta na próxima', () => {
    const fresh = newProfile();
    fresh.coins = 9999;
    expect(buy(fresh, 'power:plasma')).toBe('Item não existe.');
    expect(fresh.coins).toBe(9999);
    expect(acceptedLoadout(fresh, { secondary: 'plasma' }).secondary).toBeNull();
    fresh.matches = 1;
    normalizeProfile(fresh);
    expect(owns(fresh, 'power:plasma')).toBe(true);
    const equipped = acceptedLoadout(fresh, { secondary: 'plasma' });
    expect(equipped.secondary).toBe('plasma');
    expect(acceptedLoadout(fresh, equipped).secondary).toBe('plasma');
    const locked = newProfile();
    expect(acceptedLoadout(locked, equipped).secondary).toBeNull();
  });

  it('a energia e a marca vão no retrato da partida', () => {
    const g = fight({ secondary: 'plasma' });
    const [a, b] = g.players;
    a.energy = 64;
    b.plasmaT = 3.2;
    const row = encodeSnapshot(g, false).P[0];
    expect(row.at(-16)).toBe(64);
    expect(row.at(-13)).toBe(1);
    expect(row.at(-12)).toBe(0);
    const foe = encodeSnapshot(g, false).P[1];
    expect(foe.at(-14)).toBe(3.2);
    expect(foe.at(-1)).toBe(0);
  });
});
