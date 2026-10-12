import { getClanLeaderboardWeb } from "@/lib/db";
import { Flag, Shield, Trophy, Zap } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClansPage() {
  const clans = getClanLeaderboardWeb(50);
  
  return (
    <div className="w-full max-w-[1000px] mx-auto pb-20 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-[var(--blurple)] flex items-center justify-center text-white">
          <Flag size={32} />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold text-[var(--text-primary)]">
            Top Clans
          </h1>
          <p className="text-[var(--text-secondary)] text-lg">Global Clan Leaderboard</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-[var(--border)] mb-8 flex gap-4 items-start">
        <Shield className="text-[var(--blurple)] flex-shrink-0" size={28} />
        <div>
          <h3 className="font-bold text-lg mb-1">Clash of Pomo: Clans</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Create or join a Clan to team up with friends! When clan members study together in a <strong>/team</strong> session, they grant the entire Clan massive Synergy XP Boosts.
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="glass-panel rounded-3xl border border-[var(--border)] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-6 border-b border-[var(--border)] bg-black/20 text-sm font-bold text-[var(--text-secondary)]">
          <div className="col-span-2 md:col-span-1 text-center">Rank</div>
          <div className="col-span-6 md:col-span-6">Clan Name</div>
          <div className="col-span-2 md:col-span-2 text-center">Level</div>
          <div className="col-span-2 md:col-span-3 text-right">Clan XP</div>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {clans.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-secondary)]">
              <Zap size={48} className="mx-auto mb-4 opacity-20" />
              <p>No clans have been formed yet. Run <strong>/clan create</strong> to be the first!</p>
            </div>
          ) : (
            clans.map((clan, idx) => (
              <div 
                key={clan.id}
                className={`grid grid-cols-12 gap-4 p-6 items-center transition-colors hover:bg-white/[0.02] ${
                  idx < 3 ? 'bg-yellow-500/[0.04]' : ''
                }`}
              >
                <div className="col-span-2 md:col-span-1 text-center font-bold text-lg">
                  {idx === 0 ? <Trophy className="mx-auto text-yellow-400" /> : 
                   idx === 1 ? <span className="text-[var(--site-fg-2)] drop-shadow-md">#2</span> :
                   idx === 2 ? <span className="text-amber-600 drop-shadow-md">#3</span> : 
                   <span className="text-[var(--text-muted)]">#{idx + 1}</span>}
                </div>
                
                <div className="col-span-6 md:col-span-6 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-inner ${
                    idx === 0 ? 'bg-yellow-500 ring-2 ring-yellow-400/50' : 
                    idx === 1 ? 'bg-gray-400' : 
                    idx === 2 ? 'bg-amber-600' : 
                    'bg-[var(--bg-base)] border border-[var(--border)]'
                  }`}>
                    {clan.name ? clan.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div>
                    <div className="font-bold text-lg text-white truncate max-w-[150px] md:max-w-[300px]">
                      {clan.name || 'Unknown Clan'}
                    </div>
                  </div>
                </div>

                <div className="col-span-2 md:col-span-2 text-center text-[var(--text-secondary)] font-bold">
                  Lv. {clan.level}
                </div>

                <div className="col-span-2 md:col-span-3 text-right">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border)]">
                    <span className="font-mono text-[var(--orange-neon)] font-bold">{clan.xp} XP</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
    </div>
  );
}
