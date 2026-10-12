"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { updateUserProfile, getUserThemes } from "@/lib/db";
import { revalidatePath } from "next/cache";

const PRO_ACCENTS = new Set(["theme", "gold", "coral", "mint", "cyan", "violet"]);
const PRO_BADGES = new Set(["pomo_pro", "deep_work", "focus_club", "early_supporter"]);

export async function updateProfileAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  
  const discordId = (session.user as any).id;
  // Same 200-character limit as the profile form; the form alone can be bypassed.
  const bio = (formData.get("bio")?.toString() || "").slice(0, 200);
  const theme = formData.get("theme")?.toString() || "basic";
  const proAccent = formData.get("proAccent")?.toString() || "gold";
  const proBadge = formData.get("proBadge")?.toString() || "pomo_pro";
  
  // Security check: Verify user owns the theme
  const unlockedThemes = getUserThemes(discordId);
  if (!unlockedThemes.includes(theme)) {
    throw new Error("You do not own this theme!");
  }
  if (!PRO_ACCENTS.has(proAccent) || !PRO_BADGES.has(proBadge)) {
    throw new Error("Invalid Pro profile style.");
  }
  
  const success = updateUserProfile(discordId, bio, theme, proAccent, proBadge);
  
  if (success) {
    revalidatePath("/dashboard/profile");
  }
  
  return success;
}
