// O Chefe: uma criatura original (não humana) desenhada em vetor e animada por "ossos" simples:
// tronco, cabeça com mandíbula, braço-garra gigante, braço-canhão de osso, pernas pesadas e cauda.
// Origem = entre os pés, virado para a direita (o renderer espelha). Altura ≈ 150.

export interface MonsterPose {
  /** relógio (s) */
  t: number;
  /** fase do passo (rad) */
  walk: number;
  moving: boolean;
  /** 0–1: preparando um golpe (antecipação) */
  windup: number;
  /** 0–1: golpe acabou de bater (impacto, decai) */
  slam: number;
  /** 0–1: rugido (troca de fase) */
  roar: number;
  /** 0–1: acabou de levar dano */
  hurt: number;
  /** 0–1: recuo do tiro do canhão */
  shoot: number;
  stun: boolean;
  /** 1–3 */
  phase: number;
  /** 0–1: caindo derrotado */
  dead: number;
  /** ponto fraco brilhando nas costas */
  weak: boolean;
}

type C = CanvasRenderingContext2D;
const INK = '#14060e';

const PAL = {
  shell: '#4a1a34',
  shellHi: '#8a3456',
  shellLo: '#24081a',
  belly: '#2e1222',
  bone: '#e2d4bc',
  boneLo: '#9a8a70',
  flesh: '#6a2232',
};
function lavaOf(phase: number) {
  return phase >= 3 ? ['#fff2a0', '#ffb030', '#ff4a1a'] : phase === 2 ? ['#ffd08a', '#ff7a2a', '#d02a1a'] : ['#ffb08a', '#ff5a2a', '#a01a1a'];
}

function blob(g: C, pts: number[], fill: string | CanvasGradient, stroke = true, w = 2.2) {
  g.beginPath();
  const n = pts.length / 2;
  // curva suave passando pelos pontos (orgânico)
  for (let i = 0; i < n; i++) {
    const x0 = pts[((i - 1 + n) % n) * 2];
    const y0 = pts[((i - 1 + n) % n) * 2 + 1];
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(x0, y0, mx, my);
  }
  const x0 = pts[(n - 1) * 2];
  const y0 = pts[(n - 1) * 2 + 1];
  g.quadraticCurveTo(x0, y0, (x0 + pts[0]) / 2, (y0 + pts[1]) / 2);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = INK;
    g.lineWidth = w;
    g.stroke();
  }
}
function poly(g: C, pts: number[], fill: string | CanvasGradient, stroke = true) {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    g.stroke();
  }
}
function glow(g: C, x: number, y: number, r: number, inner: string, outer: string, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.4, outer);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha *= a;
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha /= a;
}
/** fissura de energia brilhando sob a carapaça */
function crack(g: C, pts: number[], col: string[], pulse: number) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = col[2];
  g.globalAlpha = 0.5 * pulse;
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = col[1];
  g.lineWidth = 2.6;
  g.stroke();
  g.strokeStyle = col[0];
  g.lineWidth = 1;
  g.stroke();
  g.restore();
}
function lin(g: C, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [k, c] of stops) gr.addColorStop(k, c);
  return gr;
}

/** perna pesada (coxa + canela invertida + garras) */
function leg(g: C, hx: number, hy: number, lift: number, fwd: number, far: boolean) {
  const shade = far ? 0.65 : 1;
  const kx = hx + 10 + fwd * 0.5;
  const ky = hy + 22 - lift * 0.5;
  const fx = hx + fwd;
  const fy = -lift;
  g.save();
  g.globalAlpha = shade < 1 ? 1 : 1;
  const thigh = lin(g, hx - 14, hy, hx + 14, hy + 20, [
    [0, far ? '#3a1028' : PAL.shellHi],
    [1, far ? '#1a0410' : PAL.shellLo],
  ]);
  blob(g, [hx - 16, hy - 6, hx + 14, hy - 8, kx + 10, ky - 2, kx + 2, ky + 8, hx - 12, hy + 14], thigh);
  // canela (osso exposto)
  blob(g, [kx - 6, ky - 4, kx + 8, ky, fx + 7, fy - 8, fx - 6, fy - 6], far ? '#5a4a3a' : lin(g, kx, ky, fx, fy, [[0, PAL.bone], [1, PAL.boneLo]]));
  // pé com 3 garras
  blob(g, [fx - 18, fy - 3, fx + 12, fy - 12, fx + 22, fy - 1, fx - 16, fy + 3], far ? '#2a0a18' : PAL.shell);
  for (let k = 0; k < 3; k++) poly(g, [fx + 8 + k * 6, fy - 4, fx + 21 + k * 6, fy - 1 - k, fx + 10 + k * 6, fy + 2], far ? '#7a6a5a' : PAL.bone);
  g.restore();
}

export function drawMonster(g: C, P: MonsterPose) {
  const lava = lavaOf(P.phase);
  const pulse = 0.65 + 0.35 * Math.sin(P.t * (P.phase >= 3 ? 9 : 4));
  const breath = Math.sin(P.t * 2.1);
  const step = P.moving ? Math.sin(P.walk) : 0;
  const stomp = P.moving ? Math.abs(Math.sin(P.walk)) : 0;
  // postura: antecipação (recua e levanta), impacto (avança e amassa), rugido (cabeça para cima)
  const rear = P.windup * 1 - P.slam * 0.8;
  const lean = (P.moving ? 0.08 : 0.03) - rear * 0.14 + P.hurt * -0.08 + (P.stun ? 0.12 : 0);
  const squash = 1 + P.slam * 0.06 - P.windup * 0.03 + breath * 0.012;
  const shake = P.roar > 0 ? Math.sin(P.t * 60) * 1.6 * P.roar : P.hurt * Math.sin(P.t * 50) * 1.2;

  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // derrota: tomba de lado e afunda
  if (P.dead > 0) {
    g.translate(0, P.dead * 10);
    g.rotate(P.dead * 1.1);
    g.globalAlpha *= 1 - Math.max(0, P.dead - 0.6) * 2.2;
  }
  g.translate(shake, 0);

  // ------------------------------------------------ pernas (a de trás primeiro)
  const hipY = -40 - stomp * 3;
  leg(g, -16, hipY, Math.max(0, -step) * 9, -step * 14 - 6, true);

  g.save();
  g.translate(0, hipY + 4);
  g.rotate(lean);
  g.scale(1 / squash, squash);
  g.translate(0, -(hipY + 4));
  const by = -stomp * 3 - breath * 1.4 + (P.stun ? 6 : 0);

  // ------------------------------------------------ cauda pesada atrás
  const tw = Math.sin(P.t * 1.6 + (P.moving ? P.walk : 0)) * 6;
  blob(
    g,
    [-38, by - 62, -66, by - 50 + tw * 0.4, -94, by - 34 + tw, -108, by - 20 + tw, -92, by - 18 + tw * 0.8, -62, by - 26, -36, by - 30],
    lin(g, -100, by - 50, -40, by - 20, [
      [0, PAL.shellLo],
      [1, PAL.shell],
    ]),
  );
  for (let k = 0; k < 3; k++) poly(g, [-54 - k * 16, by - 52 + tw * (0.3 + k * 0.25), -62 - k * 16, by - 70 + tw * (0.3 + k * 0.25), -68 - k * 16, by - 46 + tw * (0.3 + k * 0.25)], PAL.bone);

  // ------------------------------------------------ tronco corcunda (assimétrico)
  const body = lin(g, -40, by - 130, 40, by - 30, [
    [0, PAL.shellHi],
    [0.45, PAL.shell],
    [1, PAL.shellLo],
  ]);
  blob(g, [-44, by - 44, -50, by - 86, -30, by - 122, 6, by - 132, 34, by - 112, 46, by - 82, 40, by - 52, 12, by - 34, -24, by - 34], body, true, 2.6);
  // barriga mais clara e pulsando (respiração)
  blob(g, [-10, by - 44, -6, by - 80, 16, by - 92 - breath * 2, 34, by - 76, 32, by - 50, 12, by - 40], lin(g, 0, by - 90, 0, by - 40, [[0, '#5a2a3a'], [1, PAL.belly]]), false);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(-4 + k * 2, by - 52 - k * 10);
    g.quadraticCurveTo(14, by - 56 - k * 10, 32 - k * 1.5, by - 52 - k * 10);
    g.stroke();
  }
  // placas de carapaça nas costas
  const plates = [
    [-40, by - 70],
    [-30, by - 98],
    [-10, by - 118],
    [14, by - 122],
  ];
  plates.forEach(([x, y], i) => {
    blob(g, [x - 14, y + 6, x - 8, y - 12, x + 12, y - 14, x + 16, y + 2, x + 2, y + 12], lin(g, x - 14, y - 14, x + 16, y + 12, [[0, '#a04a6a'], [1, '#3a1028']]), true, 1.8);
    // espinho de osso
    poly(g, [x - 4, y - 10, x - 10 - i * 2, y - 30 - i * 3, x + 6, y - 12], PAL.bone);
  });
  // fissuras de energia
  crack(g, [-38, by - 60, -28, by - 66, -24, by - 80, -14, by - 86], lava, pulse);
  crack(g, [-20, by - 104, -8, by - 98, 2, by - 106, 14, by - 100], lava, pulse);
  crack(g, [20, by - 60, 28, by - 70, 24, by - 84], lava, pulse * 0.8);
  if (P.phase >= 2) crack(g, [-46, by - 50, -40, by - 42, -30, by - 46, -22, by - 40], lava, pulse);
  if (P.phase >= 3) crack(g, [0, by - 124, 6, by - 112, 18, by - 116, 30, by - 104, 36, by - 92], lava, pulse);

  // ------------------------------------------------ canhão de osso sobre o ombro: ataque à distância
  const cannonA = -0.32 - P.shoot * 0.25 + P.windup * -0.15;
  g.save();
  g.translate(-4, by - 120);
  g.rotate(cannonA);
  blob(g, [-8, -8, 30, -10, 54, -6, 56, 6, 28, 10, -8, 8], lin(g, 0, -10, 0, 10, [[0, '#5a2a3a'], [1, '#2a0a18']]));
  // anéis de osso
  for (let k = 0; k < 3; k++) {
    g.fillStyle = PAL.boneLo;
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(18 + k * 12, 0, 3, 10 - k, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  glow(g, 58, 0, 14 + P.shoot * 10, lava[0], lava[1], 0.6 + P.shoot * 0.4);
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(56, 0, 3, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // ponto fraco: saco de cristal nas costas (alvo dos caçadores)
  if (P.weak && P.dead <= 0) {
    const wx = -42;
    const wy = by - 92;
    const wr = 9 + Math.sin(P.t * 6) * 1.2;
    glow(g, wx, wy, wr * 2.6, '#fff6a0', 'rgba(255,225,74,0.6)', 0.8);
    blob(g, [wx - wr, wy, wx - wr * 0.3, wy - wr, wx + wr * 0.6, wy - wr * 0.7, wx + wr, wy + 2, wx, wy + wr], lin(g, wx, wy - wr, wx, wy + wr, [[0, '#fffbd0'], [1, '#ffb020']]), true, 1.6);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(wx - 3, wy - 4);
    g.lineTo(wx + 2, wy - 6);
    g.stroke();
  }

  // ------------------------------------------------ cabeça com mandíbula (para a frente e baixa)
  const jaw = Math.max(P.roar, P.windup * 0.7, P.slam * 0.4, P.hurt * 0.3, (Math.sin(P.t * 1.3) * 0.5 + 0.5) * 0.08);
  const headUp = P.roar * -0.35 + P.windup * -0.12 + (P.stun ? 0.25 : 0) + P.slam * 0.12;
  g.save();
  g.translate(30, by - 96);
  g.rotate(headUp);
  // pescoço grosso
  blob(g, [-16, 14, -10, -12, 14, -14, 18, 12], PAL.shell);
  // mandíbula de baixo (abre)
  g.save();
  g.translate(8, 8);
  g.rotate(jaw * 1.0);
  blob(g, [-4, -2, 40, 0, 52, 6, 40, 16, 4, 14], lin(g, 0, 0, 0, 16, [[0, PAL.flesh], [1, PAL.shellLo]]));
  for (let k = 0; k < 5; k++) poly(g, [12 + k * 7.5, 0, 15 + k * 7.5, -7 - (k % 2) * 3, 18 + k * 7.5, 0], PAL.bone);
  g.restore();
  // garganta brilhando quando abre
  if (jaw > 0.15) glow(g, 30, 12, 24 * jaw, lava[0], lava[1], jaw);
  // crânio
  blob(g, [-8, 8, -10, -14, 8, -26, 36, -24, 58, -10, 60, 4, 42, 10, 12, 12], lin(g, 0, -26, 0, 12, [[0, PAL.shellHi], [0.6, PAL.shell], [1, PAL.shellLo]]), true, 2.4);
  // dentes de cima
  for (let k = 0; k < 6; k++) poly(g, [16 + k * 7, 9, 19 + k * 7, 18 + (k % 2) * 3, 22 + k * 7, 9], PAL.bone);
  // chifres
  poly(g, [6, -20, -6, -46, 2, -44, 18, -22], lin(g, 0, -46, 0, -20, [[0, '#fff6e8'], [1, PAL.boneLo]]));
  poly(g, [24, -24, 26, -40, 32, -38, 34, -22], PAL.bone);
  // placa de osso na testa
  blob(g, [10, -18, 24, -26, 44, -18, 40, -10, 18, -10], lin(g, 10, -26, 40, -10, [[0, '#fff2dc'], [1, PAL.boneLo]]), true, 1.6);
  // olhos: um grande e dois pequenos, brilhando
  const eyeA = P.dead > 0 ? 0.15 : P.stun ? 0.35 : 1;
  const eyeCol = P.phase >= 3 ? '#fff6c0' : '#ff4a3a';
  for (const [ex, ey, er] of [
    [44, -4, 6.5],
    [32, -2, 3.6],
    [54, 2, 3],
  ] as const) {
    glow(g, ex, ey, er * 3.2, '#ffffff', eyeCol, eyeA * (0.6 + 0.4 * pulse));
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(ex, ey, er, er * 0.75, -0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = eyeCol;
    g.globalAlpha *= eyeA;
    g.beginPath();
    g.ellipse(ex, ey, er * 0.75, er * 0.55, -0.2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha /= eyeA;
    g.fillStyle = INK;
    g.fillRect(ex - 0.8, ey - er * 0.5, 1.6, er);
  }
  g.restore();

  // ------------------------------------------------ braço-garra gigante (lado da frente)
  // antecipação: sobe; impacto: bate no chão; parado: balança devagar
  const armA = 0.55 - P.windup * 1.7 + P.slam * 0.9 + (P.moving ? -step * 0.25 : Math.sin(P.t * 2.1) * 0.05) + (P.stun ? 0.4 : 0);
  g.save();
  g.translate(18, by - 88);
  g.rotate(armA);
  // ombro com placa
  blob(g, [-18, -14, 10, -20, 22, -4, 12, 14, -16, 12], lin(g, -18, -20, 22, 14, [[0, '#b04a72'], [1, '#3a1028']]), true, 2.2);
  poly(g, [-6, -16, -2, -32, 8, -18], PAL.bone);
  // antebraço enorme
  blob(g, [4, -10, 44, -14, 70, -8, 74, 10, 44, 16, 6, 12], lin(g, 0, -14, 0, 16, [[0, PAL.shellHi], [0.5, PAL.shell], [1, PAL.shellLo]]), true, 2.4);
  crack(g, [18, -2, 30, 2, 44, -4, 58, 0], lava, pulse);
  // garras
  for (let k = 0; k < 3; k++) {
    const ca = -0.5 + k * 0.45 + P.slam * 0.2;
    g.save();
    g.translate(70, k * 8 - 6);
    g.rotate(ca);
    poly(g, [0, -4, 26, -2 + k, 30, 2, 0, 5], lin(g, 0, -4, 0, 5, [[0, '#fffbf0'], [1, PAL.boneLo]]));
    g.restore();
  }
  // brilho do golpe carregado
  if (P.windup > 0.1) glow(g, 80, 0, 30 * P.windup, lava[0], lava[1], P.windup);
  g.restore();

  g.restore(); // tronco
  // perna da frente por cima
  leg(g, 10, hipY, Math.max(0, step) * 9, step * 14 + 6, false);

  // tontura: cabeça baixa + estrelas são desenhadas pelo HUD de estados
  g.restore();
}
