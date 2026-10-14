// Revanche do X1: só começa quando os dois aceitam. Recusa, saída ou tempo esgotado não inicia outra partida.
export type RematchVote = 'yes' | 'no';
export type RematchStatus = 'idle' | 'wait' | 'go' | 'no';

export function rematchStatus(humans: string[], votes: Record<string, RematchVote | undefined>, now: number, openedAt: number, timeoutMs = 20_000): RematchStatus {
  if (humans.length < 2) return Object.values(votes).some((v) => v) ? 'no' : 'idle';
  if (humans.some((id) => votes[id] === 'no')) return 'no';
  const yes = humans.filter((id) => votes[id] === 'yes');
  if (!yes.length) return 'idle';
  if (openedAt > 0 && now - openedAt > timeoutMs) return 'no';
  if (yes.length === humans.length) return 'go';
  return 'wait';
}
