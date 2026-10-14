import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { COMBAT } from '../src/game/balance';
import { CHARACTERS } from '../src/game/characters';
import { PROFILES } from '../src/game/bot';
import { keyboardAimAngle } from '../src/ui/input';
import {
  BASIC,
  KITS,
  REF_HP,
  damageBand,
  describePower,
  kitOf,
  powerBand,
  resolvedDamage,
  stunTime,
} from '../src/game/elements';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

describe('rebalance', () => {
  it('o texto de cada poder usa o mesmo dano que o combate', () => {
    const basic = damageBand('basic');
    const strong = damageBand('strong');
    const ult = damageBand('ult');
    expect(BASIC.dmg).toBeGreaterThanOrEqual(basic.min);
    expect(BASIC.dmg).toBeLessThanOrEqual(basic.max);
    expect(REF_HP).toBe(COMBAT.maxHp);
    for (const id of Object.keys(KITS)) {
      const kit = kitOf(id);
      kit.powers.forEach((pw, slot) => {
        const dmg = resolvedDamage(pw, slot);
        const text = describePower(pw, 'Q', 18, slot);
        expect(text, `${id} ${pw.name}`).toContain(pw.zone === 'heal' ? `cura ${dmg}` : `dano ${dmg}`);
        const band = powerBand(pw, slot);
        if (band === 'touch') {
          expect(dmg).toBe(pw.dmg);
          return;
        }
        const range = damageBand(band);
        expect(dmg, `${id} ${pw.name}`).toBeGreaterThanOrEqual(range.min);
        expect(dmg, `${id} ${pw.name}`).toBeLessThanOrEqual(range.max);
        if (slot === 2) expect(text).toContain('carga da ultimate');
      });
    }
    expect(stunTime('kael')).toBeGreaterThanOrEqual(0.5);
    expect(stunTime('kael')).toBeLessThanOrEqual(1.5);
    expect(stunTime('zed')).toBeLessThanOrEqual(COMBAT.maxStun);
  });

  it('jogador e bot levam o mesmo dano nas mesmas condições', () => {
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'dificil',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'a', char: 'kael', isBot: false },
        { id: 'b', char: 'kael', isBot: true },
      ],
    });
    while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
    const [player, bot] = g.players;
    player.invulnT = 0;
    bot.invulnT = 0;
    player.shieldHp = 0;
    bot.shieldHp = 0;
    g.hurt(player, 20, null, 'pulse');
    g.hurt(bot, 20, null, 'pulse');
    expect(bot.isBot).toBe(true);
    expect(player.hp).toBe(bot.hp);
    expect(player.maxHp).toBe(bot.maxHp);
    expect(PROFILES.facil.speedMul).toBe(1);
    expect(PROFILES.normal.speedMul).toBe(1);
    expect(PROFILES.dificil.speedMul).toBe(1);
    expect(PROFILES.facil.react).toBeGreaterThan(PROFILES.dificil.react);
    expect(PROFILES.facil.aim).toBeGreaterThan(PROFILES.dificil.aim);
  });

  it('as setas miram sem mudar a regra do passo', () => {
    const ahead = keyboardAimAngle(0, { x: 0, y: -1 }, { x: 0, y: 1 });
    expect(ahead).toBeCloseTo(-Math.PI / 2);
    const walk = keyboardAimAngle(0.4, { x: 0, y: 0 }, { x: -1, y: 0 });
    expect(walk).toBeCloseTo(Math.PI);
    expect(keyboardAimAngle(0.4, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0.4);
    expect(CHARACTERS.length).toBeGreaterThan(10);
  });
});
