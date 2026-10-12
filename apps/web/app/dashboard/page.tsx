import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getUserStats, getUserPets, getUserSubjectAnalytics } from "@/lib/db";
import { Droplet, Star, Clock, Trophy, Target, BookOpen } from "lucide-react";
import SignOutButton from "./SignOutButton";

const PET_EMOJIS: Record<string, string> = {
  lazy_cat: "🐱",
  study_ant: "🐜",
  wise_owl: "🦉",
  loyal_dog: "🐶",
  coffee_spirit: "☕",
  magic_quill: "✒️",
  time_book: "📖",
  alien_student: "👽",
};

const SUBJECT_LABELS: Record<string, string> = {
  general: "General",
  math: "Math",
  language: "Language",
  coding: "Coding",
  reading: "Reading",
  exam: "Exam",
};

const PET_IMAGES: Record<string, string> = {
  lazy_cat: "cat",
  study_ant: "ant",
  wise_owl: "owl",
  loyal_dog: "dog",
  coffee_spirit: "coffee",
  magic_quill: "magicquill",
  time_book: "time",
  alien_student: "alien",
};

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  let stats: any = null;
  let pets: any[] = [];
  let subjectAnalytics: any = null;
  
  try {
    stats = await getUserStats(discordId);
    pets = await getUserPets(discordId);
    subjectAnalytics = await getUserSubjectAnalytics(discordId, 30);
  } catch (e) {
    console.error("Failed to fetch user stats", e);
  }

  const safeStats = stats || {
    water: 0,
    total_focus_minutes: 0,
    xp: 0,
    level: 1,
    streak: 0,
    total_sessions: 0
  };

  const calculateLevelProgress = (xp: number, level: number) => {
    const needed = 5 * level * level + 50 * level + 100;
    const progress = Math.min((xp / needed) * 100, 100);
    return progress;
  };

  const subjects = subjectAnalytics?.subjects || [];
  const bestSubject = subjectAnalytics?.bestSubject;

  return (
    <>
      {/* Header Row */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="relative">
            <Image 
              src={session.user.image || "/logo.png"} 
              alt="Profile" 
              width={100} 
              height={100} 
              className="rounded-full shadow-2xl border-4 border-[var(--bg-surface)]"
            />
            <div className="absolute -bottom-2 -right-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full px-2 py-1 text-xs font-bold shadow-lg">
              Lv. {safeStats.level}
            </div>
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold mb-1">{session.user.name}</h1>
            <p className="text-[var(--text-secondary)]">{session.user.email}</p>
          </div>
        </div>
        
        <SignOutButton />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        <div className="glass-panel p-6 border-t-2 border-t-[var(--blurple)] flex items-center gap-4 hover:-translate-y-1 transition-transform cursor-default">
          <div className="w-12 h-12 rounded-xl bg-[var(--blurple)]/10 flex items-center justify-center">
            <Clock className="text-[var(--blurple)]" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm font-medium">Total Focus Time</p>
            <h3 className="text-2xl font-bold">{Math.floor(safeStats.total_focus_minutes / 60)}h {safeStats.total_focus_minutes % 60}m</h3>
          </div>
        </div>

        <div className="glass-panel p-6 border-t-2 border-t-[var(--orange-neon)] flex items-center gap-4 hover:-translate-y-1 transition-transform cursor-default">
          <div className="w-12 h-12 rounded-xl bg-[var(--orange-neon)]/10 flex items-center justify-center">
            <Droplet className="text-[var(--orange-neon)]" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm font-medium">Water Balance</p>
            <h3 className="text-2xl font-bold">{safeStats.water} 💧</h3>
          </div>
        </div>

        <div className="glass-panel p-6 border-t-2 border-t-[var(--green-neon)] flex items-center gap-4 hover:-translate-y-1 transition-transform cursor-default">
          <div className="w-12 h-12 rounded-xl bg-[var(--green-neon)]/10 flex items-center justify-center">
            <Trophy className="text-[var(--green-neon)]" />
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm font-medium">Current Streak</p>
            <h3 className="text-2xl font-bold">{safeStats.streak} Days</h3>
          </div>
        </div>

      </div>

      {/* Extended Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="glass-panel p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Star className="text-yellow-400" size={20} /> Level Progress
          </h3>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">XP Amount</span>
            <span className="font-bold">{safeStats.xp} XP</span>
          </div>
          <div className="h-4 bg-black/40 rounded-full overflow-hidden border border-[var(--border)]">
            <div 
              className="h-full bg-[var(--blurple)]" 
              style={{ width: `${calculateLevelProgress(safeStats.xp, safeStats.level)}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2 italic text-right">
            Keep focusing to level up!
          </p>
        </div>

        <div className="glass-panel p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BookOpen className="text-blue-400" size={20} /> Subject Analytics
          </h3>
          {subjects.length > 0 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[var(--text-muted)]">Best</p>
                  <p className="font-bold">{SUBJECT_LABELS[bestSubject?.subject] || "General"}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">30d Focus</p>
                  <p className="font-bold">{Math.floor(subjectAnalytics.totalMinutes / 60)}h {subjectAnalytics.totalMinutes % 60}m</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Subjects</p>
                  <p className="font-bold">{subjectAnalytics.focusDiversity}</p>
                </div>
              </div>

              <div className="space-y-3">
              {subjects.map((row: any) => {
                const width = Math.max(8, row.percent);
                return (
                  <div key={row.subject}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-bold">{SUBJECT_LABELS[row.subject] || "General"}</span>
                      <span className="text-[var(--text-secondary)]">
                        {Math.floor(row.minutes / 60)}h {row.minutes % 60}m - {row.percent}% - {row.sessions} sessions
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                {subjectAnalytics.categorizedPercent}% of your last 30 days is categorized outside General.
              </p>
            </div>
          ) : (
            <div className="flex h-[120px] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-black/20">
              <p className="text-sm text-[var(--text-muted)]">Start sessions with subjects to see your focus split.</p>
            </div>
          )}
        </div>

        <div className="glass-panel p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Target className="text-red-400" size={20} /> Active Pets
          </h3>
          {pets.length > 0 ? (
            <div className="space-y-3">
              {pets.map((pet, i) => (
                <div key={i} className={`p-4 rounded-xl border ${pet.is_active ? 'border-[var(--blurple)] bg-[var(--blurple)]/5' : 'border-[var(--border)] bg-black/20'} flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 relative flex-shrink-0">
                      <Image 
                        src={`/pets/${PET_IMAGES[pet.pet_key] || 'dog'}.png`}
                        alt={pet.pet_key}
                        fill
                        className="object-contain drop-shadow-md"
                        unoptimized
                      />
                    </div>
                    <div>
                      <div className="font-bold capitalize flex items-center gap-2">
                        {pet.pet_key.replace('_', ' ')}
                        {pet.evolved === 1 && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-2 py-0.5 rounded-full font-bold">✨ Evolved</span>}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Level {pet.level} • {pet.xp} XP
                      </div>
                    </div>
                  </div>
                  {pet.is_active && (
                    <span className="text-[10px] bg-[var(--blurple)] text-white px-2 py-1 rounded-full font-bold uppercase">Equipped</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[120px] bg-black/20 rounded-xl border border-[var(--border)]">
              <div className="text-3xl mb-2 grayscale opacity-50">🥚</div>
              <p className="text-sm text-[var(--text-muted)]">No pets yet. Go visit the market!</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
