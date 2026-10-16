import { describe, expect, it } from 'vitest';
import { Game, type Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { castAimShape, mouseBeatsKeys, resolveCastAngle, screenToWorld, solveAim, viewFromLetterbox } from '../src/game/aimService';
import { DASH_SPEED, DASH_TIME } from '../src/game/constants';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };
const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };

function fight(chars: { id: string; char: string }[]) {
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
  for (const p of g.players) {
    p.invulnT = 0;
    p.energy = 100;
    p.powerCd = [0, 0, 0, 0];
  }
  return g;
}

describe('tela para mundo', () => {
  it('o clique acompanha o centro da câmera e o zoom', () => {
    const view = viewFromLetterbox({ left: 12, top: 30, cssW: 800, cssH: 600, bufW: 1600, bufH: 1200, ox: 40, oy: 80, scale: 2 });
    const center = screenToWorld(12 + 400, 30 + 300, view);
    expect(center.x).toBeCloseTo(view.camX);
    expect(center.y).toBeCloseTo(view.camY);
    const left = screenToWorld(12 + 400 - 100, 30 + 300, view);
    expect(left.x).toBeCloseTo(view.camX - 50);
    expect(left.y).toBeCloseTo(view.camY);
    // a câmera segue o personagem: o mesmo pixel de tela cai em outro ponto do mundo
    const followed = { ...view, camX: view.camX + 180, camY: view.camY - 40 };
    const moved = screenToWorld(12 + 400, 30 + 300, followed);
    expect(moved.x).toBeCloseTo(center.x + 180);
    expect(moved.y).toBeCloseTo(center.y - 40);
    expect(view.bufW).toBe(1600);
  });
});

describe('ponto do golpe', () => {
  const base = { ox: 400, oy: 300, range: 200, radius: 3, solids: { rects: [] as { x: number; y: number; w: number; h: number }[], discs: [], bounds } };

  it('olhando para a direita, o clique à esquerda manda para a esquerda', () => {
    const shot = solveAim({ ...base, cursorX: 200, cursorY: 300, kind: 'projectile', facing: 0, hasCursor: true });
    expect(shot.ang).toBeCloseTo(Math.PI);
    expect(shot.fromFacing).toBe(false);
    expect(shot.x).toBeCloseTo(200);
  });

  it('olhando para a esquerda, o clique à direita manda para a direita', () => {
    const shot = solveAim({ ...base, cursorX: 560, cursorY: 300, kind: 'projectile', facing: Math.PI, hasCursor: true });
    expect(shot.ang).toBeCloseTo(0);
    expect(shot.x).toBeGreaterThan(400);
  });

  it('as quatro diagonais', () => {
    const pts = [
      [500, 200, -Math.PI / 4],
      [300, 200, (-3 * Math.PI) / 4],
      [300, 400, (3 * Math.PI) / 4],
      [500, 400, Math.PI / 4],
    ] as const;
    for (const [x, y, ang] of pts) {
      const shot = solveAim({ ...base, cursorX: x, cursorY: y, kind: 'line', facing: 0, hasCursor: true });
      expect(shot.ang).toBeCloseTo(ang);
    }
  });

  it('perto fica no cursor e longe para no alcance', () => {
    const near = solveAim({ ...base, cursorX: 430, cursorY: 300, kind: 'point', facing: 0, hasCursor: true });
    expect(near.dist).toBeCloseTo(30);
    expect(near.outOfRange).toBe(false);
    expect(near.x).not.toBeCloseTo(base.ox);
    const far = solveAim({ ...base, cursorX: 900, cursorY: 300, kind: 'point', facing: Math.PI, hasCursor: true });
    expect(far.dist).toBeCloseTo(200);
    expect(far.outOfRange).toBe(true);
    expect(far.ang).toBeCloseTo(0);
    expect(far.x).toBeCloseTo(600);
  });

  it('parede segura o projétil e o que atravessa segue', () => {
    const solids = { rects: [{ x: 460, y: 260, w: 20, h: 80 }], discs: [], bounds };
    const blocked = solveAim({ ...base, solids, cursorX: 700, cursorY: 300, kind: 'projectile', facing: Math.PI, hasCursor: true });
    expect(blocked.blocked).toBe(true);
    expect(blocked.x).toBeLessThan(460);
    const through = solveAim({ ...base, solids, cursorX: 700, cursorY: 300, kind: 'projectile', passThrough: true, facing: Math.PI, hasCursor: true });
    expect(through.blocked).toBe(false);
    expect(through.x).toBeCloseTo(600);
  });

  it('salto para antes da parede e a área não cola no corpo', () => {
    const solids = { rects: [{ x: 450, y: 250, w: 30, h: 100 }], discs: [], bounds };
    const leap = solveAim({ ...base, solids, cursorX: 700, cursorY: 300, kind: 'dash', radius: 14, facing: 0, hasCursor: true });
    expect(leap.blocked).toBe(true);
    expect(leap.x).toBeLessThan(450);
    const area = solveAim({ ...base, cursorX: 520, cursorY: 300, kind: 'point', facing: 0, hasCursor: true });
    expect(area.x).toBeCloseTo(520);
    expect(Math.hypot(area.x - base.ox, area.y - base.oy)).toBeGreaterThan(20);
  });

  it('sem cursor, usa a direção informada', () => {
    const shot = solveAim({ ...base, kind: 'projectile', facing: Math.PI / 2, hasCursor: false });
    expect(shot.fromFacing).toBe(true);
    expect(shot.ang).toBeCloseTo(Math.PI / 2);
  });
});

describe('o golpe segue o ponto, não o corpo', () => {
  it('andar para cima e clicar à esquerda manda o projétil à esquerda', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const [a, b] = g.players;
    a.x = 400;
    a.y = 360;
    a.dir = 0;
    b.x = 700;
    b.y = 360;
    g.step(STEP, { a: { ...idle, mx: 0, my: -1, ability: true, aim: Math.PI, ca: Math.PI, cr: 180 }, b: idle });
    const bullet = g.bullets[g.bullets.length - 1];
    expect(bullet.vx).toBeLessThan(0);
    expect(Math.abs(bullet.vy)).toBeLessThan(Math.abs(bullet.vx) * 0.2);
  });

  it('dois golpes seguidos vão para lados opostos', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const a = g.players[0];
    a.x = 400;
    a.y = 360;
    a.dir = 0;
    g.step(STEP, { a: { ...idle, ability: true, aim: Math.PI, ca: Math.PI, cr: 160 }, b: idle });
    expect(g.bullets[g.bullets.length - 1].vx).toBeLessThan(0);
    a.powerCd[0] = 0;
    a.energy = 100;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0, cr: 160 }, b: idle });
    expect(g.bullets[g.bullets.length - 1].vx).toBeGreaterThan(0);
  });

  it('a área acerta o ponto clicado e não o pé do personagem', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
      { id: 'c', char: 'luna' },
    ]);
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 360;
    a.dir = Math.PI;
    b.x = 470;
    b.y = 360;
    c.x = 330;
    c.y = 360;
    const hb = b.hp;
    const hc = c.hp;
    g.step(STEP, { a: { ...idle, mx: -1, my: 0, skill: true, aim: 0, ca: 0, cr: 70 }, b: idle, c: idle });
    expect(hb - b.hp).toBeGreaterThan(0);
    expect(c.hp).toBe(hc);
  });

  it('o impulso do kit vai para o clique e para no alcance', () => {
    const g = fight([
      { id: 'a', char: 'vortex' },
      { id: 'b', char: 'luna' },
    ]);
    const a = g.players[0];
    a.x = 500;
    a.y = 400;
    a.dir = 0;
    g.step(STEP, { a: { ...idle, bonus: true, aim: Math.PI, ca: Math.PI, cr: 80 }, b: idle });
    expect(a.dir).toBeCloseTo(Math.PI);
    expect(a.dashT).toBeGreaterThan(0);
    expect(a.dashT).toBeLessThan(DASH_TIME);
    // o mesmo passo já consome um quadro de impulso
    expect(a.dashT * DASH_SPEED + DASH_SPEED * STEP).toBeCloseTo(80, 0);
  });

  it('o impulso do espaço vai para o clique e para antes do alcance cheio', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const a = g.players[0];
    a.x = 500;
    a.y = 400;
    a.dir = 0;
    g.step(STEP, { a: { ...idle, dash: true, aim: 0, ca: Math.PI, cr: 40 }, b: idle });
    expect(a.dir).toBeCloseTo(Math.PI);
    expect(a.dashT * DASH_SPEED + DASH_SPEED * STEP).toBeCloseTo(40, 0);
  });
});

describe('quem manda na mira', () => {
  it('o mouse recente vence o teclado e o toque não finge mouse', () => {
    expect(mouseBeatsKeys({ pointer: 'mouse', mouseAt: 1000, now: 1500, keySteer: true })).toBe(true);
    expect(mouseBeatsKeys({ pointer: 'mouse', mouseAt: 1000, now: 3000, keySteer: true })).toBe(false);
    expect(mouseBeatsKeys({ pointer: 'mouse', mouseAt: 1000, now: 9000, keySteer: false })).toBe(true);
    expect(mouseBeatsKeys({ pointer: 'touch', mouseAt: 1000, now: 1100, keySteer: false })).toBe(false);
    expect(mouseBeatsKeys({ pointer: 'none', mouseAt: 0, now: 10, keySteer: false })).toBe(false);
  });

  it('área solta na hora continua no ponto, não no corpo', () => {
    expect(castAimShape({ kind: 'instant', shape: 'circle' })).toBe('point');
    expect(castAimShape({ kind: 'instant', shape: 'self' })).toBe('self');
    expect(castAimShape({ kind: 'direction', shape: 'arrow' })).toBe('projectile');
    expect(castAimShape({ kind: 'direction', shape: 'line' })).toBe('dash');
    expect(castAimShape({ kind: 'point', shape: 'wall' })).toBe('point');
  });

  it('andar para a direita e atirar para a esquerda manda o básico para a esquerda', () => {
    const g = fight([
      { id: 'a', char: 'nara' },
      { id: 'b', char: 'luna' },
    ]);
    const a = g.players[0];
    a.x = 400;
    a.y = 300;
    a.dir = 0;
    g.step(STEP, { a: { ...idle, mx: 1, my: 0, fire: true, aim: Math.PI, ca: Math.PI }, b: idle });
    const bullet = g.bullets[g.bullets.length - 1];
    expect(bullet.basic).toBe(true);
    expect(bullet.vx).toBeLessThan(0);
    expect(Math.abs(bullet.vy)).toBeLessThan(Math.abs(bullet.vx) * 0.2);
    expect(a.dir).toBeCloseTo(0);
  });
});

describe('sem cursor', () => {
  it('o bot que anda segue o passo; o humano segue a mira', () => {
    const bot = resolveCastAngle({ mx: 0, my: -1, aim: 0, dir: 0, bot: true });
    expect(bot).toBeCloseTo(-Math.PI / 2);
    const human = resolveCastAngle({ mx: 0, my: -1, aim: Math.PI, dir: 0, bot: false });
    expect(human).toBeCloseTo(Math.PI);
    const click = resolveCastAngle({ ca: Math.PI, mx: 0, my: -1, aim: 0, dir: 0, bot: false });
    expect(click).toBeCloseTo(Math.PI);
  });
});
