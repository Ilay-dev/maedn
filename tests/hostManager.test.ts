import { describe, expect, it } from 'vitest';
import type { ClientRoomState } from '../shared/types.ts';
import { BrowserHostManager } from '../src/p2p/hostManager.ts';

describe('BrowserHostManager (MAEDN P2P)', () => {
  it('supports 2 to 4 players including bots and rejects a 5th player', () => {
    const latest = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'TEST99',
      'Host',
      (peerId, state) => latest.set(peerId, state),
      () => {}
    );

    const g1 = manager.joinGuest('peer-1', 'Anna');
    const g2 = manager.joinGuest('peer-2', 'Ben');
    expect(g1.ok).toBe(true);
    expect(g2.ok).toBe(true);

    const addBot = manager.handleAction('HOST_LOCAL', 'room:add_bot');
    expect(addBot.ok).toBe(true);
    expect(manager.room.players).toHaveLength(4);

    // 5th player / bot must be rejected
    const extraGuest = manager.joinGuest('peer-3', 'Clara');
    expect(extraGuest.ok).toBe(false);
    const extraBot = manager.handleAction('HOST_LOCAL', 'room:add_bot');
    expect(extraBot.ok).toBe(false);

    manager.destroy();
  });

  it('starts a 2-player match cleanly with opposite seats and synchronizes rolls', () => {
    const latest = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'DUO123',
      'Host',
      (peerId, state) => latest.set(peerId, state),
      () => {}
    );

    manager.joinGuest('peer-1', 'Guest');
    manager.startNewMatch();

    const hostState = latest.get('HOST_LOCAL')!;
    const guestState = latest.get('peer-1')!;
    expect(hostState.phase).toBe('playing');
    expect(hostState.players.map((p) => p.seat)).toEqual([0, 2]);
    expect(guestState.currentPlayerId).toBe(hostState.myPlayerId);

    // Host rolls dice
    const rollRes = manager.handleAction('HOST_LOCAL', 'game:roll');
    expect(rollRes.ok).toBe(true);
    const updatedGuest = latest.get('peer-1')!;
    const updatedHostPlayer = updatedGuest.players.find((p) => p.id === hostState.myPlayerId)!;
    expect(updatedGuest.lastRoll).not.toBeNull();
    expect(updatedGuest.lastRollPlayerId).toBe(hostState.myPlayerId);
    expect(updatedHostPlayer.lastRoll).toBe(updatedGuest.lastRoll);
    expect(updatedHostPlayer.lastRollSerial).toBe(1);

    manager.destroy();
  });

  it('supports 3-player seat assignment and disconnected turn skipping', () => {
    const latest = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'TRI321',
      'Host',
      (peerId, state) => latest.set(peerId, state),
      () => {}
    );

    const g1 = manager.joinGuest('peer-1', 'Mia');
    manager.joinGuest('peer-2', 'Leo');
    manager.startNewMatch();

    const state = latest.get('HOST_LOCAL')!;
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2]);

    // Move turn onto Mia (peer-1) and disconnect her
    manager.room.game!.currentTurnOrderIndex = 1;
    manager.handlePeerDisconnect('peer-1');
    const miaId = g1.credentials!.playerId;
    expect(latest.get('HOST_LOCAL')!.players.find((p) => p.id === miaId)?.connected).toBe(false);

    const skipRes = manager.handleAction('HOST_LOCAL', 'room:skip_disconnected', {
      targetPlayerId: miaId,
    });
    expect(skipRes.ok).toBe(true);
    expect(latest.get('HOST_LOCAL')!.currentPlayerId).not.toBe(miaId);

    manager.destroy();
  });
});

