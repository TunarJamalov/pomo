const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getOrCreateUser, db } = require('../utils/database');
const { hasFullPro } = require('../utils/premiumCheck');
const { getBestHour, setAssistantEnabled, isAssistantEnabled, nextOccurrence } = require('../utils/assistant');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('assistant')
        .setDescription('Your Pomo assistant: personal study reminders (Pomo Pro)')
        .addSubcommand(sub => sub.setName('on').setDescription('Turn on personal study reminders'))
        .addSubcommand(sub => sub.setName('off').setDescription('Turn off personal study reminders'))
        .addSubcommand(sub => sub.setName('status').setDescription('See what the assistant knows about your study rhythm')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        getOrCreateUser(userId);
        await interaction.deferReply({ flags: 64 });

        // Turning it off never needs Pro
        if (subcommand === 'off') {
            setAssistantEnabled(userId, false);
            return interaction.editReply({ embeds: [successEmbed(t(language, 'assistantTitle'), t(language, 'assistantOffBody'))] });
        }

        if (!await hasFullPro(interaction.client, userId)) {
            return interaction.editReply({ embeds: [errorEmbed(t(language, 'proFeatureTitle'), t(language, 'assistantProOnly'))] });
        }

        if (subcommand === 'on') {
            setAssistantEnabled(userId, true);
            return interaction.editReply({ embeds: [successEmbed(t(language, 'assistantTitle'), t(language, 'assistantOnBody'))] });
        }

        const bestHour = getBestHour(userId);
        const today = new Date().toISOString().slice(0, 10);
        const exams = db.prepare('SELECT COUNT(*) AS n FROM user_exams WHERE user_id = ? AND exam_date > ?').get(userId, today).n;
        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(t(language, 'assistantTitle'))
            .setDescription(t(language, 'assistantStatusBody', {
                status: t(language, isAssistantEnabled(userId) ? 'enabled' : 'disabled'),
                hour: bestHour === null ? t(language, 'assistantNeedData') : nextOccurrence(bestHour),
                exams,
            }));
        return interaction.editReply({ embeds: [embed] });
    },
};

module.exports.nextOccurrence = nextOccurrence;
