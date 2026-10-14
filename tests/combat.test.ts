import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { getArena } from '../src/game/arenas';

const idle = { mx: 0, my: 0, dash: false, ability: false };

function play(g: Game, max = 60 * 600) {
  const ev: Record<string, number> = {};
  for (let i = 0; i < max && g.phase !== 'results'; i++) {
    g.step(1 / 60, idle);
    for (const e of g.drainEvents()) ev[e.type] = (ev[e.type] ?? 0) + 1;
  }
  return ev;
}

describe('modo 2x2', () => {
  it('um 2x2 no laboratório termina', () => {
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 3, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'dupla', roundSec: 20, suddenSec: 6 });
    const ev = play(g, 60 * 400);
    expect(g.phase).toBe('results');
    expect(g.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    expect((ev.skill ?? 0) + (ev.combo ?? 0)).toBeGreaterThan(10);
    expect(Math.max(...g.players.map((p) => p.roundWins)) === 3 || g.round >= 5).toBe(true);
  }, 20000);

  it('duelo x1 acaba quando alguém vence 3 rodadas', () => {
    const roster = [
      { id: 'a', char: 'zoe', isBot: true },
      { id: 'b', char: 'rex', isBot: true },
    ];
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'dificil', ownEchoDamage: true, training: false, mode: 'duelo', roster, roundSec: 20, suddenSec: 8 });
    play(g);
    expect(g.phase).toBe('results');
    expect(g.players).toHaveLength(2);
    const top = Math.max(...g.players.map((p) => p.roundWins));
    expect(top === 3 || g.round >= 5).toBe(true);
  });

  it('segurar o clique no 2x2 não grava tiro de arma para o Eco', () => {
    const roster = [
      { id: 'a', char: 'kael', isBot: false },
      { id: 'b', char: 'luna', isBot: false },
    ];
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'dupla', roster, roundSec: 12, suddenSec: 4 });
    const fire = { mx: 0, my: 0, dash: false, ability: false, fire: true, aim: 0 };
    for (let i = 0; i < 60 * 8; i++) g.step(1 / 60, { a: fire, b: idle });
    while (g.round === 1) g.step(1 / 60, { a: idle, b: idle });
    while (g.phase !== 'play') g.step(1 / 60, { a: idle, b: idle });
    let echoShots = 0;
    for (let i = 0; i < 60 * 6; i++) {
      g.step(1 / 60, { a: idle, b: idle });
      echoShots += g.bullets.filter((b) => b.fromEcho && !b.el).length;
    }
    expect(echoShots).toBe(0);
  });
});
