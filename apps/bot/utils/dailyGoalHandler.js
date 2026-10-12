const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser } = require('./database');
const { successEmbed } = require('./embeds');
const { t, getInteractionLanguage, getUserLanguage } = require('./i18n');

// The morning prompt that carries this button is a DM, so outside a guild use the
// same language the DM was sent in (the user's most recently active guild).
function resolveLanguage(interaction) {
    return interaction.guildId ? getInteractionLanguage(interaction) : getUserLanguage(interaction.user?.id);
}

async function handleSetDailyGoalBtn(interaction) {
    const language = resolveLanguage(interaction);
    const modal = new ModalBuilder()
        .setCustomId('daily_goal_modal')
        .setTitle(t(language, 'habitsGoalModalTitle'));

    const goalInput = new TextInputBuilder()
        .setCustomId('goal_text')
        .setLabel(t(language, 'habitsGoalInputLabel'))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(t(language, 'habitsGoalInputPlaceholder'))
        .setRequired(true)
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(goalInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

async function handleDailyGoalSubmit(interaction) {
    const text = interaction.fields.getTextInputValue('goal_text');
    const userId = interaction.user.id;
    const user = getOrCreateUser(userId);
    const language = resolveLanguage(interaction);

    // Add it as a todo list item
    db.prepare('INSERT INTO todos (user_id, content) VALUES (?, ?)').run(userId, t(language, 'habitsGoalTodoContent', { text }));

    await interaction.reply({
        embeds: [successEmbed(t(language, 'habitsGoalSetTitle'), t(language, 'habitsGoalSetBody', { text }))],
        flags: 64
    });
}

module.exports = { handleSetDailyGoalBtn, handleDailyGoalSubmit };
