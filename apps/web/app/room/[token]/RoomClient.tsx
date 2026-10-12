"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Users, Play, Square, Pause } from "lucide-react";

import {
  updateSessionStateAction,
  fetchParticipantsAction,
  getRoomSocketTokenAction,
  type RoomTimerAction,
} from "./syncActions";

type RoomStatus = "waiting" | "active" | "paused" | "completed";

type TimerState = {
  status: RoomStatus;
  startedAt: string | null;
  pausedAt: string | null;
  endsAt: string | null;
  pausedTotalSeconds: number;
};

type Participant = {
  id: string;
  is_guest: boolean;
  user_id: string | null;
  role: string;
  name: string;
};

type RoomInfo = {
  id: string;
  title: string | null;
  duration: number;
  owner_id: string | null;
};

const STATUSES: readonly RoomStatus[] = ["waiting", "active", "paused", "completed"];

function isTimerState(value: any): value is TimerState {
  return Boolean(
    value &&
    STATUSES.includes(value.status) &&
    (value.startedAt === null || typeof value.startedAt === "string") &&
    (value.pausedAt === null || typeof value.pausedAt === "string") &&
    (value.endsAt === null || value.endsAt === undefined || typeof value.endsAt === "string") &&
    Number.isFinite(Number(value.pausedTotalSeconds ?? 0))
  );
}

/**
 * Focus seconds elapsed: wall time since start minus accumulated pauses,
 * frozen while paused (at pausedAt) and after completion (at endsAt).
 */
function computeElapsedSeconds(timer: TimerState, nowMs: number) {
  if (timer.status === "waiting" || !timer.startedAt) return 0;
  const start = Date.parse(timer.startedAt);
  if (!Number.isFinite(start)) return 0;
  let reference = nowMs;
  if (timer.status === "paused" && timer.pausedAt) reference = Date.parse(timer.pausedAt);
  else if (timer.status === "completed" && timer.endsAt) reference = Date.parse(timer.endsAt);
  if (!Number.isFinite(reference)) reference = nowMs;
  return Math.max(0, Math.floor((reference - start) / 1000) - Math.max(0, Number(timer.pausedTotalSeconds || 0)));
}

export default function RoomClient({
  session,
  initialTimer,
  isHost,
  currentUser,
  initialParticipants,
}: {
  session: RoomInfo;
  initialTimer: TimerState;
  isHost: boolean;
  currentUser: { id: string; name: string | null; avatar: string | null; type: string } | null;
  initialParticipants: Participant[];
}) {
  const socketRef = useRef<Socket | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants || []);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshParticipants = useCallback(() => {
    // Debounce bursts of join events.
    if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(async () => {
      try {
        const fresh = await fetchParticipantsAction(session.id);
        setParticipants(fresh);
      } catch {
        // ignore; the list refreshes on the next join event
      }
    }, 500);
  }, [session.id]);

  useEffect(() => {
    // Custom Socket.io server on the same origin. The handshake needs a
    // short-lived room token, fetched fresh on every (re)connect.
    const socket = io({
      auth: (cb) => {
        getRoomSocketTokenAction(session.id)
          .then((token) => cb({ token }))
          .catch(() => cb({}));
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_session", session.id);
    });

    socket.on("user_joined", () => {
      refreshParticipants();
    });

    socket.on("timer_updated", (data: unknown) => {
      if (isTimerState(data)) {
        setTimer({
          status: data.status,
          startedAt: data.startedAt,
          pausedAt: data.pausedAt,
          endsAt: data.endsAt ?? null,
          pausedTotalSeconds: Number(data.pausedTotalSeconds || 0),
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
    };
  }, [session.id, refreshParticipants]);

  // Local clock tick for the countdown display.
  useEffect(() => {
    if (timer.status !== "active") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.status]);

  const handleAction = async (action: RoomTimerAction) => {
    if (!isHost || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The server computes the new state (status + timestamps).
      const res = await updateSessionStateAction(session.id, action);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTimer(res.data);
      setNow(Date.now());
      // Fast fan-out to participants; the socket server only relays host events.
      socketRef.current?.emit("sync_timer", { sessionId: session.id, ...res.data });
    } catch {
      setError("Could not update the timer. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const elapsedSeconds = computeElapsedSeconds(timer, now);

  const formatTime = (seconds: number) => {
    const totalGoal = session.duration * 60;
    const remaining = Math.max(0, totalGoal - seconds);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto bg-black/40 border border-white/10 rounded-xl p-8 text-center mt-20">
        <h2 className="text-2xl font-bold text-white mb-2">Join {session.title}</h2>
        <p className="text-[var(--text-secondary)] mb-6">Please log in to join this study session.</p>
        {/* NextAuth sign-in is a route handler, so a full navigation is intended. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/auth/signin" className="bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white px-6 py-3 rounded-xl font-bold transition-colors inline-block">
          Login with Discord
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="text-[var(--blurple)]" />
            {session.title}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Shared Study Room • {session.duration} mins</p>
        </div>

        <div className="text-right">
          <div className="text-5xl font-mono font-black text-white tabular-nums tracking-tight">
            {formatTime(elapsedSeconds)}
          </div>
          <p className="text-sm font-bold uppercase mt-2 text-green-400">
            {timer.status}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">{error}</p>
      )}

      {/* Host Controls */}
      {isHost && timer.status !== 'completed' && (
        <div className="bg-white/5 border border-[var(--blurple)]/30 rounded-2xl p-6 flex justify-center gap-4">
          {(timer.status === 'waiting' || timer.status === 'paused') && (
            <button disabled={busy} onClick={() => handleAction(timer.status === 'paused' ? 'resume' : 'start')} className="bg-[var(--blurple)] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:-translate-y-1 transition-transform disabled:opacity-50">
              <Play size={20} fill="currentColor" /> {timer.status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}

          {timer.status === 'active' && (
            <button disabled={busy} onClick={() => handleAction('pause')} className="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:-translate-y-1 transition-transform disabled:opacity-50">
              <Pause size={20} fill="currentColor" /> Pause
            </button>
          )}

          {(timer.status === 'active' || timer.status === 'paused') && (
            <button disabled={busy} onClick={() => handleAction('stop')} className="bg-red-500/20 text-red-500 border border-red-500/30 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:-translate-y-1 transition-transform disabled:opacity-50">
              <Square size={20} fill="currentColor" /> Stop & Finish
            </button>
          )}
        </div>
      )}

      {timer.status === 'completed' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-green-400 font-bold">This session has been completed and archived.</p>
          {isHost && (
            <p className="text-[var(--text-secondary)] text-sm mt-2">Go back to your dashboard to start a new session.</p>
          )}
        </div>
      )}

      {/* Participants */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Participants ({participants.length})</h3>
        <div className="flex flex-wrap gap-4">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-4 py-2">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                {p.is_guest ? 'G' : 'D'}
              </div>
              <div>
                <p className="font-bold text-white text-sm">{p.name} {p.user_id === session.owner_id ? '(Host)' : ''}</p>
                <p className="text-xs text-[var(--text-muted)]">{p.is_guest ? 'Guest' : 'Discord'}</p>
              </div>
            </div>
          ))}
          {participants.length === 0 && (
             <div className="text-[var(--text-secondary)] text-sm italic">You are the only one here.</div>
          )}
        </div>
      </div>

    </div>
  );
}
