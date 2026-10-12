const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { db, getOrCreateUser } = require('../utils/database');
const { Colors } = require('../utils/constants');
const { isProActive } = require('../utils/premiumManager');
const { t, getInteractionLanguage } = require('../utils/i18n');

// Free users can switch persona once per this many days; Pro can switch any time
const FREE_SWITCH_COOLDOWN_DAYS = 30;

const PERSONAS = {
    sprinter: {
        id: 'sprinter',
        emoji: '⚡',
        key: 'personaSprinter',
        name: '⚡ The Sprinter',
        desc: 'Short burst, high intensity.',
        bonus: '+15% XP for sessions under 30 minutes',
        color: '#ffdd00'
    },
    marathoner: {
        id: 'marathoner',
        emoji: '🏔️',
        key: 'personaMarathoner',
        name: '🏔️ The Marathoner',
        desc: 'Deep work, long sessions.',
        bonus: '+20% Water for sessions over 90 minutes',
        color: '#00aaff'
    },
    night_owl: {
        id: 'night_owl',
        emoji: '🌙',
        key: 'personaNightOwl',
        name: '🌙 The Night Owl',
        desc: 'Late-night productivity.',
        bonus: '+25% XP for sessions between 10 PM and 4 AM (server time)',
        color: '#8b00ff'
    },
    architect: {
        id: 'architect',
        emoji: '🗺️',
        key: 'personaArchitect',
        name: '🗺️ The Architect',
        desc: 'Structured, consistent progression.',
        bonus: '+10% XP and Water on every completed session',
        color: '#ff6600'
    }
};

// Display strings for a persona in the given language. The English fields on
// PERSONAS stay as-is; persona ids stored in the DB never change.
function localizePersona(persona, language) {
    return {
        name: `${persona.emoji} ${t(language, `${persona.key}Name`)}`,
        desc: t(language, `${persona.key}Desc`),
        bonus: t(language, `${persona.key}Bonus`),
        short: t(language, `${persona.key}Short`),
    };
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('persona')
        .setDescription('Choose or view your Study Persona (Unlocks at Level 5)')
        .addSubcommand(sub => sub.setName('view').setDescription('View your current persona'))
        .addSubcommand(sub => sub.setName('choose').setDescription('Select or change your persona')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = getOrCreateUser(interaction.user.id);
        const language = getInteractionLanguage(interaction);

        if (user.level < 5) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.ERROR).setTitle(`🔒 ${t(language, 'personaLockedTitle')}`).setDescription(t(language, 'personaLockedBody'))],
                flags: 64
            });
        }

        if (subcommand === 'view') {
            if (!user.persona || !PERSONAS[user.persona]) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle(`🎭 ${t(language, 'personaNoneTitle')}`).setDescription(t(language, 'personaNoneBody'))],
                    flags: 64
                });
            }
            const p = PERSONAS[user.persona];
            const lp = localizePersona(p, language);
            const embed = new EmbedBuilder()
                .setColor(p.color)
                .setTitle(t(language, 'personaViewTitle', { name: lp.name }))
                .setDescription(`*${lp.desc}*\n\n**${t(language, 'personaPassiveBonusLabel')}**\n${lp.bonus}\n\n*${t(language, 'personaSkillTreesSoon')}*`);
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'choose') {
            const options = Object.values(PERSONAS).map(p => {
                const lp = localizePersona(p, language);
                return {
                    label: lp.name,
                    description: lp.desc.substring(0, 50),
                    value: p.id
                };
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('persona_select')
                .setPlaceholder(t(language, 'personaSelectPlaceholder'))
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.PRIMARY)
                        .setTitle(`🎭 ${t(language, 'personaChooseTitle')}`)
                        .setDescription(
                            `${t(language, 'personaChooseIntro')}\n\n` +
                            Object.values(PERSONAS)
                                .map(p => `${p.emoji} **${t(language, `${p.key}Name`)}**: ${t(language, `${p.key}Short`)}`)
                                .join('\n')
                        )
                ],
                components: [row],
                flags: 64
            });
        }
    }
};

module.exports.PERSONAS = PERSONAS;
module.exports.localizePersona = localizePersona;

async function handlePersonaSelect(interaction) {
    const userId = interaction.user.id;
    const personaId = interaction.values[0];
    const persona = PERSONAS[personaId];
    const user = getOrCreateUser(userId);
    const language = getInteractionLanguage(interaction);

    if (!persona) {
        return interaction.update({ content: `❌ ${t(language, 'personaUnknownBody')}`, embeds: [], components: [] });
    }
    const lp = localizePersona(persona, language);
    if (user.level < 5) {
        return interaction.update({ content: `🔒 ${t(language, 'personaUnlockLevelBody')}`, embeds: [], components: [] });
    }
    if (user.persona === personaId) {
        return interaction.update({ content: t(language, 'personaAlreadyBody', { name: lp.name }), embeds: [], components: [] });
    }

    if (user.persona && user.persona_changed_at && !isProActive(userId)) {
        const changedAt = new Date(`${user.persona_changed_at.replace(' ', 'T')}Z`);
        const nextSwitch = new Date(changedAt.getTime() + FREE_SWITCH_COOLDOWN_DAYS * 86400000);
        if (nextSwitch > new Date()) {
            const { triggerUpsell } = require('../utils/upsellManager');
            if (await triggerUpsell(interaction, 'PERSONA_SWITCH')) return;
            return interaction.reply({
                content: `⏳ ${t(language, 'personaCooldownBody', { time: `<t:${Math.floor(nextSwitch.getTime() / 1000)}:R>` })}`,
                flags: 64,
            });
        }
    }

    db.prepare("UPDATE users SET persona = ?, persona_changed_at = datetime('now') WHERE discord_id = ?").run(personaId, userId);

    return interaction.update({
        embeds: [new EmbedBuilder()
            .setColor(persona.color)
            .setTitle(`🎭 ${t(language, 'personaNowTitle', { name: lp.name })}`)
            .setDescription(`*${lp.desc}*\n\n**${t(language, 'personaPassiveBonusLabel')}**\n${lp.bonus}`)],
        components: [],
    });
}

module.exports.handlePersonaSelect = handlePersonaSelect;
