import type { Input } from '../game/sim';

/** Junta teclado + analógico virtual + botões de toque em um único Input por passo. */
export class InputManager {
  private keys = new Set<string>();
  private stick = { x: 0, y: 0, active: false, id: -1, cx: 0, cy: 0 };
  private dashQueued = false;
  private abilityQueued = false;
  touchMode = false;
  onPause: (() => void) | null = null;
  onFirstTouch: (() => void) | null = null;

  constructor(private touchRoot: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (/^(Arrow|Key[WASD])/.test(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyJ') this.dashQueued = true;
      if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') this.abilityQueued = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

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
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const bindBtn = (sel: string, fn: () => void) => {
      const b = touchRoot.querySelector<HTMLElement>(sel)!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
        b.classList.add('pressed');
        if (navigator.vibrate) {
          try {
            navigator.vibrate(12);
          } catch {
            /* sem vibração */
          }
        }
      });
      const up = () => b.classList.remove('pressed');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    };
    bindBtn('#btn-dash', () => (this.dashQueued = true));
    bindBtn('#btn-ability', () => (this.abilityQueued = true));

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

  /** Lê o estado do passo atual (impulso/habilidade são "um toque" e se consomem). */
  read(): Input {
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
    const out = { mx, my, dash: this.dashQueued, ability: this.abilityQueued };
    this.dashQueued = false;
    this.abilityQueued = false;
    return out;
  }

  clear() {
    this.keys.clear();
    this.dashQueued = this.abilityQueued = false;
    this.stick.x = this.stick.y = 0;
  }
}
