import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserSessions } from "@/lib/db";
import TimerClient from "./TimerClient";

export const dynamic = 'force-dynamic';

export default async function TimerPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const sessions = getUserSessions(discordId);
  
  // Get today's sessions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s: any) => {
    const d = new Date(s.started_at);
    return d >= today;
  });

  // Subjects live in Postgres (Pomo 2.0). The timer itself works without it.
  const { getIdentityService, getSubjectService, isProductivityDbEnabled } = await import("@/lib/services");
  let subjects: any[] = [];
  if (isProductivityDbEnabled()) {
    try {
      const userId = await getIdentityService().resolveIdentity('discord', discordId).then(r => r.userId);
      if (userId) {
        subjects = await getSubjectService().listSubjects(userId);
      }
    } catch (err) {
      console.error('[Timer] Failed to load subjects from Postgres:', err);
    }
  }

  return (
    <div className="w-full h-full min-h-[calc(100vh-6rem)]">
      <TimerClient initialTodaySessions={todaySessions} subjects={subjects} />
    </div>
  );
}
