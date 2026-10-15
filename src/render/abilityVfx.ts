/**
 * Efeitos de habilidade. Lê a posição real do projétil e os eventos reais da simulação
 * (preparo, lançamento, acerto, fim sem acerto, combo). Não move bala, não aplica dano e não
 * escolhe a mira: só desenha o que já aconteceu, no mesmo ponto em que aconteceu.
 *
 * Cada elemento tem a própria combinação de preparo → projétil/área → rastro → impacto →
 * reação no alvo → dissipação. Partículas vêm de um pool com teto (cai no modo "efeitos leves").
 */
import { ELEMENT_COLOR, type Element } from '../game/elements';

export const VFX_CAP = 220;
export const VFX_CAP_LOW = 60;
/** altura do meio do corpo em relação aos pés (os eventos de acerto vêm nos pés) */
const BODY = 26;

export interface VfxBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  el?: string;
  life: number;
  plasma?: boolean;
  basic?: boolean;
  fromEcho?: boolean;
}

export interface VfxImpact {
  x: number;
  y: number;
  kind: 'hit' | 'miss' | 'block' | 'combo';
  el: string;
  life: number;
}

export interface VfxAim {
  x: number;
  y: number;
  ang: number;
  dist: number;
  color: string;
  charge?: number;
  outOfRange?: boolean;
}

interface LiveShot {
  x: number;
  y: number;
  px: number;
  py: number;
  el: string;
  /** últimas posições (rastro) */
  trail: number[];
  seed: number;
}

type PKind = 'spark' | 'ember' | 'flake' | 'leaf' | 'smoke' | 'shard' | 'dot' | 'star';
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  on: boolean;
  kind: PKind;
  rot: number;
  spin: number;
  /** gravidade (positivo cai, negativo sobe) */
  g: number;
  drag: number;
}

type FxKind = 'area' | 'flash' | 'bolt' | 'windup' | 'blink' | 'combo' | 'fizzle' | 'shock';
interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r: number;
  el: string;
  t: number;
  max: number;
  id?: string;
  seed: number;
}

const EMPTY: Spark = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: '#fff', size: 1, on: false, kind: 'dot', rot: 0, spin: 0, g: 0, drag: 0 };

export function elementCore(el: string): { core: string; edge: string } {
  const map: Record<string, { core: string; edge: string }> = {
    lightning: { core: '#f4fbff', edge: '#3ee8ff' },
    fire: { core: '#ffd27a', edge: '#ff4a1a' },
    ice: { core: '#f4fbff', edge: '#7ad7ff' },
    plasma: { core: '#f0c6ff', edge: '#d24cff' },
    wind: { core: '#e8fff8', edge: '#3ddec0' },
    nature: { core: '#d8ffc4', edge: '#2fbf6a' },
    shadow: { core: '#d8d0ff', edge: '#8a7cff' },
    basic: { core: '#ffffff', edge: '#bfe9ff' },
  };
  return map[el] ?? { core: '#ffffff', edge: ELEMENT_COLOR[el as Element] ?? '#ffffff' };
}

/** cores das reações (mistura dos dois elementos do combo) */
const COMBO_COLORS: Record<string, [string, string]> = {
  shatter: ['#9fe8ff', '#3ee8ff'],
  steam: ['#ffffff', '#ffb38a'],
  cinder: ['#ff7a3a', '#7dffe0'],
  storm: ['#3ee8ff', '#7dffe0'],
  arc: ['#ffe14a', '#ff5a1e'],
  thermal: ['#ff7a3a', '#9fe8ff'],
  chill: ['#d24cff', '#9fe8ff'],
  'ult-control': ['#ffe9a0', '#ffd23e'],
  'mark-root': ['#5dff8a', '#2fbf6a'],
  'root-aoe': ['#5dff8a', '#b7d39a'],
  combustao: ['#ff5a1e', '#ffd27a'],
  execute: ['#ffffff', '#ff4a5a'],
  'field-shot': ['#9ad7ff', '#ffffff'],
};

/** número "aleatório" estável por semente (raio que não treme demais) */
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class AbilityVfx {
  impacts: VfxImpact[] = [];
  /** elos só existem quando o evento traz os pontos reais */
  links: { x: number; y: number }[] = [];
  private linkLife = 0;
  aim: VfxAim | null = null;
  sparkCount = 0;
  private live = new Map<number, LiveShot>();
  private sparks: Spark[] = [];
  private pool: Spark[] = [];
  private fx: Fx[] = [];
  private seed = 1;
  reduced = false;

  cap() {
    return this.reduced ? VFX_CAP_LOW : VFX_CAP;
  }

  setReduced(on: boolean) {
    this.reduced = on;
    this.trim();
  }

  setAim(a: VfxAim | null) {
    this.aim = a;
  }

  /** eventos reais da simulação → efeitos no mesmo ponto */
  note(e: { type: string; x?: number; y?: number; k?: string; msg?: string; skill?: string; pts?: number[]; name?: string; el?: string; r?: number; aoe?: boolean; t?: number; x0?: number; y0?: number; x1?: number; y1?: number; id?: string; vfx?: string; wall?: boolean; ang?: number }) {
    const x = e.x ?? 0;
    const y = e.y ?? 0;
    if (e.type === 'dmg' && (e.k === 'hp' || e.k === 'shield')) {
      this.impacts.push({ x, y, kind: 'hit', el: 'hit', life: 0.28 });
    } else if (e.type === 'dmg' && (e.k === 'immune' || e.k === 'block')) {
      this.impacts.push({ x, y, kind: 'block', el: e.k, life: 0.35 });
    } else if (e.type === 'dmg' && e.k === 'dodge') {
      this.impacts.push({ x, y, kind: 'miss', el: 'dodge', life: 0.25 });
    } else if (e.type === 'combo') {
      this.impacts.push({ x, y, kind: 'combo', el: 'combo', life: 0.4 });
      this.comboFx(x, y - BODY, e.id ?? (e.vfx === 'ult' ? 'ult-control' : e.vfx === 'root' ? 'mark-root' : 'arc'));
    } else if (e.type === 'deny' && (e.msg === 'Obstáculo' || e.msg === 'Fora de alcance')) {
      this.impacts.push({ x, y, kind: 'miss', el: 'miss', life: 0.35 });
    } else if (e.type === 'zap' && e.pts && e.pts.length >= 4) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < e.pts.length; i += 2) pts.push({ x: e.pts[i], y: e.pts[i + 1] });
      this.links = pts;
      this.linkLife = 0.28;
    } else if (e.type === 'phit' && e.el) {
      this.impactFx(x, y - BODY, e.el, !!e.aoe);
    } else if (e.type === 'pend' && e.el) {
      this.fizzle(x, y, e.el);
    } else if (e.type === 'windup' && e.el) {
      this.addFx({ kind: 'windup', x, y: y - BODY, r: 22, el: e.el, t: 0, max: Math.max(0.25, e.t ?? 0.5) });
    } else if (e.type === 'blink' && e.el) {
      this.addFx({ kind: 'blink', x: e.x0 ?? x, y: (e.y0 ?? y) - BODY, x2: e.x1 ?? x, y2: (e.y1 ?? y) - BODY, r: 18, el: e.el, t: 0, max: 0.55 });
      this.burst(e.x0 ?? x, (e.y0 ?? y) - BODY, e.el, 8, 120, 0.4);
      this.burst(e.x1 ?? x, (e.y1 ?? y) - BODY, e.el, 10, 160, 0.45);
    } else if (e.type === 'dash' && e.el) {
      this.burst(x, y - 10, e.el, 8, 140, 0.4);
    } else if (e.type === 'skill' && e.skill) {
      const el = e.skill;
      if ((e.r ?? 0) > 30 && el in ELEMENT_COLOR) {
        // área: desenha a área real no chão e a animação do elemento dentro dela
        this.addFx({ kind: 'area', x, y, r: Math.min(e.r!, 160), el, t: 0, max: 0.75 });
      } else {
        // lançamento: brilho na mão de quem lançou
        this.burst(x, y - BODY, el, 5, 90, 0.3);
        this.addFx({ kind: 'flash', x, y: y - BODY, r: 16, el, t: 0, max: 0.16 });
      }
    }
    if (this.impacts.length > 24) this.impacts.splice(0, this.impacts.length - 24);
    if (this.fx.length > 48) this.fx.splice(0, this.fx.length - 48);
  }

  /** Copia a posição. Não escreve de volta no projétil. */
  sync(bullets: readonly VfxBullet[]) {
    const seen = new Set<number>();
    for (const b of bullets) {
      if (b.fromEcho) continue;
      const el = b.plasma ? 'plasma' : b.basic ? 'basic' : b.el || '';
      seen.add(b.id);
      const prev = this.live.get(b.id);
      if (prev) {
        prev.px = prev.x;
        prev.py = prev.y;
        prev.x = b.x;
        prev.y = b.y;
        prev.el = el || prev.el;
        prev.trail.unshift(b.x, b.y);
        if (prev.trail.length > 16) prev.trail.length = 16;
      } else this.live.set(b.id, { x: b.x, y: b.y, px: b.x - b.vx / 60, py: b.y - b.vy / 60, el, trail: [b.x, b.y], seed: this.seed++ });
    }
    for (const id of this.live.keys()) if (!seen.has(id)) this.live.delete(id);
  }

  shotAt(id: number) {
    return this.live.get(id) ?? null;
  }

  step(dt: number) {
    for (const s of this.sparks) {
      if (!s.on) continue;
      s.life += dt;
      s.vy += s.g * dt;
      if (s.drag) {
        const k = Math.max(0, 1 - s.drag * dt);
        s.vx *= k;
        s.vy *= k;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      if (s.life >= s.max) this.free(s);
    }
    this.sparkCount = this.sparks.reduce((n, s) => n + (s.on ? 1 : 0), 0);
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].life -= dt;
      if (this.impacts[i].life <= 0) this.impacts.splice(i, 1);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.max) this.fx.splice(i, 1);
      else if (!this.reduced) this.fxTick(f, dt);
    }
    // rastros vivos soltam partículas do elemento
    if (!this.reduced) for (const s of this.live.values()) this.shotTick(s);
    if (this.linkLife > 0) {
      this.linkLife -= dt;
      if (this.linkLife <= 0) this.links = [];
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();
    if (this.aim && (this.aim.charge ?? 0) > 0) {
      const c = this.aim.charge ?? 0;
      const col = this.aim.outOfRange ? '#ff5a6a' : this.aim.color;
      ctx.globalAlpha = 0.15 + c * 0.45;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2 + c * 4;
      ctx.beginPath();
      ctx.arc(this.aim.x, this.aim.y, 10 + c * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // efeitos de chão primeiro (áreas), depois projéteis, depois brilhos
    for (const f of this.fx) if (f.kind === 'area') this.drawArea(ctx, f, time);
    for (const s of this.live.values()) {
      if (!s.el) continue;
      this.drawTrail(ctx, s);
      this.drawShot(ctx, s, time);
    }
    if (this.links.length >= 2) {
      ctx.strokeStyle = elementCore('lightning').edge;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(this.links[0].x, this.links[0].y);
      for (let i = 1; i < this.links.length; i++) ctx.lineTo(this.links[i].x, this.links[i].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const f of this.fx) if (f.kind !== 'area') this.drawFx(ctx, f, time);
    for (const im of this.impacts) this.drawImpact(ctx, im);
    this.drawSparks(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Estado no alvo. O tempo vem do relógio real (burnT, frozenT, rootT, slowT…). */
  drawStatus(ctx: CanvasRenderingContext2D, p: { x: number; y: number; burnT: number; frozenT: number; slowT: number; rootT: number; stunT: number; plasmaT?: number; shockT?: number; gustT?: number; markedT?: number }, time: number) {
    const low = this.reduced;
    ctx.save();
    // raízes: crescem do chão e prendem os pés; somem ao acabar
    if (p.rootT > 0) {
      const grow = Math.min(1, (1.3 - Math.min(1.3, p.rootT)) / 0.25 + 0.25);
      const fade = Math.min(1, p.rootT / 0.3);
      ctx.globalAlpha = fade;
      const n = low ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const a0 = (i / n) * Math.PI * 2;
        const bx = p.x + Math.cos(a0) * 12;
        ctx.strokeStyle = i % 3 ? '#2fbf6a' : '#6b4a2a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, p.y + 4);
        ctx.quadraticCurveTo(p.x + side * 14, p.y - 6 * grow, p.x + side * 4, p.y - 16 * grow);
        ctx.stroke();
      }
      ctx.fillStyle = '#5dff8a';
      if (!low) for (let i = 0; i < 3; i++) this.leafAt(ctx, p.x + (i - 1) * 9, p.y - 10 * grow - i * 3, time + i);
      ctx.globalAlpha = 1;
    }
    // congelado: casca de gelo nas pernas + flocos; lento: anel de gelo nos pés
    if (p.frozenT > 0) {
      const a = 0.35 + 0.15 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(160,230,255,${a})`;
      ctx.strokeStyle = 'rgba(230,250,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 16, p.y + 2);
      ctx.lineTo(p.x - 12, p.y - 22);
      ctx.lineTo(p.x - 3, p.y - 30);
      ctx.lineTo(p.x + 6, p.y - 24);
      ctx.lineTo(p.x + 15, p.y - 28);
      ctx.lineTo(p.x + 16, p.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!low && Math.random() < 0.25) this.spawn(p.x + (Math.random() - 0.5) * 30, p.y - 20 - Math.random() * 20, (Math.random() - 0.5) * 20, -10, 0.8, '#e8fbff', 2.2, 'flake', 20, 0);
    } else if (p.slowT > 0) {
      ctx.strokeStyle = 'rgba(160,230,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2, 18, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // queimando: chamas no corpo + brasas subindo
    if (p.burnT > 0) {
      const n = low ? 1 : 3;
      for (let i = 0; i < n; i++) {
        const fx = p.x + (i - 1) * 8;
        const h = 10 + Math.sin(time * 14 + i * 2) * 4;
        this.flameAt(ctx, fx, p.y - 14 - i * 3, h);
      }
      if (!low && Math.random() < 0.5) this.spawn(p.x + (Math.random() - 0.5) * 18, p.y - 28, (Math.random() - 0.5) * 30, -60, 0.5, Math.random() < 0.5 ? '#ffb347' : '#ff5a1e', 2.4, 'ember', -40, 0.5);
    }
    // eletrizado (marca de raio): estalos no corpo
    if ((p.shockT ?? 0) > 0 && !low) {
      ctx.strokeStyle = elementCore('lightning').edge;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(time * 20));
      const s = Math.floor(time * 12);
      this.boltPath(ctx, p.x - 10, p.y - 40, p.x + 8, p.y - 14, s, 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // vento: riscos girando em volta
    if ((p.gustT ?? 0) > 0 && !low) {
      ctx.strokeStyle = 'rgba(125,255,224,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const a = time * 6 + i * Math.PI;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 20, 22, 9, 0, a, a + 1.2);
        ctx.stroke();
      }
    }
    if ((p.plasmaT ?? 0) > 0) {
      ctx.strokeStyle = elementCore('plasma').edge;
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time * 8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16, 16 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // marca (semente): alvo na cabeça
    if ((p.markedT ?? 0) > 0) {
      ctx.strokeStyle = '#7dff9a';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      const r = 8 + Math.sin(time * 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y - 58, r, 0, Math.PI * 2);
      ctx.moveTo(p.x - r - 4, p.y - 58);
      ctx.lineTo(p.x + r + 4, p.y - 58);
      ctx.moveTo(p.x, p.y - 58 - r - 4);
      ctx.lineTo(p.x, p.y - 58 + r + 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // tonto: estrelinhas girando na cabeça
    if (p.stunT > 0) {
      ctx.fillStyle = '#ffd23e';
      for (let i = 0; i < 3; i++) {
        const a = time * 7 + (i / 3) * Math.PI * 2;
        this.starAt(ctx, p.x + Math.cos(a) * 14, p.y - 62 + Math.sin(a) * 4, 3.5);
      }
    }
    ctx.restore();
  }

  // ================================================================== projéteis
  private drawTrail(ctx: CanvasRenderingContext2D, s: LiveShot) {
    const t = s.trail;
    if (t.length < 4) return;
    const { core, edge } = elementCore(s.el);
    const width = s.el === 'plasma' ? 12 : s.el === 'fire' ? 11 : s.el === 'basic' ? 4 : 8;
    const n = Math.min(t.length / 2, this.reduced ? 5 : 8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // rastro contínuo afinando: largo e fraco por fora, fino e claro no meio
    for (const [w, a, col, part] of [
      [width, 0.22, edge, 1],
      [width * 0.45, 0.45, core, 0.6],
    ] as const) {
      const m = Math.max(2, Math.round(n * part));
      ctx.strokeStyle = col;
      for (let i = 1; i < m; i++) {
        const k = 1 - i / m;
        ctx.globalAlpha = a * k;
        ctx.lineWidth = w * k + 0.5;
        ctx.beginPath();
        ctx.moveTo(t[(i - 1) * 2], t[(i - 1) * 2 + 1]);
        ctx.lineTo(t[i * 2], t[i * 2 + 1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.55) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawShot(ctx: CanvasRenderingContext2D, s: LiveShot, time: number) {
    const { core, edge } = elementCore(s.el);
    const ang = Math.atan2(s.y - s.py, s.x - s.px);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.glow(ctx, s.x, s.y, s.el === 'basic' ? 12 : 26, edge, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    // poderes um pouco maiores que um tiro comum: dá para ver o que vem
    if (s.el !== 'basic') ctx.scale(1.7, 1.7);
    else ctx.scale(1.3, 1.3);
    if (s.el === 'lightning') {
      // núcleo branco-azulado com ramificações elétricas que mudam a cada quadro
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      const k = Math.floor(time * 30) + s.seed * 7;
      for (let b = 0; b < 3; b++) {
        this.boltPath(ctx, -22 - b * 3, (hash(k + b) - 0.5) * 10, 2, 0, k + b * 13, 4);
        ctx.stroke();
      }
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.el === 'fire') {
      // bola de fogo: chama que tremula atrás do núcleo
      const fl = Math.sin(time * 30 + s.seed) * 2;
      ctx.fillStyle = '#ff4a1a';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.quadraticCurveTo(0, -8 - fl, -18, 0);
      ctx.quadraticCurveTo(0, 8 + fl, 6, 0);
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.quadraticCurveTo(0, -5, -10, 0);
      ctx.quadraticCurveTo(0, 5, 5, 0);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(2, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.el === 'ice') {
      // estilhaço de gelo girando, com faceta clara
      ctx.rotate(time * 6 + s.seed);
      ctx.fillStyle = 'rgba(160,230,255,0.85)';
      ctx.strokeStyle = '#f4fbff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(0, -5);
      ctx.lineTo(-8, 0);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 7);
      ctx.stroke();
    } else if (s.el === 'plasma') {
      // núcleo roxo pulsando com anel que "distorce"
      const r = 6 + Math.sin(time * 14) * 1.4;
      ctx.fillStyle = hexA(edge, 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(core, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r + 5 + Math.sin(time * 9) * 2, r + 2, time * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.el === 'wind') {
      // lâmina de ar: três crescentes girando
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 1 - i * 0.28;
        ctx.beginPath();
        ctx.arc(-i * 6, 0, 8 - i, -1 + Math.sin(time * 12 + i) * 0.2, 1 + Math.sin(time * 12 + i) * 0.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (s.el === 'nature') {
      // semente com folhas girando em espiral
      ctx.fillStyle = '#6b4a2a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5dff8a';
      for (let i = 0; i < 2; i++) {
        ctx.save();
        ctx.rotate(time * 8 + i * Math.PI);
        ctx.translate(7, 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (s.el === 'shadow') {
      ctx.fillStyle = 'rgba(20,10,40,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-12, -5);
      ctx.moveTo(8, 0);
      ctx.lineTo(-12, 5);
      ctx.stroke();
    } else {
      // ataque básico: dardo de luz curto
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-7, -2);
      ctx.lineTo(-7, 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** partículas que o projétil solta no caminho (fogo solta brasa, gelo solta floco…) */
  private shotTick(s: LiveShot) {
    if (!s.el || s.el === 'basic' || Math.random() > 0.55) return;
    const vx = (s.x - s.px) * 4;
    const vy = (s.y - s.py) * 4;
    const j = (n: number) => (Math.random() - 0.5) * n;
    if (s.el === 'fire') this.spawn(s.x + j(6), s.y + j(6), -vx * 0.2 + j(30), -vy * 0.2 - 30, 0.45, Math.random() < 0.5 ? '#ffb347' : '#ff5a1e', 2.4, 'ember', -50, 1);
    else if (s.el === 'ice') this.spawn(s.x + j(8), s.y + j(8), j(30), j(30), 0.6, '#e8fbff', 2, 'flake', 10, 1.5);
    else if (s.el === 'lightning') this.spawn(s.x + j(10), s.y + j(10), j(120), j(120), 0.18, '#bff8ff', 1.6, 'spark', 0, 2);
    else if (s.el === 'nature') this.spawn(s.x + j(8), s.y + j(8), j(30), 20, 0.7, Math.random() < 0.7 ? '#5dff8a' : '#2fbf6a', 3, 'leaf', 40, 1);
    else if (s.el === 'plasma') this.spawn(s.x + j(10), s.y + j(10), j(40), j(40), 0.4, '#e9a8ff', 2, 'dot', 0, 2);
    else if (s.el === 'shadow') this.spawn(s.x + j(6), s.y + j(6), j(20), -10, 0.5, 'rgba(60,30,110,0.8)', 5, 'smoke', -10, 1);
    else if (s.el === 'wind') this.spawn(s.x + j(10), s.y + j(10), -vx * 0.3, -vy * 0.3, 0.3, '#c8fff0', 1.6, 'dot', 0, 3);
  }

  // ================================================================== impactos
  private impactFx(x: number, y: number, el: string, aoe: boolean) {
    const n = aoe ? 0.6 : 1;
    if (el === 'fire') {
      this.addFx({ kind: 'shock', x, y, r: 30, el, t: 0, max: 0.35 });
      this.burst(x, y, 'fire', Math.round(14 * n), 220, 0.5, 'ember', -60);
      this.burst(x, y, 'smoke', Math.round(4 * n), 40, 0.8, 'smoke', -30);
    } else if (el === 'ice') {
      this.addFx({ kind: 'shock', x, y, r: 24, el, t: 0, max: 0.3 });
      this.burst(x, y, 'ice', Math.round(12 * n), 200, 0.55, 'shard', 160);
    } else if (el === 'lightning') {
      this.addFx({ kind: 'flash', x, y, r: 34, el, t: 0, max: 0.14 });
      this.addFx({ kind: 'bolt', x, y, r: 46, el, t: 0, max: 0.22 });
      this.burst(x, y, 'lightning', Math.round(12 * n), 260, 0.25, 'spark', 0);
    } else if (el === 'wind') {
      this.addFx({ kind: 'shock', x, y, r: 34, el, t: 0, max: 0.35 });
      this.burst(x, y, 'wind', Math.round(10 * n), 220, 0.35, 'dot', 0);
    } else if (el === 'nature') {
      this.addFx({ kind: 'shock', x, y, r: 22, el, t: 0, max: 0.3 });
      this.burst(x, y, 'nature', Math.round(10 * n), 140, 0.8, 'leaf', 120);
      this.burst(x, y + BODY - 2, '#6b4a2a', Math.round(6 * n), 90, 0.5, 'dot', 260);
    } else if (el === 'plasma') {
      this.addFx({ kind: 'shock', x, y, r: 40, el, t: 0, max: 0.4 });
      this.addFx({ kind: 'flash', x, y, r: 26, el, t: 0, max: 0.14 });
      this.burst(x, y, 'plasma', Math.round(14 * n), 240, 0.45, 'dot', 0);
    } else if (el === 'shadow') {
      this.addFx({ kind: 'shock', x, y, r: 26, el, t: 0, max: 0.35 });
      this.burst(x, y, 'smoke', Math.round(8 * n), 80, 0.7, 'smoke', -20);
    } else {
      this.burst(x, y, 'basic', 5, 120, 0.25, 'spark', 0);
    }
  }

  /** projétil que não acertou: dissipa no lugar (sem fingir acerto) */
  private fizzle(x: number, y: number, el: string) {
    this.addFx({ kind: 'fizzle', x, y, r: 12, el, t: 0, max: 0.3 });
    this.burst(x, y, el, 5, 70, 0.3, el === 'fire' ? 'ember' : el === 'ice' ? 'flake' : 'dot', 0);
  }

  /** combo fechado: efeito próprio de cada reação, maior que um golpe comum */
  private comboFx(x: number, y: number, id: string) {
    const [a, b] = COMBO_COLORS[id] ?? ['#ffe14a', '#ffffff'];
    this.addFx({ kind: 'combo', x, y, r: id === 'ult-control' ? 90 : 64, el: a, t: 0, max: 0.6, id });
    this.burst(x, y, a, 14, 300, 0.55, 'spark', 0);
    this.burst(x, y, b, 10, 200, 0.6, id === 'shatter' ? 'shard' : id === 'steam' ? 'smoke' : id.includes('root') ? 'leaf' : 'dot', id === 'shatter' ? 180 : 0);
    if (id === 'storm' || id === 'arc' || id === 'shatter') this.addFx({ kind: 'bolt', x, y, r: 70, el: 'lightning', t: 0, max: 0.3 });
  }

  // ================================================================== desenho dos efeitos
  private drawArea(ctx: CanvasRenderingContext2D, f: Fx, time: number) {
    const k = f.t / f.max;
    const fade = 1 - k;
    const { core, edge } = elementCore(f.el);
    const r = f.r * (0.35 + 0.65 * Math.min(1, k * 3));
    ctx.save();
    // marca no chão (achatada = perspectiva) com runa do elemento
    ctx.translate(f.x, f.y);
    ctx.scale(1, 0.55);
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = hexA(edge, 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, time * 2, time * 2 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (f.el === 'lightning') {
      // raios caindo dentro da área
      ctx.scale(1, 1 / 0.55);
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      const s = Math.floor(f.t * 24) + f.seed;
      for (let i = 0; i < 3; i++) {
        const bx = (hash(s + i) - 0.5) * r * 1.4;
        const by = (hash(s + i + 9) - 0.5) * r * 0.7;
        this.boltPath(ctx, bx, by - 60, bx, by, s + i * 5, 5);
        ctx.stroke();
      }
    } else if (f.el === 'wind') {
      // espiral girando (vórtice)
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = time * 8 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.3 + 0.2 * i), a, a + 1.6);
        ctx.stroke();
      }
    } else if (f.el === 'ice') {
      // estrela de gelo no chão
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        ctx.stroke();
      }
    } else if (f.el === 'fire') {
      ctx.fillStyle = hexA('#ff7a3a', 0.35 * fade);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.el === 'nature') {
      // raízes saindo do centro em direção à borda
      ctx.scale(1, 1 / 0.55);
      ctx.strokeStyle = '#2fbf6a';
      ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + f.seed;
        const len = r * Math.min(1, k * 4);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a + 0.4) * len * 0.5, Math.sin(a + 0.4) * len * 0.3, Math.cos(a) * len, Math.sin(a) * len * 0.55);
        ctx.stroke();
      }
    } else if (f.el === 'plasma') {
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + k * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D, f: Fx, time: number) {
    const k = f.t / f.max;
    const fade = 1 - k;
    const { core, edge } = elementCore(f.el);
    ctx.save();
    if (f.kind === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      this.glow(ctx, f.x, f.y, f.r * (1 + k), edge, 0.8 * fade);
      this.glow(ctx, f.x, f.y, f.r * 0.5, '#ffffff', 0.7 * fade);
    } else if (f.kind === 'shock') {
      // onda de choque que abre e some
      ctx.strokeStyle = edge;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 3 * fade + 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.3 + k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      this.glow(ctx, f.x, f.y, f.r * 0.8, edge, 0.5 * fade);
    } else if (f.kind === 'bolt') {
      // descarga: raios saindo do ponto do acerto
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      ctx.globalAlpha = fade;
      const s = Math.floor(f.t * 40) + f.seed;
      for (let i = 0; i < 4; i++) {
        const a = hash(s + i) * Math.PI * 2;
        this.boltPath(ctx, f.x, f.y, f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, s + i * 3, 4);
        ctx.stroke();
      }
    } else if (f.kind === 'windup') {
      // energia se juntando na mão de quem prepara (cresce até sair)
      const r = f.r * (0.4 + 0.8 * k);
      ctx.globalCompositeOperation = 'lighter';
      this.glow(ctx, f.x, f.y, r * 1.8, edge, 0.6);
      ctx.strokeStyle = core;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, time * 8, time * 8 + Math.PI * 1.3);
      ctx.stroke();
    } else if (f.kind === 'blink') {
      // rastro do piscar: imagem residual na saída e risco até a chegada
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 6 * fade + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x2!, f.y2!);
      ctx.stroke();
      ctx.fillStyle = hexA(edge, 0.35 * fade);
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 14, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(core, fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x2!, f.y2!, 10 + k * 22, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'combo') {
      // combo: anel duplo grande + clarão, nas cores dos dois elementos
      const [a, b] = COMBO_COLORS[f.id ?? ''] ?? ['#ffe14a', '#ffffff'];
      ctx.globalCompositeOperation = 'lighter';
      this.glow(ctx, f.x, f.y, f.r * (0.6 + k * 0.6), a, 0.6 * fade);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      ctx.lineWidth = 4;
      ctx.strokeStyle = a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.2 + k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = b;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.1 + k * 0.7), 0, Math.PI * 2);
      ctx.stroke();
      if (f.id === 'shatter' || f.id === 'thermal') {
        ctx.strokeStyle = '#f4fbff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + f.seed;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(ang) * f.r * k, f.y + Math.sin(ang) * f.r * k);
          ctx.stroke();
        }
      }
    } else if (f.kind === 'fizzle') {
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.5 + k), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawImpact(ctx: CanvasRenderingContext2D, im: VfxImpact) {
    const k = Math.max(0, Math.min(1, im.life / 0.4));
    ctx.save();
    ctx.globalAlpha = k;
    if (im.kind === 'miss') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 8 + (1 - k) * 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (im.kind === 'block') {
      ctx.strokeStyle = im.el === 'immune' ? '#f4f4ff' : '#9ad8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else if (im.kind === 'hit') {
      // marcador de acerto curto (o efeito do elemento vem do evento do poder)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const r = 6 + (1 - k) * 8;
      ctx.beginPath();
      ctx.moveTo(im.x - r, im.y - BODY - r);
      ctx.lineTo(im.x - r * 0.4, im.y - BODY - r * 0.4);
      ctx.moveTo(im.x + r, im.y - BODY - r);
      ctx.lineTo(im.x + r * 0.4, im.y - BODY - r * 0.4);
      ctx.moveTo(im.x - r, im.y - BODY + r);
      ctx.lineTo(im.x - r * 0.4, im.y - BODY + r * 0.4);
      ctx.moveTo(im.x + r, im.y - BODY + r);
      ctx.lineTo(im.x + r * 0.4, im.y - BODY + r * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSparks(ctx: CanvasRenderingContext2D) {
    for (const s of this.sparks) {
      if (!s.on) continue;
      const k = 1 - s.life / s.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.color;
      if (s.kind === 'shard') {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        ctx.moveTo(s.size * 1.6, 0);
        ctx.lineTo(0, -s.size * 0.6);
        ctx.lineTo(-s.size * 1.6, 0);
        ctx.lineTo(0, s.size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (s.kind === 'leaf') {
        this.leafAt(ctx, s.x, s.y, s.rot, s.size);
      } else if (s.kind === 'smoke') {
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 + (1 - k) * 1.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'spark') {
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
        ctx.stroke();
      } else if (s.kind === 'star') {
        this.starAt(ctx, s.x, s.y, s.size);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.4 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================== formas
  private boltPath(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, segs: number) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (hash(seed * 3 + i) - 0.5) * Math.min(16, len * 0.35);
      ctx.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
    }
    ctx.lineTo(x1, y1);
  }

  private flameAt(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
    ctx.fillStyle = 'rgba(255,90,30,0.85)';
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 4, y - h * 0.6, x, y - h);
    ctx.quadraticCurveTo(x + 4, y - h * 0.6, x + 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,210,122,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y);
    ctx.quadraticCurveTo(x, y - h * 0.6, x + 2.5, y);
    ctx.closePath();
    ctx.fill();
  }

  private leafAt(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, size = 3) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.4, size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private starAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ================================================================== partículas
  private addFx(f: Omit<Fx, 'seed'>) {
    if (this.reduced && (f.kind === 'bolt' || f.kind === 'fizzle')) return;
    this.fx.push({ ...f, seed: this.seed++ });
  }

  /** efeitos que soltam partículas enquanto duram */
  private fxTick(f: Fx, dt: number) {
    if (f.kind === 'area' && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * f.r;
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d * 0.55;
      if (f.el === 'fire') this.spawn(x, y, 0, -80, 0.5, Math.random() < 0.5 ? '#ffb347' : '#ff5a1e', 2.6, 'ember', -60, 1);
      else if (f.el === 'ice') this.spawn(x, y - 10, 0, -20, 0.7, '#e8fbff', 2.2, 'flake', 0, 1);
      else if (f.el === 'nature') this.spawn(x, y, (Math.random() - 0.5) * 40, -40, 0.8, '#5dff8a', 3, 'leaf', 80, 1);
      else if (f.el === 'wind') this.spawn(x, y - 10, -Math.sin(a) * 120, Math.cos(a) * 60, 0.35, '#c8fff0', 1.6, 'dot', 0, 2);
      else if (f.el === 'plasma') this.spawn(x, y - 10, 0, -40, 0.5, '#e9a8ff', 2, 'dot', 0, 1);
    } else if (f.kind === 'windup' && Math.random() < dt * 40) {
      // energia convergindo para a mão
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 20;
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d;
      this.spawn(x, y, (f.x - x) * 4, (f.y - y) * 4, 0.25, elementCore(f.el).edge, 2, 'dot', 0, 0);
    }
  }

  /** rajada de partículas do elemento */
  private burst(x: number, y: number, el: string, n: number, speed: number, life: number, kind?: PKind, g = 0) {
    const color = (i: number) => {
      if (el === 'fire') return i % 3 === 0 ? '#ffd27a' : i % 3 === 1 ? '#ff7a3a' : '#ff4a1a';
      if (el === 'smoke') return 'rgba(90,80,100,0.7)';
      if (el.startsWith('#')) return el;
      const c = elementCore(el);
      return i % 2 ? c.core : c.edge;
    };
    const k: PKind = kind ?? (el === 'ice' ? 'shard' : el === 'nature' ? 'leaf' : el === 'fire' ? 'ember' : el === 'lightning' ? 'spark' : 'dot');
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.5), color(i), k === 'smoke' ? 6 : k === 'shard' ? 3 : 2.4, k, g, 2.5);
    }
  }

  private spawn(x: number, y: number, vx: number, vy: number, max: number, color: string, size: number, kind: PKind, g: number, drag: number) {
    if (this.sparkCount >= this.cap()) return;
    const reused = this.pool.pop();
    const s = reused ?? { ...EMPTY };
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.life = 0;
    s.max = max;
    s.color = color;
    s.size = size;
    s.kind = kind;
    s.rot = Math.random() * Math.PI * 2;
    s.spin = (Math.random() - 0.5) * 10;
    s.g = g;
    s.drag = drag;
    s.on = true;
    if (!reused) this.sparks.push(s);
    this.sparkCount++;
  }

  private free(s: Spark) {
    s.on = false;
    this.pool.push(s);
  }

  private trim() {
    let n = 0;
    for (const s of this.sparks) {
      if (!s.on) continue;
      n++;
      if (n > this.cap()) this.free(s);
    }
    this.sparkCount = this.sparks.reduce((a, s) => a + (s.on ? 1 : 0), 0);
  }
}

function hexA(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
