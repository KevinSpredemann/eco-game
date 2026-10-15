import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { COMBAT, sanitizeLoadout } from '../src/game/balance';
import { WEAPONS, isPrimary, weaponDps } from '../src/game/weapons';
import { getCharacter, withLevel } from '../src/game/characters';

const idle: Input = { mx: 0, my: 0, dash: false, ability: false };
const STEP = 1 / 60;

/** dois jogadores parados frente a frente, já na fase de combate */
function duel(a = 'kael', b = 'luna', mode: 'dupla' | 'duelo' = 'duelo', loadA?: object) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: a,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode,
    roundSec: 20,
    suddenSec: 6,
    roster: [
      { id: 'a', char: a, isBot: false, loadout: loadA },
      { id: 'b', char: b, isBot: false },
    ],
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  // sai da proteção de início
  for (let i = 0; i < 90; i++) g.step(STEP, { a: idle, b: idle });
  const pa = g.players[0];
  const pb = g.players[1];
  Object.assign(pa, { x: 400, y: 330, vx: 0, vy: 0 });
  Object.assign(pb, { x: 560, y: 330, vx: 0, vy: 0 });
  g.drainEvents();
  return { g, pa, pb };
}

describe('balanceamento central', () => {
  it('armas principais ficam numa faixa de dano por segundo (sem arma dominante)', () => {
    const prim = Object.values(WEAPONS).filter((w) => isPrimary(w.id) && w.id !== 'colosso');
    for (const w of prim) {
      const dps = weaponDps(w);
      expect(dps, w.id).toBeGreaterThan(24);
      expect(dps, w.id).toBeLessThan(55);
    }
    // nenhuma arma principal atordoa (só habilidades com aviso fazem isso)
    expect(prim.filter((w) => w.stun)).toHaveLength(0);
  });

  it('nível comprado não dá vantagem grande no PvP', () => {
    for (const id of ['luna', 'bruno', 'nyx']) {
      const c = getCharacter(id);
      const l5 = withLevel(c, 5);
      expect(l5.ability.duration).toBe(c.ability.duration);
      // invulnerabilidade/escudo nunca ficam ativos mais de 25% do tempo
      expect(l5.ability.duration / l5.ability.cooldown).toBeLessThanOrEqual(0.25);
    }
  });

  it('atordoamento seguido não prende: há imunidade logo depois', () => {
    const { g, pb } = duel();
    g.stun(pb, 0.6);
    expect(pb.stunT).toBeCloseTo(0.6);
    for (let i = 0; i < 40; i++) g.step(STEP, { a: idle, b: idle });
    expect(pb.stunT).toBe(0);
    g.stun(pb, 0.6);
    expect(pb.stunT).toBe(0);
    // e nunca passa do máximo
    for (let i = 0; i < 120; i++) g.step(STEP, { a: idle, b: idle });
    g.stun(pb, 5);
    expect(pb.stunT).toBeLessThanOrEqual(COMBAT.maxStun);
  });

  it('o 2x2 usa poder e um segundo aperto não reinicia a recarga', () => {
    const { g, pa, pb } = duel('kael', 'luna', 'dupla');
    const before = pb.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(pa.powerCd[0]).toBeGreaterThan(1);
    expect(g.bullets.some((n) => n.el === 'wind')).toBe(true);
    const left = pa.powerCd[0];
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(pa.powerCd[0]).toBeLessThan(left);
    expect(pa.powerCd[0]).toBeGreaterThan(left - 0.05);
    for (let i = 0; i < 40 && pb.hp === before; i++) g.step(STEP, { a: idle, b: idle });
    expect(pb.hp).toBeLessThan(before);
    expect(g.turrets).toHaveLength(0);
    expect(pa.item).toBeNull();
  });

  it('R só sai com a carga da ultimate e não gasta energia', () => {
    const { g, pa } = duel('kael', 'luna', 'dupla', { ult: 'meteoro' });
    pa.ultCharge = 40;
    const energy = pa.energy;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0, cr: 100 }, b: idle });
    expect(g.casts).toHaveLength(0);
    expect(pa.powerCd[2]).toBe(0);
    expect(pa.ultCharge).toBeGreaterThan(39);
    expect(pa.energy).toBe(energy);
    pa.ultCharge = 100;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0, cr: 100 }, b: idle });
    // a suprema prepara (aviso no chão) e depois sai
    for (let k = 0; k < 30; k++) g.step(STEP, { a: idle, b: idle });
    expect(pa.powerCd[2]).toBeGreaterThan(0);
    expect(pa.ultCharge).toBeLessThan(40);
    expect(pa.energy).toBe(energy);
  });

  it('equipamento inválido ou não liberado volta para o padrão', () => {
    const l = sanitizeLoadout({ primary: 'colosso', skill: 'fantasma' as never, ult: 'naoexiste' as never, kit: 'fantasma' as never }, () => false);
    expect(l.primary).toBe('assinatura');
    expect(l.skill).toBe('rolamento');
    expect(l.ult).toBe('meteoro');
    expect(l.kit).toBe('bomba');
    const ok = sanitizeLoadout({ primary: 'lancador', skill: 'marcador', ult: 'estase', kit: 'kit' }, () => true);
    expect(ok).toEqual({ primary: 'lancador', skill: 'marcador', ult: 'estase', kit: 'kit', secondary: null });
  });

  it('troca de equipamento no meio da rodada não mexe na recarga do poder', () => {
    const { g, pa } = duel('kael', 'luna', 'dupla', { skill: 'rolamento' });
    g.step(STEP, { a: { ...idle, skill: true, ca: 0 }, b: idle });
    const cd = pa.powerCd[1];
    expect(cd).toBeGreaterThan(0);
    g.setLoadout('a', { skill: 'armadilha', primary: 'fuzil' });
    g.step(STEP, { a: idle, b: idle });
    expect(pa.powerCd[1]).toBeGreaterThan(cd - 0.1);
    expect(pa.item).toBeNull();
  });
});
