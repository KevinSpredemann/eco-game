import { ARENA_SCALE, ArenaDef, BORDER, VIEW_H, VIEW_W, WORLD_H, WORLD_W, beamAngle, bridgeState, cameraFocus, laserX, pistonState, tornadoPos, trainState, windState } from '../game/arenas';
import { tuneGlow, tuneHides, tuneShapes, type TuneShape } from '../game/mapTune';
import { CHARACTERS, getCharacter } from '../game/characters';
import * as C from '../game/constants';
import { ENEMY_STATS, TEAM_COLORS } from '../game/sim';
import type { EchoView, Game, GameEvent, Player } from '../game/sim';
import { PowerId, getPower } from '../game/powerups';
import { WEAPONS, BOMB_FUSE, BOMB_RADIUS, MAX_HP, GUN_Y, PULSE_FUSE, PULSE_RADIUS } from '../game/weapons';
import { ELEMENT_COLOR, type Element } from '../game/elements';
import { TRAILS } from '../game/economy';
import { sampleRecording } from '../systems/echo/recorder';
import { BOSS, SKILLS, ULTS } from '../game/balance';
import { drawMonster } from './monster';
import { drawMarkIcon, drawRouteAhead, drawRoutePreview, traceRoute } from './echoFx';
import { digestAt, type EchoDigest } from '../systems/echo/digest';
import { drawCrate, drawMinion, drawPools, drawResSpot, isMinion } from './minions';
import { corpsePose, gritSpecks } from './visuals';
import { AimPreview, drawAimPreview, drawBossOver, drawBossUnder, drawCastsGround, drawPylon, drawStatus, drawTraps } from './combatFx';
import { screenToWorld, viewFromLetterbox, type WorldView } from '../game/aimService';
import { Expr, SpriteCache, WALK_FRAMES, drawCharacter, drawSymbol, facingOf, rr } from './sprites';
import { AbilityVfx } from './abilityVfx';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'ring' | 'text' | 'glow';
  text?: string;
};

const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
const SPRITE_SCALE = 1.2;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Renderer {
  /** prévia da habilidade sendo mirada pelo jogador local */
  aimPreview: AimPreview | null = null;
  /** linha de mira do analógico direito (celular): direção e se o dedo está segurando */
  aimGuide: { ang: number; held: boolean; color: string } | null = null;
  /** feixes disparados (efeito visual curto) */
  private beams: { x: number; y: number; ang: number; len: number; w: number; t: number; color: string }[] = [];
  /** animações de combate por jogador (recuo do tiro, pose de lançar) e do Chefe */
  private anim = new Map<string, { recoil: number; cast: number; windup: number; slam: number; roar: number; hurt: number; shoot: number }>();
  /** quem caiu: animação de queda */
  private falls: { p: Player; x: number; y: number; flip: boolean; t: number; boss: boolean }[] = [];
  private corpses: { x: number; y: number; t: number; kind: string }[] = [];
  private moteAt = 0;
  /** de onde veio o dano que o jogador local levou (arcos em volta dele) */
  private hitDirs: { ang: number; t: number; src: string }[] = [];
  /** quando cada jogador levou dano por último (para mostrar a recuperação) */
  private lastHit = new Map<string, number>();
  private animOf(id: string) {
    let a = this.anim.get(id);
    if (!a) {
      a = { recoil: 0, cast: 0, windup: 0, slam: 0, roar: 0, hurt: 0, shoot: 0 };
      this.anim.set(id, a);
    }
    return a;
  }
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  private base: HTMLCanvasElement | null = null;
  private sky: HTMLCanvasElement | null = null;
  private arena: ArenaDef | null = null;
  private sprites = new SpriteCache();
  private particles: Particle[] = [];
  private shake = 0;
  /** tremor já aplicado no quadro, para o clique cair no mesmo lugar desenhado */
  private drawnShakeX = 0;
  private drawnShakeY = 0;
  private flash = 0;
  private flashColor = '#fff';
  private echoWasActive = new Map<string, boolean>();
  reducedEffects = false;
  private finisher: { x: number; y: number; until: number; span: number; id: string } | null = null;
  private bodyLean = new Map<string, number>();

  noteFinisher(x: number, y: number, seconds: number, id: string) {
    const now = performance.now() / 1000;
    this.finisher = { x, y, until: now + seconds, span: seconds, id };
  }
  readonly abilityFx = new AbilityVfx();
  /** limite de densidade de pixels (qualidade gráfica) */
  dprCap = 3;
  /** qualidade gráfica: alta = tudo; média = menos pixels; baixa = sem luz pré-calculada e menos partículas */
  setQuality(q: 'alta' | 'media' | 'baixa') {
    this.dprCap = q === 'alta' ? 3 : q === 'media' ? 1.5 : 1;
    this.sprites.setLighting(q !== 'baixa');
    this.arenaLighting = q !== 'baixa';
  }
  showTrails = true;
  private cssW = 0;
  private cssH = 0;
  private padTop = 0;
  private padBottom = 0;
  private lookX = WORLD_W / 2;
  private lookY = WORLD_H / 2;
  /** vitrine chama setView e a câmera de jogo não empurra o enquadramento */
  private viewLock = false;
  /** câmera de espectador: segue este id enquanto o jogador local está morto */
  followId: string | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, padTop = 0, padBottom = 0) {
    // alta densidade (até 3x) mas limitando o total de pixels para não pesar
    const maxPx = 9_000_000;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap, Math.sqrt(maxPx / Math.max(1, w * h)));
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.padTop = padTop;
    this.padBottom = padBottom;
    const availH = h - padTop - padBottom;
    // o zoom continua o da arena antiga: o mapa maior aparece andando, sem encolher o personagem
    this.scale = Math.min(w / VIEW_W, availH / VIEW_H);
    this.sprites.setScale(this.scale * this.dpr * SPRITE_SCALE);
    this.applyLook();
    if (this.arena) this.buildBase(this.arena);
  }

  /** enquadra lookX/lookY no centro do vão, sem desenhar fora do mundo */
  private applyLook() {
    const availH = Math.max(1, this.cssH - this.padTop - this.padBottom);
    const visW = this.scale > 0 ? this.cssW / this.scale : VIEW_W;
    const visH = this.scale > 0 ? availH / this.scale : VIEW_H;
    const c = cameraFocus(this.lookX, this.lookY, visW, visH);
    this.ox = this.cssW / 2 - c.x * this.scale;
    this.oy = this.padTop + availH / 2 - c.y * this.scale;
  }

  lookAt(x: number, y: number) {
    this.lookX = x;
    this.lookY = y;
    this.viewLock = false;
    if (this.cssW > 0) this.applyLook();
  }

  /** vitrine (tela inicial): ninguém é "você" — sem rótulo, sem tremor/flash nem setas de dano */
  showcase = false;
  private meId(game: Game) {
    return this.showcase ? '\u0000' : game.human.id;
  }

  /** câmera fixa da vitrine: escala e deslocamento definidos de fora (só reconstrói o chão se a escala mudar) */
  setView(scale: number, ox: number, oy: number) {
    this.viewLock = true;
    this.scale = scale;
    // chão e desenhos dos personagens só são refeitos quando o zoom muda bastante (zoom suave sem travar)
    if (!this.builtScale || Math.abs(scale / this.builtScale - 1) > 0.3) {
      this.builtScale = scale;
      this.sprites.setScale(scale * this.dpr * SPRITE_SCALE);
      if (this.arena) this.buildBase(this.arena);
    }
    this.ox = ox;
    this.oy = oy;
  }
  private builtScale = 0;
  get viewScale() {
    return this.scale;
  }

  setArena(a: ArenaDef) {
    this.arena = a;
    this.particles = [];
    this.corpses = [];
    this.echoWasActive.clear();
    this.buildBase(a);
  }

  /** A mesma vista do quadro: retângulo do canvas, letterbox, zoom e tremor. */
  worldView(): WorldView {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = this.cssW || rect.width || this.canvas.clientWidth || 1;
    const cssH = this.cssH || rect.height || this.canvas.clientHeight || 1;
    return viewFromLetterbox({
      left: rect.left,
      top: rect.top,
      cssW,
      cssH,
      bufW: this.canvas.width,
      bufH: this.canvas.height,
      ox: this.ox + this.drawnShakeX,
      oy: this.oy + this.drawnShakeY,
      scale: this.scale || 1,
    });
  }

  /** converte coordenadas de tela (css px do viewport) para o mundo */
  toWorld(x: number, y: number) {
    return screenToWorld(x, y, this.worldView());
  }

  // ======================================================== camada estática
  private buildBase(a: ArenaDef) {
    this.base = this.renderArenaBase(a, this.scale * this.dpr);
  }

  /** Desenha a arena estática em qualquer resolução (também usado nas miniaturas dos mapas). */
  renderArenaBase(a: ArenaDef, px: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(WORLD_W * px);
    cv.height = Math.ceil(WORLD_H * px);
    const g = cv.getContext('2d')!;
    g.scale(px, px);
    const P = a.palette;
    const rand = seeded(a.id.length * 977 + a.id.charCodeAt(0));

    // fundo fora do piso
    if (a.id === 'cidade') {
      const sky = g.createLinearGradient(0, 0, 0, WORLD_H);
      sky.addColorStop(0, '#7fb6ff');
      sky.addColorStop(0.6, '#b3a6ff');
      sky.addColorStop(1, '#ffc6a8');
      g.fillStyle = sky;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let i = 0; i < 26; i++) {
        const x = rand() * WORLD_W;
        const y = rand() * WORLD_H;
        const r = 30 + rand() * 60;
        g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.35})`;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + k * r * 0.6, y + Math.sin(k) * 8, r * (0.6 + rand() * 0.4), 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (a.id === 'espaco') {
      g.fillStyle = P.bg;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      for (const [x, y, r, c] of [
        [300, 200, 380, 'rgba(160,60,255,0.22)'],
        [1000, 520, 420, 'rgba(255,60,200,0.16)'],
        [700, 100, 260, 'rgba(60,140,255,0.18)'],
      ] as const) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, c);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, WORLD_W, WORLD_H);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
        const s = rand() < 0.1 ? 2.2 : 1.1;
        g.fillRect(rand() * WORLD_W, rand() * WORLD_H, s, s);
      }
    } else {
      g.fillStyle = P.bg;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // piso
    const floorRects = a.islands ?? [{ x: BORDER, y: BORDER, w: WORLD_W - BORDER * 2, h: WORLD_H - BORDER * 2 }];
    for (const fr of floorRects) {
      if (a.islands) {
        // parte de baixo da ilha flutuante
        g.fillStyle = '#5a3d2a';
        g.beginPath();
        g.moveTo(fr.x + 6, fr.y + fr.h);
        g.lineTo(fr.x + fr.w * 0.25, fr.y + fr.h + 40);
        g.lineTo(fr.x + fr.w * 0.5, fr.y + fr.h + 64);
        g.lineTo(fr.x + fr.w * 0.78, fr.y + fr.h + 36);
        g.lineTo(fr.x + fr.w - 6, fr.y + fr.h);
        g.closePath();
        g.fill();
        g.fillStyle = '#3d281b';
        g.fillRect(fr.x, fr.y + fr.h - 4, fr.w, 16);
      }
      g.save();
      g.beginPath();
      rr(g, fr.x, fr.y, fr.w, fr.h, a.islands ? 18 : 0);
      g.clip();
      if (a.id === 'espaco') g.globalAlpha = 0.88;
      const T = a.id === 'templo' ? 60 : a.id === 'fabrica' ? 48 : a.id === 'deserto' ? 64 : a.id === 'metro' ? 48 : 40;
      for (let y = fr.y; y < fr.y + fr.h; y += T)
        for (let x = fr.x; x < fr.x + fr.w; x += T) {
          g.fillStyle = (Math.floor(x / T) + Math.floor(y / T)) % 2 ? P.floorA : P.floorB;
          g.fillRect(x, y, T, T);
        }
      g.globalAlpha = 1;
      g.strokeStyle = P.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = fr.x; x <= fr.x + fr.w; x += T) {
        g.moveTo(x, fr.y);
        g.lineTo(x, fr.y + fr.h);
      }
      for (let y = fr.y; y <= fr.y + fr.h; y += T) {
        g.moveTo(fr.x, y);
        g.lineTo(fr.x + fr.w, y);
      }
      g.stroke();
      g.fillStyle = '#1a1428';
      for (const s of gritSpecks((a.id.charCodeAt(0) + Math.floor(fr.x)) >>> 0, 110, fr.w, fr.h)) {
        g.globalAlpha = s.a;
        g.beginPath();
        g.ellipse(fr.x + s.x, fr.y + s.y, s.r, s.r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      this.decorate(g, a, fr, rand);
      g.restore();
      if (a.islands) {
        g.strokeStyle = '#7ee0a0';
        g.lineWidth = 4;
        g.beginPath();
        rr(g, fr.x, fr.y, fr.w, fr.h, 18);
        g.stroke();
      }
    }

    // gelo escorregadio
    for (const r of a.ice ?? []) {
      const gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      gr.addColorStop(0, '#bfe8ff');
      gr.addColorStop(0.5, '#e8f8ff');
      gr.addColorStop(1, '#a8dcff');
      g.fillStyle = gr;
      rr(g, r.x, r.y, r.w, r.h, 26);
      g.fill();
      g.strokeStyle = 'rgba(80,160,220,0.7)';
      g.lineWidth = 3;
      g.stroke();
      g.save();
      rr(g, r.x, r.y, r.w, r.h, 26);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 2;
      for (let i = 0; i < r.w / 40; i++) {
        const x = r.x + rand() * r.w;
        const y = r.y + rand() * r.h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 30 + rand() * 30, y - 12 - rand() * 10);
        g.stroke();
      }
      g.strokeStyle = 'rgba(70,130,190,0.35)';
      g.lineWidth = 1;
      for (let i = 0; i < r.w / 60; i++) {
        let x = r.x + rand() * r.w;
        let y = r.y + rand() * r.h;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rand() - 0.5) * 40;
          y += (rand() - 0.5) * 30;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();
    }
    // areia movediça
    for (const c of a.sand ?? []) {
      const gr = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.r);
      gr.addColorStop(0, '#6a4420');
      gr.addColorStop(0.6, '#9a6a34');
      gr.addColorStop(1, 'rgba(180,130,70,0.2)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(70,40,15,0.45)';
      g.lineWidth = 2;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.arc(c.x, c.y, (c.r * k) / 3.6, k, k + Math.PI * 1.3);
        g.stroke();
      }
    }
    // trilhos do metrô
    for (const tr of a.trains ?? []) {
      g.fillStyle = '#0c0a18';
      g.fillRect(BORDER, tr.y, WORLD_W - BORDER * 2, tr.h);
      g.fillStyle = '#2a2236';
      for (let x = BORDER; x < WORLD_W - BORDER; x += 22) g.fillRect(x, tr.y + 6, 10, tr.h - 12);
      g.fillStyle = '#9aa0b4';
      g.fillRect(BORDER, tr.y + tr.h * 0.3, WORLD_W - BORDER * 2, 3);
      g.fillRect(BORDER, tr.y + tr.h * 0.7 - 3, WORLD_W - BORDER * 2, 3);
      stripes(g, BORDER, tr.y - 6, WORLD_W - BORDER * 2, 6, '#ffd23e', '#1a1208');
      stripes(g, BORDER, tr.y + tr.h, WORLD_W - BORDER * 2, 6, '#ffd23e', '#1a1208');
    }

    // marcas das zonas de perigo (o jogador sabe onde podem surgir)
    for (const z of a.zones) {
      g.save();
      g.setLineDash([6, 8]);
      g.strokeStyle = hexA(P.hazard, 0.32);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = hexA(P.hazard, 0.05);
      g.fill();
      g.fillStyle = hexA(P.hazard, 0.35);
      g.font = `700 16px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(a.zoneStyle === 'meteoro' ? '☄' : a.zoneStyle === 'avalanche' ? '❄' : a.zoneStyle === 'tempestade' ? '≋' : '⚡', z.x, z.y);
      g.restore();
    }

    // locais possíveis do núcleo
    for (const c of a.cores) {
      g.strokeStyle = hexA(P.accent, 0.14);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, C.CORE_R - 8, 0, Math.PI * 2);
      g.stroke();
    }

    // esteiras (estrutura)
    for (const cv2 of a.conveyors ?? []) {
      g.fillStyle = '#1b1411';
      g.fillRect(cv2.x, cv2.y, cv2.w, cv2.h);
      g.strokeStyle = '#5a4436';
      g.lineWidth = 4;
      g.strokeRect(cv2.x, cv2.y, cv2.w, cv2.h);
    }
    // carcaça dos pistões
    for (const p of a.pistons ?? []) {
      g.fillStyle = '#2b201a';
      g.fillRect(p.x - 6, p.y - 26, p.w + 12, 26);
      stripes(g, p.x - 6, p.y - 26, p.w + 12, 8, '#ffb000', '#1a1208');
      g.strokeStyle = hexA(P.hazard, 0.3);
      g.setLineDash([5, 6]);
      g.strokeRect(p.x, p.y, p.w, p.h);
      g.setLineDash([]);
    }

    // borda externa
    if (!a.islands) {
      g.fillStyle = P.wall;
      g.fillRect(0, 0, WORLD_W, BORDER);
      g.fillRect(0, WORLD_H - BORDER, WORLD_W, BORDER);
      g.fillRect(0, 0, BORDER, WORLD_H);
      g.fillRect(WORLD_W - BORDER, 0, BORDER, WORLD_H);
      g.fillStyle = P.wallTop;
      g.fillRect(0, 0, WORLD_W, BORDER - 8);
      g.strokeStyle = P.wallEdge;
      g.lineWidth = 2;
      g.globalAlpha = 0.8;
      g.strokeRect(BORDER, BORDER, WORLD_W - BORDER * 2, WORLD_H - BORDER * 2);
      g.globalAlpha = 1;
    }

    // paredes 2.5D
    for (const w of a.walls) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(w.x + 4, w.y + 8, w.w, w.h);
      g.fillStyle = P.wall;
      g.fillRect(w.x, w.y + 10, w.w, w.h - 10 > 0 ? w.h - 10 : w.h);
      g.fillStyle = P.wallTop;
      g.fillRect(w.x, w.y, w.w, Math.max(10, w.h - 12));
      g.strokeStyle = P.wallEdge;
      g.lineWidth = 2;
      g.globalAlpha = 0.85;
      g.strokeRect(w.x + 1, w.y + 1, w.w - 2, Math.max(10, w.h - 12) - 2);
      g.globalAlpha = 1;
      if (a.id === 'fabrica') stripes(g, w.x, w.y + Math.max(10, w.h - 12), w.w, 6, '#ffb000', '#1a1208');
    }

    // pilares / árvores / colunas / asteroides
    for (const c of a.pillars) this.drawPillar(g, a, c.x, c.y, c.r, rand);

    if (this.arenaLighting) this.lightArena(g, a);
    return cv;
  }

  /** luz e sombra da arena (feito uma vez): poças de luz nos pontos de interesse, paredes que projetam sombra e cantos escuros */
  arenaLighting = true;
  private lightArena(g: CanvasRenderingContext2D, a: ArenaDef) {
    const P = a.palette;
    g.save();
    // sombra projetada das paredes (luz vindo do alto à esquerda)
    g.globalCompositeOperation = 'multiply';
    for (const w of a.walls) {
      const sh = g.createLinearGradient(w.x, w.y + w.h, w.x, w.y + w.h + 26);
      sh.addColorStop(0, 'rgba(20,14,40,0.55)');
      sh.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = sh;
      g.fillRect(w.x + 8, w.y + w.h, w.w, 26);
    }
    for (const c of a.pillars) {
      const sh = g.createRadialGradient(c.x + c.r * 0.5, c.y + c.r * 0.7, 0, c.x + c.r * 0.5, c.y + c.r * 0.7, c.r * 1.7);
      sh.addColorStop(0, 'rgba(20,14,40,0.5)');
      sh.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = sh;
      g.beginPath();
      g.arc(c.x + c.r * 0.5, c.y + c.r * 0.7, c.r * 1.7, 0, Math.PI * 2);
      g.fill();
    }
    // cantos mais escuros (profundidade)
    const vig = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.35, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
    vig.addColorStop(0, 'rgba(255,255,255,1)');
    vig.addColorStop(1, 'rgba(40,30,70,1)');
    g.fillStyle = vig;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // poças de luz: núcleos, portais, lava e o centro
    g.globalCompositeOperation = 'lighter';
    const pool = (x: number, y: number, r: number, col: string, k: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, hexA(col, k));
      gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const c of a.cores) pool(c.x, c.y, 120, P.accent, 0.07);
    for (const [p1, p2] of a.portals ?? []) {
      pool(p1.x, p1.y, 90, '#c77dff', 0.12);
      pool(p2.x, p2.y, 90, '#c77dff', 0.12);
    }
    for (const l of a.lava ?? []) pool(l.x, l.y, l.r * 2.2, '#ff6a2a', 0.18);
    pool(WORLD_W / 2, WORLD_H / 2, 360, '#ffffff', 0.05);
    g.restore();
  }

  private decorate(g: CanvasRenderingContext2D, a: ArenaDef, fr: { x: number; y: number; w: number; h: number }, rand: () => number) {
    const P = a.palette;
    switch (a.id) {
      case 'lab': {
        g.strokeStyle = hexA(P.accent, 0.12);
        g.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const y = fr.y + 40 + rand() * (fr.h - 80);
          const x = fr.x + rand() * fr.w;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 60 + rand() * 120, y);
          g.lineTo(x + 80 + rand() * 120, y + 30);
          g.stroke();
        }
        const gr = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 10, WORLD_W / 2, WORLD_H / 2, 300 * ARENA_SCALE);
        gr.addColorStop(0, hexA(P.accent, 0.1));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(fr.x, fr.y, fr.w, fr.h);
        break;
      }
      case 'templo': {
        g.strokeStyle = 'rgba(255,200,120,0.12)';
        g.lineWidth = 5;
        for (const r of [90, 150, 320].map((n) => n * ARENA_SCALE)) {
          g.beginPath();
          g.ellipse(WORLD_W / 2, WORLD_H / 2, r * 1.15, r, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          const x = fr.x + rand() * fr.w;
          const y = fr.y + rand() * fr.h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + rand() * 20 - 10, y + rand() * 20);
          g.lineTo(x + rand() * 30 - 15, y + rand() * 30);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,140,60,0.35)';
        for (let i = 0; i < 30; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, rand() < 0.5 ? fr.y + rand() * 30 : fr.y + fr.h - rand() * 30, 4 + rand() * 6, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'fabrica': {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 12; i++) {
          g.beginPath();
          g.ellipse(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 20 + rand() * 40, 10 + rand() * 20, rand() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.06)';
        for (let y = fr.y + 6; y < fr.y + fr.h; y += 48)
          for (let x = fr.x + 6; x < fr.x + fr.w; x += 48) {
            g.fillRect(x, y, 2, 2);
            g.fillRect(x + 36, y, 2, 2);
            g.fillRect(x, y + 36, 2, 2);
            g.fillRect(x + 36, y + 36, 2, 2);
          }
        break;
      }
      case 'floresta': {
        for (let i = 0; i < 160; i++) {
          const c = ['#59ffd0', '#7a6bff', '#ff5df0', '#9dff5c'][Math.floor(rand() * 4)];
          g.fillStyle = hexA(c, 0.15 + rand() * 0.25);
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 1 + rand() * 2.5, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(90,255,200,0.12)';
        g.lineWidth = 2;
        for (let i = 0; i < 60; i++) {
          const x = fr.x + rand() * fr.w;
          const y = fr.y + rand() * fr.h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 3, y - 8);
          g.moveTo(x, y);
          g.lineTo(x + 3, y - 9);
          g.stroke();
        }
        break;
      }
      case 'espaco': {
        g.strokeStyle = 'rgba(200,120,255,0.18)';
        g.lineWidth = 2;
        for (const r of [120, 200, 260].map((n) => n * ARENA_SCALE)) {
          g.beginPath();
          g.arc(WORLD_W / 2, WORLD_H / 2, r, 0, Math.PI * 2);
          g.stroke();
        }
        break;
      }
      case 'vulcao': {
        // rachaduras com brilho de lava
        for (let i = 0; i < 26; i++) {
          let x = fr.x + rand() * fr.w;
          let y = fr.y + rand() * fr.h;
          g.strokeStyle = 'rgba(255,90,20,0.35)';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (rand() - 0.5) * 60;
            y += (rand() - 0.5) * 40;
            g.lineTo(x, y);
          }
          g.stroke();
          g.strokeStyle = 'rgba(255,200,90,0.5)';
          g.lineWidth = 1;
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 30; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 3 + rand() * 8, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'gelo': {
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 70; i++) {
          g.beginPath();
          g.ellipse(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 6 + rand() * 18, 3 + rand() * 6, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(120,150,190,0.25)';
        for (let i = 0; i < 40; i++) {
          const x = fr.x + rand() * fr.w;
          const y = fr.y + rand() * fr.h;
          g.beginPath();
          g.ellipse(x, y, 3, 1.5, 0, 0, Math.PI * 2);
          g.ellipse(x + 6, y - 7, 3, 1.5, 0, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'metro': {
        // piso de plataforma com faixa tátil e anúncios
        g.fillStyle = 'rgba(255,210,62,0.25)';
        for (let x = fr.x; x < fr.x + fr.w; x += 12) {
          g.fillRect(x, 232, 6, 6);
          g.fillRect(x, 482, 6, 6);
        }
        for (const [x, y, c] of [[300, 300, '#ff4fd8'], [980, 420, '#4af0ff'], [640, 660, '#ffd23e']] as const) {
          g.fillStyle = hexA(c, 0.12);
          g.fillRect(x - 60, y - 18, 120, 36);
          g.strokeStyle = hexA(c, 0.5);
          g.lineWidth = 2;
          g.strokeRect(x - 60, y - 18, 120, 36);
          g.fillStyle = hexA(c, 0.6);
          g.font = `700 14px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(x < 640 ? 'LINHA ECO' : x > 640 ? 'ESTAÇÃO 7' : 'CUIDADO', x, y);
        }
        break;
      }
      case 'deserto': {
        g.strokeStyle = 'rgba(150,100,40,0.25)';
        g.lineWidth = 2;
        for (let i = 0; i < 22; i++) {
          const y = fr.y + rand() * fr.h;
          const x = fr.x + rand() * fr.w;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + 40, y - 10, x + 90, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(120,80,30,0.35)';
        for (let i = 0; i < 25; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 2 + rand() * 4, 0, Math.PI * 2);
          g.fill();
        }
        // ladrilhos antigos
        g.strokeStyle = 'rgba(255,240,200,0.25)';
        g.lineWidth = 3;
        g.strokeRect(520, 240, 240, 240);
        break;
      }
      case 'cidade': {
        g.fillStyle = 'rgba(120,220,140,0.18)';
        for (let i = 0; i < 40; i++) {
          g.beginPath();
          g.arc(fr.x + rand() * fr.w, fr.y + rand() * fr.h, 6 + rand() * 10, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
    }
  }

  private drawPillar(g: CanvasRenderingContext2D, a: ArenaDef, x: number, y: number, r: number, rand: () => number) {
    const P = a.palette;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x + 4, y + 6, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    switch (a.id) {
      case 'floresta': {
        g.fillStyle = '#2a1d3a';
        g.fillRect(x - 5, y - 4, 10, 14);
        const cols = ['#164a5a', '#1f6b70', '#2f8f7f'];
        for (let i = 3; i >= 1; i--) {
          g.fillStyle = cols[i - 1];
          g.beginPath();
          g.arc(x + (rand() - 0.5) * 6, y - 8 - i * 3, r * (0.55 + i * 0.15), 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(120,255,230,0.6)';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(x + (rand() - 0.5) * r * 1.4, y - 14 + (rand() - 0.5) * r, 1.5 + rand() * 2, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'espaco': {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
        gr.addColorStop(0, '#6b5a8f');
        gr.addColorStop(1, '#2a2140');
        g.fillStyle = gr;
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const rr2 = r * (0.85 + rand() * 0.2);
          g.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2);
        }
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.arc(x + r * 0.2, y + r * 0.1, r * 0.25, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'gelo': {
        // pinheiro com neve
        g.fillStyle = '#4a2e1a';
        g.fillRect(x - 4, y - 6, 8, 12);
        for (let i = 0; i < 3; i++) {
          const w = r * (1.15 - i * 0.28);
          const ty = y - 8 - i * r * 0.55;
          g.fillStyle = i % 2 ? '#1e5a44' : '#246a50';
          g.beginPath();
          g.moveTo(x - w, ty);
          g.lineTo(x, ty - r * 0.9);
          g.lineTo(x + w, ty);
          g.closePath();
          g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.moveTo(x - w * 0.5, ty - r * 0.45);
          g.lineTo(x, ty - r * 0.9);
          g.lineTo(x + w * 0.5, ty - r * 0.45);
          g.quadraticCurveTo(x, ty - r * 0.3, x - w * 0.5, ty - r * 0.45);
          g.fill();
        }
        break;
      }
      case 'vulcao': {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
        gr.addColorStop(0, '#5a3a30');
        gr.addColorStop(1, '#1a0e0a');
        g.fillStyle = gr;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rr2 = r * (0.8 + rand() * 0.25);
          g.lineTo(x + Math.cos(ang) * rr2, y - 6 + Math.sin(ang) * rr2 * 0.8);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,110,40,0.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - r * 0.4, y - 10);
        g.lineTo(x, y - 2);
        g.lineTo(x + r * 0.3, y - 12);
        g.stroke();
        break;
      }
      case 'deserto': {
        // obelisco
        g.fillStyle = '#8a5a2a';
        g.beginPath();
        g.moveTo(x - r * 0.7, y + 4);
        g.lineTo(x - r * 0.45, y - r * 2.2);
        g.lineTo(x, y - r * 2.8);
        g.lineTo(x + r * 0.45, y - r * 2.2);
        g.lineTo(x + r * 0.7, y + 4);
        g.closePath();
        g.fill();
        g.fillStyle = '#c8955a';
        g.beginPath();
        g.moveTo(x - r * 0.7, y + 4);
        g.lineTo(x - r * 0.45, y - r * 2.2);
        g.lineTo(x, y - r * 2.8);
        g.lineTo(x, y + 4);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(80,40,10,0.6)';
        for (let i = 0; i < 3; i++) g.fillRect(x - 3, y - r * (0.6 + i * 0.5), 6, 3);
        break;
      }
      default: {
        const top = a.id === 'templo' ? '#8a6c46' : a.id === 'cidade' ? '#d9c7ff' : P.wallTop;
        const side = a.id === 'templo' ? '#5c4429' : a.id === 'cidade' ? '#7b6bb8' : P.wall;
        g.fillStyle = side;
        g.fillRect(x - r, y - 14, r * 2, 14);
        g.beginPath();
        g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI);
        g.fill();
        g.fillStyle = top;
        g.beginPath();
        g.ellipse(x, y - 14, r, r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = P.wallEdge;
        g.globalAlpha = 0.7;
        g.lineWidth = 2;
        g.stroke();
        g.globalAlpha = 1;
        if (a.id === 'cidade') {
          g.fillStyle = '#ffd27a';
          g.beginPath();
          g.arc(x, y - 18, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // ======================================================== eventos → efeitos
  handleEvents(events: GameEvent[], game: Game) {
    const pc = (id: string) => game.players.find((p) => p.id === id);
    for (const e of events) {
      this.abilityFx.note(e);
      if (this.abilityFx.kick > 0) {
        // suprema caindo: tranco curto na câmera (não fica tremendo)
        this.shake = Math.max(this.shake, this.abilityFx.kick);
        this.abilityFx.kick = 0;
      }
      if (e.type === 'windup' && e.ult) {
        const who = pc(e.pid);
        this.text(e.x, e.y - 74, 'SUPREMA!', ELEMENT_COLOR[e.el as Element] ?? '#ffd23e', 22);
        if (who && who.id === this.meId(game)) this.flash = Math.max(this.flash, 0.08);
      }
      switch (e.type) {
        case 'pickup':
          this.burst(e.x, e.y, e.golden ? '#ffd23e' : '#5dff8a', e.golden ? 22 : 10, 160);
          if (e.lucky) this.text(e.x, e.y - 20, 'SORTE! ×2', '#ff7a59');
          break;
        case 'deliver': {
          const p = pc(e.pid);
          this.setMood(e.pid, 'happy', 1.4);
          this.burst(e.x, e.y, p?.color ?? '#5dff8a', 26, 260);
          this.ring(e.x, e.y, p?.color ?? '#5dff8a', 90);
          this.text(e.x, e.y - 50, `+${e.points}`, p?.color ?? '#fff', 30);
          break;
        }
        case 'hit': {
          this.animOf(e.pid).hurt = 1;
          this.setMood(e.pid, 'hurt', 0.55);
          this.burst(e.x, e.y, '#ff5a5a', game.combat ? 6 : 16, 220);
          if (game.combat) {
            if (e.pid === this.meId(game)) {
              this.flash = Math.max(this.flash, 0.18);
              this.flashColor = '#ff2a4a';
              this.shake = Math.max(this.shake, 4);
            }
            break;
          }
          if (e.pid === this.meId(game)) {
            this.shake = 10;
            this.flash = 0.35;
            this.flashColor = '#ff2a4a';
          }
          const from = e.from ? pc(e.from) : null;
          const who = from ? (from.name || from.char.name).replace(/ \(bot\)$/, '').toUpperCase() : '';
          const label = e.by === 'own' ? 'SEU ECO' : e.by === 'echo' ? 'ECO DA RODADA ANTERIOR' : e.by === 'fall' ? 'QUEDA!' : '';
          this.text(e.x, e.y - 40, label ? `-1 ♥ ${label}${who && e.by === 'echo' ? ` · ${who}` : ''}` : '-1 ♥', e.by === 'echo' || e.by === 'own' ? '#9fdcff' : '#ff6b6b', 16);
          // perda do coração bem visível (anel vermelho em volta)
          this.ring(e.x, e.y - 30, '#ff4a6a', 56);
          if (e.lost) {
            // a energia carregada caiu no chão
            this.text(e.x, e.y - 10, `ENERGIA CAIU ×${e.lost}`, '#ffd23e', 15);
            this.ring(e.x, e.y, '#5dff8a', 60);
            this.burst(e.x, e.y, '#5dff8a', 14, 200);
          }
          break;
        }
        case 'eliminated': {
          const p = pc(e.pid);
          if (p) this.falls.push({ p, x: e.x, y: e.y, flip: Math.cos(game.combat ? p.aim : p.dir) < 0, t: 0, boss: !!p.boss });
          }
          this.burst(e.x, e.y, '#ffffff', 30, 280);
          this.ring(e.x, e.y, '#ff5a5a', 120);
          break;
        case 'dash':
          this.burst(e.x, e.y, '#9ad8ff', 6, 90);
          break;
        case 'ability': {
          this.animOf(e.pid).cast = 1;
          const p = pc(e.pid);
          const col = p?.color ?? '#fff';
          if (p && e.ability !== 'item') this.setMood(p.id, 'angry', 0.8);
          if (e.ability === 'explosao') {
            this.ring(e.x, e.y, col, 165);
            this.ring(e.x, e.y, '#ffffff', 120);
            this.burst(e.x, e.y, col, 30, 380);
            this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 0.3, color: col, size: 150, kind: 'glow' });
            this.shake = Math.max(this.shake, 6);
          } else if (e.ability === 'investida') {
            this.ring(e.x, e.y, col, 70);
            this.burst(e.x, e.y, '#c8a070', 16, 200);
            this.shake = Math.max(this.shake, 4);
          } else if (e.ability === 'muralha') {
            this.burst(e.x, e.y - 20, '#dff8ff', 24, 260);
          } else if (e.ability === 'fumaca') {
            for (let i = 0; i < 18; i++) this.particles.push({ x: e.x, y: e.y - 20, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 200, life: 0, max: 0.8, color: '#9aa2b4', size: 7, kind: 'spark' });
          } else if (e.ability === 'cura') {
            for (let i = 0; i < 14; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y - Math.random() * 30, vx: 0, vy: -70 - Math.random() * 50, life: 0, max: 0.9, color: '#5dffb8', size: 3, kind: 'spark' });
            this.ring(e.x, e.y - 20, '#5dffb8', 60);
          } else if (e.ability === 'teleporte' || e.ability === 'sombra') {
            this.burst(e.x, e.y - 20, e.ability === 'sombra' ? '#1a1020' : col, 22, 200);
            this.ring(e.x, e.y, col, 60);
          } else if (e.ability === 'turbo') {
            this.burst(e.x, e.y, '#ffffff', 10, 160);
            this.ring(e.x, e.y, col, 50);
          } else this.ring(e.x, e.y, col, 60);
          break;
        }
        case 'portal':
          this.ring(e.x, e.y, '#c77dff', 50);
          this.burst(e.x, e.y, '#c77dff', 10, 140);
          break;
        case 'disrupt':
          this.burst(e.x, e.y, '#ffffff', 14, 200);
          this.ring(e.x, e.y, '#b0f0ff', 50);
          break;
        case 'hazardOn':
          this.ring(e.x, e.y, '#ff8a1e', 80);
          break;
        case 'piston':
          this.shake = Math.max(this.shake, 3);
          break;
        case 'coreMove':
          this.ring(e.x, e.y, '#5dff8a', 120);
          break;
        case 'goldenSpawn':
          this.ring(e.x, e.y, '#ffd23e', 80);
          break;
        case 'power': {
          const def = getPower(e.power);
          this.burst(e.x, e.y, def.color, 18, 220);
          this.ring(e.x, e.y, def.color, 70);
          this.text(e.x, e.y - 40, def.name.toUpperCase() + '!', def.color, 20);
          break;
        }
        case 'powerSpawn':
          this.ring(e.x, e.y, getPower(e.power).color, 50);
          break;
        case 'explode':
          this.ring(e.x, e.y, '#ffd08a', e.r);
          this.ring(e.x, e.y, '#ff5a3c', e.r * 0.7);
          this.burst(e.x, e.y, '#ffb347', 34, 360);
          this.burst(e.x, e.y, '#ff3a1e', 18, 220);
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 0.35, color: '#fff2c8', size: e.r * 0.8, kind: 'glow' });
          this.shake = Math.max(this.shake, 9);
          break;
        case 'reflect':
          this.burst(e.x, e.y - GUN_Y, '#c8ffd8', 10, 200);
          this.ring(e.x, e.y - GUN_Y, '#5dff8a', 26);
          break;
        case 'bonusSpawn':
          this.ring(e.x, e.y, '#ffffff', 60);
          break;
        case 'bonusPick': {
          const owner = CHARACTER_BY_AB.get(e.ab);
          const col = owner?.color ?? '#ffffff';
          this.burst(e.x, e.y - 26, col, 26, 260);
          this.ring(e.x, e.y, col, 80);
          this.text(e.x, e.y - 70, `PODER: ${owner?.ability.name.toUpperCase() ?? ''}`, col, 18);
          this.setMood(e.pid, 'happy', 1);
          break;
        }
        case 'shoot': {
          const an = this.animOf(e.pid);
          an.recoil = 1;
          an.shoot = 1;
          const w = WEAPONS[e.weapon];
          const sh = game.players.find((q) => q.id === e.pid);
          const a = sh ? sh.aim : 0;
          const m = 14 + w.gun.len;
          this.particles.push({ x: e.x + Math.cos(a) * m, y: e.y - GUN_Y + Math.sin(a) * m, vx: 0, vy: 0, life: 0, max: 0.08, color: w.color, size: 14, kind: 'glow' });
          break;
        }
        case 'heal':
          this.ring(e.x, e.y - 20, '#5dffb8', 50);
          this.text(e.x, e.y - 60, '+VIDA', '#5dffb8', 16);
          break;
        case 'kill': {
          const v = pc(e.pid);
          const k = e.by ? pc(e.by) : null;
          if (e.by) this.setMood(e.by, 'happy', 1.4);
          this.burst(e.x, e.y, v?.color ?? '#fff', 30, 300);
          this.text(e.x, e.y - 70, k ? `${k.char.name} eliminou ${v?.char.name ?? ''}` : `${v?.char.name ?? ''} caiu`, k?.color ?? '#ffffff', 16);
          break;
        }
        case 'zap': {
          const p = pc(e.pid);
          this.zaps.push({ pts: e.pts, t: 0.35, color: p?.color ?? '#ffe14a' });
          for (let i = 2; i < e.pts.length; i += 2) this.burst(e.pts[i], e.pts[i + 1], '#fff6a0', 10, 160);
          this.flash = Math.max(this.flash, 0.08);
          this.flashColor = '#fff6c8';
          break;
        }
        case 'capture': {
          const p = pc(e.pid);
          this.setMood(e.pid, 'happy', 2);
          this.burst(p?.x ?? 640, p?.y ?? 360, TEAM_COLORS[e.team], 40, 320);
          this.ring(p?.x ?? 640, p?.y ?? 360, TEAM_COLORS[e.team], 140);
          this.text(p?.x ?? 640, (p?.y ?? 360) - 80, 'CAPTURA! +1', TEAM_COLORS[e.team], 26);
          break;
        }
        case 'flagTake': {
          const p = pc(e.pid);
          if (p) this.text(p.x, p.y - 80, 'PEGOU A BANDEIRA!', TEAM_COLORS[e.team], 16);
          this.setMood(e.pid, 'happy', 1);
          break;
        }
        case 'flagReturn':
          this.ring(e.x, e.y, TEAM_COLORS[e.team], 70);
          this.text(e.x, e.y - 60, 'BANDEIRA VOLTOU', TEAM_COLORS[e.team], 14);
          break;
        case 'hillMove':
          this.ring(e.x, e.y, '#ffd23e', 120);
          break;
        case 'enemySpawn':
          this.ring(e.x, e.y, '#ff3b3b', e.kind === 'boss' ? 160 : 60);
          this.burst(e.x, e.y, '#ff6a6a', e.kind === 'boss' ? 40 : 10, 200);
          if (e.kind === 'boss') this.shake = Math.max(this.shake, 12);
          break;
        case 'enemyKill':
          this.corpses.push({ x: e.x, y: e.y, t: 0, kind: e.kind });
          if (this.corpses.length > 12) this.corpses.shift();
          this.burst(e.x, e.y - 18, '#c8d0e0', e.kind === 'boss' ? 60 : 18, e.kind === 'boss' ? 420 : 240);
          this.burst(e.x, e.y - 18, '#ff8a3c', e.kind === 'boss' ? 40 : 10, 260);
          this.ring(e.x, e.y - 18, '#ffb347', e.kind === 'boss' ? 200 : 50);
          if (e.by) this.setMood(e.by, 'happy', 0.9);
          if (e.kind === 'boss') this.shake = Math.max(this.shake, 16);
          break;
        case 'respawn':
          this.ring(e.x, e.y, '#ffffff', 70);
          this.burst(e.x, e.y, '#bff4ff', 16, 180);
          break;
        case 'echoErased':
          this.burst(e.x, e.y, '#ff4fc3', 26, 260);
          this.ring(e.x, e.y, '#ff4fc3', 90);
          this.text(e.x, e.y - 50, 'ECO APAGADO', '#ff4fc3', 20);
          break;
        case 'objective': {
          const p = pc(e.pid);
          if (p) this.text(p.x, p.y - 70, e.text, '#ffd23e', 18);
          break;
        }
        case 'dmg': {
          // números de dano/cura/escudo: cor + texto (nunca só a cor)
          if (this.reducedEffects && e.k === 'hp' && e.pid !== this.meId(game)) break;
          const p = pc(e.pid);
          const big = p?.boss ? 40 : 0;
          const jx = (Math.random() - 0.5) * 26;
          const txt = e.k === 'heal' ? `+${e.n}` : e.k === 'shield' ? `${e.n} ESCUDO` : e.k === 'dodge' ? 'ESQUIVOU' : e.k === 'immune' ? 'IMUNE' : e.k === 'block' ? 'BLOQUEOU' : e.k === 'weak' ? `${e.n}!` : String(e.n);
          const SRC: Record<string, string> = { eco: '#9fdcff', perigo: '#ffb347', explosao: '#ffd23e', criatura: '#a6ff6a', golpe: '#d9a6ff' };
          const col = e.k === 'heal' ? '#5dffb8' : e.k === 'shield' ? '#7ff0ff' : e.k === 'block' ? '#9ad8ff' : e.k === 'immune' ? '#f4f4ff' : e.k === 'dodge' ? '#3ee8ff' : e.k === 'weak' ? '#ffe14a' : e.src && SRC[e.src] ? SRC[e.src] : e.pid === this.meId(game) ? '#ff6b6b' : '#ffffff';
          if (e.k === 'hp' || e.k === 'shield') this.lastHit.set(e.pid, performance.now() / 1000);
          if (e.pid === this.meId(game) && (e.k === 'hp' || e.k === 'shield') && e.sx !== undefined && e.sy !== undefined) {
            const h = game.human;
            this.hitDirs.push({ ang: Math.atan2(e.sy - h.y, e.sx - h.x), t: 0.9, src: e.src ?? 'arma' });
            if (this.hitDirs.length > 6) this.hitDirs.shift();
          }
          if (e.note && e.pid === this.meId(game) && e.k === 'hp') {
            this.text(e.x, e.y - 86, `${e.note}: −${e.n}`, '#9fdcff', 13);
            this.ring(e.x, e.y - 20, '#9fdcff', 48);
          }
          // golpes rápidos no mesmo alvo viram UM número que vai somando (não empilha dezenas de números)
          if (e.k === 'hp' || e.k === 'shield' || e.k === 'heal') {
            const key = `${e.pid}|${e.k}|${col}`;
            const prev = this.dmgStack.get(key);
            if (prev && prev.life < 0.45 && this.particles.includes(prev)) {
              const sum = ((prev as any).acc as number) + e.n;
              (prev as any).acc = sum;
              prev.text = e.k === 'heal' ? `+${sum}` : e.k === 'shield' ? `${sum}⛉` : String(sum);
              prev.life = Math.min(prev.life, 0.12);
              prev.size = Math.min(20, 13 + Math.sqrt(sum) * 0.5);
              prev.x += (e.x - prev.x) * 0.3;
              break;
            }
            const part = { x: e.x + jx, y: e.y - 60 - big, vx: 0, vy: -70, life: 0, max: 0.75, color: col, size: 13, kind: 'text' as const, text: txt, acc: e.n };
            this.particles.push(part);
            this.dmgStack.set(key, part);
            if (this.dmgStack.size > 40) this.dmgStack.delete(this.dmgStack.keys().next().value!);
            break;
          }
          this.particles.push({ x: e.x + jx, y: e.y - 60 - big, vx: 0, vy: -70, life: 0, max: 0.75, color: col, size: e.k === 'weak' ? 17 : 13, kind: 'text', text: e.k === 'weak' ? `PONTO FRACO ${txt}` : txt });
          break;
        }
        case 'stunned':
          this.text(e.x, e.y - 100, 'TONTO!', '#ffd23e', 14);
          break;
        case 'combo': {
          const col = e.vfx === 'ult' ? '#f0d78c' : e.vfx === 'burst' ? '#9ad7ff' : e.vfx === 'root' ? '#b7d39a' : '#ffe14a';
          this.text(e.x, e.y - 108, e.name, col, e.vfx === 'ult' ? 20 : 16);
          this.ring(e.x, e.y - 20, col, e.vfx === 'ult' ? 78 : 48);
          if (e.vfx === 'ult') this.burst(e.x, e.y - 16, col, 18, 220);
          break;
        }
        case 'mark':
          this.ring(e.x, e.y - 28, '#ff5a3c', 40);
          break;
        case 'trap':
          this.burst(e.x, e.y, '#c8d0e0', 16, 200);
          this.ring(e.x, e.y, '#ff5a3c', 50);
          this.text(e.x, e.y - 60, 'PRESO!', '#ff5a3c', 16);
          break;
        case 'skill': {
          this.animOf(e.pid).cast = 1;
          const p = pc(e.pid);
          const el = e.skill as Element;
          const col = e.skill === 'plasma' ? '#c86bff' : ELEMENT_COLOR[el] ?? p?.color ?? '#fff';
          // poderes elementais: o AbilityVfx desenha a área/lançamento do elemento (aqui só o que não é elemento)
          if (!ELEMENT_COLOR[el]) this.ring(e.x, e.y - 10, col, e.r && e.r > 20 ? Math.min(e.r, 140) : 44);
          if (e.skill === 'rolamento') this.burst(e.x, e.y, '#bff4ff', 10, 160);
          if (e.skill === 'estimulo') this.ring(e.x, e.y, '#5dffb8', SKILLS.estimulo.radius ?? 160);
          break;
        }
        case 'ult': {
          this.animOf(e.pid).cast = 1;
          const p = pc(e.pid);
          const col = p?.color ?? '#fff';
          this.ring(e.x, e.y - 20, col, 90);
          this.burst(e.x, e.y - 20, col, 24, 260);
          const u = ULTS[e.ult as keyof typeof ULTS];
          if (u) this.text(e.x, e.y - 110, u.name.toUpperCase() + '!', col, 18);
          this.setMood(e.pid, 'angry', 1.2);
          break;
        }
        case 'castHit': {
          if (e.kind === 'feixe') {
            const owner = game.players.find((p) => Math.hypot(p.x - e.x, p.y - e.y) < 60);
            this.beams.push({ x: e.x, y: e.y, ang: e.ang, len: e.len, w: ULTS.feixe.width ?? 40, t: 0.35, color: owner?.color ?? '#ffffff' });
            this.shake = Math.max(this.shake, 6);
          } else if (e.kind === 'impacto') {
            const b = game.players.find((q) => q.boss);
            if (b) this.animOf(b.id).slam = 1;
            this.ring(e.x, e.y, '#ff5a3c', e.r);
            this.ring(e.x, e.y, '#ffd08a', e.r * 0.7);
            this.burst(e.x, e.y, '#c8a070', 30, 360);
            this.shake = Math.max(this.shake, 12);
          } else if (e.kind === 'estase') {
            this.ring(e.x, e.y, '#c77dff', e.r);
            this.burst(e.x, e.y, '#e8d0ff', 18, 200);
          } else if (e.kind === 'obsidiana') {
            this.burst(e.x, e.y, '#ff7a3a', 24, 240);
            this.shake = Math.max(this.shake, 5);
          } else if (e.kind === 'fissura') {
            this.beams.push({ x: e.x, y: e.y, ang: e.ang, len: e.len, w: 46, t: 0.4, color: '#ff7a3a' });
            this.shake = Math.max(this.shake, 9);
          }
          break;
        }
        case 'exhaust': {
          const b = game.players.find((q) => q.boss);
          if (b) this.animOf(b.id).hurt = 1;
          this.ring(e.x, e.y - 40, '#5dffb8', 120);
          break;
        }
        case 'minion':
          this.ring(e.x, e.y, '#b06aff', 50);
          this.burst(e.x, e.y - 10, '#8a5a9a', 14, 180);
          break;
        case 'block':
          this.burst(e.x, e.y, '#d9cbb0', 5, 140);
          break;
        case 'deny':
          if (e.x !== undefined && e.y !== undefined) this.text(e.x, e.y - 36, e.msg, e.msg === 'Obstáculo' || e.msg === 'Fora de alcance' ? '#ffb4a8' : '#ffe14a', 13);
          break;
        case 'bossPhase': {
          const b = game.players.find((q) => q.boss);
          if (b) this.animOf(b.id).roar = 1;
          }
          this.flash = Math.max(this.flash, 0.3);
          this.flashColor = '#ff3b3b';
          this.shake = Math.max(this.shake, 14);
          break;
        case 'pylon':
          if (e.down) {
            this.burst(e.x, e.y - 40, '#ff8090', 40, 340);
            this.text(e.x, e.y - 110, 'GERADOR DESTRUÍDO!', '#ffd23e', 18);
          } else {
            this.ring(e.x, e.y, '#ff4a5a', 90);
            this.burst(e.x, e.y - 40, '#ff8090', 20, 220);
          }
          break;
      }
    }
  }

  /** o Chefe: criatura própria com animações (não é um personagem aumentado) */
  private drawBoss(game: Game, p: Player, time: number, an: { windup: number; slam: number; roar: number; hurt: number; shoot: number }) {
    const ctx = this.ctx;
    const flip = Math.cos(p.aim) < 0;
    // antecipação suave: sobe enquanto prepara o golpe
    an.windup += ((p.castT > 0 ? 1 : 0) - an.windup) * 0.25;
    if (game.combat && p.id === this.meId(game) && p.alive) this.drawAimGuide(game, p, time);
    const pose = {
      t: time,
      walk: p.walkPhase * 0.6,
      moving: p.moving || p.chargeT > 0,
      windup: an.windup,
      slam: an.slam,
      roar: an.roar,
      hurt: an.hurt,
      shoot: an.shoot,
      stun: p.stunT > 0 || (p as any).exhaustT > 0,
      phase: (game as any).bossPhase ?? 1,
      dead: 0,
      weak: true,
    };
    const flash = p.hitFlash > 0;
    const glow = p.castT > 0 && !this.reducedEffects;
    ctx.save();
    ctx.translate(p.x, p.y + 2);
    if (flip) ctx.scale(-1, 1);
    if (!flash && !glow) drawMonster(ctx, pose);
    else {
      // brilho/clarão aplicados UMA vez numa imagem pronta (filtro em cada traço do monstro travava o jogo)
      const k = Math.min(3, Math.abs(ctx.getTransform().a) || 1);
      const L = 190;
      const T = 225;
      const W = 380;
      const H = 280;
      const cv = (this.bossLayer ??= document.createElement('canvas'));
      const cw = Math.ceil(W * k);
      const ch = Math.ceil(H * k);
      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw;
        cv.height = ch;
      }
      const g = cv.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.setTransform(k, 0, 0, k, L * k, T * k);
      drawMonster(g, pose);
      if (flash) ctx.filter = `brightness(${1 + p.hitFlash * 3})`;
      if (glow) {
        ctx.shadowColor = '#ff5a3c';
        ctx.shadowBlur = 20 + Math.sin(time * 30) * 8;
      }
      ctx.drawImage(cv, -L, -T, W, H);
    }
    ctx.restore();
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    // passos pesados: poeira e tremor leve
    if (p.moving && !this.reducedEffects) {
      const last = this.dustAt.get(p.id) ?? 0;
      if (time - last > 0.32) {
        this.dustAt.set(p.id, time);
        this.burst(p.x + (Math.random() - 0.5) * 30, p.y, 'rgba(200,170,150,0.6)', 6, 90);
        if (game.human.boss || Math.hypot(game.human.x - p.x, game.human.y - p.y) < 260) this.shake = Math.max(this.shake, 1.5);
      }
    }
    // vida em cima da criatura
    const bw = 110;
    const by = p.y - 172;
    ctx.fillStyle = 'rgba(8,6,22,0.8)';
    rr(ctx, p.x - bw / 2 - 2, by - 2, bw + 4, 9, 4);
    ctx.fill();
    const f = Math.max(0, p.hp / (p.maxHp || 1));
    ctx.fillStyle = '#ff4a5a';
    rr(ctx, p.x - bw / 2, by, bw * f, 5, 2.5);
    ctx.fill();
    drawStatus(ctx, game, p, time);
  }

  /** quem foi eliminado cai (antecipação, impacto, some) */
  private drawFalls(game: Game, dt: number, time: number) {
    const ctx = this.ctx;
    for (const f of this.falls) {
      f.t += dt;
      if (f.boss) {
        // derrota do Chefe: tomba devagar e se desfaz em brasas
        const k = Math.min(1, f.t / 1.8);
        ctx.save();
        ctx.translate(f.x, f.y + 2);
        if (f.flip) ctx.scale(-1, 1);
        drawMonster(ctx, { t: time, walk: 0, moving: false, windup: 0, slam: 0, roar: Math.max(0, 1 - f.t * 2), hurt: 0, shoot: 0, stun: false, phase: 1, dead: k, weak: false });
        ctx.restore();
        if (!this.reducedEffects && Math.random() < 0.6 && k < 1) this.burst(f.x + (Math.random() - 0.5) * 80, f.y - Math.random() * 80, '#ff8a3d', 2, 120);
        continue;
      }
      const k = Math.min(1, f.t / 0.32);
      const fade = f.t < 0.5 ? 1 : Math.max(0, 1 - (f.t - 0.5) / 0.5);
      const { facing } = facingOf(f.p.aim);
      const img = this.sprites.get(f.p.char, facing === 'up' ? 'side' : facing, 0, false, null, 'hurt');
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(f.x, f.y + 4 + k * 4);
      ctx.rotate((f.flip ? -1 : 1) * k * k * 1.45);
      this.sprites.draw(ctx, img, 0, 0, f.flip, SPRITE_SCALE);
      ctx.restore();
    }
    void game;
    this.falls = this.falls.filter((f) => f.t < (f.boss ? 2.4 : 1));
  }

  /** arcos em volta do jogador mostrando de onde veio cada dano (cor + texto por tipo) */
  private drawHitDirs(game: Game, dt: number) {
    const h = game.human;
    if (!h.alive) {
      this.hitDirs = [];
      return;
    }
    const ctx = this.ctx;
    const COL: Record<string, [string, string]> = {
      arma: ['#ff4a5a', ''],
      eco: ['#9fdcff', 'ECO'],
      perigo: ['#ffb347', 'PERIGO'],
      explosao: ['#ffd23e', 'EXPLOSÃO'],
      golpe: ['#d9a6ff', ''],
      criatura: ['#a6ff6a', 'CRIATURA'],
    };
    const cx = h.x;
    const cy = h.y - (h.boss ? 60 : 28);
    const R = h.boss ? 92 : 50;
    for (const d of this.hitDirs) {
      d.t -= dt;
      const k = Math.max(0, d.t / 0.9);
      const [col, txt] = COL[d.src] ?? COL.arma;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, R, d.ang - 0.38, d.ang + 0.38);
      ctx.stroke();
      // seta apontando para a origem
      const ax = cx + Math.cos(d.ang) * (R + 10);
      const ay = cy + Math.sin(d.ang) * (R + 10);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(d.ang) * 9, ay + Math.sin(d.ang) * 9);
      ctx.lineTo(ax + Math.cos(d.ang + 2.3) * 8, ay + Math.sin(d.ang + 2.3) * 8);
      ctx.lineTo(ax + Math.cos(d.ang - 2.3) * 8, ay + Math.sin(d.ang - 2.3) * 8);
      ctx.closePath();
      ctx.fill();
      if (txt) label(ctx, cx + Math.cos(d.ang) * (R + 26), cy + Math.sin(d.ang) * (R + 26), txt, col, 11);
      ctx.restore();
    }
    this.hitDirs = this.hitDirs.filter((d) => d.t > 0);
  }

  /** decai as animações de combate */
  private tickAnim(dt: number) {
    for (const a of this.anim.values()) {
      a.recoil = Math.max(0, a.recoil - dt * 9);
      a.cast = Math.max(0, a.cast - dt * 2.8);
      a.slam = Math.max(0, a.slam - dt * 2.2);
      a.roar = Math.max(0, a.roar - dt * 0.8);
      a.hurt = Math.max(0, a.hurt - dt * 5);
      a.shoot = Math.max(0, a.shoot - dt * 6);
    }
  }

  /** feixe prismático disparado */
  private drawBeams(dt: number) {
    const ctx = this.ctx;
    for (const b of this.beams) {
      b.t -= dt;
      const k = Math.max(0, b.t / 0.35);
      ctx.save();
      ctx.translate(b.x, b.y - 24);
      ctx.rotate(b.ang);
      ctx.globalAlpha = k;
      ctx.fillStyle = hexA(b.color, 0.5);
      ctx.fillRect(0, (-b.w / 2) * (0.6 + k * 0.4), b.len, b.w * (0.6 + k * 0.4));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -b.w * 0.15 * k, b.len, b.w * 0.3 * k);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.beams = this.beams.filter((b) => b.t > 0);
  }

  private burst(x: number, y: number, color: string, n: number, sp: number) {
    if (this.reducedEffects) n = Math.ceil(n / 3);
    if (this.particles.length > 150) {
      let drop = this.particles.length - 90;
      this.particles = this.particles.filter((p) => {
        if (drop > 0 && p.kind === 'spark') {
          drop--;
          return false;
        }
        return true;
      });
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3, kind: 'spark' });
    }
  }
  private ring(x: number, y: number, color: string, r: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.55, color, size: r, kind: 'ring' });
  }
  /** Eco estava desativado no quadro anterior (para o aviso de "voltou") */
  private echoWasOff = new Map<string, boolean>();
  /** camada do Chefe (para aplicar clarão/brilho uma vez só) */
  private bossLayer: HTMLCanvasElement | null = null;
  /** último número de dano por alvo (para somar golpes seguidos) */
  private dmgStack = new Map<string, any>();

  private text(x: number, y: number, text: string, color: string, size = 22) {
    const texts = this.particles.filter((p) => p.kind === 'text');
    if (texts.length > 10) texts[0].life = texts[0].max;
    this.particles.push({ x, y, vx: 0, vy: -50, life: 0, max: 1.3, color, size, kind: 'text', text });
  }

  // ======================================================== quadro
  render(game: Game, dt: number, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && !this.reducedEffects) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
    }
    this.drawnShakeX = sx;
    this.drawnShakeY = sy;
    this.shake = Math.max(0, this.shake - dt * 40);
    if (!this.viewLock && !this.showcase) {
      const me = game.players.find((p) => p.id === this.meId(game));
      const watched = this.followId ? game.players.find((p) => p.id === this.followId) : null;
      const focus = me && !me.alive && watched ? watched : me ?? game.players.find((p) => p.alive) ?? game.players[0];
      if (focus) {
        this.lookX = focus.x;
        this.lookY = focus.y;
        this.applyLook();
      }
    }
    const k = this.scale * this.dpr;
    const now = time;
    const fin = this.finisher && now < this.finisher.until ? this.finisher : null;
    if (this.finisher && now >= this.finisher.until) this.finisher = null;
    if (fin) {
      const u = Math.min(1, (fin.span - (fin.until - now)) / Math.max(0.2, fin.span * 0.35));
      const z = 1 + (this.reducedEffects ? 0.04 : 0.1) * Math.sin(Math.min(1, u) * Math.PI);
      const px = (this.ox + fin.x * this.scale + sx) * this.dpr;
      const py = (this.oy + fin.y * this.scale + sy) * this.dpr;
      ctx.setTransform(k * z, 0, 0, k * z, px - fin.x * k * z, py - fin.y * k * z);
    } else ctx.setTransform(k, 0, 0, k, (this.ox + sx) * this.dpr, (this.oy + sy) * this.dpr);
    if (this.base) ctx.drawImage(this.base, 0, 0, WORLD_W, WORLD_H);

    const t = game.worldT;
    this.drawDynamic(game, time);

    if (game.phase === 'rewind') {
      this.drawRewind(game, dt, time);
    } else {
      this.drawFragments(game, time);
      this.drawPowerups(game, time);
      if (game.combat) {
        this.drawCombatGround(game, time);
        drawTraps(this.ctx, game, time);
        drawCastsGround(this.ctx, game, time);
      }
      this.drawEchoes(game, time);
      this.drawClones(game, time);
      this.drawCorpses(dt);
      this.drawEnemies(game, time);
      if (game.phase === 'play' && !this.reducedEffects && time - this.moteAt > 0.5 && this.particles.length < 48) {
        this.moteAt = time;
        const h = game.human;
        this.particles.push({ x: h.x + (Math.random() - 0.5) * 380, y: h.y + (Math.random() - 0.5) * 240, vx: 6, vy: -14, life: 0, max: 1.5, color: 'rgba(255,255,255,0.45)', size: 1.5, kind: 'spark' });
      }
      this.drawAbilityOrbs(game, time);
      const ps = game.players.filter((p) => p.playing && p.alive).sort((p1, p2) => p1.y - p2.y);
      for (const p of ps) this.drawTrail(p, time);
      for (const p of ps) this.drawPlayer(game, p, time);
      this.drawFlags(game, time);
      if (game.combat) this.drawCombatAir(game, time);
      this.drawBeams(dt);
      this.abilityFx.setReduced(this.reducedEffects);
      this.abilityFx.setCrowd(game.mode === 'todos');
      this.abilityFx.setAim(
        this.aimPreview && game.phase === 'play' && game.human.alive
          ? { x: this.aimPreview.x, y: this.aimPreview.y, ang: this.aimPreview.ang, dist: this.aimPreview.dist, color: this.aimPreview.color, charge: this.aimPreview.charge, outOfRange: this.aimPreview.outOfRange }
          : null,
      );
      this.abilityFx.step(dt);
      if (this.aimPreview && game.phase === 'play' && game.human.alive) drawAimPreview(this.ctx, this.aimPreview, time);
      this.drawZaps(dt);
      this.drawBushes(a, time);
      this.drawHazardsTop(game, t, time);
    }
    if (game.phase === 'play' && !this.showcase) this.drawHitDirs(game, dt);
    // quedas e derrota do Chefe continuam mesmo na transição de fim de rodada
    this.tickAnim(dt);
    this.drawFalls(game, dt, time);
    this.drawParticles(dt);

    if (game.phase === 'prep' && !this.showcase) this.drawPrepHints(game, time);

    if (this.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 1.6);
    }
  }

  private drawDynamic(game: Game, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    const t = game.worldT;
    const P = a.palette;

    // pontes
    for (const b of a.bridges ?? []) {
      const s = bridgeState(b, t);
      if (s === 'off') {
        ctx.strokeStyle = 'rgba(140,220,255,0.25)';
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
        ctx.setLineDash([]);
        continue;
      }
      const blink = s === 'warn' ? (Math.sin(time * 22) > 0 ? 0.35 : 0.9) : 0.9;
      ctx.globalAlpha = blink;
      const gr = b.vertical ? ctx.createLinearGradient(b.x, 0, b.x + b.w, 0) : ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, 'rgba(120,220,255,0.55)');
      gr.addColorStop(0.5, 'rgba(200,250,255,0.85)');
      gr.addColorStop(1, 'rgba(120,220,255,0.55)');
      ctx.fillStyle = gr;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = s === 'warn' ? '#ff8a1e' : '#e8fbff';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
    }

    // esteiras animadas
    for (const cv of a.conveyors ?? []) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cv.x, cv.y, cv.w, cv.h);
      ctx.clip();
      const off = ((t * cv.vx) % 40 + 40) % 40;
      ctx.strokeStyle = 'rgba(255,170,80,0.35)';
      ctx.lineWidth = 4;
      for (let x = cv.x - 40 + off; x < cv.x + cv.w + 40; x += 40) {
        const dir = Math.sign(cv.vx);
        ctx.beginPath();
        ctx.moveTo(x - 8 * dir, cv.y + 12);
        ctx.lineTo(x + 6 * dir, cv.y + cv.h / 2);
        ctx.lineTo(x - 8 * dir, cv.y + cv.h - 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    // portais (apagados com contagem enquanto VOCÊ ainda não pode usar de novo)
    const meP = game.players.find((q) => q.id === this.meId(game));
    const pcd = !this.showcase && meP ? meP.portalCd : 0;
    for (const pair of a.portals ?? []) {
      for (const p of pair) {
        if (pcd > 0) {
          ctx.save();
          ctx.globalAlpha = 0.35;
        }
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = pcd > 0 ? hexA('#8a8aa0', 0.8 - i * 0.22) : hexA('#c77dff', 0.8 - i * 0.22);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 24 - i * 6, time * (2 + i) + i, time * (2 + i) + i + Math.PI * 1.4);
          ctx.stroke();
        }
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
        gr.addColorStop(0, 'rgba(199,125,255,0.6)');
        gr.addColorStop(1, 'rgba(199,125,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
        ctx.fill();
        if (pcd > 0) {
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.font = '700 15px "Chakra Petch", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.strokeText(String(Math.ceil(pcd)), p.x, p.y);
          ctx.fillText(String(Math.ceil(pcd)), p.x, p.y);
        }
      }
      ctx.strokeStyle = 'rgba(199,125,255,0.08)';
      ctx.setLineDash([3, 12]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pair[0].x, pair[0].y);
      ctx.lineTo(pair[1].x, pair[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // poço gravitacional
    for (const w of a.wells ?? []) {
      const gr = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.range);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.15, 'rgba(40,0,60,0.9)');
      gr.addColorStop(0.4, 'rgba(160,60,255,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.range, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const r = w.range * (((1 - ((time * 0.35 + i / 5) % 1)) * 0.85) + 0.1);
        ctx.strokeStyle = `rgba(255,93,240,${0.35 * (r / w.range)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, time + i, time + i + Math.PI * 1.2);
        ctx.stroke();
      }
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff5df0';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    this.drawTune(a, t, 'floor');

    // núcleo (só no modo Núcleo)
    if (!game.combat) this.drawCore(game, time);

    // zonas elétricas (aviso/ativas)
    for (let i = 0; i < a.zones.length; i++) {
      const s = game.zoneState(i);
      if (s === 'off') continue;
      const z = a.zones[i];
      if (s === 'warn') {
        const blink = 0.35 + 0.35 * Math.sin(time * 18);
        ctx.fillStyle = hexA(P.hazard, 0.12 + blink * 0.25);
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.hazard;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -time * 40;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.font = `700 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', z.x, z.y);
      } else if (a.zoneStyle && a.zoneStyle !== 'eletrico') {
        this.drawZoneStyled(a.zoneStyle, z.x, z.y, z.r, time, i);
      } else {
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        gr.addColorStop(0, hexA('#ffe08a', 0.75));
        gr.addColorStop(0.6, hexA(P.hazard, 0.55));
        gr.addColorStop(1, hexA(P.hazard, 0.2));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff6c8';
        ctx.lineWidth = 2;
        for (let j = 0; j < 5; j++) {
          const a0 = Math.random() * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          let px = z.x;
          let py = z.y;
          for (let s2 = 1; s2 <= 4; s2++) {
            px = z.x + Math.cos(a0 + (Math.random() - 0.5) * 0.8) * (z.r * s2) / 4;
            py = z.y + Math.sin(a0 + (Math.random() - 0.5) * 0.8) * (z.r * s2) / 4;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    }

    // lava borbulhando
    for (const l of a.lava ?? []) {
      const gr = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r + 10);
      gr.addColorStop(0, '#fff2a0');
      gr.addColorStop(0.35, '#ffb020');
      gr.addColorStop(0.8, '#ff4a10');
      gr.addColorStop(1, 'rgba(120,20,0,0.0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        const rr2 = l.r + Math.sin(ang * 5 + time * 2 + l.x) * 3;
        ctx.lineTo(l.x + Math.cos(ang) * rr2, l.y + Math.sin(ang) * rr2 * 0.85);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a1004';
      ctx.lineWidth = 4;
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const ph = (time * 0.8 + k * 0.27 + l.x * 0.01) % 1;
        const bx = l.x + Math.cos(k * 2.3 + l.y) * l.r * 0.5;
        const by = l.y + Math.sin(k * 1.7 + l.x) * l.r * 0.4;
        ctx.strokeStyle = `rgba(255,240,180,${0.8 * (1 - ph)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + ph * 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // aviso do trem (luzes vermelhas nos trilhos)
    for (const tr of a.trains ?? []) {
      const st = trainState(tr, t);
      if (st.phase === 'idle') continue;
      const on = Math.sin(time * 18) > 0;
      ctx.fillStyle = hexA('#ff3b5c', st.phase === 'warn' ? (on ? 0.28 : 0.1) : 0.15);
      ctx.fillRect(BORDER, tr.y, WORLD_W - BORDER * 2, tr.h);
      for (let x = BORDER + 30; x < WORLD_W - BORDER; x += 120) {
        ctx.fillStyle = on ? '#ff3b5c' : '#5a1020';
        ctx.beginPath();
        ctx.arc(x, tr.y - 3, 4, 0, Math.PI * 2);
        ctx.arc(x, tr.y + tr.h + 3, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (st.phase === 'warn') {
        const ax = tr.dir > 0 ? 80 : WORLD_W - 80;
        label(ctx, ax, tr.y + tr.h / 2, tr.dir > 0 ? 'TREM ▶▶' : '◀◀ TREM', '#ff6a7a', 18);
      }
    }
    // vórtices (buracos negros da Mei)
    for (const v of (game as any).vortexes ?? []) {
      const k = Math.min(1, (2.5 - v.t) * 4, v.t * 4);
      const gr = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.r);
      gr.addColorStop(0, `rgba(0,0,0,${0.95 * k})`);
      gr.addColorStop(0.18, `rgba(40,20,90,${0.85 * k})`);
      gr.addColorStop(0.5, `rgba(140,124,255,${0.18 * k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.r, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(190,180,255,${0.55 * k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r0 = v.r * (0.25 + i * 0.18);
        ctx.arc(v.x, v.y, r0, -time * (5 - i) + i, -time * (5 - i) + i + Math.PI * 0.9);
        ctx.stroke();
      }
      if (!this.reducedEffects && Math.random() < 0.6) {
        const ang = Math.random() * Math.PI * 2;
        this.particles.push({ x: v.x + Math.cos(ang) * v.r, y: v.y + Math.sin(ang) * v.r, vx: -Math.cos(ang) * v.r * 2, vy: -Math.sin(ang) * v.r * 2, life: 0, max: 0.45, color: '#c8c0ff', size: 2, kind: 'spark' });
      }
    }
    this.drawModeGround(game, time);

    // pistões
    for (const p of a.pistons ?? []) {
      const s = pistonState(p, t);
      if (s.phase === 'warn') {
        ctx.fillStyle = hexA(P.hazard, 0.15 + 0.2 * (Math.sin(time * 20) > 0 ? 1 : 0));
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      const h = Math.max(0, s.ext) * p.h;
      ctx.fillStyle = '#6d5a4c';
      ctx.fillRect(p.x + p.w / 2 - 8, p.y - 6, 16, h + 6);
      ctx.fillStyle = '#8f7766';
      ctx.fillRect(p.x, p.y + h - 22, p.w, 22);
      stripes(ctx, p.x, p.y + h - 8, p.w, 8, '#ffb000', '#1a1208');
    }
  }

  private drawTune(a: ArenaDef, t: number, layer: 'floor' | 'air') {
    const ctx = this.ctx;
    for (const s of tuneShapes(a, t, this.reducedEffects)) {
      if (s.layer !== layer) continue;
      this.paintTune(s);
    }
  }

  private paintTune(s: TuneShape) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.line ?? (s.dash ? 3 : 4);
    if (s.dash) ctx.setLineDash([8, 6]);
    if (s.kind === 'ring' && s.r) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === 'rect') {
      ctx.strokeRect(s.x, s.y, s.w ?? 0, s.h ?? 0);
      ctx.globalAlpha = s.alpha * 0.35;
      ctx.fillRect(s.x, s.y, s.w ?? 0, s.h ?? 0);
    } else if (s.kind === 'seg') {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x2 ?? s.x, s.y2 ?? s.y);
      ctx.stroke();
    } else if (s.kind === 'dot') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r ?? 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHazardsTop(game: Game, t: number, time: number) {
    const ctx = this.ctx;
    const a = game.arena;
    this.drawTune(a, t, 'air');
    // trens
    for (const tr of a.trains ?? []) {
      const st = trainState(tr, t);
      if (st.phase !== 'pass') continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(BORDER, tr.y - 20, WORLD_W - BORDER * 2, tr.h + 30);
      ctx.clip();
      const cars = 4;
      const cw = (st.x1 - st.x0) / cars;
      for (let i = 0; i < cars; i++) {
        const x = st.x0 + i * cw;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + 4, tr.y + 8, cw - 6, tr.h);
        const gr = ctx.createLinearGradient(0, tr.y - 14, 0, tr.y + tr.h);
        gr.addColorStop(0, '#e8ecf6');
        gr.addColorStop(0.5, '#9aa4bc');
        gr.addColorStop(1, '#4a5268');
        ctx.fillStyle = gr;
        rr(ctx, x + 2, tr.y - 12, cw - 4, tr.h + 4, 10);
        ctx.fill();
        ctx.strokeStyle = '#141826';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ff4fd8';
        ctx.fillRect(x + 2, tr.y + tr.h * 0.45, cw - 4, 5);
        ctx.fillStyle = '#1a2a48';
        for (let w = 0; w < 4; w++) ctx.fillRect(x + 14 + w * ((cw - 28) / 4), tr.y - 4, (cw - 28) / 4 - 8, 14);
      }
      // farol
      const hx = tr.dir > 0 ? st.x1 : st.x0;
      const gl = ctx.createRadialGradient(hx, tr.y + tr.h / 2, 0, hx, tr.y + tr.h / 2, 90);
      gl.addColorStop(0, 'rgba(255,250,200,0.8)');
      gl.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(hx - 90, tr.y - 30, 180, tr.h + 60);
      ctx.restore();
    }
    // tornado
    for (const td of a.tornados ?? []) {
      const c = tornadoPos(td, t);
      for (let i = 0; i < 7; i++) {
        const y = c.y - i * 14;
        const r = td.r * (0.45 + i * 0.16);
        const wob = Math.sin(time * 6 + i) * 6;
        ctx.strokeStyle = `rgba(200,160,100,${0.65 - i * 0.06})`;
        ctx.lineWidth = 5 - i * 0.4;
        ctx.beginPath();
        ctx.ellipse(c.x + wob, y, r, r * 0.32, 0, time * 8 + i, time * 8 + i + Math.PI * 1.6);
        ctx.stroke();
      }
      if (!this.reducedEffects && Math.random() < 0.7) {
        const ang = Math.random() * Math.PI * 2;
        this.particles.push({ x: c.x + Math.cos(ang) * td.r, y: c.y + Math.sin(ang) * td.r * 0.4, vx: -Math.sin(ang) * 160, vy: -60 - Math.random() * 60, life: 0, max: 0.7, color: '#d9b072', size: 2.4, kind: 'spark' });
      }
    }
    // vento
    if (a.wind) {
      const w = windState(a.wind, t);
      if (w.phase !== 'idle') {
        const n = w.phase === 'blow' ? 40 : 12;
        ctx.strokeStyle = w.phase === 'blow' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) {
          const y = BORDER + ((i * 97.3) % (WORLD_H - BORDER * 2));
          const sp = w.phase === 'blow' ? 900 : 200;
          const x = ((i * 211 + time * sp * w.dir) % WORLD_W + WORLD_W) % WORLD_W;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - w.dir * (w.phase === 'blow' ? 50 : 20), y);
          ctx.stroke();
        }
        if (w.phase === 'warn') label(ctx, 640, 70, w.dir > 0 ? 'VENTO ▶▶▶' : '◀◀◀ VENTO', '#ffffff', 22);
      }
    }
    this.drawModeTop(game, time);
    for (const b of a.beams ?? []) {
      const ang = beamAngle(b, t);
      const ex = b.x + Math.cos(ang) * b.len;
      const ey = b.y + Math.sin(ang) * b.len;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,90,30,0.35)';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#fff2c8';
      ctx.lineWidth = 3;
      ctx.stroke();
      // rastro de giro
      ctx.strokeStyle = 'rgba(255,140,60,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.len, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#4a2a10';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7a1e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const l of a.lasers ?? []) {
      const x = laserX(l, t);
      ctx.fillStyle = 'rgba(255,74,110,0.18)';
      ctx.fillRect(x - 14, l.y0, 28, l.y1 - l.y0);
      ctx.strokeStyle = '#ff4a6e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, l.y0);
      ctx.lineTo(x, l.y1);
      ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const y of [l.y0, l.y1]) {
        ctx.fillStyle = '#3a2d73';
        rr(ctx, x - 12, y - 7, 24, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#ff4a6e';
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  private drawCore(game: Game, time: number) {
    const ctx = this.ctx;
    const c = game.core;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const gr = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, C.CORE_R);
    gr.addColorStop(0, 'rgba(180,255,200,0.9)');
    gr.addColorStop(0.35, 'rgba(93,255,138,0.45)');
    gr.addColorStop(1, 'rgba(93,255,138,0.04)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, C.CORE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5dff8a';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 8]);
    ctx.lineDashOffset = time * 30;
    ctx.beginPath();
    ctx.arc(c.x, c.y, C.CORE_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // cristal
    ctx.save();
    ctx.translate(c.x, c.y - 6 - pulse * 4);
    ctx.rotate(time * 0.8);
    ctx.fillStyle = '#c8ffd8';
    ctx.strokeStyle = '#1fbf5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (game.coreNext) {
      const n = game.coreNext;
      ctx.strokeStyle = Math.sin(time * 14) > 0 ? '#5dff8a' : 'rgba(93,255,138,0.3)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(n.x, n.y, C.CORE_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, n.x, n.y - C.CORE_R - 12, 'NÚCLEO VAI MUDAR', '#5dff8a', 14);
    }
    if (game.goldenSpot && !game.fragments.some((f) => f.golden) && !game.goldenDone) {
      const s = game.goldenSpot;
      ctx.strokeStyle = Math.sin(time * 12) > 0 ? '#ffd23e' : 'rgba(255,210,62,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, s.x, s.y - 34, 'DOURADO', '#ffd23e', 13);
    }
  }

  private drawFragments(game: Game, time: number) {
    const ctx = this.ctx;
    for (const f of game.fragments) {
      const bob = Math.sin(time * 4 + f.id) * 3;
      const col = f.golden ? '#ffd23e' : '#5dff8a';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 8, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const gr = ctx.createRadialGradient(f.x, f.y + bob, 0, f.x, f.y + bob, f.golden ? 26 : 18);
      gr.addColorStop(0, hexA(col, 0.55));
      gr.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(f.x, f.y + bob, f.golden ? 26 : 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(f.x, f.y + bob - 2);
      const s = f.golden ? 1.4 : 1;
      ctx.scale(s, s);
      ctx.fillStyle = f.golden ? '#fff1b0' : '#c8ffd8';
      ctx.strokeStyle = f.golden ? '#c78a00' : '#1fbf5a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, -2);
      ctx.lineTo(0, 9);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** o Eco pode machucar/empurrar VOCÊ? (aliados e o seu, em times, não atrapalham) */
  private echoHarmsMe(game: Game, e: EchoView) {
    const me = game.human;
    const own = e.rec.playerId === me.id;
    const teams = (game as any).rules?.teams;
    if (teams) {
      if (own) return false;
      const o = game.players.find((p) => p.id === e.rec.playerId);
      return !o || o.team !== me.team;
    }
    return own ? ((game as any).cfg?.ownEchoDamage ?? true) : true;
  }

  private drawEchoes(game: Game, time: number) {
    const ctx = this.ctx;
    const prep = game.phase === 'prep';
    const digests: Map<string, EchoDigest> | undefined = (game as any).echoDigests;
    const tms = game.roundT * 1000;
    const me = game.human;
    // preparação: rota inteira de cada Eco e onde ele vai atirar/jogar bomba/mina (ou entregar)
    if (prep && digests) for (const e of game.echoViews) {
      const d = digests.get(e.key);
      if (d) drawRoutePreview(ctx, d, time, [0.9, 0.65, 0.45][Math.min(2, e.age)] ?? 0.45, game.combat);
    }
    for (const e of game.echoViews) {
      const was = this.echoWasActive.get(e.key);
      if (was && !e.active && game.phase === 'play' && !tuneHides(game.arena, e.x, e.y, game.worldT)) this.burst(e.x, e.y, e.rec.color, 12, 120);
      this.echoWasActive.set(e.key, e.active);
      // voltou a funcionar depois de desativado
      const wasOff = this.echoWasOff.get(e.key) ?? false;
      if (wasOff && !e.disrupted && e.active && game.phase === 'play') {
        this.ring(e.x, e.y - 20, e.rec.color, 46);
        this.text(e.x, e.y - 70, 'ECO VOLTOU', e.rec.color, 12);
      }
      this.echoWasOff.set(e.key, e.disrupted);
      if (!e.active) continue;
      if (tuneGlow(game.arena, e.x, e.y, game.worldT)) {
        ctx.strokeStyle = hexA('#fff6c2', this.reducedEffects ? 0.45 : 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 16, this.reducedEffects ? 18 : 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      const ch = getCharacter(e.rec.characterId);
      const harms = this.echoHarmsMe(game, e);
      const baseAlpha = [0.85, 0.62, 0.42][Math.min(2, e.age)] ?? 0.4;
      let alpha = baseAlpha;
      if (e.disrupted) alpha *= 0.3;
      if (e.expiring && game.phase === 'play' && game.timeLeft() < 6) alpha *= 0.55 + 0.45 * Math.sin(time * 14);
      if (prep) alpha *= 0.8 + 0.2 * Math.sin(time * 5);
      const d = digests?.get(e.key);

      // rastro
      if (this.showTrails && e.trail.length > 2) {
        ctx.strokeStyle = hexA(e.rec.color, 0.25 * baseAlpha);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        e.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      // para onde ele vai no próximo segundo (rota gravada)
      if (this.showTrails && d && game.phase === 'play' && !e.disrupted && !e.iced) drawRouteAhead(ctx, d, tms, 1000, e.rec.color, 0.5 * baseAlpha);
      // anel no chão: cheio = pode bloquear/machucar você; tracejado cinza = não atrapalha (aliado)
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = harms ? e.rec.color : 'rgba(200,210,230,0.7)';
      ctx.lineWidth = harms ? 2.5 : 1.5;
      ctx.setLineDash(!harms ? [3, 5] : e.expiring ? [4, 4] : []);
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 2, C.ECHO_R + 2, (C.ECHO_R + 2) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // perto de você e perigoso: aviso de contato
      const near = harms && !e.disrupted && !e.iced && game.phase === 'play' && me.alive && Math.hypot(me.x - e.x, me.y - e.y) < 110;
      if (near) {
        const pk = 0.5 + 0.5 * Math.sin(time * 12);
        ctx.strokeStyle = `rgba(255,70,70,${0.45 + 0.4 * pk})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 2, C.ECHO_R + 9, (C.ECHO_R + 9) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // pulso antes de impulso/habilidade gravados
      if (e.pulse > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 26, 16 + e.pulse * 22, 0, Math.PI * 2);
        ctx.globalAlpha = alpha * (1 - e.pulse);
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
      // aviso antes de repetir tiro/bomba/mina que estão na gravação
      if ((e.warn ?? 0) > 0 && harms) {
        const w = e.warn ?? 0;
        ctx.globalAlpha = Math.min(1, 0.4 + w * 0.6);
        if (e.warnKind === 0) {
          const a = e.warnAng ?? 0;
          ctx.strokeStyle = hexA(e.rec.color, 0.85);
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * 14, e.y - 24 + Math.sin(a) * 14);
          ctx.lineTo(e.x + Math.cos(a) * (30 + 60 * w), e.y - 24 + Math.sin(a) * (30 + 60 * w));
          ctx.stroke();
          ctx.setLineDash([]);
        } else drawMarkIcon(ctx, e.warnKind === 1 ? 1 : 2, e.x, e.y - 112, 0, e.rec.color, 1 + w * 0.3);
        ctx.globalAlpha = alpha;
      }
      const { facing, flip } = facingOf(e.dir);
      const frame = e.moving ? Math.floor(((time * 11) / (Math.PI * 2)) * WALK_FRAMES) % WALK_FRAMES : Math.floor((time * 3.4) % WALK_FRAMES);
      const tint = e.iced ? '#b8e6ff' : e.disrupted ? '#8a92a8' : e.rec.color;
      const img = this.sprites.get(ch, facing, e.iced ? 0 : frame, e.moving && !e.iced && !e.disrupted, tint);
      ctx.globalCompositeOperation = 'lighter';
      this.sprites.draw(ctx, img, e.x, e.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      // contorno holográfico: o Eco não se confunde com um jogador ou um bot
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha + 0.25);
      ctx.strokeStyle = e.iced ? '#b8e6ff' : '#d7f7ff';
      ctx.shadowColor = e.rec.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 28, 16, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      if (e.iced) {
        ctx.strokeStyle = 'rgba(200,240,255,0.9)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const a0 = (k / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a0) * 9, e.y - 30 + Math.sin(a0) * 9);
          ctx.lineTo(e.x - Math.cos(a0) * 9, e.y - 30 - Math.sin(a0) * 9);
          ctx.stroke();
        }
      }
      // desativado: anel de contagem até voltar
      if (e.disrupted) {
        const left = Math.max(0, e.offLeft ?? 0);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 28, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = e.rec.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 28, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, left / 3));
        ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, alpha + 0.25);
      // de quem é + rodada (+ estado)
      const mine = e.rec.playerId === me.id;
      const owner = game.players.find((p) => p.id === e.rec.playerId);
      const who = mine ? 'SEU ECO' : `ECO ${(owner?.name || owner?.char.name || ch.name).replace(/ \(bot\)$/, '').toUpperCase()}`;
      const state = e.disrupted ? ` · OFF ${Math.ceil(e.offLeft ?? 0)}s` : !harms ? (mine ? ' · INOFENSIVO' : ' · ALIADO') : near ? (game.combat ? ' · −12' : ' · −1♥') : '';
      const tag = `${who} · R${e.rec.round}${state}`;
      ctx.font = `700 ${mine ? 12 : 11}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(tag).width + 18;
      const tx = e.x - tw / 2;
      ctx.fillStyle = near ? 'rgba(60,8,14,0.82)' : 'rgba(8,6,22,0.7)';
      rr(ctx, tx - 3, e.y - 98, tw + 6, 16, 8);
      ctx.fill();
      drawSymbol(ctx, ch.id, tx + 7, e.y - 90, 6, e.rec.color);
      ctx.fillStyle = near ? '#ffb0b0' : mine ? '#ffffff' : e.rec.color;
      ctx.fillText(tag, tx + 15, e.y - 90);
      ctx.globalAlpha = 1;
    }
  }

  private drawClones(game: Game, time: number) {
    const ctx = this.ctx;
    this.abilityFx.drawUltZones(ctx, game.ultZones ?? [], time);
    for (const g of game.groves ?? []) {
      ctx.strokeStyle = hexA('#3dcc6a', 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.stroke();
      if (!this.reducedEffects && Math.random() < 0.3 && this.particles.length < 120) this.burst(g.x, g.y, '#5dffb8', 2, 40);
    }
    for (const c of game.clones) {
      const owner = game.players.find((p) => p.id === c.owner);
      if (!owner) continue;
      const { facing, flip } = facingOf(c.dir);
      const frame = Math.floor(time * 14) % WALK_FRAMES;
      const img = this.sprites.get(owner.char, facing, frame, true, '#7dffef');
      ctx.globalAlpha = c.decoy ? 0.55 : 0.5 + 0.3 * Math.sin(time * 30);
      this.sprites.draw(ctx, img, c.x, c.y + 4, flip, SPRITE_SCALE * 0.85);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(game: Game, p: Player, time: number) {
    const ctx = this.ctx;
    const human = p.id === this.meId(game);
    let alpha = 1;
    if (p.hidden && p.phaseT <= 0) alpha = human ? 0.55 : 0.14;
    if (p.cloakT > 0 && !human && game.hostile(game.human, p)) alpha = 0.06;
    else if (p.cloakT > 0) alpha = Math.min(alpha, 0.45);
    if (p.phaseT > 0) alpha = 0.3 + 0.15 * Math.sin(time * 30);
    if (tuneHides(game.arena, p.x, p.y, game.worldT) && !human && game.hostile(game.human, p)) alpha = 0.08;
    const ash = (game.patches ?? []).some((z) => z.kind === 'ash' && z.t > 0 && Math.hypot(p.x - z.x, p.y - z.y) < z.r);
    if (ash && !human) alpha = Math.min(alpha, 0.38);
    if (p.invulnT > 0 && Math.sin(time * 30) > 0.3) alpha *= 0.45;

    // sombra + anel de cor
    ctx.globalAlpha = alpha;
    if (p.boss) drawBossUnder(ctx, p, time);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 6, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = human ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, C.PLAYER_R + 3, (C.PLAYER_R + 3) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (p.team >= 0 && game.mode === 'dupla') {
      // anel do time
      ctx.strokeStyle = TEAM_COLORS[p.team];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, C.PLAYER_R + 8, (C.PLAYER_R + 8) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // investida: poeira e linhas de impacto
    if (p.chargeT > 0 && !this.reducedEffects) {
      for (let i = 0; i < 2; i++)
        this.particles.push({ x: p.x - Math.cos(p.dir) * 14 + (Math.random() - 0.5) * 16, y: p.y + (Math.random() - 0.5) * 6, vx: -Math.cos(p.dir) * 120, vy: -40 - Math.random() * 40, life: 0, max: 0.5, color: '#c8a070', size: 4, kind: 'spark' });
      ctx.strokeStyle = hexA(p.color, 0.8);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.dir) * 18, p.y - 22 + Math.sin(p.dir) * 10, 24, p.dir - 1, p.dir + 1);
      ctx.stroke();
    }
    // lento (gelo / areia / fumaça)
    this.abilityFx.setReduced(this.reducedEffects);
    // queimando, congelado/lento, raiz, tonto, eletrizado, vento e marca: tudo no AbilityVfx (um desenho só)
    this.abilityFx.drawStatus(ctx, p, time);
    if (p.vampT > 0 && Math.random() < 0.2 && !this.reducedEffects)
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - 30, vx: 0, vy: -40, life: 0, max: 0.6, color: '#ff3b6b', size: 2.6, kind: 'spark' });

    // turbo: imagens residuais
    if ((p.turboT > 0 || p.dashT > 0) && !this.reducedEffects) {
      ctx.strokeStyle = hexA(p.color, 0.5);
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        const bx = p.x - Math.cos(p.dir) * i * 12;
        const by = p.y - Math.sin(p.dir) * i * 12;
        ctx.beginPath();
        ctx.moveTo(bx - Math.sin(p.dir) * 8, by - 20 + Math.cos(p.dir) * 8);
        ctx.lineTo(bx - Math.cos(p.dir) * 14, by - 20 - Math.sin(p.dir) * 14);
        ctx.stroke();
      }
    }

    // no combate o corpo vira para onde a arma aponta
    const { facing, flip } = facingOf(game.combat ? p.aim : p.dir);
    // parado: quadros de respiração; andando: passos
    const idleFrame = Math.floor((time * 3.4 + p.id.length * 1.7) % WALK_FRAMES);
    const frame = p.moving ? Math.floor((p.walkPhase / (Math.PI * 2)) * WALK_FRAMES) % WALK_FRAMES : idleFrame;
    const expr = this.exprOf(game, p, time);
    const an = this.animOf(p.id);
    if (p.boss) {
      this.drawBoss(game, p, time, an);
      return;
    }
    // pose de lançar habilidade (braço estendido) por um instante
    const img = this.sprites.get(p.char, facing, frame, p.moving, null, expr, an.cast > 0.2 || p.castT > 0 ? 'cast' : 'normal');
    const gunBehind = game.combat && Math.sin(p.aim) < -0.45;
    // recuo do tiro: o corpo e a arma vão um pouco para trás (impacto e recuperação)
    const rk = an.recoil * an.recoil * 3;
    const rx = -Math.cos(p.aim) * rk;
    const ry = -Math.sin(p.aim) * rk * 0.5;
    const powers = game.mode === 'duelo' || game.mode === 'dupla' || game.mode === 'todos';
    if (game.combat && human && p.alive && !powers) this.drawAimGuide(game, p, time);
    ctx.save();
    ctx.translate(rx, ry);
    if (gunBehind && !powers) this.drawGun(p);
    // vida: inclina ao correr, pula de alegria, amassa ao levar dano
    const sp = Math.hypot(p.vx, p.vy);
    const targetLean = p.moving ? Math.max(-0.18, Math.min(0.18, (p.vx / C.SPEED) * 0.16)) : 0;
    const leanPrev = this.bodyLean.get(p.id) ?? 0;
    const lean = leanPrev + (targetLean - leanPrev) * 0.2;
    this.bodyLean.set(p.id, lean);
    const mood = this.moods.get(p.id);
    const happy = mood && mood.expr === 'happy' && mood.until > performance.now() / 1000;
    const hop = happy ? Math.abs(Math.sin(time * 13)) * 7 : 0;
    const hf = Math.min(0.35, p.hitFlash);
    const sx = hf > 0 ? 1 + hf * 0.45 : p.dashT > 0 ? 1.1 : 1;
    const sy = hf > 0 ? 1 - hf * 0.35 : p.dashT > 0 ? 0.92 : 1;
    ctx.save();
    ctx.translate(p.x, p.y + 4 - hop);
    // esquiva: rolamento completo
    if (p.dodgeT > 0) {
      const k = 1 - p.dodgeT / 0.22;
      ctx.translate(0, -30);
      ctx.rotate(k * Math.PI * 2 * (Math.cos(p.dir) < 0 ? -1 : 1));
      ctx.translate(0, 30);
    }
    ctx.rotate(lean);
    ctx.scale(sx, sy);
    // carregando um golpe: brilho de aviso para todos
    if (p.castT > 0 && !this.reducedEffects) {
      ctx.shadowColor = '#ff5a3c';
      ctx.shadowBlur = 18 + Math.sin(time * 30) * 6;
    }
    this.sprites.draw(ctx, img, 0, 0, flip, SPRITE_SCALE);
    if ((p.ruptureT ?? 0) > 0) {
      ctx.save();
      ctx.translate(0, -78);
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.filter = 'none';
    ctx.restore();
    // poeira nos passos
    if (p.moving && sp > 120 && !this.reducedEffects && !game.arena.islands) {
      const last = this.dustAt.get(p.id) ?? 0;
      if (time - last > (p.dashT > 0 ? 0.03 : 0.16)) {
        this.dustAt.set(p.id, time);
        const dc = game.arena.id === 'gelo' ? 'rgba(255,255,255,0.7)' : game.arena.id === 'deserto' ? 'rgba(230,190,120,0.6)' : 'rgba(200,190,255,0.35)';
        this.particles.push({ x: p.x - Math.cos(p.dir) * 8 + (Math.random() - 0.5) * 8, y: p.y + 2, vx: -p.vx * 0.12, vy: -20 - Math.random() * 20, life: 0, max: 0.45, color: dc, size: 3 + Math.random() * 2, kind: 'spark' });
      }
    }
    if (game.combat && !gunBehind && !powers) this.drawGun(p);
    ctx.restore();
    if (p.hitFlash > 0) {
      ctx.globalAlpha = p.hitFlash * 2;
      ctx.globalCompositeOperation = 'lighter';
      const red = this.sprites.get(p.char, facing, frame, p.moving, '#ff3a3a');
      this.sprites.draw(ctx, red, p.x, p.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }

    // escudo de energia hexagonal
    if (p.shieldT > 0) this.drawShieldDome(p.x, p.y - 30, 42, time, p.shieldT < 0.6 && Math.sin(time * 30) > 0);
    // ímã
    if (p.magnetT > 0) {
      ctx.strokeStyle = hexA('#3ee8ff', 0.35 + 0.2 * Math.sin(time * 8));
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 10, 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.doubleNext) label(ctx, p.x + 22, p.y - 40, 'x2', '#ff7a59', 14);
    if (game.combat) {
      // barra de vida (o Chefe tem a dele no topo da tela)
      const bw = p.boss ? 96 : 44;
      const bx = p.x - bw / 2;
      const by = p.y - (p.boss ? 140 : 84);
      ctx.fillStyle = 'rgba(8,6,22,0.8)';
      rr(ctx, bx - 2, by - 2, bw + 4, 9, 4);
      ctx.fill();
      const f = Math.max(0, p.hp / (p.maxHp || MAX_HP));
      ctx.fillStyle = f > 0.5 ? '#5dff8a' : f > 0.25 ? '#ffd23e' : '#ff4a4a';
      rr(ctx, bx, by, bw * f, 5, 2.5);
      ctx.fill();
      if (p.shieldHp > 0) {
        ctx.fillStyle = '#7ff0ff';
        rr(ctx, bx, by - 5, bw * Math.min(1, p.shieldHp / 50), 3, 1.5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,240,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 28, 36, 0, Math.PI * 2);
        ctx.stroke();
      }
      const lh = this.lastHit.get(p.id) ?? -99;
      drawStatus(ctx, game, p, time, !p.boss && p.hp < p.maxHp && performance.now() / 1000 - lh > 4);
    }
    // seta para o núcleo quando estiver carregando energia
    if (human && p.carry > 0) {
      const dx = game.core.x - p.x;
      const dy = game.core.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > C.CORE_R + 30) {
        const a = Math.atan2(dy, dx);
        const r = 54;
        const ax = p.x + Math.cos(a) * r;
        const ay = p.y - 14 + Math.sin(a) * r;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.scale(1.7, 1.7);
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 8);
        ctx.fillStyle = '#5dff8a';
        ctx.strokeStyle = '#0d3a1c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-6, -9);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-6, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    // energia carregada
    for (let i = 0; i < p.carry; i++) {
      const a = time * 3 + (i / Math.max(1, p.carry)) * Math.PI * 2;
      const ex = p.x + Math.cos(a) * 18;
      const ey = p.y - 82 + Math.sin(a) * 5;
      ctx.fillStyle = '#5dff8a';
      ctx.strokeStyle = '#0d5a26';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 6);
      ctx.lineTo(ex + 4.5, ey);
      ctx.lineTo(ex, ey + 6);
      ctx.lineTo(ex - 4.5, ey);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // marcador do jogador
    if (human) {
      const y = p.y - 92 + Math.sin(time * 5) * 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.x - 7, y - 8);
      ctx.lineTo(p.x + 7, y - 8);
      ctx.lineTo(p.x, y);
      ctx.closePath();
      ctx.fill();
    } else if (alpha > 0.3) {
      drawSymbol(ctx, p.char.id, p.x, p.y - 90, 6, p.color);
    }
    ctx.globalAlpha = 1;
  }

  private trailTimer = 0;
  private drawTrail(p: Player, time: number) {
    if (!p.moving || p.trail === 'nenhum' || this.reducedEffects) return;
    const tr = TRAILS.find((t) => t.id === p.trail);
    if (!tr || !tr.colors.length) return;
    if (Math.random() < 0.55) {
      const c = tr.colors[Math.floor(Math.random() * tr.colors.length)];
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 14,
        y: p.y - 4 + (Math.random() - 0.5) * 8,
        vx: -Math.cos(p.dir) * 40 + (Math.random() - 0.5) * 30,
        vy: -Math.sin(p.dir) * 40 - 20,
        life: 0,
        max: 0.5,
        color: c,
        size: p.trail === 'estrelas' ? 2.6 : 3.4,
        kind: 'spark',
      });
    }
    void time;
  }

  /** minas e bombas no chão (embaixo dos personagens) */
  private drawCombatGround(game: Game, time: number) {
    const ctx = this.ctx;
    for (const m of game.mines) {
      const armed = m.armT <= 0;
      ctx.fillStyle = '#2a3014';
      ctx.strokeStyle = '#0c0f04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = armed ? (Math.sin(time * 10) > 0 ? '#c8ff3c' : '#4a6010') : '#556';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (armed) {
        ctx.strokeStyle = 'rgba(200,255,60,0.18)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 34, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const bm of game.bombs) {
      if (bm.t < 0.35) continue;
      const fuse = bm.pulse ? PULSE_FUSE : BOMB_FUSE;
      const k = (bm.t - 0.35) / fuse;
      const rad = bm.pulse ? PULSE_RADIUS : bm.ice ? 110 : BOMB_RADIUS;
      ctx.strokeStyle = bm.pulse ? `rgba(190,140,255,${0.3 + k * 0.5})` : `rgba(255,90,60,${0.25 + k * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(bm.tx, bm.ty, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = bm.pulse ? `rgba(180,120,255,${0.1 + k * 0.14})` : `rgba(255,90,60,${0.08 + k * 0.12})`;
      ctx.fill();
    }
  }

  /** balas, bombas no ar e torretas (por cima de tudo) */
  private drawCombatAir(game: Game, time: number) {
    const ctx = this.ctx;
    for (const t of game.turrets) {
      const owner = game.players.find((p) => p.id === t.owner);
      const col = owner?.color ?? '#ffffff';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 4, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a5262';
      ctx.strokeStyle = '#141820';
      ctx.lineWidth = 2;
      rr(ctx, t.x - 11, t.y - 14, 22, 16, 5);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(t.x, t.y - 12);
      ctx.rotate(t.aim);
      ctx.fillStyle = '#9aa6bc';
      rr(ctx, -2, -3, 18, 6, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 12, 4 + Math.sin(time * 12) * 0.8, 0, Math.PI * 2);
      ctx.fill();
      // vida da torreta (dá para destruir)
      const tf = Math.max(0, Math.min(1, (t.hp ?? 40) / 40));
      ctx.fillStyle = 'rgba(8,6,22,0.8)';
      ctx.fillRect(t.x - 13, t.y - 26, 26, 5);
      ctx.fillStyle = tf > 0.4 ? '#9aa6bc' : '#ff5a5a';
      ctx.fillRect(t.x - 12, t.y - 25, 24 * tf, 3);
    }
    ctx.lineCap = 'round';
    for (const b of game.bullets) {
      const w = WEAPONS[b.weapon];
      const enemy = (b as any).owner === 'enemy';
      const col = enemy ? '#ff3b3b' : b.fromEcho ? '#b8e6ff' : w.color;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      // poderes (elemento, plasma, ataque básico): o efeito do elemento desenha (AbilityVfx), sem o risco reto
      if (!b.fromEcho && ((b as any).el || (b as any).plasma || (b as any).basic)) continue;
      if (b.weapon === 'acido') {
        ctx.fillStyle = 'rgba(182,255,62,0.3)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c6ff4a';
        ctx.strokeStyle = '#2a3a10';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      if (enemy) {
        ctx.fillStyle = hexA('#ff3b3b', 0.35);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd0d0';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (!this.reducedEffects && this.particles.length < 120 && Math.random() < 0.4) {
        this.particles.push({ x: b.x - (b.vx / sp) * 10, y: b.y - (b.vy / sp) * 10, vx: 0, vy: 0, life: 0, max: 0.22, color: col, size: 3, kind: 'spark' });
      }
      if (b.weapon === 'foguete') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#e8ecf6';
        ctx.strokeStyle = '#141018';
        ctx.lineWidth = 1.5;
        rr(ctx, -10, -4, 18, 8, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.moveTo(8, -4);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 4);
        ctx.fill();
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.moveTo(-10, -3);
        ctx.lineTo(-18 - Math.random() * 6, 0);
        ctx.lineTo(-10, 3);
        ctx.fill();
        ctx.restore();
        if (!this.reducedEffects) this.particles.push({ x: b.x - b.vx / sp * 14, y: b.y - b.vy / sp * 14, vx: 0, vy: -10, life: 0, max: 0.5, color: '#8a8a9a', size: 4, kind: 'spark' });
        continue;
      }
      const size = w.size ?? 2.5;
      if (size >= 6 && !b.fromEcho) {
        // projéteis grandes (orbe, punho)
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, size * 2.2);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.35, col);
        gr.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(b.x, b.y, size * 2.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const len = b.weapon === 'laser' || b.weapon === 'rifle' || b.weapon === 'besta' ? 40 : b.weapon === 'choque' ? 26 : 16;
      const tx = b.x - (b.vx / sp) * len;
      const ty = b.y - (b.vy / sp) * len;
      ctx.strokeStyle = hexA(col, 0.35);
      ctx.lineWidth = b.weapon === 'laser' ? 10 : size * 2.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.weapon === 'laser' ? 3.5 : Math.max(2, size);
      ctx.stroke();
      if (b.fromEcho) {
        ctx.strokeStyle = hexA('#b8e6ff', 0.8);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    this.abilityFx.sync(game.bullets);
    this.abilityFx.draw(this.ctx, time);
    for (const bm of game.bombs) {
      const k = Math.min(1, bm.t / 0.35);
      const arc = Math.sin(k * Math.PI) * 50;
      const x = bm.x;
      const y = bm.y - 10 - arc;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(bm.x, bm.y, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e1a2a';
      ctx.strokeStyle = '#0c0818';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const lit = bm.t > 0.35 && Math.sin(time * (14 + bm.t * 30)) > 0;
      ctx.fillStyle = bm.pulse ? (lit ? '#d7b4ff' : '#7a5cff') : lit ? '#ff3a1e' : '#ffb347';
      ctx.beginPath();
      ctx.arc(x + 4, y - 7, 3, 0, Math.PI * 2);
      ctx.fill();
      if (bm.t > 0.35) label(ctx, x, y - 22, String(Math.max(1, Math.ceil(BOMB_FUSE + 0.35 - bm.t))), '#ffd08a', 12);
    }
  }

  private drawPowerups(game: Game, time: number) {
    const ctx = this.ctx;
    for (const pw of game.powerups) {
      const def = getPower(pw.kind);
      const bob = Math.sin(time * 3 + pw.id) * 3;
      const appear = Math.min(1, pw.age * 3);
      const y = pw.y - 14 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(pw.x, pw.y + 6, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      const gr = ctx.createRadialGradient(pw.x, y, 2, pw.x, y, 30);
      gr.addColorStop(0, hexA(def.color, 0.5));
      gr.addColorStop(1, hexA(def.color, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(pw.x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(pw.x, y);
      ctx.scale(appear * 1.3, appear * 1.3);
      ctx.fillStyle = '#120c26';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = hexA(def.color, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 19, time * 2, time * 2 + Math.PI * 1.2);
      ctx.stroke();
      drawPowerIcon(ctx, pw.kind, 0, 0, 1, def.color);
      ctx.restore();
      label(ctx, pw.x, pw.y - 52 + bob, def.short.toUpperCase(), def.color, 13);
      const me = game.human;
      if (me?.alive && Math.hypot(me.x - pw.x, me.y - pw.y) < 110) {
        label(ctx, pw.x, pw.y - 70 + bob, def.name, '#ffffff', 12);
        const hint = def.desc.length > 46 ? def.desc.slice(0, 44) + '…' : def.desc;
        label(ctx, pw.x, pw.y - 86 + bob, hint, def.color, 11);
      }
    }
  }

  private drawBushes(a: ArenaDef, time: number) {
    const ctx = this.ctx;
    for (const b of a.bushes ?? []) {
      ctx.save();
      ctx.globalAlpha = 0.86;
      const lobes = 7;
      for (let i = 0; i < lobes; i++) {
        const ang = (i / lobes) * Math.PI * 2 + 0.3;
        const sway = Math.sin(time * 1.5 + i + b.x) * 2;
        ctx.fillStyle = i % 2 ? '#1f6b5a' : '#24806a';
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(ang) * b.r * 0.5 + sway, b.y + Math.sin(ang) * b.r * 0.45, b.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2fa585';
      ctx.beginPath();
      ctx.arc(b.x, b.y - 4, b.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(160,255,220,0.8)';
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.7 + b.x;
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(ang) * b.r * 0.6, b.y + Math.sin(ang) * b.r * 0.5, 1.6 + Math.sin(time * 3 + i) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** texto do comando para pular o Rebobinando (o main troca para "TOQUE" no celular) */
  skipLabel = 'ESPAÇO · PULAR';

  /**
   * Rebobinando: a rodada volta no tempo. Cada jogador vira um fantasma que refaz o caminho
   * ao contrário; as ações gravadas (tiros, bombas, minas, entregas…) aparecem quando o tempo passa
   * por elas, e no fim os fantasmas param no ponto onde o Eco vai começar a próxima rodada.
   */
  private drawRewind(game: Game, dt: number, time: number) {
    const ctx = this.ctx;
    const g = game as any;
    const digests: EchoDigest[] = g.lastDigests ?? [];
    const k = Math.min(1, game.phaseT / C.REWIND_TIME);
    // começa rápido e freia no fim (como fita voltando)
    const eased = 1 - Math.pow(1 - Math.min(1, k / 0.85), 2.2);
    const dur = game.roundDur * 1000;
    const tms = dur * (1 - eased);
    const fx = !this.reducedEffects;
    // começo do Rebobinando: some com os textos que sobraram da rodada (não cobrem a arena)
    if (game.phaseT < 0.1) for (const p of this.particles) if (p.kind === 'text' && p.life < p.max - 0.15) p.life = p.max - 0.15;
    // tom azul por cima da arena (o passado)
    ctx.fillStyle = 'rgba(20,40,110,0.4)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const pulse = 0.85 + Math.sin(time * 6) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    label(ctx, WORLD_W / 2, 58, 'REBOBINANDO', '#f4fbff', 32);
    label(ctx, WORLD_W / 2, 96, 'ECO GRAVADO · volta na próxima rodada', '#b7ecff', 16);
    ctx.restore();
    for (const d of digests) {
      const col = d.color;
      // parte já rebobinada (de agora até o fim): tracejado claro
      ctx.strokeStyle = hexA(col, 0.22);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 7]);
      traceRoute(ctx, d, tms, d.endT);
      ctx.stroke();
      ctx.setLineDash([]);
      // caminho que ainda falta voltar (do começo até o instante atual)
      ctx.strokeStyle = hexA(col, 0.55);
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      traceRoute(ctx, d, 0, Math.min(tms, d.endT));
      ctx.stroke();
      // ações gravadas: surgem quando o tempo volta por elas
      for (const m of d.marks) {
        if (m[0] < tms) continue;
        const since = (m[0] - tms) / 260;
        const pop = since < 1 ? 1 + (1 - since) * 0.8 : 1;
        // tiros somem aos poucos depois de passar (não viram uma nuvem); o resto fica marcado
        const shot = m[1] === 0;
        ctx.globalAlpha = shot ? Math.max(0.12, Math.min(1, 0.35 + since) * (since > 4 ? Math.max(0.15, 1 - (since - 4) / 6) : 1)) : Math.min(1, 0.35 + since);
        drawMarkIcon(ctx, m[1], m[2], m[3] - 18, m[4], col, pop);
      }
      ctx.globalAlpha = 1;
      // caiu nesta rodada: marca o lugar
      const fell = d.endT < dur - 60;
      const end = digestAt(d, d.endT);
      if (fell && end) {
        ctx.strokeStyle = hexA(col, 0.9);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(end.x - 7, end.y - 7);
        ctx.lineTo(end.x + 7, end.y + 7);
        ctx.moveTo(end.x + 7, end.y - 7);
        ctx.lineTo(end.x - 7, end.y + 7);
        ctx.stroke();
      }
      // fantasma: só aparece quando o tempo volta até antes de ele cair
      if (tms > d.endT) continue;
      const pos = digestAt(d, tms);
      const ahead = digestAt(d, Math.max(0, tms - 120));
      if (!pos || !ahead) continue;
      const ch = getCharacter(d.characterId);
      const moving = Math.hypot(ahead.x - pos.x, ahead.y - pos.y) > 1.5;
      // olha para onde está indo (voltando no tempo)
      const dir = moving ? Math.atan2(ahead.y - pos.y, ahead.x - pos.x) : 0;
      const { facing, flip } = facingOf(dir);
      const frame = Math.floor(time * 16) % WALK_FRAMES;
      ctx.globalCompositeOperation = 'lighter';
      if (fx) {
        // aberração de cor: duas cópias deslocadas (fita velha)
        const off = 2.5 + Math.sin(time * 40) * 1.2;
        ctx.globalAlpha = 0.35;
        this.sprites.draw(ctx, this.sprites.get(ch, facing, frame, moving, '#3ee8ff'), pos.x - off, pos.y + 4, flip, SPRITE_SCALE);
        this.sprites.draw(ctx, this.sprites.get(ch, facing, frame, moving, '#ff4fd8'), pos.x + off, pos.y + 4, flip, SPRITE_SCALE);
      }
      ctx.globalAlpha = 0.9;
      this.sprites.draw(ctx, this.sprites.get(ch, facing, frame, moving, col), pos.x, pos.y + 4, flip, SPRITE_SCALE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // rastro de partículas voando para trás
      if (fx && moving && Math.random() < dt * 30) {
        this.particles.push({ x: pos.x + (Math.random() - 0.5) * 16, y: pos.y - 20 - Math.random() * 30, vx: (pos.x - ahead.x) * 6, vy: (pos.y - ahead.y) * 6, life: 0, max: 0.4, color: col, size: 3, kind: 'spark' });
      }
      // chegou ao começo: é aqui que o Eco reaparece
      if (k > 0.85) {
        const kk = (k - 0.85) / 0.15;
        ctx.strokeStyle = hexA(col, 1 - kk * 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 2, 18 + kk * 26, (18 + kk * 26) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        const mine = d.playerId === this.meId(game);
        const op = game.players.find((q) => q.id === d.playerId);
        const nm = (op?.name || op?.char.name || ch.name).replace(/ \(bot\)$/, '');
        label(ctx, pos.x, pos.y - 96, mine ? `SEU ECO · R${d.round}` : `ECO ${nm.toUpperCase()} · R${d.round}`, mine ? '#ffffff' : col, 12);
      }
    }
    // linha do tempo e título (embaixo, sem cobrir o meio da arena)
    const bw = 520;
    const bx = WORLD_W / 2 - bw / 2;
    const by = WORLD_H - 44;
    ctx.fillStyle = 'rgba(8,6,22,0.72)';
    rr(ctx, bx - 14, by - 26, bw + 28, 44, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    rr(ctx, bx, by, bw, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#7ff0ff';
    rr(ctx, bx, by, bw * (tms / dur), 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx + bw * (tms / dur), by + 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `800 14px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = Math.sin(time * 8) > -0.3 ? '#7ff0ff' : 'rgba(127,240,255,0.5)';
    ctx.fillText('◀◀ ECO', bx, by - 13);
    const sec = Math.ceil(tms / 1000);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, WORLD_W / 2, by - 13);
    ctx.textAlign = 'right';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(this.skipLabel, bx + bw, by - 13);
    // efeito de fita: listras e faixa que corre (desligado em "efeitos reduzidos")
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (fx) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = (game.phaseT * 400) % 6; y < H; y += 6 * this.dpr) ctx.fillRect(0, y, W, 2 * this.dpr);
      const band = ((game.phaseT * 0.9) % 1) * H;
      ctx.fillStyle = 'rgba(160,230,255,0.07)';
      ctx.fillRect(0, band, W, 26 * this.dpr);
    }
    const k2 = this.scale * this.dpr;
    ctx.setTransform(k2, 0, 0, k2, this.ox * this.dpr, this.oy * this.dpr);
  }

  private drawPrepHints(game: Game, time: number) {
    const ctx = this.ctx;
    const p = game.human;
    if (p.playing) {
      const r = 34 + Math.sin(time * 6) * 4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 26, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, p.x, p.y - 108, 'VOCÊ', '#ffffff', 15);
    }
  }

  private drawParticles(dt: number) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) continue;
      if (p.kind === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.2 + k * 0.8), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'glow') {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gr.addColorStop(0, hexA(p.color.startsWith('#') ? p.color : '#ffffff', 0.9 * (1 - k)));
        gr.addColorStop(1, hexA(p.color.startsWith('#') ? p.color : '#ffffff', 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'text') {
        p.y += p.vy * dt;
        p.vy *= 0.95;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        label(ctx, p.x, p.y, p.text!, p.color, p.size);
      }
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life < p.max);
  }


  // ======================================================== estilos de zona dos mapas novos
  private drawZoneStyled(style: string, x: number, y: number, r: number, time: number, i: number) {
    const ctx = this.ctx;
    if (style === 'meteoro') {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,240,170,0.95)');
      gr.addColorStop(0.4, 'rgba(255,140,30,0.75)');
      gr.addColorStop(1, 'rgba(120,20,0,0.25)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a120a';
      ctx.beginPath();
      ctx.arc(x + 4, y + 3, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff7a1e';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (!this.reducedEffects && Math.random() < 0.5) this.particles.push({ x: x + (Math.random() - 0.5) * r, y, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 80, life: 0, max: 0.7, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1e', size: 3, kind: 'spark' });
    } else if (style === 'avalanche') {
      ctx.fillStyle = 'rgba(240,250,255,0.85)';
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a) * r * 0.55 + r * 0.42, y + Math.sin(a) * r * 0.5);
        ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, r * 0.42, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,170,220,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (!this.reducedEffects) for (let k = 0; k < 2; k++) this.particles.push({ x: x + (Math.random() - 0.5) * r * 2, y: y - r - 30, vx: 0, vy: 260, life: 0, max: 0.35, color: '#ffffff', size: 3.5, kind: 'spark' });
    } else {
      // tempestade de areia
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = `rgba(230,190,120,${0.75 - k * 0.12})`;
        ctx.lineWidth = 6 - k;
        ctx.beginPath();
        ctx.arc(x, y, r * (0.35 + k * 0.2), time * 7 + k + i, time * 7 + k + i + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200,150,80,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ======================================================== modos: bases, bandeiras, colina, zona
  private drawModeGround(game: Game, time: number) {
    const ctx = this.ctx;
    const g = game as any;
    // bases da bandeira
    for (const f of g.flags ?? []) {
      const col = TEAM_COLORS[f.team];
      ctx.fillStyle = hexA(col, 0.16);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = time * 20;
      ctx.beginPath();
      ctx.arc(f.home.x, f.home.y, 56, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, f.home.x, f.home.y + 70, `BASE ${f.team ? 'VERMELHA' : 'AZUL'}`, col, 13);
    }
    // colina
    const h = g.hill;
    if (h) {
      const owner = h.owner ? game.players.find((p) => p.id === h.owner) : null;
      const col = owner ? owner.color : h.contested ? '#ff5a5a' : '#ffffff';
      const gr = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      gr.addColorStop(0, hexA(col, 0.32));
      gr.addColorStop(1, hexA(col, 0.08));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = h.contested && Math.sin(time * 16) > 0 ? '#ff5a5a' : col;
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 8]);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();
      ctx.setLineDash([]);
      // coroa no centro
      ctx.save();
      ctx.translate(h.x, h.y - 6 + Math.sin(time * 3) * 3);
      ctx.fillStyle = owner ? owner.color : '#ffd23e';
      ctx.strokeStyle = '#2a1a00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.lineTo(-16, -8);
      ctx.lineTo(-7, -1);
      ctx.lineTo(0, -12);
      ctx.lineTo(7, -1);
      ctx.lineTo(16, -8);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      label(ctx, h.x, h.y - h.r - 12, owner ? `${owner.char.name.toUpperCase()} DOMINA` : h.contested ? 'DISPUTADA!' : 'COLINA', col, 14);
      if (h.next) {
        ctx.strokeStyle = Math.sin(time * 12) > 0 ? '#ffd23e' : 'rgba(255,210,62,0.3)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(h.next.x, h.next.y, h.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, h.next.x, h.next.y, 'A COLINA VAI MUDAR', '#ffd23e', 13);
      }
    }
    // Caça ao Chefe: pontos de recurso e poças de ácido
    for (const r of g.resSpots ?? []) drawResSpot(ctx, r.x, r.y, time);
    if (g.pools?.length) drawPools(ctx, g.pools, time);
    for (const z of g.patches ?? []) {
      ctx.save();
      ctx.globalAlpha = z.kind === 'ash' ? 0.28 : 0.45;
      ctx.strokeStyle = z.kind === 'roots' ? '#3dce78' : z.kind === 'whirl' ? '#7dfff0' : z.kind === 'rift' ? '#d09bff' : '#9ee7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // muros de gelo
    for (const w of g.iceWalls ?? []) {
      if (w.kind === 'caixa') {
        drawCrate(ctx, w);
        continue;
      }
      const fade = Math.min(1, w.t * 2);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(w.x + 4, w.y + 8, w.w, w.h);
      const gr = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
      const stops = w.kind === 'obsidiana' ? ['#5a4a5a', '#2a1a2a', '#140810'] : w.kind === 'barreira' ? ['#d8f8ff', '#3ee8ff', '#1a6a9a'] : ['#e8fbff', '#9fe8ff', '#4ab0e0'];
      gr.addColorStop(0, stops[0]);
      gr.addColorStop(0.5, stops[1]);
      gr.addColorStop(1, stops[2]);
      ctx.fillStyle = gr;
      rr(ctx, w.x, w.y - 10, w.w, w.h + 10, 5);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = w.kind === 'obsidiana' ? `rgba(255,${120 + Math.sin(time * 6) * 40},40,0.8)` : 'rgba(40,120,180,0.5)';
      ctx.lineWidth = w.kind === 'obsidiana' ? 2 : 1;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        if (w.w > w.h) {
          ctx.moveTo(w.x + (w.w * k) / 4, w.y - 10);
          ctx.lineTo(w.x + (w.w * k) / 4 + 6, w.y + w.h);
        } else {
          ctx.moveTo(w.x, w.y - 10 + ((w.h + 10) * k) / 4);
          ctx.lineTo(w.x + w.w, w.y - 4 + ((w.h + 10) * k) / 4);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawFlags(game: Game, time: number) {
    const ctx = this.ctx;
    for (const f of (game as any).flags ?? []) {
      const col = TEAM_COLORS[f.team];
      const carrier = f.carrier ? game.players.find((p) => p.id === f.carrier) : null;
      const x = carrier ? carrier.x - 14 : f.x;
      const y = carrier ? carrier.y - 50 : f.y;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      if (!carrier) {
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#2a2430';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 46);
      ctx.stroke();
      const wave = Math.sin(time * 8) * 3;
      ctx.fillStyle = col;
      ctx.strokeStyle = '#120c26';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 46);
      ctx.quadraticCurveTo(x + 14, y - 50 + wave, x + 28, y - 44);
      ctx.lineTo(x + 28, y - 28);
      ctx.quadraticCurveTo(x + 14, y - 34 + wave, x, y - 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 13, y - 37 + wave * 0.5, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!carrier && !f.atHome) label(ctx, x, y - 60, 'CAIU!', col, 12);
    }
  }

  private drawCorpses(dt: number) {
    const ctx = this.ctx;
    for (const c of this.corpses) {
      c.t += dt;
      const pose = corpsePose(c.t);
      if (pose.done) continue;
      ctx.save();
      ctx.globalAlpha = pose.alpha;
      ctx.translate(c.x, c.y + pose.dy);
      ctx.rotate(pose.rot);
      ctx.scale(1.15, pose.squash);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.kind === 'drone' ? '#8d97ad' : '#c45a4a';
      ctx.strokeStyle = '#120c26';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -10, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    this.corpses = this.corpses.filter((c) => !corpsePose(c.t).done);
  }

  private drawEnemies(game: Game, time: number) {
    const ctx = this.ctx;
    for (const e of (game as any).enemies ?? []) {
      if (e.kind === 'pylon') {
        drawPylon(ctx, e, (game as any).boss ?? null, time);
        continue;
      }
      if (isMinion(e.kind)) {
        drawMinion(ctx, e, time);
        continue;
      }
      const st = ENEMY_STATS[e.kind as 'drone' | 'brute' | 'boss'];
      const r = st.r;
      const hover = e.kind === 'drone' ? Math.sin(time * 6 + e.id) * 3 - 14 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(e.x, e.y + hover + (e.hitFlash > 0 ? 4 : 0));
      if (e.hitFlash > 0) {
        ctx.scale(1.06, 0.88);
        ctx.filter = 'brightness(2.2)';
      }
      if (e.chargeT > 0) ctx.translate(Math.cos(e.dir) * 10, Math.sin(e.dir) * 4);
      const eye = e.stunT > 0 ? '#ffd23e' : '#ff3b3b';
      if (e.kind === 'drone') {
        // corpo esférico com hélices
        for (const s of [-1, 1]) {
          ctx.strokeStyle = 'rgba(200,210,230,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(s * 16, -26, 10, 3, Math.sin(time * 40) * 0.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#3a4252';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(s * 6, -20);
          ctx.lineTo(s * 16, -26);
          ctx.stroke();
        }
        const gr = ctx.createRadialGradient(-5, -24, 2, 0, -18, r);
        gr.addColorStop(0, '#e8ecf6');
        gr.addColorStop(1, '#4a5268');
        ctx.fillStyle = gr;
        ctx.strokeStyle = '#141826';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -18, r - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a0a10';
        ctx.beginPath();
        ctx.arc(Math.cos(e.dir) * 5, -18 + Math.sin(e.dir) * 3, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = eye;
        ctx.shadowBlur = 8;
        ctx.fillStyle = eye;
        ctx.beginPath();
        ctx.arc(Math.cos(e.dir) * 6, -18 + Math.sin(e.dir) * 3.5, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'brute') {
        const charge = e.chargeT > 0;
        if (charge) {
          ctx.shadowColor = '#ff3b3b';
          ctx.shadowBlur = 18;
        }
        ctx.fillStyle = '#3a4252';
        ctx.strokeStyle = '#141826';
        ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          rr(ctx, s * 20 - 6, -34 + Math.sin(time * 8 + s) * 2, 12, 26, 5);
          ctx.fill();
          ctx.stroke();
        }
        const gr = ctx.createLinearGradient(-r, -50, r, 0);
        gr.addColorStop(0, '#c8302a');
        gr.addColorStop(1, '#5a1010');
        ctx.fillStyle = gr;
        rr(ctx, -r + 4, -48, (r - 4) * 2, 42, 9);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2a2e3a';
        rr(ctx, -12, -42, 24, 10, 4);
        ctx.fill();
        ctx.fillStyle = eye;
        ctx.shadowColor = eye;
        ctx.shadowBlur = 8;
        ctx.fillRect(-9, -39, 18, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd23e';
        for (let k = -1; k <= 1; k++) ctx.fillRect(k * 7 - 2, -22, 4, 8);
        ctx.fillStyle = '#2a2e3a';
        for (const s of [-1, 1]) ctx.fillRect(s * 8 - 5, -8, 10, 8);
      } else {
        // chefão: núcleo gigante com espinhos
        ctx.rotate(Math.sin(time) * 0.05);
        ctx.fillStyle = '#2a1a3a';
        ctx.strokeStyle = '#0c0818';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + time * 0.6;
          const rr2 = k % 2 ? r : r + 12;
          ctx.lineTo(Math.cos(a) * rr2, -34 + Math.sin(a) * rr2 * 0.85);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const gr = ctx.createRadialGradient(0, -40, 4, 0, -34, r);
        gr.addColorStop(0, '#ff9ad0');
        gr.addColorStop(0.4, '#c0207a');
        gr.addColorStop(1, '#3a0a2a');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(0, -34, r - 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(Math.cos(e.dir) * 8, -34 + Math.sin(e.dir) * 6, 12, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0c0818';
        ctx.beginPath();
        ctx.arc(Math.cos(e.dir) * 11, -34 + Math.sin(e.dir) * 8, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.filter = 'none';
      // vida
      const bw = e.kind === 'boss' ? 110 : 36;
      const by = e.y + hover - (e.kind === 'boss' ? 92 : e.kind === 'brute' ? 62 : 40);
      ctx.fillStyle = 'rgba(8,6,22,0.8)';
      rr(ctx, e.x - bw / 2 - 2, by - 2, bw + 4, 8, 4);
      ctx.fill();
      ctx.fillStyle = e.kind === 'boss' ? '#ff3bd4' : '#ff5a5a';
      rr(ctx, e.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4, 2);
      ctx.fill();
      if (e.kind === 'boss') label(ctx, e.x, by - 12, 'CHEFÃO', '#ff3bd4', 14);
    }
  }

  private drawModeTop(game: Game, time: number) {
    const ctx = this.ctx;
    const g = game as any;
    // ganchos (corda)
    for (const h of g.hooks ?? []) {
      const o = game.players.find((p) => p.id === h.owner);
      if (!o) continue;
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - 24);
      ctx.lineTo(h.x, h.y - 18);
      ctx.stroke();
      ctx.strokeStyle = '#c8a070';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#c8c8d0';
      ctx.strokeStyle = '#141018';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y - 18, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // fumaça
    for (const sm of g.smokes ?? []) {
      const k = Math.min(1, sm.t * 1.5, (5 - sm.t) * 3);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + time * 0.3;
        const d = sm.r * (0.35 + 0.25 * Math.sin(i * 1.7 + time));
        const r = sm.r * (0.42 + 0.08 * Math.sin(time * 2 + i));
        ctx.fillStyle = `rgba(${150 + i * 6},${156 + i * 6},${172 + i * 5},${0.55 * k})`;
        ctx.beginPath();
        ctx.arc(sm.x + Math.cos(a) * d, sm.y - 20 + Math.sin(a) * d * 0.7, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // zona da batalha real: escurece tudo fora do círculo
    const st = g.storm;
    if (st) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, WORLD_W, WORLD_H);
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(120,20,90,0.42)';
      ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = '#ff4fd8';
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 10]);
      ctx.lineDashOffset = time * 40;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** expressão do rosto de cada jogador neste instante */
  private moods = new Map<string, { expr: Expr; until: number }>();
  private dustAt = new Map<string, number>();
  private setMood(pid: string, expr: Expr, dur: number) {
    const now = performance.now() / 1000;
    const cur = this.moods.get(pid);
    if (cur && cur.until > now && cur.expr === 'hurt' && expr !== 'hurt') return;
    this.moods.set(pid, { expr, until: now + dur });
  }
  private exprOf(game: Game, p: Player, time: number): Expr {
    const now = performance.now() / 1000;
    const m = this.moods.get(p.id);
    if (p.hitFlash > 0 || p.stunT > 0.3) return 'hurt';
    if (m && m.until > now) return m.expr;
    const low = game.combat ? p.hp < 30 : p.hearts <= 1;
    if (low) return 'scared';
    if (game.combat && (p.fireCd > 0.05 || p.chargeT > 0)) return 'angry';
    if (game.phase === 'prep' || p.carry >= 3) return 'happy';
    // piscar de vez em quando
    const h = (p.id.charCodeAt(p.id.length - 1) * 0.37) % 3;
    if ((time + h) % 3.4 < 0.12) return 'blink';
    return 'neutral';
  }

  /** raio desenhado entre os pontos (corrente elétrica do Leo) */
  private zaps: { pts: number[]; t: number; color: string }[] = [];
  private drawZaps(dt: number) {
    const ctx = this.ctx;
    for (const z of this.zaps) {
      z.t -= dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, z.t * 4));
      for (const [w, col] of [
        [7, hexA(z.color, 0.35)],
        [2.5, '#ffffff'],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(z.pts[0], z.pts[1]);
        for (let i = 2; i < z.pts.length; i += 2) {
          const x0 = z.pts[i - 2];
          const y0 = z.pts[i - 1];
          const x1 = z.pts[i];
          const y1 = z.pts[i + 1];
          for (let k = 1; k <= 6; k++) {
            const f = k / 6;
            const j = k === 6 ? 0 : (Math.random() - 0.5) * 18;
            ctx.lineTo(x0 + (x1 - x0) * f + j, y0 + (y1 - y0) * f + j);
          }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    this.zaps = this.zaps.filter((z) => z.t > 0);
  }


  /** arma presa na mão, girando com a mira (nunca de cabeça para baixo) */
  private drawGun(p: Player) {
    const ctx = this.ctx;
    const w = WEAPONS[p.weapon];
    const g = w.gun;
    const a = p.aim;
    const left = Math.cos(a) < 0;
    ctx.save();
    ctx.translate(p.x + Math.cos(a) * 12, p.y - GUN_Y + Math.sin(a) * 12);
    ctx.rotate(a);
    if (left) ctx.scale(1, -1);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0c0818';
    ctx.lineWidth = 1.6;
    if (p.weapon === 'punhos') {
      // luva de impacto
      ctx.fillStyle = g.body;
      ctx.beginPath();
      ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = g.tip;
      ctx.fillRect(6, -4, 3, 8);
    } else if (p.weapon === 'shuriken') {
      ctx.fillStyle = '#d8dce8';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 2 : 6;
        ctx.lineTo(4 + Math.cos((i / 8) * Math.PI * 2) * r, Math.sin((i / 8) * Math.PI * 2) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // cabo
      ctx.fillStyle = g.body;
      rr(ctx, -2, 0, 5, 8, 1.5);
      ctx.fill();
      ctx.stroke();
      // corpo + cano
      rr(ctx, -4, -4, g.len + 2, 7.5, 2.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-2, -3, g.len - 2, 1.6);
      // luz do cano
      ctx.fillStyle = g.tip;
      ctx.shadowColor = g.tip;
      ctx.shadowBlur = 6;
      ctx.fillRect(g.len - 4, -2.2, 4, 3.4);
      ctx.shadowBlur = 0;
      if (p.weapon === 'besta') {
        ctx.strokeStyle = '#c8d0e0';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(g.len - 6, -9);
        ctx.quadraticCurveTo(g.len - 1, 0, g.len - 6, 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** linha de mira + retícula do jogador (mostra exatamente para onde o tiro vai) */
  private drawAimGuide(game: Game, p: Player, time: number) {
    const ctx = this.ctx;
    const w = WEAPONS[p.weapon];
    const a = p.aim;
    const sx = p.x + Math.cos(a) * (14 + w.gun.len);
    const sy = p.y - GUN_Y + Math.sin(a) * (14 + w.gun.len);
    let len = Math.min(w.range * 1.15, w.speed * w.life);
    const free = (game as any).isFree as ((x: number, y: number, r: number) => boolean) | undefined;
    if (free) {
      for (let d = 10; d < len; d += 10) {
        if (!free.call(game, sx + Math.cos(a) * d, sy + GUN_Y + Math.sin(a) * d, 3)) {
          len = d;
          break;
        }
      }
    }
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    ctx.save();
    // segurando o analógico direito (celular): a linha fica mais forte
    const held = !!this.aimGuide?.held;
    ctx.strokeStyle = hexA(w.color, held ? 0.75 : 0.35);
    ctx.lineWidth = held ? 3 : 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -time * 40;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w.pellets > 1) {
      // leque das armas de vários projéteis
      ctx.strokeStyle = hexA(w.color, 0.18);
      for (const k of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a + w.spread * k) * len, sy + Math.sin(a + w.spread * k) * len);
        ctx.stroke();
      }
    }
    // retícula
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(ex + dx * 5, ey + dy * 5);
      ctx.lineTo(ex + dx * 13, ey + dy * 13);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** cúpula de energia hexagonal (escudo) */
  private drawShieldDome(x: number, y: number, r: number, time: number, blink: boolean) {
    const ctx = this.ctx;
    if (blink) return;
    ctx.save();
    const gr = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    gr.addColorStop(0, 'rgba(93,255,138,0.03)');
    gr.addColorStop(0.8, 'rgba(93,255,138,0.16)');
    gr.addColorStop(1, 'rgba(160,255,200,0.42)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(200,255,220,0.35)';
    ctx.lineWidth = 1;
    const hs = 8;
    const off = (time * 12) % (hs * 1.73);
    for (let row = -4; row <= 4; row++)
      for (let col = -4; col <= 4; col++) {
        const hx = x + col * hs * 1.5;
        const hy = y + row * hs * 1.73 + (col % 2 ? hs * 0.87 : 0) - off;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.lineTo(hx + Math.cos((i / 6) * Math.PI * 2) * hs, hy + Math.sin((i / 6) * Math.PI * 2) * hs);
        ctx.closePath();
        ctx.stroke();
      }
    ctx.restore();
    ctx.strokeStyle = '#c8ffd8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#5dff8a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, r + Math.sin(time * 9) * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /** cristais de habilidade no chão */
  private drawAbilityOrbs(game: Game, time: number) {
    const ctx = this.ctx;
    for (const o of (game as any).abilityOrbs ?? []) {
      const owner = CHARACTER_BY_AB.get(o.ab);
      if (!owner) continue;
      const col = owner.glow ?? owner.color;
      const appear = Math.min(1, o.age * 2.5);
      const bob = Math.sin(time * 3 + o.id) * 4;
      const y = o.y - 26 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y + 4, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // coluna de luz
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, o.y - 90, 0, o.y);
      beam.addColorStop(0, hexA(col, 0));
      beam.addColorStop(1, hexA(col, 0.35));
      ctx.fillStyle = beam;
      ctx.fillRect(o.x - 10, o.y - 90, 20, 90);
      const gl = ctx.createRadialGradient(o.x, y, 2, o.x, y, 34);
      gl.addColorStop(0, hexA(col, 0.65));
      gl.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(o.x, y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // cristal girando
      ctx.save();
      ctx.translate(o.x, y);
      ctx.scale(appear * Math.cos(time * 2.2), appear);
      const cg = ctx.createLinearGradient(-12, -18, 12, 18);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.45, col);
      cg.addColorStop(1, shadeHex(col, -0.45));
      ctx.fillStyle = cg;
      ctx.strokeStyle = '#120c26';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(12, -4);
      ctx.lineTo(7, 16);
      ctx.lineTo(-7, 16);
      ctx.lineTo(-12, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawSymbol(ctx, owner.id, o.x, y + 1, 7, '#120c26');
      label(ctx, o.x, o.y - 62 + bob, owner.ability.name.toUpperCase(), col, 12);
    }
  }

  /** Mini-pré-visualização de um personagem (seleção). */
  drawPortrait(cv: HTMLCanvasElement, charId: string, time: number) {
    const g = cv.getContext('2d')!;
    const ch = getCharacter(charId);
    const s = cv.height / 60;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, cv.width / 2, cv.height - 4 * s);
    drawCharacter(g, ch, 'down', time * 8, true);
  }
}


function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, size: number) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 4);
  ctx.strokeStyle = 'rgba(5,4,16,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function stripes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = b;
  g.fillRect(x, y, w, h);
  g.fillStyle = a;
  for (let i = -h; i < w + h; i += 12) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + 6, y + h);
    g.lineTo(x + i + 6 + h, y);
    g.lineTo(x + i + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

const CHARACTER_BY_AB = new Map(CHARACTERS.map((c) => [c.ability.id as string, c]));
function shadeHex(hex: string, amt: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type { EchoView };

/** Ícones dos poderes (desenhados em código). */
export function drawPowerIcon(ctx: CanvasRenderingContext2D, kind: PowerId, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'escudo':
      ctx.moveTo(0, -9);
      ctx.lineTo(7.5, -5.5);
      ctx.lineTo(6, 3.5);
      ctx.lineTo(0, 9);
      ctx.lineTo(-6, 3.5);
      ctx.lineTo(-7.5, -5.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ima':
      ctx.lineWidth = 4;
      ctx.arc(0, 0, 6.5, Math.PI, 0, true);
      ctx.moveTo(-6.5, 0);
      ctx.lineTo(-6.5, -7);
      ctx.moveTo(6.5, 0);
      ctx.lineTo(6.5, -7);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8.5, -9, 4, 3);
      ctx.fillRect(4.5, -9, 4, 3);
      break;
    case 'gelo':
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9);
      }
      ctx.stroke();
      break;
    case 'turbo':
      ctx.lineWidth = 3;
      ctx.moveTo(-7, -7);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-7, 7);
      ctx.moveTo(1, -7);
      ctx.lineTo(7, 0);
      ctx.lineTo(1, 7);
      ctx.stroke();
      break;
    case 'dobro':
      ctx.font = `700 13px "Bungee", "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', 0, 1);
      break;
    case 'metralhadora':
    case 'escopeta':
    case 'laser':
      ctx.fillRect(-9, -3, 16, 6);
      ctx.fillRect(-9, -3, 5, 10);
      if (kind === 'escopeta') ctx.fillRect(-9, -6, 18, 3);
      if (kind === 'laser') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, -1.5, 6, 3);
      }
      if (kind === 'metralhadora') for (let i = 0; i < 3; i++) ctx.fillRect(8, -4 + i * 3, 3, 2);
      break;
    case 'bomba':
      ctx.arc(0, 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2, -8, 4, 5);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(2, -9, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mina':
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120c26';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cura':
      ctx.fillRect(-2.6, -8, 5.2, 16);
      ctx.fillRect(-8, -2.6, 16, 5.2);
      break;
    case 'foguete':
      ctx.rotate(-0.6);
      ctx.fillRect(-7, -3, 12, 6);
      ctx.beginPath();
      ctx.moveTo(5, -3);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, 3);
      ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.lineTo(-11, 0);
      ctx.lineTo(-7, 2);
      ctx.fill();
      break;
    case 'congelante':
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'invisivel':
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(8, -8);
      ctx.stroke();
      break;
    case 'vampiro':
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-11, 0, -7, -9, 0, -4);
      ctx.bezierCurveTo(7, -9, 11, 0, 0, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-3, -2);
      ctx.lineTo(-2, 3);
      ctx.lineTo(-1, -2);
      ctx.moveTo(1, -2);
      ctx.lineTo(2, 3);
      ctx.lineTo(3, -2);
      ctx.fill();
      break;
    case 'apagar':
      ctx.arc(0, -1, 6.5, Math.PI, 0);
      ctx.lineTo(6.5, 7);
      ctx.lineTo(3, 5);
      ctx.lineTo(0, 7);
      ctx.lineTo(-3, 5);
      ctx.lineTo(-6.5, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#120c26';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-3, -3);
      ctx.lineTo(3, 3);
      ctx.moveTo(3, -3);
      ctx.lineTo(-3, 3);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
