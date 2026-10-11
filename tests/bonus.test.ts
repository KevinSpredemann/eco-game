import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { ARENAS } from '../src/game/arenas';
import { CHARACTERS } from '../src/game/characters';
import { PRIMARY, WEAPONS } from '../src/game/weapons';

const idle = { mx: 0, my: 0, dash: false, ability: false };

describe('cristais de habilidade e armas próprias', () => {
  it('cada personagem tem uma arma principal diferente', () => {
    const ids = CHARACTERS.map((c) => PRIMARY[c.id]);
    expect(new Set(ids).size).toBe(CHARACTERS.length);
    for (const w of ids) expect(WEAPONS[w]).toBeTruthy();
  });

  it('bots pegam cristais e usam a habilidade extra', () => {
    let picks = 0;
    let uses = 0;
    for (const mode of ['combate', 'nucleo'] as const) {
      const roster = CHARACTERS.slice(0, 4).map((c, i) => ({ id: 'b' + i, char: c.id, isBot: true }));
      const g = new Game({ arena: ARENAS[0], humanChar: 'kael', bots: 0, difficulty: 'dificil', ownEchoDamage: true, training: false, mode, roster });
      for (const p of g.players) expect(p.weapon).toBe(PRIMARY[p.char.id]);
      for (let i = 0; i < 60 * 600 && g.phase !== 'results'; i++) {
        const before = g.players.map((p) => p.bonusAb);
        g.step(1 / 60, idle);
        g.players.forEach((p, k) => {
          if (before[k] && !p.bonusAb) uses++;
        });
        for (const e of g.drainEvents()) if (e.type === 'bonusPick') picks++;
      }
      expect(g.phase).toBe('results');
    }
    expect(picks).toBeGreaterThan(2);
    expect(uses).toBeGreaterThan(0);
  });

  it('o escudo do Bronzar devolve os tiros', () => {
    let reflects = 0;
    for (let tries = 0; tries < 6 && reflects === 0; tries++) {
      const roster = [
        { id: 'a', char: 'bruno', isBot: false },
        { id: 'b', char: 'kael', isBot: true },
      ];
      const g = new Game({ arena: ARENAS[0], humanChar: 'bruno', bots: 0, difficulty: 'dificil', ownEchoDamage: true, training: false, mode: 'duelo', roster });
      for (let i = 0; i < 60 * 120 && g.phase !== 'results' && reflects === 0; i++) {
        const a = g.players[0];
        const b = g.players[1];
        // fica de frente para o rival e liga o escudo sempre que puder
        const aim = Math.atan2(b.y - a.y, b.x - a.x);
        g.step(1 / 60, { a: { ...idle, mx: Math.cos(aim) * 0.3, my: Math.sin(aim) * 0.3, ability: a.abilCd <= 0 && g.phase === 'play' } } as any);
        for (const e of g.drainEvents()) if (e.type === 'reflect') reflects++;
      }
    }
    expect(reflects).toBeGreaterThan(0);
  });
});
