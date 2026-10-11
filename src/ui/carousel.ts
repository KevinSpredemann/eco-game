// Carrossel circular: um item gigante no centro, vizinhos menores nas laterais.
// Setas, deslizar com o dedo/mouse, roda do mouse e teclado.

export class Carousel {
  index = 0;
  private cards: HTMLElement[] = [];
  private track: HTMLElement;
  private dragX: number | null = null;
  private dragDx = 0;
  onChange: (i: number) => void = () => {};
  /** chamado quando o tamanho dos cards muda (para redesenhar sem esticar) */
  onResize: () => void = () => {};
  private sizeKey = '';
  /** proporção largura/altura do card */
  aspect = 0.7;

  constructor(
    private root: HTMLElement,
    private count: number,
    build: (i: number) => HTMLElement,
  ) {
    this.track = root.querySelector('.car-track')!;
    this.track.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = build(i);
      el.classList.add('car-card');
      el.addEventListener('click', () => {
        if (Math.abs(this.dragDx) > 8) return;
        if (i !== this.index) this.set(i);
      });
      this.track.appendChild(el);
      this.cards.push(el);
    }
    root.querySelector('.car-arrow.left')!.addEventListener('click', () => this.go(-1));
    root.querySelector('.car-arrow.right')!.addEventListener('click', () => this.go(1));
    this.track.onpointerdown = (e) => {
      this.dragX = e.clientX;
      this.dragDx = 0;
    };
    this.track.onpointermove = (e) => {
      if (this.dragX === null) return;
      this.dragDx = e.clientX - this.dragX;
      this.layout(this.dragDx);
    };
    const end = () => {
      if (this.dragX === null) return;
      const dx = this.dragDx;
      this.dragX = null;
      const step = this.stepPx();
      if (Math.abs(dx) > 40) this.go(dx < 0 ? Math.max(1, Math.round(-dx / step)) : -Math.max(1, Math.round(dx / step)));
      else this.layout();
      setTimeout(() => (this.dragDx = 0), 0);
    };
    this.track.onpointerup = end;
    this.track.onpointercancel = end;
    this.track.onpointerleave = end;
    this.track.onwheel = (e) => {
      if (Math.abs(e.deltaX) + Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      this.go((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1);
    };
    new ResizeObserver(() => this.layout()).observe(this.track);
  }

  get center(): HTMLElement {
    return this.cards[this.index];
  }

  go(d: number) {
    this.set((((this.index + d) % this.count) + this.count) % this.count);
  }

  set(i: number, silent = false) {
    this.index = i;
    this.layout();
    if (!silent) this.onChange(i);
  }

  private dims() {
    const w = this.track.clientWidth;
    const h = this.track.clientHeight;
    const portrait = w < h * 0.9;
    // card do meio grande, sempre na mesma proporção (nunca esticado)
    let ch = h * 0.97;
    let cw = ch * this.aspect;
    const maxW = portrait ? w * 0.8 : w * 0.46;
    if (cw > maxW) {
      cw = maxW;
      ch = cw / this.aspect;
    }
    return { w, h, cw, ch, portrait };
  }

  private stepPx() {
    const { cw, portrait } = this.dims();
    return cw * (portrait ? 0.58 : 0.72);
  }

  /** posiciona os cards; drag = deslocamento do dedo em px */
  layout(drag = 0) {
    const { w, h, cw, ch } = this.dims();
    if (!w || !h) return;
    const step = this.stepPx();
    const key = `${Math.round(cw)}x${Math.round(ch)}`;
    const resized = key !== this.sizeKey;
    this.sizeKey = key;
    this.cards.forEach((el, i) => {
      let d = i - this.index;
      if (d > this.count / 2) d -= this.count;
      if (d < -this.count / 2) d += this.count;
      const pos = d + drag / step;
      const ad = Math.abs(pos);
      // escala uniforme (mesma proporção em todos os cards)
      const scale = ad < 1 ? 1 - ad * 0.36 : Math.max(0.4, 0.64 - (ad - 1) * 0.14);
      const x = Math.sign(pos) * (ad < 1 ? ad * step : step + (ad - 1) * step * 0.55);
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      el.style.transform = `translate(-50%, -50%) translateX(${x}px) scale(${scale})`;
      el.style.zIndex = String(100 - Math.round(ad * 10));
      el.style.opacity = ad > 2.6 ? '0' : ad > 1.6 ? String(0.5 - (ad - 1.6) * 0.5) : ad > 0.5 ? '0.85' : '1';
      el.style.filter = ad > 0.5 ? 'brightness(0.75)' : '';
      el.style.pointerEvents = ad > 2.2 ? 'none' : '';
      el.classList.toggle('center', d === 0);
      el.style.transition = drag ? 'none' : '';
    });
    if (resized) this.onResize();
  }
}
