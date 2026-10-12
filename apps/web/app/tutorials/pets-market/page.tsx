import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Study Pets and the Market",
  description: "Collect study pets that boost your XP and Water, level them up, evolve them and shop in the Pomo market.",
  alternates: { canonical: "/tutorials/pets-market" },
};

export default function PetsMarketPage() {
  return (
    <>
      <h1 className="text-4xl font-black text-[#FFD700] mb-6">Pets & The Market</h1>
      
      <p className="mb-8 text-lg">
        Water (💧) is the lifeblood of Pomo's economy. The Market is where you spend it to buy boosters, aesthetic themes, and the highly anticipated Pet Boxes.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        Study Pets
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        Study Pets are companions you can equip using <code className="bg-transparent text-[var(--blurple)]">/pet equip</code>. When equipped, they provide passive bonuses to your study sessions, such as multiplying your XP gain or increasing Water drops, as well as unique special passives!
      </p>

      <div className="bg-black/30 p-6 rounded-xl border border-[var(--border)] mb-10 overflow-x-auto">
        <h3 className="font-bold text-white mb-4">Pet Rarities & Abilities</h3>
        <table className="w-full text-sm text-left">
          <thead className="bg-black/50 text-[var(--text-muted)] border-b border-white/10 uppercase font-bold text-xs">
            <tr>
              <th className="p-3">Pet Name</th>
              <th className="p-3">Rarity</th>
              <th className="p-3">Passive Buff (Max Lv10)</th>
              <th className="p-3">Special Ability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr><td className="p-3">🐱 Lazy Cat</td><td className="p-3 text-gray-400">Common</td><td className="p-3">+50% Water</td><td className="p-3">-</td></tr>
            <tr><td className="p-3">🐜 Study Ant</td><td className="p-3 text-gray-400">Common</td><td className="p-3">+50% XP</td><td className="p-3">-</td></tr>
            <tr><td className="p-3">🦉 Wise Owl</td><td className="p-3 text-blue-400">Rare</td><td className="p-3">+80% XP</td><td className="p-3">-</td></tr>
            <tr><td className="p-3">🐶 Loyal Dog</td><td className="p-3 text-blue-400">Rare</td><td className="p-3">+80% Water</td><td className="p-3">Streak Guard</td></tr>
            <tr><td className="p-3">☕ Coffee Spirit</td><td className="p-3 text-purple-400">Epic</td><td className="p-3">+120% Water</td><td className="p-3">Caffeine Surge</td></tr>
            <tr><td className="p-3">✌️ Magic Quill</td><td className="p-3 text-purple-400">Epic</td><td className="p-3">+120% XP</td><td className="p-3">Scholar's Notes</td></tr>
            <tr><td className="p-3">📖 Book of Time</td><td className="p-3 text-yellow-400">Legendary</td><td className="p-3">+200% XP</td><td className="p-3">Time Master</td></tr>
            <tr><td className="p-3">👽 Alien Student</td><td className="p-3 text-yellow-400">Legendary</td><td className="p-3">+200% Water</td><td className="p-3">Cosmic Luck</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2 mt-8">
        Pet Evolution ✨
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        Once your Pet reaches <strong>Level 10</strong>, you can <strong>Evolve</strong> it using <code className="bg-transparent text-[var(--blurple)]">/pet evolve</code>! 
        Evolution requires a specific amount of your Pet's <strong>Favorite Food</strong> (grown in the Garden).
      </p>
      
      <p className="mb-8 text-[var(--text-secondary)]">
        When a pet evolves, it resets to <strong>Lv1</strong> but gains a permanent <strong>×1.5 multiplier</strong> to its buff! 
        This means an evolved Legendary pet at max level can reach up to <strong>+300% XP/Water</strong>.
      </p>

      <h2 className="text-2xl font-bold text-white mb-4 border-b border-[var(--border)] pb-2">
        The Market (Store)
      </h2>

      <p className="mb-4 text-[var(--text-secondary)]">
        Use <code className="bg-transparent text-[var(--blurple)]">/market</code> in Discord, or click the <strong>Store</strong> tab in the web dashboard sidebar to purchase goods. 
        If you roll a <strong>Pet Box</strong> and get a pet you already own, the box will issue a 150 💧 refund!
      </p>

    </>
  );
}
