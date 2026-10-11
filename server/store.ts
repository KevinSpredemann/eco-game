// Onde as contas ficam guardadas: Postgres (produção) ou um arquivo JSON (desenvolvimento).
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { Profile } from '../src/game/economy';

export interface UserRecord {
  username: string;
  key: string; // username em minúsculas
  hash: string;
  salt: string;
  profile: Profile;
  lastRewardAt: number;
  createdAt: number;
}

export interface Store {
  init(): Promise<void>;
  get(key: string): Promise<UserRecord | null>;
  create(u: UserRecord): Promise<boolean>;
  save(u: UserRecord): Promise<void>;
}

export class FileStore implements Store {
  private data: Record<string, UserRecord> = {};
  private writing: Promise<void> = Promise.resolve();
  constructor(private path: string) {}
  async init() {
    try {
      this.data = JSON.parse(await fs.readFile(this.path, 'utf8'));
    } catch {
      this.data = {};
    }
  }
  async get(key: string) {
    return this.data[key] ? structuredClone(this.data[key]) : null;
  }
  async create(u: UserRecord) {
    if (this.data[u.key]) return false;
    this.data[u.key] = structuredClone(u);
    await this.flush();
    return true;
  }
  async save(u: UserRecord) {
    this.data[u.key] = structuredClone(u);
    await this.flush();
  }
  private flush() {
    this.writing = this.writing.then(async () => {
      await fs.mkdir(dirname(this.path), { recursive: true });
      await fs.writeFile(this.path, JSON.stringify(this.data));
    });
    return this.writing;
  }
}

export class PgStore implements Store {
  private pool: any;
  constructor(private url: string) {}
  async init() {
    const pg = await import('pg');
    const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
    this.pool = new Pool({ connectionString: this.url, ssl: needsSsl(this.url) ? { rejectUnauthorized: false } : false, max: 5 });
    await this.pool.query(`create table if not exists eco_users (
      key text primary key,
      username text not null,
      hash text not null,
      salt text not null,
      profile jsonb not null,
      last_reward_at bigint not null default 0,
      created_at bigint not null
    )`);
  }
  async get(key: string) {
    const r = await this.pool.query('select * from eco_users where key = $1', [key]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return { key: x.key, username: x.username, hash: x.hash, salt: x.salt, profile: x.profile, lastRewardAt: Number(x.last_reward_at), createdAt: Number(x.created_at) };
  }
  async create(u: UserRecord) {
    const r = await this.pool.query(
      'insert into eco_users (key, username, hash, salt, profile, last_reward_at, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict (key) do nothing',
      [u.key, u.username, u.hash, u.salt, JSON.stringify(u.profile), u.lastRewardAt, u.createdAt],
    );
    return r.rowCount === 1;
  }
  async save(u: UserRecord) {
    await this.pool.query('update eco_users set profile = $2, last_reward_at = $3 where key = $1', [u.key, JSON.stringify(u.profile), u.lastRewardAt]);
  }
}

/** Render's internal address (no dots, e.g. dpg-xxx-a) and localhost don't use SSL; outside addresses do. */
function needsSsl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    if (/sslmode=disable/.test(url)) return false;
    return host.includes('.') && host !== '127.0.0.1';
  } catch {
    return true;
  }
}
