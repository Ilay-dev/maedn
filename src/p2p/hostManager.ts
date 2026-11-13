import { SEAT_COLORS } from '../../shared/board.js';
import {
  type InternalMaednGame,
  type InternalMaednPlayer,
  buildMatchSummary,
  countGoalPawns,
  createInitialPawns,
  decideBotMove,
  executeMove,
  performRollDice,
  pushEvent,
  secureRandomInt,
  skipCurrentTurn,
  startMatch,
} from '../../shared/gameEngine.js';
import type {
  ClientRoomState,
  MatchSummary,
  PublicMaednPlayer,
  RoomActionResponse,
  RoomPhase,
  SessionCredentials,
} from '../../shared/types.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Nova (Bot)', 'Kairo (Bot)', 'Vega (Bot)', 'Echo (Bot)'];
export const MAX_PLAYERS = 4;

export interface BrowserMaednRoom {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: InternalMaednPlayer[];
  countdownSeconds: number | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  game: InternalMaednGame | null;
  matchSummary: MatchSummary | null;
}

export type PeerSendFn = (peerId: string, state: ClientRoomState) => void;
export type PeerKickFn = (peerId: string, reason: string) => void;

export function generateBrowserRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_ALPHABET[secureRandomInt(0, ROOM_ALPHABET.length)];
  }
  return code;
}

export class BrowserHostManager {
  public readonly room: BrowserMaednRoom;
  private onBroadcast: PeerSendFn;
  private onKicked: PeerKickFn;

  constructor(
    roomCode: string,
    hostName: string,
    onBroadcast: PeerSendFn,
    onKicked: PeerKickFn
  ) {
    this.onBroadcast = onBroadcast;
    this.onKicked = onKicked;

    const hostId = globalThis.crypto.randomUUID();
    const host: InternalMaednPlayer = {
      id: hostId,
      name: this.sanitizeName(hostName),
      isHost: true,
      isBot: false,
      isReady: false,
      connected: true,
      reconnectToken: globalThis.crypto.randomUUID(),
      socketId: 'HOST_LOCAL',
      seat: null,
      color: null,
      pawns: createInitialPawns(),
      capturesCount: 0,
      lastRoll: null,
      lastRollSerial: 0,
    };

    this.room = {
      code: roomCode,
      phase: 'lobby',
      hostId,
      players: [host],
      countdownSeconds: null,
      countdownTimer: null,
      botTimer: null,
      game: null,
      matchSummary: null,
    };
  }

  public getHostPlayerId(): string {
    return this.room.hostId;
  }

  public destroy(): void {
    this.clearCountdown();
    this.clearBotTimer();
  }

  private sanitizeName(rawName: string): string {
    const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
    return cleaned || 'Spieler';
  }

  private uniqueName(baseName: string): string {
    const existing = new Set(this.room.players.map((p) => p.name.toLowerCase()));
    if (!existing.has(baseName.toLowerCase())) return baseName;
    for (let i = 2; i <= 20; i++) {
      const candidate = `${baseName.slice(0, 16)} (${i})`;
      if (!existing.has(candidate.toLowerCase())) return candidate;
    }
    return `${baseName.slice(0, 14)}-${secureRandomInt(10, 99)}`;
  }

  private clearCountdown(): void {
    if (this.room.countdownTimer) {
      clearInterval(this.room.countdownTimer);
      this.room.countdownTimer = null;
    }
    this.room.countdownSeconds = null;
  }

  private clearBotTimer(): void {
    if (this.room.botTimer) {
      clearTimeout(this.room.botTimer);
      this.room.botTimer = null;
    }
  }

  public broadcast(): void {
    for (const player of this.room.players) {
      if (player.socketId && player.connected) {
        this.onBroadcast(player.socketId, this.serializeForPlayer(player.id));
      }
    }
  }

  public serializeForPlayer(playerId: string): ClientRoomState {
    const game = this.room.game;
    const currentPlayerId =
      game && game.activeSeatOrder.length > 0
        ? game.activeSeatOrder[game.currentTurnOrderIndex] ?? null
        : null;

    const publicPlayers: PublicMaednPlayer[] = this.room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isBot: p.isBot,
      isReady: p.isReady,
      connected: p.connected,
      seat: p.seat,
      color: p.color,
      pawns: p.pawns.map((pawn) => ({ ...pawn })),
      capturesCount: p.capturesCount,
      goalsCount: countGoalPawns(p),
      lastRoll: p.lastRoll,
      lastRollSerial: p.lastRollSerial,
    }));

    const isMyTurn =
      this.room.phase === 'playing' &&
      game !== null &&
      currentPlayerId === playerId;

    return {
      roomCode: this.room.code,
      phase: this.room.phase,
      myPlayerId: playerId,
      hostId: this.room.hostId,
      players: publicPlayers,
      countdownSeconds: this.room.countdownSeconds,
      turnNumber: game?.turnNumber ?? 0,
      currentPlayerId,
      turnPhase: game?.turnPhase ?? 'waiting_roll',
      lastRoll: game?.lastRoll ?? null,
      lastRollPlayerId: game?.lastRollPlayerId ?? null,
      rollSerial: game?.rollSerial ?? 0,
      rollsUsed: game?.rollsUsed ?? 0,
      maxRollsAllowed: game?.maxRollsAllowed ?? 1,
      legalMoves: isMyTurn && game ? game.legalMoves.map((m) => ({ ...m })) : [],
      lastMovedPawn: game?.lastMovedPawn ?? null,
      matchSummary: this.room.matchSummary,
      lastEvent: game?.eventLog[0] ?? null,
      eventLog: game?.eventLog ?? [],
    };
  }

  private findPlayerByPeer(peerId: string): InternalMaednPlayer | undefined {
    return this.room.players.find((p) => p.socketId === peerId);
  }

  public joinGuest(peerId: string, rawName: string): RoomActionResponse {
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'In diesem Room läuft bereits eine Partie.' };
    }
    if (this.room.players.length >= MAX_PLAYERS) {
      return { ok: false, error: 'Der Room ist bereits voll (max. 4 Spieler).' };
    }

    const playerId = globalThis.crypto.randomUUID();
    const reconnectToken = globalThis.crypto.randomUUID();
    const name = this.uniqueName(this.sanitizeName(rawName));

    const player: InternalMaednPlayer = {
      id: playerId,
      name,
      isHost: false,
      isBot: false,
      isReady: false,
      connected: true,
      reconnectToken,
      socketId: peerId,
      seat: null,
      color: null,
      pawns: createInitialPawns(),
      capturesCount: 0,
      lastRoll: null,
      lastRollSerial: 0,
    };

    this.room.players.push(player);
    this.clearCountdown();
    this.broadcast();

    return {
      ok: true,
      credentials: { roomCode: this.room.code, playerId, reconnectToken },
    };
  }

  public rejoinGuest(peerId: string, creds: SessionCredentials): RoomActionResponse {
    if (creds.roomCode.trim().toUpperCase() !== this.room.code) {
      return { ok: false, error: 'Falscher Room-Code.' };
    }
    const player = this.room.players.find(
      (p) => p.id === creds.playerId && p.reconnectToken === creds.reconnectToken
    );
    if (!player) {
      return { ok: false, error: 'Sitzung abgelaufen.' };
    }
    player.socketId = peerId;
    player.connected = true;
    this.broadcast();
    return { ok: true, credentials: creds };
  }

  public handlePeerDisconnect(peerId: string): void {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return;

    if (this.room.phase === 'lobby') {
      this.removePlayerInternal(player.id, `${player.name} hat die Lobby verlassen.`);
      return;
    }

    player.connected = false;
    this.broadcast();
  }

  public leaveGuest(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: true };
    this.removePlayerInternal(player.id, `${player.name} hat das Spiel verlassen.`);
    return { ok: true };
  }

  private removePlayerInternal(playerId: string, reasonMessage: string): void {
    const idx = this.room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    this.room.players.splice(idx, 1);

    if (this.room.phase === 'lobby') {
      this.clearCountdown();
      this.evaluateAutoStart();
      this.broadcast();
      return;
    }

    if (this.room.phase === 'match_over') {
      if (this.room.players.length < 2) {
        this.resetToLobbyState();
      } else {
        this.evaluateAutoStart();
      }
      this.broadcast();
      return;
    }

    // Active game: update seat order and check remaining count
    const game = this.room.game;
    if (!game) {
      this.resetToLobbyState();
      this.broadcast();
      return;
    }

    const orderIdx = game.activeSeatOrder.indexOf(playerId);
    if (orderIdx !== -1) {
      const wasCurrent = orderIdx === game.currentTurnOrderIndex;
      game.activeSeatOrder.splice(orderIdx, 1);

      if (game.activeSeatOrder.length < 2) {
        this.clearBotTimer();
        pushEvent(game, `${reasonMessage} Zu wenige Spieler — zurück in die Lobby.`);
        this.resetToLobbyState();
        this.broadcast();
        return;
      }

      if (orderIdx < game.currentTurnOrderIndex) {
        game.currentTurnOrderIndex -= 1;
      } else if (game.currentTurnOrderIndex >= game.activeSeatOrder.length) {
        game.currentTurnOrderIndex = 0;
      }

      if (wasCurrent) {
        game.turnPhase = 'waiting_roll';
        game.rollsUsed = 0;
        game.legalMoves = [];
        game.maxRollsAllowed = 1;
      }
      pushEvent(game, reasonMessage);
    }

    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  public handleAction(
    peerId: string,
    action: string,
    payload: Record<string, unknown> = {}
  ): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) {
      return { ok: false, error: 'Spieler nicht im Room gefunden.' };
    }

    switch (action) {
      case 'room:leave':
        return this.leaveGuest(peerId);

      case 'room:toggle_ready': {
        if (this.room.phase !== 'lobby' && this.room.phase !== 'match_over') {
          return { ok: false, error: 'Während des Spiels nicht möglich.' };
        }
        player.isReady = !player.isReady;
        this.evaluateAutoStart();
        this.broadcast();
        return { ok: true };
      }

      case 'room:add_bot': {
        if (player.id !== this.room.hostId) {
          return { ok: false, error: 'Nur der Host kann Bots hinzufügen.' };
        }
        if (this.room.phase !== 'lobby') {
          return { ok: false, error: 'Bots können nur in der Lobby hinzugefügt werden.' };
        }
        if (this.room.players.length >= MAX_PLAYERS) {
          return { ok: false, error: 'Maximal 4 Spieler pro Runde möglich.' };
        }
        const usedNames = new Set(this.room.players.map((p) => p.name));
        const botName =
          BOT_NAMES.find((n) => !usedNames.has(n)) ??
          `Bot ${this.room.players.length + 1}`;
        const bot: InternalMaednPlayer = {
          id: globalThis.crypto.randomUUID(),
          name: botName,
          isHost: false,
          isBot: true,
          isReady: true,
          connected: true,
          reconnectToken: globalThis.crypto.randomUUID(),
          socketId: null,
          seat: null,
          color: null,
          pawns: createInitialPawns(),
          capturesCount: 0,
          lastRoll: null,
          lastRollSerial: 0,
        };
        this.room.players.push(bot);
        this.evaluateAutoStart();
        this.broadcast();
        return { ok: true };
      }

      case 'room:remove_player': {
        if (player.id !== this.room.hostId) {
          return { ok: false, error: 'Nur der Host kann Spieler entfernen.' };
        }
        if (this.room.phase !== 'lobby') {
          return { ok: false, error: 'Spieler können nur in der Lobby entfernt werden.' };
        }
        const targetId =
          typeof payload.targetPlayerId === 'string' ? payload.targetPlayerId : '';
        if (!targetId || targetId === this.room.hostId) {
          return { ok: false, error: 'Ungültiger Spieler.' };
        }
        const target = this.room.players.find((p) => p.id === targetId);
        if (!target) {
          return { ok: false, error: 'Spieler nicht gefunden.' };
        }
        const targetPeerId = target.socketId;
        this.removePlayerInternal(targetId, `${target.name} wurde entfernt.`);
        if (targetPeerId) {
          this.onKicked(targetPeerId, 'Du wurdest vom Host aus dem Room entfernt.');
        }
        return { ok: true };
      }

      case 'room:skip_disconnected': {
        if (player.id !== this.room.hostId) {
          return { ok: false, error: 'Nur der Host kann einen Zug überspringen.' };
        }
        if (this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Kein laufendes Spiel.' };
        }
        const targetId =
          typeof payload.targetPlayerId === 'string' ? payload.targetPlayerId : '';
        const game = this.room.game;
        const currId = game.activeSeatOrder[game.currentTurnOrderIndex];
        if (currId !== targetId) {
          return { ok: false, error: 'Dieser Spieler ist gerade nicht am Zug.' };
        }
        const target = this.room.players.find((p) => p.id === targetId);
        if (!target || target.connected || target.isBot) {
          return { ok: false, error: 'Spieler ist verbunden.' };
        }
        skipCurrentTurn(game, this.room.players, target.name);
        this.broadcast();
        this.scheduleBotTurnIfNeeded();
        return { ok: true };
      }

      case 'room:next_round': {
        if (player.id !== this.room.hostId) {
          return { ok: false, error: 'Nur der Host kann zurück in die Lobby wechseln.' };
        }
        this.resetToLobbyState();
        this.broadcast();
        return { ok: true };
      }

      case 'game:roll': {
        if (this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Das Spiel läuft nicht.' };
        }
        const res = performRollDice(this.room.game, this.room.players, player.id);
        if (!res.ok) {
          return { ok: false, error: res.error };
        }
        this.broadcast();
        this.scheduleBotTurnIfNeeded();
        return { ok: true };
      }

      case 'game:move': {
        if (this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Das Spiel läuft nicht.' };
        }
        const rawPawnIndex = payload.pawnIndex;
        if (
          typeof rawPawnIndex !== 'number' ||
          ![0, 1, 2, 3].includes(rawPawnIndex)
        ) {
          return { ok: false, error: 'Ungültige Spielfigur.' };
        }
        const res = executeMove(
          this.room.game,
          this.room.players,
          player.id,
          rawPawnIndex as 0 | 1 | 2 | 3
        );
        if (!res.ok) {
          return { ok: false, error: res.error };
        }
        if (res.wonMatch) {
          this.finishMatch();
          return { ok: true };
        }
        this.broadcast();
        this.scheduleBotTurnIfNeeded();
        return { ok: true };
      }

      default:
        return { ok: false, error: 'Unbekannte Aktion.' };
    }
  }

  private evaluateAutoStart(): void {
    const canStart =
      this.room.players.length >= 2 &&
      this.room.players.length <= MAX_PLAYERS &&
      this.room.players.every((p) => p.isReady) &&
      (this.room.phase === 'lobby' || this.room.phase === 'match_over');

    if (!canStart) {
      this.clearCountdown();
      return;
    }
    if (this.room.countdownTimer) return;

    this.room.countdownSeconds = 3;
    this.room.countdownTimer = setInterval(() => {
      if (this.room.countdownSeconds === null) {
        this.clearCountdown();
        return;
      }
      this.room.countdownSeconds -= 1;
      if (this.room.countdownSeconds <= 0) {
        this.clearCountdown();
        this.startNewMatch();
      } else {
        this.broadcast();
      }
    }, 1000);
  }

  public startNewMatch(): void {
    this.clearCountdown();
    this.clearBotTimer();

    this.room.phase = 'playing';
    this.room.matchSummary = null;
    this.room.game = startMatch(this.room.players);

    for (const p of this.room.players) {
      p.isReady = p.isBot;
    }

    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  private finishMatch(): void {
    this.clearBotTimer();
    const game = this.room.game;
    if (!game) return;
    this.room.phase = 'match_over';
    this.room.matchSummary = buildMatchSummary(game, this.room.players);
    for (const p of this.room.players) {
      p.isReady = p.isBot;
    }
    this.broadcast();
  }

  private resetToLobbyState(): void {
    this.clearCountdown();
    this.clearBotTimer();
    this.room.phase = 'lobby';
    this.room.game = null;
    this.room.matchSummary = null;
    for (const p of this.room.players) {
      p.seat = null;
      p.color = null;
      p.pawns = createInitialPawns();
      p.capturesCount = 0;
      p.lastRoll = null;
      p.lastRollSerial = 0;
      p.isReady = p.isBot;
    }
  }

  private scheduleBotTurnIfNeeded(): void {
    this.clearBotTimer();
    if (this.room.phase !== 'playing' || !this.room.game) return;

    const game = this.room.game;
    const currId = game.activeSeatOrder[game.currentTurnOrderIndex];
    const currPlayer = this.room.players.find((p) => p.id === currId);
    if (!currPlayer || !currPlayer.isBot) return;

    const delayMs = game.turnPhase === 'waiting_roll' ? 950 : 900;
    this.room.botTimer = setTimeout(() => {
      if (this.room.phase !== 'playing' || !this.room.game) return;
      const activeGame = this.room.game;
      const activeId = activeGame.activeSeatOrder[activeGame.currentTurnOrderIndex];
      const bot = this.room.players.find((p) => p.id === activeId);
      if (!bot || !bot.isBot) return;

      if (activeGame.turnPhase === 'waiting_roll') {
        performRollDice(activeGame, this.room.players, bot.id);
        this.broadcast();
        this.scheduleBotTurnIfNeeded();
        return;
      }

      if (activeGame.turnPhase === 'waiting_move') {
        const chosen = decideBotMove(activeGame, this.room.players, bot);
        if (!chosen) {
          skipCurrentTurn(activeGame, this.room.players, bot.name);
          this.broadcast();
          this.scheduleBotTurnIfNeeded();
          return;
        }
        const res = executeMove(activeGame, this.room.players, bot.id, chosen.pawnIndex);
        if (res.wonMatch) {
          this.finishMatch();
          return;
        }
        this.broadcast();
        this.scheduleBotTurnIfNeeded();
      }
    }, delayMs);
  }
}

export function getPlayerSeatLabelDe(seat: number | null): string {
  if (seat === 0 || seat === 1 || seat === 2 || seat === 3) {
    return SEAT_COLORS[seat].labelDe;
  }
  return '';
}

