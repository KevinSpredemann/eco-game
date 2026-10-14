import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { getArena } from '../src/game/arenas';

const idle = { mx: 0, my: 0, dash: false, ability: false };
function runTo(g: Game, phase: string, max = 60 * 60) {
  for (let i = 0; i < max && g.phase !== phase; i++) g.step(1 / 60, idle);
}

describe('poderes', () => {
  it('Apagar Eco remove o Eco mais perto para sempre', () => {
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 1, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'duelo', roundSec: 8, suddenSec: 2 });
    runTo(g, 'play');
    runTo(g, 'prep'); // rodada 2: Ecos da rodada 1
    runTo(g, 'play');
    const before = g.echoViews.length;
    expect(before).toBeGreaterThan(0);
    const me = g.human;
    g.powerups.push({ id: 999, kind: 'apagar', x: me.x, y: me.y, age: 1 });
    g.step(1 / 60, idle);
    expect(g.echoViews.length).toBe(before - 1);
    expect(g.echoes.count).toBe(before - 1);
  });

  it('Energia em dobro dobra a próxima entrega', () => {
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'duelo', roundSec: 8, suddenSec: 2 });
    runTo(g, 'play');
    const me = g.human;
    g.powerups.push({ id: 998, kind: 'dobro', x: me.x, y: me.y, age: 1 });
    g.step(1 / 60, idle);
    expect(me.doubleNext).toBe(true);
  });

  it('Gelo deixa os Ecos inofensivos', () => {
    const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'duelo', roundSec: 8, suddenSec: 2 });
    runTo(g, 'play');
    runTo(g, 'prep');
    runTo(g, 'play');
    const me = g.human;
    g.powerups.push({ id: 997, kind: 'gelo', x: me.x, y: me.y, age: 1 });
    g.step(1 / 60, idle);
    g.step(1 / 60, idle);
    expect(g.echoViews.every((e) => e.iced)).toBe(true);
  });
});
