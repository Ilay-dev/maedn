import { type FormEvent, useState } from 'react';
import { ArrowRight, BookOpen, Plus, Wifi, WifiOff } from 'lucide-react';

interface HomeScreenProps {
  connected: boolean;
  initialRoomCode: string;
  errorMessage: string | null;
  onCreateRoom: (playerName: string) => Promise<void>;
  onJoinRoom: (roomCode: string, playerName: string) => Promise<void>;
  onClearInvite: () => void;
  onClearError: () => void;
}

const NAME_STORAGE_KEY = 'maedn_player_name';

export function HomeScreen({
  connected,
  initialRoomCode,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onClearInvite,
  onClearError,
}: HomeScreenProps) {
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode);
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const [submitting, setSubmitting] = useState<'create' | 'join' | null>(null);
  const [showRules, setShowRules] = useState(false);

  const persistName = (name: string) => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // ignore storage errors
    }
  };

  const dismissInvite = () => {
    setInviteDismissed(true);
    setRoomCode('');
    onClearError();
    onClearInvite();
  };

  const handleCreate = async () => {
    const clean = playerName.trim();
    if (!clean || submitting) return;
    onClearError();
    onClearInvite();
    setInviteDismissed(true);
    persistName(clean);
    setSubmitting('create');
    try {
      await onCreateRoom(clean);
    } finally {
      setSubmitting(null);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const clean = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!clean || code.length < 4 || submitting) return;
    onClearError();
    persistName(clean);
    setSubmitting('join');
    try {
      await onJoinRoom(code, clean);
    } finally {
      setSubmitting(null);
    }
  };

  const hasName = playerName.trim().length > 0;
  const hasInviteCode = initialRoomCode.length > 0 && !inviteDismissed;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between px-4 py-8 sm:px-6">
      {/* Top Bar */}
      <header className="max-w-xl w-full mx-auto flex items-center justify-between text-xs text-zinc-500">
        <div className="inline-flex items-center gap-1.5">
          {connected ? (
            <Wifi className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
          )}
          <span>{connected ? 'P2P Host-Modus bereit' : 'Verbinde…'}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowRules((v) => !v)}
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{showRules ? 'Regeln ausblenden' : 'Spielregeln'}</span>
        </button>
      </header>

      {/* Main */}
      <main className="max-w-md w-full mx-auto my-auto py-8">
        <div className="mb-10">
          <div className="flex items-center gap-3.5 mb-3">
            <h1 className="text-5xl font-bold tracking-[-0.04em] text-white">MÄDN</h1>
            <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" />
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Minimalistisches Mensch, ärgere dich nicht für 2, 3 oder 4 Spieler direkt über WebRTC P2P — ohne externen Server.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-sm text-white flex items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-xs text-zinc-400 hover:text-white shrink-0 cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {showRules && (
          <div className="mb-6 rounded-2xl border border-white/[0.08] bg-[#08080A] p-4 text-xs text-zinc-300 space-y-2 leading-relaxed animate-pop-in">
            <div className="font-semibold text-white">Klassische Regeln</div>
            <ul className="space-y-1 text-zinc-400 list-disc pl-4">
              <li>Jeder der 2–4 Spieler startet mit 4 Figuren im eigenen Haus.</li>
              <li>Solange keine Figur draußen ist, hast du pro Zug bis zu 3 Versuche für eine 6.</li>
              <li>Mit einer 6 kommt eine Figur aufs Startfeld und du darfst noch einmal würfeln.</li>
              <li>Startfeld immer zuerst freimachen, wenn noch Figuren im Haus warten.</li>
              <li>Landest du auf einer gegnerischen Figur, fliegt sie zurück in ihr Haus.</li>
              <li>Wer zuerst alle 4 Figuren ins eigene Zielhaus bringt, gewinnt.</li>
            </ul>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label
              htmlFor="player-name"
              className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2"
            >
              Dein Name
            </label>
            <input
              id="player-name"
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="z. B. Leon"
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-[#08080A] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/60 transition-colors"
            />
          </div>

          {!hasInviteCode ? (
            <>
              <button
                type="button"
                disabled={!hasName || submitting !== null}
                onClick={() => void handleCreate()}
                className="w-full rounded-xl bg-white text-black font-semibold py-3.5 px-5 text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{submitting === 'create' ? 'Erstelle Room…' : 'Neuen Room erstellen'}</span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.08]" />
                <span className="mx-3 text-[11px] uppercase tracking-widest text-zinc-600">oder</span>
                <div className="flex-grow border-t border-white/[0.08]" />
              </div>

              <form onSubmit={(e) => void handleJoin(e)} className="space-y-3">
                <label
                  htmlFor="room-code"
                  className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
                >
                  Mit Room-Code beitreten
                </label>
                <div className="flex gap-2">
                  <input
                    id="room-code"
                    type="text"
                    maxLength={6}
                    value={roomCode}
                    onChange={(e) =>
                      setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    placeholder="ABC123"
                    className="flex-1 rounded-xl border border-white/10 bg-[#08080A] px-4 py-3 text-sm font-mono-code tracking-[0.18em] text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/60 transition-colors uppercase"
                  />
                  <button
                    type="submit"
                    disabled={!hasName || roomCode.trim().length < 4 || submitting !== null}
                    className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-medium text-white hover:bg-white hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{submitting === 'join' ? '…' : 'Beitreten'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <form onSubmit={(e) => void handleJoin(e)} className="space-y-3">
                <div className="rounded-xl border border-white/15 bg-[#08080A] px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">
                      Einladung
                    </span>
                    <span className="font-mono-code text-base font-bold tracking-[0.2em] text-white">
                      {roomCode || initialRoomCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={dismissInvite}
                    className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    Code ändern
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!hasName || submitting !== null}
                  className="w-full rounded-xl bg-white text-black font-semibold py-3.5 px-5 text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>{submitting === 'join' ? 'Trete bei…' : 'Room beitreten'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-white/[0.08]" />
                <span className="mx-3 text-[11px] uppercase tracking-widest text-zinc-600">oder</span>
                <div className="flex-grow border-t border-white/[0.08]" />
              </div>

              <button
                type="button"
                disabled={!hasName || submitting !== null}
                onClick={() => void handleCreate()}
                className="w-full rounded-xl border border-white/20 bg-white/[0.06] text-white font-semibold py-3.5 px-5 text-sm flex items-center justify-center gap-2 hover:bg-white hover:text-black disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{submitting === 'create' ? 'Erstelle Room…' : 'Neuen Room erstellen'}</span>
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-xl w-full mx-auto flex items-center justify-between text-xs text-zinc-600">
        <span>2–4 Spieler</span>
        <span className="font-mono-code">P2P WebRTC</span>
      </footer>
    </div>
  );
}

