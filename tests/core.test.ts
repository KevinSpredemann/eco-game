import { describe, expect, it } from 'vitest';
import { EchoRecorder, SAMPLE_MS, sampleRecording, upcomingEvent } from '../src/systems/echo/recorder';
import { EchoManager } from '../src/systems/echo/manager';
import { deliveryPoints, leaders, needsTiebreak, ranking } from '../src/systems/scoring';

function recordLine(round = 1) {
  const r = new EchoRecorder('p1', round, '#0ff', 'kael');
  for (let t = 0; t <= 1000; t += 1000 / 60) r.sample(t, t / 10, 0, 0, true);
  return r.finish(1000, 100, 0, 0);
}

describe('gravação', () => {
  it('amostra em intervalo fixo com timestamp', () => {
    const rec = recordLine();
    const gaps = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i].t);
    expect(rec.frames[0].t).toBe(0);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(SAMPLE_MS + 17);
    expect(rec.endT).toBe(1000);
  });

  it('reproduz no mesmo ritmo, interpolando', () => {
    const rec = recordLine();
    const s = sampleRecording(rec, 500);
    expect(s.x).toBeCloseTo(50, 0);
    expect(s.active).toBe(true);
  });

  it('termina sem teleporte: para no último ponto e fica inativo', () => {
    const rec = recordLine();
    const s = sampleRecording(rec, 5000);
    expect(s.x).toBe(100);
    expect(s.active).toBe(false);
  });

  it('não interpola através de um salto (portal)', () => {
    const r = new EchoRecorder('p', 1, '#fff', 'zoe');
    r.sample(0, 0, 0, 0, true);
    r.sample(50, 10, 0, 0, true);
    r.markJump();
    r.sample(60, 500, 500, 0, true);
    r.sample(110, 510, 500, 0, true);
    const rec = r.finish(200, 520, 500, 0);
    const mid = sampleRecording(rec, 55);
    expect(mid.x).toBe(10);
    expect(sampleRecording(rec, 60).x).toBe(500);
  });

  it('guarda eventos para o pulso de aviso', () => {
    const r = new EchoRecorder('p', 1, '#fff', 'kael');
    r.sample(0, 0, 0, 0, false);
    r.event(400, 'dash');
    const rec = r.finish(1000, 0, 0, 0);
    expect(upcomingEvent(rec, 0, 500, 'dash')).toBe(400);
    expect(upcomingEvent(rec, 0, 300, 'dash')).toBeNull();
  });
});

describe('limite de Ecos', () => {
  it('mantém no máximo 3 gerações e devolve as removidas', () => {
    const m = new EchoManager(3);
    for (let round = 1; round <= 3; round++) expect(m.add(round, [recordLine(round)])).toHaveLength(0);
    expect(m.nextToExpire()?.round).toBe(1);
    const removed = m.add(4, [recordLine(4)]);
    expect(removed.map((g) => g.round)).toEqual([1]);
    expect(m.generations.map((g) => g.round)).toEqual([2, 3, 4]);
    expect(m.ageOf(4)).toBe(0);
    expect(m.ageOf(2)).toBe(2);
  });
});

describe('pontuação', () => {
  it('entregar energia vale 3 por fragmento', () => {
    expect(deliveryPoints(1)).toBe(3);
    expect(deliveryPoints(3)).toBe(9);
    expect(deliveryPoints(-2)).toBe(0);
  });
  it('detecta empate na liderança', () => {
    const lines = [
      { id: 'a', score: 7 },
      { id: 'b', score: 9 },
      { id: 'c', score: 9 },
    ];
    expect(leaders(lines)).toEqual(['b', 'c']);
    expect(needsTiebreak(lines)).toBe(true);
    expect(ranking(lines).map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });
});
