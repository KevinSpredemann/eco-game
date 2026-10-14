import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { ARENAS } from '../src/game/arenas';
import { CHARACTERS, STUDIO_CHARS } from '../src/game/characters';
import { PRIMARY, WEAPONS } from '../src/game/weapons';

const idle = { mx: 0, my: 0, dash: false, ability: false };

describe('cristais de habilidade e armas próprias', () => {
  it('cada personagem tem uma arma principal diferente', () => {
    const classic = CHARACTERS.filter((c) => !(STUDIO_CHARS as readonly string[]).includes(c.id));
    const ids = classic.map((c) => PRIMARY[c.id]);
    expect(new Set(ids).size).toBe(classic.length);
    for (const c of CHARACTERS) expect(WEAPONS[PRIMARY[c.id]]).toBeTruthy();
  });

  it('bots fecham a partida com poderes e sem cristal', () => {
    for (const mode of ['dupla', 'duelo'] as const) {
      const roster = CHARACTERS.slice(0, mode === 'duelo' ? 2 : 4).map((c, i) => ({ id: 'b' + i, char: c.id, isBot: true }));
      const g = new Game({ arena: ARENAS[0], humanChar: 'kael', bots: 0, difficulty: 'dificil', ownEchoDamage: true, training: false, mode, roster });
      for (const p of g.players) expect(p.weapon).toBe(PRIMARY[p.char.id]);
      let picks = 0;
      for (let i = 0; i < 60 * 600 && g.phase !== 'results'; i++) {
        g.step(1 / 60, idle);
        for (const e of g.drainEvents()) if (e.type === 'bonusPick') picks++;
      }
      expect(g.phase).toBe('results');
      expect(picks).toBe(0);
      expect(g.players.some((p) => p.stats.dmg > 0 || p.roundWins > 0)).toBe(true);
    }
  });

  it('o poder do Bruno acerta sem devolver tiro de arma', () => {
    const roster = [
      { id: 'a', char: 'bruno', isBot: false },
      { id: 'b', char: 'kael', isBot: false },
    ];
    const g = new Game({ arena: ARENAS[0], humanChar: 'bruno', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'dupla', roster });
    while (g.phase !== 'play') g.step(1 / 60, idle);
    const a = g.players[0];
    const b = g.players[1];
    a.x = 400;
    a.y = 360;
    b.x = 560;
    b.y = 360;
    a.invulnT = b.invulnT = 0;
    const before = b.hp;
    g.step(1 / 60, { a: { ...idle, ability: true, aim: 0, ca: 0 } });
    for (let i = 0; i < 40 && b.hp === before; i++) g.step(1 / 60, idle);
    expect(b.hp).toBeLessThan(before);
    expect(g.drainEvents().some((e) => e.type === 'reflect')).toBe(false);
    expect(g.bullets.every((n) => !!n.el)).toBe(true);
  });
});
