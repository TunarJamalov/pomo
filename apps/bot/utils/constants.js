/**
 * Shared constants for the PomoBot.
 */

const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || 'https://discord.gg/XEubrrkBmB';

// Consistent embed color theme
const Colors = {
    PRIMARY: 0x5865F2,    // Discord Blurple
    SUCCESS: 0x57F287,    // Green
    WARNING: 0xFEE75C,    // Yellow
    ERROR: 0xED4245,      // Red
    INFO: 0x5BC0EB,       // Sky blue
    STUDY: 0xE07C24,      // Warm orange
    GARDEN: 0x2ECC71,     // Emerald green
    MARKET: 0xF1C40F,     // Gold
    PROFILE: 0x9B59B6,    // Purple
    PREMIUM: 0xFFD700,    // Pro gold
};

// Garden plot limits. Free stays at the long-standing 6; Pro adds 2.
const GardenPlotLimits = {
    FREE: 6,
    PRO: 8,
};

// Streak shields granted with each Pro grant/renewal
const PRO_STREAK_SHIELDS = 3;

// Most voice minutes per user per UTC day that count toward focus totals and
// leaderboards (stops 24/7 AFK farming; rewards have their own per-guild cap).
const VOICE_FOCUS_DAILY_CAP_MINUTES = 720;

// Plant definitions for the garden system
const Plants = {
    carrot: {
        name: 'Carrot',
        emoji: '🥕',
        stages: ['🌱', '🌿', '🌸', '🥕'],
        waterPerStage: 3,
        feedXP: 30,
        baseSellPrice: 2,   // base 💧 per unit
        priceVariance: 0.30, // ±30%
    },
    tomato: {
        name: 'Tomato',
        emoji: '🍅',
        stages: ['🌱', '🌿', '🌸', '🍅'],
        waterPerStage: 5,
        feedXP: 60,
        baseSellPrice: 4,
        priceVariance: 0.30,
    },
    potato: {
        name: 'Potato',
        emoji: '🥔',
        stages: ['🌱', '🌿', '🌸', '🥔'],
        waterPerStage: 8,
        feedXP: 100,
        baseSellPrice: 6,
        priceVariance: 0.30,
    },
    apple: {
        name: 'Apple',
        emoji: '🍎',
        stages: ['🌱', '🌿', '🌸', '🍎'],
        waterPerStage: 12,
        feedXP: 180,
        baseSellPrice: 10,
        priceVariance: 0.40,
    },
};

// Growth stage labels
const GrowthStages = {
    0: 'Seed',
    1: 'Sprout',
    2: 'Flower',
    3: 'Ripe',
};

// Pet definitions and gacha drop rates
// Pet rarity multipliers: bonus per level = base * level
const PetMultipliers = {
    Common: 0.05,   // Lv1=5%,  Lv10=50%
    Rare: 0.08,   // Lv1=8%,  Lv10=80%
    Epic: 0.12,   // Lv1=12%, Lv10=120%
    Legendary: 0.20,   // Lv1=20%, Lv10=200%
};

// Buff fraction for an owned pet row (e.g. 0.5 = +50%). Evolved pets restart
// at Lv1 but never drop below their Lv10 strength, and reach ×1.5 at Lv10 again.
function petBuffMultiplier(pet) {
    const info = pet && Pets[pet.pet_key];
    if (!info) return 0;
    const perLevel = PetMultipliers[info.rarity] ?? 0.05;
    const level = Number(pet.level) || 1;
    const effectiveLevel = pet.evolved === 1 ? Math.max(10, level * 1.5) : level;
    return effectiveLevel * perLevel;
}

const Pets = {
    // ─ Common ───────────────────────────────────────────────────
    lazy_cat: {
        name: 'Lazy Cat', emoji: '🐱', rarity: 'Common', dropChance: 70,
        buffType: 'water_boost',
        buffDesc: '+5% Water per level (max +50% at Lv10)',
        special: null,
        specialDesc: 'No special ability',
        preferredFood: 'tomato',
        preferredFoodBonus: 0.50,
        evolvedEmoji: '🐈',
        evolveRequires: { tomato: 5 },
        imageUrl: 'https://pomofocus.online/pets/cat.png',
    },
    study_ant: {
        name: 'Study Ant', emoji: '🐜', rarity: 'Common', dropChance: 70,
        buffType: 'xp_boost',
        buffDesc: '+5% XP per level (max +50% at Lv10)',
        special: null,
        specialDesc: 'No special ability',
        preferredFood: 'carrot',
        preferredFoodBonus: 0.50,
        evolvedEmoji: '🦋',
        evolveRequires: { carrot: 5 },
        imageUrl: 'https://pomofocus.online/pets/ant.png',
    },
    // ─ Rare ────────────────────────────────────────────────────
    wise_owl: {
        name: 'Wise Owl', emoji: '🦉', rarity: 'Rare', dropChance: 25,
        buffType: 'xp_boost',
        buffDesc: '+8% XP per level (max +80% at Lv10)',
        special: null,
        specialDesc: 'No special ability',
        preferredFood: 'apple',
        preferredFoodBonus: 0.60,
        evolvedEmoji: '🦅',
        evolveRequires: { apple: 3 },
        imageUrl: 'https://pomofocus.online/pets/owl.png',
    },
    loyal_dog: {
        name: 'Loyal Dog', emoji: '🐶', rarity: 'Rare', dropChance: 25,
        buffType: 'water_boost',
        buffDesc: '+8% Water per level (max +80% at Lv10)',
        special: 'streak_guard',
        specialDesc: '🛡️ **Streak Guard** — Automatically prevents streak loss once every 7 days if you miss a study day.',
        preferredFood: 'carrot',
        preferredFoodBonus: 0.60,
        evolvedEmoji: '🐕‍🦺',
        evolveRequires: { carrot: 3 },
        imageUrl: 'https://pomofocus.online/pets/dog.png',
    },
    // ─ Epic ────────────────────────────────────────────────────
    coffee_spirit: {
        name: 'Coffee Spirit', emoji: '☕', rarity: 'Epic', dropChance: 9,
        buffType: 'water_boost',
        buffDesc: '+12% Water per level (max +120% at Lv10)',
        special: 'fifth_session_bonus',
        specialDesc: '☕ **Caffeine Surge** — Every 5th completed session grants +3 bonus 💧 water automatically.',
        preferredFood: 'potato',
        preferredFoodBonus: 0.75,
        evolvedEmoji: '🔥',
        evolveRequires: { potato: 3 },
        imageUrl: 'https://pomofocus.online/pets/coffee.png',
    },
    magic_quill: {
        name: 'Magic Quill', emoji: '✌️', rarity: 'Epic', dropChance: 9,
        buffType: 'xp_boost',
        buffDesc: '+12% XP per level (max +120% at Lv10)',
        special: 'todo_bonus',
        specialDesc: '✌️ **Scholar\'s Notes** — Completing a `/todo` task gives +2 💧 instead of +1.',
        preferredFood: 'apple',
        preferredFoodBonus: 0.75,
        evolvedEmoji: '📜',
        evolveRequires: { apple: 3 },
        imageUrl: 'https://pomofocus.online/pets/magicquill.png',
    },
    // ─ Legendary ───────────────────────────────────────────────
    time_book: {
        name: 'Book of Time', emoji: '📖', rarity: 'Legendary', dropChance: 1,
        buffType: 'xp_boost',
        buffDesc: '+20% XP per level (max +200% at Lv10)',
        special: 'long_session_bonus',
        specialDesc: '📖 **Time Master** — Full 100-minute sessions grant +15 bonus ✨ XP on top of all other bonuses.',
        preferredFood: 'apple',
        preferredFoodBonus: 1.00,
        evolvedEmoji: '🌌',
        evolveRequires: { apple: 5 },
        imageUrl: 'https://pomofocus.online/pets/time.png',
    },
    alien_student: {
        name: 'Alien Student', emoji: '👽', rarity: 'Legendary', dropChance: 1,
        buffType: 'water_boost',
        buffDesc: '+20% Water per level (max +200% at Lv10)',
        special: 'double_water_chance',
        specialDesc: '👽 **Cosmic Luck** — Each session has a **15% chance** to double all water earned.',
        preferredFood: 'tomato',
        preferredFoodBonus: 1.00,
        evolvedEmoji: '🛸',
        evolveRequires: { tomato: 5 },
        imageUrl: 'https://pomofocus.online/pets/alien.png',
    },
};

// Study Snacks (Crafted from garden crops)
const StudySnacks = {
    focus_salad: {
        name: 'Focus Salad',
        emoji: '🥗',
        recipe: { tomato: 2, carrot: 1 },
        buffType: 'xp_boost',
        buffValue: 0.20, // +20%
        durationMinutes: 120, // 2 hours
        description: '+20% XP for 2 hours',
    },
    carrot_juice: {
        name: 'Carrot Juice',
        emoji: '🥤',
        recipe: { carrot: 3 },
        buffType: 'water_boost',
        buffValue: 1.0, // +100%
        durationMinutes: 180, // 3 hours
        description: 'Double 💧 for 3 hours',
    },
    apple_pie: {
        name: 'Apple Pie',
        emoji: '🥧',
        recipe: { apple: 2, potato: 1 },
        buffType: 'pet_xp_boost',
        buffValue: 0.50, // +50%
        durationMinutes: 120, // 2 hours
        description: '+50% Pet XP for 2 hours',
    },
    potato_soup: {
        name: 'Potato Soup',
        emoji: '🍲',
        recipe: { potato: 3, carrot: 1 },
        buffType: 'water_boost',
        buffValue: 0.50, // +50%
        durationMinutes: 240, // 4 hours
        description: '+50% 💧 for 4 hours',
    }
};

// Special drop-only relics (not sold in market, drop from sessions)
const Relics = {
    mushroom: {
        name: 'Lucky Mushroom',
        emoji: '🍄',
        description: '+15% Water & XP on every session while in your inventory.',
        dropChance: 0.03, // 3% per session
        buffType: 'both',
        buffValue: 0.15,
        unique: true, // only 1 can be held at a time
    },
};

// Market item definitions
const MarketItems = {
    water_boost: {
        name: '2x Water Boost',
        description: 'Next study session gives double water',
        cost: 2,
        emoji: '💧',
    },
    streak_shield: {
        name: 'Daily Streak Shield',
        description: 'Protects your streak once',
        cost: 8,
        emoji: '🛡️',
    },
    seed_pack: {
        name: 'Seed Pack',
        description: 'Random seed added to garden',
        cost: 3,
        emoji: '🌱',
    },
    pet_box: {
        name: 'Mysterious Pet Box',
        description: 'Open to find a random Study Pet!',
        cost: 500,
        emoji: '📦',
    },
    theme_basic: {
        name: 'Basic Theme',
        description: 'Standard Discord aesthetic',
        cost: 0,
        emoji: '🎨',
        themeKey: 'basic',
    },
    theme_nature: {
        name: 'Nature Theme',
        description: 'Emerald green gradient',
        cost: 50,
        emoji: '🌿',
        themeKey: 'nature',
    },
    theme_dark: {
        name: 'Dark Theme',
        description: 'Obsidian purple gradient',
        cost: 80,
        emoji: '🌑',
        themeKey: 'dark',
    },
    theme_sunset: {
        name: 'Sunset Theme',
        description: 'Vibrant orange & pink gradient',
        cost: 150,
        emoji: '🌅',
        themeKey: 'sunset',
    },
    theme_ocean: {
        name: 'Ocean Theme',
        description: 'Deep blue & cyan gradient',
        cost: 200,
        emoji: '🌊',
        themeKey: 'ocean',
    },
    theme_sakura: {
        name: 'Sakura Theme',
        description: 'Light pink cherry blossom aesthetic',
        cost: 500,
        emoji: '🌸',
        themeKey: 'sakura',
    },
    theme_cyberpunk: {
        name: 'Cyberpunk Theme',
        description: 'Neon synthwave aesthetic',
        cost: 1000,
        emoji: '🔋',
        themeKey: 'cyberpunk',
    },
    theme_lofi: {
        name: 'Lo-fi Theme',
        description: 'Pastel purple & warm aesthetic',
        cost: 1500,
        emoji: '🎧',
        themeKey: 'lofi',
    }
};

const Themes = {
    basic: { bg: ['#2F3136', '#202225'], card: 'rgba(32, 34, 37, 0.8)', accent: '#5865F2', text: '#FFFFFF', subtext: '#B9BBBE', xpBar: ['#5865F2', '#4752C4'], xpBg: 'rgba(0, 0, 0, 0.4)' },
    nature: { bg: ['#134E5E', '#71B280'], card: 'rgba(0, 0, 0, 0.5)', accent: '#2ECC71', text: '#FFFFFF', subtext: '#A8D5BA', xpBar: ['#2ECC71', '#27AE60'], xpBg: 'rgba(0, 0, 0, 0.4)' },
    dark: { bg: ['#141E30', '#243B55'], card: 'rgba(0, 0, 0, 0.6)', accent: '#9B59B6', text: '#FFFFFF', subtext: '#AAAAAA', xpBar: ['#9B59B6', '#8E44AD'], xpBg: 'rgba(0, 0, 0, 0.4)' },
    sunset: { bg: ['#FF512F', '#F09819'], card: 'rgba(0, 0, 0, 0.4)', accent: '#FFFFFF', text: '#FFFFFF', subtext: '#FFE4C4', xpBar: ['#FAD961', '#F76B1C'], xpBg: 'rgba(0, 0, 0, 0.4)' },
    ocean: { bg: ['#2E3192', '#1BFFFF'], card: 'rgba(0, 0, 0, 0.4)', accent: '#FFFFFF', text: '#FFFFFF', subtext: '#B3E5FC', xpBar: ['#00FFFF', '#00B4DB'], xpBg: 'rgba(0, 0, 0, 0.4)' },
    cyberpunk: { bg: ['#3A1C71', '#D76D77', '#FFAF7B'], card: 'rgba(10, 10, 15, 0.7)', accent: '#00FFFF', text: '#FFFFFF', subtext: '#FF00FF', xpBar: ['#00FFFF', '#FF00FF'], xpBg: 'rgba(255, 255, 255, 0.1)' },
    sakura: { bg: ['#ff9a9e', '#fecfef'], card: 'rgba(255, 255, 255, 0.4)', accent: '#FF4A7A', text: '#4A4A4A', subtext: '#888888', xpBar: ['#ff758c', '#ff7eb3'], xpBg: 'rgba(0, 0, 0, 0.1)' },
    lofi: { bg: ['#654ea3', '#eaafc8'], card: 'rgba(0, 0, 0, 0.5)', accent: '#FFD700', text: '#FFFFFF', subtext: '#E6E6FA', xpBar: ['#eaafc8', '#654ea3'], xpBg: 'rgba(0, 0, 0, 0.4)' }
};

const ProProfileAccents = {
    theme: { name: 'Theme Default', color: null },
    gold: { name: 'Focus Gold', color: '#F1C40F' },
    coral: { name: 'Pomo Coral', color: '#FF6B6B' },
    mint: { name: 'Fresh Mint', color: '#57F287' },
    cyan: { name: 'Deep Focus', color: '#5BC0EB' },
    violet: { name: 'Night Violet', color: '#B388FF' },
};

const ProProfileBadges = {
    pomo_pro: { name: 'Pomo Pro', text: 'POMO PRO' },
    deep_work: { name: 'Deep Work', text: 'DEEP WORK' },
    focus_club: { name: 'Focus Club', text: 'FOCUS CLUB' },
    early_supporter: { name: 'Early Supporter', text: 'EARLY SUPPORTER' },
};

// Ambient sound options
const AmbientSounds = {
    rain: { name: 'Rain', emoji: '🌧️', file: 'rain.mp3' },
    cafe: { name: 'Cafe', emoji: '☕', file: 'cafe.mp3' },
    forest: { name: 'Forest', emoji: '🌲', file: 'forest.mp3' },
    ocean: { name: 'Ocean', emoji: '🌊', file: 'ocean.mp3' },
    lofi: { name: 'Lo-fi', emoji: '🎵', file: 'lofi.mp3' },
};

// XP formula: XP needed to reach a given level
// xpForLevel(level) = 5 * level^2 + 50 * level + 100
function xpForLevel(level) {
    return 5 * level * level + 50 * level + 100;
}

// Water awarded per study session: 1 water per 25 minutes (rounded down)
function waterForMinutes(minutes) {
    return Math.floor(minutes / 25);
}

// XP awarded per study session: 10 XP per 25 minutes
function xpForMinutes(minutes) {
    return Math.floor(minutes / 25) * 10;
}

// Cooldown durations in seconds (per command)
const Cooldowns = {
    DEFAULT: 3,
    STUDY: 5,
    DAILY: 5,
    GARDEN: 3,
    MARKET: 3,
};

// Achievement definitions — 15 achievements in 5 categories
const Achievements = {
    // ⏰ Time
    early_bird: {
        key: 'early_bird',
        name: 'Early Bird',
        description: 'Start a session before 6 AM',
        emoji: '🌅',
        category: 'Time',
        categoryEmoji: '⏰',
    },
    night_owl: {
        key: 'night_owl',
        name: 'Night Owl',
        description: 'Start a session after midnight',
        emoji: '🦉',
        category: 'Time',
        categoryEmoji: '⏰',
    },
    marathon_runner: {
        key: 'marathon_runner',
        name: 'Marathon Runner',
        description: 'Complete a full 100-minute session',
        emoji: '🏃',
        category: 'Time',
        categoryEmoji: '⏰',
    },
    // 🔥 Consistency
    dedicated: {
        key: 'dedicated',
        name: 'Dedicated',
        description: 'Maintain a 7-day streak',
        emoji: '🔥',
        category: 'Consistency',
        categoryEmoji: '🔥',
    },
    committed: {
        key: 'committed',
        name: 'Committed',
        description: 'Maintain a 30-day streak',
        emoji: '💎',
        category: 'Consistency',
        categoryEmoji: '🔥',
    },
    unstoppable: {
        key: 'unstoppable',
        name: 'Unstoppable',
        description: 'Maintain a 100-day streak',
        emoji: '⚡',
        category: 'Consistency',
        categoryEmoji: '🔥',
    },
    // 📊 Volume
    beginner: {
        key: 'beginner',
        name: 'Beginner',
        description: 'Complete 10 hours of focus time',
        emoji: '📘',
        category: 'Volume',
        categoryEmoji: '📊',
    },
    intermediate: {
        key: 'intermediate',
        name: 'Intermediate',
        description: 'Complete 100 hours of focus time',
        emoji: '📗',
        category: 'Volume',
        categoryEmoji: '📊',
    },
    expert: {
        key: 'expert',
        name: 'Expert',
        description: 'Complete 500 hours of focus time',
        emoji: '📙',
        category: 'Volume',
        categoryEmoji: '📊',
    },
    master: {
        key: 'master',
        name: 'Master',
        description: 'Complete 1000 hours of focus time',
        emoji: '📕',
        category: 'Volume',
        categoryEmoji: '📊',
    },
    // 👥 Social
    team_player: {
        key: 'team_player',
        name: 'Team Player',
        description: 'Join 10 team sessions',
        emoji: '🤝',
        category: 'Social',
        categoryEmoji: '👥',
    },
    leader: {
        key: 'leader',
        name: 'Leader',
        description: 'Host 50 team sessions',
        emoji: '👑',
        category: 'Social',
        categoryEmoji: '👥',
    },
    // 🌱 Garden
    green_thumb: {
        key: 'green_thumb',
        name: 'Green Thumb',
        description: 'Harvest your first plant',
        emoji: '🌱',
        category: 'Garden',
        categoryEmoji: '🌱',
    },
    gardener: {
        key: 'gardener',
        name: 'Gardener',
        description: 'Harvest 50 plants',
        emoji: '🌻',
        category: 'Garden',
        categoryEmoji: '🌱',
    },
    master_gardener: {
        key: 'master_gardener',
        name: 'Master Gardener',
        description: 'Harvest 100 plants',
        emoji: '🏡',
        category: 'Garden',
        categoryEmoji: '🌱',
    },
};

// Titles are cosmetic status labels unlocked by achievements or season XP.
const Titles = {
    early_bird: {
        key: 'early_bird',
        name: 'Early Bird',
        description: 'Start a session before 6 AM',
        emoji: '🌅',
        achievementKey: 'early_bird',
    },
    night_owl: {
        key: 'night_owl',
        name: 'Night Owl',
        description: 'Start a session after midnight',
        emoji: '🦉',
        achievementKey: 'night_owl',
    },
    marathon_runner: {
        key: 'marathon_runner',
        name: 'Marathon Runner',
        description: 'Complete a full 100-minute session',
        emoji: '🏃',
        achievementKey: 'marathon_runner',
    },
    dedicated: {
        key: 'dedicated',
        name: 'Dedicated',
        description: 'Maintain a 7-day streak',
        emoji: '🔥',
        achievementKey: 'dedicated',
    },
    committed: {
        key: 'committed',
        name: 'Committed',
        description: 'Maintain a 30-day streak',
        emoji: '💎',
        achievementKey: 'committed',
    },
    team_player: {
        key: 'team_player',
        name: 'Team Player',
        description: 'Join 10 team sessions',
        emoji: '🤝',
        achievementKey: 'team_player',
    },
    green_thumb: {
        key: 'green_thumb',
        name: 'Garden Keeper',
        description: 'Harvest your first plant',
        emoji: '🌱',
        achievementKey: 'green_thumb',
    },
    season_scholar: {
        key: 'season_scholar',
        name: 'Season Scholar',
        description: 'Earn 500 XP in the active season',
        emoji: '📜',
        seasonXp: 500,
    },
    focus_protocol_elite: {
        key: 'focus_protocol_elite',
        name: 'Focus Protocol Elite',
        description: 'Earn 2,500 XP in the active season',
        emoji: '⚡',
        seasonXp: 2500,
    },
    protocol_pioneer: {
        key: 'protocol_pioneer',
        name: 'Protocol Pioneer',
        description: 'Participate in a classified global Pomo event',
        emoji: '🔐',
        eventKey: 'focus_protocol',
    },
    milestone_1k: {
        key: 'milestone_1k',
        name: '1K Celebrant',
        description: 'Studied during the celebration of Pomo reaching 1,000 servers',
        emoji: '🎉',
        eventKey: 'pomo_1k',
    },
};

// Custom emoji progress bar IDs — user uploads emojis to Discord dev portal
// Then fills in the emoji IDs here. Using fallback unicode if not set.
const EmojiBar = {
    // Set these to your custom Discord emoji strings, e.g. '<:bar_start_full:1234567890>'
    // Fallback values use unicode block characters
    START_FULL: process.env.EMOJI_BAR_START_FULL || '<:startfull:1477003739268124763>',
    START_EMPTY: process.env.EMOJI_BAR_START_EMPTY || '<:startempty:1477003736755998721>',
    MID_FULL: process.env.EMOJI_BAR_MID_FULL || '<:midfull:1477003734847324365>',
    MID_EMPTY: process.env.EMOJI_BAR_MID_EMPTY || '<:midempty:1477003728841347144>',
    END_FULL: process.env.EMOJI_BAR_END_FULL || '<:endfull:1477003733110882314>',
    END_EMPTY: process.env.EMOJI_BAR_END_EMPTY || '<:endempty:1477003730644762799>',
};

const TreeRequirements = {
    1: { water: 500, potato: 5 },
    2: { water: 1000, tomato: 10 },
    3: { water: 2000, carrot: 15 },
    4: { water: 4000, potato: 20, apple: 5 },
    5: { water: 8000, tomato: 25, apple: 10 },
    6: { water: 15000, carrot: 30, apple: 10 },
    7: { water: 25000, potato: 40, apple: 15 },
    8: { water: 40000, tomato: 50, apple: 20 },
    9: { water: 60000, carrot: 60, apple: 25 }
    // Max Level is 10, so index 9 is the requirement to reach 10.
};

module.exports = {
    SUPPORT_SERVER_URL,
    Colors,
    Plants,
    GrowthStages,
    MarketItems,
    Relics,
    AmbientSounds,
    xpForLevel,
    waterForMinutes,
    xpForMinutes,
    Cooldowns,
    Achievements,
    Titles,
    EmojiBar,
    Pets,
    PetMultipliers,
    petBuffMultiplier,
    Themes,
    ProProfileAccents,
    ProProfileBadges,
    StudySnacks,
    TreeRequirements,
    GardenPlotLimits,
    PRO_STREAK_SHIELDS,
    VOICE_FOCUS_DAILY_CAP_MINUTES,
};
