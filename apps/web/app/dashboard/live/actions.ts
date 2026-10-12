"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getDbClient, getIdentityService, isProductivityDbEnabled } from "@/lib/services";
import { sessions } from "@pomo/db";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";

const MIN_DURATION = 5;
const MAX_DURATION = 180;
const MAX_TITLE_LENGTH = 80;

export async function createSharedRoomAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  if (!isProductivityDbEnabled()) redirect("/dashboard/live?error=rooms_unavailable");

  const duration = Number.parseInt(formData.get("duration")?.toString() || "50", 10);
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    redirect("/dashboard/live?error=invalid_duration");
  }

  const title = (formData.get("title")?.toString() || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!title || title.length > MAX_TITLE_LENGTH) {
    redirect("/dashboard/live?error=invalid_title");
  }

  const discordId = (session.user as any).id;
  const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);
  if (!userId) throw new Error("User not found");

  const sharedToken = nanoid(10); // generate random 10-char token

  const dbClient = getDbClient();
  await dbClient.insert(sessions).values({
    owner_id: userId,
    type: 'team',
    duration,
    title,
    status: 'waiting', // Waiting for others to join before starting
    is_public: true,
    shared_url_token: sharedToken,
  });

  redirect(`/room/${sharedToken}`);
}
