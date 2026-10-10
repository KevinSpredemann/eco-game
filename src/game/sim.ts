import type { EchoRecording } from '../shared/types';
import { EchoRecorder, sampleRecording, upcomingEvent } from '../systems/echo/recorder';
import { EchoManager } from '../systems/echo/manager';
import { POINTS, deliveryPoints, leaders, ranking } from '../systems/scoring';
import {
  ArenaDef,
  BORDER,
  Pt,
  WORLD_H,
  WORLD_W,
  beamAngle,
  bridgeState,
  distToSegment,
  inRect,
  isGround,
  laserX,
  pistonState,
} from './arenas';
import { CharacterDef, getCharacter } from './characters';
import * as C from './constants';
import { botThink, BotBrain, NavGrid } from './bot';
import { PowerId, getPower, randomPower } from './powerups';

export type Difficulty = 'facil' | 'normal' | 'dificil';
export type ObjectiveId = 'dourado' | 'tripla' | 'intocavel';

export const OBJECTIVES: Record<ObjectiveId, string> = {
  dourado: 'Pegue o Fragmento Dourado (+1)',
  tripla: 'Entregue 3 energias de uma vez (+1)',
  intocavel: 'Termine a rodada sem levar dano (+1)',
};

export interface MatchConfig {
  arena: ArenaDef;
  humanChar: string;
  bots: number;
  difficulty: Difficulty;
  ownEchoDamage: boolean;
  training: boolean;
  /** fundo animado do menu: sem jogador humano */
  spectator?: boolean;
}

export interface Input {
  mx: number;
  my: number;
  dash: boolean;
  ability: boolean;
}

export interface Player {
  id: string;
  name: string;
  char: CharacterDef;
  color: string;
  isBot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
  moving: boolean;
  hearts: number;
  carry: number;
  score: number;
  roundPoints: number;
  alive: boolean;
  playing: boolean;
  invulnT: number;
  stunT: number;
  dashT: number;
  dashCd: number;
  abilCd: number;
  turboT: number;
  phaseT: number;
  shieldT: number;
  portalCd: number;
  hidden: boolean;
  tookDamage: boolean;
  tripleDone: boolean;
  recorder: EchoRecorder | null;
  brain: BotBrain | null;
  walkPhase: number;
  hitFlash: number;
  magnetT: number;
  doubleNext: boolean;
  /** último poder pego (para o HUD) */
  power: { id: PowerId; t: number } | null;
  stats: { delivered: number; bestDelivery: number; ownEchoHits: number; echoHits: number; disrupted: number; survived: number };
}

export interface Fragment {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  golden: boolean;
  age: number;
  /** atração pelo ímã/clone */
  pickDelay: number;
}

export interface Clone {
  owner: string;
  x: number;
  y: number;
  dir: number;
  t: number;
}

export interface ZoneEvent {
  zone: number;
  warnAt: number;
  activeAt: number;
  endAt: number;
}

export interface EchoView {
  rec: EchoRecording;
  key: string;
  age: number;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  active: boolean;
  disrupted: boolean;
  iced: boolean;
  pulse: number;
  expiring: boolean;
  trail: { x: number; y: number }[];
}

export type GameEvent =
  | { type: 'pickup'; x: number; y: number; pid: string; golden?: boolean; lucky?: boolean }
  | { type: 'deliver'; x: number; y: number; pid: string; points: number; count: number }
  | { type: 'hit'; x: number; y: number; pid: string; by: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse' }
  | { type: 'eliminated'; x: number; y: number; pid: string }
  | { type: 'dash'; x: number; y: number; pid: string }
  | { type: 'ability'; x: number; y: number; pid: string; ability: string }
  | { type: 'portal'; x: number; y: number; pid: string }
  | { type: 'disrupt'; x: number; y: number }
  | { type: 'hazardWarn'; x: number; y: number }
  | { type: 'hazardOn'; x: number; y: number }
  | { type: 'piston'; x: number; y: number }
  | { type: 'coreWarn'; x: number; y: number }
  | { type: 'coreMove'; x: number; y: number }
  | { type: 'goldenWarn'; x: number; y: number }
  | { type: 'goldenSpawn'; x: number; y: number }
  | { type: 'objective'; pid: string; text: string }
  | { type: 'phase'; phase: Phase }
  | { type: 'echoSpawn'; count: number }
  | { type: 'echoExpired'; round: number }
  | { type: 'tick'; n: number }
  | { type: 'bridgeWarn'; x: number; y: number }
  | { type: 'power'; x: number; y: number; pid: string; power: PowerId }
  | { type: 'powerSpawn'; x: number; y: number; power: PowerId }
  | { type: 'echoErased'; x: number; y: number; pid: string };

export type Phase = 'prep' | 'play' | 'rewind' | 'results';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Game {
  readonly arena: ArenaDef;
  readonly cfg: MatchConfig;
  readonly players: Player[] = [];
  readonly echoes = new EchoManager(3);
  readonly nav: NavGrid;
  fragments: Fragment[] = [];
  clones: Clone[] = [];
  powerups: { id: number; kind: PowerId; x: number; y: number; age: number }[] = [];
  iceUntil = 0;
  private powerTimer = 4;
  private erased = new Set<string>();
  echoViews: EchoView[] = [];
  zoneEvents: ZoneEvent[] = [];
  events: GameEvent[] = [];

  phase: Phase = 'prep';
  phaseT = 0;
  round = 0;
  totalRounds = C.TOTAL_ROUNDS;
  tiebreak = false;
  roundDur = C.ROUND_TIME;
  roundT = 0; // segundos de rodada ativa
  worldT = 0; // relógio contínuo para pontes/pistões/feixes
  core: Pt = { x: 640, y: 360 };
  coreNext: Pt | null = null;
  coreMoveAt = -1;
  objective: ObjectiveId = 'dourado';
  goldenSpot: Pt | null = null;
  goldenDone = false;
  lastRecordings: EchoRecording[] = [];
  expiredRound: number | null = null;
  winners: string[] = [];
  highlight = '';
  paused = false;
  private fragId = 1;
  private fragTimer = 0;
  private lastTick = -1;
  private disrupted = new Map<string, number>();
  private trails = new Map<string, { x: number; y: number }[]>();
  private coreIndex = Math.floor(Math.random() * 5);

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.arena = cfg.arena;
    this.nav = new NavGrid(this.arena);
    const human = getCharacter(cfg.humanChar);
    this.addPlayer('p0', human, false);
    if (!cfg.training) {
      const others = shuffle(['kael', 'luna', 'bruno', 'zoe', 'maya', 'zed'].filter((c) => c !== human.id));
      for (let i = 0; i < cfg.bots; i++) this.addPlayer('b' + i, getCharacter(others[i]), true);
    }
    this.nextRound();
  }

  get human(): Player {
    return this.players[0];
  }

  private addPlayer(id: string, ch: CharacterDef, isBot: boolean) {
    this.players.push({
      id,
      name: isBot ? ch.name : `${ch.name} (você)`,
      char: ch,
      color: ch.color,
      isBot,
      x: 0,
      y: 0,
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
      brain: isBot ? new BotBrain(this.cfg.difficulty) : null,
      walkPhase: 0,
      hitFlash: 0,
      magnetT: 0,
      doubleNext: false,
      power: null,
      stats: { delivered: 0, bestDelivery: 0, ownEchoHits: 0, echoHits: 0, disrupted: 0, survived: 0 },
    });
  }

  // ------------------------------------------------------------------ rodada
  private nextRound() {
    this.round++;
    this.phase = 'prep';
    this.phaseT = 0;
    this.roundT = 0;
    this.lastTick = -1;
    this.roundDur = this.tiebreak ? C.TIEBREAK_TIME : C.ROUND_TIME;
    const cores = this.arena.cores;
    this.core = { ...cores[(this.coreIndex + this.round - 1) % cores.length] };
    this.coreNext = null;
    this.coreMoveAt = !this.tiebreak && this.round >= 3 ? 15 : -1;
    const objs: ObjectiveId[] = ['dourado', 'tripla', 'intocavel', 'dourado'];
    this.objective = this.tiebreak ? 'dourado' : objs[(this.round - 1) % objs.length];
    this.goldenSpot = null;
    this.goldenDone = false;
    this.clones = [];
    this.powerups = [];
    this.powerTimer = 4;
    this.iceUntil = 0;
    this.disrupted.clear();
    this.trails.clear();
    this.fragments = [];

    const spawns = this.arena.spawns;
    const offset = (this.round - 1) * 2;
    this.players.forEach((p, i) => {
      const s = spawns[(i + offset) % spawns.length];
      Object.assign(p, {
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        hearts: C.HEARTS,
        carry: 0,
        roundPoints: 0,
        invulnT: 0,
        stunT: 0,
        dashT: 0,
        dashCd: 0,
        abilCd: 0,
        turboT: 0,
        phaseT: 0,
        shieldT: 0,
        portalCd: 0,
        tookDamage: false,
        tripleDone: false,
        hitFlash: 0,
        magnetT: 0,
        doubleNext: false,
        power: null,
      });
      p.dir = Math.atan2(360 - s.y, 640 - s.x);
      p.playing = (!this.tiebreak || this.winners.includes(p.id)) && !(this.cfg.spectator && p.id === 'p0');
      p.alive = p.playing;
      p.recorder = p.playing ? new EchoRecorder(p.id, this.round, p.color, p.char.id) : null;
      p.brain?.reset();
    });

    const target = Math.round(4 + this.players.filter((p) => p.playing).length * 1.5);
    for (let i = 0; i < target; i++) this.spawnFragment();
    this.buildZoneSchedule();
    this.refreshEchoViews();
    this.events.push({ type: 'phase', phase: 'prep' });
    if (this.echoes.count > 0) this.events.push({ type: 'echoSpawn', count: this.echoes.count });
  }

  private buildZoneSchedule() {
    this.zoneEvents = [];
    const zones = this.arena.zones;
    if (!zones.length) return;
    const gap = this.round <= 1 ? 6 : 4.6;
    const perWave = this.round >= 3 ? 2 : 1;
    let t = 3.5;
    let last = -1;
    while (t < this.roundDur - 2) {
      const used = new Set<number>();
      for (let k = 0; k < perWave; k++) {
        let idx = -1;
        for (let tries = 0; tries < 12; tries++) {
          const c = Math.floor(Math.random() * zones.length);
          if (c === last || used.has(c)) continue;
          const z = zones[c];
          if (dist(z.x, z.y, this.core.x, this.core.y) < z.r + C.CORE_R + 30) continue;
          idx = c;
          break;
        }
        if (idx < 0) continue;
        used.add(idx);
        last = idx;
        this.zoneEvents.push({ zone: idx, warnAt: t, activeAt: t + C.HAZARD_WARN, endAt: t + C.HAZARD_WARN + C.HAZARD_ACTIVE });
      }
      t += gap + Math.random() * 1.5;
    }
  }

  private endRound() {
    const recs: EchoRecording[] = [];
    let anyAlive = false;
    for (const p of this.players) {
      if (!p.playing) continue;
      if (p.alive) {
        anyAlive = true;
        this.award(p, POINTS.survive);
        p.stats.survived++;
        if (this.objective === 'intocavel' && !p.tookDamage) {
          this.award(p, POINTS.objective);
          this.events.push({ type: 'objective', pid: p.id, text: 'Intocável +1' });
        }
      }
      if (p.recorder) recs.push(p.recorder.finish(this.roundDur * 1000, p.x, p.y, p.dir));
    }
    void anyAlive;
    this.lastRecordings = recs;
    const removed = this.echoes.add(this.round, recs);
    this.expiredRound = removed.length ? removed[0].round : null;
    if (this.expiredRound !== null) this.events.push({ type: 'echoExpired', round: this.expiredRound });
    this.phase = 'rewind';
    this.phaseT = 0;
    this.events.push({ type: 'phase', phase: 'rewind' });
  }

  private afterRewind() {
    const lines = this.players.map((p) => ({ id: p.id, score: p.score }));
    if (this.round < this.totalRounds && !this.tiebreak) {
      this.nextRound();
      return;
    }
    const top = leaders(lines);
    if (top.length > 1 && !this.tiebreak && !this.cfg.training) {
      this.tiebreak = true;
      this.winners = top;
      this.nextRound();
      return;
    }
    this.winners = top;
    this.finishMatch();
  }

  private finishMatch() {
    this.phase = 'results';
    this.phaseT = 0;
    // melhor jogada
    const best = [...this.players].sort((a, b) => b.stats.bestDelivery - a.stats.bestDelivery)[0];
    const clumsy = [...this.players].sort((a, b) => b.stats.ownEchoHits - a.stats.ownEchoHits)[0];
    const parts: string[] = [];
    if (best && best.stats.bestDelivery > 0) parts.push(`Maior entrega: ${best.char.name} com ${best.stats.bestDelivery} pontos de uma vez.`);
    if (clumsy && clumsy.stats.ownEchoHits > 0)
      parts.push(`${clumsy.char.name} foi pego pelo próprio Eco ${clumsy.stats.ownEchoHits}×.`);
    const breaker = [...this.players].sort((a, b) => b.stats.disrupted - a.stats.disrupted)[0];
    if (breaker && breaker.stats.disrupted > 0) parts.push(`${breaker.char.name} desfez ${breaker.stats.disrupted} Eco(s).`);
    this.highlight = parts.join(' ');
    this.events.push({ type: 'phase', phase: 'results' });
  }

  ranking() {
    return ranking(this.players.map((p) => ({ id: p.id, score: p.score, p }))).map((l) => l.p);
  }

  private award(p: Player, pts: number) {
    p.score += pts;
    p.roundPoints += pts;
  }

  // ------------------------------------------------------------------ passo
  step(dt: number, humanInput: Input) {
    if (this.paused || this.phase === 'results') return;
    this.worldT += dt;
    this.phaseT += dt;

    if (this.phase === 'prep') {
      const n = Math.ceil(C.PREP_TIME - this.phaseT);
      if (n !== this.lastTick && n <= 3 && n > 0) {
        this.lastTick = n;
        this.events.push({ type: 'tick', n });
      }
      for (const p of this.players) {
        if (!p.playing) continue;
        // pequena "respiração" e mira no núcleo
        p.moving = false;
      }
      this.updateEchoViews(0);
      if (this.phaseT >= C.PREP_TIME) {
        this.phase = 'play';
        this.phaseT = 0;
        this.lastTick = -1;
        this.events.push({ type: 'phase', phase: 'play' });
      }
      return;
    }

    if (this.phase === 'rewind') {
      if (this.phaseT >= C.REWIND_TIME) this.afterRewind();
      return;
    }

    // ---- rodada ativa
    this.roundT += dt;
    const tms = this.roundT * 1000;
    const left = Math.ceil(this.roundDur - this.roundT);
    if (left <= 5 && left !== this.lastTick && left > 0) {
      this.lastTick = left;
      this.events.push({ type: 'tick', n: left });
    }

    this.updateRoundEvents();
    this.updateEchoViews(tms);

    for (const p of this.players) {
      if (!p.playing || !p.alive) continue;
      const input = p.isBot ? botThink(this, p, dt) : humanInput;
      this.updatePlayer(p, input, dt);
    }
    this.separatePlayers();
    for (const p of this.players) {
      if (!p.playing || !p.alive) continue;
      this.checkHazards(p);
      if (!p.alive) continue;
      this.checkEchoes(p);
      if (!p.alive) continue;
      this.checkPickups(p);
      this.checkDelivery(p);
      this.checkPowerups(p);
      p.recorder?.sample(tms, p.x, p.y, p.dir, p.moving);
    }
    this.updateClones(dt);
    this.updatePowerups(dt);
    this.updateFragments(dt);

    const alive = this.players.filter((p) => p.playing && p.alive).length;
    if (this.roundT >= this.roundDur || alive === 0) this.endRound();
  }

  private updateRoundEvents() {
    const t = this.roundT;
    // perigos anunciados
    for (const ev of this.zoneEvents) {
      const z = this.arena.zones[ev.zone];
      if (t >= ev.warnAt && t - this.lastDt() < ev.warnAt) this.events.push({ type: 'hazardWarn', x: z.x, y: z.y });
      if (t >= ev.activeAt && t - this.lastDt() < ev.activeAt) this.events.push({ type: 'hazardOn', x: z.x, y: z.y });
    }
    // pistões
    for (const pi of this.arena.pistons ?? []) {
      const prev = pistonState(pi, this.worldT - this.lastDt()).phase;
      const now = pistonState(pi, this.worldT).phase;
      if (prev !== 'slam' && now === 'slam') this.events.push({ type: 'piston', x: pi.x + pi.w / 2, y: pi.y });
    }
    for (const b of this.arena.bridges ?? []) {
      const prev = bridgeState(b, this.worldT - this.lastDt());
      if (prev === 'on' && bridgeState(b, this.worldT) === 'warn') this.events.push({ type: 'bridgeWarn', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    }
    // núcleo muda de lugar (rodadas 3+)
    if (this.coreMoveAt > 0) {
      if (!this.coreNext && t >= this.coreMoveAt - 3) {
        const cores = this.arena.cores;
        let c = cores[Math.floor(Math.random() * cores.length)];
        for (let i = 0; i < 6 && dist(c.x, c.y, this.core.x, this.core.y) < 50; i++) c = cores[Math.floor(Math.random() * cores.length)];
        this.coreNext = { ...c };
        this.events.push({ type: 'coreWarn', x: c.x, y: c.y });
      }
      if (this.coreNext && t >= this.coreMoveAt) {
        this.core = this.coreNext;
        this.coreNext = null;
        this.coreMoveAt = -1;
        this.events.push({ type: 'coreMove', x: this.core.x, y: this.core.y });
      }
    }
    // fragmento dourado
    if (this.objective === 'dourado' && !this.goldenDone) {
      const at = this.tiebreak ? 4 : 10;
      if (!this.goldenSpot && t >= at - 3) {
        const s = this.randomFreeSpot(120);
        if (s) {
          this.goldenSpot = s;
          this.events.push({ type: 'goldenWarn', x: s.x, y: s.y });
        }
      }
      if (this.goldenSpot && t >= at && !this.fragments.some((f) => f.golden)) {
        this.fragments.push({ id: this.fragId++, x: this.goldenSpot.x, y: this.goldenSpot.y, vx: 0, vy: 0, golden: true, age: 0, pickDelay: 0 });
        this.events.push({ type: 'goldenSpawn', x: this.goldenSpot.x, y: this.goldenSpot.y });
        this.goldenDone = true;
      }
    }
  }

  private _dt = 1 / 60;
  private lastDt() {
    return this._dt;
  }

  zoneState(i: number): 'off' | 'warn' | 'on' {
    if (this.phase !== 'play') return 'off';
    let s: 'off' | 'warn' | 'on' = 'off';
    for (const ev of this.zoneEvents) {
      if (ev.zone !== i) continue;
      if (this.roundT >= ev.activeAt && this.roundT < ev.endAt) return 'on';
      if (this.roundT >= ev.warnAt && this.roundT < ev.activeAt) s = 'warn';
    }
    return s;
  }

  // ------------------------------------------------------------------ jogador
  private updatePlayer(p: Player, inp: Input, dt: number) {
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.abilCd = Math.max(0, p.abilCd - dt);
    p.turboT = Math.max(0, p.turboT - dt);
    p.phaseT = Math.max(0, p.phaseT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.portalCd = Math.max(0, p.portalCd - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    const tms = this.roundT * 1000;

    let mx = inp.mx;
    let my = inp.my;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    if (p.stunT > 0) {
      mx = 0;
      my = 0;
    }
    const moving = Math.hypot(mx, my) > 0.12;
    if (moving) p.dir = Math.atan2(my, mx);

    if (inp.dash && p.dashCd <= 0 && p.stunT <= 0) {
      p.dashT = C.DASH_TIME;
      p.dashCd = C.DASH_CD;
      p.recorder?.event(tms, 'dash');
      this.events.push({ type: 'dash', x: p.x, y: p.y, pid: p.id });
    }
    if (inp.ability && p.abilCd <= 0 && p.stunT <= 0) this.useAbility(p, mx, my);

    const inBush = (this.arena.bushes ?? []).some((b) => dist(p.x, p.y, b.x, b.y) < b.r);
    p.hidden = inBush || p.phaseT > 0;
    let speed = C.SPEED * (p.turboT > 0 ? 1.55 : 1) * (inBush ? 0.85 : 1);
    if (p.isBot) speed *= p.brain!.speedMul;

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = Math.cos(p.dir) * C.DASH_SPEED;
      p.vy = Math.sin(p.dir) * C.DASH_SPEED;
    } else {
      const k = 1 - Math.exp(-12 * this.arena.grip * dt);
      p.vx += (mx * speed - p.vx) * k;
      p.vy += (my * speed - p.vy) * k;
    }
    // poços de gravidade
    for (const w of this.arena.wells ?? []) {
      const d = dist(p.x, p.y, w.x, w.y);
      if (d < w.range && d > 1) {
        const f = w.pull * (1 - d / w.range) * dt;
        p.vx += ((w.x - p.x) / d) * f;
        p.vy += ((w.y - p.y) / d) * f;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // esteiras
    for (const cv of this.arena.conveyors ?? []) {
      if (inRect(p.x, p.y, cv)) {
        p.x += cv.vx * dt;
        p.y += cv.vy * dt;
      }
    }
    this.collideWorld(p);
    p.moving = moving || p.dashT > 0;
    if (p.moving) p.walkPhase += dt * (p.turboT > 0 ? 16 : 11);

    // portais
    for (const [a, b] of this.arena.portals ?? []) {
      if (p.portalCd > 0) break;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const) {
        if (dist(p.x, p.y, from.x, from.y) < 24) {
          p.recorder?.markJump();
          const ox = Math.cos(p.dir) * 34;
          const oy = Math.sin(p.dir) * 34;
          p.x = to.x + ox;
          p.y = to.y + oy;
          this.collideWorld(p);
          p.portalCd = 1.0;
          this.events.push({ type: 'portal', x: to.x, y: to.y, pid: p.id });
          break;
        }
      }
    }

    // queda (ilhas)
    if (this.arena.islands && !isGround(this.arena, p.x, p.y, this.worldT)) {
      this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: 'fall' });
      this.respawn(p);
      if (p.invulnT <= 0 && p.phaseT <= 0) this.damage(p, 'fall', true);
    }
  }

  private respawn(p: Player) {
    let best = this.arena.spawns[0];
    let bd = Infinity;
    for (const s of this.arena.spawns) {
      const d = dist(s.x, s.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    p.recorder?.markJump();
    p.x = best.x;
    p.y = best.y;
    p.vx = p.vy = 0;
    p.dashT = 0;
  }

  private useAbility(p: Player, mx: number, my: number) {
    const ab = p.char.ability;
    const tms = this.roundT * 1000;
    p.abilCd = ab.cooldown;
    p.recorder?.event(tms, 'ability');
    switch (ab.id) {
      case 'turbo':
        p.turboT = ab.duration;
        break;
      case 'fase':
        p.phaseT = ab.duration;
        break;
      case 'escudo':
        p.shieldT = ab.duration;
        break;
      case 'teleporte': {
        const ang = Math.hypot(mx, my) > 0.1 ? Math.atan2(my, mx) : p.dir;
        for (let d = 190; d >= 30; d -= 10) {
          const nx = p.x + Math.cos(ang) * d;
          const ny = p.y + Math.sin(ang) * d;
          if (this.isFree(nx, ny, C.PLAYER_R) && isGround(this.arena, nx, ny, this.worldT, true)) {
            this.events.push({ type: 'ability', x: p.x, y: p.y, pid: p.id, ability: ab.id });
            p.recorder?.markJump();
            p.x = nx;
            p.y = ny;
            break;
          }
        }
        this.events.push({ type: 'portal', x: p.x, y: p.y, pid: p.id });
        return;
      }
      case 'explosao': {
        const R = 165;
        for (const o of this.players) {
          if (o === p || !o.alive || !o.playing) continue;
          const d = dist(o.x, o.y, p.x, p.y);
          if (d < R) {
            const k = (1 - d / R) * 650 + 250;
            const nx = (o.x - p.x) / (d || 1);
            const ny = (o.y - p.y) / (d || 1);
            o.vx += nx * k;
            o.vy += ny * k;
            o.stunT = Math.max(o.stunT, 0.25);
            if (o.carry > 0 && o.phaseT <= 0 && o.shieldT <= 0) {
              o.carry--;
              this.dropFragment(o.x, o.y, 1);
            }
          }
        }
        for (const e of this.echoViews) {
          if (e.active && !e.disrupted && dist(e.x, e.y, p.x, p.y) < R) this.disrupt(e, p);
        }
        break;
      }
      case 'clone':
        this.clones.push({ owner: p.id, x: p.x, y: p.y, dir: p.dir, t: ab.duration });
        break;
    }
    this.events.push({ type: 'ability', x: p.x, y: p.y, pid: p.id, ability: ab.id });
  }

  isFree(x: number, y: number, r: number): boolean {
    if (x < BORDER + r || x > WORLD_W - BORDER - r || y < BORDER + r || y > WORLD_H - BORDER - r) return false;
    for (const w of this.arena.walls) if (circleRect(x, y, r, w)) return false;
    for (const c of this.arena.pillars) if (dist(x, y, c.x, c.y) < c.r + r) return false;
    return true;
  }

  collideWorld(p: { x: number; y: number; vx?: number; vy?: number }, r = C.PLAYER_R) {
    for (let iter = 0; iter < 2; iter++) {
      for (const w of this.arena.walls) {
        const cx = Math.max(w.x, Math.min(p.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
        let dx = p.x - cx;
        let dy = p.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < r) {
          if (d < 0.001) {
            // centro dentro do retângulo: empurra pelo lado mais próximo
            const opts = [
              [p.x - w.x, -1, 0],
              [w.x + w.w - p.x, 1, 0],
              [p.y - w.y, 0, -1],
              [w.y + w.h - p.y, 0, 1],
            ];
            opts.sort((a, b) => a[0] - b[0]);
            dx = opts[0][1];
            dy = opts[0][2];
            p.x += dx * (opts[0][0] + r);
            p.y += dy * (opts[0][0] + r);
          } else {
            p.x = cx + (dx / d) * r;
            p.y = cy + (dy / d) * r;
          }
        }
      }
      for (const c of this.arena.pillars) {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        const m = c.r + r;
        if (d < m && d > 0.001) {
          p.x = c.x + (dx / d) * m;
          p.y = c.y + (dy / d) * m;
        }
      }
    }
    const minX = BORDER + r;
    const maxX = WORLD_W - BORDER - r;
    const minY = BORDER + r;
    const maxY = WORLD_H - BORDER - r;
    if (p.x < minX) {
      p.x = minX;
      if (p.vx !== undefined && p.vx < 0) p.vx *= -0.3;
    }
    if (p.x > maxX) {
      p.x = maxX;
      if (p.vx !== undefined && p.vx > 0) p.vx *= -0.3;
    }
    if (p.y < minY) {
      p.y = minY;
      if (p.vy !== undefined && p.vy < 0) p.vy *= -0.3;
    }
    if (p.y > maxY) {
      p.y = maxY;
      if (p.vy !== undefined && p.vy > 0) p.vy *= -0.3;
    }
  }

  private separatePlayers() {
    const ps = this.players.filter((p) => p.playing && p.alive);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        if (a.phaseT > 0 || b.phaseT > 0) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        const m = C.PLAYER_R * 2;
        if (d < m && d > 0.01) {
          const push = (m - d) / 2;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          a.x += nx * push;
          a.y += ny * push;
          b.x -= nx * push;
          b.y -= ny * push;
          this.collideWorld(a);
          this.collideWorld(b);
        }
      }
  }

  // ------------------------------------------------------------------ perigos
  hazardAt(x: number, y: number, r: number, t = this.worldT, includeWarn = false): boolean {
    const a = this.arena;
    for (let i = 0; i < a.zones.length; i++) {
      const s = this.zoneState(i);
      if (s === 'on' || (includeWarn && s === 'warn')) {
        const z = a.zones[i];
        if (dist(x, y, z.x, z.y) < z.r + r * 0.4) return true;
      }
    }
    for (const b of a.beams ?? []) {
      const ang = beamAngle(b, t);
      if (distToSegment(x, y, b.x, b.y, b.x + Math.cos(ang) * b.len, b.y + Math.sin(ang) * b.len) < r + 7) return true;
    }
    for (const l of a.lasers ?? []) {
      const lx = laserX(l, t);
      if (Math.abs(x - lx) < r + 4 && y > l.y0 - r && y < l.y1 + r) return true;
    }
    for (const pi of a.pistons ?? []) {
      const s = pistonState(pi, t);
      if ((s.phase === 'slam' && s.ext > 0.25) || (includeWarn && s.phase === 'warn')) {
        const h = includeWarn && s.phase === 'warn' ? pi.h : pi.h * s.ext;
        if (circleRect(x, y, r * 0.7, { x: pi.x, y: pi.y, w: pi.w, h })) return true;
      }
    }
    for (const w of a.wells ?? []) if (dist(x, y, w.x, w.y) < w.r + r * 0.4) return true;
    return false;
  }

  private checkHazards(p: Player) {
    if (p.phaseT > 0) return;
    if (!this.hazardAt(p.x, p.y, C.PLAYER_R)) return;
    // poço: engole e reposiciona
    for (const w of this.arena.wells ?? []) {
      if (dist(p.x, p.y, w.x, w.y) < w.r + C.PLAYER_R * 0.4) {
        this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: 'fall' });
        const s = this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)];
        p.recorder?.markJump();
        p.x = s.x;
        p.y = s.y;
        p.vx = p.vy = 0;
        if (p.invulnT <= 0) this.damage(p, 'fall', true);
        return;
      }
    }
    if (p.invulnT > 0) return;
    if (p.shieldT > 0) {
      p.shieldT = 0;
      p.invulnT = 0.8;
      this.events.push({ type: 'disrupt', x: p.x, y: p.y });
      return;
    }
    this.damage(p, 'hazard');
  }

  private checkEchoes(p: Player) {
    if (p.phaseT > 0) return;
    for (const e of this.echoViews) {
      if (!e.active || e.disrupted || e.iced) continue;
      const own = e.rec.playerId === p.id;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d >= C.PLAYER_R + C.ECHO_R) continue;
      // Ecos sempre bloqueiam/empurram
      const nx = (p.x - e.x) / (d || 1);
      const ny = (p.y - e.y) / (d || 1);
      p.x = e.x + nx * (C.PLAYER_R + C.ECHO_R);
      p.y = e.y + ny * (C.PLAYER_R + C.ECHO_R);
      this.collideWorld(p);
      if (p.shieldT > 0) {
        this.disrupt(e, p);
        p.vx += nx * 300;
        p.vy += ny * 300;
        continue;
      }
      if (p.invulnT > 0) continue;
      if (own && !this.cfg.ownEchoDamage) continue;
      p.vx = nx * 520;
      p.vy = ny * 520;
      if (own) p.stats.ownEchoHits++;
      p.stats.echoHits++;
      this.damage(p, own ? 'own' : 'echo');
      return;
    }
  }

  private disrupt(e: EchoView, by: Player) {
    this.disrupted.set(e.key, this.roundT + 3);
    e.disrupted = true;
    by.stats.disrupted++;
    this.events.push({ type: 'disrupt', x: e.x, y: e.y });
  }

  private damage(p: Player, by: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse', silent = false) {
    p.hearts--;
    p.tookDamage = true;
    p.invulnT = C.INVULN;
    p.stunT = C.STUN;
    p.hitFlash = 0.35;
    p.recorder?.event(this.roundT * 1000, 'hit');
    if (p.carry > 0) {
      this.dropFragment(p.x, p.y, p.carry);
      p.carry = 0;
    }
    if (!silent) this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by });
    if (p.hearts <= 0) {
      p.alive = false;
      p.recorder?.finish(this.roundT * 1000, p.x, p.y, p.dir);
      this.events.push({ type: 'eliminated', x: p.x, y: p.y, pid: p.id });
    }
  }

  // ------------------------------------------------------------------ energia
  private randomFreeSpot(minCoreDist = 70): Pt | null {
    for (let tries = 0; tries < 40; tries++) {
      const x = rnd(BORDER + 24, WORLD_W - BORDER - 24);
      const y = rnd(BORDER + 24, WORLD_H - BORDER - 24);
      if (!this.isFree(x, y, 16)) continue;
      if (this.arena.islands) {
        if (!this.arena.islands.some((i) => inRect(x, y, i, -18))) continue;
      }
      if (dist(x, y, this.core.x, this.core.y) < minCoreDist) continue;
      if ((this.arena.wells ?? []).some((w) => dist(x, y, w.x, w.y) < w.range * 0.55)) continue;
      if ((this.arena.portals ?? []).some(([a, b]) => dist(x, y, a.x, a.y) < 40 || dist(x, y, b.x, b.y) < 40)) continue;
      if (this.players.some((p) => p.alive && dist(x, y, p.x, p.y) < 50)) continue;
      return { x, y };
    }
    return null;
  }

  private spawnFragment() {
    const s = this.randomFreeSpot();
    if (!s) return;
    this.fragments.push({ id: this.fragId++, x: s.x, y: s.y, vx: 0, vy: 0, golden: false, age: 0, pickDelay: 0 });
  }

  private dropFragment(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(140, 260);
      this.fragments.push({ id: this.fragId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, golden: false, age: 0, pickDelay: 0.6 });
    }
  }

  private updateFragments(dt: number) {
    for (const f of this.fragments) {
      f.age += dt;
      f.pickDelay = Math.max(0, f.pickDelay - dt);
      if (f.vx || f.vy) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= Math.exp(-4 * dt);
        f.vy *= Math.exp(-4 * dt);
        if (Math.hypot(f.vx, f.vy) < 5) f.vx = f.vy = 0;
        this.collideWorld(f, C.FRAG_R);
      }
      if (this.arena.islands && !f.vx && !f.vy && !isGround(this.arena, f.x, f.y, this.worldT)) f.age = -999; // caiu
    }
    this.fragments = this.fragments.filter((f) => f.age >= 0);
    const target = Math.round(4 + this.players.filter((p) => p.playing).length * 1.5);
    const normal = this.fragments.filter((f) => !f.golden).length;
    this.fragTimer -= dt;
    if (normal < target && this.fragTimer <= 0) {
      this.spawnFragment();
      this.fragTimer = 1.8;
    }
  }

  private checkPickups(p: Player) {
    for (const f of this.fragments) {
      if (f.pickDelay > 0 || f.age < 0) continue;
      if (dist(p.x, p.y, f.x, f.y) > C.PLAYER_R + C.FRAG_R + 4) continue;
      if (f.golden) {
        f.age = -1;
        this.award(p, POINTS.objective);
        this.events.push({ type: 'pickup', x: f.x, y: f.y, pid: p.id, golden: true });
        this.events.push({ type: 'objective', pid: p.id, text: 'Fragmento Dourado +1' });
        continue;
      }
      if (p.carry >= C.MAX_CARRY) continue;
      f.age = -1;
      p.carry++;
      let lucky = false;
      if (p.char.id === 'maya' && p.carry < C.MAX_CARRY && Math.random() < 0.2) {
        p.carry++;
        lucky = true;
      }
      this.events.push({ type: 'pickup', x: f.x, y: f.y, pid: p.id, lucky });
    }
    this.fragments = this.fragments.filter((f) => f.age >= 0);
  }

  private checkDelivery(p: Player) {
    if (p.carry <= 0) return;
    if (dist(p.x, p.y, this.core.x, this.core.y) > C.CORE_R) return;
    const n = p.carry;
    let pts = deliveryPoints(n);
    if (p.doubleNext) {
      pts *= 2;
      p.doubleNext = false;
      this.events.push({ type: 'objective', pid: p.id, text: 'Energia em dobro!' });
    }
    this.award(p, pts);
    p.stats.delivered += n;
    p.stats.bestDelivery = Math.max(p.stats.bestDelivery, pts);
    p.carry = 0;
    p.recorder?.event(this.roundT * 1000, 'deliver');
    this.events.push({ type: 'deliver', x: this.core.x, y: this.core.y, pid: p.id, points: pts, count: n });
    if (this.objective === 'tripla' && n >= 3 && !p.tripleDone) {
      p.tripleDone = true;
      this.award(p, POINTS.objective);
      this.events.push({ type: 'objective', pid: p.id, text: 'Entrega tripla +1' });
    }
  }

  // ------------------------------------------------------------------ poderes
  private updatePowerups(dt: number) {
    for (const pw of this.powerups) pw.age += dt;
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      this.powerTimer = 5.5 + Math.random() * 2.5;
      if (this.powerups.length < 2 && this.roundT < this.roundDur - 3) {
        const s = this.randomFreeSpot(90);
        if (s) {
          const kind = randomPower();
          this.powerups.push({ id: this.fragId++, kind, x: s.x, y: s.y, age: 0 });
          this.events.push({ type: 'powerSpawn', x: s.x, y: s.y, power: kind });
        }
      }
    }
    // ímã: puxa energia próxima
    for (const p of this.players) {
      if (!p.alive || !p.playing) continue;
      p.magnetT = Math.max(0, p.magnetT - dt);
      if (p.power) {
        p.power.t -= dt;
        if (p.power.t <= 0) p.power = null;
      }
      if (p.magnetT <= 0 || p.carry >= C.MAX_CARRY) continue;
      for (const f of this.fragments) {
        if (f.golden) continue;
        const d = dist(f.x, f.y, p.x, p.y);
        if (d < 230 && d > 1) {
          const k = Math.min(1, (420 * dt) / d);
          f.x += (p.x - f.x) * k;
          f.y += (p.y - f.y) * k;
        }
      }
    }
  }

  private checkPowerups(p: Player) {
    for (const pw of this.powerups) {
      if (dist(p.x, p.y, pw.x, pw.y) > C.PLAYER_R + 16) continue;
      pw.age = -1;
      this.applyPower(p, pw.kind);
      this.events.push({ type: 'power', x: pw.x, y: pw.y, pid: p.id, power: pw.kind });
    }
    this.powerups = this.powerups.filter((pw) => pw.age >= 0);
  }

  private applyPower(p: Player, kind: PowerId) {
    const label = (t: number) => (p.power = { id: kind, t });
    switch (kind) {
      case 'escudo':
        p.shieldT = Math.max(p.shieldT, 8);
        label(8);
        break;
      case 'ima':
        p.magnetT = 6;
        label(6);
        break;
      case 'gelo':
        this.iceUntil = this.roundT + 4;
        label(4);
        break;
      case 'turbo':
        p.turboT = Math.max(p.turboT, 4);
        label(4);
        break;
      case 'dobro':
        p.doubleNext = true;
        label(30);
        break;
      case 'apagar': {
        let best: EchoView | null = null;
        let bd = Infinity;
        for (const e of this.echoViews) {
          if (!e.active) continue;
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        label(2);
        if (best) {
          this.erased.add(best.key);
          for (const g of this.echoes.generations) g.recordings = g.recordings.filter((r) => `${r.round}:${r.playerId}` !== best!.key);
          this.echoViews = this.echoViews.filter((e) => e !== best);
          this.events.push({ type: 'echoErased', x: best.x, y: best.y, pid: p.id });
        }
        break;
      }
    }
    void getPower;
  }

  private updateClones(dt: number) {
    for (const c of this.clones) {
      c.t -= dt;
      const owner = this.players.find((p) => p.id === c.owner);
      if (!owner || !owner.alive || owner.carry >= C.MAX_CARRY) continue;
      let best: Fragment | null = null;
      let bd = Infinity;
      for (const f of this.fragments) {
        if (f.golden || f.pickDelay > 0) continue;
        const d = dist(c.x, c.y, f.x, f.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (!best) continue;
      c.dir = Math.atan2(best.y - c.y, best.x - c.x);
      c.x += Math.cos(c.dir) * 250 * dt;
      c.y += Math.sin(c.dir) * 250 * dt;
      this.collideWorld(c);
      if (bd < 24) {
        best.age = -1;
        owner.carry++;
        this.events.push({ type: 'pickup', x: best.x, y: best.y, pid: owner.id });
        this.fragments = this.fragments.filter((f) => f.age >= 0);
      }
    }
    this.clones = this.clones.filter((c) => c.t > 0);
  }

  // ------------------------------------------------------------------ Ecos
  private refreshEchoViews() {
    this.echoViews = [];
    const expiring = this.echoes.nextToExpire();
    for (const g of this.echoes.generations) {
      const age = this.echoes.ageOf(g.round);
      for (const rec of g.recordings) {
        if (this.erased.has(`${rec.round}:${rec.playerId}`)) continue;
        const s = sampleRecording(rec, 0);
        this.echoViews.push({
          rec,
          key: `${rec.round}:${rec.playerId}`,
          age,
          x: s.x,
          y: s.y,
          dir: s.direction,
          moving: false,
          active: true,
          disrupted: false,
          iced: false,
          pulse: 0,
          expiring: !this.tiebreak && expiring?.round === g.round,
          trail: [],
        });
      }
    }
  }

  private updateEchoViews(tms: number) {
    for (const e of this.echoViews) {
      const s = sampleRecording(e.rec, tms);
      e.x = s.x;
      e.y = s.y;
      e.dir = s.direction;
      e.moving = s.moving;
      e.active = s.active;
      const until = this.disrupted.get(e.key) ?? 0;
      e.disrupted = this.roundT < until;
      e.iced = this.roundT < this.iceUntil;
      const next = upcomingEvent(e.rec, tms, 450, 'dash') ?? upcomingEvent(e.rec, tms, 450, 'ability');
      e.pulse = next !== null ? 1 - (next - tms) / 450 : 0;
      if (tms > 0 && e.active) {
        e.trail.push({ x: s.x, y: s.y });
        if (e.trail.length > 14) e.trail.shift();
      }
    }
  }

  /** posição prevista de um Eco no futuro (a IA pode ler o passado — é justo, é público). */
  predictEcho(e: EchoView, aheadMs: number) {
    return sampleRecording(e.rec, this.roundT * 1000 + aheadMs);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  timeLeft(): number {
    return Math.max(0, this.roundDur - this.roundT);
  }
}

export function circleRect(x: number, y: number, r: number, w: { x: number; y: number; w: number; h: number }): boolean {
  const cx = Math.max(w.x, Math.min(x, w.x + w.w));
  const cy = Math.max(w.y, Math.min(y, w.y + w.h));
  return Math.hypot(x - cx, y - cy) < r;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
