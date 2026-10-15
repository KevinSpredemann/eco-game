// Mira única: tela → mundo e o ponto do golpe. A direção do corpo não substitui o cursor.
import { aimStop, losOpen } from './aimMath';
import type { SweepBounds, SweepDisc, SweepRect } from './sweep';

/** Vista usada para desenhar. Coordenadas de tela são CSS px do viewport. */
export interface WorldView {
  left: number;
  top: number;
  cssW: number;
  cssH: number;
  bufW: number;
  bufH: number;
  /** mundo no centro do canvas */
  camX: number;
  camY: number;
  /** pixels CSS por unidade de mundo */
  zoom: number;
}

export function viewFromLetterbox(o: {
  left: number;
  top: number;
  cssW: number;
  cssH: number;
  bufW: number;
  bufH: number;
  /** origem do mundo, em px CSS do canvas, já com o tremor da câmera */
  ox: number;
  oy: number;
  scale: number;
}): WorldView {
  const zoom = o.scale > 0 ? o.scale : 1;
  const cssW = o.cssW > 0 ? o.cssW : 1;
  const cssH = o.cssH > 0 ? o.cssH : 1;
  return {
    left: o.left,
    top: o.top,
    cssW,
    cssH,
    bufW: o.bufW,
    bufH: o.bufH,
    camX: (cssW / 2 - o.ox) / zoom,
    camY: (cssH / 2 - o.oy) / zoom,
    zoom,
  };
}

/** Ponto do mundo sob o cursor. O tamanho do bitmap (DPR) não entra: a tela é CSS. */
export function screenToWorld(screenX: number, screenY: number, view: WorldView): { x: number; y: number } {
  const zoom = view.zoom > 0 ? view.zoom : 1;
  const localX = screenX - view.left;
  const localY = screenY - view.top;
  return {
    x: view.camX + (localX - view.cssW / 2) / zoom,
    y: view.camY + (localY - view.cssH / 2) / zoom,
  };
}

export type AimShape = 'projectile' | 'line' | 'point' | 'dash' | 'self';

/** A forma do indicador. "Na hora" é o momento do clique, não um golpe em si. */
export function castAimShape(info: { kind: string; shape: string }): AimShape {
  if (info.shape === 'self') return 'self';
  if (info.shape === 'line') return 'dash';
  if (info.shape === 'circle' || info.shape === 'wall') return 'point';
  return 'projectile';
}

/** O mouse recente vence a mira do teclado. Sem tecla de mira, o último ponto do mouse vale. */
export const MOUSE_RECENT_MS = 1200;

export function mouseBeatsKeys(o: { pointer: 'mouse' | 'touch' | 'none'; mouseAt: number; now: number; keySteer: boolean }): boolean {
  if (o.pointer !== 'mouse' || !(o.mouseAt > 0)) return false;
  if (!o.keySteer) return true;
  return o.now - o.mouseAt <= MOUSE_RECENT_MS;
}

export interface AimNote {
  mouseX: number;
  mouseY: number;
  worldX: number;
  worldY: number;
  ox: number;
  oy: number;
  ang: number;
  vx: number;
  vy: number;
  fromMouse: boolean;
}

const aimNotes: AimNote[] = [];

/** Só grava com eco.aimDebug=1. Fora disso não escreve no console. */
export function noteAim(n: AimNote) {
  let on = false;
  try {
    on = typeof localStorage !== 'undefined' && localStorage.getItem('eco.aimDebug') === '1';
  } catch {
    on = false;
  }
  if (!on) return;
  aimNotes.push(n);
  if (aimNotes.length > 30) aimNotes.shift();
  const host = globalThis as { __ecoAimLog?: AimNote[] };
  host.__ecoAimLog = aimNotes;
  console.info('[aim]', n.mouseX.toFixed(0), n.mouseY.toFixed(0), 'world', n.worldX.toFixed(1), n.worldY.toFixed(1), 'origin', n.ox.toFixed(1), n.oy.toFixed(1), 'vec', n.vx.toFixed(2), n.vy.toFixed(2));
}

export interface AimSolids {
  rects: readonly SweepRect[];
  discs: readonly SweepDisc[];
  bounds: SweepBounds;
}

export interface AimShot {
  ang: number;
  dist: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  blocked: boolean;
  outOfRange: boolean;
  /** sem cursor válido: usa a direção informada (teclado ou corpo) */
  fromFacing: boolean;
}

export function solveAim(o: {
  ox: number;
  oy: number;
  cursorX?: number;
  cursorY?: number;
  range: number;
  kind: AimShape;
  /** atravessa parede: o ponto não volta para o obstáculo */
  passThrough?: boolean;
  /** área pode pousar no ponto mesmo com parede no caminho; o indicador marca o bloqueio */
  placeThrough?: boolean;
  radius?: number;
  solids?: AimSolids;
  facing?: number;
  hasCursor: boolean;
}): AimShot {
  const range = Math.max(0, o.range);
  const facing = typeof o.facing === 'number' && isFinite(o.facing) ? o.facing : 0;
  const bare = (ang: number, dist: number, fromFacing: boolean, blocked = false, outOfRange = false): AimShot => ({
    ang,
    dist,
    x: o.ox + Math.cos(ang) * dist,
    y: o.oy + Math.sin(ang) * dist,
    ox: o.ox,
    oy: o.oy,
    blocked,
    outOfRange,
    fromFacing,
  });
  if (o.kind === 'self') return bare(facing, 0, !o.hasCursor);
  const cx = o.cursorX;
  const cy = o.cursorY;
  const cursorOk = o.hasCursor && typeof cx === 'number' && typeof cy === 'number' && isFinite(cx) && isFinite(cy);
  if (!cursorOk) {
    const dist = o.kind === 'point' ? range : range;
    return clip(bare(facing, dist, true), o);
  }
  const dx = cx - o.ox;
  const dy = cy - o.oy;
  const len = Math.hypot(dx, dy);
  if (len < 1) return bare(facing, 0, false);
  const ang = Math.atan2(dy, dx);
  const outOfRange = range > 0 && len > range + 0.5;
  const desired = range > 0 ? Math.min(len, range) : len;
  return clip(bare(ang, desired, false, false, outOfRange), o);
}

/**
 * Ângulo do golpe. O ponto enviado (ca) vence.
 * Sem ponto, o humano usa a mira. O bot, se está andando, segue o passo.
 */
export function resolveCastAngle(o: { ca?: number | null; aim?: number | null; mx: number; my: number; dir: number; bot: boolean }): number {
  if (typeof o.ca === 'number' && isFinite(o.ca)) return o.ca;
  const moving = Math.hypot(o.mx, o.my) > 0.12;
  const walk = Math.atan2(o.my, o.mx);
  const aim = typeof o.aim === 'number' && isFinite(o.aim) ? o.aim : null;
  if (o.bot) return moving ? walk : aim ?? o.dir;
  return aim ?? (moving ? walk : o.dir);
}

function clip(shot: AimShot, o: { kind: AimShape; passThrough?: boolean; placeThrough?: boolean; radius?: number; solids?: AimSolids }): AimShot {
  if (!o.solids || o.passThrough || shot.dist < 1) return shot;
  const stop = aimStop(shot.ox, shot.oy, shot.ang, shot.dist, o.radius ?? 3, o.solids.rects, o.solids.discs, o.solids.bounds);
  if (o.kind === 'point' || o.placeThrough) {
    const open = losOpen(shot.ox, shot.oy, shot.x, shot.y, o.solids.rects, o.solids.discs, o.solids.bounds);
    return { ...shot, blocked: !open };
  }
  return { ...shot, dist: stop.dist, x: stop.x, y: stop.y, blocked: stop.blocked };
}
