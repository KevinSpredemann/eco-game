// Os Ruídos da Floresta. A recompensa só sai no passo 3, uma vez.
import { addXp } from './rules';
import type { MundoSave } from './types';

export const QUEST_NAME = 'Os Ruídos da Floresta';
export const ANOMALY = { x: 1400, y: 1100 };
export const REWARD_COINS = 25;
export const REWARD_XP = 40;

export function questBlurb(step: number): string {
  if (step <= 0) return 'Fale com Lina, a pesquisadora.';
  if (step === 1) return 'Entre na floresta pelo portal.';
  if (step === 2) return 'Ache o fragmento de energia na mata.';
  if (step === 3) return 'Entregue o fragmento para Lina.';
  return 'Clareira aberta. O Guardião guarda o portão das ruínas.';
}

export function linaLines(step: number): string[] {
  if (step <= 0) return ['O ruído na mata não é vento. Entra pelo portal e procura o brilho azul.', 'Pode desviar da sentinela. Eu quero o fragmento, não a briga.'];
  if (step === 1) return ['O portal no fim da rua abre a floresta. O fragmento fica mais para dentro.'];
  if (step === 2) return ['Você já está na mata. O fragmento é um brilho, não um monstro.'];
  if (step === 3) return ['Achou. Me entrega que eu pago em moedas e experiência, e abro a clareira.'];
  return ['A clareira no fundo da mata está aberta. O fragmento já foi entregue.'];
}

export function enterForest(save: MundoSave): MundoSave {
  if (save.quest.step !== 1) return save;
  return { ...save, quest: { step: 2 } };
}

export function takeFragment(save: MundoSave, x: number, y: number): MundoSave {
  if (save.quest.step !== 2) return save;
  if (Math.hypot(x - ANOMALY.x, y - ANOMALY.y) > 70) return save;
  return { ...save, quest: { step: 3 } };
}

/** Devolve o save e o texto. No passo 3 paga uma vez e abre a clareira. */
export function turnIn(save: MundoSave): { save: MundoSave; note: string; paid: boolean } {
  if (save.quest.step === 0) {
    return { save: { ...save, quest: { step: 1 } }, note: 'Lina pediu o fragmento de energia na floresta.', paid: false };
  }
  if (save.quest.step === 3) {
    const next = addXp({ ...save, coins: save.coins + REWARD_COINS, quest: { step: 4 } }, REWARD_XP);
    return { save: next, note: `+${REWARD_COINS} moedas e experiência. A clareira abriu.`, paid: true };
  }
  if (save.quest.step >= 4) return { save, note: 'A clareira já está aberta.', paid: false };
  if (save.quest.step === 1) return { save, note: 'O portal da vila leva à floresta.', paid: false };
  return { save, note: 'O fragmento está no meio da mata.', paid: false };
}
