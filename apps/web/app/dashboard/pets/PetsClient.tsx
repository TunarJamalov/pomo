"use client";

import { useTransition } from "react";
import { equipPetAction } from "./actions";
import { Check, Star, Info } from "lucide-react";
import Image from "next/image";

type Pet = {
  pet_key: string;
  level: number;
  xp: number;
  is_active: number;
  evolved?: number;
};

// Mapping of some known pets to some nice icons or UI features.
const PET_DATA: Record<string, { icon: string, name: string, description: string, rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary' }> = {
  lazy_cat: { icon: '😺', name: 'Lazy Cat', description: 'Increases water received daily.', rarity: 'Common' },
  study_ant: { icon: '🐜', name: 'Study Ant', description: 'Increases XP gained from sessions.', rarity: 'Common' },
  wise_owl: { icon: '🦉', name: 'Wise Owl', description: 'Greatly increases XP gain.', rarity: 'Rare' },
  loyal_dog: { icon: '🐶', name: 'Loyal Dog', description: 'Streak Guard - protects your streak from breaking.', rarity: 'Rare' },
  coffee_spirit: { icon: '☕', name: 'Coffee Spirit', description: 'Caffeine Surge - Extra water every 5th session.', rarity: 'Epic' },
  magic_quill: { icon: '✌️', name: 'Magic Quill', description: 'Scholar\'s Notes - Boosts water from to-dos.', rarity: 'Epic' },
  time_book: { icon: '📖', name: 'Book of Time', description: 'Time Master - Huge XP boost on 100m sessions.', rarity: 'Legendary' },
  alien_student: { icon: '👽', name: 'Alien Student', description: 'Cosmic Luck - 15% chance to double water.', rarity: 'Legendary' },
  // Default fallback
  default: { icon: '🐾', name: 'Unknown Pet', description: 'A cute mysterious companion.', rarity: 'Common' }
};

const PET_IMAGES: Record<string, string> = {
  lazy_cat: "cat",
  study_ant: "ant",
  wise_owl: "owl",
  loyal_dog: "dog",
  coffee_spirit: "coffee",
  magic_quill: "magicquill",
  time_book: "time",
  alien_student: "alien",
};

const RARITY_COLORS = {
  Common: 'border-gray-500 text-[var(--site-fg-2)]',
  Rare: 'border-blue-500 text-blue-400',
  Epic: 'border-purple-500 text-purple-400',
  Legendary: 'border-yellow-500 text-yellow-400'
};

export default function PetsClient({ initialPets }: { initialPets: Pet[] }) {
  const [isPending, startTransition] = useTransition();

  const handleEquip = (petKey: string) => {
    startTransition(async () => {
      await equipPetAction(petKey);
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {initialPets.length === 0 ? (
        <div className="col-span-full glass-panel p-12 text-center flex flex-col items-center">
          <div className="text-6xl mb-4 opacity-50 grayscale">🐣</div>
          <h3 className="text-xl font-bold mb-2">No pets yet</h3>
          <p className="text-[var(--text-secondary)]">
            Focus more on Discord, earn XP and Water to adopt your first companion from the bot!
          </p>
        </div>
      ) : (
        initialPets.map((pet) => {
          const isActive = pet.is_active === 1;
          const details = PET_DATA[pet.pet_key] || { ...PET_DATA['default'], name: pet.pet_key.charAt(0).toUpperCase() + pet.pet_key.slice(1) };
          const rarityStyle = RARITY_COLORS[details.rarity];

          return (
            <div 
              key={pet.pet_key} 
              className={`relative glass-panel overflow-hidden transition-all duration-300 ${isActive ? 'ring-2 ring-[var(--green-neon)]' : 'hover:border-[var(--border-hover)]'}`}
            >
              {/* Active Badge */}
              {isActive && (
                <div className="absolute top-0 right-0 bg-[var(--green-neon)] text-black text-xs font-bold px-3 py-1 rounded-bl-lg z-10 flex items-center gap-1">
                  <Check size={14} /> Equipped
                </div>
              )}

              {/* Rarity Bar Top */}
              <div className={`h-1 w-full bg-current opacity-60 ${rarityStyle.split(' ')[1]}`} />

              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-20 h-20 relative drop-shadow-xl p-2 bg-black/20 rounded-2xl border border-[var(--border)] shrink-0">
                    <Image
                      src={`/pets/${PET_IMAGES[pet.pet_key] || 'dog'}.png`}
                      alt={pet.pet_key}
                      fill
                      className="object-contain p-1"
                      unoptimized
                    />
                  </div>
                  <div className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 text-[var(--blurple)] font-bold text-lg">
                        <Star size={16} fill="currentColor" /> Lv. {pet.level}
                      </div>
                      {pet.evolved === 1 && (
                        <div className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-2 py-0.5 rounded-full font-bold">
                          ✨ Evolved
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">{pet.xp} XP</div>
                  </div>
                </div>

                <h3 className="text-xl font-bold mb-1 capitalize flex items-center gap-2">
                  {pet.pet_key.replace('_', ' ')}
                </h3>
                <div className={`text-xs font-semibold mb-3 ${rarityStyle.split(' ')[1]}`}>
                  • {details.rarity}
                </div>

                <p className="text-sm text-[var(--text-secondary)] mb-6 h-10 flex items-start gap-2">
                  <Info size={16} className="shrink-0 mt-0.5 opacity-50" />
                  {details.description}
                </p>

                <button
                  onClick={() => handleEquip(pet.pet_key)}
                  disabled={isPending || isActive}
                  className={`w-full py-2.5 rounded-xl font-bold transition-all ${
                    isActive 
                      ? 'bg-black/40 text-white cursor-default opacity-60 border border-[var(--border)]' 
                      : 'bg-[var(--blurple)] hover:bg-[var(--blurple-dark)] text-white shadow-lg disabled:opacity-50'
                  }`}
                >
                  {isPending ? 'Equipping...' : (isActive ? 'Currently Equipped' : 'Equip Pet')}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
