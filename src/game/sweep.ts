// Colisão contínua: o trajeto inteiro é testado, não só o ponto no fim do quadro.
// Assim um projétil rápido não atravessa uma parede fina quando o quadro atrasa.

export interface SweepRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SweepDisc {
  x: number;
  y: number;
  r: number;
}
export interface SweepBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Primeiro t em [0, 1] em que o círculo toca um sólido. null se o trecho está livre. */
export function sweepCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  rects: readonly SweepRect[],
  discs: readonly SweepDisc[],
  bounds: SweepBounds,
): number | null {
  let best: number | null = null;
  const take = (t: number | null) => {
    if (t === null || t < 0 || t > 1) return;
    if (best === null || t < best) best = t;
  };
  take(exitBox(x0, y0, x1, y1, bounds));
  for (const w of rects) take(segmentAabb(x0, y0, x1, y1, w.x - r, w.y - r, w.x + w.w + r, w.y + w.h + r));
  for (const c of discs) take(segmentDisc(x0, y0, x1, y1, c.x, c.y, c.r + r));
  return best;
}

/** Linha de visão. As pontas não entram: o centro do personagem pode encostar na parede. */
export function segmentOpen(blocked: (x: number, y: number) => boolean, ax: number, ay: number, bx: number, by: number, step = 6): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  if (d <= step) return true;
  const n = Math.max(2, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (blocked(ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
  }
  return true;
}

/** Primeiro t em que o ponto em movimento toca a cápsula vertical. */
export function sweepCapsule(x0: number, y0: number, x1: number, y1: number, cx: number, foot: number, head: number, radius: number): number | null {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const cy = Math.max(head, Math.min(foot, y));
    if (Math.hypot(cx - x, cy - y) <= radius) return t;
  }
  return null;
}

function segmentAabb(x0: number, y0: number, x1: number, y1: number, minX: number, minY: number, maxX: number, maxY: number): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [dx, x0, minX, maxX],
    [dy, y0, minY, maxY],
  ];
  for (const [d, o, mn, mx] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let ta = (mn - o) / d;
    let tb = (mx - o) / d;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return t0;
}

function segmentDisc(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, rad: number): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - rad * rad;
  if (a < 1e-8) return c <= 0 ? 0 : null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t >= 0 && t <= 1) return t;
  if (c <= 0) return 0;
  return null;
}

function exitBox(x0: number, y0: number, x1: number, y1: number, b: SweepBounds): number | null {
  if (x0 < b.minX || x0 > b.maxX || y0 < b.minY || y0 > b.maxY) return 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [dx, x0, b.minX, b.maxX],
    [dy, y0, b.minY, b.maxY],
  ];
  for (const [d, o, mn, mx] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return 0;
      continue;
    }
    let ta = (mn - o) / d;
    let tb = (mx - o) / d;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return 0;
  }
  return t1 < 1 ? t1 : null;
}
