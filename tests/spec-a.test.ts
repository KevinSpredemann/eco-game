import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { COMBAT, hazardDamage } from '../src/game/balance';
import { ENERGY_MAX, SLOT_COST, clampEnergy, energyReadout, kitOf, resolvedDamage } from '../src/game/elements';
import { DASH_SPEED, SPEED } from '../src/game/constants';
import { stickIntent } from '../src/ui/input';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function duel(char = 'kai', arena = getArena('lab')) {
  const g = new Game({
    arena,
    humanChar: char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: true,
    mode: 'duelo',
    roundSec: 30,
    suddenSec: 8,
    roster: [
      { id: 'a', char, isBot: false, skin: 'padrao', trail: 'nenhum' },
      { id: 'b', char: 'luna', isBot: false, skin: 'padrao', trail: 'nenhum' },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.drainEvents();
  return g;
}

describe('SPEC A — perigo, energia, passo e setas', () => {
  it('cada perigo usa o fator e o tick, sem cortar o dano da habilidade', () => {
    expect(COMBAT.hazard.mul).toBe(0.7);
    expect(COMBAT.hazard.tick).toBe(0.8);
    expect(hazardDamage('laser')).toBe(18);
    expect(hazardDamage('lava')).toBe(18);
    expect(hazardDamage('tornado')).toBe(8);
    expect(SLOT_COST).toEqual([18, 24, 30, 16]);
    expect(resolvedDamage(kitOf('vexa').powers[0], 0)).toBe(9);
  });

  it('duas lavas no mesmo lugar ferem uma vez por tick', () => {
    const base = getArena('lab');
    const g = duel('kai', { ...base, lava: [{ x: 400, y: 360, r: 40 }, { x: 404, y: 360, r: 40 }] });
    const [a] = g.players;
    a.x = 400;
    a.y = 360;
    a.vx = a.vy = 0;
    a.invulnT = 0;
    const hp = a.hp;
    const hit = hazardDamage('lava');
    g.step(STEP, { a: idle, b: idle });
    expect(hp - a.hp).toBe(hit);
    const mid = a.hp;
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(a.hp).toBe(mid);
    for (let i = 0; i < 24; i++) g.step(STEP, { a: idle, b: idle });
    expect(mid - a.hp).toBe(hit);
  });

  it('a energia fica entre zero e o máximo e o HUD lê atual/máximo', () => {
    expect(ENERGY_MAX).toBe(145);
    expect(clampEnergy(200)).toBe(145);
    expect(clampEnergy(-5)).toBe(0);
    expect(clampEnergy(Number.NaN)).toBe(0);
    expect(energyReadout(10.6)).toBe('11/145');
    const g = duel();
    const [a] = g.players;
    expect(a.energy).toBe(ENERGY_MAX);
    a.energy = 999;
    g.step(STEP, { a: idle, b: idle });
    expect(a.energy).toBe(ENERGY_MAX);
    a.energy = -20;
    g.step(STEP, { a: idle, b: idle });
    expect(a.energy).toBeGreaterThanOrEqual(0);
    expect(a.energy).toBeLessThanOrEqual(ENERGY_MAX);
  });

  it('o passo cai e a esquiva continua na velocidade antiga', () => {
    const g = duel();
    const [a] = g.players;
    a.x = 400;
    a.y = 360;
    a.vx = a.vy = 0;
    const x0 = a.x;
    for (let i = 0; i < 60; i++) g.step(STEP, { a: { ...idle, mx: 1 }, b: idle });
    const moved = a.x - x0;
    expect(moved).toBeLessThan(SPEED * COMBAT.walkMul);
    expect(moved).toBeGreaterThan(SPEED * COMBAT.walkMul * 0.55);
    const dash = duel();
    const [d] = dash.players;
    d.x = 400;
    d.y = 360;
    d.vx = d.vy = 0;
    dash.step(STEP, { a: { ...idle, dash: true, mx: 1 }, b: idle });
    expect(d.vx).toBeCloseTo(DASH_SPEED, 0);
  });

  it('as oito direções das setas andam com diagonal normalizada', () => {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [x, y] of dirs) {
      const s = stickIntent({
        moveScheme: 'wasd',
        keyboardAim: false,
        aiming: false,
        precision: false,
        arrows: { x, y },
        keys: { x: 0, y: 0 },
        stick: { x: 0, y: 0 },
        prevAim: 0,
      });
      expect(Math.hypot(s.mx, s.my)).toBeCloseTo(1, 5);
      expect(Math.atan2(s.my, s.mx)).toBeCloseTo(Math.atan2(y, x), 5);
    }
    const both = stickIntent({
      moveScheme: 'wasd',
      keyboardAim: false,
      aiming: false,
      precision: false,
      arrows: { x: 0, y: 0 },
      keys: { x: 1, y: -1 },
      stick: { x: 0, y: 0 },
      prevAim: 0,
    });
    expect(Math.hypot(both.mx, both.my)).toBeCloseTo(1, 5);
    const cancel = stickIntent({
      moveScheme: 'wasd',
      keyboardAim: false,
      aiming: false,
      precision: false,
      arrows: { x: 0, y: 1 },
      keys: { x: 0, y: -1 },
      stick: { x: 0, y: 0 },
      prevAim: 0,
    });
    expect(cancel.mx).toBe(0);
    expect(cancel.my).toBe(0);
  });

  it('o corte da Vexa continua com o dano do kit', () => {
    const g = duel('vexa');
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 480;
    b.y = 360;
    const hp = b.hp;
    const dmg = resolvedDamage(kitOf('vexa').powers[0], 0);
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === hp; i++) g.step(STEP, { a: idle, b: idle });
    expect(hp - b.hp).toBe(dmg);
  });
});
