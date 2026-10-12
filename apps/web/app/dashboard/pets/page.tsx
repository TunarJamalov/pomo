import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserAllPets } from "@/lib/db";
import PetsClient from "./PetsClient";
import { PawPrint } from "lucide-react";

export const revalidate = 0; // Dynamic page

export default async function PetsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  // Get entire pet inventory for this user
  const pets = getUserAllPets(discordId);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
          <PawPrint className="text-orange-400" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Companions</h1>
          <p className="text-[var(--text-secondary)]">Manage your study pets and active boosts.</p>
        </div>
      </div>

      <PetsClient initialPets={pets} />

    </div>
  );
}
