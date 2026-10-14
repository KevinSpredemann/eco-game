import { describe, expect, it } from 'vitest';
import { think } from '../src/game/mundo/ai';
import { acceptMundoBlob } from '../src/game/mundo/blob';
import { portalCard, REGIONS } from '../src/game/mundo/regions';
import { buyPotion, deposit, freshSave } from '../src/game/mundo/rules';
import { MundoWorld, STILL } from '../src/game/mundo/sim';

const open = () => false;

function forest() {
  const w = new MundoWorld(freshSave('kael'), 0, () => 0.5);
  w.portalCd = 0;
  const p = REGIONS.vila.portal;
  w.player.x = p.x;
  w.player.y = p.y;
  w.step(0.05, STILL);
  w.portalCd = 0;
  return w;
}

describe('combate, ruínas e extrato', () => {
  it('o lobo circula, investe e foge com pouca vida', () => {
    const dash = think(
      { kind: 'wolf', x: 0, y: 0, homeX: 0, homeY: 0, speed: 130, alert: 0, cd: 0, hp: 56, maxHp: 56 },
      { x: 160, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(dash.dash).toBe(true);
    expect(dash.vx).toBeGreaterThan(200);
    const circle = think(
      { kind: 'wolf', x: 0, y: 0, homeX: 0, homeY: 0, speed: 130, alert: 0, cd: 1, hp: 56, maxHp: 56 },
      { x: 40, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(circle.dash).toBeFalsy();
    expect(Math.abs(circle.vy)).toBeGreaterThan(50);
    const flee = think(
      { kind: 'wolf', x: 0, y: 0, homeX: 0, homeY: 0, speed: 130, alert: 0, cd: 0, hp: 10, maxHp: 56 },
      { x: 150, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(flee.state).toBe('flee');
    expect(flee.vx).toBeLessThan(0);

    const w = forest();
    const wolf = w.spawn('wolf', w.player.x - 160, w.player.y);
    const x = wolf.x;
    w.step(0.05, STILL);
    expect(wolf.x).toBeGreaterThan(x + 40);
  });

  it('tiro, investida, escudo, pulso, armadilha e esquiva gastam energia de verdade', () => {
    const shot = forest();
    shot.energy = 100;
    const mob = shot.spawn('chaser', shot.player.x + 70, shot.player.y);
    const hp = mob.hp;
    shot.step(0.3, { ...STILL, aim: 0, power: 'shot' });
    expect(shot.energy).toBeLessThan(90);
    expect(mob.hp).toBeLessThan(hp);
    expect(shot.floats.some((f) => f.text !== '')).toBe(true);
    expect(shot.shots.filter((s) => s.color === '#3ee8ff')).toHaveLength(0);

    const dry = forest();
    dry.energy = 0;
    dry.step(0.05, { ...STILL, power: 'shot' });
    expect(dry.note).toMatch(/Energia/);
    expect(dry.energy).toBeLessThan(2);

    const dash = forest();
    dash.energy = 100;
    const foe = dash.spawn('chaser', dash.player.x + 80, dash.player.y);
    const before = foe.hp;
    const x = dash.player.x;
    dash.step(0.2, { ...STILL, aim: 0, power: 'dash' });
    expect(dash.player.x).toBeGreaterThan(x + 40);
    expect(foe.hp).toBeLessThan(before);

    const guard = forest();
    guard.energy = 40;
    guard.step(0.05, { ...STILL, power: 'shield' });
    expect(guard.shield).toBeGreaterThan(1);
    expect(guard.energy).toBeLessThan(30);

    const boom = forest();
    boom.energy = 100;
    const near = boom.spawn('chaser', boom.player.x + 40, boom.player.y);
    const hp0 = near.hp;
    boom.step(0.45, { ...STILL, power: 'blast' });
    expect(near.hp).toBeLessThan(hp0);

    const trap = forest();
    trap.energy = 100;
    const stood = trap.spawn('chaser', trap.player.x + 36, trap.player.y);
    const hp1 = stood.hp;
    trap.step(0.12, { ...STILL, aim: 0, power: 'trap' });
    expect(stood.hp).toBeLessThan(hp1);
    expect(trap.traps).toHaveLength(0);

    const roll = forest();
    roll.energy = 20;
    roll.step(0.05, { ...STILL, mx: 1, dodge: true });
    expect(roll.invuln).toBeGreaterThan(0);
    expect(roll.hurt(roll.player, 30)).toBe(0);
    expect(roll.player.hp).toBe(roll.player.maxHp);
  });

  it('o mesmo id de compra não debita duas vezes e o extrato guarda o depósito', () => {
    let save = freshSave('kael');
    save.coins = 50;
    const once = buyPotion(save, 'same');
    expect('error' in once).toBe(false);
    if ('error' in once) return;
    expect(once.save.coins).toBe(25);
    const twice = buyPotion(once.save, 'same');
    expect(twice).toEqual({ error: 'Já processado.' });
    expect(once.save.coins).toBe(25);
    const moved = deposit(once.save, 10, 'dep-1');
    expect('error' in moved).toBe(false);
    if ('error' in moved) return;
    expect(moved.save.bank).toBe(10);
    expect(moved.save.ledger.find((row) => row.id === 'dep-1')).toMatchObject({ kind: 'dep', n: 10 });
    expect(deposit(moved.save, 10, 'dep-1')).toEqual({ error: 'Já processado.' });
    expect(moved.save.bank).toBe(10);
  });

  it('ruínas só abrem depois do guardião e o baú paga uma vez', () => {
    const card = portalCard('ruinas', 4, false, 'boss');
    expect(card.level).toBe(4);
    expect(card.lock).toMatch(/Guardião/);
    expect(portalCard('ruinas', 4, true, 'boss').lock).toBe('');

    const w = forest();
    const gate = REGIONS.floresta.gates![1];
    expect(gate.to).toBe('ruinas');
    w.player.x = gate.x;
    w.player.y = gate.y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
    expect(w.note).toMatch(/Guardião/);

    const boss = w.monsters.find((m) => m.kind === 'boss')!;
    boss.hp = 1;
    w.hurt(boss, 5);
    expect(w.save.marks.boss).toBe(true);
    w.portalCd = 0;
    w.player.x = gate.x;
    w.player.y = gate.y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('ruinas');

    const chest = REGIONS.ruinas.chest!;
    w.player.x = chest.x;
    w.player.y = chest.y;
    const coins = w.save.coins;
    expect(w.claimChest()).toMatch(/40/);
    expect(w.save.coins).toBe(coins + 40);
    expect(w.claimChest()).toMatch(/aberto/);
    expect(w.save.coins).toBe(coins + 40);

    w.portalCd = 0;
    w.player.x = REGIONS.ruinas.portal.x;
    w.player.y = REGIONS.ruinas.portal.y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
  });

  it('o chefe ferido investe mais rápido', () => {
    const rush = forest();
    const boss = rush.spawn('boss', rush.player.x - 250, rush.player.y);
    boss.hp = boss.maxHp * 0.4;
    boss.patternT = 2.15;
    const x = boss.x;
    rush.step(0.35, STILL);
    expect(boss.x).toBeGreaterThan(x + 140);
  });

  it('progresso antigo sem marcas continua válido', () => {
    const raw = JSON.parse(JSON.stringify(freshSave('kael'))) as { marks?: unknown; ledger?: unknown; tx?: unknown };
    delete raw.marks;
    delete raw.ledger;
    delete raw.tx;
    const back = acceptMundoBlob(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.save.marks).toEqual({ boss: false, ruinChest: false });
    expect(back.save.ledger).toEqual([]);
    expect(back.save.tx).toEqual([]);
  });
});
