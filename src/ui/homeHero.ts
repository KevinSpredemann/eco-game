// Tela inicial: só o personagem, grande, à direita. Sem arma e sem ficha.
import type { CharacterDef } from '../game/characters';
import { accessoryById } from '../game/economy';
import { WEAPONS, loadoutPrimary } from '../game/weapons';
import { drawCharacter } from '../render/chars';
import { accessoryBehind, drawAccessory } from '../render/accessories';
import { dpr, hexA, paintStudio } from './portraits';

export class HomeHero {
  running = false;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private phase = 0;
  private char: CharacterDef | null = null;
  private acc = 'nenhum';
  private reduce = false;

  constructor(private cv: HTMLCanvasElement) {
    this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.addEventListener('resize', () => this.running && this.fit());
  }

  set(c: CharacterDef, acc: string, _weapon?: string) {
    this.char = c;
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
    this.draw();
  }

  private stage() {
    const parent = (this.cv.parentElement ?? this.cv).getBoundingClientRect();
    const box = document.getElementById('home-stage')?.getBoundingClientRect();
    if (!box || box.width < 8) {
      const floor = this.h * 0.86;
      return { floor, s: Math.min((this.h * 0.7) / 68, (this.w * 0.42) / 34), x: this.w * 0.72 };
    }
    const top = box.top - parent.top + 4;
    const floor = box.bottom - parent.top - 18;
    const avail = Math.max(140, floor - top);
    const s = Math.min(avail / 64, (box.width * 0.86) / 32);
    const x = box.left - parent.left + box.width / 2;
    return { floor, s, x };
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
    const { floor, s, x } = this.stage();
    const glow = g.createRadialGradient(x, floor - s * 30, 8, x, floor - s * 18, Math.max(s * 40, 220));
    glow.addColorStop(0, hexA(col, 0.34));
    glow.addColorStop(0.55, hexA(col, 0.08));
    glow.addColorStop(1, hexA(col, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, this.w, this.h);

    const drift = this.reduce ? 0 : Math.sin(this.phase * 0.35) * 6;
    if (!this.reduce) {
      for (let i = 0; i < 16; i++) {
        const t = this.phase * 0.45 + i * 1.7;
        const x = ((i * 0.17) % 1) * this.w + Math.sin(t) * 10;
        const y = ((i * 0.13 + this.phase * 0.015) % 1) * this.h;
        g.globalAlpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t));
        g.fillStyle = i % 2 ? col : '#3ee8ff';
        g.beginPath();
        g.arc(x, y, 1.1 + (i % 3) * 0.45, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    const breath = this.reduce ? 1 : 1 + Math.sin(this.phase) * 0.012;
    g.fillStyle = hexA(col, 0.2);
    g.beginPath();
    g.ellipse(x + drift, floor, Math.max(70, s * 16), Math.max(10, s * 3.2), 0, 0, Math.PI * 2);
    g.fill();

    const acc = accessoryById(this.acc);
    g.save();
    g.translate(x + drift, floor);
    g.scale(s * breath, s * breath);
    const posed = paintStudio(g, c.art, 42);
    if (!posed) {
      if (accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
      drawCharacter(g, c, 'down', this.phase, false);
      if (!accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
    }
    g.restore();
  }
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
