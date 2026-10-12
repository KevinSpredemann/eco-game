// Tela inicial: um duelo DE VERDADE (o mesmo jogo e o mesmo desenho da partida) entre dois personagens
// armados, num mapa sorteado. A câmera acompanha a luta; quando a rodada acaba, começa outro duelo
// com outros personagens e outro mapa.
import { Game } from '../game/sim';
import { ARENAS } from '../game/arenas';
import { CHARACTERS } from '../game/characters';
import { WORLD_H, WORLD_W } from '../game/arenas';
import { Renderer } from '../render/renderer';

// mapas que ficam bonitos de perto (chão bem desenhado, sem muito vazio)
const SHOW_MAPS = ['lab', 'templo', 'fabrica', 'floresta', 'gelo', 'deserto', 'metro', 'vulcao', 'cidade', 'espaco'];

export class TitleShowcase {
  running = false;
  private r: Renderer;
  private g: Game | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private camX = WORLD_W / 2;
  private camY = WORLD_H / 2;
  private w = 0;
  private h = 0;
  private endT = 0;
  private lastPair = '';

  constructor(private cv: HTMLCanvasElement) {
    this.r = new Renderer(cv);
    this.r.showcase = true;
    window.addEventListener('resize', () => this.running && this.fit());
  }

  /** novo duelo: dois personagens diferentes, mapa sorteado, já na hora da luta (sem contagem) */
  private newDuel() {
    let a = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    let b = a;
    for (let i = 0; i < 20 && (b.id === a.id || `${a.id}-${b.id}` === this.lastPair); i++) b = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    if (b.id === a.id) [a, b] = [CHARACTERS[0], CHARACTERS[1]];
    this.lastPair = `${a.id}-${b.id}`;
    const id = SHOW_MAPS[Math.floor(Math.random() * SHOW_MAPS.length)];
    const arena = ARENAS.find((x) => x.id === id) ?? ARENAS[0];
    const g = new Game({
      arena,
      humanChar: a.id,
      bots: 0,
      difficulty: 'dificil',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'a', char: a.id, isBot: true },
        { id: 'b', char: b.id, isBot: true },
      ],
    });
    for (let i = 0; i < 60 * 12 && g.phase !== 'play'; i++) g.step(1 / 60, {});
    g.drainEvents();
    this.g = g;
    this.endT = 0;
    this.r.setArena(arena);
    const [p, q] = g.players;
    this.camX = (p.x + q.x) / 2;
    this.camY = (p.y + q.y) / 2;
    this.zoom = 0;
    this.fit();
  }

  private zoom = 0;

  /** tamanho da tela: só ajusta o canvas; o zoom é calculado a cada quadro em place() */
  private fit() {
    // mede a TELA (o pai), não o canvas: o canvas guarda o tamanho antigo em px e não cresceria ao girar
    const rect = (this.cv.parentElement ?? this.cv).getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    if (!this.w || !this.h) return;
    this.r.resize(this.w, this.h);
    this.zoom = 0;
    this.place(1);
  }

  /** área da tela onde a luta aparece: em pé, a parte de cima (o menu fica embaixo); deitado, à direita do menu */
  private area() {
    const portrait = this.h > this.w;
    return portrait ? { x: 0, y: 0, w: this.w, h: this.h * 0.58 } : { x: this.w * 0.34, y: 0, w: this.w * 0.66, h: this.h };
  }

  /** câmera: enquadra os dois lutadores (zoom suave), sem mostrar fora do mapa quando der */
  private place(k = 1) {
    const g = this.g;
    if (!g || !this.w) return;
    const A = this.area();
    const live = g.players.filter((p) => p.alive);
    const ps = live.length ? live : g.players;
    const pad = 170;
    const minX = Math.min(...ps.map((p) => p.x)) - pad;
    const maxX = Math.max(...ps.map((p) => p.x)) + pad;
    const minY = Math.min(...ps.map((p) => p.y)) - pad - 60;
    const maxY = Math.max(...ps.map((p) => p.y)) + pad;
    const fitScale = Math.min(A.w / (maxX - minX), A.h / (maxY - minY));
    // limites: nunca mais longe que o mapa inteiro na área, nunca mais perto que um close bonito
    const minScale = Math.min(A.w / WORLD_W, A.h / WORLD_H);
    const maxScale = this.h > this.w ? this.w / 520 : this.h / 420;
    const target = Math.max(minScale, Math.min(maxScale, fitScale));
    this.zoom = this.zoom ? this.zoom + (target - this.zoom) * k : target;
    const s = this.zoom;
    let ox = A.x + A.w / 2 - this.camX * s;
    let oy = A.y + A.h / 2 - this.camY * s;
    const mw = WORLD_W * s;
    const mh = WORLD_H * s;
    ox = mw > this.w ? Math.min(0, Math.max(this.w - mw, ox)) : Math.min(Math.max(ox, 0), this.w - mw);
    oy = mh > this.h ? Math.min(0, Math.max(this.h - mh, oy)) : Math.min(Math.max(oy, 0), this.h - mh);
    this.r.setView(s, ox, oy);
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.g) this.newDuel();
    else this.fit();
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number, time: number) {
    const g = this.g;
    if (!g) return;
    // girou o celular (ou mudou a janela): o iPhone às vezes avisa antes de mudar o tamanho de verdade,
    // então confere a cada quadro e reajusta quando a tela mudou
    const box = this.cv.parentElement ?? this.cv;
    if (Math.abs(box.clientWidth - this.w) > 1 || Math.abs(box.clientHeight - this.h) > 1) this.fit();
    // rodada acabou (alguém caiu ou o tempo acabou): segura a última imagem, escurece e troca de duelo
    if (g.phase !== 'play') {
      this.endT += dt;
      this.cv.style.opacity = String(Math.max(0, 1 - this.endT / 0.35));
      if (this.endT > 0.45) {
        this.newDuel();
        this.cv.style.opacity = '1';
      }
      return;
    }
    // passo fixo de 1/60 (igual à partida)
    this.acc += dt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 4) {
      g.step(1 / 60, {});
      this.acc -= 1 / 60;
      steps++;
    }
    if (steps >= 4) this.acc = 0;
    const ev = g.drainEvents();
    if (ev.length) this.r.handleEvents(ev, g);
    // a câmera segue o meio dos dois lutadores, devagar
    const live = g.players.filter((p) => p.alive);
    const focus = live.length ? live : g.players;
    const tx = focus.reduce((n, p) => n + p.x, 0) / focus.length;
    const ty = focus.reduce((n, p) => n + p.y, 0) / focus.length;
    const k = 1 - Math.exp(-dt * 2.2);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.place(1 - Math.exp(-dt * 1.5));
    // a imagem da queda fica um instante antes de trocar
    if (g.phase === 'play') this.r.render(g, dt, time);
  }
}
