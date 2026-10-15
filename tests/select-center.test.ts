import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/characters';
import { paintSelectCenter } from '../src/ui/portraits';

/** Contexto que só registra o desenho. Sem isso o vitest (node) não tem canvas. */
function traceOf(c: (typeof CHARACTERS)[number]): string[] {
  const log: string[] = [];
  const grad = () => ({
    addColorStop(offset: number, color: string) {
      log.push(`stop:${offset}:${color}`);
    },
  });
  const ctx: Record<string, unknown> = {
    createLinearGradient: () => grad(),
    createRadialGradient: () => grad(),
    measureText: () => ({ width: 0 }),
  };
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clip',
    'translate', 'scale', 'rotate', 'setTransform', 'transform', 'clearRect', 'fillText', 'strokeText',
    'setLineDash', 'drawImage', 'roundRect',
  ];
  for (const name of methods) {
    ctx[name] = (...args: unknown[]) => {
      log.push(name + ':' + args.map((a) => (typeof a === 'number' ? a.toFixed(2) : String(a))).join(','));
    };
  }
  const g = new Proxy(ctx, {
    set(target, key, value) {
      target[key as string] = value;
      if (key === 'fillStyle' || key === 'strokeStyle') {
        log.push(`${String(key)}:${typeof value === 'string' ? value : 'grad'}`);
      }
      return true;
    },
    get(target, key) {
      return target[key as string];
    },
  });
  paintSelectCenter(g as unknown as CanvasRenderingContext2D, c, 200, 286);
  return log;
}

describe('arte do centro na seleção', () => {
  it('cada um dos 28 tem arte própria, no mesmo enquadramento, sem imagem genérica', () => {
    expect(CHARACTERS).toHaveLength(28);
    const traces = CHARACTERS.map((c) => ({ id: c.id, log: traceOf(c) }));
    const signatures = traces.map((t) => t.log.join('|'));
    expect(new Set(signatures).size).toBe(28);
    for (const t of traces) {
      expect(t.log.some((line) => line.startsWith('drawImage'))).toBe(false);
      expect(t.log.length).toBeGreaterThan(80);
    }
    // O card coloca todo mundo no mesmo chão e na mesma escala. O que vem depois é o corpo.
    const frame = (id: string) => {
      const log = traces.find((t) => t.id === id)!.log;
      return [log.find((line) => line.startsWith('translate:')), log.find((line) => line.startsWith('scale:'))];
    };
    const zephyr = frame('kael');
    expect(zephyr[0]).toBe('translate:100.00,257.40');
    for (const t of traces) expect(frame(t.id)).toEqual(zephyr);
    const vibra = traces.find((t) => t.id === 'vibra')!.log.join('|');
    const valkyra = traces.find((t) => t.id === 'tara')!.log.join('|');
    expect(vibra).toContain('#ff4fc3');
    expect(valkyra).not.toContain('#ff4fc3');
    expect(valkyra).not.toBe(vibra);
  });
});
