/** Aviso de interação. O raio do aviso é maior do que o raio em que a ação acontece. */

export function portalPrompt(key: string): string {
  return `Portal — pressione ${key} para atravessar`;
}

export function leverPrompt(key: string): string {
  return `Alavanca — pressione ${key} para acionar`;
}
