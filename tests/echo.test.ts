// Rebobinando e Ecos: fidelidade da gravação, rotas resumidas, limpeza, limite de tiros,
// desativação, aliados x adversários, pular a animação e desempenho com muitos Ecos.
import { describe, expect, it } from 'vitest';
import { Game, GameMode, Input, RosterEntry } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import * as C from '../src/game/constants';
import { COMBAT } from '../src/game/balance';
import { EchoRecorder, sampleRecording } from '../src/systems/echo/recorder';
import { EchoManager } from '../src/systems/echo/manager';
import { DIGEST_STEP_MS, digestAt, digestRecording, MARK_KINDS, nextMark, summarizeRound } from '../src/systems/echo/digest';
import type { EchoRecording } from '../src/shared/types';

const STEP = 1 / 60;

function fakeRecording(playerId: string, round: number, durMs: number, opts: { shootEvery?: number; x0?: number; y0?: number } = {}): EchoRecording {
  const r = new EchoRecorder(playerId, round, '#3ee8ff', 'kael');
  const x0 = opts.x0 ?? 400;
  const y0 = opts.y0 ?? 360;
  for (let t = 0; t <= durMs; t += 1000 / 60) {
    r.sample(t, x0 + Math.sin(t / 700) * 120, y0 + Math.cos(t / 900) * 80, 0, true);
    if (opts.shootEvery && Math.floor(t / opts.shootEvery) !== Math.floor((t - 1000 / 60) / opts.shootEvery)) r.event(t, 'shoot', { a: 0, w: 'blaster' });
  }
  return r.finish(durMs, x0, y0, 0);
}

function game(mode: GameMode, roster?: RosterEntry[]) {
  const g = new Game({ arena: getArena('lab'), humanChar: 'kael', bots: roster ? 0 : 2, difficulty: 'normal', ownEchoDamage: true, training: false, mode, roster });
  return g;
}

describe('gravação e reprodução', () => {
  it('o Eco passa exatamente pelos mesmos lugares no mesmo tempo', () => {
    const path = (t: number) => ({ x: 300 + t * 0.2, y: 200 + Math.sin(t / 300) * 90 });
    const r = new EchoRecorder('p', 1, '#fff', 'kael');
    for (let t = 0; t <= 5000; t += 1000 / 60) {
      const p = path(t);
      r.sample(t, p.x, p.y, 0, true);
    }
    const rec = r.finish(5000, path(5000).x, path(5000).y, 0);
    for (const t of [0, 333, 1234, 2500, 4321, 4999]) {
      const s = sampleRecording(rec, t);
      const p = path(t);
      expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeLessThan(1.6);
    }
  });

  it('rota resumida segue a gravação e as marcas ficam no tempo e lugar certos', () => {
    const rec = fakeRecording('p', 1, 6000, { shootEvery: 100 });
    rec.events.push({ t: 2500, action: 'bomb', tx: 10, ty: 10 });
    rec.events.sort((a, b) => a.t - b.t);
    const d = digestRecording(rec);
    expect(d.path.length / 2).toBe(Math.floor(6000 / DIGEST_STEP_MS) + 1);
    for (let i = 0; i < d.path.length / 2; i += 5) {
      const s = sampleRecording(rec, i * DIGEST_STEP_MS);
      expect(Math.abs(d.path[i * 2] - s.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(d.path[i * 2 + 1] - s.y)).toBeLessThanOrEqual(0.5);
    }
    // só ações reais: a contagem é a da gravação; tiros juntos a cada 350 ms nas marcas
    expect(d.counts.shoot).toBe(rec.events.filter((e) => e.action === 'shoot').length);
    const shotMarks = d.marks.filter((m) => MARK_KINDS[m[1]] === 'shoot');
    expect(shotMarks.length).toBeLessThan(d.counts.shoot);
    for (const m of d.marks) {
      expect(rec.events.some((e) => Math.round(e.t) === m[0] && MARK_KINDS.indexOf(e.action) === m[1])).toBe(true);
      const s = sampleRecording(rec, m[0]);
      expect(Math.hypot(m[2] - s.x, m[3] - s.y)).toBeLessThan(1);
    }
    const bomb = nextMark(d, 2200, 400, ['bomb']);
    expect(bomb?.[0]).toBe(2500);
    expect(nextMark(d, 2600, 400, ['bomb'])).toBeNull();
    const mid = digestAt(d, 1000)!;
    const s = sampleRecording(rec, 1000);
    expect(Math.hypot(mid.x - s.x, mid.y - s.y)).toBeLessThan(1);
  });

  it('resumo da rodada mostra quem caiu e o que fez (sem dar pontos)', () => {
    const a = digestRecording(fakeRecording('a', 2, 30000, { shootEvery: 500 }));
    const b = digestRecording(fakeRecording('b', 2, 12000));
    const lines = summarizeRound([a, b], 30000);
    expect(lines[0].survived).toBe(true);
    expect(lines[0].shots).toBe(a.counts.shoot);
    expect(lines[1].survived).toBe(false);
    expect(lines[1].fellAt).toBe(12);
    expect(Object.keys(lines[0])).not.toContain('points');
  });
});

describe('limpeza das gerações', () => {
  it('guarda as 3 últimas rodadas e descarta a mais antiga', () => {
    const m = new EchoManager(3);
    for (let r = 1; r <= 3; r++) expect(m.add(r, [fakeRecording('p', r, 2000)])).toHaveLength(0);
    expect(m.nextToExpire()?.round).toBe(1);
    const gone = m.add(4, [fakeRecording('p', 4, 2000)]);
    expect(gone.map((g) => g.round)).toEqual([1]);
    expect(m.generations.map((g) => g.round)).toEqual([2, 3, 4]);
  });
});

describe('Ecos numa partida', () => {
  it('fim da rodada: rotas resumidas, resumo e Ecos da próxima rodada iguais à gravação', () => {
    const g = game('combate');
    while (g.phase !== 'rewind') g.step(STEP, {});
    expect(g.lastDigests.length).toBe(g.lastRecordings.filter((r) => r.frames.length > 1).length);
    expect(g.roundEchoLines.length).toBe(g.lastDigests.length);
    for (const l of g.roundEchoLines) {
      const rec = g.lastRecordings.find((r) => r.playerId === l.playerId)!;
      expect(l.shots).toBe(rec.events.filter((e) => e.action === 'shoot').length);
    }
    while ((g.phase as string) !== 'play') g.step(STEP, {});
    expect(g.echoViews.length).toBeGreaterThan(0);
    expect([...g.echoDigests.keys()].sort()).toEqual(g.echoViews.map((e) => e.key).sort());
    for (let i = 0; i < 90; i++) g.step(STEP, {});
    for (const e of g.echoViews) {
      const s = sampleRecording(e.rec, g.roundT * 1000);
      expect(Math.hypot(e.x - s.x, e.y - s.y)).toBeLessThan(0.01);
    }
  }, 30000);

  it('pular o Rebobinando vai direto para a próxima rodada', () => {
    const g = game('nucleo');
    while (g.phase !== 'rewind') g.step(STEP, {});
    for (let i = 0; i < 20; i++) g.step(STEP, {});
    g.skipRewind();
    g.step(STEP, {});
    expect(g.phase).not.toBe('rewind');
    expect(g.round).toBe(2);
  }, 30000);

  it('nunca passa de 36 tiros de Eco ao mesmo tempo', () => {
    const g = game('combate');
    while (g.phase !== 'play') g.step(STEP, {});
    const recs = Array.from({ length: 8 }, (_, i) => fakeRecording('x' + i, 0, 60000, { shootEvery: 40, x0: 200 + i * 100 }));
    g.echoes.add(0, recs);
    (g as any).refreshEchoViews();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      g.step(STEP, {});
      peak = Math.max(peak, g.bullets.filter((b) => b.fromEcho).length);
    }
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThanOrEqual(COMBAT.maxEchoBullets);
  });

  it('desativado por 3 s e volta sozinho, com o tempo restante visível', () => {
    // sem bots: ninguém encosta no Eco com escudo e desativa de novo no meio do teste
    const g = game('combate', [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'p1', char: 'zoe', isBot: false },
    ]);
    while (g.phase !== 'play') g.step(STEP, {});
    g.echoes.add(0, [fakeRecording('x', 0, 60000)]);
    (g as any).refreshEchoViews();
    g.step(STEP, {});
    const e = g.echoViews[0];
    (g as any).disrupt(e, g.human);
    g.step(STEP, {});
    expect(e.disrupted).toBe(true);
    expect(e.offLeft).toBeGreaterThan(2.8);
    for (let i = 0; i < 60 * 1.5; i++) g.step(STEP, {});
    expect(e.offLeft).toBeLessThan(1.6);
    for (let i = 0; i < 60 * 1.6; i++) g.step(STEP, {});
    expect(e.disrupted).toBe(false);
  });

  it('em times, Eco do aliado não machuca; do adversário machuca e empurra', () => {
    const roster: RosterEntry[] = [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'a1', char: 'zoe', isBot: false },
      { id: 'b0', char: 'nyx', isBot: false },
      { id: 'b1', char: 'iris', isBot: false },
    ];
    const hitBy = (owner: string) => {
      const g = game('bandeira', roster);
      while (g.phase !== 'play') g.step(STEP, {});
      const me = g.human;
      const ally = g.players.find((p) => p.id !== me.id && p.team === me.team)!;
      const foe = g.players.find((p) => p.team !== me.team)!;
      const id = owner === 'ally' ? ally.id : foe.id;
      // Eco parado bem em cima do jogador
      const r = new EchoRecorder(id, 0, '#fff', 'kael');
      for (let t = 0; t <= 20000; t += 50) r.sample(t, me.x, me.y, 0, false);
      g.echoes.add(0, [r.finish(20000, me.x, me.y, 0)]);
      (g as any).refreshEchoViews();
      me.invulnT = 0;
      const hp = me.hp;
      const x = me.x;
      for (let i = 0; i < 5; i++) g.step(STEP, { mx: 0, my: 0 } as Input);
      return { lost: hp - me.hp, moved: Math.abs(me.x - x) + Math.abs(me.y - g.human.y) };
    };
    const ally = hitBy('ally');
    const foe = hitBy('foe');
    expect(ally.lost).toBe(0);
    expect(foe.lost).toBeGreaterThan(0);
  });

  it('Caça ao Chefe não grava Ecos nem rotas', () => {
    const g = game('chefe', [
      { id: 'h0', char: 'kael', isBot: true },
      { id: 'h1', char: 'zoe', isBot: true },
      { id: 'h2', char: 'iris', isBot: true },
      { id: 'boss', char: 'bruno', isBot: true, boss: true },
    ]);
    while (g.phase !== 'play') g.step(STEP, {});
    const b = g.boss!;
    g.hurt(b, b.hp + 10, 'h0', 'shot');
    for (let i = 0; i < 30 && g.phase === 'play'; i++) g.step(STEP, {});
    expect(g.lastDigests).toHaveLength(0);
    expect(g.echoViews).toHaveLength(0);
  });

  it('desempenho: 24 Ecos atirando continuam leves', () => {
    const g = game('combate');
    while (g.phase !== 'play') g.step(STEP, {});
    const recs = Array.from({ length: 24 }, (_, i) => fakeRecording('m' + i, (i % 3) + 1, 60000, { shootEvery: 200, x0: 150 + (i % 8) * 120, y0: 200 + Math.floor(i / 8) * 150 }));
    for (let r = 1; r <= 3; r++) g.echoes.add(r, recs.filter((x) => x.round === r));
    (g as any).refreshEchoViews();
    expect(g.echoViews.length).toBe(24);
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) g.step(STEP, {});
    const per = (performance.now() - t0) / 600;
    // eslint-disable-next-line no-console
    console.log('passo médio com 24 Ecos:', per.toFixed(2), 'ms');
    expect(per).toBeLessThan(4);
    expect(g.bullets.filter((b) => b.fromEcho).length).toBeLessThanOrEqual(COMBAT.maxEchoBullets);
  }, 30000);
});

void C;

describe('cores diferentes para cada jogador', () => {
  it('mesmo personagem: cada um ganha uma cor bem diferente (anel, nome e Eco)', async () => {
    const { colorDistance, MIN_COLOR_DISTANCE } = await import('../src/game/colors');
    const roster: RosterEntry[] = [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'p1', char: 'kael', isBot: false },
      { id: 'p2', char: 'kael', isBot: false },
      { id: 'p3', char: 'zoe', isBot: false },
    ];
    const g = game('combate', roster);
    const cols = g.players.map((p) => p.color);
    // o primeiro mantém a cor do personagem
    expect(cols[0]).toBe(g.players[0].char.color);
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) expect(colorDistance(cols[i], cols[j])).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
    // o Eco usa a cor do jogador
    while (g.phase !== 'rewind') g.step(STEP, {});
    for (const r of g.lastRecordings) expect(r.color).toBe(g.players.find((p) => p.id === r.playerId)!.color);
  }, 30000);

  it('online: o cliente chega nas mesmas cores que o servidor', async () => {
    const { ClientGame } = await import('../src/net/clientGame');
    const roster = [
      { id: 'a', char: 'kael', skin: 'padrao', trail: 'nenhum', name: 'Convidado', isBot: false },
      { id: 'b', char: 'kael', skin: 'padrao', trail: 'nenhum', name: 'Convidado', isBot: false },
      { id: 'c', char: 'luna', skin: 'padrao', trail: 'nenhum', name: 'C (bot)', isBot: true },
    ];
    const server = game('combate', roster.map((r) => ({ id: r.id, char: r.char, isBot: r.isBot, name: r.name })));
    const client = new ClientGame({ you: 'b', mode: 'combate', arena: 'lab', roster });
    expect(client.players.map((p) => p.color)).toEqual(server.players.map((p) => p.color));
    expect(new Set(client.players.map((p) => p.color)).size).toBe(3);
    expect(client.players.map((p) => p.name)).toEqual(server.players.map((p) => p.name));
    // Nyx (bot) não perde a própria cor por causa do segundo Kael
    expect(client.players[2].color).toBe(client.players[2].char.color);
  });

  it('nomes iguais ganham número', () => {
    const g = game('combate', [
      { id: 'p0', char: 'kael', isBot: false, name: 'Convidado' },
      { id: 'p1', char: 'zoe', isBot: false, name: 'Convidado' },
    ]);
    expect(g.players.map((p) => p.name)).toEqual(['Convidado', 'Convidado 2']);
  });

  it('personagens diferentes mantêm as cores originais', () => {
    const g = game('combate', [
      { id: 'p0', char: 'kael', isBot: false },
      { id: 'p1', char: 'zoe', isBot: false },
    ]);
    for (const p of g.players) expect(p.color).toBe(p.char.color);
  });
});

describe('cores parecidas de personagens diferentes', () => {
  it('Vesper e Voltz (dois amarelos) ficam com cores distintas', async () => {
    const { colorDistance, MIN_COLOR_DISTANCE } = await import('../src/game/colors');
    const g = game('combate', [
      { id: 'p0', char: 'zoe', isBot: false }, // Vesper
      { id: 'p1', char: 'leo', isBot: false }, // Voltz
    ]);
    expect(g.players[1].char.name).toBe('Voltz');
    expect(g.players[0].color).toBe(g.players[0].char.color);
    expect(g.players[1].color).not.toBe(g.players[1].char.color);
    expect(colorDistance(g.players[0].color, g.players[1].color)).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
  });
});
