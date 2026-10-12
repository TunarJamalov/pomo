"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { guest_users, session_participants, sessions } from "@pomo/db";
import { getDbClient, isProductivityDbEnabled } from "@/lib/services";
import { GUEST_COOKIE, ROOM_TOKEN_RE } from "@/lib/roomAuth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

function cleanDisplayName(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value : "";
  // Strip control characters and collapse whitespace.
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
  return cleaned || "Guest";
}

export async function createGuestAction(formData: FormData) {
  const roomToken = formData.get("room_token")?.toString() || "";
  if (!ROOM_TOKEN_RE.test(roomToken)) redirect("/");
  if (!isProductivityDbEnabled()) redirect(`/room/${roomToken}`);

  // Per-IP rate limit on guest creation.
  const ip = getClientIp(await headers());
  if (!rateLimit(`guest-create:${ip}`, 5, 10 * 60_000)) {
    redirect(`/room/${roomToken}?error=rate_limited`);
  }

  const dbClient = getDbClient();

  // The room must exist and still be joinable.
  const [room] = await dbClient
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.shared_url_token, roomToken));
  if (!room) redirect(`/room/${roomToken}`);
  if (room.status === "completed") redirect(`/room/${roomToken}?error=room_closed`);

  const displayName = cleanDisplayName(formData.get("display_name"));
  const guestToken = nanoid(32);
  const expiresAt = new Date(Date.now() + GUEST_TTL_MS);

  const [guest] = await dbClient.insert(guest_users).values({
    token: guestToken,
    display_name: displayName,
    expires_at: expiresAt.toISOString(),
  }).returning({ id: guest_users.id, token: guest_users.token });

  // Bind the guest to THIS room: membership is what authorises the room's
  // server actions and socket token for guests.
  const [existing] = await dbClient
    .select({ id: session_participants.id })
    .from(session_participants)
    .where(and(eq(session_participants.session_id, room.id), eq(session_participants.guest_id, guest.id)));
  if (!existing) {
    await dbClient.insert(session_participants).values({
      session_id: room.id,
      guest_id: guest.id,
      role: "member",
    });
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: GUEST_COOKIE,
    value: guest.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Only sent for this room's page (and the server actions it posts to).
    path: `/room/${roomToken}`,
    expires: expiresAt,
  });

  // Redirect to clear the form POST state
  redirect(`/room/${roomToken}`);
}
