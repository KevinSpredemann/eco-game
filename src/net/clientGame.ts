// Espelho da partida online no aparelho: recebe o estado do servidor, suaviza o movimento
// dos outros e prevê o movimento do próprio jogador para responder na hora.
import { ArenaDef, getArena, isGround } from '../game/arenas';
import { getCharacter, withLevel, withSkin } from '../game/characters';
import * as C from '../game/constants';
import { ENEMY_STATS, FlagState, Game, GameEvent, GameMode, Hill, Input, MODE_RULES, Player, Storm } from '../game/sim';
import type { PowerId } from '../game/powerups';
import { loadoutPrimary } from '../game/weapons';
import type { EchoDigest, RoundEchoLine } from '../systems/echo/digest';
import { assignUniqueColors, assignUniqueNames } from '../game/colors';
import { BOSS, COMBAT, DEFAULT_LOADOUT, Loadout, sanitizeLoadout } from '../game/balance';
import { CAST_KINDS, ENEMY_KINDS, ITEM_IDS, Snapshot, StartInfo, WALL_KINDS, WEAPON_IDS } from './protocol';
import type { EchoRecording } from '../shared/types';

type Ev = { key: string; meta: EchoRecording } & Record<string, any>;

const collideWorld = Game.prototype.collideWorld;
const isFree = Game.prototype.isFree;

export class ClientGame {
  readonly arena: ArenaDef;
  readonly mode: GameMode;
  readonly localId: string;
  players: Player[] = [];
  fragments: any[] = [];
  powerups: { id: number; kind: PowerId; x: number; y: number; age: number }[] = [];
  clones: any[] = [];
  echoViews: any[] = [];
  bullets: any[] = [];
  bombs: any[] = [];
  mines: any[] = [];
  turrets: any[] = [];
  enemies: any[] = [];
  abilityOrbs: any[] = [];
  iceWalls: any[] = [];
  pools: { id: number; x: number; y: number; r: number; armT: number; t: number }[] = [];
  resSpots: { x: number; y: number }[] = [];
  vortexes: any[] = [];
  smokes: any[] = [];
  hooks: any[] = [];
  casts: any[] = [];
  traps: any[] = [];
  bossPhase = 1;
  teamLives = 0;
  bossId: string | null = null;
  flags: FlagState[] = [];
  hill: Hill | null = null;
  storm: Storm | null = null;
  teamScore = [0, 0];
  wave = 0;
  gameWon: boolean | null = null;
  readonly rules: (typeof MODE_RULES)[GameMode];
  core = { x: 640, y: 360 };
  coreNext: { x: number; y: number } | null = null;
  goldenSpot: { x: number; y: number } | null = null;
  goldenDone = false;
  phase: 'prep' | 'play' | 'rewind' | 'results' = 'prep';
  phaseT = 0;
  round = 1;
  totalRounds = 4;
  tiebreak = false;
  roundDur = 30;
  roundT = 0;
  worldT = 0;
  objective: any = 'dourado';
  iceUntil = 0;
  expiredRound: number | null = null;
  winners: string[] = [];
  highlight = '';
  lastRecordings: EchoRecording[] = [];
  lastDigests: EchoDigest[] = [];
  roundEchoLines: RoundEchoLine[] = [];
  echoDigests = new Map<string, EchoDigest>();
  paused = false;
  events: GameEvent[] = [];
  private zones = '';
  private target = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  private echoMeta = new Map<string, EchoRecording>();
  private echoTarget = new Map<string, { x: number; y: number }>();
  /** posição prevista do jogador local */
  private pred: { x: number; y: number } | null = null;
  lastSnapAt = 0;

  constructor(info: StartInfo) {
    this.arena = getArena(info.arena);
    this.mode = info.mode;
    this.localId = info.you;
    this.rules = MODE_RULES[this.mode];
    this.totalRounds = this.rules.rounds;
    for (const r of info.roster) {
      const ch = withSkin(withLevel(getCharacter(r.char), r.lv, info.mode === 'ondas'), r.skin);
      const p = blankPlayer(r.id, r.name, ch, r.isBot, r.skin, r.trail, sanitizeLoadout(r.loadout));
      p.boss = !!r.boss;
      if (p.boss) this.bossId = p.id;
      this.players.push(p);
    }
    // mesma regra da simulação, na mesma ordem: todo mundo vê as mesmas cores
    assignUniqueColors(this.players);
    assignUniqueNames(this.players);
  }

  get human(): Player {
    return this.players.find((p) => p.id === this.localId) ?? this.players[0];
  }
  get combat() {
    return this.mode !== 'nucleo';
  }
  hostile(a: { id: string; team: number }, b: { id: string; team: number }) {
    return Game.prototype.hostile.call(this, a, b);
  }
  get boss(): Player | null {
    return this.bossId ? this.players.find((p) => p.id === this.bossId) ?? null : null;
  }
  hitR(p: Player) {
    return p.boss ? BOSS.hitR : C.PLAYER_R;
  }
  enemyHostileTo(p: { team: number }) {
    return !(this.mode === 'chefe' && p.team === 1);
  }
  zoneState(i: number): 'off' | 'warn' | 'on' {
    const c = this.zones[i];
    return c === '2' ? 'on' : c === '1' ? 'warn' : 'off';
  }
  timeLeft() {
    return Math.max(0, this.roundDur - this.roundT);
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  ranking() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  applySnapshot(s: Snapshot, ev: unknown[]) {
    this.lastSnapAt = performance.now();
    const prevPhase = this.phase;
    this.phase = s.ph as any;
    this.phaseT = s.pt;
    this.round = s.r;
    this.totalRounds = s.tr;
    this.tiebreak = s.tb;
    this.roundDur = s.rd;
    this.roundT = s.rt;
    this.worldT = s.wt;
    this.core = { x: s.core[0], y: s.core[1] };
    this.coreNext = s.cn ? { x: s.cn[0], y: s.cn[1] } : null;
    this.goldenSpot = s.gs ? { x: s.gs[0], y: s.gs[1] } : null;
    this.goldenDone = s.gd;
    this.objective = s.obj;
    this.iceUntil = s.ice;
    this.expiredRound = s.er;
    this.winners = s.win;
    this.highlight = s.hl;
    this.zones = s.Z;

    for (const row of s.P) {
      const [id, x, y, dir, fl, hp, hearts, carry, score, walk, wi, ammo, ii, itemN, kills, roundWins, abilCd, dashCd, shieldHp, aim, pw, pwt, vx, vy, hitFlash, team, respawnT, bonusAb, maxHp, skillCd, ult, bcd, deaths, dmg, objPts, portalCd] = row as any[];
      const p = this.players.find((q) => q.id === id);
      if (!p) continue;
      const wasAlive = p.alive;
      p.dir = dir;
      p.invulnT = fl & 1 ? 1 : 0;
      p.phaseT = fl & 2 ? 1 : 0;
      p.shieldT = fl & 4 ? 1 : 0;
      p.turboT = fl & 8 ? 1 : 0;
      p.dashT = fl & 16 ? 1 : 0;
      p.hidden = !!(fl & 32);
      p.doubleNext = !!(fl & 64);
      p.magnetT = fl & 128 ? 1 : 0;
      p.alive = !!(fl & 256);
      p.playing = !!(fl & 512);
      p.moving = !!(fl & 1024);
      p.slowT = fl & 2048 ? 1 : 0;
      p.vampT = fl & 4096 ? 1 : 0;
      p.cloakT = fl & 8192 ? 1 : 0;
      p.chargeT = fl & 16384 ? 1 : 0;
      p.stunT = fl & 32768 ? 1 : 0;
      p.dodgeT = fl & 65536 ? 1 : 0;
      p.markT = fl & 131072 ? 1 : 0;
      p.overT = fl & 262144 ? 1 : 0;
      p.stasisT = fl & 524288 ? 1 : 0;
      p.castT = fl & 1048576 ? 1 : 0;
      p.exhaustT = fl & 2097152 ? 1 : 0;
      p.maxHp = maxHp ?? COMBAT.maxHp;
      p.skillCd = skillCd ?? 0;
      p.ultCharge = ult ?? 0;
      if (Array.isArray(bcd)) p.bossCd = { impacto: bcd[0], barragem: bcd[1], chuva: bcd[2], obsidiana: bcd[3], avanco: bcd[4] };
      p.team = team ?? -1;
      p.respawnT = respawnT ?? 0;
      p.bonusAb = bonusAb || null;
      p.hp = hp;
      p.hearts = hearts;
      p.carry = carry;
      p.score = score;
      if (p.id !== this.localId) p.walkPhase = walk;
      p.weapon = WEAPON_IDS[wi] ?? 'blaster';
      p.ammo = ammo;
      p.weaponT = ammo;
      p.item = ITEM_IDS[ii] ?? null;
      p.itemN = itemN;
      p.kills = kills;
      p.roundWins = roundWins;
      p.deaths = deaths ?? 0;
      p.stats.dmg = dmg ?? 0;
      p.stats.obj = objPts ?? 0;
      p.portalCd = portalCd ?? 0;
      p.abilCd = abilCd;
      p.dashCd = dashCd;
      p.shieldHp = shieldHp;
      if (p.id !== this.localId) p.aim = aim;
      p.power = pw ? { id: pw, t: pwt } : null;
      p.hitFlash = hitFlash;
      p.vx = vx;
      p.vy = vy;
      this.target.set(id, { x, y, vx, vy });
      // teleporte/renascimento: salta direto
      const far = Math.hypot(p.x - x, p.y - y) > 140;
      if (far || !wasAlive || prevPhase !== this.phase) {
        p.x = x;
        p.y = y;
        if (id === this.localId) this.pred = { x, y };
      }
    }
    if (s.EM) {
      this.echoMeta.clear();
      for (const [key, playerId, characterId, color, round] of s.EM as any[]) {
        this.echoMeta.set(key, { playerId, characterId, color, round, frames: [], events: [], endT: 0 });
      }
    }
    const views: any[] = [];
    if (s.ED) this.echoDigests = new Map(s.ED.map((d) => [d.key, d]));
    if (s.LD) this.lastDigests = s.LD;
    if (s.RL) this.roundEchoLines = s.RL;
    for (const [key, x, y, dir, fl, pulse, age, warn, warnAng, warnKind, offLeft] of s.E as any[]) {
      const meta = this.echoMeta.get(key);
      if (!meta) continue;
      const old = this.echoViews.find((e) => e.key === key);
      const v = old ?? { key, rec: meta, x, y, trail: [] as { x: number; y: number }[] };
      v.rec = meta;
      v.dir = dir;
      v.moving = !!(fl & 1);
      v.active = !!(fl & 2);
      v.disrupted = !!(fl & 4);
      v.iced = !!(fl & 8);
      v.expiring = !!(fl & 16);
      v.pulse = pulse;
      v.age = age;
      v.warn = warn ?? 0;
      v.warnAng = warnAng ?? 0;
      v.warnKind = warnKind ?? 0;
      v.offLeft = offLeft ?? 0;
      if (!old || Math.hypot(v.x - x, v.y - y) > 140) {
        v.x = x;
        v.y = y;
        v.trail = [];
      }
      this.echoTarget.set(key, { x, y });
      views.push(v);
    }
    this.echoViews = views;
    this.fragments = s.F.map(([id, x, y, g]) => ({ id, x, y, golden: !!g, vx: 0, vy: 0, age: 1, pickDelay: 0 }));
    this.powerups = s.W.map(([id, kind, x, y, age]) => ({ id: id as number, kind: kind as PowerId, x: x as number, y: y as number, age: age as number }));
    this.clones = s.C.map(([owner, x, y, dir]) => ({ owner, x, y, dir, t: 1 }));
    this.bullets = s.B.map(([id, x, y, vx, vy, wi, fe, life, en]) => ({ id, x, y, vx, vy, weapon: WEAPON_IDS[wi] ?? 'blaster', fromEcho: !!fe, life, owner: en ? 'enemy' : '' }));
    this.bombs = s.BM.map(([id, x, y, tx, ty, t]) => ({ id, x, y, tx, ty, t, sx: x, sy: y }));
    this.mines = s.M.map(([id, x, y, armed]) => ({ id, x, y, armT: armed ? 0 : 1 }));
    this.turrets = s.T.map(([id, owner, x, y, aim, hp]) => ({ id, owner, x, y, aim, t: 1, cd: 0, hp: hp ?? COMBAT.turret.hp }));
    this.teamScore = s.ts ?? [0, 0];
    this.wave = s.wv ?? 0;
    this.gameWon = s.gw === undefined || s.gw < 0 ? null : s.gw === 1;
    this.flags = (s.FL ?? []).map(([team, x, y, carrier, home]) => {
      const prev = this.flags.find((f) => f.team === team);
      return { team: team as number, x: x as number, y: y as number, carrier: (carrier as string) || null, atHome: !!home, dropT: 0, home: prev?.home ?? { x: x as number, y: y as number } };
    });
    for (const f of this.flags) if (f.atHome) f.home = { x: f.x, y: f.y };
    const H = s.H as any[] | 0;
    this.hill = H ? { x: H[0], y: H[1], r: H[2], owner: H[3] || null, contested: !!H[4], moveAt: 0, next: H[5] >= 0 ? { x: H[5], y: H[6] } : null } : null;
    this.storm = s.ST ? { x: s.ST[0], y: s.ST[1], r: s.ST[2] } : null;
    const prevEn = new Map(this.enemies.map((e) => [e.id, e]));
    this.enemies = (s.EN ?? []).map(([id, k, x, y, dir, hp, maxHp, hf, ch, stun]) => {
      const old = prevEn.get(id);
      const kind = ENEMY_KINDS[k] ?? 'drone';
      return { id, kind, x: old && Math.hypot(old.x - x, old.y - y) < 120 ? old.x : x, y: old && Math.hypot(old.x - x, old.y - y) < 120 ? old.y : y, tx: x, ty: y, dir, hp, maxHp, hitFlash: hf, chargeT: ch ? 1 : 0, stunT: stun ? 1 : 0, r: ENEMY_STATS[kind].r };
    });
    this.iceWalls = (s.IW ?? []).map(([id, x, y, w, h, t, k, hp, mhp]) => ({ id, x, y, w, h, t, owner: '', kind: WALL_KINDS[k ?? 0] ?? 'gelo', hp: hp || undefined, maxHp: mhp || undefined }));
    this.pools = (s.PL ?? []).map(([id, x, y, r, arming, t]) => ({ id, x, y, r, armT: arming ? 1 : 0, t }));
    this.resSpots = (s.RS ?? []).map(([x, y]) => ({ x, y }));
    const prevCasts = new Map(this.casts.map((c) => [c.id, c]));
    this.casts = (s.CS ?? []).map(([id, k, owner, x, y, ang, r, len, w, t, windup, life, fired, team]) => {
      const old = prevCasts.get(id);
      return { id, kind: CAST_KINDS[k as number] ?? 'meteoro', owner, x, y, ang, r, len, w, t: old && Math.abs(old.t - (t as number)) < 0.25 ? old.t : t, windup, life, fired: !!fired, team, acc: 0 };
    });
    this.traps = (s.TR ?? []).map(([id, owner, team, x, y, armed]) => ({ id, owner, team, x, y, armT: armed ? 0 : 1, t: 1 }));
    this.bossPhase = s.bp ?? 1;
    this.teamLives = s.tl ?? 0;
    if (s.bid) this.bossId = s.bid;
    this.vortexes = (s.VX ?? []).map(([id, x, y, t, r]) => ({ id, x, y, t, r, owner: '' }));
    this.smokes = (s.SM ?? []).map(([id, x, y, t, r]) => ({ id, x, y, t, r, owner: '' }));
    this.abilityOrbs = (s.AO ?? []).map(([id, ab, x, y, age]) => ({ id, ab, x, y, age }));
    this.hooks = (s.HK ?? []).map(([id, owner, x, y]) => ({ id, owner, x, y }));
    for (const e of ev) this.events.push(e as GameEvent);
  }

  /** avança a visualização entre um pacote e outro */
  update(dt: number, input: Input) {
    if (this.phase === 'play') this.roundT += dt;
    this.worldT += dt;
    this.phaseT += dt;
    const k = 1 - Math.exp(-dt * 14);
    for (const p of this.players) {
      const t = this.target.get(p.id);
      if (!t) continue;
      if (p.id === this.localId && this.pred && p.alive && this.phase === 'play') {
        // previsão local: anda já, e corrige devagar na direção do servidor
        let mx = input.mx;
        let my = input.my;
        const m = Math.hypot(mx, my);
        if (m > 1) {
          mx /= m;
          my /= m;
        }
        const speed = C.SPEED * (p.turboT > 0 ? 1.45 : 1) * (p.overT > 0 ? 1.15 : 1) * (p.slowT > 0 ? 0.6 : 1) * (p.castT > 0 ? COMBAT.castMove : 1) * (p.boss ? BOSS.speedMul : 1) * (p.stunT > 0 ? 0 : 1);
        this.pred.x += mx * speed * dt;
        this.pred.y += my * speed * dt;
        collideWorld.call(this as any, this.pred);
        if (this.arena.islands && !isGround(this.arena, this.pred.x, this.pred.y, this.worldT)) {
          // deixa o servidor decidir a queda
        }
        const err = Math.hypot(t.x - this.pred.x, t.y - this.pred.y);
        const corr = err > 90 ? 1 : 1 - Math.exp(-dt * 5);
        this.pred.x += (t.x - this.pred.x) * corr;
        this.pred.y += (t.y - this.pred.y) * corr;
        p.x = this.pred.x;
        p.y = this.pred.y;
        if (m > 0.12) {
          p.dir = Math.atan2(my, mx);
          p.walkPhase += dt * (p.turboT > 0 ? 16 : 11);
          p.moving = true;
        }
      } else {
        // outros: segue o alvo + extrapola um pouco pela velocidade
        p.x += (t.x + t.vx * 0.05 - p.x) * k;
        p.y += (t.y + t.vy * 0.05 - p.y) * k;
        if (p.moving) p.walkPhase += dt * 11;
        if (p.id === this.localId) this.pred = { x: p.x, y: p.y };
      }
    }
    for (const e of this.echoViews) {
      const t = this.echoTarget.get(e.key);
      if (!t) continue;
      e.x += (t.x - e.x) * k;
      e.y += (t.y - e.y) * k;
      if (e.active && this.phase === 'play') {
        e.trail.push({ x: e.x, y: e.y });
        if (e.trail.length > 14) e.trail.shift();
      }
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (const b of this.bombs) b.t += dt;
    for (const c of this.casts) c.t += dt;
    for (const e of this.enemies) {
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
    }
    void isFree;
  }
}

function blankPlayer(id: string, name: string, char: ReturnType<typeof getCharacter>, isBot: boolean, skin: string, trail: string, loadout: Loadout = DEFAULT_LOADOUT): Player {
  return {
    id,
    name,
    char,
    color: char.color,
    isBot,
    x: 640,
    y: 360,
    vx: 0,
    vy: 0,
    dir: Math.PI / 2,
    moving: false,
    hearts: C.HEARTS,
    carry: 0,
    score: 0,
    roundPoints: 0,
    alive: true,
    playing: true,
    invulnT: 0,
    stunT: 0,
    dashT: 0,
    dashCd: 0,
    abilCd: 0,
    turboT: 0,
    phaseT: 0,
    shieldT: 0,
    portalCd: 0,
    hidden: false,
    tookDamage: false,
    tripleDone: false,
    recorder: null,
    brain: null,
    walkPhase: 0,
    hitFlash: 0,
    magnetT: 0,
    doubleNext: false,
    power: null,
    stats: { delivered: 0, bestDelivery: 0, ownEchoHits: 0, echoHits: 0, disrupted: 0, survived: 0, dmg: 0, taken: 0, heal: 0, obj: 0, weak: 0, uses: {} },
    hp: 150,
    shieldHp: 0,
    weapon: loadoutPrimary(char.id, loadout.primary),
    weaponT: 0,
    ammo: 0,
    fireCd: 0,
    item: null,
    itemN: 0,
    aim: 0,
    kills: 0,
    deaths: 0,
    roundWins: 0,
    skin,
    trail,
    team: -1,
    respawnT: 0,
    slowT: 0,
    vampT: 0,
    cloakT: 0,
    chargeT: 0,
    chargeHit: [],
    pullT: 0,
    pullX: 0,
    pullY: 0,
    stormAcc: 0,
    hillAcc: 0,
    bonusAb: null,
    maxHp: COMBAT.maxHp,
    loadout,
    pendingLoadout: null,
    skillCd: 0,
    ultCharge: 0,
    dodgeT: 0,
    markT: 0,
    overT: 0,
    ccResistT: 0,
    stasisT: 0,
    castT: 0,
    lastHurtAt: 0,
    exhaustT: 0,
    boss: false,
    bossCd: { impacto: 0, barragem: 0, chuva: 0, obsidiana: 0, avanco: 0 },
    chargeDmg: 0,
  };
}
