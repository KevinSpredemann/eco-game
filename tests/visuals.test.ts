import { describe, expect, it } from 'vitest';
import { corpsePose, gritSpecks } from '../src/render/visuals';

describe('detalhe visual', () => {
  it('a sujeira do chão fica no mesmo lugar para o mesmo mapa', () => {
    const a = gritSpecks(42, 20, 100, 80);
    const b = gritSpecks(42, 20, 100, 80);
    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    expect(a.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 80)).toBe(true);
    expect(gritSpecks(7, 20, 100, 80)[0].x).not.toBe(a[0].x);
  });

  it('a criatura achata e some ao morrer', () => {
    const start = corpsePose(0);
    const mid = corpsePose(0.35);
    const end = corpsePose(0.7);
    expect(start.alpha).toBe(1);
    expect(start.squash).toBe(1);
    expect(mid.squash).toBeLessThan(start.squash);
    expect(mid.dy).toBeGreaterThan(0);
    expect(end.alpha).toBe(0);
    expect(end.done).toBe(true);
  });
});