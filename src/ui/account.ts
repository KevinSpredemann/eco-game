// Conta do jogador: convidado (salvo no aparelho) ou logado (salvo no servidor).
import { buy, equip, matchReward, newProfile, MatchResult, Profile, levelOf } from '../game/economy';

const PKEY = 'eco.profile.v1';
const TKEY = 'eco.token.v1';

/** Endereço do servidor: definido na publicação (VITE_SERVER_URL) ou localhost no desenvolvimento. */
export function serverUrl(): string {
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env.startsWith('http') ? env.replace(/\/$/, '') : `https://${env}`;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:8787';
  return '';
}

function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function store(k: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
}

class Account {
  profile: Profile = load(PKEY, newProfile());
  token: string | null = null;
  listeners: (() => void)[] = [];

  constructor() {
    try {
      this.token = localStorage.getItem(TKEY);
    } catch {
      this.token = null;
    }
  }

  get logged() {
    return !!this.token;
  }
  get level() {
    return levelOf(this.profile.xp);
  }
  get online() {
    return !!serverUrl();
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }
  private changed() {
    if (!this.logged) store(PKEY, this.profile);
    for (const f of this.listeners) f();
  }

  private async api(path: string, body?: unknown): Promise<any> {
    const base = serverUrl();
    if (!base) throw new Error('O servidor online ainda não está configurado.');
    let res: Response;
    try {
      res = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Não consegui falar com o servidor. Ele pode estar acordando (leva ~1 min). Tente de novo.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && this.token && path !== '/api/login') this.logout();
    if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
    return data;
  }

  async register(username: string, password: string) {
    const d = await this.api('/api/register', { username, password, guest: this.profile });
    this.setSession(d.token, d.profile);
  }
  async login(username: string, password: string) {
    const d = await this.api('/api/login', { username, password });
    this.setSession(d.token, d.profile);
  }
  logout() {
    this.token = null;
    store(TKEY, null);
    this.profile = load(PKEY, newProfile());
    this.changed();
  }
  private setSession(token: string, profile: Profile) {
    this.token = token;
    store(TKEY, token);
    this.profile = profile;
    this.changed();
  }
  async refresh() {
    if (!this.logged) return;
    try {
      const d = await this.api('/api/me');
      this.profile = d.profile;
      this.changed();
    } catch {
      /* fica com o que tem */
    }
  }

  async buy(item: string): Promise<string | null> {
    if (this.logged) {
      try {
        const d = await this.api('/api/buy', { item });
        this.profile = d.profile;
        this.changed();
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    }
    const err = buy(this.profile, item);
    if (!err) this.changed();
    return err;
  }

  async equip(slot: 'char' | 'skin' | 'trail', id: string): Promise<string | null> {
    if (this.logged) {
      try {
        const d = await this.api('/api/equip', { slot, id });
        this.profile = d.profile;
        this.changed();
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    }
    const err = equip(this.profile, slot, id);
    if (!err) this.changed();
    return err;
  }

  /** recompensa de partida contra bots */
  async reward(r: MatchResult): Promise<number> {
    if (this.logged) {
      try {
        const d = await this.api('/api/reward', r);
        this.profile = d.profile;
        this.changed();
        return d.coins;
      } catch {
        return 0;
      }
    }
    const coins = matchReward(r);
    this.profile.coins += coins;
    this.profile.xp += coins;
    this.profile.matches++;
    if (r.placement === 1 && r.players > 1) this.profile.wins++;
    this.changed();
    return coins;
  }

  /** soma moedas ganhas online (o servidor já salvou; aqui só atualiza a tela) */
  addOnline(coins: number) {
    if (!coins) return;
    this.refresh();
  }
}

export const account = new Account();
