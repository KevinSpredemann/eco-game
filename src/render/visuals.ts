/** pontos de sujeira do chão, estáveis para o mesmo mapa (desenhados uma vez) */
export function gritSpecks(seed: number, count: number, w: number, h: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: { x: number; y: number; r: number; a: number }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: next() * w, y: next() * h, r: 0.8 + next() * 2.4, a: 0.05 + next() * 0.1 });
  }
  return out;
}

/** queda de uma criatura: achata, gira e some. t em segundos. */
export function corpsePose(t: number, dur = 0.7) {
  const k = Math.max(0, Math.min(1, t / dur));
  return {
    dy: k * 8,
    squash: 1 - k * 0.62,
    alpha: k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.7),
    rot: k * 1.15,
    done: t >= dur,
  };
}
