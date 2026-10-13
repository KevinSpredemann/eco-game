import { describe, expect, it } from 'vitest';
import { ACCESSORIES, SKINS, buy, canEquipWeapon, equip, grantStarters, itemPrice, newProfile, normalizeProfile, owns, type Profile } from '../src/game/economy';

describe('cosméticos', () => {
  it('libera de graça o padrão e tranca o resto com preço', () => {
    const p = newProfile();
    const freeSkins = SKINS.filter((s) => s.price === 0).map((s) => s.id);
    const paidSkins = SKINS.filter((s) => s.price > 0);
    expect(freeSkins).toEqual(expect.arrayContaining(['padrao', 'noturno']));
    for (const id of freeSkins) expect(owns(p, 'skin:' + id)).toBe(true);
    for (const s of paidSkins) {
      expect(owns(p, 'skin:' + s.id)).toBe(false);
      expect(itemPrice('skin:' + s.id)).toBe(s.price);
    }
    for (const a of ACCESSORIES) {
      expect(owns(p, 'acc:' + a.id)).toBe(a.price === 0);
      if (a.price > 0) expect(itemPrice('acc:' + a.id)).toBe(a.price);
    }
    expect(p.equipped).toMatchObject({ skin: 'padrao', acc: 'nenhum', weapon: 'assinatura' });
  });

  it('compra, equipa e guarda acessório e arma no perfil', () => {
    const p = newProfile();
    expect(equip(p, 'acc', 'capa')).toMatch(/Compre/);
    expect(buy(p, 'acc:capa')).toMatch(/Faltam/);
    p.coins = 400;
    expect(buy(p, 'acc:capa')).toBeNull();
    expect(p.coins).toBe(0);
    expect(owns(p, 'acc:capa')).toBe(true);
    expect(equip(p, 'acc', 'capa')).toBeNull();
    expect(p.equipped.acc).toBe('capa');

    expect(equip(p, 'weapon', 'colosso')).toMatch(/Compre/);
    expect(canEquipWeapon(p, 'fuzil')).toBe(true);
    expect(equip(p, 'weapon', 'fuzil')).toBeNull();
    expect(p.equipped.weapon).toBe('fuzil');

    const again = JSON.parse(JSON.stringify(p)) as Profile;
    expect(normalizeProfile(again)).toBe(false);
    expect(again.equipped.acc).toBe('capa');
    expect(again.equipped.weapon).toBe('fuzil');
    expect(again.coins).toBe(0);
  });

  it('completa um perfil antigo sem apagar moedas nem o personagem', () => {
    const old = newProfile();
    old.username = 'Ana';
    old.coins = 80;
    old.equipped = { char: 'luna', skin: 'padrao', trail: 'nenhum' } as Profile['equipped'];
    old.owned = ['char:kael', 'char:luna', 'skin:padrao', 'trail:nenhum'];
    expect(normalizeProfile(old)).toBe(true);
    expect(old.equipped.char).toBe('luna');
    expect(old.equipped.acc).toBe('nenhum');
    expect(old.equipped.weapon).toBe('assinatura');
    expect(old.coins).toBe(80);
    expect(old.username).toBe('Ana');
    expect(owns(old, 'acc:bone')).toBe(true);
    expect(owns(old, 'skin:noturno')).toBe(true);
    expect(owns(old, 'acc:asas')).toBe(false);
    expect(grantStarters(old)).toBe(false);
  });
});