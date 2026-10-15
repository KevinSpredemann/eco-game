// Desenhos do combate estratégico: avisos de golpes (área/linha), armadilhas, prévia de mira,
// ícones de estado sobre os jogadores, geradores e marcas do Chefe.
import type { Cast, Game, Player, Trap } from '../game/sim';
import { BOSS, SKILLS } from '../game/balance';
import { TEAM_COLORS } from '../game/sim';

type Ctx = CanvasRenderingContext2D;

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function txt(ctx: Ctx, x: number, y: number, s: string, col: string, size = 13) {
  ctx.font = `700 ${size}px Bungee, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(8,6,22,0.85)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}

/** perigo para o jogador local? (vermelho) ou golpe aliado (cor do time) */
function castColor(game: Game, c: Cast) {
  const me = game.human;
  const owner = game.players.find((p) => p.id === c.owner);
  const enemy = owner ? game.hostile(owner, me) : true;
  return { col: enemy ? '#ff3b3b' : owner?.color ?? '#3ee8ff', enemy };
}

/** avisos no chão: área marcada que vai enchendo até o golpe cair */
export function drawCastsGround(ctx: Ctx, game: Game, time: number) {
  for (const c of (game.casts ?? []) as Cast[]) {
    const { col, enemy } = castColor(game, c);
    const k = c.windup > 0 ? Math.min(1, c.t / c.windup) : 1;
    const blink = Math.sin(time * 22) > 0;
    if (!c.fired) {
      if (c.kind === 'feixe' || c.kind === 'avanco' || c.kind === 'fissura') {
        const owner = game.players.find((p) => p.id === c.owner);
        const ox = c.kind === 'avanco' && owner ? owner.x : c.x;
        const oy = c.kind === 'avanco' && owner ? owner.y : c.y;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(c.ang);
        ctx.fillStyle = hexA(col, 0.12 + (enemy ? 0.06 : 0));
        ctx.fillRect(0, -c.w / 2, c.len, c.w);
        ctx.fillStyle = hexA(col, 0.35);
        ctx.fillRect(0, -c.w / 2, c.len * k, c.w);
        ctx.strokeStyle = hexA(col, blink ? 0.95 : 0.6);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(0, -c.w / 2, c.len, c.w);
        ctx.setLineDash([]);
        // setas indicando a direção
        ctx.fillStyle = hexA(col, 0.8);
        for (let d = 40; d < c.len; d += 70) {
          ctx.beginPath();
          ctx.moveTo(d + 10, 0);
          ctx.lineTo(d - 4, -9);
          ctx.lineTo(d - 4, 9);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      if (c.kind === 'barragem') {
        const owner = game.players.find((p) => p.id === c.owner);
        if (owner) {
          ctx.strokeStyle = hexA(col, 0.8);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(owner.x, owner.y - 30, 50 + k * 30, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }
      if (c.kind === 'obsidiana') {
        const vertical = Math.abs(Math.cos(c.ang)) > Math.abs(Math.sin(c.ang));
        ctx.strokeStyle = hexA('#ff7a3a', blink ? 0.9 : 0.5);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        for (const s of [-1, 1]) {
          const x = c.x + (vertical ? 0 : s * 80);
          const y = c.y + (vertical ? s * 80 : 0);
          const w = vertical ? 26 : 110;
          const h = vertical ? 110 : 26;
          ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        }
        ctx.setLineDash([]);
        continue;
      }
      // área circular (meteoro, chuva, impacto, estase)
      const owner = game.players.find((p) => p.id === c.owner);
      const cx = c.kind === 'impacto' && owner ? owner.x : c.x;
      const cy = c.kind === 'impacto' && owner ? owner.y : c.y;
      ctx.fillStyle = hexA(col, enemy ? 0.14 : 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
      ctx.fill();
      // enche de dentro para fora: quando encosta na borda, o golpe cai
      ctx.fillStyle = hexA(col, 0.28);
      ctx.beginPath();
      ctx.arc(cx, cy, c.r * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(col, blink ? 1 : 0.65);
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 7]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (enemy && c.r >= 60) txt(ctx, cx, cy, '!', '#ffffff', 22);
      continue;
    }
    // ativo: campo de estase
    if (c.kind === 'estase') {
      const left = Math.max(0, c.windup + c.life - c.t);
      const gr = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.r);
      gr.addColorStop(0, hexA('#c77dff', 0.06));
      gr.addColorStop(1, hexA('#c77dff', 0.32));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(enemy ? '#ff3b3b' : '#c77dff', 0.85);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = time * 0.8 + (i / 6) * Math.PI * 2;
        ctx.strokeStyle = hexA('#e8d0ff', 0.4);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 0.6, a, a + 0.5);
        ctx.stroke();
      }
      txt(ctx, c.x, c.y - c.r - 10, `ESTASE ${left.toFixed(1)}s`, '#e8d0ff', 11);
    }
  }
}

/** armadilhas: visíveis para todos (contrajogada), com raio de ativação */
export function drawTraps(ctx: Ctx, game: Game, time: number) {
  const R = SKILLS.armadilha.radius ?? 34;
  for (const t of (game.traps ?? []) as Trap[]) {
    const owner = game.players.find((p) => p.id === t.owner);
    const enemy = owner ? game.hostile(owner, game.human) : true;
    const col = enemy ? '#ff5a3c' : owner?.color ?? '#ffd23e';
    const armed = t.armT <= 0;
    ctx.strokeStyle = hexA(col, armed ? 0.55 : 0.25);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // dentes da armadilha
    ctx.fillStyle = '#3a3e48';
    ctx.strokeStyle = '#141820';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c8d0e0';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(t.x + Math.cos(a) * 9, t.y + Math.sin(a) * 9);
      ctx.lineTo(t.x + Math.cos(a + 0.2) * 15, t.y + Math.sin(a + 0.2) * 15);
      ctx.lineTo(t.x + Math.cos(a + 0.4) * 9, t.y + Math.sin(a + 0.4) * 9);
      ctx.fill();
    }
    ctx.fillStyle = armed ? (Math.sin(time * 8) > 0 ? col : hexA(col, 0.4)) : '#556';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** prévia da habilidade que está sendo mirada (só o jogador local vê) */
export interface AimPreview {
  shape: 'line' | 'circle' | 'arrow' | 'self' | 'wall';
  x: number;
  y: number;
  ang: number;
  dist: number;
  range: number;
  r: number;
  w: number;
  color: string;
  label: string;
  /** o traço bateu numa parede antes do alcance */
  blocked?: boolean;
  /** o cursor passou do alcance: o ponto fica no limite */
  outOfRange?: boolean;
  /** 0–1 enquanto o poder cresce */
  charge?: number;
  /** inimigos que a área pegaria (ok) ou que a parede esconde */
  hits?: { x: number; y: number; ok: boolean }[];
}
export function drawAimPreview(ctx: Ctx, a: AimPreview, time: number) {
  const col = a.color;
  // alcance máximo
  if (a.range > 0) {
    ctx.strokeStyle = hexA(col, 0.35);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const end = a.blocked || a.outOfRange ? '#ff5a6a' : col;
  if (a.shape === 'line') {
    const len = Math.max(8, Math.min(a.range, a.dist || a.range));
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.ang);
    ctx.fillStyle = hexA(end, 0.22);
    ctx.fillRect(0, -a.w / 2, len, a.w);
    ctx.strokeStyle = hexA(end, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -a.w / 2, len, a.w);
    if (a.blocked) {
      ctx.strokeStyle = '#ff5a6a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(len, -a.w);
      ctx.lineTo(len, a.w);
      ctx.stroke();
    }
    ctx.restore();
  } else if (a.shape === 'arrow' || a.shape === 'wall') {
    const d = a.shape === 'wall' ? a.dist : Math.min(a.range, a.dist || a.range);
    const ex = a.x + Math.cos(a.ang) * d;
    const ey = a.y + Math.sin(a.ang) * d;
    ctx.strokeStyle = hexA(col, 0.9);
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.shape === 'wall') {
      const vertical = Math.abs(Math.cos(a.ang)) > Math.abs(Math.sin(a.ang));
      const w = vertical ? 22 : a.w;
      const h = vertical ? a.w : 22;
      ctx.fillStyle = hexA(col, 0.3);
      ctx.fillRect(ex - w / 2, ey - h / 2, w, h);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(ex - w / 2, ey - h / 2, w, h);
    } else {
      ctx.fillStyle = end;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a.ang) * 14, ey + Math.sin(a.ang) * 14);
      ctx.lineTo(ex + Math.cos(a.ang + 2.4) * 14, ey + Math.sin(a.ang + 2.4) * 14);
      ctx.lineTo(ex + Math.cos(a.ang - 2.4) * 14, ey + Math.sin(a.ang - 2.4) * 14);
      ctx.closePath();
      ctx.fill();
      if (a.r > 0) {
        ctx.strokeStyle = hexA(col, 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, a.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (a.shape === 'circle') {
    const d = Math.min(a.range, a.dist);
    const ex = a.x + Math.cos(a.ang) * d;
    const ey = a.y + Math.sin(a.ang) * d;
    ctx.strokeStyle = hexA(col, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = hexA(col, 0.22);
    ctx.beginPath();
    ctx.arc(ex, ey, a.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    // efeito ao redor de si
    ctx.fillStyle = hexA(col, 0.16);
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r || 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const h of a.hits ?? []) {
    ctx.strokeStyle = h.ok ? '#b6ff9a' : '#ff5a6a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.ok ? 22 : 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (a.charge !== undefined) {
    const full = a.charge >= 0.98;
    txt(ctx, a.x, a.y - 118, full ? 'CARGA CHEIA' : `CARGA ${Math.round(a.charge * 100)}%`, full ? '#ffe14a' : col, 14);
  }
  txt(ctx, a.x, a.y - 96, a.blocked ? `${a.label} · parede` : a.label, a.blocked ? '#ff5a6a' : col, 12);
}

/** ícones de estado sobre a cabeça (cor + forma + texto curto: nunca só cor) */
export function drawStatus(ctx: Ctx, game: Game, p: Player, time: number, regen = false) {
  const tags: { s: string; c: string }[] = [];
  if (p.stunT > 0) tags.push({ s: 'TONTO', c: '#ffd23e' });
  if (p.stasisT > 0) tags.push({ s: 'ESTASE', c: '#c77dff' });
  else if (p.slowT > 0) tags.push({ s: 'LENTO', c: '#9fe8ff' });
  if (p.markT > 0) tags.push({ s: 'MARCADO', c: '#ff5a3c' });
  if (p.overT > 0) tags.push({ s: 'SOBRECARGA', c: '#ffe14a' });
  if (p.dodgeT > 0) tags.push({ s: 'ESQUIVA', c: '#3ee8ff' });
  if (p.invulnT > 1) tags.push({ s: 'PROTEGIDO', c: '#ffffff' });
  if (p.exhaustT > 0) tags.unshift({ s: 'EXAUSTO — ATAQUEM!', c: '#5dffb8' });
  if (p.castT > 0 && !p.boss) tags.push({ s: 'CARREGANDO', c: '#ff8a3d' });
  if (p.rootT > 0) tags.push({ s: 'RAIZ', c: '#3dcc6a' });
  if (p.ambushT > 0) tags.push({ s: 'TOCAIA', c: '#8a7cff' });
  if (regen) tags.push({ s: '+ RECUPERANDO', c: '#5dffb8' });
  const top = p.y - (p.boss ? 150 : 98);
  tags.slice(0, 2).forEach((t, i) => txt(ctx, p.x, top - i * 14, t.s, t.c, 10));
  // marcado: mira em volta (visível de longe)
  if (p.markT > 0) {
    ctx.strokeStyle = hexA('#ff5a3c', 0.85);
    ctx.lineWidth = 2;
    const r = 30 + Math.sin(time * 8) * 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 28, r, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + time;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * (r - 6), p.y - 28 + Math.sin(a) * (r - 6));
      ctx.lineTo(p.x + Math.cos(a) * (r + 6), p.y - 28 + Math.sin(a) * (r + 6));
      ctx.stroke();
    }
  }
  if (p.castT > 0 && !p.boss) {
    ctx.strokeStyle = hexA('#ff8a3d', 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 30, 26 + Math.sin(time * 16) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.rootT > 0) {
    ctx.strokeStyle = hexA('#3dcc6a', 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.ambushT > 0) {
    ctx.strokeStyle = hexA('#8a7cff', 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 36, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.healT > 0) {
    ctx.strokeStyle = hexA('#5dffb8', 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 28, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.overT > 0) {
    ctx.strokeStyle = hexA('#ffe14a', 0.5 + 0.3 * Math.sin(time * 20));
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + time * 3;
      ctx.lineTo(p.x + Math.cos(a) * (24 + (i % 2) * 8), p.y - 30 + Math.sin(a) * (24 + (i % 2) * 8));
    }
    ctx.closePath();
    ctx.stroke();
  }
  void game;
}

/** Chefe: aura, coroa e ponto fraco (brilho nas costas) */
export function drawBossUnder(ctx: Ctx, p: Player, time: number) {
  const r = 44 + Math.sin(time * 3) * 3;
  const gr = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r * 1.5);
  gr.addColorStop(0, hexA(TEAM_COLORS[1], 0.35));
  gr.addColorStop(1, hexA(TEAM_COLORS[1], 0));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2, r * 1.5, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexA('#ff3b3b', 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 3, BOSS.hitR + 6, (BOSS.hitR + 6) * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}
export function drawBossOver(ctx: Ctx, p: Player, time: number, showWeak: boolean) {
  // coroa de espinhos
  ctx.save();
  ctx.translate(p.x, p.y - 128);
  ctx.fillStyle = '#ffd23e';
  ctx.strokeStyle = '#3a1a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 8);
  ctx.lineTo(-20, -8);
  ctx.lineTo(-9, 0);
  ctx.lineTo(0, -14);
  ctx.lineTo(9, 0);
  ctx.lineTo(20, -8);
  ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // ponto fraco: brilho nas costas (lado oposto à mira)
  if (showWeak) {
    const a = p.aim + Math.PI;
    const wx = p.x + Math.cos(a) * 30;
    const wy = p.y - 44 + Math.sin(a) * 18;
    const pulse = 7 + Math.sin(time * 9) * 2;
    ctx.fillStyle = hexA('#ffe14a', 0.35);
    ctx.beginPath();
    ctx.arc(wx, wy, pulse + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6a0';
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const aa = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? pulse * 0.5 : pulse;
      ctx.lineTo(wx + Math.cos(aa) * rr, wy + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** gerador do Chefe: torre de cristal ligada ao Chefe por um feixe */
export function drawPylon(ctx: Ctx, e: { x: number; y: number; hp: number; maxHp: number; hitFlash: number }, boss: Player | null, time: number) {
  if (boss && boss.alive) {
    ctx.strokeStyle = hexA('#ff4a5a', 0.35 + 0.2 * Math.sin(time * 10));
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time * 60;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - 50);
    ctx.lineTo(boss.x, boss.y - 60);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2030';
  ctx.strokeStyle = '#0c0818';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, 2);
  ctx.lineTo(-12, -14);
  ctx.lineTo(12, -14);
  ctx.lineTo(20, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const gr = ctx.createLinearGradient(0, -70, 0, -12);
  // clarão ao levar dano sem ctx.filter (caro): só clareia o cristal
  gr.addColorStop(0, e.hitFlash > 0 ? '#ffffff' : '#ffd0d8');
  gr.addColorStop(1, e.hitFlash > 0 ? '#ff90a8' : '#c0203a');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(0, -74 + Math.sin(time * 3) * 3);
  ctx.lineTo(12, -40);
  ctx.lineTo(0, -12);
  ctx.lineTo(-12, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const bw = 44;
  ctx.fillStyle = 'rgba(8,6,22,0.85)';
  ctx.fillRect(e.x - bw / 2 - 2, e.y - 92, bw + 4, 8);
  ctx.fillStyle = '#ff4a5a';
  ctx.fillRect(e.x - bw / 2, e.y - 90, bw * Math.max(0, e.hp / e.maxHp), 4);
  txt(ctx, e.x, e.y - 102, 'GERADOR', '#ffb0b8', 10);
}
