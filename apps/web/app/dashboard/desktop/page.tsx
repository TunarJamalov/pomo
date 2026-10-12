import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { createActivityToken } from "@/lib/activityAuth";
import { Monitor, KeyRound, ShieldCheck, Timer, ExternalLink, PlugZap } from "lucide-react";

export const revalidate = 0;

export default async function DesktopPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id as string;
  const token = createActivityToken({
    id: discordId,
    username: session.user.name || `User#${discordId.slice(-4)}`,
    avatar: session.user.image || null,
  });
  const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://pomofocus.online"}/api/desktop/session`;
  const connectUrl = `pomo://connect?token=${encodeURIComponent(token)}&apiUrl=${encodeURIComponent(apiUrl)}`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
          <Monitor className="text-emerald-300" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Pomo Desktop</h1>
          <p className="text-[var(--text-secondary)]">Connect the desktop app to sync completed focus sessions.</p>
        </div>
      </div>

      <div className="glass-panel p-8 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <PlugZap className="text-emerald-300" />
              <h2 className="text-xl font-bold">Connect Desktop App</h2>
            </div>
            <p className="text-[var(--text-secondary)]">
              If Pomo Desktop is installed, this opens the app and fills the sync token automatically.
            </p>
          </div>
          <a
            href={connectUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-black hover:-translate-y-1 transition-transform"
          >
            <Monitor size={18} />
            Open Pomo Desktop
          </a>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="text-[var(--blurple)]" />
          <h2 className="text-xl font-bold">Manual Token</h2>
        </div>
        <p className="text-[var(--text-secondary)] mb-4">
          If the button does not open the app yet, paste this token into the desktop app sync settings. It expires automatically, so refresh this page if sync stops later.
        </p>
        <textarea
          readOnly
          value={token}
          className="w-full min-h-32 rounded-xl bg-black/40 border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)] outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          icon={<Timer size={20} />}
          title="Sync Sessions"
          body="Completed desktop focus sessions can reward Water, XP, streak, and history."
        />
        <InfoCard
          icon={<ShieldCheck size={20} />}
          title="Safe Auth"
          body="The desktop app never needs your Discord password or the bot token."
        />
        <a
          href="/dashboard/history"
          className="glass-panel p-5 hover:-translate-y-1 transition-transform border border-[var(--border)]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[var(--blurple)]">
            <ExternalLink size={20} />
          </div>
          <h3 className="font-bold mb-2">View History</h3>
          <p className="text-sm text-[var(--text-secondary)]">Check synced sessions in your dashboard history.</p>
        </a>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass-panel p-5 border border-[var(--border)]">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[var(--blurple)]">
        {icon}
      </div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}
