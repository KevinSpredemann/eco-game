import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { kitOf, resolvedDamage } from '../src/game/elements';
import { aimStop, castFamily, chargeFactor, losOpen } from '../src/game/aimMath';
import { resolveCastStyle, stickIntent } from '../src/ui/input';
import { PROFILES } from '../src/game/bot';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(chars: { id: string; char: string }[] = [
  { id: 'a', char: 'kai' },
  { id: 'b', char: 'luna' },
]) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: chars[0].char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: chars.map((r) => ({ id: r.id, char: r.char, isBot: false })),
    roundSec: 40,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, Object.fromEntries(chars.map((r) => [r.id, idle])));
  for (const p of g.players) p.invulnT = 0;
  return g;
}

function wall(x: number, y: number, w: number, h: number) {
  return { id: 9, owner: 'x', kind: 'gelo' as const, x, y, w, h, t: 8 };
}

describe('mira, carga e leitura do golpe', () => {
  it('segurar mira no automático e o rápido continua na hora', () => {
    expect(resolveCastStyle({ castMode: 'auto', control: 'classic', touch: false, manual: false, kind: 'direction' })).toBe('release');
    expect(resolveCastStyle({ castMode: 'auto', control: 'notebook', touch: true, manual: false, kind: 'point' })).toBe('release');
    expect(resolveCastStyle({ castMode: 'auto', control: 'classic', touch: false, manual: false, kind: 'instant' })).toBe('instant');
    expect(resolveCastStyle({ castMode: 'instant', control: 'classic', touch: false, manual: false, kind: 'direction' })).toBe('instant');
  });

  it('WASD anda e as setas só miram', () => {
    const aim = stickIntent({
      moveScheme: 'wasd',
      keyboardAim: false,
      aiming: true,
      precision: false,
      arrows: { x: 1, y: 0 },
      keys: { x: 0, y: -1 },
      stick: { x: 0, y: 0 },
      prevAim: Math.PI,
    });
    expect(aim.mx).toBe(0);
    expect(aim.my).toBe(-1);
    expect(aim.aim).toBeCloseTo(0);
    expect(aim.arrows).toBe(true);
    const walk = stickIntent({
      moveScheme: 'wasd',
      keyboardAim: false,
      aiming: true,
      precision: false,
      arrows: { x: 0, y: 0 },
      keys: { x: 1, y: 0 },
      stick: { x: 0, y: 0 },
      prevAim: 1,
    });
    expect(walk.mx).toBe(1);
    expect(walk.aim).toBeCloseTo(0);
  });

  it('o traço para na parede e não marca impacto atrás dela', () => {
    const stop = aimStop(0, 0, 0, 200, 3, [{ x: 80, y: -20, w: 8, h: 40 }], [], { minX: -50, minY: -50, maxX: 400, maxY: 400 });
    expect(stop.blocked).toBe(true);
    expect(stop.x).toBeLessThan(80);
    expect(stop.dist).toBeLessThan(90);
    expect(losOpen(0, 0, 160, 0, [{ x: 80, y: -20, w: 8, h: 40 }], [], { minX: -50, minY: -50, maxX: 400, maxY: 400 })).toBe(false);
  });

  it('Q acerta, a parede segura, e sem energia não gasta', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 520;
    b.y = 250;
    const before = b.hp;
    const dmg = resolvedDamage(kitOf('kai').powers[0], 0);
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === before; i++) g.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(dmg);
    expect(a.powerCd[0]).toBeGreaterThan(0);

    const blocked = fight();
    const [s, t] = blocked.players;
    s.x = 400;
    s.y = 250;
    t.x = 620;
    t.y = 250;
    blocked.iceWalls.push(wall(480, 180, 8, 140));
    blocked.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40; i++) blocked.step(STEP, { a: idle, b: idle });
    expect(t.hp).toBe(t.maxHp);
    expect(blocked.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Obstáculo')).toBe(true);

    const dry = fight();
    dry.players[0].energy = 0;
    dry.players[0].x = 400;
    dry.players[0].y = 250;
    dry.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(dry.players[0].energy).toBeLessThan(1);
    expect(dry.players[0].powerCd[0]).toBe(0);
    expect(dry.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Energia insuficiente')).toBe(true);
  });

  it('área pega quem está dentro e a raiz acaba', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
      { id: 'c', char: 'luna' },
    ]);
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 300;
    b.x = 460;
    b.y = 300;
    c.x = 700;
    c.y = 300;
    const hb = b.hp;
    const hc = c.hp;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle, c: idle });
    expect(hb - b.hp).toBeGreaterThan(0);
    expect(c.hp).toBe(hc);
    b.rootT = 0.4;
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle, c: idle });
    expect(b.rootT).toBe(0);
  });

  it('Q marca raiz e E em cima dela fecha o combo', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 480;
    b.y = 250;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.rootT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.rootT).toBeGreaterThan(0);
    const mid = b.hp;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(b.hp).toBeLessThan(mid);
    expect(g.drainEvents().some((e) => e.type === 'combo' && e.name === 'Raiz e impacto')).toBe(true);
  });

  it('ultimate antes da carga não sai; carga cheia gasta e a carga parcial dói menos', () => {
    const early = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const [a, b] = early.players;
    a.ultCharge = 40;
    a.x = 400;
    a.y = 250;
    b.x = 460;
    b.y = 250;
    const hp = b.hp;
    early.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    expect(b.hp).toBe(hp);
    expect(a.ultCharge).toBeGreaterThan(40);
    expect(a.ultCharge).toBeLessThan(41);
    expect(early.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Ultimate em carga')).toBe(true);

    const full = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const [s, t] = full.players;
    s.ultCharge = 100;
    s.x = 400;
    s.y = 250;
    t.x = 440;
    t.y = 250;
    full.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 40, ch: 1 }, b: idle });
    const fullHit = t.maxHp - t.hp;
    expect(s.ultCharge).toBe(0);
    expect(fullHit).toBe(Math.round(resolvedDamage(kitOf('nara').powers[2], 2) * chargeFactor(1)));

    const low = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const [u, v] = low.players;
    u.ultCharge = 100;
    u.x = 400;
    u.y = 250;
    v.x = 440;
    v.y = 250;
    low.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 40, ch: 0 }, b: idle });
    expect(v.maxHp - v.hp).toBeLessThan(fullHit);
    expect(v.maxHp - v.hp).toBe(Math.round(resolvedDamage(kitOf('nara').powers[2], 2) * chargeFactor(0)));
    expect(castFamily(kitOf('nara').powers[2])).toBe('charged');
  });

  it('a dificuldade não muda o dano do golpe', () => {
    expect(PROFILES.facil.speedMul).toBe(1);
    expect(PROFILES.dificil.speedMul).toBe(1);
    const easy = fight([
      { id: 'a', char: 'kai' },
      { id: 'b', char: 'luna' },
    ]);
    easy.cfg.difficulty = 'facil';
    const hard = fight([
      { id: 'a', char: 'kai' },
      { id: 'b', char: 'luna' },
    ]);
    hard.cfg.difficulty = 'dificil';
    for (const g of [easy, hard]) {
      const [a, b] = g.players;
      a.x = 400;
      a.y = 250;
      b.x = 520;
      b.y = 250;
    }
    const beforeE = easy.players[1].hp;
    const beforeH = hard.players[1].hp;
    easy.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    hard.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40; i++) {
      easy.step(STEP, { a: idle, b: idle });
      hard.step(STEP, { a: idle, b: idle });
    }
    expect(beforeE - easy.players[1].hp).toBe(beforeH - hard.players[1].hp);
    expect(beforeE - easy.players[1].hp).toBe(resolvedDamage(kitOf('kai').powers[0], 0));
  });
});
