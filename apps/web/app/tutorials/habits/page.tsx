import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Habit Tracker on Discord",
  description: "Track daily habits on Discord with Pomo: yes/no or goal habits, one-tap check-ins, streaks and a grid of days, like HabitKit.",
  alternates: { canonical: "/tutorials/habits" },
};

const examples = [
  { cmd: "/habit add name:Read emoji:📖", text: "A simple yes/no habit: did you do it today?" },
  { cmd: "/habit add name:Water emoji:💧 goal:8 unit:glasses", text: "A goal habit: every tap adds one, done at 8." },
  { cmd: "/habit add name:Workout emoji:🏋️ days_per_week:3", text: "Not every day: three days a week keeps the streak." },
];

export default function HabitsTutorialPage() {
  return (
    <>
      <h1 className="text-4xl font-black mb-6">🗓️ Habit Tracker</h1>

      <p className="mb-8 text-lg">
        Pomo can track any daily habit, not just study time. Every day you finish a habit fills one square, and the
        squares add up to a grid you can see grow week after week.
      </p>

      <h2 className="text-2xl font-bold mb-4 border-b border-[var(--border)] pb-2">1. Add a habit</h2>
      <div className="mb-10 space-y-3">
        {examples.map((example) => (
          <div key={example.cmd} className="rounded-xl border border-[var(--border)] bg-black/20 p-4">
            <code className="text-[14px] text-[var(--site-fg)]">{example.cmd}</code>
            <p className="mt-1 text-[14px]">{example.text}</p>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4 border-b border-[var(--border)] pb-2">2. Check in every day</h2>
      <p className="mb-10">
        Type <code>/habit check</code>. Each habit gets its own button: tap it to mark a yes/no habit done, or to add
        one to a goal habit. Every habit you finish gives <strong>+1 💧 Water</strong>, for up to three habits a day.
        Made a mistake? <code>/habit log</code> lets you add or remove from today&apos;s count.
      </p>

      <h2 className="text-2xl font-bold mb-4 border-b border-[var(--border)] pb-2">3. Watch the grid grow</h2>
      <p className="mb-4">
        <code>/habit view</code> draws the last 26 weeks of every habit as a grid of squares, with your current and
        best streak. Full squares are finished days; lighter ones are days you started a goal habit but didn&apos;t
        reach it.
      </p>
      <p className="mb-10">
        Your <strong>Pomo focus sessions</strong> appear automatically as the first row, so you have a grid from day
        one even before adding your own habits.
      </p>

      <h2 className="text-2xl font-bold mb-4 border-b border-[var(--border)] pb-2">Good to know</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>
          You can track 5 habits at a time, or 15 with <strong>Pomo Pro</strong>. <code>/habit remove</code> archives one
          and keeps its history.
        </li>
        <li>
          Your habit day follows your server&apos;s time zone. Use <code>/habit timezone</code> to set your own, for
          example <code>Asia/Baku</code>.
        </li>
        <li>
          Habits are personal and work anywhere: in any server, in DMs, or through <strong>Add to my apps</strong>.
        </li>
      </ul>
    </>
  );
}
