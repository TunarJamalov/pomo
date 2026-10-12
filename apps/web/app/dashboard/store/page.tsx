import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserStats, getUserThemes } from "@/lib/db";
import StoreClient from "./StoreClient";
import { Store, Droplet } from "lucide-react";

export const revalidate = 0;

export default async function StorePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const stats = getUserStats(discordId);
  const unlockedThemes = getUserThemes(discordId);

  const waterBalance = stats?.water || 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6 bg-black/20 p-8 rounded-3xl border border-[var(--border)] relative overflow-hidden">
        {/* Fancy Background Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex items-center gap-5 z-10">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
            <Store className="text-blue-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black mb-1 text-[var(--text-primary)]">Pomo Store</h1>
            <p className="text-[var(--text-secondary)]">Spend the water you've earned from deep work sessions.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-black/40 px-6 py-4 rounded-2xl border border-white/10 z-10 shadow-inner">
          <div className="p-3 bg-blue-500/20 rounded-xl">
            <Droplet className="text-blue-400 fill-blue-400/50" size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Your Balance</div>
            <div className="text-3xl font-black text-white font-mono leading-none">{waterBalance}</div>
          </div>
        </div>
      </div>

      <StoreClient waterBalance={waterBalance} unlockedThemes={unlockedThemes} />

    </div>
  );
}
