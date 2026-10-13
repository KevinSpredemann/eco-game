// Servidor do ECO: contas (apelido + senha), moedas/loja e salas online por código.
// A partida roda aqui (autoritativa); os aparelhos só mandam comandos e desenham.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { ARENAS, getArena } from '../src/game/arenas';
import { CHARACTERS } from '../src/game/characters';
import { BotBrain } from '../src/game/bot';
import { Game, GameMode, Input, MIN_PLAYERS, MODE_RULES } from '../src/game/sim';
import { Loadout, botLoadout, DEFAULT_LOADOUT, sanitizeLoadout } from '../src/game/balance';
import { abilityLevel, buy, equip, grantStarters, matchReward, newProfile, owns, Profile, MatchMode, levelOf } from '../src/game/economy';
import { BTN, ClientMsg, encodeSnapshot, echoSignature, EndInfo, LobbyPlayer, RoomInfo, ServerMsg, StartInfo, PROTO } from '../src/net/protocol';
import { rematchStatus, RematchVote } from '../src/net/rematch';
import { checkPassword, hashPassword, signToken, validPassword, validUsername, verifyToken } from './auth';
import { FileStore, PgStore, Store, UserRecord } from './store';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.SECRET || 'dev-secret-' + (process.env.USER ?? 'eco');
const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(process.env.DATA_FILE || 'data/users.json');

// ====================================================================== HTTP (contas e loja)
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('grande demais');
  }
  return raw ? JSON.parse(raw) : {};
}

async function userFrom(req: IncomingMessage): Promise<UserRecord | null> {
  const h = req.headers.authorization ?? '';
  const key = verifyToken(h.replace(/^Bearer /, ''), SECRET);
  return key ? store.get(key) : null;
}

function publicProfile(u: UserRecord): Profile & { level: number } {
  return { ...u.profile, username: u.username, level: levelOf(u.profile.xp) };
}

/** importa progresso de convidado ao criar conta (com limites) */
function importGuest(p: Profile, guest: any) {
  if (!guest || typeof guest !== 'object') return;
  p.coins = Math.min(2000, Math.max(p.coins, Number(guest.coins) || 0));
  p.xp = Math.min(20000, Number(guest.xp) || 0);
  p.wins = Math.min(5000, Number(guest.wins) || 0);
  p.matches = Math.min(20000, Number(guest.matches) || 0);
  if (Array.isArray(guest.owned)) for (const it of guest.owned.slice(0, 60)) if (typeof it === 'string' && !p.owned.includes(it) && /^(char|skin|trail|gear):[a-z]+$/.test(it)) p.owned.push(it);
  if (guest.equipped) for (const slot of ['char', 'skin', 'trail'] as const) if (owns(p, `${slot}:${guest.equipped[slot]}`)) p.equipped[slot] = guest.equipped[slot];
}

const loginAttempts = new Map<string, { n: number; at: number }>();

const http = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (url.pathname === '/' || url.pathname === '/api/health') return send(res, 200, { ok: true, db: process.env.DATABASE_URL ? 'postgres' : 'arquivo', rooms: rooms.size, players: [...clients.values()].filter((c) => !c.gone).length });

    if (url.pathname === '/api/register' && req.method === 'POST') {
      const { username, password, guest } = await readJson(req);
      const e = validUsername(String(username ?? '')) || validPassword(password);
      if (e) return send(res, 400, { error: e });
      const key = String(username).toLowerCase();
      const { hash, salt } = hashPassword(password);
      const profile = newProfile(username);
      importGuest(profile, guest);
      grantStarters(profile);
      const u: UserRecord = { username, key, hash, salt, profile, lastRewardAt: 0, createdAt: Date.now() };
      if (!(await store.create(u))) return send(res, 409, { error: 'Esse apelido já existe. Escolha outro.' });
      return send(res, 200, { token: signToken(key, SECRET), profile: publicProfile(u) });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await readJson(req);
      const key = String(username ?? '').toLowerCase();
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '');
      const att = loginAttempts.get(ip + key) ?? { n: 0, at: Date.now() };
      if (Date.now() - att.at > 10 * 60_000) Object.assign(att, { n: 0, at: Date.now() });
      if (att.n >= 10) return send(res, 429, { error: 'Muitas tentativas. Espere alguns minutos.' });
      const u = await store.get(key);
      if (!u || !checkPassword(String(password ?? ''), u.salt, u.hash)) {
        att.n++;
        loginAttempts.set(ip + key, att);
        return send(res, 401, { error: 'Apelido ou senha errados.' });
      }
      loginAttempts.delete(ip + key);
      if (grantStarters(u.profile)) await store.save(u);
      return send(res, 200, { token: signToken(key, SECRET), profile: publicProfile(u) });
    }

    if (url.pathname === '/api/me') {
      const u = await userFrom(req);
      if (!u) return send(res, 401, { error: 'Entre de novo na sua conta.' });
      if (grantStarters(u.profile)) await store.save(u);
      return send(res, 200, { profile: publicProfile(u) });
    }

    if (url.pathname === '/api/buy' && req.method === 'POST') {
      const u = await userFrom(req);
      if (!u) return send(res, 401, { error: 'Entre na sua conta.' });
      const { item } = await readJson(req);
      const e = buy(u.profile, String(item));
      if (e) return send(res, 400, { error: e });
      await store.save(u);
      return send(res, 200, { profile: publicProfile(u) });
    }

    if (url.pathname === '/api/equip' && req.method === 'POST') {
      const u = await userFrom(req);
      if (!u) return send(res, 401, { error: 'Entre na sua conta.' });
      const { slot, id } = await readJson(req);
      if (!['char', 'skin', 'trail'].includes(slot)) return send(res, 400, { error: 'Inválido.' });
      const e = equip(u.profile, slot, String(id));
      if (e) return send(res, 400, { error: e });
      await store.save(u);
      return send(res, 200, { profile: publicProfile(u) });
    }

    if (url.pathname === '/api/reward' && req.method === 'POST') {
      // partidas contra bots (fora do servidor): limitado no tempo para evitar abuso
      const u = await userFrom(req);
      if (!u) return send(res, 401, { error: 'Entre na sua conta.' });
      const r = await readJson(req);
      if (Date.now() - u.lastRewardAt < 50_000) return send(res, 200, { coins: 0, profile: publicProfile(u) });
      const mode = ([...Object.keys(MODE_RULES), 'treino'].includes(r.mode) ? r.mode : 'treino') as MatchMode;
      const coins = matchReward({ mode, placement: Number(r.placement) || 9, players: Math.min(4, Number(r.players) || 1), score: Math.min(200, Number(r.score) || 0), kills: Math.min(20, Number(r.kills) || 0), online: false });
      u.profile.coins += coins;
      u.profile.xp += coins;
      u.profile.matches++;
      if (Number(r.placement) === 1 && Number(r.players) > 1) u.profile.wins++;
      u.lastRewardAt = Date.now();
      await store.save(u);
      return send(res, 200, { coins, profile: publicProfile(u) });
    }

    return send(res, 404, { error: 'Não encontrado.' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Erro no servidor. Tente de novo.' });
  }
});

// ====================================================================== salas
interface Client {
  id: string;
  ws: WebSocket;
  name: string;
  userKey: string | null;
  char: string;
  skin: string;
  trail: string;
  lv: number;
  room: Room | null;
  input: Input;
  alive: boolean;
  loadout: Loadout;
  ready: boolean;
  /** quantas vezes já foi o Chefe (rodízio justo) */
  bossTimes: number;
  /** identificador da aba (volta para a mesma vaga se a conexão cair) */
  sid: string;
  /** quando a conexão caiu (0 = conectado); a vaga fica guardada por GRACE_MS */
  gone: number;
  /** versão do protocolo do aparelho */
  v: number;
}

interface Room {
  code: string;
  host: string;
  mode: GameMode;
  arena: string;
  bots: number;
  members: Client[];
  game: Game | null;
  loop: NodeJS.Timeout | null;
  ticks: number;
  pending: unknown[];
  echoSig: string;
  /** quem pediu para pular o Rebobinando desta rodada */
  skipVotes: Set<string>;
  /** sala da busca automática (qualquer um entra) */
  public: boolean;
  /** quando começa sozinha (ms); 0 = só o dono começa */
  autoAt: number;
  /** escalação da partida em andamento (para quem reconecta no meio) */
  roster: RosterRow[];
  /** votos de revanche do X1 (só os dois jogadores conectados) */
  rematchVotes: Map<string, RematchVote>;
  rematchAt: number;
}

const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();
/** aba (sid) → jogador: evita jogador duplicado e permite voltar para a sala */
const sessions = new Map<string, Client>();
/** quanto tempo a vaga de quem caiu fica guardada */
const GRACE_MS = 20_000;
const OUTDATED = 'Seu jogo está desatualizado. Feche e abra o jogo de novo (ou recarregue a página) para atualizar e entrar na sala.';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxPlayers = (m: GameMode) => MODE_RULES[m].maxPlayers;
const validMode = (m: unknown): m is GameMode => typeof m === 'string' && m in MODE_RULES;

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function sendTo(c: Client, m: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m));
}

/** nomes iguais na mesma sala ganham número (dois "Convidado" viram "Convidado" e "Convidado 2") */
function displayName(r: Room, c: Client) {
  const same = r.members.filter((m) => m.name.toLowerCase() === c.name.toLowerCase());
  const i = same.indexOf(c);
  return i <= 0 ? c.name : `${c.name} ${i + 1}`;
}

function roomInfo(r: Room): RoomInfo {
  return {
    code: r.code,
    mode: r.mode,
    arena: r.arena,
    bots: r.bots,
    state: r.game ? 'playing' : 'lobby',
    players: r.members.map<LobbyPlayer>((m) => ({ id: m.id, name: displayName(r, m), char: m.char, skin: m.skin, trail: m.trail, host: m.id === r.host, logged: !!m.userKey, ready: m.ready, away: !!m.gone })),
    max: maxPlayers(r.mode),
    public: r.public,
    autoIn: r.autoAt ? Math.max(0, Math.ceil((r.autoAt - Date.now()) / 1000)) : undefined,
  };
}

function broadcastRoom(r: Room) {
  for (const m of r.members) sendTo(m, { t: 'room', room: roomInfo(r) });
}

function leaveRoom(c: Client) {
  const r = c.room;
  if (!r) return;
  c.room = null;
  r.members = r.members.filter((m) => m !== c);
  if (r.game) {
    // quem sai no meio da partida vira bot, para não travar a sala
    const p = r.game.players.find((p) => p.id === c.id);
    if (p) {
      p.isBot = true;
      p.brain = new BotBrain('normal');
      p.name = p.char.name + ' (bot)';
    }
  }
  if (!r.members.length || r.members.every((m) => m.gone)) {
    // ninguém conectado: fecha a sala (quem estava caído perde a vaga)
    if (r.loop) clearInterval(r.loop);
    rooms.delete(r.code);
    for (const m of r.members) m.room = null;
    r.members = [];
    return;
  }
  if (r.host === c.id) pickHost(r);
  broadcastRoom(r);
}

/** novo dono: o primeiro que está conectado */
function pickHost(r: Room) {
  const h = r.members.find((m) => !m.gone) ?? r.members[0];
  if (h) r.host = h.id;
}

/** a conexão caiu: guarda a vaga; na partida, um bot joga por ele até voltar */
function markAway(c: Client) {
  const r = c.room;
  c.gone = Date.now();
  c.input = { mx: 0, my: 0, dash: false, ability: false };
  if (!r) return;
  if (r.game) {
    const p = r.game.players.find((p) => p.id === c.id);
    if (p && !p.isBot) {
      p.isBot = true;
      p.brain = new BotBrain('normal');
    }
  }
  if (r.host === c.id) pickHost(r);
  if (r.members.every((m) => m.gone)) return; // ninguém para avisar; a limpeza fecha a sala depois
  broadcastRoom(r);
}

/** voltou (mesma aba): reassume o personagem e recebe a sala / a partida de novo */
function resumeSeat(c: Client) {
  const r = c.room;
  if (!r) return;
  if (r.game) {
    const p = r.game.players.find((p) => p.id === c.id);
    if (p && p.isBot) {
      p.isBot = false;
      p.brain = null;
    }
    if (p) {
      sendTo(c, { t: 'start', info: { you: c.id, mode: r.mode, arena: r.arena, roster: r.roster } });
      r.echoSig = ''; // manda de novo os caminhos dos ecos para quem voltou
    }
  }
  if (!r.members.some((m) => m.id === r.host && !m.gone)) pickHost(r);
  broadcastRoom(r);
}

/** tira o jogador de vez (saiu, ou não voltou a tempo) */
function dropClient(c: Client) {
  leaveRoom(c);
  clients.delete(c.id);
  if (c.sid && sessions.get(c.sid) === c) sessions.delete(c.sid);
}

async function ownedChar(c: Client, char: string, skin: string, trail: string) {
  // convidados usam personagens iniciais; logados usam o que compraram
  let profile: Profile = newProfile();
  if (c.userKey) profile = (await store.get(c.userKey))?.profile ?? profile;
  const ch = CHARACTERS.find((x) => x.id === char) && owns(profile, 'char:' + char) ? char : 'kael';
  const sk = owns(profile, 'skin:' + skin) ? skin : 'padrao';
  const tr = owns(profile, 'trail:' + trail) ? trail : 'nenhum';
  return { ch, sk, tr, lv: abilityLevel(profile, ch) };
}

type RosterRow = { id: string; char: string; skin: string; trail: string; name: string; isBot: boolean; lv?: number; loadout?: Loadout; boss?: boolean };

/** quantos participantes a sala terá (pessoas + bots) */
function plannedSize(r: Room, fill = false) {
  const humans = Math.min(r.members.length, maxPlayers(r.mode));
  const min = MIN_PLAYERS[r.mode] ?? 2;
  const want = r.mode === 'duelo' ? 2 : Math.max(humans, Math.min(maxPlayers(r.mode), humans + r.bots));
  return fill ? Math.max(want, min) : want;
}

function startGame(r: Room, fill = false) {
  const min = MIN_PLAYERS[r.mode] ?? 2;
  if (plannedSize(r, fill) < min) {
    const host = r.members.find((m) => m.id === r.host);
    if (host) sendTo(host, { t: 'error', msg: `Este modo precisa de pelo menos ${min} participantes. Aumente os bots ou espere mais gente entrar.` });
    return;
  }
  const humans = r.members.slice(0, maxPlayers(r.mode));
  const used = new Set(humans.map((h) => h.char));
  const roster: RosterRow[] = humans.map((h) => ({ id: h.id, char: h.char, skin: h.skin, trail: h.trail, name: displayName(r, h), isBot: false, lv: h.lv || 1, loadout: h.loadout }));
  const want = plannedSize(r, fill);
  const pool = CHARACTERS.map((c) => c.id).filter((id) => !used.has(id));
  for (let i = 0; roster.length < want; i++) {
    const ch = pool[i % pool.length];
    roster.push({ id: 'bot' + i, char: ch, skin: 'padrao', trail: 'nenhum', name: CHARACTERS.find((c) => c.id === ch)!.name + ' (bot)', isBot: true, loadout: botLoadout(ch) });
  }
  if (roster.length < 2) roster.push({ id: 'bot9', char: pool[0], skin: 'padrao', trail: 'nenhum', name: 'Bot', isBot: true });
  if (r.mode === 'chefe') {
    // rodízio justo: quem foi Chefe menos vezes; empate = sorteio
    const least = Math.min(...humans.map((h) => h.bossTimes));
    const cands = humans.filter((h) => h.bossTimes === least);
    const pick = cands[Math.floor(Math.random() * cands.length)];
    if (pick) {
      pick.bossTimes++;
      roster.find((x) => x.id === pick.id)!.boss = true;
    }
  }
  for (const m of r.members) m.ready = false;
  r.autoAt = 0;
  const game = new Game({
    arena: getArena(r.arena),
    humanChar: roster[0].char,
    bots: 0,
    difficulty: 'normal',
    ownEchoDamage: true,
    training: false,
    mode: r.mode,
    roster,
  });
  r.game = game;
  r.roster = roster;
  // quem está com a conexão caída começa com um bot no lugar (volta a jogar quando reconectar)
  for (const m of humans) if (m.gone) {
    const p = game.players.find((x) => x.id === m.id);
    if (p) {
      p.isBot = true;
      p.brain = new BotBrain('normal');
    }
  }
  r.ticks = 0;
  r.pending = [];
  r.echoSig = '';
  r.rematchVotes = new Map();
  r.rematchAt = 0;
  for (const m of humans) m.input = { mx: 0, my: 0, dash: false, ability: false };
  for (const m of r.members) {
    const info: StartInfo = { you: m.id, mode: r.mode, arena: r.arena, roster };
    sendTo(m, { t: 'start', info });
  }
  broadcastRoom(r);
  const STEP = 1 / 60;
  r.loop = setInterval(() => tick(r, STEP), 1000 / 60);
}

function tick(r: Room, dt: number) {
  const g = r.game;
  if (!g) return;
  const inputs: Record<string, Input> = {};
  for (const m of r.members) {
    inputs[m.id] = m.input;
    // botões de toque único são consumidos no passo
    m.input = { ...m.input, dash: false, ability: false, item: false, bonus: false, skill: false, ult: false, ca: null, cr: null };
  }
  g.step(dt, inputs);
  if (g.phase !== 'rewind' && r.skipVotes.size) r.skipVotes.clear();
  for (const e of g.drainEvents()) r.pending.push(e);
  r.ticks++;
  if (r.ticks % 3 === 0 || g.phase === 'results') {
    const sig = echoSignature(g);
    const routes = sig !== r.echoSig;
    const meta = routes || r.ticks % 60 === 0;
    r.echoSig = sig;
    const msg = JSON.stringify({ t: 's', s: encodeSnapshot(g, meta, routes), ev: r.pending });
    r.pending = [];
    for (const m of r.members) if (m.ws.readyState === WebSocket.OPEN) m.ws.send(msg);
  }
  if (g.phase === 'results') finishGame(r);
}

/** busca automática: começa quando lota, quando todos estão prontos ou quando o tempo acaba (completa com bots) */
setInterval(() => {
  // quem caiu e não voltou a tempo sai da sala
  const now = Date.now();
  for (const c of [...clients.values()]) if (c.gone && now - c.gone > GRACE_MS) dropClient(c);
  for (const r of rooms.values()) {
    if (r.game || !r.members.length) continue;
    if (r.public) {
      const full = r.members.length >= maxPlayers(r.mode);
      const allReady = r.members.length >= 2 && r.members.every((m) => m.ready || m.gone);
      if (full || allReady || (r.autoAt && Date.now() >= r.autoAt)) {
        startGame(r, true);
        continue;
      }
    }
    if (r.autoAt) broadcastRoom(r);
    if (!r.game && r.rematchAt && rematchStatus(rematchHumans(r), votesOf(r), Date.now(), r.rematchAt) === 'no') pushRematch(r);
  }
}, 1000);

async function finishGame(r: Room) {
  const g = r.game!;
  if (r.loop) clearInterval(r.loop);
  r.loop = null;
  r.game = null;
  const rank = g.ranking();
  const rewards: Record<string, number> = {};
  for (const m of r.members) {
    const p = g.players.find((x) => x.id === m.id);
    if (!p) continue;
    const placement = rank.indexOf(p) + 1;
    const coins = matchReward({ mode: g.mode, placement: g.winners.includes(p.id) ? 1 : Math.max(2, placement), players: g.players.length, score: p.score, kills: p.kills, online: true });
    rewards[m.id] = m.userKey ? coins : 0;
    if (m.userKey) {
      const u = await store.get(m.userKey);
      if (u) {
        u.profile.coins += coins;
        u.profile.xp += coins;
        u.profile.matches++;
        if (g.winners.includes(p.id)) u.profile.wins++;
        await store.save(u);
      }
    }
  }
  const info: EndInfo = {
    ranking: rank.map((p) => {
      const top = Object.entries(p.stats.uses).sort((a, b) => b[1] - a[1])[0];
      return { id: p.id, name: p.name, char: p.char.id, skin: p.skin, score: p.score, kills: p.kills, roundWins: p.roundWins, team: p.team, boss: p.boss, dmg: Math.round(p.stats.dmg), heal: Math.round(p.stats.heal), obj: p.stats.obj, weak: p.stats.weak, top: top ? `${top[0]} ×${top[1]}` : '' };
    }),
    gameWon: g.gameWon,
    winners: g.winners,
    highlight: g.highlight,
    rewards,
  };
  for (const m of r.members) sendTo(m, { t: 'end', info });
  r.rematchVotes = new Map();
  r.rematchAt = 0;
  broadcastRoom(r);
}

function rematchHumans(r: Room) {
  return r.members.filter((m) => !m.gone).map((m) => m.id);
}

function votesOf(r: Room): Record<string, RematchVote | undefined> {
  const o: Record<string, RematchVote | undefined> = {};
  for (const [id, v] of r.rematchVotes) o[id] = v;
  return o;
}

function pushRematch(r: Room) {
  if (r.mode !== 'duelo' || r.game) return;
  const humans = rematchHumans(r);
  const status = rematchStatus(humans, votesOf(r), Date.now(), r.rematchAt);
  if (status === 'idle') return;
  if (status === 'go') {
    for (const m of r.members) sendTo(m, { t: 'rematch', state: 'go' });
    r.rematchVotes = new Map();
    r.rematchAt = 0;
    startGame(r, false);
    return;
  }
  if (status === 'no') {
    for (const m of r.members) sendTo(m, { t: 'rematch', state: 'no' });
    r.rematchVotes = new Map();
    r.rematchAt = 0;
    return;
  }
  const by = [...r.rematchVotes.entries()].find(([, v]) => v === 'yes')?.[0];
  for (const m of r.members) sendTo(m, { t: 'rematch', state: 'wait', by });
}

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  let c: Client = { id: 'u' + randomBytes(4).toString('hex'), ws, name: 'Jogador', userKey: null, char: 'kael', skin: 'padrao', trail: 'nenhum', lv: 1, room: null, input: { mx: 0, my: 0, dash: false, ability: false }, alive: true, loadout: { ...DEFAULT_LOADOUT }, ready: false, bossTimes: 0, sid: '', gone: 0, v: 0 };
  clients.set(c.id, c);
  ws.on('pong', () => (c.alive = true));
  const cleanName = (v: unknown) => String(v ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  const canEnter = () => {
    if (c.v === PROTO) return true;
    sendTo(c, { t: 'error', msg: OUTDATED });
    return false;
  };
  ws.on('message', async (raw) => {
    let m: ClientMsg;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== 'object' || c.ws !== ws) return;
    switch (m.t) {
      case 'hello': {
        const sid = typeof m.sid === 'string' && /^[a-z0-9]{8,40}$/i.test(m.sid) ? m.sid : '';
        const old = sid ? sessions.get(sid) : undefined;
        let resumed = false;
        if (old && old !== c) {
          // mesma aba de novo (a conexão caiu, recarregou a página ou abriu duas conexões):
          // assume o lugar antigo em vez de virar um jogador duplicado
          clients.delete(c.id);
          const prev = old.ws;
          old.ws = ws;
          old.alive = true;
          old.gone = 0;
          if (prev !== ws) {
            prev.removeAllListeners('close');
            prev.removeAllListeners('message');
            try {
              prev.terminate();
            } catch {
              /* já fechada */
            }
          }
          c = old;
          resumed = !!old.room;
        }
        if (sid) {
          c.sid = sid;
          sessions.set(sid, c);
        }
        c.v = Number(m.v) || 0;
        const key = verifyToken(m.token, SECRET);
        const u = key ? await store.get(key) : null;
        if (u && grantStarters(u.profile)) await store.save(u);
        c.userKey = u ? u.key : null;
        c.name = u ? u.username : cleanName(m.name) || 'Convidado';
        if (u && !resumed) {
          c.char = u.profile.equipped.char;
          c.lv = abilityLevel(u.profile, c.char);
          c.skin = u.profile.equipped.skin;
          c.trail = u.profile.equipped.trail;
        }
        sendTo(c, { t: 'hello', id: c.id, name: c.name, v: PROTO, resumed });
        if (resumed) resumeSeat(c);
        break;
      }
      case 'nick': {
        // convidado escolhe o apelido que aparece na sala
        if (c.userKey) break;
        c.name = cleanName(m.name) || 'Convidado';
        if (c.room && !c.room.game) broadcastRoom(c.room);
        break;
      }
      case 'create': {
        if (!canEnter()) return;
        leaveRoom(c);
        const mode: GameMode = validMode(m.mode) ? m.mode : 'combate';
        const arena = ARENAS.some((a) => a.id === m.arena) ? m.arena : 'lab';
        const r: Room = { code: newCode(), host: c.id, mode, arena, bots: Math.max(0, Math.min(maxPlayers(mode) - 1, Number(m.bots) || 0)), members: [c], game: null, loop: null, ticks: 0, pending: [], echoSig: '', skipVotes: new Set(), public: false, autoAt: 0, roster: [], rematchVotes: new Map(), rematchAt: 0 };
        rooms.set(r.code, r);
        c.room = r;
        c.ready = false;
        broadcastRoom(r);
        break;
      }
      case 'join': {
        if (!canEnter()) return;
        const code = String(m.code ?? '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return sendTo(c, { t: 'error', msg: `Sala ${code || ''} não encontrada. Confira o código — ou a sala já foi fechada.`.replace('  ', ' ') });
        if (c.room === r) return broadcastRoom(r); // já está nela: só manda a sala de novo
        if (r.game) return sendTo(c, { t: 'error', msg: 'Essa sala já está no meio de uma partida. Espere acabar e tente de novo.' });
        if (r.members.length >= maxPlayers(r.mode)) return sendTo(c, { t: 'error', msg: `A sala está cheia (${maxPlayers(r.mode)} de ${maxPlayers(r.mode)}).` });
        leaveRoom(c);
        r.members.push(c);
        c.room = r;
        c.ready = false;
        broadcastRoom(r);
        break;
      }
      case 'set': {
        const { ch, sk, tr, lv } = await ownedChar(c, m.char, m.skin, m.trail);
        c.lv = lv;
        c.char = ch;
        c.skin = sk;
        c.trail = tr;
        if (c.room && !c.room.game) broadcastRoom(c.room);
        break;
      }
      case 'config': {
        const r = c.room;
        if (!r || r.host !== c.id || r.game) return;
        if (validMode(m.mode)) r.mode = m.mode;
        if (ARENAS.some((a) => a.id === m.arena)) r.arena = m.arena;
        r.bots = Math.max(0, Math.min(maxPlayers(r.mode) - 1, Number(m.bots) || 0));
        broadcastRoom(r);
        break;
      }
      case 'start': {
        const r = c.room;
        if (!r) return sendTo(c, { t: 'error', msg: 'Você não está em nenhuma sala.' });
        if (r.game) return; // já começou (toque duplo): ignora
        if (r.host !== c.id) return sendTo(c, { t: 'error', msg: 'Só o dono da sala pode começar.' });
        if (r.members.length > maxPlayers(r.mode)) return sendTo(c, { t: 'error', msg: `Gente demais para este modo (máximo ${maxPlayers(r.mode)}).` });
        startGame(r);
        break;
      }
      case 'loadout': {
        let profile: Profile = newProfile();
        if (c.userKey) profile = (await store.get(c.userKey))?.profile ?? profile;
        c.loadout = sanitizeLoadout(m.l, (k) => owns(profile, k));
        // no meio da partida: vale a partir da próxima rodada
        if (c.room?.game) c.room.game.setLoadout(c.id, c.loadout);
        break;
      }
      case 'rematch': {
        const r = c.room;
        if (!r || r.game || r.mode !== 'duelo') break;
        if (!r.rematchAt) r.rematchAt = Date.now();
        r.rematchVotes.set(c.id, m.on ? 'yes' : 'no');
        pushRematch(r);
        break;
      }
      case 'skip': {
        // pular o Rebobinando: só quando todos os jogadores da sala pedem
        const r = c.room;
        if (!r?.game || r.game.phase !== 'rewind') break;
        r.skipVotes.add(c.id);
        if (r.members.every((x) => x.gone || r.skipVotes.has(x.id))) r.game.skipRewind();
        break;
      }
      case 'ready': {
        c.ready = !!m.on;
        if (c.room && !c.room.game) broadcastRoom(c.room);
        break;
      }
      case 'quick': {
        // busca automática: entra numa sala aberta do modo ou abre uma nova
        if (!canEnter()) return;
        const mode: GameMode = validMode(m.mode) ? m.mode : 'chefe';
        leaveRoom(c);
        let r = [...rooms.values()].find((x) => x.public && !x.game && x.mode === mode && x.members.length < maxPlayers(mode));
        if (!r) {
          const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
          r = { code: newCode(), host: c.id, mode, arena, bots: 0, members: [], game: null, loop: null, ticks: 0, pending: [], echoSig: '', skipVotes: new Set(), public: true, autoAt: Date.now() + 25_000, roster: [], rematchVotes: new Map(), rematchAt: 0 };
          rooms.set(r.code, r);
        }
        r.members.push(c);
        c.room = r;
        c.ready = false;
        broadcastRoom(r);
        break;
      }
      case 'input': {
        if (!c.room?.game || !Array.isArray(m.i)) return;
        const [mx, my, bits, aim, ca, cr] = m.i;
        const prev = c.input;
        const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
        const press = !!(bits & (BTN.dash | BTN.ability | BTN.item | BTN.bonus | BTN.skill | BTN.ult));
        c.input = {
          mx: Math.max(-1, Math.min(1, Number(mx) || 0)),
          my: Math.max(-1, Math.min(1, Number(my) || 0)),
          // cada toque vira UM uso: fica guardado até o próximo passo do jogo e depois some
          dash: prev.dash || !!(bits & BTN.dash),
          ability: prev.ability || !!(bits & BTN.ability),
          fire: !!(bits & BTN.fire),
          item: prev.item || !!(bits & BTN.item),
          bonus: prev.bonus || !!(bits & BTN.bonus),
          skill: prev.skill || !!(bits & BTN.skill),
          ult: prev.ult || !!(bits & BTN.ult),
          aim: num(aim),
          ca: press ? num(ca) : prev.ca ?? null,
          cr: press ? (num(cr) === null ? null : Math.max(0, Math.min(2000, num(cr)!))) : prev.cr ?? null,
        };
        break;
      }
      case 'leave':
        leaveRoom(c);
        sendTo(c, { t: 'left' });
        break;
      case 'ping':
        sendTo(c, { t: 'pong', at: m.at });
        break;
    }
  });
  ws.on('close', () => {
    if (c.ws !== ws) return; // esta conexão já foi substituída por outra da mesma aba
    // dentro de uma sala: guarda a vaga um pouco (pode ser só o 4G oscilando); fora: sai na hora
    if (c.room && c.sid) markAway(c);
    else dropClient(c);
  });
});

// derruba conexões mortas
setInterval(() => {
  for (const c of clients.values()) {
    if (c.gone || c.ws.readyState !== WebSocket.OPEN) continue;
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 20_000);

store
  .init()
  .then(() => {
    http.listen(PORT, () => console.log(`ECO servidor na porta ${PORT} (${process.env.DATABASE_URL ? 'banco Postgres/Neon conectado' : 'arquivo local'})`));
  })
  .catch((err) => {
    // mensagem clara no log do Render (sem mostrar a senha do banco)
    console.error('ERRO: não consegui conectar ao banco (DATABASE_URL).');
    console.error('Confira se colou a "connection string" inteira do Neon, começando com postgresql:// e terminando com ?sslmode=require');
    console.error('Detalhe:', String(err?.message ?? err).replace(/postgres(ql)?:\/\/[^@\s]*@/g, 'postgresql://***@'));
    process.exit(1);
  });
