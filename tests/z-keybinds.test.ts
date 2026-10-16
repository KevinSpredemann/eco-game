import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { GUN_Y } from '../src/game/weapons';
import { COMBAT, DEFAULT_LOADOUT, cloneDamage } from '../src/game/balance';
import { catalogAim, studioOf } from '../src/game/elements';
import { PROTO, encodeSnapshot } from '../src/net/protocol';
import { ClientGame } from '../src/net/clientGame';
import { BIND_ROWS, bindOwner, castBlocked, commitBind, reservedKeyMessage, swallowKey, WASD_KEYS } from '../src/ui/input';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function duel(char: string, secondary: string | null = null) {
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
      { id: 'a', char, isBot: false, loadout: { secondary }, skin: 'padrao', trail: 'nenhum' },
      { id: 'b', char: 'luna', isBot: false, skin: 'padrao', trail: 'nenhum' },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.drainEvents();
  return g;
}

function press(g: Game, who: 'a' | 'b', extra: Partial<Input>) {
  g.step(STEP, { a: idle, b: idle, [who]: { ...idle, ...extra } } as unknown as Input);
}

describe('Z do catálogo', () => {
  it('a lança segue a mira e não a cara, e o segundo aperto na recarga avisa', () => {
    const g = duel('kai', 'lanca-solar');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    a.dir = Math.PI;
    b.x = 460;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(b.maxHp);
    const spent = a.energy;
    const shots = g.bullets.length;
    g.drainEvents();
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'deny' && e.msg === 'Habilidade em recarga')).toBe(true);
    expect(a.energy).toBeGreaterThan(spent - 1);
    expect(g.bullets.length).toBe(shots);
  });

  it('a lança para o norte acerta o alvo do norte e erra o do leste', () => {
    const north = duel('kai', 'lanca-solar');
    const [a, b] = north.players;
    a.x = 400;
    a.y = 360;
    a.dir = 0;
    b.x = 400;
    b.y = 220;
    press(north, 'a', { plasma: true, aim: -Math.PI / 2, ca: -Math.PI / 2 });
    for (let i = 0; i < 30; i++) north.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(b.maxHp);

    const east = duel('kai', 'lanca-solar');
    const [c, d] = east.players;
    c.x = 400;
    c.y = 360;
    d.x = 400;
    d.y = 220;
    const hp = d.hp;
    press(east, 'a', { plasma: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) east.step(STEP, { a: idle, b: idle });
    expect(d.hp).toBe(hp);
  });

  it('a corrente acerta quem está na mira e ignora quem está atrás, mesmo mais perto', () => {
    const g = duel('zed', 'corrente-tempestuosa');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    a.dir = Math.PI;
    b.x = 470;
    b.y = 220;
    g.players.push({ ...b, id: 'c', x: 180, y: 220, name: 'Atrás' });
    const behind = g.players[2];
    const aheadHp = b.hp;
    const behindHp = behind.hp;
    press(g, 'a', { plasma: true, aim: 0, ca: 0 });
    expect(b.hp).toBeLessThan(aheadHp);
    expect(behind.hp).toBe(behindHp);
  });

  it('as raízes desenham a área no ponto mirado e o aviso da vulcânica sai antes do dano', () => {
    const roots = duel('nara', 'prisao-raizes');
    const [a] = roots.players;
    a.x = 300;
    a.y = 220;
    press(roots, 'a', { plasma: true, aim: 0, ca: 0, cr: 140 });
    const area = roots.drainEvents().filter((e) => e.type === 'skill' && (e.r ?? 0) > 30);
    expect(area.some((e) => e.type === 'skill' && e.x > a.x + 50)).toBe(true);
    expect(roots.patches.some((z) => z.kind === 'roots' && z.x > a.x + 50)).toBe(true);

    const fire = duel('maya', 'ruptura-vulcanica');
    const [c, d] = fire.players;
    c.x = 300;
    c.y = 220;
    d.x = 430;
    d.y = 220;
    const hp = d.hp;
    press(fire, 'a', { plasma: true, aim: 0, ca: 0 });
    const wind = fire.drainEvents().filter((e) => e.type === 'windup');
    expect(wind.length).toBeGreaterThan(0);
    expect(wind.some((e) => e.type === 'windup' && e.x > c.x + 20)).toBe(true);
    for (let i = 0; i < 12; i++) fire.step(STEP, { a: idle, b: idle });
    expect(d.hp).toBe(hp);
  });

  it('o snapshot leva a zona do Z sem mudar o protocolo', () => {
    const g = duel('nara', 'prisao-raizes');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 220;
    b.x = 440;
    b.y = 220;
    press(g, 'a', { plasma: true, aim: 0, ca: 0, cr: 140 });
    const snap = encodeSnapshot(g, false);
    expect(PROTO).toBe(12);
    expect(snap.P[0].length).toBe(61);
    expect((snap.PA ?? []).length).toBeGreaterThan(0);
    const view = new ClientGame({
      you: 'a',
      mode: 'duelo',
      arena: 'lab',
      roster: [
        { id: 'a', char: 'nara', name: 'Você', isBot: false, skin: 'padrao', trail: 'nenhum', loadout: { ...DEFAULT_LOADOUT, secondary: 'prisao-raizes' } },
        { id: 'b', char: 'luna', name: 'Luna', isBot: false, skin: 'padrao', trail: 'nenhum' },
      ],
    });
    view.applySnapshot(snap, []);
    expect(view.patches.length).toBeGreaterThan(0);
    const old = { ...snap, PA: undefined };
    view.applySnapshot(old, []);
    expect(view.patches.length).toBe(0);
  });
});

describe('dano de clone', () => {
  it('cada ilusão estoura menos e um tiro só aciona uma', () => {
    expect(cloneDamage(6)).toBe(5);
    expect(cloneDamage(8)).toBe(7);
    expect(COMBAT.cloneDmgMul).toBeCloseTo(0.82);

    const decoy = duel('vexa');
    const [a, b] = decoy.players;
    a.x = 300;
    a.y = 360;
    b.x = 700;
    b.y = 360;
    press(decoy, 'a', { bonus: true, aim: 0, ca: 0 });
    const one = decoy.clones.find((c) => c.decoy);
    expect(one?.pop).toBe(cloneDamage(6));
    expect(one?.t).toBeGreaterThan(3);

    const ghost = duel('fuga');
    const [g] = ghost.players;
    g.x = 300;
    g.y = 360;
    press(ghost, 'a', { ability: true, aim: 0, ca: 0 });
    const left = ghost.clones.find((c) => c.decoy);
    expect(left?.pop).toBe(cloneDamage(8));

    const pile = duel('vexa');
    const [p, q] = pile.players;
    p.x = 300;
    p.y = 360;
    q.x = 530;
    q.y = 360;
    q.shieldHp = 0;
    q.comboT = 0;
    const beforeUlt = p.ultCharge;
    pile.clones.push(
      { owner: p.id, x: 500, y: 360, dir: 0, t: 3, decoy: true, absorb: 1, pop: cloneDamage(6) },
      { owner: p.id, x: 504, y: 360, dir: 0, t: 3, decoy: true, absorb: 1, pop: cloneDamage(6) },
    );
    pile.bullets.push({
      id: 9,
      x: 520,
      y: 360 - GUN_Y,
      vx: -240,
      vy: 0,
      owner: q.id,
      dmg: 4,
      life: 1,
      weapon: 'blaster',
      pierce: false,
      fromEcho: false,
      hit: [],
    });
    const hp = q.hp;
    for (let i = 0; i < 8; i++) pile.step(STEP, { a: idle, b: idle });
    expect(hp - q.hp).toBe(cloneDamage(6));
    expect(q.comboT).toBe(0);
    expect(p.ultCharge).toBeGreaterThan(beforeUlt);
    expect(pile.clones.filter((c) => (c.absorb ?? 0) > 0).length).toBe(1);
  });

  it('o estouro respeita escudo e o corte do kit continua inteiro', () => {
    const g = duel('vexa');
    const [a, b] = g.players;
    a.x = 300;
    a.y = 360;
    b.x = 530;
    b.y = 360;
    b.shieldHp = 40;
    g.clones.push({ owner: a.id, x: 500, y: 360, dir: 0, t: 3, decoy: true, absorb: 1, pop: cloneDamage(6) });
    g.bullets.push({
      id: 10,
      x: 520,
      y: 360 - GUN_Y,
      vx: -240,
      vy: 0,
      owner: b.id,
      dmg: 4,
      life: 1,
      weapon: 'blaster',
      pierce: false,
      fromEcho: false,
      hit: [],
    });
    const hp = b.hp;
    for (let i = 0; i < 8; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(hp);
    expect(b.shieldHp).toBe(40 - cloneDamage(6));

    g.drainEvents();
    a.energy = 100;
    a.powerCd = [0, 0, 0, 0];
    b.x = 530;
    b.y = 360;
    press(g, 'a', { ability: true, aim: 0, ca: 0 });
    const shot = g.bullets.find((n) => n.owner === a.id && n.el);
    expect(shot?.dmg).toBe(9);
  });
});

describe('atalhos', () => {
  it('Tab e número entram, Esc não, e o conflito nomeia a outra ação', () => {
    expect(reservedKeyMessage('Escape', 'wasd')).toMatch(/Esc/);
    expect(reservedKeyMessage('KeyP', 'wasd')).toMatch(/P pausa/);
    expect(reservedKeyMessage('Enter', 'wasd')).toMatch(/Enter/);
    expect(reservedKeyMessage('KeyW', 'wasd')).toMatch(/anda/);
    expect(reservedKeyMessage('Tab', 'wasd')).toBeNull();
    expect(reservedKeyMessage('Digit1', 'wasd')).toBeNull();
    expect(reservedKeyMessage('ShiftLeft', 'wasd')).toBeNull();
    expect(bindOwner(WASD_KEYS, 'plasma', 'KeyQ')).toBe('ability');
    const next = commitBind(WASD_KEYS, 'plasma', 'Digit1');
    expect(next.plasma).toBe('Digit1');
    expect(next.ability).toBe('KeyQ');
    const stolen = commitBind(WASD_KEYS, 'plasma', 'KeyQ');
    expect(stolen.plasma).toBe('KeyQ');
    expect(stolen.ability).toBe('');
    expect(castBlocked({ repeat: true, typing: false, menu: false })).toBe(true);
    expect(castBlocked({ repeat: false, typing: true, menu: false })).toBe(true);
    expect(castBlocked({ repeat: false, typing: false, menu: true })).toBe(true);
    expect(castBlocked({ repeat: false, typing: false, menu: false })).toBe(false);
    expect(swallowKey('Tab', false)).toBe(true);
    expect(swallowKey('Digit1', false)).toBe(false);
    expect(swallowKey('Digit1', true)).toBe(true);
    expect(swallowKey('ControlLeft', true)).toBe(true);
    expect(BIND_ROWS.map((r) => r.id)).toEqual(['ability', 'skill', 'bonus', 'ult', 'plasma', 'dash', 'fire', 'item']);
    expect(catalogAim(studioOf('corrente-tempestuosa')).shape).toBe('cone');
    expect(catalogAim(studioOf('lanca-solar')).shape).toBe('line');
    expect(catalogAim(studioOf('prisao-raizes')).shape).toBe('circle');
  });
});
