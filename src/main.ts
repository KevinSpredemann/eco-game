import './styles.css';
import { audio } from './audio/audio';
import { ARENAS, WORLD_W, getArena } from './game/arenas';
import { CHARACTERS, getCharacter } from './game/characters';
import * as C from './game/constants';
import { Game, GameEvent, OBJECTIVES } from './game/sim';
import { Renderer } from './render/renderer';
import { InputManager } from './ui/input';
import { Settings, loadSettings, saveSettings } from './ui/settings';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const settings: Settings = loadSettings();

const canvas = $<HTMLCanvasElement>('#game');
const renderer = new Renderer(canvas);
const input = new InputManager($('#touch'));

let game: Game | null = null;
let training = false;
let screenStack: string[] = [];
let lastScreenBeforeOptions = 'screen-title';
let bannerTimer = 0;
let hintStage = 0;
let hintT = 0;

// ------------------------------------------------------------------ ícones
const ICONS = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
};
$('#btn-pause').innerHTML = ICONS.pause;
function refreshMuteIcon() {
  $('#btn-mute').innerHTML = settings.muted ? ICONS.muted : ICONS.sound;
}
refreshMuteIcon();
document.documentElement.style.setProperty('--hero', `url("${new URL('art/hero2.webp', document.baseURI).href}")`);

// ------------------------------------------------------------------ áudio/opções
function applySettings() {
  audio.vol.master = settings.master / 100;
  audio.vol.music = settings.music / 100;
  audio.vol.sfx = settings.sfx / 100;
  audio.vol.muted = settings.muted;
  audio.applyVolumes();
  document.documentElement.style.setProperty('--ctrl-alpha', String(settings.ctrlAlpha / 100));
  document.documentElement.style.setProperty('--ctrl-size', String(settings.ctrlSize / 100));
  $('#touch').classList.toggle('swap', settings.swap);
  renderer.reducedEffects = settings.reduced;
  renderer.showTrails = settings.trails;
  refreshMuteIcon();
  saveSettings(settings);
}

function bindOptions() {
  const ranges: [string, keyof Settings][] = [
    ['#opt-master', 'master'],
    ['#opt-music', 'music'],
    ['#opt-sfx', 'sfx'],
    ['#opt-ctrl-alpha', 'ctrlAlpha'],
    ['#opt-ctrl-size', 'ctrlSize'],
  ];
  for (const [sel, key] of ranges) {
    const el = $<HTMLInputElement>(sel);
    el.value = String(settings[key]);
    el.addEventListener('input', () => {
      (settings as any)[key] = Number(el.value);
      applySettings();
    });
    el.addEventListener('change', () => audio.click());
  }
  const checks: [string, keyof Settings][] = [
    ['#opt-muted', 'muted'],
    ['#opt-swap', 'swap'],
    ['#opt-own', 'ownEcho'],
    ['#opt-trails', 'trails'],
    ['#opt-reduced', 'reduced'],
  ];
  for (const [sel, key] of checks) {
    const el = $<HTMLInputElement>(sel);
    el.checked = Boolean(settings[key]);
    el.addEventListener('change', () => {
      (settings as any)[key] = el.checked;
      applySettings();
      audio.click();
    });
  }
}

// ------------------------------------------------------------------ telas
const SCREENS = ['screen-title', 'screen-select', 'screen-howto', 'screen-options', 'screen-pause', 'screen-results'];
function show(id: string | null) {
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  const inGame = !!game && (id === null || id === 'screen-pause' || id === 'screen-results' || (id === 'screen-options' && !!game));
  $('#hud').hidden = !game || id === 'screen-select' || id === 'screen-title';
  $('#touch').hidden = !(game && id === null && input.touchMode);
  if (!inGame) {
    $('#banner').hidden = true;
    $('#hint').hidden = true;
  }
  if (id) screenStack.push(id);
  checkRotate();
}

function go(action: string) {
  audio.unlock();
  audio.click();
  switch (action) {
    case 'play':
      training = false;
      openSelect();
      break;
    case 'training':
      training = true;
      openSelect();
      break;
    case 'howto':
      show('screen-howto');
      break;
    case 'options':
      lastScreenBeforeOptions = currentScreen() ?? 'screen-title';
      $<HTMLInputElement>('#opt-own').checked = settings.ownEcho;
      show('screen-options');
      break;
    case 'back': {
      const cur = currentScreen();
      if (cur === 'screen-options') show(lastScreenBeforeOptions);
      else show('screen-title');
      break;
    }
    case 'start':
      startMatch();
      break;
    case 'resume':
      resume();
      break;
    case 'restart':
      startMatch();
      break;
    case 'select':
      endMatch();
      openSelect();
      break;
    case 'quit':
      endMatch();
      show('screen-title');
      audio.playMusic('menu');
      break;
    case 'install':
      installApp();
      break;
  }
}

function currentScreen(): string | null {
  return SCREENS.find((s) => !$('#' + s).hidden) ?? null;
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (el) go(el.dataset.action!);
});

// ------------------------------------------------------------------ seleção
function openSelect() {
  $('#select-title').textContent = training ? 'Treino solo' : 'Núcleo de Energia';
  $('#match-opts').hidden = training;
  const cg = $('#char-grid');
  cg.innerHTML = '';
  for (const c of CHARACTERS) {
    const b = document.createElement('button');
    b.className = 'char-card' + (c.id === settings.char ? ' selected' : '');
    b.style.setProperty('--c', c.color);
    b.setAttribute('aria-pressed', String(c.id === settings.char));
    b.innerHTML = `
      <img src="${c.art}" alt="${c.name}" loading="lazy" />
      <span class="badge">${symbolSvg(c.id, c.color)}</span>
      <span class="info">
        <span class="name" style="color:${c.color}">${c.name}</span>
        <span class="title">${c.title}</span>
        <span class="ab">${c.ability.name}</span>
        <span class="desc">${c.ability.desc}${c.passive ? ' ' + c.passive : ''}</span>
      </span>`;
    b.addEventListener('click', () => {
      settings.char = c.id;
      saveSettings(settings);
      cg.querySelectorAll('.char-card').forEach((x) => {
        x.classList.remove('selected');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('selected');
      b.setAttribute('aria-pressed', 'true');
      audio.ability(c.ability.id);
    });
    cg.appendChild(b);
  }
  const ag = $('#arena-grid');
  ag.innerHTML = '';
  for (const a of ARENAS) {
    const b = document.createElement('button');
    b.className = 'arena-card' + (a.id === settings.arena ? ' selected' : '');
    b.innerHTML = `<img src="${a.art}" alt="" loading="lazy" /><span class="info"><span class="name">${a.name}</span><span class="desc">${a.desc}</span><span class="desc" style="color:${a.palette.accent}">${a.gimmick}</span></span>`;
    b.addEventListener('click', () => {
      settings.arena = a.id;
      saveSettings(settings);
      ag.querySelectorAll('.arena-card').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      audio.click();
    });
    ag.appendChild(b);
  }
  $<HTMLSelectElement>('#sel-bots').value = String(settings.bots);
  $<HTMLSelectElement>('#sel-diff').value = settings.difficulty;
  show('screen-select');
  $('#screen-select').scrollTop = 0;
}
$<HTMLSelectElement>('#sel-bots').addEventListener('change', (e) => {
  settings.bots = Number((e.target as HTMLSelectElement).value);
  saveSettings(settings);
});
$<HTMLSelectElement>('#sel-diff').addEventListener('change', (e) => {
  settings.difficulty = (e.target as HTMLSelectElement).value as Settings['difficulty'];
  saveSettings(settings);
});

function symbolSvg(id: string, color: string) {
  const paths: Record<string, string> = {
    kael: '<path d="M13 2 4 14h7l-2 8 9-12h-7z" fill="C"/>',
    luna: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="C"/>',
    bruno: '<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="C"/>',
    zoe: '<circle cx="12" cy="12" r="7" stroke="C" stroke-width="2.4" fill="none"/><path d="M12 2v20M2 12h20" stroke="C" stroke-width="2.4"/>',
    maya: '<path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="C"/>',
    zed: '<path d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3z" stroke="C" stroke-width="2.2" fill="none"/><circle cx="12" cy="12" r="3" fill="C"/>',
  };
  return `<svg viewBox="0 0 24 24" width="16" height="16">${(paths[id] ?? paths.zed).replace(/C/g, color)}</svg>`;
}

// ------------------------------------------------------------------ partida
function startMatch() {
  audio.unlock();
  const arena = getArena(settings.arena);
  game = new Game({
    arena,
    humanChar: settings.char,
    bots: training ? 0 : settings.bots,
    difficulty: settings.difficulty,
    ownEchoDamage: settings.ownEcho,
    training,
  });
  renderer.setArena(arena);
  layout();
  input.clear();
  hintStage = training ? 1 : 0;
  hintT = 0;
  $('#btn-ability .tlabel').textContent = getCharacter(settings.char).ability.label.toUpperCase();
  buildScoreboard();
  show(null);
  audio.playMusic('game', arena.music);
  tryFullscreen();
}

function endMatch() {
  game = null;
  idleGame = null;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#banner').hidden = true;
  $('#hint').hidden = true;
}

function pause() {
  if (!game || game.phase === 'results' || game.paused) return;
  game.paused = true;
  input.clear();
  show('screen-pause');
}
function resume() {
  if (!game) return;
  game.paused = false;
  show(null);
}
input.onPause = () => {
  const cur = currentScreen();
  if (game && cur === null) pause();
  else if (game && cur === 'screen-pause') resume();
};
input.onFirstTouch = () => {
  if (game && currentScreen() === null) $('#touch').hidden = false;
};
$('#btn-pause').addEventListener('click', (e) => {
  e.stopPropagation();
  audio.click();
  pause();
});
$('#btn-mute').addEventListener('click', (e) => {
  e.stopPropagation();
  settings.muted = !settings.muted;
  $<HTMLInputElement>('#opt-muted').checked = settings.muted;
  applySettings();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else audio.resume();
});

// ------------------------------------------------------------------ HUD
let sbRows: Record<string, HTMLElement> = {};
function buildScoreboard() {
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  sbRows = {};
  if (!game) return;
  for (const p of game.players) {
    const row = document.createElement('div');
    row.className = 'sb-row' + (p.isBot ? '' : ' me');
    row.style.setProperty('--c', p.color);
    row.innerHTML = `<span class="bar"></span><span class="name">${p.isBot ? p.char.name : 'Você'}</span><span class="score">0</span><span class="hearts"></span>`;
    sb.appendChild(row);
    sbRows[p.id] = row;
  }
}

const hudCache: Record<string, string> = {};
function setText(sel: string, v: string) {
  if (hudCache[sel] === v) return;
  hudCache[sel] = v;
  $(sel).textContent = v;
}
function setHTML(sel: string, v: string) {
  if (hudCache[sel] === v) return;
  hudCache[sel] = v;
  $(sel).innerHTML = v;
}

function updateHud() {
  if (!game) return;
  const g = game;
  const roundLabel = g.tiebreak ? 'DESEMPATE' : training ? `TREINO ${g.round}/${g.totalRounds}` : `RODADA ${g.round}/${g.totalRounds}`;
  setText('#hud-round', roundLabel);
  const t = g.phase === 'prep' ? g.roundDur : g.timeLeft();
  setText('#hud-timer', g.phase === 'rewind' ? '◀◀' : String(Math.ceil(t)));
  $('#hud-timer').classList.toggle('low', g.phase === 'play' && g.timeLeft() <= 5);
  setText('#hud-objective', OBJECTIVES[g.objective]);
  for (const p of g.players) {
    const row = sbRows[p.id];
    if (!row) continue;
    const sc = row.querySelector('.score')!;
    if (sc.textContent !== String(p.score)) sc.textContent = String(p.score);
    const h = p.playing ? '♥'.repeat(Math.max(0, p.hearts)) + '♡'.repeat(Math.max(0, C.HEARTS - p.hearts)) : '—';
    const he = row.querySelector('.hearts')!;
    if (he.textContent !== h) he.textContent = h;
    row.classList.toggle('out', !p.alive || !p.playing);
  }
  const me = g.human;
  const pips = Array.from({ length: C.MAX_CARRY }, (_, i) => `<span class="pip${i < me.carry ? ' on' : ''}"></span>`).join('');
  const ab = me.char.ability;
  const abTxt = me.abilCd > 0 ? `<span class="ab-wait">${ab.label} ${Math.ceil(me.abilCd)}s</span>` : `<span class="ab-ready">${ab.label} pronto</span>`;
  const hearts = '♥'.repeat(Math.max(0, me.hearts)) + '♡'.repeat(Math.max(0, C.HEARTS - me.hearts));
  setHTML('#hud-status', me.alive ? `<span class="hearts">${hearts}</span><span class="pips">${pips}</span>${abTxt}` : `<span class="ab-wait">Eliminado nesta rodada — observe os Ecos</span>`);
  drawCooldown('#btn-dash', me.dashCd / C.DASH_CD, '#3ee8ff');
  drawCooldown('#btn-ability', me.abilCd / ab.cooldown, me.color);
}

const cdState: Record<string, number> = {};
function drawCooldown(sel: string, frac: number, color: string) {
  const f = Math.max(0, Math.min(1, frac));
  const q = Math.round(f * 60);
  if (cdState[sel] === q) return;
  cdState[sel] = q;
  const cv = $(sel).querySelector('canvas') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 120, 120);
  if (f <= 0) {
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(60, 60, 55, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.moveTo(60, 60);
  g.arc(60, 60, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
  g.closePath();
  g.fill();
}

function banner(main: string, sub = '', dur = 1.6) {
  const b = $('#banner');
  b.hidden = false;
  (b.querySelector('.banner-main') as HTMLElement).textContent = main;
  (b.querySelector('.banner-sub') as HTMLElement).textContent = sub;
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  bannerTimer = dur;
}

function hint(text: string | null) {
  const h = $('#hint');
  if (!text) {
    h.hidden = true;
    return;
  }
  h.hidden = false;
  if (h.textContent !== text) h.textContent = text;
}

// ------------------------------------------------------------------ eventos → som/telas
function panOf(x: number) {
  return ((x / WORLD_W) * 2 - 1) * 0.7;
}

function onEvents(events: GameEvent[]) {
  if (!game) return;
  const g = game;
  for (const e of events) {
    const mine = 'pid' in e && e.pid === 'p0';
    switch (e.type) {
      case 'phase':
        if (e.phase === 'prep') {
          const sub = g.tiebreak ? 'Rodada curta: só quem empatou joga.' : OBJECTIVES[g.objective];
          banner(g.tiebreak ? 'DESEMPATE' : `RODADA ${g.round}`, sub, 2.4);
          audio.intensity = 0;
        } else if (e.phase === 'play') {
          banner('JÁ!', '', 0.8);
          audio.go();
        } else if (e.phase === 'rewind') {
          banner('◀◀ REBOBINANDO', g.expiredRound !== null ? `Ecos da rodada ${g.expiredRound} se dissiparam` : 'Gravando seu Eco…', 2);
          audio.recordSave();
          audio.rewind();
          if (g.expiredRound !== null) setTimeout(() => audio.echoExpired(), 900);
        } else if (e.phase === 'results') {
          showResults();
        }
        break;
      case 'tick':
        audio.tick(e.n);
        if (g.phase === 'prep') banner(String(e.n), g.tiebreak ? '' : OBJECTIVES[g.objective], 0.9);
        break;
      case 'echoSpawn':
        audio.echoSpawn();
        break;
      case 'pickup':
        if (mine || !e.golden) audio.pickup(panOf(e.x), e.golden);
        if (e.lucky) audio.lucky(panOf(e.x));
        if (mine && hintStage === 2) hintStage = 3;
        break;
      case 'deliver':
        audio.deliver(e.count, panOf(e.x));
        if (mine && hintStage === 3) hintStage = 4;
        break;
      case 'hit':
        if (e.by === 'fall') audio.fall(panOf(e.x));
        else audio.hit(panOf(e.x), e.by === 'own');
        if (mine) {
          try {
            navigator.vibrate?.(e.by === 'own' ? [30, 40, 30] : 40);
          } catch {
            /* */
          }
        }
        break;
      case 'eliminated':
        if (mine) {
          audio.eliminated();
          banner('ELIMINADO', 'Você volta na próxima rodada.', 1.8);
        }
        break;
      case 'dash':
        audio.dash(panOf(e.x));
        break;
      case 'ability':
        audio.ability(e.ability, panOf(e.x));
        break;
      case 'portal':
        audio.portal(panOf(e.x));
        break;
      case 'disrupt':
        audio.disrupt(panOf(e.x));
        break;
      case 'hazardWarn':
        audio.hazardWarn(panOf(e.x));
        break;
      case 'hazardOn':
        audio.hazardOn(panOf(e.x));
        break;
      case 'piston':
        audio.piston(panOf(e.x));
        break;
      case 'bridgeWarn':
        audio.bridgeWarn(panOf(e.x));
        break;
      case 'coreWarn':
        audio.coreWarn();
        banner('NÚCLEO VAI MUDAR', 'Em 3 segundos', 1.4);
        break;
      case 'coreMove':
        audio.coreMove();
        break;
      case 'goldenWarn':
        audio.goldenWarn();
        break;
      case 'goldenSpawn':
        audio.pickup(panOf(e.x), true);
        break;
      case 'objective':
        if (mine) audio.objective();
        break;
    }
  }
}

function tutorial(dt: number) {
  if (!game || !training) {
    hint(null);
    return;
  }
  const g = game;
  const me = g.human;
  hintT += dt;
  const move = input.touchMode ? 'Arraste o polegar na metade esquerda da tela para andar.' : 'Ande com WASD ou as setas.';
  if (g.round === 1) {
    if (g.phase === 'prep') return hint('Treino: aprenda energia, núcleo e Ecos. ' + move);
    if (hintStage === 1) {
      if (Math.hypot(me.vx, me.vy) > 40 && hintT > 1.5) {
        hintStage = 2;
        hintT = 0;
      }
      return hint(move);
    }
    if (hintStage === 2) return hint('Passe pelos cristais verdes para pegar energia (até 3).');
    if (hintStage === 3) return hint('Leve a energia até o NÚCLEO verde: 3 pontos por cristal.');
    if (hintStage === 4) {
      if (hintT > 6) {
        hintStage = 5;
        hintT = 0;
      }
      return hint(input.touchMode ? 'Toque em IMPULSO para uma arrancada rápida. HAB usa a habilidade do personagem.' : 'Espaço = impulso. E ou Shift = habilidade do personagem.');
    }
    if (hintStage === 5) return hint('Tudo o que você faz está sendo gravado…');
  }
  if (g.round === 2 && g.phase === 'prep') return hint('Este fantasma é o seu ECO da rodada 1. Ele vai repetir cada passo seu. Não encoste nele!');
  if (g.round === 2 && g.phase === 'play' && g.roundT < 8) return hint('O Eco não persegue você: ele só repete o passado. Leia o caminho dele e planeje.');
  if (g.round === 3 && g.phase === 'prep') return hint('Agora são 2 Ecos. Um pulso branco avisa quando um Eco vai dar impulso.');
  if (g.round === 4 && g.phase === 'prep') return hint('No máximo 3 gerações ficam ativas. As mais antigas piscam antes de sumir.');
  hint(null);
}

function showResults() {
  if (!game) return;
  const g = game;
  const rank = g.ranking();
  const meWon = g.winners.includes('p0');
  const shared = g.winners.length > 1;
  $('#res-eyebrow').textContent = training ? 'Treino concluído' : g.tiebreak ? 'Fim do desempate' : 'Fim da partida';
  $('#res-title').textContent = training ? `${g.human.score} pontos` : meWon ? (shared ? 'Vitória dividida!' : 'Vitória!') : 'Não foi dessa vez';
  const list = $('#res-list');
  list.innerHTML = '';
  rank.forEach((p, i) => {
    const li = document.createElement('li');
    if (!p.isBot) li.className = 'me';
    li.style.setProperty('--c', p.color);
    li.innerHTML = `<span class="pos">${i + 1}</span><img src="${p.char.art}" alt="" /><span><b style="color:${p.color}">${p.isBot ? p.char.name : 'Você (' + p.char.name + ')'}</b><br /><span class="sub">${p.stats.delivered} energia entregue · sobreviveu ${p.stats.survived}×</span></span><span class="pts">${p.score}</span>`;
    list.appendChild(li);
  });
  $('#res-highlight').textContent = g.highlight;
  if (training) {
    settings.tutorialDone = true;
    saveSettings(settings);
  }
  if (meWon || training) audio.victory();
  else audio.defeat();
  audio.stopMusic();
  setTimeout(() => {
    if (game === g) show('screen-results');
  }, 900);
}

// ------------------------------------------------------------------ laço principal
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    const g = game;
    if (!g.paused && g.phase !== 'results') {
      acc += dt;
      while (acc >= STEP) {
        g.step(STEP, input.read());
        acc -= STEP;
      }
    } else acc = 0;
    const evs = g.drainEvents();
    renderer.handleEvents(evs, g);
    onEvents(evs);
    if (g.phase === 'play') audio.intensity = g.timeLeft() < 10 ? 1 : g.round >= 3 ? 0.5 : 0.2;
    renderer.render(g, g.paused ? 0 : dt, now / 1000);
    updateHud();
    tutorial(dt);
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('#banner').hidden = true;
    }
  } else {
    drawIdle(now / 1000);
  }
  requestAnimationFrame(frame);
}

// fundo animado atrás dos menus
let idleGame: Game | null = null;
function drawIdle(time: number) {
  if (!idleGame) {
    const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
    idleGame = new Game({ arena, humanChar: 'kael', bots: 4, difficulty: 'normal', ownEchoDamage: true, training: false, spectator: true });
    renderer.setArena(idleGame.arena);
  }
  const g = idleGame;
  if (g.phase !== 'results') g.step(1 / 60, { mx: 0, my: 0, dash: false, ability: false });
  else idleGame = null;
  g.drainEvents();
  renderer.render(g, 1 / 60, time);
}

// ------------------------------------------------------------------ layout / orientação
function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const padTop = h > 560 ? 70 : 0;
  const padBottom = h > 560 ? 44 : 0;
  renderer.resize(w, h, padTop, padBottom);
  checkRotate();
}
function checkRotate() {
  const portrait = window.innerHeight > window.innerWidth;
  const cur = currentScreen();
  const need = portrait && input.touchMode && !!game && (cur === null || cur === 'screen-pause');
  if (need && cur === null && game && game.phase !== 'results') pause();
  $('#rotate').hidden = !need;
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

function tryFullscreen() {
  if (!input.touchMode || (window as any).Capacitor?.isNativePlatform?.()) return;
  const el = document.documentElement as any;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
  if (standalone) return;
  try {
    const p = el.requestFullscreen?.({ navigationUI: 'hide' });
    p?.then(() => (screen.orientation as any)?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch {
    /* sem tela cheia */
  }
}

// ------------------------------------------------------------------ PWA
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if ((window as any).Capacitor?.isNativePlatform?.()) return;
  deferredPrompt = e;
  $('#btn-install').hidden = false;
});
const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
if (isIOS && !isStandalone && !isNative) $('#btn-install').hidden = false;

function toast(msg: string, ms = 5000) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((toast as any)._t);
  (toast as any)._t = setTimeout(() => (t.hidden = true), ms);
}

async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* */
    }
    deferredPrompt = null;
    $('#btn-install').hidden = true;
  } else if (isIOS) {
    toast('No Safari: toque em Compartilhar e depois em "Adicionar à Tela de Início".', 7000);
  } else {
    toast('Abra o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".', 6000);
  }
}

if (!isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem SW (ex.: ambiente de pré-visualização) */
    });
  });
}

// ------------------------------------------------------------------ início
function firstGesture() {
  audio.unlock();
  applySettings();
  if (!game) audio.playMusic('menu');
  $('#title-foot').textContent = isNative ? 'Toque em Jogar para começar.' : isStandalone ? 'Jogando como app.' : 'Dica: instale o ECO na tela inicial para jogar em tela cheia.';
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture);
// iOS (Safari/WKWebView) só libera o áudio em touchend/click
document.addEventListener('touchend', () => audio.unlock(), { passive: true });
document.addEventListener('click', () => audio.unlock());
window.addEventListener('keydown', firstGesture);

bindOptions();
applySettings();
layout();
show('screen-title');
requestAnimationFrame(frame);

// para testes automatizados
(window as any).__eco = {
  get game() {
    return game;
  },
  start: (char: string, arena: string, t = false) => {
    settings.char = char;
    settings.arena = arena;
    training = t;
    startMatch();
  },
};
(window as any).__ecoExportSounds = () => import('./audio/export').then((m) => m.exportAll());

// ------------------------------------------------------------------ app nativo (Android/iOS)
if (isNative) {
  $('#title-foot').textContent = 'Toque em qualquer lugar para ativar o som.';
  import('@capacitor/app')
    .then(({ App }) => {
      // botão "voltar" do Android: pausa o jogo / volta um menu / sai do app no título
      App.addListener('backButton', () => {
        const cur = currentScreen();
        if (game && cur === null) pause();
        else if (cur === 'screen-pause') resume();
        else if (cur === 'screen-title') App.exitApp();
        else if (cur === 'screen-results') go('quit');
        else go('back');
      });
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          pause();
          audio.suspend();
        } else audio.resume();
      });
    })
    .catch(() => {});
}
