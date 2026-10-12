/**
 * /settings — View and manage notification preferences + theme.
 * Subcommands: view, notifications, reminders, theme
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { Colors } = require('../utils/constants');
const { getOrCreateUser, getOrCreateSettings, updateUser, db } = require('../utils/database');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

// Available themes and their labels
const ThemeInfo = {
    basic: { name: 'Basic', emoji: '🎨' },
    nature: { name: 'Nature', emoji: '🌿' },
    dark: { name: 'Dark', emoji: '🌑' },
    sunset: { name: 'Sunset', emoji: '🌅' },
    ocean: { name: 'Ocean', emoji: '🌊' },
    sakura: { name: 'Sakura', emoji: '🌸' },
    cyberpunk: { name: 'Cyberpunk', emoji: '🔋' },
    lofi: { name: 'Lo-fi', emoji: '🎧' },
};

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage your bot settings')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your current settings'))
        .addSubcommand(sub =>
            sub.setName('notifications')
                .setDescription('Toggle 5-minute end-of-session notification')
                .addStringOption(option =>
                    option.setName('toggle')
                        .setDescription('Turn notifications on or off')
                        .setRequired(true)
                        .addChoices(
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' },
                        )))
        .addSubcommand(sub =>
            sub.setName('reminders')
                .setDescription('Choose how you receive notifications')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Notification delivery method')
                        .setRequired(true)
                        .addChoices(
                            { name: 'DM (Direct Message)', value: 'dm' },
                            { name: 'Mention (in server)', value: 'mention' },
                        )))
        .addSubcommand(sub =>
            sub.setName('theme')
                .setDescription('Switch your profile theme')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Theme to switch to')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎨 Basic', value: 'basic' },
                            { name: '🌿 Nature', value: 'nature' },
                            { name: '🌑 Dark', value: 'dark' },
                            { name: '🌅 Sunset', value: 'sunset' },
                            { name: '🌊 Ocean', value: 'ocean' },
                            { name: '🌸 Sakura', value: 'sakura' },
                            { name: '🔋 Cyberpunk', value: 'cyberpunk' },
                            { name: '🎧 Lo-fi', value: 'lofi' },
                        )))
        .addSubcommand(sub =>
            sub.setName('friend_notify')
                .setDescription('Toggle whether friends are notified when you study')
                .addStringOption(option =>
                    option.setName('toggle')
                        .setDescription('Turn friend notifications on or off')
                        .setRequired(true)
                        .addChoices(
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' },
                        )))
        .addSubcommand(sub =>
            sub.setName('session_card')
                .setDescription('Choose how your session completion looks')
                .addStringOption(option =>
                    option.setName('style')
                        .setDescription('Image card (compact) or detailed text embed')
                        .setRequired(true)
                        .addChoices(
                            { name: '🖼️ Image Card (default)', value: 'image' },
                            { name: '📋 Detailed Text', value: 'text' },
                        ))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            return handleView(interaction, userId, language);
        } else if (subcommand === 'notifications') {
            return handleNotifications(interaction, userId, language);
        } else if (subcommand === 'reminders') {
            return handleReminders(interaction, userId, language);
        } else if (subcommand === 'theme') {
            return handleTheme(interaction, userId, language);
        } else if (subcommand === 'friend_notify') {
            return handleFriendNotify(interaction, userId, language);
        } else if (subcommand === 'session_card') {
            return handleSessionCard(interaction, userId, language);
        }
    },
};

async function handleView(interaction, userId, language) {
    const settings = getOrCreateSettings(userId);
    const user = getOrCreateUser(userId);

    const notifyStatus = settings.notify_before_end ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;
    const remindersStatus = settings.reminders_enabled ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;
    const dailyHabits = settings.morning_prompt ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;
    const notifyType = settings.notify_type === 'dm' ? `📬 ${t(language, 'directMessageLabel')}` : `📢 ${t(language, 'serverMentionLabel')}`;
    const themeInfo = ThemeInfo[user.theme] || ThemeInfo.basic;
    const cardStyle = (settings.session_card_style || 'image') === 'image' ? '🖼️ Image Card' : '📋 Detailed Text';

    // Get owned themes
    const ownedThemeKeys = db.prepare(
        "SELECT item_key FROM inventory WHERE user_id = ? AND item_key LIKE 'theme_%'"
    ).all(userId).map(r => r.item_key.replace('theme_', ''));
    // Basic is always owned
    if (!ownedThemeKeys.includes('basic')) ownedThemeKeys.unshift('basic');

    const ownedList = ownedThemeKeys.map(k => {
        const info = ThemeInfo[k];
        const active = k === user.theme ? ` *(${t(language, 'activeMarker')})*` : '';
        return info ? `${info.emoji} ${info.name}${active}` : k;
    }).join(', ');

    const friendNotifyStatus = settings.notify_friends ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`⚙️ ${t(language, 'settingsTitle')}`)
        .addFields(
            { name: `🔔 ${t(language, 'settingsEndNotification')}`, value: notifyStatus, inline: true },
            { name: `📨 ${t(language, 'settingsNotificationType')}`, value: notifyType, inline: true },
            { name: `⏰ ${t(language, 'settingsRemindersEnabled')}`, value: remindersStatus, inline: true },
            { name: `👥 ${t(language, 'settingsFriendNotifications')}`, value: friendNotifyStatus, inline: true },
            { name: `🎨 ${t(language, 'settingsCurrentTheme')}`, value: `${themeInfo.emoji} ${themeInfo.name}`, inline: true },
            { name: `✅ Session Card Style`, value: cardStyle, inline: true },
            { name: `🎭 ${t(language, 'settingsOwnedThemes')}`, value: ownedList, inline: false },
        )
        .setDescription('Click the buttons below to toggle your notification preferences instantly!')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`set_notify_${userId}`)
            .setLabel(settings.notify_before_end ? '🔔 Ping: ON' : '🔕 Ping: OFF')
            .setStyle(settings.notify_before_end ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`set_type_${userId}`)
            .setLabel(settings.notify_type === 'dm' ? '📬 Mode: DM' : '📢 Mode: Channel')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`set_friends_${userId}`)
            .setLabel(settings.notify_friends ? '👥 Friends: ON' : '👤 Friends: OFF')
            .setStyle(settings.notify_friends ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const response = await interaction.reply({ embeds: [embed], components: [row], flags: 64 });

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
    });

    collector.on('collect', async i => {
        if (i.user.id !== userId) return i.deferUpdate();

        const currentSettings = getOrCreateSettings(userId);

        if (i.customId === `set_notify_${userId}`) {
            const nextVal = currentSettings.notify_before_end ? 0 : 1;
            db.prepare('UPDATE settings SET notify_before_end = ?, reminders_enabled = ? WHERE user_id = ?').run(nextVal, nextVal, userId);
        } else if (i.customId === `set_type_${userId}`) {
            const nextType = currentSettings.notify_type === 'dm' ? 'mention' : 'dm';
            db.prepare('UPDATE settings SET notify_type = ? WHERE user_id = ?').run(nextType, userId);
        } else if (i.customId === `set_friends_${userId}`) {
            const nextVal = currentSettings.notify_friends ? 0 : 1;
            db.prepare('UPDATE settings SET notify_friends = ? WHERE user_id = ?').run(nextVal, userId);
        }

        // Refresh settings
        const updated = getOrCreateSettings(userId);
        const updatedNotifyStatus = updated.notify_before_end ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;
        const updatedRemindersStatus = updated.reminders_enabled ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;
        const updatedNotifyType = updated.notify_type === 'dm' ? `📬 ${t(language, 'directMessageLabel')}` : `📢 ${t(language, 'serverMentionLabel')}`;
        const updatedFriendNotifyStatus = updated.notify_friends ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}`;

        const updatedEmbed = EmbedBuilder.from(embed).setFields(
            { name: `🔔 ${t(language, 'settingsEndNotification')}`, value: updatedNotifyStatus, inline: true },
            { name: `📨 ${t(language, 'settingsNotificationType')}`, value: updatedNotifyType, inline: true },
            { name: `⏰ ${t(language, 'settingsRemindersEnabled')}`, value: updatedRemindersStatus, inline: true },
            { name: `👥 ${t(language, 'settingsFriendNotifications')}`, value: updatedFriendNotifyStatus, inline: true },
            { name: `🎨 ${t(language, 'settingsCurrentTheme')}`, value: `${themeInfo.emoji} ${themeInfo.name}`, inline: true },
            { name: `🎭 ${t(language, 'settingsOwnedThemes')}`, value: ownedList, inline: false }
        );

        const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`set_notify_${userId}`)
                .setLabel(updated.notify_before_end ? '🔔 Ping: ON' : '🔕 Ping: OFF')
                .setStyle(updated.notify_before_end ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`set_type_${userId}`)
                .setLabel(updated.notify_type === 'dm' ? '📬 Mode: DM' : '📢 Mode: Channel')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`set_friends_${userId}`)
                .setLabel(updated.notify_friends ? '👥 Friends: ON' : '👤 Friends: OFF')
                .setStyle(updated.notify_friends ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

        await i.update({ embeds: [updatedEmbed], components: [updatedRow] });
    });
}

async function handleNotifications(interaction, userId, language) {
    const toggle = interaction.options.getString('toggle');
    const enabled = toggle === 'on' ? 1 : 0;

    getOrCreateSettings(userId);
    db.prepare('UPDATE settings SET notify_before_end = ?, reminders_enabled = ?, morning_prompt = ?, evening_alert = ?, evening_reflection = ? WHERE user_id = ?')
        .run(enabled, enabled, enabled, enabled, enabled, userId);

    await interaction.reply({
        embeds: [successEmbed(
            t(language, 'settingsUpdatedTitle'),
            t(language, 'notificationSettingLine', { value: toggle === 'on' ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}` })
        )],
        flags: 64,
    });
}

async function handleReminders(interaction, userId, language) {
    const type = interaction.options.getString('type');

    getOrCreateSettings(userId);
    db.prepare('UPDATE settings SET notify_type = ? WHERE user_id = ?').run(type, userId);

    const label = type === 'dm' ? `📬 ${t(language, 'directMessageLabel')}` : `📢 ${t(language, 'serverMentionLabel')}`;

    await interaction.reply({
        embeds: [successEmbed(
            t(language, 'settingsUpdatedTitle'),
            t(language, 'notificationTypeSetLine', { value: label })
        )],
        flags: 64,
    });
}

async function handleFriendNotify(interaction, userId, language) {
    const toggle = interaction.options.getString('toggle');
    const enabled = toggle === 'on' ? 1 : 0;

    getOrCreateSettings(userId);
    db.prepare('UPDATE settings SET notify_friends = ? WHERE user_id = ?').run(enabled, userId);

    await interaction.reply({
        embeds: [successEmbed(
            t(language, 'settingsUpdatedTitle'),
            t(language, 'friendNotificationsLine', { value: toggle === 'on' ? `✅ ${t(language, 'on')}` : `❌ ${t(language, 'off')}` })
        )],
        flags: 64,
    });
}

async function handleTheme(interaction, userId, language) {
    const themeName = interaction.options.getString('name');
    const themeInfo = ThemeInfo[themeName];

    if (!themeInfo) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'invalidThemeTitle'), t(language, 'invalidThemeBody'))],
            flags: 64,
        });
    }

    // Check if user owns the theme (basic is always free)
    if (themeName !== 'basic') {
        const owned = db.prepare(
            'SELECT * FROM inventory WHERE user_id = ? AND item_key = ?'
        ).get(userId, `theme_${themeName}`);

        if (!owned || owned.quantity <= 0) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'themeNotOwnedTitle'), t(language, 'themeNotOwnedBody', { theme: themeInfo.name }))],
                flags: 64,
            });
        }
    }

    // Switch theme
    updateUser(userId, { theme: themeName });

    await interaction.reply({
        embeds: [successEmbed(
            t(language, 'themeChangedTitle'),
            t(language, 'themeChangedBody', { theme: `${themeInfo.emoji} **${themeInfo.name}**` })
        )],
        flags: 64,
    });
}

async function handleSessionCard(interaction, userId, language) {
    const style = interaction.options.getString('style');

    getOrCreateSettings(userId);
    db.prepare("UPDATE settings SET session_card_style = ? WHERE user_id = ?").run(style, userId);

    const label = style === 'image' ? '🖼️ Image Card' : '📋 Detailed Text';

    await interaction.reply({
        embeds: [successEmbed(
            '✅ Session Card Style Updated',
            `Your session completion style is now set to **${label}**.\n\nThis will take effect on your next session!`
        )],
        flags: 64,
    });
}
