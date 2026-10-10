import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { ARENAS } from '../src/game/arenas';

describe('partida completa com bots', () => {
  for (const arena of ARENAS) {
    it(`roda 4 rodadas em ${arena.name}`, () => {
      const g = new Game({ arena, humanChar: 'kael', bots: 3, difficulty: 'normal', ownEchoDamage: true, training: false });
      let steps = 0;
      const idle = { mx: 0, my: 0, dash: false, ability: false };
      const delivered: Record<string, number> = {};
      while (g.phase !== 'results' && steps < 60 * 400) {
        g.step(1 / 60, idle);
        for (const e of g.drainEvents()) if (e.type === 'deliver') delivered[e.pid] = (delivered[e.pid] ?? 0) + e.count;
        steps++;
      }
      expect(g.phase).toBe('results');
      expect(g.echoes.generations.length).toBeLessThanOrEqual(3);
      const botScore = g.players.filter((p) => p.isBot).reduce((s, p) => s + p.score, 0);
      // eslint-disable-next-line no-console
      console.log(arena.id, g.players.map((p) => `${p.char.id}:${p.score}`).join(' '), 'entregas', JSON.stringify(delivered), 'tiebreak', g.tiebreak);
      expect(botScore).toBeGreaterThan(10);
    });
  }
});
