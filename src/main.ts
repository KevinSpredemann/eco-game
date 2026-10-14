import './styles.css';
import { audio } from './audio/audio';
import { ARENAS, BORDER, WORLD_H, WORLD_W, getArena } from './game/arenas';
import { CHARACTERS, getCharacter, withLevel, withSkin } from './game/characters';
import * as C from './game/constants';
import { ACCESSORIES, CHAR_PRICES, MatchMode, SKINS, TRAILS, abilityLevel, acceptedLoadout, canEquipWeapon, coinText, itemView, missingCoinsText, owns, upgradePrice } from './game/economy';
import { roundBanner, type DuelReason } from './game/duel';
import type { RoundEchoLine } from './systems/echo/digest';
import { Game, GameEvent, GameMode, Input, MIN_PLAYERS, MINION_INFO, MinionKind, MODE_RULES, OBJECTIVES, RosterEntry, TEAM_COLORS } from './game/sim';
import { POWERS, getPower } from './game/powerups';
import { WEAPONS, ITEMS, MAX_HP, GUN_Y, isPrimary, primaryOf } from './game/weapons';
import { ClientGame } from './net/clientGame';
import { NetClient } from './net/netClient';
import { PROTO, type EndInfo, type RoomInfo } from './net/protocol';
import { Renderer } from './render/renderer';
import { drawCharacter } from './render/chars';
import { drawMonster } from './render/monster';
import { account, serverUrl } from './ui/account';
import { InputManager, assistAim, nearestAim } from './ui/input';
import { Settings, loadSettings, saveSettings } from './ui/settings';
import { HomeHero, drawEquippedPreview } from './ui/homeHero';
import { LATER_MODES, PLAY_MODES, type ModeCard } from './ui/modes';
import { drawGear } from './ui/gearArt';
import { Scoreboard } from './ui/scoreboard';
import { avatarURL, drawMapPreview, drawPortrait } from './ui/portraits';
import { Carousel, fitText } from './ui/carousel';
import { HeroScene } from './ui/heroArt';
import { MapScene, MAP_DIFFICULTY } from './ui/mapArt';
import { ABILITY_BAL, BOSS, KITS, Loadout, SKILLS, STANDARD_PRIMARIES, ULTS, gearPrice, sanitizeLoadout } from './game/balance';
import { BASIC, ELEMENT_COLOR, ELEMENT_FX, ELEMENT_NAME, ENERGY_MAX, PLASMA, PLASMA_COLOR, SLOT_COST, comboReady, cooldownOf, denyPlasma, denyPowerCast, describePower, kitOf, powerSlotIndex } from './game/elements';
import { setAbilityTrace } from './game/abilityTrace';
import { sweepCircle } from './game/sweep';
import { ACTION_LABEL, Action, MoveScheme, Slot, isReservedKey, keyLabel, presetKeys } from './ui/input';
import { LoadoutScreen } from './ui/loadout';
import { MundoController } from './ui/mundoView';
import { SkillBar, SlotView, drawSlotArt, slotReady } from './ui/skillbar';
import type { AimPreview } from './render/combatFx';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const settings: Settings = loadSettings();
if (import.meta.env.DEV) {
  try {
    if (localStorage.getItem('eco.dev') === '1') setAbilityTrace(true);
  } catch {
    /* sem armazenamento */
  }
}

const canvas = $<HTMLCanvasElement>('#game');
const renderer = new Renderer(canvas);
const input = new InputManager($('#touch'));
input.binds = settings.keys;

type AnyGame = Game | ClientGame;
let game: AnyGame | null = null;
let mundoCtl: MundoController | null = null;
let matchMode: MatchMode = 'dupla';
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

const training = () => false;
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
  input.control = settings.control;
  input.aimSens = settings.aimSens / 100;
  input.castMode = settings.castMode;
  input.manualSlots = new Set(settings.manualAim as Slot[]);
  input.cancelAimButtons = settings.cancelAim;
  input.moveScheme = settings.moveScheme;
  const sensRow = document.querySelector<HTMLElement>('#opt-sens-row');
  if (sensRow) sensRow.hidden = settings.control !== 'notebook';
  const note = document.querySelector<HTMLElement>('#opt-control-note');
  if (note) {
    const move =
      settings.moveScheme === 'wasd'
        ? 'WASD e as setas andam. Q, E e F são os poderes. R é a ultimate. Z é o extra. Espaço esquiva. O clique esquerdo ataca. O direito cancela.'
        : settings.moveScheme === 'esdf'
          ? 'ESDF anda (E frente, S esquerda, D trás, F direita). Q, W e R são poderes. A é o quarto. Z é o extra. Espaço esquiva. O clique esquerdo ataca. O direito cancela.'
          : 'As setas andam. Q, W, E e R são os poderes (R é a ultimate). Z é o extra. Espaço esquiva. O clique esquerdo é o ataque básico. O direito cancela a mira.';
    note.textContent =
      settings.control === 'notebook'
        ? `${move} O mouse mira com ajuda. C trava no inimigo mais perto. No automático os poderes saem na hora. Esc cancela a mira e não gasta.`
        : `${move} No automático, segure o poder para ver a mira e solte para usar. Esc cancela e não gasta energia nem recarga.`;
  }
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
    ['#opt-aim', 'aimSens'],
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
  const style = $<HTMLSelectElement>('#opt-control');
  style.value = settings.control;
  style.addEventListener('change', () => {
    settings.control = style.value === 'notebook' ? 'notebook' : 'classic';
    settings.keys = presetKeys(settings.control, settings.moveScheme);
    input.binds = settings.keys;
    input.fireLatch = false;
    applySettings();
    renderKeybinds();
    renderManualAim();
    audio.click();
  });
  const cast = $<HTMLSelectElement>('#opt-cast');
  cast.value = settings.castMode;
  cast.addEventListener('change', () => {
    const v = cast.value;
    settings.castMode = v === 'instant' || v === 'manual' || v === 'release' ? v : 'auto';
    applySettings();
    audio.click();
  });
  const range = $<HTMLSelectElement>('#opt-range');
  range.value = settings.rangeIndicator;
  range.addEventListener('change', () => {
    settings.rangeIndicator = range.value === 'always' ? 'always' : 'aiming';
    applySettings();
    audio.click();
  });
  const cancel = $<HTMLSelectElement>('#opt-cancel');
  cancel.value = settings.cancelAim;
  cancel.addEventListener('change', () => {
    settings.cancelAim = cancel.value === 'esc' ? 'esc' : 'both';
    applySettings();
    audio.click();
  });
  const move = $<HTMLSelectElement>('#opt-move');
  if (move) {
    move.value = settings.moveScheme;
    move.addEventListener('change', () => {
      const v = move.value;
      settings.moveScheme = v === 'wasd' || v === 'esdf' ? v : 'arrows';
      settings.keys = presetKeys(settings.control, settings.moveScheme);
      input.binds = settings.keys;
      applySettings();
      renderKeybinds();
      renderManualAim();
      audio.click();
    });
  }
  renderManualAim();
}

function renderManualAim() {
  const box = document.querySelector<HTMLElement>('#opt-manual');
  if (!box) return;
  const slots: Slot[] = ['ability', 'skill', 'ult', 'bonus', 'plasma'];
  const names = [keyLabel(settings.keys.ability), keyLabel(settings.keys.skill), keyLabel(settings.keys.ult), keyLabel(settings.keys.bonus), keyLabel(settings.keys.plasma)];
  box.innerHTML = slots
    .map((s, i) => `<label class="row check"><input type="checkbox" data-manual="${s}" ${settings.manualAim.includes(s) ? 'checked' : ''}/> Mira manual no ${names[i]}</label>`)
    .join('');
  box.querySelectorAll<HTMLInputElement>('[data-manual]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.manual ?? '';
      settings.manualAim = el.checked ? [...new Set([...settings.manualAim, id])] : settings.manualAim.filter((x) => x !== id);
      applySettings();
    });
  });
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
        if (isReservedKey(code, settings.moveScheme)) {
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
        renderManualAim();
        if (other) toast(`${keyLabel(code)} estava em "${ACTION_LABEL[other]}": as duas trocaram.`);
      };
    }),
  );
}
$('#keys-reset').addEventListener('click', () => {
  settings.keys = presetKeys(settings.control, settings.moveScheme);
  input.binds = settings.keys;
  input.fireLatch = false;
  saveSettings(settings);
  renderKeybinds();
  renderManualAim();
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
  'screen-cosmetics',
  'screen-online',
  'screen-lobby',
  'screen-pause',
  'screen-results',
];
const CHIP_ON = new Set(['screen-title', 'screen-modes', 'screen-cosmetics', 'screen-shop']);
const homeHero = new HomeHero($<HTMLCanvasElement>('#title-canvas'));
// herói em destaque na tela inicial: começa pelo seu personagem e vai trocando
function show(id: string | null) {
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  if (id === 'screen-title') {
    refreshHomeLook();
    homeHero.start();
  } else {
    homeHero.stop();
  }
  if (id === 'screen-cosmetics') startCosPreview();
  else stopCosPreview();
  if (id !== 'screen-select') heroScene.stop();
  if (id !== 'screen-map') mapScene.stop();
  const inGame = !!game && (id === null || id === 'screen-pause' || id === 'screen-results' || id === 'screen-options');
  $('#hud').hidden = !inGame || id === 'screen-results';
  $('#touch').hidden = !(game && id === null && input.touchMode);
  $('#account-chip').hidden = !(id && CHIP_ON.has(id));
  if (!inGame) {
    $('#banner').hidden = true;
    $('#hint').hidden = true;
    $('#round-call').hidden = true;
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
      if (usesLoadout()) openLoadout('pre');
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
    case 'quick-duelo':
      quickMatch('duelo');
      break;
    case 'quick-dupla':
      quickMatch('dupla');
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
        const btn = $<HTMLButtonElement>('#screen-results .btn[data-action=restart]');
        if (game?.mode === 'duelo' && btn.dataset.rematch === '1') {
          net?.send({ t: 'rematch', on: true });
          rematchPending = true;
          $('#res-rematch').hidden = false;
          $('#res-rematch').textContent = 'Revanche pedida. Esperando o outro jogador aceitar…';
          return;
        }
        endMatch();
        show('screen-lobby');
      } else startMatch();
      break;
    case 'select':
      if (isOnline() && rematchPending) {
        net?.send({ t: 'rematch', on: false });
        rematchPending = false;
      }
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
    case 'cosmetics':
      openCosmetics(cosTab);
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
  chip.querySelector('.cv')!.textContent = coinText(p.coins);
  $('#shop-coins').textContent = coinText(p.coins);
  const cosCoins = document.getElementById('cos-coins');
  if (cosCoins) cosCoins.textContent = `Saldo disponível: ${p.coins} moedas`;
  settings.char = p.equipped.char;
  refreshHomeLook();
  if (currentScreen() === 'screen-cosmetics') paintCosmetics();
  else if (currentScreen() === 'screen-shop' && shopCar) openShop(shopTab, shopCar.index);
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
const MODE_COLOR: Record<string, string> = {
  'x1-online': '#ff5a3c',
  'x1-offline': '#c084fc',
  dupla: '#3ea8ff',
  mundo: '#5dff8a',
};

function modeIcon(id: string): string {
  if (id === 'x1-online' || id === 'x1-offline') {
    return '<svg viewBox="0 0 48 48"><path d="M8 40 30 18M18 40 40 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="34" cy="12" r="5" fill="#ffd08a"/><circle cx="14" cy="12" r="5" fill="#ffd08a"/></svg>';
  }
  if (id === 'dupla') {
    return '<svg viewBox="0 0 48 48"><circle cx="16" cy="18" r="6" fill="#3ea8ff"/><circle cx="32" cy="18" r="6" fill="#ff4a5a"/><path d="M8 36c1-7 6-10 8-10s7 3 8 10M24 36c1-7 6-10 8-10s7 3 8 10" stroke="#dfe6ff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  }
  if (id === 'mundo') {
    return '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="rgba(93,255,138,.2)" stroke="#5dff8a" stroke-width="3"/><path d="M24 10v28M12 20c6 3 18 3 24 0M12 28c6-3 18-3 24 0" stroke="#c8ffd8" stroke-width="2" fill="none"/></svg>';
  }
  return '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="10" fill="none" stroke="#9aa3c7" stroke-width="3"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6" stroke="#9aa3c7" stroke-width="3" stroke-linecap="round"/></svg>';
}

/** offline = partida local, sem WebSocket */
let playWhere: 'online' | 'offline' = 'offline';

function modeTitle(mode: string, where?: 'online' | 'offline'): string {
  const w = where ?? (selectCtx === 'lobby' ? 'online' : playWhere);
  if (mode === 'duelo') return w === 'offline' ? 'X1 Offline' : 'X1 Online';
  if (mode === 'dupla') return w === 'offline' ? '2x2 Offline' : '2x2';
  return mode;
}

function playLocal(mode: 'duelo' | 'dupla') {
  audio.click();
  playWhere = 'offline';
  matchMode = mode;
  settings.bots = mode === 'duelo' ? 1 : 3;
  saveSettings(settings);
  selectCtx = 'local';
  openSelect();
}

function playOnline(mode: 'duelo' | 'dupla') {
  audio.click();
  playWhere = 'online';
  onlineMode = mode;
  openOnline();
}

function runMode(m: ModeCard) {
  if (!m.available) return;
  if (m.id === 'x1-offline') playLocal('duelo');
  else if (m.id === 'x1-online') playOnline('duelo');
  else if (m.id === 'mundo') openMundo();
}

function modeAct(label: string, go: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small' + (disabled ? '' : ' primary');
  b.disabled = disabled;
  b.textContent = label;
  if (!disabled) b.addEventListener('click', (e) => {
    e.stopPropagation();
    go();
  });
  return b;
}

function modeCard(m: ModeCard): HTMLElement {
  const el = document.createElement('article');
  el.className = 'mode-pick' + (m.available ? '' : ' soon');
  el.dataset.modeId = m.id;
  el.style.setProperty('--c', MODE_COLOR[m.id] ?? '#8a84a8');
  const avail = m.available ? 'Disponível' : m.reason ?? 'Indisponível';
  const teams = m.teams ? ` · ${m.teams}` : '';
  const who = m.players === '1' ? '1 jogador' : /^\d+$/.test(m.players) ? `${m.players} jogadores` : m.players;
  el.innerHTML = `<span class="mode-ico">${modeIcon(m.id)}</span><span class="mbody"><span class="mtag">${m.category} · ${m.where}</span><span class="mt">${m.name}</span><span class="md">${m.desc}</span><span class="mmeta">${who}${teams} · ${avail}</span></span>`;
  const acts = document.createElement('div');
  acts.className = 'mode-acts';
  if (!m.available) {
    el.setAttribute('aria-disabled', 'true');
    acts.appendChild(modeAct(m.reason ?? 'Indisponível', () => {}, true));
  } else if (m.id === 'dupla') {
    acts.append(modeAct('Offline', () => playLocal('dupla')), modeAct('Online', () => playOnline('dupla')));
  } else {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.addEventListener('click', () => runMode(m));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        runMode(m);
      }
    });
    acts.appendChild(modeAct('Selecionar', () => runMode(m)));
  }
  el.appendChild(acts);
  return el;
}

function openMundo() {
  if (mundoCtl || game) return;
  audio.click();
  show(null);
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  mundoCtl = new MundoController(canvas, $('#mundo-ui'), account.profile.equipped.char || settings.char, closeMundo);
}

function closeMundo() {
  const ctl = mundoCtl;
  mundoCtl = null;
  ctl?.destroy();
  show('screen-title');
}

function fillModeLists(grid: HTMLElement, more: HTMLElement) {
  grid.replaceChildren(...PLAY_MODES.map(modeCard));
  more.replaceChildren(...LATER_MODES.map(modeCard));
  more.hidden = LATER_MODES.length === 0;
  const wrap = more.closest<HTMLElement>('.more-modes');
  if (wrap) wrap.hidden = LATER_MODES.length === 0;
}

function openModes() {
  fillModeLists($('#mode-grid'), $('#more-modes'));
  show('screen-modes');
}

function refreshHomeLook() {
  const p = account.profile;
  homeHero.set(withSkin(getCharacter(p.equipped.char), p.equipped.skin), p.equipped.acc || 'nenhum', p.equipped.weapon || 'assinatura');
}

type CosTab = 'skin' | 'acc' | 'weapon';
let cosTab: CosTab = 'skin';

function openCosmetics(tab: CosTab = cosTab) {
  cosTab = tab;
  document.querySelectorAll<HTMLButtonElement>('#cos-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.cosTab === tab));
  paintCosmetics();
  show('screen-cosmetics');
}

let cosLook: { skin?: string; acc?: string; weapon?: string } | null = null;
let cosRaf = 0;
let cosPhase = 0;

function stopCosPreview() {
  cancelAnimationFrame(cosRaf);
  cosRaf = 0;
}

function tickCosPreview() {
  const cv = document.getElementById('cos-preview') as HTMLCanvasElement | null;
  if (!cv || currentScreen() !== 'screen-cosmetics') {
    stopCosPreview();
    return;
  }
  cosPhase += 0.045;
  const p = account.profile;
  const skin = cosLook?.skin ?? p.equipped.skin;
  const acc = cosLook?.acc ?? (p.equipped.acc || 'nenhum');
  const weapon = cosLook?.weapon ?? (p.equipped.weapon || 'assinatura');
  drawEquippedPreview(cv, withSkin(getCharacter(p.equipped.char), skin), acc, weapon, cosPhase);
  cosRaf = requestAnimationFrame(tickCosPreview);
}

function startCosPreview() {
  if (cosRaf) return;
  cosPhase = 0;
  cosRaf = requestAnimationFrame(tickCosPreview);
}

function paintCosmetics() {
  const grid = document.getElementById('cos-grid');
  if (!grid) return;
  const p = account.profile;
  const char = withSkin(getCharacter(p.equipped.char), p.equipped.skin);
  const cards: { id: string; name: string; price: number; owned: boolean; on: boolean; kind: CosTab; color: string }[] = [];
  if (cosTab === 'skin') {
    for (const s of SKINS) cards.push({ id: s.id, name: s.name, price: s.price, owned: owns(p, 'skin:' + s.id), on: p.equipped.skin === s.id, kind: 'skin', color: s.glow ?? char.color });
  } else if (cosTab === 'acc') {
    for (const a of ACCESSORIES) cards.push({ id: a.id, name: a.name, price: a.price, owned: owns(p, 'acc:' + a.id), on: (p.equipped.acc || 'nenhum') === a.id, kind: 'acc', color: a.color });
  } else {
    const sign = WEAPONS[primaryOf(p.equipped.char)];
    cards.push({ id: 'assinatura', name: 'Do personagem', price: 0, owned: true, on: (p.equipped.weapon || 'assinatura') === 'assinatura', kind: 'weapon', color: sign.color });
    for (const id of STANDARD_PRIMARIES) {
      const w = WEAPONS[id];
      const price = gearPrice(id) ?? 0;
      cards.push({ id, name: w.name, price, owned: canEquipWeapon(p, id), on: p.equipped.weapon === id, kind: 'weapon', color: w.color });
    }
  }
  grid.replaceChildren();
  for (const it of cards) {
    const st = itemView({ owned: it.owned, equipped: it.on, price: it.price, coins: p.coins });
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cos-card ' + st.view + (it.on ? ' on' : '');
    b.innerHTML = `<canvas class="pv"></canvas><span class="car-label"><b style="color:${it.color}">${it.name}</b><span>${st.label}</span></span>`;
    const preview = () => {
      cosLook = it.kind === 'skin' ? { skin: it.id } : it.kind === 'acc' ? { acc: it.id } : { weapon: it.id };
    };
    b.addEventListener('pointerenter', preview);
    b.addEventListener('focus', preview);
    b.addEventListener('pointerleave', () => {
      cosLook = null;
    });
    b.addEventListener('blur', () => {
      cosLook = null;
    });
    b.addEventListener('click', () => void chooseCosmetic(it.kind, it.id, it.price));
    grid.appendChild(b);
  }
  requestAnimationFrame(() => {
    grid.querySelectorAll<HTMLCanvasElement>('canvas.pv').forEach((cv, i) => {
      const it = cards[i];
      if (it.kind === 'weapon') drawGear(cv, 'primary', it.id === 'assinatura' ? primaryOf(p.equipped.char) : it.id, it.color, { locked: !it.owned && it.price > 0 });
      else drawPortrait(cv, it.kind === 'skin' ? withSkin(getCharacter(p.equipped.char), it.id) : char, { acc: it.kind === 'acc' ? it.id : p.equipped.acc, locked: !it.owned && it.price > 0 });
    });
  });
}

async function chooseCosmetic(kind: CosTab, id: string, price: number) {
  audio.click();
  const p = account.profile;
  const owned = kind === 'weapon' ? canEquipWeapon(p, id) : owns(p, `${kind}:${id}`);
  const equipped = kind === 'skin' ? p.equipped.skin === id : kind === 'acc' ? (p.equipped.acc || 'nenhum') === id : (p.equipped.weapon || 'assinatura') === id;
  const st = itemView({ owned, equipped, price, coins: p.coins });
  if (st.view === 'equipped') return;
  if (st.view === 'short') return toast(missingCoinsText(st.missing));
  if (st.view === 'soon' || st.view === 'locked') return toast(st.label);
  if (st.view === 'buy') {
    const err = await account.buy(`${kind === 'weapon' ? 'gear' : kind}:${id}`);
    if (err) return toast(err);
    toast('Liberado!');
  }
  const err = await account.equip(kind, id);
  if (err) return toast(err);
  if (kind === 'weapon') {
    settings.loadout = sanitizeLoadout({ ...settings.loadout, primary: id }, (k) => owns(account.profile, k));
    saveSettings(settings);
  }
  cosLook = null;
  paintCosmetics();
  refreshHomeLook();
}

function syncFavoriteWeapon() {
  const local = settings.loadout?.primary || 'assinatura';
  const saved = account.profile.equipped.weapon || 'assinatura';
  if (!account.logged) {
    const next = canEquipWeapon(account.profile, local) ? local : 'assinatura';
    if (saved !== next) void account.equip('weapon', next);
    return;
  }
  if (saved === 'assinatura' && local !== 'assinatura' && canEquipWeapon(account.profile, local)) {
    void account.equip('weapon', local);
    return;
  }
  if (settings.loadout.primary !== saved) {
    settings.loadout = sanitizeLoadout({ ...settings.loadout, primary: saved }, (k) => owns(account.profile, k));
    saveSettings(settings);
    refreshHomeLook();
  }
}

$('#cos-tabs')?.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cos-tab]');
  if (!t?.dataset.cosTab) return;
  audio.click();
  openCosmetics(t.dataset.cosTab as CosTab);
});

/** os dois modos usam a tela de equipamento */
const usesLoadout = () => true;

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
      <span class="badge">${symbolSvg(c.id, c.color)}${st.owned ? '' : LOCK}</span>
      <b class="nm" style="--c:${c.color}">${c.name.toUpperCase()}</b>
      <span>${st.owned ? `${c.ability.name} · nv ${st.lv}` : `<span class="coins"><span class="coin"></span>Libera com ${st.price} moedas</span>`}</span>
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
      const st = charState(CHARACTERS[i]);
      b.classList.toggle('locked', !st.owned);
      b.title = st.owned ? CHARACTERS[i].name : `${CHARACTERS[i].name} · Libera com ${st.price} moedas`;
      const tn = b.querySelector('.tn');
      if (tn) tn.textContent = st.owned ? CHARACTERS[i].name : `${CHARACTERS[i].name} · ${st.price}`;
    });
}

function placeHeroStage() {
  if (!charCar) return;
  const c = CHARACTERS[charCar.index];
  const cv = (heroScene as any).cv as HTMLCanvasElement;
  cv.className = 'stage';
  charCar.center.appendChild(cv);
  const st = charState(c);
  heroScene.set(withSkin(withLevel(c, abilityLevel(account.profile, c.id)), account.profile.equipped.skin), !st.owned, st.owned ? '' : `Libera com ${st.price} moedas`);
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
      ? `<button class="btn primary go-btn" id="buy-char"><span class="coin"></span>Libera com ${st.price} moedas</button>`
      : `<button class="btn go-btn" disabled>Libera com ${st.price} moedas · faltam ${st.price - coins}</button>`;
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
    b.innerHTML = `<img src="${avatarURL(c, 44)}" alt="" /><span class="tn">${c.name}</span>`;
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
  const on = g.phase === 'rewind' && (g as any).roundEchoLines?.length > 0;
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
  const label = selectCtx === 'lobby' ? 'Sala online' : modeTitle(matchMode);
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
  const teams = matchMode === 'dupla' ? '<span class="hp-tag">Times: azul (você e um aliado) contra vermelho.</span>' : '';
  $('#map-info').innerHTML = `<b class="hp-name nm" style="--c:${a.palette.accent}">${a.name.toUpperCase()}</b><span class="hp-tag">${a.desc} ${a.gimmick}</span>${teams}<span class="diff">Dificuldade: <b style="color:${dc}">${dl}</b> <span class="dbars">${bars}</span></span>`;
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
  $('#map-mode').textContent = `${modeTitle(matchMode)} · ${getCharacter(settings.char).name} · passo 2 de ${usesLoadout() ? 3 : 2}`;
  $('#match-opts').hidden = training();
  const goTxt = usesLoadout() ? 'Equipamento ›' : 'Começar partida ›';
  $('#map-go').textContent = goTxt;
  $('#map-go-top').textContent = usesLoadout() ? 'Próximo ›' : 'Começar ›';
  const botSel = $<HTMLSelectElement>('#sel-bots');
  botSel.closest('label')!.hidden = true;
  const mm = matchMode;
  const maxBots = MODE_RULES[mm].maxPlayers - 1;
  const minBots = 1;
  const word = ['bot', 'bots'];
  $('#bots-label').textContent = 'Adversários';
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
    const equipped = p.equipped[tab] === it.id;
    const st = itemView({ owned, equipped, price: it.price, coins: p.coins });
    const b = document.createElement('button');
    b.className = 'shop-card ' + st.view + (equipped ? ' equipped' : '') + (owned || it.price <= 0 ? '' : ' locked');
    b.style.setProperty('--c', it.color);
    b.innerHTML = `<canvas class="pv"></canvas>${equipped ? '<span class="lo-badge">✓</span>' : st.view === 'short' || st.view === 'buy' ? '<span class="lo-badge lock">🔒</span>' : ''}<span class="car-label"><b style="color:${it.color}">${it.name}</b><span>${st.label}</span></span>`;
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
    const st = itemView({ owned, equipped, price: it.price, coins: p.coins });
    const btn =
      st.view === 'equipped'
        ? `<span class="lo-state on">${st.label}</span>`
        : st.view === 'owned'
          ? '<button class="btn primary shop-go">Equipar</button>'
          : st.view === 'buy'
            ? `<button class="btn primary shop-go">COMPRAR · ${it.price}</button>`
            : `<button class="btn" type="button" disabled>${st.label}</button>`;
    $('#shop-act').innerHTML = `<div class="shop-act-info"><b>${it.name}</b><span>${car.index + 1} de ${items.length} · ${st.label}</span></div>${btn}`;
    $('#shop-act').querySelector('.shop-go')?.addEventListener('click', async () => {
      if (st.view === 'short' || st.view === 'locked' || st.view === 'soon' || st.view === 'equipped') return;
      if (!owned) {
        if (p.coins < it.price) return toast(missingCoinsText(it.price - p.coins));
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
let rematchPending = false;
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
  n.onRematch = (state, by) => {
    if (n !== net) return;
    const el = $('#res-rematch');
    el.hidden = false;
    if (state === 'wait') {
      rematchPending = true;
      el.textContent = by && by === n.id ? 'Você pediu revanche. Esperando o outro jogador aceitar…' : 'O adversário pediu revanche. Toque em Revanche para aceitar.';
    } else if (state === 'no') {
      rematchPending = false;
      el.textContent = 'Revanche cancelada. Vocês continuam na sala.';
    } else el.textContent = 'Revanche aceita. Começando…';
    if (state !== 'go') toast(el.textContent);
  };
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
  keyOf: (slot) => {
    if (input.touchMode) {
      const touch: Partial<Record<typeof slot, string>> = { skill: 'HAB 2', ult: 'ULT', item: 'ITEM' };
      if (touch[slot]) return touch[slot];
    }
    return keyLabel(settings.keys[slot]);
  },
});
function openLoadout(ctx: 'pre' | 'pause' | 'lobby') {
  loadoutCtx = ctx;
  const sub =
    ctx === 'pre'
      ? `${modeTitle(matchMode)} · ${getCharacter(settings.char).name} · passo 3 de 3`
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
      if (l.primary !== account.profile.equipped.weapon) void account.equip('weapon', l.primary);
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
    n.send({ t: 'create', mode: onlineMode, arena: settings.arena, bots: onlineMode === 'duelo' ? 0 : 3 });
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
  $('#lobby-count').textContent = `${r.players.length} de ${max} pessoas na sala · ${modeTitle(r.mode, 'online')}`;
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
    ? `Busca automática · ${modeTitle(r.mode, 'online')}: começa quando lotar, quando todos estiverem prontos ou em ${r.autoIn ?? 0}s (bots completam as vagas).`
    : host
        ? r.players.length < 2 && r.mode === 'duelo'
          ? 'Sozinho? Pode começar: um bot entra no lugar do amigo.'
          : r.mode === 'dupla' && r.players.length < 4
            ? '2x2: chame um amigo para o seu time ou comece — bots completam os dois lados.'
            : others.length
            ? `${readyN} de ${others.length} ${others.length === 1 ? 'amigo pronto' : 'amigos prontos'}. Quando quiser, toque em Começar.`
            : 'Mande o convite para os amigos. Quando todo mundo entrar, toque em Começar.'
        : `Você está na sala de ${hostP?.name ?? 'outro jogador'}. Esperando ${hostP?.name ?? 'o dono'} começar a partida.`;
  if (r.state === 'playing' || performance.now() - startPendingT > 5000) startPending = false;
  $<HTMLButtonElement>('#lobby-start').disabled = startPending;
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
  const humanLoadout = acceptedLoadout(p, settings.loadout);
  if (humanLoadout.secondary !== (settings.loadout.secondary ?? null)) {
    settings.loadout = humanLoadout;
    saveSettings(settings);
  }
  const human: RosterEntry = { id: 'p0', char: settings.char, isBot: false, name: 'Você', skin: p.equipped.skin, trail: p.equipped.trail, lv: abilityLevel(p, settings.char), loadout: humanLoadout };
  if (training()) return [human];
  const n = matchMode === 'duelo' ? 1 : 3;
  const pool = CHARACTERS.map((c) => c.id).filter((id) => id !== settings.char);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bots: RosterEntry[] = pool.slice(0, n).map((c, i) => ({ id: 'b' + i, char: c, isBot: true, name: getCharacter(c).name }));
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
    mode: matchMode,
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
  input.powers = g.mode === 'duelo' || g.mode === 'dupla';
  callShown = -1;
  $('#round-call').hidden = true;
  hintStage = training() ? 1 : 0;
  hintT = 0;
  const me = g.human;
  const powers = powersMatch(g);
  const kit = powers ? kitOf(me.char.id) : null;
  $('#btn-ability .tlabel').textContent = me.boss ? 'IMPACTO' : powers ? keyLabel(settings.keys.ability) : me.char.ability.label.toUpperCase();
  $('#touch').classList.toggle('combat', g.combat);
  $('#touch').classList.toggle('boss', me.boss);
  $('#btn-fire').hidden = !g.combat || powers;
  $('#btn-item').hidden = !g.combat || me.boss || powers;
  $('#btn-plasma').hidden = !powers;
  if (powers) $('#btn-plasma .tlabel').textContent = keyLabel(settings.keys.plasma);
  $('#btn-bonus').hidden = powers ? false : training() && !isOnline();
  $('#btn-skill').hidden = !g.combat;
  $('#btn-ult').hidden = !g.combat;
  $('#btn-skill .tlabel').textContent = me.boss ? 'BARRAGEM' : powers ? kit!.powers[1].name.toUpperCase() : SKILLS[me.loadout.skill].name.toUpperCase();
  $('#btn-ult .tlabel').textContent = me.boss ? 'ROCHAS' : powers ? kit!.powers[2].name.toUpperCase() : 'ULT';
  if (powers) $('#btn-bonus .tlabel').textContent = kit!.powers[3].name.toUpperCase();
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
  } else audio.unlock();
});
window.addEventListener('pageshow', () => audio.unlock());
window.addEventListener('focus', () => audio.unlock());

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

function duelScore(g: AnyGame) {
  const me = g.human;
  const other = g.players.find((p) => p.id !== me.id);
  return `${me.roundWins} × ${other?.roundWins ?? 0}`;
}

function objectiveText(g: AnyGame) {
  if (g.mode === 'dupla') return '2x2. O time que sobrar vence a rodada. Melhor de 5. Depois o ECO rebobina.';
  return 'X1 só com poderes. Q, E e F, R na ultimate e Z no extra. Os elementos combinam. Quem zera a vida vence a rodada.';
}

const OBJ_SHORT: Record<string, string> = { dourado: '★ Fragmento dourado', tripla: '★ Entrega tripla', intocavel: '★ Sem levar dano' };

/** HUD de combate: só placar/objetivo curto, nunca a explicação do modo */
function teamWins(g: AnyGame, team: number) {
  return g.players.find((p) => p.team === team)?.roundWins ?? 0;
}

function objectiveHud(g: AnyGame) {
  if (g.phase !== 'play') return '';
  if (g.mode === 'dupla') return `Azul ${teamWins(g, 0)} × ${teamWins(g, 1)} Vermelho`;
  return duelScore(g);
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
function vsBoss(_g: AnyGame, _id: string) {
  return '';
}
/** os espaços de habilidade do jogador local (usados na barra e no aviso de "não dá para usar") */
function powersMatch(g: AnyGame) {
  return (g.mode === 'duelo' || g.mode === 'dupla') && !g.human.boss;
}

function powerHasTarget(me: { id: string; x: number; y: number; team: number }, reach: number) {
  if (!game) return false;
  return game.players.some((o) => o.alive && o.id !== me.id && game!.hostile(me, o) && Math.hypot(o.x - me.x, o.y - me.y) <= reach);
}

function comboLine(g: AnyGame): string {
  const me = g.human;
  if (!me.alive) return '';
  const foes = g.players
    .filter((o) => o.alive && o.id !== me.id && g.hostile(me, o))
    .map((o) => ({ burn: o.burnT, frozen: o.frozenT, gust: o.gustT, shock: o.shockT }));
  const plasma = g.players.some((o) => o.alive && o.id !== me.id && g.hostile(me, o) && o.plasmaT > 0);
  if (plasma && (me.powerCd ?? [0, 0, 0, 0]).some((n) => n <= 0)) return 'COMBO DISPONÍVEL: Explosão de Plasma';
  const labels = [keyLabel(settings.keys.ability), keyLabel(settings.keys.skill), keyLabel(settings.keys.ult), keyLabel(settings.keys.bonus)];
  const hit = comboReady(me.char.id, me.powerCd ?? [0, 0, 0, 0], foes, labels);
  return hit ? `COMBO DISPONÍVEL ${hit.key}: ${hit.name}` : '';
}

function buildSlots(g: AnyGame): SlotView[] {
  const me = g.human;
  const K = (a: Action) => keyLabel(settings.keys[a]);
  const slots: SlotView[] = [];
  if (powersMatch(g)) {
    const kit = kitOf(me.char.id);
    const ids: Slot[] = ['ability', 'skill', 'ult', 'bonus'];
    const labels = [K('ability'), K('skill'), K('ult'), K('bonus')];
    const foes = g.players
      .filter((o) => o.alive && o.id !== me.id && g.hostile(me, o))
      .map((o) => ({ burn: o.burnT, frozen: o.frozenT, gust: o.gustT, shock: o.shockT }));
    const ready = comboReady(me.char.id, me.powerCd ?? [0, 0, 0, 0], foes, labels);
    const plasmaUp = g.players.some((o) => o.alive && o.id !== me.id && g.hostile(me, o) && o.plasmaT > 0);
    // Barra: Q, E, F, R e depois o Z. O índice do kit não muda (R continua no espaço 2).
    for (const i of [0, 1, 3, 2]) {
      const pw = kit.powers[i];
      const left = me.powerCd[i] ?? 0;
      const cd = cooldownOf(me.char.id, pw.cd);
      const low = left <= 0 && (me.energy ?? ENERGY_MAX) < SLOT_COST[i];
      slots.push({
        id: ids[i],
        key: labels[i],
        name: pw.name.toUpperCase(),
        art: { kind: 'symbol', id: me.char.id, color: ELEMENT_COLOR[pw.element] },
        color: ELEMENT_COLOR[pw.element],
        cd: left / cd,
        secs: left,
        off: low,
        note: low ? 'SEM ENERGIA' : undefined,
        desc: `${describePower({ ...pw, cd }, labels[i], SLOT_COST[i])} ${ELEMENT_FX[pw.element]}.`,
        hot: ready?.slot === i || (!ready && plasmaUp && left <= 0),
      });
    }
    const plasmaLeft = me.plasmaCd ?? 0;
    const plasmaOn = !!me.plasmaOn;
    const plasmaLow = plasmaOn && plasmaLeft <= 0 && (me.energy ?? ENERGY_MAX) < PLASMA.cost;
    slots.push({
      id: 'plasma',
      key: K('plasma'),
      name: 'PLASMA',
      art: { kind: 'symbol', id: me.char.id, color: PLASMA_COLOR },
      color: PLASMA_COLOR,
      cd: plasmaOn ? plasmaLeft / PLASMA.cd : 1,
      secs: plasmaOn ? plasmaLeft : 0,
      off: !plasmaOn || plasmaLow,
      note: !plasmaOn ? 'BLOQUEADA' : plasmaLow ? 'SEM ENERGIA' : undefined,
      desc: plasmaOn
        ? `${K('plasma')} — ${PLASMA.name}: projétil médio, marca de ${PLASMA.mark}s. O próximo poder no alvo marcado explode (teto ${PLASMA.cap}). Recarga ${PLASMA.cd}s. Custa ${PLASMA.cost} de energia.`
        : 'Rajada de Plasma libera depois da primeira partida. Não se compra com moedas.',
    });
    const basicLeft = me.basicCd ?? 0;
    const basicLow = basicLeft <= 0 && (me.energy ?? ENERGY_MAX) < BASIC.cost;
    slots.push({
      id: 'fire',
      key: 'Clique',
      name: 'BÁSICO',
      art: { kind: 'symbol', id: me.char.id, color: '#d7e2ff' },
      color: '#d7e2ff',
      cd: basicLeft / BASIC.cd,
      secs: basicLeft,
      off: basicLow,
      note: basicLow ? 'SEM ENERGIA' : undefined,
      desc: `Clique esquerdo — ${BASIC.name}: dano ${BASIC.dmg}, alcance ${BASIC.range}, recarga ${BASIC.cd}s, energia ${BASIC.cost}. Não marca elemento e não gasta a marca de plasma. Para na parede.`,
    });
    slots.push({ id: 'dash', key: K('dash'), name: 'Impulso', art: { kind: 'dash', id: 'dash', color: '#9ad8ff' }, color: '#9ad8ff', cd: me.dashCd / C.DASH_CD, secs: me.dashCd, off: me.stasisT > 0 || me.rootT > 0, note: me.rootT > 0 ? 'PRESO' : me.stasisT > 0 ? 'BLOQUEADO' : undefined, desc: 'Arrancada curta. Para na parede. O próximo golpe logo depois ganha um bônus pequeno.' });
    return slots;
  }
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
  if (game.mode === 'duelo' || game.mode === 'dupla') {
    if (slot === 'plasma') return denyPlasma(!!me.plasmaOn, me.plasmaCd ?? 0, me.energy ?? ENERGY_MAX) ?? '';
    const why = denyPowerCast(slot, me.powerCd ?? [0, 0, 0, 0], me.energy ?? ENERGY_MAX);
    if (why) return why;
    const i = powerSlotIndex(slot);
    if (i !== null) {
      const def = kitOf(me.char.id).powers[i];
      if (def.speed <= 0 && !powerHasTarget(me, def.range + def.radius)) return 'Nenhum alvo válido';
      return '';
    }
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
    } else if (g.mode === 'duelo' || g.mode === 'dupla') {
      const kit = kitOf(me.char.id);
      const cds = me.powerCd ?? [0, 0, 0, 0];
      drawCooldown('#btn-ability', cds[0] / cooldownOf(me.char.id, kit.powers[0].cd), ELEMENT_COLOR[kit.powers[0].element]);
      drawCooldown('#btn-skill', cds[1] / cooldownOf(me.char.id, kit.powers[1].cd), ELEMENT_COLOR[kit.powers[1].element]);
      drawCooldown('#btn-ult', cds[2] / cooldownOf(me.char.id, kit.powers[2].cd), ELEMENT_COLOR[kit.powers[2].element]);
      drawCooldown('#btn-bonus', cds[3] / cooldownOf(me.char.id, kit.powers[3].cd), ELEMENT_COLOR[kit.powers[3].element]);
      $('#btn-ult').classList.toggle('ready', cds[2] <= 0);
    } else {
      drawCooldown('#btn-skill', me.skillCd / SKILLS[me.loadout.skill].cooldown, '#3ee8ff');
      drawCooldown('#btn-ult', 1 - me.ultCharge / 100, '#ffd23e');
      $('#btn-ult').classList.toggle('ready', me.ultCharge >= 100);
    }
    if (me.boss) $('#btn-ult').classList.toggle('ready', me.bossCd.chuva <= 0 && (g.bossPhase ?? 1) >= 2);
  }
  // aviso único quando a ultimate fica pronta (no X1 o R é só mais um poder)
  const ready = false;
  if (ready && !ultWasReady && g.phase === 'play') {
    audio.power('dobro');
    $('#hud').classList.add('ult-flash');
    setTimeout(() => $('#hud').classList.remove('ult-flash'), 900);
  }
  ultWasReady = ready;
  $('#boss-hud').hidden = true;
}

function updateHud() {
  if (!game) return;
  const g = game;
  rewindPanel(g);
  const suddenOn = g.mode === 'duelo' && g.sudden && g.phase === 'play';
  const roundLabel = suddenOn ? 'MORTE SÚBITA' : g.tiebreak ? 'DESEMPATE' : training() && !isOnline() ? `TREINO ${g.round}/${g.totalRounds}` : `RODADA ${g.round}/${g.totalRounds}`;
  setText('#hud-round', roundLabel);
  $('#hud-round').classList.toggle('sudden', suddenOn);
  const t = g.phase === 'prep' ? g.roundDur : g.timeLeft();
  setText('#hud-timer', g.phase === 'rewind' ? '◀◀' : g.phase === 'call' ? '—' : String(Math.ceil(t)));
  $('#hud-timer').classList.toggle('low', g.phase === 'play' && g.timeLeft() <= (suddenOn ? 10 : 5));
  syncRoundCall();
  const obj = objectiveHud(g);
  setText('#hud-objective', obj);
  $('#hud-objective').hidden = !obj;
  const combo = powersMatch(g) ? comboLine(g) : '';
  const comboEl = $('#hud-combo');
  comboEl.hidden = !combo;
  if (comboEl.textContent !== combo) comboEl.textContent = combo;
  scoreboard.update(g);
  const me = g.human;
  const ab = me.char.ability;
  const bonusOwner = me.bonusAb ? CHARACTERS.find((c) => c.ability.id === me.bonusAb) : null;
  const bonusTag = bonusOwner ? `<span class="bonus" style="color:${bonusOwner.color}">${bonusOwner.ability.name}${input.touchMode ? '' : ` (${keyLabel(settings.keys.bonus)})`}</span>` : '';
  const abTxt = me.boss ? "" : me.abilCd > 0 ? `<span class="ab-wait">${ab.label} ${Math.ceil(me.abilCd)}s</span>` : `<span class="ab-ready">${ab.label} pronto</span>`;
  const pw = me.power ? getPower(me.power.id) : null;
  const pwTxt = pw && !g.combat ? `<span class="pw" style="color:${pw.color}">${pw.short}${pw.id === 'dobro' ? '' : ' ' + Math.ceil(me.power!.t) + 's'}</span>` : '';
  if (!me.alive && me.respawnT > 0) {
    setHTML('#hud-status', `<span class="ab-wait">Renascendo em ${Math.ceil(me.respawnT)}s…</span>`);
  } else if (!me.alive) {
    setHTML('#hud-status', `<span class="ab-wait">${'Eliminado nesta rodada'}</span>`);
  } else if (g.combat) {
    const f = Math.max(0, me.hp / (me.maxHp || MAX_HP));
    const cls = f > 0.5 ? '' : f > 0.25 ? 'mid' : 'low';
    const w = WEAPONS[me.weapon];
    const wTxt = g.mode === 'duelo' || g.mode === 'dupla' ? kitOf(me.char.id).passiveName : isPrimary(me.weapon) ? w.name : `${w.name} ${w.ammo ? me.ammo + 'x' : Math.ceil(me.weaponT) + 's'}`;
    // no computador a barra de habilidades já mostra item e recargas
    const itTxt = me.item && input.touchMode ? `<span class="itm">${ITEMS[me.item].name} x${me.itemN}</span>` : '';
    const ePct = Math.max(0, Math.min(100, Math.round(((me.energy ?? ENERGY_MAX) / ENERGY_MAX) * 100)));
    const energyBit = g.mode === 'duelo' || g.mode === 'dupla' ? `<span class="ebar" title="Energia"><i style="width:${ePct}%"></i></span><b class="en">${Math.ceil(me.energy ?? 0)}</b>` : '';
    setHTML(
      '#hud-status',
      `<span class="hpbar"><i class="${cls}" style="width:${Math.round(f * 100)}%"></i>${me.shieldHp > 0 ? `<s style="width:${Math.round((me.shieldHp / 50) * 100)}%"></s>` : ''}</span><b>${Math.ceil(me.hp)}${me.shieldHp > 0 ? `<small class="shv">+${Math.ceil(me.shieldHp)}⛉</small>` : ''}</b>${energyBit}<span class="wpn">${wTxt}</span>`,
    );
    $('#hud-status').dataset.energy = g.mode === 'duelo' || g.mode === 'dupla' ? String(Math.ceil(me.energy ?? 0)) : '';
    // item, habilidades e poder já aparecem nos botões/barra de habilidades (HUD limpo)
    void itTxt;
    $('#btn-item .tlabel').textContent = me.item ? `${({ bomba: 'BOMBA', mina: 'MINA', gelo: 'GELO', kit: 'KIT', pulso: 'PULSO' } as Record<string, string>)[me.item] ?? 'ITEM'} ${me.itemN}` : 'ITEM';
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
  if (powersMatch(g)) {
    const kit = kitOf(me.char.id);
    bb.classList.remove('empty');
    bb.style.setProperty('--bc', ELEMENT_COLOR[kit.powers[3].element]);
    setText('#btn-bonus .tlabel', kit.powers[3].name.toUpperCase());
    setText('#btn-ability .tlabel', keyLabel(settings.keys.ability));
    setText('#btn-plasma .tlabel', keyLabel(settings.keys.plasma));
    setText('#btn-skill .tlabel', kit.powers[1].name.toUpperCase());
    setText('#btn-ult .tlabel', kit.powers[2].name.toUpperCase());
  } else {
    bb.classList.toggle('empty', !bAb);
    bb.style.setProperty('--bc', bAb ? bAb.color : '#6a6a8a');
    setText('#btn-bonus .tlabel', bAb ? bAb.ability.label.toUpperCase() : 'PODER');
  }
  drawCooldown('#btn-dash', me.boss ? me.bossCd.avanco / BOSS.skills.avanco.cooldown : me.dashCd / C.DASH_CD, '#3ee8ff');
  if (!powersMatch(g)) drawCooldown('#btn-ability', me.boss ? me.bossCd.impacto / BOSS.skills.impacto.cooldown : me.abilCd / ab.cooldown, me.color);
  updateSkills(g);
}

const cdState: Record<string, number> = {};
function drawCooldown(sel: string, frac: number, color: string) {
  const f = Math.max(0, Math.min(1, frac));
  const q = Math.round(f * 60);
  if (cdState[sel] === q) return;
  cdState[sel] = q;
  const cv = $(sel)?.querySelector('canvas');
  if (!cv) return;
  const g = cv.getContext('2d');
  if (!g) return;
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

let callShown = -1;
function showRoundCall(pid: string | null, reason?: DuelReason | null) {
  if (!game || game.mode !== 'duelo' || game.phase !== 'call') return;
  if (callShown === game.round) return;
  callShown = game.round;
  const view = roundBanner(game.human.id, pid, reason, duelScore(game));
  const el = $('#round-call');
  el.hidden = false;
  el.classList.remove('win', 'loss', 'draw');
  el.classList.add(view.kind);
  (el.querySelector('.rc-kicker') as HTMLElement).textContent = '';
  (el.querySelector('.rc-title') as HTMLElement).textContent = view.title;
  (el.querySelector('.rc-sub') as HTMLElement).textContent = '';
  $('#banner').hidden = true;
  bannerTimer = 0;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  audio.roundMark(view.kind);
}
function syncRoundCall() {
  if (!game || game.mode !== 'duelo' || game.phase !== 'call') {
    $('#round-call').hidden = true;
    return;
  }
  const reason = game instanceof Game ? game.callReason : undefined;
  showRoundCall(game.callWinner, reason);
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
          const sub = g.mode === 'duelo' ? duelScore(g) : g.tiebreak ? 'Rodada curta: só quem empatou joga.' : objectiveText(g);
          banner(g.tiebreak ? 'DESEMPATE' : `RODADA ${g.round}`, sub, 2.4);
          audio.intensity = 0;
        } else if (e.phase === 'play') {
          banner(g.combat ? 'LUTE!' : 'JÁ!', '', 0.8);
          audio.go();
        } else if (e.phase === 'rewind') {
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
        if (g.phase === 'prep') banner(String(e.n), g.mode === 'duelo' ? duelScore(g) : g.tiebreak ? '' : objectiveText(g), 0.9);
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
      case 'combo':
        showTip(`${e.name} +${e.bonus}`, 2.2);
        break;
      case 'deny':
        audio.fail(panOf(g.players.find((p) => p.id === e.pid)?.x ?? g.human.x));
        if (mine) toast(e.msg, 1800);
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
        banner(e.won ? 'VITÓRIA!' : 'FIM DE JOGO', '', 2.2);
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
        audio.cast(panOf(e.x));
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
      case 'sudden':
        banner('MORTE SÚBITA', 'Dano em dobro. A vida continua a mesma.', 2.2);
        audio.sudden();
        break;
      case 'roundWin':
        if (g.mode === 'duelo') {
          showRoundCall(e.pid, e.reason);
          break;
        }
        if (e.pid) {
          const w = g.players.find((p) => p.id === e.pid);
          if (w) banner(w.id === myId ? 'RODADA SUA!' : `RODADA DE ${w.char.name.toUpperCase()}`, '+3 pontos', 1.0);
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
  const move = input.touchMode ? 'Arraste o polegar na metade esquerda da tela para andar.' : settings.moveScheme === 'wasd' ? 'Ande com WASD ou as setas. Q, E e F são poderes, R é a ultimate, Z é o extra.' : settings.moveScheme === 'esdf' ? 'Ande com ESDF ou as setas. Q, W e R são poderes, A é o quarto, Z é o extra.' : 'Ande com as setas. Q, W, E e R são os poderes. Z é o extra.';
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
      return hint(input.touchMode ? 'Toque em IMPULSO para uma arrancada rápida. HAB usa a habilidade do personagem.' : `Espaço = impulso. ${keyLabel(settings.keys.ability)} = habilidade do personagem.`);
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
  $('#res-eyebrow').textContent = training() ? 'Treino concluído' : g.tiebreak ? 'Fim do desempate' : `${modeTitle(matchMode)} · fim da partida`;
  $('#res-rematch').hidden = true;
  $('#screen-results .btn[data-action=restart]').textContent = 'Revanche';
  delete ($('#screen-results .btn[data-action=restart]') as HTMLButtonElement).dataset.rematch;
  $('#screen-results .btn[data-action=select]').textContent = 'Trocar personagem';
  $('#res-title').textContent = g.mode === 'dupla'
    ? g.winners.length && g.winners.every((id) => g.players.find((p) => p.id === id)?.team === me.team)
      ? 'Seu time venceu!'
      : g.winners.length > 1 && new Set(g.winners.map((id) => g.players.find((p) => p.id === id)?.team)).size > 1
        ? 'EMPATE'
        : 'O outro time venceu'
    : g.winners.length === 1
      ? meWon
        ? 'Vitória!'
        : 'Derrota'
      : 'EMPATE';
  void shared;
  const list = $('#res-list');
  list.innerHTML = '';
  rank.forEach((p, i) => {
    const top = Object.entries(p.stats.uses).sort((a, b) => b[1] - a[1])[0];
    const sub = g.mode === 'dupla' ? `Time ${p.team ? 'Vermelho' : 'Azul'} · ${p.kills} eliminações · ${p.roundWins} rodadas` : `${p.kills} eliminações · ${p.roundWins} rodadas`;
    const pts = `${p.roundWins}`;
    void top;
    list.appendChild(resultRow(i, p.id === me.id ? `Você (${p.char.name})` : p.name, p.char.id, p.skin, sub, pts, p.id === me.id));
  });
  $('#res-highlight').textContent = g.highlight;
  $('#res-coins').hidden = true;
  if (training()) {
    settings.tutorialDone = true;
    saveSettings(settings);
  }
  if (g.mode === 'duelo' && g.winners.length !== 1) audio.roundMark('draw');
  else if (meWon || training()) audio.victory();
  else audio.defeat();
  audio.stopMusic();
  const placement = meWon ? 1 : rank.indexOf(me) + 1;
  const coins = await account.reward({ mode: matchMode, placement: Math.max(1, placement), players: Math.max(2, g.players.length), score: me.score, kills: me.kills, online: false });
  showCoins(coins);
  setTimeout(() => {
    if (game === g) show('screen-results');
  }, 900);
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
  $('#res-eyebrow').textContent = `Online · ${modeTitle(g.mode, 'online')}`;
  $('#res-title').textContent =
    g.mode === 'dupla'
      ? info.winners.some((id) => id === myId)
        ? 'Seu time venceu!'
        : info.winners.length
          ? 'O outro time venceu'
          : 'EMPATE'
      : info.winners.length === 1
        ? meWon
          ? 'Vitória!'
          : 'Derrota'
        : 'EMPATE';
  const list = $('#res-list');
  list.innerHTML = '';
  info.ranking.forEach((r, i) => {
    const sub = `${r.kills} eliminações · ${r.roundWins} rodadas`;
    list.appendChild(resultRow(i, r.id === myId ? `Você (${r.name})` : r.name, r.char, r.skin, sub, String(r.roundWins), r.id === myId));
  });
  $('#res-highlight').textContent = info.highlight;
  const coins = info.rewards[myId] ?? 0;
  showCoins(coins);
  if (!account.logged) {
    $('#res-coins').hidden = false;
    $('#res-coins').textContent = 'Entre na conta para ganhar moedas online';
  }
  account.addOnline(coins);
  if (g.mode === 'duelo' && info.winners.length !== 1) audio.roundMark('draw');
  else if (meWon) audio.victory();
  else audio.defeat();
  audio.stopMusic();
  rematchPending = false;
  $('#res-rematch').hidden = true;
  $('#res-rematch').textContent = '';
  const restart = $<HTMLButtonElement>('#screen-results .btn[data-action=restart]');
  const back = $('#screen-results .btn[data-action=select]');
  if (g.mode === 'duelo') {
    restart.textContent = 'Revanche';
    restart.dataset.rematch = '1';
    back.textContent = 'Voltar ao lobby';
  } else {
    restart.textContent = 'Voltar para a sala';
    delete restart.dataset.rematch;
    back.textContent = 'Trocar personagem';
  }
  setTimeout(() => {
    if (game === g) show('screen-results');
  }, 900);
}

// ------------------------------------------------------------------ laço principal
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function aimFoes(g: AnyGame) {
  const me = g.human;
  return g.players
    .filter((p) => p.alive && p.playing && g.hostile(me, p) && p.cloakT <= 0)
    .map((p) => ({ id: p.id, x: p.x, y: p.y - GUN_Y }));
}

function readInput(): Input {
  const i = input.read();
  const notebook = input.control === 'notebook' && !input.touchMode;
  const mouseOk = !input.touchMode && (notebook || performance.now() - input.mouse.at < 4000);
  if (game && game.combat && mouseOk) {
    const w = renderer.toWorld(input.mouse.x, input.mouse.y);
    const me = game.human;
    let ang = Math.atan2(w.y - (me.y - GUN_Y), w.x - me.x);
    if (notebook) {
      ang = input.smoothAim(ang);
      const foes = aimFoes(game);
      if (input.lockOn) {
        const near = nearestAim(me.x, me.y - GUN_Y, foes);
        if (near) ang = near.aim;
      } else ang = assistAim(ang, me.x, me.y - GUN_Y, foes);
    }
    i.aim = ang;
  }
  // celular: o analógico direito mira (independente do movimento); solto, a última direção continua
  const stickAim = input.manualAim();
  if (game && game.combat && stickAim !== null) i.aim = stickAim;
  // mira das habilidades: mouse (computador) ou arrasto do botão (toque)
  const pressed = (['ability', 'skill', 'ult', 'bonus', 'dash', 'item', 'plasma'] as Slot[]).find((k) => (i as any)[k]);
  if (game && pressed) {
    const me = game.human;
    if (i.touchCast) {
      i.ca = i.touchCast.ang;
      i.cr = i.touchCast.ratio * slotRange(pressed);
    } else if (notebook && game.combat) {
      const info = slotInfo(pressed);
      if (info.kind === 'direction') {
        const aim = typeof i.aim === 'number' ? i.aim : me.aim;
        i.ca = aim;
        i.cr = (info.range || 200) * 0.72;
      } else if (mouseOk) {
        const w = renderer.toWorld(input.mouse.x, input.mouse.y);
        i.ca = Math.atan2(w.y - me.y, w.x - me.x);
        i.cr = Math.hypot(w.x - me.x, w.y - me.y);
      }
    } else if (mouseOk && game.combat) {
      const w = renderer.toWorld(input.mouse.x, input.mouse.y);
      const oy = castOriginY(pressed, me.y);
      i.ca = Math.atan2(w.y - oy, w.x - me.x);
      i.cr = Math.hypot(w.x - me.x, w.y - oy);
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
  if (slot === 'plasma') {
    return { kind: 'direction', range: PLASMA.range, r: PLASMA.radius, w: 0, shape: 'arrow', name: PLASMA.name, color: PLASMA_COLOR };
  }
  if ((game.mode === 'duelo' || game.mode === 'dupla') && powerSlotIndex(slot) !== null) {
    const i = powerSlotIndex(slot)!;
    const pw = kitOf(me.char.id).powers[i];
    const instant = pw.speed <= 0;
    return {
      kind: instant ? 'instant' : 'direction',
      range: pw.range,
      r: pw.radius,
      w: 0,
      shape: instant ? 'circle' : 'arrow',
      name: pw.name,
      color: ELEMENT_COLOR[pw.element],
    };
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
/** Projétil sai na altura da arma. Área usa os pés, igual ao ponto do golpe. */
function castOriginY(slot: Slot, feetY: number) {
  return slotInfo(slot).kind === 'direction' ? feetY - GUN_Y : feetY;
}
function clipAim(x: number, feetY: number, ang: number, range: number, g: AnyGame) {
  const x1 = x + Math.cos(ang) * range;
  const y1 = feetY + Math.sin(ang) * range;
  const rects = g.iceWalls.length ? [...g.arena.walls, ...g.iceWalls] : g.arena.walls;
  const t = sweepCircle(x, feetY, x1, y1, 3, rects, g.arena.pillars, {
    minX: BORDER + 3,
    minY: BORDER + 3,
    maxX: WORLD_W - BORDER - 3,
    maxY: WORLD_H - BORDER - 3,
  });
  return t === null ? range : Math.max(0, t * range);
}
input.aimKind = (slot) => slotInfo(slot).kind;
input.canUse = (slot) => {
  if (!game) return true;
  if (game.phase !== 'play' || !game.human.alive) return false;
  const me = game.human;
  if (me.stunT > 0) return false;
  if (me.boss) {
    const map: Partial<Record<Slot, keyof typeof BOSS.skills>> = { ability: 'impacto', skill: 'barragem', ult: 'chuva', bonus: 'obsidiana', dash: 'avanco' };
    const k = map[slot];
    return !k || (me.bossCd[k] <= 0 && (game.bossPhase ?? 1) >= BOSS.skills[k].phase);
  }
  if ((game.mode === 'duelo' || game.mode === 'dupla') && (powerSlotIndex(slot) !== null || slot === 'plasma')) return deniedReason(slot) === '';
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
  if (why === 'Energia insuficiente' || why === 'Nenhum alvo válido' || why === 'Habilidade ainda não desbloqueada') toast(why, 1800);
  // no toque: aviso curto em cima do botão
  const btn = document.querySelector<HTMLElement>(`#btn-${slot === 'ability' ? 'ability' : slot}`);
  if (btn && input.touchMode) {
    btn.dataset.why = why;
    btn.classList.remove('denied');
    void btn.offsetWidth;
    btn.classList.add('denied');
  }
};
input.onLock = (on) => hint(on ? 'Mira travada no inimigo mais perto. C solta.' : null);
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
    if (game && settings.rangeIndicator === 'always' && powersMatch(game) && game.phase === 'play' && game.human.alive) {
      const me = game.human;
      const info = slotInfo('ability');
      const reach = clipAim(me.x, me.y, me.aim, info.range, game);
      renderer.aimPreview = { shape: 'arrow', x: me.x, y: me.y - GUN_Y, ang: me.aim, dist: reach, range: info.range, r: info.r, w: 0, color: info.color, label: info.name };
    } else renderer.aimPreview = null;
    return;
  }
  const me = game.human;
  const info = slotInfo(a.slot);
  const oy = castOriginY(a.slot, me.y);
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
    ang = Math.atan2(w.y - oy, w.x - me.x);
    dist = Math.hypot(w.x - me.x, w.y - oy);
  }
  const capped = info.shape === 'wall' && info.kind === 'direction' ? Math.max(50, Math.min(info.range, 70)) : Math.min(dist, info.range || dist);
  const reach = info.kind === 'direction' ? clipAim(me.x, oy + GUN_Y, ang, capped, game) : capped;
  const how = input.castMode === 'manual' || input.manualSlots.has(a.slot) ? 'clique para usar' : 'solte para usar';
  renderer.aimPreview = { shape: info.shape, x: me.x, y: oy, ang, dist: reach, range: info.range, r: info.r, w: info.w, color: info.color, label: `${info.name} · ${how}` };
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
  if (mundoCtl) {
    mundoCtl.frame(dt);
    requestAnimationFrame(frame);
    return;
  }
  if (game) {
    const g = game;
    if (g instanceof ClientGame) {
      const inp = currentScreen() === null ? readInput() : { mx: 0, my: 0, dash: false, ability: false };
      try {
        g.update(dt, inp);
      } catch (err) {
        console.error(err);
      }
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
  if (homeHero.running) return;
  if (!idleGame) {
    const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
    idleGame = new Game({ arena, humanChar: 'kael', bots: 3, difficulty: 'normal', ownEchoDamage: true, training: false, spectator: true, mode: 'dupla' });
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
  const root = $('#toasts');
  const same = [...root.querySelectorAll<HTMLElement>('.toast-item')].find((el) => el.dataset.msg === msg);
  if (same) {
    window.clearTimeout(Number(same.dataset.timer));
    same.dataset.timer = String(window.setTimeout(() => dismissToast(same), ms));
    return;
  }
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.dataset.msg = msg;
  const coin = /moeda/i.test(msg);
  el.innerHTML = `${coin ? '<span class="toast-coin" aria-hidden="true">🪙</span>' : ''}<span class="toast-text"></span>`;
  el.querySelector('.toast-text')!.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.dataset.timer = String(window.setTimeout(() => dismissToast(el), ms));
}

function dismissToast(el: HTMLElement) {
  if (!el.isConnected) return;
  window.clearTimeout(Number(el.dataset.timer));
  el.classList.remove('in');
  el.classList.add('out');
  window.setTimeout(() => el.remove(), 280);
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
let audioPrimed = false;
function primeAudio() {
  audio.unlock();
  if (audioPrimed) return;
  audioPrimed = true;
  applySettings();
  if (!game) audio.playMusic('menu');
  $('#title-foot').textContent = isNative ? 'Toque em Jogar para começar.' : isStandalone ? 'Jogando como app.' : 'Dica: instale o ECO na tela inicial para jogar em tela cheia.';
}
window.addEventListener('pointerdown', primeAudio);
document.addEventListener('touchend', primeAudio, { passive: true });
document.addEventListener('click', primeAudio);
window.addEventListener('keydown', primeAudio);

$('#rules-powers').innerHTML = POWERS.filter((p) => p.id !== 'ima').map((p) => `<li><span class="pdot" style="--c:${p.color}"></span><b style="color:${p.color}">${p.name}</b> ${p.desc}</li>`).join('');
bindOptions();
applySettings();
renderChip();
syncFavoriteWeapon();
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
  start: (char: string, arena: string, mode: MatchMode = 'dupla') => {
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
