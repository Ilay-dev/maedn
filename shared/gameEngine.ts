import {
  GOAL_SLOTS,
  SEAT_COLORS,
  TRACK_LENGTH,
  getSeatAssignments,
  getWorldTrackIndex,
} from './board.js';
import type {
  GameEvent,
  LegalMove,
  MatchStanding,
  MatchSummary,
  PawnState,
  PlayerColorId,
  SeatIndex,
  TurnPhase,
} from './types.js';

export interface InternalMaednPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  reconnectToken: string;
  socketId: string | null;
  seat: SeatIndex | null;
  color: PlayerColorId | null;
  pawns: PawnState[];
  capturesCount: number;
}

export interface InternalMaednGame {
  activeSeatOrder: string[]; // player IDs in seat turn order
  currentTurnOrderIndex: number;
  turnNumber: number;
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
  winnerId: string | null;
  eventLog: GameEvent[];
}

export interface MoveExecutionResult {
  ok: boolean;
  error?: string;
  captured: boolean;
  enteredGoal: boolean;
  wonMatch: boolean;
  extraRollGranted: boolean;
}

export function secureRandomInt(minInclusive: number, maxExclusive: number): number {
  const span = maxExclusive - minInclusive;
  if (span <= 0) return minInclusive;
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    const maxUnbiased = Math.floor(0xffffffff / span) * span;
    let val = 0;
    do {
      globalThis.crypto.getRandomValues(arr);
      val = arr[0];
    } while (val >= maxUnbiased);
    return minInclusive + (val % span);
  }
  return minInclusive + Math.floor(Math.random() * span);
}

export function createInitialPawns(): PawnState[] {
  return [
    { pawnIndex: 0, progress: -1 },
    { pawnIndex: 1, progress: -1 },
    { pawnIndex: 2, progress: -1 },
    { pawnIndex: 3, progress: -1 },
  ];
}

export function pushEvent(game: InternalMaednGame, message: string): void {
  const evt: GameEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    timestamp: Date.now(),
  };
  game.eventLog.unshift(evt);
  if (game.eventLog.length > 30) {
    game.eventLog.length = 30;
  }
}

export function countGoalPawns(player: InternalMaednPlayer): number {
  return player.pawns.filter((p) => p.progress >= TRACK_LENGTH).length;
}

/**
 * Checks whether the player can attempt up to 3 rolls this turn:
 * True when all pawns are either in Base (-1) or already packed cleanly at the back of Goal (e.g. 43, 42+43, ...).
 */
export function canUseThreeRolls(player: InternalMaednPlayer): boolean {
  const hasOnOuterTrack = player.pawns.some(
    (p) => p.progress >= 0 && p.progress < TRACK_LENGTH
  );
  if (hasOnOuterTrack) return false;

  const goalPositions = new Set(
    player.pawns.filter((p) => p.progress >= TRACK_LENGTH).map((p) => p.progress)
  );
  // Check if all goal pawns sit contiguously packed at the deepest slots (43, 42, ...)
  for (let slot = TRACK_LENGTH + GOAL_SLOTS - 1; slot >= TRACK_LENGTH; slot--) {
    if (!goalPositions.has(slot)) {
      // Any pawn ahead of an empty deeper goal slot can still advance without a 6
      for (const pos of goalPositions) {
        if (pos < slot) return false;
      }
      break;
    }
  }
  return true;
}

function isCellOccupiedByOwn(player: InternalMaednPlayer, progress: number): boolean {
  return player.pawns.some((p) => p.progress === progress);
}

function isGoalPathClear(
  player: InternalMaednPlayer,
  fromProgress: number,
  toProgress: number
): boolean {
  if (toProgress < TRACK_LENGTH || toProgress >= TRACK_LENGTH + GOAL_SLOTS) {
    return true;
  }
  const startCheck = Math.max(TRACK_LENGTH, fromProgress + 1);
  for (let pos = startCheck; pos <= toProgress; pos++) {
    if (isCellOccupiedByOwn(player, pos)) {
      return false;
    }
  }
  return true;
}

function findOpponentAtWorldTrack(
  players: InternalMaednPlayer[],
  movingPlayerId: string,
  worldTrack: number
): { player: InternalMaednPlayer; pawn: PawnState } | null {
  for (const p of players) {
    if (p.id === movingPlayerId || p.seat === null) continue;
    for (const pawn of p.pawns) {
      if (getWorldTrackIndex(p.seat, pawn.progress) === worldTrack) {
        return { player: p, pawn };
      }
    }
  }
  return null;
}

export function getLegalMoves(
  player: InternalMaednPlayer,
  players: InternalMaednPlayer[],
  roll: number
): LegalMove[] {
  if (player.seat === null || roll < 1 || roll > 6) return [];
  const seat = player.seat;

  const basePawns = player.pawns.filter((p) => p.progress === -1);
  const startPawn = player.pawns.find((p) => p.progress === 0) ?? null;

  const buildCandidateMove = (pawn: PawnState, reasonHint: string | null = null): LegalMove | null => {
    if (pawn.progress === -1) {
      if (roll !== 6) return null;
      if (isCellOccupiedByOwn(player, 0)) return null;
      const worldTrack = getWorldTrackIndex(seat, 0)!;
      const hit = findOpponentAtWorldTrack(players, player.id, worldTrack);
      return {
        pawnIndex: pawn.pawnIndex,
        fromProgress: -1,
        toProgress: 0,
        targetWorldTrack: worldTrack,
        capturesPlayerId: hit?.player.id ?? null,
        capturesPawnIndex: hit?.pawn.pawnIndex ?? null,
        entersGoal: false,
        exitsBase: true,
        reasonHint,
      };
    }

    const toProgress = pawn.progress + roll;
    if (toProgress >= TRACK_LENGTH + GOAL_SLOTS) return null;

    if (toProgress >= TRACK_LENGTH) {
      if (!isGoalPathClear(player, pawn.progress, toProgress)) return null;
      return {
        pawnIndex: pawn.pawnIndex,
        fromProgress: pawn.progress,
        toProgress,
        targetWorldTrack: null,
        capturesPlayerId: null,
        capturesPawnIndex: null,
        entersGoal: pawn.progress < TRACK_LENGTH,
        exitsBase: false,
        reasonHint,
      };
    }

    if (isCellOccupiedByOwn(player, toProgress)) return null;
    const worldTrack = getWorldTrackIndex(seat, toProgress)!;
    const hit = findOpponentAtWorldTrack(players, player.id, worldTrack);

    return {
      pawnIndex: pawn.pawnIndex,
      fromProgress: pawn.progress,
      toProgress,
      targetWorldTrack: worldTrack,
      capturesPlayerId: hit?.player.id ?? null,
      capturesPawnIndex: hit?.pawn.pawnIndex ?? null,
      entersGoal: false,
      exitsBase: false,
      reasonHint,
    };
  };

  // Rule 1: On a 6, if any pawn is still in Base and Start (0) is free of own pawn -> must exit Base
  if (roll === 6 && basePawns.length > 0 && !startPawn) {
    const exitMoves = basePawns
      .map((p) => buildCandidateMove(p, 'Aus dem Haus ziehen'))
      .filter((m): m is LegalMove => m !== null);
    if (exitMoves.length > 0) return exitMoves;
  }

  // Rule 2: If own pawn stands on Start (0) and more pawns remain in Base -> must clear Start field if possible
  if (startPawn && basePawns.length > 0) {
    const clearStartMove = buildCandidateMove(startPawn, 'Startfeld freimachen');
    if (clearStartMove) return [clearStartMove];
  }

  // General case: collect all legal pawn moves
  const moves: LegalMove[] = [];
  for (const pawn of player.pawns) {
    const m = buildCandidateMove(pawn);
    if (m) moves.push(m);
  }
  return moves;
}

export function startMatch(players: InternalMaednPlayer[]): InternalMaednGame {
  const count = Math.min(4, Math.max(2, players.length));
  const seats = getSeatAssignments(count);

  const orderedIds: string[] = [];
  players.forEach((p, idx) => {
    const seat = seats[idx] ?? null;
    p.seat = seat;
    p.color = seat !== null ? SEAT_COLORS[seat].id : null;
    p.pawns = createInitialPawns();
    p.capturesCount = 0;
    if (seat !== null) {
      orderedIds.push(p.id);
    }
  });

  const firstPlayer = players.find((p) => p.id === orderedIds[0])!;
  const maxRolls = canUseThreeRolls(firstPlayer) ? 3 : 1;

  const game: InternalMaednGame = {
    activeSeatOrder: orderedIds,
    currentTurnOrderIndex: 0,
    turnNumber: 1,
    turnPhase: 'waiting_roll',
    lastRoll: null,
    rollSerial: 0,
    rollsUsed: 0,
    maxRollsAllowed: maxRolls,
    legalMoves: [],
    lastMovedPawn: null,
    winnerId: null,
    eventLog: [],
  };

  pushEvent(
    game,
    `Spiel gestartet (${orderedIds.length} Spieler). ${firstPlayer.name} beginnt.`
  );
  return game;
}

function advanceTurn(game: InternalMaednGame, players: InternalMaednPlayer[]): void {
  if (game.activeSeatOrder.length === 0) return;
  game.currentTurnOrderIndex =
    (game.currentTurnOrderIndex + 1) % game.activeSeatOrder.length;
  game.turnNumber += 1;
  game.turnPhase = 'waiting_roll';
  game.rollsUsed = 0;
  game.legalMoves = [];

  const nextId = game.activeSeatOrder[game.currentTurnOrderIndex];
  const nextPlayer = players.find((p) => p.id === nextId);
  game.maxRollsAllowed = nextPlayer && canUseThreeRolls(nextPlayer) ? 3 : 1;
}

export function performRollDice(
  game: InternalMaednGame,
  players: InternalMaednPlayer[],
  actorId: string,
  forcedRoll?: number
): { ok: boolean; error?: string; roll?: number; autoAdvanced?: boolean } {
  const currentId = game.activeSeatOrder[game.currentTurnOrderIndex];
  if (actorId !== currentId) {
    return { ok: false, error: 'Du bist gerade nicht am Zug.' };
  }
  if (game.turnPhase !== 'waiting_roll') {
    return { ok: false, error: 'Bitte wähle zuerst eine Figur zum Ziehen.' };
  }

  const player = players.find((p) => p.id === actorId);
  if (!player) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }

  const roll =
    forcedRoll !== undefined && forcedRoll >= 1 && forcedRoll <= 6
      ? Math.floor(forcedRoll)
      : secureRandomInt(1, 7);

  game.lastRoll = roll;
  game.rollSerial += 1;
  game.rollsUsed += 1;

  const legalMoves = getLegalMoves(player, players, roll);
  game.legalMoves = legalMoves;

  if (legalMoves.length > 0) {
    game.turnPhase = 'waiting_move';
    pushEvent(game, `${player.name} würfelt eine ${roll}.`);
    return { ok: true, roll, autoAdvanced: false };
  }

  // No legal moves with this roll
  if (roll === 6) {
    // Rolling a 6 grants an extra roll even if 6 had no valid target
    game.rollsUsed = 0;
    game.maxRollsAllowed = 1;
    game.turnPhase = 'waiting_roll';
    pushEvent(game, `${player.name} würfelt 6 — kein Zug möglich, noch einmal würfeln.`);
    return { ok: true, roll, autoAdvanced: false };
  }

  if (game.rollsUsed < game.maxRollsAllowed) {
    const left = game.maxRollsAllowed - game.rollsUsed;
    game.turnPhase = 'waiting_roll';
    pushEvent(
      game,
      `${player.name} würfelt ${roll} — noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}.`
    );
    return { ok: true, roll, autoAdvanced: false };
  }

  pushEvent(game, `${player.name} würfelt ${roll} — kein Zug möglich.`);
  advanceTurn(game, players);
  return { ok: true, roll, autoAdvanced: true };
}

export function executeMove(
  game: InternalMaednGame,
  players: InternalMaednPlayer[],
  actorId: string,
  pawnIndex: 0 | 1 | 2 | 3
): MoveExecutionResult {
  const currentId = game.activeSeatOrder[game.currentTurnOrderIndex];
  if (actorId !== currentId) {
    return {
      ok: false,
      error: 'Du bist nicht am Zug.',
      captured: false,
      enteredGoal: false,
      wonMatch: false,
      extraRollGranted: false,
    };
  }
  if (game.turnPhase !== 'waiting_move' || game.lastRoll === null) {
    return {
      ok: false,
      error: 'Bitte zuerst würfeln.',
      captured: false,
      enteredGoal: false,
      wonMatch: false,
      extraRollGranted: false,
    };
  }

  const move = game.legalMoves.find((m) => m.pawnIndex === pawnIndex);
  if (!move) {
    return {
      ok: false,
      error: 'Dieser Zug ist nicht erlaubt.',
      captured: false,
      enteredGoal: false,
      wonMatch: false,
      extraRollGranted: false,
    };
  }

  const player = players.find((p) => p.id === actorId)!;
  const pawn = player.pawns.find((p) => p.pawnIndex === pawnIndex)!;
  pawn.progress = move.toProgress;
  game.lastMovedPawn = { playerId: player.id, pawnIndex };

  let captured = false;
  let capturedName: string | null = null;
  if (move.capturesPlayerId !== null && move.capturesPawnIndex !== null) {
    const victim = players.find((p) => p.id === move.capturesPlayerId);
    const victimPawn = victim?.pawns.find((p) => p.pawnIndex === move.capturesPawnIndex);
    if (victim && victimPawn) {
      victimPawn.progress = -1;
      player.capturesCount += 1;
      captured = true;
      capturedName = victim.name;
    }
  }

  const allInGoal = countGoalPawns(player) === 4;
  if (allInGoal) {
    game.winnerId = player.id;
    game.legalMoves = [];
    pushEvent(game, `${player.name} bringt die letzte Figur ins Ziel und gewinnt!`);
    return {
      ok: true,
      captured,
      enteredGoal: move.entersGoal,
      wonMatch: true,
      extraRollGranted: false,
    };
  }

  if (captured && capturedName) {
    pushEvent(game, `${player.name} wirft ${capturedName} raus!`);
  } else if (move.exitsBase) {
    pushEvent(game, `${player.name} setzt eine neue Figur aufs Startfeld.`);
  } else if (move.entersGoal) {
    pushEvent(game, `${player.name} zieht eine Figur ins Ziel.`);
  }

  if (game.lastRoll === 6) {
    game.turnPhase = 'waiting_roll';
    game.rollsUsed = 0;
    game.maxRollsAllowed = 1;
    game.legalMoves = [];
    pushEvent(game, `${player.name} darf wegen der 6 noch einmal würfeln.`);
    return {
      ok: true,
      captured,
      enteredGoal: move.entersGoal,
      wonMatch: false,
      extraRollGranted: true,
    };
  }

  advanceTurn(game, players);
  return {
    ok: true,
    captured,
    enteredGoal: move.entersGoal,
    wonMatch: false,
    extraRollGranted: false,
  };
}

/**
 * Heuristic bot selector choosing capturing, exiting base, entering goal, or furthest safe progress.
 */
export function decideBotMove(
  game: InternalMaednGame,
  players: InternalMaednPlayer[],
  bot: InternalMaednPlayer
): LegalMove | null {
  if (game.legalMoves.length === 0) return null;
  if (game.legalMoves.length === 1) return game.legalMoves[0];

  let bestMove = game.legalMoves[0];
  let bestScore = -Infinity;

  for (const m of game.legalMoves) {
    let score = 0;

    if (m.exitsBase) score += 120;
    if (m.capturesPlayerId !== null) {
      const victim = players.find((p) => p.id === m.capturesPlayerId);
      const victimPawn = victim?.pawns.find((p) => p.pawnIndex === m.capturesPawnIndex);
      score += 180 + (victimPawn ? victimPawn.progress * 3 : 0);
    }
    if (m.entersGoal) score += 160;
    if (m.toProgress >= TRACK_LENGTH) score += 60 + (m.toProgress - TRACK_LENGTH) * 8;
    if (m.fromProgress === 0) score += 90; // free up start field

    // Prefer advancing further along track
    score += m.toProgress * 2.2;

    // Slight danger check: avoid sitting 1..6 ahead of an enemy pawn on track if avoidable
    if (m.targetWorldTrack !== null) {
      for (const other of players) {
        if (other.id === bot.id || other.seat === null) continue;
        for (const op of other.pawns) {
          const opTrack = getWorldTrackIndex(other.seat, op.progress);
          if (opTrack !== null) {
            const dist = (m.targetWorldTrack - opTrack + TRACK_LENGTH) % TRACK_LENGTH;
            if (dist >= 1 && dist <= 6) {
              score -= 35;
            }
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }

  return bestMove;
}

export function skipCurrentTurn(
  game: InternalMaednGame,
  players: InternalMaednPlayer[],
  playerName: string
): void {
  pushEvent(game, `${playerName} wurde übersprungen.`);
  advanceTurn(game, players);
}

export function buildMatchSummary(
  game: InternalMaednGame,
  players: InternalMaednPlayer[]
): MatchSummary {
  const active = players.filter((p) => p.seat !== null && p.color !== null);
  const standings: MatchStanding[] = active
    .map((p) => {
      const goalsCount = countGoalPawns(p);
      const progressScore = p.pawns.reduce(
        (sum, pawn) => sum + (pawn.progress < 0 ? 0 : pawn.progress + 1),
        0
      );
      return {
        id: p.id,
        name: p.name,
        seat: p.seat!,
        color: p.color!,
        goalsCount,
        progressScore,
        capturesCount: p.capturesCount,
        isBot: p.isBot,
      };
    })
    .sort((a, b) => {
      if (a.id === game.winnerId) return -1;
      if (b.id === game.winnerId) return 1;
      if (b.goalsCount !== a.goalsCount) return b.goalsCount - a.goalsCount;
      if (b.progressScore !== a.progressScore) return b.progressScore - a.progressScore;
      return b.capturesCount - a.capturesCount;
    });

  const winner = standings[0];
  return {
    winnerId: winner?.id ?? '',
    winnerName: winner?.name ?? 'Gewinner',
    winnerColor: winner?.color ?? 'red',
    turnsPlayed: game.turnNumber,
    standings,
  };
}
