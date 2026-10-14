// Placar da partida: barra compacta no canto (posição, quem lidera, empate) e placar completo
// sob demanda (Tab no computador, toque no placar no celular). Só usa dados que a partida já tem.
import type { Game, Player } from '../game/sim';
import type { ClientGame } from '../net/clientGame';

type AnyGame = Game | ClientGame;

interface Spec {
  /** título curto do placar (o que está sendo contado) */
  head: string;
  /** valor que ordena o placar */
  val: (p: Player) => number;
  /** texto do valor (padrão: o número) */
  txt?: (p: Player) => string;
  /** mostra eliminações/quedas */
  kd: boolean;
  /** cooperativo: sem "assumiu a liderança" */
  coop: boolean;
  /** nome da coluna do valor no placar completo */
  col: string;
}

const TEAM_NAME = ['Azul', 'Vermelho'];

function spec(g: AnyGame): Spec {
  if (g.mode === 'dupla') {
    const wins = (team: number) => g.players.find((p) => p.team === team)?.roundWins ?? 0;
    return { head: `${TEAM_NAME[0]} ${wins(0)} × ${wins(1)} ${TEAM_NAME[1]} · 3 vencem`, val: (p) => p.roundWins, kd: true, coop: false, col: 'Rodadas' };
  }
  return { head: 'Rodadas vencidas (3 vencem)', val: (p) => p.roundWins, kd: false, coop: false, col: 'Rodadas' };
}

export class Scoreboard {
  private rows: Record<string, HTMLElement> = {};
  private headEl: HTMLElement | null = null;
  private leader = '';
  private leaderSince = 0;
  private sig = '';
  private full: HTMLElement;
  private fullOpen = false;
  private fullSig = '';

  constructor(
    private root: HTMLElement,
    private deps: {
      avatar: (p: Player) => string;
      esc: (s: string) => string;
      notify: (text: string, mine: boolean) => void;
      compact: () => boolean;
    },
  ) {
    this.full = document.getElementById('sb-full')!;
    // celular: toque no placar abre/fecha o placar completo
    root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggle(!this.fullOpen);
    });
    this.full.addEventListener('pointerdown', () => this.toggle(false));
  }

  toggle(on: boolean) {
    this.fullOpen = on;
    this.full.hidden = !on;
    this.fullSig = '';
  }

  build(g: AnyGame | null) {
    this.root.innerHTML = '';
    this.rows = {};
    this.leader = '';
    this.sig = '';
    this.toggle(false);
    if (!g) return;
    this.headEl = document.createElement('div');
    this.headEl.className = 'sb-head';
    this.root.appendChild(this.headEl);
    for (const p of g.players) {
      const row = document.createElement('div');
      const mine = p.id === g.human.id;
      row.className = 'sb-row' + (mine ? ' me' : '') + (p.boss ? ' boss' : '');
      row.style.setProperty('--c', p.color);
      row.innerHTML = `<span class="bar"></span><span class="pos"></span><img class="ava" src="${this.deps.avatar(p)}" alt="" /><span class="name">${mine ? 'Você' : this.deps.esc(p.name)}</span><span class="score">0</span><span class="kd"></span>`;
      this.root.appendChild(row);
      this.rows[p.id] = row;
    }
  }

  /** ordem atual (Chefe sempre em cima no modo Caça ao Chefe) */
  private rank(g: AnyGame, S: Spec) {
    return [...g.players].sort((a, b) => {
      if (a.boss !== b.boss) return a.boss ? -1 : 1;
      return S.val(b) - S.val(a) || b.kills - a.kills || a.deaths - b.deaths;
    });
  }

  update(g: AnyGame) {
    const S = spec(g);
    const order = this.rank(g, S);
    const ranked = order.filter((p) => !p.boss);
    const top = ranked[0];
    const tie = !!top && ranked.length > 1 && S.val(ranked[1]) === S.val(top) && S.val(top) > 0;
    // cabeçalho: o que conta + empate
    const head = `${S.head}${tie && !S.coop ? ' · EMPATE' : ''}`;
    if (this.headEl && this.headEl.textContent !== head) this.headEl.textContent = head;
    // quantas linhas cabem: celular mostra os 3 primeiros + você; computador, 5 + você
    const max = this.deps.compact() ? 3 : 5;
    const meIdx = order.findIndex((p) => p.id === g.human.id);
    order.forEach((p, i) => {
      const row = this.rows[p.id];
      if (!row) return;
      const pos = p.boss ? 'C' : String(ranked.indexOf(p) + 1);
      // líder (ou todos os empatados em primeiro)
      const leader = !p.boss && !!top && S.val(p) > 0 && (p === top || (tie && S.val(p) === S.val(top)));
      const val = S.txt ? S.txt(p) : String(S.val(p));
      const kd = S.kd ? `${p.kills}/${p.deaths}` : '';
      const hide = i >= max + (order[0]?.boss ? 1 : 0) && i !== meIdx;
      const key = `${i}|${pos}|${val}|${kd}|${leader ? (tie ? 't' : 'l') : ''}|${hide ? 1 : 0}|${p.alive && p.playing ? 1 : 0}|${p.team}`;
      if (row.dataset.k === key) return;
      row.dataset.k = key;
      row.style.order = String(i + 1);
      (row.querySelector('.pos') as HTMLElement).textContent = pos;
      (row.querySelector('.score') as HTMLElement).textContent = val;
      (row.querySelector('.kd') as HTMLElement).textContent = kd;
      row.classList.toggle('lead', leader && !tie);
      row.classList.toggle('tie', leader && tie);
      row.classList.toggle('sb-hide', hide);
      row.classList.toggle('out', !p.alive || !p.playing);
      if (p.team >= 0) row.style.setProperty('--team', p.team === 0 ? '#3ea8ff' : '#ff4a5a');
    });
    // "assumiu a liderança": só durante a luta, sem empate, com o líder mantendo por um instante
    if (g.phase === 'play' && !S.coop && top && S.val(top) > 0 && !tie) {
      if (top.id !== this.leader) {
        const had = this.leader !== '';
        this.leader = top.id;
        const now = performance.now();
        if (had && now - this.leaderSince > 1500) {
          const mine = top.id === g.human.id;
          this.deps.notify(mine ? 'Você assumiu a liderança!' : `${top.name} assumiu a liderança`, mine);
        }
        this.leaderSince = now;
      }
    }
    if (this.fullOpen) this.renderFull(g, S, order);
  }

  /** placar completo (todas as pessoas, com tudo que a partida conta) */
  private renderFull(g: AnyGame, S: Spec, order: Player[]) {
    const combat = g.combat;
    const sig = order.map((p) => `${p.id}:${S.val(p)}:${p.kills}:${p.deaths}:${Math.round(p.stats.dmg)}:${p.roundWins}:${Math.ceil(p.hp)}`).join('|') + S.head;
    if (sig === this.fullSig) return;
    this.fullSig = sig;
    const esc = this.deps.esc;
    const ranked = order.filter((p) => !p.boss);
    const cols = [S.col, ...(combat ? ['Elim.', 'Quedas', 'Dano'] : [])];
    const cells = (p: Player) => [
      S.txt ? S.txt(p) : String(S.val(p)),
      ...(combat ? [String(p.kills), String(p.deaths), String(Math.round(p.stats.dmg))] : []),
    ];
    const rows = order
      .map((p) => {
        const pos = p.boss ? 'Chefe' : `${ranked.indexOf(p) + 1}º`;
        const me = p.id === g.human.id;
        return `<tr class="${me ? 'me' : ''}${p.boss ? ' boss' : ''}" style="--c:${p.color}"><td>${pos}</td><td class="pl"><span><img src="${this.deps.avatar(p)}" alt="" /><i>${me ? 'Você' : esc(p.name)}</i></span></td>${cells(p)
          .map((c) => `<td>${c}</td>`)
          .join('')}</tr>`;
      })
      .join('');
    this.full.innerHTML = `<div class="sbf-card"><div class="sbf-h"><b>Placar</b><span>${esc(S.head)}</span></div><table><thead><tr><th>#</th><th>Jogador</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p class="sbf-tip">${this.deps.compact() ? 'Toque para fechar' : 'Solte Tab para fechar'}</p></div>`;
  }
}
