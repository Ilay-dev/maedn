import { describe, expect, it } from 'vitest';
import {
  BASE_COORDS,
  GOAL_COORDS,
  OUTER_TRACK_COORDS,
  TRACK_LENGTH,
  getSeatAssignments,
  getWorldTrackIndex,
} from '../shared/board.ts';
import {
  type InternalMaednPlayer,
  canUseThreeRolls,
  createInitialPawns,
  decideBotMove,
  executeMove,
  getLegalMoves,
  performRollDice,
  startMatch,
} from '../shared/gameEngine.ts';

function makePlayer(id: string, name: string, isBot = false): InternalMaednPlayer {
  return {
    id,
    name,
    isHost: id === 'p1',
    isBot,
    isReady: true,
    connected: true,
    reconnectToken: `tok-${id}`,
    socketId: `sock-${id}`,
    seat: null,
    color: null,
    pawns: createInitialPawns(),
    capturesCount: 0,
    lastRoll: null,
    lastRollSerial: 0,
  };
}

describe('MAEDN board & gameEngine', () => {
  it('defines a closed 40-cell orthogonal outer loop without coordinate collisions', () => {
    expect(OUTER_TRACK_COORDS).toHaveLength(TRACK_LENGTH);
    const seen = new Set<string>();
    for (let i = 0; i < TRACK_LENGTH; i++) {
      const curr = OUTER_TRACK_COORDS[i];
      const next = OUTER_TRACK_COORDS[(i + 1) % TRACK_LENGTH];
      const manhattan = Math.abs(curr.row - next.row) + Math.abs(curr.col - next.col);
      expect(manhattan).toBe(1);
      seen.add(`${curr.row},${curr.col}`);
    }
    expect(seen.size).toBe(40);

    // Ensure bases and goal cells do not collide with track or each other
    for (const seat of [0, 1, 2, 3] as const) {
      for (const coord of [...BASE_COORDS[seat], ...GOAL_COORDS[seat]]) {
        const key = `${coord.row},${coord.col}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(40 + 16 + 16);
  });

  it('assigns balanced seats for 2, 3, and 4 players', () => {
    expect(getSeatAssignments(2)).toEqual([0, 2]);
    expect(getSeatAssignments(3)).toEqual([0, 1, 2]);
    expect(getSeatAssignments(4)).toEqual([0, 1, 2, 3]);
  });

  it('grants 3 rolls when all remaining pawns are in Base or packed cleanly in Goal', () => {
    const p1 = makePlayer('p1', 'Alice');
    const p2 = makePlayer('p2', 'Bob');
    const game = startMatch([p1, p2]);

    expect(game.maxRollsAllowed).toBe(3);

    // Two misses keep turn on p1; third miss advances to p2
    const r1 = performRollDice(game, [p1, p2], 'p1', 3);
    expect(r1.autoAdvanced).toBe(false);
    expect(game.activeSeatOrder[game.currentTurnOrderIndex]).toBe('p1');
    expect(game.lastRollPlayerId).toBe('p1');
    expect(p1.lastRoll).toBe(3);
    expect(p1.lastRollSerial).toBe(1);

    const r2 = performRollDice(game, [p1, p2], 'p1', 5);
    expect(r2.autoAdvanced).toBe(false);
    expect(game.activeSeatOrder[game.currentTurnOrderIndex]).toBe('p1');

    const r3 = performRollDice(game, [p1, p2], 'p1', 2);
    expect(r3.autoAdvanced).toBe(true);
    expect(game.activeSeatOrder[game.currentTurnOrderIndex]).toBe('p2');

    // Parked deepest pawn at 43 still allows 3 rolls
    p1.pawns[0].progress = 43;
    expect(canUseThreeRolls(p1)).toBe(true);
    // Pawn at 41 with 43 empty can still move inside Goal, so 1 roll
    p1.pawns[0].progress = 41;
    expect(canUseThreeRolls(p1)).toBe(false);
  });

  it('enforces exiting base on 6, bonus roll, and clearing Start field priority', () => {
    const p1 = makePlayer('p1', 'Alice');
    const p2 = makePlayer('p2', 'Bob');
    const game = startMatch([p1, p2]);

    // Roll 6 -> must exit base
    performRollDice(game, [p1, p2], 'p1', 6);
    expect(game.legalMoves).toHaveLength(4);
    expect(game.legalMoves.every((m) => m.exitsBase)).toBe(true);

    const moveOut = executeMove(game, [p1, p2], 'p1', 0);
    expect(moveOut.ok).toBe(true);
    expect(moveOut.extraRollGranted).toBe(true);
    expect(p1.pawns[0].progress).toBe(0);

    // Next roll (e.g. 4): pawn 0 is at Start (0) while pawns 1..3 are in base -> must clear Start
    performRollDice(game, [p1, p2], 'p1', 4);
    expect(game.legalMoves).toHaveLength(1);
    expect(game.legalMoves[0].pawnIndex).toBe(0);
    expect(game.legalMoves[0].toProgress).toBe(4);
  });

  it('captures opponent pawns on outer track and sends them back to base', () => {
    const p1 = makePlayer('p1', 'Alice'); // seat 0 (start = 0)
    const p2 = makePlayer('p2', 'Bob');   // seat 2 (start = 20)
    const game = startMatch([p1, p2]);

    // Place p2 pawn 0 at world track 5 (relative progress 25 for seat 2: (20 + 25) % 40 = 5)
    p1.pawns[0].progress = 2;
    p2.pawns[0].progress = 25;
    expect(getWorldTrackIndex(p2.seat!, p2.pawns[0].progress)).toBe(5);

    performRollDice(game, [p1, p2], 'p1', 3);
    expect(game.legalMoves).toHaveLength(1);
    expect(game.legalMoves[0].capturesPlayerId).toBe('p2');

    const res = executeMove(game, [p1, p2], 'p1', 0);
    expect(res.captured).toBe(true);
    expect(p1.pawns[0].progress).toBe(5);
    expect(p1.capturesCount).toBe(1);
    expect(p2.pawns[0].progress).toBe(-1); // kicked back to base
  });

  it('prevents jumping over own pawns in Goal House and detects victory on 4th goal pawn', () => {
    const p1 = makePlayer('p1', 'Alice');
    const p2 = makePlayer('p2', 'Bob');
    const game = startMatch([p1, p2]);

    // p1 has pawns at 40 (blocking 41..43 jump), 42, 43, and pawn 3 at 39
    p1.pawns[0].progress = 40;
    p1.pawns[1].progress = 42;
    p1.pawns[2].progress = 43;
    p1.pawns[3].progress = 38;

    // Rolling 3 with pawn 3 (38 + 3 = 41) is blocked because pawn 0 is at 40 (no jump in Goal)
    const blocked = getLegalMoves(p1, [p1, p2], 3);
    expect(blocked.some((m) => m.pawnIndex === 3)).toBe(false);

    // Now move pawn 0 cleanly to 41, leaving 40 open
    p1.pawns[0].progress = 41;
    p1.pawns[3].progress = 37;
    performRollDice(game, [p1, p2], 'p1', 3); // 37 + 3 = 40
    const res = executeMove(game, [p1, p2], 'p1', 3);
    expect(res.enteredGoal).toBe(true);
    expect(res.wonMatch).toBe(true);
    expect(game.winnerId).toBe('p1');
  });

  it('bot prioritizes capturing or exiting base', () => {
    const p1 = makePlayer('p1', 'Alice');
    const bot = makePlayer('p2', 'Nova (Bot)', true);
    const game = startMatch([p1, bot]);

    bot.pawns[0].progress = 2;
    bot.pawns[1].progress = 10;
    p1.pawns[0].progress = 25; // world 25 -> bot seat 2 progress 5

    performRollDice(game, [p1, bot], 'p1', 1); // p1 has no moves (1 roll? no 3 rolls -> skip)
    // Advance explicitly to bot
    game.currentTurnOrderIndex = 1;
    game.turnPhase = 'waiting_move';
    game.lastRoll = 3;
    game.legalMoves = getLegalMoves(bot, [p1, bot], 3);

    const picked = decideBotMove(game, [p1, bot], bot);
    expect(picked?.pawnIndex).toBe(0);
    expect(picked?.capturesPlayerId).toBe('p1');
  });
});

