import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { ORB_ENERGY, ORB_PAD, nearestOrbPrompt, orbPrompt } from '../src/game/orbs';
import { PLAYER_R } from '../src/game/constants';

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
  g.energyOrbs = [];
  return g;
}

describe('orbe de energia', () => {
  it('mostra a frase com a tecla configurada', () => {
    expect(orbPrompt('E')).toBe('Orbe de energia — pressione E para coletar');
    expect(nearestOrbPrompt(0, 0, [{ x: 40, y: 0 }], 'G')).toBe('Orbe de energia — pressione G para coletar');
    expect(nearestOrbPrompt(0, 0, [{ x: 400, y: 0 }], 'G')).toBeNull();
  });

  it('só coleta uma vez, e só dentro do raio antigo', () => {
    const g = fight();
    const a = g.players[0];
    a.x = 400;
    a.y = 360;
    a.energy = 40;
    g.energyOrbs = [{ id: 7, x: a.x + PLAYER_R + ORB_PAD + 20, y: a.y }];
    g.step(STEP, { a: { ...idle, interact: true }, b: idle });
    expect(g.energyOrbs.map((o) => o.id)).toEqual([7]);
    expect(a.energy).toBeLessThan(40 + ORB_ENERGY);

    g.energyOrbs = [{ id: 8, x: a.x + 10, y: a.y }];
    const mid = a.energy;
    g.step(STEP, { a: idle, b: idle });
    expect(g.energyOrbs.map((o) => o.id)).toEqual([8]);
    g.step(STEP, { a: { ...idle, interact: true }, b: idle });
    expect(g.energyOrbs).toEqual([]);
    expect(a.energy).toBeGreaterThan(mid + ORB_ENERGY - 1);
    const after = a.energy;
    g.energyOrbs = [{ id: 9, x: a.x + 10, y: a.y }];
    g.step(STEP, { a: idle, b: idle });
    expect(a.energy).toBeLessThan(after + ORB_ENERGY);
    expect(g.energyOrbs.map((o) => o.id)).toEqual([9]);
  });
});
