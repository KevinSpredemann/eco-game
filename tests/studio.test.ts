import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { STUDIO, kitOf } from '../src/game/elements';
import { acceptedLoadout, newProfile, normalizeProfile, owns } from '../src/game/economy';
import { CHARACTERS } from '../src/game/characters';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function duel(char: string, load?: { secondary?: string | null }) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roundSec: 30,
    suddenSec: 8,
    roster: [
      { id: 'a', char, isBot: false, loadout: load },
      { id: 'b', char: 'luna', isBot: false },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  return g;
}

describe('estúdio', () => {
  it('os poderes extras cabem nos limites e o perfil só aceita o que liberou', () => {
    for (const s of STUDIO) {
      expect(s.cd).toBeGreaterThanOrEqual(2.5);
      expect(s.cd).toBeLessThanOrEqual(8);
      expect(s.dmg).toBeGreaterThanOrEqual(6);
      expect(s.dmg).toBeLessThanOrEqual(20);
    }
    const fresh = newProfile();
    expect(owns(fresh, 'power:arpejo')).toBe(true);
    expect(owns(fresh, 'power:fermata')).toBe(true);
    expect(owns(fresh, 'power:plasma')).toBe(false);
    expect(owns(fresh, 'power:prisma')).toBe(false);
    expect(acceptedLoadout(fresh, { secondary: 'prisma' }).secondary).toBeNull();
    expect(acceptedLoadout(fresh, { secondary: 'arpejo' }).secondary).toBe('arpejo');
    expect(acceptedLoadout(fresh, { secondary: 'nao-existe' }).secondary).toBeNull();
    fresh.matches = 5;
    normalizeProfile(fresh);
    expect(owns(fresh, 'power:reverso')).toBe(true);
    expect(acceptedLoadout(fresh, { secondary: 'reverso' }).secondary).toBe('reverso');
    fresh.matches = 0;
    normalizeProfile(fresh);
    expect(owns(fresh, 'power:reverso')).toBe(false);
    expect(kitOf('clave').powers[0].act).toBe('wall');
    expect(CHARACTERS.some((c) => c.id === 'sibilo2')).toBe(true);
  });

  it('a muralha da Clave segura o tiro', () => {
    const g = duel('clave');
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 640;
    b.y = 360;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(g.iceWalls.length).toBeGreaterThan(0);
    const hp = b.hp;
    a.ultCharge = 100;
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 90; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
  });

  it('a Fuga pisca e deixa uma ilusão no ponto de saída', () => {
    const g = duel('fuga');
    const [a] = g.players;
    a.x = 320;
    a.y = 360;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(a.x).toBeGreaterThan(420);
    expect(g.clones.length).toBeGreaterThan(0);
  });

  it('o Reverso puxa e a Fermata deixa lento', () => {
    const pull = duel('kael', { secondary: 'reverso' });
    const [a, b] = pull.players;
    a.x = 400;
    a.y = 360;
    b.x = 460;
    b.y = 360;
    pull.step(STEP, { a: { ...idle, plasma: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    expect(b.pullT).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(b.maxHp);

    const slow = duel('kael', { secondary: 'fermata' });
    const [c, d] = slow.players;
    c.x = 400;
    c.y = 360;
    d.x = 450;
    d.y = 360;
    slow.step(STEP, { a: { ...idle, plasma: true, aim: 0, ca: 0, cr: 50 }, b: idle });
    expect(d.frozenT).toBeGreaterThan(0);
    expect(d.hp).toBeLessThan(d.maxHp);
  });

  it('os mapas novos abrem e a maré tem ilha', () => {
    expect(getArena('recife').islands?.length).toBeGreaterThan(0);
    expect(getArena('recife').bridges?.some((b) => b.period > 0)).toBe(true);
    expect(getArena('vinil').conveyors?.length).toBe(1);
    const g = new Game({
      arena: getArena('anfiteatro'),
      humanChar: 'lyra',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'a', char: 'lyra', isBot: false },
        { id: 'b', char: 'rufo', isBot: false },
      ],
    });
    while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
    expect(g.phase).toBe('play');
    expect(g.players).toHaveLength(2);
  });
});
