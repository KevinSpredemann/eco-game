import { describe, expect, it } from 'vitest';
import { getCharacter } from '../src/game/characters';
import { STUDIO, kitOf } from '../src/game/elements';
import { STUDIO_ARENAS } from '../src/game/studioArenas';

/** Nomes do índice do Estúdio ECO. Os ids do jogo ficam curtos de propósito. */
const CHARS: { id: string; name: string; title: string; q: string; ability: string }[] = [
  { id: 'clave', name: 'Clave', title: 'A Clave', q: 'Assinatura da Clave', ability: 'escudo' },
  { id: 'fuga', name: 'Fuga', title: 'A Fuga', q: 'Entrada da Fuga', ability: 'teleporte' },
  { id: 'lyra', name: 'Lyra', title: 'A Harmônica', q: 'Corda Harmônica', ability: 'muralha' },
  { id: 'metra', name: 'Metra', title: 'A Compasso', q: 'Pulso do Metrônomo', ability: 'raio' },
  { id: 'resona', name: 'Resona', title: 'A Ressonante', q: 'Pulsar Sônico', ability: 'explosao' },
  { id: 'rufo', name: 'Rufo', title: 'O Tambor', q: 'Rufar', ability: 'investida' },
  { id: 'solfa', name: 'Solfa', title: 'A Escala', q: 'Escada de Notas', ability: 'turbo' },
  { id: 'vibra', name: 'Vibra', title: 'A Vibração', q: 'Campo Vibrato', ability: 'gravidade' },
  { id: 'sibilo', name: 'Sibilo', title: 'O Sussurro', q: 'Sussurro Falso', ability: 'clone' },
  { id: 'sibilo2', name: 'Sibilo', title: 'O Sussurro (versão triangular)', q: 'Sussurro Falso', ability: 'sombra' },
];

const EXTRAS: { id: string; name: string }[] = [
  { id: 'arpejo', name: 'Arpejo' },
  { id: 'crescendo', name: 'Crescendo' },
  { id: 'fermata', name: 'Fermata' },
  { id: 'glissando', name: 'Glissando' },
  { id: 'ostinato', name: 'Ostinato' },
  { id: 'prisma', name: 'Prisma de Eco' },
  { id: 'reverso', name: 'Reverso Harmônico' },
  { id: 'staccato', name: 'Staccato' },
];

const MAPS: { id: string; name: string }[] = [
  { id: 'anfiteatro', name: 'Anfiteatro Harmônico' },
  { id: 'biblioteca', name: 'Biblioteca de Partituras' },
  { id: 'camara', name: 'Câmara Anecoica' },
  { id: 'caverna', name: 'Caverna Ressonante' },
  { id: 'jardim', name: 'Jardim dos Diapasões' },
  { id: 'vinil', name: 'Pista do Vinil' },
  { id: 'recife', name: 'Recife da Maré' },
  { id: 'metronomo', name: 'Torre do Metrônomo' },
];

describe('nomes do Estúdio ECO', () => {
  it('personagem, título e Q usam o texto do pack, com o id antigo', () => {
    for (const row of CHARS) {
      const c = getCharacter(row.id);
      expect(c.id, row.id).toBe(row.id);
      expect(c.name, row.id).toBe(row.name);
      expect(c.title, row.id).toBe(row.title);
      expect(c.ability.id, row.id).toBe(row.ability);
      expect(c.ability.name, row.id).toBe(row.q);
      expect(c.ability.label, row.id).toBe(row.q);
      expect(kitOf(row.id).powers[0].name, row.id).toBe(row.q);
    }
  });

  it('poderes extras usam o nome do pack e o id que o save já guarda', () => {
    for (const row of EXTRAS) {
      const pw = STUDIO.find((s) => s.id === row.id);
      expect(pw, row.id).toBeTruthy();
      expect(pw!.id).toBe(row.id);
      expect(pw!.name).toBe(row.name);
    }
    expect(STUDIO.some((s) => s.id === 'prisma-de-eco' || s.id === 'reverso-harmonico')).toBe(false);
  });

  it('mapas usam o nome do pack e o id curto da arena', () => {
    for (const row of MAPS) {
      const a = STUDIO_ARENAS.find((s) => s.id === row.id);
      expect(a, row.id).toBeTruthy();
      expect(a!.id).toBe(row.id);
      expect(a!.name).toBe(row.name);
    }
  });
});
