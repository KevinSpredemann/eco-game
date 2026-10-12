import './styles.css';
import { audio } from './audio/audio';
import { ARENAS, WORLD_W, getArena } from './game/arenas';
import { CHARACTERS, getCharacter, withLevel, withSkin } from './game/characters';
import * as C from './game/constants';
import { CHAR_PRICES, MatchMode, SKINS, TRAILS, abilityLevel, owns, upgradePrice } from './game/economy';
import type { RoundEchoLine } from './systems/echo/digest';
import { Game, GameEvent, GameMode, Input, MIN_PLAYERS, MINION_INFO, MinionKind, MODE_RULES, OBJECTIVES, RosterEntry, TEAM_COLORS } from './game/sim';
import { POWERS, getPower } from './game/powerups';
import { WEAPONS, ITEMS, MAX_HP, GUN_Y, isPrimary } from './game/weapons';
import { ClientGame } from './net/clientGame';
import { NetClient } from './net/netClient';
import { PROTO, type EndInfo, type RoomInfo } from './net/protocol';
import { Renderer } from './render/renderer';
import { drawCharacter } from './render/chars';
import { drawMonster } from './render/monster';
import { account, serverUrl } from './ui/account';
import { InputManager } from './ui/input';
import { Settings, loadSettings, saveSettings } from './ui/settings';
import { TitleShowcase } from './ui/titleShowcase';
import { Scoreboard } from './ui/scoreboard';
import { avatarURL, drawMapPreview, drawPortrait } from './ui/portraits';
import { Carousel, fitText } from './ui/carousel';
import { drawModeArt } from './ui/modeArt';
import { HeroScene } from './ui/heroArt';
import { MapScene, MAP_DIFFICULTY } from './ui/mapArt';
import { ABILITY_BAL, BOSS, KITS, Loadout, SKILLS, ULTS, sanitizeLoadout } from './game/balance';
import { ACTION_LABEL, Action, DEFAULT_KEYS, Slot, isReservedKey, keyLabel } from './ui/input';
import { LoadoutScreen } from './ui/loadout';
import { SkillBar, SlotView, drawSlotArt, slotReady } from './ui/skillbar';
import type { AimPreview } from './render/combatFx';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const settings: Settings = loadSettings();

const canvas = $<HTMLCanvasElement>('#game');
const renderer = new Renderer(canvas);
const input = new InputManager($('#touch'));
input.binds = settings.keys;

type AnyGame = Game | ClientGame;
let game: AnyGame | null = null;
let matchMode: MatchMode = 'nucleo';
let net: NetClient | null = null;
let onlineMode: GameMode = 'duelo';
/** de onde a escolha de personagem foi aberta */
let selectCtx: 'local' | 'lobby' = 'local';
let lastScreenBeforeOptions = 'screen-title';
let backFromShop = 'screen-title';
let bannerTimer = 0;
let hintStage = 0;
let hintT = 0;
let rulesThenStart = false;

const training = () => matchMode === 'treino';
const isOnline = () => game instanceof ClientGame;

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
  renderer.reducedEffects = settings.reduced || settings.quality === 'baixa';
  if (renderer.dprCap !== (settings.quality === 'alta' ? 3 : settings.quality === 'media' ? 1.5 : 1)) {
    renderer.setQuality(settings.quality);
    layout();
  }
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
  const q = $<HTMLSelectElement>('#opt-quality');
  q.value = settings.quality;
  q.addEventListener('change', () => {
    settings.quality = q.value as Settings['quality'];
    applySettings();
    audio.click();
  });
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

// ------------------------------------------------------------------ teclas (remapear)
function renderKeybinds() {
  const box = $('#keybinds');
  box.innerHTML = (Object.keys(ACTION_LABEL) as Action[])
    .map((a) => `<div class="kb-row"><span>${ACTION_LABEL[a]}</span><button class="kb-key" data-kb="${a}">${keyLabel(settings.keys[a])}</button></div>`)
    .join('');
  box.querySelectorAll<HTMLElement>('[data-kb]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.dataset.kb as Action;
      b.textContent = 'Aperte uma tecla…';
      b.classList.add('wait');
      audio.click();
      input.capture = (code) => {
        if (code === 'Escape') return renderKeybinds();
        if (isReservedKey(code)) {
          toast('Essa tecla já é de movimento ou pausa.');
          return renderKeybinds();
        }
        // se outra ação usava a tecla, as duas trocam (nunca fica tecla repetida)
        const other = (Object.keys(settings.keys) as Action[]).find((k) => k !== a && settings.keys[k] === code);
        if (other) settings.keys[other] = settings.keys[a];
        settings.keys[a] = code;
        input.binds = settings.keys;
        saveSettings(settings);
        renderKeybinds();
        if (other) toast(`${keyLabel(code)} estava em "${ACTION_LABEL[other]}": as duas trocaram.`);
      };
    }),
  );
}
$('#keys-reset').addEventListener('click', () => {
  settings.keys = { ...DEFAULT_KEYS };
  input.binds = settings.keys;
  saveSettings(settings);
  renderKeybinds();
  audio.click();
});

// ------------------------------------------------------------------ telas
const SCREENS = [
  'screen-title',
  'screen-modes',
  'screen-select',
  'screen-map',
  'screen-loadout',
  'screen-rules',
  'screen-howto',
  'screen-options',
  'screen-account',
  'screen-shop',
  'screen-online',
  'screen-lobby',
  'screen-pause',
  'screen-results',
];
const CHIP_ON = new Set(['screen-title']);
const titleScene = new TitleShowcase($<HTMLCanvasElement>('#title-canvas'));
// herói em destaque na tela inicial: começa pelo seu personagem e vai trocando
function show(id: string | null) {
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  if (id === 'screen-title') {
    titleScene.start();
  } else {
    titleScene.stop();
  }
  if (id !== 'screen-select') heroScene.stop();
  if (id !== 'screen-map') mapScene.stop();
  const inGame = !!game && (id === null || id === 'screen-pause' || id === 'screen-results' || id === 'screen-options');
  $('#hud').hidden = !inGame || id === 'screen-results';
  $('#touch').hidden = !(game && id === null && input.touchMode);
  $('#account-chip').hidden = !(id && CHIP_ON.has(id));
  if (!inGame) {
    $('#banner').hidden = true;
    $('#hint').hidden = true;
  }
  checkRotate();
}

function currentScreen(): string | null {
  return SCREENS.find((s) => !$('#' + s).hidden) ?? null;
}

function go(action: string, el?: HTMLElement) {
  audio.unlock();
  audio.click();
  switch (action) {
    case 'play':
      openModes();
      break;
    case 'training':
      matchMode = 'treino';
      selectCtx = 'local';
      openSelect();
      break;
    case 'howto':
      rulesThenStart = false;
      show('screen-rules');
      break;
    case 'details':
      show('screen-howto');
      break;
    case 'options':
      lastScreenBeforeOptions = currentScreen() ?? 'screen-title';
      $<HTMLInputElement>('#opt-own').checked = settings.ownEcho;
      renderKeybinds();
      show('screen-options');
      break;
    case 'back': {
      const cur = currentScreen();
      if (cur === 'screen-options') show(lastScreenBeforeOptions);
      else if (cur === 'screen-map') show('screen-select');
      else if (cur === 'screen-select') {
        if (selectCtx === 'lobby') show('screen-lobby');
        else openModes();
      } else if (cur === 'screen-shop') show(backFromShop);
      else if (cur === 'screen-account' && !account.logged && !$('#acc-guest').hidden) openAccount('choice');
      else {
        if (cur === 'screen-account' && !settings.welcomeSeen) {
          settings.welcomeSeen = true;
          saveSettings(settings);
        }
        show('screen-title');
      }
      break;
    }
    case 'to-map':
      if (!owns(account.profile, 'char:' + settings.char)) {
        toast('Esse personagem ainda está bloqueado. Compre na loja ou escolha outro.');
        return;
      }
      if (selectCtx === 'lobby') {
        sendLobbyLook();
        show('screen-lobby');
      } else openMap();
      break;
    case 'to-chars':
      show('screen-select');
      break;
    case 'start':
      if (!settings.rulesSeen && !training() && matchMode === 'nucleo') {
        rulesThenStart = true;
        show('screen-rules');
      } else if (usesLoadout()) openLoadout('pre');
      else startMatch();
      break;
    case 'loadout-ok':
      loadoutScreen.confirm();
      break;
    case 'loadout-back':
      show(loadoutCtx === 'pre' ? 'screen-map' : loadoutCtx === 'pause' ? 'screen-pause' : 'screen-lobby');
      break;
    case 'pause-loadout':
      openLoadout('pause');
      break;
    case 'lobby-loadout':
      openLoadout('lobby');
      break;
    case 'lobby-ready':
      lobbyReady = !lobbyReady;
      net?.send({ t: 'ready', on: lobbyReady });
      $('#lobby-ready').textContent = lobbyReady ? 'Pronto ✓' : 'Estou pronto';
      $('#lobby-ready').classList.toggle('primary', lobbyReady);
      break;
    case 'quick-chefe':
      quickMatch('chefe');
      break;
    case 'rules-ok':
      settings.rulesSeen = true;
      saveSettings(settings);
      if (rulesThenStart) startMatch();
      else if (game) show('screen-pause');
      else show('screen-title');
      break;
    case 'resume':
      resume();
      break;
    case 'restart':
      if (isOnline()) {
        endMatch();
        show('screen-lobby');
      } else startMatch();
      break;
    case 'select':
      endMatch();
      if (net?.room) show('screen-lobby');
      else openSelect();
      break;
    case 'quit':
      endMatch();
      if (net?.room) {
        net.send({ t: 'leave' });
        net.lastRoom = '';
      }
      show('screen-title');
      audio.playMusic('menu');
      break;
    case 'install':
      installApp();
      break;
    case 'shop':
      backFromShop = currentScreen() ?? 'screen-title';
      openShop('char');
      break;
    case 'account':
      openAccount();
      break;
    case 'logout':
      account.logout();
      openAccount();
      break;
    case 'online':
      openOnline();
      break;
    case 'create-room':
      createRoom();
      break;
    case 'leave-room':
      net?.send({ t: 'leave' });
      if (net) net.lastRoom = '';
      lobbyPrev = null;
      show('screen-online');
      break;
    case 'share-room':
      shareRoom();
      break;
    case 'lobby-char':
      selectCtx = 'lobby';
      openSelect();
      break;
    case 'lobby-start':
      // um toque só: o botão trava até o servidor responder (sem partida dupla)
      if (startPending) break;
      startPending = true;
      startPendingT = performance.now();
      $<HTMLButtonElement>('#lobby-start').disabled = true;
      net?.send({ t: 'start' });
      break;
    case 'online-retry':
      if (retryRoom) {
        const code = retryRoom;
        retryRoom = '';
        openOnline((n) => n.send({ t: 'join', code }));
      } else openOnline();
      break;
  }
  void el;
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (el) go(el.dataset.action!, el);
});

// ------------------------------------------------------------------ conta (chip + tela)
function renderChip() {
  const p = account.profile;
  const chip = $('#account-chip');
  (chip.querySelector('.ava') as HTMLImageElement).src = avatarURL(withSkin(getCharacter(p.equipped.char), p.equipped.skin), 40);
  chip.querySelector('.nm')!.textContent = account.logged ? p.username : 'Convidado';
  // convidado: o cartão já diz o que fazer; com conta: o nível
  chip.querySelector('.lv')!.textContent = account.logged ? `Nível ${account.level}` : 'Entrar ou criar conta ›';
  chip.classList.toggle('guest', !account.logged);
  chip.querySelector('.cv')!.textContent = String(p.coins);
  $('#shop-coins').textContent = `${p.coins} moedas`;
  settings.char = p.equipped.char;
}
account.onChange(renderChip);

let accTab: 'login' | 'register' = 'login';
/** view: 'choice' = conta ou convidado; 'form' = entrar/criar; com conta mostra o perfil */
function openAccount(view: 'choice' | 'form' = 'choice') {
  const logged = account.logged;
  $('#acc-choice').hidden = logged || view !== 'choice';
  $('#acc-guest').hidden = logged || view !== 'form';
  $('#acc-logged').hidden = !logged;
  $('#acc-tag').textContent = logged ? 'Sua conta' : view === 'choice' ? 'Bem-vindo ao ECO' : 'Sua conta';
  $('#acc-title').textContent = logged ? account.profile.username : view === 'choice' ? 'Como você quer jogar?' : accTab === 'login' ? 'Entrar' : 'Criar conta';
  $('#acc-error').hidden = true;
  if (view === 'form') setAccTab(accTab);
  if (logged) {
    const p = account.profile;
    $('#acc-stats').innerHTML = [
      [p.coins, 'Moedas'],
      [account.level, 'Nível'],
      [p.wins, 'Vitórias'],
      [p.matches, 'Partidas'],
    ]
      .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`)
      .join('');
  }
  if (!account.online) {
    $('#acc-note').textContent = 'O servidor online ainda não está ligado nesta versão. Seu progresso fica salvo neste aparelho.';
  }
  show('screen-account');
}
function setAccTab(t: 'login' | 'register') {
  accTab = t;
  document.querySelectorAll<HTMLElement>('#acc-guest .tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  $('#acc-submit').textContent = t === 'login' ? 'Entrar' : 'Criar conta';
  $('#acc-title').textContent = t === 'login' ? 'Entrar' : 'Criar conta';
  $<HTMLInputElement>('#acc-pass').autocomplete = t === 'login' ? 'current-password' : 'new-password';
  $('#acc-note').textContent =
    t === 'login' ? 'Use o apelido e a senha que você criou. Funciona em qualquer aparelho.' : 'Escolha um apelido (3 a 16 letras) e uma senha de pelo menos 6. Suas moedas e itens de convidado vão junto.';
}
/** escolha da primeira tela: entrar, criar conta ou seguir como convidado */
document.querySelectorAll<HTMLElement>('[data-acc-go]').forEach((b) =>
  b.addEventListener('click', () => {
    audio.click();
    const go = b.dataset.accGo!;
    if (go === 'guest') {
      settings.welcomeSeen = true;
      saveSettings(settings);
      toast('Jogando como convidado. Dá para criar a conta depois tocando no seu nome, lá em cima.');
      show('screen-title');
      return;
    }
    accTab = go as 'login' | 'register';
    openAccount('form');
    setTimeout(() => $<HTMLInputElement>('#acc-user').focus(), 50);
  }),
);
document.querySelectorAll<HTMLElement>('#acc-guest .tab').forEach((t) =>
  t.addEventListener('click', () => {
    setAccTab(t.dataset.tab as 'login' | 'register');
    audio.click();
  }),
);
$('#acc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = $<HTMLInputElement>('#acc-user').value.trim();
  const pass = $<HTMLInputElement>('#acc-pass').value;
  const btn = $<HTMLButtonElement>('#acc-submit');
  btn.disabled = true;
  btn.textContent = 'Aguarde…';
  try {
    if (accTab === 'login') await account.login(user, pass);
    else await account.register(user, pass);
    $<HTMLInputElement>('#acc-pass').value = '';
    toast(accTab === 'login' ? `Bem-vindo de volta, ${account.profile.username}!` : 'Conta criada! Seu progresso agora fica salvo no servidor.');
    settings.welcomeSeen = true;
    saveSettings(settings);
    show('screen-title');
  } catch (err) {
    const box = $('#acc-error');
    box.textContent = (err as Error).message;
    box.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = accTab === 'login' ? 'Entrar' : 'Criar conta';
  }
});

// ------------------------------------------------------------------ modos
const MODE_INFO: { id: MatchMode; name: string; desc: string; tag: string; color: string; icon: string }[] = [
  {
    id: 'nucleo',
    name: 'Núcleo de Energia',
    desc: 'Pegue energia, leve ao núcleo e fuja dos Ecos. 4 rodadas.',
    tag: 'Você + 1 a 3 bots',
    color: '#5dff8a',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="rgba(93,255,138,.15)" stroke="#5dff8a" stroke-width="3" stroke-dasharray="7 4"/><path d="M24 13 32 18v9l-8 5-8-5v-9z" fill="#c8ffd8" stroke="#1fbf5a" stroke-width="2"/></svg>',
  },
  {
    id: 'duelo',
    name: 'Duelo x1',
    desc: 'Um contra um com armas, bombas e poderes. Vence quem levar 3 rodadas.',
    tag: 'Você contra 1 bot',
    color: '#ff5a3c',
    icon: '<svg viewBox="0 0 48 48"><path d="M8 40 30 18M18 40 40 18" stroke="#ff5a3c" stroke-width="4" stroke-linecap="round"/><circle cx="34" cy="12" r="5" fill="#ffd08a"/><circle cx="14" cy="12" r="5" fill="#ffd08a"/></svg>',
  },
  {
    id: 'combate',
    name: 'Combate',
    desc: 'Todos contra todos. Eliminações e vitórias de rodada valem pontos.',
    tag: 'Você + 1 a 3 bots',
    color: '#ffb347',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="13" fill="#1e1a2a" stroke="#ffb347" stroke-width="3"/><path d="M24 13V7" stroke="#ffb347" stroke-width="3"/><circle cx="24" cy="6" r="3" fill="#ff3a1e"/><path d="M18 26h12M24 20v12" stroke="#ffb347" stroke-width="3"/></svg>',
  },
  {
    id: 'bandeira',
    name: 'Captura a Bandeira',
    desc: 'Times 2 contra 2. Roube a bandeira rival e leve até a sua base.',
    tag: 'Você + 1 aliado vs 2',
    color: '#3ea8ff',
    icon: '<svg viewBox="0 0 48 48"><path d="M12 42V6" stroke="#dfe6ff" stroke-width="3" stroke-linecap="round"/><path d="M12 7c8-4 12 4 22 0v16c-10 4-14-4-22 0z" fill="#3ea8ff" stroke="#0c1a3a" stroke-width="2"/><path d="M36 42V24" stroke="#dfe6ff" stroke-width="3" stroke-linecap="round"/><path d="M36 25c4-2 6 2 10 0v8c-4 2-6-2-10 0z" fill="#ff4a5a"/></svg>',
  },
  {
    id: 'rei',
    name: 'Rei da Colina',
    desc: 'Fique sozinho na zona da coroa para somar pontos. Ela muda de lugar.',
    tag: 'Você + 1 a 3 bots',
    color: '#ffd23e',
    icon: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="36" rx="19" ry="7" fill="rgba(255,210,62,.2)" stroke="#ffd23e" stroke-width="3" stroke-dasharray="6 4"/><path d="M11 28 9 12l8 7 7-11 7 11 8-7-2 16z" fill="#ffd23e" stroke="#5a3a00" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  {
    id: 'ondas',
    name: 'Sobrevivência',
    desc: 'Você e aliados contra 5 ondas de robôs e um chefão. Seus Ecos lutam do seu lado!',
    tag: 'Cooperativo',
    color: '#ff3b3b',
    icon: '<svg viewBox="0 0 48 48"><rect x="11" y="12" width="26" height="22" rx="7" fill="#c8302a" stroke="#2a0808" stroke-width="2.5"/><rect x="15" y="18" width="18" height="6" rx="3" fill="#2a2e3a"/><rect x="17" y="20" width="14" height="2" fill="#ff8a8a"/><path d="M24 12V5" stroke="#9aa4b8" stroke-width="2.5"/><circle cx="24" cy="5" r="3" fill="#ff3b3b"/><path d="M15 34v8M33 34v8" stroke="#3a4252" stroke-width="5" stroke-linecap="round"/></svg>',
  },
  {
    id: 'royale',
    name: 'Batalha Real',
    desc: 'Até 6 jogadores. A zona fecha a cada segundo: fique dentro e seja o último de pé.',
    tag: 'Você + até 5 bots',
    color: '#ff4fd8',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="rgba(120,20,90,.45)"/><circle cx="24" cy="24" r="11" fill="#120c26" stroke="#ff4fd8" stroke-width="3" stroke-dasharray="5 3"/><circle cx="24" cy="24" r="3.5" fill="#fff"/></svg>',
  },
  {
    id: 'chefe',
    name: 'Caça ao Chefe',
    desc: '3 caçadores contra 1 Chefe gigante. Acerte as costas, destrua os geradores e sobreviva aos golpes com aviso.',
    tag: '3 contra 1',
    color: '#ff4a5a',
    icon: '<svg viewBox="0 0 48 48"><path d="M12 14 10 4l7 6 7-8 7 8 7-6-2 10z" fill="#ffd23e" stroke="#3a1a00" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="28" r="13" fill="#5a1020" stroke="#ff4a5a" stroke-width="3"/><circle cx="19" cy="26" r="2.5" fill="#fff"/><circle cx="29" cy="26" r="2.5" fill="#fff"/><path d="M18 34h12" stroke="#ff9a9a" stroke-width="2.5" stroke-linecap="round"/></svg>',
  },
  {
    id: 'treino',
    name: 'Treino',
    desc: 'Aprenda o básico sozinho, contra o seu próprio Eco.',
    tag: 'Tutorial guiado',
    color: '#3ee8ff',
    icon: '<svg viewBox="0 0 48 48"><path d="M10 40V22a14 14 0 0 1 28 0v18l-5-3-4 3-5-3-5 3-4-3z" fill="rgba(62,232,255,.3)" stroke="#3ee8ff" stroke-width="3" stroke-linejoin="round"/><circle cx="19" cy="22" r="2.5" fill="#fff"/><circle cx="29" cy="22" r="2.5" fill="#fff"/></svg>',
  },
];
/** modos principais (cards grandes) e extras (linha pequena) */
const MAIN_MODES: { id: MatchMode; name: string; line: string; tag: string; color: string }[] = [
  { id: 'combate', name: 'Combate', line: 'Todos contra todos. O último de pé vence.', tag: 'Até 4', color: '#ffb347' },
  { id: 'duelo', name: 'Duelo x1', line: 'Você contra um rival. Melhor de 5.', tag: '1 contra 1', color: '#ff5a3c' },
  { id: 'chefe', name: 'Caça ao Chefe', line: '3 caçadores contra 1 Chefe gigante.', tag: 'Novo · 3 contra 1', color: '#ff4a5a' },
  { id: 'ondas', name: 'Sobrevivência', line: 'Junto com aliados contra robôs e um chefão.', tag: 'Cooperativo', color: '#ff3b5c' },
];
const EXTRA_MODES: MatchMode[] = ['nucleo', 'bandeira', 'rei', 'royale', 'treino'];

function openModes() {
  const g = $('#mode-grid');
  g.innerHTML = '';
  const pick = (id: MatchMode) => {
    audio.click();
    matchMode = id;
    selectCtx = 'local';
    openSelect();
  };
  for (const m of MAIN_MODES) {
    const b = document.createElement('button');
    b.className = 'mode-card';
    b.style.setProperty('--c', m.color);
    b.innerHTML = `<canvas class="mode-art" aria-hidden="true"></canvas><span class="mtag">${m.tag}</span><span class="mbody"><span class="mt">${m.name}</span><span class="md">${m.line}</span></span>`;
    b.addEventListener('click', () => pick(m.id));
    g.appendChild(b);
  }
  const row = $('#more-modes');
  row.innerHTML = '';
  for (const id of EXTRA_MODES) {
    const info = MODE_INFO.find((x) => x.id === id)!;
    const b = document.createElement('button');
    b.className = 'mm-chip';
    b.style.setProperty('--c', info.color);
    b.innerHTML = `${info.icon}<span>${id === 'bandeira' ? 'Bandeira 2x2' : info.name}</span>`;
    b.title = info.desc;
    b.addEventListener('click', () => pick(id));
    row.appendChild(b);
  }
  show('screen-modes');
  requestAnimationFrame(() => g.querySelectorAll<HTMLCanvasElement>('canvas.mode-art').forEach((cv, i) => drawModeArt(cv, MAIN_MODES[i].id, MAIN_MODES[i].color)));
}

const MODE_LABEL: Record<string, string> = {
  nucleo: 'Núcleo de Energia',
  duelo: 'Duelo x1',
  combate: 'Combate',
  bandeira: 'Captura a Bandeira',
  rei: 'Rei da Colina',
  ondas: 'Sobrevivência',
  royale: 'Batalha Real',
  chefe: 'Caça ao Chefe',
  treino: 'Treino',
};
/** modos com armas usam a tela de equipamento (passo 3) */
const usesLoadout = () => matchMode !== 'nucleo' && matchMode !== 'treino';

// ------------------------------------------------------------------ seleção (personagem → mapa): carrosséis
const heroScene = new HeroScene(document.createElement('canvas'));
const mapScene = new MapScene(document.createElement('canvas'));
let charCar: Carousel | null = null;
let mapCar: Carousel | null = null;

function charState(c: (typeof CHARACTERS)[number]) {
  const p = account.profile;
  return { owned: owns(p, 'char:' + c.id), price: CHAR_PRICES[c.id] ?? 0, lv: abilityLevel(p, c.id), up: upgradePrice(p, c.id) };
}

function charCardHTML(c: (typeof CHARACTERS)[number]) {
  const st = charState(c);
  return `<canvas class="portrait" aria-hidden="true"></canvas>
    <span class="car-label">
      <span class="badge">${st.owned ? symbolSvg(c.id, c.color) : LOCK}</span>
      <b class="nm" style="--c:${c.color}">${c.name.toUpperCase()}</b>
      <span>${st.owned ? `${c.ability.name} · nv ${st.lv}` : `<span class="coins"><span class="coin"></span>${st.price}</span>`}</span>
    </span>`;
}

function refreshCharCards() {
  if (!charCar) return;
  const skin = account.profile.equipped.skin;
  CHARACTERS.forEach((c, i) => {
    const el = $('#char-carousel .car-track').children[i] as HTMLElement;
    const st = charState(c);
    el.classList.toggle('locked', !st.owned);
    el.style.setProperty('--c', c.color);
    el.innerHTML = charCardHTML(c);
    requestAnimationFrame(() => drawPortrait(el.querySelector('canvas')!, withSkin(c, skin), { locked: !st.owned }));
  });
  fitText(charCar.center.querySelector<HTMLElement>('.car-label b'));
  placeHeroStage();
  $('#char-thumbs')
    .querySelectorAll<HTMLElement>('button')
    .forEach((b, i) => {
      b.classList.toggle('on', i === charCar!.index);
      b.classList.toggle('locked', !charState(CHARACTERS[i]).owned);
    });
}

function placeHeroStage() {
  if (!charCar) return;
  const c = CHARACTERS[charCar.index];
  const cv = (heroScene as any).cv as HTMLCanvasElement;
  cv.className = 'stage';
  charCar.center.appendChild(cv);
  heroScene.set(withSkin(withLevel(c, abilityLevel(account.profile, c.id)), account.profile.equipped.skin), !charState(c).owned);
}

/**
 * trava a altura de um painel na maior entre todas as opções (mede cada uma sem mostrar):
 * assim o carrossel acima nunca muda de tamanho ao trocar de personagem/mapa (o card não "pula")
 */
function lockPanelHeight(el: HTMLElement, n: number, renderAt: (i: number) => void, cur: number) {
  el.style.minHeight = '';
  let max = 0;
  for (let i = 0; i < n; i++) {
    renderAt(i);
    max = Math.max(max, el.offsetHeight);
  }
  renderAt(cur);
  if (max) el.style.minHeight = max + 'px';
}

function charDetail(at?: number) {
  const c = CHARACTERS[at ?? charCar?.index ?? 0];
  const st = charState(c);
  const lvC = withLevel(c, st.lv);
  const nextC = withLevel(c, Math.min(5, st.lv + 1));
  const next = selectCtx === 'lobby' ? 'Usar na sala ›' : 'Escolher mapa ›';
  const coins = account.profile.coins;
  const action = st.owned
    ? `<button class="btn primary go-btn" data-action="to-map">${next}</button>`
    : coins >= st.price
      ? `<button class="btn primary go-btn" id="buy-char"><span class="coin"></span>Liberar por ${st.price}</button>`
      : `<button class="btn go-btn" disabled>Faltam ${st.price - coins} moedas</button>`;
  const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < st.lv ? 'on' : ''}"></i>`).join('');
  const dur = c.ability.duration > 0;
  const stats =
    st.lv >= 5
      ? `Recarga ${lvC.ability.cooldown}s${dur ? ` · duração ${lvC.ability.duration}s` : ''} · nível máximo`
      : `Recarga ${lvC.ability.cooldown}s → <b>${nextC.ability.cooldown}s</b>${dur ? ` · duração ${lvC.ability.duration}s → <b>${nextC.ability.duration}s</b>` : ''}`;
  const upBtn = !st.owned
    ? `<span class="up-note">Libere o personagem para melhorar</span>`
    : st.up === null
      ? `<span class="up-max">MÁXIMO</span>`
      : `<button class="btn small up-btn" id="up-ab" ${coins < st.up ? 'disabled' : ''}>Subir nível · <span class="coin"></span>${st.up}</button>`;
  $('#char-detail').innerHTML = `
    <div class="hp-info">
      <b class="hp-name nm" style="--c:${c.color}">${c.name.toUpperCase()}</b>
      <span class="hp-title">${c.title}</span>
      <span class="hp-tag">${c.tagline}</span>
    </div>
    <div class="hp-ability" style="--c:${c.color}">
      <span class="hp-sec">Melhorar habilidade</span>
      <div class="ab-row">
        <span class="ab-icon">${symbolSvg(c.id, c.color)}</span>
        <div class="ab-text"><b>${c.ability.name}</b> <span class="lvpips">${pips}</span><small>${c.ability.desc}</small><small class="ab-stats">${stats}</small></div>
        ${upBtn}
      </div>
    </div>
    ${action}`;
  $('#buy-char')?.addEventListener('click', async () => {
    const err = await account.buy('char:' + c.id);
    if (err) return toast(err);
    await account.equip('char', c.id);
    settings.char = c.id;
    saveSettings(settings);
    audio.objective();
    toast(`${c.name} liberado!`);
    refreshCharCards();
    charDetail();
  });
  $('#up-ab')?.addEventListener('click', async () => {
    const err = await account.buy('up:' + c.id);
    if (err) return toast(err);
    audio.power('turbo');
    toast(`${c.ability.name} subiu para o nível ${abilityLevel(account.profile, c.id)}!`);
    refreshCharCards();
    charDetail();
  });
}

window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    if (currentScreen() === 'screen-select' && charCar) lockPanelHeight($('#char-detail'), CHARACTERS.length, (i) => charDetail(i), charCar.index);
    if (currentScreen() === 'screen-map' && mapCar) lockPanelHeight($('#map-info').closest<HTMLElement>('.hero-panel')!, ARENAS.length, (i) => mapInfo(i), mapCar.index);
  });
});

function buildCharCarousel() {
  const root = $('#char-carousel');
  charCar = new Carousel(root, CHARACTERS.length, () => document.createElement('button'));
  charCar.onResize = () => refreshCharCards();
  charCar.onChange = async (i) => {
    const c = CHARACTERS[i];
    $('#char-thumbs')
      .querySelectorAll('button')
      .forEach((b, k) => b.classList.toggle('on', k === i));
    ($('#char-thumbs').children[i] as HTMLElement)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    placeHeroStage();
    charDetail();
    audio.ability(c.ability.id);
    if (charState(c).owned) {
      settings.char = c.id;
      saveSettings(settings);
      await account.equip('char', c.id);
    }
  };
  const th = $('#char-thumbs');
  th.innerHTML = '';
  CHARACTERS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.setProperty('--c', c.color);
    b.setAttribute('aria-label', c.name);
    b.innerHTML = `<img src="${avatarURL(c, 44)}" alt="" />`;
    b.addEventListener('click', () => charCar!.set(i));
    th.appendChild(b);
  });
}

// ------------------------------------------------------------------ Como jogar: páginas para o lado
{
  const grid = $('#howto-grid');
  const dots = $('#howto-dots');
  const pages = () => Math.max(1, Math.round(grid.scrollWidth / Math.max(1, grid.clientWidth)));
  const page = () => Math.round(grid.scrollLeft / Math.max(1, grid.clientWidth));
  const paint = () => {
    const n = pages();
    const i = page();
    if (dots.childElementCount !== n) dots.innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
    dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
  };
  const go = (d: number) => grid.scrollTo({ left: (page() + d) * grid.clientWidth, behavior: 'smooth' });
  $('#howto-prev').addEventListener('click', () => go(-1));
  $('#howto-next').addEventListener('click', () => go(1));
  grid.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
  new ResizeObserver(paint).observe(grid);
}

// ------------------------------------------------------------------ abas genéricas (telas que não rolam)
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tabset] [data-tab]');
  if (!b) return;
  const set = b.closest<HTMLElement>('[data-tabset]')!;
  set.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll<HTMLElement>(`[data-pane-of="${set.dataset.tabset}"]`).forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  audio.click();
});

// ------------------------------------------------------------------ pular o Rebobinando
let skipAsked = false;
function trySkipRewind() {
  if (!game || game.phase !== 'rewind' || skipAsked) return;
  skipAsked = true;
  audio.click();
  if (isOnline()) {
    // online: pula quando todos da sala pedirem
    net?.send({ t: 'skip' });
    renderer.skipLabel = 'ESPERANDO OS OUTROS…';
  } else (game as Game).skipRewind();
}
window.addEventListener('keydown', (e) => {
  if (game?.phase !== 'rewind' || (e.code !== 'Space' && e.code !== 'Enter')) return;
  e.preventDefault();
  trySkipRewind();
});
canvas.addEventListener('pointerdown', () => {
  if (game?.phase === 'rewind') trySkipRewind();
});

/** painel curto do fim da rodada: o que cada um gravou e vai voltar como Eco */
let rwSig = '';
function rewindPanel(g: AnyGame) {
  const el = $('#rw-sum');
  const on = g.phase === 'rewind' && g.mode !== 'chefe' && (g as any).roundEchoLines?.length > 0;
  // durante o Rebobinando os botões de toque e a barra de status somem (não cobrem a arena)
  document.body.classList.toggle('rewinding', g.phase === 'rewind');
  el.hidden = !on;
  if (!on) {
    rwSig = '';
    return;
  }
  const lines: RoundEchoLine[] = (g as any).roundEchoLines;
  const sig = `${g.round}|${lines.length}|${g.expiredRound}`;
  if (sig === rwSig) return;
  rwSig = sig;
  const me = g.human.id;
  const sorted = [...lines].sort((a, b) => (a.playerId === me ? -1 : b.playerId === me ? 1 : 0));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const rows = sorted.map((l) => {
    const p = g.players.find((q) => q.id === l.playerId);
    const name = l.playerId === me ? 'Você' : escapeHtml(p?.name || p?.char.name || '—');
    const acts: string[] = [];
    if (g.combat) {
      if (l.shots) acts.push(plural(l.shots, 'tiro', 'tiros'));
      if (l.bombs) acts.push(plural(l.bombs, 'bomba', 'bombas'));
      if (l.mines) acts.push(plural(l.mines, 'mina', 'minas'));
    } else if (l.delivers) acts.push(plural(l.delivers, 'entrega', 'entregas'));
    if (!acts.length) acts.push(l.abilities ? plural(l.abilities, 'manobra', 'manobras') : 'só a rota');
    const fate = l.survived ? '' : `<em>caiu ${Math.floor((l.fellAt ?? 0) / 60)}:${String((l.fellAt ?? 0) % 60).padStart(2, '0')} · Eco até ali</em>`;
    return `<li style="--c:${l.color}"><i></i><b>${name}</b><span>${acts.join(' · ')}</span>${fate}</li>`;
  });
  const next = g.round < g.totalRounds ? `voltam como Ecos na rodada ${g.round + 1}` : 'última rodada';
  const gone = g.expiredRound !== null ? `<p class="rw-gone">Ecos da rodada ${g.expiredRound} se dissiparam</p>` : '';
  // para que serve: o que você fez agora vira um fantasma que joga contra todos nas próximas rodadas
  const last = g.round >= g.totalRounds;
  const why = last
    ? 'Última rodada: estes Ecos não voltam mais.'
    : g.combat
      ? `Na rodada ${g.round + 1}, cada um vira um Eco que repete a rota e os tiros de agora. Lembre por onde passou: ali vai ter um fantasma atirando. Desvie das rotas dos rivais e atraia-os para as suas.`
      : `Na rodada ${g.round + 1}, cada um vira um Eco que refaz este caminho. Encostar num Eco tira 1 vida: lembre por onde todos passaram e evite essas rotas.`;
  el.innerHTML = `<p class="rw-h">GRAVADO NA RODADA ${g.round} · ${next}</p><p class="rw-why">${why}</p><ul>${rows.join('')}</ul>${gone}`;
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const d = e.key === 'ArrowLeft' ? -1 : 1;
  if (!$('#screen-select').hidden && charCar) charCar.go(d);
  else if (!$('#screen-map').hidden && mapCar) mapCar.go(d);
  else if (!$('#screen-loadout').hidden) loadoutScreen.go(d);
  else if (!$('#screen-shop').hidden) shopCar?.go(d);
  else if (!$('#screen-howto').hidden) ($(d < 0 ? '#howto-prev' : '#howto-next') as HTMLButtonElement).click();
});

function openSelect() {
  const label = selectCtx === 'lobby' ? 'Sala online' : MODE_LABEL[matchMode];
  $('#select-mode').textContent = selectCtx === 'lobby' ? label : `${label} · passo 1 de ${usesLoadout() ? 3 : 2}`;
  if (!charCar) buildCharCarousel();
  const idx = Math.max(0, CHARACTERS.findIndex((c) => c.id === settings.char));
  show('screen-select');
  // painel com altura fixa ANTES de posicionar o carrossel (senão o card nasce grande e encolhe)
  lockPanelHeight($('#char-detail'), CHARACTERS.length, (i) => charDetail(i), idx);
  charCar!.set(idx, true);
  refreshCharCards();
  heroScene.start();
}
const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5" y="11" width="14" height="10" rx="2" fill="#ffd23e"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#ffd23e" stroke-width="2.4" fill="none"/></svg>';

function mapInfo(at?: number) {
  const a = ARENAS[at ?? mapCar?.index ?? 0];
  const d = MAP_DIFFICULTY[a.id] ?? 3;
  const dl = ['', 'Fácil', 'Fácil', 'Média', 'Difícil', 'Insana'][d];
  const dc = ['', '#5dff8a', '#5dff8a', '#ffd23e', '#ff8a3c', '#ff3b5c'][d];
  const bars = Array.from({ length: 5 }, (_, i) => `<i style="${i < d ? `background:${dc}` : ''}"></i>`).join('');
  const rules = matchMode === 'chefe' ? '<span class="chefe-line">3 caçadores × 1 Chefe · acerte as costas · destrua os geradores · saia das áreas marcadas</span>' : '';
  $('#map-info').innerHTML = `<b class="hp-name nm" style="--c:${a.palette.accent}">${a.name.toUpperCase()}</b><span class="hp-tag">${a.desc} ${a.gimmick}</span>${rules}<span class="diff">Dificuldade: <b style="color:${dc}">${dl}</b> <span class="dbars">${bars}</span></span>`;
}

function placeMapStage() {
  if (!mapCar) return;
  const cv = (mapScene as any).cv as HTMLCanvasElement;
  cv.className = 'stage';
  mapCar.center.appendChild(cv);
  mapScene.set(ARENAS[mapCar.index]);
}

function buildMapCarousel() {
  mapCar = new Carousel($('#map-carousel'), ARENAS.length, (i) => {
    const a = ARENAS[i];
    const b = document.createElement('button');
    b.style.setProperty('--c', a.palette.accent);
    b.innerHTML = `<canvas class="preview" aria-hidden="true"></canvas><span class="car-label"><b class="nm" style="--c:${a.palette.accent}">${a.name.toUpperCase()}</b></span>`;
    return b;
  });
  mapCar.aspect = 0.78;
  mapCar.onResize = () => requestAnimationFrame(() => $('#map-carousel').querySelectorAll<HTMLCanvasElement>('canvas.preview').forEach((cv, i) => drawMapPreview(cv, ARENAS[i])));
  mapCar.onChange = (i) => {
    settings.arena = ARENAS[i].id;
    saveSettings(settings);
    placeMapStage();
    mapInfo();
    audio.click();
  };
}

function openMap() {
  $('#map-mode').textContent = `${MODE_LABEL[matchMode]} · ${getCharacter(settings.char).name} · passo 2 de ${usesLoadout() ? 3 : 2}`;
  $('#match-opts').hidden = training();
  const chefe = matchMode === 'chefe';
  $('#role-opt').hidden = !chefe;
  $<HTMLSelectElement>('#sel-role').value = settings.chefeRole;
  const goTxt = usesLoadout() ? 'Equipamento ›' : 'Começar partida ›';
  $('#map-go').textContent = goTxt;
  $('#map-go-top').textContent = usesLoadout() ? 'Próximo ›' : 'Começar ›';
  const botSel = $<HTMLSelectElement>('#sel-bots');
  botSel.closest('label')!.hidden = matchMode === 'duelo' || matchMode === 'bandeira' || chefe;
  const mm = matchMode === 'treino' ? 'nucleo' : (matchMode as GameMode);
  const maxBots = MODE_RULES[mm].maxPlayers - 1;
  const minBots = matchMode === 'ondas' ? 0 : 1;
  const word = matchMode === 'ondas' ? ['aliado', 'aliados'] : ['bot', 'bots'];
  $('#bots-label').textContent = matchMode === 'ondas' ? 'Aliados' : 'Adversários';
  botSel.innerHTML = '';
  for (let n = minBots; n <= maxBots; n++) botSel.add(new Option(n === 0 ? 'Sozinho' : `${n} ${n === 1 ? word[0] : word[1]}`, String(n)));
  settings.bots = Math.max(minBots, Math.min(maxBots, settings.bots));
  botSel.value = String(settings.bots);
  $<HTMLSelectElement>('#sel-diff').value = settings.difficulty;
  if (!mapCar) buildMapCarousel();
  show('screen-map');
  const mi = Math.max(0, ARENAS.findIndex((a) => a.id === settings.arena));
  lockPanelHeight($('#map-info').closest<HTMLElement>('.hero-panel')!, ARENAS.length, (i) => mapInfo(i), mi);
  mapCar!.set(mi, true);
  placeMapStage();
  requestAnimationFrame(() => $('#map-carousel').querySelectorAll<HTMLCanvasElement>('canvas.preview').forEach((cv, i) => drawMapPreview(cv, ARENAS[i])));
  mapScene.start();
}
$<HTMLSelectElement>('#sel-bots').addEventListener('change', (e) => {
  settings.bots = Number((e.target as HTMLSelectElement).value);
  saveSettings(settings);
});
$<HTMLSelectElement>('#sel-role').addEventListener('change', (e) => {
  settings.chefeRole = (e.target as HTMLSelectElement).value as Settings['chefeRole'];
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
    nyx: '<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" fill="C"/>',
    rex: '<circle cx="12" cy="12" r="5" stroke="C" stroke-width="3" fill="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="C" stroke-width="2.4"/>',
    iris: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="C"/>',
    tara: '<path d="M3 6c1 7 5 9 9 9s8-2 9-9c-3 4-6 5-9 5S6 10 3 6z" fill="C"/><rect x="9" y="14" width="6" height="7" rx="2" fill="C"/>',
    kai: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" stroke="C" stroke-width="2.4" stroke-linecap="round"/>',
    leo: '<path d="M12 2 5 13h6l-2 9 10-13h-6l3-7z" fill="C"/>',
    mei: '<path d="M12 12m-1 0a1 1 0 1 0 2 0a3 3 0 1 0-6 0a5 5 0 1 0 10 0a7 7 0 1 0-14 0a9 9 0 1 0 18 0" stroke="C" stroke-width="2" fill="none"/>',
    duda: '<path d="M12 2v13M12 15a4 4 0 0 1-8 0M12 15a4 4 0 0 0 8 0" stroke="C" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    bento: '<circle cx="8" cy="14" r="5" fill="C"/><circle cx="16" cy="14" r="5" fill="C"/><circle cx="12" cy="9" r="6" fill="C"/>',
  };
  return `<svg viewBox="0 0 24 24" width="16" height="16">${(paths[id] ?? paths.zed).replace(/C/g, color)}</svg>`;
}

// ------------------------------------------------------------------ loja
let shopTab: 'char' | 'skin' | 'trail' = 'char';
let shopCar: Carousel | null = null;
/** loja em carrossel (deslizar para o lado), igual a personagens/mapas/equipamento: nada rola para baixo */
function openShop(tab: 'char' | 'skin' | 'trail', keep?: number) {
  shopTab = tab;
  document.querySelectorAll<HTMLElement>('#shop-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.shop === tab));
  const p = account.profile;
  const base = withSkin(getCharacter(p.equipped.char), p.equipped.skin);
  const items: { id: string; name: string; price: number; color: string; draw: (cv: HTMLCanvasElement) => void }[] =
    tab === 'char'
      ? CHARACTERS.map((c) => ({ id: c.id, name: c.name, price: CHAR_PRICES[c.id] ?? 0, color: c.color, draw: (cv) => drawPortrait(cv, withSkin(c, p.equipped.skin)) }))
      : tab === 'skin'
        ? SKINS.map((s) => ({ id: s.id, name: s.name, price: s.price, color: base.color, draw: (cv) => drawPortrait(cv, withSkin(getCharacter(p.equipped.char), s.id)) }))
        : TRAILS.map((t) => ({ id: t.id, name: t.name, price: t.price, color: t.colors[0] ?? base.color, draw: (cv) => drawTrailPreview(cv, base, t.colors) }));
  const box = $('#shop-car');
  box.innerHTML = `<button class="car-arrow left" aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" /></svg></button>
    <div class="car-track"></div>
    <button class="car-arrow right" aria-label="Próximo"><svg viewBox="0 0 24 24"><path d="m9 4 8 8-8 8" /></svg></button>`;
  const car = new Carousel(box, items.length, (i) => {
    const it = items[i];
    const owned = owns(p, `${tab}:${it.id}`);
    const b = document.createElement('button');
    b.className = 'shop-card' + (p.equipped[tab] === it.id ? ' equipped' : '') + (owned ? '' : ' locked');
    b.style.setProperty('--c', it.color);
    b.innerHTML = `<canvas class="pv"></canvas>${p.equipped[tab] === it.id ? '<span class="lo-badge">✓</span>' : !owned ? '<span class="lo-badge lock">🔒</span>' : ''}<span class="car-label"><b>${it.name}</b></span>`;
    return b;
  });
  shopCar = car;
  car.aspect = 0.72;
  const drawAll = () => box.querySelectorAll<HTMLCanvasElement>('canvas.pv').forEach((cv, i) => items[i].draw(cv));
  car.onResize = drawAll;
  const act = () => {
    const it = items[car.index];
    const key = `${tab}:${it.id}`;
    const owned = owns(p, key);
    const equipped = p.equipped[tab] === it.id;
    const btn = equipped
      ? '<span class="lo-state on">✓ Equipado</span>'
      : owned
        ? '<button class="btn primary shop-go">Usar</button>'
        : `<button class="btn primary shop-go"><span class="coin"></span>Comprar por ${it.price}</button>`;
    $('#shop-act').innerHTML = `<div class="shop-act-info"><b>${it.name}</b><span>${car.index + 1} de ${items.length} · deslize para o lado</span></div>${btn}`;
    $('#shop-act').querySelector('.shop-go')?.addEventListener('click', async () => {
      if (!owned) {
        if (p.coins < it.price) return toast(`Faltam ${it.price - p.coins} moedas para ${it.name}.`);
        const err = await account.buy(key);
        if (err) return toast(err);
        audio.objective();
        toast(`${it.name} comprado!`);
      }
      const err = await account.equip(tab, it.id);
      if (err) return toast(err);
      audio.click();
      openShop(tab, car.index);
    });
  };
  car.onChange = () => {
    audio.click();
    act();
  };
  const start = keep ?? Math.max(0, items.findIndex((it) => p.equipped[tab] === it.id));
  car.set(start, true);
  act();
  requestAnimationFrame(drawAll);
  if (currentScreen() !== 'screen-shop') show('screen-shop');
}
document.querySelectorAll<HTMLElement>('#shop-tabs .tab').forEach((t) =>
  t.addEventListener('click', () => {
    audio.click();
    openShop(t.dataset.shop as 'char' | 'skin' | 'trail');
  }),
);
function drawTrailPreview(cv: HTMLCanvasElement, c: ReturnType<typeof getCharacter>, colors: string[]) {
  drawPortrait(cv, c);
  const g = cv.getContext('2d')!;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!colors.length) return;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.85 - i / 50;
    g.beginPath();
    g.arc(w * 0.5 - 10 - i * 2.2 + Math.sin(i) * 4, h * 0.88 - Math.random() * 18, 2 + Math.random() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ online
// Uma conexão só por aba (dois toques rápidos não abrem duas), e se ela cair o jogo tenta voltar
// sozinho para a mesma sala: o servidor guarda a vaga por alguns segundos.
let netPromise: Promise<NetClient> | null = null;
let reconnecting = false;

function ensureNet(): Promise<NetClient> {
  if (net?.connected) return Promise.resolve(net);
  if (!netPromise) netPromise = connectNet().finally(() => (netPromise = null));
  return netPromise;
}

/** apelido de convidado (fica salvo); conta logada usa o nome da conta */
function guestName(): string {
  if (!settings.nick) {
    settings.nick = 'Convidado ' + (10 + Math.floor(Math.random() * 90));
    saveSettings(settings);
  }
  return settings.nick;
}

async function connectNet(): Promise<NetClient> {
  const base = serverUrl();
  if (!base) throw new Error('O servidor online ainda não foi publicado. Ele entra no ar junto com a próxima atualização no Render.');
  const n = new NetClient();
  n.onRoom = (r) => {
    if (n !== net) return;
    if (r) renderLobby(r, n.id);
    else {
      lobbyPrev = null;
      if (currentScreen() === 'screen-lobby') show('screen-online');
    }
  };
  n.onError = (msg) => {
    if (n !== net) return;
    startPending = false;
    $<HTMLButtonElement>('#lobby-start').disabled = false;
    showOnlineError(msg);
    toast(msg);
  };
  n.onStart = (info) => n === net && startOnline(info);
  n.onSnap = (s, ev) => {
    if (n === net && game instanceof ClientGame) game.applySnapshot(s, ev);
  };
  n.onEnd = (info) => n === net && showOnlineResults(info);
  n.onClose = () => {
    if (n !== net) return;
    const room = n.lastRoom;
    if (room || game instanceof ClientGame) reconnect(room);
    else $('#online-status').textContent = 'Sem conexão';
  };
  const old = net;
  await n.connect(base, account.logged ? account.profile.username : guestName(), account.token);
  if (old && old !== n) old.close();
  net = n;
  if (n.serverV !== PROTO) {
    // app velho (ou servidor ainda atualizando): avisa em vez de entrar e ficar tudo estranho
    const msg = n.serverV > PROTO
      ? 'Seu jogo está desatualizado. Feche e abra o jogo de novo (ou recarregue a página) para atualizar.'
      : 'O servidor está atualizando. Tente de novo em 1 minuto.';
    showOnlineError(msg);
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
  }
  sendLobbyLook();
  return n;
}

function showOnlineError(msg: string, retry = false) {
  const box = $('#online-error');
  box.textContent = msg;
  box.hidden = false;
  $('#online-retry').hidden = !retry;
}

function setNetBanner(text: string | null) {
  const b = $('#net-banner');
  b.hidden = !text;
  if (text) b.textContent = text;
}

/** a conexão caiu: tenta voltar algumas vezes (o servidor guarda a vaga por ~20 s) */
async function reconnect(room: string) {
  if (reconnecting) return;
  reconnecting = true;
  const inMatch = game instanceof ClientGame;
  setNetBanner('Conexão perdida — reconectando…');
  const waits = [400, 1000, 1500, 2500, 3500, 5000, 6000];
  for (let i = 0; i < waits.length; i++) {
    await new Promise((r) => setTimeout(r, waits[i]));
    setNetBanner(`Conexão perdida — reconectando… (tentativa ${i + 1} de ${waits.length})`);
    try {
      const n = await ensureNet();
      reconnecting = false;
      setNetBanner(null);
      if (n.resumed) {
        toast('Reconectado! Você voltou para a sala.');
        return;
      }
      // a vaga não existe mais: se era o saguão, tenta entrar de novo pelo código
      if (inMatch && game instanceof ClientGame) {
        endMatch();
        show('screen-online');
        showOnlineError('Você ficou fora tempo demais e a partida seguiu sem você. Entre de novo na sala quando ela acabar.');
      }
      if (room) n.send({ t: 'join', code: room });
      return;
    } catch {
      /* tenta de novo */
    }
  }
  reconnecting = false;
  setNetBanner(null);
  if (game instanceof ClientGame) endMatch();
  lobbyPrev = null;
  show('screen-online');
  $('#online-status').textContent = 'Sem conexão';
  showOnlineError('Sem conexão com o servidor. Confira a internet e toque em Tentar de novo.', true);
  retryRoom = room;
}
let retryRoom = '';

function sendLobbyLook() {
  const p = account.profile;
  net?.send({ t: 'set', char: owns(p, 'char:' + settings.char) ? settings.char : p.equipped.char, skin: p.equipped.skin, trail: p.equipped.trail });
  net?.send({ t: 'loadout', l: settings.loadout });
}

// ------------------------------------------------------------------ equipamento
let loadoutCtx: 'pre' | 'pause' | 'lobby' = 'pre';
let lobbyReady = false;
const loadoutScreen = new LoadoutScreen($('#screen-loadout'), {
  owns: (k) => owns(account.profile, k),
  coins: () => account.profile.coins,
  buy: (k) => account.buy(k),
  toast: (m) => toast(m),
  click: () => audio.click(),
  keyOf: (slot) => (input.touchMode ? { skill: 'HAB 2', ult: 'ULT', item: 'ITEM' }[slot] : keyLabel(settings.keys[slot])),
});
function openLoadout(ctx: 'pre' | 'pause' | 'lobby') {
  loadoutCtx = ctx;
  const sub =
    ctx === 'pre'
      ? `${MODE_LABEL[matchMode]} · ${getCharacter(settings.char).name} · passo 3 de 3`
      : ctx === 'pause'
        ? 'Vale a partir da próxima rodada (recargas não zeram)'
        : 'Sala online · vale na próxima partida ou rodada';
  loadoutScreen.open({
    charId: ctx === 'pause' && game ? game.human.char.id : settings.char,
    loadout: settings.loadout,
    subtitle: sub,
    confirmText: ctx === 'pre' ? 'Começar ›' : 'Confirmar ✓',
    onConfirm: (l) => {
      settings.loadout = l;
      saveSettings(settings);
      audio.click();
      if (ctx === 'pre') {
        startMatch();
      } else if (ctx === 'pause') {
        if (game instanceof Game) game.setLoadout(game.human.id, l);
        else net?.send({ t: 'loadout', l });
        toast('Equipamento troca na próxima rodada.');
        show('screen-pause');
      } else {
        net?.send({ t: 'loadout', l });
        toast('Equipamento salvo.');
        show('screen-lobby');
      }
    },
  });
  show('screen-loadout');
}

async function quickMatch(mode: GameMode) {
  try {
    const n = await ensureNet();
    n.send({ t: 'quick', mode });
    toast('Procurando jogadores…');
  } catch (e) {
    showOnlineError((e as Error).message, true);
  }
}

async function openOnline(then?: (n: NetClient) => void) {
  $('#online-error').hidden = true;
  $('#online-retry').hidden = true;
  $('#online-status').textContent = 'Conectando…';
  $('#online-note').textContent = account.logged
    ? 'Partidas online dão 50% a mais de moedas.'
    : 'Você está como convidado: dá para jogar, mas só ganha moedas quem entra na conta (toque no seu nome lá em cima).';
  $('#nick-row').hidden = account.logged;
  $<HTMLInputElement>('#nick').value = account.logged ? '' : guestName();
  show('screen-online');
  try {
    const n = await ensureNet();
    $('#online-status').textContent = `Conectado como ${n.name}`;
    then?.(n);
  } catch (e) {
    $('#online-status').textContent = 'Sem conexão';
    showOnlineError((e as Error).message, true);
  }
}
$('#nick').addEventListener('change', () => {
  const v = $<HTMLInputElement>('#nick').value.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);
  if (!v) return;
  settings.nick = v;
  saveSettings(settings);
  net?.send({ t: 'nick', name: v });
  if (net) $('#online-status').textContent = `Conectado como ${v}`;
});
document.querySelectorAll<HTMLElement>('#online-modes .pill').forEach((p) =>
  p.addEventListener('click', () => {
    onlineMode = p.dataset.omode as GameMode;
    document.querySelectorAll('#online-modes .pill').forEach((x) => x.classList.toggle('on', x === p));
    audio.click();
  }),
);
async function createRoom() {
  try {
    const n = await ensureNet();
    n.send({ t: 'create', mode: onlineMode, arena: settings.arena, bots: onlineMode === 'duelo' ? 0 : onlineMode === 'bandeira' || onlineMode === 'royale' || onlineMode === 'chefe' ? 3 : 1 });
  } catch (e) {
    showOnlineError((e as Error).message, true);
  }
}
async function joinRoom(code: string) {
  code = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return toast('O código tem 4 letras/números.');
  $('#online-error').hidden = true;
  try {
    const n = await ensureNet();
    n.send({ t: 'join', code });
  } catch (err) {
    showOnlineError((err as Error).message, true);
  }
}
$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  joinRoom($<HTMLInputElement>('#join-code').value);
});

const arenaSel = $<HTMLSelectElement>('#lobby-arena');
arenaSel.innerHTML = ARENAS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
for (const sel of ['#lobby-mode', '#lobby-arena', '#lobby-bots']) {
  $(sel).addEventListener('change', () => {
    net?.send({ t: 'config', mode: $<HTMLSelectElement>('#lobby-mode').value as GameMode, arena: arenaSel.value, bots: Number($<HTMLSelectElement>('#lobby-bots').value) });
  });
}

/** sala que estava na tela (para avisar quem entrou, saiu ou virou dono) */
let lobbyPrev: RoomInfo | null = null;
let startPending = false;
let startPendingT = 0;

function renderLobby(r: RoomInfo, me: string) {
  const prev = lobbyPrev && lobbyPrev.code === r.code ? lobbyPrev : null;
  lobbyPrev = r;
  const hostP = r.players.find((p) => p.host);
  const host = hostP?.id === me;
  const mine = r.players.find((p) => p.id === me);
  // avisos do que mudou
  if (!prev) {
    if (!host && hostP && r.state === 'lobby') toast(`Você entrou na sala de ${hostP.name}.`);
  } else if (r.state === 'lobby' || prev.state === 'lobby') {
    for (const p of r.players) if (p.id !== me && !prev.players.some((q) => q.id === p.id)) toast(`${p.name} entrou na sala.`);
    for (const q of prev.players) if (!r.players.some((p) => p.id === q.id)) toast(`${q.name} saiu da sala.`);
    const ph = prev.players.find((p) => p.host);
    if (hostP && ph && ph.id !== hostP.id) toast(host ? 'Você agora é o dono da sala.' : `${hostP.name} agora é o dono da sala.`);
  }
  $('#room-code').textContent = r.code;
  const max = r.max ?? MODE_RULES[r.mode].maxPlayers;
  $('#lobby-count').textContent = `${r.players.length} de ${max} pessoas na sala · ${MODE_LABEL[r.mode]}`;
  const list = $('#lobby-list');
  list.innerHTML = '';
  for (const p of r.players) {
    const c = withSkin(getCharacter(p.char), p.skin);
    const li = document.createElement('li');
    li.style.setProperty('--c', c.color);
    li.classList.toggle('me', p.id === me);
    li.classList.toggle('away', !!p.away);
    li.dataset.pid = p.id;
    const tags = `${p.id === me ? '<i class="tag you">Você</i>' : ''}${p.host ? '<i class="tag host">Dono</i>' : ''}`;
    const state = p.away ? 'reconectando…' : p.ready ? '<span class="rdy">✓ pronto</span>' : r.public ? 'na fila' : p.logged ? 'conta' : 'convidado';
    li.innerHTML = `<img src="${avatarURL(c, 44)}" alt="" /><span class="ln"><b class="pn">${escapeHtml(p.name)}</b>${tags}</span><span class="lt">${c.name} · ${state}</span>`;
    list.appendChild(li);
  }
  for (let i = r.players.length; i < max; i++) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = r.bots > i - r.players.length && r.mode !== 'duelo' ? 'Vaga — um bot entra se ninguém vier' : 'Vaga livre — mande o convite para um amigo';
    list.appendChild(li);
  }
  $<HTMLSelectElement>('#lobby-mode').value = r.mode;
  arenaSel.value = r.arena;
  $<HTMLSelectElement>('#lobby-bots').value = String(r.bots);
  for (const sel of ['#lobby-mode', '#lobby-arena', '#lobby-bots']) $<HTMLSelectElement>(sel).disabled = !host;
  $('#lobby-bots').closest('label')!.hidden = r.mode === 'duelo';
  $('#lobby-start').hidden = !host || !!r.public;
  $('#lobby-config').hidden = !!r.public;
  // "pronto" vem do servidor (não fica preso de uma sala para outra)
  lobbyReady = !!mine?.ready;
  $('#lobby-ready').textContent = lobbyReady ? 'Pronto ✓' : 'Estou pronto';
  $('#lobby-ready').classList.toggle('primary', lobbyReady);
  const total = Math.min(max, r.mode === 'duelo' ? 2 : r.players.length + r.bots);
  const min = MIN_PLAYERS[r.mode] ?? 2;
  const others = r.players.filter((p) => p.id !== me && !p.host);
  const readyN = others.filter((p) => p.ready).length;
  $('#lobby-note').textContent = r.public
    ? `Busca automática · ${MODE_LABEL[r.mode]}: começa quando lotar, quando todos estiverem prontos ou em ${r.autoIn ?? 0}s (bots completam as vagas).`
    : r.mode === 'chefe' && total < min
      ? `Caça ao Chefe precisa de ${min} participantes (pessoas + bots). Agora: ${total}. Aumente os bots ou chame mais gente.`
      : host
        ? r.players.length < 2 && r.mode === 'duelo'
          ? 'Sozinho? Pode começar: um bot entra no lugar do amigo.'
          : others.length
            ? `${readyN} de ${others.length} ${others.length === 1 ? 'amigo pronto' : 'amigos prontos'}. Quando quiser, toque em Começar.`
            : r.mode === 'chefe'
              ? 'O Chefe é sorteado em rodízio: quem foi Chefe menos vezes tem a vez. Toque em Começar.'
              : 'Mande o convite para os amigos. Quando todo mundo entrar, toque em Começar.'
        : `Você está na sala de ${hostP?.name ?? 'outro jogador'}. Esperando ${hostP?.name ?? 'o dono'} começar a partida.`;
  if (r.state === 'playing' || performance.now() - startPendingT > 5000) startPending = false;
  $<HTMLButtonElement>('#lobby-start').disabled = startPending || (r.mode === 'chefe' && total < min);
  if (!game && !['screen-select', 'screen-lobby', 'screen-loadout'].includes(currentScreen() ?? '')) show('screen-lobby');
  if (currentScreen() === 'screen-online') show('screen-lobby');
}

async function shareRoom() {
  const code = net?.room?.code;
  if (!code) return;
  const link = `${location.origin}${location.pathname}?sala=${code}`;
  const text = `Bora jogar ECO comigo! Toque no link para entrar na minha sala: ${link} (ou abra o jogo → Jogar online → Entrar → código ${code})`;
  try {
    if (navigator.share) await navigator.share({ title: 'ECO', text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Convite copiado! Cole no WhatsApp ou onde quiser.');
    }
  } catch {
    toast(`Código da sala: ${code}`);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function startOnline(info: import('./net/protocol').StartInfo) {
  const cg = new ClientGame(info);
  beginMatchView(cg);
}

// ------------------------------------------------------------------ partida
function localRoster(): RosterEntry[] {
  const p = account.profile;
  const human: RosterEntry = { id: 'p0', char: settings.char, isBot: false, name: 'Você', skin: p.equipped.skin, trail: p.equipped.trail, lv: abilityLevel(p, settings.char), loadout: sanitizeLoadout(settings.loadout, (k) => owns(p, k)) };
  if (training()) return [human];
  const n = matchMode === 'duelo' ? 1 : matchMode === 'bandeira' || matchMode === 'chefe' ? 3 : Math.min(settings.bots, MODE_RULES[matchMode as GameMode].maxPlayers - 1);
  const pool = CHARACTERS.map((c) => c.id).filter((id) => id !== settings.char);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bots: RosterEntry[] = pool.slice(0, n).map((c, i) => ({ id: 'b' + i, char: c, isBot: true, name: getCharacter(c).name }));
  if (matchMode === 'chefe') {
    // papel: escolhido ou sorteio justo (rodízio: você é o Chefe 1 a cada 4 partidas)
    settings.bossTurns = (settings.bossTurns ?? 0) + 1;
    saveSettings(settings);
    const meBoss = settings.chefeRole === 'chefe' || (settings.chefeRole === 'sorteio' && settings.bossTurns % 4 === 0);
    if (meBoss) human.boss = true;
    else bots[0].boss = true;
  }
  return [human, ...bots];
}

function startMatch() {
  audio.unlock();
  if (!owns(account.profile, 'char:' + settings.char)) settings.char = account.profile.equipped.char;
  const arena = getArena(settings.arena);
  const g = new Game({
    arena,
    humanChar: settings.char,
    bots: settings.bots,
    difficulty: settings.difficulty,
    ownEchoDamage: settings.ownEcho,
    training: training(),
    mode: training() ? 'nucleo' : (matchMode as GameMode),
    roster: localRoster(),
  });
  beginMatchView(g);
}

function beginMatchView(g: AnyGame) {
  game = g;
  renderer.setArena(g.arena);
  layout();
  input.clear();
  input.combat = g.combat;
  hintStage = training() ? 1 : 0;
  hintT = 0;
  const me = g.human;
  $('#btn-ability .tlabel').textContent = me.boss ? 'IMPACTO' : me.char.ability.label.toUpperCase();
  $('#touch').classList.toggle('combat', g.combat);
  $('#touch').classList.toggle('boss', me.boss);
  $('#btn-fire').hidden = !g.combat;
  $('#btn-item').hidden = !g.combat || me.boss;
  $('#btn-bonus').hidden = training() && !isOnline();
  $('#btn-skill').hidden = !g.combat;
  $('#btn-ult').hidden = !g.combat;
  $('#btn-skill .tlabel').textContent = me.boss ? 'BARRAGEM' : SKILLS[me.loadout.skill].name.toUpperCase();
  $('#btn-ult .tlabel').textContent = me.boss ? 'ROCHAS' : 'ULT';
  $('#btn-dash .tlabel').textContent = me.boss ? 'AVANÇO' : 'IMPULSO';
  $('#pause-loadout').hidden = !g.combat || me.boss || g.rules.rounds <= 1;
  skillBar.clear();
  ultWasReady = false;
  touchIconSig = '';
  buildScoreboard();
  show(null);
  audio.playMusic('game', g.arena.music);
  tryFullscreen();
}

function endMatch() {
  game = null;
  document.body.classList.remove('rewinding');
  $('#rw-sum').hidden = true;
  input.cancelAim();
  renderer.aimPreview = null;
  idleGame = null;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#banner').hidden = true;
  $('#hint').hidden = true;
}

function pause() {
  if (!game || game.phase === 'results' || game.paused) return;
  if (!isOnline()) game.paused = true;
  input.clear();
  $('#screen-pause .btn[data-action=restart]').textContent = isOnline() ? 'Voltar para a sala' : 'Reiniciar partida';
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
let monsterAva = '';
/** retrato do Chefe (a criatura) para o placar */
function monsterAvatar() {
  if (monsterAva) return monsterAva;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 88;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2a0c1c';
  g.fillRect(0, 0, 88, 88);
  g.translate(10, 150);
  g.scale(1.25, 1.25);
  drawMonster(g, { t: 1, walk: 0, moving: false, windup: 0, slam: 0, roar: 0.6, hurt: 0, shoot: 0, stun: false, phase: 2, dead: 0, weak: false });
  monsterAva = cv.toDataURL();
  return monsterAva;
}
const scoreboard = new Scoreboard($('#scoreboard'), {
  avatar: (p) => (p.boss ? monsterAvatar() : avatarURL(p.char, 44)),
  esc: escapeHtml,
  notify: (text, mine) => leadNote(text, mine),
  compact: () => input.touchMode || innerHeight < 520,
});
function buildScoreboard() {
  scoreboard.build(game);
}
/** aviso curto embaixo do cronômetro (ex.: "Fulano assumiu a liderança") */
let leadNoteT = 0;
function leadNote(text: string, mine: boolean) {
  const el = $('#lead-note');
  el.textContent = text;
  el.classList.toggle('mine', mine);
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(leadNoteT);
  leadNoteT = window.setTimeout(() => (el.hidden = true), 2600);
}
// computador: segurar Tab mostra o placar completo
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && game && !e.repeat && !input.capture) scoreboard.toggle(true);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') scoreboard.toggle(false);
});
window.addEventListener('blur', () => scoreboard.toggle(false));

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

function objectiveText(g: AnyGame) {
  if (g.mode === 'duelo') return 'Vença 3 rodadas · ATIRAR, ITEM e poderes';
  if (g.mode === 'combate') return 'Elimine os rivais · eliminação = 2, rodada = 3';
  if (g.mode === 'bandeira') return `Azul ${g.teamScore[0]} × ${g.teamScore[1]} Vermelho · leve a bandeira rival à sua base`;
  if (g.mode === 'rei') return 'Fique sozinho na colina: +1 ponto por segundo';
  if (g.mode === 'ondas') return g.wave >= g.totalRounds ? 'Onda final: derrubem o CHEFÃO juntos' : 'Sobreviva às ondas de robôs com seu time';
  if (g.mode === 'royale') return 'Fique dentro da zona · o último de pé vence';
  if (g.mode === 'chefe')
    return g.human.boss
      ? `Você é o Chefe: elimine os caçadores ou resista ${Math.round(g.roundDur / 60)} min · golpes têm aviso`
      : 'Acerte as COSTAS do Chefe, destrua os geradores e saia das áreas marcadas';
  return OBJECTIVES[g.objective as keyof typeof OBJECTIVES];
}

const OBJ_SHORT: Record<string, string> = { dourado: '★ Fragmento dourado', tripla: '★ Entrega tripla', intocavel: '★ Sem levar dano' };

/** HUD de combate: só placar/objetivo curto, nunca a explicação do modo */
function objectiveHud(g: AnyGame) {
  if (g.phase !== 'play') return '';
  if (g.mode === 'bandeira') return `Azul ${g.teamScore[0]} × ${g.teamScore[1]} Vermelho`;
  if (g.mode === 'ondas') return g.wave >= g.totalRounds ? 'CHEFÃO' : `${g.enemies.length} ${g.enemies.length === 1 ? 'robô' : 'robôs'}`;
  if (g.mode === 'nucleo') return OBJ_SHORT[g.objective as string] ?? '';
  // Caça ao Chefe: a barra do Chefe já mostra vida, fase, geradores e vidas do time
  return '';
}

/** como cada habilidade/item funciona contra o Chefe e as criaturas (só aparece no modo Caça ao Chefe) */
const BOSS_NOTE: Record<string, string> = {
  investida: 'atordoa o Chefe só 30% e quase não empurra; derruba criaturas.',
  raio: 'pula entre criaturas e geradores; no Chefe atordoa só 30%.',
  gancho: 'não puxa o Chefe; puxa criaturas para perto do time.',
  gravidade: 'puxa criaturas; o Chefe quase não se move.',
  cura: 'cura igual; guarde para depois da Pisada ou da Chuva de Rochas.',
  escudo: 'segura a Barragem e o ácido de frente.',
  muralha: 'serve de cobertura contra a Barragem e os Cuspidores.',
  torreta: 'boa para segurar Rastejadores.',
  fumaca: 'esconde o time; o Chefe mira pior dentro dela.',
  armadilha: 'prende o Chefe só 30% do tempo; ótima contra Rastejadores.',
  barreira: 'bloqueia a Barragem e os cuspes ácidos.',
  marcador: 'Chefe marcado leva +20% de dano de todo o time.',
  rolamento: 'use para atravessar Impacto, Avanço e fendas (fica invulnerável por um instante).',
  estimulo: 'use quando o Chefe estiver EXAUSTO para causar o máximo.',
  meteoro: 'acerte quando o Chefe estiver EXAUSTO (dano extra).',
  feixe: 'atravessa e acerta o Chefe e as criaturas na mesma linha.',
  estase: 'o Chefe fica só metade mais lento.',
  sobrecarga: 'guarde para quando o Chefe estiver EXAUSTO.',
  bomba: 'explosões passam pela casca da Carapaça e quebram caixas.',
  mina: 'ótima no caminho dos Rastejadores.',
  gelo: 'no Chefe a lentidão cai pela metade.',
  kit: 'cura igual; os pontos de recurso também trazem cura.',
};
function vsBoss(g: AnyGame, id: string) {
  return g.mode === 'chefe' && BOSS_NOTE[id] ? ` Contra o Chefe: ${BOSS_NOTE[id]}` : '';
}
/** os espaços de habilidade do jogador local (usados na barra e no aviso de "não dá para usar") */
function buildSlots(g: AnyGame): SlotView[] {
  const me = g.human;
  const K = (a: Action) => keyLabel(settings.keys[a]);
  const slots: SlotView[] = [];
  // arma (tiro): primeiro espaço — clique do mouse. Cinza quando não dá para atirar (tonto, caído, fora da rodada)
  if (g.combat) {
    const w = WEAPONS[me.weapon];
    const slow = w.cooldown >= 0.5;
    const cantShoot = !me.alive || me.stunT > 0 || g.phase !== 'play';
    slots.push({
      id: 'fire',
      key: input.touchMode ? 'ATIRAR' : 'Clique',
      name: w.name,
      art: { kind: 'primary', id: me.weapon, color: w.color },
      color: w.color,
      cd: slow ? me.fireCd / (w.cooldown || 1) : 0,
      secs: slow ? me.fireCd : 0,
      off: cantShoot,
      note: me.ammo > 0 ? `×${me.ammo}` : cantShoot && me.stunT > 0 ? 'TONTO' : undefined,
      desc: `${w.name}: segure o clique para atirar onde o mouse aponta.${me.ammo > 0 ? ` Arma pega na arena: ${me.ammo} tiros.` : ''}`,
    });
  }
  if (me.boss) {
    const S = BOSS.skills;
    const ph = g.bossPhase ?? 1;
    const b = (id: Slot, k: keyof typeof S) => {
      const def = S[k];
      const locked = ph < def.phase;
      slots.push({ id, key: K(id), name: def.name, art: { kind: 'boss', id: k, color: '#ff6a5a' }, color: '#ff4a5a', cd: me.bossCd[k] / def.cooldown, secs: me.bossCd[k], off: locked, note: locked ? `FASE ${def.phase}` : undefined, desc: def.desc + (locked ? ` Libera na fase ${def.phase}.` : '') });
    };
    b('ability', 'impacto');
    b('skill', 'barragem');
    b('ult', 'chuva');
    b('bonus', 'obsidiana');
    b('dash', 'avanco');
    return slots;
  }
  const ab = me.char.ability;
  slots.push({ id: 'ability', key: K('ability'), name: ab.label, art: { kind: 'symbol', id: me.char.id, color: me.color }, color: me.color, cd: me.abilCd / ab.cooldown, secs: me.abilCd, desc: `${ab.name}: ${ab.desc}${vsBoss(g, ab.id)}` });
  if (g.combat) {
    const sk = SKILLS[me.loadout.skill];
    slots.push({ id: 'skill', key: K('skill'), name: sk.name, art: { kind: 'skill', id: sk.id, color: '#3ee8ff' }, color: '#3ee8ff', cd: me.skillCd / sk.cooldown, secs: me.skillCd, desc: sk.desc + vsBoss(g, sk.id) });
    const u = ULTS[me.loadout.ult];
    slots.push({ id: 'ult', key: K('ult'), name: u.name, art: { kind: 'ult', id: u.id, color: '#ffd23e' }, color: '#ffd23e', cd: 0, secs: 0, charge: me.ultCharge, desc: `${u.desc} Carrega com o tempo e lutando.${vsBoss(g, u.id)}` });
  }
  slots.push({ id: 'dash', key: K('dash'), name: 'Impulso', art: { kind: 'dash', id: 'dash', color: '#9ad8ff' }, color: '#9ad8ff', cd: me.dashCd / C.DASH_CD, secs: me.dashCd, off: me.stasisT > 0, note: me.stasisT > 0 ? 'BLOQUEADO' : undefined, desc: 'Arrancada curta na direção em que você anda (recarga 2,2 s).' });
  if (g.combat) {
    const kit = me.item ? KITS[me.item as keyof typeof KITS] : null;
    slots.push({ id: 'item', key: K('item'), name: kit?.name ?? (me.item ? ITEMS[me.item].name : 'Item'), art: { kind: 'kit', id: me.item ?? 'bomba', color: '#c8ff3c' }, color: '#c8ff3c', cd: 0, secs: 0, off: !me.item, note: me.item ? `×${me.itemN}` : 'vazio', desc: kit ? kit.desc + vsBoss(g, kit.id) : me.item ? 'Item pego na arena.' : 'Sem item. Pegue bombas e minas pela arena.' });
  }
  const bAb = me.bonusAb ? CHARACTERS.find((c) => c.ability.id === me.bonusAb) : null;
  if (!training()) slots.push({ id: 'bonus', key: K('bonus'), name: bAb ? bAb.ability.label : 'Poder', art: { kind: 'symbol', id: bAb?.id ?? 'zed', color: bAb?.color ?? '#6a6a8a' }, color: bAb?.color ?? '#6a6a8a', cd: 0, secs: 0, off: !bAb, note: bAb ? '1 uso' : '', desc: bAb ? `${bAb.ability.name} (uso único): ${bAb.ability.desc}` : 'Passe por cima de um cristal brilhante para ganhar o poder de outro personagem.' });
  return slots;
}

/** desenhos e números de recarga nos botões de toque */
let touchIconSig = '';
const touchWasReady = new Map<string, boolean>();
function touchIcons(slots: SlotView[]) {
  const sig = slots.map((s) => `${s.id}:${s.art.kind}:${s.art.id}`).join('|');
  const byId = new Map(slots.map((s) => [s.id, s]));
  if (sig !== touchIconSig) {
    touchIconSig = sig;
    requestAnimationFrame(() => {
      for (const [id, sel] of [
        ['ability', '#btn-ability'],
        ['skill', '#btn-skill'],
        ['ult', '#btn-ult'],
        ['item', '#btn-item'],
      ] as const) {
        const s = byId.get(id);
        const cv = document.querySelector<HTMLCanvasElement>(`${sel} .ticon`);
        if (s && cv) drawSlotArt(cv, s.art);
      }
    });
  }
  // cinza quando não dá para usar, colorido e com brilho quando dá (+ pulso no instante em que fica pronto)
  for (const [id, sel] of [
    ['fire', '#btn-fire'],
    ['ability', '#btn-ability'],
    ['skill', '#btn-skill'],
    ['ult', '#btn-ult'],
    ['item', '#btn-item'],
    ['dash', '#btn-dash'],
    ['bonus', '#btn-bonus'],
  ] as const) {
    const s = byId.get(id);
    const b = document.querySelector<HTMLElement>(sel);
    if (!s || !b) continue;
    const ready = slotReady(s);
    if (ready && touchWasReady.get(id) === false) {
      b.classList.remove('just-ready');
      void b.offsetWidth;
      b.classList.add('just-ready');
    }
    touchWasReady.set(id, ready);
    b.classList.toggle('cool', !ready);
    b.classList.toggle('is-ready', ready);
  }
  for (const [id, sel] of [
    ['ability', '#btn-ability'],
    ['skill', '#btn-skill'],
    ['ult', '#btn-ult'],
  ] as const) {
    const s = byId.get(id);
    const el = document.querySelector<HTMLElement>(`${sel} .tcd`);
    if (!s || !el) continue;
    const t = s.charge !== undefined ? (s.charge >= 100 ? '' : `${Math.floor(s.charge)}%`) : s.off ? s.note ?? '' : s.secs > 0 ? String(Math.ceil(s.secs)) : '';
    if (el.textContent !== t) el.textContent = t;
  }
}

/** por que a ação não pode ser usada agora (mostrado em cima do botão) */
function deniedReason(slot: Slot): string {
  if (!game) return '';
  const me = game.human;
  if (game.phase !== 'play') return 'Espere começar';
  if (!me.alive) return 'Você caiu — espere voltar';
  if (me.stunT > 0) return 'Atordoado';
  if (me.boss) {
    const map: Partial<Record<Slot, keyof typeof BOSS.skills>> = { ability: 'impacto', skill: 'barragem', ult: 'chuva', bonus: 'obsidiana', dash: 'avanco' };
    const k = map[slot];
    if (!k) return 'Indisponível';
    if ((game.bossPhase ?? 1) < BOSS.skills[k].phase) return `Fase ${BOSS.skills[k].phase}`;
    return `Recarga ${Math.ceil(me.bossCd[k])}s`;
  }
  if (slot === 'ability') return `Recarga ${Math.ceil(me.abilCd)}s`;
  if (slot === 'skill') return `Recarga ${Math.ceil(me.skillCd)}s`;
  if (slot === 'ult') return `Carga ${Math.floor(me.ultCharge)}%`;
  if (slot === 'dash') return me.stasisT > 0 ? 'Preso na estase' : `Recarga ${Math.ceil(me.dashCd)}s`;
  if (slot === 'bonus') return 'Pegue um cristal';
  if (slot === 'item') return 'Sem item';
  return '';
}

const skillBar = new SkillBar($('#skillbar'));
let ultWasReady = false;
/** barra de habilidades (computador) e botões de toque com recarga */
function updateSkills(g: AnyGame) {
  const me = g.human;
  const K = (a: Action) => keyLabel(settings.keys[a]);
  const slots: SlotView[] = buildSlots(g);
  $('#skillbar').hidden = input.touchMode || g.phase === 'rewind';
  if (!input.touchMode) skillBar.render(slots);
  else touchIcons(slots);
  // botões de toque
  if (g.combat) {
    if (me.boss) {
      drawCooldown('#btn-skill', me.bossCd.barragem / BOSS.skills.barragem.cooldown, '#ff4a5a');
      drawCooldown('#btn-ult', (g.bossPhase ?? 1) < 2 ? 1 : me.bossCd.chuva / BOSS.skills.chuva.cooldown, '#ff4a5a');
      $('#btn-bonus').classList.toggle('empty', (g.bossPhase ?? 1) < 2 || me.bossCd.obsidiana > 0);
      setText('#btn-bonus .tlabel', 'MURALHA');
    } else {
      drawCooldown('#btn-skill', me.skillCd / SKILLS[me.loadout.skill].cooldown, '#3ee8ff');
      drawCooldown('#btn-ult', 1 - me.ultCharge / 100, '#ffd23e');
    }
    $('#btn-ult').classList.toggle('ready', me.boss ? me.bossCd.chuva <= 0 && (g.bossPhase ?? 1) >= 2 : me.ultCharge >= 100);
  }
  // aviso único quando a ultimate fica pronta
  const ready = g.combat && !me.boss && me.ultCharge >= 100;
  if (ready && !ultWasReady && g.phase === 'play') {
    audio.power('dobro');
    $('#hud').classList.add('ult-flash');
    setTimeout(() => $('#hud').classList.remove('ult-flash'), 900);
  }
  ultWasReady = ready;
  // barra do Chefe (topo)
  const boss = g.mode === 'chefe' ? g.players.find((p) => p.boss) : null;
  $('#boss-hud').hidden = !boss || g.phase === 'rewind';
  if (boss) {
    const f = Math.max(0, boss.hp / (boss.maxHp || 1));
    ($('#bh-fill') as HTMLElement).style.width = `${Math.round(f * 1000) / 10}%`;
    setText('#bh-name', boss.id === me.id ? 'VOCÊ É O CHEFE' : `CHEFE · ${boss.char.name.toUpperCase()}`);
    const ph = g.bossPhase ?? 1;
    setText('#bh-phase', ph === 1 ? 'FASE 1 · aprendendo' : ph === 2 ? 'FASE 2 · geradores' : 'FASE 3 · fúria');
    const pyl = g.enemies.filter((e: any) => e.kind === 'pylon').length;
    $('#boss-hud').classList.toggle('shielded', pyl > 0);
    const crit = g.enemies.filter((e: any) => e.kind !== 'pylon' && e.kind !== 'boss').length;
    const tired = (boss as any).exhaustT > 0;
    $('#boss-hud').classList.toggle('tired', tired);
    // fica transparente quando o seu personagem (ou o Chefe) passa por baixo da barra
    $('#boss-hud').classList.toggle('under', Math.min(me.y, boss.y - 60) < 200);
    setHTML(
      '#bh-info',
      `<span>${Math.ceil(boss.hp)} / ${boss.maxHp}</span>${tired ? '<span class="ex">EXAUSTO · dano extra</span>' : pyl ? `<span class="sh">⛉ Protegido por ${pyl} gerador${pyl > 1 ? 'es' : ''}</span>` : boss.id !== me.id ? '<span>Mire nas costas ✦</span>' : ''}${crit ? `<span>Criaturas: ${crit}</span>` : ''}<span>♥ Vidas do time: ${g.teamLives}</span>`,
    );
  }
}

function updateHud() {
  if (!game) return;
  const g = game;
  rewindPanel(g);
  const roundLabel = g.tiebreak ? 'DESEMPATE' : training() && !isOnline() ? `TREINO ${g.round}/${g.totalRounds}` : g.mode === 'ondas' ? `ONDA ${g.round}/${g.totalRounds}` : `RODADA ${g.round}/${g.totalRounds}`;
  setText('#hud-round', roundLabel);
  const t = g.phase === 'prep' ? g.roundDur : g.timeLeft();
  setText('#hud-timer', g.phase === 'rewind' ? '◀◀' : String(Math.ceil(t)));
  $('#hud-timer').classList.toggle('low', g.phase === 'play' && g.timeLeft() <= 5);
  const obj = objectiveHud(g);
  setText('#hud-objective', obj);
  $('#hud-objective').hidden = !obj;
  scoreboard.update(g);
  const me = g.human;
  const ab = me.char.ability;
  const bonusOwner = me.bonusAb ? CHARACTERS.find((c) => c.ability.id === me.bonusAb) : null;
  const bonusTag = bonusOwner ? `<span class="bonus" style="color:${bonusOwner.color}">${bonusOwner.ability.name}${input.touchMode ? '' : ' (R)'}</span>` : '';
  const abTxt = me.boss ? "" : me.abilCd > 0 ? `<span class="ab-wait">${ab.label} ${Math.ceil(me.abilCd)}s</span>` : `<span class="ab-ready">${ab.label} pronto</span>`;
  const pw = me.power ? getPower(me.power.id) : null;
  const pwTxt = pw && !g.combat ? `<span class="pw" style="color:${pw.color}">${pw.short}${pw.id === 'dobro' ? '' : ' ' + Math.ceil(me.power!.t) + 's'}</span>` : '';
  if (!me.alive && me.respawnT > 0) {
    setHTML('#hud-status', `<span class="ab-wait">Renascendo em ${Math.ceil(me.respawnT)}s…</span>`);
  } else if (!me.alive) {
    setHTML('#hud-status', `<span class="ab-wait">${g.mode === 'ondas' ? 'Você caiu — seus aliados seguram a onda' : 'Eliminado nesta rodada — observe os Ecos'}</span>`);
  } else if (g.combat) {
    const f = Math.max(0, me.hp / (me.maxHp || MAX_HP));
    const cls = f > 0.5 ? '' : f > 0.25 ? 'mid' : 'low';
    const w = WEAPONS[me.weapon];
    const wTxt = isPrimary(me.weapon) ? w.name : `${w.name} ${w.ammo ? me.ammo + 'x' : Math.ceil(me.weaponT) + 's'}`;
    // no computador a barra de habilidades já mostra item e recargas
    const itTxt = me.item && input.touchMode ? `<span class="itm">${ITEMS[me.item].name} x${me.itemN}</span>` : '';
    setHTML(
      '#hud-status',
      `<span class="hpbar"><i class="${cls}" style="width:${Math.round(f * 100)}%"></i>${me.shieldHp > 0 ? `<s style="width:${Math.round((me.shieldHp / 50) * 100)}%"></s>` : ''}</span><b>${Math.ceil(me.hp)}${me.shieldHp > 0 ? `<small class="shv">+${Math.ceil(me.shieldHp)}⛉</small>` : ''}</b><span class="wpn">${wTxt}</span>`,
    );
    // item, habilidades e poder já aparecem nos botões/barra de habilidades (HUD limpo)
    void itTxt;
    $('#btn-item .tlabel').textContent = me.item ? `${({ bomba: 'BOMBA', mina: 'MINA', gelo: 'GELO', kit: 'KIT' } as Record<string, string>)[me.item] ?? 'ITEM'} ${me.itemN}` : 'ITEM';
    $('#btn-item').classList.toggle('empty', !me.item);
  } else {
    const pips = Array.from({ length: C.MAX_CARRY }, (_, i) => `<span class="pip${i < me.carry ? ' on' : ''}"></span>`).join('');
    const hearts = '♥'.repeat(Math.max(0, me.hearts)) + '♡'.repeat(Math.max(0, C.HEARTS - me.hearts));
    const goal = me.carry >= C.MAX_CARRY ? '<span class="goal hot">Cheio! Leve ao núcleo</span>' : me.carry > 0 ? '<span class="goal hot">Leve ao núcleo →</span>' : '<span class="goal">Pegue energia</span>';
    setHTML('#hud-status', `<span class="hearts">${hearts}</span><span class="pips">${pips}</span>${goal}${pwTxt}${abTxt}${bonusTag}`);
  }
  // habilidade extra pega no mapa
  const bAb = me.bonusAb ? CHARACTERS.find((c) => c.ability.id === me.bonusAb) : null;
  const bb = $('#btn-bonus');
  bb.classList.toggle('empty', !bAb);
  bb.style.setProperty('--bc', bAb ? bAb.color : '#6a6a8a');
  setText('#btn-bonus .tlabel', bAb ? bAb.ability.label.toUpperCase() : 'PODER');
  drawCooldown('#btn-dash', me.boss ? me.bossCd.avanco / BOSS.skills.avanco.cooldown : me.dashCd / C.DASH_CD, '#3ee8ff');
  drawCooldown('#btn-ability', me.boss ? me.bossCd.impacto / BOSS.skills.impacto.cooldown : me.abilCd / ab.cooldown, me.color);
  updateSkills(g);
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

let tipUntil = 0;
const minionSeen = new Set<string>();
let minionSeenGame: unknown = null;
/** dica curta que some sozinha (fora do treino) */
function showTip(text: string, secs = 5) {
  tipUntil = performance.now() + secs * 1000;
  hint(text);
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

let lastShootSound = 0;
function onEvents(events: GameEvent[]) {
  if (!game) return;
  const g = game;
  const myId = g.human.id;
  for (const e of events) {
    const mine = 'pid' in e && e.pid === myId;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'prep') {
          const sub = g.tiebreak ? 'Rodada curta: só quem empatou joga.' : objectiveText(g);
          banner(g.tiebreak ? 'DESEMPATE' : `RODADA ${g.round}`, sub, 2.4);
          audio.intensity = 0;
        } else if (e.phase === 'play') {
          banner(g.combat ? 'LUTE!' : 'JÁ!', '', 0.8);
          audio.go();
        } else if (e.phase === 'rewind' && g.mode !== 'chefe') {
          // sem banner grande: o título fica na linha do tempo, embaixo, e o resumo num painel curto
          skipAsked = false;
          renderer.skipLabel = input.touchMode ? 'TOQUE · PULAR' : 'ESPAÇO · PULAR';
          audio.recordSave();
          audio.rewind();
          if (g.expiredRound !== null) setTimeout(() => audio.echoExpired(), 900);
        } else if (e.phase === 'results' && !isOnline()) {
          showResults();
        }
        break;
      case 'tick':
        audio.tick(e.n);
        // contagem da preparação: a explicação fica só aqui, antes do combate
        if (g.phase === 'prep') banner(String(e.n), g.tiebreak ? '' : objectiveText(g), 0.9);
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
          const me = g.human;
          banner('ELIMINADO', me.respawnT > 0 ? `Você volta em ${Math.ceil(me.respawnT)} s.` : g.rules.respawn ? 'Sem vidas extras: torça pelo time.' : 'Você volta na próxima rodada.', 1.8);
        }
        break;
      case 'kill':
        if (e.by === myId || e.pid === myId) audio.kill(e.by === myId);
        if (e.by === myId) banner('ELIMINOU!', `${g.players.find((p) => p.id === e.pid)?.char.name ?? ''} caiu`, 1.1);
        break;
      case 'bonusPick':
        if (mine) {
          audio.power('dobro', panOf(e.x));
          const owner = CHARACTERS.find((c) => c.ability.id === e.ab);
          if (owner) banner(`PODER: ${owner.ability.name.toUpperCase()}`, input.touchMode ? 'Toque no botão do poder para usar' : 'Aperte R ou clique com o botão direito', 1.4);
        } else audio.powerSpawn(panOf(e.x));
        break;
      case 'bonusSpawn':
        audio.powerSpawn(panOf(e.x));
        break;
      case 'reflect':
        audio.ability('escudo', panOf(e.x));
        break;
      case 'capture': {
        const myTeam = g.human.team;
        audio.objective();
        banner(e.team === myTeam ? 'CAPTURA DO SEU TIME!' : 'O RIVAL CAPTUROU!', `Azul ${g.teamScore[0]} × ${g.teamScore[1]} Vermelho`, 1.6);
        break;
      }
      case 'flagTake':
        if (e.team === g.human.team) {
          audio.goldenWarn();
          banner('PEGARAM SUA BANDEIRA!', 'Derrube quem está com ela', 1.3);
        } else if (mine) audio.pickup(panOf(g.human.x), true);
        break;
      case 'flagReturn':
        audio.coreMove();
        break;
      case 'hillMove':
        audio.coreMove();
        banner('A COLINA MUDOU', '', 1);
        break;
      case 'wave':
        audio.objective();
        banner(e.boss ? 'ONDA FINAL: CHEFÃO!' : `ONDA ${e.n}`, e.boss ? 'Derrubem o núcleo gigante' : 'Os robôs estão chegando', 1.8);
        break;
      case 'enemyKill':
        audio.hit(panOf(e.x), false);
        if (e.kind === 'boss') banner('CHEFÃO DESTRUÍDO!', '', 1.8);
        break;
      case 'enemySpawn':
        if (e.kind === 'boss') audio.coreWarn();
        break;
      case 'gameOver':
        if (g.mode === 'chefe') {
          const meBoss = g.human.boss;
          const iWon = meBoss ? !e.won : e.won;
          banner(iWon ? 'VITÓRIA!' : 'DERROTA', e.won ? 'Os caçadores derrubaram o Chefe' : g.timeLeft() <= 0.5 ? 'O tempo acabou: o Chefe resistiu' : 'O Chefe eliminou o time', 2.4);
        } else banner(e.won ? 'VOCÊS VENCERAM!' : 'FIM DE JOGO', e.won ? 'Todas as ondas superadas' : 'Os robôs venceram desta vez', 2.2);
        break;
      case 'bossPhase':
        audio.coreWarn();
        banner(
          e.n === 2 ? 'FASE 2: GERADORES' : 'FASE 3: FÚRIA',
          g.human.boss
            ? e.n === 2
              ? 'Rochas e Muralha liberadas (R e F) · um Xamã vem te curar'
              : 'Recargas mais rápidas, fendas no chão e novas criaturas'
            : e.n === 2
              ? 'Destruam os geradores e o Xamã (ele cura o Chefe)'
              : 'Fendas cortam a arena e chegam Carapaça e Semeador',
          2.2,
        );
        break;
      case 'pylon':
        if (e.down) audio.objective();
        break;
      case 'exhaust':
        audio.objective();
        banner(g.human.boss ? 'VOCÊ ESTÁ EXAUSTO' : 'CHEFE EXAUSTO!', g.human.boss ? 'Sem golpes por alguns segundos: proteja-se' : 'Ataquem agora: dano extra por 3 s', 1.6);
        break;
      case 'minion': {
        // apresenta cada tipo de criatura só na primeira vez em que aparece
        if (minionSeenGame !== g) {
          minionSeenGame = g;
          minionSeen.clear();
        }
        if (minionSeen.has(e.kind)) break;
        minionSeen.add(e.kind);
        const info = MINION_INFO[e.kind as MinionKind];
        if (info && !g.human.boss) showTip(`${info.name.toUpperCase()} (${info.role}): ${info.weak}`);
        break;
      }
      case 'lives':
        if (!g.human.boss) banner(e.n > 0 ? `VIDAS DO TIME: ${e.n}` : 'SEM VIDAS EXTRAS', e.n > 0 ? 'Quem caiu volta em 5 s' : 'Agora quem cair não volta', 1.4);
        break;
      case 'cast': {
        // golpe perigoso sendo preparado perto de você: alerta sonoro
        const owner = g.players.find((p) => p.id === e.pid);
        if (owner && g.hostile(owner, g.human) && Math.hypot(e.x - g.human.x, e.y - g.human.y) < 320) audio.hazardWarn(panOf(e.x));
        break;
      }
      case 'castHit':
        if (e.kind !== 'estase') audio.explode(panOf(e.x));
        break;
      case 'trap':
        audio.hit(panOf(e.x), false);
        break;
      case 'ult':
        audio.ability('explosao', panOf(e.x));
        break;
      case 'skill':
        audio.dash(panOf(e.x));
        break;
      case 'windWarn':
        audio.hazardWarn(e.dir > 0 ? 0.6 : -0.6);
        break;
      case 'trainWarn':
        audio.bridgeWarn(0);
        break;
      case 'zap':
        audio.ability('raio', 0);
        break;
      case 'respawn':
        if (mine) audio.echoSpawn();
        break;
      case 'roundWin':
        if (e.pid) {
          const w = g.players.find((p) => p.id === e.pid);
          if (w) banner(w.id === myId ? 'RODADA SUA!' : `RODADA DE ${w.char.name.toUpperCase()}`, g.mode === 'duelo' ? `${w.roundWins} de 3` : '+3 pontos', 1.0);
        }
        break;
      case 'shoot': {
        const now = performance.now();
        if (mine || now - lastShootSound > 60) {
          audio.shoot(e.weapon, panOf(e.x), mine);
          lastShootSound = now;
        }
        break;
      }
      case 'explode':
        audio.explode(panOf(e.x));
        break;
      case 'heal':
        audio.heal(panOf(e.x));
        break;
      case 'dash':
        audio.dash(panOf(e.x));
        break;
      case 'ability':
        if (e.ability !== 'item') audio.ability(e.ability, panOf(e.x));
        else audio.dash(panOf(e.x));
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
      case 'powerSpawn':
        audio.powerSpawn(panOf(e.x));
        break;
      case 'power':
        audio.power(e.power, panOf(e.x));
        if (mine) {
          const d = getPower(e.power);
          banner(d.name.toUpperCase(), d.desc, 1.4);
        }
        break;
      case 'echoErased':
        if (mine) banner('ECO APAGADO', 'Esse fantasma não volta mais.', 1.3);
        break;
    }
  }
}

function tutorial(dt: number) {
  if (!game || !training() || isOnline()) {
    if (performance.now() > tipUntil) hint(null);
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

function resultRow(i: number, name: string, charId: string, skin: string, sub: string, pts: string, me: boolean) {
  const c = withSkin(getCharacter(charId), skin);
  const li = document.createElement('li');
  if (me) li.className = 'me';
  li.style.setProperty('--c', c.color);
  li.innerHTML = `<span class="pos">${i + 1}</span><img src="${avatarURL(c, 88)}" alt="" /><span><b class="nm" style="--c:${c.color}">${escapeHtml(name)}</b><br /><span class="sub">${sub}</span></span><span class="pts">${pts}</span>`;
  return li;
}

async function showResults() {
  if (!game || isOnline()) return;
  const g = game as Game;
  const rank = g.ranking();
  const me = g.human;
  const meWon = g.winners.includes(me.id);
  const shared = g.winners.length > 1;
  $('#res-eyebrow').textContent = training() ? 'Treino concluído' : g.tiebreak ? 'Fim do desempate' : `${MODE_LABEL[matchMode]} · fim da partida`;
  $('#res-title').textContent = training()
    ? `${me.score} pontos`
    : g.mode === 'chefe'
      ? meWon
        ? me.boss
          ? 'Você resistiu como Chefe!'
          : 'O Chefe caiu!'
        : me.boss
          ? 'Os caçadores venceram'
          : 'O Chefe venceu'
    : g.mode === 'ondas'
      ? g.gameWon
        ? 'Vocês sobreviveram!'
        : `Caíram na onda ${g.wave}`
      : g.mode === 'bandeira'
        ? meWon
          ? 'Seu time venceu!'
          : g.teamScore[0] === g.teamScore[1]
            ? 'Empate!'
            : 'O time rival venceu'
        : meWon
          ? shared
            ? 'Vitória dividida!'
            : 'Vitória!'
          : 'Não foi dessa vez';
  const list = $('#res-list');
  list.innerHTML = '';
  rank.forEach((p, i) => {
    const top = Object.entries(p.stats.uses).sort((a, b) => b[1] - a[1])[0];
    const sub =
      g.mode === 'chefe'
        ? chefeLine({ boss: p.boss, dmg: p.stats.dmg, heal: p.stats.heal, obj: p.stats.obj, weak: p.stats.weak, kills: p.kills, top: top ? `${top[0]} ×${top[1]}` : '' })
        : g.mode === 'ondas'
        ? `${p.kills} robôs destruídos`
        : g.mode === 'bandeira'
          ? `Time ${p.team ? 'Vermelho' : 'Azul'} · ${p.kills} eliminações`
          : g.mode === 'rei'
            ? `${p.score} pontos na colina · ${p.kills} eliminações`
            : g.combat
              ? `${p.kills} eliminações · ${p.roundWins} rodadas`
              : `${p.stats.delivered} energia entregue · sobreviveu ${p.stats.survived}×`;
    const pts = g.mode === 'duelo' ? `${p.roundWins}` : String(p.score);
    list.appendChild(resultRow(i, p.id === me.id ? `Você (${p.char.name})` : p.name, p.char.id, p.skin, sub, pts, p.id === me.id));
  });
  $('#res-highlight').textContent = g.highlight;
  $('#res-coins').hidden = true;
  if (training()) {
    settings.tutorialDone = true;
    saveSettings(settings);
  }
  if (meWon || training()) audio.victory();
  else audio.defeat();
  audio.stopMusic();
  const placement = meWon ? 1 : rank.indexOf(me) + 1;
  const coins = await account.reward({ mode: matchMode, placement: Math.max(1, placement), players: Math.max(2, g.players.length), score: me.score, kills: me.kills, online: false });
  showCoins(coins);
  setTimeout(() => {
    if (game === g) show('screen-results');
  }, 900);
}

/** linha de estatísticas da Caça ao Chefe (não só dano: objetivos, curas, habilidade mais usada) */
function chefeLine(r: { boss?: boolean; dmg?: number; heal?: number; obj?: number; weak?: number; kills?: number; top?: string }) {
  const parts = r.boss ? [`Chefe`, `${r.kills ?? 0} eliminações`, `${Math.round(r.dmg ?? 0)} de dano`] : [`${Math.round(r.dmg ?? 0)} de dano`];
  if (!r.boss) {
    if (r.weak) parts.push(`${r.weak} nas costas`);
    if (r.obj) parts.push(`${r.obj} gerador${r.obj > 1 ? 'es' : ''}`);
    if ((r.heal ?? 0) >= 10) parts.push(`${Math.round(r.heal ?? 0)} de cura`);
  }
  if (r.top) parts.push(`mais usada: ${r.top}`);
  return parts.join(' · ');
}

function showCoins(coins: number) {
  const el = $('#res-coins');
  el.hidden = false;
  el.innerHTML = coins > 0 ? `<span class="coin"></span>+${coins} moedas` : account.logged ? 'Moedas: espere um pouco entre partidas contra bots' : '';
  if (!coins && !account.logged) el.hidden = true;
}

function showOnlineResults(info: EndInfo) {
  if (!(game instanceof ClientGame)) return;
  const g = game;
  const myId = g.human.id;
  const meWon = info.winners.includes(myId);
  $('#res-eyebrow').textContent = `Online · ${MODE_LABEL[g.mode]}`;
  const meBoss = g.human.boss;
  $('#res-title').textContent =
    g.mode === 'chefe' ? (meWon ? (meBoss ? 'Você resistiu como Chefe!' : 'O Chefe caiu!') : meBoss ? 'Os caçadores venceram' : 'O Chefe venceu') : meWon ? (info.winners.length > 1 ? 'Vitória dividida!' : 'Vitória!') : 'Não foi dessa vez';
  const list = $('#res-list');
  list.innerHTML = '';
  info.ranking.forEach((r, i) => {
    const sub = g.mode === 'chefe' ? chefeLine(r) : g.combat ? `${r.kills} eliminações · ${r.roundWins} rodadas` : `${r.score} pontos`;
    list.appendChild(resultRow(i, r.id === myId ? `Você (${r.name})` : r.name, r.char, r.skin, sub, g.mode === 'duelo' ? String(r.roundWins) : String(r.score), r.id === myId));
  });
  $('#res-highlight').textContent = info.highlight;
  const coins = info.rewards[myId] ?? 0;
  showCoins(coins);
  if (!account.logged) {
    $('#res-coins').hidden = false;
    $('#res-coins').textContent = 'Entre na conta para ganhar moedas online';
  }
  account.addOnline(coins);
  if (meWon) audio.victory();
  else audio.defeat();
  audio.stopMusic();
  $('#screen-results .btn[data-action=restart]').textContent = 'Voltar para a sala';
  setTimeout(() => {
    if (game === g) show('screen-results');
  }, 900);
}

// ------------------------------------------------------------------ laço principal
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function readInput(): Input {
  const i = input.read();
  const mouseOk = !input.touchMode && performance.now() - input.mouse.at < 4000;
  if (game && game.combat && mouseOk) {
    const w = renderer.toWorld(input.mouse.x, input.mouse.y);
    const me = game.human;
    i.aim = Math.atan2(w.y - (me.y - GUN_Y), w.x - me.x);
  }
  // celular: o analógico direito mira (independente do movimento); solto, a última direção continua
  const stickAim = input.manualAim();
  if (game && game.combat && stickAim !== null) i.aim = stickAim;
  // mira das habilidades: mouse (computador) ou arrasto do botão (toque)
  const pressed = (['ability', 'skill', 'ult', 'bonus', 'dash', 'item'] as Slot[]).find((k) => (i as any)[k]);
  if (game && pressed) {
    const me = game.human;
    if (i.touchCast) {
      i.ca = i.touchCast.ang;
      i.cr = i.touchCast.ratio * slotRange(pressed);
    } else if (mouseOk && game.combat) {
      const w = renderer.toWorld(input.mouse.x, input.mouse.y);
      i.ca = Math.atan2(w.y - me.y, w.x - me.x);
      i.cr = Math.hypot(w.x - me.x, w.y - me.y);
    }
  }
  delete i.touchCast;
  return i;
}

// ------------------------------------------------------------------ habilidades: tipo de mira, alcance e prévia
function slotInfo(slot: Slot): { kind: 'instant' | 'direction' | 'point'; range: number; r: number; w: number; shape: AimPreview['shape']; name: string; color: string } {
  const none = { kind: 'instant' as const, range: 0, r: 0, w: 0, shape: 'self' as const, name: '', color: '#ffffff' };
  if (!game) return none;
  const me = game.human;
  if (me.boss) {
    const S = BOSS.skills;
    if (slot === 'skill') return { kind: 'direction', range: 260, r: 0, w: 30, shape: 'arrow', name: S.barragem.name, color: '#ff6a3a' };
    if (slot === 'bonus') return { kind: 'point', range: S.obsidiana.range ?? 420, r: 0, w: 110, shape: 'wall', name: S.obsidiana.name, color: '#ff7a3a' };
    if (slot === 'dash') return { kind: 'direction', range: S.avanco.range ?? 330, r: 0, w: 64, shape: 'line', name: S.avanco.name, color: '#ff3b3b' };
    if (slot === 'ability') return { ...none, r: S.impacto.radius ?? 175, name: S.impacto.name, color: '#ff3b3b' };
    return none;
  }
  if (slot === 'ability' || slot === 'bonus') {
    const id = slot === 'bonus' ? me.bonusAb : me.char.ability.id;
    if (!id || !game.combat) return none;
    const b = ABILITY_BAL[id];
    const owner = CHARACTERS.find((c) => c.ability.id === id)!;
    const shape: AimPreview['shape'] = id === 'muralha' ? 'wall' : id === 'gravidade' ? 'circle' : id === 'investida' ? 'line' : 'arrow';
    return { kind: b.aim, range: b.range ?? 0, r: b.radius ?? 0, w: id === 'muralha' ? 140 : id === 'investida' ? 40 : 0, shape: b.aim === 'instant' ? 'self' : shape, name: owner.ability.name, color: owner.color };
  }
  if (slot === 'skill' && game.combat) {
    const sk = SKILLS[me.loadout.skill];
    return { kind: sk.aim, range: sk.range, r: sk.radius ?? 0, w: sk.id === 'barreira' ? 92 : sk.id === 'marcador' ? 10 : 0, shape: sk.aim === 'point' ? 'circle' : sk.id === 'barreira' ? 'wall' : sk.id === 'marcador' ? 'line' : sk.aim === 'instant' ? 'self' : 'arrow', name: sk.name, color: '#3ee8ff' };
  }
  if (slot === 'ult' && game.combat) {
    const u = ULTS[me.loadout.ult];
    return { kind: u.aim, range: u.range, r: u.radius ?? 0, w: u.width ?? 0, shape: u.aim === 'point' ? 'circle' : u.aim === 'direction' ? 'line' : 'self', name: u.name, color: '#ffd23e' };
  }
  return none;
}
function slotRange(slot: Slot) {
  const s = slotInfo(slot);
  return s.range || 200;
}
input.aimKind = (slot) => slotInfo(slot).kind;
input.canUse = (slot) => {
  if (!game || game.phase !== 'play' || !game.human.alive) return true;
  const me = game.human;
  if (me.boss) {
    const map: Partial<Record<Slot, keyof typeof BOSS.skills>> = { ability: 'impacto', skill: 'barragem', ult: 'chuva', bonus: 'obsidiana', dash: 'avanco' };
    const k = map[slot];
    return !k || (me.bossCd[k] <= 0 && (game.bossPhase ?? 1) >= BOSS.skills[k].phase);
  }
  if (slot === 'ability') return me.abilCd <= 0;
  if (slot === 'skill') return me.skillCd <= 0;
  if (slot === 'ult') return me.ultCharge >= 100;
  if (slot === 'bonus') return !!me.bonusAb;
  if (slot === 'dash') return me.dashCd <= 0;
  return true;
};
input.onDenied = (slot) => {
  audio.click();
  const why = deniedReason(slot);
  skillBar.why(slot, why);
  // no toque: aviso curto em cima do botão
  const btn = document.querySelector<HTMLElement>(`#btn-${slot === 'ability' ? 'ability' : slot}`);
  if (btn && input.touchMode) {
    btn.dataset.why = why;
    btn.classList.remove('denied');
    void btn.offsetWidth;
    btn.classList.add('denied');
  }
};
input.onAimChange = (a) => {
  $('#aim-cancel').hidden = !(a && a.touch);
  if (!a) renderer.aimPreview = null;
};
function updateAimPreview() {
  // linha de mira do analógico direito (celular)
  const ma = game && game.combat && game.phase === 'play' && game.human.alive ? input.manualAim() : null;
  renderer.aimGuide = ma === null ? null : { ang: ma, held: input.aimHeld, color: game!.human.char.color };
  const a = input.aiming;
  if (!game || !a) {
    renderer.aimPreview = null;
    return;
  }
  const me = game.human;
  const info = slotInfo(a.slot);
  let ang = me.aim;
  let dist = info.range * 0.7;
  if (a.touch) {
    const len = Math.hypot(a.touch.dx, a.touch.dy);
    if (len > 18) {
      ang = Math.atan2(a.touch.dy, a.touch.dx);
      dist = Math.min(1, len / 90) * info.range;
    }
  } else {
    const w = renderer.toWorld(input.mouse.x, input.mouse.y);
    ang = Math.atan2(w.y - me.y, w.x - me.x);
    dist = Math.hypot(w.x - me.x, w.y - me.y);
  }
  renderer.aimPreview = { shape: info.shape, x: me.x, y: me.y, ang, dist: info.shape === 'wall' && info.kind === 'direction' ? Math.max(50, Math.min(info.range, 70)) : Math.min(dist, info.range || dist), range: info.range, r: info.r, w: info.w, color: info.color, label: `${info.name} · solte para usar` };
}

let laidW = 0;
let laidH = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // girou a tela e o aviso de "resize" veio cedo demais (comum no iPhone): reajusta aqui
  if (innerWidth !== laidW || innerHeight !== laidH) {
    laidW = innerWidth;
    laidH = innerHeight;
    layout();
  }
  if (game) {
    const g = game;
    if (g instanceof ClientGame) {
      const inp = currentScreen() === null ? readInput() : { mx: 0, my: 0, dash: false, ability: false };
      g.update(dt, inp);
      if (typeof inp.aim === 'number') g.human.aim = inp.aim;
      net?.sendInput(inp);
    } else if (!g.paused && g.phase !== 'results') {
      acc += dt;
      while (acc >= STEP) {
        g.step(STEP, readInput());
        acc -= STEP;
      }
    } else acc = 0;
    const evs = g.drainEvents();
    renderer.handleEvents(evs, g as Game);
    onEvents(evs);
    if (g.phase === 'play') audio.intensity = g.timeLeft() < 10 ? 1 : g.round >= 3 ? 0.5 : 0.2;
    updateAimPreview();
    renderer.render(g as Game, g.paused ? 0 : dt, now / 1000);
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
  if (titleScene.running) return;
  if (!idleGame) {
    const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
    idleGame = new Game({ arena, humanChar: 'kael', bots: 4, difficulty: 'normal', ownEchoDamage: true, training: false, spectator: true, mode: Math.random() < 0.5 ? 'combate' : 'nucleo' });
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
window.addEventListener('resize', () => {
  layout();
});
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

function toast(msg: string, ms = 4500) {
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

$('#rules-powers').innerHTML = POWERS.filter((p) => p.modes.includes('nucleo')).map((p) => `<li><span class="pdot" style="--c:${p.color}"></span><b style="color:${p.color}">${p.name}</b> ${p.desc}</li>`).join('');
bindOptions();
applySettings();
renderChip();
account.refresh();
layout();
// convite (link ?sala=CODE): vai direto para a sala do amigo
const invite = (new URLSearchParams(location.search).get('sala') ?? '').toUpperCase();
if (/^[A-Z0-9]{4}$/.test(invite)) {
  history.replaceState(null, '', location.pathname);
  openOnline(() => joinRoom(invite));
  $<HTMLInputElement>('#join-code').value = invite;
  ($('[data-tabset=onl] [data-tab=entrar]') as HTMLElement).click();
}
// primeira vez: pergunta se quer entrar/criar conta ou jogar como convidado
else if (!account.logged && !settings.welcomeSeen) openAccount('choice');
else show('screen-title');
requestAnimationFrame(frame);

// para testes automatizados
(window as any).__eco = {
  drawMonster,
  renderer,
  drawCharacter,
  getCharacter,
  withSkin,
  account,
  get game() {
    return game;
  },
  get net() {
    return net;
  },
  start: (char: string, arena: string, mode: MatchMode = 'nucleo') => {
    settings.char = char;
    settings.arena = arena;
    matchMode = mode;
    settings.rulesSeen = true;
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
        else if (cur === 'screen-lobby') go('leave-room');
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
