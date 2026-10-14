// Conexão do aparelho com o servidor (WebSocket).
import type { Input } from '../game/sim';
import { BTN, ClientMsg, EndInfo, PROTO, RoomInfo, ServerMsg, Snapshot, StartInfo } from './protocol';

/** identificador desta aba: se a conexão cair (ou a página recarregar), o servidor devolve a mesma vaga na sala */
export function sessionId(): string {
  try {
    let s = sessionStorage.getItem('eco-sid');
    if (!s) {
      s = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('eco-sid', s);
    }
    return s;
  } catch {
    return (memSid ||= Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  }
}
let memSid = '';

export class NetClient {
  private ws: WebSocket | null = null;
  id = '';
  name = '';
  room: RoomInfo | null = null;
  /** última sala em que estava (para voltar depois de uma queda) */
  lastRoom = '';
  /** versão do servidor (diferente da nossa = jogo desatualizado de um dos lados) */
  serverV = 0;
  /** o servidor devolveu a vaga antiga na sala */
  resumed = false;
  ping = 0;
  onRoom: (r: RoomInfo | null) => void = () => {};
  onStart: (s: StartInfo) => void = () => {};
  onSnap: (s: Snapshot, ev: unknown[]) => void = () => {};
  onEnd: (e: EndInfo) => void = () => {};
  onRematch: (state: 'wait' | 'no' | 'go', by?: string) => void = () => {};
  onError: (msg: string) => void = () => {};
  onClose: () => void = () => {};
  private pending = { dash: false, ability: false, item: false, bonus: false, skill: false, ult: false, plasma: false };
  private lastSent = '';
  private lastSentAt = 0;
  private pingTimer = 0;

  connect(base: string, name: string, token: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = base.replace(/^http/, 'ws') + '/ws';
      let done = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error('O servidor demorou a responder. Se ele estava dormindo, tente de novo em alguns segundos.'));
          ws.close();
        }
      }, 70_000);
      ws.onopen = () => this.send({ t: 'hello', name, token, sid: sessionId(), v: PROTO });
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (m.t) {
          case 'hello':
            this.id = m.id;
            this.name = m.name;
            this.serverV = m.v ?? 0;
            this.resumed = !!m.resumed;
            if (!done) {
              done = true;
              clearTimeout(timeout);
              resolve();
            }
            break;
          case 'room':
            this.room = m.room;
            this.lastRoom = m.room.code;
            this.onRoom(m.room);
            break;
          case 'start':
            this.onStart(m.info);
            break;
          case 's':
            this.onSnap(m.s, m.ev);
            break;
          case 'end':
            this.onEnd(m.info);
            break;
          case 'rematch':
            this.onRematch(m.state, m.by);
            break;
          case 'left':
            this.room = null;
            this.lastRoom = '';
            this.onRoom(null);
            break;
          case 'error':
            this.onError(m.msg);
            break;
          case 'pong':
            this.ping = performance.now() - m.at;
            break;
        }
      };
      ws.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          reject(new Error('Não consegui conectar ao servidor online.'));
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.room = null;
        clearInterval(this.pingTimer);
        if (!done) {
          done = true;
          clearTimeout(timeout);
          reject(new Error('Não consegui conectar ao servidor online.'));
        }
        if (!this.closedByUs) this.onClose();
      };
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 3000);
    });
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private pendCast: [number | null, number | null] = [null, null];
  /** manda os comandos ~30x por segundo (ou na hora, se apertou um botão) */
  sendInput(i: Input) {
    const P = this.pending;
    if (i.dash) P.dash = true;
    if (i.ability) P.ability = true;
    if (i.item) P.item = true;
    if (i.bonus) P.bonus = true;
    if (i.skill) P.skill = true;
    if (i.ult) P.ult = true;
    if (i.plasma) P.plasma = true;
    if (typeof i.ca === 'number') this.pendCast = [Math.round(i.ca * 100) / 100, typeof i.cr === 'number' ? Math.round(i.cr) : null];
    const press = (P.dash ? BTN.dash : 0) | (P.ability ? BTN.ability : 0) | (P.item ? BTN.item : 0) | (P.bonus ? BTN.bonus : 0) | (P.skill ? BTN.skill : 0) | (P.ult ? BTN.ult : 0) | (P.plasma ? BTN.plasma : 0);
    const bits = press | (i.fire ? BTN.fire : 0);
    const aim = typeof i.aim === 'number' ? Math.round(i.aim * 100) / 100 : null;
    const payload: [number, number, number, number | null, number | null, number | null] = [Math.round(i.mx * 100) / 100, Math.round(i.my * 100) / 100, bits, aim, press ? this.pendCast[0] : null, press ? this.pendCast[1] : null];
    const key = JSON.stringify(payload);
    const now = performance.now();
    if (key === this.lastSent && now - this.lastSentAt < 200) return;
    if (now - this.lastSentAt < 30 && !press) return;
    this.send({ t: 'input', i: payload });
    this.lastSent = key;
    this.lastSentAt = now;
    this.pending = { dash: false, ability: false, item: false, bonus: false, skill: false, ult: false, plasma: false };
    this.pendCast = [null, null];
  }

  private closedByUs = false;
  close() {
    this.closedByUs = true;
    clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
