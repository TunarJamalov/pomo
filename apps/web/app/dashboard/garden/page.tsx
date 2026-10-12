import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserGarden, getUserHarvests } from "@/lib/db";
import { Leaf, Droplet, Clock, Sprout } from "lucide-react";

const STAGE_IMAGES: Record<number, { emoji: string; name: string }> = {
  0: { emoji: "🌱", name: "Seed" },
  1: { emoji: "🌿", name: "Sprout" },
  2: { emoji: "🪴", name: "Growing" },
  3: { emoji: "🌸", name: "Budding" },
  4: { emoji: "💮", name: "Blooming" },
  5: { emoji: "🌺", name: "Mature" },
};

export default async function GardenPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const garden = await getUserGarden(discordId);
  const harvests = await getUserHarvests(discordId);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[var(--green-neon)]/20 flex items-center justify-center border border-[var(--green-neon)]/30">
          <Leaf className="text-[var(--green-neon)]" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Virtual Garden</h1>
          <p className="text-[var(--text-secondary)]">Watch your focus blossom into beautiful plants.</p>
        </div>
      </div>

      {/* Garden Grid */}
      <div className="glass-panel p-8 mb-8">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Sprout className="text-[var(--green-neon)]" /> My Plots
        </h2>
        
        {garden.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {garden.map((plot) => {
              const stageInfo = STAGE_IMAGES[plot.stage] || STAGE_IMAGES[0];
              const isMature = plot.stage >= 5;

              return (
                <div key={plot.id} className="relative group perspective-1000">
                  <div className={`w-full aspect-square rounded-2xl border ${isMature ? 'border-yellow-400/50 bg-yellow-400/10' : 'border-[var(--green-neon)]/30 bg-[var(--green-neon)]/5'} flex flex-col items-center justify-center p-4 transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-2`}>
                    <div className="text-5xl drop-shadow-2xl mb-2 animate-bounce-slow">
                      {stageInfo.emoji}
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-sm capitalize">{plot.plant_type}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{stageInfo.name}</p>
                    </div>

                    <div className="absolute -top-2 -right-2 bg-blue-500/20 border border-blue-500 rounded-full px-2 py-0.5 flex items-center gap-1 text-[10px] font-bold text-blue-300">
                      <Droplet size={10} /> {plot.water_used}
                    </div>
                  </div>
                  
                  {/* Tooltip on hover */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Planted:</span>
                      <span className="font-medium">{new Date(plot.planted_at).toLocaleDateString()}</span>
                    </div>
                    {plot.last_watered && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Watered:</span>
                        <span className="font-medium text-blue-400">{new Date(plot.last_watered).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Empty Plots representation usually users have max 10 plots. We can show some empty ones to encourage playing */}
            {Array.from({ length: Math.max(0, 5 - garden.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="w-full aspect-square rounded-2xl border border-[var(--border)] bg-black/20 flex flex-col items-center justify-center p-4 opacity-50 border-dashed">
                <div className="text-3xl mb-2 grayscale">🌱</div>
                <p className="text-xs text-[var(--text-muted)]">Empty Plot</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-24 h-24 rounded-full bg-[var(--border)] flex items-center justify-center mb-4">
              <Leaf className="text-[var(--text-muted)]" size={40} />
            </div>
            <h3 className="text-xl font-bold mb-2">Your garden is empty</h3>
            <p className="text-[var(--text-secondary)] max-w-md">
              Focus in PomoBot, earn seeds, and plant them to start growing your virtual garden!
            </p>
          </div>
        )}
      </div>

      {/* Harvests */}
      <div className="glass-panel p-8">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Clock className="text-yellow-400" /> Harvest Collection
        </h2>
        
        {harvests.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {harvests.map((harvest, i) => (
              <div key={i} className="flex items-center gap-3 bg-black/30 border border-[var(--border)] rounded-xl px-4 py-3">
                <div className="text-2xl">🌺</div>
                <div>
                  <div className="font-bold capitalize">{harvest.plant_type}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Harvested {harvest.count} times</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-muted)] text-sm">
            You haven't harvested any fully grown plants yet. Keep watering them!
          </p>
        )}
      </div>

    </div>
  );
}
