import { describe, expect, it } from 'vitest';
import { lockHostile } from '../src/game/aimLock';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { ENERGY_MAX, kitOf } from '../src/game/elements';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight() {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kai',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: [
      { id: 'a', char: 'kai', isBot: false },
      { id: 'b', char: 'luna', isBot: false },
    ],
    roundSec: 30,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  return g;
}

describe('mira automática', () => {
  it('escolhe o inimigo mais perto dentro do alcance e da visão', () => {
    const hit = lockHostile({
      x: 0,
      y: 0,
      range: 200,
      foes: [
        { id: 'far', x: 180, y: 0 },
        { id: 'near', x: 40, y: 0 },
        { id: 'out', x: 400, y: 0 },
      ],
      sight: () => true,
    });
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.id).toBe('near');
  });

  it('recusa quando todo mundo está fora do alcance', () => {
    const hit = lockHostile({
      x: 0,
      y: 0,
      range: 100,
      foes: [{ id: 'z', x: 240, y: 0 }],
      sight: () => true,
    });
    expect(hit).toEqual({ ok: false, reason: 'Fora de alcance' });
  });

  it('recusa quando a visão está tampada', () => {
    const hit = lockHostile({
      x: 0,
      y: 0,
      range: 200,
      foes: [{ id: 'z', x: 80, y: 0 }],
      sight: () => false,
    });
    expect(hit).toEqual({ ok: false, reason: 'Nenhum alvo válido' });
  });

  it('o mouse continua mandando quando a trava está desligada', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 560;
    b.y = 360;
    g.step(STEP, { a: { ...idle, ability: true, aim: Math.PI, ca: Math.PI }, b: idle });
    const shot = g.bullets.find((n) => n.owner === 'a');
    expect(shot).toBeTruthy();
    expect(shot!.vx).toBeLessThan(0);
  });

  it('a trava ignora a mira do mouse e acerta o inimigo no alcance', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 560;
    b.y = 360;
    const before = a.energy;
    g.step(STEP, { a: { ...idle, ability: true, aim: Math.PI, ca: Math.PI, lock: true }, b: idle });
    const shot = g.bullets.find((n) => n.owner === 'a');
    expect(shot).toBeTruthy();
    expect(shot!.vx).toBeGreaterThan(0);
    expect(a.powerCd[0]).toBeGreaterThan(0);
    expect(a.energy).toBeLessThan(before);
  });

  it('fora do alcance não gasta energia nem recarga', () => {
    const g = fight();
    const [a, b] = g.players;
    const reach = kitOf('kai').powers[0].range;
    a.x = 400;
    a.y = 360;
    b.x = 400 + reach + 260;
    b.y = 360;
    a.energy = ENERGY_MAX;
    g.step(STEP, { a: { ...idle, ability: true, lock: true, aim: 0, ca: 0 }, b: idle });
    expect(g.events.some((e) => e.type === 'deny' && e.pid === 'a' && e.msg === 'Fora de alcance')).toBe(true);
    expect(a.powerCd[0]).toBe(0);
    expect(a.energy).toBe(ENERGY_MAX);
    expect(g.bullets.some((n) => n.owner === 'a')).toBe(false);
  });
});
