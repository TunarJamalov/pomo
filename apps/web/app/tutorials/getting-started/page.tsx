import type { Metadata } from "next";
import { BOT_INVITE_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Getting Started: Add a Pomodoro Bot to Discord",
  description: "Add Pomo to your Discord server or your own account, run 1-click setup and start your first Pomodoro study session in under a minute.",
  alternates: { canonical: "/tutorials/getting-started" },
};

export default function GettingStartedPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-white mb-6">Getting Started with Pomo</h1>
      
      <p className="mb-8 text-lg">
        Setting up Pomo in your Discord server takes literally 10 seconds. We've designed it to work straight out of the box with zero complex configuration.
      </p>

      <div className="space-y-12">
        
        {/* Step 1 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full border border-[var(--site-line-strong)] flex items-center justify-center font-mono text-xs text-[var(--site-fg-2)]">1</span> 
            Invite the Bot
          </h2>
          <p className="mb-4 text-[var(--text-secondary)]">
            First, invite Pomo using the official link below. Pomo requests only the channel permissions it needs to send timers, embeds, reports, and profile images. Administrator permission is not required.
          </p>
          <a href={BOT_INVITE_URL} className="btn btn-tomato h-11 px-6">
            Add PomoBot to Discord
          </a>
        </section>

        {/* Step 2 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full border border-[var(--site-line-strong)] flex items-center justify-center font-mono text-xs text-[var(--site-fg-2)]">2</span> 
            Configure Your Server
          </h2>
          <p className="mb-4">
            A server manager can configure automatic voice tracking and weekly reports with:
          </p>
          <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl text-white font-mono mb-4 text-sm flex items-center gap-2">
            <span className="text-zinc-500">/</span>setup start
          </div>
          <ul className="list-disc pl-6 space-y-2 mb-4 marker:text-[var(--blurple)]">
            <li>Select a voice channel or category for automatic study tracking.</li>
            <li>Select a text channel for weekly server reports.</li>
            <li>Use <code className="bg-white/10 px-1 rounded">/setup status</code> to review the configuration.</li>
          </ul>
        </section>

        {/* Step 3 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full border border-[var(--site-line-strong)] flex items-center justify-center font-mono text-xs text-[var(--site-fg-2)]">3</span> 
            Start Studying
          </h2>
          <p className="mb-4">
            Join the configured study voice channel or start a manual focus timer:
          </p>
          <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl text-white font-mono mb-4 text-sm flex items-center gap-2">
            <span className="text-zinc-500">/</span>study <span className="text-blue-400">duration:</span><span className="text-orange-300">25</span>
          </div>
          <p>
            Finished focus time earns Water and XP for pets, gardens, quests, clans, and profile progression.
          </p>
        </section>

      </div>
    </>
  );
}
