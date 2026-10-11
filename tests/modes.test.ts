import { describe, expect, it } from 'vitest';
import { Game, GameMode } from '../src/game/sim';
import { ARENAS } from '../src/game/arenas';
import { CHARACTERS } from '../src/game/characters';

const idle = { mx: 0, my: 0, dash: false, ability: false };

function play(g: Game, max = 60 * 900) {
  const ev: Record<string, number> = {};
  for (let i = 0; i < max && g.phase !== 'results'; i++) {
    g.step(1 / 60, idle);
    for (const e of g.drainEvents()) ev[e.type] = (ev[e.type] ?? 0) + 1;
  }
  return ev;
}

/** só bots: o "humano" também é bot */
function botsOnly(mode: GameMode, arena = ARENAS[0], n = 4, chars?: string[]) {
  const ids = chars ?? CHARACTERS.map((c) => c.id).sort(() => Math.random() - 0.5);
  const roster = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, char: ids[i % ids.length], isBot: true }));
  return new Game({ arena, humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode, roster });
}

describe('modos novos', () => {
  for (const arena of ARENAS) {
    it(`bandeira em ${arena.name}`, () => {
      const g = botsOnly('bandeira', arena);
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(g.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
      console.log('bandeira', arena.id, 'placar', g.teamScore.join('x'), 'pegou', ev.flagTake ?? 0, 'capturas', ev.capture ?? 0, 'renasceu', ev.respawn ?? 0);
    });
    it(`rei da colina em ${arena.name}`, () => {
      const g = botsOnly('rei', arena);
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(Math.max(...g.players.map((p) => p.score))).toBeGreaterThan(5);
      console.log('rei', arena.id, g.players.map((p) => `${p.char.id}:${p.score}`).join(' '), 'colina mudou', ev.hillMove ?? 0);
    });
    it(`ondas em ${arena.name}`, () => {
      const g = botsOnly('ondas', arena, 3);
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(ev.enemyKill ?? 0).toBeGreaterThan(3);
      console.log('ondas', arena.id, 'onda', g.wave, 'venceu', g.gameWon, 'robôs', ev.enemyKill ?? 0);
    });
    it(`batalha real em ${arena.name}`, () => {
      const g = botsOnly('royale', arena, 6);
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(ev.kill ?? 0).toBeGreaterThan(0);
      console.log('royale', arena.id, g.players.map((p) => `${p.char.id}:${p.score}k${p.kills}`).join(' '));
    });
  }

  it('todas as habilidades novas funcionam no combate e no núcleo', () => {
    for (const mode of ['combate', 'nucleo'] as GameMode[]) {
      const g = botsOnly(mode, ARENAS[0], 4, ['tara', 'kai', 'leo', 'mei']);
      const ev = play(g);
      expect(g.phase).toBe('results');
      expect(ev.ability ?? 0).toBeGreaterThan(4);
      const g2 = botsOnly(mode, ARENAS[1], 2, ['duda', 'bento']);
      play(g2);
      expect(g2.phase).toBe('results');
    }
  });
});
