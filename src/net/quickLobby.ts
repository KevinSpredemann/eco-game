/** Espera da busca automática antes de completar com bots. */
export const QUICK_WAIT_MS = 25_000;

/** Quantos participantes a sala abre. Busca (fill) completa até o máximo do modo. */
export function plannedLobbySize(opts: { mode: 'duelo' | 'dupla'; humans: number; bots: number; fill: boolean }): number {
  const cap = opts.mode === 'duelo' ? 2 : 4;
  const humans = Math.min(Math.max(0, opts.humans), cap);
  const bots = Math.max(0, opts.bots);
  const want = opts.mode === 'duelo' ? 2 : Math.max(humans, Math.min(cap, humans + bots));
  return opts.fill ? cap : want;
}

export type PublicLobbyPlan = { action: 'start' | 'arm' | 'wait'; autoAt: number };

/**
 * Sala pública sem partida.
 * autoAt 0 é o estado depois que uma partida acaba (o relógio foi apagado):
 * sem isso a sala fica em "0s" para sempre, com o Começar escondido.
 */
export function publicLobbyAction(opts: {
  members: number;
  max: number;
  ready: number;
  autoAt: number;
  now: number;
  waitMs?: number;
}): PublicLobbyPlan {
  const waitMs = opts.waitMs ?? QUICK_WAIT_MS;
  if (!opts.autoAt) return { action: 'arm', autoAt: opts.now + waitMs };
  const full = opts.members >= opts.max && opts.members >= 2;
  const allReady = opts.members >= 2 && opts.ready >= opts.members;
  if (full || allReady || opts.now >= opts.autoAt) return { action: 'start', autoAt: opts.autoAt };
  return { action: 'wait', autoAt: opts.autoAt };
}

/** O dono vê Começar na sala privada e também quando a busca pública está sem relógio. */
export function showStartButton(host: boolean, isPublic: boolean, autoIn: number | undefined): boolean {
  if (!host) return false;
  if (isPublic && (autoIn ?? 0) > 0) return false;
  return true;
}

/** 0 = servidor antigo sem campo; maior = este aparelho está velho; menor = o servidor ainda não atualizou. */
export function protocolStatus(local: number, server: number): 'ok' | 'client-old' | 'server-old' {
  if (server === local) return 'ok';
  return server > local ? 'client-old' : 'server-old';
}
