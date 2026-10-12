import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getLeaderboard } from "@/lib/db";
import { getDiscordUser } from "@/lib/discordApi";
import Image from "next/image";
import { Trophy, Clock } from "lucide-react";

// Server component cache is fine, but we also want it fresh reasonably often
export const revalidate = 60; // seconds

export default async function LeaderboardPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  // Fetch db data
  const rawLeaderboard = getLeaderboard(50); // Get top 50 users
  
  // Resolve discord info in parallel
  const enrichedLeaderboard = await Promise.all(
    rawLeaderboard.map(async (user, index) => {
      const discordInfo = await getDiscordUser(user.discord_id);
      return {
        ...user,
        name: discordInfo.name,
        avatar: discordInfo.avatar,
        rank: index + 1
      };
    })
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[var(--purple-neon)]/20 flex items-center justify-center border border-[var(--purple-neon)]/30">
          <Trophy className="text-[var(--purple-neon)]" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Global Leaderboard</h1>
          <p className="text-[var(--text-secondary)]">The most dedicated scholars in the sanctuary.</p>
        </div>
      </div>

      {/* Top 3 Podium (Optional, simple version for now) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {enrichedLeaderboard.slice(0, 3).map((user, i) => {
          const isFirst = i === 0;
          const isSecond = i === 1;
          const isThird = i === 2;
          
          let ringColor = "";
          let iconColor = "";
          if (isFirst) { ringColor = "border-yellow-400"; iconColor = "text-yellow-400"; }
          if (isSecond) { ringColor = "border-gray-300"; iconColor = "text-[var(--site-fg-2)]"; }
          if (isThird) { ringColor = "border-orange-600"; iconColor = "text-orange-600"; }

          return (
            <div key={user.discord_id} className={`glass-panel p-6 flex flex-col items-center text-center relative overflow-hidden ${isFirst ? 'md:-translate-y-4 border-yellow-400/30 bg-yellow-400/5' : ''}`}>
              {isFirst && <div className="absolute top-0 w-full h-1 bg-yellow-400" />}
              <div className="relative mb-4">
                <Image 
                  src={user.avatar || "/logo.png"} 
                  alt={user.name} 
                  width={80} 
                  height={80} 
                  className={`rounded-full border-4 ${ringColor}`}
                />
                <div className={`absolute -bottom-3 -right-3 w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center font-bold shadow-lg ${iconColor}`}>
                  {i + 1}
                </div>
              </div>
              <h3 className="text-lg font-bold truncate w-full">{user.name}</h3>
              <p className="text-[var(--text-secondary)] text-sm mb-3">Level {user.level}</p>
              
              <div className="flex items-center gap-2 text-sm font-medium bg-black/30 px-3 py-1.5 rounded-lg border border-[var(--border)]">
                <Clock size={14} className="text-[var(--blurple)]" />
                {Math.floor(user.total_focus_minutes / 60)}h {user.total_focus_minutes % 60}m
              </div>
            </div>
          );
        })}
      </div>

      {/* List */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-white/5">
                <th className="p-4 font-semibold text-[var(--text-secondary)] w-16 text-center">Rank</th>
                <th className="p-4 font-semibold text-[var(--text-secondary)]">Scholar</th>
                <th className="p-4 font-semibold text-[var(--text-secondary)]">Level & XP</th>
                <th className="p-4 font-semibold text-[var(--text-secondary)]">Total Focus</th>
                <th className="p-4 font-semibold text-[var(--text-secondary)] hidden sm:table-cell">Streak</th>
              </tr>
            </thead>
            <tbody>
              {enrichedLeaderboard.slice(3).map((user) => (
                <tr key={user.discord_id} className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors">
                  <td className="p-4 text-center font-bold text-[var(--text-muted)]">
                    #{user.rank}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Image 
                        src={user.avatar || "/logo.png"} 
                        alt={user.name} 
                        width={40} 
                        height={40} 
                        className="rounded-full"
                      />
                      <span className="font-bold">{user.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-bold flex items-center gap-1">
                        Level {user.level}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{user.xp} XP</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-[var(--blurple)]">
                      {Math.floor(user.total_focus_minutes / 60)}h {user.total_focus_minutes % 60}m
                    </span>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <span className="flex items-center gap-1 font-medium text-[var(--green-neon)]">
                      🔥 {user.streak}
                    </span>
                  </td>
                </tr>
              ))}
              {enrichedLeaderboard.length <= 3 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    Not enough scholars in the sanctuary yet to fill the list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
