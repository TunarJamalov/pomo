const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const {
    getOrCreateUser,
    createChallenge,
    getActiveChallengesForGuild,
    getChallengeById,
    joinChallenge,
    getChallengeLeaderboard,
    db,
} = require('../utils/database');

const CHALLENGE_TYPES = [
    { name: '⏱️ Time Challenge', value: 'time', desc: 'Accumulate X total focus minutes', maxTarget: 50000 },
    { name: '🔥 Streak Challenge', value: 'streak', desc: 'Complete X consecutive days', maxTarget: 365 },
    { name: '📚 Session Challenge', value: 'sessions', desc: 'Complete X study sessions', maxTarget: 500 },
    { name: '🎯 Goal Challenge', value: 'goal', desc: 'Complete X study goals', maxTarget: 500 },
    { name: '👥 Team Challenge', value: 'team', desc: 'Collective guild focus time (minutes)', maxTarget: 50000 },
];

const MAX_DURATION_DAYS = 365;

function parseDuration(input) {
    const match = String(input).match(/^(\d+)([dwm])$/);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2];
    if (amount <= 0 || amount > MAX_DURATION_DAYS * 10) return null;
    let days = amount;
    if (unit === 'w') days = amount * 7;
    else if (unit === 'm') days = 30;
    return days <= MAX_DURATION_DAYS ? days : null;
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Create and join community study challenges')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new community challenge')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Type of challenge')
                        .setRequired(true)
                        .addChoices(...CHALLENGE_TYPES.map(c => ({ name: c.name, value: c.value }))))
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Challenge title (e.g., "30 Day Java Challenge")')
                        .setRequired(true)
                        .setMaxLength(60))
                .addIntegerOption(opt =>
                    opt.setName('target')
                        .setDescription('Target value (minutes for time, days for streak, sessions, etc.)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10000))
                .addStringOption(opt =>
                    opt.setName('duration')
                        .setDescription('How long the challenge lasts (e.g., "7d", "14d", "30d", "4w")')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View all active challenges in this server'))
        .addSubcommand(sub =>
            sub.setName('join')
                .setDescription('Join a challenge')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('Challenge ID (from /challenge list)')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('View challenge leaderboard')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('Challenge ID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('leave')
                .setDescription('Leave a challenge')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('Challenge ID')
                        .setRequired(true))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);

        if (!interaction.guildId) {
            return interaction.reply({
                embeds: [errorEmbed('Server Only', 'Challenges can only be created and joined on servers.')],
                flags: 64,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'create') return handleCreate(interaction, userId, language);
        if (subcommand === 'list') return handleList(interaction, language);
        if (subcommand === 'join') return handleJoin(interaction, userId, language);
        if (subcommand === 'leaderboard') return handleLeaderboard(interaction, userId, language);
        if (subcommand === 'leave') return handleLeave(interaction, userId, language);
    },
};

async function handleCreate(interaction, userId, language) {
    const type = interaction.options.getString('type');
    const title = interaction.options.getString('title');
    const target = interaction.options.getInteger('target');
    const durationOpt = interaction.options.getString('duration') || '7d';

    const typeInfo = CHALLENGE_TYPES.find(t => t.value === type);
    if (!typeInfo) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Type', 'Unknown challenge type.')],
            flags: 64,
        });
    }
    if (target > typeInfo.maxTarget) {
        return interaction.reply({
            embeds: [errorEmbed('Target Too High', `Maximum target for ${typeInfo.name} is ${typeInfo.maxTarget}.`)],
            flags: 64,
        });
    }

    const days = parseDuration(durationOpt);
    if (days === null) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Duration', 'Use format like "7d", "14d", "30d", or "4w" (max 365 days).')],
            flags: 64,
        });
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    endDate.setHours(23, 59, 59, 999);

    const result = createChallenge(userId, interaction.guildId, title, type, target, endDate.toISOString());
    const challengeId = Number(result.lastInsertRowid);
    joinChallenge(challengeId, userId);

    const embed = successEmbed(
        `🎯 Challenge Created: ${title}`,
        `**Type:** ${typeInfo.desc}\n` +
        `**Target:** ${target}${type === 'time' ? ' min' : type === 'streak' ? ' days' : ' sessions'}\n` +
        `**Duration:** ${days} days\n` +
        `**Ends:** <t:${Math.floor(endDate.getTime() / 1000)}:D>\n\n` +
        `Share \`/challenge join id:${challengeId}\` with friends!`
    );

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleList(interaction, language) {
    const challenges = getActiveChallengesForGuild(interaction.guildId);

    if (!challenges.length) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('📋 Active Challenges')
                .setDescription('No active challenges in this server yet. Use `/challenge create` to start one!')
                .setTimestamp()],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle('📋 Active Challenges')
        .setDescription(challenges.slice(0, 5).map(c => {
            const typeInfo = CHALLENGE_TYPES.find(t => t.value === c.challenge_type) || { desc: c.challenge_type };
            const endDate = new Date(c.end_date);
            const endTs = Math.floor(endDate.getTime() / 1000);
            return `**#${c.id}** ${typeInfo.desc}\n📝 ${c.title}\n🎯 ${c.target_value} | 📊 ${c.member_count || 0} participants | ⏰ <t:${endTs}:R>`;
        }).join('\n\n') || 'No challenges yet.')
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleJoin(interaction, userId, language) {
    const challengeId = interaction.options.getInteger('id');
    const challenge = getChallengeById(challengeId);

    if (!challenge || challenge.status !== 'active') {
        return interaction.reply({
            embeds: [errorEmbed('Challenge Not Found', 'This challenge does not exist or has ended.')],
            flags: 64,
        });
    }

    if (challenge.guild_id !== interaction.guildId) {
        return interaction.reply({
            embeds: [errorEmbed('Wrong Server', 'This challenge is on a different server.')],
            flags: 64,
        });
    }

    if (challenge.end_date && new Date(challenge.end_date) < new Date()) {
        return interaction.reply({
            embeds: [errorEmbed('Challenge Ended', 'This challenge has already ended.')],
            flags: 64,
        });
    }

    const existing = db.prepare(`SELECT id FROM challenge_members WHERE challenge_id = ? AND user_id = ?`).get(challengeId, userId);
    if (existing) {
        return interaction.reply({
            embeds: [errorEmbed('Already Joined', `You are already a member of "${challenge.title}".`)],
            flags: 64,
        });
    }

    joinChallenge(challengeId, userId);

    const embed = successEmbed(
        '✅ Joined Challenge!',
        `You have joined **${challenge.title}**. Good luck!`
    );

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleLeaderboard(interaction, userId, language) {
    const challengeId = interaction.options.getInteger('id');
    const challenge = getChallengeById(challengeId);

    if (!challenge) {
        return interaction.reply({
            embeds: [errorEmbed('Challenge Not Found', 'Challenge not found.')],
            flags: 64,
        });
    }

    const leaderboard = getChallengeLeaderboard(challengeId);
    const typeInfo = CHALLENGE_TYPES.find(t => t.value === challenge.challenge_type) || { desc: challenge.challenge_type };

    const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(`🏆 ${challenge.title}`)
        .setDescription(
            `**Type:** ${typeInfo.desc}\n` +
            `**Target:** ${challenge.target_value}\n` +
            `**Participants:** ${leaderboard.length}\n\n` +
            (leaderboard.length > 0
                ? leaderboard.slice(0, 10).map((entry, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    return `${medal} <@${entry.discord_id}> — ${entry.progress}${challenge.challenge_type === 'time' ? 'm' : ''}`;
                }).join('\n')
                : 'No participants yet. Use `/challenge join id:${challengeId}` to start!')
        )
        .setFooter({ text: `Ends ${challenge.end_date ? new Date(challenge.end_date).toLocaleDateString() : 'Unknown'}` })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleLeave(interaction, userId, language) {
    const challengeId = interaction.options.getInteger('id');
    const existing = db.prepare(`SELECT id FROM challenge_members WHERE challenge_id = ? AND user_id = ?`).get(challengeId, userId);

    if (!existing) {
        return interaction.reply({
            embeds: [errorEmbed('Not Joined', 'You are not in this challenge.')],
            flags: 64,
        });
    }

    db.prepare(`DELETE FROM challenge_members WHERE challenge_id = ? AND user_id = ?`).run(challengeId, userId);

    return interaction.reply({
        embeds: [successEmbed('Left Challenge', 'You have left the challenge.')],
        flags: 64,
    });
}

const { AttachmentBuilder: AttBuilder } = require('discord.js');

async function handleChallengeShare(interaction, language) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    
    // Fetch last 30 days of data
    const end = new Date();
    end.setUTCHours(0,0,0,0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    
    const rows = db.prepare(`
        SELECT date(started_at) AS date, sum(duration) as minutes
        FROM study_sessions 
        WHERE user_id = ? AND completed = 1 AND title != '__break__'
          AND date(started_at) >= ? 
        GROUP BY date
    `).all(userId, start.toISOString().slice(0, 10));

    const dayMap = new Map();
    for (const r of rows) dayMap.set(r.date, r.minutes);

    const days = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const k = d.toISOString().slice(0,10);
        days.push({ date: k, minutes: dayMap.get(k) || 0 });
    }

    try {
        const { generatePomoChallengeCard } = require('../utils/canvas');
        const user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(userId) || { level: 1, total_focus_minutes: 0, streak: 0 };
        const discordUser = interaction.user;
        
        const buffer = await generatePomoChallengeCard(discordUser, user, days);
        const attachment = new AttBuilder(buffer, { name: '30-day-challenge.png' });
        
        return interaction.editReply({
            content: `🔥 **30-Day PomoChallenge Snapshot!** Share this to show off your consistency!\n> *Tracked by PomoBot · pomofocus.online*`,
            files: [attachment]
        });
    } catch (err) {
        console.error('Challenge Share error:', err);
        return interaction.editReply('Failed to generate your challenge snapshot.');
    }
}

