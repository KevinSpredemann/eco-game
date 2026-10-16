import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { ENERGY_MAX, kitOf, resolvedDamage } from '../src/game/elements';
import { FIELD_BONUS, MARK_WINDOW, ROOT_FIRM_BONUS, ROOT_FIRM_TIME, ULT_CONTROL_BONUS, officialSlot } from '../src/game/combos';
import { DEFAULT_LOADOUT, stageSecondary } from '../src/game/balance';
import { encodeSnapshot } from '../src/net/protocol';
import { ClientGame } from '../src/net/clientGame';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(a = 'nara', b = 'luna', bot = false) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: a,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: [
      { id: 'a', char: a, isBot: false },
      { id: 'b', char: b, isBot: bot },
    ],
    roundSec: 40,
    suddenSec: 8,
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

function place(g: Game, dx = 80) {
  const [a, b] = g.players;
  a.x = 400;
  a.y = 250;
  b.x = 400 + dx;
  b.y = 250;
  return [a, b] as const;
}

describe('sinergias oficiais', () => {
  it('marca e raiz somam uma vez, e sem marca a raiz só faz o efeito dela', () => {
    const g = fight();
    const [a, b] = place(g);
    const q = resolvedDamage(kitOf('nara').powers[0], 0);
    const e = resolvedDamage(kitOf('nara').powers[1], 1);
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.markedT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.rootT).toBe(0);
    expect(b.markedT).toBeGreaterThan(0);
    expect(before - b.hp).toBe(q);
    expect(a.powerCd[0]).toBeGreaterThan(0);
    const mid = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    const ev = g.drainEvents().filter((x) => x.type === 'combo' && x.name === 'Raiz firme');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ bonus: ROOT_FIRM_BONUS });
    expect(mid - b.hp).toBe(e + ROOT_FIRM_BONUS);
    expect(b.markedT).toBe(0);
    expect(b.rootT).toBeCloseTo(ROOT_FIRM_TIME - STEP, 5);
    a.powerCd[1] = 0;
    a.energy = 100;
    const again = b.hp;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(again - b.hp).toBe(e);
    expect(g.drainEvents().some((x) => x.type === 'combo')).toBe(false);

    const plain = fight();
    const [s, t] = place(plain);
    const hp = t.hp;
    plain.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(hp - t.hp).toBe(e);
    expect(t.rootT).toBeGreaterThan(0);
    expect(plain.drainEvents().some((x) => x.type === 'combo')).toBe(false);
    expect(s.powerCd[1]).toBeGreaterThan(0);
  });

  it('campo e projétil compatível estouram uma vez; elemento estranho ou campo vencido não', () => {
    const g = fight();
    const [a, b] = place(g, 70);
    const e = resolvedDamage(kitOf('nara').powers[1], 1);
    const q = resolvedDamage(kitOf('nara').powers[0], 0);
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle });
    expect(b.fieldEl).toBe('nature');
    expect(b.fieldT).toBeCloseTo(MARK_WINDOW - STEP, 5);
    expect(b.hp).toBe(b.maxHp - e);
    a.powerCd[0] = 0;
    a.energy = 100;
    const mid = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === mid; i++) g.step(STEP, { a: idle, b: idle });
    const hit = g.drainEvents().filter((x) => x.type === 'combo' && x.name === 'Descarga');
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ bonus: FIELD_BONUS });
    expect(mid - b.hp).toBe(q + FIELD_BONUS);
    expect(b.fieldT).toBe(0);
    a.powerCd[0] = 0;
    a.energy = 100;
    const again = b.hp;
    g.drainEvents();
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.hp === again; i++) g.step(STEP, { a: idle, b: idle });
    expect(again - b.hp).toBe(q);
    expect(g.drainEvents().some((x) => x.type === 'combo' && x.name === 'Descarga')).toBe(false);

    const odd = fight();
    const [p, t] = place(odd);
    t.fieldT = 2;
    t.fieldEl = 'ice';
    const hp = t.hp;
    odd.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && t.hp === hp; i++) odd.step(STEP, { a: idle, b: idle });
    expect(hp - t.hp).toBe(q);
    expect(odd.drainEvents().some((x) => x.type === 'combo' && x.name === 'Descarga')).toBe(false);
    expect(t.fieldT).toBeGreaterThan(0);

    const old = fight();
    const [u, v] = place(old);
    v.fieldT = 0.05;
    v.fieldEl = 'nature';
    for (let i = 0; i < 8; i++) old.step(STEP, { a: idle, b: idle });
    expect(v.fieldT).toBe(0);
    expect(v.fieldEl).toBe('');
    const left = v.hp;
    old.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && v.hp === left; i++) old.step(STEP, { a: idle, b: idle });
    expect(left - v.hp).toBe(q);
    expect(old.drainEvents().some((x) => x.type === 'combo')).toBe(false);
  });

  it('suprema em alvo preso reage uma vez e, sem controle, só dá o dano da suprema', () => {
    const rooted = fight();
    const [a, b] = place(rooted, 60);
    const base = resolvedDamage(kitOf('nara').powers[2], 2);
    b.rootT = 1.2;
    a.ultCharge = 100;
    const before = b.hp;
    rooted.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    for (let k = 0; k < 30; k++) rooted.step(STEP, { a: idle, b: idle });
    const ev = rooted.drainEvents().filter((x) => x.type === 'combo');
    expect(ev.map((x) => (x.type === 'combo' ? x.name : ''))).toEqual(['Suprema no controle']);
    expect(ev[0]).toMatchObject({ bonus: ULT_CONTROL_BONUS, vfx: 'ult' });
    expect(before - b.hp).toBe(base + ULT_CONTROL_BONUS);
    expect(a.ultCharge).toBeLessThan(5);
    expect(a.powerCd[2]).toBeGreaterThan(0);

    const open = fight();
    const [s, t] = place(open, 60);
    s.ultCharge = 100;
    const hp = t.hp;
    open.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    for (let k = 0; k < 30; k++) open.step(STEP, { a: idle, b: idle });
    expect(hp - t.hp).toBe(base);
    expect(open.drainEvents().some((x) => x.type === 'combo')).toBe(false);
    expect(s.ultCharge).toBeLessThan(5);

    const early = fight();
    const [p, q] = place(early, 60);
    p.ultCharge = 40;
    early.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 60 }, b: idle });
    expect(q.hp).toBe(q.maxHp);
    expect(p.powerCd[2]).toBe(0);
    expect(p.ultCharge).toBeGreaterThan(40);
    expect(p.ultCharge).toBeLessThan(41);
    expect(early.drainEvents().some((x) => x.type === 'deny' && x.msg === 'Ultimate em carga')).toBe(true);
  });

  it('condição faltando não trava nem gasta, e a marca que acaba não comboa', () => {
    const g = fight();
    const [a, b] = place(g, 400);
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(a.powerCd[1]).toBe(0);
    expect(a.energy).toBe(ENERGY_MAX);
    expect(g.drainEvents().some((x) => x.type === 'deny' && x.msg === 'Nenhum alvo válido')).toBe(true);

    const late = fight();
    const [s, t] = place(late);
    t.markedT = 0.05;
    for (let i = 0; i < 8; i++) late.step(STEP, { a: idle, b: idle });
    expect(t.markedT).toBe(0);
    const e = resolvedDamage(kitOf('nara').powers[1], 1);
    const hp = t.hp;
    late.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
    expect(hp - t.hp).toBe(e);
    expect(late.drainEvents().some((x) => x.type === 'combo')).toBe(false);
    expect(t.rootT).toBeGreaterThan(0);
  });

  it('Inferno Espiral consome a queimadura e o segundo vento não repete', () => {
    const g = fight('maya', 'luna');
    const [a, b] = place(g, 90);
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.burnT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.burnT).toBeGreaterThan(0);
    g.drainEvents();
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 90 }, b: idle });
    const ev = g.drainEvents().filter((x) => x.type === 'combo' && x.name === 'Inferno Espiral');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ bonus: 10 });
    expect(b.burnT).toBe(0);
    a.powerCd[1] = 0;
    a.energy = 100;
    g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 90 }, b: idle });
    expect(g.drainEvents().some((x) => x.type === 'combo' && x.name === 'Inferno Espiral')).toBe(false);
  });

  it('morte limpa marca, campo e queimadura, no jogador e no bot', () => {
    const human = damageOf(false);
    const bot = damageOf(true);
    expect(bot).toBe(human);
    const g = fight();
    const [a, b] = place(g);
    b.hp = 1;
    b.markedT = 2;
    b.fieldT = 2;
    b.fieldEl = 'nature';
    b.burnT = 2;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 40 && b.alive; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.alive).toBe(false);
    expect(b.markedT).toBe(0);
    expect(b.fieldT).toBe(0);
    expect(b.fieldEl).toBe('');
    expect(b.burnT).toBe(0);
  });

  it('o bot escolhe a raiz quando a marca já está no alvo', () => {
    const foe = { burn: 0, frozen: 0, gust: 0, shock: 0, marked: 2, field: 0, fieldEl: '' as const, root: 0, stun: 0 };
    expect(officialSlot('nara', kitOf('nara'), [0, 0, 0, 0], foe, 80)).toBe(1);
    expect(officialSlot('nara', kitOf('nara'), [0, 0, 0, 0], { ...foe, marked: 0, field: 2, fieldEl: 'nature' }, 80)).toBe(0);
  });
});

function damageOf(bot: boolean) {
  const g = fight('nara', 'luna', bot);
  const [, b] = place(g);
  b.markedT = MARK_WINDOW;
  const before = b.hp;
  g.step(STEP, { a: { ...idle, skill: true, aim: 0, ca: 0, cr: 80 }, b: idle });
  return before - b.hp;
}

describe('equipamento do Z', () => {
  it('poder bloqueado não apaga o extra que já estava, e cancelar é não gravar', () => {
    const saved = { ...DEFAULT_LOADOUT, secondary: 'arpejo' };
    const blocked = stageSecondary(saved.secondary, 'prisma', () => false);
    expect(blocked.secondary).toBe('arpejo');
    expect(blocked.reason).toMatch(/4 partidas/);
    const missing = stageSecondary(saved.secondary, 'nao-existe', () => true);
    expect(missing.secondary).toBe('arpejo');
    expect(missing.reason).toBeTruthy();
    const preview = stageSecondary(saved.secondary, 'fermata', () => true);
    expect(preview).toEqual({ secondary: 'fermata', reason: null });
    const cancel = saved;
    expect(cancel.secondary).toBe('arpejo');
    const cleared = stageSecondary('fermata', null, () => true);
    expect(cleared.secondary).toBeNull();
  });

  it('a marca vai no retrato online e o cliente lê de volta', () => {
    const g = fight();
    const [, b] = g.players;
    b.markedT = 2.4;
    b.fieldT = 1.1;
    b.fieldEl = 'nature';
    const row = encodeSnapshot(g, false).P[1];
    expect(row.at(-13)).toBe(2.4);
    expect(row.at(-12)).toBe(1.1);
    expect(row.at(-11)).toBe('nature');
    const cg = new ClientGame({
      you: 'a',
      mode: 'duelo',
      arena: 'lab',
      roster: [
        { id: 'a', char: 'nara', skin: 'padrao', trail: 'nenhum', name: 'A', isBot: false },
        { id: 'b', char: 'luna', skin: 'padrao', trail: 'nenhum', name: 'B', isBot: true },
      ],
    });
    cg.applySnapshot(encodeSnapshot(g, false), [{ type: 'combo', x: 1, y: 2, name: 'Raiz firme', bonus: ROOT_FIRM_BONUS, pid: 'a', vfx: 'root' }]);
    const foe = cg.players.find((p) => p.id === 'b')!;
    expect(foe.markedT).toBe(2.4);
    expect(foe.fieldT).toBe(1.1);
    expect(foe.fieldEl).toBe('nature');
    expect(cg.drainEvents().some((e) => e.type === 'combo' && e.name === 'Raiz firme')).toBe(true);
  });
});
