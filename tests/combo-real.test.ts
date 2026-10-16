// Combos de verdade: cada combo que a tela de poderes promete sai no combate real, com o mesmo nome,
// uma vez só, e só dentro da janela. (Antes: "Suprema no controle" e "Execução" quase nunca saíam,
// e a tela prometia "Descarga" onde o jogo resolvia outro combo.)
import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { KITS, kitOf, mainElementOf, resolvedDamage } from '../src/game/elements';
import { CASCADE_BONUS, COMBO_WINDOW, CONTROL_GRACE, TOCAIA_BONUS, ULT_CONTROL_BONUS, listSynergies } from '../src/game/combos';
import { encodeSnapshot } from '../src/net/protocol';
import { ClientGame } from '../src/net/clientGame';

const STEP = 1 / 60;
const KEYS = ['ability', 'skill', 'ult', 'bonus'] as const;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };

function press(slot: number, cr: number): Input {
  const i = { mx: 0, my: 0, dash: false, ability: false, ca: 0, cr, aim: 0 } as Input & Record<string, unknown>;
  i[KEYS[slot]] = true;
  return i;
}

function duel(charId: string, d: number) {
  const g = new Game({ arena: getArena('lab'), humanChar: charId, bots: 0, difficulty: 'normal', ownEchoDamage: true, training: false, mode: 'duelo', roster: [{ id: 'a', char: charId, isBot: false }, { id: 'b', char: 'kael', isBot: false }], roundSec: 60, suddenSec: 8 });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle } as unknown as Input);
  const [a, b] = g.players;
  a.x = 400;
  a.y = 360;
  b.x = 400 + d;
  b.y = 360;
  a.invulnT = b.invulnT = 0;
  a.ultCharge = 100;
  a.energy = 100;
  b.hp = b.maxHp = 999;
  const log = { combos: [] as { name: string; bonus: number }[], dmg: [] as number[] };
  const run = (inp: Input, frames: number) => {
    for (let k = 0; k < frames; k++) {
      g.step(STEP, { a: k === 0 ? inp : idle, b: idle } as unknown as Input);
      b.x = 400 + d;
      b.y = 360;
      b.vx = b.vy = 0;
      for (const e of g.drainEvents() as { type: string; pid?: string; name?: string; bonus?: number; k?: string; n?: number }[]) {
        if (e.type === 'combo' && e.pid === 'a') log.combos.push({ name: e.name!, bonus: e.bonus! });
        if (e.type === 'dmg' && e.pid === 'b' && e.k === 'hp') log.dmg.push(e.n!);
      }
    }
  };
  const refill = () => {
    a.x = 400;
    a.y = 360;
    a.energy = 100;
    a.ultCharge = 100;
    a.powerCd.fill(0);
    a.castT = 0;
  };
  return { g, a, b, log, run, refill };
}

describe('combos no combate real', () => {
  it('todo combo "ativo" da tela de poderes sai no combate com o mesmo nome', () => {
    const fails: string[] = [];
    let ok = 0;
    for (const id of Object.keys(KITS)) {
      for (const row of listSynergies(id, null)) {
        if (row.state !== 'active' || row.slots.length !== 2 || row.slots.some((s) => s < 0)) continue;
        const [i, j] = row.slots;
        const pi = kitOf(id).powers[i];
        const pj = kitOf(id).powers[j];
        for (const d of [90, 140]) {
          if ((pi.act === 'blink' && (pi.step ?? pi.range) < d) || (pj.act === 'blink' && (pj.step ?? pj.range) < d)) continue;
          const t = duel(id, d);
          t.run(press(i, pi.act === 'wall' ? d - 50 : d), 50);
          t.refill();
          t.run(press(j, pj.act === 'wall' ? d - 50 : d), 60);
          if (t.log.combos.some((c) => c.name === row.name)) ok++;
          else fails.push(`${id} ${row.name} (${pi.name} → ${pj.name}) d=${d}: saiu ${t.log.combos.map((c) => c.name).join(',') || 'nada'}`);
        }
      }
    }
    expect(ok).toBeGreaterThan(200);
    expect(fails).toEqual([]);
  });

  it('controle e depois a suprema: funciona depois que o tonto passou (dentro da folga)', () => {
    // Metra: Q Pulso (raio, área: deixa tonto) → R Geada (suprema)
    const t = duel('metra', 100);
    t.run(press(0, 100), 1);
    expect(t.b.stunT).toBeGreaterThan(0);
    t.run(idle, 50); // ~0,85 s: o tonto (0,55 s) já acabou
    expect(t.b.stunT).toBe(0);
    t.refill();
    t.run(press(2, 100), 70);
    const ult = t.log.combos.filter((c) => c.name === 'Suprema no controle');
    expect(ult).toHaveLength(1);
    expect(ult[0].bonus).toBe(ULT_CONTROL_BONUS);
  });

  it('janela expirada: passou da folga, não sai combo de controle', () => {
    const t = duel('metra', 100);
    t.run(press(0, 100), 1);
    t.run(idle, Math.ceil((0.6 + CONTROL_GRACE + 0.5) / STEP));
    t.refill();
    t.run(press(2, 100), 70);
    expect(t.log.combos.some((c) => c.name === 'Suprema no controle')).toBe(false);
  });

  it('sequência sem combo: os dois golpes funcionam normal, sem bônus e sem travar', () => {
    // Metra: E Brasa (fogo) duas vezes seguidas não é combo
    const t = duel('metra', 140);
    const base = resolvedDamage(kitOf('metra').powers[1], 1);
    t.run(press(1, 140), 40);
    t.refill();
    t.a.powerCd[1] = 0;
    t.run(press(1, 140), 40);
    expect(t.log.combos).toEqual([]);
    expect(t.log.dmg.filter((n) => n === base)).toHaveLength(2);
    expect(t.a.powerCd[1]).toBeGreaterThan(0);
  });

  it('o bônus do combo entra uma vez só (nada de dano dobrado)', () => {
    // Metra: Q Pulso (raio) → E Brasa (fogo) = Arco-chama
    const t = duel('metra', 120);
    t.run(press(0, 120), 30);
    t.refill();
    const before = t.b.hp;
    const n0 = t.log.dmg.length;
    t.run(press(1, 120), 50);
    const arc = t.log.combos.filter((c) => c.name === 'Arco-chama');
    expect(arc).toHaveLength(1);
    const base = resolvedDamage(kitOf('metra').powers[1], 1);
    // um acerto do golpe (a queimadura depois são tiques pequenos, separados)
    const hits = t.log.dmg.slice(n0).filter((n) => n >= base);
    expect(hits).toEqual([base + arc[0].bonus]);
    expect(before - t.b.hp).toBeGreaterThanOrEqual(base + arc[0].bonus);
    expect(before - t.b.hp).toBeLessThan(base + arc[0].bonus + 6); // + só a queimadura começando
  });

  it('interrompido: nova rodada limpa as marcas (combo não "vaza" para a rodada seguinte)', () => {
    const t = duel('metra', 120);
    t.run(press(0, 120), 20);
    expect(t.b.shockT).toBeGreaterThan(0);
    // fim da rodada: derruba o alvo e avança até a próxima rodada começar
    t.b.hp = 1;
    t.g.hurt(t.b, 50, 'a', 'pulse');
    for (let i = 0; i < 60 * 40 && t.g.phase !== 'play'; i++) t.g.step(STEP, { a: idle, b: idle } as unknown as Input);
    for (let i = 0; i < 60 * 40 && t.g.phase !== 'play'; i++) t.g.step(STEP, { a: idle, b: idle } as unknown as Input);
    const b = t.g.players[1];
    expect(b.shockT).toBe(0);
    expect(b.ctrlT).toBe(0);
  });

  it('muralha própria não segura o próprio tiro (Clave: muralha → Estalo)', () => {
    const t = duel('clave', 140);
    t.run(press(0, 90), 20);
    t.refill();
    const before = t.b.hp;
    t.run(press(2, 140), 60);
    expect(t.b.hp).toBeLessThan(before);
  });

  it('cada personagem fecha pelo menos um combo com Q, E ou F', () => {
    const keys = ['Q', 'E', 'R', 'F'];
    const missing: string[] = [];
    const fails: string[] = [];
    const table: string[] = [];
    for (const id of Object.keys(KITS)) {
      const rows = listSynergies(id, null).filter((row) => row.state === 'active' && row.slots.length === 2 && row.slots.every((s) => s === 0 || s === 1 || s === 3));
      if (!rows.length) {
        missing.push(id);
        continue;
      }
      table.push(`${id} ${rows.map((r) => `${keys[r.slots[0]]}+${keys[r.slots[1]]}=${r.name}`).join(', ')}`);
      let hit = false;
      let label = rows[0].name;
      for (const row of rows) {
        if (hit) break;
        const [i, j] = row.slots;
        const pi = kitOf(id).powers[i];
        const pj = kitOf(id).powers[j];
        label = `${row.name} (${pi.name} → ${pj.name})`;
        for (const d of [90, 140]) {
          if ((pi.act === 'blink' && (pi.step ?? pi.range) < d) || (pj.act === 'blink' && (pj.step ?? pj.range) < d)) continue;
          const t = duel(id, d);
          t.run(press(i, pi.act === 'wall' ? d - 50 : d), 50);
          t.refill();
          t.run(press(j, pj.act === 'wall' ? d - 50 : d), 60);
          if (t.log.combos.filter((c) => c.name === row.name).length === 1) hit = true;
        }
      }
      if (!hit) fails.push(`${id} ${label}`);
    }
    expect(missing, table.join('\n')).toEqual([]);
    expect(fails, table.join('\n')).toEqual([]);
  });

  it('Vortex: Q depois E é Cadeia de Plasma, uma vez, e some fora da janela', () => {
    const t = duel('vortex', 90);
    t.run(press(0, 90), 40);
    expect(t.log.combos).toEqual([]);
    expect(t.b.plasmaPrimeT).toBeGreaterThan(0.2);
    expect(t.b.plasmaPrimeT).toBeLessThanOrEqual(COMBO_WINDOW);
    t.a.powerCd[0] = 0;
    t.a.energy = 100;
    t.run(press(0, 90), 40);
    expect(t.log.combos.filter((c) => c.name === 'Cadeia de Plasma')).toEqual([]);
    expect(t.b.plasmaPrimeT).toBeGreaterThan(0);

    const chain = duel('vortex', 90);
    chain.run(press(0, 90), 40);
    chain.refill();
    const before = chain.b.hp;
    chain.run(press(1, 90), 10);
    const got = chain.log.combos.filter((c) => c.name === 'Cadeia de Plasma');
    expect(got).toHaveLength(1);
    expect(got[0].bonus).toBe(CASCADE_BONUS);
    expect(before - chain.b.hp).toBe(resolvedDamage(kitOf('vortex').powers[1], 1) + CASCADE_BONUS);
    expect(chain.b.plasmaPrimeT).toBe(0);
    chain.refill();
    chain.run(press(1, 90), 10);
    expect(chain.log.combos.filter((c) => c.name === 'Cadeia de Plasma')).toHaveLength(1);

    const late = duel('vortex', 90);
    late.run(press(0, 90), 40);
    late.run(idle, Math.ceil((late.b.plasmaPrimeT + 0.3) / STEP));
    expect(late.b.plasmaPrimeT).toBe(0);
    late.refill();
    late.run(press(1, 90), 10);
    expect(late.log.combos.some((c) => c.name === 'Cadeia de Plasma')).toBe(false);

    const dry = duel('vortex', 90);
    dry.a.energy = 0;
    dry.run(press(0, 90), 1);
    expect(dry.g.bullets.some((b) => b.el === 'plasma')).toBe(false);
    expect(dry.b.plasmaPrimeT).toBe(0);

    const back = duel('vortex', 90);
    back.run(press(1, 90), 5);
    back.refill();
    back.run(press(0, 90), 40);
    expect(back.log.combos.some((c) => c.name === 'Cadeia de Plasma')).toBe(false);
    expect(back.log.combos.some((c) => c.name === 'Descarga')).toBe(true);

    const row = encodeSnapshot(chain.g, false).P[1];
    chain.b.plasmaPrimeT = 2.4;
    const sent = encodeSnapshot(chain.g, false).P[1];
    expect(sent.at(-2)).toBe(2.4);
    expect(row.at(-2)).toBe(0);
    expect(sent.at(-1)).toBe(row.at(-1));
    const cg = new ClientGame({
      you: 'a',
      mode: 'duelo',
      arena: 'lab',
      roster: [
        { id: 'a', char: 'vortex', skin: 'padrao', trail: 'nenhum', name: 'A', isBot: false },
        { id: 'b', char: 'kael', skin: 'padrao', trail: 'nenhum', name: 'B', isBot: true },
      ],
    });
    cg.applySnapshot(encodeSnapshot(chain.g, false), []);
    expect(cg.players.find((p) => p.id === 'b')!.plasmaPrimeT).toBe(2.4);
    expect(COMBO_WINDOW).toBeGreaterThanOrEqual(0.8);
    expect(COMBO_WINDOW).toBeLessThanOrEqual(1.5);
  });

  it('Vexa: Q depois E é Tocaia, e o piscar prepara a Emboscada do golpe seguinte', () => {
    const t = duel('vexa', 80);
    t.run(press(0, 80), 40);
    expect(t.b.markedT).toBeGreaterThan(0);
    expect(t.log.combos).toEqual([]);
    t.refill();
    const before = t.b.hp;
    t.run(press(1, 80), 8);
    expect(t.log.combos.filter((c) => c.name === 'Tocaia')).toHaveLength(1);
    expect(t.log.combos.filter((c) => c.name === 'Tocaia')[0].bonus).toBe(TOCAIA_BONUS);
    expect(t.log.combos.some((c) => c.name === 'Emboscada')).toBe(false);
    expect(before - t.b.hp).toBe(resolvedDamage(kitOf('vexa').powers[1], 1) + TOCAIA_BONUS);
    expect(t.b.markedT).toBe(0);
    expect(t.a.ambushT).toBeGreaterThan(0);
    t.refill();
    t.run(press(0, 80), 40);
    expect(t.log.combos.filter((c) => c.name === 'Emboscada')).toHaveLength(1);
    expect(t.log.combos.filter((c) => c.name === 'Tocaia')).toHaveLength(1);
  });

  it('o elemento do personagem segue o kit', () => {
    expect(mainElementOf('vortex')).toBe('plasma');
    expect(mainElementOf('vexa')).toBe('shadow');
    expect(mainElementOf('nara')).toBe('nature');
    expect(mainElementOf('kai')).toBe('ice');
    expect(mainElementOf('lyra')).toBe('ice');
    expect(mainElementOf('kael')).toBe('wind');
    expect(mainElementOf('maya')).toBe('fire');
  });
});
