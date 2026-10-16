import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { CATALOG, STUDIO, kitOf, ultRole } from '../src/game/elements';
import { COMBO_WINDOW, RUPTURE_TIME } from '../src/game/combos';
import { cinematicFinisher, finisherStyle } from '../src/game/finisher';
import { acceptedLoadout, newProfile, normalizeProfile, owns } from '../src/game/economy';
import { listSynergies } from '../src/game/combos';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function duel(char: string, secondary: string) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: true,
    mode: 'duelo',
    roundSec: 30,
    suddenSec: 8,
    roster: [
      { id: 'a', char, isBot: false, loadout: { secondary } },
      { id: 'b', char: 'luna', isBot: false },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.drainEvents();
  return g;
}

function press(g: Game, who: 'a' | 'b', extra: Partial<Input>, frames = 1) {
  const bag = { a: idle, b: idle, [who]: { ...idle, ...extra } };
  for (let i = 0; i < frames; i++) g.step(STEP, bag as unknown as Input);
}

describe('catálogo de combate', () => {
  it('as 15 habilidades entram na biblioteca e no Z', () => {
    expect(CATALOG).toHaveLength(15);
    const names = new Set(CATALOG.map((s) => s.name));
    expect(names.size).toBe(15);
    for (const s of CATALOG) {
      expect(STUDIO.some((row) => row.id === s.id)).toBe(true);
      expect(s.trick).toBeTruthy();
      expect(s.unlockMatches).toBe(0);
    }
    const fresh = newProfile();
    normalizeProfile(fresh);
    for (const s of CATALOG) {
      expect(owns(fresh, 'power:' + s.id)).toBe(true);
      expect(acceptedLoadout(fresh, { secondary: s.id }).secondary).toBe(s.id);
    }
    const rows = listSynergies('kai', 'marca-ruptura');
    expect(rows.some((row) => row.name === 'Ruptura Marcada' || row.name === 'Colapso Elemental' || row.need.includes('Marca'))).toBe(true);
    expect(listSynergies('kai', 'colapso-elemental').some((row) => row.name === 'Colapso Elemental')).toBe(true);
  });

  it('a lança para na parede e um erro não abre combo', () => {
    const g = duel('kai', 'lanca-solar');
    const [a, b] = g.players;
    a.x = 80;
    a.y = 360;
    b.x = 420;
    b.y = 360;
    const hp = b.hp;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
    expect(b.comboT).toBe(0);
    expect(b.ruptureT).toBe(0);
    expect(g.combatLog.some((n) => n.kind === 'hit')).toBe(false);
  });

  it('a lança queima quando acerta', () => {
    const g = duel('kai', 'lanca-solar');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 460;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.burnT).toBeGreaterThan(0);
    expect(b.comboT).toBeGreaterThan(0);
    expect(b.comboT).toBeLessThanOrEqual(COMBO_WINDOW);
  });

  it('a ruptura vulcânica só fere onde o pulso cai, e dá tempo de sair', () => {
    const g = duel('maya', 'ruptura-vulcanica');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 430;
    b.y = 220;
    const hp = b.hp;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 12; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
    b.y = 80;
    for (let i = 0; i < 90; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);

    const stay = duel('maya', 'ruptura-vulcanica');
    const [c, d] = stay.players;
    c.x = 300;
    c.y = 220;
    d.x = 430;
    d.y = 220;
    press(stay, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 90; i++) stay.step(STEP, { a: idle, b: idle });
    expect(d.hp).toBeLessThan(d.maxHp);
  });

  it('a marca só fecha com um acerto seguinte e expira', () => {
    const g = duel('kai', 'marca-ruptura');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 460;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.ruptureT).toBeGreaterThan(0);
    expect(b.ruptureT).toBeLessThanOrEqual(RUPTURE_TIME);
    expect(b.stunT).toBe(0);
    const before = b.hp;
    a.energy = 100;
    a.powerCd = [0, 0, 0, 0];
    press(g, 'a', { ability: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    const got = g.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Ruptura Marcada');
    expect(got.length).toBe(1);
    expect(before - b.hp).toBeGreaterThan(6);
    expect(b.ruptureT).toBe(0);
    a.energy = 100;
    a.plasmaCd = 0;
    a.powerCd = [0, 0, 0, 0];
    const mid = b.hp;
    press(g, 'a', { ability: true, aim: 0, ca: 0 });
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: idle });
    expect(g.combatLog.filter((n) => n.combo === 'Ruptura Marcada').length).toBe(1);
    expect(b.hp).toBeLessThan(mid);

    const late = duel('kai', 'marca-ruptura');
    const [c, d] = late.players;
    c.x = 300;
    c.y = 220;
    d.x = 460;
    d.y = 220;
    press(late, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) late.step(STEP, { a: idle, b: idle });
    const wait = Math.ceil((d.ruptureT + 0.2) / STEP);
    for (let i = 0; i < wait; i++) late.step(STEP, { a: idle, b: idle });
    expect(d.ruptureT).toBe(0);
    c.energy = 100;
    c.powerCd = [0, 0, 0, 0];
    press(late, 'a', { ability: true, aim: 0, ca: 0 });
    for (let i = 0; i < 25; i++) late.step(STEP, { a: idle, b: idle });
    expect(late.drainEvents().some((e) => e.type === 'combo' && e.name === 'Ruptura Marcada')).toBe(false);
  });

  it('o passo fantasma anda e não ganha invulnerabilidade', () => {
    const g = duel('kael', 'passo-fantasma');
    const [a] = g.players;
    a.x = 300;
    a.y = 220;
    const x = a.x;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle, b: idle });
    expect(a.x).toBeGreaterThan(x + 40);
    expect(a.invulnT).toBe(0);
    expect(a.dodgeT).toBe(0);
  });

  it('o espelho segura o tiro e a corrente cai no salto', () => {
    const g = duel('kael', 'espelho-gelo');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 520;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    expect(g.iceWalls.some((w) => w.crack && (w.hp ?? 0) > 0)).toBe(true);
    const hp = a.hp;
    b.energy = 100;
    b.powerCd = [0, 0, 0, 0];
    press(g, 'b', { ability: true, aim: Math.PI, ca: Math.PI });
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(a.hp).toBe(hp);

    const chain = duel('zed', 'corrente-tempestuosa');
    const [c, d] = chain.players;
    c.x = 200;
    c.y = 220;
    d.x = 360;
    d.y = 220;
    chain.players.push({ ...d, id: 'c', x: 470, y: 240, isBot: false, name: 'C' });
    const far = chain.players[2];
    const nearHp = d.hp;
    const farHp = far.hp;
    press(chain, 'a', { plasma: true, aim: 0, ca: 0 });
    expect(nearHp - d.hp).toBeGreaterThan(farHp - far.hp);
    expect(farHp - far.hp).toBeGreaterThan(0);
  });

  it('o colapso só explode com dois elementos equipados na janela', () => {
    const g = duel('kai', 'colapso-elemental');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 380;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    expect(g.drainEvents().some((e) => e.type === 'combo' && e.name === 'Colapso Elemental')).toBe(false);
    g.combatLog.push(
      { at: g.worldT, kind: 'hit', owner: 'a', target: 'b', element: 'ice', ability: 'q', dmg: 8, x: b.x, y: b.y, combo: '' },
      { at: g.worldT, kind: 'hit', owner: 'a', target: 'b', element: 'lightning', ability: 'e', dmg: 8, x: b.x, y: b.y, combo: '' },
    );
    a.energy = 100;
    a.plasmaCd = 0;
    const hp = b.hp;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    expect(g.drainEvents().some((e) => e.type === 'combo' && e.name === 'Colapso Elemental')).toBe(true);
    expect(b.hp).toBeLessThan(hp);
  });

  it('o final só sai no kill de combo e não aplica dano de novo', () => {
    expect(cinematicFinisher({ comboKill: false, repeat: false, competitive: false }).play).toBe(false);
    expect(cinematicFinisher({ comboKill: true, repeat: true, competitive: false }).play).toBe(false);
    expect(finisherStyle('ice', 'lightning').id).toBe('water-bolt');
    const g = duel('kai', 'plasma');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 380;
    b.y = 220;
    b.hp = 40;
    press(g, 'a', { ability: true, aim: 0, ca: 0 });
    for (let i = 0; i < 25; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.alive).toBe(true);
    expect(g.drainEvents().some((e) => e.type === 'finisher')).toBe(false);
    a.energy = 100;
    a.powerCd = [0, 0, 0, 0];
    b.hp = 20;
    press(g, 'a', { skill: true, aim: 0, ca: 0 });
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    const fins = g.drainEvents().filter((e) => e.type === 'finisher');
    expect(fins).toHaveLength(1);
    const hp = b.hp;
    for (let i = 0; i < 10; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
    expect(a.kills).toBe(1);
  });

  it('as supremas ficam com papéis diferentes', () => {
    expect(ultRole('maya', 'ice')).toBe('tide');
    expect(ultRole('bruno', 'ice')).toBe('winter');
    expect(ultRole('iris', 'lightning')).toBe('avatar');
    expect(ultRole('vexa', 'shadow')).toBe('rift');
    expect(ultRole('zed', 'lightning')).toBe('eclipse');
    expect(kitOf('maya').powers[2].element).toBe('ice');
    const sea = duel('maya', 'fermata');
    const [a, b] = sea.players;
    a.x = 300;
    a.y = 360;
    b.x = 400;
    b.y = 360;
    (sea as unknown as { ultLand: (...args: unknown[]) => void }).ultLand(a, 360, 360, 'ice');
    for (let i = 0; i < 10; i++) sea.step(STEP, { a: idle, b: idle });
    expect(b.x).toBeGreaterThan(400);

    const ice = duel('bruno', 'fermata');
    const [c, d] = ice.players;
    c.x = 300;
    c.y = 360;
    d.x = 400;
    d.y = 360;
    (ice as unknown as { ultLand: (...args: unknown[]) => void }).ultLand(c, 360, 360, 'ice');
    expect(d.rootT).toBeGreaterThan(0);

    const bolt = duel('zed', 'fermata');
    const [e, f] = bolt.players;
    e.x = 300;
    e.y = 360;
    f.x = 380;
    f.y = 360;
    (bolt as unknown as { ultLand: (...args: unknown[]) => void }).ultLand(e, 360, 360, 'lightning');
    expect(f.stunT).toBe(0);
    for (let i = 0; i < 40; i++) bolt.step(STEP, { a: idle, b: idle });
    expect(f.stunT).toBeGreaterThan(0);
  });
});
