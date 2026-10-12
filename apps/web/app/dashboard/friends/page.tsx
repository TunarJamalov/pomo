import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserFriends } from "@/lib/db";
import { getDiscordUser } from "@/lib/discordApi";
import { Users, Clock, Medal } from "lucide-react";
import Image from "next/image";

export const revalidate = 60;

export default async function FriendsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/");
  }

  const discordId = (session.user as any).id;
  const rawFriends = getUserFriends(discordId);

  // Fetch discord data for all friends
  const friends = await Promise.all(
    rawFriends.map(async (friend) => {
      const discordInfo = await getDiscordUser(friend.discord_id);
      return {
        ...friend,
        name: discordInfo.name,
        avatar: discordInfo.avatar,
      };
    })
  );

  // Sort friends by total focus time
  friends.sort((a, b) => b.total_focus_minutes - a.total_focus_minutes);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[var(--discord)]/20 flex items-center justify-center border border-[var(--discord)]/30">
          <Users className="text-[var(--discord)]" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Friends List</h1>
          <p className="text-[var(--text-secondary)]">Your inner circle of focused scholars.</p>
        </div>
      </div>

      <div className="glass-panel p-8">
        {friends.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-black/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--border)]">
              <span className="text-4xl grayscale opacity-50">👥</span>
            </div>
            <h3 className="text-xl font-bold mb-2">No friends yet</h3>
            <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              Use <code className="bg-black/40 px-2 py-1 rounded text-sm text-[var(--blurple)]">/friend add</code> in Discord to invite studying buddies and keep each other accountable.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {friends.map((friend, i) => {
              const isFirst = i === 0;
              return (
                <div key={friend.discord_id} className={`p-5 rounded-2xl border transition-transform hover:-translate-y-1 ${isFirst ? 'bg-[var(--discord)]/10 border-[var(--discord)]/40 relative overflow-hidden' : 'bg-black/30 border-[var(--border)]'}`}>
                  
                  {isFirst && (
                    <div className="absolute top-0 right-0 bg-[var(--discord)] text-white text-[10px] uppercase font-bold py-1 px-3 rounded-bl-lg">
                      Top Friend 👑
                    </div>
                  )}

                  <div className="flex flex-col items-center text-center">
                    <Image 
                      src={friend.avatar || "/logo.png"} 
                      alt={friend.name} 
                      width={80} 
                      height={80} 
                      className={`rounded-full shadow-lg mb-3 border-2 ${isFirst ? 'border-[var(--discord)]' : 'border-[var(--bg-surface)]'}`}
                    />
                    <h3 className="text-xl font-bold truncate w-full px-2" title={friend.name}>
                      {friend.name}
                    </h3>
                    
                    <div className="flex gap-2 flex-wrap items-center justify-center mt-3 w-full">
                      <div className="bg-black/40 border border-[var(--border)] px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium">
                        <Medal size={14} className="text-[var(--text-muted)]" />
                        Lv. {friend.level}
                      </div>
                      <div className="bg-black/40 border border-[var(--border)] px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium">
                        <Clock size={14} className="text-[var(--blurple)]" />
                        {Math.floor(friend.total_focus_minutes / 60)}h {friend.total_focus_minutes % 60}m
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
