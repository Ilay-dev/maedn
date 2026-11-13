import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { safeRandomUUID } from '../../shared/gameEngine.ts';
import type {
  ClientRoomState,
  RoomActionResponse,
  SessionCredentials,
} from '../../shared/types.ts';
import { BrowserHostManager, generateBrowserRoomCode } from '../p2p/hostManager.ts';

const SESSION_KEY = 'maedn_p2p_session';

const PEER_OPTIONS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 10,
  },
};

type PeerReqPayload =
  | { type: 'join'; playerName: string }
  | { type: 'rejoin'; credentials: SessionCredentials }
  | {
      type: 'action';
      action: string;
      payload?: Record<string, unknown>;
    };

type PeerMsgToHost =
  | { type: 'ping' }
  | (PeerReqPayload & { requestId: string });

type PeerMsgToGuest =
  | { type: 'res'; requestId: string; response: RoomActionResponse }
  | { type: 'state'; state: ClientRoomState }
  | { type: 'kicked'; reason: string };

interface StoredGuestSession {
  role: 'guest';
  credentials: SessionCredentials;
}

function saveGuestSession(creds: SessionCredentials | null): void {
  try {
    if (creds) {
      const payload: StoredGuestSession = { role: 'guest', credentials: creds };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadGuestSession(): StoredGuestSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGuestSession;
    if (
      parsed?.role === 'guest' &&
      parsed.credentials?.roomCode &&
      parsed.credentials?.playerId &&
      parsed.credentials?.reconnectToken
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function useMaednSocket() {
  const peerRef = useRef<Peer | null>(null);
  const hostManagerRef = useRef<BrowserHostManager | null>(null);
  const guestConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const guestConnRef = useRef<DataConnection | null>(null);
  const pendingRequestsRef = useRef<
    Map<string, { resolve: (res: RoomActionResponse) => void; timer: ReturnType<typeof setTimeout> }>
  >(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptIdRef = useRef(0);

  const [connected, setConnected] = useState(true);
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorBanner(msg);
  }, []);

  const clearError = useCallback(() => {
    setErrorBanner(null);
  }, []);

  const cleanupPeerResources = useCallback(() => {
    attemptIdRef.current += 1;
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    for (const pending of pendingRequestsRef.current.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'Verbindung geschlossen.' });
    }
    pendingRequestsRef.current.clear();

    if (hostManagerRef.current) {
      hostManagerRef.current.destroy();
      hostManagerRef.current = null;
    }
    for (const conn of guestConnectionsRef.current.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    guestConnectionsRef.current.clear();

    if (guestConnRef.current) {
      try {
        guestConnRef.current.close();
      } catch {
        // ignore
      }
      guestConnRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // ignore
      }
      peerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupPeerResources();
    };
  }, [cleanupPeerResources]);

  const sendRequestToHost = useCallback(
    (msg: PeerReqPayload): Promise<RoomActionResponse> => {
      return new Promise((resolve) => {
        const conn = guestConnRef.current;
        if (!conn || !conn.open) {
          resolve({ ok: false, error: 'Keine Verbindung zum Host.' });
          return;
        }
        const requestId = safeRandomUUID();
        const timer = setTimeout(() => {
          pendingRequestsRef.current.delete(requestId);
          resolve({ ok: false, error: 'Zeitüberschreitung beim Host.' });
        }, 10_000);

        pendingRequestsRef.current.set(requestId, { resolve, timer });
        conn.send({ ...msg, requestId });
      });
    },
    []
  );

  const connectAsGuest = useCallback(
    (
      roomCode: string,
      onOpened: (conn: DataConnection) => Promise<RoomActionResponse>
    ): Promise<RoomActionResponse> => {
      cleanupPeerResources();
      saveGuestSession(null);

      const attemptId = ++attemptIdRef.current;
      const cleanCode = roomCode.trim().toUpperCase();
      const targetHostPeerId = `maedn-room-${cleanCode}`;

      return new Promise((resolve) => {
        let peer: Peer;
        try {
          peer = new Peer(PEER_OPTIONS);
        } catch {
          const msg = 'WebRTC P2P konnte nicht initialisiert werden.';
          setErrorBanner(msg);
          resolve({ ok: false, error: msg });
          return;
        }

        peerRef.current = peer;
        let settled = false;

        const fail = (message: string) => {
          if (settled || attemptId !== attemptIdRef.current) return;
          settled = true;
          setConnected(true);
          setErrorBanner(message);
          cleanupPeerResources();
          resolve({ ok: false, error: message });
        };

        connectTimeoutRef.current = setTimeout(() => {
          fail('Host nicht erreichbar oder Room existiert nicht.');
        }, 14_000);

        peer.on('open', () => {
          if (attemptId !== attemptIdRef.current) return;
          const conn = peer.connect(targetHostPeerId, { reliable: true });
          guestConnRef.current = conn;

          conn.on('data', (raw) => {
            if (attemptId !== attemptIdRef.current) return;
            const data = raw as PeerMsgToGuest;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'res') {
              const pending = pendingRequestsRef.current.get(data.requestId);
              if (pending) {
                clearTimeout(pending.timer);
                pendingRequestsRef.current.delete(data.requestId);
                pending.resolve(data.response);
              }
            } else if (data.type === 'state') {
              setRoomState(data.state);
            } else if (data.type === 'kicked') {
              saveGuestSession(null);
              cleanupPeerResources();
              setRoomState(null);
              setErrorBanner(data.reason);
            }
          });

          conn.on('open', async () => {
            if (attemptId !== attemptIdRef.current) return;
            setConnected(true);
            heartbeatRef.current = setInterval(() => {
              if (conn.open) {
                conn.send({ type: 'ping' } satisfies PeerMsgToHost);
              }
            }, 15_000);

            const res = await onOpened(conn);
            if (attemptId !== attemptIdRef.current) return;
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            if (!settled) {
              settled = true;
              if (!res.ok) {
                if (res.error) setErrorBanner(res.error);
                cleanupPeerResources();
              } else if (res.credentials) {
                saveGuestSession(res.credentials);
                setErrorBanner(null);
              }
              resolve(res);
            }
          });

          conn.on('close', () => {
            if (attemptId !== attemptIdRef.current) return;
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            if (!settled) {
              fail('Verbindung zum Host fehlgeschlagen.');
            } else {
              setConnected(false);
              setErrorBanner('Der Host hat die Verbindung beendet.');
              saveGuestSession(null);
              cleanupPeerResources();
              setRoomState(null);
            }
          });

          conn.on('error', () => {
            if (attemptId !== attemptIdRef.current) return;
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            fail('WebRTC-Verbindungsfehler zum Host.');
          });
        });

        peer.on('error', (err) => {
          if (attemptId !== attemptIdRef.current) return;
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          const msg =
            err.type === 'peer-unavailable'
              ? 'Room nicht gefunden. Prüfe den Room-Code oder ob der Host noch online ist.'
              : 'Verbindung zum Signaling-Dienst fehlgeschlagen.';
          fail(msg);
        });
      });
    },
    [cleanupPeerResources]
  );

  // Auto-rejoin guest session on reload
  useEffect(() => {
    const saved = loadGuestSession();
    if (!saved) return;
    void connectAsGuest(saved.credentials.roomCode, () =>
      sendRequestToHost({ type: 'rejoin', credentials: saved.credentials })
    );
  }, [connectAsGuest, sendRequestToHost]);

  const createRoom = useCallback(
    (playerName: string): Promise<RoomActionResponse> => {
      cleanupPeerResources();
      saveGuestSession(null);

      const attemptId = ++attemptIdRef.current;

      return new Promise((resolve) => {
        let attempts = 0;

        const tryCreate = () => {
          if (attemptId !== attemptIdRef.current) return;
          attempts += 1;
          const roomCode = generateBrowserRoomCode();
          const hostPeerId = `maedn-room-${roomCode}`;

          let peer: Peer;
          try {
            peer = new Peer(hostPeerId, PEER_OPTIONS);
          } catch {
            const msg = 'WebRTC P2P konnte im Browser nicht gestartet werden.';
            setErrorBanner(msg);
            resolve({ ok: false, error: msg });
            return;
          }

          peerRef.current = peer;
          let opened = false;

          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
          }
          connectTimeoutRef.current = setTimeout(() => {
            if (!opened && attemptId === attemptIdRef.current) {
              cleanupPeerResources();
              const msg = 'Konnte P2P-Host nicht starten. Bitte erneut versuchen.';
              setErrorBanner(msg);
              resolve({ ok: false, error: msg });
            }
          }, 15_000);

          peer.on('open', () => {
            if (attemptId !== attemptIdRef.current) return;
            opened = true;
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            setConnected(true);
            setErrorBanner(null);

            const manager = new BrowserHostManager(
              roomCode,
              playerName,
              (targetPeerId, state) => {
                if (attemptId !== attemptIdRef.current) return;
                if (targetPeerId === 'HOST_LOCAL') {
                  setRoomState(state);
                  return;
                }
                const conn = guestConnectionsRef.current.get(targetPeerId);
                if (conn?.open) {
                  conn.send({ type: 'state', state } satisfies PeerMsgToGuest);
                }
              },
              (targetPeerId, reason) => {
                const conn = guestConnectionsRef.current.get(targetPeerId);
                if (conn?.open) {
                  conn.send({ type: 'kicked', reason } satisfies PeerMsgToGuest);
                  setTimeout(() => conn.close(), 100);
                }
                guestConnectionsRef.current.delete(targetPeerId);
              }
            );
            hostManagerRef.current = manager;
            manager.broadcast();

            resolve({
              ok: true,
              credentials: {
                roomCode,
                playerId: manager.getHostPlayerId(),
                reconnectToken: 'host',
              },
            });
          });

          peer.on('connection', (conn) => {
            if (attemptId !== attemptIdRef.current) return;
            guestConnectionsRef.current.set(conn.peer, conn);

            conn.on('data', (raw) => {
              const msg = raw as PeerMsgToHost;
              const manager = hostManagerRef.current;
              if (!manager || !msg || typeof msg !== 'object') return;
              if (msg.type === 'ping') return;

              let response: RoomActionResponse = { ok: false, error: 'Ungültige Anfrage.' };
              if (msg.type === 'join') {
                response = manager.joinGuest(conn.peer, msg.playerName);
              } else if (msg.type === 'rejoin') {
                response = manager.rejoinGuest(conn.peer, msg.credentials);
              } else if (msg.type === 'action') {
                response = manager.handleAction(conn.peer, msg.action, msg.payload);
              }

              if (conn.open && 'requestId' in msg) {
                conn.send({
                  type: 'res',
                  requestId: msg.requestId,
                  response,
                } satisfies PeerMsgToGuest);
              }
            });

            conn.on('close', () => {
              guestConnectionsRef.current.delete(conn.peer);
              hostManagerRef.current?.handlePeerDisconnect(conn.peer);
            });

            conn.on('error', () => {
              guestConnectionsRef.current.delete(conn.peer);
              hostManagerRef.current?.handlePeerDisconnect(conn.peer);
            });
          });

          peer.on('disconnected', () => {
            if (attemptId !== attemptIdRef.current) return;
            try {
              if (!peer.destroyed) peer.reconnect();
            } catch {
              // ignore
            }
          });

          peer.on('error', (err) => {
            if (attemptId !== attemptIdRef.current) return;
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            if (!opened && err.type === 'unavailable-id' && attempts < 3) {
              peer.destroy();
              tryCreate();
              return;
            }
            if (!opened) {
              cleanupPeerResources();
              const msg = 'Verbindung zum P2P-Signaling fehlgeschlagen.';
              setErrorBanner(msg);
              resolve({ ok: false, error: msg });
            }
          });
        };

        tryCreate();
      });
    },
    [cleanupPeerResources]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string): Promise<RoomActionResponse> => {
      return connectAsGuest(roomCode, () =>
        sendRequestToHost({ type: 'join', playerName })
      );
    },
    [connectAsGuest, sendRequestToHost]
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    saveGuestSession(null);
    if (guestConnRef.current?.open) {
      await sendRequestToHost({ type: 'action', action: 'room:leave' });
    }
    cleanupPeerResources();
    setRoomState(null);
    setErrorBanner(null);
    setConnected(true);
  }, [cleanupPeerResources, sendRequestToHost]);

  const dispatchAction = useCallback(
    async (
      action: string,
      payload?: Record<string, unknown>,
      options?: { silentError?: boolean }
    ): Promise<RoomActionResponse> => {
      if (hostManagerRef.current) {
        const res = hostManagerRef.current.handleAction('HOST_LOCAL', action, payload);
        if (!res.ok && res.error && !options?.silentError) {
          setErrorBanner(res.error);
        }
        return res;
      }

      if (guestConnRef.current?.open) {
        const res = await sendRequestToHost({ type: 'action', action, payload });
        if (!res.ok && res.error && !options?.silentError) {
          setErrorBanner(res.error);
        }
        return res;
      }

      const msg = 'Keine aktive Verbindung zum Host.';
      if (!options?.silentError) setErrorBanner(msg);
      return { ok: false, error: msg };
    },
    [sendRequestToHost]
  );

  const toggleReady = useCallback(() => {
    void dispatchAction('room:toggle_ready');
  }, [dispatchAction]);

  const addBot = useCallback(() => {
    void dispatchAction('room:add_bot');
  }, [dispatchAction]);

  const removePlayer = useCallback(
    (targetPlayerId: string) => {
      void dispatchAction('room:remove_player', { targetPlayerId });
    },
    [dispatchAction]
  );

  const skipDisconnected = useCallback(
    (targetPlayerId: string) => {
      void dispatchAction('room:skip_disconnected', { targetPlayerId });
    },
    [dispatchAction]
  );

  const returnToLobby = useCallback(() => {
    void dispatchAction('room:next_round');
  }, [dispatchAction]);

  const rollDice = useCallback((): Promise<RoomActionResponse> => {
    return dispatchAction('game:roll', undefined, { silentError: true });
  }, [dispatchAction]);

  const movePawn = useCallback(
    (pawnIndex: 0 | 1 | 2 | 3): Promise<RoomActionResponse> => {
      return dispatchAction('game:move', { pawnIndex }, { silentError: true });
    },
    [dispatchAction]
  );

  return {
    connected,
    roomState,
    errorBanner,
    showError,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    addBot,
    removePlayer,
    skipDisconnected,
    returnToLobby,
    rollDice,
    movePawn,
  };
}

