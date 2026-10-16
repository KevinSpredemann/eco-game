import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { PROFILES } from '../src/game/bot';

const STEP = 1 / 60;
const WINDOW = 40;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function measure(diff: 'facil' | 'normal' | 'dificil') {
  const prev = Math.random;
  Math.random = mulberry32(0x51ed);
  try {
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
    let dealt = 0;
    let taken = 0;
    let shots = 0;
    let hits = 0;
    let combos = 0;
    for (let t = 0; t < WINDOW; t += STEP) {
      const me = g.players[0];
      const bot = g.players[1];
      me.hp = me.maxHp;
      bot.hp = bot.maxHp;
      const a = t * 0.8;
      const aim = Math.atan2(bot.y - me.y, bot.x - me.x);
      const input: Input = { mx: Math.cos(a) * 0.6, my: Math.sin(a) * 0.6, dash: false, ability: false, fire: false, aim, ca: aim };
      g.step(STEP, input);
      for (const e of g.drainEvents()) {
        if (e.type === 'shoot' && e.pid === 'b0') shots++;
        if (e.type === 'skill' && e.pid === 'b0') shots++;
        if (e.type === 'dmg' && e.k === 'hp' && e.pid === 'p0') {
          dealt += e.n;
          hits++;
        }
        if (e.type === 'dmg' && e.k === 'hp' && e.pid === 'b0') taken += e.n;
        if (e.type === 'combo' && e.pid === 'b0') combos++;
      }
    }
    const dpm = (dealt / WINDOW) * 60;
    const takenDpm = (taken / WINDOW) * 60;
    return { dealt, taken, dpm, takenDpm, shots, hits, hitRate: shots ? hits / shots : 0, comboRate: hits ? combos / hits : 0, length: WINDOW };
  } finally {
    Math.random = prev;
  }
}

describe('métricas de combate dos bots', () => {
  it('dificuldade muda conduta, não vida nem dano, e o fácil acerta menos', () => {
    expect(PROFILES.facil.speedMul).toBe(1);
    expect(PROFILES.normal.speedMul).toBe(1);
    expect(PROFILES.dificil.speedMul).toBe(1);
    const easy = measure('facil');
    const normal = measure('normal');
    const hard = measure('dificil');
    const line = (name: string, m: ReturnType<typeof measure>) =>
      `${name} DPM causado ${m.dpm.toFixed(1)} DPM recebido ${m.takenDpm.toFixed(1)} duração ${m.length}s tiros ${m.shots} acertos ${m.hits} taxa ${m.hitRate.toFixed(2)} combos ${m.comboRate.toFixed(2)}`;
    console.log(line('fácil', easy));
    console.log(line('normal', normal));
    console.log(line('difícil', hard));
    // O passo mais curto muda qual golpe conecta. A taxa de acerto ainda sobe com a dificuldade.
    expect(easy.hitRate).toBeLessThan(normal.hitRate);
    expect(normal.hitRate).toBeLessThan(hard.hitRate);
    expect(easy.dealt).toBeLessThan(hard.dealt);
    expect(normal.dealt).toBeLessThan(hard.dealt);
    expect(easy.dealt).toBeLessThan(hard.dealt * 0.85);
  }, 30000);
});
