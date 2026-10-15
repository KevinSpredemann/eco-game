// Tipos compartilhados — prontos para serem usados também por um servidor (Colyseus) no futuro.

export type EchoAction = 'dash' | 'ability' | 'deliver' | 'hit' | 'shoot' | 'bomb' | 'mine';

export type RecordedFrame = {
  t: number; // ms desde o início da rodada
  x: number;
  y: number;
  direction: number; // radianos
  moving: boolean;
  /** true quando a posição "saltou" (portal, teleporte, renascer): não interpolar a partir do quadro anterior */
  jump?: boolean;
};

export type RecordedEvent = {
  t: number;
  action: EchoAction;
  /** ângulo do tiro */
  a?: number;
  /** arma usada */
  w?: string;
  /** alvo de bomba */
  tx?: number;
  ty?: number;
};

export type EchoRecording = {
  playerId: string;
  round: number;
  color: string;
  characterId: string;
  frames: RecordedFrame[];
  events: RecordedEvent[];
  /** instante (ms) em que a gravação terminou (fim da rodada ou eliminação) */
  endT: number;
  /** worldT em que a rodada começou, para o disco girar a rota junto */
  spinOrigin?: number;
  /** virada de página que já espelhou esta rota */
  pagePulse?: string;
};

export type EchoSample = {
  x: number;
  y: number;
  direction: number;
  moving: boolean;
  active: boolean; // false depois do fim da gravação
};
