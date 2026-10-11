// Resumo leve de uma gravação: rota a cada 200 ms + marcas das ações que REALMENTE aconteceram.
// Usado para desenhar rotas/avisos (também no online, onde o cliente não recebe a gravação inteira)
// e para o resumo do fim da rodada. Nada aqui inventa movimento ou ação.
import type { EchoAction, EchoRecording } from '../../shared/types';
import { sampleRecording } from './recorder';

export const DIGEST_STEP_MS = 200;
/** tiros seguidos viram uma marca a cada 350 ms (a rota fica legível) */
const SHOT_GAP_MS = 350;

export const MARK_KINDS: EchoAction[] = ['shoot', 'bomb', 'mine', 'dash', 'ability', 'deliver', 'hit'];

/** [t (ms), tipo (índice em MARK_KINDS), x, y, ângulo (só tiro; senão 0)] */
export type DigestMark = [number, number, number, number, number];

export interface EchoDigest {
  key: string;
  playerId: string;
  characterId: string;
  color: string;
  round: number;
  /** fim da gravação (ms): eliminação ou fim da rodada */
  endT: number;
  /** pontos [x0, y0, x1, y1, …], um a cada DIGEST_STEP_MS a partir de t = 0 */
  path: number[];
  marks: DigestMark[];
  /** contagem real de cada ação (antes de juntar os tiros) */
  counts: Record<string, number>;
}

export function digestRecording(rec: EchoRecording): EchoDigest {
  const path: number[] = [];
  for (let t = 0; t <= rec.endT; t += DIGEST_STEP_MS) {
    const s = sampleRecording(rec, t);
    path.push(Math.round(s.x), Math.round(s.y));
  }
  const marks: DigestMark[] = [];
  const counts: Record<string, number> = {};
  let lastShot = -1e9;
  for (const e of rec.events) {
    counts[e.action] = (counts[e.action] ?? 0) + 1;
    const k = MARK_KINDS.indexOf(e.action);
    if (k < 0) continue;
    if (e.action === 'shoot') {
      if (e.t - lastShot < SHOT_GAP_MS) continue;
      lastShot = e.t;
    }
    const s = sampleRecording(rec, e.t);
    marks.push([Math.round(e.t), k, Math.round(s.x), Math.round(s.y), e.action === 'shoot' ? Math.round((e.a ?? 0) * 100) / 100 : 0]);
  }
  return { key: `${rec.round}:${rec.playerId}`, playerId: rec.playerId, characterId: rec.characterId, color: rec.color, round: rec.round, endT: Math.round(rec.endT), path, marks, counts };
}

/** posição na rota resumida (interpola entre pontos de 200 ms) */
export function digestAt(d: EchoDigest, t: number): { x: number; y: number } | null {
  const n = d.path.length / 2;
  if (!n) return null;
  const f = Math.max(0, Math.min(n - 1, t / DIGEST_STEP_MS));
  const i = Math.floor(f);
  const j = Math.min(n - 1, i + 1);
  const k = f - i;
  const x0 = d.path[i * 2];
  const y0 = d.path[i * 2 + 1];
  const x1 = d.path[j * 2];
  const y1 = d.path[j * 2 + 1];
  // salto (portal/renascer): não desenha a linha atravessando o mapa
  if (Math.hypot(x1 - x0, y1 - y0) > 120) return { x: k < 0.5 ? x0 : x1, y: k < 0.5 ? y0 : y1 };
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
}

/** a próxima marca de um tipo dentro da janela (para avisar antes do tiro/bomba/mina gravados) */
export function nextMark(d: EchoDigest, t: number, windowMs: number, kinds: EchoAction[]): DigestMark | null {
  for (const m of d.marks) {
    if (m[0] < t) continue;
    if (m[0] > t + windowMs) break;
    if (kinds.includes(MARK_KINDS[m[1]])) return m;
  }
  return null;
}

/** linha curta do resumo da rodada: o que foi gravado e vai voltar */
export interface RoundEchoLine {
  playerId: string;
  characterId: string;
  color: string;
  round: number;
  /** ainda estava de pé no fim da rodada? */
  survived: boolean;
  /** quando caiu (s), se caiu */
  fellAt: number | null;
  shots: number;
  bombs: number;
  mines: number;
  abilities: number;
  delivers: number;
}

export function summarizeRound(digests: EchoDigest[], roundDurMs: number): RoundEchoLine[] {
  return digests.map((d) => {
    const c = d.counts;
    const survived = d.endT >= roundDurMs - 60;
    return {
      playerId: d.playerId,
      characterId: d.characterId,
      color: d.color,
      round: d.round,
      survived,
      fellAt: survived ? null : Math.round(d.endT / 1000),
      shots: c.shoot ?? 0,
      bombs: c.bomb ?? 0,
      mines: c.mine ?? 0,
      abilities: (c.ability ?? 0) + (c.dash ?? 0),
      delivers: c.deliver ?? 0,
    };
  });
}
