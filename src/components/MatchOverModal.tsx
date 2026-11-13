import { Check, RotateCcw, Trophy } from 'lucide-react';
import { SEAT_COLORS } from '../../shared/board.ts';
import type { ClientRoomState } from '../../shared/types.ts';

interface MatchOverModalProps {
  room: ClientRoomState;
  onToggleReady: () => void;
  onReturnToLobby: () => void;
}

export function MatchOverModal({
  room,
  onToggleReady,
  onReturnToLobby,
}: MatchOverModalProps) {
  const summary = room.matchSummary;
  if (!summary) return null;

  const isHost = room.hostId === room.myPlayerId;
  const me = room.players.find((p) => p.id === room.myPlayerId);
  const readyCount = room.players.filter((p) => p.isReady).length;
  const winnerMeta = SEAT_COLORS[summary.standings[0]?.seat ?? 0];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#09090B] p-6 space-y-5 animate-pop-in shadow-2xl">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Partie beendet · {summary.turnsPlayed} Züge
          </div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: winnerMeta.hex }}
            />
            <span>{summary.winnerName} gewinnt!</span>
          </h2>
        </div>

        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-black/60 overflow-hidden">
          {summary.standings.map((entry, idx) => {
            const colorMeta = SEAT_COLORS[entry.seat];
            const isMe = entry.id === room.myPlayerId;
            return (
              <li
                key={entry.id}
                className="px-4 py-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono-code text-zinc-500 w-4">{idx + 1}.</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: colorMeta.hex }}
                  />
                  <span className={`truncate ${idx === 0 ? 'font-semibold text-white' : 'text-zinc-300'}`}>
                    {entry.name}
                    {isMe ? ' (Du)' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono-code text-[11px] text-zinc-400 shrink-0">
                  <span>Ziel {entry.goalsCount}/4</span>
                  <span>Raus {entry.capturesCount}×</span>
                </div>
              </li>
            );
          })}
        </ul>

        {room.countdownSeconds !== null ? (
          <div className="rounded-xl bg-white text-black px-4 py-3 flex items-center justify-between text-xs font-semibold">
            <span>Nächste Partie startet in {room.countdownSeconds}…</span>
            <button
              type="button"
              onClick={onToggleReady}
              className="underline underline-offset-4 cursor-pointer"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full rounded-xl py-3 px-4 text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                me?.isReady
                  ? 'border border-white/25 bg-white/[0.08] text-white'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {me?.isReady && <Check className="w-4 h-4" />}
              <span>
                {me?.isReady
                  ? `Bereit für Rematch (${readyCount}/${room.players.length})`
                  : 'Rematch bereit'}
              </span>
            </button>

            {isHost && (
              <button
                type="button"
                onClick={onReturnToLobby}
                className="w-full rounded-xl border border-white/10 py-2.5 px-4 text-xs text-zinc-400 hover:text-white hover:border-white/25 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Zurück zur Lobby</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
