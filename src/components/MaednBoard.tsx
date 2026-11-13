import { useMemo, useState } from 'react';
import {
  BASE_COORDS,
  GOAL_COORDS,
  OUTER_TRACK_COORDS,
  SEAT_COLORS,
  getPawnGridCoord,
} from '../../shared/board.ts';
import type { LegalMove, PublicMaednPlayer, SeatIndex } from '../../shared/types.ts';

interface MaednBoardProps {
  players: PublicMaednPlayer[];
  myPlayerId: string;
  currentTurnSeat: SeatIndex | null;
  isMyMoveTurn: boolean;
  legalMoves: LegalMove[];
  lastMovedPawn: { playerId: string; pawnIndex: 0 | 1 | 2 | 3 } | null;
  onMovePawn: (pawnIndex: 0 | 1 | 2 | 3) => void;
}

const CELL_SIZE = 100;
const HALF_CELL = CELL_SIZE / 2;

function centerOf(row: number, col: number): { x: number; y: number } {
  return {
    x: col * CELL_SIZE + HALF_CELL,
    y: row * CELL_SIZE + HALF_CELL,
  };
}

// Track index right before entering each seat's goal lane
const GOAL_ENTRY_TRACK_INDEX: Record<SeatIndex, number> = {
  0: 39,
  1: 9,
  2: 19,
  3: 29,
};

// Bounding box of each 2x2 corner base in 1100x1100 coordinates
const BASE_CORNER_BOX: Record<SeatIndex, { x: number; y: number; size: number }> = {
  0: { x: 10, y: 890, size: 200 },
  1: { x: 10, y: 10, size: 200 },
  2: { x: 890, y: 10, size: 200 },
  3: { x: 890, y: 890, size: 200 },
};

// Arrow direction from each seat's Start cell along step +1
const START_ARROW_ROTATION: Record<SeatIndex, number> = {
  0: -90, // up: (10,4) -> (9,4)
  1: 0,   // right: (4,0) -> (4,1)
  2: 90,  // down: (0,6) -> (1,6)
  3: 180, // left: (6,10) -> (6,9)
};

export function MaednBoard({
  players,
  myPlayerId,
  currentTurnSeat,
  isMyMoveTurn,
  legalMoves,
  lastMovedPawn,
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

  const outerLoopPoints = useMemo(
    () =>
      OUTER_TRACK_COORDS.map((c) => {
        const pt = centerOf(c.row, c.col);
        return `${pt.x},${pt.y}`;
      }).join(' '),
    []
  );

  const legalMoveByPawn = useMemo(() => {
    const map = new Map<number, LegalMove>();
    if (!isMyMoveTurn) return map;
    for (const move of legalMoves) {
      map.set(move.pawnIndex, move);
    }
    return map;
  }, [isMyMoveTurn, legalMoves]);

  // Preview destination cell (hovered move, or auto-preview when only 1 legal move)
  const targetPreviewMoves = useMemo(() => {
    const me = players.find((p) => p.id === myPlayerId);
    if (!isMyMoveTurn || !me || me.seat === null) return [];
    const activeMoves =
      hoveredMove !== null
        ? [hoveredMove]
        : legalMoves.length === 1
          ? legalMoves
          : [];
    return activeMoves.map((move) => ({
      move,
      coord: getPawnGridCoord(me.seat!, move.pawnIndex, move.toProgress),
    }));
  }, [players, myPlayerId, isMyMoveTurn, hoveredMove, legalMoves]);

  // Clickable destination cells for unambiguous moves
  const uniqueTargetCells = useMemo(() => {
    const me = players.find((p) => p.id === myPlayerId);
    if (!isMyMoveTurn || !me || me.seat === null) return [];

    const byKey = new Map<
      string,
      { row: number; col: number; pawnIndex: 0 | 1 | 2 | 3 } | 'multi'
    >();
    for (const move of legalMoves) {
      const coord = getPawnGridCoord(me.seat, move.pawnIndex, move.toProgress);
      const key = `${coord.row},${coord.col}`;
      if (byKey.has(key)) {
        byKey.set(key, 'multi');
      } else {
        byKey.set(key, { row: coord.row, col: coord.col, pawnIndex: move.pawnIndex });
      }
    }

    const result: Array<{ row: number; col: number; pawnIndex: 0 | 1 | 2 | 3 }> = [];
    for (const val of byKey.values()) {
      if (val !== 'multi') result.push(val);
    }
    return result;
  }, [players, myPlayerId, isMyMoveTurn, legalMoves]);

  const startCoordSet = useMemo(() => {
    const map = new Map<number, SeatIndex>();
    ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
      map.set(SEAT_COLORS[seat].startTrackIndex, seat);
    });
    return map;
  }, []);

  // Flatten all active pawns so each piece stays mounted under a stable key & glides on coordinate updates
  const pawnTokens = useMemo(() => {
    const items: Array<{
      key: string;
      playerId: string;
      seat: SeatIndex;
      pawnIndex: 0 | 1 | 2 | 3;
      coord: { row: number; col: number };
      legalMove: LegalMove | null;
      wasJustMoved: boolean;
      isActiveTurnOwner: boolean;
    }> = [];

    for (const player of players) {
      if (player.seat === null) continue;
      const isMine = player.id === myPlayerId;
      for (const pawn of player.pawns) {
        items.push({
          key: `${player.id}-${pawn.pawnIndex}`,
          playerId: player.id,
          seat: player.seat,
          pawnIndex: pawn.pawnIndex,
          coord: getPawnGridCoord(player.seat, pawn.pawnIndex, pawn.progress),
          legalMove: isMine ? legalMoveByPawn.get(pawn.pawnIndex) ?? null : null,
          wasJustMoved:
            lastMovedPawn?.playerId === player.id &&
            lastMovedPawn.pawnIndex === pawn.pawnIndex,
          isActiveTurnOwner: player.seat === currentTurnSeat,
        });
      }
    }

    return items;
  }, [players, myPlayerId, legalMoveByPawn, lastMovedPawn, currentTurnSeat]);

  return (
    <div className="relative rounded-[28px] border border-white/[0.09] bg-[#060608] p-2.5 sm:p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
      {/* Subtle architectural corner glow under board */}
      <div className="relative w-[min(92vw,420px)] sm:w-[min(76vw,480px)] aspect-square select-none">
        {/* Static Architectural SVG Baseboard (1100 x 1100 matching 11x11 grid) */}
        <svg
          viewBox="0 0 1100 1100"
          className="w-full h-full block"
          role="img"
          aria-label="Mensch, ärgere dich nicht Spielbrett"
        >
          {/* Subtle cross silhouette background */}
          <path
            d="M402 8 H698 Q708 8 708 18 V392 H1082 Q1092 392 1092 402 V698 Q1092 708 1082 708 H708 V1082 Q708 1092 698 1092 H402 Q392 1092 392 1082 V708 H18 Q8 708 8 698 V402 Q8 392 18 392 H392 V18 Q392 8 402 8 Z"
            fill="#0A0A0E"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="2"
          />

          {/* 4 Corner Startbox Enclosures */}
          {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
            const box = BASE_CORNER_BOX[seat];
            const meta = SEAT_COLORS[seat];
            const isActive = activeSeats.has(seat);
            const isTurnSeat = currentTurnSeat === seat;

            return (
              <g key={`corner-${seat}`} opacity={isActive ? 1 : 0.28}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.size}
                  height={box.size}
                  rx="28"
                  fill={isTurnSeat ? meta.softBg : '#09090C'}
                  stroke={
                    isTurnSeat
                      ? meta.hex
                      : isActive
                        ? meta.border
                        : 'rgba(255,255,255,0.08)'
                  }
                  strokeWidth={isTurnSeat ? 3 : 2}
                />

                {/* Inner recessed corner sockets */}
                {BASE_COORDS[seat].map((coord, idx) => {
                  const pt = centerOf(coord.row, coord.col);
                  return (
                    <g key={`base-${seat}-${idx}`}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="34"
                        fill="#050507"
                        stroke={isActive ? meta.border : 'rgba(255,255,255,0.08)'}
                        strokeWidth="2.5"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="11"
                        fill={meta.hex}
                        opacity={isActive ? 0.28 : 0.12}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Connected 40-Step Outer Track Loop */}
          <polygon
            points={outerLoopPoints}
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="4"
            strokeLinejoin="round"
          />

          {/* Colored Goal Entry Bridges & Goal Lane Capsules */}
          {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
            const meta = SEAT_COLORS[seat];
            const isActive = activeSeats.has(seat);
            const entryCoord = OUTER_TRACK_COORDS[GOAL_ENTRY_TRACK_INDEX[seat]];
            const entryPt = centerOf(entryCoord.row, entryCoord.col);
            const lastGoalCoord = GOAL_COORDS[seat][GOAL_COORDS[seat].length - 1];
            const lastGoalPt = centerOf(lastGoalCoord.row, lastGoalCoord.col);

            return (
              <g key={`goal-lane-${seat}`} opacity={isActive ? 1 : 0.25}>
                <line
                  x1={entryPt.x}
                  y1={entryPt.y}
                  x2={lastGoalPt.x}
                  y2={lastGoalPt.y}
                  stroke={meta.hex}
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity="0.45"
                />

                {GOAL_COORDS[seat].map((coord, idx) => {
                  const pt = centerOf(coord.row, coord.col);
                  return (
                    <g key={`goal-${seat}-${idx}`}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="31"
                        fill="#07070A"
                        stroke={meta.hex}
                        strokeWidth="3"
                        opacity="0.9"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="24"
                        fill={meta.hex}
                        opacity="0.16"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* 40 Outer Track Step Circles & Directional Start Fields */}
          {OUTER_TRACK_COORDS.map((coord, idx) => {
            const pt = centerOf(coord.row, coord.col);
            const startSeat = startCoordSet.get(idx);

            if (startSeat !== undefined) {
              const meta = SEAT_COLORS[startSeat];
              const isActive = activeSeats.has(startSeat);
              const rotation = START_ARROW_ROTATION[startSeat];

              return (
                <g key={`track-${idx}`}>
                  {/* Outer halo */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="38"
                    fill="#07070A"
                    stroke={meta.hex}
                    strokeWidth={isActive ? 3.5 : 2}
                    opacity={isActive ? 1 : 0.45}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="31"
                    fill={meta.hex}
                    opacity={isActive ? 0.24 : 0.08}
                  />
                  {/* Directional chevron showing clockwise start direction */}
                  <g
                    transform={`translate(${pt.x}, ${pt.y}) rotate(${rotation})`}
                    opacity={isActive ? 0.9 : 0.35}
                  >
                    <path
                      d="M -7 -9 L 5 0 L -7 9"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                </g>
              );
            }

            return (
              <g key={`track-${idx}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="30"
                  fill="#0B0B10"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2.5"
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4.5"
                  fill="rgba(255,255,255,0.12)"
                />
              </g>
            );
          })}

          {/* Center (5,5) Architectural 4-House Emblem */}
          <g>
            <rect
              x="504"
              y="504"
              width="92"
              height="92"
              rx="18"
              fill="#07070A"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="2"
            />
            {/* Bottom Triangle -> Seat 0 (Rot) */}
            <polygon
              points="508,592 592,592 550,550"
              fill={SEAT_COLORS[0].hex}
              opacity={activeSeats.has(0) ? 0.42 : 0.1}
            />
            {/* Left Triangle -> Seat 1 (Blau) */}
            <polygon
              points="508,508 508,592 550,550"
              fill={SEAT_COLORS[1].hex}
              opacity={activeSeats.has(1) ? 0.42 : 0.1}
            />
            {/* Top Triangle -> Seat 2 (Gelb) */}
            <polygon
              points="508,508 592,508 550,550"
              fill={SEAT_COLORS[2].hex}
              opacity={activeSeats.has(2) ? 0.42 : 0.1}
            />
            {/* Right Triangle -> Seat 3 (Grün) */}
            <polygon
              points="592,508 592,592 550,550"
              fill={SEAT_COLORS[3].hex}
              opacity={activeSeats.has(3) ? 0.42 : 0.1}
            />
            {/* Crisp center X divider + hub */}
            <line
              x1="509"
              y1="509"
              x2="591"
              y2="591"
              stroke="#07070A"
              strokeWidth="3"
            />
            <line
              x1="591"
              y1="509"
              x2="509"
              y2="591"
              stroke="#07070A"
              strokeWidth="3"
            />
            <circle
              cx="550"
              cy="550"
              r="11"
              fill="#08080A"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="2.5"
            />
          </g>
        </svg>

        {/* Destination Preview Halos */}
        {targetPreviewMoves.map(({ move, coord }) => (
          <div
            key={`preview-${move.pawnIndex}-${coord.row}-${coord.col}`}
            aria-hidden="true"
            style={{
              left: `${((coord.col + 0.5) / 11) * 100}%`,
              top: `${((coord.row + 0.5) / 11) * 100}%`,
              width: `${(1 / 11) * 86}%`,
              height: `${(1 / 11) * 86}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`pointer-events-none absolute z-10 rounded-full border-2 ${
              move.capturesPlayerId
                ? 'border-white bg-white/15 animate-soft-pulse'
                : 'border-white/80 border-dashed bg-white/[0.06]'
            }`}
          />
        ))}

        {/* Unambiguous Clickable Target Cells */}
        {uniqueTargetCells.map((target) => (
          <button
            key={`target-hit-${target.row}-${target.col}`}
            type="button"
            aria-label={`Zielfeld Zeile ${target.row + 1} Spalte ${target.col + 1}`}
            onClick={() => {
              setHoveredMove(null);
              onMovePawn(target.pawnIndex);
            }}
            style={{
              left: `${((target.col + 0.5) / 11) * 100}%`,
              top: `${((target.row + 0.5) / 11) * 100}%`,
              width: `${(1 / 11) * 92}%`,
              height: `${(1 / 11) * 92}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute z-20 rounded-full cursor-pointer hover:bg-white/[0.08] transition-colors"
          />
        ))}

        {/* Persistent Pawn Overlay Layer with Smooth CSS Transitions */}
        {pawnTokens.map((token) => {
          const meta = SEAT_COLORS[token.seat];
          const isMovable = Boolean(token.legalMove);

          return (
            <button
              key={token.key}
              type="button"
              disabled={!isMovable}
              onMouseEnter={() => {
                if (token.legalMove) setHoveredMove(token.legalMove);
              }}
              onMouseLeave={() => {
                if (token.legalMove) setHoveredMove(null);
              }}
              onClick={() => {
                if (!token.legalMove) return;
                setHoveredMove(null);
                onMovePawn(token.pawnIndex);
              }}
              aria-label={`${meta.labelDe} Figur ${token.pawnIndex + 1}`}
              style={{
                left: `${((token.coord.col + 0.5) / 11) * 100}%`,
                top: `${((token.coord.row + 0.5) / 11) * 100}%`,
                width: `${(1 / 11) * 72}%`,
                height: `${(1 / 11) * 72}%`,
                transform: `translate(-50%, -50%) scale(${isMovable ? 1.12 : 1})`,
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.42), ${meta.hex} 58%, rgba(0,0,0,0.45) 100%)`,
                backgroundColor: meta.hex,
                borderColor: isMovable
                  ? '#ffffff'
                  : token.isActiveTurnOwner
                    ? 'rgba(255,255,255,0.88)'
                    : 'rgba(255,255,255,0.58)',
                boxShadow: isMovable
                  ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 18px ${meta.hex}`
                  : token.wasJustMoved
                    ? `0 0 0 2px rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.75)`
                    : '0 4px 10px rgba(0,0,0,0.72), inset 0 1px 2px rgba(255,255,255,0.35)',
              }}
              className={`absolute rounded-full border-2 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isMovable ? 'z-30 cursor-pointer' : 'z-[25] cursor-default'
              }`}
            >
              {/* Tactile Halmakegel top crown */}
              <span className="w-[40%] h-[40%] rounded-full bg-white/90 shadow-inner pointer-events-none" />

              {/* Gentle pulse ring around movable pawns */}
              {isMovable && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-white/80 animate-soft-pulse"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
