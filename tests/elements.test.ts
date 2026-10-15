import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/characters';
import {
  KITS,
  bonusDamage,
  botPower,
  comboOf,
  cooldownOf,
  denyPowerCast,
  kitOf,
  speedMul,
  tuneCombo,
  wallSlam,
  type Aura,
} from '../src/game/elements';
import { comboReady } from '../src/game/combos';

const clear: Aura = { burn: 0, frozen: 0, gust: 0, shock: 0 };

describe('poderes elementais', () => {
  it('cada personagem tem quatro poderes, um de cada elemento, com recarga e dano contidos', () => {
    expect(Object.keys(KITS)).toHaveLength(CHARACTERS.length);
    for (const c of CHARACTERS) {
      const k = kitOf(c.id);
      expect(k.powers, c.id).toHaveLength(4);
      const els = k.powers.map((p) => p.element);
      const classic = els.every((e) => e === 'fire' || e === 'ice' || e === 'lightning' || e === 'wind');
      if (classic) expect(new Set(els).size, c.id).toBe(4);
      else expect(['vortex', 'nara', 'vexa'], c.id).toContain(c.id);
      expect(k.passiveName.length, c.id).toBeGreaterThan(0);
      for (const p of k.powers) {
        expect(p.cd, `${c.id} ${p.name}`).toBeGreaterThanOrEqual(2.5);
        expect(p.cd, `${c.id} ${p.name}`).toBeLessThanOrEqual(8);
        expect(p.dmg, `${c.id} ${p.name}`).toBeGreaterThanOrEqual(6);
        expect(p.dmg, `${c.id} ${p.name}`).toBeLessThanOrEqual(20);
        expect(p.dmg >= 16 && p.range >= 260 && p.cd <= 4.5, `${c.id} ${p.name} dmg+alcance+recarga`).toBe(false);
      }
    }
  });

  it('a sequência de marcas vira o combo certo, e sem marca não há combo', () => {
    expect(comboOf({ ...clear, frozen: 1 }, 'lightning')).toMatchObject({ id: 'shatter', name: 'Eletrocutar', bonus: 16, clearFrozen: true });
    expect(comboOf({ ...clear, frozen: 1 }, 'fire')).toMatchObject({ id: 'steam', name: 'Vapor', bonus: 14, clearFrozen: true, aoe: 72 });
    expect(comboOf({ ...clear, burn: 1 }, 'wind')).toMatchObject({ id: 'cinder', name: 'Inferno Espiral', bonus: 10 });
    expect(comboOf({ ...clear, gust: 1 }, 'lightning')).toMatchObject({ id: 'storm', name: 'Tempestade', bonus: 12 });
    expect(comboOf({ ...clear, shock: 1 }, 'fire')).toMatchObject({ id: 'arc', name: 'Arco-chama', bonus: 10 });
    expect(comboOf({ ...clear, burn: 1 }, 'ice')).toMatchObject({ id: 'thermal', name: 'Choque térmico', bonus: 8 });
    expect(comboOf({ ...clear, frozen: 1 }, 'plasma')).toMatchObject({ id: 'chill', name: 'Plasma lento', bonus: 8 });
    expect(comboOf(clear, 'fire')).toBeNull();
    expect(comboOf(clear, 'plasma')).toBeNull();
    // Água molhou: Água de novo congela, Ar vira Vórtice
    expect(comboOf({ ...clear, frozen: 1 }, 'ice')).toMatchObject({ id: 'freeze', name: 'Congelamento', hold: 0.9 });
    expect(comboOf({ ...clear, frozen: 1 }, 'wind')).toMatchObject({ id: 'vortex', name: 'Vórtice', pull: 96 });
    expect(comboOf({ ...clear, burn: 1 }, 'wind')?.spreadBurn).toBe(80);
    expect(comboOf({ ...clear, gust: 1 }, 'wind')).toBeNull();
  });

  it('gelo e depois raio vem antes de fogo, quando os dois serviriam', () => {
    expect(comboOf({ ...clear, frozen: 1, burn: 1 }, 'lightning')?.id).toBe('shatter');
  });

  it('a pancada só conta se o ponto à frente do empurrão está bloqueado', () => {
    const wall = (x: number, y: number) => x < 430 && y > 150 && y < 200;
    expect(wallSlam(530, 178, 470, 178, 46, wall)).toBe(true);
    expect(wallSlam(400, 360, 460, 360, 46, wall)).toBe(false);
  });

  it('o bot fecha estilhaçar, prepara gelo e empurra na parede', () => {
    const zed = kitOf('zed');
    const cds = [0, 0, 0, 0];
    expect(botPower(zed, cds, { ...clear, frozen: 2 }, 100, false)).toBe(0);
    expect(botPower(zed, cds, clear, 100, false)).toBe(1);
    const kael = kitOf('kael');
    expect(botPower(kael, cds, clear, 100, true)).toBe(0);
  });

  it('passivas mudam recarga, dano, velocidade e o bônus do combo', () => {
    expect(cooldownOf('duda', 3.2)).toBeCloseTo(3.2 * 0.88);
    expect(cooldownOf('kael', 3.2)).toBe(3.2);
    expect(bonusDamage('maya', { ...clear, burn: 1 }, false)).toBe(6);
    expect(bonusDamage('maya', clear, false)).toBe(0);
    expect(bonusDamage('zoe', { ...clear, frozen: 1 }, false)).toBe(6);
    expect(speedMul('nyx', 2)).toBeCloseTo(1.16);
    expect(speedMul('nyx', 9)).toBeCloseTo(1.32);
    expect(speedMul('kael', 4)).toBe(1);
    expect(tuneCombo('kai', comboOf({ ...clear, frozen: 1 }, 'lightning'))?.bonus).toBe(24);
    expect(tuneCombo('leo', comboOf({ ...clear, gust: 1 }, 'lightning'))?.bonus).toBe(18);
    expect(tuneCombo('mei', comboOf({ ...clear, frozen: 1 }, 'fire'))?.aoe).toBe(108);
  });

  it('recusa a recarga sem zerar o tempo e mostra o combo só enquanto a marca existe', () => {
    expect(denyPowerCast('skill', [0, 1.2, 0, 0])).toBe('Habilidade em recarga');
    expect(denyPowerCast('ability', [0, 1.2, 0, 0])).toBeNull();
    expect(denyPowerCast('fire', [9, 9, 9, 9])).toBeNull();
    const frozen = { ...clear, frozen: 2 };
    expect(comboReady('kai', [0, 0, 0, 0], [frozen])).toMatchObject({ slot: 0, key: 'Q', name: 'Congelamento' });
    expect(comboReady('kai', [2, 0, 0, 0], [frozen])).toMatchObject({ slot: 1, key: 'E', name: 'Eletrocutar' });
    expect(comboReady('kai', [2, 2, 0, 0], [frozen])).toMatchObject({ slot: 2, key: 'R', name: 'Vapor' });
    expect(comboReady('kai', [2, 2, 2, 0], [frozen])).toMatchObject({ slot: 3, key: 'F', name: 'Vórtice' });
    expect(comboReady('kai', [2, 2, 2, 2], [frozen])).toBeNull();
    expect(comboReady('kai', [0, 0, 0, 0], [clear])).toBeNull();
  });
});
