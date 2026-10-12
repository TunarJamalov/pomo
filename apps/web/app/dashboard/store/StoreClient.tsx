"use client";

import { useTransition, useState } from "react";
import { buyStoreItemAction } from "./actions";
import { ShoppingCart, Sparkles, Check } from "lucide-react";
import { STORE_ITEMS, type StoreItem } from "@/lib/gameData";

export default function StoreClient({ waterBalance, unlockedThemes }: { waterBalance: number, unlockedThemes: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{text: string, type: 'error'|'success'} | null>(null);

  const handleBuy = (item: StoreItem) => {
    if (waterBalance < item.cost) {
      setMsg({ text: "Not enough water!", type: 'error' });
      setTimeout(() => setMsg(null), 3000);
      return;
    }

    startTransition(async () => {
      const res = await buyStoreItemAction(item.key, item.cost, item.type);
      if (res.success) {
        setMsg({ text: res.message || "Purchase successful!", type: 'success' });
      } else {
        setMsg({ text: res.message || "Transaction failed.", type: 'error' });
      }
      setTimeout(() => setMsg(null), 5000);
    });
  };

  return (
    <div>
      {/* Toast Notification */}
      {msg && (
        <div className={`fixed top-24 right-8 p-4 rounded-xl shadow-2xl border flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-4 ${
          msg.type === 'success' ? 'bg-green-900/90 border-green-500 text-green-100' : 'bg-red-900/90 border-red-500 text-red-100'
        }`}>
          {msg.type === 'success' ? <Check /> : <Sparkles />}
          <span className="font-bold">{msg.text}</span>
        </div>
      )}

      {/* Categories */}
      {['generic', 'seed_pack', 'pet_box', 'theme'].map(category => {
        
        const categoryItems = STORE_ITEMS.filter(i => {
           if (category === 'generic') return i.type === 'generic';
           if (category === 'seed_pack') return i.type === 'seed_pack';
           if (category === 'pet_box') return i.type === 'pet_box';
           if (category === 'theme') return i.type === 'theme';
           return false;
        });

        const catTitles: Record<string, string> = {
          'generic': 'Boosts & Utilities',
          'seed_pack': 'Garden Supplies',
          'pet_box': 'Pet Adoption',
          'theme': 'Profile Themes'
        };

        return (
          <div key={category} className="mb-12">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[var(--text-secondary)]">
              {catTitles[category]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {categoryItems.map(item => {
                const isTheme = item.type === 'theme';
                const themeKey = item.key.replace('theme_', '');
                const alreadyOwned = isTheme && unlockedThemes.includes(themeKey);
                const affordable = waterBalance >= item.cost;

                return (
                  <div key={item.key} className="glass-panel p-6 flex flex-col justify-between hover:-translate-y-1 transition-transform border-[var(--border)] hover:border-[var(--blurple)]">
                    <div>
                      <div className="text-4xl mb-4 bg-black/20 w-16 h-16 rounded-2xl flex items-center justify-center border border-[var(--border)] shadow-inner">
                        {item.emoji}
                      </div>
                      <h3 className="font-bold text-lg mb-1">{item.name}</h3>
                      <p className="text-sm text-[var(--text-secondary)] h-10">{item.description}</p>
                    </div>
                    
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={isPending || alreadyOwned || !affordable}
                      className={`mt-6 w-full py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                        alreadyOwned 
                          ? 'bg-green-900/30 text-green-400 border border-green-500/30 cursor-not-allowed'
                          : affordable
                            ? 'bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white'
                            : 'bg-black/40 text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]'
                      }`}
                    >
                      {alreadyOwned ? (
                        <><Check size={18} /> Owned</>
                      ) : (
                        <><ShoppingCart size={18} /> {item.cost} Droplets</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )
      })}
    </div>
  );
}
