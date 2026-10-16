import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { kitOf, resolvedDamage } from '../src/game/elements';
import { COMBUST_BONUS, EXECUTE_BONUS, resolveReaction, type HitQuery } from '../src/game/combos';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function q(partial: Partial<HitQuery> & Pick<HitQuery, 'element'>): HitQuery {
  return {
    charId: 'kael',
    aoe: false,
    projectile: true,
    slot: 0,
    appliesMark: false,
    roots: partial.element === 'nature',
    aura: { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '', stun: 0 },
    marked: 0,
    field: 0,
    fieldEl: '',
    stun: 0,
    reactCd: 0,
    ...partial,
  };
}

function fight(roster: { id: string; char: string }[]) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: roster[0].char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: roster.map((r) => ({ id: r.id, char: r.char, isBot: false })),
    roundSec: 30,
    suddenSec: 8,
  });
  const pad = Object.fromEntries(roster.map((r) => [r.id, idle]));
  while (g.phase !== 'play') g.step(STEP, pad);
  for (const p of g.players) p.invulnT = 0;
  return g;
}

function untilHit(g: Game, pid: string, before: number) {
  const p = g.players.find((o) => o.id === pid)!;
  for (let i = 0; i < 90 && p.hp === before; i++) g.step(STEP, {});
  return p;
}

describe('combos com efeito de verdade', () => {
  it('tempestade, combustão, ruptura e execução saem na ordem certa', () => {
    const storm = resolveReaction(q({ charId: 'leo', element: 'lightning', aura: { burn: 0, frozen: 0, gust: 1, shock: 0 } }));
    expect(storm).toMatchObject({ id: 'storm', name: 'Tempestade', bonus: 18 });
    expect(resolveReaction(q({ charId: 'leo', element: 'wind', aura: { burn: 0, frozen: 0, gust: 0, shock: 1 } }))?.name).not.toBe('Tempestade');

    const burn = resolveReaction(q({ element: 'fire', aura: { burn: 0, frozen: 0, gust: 0, shock: 0, root: 1 } }));
    expect(burn).toMatchObject({ id: 'combustao', name: 'Fissura Magmática', bonus: COMBUST_BONUS, aoe: 64 });
    expect(resolveReaction(q({ element: 'fire' }))).toBeNull();

    expect(resolveReaction(q({ element: 'plasma', aura: { burn: 0, frozen: 1, gust: 0, shock: 0 } }))).toMatchObject({ id: 'chill', name: 'Ruptura', bonus: 8 });
    expect(resolveReaction(q({ element: 'plasma', slow: 1 }))).toMatchObject({ name: 'Ruptura', bonus: 8 });
    expect(resolveReaction(q({ element: 'plasma' }))).toBeNull();

    expect(resolveReaction(q({ element: 'lightning', stun: 1 }))).toMatchObject({ id: 'execute', name: 'Execução combinada', bonus: EXECUTE_BONUS });
    expect(resolveReaction(q({ element: 'lightning' }))).toBeNull();
    expect(resolveReaction(q({ element: 'nature', roots: true, aoe: true, aura: { burn: 0, frozen: 0, gust: 0, shock: 0, root: 1 } }))?.name).toBe('Raiz e impacto');
  });

  it('fogo num alvo preso explode uma vez e não acerta quem está longe', () => {
    const g = fight([
      { id: 'a', char: 'maya' },
      { id: 'b', char: 'kael' },
      { id: 'c', char: 'kael' },
      { id: 'd', char: 'kael' },
    ]);
    const [a, b, c, d] = g.players;
    a.x = 300;
    a.y = 360;
    b.x = 460;
    b.y = 360;
    c.x = 500;
    c.y = 360;
    d.x = 760;
    d.y = 360;
    b.rootT = 1.5;
    const base = resolvedDamage(kitOf('maya').powers[0], 0);
    const hb = b.hp;
    const hc = c.hp;
    const hd = d.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle, c: idle, d: idle });
    untilHit(g, 'b', hb);
    const names = g.drainEvents().filter((e) => e.type === 'combo').map((e) => (e.type === 'combo' ? e.name : ''));
    expect(names.filter((n) => n === 'Fissura Magmática')).toEqual(['Fissura Magmática']);
    expect(hb - b.hp).toBe(base + COMBUST_BONUS);
    expect(hc - c.hp).toBe(COMBUST_BONUS * 0.5);
    expect(d.hp).toBe(hd);

    a.powerCd[0] = 0;
    a.energy = 100;
    const again = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle, c: idle, d: idle });
    untilHit(g, 'b', again);
    const second = g.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Fissura Magmática');
    expect(second).toHaveLength(0);
    expect(again - b.hp).toBeGreaterThanOrEqual(base);
    expect(again - b.hp).toBeLessThan(base + COMBUST_BONUS);
  });

  it('plasma lento ou congelado rompe uma vez, e longe não finge acerto', () => {
    const slow = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = slow.players;
    a.x = 400;
    a.y = 360;
    b.x = 520;
    b.y = 360;
    b.slowT = 1.2;
    const before = b.hp;
    slow.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    untilHit(slow, 'b', before);
    expect(before - b.hp).toBe(resolvedDamage(kitOf('vortex').powers[0], 0) + 8);
    expect(slow.drainEvents().some((e) => e.type === 'combo' && e.name === 'Ruptura' && e.bonus === 8)).toBe(true);

    const far = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    far.players[0].x = 80;
    far.players[0].y = 360;
    far.players[1].x = 1100;
    far.players[1].y = 360;
    far.players[1].frozenT = 2;
    const hp = far.players[1].hp;
    far.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 80; i++) far.step(STEP, { a: idle, b: idle });
    expect(far.players[1].hp).toBe(hp);
    expect(far.drainEvents().some((e) => e.type === 'combo')).toBe(false);
  });

  it('controle e depois o golpe ofensivo soma uma vez', () => {
    const g = fight([
      { id: 'a', char: 'duda' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 540;
    b.y = 360;
    b.stunT = 1.2;
    const base = resolvedDamage(kitOf('duda').powers[0], 0);
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    untilHit(g, 'b', before);
    expect(before - b.hp).toBe(base + EXECUTE_BONUS);
    const combos = g.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Execução combinada');
    expect(combos).toHaveLength(1);
  });
});
