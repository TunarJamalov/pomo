"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Server, Settings, Plus, CheckCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { BOT_INVITE_URL } from "@/lib/links";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  hasBot: boolean;
  setupComplete: boolean;
}

export default function ServersClient() {
  const [servers, setServers] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/servers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setServers(data);
        } else if (data?.reauth) {
          setAuthError(data.error || "Your Discord login expired. Please sign in again.");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load servers", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-10 h-10 border-4 border-[var(--blurple)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[var(--text-secondary)]">Loading your servers...</p>
      </div>
    );
  }

  return (
    <div className="w-full pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Server className="w-8 h-8 text-[var(--blurple)]" />
          My Servers
        </h1>
        <p className="text-[var(--text-secondary)]">Manage PomoBot settings for the servers you own or administrate.</p>
      </div>

      {authError ? (
        <div className="bg-[#1e1f22] rounded-xl p-8 text-center border border-white/5">
          <Server className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Sign in again</h2>
          <p className="text-[var(--text-secondary)] mb-6">{authError}</p>
          <button onClick={() => signIn("discord")} className="py-2 px-5 rounded-lg bg-[var(--blurple)] text-white font-semibold">
            Sign in with Discord
          </button>
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-[#1e1f22] rounded-xl p-8 text-center border border-white/5">
          <Server className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Servers Found</h2>
          <p className="text-[var(--text-secondary)] mb-6">You don't have Manage Server permissions in any Discord server.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <div key={server.id} className="bg-[#1e1f22] rounded-xl border border-white/5 p-5 flex flex-col items-center text-center transition-all hover:bg-[#2b2d31]">
              {server.icon ? (
                <img src={server.icon} alt={server.name} className="w-20 h-20 rounded-full mb-4 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#2b2d31] flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-lg">
                  {server.name.charAt(0)}
                </div>
              )}
              <h3 className="text-lg font-bold text-white mb-1 truncate w-full">{server.name}</h3>
              
              <div className="mt-4 w-full">
                {server.hasBot ? (
                  <Link href={`/dashboard/servers/${server.id}`}>
                    <button className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--blurple)]/10 text-[var(--blurple)] hover:bg-[var(--blurple)] hover:text-white transition-colors font-semibold text-sm">
                      <Settings className="w-4 h-4" />
                      Manage Server
                    </button>
                  </Link>
                ) : (
                  <a href={`${BOT_INVITE_URL}&guild_id=${server.id}`} target="_blank" rel="noreferrer">
                    <button className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[#2b2d31] text-[var(--site-fg-2)] hover:bg-white hover:text-black transition-colors font-semibold text-sm">
                      <Plus className="w-4 h-4" />
                      Add PomoBot
                    </button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
