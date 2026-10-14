import { describe, expect, it } from 'vitest';
import { LATER_MODES, PLAY_MODES, modeById } from '../src/ui/modes';

describe('tela de modos', () => {
  it('lista só os modos que existem, e deixa o resto indisponível', () => {
    expect(PLAY_MODES.map((m) => m.id)).toEqual(['x1-online', 'x1-offline', 'dupla', 'mundo']);
    expect(PLAY_MODES.every((m) => m.available)).toBe(true);
    const offline = modeById('x1-offline');
    expect(offline?.where).toBe('Offline');
    expect(offline?.available).toBe(true);
    expect(modeById('dupla')?.teams).toBe('Azul × Vermelho');
    expect(modeById('mundo')?.players).toBe('1');
    expect(LATER_MODES.length).toBeGreaterThan(0);
    expect(LATER_MODES.every((m) => m.available === false && !!m.reason)).toBe(true);
    expect(LATER_MODES.map((m) => m.id)).not.toEqual(expect.arrayContaining(PLAY_MODES.map((m) => m.id)));
  });
});
