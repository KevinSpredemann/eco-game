// Tela inicial: o personagem principal, grande, com a roupa, o acessório e a arma favorita.
import type { CharacterDef } from '../game/characters';
import { accessoryById } from '../game/economy';
import { WEAPONS, loadoutPrimary } from '../game/weapons';
import { drawCharacter } from '../render/chars';
import { accessoryBehind, drawAccessory } from '../render/accessories';
import { hexA } from './portraits';

export class HomeHero {
  running = false;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private phase = 0;
  private char: CharacterDef | null = null;
  private acc = 'nenhum';
  private weapon = 'assinatura';
  private reduce = false;

  constructor(private cv: HTMLCanvasElement) {
    this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.addEventListener('resize', () => this.running && this.fit());
  }

  set(c: CharacterDef, acc: string, weapon: string) {
    this.char = c;
    this.acc = acc || 'nenhum';
    this.weapon = weapon || 'assinatura';
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
    const k = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(this.w * k);
    const ph = Math.round(this.h * k);
    if (this.cv.width !== pw || this.cv.height !== ph) {
      this.cv.width = pw;
      this.cv.height = ph;
    }
  }

  private writeCaption() {
    const el = document.getElementById('title-cast');
    const c = this.char;
    if (!el || !c) return;
    const acc = accessoryById(this.acc);
    const gun = WEAPONS[loadoutPrimary(c.id, this.weapon)];
    const bits = [gun.name, acc.id === 'nenhum' ? '' : acc.name].filter(Boolean).join(' · ');
    el.innerHTML = `<b style="color:${c.color}">${c.name.toUpperCase()}</b><span class="role">${c.title}</span><span class="line">${bits}</span>`;
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
    const cap = document.getElementById('title-cast')?.getBoundingClientRect().height ?? 72;
    if (!box) {
      const top = cap + 16;
      const floor = this.h * 0.62;
      const avail = Math.max(120, floor - top);
      return { floor, s: Math.min(avail / 70, (this.w * 0.72) / 36) };
    }
    const top = box.top - parent.top + cap + 8;
    const floor = box.bottom - parent.top - 10;
    const avail = Math.max(96, floor - top);
    const s = Math.min(avail / 70, (box.width * 0.78) / 36);
    return { floor, s };
  }

  private draw() {
    const g = this.cv.getContext('2d');
    const c = this.char;
    if (!g || !c) return;
    const k = this.cv.width / this.w;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#07041a';
    g.fillRect(0, 0, this.w, this.h);
    const col = c.glow ?? c.color;
    const glow = g.createRadialGradient(this.w / 2, this.h * 0.34, 8, this.w / 2, this.h * 0.36, Math.max(this.w, this.h) * 0.55);
    glow.addColorStop(0, hexA(col, 0.28));
    glow.addColorStop(0.55, hexA(col, 0.06));
    glow.addColorStop(1, hexA(col, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, this.w, this.h);

    const { floor, s } = this.stage();
    g.fillStyle = hexA(col, 0.2);
    g.beginPath();
    g.ellipse(this.w / 2, floor, Math.max(70, s * 16), Math.max(10, s * 3.2), 0, 0, Math.PI * 2);
    g.fill();

    const acc = accessoryById(this.acc);
    g.save();
    g.translate(this.w / 2, floor);
    g.scale(s, s);
    if (accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
    drawCharacter(g, c, 'down', this.phase, false);
    if (!accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
    paintWeapon(g, c.id, this.weapon);
    g.restore();
  }
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
