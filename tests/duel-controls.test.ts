import { describe, expect, it } from 'vitest';
import { Game, Input } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { DUEL, duelTiebreak, roundBanner } from '../src/game/duel';
import { REWIND_TIME } from '../src/game/constants';
import { CHARACTERS } from '../src/game/characters';
import { CHAR_PRICES, grantStarters, newProfile, owns, STARTER_CHARS } from '../src/game/economy';
import { ARROW_LAYOUT, ESDF_KEYS, LEGACY_ESDF, LEGACY_QWER, LEGACY_SHIFT, LEGACY_SHIFT_NOTEBOOK, NOTEBOOK_KEYS, WASD_KEYS, assistAim, clickFireLatch, nearestAim, presetKeys, stepAim } from '../src/ui/input';
import { loadSettings, migrateMoveKeys } from '../src/ui/settings';
import { ClientGame } from '../src/net/clientGame';
import { encodeSnapshot } from '../src/net/protocol';

const STEP = 1 / 60;
const idle: Input = { mx: 0, my: 0, dash: false, ability: false };
const both = { a: idle, b: idle };

function duel(extra: { roundSec?: number; suddenSec?: number } = {}) {
  const g = new Game({
    arena: getArena('lab'),
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
    ...extra,
  });
  while (g.phase !== 'play') g.step(STEP, both);
  for (const p of g.players) p.invulnT = 0;
  g.zoneEvents = [];
  return g;
}

function finishCall(g: Game) {
  g.step(DUEL.callSec + 0.05, both);
  if (g.phase === 'rewind') g.step(REWIND_TIME + 0.05, both);
}

function mirror() {
  return new ClientGame({
    you: 'a',
    mode: 'duelo',
    arena: 'lab',
    roster: [
      { id: 'a', char: 'kael', skin: 'padrao', trail: 'nenhum', name: 'A', isBot: false },
      { id: 'b', char: 'luna', skin: 'padrao', trail: 'nenhum', name: 'B', isBot: false },
    ],
  });
}

describe('previsão online', () => {
  it('encostar numa parede não quebra o quadro nem atravessa', () => {
    const g = duel();
    const cg = mirror();
    g.players[0].x = 150;
    g.players[0].y = 360;
    cg.applySnapshot(encodeSnapshot(g, true, false), []);
    expect(cg.phase).toBe('play');
    expect(() => {
      for (let i = 0; i < 40; i++) cg.update(STEP, { mx: 1, my: 0, dash: false, ability: false, aim: 0 });
    }).not.toThrow();
    expect(cg.human.x).toBeGreaterThan(150);
    expect(cg.human.x).toBeLessThanOrEqual(170 - 16 + 0.2);
  });
});

describe('X1 com morte súbita', () => {
  it('a rodada dura 2 minutos e a morte súbita 60 segundos', () => {
    const g = duel();
    expect(DUEL.roundSec).toBe(120);
    expect(DUEL.mult).toBe(2);
    expect(g.roundDur).toBe(120);
    expect(g.suddenLimit).toBe(60);
    expect(g.timeLeft()).toBeGreaterThan(100);
  });

  it('uma eliminação fecha o round na hora, grava o eco e não soma o ponto duas vezes', () => {
    const g = duel();
    const [a, b] = g.players;
    b.hp = 12;
    g.hurt(b, 40, a.id, 'shot', 0);
    g.step(STEP, both);
    expect(g.phase).toBe('call');
    expect(g.callReason).toBe('kill');
    expect(g.callWinner).toBe(a.id);
    expect(a.roundWins).toBe(1);
    expect(b.roundWins).toBe(0);
    expect(g.echoes.count).toBeGreaterThan(0);
    g.step(0.4, both);
    g.step(0.4, both);
    expect(a.roundWins).toBe(1);
    expect(g.phase).toBe('call');
    const me = roundBanner(a.id, g.callWinner, g.callReason, '1 × 0');
    const foe = roundBanner(b.id, g.callWinner, g.callReason, '0 × 1');
    expect(me.title).toBe('Você venceu');
    expect(foe.title).toBe('Você perdeu');
    expect(me.sub).toBe('');
    expect(foe.sub).toBe('');
    expect(me.kind).not.toBe(foe.kind);
  });

  it('o tempo esgotado entra em morte súbita sem mexer na vida', () => {
    const g = duel();
    const hp = g.players.map((p) => p.hp);
    g.roundT = g.roundDur - 0.02;
    g.drainEvents();
    g.step(0.05, both);
    expect(g.sudden).toBe(true);
    expect(g.phase).toBe('play');
    expect(g.players.map((p) => p.hp)).toEqual(hp);
    expect(g.drainEvents().some((e) => e.type === 'sudden')).toBe(true);
    expect(g.echoes.count).toBe(0);
  });

  it('o dobro vale uma vez em cada golpe e não acumula no seguinte', () => {
    const g = duel();
    g.sudden = true;
    const [a, b] = g.players;
    b.invulnT = 0;
    const before = b.hp;
    g.hurt(b, 13, a.id, 'shot', 0);
    expect(before - b.hp).toBe(26);
    g.hurt(b, 13, a.id, 'shot', 0);
    expect(before - b.hp).toBe(52);
    expect(a.stats.dmg).toBe(52);
  });

  it('uma eliminação na morte súbita vence o round', () => {
    const g = duel();
    g.sudden = true;
    const [a, b] = g.players;
    b.hp = 20;
    b.invulnT = 0;
    g.hurt(b, 13, a.id, 'shot', 0);
    expect(b.alive).toBe(false);
    g.step(STEP, both);
    expect(g.phase).toBe('call');
    expect(g.callReason).toBe('kill');
    expect(a.roundWins).toBe(1);
  });

  it('o limite da morte súbita é configurável e o empate não usa eco', () => {
    const g = duel({ suddenSec: 5 });
    expect(g.suddenLimit).toBe(5);
    g.sudden = true;
    g.suddenT = 4.2;
    g.step(0.5, both);
    expect(g.phase).toBe('play');
    g.step(0.5, both);
    expect(g.phase).toBe('call');
    expect(g.callReason).toBe('draw');
    expect(g.callWinner).toBeNull();
    expect(g.players.every((p) => p.roundWins === 0)).toBe(true);
    const bothDraw = [g.players[0].id, g.players[1].id].map((id) => roundBanner(id, null, 'draw', '0 × 0').title);
    expect(bothDraw).toEqual(['Empate', 'Empate']);
  });

  it('desempata por vida e, se a vida for igual, por dano causado', () => {
    expect(duelTiebreak([{ id: 'a', hp: 10, dmg: 1 }, { id: 'b', hp: 10, dmg: 1 }])).toEqual({ winner: null, reason: 'draw' });
    const byHp = duel();
    byHp.sudden = true;
    byHp.suddenT = byHp.suddenLimit;
    byHp.players[0].hp = 90;
    byHp.players[1].hp = 40;
    byHp.players[0].stats.dmg = 5;
    byHp.players[1].stats.dmg = 5;
    byHp.step(0.05, both);
    expect(byHp.callWinner).toBe('a');
    expect(byHp.callReason).toBe('hp');
    expect(byHp.players[0].roundWins).toBe(1);

    const byDmg = duel();
    byDmg.sudden = true;
    byDmg.suddenT = byDmg.suddenLimit;
    byDmg.players[0].hp = 70;
    byDmg.players[1].hp = 70;
    byDmg.players[0].stats.dmg = 12;
    byDmg.players[1].stats.dmg = 40;
    byDmg.step(0.05, both);
    expect(byDmg.callWinner).toBe('b');
    expect(byDmg.callReason).toBe('damage');
  });

  it('a rodada seguinte zera a vida e mantém o placar', () => {
    const g = duel();
    const [a, b] = g.players;
    b.hp = 8;
    g.hurt(b, 30, a.id, 'shot', 0);
    g.step(STEP, both);
    expect(a.roundWins).toBe(1);
    g.step(DUEL.callSec + 0.05, both);
    expect(g.phase).toBe('rewind');
    expect(a.roundWins).toBe(1);
    g.step(REWIND_TIME + 0.05, both);
    expect(g.phase).toBe('prep');
    expect(g.round).toBe(2);
    expect(a.roundWins).toBe(1);
    expect(b.roundWins).toBe(0);
    expect(a.hp).toBe(a.maxHp);
    expect(b.hp).toBe(b.maxHp);
    expect(g.sudden).toBe(false);
  });

  it('três rounds vencidos encerram a partida; cinco empates empatam o duelo', () => {
    const g = duel();
    g.players[0].roundWins = 2;
    g.players[1].hp = 5;
    g.hurt(g.players[1], 20, g.players[0].id, 'shot', 0);
    g.step(STEP, both);
    finishCall(g);
    expect(g.phase).toBe('results');
    expect(g.winners).toEqual(['a']);

    const draw = duel();
    draw.round = 5;
    draw.sudden = true;
    draw.suddenT = draw.suddenLimit;
    draw.step(0.05, both);
    expect(draw.callReason).toBe('draw');
    finishCall(draw);
    expect(draw.phase).toBe('results');
    expect([...draw.winners].sort()).toEqual(['a', 'b']);
  });

  it('o relógio do cliente não liga a morte súbita sozinho', () => {
    const cg = mirror();
    cg.phase = 'play';
    cg.roundDur = 120;
    cg.roundT = 119;
    for (let i = 0; i < 30; i++) cg.update(1, idle);
    expect(cg.sudden).toBe(false);
    expect(cg.timeLeft()).toBe(0);

    const g = duel();
    g.sudden = true;
    g.suddenT = 10;
    const live = mirror();
    live.applySnapshot(encodeSnapshot(g, false), []);
    expect(live.sudden).toBe(true);
    expect(live.suddenLeft).toBeCloseTo(50, 0);
    live.update(2, idle);
    expect(live.sudden).toBe(true);
    expect(live.suddenLeft).toBeLessThan(49);

    g.suddenT = g.suddenLimit;
    g.step(0.05, both);
    const end = mirror();
    const snap = encodeSnapshot(g, false);
    expect(snap.ph).toBe('call');
    expect(snap.cw).toBe('');
    end.applySnapshot(snap, []);
    expect(end.phase).toBe('call');
    expect(end.callWinner).toBeNull();
  });

  it('os outros modos ainda rebobinam', () => {
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'dupla',
      roster: [
        { id: 'a', char: 'kael', isBot: false },
        { id: 'b', char: 'luna', isBot: false },
      ],
    });
    while (g.phase !== 'play') g.step(STEP, both);
    g.roundT = g.roundDur;
    g.step(0.05, both);
    expect(g.sudden).toBe(true);
    expect(g.phase).toBe('play');
  });
});

describe('controles de notebook e elenco inicial', () => {
  it('andar não muda a mira', () => {
    const g = duel();
    const a = g.players[0];
    a.x = 500;
    a.y = 360;
    const aim = Math.PI;
    g.step(STEP, { a: { ...idle, mx: 1, my: 0, aim }, b: idle });
    expect(a.aim).toBeCloseTo(aim, 5);
    expect(a.vx).toBeGreaterThan(0);
    g.step(STEP, { a: { ...idle, mx: 1, my: 1, aim: 0 }, b: idle });
    expect(a.aim).toBeCloseTo(0, 5);
    expect(a.vx).toBeGreaterThan(0);
    expect(a.vy).toBeGreaterThan(0);
  });

  it('a mira do notebook tem limite por quadro e o clique curto alterna o tiro', () => {
    expect(Math.abs(stepAim(0, Math.PI, 1))).toBeLessThanOrEqual(0.45 + 1e-6);
    expect(stepAim(0, 0.1, 1)).toBeCloseTo(0.1);
    expect(clickFireLatch(false, 80, true)).toBe(true);
    expect(clickFireLatch(true, 80, true)).toBe(false);
    expect(clickFireLatch(false, 400, true)).toBe(false);
    expect(clickFireLatch(true, 400, true)).toBe(true);
    expect(clickFireLatch(false, 40, false)).toBe(false);
    const keys = presetKeys('notebook');
    expect(keys).toEqual(NOTEBOOK_KEYS);
    expect(keys.item).toBe('KeyX');
    expect(keys.bonus).toBe('KeyF');
    expect(keys.skill).toBe('KeyE');
    expect(keys.dash).toBe('Space');
    expect(keys.ability).toBe('KeyQ');
    expect(keys.ult).toBe('KeyR');
    expect(keys.plasma).toBe('KeyZ');
    expect(presetKeys('classic')).toEqual(WASD_KEYS);
    expect(presetKeys('classic').dash).toBe('Space');
    expect(presetKeys('classic').skill).toBe('KeyE');
    expect(presetKeys('classic').bonus).toBe('KeyF');
    expect(presetKeys('classic').plasma).toBe('KeyZ');
    expect(presetKeys('classic', 'arrows').skill).toBe('KeyW');
    expect(presetKeys('classic', 'arrows').bonus).toBe('KeyE');
    expect(presetKeys('classic', 'arrows').plasma).toBe('KeyZ');
    expect(presetKeys('classic', 'esdf').bonus).toBe('KeyA');
    expect(presetKeys('classic', 'esdf').plasma).toBe('KeyZ');
    const partial = { ability: 'KeyQ', skill: 'KeyE', ult: 'KeyR', dash: 'ShiftLeft', item: 'Space', bonus: 'KeyF' };
    const shifted = migrateMoveKeys({ keys: partial });
    expect(shifted?.moveScheme).toBe('wasd');
    expect(shifted?.keys.skill).toBe('KeyE');
    expect(shifted?.keys.dash).toBe('Space');
    expect(shifted?.keys.bonus).toBe('KeyF');
    expect(shifted?.keys.plasma).toBe('KeyZ');
    const qwer = migrateMoveKeys({ moveScheme: 'arrows', keys: { ...LEGACY_QWER } });
    expect(qwer?.moveScheme).toBe('wasd');
    expect(qwer?.keys.ability).toBe('KeyQ');
    expect(qwer?.keys.skill).toBe('KeyE');
    expect(qwer?.keys.ult).toBe('KeyR');
    expect(qwer?.keys.bonus).toBe('KeyF');
    expect(qwer?.keys.plasma).toBe('KeyZ');
    expect(qwer?.keys.dash).toBe('Space');
    expect(migrateMoveKeys({ moveScheme: 'wasd', keys: { ...LEGACY_SHIFT } })?.keys.dash).toBe('Space');
    expect(migrateMoveKeys({ moveScheme: 'wasd', keys: { ...LEGACY_SHIFT } })?.keys.plasma).toBe('KeyZ');
    expect(migrateMoveKeys({ moveScheme: 'wasd', keys: WASD_KEYS })).toBeNull();
    expect(migrateMoveKeys({ moveScheme: 'arrows', keys: ARROW_LAYOUT })).toBeNull();
    expect(migrateMoveKeys({ moveScheme: 'esdf', keys: ESDF_KEYS })).toBeNull();
    expect(migrateMoveKeys({ moveScheme: 'esdf', keys: LEGACY_ESDF })).toBeNull();
    expect(migrateMoveKeys({ moveScheme: 'wasd', keys: { ...WASD_KEYS, ult: 'KeyT' } })).toBeNull();
    expect(migrateMoveKeys({ moveScheme: 'arrows', keys: { ...LEGACY_QWER, plasma: 'KeyC' } })).toBeNull();
    expect(migrateMoveKeys({ control: 'notebook', keys: { ...LEGACY_SHIFT_NOTEBOOK } })).toEqual({ moveScheme: 'wasd', keys: NOTEBOOK_KEYS });
    expect(migrateMoveKeys({ keys: { skill: 'KeyE', dash: 'Space', bonus: 'KeyF' } })).toBeNull();
    const mem = new Map<string, string>();
    mem.set('eco.settings.v1', JSON.stringify({ moveScheme: 'arrows', control: 'classic', keys: LEGACY_QWER }));
    const prev = (globalThis as { localStorage?: Storage }).localStorage;
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    try {
      const loaded = loadSettings();
      expect(loaded.moveScheme).toBe('wasd');
      expect(loaded.keys.skill).toBe('KeyE');
      expect(loaded.keys.bonus).toBe('KeyF');
      expect(loaded.keys.plasma).toBe('KeyZ');
      expect(loaded.keys.dash).toBe('Space');
      const saved = JSON.parse(mem.get('eco.settings.v1') ?? '{}');
      expect(saved.moveScheme).toBe('wasd');
      expect(saved.keys.skill).toBe('KeyE');
    } finally {
      (globalThis as { localStorage?: Storage }).localStorage = prev;
    }
    expect(assistAim(0, 0, 0, [{ x: 100, y: 8 }])).toBeGreaterThan(0);
    expect(assistAim(0, 0, 0, [{ x: -200, y: 0 }])).toBe(0);
    expect(nearestAim(0, 0, [{ id: 'far', x: 300, y: 0 }, { id: 'near', x: 40, y: 0 }])?.id).toBe('near');
  });

  it('os iniciais entram sem apagar moedas nem personagens comprados', () => {
    const fresh = newProfile();
    expect(STARTER_CHARS).toHaveLength(28);
    expect([...STARTER_CHARS].sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
    for (const id of STARTER_CHARS) {
      expect(CHAR_PRICES[id]).toBe(0);
      expect(owns(fresh, 'char:' + id)).toBe(true);
    }
    expect(fresh.owned.filter((id) => id.startsWith('char:'))).toHaveLength(28);
    expect(CHAR_PRICES.nyx).toBe(0);
    expect(CHAR_PRICES.rex).toBe(0);
    expect(CHAR_PRICES.luna).toBe(0);
    expect(owns(fresh, 'char:nyx')).toBe(true);
    expect(owns(fresh, 'char:luna')).toBe(true);
    expect(CHARACTERS).toHaveLength(28);
    const freeIds = Object.entries(CHAR_PRICES).filter(([, price]) => price === 0).map(([id]) => id);
    expect(freeIds.sort()).toEqual([...STARTER_CHARS].sort());
    expect(CHARACTERS.every((c) => c.id in CHAR_PRICES)).toBe(true);

    const old = newProfile();
    old.coins = 440;
    old.xp = 90;
    old.owned = ['char:kael', 'char:nyx', 'skin:padrao', 'trail:nenhum'];
    expect(grantStarters(old)).toBe(true);
    expect(old.coins).toBe(440);
    expect(old.xp).toBe(90);
    expect(old.owned.filter((id) => id === 'char:kael')).toHaveLength(1);
    expect(old.owned).toContain('char:nyx');
    expect(old.owned).toContain('char:iris');
    expect(old.owned).toContain('char:clave');
    expect(grantStarters(old)).toBe(false);
  });
});
