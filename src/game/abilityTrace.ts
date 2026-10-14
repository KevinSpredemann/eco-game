// Rastro de habilidade só para desenvolvimento. Fica desligado no jogo normal.
// Ligue com localStorage eco.dev = 1 enquanto o Vite está em modo dev.

export interface AbilityStep {
  t: number;
  pid: string;
  step: string;
  detail: string;
}

const buf: AbilityStep[] = [];
let on = false;

export function setAbilityTrace(v: boolean) {
  on = v;
  if (!v) buf.length = 0;
}

export function abilityTraceOn() {
  return on;
}

export function abilityTrace(pid: string, step: string, detail: string) {
  if (!on) return;
  buf.push({ t: Date.now(), pid, step, detail });
  if (buf.length > 80) buf.shift();
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('eco.dev') === '1') console.debug('[ability]', pid, step, detail);
  } catch {
    /* sem armazenamento */
  }
}

export function abilityLog(): readonly AbilityStep[] {
  return buf;
}

export function clearAbilityLog() {
  buf.length = 0;
}
