// Tela de equipamento: arma principal, item e poderes, com desenho de cada peça.
// No topo ficam os 4 espaços do seu equipamento; embaixo, um carrossel (deslizar para o lado, igual aos
// personagens e mapas) com as opções do espaço escolhido, e a ficha completa do item no centro.
import { KITS, KitId, Loadout, PRIMARY_PRICE, ROLE_COLOR, ROLE_LABEL, SKILLS, STANDARD_PRIMARIES, SkillId, ULTS, UltId, gearPrice, sanitizeLoadout, stageSecondary } from '../game/balance';
import { CATEGORY_LABEL, WEAPONS, WeaponDef, WeaponId, primaryOf, weaponDps } from '../game/weapons';
import { getCharacter } from '../game/characters';
import { ELEMENT_COLOR, ELEMENT_NAME, SLOT_COST, STUDIO, StudioDef, kitOf, studioOf, type PowerCategory, type PowerDef } from '../game/elements';
import { kitSynergies, powerSheet } from '../game/combos';
import { drawGear, GearKind } from './gearArt';
import { Carousel, fitText } from './carousel';

type Tab = GearKind;
type PowerFilter = 'all' | PowerCategory | 'area';
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
  train?: (charId: string, loadout: Loadout, line: string) => void;
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
  private filter: PowerFilter = 'all';

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

  /** X1 e 2x2: kit fixo, biblioteca do Z e ficha com os números do combate. */
  private renderPowers() {
    const kit = kitOf(this.charId);
    const synergies = kitSynergies(this.charId);
    const slotOf = ['ability', 'skill', 'ult', 'bonus'] as const;
    const order = [0, 1, 3, 2];
    const plasmaKey = this.deps.keyOf('plasma');
    const slots = this.root.querySelector('.lo-slots')!;
    const current = studioOf(this.l.secondary);
    const kitHtml = order
      .map((i) => {
        const badge = synergies.some((s) => s.inKit && s.slots.includes(i));
        const ult = i === 2 ? ' ult' : '';
        const on = this.focusKind === 'kit' && this.focusIndex === i ? ' focus' : '';
        return `<button type="button" class="pw-card${ult}${on}" data-kit="${i}">${this.powerFace(kit.powers[i], this.deps.keyOf(slotOf[i]), i, badge, i === 0 ? `art/studio/chars/${this.charId}-poder.webp` : '')}</button>`;
      })
      .join('');
    const zOn = this.focusKind === 'extra' && this.focusExtra === (current?.id ?? '') ? ' focus' : '';
    const zFace = current
      ? this.powerFace(current, plasmaKey, -1, false, current.art)
      : `<span class="pw-ico pw-letter">${plasmaKey}</span><b>Vazio</b><small>extra</small>`;
    slots.innerHTML = `<div class="pw-equip">${kitHtml}<button type="button" class="pw-card z${zOn}" data-slot="z">${zFace}</button></div>`;
    slots.querySelectorAll<HTMLElement>('[data-kit]').forEach((el) => {
      el.addEventListener('click', () => {
        this.deps.click();
        this.focusKind = 'kit';
        this.focusIndex = Number(el.dataset.kit);
        this.renderPowers();
      });
    });
    slots.querySelector('[data-slot="z"]')?.addEventListener('click', () => {
      this.deps.click();
      this.focusKind = 'extra';
      this.focusExtra = current?.id ?? this.focusExtra;
      this.renderPowers();
    });
    const filters: { id: PowerFilter; name: string }[] = [
      { id: 'all', name: 'Todos' },
      { id: 'attack', name: 'Dano' },
      { id: 'control', name: 'Controle' },
      { id: 'mobility', name: 'Mobilidade' },
      { id: 'defense', name: 'Defesa' },
      { id: 'support', name: 'Suporte' },
      { id: 'area', name: 'Área' },
    ];
    const rows = STUDIO.filter((s) => this.passes(s));
    const cards = rows
      .map((s) => {
        const owned = this.deps.owns('power:' + s.id);
        const on = this.l.secondary === s.id ? ' on' : '';
        const lock = owned ? '' : ' lock';
        const focus = this.focusKind === 'extra' && this.focusExtra === s.id ? ' focus' : '';
        const why = owned ? '' : `<em class="pw-lock">${s.unlockMatches > 0 ? `depois de ${s.unlockMatches} partida${s.unlockMatches === 1 ? '' : 's'}` : 'bloqueado'}</em>`;
        return `<button type="button" class="pw-card${on}${lock}${focus}" data-sec="${s.id}">${this.powerFace(s, plasmaKey, -1, false, s.art)}${why}</button>`;
      })
      .join('');
    const list = this.root.querySelector<HTMLElement>('.lo-list')!;
    list.hidden = false;
    list.innerHTML = `<div class="pw-filters">${filters.map((f) => `<button type="button" class="pw-filter${this.filter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.name}</button>`).join('')}</div><div class="pw-grid">${cards}</div>`;
    list.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        this.deps.click();
        this.filter = (el.dataset.filter as PowerFilter) || 'all';
        this.renderPowers();
      });
    });
    list.querySelectorAll<HTMLElement>('[data-sec]').forEach((el) => {
      el.addEventListener('click', () => {
        this.deps.click();
        this.focusKind = 'extra';
        this.focusExtra = el.dataset.sec || this.focusExtra;
        this.renderPowers();
      });
    });
    const det = this.root.querySelector('.lo-detail')!;
    det.innerHTML = this.powerDetail(synergies, plasmaKey, current);
    det.querySelector('[data-equip]')?.addEventListener('click', () => {
      this.deps.click();
      const id = this.focusExtra;
      const next = this.l.secondary === id ? null : id;
      const staged = stageSecondary(this.l.secondary ?? null, next, this.deps.owns);
      if (staged.reason) {
        this.deps.toast(staged.reason);
        return;
      }
      this.l = { ...this.l, secondary: staged.secondary };
      this.renderPowers();
    });
    det.querySelector('[data-train]')?.addEventListener('click', () => {
      this.deps.click();
      const ready = synergies.filter((s) => s.inKit);
      const line = ready.length ? `Treino: ${ready.map((s) => `${s.name} — ${s.order}`).join(' · ')}` : 'Treino: o boneco fica parado.';
      this.deps.train?.(this.charId, sanitizeLoadout(this.l, this.deps.owns), line);
    });
  }

  private passes(s: StudioDef) {
    if (this.filter === 'all') return true;
    if (this.filter === 'area') return s.speed <= 0;
    return (s.category ?? (s.speed <= 0 ? 'control' : 'attack')) === this.filter;
  }

  private powerFace(pw: PowerDef, key: string, slot: number, badge: boolean, art: string) {
    const icon = art
      ? `<img class="pw-ico" alt="" src="/${art}" />`
      : `<span class="pw-ico pw-letter" style="background:${ELEMENT_COLOR[pw.element]}">${key}</span>`;
    const role = powerSheet(pw, slot, slot >= 0 ? SLOT_COST[slot] ?? 0 : (pw as StudioDef).cost ?? 0).role;
    return `${icon}<span class="lo-slot-k">${key}</span><b>${pw.name}</b><small>${role}</small>${badge ? '<em class="pw-badge">Sinergia</em>' : ''}`;
  }

  private powerDetail(synergies: ReturnType<typeof kitSynergies>, plasmaKey: string, current: StudioDef | null) {
    const slotOf = ['ability', 'skill', 'ult', 'bonus'] as const;
    const extra = this.focusKind === 'extra';
    const pw = extra ? (STUDIO.find((x) => x.id === this.focusExtra) ?? STUDIO[0]) : kitOf(this.charId).powers[this.focusIndex];
    const slot = extra ? -1 : this.focusIndex;
    const cost = extra ? (pw as StudioDef).cost : SLOT_COST[this.focusIndex] ?? SLOT_COST[0];
    const key = extra ? plasmaKey : this.deps.keyOf(slotOf[this.focusIndex] ?? 'ability');
    const sheet = powerSheet(pw, slot, cost);
    const owned = extra ? this.deps.owns('power:' + (pw as StudioDef).id) : true;
    const lock = extra && !owned ? ((pw as StudioDef).unlockMatches > 0 ? `Depois de ${(pw as StudioDef).unlockMatches} partidas.` : 'Ainda não liberado.') : '';
    const equipped = extra && current?.id === (pw as StudioDef).id;
    const saved = studioOf(this.openedSecondary);
    const facts = [
      ['Dano', String(sheet.damage)],
      ['Alcance', String(sheet.range)],
      ['Área', String(sheet.area)],
      ['Energia', sheet.energy],
      ['Recarga', `${sheet.cooldown}s`],
      ['Duração', sheet.duration],
    ];
    const syn = synergies
      .map((s) => `<li class="${s.inKit ? 'in' : ''}"><b>${s.name}</b> ${s.order}. ${s.result}. ${s.need}. ${s.inKit ? 'Neste kit.' : 'Este kit não fecha.'}</li>`)
      .join('');
    const equip = extra
      ? owned
        ? `<button type="button" class="btn small primary" data-equip>${equipped ? 'Tirar do Z' : 'Colocar no Z'}</button>`
        : `<p class="pw-why">${lock}</p>`
      : `<p class="pw-why">${slot === 2 ? 'Suprema do personagem.' : 'Poder do personagem.'} O Z é o único que troca.</p>`;
    return `<div class="pw-sheet"><p class="pw-kicker">${key} · ${sheet.cast} · ${ELEMENT_NAME[pw.element]}</p><h3>${pw.name}</h3><p class="pw-role">${sheet.role}</p><ul class="pw-facts">${facts.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>${equip}<p class="pw-saved">Salvo: ${saved?.name ?? 'vazio'}. Agora: ${current?.name ?? 'vazio'}. Voltar mantém o salvo.</p><h4>Sinergias</h4><ul class="pw-syn">${syn}</ul><button type="button" class="btn small" data-train>Treinar sinergia</button></div>`;
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
