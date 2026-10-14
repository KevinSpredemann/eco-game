import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import * as C from '../src/game/constants';
import { COMBAT } from '../src/game/balance';
import { WEAPONS } from '../src/game/weapons';
import { fireSlot } from '../src/game/bot';
import { choosePortalExit, portalPairAt } from '../src/game/portals';
import { rematchStatus } from '../src/net/rematch';
import { confirmTouchCast } from '../src/ui/input';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function started(arena = 'lab', mode: 'dupla' | 'duelo' = 'dupla') {
  const g = new Game({
    arena: getArena(arena),
    humanChar: 'kael',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode,
    roster: [
      { id: 'a', char: 'kael', isBot: false },
      { id: 'b', char: 'luna', isBot: false },
    ],
  });
  const inputs = { a: idle, b: idle };
  while (g.phase !== 'play') g.step(STEP, inputs);
  for (const p of g.players) p.invulnT = 0;
  return g;
}

describe('portais, gelo, morte e colisão', () => {
  it('portal não tira vida e deixa os dois numa saída livre', () => {
    const g = started();
    const [a, b] = g.arena.portals![0];
    const pa = g.players[0];
    const pb = g.players[1];
    const ha = pa.hp;
    const hb = pb.hp;
    pa.x = a.x;
    pa.y = a.y;
    pb.x = a.x + 6;
    pb.y = a.y;
    pa.vx = pb.vx = 40;
    pa.vy = pb.vy = 10;
    g.step(STEP, { a: idle, b: idle });
    for (const p of [pa, pb]) {
      expect(p.hp).toBe(p === pa ? ha : hb);
      expect(p.hearts).toBe(3);
      expect(p.portalCd).toBeGreaterThan(0);
      expect(portalPairAt(g.arena.portals, p.x, p.y)).toBeNull();
      expect(g.isFree(p.x, p.y, C.PLAYER_R)).toBe(true);
      expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(100);
    }
    const ax = pa.x;
    g.step(STEP, { a: idle, b: idle });
    expect(pa.x).toBeCloseTo(ax, 0);
    expect(pa.hp).toBe(ha);
  });

  it('depois da recarga o portal funciona de novo e a vida continua igual', () => {
    const g = started();
    const [a] = g.arena.portals![0];
    const p = g.players[0];
    p.x = a.x;
    p.y = a.y;
    p.dir = 0.4;
    g.step(STEP, { a: idle, b: idle });
    expect(p.portalCd).toBeGreaterThan(0);
    p.portalCd = 0;
    const back = g.arena.portals![0][1];
    p.x = back.x;
    p.y = back.y;
    const hp = p.hp;
    g.step(STEP, { a: idle, b: idle });
    expect(p.hp).toBe(hp);
    expect(portalPairAt(g.arena.portals, p.x, p.y)).toBeNull();
    expect(g.isFree(p.x, p.y, C.PLAYER_R)).toBe(true);
  });

  it('a saída escolhida não cai em zona ligada nem em parede', () => {
    const g = started('lab');
    const to = g.arena.portals![0][1];
    const exit = choosePortalExit(g.arena, to, 0, g.worldT, () => true, (x, y) => g.isFree(x, y, C.PLAYER_R));
    expect(g.isFree(exit.x, exit.y, C.PLAYER_R)).toBe(true);
    for (const z of g.arena.zones) expect(Math.hypot(exit.x - z.x, exit.y - z.y)).toBeGreaterThan(z.r);
  });

  it('ficar no gelo, longe das zonas, não tira vida', () => {
    const g = started('gelo');
    const p = g.players[0];
    p.x = 640;
    p.y = 360;
    p.vx = p.vy = 0;
    const hp = p.hp;
    for (let i = 0; i < 120; i++) g.step(STEP, { a: idle, b: { ...idle, mx: 0, my: 0 } });
    expect(p.alive).toBe(true);
    expect(p.hp).toBe(hp);
    expect(g.arena.portals).toBeUndefined();
  });

  it('jogador enterrado numa parede volta para um lugar livre', () => {
    const g = started();
    const p = g.players[0];
    p.x = 350;
    p.y = 178;
    p.vx = 200;
    p.vy = 0;
    expect(g.isFree(p.x, p.y, 4)).toBe(false);
    g.step(STEP, { a: idle, b: idle });
    expect(g.isFree(p.x, p.y, C.PLAYER_R)).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.hp).toBe(COMBAT.maxHp);
  });

  it('a vida chega a zero uma vez e não volta sozinha', () => {
    const g = started('lab', 'duelo');
    const p = g.players[1];
    p.invulnT = 0;
    p.hp = 8;
    g.hurt(p, 40, g.players[0].id, 'shot', 0);
    expect(p.alive).toBe(false);
    expect(p.hp).toBe(0);
    g.hurt(p, 40, g.players[0].id, 'shot', 0);
    expect(p.hp).toBe(0);
    expect(p.alive).toBe(false);
  });

  it('um tiro acerta uma vez e o eco avisa a origem', () => {
    const g = started('lab', 'dupla');
    const a = g.players[0];
    const b = g.players[1];
    a.x = 400;
    a.y = 360;
    b.x = 520;
    b.y = 360;
    a.dir = 0;
    b.dir = Math.PI;
    a.aim = 0;
    a.weapon = 'blaster';
    a.invulnT = b.invulnT = 0;
    const before = b.hp;
    g.drainEvents();
    const shoot: Input = { ...idle, fire: true, aim: 0 };
    g.step(STEP, { a: shoot, b: idle });
    for (let i = 0; i < 40 && b.hp === before; i++) g.step(STEP, { a: idle, b: idle });
    expect(before - b.hp).toBe(WEAPONS.blaster.damage);
    b.invulnT = 0;
    g.drainEvents();
    g.hurt(b, 12, null, 'echo', Math.PI);
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'dmg' && e.note === 'ECO DA RODADA ANTERIOR' && e.n === 12 && e.src === 'eco')).toBe(true);
    expect(ev.some((e) => e.type === 'hit' && e.by === 'echo')).toBe(true);
    expect(ev.some((e) => e.type === 'hit' && e.by === 'pulse' && (e as { by: string }).by === 'echo')).toBe(false);
  });
});

describe('bots, ultimate e revanche', () => {
  it('só o bot mais perto atira quando o limite é 1', () => {
    const crew = [
      { id: 'perto', d: 80 },
      { id: 'longe', d: 200 },
    ];
    expect(fireSlot(crew, 'perto', 1)).toBe(true);
    expect(fireSlot(crew, 'longe', 1)).toBe(false);
    expect(fireSlot(crew, 'longe', 2)).toBe(true);
  });

  it('toque seco na ultimate mirada não confirma', () => {
    expect(confirmTouchCast('ult', 'point', 4)).toBe(false);
    expect(confirmTouchCast('ult', 'point', 40)).toBe(true);
    expect(confirmTouchCast('ult', 'instant', 0)).toBe(true);
    expect(confirmTouchCast('ability', 'point', 0)).toBe(true);
  });

  it('revanche do x1 só começa com os dois e cancela no tempo ou na recusa', () => {
    expect(rematchStatus(['a', 'b'], {}, 0, 0)).toBe('idle');
    expect(rematchStatus(['a', 'b'], { a: 'yes' }, 1000, 0)).toBe('wait');
    expect(rematchStatus(['a', 'b'], { a: 'yes', b: 'yes' }, 1000, 0)).toBe('go');
    expect(rematchStatus(['a', 'b'], { a: 'yes', b: 'no' }, 1000, 0)).toBe('no');
    expect(rematchStatus(['a', 'b'], { a: 'yes' }, 22_000, 1_000)).toBe('no');
    expect(rematchStatus(['a'], { a: 'yes' }, 1000, 0)).toBe('no');
  });
});
