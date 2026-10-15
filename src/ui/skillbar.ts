// Barra de habilidades do HUD (computador): desenho, tecla, nome, recarga, carga da ultimate,
// descrição ao passar o mouse e aviso do motivo quando não dá para usar.
import { drawGear, type GearKind } from './gearArt';
import { drawSymbol } from '../render/sprites';
import { dpr } from './portraits';

export interface SlotArt {
  /** 'symbol' = símbolo do personagem; 'dash' = setas; senão um desenho de equipamento */
  kind: GearKind | 'symbol' | 'dash' | 'boss';
  id: string;
  color: string;
}
export interface SlotView {
  id: string;
  key: string;
  name: string;
  art: SlotArt;
  color: string;
  /** 0 = pronto, 1 = recarga começando */
  cd: number;
  /** segundos restantes (0 = pronto) */
  secs: number;
  /** carga 0–100 (ultimate) */
  charge?: number;
  /** indisponível (bloqueado na fase, sem item…) */
  off?: boolean;
  note?: string;
  /** descrição curta (aparece ao passar o mouse) */
  desc: string;
  /** combo pronto neste poder */
  hot?: boolean;
  /** energia que o golpe pede */
  cost?: number;
  /** este espaço está sendo mirado */
  aiming?: boolean;
  /** desenho vetorial do poder (o mesmo da tela de poderes) */
  icon?: string;
  /** sem energia para este golpe */
  dry?: boolean;
  /** mira aberta: o ponto serve ou está bloqueado */
  aim?: 'ok' | 'bad';
}

export function drawSlotArt(cv: HTMLCanvasElement, a: SlotArt) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  if (a.kind === 'primary' || a.kind === 'kit' || a.kind === 'skill' || a.kind === 'ult') return drawGear(cv, a.kind, a.id, a.color, { bg: false });
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d')!;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, w, h);
  if (a.kind === 'symbol') {
    g.shadowColor = a.color;
    g.shadowBlur = 8;
    drawSymbol(g, a.id, w / 2, h / 2, Math.min(w, h) * 0.42, a.color);
    return;
  }
  if (a.kind === 'dash') {
    g.strokeStyle = a.color;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.4 + i * 0.3;
      g.beginPath();
      g.moveTo(w * 0.24 + i * 8, h * 0.3);
      g.lineTo(w * 0.24 + i * 8 + 9, h * 0.5);
      g.lineTo(w * 0.24 + i * 8, h * 0.7);
      g.stroke();
    }
    return;
  }
  // golpes do Chefe: ícones simples e distintos
  g.strokeStyle = a.color;
  g.fillStyle = a.color;
  g.lineWidth = 2.5;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.36;
  g.beginPath();
  if (a.id === 'impacto') {
    for (let i = 1; i <= 3; i++) {
      g.beginPath();
      g.globalAlpha = 1.1 - i * 0.3;
      g.arc(cx, cy, (r * i) / 3, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (a.id === 'barragem') {
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(an) * r * (0.4 + i * 0.08), cy + Math.sin(an) * r * (0.4 + i * 0.08), 2.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (a.id === 'chuva') {
    for (const [x, y] of [
      [-0.5, -0.3],
      [0.4, -0.5],
      [0.1, 0.4],
    ]) {
      g.beginPath();
      g.arc(cx + x * r, cy + y * r, r * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (a.id === 'obsidiana') {
    g.fillRect(cx - r * 0.9, cy - r * 0.8, r * 0.6, r * 1.6);
    g.fillRect(cx + r * 0.3, cy - r * 0.8, r * 0.6, r * 1.6);
  } else {
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    g.lineTo(cx + r * 0.4, cy - r * 0.6);
    g.moveTo(cx + r, cy);
    g.lineTo(cx + r * 0.4, cy + r * 0.6);
    g.stroke();
  }
}

/** pronta para usar? (mesma regra na barra do computador e nos botões do celular) */
export function slotReady(s: SlotView) {
  if (s.off || s.dry) return false;
  if (s.secs > 0) return false;
  if (s.charge !== undefined && s.charge < 100) return false;
  return true;
}

/** Classes visuais da carta. A barra e os testes usam a mesma regra. */
export function slotFlags(s: SlotView) {
  const ready = slotReady(s);
  return {
    ready,
    cool: !ready,
    dry: !!s.dry,
    aiming: !!s.aiming,
    aimOk: s.aim === 'ok',
    aimBad: s.aim === 'bad',
    ult: s.charge !== undefined,
    charged: (s.charge ?? 0) >= 100,
    combo: !!s.hot,
  };
}

export class SkillBar {
  private sig = '';
  /** estado anterior (para o pulso no instante em que fica pronta) */
  private wasReady = new Map<string, boolean>();
  private wasSecs = new Map<string, number>();
  private wasAiming = new Map<string, boolean>();
  private els = new Map<string, HTMLElement>();
  private tip: HTMLElement;
  private bannerEl: HTMLElement;
  constructor(private root: HTMLElement) {
    this.tip = document.createElement('div');
    this.tip.className = 'sk-tip';
    this.tip.hidden = true;
    root.parentElement!.appendChild(this.tip);
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'sk-banner';
    this.bannerEl.hidden = true;
    root.parentElement!.appendChild(this.bannerEl);
  }

  banner(text: string) {
    this.bannerEl.hidden = !text;
    if (this.bannerEl.textContent !== text) this.bannerEl.textContent = text;
  }

  render(slots: SlotView[]) {
    const sig = slots.map((s) => `${s.id}|${s.key}|${s.name}|${s.icon ? 'ico:' + (s.icon.match(/data-kind="([^"]+)"/)?.[1] ?? 'x') : s.art.kind + ':' + s.art.id}|${s.color}`).join(';');
    if (sig !== this.sig) {
      this.sig = sig;
      this.root.innerHTML = slots
        .map(
          (s) =>
            `<div class="sk${s.icon ? ' has-icon' : ''}" data-sk="${s.id}" style="--c:${s.color}">${s.icon ? `<span class="sk-ico">${s.icon}</span>` : '<canvas class="sk-art"></canvas>'}<span class="sk-key">${s.key}</span><span class="sk-name">${s.name}</span><span class="sk-cost"></span><span class="sk-num"></span><i class="sk-cd"></i><span class="sk-why"></span></div>`,
        )
        .join('');
      this.els.clear();
      this.root.querySelectorAll<HTMLElement>('[data-sk]').forEach((e) => {
        this.els.set(e.dataset.sk!, e);
        e.addEventListener('mouseenter', () => this.showTip(e));
        e.addEventListener('mouseleave', () => (this.tip.hidden = true));
      });
      requestAnimationFrame(() =>
        slots.forEach((s) => {
          if (s.icon) return;
          const cv = this.els.get(s.id)?.querySelector('canvas');
          if (cv) drawSlotArt(cv, s.art);
        }),
      );
    }
    for (const s of slots) {
      const e = this.els.get(s.id);
      if (!e) continue;
      e.dataset.desc = s.desc;
      e.dataset.title = `${s.name} · ${s.key}`;
      const charge = s.charge !== undefined;
      const flags = slotFlags(s);
      const ready = flags.ready;
      // acabou de ficar pronta: pulso de luz (como no LoL)
      const before = this.wasReady.get(s.id);
      if (ready && before === false) this.flash(e, 'just-ready');
      this.wasReady.set(s.id, ready);
      const prevSecs = this.wasSecs.get(s.id) ?? 0;
      if (prevSecs <= 0.05 && s.secs > 0.05) this.flash(e, 'cast');
      this.wasSecs.set(s.id, s.secs);
      if (s.aiming && this.wasAiming.get(s.id) === false) this.flash(e, 'pressed');
      this.wasAiming.set(s.id, !!s.aiming);
      e.classList.toggle('ready', ready);
      e.classList.toggle('cool', flags.cool);
      e.classList.toggle('off', !!s.off);
      e.classList.toggle('dry', flags.dry);
      e.classList.toggle('combo', flags.combo);
      e.classList.toggle('aiming', flags.aiming);
      e.classList.toggle('aim-ok', flags.aimOk);
      e.classList.toggle('aim-bad', flags.aimBad);
      e.classList.toggle('ult', flags.ult);
      e.classList.toggle('charged', flags.charged);
      const cost = e.querySelector('.sk-cost')!;
      const costText = s.cost && !s.off ? String(s.cost) : '';
      if (cost.textContent !== costText) cost.textContent = costText;
      e.style.setProperty('--p', String(charge ? 1 - Math.min(100, s.charge ?? 0) / 100 : Math.max(0, Math.min(1, s.cd))));
      const num = e.querySelector('.sk-num')!;
      const t = s.note ?? (s.secs > 0 ? `${Math.ceil(s.secs)}s` : charge ? (ready ? 'PRONTA' : `${Math.floor(s.charge ?? 0)}%`) : '');
      if (num.textContent !== t) num.textContent = t;
    }
  }

  private flash(e: HTMLElement, cls: string) {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  }

  private showTip(e: HTMLElement) {
    this.tip.innerHTML = `<b>${e.dataset.title ?? ''}</b><span>${e.dataset.desc ?? ''}</span>`;
    this.tip.hidden = false;
    const r = e.getBoundingClientRect();
    this.tip.style.left = `${r.left + r.width / 2}px`;
    this.tip.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  /** mostra por que não deu para usar (recarga, carga, sem item…) */
  why(id: string, text: string) {
    const e = this.els.get(id);
    if (!e) return;
    const w = e.querySelector<HTMLElement>('.sk-why')!;
    w.textContent = text;
    e.classList.remove('denied');
    void e.offsetWidth;
    e.classList.add('denied');
  }

  clear() {
    this.sig = '';
    this.root.innerHTML = '';
    this.els.clear();
    this.tip.hidden = true;
    this.banner('');
  }
}
