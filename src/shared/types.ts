// Tipos compartilhados — prontos para serem usados também por um servidor (Colyseus) no futuro.

export type EchoAction = 'dash' | 'ability' | 'deliver' | 'hit';

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
};

export type EchoSample = {
  x: number;
  y: number;
  direction: number;
  moving: boolean;
  active: boolean; // false depois do fim da gravação
};
