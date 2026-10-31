/**
 * Quick Setup: one click turns on voice tracking for every voice channel,
 * weekly reports and a size-appropriate weekly goal, without creating anything.
 */
const { initDatabase, getOrCreateGuildSettings, db } = require('../utils/database');

const trackedTopics = guildId => db.prepare(
    "SELECT topic FROM onboarding_events WHERE guild_id = ? AND event_type = 'setup' ORDER BY id"
).all(guildId).map(row => row.topic);
const interactionCreate = require('../events/interactionCreate');
const { isTrackedVoiceChannel } = require('../utils/voiceManager');

function buildButton({ customId = 'setup_quick', canManage = true, memberCount = 8 } = {}) {
    const allow = { has: () => true };
    const channel = {
        id: 'quick_channel',
        isTextBased: () => true,
        isDMBased: () => false,
        permissionsFor: () => allow,
    };
    return {
        customId,
        isButton: () => true,
        guildId: 'quick_guild',
        guild: { id: 'quick_guild', name: 'Study Friends', memberCount, members: { me: {} } },
        channel,
        locale: 'en',
        user: { id: 'quick_admin' },
        client: {},
        memberPermissions: { has: () => canManage },
        deferReply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        reply: jest.fn().mockResolvedValue({}),
    };
}

beforeAll(() => initDatabase());

describe('Quick Setup button', () => {
    test('turns on every module with existing channels and a small-server goal', async () => {
        const interaction = buildButton();
        await interactionCreate.execute(interaction);

        const settings = getOrCreateGuildSettings('quick_guild');
        expect(settings.voice_tracking_enabled).toBe(1);
        expect(settings.voice_target_type).toBe('all');
        expect(settings.report_enabled).toBe(1);
        expect(settings.report_channel_id).toBe('quick_channel');
        expect(settings.goal_enabled).toBe(1);
        expect(settings.goal_target_minutes).toBe(300);
        expect(settings.setup_completed_at).toBeTruthy();
        expect(interaction.deferReply).toHaveBeenCalled();
        expect(interaction.editReply.mock.calls[0][0].embeds[0].data.title).toContain('Quick Setup');
    });

    test('a second click reports that setup is already done', async () => {
        const interaction = buildButton();
        await interactionCreate.execute(interaction);
        expect(interaction.editReply.mock.calls[0][0].embeds[0].data.description).toContain('already configured');
        expect(trackedTopics('quick_guild')).toContain('quick_already_done');
    });

    test('members without Manage Server cannot run it', async () => {
        const interaction = buildButton({ canManage: false });
        interaction.guildId = 'other_guild';
        interaction.guild = { ...interaction.guild, id: 'other_guild' };
        await interactionCreate.execute(interaction);
        expect(getOrCreateGuildSettings('other_guild').voice_tracking_enabled).toBeFalsy();
        expect(interaction.editReply).toHaveBeenCalled();
        // Counted in /botstats, so clicks that never finish are explained
        expect(trackedTopics('other_guild')).toEqual(['quick_click', 'quick_no_permission']);
    });
});

describe('1-Click Setup outcomes in /botstats', () => {
    test('a member without Manage Server is counted as not a manager', async () => {
        const interaction = buildButton({ customId: 'setup_auto', canManage: false });
        interaction.guildId = 'auto_guild';
        interaction.guild = { ...interaction.guild, id: 'auto_guild' };
        await interactionCreate.execute(interaction);
        expect(trackedTopics('auto_guild')).toEqual(['auto_click', 'auto_not_manager']);
    });

    test('a server that is already set up is counted as already set up', async () => {
        const interaction = buildButton({ customId: 'setup_auto' });
        interaction.guild.members.me = { permissions: { has: () => true } };
        await interactionCreate.execute(interaction);
        expect(trackedTopics('quick_guild')).toEqual(expect.arrayContaining(['auto_click', 'auto_already_done']));
        expect(interaction.editReply.mock.calls[0][0].embeds[0].data.title).toContain('✅');
    });
});

describe('voice tracking for all channels', () => {
    const channels = new Map([['study', { id: 'study' }], ['afk', { id: 'afk' }]]);
    const guild = { id: 'g', afkChannelId: 'afk', channels: { cache: channels } };

    test('counts every voice channel except AFK', () => {
        const settings = { voice_tracking_enabled: 1, voice_target_type: 'all', voice_target_id: null };
        expect(isTrackedVoiceChannel(guild, 'study', settings)).toBe(true);
        expect(isTrackedVoiceChannel(guild, 'afk', settings)).toBe(false);
    });
});

describe('welcome message', () => {
    const { buildWelcomeEmbed } = require('../events/guildCreate');

    test('is written in the server language and offers all three ways to start', () => {
        const embed = buildWelcomeEmbed({ name: 'Dərs Otağı' }, 'az').toJSON();
        expect(embed.title).toContain('Dərs Otağı');
        expect(embed.title).toContain('hazırdır');
        expect(embed.fields.map(f => f.value).join(' ')).toContain('/study 25');
        expect(embed.fields).toHaveLength(3);
    });
});

describe('expired button interactions', () => {
    test('a reply that fails with 10062 is handled instead of escaping as an uncaught error', async () => {
        const expired = Object.assign(new Error('Unknown interaction'), { code: 10062 });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const interaction = {
            ...buildButton({ customId: 'buddy_like_x_y' }),
            reply: jest.fn().mockRejectedValue(expired),
        };

        await expect(interactionCreate.execute(interaction)).resolves.not.toThrow();
        expect(interaction.reply).toHaveBeenCalled();
        expect(warn.mock.calls.some(args => String(args[0]).includes('10062'))).toBe(true);
        warn.mockRestore();
    });
});
