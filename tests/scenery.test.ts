import { describe, expect, it } from 'vitest';
import { blocked, REGIONS } from '../src/game/mundo/regions';
import { NPCS, PROPS, propSolids } from '../src/game/mundo/scenery';
import { freshSave } from '../src/game/mundo/rules';
import { MundoWorld, STILL } from '../src/game/mundo/sim';

describe('cenário do ECO Mundo', () => {
  it('deixa a porta da loja, do banco, o spawn e os portais andáveis', () => {
    const vila = REGIONS.vila;
    expect(blocked(vila, vila.shop!.x, vila.shop!.y)).toBe(false);
    expect(blocked(vila, vila.bank!.x, vila.bank!.y)).toBe(false);
    expect(blocked(vila, vila.spawn.x, vila.spawn.y)).toBe(false);
    expect(blocked(vila, vila.portal.x, vila.portal.y)).toBe(false);
    expect(blocked(vila, vila.portal.x - 80, vila.portal.y)).toBe(false);
    const mata = REGIONS.floresta;
    expect(blocked(mata, mata.arrival.x, mata.arrival.y)).toBe(false);
    expect(blocked(mata, mata.portal.x, mata.portal.y)).toBe(false);
    expect(blocked(mata, mata.arrival.x + 80, mata.arrival.y)).toBe(false);
  });

  it('o corpo da loja e da forja bloqueia, e a floresta continua com os mesmos monstros', () => {
    const shop = PROPS.vila.find((p) => p.kind === 'shop')!;
    expect(blocked(REGIONS.vila, shop.x, shop.y - 70)).toBe(true);
    const forge = PROPS.vila.find((p) => p.kind === 'forge')!;
    expect(blocked(REGIONS.vila, forge.x, forge.y - 60)).toBe(true);
    expect(propSolids('vila').length).toBeGreaterThan(4);
    expect(REGIONS.floresta.spawns.map((s) => s.kind).sort()).toEqual(['boss', 'caller', 'caller', 'chaser', 'chaser', 'chaser', 'ranged', 'ranged']);
  });

  it('anda da praça até a loja e até o portal sem atravessar parede', () => {
    const w = new MundoWorld(freshSave('kael'));
    const shop = REGIONS.vila.shop!;
    for (let i = 0; i < 240; i++) {
      if (Math.hypot(shop.x - w.player.x, shop.y - w.player.y) < 24) break;
      const dx = Math.sign(shop.x - w.player.x);
      const dy = Math.sign(shop.y - w.player.y);
      w.step(1 / 30, { ...STILL, mx: dx, my: dy });
    }
    expect(w.near()).toBe('shop');
    expect(blocked(REGIONS.vila, w.player.x, w.player.y)).toBe(false);

    const road = new MundoWorld(freshSave('kael'));
    for (let i = 0; i < 400 && road.player.x < 1550; i++) road.step(1 / 30, { ...STILL, mx: 1, my: 0 });
    expect(road.player.x).toBeGreaterThan(1500);
    expect(road.regionId).toBe('vila');
  });

  it('cada NPC tem nome, lugar e fala', () => {
    expect(NPCS.map((n) => n.id)).toEqual(['mercador', 'mecanico', 'pesquisadora', 'guardiao', 'protetor', 'explorador']);
    for (const n of NPCS) {
      expect(n.name.length).toBeGreaterThan(1);
      expect(n.lines.length).toBeGreaterThan(0);
      expect(n.lines.every((line) => line.length > 8)).toBe(true);
      expect(blocked(REGIONS[n.region], n.x, n.y)).toBe(false);
    }
  });
});
