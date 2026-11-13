import type { PlayerColorId, SeatIndex } from './types.ts';

export interface GridCoord {
  row: number; // 0..10
  col: number; // 0..10
}

export const TRACK_LENGTH = 40;
export const GOAL_SLOTS = 4;

/**
 * 40 clockwise outer track coordinates on an 11x11 cross board.
 * Index 0  = Seat 0 (Rot) Start (bottom-left moving up)
 * Index 10 = Seat 1 (Blau) Start (top-left moving right)
 * Index 20 = Seat 2 (Gelb) Start (top-right moving down)
 * Index 30 = Seat 3 (Grün) Start (bottom-right moving left)
 */
export const OUTER_TRACK_COORDS: GridCoord[] = [
  { row: 10, col: 4 }, // 0  - Seat 0 Start
  { row: 9, col: 4 },  // 1
  { row: 8, col: 4 },  // 2
  { row: 7, col: 4 },  // 3
  { row: 6, col: 4 },  // 4
  { row: 6, col: 3 },  // 5
  { row: 6, col: 2 },  // 6
  { row: 6, col: 1 },  // 7
  { row: 6, col: 0 },  // 8
  { row: 5, col: 0 },  // 9
  { row: 4, col: 0 },  // 10 - Seat 1 Start
  { row: 4, col: 1 },  // 11
  { row: 4, col: 2 },  // 12
  { row: 4, col: 3 },  // 13
  { row: 4, col: 4 },  // 14
  { row: 3, col: 4 },  // 15
  { row: 2, col: 4 },  // 16
  { row: 1, col: 4 },  // 17
  { row: 0, col: 4 },  // 18
  { row: 0, col: 5 },  // 19
  { row: 0, col: 6 },  // 20 - Seat 2 Start
  { row: 1, col: 6 },  // 21
  { row: 2, col: 6 },  // 22
  { row: 3, col: 6 },  // 23
  { row: 4, col: 6 },  // 24
  { row: 4, col: 7 },  // 25
  { row: 4, col: 8 },  // 26
  { row: 4, col: 9 },  // 27
  { row: 4, col: 10 }, // 28
  { row: 5, col: 10 }, // 29
  { row: 6, col: 10 }, // 30 - Seat 3 Start
  { row: 6, col: 9 },  // 31
  { row: 6, col: 8 },  // 32
  { row: 6, col: 7 },  // 33
  { row: 6, col: 6 },  // 34
  { row: 7, col: 6 },  // 35
  { row: 8, col: 6 },  // 36
  { row: 9, col: 6 },  // 37
  { row: 10, col: 6 }, // 38
  { row: 10, col: 5 }, // 39
];

export const BASE_COORDS: Record<SeatIndex, GridCoord[]> = {
  0: [
    { row: 9, col: 0 },
    { row: 9, col: 1 },
    { row: 10, col: 0 },
    { row: 10, col: 1 },
  ],
  1: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ],
  2: [
    { row: 0, col: 9 },
    { row: 0, col: 10 },
    { row: 1, col: 9 },
    { row: 1, col: 10 },
  ],
  3: [
    { row: 9, col: 9 },
    { row: 9, col: 10 },
    { row: 10, col: 9 },
    { row: 10, col: 10 },
  ],
};

export const GOAL_COORDS: Record<SeatIndex, GridCoord[]> = {
  0: [
    { row: 9, col: 5 },
    { row: 8, col: 5 },
    { row: 7, col: 5 },
    { row: 6, col: 5 },
  ],
  1: [
    { row: 5, col: 1 },
    { row: 5, col: 2 },
    { row: 5, col: 3 },
    { row: 5, col: 4 },
  ],
  2: [
    { row: 1, col: 5 },
    { row: 2, col: 5 },
    { row: 3, col: 5 },
    { row: 4, col: 5 },
  ],
  3: [
    { row: 5, col: 9 },
    { row: 5, col: 8 },
    { row: 5, col: 7 },
    { row: 5, col: 6 },
  ],
};

export interface SeatColorMeta {
  seat: SeatIndex;
  id: PlayerColorId;
  labelDe: string;
  hex: string;
  softBg: string;
  border: string;
  ring: string;
  startTrackIndex: number;
}

export const SEAT_COLORS: Record<SeatIndex, SeatColorMeta> = {
  0: {
    seat: 0,
    id: 'red',
    labelDe: 'Rot',
    hex: '#dc2626',
    softBg: 'rgba(220, 38, 38, 0.14)',
    border: 'rgba(248, 113, 113, 0.55)',
    ring: 'rgba(220, 38, 38, 0.4)',
    startTrackIndex: 0,
  },
  1: {
    seat: 1,
    id: 'blue',
    labelDe: 'Blau',
    hex: '#2563eb',
    softBg: 'rgba(37, 99, 235, 0.14)',
    border: 'rgba(96, 165, 250, 0.55)',
    ring: 'rgba(37, 99, 235, 0.4)',
    startTrackIndex: 10,
  },
  2: {
    seat: 2,
    id: 'amber',
    labelDe: 'Gelb',
    hex: '#d97706',
    softBg: 'rgba(217, 119, 6, 0.16)',
    border: 'rgba(251, 191, 36, 0.55)',
    ring: 'rgba(217, 119, 6, 0.4)',
    startTrackIndex: 20,
  },
  3: {
    seat: 3,
    id: 'green',
    labelDe: 'Grün',
    hex: '#16a34a',
    softBg: 'rgba(22, 163, 74, 0.15)',
    border: 'rgba(74, 222, 128, 0.5)',
    ring: 'rgba(22, 163, 74, 0.4)',
    startTrackIndex: 30,
  },
};

/**
 * Balanced seating: 2 players sit diagonally opposite (0 vs 2),
 * 3 players occupy seats 0, 1, 2, and 4 players fill all 4 corners.
 */
export function getSeatAssignments(playerCount: number): SeatIndex[] {
  if (playerCount <= 2) return [0, 2];
  if (playerCount === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export function getWorldTrackIndex(seat: SeatIndex, progress: number): number | null {
  if (progress < 0 || progress >= TRACK_LENGTH) return null;
  return (seat * 10 + progress) % TRACK_LENGTH;
}

export function getPawnGridCoord(
  seat: SeatIndex,
  pawnIndex: 0 | 1 | 2 | 3,
  progress: number
): GridCoord {
  if (progress < 0) {
    return BASE_COORDS[seat][pawnIndex];
  }
  if (progress < TRACK_LENGTH) {
    const idx = (seat * 10 + progress) % TRACK_LENGTH;
    return OUTER_TRACK_COORDS[idx];
  }
  const goalSlot = Math.min(GOAL_SLOTS - 1, Math.max(0, progress - TRACK_LENGTH));
  return GOAL_COORDS[seat][goalSlot];
}
