import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { kitOf } from '../src/game/elements';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(mode: 'duelo' | 'dupla', a = 'kai', b = 'luna', bot = false) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: a,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode,
    roster: [
      { id: 'a', char: a, isBot: false },
      { id: 'b', char: b, isBot: bot },
    ],
    roundSec: 30,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

describe('X1 e 2x2 só com poderes', () => {
  it('o clique não atira no X1 nem no 2x2', () => {
    for (const mode of ['duelo', 'dupla'] as const) {
      const g = fight(mode);
      const [a, b] = g.players;
      a.x = 640;
      a.y = 360;
      b.x = 760;
      b.y = 360;
      g.step(STEP, { a: { ...idle, fire: true, aim: 0 }, b: idle });
      expect(g.bullets.filter((n) => !n.el)).toHaveLength(0);
      expect(b.hp).toBe(b.maxHp);
      expect(a.powerCd.every((n) => n === 0)).toBe(true);
    }
  });

  it('R e F saem sem carga de ultimate e sem cristal, e a recarga não reinicia', () => {
    const g = fight('dupla', 'kai', 'luna');
    const [a] = g.players;
    a.ultCharge = 0;
    a.bonusAb = null;
    a.x = 640;
    a.y = 360;
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[2]).toBeGreaterThan(3);
    const left = a.powerCd[2];
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[2]).toBeLessThan(left);
    expect(a.powerCd[2]).toBeGreaterThan(left - 0.05);
    g.step(STEP, { a: { ...idle, bonus: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[3]).toBeGreaterThan(0);
    expect(a.bonusAb).toBeNull();
  });

  it('Q lança o poder e gelo seguido de raio vira Estilhaçar', () => {
    const g = fight('duelo', 'kai', 'luna');
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 760;
    b.y = 360;
    a.aim = 0;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[0]).toBeGreaterThan(0);
    expect(g.bullets.some((n) => n.el === 'ice')).toBe(true);
    for (let i = 0; i < 40 && b.frozenT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.frozenT).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(before);
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 120 }, b: idle });
    const ev = g.drainEvents();
    const combo = ev.find((e) => e.type === 'combo');
    expect(combo).toMatchObject({ name: 'Estilhaçar', bonus: 24 });
    expect(b.hp).toBeLessThan(before - 20);
    expect(kitOf('kai').passive).toBe('shatter');
  });

  it('vento contra a parede deixa tonto e mostra Pancada', () => {
    const g = fight('duelo', 'kael', 'luna');
    const [a, b] = g.players;
    g.iceWalls.push({ id: 7, owner: 'x', kind: 'gelo', x: 400, y: 300, w: 40, h: 120, t: 8 });
    a.x = 560;
    a.y = 360;
    b.x = 480;
    b.y = 360;
    a.invulnT = 0;
    b.invulnT = 0;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, ability: true, aim: Math.PI, ca: Math.PI }, b: idle });
    for (let i = 0; i < 30 && b.stunT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'combo' && e.name === 'Pancada' && e.bonus === 6)).toBe(true);
    expect(b.stunT).toBeGreaterThan(0);
  });

  it('gelo que já passou não vira Estilhaçar', () => {
    const g = fight('duelo', 'kai', 'luna');
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 760;
    b.y = 360;
    b.frozenT = 0.05;
    g.drainEvents();
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.frozenT).toBe(0);
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 120 }, b: idle });
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'combo')).toBe(false);
  });

  it('o bot do X1 e do 2x2 usa poder e não atira', () => {
    const g = fight('dupla', 'maya', 'nyx', true);
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 720;
    b.y = 360;
    a.invulnT = 0;
    b.invulnT = 0;
    b.brain!.targetId = a.id;
    b.brain!.seenT = 5;
    b.brain!.restT = 0;
    b.powerCd = [0, 0, 0, 0];
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle });
    const cast = b.powerCd.some((n) => n > 0) || g.bullets.some((n) => n.el);
    expect(cast).toBe(true);
    expect(g.bullets.every((n) => n.el || n.owner !== b.id)).toBe(true);
  });
});
