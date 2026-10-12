import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team Study Sessions on Discord",
  description: "Host group Pomodoro study sessions on Discord with Pomo: friends join with one button, focus together and earn rewards as a team.",
  alternates: { canonical: "/tutorials/team-sessions" },
};

export default function TeamSessionsPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-rose-400 mb-6">Team Sessions</h1>
      
      <p className="mb-8 text-lg">
        The ultimate way to battle procrastination is by doing it together. Team sessions bring the feeling of a real-world study hall right into your Discord server.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        
        <div className="bg-rose-900/10 border border-rose-500/30 p-6 rounded-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-rose-300">
            👑 Hosting a Room
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Any user can create a team session by running:
          </p>
          <code className="block bg-black/40 p-3 rounded text-rose-200 border border-rose-500/20 font-bold mb-4 text-sm">
            /team minutes:25
          </code>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Optional parameters:
          </p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1.5">
            <li><code className="text-rose-300">limit:</code> Max participants (2–20, default 10)</li>
            <li><code className="text-rose-300">break:</code> Break duration in minutes</li>
            <li><code className="text-rose-300">cycles:</code> Number of study cycles (max 4)</li>
          </ul>
        </div>

        <div className="bg-blue-900/10 border border-blue-500/30 p-6 rounded-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-300">
            👋 Joining a Room
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            When a host creates a lobby, a Discord message appears with a <strong>"Join Lobby"</strong> button. Simply <strong>click that button</strong> to join — there is no slash command to join!
          </p>
          <div className="bg-black/40 rounded-xl p-4 border border-white/10 text-center">
            <div className="text-xs text-[var(--text-muted)] mb-2">Discord Message Preview</div>
            <div className="inline-block bg-[#5865F2] text-white text-sm font-bold px-4 py-2 rounded-lg">
              ✅ Join Lobby
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-4">
            ⚠️ You must join <strong>before</strong> the host clicks Start. Once the session begins, no new members can join.
          </p>
        </div>

      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="text-xl">🔄</span> How a Session Flows
      </h2>

      <div className="space-y-4 mb-10">
        {[
          { icon: "1", label: "Host runs /team minutes:25", desc: "A lobby message appears with a Join button and member count." },
          { icon: "2", label: "Members click Join Lobby", desc: "Everyone who wants to study clicks the Join button on the message." },
          { icon: "3", label: "Host clicks Start", desc: "The host clicks the Start button. The focus timer begins for all members simultaneously." },
          { icon: "4", label: "Session completes", desc: "When time's up, all participants who stayed earn Water and XP together. Co-op bonuses apply!" },
        ].map((step) => (
          <div key={step.icon} className="flex gap-4 items-start bg-black/20 p-5 rounded-xl border border-[var(--border)]">
            <div className="w-8 h-8 shrink-0 rounded-full bg-rose-500/30 flex items-center justify-center font-black text-rose-300 border border-rose-500/30">
              {step.icon}
            </div>
            <div>
              <h3 className="font-bold text-white">{step.label}</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="text-xl">💰</span> Co-op Rewards Bonus
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        To encourage group study, Pomo implements a bonus for Team Sessions. The more members studying together in one lobby, the more Water and XP everyone earns! Studying alone in silence is good, but grinding with a squad is better. 🔥
      </p>

      <div className="p-6 bg-yellow-900/10 border border-yellow-500/30 rounded-xl">
        <h3 className="font-bold text-yellow-400 mb-2 flex items-center gap-2">
          💡 Tip: Cancel a Session
        </h3>
        <p className="text-sm text-yellow-100/70">
          If you need to end a team session early (as the host), use <code className="bg-black/40 px-1 rounded text-yellow-300">/cancel</code>. This will terminate the lobby and notify all participants.
        </p>
      </div>
    </>
  );
}
