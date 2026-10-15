// Tela inicial: só o personagem, grande, à direita. Sem arma e sem ficha.
import type { CharacterDef } from '../game/characters';
import { accessoryById } from '../game/economy';
import { WEAPONS, loadoutPrimary } from '../game/weapons';
import { drawCharacter } from '../render/chars';
import { accessoryBehind, drawAccessory } from '../render/accessories';
import { dpr, hexA, studioSprite } from './portraits';
import { ELEMENT_COLOR, mainElementOf, type Element } from '../game/elements';

export { mainElementOf };

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

/** Mesma conta de sempre: cerca de 78% da altura do palco, sem passar da largura. */
export function heroFit(maxH: number, maxW: number, spanH: number, spanW: number) {
  return Math.min((maxH * 0.78) / spanH, (maxW * 0.9) / spanW);
}

export class HomeHero {
  running = false;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private phase = 0;
  private char: CharacterDef | null = null;
  private acc = 'nenhum';
  reduce = false;
  motes: Mote[] = [];
  el: Element = 'wind';

  constructor(private cv: HTMLCanvasElement) {
    this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.addEventListener('resize', () => this.running && this.fit());
  }

  set(c: CharacterDef, acc: string, _weapon?: string) {
    if (this.char?.id !== c.id) this.motes = [];
    this.char = c;
    this.el = mainElementOf(c.id);
    this.acc = acc || 'nenhum';
    this.writeCaption();
  }

  start() {
    if (this.running) {
      this.writeCaption();
      return;
    }
    this.running = true;
    this.fit();
    this.writeCaption();
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private fit() {
    const rect = (this.cv.parentElement ?? this.cv).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.w = rect.width;
    this.h = rect.height;
    const k = dpr();
    const pw = Math.round(this.w * k);
    const ph = Math.round(this.h * k);
    if (this.cv.width !== pw || this.cv.height !== ph) {
      this.cv.width = pw;
      this.cv.height = ph;
    }
  }

  private writeCaption() {
    const el = document.getElementById('title-cast');
    if (el) el.replaceChildren();
  }

  private tick(dt: number) {
    const box = this.cv.parentElement ?? this.cv;
    if (Math.abs(box.clientWidth - this.w) > 1 || Math.abs(box.clientHeight - this.h) > 1) this.fit();
    if (!this.w || !this.h || !this.char) return;
    this.phase += dt * (this.reduce ? 0 : 1.6);
    stepMotes(this, dt);
    this.draw();
  }

  /** Área útil da coluna da direita. O personagem fica no centro dela. */
  private stage() {
    const parent = (this.cv.parentElement ?? this.cv).getBoundingClientRect();
    const box = document.getElementById('home-stage')?.getBoundingClientRect();
    if (!box || box.width < 8) {
      const top = this.h * 0.16;
      const floor = this.h * 0.94;
      const maxW = this.w * 0.42;
      return { top, floor, maxH: floor - top, maxW, x: this.w * 0.72, left: this.w * 0.54 };
    }
    const top = box.top - parent.top + 6;
    const floor = box.bottom - parent.top - 8;
    const left = box.left - parent.left + 8;
    const maxW = Math.max(80, box.width - 16);
    return { top, floor, maxH: Math.max(120, floor - top), maxW, x: left + maxW / 2, left };
  }

  /** Base do botão Como jogar, no mesmo eixo do canvas. Sem o botão ao lado, usa o fallback. */
  private footLine(fallback: number): number {
    const parent = (this.cv.parentElement ?? this.cv).getBoundingClientRect();
    const btn = document.querySelector('#screen-title [data-action="howto"]');
    const stage = document.getElementById('home-stage');
    if (!btn || !stage) return fallback;
    const b = btn.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const beside = b.height > 4 && b.right <= s.left + 12 && b.bottom > s.top && b.bottom < s.bottom;
    if (!beside) return fallback;
    return b.bottom - parent.top;
  }

  /** Corpo desenhado, em unidades locais (pés na origem). Medido de verdade, uma vez por personagem. */
  private figure(): { box: InkBox; img: HTMLImageElement | null } {
    const c = this.char!;
    const img = studioSprite(c.art);
    if (img?.complete && img.naturalWidth > 0) return { box: studioInk(img), img };
    return { box: vectorInk(c, this.acc), img: null };
  }

  private draw() {
    const g = this.cv.getContext('2d');
    const c = this.char;
    if (!g || !c) return;
    const k = this.cv.width / this.w;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#07041a';
    g.fillRect(0, 0, this.w, this.h);
    const col = c.glow ?? c.color;
    const { top, maxW, maxH, x, left } = this.stage();
    const { box, img } = this.figure();
    const spanH = Math.max(8, box.bottom - box.top);
    const spanW = Math.max(8, box.right - box.left);
    // Cerca de 78% da altura do palco. O limiar da medida ignora a sombra, senão o corpo fica pequeno.
    const s = heroFit(maxH, maxW, spanH, spanW);
    const originX = x - ((box.left + box.right) / 2) * s;
    const bodyH = spanH * s;
    // Mesmo tamanho de antes. Os pés sobem até a base do botão Como jogar, lida do layout.
    const feetY = this.footLine(top + maxH / 2 + spanH * s * 0.5);
    const originY = feetY - box.bottom * s;
    const bodyMid = originY + ((box.top + box.bottom) / 2) * s;
    const glowR = Math.min(bodyH * 0.62, Math.max(48, x - left - 6));
    const glow = g.createRadialGradient(x, bodyMid, 8, x, bodyMid, glowR);
    glow.addColorStop(0, hexA(col, 0.34));
    glow.addColorStop(0.55, hexA(col, 0.1));
    glow.addColorStop(1, hexA(col, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, this.w, this.h);

    if (!this.reduce) {
      for (let i = 0; i < 16; i++) {
        const t = this.phase * 0.45 + i * 1.7;
        const px = ((i * 0.17) % 1) * this.w + Math.sin(t) * 10;
        const py = ((i * 0.13 + this.phase * 0.015) % 1) * this.h;
        g.globalAlpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t));
        g.fillStyle = i % 2 ? col : '#3ee8ff';
        g.beginPath();
        g.arc(px, py, 1.1 + (i % 3) * 0.45, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    const breath = this.reduce ? 1 : 1 + Math.sin(this.phase) * 0.012;
    const sway = this.reduce ? 0 : Math.sin(this.phase * 0.7) * 0.02;
    const footLocal = box.bottom;
    const elCol = ELEMENT_COLOR[this.el];
    // palco: disco de luz no chão na cor do elemento, com anel que respira
    const platW = Math.min(bodyH * 0.36, maxW * 0.3);
    const ring = this.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(this.phase * 1.3);
    const floor = g.createRadialGradient(originX, feetY + 4, 2, originX, feetY + 4, platW * 1.6);
    floor.addColorStop(0, hexA(elCol, 0.28));
    floor.addColorStop(0.5, hexA(col, 0.08));
    floor.addColorStop(1, hexA(col, 0));
    g.save();
    g.translate(originX, feetY + 4);
    g.scale(1, 0.22);
    g.fillStyle = floor;
    g.beginPath();
    g.arc(0, 0, platW * 1.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = hexA(elCol, 0.25 + 0.25 * ring);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, platW * (1 + 0.05 * ring), 0, Math.PI * 2);
    g.stroke();
    g.restore();
    drawMotes(this, g, originX, feetY, bodyH, elCol, true);
    g.fillStyle = 'rgba(4, 2, 16, 0.28)';
    g.beginPath();
    g.ellipse(originX, feetY + 3, Math.min(bodyH * 0.26, maxW * 0.2), Math.min(14, bodyH * 0.035), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hexA(col, 0.16);
    g.beginPath();
    g.ellipse(originX, feetY + 1, Math.min(bodyH * 0.16, maxW * 0.12), Math.min(7, bodyH * 0.02), 0, 0, Math.PI * 2);
    g.fill();
    const sky = g.createLinearGradient(0, top, 0, feetY);
    sky.addColorStop(0, hexA('#d7f6ff', 0.06));
    sky.addColorStop(1, hexA('#d7f6ff', 0));
    g.fillStyle = sky;
    g.fillRect(0, 0, this.w, this.h);

    const acc = accessoryById(this.acc);
    const bob = this.reduce ? 0 : Math.sin(this.phase * 0.9) * Math.min(3, bodyH * 0.006);
    g.save();
    g.translate(originX, originY + footLocal * s - Math.max(0, bob));
    g.rotate(sway);
    g.scale(s, s * breath);
    g.translate(0, -footLocal);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // contorno de luz (luz de trás) na cor do elemento: separa o personagem do fundo
    // (só na arte em imagem: no desenho vetorial cada peça ganharia sombra própria)
    if (img) {
      g.shadowColor = hexA(elCol, 0.55);
      g.shadowBlur = 22 * (this.cv.width / this.w);
    }
    if (img) g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight, img.naturalWidth, img.naturalHeight);
    else {
      if (accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
      drawCharacter(g, c, 'down', this.phase, false);
      if (!accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
    }
    g.shadowBlur = 0;
    g.shadowColor = 'transparent';
    g.restore();
    drawMotes(this, g, originX, feetY, bodyH, elCol, false);
  }
}

type InkBox = { top: number; bottom: number; left: number; right: number };

// partículas do elemento em volta do personagem (poucas, lentas, sem disputar com os botões)
function stepMotes(self: { motes: Mote[]; reduce: boolean; el: Element }, dt: number) {
  if (self.reduce) {
    self.motes.length = 0;
    return;
  }
  for (const m of self.motes) {
    m.life += dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (self.el === 'wind') m.vx += Math.cos(m.life * 3) * 20 * dt;
  }
  self.motes = self.motes.filter((m) => m.life < m.max);
  if (self.motes.length < 18 && Math.random() < dt * 9) {
    const el = self.el;
    const u = (Math.random() - 0.5) * 2;
    self.motes.push(
      el === 'fire'
        ? { x: u * 0.32, y: -Math.random() * 0.15, vx: u * 6, vy: -38 - Math.random() * 30, life: 0, max: 2.2, size: 2.2 }
        : el === 'ice'
          ? { x: u * 0.3, y: -0.2 - Math.random() * 0.6, vx: 0, vy: -14 - Math.random() * 10, life: 0, max: 3, size: 3.2 }
          : el === 'nature'
            ? { x: u * 0.36, y: 0, vx: u * 10, vy: -16 - Math.random() * 12, life: 0, max: 1.8, size: 2.6 }
            : { x: u * 0.4, y: -0.1 - Math.random() * 0.7, vx: 40 + Math.random() * 30, vy: -6, life: 0, max: 2.2, size: 2 },
    );
  }
}

function drawMotes(self: { motes: Mote[]; el: Element }, g: CanvasRenderingContext2D, cx: number, feetY: number, bodyH: number, col: string, back: boolean) {
  self.motes.forEach((m, i) => {
    if ((i % 2 === 0) !== back) return;
    const k = m.life / m.max;
    const a = Math.sin(Math.PI * Math.min(1, k)) * 0.75;
    const x = cx + m.x * bodyH + m.vx * m.life * 0.4;
    const y = feetY + m.y * bodyH + m.vy * m.life;
    g.globalAlpha = a;
    if (self.el === 'ice') {
      // bolhas de água subindo
      g.strokeStyle = hexA(col, 0.9);
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, m.size, 0, Math.PI * 2);
      g.stroke();
    } else if (self.el === 'nature') {
      // poeira e pedrinhas
      g.fillStyle = i % 3 ? '#c99a52' : '#7a5228';
      g.fillRect(x, y, m.size, m.size);
    } else if (self.el === 'fire') {
      g.fillStyle = i % 2 ? '#ffb347' : '#ff5a1e';
      g.beginPath();
      g.arc(x, y, m.size * (1 - k * 0.6), 0, Math.PI * 2);
      g.fill();
    } else {
      // riscos de vento
      g.strokeStyle = hexA(col, 0.8);
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 14, y + 1);
      g.stroke();
    }
  });
  g.globalAlpha = 1;
}

const inkCache = new Map<string, InkBox>();
const FALLBACK: InkBox = { top: -78, bottom: 6, left: -20, right: 20 };

function inkOf(data: Uint8ClampedArray, w: number, h: number, ox: number, oy: number, scale: number): InkBox | null {
  let minx = w;
  let miny = h;
  let maxx = -1;
  let maxy = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] < 96) continue;
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    }
  }
  if (maxx < 0) return null;
  return {
    left: (minx - ox) / scale,
    right: (maxx - ox) / scale,
    top: (miny - oy) / scale,
    bottom: (maxy - oy) / scale,
  };
}

function vectorInk(c: CharacterDef, accId: string): InkBox {
  const key = `v:${c.id}:${accId}:${c.suit}:${c.hair}:${c.color}`;
  const hit = inkCache.get(key);
  if (hit) return hit;
  const S = 4;
  const W = 720;
  const H = 880;
  const ox = 360;
  const oy = 760;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return FALLBACK;
  g.translate(ox, oy);
  g.scale(S, S);
  const acc = accessoryById(accId);
  if (accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  drawCharacter(g, c, 'down', 0, false);
  if (!accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  const box = inkOf(g.getImageData(0, 0, W, H).data, W, H, ox, oy, S) ?? FALLBACK;
  inkCache.set(key, box);
  return box;
}

function studioInk(img: HTMLImageElement): InkBox {
  const key = `s:${img.src}:${img.naturalWidth}x${img.naturalHeight}`;
  const hit = inkCache.get(key);
  if (hit) return hit;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return FALLBACK;
  g.drawImage(img, 0, 0);
  // Mesma origem do desenho: centro em x, pés no rodapé da folha.
  const box = inkOf(g.getImageData(0, 0, w, h).data, w, h, w / 2, h, 1) ?? FALLBACK;
  inkCache.set(key, box);
  return box;
}

/** Prévia grande da personalização: roupa, acessório e arma no mesmo desenho da tela inicial. */
export function drawEquippedPreview(cv: HTMLCanvasElement, c: CharacterDef, accId: string, weapon: string, phase: number) {
  const w = cv.clientWidth || cv.width;
  const h = cv.clientHeight || cv.height;
  if (!w || !h) return;
  const k = dpr();
  const pw = Math.round(w * k);
  const ph = Math.round(h * k);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#07041a';
  g.fillRect(0, 0, w, h);
  const col = c.glow ?? c.color;
  const glow = g.createRadialGradient(w * 0.5, h * 0.42, 8, w * 0.5, h * 0.48, Math.max(w, h) * 0.62);
  glow.addColorStop(0, hexA(col, 0.38));
  glow.addColorStop(0.6, hexA(col, 0.08));
  glow.addColorStop(1, hexA(col, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  const floor = h * 0.84;
  g.fillStyle = hexA(col, 0.22);
  g.beginPath();
  g.ellipse(w / 2, floor, Math.max(48, w * 0.18), 12, 0, 0, Math.PI * 2);
  g.fill();
  const acc = accessoryById(accId);
  const s = Math.min((h * 0.62) / 70, (w * 0.42) / 36);
  const turn = Math.sin(phase * 0.35);
  const facing = turn > 0.72 ? 'side' : turn < -0.72 ? 'up' : 'down';
  g.save();
  g.translate(w / 2 + Math.sin(phase * 0.5) * 6, floor);
  g.scale(s, s);
  if (accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  drawCharacter(g, c, facing, phase, false);
  if (!accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  paintWeapon(g, c.id, weapon);
  g.restore();
}

function paintWeapon(g: CanvasRenderingContext2D, charId: string, choice: string) {
  const w = WEAPONS[loadoutPrimary(charId, choice)];
  g.save();
  g.translate(15, -32);
  g.rotate(-0.4);
  const len = 12 + w.gun.len * 0.42;
  g.fillStyle = '#0c0a16';
  g.fillRect(-1, -4, len + 6, 8);
  g.fillStyle = w.gun.body;
  g.fillRect(0, -3, len, 6);
  g.fillStyle = w.color;
  g.fillRect(len - 2, -2, 6, 4);
  g.restore();
}
