import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heroFit } from '../src/ui/homeHero';
import { slotFlags, type SlotView } from '../src/ui/skillbar';

describe('qualidade da home e da barra', () => {
  it('o herói continua nos 78% e a respiração não entra na conta do tamanho', () => {
    expect(heroFit(200, 100, 20, 10)).toBeCloseTo(Math.min((200 * 0.78) / 20, (100 * 0.9) / 10));
    const src = readFileSync(new URL('../src/ui/homeHero.ts', import.meta.url), 'utf8');
    expect(src).toContain('heroFit(maxH, maxW, spanH, spanW)');
    expect(src).toContain('footLine');
    expect(src).toContain('imageSmoothingQuality = \'high\'');
  });

  it('a barra cabe menor e separa sem energia de recarga', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('width: 86px');
    expect(css).toContain('min-height: 72px');
    expect(css).toContain('conic-gradient');
    expect(css).toContain('.skillbar .sk.dry .sk-cd { background: none; }');
    const base = { id: 'ability', key: 'Q', name: 'Rajada', art: { kind: 'symbol' as const, id: 'kael', color: '#fff' }, color: '#7dffe0', cd: 0, secs: 0, desc: '' };
    const dry: SlotView = { ...base, dry: true, cost: 18 };
    const cool: SlotView = { ...base, cd: 0.4, secs: 1.2 };
    expect(slotFlags(dry).dry).toBe(true);
    expect(slotFlags(dry).cool).toBe(true);
    expect(slotFlags(cool).dry).toBe(false);
    expect(slotFlags(cool).cool).toBe(true);
  });

  it('a tela de poderes continua um painel, com ícone na cor do elemento', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('poderes: a tela cabe no viewport'));
    expect(block).toContain('max-width: 1080px');
    expect(block).toContain('height: min(700px, calc(100vh - 32px))');
    expect(block).not.toContain('max-width: none');
    expect(block).toContain('color: var(--el, var(--pw))');
  });
});
