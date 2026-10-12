"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { processStorePurchase } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function buyStoreItemAction(itemKey: string, cost: number, itemType: 'theme' | 'pet_box' | 'seed_pack' | 'generic') {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  
  const discordId = (session.user as any).id;
  
  const result = await processStorePurchase(discordId, itemKey, cost, itemType);
  
  if (result.success) {
    revalidatePath("/dashboard/store");
    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard/pets");
    revalidatePath("/dashboard/garden");
    revalidatePath("/dashboard");
  }
  
  return result;
}
