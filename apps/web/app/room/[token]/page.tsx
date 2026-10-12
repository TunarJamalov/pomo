import { and, eq } from "drizzle-orm";
import { sessions, session_participants } from "@pomo/db";
import { getDbClient, isProductivityDbEnabled } from "@/lib/services";
import { getRoomAccess, getRoomViewer, loadRoomParticipants, ROOM_TOKEN_RE, toRoomTimerState } from "@/lib/roomAuth";
import FeatureUnavailable from "@/components/FeatureUnavailable";
import RoomClient from "./RoomClient";
import { createGuestAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many guest sign-ins from your network. Please wait a few minutes and try again.",
  room_closed: "This room has already finished.",
};

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const errorKey = typeof query.error === "string" ? query.error : null;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? null : null;

  if (!isProductivityDbEnabled()) {
    return (
      <div className="min-h-screen bg-black/90 px-4 pb-4 pt-32">
        <FeatureUnavailable title="Web rooms are unavailable" message="Shared web rooms need the Pomo 2.0 database, which is not enabled on this server right now." backHref="/" />
      </div>
    );
  }

  if (!ROOM_TOKEN_RE.test(token)) {
    return <div className="p-8 text-center text-white">Room not found or expired.</div>;
  }

  const dbClient = getDbClient();

  // 1. Fetch Session By Token
  const [sessionRow] = await dbClient.select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.shared_url_token, token));

  if (!sessionRow) {
    return <div className="p-8 text-center text-white">Room not found or expired.</div>;
  }

  // 2. Resolve viewer (Discord user or guest)
  const viewer = await getRoomViewer({ createUser: true });
  let access = await getRoomAccess(sessionRow.id, viewer);
  if (!access) {
    return <div className="p-8 text-center text-white">Room not found or expired.</div>;
  }

  // 3. Discord users join the room by opening its link (existing behaviour).
  //    Guests are joined when they create their guest identity for this room
  //    (createGuestAction), so a guest cookie never grants access to other rooms.
  if (viewer?.kind === "user" && !access.isMember) {
    const [existing] = await dbClient
      .select({ id: session_participants.id })
      .from(session_participants)
      .where(and(eq(session_participants.session_id, sessionRow.id), eq(session_participants.user_id, viewer.id)));
    if (!existing) {
      await dbClient.insert(session_participants).values({
        session_id: sessionRow.id,
        user_id: viewer.id,
        role: 'member',
      });
    }
    access = { ...access, isMember: true };
  }

  const sessionData = access.session;

  if (!viewer || !access.isMember) {
    return (
      <div className="min-h-screen bg-black/90 px-4 pb-4 pt-32 flex items-center justify-center">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Join {sessionData.title}</h2>
          <p className="text-[var(--text-secondary)] mb-8 text-center text-sm">You can log in with Discord or join as a guest.</p>

          {errorMessage && (
            <p className="mb-6 text-center text-sm text-red-400" role="alert">{errorMessage}</p>
          )}

          {/* NextAuth sign-in is a route handler, so a full navigation is intended. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signin" className="w-full bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white px-6 py-3 rounded-xl font-bold transition-colors block text-center mb-6">
            Login with Discord
          </a>

          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative bg-black/90 px-4 text-sm text-[var(--text-muted)] font-bold uppercase">Or join as Guest</div>
          </div>

          <form action={createGuestAction} className="space-y-4">
            <input type="hidden" name="room_token" value={token} />
            <input
              type="text"
              name="display_name"
              placeholder="Your Name (e.g. Alex)"
              required
              maxLength={32}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-white/30 outline-none"
            />
            <button type="submit" className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors">
              Continue as Guest
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 4. Initial participants (only ids/names needed by the UI)
  const participants = await loadRoomParticipants(sessionData.id, sessionData.owner_id);

  const currentUser = { id: viewer.id, name: viewer.name, avatar: viewer.avatar, type: viewer.kind === 'user' ? 'discord' : 'guest' };
  const roomInfo = {
    id: sessionData.id,
    title: sessionData.title,
    duration: sessionData.duration,
    owner_id: sessionData.owner_id,
  };

  return (
    <div className="min-h-screen bg-black/90 px-4 pb-4 pt-32 md:px-12 md:pb-12 md:pt-36">
      <RoomClient
        session={roomInfo}
        initialTimer={toRoomTimerState(sessionData)}
        isHost={access.isHost}
        currentUser={currentUser}
        initialParticipants={participants}
      />
    </div>
  );
}
