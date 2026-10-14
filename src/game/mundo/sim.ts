// Simulação solo do ECO Mundo. O estado público (save + atores + sessão)
// é o que um futuro co-op ou mundo compartilhado precisaria replicar.
import { getCharacter } from '../characters';
import { primaryOf, WEAPONS } from '../weapons';
import { blocked, INTERACT_R, PORTAL_R, REGIONS, type RegionDef } from './regions';
import {
  abilityEffect,
  addXp,
  applyDeath,
  buyCommonGear,
  buyPotion,
  canDamage,
  bossPhase,
  deposit,
  derived,
  equipFromBag,
  expireTomb,
  POTION_HEAL,
  rollLoot,
  sellGearAt,
  sellMaterials,
  spendPoint,
  takeTomb,
  withdraw,
  type Loot,
} from './rules';
import { think } from './ai';
import { ANOMALY, enterForest, takeFragment, turnIn } from './quest';
import type { MonsterKind, MundoGear, MundoInput, MundoRegionId, MundoSave, MundoSlot, SessionMode, StatId } from './types';

export const STILL: MundoInput = { mx: 0, my: 0, aim: 0, fire: false, ability: false };

export interface Actor {
  id: string;
  kind: 'player' | MonsterKind;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  aim: number;
  aimLock: number;
  team: number;
  cd: number;
  patternT: number;
  alert: number;
  hit: number;
  atk: number;
  /** -1 vivo; senão segundos desde a morte */
  dead: number;
  phase: number;
  speed: number;
  r: number;
  homeX: number;
  homeY: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  team: number;
  r: number;
}

export interface Drop {
  x: number;
  y: number;
  coins: number;
  materials: number;
  gear: MundoGear | null;
  xp: number;
}

export interface MundoPublic {
  v: 1;
  session: { mode: SessionMode; pvpZones: string[] };
  party: string[];
  region: MundoRegionId;
  actors: { id: string; kind: string; team: number; x: number; y: number; hp: number }[];
}

const MONSTER_NAME: Record<MonsterKind, string> = {
  chaser: 'Slime de Sucata',
  ranged: 'Aranha de Cristal',
  caller: 'Sentinela da Floresta',
  boss: 'Guardião do Portal',
};

export class MundoWorld {
  save: MundoSave;
  regionId: MundoRegionId = 'vila';
  player: Actor;
  monsters: Actor[] = [];
  shots: Shot[] = [];
  drops: Drop[] = [];
  portalCd = 0;
  weaponCd = 0;
  abilityCd = 0;
  shield = 0;
  invuln = 0;
  clock: number;
  note = '';
  private epoch = 0;
  private seq = 1;
  private rand: () => number;
  private gearN = 1;

  constructor(save: MundoSave, clock = 0, rand: () => number = Math.random) {
    this.save = save;
    this.clock = clock;
    this.rand = rand;
    const c = getCharacter(save.charId);
    this.player = {
      id: 'you',
      kind: 'player',
      name: c.name,
      x: 0,
      y: 0,
      hp: 1,
      maxHp: 1,
      aim: 0,
      aimLock: 0,
      team: 0,
      cd: 0,
      patternT: 0,
      alert: 0,
      hit: 0,
      atk: 0,
      dead: -1,
      phase: 0,
      speed: 220,
      r: 16,
      homeX: 0,
      homeY: 0,
    };
    this.sync();
    this.player.hp = this.player.maxHp;
    this.load('vila', 'spawn');
  }

  get region(): RegionDef {
    return REGIONS[this.regionId];
  }

  snapshot(): MundoPublic {
    const actors = [this.player, ...this.monsters.filter((m) => m.dead < 0)].map((a) => ({
      id: a.id,
      kind: a.kind,
      team: a.team,
      x: a.x,
      y: a.y,
      hp: a.hp,
    }));
    return { v: 1, session: { ...this.save.session, pvpZones: this.save.session.pvpZones.slice() }, party: this.save.party.slice(), region: this.regionId, actors };
  }

  spawn(kind: MonsterKind, x: number, y: number): Actor {
    const boss = kind === 'boss';
    const hp = boss ? 420 : kind === 'chaser' ? 48 : kind === 'ranged' ? 34 : 30;
    const a: Actor = {
      id: 'm' + ++this.seq,
      kind,
      name: MONSTER_NAME[kind],
      x,
      y,
      hp,
      maxHp: hp,
      aim: 0,
      aimLock: 0,
      team: 1,
      cd: 0,
      patternT: 0,
      alert: 0,
      hit: 0,
      atk: 0,
      dead: -1,
      phase: 0,
      speed: boss ? 70 : kind === 'chaser' ? 150 : kind === 'ranged' ? 110 : 170,
      r: boss ? 34 : 18,
      homeX: x,
      homeY: y,
    };
    this.monsters.push(a);
    return a;
  }

  load(id: MundoRegionId, how: 'spawn' | 'arrival', arrive?: { x: number; y: number }) {
    const reg = REGIONS[id];
    const at = arrive ?? (how === 'arrival' ? reg.arrival : reg.spawn);
    this.epoch++;
    this.regionId = id;
    this.player.x = at.x;
    this.player.y = at.y;
    this.shots = [];
    this.drops = [];
    this.monsters = [];
    if (!reg.safe) for (const s of reg.spawns) this.spawn(s.kind, s.x, s.y);
    this.portalCd = 0.8;
  }

  step(dt: number, input: MundoInput) {
    let left = Math.max(0, Math.min(dt, 1.2));
    while (left > 0) {
      const h = Math.min(1 / 30, left);
      this.tick(h, input);
      left -= h;
    }
  }

  private tick(dt: number, input: MundoInput) {
    this.clock += dt * 1000;
    this.save = expireTomb(this.save, this.clock);
    this.advanceQuest();
    this.sync();
    if (this.weaponCd > 0) this.weaponCd -= dt;
    if (this.abilityCd > 0) this.abilityCd -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.portalCd > 0) this.portalCd -= dt;
    if (this.player.hit > 0) this.player.hit -= dt;
    if (this.player.atk > 0) this.player.atk -= dt;

    const len = Math.hypot(input.mx, input.my) || 1;
    const scale = Math.min(1, Math.hypot(input.mx, input.my)) / len;
    const spd = this.player.speed * dt;
    this.move(this.player, input.mx * scale * spd, input.my * scale * spd);
    this.player.aim = input.aim;
    if (Math.hypot(input.mx, input.my) > 0.08) this.player.phase += dt * 10;

    if (input.fire) this.firePlayer();
    if (input.ability) this.cast();
    this.tryPortal();
    this.stepMonsters(dt);
    this.stepShots(dt);
    this.pickup();
    for (const m of this.monsters) {
      if (m.hit > 0) m.hit -= dt;
      if (m.atk > 0) m.atk -= dt;
      if (m.dead >= 0) m.dead += dt;
    }
    this.monsters = this.monsters.filter((m) => m.dead < 0 || m.dead < 0.7);
  }

  private sync() {
    const d = derived(this.save);
    const prev = this.player.maxHp;
    this.player.maxHp = d.maxHp;
    if (d.maxHp > prev) this.player.hp += d.maxHp - prev;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp);
    this.player.speed = d.speed;
  }

  private move(a: Actor, dx: number, dy: number) {
    const nx = a.x + dx;
    const ny = a.y + dy;
    if (!blocked(this.region, nx, a.y, a.r)) a.x = nx;
    if (!blocked(this.region, a.x, ny, a.r)) a.y = ny;
    const moved = Math.hypot(a.x - (nx - dx), a.y - (ny - dy));
    if (a !== this.player && moved > 0.4) a.phase += moved * 0.08;
  }

  private firePlayer() {
    if (this.weaponCd > 0 || this.player.dead >= 0) return;
    const spec = WEAPONS[primaryOf(this.save.charId)];
    const d = derived(this.save);
    const dmg = (spec.damage + d.weaponFlat) * d.dmgMul;
    const n = spec.pellets;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * spec.spread;
      const a = this.player.aim + t;
      const b = bodyOf(this.player);
      this.shots.push({
        x: b.x + Math.cos(a) * 18,
        y: b.y + Math.sin(a) * 18,
        vx: Math.cos(a) * spec.speed,
        vy: Math.sin(a) * spec.speed,
        dmg,
        life: spec.life,
        team: 0,
        r: spec.size ?? 4,
      });
    }
    this.weaponCd = spec.cooldown * d.cdMul;
    this.player.atk = 0.12;
  }

  private cast() {
    if (this.abilityCd > 0) return;
    const c = getCharacter(this.save.charId);
    const d = derived(this.save);
    const kind = abilityEffect(c.ability.id);
    if (kind === 'dash') {
      const ang = this.player.aim;
      const dist = 150;
      const x0 = this.player.x;
      const y0 = this.player.y;
      let left = dist;
      while (left > 0) {
        const h = Math.min(24, left);
        this.move(this.player, Math.cos(ang) * h, Math.sin(ang) * h);
        left -= h;
      }
      this.damageNearSegment(x0, y0, this.player.x, this.player.y, 46, 18 * d.dmgMul);
    } else if (kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
    } else if (kind === 'shield') {
      this.shield = 2.2;
    } else {
      this.damageNearSegment(this.player.x, this.player.y, this.player.x, this.player.y, 92, 16 * d.dmgMul);
    }
    this.abilityCd = c.ability.cooldown * d.cdMul;
    this.player.atk = 0.2;
  }

  private damageNearSegment(x0: number, y0: number, x1: number, y1: number, rad: number, dmg: number) {
    for (const m of this.monsters) {
      if (m.dead >= 0) continue;
      if (distToSeg(m.x, m.y, x0, y0, x1, y1) < rad + m.r * 0.3) this.hurt(m, dmg);
    }
  }

  private tryPortal() {
    if (this.portalCd > 0) return;
    const spots = [this.region.portal, ...(this.region.gates ?? [])];
    for (const p of spots) {
      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) > PORTAL_R) continue;
      if (p.need === 'ruidos' && this.save.quest.step < 4) {
        this.note = 'Bloqueado · termine Os Ruídos da Floresta';
        return;
      }
      this.load(p.to, 'arrival', p.arrive);
      this.note = this.region.name;
      return;
    }
  }

  private advanceQuest() {
    const before = this.save.quest.step;
    if (this.regionId === 'floresta') {
      this.save = enterForest(this.save);
      this.save = takeFragment(this.save, this.player.x, this.player.y);
    }
    if (this.save.quest.step === before) return;
    if (this.save.quest.step === 2) this.note = 'Floresta Antiga. O fragmento está mais para dentro.';
    if (this.save.quest.step === 3) this.note = 'Fragmento de energia. Volte para Lina.';
  }

  talkNpc(id: string): string {
    if (id !== 'pesquisadora') return '';
    const turned = turnIn(this.save);
    this.save = turned.save;
    this.sync();
    return turned.note;
  }

  private stepMonsters(dt: number) {
    const p = this.player;
    const epoch = this.epoch;
    let meleeSlots = 0;
    for (const m of this.monsters) {
      if (this.epoch !== epoch) return;
      if (m.dead >= 0) continue;
      if (m.alert > 0) m.alert -= dt;
      if (m.cd > 0) m.cd -= dt;
      const dist = Math.hypot(p.x - m.x, p.y - m.y) || 1;
      if (m.kind === 'boss') {
        this.bossAct(m, dt, dist);
        continue;
      }
      if (m.kind === 'player') continue;
      const ahead = meleeSlots;
      if (m.kind === 'chaser' && dist < 46) meleeSlots++;
      const intent = think(
        { kind: m.kind, x: m.x, y: m.y, homeX: m.homeX, homeY: m.homeY, speed: m.speed, alert: m.alert, cd: m.cd },
        { x: p.x, y: p.y, dead: p.dead >= 0 },
        { blocked: (x, y) => blocked(this.region, x, y, 2), attackers: ahead },
      );
      if (intent.state === 'idle') continue;
      m.aim = intent.aim;
      this.move(m, intent.vx * dt, intent.vy * dt);
      if (intent.melee && m.cd <= 0) {
        this.hurt(p, 12, m);
        m.cd = 0.9;
        m.atk = 0.18;
      } else if (intent.bolt && m.cd <= 0) {
        this.bolt(m, m.aim, 280, 8, 1.3);
        m.cd = m.alert > 0.5 ? 0.8 : 1.15;
        m.atk = 0.16;
      } else if (intent.call && m.cd <= 0) {
        this.call(m);
        m.cd = 2.2;
        m.atk = 0.2;
      }
    }
  }

  private bossAct(m: Actor, dt: number, dist: number) {
    const p = this.player;
    if (dist > 740 && m.patternT === 0) return;
    const prevT = m.patternT;
    m.patternT += dt;
    const phase = bossPhase(m.patternT);
    const prev = bossPhase(prevT);
    m.aim = Math.atan2(p.y - m.y, p.x - m.x);
    if (prev === 'slam' && phase !== 'slam') {
      if (dist < 110) this.hurt(p, 28, m);
      m.atk = 0.28;
    }
    if (phase === 'fan' && prev !== 'fan') {
      for (let i = -2; i <= 2; i++) this.bolt(m, m.aim + i * 0.18, 320, 9, 1.4);
      m.atk = 0.2;
    }
    if (phase === 'charge') {
      if (prev !== 'charge') m.aimLock = m.aim;
      this.move(m, Math.cos(m.aimLock) * 340 * dt, Math.sin(m.aimLock) * 340 * dt);
      if (Math.hypot(p.x - m.x, p.y - m.y) < 56 && m.cd <= 0) {
        this.hurt(p, 16, m);
        m.cd = 0.45;
        m.atk = 0.15;
      }
    } else if (phase === 'slam') {
      this.move(m, Math.cos(m.aim) * 40 * dt, Math.sin(m.aim) * 40 * dt);
    }
  }

  private call(from: Actor) {
    for (const o of this.monsters) {
      if (o === from || o.dead >= 0) continue;
      if (Math.hypot(o.x - from.x, o.y - from.y) <= 400) o.alert = 3.5;
    }
  }

  private bolt(from: Actor, ang: number, speed: number, dmg: number, life: number) {
    const b = bodyOf(from);
    this.shots.push({
      x: b.x + Math.cos(ang) * (from.r + 4),
      y: b.y + Math.sin(ang) * (from.r + 4),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      dmg,
      life,
      team: from.team,
      r: from.kind === 'boss' ? 6 : 4,
    });
  }

  private stepShots(dt: number) {
    const epoch = this.epoch;
    const next: Shot[] = [];
    for (const s of this.shots) {
      if (this.epoch !== epoch) return;
      let left = dt;
      let hit = false;
      while (left > 0 && !hit) {
        const h = Math.min(left, 16 / (Math.hypot(s.vx, s.vy) || 1));
        s.x += s.vx * h;
        s.y += s.vy * h;
        s.life -= h;
        left -= h;
        if (blocked(this.region, s.x, s.y, 2)) {
          hit = true;
          break;
        }
        for (const a of [this.player, ...this.monsters]) {
          if (a.team === s.team || a.dead >= 0) continue;
          const b = bodyOf(a);
          if (Math.hypot(b.x - s.x, b.y - s.y) < a.r + s.r + 8) {
            this.hurt(a, s.dmg, s.team === 0 ? this.player : undefined);
            hit = true;
            if (this.epoch !== epoch) return;
            break;
          }
        }
      }
      if (!hit && s.life > 0) next.push(s);
    }
    if (this.epoch !== epoch) return;
    this.shots = next;
  }

  hurt(target: Actor, raw: number, attacker?: Actor): number {
    if (target.dead >= 0) return 0;
    const attackerKind = attacker?.kind ?? (target === this.player ? 'chaser' : 'player');
    const attackerTeam = attacker?.team ?? (target === this.player ? 1 : 0);
    if (
      !canDamage({
        attackerKind,
        targetKind: target.kind,
        attackerTeam,
        targetTeam: target.team,
        regionSafe: this.region.safe,
        regionId: this.regionId,
        session: this.save.session,
      })
    )
      return 0;
    if (target === this.player && this.invuln > 0) return 0;
    let dmg = raw;
    if (target.kind === 'player') {
      dmg *= 1 - derived(this.save).armor;
      if (this.shield > 0) dmg *= 0.45;
    }
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.hit = 0.16;
    if (target.hp <= 0) this.kill(target);
    return dmg;
  }

  private kill(target: Actor) {
    target.hp = 0;
    if (target.kind === 'player') {
      const where = { x: target.x, y: target.y, region: this.regionId };
      const died = applyDeath(this.save, where, this.clock);
      this.save = died.save;
      this.note = died.lost > 0 ? `Você caiu e perdeu ${died.lost} moedas. A tumba fica no lugar por 10 minutos.` : 'Você caiu. A tumba marca o lugar por 10 minutos.';
      this.load('vila', 'spawn');
      this.sync();
      this.player.hp = this.player.maxHp;
      this.invuln = 1.6;
      this.shield = 0;
      return;
    }
    target.dead = 0;
    const loot = rollLoot(this.rand, target.kind as MonsterKind);
    this.drops.push({ x: target.x, y: target.y, ...loot });
  }

  private pickup() {
    const keep: Drop[] = [];
    for (const d of this.drops) {
      if (Math.hypot(d.x - this.player.x, d.y - this.player.y) > 36) {
        keep.push(d);
        continue;
      }
      this.save.coins += d.coins;
      this.save.materials += d.materials;
      this.save = addXp(this.save, d.xp);
      d.coins = 0;
      d.materials = 0;
      d.xp = 0;
      if (d.gear) {
        if (this.save.bag.length < 16) this.save.bag = this.save.bag.concat(d.gear);
        else {
          keep.push(d);
          continue;
        }
      }
    }
    this.drops = keep;
  }

  near(): 'shop' | 'bank' | 'tomb' | null {
    const r = this.region;
    if (r.shop && Math.hypot(this.player.x - r.shop.x, this.player.y - r.shop.y) < INTERACT_R) return 'shop';
    if (r.bank && Math.hypot(this.player.x - r.bank.x, this.player.y - r.bank.y) < INTERACT_R) return 'bank';
    const t = this.save.tomb;
    if (t && t.region === this.regionId && this.clock < t.until && Math.hypot(this.player.x - t.x, this.player.y - t.y) < 90) return 'tomb';
    return null;
  }

  spend(stat: StatId): string {
    const next = spendPoint(this.save, stat);
    if (!next) return 'Sem pontos.';
    this.save = next;
    this.sync();
    return '';
  }

  buyPotion(): string {
    if (this.player.hp >= this.player.maxHp) return 'Sua vida já está cheia.';
    const r = buyPotion(this.save);
    if ('error' in r) return r.error;
    this.save = r.save;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + POTION_HEAL);
    return 'Poção usada.';
  }

  buyGear(slot: MundoSlot): string {
    const r = buyCommonGear(this.save, slot, ++this.gearN);
    if ('error' in r) return r.error;
    this.save = r.save;
    return `Comprou ${r.gear.name}.`;
  }

  sellAt(index: number): string {
    const r = sellGearAt(this.save, index);
    if ('error' in r) return r.error;
    this.save = r.save;
    return `Vendeu por ${r.coins} moedas.`;
  }

  sellMats(n: number): string {
    const r = sellMaterials(this.save, n);
    if ('error' in r) return r.error;
    this.save = r.save;
    return `Vendeu por ${r.coins} moedas.`;
  }

  deposit(n: number): string {
    const r = deposit(this.save, n);
    if ('error' in r) return r.error;
    this.save = r.save;
    return 'Guardado no banco.';
  }

  withdraw(n: number): string {
    const r = withdraw(this.save, n);
    if ('error' in r) return r.error;
    this.save = r.save;
    return 'Sacado.';
  }

  equip(index: number): string {
    const next = equipFromBag(this.save, index);
    if (!next) return 'Item inválido.';
    this.save = next;
    this.sync();
    return 'Equipado.';
  }

  claimTomb(): string {
    const t = this.save.tomb;
    if (!t || t.region !== this.regionId || Math.hypot(this.player.x - t.x, this.player.y - t.y) > 90) return 'Chegue perto da tumba.';
    const r = takeTomb(this.save, this.clock);
    this.save = r.save;
    if (r.error) return r.error;
    return r.taken.length ? 'Itens recuperados.' : 'A tumba estava vazia.';
  }
}

function bodyOf(a: Actor) {
  return { x: a.x, y: a.y - Math.min(36, a.r + 14) };
}

function distToSeg(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.001) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

export type { Loot };
