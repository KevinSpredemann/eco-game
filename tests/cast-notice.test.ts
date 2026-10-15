import { describe, expect, it } from 'vitest';
import { CastNotifier, noticeOf } from '../src/ui/castNotice';

describe('avisos de conjuração', () => {
  it('cada recusa real vira um texto e um tom', () => {
    expect(noticeOf('Fora de alcance')).toMatchObject({ text: 'ALCANCE INSUFICIENTE', tone: 'amber' });
    expect(noticeOf('Energia insuficiente')).toMatchObject({ text: 'SEM ENERGIA', tone: 'red', persist: true });
    expect(noticeOf('Habilidade em recarga', 1.25)?.text).toBe('EM RECARGA (disponivel em 1,3s)');
    expect(noticeOf('Habilidade em recarga', 1.25)?.tone).toBe('amber');
    expect(noticeOf('Obstáculo')).toMatchObject({ text: 'SEM LINHA DE VISAO', tone: 'amber' });
    expect(noticeOf('Mira fora do alcance')).toMatchObject({ text: 'MIRA FORA DO ALCANCE', tone: 'cyan', persist: true });
    expect(noticeOf('Nenhum alvo válido')).toMatchObject({ text: 'ALVO INVALIDO', tone: 'amber' });
    expect(noticeOf('Conjuração interrompida')).toMatchObject({ text: 'CONJURACAO INTERROMPIDA', tone: 'amber' });
    expect(noticeOf('Ultimate em carga')).toMatchObject({ text: 'CARGA INSUFICIENTE', tone: 'cyan' });
    expect(noticeOf('isto não existe')).toBeNull();
  });

  it('um aviso por vez, o mesmo motivo atualiza no lugar e some quando passa', () => {
    const n = new CastNotifier();
    n.show(noticeOf('Habilidade em recarga', 2)!);
    const gen = n.generation;
    n.show(noticeOf('Habilidade em recarga', 1.4)!);
    expect(n.generation).toBe(gen);
    expect(n.current?.text).toBe('EM RECARGA (disponivel em 1,4s)');
    n.show(noticeOf('Energia insuficiente')!);
    expect(n.generation).toBe(gen + 1);
    expect(n.current?.text).toBe('SEM ENERGIA');
    n.clear('cd');
    expect(n.current?.text).toBe('SEM ENERGIA');
    n.clear('energy');
    expect(n.current).toBeNull();
    n.show(noticeOf('Nenhum alvo válido')!);
    n.tick(1.8);
    expect(n.current).toBeNull();
  });
});
