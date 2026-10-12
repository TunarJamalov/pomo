import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserProfile, getUserThemes } from "@/lib/db";
import ProfileClient from "./ProfileClient";

export const revalidate = 0;

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const profile = getUserProfile(discordId);
  const unlockedThemes = getUserThemes(discordId);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <ProfileClient 
        initialProfile={profile} 
        discordUser={session.user} 
        unlockedThemes={unlockedThemes}
      />
    </div>
  );
}
