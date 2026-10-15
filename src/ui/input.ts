import type { Input } from '../game/sim';
import type { AimKind } from '../game/balance';

/** ações que podem ser remapeadas no teclado */
export type Slot = 'ability' | 'skill' | 'ult' | 'dash' | 'item' | 'bonus' | 'plasma';
export type Action = Slot | 'fire';
export type KeyBinds = Record<Action, string>;

/**
 * Padrão: WASD anda. Q, E e F são os três poderes, R é a ultimate, Z é o extra.
 * Espaço esquiva. O clique esquerdo ataca e o direito cancela.
 */
export const WASD_KEYS: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyE',
  ult: 'KeyR',
  dash: 'Space',
  item: 'KeyX',
  bonus: 'KeyF',
  plasma: 'KeyZ',
  fire: 'KeyJ',
};
/** Notebook: as mesmas teclas. O item vai para o X, porque o F é um poder. */
export const WASD_NOTEBOOK: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyE',
  ult: 'KeyR',
  dash: 'Space',
  item: 'KeyX',
  bonus: 'KeyF',
  plasma: 'KeyZ',
  fire: 'KeyJ',
};
/** Setas andam, então o W vira o segundo poder. Z continua o extra. */
export const ARROW_LAYOUT: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyW',
  ult: 'KeyR',
  dash: 'Space',
  item: 'Digit1',
  bonus: 'KeyE',
  plasma: 'KeyZ',
  fire: 'KeyJ',
};
export const ARROW_LAYOUT_NOTEBOOK: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyW',
  ult: 'KeyR',
  dash: 'Space',
  item: 'KeyF',
  bonus: 'KeyE',
  plasma: 'KeyZ',
  fire: 'KeyJ',
};
/** ESDF anda. E e F não podem ser poderes: o segundo fica no W, o quarto no A, o extra no Z. */
export const ESDF_KEYS: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyW',
  ult: 'KeyR',
  dash: 'Space',
  item: 'Digit1',
  bonus: 'KeyA',
  plasma: 'KeyZ',
  fire: 'KeyJ',
};
/** Layout da rodada anterior: setas e Q W E R, com a Rajada no X. */
export const LEGACY_QWER: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyW',
  ult: 'KeyR',
  dash: 'Space',
  item: 'Digit1',
  bonus: 'KeyE',
  plasma: 'KeyX',
  fire: 'KeyJ',
};
export const LEGACY_QWER_NOTEBOOK: KeyBinds = { ...LEGACY_QWER, item: 'KeyF' };
/** WASD antigo, com Shift na esquiva e a Rajada no X. */
export const LEGACY_SHIFT: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyE',
  ult: 'KeyR',
  dash: 'ShiftLeft',
  item: 'Space',
  bonus: 'KeyF',
  plasma: 'KeyX',
  fire: 'KeyJ',
};
export const LEGACY_SHIFT_NOTEBOOK: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyE',
  ult: 'KeyR',
  dash: 'ShiftLeft',
  item: 'KeyF',
  bonus: 'Space',
  plasma: 'KeyX',
  fire: 'KeyJ',
};
export const LEGACY_ESDF: KeyBinds = { ...ESDF_KEYS, plasma: 'KeyX' };
export const DEFAULT_KEYS: KeyBinds = { ...WASD_KEYS };
export const NOTEBOOK_KEYS: KeyBinds = { ...WASD_NOTEBOOK };
export type ControlStyle = 'classic' | 'notebook';
export type MoveScheme = 'arrows' | 'wasd' | 'esdf';
export function presetKeys(style: ControlStyle, scheme: MoveScheme = 'wasd'): KeyBinds {
  if (scheme === 'arrows') return { ...(style === 'notebook' ? ARROW_LAYOUT_NOTEBOOK : ARROW_LAYOUT) };
  if (scheme === 'esdf') return { ...ESDF_KEYS };
  return { ...(style === 'notebook' ? WASD_NOTEBOOK : WASD_KEYS) };
}

/** A mira acompanha o cursor sem pular: cada quadro anda no máximo um pedaço. */
export function stepAim(current: number, target: number, sens: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const cap = 0.45 * Math.max(0.35, Math.min(2, sens));
  if (Math.abs(d) > cap) d = Math.sign(d) * cap;
  return current + d;
}

/** Puxa a mira para o inimigo mais alinhado, se ele estiver dentro do cone. */
export function assistAim(aim: number, ox: number, oy: number, foes: { x: number; y: number }[], cone = 0.62, range = 460): number {
  let bestDiff = 0;
  let bestAbs = cone;
  let found = false;
  for (const f of foes) {
    const dx = f.x - ox;
    const dy = f.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 12 || d > range) continue;
    let diff = Math.atan2(dy, dx) - aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const ad = Math.abs(diff);
    if (ad < bestAbs) {
      bestAbs = ad;
      bestDiff = diff;
      found = true;
    }
  }
  return found ? aim + bestDiff * 0.78 : aim;
}

/** Inimigo mais perto, para a trava de mira do notebook. */
export function nearestAim(ox: number, oy: number, foes: { id: string; x: number; y: number }[], max = 720): { id: string; aim: number } | null {
  let best: { id: string; aim: number } | null = null;
  let bd = max;
  for (const f of foes) {
    const d = Math.hypot(f.x - ox, f.y - oy);
    if (d < 12 || d >= bd) continue;
    bd = d;
    best = { id: f.id, aim: Math.atan2(f.y - oy, f.x - ox) };
  }
  return best;
}

/**
 * Mira pelo teclado. As setas escolhem a direção do tiro.
 * Sem seta, a mira acompanha o passo. WASD continua só o movimento.
 */
export function keyboardAimAngle(prev: number, arrows: { x: number; y: number }, move: { x: number; y: number }, precision = false): number {
  if (arrows.x || arrows.y) {
    const target = Math.atan2(arrows.y, arrows.x);
    if (!precision) return target;
    return stepAim(prev, target, 0.55);
  }
  if (move.x || move.y) return Math.atan2(move.y, move.x);
  return prev;
}

/**
 * WASD e ESDF andam. As setas miram e não empurram o corpo.
 * No layout de setas, as setas continuam andando. Shift fino gira a mira devagar.
 */
export function stickIntent(o: {
  moveScheme: MoveScheme;
  keyboardAim: boolean;
  aiming: boolean;
  precision: boolean;
  arrows: { x: number; y: number };
  keys: { x: number; y: number };
  stick: { x: number; y: number };
  prevAim: number;
}): { mx: number; my: number; aim: number; arrows: boolean } {
  let mx = o.keys.x;
  let my = o.keys.y;
  const schemeAims = o.moveScheme === 'wasd' || o.moveScheme === 'esdf';
  if (!schemeAims && !o.keyboardAim) {
    mx += o.arrows.x;
    my += o.arrows.y;
  }
  if (o.stick.x || o.stick.y) {
    mx = o.stick.x;
    my = o.stick.y;
  }
  const arrows = o.arrows.x !== 0 || o.arrows.y !== 0;
  const steer = schemeAims || o.keyboardAim || o.aiming;
  const aim = steer ? keyboardAimAngle(o.prevAim, schemeAims || o.keyboardAim ? o.arrows : { x: 0, y: 0 }, { x: mx, y: my }, o.precision) : o.prevAim;
  return { mx, my, aim, arrows };
}

const PREPARE: Record<string, Slot> = { Digit1: 'ability', Digit2: 'skill', Digit3: 'bonus' };

/** Clique curto no notebook ligava o tiro. O notebook agora atira só enquanto o botão está pressionado. */
export function clickFireLatch(latch: boolean, heldMs: number, toggle: boolean): boolean {
  if (!toggle || heldMs >= 280) return latch;
  return !latch;
}
export const ACTION_LABEL: Record<Action, string> = {
  ability: 'Poder 1 (Q no padrão)',
  skill: 'Poder 2 (E no padrão)',
  ult: 'Ultimate (R no padrão)',
  dash: 'Impulso / esquiva',
  item: 'Item (granada, mina…)',
  bonus: 'Poder 3 (F no padrão)',
  plasma: 'Poder extra (Z no padrão)',
  fire: 'Atirar (além do clique)',
};
const PAUSE_KEYS = ['Escape', 'KeyP'];
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function moveKeysFor(scheme: MoveScheme): string[] {
  if (scheme === 'wasd') return [...PAUSE_KEYS, 'KeyW', 'KeyA', 'KeyS', 'KeyD', ...ARROW_KEYS];
  if (scheme === 'esdf') return [...PAUSE_KEYS, 'KeyE', 'KeyS', 'KeyD', 'KeyF', ...ARROW_KEYS];
  return [...PAUSE_KEYS, ...ARROW_KEYS];
}

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Espaço',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift D',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl D',
    AltLeft: 'Alt',
    Tab: 'Tab',
    CapsLock: 'Caps',
    Enter: 'Enter',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: 'Ç',
  };
  return map[code] ?? code.replace(/(Left|Right)$/, '');
}
export function isReservedKey(code: string, scheme: MoveScheme = 'wasd') {
  return moveKeysFor(scheme).includes(code);
}

/** mira em andamento (segurando a tecla ou arrastando o botão) */
export interface Aiming {
  slot: Slot;
  kind: AimKind;
  /** toque: vetor do arrasto (px) a partir do centro do botão */
  touch: { dx: number; dy: number } | null;
}

/** Junta teclado + mouse + analógico virtual + botões de toque em um único Input por passo. */
/** No celular, a ultimate mirada só confirma com arrasto. Cancelar (ou um toque seco) não gasta a carga. */
export function confirmTouchCast(slot: string, kind: string, dragLen: number): boolean {
  if (slot === 'ult' && kind !== 'instant' && dragLen < 18) return false;
  return true;
}

export type CastChoice = 'auto' | 'instant' | 'manual' | 'release';
export type CastStyle = 'instant' | 'manual' | 'release';

/** Como o aperto vira golpe. Cancelar nunca entra aqui: quem cancela não chama estas funções. */
export function resolveCastStyle(o: {
  castMode: CastChoice;
  control: 'classic' | 'notebook';
  touch: boolean;
  manual: boolean;
  kind: AimKind;
}): CastStyle {
  if (o.manual || o.castMode === 'manual') return 'manual';
  if (o.kind === 'instant') return 'instant';
  if (o.castMode === 'instant') return 'instant';
  // auto e release: segurar mira, soltar lança. O rápido fica na opção "na hora".
  return 'release';
}

export function queuesOnPress(style: CastStyle) {
  return style === 'instant';
}
export function queuesOnRelease(style: CastStyle) {
  return style === 'release';
}

export class InputManager {
  private keys = new Set<string>();
  private stick = { x: 0, y: 0, active: false, id: -1, cx: 0, cy: 0 };
  private queued = new Set<Slot>();
  /** mira de toque usada no disparo (ângulo e fração do alcance) */
  private touchCast: { ang: number; ratio: number } | null = null;
  private fireTouch = false;
  private fireMouse = false;
  /** analógico direito (mira + tiro): arrasto atual em px a partir do centro, por dedo */
  private aimStick = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, manual: false };
  /** última direção mirada com o analógico direito (fica depois de soltar); null = mira automática */
  lastAim: number | null = null;
  binds: KeyBinds = { ...DEFAULT_KEYS };
  control: ControlStyle = 'classic';
  /** wasd é o padrão. arrows libera o W para um poder. esdf anda com E S D F. */
  moveScheme: MoveScheme = 'wasd';
  /** 1 = padrão; só o modo notebook suaviza a mira */
  aimSens = 1;
  /** tiro contínuo sem segurar o botão (não usado no notebook) */
  fireLatch = false;
  /** notebook: C trava a mira no inimigo mais perto */
  lockOn = false;
  onLock: ((on: boolean) => void) | null = null;
  private mouseDownAt = 0;
  private ateClick = false;
  private rmbAim = false;
  private aimAng: number | null = null;
  /** posição do mouse na tela (para mirar no computador) */
  mouse = { x: 0, y: 0, at: 0 };
  /** modo combate: Espaço vira item e o clique atira */
  combat = false;
  /** X1 e 2x2: o botão direito cancela a mira e não solta o poder do F */
  powers = false;
  /** auto segue o estilo. manual espera o clique. release solta ao erguer a tecla. */
  castMode: CastChoice = 'auto';
  /** setas miram e WASD anda. A opção liga a mira mesmo sem seta. Shift, se não for a esquiva, afina o giro. */
  keyboardAim = false;
  kbAim = 0;
  /** 0–1 da habilidade carregada que acabou de soltar. null = golpe cheio. */
  private pendingCharge: number | null = null;
  /** cursor de tela no instante do clique rápido ou da soltura da mira */
  private castScreen: { x: number; y: number } | null = null;
  private holdAt = 0;
  /** este espaço cresce enquanto segura */
  charged: (slot: Slot) => boolean = () => false;
  chargeSeconds: (slot: Slot) => number = () => 0.7;
  onAimMode: ((on: boolean) => void) | null = null;
  manualSlots = new Set<Slot>();
  /** both: Esc e botão direito. esc: só Esc. */
  cancelAimButtons: 'both' | 'esc' = 'both';
  touchMode = false;
  aiming: Aiming | null = null;
  /** como cada ação é mirada agora (depende do personagem/equipamento) */
  aimKind: (slot: Slot) => AimKind = () => 'instant';
  /** a ação está disponível? (recarga, carga da ultimate…) */
  canUse: (slot: Slot) => boolean = () => true;
  onDenied: ((slot: Slot) => void) | null = null;
  onPause: (() => void) | null = null;
  onFirstTouch: (() => void) | null = null;
  /** muda quando a mira começa/termina (para mostrar o "cancelar" no toque) */
  onAimChange: ((a: Aiming | null) => void) | null = null;
  /** captura da próxima tecla (tela de remapear) */
  capture: ((code: string) => void) | null = null;

  constructor(private touchRoot: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const fn = this.capture;
        this.capture = null;
        fn(e.code);
        return;
      }
      if (e.repeat) {
        if (/^(Arrow|Key[WASD]|Space)/.test(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        // Esc primeiro cancela a mira; depois pausa. O tiro travado solta.
        this.fireLatch = false;
        this.lockOn = false;
        if (this.aiming) this.cancelAim();
        else this.onPause?.();
        return;
      }
      if (this.control === 'notebook' && e.code === 'KeyC') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        this.lockOn = !this.lockOn;
        this.onLock?.(this.lockOn);
        return;
      }
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.shiftIsBound()) {
        e.preventDefault();
      }
      const prep = PREPARE[e.code];
      if (prep && !this.codeBound(e.code)) {
        this.press(prep);
        return;
      }
      const slot = this.slotOf(e.code);
      if (slot) this.press(slot);
      if (/^(Arrow|Space|Tab)/.test(e.code) || e.code.startsWith('Shift')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const slot = this.slotOf(e.code);
      if (slot && this.aiming && this.aiming.slot === slot && !this.aiming.touch && queuesOnRelease(this.styleOf(slot, this.aiming.kind))) this.release();
    });
    // trocou de app / aba: solta tudo (nada fica "preso" apertado)
    const releaseAll = () => {
      this.keys.clear();
      this.fireLatch = false;
      this.rmbAim = false;
      this.cancelAim();
      this.releaseSticks();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => document.hidden && releaseAll());

    const zone = touchRoot.querySelector<HTMLElement>('#stick-zone')!;
    const base = touchRoot.querySelector<HTMLElement>('#stick-base')!;
    const knob = touchRoot.querySelector<HTMLElement>('#stick-knob')!;
    const radius = () => base.getBoundingClientRect().width / 2;

    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const restBase = () => {
      base.style.left = '';
      base.style.top = '';
      base.style.bottom = '';
      base.style.right = '';
      setKnob(0, 0);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.active) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.stick.active = true;
      this.stick.id = e.pointerId;
      // analógico flutuante: nasce onde o polegar tocou
      const r = radius();
      const zr = zone.getBoundingClientRect();
      base.style.left = `${e.clientX - zr.left - r}px`;
      base.style.top = `${e.clientY - zr.top - r}px`;
      base.style.bottom = 'auto';
      base.style.right = 'auto';
      this.stick.cx = e.clientX;
      this.stick.cy = e.clientY;
      this.stick.x = this.stick.y = 0;
    });
    const move = (e: PointerEvent) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      const r = radius();
      let dx = e.clientX - this.stick.cx;
      let dy = e.clientY - this.stick.cy;
      const d = Math.hypot(dx, dy);
      if (d > r) {
        dx = (dx / d) * r;
        dy = (dy / d) * r;
      }
      setKnob(dx, dy);
      const dead = 0.12;
      const mag = Math.min(1, d / (r * 0.8));
      if (mag < dead) {
        this.stick.x = this.stick.y = 0;
      } else {
        this.stick.x = (dx / (Math.hypot(dx, dy) || 1)) * mag;
        this.stick.y = (dy / (Math.hypot(dx, dy) || 1)) * mag;
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.active = false;
      this.stick.id = -1;
      this.stick.x = this.stick.y = 0;
      restBase();
    };
    this.resetMoveStick = () => {
      this.stick.active = false;
      this.stick.id = -1;
      this.stick.x = this.stick.y = 0;
      restBase();
    };
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // botões de habilidade no toque: tocar = usa na hora (mira automática); arrastar = mira com prévia; soltar = usa
    const cancelEl = touchRoot.querySelector<HTMLElement>('#aim-cancel');
    const bindBtn = (sel: string, slot: Slot) => {
      const b = touchRoot.querySelector<HTMLElement>(sel);
      if (!b) return;
      let pid = -1;
      let cx = 0;
      let cy = 0;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        pid = e.pointerId;
        const r = b.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        b.classList.add('pressed');
        try {
          navigator.vibrate?.(12);
        } catch {
          /* sem vibração */
        }
        const kind = this.aimKind(slot);
        if (kind === 'instant') {
          this.press(slot);
          return;
        }
        if (!this.canUse(slot)) {
          this.onDenied?.(slot);
          pid = -1;
          return;
        }
        this.aiming = { slot, kind, touch: { dx: 0, dy: 0 } };
        this.onAimChange?.(this.aiming);
      });
      b.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid || !this.aiming || this.aiming.slot !== slot || !this.aiming.touch) return;
        this.aiming.touch = { dx: e.clientX - cx, dy: e.clientY - cy };
        if (cancelEl) {
          const r = cancelEl.getBoundingClientRect();
          cancelEl.classList.toggle('hot', e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom);
        }
      });
      const up = (e: PointerEvent) => {
        b.classList.remove('pressed');
        if (e.pointerId !== pid) return;
        pid = -1;
        if (!this.aiming || this.aiming.slot !== slot || !this.aiming.touch) return;
        // soltou em cima do "cancelar": não usa nada
        if (cancelEl) {
          const r = cancelEl.getBoundingClientRect();
          if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
            this.cancelAim();
            return;
          }
        }
        const kindNow = this.aiming.kind;
        const { dx, dy } = this.aiming.touch;
        const len = Math.hypot(dx, dy);
        // ultimate de área/linha: toque seco não gasta a carga; é preciso arrastar até o ponto
        if (!confirmTouchCast(slot, kindNow, len)) {
          this.cancelAim();
          return;
        }
        // arrastou o botão: mira do arrasto; só tocou: usa a mira do analógico direito (se tiver)
        const stickAim = this.manualAim();
        this.touchCast = len > 18 ? { ang: Math.atan2(dy, dx), ratio: Math.min(1, len / 90) } : stickAim !== null ? { ang: stickAim, ratio: 0.75 } : null;
        this.aiming = null;
        this.onAimChange?.(null);
        this.queued.add(slot);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', (e) => {
        b.classList.remove('pressed');
        if (e.pointerId === pid) this.cancelAim();
        pid = -1;
      });
    };
    bindBtn('#btn-dash', 'dash');
    bindBtn('#btn-ability', 'ability');
    bindBtn('#btn-item', 'item');
    bindBtn('#btn-bonus', 'bonus');
    bindBtn('#btn-skill', 'skill');
    bindBtn('#btn-ult', 'ult');
    bindBtn('#btn-plasma', 'plasma');
    // analógico direito (no lugar do ATIRAR): arrastar = mira em 360° e atira enquanto segura;
    // só tocar = atira na mira automática. Ao soltar, a última direção arrastada continua valendo.
    const fireBtn = touchRoot.querySelector<HTMLElement>('#btn-fire')!;
    const aknob = fireBtn.querySelector<HTMLElement>('.aknob');
    const A = this.aimStick;
    const AIM_DEAD = 14;
    const setAKnob = () => {
      if (!aknob) return;
      const r = fireBtn.getBoundingClientRect().width * 0.32;
      const d = Math.hypot(A.dx, A.dy);
      const k = d > r ? r / d : 1;
      aknob.style.transform = `translate(${A.dx * k}px, ${A.dy * k}px)`;
    };
    fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (A.active) return;
      fireBtn.setPointerCapture(e.pointerId);
      // o centro é onde o dedo tocou (a mira não pula para um lado ao encostar)
      Object.assign(A, { active: true, id: e.pointerId, cx: e.clientX, cy: e.clientY, dx: 0, dy: 0, manual: false });
      this.fireTouch = true;
      fireBtn.classList.add('pressed');
      setAKnob();
    });
    fireBtn.addEventListener('pointermove', (e) => {
      if (!A.active || e.pointerId !== A.id) return;
      A.dx = e.clientX - A.cx;
      A.dy = e.clientY - A.cy;
      if (Math.hypot(A.dx, A.dy) > AIM_DEAD) {
        A.manual = true;
        this.lastAim = Math.atan2(A.dy, A.dx);
      }
      setAKnob();
    });
    const fireUp = (e: PointerEvent) => {
      if (e.pointerId !== A.id) return;
      // toque rápido sem arrastar: volta para a mira automática
      if (!A.manual) this.lastAim = null;
      A.active = false;
      A.id = -1;
      A.dx = A.dy = 0;
      this.fireTouch = false;
      fireBtn.classList.remove('pressed');
      setAKnob();
    };
    fireBtn.addEventListener('pointerup', fireUp);
    fireBtn.addEventListener('pointercancel', fireUp);
    fireBtn.addEventListener('lostpointercapture', fireUp);
    this.resetAimStick = () => {
      A.active = false;
      A.id = -1;
      A.dx = A.dy = 0;
      this.fireTouch = false;
      fireBtn.classList.remove('pressed');
      setAKnob();
    };
    // mouse no computador: mira e atira com o botão esquerdo sobre a arena
    const canvas = document.getElementById('game')!;
    window.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY, at: performance.now() };
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY, at: performance.now() };
      if (e.button === 0) {
        // clique confirma a mira (habilidades de área)
        if (this.aiming && !this.aiming.touch) {
          this.release();
          this.ateClick = true;
        } else {
          this.fireMouse = true;
          this.mouseDownAt = performance.now();
          this.ateClick = false;
        }
      }
      if (e.button === 2) {
        if (this.aiming && this.cancelAimButtons === 'both') this.cancelAim();
        else if (this.powers) {
          /* no X1 e no 2x2 o direito não solta o F */
        } else if (this.control === 'notebook') this.rmbAim = true;
        else this.press('bonus');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireMouse = false;
      if (e.button === 2) this.rmbAim = false;
    });

    window.addEventListener(
      'touchstart',
      () => {
        if (!this.touchMode) {
          this.touchMode = true;
          this.onFirstTouch?.();
        }
      },
      { passive: true },
    );
    if (window.matchMedia?.('(pointer: coarse)').matches) this.touchMode = true;
  }

  private resetMoveStick = () => {};
  private resetAimStick = () => {};
  /** solta os dois analógicos e o tiro (troca de app, fim de partida…) */
  releaseSticks() {
    this.fireMouse = false;
    this.rmbAim = false;
    this.resetMoveStick();
    this.resetAimStick();
  }

  /** Mira do notebook: segue o cursor e limita o giro para o trackpad não pular. */
  smoothAim(target: number): number {
    if (this.aimAng === null) this.aimAng = target;
    this.aimAng = stepAim(this.aimAng, target, this.aimSens);
    return this.aimAng;
  }

  /** mira manual do analógico direito: arrastando agora ou a última direção; null = automática */
  manualAim(): number | null {
    if (!this.touchMode) return null;
    return this.lastAim;
  }
  /** o dedo está no analógico direito agora (para o indicador de mira) */
  get aimHeld() {
    return this.aimStick.active;
  }

  private codeBound(code: string) {
    return (Object.values(this.binds) as string[]).includes(code);
  }
  private shiftIsBound() {
    return this.codeBound('ShiftLeft') || this.codeBound('ShiftRight') || this.binds.dash === 'ShiftLeft' || this.binds.dash === 'ShiftRight';
  }

  private slotOf(code: string): Slot | null {
    for (const k of Object.keys(this.binds) as Action[]) if (k !== 'fire' && this.binds[k] === code) return k;
    if (code === 'ShiftRight' && this.binds.dash === 'ShiftLeft') return 'dash';
    return null;
  }

  /** tecla/botão apertado: usa na hora ou abre a mira */
  private press(slot: Slot) {
    // fora do combate (Núcleo) o Espaço continua sendo o impulso
    if (!this.combat && slot === 'item') slot = 'dash';
    if (this.aiming && this.aiming.slot !== slot) this.cancelAim();
    const kind = this.aimKind(slot);
    if (!this.canUse(slot)) {
      this.onDenied?.(slot);
      return;
    }
    const style = this.styleOf(slot, kind);
    if (queuesOnPress(style)) {
      this.castScreen = { x: this.mouse.x, y: this.mouse.y };
      this.queued.add(slot);
      this.pendingCharge = this.charged(slot) ? 1 : null;
      return;
    }
    this.holdAt = performance.now();
    this.pendingCharge = null;
    this.aiming = { slot, kind, touch: null };
    this.onAimChange?.(this.aiming);
  }
  /** soltou a tecla (ou clicou): dispara na direção do mouse */
  private release() {
    if (!this.aiming) return;
    if (this.charged(this.aiming.slot)) {
      const max = Math.max(0.2, this.chargeSeconds(this.aiming.slot)) * 1000;
      this.pendingCharge = Math.max(0, Math.min(1, (performance.now() - this.holdAt) / max));
    } else this.pendingCharge = null;
    this.castScreen = { x: this.mouse.x, y: this.mouse.y };
    this.queued.add(this.aiming.slot);
    this.touchCast = null;
    this.aiming = null;
    this.onAimChange?.(null);
  }
  /** carga atual enquanto segura um poder que cresce. null se não está carregando. */
  aimCharge(): number | null {
    if (!this.aiming || !this.charged(this.aiming.slot)) return null;
    const max = Math.max(0.2, this.chargeSeconds(this.aiming.slot)) * 1000;
    return Math.max(0, Math.min(1, (performance.now() - this.holdAt) / max));
  }
  get precision() {
    if (this.shiftIsBound()) return false;
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  get arrowsDown() {
    return this.keys.has('ArrowLeft') || this.keys.has('ArrowRight') || this.keys.has('ArrowUp') || this.keys.has('ArrowDown');
  }
  private styleOf(slot: Slot, kind: AimKind): CastStyle {
    return resolveCastStyle({
      castMode: this.castMode,
      control: this.control,
      touch: this.touchMode,
      manual: this.manualSlots.has(slot),
      kind,
    });
  }
  cancelAim() {
    if (!this.aiming) return;
    this.aiming = null;
    this.touchCast = null;
    this.pendingCharge = null;
    this.onAimChange?.(null);
  }

  private stickIntentNow(ax: number, ay: number, kx: number, ky: number) {
    return stickIntent({
      moveScheme: this.moveScheme,
      keyboardAim: this.keyboardAim,
      aiming: !!this.aiming,
      precision: this.precision,
      arrows: { x: ax, y: ay },
      keys: { x: kx, y: ky },
      stick: this.stick.active ? { x: this.stick.x, y: this.stick.y } : { x: 0, y: 0 },
      prevAim: this.kbAim,
    });
  }

  /** Lê o estado do passo atual (habilidades são "um toque" e se consomem). */
  read(): Input & { touchCast?: { ang: number; ratio: number } | null; castScreen?: { x: number; y: number } | null } {
    const k = this.keys;
    const bound = new Set(Object.values(this.binds));
    const held = (code: string) => k.has(code) && !bound.has(code);
    let ax = 0;
    let ay = 0;
    if (k.has('ArrowLeft')) ax -= 1;
    if (k.has('ArrowRight')) ax += 1;
    if (k.has('ArrowUp')) ay -= 1;
    if (k.has('ArrowDown')) ay += 1;
    let kx = 0;
    let ky = 0;
    if (this.moveScheme === 'wasd') {
      if (held('KeyA')) kx -= 1;
      if (held('KeyD')) kx += 1;
      if (held('KeyW')) ky -= 1;
      if (held('KeyS')) ky += 1;
    } else if (this.moveScheme === 'esdf') {
      if (held('KeyS')) kx -= 1;
      if (held('KeyF')) kx += 1;
      if (held('KeyE')) ky -= 1;
      if (held('KeyD')) ky += 1;
    }
    const stick = this.stickIntentNow(ax, ay, kx, ky);
    const mx = stick.mx;
    const my = stick.my;
    this.kbAim = stick.aim;
    const fire = (this.fireTouch || this.fireMouse || this.fireLatch || k.has(this.binds.fire)) && !this.rmbAim;
    const q = this.queued;
    const out = {
      mx,
      my,
      dash: q.has('dash'),
      ability: q.has('ability'),
      item: q.has('item'),
      bonus: q.has('bonus'),
      skill: q.has('skill'),
      ult: q.has('ult'),
      plasma: q.has('plasma'),
      fire: fire && !this.aiming,
      aim: null as number | null,
      ch: q.size ? this.pendingCharge : null,
      touchCast: q.size ? this.touchCast : null,
      castScreen: q.size ? this.castScreen : null,
    };
    if (q.size) {
      this.touchCast = null;
      this.pendingCharge = null;
      this.castScreen = null;
    }
    q.clear();
    return out;
  }

  clear() {
    this.keys.clear();
    this.queued.clear();
    this.aiming = null;
    this.touchCast = null;
    this.pendingCharge = null;
    this.castScreen = null;
    this.lastAim = null;
    this.fireLatch = false;
    this.lockOn = false;
    this.rmbAim = false;
    this.aimAng = null;
    this.releaseSticks();
  }
}
