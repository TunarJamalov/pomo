import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Study Clans and Leagues",
  description: "Create a study clan on Discord, study together across servers and climb the global clan leaderboard with Pomo.",
  alternates: { canonical: "/tutorials/clans" },
};

export default function ClansTutorialPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-indigo-400 mb-6">⚔️ Clans & Leagues</h1>

      <p className="mb-8 text-lg">
        Clans are the most powerful way to grow in Pomo. Build your squad, grind together, and rise to the top of the <strong>Global Clan Leaderboard</strong>. Every minute studied by a clan member adds XP to the clan — regardless of which Discord server they study in.
      </p>

      {/* Create a clan */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-indigo-500/20 text-indigo-400 p-1 rounded-md">🛡️</span> Creating a Clan
      </h2>

      <div className="bg-indigo-900/10 border border-indigo-500/30 p-6 rounded-xl mb-8">
        <p className="text-[var(--text-secondary)] mb-4">
          Any user who meets the requirements can found their own clan. Requirements:
        </p>
        <ul className="text-[var(--text-secondary)] space-y-2 mb-5 text-sm">
          <li>✅ Be at least <strong className="text-white">Level 5</strong></li>
          <li>✅ Have at least <strong className="text-white">1,000 💧</strong> in your balance</li>
        </ul>
        <code className="block bg-black/40 p-3 rounded text-indigo-300 border border-indigo-500/20 font-bold text-sm">
          /clan create name:KetchupSquad
        </code>
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Clan name must be 3–20 characters. Names are unique across all servers. The 1,000 💧 is a one-time founding fee to prevent spam clans.
        </p>
      </div>

      {/* Join a clan */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-green-500/20 text-green-400 p-1 rounded-md">🤝</span> Joining a Clan
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-3 text-lg">1. Get Invited</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            A clan owner can send you an invite using:
          </p>
          <code className="block bg-black/40 p-2 rounded text-green-300 border border-green-500/20 font-bold text-sm mb-3">
            /clan invite @YourName
          </code>
          <p className="text-sm text-[var(--text-secondary)]">
            You'll receive a DM from PomoBot with the clan name.
          </p>
        </div>

        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-3 text-lg">2. Accept & Join</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Once you know the clan name, accept using:
          </p>
          <code className="block bg-black/40 p-2 rounded text-green-300 border border-green-500/20 font-bold text-sm mb-3">
            /clan join name:KetchupSquad
          </code>
          <p className="text-sm text-[var(--text-secondary)]">
            You can only be in <strong className="text-white">one clan at a time</strong>. Use <code className="text-red-300">/clan leave</code> to leave your current clan first.
          </p>
        </div>
      </div>

      {/* Synergy Boost */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-yellow-500/20 text-yellow-400 p-1 rounded-md">⚡</span> Synergy Boost
      </h2>

      <p className="mb-5 text-[var(--text-secondary)]">
        The most powerful mechanic in Pomo. If you and your clanmates study together in the same <code className="bg-black/40 px-1 rounded text-yellow-300">/team</code> room, your clan earns <strong className="text-white">bonus XP</strong> based on how many clanmates are in the room.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { players: "2 clanmates", bonus: "+20%", color: "green" },
          { players: "3 clanmates", bonus: "+40%", color: "blue" },
          { players: "4 clanmates", bonus: "+60%", color: "purple" },
          { players: "5+ clanmates", bonus: "+80%", color: "yellow" },
        ].map((tier) => (
          <div key={tier.players} className={`bg-${tier.color}-900/10 border border-${tier.color}-500/30 p-4 rounded-xl text-center`}>
            <div className={`text-2xl font-black text-${tier.color}-400 mb-1`}>{tier.bonus}</div>
            <div className="text-xs text-[var(--text-muted)]">{tier.players}</div>
          </div>
        ))}
      </div>

      <div className="bg-yellow-900/10 border border-yellow-500/30 p-5 rounded-xl mb-10">
        <h3 className="font-bold text-yellow-400 mb-2 flex items-center gap-2">
          💡 Pro Tip
        </h3>
        <p className="text-sm text-yellow-100/70">
          Coordinate with your clan via Discord. Open a <code className="bg-black/40 px-1 rounded text-yellow-300">/team</code> room, ping your clanmates, and start grinding together. The synergy bonus is applied automatically when the session ends.
        </p>
      </div>

      {/* Clan Treasury & Garden */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2 mt-8">
        <span className="bg-emerald-500/20 text-emerald-400 p-1 rounded-md">🌳</span> Clan Treasury & Community Garden
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        Starting in Phase 4, clans now have a shared <strong>Treasury</strong> and a <strong>Community Garden (Clan Tree)</strong>. Clan members can work together to grow their tree and earn global buffs!
      </p>

      <div className="bg-emerald-900/10 border border-emerald-500/30 p-6 rounded-xl mb-8">
        <h3 className="font-bold text-white mb-3 text-lg">How to Grow the Clan Tree</h3>
        <ol className="text-[var(--text-secondary)] space-y-3 mb-5 text-sm list-decimal pl-5">
          <li><strong>Donate:</strong> Use <code className="bg-black/40 px-1 rounded text-emerald-300">/clan donate &lt;item&gt;</code> to contribute your Water or Crops to the clan treasury.</li>
          <li><strong>Treasury:</strong> Use <code className="bg-black/40 px-1 rounded text-emerald-300">/clan treasury</code> to see what your clan has stored.</li>
          <li><strong>Upgrade:</strong> The Clan Owner or Co-owner uses <code className="bg-black/40 px-1 rounded text-emerald-300">/clan tree</code> to level up the Clan Tree once the required resources are collected.</li>
        </ol>
        <p className="text-sm font-bold text-emerald-300">
          ✨ Bonus: Every level of the Clan Tree gives all members +1% XP and +1% Water to EVERY study session!
        </p>
      </div>

      {/* Clan Commands */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-indigo-500/20 text-indigo-400 p-1 rounded-md">📋</span> All Clan Commands
      </h2>

      <div className="space-y-3 mb-10">
        {[
          { cmd: "/clan create <name>", desc: "Found a new clan (1,000 💧 fee, Level 5 required)" },
          { cmd: "/clan invite @user",  desc: "Send a clan invitation to another user (owner only)" },
          { cmd: "/clan join <name>",   desc: "Join a clan after receiving an invite" },
          { cmd: "/clan leave",         desc: "Leave your current clan" },
          { cmd: "/clan info",          desc: "View your clan's name, level, XP, and members" },
          { cmd: "/clan leaderboard",   desc: "See the top 10 global clans ranked by XP" },
          { cmd: "/clan donate",        desc: "Donate water or crops to your clan treasury" },
          { cmd: "/clan treasury",      desc: "View the clan treasury and Clan Tree status" },
          { cmd: "/clan tree",          desc: "Upgrade the Clan Tree using treasury resources" },
        ].map((row) => (
          <div key={row.cmd} className="flex gap-4 items-start bg-black/20 p-4 rounded-xl border border-[var(--border)]">
            <code className="text-indigo-300 font-bold text-sm shrink-0 bg-black/40 px-2 py-1 rounded">{row.cmd}</code>
            <p className="text-sm text-[var(--text-secondary)]">{row.desc}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-purple-500/20 text-purple-400 p-1 rounded-md">🏆</span> Global Clan Leaderboard
      </h2>

      <p className="text-[var(--text-secondary)] mb-4">
        Every clan in the world is ranked by total Clan XP. You can view the leaderboard two ways:
      </p>
      <ul className="text-[var(--text-secondary)] space-y-3 text-sm mb-6">
        <li className="flex items-start gap-2">
          <span className="text-indigo-400 font-bold shrink-0">Discord:</span>
          Run <code className="bg-black/40 px-1 mx-1 rounded text-indigo-300">/leaderboard</code> and select <strong className="text-white">🛡️ Top Clans</strong> from the dropdown.
        </li>
        <li className="flex items-start gap-2">
          <span className="text-indigo-400 font-bold shrink-0">Web:</span>
          Visit the <strong className="text-white">Clans</strong> tab on your <a href="/dashboard/clans" className="text-indigo-400 underline">Dashboard</a> to see live rankings with Level badges.
        </li>
      </ul>
    </>
  );
}
