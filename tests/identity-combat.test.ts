import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { BASIC, kitOf } from '../src/game/elements';
import { acceptedLoadout, newProfile, owns } from '../src/game/economy';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(roster: { id: string; char: string; isBot?: boolean }[]) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: roster[0].char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: roster.map((r) => ({ id: r.id, char: r.char, isBot: !!r.isBot })),
    roundSec: 30,
    suddenSec: 8,
  });
  const pad = Object.fromEntries(roster.map((r) => [r.id, idle]));
  while (g.phase !== 'play') g.step(STEP, pad);
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

function wall(x: number, y: number, w: number, h: number) {
  return { id: 9, owner: 'x', kind: 'gelo' as const, x, y, w, h, t: 8 };
}

describe('natureza, sombra, plasma e o ataque básico', () => {
  it('o Q do Vortex é projétil e a recarga impede o segundo', () => {
    const g = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 560;
    b.y = 250;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(g.bullets.some((n) => n.el === 'plasma' && n.owner === a.id)).toBe(true);
    expect(a.powerCd[0]).toBeCloseTo(kitOf('vortex').powers[0].cd, 1);
    const left = a.powerCd[0];
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(a.powerCd[0]).toBeLessThan(left);
    expect(g.bullets.filter((n) => n.el === 'plasma' && n.owner === a.id)).toHaveLength(1);
  });

  it('o disparo de plasma acerta o valor e a parede protege quem está atrás', () => {
    const open = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = open.players;
    a.x = 400;
    a.y = 250;
    b.x = 560;
    b.y = 250;
    const before = b.hp;
    open.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === before; i++) open.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(kitOf('vortex').powers[0].dmg);

    const blocked = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [s, t] = blocked.players;
    s.x = 400;
    s.y = 250;
    t.x = 640;
    t.y = 250;
    blocked.iceWalls.push(wall(500, 180, 8, 140));
    blocked.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40; i++) blocked.step(STEP, { a: idle, b: idle });
    expect(t.hp).toBe(t.maxHp);
    expect(blocked.bullets.filter((n) => n.owner === s.id).every((n) => n.x < 510)).toBe(true);
  });

  it('a onda acerta todo mundo no raio e não acerta atrás da parede', () => {
    const g = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
      { id: 'c', char: 'luna' },
    ]);
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 470;
    b.y = 250;
    c.x = 620;
    c.y = 250;
    g.iceWalls.push(wall(540, 180, 12, 140));
    const hb = b.hp;
    const hc = c.hp;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle, c: idle });
    expect(hb - b.hp).toBe(kitOf('vortex').powers[1].dmg);
    expect(c.hp).toBe(hc);
  });

  it('o impulso e o piscar param na parede', () => {
    const dash = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const a = dash.players[0];
    a.x = 520;
    a.y = 250;
    dash.iceWalls.push(wall(600, 180, 8, 140));
    dash.step(0.12, { a: { ...idle, bonus: true, aim: 0, ca: 0 }, b: idle });
    expect(a.x).toBeLessThan(600);
    expect(a.x).toBeGreaterThan(500);
    expect(a.powerCd[3]).toBeGreaterThan(0);

    const blink = fight([
      { id: 'a', char: 'vexa' },
      { id: 'b', char: 'kael' },
    ]);
    const v = blink.players[0];
    v.x = 520;
    v.y = 250;
    blink.iceWalls.push(wall(600, 180, 8, 140));
    blink.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0 }, b: idle });
    expect(v.x).toBeLessThan(600);
    expect(v.powerCd[1]).toBeGreaterThan(0);
  });

  it('gelo mais plasma soma o combo, e sem gelo o dano é só o do disparo', () => {
    const cold = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = cold.players;
    a.x = 400;
    a.y = 250;
    b.x = 560;
    b.y = 250;
    b.frozenT = 2;
    const before = b.hp;
    cold.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === before; i++) cold.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(11 + 8);
    expect(cold.drainEvents().some((e) => e.type === 'combo' && e.name === 'Plasma lento' && e.bonus === 8)).toBe(true);

    const plain = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [s, t] = plain.players;
    s.x = 400;
    s.y = 250;
    t.x = 560;
    t.y = 250;
    const hp = t.hp;
    plain.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && t.hp === hp; i++) plain.step(STEP, { a: idle, b: idle });
    expect(hp - t.hp).toBe(11);
    expect(plain.drainEvents().some((e) => e.type === 'combo' && e.name === 'Plasma lento')).toBe(false);
  });

  it('raiz e área somam, e sem raiz a área fica no dano base', () => {
    const rooted = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = rooted.players;
    a.x = 400;
    a.y = 250;
    b.x = 470;
    b.y = 250;
    b.rootT = 1.2;
    const before = b.hp;
    rooted.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(before - b.hp).toBe(6 + 6);
    expect(rooted.drainEvents().some((e) => e.type === 'combo' && e.name === 'Raiz e impacto')).toBe(true);

    const open = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [s, t] = open.players;
    s.x = 400;
    s.y = 250;
    t.x = 470;
    t.y = 250;
    const hp = t.hp;
    open.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(hp - t.hp).toBe(6);
    expect(t.rootT).toBeGreaterThan(0);
  });

  it('a raiz não atravessa a parede e a segunda raiz espera a resistência', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 620;
    b.y = 250;
    g.iceWalls.push(wall(500, 180, 16, 140));
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(b.rootT).toBe(0);
    expect(a.powerCd[1]).toBe(0);

    const hit = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [s, t] = hit.players;
    s.x = 400;
    s.y = 250;
    t.x = 470;
    t.y = 250;
    hit.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(t.rootT).toBeGreaterThan(0);
    expect(t.rootResistT).toBeGreaterThan(t.rootT);
    t.rootT = 0.05;
    for (let i = 0; i < 20; i++) hit.step(STEP, { a: idle, b: idle });
    s.powerCd[1] = 0;
    s.energy = 100;
    const resist = t.rootResistT;
    hit.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(t.rootT).toBeLessThan(0.2);
    expect(t.rootResistT).toBeGreaterThan(0);
    expect(resist).toBeGreaterThan(0);
  });

  it('a arrancada deixa o próximo básico mais forte, e sem ela o básico é 6', () => {
    const boosted = fight([
      { id: 'a', char: 'kael' },
      { id: 'b', char: 'luna' },
    ]);
    const [a, b] = boosted.players;
    a.x = 400;
    a.y = 250;
    b.x = 520;
    b.y = 250;
    boosted.step(STEP, { a: { ...idle, dash: true, mx: 0 }, b: idle });
    expect(a.flowT).toBeGreaterThan(0);
    a.x = 400;
    a.y = 250;
    b.x = 520;
    b.y = 250;
    const before = b.hp;
    boosted.step(STEP, { a: { ...idle, fire: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 30 && b.hp === before; i++) boosted.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(BASIC.dmg + 4);
    expect(a.flowT).toBe(0);

    const plain = fight([
      { id: 'a', char: 'kael' },
      { id: 'b', char: 'luna' },
    ]);
    const [s, t] = plain.players;
    s.x = 400;
    s.y = 250;
    t.x = 520;
    t.y = 250;
    const hp = t.hp;
    plain.step(STEP, { a: { ...idle, fire: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 30 && t.hp === hp; i++) plain.step(STEP, { a: idle, b: idle });
    expect(hp - t.hp).toBe(BASIC.dmg);
    expect(t.plasmaT).toBe(0);
  });

  it('a marca de plasma soma uma vez e o básico não gasta a marca', () => {
    const g = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 520;
    b.y = 250;
    b.plasmaT = 3;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, fire: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(BASIC.dmg);
    expect(b.plasmaT).toBeGreaterThan(2);

    a.x = 400;
    b.x = 560;
    a.powerCd[0] = 0;
    a.energy = 100;
    const marked = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === marked; i++) g.step(STEP, { a: idle, b: idle });
    expect(marked - b.hp).toBe(11 + 10);
    expect(b.plasmaT).toBe(0);
    expect(marked - b.hp).toBeLessThanOrEqual(11 + 14);
  });

  it('o colapso só gasta quando o preparo acaba, e o atordoamento cancela', () => {
    const g = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 470;
    b.y = 250;
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(a.pendingCast).not.toBeNull();
    expect(a.energy).toBe(100);
    expect(a.powerCd[2]).toBe(0);
    a.stunT = 0.4;
    g.step(STEP, { a: idle, b: idle });
    expect(a.pendingCast).toBeNull();
    expect(a.energy).toBe(100);
    expect(a.powerCd[2]).toBe(0);

    const go = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'kael' },
    ]);
    const [s, t] = go.players;
    s.x = 400;
    s.y = 250;
    t.x = 470;
    t.y = 250;
    const hp = t.hp;
    go.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(s.energy).toBe(100);
    for (let i = 0; i < 50; i++) go.step(STEP, { a: idle, b: idle });
    expect(s.powerCd[2]).toBeGreaterThan(0);
    expect(s.energy).toBeLessThan(100);
    expect(hp - t.hp).toBe(16);
  });

  it('a semente persegue e a ilusão segura um tiro', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 250;
    b.x = 560;
    b.y = 330;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    const shot = g.bullets.find((n) => n.owner === a.id);
    expect(shot?.homeId).toBe(b.id);
    expect(shot?.el).toBe('nature');
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle, b: idle });
    const still = g.bullets.find((n) => n.owner === a.id);
    if (still) expect(Math.abs(still.vy)).toBeGreaterThan(1);

    const trap = fight([
      { id: 'a', char: 'vexa' },
      { id: 'b', char: 'kael' },
    ]);
    const [v, k] = trap.players;
    v.x = 400;
    v.y = 250;
    k.x = 700;
    k.y = 250;
    trap.step(STEP, { a: { ...idle, bonus: true, aim: 0, ca: 0 }, b: idle });
    const decoy = trap.clones.find((c) => c.decoy);
    expect(decoy).toBeTruthy();
    const hp = v.hp;
    k.x = 620;
    k.y = 250;
    k.energy = 100;
    k.basicCd = 0;
    trap.step(STEP, { a: idle, b: { ...idle, fire: true, aim: Math.PI, ca: Math.PI } });
    for (let i = 0; i < 30; i++) trap.step(STEP, { a: idle, b: idle });
    expect(v.hp).toBe(hp);
    expect(trap.clones.some((c) => c.decoy && c.t > 0)).toBe(false);
  });

  it('o bosque cura o aliado e o bot usa o básico quando os poderes estão em recarga', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'kael' },
    ]);
    const [a, b] = g.players;
    a.team = 0;
    b.team = 0;
    a.x = 400;
    a.y = 250;
    b.x = 450;
    b.y = 250;
    b.hp = b.maxHp - 30;
    const hp = b.hp;
    g.step(STEP, { a: { ...idle, bonus: true, aim: 0, ca: 0, cr: 40 }, b: idle });
    expect(b.hp).toBeGreaterThan(hp);
    expect(g.groves.length).toBe(1);

    const bot = fight([
      { id: 'a', char: 'luna' },
      { id: 'b', char: 'kael', isBot: true },
    ]);
    const [foe, p] = bot.players;
    foe.x = 640;
    foe.y = 360;
    p.x = 760;
    p.y = 360;
    p.brain!.targetId = foe.id;
    p.brain!.seenT = 5;
    p.brain!.restT = 0;
    p.powerCd = [8, 8, 8, 8];
    p.energy = 100;
    p.basicCd = 0;
    const before = foe.hp;
    for (let i = 0; i < 40 && foe.hp === before && p.basicCd <= 0; i++) bot.step(STEP, { a: idle });
    expect(foe.hp < before || p.basicCd > 0).toBe(true);
  });

  it('o convidado entra com o kit e sem a Rajada de Plasma', () => {
    const guest = newProfile();
    const loadout = acceptedLoadout(guest, { secondary: 'plasma', primary: 'assinatura' });
    expect(loadout.secondary).toBeNull();
    expect(owns(guest, 'char:vortex')).toBe(true);
    expect(owns(guest, 'char:nara')).toBe(true);
    expect(owns(guest, 'char:vexa')).toBe(true);
    expect(owns(guest, 'power:plasma')).toBe(false);
    expect(kitOf('vortex').powers).toHaveLength(4);
    expect(kitOf('vortex').powers[2].windup).toBeGreaterThan(0);
    expect(kitOf('vortex').powers[3].act).toBe('dash');
    expect(kitOf('nara').powers[0].home).toBe(true);
  });
});
