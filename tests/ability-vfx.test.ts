import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AbilityVfx, elementCore } from '../src/render/abilityVfx';

describe('efeitos de habilidade', () => {
  it('cada elemento tem núcleo e borda próprios', () => {
    const els = ['lightning', 'fire', 'ice', 'plasma', 'wind', 'nature'];
    const edges = new Set(els.map((el) => elementCore(el).edge));
    expect(edges.size).toBe(els.length);
    expect(elementCore('lightning').edge).toBe('#3ee8ff');
    expect(elementCore('fire').edge).toBe('#ff4a1a');
  });

  it('o impacto segue o evento real e o projétil não é movido', () => {
    const fx = new AbilityVfx();
    const b = { id: 1, x: 40, y: 20, vx: 100, vy: 0, el: 'fire', life: 0.4 };
    fx.sync([b]);
    b.x = 80;
    fx.sync([b]);
    expect(fx.shotAt(1)?.x).toBe(80);
    expect(b.x).toBe(80);
    expect(fx.impacts).toHaveLength(0);
    fx.note({ type: 'dmg', k: 'hp', x: 80, y: 20 });
    expect(fx.impacts.some((i) => i.kind === 'hit' && i.x === 80)).toBe(true);
    fx.note({ type: 'deny', msg: 'Fora de alcance', x: 200, y: 20 });
    expect(fx.impacts.some((i) => i.kind === 'miss' && i.x === 200)).toBe(true);
    fx.note({ type: 'dmg', k: 'immune', x: 10, y: 10 });
    expect(fx.impacts.some((i) => i.kind === 'block' && i.el === 'immune')).toBe(true);
  });

  it('o raio só liga os alvos que o evento trouxe', () => {
    const fx = new AbilityVfx();
    fx.note({ type: 'zap', pts: [0, 0, 30, 10, 60, 4] });
    expect(fx.links).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 10 },
      { x: 60, y: 4 },
    ]);
  });

  it('a carga segue a mira e o cancelamento limpa', () => {
    const fx = new AbilityVfx();
    fx.setAim({ x: 10, y: 20, ang: 0, dist: 40, color: '#fff', charge: 0.4 });
    expect(fx.aim?.charge).toBe(0.4);
    fx.setAim(null);
    expect(fx.aim).toBeNull();
  });

  it('o teto de partículas segura uma rajada', () => {
    const fx = new AbilityVfx();
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      fx.note({ type: 'combo', x: i, y: 0, name: 'Tempestade' });
      fx.sync([{ id: i, x: i, y: 0, vx: 10, vy: 0, el: i % 2 ? 'lightning' : 'fire', life: 1 }]);
      fx.step(1 / 60);
    }
    expect(fx.sparkCount).toBeLessThanOrEqual(fx.cap());
    expect(performance.now() - t0).toBeLessThan(1500);
    fx.setReduced(true);
    fx.note({ type: 'combo', x: 0, y: 0 });
    expect(fx.sparkCount).toBeLessThanOrEqual(fx.cap());
  });

  it('o módulo não aplica dano', () => {
    const src = readFileSync(new URL('../src/render/abilityVfx.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('deliverPower');
    expect(src).not.toContain('.hurt(');
    expect(src).not.toContain('aimService');
  });
});
