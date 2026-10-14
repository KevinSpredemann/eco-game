// Tela do ECO Mundo. O chão é desenhado uma vez; criaturas usam pose barata (andar, ataque, dano, morte).
import { audio } from '../audio/audio';
import { getCharacter } from '../game/characters';
import { MUNDO_KEY, parseMundo } from '../game/mundo/blob';
import { INTERACT_R, PORTAL_R, portalCard, REGIONS } from '../game/mundo/regions';
import { NPCS, PATHS, PROPS, type NpcDef } from '../game/mundo/scenery';
import { ANOMALY, QUEST_NAME, linaLines, questBlurb } from '../game/mundo/quest';
import { DODGE_CD, DODGE_COST, POWERS, type PowerId } from '../game/mundo/powers';
import { drawNpcMarker, drawProp, drawStream } from '../render/mundoArt';
import { GEAR_COST, MAT_PRICE, POTION_COST, bossPhase, derived, xpForLevel } from '../game/mundo/rules';
import { MundoWorld, type Actor } from '../game/mundo/sim';
import type { MundoGear, MundoSlot, Rarity, StatId } from '../game/mundo/types';
import { primaryOf, WEAPONS } from '../game/weapons';
import { loadSettings, saveSettings, type Settings } from './settings';
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
  wolf: '#7af0ff',
  boss: '#ff8a1e',
};

type Panel = 'none' | 'shop' | 'bank' | 'tomb' | 'stats' | 'talk' | 'bag' | 'pause';

const BIND_KEY = 'eco.mundo.bind';
const RESERVED = new Set(['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyC', 'KeyV', 'KeyI', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'ShiftLeft', 'ShiftRight']);

function loadBind(): string {
  try {
    const v = localStorage.getItem(BIND_KEY);
    if (v && /^Key[A-Z]$/.test(v) && !RESERVED.has(v)) return v;
  } catch {
    /* aparelho sem armazenamento */
  }
  return 'KeyG';
}

function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  return code;
}

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
  private basicPulse = false;
  private powerPulse: PowerId | null = null;
  private dodgePulse = false;
  private interactPulse = false;
  private panel: Panel = 'none';
  private paused = false;
  private questOpen = true;
  private rebinding = false;
  private bind = 'KeyG';
  private settings: Settings;
  private txNonce = 1;
  private notes: { text: string; life: number }[] = [];
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
    this.settings = loadSettings();
    this.bind = loadBind();
    this.lite = this.settings.quality === 'baixa' || this.settings.reduced || window.matchMedia('(max-width: 800px), (prefers-reduced-motion: reduce)').matches;
    this.tune();
    this.shadow = softBlob();
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="mundo-top">
        <button type="button" class="btn small ghost" id="mundo-leave">Sair</button>
      </div>
      <canvas id="mundo-map" class="mundo-map" width="180" height="128"></canvas>
      <p class="mundo-region" id="mundo-region"></p>
      <section class="mundo-quest">
        <button type="button" id="mundo-quest-toggle"></button>
        <p id="mundo-quest-body"></p>
      </section>
      <div class="mundo-notes" id="mundo-notes"></div>
      <aside class="mundo-context" id="mundo-context" hidden></aside>
      <div class="mundo-dock">
        <div class="mundo-portrait">
          <canvas id="mundo-face" width="72" height="72"></canvas>
          <div class="mundo-vitals">
            <b id="mundo-name"></b>
            <div class="mundo-hp"><i id="mundo-hp"></i></div>
            <div class="mundo-en"><i id="mundo-en"></i></div>
            <div class="mundo-xp"><i id="mundo-xp"></i></div>
            <small id="mundo-lv"></small>
          </div>
          <div class="mundo-gear" id="mundo-gear"></div>
        </div>
        <div class="mundo-bar" id="mundo-bar"></div>
      </div>
      <button type="button" class="mundo-prompt" id="mundo-prompt" hidden></button>
      <div class="mundo-panel" id="mundo-panel" hidden></div>`;
    this.buildBar();
    this.root.querySelector('#mundo-leave')!.addEventListener('click', () => this.onExit());
    this.root.querySelector('#mundo-quest-toggle')!.addEventListener('click', () => {
      this.questOpen = !this.questOpen;
      this.paintHud();
    });
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-open-bag]')) this.toggleBag();
      if (t?.closest('#mundo-prompt')) this.interactPulse = true;
    });
    this.onKeyDown = (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this.rebinding) {
        if (e.code === 'Escape') {
          this.rebinding = false;
          this.openPause();
          return;
        }
        if (/^Key[A-Z]$/.test(e.code) && !RESERVED.has(e.code)) {
          this.bind = e.code;
          try {
            localStorage.setItem(BIND_KEY, e.code);
          } catch {
            /* ignora */
          }
          this.rebinding = false;
          this.openPause();
        }
        e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.repeat) {
        if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space') e.preventDefault();
        return;
      }
      if (this.panel !== 'none' || this.paused) {
        if (e.code === 'Escape') this.onEscape();
        if (e.code === 'KeyI' && this.panel !== 'pause') this.toggleBag();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyQ') this.abilityPulse = true;
      if (e.code === 'KeyE') this.powerPulse = 'shot';
      if (e.code === 'KeyR') this.powerPulse = 'dash';
      if (e.code === 'KeyF') this.powerPulse = 'shield';
      if (e.code === 'KeyC') this.powerPulse = 'blast';
      if (e.code === 'KeyV') this.powerPulse = 'trap';
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dodgePulse = true;
      if (e.code === this.bind) this.interactPulse = true;
      if (e.code === 'KeyI') this.toggleBag();
      if (e.code === 'Escape') this.onEscape();
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
    const levelBefore = this.world.save.level;
    const stepBefore = this.world.save.quest.step;
    const regionBefore = this.world.regionId;
    const noteBefore = this.world.note;
    if (this.paused || this.panel !== 'none') {
      this.decayNotes(dt);
      this.draw();
      this.paintHud();
      return;
    }
    const input = this.readInput();
    this.world.step(dt, input);
    this.spawnBits();
    if (this.world.save.level > levelBefore) this.pushNote(`Nível ${this.world.save.level}`);
    if (this.world.save.quest.step !== stepBefore) {
      this.pushNote(questBlurb(this.world.save.quest.step));
      audio.objective();
    }
    if (this.world.regionId !== regionBefore) {
      this.pushNote(this.world.region.name);
      this.tune();
    }
    if (this.world.note && this.world.note !== noteBefore) this.pushNote(this.world.note);
    this.aim = input.aim;
    if (this.hold > 0) this.hold -= dt;
    if (this.interactPulse) {
      audio.click();
      this.interact();
    }
    this.abilityPulse = false;
    this.basicPulse = false;
    this.powerPulse = null;
    this.dodgePulse = false;
    this.interactPulse = false;
    this.decayNotes(dt);
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
    if (this.panel !== 'none' || this.paused) return { mx: 0, my: 0, aim, fire: false, ability: false };
    return {
      mx,
      my,
      aim,
      fire: this.mouse.down || this.aimId != null || this.basicPulse,
      ability: this.abilityPulse || this.keys.has('KeyQ'),
      power: this.powerPulse,
      dodge: this.dodgePulse,
    };
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
    } else if (near === 'chest') {
      this.flash(this.world.claimChest());
      audio.objective();
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
      const potion = this.priceState(POTION_COST, 'Poção', this.world.player.hp >= this.world.player.maxHp ? 'VIDA CHEIA' : '');
      const full = s.bag.length >= 16 ? 'BOLSA CHEIA' : '';
      const weapon = this.priceState(GEAR_COST, 'Arma comum', full);
      const armor = this.priceState(GEAR_COST, 'Armadura comum', full);
      const relic = this.priceState(GEAR_COST, 'Relíquia comum', full);
      const mats = s.materials < 1 ? 'SEM MATERIAIS' : `VENDER · 1 material · ${MAT_PRICE}`;
      box.innerHTML = `<header><b>Balcão da Nara</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Saldo disponível: ${s.coins} moedas</p>
        <h3>Consumíveis</h3>
        <button type="button" class="btn" data-buy="potion" data-tx="pot-${this.txNonce}" ${potion.off ? 'disabled' : ''}>${potion.text}</button>
        <h3>Equipamento</h3>
        <button type="button" class="btn" data-buy="weapon" data-tx="weapon-${this.txNonce}" ${weapon.off ? 'disabled' : ''}>${weapon.text}</button>
        <button type="button" class="btn" data-buy="armor" data-tx="armor-${this.txNonce}" ${armor.off ? 'disabled' : ''}>${armor.text}</button>
        <button type="button" class="btn" data-buy="relic" data-tx="relic-${this.txNonce}" ${relic.off ? 'disabled' : ''}>${relic.text}</button>
        <h3>Materiais</h3>
        <button type="button" class="btn" data-mats="1" data-tx="mat-${this.txNonce}" ${s.materials < 1 ? 'disabled' : ''}>${mats}</button>
        <div class="mundo-bag">${this.bagHtml(s.bag, true)}</div>`;
    } else if (kind === 'bank') {
      const rows = s.ledger.map((r) => `<li>${r.note} · ${r.kind === 'wd' || r.kind === 'buy' ? '−' : '+'}${r.n}</li>`).join('') || '<li>Sem movimentos.</li>';
      box.innerHTML = `<header><b>Guichê do banco</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>Bolsa: ${s.coins}. Banco: ${s.bank}. O que está no banco não cai na morte.</p>
        <button type="button" class="btn" data-bank="dep-all" data-tx="dep-all-${this.txNonce}">Guardar tudo</button>
        <button type="button" class="btn" data-bank="dep-10" data-tx="dep-10-${this.txNonce}">Guardar 10</button>
        <button type="button" class="btn" data-bank="wd-10" data-tx="wd-10-${this.txNonce}">Sacar 10</button>
        <button type="button" class="btn" data-bank="wd-all" data-tx="wd-all-${this.txNonce}">Sacar tudo</button>
        <h3>Extrato</h3>
        <ul class="mundo-ledger">${rows}</ul>`;
    } else if (kind === 'bag') {
      box.innerHTML = `<header><b>Inventário</b><button type="button" class="btn small ghost" data-x>Fechar</button></header>
        <p>${s.coins} moedas · ${s.materials} materiais</p>
        <div class="mundo-bag">${this.bagHtml(s.bag, false)}</div>`;
    } else if (kind === 'pause') {
      box.innerHTML = `<header><b>Pausa</b></header>
        <button type="button" class="btn" data-resume>Retomar</button>
        <label>Geral <input id="vol-master" type="range" min="0" max="100" value="${this.settings.master}"></label>
        <label>Música <input id="vol-music" type="range" min="0" max="100" value="${this.settings.music}"></label>
        <label>Efeitos <input id="vol-sfx" type="range" min="0" max="100" value="${this.settings.sfx}"></label>
        <label>Qualidade <select id="mundo-quality">
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select></label>
        <label><input id="mundo-reduced" type="checkbox" ${this.settings.reduced ? 'checked' : ''}> Reduzir efeitos</label>
        <button type="button" class="btn" data-bind>${this.rebinding ? 'Pressione uma tecla' : `Interagir: ${keyLabel(this.bind)}`}</button>
        <button type="button" class="btn ghost" data-exit>Sair do mundo</button>`;
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
        <div class="mundo-bag">${this.bagHtml(s.bag, false)}</div>`;
    }
    box.querySelector('[data-x]')?.addEventListener('click', () => this.closePanel());
    box.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.buy;
        const id = b.dataset.tx;
        this.flash(k === 'potion' ? this.world.buyPotion(id) : this.world.buyGear(k as 'weapon' | 'armor' | 'relic', id));
        audio.tone({ type: 'sine', freq: 880, dur: 0.08, gain: 0.12 });
        this.txNonce += 1;
        this.persist();
        this.openPanel('shop');
      }),
    );
    box.querySelector('[data-mats]')?.addEventListener('click', () => {
      this.flash(this.world.sellMats(1, box.querySelector<HTMLButtonElement>('[data-mats]')?.dataset.tx));
      audio.tone({ type: 'sine', freq: 660, dur: 0.08, gain: 0.1 });
      this.txNonce += 1;
      this.persist();
      this.openPanel('shop');
    });
    box.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) =>
      b.addEventListener('click', () => {
        this.flash(this.world.sellAt(Number(b.dataset.sell), `sell-${this.txNonce}-${b.dataset.sell}`));
        this.txNonce += 1;
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
        const id = b.dataset.tx;
        if (k === 'dep-all') this.flash(this.world.deposit(s.coins, id));
        else if (k === 'dep-10') this.flash(this.world.deposit(10, id));
        else if (k === 'wd-all') this.flash(this.world.withdraw(s.bank, id));
        else this.flash(this.world.withdraw(10, id));
        this.txNonce += 1;
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
    box.querySelector('[data-resume]')?.addEventListener('click', () => {
      this.paused = false;
      this.rebinding = false;
      this.closePanel();
    });
    box.querySelector('[data-exit]')?.addEventListener('click', () => this.onExit());
    box.querySelector('[data-bind]')?.addEventListener('click', () => {
      this.rebinding = true;
      this.openPause();
    });
    const quality = box.querySelector('#mundo-quality') as HTMLSelectElement | null;
    if (quality) quality.value = this.settings.quality;
    const applyAudio = () => {
      const master = box.querySelector('#vol-master') as HTMLInputElement | null;
      const music = box.querySelector('#vol-music') as HTMLInputElement | null;
      const sfx = box.querySelector('#vol-sfx') as HTMLInputElement | null;
      if (master) this.settings.master = Number(master.value);
      if (music) this.settings.music = Number(music.value);
      if (sfx) this.settings.sfx = Number(sfx.value);
      audio.vol.master = this.settings.master / 100;
      audio.vol.music = this.settings.music / 100;
      audio.vol.sfx = this.settings.sfx / 100;
      audio.applyVolumes();
      saveSettings(this.settings);
    };
    box.querySelector('#vol-master')?.addEventListener('input', applyAudio);
    box.querySelector('#vol-music')?.addEventListener('input', applyAudio);
    box.querySelector('#vol-sfx')?.addEventListener('input', applyAudio);
    quality?.addEventListener('change', () => {
      this.settings.quality = quality.value as Settings['quality'];
      this.applyGraphics();
    });
    box.querySelector('#mundo-reduced')?.addEventListener('change', (e) => {
      this.settings.reduced = (e.target as HTMLInputElement).checked;
      this.applyGraphics();
    });
  }

  private bagHtml(bag: MundoGear[], sell: boolean) {
    if (!bag.length) return '<p>Bolsa vazia.</p>';
    return bag
      .map((g, i) => {
        const c = RARITY_COLOR[g.rarity];
        const sold = sell ? ` <button type="button" class="btn small ghost" data-sell="${i}">Vender</button>` : '';
        return `<p><b style="color:${c}">${g.name}</b> <button type="button" class="btn small" data-eq="${i}">Equipar</button>${sold}</p>`;
      })
      .join('');
  }

  private priceState(cost: number, name: string, extra: string): { text: string; off: boolean } {
    if (extra) return { text: extra, off: true };
    const coins = this.world.save.coins;
    if (coins < cost) return { text: `MOEDAS INSUFICIENTES · faltam ${cost - coins}`, off: true };
    return { text: `COMPRAR · ${name}`, off: false };
  }

  private onEscape() {
    if (this.panel === 'pause') {
      this.paused = false;
      this.rebinding = false;
      this.closePanel();
      return;
    }
    if (this.panel !== 'none') {
      this.closePanel();
      return;
    }
    this.paused = true;
    this.openPause();
  }

  private openPause() {
    this.paused = true;
    this.openPanel('pause');
  }

  private toggleBag() {
    if (this.panel === 'pause') return;
    if (this.panel === 'bag') this.closePanel();
    else this.openPanel('bag');
  }

  private tune() {
    const wild = this.world.regionId === 'floresta' || this.world.regionId === 'ruinas';
    audio.playMusic(wild ? 'game' : 'menu');
  }

  private applyGraphics() {
    this.lite = this.settings.quality === 'baixa' || this.settings.reduced || window.matchMedia('(max-width: 800px), (prefers-reduced-motion: reduce)').matches;
    this.floors.clear();
    saveSettings(this.settings);
  }

  private buildBar() {
    const c = getCharacter(this.world.save.charId);
    const weapon = WEAPONS[primaryOf(c.id)];
    const slots: { id: string; key: string; name: string; hint: string; cost: string }[] = [
      { id: 'basic', key: 'M1', name: weapon.name, hint: 'Ataque básico.', cost: '' },
      { id: 'sig', key: 'Q', name: c.ability.name, hint: c.ability.desc, cost: '' },
      ...POWERS.map((p) => ({ id: p.id, key: p.key, name: p.name, hint: p.hint, cost: String(p.cost) })),
      { id: 'dodge', key: 'Shift', name: 'Esquiva', hint: 'Fica invulnerável por um instante.', cost: String(DODGE_COST) },
    ];
    const bar = this.root.querySelector('#mundo-bar');
    if (!bar) return;
    bar.innerHTML = slots
      .map(
        (s) => `<button type="button" class="slot ico-${s.id}" data-slot="${s.id}" data-cast="${s.id}">
          <span class="key">${s.key}</span>
          ${s.cost ? `<span class="cost">${s.cost}</span>` : ''}
          <span class="mask"></span>
          <span class="num"></span>
          <span class="tip"><b>${s.name}</b> ${s.hint}${s.cost ? ` Custa ${s.cost} de energia.` : ''}</span>
        </button>`,
      )
      .join('');
    bar.querySelectorAll<HTMLButtonElement>('[data-cast]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.panel !== 'none' || this.paused) return;
        const id = btn.dataset.cast;
        if (id === 'basic') this.basicPulse = true;
        else if (id === 'sig') this.abilityPulse = true;
        else if (id === 'dodge') this.dodgePulse = true;
        else this.powerPulse = id as PowerId;
      });
    });
  }

  private paintFace() {
    const face = this.root.querySelector('#mundo-face') as HTMLCanvasElement | null;
    const g = face?.getContext('2d');
    if (!face || !g) return;
    const p = this.world.player;
    const c = getCharacter(this.world.save.charId);
    const faceDir = facingOf(p.aim);
    const frame = Math.floor(p.phase * 1.4) % WALK_FRAMES;
    const img = this.sprites.get(c, faceDir.facing, frame, false, null, 'neutral', 'normal');
    g.clearRect(0, 0, face.width, face.height);
    g.fillStyle = '#1a1430';
    g.fillRect(0, 0, face.width, face.height);
    g.drawImage(img, 6, 2, 60, 68);
  }

  private paintGear() {
    const box = this.root.querySelector('#mundo-gear');
    if (!box) return;
    const labels: Record<MundoSlot, string> = { weapon: 'Arma', armor: 'Armadura', relic: 'Relíquia' };
    box.innerHTML = (['weapon', 'armor', 'relic'] as const)
      .map((slot) => {
        const g = this.world.save[slot];
        const title = g ? `${g.name} · ${g.rarity} · poder ${g.power}` : `${labels[slot]} vazia`;
        return `<button type="button" class="gear" data-open-bag title="${title}">${g ? g.name : labels[slot]}</button>`;
      })
      .join('');
  }

  private paintBar() {
    const w = this.world;
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((btn) => {
      const id = btn.dataset.slot ?? '';
      let cd = 0;
      let max = 0;
      let cost = 0;
      if (id === 'basic') {
        cd = w.weaponCd;
        max = w.weaponCdMax;
      } else if (id === 'sig') {
        cd = w.abilityCd;
        max = w.abilityCdMax;
      } else if (id === 'dodge') {
        cd = w.dodgeCd;
        max = w.dodgeCd > 0 ? DODGE_CD : 0;
        cost = DODGE_COST;
      } else if (id === 'shot' || id === 'dash' || id === 'shield' || id === 'blast' || id === 'trap') {
        cd = w.powerCd[id];
        max = w.powerMax[id];
        cost = POWERS.find((p) => p.id === id)?.cost ?? 0;
      }
      const mask = btn.querySelector('.mask') as HTMLElement | null;
      const num = btn.querySelector('.num') as HTMLElement | null;
      const k = max > 0.05 ? Math.max(0, Math.min(1, cd / max)) : 0;
      if (mask) mask.style.height = `${k * 100}%`;
      if (num) num.textContent = cd > 0.05 ? cd.toFixed(1) : '';
      btn.classList.toggle('poor', cost > 0 && w.energy < cost && cd <= 0);
    });
  }

  private paintQuest() {
    const toggle = this.root.querySelector('#mundo-quest-toggle');
    const body = this.root.querySelector('#mundo-quest-body') as HTMLElement | null;
    if (toggle) toggle.textContent = `${this.questOpen ? '▾' : '▸'} ${QUEST_NAME}`;
    if (!body) return;
    body.hidden = !this.questOpen;
    body.textContent = questBlurb(this.world.save.quest.step);
  }

  private paintPrompt() {
    const btn = this.root.querySelector('#mundo-prompt') as HTMLButtonElement | null;
    const aside = this.root.querySelector('#mundo-context') as HTMLElement | null;
    if (!btn || !aside) return;
    const text = this.promptText();
    const card = this.contextCard();
    const quiet = this.panel !== 'none' || this.paused;
    btn.hidden = quiet || !text;
    btn.textContent = text ?? '';
    aside.hidden = quiet || !card;
    aside.innerHTML = card;
  }

  private promptText(): string | null {
    const key = keyLabel(this.bind);
    const near = this.world.near();
    if (near === 'shop') return `${key} — Abrir loja`;
    if (near === 'bank') return `${key} — Acessar banco`;
    if (near === 'tomb') return `${key} — Abrir tumba`;
    if (near === 'chest') return this.world.save.marks.ruinChest ? `${key} — Baú vazio` : `${key} — Abrir baú`;
    const npc = this.nearestNpc();
    if (npc) return `${key} — Falar com ${npc.name}`;
    if (this.world.save.points > 0) return `${key} — Gastar ponto`;
    return null;
  }

  private contextCard(): string {
    const player = this.world.player;
    const spots = [this.world.region.portal, ...(this.world.region.gates ?? [])];
    for (const gate of spots) {
      const dist = Math.hypot(player.x - gate.x, player.y - gate.y);
      if (dist >= INTERACT_R || dist <= PORTAL_R) continue;
      const card = portalCard(gate.to, this.world.save.quest.step, this.world.save.marks.boss, gate.need);
      const foes = card.enemies.length ? card.enemies.join(', ') : 'nenhum';
      return `<b>${card.name}</b><p>Nível recomendado ${card.level}</p><p>Inimigos: ${foes}</p><p>Recursos: ${card.resources}</p><p>Chefe: ${card.boss}</p>${card.lock ? `<p>${card.lock}</p>` : ''}`;
    }
    const near = this.world.near();
    const s = this.world.save;
    if (near === 'shop') return `<b>Balcão da Nara</b><p>Saldo: ${s.coins} moedas</p><p>Poção ${POTION_COST} · equipamento ${GEAR_COST}</p>`;
    if (near === 'bank') return `<b>Banco</b><p>Bolsa ${s.coins} · guardado ${s.bank}</p><p>${s.ledger.length} movimentos no extrato</p>`;
    if (near === 'chest') return `<b>Baú das Ruínas</b><p>${s.marks.ruinChest ? 'Já aberto.' : '40 moedas e experiência, uma vez.'}</p>`;
    const npc = this.nearestNpc();
    if (npc) return `<b>${npc.name}</b><p>${npc.role}</p>`;
    return '';
  }

  private closePanel() {
    this.panel = 'none';
    this.talk = null;
    const box = this.root.querySelector('#mundo-panel') as HTMLElement | null;
    if (box) box.hidden = true;
  }

  private flash(msg: string) {
    if (msg) this.pushNote(msg);
  }

  private pushNote(text: string) {
    if (!text) return;
    const last = this.notes[this.notes.length - 1];
    if (last && last.text === text) {
      last.life = 2.6;
      return;
    }
    this.notes.push({ text, life: 2.6 });
    if (this.notes.length > 3) this.notes.shift();
  }

  private decayNotes(dt: number) {
    this.notes = this.notes.filter((n) => (n.life -= dt) > 0);
  }

  private paintHud() {
    const w = this.world;
    const s = w.save;
    const hp = this.root.querySelector('#mundo-hp') as HTMLElement | null;
    const en = this.root.querySelector('#mundo-en') as HTMLElement | null;
    const xp = this.root.querySelector('#mundo-xp') as HTMLElement | null;
    const name = this.root.querySelector('#mundo-name');
    const lv = this.root.querySelector('#mundo-lv');
    const region = this.root.querySelector('#mundo-region');
    if (hp) hp.style.width = `${Math.max(0, w.player.hp / w.player.maxHp) * 100}%`;
    if (en) en.style.width = `${Math.max(0, w.energy / w.energyMax) * 100}%`;
    const goal = Math.max(1, xpForLevel(s.level));
    if (xp) xp.style.width = s.level >= 30 ? '100%' : `${Math.min(100, (s.xp / goal) * 100)}%`;
    if (name) name.textContent = w.player.name;
    if (lv) lv.textContent = s.level >= 30 ? `nível ${s.level}` : `nível ${s.level} · ${s.xp}/${goal} xp`;
    if (region) region.textContent = w.region.name;
    this.paintFace();
    this.paintGear();
    this.paintBar();
    this.paintQuest();
    this.paintPrompt();
    const notes = this.root.querySelector('#mundo-notes');
    if (notes) notes.innerHTML = this.notes.map((n) => `<p>${n.text}</p>`).join('');
  }

  private pointerDown(e: PointerEvent) {
    if (this.panel !== 'none' || this.paused) return;
    if ((e.target as HTMLElement | null)?.closest?.('#mundo-ui button, #mundo-panel, .mundo-dock, .mundo-quest, .mundo-map')) return;
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
    ctx.fillStyle = reg.id === 'vila' ? '#1a2214' : reg.id === 'ruinas' ? '#16141f' : '#0e160f';
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
    const chest = this.world.region.chest;
    if (chest) layers.push({ y: chest.y, draw: () => this.drawChest(ctx, chest.x, chest.y) });
    layers.push({ y: this.world.player.y, draw: () => this.drawPlayer(ctx) });
    layers.sort((a, b) => a.y - b.y);
    for (const layer of layers) layer.draw();
    this.drawAimMarks(ctx);
    for (const sh of this.world.shots) {
      ctx.fillStyle = sh.color ?? (sh.team === 0 ? '#9ef0ff' : '#ffb347');
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.lite) this.drawBits(ctx);
    this.drawFloats(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawMap();
    if (!this.lite) {
      const g = ctx.createRadialGradient(cssW * 0.5, cssH * 0.45, cssH * 0.2, cssW * 0.5, cssH * 0.5, cssH * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, reg.id === 'floresta' ? 'rgba(6,18,12,0.5)' : 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  private drawAimMarks(ctx: CanvasRenderingContext2D) {
    const mark = this.outlineAt();
    if (mark) {
      ctx.strokeStyle = '#e9fff4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y - 8, mark.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const wind = this.world.windup;
    const p = this.world.player;
    if (wind) {
      ctx.strokeStyle = wind.id === 'blast' ? 'rgba(255,210,80,0.9)' : 'rgba(62,232,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (wind.id === 'blast') ctx.arc(p.x, p.y, 100, 0, Math.PI * 2);
      else {
        const reach = wind.id === 'dash' ? 150 : 70;
        ctx.moveTo(p.x, p.y - 20);
        ctx.lineTo(p.x + Math.cos(wind.aim) * reach, p.y - 20 + Math.sin(wind.aim) * reach);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#d6ff4a';
    for (const trap of this.world.traps) {
      ctx.beginPath();
      ctx.arc(trap.x, trap.y, trap.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private outlineAt(): { x: number; y: number; r: number } | null {
    const region = this.world.region;
    const near = this.world.near();
    if (near === 'shop' && region.shop) return { x: region.shop.x, y: region.shop.y, r: 30 };
    if (near === 'bank' && region.bank) return { x: region.bank.x, y: region.bank.y, r: 30 };
    if (near === 'chest' && region.chest) return { x: region.chest.x, y: region.chest.y, r: 24 };
    const tomb = this.world.save.tomb;
    if (near === 'tomb' && tomb) return { x: tomb.x, y: tomb.y, r: 22 };
    const npc = this.nearestNpc();
    if (npc) return { x: npc.x, y: npc.y, r: 26 };
    const player = this.world.player;
    for (const gate of [region.portal, ...(region.gates ?? [])]) {
      const dist = Math.hypot(player.x - gate.x, player.y - gate.y);
      if (dist < INTERACT_R && dist > PORTAL_R) return { x: gate.x, y: gate.y, r: 46 };
    }
    return null;
  }

  private drawChest(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const open = this.world.save.marks.ruinChest;
    ctx.fillStyle = open ? '#5c5348' : '#c9a15b';
    ctx.fillRect(x - 14, y - 18, 28, 18);
    ctx.fillStyle = open ? '#3a342c' : '#8a6230';
    ctx.fillRect(x - 16, y - 22, 32, 6);
    ctx.fillStyle = '#e9fff4';
    ctx.font = '700 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'VAZIO' : 'BAÚ', x, y - 28);
  }

  private drawFloats(ctx: CanvasRenderingContext2D) {
    ctx.font = '700 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.world.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.75));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - (0.75 - f.life) * 18);
    }
    ctx.globalAlpha = 1;
  }

  private drawMap() {
    const map = this.root.querySelector('#mundo-map') as HTMLCanvasElement | null;
    const g = map?.getContext('2d');
    if (!map || !g) return;
    const reg = this.world.region;
    g.clearRect(0, 0, map.width, map.height);
    g.fillStyle = 'rgba(12,10,22,0.82)';
    g.fillRect(0, 0, map.width, map.height);
    const s = Math.min((map.width - 8) / reg.w, (map.height - 8) / reg.h);
    const ox = 4;
    const oy = 4;
    g.fillStyle = 'rgba(190,170,120,0.35)';
    for (const path of PATHS[reg.id]) g.fillRect(ox + path.x * s, oy + path.y * s, Math.max(1, path.w * s), Math.max(1, path.h * s));
    for (const npc of NPCS) {
      if (npc.region !== reg.id) continue;
      g.fillStyle = npc.color;
      g.fillRect(ox + npc.x * s - 1.5, oy + npc.y * s - 1.5, 3, 3);
    }
    for (const gate of [reg.portal, ...(reg.gates ?? [])]) {
      const locked = (gate.need === 'ruidos' && this.world.save.quest.step < 4) || (gate.need === 'boss' && !this.world.save.marks.boss);
      g.fillStyle = locked ? '#ffb347' : '#8dffc4';
      g.beginPath();
      g.arc(ox + gate.x * s, oy + gate.y * s, 3, 0, Math.PI * 2);
      g.fill();
    }
    if (reg.id === 'floresta' && this.world.save.quest.step === 2) {
      g.fillStyle = '#3ee8ff';
      g.fillRect(ox + ANOMALY.x * s - 2, oy + ANOMALY.y * s - 2, 4, 4);
    }
    const player = this.world.player;
    for (const m of this.world.monsters) {
      if (m.dead >= 0) continue;
      const dist = Math.hypot(m.x - player.x, m.y - player.y);
      const show = (m.kind === 'boss' && this.world.seenBoss) || m.alert > 0 || dist < 220;
      if (!show) continue;
      g.fillStyle = m.kind === 'boss' ? '#ff8a1e' : '#ff5a4a';
      g.fillRect(ox + m.x * s - 1.5, oy + m.y * s - 1.5, 3, 3);
    }
    g.fillStyle = '#3ee8ff';
    g.beginPath();
    g.arc(ox + player.x * s, oy + player.y * s, 3, 0, Math.PI * 2);
    g.fill();
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
    g.fillStyle = id === 'vila' ? '#314228' : id === 'ruinas' ? '#2a2638' : '#1c3320';
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

  private drawPortal(ctx: CanvasRenderingContext2D, p: { x: number; y: number; label: string; need?: 'ruidos' | 'boss' }) {
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
    ctx.rotate(this.world.clock / 420);
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 1.15);
    ctx.stroke();
    ctx.fillStyle = '#e9fff4';
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    const locked = (p.need === 'ruidos' && this.world.save.quest.step < 4) || (p.need === 'boss' && !this.world.save.marks.boss);
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
    } else if (m.kind === 'wolf') {
      ctx.fillStyle = '#d8fbff';
      ctx.beginPath();
      ctx.moveTo(-10, -m.r);
      ctx.lineTo(-16, -m.r - 14);
      ctx.lineTo(-2, -m.r + 2);
      ctx.moveTo(10, -m.r);
      ctx.lineTo(16, -m.r - 14);
      ctx.lineTo(2, -m.r + 2);
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
    if (m.dead < 0 && m.kind === 'boss' && bossPhase(m.patternT) === 'slam') {
      ctx.strokeStyle = m.hp < m.maxHp * 0.5 ? 'rgba(255,70,40,0.75)' : 'rgba(255,180,60,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 110, 0, Math.PI * 2);
      ctx.stroke();
    }
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
