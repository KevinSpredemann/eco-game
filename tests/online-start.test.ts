import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/sim';
import { getArena } from '../src/game/arenas';
import { ClientGame } from '../src/net/clientGame';
import { PROTO, encodeSnapshot } from '../src/net/protocol';
import { plannedLobbySize, protocolStatus, publicLobbyAction, showStartButton } from '../src/net/quickLobby';

describe('começar partida online', () => {
  it('sala pública sem relógio arma a busca de novo em vez de ficar em 0s', () => {
    const now = 1_000_000;
    const stuck = publicLobbyAction({ members: 2, max: 4, ready: 0, autoAt: 0, now });
    expect(stuck.action).toBe('arm');
    expect(stuck.autoAt).toBeGreaterThan(now);
    const armed = publicLobbyAction({ members: 2, max: 4, ready: 0, autoAt: stuck.autoAt, now: now + 1000 });
    expect(armed.action).toBe('wait');
    const due = publicLobbyAction({ members: 1, max: 2, ready: 0, autoAt: now, now: now + 1 });
    expect(due.action).toBe('start');
  });

  it('sala cheia ou todo mundo pronto começa; busca no meio espera', () => {
    const now = 5_000;
    expect(publicLobbyAction({ members: 2, max: 2, ready: 0, autoAt: now + 10_000, now }).action).toBe('start');
    expect(publicLobbyAction({ members: 2, max: 4, ready: 2, autoAt: now + 10_000, now }).action).toBe('start');
    expect(publicLobbyAction({ members: 1, max: 2, ready: 0, autoAt: now + 10_000, now }).action).toBe('wait');
  });

  it('o dono vê Começar quando a busca pública está parada', () => {
    expect(showStartButton(true, true, 0)).toBe(true);
    expect(showStartButton(true, true, undefined)).toBe(true);
    expect(showStartButton(true, true, 18)).toBe(false);
    expect(showStartButton(false, true, 0)).toBe(false);
    expect(showStartButton(true, false, undefined)).toBe(true);
  });

  it('a busca completa o 2x2 até 4; a sala privada continua no tamanho pedido', () => {
    expect(plannedLobbySize({ mode: 'duelo', humans: 1, bots: 0, fill: false })).toBe(2);
    expect(plannedLobbySize({ mode: 'duelo', humans: 1, bots: 0, fill: true })).toBe(2);
    expect(plannedLobbySize({ mode: 'dupla', humans: 1, bots: 3, fill: false })).toBe(4);
    expect(plannedLobbySize({ mode: 'dupla', humans: 2, bots: 0, fill: false })).toBe(2);
    expect(plannedLobbySize({ mode: 'dupla', humans: 2, bots: 0, fill: true })).toBe(4);
    expect(plannedLobbySize({ mode: 'dupla', humans: 1, bots: 0, fill: true })).toBe(4);
  });

  it('protocolo 12: ruptureT no fim do snapshot não quebra cliente novo nem linha antiga', () => {
    expect(PROTO).toBe(12);
    expect(protocolStatus(12, 12)).toBe('ok');
    expect(protocolStatus(12, 13)).toBe('client-old');
    expect(protocolStatus(12, 11)).toBe('server-old');
    const g = new Game({
      arena: getArena('lab'),
      humanChar: 'kael',
      bots: 0,
      difficulty: 'normal',
      ownEchoDamage: true,
      training: false,
      mode: 'duelo',
      roster: [
        { id: 'h', char: 'kael', isBot: false, name: 'H' },
        { id: 'b', char: 'luna', isBot: true, name: 'B' },
      ],
    });
    g.players[1].ruptureT = 1.2;
    const snap = encodeSnapshot(g, false);
    expect(snap.P[0]).toHaveLength(61);
    expect(snap.P[1].at(-1)).toBe(1.2);
    const cg = new ClientGame({
      you: 'h',
      mode: 'duelo',
      arena: 'lab',
      roster: [
        { id: 'h', char: 'kael', skin: 'padrao', trail: 'nenhum', name: 'H', isBot: false },
        { id: 'b', char: 'luna', skin: 'padrao', trail: 'nenhum', name: 'B', isBot: true },
      ],
    });
    cg.applySnapshot(snap, []);
    expect(cg.players[1].ruptureT).toBe(1.2);
    const old = { ...snap, P: snap.P.map((row) => row.slice(0, -1)) };
    expect(old.P[0]).toHaveLength(60);
    cg.applySnapshot(old, []);
    expect(cg.players[1].ruptureT).toBe(0);
    expect(cg.phase).toBe(g.phase);
  });
});
