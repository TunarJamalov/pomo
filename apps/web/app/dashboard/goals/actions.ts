"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getGoalService, getIdentityService, isProductivityDbEnabled } from "@/lib/services";
import { revalidatePath } from "next/cache";

async function resolveUserId() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  const discordId = (session.user as any).id;
  const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);
  if (!userId) throw new Error("User not found");
  return userId;
}

export async function createGoalAction(formData: FormData): Promise<void> {
  if (!isProductivityDbEnabled()) return;
  const userId = await resolveUserId();
  const type = formData.get("type")?.toString();
  const targetValueStr = formData.get("targetValue")?.toString();
  
  if (!type || !targetValueStr) return;
  const targetValue = parseInt(targetValueStr, 10);
  if (isNaN(targetValue) || targetValue <= 0) return;

  await getGoalService().createGoal(userId, type, targetValue);
  revalidatePath("/dashboard/goals");
}

export async function deleteGoalAction(goalId: string): Promise<void> {
  if (!isProductivityDbEnabled()) return;
  const userId = await resolveUserId();
  await getGoalService().deleteGoal(userId, goalId);
  revalidatePath("/dashboard/goals");
}
