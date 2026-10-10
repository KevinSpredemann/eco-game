import { ArenaDef, BORDER, WORLD_H, WORLD_W, bridgeState, inRect } from './arenas';
import type { Difficulty, Game, Input, Player } from './sim';
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

const PROFILES: Record<Difficulty, { speedMul: number; avoid: number; think: number; dash: number; ability: number; sloppy: number }> = {
  facil: { speedMul: 0.72, avoid: 0.55, think: 0.6, dash: 0.25, ability: 0.3, sloppy: 0.35 },
  normal: { speedMul: 0.86, avoid: 1.0, think: 0.4, dash: 0.6, ability: 0.7, sloppy: 0.12 },
  dificil: { speedMul: 0.97, avoid: 1.45, think: 0.25, dash: 0.9, ability: 1, sloppy: 0 },
};

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
  constructor(d: Difficulty) {
    const p = PROFILES[d];
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
    }
  }
  return out;
}

function chooseTarget(game: Game, p: Player): { x: number; y: number } | null {
  const b = p.brain!;
  const core = game.core;
  const dCore = Math.hypot(p.x - core.x, p.y - core.y);
  const power = game.powerups.find((pw) => Math.hypot(pw.x - p.x, pw.y - p.y) < 240);
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
