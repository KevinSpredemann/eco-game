// Quatro elementos (Fogo, Água, Terra, Ar), os combos novos e as supremas.
// Tudo no combate real: o efeito existe na simulação, não só no desenho.
import { describe, expect, it } from 'vitest';
import { Game, Input, ULT_WINDUP } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { ELEMENT_NAME, FREEZE_HOLD, MAIN_ELEMENTS, ULT_LAND, kitOf } from '../src/game/elements';
import { listSynergies } from '../src/game/combos';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function arena3(a = 'kai', foes = ['kael', 'kael']) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: a,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'dupla',
    roster: [
      { id: 'a', char: a, isBot: false },
      { id: 'b', char: foes[0], isBot: false },
      { id: 'c', char: foes[1], isBot: false },
      { id: 'd', char: 'kael', isBot: false },
    ],
    roundSec: 60,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, {} as unknown as Input);
  for (const q of g.players) q.invulnT = 0;
  return g;
}

function duel(a = 'kai', b = 'kael') {
  const g = new Game({ arena: getArena('lab'), humanChar: a, bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'duelo', roster: [{ id: 'a', char: a, isBot: false }, { id: 'b', char: b, isBot: false }], roundSec: 60, suddenSec: 8 });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle } as unknown as Input);
  const [p, q] = g.players;
  p.x = 400;
  p.y = 360;
  q.x = 520;
  q.y = 360;
  p.invulnT = q.invulnT = 0;
  q.hp = q.maxHp = 999;
  return { g, p, q };
}

const deliver = (g: Game, src: unknown, dst: unknown, el: string, dmg = 8, slot = 0) =>
  (g as unknown as { deliverPower: (...a: unknown[]) => void }).deliverPower(src, dst, el, dmg, 0, false, { slot, projectile: true });
const combos = (g: Game) => g.drainEvents().filter((e) => e.type === 'combo').map((e) => (e as { name: string }).name);

describe('quatro elementos', () => {
  it('Fogo, Água, Terra e Ar são os principais e têm nome próprio', () => {
    expect(MAIN_ELEMENTS.map((e) => ELEMENT_NAME[e])).toEqual(['Fogo', 'Água', 'Terra', 'Ar']);
    expect(kitOf('kai').powers[0].name).toBe("Jato d'Água");
  });

  it('Água + Água: congela de verdade (parado e sem conjurar) e não encadeia', () => {
    const { g, p, q } = duel();
    deliver(g, p, q, 'ice');
    expect(q.frozenT).toBeGreaterThan(0);
    g.drainEvents();
    deliver(g, p, q, 'ice');
    expect(combos(g)).toEqual(['Congelamento']);
    expect(q.iceT).toBeCloseTo(FREEZE_HOLD);
    expect(q.stunT).toBeGreaterThan(0);
    expect(q.frozenT).toBe(0);
    // terceira água: não congela de novo (o gelo não encadeia)
    deliver(g, p, q, 'ice');
    expect(combos(g)).not.toContain('Congelamento');
    const x = q.x;
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: { ...idle, mx: 1 } } as unknown as Input);
    expect(Math.abs(q.x - x)).toBeLessThan(1);
  });

  it('Água + Ar: Vórtice puxa o outro inimigo para perto do alvo', () => {
    // dupla: a e o aliado contra c e d
    const g = arena3('kai');
    const [p, ally, b, c] = g.players;
    ally.x = 200;
    ally.y = 600;
    p.x = 300;
    p.y = 360;
    b.x = 520;
    b.y = 360;
    c.x = 600;
    c.y = 360;
    deliver(g, p, b, 'ice');
    g.drainEvents();
    deliver(g, p, b, 'wind');
    expect(combos(g)).toContain('Vórtice');
    const before = c.x - b.x;
    for (let i = 0; i < 25; i++) g.step(STEP, {} as unknown as Input);
    expect(c.x - b.x).toBeLessThan(before);
  });

  it('Fogo + Ar: Inferno Espiral espalha a queimadura para quem está perto', () => {
    const g = arena3('kai');
    const [p, d, b, c] = g.players;
    p.x = 300;
    p.y = 360;
    b.x = 520;
    b.y = 360;
    c.x = 570;
    c.y = 360;
    d.x = 200;
    d.y = 600;
    deliver(g, p, b, 'fire');
    g.drainEvents();
    expect(c.burnT).toBe(0);
    deliver(g, p, b, 'wind');
    expect(combos(g)).toContain('Inferno Espiral');
    expect(c.burnT).toBeGreaterThan(0);
  });

  it('Terra + Fogo e Terra + Ar: Fissura Magmática e Tempestade de Fragmentos', () => {
    const one = duel('nara');
    one.q.rootT = 1;
    deliver(one.g, one.p, one.q, 'fire', 8, 1);
    expect(combos(one.g)).toEqual(['Fissura Magmática']);
    const two = duel('nara');
    two.q.rootT = 1;
    deliver(two.g, two.p, two.q, 'wind', 8, 1);
    expect(combos(two.g)).toEqual(['Tempestade de Fragmentos']);
  });

  it('a tela de poderes lista os combos novos que o kit fecha', () => {
    const names = listSynergies('kai', null).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Congelamento', 'Vórtice', 'Descarga Condutora']));
  });
});

describe('supremas', () => {
  const ult = (g: Game, aim = 0, cr = 120) => g.step(STEP, { a: { ...idle, ult: true, aim, ca: aim, cr }, b: idle } as unknown as Input);

  it('avisa no chão antes de sair (preparo) e só depois gasta', () => {
    const { g, p } = duel('maya');
    p.ultCharge = 100;
    g.drainEvents();
    ult(g);
    const wind = g.drainEvents().find((e) => e.type === 'windup') as { ult?: boolean; tx?: number; r?: number; t: number } | undefined;
    expect(wind?.ult).toBe(true);
    expect(wind?.t).toBeGreaterThanOrEqual(ULT_WINDUP);
    expect(wind?.tx).toBeGreaterThan(p.x);
    expect(p.powerCd[2]).toBe(0);
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(p.powerCd[2]).toBeGreaterThan(0);
  });

  it('atordoar quem prepara cancela a suprema (contrajogo)', () => {
    const { g, p } = duel('maya');
    p.ultCharge = 100;
    ult(g);
    (g as unknown as { stun: (q: unknown, t: number) => void }).stun(p, 0.6);
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(p.powerCd[2]).toBe(0);
    expect(p.ultCharge).toBeGreaterThanOrEqual(100);
  });

  it('Colapso Solar: cai uma vez e deixa o chão queimando por alguns segundos', () => {
    // Maya: R é Jato d'Água; o Fogo de suprema vem de quem tem fogo no R (Luna: Labareda)
    const { g, p, q } = duel('luna');
    expect(kitOf('luna').powers[2].element).toBe('fire');
    p.ultCharge = 100;
    ult(g);
    let lands = 0;
    for (let i = 0; i < 60; i++) {
      g.step(STEP, { a: idle, b: idle } as unknown as Input);
      lands += g.drainEvents().filter((e) => e.type === 'ultland').length;
      q.x = 520;
      q.y = 360;
    }
    expect(lands).toBe(1);
    expect(g.ultZones.some((z) => z.el === 'fire')).toBe(true);
    const hp = q.hp;
    for (let i = 0; i < 60; i++) {
      g.step(STEP, { a: idle, b: idle } as unknown as Input);
      q.x = 520;
      q.y = 360;
    }
    expect(q.hp).toBeLessThan(hp);
    expect(q.burnT).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 3; i++) g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(g.ultZones).toHaveLength(0);
  });

  it('Maré Abissal empurra para fora e molha; Tempestade do Vazio puxa e depois arremessa', () => {
    const sea = duel('maya');
    expect(kitOf('maya').powers[2].element).toBe('ice');
    (sea.g as unknown as { ultLand: (...a: unknown[]) => void }).ultLand(sea.p, 480, 360, 'ice');
    expect(sea.q.frozenT).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) sea.g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(sea.q.x).toBeGreaterThan(530);
    expect(ULT_LAND.ice.name).toBe('Maré Abissal');

    const air = duel('maya');
    air.q.x = 600;
    (air.g as unknown as { ultLand: (...a: unknown[]) => void }).ultLand(air.p, 500, 360, 'wind');
    for (let i = 0; i < 30; i++) air.g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(air.q.x).toBeLessThan(600);
    const pulled = air.q.x;
    let max = 0;
    for (let i = 0; i < 90; i++) {
      air.g.step(STEP, { a: idle, b: idle } as unknown as Input);
      max = Math.max(max, air.q.x);
    }
    expect(max).toBeGreaterThan(pulled + 15);
    expect(air.g.ultZones).toHaveLength(0);
  });

  it('a rodada nova limpa os rastros da suprema', () => {
    const { g, p, q } = duel('luna');
    (g as unknown as { ultLand: (...a: unknown[]) => void }).ultLand(p, 520, 360, 'fire');
    expect(g.ultZones).toHaveLength(1);
    q.hp = 1;
    g.hurt(q, 50, 'a', 'pulse');
    for (let i = 0; i < 60 * 10 && g.phase === 'play'; i++) g.step(STEP, { a: idle, b: idle } as unknown as Input);
    // a zona de fogo dura 2,6 s; o fim da rodada chega antes e mesmo assim nada fica para a próxima
    (g as unknown as { ultLand: (...a: unknown[]) => void }).ultLand(p, 520, 360, 'fire');
    for (let i = 0; i < 60 * 40 && g.phase !== 'play'; i++) g.step(STEP, { a: idle, b: idle } as unknown as Input);
    expect(g.phase).toBe('play');
    expect(g.ultZones).toHaveLength(0);
  });
});
