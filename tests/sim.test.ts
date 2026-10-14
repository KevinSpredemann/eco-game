import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { getArena } from '../src/game/arenas';

describe('partida curta', () => {
  it('um x1 com rodadas curtas chega no resultado', () => {
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'dificil',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roundSec: 12,
      suddenSec: 4,
      roster: [
        { id: 'a', char: 'zoe', isBot: true },
        { id: 'b', char: 'rex', isBot: true },
      ],
    });
    const idle = { mx: 0, my: 0, dash: false, ability: false };
    for (let i = 0; i < 60 * 250 && g.phase !== 'results'; i++) g.step(1 / 60, idle);
    expect(g.phase).toBe('results');
    expect(g.players).toHaveLength(2);
    expect(g.players.every((p) => p.team === -1)).toBe(true);
    const top = Math.max(...g.players.map((p) => p.roundWins));
    expect(top === 3 || g.round >= 5).toBe(true);
  }, 20000);
});
