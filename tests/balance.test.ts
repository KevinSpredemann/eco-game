import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { COMBAT, ULTS, sanitizeLoadout } from '../src/game/balance';
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

  it('escudo só devolve tiro que vem da frente; de costas leva dano reduzido', () => {
    const { g, pa, pb } = duel('kael', 'bruno');
    // B olha para A (frente) e liga o escudo
    pb.shieldT = 2;
    pb.aim = Math.PI;
    const before = pb.hp;
    const shoot: Input = { ...idle, fire: true, aim: 0 };
    let reflected = 0;
    for (let i = 0; i < 40; i++) {
      g.step(STEP, { a: shoot, b: { ...idle, aim: Math.PI } });
      pb.shieldT = 2;
      reflected += g.drainEvents().filter((e) => e.type === 'reflect').length;
    }
    expect(reflected).toBeGreaterThan(0);
    expect(pb.hp).toBe(before);
    // agora de costas: o tiro passa (reduzido)
    for (let i = 0; i < 40; i++) {
      g.step(STEP, { a: shoot, b: { ...idle, aim: 0 } });
      pb.shieldT = 2;
    }
    expect(pb.hp).toBeLessThan(before);
    expect(pa.hp).toBeGreaterThan(0);
  });

  it('tiro devolvido nunca fica mais forte e não volta duas vezes', () => {
    const { g, pb } = duel('kael', 'bruno');
    pb.shieldT = 2;
    pb.aim = Math.PI;
    g.step(STEP, { a: { ...idle, fire: true, aim: 0 }, b: { ...idle, aim: Math.PI } });
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: { ...idle, aim: Math.PI } });
    const refl = g.bullets.filter((b) => b.refl);
    for (const b of refl) expect(b.dmg).toBeLessThanOrEqual(WEAPONS.pulsador.damage);
  });

  it('fase/sombra: atirar acaba com a invisibilidade', () => {
    const { g, pa } = duel('luna', 'kael');
    g.step(STEP, { a: { ...idle, ability: true }, b: idle });
    expect(pa.phaseT).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    g.step(STEP, { a: { ...idle, fire: true, aim: 0 }, b: idle });
    expect(pa.phaseT).toBe(0);
  });

  it('esquiva (rolamento) deixa intocável só durante o giro e respeita a recarga', () => {
    const { g, pa } = duel('kael', 'luna', 'duelo', { skill: 'rolamento' });
    g.step(STEP, { a: { ...idle, skill: true, ca: Math.PI / 2 }, b: idle });
    expect(pa.dodgeT).toBeGreaterThan(0);
    expect(pa.skillCd).toBeGreaterThan(4);
    const hp = pa.hp;
    g.hurt(pa, 30, 'b', 'shot');
    expect(pa.hp).toBe(hp);
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(pa.dodgeT).toBe(0);
    // apertar de novo durante a recarga não faz nada
    const cd = pa.skillCd;
    g.step(STEP, { a: { ...idle, skill: true, ca: 0 }, b: idle });
    expect(pa.dodgeT).toBe(0);
    expect(pa.skillCd).toBeLessThan(cd);
    g.hurt(pa, 30, 'b', 'shot');
    expect(pa.hp).toBe(hp - 30);
  });

  it('ultimate meteoro: aviso antes, dano só depois do tempo de reação', () => {
    const { g, pa, pb } = duel('kael', 'luna', 'duelo', { ult: 'meteoro' });
    pa.ultCharge = 100;
    const hp = pb.hp;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0, cr: 160 }, b: idle });
    expect(g.casts).toHaveLength(1);
    expect(pa.ultCharge).toBe(0);
    for (let i = 0; i < Math.floor(ULTS.meteoro.windup * 60) - 5; i++) g.step(STEP, { a: idle, b: idle });
    expect(pb.hp).toBe(hp);
    for (let i = 0; i < 20; i++) g.step(STEP, { a: idle, b: idle });
    expect(pb.hp).toBeLessThan(hp - 30);
  });

  it('meteoro: quem foge da área marcada não leva dano', () => {
    const { g, pa, pb } = duel('kael', 'luna', 'duelo', { ult: 'meteoro' });
    pa.ultCharge = 100;
    const hp = pb.hp;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0, cr: 160 }, b: idle });
    for (let i = 0; i < 80; i++) g.step(STEP, { a: idle, b: { ...idle, my: 1 } });
    expect(pb.hp).toBe(hp);
  });

  it('feixe atravessa rivais mas é bloqueado por parede', () => {
    const { g, pa, pb } = duel('kael', 'luna', 'duelo', { ult: 'feixe' });
    pa.ultCharge = 100;
    // muro de gelo entre os dois
    g.iceWalls.push({ id: 999, owner: 'x', kind: 'gelo', x: 470, y: 250, w: 24, h: 160, t: 5 });
    const hp = pb.hp;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0 }, b: idle });
    for (let i = 0; i < 60; i++) g.step(STEP, { a: idle, b: idle });
    expect(pb.hp).toBe(hp);
  });

  it('ultimate não pode ser usada sem carga', () => {
    const { g, pa } = duel('kael', 'luna', 'duelo', { ult: 'meteoro' });
    pa.ultCharge = 40;
    g.step(STEP, { a: { ...idle, ult: true, ca: 0, cr: 100 }, b: idle });
    expect(g.casts).toHaveLength(0);
  });

  it('torreta tem vida e pode ser destruída', () => {
    const { g, pa } = duel('rex', 'kael');
    g.step(STEP, { a: { ...idle, ability: true, ca: 0 }, b: idle });
    expect(g.turrets).toHaveLength(1);
    const t = g.turrets[0];
    for (let i = 0; i < 60 * 4 && g.turrets.length; i++) g.step(STEP, { a: idle, b: { ...idle, fire: true, aim: Math.atan2(t.y - 14 - (g.players[1].y - 24), t.x - g.players[1].x) } });
    expect(g.turrets).toHaveLength(0);
    void pa;
  });

  it('equipamento inválido ou não liberado volta para o padrão', () => {
    const l = sanitizeLoadout({ primary: 'colosso', skill: 'fantasma' as never, ult: 'naoexiste' as never, kit: 'fantasma' as never }, () => false);
    expect(l.primary).toBe('assinatura');
    expect(l.skill).toBe('rolamento');
    expect(l.ult).toBe('meteoro');
    expect(l.kit).toBe('bomba');
    const ok = sanitizeLoadout({ primary: 'lancador', skill: 'marcador', ult: 'estase', kit: 'kit' }, () => true);
    expect(ok).toEqual({ primary: 'lancador', skill: 'marcador', ult: 'estase', kit: 'kit' });
  });

  it('troca de equipamento no meio da rodada só vale na próxima e não zera recargas', () => {
    const { g, pa } = duel('kael', 'luna', 'dupla', { skill: 'rolamento' });
    g.step(STEP, { a: { ...idle, skill: true, ca: 0 }, b: idle });
    const cd = pa.skillCd;
    expect(cd).toBeGreaterThan(0);
    g.setLoadout('a', { skill: 'armadilha', primary: 'fuzil' });
    g.step(STEP, { a: idle, b: idle });
    expect(pa.loadout.skill).toBe('rolamento');
    expect(pa.weapon).toBe('pulsador');
    expect(pa.skillCd).toBeGreaterThan(cd - 0.1);
    // próxima rodada
    const r = g.round;
    for (let i = 0; i < 60 * 80 && g.round === r; i++) g.step(STEP, { a: idle, b: idle });
    expect(pa.loadout.skill).toBe('armadilha');
    expect(pa.weapon).toBe('fuzil');
  });
});
