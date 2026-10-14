import { describe, expect, it } from 'vitest';
import { acceptMundoBlob as serverAccept } from '../server/mundo';
import { primaryOf, WEAPONS } from '../src/game/weapons';
import { acceptMundoBlob, parseMundo } from '../src/game/mundo/blob';
import { REGIONS } from '../src/game/mundo/regions';
import {
  TOMB_MS,
  abilityEffect,
  addXp,
  bossPhase,
  canDamage,
  derived,
  freshSave,
  makeGear,
  rollLoot,
  rollRarity,
  spendPoint,
} from '../src/game/mundo/rules';
import { MundoWorld, STILL } from '../src/game/mundo/sim';

function forest(char = 'kael') {
  const w = new MundoWorld(freshSave(char), 0, () => 0.5);
  w.portalCd = 0;
  const p = REGIONS.vila.portal;
  w.player.x = p.x;
  w.player.y = p.y;
  w.step(0.05, STILL);
  w.monsters.length = 0;
  w.shots.length = 0;
  w.drops.length = 0;
  return w;
}

describe('ECO Mundo', () => {
  it('começa solo na vila, sem monstros, com sessão pronta para co-op e PvP por zona', () => {
    const w = new MundoWorld(freshSave('kael'));
    expect(w.regionId).toBe('vila');
    expect(w.monsters).toHaveLength(0);
    expect(w.save.session).toEqual({ mode: 'solo', pvpZones: [] });
    expect(w.save.party).toEqual([]);
    w.step(1, STILL);
    expect(w.regionId).toBe('vila');
    expect(w.monsters).toHaveLength(0);
    const snap = w.snapshot();
    expect(snap.session.mode).toBe('solo');
    expect(snap.actors.some((a) => a.kind === 'player' && a.team === 0)).toBe(true);
    const home = new MundoWorld(freshSave('kael'));
    home.player.x = REGIONS.vila.shop!.x;
    home.player.y = REGIONS.vila.shop!.y;
    expect(home.near()).toBe('shop');
    home.player.x = REGIONS.vila.bank!.x;
    home.player.y = REGIONS.vila.bank!.y;
    expect(home.near()).toBe('bank');
    home.player.x = REGIONS.vila.spawn.x;
    home.player.y = REGIONS.vila.spawn.y;
    expect(home.near()).toBeNull();
  });

  it('só troca de região ao pisar no portal, e a floresta traz os três tipos e o chefe', () => {
    const w = new MundoWorld(freshSave('kael'));
    const p = REGIONS.vila.portal;
    w.player.x = p.x - 80;
    w.player.y = p.y;
    w.step(0.1, STILL);
    expect(w.regionId).toBe('vila');
    w.portalCd = 0;
    w.player.x = p.x;
    w.player.y = p.y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
    expect(w.monsters.map((m) => m.kind).sort()).toEqual(['boss', 'caller', 'caller', 'chaser', 'chaser', 'chaser', 'ranged', 'ranged']);
    const back = w.player.x;
    expect(Math.hypot(back - REGIONS.floresta.portal.x, w.player.y - REGIONS.floresta.portal.y)).toBeGreaterThan(52);
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
  });

  it('sobe de nível com pontos e os atributos mudam vida, dano, velocidade e recarga', () => {
    let s = addXp(freshSave('kael'), 39);
    expect(s.level).toBe(1);
    expect(spendPoint(s, 'hp')).toBeNull();
    s = addXp(s, 1);
    expect(s.level).toBe(2);
    expect(s.points).toBe(1);
    expect(s.xp).toBe(0);
    s = spendPoint(s, 'hp')!;
    expect(derived(s).maxHp).toBe(115);
    s = { ...s, points: 1, stats: { ...s.stats, dmg: 0 } };
    s = spendPoint(s, 'dmg')!;
    expect(derived(s).dmgMul).toBeCloseTo(1.08);
    s = { ...s, points: 1 };
    s = spendPoint(s, 'speed')!;
    expect(derived(s).speed).toBe(232);
    s = { ...s, points: 10, stats: { ...s.stats, cd: 0 } };
    for (let i = 0; i < 10; i++) s = spendPoint(s, 'cd')!;
    expect(derived(s).cdMul).toBeCloseTo(0.6);
    const cap = addXp(freshSave('kael'), 1e7);
    expect(cap.level).toBe(30);
    expect(cap.points).toBe(29);
    const relic = makeGear('relic', 'legendary', 1);
    expect(derived({ ...freshSave('kael'), relic }).cdMul).toBeCloseTo(0.85);
    expect(derived({ ...freshSave('kael'), armor: makeGear('armor', 'legendary', 2) }).armor).toBeCloseTo(0.25);
  });

  it('raridade: o chefe cai bem mais para épico e lendário', () => {
    expect(rollRarity(() => 0.5, false)).toBe('common');
    expect(rollRarity(() => 0.8, false)).toBe('rare');
    expect(rollRarity(() => 0.95, false)).toBe('epic');
    expect(rollRarity(() => 0.995, false)).toBe('legendary');
    expect(rollRarity(() => 0.05, true)).toBe('common');
    expect(rollRarity(() => 0.2, true)).toBe('rare');
    expect(rollRarity(() => 0.5, true)).toBe('epic');
    expect(rollRarity(() => 0.9, true)).toBe('legendary');
    const seq = [0.5, 0, 0.9, 0, 0.2];
    let i = 0;
    const loot = rollLoot(() => seq[i++], 'boss');
    expect(loot.gear?.rarity).toBe('legendary');
    expect(loot.materials).toBe(6);
    expect(rollLoot(() => 0.5, 'chaser').gear).toBeNull();
  });

  it('a arma do personagem fere, e a arma equipada aumenta o dano', () => {
    const w = forest();
    const m = w.spawn('chaser', w.player.x + 48, w.player.y);
    const before = m.hp;
    w.step(0.2, { ...STILL, aim: 0, fire: true });
    const dealt = before - m.hp;
    expect(dealt).toBeGreaterThanOrEqual(WEAPONS[primaryOf('kael')].damage);
    const w2 = forest();
    w2.save.weapon = makeGear('weapon', 'legendary', 9);
    const m2 = w2.spawn('chaser', w2.player.x + 48, w2.player.y);
    const hp = m2.hp;
    w2.step(0.2, { ...STILL, aim: 0, fire: true });
    expect(hp - m2.hp).toBeGreaterThan(dealt);
  });

  it('perseguidor aproxima e acerta, atirador mantém distância e dispara, chamador foge e chama', () => {
    const w = forest();
    const chaser = w.spawn('chaser', w.player.x, w.player.y - 220);
    w.step(1, STILL);
    expect(Math.hypot(chaser.x - w.player.x, chaser.y - w.player.y)).toBeLessThan(120);

    const hit = forest();
    hit.spawn('chaser', hit.player.x, hit.player.y - 30);
    const hp = hit.player.hp;
    hit.step(0.2, STILL);
    expect(hit.player.hp).toBeLessThan(hp);
    expect(hit.regionId).toBe('floresta');

    const far = forest();
    const ranged = far.spawn('ranged', far.player.x, far.player.y - 200);
    far.step(0.2, STILL);
    expect(far.shots.length).toBeGreaterThan(0);
    expect(Math.abs(Math.hypot(ranged.x - far.player.x, ranged.y - far.player.y) - 200)).toBeLessThan(40);

    const back = forest();
    const shy = back.spawn('ranged', back.player.x, back.player.y - 70);
    const start = Math.hypot(shy.x - back.player.x, shy.y - back.player.y);
    back.step(0.45, STILL);
    expect(Math.hypot(shy.x - back.player.x, shy.y - back.player.y)).toBeGreaterThan(start + 20);

    const call = forest();
    const caller = call.spawn('caller', call.player.x - 80, call.player.y);
    const ally = call.spawn('chaser', caller.x + 220, call.player.y);
    const x0 = caller.x;
    call.step(0.25, STILL);
    expect(caller.x).toBeLessThan(x0 - 10);
    expect(ally.alert).toBeGreaterThan(0);
  });

  it('o chefe telegrafa o golpe, abre um leque e investe', () => {
    expect(bossPhase(0)).toBe('slam');
    expect(bossPhase(1.3)).toBe('fan');
    expect(bossPhase(2.2)).toBe('charge');
    expect(bossPhase(4)).toBe('slam');
    const w = forest();
    w.spawn('boss', w.player.x + 40, w.player.y);
    const hp = w.player.hp;
    w.step(0.2, STILL);
    expect(w.player.hp).toBe(hp);
    w.step(1.2, STILL);
    expect(w.player.hp).toBeLessThan(hp);
    expect(w.shots.filter((s) => s.team === 1).length).toBeGreaterThanOrEqual(5);

    const rush = forest();
    const boss = rush.spawn('boss', rush.player.x - 250, rush.player.y);
    boss.patternT = 2.15;
    const x = boss.x;
    rush.step(0.35, STILL);
    expect(boss.x).toBeGreaterThan(x + 40);
  });

  it('habilidades reaproveitadas: investida, cura, escudo e o resto vira onda', () => {
    expect(abilityEffect('investida')).toBe('dash');
    expect(abilityEffect('cura')).toBe('heal');
    expect(abilityEffect('escudo')).toBe('shield');
    expect(abilityEffect('turbo')).toBe('aoe');
    const dash = forest('tara');
    dash.spawn('chaser', dash.player.x + 90, dash.player.y);
    const x = dash.player.x;
    const foe = dash.monsters[0].hp;
    dash.step(0.05, { ...STILL, aim: 0, ability: true });
    expect(dash.player.x).toBeGreaterThan(x + 40);
    expect(dash.monsters[0].hp).toBeLessThan(foe);

    const heal = forest('iris');
    heal.player.hp = 40;
    heal.step(0.05, { ...STILL, ability: true });
    expect(heal.player.hp).toBeGreaterThanOrEqual(80);

    const bare = forest('bruno');
    const guarded = forest('bruno');
    guarded.step(0.05, { ...STILL, ability: true });
    expect(guarded.shield).toBeGreaterThan(0);
    const a = bare.hurt(bare.player, 40);
    const b = guarded.hurt(guarded.player, 40);
    expect(b).toBeLessThan(a);

    const wave = forest('kael');
    const mob = wave.spawn('chaser', wave.player.x + 36, wave.player.y);
    const hp = mob.hp;
    wave.step(0.05, { ...STILL, ability: true });
    expect(mob.hp).toBeLessThan(hp);
  });

  it('loja, banco e morte: perde 20% da bolsa, a tumba guarda itens por 10 minutos, o banco fica', () => {
    const w = forest();
    w.clock = 5_000;
    w.save.coins = 100;
    w.save.bank = 50;
    w.save.bag = [makeGear('armor', 'rare', 4)];
    w.save.weapon = makeGear('weapon', 'common', 2);
    const gearId = w.save.bag[0].id;
    w.player.hp = 30;
    w.hurt(w.player, 500);
    expect(w.regionId).toBe('vila');
    expect(w.save.coins).toBe(80);
    expect(w.save.bank).toBe(50);
    expect(w.save.bag).toEqual([]);
    expect(w.save.weapon?.id).toBe('weapon-common-2');
    expect(w.save.tomb?.region).toBe('floresta');
    expect(w.save.tomb?.items.map((i) => i.id)).toEqual([gearId]);
    expect(w.save.tomb?.until).toBe(5_000 + TOMB_MS);
    expect(w.player.hp).toBe(w.player.maxHp);

    w.regionId = 'floresta';
    w.player.x = w.save.tomb!.x;
    w.player.y = w.save.tomb!.y;
    expect(w.claimTomb()).toMatch(/recuperados/i);
    expect(w.save.bag).toHaveLength(1);
    expect(w.save.tomb).toBeNull();

    w.save.coins = 50;
    w.save.bag = [makeGear('relic', 'epic', 8)];
    w.regionId = 'floresta';
    w.invuln = 0;
    w.hurt(w.player, 500);
    const first = gearId;
    expect(w.save.tomb?.items.some((i) => i.id === first)).toBe(false);
    expect(w.save.tomb?.items).toHaveLength(1);
    w.save.bag = [];
    w.regionId = 'floresta';
    w.invuln = 0;
    w.hurt(w.player, 500);
    expect(w.save.tomb?.items).toEqual([]);

    const shop = new MundoWorld(freshSave('kael'));
    shop.save.coins = 30;
    shop.player.hp = 50;
    expect(shop.buyPotion()).toMatch(/Poção/);
    expect(shop.save.coins).toBe(5);
    expect(shop.player.hp).toBeGreaterThan(50);
    shop.save.materials = 2;
    expect(shop.sellMats(1)).toMatch(/5/);
    shop.save.bag = [makeGear('weapon', 'rare', 1)];
    shop.sellAt(0);
    expect(shop.save.coins).toBe(10 + 22);
    shop.deposit(20);
    expect(shop.save.bank).toBe(20);
    const carried = shop.save.coins;
    shop.regionId = 'floresta';
    shop.hurt(shop.player, 999);
    expect(shop.save.bank).toBe(20);
    expect(shop.save.coins).toBe(carried - Math.floor(carried * 0.2));

    const gone = forest();
    gone.save.tomb = { x: 10, y: 10, region: 'floresta', items: [makeGear('weapon', 'common', 1)], until: gone.clock + 100 };
    gone.step(0.2, STILL);
    expect(gone.save.tomb).toBeNull();
  });

  it('a vila é segura e dois jogadores só se ferem no modo compartilhado, dentro da zona', () => {
    const home = new MundoWorld(freshSave('kael'));
    expect(home.hurt(home.player, 40)).toBe(0);
    expect(home.player.hp).toBe(home.player.maxHp);
    const session = freshSave('kael').session;
    expect(canDamage({ attackerKind: 'chaser', targetKind: 'player', attackerTeam: 1, targetTeam: 0, regionSafe: true, regionId: 'vila', session })).toBe(false);
    expect(canDamage({ attackerKind: 'player', targetKind: 'player', attackerTeam: 0, targetTeam: 1, regionSafe: false, regionId: 'floresta', session })).toBe(false);
    const shared = { mode: 'shared' as const, pvpZones: ['floresta'] };
    expect(canDamage({ attackerKind: 'player', targetKind: 'player', attackerTeam: 0, targetTeam: 1, regionSafe: false, regionId: 'vila', session: shared })).toBe(false);
    expect(canDamage({ attackerKind: 'player', targetKind: 'player', attackerTeam: 0, targetTeam: 1, regionSafe: true, regionId: 'vila', session: { mode: 'shared', pvpZones: ['vila'] } })).toBe(false);
    expect(canDamage({ attackerKind: 'player', targetKind: 'player', attackerTeam: 0, targetTeam: 1, regionSafe: false, regionId: 'floresta', session: shared })).toBe(true);
  });

  it('o servidor aceita o mesmo progresso e recusa grupo grande ou modo desconhecido', () => {
    const save = freshSave('luna');
    save.session = { mode: 'shared', pvpZones: ['floresta'] };
    save.party = ['amigo'];
    const ok = serverAccept(JSON.parse(JSON.stringify(save)));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.save.session.pvpZones).toEqual(['floresta']);
    const fake = JSON.parse(JSON.stringify(save)) as { weapon: { slot: string; rarity: string; power: number } };
    fake.weapon = { slot: 'weapon', rarity: 'common', power: 99 };
    const fixed = acceptMundoBlob(fake);
    expect(fixed.ok).toBe(true);
    if (fixed.ok) expect(fixed.save.weapon?.power).toBe(1);
    expect(acceptMundoBlob({ ...save, party: ['a', 'b', 'c'] }).ok).toBe(false);
    expect(acceptMundoBlob({ ...save, session: { mode: 'pvp', pvpZones: [] } }).ok).toBe(false);
    expect(parseMundo('{', 'kael').level).toBe(1);
    expect(parseMundo(null, 'kael').charId).toBe('kael');
  });
});
