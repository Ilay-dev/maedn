import { useMemo, useState } from 'react';
import {
  BASE_COORDS,
  GOAL_COORDS,
  OUTER_TRACK_COORDS,
  SEAT_COLORS,
  getPawnGridCoord,
} from '../../shared/board.ts';
import type { LegalMove, PublicMaednPlayer, SeatIndex } from '../../shared/types.ts';
import { MaednDice } from './MaednDice.tsx';

interface MaednBoardProps {
  players: PublicMaednPlayer[];
  myPlayerId: string;
  isMyMoveTurn: boolean;
  legalMoves: LegalMove[];
  lastMovedPawn: { playerId: string; pawnIndex: 0 | 1 | 2 | 3 } | null;
  lastRoll: number | null;
  rollSerial: number;
  isMyRollTurn: boolean;
  onRoll: () => void;
  onMovePawn: (pawnIndex: 0 | 1 | 2 | 3) => void;
}

interface CellToken {
  playerId: string;
  seat: SeatIndex;
  pawnIndex: 0 | 1 | 2 | 3;
  progress: number;
  isMine: boolean;
  legalMove: LegalMove | null;
  wasJustMoved: boolean;
}

export function MaednBoard({
  players,
  myPlayerId,
  isMyMoveTurn,
  legalMoves,
  lastMovedPawn,
  lastRoll,
  rollSerial,
  isMyRollTurn,
  onRoll,
  onMovePawn,
}: MaednBoardProps) {
  const [hoveredMove, setHoveredMove] = useState<LegalMove | null>(null);

  const activeSeats = useMemo(
    () =>
      new Set<SeatIndex>(
        players.map((p) => p.seat).filter((s): s is SeatIndex => s !== null)
      ),
    [players]
  );

  // Build lookup tables for the 11x11 board
  const outerTrackMap = useMemo(() => {
    const m = new Map<string, number>();
    OUTER_TRACK_COORDS.forEach((coord, idx) => {
      m.set(`${coord.row},${coord.col}`, idx);
    });
    return m;
  }, []);

  const baseMap = useMemo(() => {
    const m = new Map<string, SeatIndex>();
    ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
      BASE_COORDS[seat].forEach((coord) => {
        m.set(`${coord.row},${coord.col}`, seat);
      });
    });
    return m;
  }, []);

  const goalMap = useMemo(() => {
    const m = new Map<string, SeatIndex>();
    ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
      GOAL_COORDS[seat].forEach((coord) => {
        m.set(`${coord.row},${coord.col}`, seat);
      });
    });
    return m;
  }, []);

  const startCellSeatMap = useMemo(() => {
    const m = new Map<string, SeatIndex>();
    ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
      const idx = SEAT_COLORS[seat].startTrackIndex;
      const coord = OUTER_TRACK_COORDS[idx];
      m.set(`${coord.row},${coord.col}`, seat);
    });
    return m;
  }, []);

  const tokensByCell = useMemo(() => {
    const m = new Map<string, CellToken>();
    const legalByPawn = new Map<number, LegalMove>();
    if (isMyMoveTurn) {
      for (const move of legalMoves) {
        legalByPawn.set(move.pawnIndex, move);
      }
    }

    for (const player of players) {
      if (player.seat === null) continue;
      const isMine = player.id === myPlayerId;
      for (const pawn of player.pawns) {
        const coord = getPawnGridCoord(player.seat, pawn.pawnIndex, pawn.progress);
        const key = `${coord.row},${coord.col}`;
        m.set(key, {
          playerId: player.id,
          seat: player.seat,
          pawnIndex: pawn.pawnIndex,
          progress: pawn.progress,
          isMine,
          legalMove: isMine ? legalByPawn.get(pawn.pawnIndex) ?? null : null,
          wasJustMoved:
            lastMovedPawn?.playerId === player.id &&
            lastMovedPawn.pawnIndex === pawn.pawnIndex,
        });
      }
    }
    return m;
  }, [players, myPlayerId, isMyMoveTurn, legalMoves, lastMovedPawn]);

  // Target preview cell when hovering or when there's only 1 legal move
  const targetPreviewByCell = useMemo(() => {
    const m = new Map<string, LegalMove>();
    const me = players.find((p) => p.id === myPlayerId);
    if (!isMyMoveTurn || !me || me.seat === null) return m;

    const previewMoves =
      hoveredMove !== null
        ? [hoveredMove]
        : legalMoves.length === 1
          ? legalMoves
          : [];

    for (const move of previewMoves) {
      const coord = getPawnGridCoord(me.seat, move.pawnIndex, move.toProgress);
      m.set(`${coord.row},${coord.col}`, move);
    }
    return m;
  }, [players, myPlayerId, isMyMoveTurn, hoveredMove, legalMoves]);

  // Unique destination mapping so clicking a destination cell also executes the move
  const uniqueTargetCellToPawn = useMemo(() => {
    const me = players.find((p) => p.id === myPlayerId);
    const m = new Map<string, 0 | 1 | 2 | 3>();
    if (!isMyMoveTurn || !me || me.seat === null) return m;

    const counts = new Map<string, 0 | 1 | 2 | 3 | 'multi'>();
    for (const move of legalMoves) {
      const coord = getPawnGridCoord(me.seat, move.pawnIndex, move.toProgress);
      const key = `${coord.row},${coord.col}`;
      counts.set(key, counts.has(key) ? 'multi' : move.pawnIndex);
    }
    for (const [key, val] of counts.entries()) {
      if (val !== 'multi') m.set(key, val);
    }
    return m;
  }, [players, myPlayerId, isMyMoveTurn, legalMoves]);

  return (
    <div className="relative rounded-3xl border border-white/[0.08] bg-[#060608] p-2.5 sm:p-4 shadow-[0_0_60px_rgba(0,0,0,0.95)]">
      <div
        className="grid grid-cols-11 gap-1 sm:gap-1.5 w-[min(90vw,390px)] sm:w-[min(78vw,460px)] aspect-square"
        role="grid"
        aria-label="Mensch, ärgere dich nicht Brett"
      >
        {Array.from({ length: 11 }).map((_, row) =>
          Array.from({ length: 11 }).map((__, col) => {
            const key = `${row},${col}`;

            // Center 5,5 holds the minimalist center die indicator
            if (row === 5 && col === 5) {
              return (
                <div key={key} className="flex items-center justify-center relative">
                  <div className="scale-90 sm:scale-100">
                    <MaednDice
                      value={lastRoll}
                      rollSerial={rollSerial}
                      active={isMyRollTurn}
                      disabled={!isMyRollTurn}
                      onRoll={onRoll}
                      size="sm"
                    />
                  </div>
                </div>
              );
            }

            const trackIdx = outerTrackMap.get(key);
            const baseSeat = baseMap.get(key);
            const goalSeat = goalMap.get(key);
            const startSeat = startCellSeatMap.get(key);

            const isPlayableCell =
              trackIdx !== undefined || baseSeat !== undefined || goalSeat !== undefined;

            if (!isPlayableCell) {
              return <div key={key} aria-hidden="true" />;
            }

            const token = tokensByCell.get(key) ?? null;
            const targetPreview = targetPreviewByCell.get(key) ?? null;
            const clickableTargetPawn = uniqueTargetCellToPawn.get(key);

            const seatColorForCell =
              startSeat !== undefined
                ? SEAT_COLORS[startSeat]
                : baseSeat !== undefined && activeSeats.has(baseSeat)
                  ? SEAT_COLORS[baseSeat]
                  : goalSeat !== undefined && activeSeats.has(goalSeat)
                    ? SEAT_COLORS[goalSeat]
                    : null;

            const isUnusedSeatCorner =
              (baseSeat !== undefined && !activeSeats.has(baseSeat)) ||
              (goalSeat !== undefined && !activeSeats.has(goalSeat));

            let cellStyle: React.CSSProperties = {};
            if (seatColorForCell) {
              cellStyle = {
                backgroundColor: seatColorForCell.softBg,
                borderColor: seatColorForCell.border,
              };
            }

            const isInteractive = Boolean(
              (token && token.legalMove) || clickableTargetPawn !== undefined
            );

            const handleCellClick = () => {
              if (token?.legalMove) {
                setHoveredMove(null);
                onMovePawn(token.pawnIndex);
              } else if (clickableTargetPawn !== undefined) {
                setHoveredMove(null);
                onMovePawn(clickableTargetPawn);
              }
            };

            return (
              <div
                key={key}
                onMouseEnter={() => {
                  if (token?.legalMove) setHoveredMove(token.legalMove);
                }}
                onMouseLeave={() => {
                  if (token?.legalMove) setHoveredMove(null);
                }}
                onClick={isInteractive ? handleCellClick : undefined}
                className={`relative flex items-center justify-center rounded-full border transition-all ${
                  isUnusedSeatCorner
                    ? 'border-white/[0.04] bg-white/[0.01] opacity-40'
                    : seatColorForCell
                      ? ''
                      : 'border-white/[0.14] bg-[#0B0B0E]'
                } ${isInteractive ? 'cursor-pointer' : ''}`}
                style={cellStyle}
              >
                {/* Destination ghost / capture marker */}
                {targetPreview && (
                  <span
                    className={`pointer-events-none absolute inset-[-2px] rounded-full border-2 ${
                      targetPreview.capturesPlayerId
                        ? 'border-white animate-pulse'
                        : 'border-white/75 border-dashed'
                    }`}
                  />
                )}

                {/* Subtle start indicator dot when start field is empty */}
                {!token && startSeat !== undefined && activeSeats.has(startSeat) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full opacity-75"
                    style={{ backgroundColor: SEAT_COLORS[startSeat].hex }}
                  />
                )}

                {/* Pawn Token */}
                {token && (
                  <span
                    className={`relative w-[78%] h-[78%] rounded-full border transition-transform duration-150 flex items-center justify-center ${
                      token.legalMove
                        ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-black animate-pulse'
                        : token.wasJustMoved
                          ? 'ring-1 ring-white/60'
                          : ''
                    }`}
                    style={{
                      backgroundColor: SEAT_COLORS[token.seat].hex,
                      borderColor: 'rgba(255, 255, 255, 0.75)',
                      boxShadow: `0 2px 8px ${SEAT_COLORS[token.seat].ring}, inset 0 2px 3px rgba(255,255,255,0.28)`,
                    }}
                  >
                    <span className="w-[34%] h-[34%] rounded-full bg-white/85" />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
