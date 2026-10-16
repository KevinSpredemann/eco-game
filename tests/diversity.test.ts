import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { KITS, formOf, isPlainStreak, kitOf, resolvedDamage } from '../src/game/elements';
import { COMBO_WINDOW, listSynergies, pickComboRecipe } from '../src/game/combos';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function fight(chars: string[]) {
  const roster = chars.map((char, i) => ({ id: String.fromCharCode(97 + i), char, isBot: false }));
  const g = new Game({
    arena: getArena('lab'),
    humanChar: chars[0],
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster,
    roundSec: 40,
    suddenSec: 8,
  });
  const pad = Object.fromEntries(roster.map((r) => [r.id, idle]));
  while (g.phase !== 'play') g.step(STEP, pad);
  for (const p of g.players) {
    p.invulnT = 0;
    p.energy = 100;
    p.ultCharge = 100;
  }
  return g;
}

function press(slot: number, cr = 200): Input {
  const keys = ['ability', 'skill', 'ult', 'bonus'] as const;
  return { ...idle, aim: 0, ca: 0, cr, [keys[slot]]: true };
}

describe('formas de golpe', () => {
  it('nenhum poder do kit ainda é o mesmo risco recolorido', () => {
    const left: string[] = [];
    for (const id of Object.keys(KITS)) {
      kitOf(id).powers.forEach((pw, slot) => {
        if (isPlainStreak(pw, slot)) left.push(`${id} ${slot} ${pw.name}`);
      });
    }
    expect(left).toEqual([]);
  });

  it('Q, E, F e R do mesmo kit não repetem a forma', () => {
    const dup: string[] = [];
    for (const id of Object.keys(KITS)) {
      const seen = new Map<string, number>();
      kitOf(id).powers.forEach((pw, slot) => {
        const form = formOf(pw, slot);
        if (!form) return;
        const prev = seen.get(form);
        if (prev !== undefined) dup.push(`${id} ${form} nos espaços ${prev} e ${slot}`);
        seen.set(form, slot);
      });
    }
    expect(dup).toEqual([]);
  });

  it('explosão pega o vizinho uma vez; o raio preciso não', () => {
    const blast = fight(['maya', 'kael', 'luna']);
    const [a, b, c] = blast.players;
    a.x = 400;
    a.y = 360;
    b.x = 520;
    b.y = 360;
    c.x = 520;
    c.y = 400;
    a.aim = 0;
    const hb = b.hp;
    const hc = c.hp;
    blast.step(STEP, { a: press(0, 160), b: idle, c: idle });
    for (let i = 0; i < 40; i++) blast.step(STEP, { a: idle, b: idle, c: idle });
    expect(b.hp).toBeLessThan(hb);
    expect(c.hp).toBeLessThan(hc);
    const splash = hb - b.hp;
    expect(hc - c.hp).toBeLessThan(splash);

    const bolt = fight(['zed', 'kael', 'luna']);
    const [z, t, u] = bolt.players;
    z.x = 400;
    z.y = 360;
    t.x = 520;
    t.y = 360;
    u.x = 520;
    u.y = 400;
    z.aim = 0;
    const ht = t.hp;
    const hu = u.hp;
    bolt.step(STEP, { a: press(0, 160), b: idle, c: idle });
    for (let i = 0; i < 30; i++) bolt.step(STEP, { a: idle, b: idle, c: idle });
    expect(t.hp).toBeLessThan(ht);
    expect(u.hp).toBe(hu);
  });

  it('parede: o visual de obstáculo não tira vida', () => {
    const g = fight(['kai', 'luna']);
    const [a, b] = g.players;
    g.iceWalls.push({ id: 3, owner: 'x', kind: 'gelo', x: 460, y: 300, w: 40, h: 120, t: 8 });
    a.x = 400;
    a.y = 360;
    b.x = 560;
    b.y = 360;
    const hp = b.hp;
    g.step(STEP, { a: press(0, 200), b: idle });
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
    expect(g.drainEvents().some((e) => e.type === 'deny' && e.msg === 'Obstáculo')).toBe(true);
  });

  it('no lab, o duelo nasce fora da parede e o Q alcança o outro', () => {
    const lab = getArena('lab');
    const g = fight(['kai', 'luna']);
    const [a, b] = g.players;
    a.x = lab.spawns[0].x;
    a.y = lab.spawns[0].y;
    b.x = a.x + 180;
    b.y = a.y;
    const wall = lab.walls.find((w) => w.x === 170 && w.y === 290);
    expect(wall).toBeTruthy();
    expect(a.y < wall!.y || a.y > wall!.y + wall!.h).toBe(true);
    const hp = b.hp;
    g.step(STEP, { a: press(0, 180), b: idle });
    for (let i = 0; i < 90 && b.hp === hp; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(hp);
  });
});

describe('janela do combo no acerto', () => {
  it('fica entre 0,8 s e 1,5 s e começa quando o golpe acerta', () => {
    expect(COMBO_WINDOW).toBeGreaterThanOrEqual(0.8);
    expect(COMBO_WINDOW).toBeLessThanOrEqual(1.5);
    const g = fight(['kai', 'luna']);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 520;
    b.y = 360;
    expect(b.comboT).toBe(0);
    g.step(STEP, { a: press(0, 140), b: idle });
    expect(b.comboT).toBe(0);
    for (let i = 0; i < 40 && b.frozenT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.frozenT).toBeGreaterThan(COMBO_WINDOW);
    expect(b.comboT).toBeGreaterThan(0.8);
    expect(b.comboT).toBeLessThanOrEqual(COMBO_WINDOW);
  });

  it('Descarga Condutora sai dentro da janela e não depois, mesmo molhado', () => {
    const g = fight(['kai', 'luna']);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 500;
    b.y = 360;
    g.step(STEP, { a: press(0, 120), b: idle });
    for (let i = 0; i < 40 && b.frozenT <= 0; i++) g.step(STEP, { a: idle, b: idle });
    a.energy = 100;
    a.powerCd[1] = 0;
    const before = b.hp;
    g.drainEvents();
    g.step(STEP, { a: press(1, 120), b: idle });
    const hit = g.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Descarga Condutora');
    expect(hit).toHaveLength(1);
    expect(before - b.hp).toBe(resolvedDamage(kitOf('kai').powers[1], 1) + 24);

    const late = fight(['kai', 'luna']);
    const [p, q] = late.players;
    p.x = 400;
    p.y = 360;
    q.x = 500;
    q.y = 360;
    late.step(STEP, { a: press(0, 120), b: idle });
    for (let i = 0; i < 40 && q.frozenT <= 0; i++) late.step(STEP, { a: idle, b: idle });
    for (let i = 0; i < Math.ceil((COMBO_WINDOW + 0.2) / STEP); i++) late.step(STEP, { a: idle, b: idle });
    expect(q.frozenT).toBeGreaterThan(0);
    expect(q.comboT).toBe(0);
    p.energy = 100;
    p.powerCd[1] = 0;
    late.drainEvents();
    late.step(STEP, { a: press(1, 120), b: idle });
    expect(late.drainEvents().some((e) => e.type === 'combo' && e.name === 'Descarga Condutora')).toBe(false);
  });

  it('água na fissura vira Espinhos Glaciais e raio mais plasma explode uma vez', () => {
    const ice = fight(['kai', 'nara']);
    const [a, b] = ice.players;
    a.x = 400;
    a.y = 360;
    b.x = 480;
    b.y = 360;
    b.rootT = 1;
    b.comboT = COMBO_WINDOW;
    const before = b.hp;
    ice.drainEvents();
    ice.step(STEP, { a: press(0, 100), b: idle });
    for (let i = 0; i < 30 && b.hp === before; i++) ice.step(STEP, { a: idle, b: idle });
    const spikes = ice.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Espinhos Glaciais');
    expect(spikes).toHaveLength(1);
    expect(before - b.hp).toBe(resolvedDamage(kitOf('kai').powers[0], 0) + 10);

    const bolt = fight(['vortex', 'zed']);
    const [v, z] = bolt.players;
    v.x = 400;
    v.y = 360;
    z.x = 500;
    z.y = 360;
    z.shockT = COMBO_WINDOW;
    z.comboT = COMBO_WINDOW;
    const hp = z.hp;
    bolt.drainEvents();
    bolt.step(STEP, { a: press(0, 120), b: idle });
    for (let i = 0; i < 20 && z.hp === hp; i++) bolt.step(STEP, { a: idle, b: idle });
    const charged = bolt.drainEvents().filter((e) => e.type === 'combo' && e.name === 'Raio Carregado');
    expect(charged).toHaveLength(1);
    expect(hp - z.hp).toBe(resolvedDamage(kitOf('vortex').powers[0], 0) + 12);
    expect(z.shockT).toBe(0);
  });
});

describe('painel de combo', () => {
  it('mostra Q depois E quando o kit fecha, e não o mesmo golpe duas vezes', () => {
    const rows = listSynergies('kai', null).filter((row) => row.state === 'active' && row.slots.length === 2);
    const pick = pickComboRecipe(rows);
    expect(pick?.name).toBe('Descarga Condutora');
    expect(pick?.slots).toEqual([0, 1]);
    expect(rows.some((row) => row.slots[0] === row.slots[1])).toBe(true);
    expect(pickComboRecipe([{ slots: [0, 0], name: 'Congelamento' }, { slots: [0, 1], name: 'Descarga Condutora' }])?.name).toBe('Descarga Condutora');
  });
});
