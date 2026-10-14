import { describe, expect, it } from 'vitest';
import { think, losClear, LEASH } from '../src/game/mundo/ai';
import { acceptMundoBlob } from '../src/game/mundo/blob';
import { ANOMALY, turnIn } from '../src/game/mundo/quest';
import { REGIONS } from '../src/game/mundo/regions';
import { freshSave } from '../src/game/mundo/rules';
import { MundoWorld, STILL } from '../src/game/mundo/sim';

const open = () => false;

describe('missão e criaturas', () => {
  it('a sentinela não vê através da parede e o slime respeita a coleira', () => {
    const wall = (x: number) => x > 40 && x < 60;
    expect(losClear(0, 0, 100, 0, wall)).toBe(false);
    expect(losClear(0, 0, 30, 0, wall)).toBe(true);
    const far = think(
      { kind: 'chaser', x: LEASH + 30, y: 0, homeX: 0, homeY: 0, speed: 100, alert: 0, cd: 0 },
      { x: LEASH + 50, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(far.state).toBe('return');
    expect(far.vx).toBeLessThan(0);
    const melee = think(
      { kind: 'chaser', x: 0, y: 0, homeX: 0, homeY: 0, speed: 100, alert: 0, cd: 0 },
      { x: 30, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(melee.melee).toBe(true);
    const crowded = think(
      { kind: 'chaser', x: 0, y: 0, homeX: 0, homeY: 0, speed: 100, alert: 0, cd: 0 },
      { x: 30, y: 0, dead: false },
      { blocked: open, attackers: 2 },
    );
    expect(crowded.melee).toBe(false);
    const shy = think(
      { kind: 'ranged', x: 0, y: 0, homeX: 0, homeY: 0, speed: 80, alert: 0, cd: 0 },
      { x: 50, y: 0, dead: false },
      { blocked: open, attackers: 0 },
    );
    expect(shy.state).toBe('flee');
    expect(shy.vx).toBeLessThan(0);
  });

  it('Os Ruídos da Floresta paga uma vez e abre a clareira', () => {
    const w = new MundoWorld(freshSave('kael'));
    expect(w.talkNpc('pesquisadora')).toMatch(/fragmento/);
    expect(w.save.quest.step).toBe(1);
    w.portalCd = 0;
    w.player.x = REGIONS.vila.portal.x;
    w.player.y = REGIONS.vila.portal.y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
    expect(w.save.quest.step).toBe(2);
    w.portalCd = 0;
    w.player.x = REGIONS.floresta.gates![0].x;
    w.player.y = REGIONS.floresta.gates![0].y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('floresta');
    expect(w.note).toMatch(/Bloqueado/);
    w.player.x = ANOMALY.x;
    w.player.y = ANOMALY.y;
    w.step(0.05, STILL);
    expect(w.save.quest.step).toBe(3);
    const coins = w.save.coins;
    w.talkNpc('pesquisadora');
    expect(w.save.quest.step).toBe(4);
    expect(w.save.coins).toBe(coins + 25);
    expect(w.save.xp + (w.save.level - 1) * 40).toBeGreaterThan(0);
    const again = w.save.coins;
    w.talkNpc('pesquisadora');
    expect(w.save.coins).toBe(again);
    w.regionId = 'floresta';
    w.portalCd = 0;
    w.player.x = REGIONS.floresta.gates![0].x;
    w.player.y = REGIONS.floresta.gates![0].y;
    w.step(0.05, STILL);
    expect(w.regionId).toBe('clareira');
    const plain = freshSave('kael');
    const raw = JSON.parse(JSON.stringify(plain)) as { quest?: unknown };
    delete raw.quest;
    const back = acceptMundoBlob(raw);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.save.quest.step).toBe(0);
    const paid = turnIn({ ...freshSave('kael'), quest: { step: 3 } });
    expect(paid.paid).toBe(true);
    expect(turnIn(paid.save).paid).toBe(false);
  });
});
