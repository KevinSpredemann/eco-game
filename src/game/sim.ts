import type { EchoRecording } from '../shared/types';
import { EchoRecorder, eventsBetween, sampleRecording, upcomingEvent } from '../systems/echo/recorder';
import { EchoManager } from '../systems/echo/manager';
import { assignUniqueColors, assignUniqueNames } from './colors';
import { digestRecording, EchoDigest, nextMark, RoundEchoLine, summarizeRound } from '../systems/echo/digest';
import { POINTS, deliveryPoints, ranking } from '../systems/scoring';
import {
  ArenaDef,
  BORDER,
  Pt,
  WORLD_H,
  WORLD_W,
  beamAngle,
  bridgeState,
  distToSegment,
  inRect,
  isGround,
  laserX,
  pistonState,
  tornadoPos,
  trainState,
  windState,
} from './arenas';
import { AbilityId, CHARACTERS, CharacterDef, getCharacter, withLevel } from './characters';
import { ABILITY_BAL, BOSS, BossSkill, COMBAT, DEFAULT_LOADOUT, Loadout, SKILLS, ULTS, botLoadout, cloneDamage, hazardDamage, levelMult, sanitizeLoadout, type HazardKind } from './balance';
import * as C from './constants';
import { botCombat, BotBrain, NavGrid } from './bot';
import { PowerId, getPower, randomPower } from './powerups';
import { BOMB_DAMAGE, BOMB_FUSE, BOMB_RADIUS, ECHO_DAMAGE_MULT, GUN_Y, ICE_DAMAGE, ICE_RADIUS, ITEMS, ItemId, KIT_HEAL, MINE_DAMAGE, MINE_RADIUS, PULSE_DAMAGE, PULSE_FUSE, PULSE_RADIUS, WEAPONS, WeaponId, isPrimary, loadoutPrimary } from './weapons';
import { withSkin } from './characters';
import { choosePortalExit, portalPairAt } from './portals';
import { mirrorRest, spinEcho, tuneBlocks, tuneBody, tuneClock, tuneEchoDrag, tuneHides, tuneMove, tuneNeedle, tunePendulumHits, tunePush, tuneTouch } from './mapTune';
import { DUEL, duelTiebreak, type DuelReason } from './duel';
import {
  AMBUSH_BONUS,
  AMBUSH_TIME,
  BASIC,
  BLINK_STEP,
  BURN_TICK,
  BURN_TIME,
  ENERGY_MAX,
  ENERGY_REGEN,
  clampEnergy,
  EXTRA_CAP,
  FLOW_BONUS,
  FLOW_TIME,
  FROZEN_TIME,
  HEAL_ZONE_TIME,
  KNOCK,
  MARK_TIME,
  PLASMA,
  ROOT_RESIST,
  ROOT_TIME,
  SLOT_COST,
  VISUAL_WEAPON,
  type PowerDef,
  WALL_BONUS,
  WALL_REACH,
  bonusDamage,
  burnDpsOf,
  ULT_LAND,
  ULT_FIRE_TICK,
  ULT_WINDUP,
  cooldownOf,
  gustSlow,
  healOnCombo,
  formOf,
  kitOf,
  knockMul,
  studioOf,
  equippedElements,
  ultRole,
  refundOnCombo,
  resolvedDamage,
  speedMul,
  stunTime,
  wallSlam,
  wallStun,
  type Element,
} from './elements';
import { COMBO_WINDOW, CONTROL_GRACE, FIELD_WINDOW, MARK_WINDOW, RUPTURE_TIME, isElemental, resolveReaction } from './combos';
import { cinematicFinisher, finisherStyle } from './finisher';
import { abilityTrace } from './abilityTrace';
import { castFamily, chargeFactor, chargeRadius, chargeReach } from './aimMath';
import { resolveCastAngle } from './aimService';
import { sweepCapsule, sweepCircle } from './sweep';

export type Difficulty = 'facil' | 'normal' | 'dificil';
export type ObjectiveId = 'dourado' | 'tripla' | 'intocavel';

export const OBJECTIVES: Record<ObjectiveId, string> = {
  dourado: 'Pegue o Fragmento Dourado (+1)',
  tripla: 'Entregue 3 energias de uma vez (+1)',
  intocavel: 'Termine a rodada sem levar dano (+1)',
};

export type GameMode = 'duelo' | 'dupla';

/** X1 online e 2x2 (online ou com bots). Os dois fecham a rodada como um duelo. */
export const MODE_RULES: Record<GameMode, { rounds: number; dur: number; respawn: boolean; teams: boolean; maxPlayers: number }> = {
  duelo: { rounds: 5, dur: DUEL.roundSec, respawn: false, teams: false, maxPlayers: 2 },
  dupla: { rounds: 5, dur: DUEL.roundSec, respawn: false, teams: true, maxPlayers: 4 },
};
/** mínimo de participantes (pessoas + bots) para começar */
export const MIN_PLAYERS: Partial<Record<GameMode, number>> = { duelo: 2, dupla: 2 };
export const TEAM_COLORS = ['#3ea8ff', '#ff4a5a'];
export const TEAM_NAMES = ['Azul', 'Vermelho'];
export const RESPAWN_TIME = 3;

export interface RosterEntry {
  id: string;
  char: string;
  isBot: boolean;
  name?: string;
  skin?: string;
  trail?: string;
  /** nível da habilidade */
  lv?: number;
  /** equipamento escolhido */
  loadout?: Partial<Loadout>;
  /** Caça ao Chefe: este jogador é o Chefe */
  boss?: boolean;
}

export interface MatchConfig {
  arena: ArenaDef;
  mode?: GameMode;
  /** lista explícita de jogadores (online ou partidas personalizadas) */
  roster?: RosterEntry[];
  humanChar: string;
  bots: number;
  difficulty: Difficulty;
  ownEchoDamage: boolean;
  training: boolean;
  /** fundo animado do menu: sem jogador humano */
  spectator?: boolean;
  /** bot parado, para treinar uma sinergia */
  dummy?: boolean;
  /** X1: duração da rodada e da morte súbita (testes e salas podem encurtar) */
  roundSec?: number;
  suddenSec?: number;
}

export interface Input {
  mx: number;
  my: number;
  dash: boolean;
  ability: boolean;
  /** segurando o botão de atirar */
  fire?: boolean;
  /** usar item (bomba/mina) */
  item?: boolean;
  /** ângulo de mira; ausente = mira automática */
  aim?: number | null;
  /** usar a habilidade extra pega no mapa */
  bonus?: boolean;
  /** habilidade do equipamento (E) */
  skill?: boolean;
  /** ultimate (R) */
  ult?: boolean;
  /** mira da habilidade: ângulo e distância a partir dos pés (ausente = automático) */
  ca?: number | null;
  cr?: number | null;
  /** 0–1 se o golpe foi carregado ao segurar. Ausente = carga cheia, com o preparo antigo. */
  ch?: number | null;
  /** Rajada de Plasma (X), se entrou no equipamento desta partida */
  plasma?: boolean;
}

export interface Player {
  id: string;
  name: string;
  char: CharacterDef;
  color: string;
  isBot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
  moving: boolean;
  hearts: number;
  carry: number;
  score: number;
  roundPoints: number;
  alive: boolean;
  playing: boolean;
  invulnT: number;
  stunT: number;
  dashT: number;
  dashCd: number;
  abilCd: number;
  turboT: number;
  phaseT: number;
  shieldT: number;
  portalCd: number;
  /** marcas elementais do X1 (segundos). Queimadura dói em tiques; as outras armam combo. */
  burnT: number;
  frozenT: number;
  gustT: number;
  shockT: number;
  burnAcc: number;
  burnDps: number;
  burnFrom: string;
  /** recarga dos quatro poderes (Q E R F) */
  powerCd: [number, number, number, number];
  /** 0–100. O servidor (e o jogo local) é quem gasta e recupera. */
  energy: number;
  /** recarga da Rajada de Plasma */
  plasmaCd: number;
  /** marca de plasma neste jogador (segundos) */
  plasmaT: number;
  /** disparo de plasma do kit: a onda seguinte fecha a cadeia (segundos) */
  plasmaPrimeT: number;
  /** janela do combo, contada a partir do acerto */
  comboT: number;
  /** Marca de Ruptura (segundos). Some sozinha e não é a marca de sombra. */
  ruptureT: number;
  /** Avatar Elemental: o próximo golpe muda de alcance, sem multiplicar dano. */
  avatarT: number;
  /** marca de sinergia (Semente). Não é o marcador que aumenta dano. */
  markedT: number;
  /** campo elemental neste alvo, para o projétil compatível */
  fieldT: number;
  fieldEl: Element | '';
  /** a mesma raiz não dispara o bônus de área outra vez */
  reactCd: number;
  /**
   * Janela de "alvo controlado" para os combos de controle (Suprema no controle, Execução):
   * dura o atordoamento/raiz MAIS uma folga. Antes só valia enquanto o alvo estava tonto (0,55 s),
   * e o segundo golpe quase nunca chegava a tempo.
   */
  ctrlT: number;
  /** Congelamento (Água + Água): preso dentro do gelo por este tempo */
  iceT: number;
  /** o espaço extra desta partida trouxe a Rajada de Plasma */
  plasmaOn: boolean;
  /** combos fechados nesta rodada (a ninja fica mais rápida) */
  comboStacks: number;
  hidden: boolean;
  tookDamage: boolean;
  tripleDone: boolean;
  recorder: EchoRecorder | null;
  brain: BotBrain | null;
  walkPhase: number;
  hitFlash: number;
  magnetT: number;
  doubleNext: boolean;
  /** último poder pego (para o HUD) */
  power: { id: PowerId; t: number } | null;
  stats: { delivered: number; bestDelivery: number; ownEchoHits: number; echoHits: number; disrupted: number; survived: number; dmg: number; taken: number; heal: number; obj: number; weak: number; uses: Record<string, number> };
  // ---- combate
  hp: number;
  shieldHp: number;
  weapon: WeaponId;
  weaponT: number;
  ammo: number;
  fireCd: number;
  item: ItemId | null;
  itemN: number;
  aim: number;
  kills: number;
  deaths: number;
  roundWins: number;
  skin: string;
  trail: string;
  // ---- times, renascer e efeitos
  /** -1 = sem time */
  team: number;
  respawnT: number;
  slowT: number;
  vampT: number;
  /** invisível de verdade (poder/fumaça): ninguém mira em você */
  cloakT: number;
  chargeT: number;
  chargeHit: string[];
  pullT: number;
  pullX: number;
  pullY: number;
  stormAcc: number;
  hillAcc: number;
  /** habilidade extra pega num cristal do mapa (uso único) */
  bonusAb: AbilityId | null;
  // ---- equipamento, ultimate e estados
  maxHp: number;
  loadout: Loadout;
  /** troca pedida entre rodadas (entra na próxima) */
  pendingLoadout: Loadout | null;
  skillCd: number;
  /** 0 a 100 */
  ultCharge: number;
  /** esquiva: invulnerável */
  dodgeT: number;
  /** marcado: visível e leva mais dano */
  markT: number;
  /** sobrecarga (ultimate) */
  overT: number;
  /** imune a novos atordoamentos */
  ccResistT: number;
  /** dentro do campo de estase: sem impulso */
  stasisT: number;
  /** preparando um golpe (não atira, anda devagar) */
  castT: number;
  /** golpe com preparo: ainda não gastou energia nem recarga */
  pendingCast: { slot: number; ang: number; ca?: number | null; cr?: number | null; ch?: number | null; at: number } | null;
  /** recarga do ataque básico */
  basicCd: number;
  /** preso no chão. Não anda nem esquiva. */
  rootT: number;
  /** depois de uma raiz, a próxima demora a pegar */
  rootResistT: number;
  /** arrancada recente: o próximo golpe soma um pouco */
  flowT: number;
  /** piscar recente: o próximo golpe soma a emboscada */
  ambushT: number;
  /** brilho de cura */
  healT: number;
  /** dano de contato enquanto a arrancada do poder dura */
  dashDmg: number;
  dashEl: Element | null;
  dashHit: string[];
  /** Chefe exausto: janela para atacar (mais dano, sem golpes) */
  exhaustT: number;
  /** último dano levado (relógio da rodada): a recuperação lenta começa depois de um tempo */
  lastHurtAt: number;
  /** Caça ao Chefe */
  boss: boolean;
  bossCd: Record<BossSkill, number>;
  chargeDmg: number;
}

/** golpes com aviso (meteoro, feixe, golpes do Chefe…) */
export type CastKind = 'meteoro' | 'feixe' | 'estase' | 'impacto' | 'chuva' | 'barragem' | 'avanco' | 'obsidiana' | 'fissura';
export interface Cast {
  id: number;
  kind: CastKind;
  owner: string;
  team: number;
  x: number;
  y: number;
  ang: number;
  r: number;
  len: number;
  w: number;
  t: number;
  windup: number;
  /** quanto tempo fica ativo depois de disparar (campos/espirais) */
  life: number;
  fired: boolean;
  acc: number;
  /** dano deste golpe, quando a ultimate não usa o valor padrão do tipo */
  dmg?: number;
}
export interface Trap {
  id: number;
  owner: string;
  team: number;
  x: number;
  y: number;
  armT: number;
  t: number;
}

/** cristal de habilidade no chão */
export interface AbilityOrb {
  id: number;
  ab: AbilityId;
  x: number;
  y: number;
  age: number;
}

/** definição da habilidade pelo id (de quem ela é) */
export function abilityDef(id: AbilityId) {
  const c = CHARACTERS.find((x) => x.ability.id === id) ?? CHARACTERS[0];
  return { ...c.ability, owner: c };
}

export type EnemyKind = 'drone' | 'brute' | 'boss' | 'pylon' | MinionKind;
/** criaturas do Chefe: cada uma tem uma função (pressão, bloqueio, distância, suporte, área) */
export type MinionKind = 'rastejador' | 'carapaca' | 'cuspidor' | 'xama' | 'semeador';
export const MINION_KINDS: MinionKind[] = ['rastejador', 'carapaca', 'cuspidor', 'xama', 'semeador'];
export const MINION_INFO: Record<MinionKind, { name: string; role: string; weak: string }> = {
  rastejador: { name: 'Rastejador', role: 'RÁPIDO', weak: 'pouca vida; persegue quem está sozinho' },
  carapaca: { name: 'Carapaça', role: 'TANQUE', weak: 'a casca bloqueia tiros de frente: acerte as costas ou use explosões' },
  cuspidor: { name: 'Cuspidor', role: 'ATIRADOR', weak: 'frágil; use cobertura contra o ácido' },
  xama: { name: 'Xamã', role: 'CURANDEIRO', weak: 'cura o Chefe e as criaturas: derrube primeiro' },
  semeador: { name: 'Semeador', role: 'ÁCIDO', weak: 'lento; espalha poças de ácido com aviso' },
};
export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  cd: number;
  cd2: number;
  dir: number;
  hitFlash: number;
  stunT: number;
  slowT: number;
  chargeT: number;
}
export const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; r: number; touch: number; points: number }> = {
  drone: { hp: 30, speed: 150, r: 16, touch: 10, points: 1 },
  brute: { hp: 90, speed: 115, r: 22, touch: 18, points: 2 },
  boss: { hp: 700, speed: 70, r: 38, touch: 26, points: 10 },
  pylon: { hp: BOSS.pylonHp, speed: 0, r: 24, touch: 0, points: 5 },
  rastejador: { hp: 45, speed: 205, r: 14, touch: 10, points: 1 },
  carapaca: { hp: 200, speed: 70, r: 26, touch: 16, points: 3 },
  cuspidor: { hp: 60, speed: 100, r: 18, touch: 8, points: 2 },
  xama: { hp: 70, speed: 115, r: 18, touch: 6, points: 3 },
  semeador: { hp: 85, speed: 85, r: 20, touch: 10, points: 2 },
};
/** poça de ácido (Semeador): aparece com aviso e machuca quem fica dentro */
export interface Pool {
  id: number;
  x: number;
  y: number;
  r: number;
  armT: number;
  t: number;
}

export interface IceWall {
  id: number;
  owner: string;
  /** visual: gelo, barreira, obsidiana ou caixa (cobertura destrutível) */
  kind?: 'gelo' | 'barreira' | 'obsidiana' | 'caixa';
  /** cobertura destrutível: vida */
  hp?: number;
  maxHp?: number;
  /** muralha do catálogo: racha e cai quando a vida acaba */
  crack?: boolean;
  /** já soltou a explosão de magma */
  spent?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
}
export interface Vortex {
  id: number;
  owner: string;
  x: number;
  y: number;
  t: number;
  r: number;
}
export interface Smoke {
  id: number;
  owner: string;
  x: number;
  y: number;
  t: number;
  r: number;
}
export interface Hook {
  id: number;
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  state: 'fly' | 'back';
}
export interface FlagState {
  team: number;
  x: number;
  y: number;
  home: Pt;
  carrier: string | null;
  atHome: boolean;
  dropT: number;
}
export interface Hill {
  x: number;
  y: number;
  r: number;
  owner: string | null;
  contested: boolean;
  moveAt: number;
  next: Pt | null;
}
export interface Storm {
  x: number;
  y: number;
  r: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
  dmg: number;
  life: number;
  weapon: WeaponId;
  pierce: boolean;
  fromEcho: boolean;
  hit: string[];
  /** já foi devolvido por um escudo (não volta de novo) */
  refl?: boolean;
  /** por que o projétil acabou sem acertar, para não avisar duas vezes */
  miss?: 'wall' | 'range';
  /** poder do X1: o acerto aplica o elemento, não o efeito da arma desenhada */
  el?: Element;
  knock?: number;
  /** Rajada de Plasma: marca o alvo. Não usa o efeito da arma desenhada. */
  plasma?: boolean;
  /** ataque básico: só dano. Não marca elemento e não gasta a marca de plasma. */
  basic?: boolean;
  /** persegue este id. Some se o alvo cair ou sair da partida. */
  homeId?: string;
  /** 0 Q, 1 E, 2 R, 3 F. Ausente = extra. */
  slot?: number;
  /** este projétil marca, não enraíza */
  mark?: boolean;
  /** a ultimate deste projétil já caiu (uma vez só) */
  landed?: boolean;
  /** como o golpe anda (explosão, onda, feixe…). Ausente: tiro comum. */
  form?: import('./elements').PowerForm;
  /** 1 ou -1: a lâmina de vento curva para um lado */
  curve?: number;
  /** rumo do lançamento; a lâmina oscila em volta dele e volta à mira */
  aim?: number;
  /** distância já percorrida pela lâmina */
  flown?: number;
  /** saída da lâmina; a curva mede o desvio a partir daqui */
  spawnX?: number;
  spawnY?: number;
  /** o poder é área, mesmo quando o desenho viaja (onda) */
  area?: boolean;
  /** a explosão ou o salto já saiu deste tiro */
  splashed?: boolean;
  /** golpe do catálogo que lançou este tiro */
  trick?: string;
  /** a zona da Ruptura Dimensional já desviou este tiro */
  bent?: boolean;
}

export interface FieldPatch {
  id: number;
  owner: string;
  kind: 'ash' | 'roots' | 'whirl' | 'rift' | 'abyss';
  x: number;
  y: number;
  r: number;
  t: number;
  total: number;
  hp?: number;
  maxHp?: number;
  acc: number;
  dmg: number;
  el: Element;
  hit: string[];
  blown?: boolean;
  spent?: boolean;
}

export interface ScheduledPulse {
  at: number;
  owner: string;
  x: number;
  y: number;
  r: number;
  dmg: number;
  el: Element;
  kind: 'burst' | 'rock' | 'crystal' | 'gust';
  trick: string;
  knock: number;
}

export interface CombatNote {
  at: number;
  kind: 'cast' | 'hit' | 'zone' | 'status' | 'combo';
  owner: string;
  target: string;
  element: Element;
  ability: string;
  dmg: number;
  x: number;
  y: number;
  combo: string;
}

export interface Bomb {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  owner: string;
  fromEcho: boolean;
  /** granada de gelo */
  ice?: boolean;
  /** pulso: explosão curta que atordoa */
  pulse?: boolean;
}

export interface Mine {
  id: number;
  x: number;
  y: number;
  owner: string;
  armT: number;
}

export interface Turret {
  id: number;
  owner: string;
  hp: number;
  x: number;
  y: number;
  t: number;
  cd: number;
  aim: number;
  /** holograma do Clone. A torreta de verdade não leva o corte de dano. */
  fromClone?: boolean;
}

export interface Fragment {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  golden: boolean;
  age: number;
  /** atração pelo ímã/clone */
  pickDelay: number;
}

export interface Clone {
  owner: string;
  x: number;
  y: number;
  dir: number;
  t: number;
  /** ilusão: segura um tiro hostil e estoura. Não coleta fragmento. */
  decoy?: boolean;
  absorb?: number;
  pop?: number;
}

/** Rastro da ultimate no chão: zona de fogo, maré, vórtice, pilares... Some sozinho. */
export interface UltZone {
  id: number;
  owner: string;
  x: number;
  y: number;
  r: number;
  el: Element;
  t: number;
  total: number;
  acc: number;
  /** vórtice: a rajada final já saiu */
  blown?: boolean;
  /** Eclipse: quem estava na marca quando a suprema caiu */
  marked?: string[];
  struck?: boolean;
  role?: string;
}

export { ULT_WINDUP } from './elements';

export interface Grove {
  id: number;
  owner: string;
  team: number;
  x: number;
  y: number;
  r: number;
  t: number;
  acc: number;
  heal: number;
}

export interface ZoneEvent {
  zone: number;
  warnAt: number;
  activeAt: number;
  endAt: number;
}

export interface EchoView {
  rec: EchoRecording;
  key: string;
  age: number;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  active: boolean;
  disrupted: boolean;
  iced: boolean;
  pulse: number;
  expiring: boolean;
  trail: { x: number; y: number }[];
  /** 0..1: falta pouco para repetir um tiro/bomba/mina GRAVADO (aviso) */
  warn?: number;
  warnAng?: number;
  /** 0 = tiro, 1 = bomba, 2 = mina */
  warnKind?: number;
  /** segundos até voltar a funcionar (desativado por escudo/investida/explosão) */
  offLeft?: number;
  /** a agulha adiantou a rota, uma vez */
  skipMs?: number;
  /** a maré alta atrasou a rota */
  dragMs?: number;
  /** o pêndulo já quantizou esta batida */
  pendPulse?: string;
}

export type GameEvent =
  | { type: 'pickup'; x: number; y: number; pid: string; golden?: boolean; lucky?: boolean }
  | { type: 'deliver'; x: number; y: number; pid: string; points: number; count: number }
  | { type: 'hit'; x: number; y: number; pid: string; by: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse'; lost?: number; from?: string }
  | { type: 'eliminated'; x: number; y: number; pid: string }
  | { type: 'dash'; x: number; y: number; pid: string; el?: string; ang?: number }
  | { type: 'ability'; x: number; y: number; pid: string; ability: string }
  | { type: 'portal'; x: number; y: number; pid: string }
  | { type: 'disrupt'; x: number; y: number }
  | { type: 'hazardWarn'; x: number; y: number }
  | { type: 'hazardOn'; x: number; y: number }
  | { type: 'piston'; x: number; y: number }
  | { type: 'coreWarn'; x: number; y: number }
  | { type: 'coreMove'; x: number; y: number }
  | { type: 'goldenWarn'; x: number; y: number }
  | { type: 'goldenSpawn'; x: number; y: number }
  | { type: 'objective'; pid: string; text: string }
  | { type: 'phase'; phase: Phase }
  | { type: 'echoSpawn'; count: number }
  | { type: 'echoExpired'; round: number }
  | { type: 'tick'; n: number }
  | { type: 'bridgeWarn'; x: number; y: number }
  | { type: 'power'; x: number; y: number; pid: string; power: PowerId }
  | { type: 'powerSpawn'; x: number; y: number; power: PowerId }
  | { type: 'echoErased'; x: number; y: number; pid: string }
  | { type: 'shoot'; x: number; y: number; pid: string; weapon: WeaponId }
  | { type: 'explode'; x: number; y: number; r: number }
  | { type: 'kill'; pid: string; by: string | null; x: number; y: number }
  | { type: 'heal'; x: number; y: number; pid: string }
  | { type: 'roundWin'; pid: string | null; reason?: DuelReason }
  | { type: 'sudden' }
  | { type: 'zap'; pid: string; pts: number[] }
  | { type: 'capture'; pid: string; team: number }
  | { type: 'flagTake'; pid: string; team: number }
  | { type: 'flagReturn'; team: number; x: number; y: number }
  | { type: 'flagDrop'; team: number; x: number; y: number }
  | { type: 'hillMove'; x: number; y: number }
  | { type: 'wave'; n: number; boss: boolean }
  | { type: 'enemyKill'; x: number; y: number; kind: EnemyKind; by: string | null }
  | { type: 'enemySpawn'; x: number; y: number; kind: EnemyKind }
  | { type: 'windWarn'; dir: number }
  | { type: 'trainWarn'; y: number }
  | { type: 'respawn'; x: number; y: number; pid: string }
  | { type: 'gameOver'; won: boolean }
  | { type: 'reflect'; x: number; y: number; pid: string }
  | { type: 'bonusSpawn'; x: number; y: number; ab: AbilityId }
  | { type: 'bonusPick'; x: number; y: number; pid: string; ab: AbilityId }
  | { type: 'dmg'; pid: string; x: number; y: number; n: number; k: 'hp' | 'shield' | 'block' | 'weak' | 'dodge' | 'heal' | 'immune'; sx?: number; sy?: number; src?: DmgSrc; note?: string }
  | { type: 'skill'; pid: string; x: number; y: number; skill: string; r?: number; form?: string; trick?: string }
  | { type: 'ult'; pid: string; x: number; y: number; ult: string }
  | { type: 'cast'; pid: string; kind: CastKind; x: number; y: number }
  | { type: 'castHit'; kind: CastKind; x: number; y: number; r: number; ang: number; len: number }
  | { type: 'bossPhase'; n: number }
  | { type: 'pylon'; x: number; y: number; down: boolean }
  | { type: 'trap'; x: number; y: number; pid: string }
  | { type: 'mark'; x: number; y: number; pid: string }
  | { type: 'lives'; n: number }
  | { type: 'exhaust'; x: number; y: number }
  | { type: 'minion'; x: number; y: number; kind: MinionKind }
  | { type: 'block'; x: number; y: number }
  | { type: 'stunned'; x: number; y: number; pid: string }
  | { type: 'combo'; x: number; y: number; name: string; bonus: number; pid: string; vfx?: 'ult' | 'burst' | 'root' | 'element'; id?: string }
  /** poder acertou alguém (mesmo ponto do dano): efeito de impacto do elemento */
  | { type: 'phit'; x: number; y: number; el: string; pid: string; aoe?: boolean }
  /** projétil de poder acabou sem acertar (parede ou alcance): dissipa no lugar */
  | { type: 'pend'; x: number; y: number; el: string; wall?: boolean }
  /** começou o preparo de um poder (energia na mão) */
  | { type: 'windup'; pid: string; x: number; y: number; el: string; t: number; ult?: boolean; tx?: number; ty?: number; r?: number; lane?: boolean }
  /** a ultimate caiu: efeito grande no chão (mesmo ponto do efeito real) */
  | { type: 'ultland'; pid: string; x: number; y: number; el: string; r: number; role?: string }
  /** kill confirmado por um combo. O cliente só apresenta; o dano já foi aplicado. */
  | { type: 'finisher'; pid: string; by: string; x: number; y: number; name: string; id: string; seconds: number }
  /** piscar: de onde saiu para onde chegou (posição real) */
  | { type: 'blink'; pid: string; x0: number; y0: number; x1: number; y1: number; el: string }
  | { type: 'deny'; pid: string; msg: string; x?: number; y?: number };

export type Phase = 'prep' | 'play' | 'rewind' | 'call' | 'results';
/** de onde veio o dano (para o indicador de direção e a cor do número) */
export type DmgSrc = 'arma' | 'eco' | 'perigo' | 'golpe' | 'explosao' | 'criatura';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** tira a velocidade que entra na parede. Vale na simulação e na previsão online. */
function slideVelocity(p: { vx?: number; vy?: number }, nx: number, ny: number) {
  if (p.vx === undefined || p.vy === undefined) return;
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= vn * nx;
    p.vy -= vn * ny;
  }
}

export class Game {
  readonly arena: ArenaDef;
  readonly cfg: MatchConfig;
  readonly players: Player[] = [];
  readonly echoes = new EchoManager(3);
  readonly nav: NavGrid;
  fragments: Fragment[] = [];
  clones: Clone[] = [];
  groves: Grove[] = [];
  ultZones: UltZone[] = [];
  patches: FieldPatch[] = [];
  pulses: ScheduledPulse[] = [];
  combatLog: CombatNote[] = [];
  private finisherUsed = new Set<string>();
  powerups: { id: number; kind: PowerId; x: number; y: number; age: number }[] = [];
  bullets: Bullet[] = [];
  bombs: Bomb[] = [];
  mines: Mine[] = [];
  turrets: Turret[] = [];
  enemies: Enemy[] = [];
  abilityOrbs: AbilityOrb[] = [];
  private orbTimer = 6;
  iceWalls: IceWall[] = [];
  vortexes: Vortex[] = [];
  smokes: Smoke[] = [];
  hooks: Hook[] = [];
  casts: Cast[] = [];
  traps: Trap[] = [];
  /** Caça ao Chefe */
  bossId: string | null = null;
  bossPhase = 1;
  teamLives = 0;
  pools: Pool[] = [];
  /** pontos de recurso (cura/escudo aparecem aqui de tempos em tempos) */
  resSpots: Pt[] = [];
  private resT = 6;
  private minionT = 0;
  private fissureT = 0;
  private exhaustAuto = 0;
  flags: FlagState[] = [];
  hill: Hill | null = null;
  storm: Storm | null = null;
  teamScore = [0, 0];
  /** ondas: número da onda e se a partida acabou com vitória */
  wave = 0;
  gameWon: boolean | null = null;
  private waveQueue: { at: number; kind: EnemyKind }[] = [];
  private stormFrom = { x: 640, y: 360, r: 800 };
  private stormTo = { x: 640, y: 360, r: 90 };
  readonly mode: GameMode;
  readonly rules: (typeof MODE_RULES)[GameMode];
  private prevTms = 0;
  iceUntil = 0;
  private powerTimer = 4;
  private erased = new Set<string>();
  echoViews: EchoView[] = [];
  zoneEvents: ZoneEvent[] = [];
  events: GameEvent[] = [];
  /** última posição em que o corpo cabia (para sair de uma parede sem teleporte aleatório) */
  private safePos = new Map<string, { x: number; y: number }>();
  /** próximo tick de perigo, por jogador. Não vai no snapshot. */
  private hazardClock = new Map<string, number>();

  phase: Phase = 'prep';
  phaseT = 0;
  round = 0;
  totalRounds = C.TOTAL_ROUNDS;
  tiebreak = false;
  roundDur = C.ROUND_TIME;
  /** X1: morte súbita ligada (o dano base passa a valer o dobro, uma vez) */
  sudden = false;
  suddenT = 0;
  suddenLimit = DUEL.suddenSec;
  /** vencedor do round em exibição; null com phase call = empate */
  callWinner: string | null = null;
  callReason: DuelReason | null = null;
  private duelClosedRound = 0;
  roundT = 0; // segundos de rodada ativa
  worldT = 0; // relógio contínuo para pontes/pistões/feixes
  /** worldT no instante em que a rodada entrou em jogo (o disco usa isso) */
  roundOrigin = 0;
  /** pulso de mapa que já empurrou ou marcou este jogador */
  tuneOnce = new Set<string>();
  /** pressa ou lentidão de um pulso, sem acumular */
  tuneHold = new Map<string, { until: number; speed: number; pulse: string }>();
  private tuneSilent = new Set<string>();
  private tunePhase = '';
  core: Pt = { x: 640, y: 360 };
  coreNext: Pt | null = null;
  coreMoveAt = -1;
  objective: ObjectiveId = 'dourado';
  goldenSpot: Pt | null = null;
  goldenDone = false;
  lastRecordings: EchoRecording[] = [];
  /** rotas resumidas da rodada que acabou (para o Rebobinando, também online) */
  lastDigests: EchoDigest[] = [];
  /** resumo curto do que cada um gravou na rodada que acabou */
  roundEchoLines: RoundEchoLine[] = [];
  /** rotas resumidas dos Ecos ativos (por chave) */
  echoDigests = new Map<string, EchoDigest>();
  /** quem era o dono do Eco que acertou por último (para o aviso "ECO de Kael") */
  private echoHitBy: string | null = null;
  expiredRound: number | null = null;
  winners: string[] = [];
  highlight = '';
  paused = false;
  private fragId = 1;
  private fragTimer = 0;
  private lastTick = -1;
  private disrupted = new Map<string, number>();
  private trails = new Map<string, { x: number; y: number }[]>();
  private coreIndex = Math.floor(Math.random() * 5);

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.arena = cfg.arena;
    this.mode = cfg.mode === 'dupla' ? 'dupla' : 'duelo';
    this.rules = MODE_RULES[this.mode];
    this.nav = new NavGrid(this.arena);
    this.suddenLimit = cfg.suddenSec ?? DUEL.suddenSec;
    this.totalRounds = this.rules.rounds;
    if (cfg.roster) {
      for (const r of cfg.roster) this.addPlayer(r.id, withLevel(getCharacter(r.char), r.lv, false), r.isBot, r.name, r.skin, r.trail, r.loadout);
    } else {
      const human = getCharacter(cfg.humanChar);
      this.addPlayer('p0', human, false);
      const others = shuffle(CHARACTERS.map((c) => c.id).filter((c) => c !== human.id));
      const n = this.mode === 'duelo' ? 1 : Math.min(Math.max(1, cfg.bots), this.rules.maxPlayers - 1);
      for (let i = 0; i < n; i++) this.addPlayer('b' + i, getCharacter(others[i % others.length]), true);
    }
    assignUniqueColors(this.players);
    assignUniqueNames(this.players);
    // 2x2: primeira metade no time azul, segunda no vermelho (amigos entram antes dos bots)
    const half = Math.ceil(this.players.length / 2);
    this.players.forEach((p, i) => (p.team = this.mode === 'dupla' ? (i < half ? 0 : 1) : -1));
    this.nextRound();
  }

  get human(): Player {
    return this.players[0];
  }

  get combat(): boolean {
    return true;
  }

  private addPlayer(id: string, base: CharacterDef, isBot: boolean, name?: string, skin = 'padrao', trail = 'nenhum', loadout?: Partial<Loadout>) {
    const ch = withSkin(base, skin);
    const lo = sanitizeLoadout(loadout ?? (isBot ? botLoadout(base.id) : DEFAULT_LOADOUT));
    this.players.push({
      id,
      name: name ?? (isBot ? ch.name : `${ch.name} (você)`),
      char: ch,
      color: ch.color,
      isBot,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      dir: Math.PI / 2,
      moving: false,
      hearts: C.HEARTS,
      carry: 0,
      score: 0,
      roundPoints: 0,
      alive: true,
      playing: true,
      invulnT: 0,
      stunT: 0,
      dashT: 0,
      dashCd: 0,
      abilCd: 0,
      turboT: 0,
      phaseT: 0,
      shieldT: 0,
      portalCd: 0,
      burnT: 0,
      frozenT: 0,
      gustT: 0,
      shockT: 0,
      burnAcc: 0,
      burnDps: 0,
      burnFrom: '',
      powerCd: [0, 0, 0, 0],
      energy: ENERGY_MAX,
      plasmaCd: 0,
      plasmaT: 0,
      plasmaPrimeT: 0,
      comboT: 0,
      ruptureT: 0,
      avatarT: 0,
      markedT: 0,
      fieldT: 0,
      fieldEl: '',
      reactCd: 0,
      ctrlT: 0,
      iceT: 0,
      plasmaOn: !!lo.secondary,
      comboStacks: 0,
      hidden: false,
      tookDamage: false,
      tripleDone: false,
      recorder: null,
      brain: isBot ? new BotBrain(this.cfg.difficulty) : null,
      walkPhase: 0,
      hitFlash: 0,
      magnetT: 0,
      doubleNext: false,
      power: null,
      stats: { delivered: 0, bestDelivery: 0, ownEchoHits: 0, echoHits: 0, disrupted: 0, survived: 0, dmg: 0, taken: 0, heal: 0, obj: 0, weak: 0, uses: {} },
      hp: COMBAT.maxHp,
      shieldHp: 0,
      weapon: loadoutPrimary(base.id, lo.primary),
      weaponT: 0,
      ammo: 0,
      fireCd: 0,
      item: null,
      itemN: 0,
      aim: 0,
      kills: 0,
      deaths: 0,
      roundWins: 0,
      skin,
      trail,
      team: -1,
      respawnT: 0,
      slowT: 0,
      vampT: 0,
      cloakT: 0,
      chargeT: 0,
      chargeHit: [],
      pullT: 0,
      pullX: 0,
      pullY: 0,
      stormAcc: 0,
      hillAcc: 0,
      bonusAb: null,
      maxHp: COMBAT.maxHp,
      loadout: lo,
      pendingLoadout: null,
      skillCd: 0,
      ultCharge: 0,
      dodgeT: 0,
      markT: 0,
      overT: 0,
      ccResistT: 0,
      stasisT: 0,
      castT: 0,
      pendingCast: null,
      basicCd: 0,
      rootT: 0,
      rootResistT: 0,
      flowT: 0,
      ambushT: 0,
      healT: 0,
      dashDmg: 0,
      dashEl: null,
      dashHit: [],
      exhaustT: 0,
      lastHurtAt: 0,
      boss: false,
      bossCd: { impacto: 0, barragem: 0, chuva: 0, obsidiana: 0, avanco: 0 },
      chargeDmg: 0,
    });
  }

  /** troca de equipamento: vale a partir da próxima rodada (não zera recargas no meio da luta) */
  setLoadout(id: string, l: Partial<Loadout>) {
    const p = this.players.find((q) => q.id === id);
    if (!p || p.boss) return;
    p.pendingLoadout = sanitizeLoadout({ ...p.loadout, ...l });
  }

  get boss(): Player | null {
    return this.bossId ? this.players.find((p) => p.id === this.bossId) ?? null : null;
  }

  /** a e b são inimigos? (mesmo time = aliados) */
  hostile(a: { id: string; team: number }, b: { id: string; team: number }): boolean {
    if (a.id === b.id) return false;
    return a.team < 0 || a.team !== b.team;
  }
  teamOf(id: string): number {
    return this.players.find((p) => p.id === id)?.team ?? -1;
  }
  /** pode ser alvo de mira (não está invisível/fumaça) */
  targetable(p: Player): boolean {
    // arbusto, fase e invisibilidade escondem de verdade: o bot não atira em quem não daria para ver
    return p.alive && p.playing && p.cloakT <= 0 && !p.hidden;
  }

  // ------------------------------------------------------------------ rodada
  private nextRound() {
    this.round++;
    this.phase = 'prep';
    this.phaseT = 0;
    this.roundT = 0;
    this.lastTick = -1;
    this.roundDur = this.cfg.roundSec ?? this.rules.dur;
    this.sudden = false;
    this.suddenT = 0;
    this.callWinner = null;
    this.callReason = null;
    this.bullets = [];
    this.bombs = [];
    this.mines = [];
    this.turrets = [];
    this.enemies = [];
    this.abilityOrbs = [];
    this.orbTimer = 5 + Math.random() * 3;
    this.iceWalls = [];
    this.ultZones = [];
    this.patches = [];
    this.pulses = [];
    this.combatLog = [];
    this.finisherUsed.clear();
    this.vortexes = [];
    this.smokes = [];
    this.hooks = [];
    this.casts = [];
    this.traps = [];
    this.prevTms = 0;
    const cores = this.arena.cores;
    this.core = { ...cores[(this.coreIndex + this.round - 1) % cores.length] };
    this.coreNext = null;
    this.coreMoveAt = !this.tiebreak && this.round >= 3 ? 15 : -1;
    const objs: ObjectiveId[] = ['dourado', 'tripla', 'intocavel', 'dourado'];
    this.objective = this.tiebreak ? 'dourado' : objs[(this.round - 1) % objs.length];
    this.goldenSpot = null;
    this.goldenDone = false;
    this.clones = [];
    this.powerups = [];
    this.powerTimer = 4;
    this.iceUntil = 0;
    this.disrupted.clear();
    this.trails.clear();
    this.fragments = [];

    const spawns = this.arena.spawns;
    const offset = (this.round - 1) * 2;
    this.players.forEach((p, i) => {
      const s = spawns[(i + offset) % spawns.length];
      Object.assign(p, {
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        hearts: C.HEARTS,
        carry: 0,
        roundPoints: 0,
        invulnT: 0,
        stunT: 0,
        dashT: 0,
        dashCd: 0,
        abilCd: 0,
        turboT: 0,
        phaseT: 0,
        shieldT: 0,
        portalCd: 0,
        burnT: 0,
        frozenT: 0,
        gustT: 0,
        shockT: 0,
        burnAcc: 0,
        burnDps: 0,
        burnFrom: '',
        powerCd: [0, 0, 0, 0],
        energy: ENERGY_MAX,
        plasmaCd: 0,
        plasmaT: 0,
        plasmaPrimeT: 0,
        comboT: 0,
        ruptureT: 0,
        avatarT: 0,
        markedT: 0,
        fieldT: 0,
        fieldEl: '',
        reactCd: 0,
        ctrlT: 0,
        iceT: 0,
        comboStacks: 0,
        tookDamage: false,
        tripleDone: false,
        hitFlash: 0,
        magnetT: 0,
        doubleNext: false,
        power: null,
        hp: p.maxHp,
        shieldHp: 0,
        weaponT: 0,
        ammo: 0,
        fireCd: 0,
        respawnT: 0,
        skillCd: 0,
        dodgeT: 0,
        markT: 0,
        overT: 0,
        ccResistT: 0,
        stasisT: 0,
        castT: 0,
        pendingCast: null,
        basicCd: 0,
        rootT: 0,
        rootResistT: 0,
        flowT: 0,
        ambushT: 0,
        healT: 0,
        dashDmg: 0,
        dashEl: null,
        dashHit: [],
        exhaustT: 0,
        chargeDmg: 0,
        lastHurtAt: 0,
        slowT: 0,
        vampT: 0,
        cloakT: 0,
        chargeT: 0,
        chargeHit: [],
        pullT: 0,
        stormAcc: 0,
        bonusAb: null,
      });
      // equipamento: troca pedida entra agora; arma e itens da rodada
      if (p.pendingLoadout) {
        p.loadout = p.pendingLoadout;
        p.pendingLoadout = null;
      }
      p.plasmaOn = !!p.loadout.secondary;
      this.equip(p);
      if (this.mode === 'dupla') {
        const sp = this.teamSpawn(p.team, i % 2);
        p.x = sp.x;
        p.y = sp.y;
      } else {
        const sp = [spawns[0], spawns[1]][i % 2];
        p.x = sp.x;
        p.y = sp.y;
      }
      p.dir = Math.atan2(360 - p.y, 640 - p.x);
      p.aim = p.dir;
      p.playing = (!this.tiebreak || this.winners.includes(p.id) || this.rules.teams) && !(this.cfg.spectator && p.id === 'p0');
      p.alive = p.playing;
      p.recorder = p.playing ? new EchoRecorder(p.id, this.round, p.color, p.char.id) : null;
      p.brain?.reset();
    });

    if (!this.combat) {
      const target = Math.round(4 + this.players.filter((p) => p.playing).length * 1.5);
      for (let i = 0; i < target; i++) this.spawnFragment();
    } else {
      this.powerTimer = 2;
    }
    this.buildZoneSchedule();
    this.refreshEchoViews();
    this.events.push({ type: 'phase', phase: 'prep' });
    if (this.echoes.count > 0) this.events.push({ type: 'echoSpawn', count: this.echoes.count });
  }

  private buildZoneSchedule() {
    this.zoneEvents = [];
    const zones = this.arena.zones;
    if (!zones.length) return;
    const gap = this.round <= 1 ? 6 : 4.6;
    const perWave = this.round >= 3 ? 2 : 1;
    let t = 3.5;
    let last = -1;
    while (t < this.roundDur - 2) {
      const used = new Set<number>();
      for (let k = 0; k < perWave; k++) {
        let idx = -1;
        for (let tries = 0; tries < 12; tries++) {
          const c = Math.floor(Math.random() * zones.length);
          if (c === last || used.has(c)) continue;
          const z = zones[c];
          if (dist(z.x, z.y, this.core.x, this.core.y) < z.r + C.CORE_R + 30) continue;
          idx = c;
          break;
        }
        if (idx < 0) continue;
        used.add(idx);
        last = idx;
        this.zoneEvents.push({ zone: idx, warnAt: t, activeAt: t + C.HAZARD_WARN, endAt: t + C.HAZARD_WARN + C.HAZARD_ACTIVE });
      }
      t += gap + Math.random() * 1.5;
    }
  }

  /** Grava a rodada que acabou. O placar já foi decidido antes; o Eco só vale na rodada seguinte. */
  private sealEchoes() {
    const recs: EchoRecording[] = [];
    for (const p of this.players) {
      if (!p.playing || !p.recorder) continue;
      const rec = p.recorder.finish(this.roundDur * 1000, p.x, p.y, p.dir);
      rec.spinOrigin = this.roundOrigin;
      recs.push(rec);
    }
    this.lastRecordings = recs;
    this.lastDigests = recs.filter((r) => r.frames.length > 1).map((r) => digestRecording(r));
    this.roundEchoLines = summarizeRound(this.lastDigests, this.roundDur * 1000);
    const removed = this.echoes.add(this.round, recs);
    this.expiredRound = removed.length ? removed[0].round : null;
    if (this.expiredRound !== null) this.events.push({ type: 'echoExpired', round: this.expiredRound });
  }

  /** pular a animação do Rebobinando (contra bots: na hora; online: quando todos pedem) */
  skipRewind() {
    if (this.phase === 'rewind' && this.phaseT > 0.25) this.phaseT = C.REWIND_TIME;
  }

  private afterRewind() {
    const best = Math.max(0, ...this.players.map((p) => p.roundWins));
    const done = best >= DUEL.wins || this.round >= this.totalRounds;
    if (done) {
      this.winners = this.players.filter((p) => p.roundWins === best && best > 0).map((p) => p.id);
      if (!this.winners.length) this.winners = this.players.map((p) => p.id);
      this.finishMatch();
      return;
    }
    this.nextRound();
  }

  private finishMatch() {
    this.phase = 'results';
    this.phaseT = 0;
    // melhor jogada
    const best = [...this.players].sort((a, b) => b.stats.bestDelivery - a.stats.bestDelivery)[0];
    const clumsy = [...this.players].sort((a, b) => b.stats.ownEchoHits - a.stats.ownEchoHits)[0];
    const parts: string[] = [];
    if (best && best.stats.bestDelivery > 0) parts.push(`Maior entrega: ${best.char.name} com ${best.stats.bestDelivery} pontos de uma vez.`);
    if (clumsy && clumsy.stats.ownEchoHits > 0)
      parts.push(`${clumsy.char.name} foi pego pelo próprio Eco ${clumsy.stats.ownEchoHits}×.`);
    parts.length = 0;
    const killer = [...this.players].sort((a, b) => b.kills - a.kills)[0];
    if (this.mode === 'dupla') parts.push(`Placar de rodadas: Azul ${this.teamRoundWins(0)} × ${this.teamRoundWins(1)} Vermelho.`);
    if (killer && killer.kills > 0) parts.push(`Mais eliminações: ${killer.char.name} (${killer.kills}).`);
    if (clumsy && clumsy.stats.ownEchoHits > 0) parts.push(`${clumsy.char.name} levou ${clumsy.stats.ownEchoHits} golpe(s) do próprio Eco.`);
    const breaker = [...this.players].sort((a, b) => b.stats.disrupted - a.stats.disrupted)[0];
    if (breaker && breaker.stats.disrupted > 0) parts.push(`${breaker.char.name} desfez ${breaker.stats.disrupted} Eco(s).`);
    this.highlight = parts.join(' ');
    this.events.push({ type: 'phase', phase: 'results' });
  }

  ranking() {
    return ranking(this.players.map((p) => ({ id: p.id, score: p.score, p }))).map((l) => l.p);
  }

  private award(p: Player, pts: number) {
    p.score += pts;
    p.roundPoints += pts;
  }

  // ------------------------------------------------------------------ passo
  step(dt: number, inputs: Input | Record<string, Input>) {
    const IDLE: Input = { mx: 0, my: 0, dash: false, ability: false };
    const inputFor = (p: Player): Input => ('mx' in inputs ? (p === this.players[0] ? (inputs as Input) : IDLE) : (inputs as Record<string, Input>)[p.id] ?? IDLE);
    if (this.paused || this.phase === 'results') return;
    this.worldT += dt;
    this.phaseT += dt;

    if (this.phase === 'prep') {
      const n = Math.ceil(C.PREP_TIME - this.phaseT);
      if (n !== this.lastTick && n <= 3 && n > 0) {
        this.lastTick = n;
        this.events.push({ type: 'tick', n });
      }
      for (const p of this.players) {
        if (!p.playing) continue;
        // pequena "respiração" e mira no núcleo
        p.moving = false;
      }
      this.updateEchoViews(0);
      if (this.phaseT >= C.PREP_TIME) {
        this.phase = 'play';
        this.phaseT = 0;
        this.roundOrigin = this.worldT;
        this.tuneOnce.clear();
        this.tuneHold.clear();
        this.tuneSilent.clear();
        this.lastTick = -1;
        if (this.combat) for (const p of this.players) p.invulnT = 1 + COMBAT.spawnProtect;
        this.events.push({ type: 'phase', phase: 'play' });
      }
      return;
    }

    if (this.phase === 'rewind') {
      if (this.phaseT >= C.REWIND_TIME) this.afterRewind();
      return;
    }

    if (this.phase === 'call') {
      if (this.phaseT >= DUEL.callSec) this.afterDuelCall();
      return;
    }

    // ---- rodada ativa
    this.roundT += dt;
    if (this.sudden) this.suddenT += dt;
    const tms = this.roundT * 1000;
    const left = this.sudden ? Math.ceil(this.suddenLimit - this.suddenT) : Math.ceil(this.roundDur - this.roundT);
    if (left <= 5 && left !== this.lastTick && left > 0) {
      this.lastTick = left;
      this.events.push({ type: 'tick', n: left });
    }

    this.updateRoundEvents();
    this.updateEchoViews(tms);

    for (const p of this.players) {
      if (!p.playing) continue;
      if (!p.alive) {
        if (p.respawnT > 0) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) this.revive(p);
        }
        continue;
      }
      const input = p.isBot ? botCombat(this, p, dt) : inputFor(p);
      this.updatePlayer(p, input, dt);
    }
    this.separatePlayers();
    for (const p of this.players) {
      if (!p.playing || !p.alive) continue;
      this.checkHazards(p, dt);
      if (!p.alive) continue;
      this.checkEchoes(p);
      if (!p.alive) continue;
      if (!this.combat) {
        this.checkPickups(p);
        this.checkDelivery(p);
      }
      if (!p.boss) {
        this.checkPowerups(p);
        this.checkAbilityOrbs(p);
      }
      if (tuneHides(this.arena, p.x, p.y, this.worldT)) {
        if (!this.tuneSilent.has(p.id)) {
          p.recorder?.markJump();
          this.tuneSilent.add(p.id);
        }
      } else {
        if (this.tuneSilent.delete(p.id)) p.recorder?.markJump();
        p.recorder?.sample(tms, p.x, p.y, p.dir, p.moving);
      }
    }
    this.updateClones(dt);
    this.updateGroves(dt);
    this.updateUltZones(dt);
    this.updateCatalog(dt);
    this.updateTurrets(dt);
    this.replayEchoActions(tms);
    this.updatePowerups(dt);
    this.updateAbilityOrbs(dt);
    this.updateAbilities(dt);
    if (this.combat) {
      this.updateCasts(dt);
      this.updateTraps(dt);
    }
    if (this.combat) this.updateCombat(dt);
    else this.updateFragments(dt);
    this.prevTms = tms;

    this.maybeEndRound();
  }

  /** X1 e 2x2 não usam o relógio do cliente: só este passo muda de fase. */
  private maybeEndRound() {
    const playing = this.players.filter((p) => p.playing);
    const living = playing.filter((p) => p.alive);
    if (this.mode === 'dupla') {
      const sides = new Set(playing.map((p) => p.team));
      const live = new Set(living.map((p) => p.team));
      if (sides.size > 1 && live.size < sides.size) {
        if (living.length) this.closeDuel(living[0], 'kill');
        else this.closeDuelTie();
        return;
      }
    } else if (playing.length > 1 && living.length <= 1) {
      if (living.length === 1) this.closeDuel(living[0], 'kill');
      else this.closeDuelTie();
      return;
    }
    if (!this.sudden && this.roundT >= this.roundDur) {
      this.enterSudden();
      return;
    }
    if (this.sudden && this.suddenT >= this.suddenLimit) this.closeDuelTie();
  }

  private teamRoundWins(team: number) {
    return this.players.find((p) => p.playing && p.team === team)?.roundWins ?? 0;
  }

  private enterSudden() {
    if (this.sudden || this.phase !== 'play') return;
    this.sudden = true;
    this.suddenT = 0;
    this.lastTick = -1;
    this.events.push({ type: 'sudden' });
  }

  private closeDuelTie() {
    if (this.mode === 'dupla') {
      const sum = (team: number, key: 'hp' | 'dmg') =>
        this.players.filter((p) => p.playing && p.team === team).reduce((n, p) => n + (key === 'hp' ? (p.alive ? p.hp : 0) : p.stats.dmg), 0);
      const hp0 = sum(0, 'hp');
      const hp1 = sum(1, 'hp');
      const d0 = sum(0, 'dmg');
      const d1 = sum(1, 'dmg');
      let team = -1;
      let reason: DuelReason = 'draw';
      if (hp0 !== hp1) {
        team = hp0 > hp1 ? 0 : 1;
        reason = 'hp';
      } else if (d0 !== d1) {
        team = d0 > d1 ? 0 : 1;
        reason = 'damage';
      }
      const winner = team < 0 ? null : (this.players.find((p) => p.playing && p.team === team) ?? null);
      this.closeDuel(winner, reason);
      return;
    }
    const rows = this.players.filter((p) => p.playing).map((p) => ({ id: p.id, hp: p.alive ? p.hp : 0, dmg: p.stats.dmg }));
    const r = duelTiebreak(rows);
    this.closeDuel(r.winner ? (this.players.find((p) => p.id === r.winner) ?? null) : null, r.reason);
  }

  /** um round do X1 fecha uma vez. O placar sai agora; o Rebobinando vem depois e não muda o ponto. */
  private closeDuel(winner: Player | null, reason: DuelReason) {
    if (this.duelClosedRound === this.round || this.phase !== 'play') return;
    this.duelClosedRound = this.round;
    if (winner) {
      const mates = this.mode === 'dupla' ? this.players.filter((p) => p.playing && p.team === winner.team) : [winner];
      for (const m of mates) {
        m.roundWins++;
        this.award(m, 1);
      }
    }
    this.sealEchoes();
    this.callWinner = winner?.id ?? null;
    this.callReason = reason;
    this.phase = 'call';
    this.phaseT = 0;
    this.events.push({ type: 'roundWin', pid: winner?.id ?? null, reason });
    this.events.push({ type: 'phase', phase: 'call' });
  }

  private afterDuelCall() {
    this.phase = 'rewind';
    this.phaseT = 0;
    this.events.push({ type: 'phase', phase: 'rewind' });
  }

  private updateRoundEvents() {
    const t = this.roundT;
    // perigos anunciados
    for (const ev of this.zoneEvents) {
      const z = this.arena.zones[ev.zone];
      if (t >= ev.warnAt && t - this.lastDt() < ev.warnAt) this.events.push({ type: 'hazardWarn', x: z.x, y: z.y });
      if (t >= ev.activeAt && t - this.lastDt() < ev.activeAt) this.events.push({ type: 'hazardOn', x: z.x, y: z.y });
    }
    // pistões
    for (const pi of this.arena.pistons ?? []) {
      const prev = pistonState(pi, this.worldT - this.lastDt()).phase;
      const now = pistonState(pi, this.worldT).phase;
      if (prev !== 'slam' && now === 'slam') this.events.push({ type: 'piston', x: pi.x + pi.w / 2, y: pi.y });
    }
    for (const b of this.arena.bridges ?? []) {
      const prev = bridgeState(b, this.worldT - this.lastDt());
      if (prev === 'on' && bridgeState(b, this.worldT) === 'warn') this.events.push({ type: 'bridgeWarn', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    }
    if (this.arena.wind) {
      const prev = windState(this.arena.wind, this.worldT - this.lastDt());
      const now = windState(this.arena.wind, this.worldT);
      if (prev.phase === 'idle' && now.phase === 'warn') this.events.push({ type: 'windWarn', dir: now.dir });
    }
    for (const tr of this.arena.trains ?? []) {
      if (trainState(tr, this.worldT - this.lastDt()).phase === 'idle' && trainState(tr, this.worldT).phase === 'warn') this.events.push({ type: 'trainWarn', y: tr.y + tr.h / 2 });
    }
    const tune = tuneClock(this.arena, this.worldT);
    if (tune.hint && tune.phase !== this.tunePhase) {
      if (tune.phase === 'warn') this.events.push({ type: 'hazardWarn', x: this.core.x, y: this.core.y });
      if (tune.phase === 'on' && this.tunePhase === 'warn') this.events.push({ type: 'hazardOn', x: this.core.x, y: this.core.y });
      this.tunePhase = tune.phase;
    }
    if (this.combat) return;
    // núcleo muda de lugar (rodadas 3+)
    if (this.coreMoveAt > 0) {
      if (!this.coreNext && t >= this.coreMoveAt - 3) {
        const cores = this.arena.cores;
        let c = cores[Math.floor(Math.random() * cores.length)];
        for (let i = 0; i < 6 && dist(c.x, c.y, this.core.x, this.core.y) < 50; i++) c = cores[Math.floor(Math.random() * cores.length)];
        this.coreNext = { ...c };
        this.events.push({ type: 'coreWarn', x: c.x, y: c.y });
      }
      if (this.coreNext && t >= this.coreMoveAt) {
        this.core = this.coreNext;
        this.coreNext = null;
        this.coreMoveAt = -1;
        this.events.push({ type: 'coreMove', x: this.core.x, y: this.core.y });
      }
    }
    // fragmento dourado
    if (this.objective === 'dourado' && !this.goldenDone) {
      const at = this.tiebreak ? 4 : 10;
      if (!this.goldenSpot && t >= at - 3) {
        const s = this.randomFreeSpot(120);
        if (s) {
          this.goldenSpot = s;
          this.events.push({ type: 'goldenWarn', x: s.x, y: s.y });
        }
      }
      if (this.goldenSpot && t >= at && !this.fragments.some((f) => f.golden)) {
        this.fragments.push({ id: this.fragId++, x: this.goldenSpot.x, y: this.goldenSpot.y, vx: 0, vy: 0, golden: true, age: 0, pickDelay: 0 });
        this.events.push({ type: 'goldenSpawn', x: this.goldenSpot.x, y: this.goldenSpot.y });
        this.goldenDone = true;
      }
    }
  }

  private _dt = 1 / 60;
  private lastDt() {
    return this._dt;
  }

  zoneState(i: number): 'off' | 'warn' | 'on' {
    if (this.phase !== 'play') return 'off';
    let s: 'off' | 'warn' | 'on' = 'off';
    for (const ev of this.zoneEvents) {
      if (ev.zone !== i) continue;
      if (this.roundT >= ev.activeAt && this.roundT < ev.endAt) return 'on';
      if (this.roundT >= ev.warnAt && this.roundT < ev.activeAt) s = 'warn';
    }
    return s;
  }

  // ------------------------------------------------------------------ jogador
  private updatePlayer(p: Player, inp: Input, dt: number) {
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.abilCd = Math.max(0, p.abilCd - dt);
    p.turboT = Math.max(0, p.turboT - dt);
    p.phaseT = Math.max(0, p.phaseT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.portalCd = Math.max(0, p.portalCd - dt);
    if (this.mode === 'duelo' || this.mode === 'dupla') {
      p.burnT = Math.max(0, p.burnT - dt);
      p.frozenT = Math.max(0, p.frozenT - dt);
      p.ruptureT = Math.max(0, (p.ruptureT ?? 0) - dt);
      p.avatarT = Math.max(0, (p.avatarT ?? 0) - dt);
      p.gustT = Math.max(0, p.gustT - dt);
      p.shockT = Math.max(0, p.shockT - dt);
      for (let i = 0; i < 4; i++) p.powerCd[i] = Math.max(0, p.powerCd[i] - dt);
      p.plasmaCd = Math.max(0, p.plasmaCd - dt);
      p.plasmaT = Math.max(0, p.plasmaT - dt);
      p.plasmaPrimeT = Math.max(0, p.plasmaPrimeT - dt);
      p.comboT = Math.max(0, p.comboT - dt);
      p.markedT = Math.max(0, p.markedT - dt);
      p.fieldT = Math.max(0, p.fieldT - dt);
      if (p.fieldT <= 0) p.fieldEl = '';
      p.reactCd = Math.max(0, p.reactCd - dt);
      p.ctrlT = Math.max(0, p.ctrlT - dt);
      p.iceT = Math.max(0, p.iceT - dt);
      p.basicCd = Math.max(0, p.basicCd - dt);
      p.rootT = Math.max(0, p.rootT - dt);
      p.rootResistT = Math.max(0, p.rootResistT - dt);
      p.flowT = Math.max(0, p.flowT - dt);
      p.ambushT = Math.max(0, p.ambushT - dt);
      p.healT = Math.max(0, p.healT - dt);
      if (p.alive) p.energy = clampEnergy(p.energy + ENERGY_REGEN * dt);
      if (p.burnT > 0 && p.alive) {
        p.burnAcc += dt;
        while (p.burnAcc >= BURN_TICK && p.alive) {
          p.burnAcc -= BURN_TICK;
          this.hurt(p, p.burnDps, p.burnFrom || null, 'pulse');
        }
      } else p.burnAcc = 0;
    }
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.vampT = Math.max(0, p.vampT - dt);
    p.cloakT = Math.max(0, p.cloakT - dt);
    p.pullT = Math.max(0, p.pullT - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.dodgeT = Math.max(0, p.dodgeT - dt);
    p.markT = Math.max(0, p.markT - dt);
    p.overT = Math.max(0, p.overT - dt);
    p.ccResistT = Math.max(0, p.ccResistT - dt);
    p.stasisT = Math.max(0, p.stasisT - dt);
    p.castT = Math.max(0, p.castT - dt);
    p.exhaustT = Math.max(0, p.exhaustT - dt);
    if (p.boss) for (const k in p.bossCd) p.bossCd[k as BossSkill] = Math.max(0, p.bossCd[k as BossSkill] - dt);
    if (this.combat && !p.boss) p.ultCharge = Math.min(100, p.ultCharge + COMBAT.ult.perSecond * dt);
    // recuperação lenta depois de alguns segundos sem levar dano
    if (this.combat && !p.boss && p.hp < p.maxHp && this.roundT - p.lastHurtAt >= COMBAT.regen.delay) p.hp = Math.min(p.maxHp, p.hp + COMBAT.regen.perSecond * dt);
    const tms = this.roundT * 1000;

    let mx = inp.mx;
    let my = inp.my;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    if (p.stunT > 0 || p.rootT > 0) {
      mx = 0;
      my = 0;
    }
    const moving = Math.hypot(mx, my) > 0.12;
    // durante impulso/esquiva/investida a direção fica travada
    if (moving && p.dashT <= 0 && p.chargeT <= 0) p.dir = Math.atan2(my, mx);
    if (this.combat) p.aim = typeof inp.aim === 'number' && isFinite(inp.aim) ? inp.aim : this.autoAim(p);
    // direção das habilidades: a mira escolhida; senão para onde anda; senão a mira automática
    const castAng = resolveCastAngle({ ca: inp.ca, aim: inp.aim, mx, my, dir: p.dir, bot: p.isBot });
    if (p.pendingCast && (p.stunT > 0 || !p.alive)) {
      p.pendingCast = null;
      p.castT = 0;
      abilityTrace(p.id, 'windup-cancel', 'interrupted');
      this.events.push({ type: 'deny', pid: p.id, msg: 'Conjuração interrompida', x: p.x, y: p.y });
    } else if (p.pendingCast && this.roundT >= p.pendingCast.at) {
      const c = p.pendingCast;
      p.pendingCast = null;
      p.castT = 0;
      this.castPower(p, c.slot, c.ang, { mx: 0, my: 0, dash: false, ability: false, ca: c.ca, cr: c.cr, ch: c.ch });
    }
    const free = p.stunT <= 0 && p.castT <= 0;

    if (inp.dash && p.dashCd <= 0 && free && p.stasisT <= 0 && p.rootT <= 0) {
        if (!p.isBot && typeof inp.ca === 'number' && isFinite(inp.ca)) p.dir = inp.ca;
        const full = C.DASH_SPEED * C.DASH_TIME;
        const aimedDash = !p.isBot && typeof inp.cr === 'number';
        p.dashT = (aimedDash ? Math.max(16, Math.min(full, inp.cr as number)) : full) / C.DASH_SPEED;
        p.dashCd = C.DASH_CD;
        p.dashHit = [];
        if (this.mode === 'duelo' || this.mode === 'dupla') p.flowT = Math.max(p.flowT, FLOW_TIME);
        p.recorder?.event(tms, 'dash');
        this.events.push({ type: 'dash', x: p.x, y: p.y, pid: p.id });
      }
      if (free && p.alive) {
        if (inp.ability) this.beginPower(p, 0, castAng, inp);
        if (inp.skill) this.beginPower(p, 1, castAng, inp);
        if (inp.ult) this.beginPower(p, 2, castAng, inp);
        if (inp.bonus || inp.item) this.beginPower(p, 3, castAng, inp);
        if (inp.plasma) this.castPlasma(p, castAng, inp);
        if ((this.mode === 'duelo' || this.mode === 'dupla') && inp.fire) this.castBasic(p, castAng);
      }

    const inBush = (this.arena.bushes ?? []).some((b) => dist(p.x, p.y, b.x, b.y) < b.r);
    const sand = (this.arena.sand ?? []).find((c) => dist(p.x, p.y, c.x, c.y) < c.r);
    const onIce = (this.arena.ice ?? []).some((r) => inRect(p.x, p.y, r));
    const tune = tuneMove(this.arena, p.x, p.y, this.worldT);
    const hold = this.tuneHold.get(p.id);
    const holdSpeed = hold && this.worldT < hold.until ? hold.speed : 1;
    const carrying = this.flags.some((f) => f.carrier === p.id);
    p.hidden = inBush || p.phaseT > 0 || p.cloakT > 0;
    // lentidões não se multiplicam sem limite: a mais forte vale, e há uma velocidade mínima
    const slowK = Math.min(p.slowT > 0 ? 0.6 : 1, p.stasisT > 0 ? 0.35 : 1, sand ? 0.55 : 1, p.castT > 0 ? COMBAT.castMove : 1) * (inBush ? 0.92 : 1) * (carrying ? 0.92 : 1);
    let speed = C.SPEED * COMBAT.walkMul * (p.turboT > 0 ? 1.45 : 1) * (p.overT > 0 ? 1.15 : 1) * Math.max(COMBAT.minSpeed, slowK) * (p.boss ? BOSS.speedMul * (p.exhaustT > 0 ? 0.5 : 1) : 1);
    if (this.mode === 'duelo' || this.mode === 'dupla') speed *= speedMul(p.char.id, p.comboStacks);
    if (p.isBot) speed *= p.brain!.speedMul;
    speed *= tune.speed * holdSpeed;

    if (p.chargeT > 0) {
      // investida: avança reto e derruba quem estiver na frente
      p.chargeT -= dt;
      p.vx = Math.cos(p.dir) * (p.boss ? 740 : 820);
      p.vy = Math.sin(p.dir) * (p.boss ? 740 : 820);
      this.chargeHits(p);
    } else if (p.pullT > 0) {
      // gancho: puxado até o ponto
      const d = dist(p.x, p.y, p.pullX, p.pullY);
      if (d < 22) {
        p.pullT = 0;
        p.vx *= 0.2;
        p.vy *= 0.2;
      } else {
        p.vx = ((p.pullX - p.x) / d) * 1000;
        p.vy = ((p.pullY - p.y) / d) * 1000;
      }
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = Math.cos(p.dir) * C.DASH_SPEED;
      p.vy = Math.sin(p.dir) * C.DASH_SPEED;
      if (p.dashDmg > 0 && p.dashEl) this.dashTouch(p);
      if (p.dashT <= 0) {
        p.dashDmg = 0;
        p.dashEl = null;
      }
    } else {
      const grip = onIce ? 0.12 : this.arena.grip * tune.grip;
      const k = 1 - Math.exp(-12 * grip * dt);
      p.vx += (mx * speed - p.vx) * k;
      p.vy += (my * speed - p.vy) * k;
    }
    // areia movediça puxa para o meio
    if (sand) {
      const d = dist(p.x, p.y, sand.x, sand.y);
      if (d > 4) {
        p.x += ((sand.x - p.x) / d) * 55 * dt;
        p.y += ((sand.y - p.y) / d) * 55 * dt;
      }
    }
    // rajada de vento
    if (this.arena.wind) {
      const w = windState(this.arena.wind, this.worldT);
      if (w.phase === 'blow') p.x += w.dir * this.arena.wind.force * dt;
    }
    // vórtice puxa rivais
    for (const v of this.vortexes) {
      const owner = this.players.find((o) => o.id === v.owner);
      if (owner && !this.hostile(owner, p)) continue;
      const d = dist(p.x, p.y, v.x, v.y);
      if (d < v.r && d > 1 && p.phaseT <= 0) {
        const f = 650 * (1 - d / v.r) * dt * (p.boss ? 0.2 : 1);
        p.vx += ((v.x - p.x) / d) * f;
        p.vy += ((v.y - p.y) / d) * f;
      }
    }
    // poços de gravidade
    for (const w of this.arena.wells ?? []) {
      const d = dist(p.x, p.y, w.x, w.y);
      if (d < w.range && d > 1) {
        const f = w.pull * (1 - d / w.range) * dt;
        p.vx += ((w.x - p.x) / d) * f;
        p.vy += ((w.y - p.y) / d) * f;
      }
    }
    this.integrate(p, dt);
    // esteiras
    for (const cv of this.arena.conveyors ?? []) {
      if (inRect(p.x, p.y, cv)) {
        p.x += cv.vx * dt;
        p.y += cv.vy * dt;
      }
    }
    p.x += tune.vx * dt;
    p.y += tune.vy * dt;
    this.applyTunePulse(p);
    this.collideWorld(p);
    const body = tuneBody(this.arena, p.x, p.y, C.PLAYER_R, this.worldT);
    p.x = body.x;
    p.y = body.y;
    // o Chefe é alto: não encosta na parede de cima (o corpo ficaria fora da arena)
    p.moving = moving || p.dashT > 0;
    const stride = Math.hypot(p.vx, p.vy);
    if (stride > 12) p.walkPhase += dt * Math.max(5, Math.min(16, stride * 0.04));

    this.usePortal(p);
    this.rescue(p);
    this.noteSafe(p);

    // queda (ilhas)
    if (this.arena.islands && !isGround(this.arena, p.x, p.y, this.worldT)) {
      this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: 'fall' });
      this.respawn(p);
      if (p.invulnT <= 0 && p.phaseT <= 0) this.damage(p, 'fall', true);
    }
  }

  /** portal: uma transição, saída segura, vida intacta, recarga contra loop */
  private usePortal(p: Player) {
    if (p.portalCd > 0) return;
    const hit = portalPairAt(this.arena.portals, p.x, p.y);
    if (!hit) return;
    const hp = p.hp;
    const hearts = p.hearts;
    const shield = p.shieldHp;
    const dir = Math.hypot(p.vx, p.vy) > 30 ? Math.atan2(p.vy, p.vx) : p.dir;
    const zoneOn = (i: number) => this.zoneState(i) === 'on';
    const free = (x: number, y: number) => this.isFree(x, y, C.PLAYER_R);
    let exit = choosePortalExit(this.arena, hit.to, dir, this.worldT, zoneOn, free);
    p.recorder?.markJump();
    p.x = exit.x;
    p.y = exit.y;
    p.vx *= 0.25;
    p.vy *= 0.25;
    this.collideWorld(p);
    if (!this.isFree(p.x, p.y, C.PLAYER_R * 0.8) || portalPairAt(this.arena.portals, p.x, p.y)) {
      exit = choosePortalExit(this.arena, hit.to, dir + Math.PI / 2, this.worldT, zoneOn, free);
      p.x = exit.x;
      p.y = exit.y;
      this.collideWorld(p);
    }
    p.portalCd = C.PORTAL_CD;
    p.hp = hp;
    p.hearts = hearts;
    p.shieldHp = shield;
    this.safePos.set(p.id, { x: p.x, y: p.y });
    this.events.push({ type: 'portal', x: p.x, y: p.y, pid: p.id });
  }

  private noteSafe(p: Player) {
    if (this.isFree(p.x, p.y, C.PLAYER_R)) this.safePos.set(p.id, { x: p.x, y: p.y });
  }

  /** centro dentro de parede/pilar: volta à última posição válida, senão ao vão livre mais perto */
  private rescue(p: { id?: string; x: number; y: number; vx?: number; vy?: number }) {
    if (this.isFree(p.x, p.y, 4)) return;
    const saved = p.id ? this.safePos.get(p.id) : undefined;
    if (saved && this.isFree(saved.x, saved.y, C.PLAYER_R)) {
      p.x = saved.x;
      p.y = saved.y;
      if (p.vx !== undefined) p.vx = 0;
      if (p.vy !== undefined) p.vy = 0;
      return;
    }
    for (let r = 12; r <= 96; r += 12) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        if (!this.isFree(x, y, C.PLAYER_R)) continue;
        p.x = x;
        p.y = y;
        if (p.vx !== undefined) p.vx = 0;
        if (p.vy !== undefined) p.vy = 0;
        if (p.id) this.safePos.set(p.id, { x, y });
        return;
      }
    }
  }

  private respawn(p: Player) {
    let best = this.arena.spawns[0];
    let bd = Infinity;
    for (const s of this.arena.spawns) {
      const d = dist(s.x, s.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    p.recorder?.markJump();
    p.x = best.x;
    p.y = best.y;
    p.vx = p.vy = 0;
    p.dashT = 0;
  }

  /** volta ao jogo depois de cair (modos com renascer) */
  private revive(p: Player) {
    const sp = p.team >= 0 ? this.teamSpawn(p.team, Math.floor(Math.random() * 3)) : this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)];
    p.recorder?.markJump();
    Object.assign(p, { x: sp.x, y: sp.y, vx: 0, vy: 0, alive: true, hp: p.maxHp, shieldHp: 0, invulnT: 1 + COMBAT.spawnProtect, stunT: 0, slowT: 0, pullT: 0, chargeT: 0, castT: 0, markT: 0, dodgeT: 0 });
    this.clearMarks(p);
    // arma volta para a do equipamento; itens NÃO recarregam ao renascer (evita abuso)
    p.weapon = this.primaryFor(p);
    p.weaponT = 0;
    p.ammo = 0;
    this.events.push({ type: 'respawn', x: p.x, y: p.y, pid: p.id });
  }

  /** arma principal do jogador conforme o equipamento */
  primaryFor(p: Player): WeaponId {
    return p.boss ? 'colosso' : loadoutPrimary(p.char.id, p.loadout.primary);
  }

  /** aplica o equipamento no começo da rodada */
  private equip(p: Player) {
    p.weapon = this.primaryFor(p);
    p.weaponT = 0;
    p.ammo = 0;
    // X1 e 2x2 não usam granada nem item de arma.
    p.item = null;
    p.itemN = 0;
  }

  /** atordoamento com limite e imunidade logo depois (sempre há chance de reagir) */
  stun(p: Player, t: number) {
    if (t <= 0 || p.ccResistT > 0 || p.dodgeT > 0) return;
    if (p.boss) t *= BOSS.stunMult;
    t = Math.min(COMBAT.maxStun, t);
    if (t < 0.05) return;
    p.stunT = Math.max(p.stunT, t);
    p.castT = 0;
    if (p.pendingCast) {
      p.pendingCast = null;
      abilityTrace(p.id, 'windup-cancel', 'stun');
      this.events.push({ type: 'deny', pid: p.id, msg: 'Conjuração interrompida', x: p.x, y: p.y });
    }
    p.ccResistT = p.stunT + COMBAT.ccResist;
    p.ctrlT = Math.max(p.ctrlT, p.stunT + CONTROL_GRACE);
    this.events.push({ type: 'stunned', x: p.x, y: p.y, pid: p.id });
  }
  private slow(p: Player, t: number) {
    p.slowT = Math.max(p.slowT, p.boss ? t * BOSS.slowMult : t);
  }
  private knock(p: Player, vx: number, vy: number) {
    const k = p.boss ? BOSS.knockMult : 1;
    p.vx += vx * k;
    p.vy += vy * k;
  }
  private use(p: Player, key: string) {
    p.stats.uses[key] = (p.stats.uses[key] ?? 0) + 1;
  }

  /** ponto mirado (habilidades de área): mira escolhida ou o rival mais perto dentro do alcance */
  private castPoint(p: Player, inp: Input | undefined, ang: number, range: number) {
    let d = inp && typeof inp.cr === 'number' && isFinite(inp.cr) ? Math.max(0, Math.min(range, inp.cr)) : -1;
    if (d < 0) {
      let best: { x: number; y: number } | null = null;
      let bd = range;
      for (const t of this.targetsOf(p)) {
        const td = dist(t.x, t.y, p.x, p.y);
        if (td < bd) {
          bd = td;
          best = t;
        }
      }
      if (best && !(inp && typeof inp.ca === 'number')) return { x: best.x, y: best.y, ang: Math.atan2(best.y - p.y, best.x - p.x) };
      d = range * 0.7;
    }
    const x = Math.max(BORDER + 10, Math.min(WORLD_W - BORDER - 10, p.x + Math.cos(ang) * d));
    const y = Math.max(BORDER + 10, Math.min(WORLD_H - BORDER - 10, p.y + Math.sin(ang) * d));
    return { x, y, ang };
  }

  private useAbility(p: Player, ang: number, inp?: Input, extra?: ReturnType<typeof abilityDef>) {
    const ab = extra ?? p.char.ability;
    const bal = ABILITY_BAL[ab.id];
    const tms = this.roundT * 1000;
    if (!extra) p.abilCd = ab.cooldown;
    p.recorder?.event(tms, 'ability');
    this.use(p, ab.name);
    const mult = this.pow(p);
    switch (ab.id) {
      case 'turbo':
        p.turboT = ab.duration;
        break;
      case 'fase':
        p.phaseT = ab.duration;
        break;
      case 'escudo':
        p.shieldT = ab.duration;
        break;
      case 'teleporte': {
        for (let d = bal.range ?? 190; d >= 30; d -= 10) {
          const nx = p.x + Math.cos(ang) * d;
          const ny = p.y + Math.sin(ang) * d;
          if (this.isFree(nx, ny, C.PLAYER_R) && isGround(this.arena, nx, ny, this.worldT, true)) {
            this.events.push({ type: 'ability', x: p.x, y: p.y, pid: p.id, ability: ab.id });
            p.recorder?.markJump();
            p.x = nx;
            p.y = ny;
            break;
          }
        }
        // chegada com impacto: quem estiver perto leva dano
        if (this.combat) this.landStrike(p, bal.radius ?? 70, bal.damage ?? 16);
        p.invulnT = Math.max(p.invulnT, 0.35);
        this.events.push({ type: 'portal', x: p.x, y: p.y, pid: p.id });
        return;
      }
      case 'explosao': {
        const R = bal.radius ?? 165;
        for (const o of this.players) {
          if (o === p || !o.alive || !o.playing) continue;
          if (this.combat && !this.hostile(p, o)) continue;
          const d = dist(o.x, o.y, p.x, p.y);
          if (d < R) {
            const k = (1 - d / R) * 650 + 250;
            const nx = (o.x - p.x) / (d || 1);
            const ny = (o.y - p.y) / (d || 1);
            this.knock(o, nx * k, ny * k);
            if (this.combat) this.stun(o, bal.stun ?? 0.25);
            else o.stunT = Math.max(o.stunT, 0.25);
            if (o.carry > 0 && o.phaseT <= 0 && o.shieldT <= 0) {
              o.carry--;
              this.dropFragment(o.x, o.y, 1);
            }
          }
        }
        for (const e of this.echoViews) {
          if (e.active && !e.disrupted && dist(e.x, e.y, p.x, p.y) < R) this.disrupt(e, p);
        }
        if (this.combat) {
          for (const o of this.players) if (o !== p && o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, p.x, p.y) < R) this.hurt(o, (bal.damage ?? 24) * mult, p.id, 'pulse');
          for (const e of this.enemies) if (this.enemyHostileTo(p) && dist(e.x, e.y, p.x, p.y) < R) this.hurtEnemy(e, 34 * mult, p.id);
          this.events.push({ type: 'explode', x: p.x, y: p.y, r: R });
        }
        break;
      }
      case 'clone':
        if (this.combat) this.placeTurret(p, p.x, p.y, ab.duration, true);
        else this.clones.push({ owner: p.id, x: p.x, y: p.y, dir: p.dir, t: ab.duration });
        break;
      case 'torreta':
        this.placeTurret(p, p.x + Math.cos(ang) * 26, p.y + Math.sin(ang) * 26, ab.duration);
        break;
      case 'cura':
        if (this.combat) {
          this.heal(p, p, (bal.damage ?? 30) * mult);
          // cura também os aliados por perto
          for (const o of this.players) if (o !== p && o.alive && o.playing && !this.hostile(p, o) && dist(o.x, o.y, p.x, p.y) < (bal.radius ?? 170)) this.heal(p, o, 25 * mult);
        } else {
          p.hearts = Math.min(C.HEARTS, p.hearts + 1);
          p.invulnT = Math.max(p.invulnT, 1);
        }
        this.events.push({ type: 'heal', x: p.x, y: p.y, pid: p.id });
        break;
      case 'investida':
        p.chargeT = ab.duration;
        p.chargeHit = [];
        p.chargeDmg = (bal.damage ?? 22) * mult;
        p.dir = ang;
        break;
      case 'muralha': {
        const cx = p.x + Math.cos(ang) * (bal.range ?? 62);
        const cy = p.y + Math.sin(ang) * (bal.range ?? 62);
        this.raiseWall(p.id, cx, cy, ang, 140, 24, ab.duration, 'gelo');
        break;
      }
      case 'raio':
        this.chainLightning(p);
        break;
      case 'gravidade': {
        const pt = this.combat ? this.castPoint(p, inp, ang, bal.range ?? 260) : { x: p.x + Math.cos(ang) * 160, y: p.y + Math.sin(ang) * 160 };
        let vx = p.x;
        let vy = p.y;
        // não abre dentro de parede: recua até achar espaço
        for (let k = 1; k >= 0; k -= 0.1) {
          const x = p.x + (pt.x - p.x) * k;
          const y = p.y + (pt.y - p.y) * k;
          if (this.isFree(x, y, 10)) {
            vx = x;
            vy = y;
            break;
          }
        }
        this.vortexes.push({ id: this.fragId++, owner: p.id, x: vx, y: vy, t: ab.duration, r: bal.radius ?? 175 });
        break;
      }
      case 'gancho': {
        const sp = 1150;
        this.hooks.push({ id: this.fragId++, owner: p.id, x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: (bal.range ?? 370) / sp, state: 'fly' });
        break;
      }
      case 'fumaca':
        this.smokes.push({ id: this.fragId++, owner: p.id, x: p.x, y: p.y, t: ab.duration, r: bal.radius ?? 125 });
        break;
      case 'sombra': {
        for (let d = bal.range ?? 150; d >= 30; d -= 10) {
          const nx = p.x + Math.cos(ang) * d;
          const ny = p.y + Math.sin(ang) * d;
          if (this.isFree(nx, ny, C.PLAYER_R) && isGround(this.arena, nx, ny, this.worldT, true)) {
            p.recorder?.markJump();
            p.x = nx;
            p.y = ny;
            break;
          }
        }
        p.phaseT = ab.duration;
        if (this.combat) this.landStrike(p, bal.radius ?? 75, bal.damage ?? 18);
        break;
      }
    }
    this.events.push({ type: 'ability', x: p.x, y: p.y, pid: p.id, ability: ab.id });
  }

  /** parede temporária perpendicular à direção (muralha, barreira, obsidiana) */
  private raiseWall(owner: string, cx: number, cy: number, ang: number, long: number, thick: number, t: number, kind: 'gelo' | 'barreira' | 'obsidiana') {
    const vertical = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
    const w = vertical ? thick : long;
    const h = vertical ? long : thick;
    this.iceWalls.push({ id: this.fragId++, owner, kind, x: cx - w / 2, y: cy - h / 2, w, h, t });
    for (const o of this.players) if (o.alive) this.collideWorld(o);
  }

  private placeTurret(p: Player, x: number, y: number, t: number, fromClone = false) {
    // no máximo uma torreta por jogador: a antiga some
    const mine = this.turrets.filter((q) => q.owner === p.id);
    if (mine.length >= COMBAT.turret.maxPerOwner) this.turrets = this.turrets.filter((q) => q !== mine[0]);
    this.turrets.push({ id: this.fragId++, owner: p.id, hp: COMBAT.turret.hp, x, y, t, cd: 0.3, aim: p.aim, fromClone });
  }

  /** cura com teto na vida máxima (conta para estatísticas e mostra número) */
  heal(by: Player | null, o: Player, n: number) {
    if (!o.alive || n <= 0) return;
    const real = Math.min(n, o.maxHp - o.hp);
    if (real <= 0) return;
    o.hp += real;
    if (by) by.stats.heal += real;
    this.events.push({ type: 'dmg', pid: o.id, x: o.x, y: o.y, n: Math.round(real), k: 'heal' });
  }

  /** golpe ao aparecer (teleporte / passo sombrio) */
  private landStrike(p: Player, r: number, dmg: number) {
    for (const o of this.players) if (o !== p && o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, p.x, p.y) < r + (o.boss ? BOSS.hitR - C.PLAYER_R : 0)) this.hurt(o, dmg * this.pow(p), p.id, 'pulse');
    if (this.enemyHostileTo(p)) for (const e of this.enemies) if (dist(e.x, e.y, p.x, p.y) < r + ENEMY_STATS[e.kind].r) this.hurtEnemy(e, dmg * 1.4 * this.pow(p), p.id);
  }

  /** investida acerta quem estiver no caminho */
  private chargeHits(p: Player) {
    const reach = C.PLAYER_R * 2 + 8 + (p.boss ? BOSS.hitR - C.PLAYER_R : 0);
    for (const o of this.players) {
      if (!o.alive || !o.playing || !this.hostile(p, o) || p.chargeHit.includes(o.id) || o.phaseT > 0) continue;
      if (dist(o.x, o.y, p.x, p.y) > reach + (o.boss ? BOSS.hitR - C.PLAYER_R : 0)) continue;
      p.chargeHit.push(o.id);
      const side = (o.x - p.x) * -Math.sin(p.dir) + (o.y - p.y) * Math.cos(p.dir) > 0 ? 1 : -1;
      this.knock(o, Math.cos(p.dir) * 520 - Math.sin(p.dir) * side * 380, Math.sin(p.dir) * 520 + Math.cos(p.dir) * side * 380);
      if (this.combat) {
        this.stun(o, p.boss ? 0.4 : ABILITY_BAL.investida.stun ?? 0.5);
        this.hurt(o, p.chargeDmg || 22, p.id, 'pulse');
      } else {
        o.stunT = Math.max(o.stunT, 0.9);
        if (o.carry > 0 && o.shieldT <= 0) {
          o.carry--;
          this.dropFragment(o.x, o.y, 1);
        }
      }
      this.events.push({ type: 'hit', x: o.x, y: o.y, pid: o.id, by: 'pulse' });
    }
    if (this.enemyHostileTo(p))
      for (const e of this.enemies) {
        if (p.chargeHit.includes('e' + e.id) || dist(e.x, e.y, p.x, p.y) > reach + ENEMY_STATS[e.kind].r - C.PLAYER_R) continue;
        p.chargeHit.push('e' + e.id);
        e.stunT = 1;
        if (e.kind !== 'boss' && e.kind !== 'pylon') {
          e.vx += Math.cos(p.dir) * 600;
          e.vy += Math.sin(p.dir) * 600;
        }
        this.hurtEnemy(e, 35, p.id);
      }
    for (const ev of this.echoViews) if (ev.active && !ev.disrupted && dist(ev.x, ev.y, p.x, p.y) < reach) this.disrupt(ev, p);
  }

  /** raio que pula de alvo em alvo */
  private chainLightning(p: Player) {
    const pts = [p.x, p.y - 26];
    let cx = p.x;
    let cy = p.y;
    const hit = new Set<object>();
    const d0 = ABILITY_BAL.raio.damage ?? 26;
    const dmg = [d0, d0 * 0.7, d0 * 0.45].map((n) => n * this.pow(p));
    for (let k = 0; k < 3; k++) {
      const range = k === 0 ? ABILITY_BAL.raio.range ?? 310 : 230;
      let best: { x: number; y: number; player?: Player; enemy?: Enemy } | null = null;
      let bd = range;
      for (const t of this.targetsOf(p)) {
        const ref = t.player ?? t.enemy!;
        if (hit.has(ref)) continue;
        const d = dist(t.x, t.y, cx, cy);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) break;
      hit.add(best.player ?? best.enemy!);
      pts.push(best.x, best.y - 26);
      cx = best.x;
      cy = best.y;
      if (best.player) {
        const o = best.player;
        if (this.combat) {
          // só o primeiro alvo fica atordoado; os outros ficam lentos
          if (k === 0) this.stun(o, ABILITY_BAL.raio.stun ?? 0.5);
          else this.slow(o, 0.8);
          this.hurt(o, dmg[k], p.id, 'pulse');
        } else {
          o.stunT = Math.max(o.stunT, 0.9);
          if (o.carry > 0 && o.shieldT <= 0) {
            o.carry--;
            this.dropFragment(o.x, o.y, 1);
          }
          o.hitFlash = 0.3;
        }
      } else if (best.enemy) {
        best.enemy.stunT = 1.2;
        this.hurtEnemy(best.enemy, dmg[k] * 1.5, p.id);
      }
    }
    this.events.push({ type: 'zap', pid: p.id, pts });
  }

  /** vórtices, fumaça, ganchos e muros de gelo */
  private updateAbilities(dt: number) {
    for (const w of this.iceWalls) w.t -= dt;
    this.iceWalls = this.iceWalls.filter((w) => w.t > 0);
    for (const v of this.vortexes) {
      v.t -= dt;
      // puxa energia solta também
      for (const f of this.fragments) {
        const d = dist(f.x, f.y, v.x, v.y);
        if (d < v.r && d > 4 && !f.golden) {
          f.x += ((v.x - f.x) / d) * 240 * dt;
          f.y += ((v.y - f.y) / d) * 240 * dt;
        }
      }
      if (v.t <= 0 && this.combat) this.explode(v.x, v.y, 95, 20, v.owner, false);
    }
    this.vortexes = this.vortexes.filter((v) => v.t > 0);
    for (const sm of this.smokes) {
      sm.t -= dt;
      const owner = this.players.find((o) => o.id === sm.owner);
      for (const o of this.players) {
        if (!o.alive || dist(o.x, o.y, sm.x, sm.y) > sm.r) continue;
        o.cloakT = Math.max(o.cloakT, 0.15);
        if (owner && this.hostile(owner, o)) o.slowT = Math.max(o.slowT, 0.2);
      }
      for (const e of this.enemies) if (dist(e.x, e.y, sm.x, sm.y) < sm.r) e.slowT = Math.max(e.slowT, 0.2);
    }
    this.smokes = this.smokes.filter((sm) => sm.t > 0);
    for (const h of this.hooks) {
      const owner = this.players.find((o) => o.id === h.owner);
      if (!owner || !owner.alive) {
        h.t = 0;
        continue;
      }
      h.t -= dt;
      const steps = 4;
      for (let i = 0; i < steps && h.t > 0; i++) {
        h.x += (h.vx * dt) / steps;
        h.y += (h.vy * dt) / steps;
        if (!this.isFree(h.x, h.y, 4)) {
          // prendeu na parede: puxa o dono
          owner.pullT = 0.55;
          owner.pullX = h.x - (h.vx / 1150) * 24;
          owner.pullY = h.y - (h.vy / 1150) * 24;
          owner.recorder?.markJump();
          h.t = 0;
          break;
        }
        const victim = this.players.find((o) => o.alive && o.playing && this.hostile(owner, o) && o.phaseT <= 0 && o.dodgeT <= 0 && dist(o.x, o.y, h.x, h.y) < this.hitR(o) + 8);
        if (victim) {
          if (victim.boss) {
            // o Chefe é pesado demais: o gancho puxa você até ele
            owner.pullT = 0.5;
            owner.pullX = victim.x - (h.vx / 1150) * (BOSS.hitR + 20);
            owner.pullY = victim.y - (h.vy / 1150) * (BOSS.hitR + 20);
            owner.recorder?.markJump();
          } else {
            victim.pullT = 0.4;
            victim.pullX = owner.x + Math.cos(owner.dir) * 34;
            victim.pullY = owner.y + Math.sin(owner.dir) * 34;
            victim.recorder?.markJump();
          }
          if (this.combat) this.stun(victim, ABILITY_BAL.gancho.stun ?? 0.4);
          else victim.stunT = Math.max(victim.stunT, 0.5);
          if (this.combat) this.hurt(victim, ABILITY_BAL.gancho.damage ?? 10, owner.id, 'pulse');
          else if (victim.carry > 0 && victim.shieldT <= 0) {
            victim.carry--;
            this.dropFragment(victim.x, victim.y, 1);
          }
          this.events.push({ type: 'hit', x: victim.x, y: victim.y, pid: victim.id, by: 'pulse' });
          h.t = 0;
          break;
        }
        const en = this.enemyHostileTo(owner) ? this.enemies.find((e) => dist(e.x, e.y, h.x, h.y) < ENEMY_STATS[e.kind].r + 6) : undefined;
        if (en) {
          if (en.kind !== 'boss' && en.kind !== 'pylon') {
            const d = dist(en.x, en.y, owner.x, owner.y) || 1;
            en.vx = ((owner.x - en.x) / d) * 750;
            en.vy = ((owner.y - en.y) / d) * 750;
          }
          en.stunT = 0.7;
          this.hurtEnemy(en, 15, owner.id);
          h.t = 0;
          break;
        }
      }
    }
    this.hooks = this.hooks.filter((h) => h.t > 0);
  }

  /** força da habilidade conforme o nível */
  private pow(p: Player) {
    return levelMult(p.char.abilityLv ?? 1, false).power;
  }

  /** raio do corpo para acertos */
  hitR(p: Player) {
    return p.boss ? BOSS.hitR : C.PLAYER_R;
  }

  /** cápsula dos pés até a cabeça: o tiro acerta o desenho, não só a cintura */
  bodyHit(o: Player, x: number, y: number, pad = 6): boolean {
    const r = this.hitR(o) + pad;
    const foot = o.y - 4;
    const head = o.y - (o.boss ? 86 : 72);
    const cy = Math.max(head, Math.min(foot, y));
    return dist(o.x, cy, x, y) <= r;
  }

  /** inimigos do mapa (robôs) são alvos deste jogador? */
  enemyHostileTo(_p: { team: number }) {
    return true;
  }

  /** escudo do Bronzar: devolve o tiro que vem da frente (nunca mais forte e só uma vez) */
  private reflect(o: Player, b: Bullet): boolean {
    if (b.owner === o.id || b.hit.includes(o.id) || b.refl) return false;
    // tiro vindo da frente? (direção contrária à mira do escudo)
    const inc = Math.atan2(-b.vy, -b.vx);
    let diff = Math.abs(inc - o.aim) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > COMBAT.shieldArc / 2) return false;
    const shooter = this.players.find((q) => q.id === b.owner);
    const sp = Math.hypot(b.vx, b.vy);
    const ang = shooter && shooter.alive ? Math.atan2(shooter.y - GUN_Y - b.y, shooter.x - b.x) : Math.atan2(-b.vy, -b.vx);
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
    b.owner = o.id;
    b.fromEcho = false;
    b.hit = [o.id];
    b.life = Math.max(b.life, 0.5);
    b.dmg *= COMBAT.reflectMult;
    b.refl = true;
    this.events.push({ type: 'reflect', x: b.x, y: b.y + GUN_Y, pid: o.id });
    return true;
  }

  isFree(x: number, y: number, r: number): boolean {
    if (x < BORDER + r || x > WORLD_W - BORDER - r || y < BORDER + r || y > WORLD_H - BORDER - r) return false;
    for (const w of this.arena.walls) if (circleRect(x, y, r, w)) return false;
    for (const w of this.iceWalls ?? []) if (circleRect(x, y, r, w)) return false;
    for (const c of this.arena.pillars) if (dist(x, y, c.x, c.y) < c.r + r) return false;
    return true;
  }

  collideWorld(p: { x: number; y: number; vx?: number; vy?: number }, r = C.PLAYER_R) {
    const walls = this.iceWalls?.length ? [...this.arena.walls, ...this.iceWalls] : this.arena.walls;
    for (let iter = 0; iter < 4; iter++) {
      for (const w of walls) {
        const cx = Math.max(w.x, Math.min(p.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
        let dx = p.x - cx;
        let dy = p.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < r) {
          if (d < 0.001) {
            // centro dentro do retângulo: empurra pelo lado mais próximo e desliza
            const opts = [
              [p.x - w.x, -1, 0],
              [w.x + w.w - p.x, 1, 0],
              [p.y - w.y, 0, -1],
              [w.y + w.h - p.y, 0, 1],
            ];
            opts.sort((a, b) => a[0] - b[0]);
            dx = opts[0][1];
            dy = opts[0][2];
            p.x += dx * (opts[0][0] + r);
            p.y += dy * (opts[0][0] + r);
            slideVelocity(p, dx, dy);
          } else {
            const nx = dx / d;
            const ny = dy / d;
            p.x = cx + nx * r;
            p.y = cy + ny * r;
            slideVelocity(p, nx, ny);
          }
        }
      }
      for (const c of this.arena.pillars) {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        const m = c.r + r;
        if (d < m && d > 0.001) {
          p.x = c.x + (dx / d) * m;
          p.y = c.y + (dy / d) * m;
        }
      }
    }
    const minX = BORDER + r;
    const maxX = WORLD_W - BORDER - r;
    const minY = BORDER + r;
    const maxY = WORLD_H - BORDER - r;
    if (p.x < minX) {
      p.x = minX;
      if (p.vx !== undefined && p.vx < 0) p.vx *= -0.3;
    }
    if (p.x > maxX) {
      p.x = maxX;
      if (p.vx !== undefined && p.vx > 0) p.vx *= -0.3;
    }
    if (p.y < minY) {
      p.y = minY;
      if (p.vy !== undefined && p.vy < 0) p.vy *= -0.3;
    }
    if (p.y > maxY) {
      p.y = maxY;
      if (p.vy !== undefined && p.vy > 0) p.vy *= -0.3;
    }
  }

  private separatePlayers() {
    const ps = this.players.filter((p) => p.playing && p.alive);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        if (a.phaseT > 0 || b.phaseT > 0) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        const m = this.hitR(a) + this.hitR(b);
        if (d < m && d > 0.01) {
          const push = (m - d) / 2;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          a.x += nx * push;
          a.y += ny * push;
          b.x -= nx * push;
          b.y -= ny * push;
          this.collideWorld(a);
          this.collideWorld(b);
          this.rescue(a);
          this.rescue(b);
        }
      }
  }

  /** Empurrão, onda e agulha. Cada pulso marca a pessoa uma vez e não tira vida. */
  private applyTunePulse(p: Player) {
    const touch = tuneTouch(this.arena, p.x, p.y, this.worldT);
    if (touch && !this.tuneOnce.has(`${p.id}:${touch.pulse}`)) {
      this.tuneOnce.add(`${p.id}:${touch.pulse}`);
      this.tuneHold.set(p.id, { until: this.worldT + 1.5, speed: touch.speed, pulse: touch.pulse });
    }
    const push = tunePush(this.arena, p.x, p.y, this.worldT);
    if (push && !this.tuneOnce.has(`${p.id}:${push.pulse}`)) {
      this.tuneOnce.add(`${p.id}:${push.pulse}`);
      if (push.pulse.startsWith('pagina')) {
        p.x = push.x;
        p.y = push.y;
      } else {
        p.x += push.vx * 0.08;
        p.y += push.vy * 0.08;
      }
      p.vx = push.vx;
      p.vy = push.vy;
      p.recorder?.markJump();
    }
  }

  // ------------------------------------------------------------------ perigos
  hazardAt(x: number, y: number, r: number, t = this.worldT, includeWarn = false): boolean {
    const a = this.arena;
    for (let i = 0; i < a.zones.length; i++) {
      const s = this.zoneState(i);
      if (s === 'on' || (includeWarn && s === 'warn')) {
        const z = a.zones[i];
        if (dist(x, y, z.x, z.y) < z.r + r * 0.4) return true;
      }
    }
    for (const b of a.beams ?? []) {
      const ang = beamAngle(b, t);
      if (distToSegment(x, y, b.x, b.y, b.x + Math.cos(ang) * b.len, b.y + Math.sin(ang) * b.len) < r + 7) return true;
    }
    for (const l of a.lasers ?? []) {
      const lx = laserX(l, t);
      if (Math.abs(x - lx) < r + 4 && y > l.y0 - r && y < l.y1 + r) return true;
    }
    for (const pi of a.pistons ?? []) {
      const s = pistonState(pi, t);
      if ((s.phase === 'slam' && s.ext > 0.25) || (includeWarn && s.phase === 'warn')) {
        const h = includeWarn && s.phase === 'warn' ? pi.h : pi.h * s.ext;
        if (circleRect(x, y, r * 0.7, { x: pi.x, y: pi.y, w: pi.w, h })) return true;
      }
    }
    for (const w of a.wells ?? []) if (dist(x, y, w.x, w.y) < w.r + r * 0.4) return true;
    for (const l of a.lava ?? []) if (dist(x, y, l.x, l.y) < l.r - 6 + (includeWarn ? r : 0)) return true;
    for (const tr of a.trains ?? []) {
      const st = trainState(tr, t);
      if (y < tr.y - r * 0.5 || y > tr.y + tr.h + r * 0.5) continue;
      if (st.phase === 'pass' && x > st.x0 - r && x < st.x1 + r) return true;
      if (includeWarn && st.phase !== 'idle') return true;
    }
    for (const td of a.tornados ?? []) {
      const c = tornadoPos(td, t);
      if (dist(x, y, c.x, c.y) < td.r + r * (includeWarn ? 1.6 : 0.5)) return true;
    }
    return false;
  }

  /** O contato mais grave. Poço e trem saem antes. Os outros compartilham um tick. */
  private hazardContact(p: Player): 'well' | 'train' | HazardKind | null {
    const a = this.arena;
    const r = C.PLAYER_R;
    const t = this.worldT;
    for (const w of a.wells ?? []) {
      if (dist(p.x, p.y, w.x, w.y) < w.r + r * 0.4) return 'well';
    }
    for (const tr of a.trains ?? []) {
      const st = trainState(tr, t);
      if (st.phase === 'pass' && p.y > tr.y - 8 && p.y < tr.y + tr.h + 8 && p.x > st.x0 - r && p.x < st.x1 + r) return 'train';
    }
    let best: HazardKind | null = null;
    let bestN = -1;
    const take = (kind: HazardKind) => {
      const n = hazardDamage(kind);
      if (n > bestN) {
        best = kind;
        bestN = n;
      }
    };
    for (const td of a.tornados ?? []) {
      const c = tornadoPos(td, t);
      if (dist(p.x, p.y, c.x, c.y) < td.r + r * 0.5) take('tornado');
    }
    for (const pi of a.pistons ?? []) {
      const s = pistonState(pi, t);
      if (s.phase === 'slam' && s.ext > 0.25 && circleRect(p.x, p.y, r * 0.7, { x: pi.x, y: pi.y, w: pi.w, h: pi.h * s.ext })) take('piston');
    }
    for (const l of a.lasers ?? []) {
      const lx = laserX(l, t);
      if (Math.abs(p.x - lx) < r + 4 && p.y > l.y0 - r && p.y < l.y1 + r) take('laser');
    }
    for (const l of a.lava ?? []) {
      if (dist(p.x, p.y, l.x, l.y) < l.r - 6) take('lava');
    }
    for (const b of a.beams ?? []) {
      const ang = beamAngle(b, t);
      if (distToSegment(p.x, p.y, b.x, b.y, b.x + Math.cos(ang) * b.len, b.y + Math.sin(ang) * b.len) < r + 7) take('beam');
    }
    for (let i = 0; i < a.zones.length; i++) {
      if (this.zoneState(i) !== 'on') continue;
      const z = a.zones[i];
      if (dist(p.x, p.y, z.x, z.y) < z.r + r * 0.4) take('zone');
    }
    return best;
  }

  private tossTornado(p: Player) {
    for (const td of this.arena.tornados ?? []) {
      const c = tornadoPos(td, this.worldT);
      const d = dist(p.x, p.y, c.x, c.y);
      if (d >= td.r + C.PLAYER_R * 0.5) continue;
      const nx = (p.x - c.x) / (d || 1);
      const ny = (p.y - c.y) / (d || 1);
      p.vx = nx * 520 - ny * 520;
      p.vy = ny * 520 + nx * 520;
      p.stunT = Math.max(p.stunT, 0.45);
      this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: 'hazard' });
      return;
    }
  }

  private checkHazards(p: Player, dt: number) {
    if (p.phaseT > 0 || p.invulnT > 1) {
      this.hazardClock.delete(p.id);
      return;
    }
    const kind = this.hazardContact(p);
    if (!kind) {
      this.hazardClock.delete(p.id);
      return;
    }
    if (kind === 'well') {
      for (const w of this.arena.wells ?? []) {
        if (dist(p.x, p.y, w.x, w.y) < w.r + C.PLAYER_R * 0.4) {
          this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: 'fall' });
          const s = this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)];
          p.recorder?.markJump();
          p.x = s.x;
          p.y = s.y;
          p.vx = p.vy = 0;
          if (p.invulnT <= 0) this.damage(p, 'fall', true);
          return;
        }
      }
      return;
    }
    if (kind === 'train') {
      for (const tr of this.arena.trains ?? []) {
        const st = trainState(tr, this.worldT);
        if (st.phase === 'pass' && p.y > tr.y - 8 && p.y < tr.y + tr.h + 8 && p.x > st.x0 - C.PLAYER_R && p.x < st.x1 + C.PLAYER_R) {
          const up = p.y < tr.y + tr.h / 2;
          p.recorder?.markJump();
          p.y = up ? tr.y - C.PLAYER_R - 4 : tr.y + tr.h + C.PLAYER_R + 4;
          p.vx = tr.dir * 600;
          p.vy = up ? -300 : 300;
          this.collideWorld(p);
          return;
        }
      }
      return;
    }
    const left = (this.hazardClock.get(p.id) ?? 0) - dt;
    if (left > 0) {
      this.hazardClock.set(p.id, left);
      return;
    }
    this.hazardClock.set(p.id, COMBAT.hazard.tick);
    if (kind === 'tornado') {
      this.tossTornado(p);
      if (!this.combat) {
        if (p.carry > 0) {
          this.dropFragment(p.x, p.y, p.carry);
          p.carry = 0;
        }
        return;
      }
    }
    if (this.combat) {
      this.hurt(p, hazardDamage(kind), null, 'hazard');
      return;
    }
    if (p.shieldT > 0) {
      p.invulnT = 0.5;
      this.events.push({ type: 'disrupt', x: p.x, y: p.y });
      return;
    }
    this.damage(p, 'hazard');
  }

  private checkEchoes(p: Player) {
    if (p.phaseT > 0) return;
    for (const e of this.echoViews) {
      if (!e.active || e.disrupted || e.iced) continue;
      const own = e.rec.playerId === p.id;
      // em times, Ecos de aliados (e o seu) não atrapalham
      if (this.rules.teams && (own || this.teamOf(e.rec.playerId) === p.team)) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d >= C.PLAYER_R + C.ECHO_R) continue;
      // Eco é fantasma: só empurra no instante em que acerta. Invulnerável (logo depois de levar
      // o golpe) ou no seu próprio Eco sem dano, você atravessa — nada de ficar preso/arrastado nele.
      const nx = (p.x - e.x) / (d || 1);
      const ny = (p.y - e.y) / (d || 1);
      const pushOut = () => {
        p.x = e.x + nx * (C.PLAYER_R + C.ECHO_R);
        p.y = e.y + ny * (C.PLAYER_R + C.ECHO_R);
        this.collideWorld(p);
      };
      if (p.shieldT > 0) {
        pushOut();
        this.disrupt(e, p);
        p.vx += nx * 300;
        p.vy += ny * 300;
        continue;
      }
      if (p.invulnT > 0) continue;
      if (own && !this.cfg.ownEchoDamage) continue;
      pushOut();
      p.vx = nx * 520;
      p.vy = ny * 520;
      if (own) p.stats.ownEchoHits++;
      p.stats.echoHits++;
      this.echoHitBy = e.rec.playerId;
      if (this.combat) {
        this.hurt(p, 12, null, own ? 'own' : 'echo', Math.atan2(p.y - e.y, p.x - e.x));
        p.invulnT = Math.max(p.invulnT, 0.6);
        return;
      }
      this.damage(p, own ? 'own' : 'echo');
      return;
    }
  }

  private disrupt(e: EchoView, by: Player) {
    this.disrupted.set(e.key, this.roundT + 3);
    e.disrupted = true;
    by.stats.disrupted++;
    this.events.push({ type: 'disrupt', x: e.x, y: e.y });
  }

  private damage(p: Player, by: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse', silent = false) {
    if (this.combat) {
      this.hurt(p, by === 'fall' ? 20 : 15, null, by);
      return;
    }
    p.hearts--;
    p.tookDamage = true;
    p.invulnT = C.INVULN;
    p.stunT = C.STUN;
    p.hitFlash = 0.35;
    p.recorder?.event(this.roundT * 1000, 'hit');
    const lost = p.carry;
    if (p.carry > 0) {
      this.dropFragment(p.x, p.y, p.carry);
      p.carry = 0;
    }
    const from = by === 'echo' || by === 'own' ? (this.echoHitBy ?? undefined) : undefined;
    this.echoHitBy = null;
    if (!silent) this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by, lost: lost || undefined, from });
    if (p.hearts <= 0) {
      p.alive = false;
      p.recorder?.finish(this.roundT * 1000, p.x, p.y, p.dir);
      this.events.push({ type: 'eliminated', x: p.x, y: p.y, pid: p.id });
    }
  }

  // ------------------------------------------------------------------ energia
  private randomFreeSpot(minCoreDist = 70): Pt | null {
    for (let tries = 0; tries < 40; tries++) {
      const x = rnd(BORDER + 24, WORLD_W - BORDER - 24);
      const y = rnd(BORDER + 24, WORLD_H - BORDER - 24);
      if (!this.isFree(x, y, 16)) continue;
      if (this.arena.islands) {
        if (!this.arena.islands.some((i) => inRect(x, y, i, -18))) continue;
      }
      if (dist(x, y, this.core.x, this.core.y) < minCoreDist) continue;
      if ((this.arena.wells ?? []).some((w) => dist(x, y, w.x, w.y) < w.range * 0.55)) continue;
      if ((this.arena.portals ?? []).some(([a, b]) => dist(x, y, a.x, a.y) < 40 || dist(x, y, b.x, b.y) < 40)) continue;
      if (this.players.some((p) => p.alive && dist(x, y, p.x, p.y) < 50)) continue;
      return { x, y };
    }
    return null;
  }

  private spawnFragment() {
    const s = this.randomFreeSpot();
    if (!s) return;
    this.fragments.push({ id: this.fragId++, x: s.x, y: s.y, vx: 0, vy: 0, golden: false, age: 0, pickDelay: 0 });
  }

  private dropFragment(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(140, 260);
      this.fragments.push({ id: this.fragId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, golden: false, age: 0, pickDelay: 0.6 });
    }
  }

  private updateFragments(dt: number) {
    for (const f of this.fragments) {
      f.age += dt;
      f.pickDelay = Math.max(0, f.pickDelay - dt);
      if (f.vx || f.vy) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= Math.exp(-4 * dt);
        f.vy *= Math.exp(-4 * dt);
        if (Math.hypot(f.vx, f.vy) < 5) f.vx = f.vy = 0;
        this.collideWorld(f, C.FRAG_R);
      }
      if (this.arena.islands && !f.vx && !f.vy && !isGround(this.arena, f.x, f.y, this.worldT)) f.age = -999; // caiu
    }
    this.fragments = this.fragments.filter((f) => f.age >= 0);
    const target = Math.round(4 + this.players.filter((p) => p.playing).length * 1.5);
    const normal = this.fragments.filter((f) => !f.golden).length;
    this.fragTimer -= dt;
    if (normal < target && this.fragTimer <= 0) {
      this.spawnFragment();
      this.fragTimer = 1.8;
    }
  }

  private checkPickups(p: Player) {
    for (const f of this.fragments) {
      if (f.pickDelay > 0 || f.age < 0) continue;
      if (dist(p.x, p.y, f.x, f.y) > C.PLAYER_R + C.FRAG_R + 4) continue;
      if (f.golden) {
        f.age = -1;
        this.award(p, POINTS.objective);
        this.events.push({ type: 'pickup', x: f.x, y: f.y, pid: p.id, golden: true });
        this.events.push({ type: 'objective', pid: p.id, text: 'Fragmento Dourado +1' });
        continue;
      }
      if (p.carry >= C.MAX_CARRY) continue;
      f.age = -1;
      p.carry++;
      let lucky = false;
      if (p.char.id === 'maya' && p.carry < C.MAX_CARRY && Math.random() < 0.2) {
        p.carry++;
        lucky = true;
      }
      this.events.push({ type: 'pickup', x: f.x, y: f.y, pid: p.id, lucky });
    }
    this.fragments = this.fragments.filter((f) => f.age >= 0);
  }

  private checkDelivery(p: Player) {
    if (p.carry <= 0) return;
    if (dist(p.x, p.y, this.core.x, this.core.y) > C.CORE_R) return;
    const n = p.carry;
    let pts = deliveryPoints(n);
    if (p.doubleNext) {
      pts *= 2;
      p.doubleNext = false;
      this.events.push({ type: 'objective', pid: p.id, text: 'Energia em dobro!' });
    }
    this.award(p, pts);
    p.stats.delivered += n;
    p.stats.bestDelivery = Math.max(p.stats.bestDelivery, pts);
    p.carry = 0;
    p.recorder?.event(this.roundT * 1000, 'deliver');
    this.events.push({ type: 'deliver', x: this.core.x, y: this.core.y, pid: p.id, points: pts, count: n });
    if (this.objective === 'tripla' && n >= 3 && !p.tripleDone) {
      p.tripleDone = true;
      this.award(p, POINTS.objective);
      this.events.push({ type: 'objective', pid: p.id, text: 'Entrega tripla +1' });
    }
  }

  // ------------------------------------------------------------------ poderes
  private updatePowerups(dt: number) {
    for (const pw of this.powerups) pw.age += dt;
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      this.powerTimer = this.combat ? 3.5 + Math.random() * 2 : 5.5 + Math.random() * 2.5;
      if (this.powerups.length < (this.combat ? 4 : 2) && this.roundT < this.roundDur - 3) {
        const s = this.randomFreeSpot(90);
        if (s) {
          const kind = this.pickPower();
          this.powerups.push({ id: this.fragId++, kind, x: s.x, y: s.y, age: 0 });
          this.events.push({ type: 'powerSpawn', x: s.x, y: s.y, power: kind });
        }
      }
    }
    // ímã: puxa energia próxima
    for (const p of this.players) {
      if (!p.alive || !p.playing) continue;
      p.magnetT = Math.max(0, p.magnetT - dt);
      if (p.power) {
        p.power.t -= dt;
        if (p.power.t <= 0) p.power = null;
      }
      if (p.magnetT <= 0 || p.carry >= C.MAX_CARRY) continue;
      for (const f of this.fragments) {
        if (f.golden) continue;
        const d = dist(f.x, f.y, p.x, p.y);
        if (d < 230 && d > 1) {
          const k = Math.min(1, (420 * dt) / d);
          f.x += (p.x - f.x) * k;
          f.y += (p.y - f.y) * k;
        }
      }
    }
  }

  // ------------------------------------------------------------------ cristais de habilidade
  private updateAbilityOrbs(dt: number) {
    if (this.mode === 'duelo' || this.mode === 'dupla') {
      this.abilityOrbs = [];
      return;
    }
    for (const o of this.abilityOrbs) o.age += dt;
    if (this.cfg.training) return;
    this.orbTimer -= dt;
    if (this.orbTimer <= 0) {
      this.orbTimer = 8 + Math.random() * 4;
      if (this.abilityOrbs.length < 2 && this.roundT < this.roundDur - 4) {
        const s = this.randomFreeSpot(100);
        if (s) {
          const ab = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].ability.id;
          this.abilityOrbs.push({ id: this.fragId++, ab, x: s.x, y: s.y, age: 0 });
          this.events.push({ type: 'bonusSpawn', x: s.x, y: s.y, ab });
        }
      }
    }
  }

  private checkAbilityOrbs(p: Player) {
    for (const o of this.abilityOrbs) {
      if (o.age < 0.4 || dist(p.x, p.y, o.x, o.y) > C.PLAYER_R + 18) continue;
      o.age = -1;
      p.bonusAb = o.ab;
      this.events.push({ type: 'bonusPick', x: o.x, y: o.y, pid: p.id, ab: o.ab });
    }
    this.abilityOrbs = this.abilityOrbs.filter((o) => o.age >= 0);
  }

  private checkPowerups(p: Player) {
    for (const pw of this.powerups) {
      if (dist(p.x, p.y, pw.x, pw.y) > C.PLAYER_R + 16) continue;
      pw.age = -1;
      this.applyPower(p, pw.kind);
      this.events.push({ type: 'power', x: pw.x, y: pw.y, pid: p.id, power: pw.kind });
    }
    this.powerups = this.powerups.filter((pw) => pw.age >= 0);
  }

  private applyPower(p: Player, kind: PowerId) {
    const label = (t: number) => (p.power = { id: kind, t });
    switch (kind) {
      case 'escudo':
        if (this.combat) {
          p.shieldHp = 50;
          label(10);
        } else {
          p.shieldT = Math.max(p.shieldT, 8);
          label(8);
        }
        break;
      case 'invisivel':
        p.cloakT = Math.max(p.cloakT, 5);
        label(5);
        break;
      case 'vampiro':
        p.vampT = 8;
        label(8);
        break;
      case 'metralhadora':
      case 'escopeta':
      case 'foguete':
      case 'congelante':
      case 'laser': {
        const w = WEAPONS[kind];
        p.weapon = kind;
        p.weaponT = w.time;
        p.ammo = w.ammo;
        label(w.time || 6);
        break;
      }
      case 'bomba':
      case 'mina':
        p.item = kind;
        p.itemN = ITEMS[kind].count;
        label(3);
        break;
      case 'cura':
        this.heal(null, p, 40);
        this.events.push({ type: 'heal', x: p.x, y: p.y, pid: p.id });
        label(2);
        break;
      case 'ima':
        p.magnetT = 6;
        label(6);
        break;
      case 'gelo':
        this.iceUntil = this.roundT + 4;
        label(4);
        break;
      case 'turbo':
        p.turboT = Math.max(p.turboT, 4);
        label(4);
        break;
      case 'dobro':
        p.doubleNext = true;
        label(30);
        break;
      case 'apagar': {
        let best: EchoView | null = null;
        let bd = Infinity;
        for (const e of this.echoViews) {
          if (!e.active) continue;
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        label(2);
        if (best) {
          this.erased.add(best.key);
          for (const g of this.echoes.generations) g.recordings = g.recordings.filter((r) => `${r.round}:${r.playerId}` !== best!.key);
          this.echoViews = this.echoViews.filter((e) => e !== best);
          this.events.push({ type: 'echoErased', x: best.x, y: best.y, pid: p.id });
        }
        break;
      }
    }
    void getPower;
  }

  // ------------------------------------------------------------------ combate
  /** mira automática: rival visível mais perto, senão a direção em que anda */
  private autoAim(p: Player): number {
    let best: { x: number; y: number } | null = null;
    let bd = 560;
    for (const o of this.targetsOf(p)) {
      const d = dist(o.x, o.y, p.x, p.y);
      if (d < bd && this.nav.lineClear(p.x, p.y, o.x, o.y, this.worldT)) {
        bd = d;
        best = o;
      }
    }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : p.dir;
  }

  private spawnBullets(x: number, y: number, ang: number, weapon: WeaponId, owner: string, fromEcho: boolean) {
    const w = WEAPONS[weapon];
    if (this.bullets.length > COMBAT.maxBullets) this.bullets.splice(0, this.bullets.length - COMBAT.maxBullets);
    for (let i = 0; i < w.pellets; i++) {
      // leque simétrico (vários projéteis) ou tiro reto (spread 0)
      const a = ang + (w.pellets > 1 ? (i / (w.pellets - 1) - 0.5) * w.spread : (Math.random() - 0.5) * w.spread);
      const sp = w.speed * (w.pellets > 1 ? 0.94 + Math.random() * 0.12 : 1);
      const muzzle = 14 + w.gun.len;
      this.bullets.push({
        id: this.fragId++,
        x: x + Math.cos(ang) * muzzle,
        y: y - GUN_Y + Math.sin(ang) * muzzle,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        owner,
        dmg: w.damage * (fromEcho ? ECHO_DAMAGE_MULT : 1),
        life: w.life,
        weapon,
        pierce: w.pierce,
        fromEcho,
        hit: [],
      });
    }
  }

  /** Poder de arena que não é arma. Recusa (recarga) não reinicia o tempo. */
  private pickPower(): PowerId {
    const banned = new Set<PowerId>(['metralhadora', 'escopeta', 'laser', 'foguete', 'congelante', 'bomba', 'mina']);
    for (let i = 0; i < 8; i++) {
      const kind = randomPower();
      if (!banned.has(kind)) return kind;
    }
    return 'turbo';
  }

  private foeInRadius(p: Player, x: number, y: number, radius: number, los = false) {
    return this.players.some((o) => o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, x, y) <= radius && (!los || this.sight(p.x, p.y, o.x, o.y, p.id)));
  }

  /** Parede, pilar e borda no meio do trecho. As pontas não contam. */
  /** through: id de quem conjura — a própria barreira não tapa a visão dele. */
  private sight(ax: number, ay: number, bx: number, by: number, through?: string) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 14) return true;
    const inset = 8 / d;
    return (
      this.solidAlong(ax + (bx - ax) * inset, ay + (by - ay) * inset, bx - (bx - ax) * inset, by - (by - ay) * inset, 2, through) === null
    );
  }

  /** Anda em passos curtos. Um impulso contra a parede para; não aparece do outro lado. */
  private integrate(p: Player, dt: number) {
    const distMoved = Math.hypot(p.vx, p.vy) * dt;
    const n = Math.max(1, Math.ceil(distMoved / 8));
    const step = dt / n;
    for (let i = 0; i < n; i++) {
      const ox = p.x;
      const oy = p.y;
      p.x += p.vx * step;
      p.y += p.vy * step;
      this.collideWorld(p);
      if (p.dashT > 0) {
        const moved = Math.hypot(p.x - ox, p.y - oy);
        const want = Math.hypot(p.vx, p.vy) * step;
        if (want > 1 && moved < want * 0.25) {
          p.dashT = 0;
          abilityTrace(p.id, 'dash-block', `${Math.round(p.x)},${Math.round(p.y)}`);
          break;
        }
      }
    }
  }

  /** passThrough: muralhas deste dono (e do time) não seguram os tiros dele — a muralha protege quem a ergueu */
  private solidAlong(x0: number, y0: number, x1: number, y1: number, r: number, passThrough?: string) {
    const team = passThrough ? this.teamOf(passThrough) : -1;
    const own = (w: { owner: string }) => !!passThrough && (w.owner === passThrough || (team >= 0 && w.owner !== 'arena' && this.teamOf(w.owner) === team));
    const walls = passThrough ? this.iceWalls.filter((w) => !own(w)) : this.iceWalls;
    const rects = walls.length ? [...this.arena.walls, ...walls] : this.arena.walls;
    return sweepCircle(x0, y0, x1, y1, r, rects, this.arena.pillars, {
      minX: BORDER + r,
      minY: BORDER + r,
      maxX: WORLD_W - BORDER - r,
      maxY: WORLD_H - BORDER - r,
    });
  }

  private earliestBody(b: Bullet, x0: number, y0: number, x1: number, y1: number, enemyShot: boolean, ownerTeam: number) {
    let best: number | null = null;
    for (const o of this.players) {
      if (!o.alive || !o.playing || b.hit.includes(o.id)) continue;
      if (!enemyShot) {
        if (o.id === b.owner && !b.fromEcho) continue;
        if (o.id === b.owner && this.rules.teams) continue;
        if (o.id !== b.owner && ownerTeam >= 0 && ownerTeam === o.team) continue;
      }
      const foot = o.y - 4;
      const head = o.y - (o.boss ? 86 : 72);
      const t = sweepCapsule(x0, y0, x1, y1, o.x, foot, head, this.hitR(o) + 6);
      if (t === null) continue;
      if (best === null || t < best) best = t;
    }
    return best;
  }

  private steerHome(b: Bullet, dt: number) {
    const tgt = this.players.find((p) => p.id === b.homeId);
    if (!tgt || !tgt.alive || !tgt.playing) {
      b.life = 0;
      abilityTrace(b.owner, 'home-end', b.homeId ?? '');
      return;
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 1) return;
    const want = Math.atan2(tgt.y - GUN_Y - b.y, tgt.x - b.x);
    const cur = Math.atan2(b.vy, b.vx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const cap = 6 * dt;
    const turn = Math.abs(diff) > cap ? Math.sign(diff) * cap : diff;
    const ang = cur + turn;
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
  }

  private nearestHostile(p: Player, max: number): Player | null {
    let best: Player | null = null;
    let bd = max;
    for (const o of this.players) {
      if (!o.alive || !o.playing || !this.hostile(p, o)) continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** Soma emboscada e embalo uma vez, com teto. O número entra no mesmo dano, sem um segundo golpe. */
  private mobilityBonus(src: Player): number {
    let n = 0;
    if (src.ambushT > 0) {
      const g = Math.min(AMBUSH_BONUS, EXTRA_CAP - n);
      src.ambushT = 0;
      n += g;
      if (g > 0) this.events.push({ type: 'combo', x: src.x, y: src.y, name: 'Emboscada', bonus: g, pid: src.id });
    }
    if (src.flowT > 0) {
      const g = Math.min(FLOW_BONUS, EXTRA_CAP - n);
      src.flowT = 0;
      n += g;
      if (g > 0) this.events.push({ type: 'combo', x: src.x, y: src.y, name: 'Embalo', bonus: g, pid: src.id });
    }
    return n;
  }

  private clearMarks(p: Player) {
    p.burnT = 0;
    p.burnAcc = 0;
    p.frozenT = 0;
    p.gustT = 0;
    p.shockT = 0;
    p.rootT = 0;
    p.rootResistT = 0;
    p.markedT = 0;
    p.fieldT = 0;
    p.fieldEl = '';
    p.reactCd = 0;
    p.ctrlT = 0;
    p.iceT = 0;
    p.plasmaT = 0;
    p.plasmaPrimeT = 0;
    p.comboT = 0;
    p.ruptureT = 0;
    p.avatarT = 0;
    p.stunT = 0;
    p.slowT = 0;
  }

  private applyRoot(p: Player, t: number) {
    if (t <= 0 || p.rootResistT > 0 || p.dodgeT > 0 || p.boss) return;
    p.rootT = Math.max(p.rootT, t);
    p.rootResistT = p.rootT + ROOT_RESIST;
    p.ctrlT = Math.max(p.ctrlT, p.rootT + CONTROL_GRACE);
    this.events.push({ type: 'trap', x: p.x, y: p.y, pid: p.id });
  }

  /** Anda até a parede e para. Devolve a distância andada. */
  private blinkTo(p: Player, ang: number, reach: number): number {
    const step = 8;
    let x = p.x;
    let y = p.y;
    const n = Math.max(1, Math.floor(reach / step));
    for (let i = 1; i <= n; i++) {
      const nx = p.x + Math.cos(ang) * step * i;
      const ny = p.y + Math.sin(ang) * step * i;
      if (!this.isFree(nx, ny, C.PLAYER_R)) break;
      x = nx;
      y = ny;
    }
    const moved = Math.hypot(x - p.x, y - p.y);
    p.x = x;
    p.y = y;
    return moved;
  }

  private placeGrove(p: Player, x: number, y: number, r: number, heal: number) {
    this.groves.push({ id: this.fragId++, owner: p.id, team: p.team, x, y, r, t: HEAL_ZONE_TIME, acc: 0, heal });
    for (const o of this.players) {
      if (!o.alive || !o.playing || dist(o.x, o.y, x, y) > r) continue;
      if (this.hostile(p, o)) continue;
      this.heal(p, o, heal);
      o.healT = 0.5;
    }
  }

  private dashTouch(p: Player) {
    if (!p.dashEl || p.dashDmg <= 0) return;
    for (const o of this.players) {
      if (!o.alive || !o.playing || p.dashHit.includes(o.id) || !this.hostile(p, o)) continue;
      if (dist(p.x, p.y, o.x, o.y) > 36) continue;
      p.dashHit.push(o.id);
      this.deliverPower(p, o, p.dashEl, p.dashDmg, KNOCK[p.dashEl], false, { slot: -1, projectile: false });
    }
  }

  /** Clique no X1 e no 2x2. Não usa a arma, não marca e não consome plasma. */
  private castBasic(p: Player, ang: number) {
    if (p.basicCd > 0) return;
    if (p.energy < BASIC.cost) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente' });
      abilityTrace(p.id, 'deny', 'energy');
      return;
    }
    p.energy = clampEnergy(p.energy - BASIC.cost);
    p.basicCd = BASIC.cd;
    const muzzle = 16;
    this.bullets.push({
      id: this.fragId++,
      x: p.x + Math.cos(ang) * muzzle,
      y: p.y - GUN_Y + Math.sin(ang) * muzzle,
      vx: Math.cos(ang) * BASIC.speed,
      vy: Math.sin(ang) * BASIC.speed,
      owner: p.id,
      dmg: BASIC.dmg,
      life: BASIC.range / BASIC.speed,
      weapon: 'pulsador',
      pierce: false,
      fromEcho: false,
      hit: [],
      basic: true,
    });
    abilityTrace(p.id, 'launch', BASIC.name);
    this.events.push({ type: 'shoot', x: p.x, y: p.y, pid: p.id, weapon: 'pulsador' });
  }

  /** Carga enviada pelo cliente. Sem ch, o golpe sai no valor cheio (bots e testes). */
  private tuned(def: PowerDef, slot: number, inp?: Input) {
    const base = slot >= 0 && slot <= 3 ? resolvedDamage(def, slot) : def.dmg;
    const held = castFamily(def) === 'charged' && inp && typeof inp.ch === 'number' && isFinite(inp.ch);
    if (!held) return { dmg: base, range: def.range, radius: def.radius, step: def.step ?? def.range, skipWindup: false };
    const ch = inp!.ch as number;
    return {
      dmg: Math.max(1, Math.round(base * chargeFactor(ch))),
      range: def.range * chargeReach(ch),
      radius: def.radius * chargeRadius(ch),
      step: (def.step ?? def.range) * chargeReach(ch),
      skipWindup: true,
    };
  }

  /** Prepara o golpe. Com windup, energia e recarga só caem quando ele sai. Segurar até soltar já é o preparo. */
  private beginPower(p: Player, slot: number, ang: number, inp?: Input) {
    if (p.pendingCast) return;
    const def = kitOf(p.char.id).powers[slot];
    const wind = def.windup ?? 0;
    const tune = this.tuned(def, slot, inp);
    const ult = slot === 2;
    if (ult && p.ultCharge < 100) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Ultimate em carga', x: p.x, y: p.y });
      abilityTrace(p.id, 'deny', 'charge');
      return;
    }
    if (ult && !tune.skipWindup && def.act !== 'dash' && def.act !== 'blink') return this.beginUlt(p, def, ang, inp, tune, Math.max(wind, ULT_WINDUP));
    if (wind <= 0 || tune.skipWindup) {
      this.castPower(p, slot, ang, inp);
      return;
    }
    if (p.powerCd[slot] > 0) return;
    if (!ult && p.energy < SLOT_COST[slot]) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente', x: p.x, y: p.y });
      abilityTrace(p.id, 'deny', 'energy');
      return;
    }
    if (def.speed <= 0) {
      const pt = this.castPoint(p, inp, ang, tune.range);
      if (!this.foeInRadius(p, pt.x, pt.y, tune.radius, def.los !== false)) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido', x: p.x, y: p.y });
        abilityTrace(p.id, 'deny', 'target');
        return;
      }
    }
    p.pendingCast = { slot, ang, ca: inp?.ca, cr: inp?.cr, at: this.roundT + wind };
    p.castT = Math.max(p.castT, wind);
    this.events.push({ type: 'windup', pid: p.id, x: p.x, y: p.y, el: def.element, t: wind });
    abilityTrace(p.id, 'windup', def.name);
  }

  /** Suprema: aviso no chão + preparo. Atordoar quem prepara cancela (já existe no laço). */
  private beginUlt(p: Player, def: PowerDef, ang: number, inp: Input | undefined, tune: { range: number; radius: number }, wind: number) {
    if (p.pendingCast || p.powerCd[2] > 0) return;
    let tx: number;
    let ty: number;
    let r: number;
    if (def.speed <= 0) {
      const pt = this.castPoint(p, inp, ang, tune.range);
      if (!this.foeInRadius(p, pt.x, pt.y, tune.radius, def.los !== false)) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido', x: p.x, y: p.y });
        abilityTrace(p.id, 'deny', 'target');
        return;
      }
      tx = pt.x;
      ty = pt.y;
      r = tune.radius;
    } else {
      const a = typeof inp?.ca === 'number' && isFinite(inp.ca) ? inp.ca : ang;
      tx = p.x + Math.cos(a) * tune.range;
      ty = p.y + Math.sin(a) * tune.range;
      r = ULT_LAND[def.element]?.r ?? 90;
    }
    p.pendingCast = { slot: 2, ang, ca: inp?.ca, cr: inp?.cr, ch: inp?.ch, at: this.roundT + wind };
    p.castT = Math.max(p.castT, wind);
    this.events.push({ type: 'windup', pid: p.id, x: p.x, y: p.y, el: def.element, t: wind, ult: true, tx, ty, r, lane: def.speed > 0 });
    abilityTrace(p.id, 'windup', def.name);
  }

  /** A suprema caiu aqui (acerto, parede ou fim do alcance). Uma vez por suprema. */
  private ultLand(src: Player, x: number, y: number, el: Element) {
    const spec = ULT_LAND[el] ?? ULT_LAND.plasma;
    const role = ultRole(src.char.id, el);
    this.events.push({ type: 'ultland', pid: src.id, x, y, el, r: spec.r, role });
    const foes = this.players.filter((o) => o.alive && o.playing && this.hostile(src, o) && dist(o.x, o.y, x, y) <= spec.r && this.sight(x, y, o.x, o.y));
    if (role === 'avatar') {
      src.avatarT = 4;
      if (src.alive) this.heal(src, src, 8);
    } else if (role === 'rift') {
      this.placePatch(src, 'rift', x, y, spec.r, 1.6, 0, el);
    } else if (role === 'winter') {
      for (const o of foes) {
        this.slow(o, 1.2);
        this.applyRoot(o, 0.4);
        o.frozenT = Math.max(o.frozenT, 1.2);
      }
    } else if (role === 'eclipse') {
      this.ultZones.push({ id: this.fragId++, owner: src.id, x, y, r: spec.r, el, t: spec.t, total: spec.t, acc: 0, role, marked: foes.map((o) => o.id), struck: false });
      return;
    } else if (el === 'ice') {
      // Maré Abissal: a onda empurra para fora e deixa molhado
      for (const o of foes) {
        const d = Math.hypot(o.x - x, o.y - y) || 1;
        this.knock(o, ((o.x - x) / d) * 240, ((o.y - y) / d) * 240);
        o.frozenT = Math.max(o.frozenT, FROZEN_TIME);
        this.slow(o, FROZEN_TIME * 0.6);
      }
    } else if (el === 'nature') {
      // Ruptura Titânica: pilares sobem e prendem
      for (const o of foes) this.applyRoot(o, 0.9);
    } else if (el === 'lightning') {
      for (const o of foes) this.stun(o, 0.45);
    }
    this.ultZones.push({ id: this.fragId++, owner: src.id, x, y, r: spec.r, el, t: spec.t, total: spec.t, acc: 0 });
  }

  /** Fogo queima quem fica; o vórtice puxa e no fim arremessa. Sem dano extra fora disso. */
  private updateUltZones(dt: number) {
    for (const z of this.ultZones) {
      z.t -= dt;
      z.acc += dt;
      const src = this.players.find((p) => p.id === z.owner);
      if (!src) continue;
      const inside = () => this.players.filter((o) => o.alive && o.playing && this.hostile(src, o) && dist(o.x, o.y, z.x, z.y) <= z.r);
      if (z.role === 'eclipse' && !z.struck && z.total - z.t >= 0.45) {
        z.struck = true;
        for (const o of inside()) {
          if (z.marked && !z.marked.includes(o.id)) continue;
          this.stun(o, 0.4);
          this.hurt(o, 6, src.id, 'pulse');
        }
        this.events.push({ type: 'ultland', pid: src.id, x: z.x, y: z.y, el: 'lightning', r: z.r, role: 'eclipse' });
      } else if (z.el === 'fire' && z.acc >= 0.5) {
        z.acc -= 0.5;
        for (const o of inside()) {
          this.hurt(o, ULT_FIRE_TICK, src.id, 'pulse');
          if (!o.alive) continue;
          o.burnT = Math.max(o.burnT, 1.2);
          o.burnDps = Math.max(o.burnDps, burnDpsOf(src.char.id));
          o.burnFrom = src.id;
        }
      } else if (z.el === 'wind') {
        if (!z.blown && z.t > 0.3 && z.acc >= 0.15) {
          z.acc = 0;
          for (const o of inside()) {
            const d = Math.hypot(z.x - o.x, z.y - o.y) || 1;
            const step = Math.min(26, d);
            o.pullX = o.x + ((z.x - o.x) / d) * step;
            o.pullY = o.y + ((z.y - o.y) / d) * step;
            o.pullT = 0.16;
          }
        } else if (!z.blown && z.t <= 0.3) {
          z.blown = true;
          for (const o of inside()) {
            const d = Math.hypot(o.x - z.x, o.y - z.y) || 1;
            o.pullT = 0;
            this.knock(o, ((o.x - z.x) / d) * 560, ((o.y - z.y) / d) * 560);
            o.gustT = MARK_WINDOW;
            o.comboT = COMBO_WINDOW;
          }
          this.events.push({ type: 'ultland', pid: src.id, x: z.x, y: z.y, el: 'wind', r: z.r * 1.1 });
        }
      }
    }
    this.ultZones = this.ultZones.filter((z) => z.t > 0);
  }

  /**
   * Q E R F no X1 e no 2x2. Não grava tiro no Eco e não usa a arma.
   * Recarga e energia só caem depois que o golpe é aceito.
   * Área sem inimigo no círculo: não gasta. Projétil: gasta ao sair, mesmo se errar.
   */
  private castPower(p: Player, slot: number, ang: number, inp?: Input) {
    if (p.powerCd[slot] > 0) return;
    const def = kitOf(p.char.id).powers[slot];
    const cost = SLOT_COST[slot];
    const ult = slot === 2;
    const tune = this.tuned(def, slot, inp);
    if (ult && p.ultCharge < 100) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Ultimate em carga', x: p.x, y: p.y });
      abilityTrace(p.id, 'deny', 'charge');
      return;
    }
    if (!ult && p.energy < cost) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente', x: p.x, y: p.y });
      abilityTrace(p.id, 'deny', 'energy');
      return;
    }
    if ((p.avatarT ?? 0) > 0 && !ult) tune.radius = Math.round(tune.radius * 1.15);
    const dmg = tune.dmg;
    const knock = KNOCK[def.element];
    const pay = () => {
      if (ult) p.ultCharge = 0;
      else p.energy = clampEnergy(p.energy - cost);
      p.powerCd[slot] = cooldownOf(p.char.id, def.cd);
    };
    if (def.act === 'dash' || def.act === 'blink' || def.act === 'decoy' || def.act === 'zone' || def.act === 'wall') {
      if ((def.act === 'dash' || def.act === 'blink') && p.rootT > 0) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Preso pelas raízes', x: p.x, y: p.y });
        return;
      }
      pay();
      abilityTrace(p.id, 'launch', def.name);
      this.playAct(p, def, ang, inp, dmg, tune, slot);
      return;
    }
    const form = formOf(def, slot);
    const cast = { slot, projectile: def.speed > 0, mark: !!def.mark };
    const denyTarget = () => {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido', x: p.x, y: p.y });
      abilityTrace(p.id, 'deny', 'target');
    };
    if (form === 'breath' || form === 'gust') {
      const arc = 0.62;
      const foes = this.players.filter((o) => this.inCone(p, o, ang, tune.range, arc));
      if (!foes.length) return denyTarget();
      pay();
      abilityTrace(p.id, 'impact', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, r: tune.range, form });
      for (const o of foes) this.deliverPower(p, o, def.element, dmg, knock, true, cast);
      if (ult) {
        p.ultCharge = 0;
        this.ultLand(p, p.x + Math.cos(ang) * Math.min(90, tune.range), p.y + Math.sin(ang) * Math.min(90, tune.range), def.element);
      }
      return;
    }
    if (form === 'fissure' && def.speed <= 0) {
      const len = this.groundLen(p.x, p.y, ang, tune.range);
      const x1 = p.x + Math.cos(ang) * len;
      const y1 = p.y + Math.sin(ang) * len;
      const foes = this.players.filter((o) => o.alive && o.playing && this.hostile(p, o) && distToSegment(o.x, o.y, p.x, p.y, x1, y1) < 28 + this.hitR(o) && this.sight(p.x, p.y, o.x, o.y, p.id));
      if (!foes.length) return denyTarget();
      pay();
      abilityTrace(p.id, 'impact', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, r: len, form });
      for (const o of foes) this.deliverPower(p, o, def.element, dmg, knock, true, cast);
      if (ult) {
        p.ultCharge = 0;
        this.ultLand(p, x1, y1, def.element);
      }
      return;
    }
    if (form === 'chain' && def.speed <= 0) {
      const pt = this.castPoint(p, inp, ang, tune.range);
      const los = def.los !== false;
      const foes = this.players
        .filter((o) => o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, pt.x, pt.y) <= tune.radius && (!los || this.sight(p.x, p.y, o.x, o.y, p.id)))
        .sort((a, b) => dist(a.x, a.y, pt.x, pt.y) - dist(b.x, b.y, pt.x, pt.y));
      if (!foes.length) return denyTarget();
      pay();
      abilityTrace(p.id, 'impact', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: pt.x, y: pt.y, skill: def.element, r: tune.radius, form });
      this.deliverPower(p, foes[0], def.element, dmg, knock, true, cast);
      const jump = foes.find((o) => o !== foes[0] && dist(o.x, o.y, foes[0].x, foes[0].y) < 150);
      if (jump) this.deliverPower(p, jump, def.element, Math.max(1, Math.round(dmg * 0.6)), knock, true, cast);
      if (ult) {
        p.ultCharge = 0;
        this.ultLand(p, pt.x, pt.y, def.element);
      }
      return;
    }
    if (form === 'wave' && def.speed <= 0) {
      const arc = 0.7;
      const foes = this.players.filter((o) => this.inCone(p, o, ang, tune.range, arc));
      if (!foes.length) return denyTarget();
      pay();
      const speed = 460;
      this.pushPowerShot(p, ang, def, dmg, knock, slot, speed, tune.range / speed, true);
      abilityTrace(p.id, 'launch', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, r: tune.radius, form });
      return;
    }
    if (def.speed <= 0) {
      const pt = this.castPoint(p, inp, ang, tune.range);
      const los = def.los !== false;
      const radius = tune.radius;
      if (!this.foeInRadius(p, pt.x, pt.y, radius, los)) return denyTarget();
      pay();
      abilityTrace(p.id, 'impact', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: pt.x, y: pt.y, skill: def.element, r: radius, form });
      for (const o of this.players) {
        if (!o.alive || !o.playing || !this.hostile(p, o)) continue;
        if (dist(o.x, o.y, pt.x, pt.y) > radius) continue;
        if (los && !this.sight(p.x, p.y, o.x, o.y, p.id)) continue;
        this.deliverPower(p, o, def.element, dmg, form === 'rock' ? Math.max(knock, 200) : knock, true, cast);
        if (form === 'whirl') {
          const dx = pt.x - o.x;
          const dy = pt.y - o.y;
          const dd = Math.hypot(dx, dy) || 1;
          const step = Math.min(48, Math.max(0, dd - 18));
          if (step > 0) {
            o.pullX = o.x + (dx / dd) * step;
            o.pullY = o.y + (dy / dd) * step;
            o.pullT = 0.4;
          }
          this.slow(o, 0.7);
        }
      }
      if (def.grove === 'heal') this.placeGrove(p, pt.x, pt.y, tune.radius, 4);
      if (ult) {
        p.ultCharge = 0;
        this.ultLand(p, pt.x, pt.y, def.element);
      }
      return;
    }
    pay();
    const travel = form === 'bolt' ? Math.max(def.speed, 1040) : form === 'beam' ? Math.max(def.speed, 1200) : def.speed;
    this.pushPowerShot(p, ang, def, dmg, form === 'rock' ? Math.max(knock, 200) : knock, slot, travel, tune.range / travel, form === 'wave' || form === 'fissure' || form === 'beam' || !!def.pass);
    abilityTrace(p.id, 'launch', def.name);
    this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, form });
  }

  /** Alvo à frente, dentro do cone e com linha de visão. */
  private inCone(p: Player, o: Player, ang: number, reach: number, arc: number) {
    if (!o.alive || !o.playing || !this.hostile(p, o)) return false;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const dd = Math.hypot(dx, dy);
    if (dd > reach || dd < 1) return false;
    let diff = Math.abs(Math.atan2(dy, dx) - ang);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > arc) return false;
    return this.sight(p.x, p.y, o.x, o.y, p.id);
  }

  /** Até onde a fissura anda antes da parede. */
  private groundLen(x: number, y: number, ang: number, reach: number) {
    let len = reach;
    for (let d = 18; d <= reach; d += 8) {
      if (!this.isFree(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 8)) {
        len = Math.max(16, d - 8);
        break;
      }
    }
    return len;
  }

  private pushPowerShot(p: Player, ang: number, def: PowerDef, dmg: number, knock: number, slot: number, speed: number, life: number, pierce: boolean) {
    const form = formOf(def, slot);
    const muzzle = 18;
    const home = def.home ? this.nearestHostile(p, def.range) : null;
    const sx = p.x + Math.cos(ang) * muzzle;
    const sy = p.y - GUN_Y + Math.sin(ang) * muzzle;
    this.bullets.push({
      id: this.fragId++,
      x: sx,
      y: sy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      owner: p.id,
      dmg,
      life,
      weapon: VISUAL_WEAPON[def.element],
      pierce,
      fromEcho: false,
      hit: [],
      el: def.element,
      knock,
      homeId: home?.id,
      slot,
      mark: !!def.mark,
      form,
      curve: form === 'blade' ? (p.id.charCodeAt(0) % 2 === 0 ? 1 : -1) : undefined,
      aim: form === 'blade' ? ang : undefined,
      flown: form === 'blade' ? 0 : undefined,
      spawnX: form === 'blade' ? sx : undefined,
      spawnY: form === 'blade' ? sy : undefined,
      area: def.speed <= 0,
    });
  }

  /** Efeito já pago: arrancada, piscar, ilusão, bosque ou muralha. */
  private playAct(p: Player, def: PowerDef, ang: number, inp: Input | undefined, dmg: number, tune?: { range: number; radius: number; step: number }, slot = -1) {
    const range = tune?.range ?? def.range;
    const radius = tune?.radius ?? def.radius;
    const step = tune?.step ?? def.step ?? BLINK_STEP;
    this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, r: radius });
    if (def.act === 'dash') {
      p.dir = ang;
      const full = C.DASH_SPEED * C.DASH_TIME;
      const want = inp && typeof inp.cr === 'number' ? Math.max(16, Math.min(full, inp.cr)) : full;
      p.dashT = want / C.DASH_SPEED;
      p.dashDmg = dmg;
      p.dashEl = def.element;
      p.dashHit = [];
      p.flowT = Math.max(p.flowT, FLOW_TIME);
      this.events.push({ type: 'dash', x: p.x, y: p.y, pid: p.id, el: def.element, ang });
    } else if (def.act === 'blink') {
      const ox = p.x;
      const oy = p.y;
      const reach = inp && typeof inp.cr === 'number' ? Math.min(step, Math.max(8, inp.cr)) : step;
      const moved = this.blinkTo(p, ang, reach);
      this.events.push({ type: 'blink', pid: p.id, x0: ox, y0: oy, x1: p.x, y1: p.y, el: def.element });
      if (def.ghost) this.clones.push({ owner: p.id, x: ox, y: oy, dir: ang + Math.PI, t: 2.6, decoy: true, absorb: 1, pop: cloneDamage(Math.max(6, dmg)) });
      const foe = this.nearestHostile(p, 36);
      if (foe) this.deliverPower(p, foe, def.element, dmg, 0, false, { slot, projectile: false, mark: !!def.mark });
      if (moved > 12) p.ambushT = AMBUSH_TIME;
    } else if (def.act === 'decoy') {
      const ox = p.x + Math.cos(ang) * 48;
      const oy = p.y + Math.sin(ang) * 48;
      const spot = this.isFree(ox, oy, 12) ? { x: ox, y: oy } : { x: p.x, y: p.y };
      this.clones.push({ owner: p.id, x: spot.x, y: spot.y, dir: ang, t: 3.2, decoy: true, absorb: 1, pop: cloneDamage(dmg) });
    } else if (def.act === 'wall') {
      const placed = inp && typeof inp.cr === 'number';
      const spot = placed ? this.castPoint(p, inp, ang, Math.max(range, 1)) : null;
      const reach = Math.min(78, Math.max(48, range));
      const cx = spot ? spot.x : p.x + Math.cos(ang) * reach;
      const cy = spot ? spot.y : p.y + Math.sin(ang) * reach;
      this.raiseWall(p.id, cx, cy, ang, 92, 16, 3.2, 'barreira');
      for (const o of this.players) {
        if (!o.alive || !o.playing || !this.hostile(p, o)) continue;
        if (dist(o.x, o.y, cx, cy) > radius + 8) continue;
        this.slow(o, 1.1);
        this.deliverPower(p, o, def.element, dmg, 0, true, { slot, projectile: false, mark: !!def.mark });
      }
    } else {
      const pt = this.castPoint(p, inp, ang, range);
      this.placeGrove(p, pt.x, pt.y, radius, dmg);
      this.events.push({ type: 'skill', pid: p.id, x: pt.x, y: pt.y, skill: def.element, r: radius });
    }
  }

  private noteCombat(note: CombatNote) {
    this.combatLog.push(note);
    if (this.combatLog.length > 32) this.combatLog.shift();
  }

  private catalogShot(p: Player, ang: number, def: PowerDef, dmg: number, speed: number, trick: string) {
    const form = def.form ?? formOf(def, 0);
    const muzzle = 18;
    const sx = p.x + Math.cos(ang) * muzzle;
    const sy = p.y - GUN_Y + Math.sin(ang) * muzzle;
    this.bullets.push({
      id: this.fragId++,
      x: sx,
      y: sy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      owner: p.id,
      dmg,
      life: def.range / speed,
      weapon: VISUAL_WEAPON[def.element],
      pierce: false,
      fromEcho: false,
      hit: [],
      el: def.element,
      knock: trick === 'tide' ? 180 : KNOCK[def.element],
      slot: -1,
      form,
      trick,
      curve: form === 'blade' ? (p.id.charCodeAt(0) % 2 === 0 ? 1 : -1) : undefined,
      aim: form === 'blade' ? ang : undefined,
      flown: form === 'blade' ? 0 : undefined,
      spawnX: form === 'blade' ? sx : undefined,
      spawnY: form === 'blade' ? sy : undefined,
    });
  }

  private placePatch(p: Player, kind: FieldPatch['kind'], x: number, y: number, r: number, t: number, dmg: number, el: Element, hp?: number): FieldPatch {
    const patch: FieldPatch = { id: this.fragId++, owner: p.id, kind, x, y, r, t, total: t, hp, maxHp: hp, acc: 0, dmg, el, hit: [] };
    this.patches.push(patch);
    this.noteCombat({ at: this.worldT, kind: 'zone', owner: p.id, target: '', element: el, ability: kind, dmg, x, y, combo: '' });
    return patch;
  }

  /** Quinze golpes do catálogo. Errar não abre combo. A recarga só cai se o golpe sai. */
  private castCatalog(p: Player, def: PowerDef & { id: string; cost: number }, ang: number, inp?: Input) {
    const trick = def.trick;
    if (!trick || p.plasmaCd > 0) return;
    if (p.energy < def.cost) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente', x: p.x, y: p.y });
      return;
    }
    const pay = (at?: { x: number; y: number; r?: number; form?: string }) => {
      p.energy = clampEnergy(p.energy - def.cost);
      p.plasmaCd = def.cd;
      p.dir = ang;
      this.noteCombat({ at: this.worldT, kind: 'cast', owner: p.id, target: '', element: def.element, ability: def.id, dmg: 0, x: p.x, y: p.y, combo: '' });
      // brilho na mão. A área grande sai no ponto do golpe, não nos pés.
      this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element, trick });
      if (at) this.events.push({ type: 'skill', pid: p.id, x: at.x, y: at.y, skill: def.element, r: at.r ?? def.radius, form: at.form ?? def.form, trick });
      abilityTrace(p.id, 'launch', def.name);
    };
    const foeAt = (x: number, y: number, r: number) => this.players.some((o) => o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, x, y) <= r && this.sight(p.x, p.y, o.x, o.y, p.id));
    if (trick === 'ash') {
      const hit = this.players.filter((o) => this.inCone(p, o, ang, def.range, 0.62));
      if (!hit.length) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido', x: p.x, y: p.y });
        return;
      }
      pay({ x: p.x + Math.cos(ang) * 70, y: p.y + Math.sin(ang) * 70, r: def.radius, form: 'breath' });
      for (const o of hit) this.deliverPower(p, o, 'fire', def.dmg, 20, true, { slot: -1, projectile: false, trick, ability: def.id });
      const x = p.x + Math.cos(ang) * 70;
      const y = p.y + Math.sin(ang) * 70;
      this.placePatch(p, 'ash', x, y, 90, 1.8, 0, 'fire');
      return;
    }
    if (trick === 'stormchain') {
      const first = this.players
        .filter((o) => this.inCone(p, o, ang, def.range, 0.7))
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      if (!first) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido', x: p.x, y: p.y });
        return;
      }
      pay();
      const links = [p.x, p.y, first.x, first.y];
      this.deliverPower(p, first, 'lightning', def.dmg, 30, false, { slot: -1, projectile: true, trick, ability: def.id });
      let from = first;
      let frac = 0.6;
      for (let n = 0; n < 2; n++) {
        const nxt = this.players
          .filter((o) => o !== from && o.alive && o.playing && this.hostile(p, o) && dist(o.x, o.y, from.x, from.y) <= 140 && this.sight(from.x, from.y, o.x, o.y))
          .sort((a, b) => dist(a.x, a.y, from.x, from.y) - dist(b.x, b.y, from.x, from.y))[0];
        if (!nxt) break;
        links.push(nxt.x, nxt.y);
        this.hurt(nxt, Math.max(1, Math.round(def.dmg * frac)), p.id, 'pulse');
        from = nxt;
        frac *= 0.6;
      }
      this.events.push({ type: 'zap', pid: p.id, pts: links });
      return;
    }
    if (trick === 'collapse') {
      pay();
      const have = new Set(equippedElements(p.char.id, p.loadout.secondary));
      const recent = this.combatLog.filter((n) => n.kind === 'hit' && n.owner === p.id && this.worldT - n.at <= COMBO_WINDOW && have.has(n.element) && n.ability !== def.id);
      const els = [...new Set(recent.map((n) => n.element))];
      const pt = this.castPoint(p, inp, ang, def.range);
      this.events.push({ type: 'skill', pid: p.id, x: pt.x, y: pt.y, skill: def.element, r: els.length >= 2 && foeAt(pt.x, pt.y, def.radius) ? def.radius : def.radius * 0.6, form: 'blast', trick });
      if (els.length >= 2 && foeAt(pt.x, pt.y, def.radius)) {
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(p, o) || dist(o.x, o.y, pt.x, pt.y) > def.radius) continue;
          if (!this.sight(pt.x, pt.y, o.x, o.y)) continue;
          this.hurt(o, def.dmg, p.id, 'pulse');
        }
        this.events.push({ type: 'combo', x: pt.x, y: pt.y, name: 'Colapso Elemental', bonus: 0, pid: p.id, vfx: 'burst', id: 'colapso' });
        this.noteCombat({ at: this.worldT, kind: 'combo', owner: p.id, target: '', element: els[0], ability: def.id, dmg: def.dmg, x: pt.x, y: pt.y, combo: 'Colapso Elemental' });
      } else {
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(p, o) || dist(o.x, o.y, pt.x, pt.y) > def.radius * 0.6) continue;
          this.hurt(o, 6, p.id, 'pulse');
        }
      }
      return;
    }
    if (trick === 'volcano') {
      const len = this.groundLen(p.x, p.y, ang, def.range);
      pay();
      for (let i = 0; i < 3; i++) {
        const d = Math.max(36, (len * (i + 1)) / 3);
        this.armPulse({ at: this.roundT + 0.42 + i * 0.38, owner: p.id, x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, r: def.radius, dmg: def.dmg, el: 'fire', kind: 'burst', trick, knock: 40 });
      }
      return;
    }
    if (trick === 'glacial') {
      const pt = this.castPoint(p, inp, ang, def.range);
      pay();
      this.armPulse({ at: this.roundT + 0.55, owner: p.id, x: pt.x, y: pt.y, r: def.radius, dmg: def.dmg, el: 'ice', kind: 'crystal', trick, knock: 0 });
      return;
    }
    if (trick === 'fist') {
      pay();
      const len = this.groundLen(p.x, p.y, ang, def.range);
      for (let i = 0; i < 3; i++) {
        const d = 36 + (len - 36) * (i / 2);
        this.armPulse({ at: this.roundT + i * 0.16, owner: p.id, x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, r: def.radius, dmg: def.dmg, el: 'nature', kind: 'rock', trick, knock: 90 });
      }
      return;
    }
    if (trick === 'mirror' || trick === 'guardian') {
      const reach = Math.min(96, Math.max(48, def.range));
      const cx = p.x + Math.cos(ang) * reach;
      const cy = p.y + Math.sin(ang) * reach;
      pay();
      const kind = trick === 'mirror' ? 'gelo' : 'barreira';
      const hp = trick === 'mirror' ? 36 : 48;
      this.raiseWall(p.id, cx, cy, ang, trick === 'guardian' ? 108 : 84, 16, trick === 'mirror' ? 2.8 : 3.4, kind);
      const wall = this.iceWalls[this.iceWalls.length - 1];
      if (wall) {
        wall.hp = hp;
        wall.maxHp = hp;
        wall.crack = true;
      }
      return;
    }
    if (trick === 'roots') {
      const pt = this.castPoint(p, inp, ang, def.range);
      pay({ x: pt.x, y: pt.y, r: def.radius, form: 'pillar' });
      this.placePatch(p, 'roots', pt.x, pt.y, def.radius, 2.2, def.dmg, 'nature', 32);
      return;
    }
    if (trick === 'step') {
      pay();
      p.dashT = 140 / C.DASH_SPEED;
      p.dashDmg = def.dmg;
      p.dashEl = 'wind';
      p.dashHit = [];
      this.events.push({ type: 'dash', x: p.x, y: p.y, pid: p.id, el: 'wind', ang });
      return;
    }
    if (trick === 'updraft') {
      const pt = this.castPoint(p, inp, ang, def.range);
      pay({ x: pt.x, y: pt.y, r: def.radius, form: 'whirl' });
      this.placePatch(p, 'whirl', pt.x, pt.y, def.radius, 1.15, def.dmg, 'wind');
      return;
    }
    if (trick === 'gale') {
      pay();
      for (const o of this.players) if (this.inCone(p, o, ang, 78, 0.7)) this.deliverPower(p, o, 'wind', def.dmg, 80, true, { slot: -1, projectile: false, trick, ability: def.id });
      this.catalogShot(p, ang, { ...def, range: 220, form: 'blade' }, def.dmg, 640, trick);
      return;
    }
    if (trick === 'lance' || trick === 'tide' || trick === 'rupture') {
      const speed = trick === 'lance' ? 1280 : def.speed;
      pay();
      this.catalogShot(p, ang, def, def.dmg, speed, trick);
      return;
    }
  }

  /** Pulso marcado no chão. O aviso dura até o acerto, e o dano só cai nesse instante. */
  private armPulse(s: ScheduledPulse) {
    this.pulses.push(s);
    const wait = Math.max(0.05, s.at - this.roundT);
    this.events.push({ type: 'windup', pid: s.owner, x: s.x, y: s.y, el: s.el, t: wait, r: s.r });
  }

  private updateCatalog(dt: number) {
    const now = this.roundT;
    for (const s of this.pulses) {
      if (now < s.at) continue;
      s.at = Infinity;
      this.pulseHit(s);
    }
    this.pulses = this.pulses.filter((s) => s.at < Infinity);
    for (const z of this.patches) {
      z.t -= dt;
      z.acc += dt;
      const src = this.players.find((p) => p.id === z.owner);
      if (!src) continue;
      if (z.kind === 'roots') {
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(src, o) || dist(o.x, o.y, z.x, z.y) > z.r) continue;
          this.slow(o, 0.25);
          if ((o.rootT ?? 0) <= 0 && (o.rootResistT ?? 0) <= 0 && !z.hit.includes(o.id)) {
            z.hit.push(o.id);
            const hold = (o.ccResistT ?? 0) > 0 ? 0.22 : 0.45;
            this.applyRoot(o, hold);
            this.hurt(o, z.dmg, src.id, 'pulse');
          }
        }
      } else if (z.kind === 'whirl' && z.acc >= 0.15 && z.t > 0.2) {
        z.acc = 0;
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(src, o) || dist(o.x, o.y, z.x, z.y) > z.r) continue;
          const d = dist(o.x, o.y, z.x, z.y) || 1;
          const step = Math.min(22, d);
          o.pullX = o.x + ((z.x - o.x) / d) * step;
          o.pullY = o.y + ((z.y - o.y) / d) * step;
          o.pullT = 0.16;
        }
      } else if (z.kind === 'whirl' && !z.blown && z.t <= 0.2) {
        z.blown = true;
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(src, o) || dist(o.x, o.y, z.x, z.y) > z.r + 8) continue;
          const d = dist(o.x, o.y, z.x, z.y) || 1;
          o.pullT = 0;
          this.knock(o, ((o.x - z.x) / d) * 280, ((o.y - z.y) / d) * 280);
          if (!z.hit.includes(o.id)) {
            z.hit.push(o.id);
            this.deliverPower(src, o, 'wind', z.dmg, 80, true, { slot: -1, projectile: false, trick: 'updraft', ability: 'vortice-ascendente' });
          }
        }
        this.events.push({ type: 'skill', pid: src.id, x: z.x, y: z.y, skill: 'wind', r: z.r, form: 'gust', trick: 'updraft' });
      } else if (z.kind === 'abyss') {
        for (const o of this.players) {
          if (!o.alive || !this.hostile(src, o) || dist(o.x, o.y, z.x, z.y) > z.r) continue;
          this.slow(o, 0.2);
          o.vx *= 0.82;
          o.vy *= 0.82;
        }
      }
    }
    this.patches = this.patches.filter((z) => z.t > 0 && (z.hp === undefined || z.hp > 0));
  }

  /** Dano só no ponto do pulso. Quem saiu antes não leva. */
  private pulseHit(s: ScheduledPulse) {
    const src = this.players.find((p) => p.id === s.owner);
    if (!src) return;
    this.events.push({ type: 'skill', pid: src.id, x: s.x, y: s.y, skill: s.el, r: s.r, form: s.kind === 'crystal' ? 'pillar' : s.kind === 'rock' ? 'rock' : 'blast', trick: s.trick });
    let any = false;
    for (const o of this.players) {
      if (!o.alive || !o.playing || !this.hostile(src, o) || dist(o.x, o.y, s.x, s.y) > s.r) continue;
      if (!this.sight(s.x, s.y, o.x, o.y)) continue;
      any = true;
      if (s.kind === 'crystal') {
        this.hurt(o, s.dmg, src.id, 'pulse');
        this.slow(o, 1.1);
        if (dist(o.x, o.y, s.x, s.y) < s.r * 0.55) this.applyRoot(o, (o.ccResistT ?? 0) > 0 ? 0.2 : 0.4);
      } else if (s.kind === 'rock') {
        this.hurt(o, s.dmg, src.id, 'pulse');
        const d = dist(o.x, o.y, s.x, s.y) || 1;
        this.knock(o, ((o.x - s.x) / d) * s.knock, ((o.y - s.y) / d) * s.knock);
      } else {
        this.deliverPower(src, o, s.el, s.dmg, s.knock, true, { slot: -1, projectile: false, trick: s.trick, ability: s.trick });
      }
    }
    if (!any) this.events.push({ type: 'pend', x: s.x, y: s.y, el: s.el });
  }

  /** Poder extra do Z. Plasma mantém a marca. Os outros usam o mesmo combate do kit. */
  private castPlasma(p: Player, ang: number, inp?: Input) {
    const def = studioOf(p.loadout.secondary);
    if (!p.plasmaOn || !def) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Habilidade ainda não desbloqueada' });
      abilityTrace(p.id, 'deny', 'locked');
      return;
    }
    if (p.plasmaCd > 0) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Habilidade em recarga', x: p.x, y: p.y });
      return;
    }
    if (def.id === 'plasma') {
      if (p.energy < PLASMA.cost) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente' });
        abilityTrace(p.id, 'deny', 'energy');
        return;
      }
      p.energy = clampEnergy(p.energy - PLASMA.cost);
      p.plasmaCd = PLASMA.cd;
      const muzzle = 18;
      this.bullets.push({
        id: this.fragId++,
        x: p.x + Math.cos(ang) * muzzle,
        y: p.y - GUN_Y + Math.sin(ang) * muzzle,
        vx: Math.cos(ang) * PLASMA.speed,
        vy: Math.sin(ang) * PLASMA.speed,
        owner: p.id,
        dmg: PLASMA.dmg,
        life: PLASMA.range / PLASMA.speed,
        weapon: 'pulsador',
        pierce: false,
        fromEcho: false,
        hit: [],
        plasma: true,
      });
      abilityTrace(p.id, 'launch', PLASMA.name);
      this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: 'plasma' });
      return;
    }
    if ((def.act === 'dash' || def.act === 'blink' || def.trick === 'step') && p.rootT > 0) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Preso pelas raízes' });
      return;
    }
    if (def.trick) {
      this.castCatalog(p, def, ang, inp);
      return;
    }
    if (p.energy < def.cost) {
      this.events.push({ type: 'deny', pid: p.id, msg: 'Energia insuficiente' });
      abilityTrace(p.id, 'deny', 'energy');
      return;
    }
    if (def.act === 'dash' || def.act === 'blink' || def.act === 'decoy' || def.act === 'zone' || def.act === 'wall') {
      p.energy = clampEnergy(p.energy - def.cost);
      p.plasmaCd = def.cd;
      abilityTrace(p.id, 'launch', def.name);
      this.playAct(p, def, ang, inp, def.dmg, undefined, -1);
      return;
    }
    if (def.speed <= 0) {
      const pt = this.castPoint(p, inp, ang, def.range);
      const los = def.los !== false;
      if (!this.foeInRadius(p, pt.x, pt.y, def.radius, los)) {
        this.events.push({ type: 'deny', pid: p.id, msg: 'Nenhum alvo válido' });
        abilityTrace(p.id, 'deny', 'target');
        return;
      }
      p.energy = clampEnergy(p.energy - def.cost);
      p.plasmaCd = def.cd;
      abilityTrace(p.id, 'impact', def.name);
      this.events.push({ type: 'skill', pid: p.id, x: pt.x, y: pt.y, skill: def.element, r: def.radius });
      for (const o of this.players) {
        if (!o.alive || !o.playing || !this.hostile(p, o)) continue;
        if (dist(o.x, o.y, pt.x, pt.y) > def.radius) continue;
        if (los && !this.sight(p.x, p.y, o.x, o.y, p.id)) continue;
        this.deliverPower(p, o, def.element, def.dmg, KNOCK[def.element], true, { slot: -1, projectile: false });
        if (def.yank && def.yank > 0) {
          const dx = p.x - o.x;
          const dy = p.y - o.y;
          const d = Math.hypot(dx, dy) || 1;
          const step = Math.min(def.yank, d);
          o.pullX = o.x + (dx / d) * step;
          o.pullY = o.y + (dy / d) * step;
          o.pullT = 0.45;
        }
      }
      return;
    }
    p.energy = clampEnergy(p.energy - def.cost);
    p.plasmaCd = def.cd;
    const muzzle = 18;
    this.bullets.push({
      id: this.fragId++,
      x: p.x + Math.cos(ang) * muzzle,
      y: p.y - GUN_Y + Math.sin(ang) * muzzle,
      vx: Math.cos(ang) * def.speed,
      vy: Math.sin(ang) * def.speed,
      owner: p.id,
      dmg: def.dmg,
      life: def.range / def.speed,
      weapon: VISUAL_WEAPON[def.element],
      pierce: false,
      fromEcho: false,
      hit: [],
      el: def.element,
      knock: KNOCK[def.element],
      slot: -1,
    });
    abilityTrace(p.id, 'launch', def.name);
    this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: def.element });
  }

  /** Projétil da suprema que acabou sem acertar ninguém: cai onde parou. */
  private landUltShot(b: Bullet) {
    if (b.slot !== 2 || !b.el || b.landed || b.fromEcho) return;
    b.landed = true;
    const src = this.players.find((q) => q.id === b.owner);
    if (src) this.ultLand(src, b.x, b.y, b.el);
  }

  /** Marca de 4 s. O dano do projétil não passa do valor da habilidade. */
  private deliverPlasma(src: Player, dst: Player, damage: number) {
    if (!dst.alive || dst.invulnT > 1 || dst.phaseT > 0 || dst.dodgeT > 0 || !this.hostile(src, dst)) return;
    this.events.push({ type: 'phit', x: dst.x, y: dst.y, el: 'plasma', pid: src.id });
    this.hurt(dst, Math.min(PLASMA.dmg, Math.max(0, damage)), src.id, 'pulse');
    if (dst.alive) dst.plasmaT = PLASMA.mark;
  }

  /** Uma reação por golpe. O bônus entra no mesmo dano, uma vez. */
  private deliverPower(src: Player, dst: Player, element: Element, damage: number, knock: number, aoe = false, cast?: { slot?: number; projectile?: boolean; mark?: boolean; trick?: string; ability?: string }) {
    if (!dst.alive || dst.invulnT > 1 || dst.phaseT > 0 || dst.dodgeT > 0 || !this.hostile(src, dst)) return 0;
    if (tuneBlocks(this.arena, src.x, src.y, dst.x, dst.y, this.worldT)) return 0;
    this.events.push({ type: 'phit', x: dst.x, y: dst.y, el: element, pid: src.id, aoe });
    const aura = { burn: dst.burnT, frozen: dst.frozenT, gust: dst.gustT, shock: dst.shockT, root: dst.rootT, marked: dst.markedT, field: dst.fieldT, fieldEl: dst.fieldEl, stun: dst.stunT, plasma: dst.plasmaPrimeT, combo: dst.comboT, rupture: dst.ruptureT };
    const extra = bonusDamage(src.char.id, aura, dst.stunT > 0);
    const move = this.mobilityBonus(src);
    const nearFire = this.ultZones.some((z) => z.el === 'fire' && z.t > 0 && dist(z.x, z.y, dst.x, dst.y) < z.r + 36);
    const reaction = resolveReaction({
      charId: src.char.id,
      element,
      aoe,
      projectile: !!cast?.projectile,
      slot: cast?.slot ?? -1,
      appliesMark: !!cast?.mark,
      roots: element === 'nature',
      aura,
      marked: dst.markedT,
      field: dst.fieldT,
      fieldEl: dst.fieldEl,
      stun: dst.stunT,
      reactCd: dst.reactCd,
      slow: dst.slowT,
      ctrl: dst.ctrlT,
      rupture: dst.ruptureT,
      trick: cast?.trick,
      nearFire,
    });
    if (reaction?.clearFrozen) {
      dst.frozenT = 0;
      dst.slowT = 0;
    }
    if (reaction?.clearBurn) {
      dst.burnT = 0;
      dst.burnAcc = 0;
    }
    if (reaction?.clearGust) dst.gustT = 0;
    if (reaction?.clearShock) dst.shockT = 0;
    if (reaction?.clearRoot) dst.rootT = 0;
    if (reaction?.clearMarked) dst.markedT = 0;
    if (reaction?.clearField) {
      dst.fieldT = 0;
      dst.fieldEl = '';
    }
    if (reaction?.clearPlasma) dst.plasmaPrimeT = 0;
    if (reaction?.reactLock) dst.reactCd = reaction.reactLock;
    if (reaction?.clearCtrl) dst.ctrlT = 0;
    if (reaction?.clearRupture) dst.ruptureT = 0;
    else if (reaction && (dst.ruptureT ?? 0) > 0 && cast?.trick !== 'rupture') dst.ruptureT = 0;
    const frozeNow = !!reaction?.hold;
    const bonus = reaction ? (reaction.id === 'root-aoe' ? Math.min(reaction.bonus, Math.max(0, EXTRA_CAP - move)) : reaction.bonus) : 0;
    const plasma = dst.plasmaT > 0;
    let burst = 0;
    if (plasma) {
      dst.plasmaT = 0;
      burst = Math.min(PLASMA.burst, Math.max(0, PLASMA.cap - (damage + extra)));
    }
    const hpBefore = dst.hp;
    this.hurt(dst, damage + extra + move + bonus, src.id, 'pulse');
    this.noteCombat({ at: this.worldT, kind: 'hit', owner: src.id, target: dst.id, element, ability: cast?.ability ?? cast?.trick ?? element, dmg: damage + bonus, x: dst.x, y: dst.y, combo: reaction?.name ?? '' });
    if (!dst.alive && hpBefore > 0 && bonus > 0 && reaction) this.offerFinisher(src, dst, reaction.name, element, aura);
    if ((this.mode === 'duelo' || this.mode === 'dupla') && !src.boss) src.ultCharge = Math.min(100, src.ultCharge + COMBAT.ult.perAbility);
    if (burst > 0 && dst.alive) {
      this.hurt(dst, burst, src.id, 'pulse');
      this.events.push({ type: 'combo', x: dst.x, y: dst.y, name: 'Explosão de Plasma', bonus: burst, pid: src.id, vfx: 'burst' });
      src.comboStacks = Math.min(8, src.comboStacks + 1);
    }
    if (dst.alive) {
      if (cast?.trick === 'rupture') {
        dst.ruptureT = Math.max(dst.ruptureT ?? 0, RUPTURE_TIME);
        this.events.push({ type: 'mark', x: dst.x, y: dst.y - 28, pid: dst.id });
      } else if (element === 'fire') {
        dst.burnT = BURN_TIME;
        dst.burnDps = burnDpsOf(src.char.id);
        dst.burnFrom = src.id;
        dst.burnAcc = 0;
      } else if (element === 'ice') {
        if (frozeNow) {
          // Congelamento: preso no gelo, sem andar nem conjurar. Não molha de novo (não encadeia).
          dst.iceT = reaction!.hold!;
          this.stun(dst, reaction!.hold!);
        } else {
          dst.frozenT = FROZEN_TIME;
          this.slow(dst, FROZEN_TIME);
        }
      } else if (element === 'lightning') dst.shockT = MARK_WINDOW;
      else if (element === 'wind') dst.gustT = MARK_WINDOW;
      else if (element === 'nature' && !cast?.mark) this.applyRoot(dst, reaction?.rootAdd ?? ROOT_TIME);
      else if (cast?.mark) {
        dst.markedT = MARK_WINDOW;
        this.events.push({ type: 'mark', x: dst.x, y: dst.y, pid: dst.id });
      }
      if (aoe && !cast?.mark) {
        dst.fieldT = FIELD_WINDOW;
        dst.fieldEl = element;
      }
      if (element === 'plasma' && cast?.projectile && !aoe && (cast.slot ?? -1) !== 2 && !reaction?.clearPlasma) dst.plasmaPrimeT = MARK_WINDOW;
      dst.comboT = COMBO_WINDOW;
    }
    if (reaction?.id === 'freeze') {
      this.events.push({ type: 'skill', pid: src.id, x: dst.x, y: dst.y, skill: 'ice', r: 78, form: 'wave' });
      for (const o of this.players) {
        if (o === dst || !o.alive || !o.playing || !this.hostile(src, o)) continue;
        if (dist(o.x, o.y, dst.x, dst.y) < 78 && this.sight(dst.x, dst.y, o.x, o.y)) this.slow(o, 0.8);
      }
    }
    if (reaction?.zone) this.placePatch(src, 'abyss', dst.x, dst.y, reaction.zone, 1.3, 0, 'ice');
    if (bonus > 0 && reaction) {
      this.events.push({ type: 'combo', x: dst.x, y: dst.y, name: reaction.name, bonus, pid: src.id, vfx: reaction.vfx, id: reaction.id });
      src.comboStacks = Math.min(8, src.comboStacks + 1);
      if (isElemental(reaction.id)) {
        const refund = refundOnCombo(src.char.id);
        if (refund) for (let i = 0; i < 4; i++) src.powerCd[i] = Math.max(0, src.powerCd[i] - refund);
        const healN = healOnCombo(src.char.id);
        if (healN && src.alive) this.heal(src, src, healN);
      }
      if (reaction.aoe) {
        for (const o of this.players) {
          if (o === dst || !o.alive || !o.playing || !this.hostile(src, o)) continue;
          if (dist(o.x, o.y, dst.x, dst.y) < reaction.aoe && this.sight(dst.x, dst.y, o.x, o.y)) this.hurt(o, reaction.bonus * 0.5, src.id, 'pulse');
        }
      }
      for (const o of this.players) {
        if (o === dst || !o.alive || !o.playing || !this.hostile(src, o)) continue;
        const d = dist(o.x, o.y, dst.x, dst.y);
        // Vórtice: puxa quem está perto para o alvo
        if (reaction.pull && d < reaction.pull && d > 1) {
          const step = Math.min(56, d - 18);
          if (step > 0) {
            o.pullX = o.x + ((dst.x - o.x) / d) * step;
            o.pullY = o.y + ((dst.y - o.y) / d) * step;
            o.pullT = 0.35;
          }
          this.slow(o, 0.8);
        }
        // Inferno Espiral: a chama gira e pega em quem está perto
        if (reaction.spreadBurn && d < reaction.spreadBurn && this.sight(dst.x, dst.y, o.x, o.y)) {
          o.burnT = Math.max(o.burnT, BURN_TIME * 0.6);
          o.burnDps = Math.max(o.burnDps, burnDpsOf(src.char.id));
          o.burnFrom = src.id;
        }
      }
    }
    if (!dst.alive) return bonus > 0 && reaction?.aoe ? reaction.aoe : 0;
    if (element === 'lightning' && cast?.trick !== 'rupture') this.stun(dst, stunTime(src.char.id));
    if (element === 'plasma') {
      const ang = Math.atan2(dst.y - src.y, dst.x - src.x);
      this.knock(dst, Math.cos(ang) * knock, Math.sin(ang) * knock);
    } else if (element === 'wind') {
      const slammed = wallSlam(src.x, src.y, dst.x, dst.y, WALL_REACH, (x, y) => !this.isFree(x, y, 10));
      if (slammed) {
        this.stun(dst, wallStun(src.char.id));
        this.hurt(dst, WALL_BONUS, src.id, 'pulse');
        this.events.push({ type: 'combo', x: dst.x, y: dst.y, name: 'Pancada', bonus: WALL_BONUS, pid: src.id });
        src.comboStacks = Math.min(8, src.comboStacks + 1);
      }
      const ang = Math.atan2(dst.y - src.y, dst.x - src.x);
      const k = knock * knockMul(src.char.id);
      this.knock(dst, Math.cos(ang) * k, Math.sin(ang) * k);
      const gs = gustSlow(src.char.id);
      if (gs) this.slow(dst, gs);
    } else if (knock > 0) {
      const ang = Math.atan2(dst.y - src.y, dst.x - src.x);
      this.knock(dst, Math.cos(ang) * knock, Math.sin(ang) * knock);
    }
    return bonus > 0 && reaction?.aoe ? reaction.aoe : 0;
  }

  private fire(p: Player) {
    const w = WEAPONS[p.weapon];
    // atirar revela quem está em fase/sombra (invulnerabilidade nunca vem junto com ataque)
    if (p.phaseT > 0) p.phaseT = 0;
    p.fireCd = w.cooldown * (p.turboT > 0 ? 0.8 : 1) * (p.overT > 0 ? 0.74 : 1) * (p.boss && this.bossPhase >= 3 ? 0.85 : 1);
    this.spawnBullets(p.x, p.y, p.aim, p.weapon, p.id, false);
    p.recorder?.event(this.roundT * 1000, 'shoot', { a: Math.round(p.aim * 100) / 100, w: p.weapon });
    this.events.push({ type: 'shoot', x: p.x, y: p.y, pid: p.id, weapon: p.weapon });
    if (w.ammo > 0) {
      p.ammo--;
      if (p.ammo <= 0) p.weapon = this.primaryFor(p);
    }
  }

  private throwBomb(x: number, y: number, ang: number, owner: string, fromEcho: boolean, tx?: number, ty?: number, ice = false, pulse = false) {
    let ex = tx ?? x + Math.cos(ang) * 210;
    let ey = ty ?? y + Math.sin(ang) * 210;
    // não atravessa paredes: para no primeiro obstáculo
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const cx = x + (ex - x) * k;
      const cy = y + (ey - y) * k;
      if (!this.isFree(cx, cy, 6)) {
        ex = x + (ex - x) * ((i - 1) / steps);
        ey = y + (ey - y) * ((i - 1) / steps);
        break;
      }
    }
    this.bombs.push({ id: this.fragId++, x, y, sx: x, sy: y, tx: ex, ty: ey, t: 0, owner, fromEcho, ice, pulse });
    return { tx: ex, ty: ey };
  }

  private useItem(p: Player) {
    const t = this.roundT * 1000;
    if (p.item === 'bomba') {
      const target = this.throwBomb(p.x, p.y, p.aim, p.id, false);
      p.recorder?.event(t, 'bomb', { tx: Math.round(target.tx), ty: Math.round(target.ty) });
    } else if (p.item === 'mina') {
      this.mines.push({ id: this.fragId++, x: p.x, y: p.y, owner: p.id, armT: 0.7 });
      p.recorder?.event(t, 'mine');
    } else if (p.item === 'gelo') {
      this.throwBomb(p.x, p.y, p.aim, p.id, false, undefined, undefined, true);
    } else if (p.item === 'pulso') {
      const target = this.throwBomb(p.x, p.y, p.aim, p.id, false, undefined, undefined, false, true);
      p.recorder?.event(t, 'bomb', { tx: Math.round(target.tx), ty: Math.round(target.ty), w: 'pulso' });
    } else if (p.item === 'kit') {
      this.heal(p, p, KIT_HEAL);
      this.events.push({ type: 'heal', x: p.x, y: p.y, pid: p.id });
    }
    this.use(p, ITEMS[p.item!].name);
    p.itemN--;
    if (p.itemN <= 0) p.item = null;
    this.events.push({ type: 'ability', x: p.x, y: p.y, pid: p.id, ability: p.item ?? 'item' });
  }

  private explode(x: number, y: number, r: number, dmg: number, owner: string, fromEcho: boolean) {
    this.events.push({ type: 'explode', x, y, r });
    const ot = owner === 'boss' ? -2 : this.teamOf(owner);
    if (owner !== 'boss' && this.enemyHostileTo({ team: ot }))
      for (const e of this.enemies) {
        const d = dist(e.x, e.y, x, y);
        if (d > r + ENEMY_STATS[e.kind].r) continue;
        this.hurtEnemy(e, dmg * (1 - (d / (r + 30)) * 0.6) * 1.2, fromEcho ? null : owner);
        if (e.kind !== 'boss' && e.kind !== 'pylon') {
          e.vx += ((e.x - x) / (d || 1)) * 420;
          e.vy += ((e.y - y) / (d || 1)) * 420;
        }
      }
    for (const o of this.players) {
      if (!o.alive || !o.playing || dmg <= 0) continue;
      const d = dist(o.x, o.y, x, y);
      if (d > r) continue;
      if (o.id !== owner && ot >= 0 && o.team === ot) continue;
      if (o.id === owner && this.rules.teams) continue;
      const self = o.id === owner && !fromEcho;
      const k = 1 - (d / r) * 0.6;
      this.hurt(o, dmg * k * (self ? 0.5 : 1) * (fromEcho ? ECHO_DAMAGE_MULT : 1), fromEcho ? null : owner, fromEcho ? 'echo' : 'blast', Math.atan2(o.y - y, o.x - x));
      const nx = (o.x - x) / (d || 1);
      const ny = (o.y - y) / (d || 1);
      this.knock(o, nx * 520 * k, ny * 520 * k);
    }
    this.hitTurrets(x, y, r, owner, dmg);
    this.damageCover(x, y, r, dmg * 0.8);
    for (const e of this.echoViews) if (e.active && !e.disrupted && dist(e.x, e.y, x, y) < r) this.disrupted.set(e.key, this.roundT + 2.5);
  }

  /** pulso: explosão menor que atordoa rivais na área */
  private pulseBlast(x: number, y: number, owner: string, fromEcho: boolean) {
    this.explode(x, y, PULSE_RADIUS, PULSE_DAMAGE, owner, fromEcho);
    const op = this.players.find((q) => q.id === owner);
    for (const o of this.players) {
      if (!o.alive || !o.playing || o.id === owner || dist(o.x, o.y, x, y) > PULSE_RADIUS) continue;
      if (op && !this.hostile(op, o)) continue;
      this.stun(o, 0.4);
    }
  }

  /** granada de gelo: pouco dano, deixa todos na área lentos */
  private iceBlast(x: number, y: number, owner: string) {
    this.events.push({ type: 'castHit', kind: 'estase', x, y, r: ICE_RADIUS, ang: 0, len: 0 });
    const op = this.players.find((q) => q.id === owner);
    for (const o of this.players) {
      if (!o.alive || !o.playing || dist(o.x, o.y, x, y) > ICE_RADIUS) continue;
      if (op && !this.hostile(op, o)) continue;
      this.slow(o, 2.5);
      this.hurt(o, ICE_DAMAGE, owner, 'pulse');
    }
    if (!op || this.enemyHostileTo(op)) for (const e of this.enemies) if (dist(e.x, e.y, x, y) < ICE_RADIUS + ENEMY_STATS[e.kind].r) e.slowT = Math.max(e.slowT, 2.5);
  }

  /** explosões e tiros também derrubam torretas inimigas */
  private hitTurrets(x: number, y: number, r: number, owner: string, dmg: number) {
    const ot = this.teamOf(owner);
    for (const t of this.turrets) {
      if (t.owner === owner) continue;
      const tt = this.teamOf(t.owner);
      if (ot >= 0 && tt === ot) continue;
      if (dist(t.x, t.y, x, y) > r + 14) continue;
      t.hp -= dmg;
      if (t.hp <= 0 && t.t > 0) {
        t.t = 0;
        this.events.push({ type: 'explode', x: t.x, y: t.y, r: 40 });
      }
    }
  }

  /** dano com vida (modos com combate). Toda fonte de dano passa por aqui. */
  hurt(p: Player, dmg: number, by: string | null, cause: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse' | 'shot' | 'blast', dir?: number) {
    // invulnT > 1 = proteção de início de rodada/renascer (o resto só evita repetir dano de Eco/perigo)
    if (!p.alive || dmg <= 0) return;
    if (p.phaseT > 0 || p.invulnT > 1) {
      if (cause === 'pulse' || cause === 'shot' || cause === 'blast') this.events.push({ type: 'dmg', pid: p.id, x: p.x, y: p.y, n: 0, k: 'immune' });
      return;
    }
    // morte súbita: o dano base dobra uma vez. Não acumula a cada passo.
    if (this.sudden) dmg *= DUEL.mult;
    if (p.dodgeT > 0) {
      this.events.push({ type: 'dmg', pid: p.id, x: p.x, y: p.y, n: 0, k: 'dodge' });
      return;
    }
    const src = by ? this.players.find((o) => o.id === by) ?? null : null;
    if (p.markT > 0) dmg *= COMBAT.markMult;
    const weak = false;
    if (p.exhaustT > 0) dmg *= BOSS.exhaustMult;
    if (p.shieldT > 0) dmg *= COMBAT.shieldSideDamage;
    if (p.shieldHp > 0) {
      const absorbed = Math.min(p.shieldHp, dmg);
      p.shieldHp -= absorbed;
      dmg -= absorbed;
      this.events.push({ type: 'dmg', pid: p.id, x: p.x, y: p.y, n: Math.round(absorbed), k: 'shield' });
      if (dmg <= 0) return;
    }
    p.hp -= dmg;
    p.tookDamage = true;
    p.hitFlash = 0.25;
    p.lastHurtAt = this.roundT;
    p.stats.taken += dmg;
    if (!p.boss) p.ultCharge = Math.min(100, p.ultCharge + dmg * COMBAT.ult.perDamageTaken);
    // origem do dano: quem causou, ou de onde veio o tiro/explosão
    let sx: number | undefined;
    let sy: number | undefined;
    if (src && src !== p) {
      sx = src.x;
      sy = src.y;
    } else if (dir !== undefined) {
      sx = p.x - Math.cos(dir) * 140;
      sy = p.y - Math.sin(dir) * 140;
    }
    const kind: DmgSrc = cause === 'echo' || cause === 'own' ? 'eco' : cause === 'hazard' || cause === 'fall' ? 'perigo' : cause === 'blast' ? 'explosao' : cause === 'pulse' ? 'golpe' : !by ? 'criatura' : 'arma';
    const note = cause === 'echo' ? 'ECO DA RODADA ANTERIOR' : cause === 'own' ? 'SEU ECO' : undefined;
    this.events.push({ type: 'dmg', pid: p.id, x: p.x, y: p.y, n: Math.max(1, Math.round(dmg)), k: weak ? 'weak' : 'hp', sx: sx === undefined ? undefined : Math.round(sx), sy: sy === undefined ? undefined : Math.round(sy), src: kind, note });
    const hitBy: 'echo' | 'own' | 'hazard' | 'fall' | 'pulse' = cause === 'echo' ? 'echo' : cause === 'own' ? 'own' : cause === 'fall' ? 'fall' : cause === 'hazard' ? 'hazard' : 'pulse';
    this.events.push({ type: 'hit', x: p.x, y: p.y, pid: p.id, by: hitBy });
    if (src && src !== p && this.hostile(src, p)) {
      src.stats.dmg += dmg;
      if (!src.boss) src.ultCharge = Math.min(100, src.ultCharge + dmg * COMBAT.ult.perDamageDealt);
      if (src.vampT > 0) this.heal(src, src, dmg * COMBAT.vampFrac);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.deaths++;
      p.castT = 0;
      p.pendingCast = null;
      p.chargeT = 0;
      this.clearMarks(p);
      if (this.rules.respawn) p.respawnT = RESPAWN_TIME;
      else p.recorder?.finish(this.roundT * 1000, p.x, p.y, p.dir);
      const killer = src;
      if (killer && killer !== p) {
        killer.kills++;
        if (!killer.boss) killer.ultCharge = Math.min(100, killer.ultCharge + COMBAT.ult.perKill);
      }
      this.events.push({ type: 'kill', pid: p.id, by: killer && killer !== p ? killer.id : null, x: p.x, y: p.y });
      this.events.push({ type: 'eliminated', x: p.x, y: p.y, pid: p.id });
      // deixa uma cura no lugar
      if (this.powerups.length < 6 && !this.rules.respawn) this.powerups.push({ id: this.fragId++, kind: 'cura', x: p.x, y: p.y, age: 0 });
    }
  }

  /** Vizinhos do impacto, uma vez. Não passa de novo pelo combo do alvo principal. */
  private splashAround(src: Player, primary: Player, b: Bullet, radius: number, frac: number, wet: boolean, skip = 0) {
    for (const o of this.players) {
      if (o === primary || !o.alive || !o.playing || b.hit.includes(o.id) || !this.hostile(src, o)) continue;
      if (dist(o.x, o.y, primary.x, primary.y) > radius) continue;
      if (skip > 0 && dist(o.x, o.y, primary.x, primary.y) < skip) continue;
      if (!this.sight(primary.x, primary.y, o.x, o.y)) continue;
      b.hit.push(o.id);
      if (wet) this.slow(o, 0.6);
      const n = Math.round(b.dmg * frac);
      if (n > 0) this.hurt(o, n, src.id, 'pulse');
      this.events.push({ type: 'phit', x: o.x, y: o.y, el: b.el ?? 'fire', pid: src.id, aoe: true });
    }
  }

  private updateCombat(dt: number) {
    // balas
    for (const b of this.bullets) {
        if (b.homeId) this.steerHome(b, dt);
        if (!b.bent) {
          const rift = this.patches.find((z) => z.kind === 'rift' && z.t > 0 && dist(b.x, b.y, z.x, z.y) < z.r);
          if (rift) {
            b.bent = true;
            const sp = Math.hypot(b.vx, b.vy) || 1;
            const lx = -b.vy / sp;
            const ly = b.vx / sp;
            b.vx += lx * 90;
            b.vy += ly * 90;
          }
        }
      if (b.life <= 0) continue;
      b.life -= dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4));
      const enemyShot = b.owner === 'enemy';
      const ownerTeam = enemyShot ? -2 : this.teamOf(b.owner);
      for (let i = 0; i < steps && b.life > 0; i++) {
        const ox = b.x;
        const oy = b.y;
        let nx = ox + (b.vx * dt) / steps;
        let ny = oy + (b.vy * dt) / steps;
        if (b.form === 'blade' && typeof b.aim === 'number' && typeof b.spawnX === 'number' && typeof b.spawnY === 'number') {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const flown = (b.flown ?? 0) + (sp * dt) / steps;
          const place = (lat: number) => ({
            x: b.spawnX! + Math.cos(b.aim!) * flown - Math.sin(b.aim!) * lat,
            y: b.spawnY! + Math.sin(b.aim!) * flown + Math.cos(b.aim!) * lat,
          });
          const lateral = Math.sin(flown / 46) * 14 * (b.curve ?? 1);
          const curved = place(lateral);
          const flat = place(0);
          const who = b.fromEcho || enemyShot ? undefined : b.owner;
          const clear = (x: number, y: number) => this.solidAlong(ox, oy + GUN_Y, x, y + GUN_Y, 3, who) === null;
          const use = clear(curved.x, curved.y) ? curved : clear(flat.x, flat.y) ? flat : curved;
          nx = use.x;
          ny = use.y;
          b.flown = flown;
          const dx = nx - ox;
          const dy = ny - oy;
          const dd = Math.hypot(dx, dy) || 1;
          b.vx = (dx / dd) * sp;
          b.vy = (dy / dd) * sp;
        }
        const stopWall = !b.pierce || b.form === 'wave' || b.form === 'fissure' || b.form === 'beam';
        if (stopWall && tuneBlocks(this.arena, ox, oy, nx, ny, this.worldT)) {
          b.x = ox;
          b.y = oy;
          b.life = 0;
          b.miss = 'wall';
          break;
        }
        if (stopWall) {
          const wallT = this.solidAlong(ox, oy + GUN_Y, nx, ny + GUN_Y, 3, b.fromEcho || enemyShot ? undefined : b.owner);
          const bodyT = this.earliestBody(b, ox, oy, nx, ny, enemyShot, ownerTeam);
          if (wallT !== null && (bodyT === null || wallT <= bodyT)) {
            const t = Math.max(0, Math.min(1, wallT));
            b.x = ox + (nx - ox) * t;
            b.y = oy + (ny - oy) * t;
            this.damageCover(b.x, b.y + GUN_Y, 4, b.dmg);
            this.hitStructure(b);
            b.life = 0;
            if ((b.el || b.basic || b.plasma) && b.hit.length === 0) {
              b.miss = 'wall';
              this.events.push({ type: 'deny', pid: b.owner, msg: 'Obstáculo', x: b.x, y: b.y });
              this.events.push({ type: 'pend', x: b.x, y: b.y, el: b.plasma ? 'plasma' : b.el ?? 'basic', wall: true });
            }
            this.landUltShot(b);
            abilityTrace(b.owner, 'wall', `${Math.round(b.x)},${Math.round(b.y)}`);
            break;
          }
          if (bodyT !== null) {
            b.x = ox + (nx - ox) * bodyT;
            b.y = oy + (ny - oy) * bodyT;
          } else {
            b.x = nx;
            b.y = ny;
          }
        } else {
          b.x = nx;
          b.y = ny;
        }
        if (this.absorbDecoy(b)) {
          b.life = 0;
          break;
        }
        for (const o of this.players) {
          if (!o.alive || !o.playing || b.hit.includes(o.id)) continue;
          if (!enemyShot) {
            if (o.id === b.owner && !b.fromEcho) continue;
            if (o.id === b.owner && this.rules.teams) continue;
            if (o.id !== b.owner && ownerTeam >= 0 && ownerTeam === o.team) continue;
          }
          const pad = b.form === 'wave' ? 26 : b.form === 'fissure' ? 18 : b.form === 'rock' ? 14 : b.form === 'blast' ? 10 : b.form === 'blade' ? 12 : 6;
          if (!this.bodyHit(o, b.x, b.y, pad)) continue;
          // poder do X1: dano e elemento aqui. A arma desenhada não queima, cura nem empurra de novo.
          if (b.plasma) {
            b.hit.push(o.id);
            const src = this.players.find((q) => q.id === b.owner);
            if (src) this.deliverPlasma(src, o, b.dmg);
            else this.hurt(o, Math.min(PLASMA.dmg, b.dmg), b.owner, 'shot', Math.atan2(b.vy, b.vx));
            if (!b.pierce) {
              b.life = 0;
              break;
            }
            continue;
          }
          if (b.basic) {
            b.hit.push(o.id);
            const src = this.players.find((q) => q.id === b.owner);
            const move = src ? this.mobilityBonus(src) : 0;
            this.events.push({ type: 'phit', x: o.x, y: o.y, el: 'basic', pid: b.owner });
            this.hurt(o, b.dmg + move, b.fromEcho ? null : b.owner, 'shot', Math.atan2(b.vy, b.vx));
            if (!b.pierce) {
              b.life = 0;
              break;
            }
            continue;
          }
          if (b.el) {
            b.hit.push(o.id);
            const src = this.players.find((q) => q.id === b.owner);
            if (src) {
              const comboReach = this.deliverPower(src, o, b.el, b.dmg, b.knock ?? 0, !!b.area, { slot: b.slot ?? -1, projectile: !b.area, mark: !!b.mark, trick: b.trick, ability: b.trick });
              if (b.trick === 'tide' && !b.splashed) {
                b.splashed = true;
                this.splashAround(src, o, b, 40, 0.25, true, comboReach);
              }
              if (b.form === 'blast' && !b.splashed) {
                b.splashed = true;
                this.splashAround(src, o, b, 52, 0.45, false, comboReach);
              } else if (b.form === 'jet' && !b.splashed) {
                b.splashed = true;
                this.splashAround(src, o, b, 40, 0.25, true, comboReach);
              } else if (b.form === 'chain' && !b.splashed) {
                b.splashed = true;
                const nxt = this.players
                  .filter((q) => q !== o && q.alive && q.playing && !b.hit.includes(q.id) && this.hostile(src, q) && dist(q.x, q.y, o.x, o.y) < 140 && this.sight(o.x, o.y, q.x, q.y))
                  .sort((a, c) => dist(a.x, a.y, o.x, o.y) - dist(c.x, c.y, o.x, o.y))[0];
                if (nxt) {
                  b.hit.push(nxt.id);
                  this.deliverPower(src, nxt, b.el, Math.max(1, Math.round(b.dmg * 0.6)), b.knock ?? 0, false, { slot: b.slot ?? -1, projectile: true, mark: !!b.mark });
                }
              }
              if (b.slot === 2 && !b.landed && !b.fromEcho) {
                b.landed = true;
                this.ultLand(src, o.x, o.y, b.el);
              }
            } else this.hurt(o, b.dmg, b.owner, 'shot', Math.atan2(b.vy, b.vx));
            if (!b.pierce) {
              b.life = 0;
              break;
            }
            continue;
          }
          // esquiva e fase: o tiro atravessa
          if (o.dodgeT > 0 || o.phaseT > 0) continue;
          if (o.shieldT > 0 && this.combat && !enemyShot && this.reflect(o, b)) break;
          b.hit.push(o.id);
          if (b.fromEcho && o.id === b.owner) o.stats.ownEchoHits++;
          this.hurt(o, b.dmg, b.fromEcho || enemyShot ? null : b.owner, b.fromEcho ? (o.id === b.owner ? 'own' : 'echo') : 'shot', Math.atan2(b.vy, b.vx));
          const wd = WEAPONS[b.weapon];
          if (wd.slow) this.slow(o, wd.slow);
          if (wd.stun && !enemyShot) this.stun(o, wd.stun);
          if (b.weapon === 'marcador' && o.alive) {
            o.markT = SKILLS.marcador.duration ?? 4;
            o.cloakT = 0;
            this.events.push({ type: 'mark', x: o.x, y: o.y, pid: o.id });
          }
          if (wd.heal && !b.fromEcho && !enemyShot) {
            const src = this.players.find((q) => q.id === b.owner);
            if (src && src.alive) this.heal(src, src, b.dmg * wd.heal);
          }
          const kn = wd.knock ?? 90;
          this.knock(o, (b.vx / Math.hypot(b.vx, b.vy)) * kn, (b.vy / Math.hypot(b.vx, b.vy)) * kn);
          if (!b.pierce) {
            b.life = 0;
            break;
          }
        }
        // torretas inimigas podem ser destruídas a tiros
        if (!enemyShot && b.life > 0) {
          for (const t of this.turrets) {
            if (t.owner === b.owner || t.t <= 0) continue;
            const tt = this.teamOf(t.owner);
            if (ownerTeam >= 0 && tt === ownerTeam) continue;
            if (dist(t.x, t.y - 14, b.x, b.y) > 16) continue;
            t.hp -= b.dmg;
            if (t.hp <= 0) {
              t.t = 0;
              this.events.push({ type: 'explode', x: t.x, y: t.y, r: 40 });
            }
            if (!b.pierce) b.life = 0;
            break;
          }
        }
        if (!enemyShot && b.life > 0 && this.enemyHostileTo({ team: ownerTeam })) {
          for (const e of this.enemies) {
            if (e.hp <= 0 || b.hit.includes('e' + e.id)) continue;
            if (dist(e.x, e.y - GUN_Y, b.x, b.y) > ENEMY_STATS[e.kind].r + 6) continue;
            b.hit.push('e' + e.id);
            // carapaça: o escudo da frente segura quase todo tiro — dê a volta ou use explosivos
            if (e.kind === 'carapaca' && e.stunT <= 0 && Math.cos(Math.atan2(-b.vy, -b.vx) - e.dir) > 0.45) {
              this.hurtEnemy(e, b.dmg * 0.15, b.fromEcho ? null : b.owner);
              this.events.push({ type: 'block', x: b.x, y: b.y });
              b.life = 0;
              break;
            }
            this.hurtEnemy(e, b.dmg, b.fromEcho ? null : b.owner);
            const ew = WEAPONS[b.weapon];
            if (ew.slow) e.slowT = Math.max(e.slowT, ew.slow);
            if (ew.stun) e.stunT = Math.max(e.stunT, ew.stun);
            if (!b.pierce) {
              b.life = 0;
              break;
            }
          }
        }
      }
      if (b.life <= 0 && !b.miss && b.hit.length === 0 && (b.el || b.basic || b.plasma)) {
        b.miss = 'range';
        this.events.push({ type: 'deny', pid: b.owner, msg: 'Fora de alcance', x: b.x, y: b.y });
        this.events.push({ type: 'pend', x: b.x, y: b.y, el: b.plasma ? 'plasma' : b.el ?? 'basic' });
      }
      if (b.life <= 0) this.landUltShot(b);
      // foguete e lança-granadas explodem ao bater ou no fim do alcance
      const bw = WEAPONS[b.weapon];
      if (bw.blast && b.life <= 0 && !b.el) this.explode(b.x, b.y + GUN_Y, bw.blast.r, bw.blast.dmg * (b.fromEcho ? ECHO_DAMAGE_MULT : 1), b.owner, b.fromEcho);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // bombas: voam 0.35 s e explodem depois do pavio
    for (const bm of this.bombs) {
      bm.t += dt;
      const k = Math.min(1, bm.t / 0.35);
      bm.x = bm.sx + (bm.tx - bm.sx) * k;
      bm.y = bm.sy + (bm.ty - bm.sy) * k;
      const fuse = bm.pulse ? PULSE_FUSE : BOMB_FUSE;
      if (bm.t >= 0.35 + fuse) {
        if (bm.pulse) this.pulseBlast(bm.x, bm.y, bm.owner, bm.fromEcho);
        else if (bm.ice) this.iceBlast(bm.x, bm.y, bm.owner);
        else this.explode(bm.x, bm.y, BOMB_RADIUS, BOMB_DAMAGE, bm.owner, bm.fromEcho);
        bm.t = -1;
      }
    }
    this.bombs = this.bombs.filter((b) => b.t >= 0);

    // minas
    for (const m of this.mines) {
      m.armT -= dt;
      if (m.armT > 0) continue;
      const mt = this.teamOf(m.owner);
      const victim =
        this.players.find((o) => o.alive && o.playing && o.id !== m.owner && (mt < 0 || o.team !== mt) && o.phaseT <= 0 && dist(o.x, o.y, m.x, m.y) < 34 + this.hitR(o) - C.PLAYER_R) ??
        (this.enemyHostileTo({ team: mt }) ? this.enemies.find((e) => e.kind !== 'pylon' && dist(e.x, e.y, m.x, m.y) < 34 + ENEMY_STATS[e.kind].r - 14) : undefined);
      if (victim) {
        this.explode(m.x, m.y, MINE_RADIUS, MINE_DAMAGE, m.owner, false);
        m.armT = 999;
      }
    }
    this.mines = this.mines.filter((m) => m.armT < 900);
  }

  private updateTurrets(dt: number) {
    for (const t of this.turrets) {
      t.t -= dt;
      t.cd -= dt;
      const owner = this.players.find((p) => p.id === t.owner);
      if (this.combat) {
        let best: { x: number; y: number } | null = null;
        let bd = COMBAT.turret.range;
        for (const o of this.targetsOf({ id: t.owner, team: owner?.team ?? -1 })) {
          const d = dist(o.x, o.y, t.x, t.y);
          if (d < bd && this.nav.lineClear(t.x, t.y, o.x, o.y, this.worldT)) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          t.aim = Math.atan2(best.y - t.y, best.x - t.x);
          if (t.cd <= 0) {
            t.cd = COMBAT.turret.cooldown;
            this.spawnBullets(t.x, t.y + 6, t.aim, 'blaster', t.owner, false);
            this.bullets[this.bullets.length - 1].dmg = t.fromClone ? cloneDamage(COMBAT.turret.damage) : COMBAT.turret.damage;
            this.events.push({ type: 'shoot', x: t.x, y: t.y, pid: t.owner, weapon: 'blaster' });
          }
        }
      } else if (t.cd <= 0 && owner) {
        // no Núcleo: afasta Ecos que chegam perto
        t.cd = 0.4;
        t.aim += 0.8;
        for (const e of this.echoViews) if (e.active && !e.disrupted && dist(e.x, e.y, t.x, t.y) < 90) this.disrupt(e, owner);
      }
    }
    this.turrets = this.turrets.filter((t) => t.t > 0 && t.hp > 0);
  }

  /** Ecos repetem tiros, bombas e minas gravados (o passado também atira!) */
  private replayEchoActions(tms: number) {
    if (!this.combat || this.prevTms >= tms) return;
    // limite de tiros de Eco na arena (não podem dominar a tela)
    let echoShots = this.bullets.reduce((n, b) => n + (b.fromEcho ? 1 : 0), 0);
    for (const e of this.echoViews) {
      if (!e.active || e.disrupted || e.iced) continue;
      for (const ev of eventsBetween(e.rec, this.prevTms, tms)) {
        if (ev.action === 'shoot' && ev.a !== undefined) {
          if (echoShots >= COMBAT.maxEchoBullets) continue;
          echoShots++;
          this.spawnBullets(e.x, e.y, ev.a, (ev.w as WeaponId) ?? 'blaster', e.rec.playerId, true);
        } else if (ev.action === 'bomb' && ev.tx !== undefined && ev.ty !== undefined) {
          this.throwBomb(e.x, e.y, 0, e.rec.playerId, true, ev.tx, ev.ty, ev.w === 'gelo', ev.w === 'pulso');
        } else if (ev.action === 'mine') {
          this.mines.push({ id: this.fragId++, x: e.x, y: e.y, owner: this.rules.teams ? e.rec.playerId : 'eco', armT: 0.7 });
        }
      }
    }
  }

  private absorbDecoy(b: Bullet): boolean {
    for (const c of this.clones) {
      if (!c.decoy || (c.absorb ?? 0) <= 0 || c.t <= 0) continue;
      if (c.owner === b.owner) continue;
      if (dist(c.x, c.y - GUN_Y, b.x, b.y) > 22) continue;
      const owner = this.players.find((p) => p.id === c.owner);
      const ownerTeam = this.teamOf(b.owner);
      if (owner && ownerTeam >= 0 && owner.team === ownerTeam) continue;
      c.absorb = (c.absorb ?? 1) - 1;
      this.events.push({ type: 'block', x: c.x, y: c.y });
      if ((c.pop ?? 0) > 0 && owner) {
        for (const o of this.players) {
          if (!o.alive || !o.playing || !this.hostile(owner, o)) continue;
          if (dist(o.x, o.y, c.x, c.y) > 56) continue;
          if (!this.sight(c.x, c.y, o.x, o.y)) continue;
          this.hurt(o, c.pop ?? 0, owner.id, 'pulse');
        }
      }
      if ((c.absorb ?? 0) <= 0) c.t = 0;
      return true;
    }
    return false;
  }

  private updateGroves(dt: number) {
    for (const g of this.groves) {
      g.t -= dt;
      g.acc += dt;
      if (g.acc < 0.8) continue;
      g.acc -= 0.8;
      const src = this.players.find((p) => p.id === g.owner);
      if (!src) continue;
      for (const o of this.players) {
        if (!o.alive || !o.playing || dist(o.x, o.y, g.x, g.y) > g.r) continue;
        if (this.hostile(src, o)) continue;
        this.heal(src, o, g.heal);
        o.healT = 0.5;
      }
    }
    this.groves = this.groves.filter((g) => g.t > 0);
  }

  private updateClones(dt: number) {
    for (const c of this.clones) {
      c.t -= dt;
      if (c.decoy) continue;
      const owner = this.players.find((p) => p.id === c.owner);
      if (!owner || !owner.alive || owner.carry >= C.MAX_CARRY) continue;
      let best: Fragment | null = null;
      let bd = Infinity;
      for (const f of this.fragments) {
        if (f.golden || f.pickDelay > 0) continue;
        const d = dist(c.x, c.y, f.x, f.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (!best) continue;
      c.dir = Math.atan2(best.y - c.y, best.x - c.x);
      c.x += Math.cos(c.dir) * 250 * dt;
      c.y += Math.sin(c.dir) * 250 * dt;
      this.collideWorld(c);
      if (bd < 24) {
        best.age = -1;
        owner.carry++;
        this.events.push({ type: 'pickup', x: best.x, y: best.y, pid: owner.id });
        this.fragments = this.fragments.filter((f) => f.age >= 0);
      }
    }
    this.clones = this.clones.filter((c) => c.t > 0);
  }

  // ------------------------------------------------------------------ habilidade de equipamento (E) e ultimate (R)
  private useSkill(p: Player, ang: number, inp: Input) {
    const sk = SKILLS[p.loadout.skill];
    if (!sk) return;
    p.skillCd = sk.cooldown;
    this.use(p, sk.name);
    switch (sk.id) {
      case 'rolamento':
        // esquiva curta e comprometida: a direção é travada no início
        p.dir = ang;
        p.dashT = sk.range / C.DASH_SPEED;
        p.dodgeT = COMBAT.dodgeIframes;
        p.recorder?.event(this.roundT * 1000, 'dash');
        break;
      case 'armadilha': {
        const pt = this.castPoint(p, inp, ang, sk.range);
        this.traps = this.traps.filter((t) => t.owner !== p.id);
        this.traps.push({ id: this.fragId++, owner: p.id, team: p.team, x: pt.x, y: pt.y, armT: 0.6, t: sk.duration ?? 14 });
        break;
      }
      case 'barreira':
        this.raiseWall(p.id, p.x + Math.cos(ang) * sk.range, p.y + Math.sin(ang) * sk.range, ang, 92, 20, sk.duration ?? 3, 'barreira');
        break;
      case 'marcador':
        this.spawnBullets(p.x, p.y, ang, 'marcador', p.id, false);
        break;
      case 'estimulo':
        for (const o of this.players) if (o.alive && o.playing && !this.hostile(p, o) && (o === p || dist(o.x, o.y, p.x, p.y) < (sk.radius ?? 160))) this.heal(p, o, sk.damage ?? 18);
        p.turboT = Math.max(p.turboT, 1.5);
        this.events.push({ type: 'heal', x: p.x, y: p.y, pid: p.id });
        break;
    }
    this.events.push({ type: 'skill', pid: p.id, x: p.x, y: p.y, skill: sk.id });
  }

  private useUlt(p: Player, ang: number, inp: Input) {
    const u = ULTS[p.loadout.ult];
    if (!u) return;
    p.ultCharge = 0;
    this.use(p, u.name);
    switch (u.id) {
      case 'meteoro': {
        const pt = this.castPoint(p, inp, ang, u.range);
        this.addCast('meteoro', p, pt.x, pt.y, ang, { r: u.radius, windup: u.windup });
        break;
      }
      case 'feixe':
        this.addCast('feixe', p, p.x, p.y, ang, { len: u.range, w: u.width, windup: u.windup });
        p.castT = u.windup;
        break;
      case 'estase': {
        const pt = this.castPoint(p, inp, ang, u.range);
        this.addCast('estase', p, pt.x, pt.y, ang, { r: u.radius, windup: u.windup, life: u.duration });
        break;
      }
      case 'sobrecarga':
        p.overT = u.duration ?? 5;
        p.shieldHp = Math.max(p.shieldHp, 30);
        break;
      case 'onda':
        this.addCast('meteoro', p, p.x, p.y, ang, { r: u.radius, windup: u.windup, dmg: u.damage });
        break;
      case 'lanca':
        this.addCast('feixe', p, p.x, p.y, ang, { len: u.range, w: u.width, windup: u.windup, dmg: u.damage });
        p.castT = u.windup;
        break;
    }
    this.events.push({ type: 'ult', pid: p.id, x: p.x, y: p.y, ult: u.id });
  }

  private addCast(kind: CastKind, p: Player, x: number, y: number, ang: number, o: { r?: number; len?: number; w?: number; windup?: number; life?: number; dmg?: number }) {
    this.casts.push({ id: this.fragId++, kind, owner: p.id, team: p.team, x, y, ang, r: o.r ?? 0, len: o.len ?? 0, w: o.w ?? 0, t: 0, windup: o.windup ?? 0, life: o.life ?? 0, fired: false, acc: 0, dmg: o.dmg });
    this.events.push({ type: 'cast', pid: p.id, kind, x, y });
  }

  /** golpes com aviso: espera o tempo de reação, depois acerta */
  private updateCasts(dt: number) {
    for (const c of this.casts) {
      c.t += dt;
      const owner = this.players.find((q) => q.id === c.owner);
      if (!c.fired && c.t >= c.windup) {
        c.fired = true;
        this.resolveCast(c, owner);
      }
      if (!c.fired) continue;
      if (c.kind === 'estase') {
        for (const o of this.players) {
          if (!o.alive || !o.playing || (owner && !this.hostile(owner, o)) || dist(o.x, o.y, c.x, c.y) > c.r) continue;
          o.stasisT = 0.2;
          this.slow(o, 0.2);
        }
        c.acc += dt;
        if (c.acc >= 0.5) {
          c.acc -= 0.5;
          for (const o of this.players) if (o.alive && o.playing && (!owner || this.hostile(owner, o)) && dist(o.x, o.y, c.x, c.y) < c.r) this.hurt(o, (ULTS.estase.damage ?? 8) / 2, c.owner, 'pulse');
        }
      }
      if (c.kind === 'barragem' && owner && owner.alive) {
        // espiral de projéteis saindo do Chefe
        const n = BOSS.skills.barragem.count ?? 20;
        const every = c.life / n;
        c.acc += dt;
        while (c.acc >= every) {
          c.acc -= every;
          c.ang += 0.62;
          for (const k of [0, Math.PI]) this.bossShot(owner, c.ang + k, 330, BOSS.skills.barragem.damage ?? 9);
        }
      }
    }
    this.casts = this.casts.filter((c) => !c.fired || c.t < c.windup + c.life);
  }

  private resolveCast(c: Cast, owner: Player | undefined) {
    const hostileTo = (o: Player) => o.alive && o.playing && (!owner ? o.team !== c.team : this.hostile(owner, o));
    switch (c.kind) {
      case 'meteoro':
        this.explode(c.x, c.y, c.r, c.dmg ?? ULTS.meteoro.damage, c.owner, false);
        break;
      case 'chuva':
        this.explode(c.x, c.y, c.r, BOSS.skills.chuva.damage ?? 30, c.owner, false);
        break;
      case 'fissura': {
        // rachadura de lava atravessando a arena (aviso longo, ignora paredes)
        const x1 = c.x + Math.cos(c.ang) * c.len;
        const y1 = c.y + Math.sin(c.ang) * c.len;
        for (const o of this.players) if (hostileTo(o) && distToSegment(o.x, o.y, c.x, c.y, x1, y1) < c.w / 2 + this.hitR(o)) this.hurt(o, BOSS.fissureDamage, c.owner, 'hazard', c.ang + Math.PI / 2);
        this.damageCover((c.x + x1) / 2, (c.y + y1) / 2, 0, 0);
        this.events.push({ type: 'castHit', kind: 'fissura', x: c.x, y: c.y, r: 0, ang: c.ang, len: c.len });
        return;
      }
      case 'feixe': {
        // para na primeira parede
        let len = c.len;
        for (let d = 20; d <= c.len; d += 8) {
          if (!this.isFree(c.x + Math.cos(c.ang) * d, c.y + Math.sin(c.ang) * d, 3)) {
            len = d;
            break;
          }
        }
        const x1 = c.x + Math.cos(c.ang) * len;
        const y1 = c.y + Math.sin(c.ang) * len;
        const beam = c.dmg ?? ULTS.feixe.damage;
        for (const o of this.players) if (hostileTo(o) && distToSegment(o.x, o.y, c.x, c.y, x1, y1) < c.w / 2 + this.hitR(o)) {
          this.hurt(o, beam, c.owner, 'pulse', c.ang);
          this.knock(o, Math.cos(c.ang) * 300, Math.sin(c.ang) * 300);
        }
        if (!owner || this.enemyHostileTo(owner)) for (const e of this.enemies) if (distToSegment(e.x, e.y, c.x, c.y, x1, y1) < c.w / 2 + ENEMY_STATS[e.kind].r) this.hurtEnemy(e, beam, c.owner);
        this.hitTurrets((c.x + x1) / 2, (c.y + y1) / 2, len / 2, c.owner, beam);
        this.events.push({ type: 'castHit', kind: 'feixe', x: c.x, y: c.y, r: 0, ang: c.ang, len });
        return;
      }
      case 'impacto': {
        const b = BOSS.skills.impacto;
        const cx = owner?.x ?? c.x;
        const cy = owner?.y ?? c.y;
        for (const o of this.players) {
          if (!hostileTo(o)) continue;
          const d = dist(o.x, o.y, cx, cy);
          if (d > c.r) continue;
          this.hurt(o, b.damage ?? 28, c.owner, 'pulse');
          this.knock(o, ((o.x - cx) / (d || 1)) * 600, ((o.y - cy) / (d || 1)) * 600);
          this.slow(o, 0.6);
        }
        // fase final: o impacto solta um anel de projéteis junto (padrão combinado)
        this.events.push({ type: 'castHit', kind: 'impacto', x: cx, y: cy, r: c.r, ang: 0, len: 0 });
        return;
      }
      case 'avanco':
        if (owner && owner.alive) {
          owner.dir = c.ang;
          owner.chargeT = 0.45;
          owner.chargeHit = [];
          owner.chargeDmg = BOSS.skills.avanco.damage ?? 20;
        }
        break;
      case 'obsidiana': {
        const vertical = Math.abs(Math.cos(c.ang)) > Math.abs(Math.sin(c.ang));
        for (const k of [-1, 1]) {
          const x = c.x + (vertical ? 0 : k * 80);
          const y = c.y + (vertical ? k * 80 : 0);
          this.raiseWall(c.owner, x, y, c.ang, 110, 26, BOSS.skills.obsidiana.duration ?? 6, 'obsidiana');
        }
        break;
      }
    }
    this.events.push({ type: 'castHit', kind: c.kind, x: c.x, y: c.y, r: c.r, ang: c.ang, len: c.len });
  }

  private bossShot(owner: Player, ang: number, speed: number, dmg: number) {
    this.bullets.push({ id: this.fragId++, x: owner.x + Math.cos(ang) * 34, y: owner.y - GUN_Y - 10 + Math.sin(ang) * 34, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, owner: owner.id, dmg, life: 1.6, weapon: 'colosso', pierce: false, fromEcho: false, hit: [] });
  }

  /** armadilhas: armam, ficam visíveis e prendem o primeiro rival que pisar */
  private updateTraps(dt: number) {
    for (const t of this.traps) {
      t.t -= dt;
      t.armT -= dt;
      if (t.armT > 0) continue;
      const owner = this.players.find((q) => q.id === t.owner);
      const v = this.players.find((o) => o.alive && o.playing && o.phaseT <= 0 && (owner ? this.hostile(owner, o) : o.team !== t.team) && dist(o.x, o.y, t.x, t.y) < (SKILLS.armadilha.radius ?? 34) + this.hitR(o) - 8);
      if (v) {
        this.stun(v, 0.6);
        this.hurt(v, SKILLS.armadilha.damage ?? 12, t.owner, 'pulse');
        this.events.push({ type: 'trap', x: t.x, y: t.y, pid: v.id });
        t.t = 0;
      }
    }
    this.traps = this.traps.filter((t) => t.t > 0);
  }

  private offerFinisher(src: Player, dst: Player, name: string, element: Element, aura: { burn: number; frozen: number; gust: number; shock: number; root?: number }) {
    if (this.finisherUsed.has(dst.id)) return;
    const gate = cinematicFinisher({ comboKill: true, repeat: false, competitive: !this.cfg.training && !this.cfg.dummy });
    if (!gate.play) return;
    this.finisherUsed.add(dst.id);
    const primer: Element | '' = aura.burn > 0 ? 'fire' : aura.frozen > 0 ? 'ice' : (aura.root ?? 0) > 0 ? 'nature' : aura.gust > 0 ? 'wind' : aura.shock > 0 ? 'lightning' : '';
    const style = finisherStyle(primer, element);
    this.events.push({ type: 'finisher', pid: dst.id, by: src.id, x: dst.x, y: dst.y, name, id: style.id, seconds: gate.seconds });
  }

  /** Tiro numa muralha ou prisão do catálogo. Fogo na estrutura vira Ruptura Magmática; ar, fragmentos. */
  private hitStructure(b: Bullet) {
    if (!b.el || b.owner === 'enemy') return;
    const src = this.players.find((p) => p.id === b.owner);
    const boom = (x: number, y: number, name: string) => {
      if (!src || (b.el !== 'fire' && b.el !== 'wind')) return;
      const along = Math.atan2(b.vy, b.vx);
      for (const o of this.players) {
        if (!o.alive || !o.playing || !this.hostile(src, o)) continue;
        const d = dist(o.x, o.y, x, y);
        if (b.el === 'fire' && d > 48) continue;
        if (b.el === 'wind') {
          const ang = Math.atan2(o.y - y, o.x - x);
          let diff = Math.abs(ang - along);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (d > 90 || diff > 0.7) continue;
          this.knock(o, Math.cos(along) * 160, Math.sin(along) * 160);
        }
        if (!this.sight(x, y, o.x, o.y)) continue;
        this.hurt(o, 8, src.id, 'pulse');
      }
      this.events.push({ type: 'combo', x, y, name, bonus: 8, pid: src.id, vfx: 'burst', id: b.el === 'fire' ? 'magma-break' : 'shards' });
    };
    for (const w of this.iceWalls) {
      if (!w.crack || w.t <= 0 || w.hp == null) continue;
      if (!circleRect(b.x, b.y + GUN_Y, 6, w)) continue;
      w.hp -= b.dmg;
      if (!w.spent && (b.el === 'fire' || b.el === 'wind')) {
        w.spent = true;
        boom(w.x + w.w / 2, w.y + w.h / 2, b.el === 'fire' ? 'Ruptura Magmática' : 'Tempestade de Fragmentos');
      }
      if (w.hp <= 0) {
        w.t = 0;
        this.events.push({ type: 'skill', pid: b.owner, x: w.x + w.w / 2, y: w.y + w.h / 2, skill: w.kind === 'gelo' ? 'ice' : 'nature', r: 28, form: 'blast', trick: 'mirror' });
      }
    }
    for (const z of this.patches) {
      if (z.hp == null || z.t <= 0 || z.kind !== 'roots') continue;
      if (dist(b.x, b.y, z.x, z.y) > z.r) continue;
      z.hp -= b.dmg;
      if (!z.spent && (b.el === 'fire' || b.el === 'wind')) {
        z.spent = true;
        boom(z.x, z.y, b.el === 'fire' ? 'Ruptura Magmática' : 'Tempestade de Fragmentos');
      }
    }
  }

  /** dano em coberturas destrutíveis (tiros, explosões, golpes) */
  private damageCover(x: number, y: number, r: number, dmg: number) {
    if (dmg <= 0) return;
    for (const w of this.iceWalls) {
      if (w.kind !== 'caixa' || w.t <= 0) continue;
      if (!circleRect(x, y, Math.max(4, r), w)) continue;
      w.hp = (w.hp ?? 0) - dmg;
      if (w.hp <= 0) {
        w.t = 0;
        this.events.push({ type: 'explode', x: w.x + w.w / 2, y: w.y + w.h / 2, r: 36 });
      }
    }
  }

  /** o Chefe fica exausto: não usa golpes, anda devagar e leva mais dano */
  exhaust(p: Player, t: number) {
    p.exhaustT = Math.max(p.exhaustT, t);
    this.events.push({ type: 'exhaust', x: p.x, y: p.y });
  }

  // ------------------------------------------------------------------ modos
  /** ponto de nascimento de um time (perto da base) */
  teamSpawn(team: number, k = 0): Pt {
    const home = this.arena.spawns[team];
    const opts = [...this.arena.spawns].sort((a, b) => dist(a.x, a.y, home.x, home.y) - dist(b.x, b.y, home.x, home.y));
    const s = opts[Math.min(k, 2)];
    return { x: s.x, y: s.y };
  }

  hurtEnemy(e: Enemy, dmg: number, by: string | null) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.hitFlash = 0.15;
    const p = by ? this.players.find((q) => q.id === by) ?? null : null;
    if (p) {
      p.stats.dmg += dmg;
      p.ultCharge = Math.min(100, p.ultCharge + dmg * COMBAT.ult.perDamageDealt * 0.5);
      if (p.vampT > 0) this.heal(p, p, dmg * COMBAT.vampFrac);
    }
    this.events.push({ type: 'dmg', pid: 'e' + e.id, x: e.x, y: e.y, n: Math.max(1, Math.round(dmg)), k: 'hp' });
    if (e.hp <= 0) {
      const st = ENEMY_STATS[e.kind];
      if (e.kind === 'pylon') {
        if (p) {
          p.stats.obj++;
          this.award(p, st.points);
          this.events.push({ type: 'objective', pid: p.id, text: 'Gerador destruído +5' });
        }
        this.events.push({ type: 'pylon', x: e.x, y: e.y, down: true });
        this.events.push({ type: 'explode', x: e.x, y: e.y, r: 70 });
        return;
      }
      if (p) {
        p.kills++;
        this.award(p, st.points);
      }
      this.events.push({ type: 'enemyKill', x: e.x, y: e.y, kind: e.kind, by: p ? p.id : null });
      if (e.kind === 'boss') this.explode(e.x, e.y, 140, 0, 'boss', false);
      if (Math.random() < (e.kind === 'drone' ? 0.12 : 0.4) && this.powerups.length < 6)
        this.powerups.push({ id: this.fragId++, kind: this.pickPower(), x: e.x, y: e.y, age: 0 });
    }
  }

  /** alvos hostis de um jogador: rivais visíveis + inimigos (ondas) */
  targetsOf(p: { id: string; team: number }): { x: number; y: number; vx: number; vy: number; hp: number; player?: Player; enemy?: Enemy }[] {
    const out: { x: number; y: number; vx: number; vy: number; hp: number; player?: Player; enemy?: Enemy }[] = [];
    for (const o of this.players) if (this.hostile(p, o) && this.targetable(o)) out.push({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, hp: o.hp, player: o });
    if (this.enemyHostileTo(p)) for (const e of this.enemies) if (e.hp > 0) out.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, hp: e.hp, enemy: e });
    return out;
  }

  // ------------------------------------------------------------------ Ecos
  private refreshEchoViews() {
    this.echoViews = [];
    const keep = new Map<string, EchoDigest>();
    const expiring = this.echoes.nextToExpire();
    for (const g of this.echoes.generations) {
      const age = this.echoes.ageOf(g.round);
      for (const rec of g.recordings) {
        if (this.erased.has(`${rec.round}:${rec.playerId}`)) continue;
        const s = sampleRecording(rec, 0);
        const key = `${rec.round}:${rec.playerId}`;
        keep.set(key, this.echoDigests.get(key) ?? digestRecording(rec));
        this.echoViews.push({
          rec,
          key: `${rec.round}:${rec.playerId}`,
          age,
          x: s.x,
          y: s.y,
          dir: s.direction,
          moving: false,
          active: true,
          disrupted: false,
          iced: false,
          pulse: 0,
          expiring: !this.tiebreak && expiring?.round === g.round,
          trail: [],
        });
      }
    }
    this.echoDigests = keep;
  }

  private updateEchoViews(tms: number) {
    for (const e of this.echoViews) {
      const clock = tuneClock(this.arena, this.worldT);
      if (this.arena.id === 'biblioteca' && clock.phase === 'on') mirrorRest(e.rec, tms, clock.pulse);
      if (this.arena.id === 'vinil' && tuneNeedle(this.arena, e.x, e.y, this.worldT) && !this.tuneOnce.has(`eco:${e.key}:${clock.pulse}`)) {
        this.tuneOnce.add(`eco:${e.key}:${clock.pulse}`);
        e.skipMs = (e.skipMs ?? 0) + 1000;
      }
      if (this.arena.id === 'metronomo' && tunePendulumHits(e.x, e.y, this.worldT) && e.pendPulse !== clock.pulse) {
        const ahead = e.rec.frames.find((f) => f.t > tms && f.t < tms + 800);
        if (ahead) {
          e.skipMs = (e.skipMs ?? 0) + (ahead.t - tms);
          e.pendPulse = clock.pulse;
        }
      }
      if (tuneEchoDrag(this.arena, e.x, e.y, this.worldT)) e.dragMs = (e.dragMs ?? 0) + this._dt * 300;
      const sampleAt = Math.max(0, tms + (e.skipMs ?? 0) - (e.dragMs ?? 0));
      const s0 = sampleRecording(e.rec, sampleAt);
      const spun = this.arena.id === 'vinil' ? spinEcho(s0.x, s0.y, e.rec.spinOrigin, sampleAt, this.worldT) : s0;
      e.x = spun.x;
      e.y = spun.y;
      e.dir = s0.direction;
      e.moving = s0.moving;
      e.active = s0.active && !tuneHides(this.arena, e.x, e.y, this.worldT);
      const until = this.disrupted.get(e.key) ?? 0;
      e.disrupted = this.roundT < until;
      e.iced = this.roundT < this.iceUntil;
      const next = upcomingEvent(e.rec, tms, 450, 'dash') ?? upcomingEvent(e.rec, tms, 450, 'ability');
      e.pulse = next !== null ? 1 - (next - tms) / 450 : 0;
      e.offLeft = e.disrupted ? Math.max(0, until - this.roundT) : 0;
      // aviso antes de repetir um tiro/bomba/mina que foi gravado (nada é inventado)
      const dg = this.combat ? this.echoDigests.get(e.key) : undefined;
      const m = dg && e.active && !e.disrupted && !e.iced ? nextMark(dg, tms, 400, ['shoot', 'bomb', 'mine']) : null;
      e.warn = m ? 1 - (m[0] - tms) / 400 : 0;
      e.warnAng = m ? m[4] : 0;
      e.warnKind = m ? (m[1] === 0 ? 0 : m[1] === 1 ? 1 : 2) : 0;
      if (tms > 0 && e.active) {
        e.trail.push({ x: e.x, y: e.y });
        if (e.trail.length > 14) e.trail.shift();
      }
    }
  }

  /** posição prevista de um Eco no futuro (a IA pode ler o passado — é justo, é público). */
  predictEcho(e: EchoView, aheadMs: number) {
    return sampleRecording(e.rec, this.roundT * 1000 + aheadMs);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  timeLeft(): number {
    if (this.sudden) return Math.max(0, this.suddenLimit - this.suddenT);
    return Math.max(0, this.roundDur - this.roundT);
  }
}

export function circleRect(x: number, y: number, r: number, w: { x: number; y: number; w: number; h: number }): boolean {
  const cx = Math.max(w.x, Math.min(x, w.x + w.w));
  const cy = Math.max(w.y, Math.min(y, w.y + w.h));
  return Math.hypot(x - cx, y - cy) < r;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
