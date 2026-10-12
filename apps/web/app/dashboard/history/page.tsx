import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserSessions } from "@/lib/db";
import { Clock, CheckCircle2, XCircle, Timer, Calendar } from "lucide-react";

export const revalidate = 0; // Always fresh

const SUBJECT_LABELS: Record<string, string> = {
  general: "General",
  math: "Math",
  language: "Language",
  coding: "Coding",
  reading: "Reading",
  exam: "Exam",
};

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const sessions = getUserSessions(discordId);

  // Group by date
  const groupedSessions = sessions.reduce((acc: any, curr: any) => {
    const d = new Date(curr.started_at);
    // Create a localized date string (e.g. "April 14, 2026")
    const dateKey = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(curr);
    return acc;
  }, {});

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
          <Clock className="text-blue-500" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Session History</h1>
          <p className="text-[var(--text-secondary)]">Your timeline of focused deep work.</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="glass-panel p-12 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-black/30 rounded-full flex items-center justify-center mb-4 border border-[var(--border)]">
            <Timer className="text-[var(--text-muted)]" size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">No sessions found</h3>
          <p className="text-[var(--text-secondary)]">
            Start a timer in Discord using <code className="bg-black/40 px-2 py-1 rounded text-sm text-[var(--blurple)]">/study</code> to see your history here!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSessions).map(([date, daySessions]: [string, any]) => (
            <div key={date} className="relative">
              
              {/* Date Header */}
              <div className="sticky top-24 z-10 flex items-center gap-3 mb-4 bg-[var(--bg-base)]/90 py-2 px-1 rounded-lg">
                <Calendar size={18} className="text-blue-400" />
                <h2 className="font-bold text-lg">{date}</h2>
                <div className="h-px bg-[var(--border)] flex-1 ml-4" />
              </div>

              {/* Timeline Container */}
              <div className="ml-2 pl-6 border-l-2 border-[var(--border)] space-y-6">
                {daySessions.map((s: any) => {
                  const startTime = new Date(s.started_at);
                  const endTime = new Date(startTime.getTime() + s.duration * 60000);
                  const isCompleted = s.completed === 1;

                  return (
                    <div key={s.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-[var(--bg-base)] ${isCompleted ? 'bg-[var(--green-neon)]' : 'bg-[var(--orange-neon)]'}`} />
                      
                      <div className={`glass-panel p-5 transition-all duration-300 hover:translate-x-2 ${isCompleted ? 'hover:border-[var(--green-neon)]/50' : 'hover:border-[var(--orange-neon)]/50'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-lg">{s.title || "Study Session"}</h3>
                              {isCompleted ? (
                                <span className="bg-[var(--green-neon)]/10 text-[var(--green-neon)] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-[var(--green-neon)]/20 flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Finished
                                </span>
                              ) : (
                                <span className="bg-[var(--orange-neon)]/10 text-[var(--orange-neon)] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-[var(--orange-neon)]/20 flex items-center gap-1">
                                  <XCircle size={12} /> Incomplete
                                </span>
                              )}
                              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-300">
                                {SUBJECT_LABELS[s.subject] || "General"}
                              </span>
                            </div>
                            
                            <div className="text-[var(--text-secondary)] text-sm flex items-center gap-2">
                              <span>{startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                              <span className="text-[var(--text-muted)]">to</span>
                              <span>{endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                            </div>
                          </div>

                          <div className="flex-shrink-0 text-right">
                            <div className="text-3xl font-black text-[var(--text-primary)]">
                              {s.duration}
                              <span className="text-sm font-medium text-[var(--text-muted)] ml-1">min</span>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
