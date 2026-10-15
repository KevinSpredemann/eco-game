/** Um aviso por vez, a partir da recusa real da simulação. */

export type NoticeTone = 'amber' | 'red' | 'cyan';

export interface CastNotice {
  id: string;
  text: string;
  tone: NoticeTone;
  /** fica até a condição passar; os outros somem sozinhos */
  persist: boolean;
}

function secsLabel(secs: number) {
  const n = Math.max(0, secs);
  const shown = n >= 10 ? n.toFixed(0) : n.toFixed(1);
  return shown.replace('.', ',');
}

/** Traduz a mensagem da simulação. Mensagem desconhecida não vira aviso. */
export function noticeOf(msg: string, secs?: number): CastNotice | null {
  if (msg === 'Energia insuficiente') return { id: 'energy', text: 'SEM ENERGIA', tone: 'red', persist: true };
  if (msg === 'Habilidade em recarga') {
    const when = typeof secs === 'number' ? ` (disponivel em ${secsLabel(secs)}s)` : '';
    return { id: 'cd', text: `EM RECARGA${when}`, tone: 'amber', persist: true };
  }
  if (msg === 'Nenhum alvo válido') return { id: 'target', text: 'ALVO INVALIDO', tone: 'amber', persist: false };
  if (msg === 'Obstáculo') return { id: 'los', text: 'SEM LINHA DE VISAO', tone: 'amber', persist: false };
  if (msg === 'Fora de alcance') return { id: 'range', text: 'ALCANCE INSUFICIENTE', tone: 'amber', persist: false };
  if (msg === 'Conjuração interrompida') return { id: 'cancel', text: 'CONJURACAO INTERROMPIDA', tone: 'amber', persist: false };
  if (msg === 'Mira fora do alcance') return { id: 'aim', text: 'MIRA FORA DO ALCANCE', tone: 'cyan', persist: true };
  if (msg === 'Ultimate em carga') return { id: 'ult', text: 'CARGA INSUFICIENTE', tone: 'cyan', persist: true };
  if (msg === 'Preso pelas raízes') return { id: 'root', text: 'PRESO PELAS RAIZES', tone: 'amber', persist: true };
  if (msg === 'Habilidade ainda não desbloqueada') return { id: 'lock', text: 'INDISPONIVEL', tone: 'cyan', persist: false };
  return null;
}

export class CastNotifier {
  current: CastNotice | null = null;
  /** sobe só quando o aviso troca; o mesmo id atualiza o texto no lugar */
  generation = 0;
  private hold = 0;

  constructor(private el?: HTMLElement) {}

  show(n: CastNotice) {
    if (this.current?.id === n.id) {
      if (this.current.text !== n.text || this.current.tone !== n.tone) {
        this.current = n;
        this.paint(false);
      }
      if (n.persist) this.hold = Number.POSITIVE_INFINITY;
      return;
    }
    this.current = n;
    this.generation++;
    this.hold = n.persist ? Number.POSITIVE_INFINITY : 1.7;
    this.paint(true);
  }

  showMsg(msg: string, secs?: number) {
    const n = noticeOf(msg, secs);
    if (n) this.show(n);
  }

  clear(id?: string) {
    if (!this.current) return;
    if (id && this.current.id !== id) return;
    this.current = null;
    this.hold = 0;
    this.paint(false);
  }

  tick(dt: number) {
    if (!this.current || !Number.isFinite(this.hold)) return;
    this.hold -= dt;
    if (this.hold <= 0) this.clear();
  }

  private paint(enter: boolean) {
    const el = this.el;
    if (!el) return;
    if (!this.current) {
      el.hidden = true;
      el.classList.remove('in');
      return;
    }
    el.hidden = false;
    el.dataset.tone = this.current.tone;
    el.dataset.id = this.current.id;
    if (el.textContent !== this.current.text) el.textContent = this.current.text;
    if (enter) {
      el.classList.remove('in');
      void el.offsetWidth;
      el.classList.add('in');
    }
  }
}
