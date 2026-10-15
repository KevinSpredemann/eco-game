import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PowerDef } from '../src/game/elements';
import { powerCardHtml } from '../src/ui/loadout';

const LONG_NAME = 'Rajada interminável do compasso quebrado no meio da frase';
const LONG_LINE = 'Este efeito curto precisa quebrar dentro do card sem invadir o vizinho, o filtro ou a ficha, mesmo quando a frase continua por várias linhas e mistura dano, alcance e recarga.';

const stress: PowerDef = {
  name: LONG_NAME,
  element: 'lightning',
  cd: 12.5,
  dmg: 48,
  range: 640,
  speed: 900,
  radius: 18,
  category: 'attack',
};

describe('layout dos cards de poder', () => {
  it('nome e descrição longos cabem no card, com categoria e sem a letra da tecla', () => {
    const html = powerCardHtml(stress, {
      state: 'available',
      why: '',
      selected: true,
      linked: false,
      ult: false,
      attrs: 'data-sec="stress"',
      slot: -1,
      cost: 30,
      line: LONG_LINE,
    });
    expect(html).toContain(LONG_NAME);
    expect(html).toContain(LONG_LINE);
    expect(html).toContain('Dano · Raio');
    expect(html).toContain('pw-name');
    expect(html).toContain('pw-meta');
    expect(html).toContain('pw-chips');
    expect(html).toContain('>Selecionado<');
    expect(html).toContain('Dano');
    expect(html).toContain('Alcance');
    expect(html).toContain('Energia');
    expect(html).toContain('Recarga');
    expect(html).not.toContain('>Q<');
    expect(html).not.toContain('Q ·');
    expect(html.indexOf('pv-')).toBeLessThan(html.indexOf('pw-name'));
  });

  it('a grade, a ficha e as sinergias rolam cada uma no seu quadro', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('poderes: a tela cabe no viewport'));
    expect(block).toContain('repeat(auto-fill, minmax(220px, 1fr))');
    expect(block).toContain('minmax(0, 1fr)');
    expect(block).toContain('min-height: 0');
    expect(block).toContain('min-width: 0');
    expect(block).toContain('.pw-scroll');
    expect(block).toContain('.pw-syn');
    expect(block).toContain('.pw-actions');
    expect(block).toContain('overflow-wrap: anywhere');
    expect(block).toContain('height: max-content');
    expect(block).not.toContain('margin-top: -');
    expect(block).not.toContain('margin-left: -');
  });
});
