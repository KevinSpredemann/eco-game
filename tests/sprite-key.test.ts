import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/characters';
import { lookSignature, spriteKey } from '../src/render/chars';

describe('chave de arte de cada personagem', () => {
  it('os 28 resolvem para silhuetas diferentes, sem usar o id', () => {
    expect(CHARACTERS).toHaveLength(28);
    const keys = CHARACTERS.map((c) => spriteKey(c));
    expect(new Set(keys).size).toBe(28);
    const full = CHARACTERS.map((c) => lookSignature(c));
    expect(new Set(full).size).toBe(28);
    for (const c of CHARACTERS) expect(spriteKey(c)).not.toContain(c.id);
    const byId = Object.fromEntries(CHARACTERS.map((c) => [c.id, spriteKey(c)]));
    expect(byId.nara).toBe('ponytail|flower|overalls|none|freckles|1');
    expect(byId.vortex).toBe('spiky|goggles|labcoat|none|bolt|1');
    expect(byId.vexa).toBe('long|hood|ninja|mask||1');
    expect(byId.metra).toBe('short|cap|hoodie|none|earring|1');
    expect(byId.kai).toBe('swept|goggles|parka|none||1');
    expect(byId.nara).not.toBe(byId.vortex);
    expect(byId.kai).not.toBe(byId.metra);
    expect(byId.zed).not.toBe(byId.vortex);
  });
});
