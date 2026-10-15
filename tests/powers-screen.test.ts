import { describe, expect, it } from 'vitest';
import { KITS, STUDIO, kitOf, type PowerDef } from '../src/game/elements';
import { kitSynergies, listSynergies, relevantFacts, resolveReaction, swapDelta, type HitQuery } from '../src/game/combos';
import { PREVIEW_KINDS, previewHtml, previewOf } from '../src/ui/powerPreview';

const KINDS = new Set<string>(PREVIEW_KINDS);

function namesFromRules(): Set<string> {
  const names = new Set<string>();
  for (const id of Object.keys(KITS)) for (const card of kitSynergies(id)) names.add(card.name);
  const auras = [
    { burn: 1, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 1, gust: 0, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 1, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 1, root: 0, marked: 0, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 0, root: 1, marked: 0, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 1, field: 0, fieldEl: '' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 1, fieldEl: 'nature' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 1, fieldEl: 'ice' as const, stun: 0 },
    { burn: 0, frozen: 0, gust: 0, shock: 0, root: 0, marked: 0, field: 0, fieldEl: '' as const, stun: 1 },
  ];
  const powers = [...Object.values(KITS).flatMap((kit) => kit.powers), ...STUDIO];
  for (const charId of Object.keys(KITS)) {
    for (const pw of powers) {
      for (const aura of auras) {
        const q: HitQuery = {
          charId,
          element: pw.element,
          aoe: pw.speed <= 0 && !pw.act,
          projectile: pw.speed > 0,
          slot: pw.charge ? 2 : 0,
          appliesMark: !!pw.mark,
          roots: pw.element === 'nature',
          aura,
          marked: aura.marked,
          field: aura.field,
          fieldEl: aura.fieldEl,
          stun: aura.stun,
          reactCd: 0,
        };
        const hit = resolveReaction(q);
        if (hit) names.add(hit.name);
        q.slot = 2;
        const ult = resolveReaction(q);
        if (ult) names.add(ult.name);
        q.slot = -1;
        const extra = resolveReaction(q);
        if (extra) names.add(extra.name);
      }
    }
  }
  return names;
}

describe('prévia dos poderes', () => {
  const all: PowerDef[] = [...Object.values(KITS).flatMap((kit) => kit.powers), ...STUDIO];

  it('cada poder tem um desenho do efeito, sem letra e sem arquivo', () => {
    for (const pw of all) {
      const face = previewOf(pw);
      expect(KINDS.has(face.kind)).toBe(true);
      expect(face.kind).not.toBe('empty');
      const html = previewHtml(pw, 'lg');
      expect(html).toContain(`pv-${face.kind}`);
      expect(html).not.toContain('<img');
      expect(html).not.toMatch(/>\s*[QEFRZ]\s*</);
    }
  });

  it('os exemplos batem com o efeito de cada golpe', () => {
    const nara = kitOf('nara').powers;
    expect(previewHtml(nara[0])).toContain('pv-seed');
    expect(previewHtml(nara[1])).toContain('pv-roots');
    expect(previewHtml(nara[3])).toContain('pv-grove');
    expect(previewHtml(nara[2])).toContain('pv-sprout');
    expect(previewHtml(STUDIO.find((s) => s.id === 'plasma')!)).toContain('pv-plasma');
    expect(previewHtml(STUDIO.find((s) => s.id === 'arpejo')!)).toContain('pv-wave');
    expect(previewHtml(STUDIO.find((s) => s.id === 'glissando')!)).toContain('pv-streak');
    expect(previewHtml(STUDIO.find((s) => s.id === 'fermata')!)).toContain('pv-hold');
  });
});

describe('ficha e sinergia da tela', () => {
  const allowed = namesFromRules();

  it('Nara fecha as três oficiais e Kai separa ativa, bloqueada e possível', () => {
    const nara = listSynergies('nara', null);
    for (const name of ['Raiz firme', 'Descarga', 'Suprema no controle']) {
      expect(nara.find((row) => row.name === name)?.state).toBe('active');
    }
    const kai = listSynergies('kai', null);
    expect(kai.find((row) => row.name === 'Estilhaçar')?.state).toBe('active');
    expect(kai.find((row) => row.name === 'Raiz firme')?.state).toBe('locked');
    expect(kai.find((row) => row.name === 'Ruptura')?.state).toBe('possible');
    expect(listSynergies('kai', 'plasma').find((row) => row.name === 'Ruptura')?.state).toBe('active');
  });

  it('não inventa nome fora do resolvedor', () => {
    for (const id of Object.keys(KITS)) {
      for (const secondary of [null, 'plasma', 'fermata'] as const) {
        for (const row of listSynergies(id, secondary)) expect(allowed.has(row.name)).toBe(true);
      }
    }
  });

  it('a ficha esconde campo vazio e usa o dano do combate', () => {
    const nara = kitOf('nara').powers;
    const shot = relevantFacts(nara[0], 0, 18);
    expect(shot.some((f) => f.label === 'Área')).toBe(false);
    expect(shot.some((f) => f.value === 'no acerto')).toBe(false);
    const root = relevantFacts(nara[1], 1, 24);
    expect(root).toContainEqual({ label: 'Dano', value: '15' });
    expect(root).toContainEqual({ label: 'Duração', value: '1.3s' });
    const ult = relevantFacts(nara[2], 2, 30);
    expect(ult).toContainEqual({ label: 'Dano', value: '30' });
    expect(ult).toContainEqual({ label: 'Energia', value: 'carga' });
  });

  it('a troca do Z só descreve o que a regra muda', () => {
    const before = kitOf('kai').powers[0].dmg;
    const delta = swapDelta('kai', null, 'plasma');
    expect(kitOf('kai').powers[0].dmg).toBe(before);
    expect(listSynergies('kai', null).find((row) => row.name === 'Ruptura')?.state).toBe('possible');
    expect(delta.key).toBe('Z');
    expect(delta.added).toBe('Rajada de Plasma');
    expect(delta.removed).toBe('vazio');
    expect(delta.gained).toContain('Ruptura');
    expect(delta.lost).not.toContain('Ruptura');
    expect(delta.limit).toBe('Q, E, F e R não trocam. Só o Z aceita um extra.');
  });
});
