import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { kitOf } from '../src/game/elements';
import { sweepCircle, segmentOpen } from '../src/game/sweep';
import { abilityLog, clearAbilityLog, setAbilityTrace } from '../src/game/abilityTrace';
import { queuesOnPress, queuesOnRelease, resolveCastStyle } from '../src/ui/input';
import { GUN_Y } from '../src/game/weapons';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(roster: { id: string; char: string; isBot?: boolean }[] = [
  { id: 'a', char: 'kai' },
  { id: 'b', char: 'luna' },
]) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kai',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: roster.map((r) => ({ id: r.id, char: r.char, isBot: !!r.isBot })),
    roundSec: 30,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, Object.fromEntries(roster.map((r) => [r.id, idle])));
  for (const p of g.players) p.invulnT = 0;
  return g;
}

function wall(x: number, y: number, w: number, h: number) {
  return { id: 9, owner: 'x', kind: 'gelo' as const, x, y, w, h, t: 8 };
}

describe('colisão e ciclo do golpe', () => {
  it('o traço do círculo pega uma parede mais fina que o passo', () => {
    const t = sweepCircle(0, 0, 40, 0, 3, [{ x: 18, y: -8, w: 4, h: 16 }], [], { minX: -100, minY: -100, maxX: 200, maxY: 200 });
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0.2);
    expect(t!).toBeLessThan(0.6);
  });

  it('a linha de visão ignora as pontas', () => {
    const blocked = (x: number) => x < 1 || x > 39;
    expect(segmentOpen((x) => blocked(x), 0, 0, 40, 0, 8)).toBe(true);
    expect(segmentOpen((x) => x > 15 && x < 25, 0, 0, 40, 0, 8)).toBe(false);
  });

  it('Q solta o poder do espaço e a recarga impede o segundo', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 900;
    b.y = 250;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(g.bullets.some((n) => n.el === kitOf('kai').powers[0].element)).toBe(true);
    expect(a.powerCd[0]).toBeGreaterThan(3);
    const n = g.bullets.length;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(g.bullets.length).toBe(n);
    expect(a.powerCd[0]).toBeLessThan(kitOf('kai').powers[0].cd);
  });

  it('o projétil no campo aberto tira o dano do poder', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 520;
    b.y = 250;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 30 && b.hp === before; i++) g.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(kitOf('kai').powers[0].dmg);
  });

  it('parede fina entre os dois segura o projétil', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 620;
    b.y = 250;
    g.iceWalls.push(wall(480, 180, 6, 140));
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(b.maxHp);
    expect(g.bullets.filter((n) => n.owner === a.id).every((n) => n.x < 490)).toBe(true);
  });

  it('projétil muito rápido não atravessa a parede nem fura o alvo livre', () => {
    const open = fight();
    const [a, b] = open.players;
    a.x = 300;
    a.y = 250;
    b.x = 500;
    b.y = 250;
    const before = b.hp;
    open.bullets.push({
      id: 50,
      x: a.x + 20,
      y: a.y - GUN_Y,
      vx: 6000,
      vy: 0,
      owner: a.id,
      dmg: 10,
      life: 1,
      weapon: 'pulsador',
      pierce: false,
      fromEcho: false,
      hit: [],
      el: 'wind',
    });
    open.step(0.05, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(before);

    const blocked = fight();
    const [s, t] = blocked.players;
    s.x = 300;
    t.x = 800;
    s.y = t.y = 250;
    blocked.iceWalls.push(wall(460, 160, 4, 180));
    blocked.bullets.push({
      id: 51,
      x: s.x + 20,
      y: s.y - GUN_Y,
      vx: 6000,
      vy: 0,
      owner: s.id,
      dmg: 10,
      life: 1,
      weapon: 'pulsador',
      pierce: false,
      fromEcho: false,
      hit: [],
      el: 'wind',
    });
    blocked.step(0.05, { a: idle, b: idle });
    expect(t.hp).toBe(t.maxHp);
    expect(blocked.bullets.every((n) => n.x < 470)).toBe(true);
  });

  it('a área acerta quem está no raio e poupa quem está atrás da parede', () => {
    const g = fight([
      { id: 'a', char: 'kai' },
      { id: 'b', char: 'luna' },
      { id: 'c', char: 'luna' },
    ]);
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 460;
    b.y = 250;
    c.x = 460;
    c.y = 300;
    g.iceWalls.push(wall(420, 268, 24, 20));
    const hb = b.hp;
    const hc = c.hp;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 60 }, b: idle, c: idle });
    expect(hb - b.hp).toBe(kitOf('kai').powers[1].dmg);
    expect(c.hp).toBe(hc);
    expect(a.powerCd[1]).toBeGreaterThan(0);
  });

  it('área sem ninguém visível não gasta', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 460;
    b.y = 250;
    g.iceWalls.push(wall(424, 200, 16, 100));
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    expect(b.hp).toBe(b.maxHp);
    expect(a.powerCd[1]).toBe(0);
    expect(a.energy).toBe(100);
  });

  it('o impulso não atravessa uma parede fina', () => {
    const g = fight();
    const [a] = g.players;
    a.x = 560;
    a.y = 250;
    a.dir = 0;
    g.iceWalls.push(wall(600, 180, 8, 140));
    g.step(0.1, { a: { ...idle, dash: true, mx: 1 }, b: idle });
    expect(a.x).toBeLessThan(600);
    expect(a.x).toBeGreaterThan(520);
  });

  it('preparo cancelado por atordoamento não gasta', () => {
    const pw = kitOf('kai').powers[0];
    const prev = pw.windup;
    pw.windup = 0.3;
    try {
      const g = fight();
      const [a, b] = g.players;
      a.x = 400;
      a.y = 250;
      b.x = 900;
      b.y = 250;
      g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
      expect(a.powerCd[0]).toBe(0);
      expect(a.energy).toBe(100);
      expect(g.bullets.length).toBe(0);
      expect(a.castT).toBeGreaterThan(0);
      a.stunT = 0.4;
      g.step(STEP, { a: idle, b: idle });
      expect(a.pendingCast).toBeNull();
      expect(a.powerCd[0]).toBe(0);
      expect(a.energy).toBe(100);
    } finally {
      pw.windup = prev;
    }
  });

  it('a recarga do preparo começa quando o golpe sai', () => {
    const pw = kitOf('kai').powers[0];
    const prev = pw.windup;
    pw.windup = 0.2;
    try {
      const g = fight();
      const [a, b] = g.players;
      a.x = 400;
      a.y = 250;
      b.x = 900;
      b.y = 250;
      g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
      expect(a.powerCd[0]).toBe(0);
      g.step(0.25, { a: idle, b: idle });
      expect(a.powerCd[0]).toBeGreaterThan(0);
      expect(a.energy).toBeLessThan(100);
      expect(g.bullets.some((n) => n.el === 'ice') || b.hp < b.maxHp).toBe(true);
    } finally {
      pw.windup = prev;
    }
  });

  it('perseguição acaba quando o alvo cai', () => {
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 700;
    b.y = 120;
    g.bullets.push({
      id: 70,
      x: 400,
      y: 250 - GUN_Y,
      vx: 500,
      vy: 0,
      owner: a.id,
      dmg: 4,
      life: 2,
      weapon: 'pulsador',
      pierce: false,
      fromEcho: false,
      hit: [],
      homeId: b.id,
    });
    g.step(0.1, { a: idle, b: idle });
    const shot = g.bullets.find((n) => n.homeId === b.id);
    expect(shot && shot.vy).toBeLessThan(0);
    b.alive = false;
    g.step(STEP, { a: idle, b: idle });
    expect(g.bullets.some((n) => n.homeId === b.id)).toBe(false);
  });

  it('troca de poder não entra no meio da luta', () => {
    const g = fight();
    const [a, b] = g.players;
    expect(a.plasmaOn).toBe(false);
    g.setLoadout(a.id, { secondary: 'plasma' });
    g.step(STEP, { a: idle, b: idle });
    expect(a.plasmaOn).toBe(false);
    expect(a.pendingLoadout?.secondary).toBe('plasma');
    b.hp = 0;
    b.alive = false;
    const round = g.round;
    for (let i = 0; i < 12 && (g.phase !== 'play' || g.round === round); i++) g.step(1, { a: idle, b: idle });
    expect(g.phase).toBe('play');
    expect(a.plasmaOn).toBe(true);
  });

  it('o bot usa um poder e um comando não sai duas vezes', () => {
    const g = fight([
      { id: 'a', char: 'kai' },
      { id: 'b', char: 'nyx', isBot: true },
    ]);
    const [a, b] = g.players;
    a.x = 640;
    a.y = 360;
    b.x = 760;
    b.y = 360;
    b.brain!.targetId = a.id;
    b.brain!.seenT = 5;
    b.brain!.restT = 0;
    b.powerCd = [0, 0, 0, 0];
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle });
    expect(b.powerCd.some((n) => n > 0) || g.bullets.some((n) => n.owner === b.id)).toBe(true);
  });

  it('o rastro de desenvolvimento liga e desliga', () => {
    setAbilityTrace(true);
    clearAbilityLog();
    const g = fight();
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 900;
    b.y = 250;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(abilityLog().some((s) => s.step === 'launch')).toBe(true);
    setAbilityTrace(false);
    expect(abilityLog()).toHaveLength(0);
  });
});

describe('mira', () => {
  it('automático, soltar, manual e cancelar seguem a escolha', () => {
    expect(resolveCastStyle({ castMode: 'auto', control: 'classic', touch: false, manual: false, kind: 'direction' })).toBe('release');
    expect(resolveCastStyle({ castMode: 'auto', control: 'notebook', touch: false, manual: false, kind: 'direction' })).toBe('instant');
    expect(resolveCastStyle({ castMode: 'manual', control: 'notebook', touch: false, manual: false, kind: 'instant' })).toBe('manual');
    expect(resolveCastStyle({ castMode: 'release', control: 'classic', touch: false, manual: false, kind: 'direction' })).toBe('release');
    expect(queuesOnPress('manual')).toBe(false);
    expect(queuesOnRelease('manual')).toBe(false);
    expect(queuesOnPress('instant')).toBe(true);
    expect(queuesOnRelease('release')).toBe(true);
    expect(queuesOnPress('release')).toBe(false);
  });
});
