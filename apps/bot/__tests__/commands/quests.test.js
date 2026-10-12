const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_quests_test_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const { db, initDatabase, getOrCreateUser } = require('../../utils/database');
const questsCommand = require('../../commands/quests');

beforeAll(() => {
    initDatabase();
});

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM quest_claims;
        DELETE FROM todos;
        DELETE FROM harvested_items;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM study_sessions;
        DELETE FROM users;
    `);
});

describe('/quests command', () => {
    test('shows daily quests', async () => {
        getOrCreateUser('quest_user_view');

        const interaction = buildInteraction('daily', null, 'quest_user_view');
        await questsCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) })
        );
    });

    test('claims completed daily quests only once', async () => {
        const userId = 'quest_user_claim';
        seedCompletedDailyActivity(userId);

        const first = buildInteraction('claim', null, userId);
        await questsCommand.execute(first);

        const claims = db.prepare('SELECT COUNT(*) as count FROM quest_claims WHERE user_id = ?').get(userId).count;
        const rewarded = getOrCreateUser(userId);

        expect(claims).toBe(3);
        expect(rewarded.water).toBeGreaterThan(0);
        expect(rewarded.xp).toBeGreaterThan(0);

        const waterAfterFirstClaim = rewarded.water;
        const second = buildInteraction('claim', null, userId);
        await questsCommand.execute(second);

        const afterSecond = getOrCreateUser(userId);
        expect(afterSecond.water).toBe(waterAfterFirstClaim);
        expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
    });
});

function buildInteraction(subcommand, quest, userId) {
    return {
        user: { id: userId, username: 'QuestUser' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getString: jest.fn(() => quest),
        },
        reply: jest.fn().mockResolvedValue({}),
    };
}

function seedCompletedDailyActivity(userId) {
    const today = new Date().toISOString().split('T')[0];
    getOrCreateUser(userId);
    db.prepare('UPDATE users SET last_daily_date = ? WHERE discord_id = ?').run(today, userId);

    db.prepare(`
        INSERT INTO study_sessions (user_id, guild_id, channel_id, duration, title, started_at, completed)
        VALUES (?, 'guild', 'channel', 25, 'Quest Study 1', datetime('now'), 1)
    `).run(userId);
    db.prepare(`
        INSERT INTO study_sessions (user_id, guild_id, channel_id, duration, title, started_at, completed)
        VALUES (?, 'guild', 'channel', 25, 'Quest Study 2', datetime('now'), 1)
    `).run(userId);

    for (let i = 1; i <= 3; i++) {
        db.prepare(`
            INSERT INTO todos (user_id, content, completed, completed_at)
            VALUES (?, ?, 1, datetime('now'))
        `).run(userId, `Quest todo ${i}`);
    }

    db.prepare('INSERT INTO harvested_items (user_id, plant_type) VALUES (?, ?)').run(userId, 'carrot');

    const teamId = db.prepare(`
        INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status)
        VALUES ('guild', 'channel', ?, 25, datetime('now'), 'completed')
    `).run(userId).lastInsertRowid;
    db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(teamId, userId);
}
