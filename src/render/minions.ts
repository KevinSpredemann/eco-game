// Criaturas do Chefe (modo Caça ao Chefe), poças de ácido, caixas de cobertura e pontos de recurso.
// Mesmo estilo do monstro: corpo escuro, placas de osso, olhos acesos e contorno grosso.
type Ctx = CanvasRenderingContext2D;

const OUT = '#1b1233';
const BONE = '#d9cbb0';
const BONE_D = '#8f7f68';

export const MINION_LOOK: Record<string, { body: string; dark: string; glow: string; role: string }> = {
  rastejador: { body: '#6a3a58', dark: '#2e1428', glow: '#ff8a3e', role: 'RÁPIDO' },
  carapaca: { body: '#4a4a62', dark: '#1e1e30', glow: '#7ad0ff', role: 'TANQUE' },
  cuspidor: { body: '#4f6a3a', dark: '#1f2c14', glow: '#b6ff3e', role: 'ATIRADOR' },
  xama: { body: '#3a5a6a', dark: '#14262e', glow: '#5effb0', role: 'CURANDEIRO' },
  semeador: { body: '#5a5a2a', dark: '#26260e', glow: '#d8ff3e', role: 'ÁCIDO' },
};

export function isMinion(kind: string) {
  return kind in MINION_LOOK;
}

// sem shadowBlur (caro no canvas): um halo translúcido barato no lugar
function eyes(g: Ctx, x: number, y: number, n: number, col: string, s = 2.6) {
  for (let i = 0; i < n; i++) {
    const ex = x + (i - (n - 1) / 2) * s * 2.4;
    const ey = y + (i % 2) * 1.5;
    g.globalAlpha = 0.3;
    g.fillStyle = col;
    g.beginPath();
    g.arc(ex, ey, s * 2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(ex, ey, s, 0, Math.PI * 2);
    g.fill();
  }
}

function blob(g: Ctx, rx: number, ry: number, cy: number, top: string, bot: string) {
  const gr = g.createLinearGradient(0, cy - ry, 0, cy + ry);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.strokeStyle = OUT;
  g.lineWidth = 2.5;
  g.beginPath();
  g.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

/** desenha uma criatura na posição (já com sombra e barra de vida) */
export function drawMinion(g: Ctx, e: any, time: number) {
  const L = MINION_LOOK[e.kind];
  const r = e.r ?? 18;
  const face = Math.cos(e.dir) >= 0 ? 1 : -1;
  const walk = Math.sin(time * 10 + e.id * 1.3);
  const charging = e.chargeT > 0;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(e.x, e.y + 3, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
  g.fill();
  // aviso de ataque: anel pulsando no chão
  if (charging) {
    const k = 0.5 + 0.5 * Math.sin(time * 18);
    g.strokeStyle = `rgba(255,90,60,${0.45 + k * 0.45})`;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(e.x, e.y + 2, r * 1.5, r * 0.6, 0, 0, Math.PI * 2);
    g.stroke();
    if (e.kind === 'cuspidor' || e.kind === 'rastejador') {
      g.setLineDash([8, 7]);
      g.strokeStyle = `rgba(255,120,60,${0.35 + k * 0.4})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(e.x, e.y - r);
      g.lineTo(e.x + Math.cos(e.dir) * (e.kind === 'cuspidor' ? 260 : 150), e.y - r + Math.sin(e.dir) * (e.kind === 'cuspidor' ? 260 : 150));
      g.stroke();
      g.setLineDash([]);
    }
  }
  if (e.kind === 'xama') {
    // aura de cura
    const k = (time * 0.8 + e.id * 0.3) % 1;
    g.strokeStyle = `rgba(94,255,176,${0.5 * (1 - k)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(e.x, e.y, 20 + k * 60, (20 + k * 60) * 0.4, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const lunge = charging ? 8 + Math.sin(time * 16) * 3 : 0;
  g.save();
  g.translate(e.x + Math.cos(e.dir) * lunge, e.y + Math.sin(e.dir) * lunge * 0.35 + (e.hitFlash > 0 ? 3 : 0));
  if (e.hitFlash > 0) g.scale(1.08, 0.9);
  // um pouco maiores que o tamanho de colisão: leitura mais fácil no meio da luta
  g.scale(face * 1.25, 1.25);
  switch (e.kind) {
    case 'rastejador': {
      const crouch = charging ? 5 : 0;
      // pernas de aranha
      g.strokeStyle = OUT;
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = walk * (i % 2 ? 1 : -1) * 3;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(-4 + i * 6, -10 + crouch);
          g.lineTo(-4 + i * 6 + s * 10, -18 + crouch + ph);
          g.lineTo(-4 + i * 6 + s * 15, -1);
          g.stroke();
        }
      }
      blob(g, 15, 9, -12 + crouch, L.body, L.dark);
      // placas nas costas
      g.fillStyle = BONE;
      g.strokeStyle = OUT;
      g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-10 + i * 7, -18 + crouch);
        g.lineTo(-6 + i * 7, -27 + crouch);
        g.lineTo(-2 + i * 7, -18 + crouch);
        g.closePath();
        g.fill();
        g.stroke();
      }
      eyes(g, 11, -13 + crouch, 3, L.glow, 1.8);
      break;
    }
    case 'carapaca': {
      // pernas grossas
      g.fillStyle = L.dark;
      g.strokeStyle = OUT;
      g.lineWidth = 2.5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.roundRect(s * 11 - 5, -14 + walk * s * 1.5, 10, 14, 3);
        g.fill();
        g.stroke();
      }
      blob(g, 22, 18, -26, L.body, L.dark);
      // escudo de osso na frente (lado para onde olha)
      const gr = g.createLinearGradient(10, -48, 30, -6);
      gr.addColorStop(0, '#f1e6cf');
      gr.addColorStop(1, BONE_D);
      g.fillStyle = gr;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(14, -50);
      g.quadraticCurveTo(34, -28, 14, -4);
      g.quadraticCurveTo(22, -28, 14, -50);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(122,208,255,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(20, -40);
      g.lineTo(24, -28);
      g.lineTo(20, -16);
      g.stroke();
      eyes(g, 6, -32, 2, L.glow, 2.4);
      break;
    }
    case 'cuspidor': {
      g.strokeStyle = OUT;
      g.lineWidth = 3;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 6, -10);
        g.lineTo(s * 9 + walk * s * 2, 0);
        g.stroke();
      }
      blob(g, 14, 16, -24, L.body, L.dark);
      // saco de ácido nas costas
      const pulse = charging ? 1 + 0.15 * Math.sin(time * 20) : 1;
      g.fillStyle = 'rgba(182,255,62,0.85)';
      g.strokeStyle = OUT;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(-10, -30, 9 * pulse, 11 * pulse, -0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // boca/tubo
      g.fillStyle = L.dark;
      g.beginPath();
      g.roundRect(8, -30, 12, 8, 3);
      g.fill();
      g.stroke();
      if (charging) eyes(g, 21, -26, 1, L.glow, 4);
      eyes(g, 3, -34, 2, '#ffde3e', 2);
      break;
    }
    case 'xama': {
      // manto + cajado
      const gr = g.createLinearGradient(0, -46, 0, 0);
      gr.addColorStop(0, L.body);
      gr.addColorStop(1, L.dark);
      g.fillStyle = gr;
      g.strokeStyle = OUT;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-13, 0);
      g.quadraticCurveTo(-16, -26, 0, -42);
      g.quadraticCurveTo(16, -26, 13, 0);
      g.closePath();
      g.fill();
      g.stroke();
      // chifres de osso
      g.fillStyle = BONE;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 4, -40);
        g.quadraticCurveTo(s * 14, -52, s * 8, -58);
        g.quadraticCurveTo(s * 9, -48, s * 1, -42);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.strokeStyle = '#5a3a20';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(18, -50);
      g.stroke();
      eyes(g, 18, -53, 1, L.glow, 5 + Math.sin(time * 5));
      eyes(g, 3, -32, 2, L.glow, 2);
      break;
    }
    default: {
      // semeador: bolota lenta com bolsas de ácido
      g.fillStyle = L.dark;
      g.strokeStyle = OUT;
      g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(-12 + i * 8, -3 + (i % 2 ? walk : -walk) * 1.5, 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      blob(g, 19, 15, -20, L.body, L.dark);
      for (const [x, y, s] of [
        [-8, -28, 6],
        [5, -31, 5],
        [-1, -18, 4],
      ]) {
        g.fillStyle = `rgba(216,255,62,${0.65 + 0.25 * Math.sin(time * 4 + x)})`;
        g.strokeStyle = OUT;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      eyes(g, 12, -22, 2, '#ff6a3e', 2);
    }
  }
  g.restore();
  // clarão ao levar dano: um brilho por cima (sem ctx.filter, que é caro em cada traço)
  if (e.hitFlash > 0) {
    g.globalAlpha = Math.min(0.55, e.hitFlash * 3);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(e.x, e.y - r * 1.2, r * 1.1, r * 1.2, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (e.stunT > 0) {
    g.fillStyle = '#ffd23e';
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3;
      g.beginPath();
      g.arc(e.x + Math.cos(a) * 14, e.y - r * 2.6 + Math.sin(a) * 4, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // vida + função
  const h = e.kind === 'carapaca' ? 76 : e.kind === 'xama' ? 82 : e.kind === 'rastejador' ? 44 : 64;
  const bw = 34;
  const by = e.y - h;
  g.fillStyle = 'rgba(8,6,22,0.85)';
  g.beginPath();
  g.roundRect(e.x - bw / 2 - 2, by - 2, bw + 4, 7, 3);
  g.fill();
  g.fillStyle = '#ff6a5a';
  g.beginPath();
  g.roundRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 3, 1.5);
  g.fill();
  g.font = '700 9px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  const t = L.role;
  const tw = g.measureText(t).width + 8;
  g.fillStyle = 'rgba(10,8,24,0.78)';
  g.beginPath();
  g.roundRect(e.x - tw / 2, by - 15, tw, 12, 4);
  g.fill();
  g.fillStyle = L.glow;
  g.fillText(t, e.x, by - 4.5);
}

/** poças de ácido: primeiro um aviso tracejado, depois o ácido borbulhando */
export function drawPools(g: Ctx, pools: any[], time: number) {
  for (const p of pools) {
    const fade = Math.min(1, p.t * 1.5);
    if (p.armT > 0) {
      const k = 0.5 + 0.5 * Math.sin(time * 14);
      g.strokeStyle = `rgba(216,255,62,${0.35 + 0.45 * k})`;
      g.lineWidth = 2.5;
      g.setLineDash([7, 6]);
      g.beginPath();
      g.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = `rgba(216,255,62,${0.08 + 0.08 * k})`;
      g.fill();
      continue;
    }
    g.globalAlpha = fade;
    const gr = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    gr.addColorStop(0, 'rgba(196,255,60,0.55)');
    gr.addColorStop(0.75, 'rgba(120,200,30,0.4)');
    gr.addColorStop(1, 'rgba(80,140,20,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(216,255,62,0.6)';
    g.lineWidth = 1.5;
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const k = (time * 0.9 + i * 0.27 + p.id * 0.13) % 1;
      const a = i * 2.1 + p.id;
      g.strokeStyle = `rgba(230,255,140,${0.8 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.25 - k * 6, 2 + k * 3, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

/** caixa de cobertura destrutível */
export function drawCrate(g: Ctx, w: any) {
  const hp = w.maxHp ? Math.max(0, w.hp / w.maxHp) : 1;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(w.x + 4, w.y + 6, w.w, w.h);
  const gr = g.createLinearGradient(w.x, w.y - 14, w.x, w.y + w.h);
  gr.addColorStop(0, '#9a7a52');
  gr.addColorStop(1, '#4e3a24');
  g.fillStyle = gr;
  g.strokeStyle = '#1e140c';
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(w.x, w.y - 14, w.w, w.h + 14, 4);
  g.fill();
  g.stroke();
  // tampa
  g.fillStyle = '#b8966a';
  g.beginPath();
  g.roundRect(w.x, w.y - 14, w.w, 10, 4);
  g.fill();
  g.stroke();
  // reforços de metal
  g.strokeStyle = '#3a3a44';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(w.x + 6, w.y - 4);
  g.lineTo(w.x + w.w - 6, w.y + w.h - 3);
  g.moveTo(w.x + w.w - 6, w.y - 4);
  g.lineTo(w.x + 6, w.y + w.h - 3);
  g.stroke();
  // rachaduras conforme apanha
  if (hp < 0.7) {
    g.strokeStyle = '#1e140c';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(w.x + w.w * 0.3, w.y - 4);
    g.lineTo(w.x + w.w * 0.4, w.y + w.h * 0.4);
    g.lineTo(w.x + w.w * 0.32, w.y + w.h * 0.7);
    if (hp < 0.4) {
      g.moveTo(w.x + w.w * 0.75, w.y);
      g.lineTo(w.x + w.w * 0.62, w.y + w.h * 0.5);
    }
    g.stroke();
  }
  if (w.maxHp && hp < 1) {
    const bw = Math.max(30, w.w * 0.7);
    const bx = w.x + w.w / 2 - bw / 2;
    const by = w.y - 24;
    g.fillStyle = 'rgba(8,6,22,0.8)';
    g.fillRect(bx - 1, by - 1, bw + 2, 5);
    g.fillStyle = hp > 0.4 ? '#e8c27a' : '#ff7a4a';
    g.fillRect(bx, by, bw * hp, 3);
  }
}

/** ponto de recurso: base no chão onde cura/escudo reaparecem */
export function drawResSpot(g: Ctx, x: number, y: number, time: number) {
  g.fillStyle = 'rgba(20,40,40,0.45)';
  g.beginPath();
  g.ellipse(x, y + 4, 26, 11, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = `rgba(110,255,200,${0.35 + 0.2 * Math.sin(time * 3)})`;
  g.lineWidth = 2;
  g.setLineDash([5, 5]);
  g.lineDashOffset = -time * 12;
  g.beginPath();
  g.ellipse(x, y + 4, 26, 11, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineDashOffset = 0;
  g.fillStyle = 'rgba(110,255,200,0.55)';
  g.fillRect(x - 6, y + 2.5, 12, 3);
  g.fillRect(x - 1.5, y - 2, 3, 12);
}
