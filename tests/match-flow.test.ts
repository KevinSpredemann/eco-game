import { describe, expect, it } from 'vitest';
import { back, forward, stepLabel } from '../src/ui/matchFlow';

describe('fluxo modo, poderes, mapa', () => {
  const local = { lobby: false, loadout: true, mundo: false };

  it('duelo local vai de personagem para poderes e só então para o mapa', () => {
    expect(forward('select', local)).toBe('powers');
    expect(forward('powers', local)).toBe('map');
    expect(forward('map', local)).toBe('play');
    expect(stepLabel('select', true)).toBe('passo 1 de 3');
    expect(stepLabel('powers', true)).toBe('passo 2 de 3');
    expect(stepLabel('map', true)).toBe('passo 3 de 3');
  });

  it('voltar guarda a escolha: mapa volta aos poderes, poderes ao personagem', () => {
    expect(back('map', local)).toBe('powers');
    expect(back('powers', local)).toBe('select');
  });

  it('sala online e mundo não ganham um passo repetido', () => {
    expect(forward('select', { lobby: true, loadout: true, mundo: false })).toBe('lobby');
    expect(forward('powers', { lobby: true, loadout: true, mundo: false })).toBe('lobby');
    expect(forward('select', { lobby: false, loadout: true, mundo: true })).toBe('play');
    expect(back('map', { loadout: false, lobby: false })).toBe('select');
  });
});
