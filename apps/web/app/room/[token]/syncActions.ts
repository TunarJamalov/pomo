"use server";

import { and, eq } from "drizzle-orm";
import { sessions } from "@pomo/db";
import { getDbClient, isProductivityDbEnabled } from "@/lib/services";
import {
  createRoomSocketToken,
  getRoomAccess,
  getRoomViewer,
  loadRoomParticipants,
  parseDbTimestamp,
  type RoomParticipant,
  toRoomTimerState,
  type RoomStatus,
  type RoomTimerState,
} from "@/lib/roomAuth";
import { rateLimit } from "@/lib/rateLimit";

export type RoomTimerAction = "start" | "pause" | "resume" | "stop";
const ACTIONS: readonly RoomTimerAction[] = ["start", "pause", "resume", "stop"];

/** Which status each action may be applied from. */
const ALLOWED_FROM: Record<RoomTimerAction, readonly RoomStatus[]> = {
  start: ["waiting"],
  pause: ["active"],
  resume: ["paused"],
  stop: ["active", "paused"],
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Host-only timer transition. The new state (status + timestamps) is computed
 * on the server from the stored state, so the client cannot write arbitrary
 * statuses or timestamps.
 */
export async function updateSessionStateAction(sessionId: string, action: RoomTimerAction): Promise<ActionResult<RoomTimerState>> {
  if (!isProductivityDbEnabled()) return { ok: false, error: "Rooms are unavailable right now." };
  if (typeof action !== "string" || !ACTIONS.includes(action)) return { ok: false, error: "Invalid action." };
  if (typeof sessionId !== "string") return { ok: false, error: "Invalid room." };

  const viewer = await getRoomViewer();
  if (!viewer || viewer.kind !== "user") return { ok: false, error: "Unauthorized" };
  if (!rateLimit(`room-update:${viewer.id}`, 30, 60_000)) return { ok: false, error: "Too many updates. Slow down." };

  const access = await getRoomAccess(sessionId, viewer);
  if (!access) return { ok: false, error: "Room not found." };
  if (!access.isHost) return { ok: false, error: "Only the host can control the timer." };

  const current = toRoomTimerState(access.session);
  if (!ALLOWED_FROM[action].includes(current.status)) {
    // Stale client: return the authoritative state instead of failing hard.
    return { ok: true, data: current };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const pausedAt = parseDbTimestamp(access.session.paused_at);
  const pausedSeconds = pausedAt ? Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000)) : 0;
  const pausedTotal = Math.max(0, Number(access.session.paused_total_seconds || 0));

  let update: Partial<typeof sessions.$inferInsert>;
  switch (action) {
    case "start":
      update = { status: "active", started_at: nowIso, paused_at: null, paused: false, paused_total_seconds: 0, ends_at: null };
      break;
    case "pause":
      update = { status: "paused", paused_at: nowIso, paused: true, pause_count: Number(access.session.pause_count || 0) + 1 };
      break;
    case "resume":
      update = { status: "active", paused_at: null, paused: false, paused_total_seconds: pausedTotal + pausedSeconds };
      break;
    case "stop":
    default:
      update = {
        status: "completed",
        ends_at: nowIso,
        paused_at: null,
        paused: false,
        paused_total_seconds: current.status === "paused" ? pausedTotal + pausedSeconds : pausedTotal,
      };
      break;
  }

  const dbClient = getDbClient();
  // Conditional on the status we validated against (guards concurrent clicks).
  const [updated] = await dbClient
    .update(sessions)
    .set(update)
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, current.status)))
    .returning();

  if (!updated) {
    const [fresh] = await dbClient.select().from(sessions).where(eq(sessions.id, sessionId));
    return fresh ? { ok: true, data: toRoomTimerState(fresh) } : { ok: false, error: "Room not found." };
  }
  return { ok: true, data: toRoomTimerState(updated) };
}

/** Participants list; only the host or a participant of that room may read it. */
export async function fetchParticipantsAction(sessionId: string): Promise<RoomParticipant[]> {
  if (!isProductivityDbEnabled() || typeof sessionId !== "string") return [];
  const viewer = await getRoomViewer();
  if (!viewer) return [];
  if (!rateLimit(`room-participants:${viewer.id}`, 60, 60_000)) return [];

  const access = await getRoomAccess(sessionId, viewer);
  if (!access || !access.isMember) return [];

  return loadRoomParticipants(sessionId, access.session.owner_id);
}

/**
 * Short-lived token for the Socket.io handshake (verified in server.js).
 * Issued only to the host or a participant of the room.
 */
export async function getRoomSocketTokenAction(sessionId: string): Promise<string | null> {
  if (!isProductivityDbEnabled() || typeof sessionId !== "string") return null;
  const viewer = await getRoomViewer();
  if (!viewer) return null;
  if (!rateLimit(`room-socket-token:${viewer.id}`, 20, 60_000)) return null;

  const access = await getRoomAccess(sessionId, viewer);
  if (!access || !access.isMember) return null;

  return createRoomSocketToken({
    sid: access.session.id,
    uid: viewer.id,
    kind: viewer.kind,
    host: access.isHost,
  });
}
