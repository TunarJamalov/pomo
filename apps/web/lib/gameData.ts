export type StoreItemType = 'theme' | 'pet_box' | 'seed_pack' | 'generic';

export type StoreItem = {
  key: string;
  name: string;
  description: string;
  cost: number;
  emoji: string;
  type: StoreItemType;
};

export const STORE_ITEMS: StoreItem[] = [
  { key: 'water_boost', name: '2x Water Boost', description: 'Next study session gives double water', cost: 2, emoji: '💧', type: 'generic' },
  { key: 'streak_shield', name: 'Daily Streak Shield', description: 'Protects your streak once', cost: 8, emoji: '🛡️', type: 'generic' },
  { key: 'seed_pack', name: 'Seed Pack', description: 'Random seed added to garden', cost: 3, emoji: '🌱', type: 'seed_pack' },
  { key: 'pet_box', name: 'Mysterious Pet Box', description: 'Open to find a random Study Pet!', cost: 500, emoji: '📦', type: 'pet_box' },
  { key: 'theme_nature', name: 'Nature Theme', description: 'Emerald green gradient', cost: 50, emoji: '🌿', type: 'theme' },
  { key: 'theme_dark', name: 'Dark Theme', description: 'Obsidian purple gradient', cost: 80, emoji: '🌑', type: 'theme' },
  { key: 'theme_sunset', name: 'Sunset Theme', description: 'Vibrant orange & pink gradient', cost: 150, emoji: '🌅', type: 'theme' },
  { key: 'theme_ocean', name: 'Ocean Theme', description: 'Deep blue & cyan gradient', cost: 200, emoji: '🌊', type: 'theme' },
  { key: 'theme_sakura', name: 'Sakura Theme', description: 'Light pink cherry blossom aesthetic', cost: 500, emoji: '🌸', type: 'theme' },
  { key: 'theme_cyberpunk', name: 'Cyberpunk Theme', description: 'Neon synthwave aesthetic', cost: 1000, emoji: '🔋', type: 'theme' },
  { key: 'theme_lofi', name: 'Lo-fi Theme', description: 'Pastel purple & warm aesthetic', cost: 1500, emoji: '🎧', type: 'theme' },
];

export const STORE_ITEM_BY_KEY = Object.fromEntries(STORE_ITEMS.map(item => [item.key, item])) as Record<string, StoreItem>;

export const PLANT_KEYS = ['carrot', 'tomato', 'potato', 'apple'] as const;

export const PET_DROPS = [
  { key: 'lazy_cat', chance: 70 },
  { key: 'study_ant', chance: 70 },
  { key: 'wise_owl', chance: 25 },
  { key: 'loyal_dog', chance: 25 },
  { key: 'coffee_spirit', chance: 9 },
  { key: 'magic_quill', chance: 9 },
  { key: 'time_book', chance: 1 },
  { key: 'alien_student', chance: 1 },
] as const;
