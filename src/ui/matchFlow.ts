/** Ordem da partida local: personagem, poderes (se o modo usa), mapa, início. */

export type FlowPlace = 'select' | 'powers' | 'map' | 'play' | 'lobby';

export interface FlowOpts {
  /** sala online: o personagem volta para a sala, sem mapa */
  lobby: boolean;
  /** duelo e dupla passam pela tela de poderes */
  loadout: boolean;
  /** mundo começa direto, sem poderes e sem mapa */
  mundo: boolean;
}

export function forward(from: FlowPlace, opts: FlowOpts): FlowPlace {
  if (opts.mundo) return 'play';
  if (from === 'select') {
    if (opts.lobby) return 'lobby';
    if (opts.loadout) return 'powers';
    return 'map';
  }
  if (from === 'powers') return opts.lobby ? 'lobby' : 'map';
  return 'play';
}

export function back(from: FlowPlace, opts: Pick<FlowOpts, 'loadout' | 'lobby'>): FlowPlace {
  if (from === 'map') return opts.loadout && !opts.lobby ? 'powers' : 'select';
  return 'select';
}

/** Rótulo do passo. Lobby e mundo não entram nesta contagem. */
export function stepLabel(place: Exclude<FlowPlace, 'play' | 'lobby'>, loadout: boolean): string {
  if (!loadout) return place === 'select' ? 'passo 1 de 2' : 'passo 2 de 2';
  if (place === 'select') return 'passo 1 de 3';
  if (place === 'powers') return 'passo 2 de 3';
  return 'passo 3 de 3';
}
