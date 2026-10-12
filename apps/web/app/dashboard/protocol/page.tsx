import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getProtocolDashboardData } from "@/lib/db";
import { Award, Calendar, Eye, Flame, LockKeyhole, Medal, ShieldAlert, Sparkles } from "lucide-react";

const TITLE_META: Record<string, { name: string; emoji: string; description: string }> = {
  early_bird: { name: "Early Bird", emoji: "🌅", description: "Start before 6 AM" },
  night_owl: { name: "Night Owl", emoji: "🦉", description: "Start after midnight" },
  marathon_runner: { name: "Marathon Runner", emoji: "🏃", description: "Complete a 100-minute session" },
  dedicated: { name: "Dedicated", emoji: "🔥", description: "Maintain a 7-day streak" },
  committed: { name: "Committed", emoji: "💎", description: "Maintain a 30-day streak" },
  team_player: { name: "Team Player", emoji: "🤝", description: "Join 10 team sessions" },
  green_thumb: { name: "Garden Keeper", emoji: "🌱", description: "Harvest your first plant" },
  season_scholar: { name: "Season Scholar", emoji: "📜", description: "Earn 500 season XP" },
  focus_protocol_elite: { name: "Focus Protocol Elite", emoji: "⚡", description: "Earn 2,500 season XP" },
  protocol_pioneer: { name: "Protocol Pioneer", emoji: "🔐", description: "Join a classified event" },
};

function minutesLabel(minutes: number) {
  return `${Math.floor(Number(minutes || 0) / 60)}h ${Number(minutes || 0) % 60}m`;
}

export default async function ProtocolPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  const discordId = (session.user as any).id as string;
  const data = getProtocolDashboardData(discordId);
  const seasonXp = Number(data.user.season_xp || 0);
  const eventProgress = data.event
    ? Math.min(100, Math.round((Number(data.event.progress_minutes) / Number(data.event.target_minutes)) * 100))
    : 0;
  const activeTitle = data.user.active_title_key ? TITLE_META[data.user.active_title_key] : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-emerald-300">
            <ShieldAlert size={16} /> Focus Protocol
          </div>
          <h1 className="text-3xl font-bold md:text-4xl">Global Progress</h1>
          <p className="mt-2 text-[var(--text-secondary)]">Your seasonal rank, titles, and classified signals in one place.</p>
        </div>
        {activeTitle && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm">
            <span className="text-[var(--text-muted)]">Active title</span>
            <div className="mt-1 font-bold text-emerald-200">{activeTitle.emoji} {activeTitle.name}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-panel border border-[var(--border)] p-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[var(--product-desktop)]/15 p-3 text-[var(--product-desktop)]"><Sparkles size={22} /></div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">Current season</p>
                <h2 className="text-2xl font-bold">{data.season?.name || "Waiting for next season"}</h2>
              </div>
            </div>
            <Calendar className="text-[var(--product-desktop)]" size={22} />
          </div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Your season XP</span>
            <span className="font-bold">{seasonXp} XP</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-[var(--product-desktop)]" style={{ width: `${Math.min(100, (seasonXp / 500) * 100)}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-4">
              <p className="text-[var(--text-muted)]">Season focus</p>
              <p className="mt-1 font-bold">{minutesLabel(data.user.season_focus_minutes)}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-4">
              <p className="text-[var(--text-muted)]">Started</p>
              <p className="mt-1 font-bold">{data.season?.started_at ? new Date(data.season.started_at).toLocaleDateString() : "-"}</p>
            </div>
          </div>
        </section>

        <section className="glass-panel border border-emerald-400/20 bg-emerald-400/[0.04] p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-400/15 p-3 text-emerald-200"><LockKeyhole size={22} /></div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Classified signal</p>
              <h2 className="text-xl font-bold">{data.event?.title || "No active event"}</h2>
            </div>
          </div>
          {data.event ? (
            <>
              <p className="mb-4 text-sm text-[var(--text-secondary)]">{data.event.description}</p>
              <div className="mb-2 flex justify-between text-sm"><span>Global focus</span><span className="font-bold">{eventProgress}%</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[var(--leaf)]" style={{ width: `${eventProgress}%` }} /></div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]"><Eye size={14} /> {data.event.clues.length} clue{data.event.clues.length === 1 ? "" : "s"} decoded</div>
            </>
          ) : <p className="text-sm text-[var(--text-muted)]">The next signal has not been activated yet.</p>}
        </section>
      </div>

      <section className="glass-panel p-7">
        <div className="mb-6 flex items-center gap-3"><Award className="text-amber-300" /><h2 className="text-xl font-bold">Your Titles</h2></div>
        {data.titles.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.titles.map((row: any) => {
              const title = TITLE_META[row.title_key] || { name: row.title_key, emoji: "🏷️", description: "Pomo title" };
              return <div key={row.title_key} className={`rounded-xl border p-4 ${row.active_title_key === row.title_key ? "border-emerald-400/50 bg-emerald-400/10" : "border-[var(--border)] bg-black/20"}`}><div className="font-bold">{title.emoji} {title.name}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{title.description}</p></div>;
            })}
          </div>
        ) : <p className="text-sm text-[var(--text-muted)]">Complete achievements or season goals to unlock titles.</p>}
      </section>

      <section className="glass-panel p-7">
        <div className="mb-6 flex items-center gap-3"><Medal className="text-yellow-300" /><h2 className="text-xl font-bold">Season Leaderboards</h2></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Leaderboard title="Top Users" rows={data.leaderboards.users} label={(row: any) => `<@${row.discord_id}>`} />
          <Leaderboard title="Top Servers" rows={data.leaderboards.guilds} label={(row: any) => row.guild_name || row.guild_id} />
          <Leaderboard title="Top Clans" rows={data.leaderboards.clans} label={(row: any) => row.name} />
        </div>
      </section>
    </div>
  );
}

function Leaderboard({ title, rows, label }: { title: string; rows: any[]; label: (row: any) => string }) {
  return <div><h3 className="mb-3 flex items-center gap-2 font-bold"><Flame size={16} className="text-orange-300" />{title}</h3><div className="space-y-2">{rows.length ? rows.slice(0, 5).map((row, index) => <div key={row.discord_id || row.guild_id || row.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-sm"><span className="truncate"><span className="mr-2 text-[var(--text-muted)]">{index + 1}.</span>{label(row)}</span><span className="font-bold text-violet-200">{row.season_xp} XP</span></div>) : <p className="text-sm text-[var(--text-muted)]">No activity yet.</p>}</div></div>;
}
