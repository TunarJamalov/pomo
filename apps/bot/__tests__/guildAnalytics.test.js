const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_guild_analytics_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    recordGuildJoin,
    recordGuildLeave,
    syncGuildInstallations,
    getGuildAnalytics,
    recordCommandUsage,
    recordOnboardingEvent,
    getOnboardingAnalytics,
    getActivationAnalytics,
    getSetupFunnelAnalytics,
    getTopCommands,
    getSetupReminderCandidates,
    markSetupReminderAttempt,
    getSetupNudgeEligibility,
    markSetupNudgeSent,
    getOrCreateGuildSettings,
    updateGuildSettings,
    getOrCreateUser,
} = require('../utils/database');

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
        DELETE FROM command_usage;
        DELETE FROM onboarding_events;
        DELETE FROM study_sessions;
        DELETE FROM guild_installations;
        DELETE FROM guild_settings;
        DELETE FROM users;
    `);
});

describe('guild installation analytics', () => {
    const guildA = { id: 'guild_a', name: 'Guild A', memberCount: 120, ownerId: 'owner_a' };
    const guildB = { id: 'guild_b', name: 'Guild B', memberCount: 80, ownerId: 'owner_b' };

    test('records joins and leaves', () => {
        recordGuildJoin(guildA);
        recordGuildJoin(guildB);
        recordGuildLeave(guildB);

        const analytics = getGuildAnalytics();
        expect(analytics.active_guilds).toBe(1);
        expect(analytics.reachable_members).toBe(120);
        expect(analytics.lifetime_guilds).toBe(2);
        expect(analytics.joins_7d).toBe(2);
        expect(analytics.leaves_7d).toBe(1);
    });

    test('startup sync marks missing guilds inactive without duplicating rows', () => {
        recordGuildJoin(guildA);
        recordGuildJoin(guildB);
        syncGuildInstallations([guildA]);

        const guilds = db.prepare('SELECT guild_id, active FROM guild_installations ORDER BY guild_id').all();
        expect(guilds).toEqual([
            { guild_id: 'guild_a', active: 1 },
            { guild_id: 'guild_b', active: 0 },
        ]);
    });

    test('initial startup snapshot is not counted as a new join', () => {
        syncGuildInstallations([guildA, guildB]);

        const analytics = getGuildAnalytics();
        expect(analytics.active_guilds).toBe(2);
        expect(analytics.joins_7d).toBe(0);
    });

    test('tracks configured servers and command usage without command arguments', () => {
        recordGuildJoin(guildA);
        recordGuildJoin(guildB);
        getOrCreateGuildSettings(guildA.id);
        updateGuildSettings(guildA.id, { voice_tracking_enabled: 1 });

        recordCommandUsage(guildA.id, 'user_1', 'study', null);
        recordCommandUsage(guildA.id, 'user_2', 'goal', 'status');
        recordCommandUsage(guildA.id, 'user_1', 'study', null);

        const activation = getActivationAnalytics();
        const top = getTopCommands(7, 2);

        expect(activation.configured_guilds).toBe(1);
        expect(activation.voice_guilds).toBe(1);
        expect(activation.command_guilds_7d).toBe(1);
        expect(activation.commands_7d).toBe(3);
        expect(top[0]).toMatchObject({ command_name: 'study', uses: 2 });
        expect(db.prepare('PRAGMA table_info(command_usage)').all().map(row => row.name))
            .not.toContain('arguments');
    });

    test('tracks guide panel posts and topic clicks', () => {
        recordGuildJoin(guildA);
        recordGuildJoin(guildB);

        recordOnboardingEvent(guildA.id, 'manager_1', 'panel_posted');
        recordOnboardingEvent(guildA.id, 'user_1', 'panel_click', 'quickstart');
        recordOnboardingEvent(guildA.id, 'user_2', 'panel_click', 'voice');
        recordOnboardingEvent(guildB.id, 'user_3', 'panel_click', 'voice');

        const analytics = getOnboardingAnalytics(7, 5);

        expect(analytics.panels_posted).toBe(1);
        expect(analytics.panel_clicks).toBe(3);
        expect(analytics.guilds).toBe(2);
        expect(analytics.users).toBe(4);
        expect(analytics.top_topics[0]).toMatchObject({
            topic: 'voice',
            clicks: 2,
        });
    });

    test('breaks active servers into setup funnel stages', () => {
        const guildC = { id: 'guild_c', name: 'Guild C', memberCount: 50, ownerId: 'owner_c' };
        recordGuildJoin(guildA);
        recordGuildJoin(guildB);
        recordGuildJoin(guildC);

        getOrCreateGuildSettings(guildB.id);
        updateGuildSettings(guildB.id, { voice_tracking_enabled: 1 });
        getOrCreateGuildSettings(guildC.id);
        updateGuildSettings(guildC.id, {
            voice_tracking_enabled: 1,
            report_enabled: 1,
            goal_enabled: 1,
        });

        expect(getSetupFunnelAnalytics()).toMatchObject({
            active_guilds: 3,
            setup_none: 1,
            setup_partial: 1,
            setup_complete: 1,
            voice_enabled: 2,
            report_enabled: 1,
            goal_enabled: 1,
        });
    });

    test('removes command analytics older than 90 days during initialization', () => {
        db.prepare(`
            INSERT INTO command_usage (guild_id, user_id, command_name, used_at)
            VALUES (?, ?, ?, datetime('now', '-91 days'))
        `).run(guildA.id, 'user_1', 'study');

        initDatabase();

        expect(db.prepare('SELECT COUNT(*) as count FROM command_usage').get().count).toBe(0);
    });

    test('selects only stale unconfigured servers for a one-time setup reminder', () => {
        recordGuildJoin(guildA);
        db.prepare(`
            UPDATE guild_installations
            SET joined_at = datetime('now', '-15 days')
            WHERE guild_id = ?
        `).run(guildA.id);

        expect(getSetupReminderCandidates(5).map(row => row.guild_id)).toEqual([guildA.id]);

        markSetupReminderAttempt(guildA.id, true);
        expect(getSetupReminderCandidates(5)).toHaveLength(0);
    });

    test('selects stale partially configured servers for setup completion reminders', () => {
        recordGuildJoin(guildA);
        getOrCreateGuildSettings(guildA.id);
        updateGuildSettings(guildA.id, { voice_tracking_enabled: 1 });
        db.prepare(`
            UPDATE guild_installations
            SET joined_at = datetime('now', '-15 days')
            WHERE guild_id = ?
        `).run(guildA.id);

        expect(getSetupReminderCandidates(5)).toEqual([
            expect.objectContaining({
                guild_id: guildA.id,
                voice_tracking_enabled: 1,
                report_enabled: 0,
            }),
        ]);
    });

    test('offers one admin nudge after three recent focus sessions', () => {
        recordGuildJoin(guildA);
        getOrCreateUser('nudge_user');
        const insert = db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES (?, ?, 25, 'Focus', datetime('now', '-1 day'), 1)
        `);
        insert.run('nudge_user', guildA.id);
        insert.run('nudge_user', guildA.id);

        expect(getSetupNudgeEligibility(guildA.id, 3)).toBeNull();

        insert.run('nudge_user', guildA.id);
        expect(getSetupNudgeEligibility(guildA.id, 3)).toMatchObject({
            guild_id: guildA.id,
            completed_sessions: 3,
        });

        markSetupNudgeSent(guildA.id);
        expect(getSetupNudgeEligibility(guildA.id, 3)).toBeNull();
        expect(getActivationAnalytics()).toMatchObject({
            setup_nudges_sent: 1,
            setup_nudge_conversions: 0,
        });

        updateGuildSettings(guildA.id, { report_enabled: 1 });
        expect(getActivationAnalytics().setup_nudge_conversions).toBe(1);
    });

    test('nudges a server that still has partial setup remaining', () => {
        recordGuildJoin(guildA);
        getOrCreateUser('configured_user');
        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES
                ('configured_user', ?, 25, 'One', datetime('now', '-1 day'), 1),
                ('configured_user', ?, 25, 'Two', datetime('now', '-1 day'), 1),
                ('configured_user', ?, 25, 'Three', datetime('now', '-1 day'), 1)
        `).run(guildA.id, guildA.id, guildA.id);
        getOrCreateGuildSettings(guildA.id);
        updateGuildSettings(guildA.id, { report_enabled: 1 });

        expect(getSetupNudgeEligibility(guildA.id, 3)).toMatchObject({
            guild_id: guildA.id,
            report_enabled: 1,
            voice_tracking_enabled: 0,
        });
    });

    test('does not nudge a server after setup is complete', () => {
        recordGuildJoin(guildA);
        getOrCreateUser('complete_user');
        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES
                ('complete_user', ?, 25, 'One', datetime('now', '-1 day'), 1),
                ('complete_user', ?, 25, 'Two', datetime('now', '-1 day'), 1),
                ('complete_user', ?, 25, 'Three', datetime('now', '-1 day'), 1)
        `).run(guildA.id, guildA.id, guildA.id);
        getOrCreateGuildSettings(guildA.id);
        updateGuildSettings(guildA.id, {
            voice_tracking_enabled: 1,
            report_enabled: 1,
            goal_enabled: 1,
        });

        expect(getSetupNudgeEligibility(guildA.id, 3)).toBeNull();
    });
});
