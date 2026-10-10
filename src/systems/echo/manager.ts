import type { EchoRecording } from '../../shared/types';

export const MAX_GENERATIONS = 3;

export type Generation = { round: number; recordings: EchoRecording[] };

/**
 * Mantém no máximo N gerações de Ecos (uma geração = todas as gravações de uma rodada).
 * Ao adicionar uma nova geração além do limite, a mais antiga é descartada e devolvida
 * (para a interface mostrar o aviso de "Eco dissipado").
 */
export class EchoManager {
  readonly generations: Generation[] = [];
  constructor(readonly maxGenerations = MAX_GENERATIONS) {}

  add(round: number, recordings: EchoRecording[]): Generation[] {
    const usable = recordings.filter((r) => r.frames.length > 1);
    this.generations.push({ round, recordings: usable });
    const removed: Generation[] = [];
    while (this.generations.length > this.maxGenerations) removed.push(this.generations.shift()!);
    return removed;
  }

  /** Geração que será removida na próxima vez que uma rodada terminar (para avisar antes). */
  nextToExpire(): Generation | null {
    return this.generations.length >= this.maxGenerations ? this.generations[0] : null;
  }

  /** 0 = mais recente. */
  ageOf(round: number): number {
    const idx = this.generations.findIndex((g) => g.round === round);
    return idx < 0 ? -1 : this.generations.length - 1 - idx;
  }

  all(): EchoRecording[] {
    return this.generations.flatMap((g) => g.recordings);
  }

  get count(): number {
    return this.generations.reduce((n, g) => n + g.recordings.length, 0);
  }

  clear(): void {
    this.generations.length = 0;
  }
}
