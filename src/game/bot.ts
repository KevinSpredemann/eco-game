import { ArenaDef, BORDER, WORLD_H, WORLD_W, bridgeState, inRect } from './arenas';
import { tuneSteer } from './mapTune';
import { GUN_Y, isPrimary } from './weapons';
import { BOSS } from './balance';
import type { Difficulty, Game, Input, Player } from './sim';
import { BASIC, SLOT_COST, WALL_REACH, botPower, kitOf, studioOf, wallSlam } from './elements';
import { officialSlot } from './combos';
import * as C from './constants';

const CELL = 20;
const GW = Math.ceil(WORLD_W / CELL);
const GH = Math.ceil(WORLD_H / CELL);

/** Grade de navegação para a IA (A*). Paredes fixas pré-calculadas; pontes avaliadas no momento. */
export class NavGrid {
  private solid: Uint8Array;
  private bridgeOf: Int16Array;
  private island: Uint8Array;
  constructor(private arena: ArenaDef) {
    this.solid = new Uint8Array(GW * GH);
    this.bridgeOf = new Int16Array(GW * GH).fill(-1);
    this.island = new Uint8Array(GW * GH);
    const r = C.PLAYER_R + 3;
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++) {
        const x = gx * CELL + CELL / 2;
        const y = gy * CELL + CELL / 2;
        const i = gy * GW + gx;
        let s = x < BORDER + r || x > WORLD_W - BORDER - r || y < BORDER + r || y > WORLD_H - BORDER - r;
        for (const w of arena.walls) if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) s = true;
        for (const c of arena.pillars) if (Math.hypot(x - c.x, y - c.y) < c.r + r) s = true;
        for (const w of arena.wells ?? []) if (Math.hypot(x - w.x, y - w.y) < w.r + 70) s = true;
        for (const l of arena.lava ?? []) if (Math.hypot(x - l.x, y - l.y) < l.r + 6) s = true;
        this.solid[i] = s ? 1 : 0;
        if (arena.islands) {
          if (arena.islands.some((is) => inRect(x, y, is, -10))) this.island[i] = 1;
          arena.bridges?.forEach((b, bi) => {
            if (inRect(x, y, b, -6)) this.bridgeOf[i] = bi;
          });
        }
      }
  }

  walkable(gx: number, gy: number, t: number): boolean {
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return false;
    const i = gy * GW + gx;
    if (this.solid[i]) return false;
    if (!this.arena.islands) return true;
    if (this.island[i]) return true;
    const b = this.bridgeOf[i];
    if (b >= 0) return bridgeState(this.arena.bridges![b], t) === 'on' && bridgeState(this.arena.bridges![b], t + 1.2) === 'on';
    return false;
  }

  walkableAt(x: number, y: number, t: number) {
    return this.walkable(Math.floor(x / CELL), Math.floor(y / CELL), t);
  }

  lineClear(ax: number, ay: number, bx: number, by: number, t: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 10);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!this.walkableAt(ax + (bx - ax) * k, ay + (by - ay) * k, t)) return false;
    }
    return true;
  }

  /** A* com 8 vizinhos; devolve pontos já suavizados. */
  path(ax: number, ay: number, bx: number, by: number, t: number): { x: number; y: number }[] {
    if (this.lineClear(ax, ay, bx, by, t)) return [{ x: bx, y: by }];
    const sx = clampI(Math.floor(ax / CELL), GW);
    const sy = clampI(Math.floor(ay / CELL), GH);
    let tx = clampI(Math.floor(bx / CELL), GW);
    let ty = clampI(Math.floor(by / CELL), GH);
    if (!this.walkable(tx, ty, t)) {
      // procura a célula livre mais próxima do alvo
      let found = false;
      for (let r = 1; r < 6 && !found; r++)
        for (let dy = -r; dy <= r && !found; dy++)
          for (let dx = -r; dx <= r && !found; dx++)
            if (this.walkable(tx + dx, ty + dy, t)) {
              tx += dx;
              ty += dy;
              found = true;
            }
      if (!found) return [{ x: bx, y: by }];
    }
    const N = GW * GH;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const f = new Float32Array(N).fill(Infinity);
    const start = sy * GW + sx;
    const goal = ty * GW + tx;
    g[start] = 0;
    f[start] = octile(sx, sy, tx, ty);
    open.push(start);
    let iterations = 0;
    while (open.length && iterations++ < 3000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % GW;
      const cy = (cur / GW) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.walkable(nx, ny, t)) continue;
          if (dx && dy && (!this.walkable(cx + dx, cy, t) || !this.walkable(cx, cy + dy, t))) continue;
          const ni = ny * GW + nx;
          if (closed[ni]) continue;
          const ng = g[cur] + (dx && dy ? 1.414 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            f[ni] = ng + octile(nx, ny, tx, ty);
            open.push(ni);
          }
        }
    }
    if (came[goal] < 0 && goal !== start) return [{ x: bx, y: by }];
    const cells: { x: number; y: number }[] = [];
    for (let c = goal; c !== start && c >= 0; c = came[c]) cells.push({ x: (c % GW) * CELL + CELL / 2, y: ((c / GW) | 0) * CELL + CELL / 2 });
    cells.reverse();
    cells.push({ x: bx, y: by });
    // suavização por linha de visão
    const out: { x: number; y: number }[] = [];
    let px = ax;
    let py = ay;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineClear(px, py, cells[j].x, cells[j].y, t)) j--;
      out.push(cells[j]);
      px = cells[j].x;
      py = cells[j].y;
      i = j + 1;
    }
    return out;
  }
}

function clampI(v: number, n: number) {
  return Math.max(0, Math.min(n - 1, v));
}
function octile(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

/**
 * Perfis de dificuldade. aim = erro de mira (rad) que muda devagar; lead = quanto antecipa o movimento;
 * react = tempo até atirar num alvo novo; burst/pause = rajadas e pausas (ninguém atira sem parar).
 */
/**
 * Dificuldade muda o comportamento, não a vida nem o dano.
 * speedMul fica em 1: o bot anda na mesma velocidade do jogador.
 * aim = erro de mira (rad). react = espera antes de agir num alvo novo.
 * dash e ability = chance de esquivar e de usar poder. sloppy = escolhas piores.
 */
export const PROFILES: Record<Difficulty, { speedMul: number; avoid: number; think: number; dash: number; ability: number; sloppy: number; aim: number; lead: number; react: number; burst: number; pause: number; focus: number }> = {
  facil: { speedMul: 1, avoid: 0.28, think: 0.9, dash: 0.1, ability: 0.12, sloppy: 0.58, aim: 0.7, lead: 0.05, react: 1.35, burst: 0.45, pause: 1.6, focus: 1 },
  normal: { speedMul: 1, avoid: 0.55, think: 0.6, dash: 0.24, ability: 0.32, sloppy: 0.3, aim: 0.4, lead: 0.22, react: 0.9, burst: 0.65, pause: 1.1, focus: 1 },
  dificil: { speedMul: 1, avoid: 0.78, think: 0.45, dash: 0.36, ability: 0.44, sloppy: 0.16, aim: 0.26, lead: 0.4, react: 0.62, burst: 0.85, pause: 0.8, focus: 1 },
};

/** quem pode atirar no mesmo alvo: os mais perto primeiro, empate pelo id. Os outros só se posicionam. */
export function fireSlot(ids: { id: string; d: number }[], me: string, cap: number): boolean {
  const ranked = [...ids].sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  const i = ranked.findIndex((x) => x.id === me);
  return i >= 0 && i < cap;
}

export class BotBrain {
  speedMul: number;
  avoid: number;
  thinkEvery: number;
  dashSkill: number;
  abilitySkill: number;
  sloppy: number;
  target: { x: number; y: number } | null = null;
  path: { x: number; y: number }[] = [];
  thinkT = 0;
  stuckT = 0;
  lastX = 0;
  lastY = 0;
  jitter = 0;
  aimErr: number;
  lead: number;
  react: number;
  burst: number;
  pauseLen: number;
  focus: number;
  /** alvo atual (para dividir alvos entre bots e para o tempo de reação) */
  targetId = '';
  seenT = 0;
  /** desvio de mira que muda devagar (erra de verdade, não só treme) */
  aimOff = 0;
  aimDrift = 0;
  fireT = 0;
  restT = 0;
  /** o tiro desta janela erra de propósito (sorteado uma vez, não a cada quadro) */
  whiff = false;
  constructor(d: Difficulty) {
    const p = PROFILES[d];
    this.aimErr = p.aim;
    this.lead = p.lead;
    this.react = p.react;
    this.burst = p.burst;
    this.pauseLen = p.pause;
    this.focus = p.focus;
    this.speedMul = p.speedMul;
    this.avoid = p.avoid;
    this.thinkEvery = p.think;
    this.dashSkill = p.dash;
    this.abilitySkill = p.ability;
    this.sloppy = p.sloppy;
  }
  reset() {
    this.target = null;
    this.path = [];
    this.thinkT = Math.random() * 0.3;
    this.stuckT = 0;
    this.targetId = '';
    this.seenT = 0;
    this.whiff = false;
    this.restT = 0;
  }
}

export function botThink(game: Game, p: Player, dt: number): Input {
  const b = p.brain!;
  const out: Input = { mx: 0, my: 0, dash: false, ability: false };
  b.thinkT -= dt;

  if (b.thinkT <= 0) {
    b.thinkT = b.thinkEvery * (0.8 + Math.random() * 0.4);
    b.target = chooseTarget(game, p);
    if (b.target) b.path = game.nav.path(p.x, p.y, b.target.x, b.target.y, game.worldT);
    // detector de travamento
    if (Math.hypot(p.x - b.lastX, p.y - b.lastY) < 6 && b.target) b.stuckT += b.thinkEvery;
    else b.stuckT = 0;
    b.lastX = p.x;
    b.lastY = p.y;
    if (b.stuckT > 1) {
      b.jitter = 0.6;
      b.stuckT = 0;
    }
  }

  let dx = 0;
  let dy = 0;
  if (b.path.length) {
    let wp = b.path[0];
    while (b.path.length > 1 && Math.hypot(wp.x - p.x, wp.y - p.y) < 16) {
      b.path.shift();
      wp = b.path[0];
    }
    const d = Math.hypot(wp.x - p.x, wp.y - p.y);
    if (d > 1) {
      dx = (wp.x - p.x) / d;
      dy = (wp.y - p.y) / d;
    }
  }
  if (b.jitter > 0) {
    b.jitter -= dt;
    const a = p.dir + Math.PI / 2 + Math.sin(game.worldT * 3) * 1.5;
    dx = Math.cos(a);
    dy = Math.sin(a);
  }

  // ---- desviar dos Ecos (lê a gravação: o passado é previsível)
  let ax = 0;
  let ay = 0;
  let threat = 0;
  if (p.phaseT <= 0) {
    for (const e of game.echoViews) {
      if (!e.active || e.disrupted || e.iced) continue;
      if (e.rec.playerId === p.id && !game.cfg.ownEchoDamage) continue;
      for (const ahead of [0, 220, 480]) {
        const s = ahead === 0 ? e : game.predictEcho(e, ahead);
        if (!('active' in s) || !s.active) continue;
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        const R = 78;
        if (d < R && d > 0.1) {
          const w = ((R - d) / R) * (ahead === 0 ? 1.6 : ahead === 220 ? 1.0 : 0.5);
          ax += ((p.x - s.x) / d) * w;
          ay += ((p.y - s.y) / d) * w;
          if (ahead === 0 && d < 46) threat = Math.max(threat, 1 - d / 46);
        }
      }
    }
  }
  dx += ax * b.avoid;
  dy += ay * b.avoid;

  // ---- perigos (zonas anunciadas, feixes, lasers, pistões, quedas)
  let m = Math.hypot(dx, dy);
  if (m > 0.01) {
    dx /= m;
    dy /= m;
    const t2 = game.worldT + 0.15;
    const bad = (ang: number) => {
      for (const step of [26, 52]) {
        const x = p.x + Math.cos(ang) * step;
        const y = p.y + Math.sin(ang) * step;
        if (p.phaseT <= 0 && game.hazardAt(x, y, C.PLAYER_R, t2, b.avoid > 0.7)) return true;
        if (tuneSteer(game.arena, x, y, t2).avoid) return true;
        if (game.arena.islands && !game.nav.walkableAt(x, y, game.worldT)) return true;
      }
      return false;
    };
    const base = Math.atan2(dy, dx);
    if (Math.random() > b.sloppy && bad(base)) {
      const offs = [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI];
      let picked: number | null = null;
      for (const o of offs)
        if (!bad(base + o)) {
          picked = base + o;
          break;
        }
      if (picked !== null) {
        dx = Math.cos(picked);
        dy = Math.sin(picked);
      } else {
        dx = dy = 0;
      }
    }
  }
  // se já estiver dentro de uma zona avisada, sair dela
  for (let i = 0; i < game.arena.zones.length; i++) {
    const st = game.zoneState(i);
    if (st === 'off') continue;
    const z = game.arena.zones[i];
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    if (d < z.r + C.PLAYER_R && d > 0.1 && Math.random() > b.sloppy) {
      dx = (p.x - z.x) / d;
      dy = (p.y - z.y) / d;
    }
  }

  const seek = tuneSteer(game.arena, p.x, p.y, game.worldT).seek;
  if (seek && threat < 0.35 && Math.random() > b.sloppy) {
    const sd = Math.hypot(seek.x - p.x, seek.y - p.y);
    if (sd > 28 && sd < 240) {
      dx += ((seek.x - p.x) / sd) * 0.45;
      dy += ((seek.y - p.y) / sd) * 0.45;
    }
  }

  m = Math.hypot(dx, dy);
  if (m > 0.01) {
    out.mx = dx / m;
    out.my = dy / m;
  }

  // ---- impulso
  if (p.dashCd <= 0) {
    if (threat > 0.4 && Math.random() < b.dashSkill * 0.25) out.dash = true;
    else if (b.target && p.carry >= 2 && Math.random() < 0.01 * b.dashSkill) out.dash = true;
  }

  // ---- habilidade
  if (p.abilCd <= 0 && Math.random() < b.abilitySkill * 0.08) {
    const distCore = Math.hypot(p.x - game.core.x, p.y - game.core.y);
    switch (p.char.ability.id) {
      case 'turbo':
        out.ability = p.carry >= 2 && distCore > 250;
        break;
      case 'fase':
        out.ability = threat > 0.3 || (p.phaseT <= 0 && game.hazardAt(p.x, p.y, C.PLAYER_R + 20, game.worldT, true));
        break;
      case 'escudo':
        out.ability = threat > 0.2;
        break;
      case 'teleporte':
        out.ability = !!b.target && Math.hypot(b.target.x - p.x, b.target.y - p.y) > 230 && b.path.length === 1;
        break;
      case 'explosao':
        out.ability =
          threat > 0.5 ||
          game.players.some((o) => o !== p && o.alive && o.playing && o.carry > 0 && !o.hidden && Math.hypot(o.x - p.x, o.y - p.y) < 140);
        break;
      case 'clone':
        out.ability = p.carry <= 1 && game.fragments.filter((f) => Math.hypot(f.x - p.x, f.y - p.y) < 320).length >= 2;
        break;
      case 'sombra':
        out.ability = threat > 0.35;
        break;
      case 'torreta':
        out.ability = threat > 0.2;
        break;
      case 'cura':
        out.ability = p.hearts < 3;
        break;
      case 'investida':
      case 'raio':
      case 'gravidade':
      case 'gancho': {
        const reach = p.char.ability.id === 'investida' ? 200 : p.char.ability.id === 'gancho' ? 320 : 280;
        out.ability = game.players.some((o) => o !== p && o.alive && o.playing && o.carry > 0 && !o.hidden && Math.hypot(o.x - p.x, o.y - p.y) < reach);
        break;
      }
      case 'muralha':
      case 'fumaca':
        out.ability = threat > 0.3;
        break;
    }
  }
  // habilidade extra pega no mapa
  if (p.bonusAb && Math.random() < b.abilitySkill * 0.02 && (threat > 0.2 || game.players.some((o) => o !== p && o.alive && o.playing && Math.hypot(o.x - p.x, o.y - p.y) < 200))) out.bonus = true;
  return out;
}

function chooseTarget(game: Game, p: Player): { x: number; y: number } | null {
  const b = p.brain!;
  const core = game.core;
  const dCore = Math.hypot(p.x - core.x, p.y - core.y);
  const power = game.powerups.find((pw) => Math.hypot(pw.x - p.x, pw.y - p.y) < 240) ?? (!p.bonusAb ? game.abilityOrbs.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < 260) : undefined);
  if (power && Math.random() > b.sloppy) return power;
  const golden = game.fragments.find((f) => f.golden);
  if (golden && Math.hypot(golden.x - p.x, golden.y - p.y) < 520) return golden;

  const cands = game.fragments
    .filter((f) => !f.golden && f.pickDelay <= 0)
    .map((f) => {
      let score = Math.hypot(f.x - p.x, f.y - p.y);
      if (game.hazardAt(f.x, f.y, 20, game.worldT, true)) score += 300;
      // evita disputar com outro bot o mesmo fragmento
      for (const o of game.players) if (o !== p && o.brain?.target === f) score += 120;
      return { f, score };
    })
    .sort((a, c) => a.score - c.score);

  const left = game.timeLeft();
  const goCore =
    p.carry >= C.MAX_CARRY ||
    (p.carry > 0 && left < 6) ||
    (p.carry >= 2 && (!cands.length || dCore < cands[0].score * 1.3)) ||
    (p.carry > 0 && !cands.length);
  if (goCore) return core;
  if (!cands.length) return { x: core.x + (Math.random() - 0.5) * 300, y: core.y + (Math.random() - 0.5) * 200 };
  const pickIdx = Math.random() < b.sloppy ? Math.min(cands.length - 1, Math.floor(Math.random() * 3)) : 0;
  return cands[pickIdx].f;
}

// ====================================================================== combate

export function botCombat(game: Game, p: Player, dt: number): Input {
  const b = p.brain!;
  const out: Input = { mx: 0, my: 0, dash: false, ability: false, fire: false, item: false, aim: null };
  if (game.cfg.dummy) return out;
  b.thinkT -= dt;
  b.jitter -= dt;

  // alvo: rival (ou robô) visível mais perto, prefere quem está com pouca vida; no Chefe, geradores primeiro
  let target: { x: number; y: number; vx: number; vy: number; hp: number; player?: Player; enemy?: { kind: string } } | null = null;
  let best = Infinity;
  for (const o of game.targetsOf(p)) {
    const id = o.player ? o.player.id : 'e' + (o.enemy as any)?.id;
    // dividir alvos: quanto mais bots já atacam alguém, menos atraente ele fica (sem "todos em você")
    const others = game.players.filter((q) => q !== p && q.brain && q.alive && q.brain.targetId === id && !game.hostile(q, p)).length;
    const d = Math.hypot(o.x - p.x, o.y - p.y) - (100 - Math.min(100, o.hp)) * 0.8 - (({ pylon: 260, xama: 320, cuspidor: 120, rastejador: 90 } as Record<string, number>)[o.enemy?.kind ?? ''] ?? 0) + others * 170 + (others >= 2 ? 400 : 0) + (id === b.targetId ? -60 : 0);
    if (d < best) {
      best = d;
      target = o;
    }
  }
  const tid = target ? (target.player ? target.player.id : 'e' + (target.enemy as any)?.id) : '';
  if (tid !== b.targetId) {
    b.targetId = tid;
    b.seenT = 0;
  } else b.seenT += dt;
  // pouca vida: recua para pegar cura (ou usa o kit)
  const lowHp = p.hp < p.maxHp * 0.35;
  const want = 180;
  const dTarget = target ? Math.hypot(target.x - p.x, target.y - p.y) : Infinity;

  // objetivo de movimento
  let gx = p.x;
  let gy = p.y;
  const pickup =
    game.powerups.find((pw) => Math.hypot(pw.x - p.x, pw.y - p.y) < (isPrimary(p.weapon) ? 320 : 180)) ??
    (!p.bonusAb ? game.abilityOrbs.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < 300) : undefined);
  const healPick = lowHp ? game.powerups.find((pw) => (pw.kind === 'cura' || pw.kind === 'escudo') && Math.hypot(pw.x - p.x, pw.y - p.y) < 520) : undefined;
  if (healPick) {
    gx = healPick.x;
    gy = healPick.y;
  } else if (lowHp && target && dTarget < want + 80) {
    // recua para trás de si, mantendo distância (dá chance à recuperação lenta)
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    gx = p.x - Math.cos(ang) * 170 + Math.cos(ang + Math.PI / 2) * (b.jitter > 0 ? 70 : -70);
    gy = p.y - Math.sin(ang) * 170 + Math.sin(ang + Math.PI / 2) * (b.jitter > 0 ? 70 : -70);
  } else if (pickup && Math.random() > b.sloppy) {
    gx = pickup.x;
    gy = pickup.y;
  } else if (target) {
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    if (b.thinkT <= 0) {
      b.thinkT = 1 + Math.random();
      b.jitter = Math.random() < 0.5 ? 1 : -1; // lado do zigue-zague
    }
    const side = b.jitter > 0 ? 1 : -1;
    const tb = target.player?.boss ? target.player : null;
    if (tb) {
      // flanqueia: procura as costas do Chefe (ponto fraco)
      const back = tb.aim + Math.PI + side * 0.5;
      gx = tb.x + Math.cos(back) * Math.max(160, want * 0.85);
      gy = tb.y + Math.sin(back) * Math.max(160, want * 0.85);
    } else if (d > want + 70) {
      gx = target.x;
      gy = target.y;
    } else if (d < want - 70) {
      gx = p.x - Math.cos(ang) * 120 + Math.cos(ang + (Math.PI / 2) * side) * 60;
      gy = p.y - Math.sin(ang) * 120 + Math.sin(ang + (Math.PI / 2) * side) * 60;
    } else {
      gx = p.x + Math.cos(ang + (Math.PI / 2) * side) * 120;
      gy = p.y + Math.sin(ang + (Math.PI / 2) * side) * 120;
    }
  }
  // caminho (A*) quando há parede no meio
  if (!game.nav.lineClear(p.x, p.y, gx, gy, game.worldT)) {
    if (!b.path.length || Math.random() < 0.05) b.path = game.nav.path(p.x, p.y, gx, gy, game.worldT);
    if (b.path.length) {
      let wp = b.path[0];
      while (b.path.length > 1 && Math.hypot(wp.x - p.x, wp.y - p.y) < 16) {
        b.path.shift();
        wp = b.path[0];
      }
      gx = wp.x;
      gy = wp.y;
    }
  } else b.path = [];
  let dx = gx - p.x;
  let dy = gy - p.y;
  let m = Math.hypot(dx, dy);
  if (m > 1) {
    dx /= m;
    dy /= m;
  } else dx = dy = 0;

  // desviar de balas, Ecos e perigos
  let threat = 0;
  for (const bl of game.bullets) {
    if (bl.owner === p.id && !bl.fromEcho) continue;
    const rx = p.x - bl.x;
    const ry = p.y - GUN_Y - bl.y;
    const d = Math.hypot(rx, ry);
    if (d > 170) continue;
    const sp = Math.hypot(bl.vx, bl.vy) || 1;
    const towards = (rx * bl.vx + ry * bl.vy) / (d * sp);
    if (towards < 0.6) continue;
    threat = Math.max(threat, 1 - d / 170);
    // passo para o lado (perpendicular à bala)
    const px = -bl.vy / sp;
    const py = bl.vx / sp;
    const sgn = px * rx + py * ry > 0 ? 1 : -1;
    dx += px * sgn * 1.6 * b.avoid;
    dy += py * sgn * 1.6 * b.avoid;
  }
  for (const e of game.echoViews) {
    if (!e.active || e.disrupted || e.iced) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < 70 && d > 0.1) {
      dx += ((p.x - e.x) / d) * (1 - d / 70) * 1.5 * b.avoid;
      dy += ((p.y - e.y) / d) * (1 - d / 70) * 1.5 * b.avoid;
    }
  }
  // golpes com aviso: sai da área antes de cair
  for (const c of game.casts) {
    if (c.fired && c.kind !== 'estase') continue;
    const owner = game.players.find((o) => o.id === c.owner);
    if (owner && !game.hostile(owner, p)) continue;
    if (c.kind === 'feixe' || c.kind === 'avanco') {
      const ex = c.x + Math.cos(c.ang) * c.len;
      const ey = c.y + Math.sin(c.ang) * c.len;
      const vx = ex - c.x;
      const vy = ey - c.y;
      const L = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - c.x) * vx + (p.y - c.y) * vy) / L));
      const px = c.x + vx * t;
      const py = c.y + vy * t;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < c.w / 2 + 40) {
        dx += ((p.x - px) / (d || 1)) * 2.4;
        dy += ((p.y - py) / (d || 1)) * 2.4;
        threat = Math.max(threat, 0.8);
      }
      continue;
    }
    const r = c.kind === 'impacto' ? c.r + 30 : c.r + 20;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < r && d > 0.1) {
      dx += ((p.x - c.x) / d) * 2.6;
      dy += ((p.y - c.y) / d) * 2.6;
      threat = Math.max(threat, 0.8);
    }
  }
  for (const bm of game.bombs) {
    const d = Math.hypot(p.x - bm.tx, p.y - bm.ty);
    if (d < 130 && d > 0.1) {
      dx += ((p.x - bm.tx) / d) * 2 * b.avoid;
      dy += ((p.y - bm.ty) / d) * 2 * b.avoid;
      threat = Math.max(threat, 0.6);
    }
  }
  m = Math.hypot(dx, dy);
  if (m > 0.01) {
    dx /= m;
    dy /= m;
    const t2 = game.worldT + 0.15;
    const bad = (ang: number) => {
      for (const step of [26, 52]) {
        const x = p.x + Math.cos(ang) * step;
        const y = p.y + Math.sin(ang) * step;
        if (game.hazardAt(x, y, C.PLAYER_R, t2, true)) return true;
        if (tuneSteer(game.arena, x, y, t2).avoid) return true;
        if (game.arena.islands && !game.nav.walkableAt(x, y, game.worldT)) return true;
      }
      return false;
    };
    const base = Math.atan2(dy, dx);
    if (bad(base)) {
      for (const o of [0.6, -0.6, 1.2, -1.2, 2, -2, Math.PI]) {
        if (!bad(base + o)) {
          dx = Math.cos(base + o);
          dy = Math.sin(base + o);
          break;
        }
      }
    }
  }
  out.mx = dx;
  out.my = dy;

  // X1 e 2x2: sem tiro. Escolhe um poder e tenta o combo que já está armado.
  out.fire = false;
    out.item = false;
    if (b.restT > 0) b.restT -= dt;
    const foe = target?.player;
    if (foe && p.stunT <= 0) {
      const d = Math.hypot(foe.x - p.x, foe.y - p.y);
      const clear = game.nav.lineClear(p.x, p.y, foe.x, foe.y, game.worldT);
      if (clear && d < 340) {
        const ang = Math.atan2(foe.y - p.y, foe.x - p.x);
        if (Math.random() < dt * 1.3) b.aimDrift = Math.random() * 2 - 1;
        b.aimOff += (b.aimDrift * b.aimErr - b.aimOff) * Math.min(1, dt * 2.5);
        out.aim = ang + b.aimOff;
        out.ca = out.aim;
        out.cr = Math.max(24, d * (1 + b.aimOff * 0.35));
        const aura = { burn: foe.burnT, frozen: foe.frozenT, gust: foe.gustT, shock: foe.shockT, root: foe.rootT, marked: foe.markedT, field: foe.fieldT, fieldEl: foe.fieldEl, stun: foe.stunT, combo: foe.comboT, plasma: foe.plasmaPrimeT };
        let slot = officialSlot(p.char.id, kitOf(p.char.id), p.powerCd, aura, d);
        if (slot === null) {
          slot = botPower(
            kitOf(p.char.id),
            p.powerCd,
            aura,
            d,
            wallSlam(p.x, p.y, foe.x, foe.y, WALL_REACH, (x, y) => !game.isFree(x, y, 10)),
          );
        }
        if (slot === 2 && p.ultCharge < 100) slot = null;
        if (slot !== null && slot !== 2 && p.energy < SLOT_COST[slot]) slot = null;
        const commit = () => {
          b.whiff = Math.random() < b.sloppy * 0.8;
          const kick = b.whiff ? (b.aimOff >= 0 ? 0.85 : -0.85) : 0;
          out.aim = ang + b.aimOff + kick;
          out.ca = out.aim;
          b.restT = b.pauseLen * (1.2 - b.burst);
        };
        if (slot !== null && b.seenT >= b.react && b.restT <= 0) {
          if (slot === 0) out.ability = true;
          else if (slot === 1) out.skill = true;
          else if (slot === 2) out.ult = true;
          else {
            out.bonus = true;
            out.item = true;
          }
          commit();
        } else if (p.plasmaOn && p.plasmaCd <= 0 && b.seenT >= b.react && b.restT <= 0) {
          const extra = studioOf(p.loadout.secondary);
          if (extra && p.energy >= extra.cost && d < Math.max(extra.range, extra.step ?? 0)) {
            out.plasma = true;
            commit();
          }
        } else if (clear && d < BASIC.range - 8 && p.basicCd <= 0 && p.energy >= BASIC.cost && b.seenT >= b.react && b.restT <= 0) {
          out.fire = true;
          commit();
        }
      }
    }
    if (p.dashCd <= 0 && threat > 0.5 && Math.random() < b.dashSkill * 0.3) out.dash = true;
  return out;
}
