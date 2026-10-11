// Rebalanceamento: vida/regeneração, limites de controle, Ecos, IA dos bots e Caça ao Chefe (criaturas, cobertura, exaustão).
import { describe, expect, it } from 'vitest';
import { Game, Input, RosterEntry } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { BOSS, COMBAT } from '../src/game/balance';
import { PROFILES } from '../src/game/bot';
import { BOMB_DAMAGE, ECHO_DAMAGE_MULT, GUN_Y, MAX_HP, MINE_DAMAGE } from '../src/game/weapons';

const STEP = 1 / 60;

function duel(diff: 'facil' | 'normal' | 'dificil' = 'normal') {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kael',
    bots: 0,
    difficulty: diff,
    ownEchoDamage: true,
    training: false,
    mode: 'combate',
    roster: [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'b0', char: 'zoe', isBot: true },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, {});
  return g;
}

const hunt = (): Game => {
  const roster: RosterEntry[] = [
    { id: 'h0', char: 'kael', isBot: false },
    { id: 'h1', char: 'iris', isBot: false },
    { id: 'h2', char: 'zoe', isBot: false },
    { id: 'boss', char: 'bruno', isBot: false, boss: true },
  ];
  const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'chefe', roster });
  while (g.phase !== 'play') g.step(STEP, {});
  return g;
};

describe('vida, dano e regeneração', () => {
  it('valores centrais do rebalanceamento', () => {
    expect(COMBAT.maxHp).toBe(150);
    expect(MAX_HP).toBe(150);
    expect(ECHO_DAMAGE_MULT).toBeCloseTo(0.4);
    expect(BOMB_DAMAGE).toBeLessThanOrEqual(40);
    expect(MINE_DAMAGE).toBeLessThanOrEqual(35);
    // nenhuma combinação simples de granada + mina mata alguém com vida cheia
    expect(BOMB_DAMAGE + MINE_DAMAGE).toBeLessThan(COMBAT.maxHp);
  });

  it('regenera devagar só depois de 4 s sem levar dano', () => {
    const g = duel();
    const me = g.players[0];
    g.players[1].isBot = false;
    me.invulnT = 0;
    me.phaseT = 0;
    g.hurt(me, 60, 'b0', 'shot');
    const hp0 = me.hp;
    expect(hp0).toBeLessThan(COMBAT.maxHp);
    for (let i = 0; i < 60 * 3; i++) g.step(STEP, {});
    expect(me.hp).toBe(hp0);
    for (let i = 0; i < 60 * 3; i++) g.step(STEP, {});
    expect(me.hp).toBeGreaterThan(hp0);
    expect(me.hp - hp0).toBeLessThanOrEqual(COMBAT.regen.perSecond * 2 + 0.5);
  });

  it('atordoamento tem teto e resistência (não dá para prender em cadeia)', () => {
    const g = duel();
    const me = g.players[0];
    g.stun(me, 3);
    expect(me.stunT).toBeLessThanOrEqual(COMBAT.maxStun);
    const first = me.stunT;
    for (let i = 0; i < 20; i++) g.step(STEP, {});
    g.stun(me, 0.8); // logo em seguida: resistido
    expect(me.stunT).toBeLessThan(first);
  });
});

describe('IA dos bots por dificuldade', () => {
  it('bot fácil causa bem menos dano que o difícil', () => {
    // dano total recebido em 20 s andando em círculos (vida reposta para não morrer)
    const measure = (diff: 'facil' | 'dificil') => {
      let dmg = 0;
      for (let k = 0; k < 10; k++) {
        const g = duel(diff);
        const me = g.players[0];
        for (let t = 0; t < 20; t += STEP) {
          const a = t * 0.8;
          me.hp = me.maxHp;
          g.step(STEP, { mx: Math.cos(a) * 0.6, my: Math.sin(a) * 0.6, dash: false, ability: false } as Input);
          for (const e of g.drainEvents()) if (e.type === 'dmg' && e.pid === 'p0' && e.k === 'hp') dmg += e.n;
        }
      }
      return dmg;
    };
    // perfis: erro de mira, previsão e tempo de reação ficam em ordem
    expect(PROFILES.facil.aim).toBeGreaterThan(PROFILES.normal.aim);
    expect(PROFILES.normal.aim).toBeGreaterThan(PROFILES.dificil.aim);
    expect(PROFILES.facil.lead).toBeLessThan(PROFILES.dificil.lead);
    expect(PROFILES.facil.react).toBeGreaterThan(PROFILES.dificil.react);
    const easy = measure('facil');
    const hard = measure('dificil');
    // eslint-disable-next-line no-console
    console.log('dano recebido em 20 s: fácil', Math.round(easy / 10), 'difícil', Math.round(hard / 10));
    expect(easy).toBeLessThan(hard * 0.75);
  }, 60000);
});

describe('Caça ao Chefe: mapa e criaturas', () => {
  it('monta caixas de cobertura e pontos de recurso', () => {
    const g = hunt();
    const crates = g.iceWalls.filter((w) => w.kind === 'caixa');
    expect(crates.length).toBeGreaterThanOrEqual(2);
    expect(crates[0].hp).toBe(BOSS.coverHp);
    expect(g.resSpots.length).toBeGreaterThan(0);
  });

  it('caixa de cobertura quebra depois de levar dano suficiente', () => {
    const g = hunt();
    const c = g.iceWalls.find((w) => w.kind === 'caixa')!;
    (g as any).damageCover(c.x + c.w / 2, c.y + c.h / 2, 20, BOSS.coverHp / 2);
    expect(c.t).toBeGreaterThan(0);
    (g as any).damageCover(c.x + c.w / 2, c.y + c.h / 2, 20, BOSS.coverHp);
    g.step(STEP, {});
    expect(g.iceWalls.includes(c)).toBe(false);
  });

  it('Carapaça bloqueia tiro de frente mas não pelas costas', () => {
    const shoot = (dir: number) => {
      const g = hunt();
      g.iceWalls = [];
      (g as any).spawnMinion('carapaca', { x: 640, y: 360 });
      const e = g.enemies.find((x) => x.kind === 'carapaca')!;
      e.x = 640;
      e.y = 360;
      e.stunT = 0;
      e.dir = dir;
      const hp = e.hp;
      g.bullets.push({ id: 9999, x: e.x - 30, y: e.y - GUN_Y, vx: 900, vy: 0, owner: 'h0', dmg: 20, life: 1, weapon: 'fuzil', pierce: false, fromEcho: false, hit: [] });
      const ev: string[] = [];
      for (let i = 0; i < 4; i++) {
        e.dir = dir;
        g.step(STEP, {});
        for (const x of g.drainEvents()) ev.push(x.type);
      }
      return { lost: hp - e.hp, blocked: ev.includes('block') };
    };
    const front = shoot(Math.PI); // olhando para quem atira
    const back = shoot(0);
    expect(front.blocked).toBe(true);
    expect(back.blocked).toBe(false);
    expect(back.lost).toBeGreaterThan(front.lost * 3);
  });

  it('Xamã cura o Chefe ferido', () => {
    const g = hunt();
    const b = g.boss!;
    b.hp = b.maxHp * 0.7;
    (g as any).spawnMinion('xama', { x: b.x, y: b.y + 80 });
    const x = g.enemies.find((e) => e.kind === 'xama')!;
    x.cd = 0;
    x.stunT = 0;
    const hp = b.hp;
    g.step(STEP, {});
    expect(b.hp).toBeGreaterThan(hp);
  });

  it('Chefe exausto não usa golpes e leva mais dano', () => {
    const g = hunt();
    const b = g.boss!;
    b.aim = 0;
    b.markT = 0;
    const h0 = b.hp;
    g.hurt(b, 20, 'h0', 'shot', Math.PI);
    const normal = h0 - b.hp;
    g.exhaust(b, 3);
    const h1 = b.hp;
    g.hurt(b, 20, 'h0', 'shot', Math.PI);
    expect(h1 - b.hp).toBeCloseTo(normal * BOSS.exhaustMult, 1);
  });

  it('número de criaturas vivas fica limitado (desempenho)', () => {
    const g = hunt();
    for (const p of g.players) if (!p.boss) p.invulnT = 999;
    const b = g.boss!;
    b.hp = b.maxHp * 0.3; // fase 3
    let peak = 0;
    for (let i = 0; i < 60 * 60; i++) {
      for (const p of g.players) if (!p.boss) p.invulnT = 5;
      g.step(STEP, {});
      peak = Math.max(peak, g.enemies.filter((e) => e.kind !== 'pylon').length);
      if (g.phase !== 'play') break;
    }
    expect(peak).toBeLessThanOrEqual(8);
    expect(g.bullets.length).toBeLessThanOrEqual(COMBAT.maxBullets);
  }, 30000);
});
