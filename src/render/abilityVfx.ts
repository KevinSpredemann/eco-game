/**
 * Efeitos de habilidade. Lê a posição real do projétil e os eventos reais.
 * Não move bala, não aplica dano e não escolhe a mira.
 */
import { ELEMENT_COLOR, type Element } from '../game/elements';

export const VFX_CAP = 96;
export const VFX_CAP_LOW = 28;

export interface VfxBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  el?: string;
  life: number;
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
}

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
}

const EMPTY: Spark = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: '#fff', size: 1, on: false };

export function elementCore(el: string): { core: string; edge: string } {
  const map: Record<string, { core: string; edge: string }> = {
    lightning: { core: '#f4fbff', edge: '#3ee8ff' },
    fire: { core: '#ffd27a', edge: '#ff4a1a' },
    ice: { core: '#f4fbff', edge: '#7ad7ff' },
    plasma: { core: '#f0c6ff', edge: '#d24cff' },
    wind: { core: '#e8fff8', edge: '#3ddec0' },
    nature: { core: '#d8ffc4', edge: '#2fbf6a' },
    shadow: { core: '#d8d0ff', edge: '#8a7cff' },
  };
  return map[el] ?? { core: '#ffffff', edge: ELEMENT_COLOR[el as Element] ?? '#ffffff' };
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

  note(e: { type: string; x?: number; y?: number; k?: string; msg?: string; skill?: string; pts?: number[]; name?: string }) {
    const x = e.x ?? 0;
    const y = e.y ?? 0;
    if (e.type === 'dmg' && (e.k === 'hp' || e.k === 'shield')) {
      this.impacts.push({ x, y, kind: 'hit', el: 'hit', life: 0.28 });
      this.burst(x, y, '#ffffff', this.reduced ? 2 : 5);
    } else if (e.type === 'dmg' && (e.k === 'immune' || e.k === 'block')) {
      this.impacts.push({ x, y, kind: 'block', el: e.k, life: 0.35 });
    } else if (e.type === 'dmg' && e.k === 'dodge') {
      this.impacts.push({ x, y, kind: 'miss', el: 'dodge', life: 0.25 });
    } else if (e.type === 'combo') {
      this.impacts.push({ x, y, kind: 'combo', el: 'combo', life: 0.4 });
      this.burst(x, y, '#ffe14a', this.reduced ? 3 : 8);
    } else if (e.type === 'deny' && (e.msg === 'Obstáculo' || e.msg === 'Fora de alcance')) {
      this.impacts.push({ x, y, kind: 'miss', el: 'miss', life: 0.35 });
    } else if (e.type === 'zap' && e.pts && e.pts.length >= 4) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < e.pts.length; i += 2) pts.push({ x: e.pts[i], y: e.pts[i + 1] });
      this.links = pts;
      this.linkLife = 0.28;
    } else if (e.type === 'skill' && e.skill) {
      this.burst(x, y, elementCore(e.skill).edge, this.reduced ? 2 : 4);
    }
    if (this.impacts.length > 24) this.impacts.splice(0, this.impacts.length - 24);
  }

  /** Copia a posição. Não escreve de volta no projétil. */
  sync(bullets: readonly VfxBullet[]) {
    const seen = new Set<number>();
    for (const b of bullets) {
      seen.add(b.id);
      const prev = this.live.get(b.id);
      this.live.set(b.id, { x: b.x, y: b.y, px: prev?.x ?? b.x, py: prev?.y ?? b.y, el: b.el || prev?.el || '' });
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
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life >= s.max) this.free(s);
    }
    this.sparkCount = this.sparks.reduce((n, s) => n + (s.on ? 1 : 0), 0);
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].life -= dt;
      if (this.impacts[i].life <= 0) this.impacts.splice(i, 1);
    }
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
    for (const s of this.live.values()) {
      if (!s.el) continue;
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
    for (const im of this.impacts) this.drawImpact(ctx, im);
    for (const s of this.sparks) {
      if (!s.on) continue;
      const k = 1 - s.life / s.max;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Estado no alvo. O tempo vem do relógio real (burnT, frozenT, rootT, slowT). */
  drawStatus(ctx: CanvasRenderingContext2D, p: { x: number; y: number; burnT: number; frozenT: number; slowT: number; rootT: number; stunT: number; plasmaT?: number }, time: number) {
    if (p.rootT > 0) {
      ctx.strokeStyle = elementCore('nature').edge;
      ctx.lineWidth = 2;
      const n = this.reduced ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI + time * 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 6, p.y + 2);
        ctx.quadraticCurveTo(p.x + Math.cos(a) * 16, p.y + 8, p.x + Math.cos(a) * 18, p.y + 14);
        ctx.stroke();
      }
    }
    if (p.frozenT > 0) {
      ctx.strokeStyle = elementCore('ice').edge;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5;
      const n = this.reduced ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 20);
        ctx.lineTo(p.x + Math.cos(a) * 14, p.y - 20 + Math.sin(a) * 14);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (p.slowT > 0) {
      ctx.fillStyle = 'rgba(122, 215, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.burnT > 0 && !this.reduced) {
      this.burst(p.x, p.y - 24, elementCore('fire').edge, 1);
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
    if (p.stunT > 0.2) {
      ctx.fillStyle = '#ffd23e';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(p.x + 14, p.y - 36, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawShot(ctx: CanvasRenderingContext2D, s: LiveShot, time: number) {
    const { core, edge } = elementCore(s.el);
    const ang = Math.atan2(s.y - s.py, s.x - s.px);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    if (s.el === 'lightning') {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-10, -4);
      ctx.lineTo(-6, 3);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.el === 'fire') {
      ctx.fillStyle = edge;
      ctx.fillRect(-12, -2, 12, 4);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.el === 'ice') {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(6, 0);
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 5);
      ctx.stroke();
    } else if (s.el === 'plasma') {
      const r = 4 + Math.sin(time * 14) * 1.2;
      ctx.fillStyle = edge;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (s.el === 'wind') {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-6, 0, 7, -0.8, 0.8);
      ctx.stroke();
    } else if (s.el === 'nature') {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-8, 2);
      ctx.quadraticCurveTo(-2, -4, 4, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
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
    } else {
      const col = im.kind === 'combo' ? '#ffe14a' : '#ffffff';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 6 + (1 - k) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      if (this.sparkCount >= this.cap()) return;
      const s = this.pool.pop() ?? { ...EMPTY };
      const a = (i / n) * Math.PI * 2;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(a) * 80;
      s.vy = Math.sin(a) * 80;
      s.life = 0;
      s.max = 0.35;
      s.color = color;
      s.size = 2.2;
      s.on = true;
      this.sparks.push(s);
      this.sparkCount++;
    }
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
