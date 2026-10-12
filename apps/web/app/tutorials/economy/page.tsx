import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Water Economy and Rewards",
  description: "How Pomo rewards focus on Discord: earn Water from study sessions, daily rewards, quests and to-dos, then spend it on pets and the garden.",
  alternates: { canonical: "/tutorials/economy" },
};

export default function EconomyTutorialPage() {
  const earnMethods = [
    {
      title: "Study Sessions",
      description: "Complete /study, /pomodoro, /team, or tracked voice sessions. Focus time is the main source of Water.",
    },
    {
      title: "Daily Reward",
      description: "Use /daily once every 24 hours for a small, consistent Water reward.",
    },
    {
      title: "Quests and To-Dos",
      description: "Finish daily quests and complete tasks from your personal to-do list.",
    },
    {
      title: "Top.gg Votes",
      description: "Support PomoBot with /vote and receive the listed in-bot reward.",
    },
    {
      title: "Study Pets",
      description: "Some equipped pets increase the Water earned from completed focus sessions.",
    },
    {
      title: "Friend Transfers",
      description: "Eligible users can send Water through /send after owner approval.",
    },
  ];

  const spendMethods = [
    "Grow and maintain your virtual garden",
    "Buy profile themes and cosmetic upgrades",
    "Open pet boxes and build your collection",
    "Purchase useful study boosts and streak shields",
  ];

  return (
    <>
      <h1 className="text-4xl font-black text-yellow-400 mb-6">Water Economy</h1>

      <p className="mb-8 text-lg">
        Water is PomoBot&apos;s in-bot progress currency. It is earned through productive activity and used for gardens, pets, themes, and study tools. Water has no real-money value and cannot be exchanged for cash.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        How to Earn Water
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {earnMethods.map((item) => (
          <div key={item.title} className="bg-black/30 border border-[var(--border)] p-4 rounded-xl">
            <h3 className="font-bold text-white text-sm mb-1">{item.title}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        How to Use Water
      </h2>

      <div className="space-y-2 mb-10">
        {spendMethods.map((item) => (
          <div key={item} className="bg-black/20 border border-[var(--border)] px-4 py-3 rounded-lg text-[var(--text-secondary)]">
            {item}
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        Sending Water to Friends
      </h2>

      <p className="text-[var(--text-secondary)] mb-4">
        Use <code className="bg-black/40 px-1 rounded text-green-300">/send</code> to request a Water transfer. Transfers require owner approval to prevent abuse.
      </p>

      <div className="space-y-2 text-sm">
        {[
          "Sender must be Level 3 or higher",
          "Minimum transfer: 10 Water; maximum transfer: 2,000 Water",
          "Sender must keep at least 50 Water after the transfer",
          "Only one pending transfer request is allowed per user",
          "A clear reason is required for review",
        ].map((rule) => (
          <div key={rule} className="bg-black/20 px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">
            {rule}
          </div>
        ))}
      </div>
    </>
  );
}
