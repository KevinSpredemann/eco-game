import { describe, expect, it } from 'vitest';
import { abilityLevel, buy, newProfile, upgradePrice } from '../src/game/economy';
import { getCharacter, withLevel } from '../src/game/characters';
import { Game } from '../src/game/sim';
import { ARENAS } from '../src/game/arenas';

describe('níveis de habilidade', () => {
  it('compra níveis até o máximo e cobra o preço certo', () => {
    const p = newProfile();
    p.coins = 5000;
    expect(abilityLevel(p, 'kael')).toBe(1);
    expect(buy(p, 'up:nyx')).toMatch(/Libere/);
    let spent = 0;
    for (let lv = 1; lv < 5; lv++) {
      const cost = upgradePrice(p, 'kael')!;
      expect(buy(p, 'up:kael')).toBeNull();
      spent += cost;
    }
    expect(abilityLevel(p, 'kael')).toBe(5);
    expect(upgradePrice(p, 'kael')).toBeNull();
    expect(buy(p, 'up:kael')).toMatch(/máximo/);
    expect(p.coins).toBe(5000 - spent);
  });
  it('nível maior: no PvP só um pouco menos de recarga; no cooperativo também mais duração', () => {
    const base = getCharacter('kael');
    const lv5 = withLevel(base, 5);
    expect(lv5.ability.cooldown).toBeLessThan(base.ability.cooldown);
    // sem vantagem injusta no PvP: no máximo 12% de recarga e nada de duração extra
    expect(lv5.ability.cooldown).toBeGreaterThanOrEqual(base.ability.cooldown * 0.88 - 0.05);
    expect(lv5.ability.duration).toBe(base.ability.duration);
    const pve = withLevel(base, 5, true);
    expect(pve.ability.duration).toBeGreaterThan(base.ability.duration);
    const g = new Game({ arena: ARENAS[0], humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'combate', roster: [{ id: 'p0', char: 'kael', isBot: false, lv: 5 }, { id: 'b', char: 'luna', isBot: true }] });
    expect(g.players[0].char.ability.cooldown).toBe(lv5.ability.cooldown);
    expect(g.players[0].char.name).toBe('Zephyr');
  });
});
