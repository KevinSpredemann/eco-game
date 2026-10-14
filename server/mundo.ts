// Validação pronta para um futuro POST /api/mundo.
// Não há rota: o solo grava no aparelho. O mesmo JSON serve para
// co-op de 2 (party) e para um mundo compartilhado com PvP só em session.pvpZones.
export { acceptMundoBlob, MUNDO_KEY, parseMundo } from '../src/game/mundo/blob';
export type { MundoBlobResult } from '../src/game/mundo/blob';
