import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Virtual Study Garden",
  description: "Grow a virtual garden with the Water you earn studying on Discord. Plant crops, harvest them and feed your study pets.",
  alternates: { canonical: "/tutorials/garden" },
};

export default function GardenPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-green-400 mb-6">The Virtual Garden</h1>
      
      <p className="mb-8 text-lg">
        Studying can get dry, so why not grow something beautiful while you do it? The Virtual Garden is where you spend your Water (💧) to raise plants.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="text-xl">🌱</span> Available Plants
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { emoji: "🥕", name: "Carrot" },
          { emoji: "🍅", name: "Tomato" },
          { emoji: "🥔", name: "Potato" },
          { emoji: "🍎", name: "Apple" },
        ].map((p) => (
          <div key={p.name} className="bg-black/30 p-4 rounded-xl border border-[var(--border)] text-center">
            <div className="text-4xl mb-2">{p.emoji}</div>
            <div className="font-bold text-sm">{p.name}</div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="text-xl">📈</span> Growth Stages
      </h2>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-black/20 mb-10">
        <table className="w-full text-sm text-left">
          <thead className="bg-black/50 text-[var(--text-muted)] border-b border-[var(--border)] uppercase font-bold text-xs">
            <tr>
              <th className="p-4">Stage</th>
              <th className="p-4">Label</th>
              <th className="p-4">Emoji</th>
              <th className="p-4">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <tr className="hover:bg-[var(--bg-elevated)]"><td className="p-4">0</td><td className="p-4">Seed</td><td className="p-4">🌱</td><td className="p-4">Just planted. Needs water to grow.</td></tr>
            <tr className="hover:bg-[var(--bg-elevated)]"><td className="p-4">1</td><td className="p-4">Sprout</td><td className="p-4">🌿</td><td className="p-4">First watering done.</td></tr>
            <tr className="hover:bg-[var(--bg-elevated)]"><td className="p-4">2</td><td className="p-4">Flower</td><td className="p-4">🌸</td><td className="p-4">Almost there!</td></tr>
            <tr className="hover:bg-[var(--bg-elevated)]"><td className="p-4">3</td><td className="p-4">Ripe</td><td className="p-4">🥕🍅🥔🍎</td><td className="p-4">Ready to harvest! ✅</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
        <span className="text-xl">🎮</span> How to Use the Garden
      </h2>

      <div className="space-y-6">
        <div className="flex gap-4 items-start bg-black/20 p-5 rounded-xl border border-[var(--border)]">
          <div className="text-lg bg-green-500/20 p-3 rounded-lg border border-green-500/30 font-bold">1</div>
          <div>
            <h3 className="font-bold text-lg text-white">Buy a Seed Pack</h3>
            <p className="text-[var(--text-secondary)] mt-1">Use <code className="text-[var(--blurple)]">/market</code> and purchase a <strong>Seed Pack</strong> for 3 💧. A random plant will be planted automatically into an empty plot.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start bg-black/20 p-5 rounded-xl border border-[var(--border)]">
          <div className="text-lg bg-green-500/20 p-3 rounded-lg border border-green-500/30 font-bold">2</div>
          <div>
            <h3 className="font-bold text-lg text-white">Manage with /garden Buttons</h3>
            <p className="text-[var(--text-secondary)] mt-1">Type <code className="text-[var(--blurple)]">/garden</code> to see all your plots. The bot shows interactive <strong>buttons</strong> (Plant Seed, Water Plant, Harvest) — all actions are done via clicking buttons, no extra commands needed!</p>
          </div>
        </div>

        <div className="flex gap-4 items-start bg-black/20 p-5 rounded-xl border border-[var(--border)]">
          <div className="text-lg bg-green-500/20 p-3 rounded-lg border border-green-500/30 font-bold">3</div>
          <div>
            <h3 className="font-bold text-lg text-white">Water Until Ripe</h3>
            <p className="text-[var(--text-secondary)] mt-1">Each plant needs <strong>3 waters per stage</strong> (3 stages × 3 waters = 9 total waters). Each water costs 1 💧. Click the <strong>Water Plant</strong> button and select a plot.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start bg-black/20 p-5 rounded-xl border border-[var(--border)]">
          <div className="text-lg bg-green-500/20 p-3 rounded-lg border border-green-500/30 font-bold">4</div>
          <div>
            <h3 className="font-bold text-lg text-white">Harvest!</h3>
            <p className="text-[var(--text-secondary)] mt-1">Once a plant reaches Stage 3 (Ripe), click the <strong>Harvest</strong> button to collect the fruit. The plot gets freed up for a new seed.</p>
          </div>
        </div>
      </div>

      <div className="mt-10 p-6 bg-green-900/10 border border-green-500/30 rounded-xl">
        <h3 className="font-bold text-green-400 mb-2 flex items-center gap-2">
          💡 Important Garden Rule
        </h3>
        <p className="text-sm text-green-100/70">
          You only have <strong>6 plots</strong> available simultaneously. Once all 6 are occupied, you cannot buy another Seed Pack until you harvest a ripe plant!
        </p>
      </div>
    </>
  );
}
