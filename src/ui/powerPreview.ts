// Prévia local do efeito. Não pede arquivo e não entra na rede.
import { ELEMENT_COLOR, type Element, type PowerDef } from '../game/elements';

export const PREVIEW_KINDS = [
  'seed',
  'roots',
  'grove',
  'sprout',
  'plasma',
  'collapse',
  'ring',
  'wave',
  'streak',
  'dash',
  'prism',
  'wall',
  'pull',
  'hold',
  'storm',
  'cinder',
  'swirl',
  'bolt',
  'shard',
  'blaze',
  'gust',
  'shade',
  'burst',
  'shot',
  'empty',
] as const;

export type PreviewKind = (typeof PREVIEW_KINDS)[number];
export type PreviewSize = 'xs' | 'sm' | 'lg';

export function previewOf(pw: PowerDef): { kind: Exclude<PreviewKind, 'empty'>; element: Element } {
  const step = pw.step ?? pw.range;
  if (pw.mark && pw.speed > 0) return { kind: 'seed', element: pw.element };
  if (pw.grove === 'heal' || (pw.element === 'nature' && pw.charge)) return { kind: 'sprout', element: pw.element };
  if (pw.zone === 'heal' || pw.act === 'zone') return { kind: 'grove', element: pw.element };
  if (pw.element === 'nature' && pw.speed <= 0 && !pw.act) return { kind: 'roots', element: pw.element };
  if (pw.element === 'plasma' && pw.speed > 0) return { kind: 'plasma', element: pw.element };
  if (pw.element === 'plasma' && (pw.windup || pw.charge)) return { kind: 'collapse', element: pw.element };
  if (pw.element === 'plasma' && pw.speed <= 0) return { kind: 'ring', element: pw.element };
  if (pw.act === 'blink') return { kind: step >= 140 ? 'wave' : 'streak', element: pw.element };
  if (pw.act === 'dash') return { kind: 'dash', element: pw.element };
  if (pw.act === 'decoy') return { kind: 'prism', element: pw.element };
  if (pw.act === 'wall') return { kind: 'wall', element: pw.element };
  if ((pw.yank ?? 0) > 0) return { kind: 'pull', element: pw.element };
  if (pw.speed <= 0 && pw.element === 'ice') return { kind: 'hold', element: pw.element };
  if (pw.speed <= 0 && pw.element === 'lightning') return { kind: 'storm', element: pw.element };
  if (pw.speed <= 0 && pw.element === 'fire') return { kind: 'cinder', element: pw.element };
  if (pw.speed <= 0 && pw.element === 'wind') return { kind: 'swirl', element: pw.element };
  if (pw.speed > 0 && pw.element === 'lightning') return { kind: 'bolt', element: pw.element };
  if (pw.speed > 0 && pw.element === 'ice') return { kind: 'shard', element: pw.element };
  if (pw.speed > 0 && pw.element === 'fire') return { kind: 'blaze', element: pw.element };
  if (pw.speed > 0 && pw.element === 'wind') return { kind: 'gust', element: pw.element };
  if (pw.speed > 0 && pw.element === 'shadow') return { kind: 'shade', element: pw.element };
  if (pw.speed <= 0) return { kind: 'burst', element: pw.element };
  return { kind: 'shot', element: pw.element };
}

function frame(kind: PreviewKind, element: Element | null, size: PreviewSize): string {
  const color = element ? ELEMENT_COLOR[element] : '#8aa0a6';
  return `<span class="pv pv-${size} pv-${kind}" style="--el:${color}" data-kind="${kind}" aria-hidden="true"><i class="pv-a"></i><i class="pv-b"></i><i class="pv-c"></i></span>`;
}

/** Desenho do efeito. Não usa a letra da tecla nem um arquivo. */
export function previewHtml(pw: PowerDef, size: PreviewSize = 'sm'): string {
  const face = previewOf(pw);
  return frame(face.kind, face.element, size);
}

export function previewEmpty(size: PreviewSize = 'sm'): string {
  return frame('empty', null, size);
}
