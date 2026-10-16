// Apresentação de um kill de combo. Não aplica dano e não mexe no placar.
import type { Element } from './elements';

export const FINISHER_MIN = 1.2;
export const FINISHER_MAX = 2.5;

export interface FinisherStyle {
  id: 'fire-air' | 'water-bolt' | 'earth-fire' | 'ice-earth' | 'generic';
  name: string;
}

/** O par de elementos escolhe a cena. Qualquer outro par cai no genérico. */
export function finisherStyle(primer: Element | '', finisher: Element | ''): FinisherStyle {
  const pair = new Set([primer, finisher]);
  if (pair.has('fire') && pair.has('wind')) return { id: 'fire-air', name: 'Inferno' };
  if (pair.has('ice') && pair.has('lightning')) return { id: 'water-bolt', name: 'Descarga' };
  if (pair.has('nature') && pair.has('fire')) return { id: 'earth-fire', name: 'Magma' };
  if (pair.has('ice') && pair.has('nature')) return { id: 'ice-earth', name: 'Estilhaço' };
  return { id: 'generic', name: 'Combo' };
}

/**
 * Só quando o golpe que fechou o combo também confirmou a eliminação.
 * Competitivo fica mais curto. A simulação não pausa: o cliente só desenha.
 */
/** Online só desenha o final que o servidor confirmou no evento. Offline a simulação local é a autoridade. */
export function playFinisher(online: boolean, confirmed: boolean): boolean {
  return !online || confirmed;
}

export function cinematicFinisher(opts: { comboKill: boolean; repeat: boolean; competitive: boolean }): { play: boolean; seconds: number } {
  if (!opts.comboKill || opts.repeat) return { play: false, seconds: 0 };
  const seconds = opts.competitive ? FINISHER_MIN : 1.8;
  return { play: true, seconds: Math.min(FINISHER_MAX, Math.max(FINISHER_MIN, seconds)) };
}
