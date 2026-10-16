import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { sanitizeLoadout } from '../src/game/balance';
import { cinematicOf, fits } from '../src/game/cinematic';
import { CATALOG, kitOf, studioOf } from '../src/game/elements';
import { rangeTier } from '../src/game/rangeTiers';
import { comboDockState } from '../src/game/comboDock';
import { poseForSprite } from '../src/render/sprites';
import { portalPrompt, leverPrompt } from '../src/game/interactPrompt';

const STEP = 1 / 60;
const idle = { mx: 0, my: 0 } as Input;

function duel(extra: Partial<ConstructorParameters<typeof Game>[0]> = {}) {
  const g = new Game({
    arena: getArena('lab'),
    humanChar: 'luna',
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: 'duelo',
    roster: [
      { id: 'a', char: 'luna', isBot: false, loadout: extraLoad(extra) },
      { id: 'b', char: 'kael', isBot: false },
    ],
    roundSec: 30,
    ...strip(extra),
  });
  while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
  for (const p of g.players) p.invulnT = 0;
  g.drainEvents();
  return g;
}

function extraLoad(extra: Partial<ConstructorParameters<typeof Game>[0]>) {
  const roster = extra.roster;
  return roster?.[0]?.loadout;
}

function strip(extra: Partial<ConstructorParameters<typeof Game>[0]>) {
  const { roster: _roster, ...rest } = extra;
  return rest;
}

describe('fase 5', () => {
  it('guarda um poder em qualquer tecla e o kit continua se a escolha estiver vazia', () => {
    const lo = sanitizeLoadout({
      picks: { ability: 'horizonte-igneo', ult: 'apocalipse-solar', skill: 'nao-existe', bonus: 'tsunami-celestial' },
    });
    expect(lo.picks?.ability).toBe('horizonte-igneo');
    expect(lo.picks?.ult).toBe('apocalipse-solar');
    expect(lo.picks?.skill).toBeUndefined();
    expect(lo.picks?.bonus).toBeUndefined();
    expect(sanitizeLoadout({}).picks).toBeUndefined();
    expect(kitOf('kai').powers[0].name).toBe("Jato d'Água");
  });

  it('a suprema cinematográfica avisa, espera e só fere quem ficou no círculo', () => {
    expect(fits('luna', 'apocalipse-solar')).toBe(true);
    expect(fits('kael', 'apocalipse-solar')).toBe(false);
    expect(cinematicOf('apocalipse-solar')?.name).toBe('Apocalipse Solar');
    const lo = sanitizeLoadout({ picks: { ult: 'apocalipse-solar' } });
    const g = duel({ roster: [{ id: 'a', char: 'luna', isBot: false, loadout: lo }, { id: 'b', char: 'kael', isBot: false }] });
    const [a, b] = g.players;
    a.ultCharge = 100;
    a.x = 500;
    a.y = 360;
    b.x = 620;
    b.y = 360;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0 }, b: idle });
    const wind = g.events.find((e) => e.type === 'windup' && e.ult);
    expect(wind && wind.type === 'windup' ? wind.r : 0).toBeGreaterThan(90);
    expect(b.hp).toBe(before);
    b.x = 1100;
    for (let i = 0; i < 70; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(before);
    expect(a.ultCharge).toBeLessThan(5);
    expect(a.powerCd[2]).toBeGreaterThan(0);
  });

  it('o impacto acerta no máximo 3 e não pega aliado', () => {
    const lo = sanitizeLoadout({ picks: { ult: 'julgamento-ceus' } });
    const roster = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
      id,
      char: i === 0 ? 'kael' : 'luna',
      isBot: false,
      loadout: i === 0 ? lo : undefined,
    }));
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster,
      roundSec: 20,
    });
    while (g.phase !== 'play') g.step(STEP, {});
    for (const p of g.players) {
      p.invulnT = 0;
      p.x = 640;
      p.y = 360;
    }
    const a = g.players[0];
    a.ultCharge = 100;
    a.x = 560;
    const hp = new Map(g.players.map((p) => [p.id, p.hp]));
    g.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 80 } });
    for (let i = 0; i < 70; i++) g.step(STEP, {});
    const hit = g.players.filter((p) => p.id !== 'a' && p.hp < (hp.get(p.id) ?? 0));
    expect(hit.length).toBe(3);
    expect(hit.every((p) => p.hp === (hp.get(p.id) ?? 0) - 36)).toBe(true);

    const allyLo = sanitizeLoadout({ picks: { ult: 'apocalipse-solar' } });
    const ag = new Game({
      arena: getArena('lab'),
      humanChar: 'luna',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster: [
        { id: 'a', char: 'luna', isBot: false, loadout: allyLo },
        { id: 'b', char: 'kai', isBot: false },
        { id: 'c', char: 'zed', isBot: false },
        { id: 'd', char: 'bruno', isBot: false },
      ],
      roundSec: 20,
    });
    while (ag.phase !== 'play') ag.step(STEP, {});
    for (const p of ag.players) {
      p.invulnT = 0;
      p.ultCharge = 100;
      p.x = 640;
      p.y = 360;
    }
    const caster = ag.players[0];
    caster.x = 560;
    const ally = ag.players[1];
    const allyHp = ally.hp;
    ag.step(STEP, { a: { ...idle, ult: true, aim: 0, ca: 0, cr: 80 } });
    for (let i = 0; i < 70; i++) ag.step(STEP, {});
    expect(ally.hp).toBe(allyHp);
    expect(ag.players[2].hp).toBeLessThan(allyHp);
  });

  it('horizonte, eco e vácuo não repetem o catálogo antigo', () => {
    expect(studioOf('lanca-solar')?.range).toBe(340);
    expect(studioOf('horizonte-igneo')?.trick).toBe('horizon');
    expect(rangeTier(studioOf('horizonte-igneo')!.range)).toBe('extreme');
    expect(studioOf('eco-trovao')?.trick).toBe('echo-bolt');
    expect(studioOf('seta-vacuo')?.trick).toBe('vacuum');
    expect(CATALOG.filter((s) => s.trick === 'horizon' || s.trick === 'echo-bolt' || s.trick === 'vacuum')).toHaveLength(3);
    const lo = sanitizeLoadout({ picks: { ability: 'eco-trovao' } });
    const g = duel({ roster: [{ id: 'a', char: 'luna', isBot: false, loadout: lo }, { id: 'b', char: 'kael', isBot: false }] });
    const [a, b] = g.players;
    a.x = 500;
    a.y = 360;
    b.x = 700;
    b.y = 360;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    expect(b.hp).toBe(before - 11);
    b.x = 980;
    for (let i = 0; i < 30; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBe(before - 11);
  });

  it('a seta do vácuo puxa e o horizonte chega longe', () => {
    const far = sanitizeLoadout({ picks: { ability: 'horizonte-igneo' } });
    const g = duel({ roster: [{ id: 'a', char: 'luna', isBot: false, loadout: far }, { id: 'b', char: 'kael', isBot: false }] });
    const [a, b] = g.players;
    a.x = 480;
    a.y = 360;
    b.x = 900;
    b.y = 360;
    const before = b.hp;
    g.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 24; i++) g.step(STEP, { a: idle, b: idle });
    expect(b.hp).toBeLessThan(before);

    const yank = sanitizeLoadout({ picks: { ability: 'seta-vacuo' } });
    const g2 = duel({ roster: [{ id: 'a', char: 'luna', isBot: false, loadout: yank }, { id: 'b', char: 'kael', isBot: false }] });
    const [c, d] = g2.players;
    c.x = 480;
    c.y = 360;
    d.x = 700;
    d.y = 360;
    g2.step(STEP, { a: { ...idle, ability: true, aim: 0, ca: 0 }, b: idle });
    for (let i = 0; i < 28; i++) g2.step(STEP, { a: idle, b: idle });
    expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeLessThan(180);
  });

  it('o cais lista o próximo passo e a pontuação de combo não muda o dano', () => {
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kai',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      comboScore: true,
      roster: [
        { id: 'a', char: 'kai', isBot: false },
        { id: 'b', char: 'kai', isBot: false },
        { id: 'c', char: 'luna', isBot: false },
        { id: 'd', char: 'luna', isBot: false },
      ],
    });
    expect(g.roundDur).toBe(240);
    const dock = comboDockState(g, { labels: ['Q', 'E', 'R', 'F'], plasmaKey: 'Z', now: 0, done: null });
    expect(dock?.steps?.length).toBe(2);
    expect(dock?.steps?.[0].startsWith('1. ')).toBe(true);
    while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle, c: idle, d: idle });
    for (const p of g.players) p.invulnT = 0;
    const [a, b, c] = g.players;
    a.x = 400;
    a.y = 360;
    b.x = 680;
    b.y = 360;
    c.x = 730;
    c.y = 360;
    const plain = new Game({
      arena: getArena('lab'),
      humanChar: 'kai',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster: [
        { id: 'a', char: 'kai', isBot: false },
        { id: 'b', char: 'kai', isBot: false },
        { id: 'c', char: 'luna', isBot: false },
        { id: 'd', char: 'luna', isBot: false },
      ],
      roundSec: 30,
    });
    while (plain.phase !== 'play') plain.step(STEP, { a: idle, b: idle, c: idle, d: idle });
    for (const p of plain.players) p.invulnT = 0;
    const [pa, pb, pc] = plain.players;
    pa.x = 400;
    pa.y = 360;
    pb.x = 680;
    pb.y = 360;
    pc.x = 730;
    pc.y = 360;
    const press = { a: { ...idle, bonus: true, aim: 0, ca: 0 }, b: { ...idle, skill: true, aim: 0, ca: 0, cr: 50 }, c: idle, d: idle };
    g.step(STEP, press);
    plain.step(STEP, press);
    expect(c.hp).toBe(pc.hp);
    expect(b.score).toBeGreaterThan(0);
    expect(pb.score).toBe(0);
  });

  it('portal e alavanca só obedecem a tecla, e a alavanca abre uma vez', () => {
    expect(portalPrompt('G')).toBe('Portal — pressione G para atravessar');
    expect(leverPrompt('G')).toBe('Alavanca — pressione G para acionar');
    const arena = getArena('lab');
    const lever = arena.levers![0];
    const g = new Game({
      arena,
      humanChar: 'kael',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'a', char: 'kael', isBot: false },
        { id: 'b', char: 'luna', isBot: false },
      ],
      roundSec: 20,
    });
    while (g.phase !== 'play') g.step(STEP, { a: idle, b: idle });
    const me = g.human;
    me.x = lever.x;
    me.y = lever.y;
    const door = lever.door;
    const inside = g.isFree(door.x + door.w / 2, door.y + door.h / 2, 4);
    expect(inside).toBe(false);
    g.step(STEP, { a: idle, b: idle });
    expect(g.levers[0].open).toBe(false);
    g.step(STEP, { a: { ...idle, interact: true }, b: idle });
    expect(g.levers[0].open).toBe(true);
    expect(g.isFree(door.x + door.w / 2, door.y + door.h / 2, 4)).toBe(true);
    g.step(STEP, { a: { ...idle, interact: true }, b: idle });
    expect(g.levers[0].open).toBe(true);
  });

  it('a pose de frente guarda cast e windup', () => {
    expect(poseForSprite('down', 'cast')).toBe('cast');
    expect(poseForSprite('down', 'windup')).toBe('windup');
    expect(poseForSprite('side', 'cast')).toBe('cast');
  });
});
