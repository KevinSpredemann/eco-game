import { describe, expect, it } from 'vitest';
import { kitOf } from '../src/game/elements';
import { UI_TINT, markHtml, previewHtml } from '../src/ui/powerPreview';
import { slotFlags, type SlotView } from '../src/ui/skillbar';

function slot(over: Partial<SlotView>): SlotView {
  return {
    id: 'ability',
    key: 'Q',
    name: 'Semente',
    art: { kind: 'symbol', id: 'nara', color: '#fff' },
    color: '#fff',
    cd: 0,
    secs: 0,
    desc: '',
    ...over,
  };
}

describe('ícones da barra e da tela', () => {
  it('o mesmo desenho vetorial serve os dois lugares', () => {
    const nara = kitOf('nara').powers;
    const seed = previewHtml(nara[0], 'sm');
    const roots = previewHtml(nara[1], 'sm');
    expect(seed).toContain('<svg');
    expect(seed).toContain('pv-seed');
    expect(seed).not.toContain('<img');
    expect(roots).toContain('pv-roots');
    expect(seed).not.toBe(roots);
    expect(markHtml('basic', '#d7e2ff')).toContain('pv-basic');
    expect(markHtml('impulse', '#9ad8ff')).toContain('pv-impulse');
  });

  it('a paleta da interface segue o elemento', () => {
    expect(UI_TINT.plasma).toBe('#d24cff');
    expect(UI_TINT.nature).toBe('#2fbf6a');
    expect(UI_TINT.ice).toBe('#5ee7ff');
    expect(UI_TINT.lightning).toBe('#3aa0ff');
    expect(UI_TINT.fire).toBe('#ff5a32');
    expect(previewHtml(kitOf('nara').powers[0])).toContain(UI_TINT.nature);
    expect(previewHtml(kitOf('vortex').powers[0])).toContain(UI_TINT.plasma);
  });
});

describe('estados da carta', () => {
  it('pronta, sem energia, mirando, suprema carregada e combo', () => {
    expect(slotFlags(slot({})).ready).toBe(true);
    expect(slotFlags(slot({ secs: 2, cd: 0.4 })).cool).toBe(true);
    expect(slotFlags(slot({ dry: true })).ready).toBe(false);
    expect(slotFlags(slot({ dry: true })).dry).toBe(true);
    const aim = slotFlags(slot({ aiming: true, aim: 'bad' }));
    expect(aim.aiming).toBe(true);
    expect(aim.aimBad).toBe(true);
    expect(aim.aimOk).toBe(false);
    const ult = slotFlags(slot({ charge: 100 }));
    expect(ult.ult).toBe(true);
    expect(ult.charged).toBe(true);
    expect(ult.ready).toBe(true);
    expect(slotFlags(slot({ charge: 40 })).ready).toBe(false);
    expect(slotFlags(slot({ hot: true })).combo).toBe(true);
  });
});
