import type { Input } from '../game/sim';
import type { AimKind } from '../game/balance';

/** ações que podem ser remapeadas no teclado */
export type Slot = 'ability' | 'skill' | 'ult' | 'dash' | 'item' | 'bonus';
export type Action = Slot | 'fire';
export type KeyBinds = Record<Action, string>;

/** esquema inicial (estilo MOBA) */
export const DEFAULT_KEYS: KeyBinds = {
  ability: 'KeyQ',
  skill: 'KeyE',
  ult: 'KeyR',
  dash: 'ShiftLeft',
  item: 'Space',
  bonus: 'KeyF',
  fire: 'KeyJ',
};
export const ACTION_LABEL: Record<Action, string> = {
  ability: 'Habilidade do personagem',
  skill: 'Habilidade do equipamento',
  ult: 'Ultimate',
  dash: 'Impulso / esquiva',
  item: 'Item (granada, mina…)',
  bonus: 'Poder do cristal / utilidade',
  fire: 'Atirar (além do clique)',
};
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyP']);

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
export function isReservedKey(code: string) {
  return MOVE_KEYS.has(code);
}

/** mira em andamento (segurando a tecla ou arrastando o botão) */
export interface Aiming {
  slot: Slot;
  kind: AimKind;
  /** toque: vetor do arrasto (px) a partir do centro do botão */
  touch: { dx: number; dy: number } | null;
}

/** Junta teclado + mouse + analógico virtual + botões de toque em um único Input por passo. */
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
  /** posição do mouse na tela (para mirar no computador) */
  mouse = { x: 0, y: 0, at: 0 };
  /** modo combate: Espaço vira item e o clique atira */
  combat = false;
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
        // Esc primeiro cancela a mira; depois pausa
        if (this.aiming) this.cancelAim();
        else this.onPause?.();
        return;
      }
      const slot = this.slotOf(e.code);
      if (slot) this.press(slot);
      if (/^(Arrow|Space|Tab)/.test(e.code) || e.code.startsWith('Shift')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const slot = this.slotOf(e.code);
      if (slot && this.aiming && this.aiming.slot === slot && !this.aiming.touch) this.release();
    });
    // trocou de app / aba: solta tudo (nada fica "preso" apertado)
    const releaseAll = () => {
      this.keys.clear();
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
        const { dx, dy } = this.aiming.touch;
        const len = Math.hypot(dx, dy);
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
        if (this.aiming && !this.aiming.touch) this.release();
        else this.fireMouse = true;
      }
      if (e.button === 2) {
        // botão direito: cancela a mira; sem mira, usa o poder do cristal
        if (this.aiming) this.cancelAim();
        else this.press('bonus');
      }
    });
    window.addEventListener('mouseup', () => (this.fireMouse = false));

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
    this.resetMoveStick();
    this.resetAimStick();
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
    if (kind === 'instant' || this.touchMode) {
      this.queued.add(slot);
      return;
    }
    this.aiming = { slot, kind, touch: null };
    this.onAimChange?.(this.aiming);
  }
  /** soltou a tecla (ou clicou): dispara na direção do mouse */
  private release() {
    if (!this.aiming) return;
    this.queued.add(this.aiming.slot);
    this.touchCast = null;
    this.aiming = null;
    this.onAimChange?.(null);
  }
  cancelAim() {
    if (!this.aiming) return;
    this.aiming = null;
    this.touchCast = null;
    this.onAimChange?.(null);
  }

  /** Lê o estado do passo atual (habilidades são "um toque" e se consomem). */
  read(): Input & { touchCast?: { ang: number; ratio: number } | null } {
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (this.stick.active && (this.stick.x || this.stick.y)) {
      mx = this.stick.x;
      my = this.stick.y;
    }
    const fire = this.fireTouch || this.fireMouse || k.has(this.binds.fire);
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
      fire: fire && !this.aiming,
      aim: null as number | null,
      touchCast: q.size ? this.touchCast : null,
    };
    if (q.size) this.touchCast = null;
    q.clear();
    return out;
  }

  clear() {
    this.keys.clear();
    this.queued.clear();
    this.aiming = null;
    this.touchCast = null;
    this.lastAim = null;
    this.releaseSticks();
  }
}
