import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pomo Documentation",
  description: "Everything Pomo can do on Discord: Pomodoro and study timers, voice study tracking, streaks, water economy, pets, garden, clans and team sessions.",
  alternates: { canonical: "/tutorials" },
};

export default function TutorialsIntroPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-white mb-6">Welcome to Pomo Documentation</h1>
      
      <p className="mb-6 text-lg">
        Pomo is not just another Pomodoro timer. It's a complete <strong>productivity and gamification engine</strong> built entirely inside Discord.
      </p>

      <div className="bg-[var(--blurple)]/10 border-l-4 border-[var(--blurple)] p-6 rounded-r-xl mb-10">
        <h3 className="text-[var(--blurple)] font-bold text-xl mb-2">Our Philosophy</h3>
        <p className="text-white/80">
          Deep work shouldn't be lonely. By combining the proven Pomodoro technique with virtual pets, a growing garden, and real-time multiplayer studies, Pomo turns grinding into a game you actually want to play.
        </p>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 mt-8 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="bg-blue-500/20 text-blue-400 p-1 rounded-md">🎮</span> Core Mechanics
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-2 text-lg">1. Study Timers</h3>
          <p className="text-sm">Start /study to focus. You earn "Droplets" (💧) for every minute you study successfully.</p>
        </div>

        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-2 text-lg">2. Virtual Garden</h3>
          <p className="text-sm">Plant seeds in your garden and use your hard-earned water to grow them into full plants.</p>
        </div>

        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-2 text-lg">3. Collect Pets</h3>
          <p className="text-sm">Unbox pet boxes from the Market. Equip pets before studying to get huge XP multipliers!</p>
        </div>

        <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)]">
          <h3 className="font-bold text-white mb-2 text-lg">4. Team Sessions</h3>
          <p className="text-sm">Study alone or host a Team Room where all participants earn co-op rewards.</p>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-[var(--text-muted)] border-t border-[var(--border)] pt-8">
        Use the sidebar on the left to navigate through specific feature guides.
      </div>
    </>
  );
}
