import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { PROFILES } from '../src/game/bot';
import {
  TUNE_IDS,
  mirrorRest,
  spinEcho,
  tideFlooded,
  tuneBlocks,
  tuneClock,
  tuneHint,
  tuneHides,
  tuneMove,
  tuneShapes,
  tuneSteer,
  tuneTouch,
} from '../src/game/mapTune';
import { encodeSnapshot } from '../src/net/protocol';
import { ClientGame } from '../src/net/clientGame';
import type { EchoRecording } from '../src/shared/types';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function open(id: string) {
  const g = new Game({
    arena: getArena(id),
    humanChar: 'lyra',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roundSec: 40,
    suddenSec: 8,
    roster: [
      { id: 'a', char: 'lyra', isBot: false },
      { id: 'b', char: 'rufo', isBot: false },
    ],
  });
  const inputs = { a: idle, b: idle };
  while (g.phase !== 'play') g.step(STEP, inputs);
  for (const p of g.players) p.invulnT = 0;
  return g;
}

function who(g: Game, id: string) {
  return g.players.find((p) => p.id === id)!;
}

function place(g: Game, id: string, x: number, y: number) {
  const p = who(g, id);
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  return p;
}

function go(g: Game, t: number, inputs: Record<string, Input> = { a: idle, b: idle }, n = 1) {
  g.worldT = t - STEP;
  for (let i = 0; i < n; i++) g.step(STEP, inputs);
}

describe('relógio dos mapas', () => {
  it('cada ficha avisa antes de ligar, no período da folha', () => {
    const at = (id: string, t: number) => tuneClock(getArena(id), t);
    expect(at('anfiteatro', 0)).toMatchObject({ phase: 'warn', index: 0 });
    expect(at('anfiteatro', 1.5)).toMatchObject({ phase: 'on', index: 0 });
    expect(at('anfiteatro', 3)).toMatchObject({ phase: 'idle', index: 0 });
    expect(at('anfiteatro', 7)).toMatchObject({ phase: 'warn', index: 1 });

    expect(at('biblioteca', 0).phase).toBe('warn');
    expect(at('biblioteca', 1.5).phase).toBe('on');
    expect(at('biblioteca', 2.7).phase).toBe('idle');
    expect(at('biblioteca', 10)).toMatchObject({ phase: 'warn', index: 1 });

    expect(at('camara', 0).phase).toBe('warn');
    expect(at('camara', 1.5)).toMatchObject({ phase: 'on', index: 0 });
    expect(at('camara', 5.5).phase).toBe('idle');
    expect(at('camara', 10).index).toBe(1);

    expect(at('caverna', 0).phase).toBe('warn');
    expect(at('caverna', 1.5).phase).toBe('on');
    expect(at('caverna', 2.4).phase).toBe('idle');
    expect(at('caverna', 9).index).toBe(1);

    expect(at('jardim', 0).phase).toBe('warn');
    expect(at('jardim', 1.5).phase).toBe('on');
    expect(at('jardim', 2.3).phase).toBe('idle');
    expect(at('jardim', 8).index).toBe(1);

    expect(at('vinil', 0).phase).toBe('idle');
    expect(at('vinil', 12)).toMatchObject({ phase: 'warn', index: 1 });
    expect(at('vinil', 13.5).phase).toBe('on');
    expect(at('vinil', 14.7)).toMatchObject({ phase: 'idle', index: 2 });

    expect(at('recife', 0)).toMatchObject({ phase: 'idle', index: 0 });
    expect(at('recife', 4.5).phase).toBe('warn');
    expect(at('recife', 6)).toMatchObject({ phase: 'on', index: 1 });
    expect(at('recife', 10.5).phase).toBe('warn');
    expect(tideFlooded(3)).toBe(false);
    expect(tideFlooded(7)).toBe(true);
    expect(at('metronomo', 0)).toMatchObject({ phase: 'on', index: 0 });
    expect(at('metronomo', 2.2).index).toBe(2);
  });

  it('a partida avisa e só então liga o anel', () => {
    const g = open('anfiteatro');
    g.events = [];
    go(g, 7);
    expect(g.events.some((e) => e.type === 'hazardWarn')).toBe(true);
    expect(g.events.some((e) => e.type === 'hazardOn')).toBe(false);
    g.events = [];
    go(g, 8.5);
    expect(g.events.some((e) => e.type === 'hazardOn')).toBe(true);
    for (const p of g.players) expect(p.hp).toBe(p.maxHp);
  });

  it('a dica curta é a frase do mapa', () => {
    for (const id of TUNE_IDS) {
      expect(tuneHint(id).length).toBeGreaterThan(12);
      expect(getArena(id).gimmick).toBe(tuneHint(id));
    }
    expect(tuneHint('lab')).toBe('');
  });
});

describe('efeitos, uma vez e sem dano', () => {
  it('o anel acelera quem está em cima e abafa quem está fora, sem tirar vida', () => {
    const arena = getArena('anfiteatro');
    expect(tuneMove(arena, 780, 360, 2)).toMatchObject({ speed: 1.08, grip: 1.25 });
    expect(tuneMove(arena, 900, 360, 2).speed).toBe(0.92);
    expect(tuneMove(arena, 700, 360, 2)).toMatchObject({ speed: 1, grip: 1 });
    expect(tuneMove(arena, 640, 220, 2).speed).toBe(1);

    const walk = (x: number) => {
      const g = open('anfiteatro');
      const p = place(g, 'a', x, 360);
      place(g, 'b', 200, 620);
      const hp = p.hp;
      go(g, 2, { a: { ...idle, mx: 1 }, b: idle }, 24);
      expect(p.hp).toBe(hp);
      return p.x - x;
    };
    const on = walk(780);
    const off = walk(900);
    expect(on).toBeGreaterThan(off * 1.08);
  });

  it('dois humanos no mesmo anel andam igual, e o bot não tem pressa extra', () => {
    const run = () => {
      const g = open('anfiteatro');
      const p = place(g, 'a', 780, 360);
      place(g, 'b', 200, 620);
      go(g, 2, { a: { ...idle, mx: 1 }, b: idle }, 20);
      return { x: Math.round(p.x * 10) / 10, hp: p.hp };
    };
    expect(run()).toEqual(run());
    expect(PROFILES.facil.speedMul).toBe(1);
    expect(PROFILES.normal.speedMul).toBe(1);
    expect(PROFILES.dificil.speedMul).toBe(1);
    const bot = new Game({
      arena: getArena('anfiteatro'),
      humanChar: 'lyra',
      bots: 0,
      difficulty: 'dificil',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'a', char: 'lyra', isBot: false },
        { id: 'b', char: 'rufo', isBot: true },
      ],
    });
    expect(who(bot, 'b').brain!.speedMul).toBe(1);
    const spot = tuneMove(getArena('anfiteatro'), 780, 360, 2);
    expect(spot.speed).toBe(1.08);
  });

  it('a página empurra uma vez e a lombada corta o tiro', () => {
    const book = getArena('biblioteca');
    const g = open('biblioteca');
    const p = place(g, 'a', 560, 360);
    place(g, 'b', 200, 120);
    const hp = p.hp;
    go(g, 1.5);
    expect(p.x).toBeLessThan(500);
    expect(p.hp).toBe(hp);
    expect(g.tuneOnce.has('a:pagina-0')).toBe(true);
    const x = p.x;
    p.vx = 0;
    p.vy = 0;
    g.step(STEP, { a: idle, b: idle });
    expect(Math.abs(p.x - x)).toBeLessThan(4);
    expect(g.tuneOnce.size).toBe(1);

    expect(tuneBlocks(book, 500, 360, 760, 360, 2)).toBe(true);
    expect(tuneBlocks(book, 500, 360, 760, 360, 4)).toBe(false);

    const blocked = open('biblioteca');
    const src = place(blocked, 'a', 600, 360);
    const dst = place(blocked, 'b', 680, 360);
    go(blocked, 2, { a: { ...idle, fire: true, aim: 0, ca: 0 }, b: idle }, 18);
    expect(dst.hp).toBe(dst.maxHp);
    expect(src.hp).toBe(src.maxHp);

    const openPage = open('biblioteca');
    place(openPage, 'a', 600, 360);
    const victim = place(openPage, 'b', 680, 360);
    go(openPage, 4, { a: { ...idle, fire: true, aim: 0, ca: 0 }, b: idle }, 18);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it('a cabine fechada corta o tiro na borda e não grava quem está dentro', () => {
    const room = getArena('camara');
    expect(tuneBlocks(room, 320, 96, 140, 96, 2)).toBe(true);
    expect(tuneBlocks(room, 180, 96, 120, 96, 2)).toBe(false);
    expect(tuneHides(room, 140, 120, 2)).toBe(true);
    expect(tuneHides(room, 140, 120, 0.4)).toBe(false);

    const blocked = open('camara');
    place(blocked, 'a', 320, 120);
    const inside = place(blocked, 'b', 140, 120);
    go(blocked, 2, { a: { ...idle, fire: true, aim: Math.PI, ca: Math.PI }, b: idle }, 20);
    expect(inside.hp).toBe(inside.maxHp);

    const quiet = open('camara');
    place(quiet, 'a', 200, 120);
    const heard = place(quiet, 'b', 110, 120);
    go(quiet, 2, { a: { ...idle, fire: true, aim: Math.PI, ca: Math.PI }, b: idle }, 16);
    expect(heard.hp).toBeLessThan(heard.maxHp);

    const g = open('camara');
    const hidden = place(g, 'a', 140, 120);
    const shown = place(g, 'b', 640, 400);
    go(g, 2, { a: idle, b: idle }, 70);
    expect(hidden.recorder!.recording.frames).toHaveLength(0);
    expect(shown.recorder!.recording.frames.length).toBeGreaterThan(4);
    expect(hidden.hp).toBe(hidden.maxHp);
  });

  it('o gongo e o diapasão marcam a lentidão ou a pressa uma vez', () => {
    const cave = open('caverna');
    const p = place(cave, 'a', 438, 180);
    place(cave, 'b', 200, 620);
    go(cave, 1.55);
    const hold = cave.tuneHold.get('a');
    expect(hold?.speed).toBe(0.85);
    expect(hold?.until).toBeCloseTo(1.55 + 1.5, 2);
    const until = hold!.until;
    const marked = cave.tuneOnce.size;
    for (let i = 0; i < 8; i++) cave.step(STEP, { a: idle, b: idle });
    expect(cave.tuneHold.get('a')!.until).toBe(until);
    expect(cave.tuneOnce.size).toBe(marked);
    expect(p.hp).toBe(p.maxHp);
    expect(tuneTouch(getArena('caverna'), 438, 180, 1.55)?.pulse).toBe('gongo-0');

    const garden = open('jardim');
    const q = place(garden, 'a', 300, 360);
    place(garden, 'b', 200, 620);
    go(garden, 1.88);
    expect(garden.tuneHold.get('a')?.speed).toBe(1.12);
    const forkUntil = garden.tuneHold.get('a')!.until;
    garden.step(STEP, { a: idle, b: idle });
    expect(garden.tuneHold.get('a')!.until).toBe(forkUntil);
    expect(q.hp).toBe(q.maxHp);
  });

  it('o disco leva quem está no sulco, horário, e o selo fica quieto', () => {
    const disc = open('vinil');
    const p = place(disc, 'a', 790, 360);
    place(disc, 'b', 200, 140);
    const hp = p.hp;
    go(disc, 0, { a: idle, b: idle }, 60);
    expect(p.y).toBeGreaterThan(375);
    expect(p.hp).toBe(hp);
    expect(getArena('vinil').conveyors).toEqual([]);

    const label = open('vinil');
    const q = place(label, 'a', 680, 360);
    place(label, 'b', 200, 140);
    go(label, 0, { a: idle, b: idle }, 60);
    expect(Math.hypot(q.x - 680, q.y - 360)).toBeLessThan(2);

    const spun = spinEcho(790, 360, 0, 0, 1);
    expect(spun.y).toBeGreaterThan(370);
    expect(spinEcho(680, 360, 0, 0, 1)).toEqual({ x: 680, y: 360 });
    expect(spinEcho(200, 360, 0, 0, 1)).toEqual({ x: 200, y: 360 });

    const sweep = open('vinil');
    const r = place(sweep, 'a', 716, 334);
    place(sweep, 'b', 200, 140);
    go(sweep, 13.5);
    expect(sweep.tuneOnce.has('a:agulha-0')).toBe(true);
    expect(r.hp).toBe(r.maxHp);
    const x = r.x;
    r.vx = 0;
    r.vy = 0;
    sweep.step(STEP, { a: idle, b: idle });
    expect(Math.abs(r.x - x)).toBeLessThan(6);
  });

  it('a maré alta deixa o banco mais lento e não abre um buraco', () => {
    const g = open('recife');
    const bank = place(g, 'a', 410, 264);
    const isle = place(g, 'b', 200, 160);
    const hpA = bank.hp;
    const hpB = isle.hp;
    go(g, 7, { a: { ...idle, mx: 1 }, b: { ...idle, mx: 1 } }, 12);
    const da = bank.x - 410;
    const db = isle.x - 200;
    expect(da).toBeGreaterThan(8);
    expect(db).toBeGreaterThan(da * 1.2);
    expect(bank.hp).toBe(hpA);
    expect(isle.hp).toBe(hpB);
    expect(bank.deaths).toBe(0);
    expect(isle.deaths).toBe(0);
    expect(tuneMove(getArena('recife'), 450, 264, 7).speed).toBe(0.65);
    expect(tuneMove(getArena('recife'), 120, 120, 7).speed).toBe(1);
    expect(tuneSteer(getArena('recife'), 450, 264, 7).avoid).toBe(true);
    expect(tuneSteer(getArena('recife'), 450, 264, 2).avoid).toBe(false);
  });

  it('o pêndulo empurra uma vez por meia batida e a marca firme não tira vida', () => {
    const amp = (55 * Math.PI) / 180;
    const t = 0.25;
    const th = Math.sin(Math.PI * t) * amp;
    const tipX = 640 + Math.sin(th) * 260;
    const tipY = 200 + Math.cos(th) * 260;
    const px = 640 + (tipX - 640) * 0.7;
    const py = 200 + (tipY - 200) * 0.7;
    const g = open('metronomo');
    const p = place(g, 'a', px, py);
    place(g, 'b', 200, 600);
    const hp = p.hp;
    const x0 = p.x;
    go(g, t);
    expect(p.x).toBeGreaterThan(x0 + 20);
    expect(p.hp).toBe(hp);
    expect([...g.tuneOnce].some((k) => k.startsWith('a:pendulo-'))).toBe(true);
    const x = p.x;
    p.vx = 0;
    p.vy = 0;
    g.step(STEP, { a: idle, b: idle });
    expect(Math.abs(p.x - x)).toBeLessThan(4);

    expect(tuneMove(getArena('metronomo'), 640, 500, 2)).toMatchObject({ speed: 1.1, grip: 1.3 });
    const mark = open('metronomo');
    const m = place(mark, 'a', 640, 500);
    place(mark, 'b', 200, 600);
    go(mark, 2, { a: { ...idle, mx: 1 }, b: idle }, 8);
    expect(m.hp).toBe(m.maxHp);
    expect(m.x).toBeGreaterThan(640);
  });

  it('a rota no livro espelha uma vez', () => {
    const rec: EchoRecording = {
      playerId: 'a',
      round: 1,
      color: '#fff',
      characterId: 'lyra',
      frames: [
        { t: 0, x: 560, y: 360, direction: 0, moving: true },
        { t: 100, x: 600, y: 360, direction: 0, moving: true },
      ],
      events: [],
      endT: 100,
    };
    expect(mirrorRest(rec, 0, 'pagina-0')).toBe(true);
    expect(rec.frames[0].x).toBe(1280 - 560);
    expect(rec.frames[1].x).toBe(1280 - 600);
    expect(mirrorRest(rec, 0, 'pagina-0')).toBe(false);
  });
});

describe('bots, desenho e snapshot', () => {
  it('o bot desvia do livro e procura o anel, o diapasão e a cabine', () => {
    expect(tuneSteer(getArena('biblioteca'), 640, 360, 1).avoid).toBe(true);
    expect(tuneSteer(getArena('biblioteca'), 200, 120, 1).avoid).toBe(false);
    const ring = tuneSteer(getArena('anfiteatro'), 780, 360, 1).seek;
    expect(ring).not.toBeNull();
    expect(Math.hypot(ring!.x - 640, ring!.y - 360)).toBeCloseTo(140, 0);
    expect(tuneSteer(getArena('jardim'), 400, 360, 0.5).seek).toEqual({ x: 200, y: 360 });
    expect(tuneSteer(getArena('camara'), 400, 300, 0.4).seek).toEqual({ x: 100, y: 100 });
    expect(tuneSteer(getArena('metronomo'), 640, 400, 0).avoid).toBe(true);
  });

  it('Reduzir efeitos tira o enfeite e deixa o aviso', () => {
    const cave = getArena('caverna');
    expect(tuneShapes(cave, 0.4, true).some((s) => s.kind === 'dot' && s.alpha >= 0.8)).toBe(true);
    expect(tuneShapes(cave, 4, true).some((s) => s.kind === 'dot')).toBe(false);
    expect(tuneShapes(cave, 4, false).some((s) => s.kind === 'dot')).toBe(true);
    const ring = tuneShapes(getArena('anfiteatro'), 2, true);
    expect(ring.some((s) => s.kind === 'ring')).toBe(true);
    expect(ring.some((s) => s.kind === 'dot')).toBe(false);
    expect(tuneShapes(getArena('vinil'), 12.2, true).some((s) => s.layer === 'air')).toBe(true);
  });

  it('duas sims iguais geram o mesmo snapshot, e o cliente lê a posição', () => {
    const snapOf = () => {
      let s = 42;
      const prev = Math.random;
      Math.random = () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
      try {
        const g = open('vinil');
        place(g, 'a', 790, 360);
        place(g, 'b', 200, 140);
        go(g, 0, { a: idle, b: idle }, 40);
        return { g, snap: encodeSnapshot(g, false) };
      } finally {
        Math.random = prev;
      }
    };
    const left = snapOf();
    const right = snapOf();
    expect(left.snap.P).toEqual(right.snap.P);
    expect(left.snap.wt).toBe(right.snap.wt);
    expect(left.snap.E).toEqual(right.snap.E);
    const client = new ClientGame({
      you: 'a',
      mode: 'duelo',
      arena: 'vinil',
      roster: [
        { id: 'a', char: 'lyra', skin: 'padrao', trail: 'nenhum', name: 'A', isBot: false },
        { id: 'b', char: 'rufo', skin: 'padrao', trail: 'nenhum', name: 'B', isBot: false },
      ],
    });
    client.applySnapshot(left.snap, []);
    const server = who(left.g, 'a');
    const local = client.players.find((p) => p.id === 'a')!;
    expect(Math.abs(local.x - server.x)).toBeLessThan(0.2);
    expect(Math.abs(local.y - server.y)).toBeLessThan(0.2);
  });
});
