export type SeatIndex = 0 | 1 | 2 | 3;

export type PlayerColorId = 'red' | 'blue' | 'amber' | 'green';

export type RoomPhase = 'lobby' | 'playing' | 'match_over';

export type TurnPhase = 'waiting_roll' | 'waiting_move';

export interface PawnState {
  pawnIndex: 0 | 1 | 2 | 3;
  /**
   * -1 = Base (Haus),
   * 0..39 = Steps along outer track from this player's start cell,
   * 40..43 = Goal House slots (Ziel)
   */
  progress: number;
}

export interface LegalMove {
  pawnIndex: 0 | 1 | 2 | 3;
  fromProgress: number;
  toProgress: number;
  targetWorldTrack: number | null;
  capturesPlayerId: string | null;
  capturesPawnIndex: number | null;
  entersGoal: boolean;
  exitsBase: boolean;
  reasonHint: string | null;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

export interface PublicMaednPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  seat: SeatIndex | null;
  color: PlayerColorId | null;
  pawns: PawnState[];
  capturesCount: number;
  goalsCount: number;
}

export interface MatchStanding {
  id: string;
  name: string;
  seat: SeatIndex;
  color: PlayerColorId;
  goalsCount: number;
  progressScore: number;
  capturesCount: number;
  isBot: boolean;
}

export interface MatchSummary {
  winnerId: string;
  winnerName: string;
  winnerColor: PlayerColorId;
  turnsPlayed: number;
  standings: MatchStanding[];
}

export interface ClientRoomState {
  roomCode: string;
  phase: RoomPhase;
  myPlayerId: string;
  hostId: string;
  players: PublicMaednPlayer[];
  countdownSeconds: number | null;
  turnNumber: number;
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  lastRoll: number | null;
  rollSerial: number;
  rollsUsed: number;
  maxRollsAllowed: number;
  legalMoves: LegalMove[];
  lastMovedPawn: {
    playerId: string;
    pawnIndex: 0 | 1 | 2 | 3;
  } | null;
  matchSummary: MatchSummary | null;
  lastEvent: GameEvent | null;
  eventLog: GameEvent[];
}

export interface SessionCredentials {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface RoomActionResponse {
  ok: boolean;
  error?: string;
  credentials?: SessionCredentials;
}
