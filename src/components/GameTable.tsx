import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Dices,
  HelpCircle,
  LogOut,
  SkipForward,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { SEAT_COLORS } from '../../shared/board.ts';
import type { ClientRoomState, RoomActionResponse } from '../../shared/types.ts';
import { MaednBoard } from './MaednBoard.tsx';
import { MaednDice } from './MaednDice.tsx';
import { MatchOverModal } from './MatchOverModal.tsx';

interface GameTableProps {
  room: ClientRoomState;
  connected: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRollDice: () => Promise<RoomActionResponse>;
  onMovePawn: (pawnIndex: 0 | 1 | 2 | 3) => Promise<RoomActionResponse>;
  onToggleReady: () => void;
  onSkipDisconnected: (targetPlayerId: string) => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
  onPlayDiceSound: () => void;
  onPlayStepSound: () => void;
  onPlayCaptureSound: () => void;
  onPlayGoalSound: () => void;
  onPlayTurnSound: () => void;
  onPlayRejectSound: () => void;
  onPlayWinSound: () => void;
}

export function GameTable({
  room,
  connected,
  soundEnabled,
  onToggleSound,
  onRollDice,
  onMovePawn,
  onToggleReady,
  onSkipDisconnected,
  onReturnToLobby,
  onLeave,
  onPlayDiceSound,
  onPlayStepSound,
  onPlayCaptureSound,
  onPlayGoalSound,
  onPlayTurnSound,
  onPlayRejectSound,
  onPlayWinSound,
}: GameTableProps) {
  const [showRules, setShowRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isHost = room.hostId === room.myPlayerId;
  const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId) ?? null;
  const isMyTurn = room.phase === 'playing' && room.currentPlayerId === room.myPlayerId;
  const isMyRollTurn = isMyTurn && room.turnPhase === 'waiting_roll';
  const isMyMoveTurn = isMyTurn && room.turnPhase === 'waiting_move';

  // Sound transition cues
  const prevTurnIdRef = useRef<string | null>(null);
  const prevRollSerialRef = useRef<number>(room.rollSerial);
  const prevGoalsRef = useRef<number>(0);
  const prevCapturesRef = useRef<number>(0);
  const prevPhaseRef = useRef(room.phase);

  useEffect(() => {
    if (room.rollSerial > prevRollSerialRef.current) {
      onPlayDiceSound();
    }
    prevRollSerialRef.current = room.rollSerial;
  }, [room.rollSerial, onPlayDiceSound]);

  useEffect(() => {
    const totalGoals = room.players.reduce((s, p) => s + p.goalsCount, 0);
    const totalCaptures = room.players.reduce((s, p) => s + p.capturesCount, 0);

    if (totalCaptures > prevCapturesRef.current) {
      onPlayCaptureSound();
    } else if (totalGoals > prevGoalsRef.current) {
      onPlayGoalSound();
    } else if (room.lastMovedPawn && totalGoals === prevGoalsRef.current && totalCaptures === prevCapturesRef.current) {
      onPlayStepSound();
    }
    prevGoalsRef.current = totalGoals;
    prevCapturesRef.current = totalCaptures;
  }, [room.lastMovedPawn, room.players, onPlayCaptureSound, onPlayGoalSound, onPlayStepSound]);

  useEffect(() => {
    if (isMyTurn && prevTurnIdRef.current !== room.myPlayerId) {
      onPlayTurnSound();
    }
    prevTurnIdRef.current = isMyTurn ? room.myPlayerId : room.currentPlayerId;
  }, [isMyTurn, room.myPlayerId, room.currentPlayerId, onPlayTurnSound]);

  useEffect(() => {
    if (room.phase === 'match_over' && prevPhaseRef.current !== 'match_over') {
      onPlayWinSound();
    }
    prevPhaseRef.current = room.phase;
  }, [room.phase, onPlayWinSound]);

  const handleRoll = useCallback(async () => {
    if (submitting || !isMyRollTurn) return;
    setSubmitting(true);
    const res = await onRollDice();
    setSubmitting(false);
    if (!res.ok) onPlayRejectSound();
  }, [submitting, isMyRollTurn, onRollDice, onPlayRejectSound]);

  const handleMovePawn = useCallback(
    async (pawnIndex: 0 | 1 | 2 | 3) => {
      if (submitting || !isMyMoveTurn) return;
      setSubmitting(true);
      const res = await onMovePawn(pawnIndex);
      setSubmitting(false);
      if (!res.ok) onPlayRejectSound();
    },
    [submitting, isMyMoveTurn, onMovePawn, onPlayRejectSound]
  );

  // Spacebar shortcut for rolling or confirming a single forced move
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      e.preventDefault();
      if (isMyRollTurn) {
        void handleRoll();
      } else if (isMyMoveTurn && room.legalMoves.length === 1) {
        void handleMovePawn(room.legalMoves[0].pawnIndex);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyRollTurn, isMyMoveTurn, room.legalMoves, handleRoll, handleMovePawn]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between overflow-x-hidden">
      {/* Minimal Top Bar */}
      <header className="border-b border-white/[0.06] px-4 py-2.5 sm:px-6 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="font-bold tracking-[-0.03em] text-sm sm:text-base">MÄDN</span>
            <span className="text-zinc-700">/</span>
            <span className="font-mono-code text-xs text-zinc-500">{room.roomCode}</span>
            <span className="hidden sm:inline text-zinc-800">·</span>
            <span className="hidden sm:inline text-xs text-zinc-500">
              Zug #{room.turnNumber}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 px-2 py-1"
              title={connected ? 'Verbunden' : 'Verbindung unterbrochen'}
            >
              {connected ? (
                <Wifi className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
              )}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </span>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Ton aus' : 'Ton an'}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              title="Kurzregeln"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLeave}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white rounded-lg px-2 py-1.5 hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verlassen</span>
            </button>
          </div>
        </div>
      </header>

      {/* Rules Drawer */}
      {showRules && (
        <div className="border-b border-white/[0.06] bg-[#070709] px-4 py-3 text-xs text-zinc-400 z-20">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              <strong className="text-white">Kurzregeln:</strong> Bei leerer Laufbahn 3× würfeln für eine 6 · Bei 6 Figur raus &amp; noch mal würfeln · Startfeld freimachen · Gegner durch Landen rauswerfen.
            </span>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              className="text-zinc-300 hover:text-white shrink-0 self-end sm:self-center cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* Players Strip */}
      <section className="px-4 pt-3 sm:px-6 z-10">
        <div className="max-w-4xl mx-auto flex flex-wrap items-stretch justify-center gap-2 sm:gap-2.5">
          {room.players.map((p) => {
            const isTurn = room.phase === 'playing' && room.currentPlayerId === p.id;
            const isMe = p.id === room.myPlayerId;
            const colorMeta = p.seat !== null ? SEAT_COLORS[p.seat] : null;

            return (
              <div
                key={p.id}
                className={`rounded-xl border px-3 py-2 min-w-[138px] sm:min-w-[162px] transition-all flex flex-col justify-between gap-1.5 ${
                  isTurn
                    ? 'border-white/65 bg-white/[0.06]'
                    : 'border-white/[0.07] bg-white/[0.015]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {colorMeta && (
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isTurn ? 'ring-2 ring-white/75' : ''
                        }`}
                        style={{ backgroundColor: colorMeta.hex }}
                      />
                    )}
                    <span className="text-xs font-medium text-white truncate">
                      {p.name}
                    </span>
                    {isMe && <span className="text-[10px] text-zinc-500">(Du)</span>}
                    {p.isBot && <Bot className="w-3 h-3 text-zinc-500 shrink-0" />}
                  </div>
                </div>

                {/* 4 Pawn Goal Dots */}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1" title="Figuren im Ziel">
                    {[0, 1, 2, 3].map((idx) => {
                      const inGoal = idx < p.goalsCount;
                      return (
                        <span
                          key={idx}
                          className="w-2 h-2 rounded-full border transition-colors"
                          style={{
                            backgroundColor: inGoal && colorMeta ? colorMeta.hex : 'transparent',
                            borderColor: inGoal && colorMeta ? colorMeta.border : 'rgba(255,255,255,0.18)',
                          }}
                        />
                      );
                    })}
                  </div>
                  <span className="font-mono-code text-[10px] text-zinc-500">
                    {p.capturesCount > 0 ? `${p.capturesCount}× raus` : `${p.goalsCount}/4`}
                  </span>
                </div>

                {!p.connected && !p.isBot && (
                  <div className="flex items-center justify-between gap-1.5 pt-0.5">
                    <span className="text-[10px] text-zinc-500">Getrennt</span>
                    {isHost && isTurn && (
                      <button
                        type="button"
                        onClick={() => onSkipDisconnected(p.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer"
                      >
                        <SkipForward className="w-2.5 h-2.5" />
                        <span>Überspringen</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Center Stage: Classic Cross Board */}
      <main className="flex-1 flex flex-col items-center justify-center px-3 py-3 sm:px-6 gap-3">
        <MaednBoard
          players={room.players}
          myPlayerId={room.myPlayerId}
          isMyMoveTurn={isMyMoveTurn}
          legalMoves={room.legalMoves}
          lastMovedPawn={room.lastMovedPawn}
          lastRoll={room.lastRoll}
          rollSerial={room.rollSerial}
          isMyRollTurn={isMyRollTurn}
          onRoll={() => void handleRoll()}
          onMovePawn={(idx) => void handleMovePawn(idx)}
        />
      </main>

      {/* Bottom Controls & Status */}
      <footer className="px-4 pb-5 pt-1 sm:px-6 z-10">
        <div className="max-w-lg mx-auto flex flex-col items-center gap-2.5">
          {/* Active Control Strip */}
          <div className="w-full rounded-2xl border border-white/[0.08] bg-[#08080A] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MaednDice
                value={room.lastRoll}
                rollSerial={room.rollSerial}
                active={isMyTurn}
                disabled={!isMyRollTurn}
                onRoll={() => void handleRoll()}
                size="sm"
              />

              <div className="min-w-0">
                <div className={`text-xs sm:text-sm font-medium truncate ${isMyTurn ? 'text-white' : 'text-zinc-400'}`}>
                  {isMyRollTurn
                    ? room.maxRollsAllowed > 1
                      ? `Du bist am Zug · Versuch ${room.rollsUsed + 1}/${room.maxRollsAllowed}`
                      : 'Du bist am Zug · Bitte würfeln'
                    : isMyMoveTurn
                      ? room.legalMoves[0]?.reasonHint ?? 'Wähle eine leuchtende Figur'
                      : `${currentPlayer?.name ?? '…'} ist am Zug`}
                </div>
                {room.lastEvent && (
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {room.lastEvent.message}
                  </p>
                )}
              </div>
            </div>

            {isMyRollTurn && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleRoll()}
                className="shrink-0 rounded-xl bg-white text-black px-4 py-2 text-xs sm:text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Dices className="w-4 h-4" />
                <span>Würfeln</span>
              </button>
            )}

            {isMyMoveTurn && room.legalMoves.length === 1 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleMovePawn(room.legalMoves[0].pawnIndex)}
                className="shrink-0 rounded-xl bg-white text-black px-3.5 py-2 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {room.legalMoves[0].capturesPlayerId
                  ? 'Rauswerfen'
                  : room.legalMoves[0].exitsBase
                    ? 'Raussetzen'
                    : 'Ziehen'}
              </button>
            )}
          </div>
        </div>
      </footer>

      {room.phase === 'match_over' && (
        <MatchOverModal
          room={room}
          onToggleReady={onToggleReady}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
