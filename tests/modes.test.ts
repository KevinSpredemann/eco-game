import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight() {
  const roster = [
    { id: 'a', char: 'kael', isBot: false },
    { id: 'b', char: 'luna', isBot: false },
    { id: 'c', char: 'nyx', isBot: false },
    { id: 'd', char: 'iris', isBot: false },
  ];
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kael',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'dupla',
    roster,
    roundSec: 30,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, {});
  for (const p of g.players) p.invulnT = 0;
  return g;
}

describe('2x2', () => {
  it('a primeira metade do time fica junta e a segunda no outro lado', () => {
    const g = fight();
    expect(g.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    expect(g.rules.teams).toBe(true);
    expect(g.rules.maxPlayers).toBe(4);
  });

  it('derrubar um time inteiro dá a rodada para os dois que sobraram', () => {
    const g = fight();
    g.players[2].hp = 0;
    g.players[2].alive = false;
    g.players[3].hp = 0;
    g.players[3].alive = false;
    g.step(STEP, {});
    expect(g.phase).toBe('call');
    expect(g.players[0].roundWins).toBe(1);
    expect(g.players[1].roundWins).toBe(1);
    expect(g.players[2].roundWins).toBe(0);
  });

  it('o poder acerta o bot e o clique não cria bala de arma', () => {
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster: [
        { id: 'a', char: 'kael', isBot: false },
        { id: 'b', char: 'luna', isBot: true },
      ],
    });
    while (g.phase !== 'play') g.step(STEP, {});
    const a = g.players[0];
    const b = g.players[1];
    a.x = 200;
    a.y = 300;
    b.x = 420;
    b.y = 300;
    a.invulnT = 0;
    b.invulnT = 0;
    b.isBot = true;
    const aim = Math.atan2(b.y - a.y, b.x - a.x);
    b.isBot = false;
    const before = b.hp;
    for (let i = 0; i < 40; i++) g.step(STEP, { a: { ...idle, ability: i === 0, aim, ca: aim }, b: idle });
    expect(g.bullets.every((n) => n.el)).toBe(true);
    expect(b.hp).toBeLessThan(before);
  });

  it('o mesmo tiro tira o mesmo tanto de um humano e de um bot', () => {
    const shoot = (bot: boolean) => {
      const g = new Game({
        arena: getArena('lab'),
        humanChar: 'kael',
        bots: 0,
        difficulty: 'normal',
        ownEchoDamage: true,
        training: false,
        mode: 'duelo',
        roster: [
          { id: 'a', char: 'kael', isBot: false },
          { id: 'b', char: 'luna', isBot: bot },
        ],
      });
      while (g.phase !== 'play') g.step(STEP, {});
      const a = g.players[0];
      const b = g.players[1];
      a.x = 200;
      a.y = 300;
      b.x = 420;
      b.y = 300;
      a.invulnT = 0;
      b.invulnT = 0;
      b.isBot = false;
      const before = b.hp;
      g.hurt(b, 20, 'a', 'shot');
      return before - b.hp;
    };
    expect(shoot(true)).toBe(shoot(false));
  });
});
