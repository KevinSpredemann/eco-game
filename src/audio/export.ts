import { ARENAS } from '../game/arenas';
import { AudioEngine } from './audio';

/** Renderiza os efeitos e trilhas sintetizados em arquivos .wav (usado para gerar a pasta de sons). */
const SFX: [string, number, (e: AudioEngine) => void][] = [
  ['ui_clique', 0.3, (e) => e.click()],
  ['contagem_bipe', 0.4, (e) => e.tick(3)],
  ['contagem_final', 0.4, (e) => e.tick(1)],
  ['inicio_rodada', 0.8, (e) => e.go()],
  ['energia_coleta', 0.5, (e) => e.pickup(0)],
  ['energia_dourada', 0.9, (e) => e.pickup(0, true)],
  ['sorte_dobro', 0.6, (e) => e.lucky(0)],
  ['entrega_nucleo', 1.2, (e) => e.deliver(3, 0)],
  ['impulso', 0.5, (e) => e.dash(0)],
  ['dano', 0.6, (e) => e.hit(0)],
  ['dano_proprio_eco', 0.7, (e) => e.hit(0, true)],
  ['queda', 0.9, (e) => e.fall(0)],
  ['eliminado', 1.2, (e) => e.eliminated()],
  ['eco_surge', 1.6, (e) => e.echoSpawn()],
  ['gravacao_salva', 0.6, (e) => e.recordSave()],
  ['rebobinar', 2.4, (e) => e.rewind()],
  ['eco_dissipado', 1.2, (e) => e.echoExpired()],
  ['eco_desfeito', 0.5, (e) => e.disrupt(0)],
  ['perigo_aviso', 0.9, (e) => e.hazardWarn(0)],
  ['perigo_ativo', 0.8, (e) => e.hazardOn(0)],
  ['pistao', 0.5, (e) => e.piston(0)],
  ['ponte_aviso', 0.5, (e) => e.bridgeWarn(0)],
  ['portal', 0.6, (e) => e.portal(0)],
  ['nucleo_aviso', 1.0, (e) => e.coreWarn()],
  ['nucleo_muda', 0.6, (e) => e.coreMove()],
  ['dourado_aviso', 0.7, (e) => e.goldenWarn()],
  ['objetivo', 0.8, (e) => e.objective()],
  ['hab_turbo_kael', 0.7, (e) => e.ability('turbo', 0)],
  ['hab_fase_luna', 0.9, (e) => e.ability('fase', 0)],
  ['hab_escudo_bruno', 1.1, (e) => e.ability('escudo', 0)],
  ['hab_teleporte_zoe', 0.5, (e) => e.ability('teleporte', 0)],
  ['hab_explosao_maya', 0.9, (e) => e.ability('explosao', 0)],
  ['hab_clone_zed', 0.5, (e) => e.ability('clone', 0)],
  ['vitoria', 2.4, (e) => e.victory()],
  ['derrota', 1.4, (e) => e.defeat()],
];

const SR = 44100;

async function render(dur: number, fn: (e: AudioEngine) => void): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const e = new AudioEngine();
  e.vol = { master: 0.9, music: 1, sfx: 1, muted: false };
  e.attach(off);
  fn(e);
  return off.startRendering();
}

function wav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, SR, true);
  data.setUint32(28, SR * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  const bytes = new Uint8Array(data.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function exportAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, dur, fn] of SFX) out[`efeitos/${name}.wav`] = wav(await render(dur, fn));
  const loops: [string, 'menu' | 'game', (typeof ARENAS)[number]['music'] | null, number][] = [
    ['musica_menu', 'menu', null, 0],
    ...ARENAS.map((a) => [`musica_${a.id}`, 'game', a.music, 0.4] as [string, 'game', (typeof ARENAS)[number]['music'], number]),
  ];
  for (const [name, mode, theme, intensity] of loops) {
    const bpm = mode === 'menu' ? 96 : theme!.bpm + intensity * 14;
    const sd = 60 / bpm / 4;
    const bars = 8;
    const buf = await render(bars * 16 * sd + 1.5, (e) => {
      if (theme) e.theme = theme;
      e.mode = mode;
      e.intensity = intensity;
      for (let i = 0; i < bars * 16; i++) {
        e.bar = Math.floor(i / 16);
        e.playStep(i % 16, 0.02 + i * sd, sd);
      }
    });
    out[`musica/${name}.wav`] = wav(buf);
  }
  return out;
}
