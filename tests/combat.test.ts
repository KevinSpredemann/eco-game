import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { ARENAS, getArena } from '../src/game/arenas';

const idle = { mx: 0, my: 0, dash: false, ability: false };

function play(g: Game, max = 60 * 600) {
  const ev: Record<string, number> = {};
  for (let i = 0; i < max && g.phase !== 'results'; i++) {
    g.step(1 / 60, idle);
    for (const e of g.drainEvents()) ev[e.type] = (ev[e.type] ?? 0) + 1;
  }
  return ev;
}

describe('modo combate', () => {
  for (const arena of ARENAS) {
    it(`todos contra todos termina em ${arena.name}`, () => {
      const g = new Game({ arena, humanChar: 'kael', bots: 3, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'combate' });
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(ev.shoot ?? 0).toBeGreaterThan(50);
      expect(ev.kill ?? 0).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(arena.id, g.players.map((p) => `${p.char.id}:${p.score}k${p.kills}w${p.roundWins}`).join(' '), 'rodadas', g.round, 'explosões', ev.explode ?? 0);
    });
  }

  it('duelo x1 acaba quando alguém vence 3 rodadas', () => {
    const roster = [
      { id: 'a', char: 'zoe', isBot: true },
      { id: 'b', char: 'rex', isBot: true },
    ];
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'dificil', ownEchoDamage: true, training: false, mode: 'duelo', roster });
    play(g);
    expect(g.phase).toBe('results');
    expect(g.players).toHaveLength(2);
    const top = Math.max(...g.players.map((p) => p.roundWins));
    expect(top === 3 || g.round >= 5).toBe(true);
  });

  it('Ecos repetem os tiros gravados', () => {
    const roster = [
      { id: 'a', char: 'kael', isBot: false },
      { id: 'b', char: 'luna', isBot: false },
    ];
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'combate', roster });
    const fire = { mx: 0, my: 0, dash: false, ability: false, fire: true, aim: 0 };
    for (let i = 0; i < 60 * 20; i++) g.step(1 / 60, { a: fire, b: idle });
    // termina a rodada 1 por tempo
    while (g.round === 1) g.step(1 / 60, { a: idle, b: idle });
    while (g.phase !== 'play') g.step(1 / 60, { a: idle, b: idle });
    let echoShots = 0;
    for (let i = 0; i < 60 * 10; i++) {
      g.step(1 / 60, { a: idle, b: idle });
      echoShots += g.bullets.filter((b) => b.fromEcho).length > 0 ? 1 : 0;
    }
    expect(echoShots).toBeGreaterThan(10);
  });
});
