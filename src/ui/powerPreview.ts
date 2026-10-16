// Prévia local do efeito. Um desenho vetorial por tipo, compartilhado pela barra e pela tela de poderes.
import type { Element, PowerDef } from '../game/elements';

/** Paleta da interface. O combate continua com as cores do mundo. */
export const UI_TINT: Record<Element, string> = {
  plasma: '#d24cff',
  nature: '#2fbf6a',
  ice: '#5ee7ff',
  lightning: '#3aa0ff',
  fire: '#ff5a32',
  wind: '#3ddec0',
  shadow: '#a78bfa',
};

export function uiTint(element: Element): string {
  return UI_TINT[element];
}

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
  'lance',
  'volcano',
  'ash',
  'tide',
  'glacial',
  'mirror',
  'fist',
  'rootbed',
  'guardian',
  'gale',
  'step',
  'updraft',
  'stormchain',
  'rupture',
  'empty',
] as const;

export type PreviewKind = (typeof PREVIEW_KINDS)[number];
export type PreviewSize = 'xs' | 'sm' | 'lg';

export function previewOf(pw: PowerDef): { kind: string; element: Element } {
  if (pw.trick) return { kind: pw.trick === 'roots' ? 'rootbed' : pw.trick, element: pw.element };
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

const GLYPH: Record<string, string> = {
  seed: '<path d="M8 34h22"/><circle cx="40" cy="30" r="8"/><path d="M36 24c2-6 8-8 12-6"/>',
  roots: '<path d="M18 48V28M32 50V18M46 48V30"/><path d="M12 48h40"/>',
  grove: '<path d="M16 46l8-18 8 18M32 46l8-24 8 24"/><circle cx="48" cy="16" r="3"/>',
  sprout: '<path d="M32 48V26"/><path d="M32 32c-8 0-12-6-12-10 6 0 12 4 12 10zM32 28c8-2 14-8 14-12-6 2-12 6-14 12z"/>',
  plasma: '<circle cx="32" cy="32" r="8"/><ellipse cx="32" cy="32" rx="18" ry="8" transform="rotate(-24 32 32)"/><ellipse cx="32" cy="32" rx="18" ry="8" transform="rotate(58 32 32)"/>',
  collapse: '<path d="M32 14a18 18 0 1 1-12 6"/><path d="M20 20l-6-8M20 20l8 2"/><circle cx="32" cy="32" r="4"/>',
  ring: '<circle cx="32" cy="32" r="16"/><circle cx="32" cy="32" r="7"/>',
  wave: '<path d="M6 36c6-10 10-10 16 0s10 10 16 0 10-10 16 0"/><path d="M8 24c6-8 10-8 16 0s10 8 16 0"/>',
  streak: '<path d="M8 32h34"/><path d="M36 22l14 10-14 10"/>',
  dash: '<path d="M14 20l12 12-12 12M28 20l12 12-12 12M42 20l12 12-12 12"/>',
  prism: '<path d="M32 10l16 12-6 26H22L16 22z"/>',
  wall: '<path d="M16 18v28M32 12v36M48 18v28"/>',
  pull: '<circle cx="18" cy="32" r="6"/><path d="M52 32H28M36 22l-10 10 10 10"/>',
  hold: '<path d="M32 12l14 8v16L32 52 18 36V20z"/><circle cx="32" cy="32" r="4"/>',
  storm: '<path d="M36 8L22 32h12L26 56l22-30H34z"/>',
  cinder: '<path d="M20 46c0-8 6-10 6-18 4 6 10 8 10 18M34 44c0-10 8-12 8-22 6 8 10 12 8 22"/>',
  swirl: '<path d="M32 18c10 0 16 6 16 14s-8 14-16 14-12-4-12-10 4-8 8-8"/>',
  bolt: '<path d="M18 40l20-22M28 46l16-16"/><path d="M40 18l10 4-8 10"/>',
  shard: '<path d="M18 40l20-24 8 10-16 22z"/>',
  blaze: '<path d="M22 44c0-8 8-12 8-22 6 8 14 10 14 22 0 8-6 12-11 12s-11-4-11-12z"/>',
  gust: '<path d="M10 24h28M8 32h36M12 40h24"/><path d="M40 20l8 4-8 4M46 28l8 4-8 4M38 36l8 4-8 4"/>',
  shade: '<path d="M40 14a16 16 0 1 0 0 36 12 12 0 0 1 0-36z"/>',
  burst: '<circle cx="32" cy="32" r="6"/><path d="M32 8v10M32 46v10M8 32h10M46 32h10M14 14l8 8M42 42l8 8M50 14l-8 8M22 42l-8 8"/>',
  shot: '<circle cx="44" cy="28" r="7"/><path d="M8 40l22-8"/>',
  lance: '<path d="M8 40 L40 16"/><circle cx="44" cy="14" r="5"/><path d="M36 22l12-2"/>',
  volcano: '<path d="M10 46h44"/><path d="M18 46l8-16 6 10 8-18 8 24"/><circle cx="32" cy="18" r="3"/>',
  ash: '<path d="M12 40c8-14 14-6 22 0s12 10 18-4"/><circle cx="20" cy="22" r="3"/><circle cx="34" cy="16" r="2"/><circle cx="46" cy="24" r="3"/>',
  tide: '<path d="M10 36c8-12 16 8 24-4s12 8 20-6"/><path d="M18 28c6 4 10-6 16 0"/>',
  glacial: '<path d="M32 10l10 12-4 18H26l-4-18z"/><path d="M32 22v16"/>',
  mirror: '<path d="M20 14h24v30H20z"/><path d="M24 20l16 18M40 20L24 38"/>',
  fist: '<path d="M14 40h36"/><circle cx="22" cy="32" r="5"/><circle cx="34" cy="28" r="6"/><circle cx="46" cy="34" r="4"/>',
  rootbed: '<path d="M16 48c4-14 8-14 8 0M32 50c0-20 2-20 6-4M44 48c2-12 8-10 8 0"/><path d="M12 48h40"/>',
  guardian: '<path d="M16 18h32v28H16z"/><path d="M16 28h32M26 18v28M38 18v28"/>',
  gale: '<path d="M12 40c10-16 18 4 28-12"/><path d="M18 24c8 6 12-8 20 0"/>',
  step: '<path d="M14 40l10-16 8 10 10-18"/><path d="M40 16l8 6"/>',
  updraft: '<path d="M32 48c10-8 10-20 0-28-10 8-10 20 0 28z"/><path d="M32 18V8"/>',
  stormchain: '<path d="M12 40l12-14 8 8 14-20"/><circle cx="14" cy="42" r="3"/><circle cx="48" cy="14" r="3"/>',
  rupture: '<path d="M32 8l4 12h10l-8 8 4 12-10-6-10 6 4-12-8-8h10z"/>',
  empty: '<circle cx="32" cy="32" r="14" stroke-dasharray="4 4"/>',
  basic: '<circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="3"/><path d="M32 8v10M32 46v10M8 32h10M46 32h10"/>',
  impulse: '<path d="M10 32h28M30 20l14 12-14 12"/><path d="M18 16l8 6M18 48l8-6"/>',
};

function glyph(kind: string): string {
  const body = GLYPH[kind] ?? GLYPH.shot;
  return `<svg class="pv-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function frame(kind: string, element: Element | null, size: PreviewSize): string {
  const color = element ? UI_TINT[element] : '#8aa0a6';
  return `<span class="pv pv-${size} pv-${kind}" style="--el:${color}" data-kind="${kind}" aria-hidden="true">${glyph(kind)}<i class="pv-a"></i><i class="pv-b"></i><i class="pv-c"></i></span>`;
}

/** Ícone da barra que não é um poder do kit (básico e impulso). */
export function markHtml(kind: 'basic' | 'impulse', color: string, size: PreviewSize = 'sm'): string {
  return `<span class="pv pv-${size} pv-${kind}" style="--el:${color}" data-kind="${kind}" aria-hidden="true">${glyph(kind)}</span>`;
}

/** Desenho do efeito. Não usa a letra da tecla nem um arquivo. */
export function previewHtml(pw: PowerDef, size: PreviewSize = 'sm'): string {
  const face = previewOf(pw);
  return frame(face.kind, face.element, size);
}

export function previewEmpty(size: PreviewSize = 'sm'): string {
  return frame('empty', null, size);
}
