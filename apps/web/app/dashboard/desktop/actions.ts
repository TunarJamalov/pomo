"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { revokeDesktopTokens } from "@/lib/desktopTokens";

/** Signs out every Pomo Focus app connected to this account (lost or shared computer). */
export async function disconnectDesktopAppsAction() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");

  revokeDesktopTokens((session.user as { id: string }).id);
  redirect("/dashboard/desktop?disconnected=1");
}
