import type { EchoAction, EchoRecording, EchoSample, RecordedEvent, RecordedFrame } from '../../shared/types';

/** Intervalo fixo de gravação (ms). 20 amostras/s é leve e suficiente com interpolação. */
export const SAMPLE_MS = 50;

/**
 * Grava estados compactos em intervalos fixos + eventos discretos.
 * Não grava vídeo: apenas tempo, posição, direção e ações.
 */
export class EchoRecorder {
  private rec: EchoRecording;
  private nextSampleT = 0;
  private pendingJump = false;
  private finished = false;

  constructor(playerId: string, round: number, color: string, characterId: string) {
    this.rec = { playerId, round, color, characterId, frames: [], events: [], endT: 0 };
  }

  /** Chame a cada passo da simulação. Só grava quando chega o próximo instante de amostra. */
  sample(t: number, x: number, y: number, direction: number, moving: boolean): void {
    if (this.finished) return;
    if (this.pendingJump) {
      // grava imediatamente o quadro pós-salto, marcado para não interpolar
      this.push({ t, x, y, direction, moving, jump: true });
      this.pendingJump = false;
      this.nextSampleT = t + SAMPLE_MS;
      return;
    }
    if (t + 1e-6 < this.nextSampleT) return;
    this.push({ t, x, y, direction, moving });
    this.nextSampleT += SAMPLE_MS;
    if (this.nextSampleT <= t) this.nextSampleT = t + SAMPLE_MS;
  }

  /** Avise antes de amostrar a nova posição de um teleporte/portal/renascimento. */
  markJump(): void {
    this.pendingJump = true;
  }

  event(t: number, action: EchoAction, extra?: { a?: number; w?: string; tx?: number; ty?: number }): void {
    if (this.finished) return;
    this.rec.events.push(extra ? { t, action, ...extra } : { t, action });
  }

  finish(t: number, x: number, y: number, direction: number): EchoRecording {
    if (!this.finished) {
      const last = this.rec.frames[this.rec.frames.length - 1];
      if (!last || last.t < t) this.push({ t, x, y, direction, moving: false });
      this.rec.endT = t;
      this.finished = true;
    }
    return this.rec;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get recording(): EchoRecording {
    return this.rec;
  }

  private push(f: RecordedFrame): void {
    const r = (n: number) => Math.round(n * 10) / 10;
    this.rec.frames.push({ ...f, x: r(f.x), y: r(f.y), direction: Math.round(f.direction * 100) / 100 });
  }
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Busca binária do último quadro com t <= alvo. */
export function frameIndexAt(frames: RecordedFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0 || t < frames[0].t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Reproduz a gravação no mesmo tempo relativo da rodada. O Eco não decide nada:
 * só interpola entre amostras gravadas (sem atravessar saltos).
 */
export function sampleRecording(rec: EchoRecording, t: number): EchoSample {
  const f = rec.frames;
  if (f.length === 0) return { x: 0, y: 0, direction: 0, moving: false, active: false };
  if (t <= f[0].t) return { x: f[0].x, y: f[0].y, direction: f[0].direction, moving: false, active: true };
  const last = f[f.length - 1];
  if (t >= rec.endT || t >= last.t) {
    return { x: last.x, y: last.y, direction: last.direction, moving: false, active: t < rec.endT };
  }
  const i = frameIndexAt(f, t);
  const a = f[i];
  const b = f[i + 1];
  if (!b || b.jump) return { x: a.x, y: a.y, direction: a.direction, moving: a.moving, active: true };
  const k = (t - a.t) / Math.max(1, b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    direction: lerpAngle(a.direction, b.direction, k),
    moving: a.moving || b.moving,
    active: true,
  };
}

/** Próximo evento de um tipo dentro de uma janela futura (para o pulso de aviso antes de um impulso). */
export function upcomingEvent(rec: EchoRecording, t: number, windowMs: number, action: EchoAction): number | null {
  for (const e of rec.events) {
    if (e.action === action && e.t >= t && e.t <= t + windowMs) return e.t;
  }
  return null;
}

/** Eventos gravados entre dois instantes (t0, t1] — usado para os Ecos repetirem tiros e bombas. */
export function eventsBetween(rec: EchoRecording, t0: number, t1: number): RecordedEvent[] {
  const out: RecordedEvent[] = [];
  for (const e of rec.events) if (e.t > t0 && e.t <= t1) out.push(e);
  return out;
}
