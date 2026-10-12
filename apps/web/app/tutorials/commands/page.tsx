import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All Commands",
  description: "Full list of Pomo slash commands for Discord: /study, /pomodoro, /team, /voice, /goal, /garden, /pet, /market, /clan and more.",
  alternates: { canonical: "/tutorials/commands" },
};

export default function CommandsPage() {
  const sections = [
    {
      title: "📚 Study",
      color: "blue",
      commands: [
        { cmd: "/study [duration]", desc: "Start a solo Pomodoro timer for a given number of minutes." },
        { cmd: "/pomodoro", desc: "Start a classic work/break cycle session with auto-switching." },
        { cmd: "/team [minutes]", desc: "Host a group study room. Friends join with the Join button." },
        { cmd: "/voice stats", desc: "View automatically tracked voice focus time and rewards." },
        { cmd: "/goal status", desc: "View the server's weekly focus goal and your contribution." },
        { cmd: "/goal leaderboard", desc: "See the top contributors to this week's server goal." },
        { cmd: "/goal claim", desc: "Claim the weekly reward after the server completes its goal." },
        { cmd: "/break [duration]", desc: "Start a standalone break timer. No XP or water awarded." },
        { cmd: "/cancel", desc: "Force stop your active session or lobby." },
        { cmd: "/todo", desc: "Manage your personal to-do list. Complete tasks to earn 💧." },
        { cmd: "/plan", desc: "Create and view your long-term study roadmap." },
      ],
    },
    {
      title: "🗓️ Habits",
      color: "green",
      commands: [
        { cmd: "/habit add <name> [emoji] [goal] [unit] [days_per_week]", desc: "Track a new habit: yes/no, a daily goal like 8 glasses, or N days a week." },
        { cmd: "/habit check", desc: "Tick off today's habits with one button each. Each finished habit gives +1 💧 (up to 3 a day)." },
        { cmd: "/habit view", desc: "See a 26-week grid of every habit with current and best streaks, including your Pomo focus days." },
        { cmd: "/habit log <habit> [amount]", desc: "Add to or correct today's count (use a negative number to undo)." },
        { cmd: "/habit remove <habit>", desc: "Stop tracking a habit. Its history is kept." },
        { cmd: "/habit timezone <zone>", desc: "Choose which time zone decides when your habit day starts." },
      ],
    },
    {
      title: "⚔️ Clans",
      color: "purple",
      commands: [
        { cmd: "/clan create <name>", desc: "Found a new clan. Costs 1,000 💧 and requires Level 5." },
        { cmd: "/clan invite @user", desc: "Send a clan invitation via DM. Only the clan owner can invite." },
        { cmd: "/clan join <name>", desc: "Join a clan after receiving an invite." },
        { cmd: "/clan leave", desc: "Leave your current clan. Owners cannot leave directly." },
        { cmd: "/clan info", desc: "View your clan's level, XP, total focus time, and members." },
        { cmd: "/clan leaderboard", desc: "Show the global Top 10 clans ranked by Clan XP." },
      ],
    },
    {
      title: "🏪 Water Economy",
      color: "yellow",
      commands: [
        { cmd: "/market", desc: "Open the shop to spend 💧 on boosts, seeds, and themes." },
        { cmd: "/daily", desc: "Claim your daily free water reward. Resets every 24 hours." },
        { cmd: "/send @user <amount> <reason>", desc: "Send water to another user. Requires owner approval. Level 3+." },
        { cmd: "/vote", desc: "Vote on Top.gg for bonus water rewards." },
      ],
    },
    {
      title: "🌱 Garden & Pets",
      color: "green",
      commands: [
        { cmd: "/garden", desc: "View your garden. Plant seeds, water plants, and harvest crops." },
        { cmd: "/pet inventory", desc: "View all your pets and their current level and bonuses." },
        { cmd: "/pet equip <pet>", desc: "Equip a pet to earn passive XP or Water bonuses." },
      ],
    },
    {
      title: "👥 Social & Stats",
      color: "indigo",
      commands: [
        { cmd: "/profile [@user]", desc: "View your or another user's profile card with stats." },
        { cmd: "/stats", desc: "Your personal study statistics — daily, weekly, all-time." },
        { cmd: "/recap", desc: "Generate a shareable image recap of your last 7 focus days." },
        { cmd: "/leaderboard", desc: "Server or global rankings. Includes 🛡️ Top Clans view." },
        { cmd: "/achievements", desc: "View your unlocked badges and progress toward locked ones." },
        { cmd: "/friend", desc: "Add, remove, or list study friends." },
        { cmd: "/season", desc: "View the current competitive season and when it resets." },
      ],
    },
    {
      title: "⚙️ Settings & Utility",
      color: "gray",
      commands: [
        { cmd: "/settings", desc: "Configure notifications, reminders, and friend alerts." },
        { cmd: "/stats advanced [period]", desc: "View Pomo Pro analytics and a 7/30/90-day focus heatmap." },
        { cmd: "/mygoal setup", desc: "Create a recurring weekly or monthly Pomo Pro focus goal." },
        { cmd: "/mygoal status", desc: "View progress toward your current personal focus goal." },
        { cmd: "/dataexport [period]", desc: "Privately download 30, 90, or 365 days of focus history as CSV." },
        { cmd: "/proprofile [view/accent/badge/reset]", desc: "Customize your Pomo Pro profile accent and badge." },
        { cmd: "/streak [status/recover]", desc: "Recover an eligible recently broken streak once every 30 days." },
        { cmd: "/premium status", desc: "Check your current Pomo Pro Beta access and expiry." },
        { cmd: "/premium perks", desc: "View current and planned Pomo Pro Beta benefits." },
        { cmd: "/setup start", desc: "Configure voice tracking and weekly reports for the server." },
        { cmd: "/serverstats", desc: "View private server activity, usage trends, and setup insights." },
        { cmd: "/goal setup", desc: "Enable a recurring weekly server focus challenge." },
        { cmd: "/ambient", desc: "Get ambient study sounds (rain, café, lo-fi, etc.)." },
        { cmd: "/help", desc: "View the full command reference inside Discord." },
        { cmd: "/credits", desc: "Meet the PomoBot team." },
      ],
    },
  ];

  return (
    <>
      <h1 className="text-4xl font-black text-white mb-6">Commands Reference</h1>
      <p className="mb-8 text-lg">
        A complete glossary of all slash commands available in Pomo, organized by category. Use this as a cheat sheet!
      </p>

      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              {section.title}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-black/20">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/50 text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <tr>
                    <th className="p-4 font-bold uppercase tracking-wider w-52">Command</th>
                    <th className="p-4 font-bold uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {section.commands.map((c, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-elevated)] transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <code className="bg-[var(--blurple)]/20 text-[var(--blurple)] px-2 py-1 rounded font-bold border border-[var(--blurple)]/30 text-xs">
                          {c.cmd}
                        </code>
                      </td>
                      <td className="p-4 text-[var(--text-secondary)] leading-relaxed">
                        {c.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
