import type { EchoDigest, RoundEchoLine } from '../systems/echo/digest';
// Formato das mensagens entre o jogo e o servidor (compartilhado pelos dois lados).
import type { CastKind, Game, GameMode, Player } from '../game/sim';
import type { Loadout } from '../game/balance';
import type { PowerId } from '../game/powerups';
import { WEAPONS, type WeaponId, type ItemId } from '../game/weapons';
import { POWER_FORMS } from '../game/elements';

export const EL_IDS = ['fire', 'ice', 'lightning', 'wind', 'nature', 'shadow', 'plasma'] as const;
export const WEAPON_IDS: WeaponId[] = Object.keys(WEAPONS) as WeaponId[];
export const ENEMY_KINDS = ['drone', 'brute', 'boss', 'pylon', 'rastejador', 'carapaca', 'cuspidor', 'xama', 'semeador'] as const;
export const ITEM_IDS: (ItemId | null)[] = [null, 'bomba', 'mina', 'gelo', 'kit', 'pulso'];
export const CAST_KINDS: CastKind[] = ['meteoro', 'feixe', 'estase', 'impacto', 'chuva', 'barragem', 'avanco', 'obsidiana', 'fissura'];
export const WALL_KINDS = ['gelo', 'barreira', 'obsidiana', 'caixa'] as const;

export interface LobbyPlayer {
  id: string;
  name: string;
  char: string;
  skin: string;
  trail: string;
  host: boolean;
  logged: boolean;
  ready?: boolean;
  /** caiu a conexão: a vaga fica guardada alguns segundos esperando a volta */
  away?: boolean;
}

/** versão do protocolo: o jogo e o servidor precisam falar a mesma (um app velho no celular não entra numa sala nova) */
export const PROTO = 12;

export interface RoomInfo {
  code: string;
  mode: GameMode;
  arena: string;
  bots: number;
  state: 'lobby' | 'playing';
  players: LobbyPlayer[];
  /** sala aberta da busca automática */
  public?: boolean;
  /** segundos até começar sozinha (busca automática) */
  autoIn?: number;
  /** máximo de pessoas no modo */
  max?: number;
}

export interface StartInfo {
  you: string;
  mode: GameMode;
  arena: string;
  roster: { id: string; char: string; skin: string; trail: string; name: string; isBot: boolean; lv?: number; loadout?: Loadout; boss?: boolean }[];
}

export interface EndInfo {
  ranking: { id: string; name: string; char: string; skin: string; score: number; kills: number; roundWins: number; team?: number; boss?: boolean; dmg?: number; heal?: number; obj?: number; weak?: number; top?: string }[];
  winners: string[];
  gameWon?: boolean | null;
  highlight: string;
  rewards: Record<string, number>;
}

export type ClientMsg =
  | { t: 'hello'; name: string; token?: string | null; sid?: string; v?: number }
  | { t: 'nick'; name: string }
  | { t: 'create'; mode: GameMode; arena: string; bots: number }
  | { t: 'join'; code: string }
  | { t: 'set'; char: string; skin: string; trail: string }
  | { t: 'config'; mode: GameMode; arena: string; bots: number }
  | { t: 'start' }
  | { t: 'input'; i: [number, number, number, number | null, (number | null)?, (number | null)?, (number | null)?] } // mx, my, botões, mira, ângulo, distância, carga 0–1
  | { t: 'loadout'; l: Loadout }
  | { t: 'quick'; mode: GameMode }
  | { t: 'ready'; on: boolean }
  | { t: 'skip' }
  | { t: 'leave' }
  | { t: 'ping'; at: number }
  | { t: 'rematch'; on: boolean };

export type ServerMsg =
  | { t: 'hello'; id: string; name: string; v?: number; resumed?: boolean }
  | { t: 'room'; room: RoomInfo }
  | { t: 'start'; info: StartInfo }
  | { t: 's'; s: Snapshot; ev: unknown[] }
  | { t: 'end'; info: EndInfo }
  | { t: 'rematch'; state: 'wait' | 'no' | 'go'; by?: string }
  | { t: 'left'; why?: string }
  | { t: 'error'; msg: string }
  | { t: 'pong'; at: number };

export const BTN = { dash: 1, ability: 2, fire: 4, item: 8, bonus: 16, skill: 32, ult: 64, plasma: 128, interact: 256, lock: 512 };

// ------------------------------------------------------------------ snapshot
export interface Snapshot {
  ph: string;
  pt: number;
  r: number;
  tr: number;
  tb: boolean;
  rd: number;
  rt: number;
  /** X1: morte súbita ligada e segundos que faltam; vencedor do round ('') */
  sd?: 0 | 1;
  sl?: number;
  cw?: string;
  wt: number;
  core: [number, number];
  cn: [number, number] | 0;
  gs: [number, number] | 0;
  gd: boolean;
  obj: string;
  ice: number;
  er: number | null;
  win: string[];
  hl: string;
  P: unknown[][];
  F: number[][];
  W: (number | string)[][];
  C: (number | string)[][];
  GR?: number[][];
  /** rastro da suprema no chão */
  UZ?: (number | string)[][];
  E: (number | string)[][];
  EM?: (number | string)[][];
  ED?: EchoDigest[];
  LD?: EchoDigest[];
  RL?: RoundEchoLine[];
  Z: string;
  B: (number | string)[][];
  BM: number[][];
  M: number[][];
  T: (number | string)[][];
  /** modos novos */
  ts: number[];
  wv: number;
  gw: number;
  FL: (number | string)[][];
  H: (number | string)[] | 0;
  ST: number[] | 0;
  EN: number[][];
  IW: number[][];
  VX: number[][];
  SM: number[][];
  HK: (number | string)[][];
  AO: (number | string)[][];
  /** golpes com aviso, armadilhas, Chefe */
  CS: (number | string)[][];
  TR: (number | string)[][];
  bp: number;
  tl: number;
  bid: string;
  PL?: number[][];
  RS?: number[][];
  /** zonas do Z (raízes, vórtice, cinza). Ausente em servidor antigo: o cliente trata como vazio. PROTO segue 12. */
  PA?: (number | string)[][];
  /** orbes de energia. Ausente no servidor antigo. */
  EO?: number[][];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function flags(p: Player): number {
  return (
    (p.invulnT > 0 ? 1 : 0) |
    (p.phaseT > 0 ? 2 : 0) |
    (p.shieldT > 0 ? 4 : 0) |
    (p.turboT > 0 ? 8 : 0) |
    (p.dashT > 0 ? 16 : 0) |
    (p.hidden ? 32 : 0) |
    (p.doubleNext ? 64 : 0) |
    (p.magnetT > 0 ? 128 : 0) |
    (p.alive ? 256 : 0) |
    (p.playing ? 512 : 0) |
    (p.moving ? 1024 : 0) |
    (p.slowT > 0 ? 2048 : 0) |
    (p.vampT > 0 ? 4096 : 0) |
    (p.cloakT > 0 ? 8192 : 0) |
    (p.chargeT > 0 ? 16384 : 0) |
    (p.stunT > 0 ? 32768 : 0) |
    (p.dodgeT > 0 ? 65536 : 0) |
    (p.markT > 0 ? 131072 : 0) |
    (p.overT > 0 ? 262144 : 0) |
    (p.stasisT > 0 ? 524288 : 0) |
    (p.castT > 0 ? 1048576 : 0) |
    (p.exhaustT > 0 ? 2097152 : 0) |
    (p.burnT > 0 ? 4194304 : 0) |
    (p.frozenT > 0 ? 8388608 : 0) |
    (p.rootT > 0 ? 16777216 : 0) |
    (p.healT > 0 ? 33554432 : 0) |
    (p.ambushT > 0 ? 67108864 : 0)
  );
}

/** withRoutes: manda as rotas resumidas (pesado: só quando os Ecos mudam ou começa o Rebobinando) */
export function encodeSnapshot(g: Game, withEchoMeta: boolean, withRoutes = withEchoMeta): Snapshot {
  return {
    ph: g.phase,
    pt: r2(g.phaseT),
    r: g.round,
    tr: g.totalRounds,
    tb: g.tiebreak,
    rd: g.roundDur,
    rt: r2(g.roundT),
    sd: g.sudden ? 1 : 0,
    sl: r2((g.mode === 'duelo' || g.mode === 'todos') && g.sudden ? Math.max(0, g.suddenLimit - g.suddenT) : 0),
    cw: g.phase === 'call' ? (g.callWinner ?? '') : '',
    wt: r2(g.worldT),
    core: [g.core.x, g.core.y],
    cn: g.coreNext ? [g.coreNext.x, g.coreNext.y] : 0,
    gs: g.goldenSpot ? [g.goldenSpot.x, g.goldenSpot.y] : 0,
    gd: g.goldenDone,
    obj: g.objective,
    ice: r1(g.iceUntil),
    er: g.expiredRound,
    win: g.winners,
    hl: g.highlight,
    P: g.players.map((p) => [
      p.id,
      r1(p.x),
      r1(p.y),
      r2(p.dir),
      flags(p),
      Math.ceil(p.hp),
      p.hearts,
      p.carry,
      p.score,
      r1(p.walkPhase),
      WEAPON_IDS.indexOf(p.weapon),
      p.ammo || Math.ceil(p.weaponT),
      ITEM_IDS.indexOf(p.item),
      p.itemN,
      p.kills,
      p.roundWins,
      r1(p.abilCd),
      r1(p.dashCd),
      Math.ceil(p.shieldHp),
      r2(p.aim),
      p.power ? p.power.id : 0,
      p.power ? r1(p.power.t) : 0,
      r1(p.vx),
      r1(p.vy),
      r1(p.hitFlash),
      p.team,
      r1(p.respawnT),
      p.bonusAb ?? 0,
      p.maxHp,
      r1(p.skillCd),
      Math.floor(p.ultCharge),
      p.boss ? [r1(p.bossCd.impacto), r1(p.bossCd.barragem), r1(p.bossCd.chuva), r1(p.bossCd.obsidiana), r1(p.bossCd.avanco)] : 0,
      // placar: quedas, dano causado e pontos de objetivo
      p.deaths,
      Math.round(p.stats.dmg),
      p.stats.obj,
      Math.ceil(p.portalCd),
      r1(p.powerCd[0]),
      r1(p.powerCd[1]),
      r1(p.powerCd[2]),
      r1(p.powerCd[3]),
      r1(p.burnT),
      r1(p.frozenT),
      p.comboStacks,
      r1(p.energy),
      r1(p.plasmaCd),
      r1(p.plasmaT),
      p.plasmaOn ? 1 : 0,
      r1(p.basicCd),
      r1(p.markedT),
      r1(p.fieldT),
      p.fieldEl || 0,
      r1(p.reactCd),
      r1(p.gustT),
      r1(p.shockT),
      r1(p.ctrlT),
      r1(p.rootT),
      r1(p.stunT),
      r1(p.iceT),
      r1(p.plasmaPrimeT),
      r1(p.comboT),
      r1(p.ruptureT ?? 0),
    ]),
    F: g.fragments.map((f) => [f.id, r1(f.x), r1(f.y), f.golden ? 1 : 0]),
    W: g.powerups.map((w) => [w.id, w.kind, r1(w.x), r1(w.y), r1(w.age)]),
    C: g.clones.map((c) => [c.owner, r1(c.x), r1(c.y), r2(c.dir), c.decoy ? 1 : 0]),
    GR: g.groves.map((gr) => [gr.id, r1(gr.x), r1(gr.y), gr.r, r1(gr.t), gr.heal]),
    UZ: g.ultZones.map((z) => [z.id, z.owner, r1(z.x), r1(z.y), z.r, EL_IDS.indexOf(z.el as (typeof EL_IDS)[number]), r2(z.t), r2(z.total), z.blown ? 1 : 0]),
    E: g.echoViews.map((e) => [e.key, r1(e.x), r1(e.y), r2(e.dir), (e.moving ? 1 : 0) | (e.active ? 2 : 0) | (e.disrupted ? 4 : 0) | (e.iced ? 8 : 0) | (e.expiring ? 16 : 0), r2(e.pulse), e.age, r2(e.warn ?? 0), r2(e.warnAng ?? 0), e.warnKind ?? 0, r1(e.offLeft ?? 0)]),
    EM: withEchoMeta ? g.echoViews.map((e) => [e.key, e.rec.playerId, e.rec.characterId, e.rec.color, e.rec.round]) : undefined,
    ED: withRoutes ? [...g.echoDigests.values()] : undefined,
    LD: withRoutes && g.phase === 'rewind' ? g.lastDigests : undefined,
    RL: withRoutes && g.phase === 'rewind' ? g.roundEchoLines : undefined,
    Z: g.arena.zones.map((_, i) => ({ off: '0', warn: '1', on: '2' })[g.zoneState(i)]).join(''),
    // el: elemento do poder (para o efeito certo também online); pl: 1 plasma, 2 ataque básico
    B: g.bullets.map((b) => [b.id, r1(b.x), r1(b.y), Math.round(b.vx), Math.round(b.vy), WEAPON_IDS.indexOf(b.weapon), b.fromEcho ? 1 : 0, r2(b.life), b.owner === 'enemy' ? 1 : 0, b.el ? EL_IDS.indexOf(b.el) : -1, b.plasma ? 1 : b.basic ? 2 : 0, b.owner === 'enemy' ? '' : b.owner, b.form ? POWER_FORMS.indexOf(b.form) : -1]),
    BM: g.bombs.map((b) => [b.id, r1(b.x), r1(b.y), r1(b.tx), r1(b.ty), r2(b.t), b.pulse ? 1 : 0, b.ice ? 1 : 0]),
    M: g.mines.map((m) => [m.id, r1(m.x), r1(m.y), m.armT <= 0 ? 1 : 0]),
    T: g.turrets.map((t) => [t.id, t.owner, r1(t.x), r1(t.y), r2(t.aim), Math.ceil(t.hp)]),
    ts: g.teamScore,
    wv: g.wave,
    gw: g.gameWon === null ? -1 : g.gameWon ? 1 : 0,
    FL: g.flags.map((f) => [f.team, r1(f.x), r1(f.y), f.carrier ?? '', f.atHome ? 1 : 0]),
    H: g.hill ? [r1(g.hill.x), r1(g.hill.y), g.hill.r, g.hill.owner ?? '', g.hill.contested ? 1 : 0, g.hill.next ? r1(g.hill.next.x) : -1, g.hill.next ? r1(g.hill.next.y) : -1] : 0,
    ST: g.storm ? [r1(g.storm.x), r1(g.storm.y), r1(g.storm.r)] : 0,
    EN: g.enemies.map((e) => [e.id, ENEMY_KINDS.indexOf(e.kind), r1(e.x), r1(e.y), r2(e.dir), Math.ceil(e.hp), Math.ceil(e.maxHp), r2(e.hitFlash), e.chargeT > 0 ? 1 : 0, e.stunT > 0 ? 1 : 0]),
    IW: g.iceWalls.map((w) => [w.id, r1(w.x), r1(w.y), w.w, w.h, r1(w.t), WALL_KINDS.indexOf(w.kind ?? 'gelo'), Math.ceil(w.hp ?? 0), Math.ceil(w.maxHp ?? 0)]),
    VX: g.vortexes.map((v) => [v.id, r1(v.x), r1(v.y), r1(v.t), v.r]),
    SM: g.smokes.map((m) => [m.id, r1(m.x), r1(m.y), r1(m.t), m.r]),
    HK: g.hooks.map((h) => [h.id, h.owner, r1(h.x), r1(h.y)]),
    AO: g.abilityOrbs.map((o) => [o.id, o.ab, r1(o.x), r1(o.y), r1(o.age)]),
    CS: g.casts.map((c) => [c.id, CAST_KINDS.indexOf(c.kind), c.owner, r1(c.x), r1(c.y), r2(c.ang), c.r, Math.round(c.len), c.w, r2(c.t), r2(c.windup), r2(c.life), c.fired ? 1 : 0, c.team]),
    TR: g.traps.map((t) => [t.id, t.owner, t.team, r1(t.x), r1(t.y), t.armT <= 0 ? 1 : 0]),
    bp: g.bossPhase,
    tl: g.teamLives,
    bid: g.bossId ?? '',
    PL: g.pools.map((pl) => [pl.id, r1(pl.x), r1(pl.y), pl.r, pl.armT > 0 ? 1 : 0, r1(pl.t)]),
    RS: g.resSpots.map((r) => [r1(r.x), r1(r.y)]),
    PA: (g.patches ?? []).map((z) => [z.id, z.owner, z.kind, r1(z.x), r1(z.y), z.r, r1(z.t), z.dmg, z.el ? EL_IDS.indexOf(z.el) : -1]),
    EO: (g.energyOrbs ?? []).map((o) => [o.id, r1(o.x), r1(o.y)]),
  };
}

export function echoSignature(g: Game): string {
  // muda também quando começa o Rebobinando (manda as rotas da rodada que acabou uma vez só)
  return g.echoViews.map((e) => e.key).join(',') + (g.phase === 'rewind' ? `|rw${g.round}` : '');
}

export type { PowerId };
