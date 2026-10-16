import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { FFA, capAoe, ffaCall, spectateCycle } from '../src/game/ffa';
import { playFinisher } from '../src/game/finisher';
import { AbilityVfx, VFX_CAP, VFX_CAP_LOW } from '../src/render/abilityVfx';
import { ENERGY_MAX } from '../src/game/elements';
import { plannedLobbySize } from '../src/net/quickLobby';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function room() {
  const chars = ['kai', 'luna', 'vexa', 'nara'];
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'kai',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: true,
    mode: 'todos',
    roundSec: 30,
    suddenSec: 8,
    roster: [
      ...chars.map((char, i) => ({ id: 'p' + i, char, isBot: false, skin: 'padrao', trail: 'nenhum' })),
      { id: 'bot', char: 'kael', isBot: true, skin: 'padrao', trail: 'nenhum' },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, {});
  for (const p of g.players) p.invulnT = 0;
  g.drainEvents();
  return g;
}

describe('Todos Contra Todos', () => {
  it('a meta, o tempo e o texto do cartão ficam num lugar só', () => {
    expect(FFA.kills).toBe(10);
    expect(FFA.dur).toBe(300);
    expect(FFA.minPlayers).toBe(4);
    expect(FFA.maxPlayers).toBe(8);
    expect(FFA.desc).toBe('Entre na arena, domine seus poderes e elimine todos os adversários. Apenas o mais habilidoso será o vencedor.');
    expect(ffaCall({ kills: [10, 4, 4, 1], roundT: 10, dur: 300, sudden: false, suddenT: 0, suddenLimit: 45 }).call).toBe('win');
    expect(ffaCall({ kills: [3, 3, 1, 0], roundT: 300, dur: 300, sudden: false, suddenT: 0, suddenLimit: 45 }).call).toBe('sudden');
    expect(ffaCall({ kills: [3, 3, 1, 0], roundT: 300, dur: 300, sudden: true, suddenT: 45, suddenLimit: 45 }).call).toBe('share');
    expect(ffaCall({ kills: [4, 3, 1, 0], roundT: 300, dur: 300, sudden: true, suddenT: 2, suddenLimit: 45 }).call).toBe('win');
  });

  it('a sala não completa com bot e todo mundo é inimigo', () => {
    expect(plannedLobbySize({ mode: 'todos', humans: 5, bots: 3, fill: true })).toBe(5);
    expect(plannedLobbySize({ mode: 'duelo', humans: 1, bots: 0, fill: true })).toBe(2);
    const g = room();
    expect(g.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(g.players.every((p) => !p.isBot && p.team < 0)).toBe(true);
    for (const a of g.players) {
      expect(g.hostile(a, a)).toBe(false);
      for (const b of g.players) if (a !== b) expect(g.hostile(a, b)).toBe(true);
    }
  });

  it('o próprio golpe não tira vida e a eliminação soma um', () => {
    const g = room();
    const [a, b] = g.players;
    const hp = a.hp;
    g.hurt(a, 40, a.id, 'blast');
    expect(a.hp).toBe(hp);
    g.hurt(b, b.maxHp, a.id, 'shot');
    expect(a.kills).toBe(1);
    expect(b.alive).toBe(false);
    g.hurt(b, 40, a.id, 'shot');
    expect(a.kills).toBe(1);
  });

  it('dez eliminações fecham, e o empate no tempo divide depois da súbita', () => {
    const g = room();
    const [a, b] = g.players;
    a.kills = 9;
    g.hurt(b, b.maxHp, a.id, 'shot');
    g.step(STEP, {});
    expect(g.phase).toBe('results');
    expect(g.winners).toEqual(['p0']);

    const tie = room();
    tie.players[0].kills = 3;
    tie.players[1].kills = 3;
    tie.roundT = tie.roundDur;
    tie.step(STEP, {});
    expect(tie.phase).toBe('play');
    expect(tie.sudden).toBe(true);
    tie.suddenT = tie.suddenLimit;
    tie.step(STEP, {});
    expect(tie.phase).toBe('results');
    expect(tie.winners.sort()).toEqual(['p0', 'p1']);
  });

  it('a área do todos para nos mais perto e o x1 continua acertando todos', () => {
    const pile = (mode: 'todos' | 'duelo') => {
      const roster = ['nara', 'kai', 'luna', 'vexa', 'kael'].map((char, i) => ({ id: 'p' + i, char, isBot: false as const, skin: 'padrao', trail: 'nenhum' }));
      const g = new Game({ arena: getArena('lab'), humanChar: 'nara', bots: 0, difficulty: 'normal', ownEchoDamage: false, training: true, mode, roundSec: 30, suddenSec: 8, roster });
      while (g.phase !== 'play') g.step(STEP, {});
      const [a, ...foes] = g.players;
      a.x = 400;
      a.y = 360;
      a.invulnT = 0;
      a.energy = ENERGY_MAX;
      a.powerCd.fill(0);
      foes.forEach((p, i) => {
        p.x = 430 + i * 12;
        p.y = 360;
        p.invulnT = 0;
        p.hp = p.maxHp;
      });
      const pad = Object.fromEntries(g.players.map((p) => [p.id, idle]));
      pad.p0 = { ...idle, skill: true, aim: 0, ca: 0, cr: 40 };
      g.step(STEP, pad);
      return foes.filter((p) => p.hp < p.maxHp).map((p) => p.id);
    };
    expect(pile('todos')).toHaveLength(FFA.aoeCap);
    expect(pile('duelo')).toHaveLength(4);
    const near = [
      { id: 'd', x: 9, y: 0 },
      { id: 'c', x: 3, y: 0 },
      { id: 'a', x: 1, y: 0 },
      { id: 'b', x: 2, y: 0 },
    ];
    expect(capAoe('todos', near, 0, 0).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(capAoe('duelo', near, 0, 0)).toHaveLength(4);
  });

  it('o final sai no kill de combo confirmado e a câmera troca de alvo', () => {
    expect(playFinisher(true, false)).toBe(false);
    expect(playFinisher(true, true)).toBe(true);
    expect(playFinisher(false, false)).toBe(true);
    const g = room();
    const [a, b] = g.players;
    g.hurt(b, b.maxHp, a.id, 'shot');
    expect(g.drainEvents().some((e) => e.type === 'finisher')).toBe(false);
    expect(spectateCycle(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(spectateCycle(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(spectateCycle(['a', 'b', 'c'], null, 1)).toBe('a');
    const fx = new AbilityVfx();
    expect(fx.cap()).toBe(VFX_CAP);
    expect(VFX_CAP).toBe(220);
    expect(VFX_CAP_LOW).toBe(60);
    fx.setCrowd(true);
    expect(fx.cap()).toBe(FFA.fxCap);
    fx.setReduced(true);
    expect(fx.cap()).toBe(VFX_CAP_LOW);
  });

  it('atacar acaba com a proteção de renascimento', () => {
    const g = room();
    const a = g.players[0];
    a.invulnT = 2;
    g.step(STEP, { p0: { ...idle, ability: true, aim: 0, ca: 0 }, p1: idle, p2: idle, p3: idle });
    expect(a.invulnT).toBe(0);
  });
});
