import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { KITS, ULTS, gearPrice } from '../src/game/balance';
import { WEAPONS, weaponDps, isPrimary } from '../src/game/weapons';
import { PROTO } from '../src/net/protocol';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight() {
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
      { id: 'b', char: 'luna', isBot: false },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

describe('conteúdo e feedback do playtest', () => {
  it('armas, ultimates e bombas novas já vêm liberadas', () => {
    for (const id of ['arco', 'plasma', 'agulha', 'submetra', 'lancador', 'pulso', 'gelo', 'kit', 'barreira', 'estase', 'onda', 'lanca']) {
      expect(gearPrice(id), id).toBe(0);
    }
    expect(KITS.pulso.count).toBe(2);
    expect(ULTS.onda.damage).toBeGreaterThan(0);
    expect(ULTS.lanca.damage).toBeGreaterThan(0);
    for (const id of ['arco', 'plasma', 'agulha'] as const) {
      expect(isPrimary(id)).toBe(true);
      expect(weaponDps(WEAPONS[id])).toBeGreaterThan(24);
      expect(weaponDps(WEAPONS[id])).toBeLessThan(55);
    }
    expect(PROTO).toBe(8);
  });

  it('Q e E do 2x2 causam dano de poder, não de item', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 330;
    b.x = 560;
    b.y = 330;
    a.item = null;
    a.itemN = 0;
    a.aim = 0;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, aim: 0, ca: 0, ability: true }, b: idle });
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(before);
    expect(g.bullets.every((n) => !!n.el)).toBe(true);

    const g2 = fight();
    const [p, q] = g2.players;
    p.x = 400;
    p.y = 330;
    q.x = 450;
    q.y = 330;
    p.ultCharge = 0;
    const hp = q.hp;
    g2.step(STEP, { a: { ...idle, skill: true, ca: 0, cr: 80 }, b: idle });
    expect(p.powerCd[1]).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) g2.step(STEP, { a: idle, b: idle });
    expect(q.hp).toBeLessThan(hp);
  });
});
