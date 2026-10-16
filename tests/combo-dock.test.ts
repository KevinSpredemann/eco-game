import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { comboDockState, comboDockTag } from '../src/game/comboDock';
import { ENERGY_MAX } from '../src/game/elements';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };
const LABELS = ['Q', 'G', 'R', 'F'];

function duel() {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'nara',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: false,
    training: true,
    dummy: true,
    mode: 'duelo',
    roundSec: 60,
    suddenSec: 30,
    roster: [
      { id: 'a', char: 'nara', isBot: false, name: 'Você' },
      { id: 'b', char: 'kael', isBot: false, name: 'Alvo' },
    ],
  });
  const pad = { a: idle, b: idle };
  while (g.phase !== 'play') g.step(STEP, pad);
  const [a, b] = g.players;
  a.x = 400;
  a.y = 360;
  b.x = 470;
  b.y = 360;
  a.vx = a.vy = b.vx = b.vy = 0;
  a.invulnT = b.invulnT = 0;
  a.energy = ENERGY_MAX;
  a.ultCharge = 100;
  a.powerCd.fill(0);
  return { g, a, b };
}

function dock(g: Game, now = 0) {
  return comboDockState(g, { labels: LABELS, plasmaKey: 'Z', now, done: null });
}

describe('cais de combo', () => {
  it('mostra as cinco frases a partir do combate real e do atalho customizado', () => {
    const { g, a, b } = duel();
    const ready = dock(g);
    expect(ready?.phase).toBe('ready');
    expect(comboDockTag(ready!)).toBe('COMBO DISPONÍVEL');

    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    for (let i = 0; i < 90 && b.markedT <= 0; i++) {
      b.x = 470;
      b.y = 360;
      g.step(STEP, { a: idle, b: idle });
    }
    expect(b.markedT).toBeGreaterThan(0);

    const armed = dock(g);
    expect(armed?.phase).toBe('armed');
    expect(armed?.key).toBe('G');
    expect(comboDockTag(armed!)).toBe('PRÓXIMA HABILIDADE: G');

    a.energy = 0;
    a.ultCharge = 0;
    const poor = dock(g);
    expect(poor?.phase).toBe('wait');
    expect(poor?.need ?? '').toMatch(/energia/i);
    expect(comboDockTag(poor!)).toBe('ENERGIA INSUFICIENTE');

    a.energy = ENERGY_MAX;
    a.ultCharge = 100;
    a.powerCd.fill(2.4);
    const cooled = dock(g);
    expect(cooled?.phase).toBe('wait');
    expect(cooled?.need ?? '').toMatch(/recarga/i);
    expect(comboDockTag(cooled!)).toBe('SEQUÊNCIA INTERROMPIDA');

    a.powerCd.fill(0);
    a.x = 400;
    a.y = 360;
    b.x = 470;
    b.y = 360;
    const before = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: idle });
    const names = g.drainEvents().flatMap((e) => (e.type === 'combo' ? [e.name] : []));
    expect(names).toContain('Raiz firme');
    expect(b.hp).toBeLessThan(before);

    const done = comboDockState(g, {
      labels: LABELS,
      plasmaKey: 'Z',
      now: 1000,
      done: { name: 'Raiz firme', aEl: 'nature', bEl: 'nature', until: 2000 },
    });
    expect(done?.phase).toBe('done');
    expect(comboDockTag(done!)).toBe('COMBO EXECUTADO');
  });
});
