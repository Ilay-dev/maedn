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

// Strictly symmetric 2x2 corner boxes centered on their 4 sockets:
// Top-Left sockets: (50,50)..(150,150) -> center (100,100) -> x:4..196, y:4..196
const BASE_CORNER_BOX: Record<SeatIndex, { x: number; y: number; size: number }> = {
  0: { x: 4, y: 904, size: 192 },
  1: { x: 4, y: 4, size: 192 },
  2: { x: 904, y: 4, size: 192 },
  3: { x: 904, y: 904, size: 192 },
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

  // Sort movable pawns last so they always paint above stationary/captured pawns
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

    items.sort((a, b) => Number(Boolean(a.legalMove)) - Number(Boolean(b.legalMove)));
    return items;
  }, [players, myPlayerId, legalMoveByPawn, lastMovedPawn, currentTurnSeat]);

  return (
    <div className="relative rounded-[28px] border border-white/[0.09] bg-[#060608] p-3 sm:p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
      <div className="w-[min(90vw,420px)] sm:w-[min(76vw,480px)] aspect-square select-none">
        {/* Single unified 1100x1100 SVG coordinate space so baseboard, previews & pawns align with 0px drift */}
        <svg
          viewBox="0 0 1100 1100"
          className="w-full h-full block overflow-visible"
          role="img"
          aria-label="Mensch, ärgere dich nicht Spielbrett"
        >
          <defs>
            {([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
              const hex = SEAT_COLORS[seat].hex;
              return (
                <radialGradient
                  key={`grad-${seat}`}
                  id={`pawn-grad-${seat}`}
                  cx="35%"
                  cy="30%"
                  r="70%"
                >
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                  <stop offset="45%" stopColor={hex} stopOpacity="1" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
                </radialGradient>
              );
            })}
          </defs>

          {/* Symmetrical Cross Silhouette (outer edges 4..1096, arm width 398..702) */}
          <path
            d="M416 4 H684 Q702 4 702 22 V398 H1078 Q1096 398 1096 416 V684 Q1096 702 1078 702 H702 V1078 Q702 1096 684 1096 H416 Q398 1096 398 1078 V702 H22 Q4 702 4 684 V416 Q4 398 22 398 H398 V22 Q398 4 416 4 Z"
            fill="#0A0A0E"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="2"
          />

          {/* 4 Symmetric Corner Startbox Enclosures */}
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
                  rx="30"
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
                        r="33"
                        fill="#050507"
                        stroke={isActive ? meta.border : 'rgba(255,255,255,0.08)'}
                        strokeWidth="2.5"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="10"
                        fill={meta.hex}
                        opacity={isActive ? 0.3 : 0.12}
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

          {/* Colored Goal Entry Bridges & Goal Sockets */}
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
                        r="30"
                        fill="#07070A"
                        stroke={meta.hex}
                        strokeWidth="3"
                        opacity="0.92"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="23"
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
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="36"
                    fill="#07070A"
                    stroke={meta.hex}
                    strokeWidth={isActive ? 3.5 : 2}
                    opacity={isActive ? 1 : 0.45}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="29"
                    fill={meta.hex}
                    opacity={isActive ? 0.24 : 0.08}
                  />
                  <g
                    transform={`translate(${pt.x}, ${pt.y}) rotate(${rotation})`}
                    opacity={isActive ? 0.92 : 0.35}
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
                  r="29"
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
            <polygon
              points="508,592 592,592 550,550"
              fill={SEAT_COLORS[0].hex}
              opacity={activeSeats.has(0) ? 0.44 : 0.1}
            />
            <polygon
              points="508,508 508,592 550,550"
              fill={SEAT_COLORS[1].hex}
              opacity={activeSeats.has(1) ? 0.44 : 0.1}
            />
            <polygon
              points="508,508 592,508 550,550"
              fill={SEAT_COLORS[2].hex}
              opacity={activeSeats.has(2) ? 0.44 : 0.1}
            />
            <polygon
              points="592,508 592,592 550,550"
              fill={SEAT_COLORS[3].hex}
              opacity={activeSeats.has(3) ? 0.44 : 0.1}
            />
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

          {/* Exact-center Destination Preview Halos */}
          {targetPreviewMoves.map(({ move, coord }) => {
            const pt = centerOf(coord.row, coord.col);
            const isCapture = Boolean(move.capturesPlayerId);
            return (
              <g
                key={`preview-${move.pawnIndex}-${coord.row}-${coord.col}`}
                pointerEvents="none"
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isCapture ? 43 : 40}
                  fill={isCapture ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}
                  stroke={isCapture ? '#ffffff' : 'rgba(255,255,255,0.8)'}
                  strokeWidth="4"
                  strokeDasharray={isCapture ? undefined : '9 7'}
                  className={isCapture ? 'animate-soft-pulse' : undefined}
                />
              </g>
            );
          })}

          {/* Unambiguous Clickable Target Fields */}
          {uniqueTargetCells.map((target) => {
            const pt = centerOf(target.row, target.col);
            return (
              <circle
                key={`target-hit-${target.row}-${target.col}`}
                cx={pt.x}
                cy={pt.y}
                r="44"
                fill="transparent"
                className="cursor-pointer hover:fill-white/[0.08] transition-colors"
                role="button"
                tabIndex={0}
                aria-label={`Zielfeld Zeile ${target.row + 1} Spalte ${target.col + 1}`}
                onClick={() => {
                  setHoveredMove(null);
                  onMovePawn(target.pawnIndex);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHoveredMove(null);
                    onMovePawn(target.pawnIndex);
                  }
                }}
              />
            );
          })}

          {/* Smooth-gliding Pawn Layer centered identically in 1100x1100 SVG space */}
          {pawnTokens.map((token) => {
            const pt = centerOf(token.coord.row, token.coord.col);
            const meta = SEAT_COLORS[token.seat];
            const isMovable = Boolean(token.legalMove);
            const pawnRadius = isMovable ? 33 : 30;

            return (
              <g
                key={token.key}
                style={{
                  transform: `translate(${pt.x}px, ${pt.y}px)`,
                  transition: 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className={isMovable ? 'cursor-pointer focus:outline-none' : 'cursor-default'}
                role={isMovable ? 'button' : undefined}
                tabIndex={isMovable ? 0 : undefined}
                aria-label={`${meta.labelDe} Figur ${token.pawnIndex + 1}`}
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
                onKeyDown={(e) => {
                  if (!token.legalMove) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHoveredMove(null);
                    onMovePawn(token.pawnIndex);
                  }
                }}
              >
                {/* Pulsing luminous halo around movable pawns */}
                {isMovable && (
                  <circle
                    cx="0"
                    cy="0"
                    r="42"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    className="animate-soft-pulse"
                  />
                )}

                {/* Grounding shadow directly below piece */}
                <circle cx="0" cy="4" r={pawnRadius} fill="rgba(0,0,0,0.65)" />

                {/* Base solid color disc + lacquer gradient overlay */}
                <circle cx="0" cy="0" r={pawnRadius} fill={meta.hex} />
                <circle
                  cx="0"
                  cy="0"
                  r={pawnRadius}
                  fill={`url(#pawn-grad-${token.seat})`}
                  stroke={
                    isMovable
                      ? '#ffffff'
                      : token.wasJustMoved
                        ? 'rgba(255,255,255,0.92)'
                        : token.isActiveTurnOwner
                          ? 'rgba(255,255,255,0.85)'
                          : 'rgba(255,255,255,0.58)'
                  }
                  strokeWidth={isMovable ? 4 : token.wasJustMoved ? 3.5 : 3}
                />

                {/* Tactile Halmakegel white center crown */}
                <circle cx="0" cy="0" r={isMovable ? 12 : 11} fill="rgba(255,255,255,0.92)" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
