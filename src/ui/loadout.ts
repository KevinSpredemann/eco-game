// Tela de equipamento: arma principal, item e poderes, com desenho de cada peça.
// No topo ficam os 4 espaços do seu equipamento; embaixo, um carrossel (deslizar para o lado, igual aos
// personagens e mapas) com as opções do espaço escolhido, e a ficha completa do item no centro.
import { KITS, KitId, Loadout, PRIMARY_PRICE, ROLE_COLOR, ROLE_LABEL, SKILLS, STANDARD_PRIMARIES, SkillId, ULTS, UltId, gearPrice, sanitizeLoadout, stageSecondary } from '../game/balance';
import { CATEGORY_LABEL, WEAPONS, WeaponDef, WeaponId, primaryOf, weaponDps } from '../game/weapons';
import { getCharacter } from '../game/characters';
import { ELEMENT_NAME, SLOT_COST, STUDIO, StudioDef, kitOf, studioOf, type PowerCategory, type PowerDef } from '../game/elements';
import { aimLine, categoryLabel, listSynergies, powerRole, relevantFacts, swapDelta, targetLine, trainLine, useLine, type SynergyRow } from '../game/combos';
import { previewEmpty, previewHtml } from './powerPreview';
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

export interface PowerCardOpts {
  state: 'equipped' | 'available' | 'locked' | 'unavailable';
  why: string;
  selected: boolean;
  linked: boolean;
  ult: boolean;
  attrs: string;
  extra?: string;
  slot: number;
  cost: number;
  /** texto curto. Sem isto, vale o papel do golpe. */
  line?: string;
  /** faixa de equipados: tecla, ícone, nome e elemento — sem texto longo nem chips */
  compact?: boolean;
  key?: string;
}

/** Card da biblioteca. Ícone, nome, categoria · elemento, efeito curto, chips e estado. A tecla não entra. */
export function powerCardHtml(pw: PowerDef, opts: PowerCardOpts): string {
  const label = opts.selected && opts.state !== 'equipped' ? 'Selecionado' : opts.state === 'equipped' ? 'Equipado' : opts.state === 'locked' ? 'Bloqueado' : opts.state === 'unavailable' ? 'Indisponível' : 'Disponível';
  const cls = ['pw-card', opts.state, opts.selected ? 'focus' : '', opts.linked ? 'syn-on' : '', opts.ult ? 'ult' : '', opts.extra ?? ''].filter(Boolean).join(' ');
  const line = opts.line || opts.why || powerRole(pw);
  const badge = opts.linked ? '<em class="pw-badge">Sinergia</em>' : '';
  if (opts.compact) {
    const key = opts.key ? `<kbd class="pw-key">${opts.key}</kbd>` : '';
    return `<button type="button" class="${cls} slim" ${opts.attrs} data-state="${opts.state}" data-el="${pw.element}" title="${pw.name} — ${powerRole(pw)}">${key}${previewHtml(pw, 'sm')}<span class="pw-copy"><b class="pw-name">${pw.name}</b><small class="pw-meta">${opts.ult ? 'Suprema' : ELEMENT_NAME[pw.element]}${opts.linked ? ' · <i class="pw-syn-dot">sinergia</i>' : ''}</small></span></button>`;
  }
  const chips = relevantFacts(pw, opts.slot, opts.cost)
    .map((f) => `<i class="pw-chip"><span>${f.label}</span> ${f.value}</i>`)
    .join('');
  return `<button type="button" class="${cls}" ${opts.attrs} data-state="${opts.state}" data-el="${pw.element}">${previewHtml(pw, 'sm')}<span class="pw-copy"><b class="pw-name">${pw.name}</b><small class="pw-meta">${categoryLabel(pw)} · ${ELEMENT_NAME[pw.element]}</small><em class="pw-line">${line}</em><span class="pw-chips">${chips}</span><em class="pw-state">${label}</em>${badge}</span></button>`;
}

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
  /** Troca do Z ainda não confirmada. Voltar e Começar ignoram isto. */
  private pending: { next: string | null } | null = null;

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
    this.pending = null;
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
    const synergies = listSynergies(this.charId, this.l.secondary ?? null);
    const linked = new Set<number>();
    for (const row of synergies) {
      if (row.state !== 'active') continue;
      for (const slot of row.slots) linked.add(slot);
    }
    const slotOf = ['ability', 'skill', 'ult', 'bonus'] as const;
    const order = [0, 1, 3, 2];
    const plasmaKey = this.deps.keyOf('plasma');
    const slots = this.root.querySelector('.lo-slots')!;
    const current = studioOf(this.l.secondary);
    const kitHtml = order
      .map((i) => {
        const selected = this.focusKind === 'kit' && this.focusIndex === i;
        return this.abilityCard(kit.powers[i], {
          key: this.deps.keyOf(slotOf[i]),
          state: 'equipped',
          why: '',
          selected,
          linked: linked.has(i),
          ult: i === 2,
          attrs: `data-kit="${i}"`,
          slot: i,
          cost: SLOT_COST[i],
          compact: true,
        });
      })
      .join('');
    const zSelected = this.focusKind === 'extra' && !!current && this.focusExtra === current.id;
    const zCard = current
      ? this.abilityCard(current, {
          key: plasmaKey,
          state: 'equipped',
          why: '',
          selected: zSelected,
          linked: linked.has(-1),
          ult: false,
          attrs: 'data-slot="z"',
          extra: ' z',
          slot: -1,
          cost: current.cost,
          compact: true,
        })
      : `<button type="button" class="pw-card z empty slim${this.focusKind === 'extra' && !this.focusExtra ? ' focus' : ''}" data-slot="z" data-state="available"><kbd class="pw-key">${plasmaKey}</kbd>${previewEmpty('sm')}<span class="pw-copy"><b class="pw-name">Vazio</b><small class="pw-meta">Extra · escolha abaixo</small></span></button>`;
    slots.innerHTML = `<div class="pw-equip">${kitHtml}${zCard}</div>`;
    const keep = this.root.querySelector<HTMLElement>('.pw-grid')?.scrollTop ?? 0;
    slots.querySelectorAll<HTMLElement>('[data-kit]').forEach((el) => {
      el.addEventListener('click', () => {
        this.deps.click();
        this.pending = null;
        this.focusKind = 'kit';
        this.focusIndex = Number(el.dataset.kit);
        this.renderPowers();
      });
    });
    slots.querySelector('[data-slot="z"]')?.addEventListener('click', () => {
      this.deps.click();
      this.pending = null;
      this.focusKind = 'extra';
      this.focusExtra = current?.id ?? '';
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
        const equipped = this.l.secondary === s.id;
        const state = !owned ? 'locked' : equipped ? 'equipped' : 'available';
        return this.abilityCard(s, {
          key: equipped ? plasmaKey : 'disponível',
          state,
          why: owned ? '' : this.lockReason(s),
          selected: this.focusKind === 'extra' && this.focusExtra === s.id,
          linked: equipped && linked.has(-1),
          ult: false,
          attrs: `data-sec="${s.id}"`,
          slot: -1,
          cost: s.cost,
        });
      })
      .join('');
    const list = this.root.querySelector<HTMLElement>('.lo-list')!;
    list.hidden = false;
    list.innerHTML = `<div class="pw-filters">${filters.map((f) => `<button type="button" class="pw-filter${this.filter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.name}</button>`).join('')}</div><div class="pw-grid">${cards}</div>`;
    const grid = list.querySelector<HTMLElement>('.pw-grid');
    if (grid) grid.scrollTop = keep;
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
        this.pending = null;
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
      const owned = this.deps.owns('power:' + id);
      if (!owned) return;
      const next = this.l.secondary === id ? null : id;
      this.pending = { next };
      this.renderPowers();
    });
    det.querySelector('[data-swap-ok]')?.addEventListener('click', () => {
      this.deps.click();
      if (!this.pending) return;
      const staged = stageSecondary(this.l.secondary ?? null, this.pending.next, this.deps.owns);
      if (staged.reason) {
        this.deps.toast(staged.reason);
        return;
      }
      this.l = { ...this.l, secondary: staged.secondary };
      this.pending = null;
      if (this.l.secondary) this.focusExtra = this.l.secondary;
      this.renderPowers();
    });
    det.querySelector('[data-swap-no]')?.addEventListener('click', () => {
      this.deps.click();
      this.pending = null;
      this.renderPowers();
    });
    det.querySelector('[data-train]')?.addEventListener('click', () => {
      this.deps.click();
      this.deps.train?.(this.charId, sanitizeLoadout(this.l, this.deps.owns), trainLine(this.charId));
    });
  }

  private passes(s: StudioDef) {
    if (this.filter === 'all') return true;
    if (this.filter === 'area') return s.speed <= 0;
    return (s.category ?? (s.speed <= 0 ? 'control' : 'attack')) === this.filter;
  }

  private lockReason(s: StudioDef) {
    return s.unlockMatches > 0 ? `Depois de ${s.unlockMatches} partida${s.unlockMatches === 1 ? '' : 's'}.` : 'Ainda não liberado.';
  }

  private abilityCard(
    pw: PowerDef,
    opts: { key: string; state: 'equipped' | 'available' | 'locked' | 'unavailable'; why: string; selected: boolean; linked: boolean; ult: boolean; attrs: string; extra?: string; slot: number; cost: number; line?: string; compact?: boolean },
  ) {
    return powerCardHtml(pw, opts);
  }

  private shownRows(synergies: SynergyRow[], pw: PowerDef, slot: number): SynergyRow[] {
    const mine = synergies.filter((row) => row.slots.includes(slot) || row.ends.includes(pw.name) || (slot < 0 && row.powers.some((end) => end.name === pw.name)));
    if (mine.length) return mine;
    const locked = synergies.filter((row) => row.state === 'locked');
    return locked.length ? locked : [];
  }

  private powerDetail(synergies: SynergyRow[], plasmaKey: string, current: StudioDef | null) {
    const extra = this.focusKind === 'extra';
    if (extra && !this.focusExtra) {
      return `<div class="pw-sheet"><div class="pw-hero">${previewEmpty('lg')}<div class="pw-id"><h3>Vazio</h3><p class="pw-kicker">Extra</p></div></div><div class="pw-scroll"><p class="pw-role">Escolha um poder na lista.</p><p class="pw-why">Q, E, F e R não trocam. Só o Z aceita um extra.</p></div><div class="pw-syn-box"><h4>Sinergias</h4><ul class="pw-syn"><li class="syn-row none"><span class="syn-copy"><b>Nenhuma</b><small>O Z está vazio.</small></span><em class="syn-badge">— Nenhuma</em></li></ul></div><div class="pw-actions"><button type="button" class="btn small" data-train>Treinar combo</button></div></div>`;
    }
    const picked = extra ? STUDIO.find((x) => x.id === this.focusExtra) ?? STUDIO[0] : kitOf(this.charId).powers[this.focusIndex];
    const slot = extra ? -1 : this.focusIndex;
    const cost = extra ? (picked as StudioDef).cost : SLOT_COST[this.focusIndex] ?? SLOT_COST[0];
    const facts = relevantFacts(picked, slot, cost);
    const owned = extra ? this.deps.owns('power:' + (picked as StudioDef).id) : true;
    const equipped = extra && current?.id === (picked as StudioDef).id;
    // Extra ainda fora do Z: mostra o que ele fecharia se fosse equipado (e não as sinergias de outros poderes).
    const preview = extra && !equipped;
    const rows = preview
      ? listSynergies(this.charId, (picked as StudioDef).id)
          .filter((row) => row.slots.includes(-1) || row.powers.some((p) => p.name === picked.name))
          .map((row) => (row.state === 'active' ? { ...row, state: 'possible' as const, need: 'Ative ao equipar no Z' } : row))
      : this.shownRows(synergies, picked, slot);
    const syn = rows.length
      ? rows.map((row) => this.synergyRow(row)).join('')
      : `<li class="syn-row none"><span class="syn-copy"><b>Nenhuma</b><small>Este poder não fecha sinergia.</small></span><em class="syn-badge">— Nenhuma</em></li>`;
    const saved = studioOf(this.openedSecondary);
    const pending = extra && owned && this.pending && this.focusExtra === (picked as StudioDef).id;
    let note = '';
    let primary = '';
    if (!extra) {
      note = `<p class="pw-why">${slot === 2 ? 'Suprema do personagem.' : 'Poder do personagem.'} Q, E, F e R não trocam. Só o Z aceita um extra.</p>`;
    } else if (!owned) {
      note = `<p class="pw-why">${this.lockReason(picked as StudioDef)}</p>`;
    } else if (pending) {
      note = this.swapFacts(this.l.secondary ?? null, this.pending!.next);
      primary = `<button type="button" class="btn small primary" data-swap-ok>Confirmar troca</button><button type="button" class="btn small ghost" data-swap-no>Manter</button>`;
    } else {
      const label = equipped ? 'Tirar do Z' : current ? 'Substituir' : 'Equipar';
      primary = `<button type="button" class="btn small primary" data-equip>${label}</button>`;
    }
    const slotLine = extra ? ` <small class="pw-saved">Z salvo: ${saved?.name ?? 'vazio'} · agora: ${current?.name ?? 'vazio'}. Voltar mantém o salvo.</small>` : '';
    const long = `<div class="pw-long"><p>${targetLine(picked)}${slotLine}</p>${note}</div>`;
    return `<div class="pw-sheet" data-el="${picked.element}"><div class="pw-hero">${previewHtml(picked, 'lg')}<div class="pw-id"><h3>${picked.name}</h3><p class="pw-kicker">${categoryLabel(picked)} · ${ELEMENT_NAME[picked.element]}</p></div></div><div class="pw-scroll"><p class="pw-role">${powerRole(picked)}</p><ul class="pw-facts">${facts.map((f) => `<li><span>${f.label}</span><b>${f.value}</b></li>`).join('')}</ul><p class="pw-use">${useLine(picked)} ${aimLine(picked)}</p>${long}</div><div class="pw-syn-box"><h4>${preview ? 'Sinergias se equipar' : 'Sinergias'}</h4><ul class="pw-syn">${syn}</ul></div><div class="pw-actions">${primary}<button type="button" class="btn small" data-train>Treinar combo</button></div></div>`;
  }

  private synergyRow(row: SynergyRow) {
    const badge = row.state === 'active' ? '✓ Ativa' : row.state === 'possible' ? '◇ Possível' : row.state === 'locked' ? '⊘ Bloqueada' : '— Nenhuma';
    const link = '<svg class="syn-link" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12h6M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    return `<li class="syn-row ${row.state}"><span class="syn-pair">${previewHtml(row.powers[0], 'xs')}${link}${previewHtml(row.powers[1], 'xs')}</span><span class="syn-copy"><b>${row.name}</b><small>${row.effect}</small><details><summary>Como ativa</summary><p>${row.order}. ${row.need}.</p></details></span><em class="syn-badge">${badge}</em></li>`;
  }

  private swapFacts(prev: string | null, next: string | null) {
    const delta = swapDelta(this.charId, prev, next);
    const gain = delta.gained.length ? delta.gained.join(', ') : 'Nenhuma';
    const loss = delta.lost.length ? delta.lost.join(', ') : 'Nenhuma';
    return `<div class="pw-swap" data-swap><p class="pw-kicker">Confirmar troca</p><ul class="pw-facts"><li><span>Sai</span><b>${delta.removed}</b></li><li><span>Entra</span><b>${delta.added}</b></li><li><span>Tecla</span><b>${delta.key}</b></li><li><span>Ganha</span><b>${gain}</b></li><li><span>Perde</span><b>${loss}</b></li></ul><p class="pw-why">${delta.limit}</p></div>`;
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
