// Tela do ECO Mundo. O chão é desenhado uma vez; criaturas usam pose barata (andar, ataque, dano, morte).
import { getCharacter } from '../game/characters';
import { MUNDO_KEY, parseMundo } from '../game/mundo/blob';
import { REGIONS } from '../game/mundo/regions';
import { NPCS, PATHS, PROPS, type NpcDef } from '../game/mundo/scenery';
import { ANOMALY, linaLines } from '../game/mundo/quest';
import { drawNpcMarker, drawProp, drawStream } from '../render/mundoArt';
import { GEAR_COST, MAT_PRICE, POTION_COST, derived, xpForLevel } from '../game/mundo/rules';
import { MundoWorld, type Actor } from '../game/mundo/sim';
import type { MundoGear, Rarity, StatId } from '../game/mundo/types';
import { corpsePose, gritSpecks } from '../render/visuals';
import { SpriteCache, WALK_FRAMES, facingOf } from '../render/sprites';

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#d5d7ea',
  rare: '#3ea8ff',
  epic: '#c084fc',
  legendary: '#ffd23e',
};
const MONSTER_COLOR: Record<string, string> = {
  chaser: '#ff5a4a',
  ranged: '#c084fc',
  caller: '#d6ff4a',
  boss: '#ff8a1e',
};

type Panel = 'none' | 'shop' | 'bank' | 'tomb' | 'stats' | 'talk';

export class MundoController {
  private world: MundoWorld;
  private sprites = new SpriteCache();
  private floors = new Map<string, HTMLCanvasElement>();
  private shadow: HTMLCanvasElement;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false };
  private stick: { id: number; x: number; y: number; cx: number; cy: number } | null = null;
  private aimId: number | null = null;
  private aim = 0;
  private aimed = false;
  private hold = 0;
  private abilityPulse = false;
  private interactPulse = false;
  private panel: Panel = 'none';
  private talk: NpcDef | null = null;
  private talkAt = 0;
  private cam = { s: 1, ox: 0, oy: 0, w: 1, h: 1, dpr: 1 };
  private bits: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }[] = [];
  private lite: boolean;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private saveAt = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private root: HTMLElement,
    charId: string,
    private onExit: () => void,
  ) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(MUNDO_KEY);
    } catch {
      raw = null;
    }
    this.world = new MundoWorld(parseMundo(raw, charId), Date.now());
    this.lite = window.matchMedia('(max-width: 800px), (prefers-reduced-motion: reduce)').matches;
    this.shadow = softBlob();
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="mundo-top">
        <button type="button" class="btn small ghost" id="mundo-leave">Sair</button>
        <div class="mundo-readout">
          <div class="mundo-hp"><i id="mundo-hp"></i></div>
          <div class="mundo-xp"><i id="mundo-xp"></i></div>
          <p id="mundo-line"></p>
        </div>
        <div class="mundo-pts" id="mundo-pts"></div>
      </div>
      <p class="mundo-hint" id="mundo-hint"></p>
      <div class="mundo-panel" id="mundo-panel" hidden></div>
      <div class="mundo-actions">
        <button type="button" class="btn" id="mundo-act">Habilidade</button>
        <button type="button" class="btn" id="mundo-use">Interagir</button>
      </div>`;
    this.root.querySelector('#mundo-leave')!.addEventListener('click', () => this.onExit());
    this.root.querySelector('#mundo-act')!.addEventListener('click', () => {
      this.abilityPulse = true;
    });
    this.root.querySelector('#mundo-use')!.addEventListener('click', () => {
      this.interactPulse = true;
    });
    this.onKeyDown = (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.interactPulse = true;
      if (e.code === 'KeyQ') this.abilityPulse = true;
      if (e.code === 'Escape') this.closePanel();
      if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space') e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.paintHud();
  }

  frame(dt: number) {
    const input = this.readInput();
    const before = this.world.note;
    this.world.step(dt, input);
    this.spawnBits();
    if (this.world.note && this.world.note !== before) this.flash(this.world.note);
    this.aim = input.aim;
    if (this.hold > 0) this.hold -= dt;
    if (this.interactPulse) this.interact();
    this.abilityPulse = false;
    this.interactPulse = false;
    this.draw();
    this.paintHud();
    this.saveAt += dt;
    if (this.saveAt > 4) {
      this.saveAt = 0;
      this.persist();
    }
  }

  destroy() {
    this.persist();
    this.root.hidden = true;
    this.root.innerHTML = '';
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private persist() {
    try {
      localStorage.setItem(MUNDO_KEY, JSON.stringify(this.world.save));
    } catch {
      /* aparelho sem armazenamento */
    }
  }

  private readInput() {
    let mx = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let my = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    if (this.stick) {
      mx = Math.max(-1, Math.min(1, (this.stick.x - this.stick.cx) / 48));
      my = Math.max(-1, Math.min(1, (this.stick.y - this.stick.cy) / 48));
    }
    const p = this.world.player;
    let aim = this.aim;
    if (this.aimed || this.mouse.down || this.aimId != null) {
      const wpt = this.screenToWorld(this.mouse.x, this.mouse.y);
      aim = Math.atan2(wpt.y - (p.y - 28), wpt.x - p.x);
    }
    if (this.panel !== 'none') return { mx: 0, my: 0, aim, fire: false, ability: false };
    return { mx, my, aim, fire: this.mouse.down || this.aimId != null, ability: this.abilityPulse || this.keys.has('KeyQ') };
  }

  private nearestNpc(): NpcDef | null {
    let best: NpcDef | null = null;
    let reach = 78;
    for (const n of NPCS) {
      if (n.region !== this.world.regionId) continue;
      const dist = Math.hypot(this.world.player.x - n.x, this.world.player.y - n.y);
      if (dist < reach) {
        reach = dist;
        best = n;
      }
    }
    return best;
  }

  private interact() {
    const near = this.world.near();
    if (near === 'shop') this.openPanel('shop');
    else if (near === 'bank') this.openPanel('bank');
    else if (near === 'tomb') {
      this.flash(this.world.claimTomb());
      this.persist();
    } else {
      const npc = this.nearestNpc();
      if (npc) this.openTalk(npc);
      else if (this.world.save.points > 0) this.openPanel('stats');
      else this.flash('Nada por perto. Portais ficam na borda do mapa.');
    }
  }

  private openTalk(npc: NpcDef) {
    this.talk = npc;
    this.talkAt = 0;
    this.panel = 'talk';
    const said = this.world.talkNpc(npc.id);
    if (said) this.flash(said);
    this.paintTalk();
  }

  private paintTalk() {
    const npc = this.talk;
    const box = this.root.querySelector('#mundo-panel') as HTMLElement | null;
    if (!npc || !box) return;
    box.hidden = false;
    const lines = npc.id === 'pesquisadora' ? linaLines(this.world.save.quest.step) : npc.lines;
    const last = this.talkAt >= lines.length - 1;
    const line = lines[this.talkAt] ?? '';
    box.innerHTML = `<header><b>${npc.name}</b><button type="button" class="btn small ghost" data-x>Fechar</button></header><p>${npc.role}</p><p>${line}</p><button type="button" class="btn" data-next>${last ? 'Fechar' : 'Continuar'}</button>`;
    box.querySelector('[data-x]')?.addEventListener('click', () => this.closePanel());
    box.querySelector('[data-next]')?.addEventListener('click', () => {
      if (last) this.closePanel();
      else {
        this.talkAt += 1;
        this.paintTalk();
      }
    });
  }

  private openPanel(kind: Panel) {
    this.panel = kind;
    const box = this.root.querySelector('#mundo-panel') as HTMLElement;
    box.hidden = false;
    const s = this.world.save;
    if (kind === 'shop') {
      box.innerHTML = `<header><b>Loja da vila</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Poção cura na hora. A loja também compra o que você carrega.</p>
        <button type="button" class="btn" data-buy="potion">Poção · ${POTION_COST} moedas</button>
        <button type="button" class="btn" data-buy="weapon">Arma comum · ${GEAR_COST}</button>
        <button type="button" class="btn" data-buy="armor">Armadura comum · ${GEAR_COST}</button>
        <button type="button" class="btn" data-buy="relic">Relíquia comum · ${GEAR_COST}</button>
        <button type="button" class="btn" data-mats="1">Vender 1 material · ${MAT_PRICE}</button>
        <div class="mundo-bag">${this.bagHtml(s.bag)}</div>`;
    } else if (kind === 'bank') {
      box.innerHTML = `<header><b>Banco</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Moedas no banco ficam salvas quando você cai. Na bolsa: ${s.coins}. No banco: ${s.bank}.</p>
        <button type="button" class="btn" data-bank="dep-all">Guardar tudo</button>
        <button type="button" class="btn" data-bank="dep-10">Guardar 10</button>
        <button type="button" class="btn" data-bank="wd-10">Sacar 10</button>
        <button type="button" class="btn" data-bank="wd-all">Sacar tudo</button>`;
    } else if (kind === 'tomb') {
      box.innerHTML = `<header><b>Tumba</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Seus itens ficam aqui por 10 minutos. Outra morte apaga esta tumba.</p>
        <button type="button" class="btn" data-tomb>Pegar itens</button>`;
    } else {
      const d = derived(s);
      box.innerHTML = `<header><b>Pontos (${s.points})</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Vida ${d.maxHp} · dano ×${d.dmgMul.toFixed(2)} · velocidade ${Math.round(d.speed)} · recarga ×${d.cdMul.toFixed(2)}</p>
        <button type="button" class="btn" data-stat="hp">+ Vida</button>
        <button type="button" class="btn" data-stat="dmg">+ Dano</button>
        <button type="button" class="btn" data-stat="speed">+ Velocidade</button>
        <button type="button" class="btn" data-stat="cd">+ Recarga</button>
        <div class="mundo-bag">${this.bagHtml(s.bag)}</div>`;
    }
    box.querySelector('[data-x]')?.addEventListener('click', () => this.closePanel());
    box.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.buy;
        this.flash(k === 'potion' ? this.world.buyPotion() : this.world.buyGear(k as 'weapon' | 'armor' | 'relic'));
        this.persist();
        this.openPanel('shop');
      }),
    );
    box.querySelector('[data-mats]')?.addEventListener('click', () => {
      this.flash(this.world.sellMats(1));
      this.persist();
      this.openPanel('shop');
    });
    box.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) =>
      b.addEventListener('click', () => {
        this.flash(this.world.sellAt(Number(b.dataset.sell)));
        this.persist();
        this.openPanel(kind);
      }),
    );
    box.querySelectorAll<HTMLButtonElement>('[data-eq]').forEach((b) =>
      b.addEventListener('click', () => {
        this.flash(this.world.equip(Number(b.dataset.eq)));
        this.persist();
        this.openPanel(kind);
      }),
    );
    box.querySelectorAll<HTMLButtonElement>('[data-bank]').forEach((b) =>
      b.addEventListener('click', () => {
        const s = this.world.save;
        const k = b.dataset.bank;
        if (k === 'dep-all') this.flash(this.world.deposit(s.coins));
        else if (k === 'dep-10') this.flash(this.world.deposit(10));
        else if (k === 'wd-all') this.flash(this.world.withdraw(s.bank));
        else this.flash(this.world.withdraw(10));
        this.persist();
        this.openPanel('bank');
      }),
    );
    box.querySelector('[data-tomb]')?.addEventListener('click', () => {
      this.flash(this.world.claimTomb());
      this.persist();
      this.closePanel();
    });
    box.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((b) =>
      b.addEventListener('click', () => {
        const msg = this.world.spend(b.dataset.stat as StatId);
        this.flash(msg || 'Ponto usado.');
        this.persist();
        if (this.world.save.points > 0) this.openPanel('stats');
        else this.closePanel();
      }),
    );
  }

  private bagHtml(bag: MundoGear[]) {
    if (!bag.length) return '<p>Bolsa vazia.</p>';
    return bag
      .map((g, i) => {
        const c = RARITY_COLOR[g.rarity];
        return `<p><b style="color:${c}">${g.name}</b> <button type="button" class="btn small" data-eq="${i}">Equipar</button> <button type="button" class="btn small ghost" data-sell="${i}">Vender</button></p>`;
      })
      .join('');
  }

  private closePanel() {
    this.panel = 'none';
    this.talk = null;
    const box = this.root.querySelector('#mundo-panel') as HTMLElement | null;
    if (box) box.hidden = true;
  }

  private flash(msg: string) {
    const hint = this.root.querySelector('#mundo-hint');
    if (hint && msg) hint.textContent = msg;
    if (msg) this.hold = 3.2;
  }

  private paintHud() {
    const w = this.world;
    const s = w.save;
    const hp = this.root.querySelector('#mundo-hp') as HTMLElement | null;
    const xp = this.root.querySelector('#mundo-xp') as HTMLElement | null;
    const line = this.root.querySelector('#mundo-line');
    if (!hp || !xp || !line) return;
    hp.style.width = `${Math.max(0, w.player.hp / w.player.maxHp) * 100}%`;
    const goal = Math.max(1, xpForLevel(s.level));
    xp.style.width = s.level >= 30 ? '100%' : `${Math.min(100, (s.xp / goal) * 100)}%`;
    const gear = [s.weapon, s.armor, s.relic].filter(Boolean).map((g) => g!.name).join(' · ') || 'sem equipamento';
    line.textContent = `${w.player.name} · ${w.region.name} · nível ${s.level} · ${s.coins} moedas · banco ${s.bank} · ${s.materials} mat. · ${s.points} pts · ${gear}`;
  }

  private pointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement | null)?.closest?.('#mundo-ui button, #mundo-panel')) return;
    const left = e.clientX < window.innerWidth * 0.45;
    if (e.pointerType !== 'mouse' && left) {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY };
      return;
    }
    if (e.pointerType !== 'mouse' && !left) {
      this.aimId = e.pointerId;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      return;
    }
    if (e.button === 0) {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }
  }

  private pointerMove(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse' || e.pointerId === this.aimId) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.aimed = true;
    }
  }

  private pointerUp(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) this.stick = null;
    if (this.aimId === e.pointerId) this.aimId = null;
    if (e.pointerType === 'mouse') this.mouse.down = false;
  }

  private screenToWorld(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (x - rect.left - this.cam.ox) / this.cam.s, y: (y - rect.top - this.cam.oy) / this.cam.s };
  }

  private draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const dpr = cssW > 0 ? this.canvas.width / cssW : 1;
    const reg = this.world.region;
    const viewH = this.lite ? 820 : 700;
    const s = cssH / viewH;
    const focusY = this.world.player.y - 20;
    const ox = clampCam(cssW, reg.w, this.world.player.x, s);
    const oy = clampCam(cssH, reg.h, focusY, s);
    this.cam = { s, ox, oy, w: cssW, h: cssH, dpr };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = reg.id === 'vila' ? '#1a2214' : '#0e160f';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.drawImage(this.floor(reg.id), 0, 0, reg.w, reg.h);
    const animT = this.world.clock / 1000;
    if (reg.id === 'floresta' && !this.lite) drawStream(ctx, animT);
    const layers: { y: number; draw: () => void }[] = [];
    for (const prop of PROPS[reg.id]) layers.push({ y: prop.y, draw: () => drawProp(ctx, prop, animT) });
    for (const b of reg.blocks) layers.push({ y: b.y + b.h, draw: () => this.drawBlock(ctx, b, reg.id, animT) });
    for (const t of reg.trees) layers.push({ y: t.y, draw: () => drawProp(ctx, { kind: 'tree', x: t.x, y: t.y, r: t.r }, animT) });
    for (const npc of NPCS) if (npc.region === reg.id) layers.push({ y: npc.y, draw: () => this.drawNpc(ctx, npc, animT) });
    layers.push({ y: this.world.region.portal.y, draw: () => this.drawPortal(ctx, this.world.region.portal) });
    for (const gate of this.world.region.gates ?? []) layers.push({ y: gate.y, draw: () => this.drawPortal(ctx, gate) });
    if (reg.id === 'floresta' && this.world.save.quest.step === 2) layers.push({ y: ANOMALY.y, draw: () => this.drawAnomaly(ctx) });
    const tomb = this.world.save.tomb;
    if (tomb && tomb.region === reg.id) layers.push({ y: tomb.y, draw: () => this.drawTomb(ctx) });
    for (const d of this.world.drops) layers.push({ y: d.y, draw: () => this.drawDrop(ctx, d.x, d.y) });
    for (const m of this.world.monsters) layers.push({ y: m.y, draw: () => this.drawMonster(ctx, m) });
    layers.push({ y: this.world.player.y, draw: () => this.drawPlayer(ctx) });
    layers.sort((a, b) => a.y - b.y);
    for (const layer of layers) layer.draw();
    for (const sh of this.world.shots) {
      ctx.fillStyle = sh.team === 0 ? '#9ef0ff' : '#ffb347';
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.lite) this.drawBits(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.lite) {
      const g = ctx.createRadialGradient(cssW * 0.5, cssH * 0.45, cssH * 0.2, cssW * 0.5, cssH * 0.5, cssH * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, reg.id === 'floresta' ? 'rgba(6,18,12,0.5)' : 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    }
    const near = this.world.near();
    const npc = near ? null : this.nearestNpc();
    const hint = this.root.querySelector('#mundo-hint');
    if (hint && this.panel === 'none' && this.hold <= 0) {
      hint.textContent = near === 'shop' ? 'E — Abrir loja' : near === 'bank' ? 'E — Acessar banco' : near === 'tomb' ? 'E — Abrir tumba' : npc ? `E — Falar com ${npc.name}` : `${reg.name} · WASD anda · mouse atira · Q habilidade · E interage`;
    }
  }

  private floor(id: string) {
    const got = this.floors.get(id);
    if (got) return got;
    const reg = REGIONS[id as 'vila'];
    const sc = 0.25;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(reg.w * sc));
    cv.height = Math.max(1, Math.round(reg.h * sc));
    const g = cv.getContext('2d')!;
    g.scale(sc, sc);
    g.fillStyle = id === 'vila' ? '#314228' : '#1c3320';
    g.fillRect(0, 0, reg.w, reg.h);
    const paths = PATHS[id as 'vila'] ?? [];
    for (const path of paths) {
      g.fillStyle = path.kind === 'stone' ? '#6a675c' : path.kind === 'wood' ? '#7a5a38' : id === 'vila' ? '#6d5a3c' : '#3d4630';
      g.fillRect(path.x, path.y, path.w, path.h);
    }
    const light = g.createRadialGradient(reg.w * 0.5, reg.h * 0.2, 40, reg.w * 0.55, reg.h * 0.15, reg.w * 0.7);
    light.addColorStop(0, 'rgba(255,236,196,0.18)');
    light.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = light;
    g.fillRect(0, 0, reg.w, reg.h);
    g.fillStyle = '#0a100c';
    for (const speck of gritSpecks(id === 'vila' ? 11 : 29, this.lite ? 80 : 160, reg.w, reg.h)) {
      g.globalAlpha = speck.a + 0.05;
      g.beginPath();
      g.ellipse(speck.x, speck.y, speck.r * 1.4, speck.r, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    this.floors.set(id, cv);
    return cv;
  }

  private drawBlock(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, id: string, t: number) {
    drawProp(ctx, { kind: id === 'vila' ? 'house' : 'ruin', x: b.x + b.w / 2, y: b.y + b.h, w: b.w, h: b.h }, t);
  }

  private drawNpc(ctx: CanvasRenderingContext2D, npc: NpcDef, t: number) {
    drawNpcMarker(ctx, npc.x, npc.y, npc.color, t);
    ctx.fillStyle = npc.color;
    ctx.font = '700 12px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, npc.x, npc.y - 44);
  }

  private drawAnomaly(ctx: CanvasRenderingContext2D) {
    const pulse = 0.35 + Math.sin(this.world.clock / 200) * 0.15;
    ctx.fillStyle = `rgba(62,232,255,${pulse})`;
    ctx.beginPath();
    ctx.arc(ANOMALY.x, ANOMALY.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPortal(ctx: CanvasRenderingContext2D, p: { x: number; y: number; label: string; need?: 'ruidos' }) {
    const pulse = 1 + Math.sin(this.world.clock / 180) * 0.08;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(90, 255, 190, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8dffc4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e9fff4';
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    const locked = p.need === 'ruidos' && this.world.save.quest.step < 4;
    ctx.fillText(locked ? 'BLOQUEADO' : p.label, 0, -40);
    ctx.restore();
  }

  private drawTomb(ctx: CanvasRenderingContext2D) {
    const t = this.world.save.tomb;
    if (!t || t.region !== this.world.regionId || this.world.clock >= t.until) return;
    this.blitShadow(ctx, t.x, t.y + 6, 22);
    ctx.fillStyle = '#9aa0b8';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 26);
    ctx.lineTo(t.x + 14, t.y + 8);
    ctx.lineTo(t.x - 14, t.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#dfe4ff';
    ctx.font = '700 12px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('tumba', t.x, t.y - 32);
  }

  private drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.world.player;
    const c = getCharacter(this.world.save.charId);
    const moving = this.keys.size > 0 || !!this.stick;
    const face = facingOf(p.aim);
    const frame = Math.floor(p.phase * 1.4) % WALK_FRAMES;
    this.sprites.setScale(Math.max(0.75, this.cam.s * this.cam.dpr));
    const img = this.sprites.get(c, face.facing, frame, moving, null, p.hit > 0 ? 'hurt' : 'neutral', p.atk > 0 ? 'cast' : 'normal');
    this.blitShadow(ctx, p.x, p.y + 4, 22);
    ctx.save();
    if (p.hit > 0) ctx.globalAlpha = 0.85;
    this.sprites.draw(ctx, img, p.x, p.y, face.flip, 1);
    ctx.restore();
    this.bar(ctx, p.x, p.y - 78, 36, p.hp / p.maxHp, '#5dff8a');
  }

  private drawMonster(ctx: CanvasRenderingContext2D, m: Actor) {
    const color = MONSTER_COLOR[m.kind] ?? '#fff';
    const pose = m.dead >= 0 ? corpsePose(m.dead) : null;
    if (pose?.done) return;
    const bob = m.dead >= 0 ? 0 : Math.sin(m.phase) * 3;
    const lunge = m.atk > 0 ? 10 : 0;
    ctx.save();
    ctx.translate(m.x + Math.cos(m.aim) * lunge, m.y + bob + Math.sin(m.aim) * lunge + (pose?.dy ?? 0));
    if (pose) {
      ctx.rotate(pose.rot);
      ctx.scale(1 + (1 - pose.squash) * 0.4, pose.squash);
      ctx.globalAlpha = pose.alpha;
    } else if (m.hit > 0) ctx.scale(1.08, 0.9);
    this.blitShadow(ctx, 0, 8, m.r * 1.3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -m.r * 0.2, m.r, m.r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    if (m.kind === 'boss') {
      ctx.fillStyle = '#7a2a12';
      ctx.beginPath();
      ctx.moveTo(-16, -m.r);
      ctx.lineTo(-28, -m.r - 16);
      ctx.lineTo(-6, -m.r + 2);
      ctx.moveTo(16, -m.r);
      ctx.lineTo(28, -m.r - 16);
      ctx.lineTo(6, -m.r + 2);
      ctx.fill();
    } else if (m.kind === 'caller') {
      ctx.fillStyle = '#f4ffb0';
      ctx.beginPath();
      ctx.arc(-8, -m.r * 0.4, 5, 0, Math.PI * 2);
      ctx.arc(8, -m.r * 0.4, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === 'ranged') {
      ctx.strokeStyle = '#f0e2ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.r * 0.2, -4, 12, -0.8, 0.8);
      ctx.stroke();
    }
    const step = m.dead >= 0 ? 0 : Math.sin(m.phase) * 4;
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(-8, m.r * 0.45, 5, 8 + step);
    ctx.fillRect(3, m.r * 0.45, 5, 8 - step);
    ctx.restore();
    if (m.dead < 0 && (m.kind === 'boss' || m.hit > 0 || m.hp < m.maxHp || m.alert > 0)) this.bar(ctx, m.x, m.y - m.r - 16, m.kind === 'boss' ? 64 : 28, m.hp / m.maxHp, color);
    if (m.dead < 0 && (m.kind === 'boss' || m.alert > 0)) {
      ctx.fillStyle = '#e8fff4';
      ctx.font = '700 11px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, m.x, m.y - m.r - 24);
    }
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, color: string) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), 5);
  }

  private blitShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    ctx.drawImage(this.shadow, x - w, y - w * 0.35, w * 2, w * 0.7);
  }

  private spawnBits() {
    if (this.lite || this.bits.length > 36) return;
    const p = this.world.player;
    if (p.hit > 0.12) this.bits.push({ x: p.x, y: p.y - 30, vx: 20, vy: -30, life: 0.35, max: 0.35, color: '#ffd0d0' });
    const moving = this.keys.size > 0 || !!this.stick;
    if (moving && this.world.clock % 180 < 40) {
      this.bits.push({ x: p.x + (this.world.clock % 2 ? 6 : -6), y: p.y + 2, vx: 0, vy: 8, life: 0.28, max: 0.28, color: this.world.regionId === 'vila' ? '#c4a574' : '#6a8a58' });
    }
  }

  private drawBits(ctx: CanvasRenderingContext2D) {
    const next = [];
    for (const b of this.bits) {
      b.life -= 1 / 60;
      b.x += b.vx / 60;
      b.y += b.vy / 60;
      if (b.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, 3, 3);
      next.push(b);
    }
    ctx.globalAlpha = 1;
    this.bits = next;
  }
}

function clampCam(screen: number, world: number, focus: number, scale: number) {
  const raw = screen / 2 - focus * scale;
  const min = screen - world * scale;
  if (min >= 0) return min / 2;
  return Math.max(min, Math.min(0, raw));
}

function softBlob() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 40;
  const g = cv.getContext('2d')!;
  const rad = g.createRadialGradient(32, 20, 2, 32, 20, 30);
  rad.addColorStop(0, 'rgba(0,0,0,0.35)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 40);
  return cv;
}
