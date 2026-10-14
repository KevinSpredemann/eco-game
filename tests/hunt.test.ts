// Rebalanceamento: vida/regeneração, limites de controle, Ecos, IA dos bots e Caça ao Chefe (criaturas, cobertura, exaustão).
import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { COMBAT } from '../src/game/balance';
import { PROFILES } from '../src/game/bot';
import { BOMB_DAMAGE, ECHO_DAMAGE_MULT, MAX_HP, MINE_DAMAGE } from '../src/game/weapons';

const STEP = 1 / 60;

function duel(diff: 'facil' | 'normal' | 'dificil' = 'normal') {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kael',
    bots: 0,
    difficulty: diff,
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'b0', char: 'zoe', isBot: true },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, {});
  return g;
}

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
