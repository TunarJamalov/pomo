"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { equipUserPet } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function equipPetAction(petKey: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error("Unauthorized");
  
  const discordId = (session.user as any).id;
  
  const success = equipUserPet(discordId, petKey);
  if (success) {
    // Revalidate dashboard and pets to show updated active pet
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/pets");
  }
  return success;
}
