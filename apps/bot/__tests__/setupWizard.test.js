const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_setup_wizard_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    recordGuildJoin,
    getOrCreateUser,
    getSetupNudgeCandidates,
    markSetupNudgeSent,
} = require('../utils/database');
const {
    isGuildConfigured,
    isSetupComplete,
    buildSetupButtonRow,
    buildSetupWizardRows,
    buildSetupWizardRowsFor,
    buildSetupProgressEmbed,
    getSetupRecommendation,
    configureReportChannel,
    maybeSendSetupNudge,
    buildSetupNudgeEmbed,
} = require('../utils/setupWizard');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM study_sessions;
        DELETE FROM guild_installations;
        DELETE FROM guild_settings;
        DELETE FROM users;
    `);
});

describe('setup activation wizard', () => {
    test('detects whether any server feature is configured', () => {
        expect(isGuildConfigured({
            voice_tracking_enabled: 0,
            report_enabled: 0,
            goal_enabled: 0,
        })).toBe(false);
        expect(isGuildConfigured({
            voice_tracking_enabled: 0,
            report_enabled: 1,
            goal_enabled: 0,
        })).toBe(true);
        expect(isSetupComplete({
            voice_tracking_enabled: 1,
            report_enabled: 1,
            goal_enabled: 0,
        })).toBe(false);
        expect(isSetupComplete({
            voice_tracking_enabled: 1,
            report_enabled: 1,
            goal_enabled: 1,
        })).toBe(true);
    });

    test('builds valid setup button and channel select components', () => {
        const buttonJson = buildSetupButtonRow().toJSON();
        const wizardJson = buildSetupWizardRows().map(row => row.toJSON());

        expect(buttonJson.components[0].custom_id).toBe('setup_quick');
        expect(buttonJson.components[1].custom_id).toBe('setup_auto');
        expect(buttonJson.components[2].custom_id).toBe('setup_wizard_open');
        expect(buttonJson.components[3].custom_id).toBe('guide_post_panel');
        // Discord allows at most five buttons in a row
        expect(buttonJson.components.length).toBeLessThanOrEqual(5);
        const dmJson = buildSetupButtonRow('123').toJSON();
        expect(dmJson.components.map(c => c.custom_id).filter(Boolean)).toEqual(['setup_quick_123', 'setup_auto_123']);
        expect(wizardJson).toHaveLength(2);
        expect(wizardJson[0].components[0].custom_id).toBe('setup_wizard_voice');
        expect(wizardJson[1].components[0].custom_id).toBe('setup_wizard_report');
    });

    test('only shows remaining setup selectors after partial configuration', () => {
        const rows = buildSetupWizardRowsFor({
            voice_tracking_enabled: 1,
            report_enabled: 0,
        }).map(row => row.toJSON());

        expect(rows).toHaveLength(1);
        expect(rows[0].components[0].custom_id).toBe('setup_wizard_report');
    });

    test('shows guide links when setup selectors are complete', () => {
        const rows = buildSetupWizardRowsFor({
            voice_tracking_enabled: 1,
            report_enabled: 1,
        }).map(row => row.toJSON());

        expect(rows).toHaveLength(1);
        expect(rows[0].components[0].custom_id).toBe('guide_post_panel');
        expect(rows[0].components[1].url).toContain('/tutorials/getting-started');
    });

    test('builds a setup progress embed with the next action', () => {
        const embed = buildSetupProgressEmbed({
            voice_tracking_enabled: 1,
            report_enabled: 0,
            goal_enabled: 0,
        }).toJSON();

        expect(embed.title).toBe('Quick Server Setup');
        expect(embed.fields[0].name).toContain('1/3');
        expect(embed.fields[1].name).toContain('weekly progress reports');
        expect(embed.fields[2].value).toContain('Configure Server');
    });

    test('returns specific recommendations for partial setup states', () => {
        expect(getSetupRecommendation({
            voice_tracking_enabled: 0,
            report_enabled: 1,
            goal_enabled: 0,
        }).title).toBe('Add automatic voice tracking');
        expect(getSetupRecommendation({
            voice_tracking_enabled: 1,
            report_enabled: 0,
            goal_enabled: 0,
        }).title).toBe('Add weekly progress reports');
    });

    test('rejects a report channel when the bot lacks permissions', async () => {
        const reply = jest.fn().mockResolvedValue(undefined);
        const interaction = {
            guildId: 'guild_setup',
            guild: {
                name: 'Setup Guild',
                members: { me: {} },
            },
            reply,
        };
        const channel = {
            type: ChannelType.GuildText,
            permissionsFor: jest.fn(() => ({
                has: jest.fn((permissions) =>
                    !permissions.includes(PermissionFlagsBits.SendMessages)
                ),
            })),
            toString: () => '<#channel>',
        };

        await configureReportChannel(interaction, channel);

        expect(reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
        expect(reply.mock.calls[0][0].embeds[0].data.title).toContain('Permission');
    });

    test('updates the wizard message after selecting a report channel', async () => {
        const update = jest.fn().mockResolvedValue(undefined);
        const interaction = {
            guildId: 'guild_setup_update',
            guild: {
                name: 'Setup Guild',
                members: { me: {} },
            },
            update,
        };
        const channel = {
            id: 'report_channel',
            type: ChannelType.GuildText,
            permissionsFor: jest.fn(() => ({
                has: jest.fn(() => true),
            })),
            toString: () => '<#report_channel>',
        };

        await configureReportChannel(interaction, channel);

        expect(update).toHaveBeenCalledTimes(1);
        const payload = update.mock.calls[0][0];
        expect(payload.embeds[0].data.title).toBe('Weekly Reports Enabled');
        expect(payload.components[0].toJSON().components[0].custom_id).toBe('setup_wizard_voice');
    });

    test('sends the private nudge once and records it only after delivery', async () => {
        const guild = {
            id: 'guild_nudge',
            name: 'Nudge Guild',
            memberCount: 10,
            ownerId: 'owner',
        };
        recordGuildJoin(guild);
        getOrCreateUser('admin_user');
        const insert = db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES ('admin_user', ?, 25, 'Focus', datetime('now'), 1)
        `);
        insert.run(guild.id);
        insert.run(guild.id);
        insert.run(guild.id);

        const followUp = jest.fn().mockResolvedValue({ id: 'nudge_message' });
        const interaction = {
            guildId: guild.id,
            commandName: 'study',
            memberPermissions: {
                has: jest.fn(permission => permission === PermissionFlagsBits.ManageGuild),
            },
            followUp,
        };

        expect(await maybeSendSetupNudge(interaction)).toBe(true);
        expect(await maybeSendSetupNudge(interaction)).toBe(false);
        expect(followUp).toHaveBeenCalledTimes(1);
        expect(followUp.mock.calls[0][0].flags).toBe(64);
    });

    test('nudges admins about the missing piece when setup is partial', async () => {
        const guild = {
            id: 'guild_partial_nudge',
            name: 'Partial Guild',
            memberCount: 10,
            ownerId: 'owner',
        };
        recordGuildJoin(guild);
        getOrCreateUser('partial_admin');
        db.prepare('UPDATE guild_settings SET voice_tracking_enabled = 1 WHERE guild_id = ?')
            .run(guild.id);
        const insert = db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES ('partial_admin', ?, 25, 'Focus', datetime('now'), 1)
        `);
        insert.run(guild.id);
        insert.run(guild.id);
        insert.run(guild.id);

        const followUp = jest.fn().mockResolvedValue({ id: 'partial_nudge' });
        const interaction = {
            guildId: guild.id,
            commandName: 'study',
            memberPermissions: {
                has: jest.fn(permission => permission === PermissionFlagsBits.ManageGuild),
            },
            followUp,
        };

        expect(await maybeSendSetupNudge(interaction)).toBe(true);
        expect(followUp.mock.calls[0][0].embeds[0].data.title).toBe('Add weekly progress reports');
    });

    test('scheduled nudge candidates reach active-but-unconfigured servers', () => {
        const activeGuild = { id: 'guild_nudge_candidate', name: 'Active Guild', memberCount: 20, ownerId: 'owner' };
        recordGuildJoin(activeGuild);
        getOrCreateUser('candidate_user');
        const insert = db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES ('candidate_user', ?, 25, 'Focus', datetime('now'), 1)
        `);
        insert.run(activeGuild.id);
        insert.run(activeGuild.id);
        insert.run(activeGuild.id);

        const candidates = getSetupNudgeCandidates();
        expect(candidates.map(candidate => candidate.guild_id)).toContain('guild_nudge_candidate');

        markSetupNudgeSent('guild_nudge_candidate');
        expect(getSetupNudgeCandidates().map(candidate => candidate.guild_id)).not.toContain('guild_nudge_candidate');

        const embed = buildSetupNudgeEmbed(candidates[0]).toJSON();
        expect(embed.title).toBeTruthy();
        expect(embed.description).toContain('3 focus sessions');
    });
});
