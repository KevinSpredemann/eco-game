import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { ARENAS, ARENA_SCALE, VIEW_H, VIEW_W, WORLD_H, WORLD_W, cameraFocus, duelPoints, getArena } from '../src/game/arenas';
import { NavGrid } from '../src/game/bot';
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

describe('SPEC A — arenas maiores', () => {
  it('a área jogável fica entre 2× e 3× e a colisão do lab acompanha', () => {
    const ratio = (WORLD_W * WORLD_H) / (VIEW_W * VIEW_H);
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(3);
    expect(WORLD_W).toBe(Math.round(VIEW_W * ARENA_SCALE));
    expect(WORLD_H).toBe(Math.round(VIEW_H * ARENA_SCALE));
    const lab = getArena('lab');
    expect(lab.walls[0].x).toBeCloseTo(250 * ARENA_SCALE, 5);
    expect(lab.walls[0].w).toBeCloseTo(200 * ARENA_SCALE, 5);
    expect(lab.spawns[0].x).toBeCloseTo(90 * ARENA_SCALE, 5);
    expect(lab.pillars[0].r).toBeCloseTo(22 * ARENA_SCALE, 5);
    const again = getArena('lab');
    again.walls[0].x += 1;
    expect(getArena('lab').walls[0].x).toBe(again.walls[0].x);
    again.walls[0].x -= 1;
  });

  it('o X1 nasce na distância antiga e o 2x2 usa o mapa largo', () => {
    const lab = getArena('lab');
    const [a, b] = duelPoints(lab);
    const sep = Math.hypot(b.x - a.x, b.y - a.y);
    expect(sep).toBeCloseTo(lab.duelSep!, 0);
    expect(sep).toBeLessThan(Math.hypot(lab.spawns[1].x - lab.spawns[0].x, lab.spawns[1].y - lab.spawns[0].y) - 100);
    const g = duel();
    const [p, q] = g.players;
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(sep, 0);
    const wide = Math.hypot(lab.spawns[1].x - lab.spawns[0].x, lab.spawns[1].y - lab.spawns[0].y);
    expect(wide).toBeGreaterThan(sep * 1.25);
  });

  it('nascimentos ficam fora de parede, lava e poço', () => {
    for (const arena of ARENAS) {
      const spots = [...arena.spawns, ...duelPoints(arena)];
      for (const s of spots) {
        expect(s.x).toBeGreaterThan(20);
        expect(s.y).toBeGreaterThan(20);
        expect(s.x).toBeLessThan(WORLD_W - 20);
        expect(s.y).toBeLessThan(WORLD_H - 20);
        for (const w of arena.walls) {
          const inside = s.x > w.x && s.x < w.x + w.w && s.y > w.y && s.y < w.y + w.h;
          expect(inside).toBe(false);
        }
        for (const c of arena.pillars) expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeGreaterThan(c.r);
        for (const l of arena.lava ?? []) expect(Math.hypot(s.x - l.x, s.y - l.y)).toBeGreaterThan(l.r);
        for (const well of arena.wells ?? []) expect(Math.hypot(s.x - well.x, s.y - well.y)).toBeGreaterThan(well.r);
      }
    }
  });

  it('a nav alcança a faixa nova e a câmera não sai do mundo', () => {
    const lab = getArena('lab');
    const nav = new NavGrid(lab);
    expect(nav.walkableAt(1600, 500, 0)).toBe(true);
    expect(nav.walkableAt(20, 20, 0)).toBe(false);
    const edge = cameraFocus(80, 80, VIEW_W, VIEW_H);
    expect(edge.x - VIEW_W / 2).toBeGreaterThanOrEqual(-0.01);
    expect(edge.y - VIEW_H / 2).toBeGreaterThanOrEqual(-0.01);
    const far = cameraFocus(WORLD_W - 10, WORLD_H - 10, VIEW_W, VIEW_H);
    expect(far.x + VIEW_W / 2).toBeLessThanOrEqual(WORLD_W + 0.01);
    expect(far.y + VIEW_H / 2).toBeLessThanOrEqual(WORLD_H + 0.01);
    const mid = cameraFocus(WORLD_W / 2, WORLD_H / 2, VIEW_W, VIEW_H);
    expect(mid.x).toBeCloseTo(WORLD_W / 2, 5);
    expect(VIEW_W).toBeLessThan(WORLD_W);
  });
});
