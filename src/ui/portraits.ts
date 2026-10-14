import { ArenaDef } from '../game/arenas';
import { CharacterDef } from '../game/characters';
import { accessoryById } from '../game/economy';
import { drawCharacter, shade } from '../render/chars';
import { accessoryBehind, drawAccessory } from '../render/accessories';
import { Renderer } from '../render/renderer';

// Retratos e miniaturas desenhados em vetor, na densidade real da tela (nítidos até em 4K).

export function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, 3);
}

/** Desenha o personagem de corpo inteiro num canvas de card. */
export function drawPortrait(cv: HTMLCanvasElement, c: CharacterDef, opts: { locked?: boolean; time?: number; acc?: string } = {}) {
  const w = cv.clientWidth || cv.width;
  const h = cv.clientHeight || cv.height;
  if (!w || !h) return;
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d')!;
  g.setTransform(k, 0, 0, k, 0, 0);
  // fundo
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, shade(c.glow ?? c.color, -0.78));
  bg.addColorStop(1, '#0b0820');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const halo = g.createRadialGradient(w / 2, h * 0.45, 4, w / 2, h * 0.45, Math.max(w, h) * 0.6);
  halo.addColorStop(0, hexA(c.color, 0.42));
  halo.addColorStop(1, hexA(c.color, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  // linhas de energia
  g.strokeStyle = hexA(c.color, 0.12);
  g.lineWidth = 1;
  for (let y = h * 0.62; y < h; y += 7) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  // chão. A caixa vai do capuz mais alto (−90) até a barra da capa (+8),
  // a mesma escala para o elenco antigo e o do estúdio.
  const floorY = h * 0.9;
  g.fillStyle = hexA(c.color, 0.25);
  g.beginPath();
  g.ellipse(w / 2, floorY, w * 0.32, h * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  const s = Math.min((floorY - h * 0.04) / 90, (w * 0.9) / 52);
  const acc = opts.acc ? accessoryById(opts.acc) : null;
  g.save();
  g.translate(w / 2, floorY);
  g.scale(s, s);
  if (acc && accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  drawCharacter(g, c, 'down', opts.time ?? 0, false);
  if (acc && !accessoryBehind(acc.kind)) drawAccessory(g, acc.kind, acc.color);
  g.restore();
}

const spriteCache = new Map<string, HTMLImageElement>();
/** Sprite do estúdio, se a arte existir. Enquanto carrega, devolve a imagem incompleta. */
export function studioSprite(art: string): HTMLImageElement | null {
  if (!art.includes('studio/') || typeof Image === 'undefined') return null;
  let img = spriteCache.get(art);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = '/' + art.replace(/^\//, '');
    spriteCache.set(art, img);
  }
  return img;
}

export function paintStudio(g: CanvasRenderingContext2D, art: string, w = 34): boolean {
  const img = studioSprite(art);
  if (!img || !img.complete || img.naturalWidth <= 0) return false;
  const m = g.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  // nunca amplia além dos pixels do arquivo
  const destW = Math.min(w * scale, img.naturalWidth);
  const userW = destW / scale;
  const userH = userW * (img.naturalHeight / img.naturalWidth);
  const smooth = g.imageSmoothingEnabled;
  const quality = g.imageSmoothingQuality;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, -userW / 2, -userH, userW, userH);
  g.imageSmoothingEnabled = smooth;
  g.imageSmoothingQuality = quality;
  return true;
}

const urlCache = new Map<string, string>();
/**
 * Cabeça e ombros, o mesmo recorte para o elenco antigo e o do estúdio.
 * Os pés ficam fora do quadro; a escala não depende da arte.
 */
function drawBust(g: CanvasRenderingContext2D, c: CharacterDef, size: number) {
  const s = size / 34;
  g.save();
  g.translate(size / 2, size * 0.5 + 50 * s * 0.98);
  g.scale(s, s);
  drawCharacter(g, c, 'down', 0, false);
  g.restore();
}

/** Rostinho (busto) em data URL, para a faixa, o perfil, o placar e as salas. */
export function avatarURL(c: CharacterDef, size = 64): string {
  const key = `${c.id}:${c.skinId ?? ''}:${size}:${dpr()}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  const k = dpr();
  cv.width = cv.height = Math.round(size * k);
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.scale(k, k);
  const bg = g.createRadialGradient(size / 2, size * 0.4, 2, size / 2, size / 2, size * 0.7);
  bg.addColorStop(0, shade(c.color, -0.35));
  bg.addColorStop(1, '#0d0a20');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  drawBust(g, c, size);
  const url = cv.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

let helper: Renderer | null = null;
/** Miniatura real do mapa (a própria arena desenhada pequena). */
export function drawMapPreview(cv: HTMLCanvasElement, a: ArenaDef) {
  const w = cv.clientWidth || cv.width;
  const h = cv.clientHeight || cv.height;
  if (!w || !h) return;
  const k = dpr();
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  helper ??= new Renderer(document.createElement('canvas'));
  const scale = Math.max((w * k) / 1280, (h * k) / 720);
  const base = helper.renderArenaBase(a, scale);
  const g = cv.getContext('2d')!;
  const bw = base.width;
  const bh = base.height;
  g.drawImage(base, (cv.width - bw) / 2, (cv.height - bh) / 2);
  // núcleo e brilho
  g.setTransform(1, 0, 0, 1, (cv.width - bw) / 2, (cv.height - bh) / 2);
  const c = a.cores[0];
  const gr = g.createRadialGradient(c.x * scale, c.y * scale, 2, c.x * scale, c.y * scale, 70 * scale);
  gr.addColorStop(0, 'rgba(160,255,190,0.85)');
  gr.addColorStop(1, 'rgba(93,255,138,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(c.x * scale, c.y * scale, 70 * scale, 0, Math.PI * 2);
  g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const vg = g.createLinearGradient(0, cv.height * 0.55, 0, cv.height);
  vg.addColorStop(0, 'rgba(8,6,22,0)');
  vg.addColorStop(1, 'rgba(8,6,22,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, cv.width, cv.height);
}

export function hexA(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
