// Portais: depois de usar, o mesmo jogador espera 15 s para usar de novo.
import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import * as C from '../src/game/constants';

const STEP = 1 / 60;

describe('portais', () => {
  it('teleporta e só deixa usar de novo depois de 15 s', () => {
    const arena = getArena('lab');
    const [a, b] = arena.portals![0];
    const g = new Game({ arena, humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'dupla', roster: [{ id: 'p0', char: 'kael', isBot: false }, { id: 'b0', char: 'nyx', isBot: false }] });
    while (g.phase !== 'play') g.step(STEP, {});
    const me = g.human;
    const idle = { mx: 0, my: 0 } as Input;
    me.x = a.x;
    me.y = a.y;
    g.step(STEP, idle);
    expect(Math.hypot(me.x - b.x, me.y - b.y)).toBeLessThan(60);
    expect(me.portalCd).toBeGreaterThan(C.PORTAL_CD - 0.1);
    // volta para o portal na hora: não teleporta
    me.x = b.x;
    me.y = b.y;
    g.step(STEP, idle);
    expect(Math.hypot(me.x - b.x, me.y - b.y)).toBeLessThan(5);
    // depois de 15 s, funciona de novo
    me.x = b.x + 120;
    me.portalCd = 0.01;
    g.step(STEP, idle);
    expect(me.portalCd).toBe(0);
    me.x = b.x;
    me.y = b.y;
    g.step(STEP, idle);
    expect(Math.hypot(me.x - a.x, me.y - a.y)).toBeLessThan(60);
  });
});
