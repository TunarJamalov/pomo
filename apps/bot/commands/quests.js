const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, xpForLevel, Plants } = require('../utils/constants');
const { db, getOrCreateUser, incrementUser, updateUser, addItemToInventory } = require('../utils/database');
const { errorEmbed, successEmbed, progressBar } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { isPremium } = require('../utils/premiumCheck');

const QUEST_POOL = [
    {
        key: 'focus_50',
        name: 'Deep Work',
        description: 'Complete 50 focus minutes today',
        target: 50,
        unit: 'min',
        reward: { water: 4, xp: 20 },
        getProgress: getTodayFocusMinutes,
    },
    {
        key: 'sessions_2',
        name: 'Two Rounds',
        description: 'Complete 2 focus sessions today',
        target: 2,
        unit: 'sessions',
        reward: { water: 3, xp: 15 },
        getProgress: getTodaySessionCount,
    },
    {
        key: 'todo_3',
        name: 'Task Cleaner',
        description: 'Complete 3 todos today',
        target: 3,
        unit: 'todos',
        reward: { water: 3, xp: 10 },
        getProgress: getTodayTodoCount,
    },
    {
        key: 'harvest_1',
        name: 'Garden Check',
        description: 'Harvest 1 plant today',
        target: 1,
        unit: 'harvest',
        reward: { water: 4, xp: 10 },
        getProgress: getTodayHarvestCount,
    },
    {
        key: 'team_1',
        name: 'Study Together',
        description: 'Complete 1 team session today',
        target: 1,
        unit: 'team',
        reward: { water: 5, xp: 15 },
        getProgress: getTodayTeamCount,
    },
    {
        key: 'daily_claim',
        name: 'Daily Ritual',
        description: 'Claim your /daily reward today',
        target: 1,
        unit: 'daily',
        reward: { water: 2, xp: 5 },
        getProgress: getTodayDailyClaim,
    },
];

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('quests')
        .setDescription('View and claim your daily quests')
        .addSubcommand(sub =>
            sub.setName('daily')
                .setDescription('View today\'s quests'))
        .addSubcommand(sub =>
            sub.setName('claim')
                .setDescription('Claim completed daily quest rewards')
                .addStringOption(opt =>
                    opt.setName('quest')
                        .setDescription('Which quest to claim')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All completed quests', value: 'all' },
                            ...QUEST_POOL.map(q => ({ name: q.name, value: q.key })),
                        ))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'claim') {
            return handleClaim(interaction, userId, language);
        }

        return handleDaily(interaction, userId, language);
    },
    checkAndNotifyQuests
};

async function checkAndNotifyQuests(client, userId, language, channel) {
    const today = getToday();
    const quests = getDailyQuestStates(userId);
    const claimable = quests.filter(q => q.completed && !q.claimed);
    
    if (claimable.length === 0) return;

    // Check which quests have ALREADY been notified today
    const notifiedRows = db.prepare(`
        SELECT quest_key FROM quest_notifications WHERE user_id = ? AND quest_date = ?
    `).all(userId, today);
    const notifiedKeys = new Set(notifiedRows.map(r => r.quest_key));

    const newlyCompleted = claimable.filter(q => !notifiedKeys.has(q.key));
    if (newlyCompleted.length === 0) return;

    // Mark as notified immediately to prevent duplicates
    for (const q of newlyCompleted) {
        db.prepare(`
            INSERT OR IGNORE INTO quest_notifications (user_id, quest_key, quest_date)
            VALUES (?, ?, ?)
        `).run(userId, q.key, today);
    }

    const premium = await isPremium(client, userId);
    
    if (premium) {
        // Auto-claim
        const reward = { water: 0, xp: 0, fruits: {} };
        const claimedNames = [];
        const premiumMultiplier = 1.5;

        const transaction = db.transaction(() => {
            for (const quest of newlyCompleted) {
                const result = db.prepare(`
                    INSERT OR IGNORE INTO quest_claims (user_id, quest_key, quest_date)
                    VALUES (?, ?, ?)
                `).run(userId, quest.key, today);

                if (result.changes === 0) continue;

                // Paid plans boost quest water only: XP feeds levels and the XP leaderboard, which stay fair
                const waterGain = Math.ceil(quest.reward.water * premiumMultiplier);
                const xpGain = quest.reward.xp;

                incrementUser(userId, 'water', waterGain);
                incrementUser(userId, 'xp', xpGain);
                reward.water += waterGain;
                reward.xp += xpGain;
                
                const plantKeys = Object.keys(Plants);
                const fruitCount = 2;
                for (let i = 0; i < fruitCount; i++) {
                    const randomFruit = plantKeys[Math.floor(Math.random() * plantKeys.length)];
                    addItemToInventory(userId, randomFruit, 1);
                    if (!reward.fruits[randomFruit]) reward.fruits[randomFruit] = 0;
                    reward.fruits[randomFruit]++;
                }
                
                claimedNames.push(localizeQuest(quest, language).name);
            }
        });

        transaction();

        if (claimedNames.length > 0 && channel) {
            let fruitString = '';
            for (const [key, qty] of Object.entries(reward.fruits)) {
                const info = Plants[key];
                fruitString += `+${qty} ${info.emoji} ${info.name}\n`;
            }

            const levelText = applyLevelUps(userId, language);
            const embed = successEmbed(
                t(language, 'questRewardClaimedTitle') || '📜 Quests Auto-Claimed',
                `${t(language, 'questClaimedLine', { quests: claimedNames.join(', ') }) || `You completed: **${claimedNames.join(', ')}**`}\n\n` +
                `+${reward.water} ${t(language, 'waterLabel')}\n` +
                `+${reward.xp} XP${levelText}\n\n` +
                `**Bonus Rewards:**\n${fruitString}`
            );
            
            await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
        }
    } else {
        // Just ping ONCE for newly completed quests
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(Colors.MARKET)
                .setTitle('📜 Quest Completed!')
                .setDescription(`You have completed **${newlyCompleted.length}** new daily quest(s)! Use \`/quests claim\` to get your rewards.\n*Want auto-claim? Upgrade to Pomo Pro!*`);
            
            await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
        }
    }
}

async function handleDaily(interaction, userId, language) {
    const quests = getDailyQuestStates(userId);
    const embed = buildQuestEmbed(interaction.user.username, quests, language);
    await interaction.reply({ embeds: [embed] });
}

async function handleClaim(interaction, userId, language) {
    const requestedKey = interaction.options.getString('quest') || 'all';
    const quests = getDailyQuestStates(userId);
    const claimable = quests.filter(q => q.completed && !q.claimed);
    const selected = requestedKey === 'all'
        ? claimable
        : claimable.filter(q => q.key === requestedKey);

    if (requestedKey !== 'all' && !quests.some(q => q.key === requestedKey)) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'questNotActiveTitle'), t(language, 'questNotActiveBody'))],
            flags: 64,
        });
    }

    if (selected.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'nothingToClaimTitle'), t(language, 'nothingToClaimBody'))],
            flags: 64,
        });
    }

    const today = getToday();
    const reward = { water: 0, xp: 0, fruits: {} };
    const claimedNames = [];
    const premium = await isPremium(interaction.client, userId);
    const premiumMultiplier = premium ? 1.5 : 1.0;

    const transaction = db.transaction(() => {
        for (const quest of selected) {
            const result = db.prepare(`
                INSERT OR IGNORE INTO quest_claims (user_id, quest_key, quest_date)
                VALUES (?, ?, ?)
            `).run(userId, quest.key, today);

            if (result.changes === 0) continue;

            // Paid plans boost quest water only: XP feeds levels and the XP leaderboard, which stay fair
            const waterGain = Math.ceil(quest.reward.water * premiumMultiplier);
            const xpGain = quest.reward.xp;

            incrementUser(userId, 'water', waterGain);
            incrementUser(userId, 'xp', xpGain);
            reward.water += waterGain;
            reward.xp += xpGain;
            
            // Give 1 random fruit per quest (premium gets 2)
            const plantKeys = Object.keys(Plants);
            const fruitCount = premium ? 2 : 1;
            for (let i = 0; i < fruitCount; i++) {
                const randomFruit = plantKeys[Math.floor(Math.random() * plantKeys.length)];
                addItemToInventory(userId, randomFruit, 1);
                if (!reward.fruits[randomFruit]) reward.fruits[randomFruit] = 0;
                reward.fruits[randomFruit]++;
            }
            
            claimedNames.push(localizeQuest(quest, language).name);
        }
    });

    transaction();

    if (claimedNames.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'alreadyClaimedTitle'), t(language, 'questAlreadyClaimedBody'))],
            flags: 64,
        });
    }

    let fruitString = '';
    for (const [key, qty] of Object.entries(reward.fruits)) {
        const info = Plants[key];
        fruitString += `+${qty} ${info.emoji} ${info.name}\n`;
    }

    const levelText = applyLevelUps(userId, language);
    const embed = successEmbed(
        t(language, 'questRewardClaimedTitle'),
        `${t(language, 'questClaimedLine', { quests: claimedNames.join(', ') })}\n\n` +
        `+${reward.water} ${t(language, 'waterLabel')}\n` +
        `+${reward.xp} XP${levelText}\n\n` +
        `**Bonus Rewards:**\n${fruitString}`
    );

    await interaction.reply({ embeds: [embed] });
}

function getDailyQuestStates(userId) {
    const today = getToday();
    const claimed = new Set(db.prepare(`
        SELECT quest_key FROM quest_claims WHERE user_id = ? AND quest_date = ?
    `).all(userId, today).map(row => row.quest_key));

    return getDailyQuests(userId, today).map(quest => {
        const progress = Math.min(quest.getProgress(userId, today), quest.target);
        return {
            ...quest,
            progress,
            completed: progress >= quest.target,
            claimed: claimed.has(quest.key),
        };
    });
}

function getDailyQuests(userId, today) {
    const start = hashString(`${userId}:${today}`) % QUEST_POOL.length;
    const quests = [];

    for (let i = 0; quests.length < 3 && i < QUEST_POOL.length * 2; i++) {
        const quest = QUEST_POOL[(start + i) % QUEST_POOL.length];
        if (!quests.some(q => q.key === quest.key)) quests.push(quest);
    }

    return quests;
}

function buildQuestEmbed(username, quests, language = 'en') {
    const today = getToday();
    let description = `${t(language, 'dailyQuestsReset')}\n\n`;

    for (const quest of quests) {
        const localized = localizeQuest(quest, language);
        const state = quest.claimed
            ? t(language, 'questStateClaimed')
            : quest.completed ? t(language, 'questStateReady') : t(language, 'questStateProgress');
        description += `**${localized.name}** - ${state}\n`;
        description += `${localized.description}\n`;
        description += `${progressBar(quest.progress, quest.target, 12)} ${quest.progress}/${quest.target} ${quest.unit}\n`;
        description += `${t(language, 'questRewardLabel')}: ${quest.reward.water} ${t(language, 'waterLabel')} + ${quest.reward.xp} XP\n\n`;
    }

    return new EmbedBuilder()
        .setColor(Colors.MARKET)
        .setTitle(t(language, 'dailyQuestsTitle', { username }))
        .setDescription(description)
        .setFooter({ text: t(language, 'questDateFooter', { date: today }) })
        .setTimestamp();
}

function applyLevelUps(userId, language = 'en') {
    const user = getOrCreateUser(userId);
    let newLevel = user.level;

    while (user.xp >= xpForLevel(newLevel)) {
        newLevel++;
    }

    if (newLevel <= user.level) return '';

    updateUser(userId, { level: newLevel });
    return `\n\n${t(language, 'levelUpLine', { level: newLevel })}`;
}

function localizeQuest(quest, language = 'en') {
    const map = {
        focus_50: ['questFocus50Name', 'questFocus50Description'],
        sessions_2: ['questSessions2Name', 'questSessions2Description'],
        todo_3: ['questTodo3Name', 'questTodo3Description'],
        harvest_1: ['questHarvest1Name', 'questHarvest1Description'],
        team_1: ['questTeam1Name', 'questTeam1Description'],
        daily_claim: ['questDailyClaimName', 'questDailyClaimDescription'],
    };
    const [nameKey, descriptionKey] = map[quest.key] || [];
    return {
        name: nameKey ? t(language, nameKey) : quest.name,
        description: descriptionKey ? t(language, descriptionKey) : quest.description,
    };
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getTodayFocusMinutes(userId, today) {
    const solo = db.prepare(`
        SELECT COALESCE(SUM(duration), 0) as total
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          AND date(started_at) = ?
    `).get(userId, today).total;

    const team = db.prepare(`
        SELECT COALESCE(SUM(ts.duration), 0) as total
        FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE tm.user_id = ?
          AND ts.status = 'completed'
          AND date(ts.started_at) = ?
    `).get(userId, today).total;

    const voice = db.prepare(`
        SELECT COALESCE(SUM(credited_minutes), 0) as total
        FROM voice_sessions
        WHERE user_id = ?
          AND status = 'completed'
          AND date(ended_at) = ?
    `).get(userId, today).total;

    return (solo || 0) + (team || 0) + (voice || 0);
}

function getTodaySessionCount(userId, today) {
    const solo = db.prepare(`
        SELECT COUNT(*) as total
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          AND date(started_at) = ?
    `).get(userId, today).total;

    const team = getTodayTeamCount(userId, today);
    const voice = db.prepare(`
        SELECT COUNT(*) as total
        FROM voice_sessions
        WHERE user_id = ?
          AND status = 'completed'
          AND credited_minutes > 0
          AND date(ended_at) = ?
    `).get(userId, today).total;
    return (solo || 0) + team + (voice || 0);
}

function getTodayTodoCount(userId, today) {
    return db.prepare(`
        SELECT COUNT(*) as total
        FROM todos
        WHERE user_id = ?
          AND completed = 1
          AND date(completed_at) = ?
    `).get(userId, today).total || 0;
}

function getTodayHarvestCount(userId, today) {
    return db.prepare(`
        SELECT COUNT(*) as total
        FROM harvested_items
        WHERE user_id = ?
          AND date(harvested_at) = ?
    `).get(userId, today).total || 0;
}

function getTodayTeamCount(userId, today) {
    return db.prepare(`
        SELECT COUNT(*) as total
        FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE tm.user_id = ?
          AND ts.status = 'completed'
          AND date(ts.started_at) = ?
    `).get(userId, today).total || 0;
}

function getTodayDailyClaim(userId, today) {
    const user = getOrCreateUser(userId);
    return user.last_daily_date === today ? 1 : 0;
}
