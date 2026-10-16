import { describe, expect, it } from 'vitest';
import { ARENA_SCALE, VIEW_H, VIEW_W, WORLD_H, WORLD_W, duelPoints, getArena } from '../src/game/arenas';
import { Game, Input } from '../src/game/sim';
import { spreadSpawns } from '../src/game/ffa';
import { allyOf, teamComboName } from '../src/game/teamPlay';
import { rangeTier } from '../src/game/rangeTiers';
import { kitOf } from '../src/game/elements';
import { bodyPose } from '../src/render/chars';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

describe('fase 4 — mapas, times e alcance', () => {
  it('a área útil fica entre 2× e 3× e o X1 guarda a distância antiga', () => {
    const ratio = (WORLD_W * WORLD_H) / (VIEW_W * VIEW_H);
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(3);
    expect(ARENA_SCALE).toBeCloseTo(1.58, 2);
    const lab = getArena('lab');
    const [a, b] = duelPoints(lab);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(lab.duelSep!, 0);
    expect(lab.walls.some((w) => w.w === 86 * ARENA_SCALE && w.h === 20 * ARENA_SCALE)).toBe(true);
    const lane = lab.walls.find((w) => Math.abs(w.y - 340 * ARENA_SCALE) < 1);
    expect(lane).toBeTruthy();
    expect(360 < lane!.y || 360 > lane!.y + lane!.h).toBe(true);
  });

  it('o 2x2 fica com dois em cada time e não atinge o aliado', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, char: i % 2 ? 'luna' : 'kai', isBot: false }));
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kai',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster,
      roundSec: 30,
      suddenSec: 8,
    });
    expect(g.players).toHaveLength(4);
    expect(g.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    expect(allyOf(g.players[0], g.players[1])).toBe(true);
    expect(allyOf(g.players[0], g.players[2])).toBe(false);
    while (g.phase !== 'play') g.step(STEP, idle);
    const [a, b] = g.players;
    a.invulnT = 0;
    b.invulnT = 0;
    a.x = 400;
    a.y = 360;
    b.x = 460;
    b.y = 360;
    const hp = b.hp;
    g.step(STEP, { ...idle, ability: true, aim: 0, ca: 0 });
    for (let i = 0; i < 30; i++) g.step(STEP, idle);
    expect(b.hp).toBe(hp);
  });

  it('o todos contra todos espalha os nascimentos', () => {
    const roster = ['a', 'b', 'c', 'd'].map((id) => ({ id, char: 'kai', isBot: false }));
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kai',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'todos',
      roster,
      roundSec: 30,
      suddenSec: 8,
    });
    const pts = g.players.map((p) => ({ x: p.x, y: p.y }));
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(min).toBeGreaterThan(200);
    const lab = getArena('lab');
    expect(spreadSpawns(lab.spawns, 4, WORLD_W / 2, WORLD_H / 2)).toHaveLength(4);
  });

  it('os alcances do kit não são todos globais', () => {
    const tiers = new Set(kitOf('kai').powers.map((p) => rangeTier(Math.max(p.range, p.speed <= 0 ? p.radius : 0))));
    expect(tiers.size).toBeGreaterThan(1);
    expect(rangeTier(90)).toBe('short');
    expect(rangeTier(600)).toBe('extreme');
  });

  it('vento e raio de aliados confirmam o combo e o dano extra', () => {
    expect(teamComboName('wind', 'lightning')).toBe('Tempestade elétrica');
    const roster = [
      { id: 'a', char: 'kai', isBot: false },
      { id: 'b', char: 'kai', isBot: false },
      { id: 'c', char: 'luna', isBot: false },
      { id: 'd', char: 'luna', isBot: false },
    ];
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kai',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster,
      roundSec: 30,
      suddenSec: 8,
    });
    while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle, c: idle, d: idle });
    for (const p of g.players) p.invulnT = 0;
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 680;
    b.y = 360;
    c.x = 730;
    c.y = 360;
    const before = c.hp;
    g.step(STEP, {
      a: { ...idle, bonus: true, aim: 0, ca: 0 },
      b: { ...idle, skill: true, aim: 0, ca: 0, cr: 50 },
      c: idle,
      d: idle,
    });
    const team = g.events.find((e) => e.type === 'combo' && e.team);
    expect(team && team.type === 'combo' ? team.name : '').toBe('Tempestade elétrica');
    expect(team && team.type === 'combo' ? team.bonus : 0).toBe(6);
    expect(team && team.type === 'combo' ? team.confirmed : false).toBe(true);
    expect(b.hp).toBe(b.maxHp);
    expect(c.hp).toBeLessThanOrEqual(before);
  });

  it('a pose 2D troca com o estado e não inventa um rig', () => {
    expect(bodyPose({ hitFlash: 0.2, dodgeT: 0, dashT: 0, cast: 0, castT: 0 })).toBe('hurt');
    expect(bodyPose({ hitFlash: 0, dodgeT: 0, dashT: 0.2, cast: 0, castT: 0 })).toBe('dodge');
    expect(bodyPose({ hitFlash: 0, dodgeT: 0, dashT: 0, cast: 0.4, castT: 0 })).toBe('cast');
    expect(bodyPose({ hitFlash: 0, dodgeT: 0, dashT: 0, cast: 0, castT: 0.3 })).toBe('windup');
    expect(bodyPose({ hitFlash: 0, dodgeT: 0, dashT: 0, cast: 0, castT: 0 })).toBe('normal');
  });
});
