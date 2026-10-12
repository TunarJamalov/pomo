import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { and, eq, inArray } from 'drizzle-orm';
import { guest_users, session_participants, sessions } from '@pomo/db';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getActivityTokenSecret } from '@/lib/activityAuth';
import { getDbClient, getIdentityService } from '@/lib/services';

/** Room-scoped guest cookie (path = /room/<token>). */
export const GUEST_COOKIE = 'pomo_room_guest';
/** Pre-existing site-wide guest cookie, still honoured (membership is checked). */
export const LEGACY_GUEST_COOKIE = 'pomo_guest_token';

export const ROOM_STATUSES = ['waiting', 'active', 'paused', 'completed'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;

export type RoomViewer =
  | { kind: 'user'; id: string; name: string | null; avatar: string | null }
  | { kind: 'guest'; id: string; name: string | null; avatar: null };

/**
 * Resolve who is calling: a Discord-authenticated user (mapped to the Postgres
 * user id) or a guest (via the guest cookie). `createUser` only applies to the
 * page render, which historically created the Postgres identity on first visit.
 */
export async function getRoomViewer(options: { createUser?: boolean } = {}): Promise<RoomViewer | null> {
  const authSession = await getServerSession(authOptions);
  const discordId = (authSession?.user as any)?.id as string | undefined;
  if (discordId) {
    const identity = getIdentityService();
    const userId = options.createUser
      ? await identity.resolveIdentity('discord', discordId).then(r => r.userId)
      : await identity.lookupIdentity('discord', discordId);
    if (!userId) return null;
    return {
      kind: 'user',
      id: userId,
      name: authSession?.user?.name ?? null,
      avatar: authSession?.user?.image ?? null,
    };
  }

  const cookieStore = await cookies();
  const guestToken = cookieStore.get(GUEST_COOKIE)?.value || cookieStore.get(LEGACY_GUEST_COOKIE)?.value;
  if (!guestToken || guestToken.length > 128) return null;

  const dbClient = getDbClient();
  const [guest] = await dbClient
    .select({ id: guest_users.id, display_name: guest_users.display_name, expires_at: guest_users.expires_at })
    .from(guest_users)
    .where(eq(guest_users.token, guestToken));
  if (!guest || !isFuture(guest.expires_at)) return null;
  return { kind: 'guest', id: guest.id, name: guest.display_name ?? 'Guest', avatar: null };
}

/** Parse a Postgres `timestamp` (without tz, stored as UTC) or ISO string. */
export function parseDbTimestamp(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z';
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isFuture(value: string | Date | null | undefined, now = Date.now()) {
  const date = parseDbTimestamp(value);
  return Boolean(date && date.getTime() > now);
}

export type RoomAccess = {
  session: typeof sessions.$inferSelect;
  isHost: boolean;
  isMember: boolean;
};

/**
 * Load a room and the viewer's relationship to it. `isMember` is true for the
 * owner and for anyone with a session_participants row.
 */
export async function getRoomAccess(sessionId: string, viewer: RoomViewer | null): Promise<RoomAccess | null> {
  if (!UUID_RE.test(sessionId)) return null;
  const dbClient = getDbClient();
  const [session] = await dbClient.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return null;
  if (!viewer) return { session, isHost: false, isMember: false };

  const isHost = viewer.kind === 'user' && session.owner_id === viewer.id;
  if (isHost) return { session, isHost, isMember: true };

  const participantColumn = viewer.kind === 'user' ? session_participants.user_id : session_participants.guest_id;
  const [participant] = await dbClient
    .select({ id: session_participants.id })
    .from(session_participants)
    .where(and(eq(session_participants.session_id, sessionId), eq(participantColumn, viewer.id)));
  return { session, isHost: false, isMember: Boolean(participant) };
}

/** Public, serialisable timer state for a room. */
export function toRoomTimerState(session: typeof sessions.$inferSelect) {
  const status = (ROOM_STATUSES as readonly string[]).includes(session.status) ? (session.status as RoomStatus) : 'waiting';
  return {
    status,
    startedAt: parseDbTimestamp(session.started_at)?.toISOString() ?? null,
    pausedAt: parseDbTimestamp(session.paused_at)?.toISOString() ?? null,
    endsAt: parseDbTimestamp(session.ends_at)?.toISOString() ?? null,
    pausedTotalSeconds: Math.max(0, Number(session.paused_total_seconds || 0)),
  };
}
export type RoomTimerState = ReturnType<typeof toRoomTimerState>;

// ---------------------------------------------------------------------------
// Socket.io handshake token. Verified in server.js (keep the formats in sync):
//   token = base64url(JSON claims) + "." + base64url(HMAC-SHA256(key, payload))
//   key   = HMAC-SHA256(activity secret, "pomo-room-socket-v1")
// A distinct derived key means activity/desktop tokens can never be used here.
// ---------------------------------------------------------------------------
export type RoomSocketClaims = {
  typ: 'room_socket';
  sid: string; // Postgres sessions.id
  uid: string; // Postgres users.id or guest_users.id
  kind: 'user' | 'guest';
  host: boolean;
  exp: number; // unix seconds
};

const ROOM_SOCKET_TOKEN_TTL_SECONDS = 5 * 60;

function roomSocketKey() {
  const secret = getActivityTokenSecret();
  if (!secret) throw new Error('Missing ACTIVITY_TOKEN_SECRET or fallback secret');
  return crypto.createHmac('sha256', secret).update('pomo-room-socket-v1').digest();
}

export function createRoomSocketToken(input: Omit<RoomSocketClaims, 'typ' | 'exp'>) {
  const claims: RoomSocketClaims = {
    typ: 'room_socket',
    ...input,
    exp: Math.floor(Date.now() / 1000) + ROOM_SOCKET_TOKEN_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', roomSocketKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export type RoomParticipant = {
  id: string;
  is_guest: boolean;
  user_id: string | null;
  role: string;
  name: string;
};

/** Not a server action: callers must check access first. */
export async function loadRoomParticipants(sessionId: string, ownerId: string | null): Promise<RoomParticipant[]> {
  const dbClient = getDbClient();
  const rawParts = await dbClient
    .select({
      id: session_participants.id,
      user_id: session_participants.user_id,
      guest_id: session_participants.guest_id,
      role: session_participants.role,
    })
    .from(session_participants)
    .where(eq(session_participants.session_id, sessionId));

  const guestIds = rawParts.filter((p: any) => p.guest_id).map((p: any) => p.guest_id as string);
  const guestNames: Record<string, string> = {};
  if (guestIds.length > 0) {
    const guests = await dbClient
      .select({ id: guest_users.id, display_name: guest_users.display_name })
      .from(guest_users)
      .where(inArray(guest_users.id, guestIds));
    guests.forEach((g: any) => { guestNames[g.id] = g.display_name || 'Guest'; });
  }

  return rawParts.map((p: any) => ({
    id: p.id,
    is_guest: !!p.guest_id,
    user_id: p.guest_id || p.user_id,
    role: p.role,
    name: p.guest_id ? (guestNames[p.guest_id] || 'Guest') : (p.user_id === ownerId ? 'Host' : 'Discord User'),
  }));
}

