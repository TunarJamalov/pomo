import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getLiveSessions } from "@/lib/db";
import { getDiscordUser } from "@/lib/discordApi";
import { Radio, Users } from "lucide-react";
import Image from "next/image";
import { isProductivityDbEnabled } from "@/lib/services";

const LIVE_ERRORS: Record<string, string> = {
  rooms_unavailable: "Web rooms are unavailable right now.",
  invalid_duration: "Choose a duration between 5 and 180 minutes.",
  invalid_title: "Room title must be 1-80 characters.",
};

export const revalidate = 0; // Dynamic because it's live

export default async function LiveSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);
  const query = await searchParams;
  const liveError = typeof query.error === "string" ? LIVE_ERRORS[query.error] ?? null : null;
  const roomsEnabled = isProductivityDbEnabled();

  if (!session || !session.user) {
    redirect("/");
  }

  const rawSessions = getLiveSessions();
  const currentTimestamp = new Date().getTime();

  // Populate missing discord user data
  const liveSessions = await Promise.all(
    rawSessions.map(async (room) => {
      const hostInfo = await getDiscordUser(room.host_id);
      
      const membersPopulated = await Promise.all(
        (room.members || []).map(async (m: any) => {
          const mInfo = await getDiscordUser(m.user_id);
          return { ...m, name: mInfo.name, avatar: mInfo.avatar };
        })
      );
      
      return {
        ...room,
        hostName: hostInfo.name,
        hostAvatar: hostInfo.avatar,
        members: membersPopulated
      };
    })
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="flex-1 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30 relative">
            <Radio className="text-red-500 animate-pulse" size={28} />
            <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </div>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              Live Rooms
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Live</span>
            </h1>
            <p className="text-[var(--text-secondary)]">Join forces with people focusing right now.</p>
          </div>
        </div>
        
        {/* Create Web Room Form */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-full md:w-80 shadow-lg">
          <h3 className="font-bold text-white mb-3">Create a Web Room</h3>
          {liveError && <p className="text-xs text-red-400 mb-2" role="alert">{liveError}</p>}
          {!roomsEnabled ? (
            <p className="text-sm text-[var(--text-secondary)]">Web rooms are not available on this server right now.</p>
          ) : (
          <form action={async (formData) => {
            "use server";
            const { createSharedRoomAction } = await import("./actions");
            await createSharedRoomAction(formData);
          }} className="space-y-3">
            <input type="text" name="title" placeholder="Room Title (e.g. Math Study)" required maxLength={80} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex gap-2">
              <select name="duration" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-24">
                <option value="25">25m</option>
                <option value="50">50m</option>
                <option value="90">90m</option>
              </select>
              <button type="submit" className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition-colors text-sm">
                Create & Invite
              </button>
            </div>
          </form>
          )}
        </div>
      </div>

      {liveSessions.length === 0 ? (
        <div className="glass-panel p-16 text-center flex flex-col items-center">
          <div className="text-5xl opacity-50 mb-4">🏜️</div>
          <h3 className="text-xl font-bold mb-2">No active rooms</h3>
          <p className="text-[var(--text-secondary)]">
            It's quiet. Start a team session in Discord using <code className="bg-black/40 px-2 py-1 rounded text-sm text-[var(--blurple)]">/team</code>!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {liveSessions.map((room) => {
            const isRunning = room.status === 'active' || room.status === 'break';
            const elapsedMins = isRunning ? Math.floor((currentTimestamp - new Date(room.started_at).getTime()) / 60000) : 0;
            
            return (
              <div key={room.id} className="glass-panel p-6 border-l-4 border-l-red-500 hover:-translate-y-1 transition-transform">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Image 
                        src={room.hostAvatar || "/logo.png"} 
                        alt={room.hostName} 
                        width={48} 
                        height={48} 
                        className="rounded-full border-2 border-red-500 shadow-lg"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full p-1 shadow-md">
                        👑
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">{room.hostName}'s Room</h3>
                      <div className={`text-xs font-bold uppercase mt-1 ${isRunning ? 'text-red-400' : 'text-blue-400'}`}>
                        {isRunning ? '▶ Running' : '⏸ Waiting for members'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-center">
                    <div className="text-2xl font-black font-mono">
                      {isRunning ? elapsedMins : '0'} <span className="text-[var(--text-muted)] text-sm">/ {room.duration}m</span>
                    </div>
                  </div>
                </div>

                <div className="bg-black/20 rounded-xl p-4 border border-[var(--border)]">
                  <h4 className="text-sm font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-1">
                    <Users size={14} /> Participants ({room.members.length})
                  </h4>
                  
                  <div className="flex flex-wrap gap-2">
                    {room.members.map((m: any) => (
                      <div key={m.user_id} className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full px-2 py-1 pe-3" title={`Joined at ${new Date(m.joined_at).toLocaleTimeString()}`}>
                        <Image 
                          src={m.avatar || "/logo.png"} 
                          alt={m.name} 
                          width={20} 
                          height={20} 
                          className="rounded-full"
                        />
                        <span className="text-xs font-bold">{m.name}</span>
                      </div>
                    ))}
                    
                    {room.members.length === 0 && (
                      <span className="text-xs text-[var(--text-muted)] italic">Waiting for people to join...</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
