// Tela de equipamento: arma principal, item e poderes, com desenho de cada peça.
// No topo ficam os 4 espaços do seu equipamento; embaixo, um carrossel (deslizar para o lado, igual aos
// personagens e mapas) com as opções do espaço escolhido, e a ficha completa do item no centro.
import { KITS, KitId, Loadout, PRIMARY_PRICE, ROLE_COLOR, ROLE_LABEL, SKILLS, STANDARD_PRIMARIES, SkillId, ULTS, UltId, gearPrice, sanitizeLoadout } from '../game/balance';
import { CATEGORY_LABEL, WEAPONS, WeaponDef, WeaponId, primaryOf, weaponDps } from '../game/weapons';
import { getCharacter } from '../game/characters';
import { ELEMENT_COLOR, ELEMENT_FX, ELEMENT_NAME, SLOT_COST, STUDIO, StudioDef, describePower, kitOf, studioOf, type PowerDef } from '../game/elements';
import { drawGear, GearKind } from './gearArt';
import { Carousel, fitText } from './carousel';

type Tab = GearKind;
const TABS: { id: Tab; name: string; hint: string }[] = [
  { id: 'primary', name: 'Arma', hint: 'Escolha a arma principal' },
  { id: 'kit', name: 'Item', hint: 'Escolha o item da rodada' },
  { id: 'skill', name: 'Habilidade', hint: 'Escolha a habilidade extra' },
  { id: 'ult', name: 'Ultimate', hint: 'Escolha a ultimate' },
];

export interface LoadoutDeps {
  owns: (key: string) => boolean;
  coins: () => number;
  buy: (key: string) => Promise<string | null>;
  toast: (s: string) => void;
  click: () => void;
  keyOf: (slot: 'ability' | 'skill' | 'ult' | 'bonus' | 'item' | 'plasma' | 'dash') => string;
}

const AIM_LABEL = { instant: 'Uso na hora', direction: 'Mira em direção', point: 'Mira em um ponto' } as const;

interface Opt {
  id: string;
  name: string;
  role: string;
  color: string;
  price: number;
  owned: boolean;
  sub: string;
  group?: string;
}

function bar(label: string, v: number, max: number, cmp?: number) {
  const f = Math.max(0, Math.min(1, v / max));
  const c = cmp === undefined ? null : Math.max(0, Math.min(1, cmp / max));
  const diff = c === null ? '' : f > c + 0.02 ? '<em class="up">▲</em>' : f < c - 0.02 ? '<em class="dn">▼</em>' : '';
  return `<div class="lo-bar"><span>${label}</span><i><b style="width:${Math.round(f * 100)}%"></b>${c !== null ? `<u style="left:${Math.round(c * 100)}%"></u>` : ''}</i>${diff}</div>`;
}

const acc = (x: WeaponDef) => Math.max(0.1, 1 - x.spread * 1.6 - (x.pellets > 1 ? 0.15 : 0));
const perHit = (x: WeaponDef) => x.damage * x.pellets + (x.blast?.dmg ?? 0);

function weaponTraits(w: WeaponDef): string[] {
  const t: string[] = [];
  if (w.pellets > 1) t.push(`${w.pellets} projéteis em leque`);
  if (w.pierce) t.push('Atravessa alvos');
  if (w.slow) t.push(`Deixa lento (${w.slow}s)`);
  if (w.heal) t.push(`Cura ${Math.round(w.heal * 100)}% do dano`);
  if (w.knock && w.knock >= 140) t.push('Empurra');
  if (w.blast) t.push(`Explode (raio ${w.blast.r})`);
  if (w.range <= 160) t.push('Precisa chegar perto');
  if (w.cooldown >= 0.8) t.push('Lenta: errou, ficou exposto');
  return t;
}

export class LoadoutScreen {
  private tab: Tab = 'primary';
  private l: Loadout;
  /** item em destaque na ficha (pode ser um bloqueado, só para ver) */
  private focus = '';
  private charId = 'kael';
  private onConfirm: (l: Loadout) => void = () => {};
  private car: Carousel | null = null;
  /** de qual espaço é o carrossel montado agora (remonta só ao trocar de espaço) */
  private carTab: Tab | null = null;
  private opts: Opt[] = [];
  /** extra que já estava salvo quando a tela abriu */
  private openedSecondary: string | null = null;
  private focusKind: 'kit' | 'extra' = 'kit';
  private focusIndex = 0;
  private focusExtra = 'plasma';

  constructor(
    private root: HTMLElement,
    private deps: LoadoutDeps,
  ) {
    this.l = sanitizeLoadout(null);
    window.addEventListener('resize', () => {
      if (!this.root.hidden) this.drawAll();
    });
  }

  open(opts: { charId: string; loadout: Loadout; subtitle: string; confirmText: string; onConfirm: (l: Loadout) => void }) {
    this.charId = opts.charId;
    this.l = sanitizeLoadout(opts.loadout, this.deps.owns);
    this.openedSecondary = this.l.secondary ?? null;
    this.focusKind = 'kit';
    this.focusIndex = 0;
    this.onConfirm = opts.onConfirm;
    this.tab = 'primary';
    this.focus = '';
    this.carTab = null;
    this.root.querySelector('.lo-sub')!.textContent = opts.subtitle;
    this.root.querySelectorAll<HTMLElement>('[data-lo-confirm]').forEach((b) => (b.textContent = opts.confirmText));
    const title = this.root.querySelector('h2');
    if (title) title.textContent = 'Poderes';
    this.renderPowers();
  }

  /** X1 e 2x2: kit visual e troca do poder extra entre os liberados. */
  private renderPowers() {
    const kit = kitOf(this.charId);
    const slotOf = ['ability', 'skill', 'ult', 'bonus'] as const;
    const order = [0, 1, 3, 2];
    const plasmaKey = this.deps.keyOf('plasma');
    const slots = this.root.querySelector('.lo-slots')!;
    const kitHtml = order
      .map((i) => this.powerCard(kit.powers[i], this.deps.keyOf(slotOf[i]), SLOT_COST[i], `data-kit="${i}"`, this.focusKind === 'kit' && this.focusIndex === i, i === 0 ? `art/studio/chars/${this.charId}-poder.webp` : ''))
      .join('');
    const current = studioOf(this.l.secondary);
    const opened = studioOf(this.openedSecondary);
    const extraHtml = STUDIO.map((s) => {
      const owned = this.deps.owns('power:' + s.id);
      const on = this.l.secondary === s.id;
      const lock = owned ? '' : ' lock';
      const mark = on ? ' on' : '';
      const focus = this.focusKind === 'extra' && this.focusExtra === s.id ? ' focus' : '';
      return `<button type="button" class="pw-card${mark}${lock}${focus}" draggable="${owned ? 'true' : 'false'}" data-sec="${s.id}" style="--c:${ELEMENT_COLOR[s.element]}">${this.powerFace(s, plasmaKey, s.cost, s.art)}${owned ? '' : `<em class="pw-lock">depois de ${s.unlockMatches} partida${s.unlockMatches === 1 ? '' : 's'}</em>`}</button>`;
    }).join('');
    slots.innerHTML = `<div class="lo-kit">${kitHtml}</div><div class="lo-swap"><div class="pw-now" id="pw-equipped">Extra ${plasmaKey}: <b>${current ? current.name : 'vazio'}</b> <span>na conta: ${opened ? opened.name : 'vazio'}</span></div><div class="lo-powers">${extraHtml}</div></div>`;
    slots.querySelectorAll<HTMLElement>('[data-kit]').forEach((el) => {
      el.addEventListener('click', () => {
        this.deps.click();
        this.focusKind = 'kit';
        this.focusIndex = Number(el.dataset.kit);
        this.renderPowers();
      });
    });
    const equip = (id: string) => {
      this.deps.click();
      this.focusKind = 'extra';
      this.focusExtra = id;
      const row = STUDIO.find((s) => s.id === id);
      if (!row || !this.deps.owns('power:' + id)) {
        this.deps.toast(row && row.unlockMatches > 0 ? `Habilidade ainda não desbloqueada. Depois de ${row.unlockMatches} partida${row.unlockMatches === 1 ? '' : 's'}.` : 'Habilidade ainda não desbloqueada');
        this.renderPowers();
        return;
      }
      this.l = { ...this.l, secondary: this.l.secondary === id ? null : id };
      this.renderPowers();
    };
    slots.querySelectorAll<HTMLButtonElement>('[data-sec]').forEach((el) => {
      el.addEventListener('click', () => equip(el.dataset.sec || ''));
      el.addEventListener('dragstart', (ev) => {
        if (!this.deps.owns('power:' + (el.dataset.sec || ''))) {
          ev.preventDefault();
          return;
        }
        ev.dataTransfer?.setData('text/plain', el.dataset.sec || '');
      });
    });
    const drop = slots.querySelector<HTMLElement>('#pw-equipped');
    drop?.addEventListener('dragover', (ev) => ev.preventDefault());
    drop?.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const id = ev.dataTransfer?.getData('text/plain') || '';
      if (id) equip(id);
    });
    const list = this.root.querySelector<HTMLElement>('.lo-list');
    if (list) list.hidden = true;
    const det = this.root.querySelector('.lo-detail')!;
    det.innerHTML = this.powerDetail(kit.passiveName, kit.passiveDesc, plasmaKey, current, opened);
  }

  private powerCard(pw: PowerDef, key: string, cost: number, attrs: string, focus: boolean, art: string) {
    return `<button type="button" class="pw-card${focus ? ' focus' : ''}" ${attrs} style="--c:${ELEMENT_COLOR[pw.element]}">${this.powerFace(pw, key, cost, art)}</button>`;
  }

  private powerFace(pw: PowerDef, key: string, cost: number, art: string) {
    const kind = pw.act === 'wall' ? 'wall' : pw.act === 'dash' ? 'dash' : pw.act === 'blink' ? 'blink' : pw.act === 'decoy' ? 'decoy' : pw.speed <= 0 ? 'aoe' : 'shot';
    const icon = art
      ? `<img class="pw-ico" alt="" src="/${art}" />`
      : `<svg class="pw-ico" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="${ELEMENT_COLOR[pw.element]}" opacity="0.9"/><text x="32" y="38" text-anchor="middle" font-size="18" fill="#140c22" font-family="sans-serif">${key}</text></svg>`;
    const dmg = Math.round((pw.dmg / 20) * 100);
    const range = Math.round((Math.min(pw.range, 320) / 320) * 100);
    const cd = Math.round((1 - Math.min(pw.cd, 8) / 8) * 100);
    return `${icon}<span class="pw-prev" data-kind="${kind}" aria-hidden="true"><i></i></span><span class="lo-slot-k">${key}</span><b>${pw.name}</b><span class="pw-bars" title="dano, alcance, recarga curta"><i style="width:${dmg}%"></i><i style="width:${range}%"></i><i style="width:${cd}%"></i></span><small>${cost} energia</small>`;
  }

  private powerDetail(passiveName: string, passiveDesc: string, plasmaKey: string, current: StudioDef | null, opened: StudioDef | null) {
    const slotOf = ['ability', 'skill', 'ult', 'bonus'] as const;
    if (this.focusKind === 'extra') {
      const s = STUDIO.find((x) => x.id === this.focusExtra) ?? STUDIO[0];
      const owned = this.deps.owns('power:' + s.id);
      const chosen = current?.name ?? 'vazio';
      const before = opened?.name ?? 'vazio';
      const lock = owned ? '' : ` Bloqueado até jogar ${s.unlockMatches} partida${s.unlockMatches === 1 ? '' : 's'}.`;
      return `<div class="lo-dhead"><span class="lo-state ${this.l.secondary === s.id ? 'on' : ''}">${this.l.secondary === s.id ? 'Equipado' : owned ? 'Toque para equipar' : 'Bloqueado'}</span></div><p class="lo-cmp">Na conta: ${before}. Escolhido agora: ${chosen}.</p><p class="lo-desc">${describePower(s, plasmaKey, s.cost)} ${ELEMENT_FX[s.element]}.${lock} Arraste o card até o extra ou toque nele. Trancado não entra. O servidor confere de novo ao salvar.</p><p class="lo-cmp">${passiveName}: ${passiveDesc}</p>`;
    }
    const pw = kitOf(this.charId).powers[this.focusIndex];
    const key = this.deps.keyOf(slotOf[this.focusIndex] ?? 'ability');
    const cost = SLOT_COST[this.focusIndex] ?? SLOT_COST[0];
    return `<div class="lo-dhead"><span class="lo-state on">${pw.name}</span></div><p class="lo-desc">${describePower(pw, key, cost)} ${ELEMENT_FX[pw.element]}. ${passiveDesc}</p><p class="lo-cmp">O kit do personagem não troca. Só o extra ${plasmaKey} troca, entre os que já liberaram. WASD anda. Q, E, F e R são os poderes. O direito cancela a mira.</p>`;
  }

  get value() {
    return this.l;
  }

  private ownsGear(id: string) {
    const p = gearPrice(id);
    return p === 0 || p === null || this.deps.owns('gear:' + id);
  }
  private weaponOf(id: string): WeaponDef {
    return WEAPONS[id === 'assinatura' ? primaryOf(this.charId) : (id as WeaponId)];
  }
  private keyLabel(t: Tab) {
    return t === 'primary' ? 'clique / ATIRAR' : this.deps.keyOf(t === 'kit' ? 'item' : t);
  }

  private optionsOf(tab: Tab): Opt[] {
    if (tab === 'primary') {
      return ['assinatura', ...STANDARD_PRIMARIES].map((id) => {
        const w = this.weaponOf(id);
        const price = id === 'assinatura' ? 0 : PRIMARY_PRICE[id] ?? 0;
        return { id, name: w.name, role: CATEGORY_LABEL[w.cat ?? 'equilibrada'], color: w.color, price, owned: price === 0 || this.ownsGear(id), sub: `${Math.round(weaponDps(w))} dano/s · alcance ${w.range}`, group: id === 'assinatura' ? `Arma de ${getCharacter(this.charId).name}` : 'Armas padrão' };
      });
    }
    if (tab === 'kit') return (Object.keys(KITS) as KitId[]).map((id) => ({ id, name: KITS[id].name, role: ROLE_LABEL[KITS[id].role], color: ROLE_COLOR[KITS[id].role], price: KITS[id].price, owned: this.ownsGear(id), sub: `${KITS[id].count} por rodada` }));
    if (tab === 'skill') return (Object.keys(SKILLS) as SkillId[]).map((id) => ({ id, name: SKILLS[id].name, role: ROLE_LABEL[SKILLS[id].role], color: ROLE_COLOR[SKILLS[id].role], price: SKILLS[id].price, owned: this.ownsGear(id), sub: `Recarga ${SKILLS[id].cooldown}s · ${AIM_LABEL[SKILLS[id].aim]}` }));
    return (Object.keys(ULTS) as UltId[]).map((id) => ({ id, name: ULTS[id].name, role: ROLE_LABEL[ULTS[id].role], color: ROLE_COLOR[ULTS[id].role], price: ULTS[id].price, owned: this.ownsGear(id), sub: AIM_LABEL[ULTS[id].aim] }));
  }

  private currentOf(tab: Tab): string {
    return tab === 'primary' ? this.l.primary : tab === 'kit' ? this.l.kit : tab === 'skill' ? this.l.skill : this.l.ult;
  }
  private set(id: string) {
    if (this.tab === 'primary') this.l.primary = id;
    else if (this.tab === 'kit') this.l.kit = id as KitId;
    else if (this.tab === 'skill') this.l.skill = id as SkillId;
    else this.l.ult = id as UltId;
  }
  /** id usado no desenho (a arma própria vira a arma do personagem) */
  private artId(tab: Tab, id: string) {
    return tab === 'primary' && id === 'assinatura' ? primaryOf(this.charId) : id;
  }

  // ---------------------------------------------------------------- ficha do item
  private detail(o: Opt): string {
    const id = o.id;
    const equipped = id === this.currentOf(this.tab);
    const status = equipped
      ? '<span class="lo-state on">✓ Equipado</span>'
      : o.owned
        ? '<button class="btn small primary lo-equip">Equipar</button>'
        : `<button class="btn small primary lo-buy"><span class="coin"></span>Liberar por ${o.price}</button>`;
    let body = '';
    if (this.tab === 'primary') {
      const w = this.weaponOf(id);
      const cur = this.weaponOf(this.l.primary);
      const cmp = cur !== w ? cur : undefined;
      body = `<div class="lo-bars">${[
        bar('Dano por disparo', perHit(w), 60, cmp && perHit(cmp)),
        bar('Dano por segundo', weaponDps(w), 60, cmp && weaponDps(cmp)),
        bar('Alcance', w.range, 500, cmp?.range),
        bar('Cadência', 1 / w.cooldown, 10, cmp && 1 / cmp.cooldown),
        bar('Precisão', acc(w), 1, cmp && acc(cmp)),
      ].join('')}</div>
      <p class="lo-desc">${weaponTraits(w).join(' · ') || 'Sem efeito extra: confiável em média distância.'}</p>
      ${cmp ? `<p class="lo-cmp">▲▼ e a marquinha branca comparam com a ${cmp.name} (equipada).</p>` : ''}`;
    } else if (this.tab === 'kit') {
      const k = KITS[id as KitId];
      body = `<div class="lo-facts"><span>Usa com <b>${this.keyLabel('kit')}</b></span><span><b>${k.count}</b> por rodada</span></div><p class="lo-desc">${k.desc}</p><p class="lo-cmp">Itens não recarregam ao renascer.</p>`;
    } else if (this.tab === 'skill') {
      const s = SKILLS[id as SkillId];
      const facts = [`Tecla <b>${this.keyLabel('skill')}</b>`, `Recarga <b>${s.cooldown}s</b>`, s.range ? `Alcance <b>${s.range}</b>` : '', s.duration ? `Dura <b>${s.duration}s</b>` : '', s.damage ? `${s.role === 'suporte' ? 'Cura' : 'Dano'} <b>${s.damage}</b>` : ''];
      body = `<div class="lo-facts">${facts.filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</div><p class="lo-desc">${s.desc}</p>${s.aim !== 'instant' ? '<p class="lo-cmp">Segure para ver a prévia e solte para usar. Esc ou botão direito cancela.</p>' : ''}`;
    } else {
      const u = ULTS[id as UltId];
      const facts = [`Tecla <b>${this.keyLabel('ult')}</b>`, u.damage ? `Dano <b>${u.damage}</b>` : '', u.radius ? `Raio <b>${u.radius}</b>` : '', u.range ? `Alcance <b>${u.range}</b>` : '', u.windup ? `Aviso <b>${u.windup}s</b>` : '', u.duration ? `Dura <b>${u.duration}s</b>` : ''];
      body = `<div class="lo-facts">${facts.filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</div><p class="lo-desc">${u.desc}</p><p class="lo-cmp">Carrega com o tempo, causando e levando dano. Os rivais veem o aviso antes do golpe.</p>`;
    }
    // o card do meio já mostra desenho e nome: aqui ficam só o estado e os números
    return `<div class="lo-dhead" style="--c:${o.color}">${status}<span class="lo-dtag">${o.role}</span></div>
      ${body}`;
  }

  // ---------------------------------------------------------------- montagem
  /** seta do teclado: passa para o item ao lado */
  go(d: number) {
    this.car?.go(d);
  }

  private render() {
    this.renderSlots();
    if (this.carTab !== this.tab) this.buildCarousel();
    this.renderDetail();
    requestAnimationFrame(() => this.drawAll());
  }

  /** 1) os 4 espaços do equipamento (com desenho do que está equipado) */
  private renderSlots() {
    const slots = this.root.querySelector('.lo-slots')!;
    slots.innerHTML = TABS.map((t) => {
      const cur = this.optionsOf(t.id).find((o) => o.id === this.currentOf(t.id))!;
      return `<button class="lo-slot${t.id === this.tab ? ' on' : ''}" role="tab" aria-selected="${t.id === this.tab}" data-lo-tab="${t.id}" style="--c:${cur.color}">
        <span class="lo-slot-k">${t.name} <small>${this.keyLabel(t.id)}</small></span>
        <canvas data-art="${t.id}:${this.artId(t.id, cur.id)}:${cur.color}:1"></canvas>
        <b>${cur.name}</b>
      </button>`;
    }).join('');
    slots.querySelectorAll<HTMLElement>('[data-lo-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.loTab === this.tab) return;
        this.deps.click();
        this.tab = b.dataset.loTab as Tab;
        this.focus = '';
        this.render();
      }),
    );
  }

  /** 2) carrossel com as opções do espaço escolhido: o item do meio fica em foco (e equipa se for liberado) */
  private buildCarousel() {
    this.carTab = this.tab;
    this.opts = this.optionsOf(this.tab);
    const cur = this.currentOf(this.tab);
    if (!this.focus) this.focus = cur;
    const box = this.root.querySelector<HTMLElement>('.lo-car')!;
    // remonta do zero (tira os eventos do carrossel anterior)
    box.innerHTML = `<button class="car-arrow left" aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" /></svg></button>
      <div class="car-track"></div>
      <button class="car-arrow right" aria-label="Próximo"><svg viewBox="0 0 24 24"><path d="m9 4 8 8-8 8" /></svg></button>`;
    this.car = new Carousel(box, this.opts.length, (i) => {
      const o = this.opts[i];
      const el = document.createElement('button');
      el.className = 'lo-card';
      el.dataset.loOpt = o.id;
      el.style.setProperty('--c', o.color);
      el.innerHTML = `<canvas class="lo-cart" data-art="${this.tab}:${this.artId(this.tab, o.id)}:${o.color}:${o.owned ? 1 : 0}"></canvas>
        <span class="lo-badge"></span>
        <span class="car-label">${o.group ? `<small class="lo-grp">${o.group}</small>` : ''}<b>${o.name}</b><span class="lo-chip">${o.role}</span><small class="lo-sub2">${o.owned ? o.sub : `<span class="coin"></span>${o.price} moedas`}</small></span>`;
      return el;
    });
    this.car.aspect = 0.82;
    this.car.onResize = () => this.drawAll();
    this.car.onChange = (i) => {
      const o = this.opts[i];
      this.deps.click();
      this.focus = o.id;
      // liberado: equipa na hora; bloqueado: só mostra a ficha com o botão de liberar
      if (o.owned) this.set(o.id);
      this.renderSlots();
      this.renderDetail();
      requestAnimationFrame(() => this.drawAll());
    };
    const start = Math.max(0, this.opts.findIndex((o) => o.id === this.focus));
    this.car.set(start, true);
  }

  /** 3) ficha completa do item em foco + marcas (equipado / bloqueado) nos cards + contador */
  private renderDetail() {
    // a lista pode ter mudado (compra): atualiza "liberado" sem remontar o carrossel
    this.opts = this.optionsOf(this.tab);
    const cur = this.currentOf(this.tab);
    const opts = this.opts;
    const focused = opts.find((o) => o.id === this.focus) ?? opts[0];
    const tabInfo = TABS.find((t) => t.id === this.tab)!;
    const idx = opts.indexOf(focused) + 1;
    this.root.querySelector('.lo-list-title')!.innerHTML = `<b>${tabInfo.hint}</b><span>${idx} de ${opts.length} · ${opts.filter((o) => o.owned).length} liberadas · deslize para o lado</span>`;
    this.root.querySelectorAll<HTMLElement>('.lo-card').forEach((el) => {
      const o = opts.find((x) => x.id === el.dataset.loOpt);
      if (!o) return;
      const badge = el.querySelector('.lo-badge')!;
      el.classList.toggle('equipped', o.id === cur);
      el.classList.toggle('locked', !o.owned);
      badge.className = 'lo-badge' + (o.id === cur ? '' : !o.owned ? ' lock' : ' none');
      badge.textContent = o.id === cur ? '✓' : !o.owned ? '🔒' : '';
      const sub = el.querySelector('.lo-sub2')!;
      sub.innerHTML = o.owned ? o.sub : `<span class="coin"></span>${o.price} moedas`;
      const cv = el.querySelector<HTMLCanvasElement>('canvas')!;
      cv.dataset.art = `${this.tab}:${this.artId(this.tab, o.id)}:${o.color}:${o.owned ? 1 : 0}`;
    });
    const det = this.root.querySelector('.lo-detail')!;
    det.innerHTML = this.detail(focused);
    det.querySelector('.lo-equip')?.addEventListener('click', () => {
      this.deps.click();
      this.set(focused.id);
      this.render();
    });
    det.querySelector('.lo-buy')?.addEventListener('click', async () => {
      if (this.deps.coins() < focused.price) return this.deps.toast(`Faltam ${focused.price - this.deps.coins()} moedas para liberar ${focused.name}.`);
      const err = await this.deps.buy('gear:' + focused.id);
      if (err) return this.deps.toast(err);
      this.deps.toast(`${focused.name} liberado e equipado!`);
      this.set(focused.id);
      this.render();
    });
  }

  private drawAll() {
    fitText(this.root.querySelector<HTMLElement>('.lo-card.center .car-label b'));
    this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-art]').forEach((cv) => {
      const [kind, id, color, owned] = cv.dataset.art!.split(':');
      drawGear(cv, kind as GearKind, id, color, { locked: owned === '0' });
    });
  }

  confirm() {
    this.onConfirm(sanitizeLoadout(this.l, this.deps.owns));
  }
}
