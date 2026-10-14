import { describe, expect, it } from 'vitest';
import { STUDIO_CHARS, getCharacter } from '../src/game/characters';
import { lookSignature } from '../src/render/chars';
import { PLAYER_R } from '../src/game/constants';

describe('silhueta dos personagens do estúdio', () => {
  it('cada um tem cabelo, chapéu ou roupa diferente, sem mudar o raio', () => {
    expect(PLAYER_R).toBe(16);
    const signs = STUDIO_CHARS.map((id) => lookSignature(getCharacter(id)));
    expect(new Set(signs).size).toBe(STUDIO_CHARS.length);
    const generic = lookSignature({ ...getCharacter('kael'), id: 'ninguém', skinId: undefined });
    for (const sign of signs) expect(sign).not.toBe(generic);
    expect(signs.find((s) => s.startsWith('buns|headphones'))).toBeTruthy();
    expect(signs.find((s) => s.startsWith('spiky|cap'))).toBeTruthy();
    expect(signs.find((s) => s.includes('hoodUp|scarf')) || signs.some((s) => s.includes('|scarf|'))).toBeTruthy();
    expect(signs.some((s) => s.endsWith('|1.12'))).toBe(true);
  });
});
