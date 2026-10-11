// Cores únicas por jogador: se duas pessoas escolhem o mesmo personagem (ou cores quase iguais),
// quem vem depois na lista ganha outra cor bem diferente. A mesma regra roda na simulação e no
// cliente online (mesma ordem de jogadores), então todo mundo vê as mesmas cores — inclusive nos Ecos.

/** cores alternativas, fortes e bem separadas entre si (boa leitura sobre o chão escuro) */
export const ALT_COLORS = ['#ff4fd8', '#ffd23e', '#5dff8a', '#ff8a3c', '#3ee8ff', '#b06aff', '#ff5a6a', '#c8ff3c', '#ffffff', '#4a8aff'];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** distância simples entre cores (0 = iguais); abaixo de ~40 fica difícil separar no meio da luta */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  // pesos aproximados da percepção (verde pesa mais)
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2) / 3;
}

export const MIN_COLOR_DISTANCE = 40;

/**
 * troca a cor só de quem repete. Etapa 1: quem já é diferente dos anteriores mantém a cor do
 * personagem. Etapa 2: os repetidos ganham uma cor alternativa longe de TODAS as cores em uso
 * (assim ninguém que já era diferente perde a própria cor).
 */
export function assignUniqueColors<T extends { color: string }>(players: T[]): void {
  const kept: string[] = [];
  const clash: T[] = [];
  for (const p of players) {
    if (kept.some((c) => colorDistance(c, p.color) < MIN_COLOR_DISTANCE)) clash.push(p);
    else kept.push(p.color);
  }
  const used = [...kept];
  for (const p of clash) {
    const alt = ALT_COLORS.find((c) => used.every((u) => colorDistance(u, c) >= MIN_COLOR_DISTANCE));
    if (alt) p.color = alt;
    used.push(p.color);
  }
}

/** nomes iguais (ex.: dois "Convidado") ganham um número: "Convidado 2" */
export function assignUniqueNames<T extends { name: string }>(players: T[]): void {
  const seen = new Map<string, number>();
  for (const p of players) {
    const n = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, n);
    if (n > 1) p.name = `${p.name} ${n}`;
  }
}
