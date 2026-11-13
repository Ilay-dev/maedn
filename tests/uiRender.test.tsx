import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientRoomState } from '../shared/types.ts';
import { HomeScreen } from '../src/components/HomeScreen.tsx';
import { LobbyScreen } from '../src/components/LobbyScreen.tsx';
import { GameTable } from '../src/components/GameTable.tsx';
import { BrowserHostManager } from '../src/p2p/hostManager.ts';

const noopAsync = async () => ({ ok: true });

describe('MAEDN UI components smoke render', () => {
  it('always offers "Neuen Room erstellen" even when opened with an invite room code', () => {
    const htmlNormal = renderToString(
      <HomeScreen
        connected
        initialRoomCode=""
        errorMessage={null}
        onCreateRoom={async () => {}}
        onJoinRoom={async () => {}}
        onClearInvite={() => {}}
        onClearError={() => {}}
      />
    );
    expect(htmlNormal).toContain('Neuen Room erstellen');
    expect(htmlNormal).toContain('Mit Room-Code beitreten');

    const htmlInvite = renderToString(
      <HomeScreen
        connected
        initialRoomCode="ABC123"
        errorMessage={null}
        onCreateRoom={async () => {}}
        onJoinRoom={async () => {}}
        onClearInvite={() => {}}
        onClearError={() => {}}
      />
    );
    expect(htmlInvite).toContain('ABC123');
    expect(htmlInvite).toContain('Room beitreten');
    expect(htmlInvite).toContain('Neuen Room erstellen');
  });

  it('renders LobbyScreen and GameTable with active per-player dice and board without throwing', () => {
    let latestState: ClientRoomState | null = null;
    const manager = new BrowserHostManager(
      'LIVE42',
      'Leon',
      (peerId, state) => {
        if (peerId === 'HOST_LOCAL') latestState = state;
      },
      () => {}
    );

    manager.handleAction('HOST_LOCAL', 'room:add_bot');
    expect(latestState).not.toBeNull();

    const lobbyHtml = renderToString(
      <LobbyScreen
        room={latestState!}
        connected
        onToggleReady={() => {}}
        onAddBot={() => {}}
        onRemovePlayer={() => {}}
        onLeave={() => {}}
      />
    );
    expect(lobbyHtml).toContain('LIVE42');
    expect(lobbyHtml).toContain('Leon');

    manager.startNewMatch();
    manager.handleAction('HOST_LOCAL', 'game:roll');
    expect(latestState!.phase).toBe('playing');

    const tableHtml = renderToString(
      <GameTable
        room={latestState!}
        connected
        soundEnabled
        onToggleSound={() => {}}
        onRollDice={noopAsync}
        onMovePawn={noopAsync}
        onToggleReady={() => {}}
        onSkipDisconnected={() => {}}
        onReturnToLobby={() => {}}
        onLeave={() => {}}
        onPlayDiceSound={() => {}}
        onPlayStepSound={() => {}}
        onPlayCaptureSound={() => {}}
        onPlayGoalSound={() => {}}
        onPlayTurnSound={() => {}}
        onPlayRejectSound={() => {}}
        onPlayWinSound={() => {}}
      />
    );
    expect(tableHtml).toContain('Mensch, ärgere dich nicht Spielbrett');
    expect(tableHtml).toContain('würfelte');

    manager.destroy();
  });
});
